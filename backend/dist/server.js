import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { randomUUID } from "node:crypto";
import { env } from "./config/env.js";
import { initOraclePool, closeOraclePool } from "./db/oracle.js";
import { setErrorHandler } from "./utils/error.js";
import { healthRoutes } from "./routes/health.js";
import { erpRoutes } from "./routes/erp.js";
import { adminRoutes } from "./routes/admin.js";
import { sacRoutes } from "./routes/sac.js";
import { sacReqRoutes } from "./routes/sacRequisicoes.js";
import { sacAvaliacoesRoutes } from "./routes/sacAvaliacoes.js";
import { qualidadeRoutes } from "./routes/qualidade.js";
import { auditoriasRoutes } from "./routes/auditorias.js";
import { assistenciaRoutes } from "./routes/assistencia.js";
import { governancaQualidadeRoutes } from "./routes/governancaQualidade.js";
import { authRoutes } from "./routes/auth.js";
import { uxMetricsRoutes } from "./routes/uxMetrics.js";
import { inventarioRoutes } from "./routes/inventario.js";
import { operacionalRoutes } from "./routes/operacional.js";
import { torreAgendaCustodiaRoutes } from "./routes/torreAgendaCustodia.js";
import { portariaSaidaFuncionarioRoutes } from "./routes/portariaSaidaFuncionario.js";
import { inspecoesRoutes } from "./routes/inspecoes.js";
import { sesmtRoutes } from "./routes/sesmt.js";
import { assistenciaTerceirizadaRoutes } from "./routes/assistenciaTerceirizada.js";
import { recebiveisCartaoRoutes } from "./routes/recebiveisCartao.js";
import { financeiroTiRoutes } from "./routes/financeiroTi.js";
import { redeRoutes } from "./routes/rede.js";
import { winthorRoutes } from "./routes/winthor.js";
import { aiRoutes } from "./routes/ai.js";
import { automationRoutes } from "./routes/automation.js";
import { fiscalRoutes } from "./routes/fiscal.js";
import { fiscalRadarRoutes, ensureFiscalRadarTables } from "./routes/fiscalRadar.js";
import { nfseNacionalRoutes, ensureNfseTables } from "./routes/nfseNacional.js";
import { redeRelatorioRoutes } from "./routes/redeRelatorio.js";
import { agendarDownloadDiario } from "./services/redePortalScraper.js";
import { monitoramentoRoutes } from "./routes/monitoramento.js";
import { checklistPortariaRoutes } from "./routes/checklistPortaria.js";
import { engenhariaRoutes, runPreventivosJob } from "./routes/engenharia.js";
import { ensureEngenhariaTables } from "./repositories/engenharia/initTables.js";
import { initPersistentCollections, persistAllCollections, } from "./repositories/persistentCollectionStore.js";
import { verifyAuthToken } from "./utils/jwt.js";
import { trackHttpRequestMetric } from "./utils/observability.js";
import { db } from "./repositories/dataStore.js";
import { persistCollection } from "./repositories/persistentCollectionStore.js";
import { seedInventarioData, seedOperacionalData } from "./repositories/seedData.js";
import { seedPhasesData } from "./repositories/seedPhases.js";
import { seedInspecoesData } from "./repositories/seedInspecoesData.js";
import { seedSesmtData } from "./repositories/seedSesmtData.js";
import { ensureInspecoesTables } from "./repositories/inspecoes/initTables.js";
import { isOracleEnabled } from "./db/oracle.js";
import { ensureInventarioTables } from "./repositories/inventario/initTables.js";
import { ensureSesmtTables } from "./repositories/sesmt/initTables.js";
import { ensureReconaiTables } from "./repositories/reconai/initTables.js";
import { seedFiscalCnpjsFromOracle } from "./repositories/seedFiscalCnpjs.js";
const app = Fastify({
    bodyLimit: 6 * 1024 * 1024,
    logger: {
        level: env.LOG_LEVEL,
    },
});
app.addHook("onRequest", async (request, reply) => {
    const incoming = request.headers["x-request-id"];
    const correlationId = typeof incoming === "string" && incoming.trim().length > 0
        ? incoming.trim()
        : randomUUID();
    request.correlationId = correlationId;
    request.startedAtMs = Date.now();
    reply.header("x-request-id", correlationId);
});
app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/api"))
        return;
    if (request.method === "OPTIONS")
        return;
    const path = request.url.split("?")[0];
    const publicPaths = new Set([
        "/api/health",
        "/api/health/oracle",
        "/api/auth/login",
        "/api/sac/avaliacoes/public",
        "/api/sac/avaliacoes/public/responder",
        "/api/portaria/saida-funcionario/qrcode-image",
        "/api/operacional/visitantes/walk-in",
    ]);
    const publicPathPrefixes = [
        "/api/operacional/solicitacoes-acesso/public/",
        "/api/health/columns/",
        "/api/engenharia/publica/",
        "/api/fiscal/nfse/pcfornec/",
        "/api/fiscal/nfse/pclanc/",
        "/api/fiscal/nfse/pcnfent/",
    ];
    if (publicPaths.has(path) || publicPathPrefixes.some((prefix) => path.startsWith(prefix)))
        return;
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        return reply.status(401).send({ error: { message: "Nao autenticado." } });
    }
    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
        return reply.status(401).send({ error: { message: "Token ausente." } });
    }
    try {
        const authUser = verifyAuthToken(token);
        request.authUser = authUser;
    }
    catch {
        return reply.status(401).send({ error: { message: "Token invalido ou expirado." } });
    }
});
app.addHook("onResponse", async (request, reply) => {
    const startedAtMs = Number(request.startedAtMs ?? Date.now());
    const durationMs = Date.now() - startedAtMs;
    const routePath = request.routeOptions?.url ??
        request.url.split("?")[0];
    trackHttpRequestMetric({
        method: request.method,
        route: routePath,
        statusCode: reply.statusCode,
        durationMs,
    });
    request.log.info({
        requestId: request.correlationId ?? request.id,
        method: request.method,
        route: routePath,
        statusCode: reply.statusCode,
        durationMs,
    }, "request completed");
    const mutationMethods = ["POST", "PUT", "PATCH", "DELETE"];
    const path = request.url.split("?")[0];
    const skipPersistPaths = new Set([
        "/api/metrics/ux",
        "/api/auth/login",
        "/api/health",
        "/api/health/oracle",
    ]);
    if (mutationMethods.includes(request.method) &&
        request.url.startsWith("/api") &&
        !skipPersistPaths.has(path)) {
        try {
            await persistAllCollections();
        }
        catch (error) {
            request.log.warn({ error, path }, "persistAllCollections failed in onResponse");
        }
    }
});
await app.register(cors, {
    origin: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-request-id"],
    exposedHeaders: ["x-request-id"],
});
await app.register(multipart, {
    limits: {
        files: env.UPLOAD_MAX_FILES,
        fileSize: env.UPLOAD_MAX_FILE_SIZE_MB * 1024 * 1024,
    },
});
setErrorHandler(app);
await healthRoutes(app);
await authRoutes(app);
await erpRoutes(app);
await adminRoutes(app);
await sacRoutes(app);
await sacReqRoutes(app);
await sacAvaliacoesRoutes(app);
await qualidadeRoutes(app);
await auditoriasRoutes(app);
await assistenciaRoutes(app);
await governancaQualidadeRoutes(app);
await uxMetricsRoutes(app);
await inventarioRoutes(app);
await operacionalRoutes(app);
await torreAgendaCustodiaRoutes(app);
await portariaSaidaFuncionarioRoutes(app);
await inspecoesRoutes(app);
await sesmtRoutes(app);
await assistenciaTerceirizadaRoutes(app);
await recebiveisCartaoRoutes(app);
await financeiroTiRoutes(app);
await redeRoutes(app);
await winthorRoutes(app);
await aiRoutes(app);
await automationRoutes(app);
await fiscalRoutes(app);
await fiscalRadarRoutes(app);
await nfseNacionalRoutes(app);
await monitoramentoRoutes(app);
await checklistPortariaRoutes(app);
await redeRelatorioRoutes(app);
await engenhariaRoutes(app);
async function start() {
    try {
        await initOraclePool();
    }
    catch (error) {
        app.log.warn({ error, component: "server", action: "initOraclePool" }, "Oracle indisponivel na inicializacao. Backend subira em modo degradado com fallback local.");
    }
    await initPersistentCollections();
    try {
        await ensureInspecoesTables();
    }
    catch (error) {
        app.log.warn({ error }, "ensureInspecoesTables failed; startup will continue");
    }
    try {
        await ensureInventarioTables();
    }
    catch (error) {
        app.log.warn({ error }, "ensureInventarioTables failed; startup will continue");
    }
    try {
        await ensureSesmtTables();
    }
    catch (error) {
        app.log.warn({ error }, "ensureSesmtTables failed; startup will continue");
    }
    try {
        await ensureReconaiTables();
    }
    catch (error) {
        app.log.warn({ error }, "ensureReconaiTables failed; startup will continue");
    }
    try {
        await ensureEngenhariaTables();
    }
    catch (error) {
        app.log.warn({ error }, "ensureEngenhariaTables failed; startup will continue");
    }
    try {
        await ensureNfseTables();
    }
    catch (error) {
        app.log.warn({ error }, "ensureNfseTables failed; startup will continue");
    }
    try {
        await ensureFiscalRadarTables();
    }
    catch (error) {
        app.log.warn({ error }, "ensureFiscalRadarTables failed; startup will continue");
    }
    // Seed operational and inventory data if empty
    seedInventarioData();
    seedOperacionalData();
    seedPhasesData();
    // Inspeções: when Oracle is enabled, data comes from real INS_* tables (imported via planilha script).
    // Only seed in-memory fallback when Oracle is NOT available (local dev).
    if (!isOracleEnabled()) {
        seedInspecoesData();
    }
    seedSesmtData();
    try {
        await seedFiscalCnpjsFromOracle();
    }
    catch (error) {
        app.log.warn({ error }, "seedFiscalCnpjsFromOracle failed; startup will continue");
    }
    // Job: geração automática de OS preventivas — roda imediatamente e a cada 24h
    runPreventivosJob().catch((err) => app.log.warn({ err }, "runPreventivosJob initial run failed"));
    setInterval(() => {
        runPreventivosJob().catch((err) => app.log.warn({ err }, "runPreventivosJob periodic run failed"));
    }, 24 * 60 * 60 * 1000);
    const seedUsers = [
        { nome: "Cleiton Ramos", email: "cleiton.ramos@hotmail.com", perfil: "ADMIN" },
        { nome: "Teste", email: "teste@admin.com", perfil: "ADMIN" },
        { nome: "Ana SESMT", email: "ana.sesmt@admin.com", perfil: "SESMT" },
        { nome: "Bruno Medico", email: "bruno.medico@admin.com", perfil: "MEDICO_TRABALHO" },
        { nome: "Carla Diretoria SST", email: "carla.sst@admin.com", perfil: "DIRETOR_EXECUTIVO_SST" },
    ];
    for (const su of seedUsers) {
        const exists = db.usuarios.some((u) => u.email.toLowerCase() === su.email.toLowerCase());
        if (!exists) {
            db.usuarios.push({
                id: `USR-${String(db.usuarios.length + 1).padStart(3, "0")}`,
                nome: su.nome,
                email: su.email,
                perfil: su.perfil,
                ativo: true,
            });
        }
    }
    await persistCollection("usuarios");
    await app.listen({ host: "0.0.0.0", port: env.PORT });
    const hora   = parseInt(process.env.REDE_PORTAL_CRON_HORA   || "8", 10);
    const minuto = parseInt(process.env.REDE_PORTAL_CRON_MINUTO || "5", 10);
    agendarDownloadDiario(hora, app.log, minuto);
}
start().catch((err) => {
    app.log.error(err);
    process.exit(1);
});
process.on("SIGINT", async () => {
    await persistAllCollections();
    await closeOraclePool();
    process.exit(0);
});
