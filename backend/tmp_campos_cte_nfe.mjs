import oracledb from "oracledb";
oracledb.fetchAsString = [oracledb.CLOB];
const pool = await oracledb.createPool({
    user: "U_CC4UJM_WI", password: "AFT5L44D2Z56IZ3E65",
    connectString: "(DESCRIPTION=(ADDRESS_LIST=(ADDRESS=(PROTOCOL=TCP)(HOST=201.157.196.196)(PORT=1521)))(CONNECT_DATA=(SERVICE_NAME=CC4UJM_204716_W_high.paas.oracle.com)))",
    poolMin: 1, poolMax: 2, poolAlias: "ctenfecols"
});
const c = await pool.getConnection();
const q = async (sql, b = {}) => (await c.execute(sql, b, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows;

// ═══════════════════════════════════════════════════════════════
// CT-e RECEBIDOS — PCCTEDESTINADO
// ═══════════════════════════════════════════════════════════════
console.log("═══════════════════════════════════════════════════════════════");
console.log("1. COLUNAS DA PCCTEDESTINADO");
console.log("═══════════════════════════════════════════════════════════════");
const colsCte = await q(`
    SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
    FROM ALL_TAB_COLUMNS
    WHERE TABLE_NAME = 'PCCTEDESTINADO' AND OWNER = 'U_CC4UJM_WI'
    ORDER BY COLUMN_ID
`);
colsCte.forEach(r =>
    console.log("  " + String(r.COLUMN_NAME).padEnd(30) + r.DATA_TYPE + (r.DATA_LENGTH ? "(" + r.DATA_LENGTH + ")" : ""))
);

console.log("\n═══════════════════════════════════════════════════════════════");
console.log("2. EXEMPLO REAL CT-e — campos do emitente preenchidos");
console.log("═══════════════════════════════════════════════════════════════");
const ctEx = await q(`
    SELECT * FROM PCCTEDESTINADO WHERE ROWNUM <= 3 ORDER BY DATAEMISSAO DESC
`);
if (ctEx.length > 0) {
    for (const [k, v] of Object.entries(ctEx[0])) {
        if (v !== null && v !== undefined && String(v).trim() !== "" && v !== 0)
            console.log("  " + String(k).padEnd(30) + ": " + (v instanceof Date ? v.toISOString().slice(0,10) : v));
    }
}

// ═══════════════════════════════════════════════════════════════
// NF-e RECEBIDAS — PCNFENT
// ═══════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════");
console.log("3. COLUNAS DA PCNFENT (relevantes para emitente)");
console.log("═══════════════════════════════════════════════════════════════");
const colsNfe = await q(`
    SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
    FROM ALL_TAB_COLUMNS
    WHERE TABLE_NAME = 'PCNFENT' AND OWNER = 'U_CC4UJM_WI'
      AND (
          COLUMN_NAME LIKE '%CGC%' OR COLUMN_NAME LIKE '%CNPJ%' OR COLUMN_NAME LIKE '%CPF%'
          OR COLUMN_NAME LIKE '%FORN%' OR COLUMN_NAME LIKE '%ENDER%' OR COLUMN_NAME LIKE '%BAIRRO%'
          OR COLUMN_NAME LIKE '%CIDADE%' OR COLUMN_NAME LIKE '%CEP%' OR COLUMN_NAME LIKE '%ESTADO%'
          OR COLUMN_NAME LIKE '%MUNIC%' OR COLUMN_NAME LIKE '%IBGE%' OR COLUMN_NAME LIKE '%UF%'
          OR COLUMN_NAME LIKE '%IE%' OR COLUMN_NAME LIKE '%INSC%' OR COLUMN_NAME LIKE '%EMAIL%'
          OR COLUMN_NAME LIKE '%NOME%' OR COLUMN_NAME LIKE '%EMIT%' OR COLUMN_NAME LIKE '%SIMPLES%'
          OR COLUMN_NAME LIKE '%TIPOPESSOA%' OR COLUMN_NAME LIKE '%CODCIDADE%'
      )
    ORDER BY COLUMN_ID
`);
colsNfe.forEach(r =>
    console.log("  " + String(r.COLUMN_NAME).padEnd(30) + r.DATA_TYPE + (r.DATA_LENGTH ? "(" + r.DATA_LENGTH + ")" : ""))
);

console.log("\n═══════════════════════════════════════════════════════════════");
console.log("4. EXEMPLO REAL NF-e — campos do emitente preenchidos");
console.log("═══════════════════════════════════════════════════════════════");
const nfeEx = await q(`
    SELECT n.CODFORNEC, n.FORNECEDOR, n.CGC,
           n.ENDER, n.BAIRRO, n.CIDADE, n.ESTADO, n.CEP,
           n.CODMUNICIPIO, n.CODCIDADE,
           n.IE, n.TIPOPESSOA,
           n.DTEMISSAO, n.NUMNOTA, n.CHAVENFE
    FROM PCNFENT n
    WHERE n.CHAVENFE IS NOT NULL
      AND n.DTEMISSAO >= TRUNC(SYSDATE) - 90
      AND ROWNUM <= 5
    ORDER BY n.DTEMISSAO DESC
`).catch(() => []);
nfeEx.forEach((r, i) => {
    console.log("\n  [" + (i+1) + "] NF " + r.NUMNOTA + " | CF:" + r.CODFORNEC + " | " + r.FORNECEDOR);
    console.log("       CGC: " + r.CGC + " | TIPOPESSOA: " + r.TIPOPESSOA);
    console.log("       ENDER: " + r.ENDER + " | BAIRRO: " + r.BAIRRO);
    console.log("       CIDADE: " + r.CIDADE + " | ESTADO: " + r.ESTADO + " | CEP: " + r.CEP);
    console.log("       CODMUNICIPIO: " + r.CODMUNICIPIO + " | CODCIDADE: " + r.CODCIDADE);
    console.log("       IE: " + r.IE);
});

// ═══════════════════════════════════════════════════════════════
// CT-e — campos de endereço do emitente disponíveis
// ═══════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════");
console.log("5. CT-e — exemplo com emitente completo");
console.log("═══════════════════════════════════════════════════════════════");
const cteFull = await q(`
    SELECT ct.CNPJCPFEMITENTE, ct.NOMEEMITENTE,
           ct.UFEMITENTE, ct.CHAVECTE,
           ct.VLTOTALCTE, ct.DATAEMISSAO,
           ct.CODFILIAL
    FROM PCCTEDESTINADO ct
    WHERE ct.CNPJCPFEMITENTE IS NOT NULL
      AND ct.DATAEMISSAO >= TRUNC(SYSDATE) - 180
      AND ROWNUM <= 5
    ORDER BY ct.DATAEMISSAO DESC
`).catch(() => []);
cteFull.forEach((r, i) => {
    console.log("\n  [" + (i+1) + "] CT-e: " + r.CHAVECTE);
    console.log("       CNPJ: " + r.CNPJCPFEMITENTE + " | NOME: " + r.NOMEEMITENTE);
    console.log("       UF: " + r.UFEMITENTE + " | VALOR: " + r.VLTOTALCTE);
});

// ═══════════════════════════════════════════════════════════════
// PCNFENT — verificar se tem campos de endereço do emitente
// que NÃO estão no PCFORNEC (vêm do XML)
// ═══════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════════════════");
console.log("6. PCNFENT — todos os campos de endereço/identificação existentes");
console.log("═══════════════════════════════════════════════════════════════");
const allColsNfe = await q(`
    SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH
    FROM ALL_TAB_COLUMNS
    WHERE TABLE_NAME = 'PCNFENT' AND OWNER = 'U_CC4UJM_WI'
    ORDER BY COLUMN_ID
`);
// Mostrar os primeiros 80 campos relevantes
const relevantes = allColsNfe.filter(r =>
    !r.COLUMN_NAME.match(/^(PERCCRED|VLCRED|CODST|PERCST|VLST|PERCICMS|VLICMS|PERCRED|PERCDESD|VLIPI|PERCIPI|VLPISCOFINSMONO|VLPIS\b|VLCOFINS|VLCSLL)/)
);
console.log("  Total colunas PCNFENT: " + allColsNfe.length);
relevantes.slice(0, 60).forEach(r =>
    console.log("  " + String(r.COLUMN_NAME).padEnd(30) + r.DATA_TYPE + (r.DATA_LENGTH ? "(" + r.DATA_LENGTH + ")" : ""))
);

await c.close();
await pool.close(0);
console.log("\n=== Concluído ===");
