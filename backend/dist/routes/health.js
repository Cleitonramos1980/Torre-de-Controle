import { executeOracle, isOracleEnabled } from "../db/oracle.js";
import { getObservabilitySnapshot } from "../utils/observability.js";
export async function healthRoutes(app) {
    app.get("/api/health", async () => ({
        status: "OK",
        oracle: isOracleEnabled() ? "configured" : "not-configured",
        oracleChecked: false,
    }));
    app.get("/api/health/oracle", async () => {
        if (!isOracleEnabled())
            return { status: "SKIPPED", detail: "Oracle não configurado" };
        const result = await executeOracle("SELECT 'OK' AS STATUS FROM DUAL");
        const row = result.rows?.[0];
        return { status: row?.STATUS ?? "OK" };
    });
    app.get("/api/metrics", async () => getObservabilitySnapshot());
    app.get("/api/health/columns/:table", async (req) => {
        if (!isOracleEnabled()) return { error: "Oracle não configurado" };
        const result = await executeOracle(
            `SELECT COLUMN_NAME FROM USER_TAB_COLUMNS WHERE TABLE_NAME = :tbl ORDER BY COLUMN_ID`,
            [req.params.table.toUpperCase()]
        );
        return { table: req.params.table.toUpperCase(), columns: result.rows?.map(r => r.COLUMN_NAME) ?? [] };
    });
}
