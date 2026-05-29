import { closeOraclePool, executeOracle, initOraclePool, isOracleEnabled } from "../db/oracle.js";
const REQUIRED_TABLES = [
    "PCNFSAID",
    "PCPEDC",
    "PCCLIENT",
    "PCFORNEC",
    "PCFILIAL",
    "PCNFENT",
    "PCESTCOM",
    "PCPREST",
    "PCCOB",
    "PCPLPAG",
];
async function runOracleCheck() {
    if (!isOracleEnabled()) {
        throw new Error("Oracle/WinThor nao configurado. Defina ORACLE_USER, ORACLE_PASSWORD e ORACLE_CONNECT_STRING.");
    }
    await initOraclePool();
    const ping = await executeOracle("SELECT 'OK' AS STATUS FROM DUAL");
    const pingStatus = ping.rows?.[0]?.STATUS ?? "UNKNOWN";
    const placeholders = REQUIRED_TABLES.map((_, idx) => `:t${idx}`).join(", ");
    const binds = Object.fromEntries(REQUIRED_TABLES.map((table, idx) => [`t${idx}`, table]));
    const metadata = await executeOracle(`SELECT UPPER(TABLE_NAME) AS TABLE_NAME
       FROM ALL_TABLES
      WHERE UPPER(TABLE_NAME) IN (${placeholders})`, binds);
    const availableSet = new Set((metadata.rows ?? []).map((row) => (row.TABLE_NAME ?? "").toUpperCase()));
    const missingTables = REQUIRED_TABLES.filter((table) => !availableSet.has(table));
    const nfTransitoSample = await executeOracle(`SELECT COUNT(1) AS TOTAL
       FROM (
         SELECT 1
           FROM PCNFSAID
          WHERE ROWNUM <= 100
       )`);
    const sampleTotal = Number(nfTransitoSample.rows?.[0]?.TOTAL ?? 0);
    const result = {
        status: pingStatus,
        tablesChecked: REQUIRED_TABLES.length,
        tablesAvailable: REQUIRED_TABLES.length - missingTables.length,
        missingTables,
        sampleRows: sampleTotal,
        checkedAt: new Date().toISOString(),
    };
    if (missingTables.length > 0) {
        throw new Error(`Tabelas ausentes no schema Oracle: ${missingTables.join(", ")}. Resultado: ${JSON.stringify(result)}`);
    }
    console.log(JSON.stringify(result, null, 2));
}
runOracleCheck()
    .then(async () => {
    await closeOraclePool();
    process.exit(0);
})
    .catch(async (error) => {
    console.error("[oracle-check] Falha:", error);
    try {
        await closeOraclePool();
    }
    catch {
        // noop
    }
    process.exit(1);
});
