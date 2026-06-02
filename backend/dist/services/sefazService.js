import https from "https";
import { createGunzip } from "zlib";
import { Readable } from "stream";
import { createSecureContext } from "tls";
import forge from "node-forge";
import { XMLParser } from "fast-xml-parser";
import { executeOracle, isOracleEnabled } from "../db/oracle.js";

const SEFAZ_NFE_URL = "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx";
const C_UF_AUTOR = "13"; // AM - Amazonas (UF do certificado: Rodrigues Colchões, Manaus)

const certCache = new Map(); // cnpj -> { certPem, keyPem, expiresAt }

export async function carregarCertificado(cnpj) {
    const cnpjLimpo = cnpj.replace(/\D/g, "");
    const cached = certCache.get(cnpjLimpo);
    if (cached && cached.expiresAt > Date.now()) return cached;

    if (!isOracleEnabled()) throw new Error("Oracle não disponível para carregar certificado");

    const resultCert = await executeOracle(
        `SELECT CERTIFICADOA1, SENHACERTIFICADO,
                RAWTOHEX(UTL_RAW.CAST_TO_RAW(SENHACERTIFICADO)) AS SENHA_HEX
         FROM PCFILIAL
         WHERE REGEXP_REPLACE(CGC, '[^0-9]', '') = :cnpj
           AND CERTIFICADOA1 IS NOT NULL
           AND ROWNUM = 1`,
        { cnpj: cnpjLimpo }
    );
    const rows = resultCert.rows ?? [];

    if (!rows || rows.length === 0) throw new Error(`Certificado não encontrado para CNPJ ${cnpjLimpo}`);

    const row = rows[0];

    // Log raw Oracle bytes of password (before any JS encoding conversion)
    const senhaHexOracle = row.SENHA_HEX || "";
    console.log(`[sefaz] SENHACERTIFICADO cnpj=${cnpjLimpo} RAWTOHEX=${senhaHexOracle.toUpperCase().slice(0,40)}`);

    // Verificar tipo do campo CERTIFICADOA1
    const certField = row.CERTIFICADOA1;
    const certIsString = typeof certField === 'string';
    const certIsBuffer = Buffer.isBuffer(certField);
    const certIsLob = certField && typeof certField === 'object' && typeof certField.getData === 'function';
    console.log(`[sefaz] CERTIFICADOA1 cnpj=${cnpjLimpo} type=${typeof certField} isString=${certIsString} isBuffer=${certIsBuffer} isLob=${certIsLob}`);

    let pfxBuffer;
    if (certIsString) {
        // CLOB retornado como string (fetchAsString) — pode ser base64 ou bytes mal-codificados
        // Tenta base64 primeiro
        const b64clean = certField.replace(/\s/g, '');
        if (/^[A-Za-z0-9+/=]+$/.test(b64clean.slice(0, 40))) {
            pfxBuffer = Buffer.from(b64clean, 'base64');
            console.log(`[sefaz] CERTIFICADOA1 lido como BASE64 string, bufLen=${pfxBuffer.length}`);
        } else {
            pfxBuffer = Buffer.from(certField, 'latin1');
            console.log(`[sefaz] CERTIFICADOA1 lido como CLOB string latin1, bufLen=${pfxBuffer.length}`);
        }
    } else if (certIsBuffer) {
        pfxBuffer = certField;
        console.log(`[sefaz] CERTIFICADOA1 é Buffer direto, bufLen=${pfxBuffer.length}`);
    } else {
        pfxBuffer = await streamToBuffer(await certField.getData());
        console.log(`[sefaz] CERTIFICADOA1 lido como LOB stream, bufLen=${pfxBuffer.length}`);
    }
    console.log(`[sefaz] pfxBuffer primeiros8bytes=${pfxBuffer.slice(0,8).toString('hex')}`);

    // Handle SENHACERTIFICADO as potential LOB
    let senhaRaw = row.SENHACERTIFICADO;
    if (senhaRaw && typeof senhaRaw === 'object' && typeof senhaRaw.getData === 'function') {
        const senhaBuf = await streamToBuffer(await senhaRaw.getData());
        senhaRaw = senhaBuf;
    }

    const { certPem, keyPem } = _parsearCertificadoComMultiplosSenhas(pfxBuffer, senhaHexOracle, senhaRaw, cnpjLimpo);

    const entry = { certPem, keyPem, expiresAt: Date.now() + 60 * 60 * 1000 };
    certCache.set(cnpjLimpo, entry);
    return entry;
}

