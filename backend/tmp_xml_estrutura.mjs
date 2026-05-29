import oracledb from "oracledb";
oracledb.fetchAsString = [oracledb.CLOB];
const pool = await oracledb.createPool({
    user: "U_CC4UJM_WI", password: "AFT5L44D2Z56IZ3E65",
    connectString: "(DESCRIPTION=(ADDRESS_LIST=(ADDRESS=(PROTOCOL=TCP)(HOST=201.157.196.196)(PORT=1521)))(CONNECT_DATA=(SERVICE_NAME=CC4UJM_204716_W_high.paas.oracle.com)))",
    poolMin: 1, poolMax: 2, poolAlias: "xmlest"
});
const c = await pool.getConnection();
const q = async (sql, b = {}) => (await c.execute(sql, b, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows;

// ── PCNFENTXML — XML das NF-e recebidas ──
console.log("=== 1. PCNFENTXML — estrutura e amostra ===");
const colsNfeXml = await q(`
    SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
    FROM ALL_TAB_COLUMNS
    WHERE TABLE_NAME = 'PCNFENTXML' AND OWNER = 'U_CC4UJM_WI'
    ORDER BY COLUMN_ID
`);
colsNfeXml.forEach(r => console.log("  " + String(r.COLUMN_NAME).padEnd(25) + r.DATA_TYPE + (r.DATA_LENGTH ? "(" + r.DATA_LENGTH + ")" : "")));

const cntNfeXml = await q(`SELECT COUNT(*) QTD FROM PCNFENTXML`).catch(() => []);
console.log("  Registros: " + (cntNfeXml[0] ? cntNfeXml[0].QTD : "?"));

// Buscar um XML de NF-e e extrair trecho do emitente
const nfeXmlEx = await q(`
    SELECT x.*, n.FORNECEDOR, n.CGC
    FROM PCNFENTXML x
    JOIN PCNFENT n ON n.NUMTRANSENT = x.NUMTRANSENT
    WHERE ROWNUM <= 1
    ORDER BY n.DTEMISSAO DESC
`).catch(() => []);
if (nfeXmlEx.length > 0) {
    const r = nfeXmlEx[0];
    console.log("\n  Exemplo PCNFENTXML:");
    for (const [k, v] of Object.entries(r)) {
        if (v !== null && v !== undefined && String(v).trim() !== "") {
            const val = String(v);
            console.log("    " + String(k).padEnd(20) + ": " + val.slice(0, 120) + (val.length > 120 ? "..." : ""));
        }
    }
}

// ── PCRETCONSCTEDESTINADO — retorno da consulta CT-e do SEFAZ ──
console.log("\n=== 2. PCRETCONSCTEDESTINADO — estrutura e amostra ===");
const colsRetCte = await q(`
    SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH
    FROM ALL_TAB_COLUMNS
    WHERE TABLE_NAME = 'PCRETCONSCTEDESTINADO' AND OWNER = 'U_CC4UJM_WI'
    ORDER BY COLUMN_ID
`);
colsRetCte.forEach(r => console.log("  " + String(r.COLUMN_NAME).padEnd(25) + r.DATA_TYPE + (r.DATA_LENGTH ? "(" + r.DATA_LENGTH + ")" : "")));

const cntRetCte = await q(`SELECT COUNT(*) QTD FROM PCRETCONSCTEDESTINADO`).catch(() => []);
console.log("  Registros: " + (cntRetCte[0] ? cntRetCte[0].QTD : "?"));

const retCteEx = await q(`SELECT * FROM PCRETCONSCTEDESTINADO WHERE ROWNUM <= 1`).catch(() => []);
if (retCteEx.length > 0) {
    const r = retCteEx[0];
    for (const [k, v] of Object.entries(r)) {
        if (v !== null && v !== undefined && String(v).trim() !== "") {
            const val = String(v);
            console.log("    " + String(k).padEnd(20) + ": " + val.slice(0, 200) + (val.length > 200 ? "..." : ""));
        }
    }
}

// ── PCDOCELETRONICO — documentos eletrônicos ──
console.log("\n=== 3. PCDOCELETRONICO — estrutura ===");
const colsDocEl = await q(`
    SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH
    FROM ALL_TAB_COLUMNS
    WHERE TABLE_NAME = 'PCDOCELETRONICO' AND OWNER = 'U_CC4UJM_WI'
    ORDER BY COLUMN_ID
`);
colsDocEl.forEach(r => console.log("  " + String(r.COLUMN_NAME).padEnd(25) + r.DATA_TYPE + (r.DATA_LENGTH ? "(" + r.DATA_LENGTH + ")" : "")));
const cntDocEl = await q(`SELECT COUNT(*) QTD FROM PCDOCELETRONICO`).catch(() => []);
console.log("  Registros: " + (cntDocEl[0] ? cntDocEl[0].QTD : "?"));

// ── PCDADOSXML — dados extraídos do XML ──
console.log("\n=== 4. PCDADOSXML — estrutura ===");
const colsDadosXml = await q(`
    SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH
    FROM ALL_TAB_COLUMNS
    WHERE TABLE_NAME = 'PCDADOSXML' AND OWNER = 'U_CC4UJM_WI'
    ORDER BY COLUMN_ID
`);
colsDadosXml.forEach(r => console.log("  " + String(r.COLUMN_NAME).padEnd(25) + r.DATA_TYPE + (r.DATA_LENGTH ? "(" + r.DATA_LENGTH + ")" : "")));

// ── PCMENSAGEMNFE e PCMENSAGEMCTE ──
console.log("\n=== 5. PCMENSAGEMNFE — estrutura ===");
const colsMsgNfe = await q(`
    SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH
    FROM ALL_TAB_COLUMNS
    WHERE TABLE_NAME = 'PCMENSAGEMNFE' AND OWNER = 'U_CC4UJM_WI'
    ORDER BY COLUMN_ID
`);
colsMsgNfe.forEach(r => console.log("  " + String(r.COLUMN_NAME).padEnd(25) + r.DATA_TYPE + (r.DATA_LENGTH ? "(" + r.DATA_LENGTH + ")" : "")));
const cntMsgNfe = await q(`SELECT COUNT(*) QTD FROM PCMENSAGEMNFE`).catch(() => []);
console.log("  Registros: " + (cntMsgNfe[0] ? cntMsgNfe[0].QTD : "?"));

console.log("\n=== 6. PCMENSAGEMCTE — estrutura ===");
const colsMsgCte = await q(`
    SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH
    FROM ALL_TAB_COLUMNS
    WHERE TABLE_NAME = 'PCMENSAGEMCTE' AND OWNER = 'U_CC4UJM_WI'
    ORDER BY COLUMN_ID
`);
colsMsgCte.forEach(r => console.log("  " + String(r.COLUMN_NAME).padEnd(25) + r.DATA_TYPE + (r.DATA_LENGTH ? "(" + r.DATA_LENGTH + ")" : "")));
const cntMsgCte = await q(`SELECT COUNT(*) QTD FROM PCMENSAGEMCTE`).catch(() => []);
console.log("  Registros: " + (cntMsgCte[0] ? cntMsgCte[0].QTD : "?"));

await c.close();
await pool.close(0);
console.log("\n=== Concluído ===");
