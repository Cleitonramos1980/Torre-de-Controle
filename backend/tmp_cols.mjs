import oracledb from "oracledb";
import { readFileSync } from "node:fs";

const env = readFileSync("C:/TorreControle/.env", "utf8");
const getEnv = (k) => env.match(new RegExp(`^${k}=(.+)`, "m"))?.[1]?.trim() ?? "";

const pool = await oracledb.createPool({
    user: getEnv("ORACLE_USER"), password: getEnv("ORACLE_PASSWORD"),
    connectString: getEnv("ORACLE_CONNECT_STRING"),
    poolMin:1, poolMax:2, poolIncrement:1, poolAlias:"chkPool"
});

const conn = await pool.getConnection();

async function getCols(table) {
    const r = await conn.execute(
        `SELECT COLUMN_NAME FROM ALL_TAB_COLUMNS WHERE TABLE_NAME = :t ORDER BY COLUMN_ID`,
        [table], {outFormat: oracledb.OUT_FORMAT_OBJECT}
    );
    return r.rows.map(x => x.COLUMN_NAME);
}

console.log("PCLANC columns:", (await getCols("PCLANC")).join(", "));
console.log("PCNFENT columns:", (await getCols("PCNFENT")).join(", "));
console.log("PCFORNEC cols (first 20):", (await getCols("PCFORNEC")).slice(0,20).join(", "));

await conn.close();
await pool.close();
