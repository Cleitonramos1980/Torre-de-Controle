// XML parser for NF-e documents — regex-based, no DOM dependency

function tag(xml, t) {
    const m = xml.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)<\\/${t}>`, "i"));
    return m ? m[1].trim() : null;
}

function attr(xml, t, a) {
    const m = xml.match(new RegExp(`<${t}[^>]*\\s${a}\\s*=\\s*["']?([^"'\\s>]+)`, "i"));
    return m ? m[1].trim() : null;
}

function sec(xml, t) {
    const m = xml.match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${t}>`, "i"));
    return m ? m[0] : null;
}

function num(v) { return v ? Number(v) : 0; }
function str(v) { return (v || "").trim(); }
function dateFmt(v) {
    if (!v) return null;
    try { return new Date(v).toISOString(); } catch { return null; }
}

export function parseNFeXml(xmlRaw) {
    const xml = typeof xmlRaw === "string" ? xmlRaw : String(xmlRaw ?? "");
    if (xml.length < 100) return null;

    // Chave de acesso
    let chave = null;
    const mId = xml.match(/infNFe[^>]*Id\s*=\s*["']?NFe(\d{44})/i);
    if (mId) chave = mId[1];
    if (!chave) { const ch = tag(xml, "chNFe"); if (ch && ch.length === 44) chave = ch; }
    if (!chave || chave.length !== 44) return null;

    const ideBloco  = sec(xml, "ide")     || "";
    const emitBloco = sec(xml, "emit")    || "";
    const destBloco = sec(xml, "dest")    || "";
    const totBloco  = sec(xml, "ICMSTot") || "";
    const transpBloco = sec(xml, "transp") || "";
    const cobrBloco = sec(xml, "cobr")   || "";
    const pagBloco  = sec(xml, "pag")    || "";
    const infProt   = sec(xml, "infProt") || sec(xml, "protNFe") || "";

    // --- Header / IDE ---
    const cabecalho = {
        chaveAcesso:        chave,
        modelo:             str(tag(ideBloco, "mod")   || "55"),
        serie:              str(tag(ideBloco, "serie")  || ""),
        numeroNota:         num(tag(ideBloco, "nNF")),
        dataEmissao:        dateFmt(tag(ideBloco, "dhEmi") || tag(ideBloco, "dEmi")),
        dataSaidaEntrada:   dateFmt(tag(ideBloco, "dhSaiEnt") || tag(ideBloco, "dSaiEnt")),
        naturezaOperacao:   str(tag(ideBloco, "natOp")),
        tipoOperacao:       str(tag(ideBloco, "tpNF")  || "1"),
        finalidadeNfe:      str(tag(ideBloco, "finNFe") || "1"),
        ambiente:           num(tag(ideBloco, "tpAmb") || "1"),
        // Emitente
        cnpjEmitente:       str(tag(emitBloco, "CNPJ")  || "").replace(/\D/g, "").padStart(14, "0"),
        nomeEmitente:       str(tag(emitBloco, "xNome") || ""),
        ieEmitente:         str(tag(emitBloco, "IE")    || ""),
        ufEmitente:         str(tag(sec(emitBloco, "enderEmit") || emitBloco, "UF") || ""),
        // Destinatário
        cnpjDestinatario:   str(tag(destBloco, "CNPJ")  || tag(destBloco, "CPF") || "").replace(/\D/g, ""),
        nomeDestinatario:   str(tag(destBloco, "xNome") || ""),
        ufDestinatario:     str(tag(sec(destBloco, "enderDest") || destBloco, "UF") || ""),
        // Totais
        valorProdutos:      num(tag(totBloco, "vProd")),
        valorFrete:         num(tag(totBloco, "vFrete")),
        valorSeguro:        num(tag(totBloco, "vSeg")),
        valorDesconto:      num(tag(totBloco, "vDesc")),
        valorTotalNfe:      num(tag(totBloco, "vNF")),
        // Protocolo
        protocoloAutorizacao: str(tag(infProt, "nProt") || ""),
        dataAutorizacao:    dateFmt(tag(infProt, "dhRecbto") || tag(infProt, "dRecbto")),
        schemaXml:          null,
        tipoDocumento:      xml.includes("</procNFe>") ? "PROCNFE" : (xml.includes("</nfeProc>") ? "NFEPROC" : "NFE"),
    };

    // --- Totais detalhados ---
    const totais = {
        vBc:         num(tag(totBloco, "vBC")),
        vIcms:       num(tag(totBloco, "vICMS")),
        vIcmsDeson:  num(tag(totBloco, "vICMSDeson")),
        vFcp:        num(tag(totBloco, "vFCP")),
        vBcSt:       num(tag(totBloco, "vBCST")),
        vSt:         num(tag(totBloco, "vST")),
        vFcpSt:      num(tag(totBloco, "vFCPST")),
        vProd:       num(tag(totBloco, "vProd")),
        vFrete:      num(tag(totBloco, "vFrete")),
        vSeg:        num(tag(totBloco, "vSeg")),
        vDesc:       num(tag(totBloco, "vDesc")),
        vIi:         num(tag(totBloco, "vII")),
        vIpi:        num(tag(totBloco, "vIPI")),
        vPis:        num(tag(totBloco, "vPIS")),
        vCofins:     num(tag(totBloco, "vCOFINS")),
        vOutro:      num(tag(totBloco, "vOutro")),
        vNf:         num(tag(totBloco, "vNF")),
    };

    // --- Itens ---
    const itens = [];
    const detRegex = /<det\s[^>]*nItem\s*=\s*["']?(\d+)["']?[^>]*>([\s\S]*?)<\/det>/gi;
    let mDet;
    while ((mDet = detRegex.exec(xml)) !== null) {
        const numItem = parseInt(mDet[1], 10);
        const detXml  = mDet[2];
        const prodBloco = sec(detXml, "prod") || detXml;
        const impBloco  = sec(detXml, "imposto") || "";

        const item = {
            numItem,
            codProdFornecedor: str(tag(prodBloco, "cProd")),
            eanComercial:      str(tag(prodBloco, "cEAN") || ""),
            descricaoXml:      str(tag(prodBloco, "xProd")),
            ncm:               str(tag(prodBloco, "NCM")),
            cest:              str(tag(prodBloco, "CEST") || ""),
            cfop:              str(tag(prodBloco, "CFOP")),
            unidadeComercial:  str(tag(prodBloco, "uCom")),
            qtdeComercial:     num(tag(prodBloco, "qCom")),
            valorUnitario:     num(tag(prodBloco, "vUnCom")),
            valorTotalItem:    num(tag(prodBloco, "vProd")),
            eanTributavel:     str(tag(prodBloco, "cEANTrib") || ""),
            unidadeTributavel: str(tag(prodBloco, "uTrib") || ""),
            qtdeTributavel:    num(tag(prodBloco, "qTrib") || "0"),
            valorUnitTrib:     num(tag(prodBloco, "vUnTrib") || "0"),
            valorFrete:        num(tag(prodBloco, "vFrete") || "0"),
            valorSeguro:       num(tag(prodBloco, "vSeg") || "0"),
            valorDesconto:     num(tag(prodBloco, "vDesc") || "0"),
            valorOutrasDesp:   num(tag(prodBloco, "vOutro") || "0"),
            indTotal:          str(tag(prodBloco, "indTot") || "1"),
            impostos: [],
        };

        // Impostos do item
        const gruposImposto = ["ICMS", "IPI", "PIS", "COFINS", "II", "ISSQN"];
        for (const grupo of gruposImposto) {
            const gBloco = sec(impBloco, grupo);
            if (!gBloco) continue;
            // Dentro do grupo pode ter subgrupo como ICMS00, ICMS10, etc.
            const subMatch = gBloco.match(/<(ICMS\d{2,3}|IPI\w*|PIS\w+|COFINS\w+|II|ISSQN)[^>]*>([\s\S]*?)<\/\1>/i);
            const subBloco = subMatch ? subMatch[2] : gBloco;
            item.impostos.push({
                grupo,
                tipoImposto:    subMatch ? subMatch[1] : grupo,
                cst:            str(tag(subBloco, "CST") || ""),
                csosn:          str(tag(subBloco, "CSOSN") || ""),
                origemProd:     str(tag(subBloco, "orig") || ""),
                baseCalculo:    num(tag(subBloco, "vBC") || "0"),
                aliquota:       num(tag(subBloco, "pICMS") || tag(subBloco, "pIPI") || tag(subBloco, "pPIS") || tag(subBloco, "pCOFINS") || "0"),
                valorImposto:   num(tag(subBloco, "vICMS") || tag(subBloco, "vIPI") || tag(subBloco, "vPIS") || tag(subBloco, "vCOFINS") || "0"),
                baseSt:         num(tag(subBloco, "vBCST") || "0"),
                aliquotaSt:     num(tag(subBloco, "pICMSST") || "0"),
                valorSt:        num(tag(subBloco, "vICMSST") || "0"),
                valorDesonerado: num(tag(subBloco, "vICMSDeson") || "0"),
            });
        }
        itens.push(item);
    }

    // --- Transporte ---
    const transporteBloco = sec(transpBloco, "transporta") || "";
    const volBloco = sec(transpBloco, "vol") || "";
    const transporte = {
        modFrete:    str(tag(transpBloco, "modFrete") || "9"),
        cnpjTransp:  str(tag(transporteBloco, "CNPJ") || ""),
        nomeTransp:  str(tag(transporteBloco, "xNome") || ""),
        placa:       str(tag(sec(transpBloco, "veicTransp") || transpBloco, "placa") || ""),
        qtdVol:      num(tag(volBloco, "qVol") || "0"),
        pesoLiq:     num(tag(volBloco, "pesoL") || "0"),
        pesoBrt:     num(tag(volBloco, "pesoB") || "0"),
    };

    // --- Cobrança / Duplicatas / Pagamento ---
    const cobrancas = [];
    // Fatura
    const fatBloco = sec(cobrBloco, "fat");
    if (fatBloco) {
        cobrancas.push({
            tipo:   "FATURA",
            numFat: str(tag(fatBloco, "nFat") || ""),
            numDup: null,
            dtVenc: null,
            valor:  num(tag(fatBloco, "vLiq") || tag(fatBloco, "vOrig") || "0"),
            tpag:   null,
            vpag:   0,
        });
    }
    // Duplicatas
    const dupRegex = /<dup>([\s\S]*?)<\/dup>/gi;
    let mDup;
    while ((mDup = dupRegex.exec(cobrBloco)) !== null) {
        cobrancas.push({
            tipo:   "DUPLICATA",
            numFat: null,
            numDup: str(tag(mDup[1], "nDup") || ""),
            dtVenc: dateFmt(tag(mDup[1], "dVenc")),
            valor:  num(tag(mDup[1], "vDup") || "0"),
            tpag:   null,
            vpag:   0,
        });
    }
    // Pagamentos
    const detPagRegex = /<detPag>([\s\S]*?)<\/detPag>/gi;
    let mPag;
    while ((mPag = detPagRegex.exec(pagBloco)) !== null) {
        cobrancas.push({
            tipo:   "PAGAMENTO",
            numFat: null,
            numDup: null,
            dtVenc: null,
            valor:  0,
            tpag:   str(tag(mPag[1], "tPag") || ""),
            vpag:   num(tag(mPag[1], "vPag") || "0"),
        });
    }

    return { cabecalho, totais, itens, transporte, cobrancas };
}