function decodeWinthorPassword(raw) {
    // WinThor stores VARCHAR2 as UTF-16 LE with BOM (ÿþ prefix)
    // When read by node-oracledb it may come as a string with the BOM characters preserved
    if (typeof raw === "string") {
        // Strip UTF-16 BOM bytes if present as literal chars
        const stripped = raw.replace(/^﻿/, "").replace(/^ÿþ/, "");
        // Remove null bytes that appear between chars in UTF-16 LE
        return stripped.replace(/\x00/g, "");
    }
    if (Buffer.isBuffer(raw)) {
        // Detect UTF-16 LE BOM
        if (raw[0] === 0xff && raw[1] === 0xfe) {
            return raw.slice(2).toString("utf16le").replace(/\x00/g, "");
        }
        return raw.toString("utf8").replace(/\x00/g, "");
    }
    return String(raw);
}

function _parsearCertificadoComMultiplosSenhas(pfxBuffer, senhaHexOracle, senhaRaw, cnpjLimpo) {
    // Gera candidatas a partir dos bytes Oracle brutos (RAWTOHEX)
    const rawBytes = senhaHexOracle ? Buffer.from(senhaHexOracle, 'hex') : Buffer.alloc(0);

    // Candidatas em ordem de probabilidade
    const candidatas = [];

    // 0. Senha confirmada pelo usuário (Rodrigues1@) — primeiro a tentar
    candidatas.push({ nome: 'Rodrigues1@', senha: 'Rodrigues1@' });
    candidatas.push({ nome: 'rodrigues1@', senha: 'rodrigues1@' });

    // 1. Bytes Oracle diretos como Latin-1 (sem BOM, sem nulls)
    const rawLatin1NoNull = rawBytes.filter(b => b !== 0x00 && b !== 0xFF && b !== 0xFE).toString('latin1');
    candidatas.push({ nome: 'rawOracle-latin1-semBOM-semNull', senha: rawLatin1NoNull });

    // 2. Bytes Oracle como Latin-1 sem nulls (com possíveis BOM)
    const rawLatin1 = rawBytes.filter(b => b !== 0x00).toString('latin1');
    candidatas.push({ nome: 'rawOracle-latin1-semNull', senha: rawLatin1 });

    // 3. Se começa com FF FE, decodificar como UTF-16 LE
    if (rawBytes[0] === 0xFF && rawBytes[1] === 0xFE) {
        const utf16leStr = rawBytes.slice(2).toString('utf16le').replace(/\x00/g, '');
        candidatas.push({ nome: 'rawOracle-utf16le-semBOM-semNull', senha: utf16leStr });
    }

    // 4. JS string decodificada pelo método atual (stripa ÿþ + nulls)
    const senhaDecodificada = decodeWinthorPassword(senhaRaw || "");
    candidatas.push({ nome: 'decodeWinthor', senha: senhaDecodificada });

    // 5. JS string sem nenhum processamento
    candidatas.push({ nome: 'raw-as-is', senha: String(senhaRaw || "") });

    // 6. Sem senha (vazia)
    candidatas.push({ nome: 'empty', senha: '' });

    // 7. Bytes Oracle como UTF-8
    try { candidatas.push({ nome: 'rawOracle-utf8', senha: rawBytes.toString('utf8').replace(/\x00/g, '') }); } catch {}

    // 8. Apenas letras/números dos bytes Oracle
    const rawAlphaNum = rawBytes.filter(b => (b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x5A) || (b >= 0x61 && b <= 0x7A)).toString('latin1');
    candidatas.push({ nome: 'rawOracle-alphanumOnly', senha: rawAlphaNum });

    for (const { nome, senha } of candidatas) {
        try {
            const result = parsearCertificado(pfxBuffer, senha);
            console.log(`[sefaz] cnpj=${cnpjLimpo} SENHA OK via "${nome}" len=${senha.length}`);
            return result;
        } catch (e) {
            console.log(`[sefaz] cnpj=${cnpjLimpo} senha "${nome}" len=${senha.length} FALHOU: ${e.message?.slice(0,60)}`);
        }
    }

    throw new Error(`Nenhuma das ${candidatas.length} interpretações de senha funcionou para o CNPJ ${cnpjLimpo}. RAWTOHEX=${senhaHexOracle.slice(0,30)}`);
}

