import { z } from "zod";
import { getAuditoriaCartaoAnalisePorFilial } from "../repositories/cartaoAuditoriaRepository.js";
export async function auditoriaCartaoRoutes(app) {
    const querySchema = z.object({
        filial: z.coerce.number().int().positive(),
        data: z.string().trim().min(1),
        adquirente: z.string().trim().optional(),
        incluirDetalhes: z.coerce.boolean().default(true),
    });
    app.get("/api/auditoria-cartao/analise-por-filial", async (req, reply) => {
        const query = querySchema.parse(req.query);
        try {
            return getAuditoriaCartaoAnalisePorFilial(query);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Falha ao processar analise por filial.";
            return reply.status(400).send({ error: { message } });
        }
    });
}
