import { z } from "zod";
const paramsSchema = z.object({
    id: z.string().trim().min(1),
});
const itemParamsSchema = z.object({
    id: z.string().trim().min(1),
    itemId: z.string().trim().min(1),
});
const listQuerySchema = z.object({
    status: z.string().trim().optional(),
    filial: z.string().trim().optional(),
    cnpj: z.string().trim().optional(),
    periodoInicio: z.string().trim().optional(),
    periodoFim: z.string().trim().optional(),
    dataPagamento: z.string().trim().optional(),
    valorMin: z.coerce.number().optional(),
    valorMax: z.coerce.number().optional(),
    scoreMin: z.coerce.number().optional(),
    banco: z.string().trim().optional(),
    tipoDivergencia: z.string().trim().optional(),
    somenteDivergencias: z.union([z.boolean(), z.string()]).optional(),
    colLinha: z.string().trim().optional(),
    colCnpjRede: z.string().trim().optional(),
    colFilialWinthor: z.string().trim().optional(),
    colFilialRede: z.string().trim().optional(),
    colDataRede: z.string().trim().optional(),
    colDataWinthor: z.string().trim().optional(),
    colStatusData: z.string().trim().optional(),
    colValorRede: z.string().trim().optional(),
    colValorWinthor: z.string().trim().optional(),
    colDiferenca: z.string().trim().optional(),
    colStatusValor: z.string().trim().optional(),
    colNsuRede: z.string().trim().optional(),
    colNsuSistema: z.string().trim().optional(),
    colDocumentoRede: z.string().trim().optional(),
    colDuplicata: z.string().trim().optional(),
    colPrestacao: z.string().trim().optional(),
    colPedido: z.string().trim().optional(),
    colNota: z.string().trim().optional(),
    colBanco: z.string().trim().optional(),
    colStatusTitulo: z.string().trim().optional(),
    colDtEmissao: z.string().trim().optional(),
    colDtVenc: z.string().trim().optional(),
    colValorAberto: z.string().trim().optional(),
    colParcelasVenda: z.string().trim().optional(),
    colTotalVenda: z.string().trim().optional(),
    colTotalAberto: z.string().trim().optional(),
    colStatusBanco: z.string().trim().optional(),
    colScore: z.string().trim().optional(),
    colStatusGeral: z.string().trim().optional(),
    colMotivo: z.string().trim().optional(),
    columnFilters: z.string().trim().optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(200).optional(),
});
const unmatchedQuerySchema = z.object({
    filial: z.string().trim().optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(200).optional(),
});
const historyQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
});
const exportQuerySchema = z.object({
    format: z.enum(["csv", "xlsx"]).optional(),
    scope: z.enum(["all", "divergencias", "rede-nao-encontradas", "winthor-nao-encontradas", "valor", "data", "filial"]).optional(),
});
const manualBodySchema = z.object({
    reason: z.string().trim().optional(),
});
const settlementCandidatesQuerySchema = z.object({
    apenasNaoConfirmados: z.union([z.boolean(), z.string()]).optional(),
    filial: z.string().trim().optional(),
    includeExplainability: z.union([z.boolean(), z.string()]).optional(),
});
const settlementConfirmBodySchema = z.object({
    itemIds: z.array(z.string().trim().min(1)).min(1),
});
const settlementExecutionBodySchema = z.object({
    itemIds: z.array(z.string().trim().min(1)).optional(),
    strictMode: z.union([z.boolean(), z.string()]).optional(),
});
const reprocessBodySchema = z.object({
    asyncMode: z.union([z.boolean(), z.string()]).optional(),
    waitTimeoutMs: z.coerce.number().int().min(1000).max(900000).optional(),
});
const logsQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(1000).optional(),
});
const reprocessJobParamsSchema = z.object({
    id: z.string().trim().min(1),
    jobId: z.string().trim().min(1),
});
const linksQuerySchema = z.object({
    adquirente: z.string().trim().optional(),
    ativo: z.union([z.boolean(), z.string()]).optional(),
});
const linkBodySchema = z.object({
    empresa_id: z.string().trim().optional(),
    filial_id: z.string().trim().optional(),
    filial_codigo: z.string().trim().min(1),
    regional: z.string().trim().optional(),
    nome_filial: z.string().trim().optional(),
    adquirente: z.string().trim().optional(),
    codigo_estabelecimento: z.string().trim().min(1),
    nome_estabelecimento: z.string().trim().optional(),
    nome_maquininha: z.string().trim().optional(),
    numero_maquininha: z.string().trim().optional(),
    situacao: z.string().trim().optional(),
    quantidade_maquininhas: z.coerce.number().int().min(0).optional(),
    cnpj_filial: z.string().trim().optional(),
    ativo: z.coerce.boolean().optional(),
    origem_importacao: z.string().trim().optional(),
});
function readMultipartField(file, name) {
    const field = file?.fields?.[name];
    if (!field)
        return undefined;
    if (Array.isArray(field))
        return field[0]?.value;
    return field.value;
}
function toAtivoFlag(value) {
    if (value == null)
        return undefined;
    if (typeof value === "boolean")
        return value;
    return String(value).trim().toLowerCase() !== "false";
}
function toBooleanFlag(value, defaultValue = false) {
    if (value == null)
        return defaultValue;
    if (typeof value === "boolean")
        return value;
    const normalized = String(value).trim().toLowerCase();
    if (normalized === "")
        return defaultValue;
    return normalized !== "false" && normalized !== "0" && normalized !== "nao" && normalized !== "no";
}
async function readMultipartFiles(req) {
    const parts = req.parts();
    let maquininhaFileName = null;
    let maquininhaBuffer = null;
    let cnpjFileName = null;
    let cnpjBuffer = null;
    for await (const part of parts) {
        if (part.type !== "file")
            continue;
        const chunks = [];
        for await (const chunk of part.file) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const buffer = Buffer.concat(chunks);
        const fieldName = String(part.fieldname ?? "").trim().toLowerCase();
        if (fieldName === "cnpjfile" || fieldName === "cnpj") {
            cnpjFileName = part.filename ?? "cnpj-filiais.xlsx";
            cnpjBuffer = buffer;
            continue;
        }
        if (!maquininhaBuffer) {
            maquininhaFileName = part.filename ?? "maquininha-filiais.xlsx";
            maquininhaBuffer = buffer;
        }
    }
    return {
        maquininhaFileName,
        maquininhaBuffer,
        cnpjFileName,
        cnpjBuffer,
    };
}
export async function registerCardReceivableSettlementRoutes(app, service) {
    app.post("/api/recebiveis-cartao/conciliado-cartao/upload", async (req, reply) => {
        const file = await req.file();
        if (!file) {
            return reply.status(400).send({
                error: { message: "Arquivo obrigatorio para conciliado cartao." },
            });
        }
        const chunks = [];
        for await (const chunk of file.file) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const buffer = Buffer.concat(chunks);
        const result = await service.processUpload({
            fileName: file.filename || "recebimentos-rede.xlsx",
            buffer,
            uploadedBy: req.authUser?.nome || req.authUser?.email || "system",
            tenantId: req.authUser?.tenantId || "default",
            tolerances: {
                tolerancia_valor_reais: readMultipartField(file, "tolerancia_valor_reais"),
                tolerancia_valor_percentual: readMultipartField(file, "tolerancia_valor_percentual"),
                tolerancia_dias_pagamento: readMultipartField(file, "tolerancia_dias_pagamento"),
                considerar_valor_aproximado: readMultipartField(file, "considerar_valor_aproximado"),
                considerar_data_proxima: readMultipartField(file, "considerar_data_proxima"),
            },
        });
        return reply.send(result);
    });
    app.get("/api/recebiveis-cartao/conciliado-cartao/history", async (req) => {
        const query = historyQuerySchema.parse(req.query ?? {});
        return service.getHistory(query.limit);
    });
    app.get("/api/recebiveis-cartao/conciliado-cartao/:id", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        return service.getDetails(id);
    });
    app.get("/api/recebiveis-cartao/conciliado-cartao/:id/items", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        const query = listQuerySchema.parse(req.query ?? {});
        return service.getItems(id, query);
    });
    app.get("/api/recebiveis-cartao/conciliado-cartao/:id/baixa-automatica/candidatos", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        const query = settlementCandidatesQuerySchema.parse(req.query ?? {});
        return service.getSettlementCandidates(id, {
            onlyUnconfirmed: toBooleanFlag(query.apenasNaoConfirmados, true),
            filial: query.filial,
            includeExplainability: toBooleanFlag(query.includeExplainability, true),
        });
    });
    app.post("/api/recebiveis-cartao/conciliado-cartao/:id/baixa-automatica/confirmar", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        const body = settlementConfirmBodySchema.parse(req.body ?? {});
        return service.confirmSettlementCandidates(id, body.itemIds, {
            userId: String(req.authUser?.sub ?? "system"),
            userName: String(req.authUser?.nome ?? req.authUser?.email ?? "system"),
            perfil: String(req.authUser?.perfil ?? "SEM_PERFIL"),
        });
    });
    app.post("/api/recebiveis-cartao/conciliado-cartao/:id/baixa-automatica/simular", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        const body = settlementExecutionBodySchema.parse(req.body ?? {});
        return service.simulateSettlementExecution(id, {
            itemIds: body.itemIds ?? [],
            strictMode: toBooleanFlag(body.strictMode, true),
        }, {
            userId: String(req.authUser?.sub ?? "system"),
            userName: String(req.authUser?.nome ?? req.authUser?.email ?? "system"),
            perfil: String(req.authUser?.perfil ?? "SEM_PERFIL"),
        });
    });
    app.post("/api/recebiveis-cartao/conciliado-cartao/:id/baixa-automatica/executar", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        const body = settlementExecutionBodySchema.parse(req.body ?? {});
        return service.executeSettlement(id, {
            itemIds: body.itemIds ?? [],
            strictMode: toBooleanFlag(body.strictMode, true),
        }, {
            userId: String(req.authUser?.sub ?? "system"),
            userName: String(req.authUser?.nome ?? req.authUser?.email ?? "system"),
            perfil: String(req.authUser?.perfil ?? "SEM_PERFIL"),
        });
    });
    app.get("/api/recebiveis-cartao/conciliado-cartao/:id/items/filter-options", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        return service.getItemFilterOptions(id);
    });
    app.get("/api/recebiveis-cartao/conciliado-cartao/:id/items/:itemId/titles", async (req) => {
        const { id, itemId } = itemParamsSchema.parse(req.params);
        return service.getItemTitles(id, itemId);
    });
    app.get("/api/recebiveis-cartao/conciliado-cartao/:id/unmatched-winthor", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        const query = unmatchedQuerySchema.parse(req.query ?? {});
        return service.getWinthorUnmatched(id, query);
    });
    app.get("/api/recebiveis-cartao/conciliado-cartao/:id/summary", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        return service.getSummary(id);
    });
    app.get("/api/recebiveis-cartao/conciliado-cartao/:id/pendencias", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        return service.getPendencias(id);
    });
    app.post("/api/recebiveis-cartao/conciliado-cartao/:id/reprocess", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        const body = reprocessBodySchema.parse(req.body ?? {});
        return service.reprocess(id, {
            asyncMode: toBooleanFlag(body.asyncMode, false),
            waitTimeoutMs: body.waitTimeoutMs,
            actor: {
                userId: String(req.authUser?.sub ?? "system"),
                userName: String(req.authUser?.nome ?? req.authUser?.email ?? "system"),
                perfil: String(req.authUser?.perfil ?? "SEM_PERFIL"),
            },
        });
    });
    app.get("/api/recebiveis-cartao/conciliado-cartao/:id/reprocess/jobs", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        return service.listReprocessJobs(id);
    });
    app.get("/api/recebiveis-cartao/conciliado-cartao/:id/reprocess/jobs/:jobId", async (req) => {
        const { id, jobId } = reprocessJobParamsSchema.parse(req.params);
        return service.getReprocessJob(id, jobId);
    });
    app.post("/api/recebiveis-cartao/conciliado-cartao/:id/items/:itemId/manual", async (req) => {
        const { id, itemId } = itemParamsSchema.parse(req.params);
        const body = manualBodySchema.parse(req.body ?? {});
        return service.markItemManual(id, itemId, body.reason ?? "");
    });
    app.get("/api/recebiveis-cartao/conciliado-cartao/:id/export", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        const query = exportQuerySchema.parse(req.query ?? {});
        return service.exportBatch(id, query.format ?? "xlsx", query.scope ?? "all");
    });
    app.get("/api/recebiveis-cartao/conciliado-cartao/:id/telemetria", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        return service.getOperationalTelemetry(id);
    });
    app.get("/api/recebiveis-cartao/conciliado-cartao/:id/logs", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        const query = logsQuerySchema.parse(req.query ?? {});
        return service.listActionLogs(id, query.limit ?? 200);
    });
    app.get("/api/recebiveis-cartao/conciliado-cartao/filial-estabelecimentos", async (req) => {
        const query = linksQuerySchema.parse(req.query ?? {});
        return service.listFilialEstabelecimentoLinks({
            tenantId: req.authUser?.tenantId ?? "default",
            adquirente: query.adquirente ?? "REDE",
            ativo: toAtivoFlag(query.ativo),
        });
    });
    app.post("/api/recebiveis-cartao/conciliado-cartao/filial-estabelecimentos", async (req) => {
        const body = linkBodySchema.parse(req.body ?? {});
        return service.upsertFilialEstabelecimentoLink({
            ...body,
            tenant_id: req.authUser?.tenantId ?? "default",
            adquirente: body.adquirente ?? "REDE",
        });
    });
    app.put("/api/recebiveis-cartao/conciliado-cartao/filial-estabelecimentos/:id", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        const body = linkBodySchema.partial().parse(req.body ?? {});
        return service.updateFilialEstabelecimentoLink(id, body);
    });
    app.post("/api/recebiveis-cartao/conciliado-cartao/filial-estabelecimentos/:id/inativar", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        return service.updateFilialEstabelecimentoLink(id, { ativo: false });
    });
    app.post("/api/recebiveis-cartao/conciliado-cartao/filial-estabelecimentos/:id/ativar", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        return service.updateFilialEstabelecimentoLink(id, { ativo: true });
    });
    app.post("/api/recebiveis-cartao/conciliado-cartao/filial-estabelecimentos/import", async (req, reply) => {
        const files = await readMultipartFiles(req);
        if (!files.maquininhaBuffer || !files.maquininhaFileName) {
            return reply.status(400).send({
                error: { message: "Arquivo de maquininhas obrigatorio para importacao dos vinculos." },
            });
        }
        return service.importFilialEstabelecimentoLinks({
            tenantId: req.authUser?.tenantId ?? "default",
            maquininhaFileName: files.maquininhaFileName,
            maquininhaBuffer: files.maquininhaBuffer,
            cnpjFileName: files.cnpjFileName,
            cnpjBuffer: files.cnpjBuffer,
        });
    });
}