function parsearCertificado(pfxBuffer, senha) {
    const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, senha);

    const allBags = p12.safeContents.flatMap((sc) => sc.safeBags);
    const keyBags = allBags.filter(b => b.type === forge.pki.oids.pkcs8ShroudedKeyBag || b.type === forge.pki.oids.keyBag);
    const certBags = allBags.filter(b => b.type === forge.pki.oids.certBag);

    if (keyBags.length === 0 || certBags.length === 0) {
        throw new Error("Certificado A1 incompleto: sem chave ou certificado nos bags");
    }

    // Extrair todos os PEMs
    const keyPem = forge.pki.privateKeyToPem(keyBags[0].key);
    const certPems = certBags.map(cb => ({ pem: forge.pki.certificateToPem(cb.cert), subj: cb.cert.subject?.attributes?.[0]?.value || '' }));

    // Usar createSecureContext para encontrar o cert que bate com a chave privada
    // (mesmo mecanismo usado na chamada HTTPS para o SEFAZ)
    for (const { pem, subj } of certPems) {
        try {
            createSecureContext({ cert: pem, key: keyPem });
            console.log(`[sefaz] parsearCertificado: cert OK subj="${subj.slice(0,40)}"`);
            return { certPem: pem, keyPem };
        } catch (e) {
            if (e.message?.includes('key values mismatch') || e.message?.includes('no start line') || e.message?.includes('PEM_read_bio')) {
                continue; // cert não bate com a chave, tentar o próximo
            }
            throw e; // erro inesperado — repassar
        }
    }

    throw new Error(`Certificado A1: nenhum dos ${certPems.length} certificados bate com a chave privada`);
}

function buildXmlNFe(cnpj, ultNSU) {
    const cnpjLimpo = cnpj.replace(/\D/g, "").padStart(14, "0");
    const nsuFormatado = String(ultNSU || 0).padStart(15, "0");
    return `<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><tpAmb>1</tpAmb><cUFAutor>${C_UF_AUTOR}</cUFAutor><CNPJ>${cnpjLimpo}</CNPJ><distNSU><ultNSU>${nsuFormatado}</ultNSU></distNSU></distDFeInt>`;
}

function buildSoapEnvelope(xmlDistDFeInt) {
    // Autenticação via mTLS (cert/key no TLS) — sem assinatura no corpo XML
    return `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"><nfeDadosMsg>${xmlDistDFeInt}</nfeDadosMsg></nfeDistDFeInteresse></soap12:Body></soap12:Envelope>`;
}

async function chamarSefaz(soapBody, certPem, keyPem) {
    const url = new URL(SEFAZ_NFE_URL);
    const bodyBuf = Buffer.from(soapBody, "utf8");

    return new Promise((resolve, reject) => {
        const req = https.request(
            {
                hostname: url.hostname,
                path: url.pathname,
                method: "POST",
                headers: {
                    "Content-Type": "application/soap+xml; charset=utf-8",
                    "Content-Length": bodyBuf.length,
                    SOAPAction: '"http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse"',
                },
                cert: certPem,
                key: keyPem,
                timeout: 30000,
            },
            (res) => {
                const chunks = [];
                res.on("data", (c) => chunks.push(c));
                res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
                res.on("error", reject);
            }
        );
        req.on("error", reject);
        req.on("timeout", () => { req.destroy(); reject(new Error("SEFAZ timeout após 30s")); });
        req.write(bodyBuf);
        req.end();
    });
}


