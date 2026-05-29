import https from "https";
import { createGunzip } from "zlib";
import { Readable } from "stream";
import forge from "node-forge";
import { SignedXml } from "xml-crypto";
import { XMLParser } from "fast-xml-parser";
import { executeOracle, isOracleEnabled } from "../db/oracle.js";

const SEFAZ_NFE_URL = "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx";
const C_UF_AUTOR = "91"; // Ambiente Nacional

const certCache = new Map(); // cnpj -> { certPem, keyPem, expiresAt }

export async function carregarCertificado(cnpj) {
    const cnpjLimpo = cnpj.replace(/\D/g, "");
    const cached = certCache.get(cnpjLimpo);
    if (cached && cached.expiresAt > Date.now()) return cached;

    if (!isOracleEnabled()) throw new Error("Oracle não disponível para carregar certificado");

    const rows = await executeOracle(
        `SELECT CERTIFICADOA1, SENHACERTIFICADO
         FROM PCFILIAL
         WHERE REGEXP_REPLACE(CGC, '[^0-9]', '') = :cnpj
           AND CERTIFICADOA1 IS NOT NULL
           AND ROWNUM = 1`,
        { cnpj: cnpjLimpo },
        { outFormat: 4002 }
    );

    if (!rows || rows.length === 0) throw new Error(`Certificado não encontrado para CNPJ ${cnpjLimpo}`);

    const row = rows[0];
    const pfxBuffer = await streamToBuffer(await row.CERTIFICADOA1.getData());

    // Decode UTF-16 LE password (WinThor stores as UTF-16 LE with BOM)
    const senhaRaw = row.SENHACERTIFICADO || "";
    const senha = decodeWinthorPassword(senhaRaw);

    const { certPem, keyPem } = parsearCertificado(pfxBuffer, senha);

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

function parsearCertificado(pfxBuffer, senha) {
    const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfxBuffer));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, senha);

    let certPem = null;
    let keyPem = null;

    for (const bag of p12.safeContents.flatMap((sc) => sc.safeBags)) {
        if (bag.type === forge.pki.oids.certBag) {
            certPem = forge.pki.certificateToPem(bag.cert);
        }
        if (bag.type === forge.pki.oids.pkcs8ShroudedKeyBag) {
            keyPem = forge.pki.privateKeyToPem(bag.key);
        }
    }

    if (!certPem || !keyPem) throw new Error("Certificado A1 incompleto: certPem ou keyPem ausente");
    return { certPem, keyPem };
}

function buildXmlNFe(cnpj, ultNSU) {
    const cnpjLimpo = cnpj.replace(/\D/g, "").padStart(14, "0");
    const nsuFormatado = String(ultNSU || 0).padStart(15, "0");
    return `<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01"><tpAmb>1</tpAmb><cUFAutor>${C_UF_AUTOR}</cUFAutor><CNPJ>${cnpjLimpo}</CNPJ><distNSU><ultNSU>${nsuFormatado}</ultNSU></distNSU></distDFeInt>`;
}

function assinarXml(xml, certPem, keyPem) {
    const sig = new SignedXml({ privateKey: keyPem });
    sig.addReference({
        xpath: "//*[local-name(.)='distDFeInt']",
        digestAlgorithm: "http://www.w3.org/2001/04/xmlenc#sha256",
        transforms: [
            "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
            "http://www.w3.org/2001/10/xml-exc-c14n#",
        ],
    });
    sig.signingKey = keyPem;
    sig.signatureAlgorithm = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
    sig.canonicalizationAlgorithm = "http://www.w3.org/2001/10/xml-exc-c14n#";

    // Extract cert without headers/newlines for KeyInfo
    const certB64 = certPem
        .replace(/-----BEGIN CERTIFICATE-----/, "")
        .replace(/-----END CERTIFICATE-----/, "")
        .replace(/\s/g, "");

    sig.keyInfoProvider = {
        getKeyInfo: () =>
            `<X509Data><X509Certificate>${certB64}</X509Certificate></X509Data>`,
        getKey: () => Buffer.from(keyPem),
    };

    sig.computeSignature(xml, { prefix: "ds" });
    return sig.getSignedXml();
}

