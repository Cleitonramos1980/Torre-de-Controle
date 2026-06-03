import { executeOracle, isOracleEnabled } from "../db/oracle.js";
import { getObservabilitySnapshot } from "../utils/observability.js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
const MODULE_FLAGS_PATH = join(process.cwd(), "config", "module-flags.json");
function readModuleFlags() {
    try {
        if (!existsSync(MODULE_FLAGS_PATH)) return {};
        let content = readFileSync(MODULE_FLAGS_PATH, "utf8");
        // Remove BOM se presente (PowerShell salva com BOM em UTF-8)
        if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
        return JSON.parse(content);
    } catch { return {}; }
}
function writeModuleFlags(flags) {
    writeFileSync(MODULE_FLAGS_PATH, JSON.stringify(flags, null, 2), "utf8");
}
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
    // GET /api/module-flags — retorna flags de manutenção por módulo (público)
    app.get("/api/module-flags", async () => {
        const flags = readModuleFlags();
        const status = {};
        for (const [key, val] of Object.entries(flags)) {
            status[key] = { ...val, maintenance: !!val.maintenance, enabled: val.enabled !== false };
        }
        return { flags: status, updatedAt: new Date().toISOString() };
    });
    // POST /api/module-flags/:moduleKey — ativa/desativa manutenção de um módulo (requer ADMIN)
    app.post("/api/module-flags/:moduleKey", async (req, reply) => {
        const { papel } = (req.authUser || {});
        if (papel !== "ADMIN") return reply.code(403).send({ error: "Requer papel ADMIN" });
        const { moduleKey } = req.params;
        const { maintenance, enabled } = req.body ?? {};
        const flags = readModuleFlags();
        if (!flags[moduleKey]) flags[moduleKey] = { enabled: true, label: moduleKey };
        if (typeof maintenance === "boolean") flags[moduleKey].maintenance = maintenance;
        if (typeof enabled === "boolean") flags[moduleKey].enabled = enabled;
        writeModuleFlags(flags);
        app.log.info({ moduleKey, maintenance, enabled }, "module-flags updated");
        return { ok: true, moduleKey, flags: flags[moduleKey] };
    });
    app.get("/api/health/columns/:table", async (req) => {
        if (!isOracleEnabled()) return { error: "Oracle não configurado" };
        const result = await executeOracle(
            `SELECT COLUMN_NAME FROM USER_TAB_COLUMNS WHERE TABLE_NAME = :tbl ORDER BY COLUMN_ID`,
            [req.params.table.toUpperCase()]
        );
        return { table: req.params.table.toUpperCase(), columns: result.rows?.map(r => r.COLUMN_NAME) ?? [] };
    });
}
