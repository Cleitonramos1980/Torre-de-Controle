import { z } from "zod";
import { AiModule } from "../modules/reconai/aiModule.js";
import { reconaiStore } from "../modules/reconai/reconaiStore.js";
import { AppError } from "../utils/error.js";
export async function aiRoutes(app) {
    const module = new AiModule(app.log);
    const aiService = module.aiFinancialService;
    const analysisCache = new Map();
    const paramsSchema = z.object({ id: z.string().trim().min(1) });
    const analyzeById = async (id) => {
        const cached = analysisCache.get(id);
        if (cached)
            return cached;
        const record = reconaiStore.getReconciliationById(id);
        if (!record) {
            throw new AppError(`Divergencia ${id} nao encontrada. Execute /api/rede/sync antes de usar IA.`, 404);
        }
        const analysis = await aiService.analyzeDivergence(record);
        analysisCache.set(id, analysis);
        return analysis;
    };
    app.post("/api/ai/explain/:id", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        const analysis = await analyzeById(id);
        return {
            id,
            explicacao: analysis.explicacao,
            acaoGerada: analysis.acaoGerada,
            rawText: analysis.rawText,
        };
    });
    app.post("/api/ai/diagnose/:id", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        const analysis = await analyzeById(id);
        const record = reconaiStore.getReconciliationById(id);
        return {
            id,
            diagnostico: analysis.diagnostico,
            impactoFinanceiro: analysis.impactoFinanceiro,
            statusConciliacao: record?.status ?? null,
            matchScore: record?.matchScore ?? null,
            diferencaValor: record?.diferencaValor ?? null,
            reasons: record?.reasons ?? [],
        };
    });
    app.post("/api/ai/recommend/:id", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        const analysis = await analyzeById(id);
        return {
            id,
            recomendacao: analysis.recomendacao,
            acaoGerada: analysis.acaoGerada,
        };
    });
}
