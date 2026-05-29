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
    valorMin: z.coerce.number().optional(),
    valorMax: z.coerce.number().optional(),
    scoreMin: z.coerce.number().optional(),
    somenteDivergencias: z.union([z.boolean(), z.string()]).optional(),
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
    scope: z.enum(["all", "divergencias", "rede-nao-encontradas", "sistema-nao-encontradas", "valor", "data", "nsu"]).optional(),
});
const manualBodySchema = z.object({
    reason: z.string().trim().optional(),
});
function readMultipartField(file, name) {
    const field = file?.fields?.[name];
    if (!field)
        return undefined;
    if (Array.isArray(field))
        return field[0]?.value;
    return field.value;
}
export async function registerRedeSalesValidationRoutes(app, service) {
    app.post("/api/recebiveis-cartao/rede-sales-validation/upload", async (req, reply) => {
        const file = await req.file();
        if (!file) {
            return reply.status(400).send({
                error: { message: "Arquivo obrigatorio para validacao de vendas REDE." },
            });
        }
        const chunks = [];
        for await (const chunk of file.file) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const buffer = Buffer.concat(chunks);
        const result = await service.processUpload({
            fileName: file.filename || "rede-sales.xlsx",
            buffer,
            uploadedBy: req.authUser?.nome || req.authUser?.email || "system",
            tenantId: req.authUser?.tenantId || "default",
            tolerances: {
                tolerancia_valor_reais: readMultipartField(file, "tolerancia_valor_reais"),
                tolerancia_valor_percentual: readMultipartField(file, "tolerancia_valor_percentual"),
                tolerancia_dias: readMultipartField(file, "tolerancia_dias"),
                considerar_data_proxima: readMultipartField(file, "considerar_data_proxima"),
                considerar_valor_aproximado: readMultipartField(file, "considerar_valor_aproximado"),
            },
        });
        return reply.send(result);
    });
    app.get("/api/recebiveis-cartao/rede-sales-validation/history", async (req) => {
        const query = historyQuerySchema.parse(req.query ?? {});
        return service.getHistory(query.limit);
    });
    app.get("/api/recebiveis-cartao/rede-sales-validation/:id", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        return service.getValidationDetails(id);
    });
    app.get("/api/recebiveis-cartao/rede-sales-validation/:id/items", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        const query = listQuerySchema.parse(req.query ?? {});
        return service.getValidationItems(id, query);
    });
    app.get("/api/recebiveis-cartao/rede-sales-validation/:id/summary", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        return service.getValidationSummary(id);
    });
    app.get("/api/recebiveis-cartao/rede-sales-validation/:id/winthor-unmatched", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        const query = unmatchedQuerySchema.parse(req.query ?? {});
        return service.getValidationWinthorUnmatched(id, query);
    });
    app.post("/api/recebiveis-cartao/rede-sales-validation/:id/reprocess", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        return service.reprocess(id);
    });
    app.post("/api/recebiveis-cartao/rede-sales-validation/:id/items/:itemId/manual", async (req) => {
        const { id, itemId } = itemParamsSchema.parse(req.params);
        const body = manualBodySchema.parse(req.body ?? {});
        return service.markItemManual(id, itemId, body.reason ?? "");
    });
    app.get("/api/recebiveis-cartao/rede-sales-validation/:id/export", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        const query = exportQuerySchema.parse(req.query ?? {});
        return service.exportBatch(id, query.format ?? "xlsx", query.scope ?? "all");
    });
}
