import { initOraclePool, executeOracle } from "./dist/db/oracle.js";
import oracledb from "oracledb";
async function main() {
    await initOraclePool();
    // Check column types for cert fields
    const cols = await executeOracle(
        `SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH FROM ALL_TAB_COLUMNS 
         WHERE TABLE_NAME = 'PCFILIAL' AND COLUMN_NAME IN ('CERTIFICADOA1','SENHACERTIFICADO','IDTOKENCERTIFICADOA1','TOKENCERTIFICADOA1')`,
        {}, { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log("Cert columns:", JSON.stringify(cols.rows));
    
    // Check length and preview of cert/senha for CODIGO=1
    const r = await executeOracle(
        `SELECT DBMS_LOB.GETLENGTH(CERTIFICADOA1) AS CERT_LEN, 
                LENGTH(SENHACERTIFICADO) AS SENHA_LEN,
                SENHACERTIFICADO,
                IDTOKENCERTIFICADOA1,
                SUBSTR(TOKENCERTIFICADOA1, 1, 50) AS TOKEN_PREVIEW
         FROM PCFILIAL WHERE CODIGO = '1'`,
        {}, { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    console.log("Cert info:", JSON.stringify(r.rows));
    
    process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
