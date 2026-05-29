import oracledb from "oracledb";
import { env, hasOracleConfig } from "../../config/env.js";
import { initOraclePool } from "../../db/oracle.js";
import { AppError } from "../../utils/error.js";
function toIso(value) {
    if (!value)
        return null;
    const parsed = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(parsed.getTime()))
        return null;
    return parsed.toISOString();
}
function toStartOfDay(input) {
    return new Date(`${input}T00:00:00.000Z`);
}
function toEndOfDay(input) {
    return new Date(`${input}T23:59:59.999Z`);
}
export class WinThorService {
    logger;
    constructor(logger) {
        this.logger = logger;
    }
    async ensurePool() {
        if (!hasOracleConfig()) {
            throw new AppError("Oracle WinThor nao configurado. Verifique ORACLE_USER/ORACLE_PASSWORD/ORACLE_CONNECT_STRING.", 503);
        }
        await initOraclePool();
    }
    async executeQuery(sql, binds = {}) {
        await this.ensurePool();
        const startedAt = Date.now();
        let connection;
        try {
            const pool = oracledb.getPool(env.ORACLE_POOL_ALIAS);
            connection = await pool.getConnection();
            const result = await connection.execute(sql, binds, {
                outFormat: oracledb.OUT_FORMAT_OBJECT,
            });
            this.logger.info({
                component: "WinThorService",
                action: "executeQuery",
                durationMs: Date.now() - startedAt,
                rows: result.rows?.length ?? 0,
            }, "WinThor query executed");
            return result.rows ?? [];
        }
        catch (error) {
            this.logger.error({
                component: "WinThorService",
                action: "executeQuery",
                durationMs: Date.now() - startedAt,
                error,
                binds,
            }, "WinThor query failed");
            throw new AppError("Falha ao executar consulta no Oracle WinThor.", 502);
        }
        finally {
            if (connection) {
                try {
                    await connection.close();
                }
                catch (closeError) {
                    this.logger.warn({
                        component: "WinThorService",
                        action: "connection.close",
                        error: closeError,
                    }, "WinThor connection close failed");
                }
            }
        }
    }
    async health() {
        try {
            await this.executeQuery("SELECT 1 AS STATUS FROM DUAL");
            return { status: "UP", detail: "Oracle WinThor conectado." };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Falha desconhecida.";
            return { status: "DOWN", detail: message };
        }
    }
    async getReceivables(dataInicio, dataFim) {
        if (!dataInicio || !dataFim) {
            throw new AppError("dataInicio e dataFim sao obrigatorios.", 400);
        }
        const rows = await this.executeQuery(`SELECT
          P.CODCLI,
          C.CLIENTE,
          C.CGCENT AS DOCUMENTO,

          P.DUPLIC,
          P.PREST,

          P.NUMNOTA,
          P.NUMPED,

          P.DTEMISSAO,
          P.DTVENC,
          P.DTPAG,

          P.VALOR AS VALOR_ORIGINAL,
          P.VALORPAGO,
          (P.VALOR - NVL(P.VALORPAGO,0)) AS VALOR_ABERTO,

          P.CODCOB,
          COB.COBRANCA,

          CASE
              WHEN P.DTPAG IS NULL THEN 'EM_ABERTO'
              WHEN P.VALORPAGO < P.VALOR THEN 'PARCIAL'
              ELSE 'PAGO'
          END AS STATUS_TITULO

      FROM PCPREST P
      LEFT JOIN PCCLIENT C ON P.CODCLI = C.CODCLI
      LEFT JOIN PCCOB COB ON P.CODCOB = COB.CODCOB

      WHERE P.DTEMISSAO BETWEEN :data_inicio AND :data_fim`, {
            data_inicio: toStartOfDay(dataInicio),
            data_fim: toEndOfDay(dataFim),
        });
        return rows.map((row) => ({
            codcli: row.CODCLI ?? null,
            cliente: row.CLIENTE ?? null,
            documento: row.DOCUMENTO ?? null,
            duplic: row.DUPLIC ?? null,
            prest: row.PREST ?? null,
            numnota: row.NUMNOTA ?? null,
            numped: row.NUMPED ?? null,
            dtemissao: toIso(row.DTEMISSAO),
            dtvenc: toIso(row.DTVENC),
            dtpag: toIso(row.DTPAG),
            valorOriginal: row.VALOR_ORIGINAL ?? null,
            valorPago: row.VALORPAGO ?? null,
            valorAberto: row.VALOR_ABERTO ?? null,
            codcob: row.CODCOB ?? null,
            cobranca: row.COBRANCA ?? null,
            statusTitulo: row.STATUS_TITULO ?? "EM_ABERTO",
        }));
    }
}
