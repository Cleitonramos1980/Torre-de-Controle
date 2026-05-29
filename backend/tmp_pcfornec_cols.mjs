import oracledb from "oracledb";
oracledb.fetchAsString = [oracledb.CLOB];
const pool = await oracledb.createPool({
    user: "U_CC4UJM_WI", password: "AFT5L44D2Z56IZ3E65",
    connectString: "(DESCRIPTION=(ADDRESS_LIST=(ADDRESS=(PROTOCOL=TCP)(HOST=201.157.196.196)(PORT=1521)))(CONNECT_DATA=(SERVICE_NAME=CC4UJM_204716_W_high.paas.oracle.com)))",
    poolMin: 1, poolMax: 2, poolAlias: "pcfcols"
});
const c = await pool.getConnection();
const q = async (sql, b = {}) => (await c.execute(sql, b, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows;

// Todos os campos da PCFORNEC
const cols = await q(`
    SELECT COLUMN_ID, COLUMN_NAME, DATA_TYPE,
           DATA_LENGTH, DATA_PRECISION, DATA_SCALE,
           NULLABLE, DATA_DEFAULT
    FROM ALL_TAB_COLUMNS
    WHERE TABLE_NAME = 'PCFORNEC' AND OWNER = 'U_CC4UJM_WI'
    ORDER BY COLUMN_ID
`);

console.log("TOTAL DE COLUNAS: " + cols.length);
console.log("");
cols.forEach(r => {
    const tipo = r.DATA_TYPE === "NUMBER"
        ? (r.DATA_PRECISION ? "NUMBER(" + r.DATA_PRECISION + "," + (r.DATA_SCALE||0) + ")" : "NUMBER")
        : r.DATA_TYPE === "VARCHAR2" ? "VARCHAR2(" + r.DATA_LENGTH + ")"
        : r.DATA_TYPE === "DATE" ? "DATE"
        : r.DATA_TYPE + (r.DATA_LENGTH ? "(" + r.DATA_LENGTH + ")" : "");
    const nn  = r.NULLABLE === "N" ? " [NOT NULL]" : "";
    const def = r.DATA_DEFAULT ? " DEFAULT=" + String(r.DATA_DEFAULT).trim() : "";
    console.log(String(r.COLUMN_ID).padStart(3) + "  " + String(r.COLUMN_NAME).padEnd(28) + tipo.padEnd(22) + nn + def);
});

// Exemplo real bem preenchido
console.log("\n=== EXEMPLO REAL (prestador com ISS) ===");
const ex = await q(`
    SELECT f.*
    FROM PCFORNEC f
    WHERE (f.PERCISS > 0 OR f.PERCINSS > 0)
      AND f.EXCLUIDO <> 'S'
      AND ROWNUM = 1
    ORDER BY f.DTCADASTRO DESC
`);
if (ex.length > 0) {
    for (const [k, v] of Object.entries(ex[0])) {
        if (v !== null && v !== undefined && v !== "" && v !== 0)
            console.log("  " + String(k).padEnd(25) + ": " + (v instanceof Date ? v.toISOString().slice(0,10) : v));
    }
}

// Exemplo de transportadora (para CT-e)
console.log("\n=== EXEMPLO REAL (transportadora / CT-e) ===");
const transp = await q(`
    SELECT f.*
    FROM PCFORNEC f
    WHERE f.TIPOFORNEC = 'T'
      AND f.EXCLUIDO <> 'S'
      AND ROWNUM = 1
    ORDER BY f.DTCADASTRO DESC
`);
if (transp.length > 0) {
    for (const [k, v] of Object.entries(transp[0])) {
        if (v !== null && v !== undefined && v !== "" && v !== 0)
            console.log("  " + String(k).padEnd(25) + ": " + (v instanceof Date ? v.toISOString().slice(0,10) : v));
    }
} else {
    console.log("  (nenhuma transportadora com TIPOFORNEC=T encontrada)");
}

await c.close();
await pool.close(0);
console.log("\n=== Concluído ===");
