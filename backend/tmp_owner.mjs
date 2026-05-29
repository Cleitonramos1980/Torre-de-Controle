import oracledb from "oracledb";
oracledb.fetchAsString = [oracledb.CLOB];
const pool = await oracledb.createPool({
    user: "U_CC4UJM_WI", password: "AFT5L44D2Z56IZ3E65",
    connectString: "(DESCRIPTION=(ADDRESS_LIST=(ADDRESS=(PROTOCOL=TCP)(HOST=201.157.196.196)(PORT=1521)))(CONNECT_DATA=(SERVICE_NAME=CC4UJM_204716_W_high.paas.oracle.com)))",
    poolMin: 1, poolMax: 2, poolAlias: "tmp"
});
const c = await pool.getConnection();

// 1) Owner das tabelas
const r1 = await c.execute(
    "SELECT OWNER, TABLE_NAME FROM ALL_TABLES WHERE TABLE_NAME IN ('PCLANC','PCNFENT','PCFORNEC') ORDER BY TABLE_NAME",
    {}, { outFormat: oracledb.OUT_FORMAT_OBJECT }
);
console.log("=== OWNERS ===");
r1.rows.forEach(x => console.log(JSON.stringify(x)));

// 2) Sinônimos disponíveis
const r2 = await c.execute(
    "SELECT SYNONYM_NAME, TABLE_OWNER, TABLE_NAME FROM ALL_SYNONYMS WHERE SYNONYM_NAME IN ('PCLANC','PCNFENT','PCFORNEC')",
    {}, { outFormat: oracledb.OUT_FORMAT_OBJECT }
);
console.log("\n=== SINÔNIMOS ===");
r2.rows.forEach(x => console.log(JSON.stringify(x)));

// 3) Tentar acesso direto
for (const tbl of ["PCLANC", "PCNFENT", "PCFORNEC"]) {
    try {
        const rt = await c.execute(`SELECT COUNT(*) CNT FROM ${tbl}`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
        console.log(`\n${tbl}: ${rt.rows[0].CNT} linhas`);
    } catch(e) {
        console.log(`\n${tbl}: ERRO - ${e.message.split('\n')[0]}`);
    }
}

await c.close();
await pool.close(0);
