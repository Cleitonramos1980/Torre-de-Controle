import oracledb from "oracledb";
oracledb.fetchAsString = [oracledb.CLOB];
const pool = await oracledb.createPool({
    user: "U_CC4UJM_WI", password: "AFT5L44D2Z56IZ3E65",
    connectString: "(DESCRIPTION=(ADDRESS_LIST=(ADDRESS=(PROTOCOL=TCP)(HOST=201.157.196.196)(PORT=1521)))(CONNECT_DATA=(SERVICE_NAME=CC4UJM_204716_W_high.paas.oracle.com)))",
    poolMin: 1, poolMax: 2, poolAlias: "xmlemit"
});
const c = await pool.getConnection();
const q = async (sql, b = {}) => (await c.execute(sql, b, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows;

function tag(xml, t) {
    const m = xml.match(new RegExp(`<(?:[\\w]+:)?${t}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w]+:)?${t}>`, "i"));
    return m ? m[1].trim() : null;
}
function secao(xml, t) {
    const m = xml.match(new RegExp(`<(?:[\\w]+:)?${t}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w]+:)?${t}>`, "i"));
    return m ? m[1] : null;
}

// ── NF-e XML: extrair seção <emit> ──
console.log("=== 1. NF-e — seção <emit> do XML (PCNFENTXML) ===");
const nfeXml = await q(`SELECT DADOSXML, CNPJ, NUMNOTA FROM PCNFENTXML WHERE ROWNUM <= 1`);
if (nfeXml.length > 0) {
    const xml = nfeXml[0].DADOSXML;
    const emit = secao(xml, "emit");
    if (emit) {
        console.log("  Campos extraídos do <emit>:");
        ["CNPJ","CPF","xNome","xFant","IE","IEST","IM","CNAE","CRT"].forEach(t => {
            const v = tag(emit, t);
            if (v) console.log("    <" + t + "> = " + v);
        });
        const ender = secao(emit, "enderEmit");
        if (ender) {
            console.log("  Campos de <enderEmit>:");
            ["xLgr","nro","xCpl","xBairro","cMun","xMun","UF","CEP","cPais","xPais","fone","email"].forEach(t => {
                const v = tag(ender, t);
                if (v) console.log("    <" + t + "> = " + v);
            });
        }
    } else {
        console.log("  Trecho XML (primeiros 500 chars):", xml.slice(0, 500));
    }
}

// ── PCDOCELETRONICO: ver NF-e e CT-e pelo NUMTRANSENT ──
console.log("\n=== 2. PCDOCELETRONICO — ligação com NF-e ===");
const docEl = await q(`
    SELECT d.NUMTRANSACAO, d.MOVIMENTO,
           CASE WHEN d.XMLNFE IS NOT NULL THEN 'TEM NF-e XML' ELSE 'SEM NF-e XML' END AS STATUS_NFE,
           CASE WHEN d.XMLCTE IS NOT NULL THEN 'TEM CT-e XML' ELSE 'SEM CT-e XML' END AS STATUS_CTE,
           LENGTH(d.XMLNFE) LEN_NFE, LENGTH(d.XMLCTE) LEN_CTE
    FROM PCDOCELETRONICO d
    WHERE (d.XMLNFE IS NOT NULL OR d.XMLCTE IS NOT NULL)
      AND ROWNUM <= 5
    ORDER BY d.NUMTRANSACAO DESC
`).catch(() => []);
docEl.forEach(r => console.log("  NUMTRANSACAO=" + r.NUMTRANSACAO + " | " + r.MOVIMENTO + " | " + r.STATUS_NFE + "("+r.LEN_NFE+"b) | " + r.STATUS_CTE + "("+r.LEN_CTE+"b)"));

// Pegar XML de NF-e do PCDOCELETRONICO e extrair <emit>
console.log("\n=== 3. NF-e XML via PCDOCELETRONICO — seção <emit> ===");
const docElNfe = await q(`
    SELECT d.XMLNFE, d.NUMTRANSACAO
    FROM PCDOCELETRONICO d
    WHERE d.XMLNFE IS NOT NULL AND ROWNUM <= 1
    ORDER BY d.NUMTRANSACAO DESC
`).catch(() => []);
if (docElNfe.length > 0) {
    const xml = docElNfe[0].XMLNFE;
    const emit = secao(xml, "emit");
    if (emit) {
        console.log("  NUMTRANSACAO: " + docElNfe[0].NUMTRANSACAO);
        console.log("  Campos do <emit>:");
        ["CNPJ","CPF","xNome","xFant","IE","CRT"].forEach(t => {
            const v = tag(emit, t);
            if (v) console.log("    <" + t + "> = " + v);
        });
        const ender = secao(emit, "enderEmit");
        if (ender) {
            console.log("  Endereço <enderEmit>:");
            ["xLgr","nro","xCpl","xBairro","cMun","xMun","UF","CEP","fone"].forEach(t => {
                const v = tag(ender, t);
                if (v) console.log("    <" + t + "> = " + v);
            });
        }
    }
}

// Pegar XML de CT-e do PCDOCELETRONICO e extrair <emit>
console.log("\n=== 4. CT-e XML via PCDOCELETRONICO — seção <emit> ===");
const docElCte = await q(`
    SELECT d.XMLCTE, d.NUMTRANSACAO
    FROM PCDOCELETRONICO d
    WHERE d.XMLCTE IS NOT NULL AND ROWNUM <= 1
    ORDER BY d.NUMTRANSACAO DESC
`).catch(() => []);
if (docElCte.length > 0) {
    const xml = docElCte[0].XMLCTE;
    const emit = secao(xml, "emit");
    if (emit) {
        console.log("  NUMTRANSACAO: " + docElCte[0].NUMTRANSACAO);
        console.log("  Campos do <emit>:");
        ["CNPJ","CPF","xNome","xFant","IE","CRT"].forEach(t => {
            const v = tag(emit, t);
            if (v) console.log("    <" + t + "> = " + v);
        });
        const ender = secao(emit, "enderEmit");
        if (ender) {
            console.log("  Endereço <enderEmit>:");
            ["xLgr","nro","xCpl","xBairro","cMun","xMun","UF","CEP","fone"].forEach(t => {
                const v = tag(ender, t);
                if (v) console.log("    <" + t + "> = " + v);
            });
        }
    } else {
        console.log("  Trecho XML CT-e (primeiros 600 chars):", xml.slice(0, 600));
    }
} else {
    console.log("  Nenhum CT-e XML em PCDOCELETRONICO");
}

// ── Como ligar PCDOCELETRONICO com PCNFENT e PCCTEDESTINADO? ──
console.log("\n=== 5. Ligação PCDOCELETRONICO → PCNFENT ===");
const liga = await q(`
    SELECT d.NUMTRANSACAO, n.NUMTRANSENT, n.NUMNOTA, n.FORNECEDOR, n.CGC
    FROM PCDOCELETRONICO d
    JOIN PCNFENT n ON n.NUMTRANSENT = d.NUMTRANSACAO
    WHERE d.XMLNFE IS NOT NULL AND ROWNUM <= 3
`).catch(() => []);
liga.forEach(r => console.log("  NUMTRANSACAO=" + r.NUMTRANSACAO + " = NUMTRANSENT=" + r.NUMTRANSENT + " | NF " + r.NUMNOTA + " | " + r.FORNECEDOR));

await c.close();
await pool.close(0);
console.log("\n=== Concluído ===");