function buildSoapEnvelope(xmlAssinado) {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                 xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                 xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>${xmlAssinado.replace(/&/g, "&amp;")}</nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`;
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

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

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

    // Accepted codes: 137 (OK with docs), 138 (up to date)
    const ok = cStat === "137" || cStat === "138";

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

    return { ok, cStat, xMotivo, dhResp, ultNSU: Number(ultNSU), maxNSU: Number(maxNSU), docs: docZipArray };
}

function extrairDadosNFe(xml) {
    try {
        const p = xmlParser.parse(xml);
        // Could be resNFe (summary) or procNFe (full)
        const resNFe = p["resNFe"] || p["nfeProc"]?.["NFe"]?.["infNFe"] || p["NFe"]?.["infNFe"];
        if (!resNFe) return null;

        const chNFe =
            p["resNFe"]?.["chNFe"] ||
            p["nfeProc"]?.["protNFe"]?.["infProt"]?.["chNFe"] ||
            null;

        return {
            chNFe: String(chNFe || "").replace(/\D/g, ""),
            CNPJ: String(resNFe["emit"]?.["CNPJ"] || resNFe["CNPJ"] || ""),
            xNome: String(resNFe["emit"]?.["xNome"] || resNFe["xNome"] || ""),
            dhEmi: String(resNFe["dhEmi"] || resNFe["ide"]?.["dhEmi"] || ""),
            vNF: Number(resNFe["vNF"] || resNFe["total"]?.["ICMSTot"]?.["vNF"] || 0),
            nNF: String(resNFe["nNF"] || resNFe["ide"]?.["nNF"] || ""),
            serie: String(resNFe["serie"] || resNFe["ide"]?.["serie"] || ""),
            cSitNFe: String(resNFe["cSitNFe"] || ""),
            digVal: String(resNFe["digVal"] || ""),
            dhRecbto: String(resNFe["dhRecbto"] || ""),
            nProt: String(resNFe["nProt"] || ""),
        };
    } catch {
        return null;
    }
}

async function consultarLote(cnpj, ultNSU, certPem, keyPem) {
    const xmlReq = buildXmlNFe(cnpj, ultNSU);
    const xmlAssinado = assinarXml(xmlReq, certPem, keyPem);
    const soap = buildSoapEnvelope(xmlAssinado);
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
        maxNSU = resultado.maxNSU;

        if (!resultado.ok && resultado.cStat !== "137" && resultado.cStat !== "138") {
            throw new Error(`SEFAZ retornou cStat=${resultado.cStat}: ${resultado.xMotivo}`);
        }

        // Parse docs
        const docsParsed = resultado.docs.map((d) => ({
            ...d,
            dados: extrairDadosNFe(d.xml),
        }));

        lotes++;
        totalDocs += resultado.docs.length;

        if (onLote) await onLote({ lote: i + 1, docs: docsParsed, ultNSU: resultado.ultNSU, maxNSU: resultado.maxNSU });

        if (resultado.ultNSU <= ultNSU || resultado.docs.length === 0 || resultado.cStat === "138") {
            // Up to date or no more docs
            ultNSU = resultado.ultNSU || ultNSU;
            break;
        }

        ultNSU = resultado.ultNSU;

        // Rate limiting — SEFAZ rejects aggressive polling
        await new Promise((r) => setTimeout(r, 1000));
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
    const xmlAssinado = assinarXml(xmlReq, certPem, keyPem);
    const soap = buildSoapEnvelope(xmlAssinado);
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
        const rows = await executeOracle(
            `SELECT CHAVENFE FROM PCNFENT WHERE CHAVENFE IN (${bindNames.join(",")})`,
            binds,
            { outFormat: 4002 }
        );
        const existentes = new Set((rows || []).map((r) => r.CHAVENFE));
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
