import { closeOraclePool, initOraclePool, isOracleEnabled } from "../db/oracle.js";
import { ensureInspecoesTables } from "../repositories/inspecoes/initTables.js";
import { ensureInventarioTables } from "../repositories/inventario/initTables.js";
import { initPersistentCollections } from "../repositories/persistentCollectionStore.js";
import { ensureReconaiTables } from "../repositories/reconai/initTables.js";
import { ensureSesmtTables } from "../repositories/sesmt/initTables.js";
async function runMigrations() {
    if (!isOracleEnabled()) {
        throw new Error("Oracle/WinThor nao configurado. Defina ORACLE_USER, ORACLE_PASSWORD e ORACLE_CONNECT_STRING antes de rodar migracoes.");
    }
    await initOraclePool();
    const warnings = [];
    async function runStep(step, fn) {
        try {
            await fn();
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            warnings.push({ step, message });
        }
    }
    await runStep("ensureInspecoesTables", ensureInspecoesTables);
    await runStep("ensureInventarioTables", ensureInventarioTables);
    await runStep("ensureSesmtTables", ensureSesmtTables);
    await runStep("ensureReconaiTables", ensureReconaiTables);
    await runStep("initPersistentCollections", initPersistentCollections);
    if (warnings.length > 0) {
        console.log("[migrate] Finalizado com ressalvas:");
        for (const warning of warnings) {
            console.log(`- ${warning.step}: ${warning.message}`);
        }
    }
}
runMigrations()
    .then(async () => {
    console.log("[migrate] Estruturas Oracle verificadas com sucesso.");
    await closeOraclePool();
    process.exit(0);
})
    .catch(async (error) => {
    console.error("[migrate] Falha ao executar migracoes:", error);
    try {
        await closeOraclePool();
    }
    catch {
        // noop
    }
    process.exit(1);
});
