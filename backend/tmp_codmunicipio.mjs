import oracledb from "oracledb";
oracledb.fetchAsString = [oracledb.CLOB];
const pool = await oracledb.createPool({
    user: "U_CC4UJM_WI", password: "AFT5L44D2Z56IZ3E65",
    connectString: "(DESCRIPTION=(ADDRESS_LIST=(ADDRESS=(PROTOCOL=TCP)(HOST=201.157.196.196)(PORT=1521)))(CONNECT_DATA=(SERVICE_NAME=CC4UJM_204716_W_high.paas.oracle.com)))",
    poolMin: 1, poolMax: 2, poolAlias: "mun"
});
const c = await pool.getConnection();
const q = async (sql, b = {}) => (await c.execute(sql, b, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows;

// 1. Qual tabela de municípios existe?
console.log("=== 1. Tabelas de município/cidade no WinThor ===");
const tabs = await q(`
    SELECT TABLE_NAME FROM ALL_TABLES
    WHERE OWNER = 'U_CC4UJM_WI'
      AND (TABLE_NAME LIKE '%MUNIC%' OR TABLE_NAME LIKE '%CIDADE%' OR TABLE_NAME LIKE '%IBGE%')
    ORDER BY TABLE_NAME
`);
console.log("  Tabelas:", tabs.map(t => t.TABLE_NAME).join(", "));

// 2. Estrutura e amostra da PCCIDADE
console.log("\n=== 2. Estrutura da PCCIDADE ===");
const colsCidade = await q(`
    SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, NULLABLE
    FROM ALL_TAB_COLUMNS
    WHERE TABLE_NAME = 'PCCIDADE' AND OWNER = 'U_CC4UJM_WI'
    ORDER BY COLUMN_ID
`);
colsCidade.forEach(r => console.log("  " + String(r.COLUMN_NAME).padEnd(20) + r.DATA_TYPE + (r.DATA_LENGTH ? "(" + r.DATA_LENGTH + ")" : "")));

console.log("\n=== 3. Amostra de registros PCCIDADE ===");
const amostCidade = await q(`SELECT * FROM PCCIDADE WHERE ROWNUM <= 8 ORDER BY CODCIDADE`);
amostCidade.forEach(r => console.log("  " + JSON.stringify(r)));

// 3. Como o CODMUNICIPIO é usado no PCFORNEC — quais valores existem e como se relacionam
console.log("\n=== 4. CODMUNICIPIO × PCCIDADE — são o mesmo campo? ===");
const relac = await q(`
    SELECT f.CODMUNICIPIO, f.CIDADE, f.ESTADO,
           c.CODCIDADE, c.CIDADE AS CIDADE_TAB,
           ci.CODIBGE
    FROM PCFORNEC f
    LEFT JOIN PCCIDADE c ON c.CODCIDADE = f.CODMUNICIPIO
    LEFT JOIN PCCIDADE ci ON ci.CODIBGE = f.CODMUNICIPIO
    WHERE f.CODMUNICIPIO IS NOT NULL
      AND f.EXCLUIDO <> 'S'
      AND ROWNUM <= 10
    ORDER BY f.CODFORNEC
`).catch(() => []);
relac.forEach(r => console.log("  CODMUNICIPIO=" + r.CODMUNICIPIO + " | CIDADE_FORN=" + r.CIDADE + "-" + r.ESTADO + " | via CODCIDADE=" + r.CODCIDADE + "(" + r.CIDADE_TAB + ") | via CODIBGE=>" + r.CODIBGE));

// 4. O CODMUNICIPIO do PCFORNEC aponta para CODCIDADE ou CODIBGE?
console.log("\n=== 5. Verificação: CODMUNICIPIO = CODCIDADE ou CODIBGE? ===");
const verif = await q(`
    SELECT
        SUM(CASE WHEN EXISTS(SELECT 1 FROM PCCIDADE c WHERE c.CODCIDADE = f.CODMUNICIPIO) THEN 1 ELSE 0 END) BATE_CODCIDADE,
        SUM(CASE WHEN EXISTS(SELECT 1 FROM PCCIDADE c WHERE c.CODIBGE = f.CODMUNICIPIO) THEN 1 ELSE 0 END) BATE_CODIBGE,
        COUNT(*) TOTAL
    FROM PCFORNEC f
    WHERE f.CODMUNICIPIO IS NOT NULL AND f.EXCLUIDO <> 'S'
`).catch(() => []);
verif.forEach(r => console.log("  TOTAL com CODMUNICIPIO: " + r.TOTAL + " | Batem CODCIDADE: " + r.BATE_CODCIDADE + " | Batem CODIBGE: " + r.BATE_CODIBGE));

// 5. Ver colunas da PCCIDADE (especialmente CODIBGE)
console.log("\n=== 6. PCCIDADE — cidades do AM/PA como exemplo ===");
const cidsAm = await q(`
    SELECT * FROM PCCIDADE WHERE ESTADO IN ('AM','PA') AND ROWNUM <= 10 ORDER BY CIDADE
`).catch(() => []);
cidsAm.forEach(r => console.log("  " + JSON.stringify(r)));

await c.close();
await pool.close(0);
console.log("\n=== Concluído ===");