async function gunzipBase64(b64) {
    const compressed = Buffer.from(b64, "base64");
    return new Promise((resolve, reject) => {
        const gunzip = createGunzip();
        const chunks = [];
        const readable = Readable.from(compressed);
        readable.pipe(gunzip);
        gunzip.on("data", (c) => chunks.push(c));
        gunzip.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        gunzip.on("error", reject);
    });
}

// parseTagValue: false evita que chNFe (44 dígitos) perca precisão ao ser convertido para Number
const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: false, parseAttributeValue: false });

async function parseResposta(responseXml) {
    const parsed = xmlParser.parse(responseXml);

    // Navigate SOAP envelope — different parsers may nest differently
    const envelope =
        parsed["soap:Envelope"] ||
        parsed["soap12:Envelope"] ||
        parsed["Envelope"] ||
        {};
    const body =
        envelope["soap:Body"] ||
        envelope["soap12:Body"] ||
        envelope["Body"] ||
        {};
    const result =
        body["nfeDistDFeInteresseResponse"]?.["nfeDistDFeInteresseResult"] ||
        body["nfeDistDFeInteresseResult"] ||
        {};

    // The result element is text (escaped XML) or an object
    let retDistDFeInt;
    if (typeof result === "string") {
        retDistDFeInt = xmlParser.parse(result)["retDistDFeInt"];
    } else {
        retDistDFeInt = result["retDistDFeInt"] || result;
    }

    if (!retDistDFeInt) throw new Error("Resposta SEFAZ sem retDistDFeInt");

    const cStat = String(retDistDFeInt["cStat"] || "");
    const xMotivo = String(retDistDFeInt["xMotivo"] || "");
    const dhResp = String(retDistDFeInt["dhResp"] || "");
    const ultNSU = String(retDistDFeInt["ultNSU"] || "0").replace(/^0+/, "") || "0";
    const maxNSU = String(retDistDFeInt["maxNSU"] || "0").replace(/^0+/, "") || "0";

    // 137=sem docs novos, 138=docs encontrados, 656=rate limit (consumo indevido)
    const ok = cStat === "137" || cStat === "138";
    const rateLimited = cStat === "656";

    const loteDistDFeInt = retDistDFeInt["loteDistDFeInt"];
    const docZipArray = [];

    if (loteDistDFeInt) {
        const docZips = loteDistDFeInt["docZip"];
        const arr = Array.isArray(docZips) ? docZips : docZips ? [docZips] : [];
        for (const dz of arr) {
            const b64 = typeof dz === "string" ? dz : dz["#text"] || dz;
            const schema = typeof dz === "object" ? dz["@_schema"] : "";
            try {
                const xmlDoc = await gunzipBase64(b64);
                docZipArray.push({ schema, xml: xmlDoc });
            } catch {
                // Skip malformed compressed doc
            }
        }
    }

    return { ok, rateLimited, cStat, xMotivo, dhResp, ultNSU: Number(ultNSU), maxNSU: Number(maxNSU), docs: docZipArray };
}

