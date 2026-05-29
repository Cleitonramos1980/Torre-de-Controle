import { z } from "zod";
import { FinanceiroTiService } from "../modules/financeiroTi/financeiroTiService.js";
const querySchema = z.object({
    dataInicial: z.string().trim().optional(),
    dataFinal: z.string().trim().optional(),
    fornecedor: z.string().trim().optional(),
    codFornec: z.coerce.number().int().positive().optional(),
    codConta: z.coerce.number().int().positive().optional(),
    centroCusto: z.string().trim().optional(),
    grupoConta: z.coerce.number().int().optional(),
    risco: z.enum(["ALTO", "MEDIO", "BAIXO"]).optional(),
    status: z.enum(["PAGO", "EM_ABERTO", "RECORRENCIA_ESTIMADA"]).optional(),
    tipoAnalise: z.enum(["OFICIAL_LANCADO", "ESTIMADO_HISTORICO", "TODOS"]).optional(),
    visao: z.enum(["SEMANAL", "MENSAL", "TODOS"]).optional(),
});
function normalizeFilters(raw = {}) {
    const dataInicial = raw.dataInicial ?? raw.dataInicio ?? raw.dtInicial;
    const dataFinal = raw.dataFinal ?? raw.dataFim ?? raw.dtFinal;
    return querySchema.parse({
        ...raw,
        dataInicial,
        dataFinal,
    });
}
export async function financeiroTiRoutes(app) {
    const service = new FinanceiroTiService(app.log);
    app.get("/api/financeiro-ti/lancamentos", async (req) => {
        const filters = normalizeFilters(req.query ?? {});
        return service.getLancamentos(filters);
    });
    app.get("/api/financeiro-ti/resumo", async (req) => {
        const filters = normalizeFilters(req.query ?? {});
        return service.getResumo(filters);
    });
    app.get("/api/financeiro-ti/recorrencias-ausentes", async (req) => {
        const filters = normalizeFilters(req.query ?? {});
        return service.getRecorrenciasAusentes(filters);
    });
    app.get("/api/financeiro-ti/fluxo-projetado", async (req) => {
        const filters = normalizeFilters(req.query ?? {});
        return service.getFluxoProjetado(filters);
    });
    app.get("/api/financeiro-ti/alertas", async (req) => {
        const filters = normalizeFilters(req.query ?? {});
        return service.getAlertas(filters);
    });
    app.get("/api/financeiro-ti/dashboard", async (req) => {
        const filters = normalizeFilters(req.query ?? {});
        return service.getDashboard(filters);
    });
}
