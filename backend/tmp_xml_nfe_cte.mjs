import oracledb from "oracledb";
oracledb.fetchAsString = [oracledb.CLOB];
const pool = await oracledb.createPool({
    user: "U_CC4UJM_WI", password: "AFT5L44D2Z56IZ3E65",
    connectString: "(DESCRIPTION=(ADDRESS_LIST=(ADDRESS=(PROTOCOL=TCP)(HOST=201.157.196.196)(PORT=1521)))(CONNECT_DATA=(SERVICE_NAME=CC4UJM_204716_W_high.paas.oracle.com)))",
    poolMin: 1, poolMax: 2, poolAlias: "xmlval"
});
const c = await pool.getConnection();
const q = async (sql, b = {}) => (await c.execute(sql, b, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows;

// 1. Tabelas que guardam XML de NF-e e CT-e no WinThor
console.log("=== 1. Tabelas com XML de NF-e/CT-e no WinThor ===");
const tabsXml = await q(`
    SELECT t.TABLE_NAME
    FROM ALL_TABLES t
    WHERE t.OWNER = 'U_CC4UJM_WI'
      AND t.TABLE_NAME IN (
          SELECT c.TABLE_NAME FROM ALL_TAB_COLUMNS c
          WHERE c.OWNER = 'U_CC4UJM_WI'
            AND c.DATA_TYPE IN ('CLOB','XMLTYPE','BLOB')
            AND (c.COLUMN_NAME LIKE '%XML%' OR c.COLUMN_NAME LIKE '%NFE%' OR c.COLUMN_NAME LIKE '%CTE%')
      )
    ORDER BY t.TABLE_NAME
`);
console.log("  Tabelas com colunas XML/CLOB relacionadas:", tabsXml.map(t => t.TABLE_NAME).join(", ") || "(nenhuma)");

// 2. Verificar PCNFENT — tem coluna XML?
console.log("\n=== 2. PCNFENT — colunas XML ou CLOB ===");
const colsXmlNfe = await q(`
    SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH
    FROM ALL_TAB_COLUMNS
    WHERE TABLE_NAME = 'PCNFENT' AND OWNER = 'U_CC4UJM_WI'
      AND (DATA_TYPE IN ('CLOB','XMLTYPE','BLOB') OR COLUMN_NAME LIKE '%XML%')
    ORDER BY COLUMN_ID
`);
if (colsXmlNfe.length > 0) {
    colsXmlNfe.forEach(r => console.log("  " + r.COLUMN_NAME + " — " + r.DATA_TYPE));
} else {
    console.log("  Nenhuma coluna XML/CLOB em PCNFENT");
}

// 3. Verificar PCCTEDESTINADO — tem coluna XML?
console.log("\n=== 3. PCCTEDESTINADO — colunas XML ou CLOB ===");
const colsXmlCte = await q(`
    SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH
    FROM ALL_TAB_COLUMNS
    WHERE TABLE_NAME = 'PCCTEDESTINADO' AND OWNER = 'U_CC4UJM_WI'
      AND (DATA_TYPE IN ('CLOB','XMLTYPE','BLOB') OR COLUMN_NAME LIKE '%XML%')
    ORDER BY COLUMN_ID
`);
if (colsXmlCte.length > 0) {
    colsXmlCte.forEach(r => console.log("  " + r.COLUMN_NAME + " — " + r.DATA_TYPE));
} else {
    console.log("  Nenhuma coluna XML/CLOB em PCCTEDESTINADO");
}

// 4. Existe tabela específica de XML de documentos fiscais?
console.log("\n=== 4. Tabelas específicas de XML fiscal no WinThor ===");
const tabsEsp = await q(`
    SELECT TABLE_NAME FROM ALL_TABLES
    WHERE OWNER = 'U_CC4UJM_WI'
      AND (TABLE_NAME LIKE '%XML%' OR TABLE_NAME LIKE 'PCNFE%' OR TABLE_NAME LIKE 'PCCTE%'
           OR TABLE_NAME LIKE '%DANFE%' OR TABLE_NAME LIKE '%SEFAZ%' OR TABLE_NAME LIKE '%DFE%'
           OR TABLE_NAME LIKE 'PCDOC%')
    ORDER BY TABLE_NAME
`);
console.log("  Tabelas:", tabsEsp.map(t => t.TABLE_NAME).join(", ") || "(nenhuma)");

// 5. Se existir tabela de XML, ver estrutura
for (const tab of tabsEsp.slice(0, 5)) {
    const cols = await q(`
        SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH
        FROM ALL_TAB_COLUMNS
        WHERE TABLE_NAME = :t AND OWNER = 'U_CC4UJM_WI'
        ORDER BY COLUMN_ID
    `, { t: tab.TABLE_NAME });
    console.log("\n  " + tab.TABLE_NAME + " (" + cols.length + " colunas):");
    cols.slice(0, 15).forEach(r => console.log("    " + String(r.COLUMN_NAME).padEnd(25) + r.DATA_TYPE));
}

// 6. Buscar especificamente a tabela de XML da NF-e (comum no WinThor: PCNFEENT, PCNFECAB, etc)
console.log("\n=== 5. Busca por tabelas que contenham CLOB relacionadas a NF/CT ===");
const tabsClob = await q(`
    SELECT DISTINCT t.TABLE_NAME
    FROM ALL_TABLES t
    JOIN ALL_TAB_COLUMNS c ON c.TABLE_NAME = t.TABLE_NAME AND c.OWNER = t.OWNER
    WHERE t.OWNER = 'U_CC4UJM_WI'
      AND c.DATA_TYPE = 'CLOB'
      AND (t.TABLE_NAME LIKE 'PC%' OR t.TABLE_NAME LIKE 'NF%' OR t.TABLE_NAME LIKE 'CT%')
    ORDER BY t.TABLE_NAME
`);
console.log("  Tabelas PC*/NF*/CT* com CLOB:", tabsClob.map(t => t.TABLE_NAME).join(", ") || "(nenhuma)");

await c.close();
await pool.close(0);
console.log("\n=== Concluído ===");