function extrairDadosNFe(xml) {
    try {
        const p = xmlParser.parse(xml);

        // resNFe (resumo de NF-e recebida)
        if (p["resNFe"]) {
            const r = p["resNFe"];
            return {
                tipo: "resNFe",
                chNFe: String(r["chNFe"] || "").replace(/\D/g, ""),
                CNPJ: String(r["CNPJ"] || r["CPF"] || "").replace(/\D/g, ""),
                xNome: String(r["xNome"] || ""),
                dhEmi: String(r["dhEmi"] || ""),
                vNF: parseFloat(r["vNF"] || "0") || 0,
                nNF: String(r["nNF"] || ""),
                serie: String(r["serie"] || ""),
                cSitNFe: String(r["cSitNFe"] || ""),
                digVal: String(r["digVal"] || ""),
                dhRecbto: String(r["dhRecbto"] || ""),
                nProt: String(r["nProt"] || ""),
                mod: String(r["mod"] || "55"),
            };
        }

        // procNFe (NF-e completa autorizada)
        if (p["nfeProc"] || p["NFe"]) {
            const infNFe = p["nfeProc"]?.["NFe"]?.["infNFe"] || p["NFe"]?.["infNFe"];
            const infProt = p["nfeProc"]?.["protNFe"]?.["infProt"];
            if (!infNFe) return null;
            const ide = infNFe["ide"] || {};
            const emit = infNFe["emit"] || {};
            const total = infNFe["total"]?.["ICMSTot"] || {};
            return {
                tipo: "procNFe",
                chNFe: String(infProt?.["chNFe"] || "").replace(/\D/g, ""),
                CNPJ: String(emit["CNPJ"] || emit["CPF"] || "").replace(/\D/g, ""),
                xNome: String(emit["xNome"] || ""),
                dhEmi: String(ide["dhEmi"] || ""),
                vNF: parseFloat(total["vNF"] || "0") || 0,
                nNF: String(ide["nNF"] || ""),
                serie: String(ide["serie"] || ""),
                cSitNFe: String(infProt?.["cStat"] || "100"),
                digVal: String(infNFe["infNFeSupl"]?.["digVal"] || ""),
                dhRecbto: String(infProt?.["dhRecbto"] || ""),
                nProt: String(infProt?.["nProt"] || ""),
                mod: String(ide["mod"] || "55"),
            };
        }

        // resEvento / regEvento (cancelamento, carta-de-correção, etc.)
        const evtContainer = p["resEvento"] || p["procEventoNFe"]?.["evento"] || p["regEvento"];
        if (evtContainer) {
            const inf = evtContainer["infEvento"] || evtContainer;
            return {
                tipo: "evento",
                chNFe: String(inf["chNFe"] || "").replace(/\D/g, ""),
                CNPJ: String(inf["CNPJ"] || inf["CPF"] || "").replace(/\D/g, ""),
                xNome: String(inf["xEvento"] || ""),
                dhEmi: String(inf["dhEvento"] || ""),
                vNF: 0,
                nNF: "",
                serie: "",
                cSitNFe: String(inf["cSitEvento"] || ""),
                digVal: "",
                dhRecbto: String(inf["dhRegEvento"] || ""),
                nProt: String(inf["nProt"] || ""),
                mod: "55",
                tpEvento: String(inf["tpEvento"] || ""),
                xEvento: String(inf["xEvento"] || ""),
            };
        }

        return null;
    } catch {
        return null;
    }
}

async function consultarLote(cnpj, ultNSU, certPem, keyPem) {
    const xmlReq = buildXmlNFe(cnpj, ultNSU);
    const soap = buildSoapEnvelope(xmlReq);
    const responseXml = await chamarSefaz(soap, certPem, keyPem);
    return parseResposta(responseXml);
}

/**
 * Consulta SEFAZ iterativamente para um CNPJ.
 * @param {string} cnpj
 * @param {number} ultNSUInicial - NSU inicial (último NSU já baixado)
 * @param {number} maxLotes - máximo de lotes a baixar por chamada (default 20)
 * @param {function} onLote - callback chamado com cada lote { lote, docs, ultNSU, maxNSU }
 * @returns {{ totalDocs: number, ultNSUFinal: number, maxNSU: number, lotes: number }}
 */
