import oracledb from "oracledb";
import { env, getOracleConnectString, hasOracleConfig } from "../config/env.js";
let initialized = false;
export async function initOraclePool() {
    if (initialized)
        return;
    if (!hasOracleConfig())
        return;
    oracledb.fetchAsString = [oracledb.CLOB];
    await oracledb.createPool({
        user: env.ORACLE_USER,
        password: env.ORACLE_PASSWORD,
        connectString: getOracleConnectString(),
        poolAlias: env.ORACLE_POOL_ALIAS,
        poolMin: env.ORACLE_POOL_MIN,
        poolMax: env.ORACLE_POOL_MAX,
        poolIncrement: env.ORACLE_POOL_INCREMENT,
        stmtCacheSize: env.ORACLE_STMT_CACHE_SIZE,
        queueTimeout: env.ORACLE_QUEUE_TIMEOUT_MS,
    });
    initialized = true;
}
export function isOracleEnabled() {
    return hasOracleConfig();
}
export async function closeOraclePool() {
    if (!initialized)
        return;
    await oracledb.getPool(env.ORACLE_POOL_ALIAS).close(10);
    initialized = false;
}
export async function executeOracle(sql, binds = {}) {
    const pool = oracledb.getPool(env.ORACLE_POOL_ALIAS);
    const connection = await pool.getConnection();
    try {
        return (await connection.execute(sql, binds, {
            outFormat: oracledb.OUT_FORMAT_OBJECT,
            autoCommit: true,
        }));
    }
    finally {
        await connection.close();
    }
}
export async function runOracleTransaction(handler) {
    const pool = oracledb.getPool(env.ORACLE_POOL_ALIAS);
    const connection = await pool.getConnection();
    try {
        const result = await handler(connection, oracledb);
        await connection.commit();
        return result;
    }
    catch (error) {
        try {
            await connection.rollback();
        }
        catch {
            // Ignora falha no rollback para propagar erro original.
        }
        throw error;
    }
    finally {
        await connection.close();
    }
}
