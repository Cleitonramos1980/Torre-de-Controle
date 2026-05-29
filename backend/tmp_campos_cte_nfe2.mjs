import oracledb from "oracledb";
oracledb.fetchAsString = [oracledb.CLOB];
const pool = await oracledb.createPool({
    user: "U_CC4UJM_WI", password: "AFT5L44D2Z56IZ3E65",
    connectString: "(DESCRIPTION=(ADDRESS_LIST=(ADDRESS=(PROTOCOL=TCP)(HOST=201.157.196.196)(PORT=1521)))(CONNECT_DATA=(SERVICE_NAME=CC4UJM_204716_W_high.paas.oracle.com)))",
    poolMin: 1, poolMax: 2, poolAlias: "val2"
});
const c = await pool.getConnection();
const q = async (sql, b = {}) => (await c.execute(sql, b, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows;

// ── NF-e: todos os campos relevantes do emitente, sem filtro de data ──
console.log("=== NF-e RECEBIDAS — campos do emitente (sem filtro de data) ===");
const nfe = await q(`
    SELECT n.CODFORNEC, n.FORNECEDOR, n.CGC,
           n.ENDERECO, n.BAIRRO, n.MUNICIPIO, n.UF, n.CEP,
           n.CODMUNICIPIO, n.CODIBGE,
           n.IE, n.TIPOFORNEC,
           n.SIMPLESNACIONAL,
           n.NUMNOTA, n.DTEMISSAO
    FROM PCNFENT n
    WHERE n.CHAVENFE IS NOT NULL
      AND ROWNUM <= 3
    ORDER BY n.DTEMISSAO DESC
`).catch(e => { console.log("ERRO NF-e: " + e.message); return []; });

if (nfe.length === 0) {
    // tentar sem CHAVENFE
    const nfe2 = await q(`
        SELECT n.CODFORNEC, n.FORNECEDOR, n.CGC,
               n.ENDERECO, n.BAIRRO, n.MUNICIPIO, n.UF, n.CEP,
               n.CODMUNICIPIO, n.CODIBGE,
               n.IE, n.TIPOFORNEC, n.SIMPLESNACIONAL,
               n.NUMNOTA, n.DTEMISSAO
        FROM PCNFENT n WHERE ROWNUM <= 3 ORDER BY n.DTEMISSAO DESC
    `).catch(e => { console.log("ERRO NF-e2: " + e.message); return []; });
    nfe2.forEach((r, i) => {
        console.log("\n  [" + (i+1) + "] NF " + r.NUMNOTA + " | CF:" + r.CODFORNEC + " | " + r.FORNECEDOR);
        console.log("       CGC         : " + r.CGC);
        console.log("       TIPOFORNEC  : " + r.TIPOFORNEC);
        console.log("       ENDERECO    : " + r.ENDERECO);
        console.log("       BAIRRO      : " + r.BAIRRO);
        console.log("       MUNICIPIO   : " + r.MUNICIPIO + " - " + r.UF);
        console.log("       CEP         : " + r.CEP);
        console.log("       CODMUNICIPIO: " + r.CODMUNICIPIO);
        console.log("       CODIBGE     : " + r.CODIBGE);
        console.log("       IE          : " + r.IE);
        console.log("       SIMPLESNAC  : " + r.SIMPLESNACIONAL);
    });
} else {
    nfe.forEach((r, i) => {
        console.log("\n  [" + (i+1) + "] NF " + r.NUMNOTA + " | CF:" + r.CODFORNEC + " | " + r.FORNECEDOR);
        console.log("       CGC         : " + r.CGC);
        console.log("       ENDERECO    : " + r.ENDERECO);
        console.log("       BAIRRO      : " + r.BAIRRO);
        console.log("       MUNICIPIO   : " + r.MUNICIPIO + " - " + r.UF);
        console.log("       CEP         : " + r.CEP);
        console.log("       CODMUNICIPIO: " + r.CODMUNICIPIO);
        console.log("       CODIBGE     : " + r.CODIBGE);
        console.log("       IE          : " + r.IE);
        console.log("       SIMPLESNAC  : " + r.SIMPLESNACIONAL);
    });
}

// ── CT-e: todos os campos disponíveis para o emitente ──
console.log("\n=== CT-e RECEBIDOS — todos os campos da PCCTEDESTINADO ===");
const cte = await q(`
    SELECT * FROM PCCTEDESTINADO WHERE ROWNUM <= 3 ORDER BY DATAEMISSAO DESC
`).catch(e => { console.log("ERRO CT-e: " + e.message); return []; });

if (cte.length === 0) {
    console.log("  Nenhum CT-e em PCCTEDESTINADO. Verificando PCNFENT com CHAVECTE...");
    const cteViaLanc = await q(`
        SELECT n.CHAVECTE, n.FORNECEDOR, n.CGC, n.UF,
               n.ENDERECO, n.BAIRRO, n.MUNICIPIO, n.CEP,
               n.CODMUNICIPIO, n.CODIBGE, n.IE,
               n.SIMPLESNACIONAL, n.TIPOFORNEC
        FROM PCNFENT n
        WHERE n.CHAVECTE IS NOT NULL AND ROWNUM <= 3
        ORDER BY n.DTEMISSAO DESC
    `).catch(e => { console.log("ERRO CTE-NFENT: " + e.message); return []; });
    cteViaLanc.forEach((r, i) => {
        console.log("\n  [" + (i+1) + "] CT-e via PCNFENT | " + r.FORNECEDOR);
        for (const [k, v] of Object.entries(r)) {
            if (v !== null && v !== undefined && String(v).trim() !== "" && v !== 0)
                console.log("       " + String(k).padEnd(16) + ": " + (v instanceof Date ? v.toISOString().slice(0,10) : v));
        }
    });
} else {
    cte.forEach((r, i) => {
        console.log("\n  [" + (i+1) + "] CT-e " + r.CHAVECTE);
        for (const [k, v] of Object.entries(r)) {
            if (v !== null && v !== undefined && String(v).trim() !== "" && v !== 0)
                console.log("       " + String(k).padEnd(25) + ": " + (v instanceof Date ? v.toISOString().slice(0,10) : v));
        }
    });
}

// ── Verificar o que a PCCTEDESTINADO tem de campos de endereço do emitente ──
console.log("\n=== PCCTEDESTINADO — campos completos (todos) ===");
const allColsCte = await q(`
    SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH
    FROM ALL_TAB_COLUMNS
    WHERE TABLE_NAME = 'PCCTEDESTINADO' AND OWNER = 'U_CC4UJM_WI'
    ORDER BY COLUMN_ID
`);
console.log("  Total colunas: " + allColsCte.length);
allColsCte.forEach(r =>
    console.log("  " + String(r.COLUMN_NAME).padEnd(30) + r.DATA_TYPE + (r.DATA_LENGTH ? "(" + r.DATA_LENGTH + ")" : ""))
);

await c.close();
await pool.close(0);
console.log("\n=== Concluído ===");