export async function consultarNFeSefazCompleto(cnpj, ultNSUInicial = 0, maxLotes = 20, onLote = null) {
    const { certPem, keyPem } = await carregarCertificado(cnpj);

    let ultNSU = ultNSUInicial;
    let totalDocs = 0;
    let lotes = 0;
    let maxNSU = 0;

    for (let i = 0; i < maxLotes; i++) {
        const resultado = await consultarLote(cnpj, ultNSU, certPem, keyPem);
        maxNSU = Math.max(maxNSU, resultado.maxNSU, resultado.ultNSU);

        if (resultado.rateLimited) {
            // 656: SEFAZ pediu para aguardar. Salva o ultNSU retornado e para.
            console.log(`[sefaz] ${cnpj} cStat=656 (rate limit). ultNSU=${resultado.ultNSU}. Parando lote.`);
            ultNSU = resultado.ultNSU || ultNSU;
            break;
        }

        if (!resultado.ok) {
            throw new Error(`SEFAZ cStat=${resultado.cStat}: ${resultado.xMotivo}`);
        }

        const docsParsed = resultado.docs.map((d) => ({ ...d, dados: extrairDadosNFe(d.xml) }));

        lotes++;
        totalDocs += resultado.docs.length;

        if (onLote) await onLote({ lote: i + 1, docs: docsParsed, ultNSU: resultado.ultNSU, maxNSU: resultado.maxNSU });

        if (resultado.docs.length === 0 || resultado.cStat === "137" || resultado.ultNSU <= ultNSU) {
            ultNSU = Math.max(resultado.ultNSU, ultNSU);
            break;
        }

        ultNSU = resultado.ultNSU;

        // Pausa entre lotes para não exceder a cota do SEFAZ
        await new Promise((r) => setTimeout(r, 1500));
    }

    return { totalDocs, ultNSUFinal: ultNSU, maxNSU, lotes };
}

/**
 * Busca o XML completo de uma NF-e específica no SEFAZ usando consChNFe.
 * Retorna o XML da nota ou null se não encontrada.
 * @param {string} cnpj - CNPJ do destinatário (interessado), sem formatação
 * @param {string} chave - Chave de acesso de 44 dígitos
 */
export async function buscarNFeChaveSefaz(cnpj, chave) {
    const cnpjLimpo = String(cnpj).replace(/\D/g, "").padStart(14, "0");
    const chaveLimpa = String(chave).replace(/\D/g, "");
    if (chaveLimpa.length !== 44) throw new Error("Chave de acesso inválida (deve ter 44 dígitos)");

    const { certPem, keyPem } = await carregarCertificado(cnpjLimpo);

    const xmlReq = `<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><tpAmb>1</tpAmb><cUFAutor>${C_UF_AUTOR}</cUFAutor><CNPJ>${cnpjLimpo}</CNPJ><consChNFe><chNFe>${chaveLimpa}</chNFe></consChNFe></distDFeInt>`;
    const soap = buildSoapEnvelope(xmlReq);
    const responseXml = await chamarSefaz(soap, certPem, keyPem);
    const { ok, docs } = await parseResposta(responseXml);
    if (!ok || docs.length === 0) return null;
    return docs[0].xml; // XML completo da NF-e (procNFe)
}

/**
 * Compara NF-es retornadas pelo SEFAZ com as que existem no WinThor (PCNFENT).
 * Retorna lista de chaves que NÃO estão no WinThor.
 */
export async function identificarNaoEntradas(chavesNFeSefaz) {
    if (!chavesNFeSefaz.length || !isOracleEnabled()) return chavesNFeSefaz;

    // Oracle IN clause — batch de 500
    const pendentes = [];
    for (let i = 0; i < chavesNFeSefaz.length; i += 500) {
        const batch = chavesNFeSefaz.slice(i, i + 500);
        const bindNames = batch.map((_, j) => `:c${i + j}`);
        const binds = Object.fromEntries(batch.map((c, j) => [`c${i + j}`, c]));
        const resultNfent = await executeOracle(
            `SELECT CHAVENFE FROM PCNFENT WHERE CHAVENFE IN (${bindNames.join(",")})`,
            binds
        );
        const existentes = new Set((resultNfent.rows ?? []).map((r) => r.CHAVENFE));
        for (const ch of batch) {
            if (!existentes.has(ch)) pendentes.push(ch);
        }
    }
    return pendentes;
}

async function streamToBuffer(stream) {
    if (Buffer.isBuffer(stream)) return stream;
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on("data", (c) => chunks.push(c));
        stream.on("end", () => resolve(Buffer.concat(chunks)));
        stream.on("error", reject);
    });
}
