import { z } from "zod";
import { WinThorService } from "../modules/reconai/winthorService.js";
import { WinthorCardReceivablesService } from "../modules/reconai/winthorCardReceivablesService.js";
function defaultDateRange() {
    const today = new Date();
    const end = today.toISOString().slice(0, 10);
    const startDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const start = startDate.toISOString().slice(0, 10);
    return { dataInicio: start, dataFim: end };
}
export async function winthorRoutes(app) {
    const service = new WinThorService(app.log);
    const cardService = new WinthorCardReceivablesService(app.log);
    const querySchema = z.object({
        dataInicio: z.string().trim().optional(),
        dataFim: z.string().trim().optional(),
    });
    const faturadasQuerySchema = z.object({
        dataInicio: z.string().trim().optional(),
        dataFim: z.string().trim().optional(),
        somenteConfigCartao: z.coerce.boolean().optional(),
    });
    const upsertCobrancaSchema = z.object({
        codcob: z.string().trim().min(1).max(4),
        descricaoCobranca: z.string().trim().min(1).max(120),
        tipoCartao: z.enum(["CREDITO", "DEBITO", "PARCELADO", "POS_TEF", "OUTROS"]).optional(),
        ativo: z.coerce.boolean().optional(),
        adquirentePadrao: z.string().trim().max(80).optional(),
        bandeiraPadrao: z.string().trim().max(60).optional(),
        taxaPctPadrao: z.coerce.number().min(0).max(100).optional(),
        diasRecPadrao: z.coerce.number().int().min(0).max(365).optional(),
    });
    const upsertPlanSchema = z.object({
        codplpag: z.coerce.number().int().min(0).max(9999),
        descricaoPlano: z.string().trim().min(1).max(120),
        qtdParcelas: z.coerce.number().int().min(1).max(36),
        diasPrimParc: z.coerce.number().int().min(0).max(365),
        intervaloDias: z.coerce.number().int().min(0).max(365),
        taxaPctPadrao: z.coerce.number().min(0).max(100).optional(),
        ativo: z.coerce.boolean().optional(),
    });
    app.get("/api/winthor/health", async (_req, reply) => {
        const result = await service.health();
        if (result.status === "DOWN") {
            return reply.status(503).send(result);
        }
        return result;
    });
    app.get("/api/winthor/receivables", async (req) => {
        const query = querySchema.parse(req.query);
        const defaults = defaultDateRange();
        const dataInicio = query.dataInicio || defaults.dataInicio;
        const dataFim = query.dataFim || defaults.dataFim;
        const rows = await service.getReceivables(dataInicio, dataFim);
        return {
            dataInicio,
            dataFim,
            total: rows.length,
            rows,
        };
    });
    app.get("/api/winthor/cartao/schema", async () => {
        return cardService.inspectSchema();
    });
    app.get("/api/winthor/cartao/vendas-faturadas", async (req) => {
        const query = faturadasQuerySchema.parse(req.query);
        const defaults = defaultDateRange();
        const dataInicio = query.dataInicio || defaults.dataInicio;
        const dataFim = query.dataFim || defaults.dataFim;
        return cardService.getVendasFaturadasCartao(dataInicio, dataFim, Boolean(query.somenteConfigCartao));
    });
    app.get("/api/winthor/cartao/config/cobrancas", async () => {
        return cardService.listCobrancaConfig();
    });
    app.post("/api/winthor/cartao/config/cobrancas/bootstrap", async () => {
        return cardService.bootstrapCobrancaConfig();
    });
    app.put("/api/winthor/cartao/config/cobrancas/:codcob", async (req) => {
        const params = z.object({ codcob: z.string().trim().min(1).max(4) }).parse(req.params);
        const body = upsertCobrancaSchema.parse({
            ...(req.body ?? {}),
            codcob: params.codcob,
        });
        return cardService.upsertCobrancaConfig(body);
    });
    app.get("/api/winthor/cartao/config/planos", async () => {
        return cardService.listPlanConfig();
    });
    app.post("/api/winthor/cartao/config/planos/bootstrap", async () => {
        return cardService.bootstrapPlanConfig();
    });
    app.put("/api/winthor/cartao/config/planos/:codplpag", async (req) => {
        const params = z.object({ codplpag: z.coerce.number().int().min(0).max(9999) }).parse(req.params);
        const body = upsertPlanSchema.parse({
            ...(req.body ?? {}),
            codplpag: params.codplpag,
        });
        return cardService.upsertPlanConfig(body);
    });
    app.post("/api/winthor/cartao/recebiveis/gerar", async (req) => {
        const query = querySchema.parse(req.body ?? {});
        const defaults = defaultDateRange();
        const dataInicio = query.dataInicio || defaults.dataInicio;
        const dataFim = query.dataFim || defaults.dataFim;
        return cardService.gerarAgendaRecebiveisCartao(dataInicio, dataFim);
    });
    app.get("/api/winthor/cartao/recebiveis", async (req) => {
        const query = querySchema.parse(req.query);
        return cardService.listAgendaRecebiveis(query.dataInicio, query.dataFim);
    });
    app.get("/api/winthor/cartao/inconsistencias", async (req) => {
        const query = querySchema.parse(req.query);
        const defaults = defaultDateRange();
        const dataInicio = query.dataInicio || defaults.dataInicio;
        const dataFim = query.dataFim || defaults.dataFim;
        return cardService.getInconsistencias(dataInicio, dataFim);
    });
}
