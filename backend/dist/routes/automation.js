import { z } from "zod";
import { AutomationModule } from "../modules/reconai/automationModule.js";
import { reconaiStore } from "../modules/reconai/reconaiStore.js";
import { AppError } from "../utils/error.js";
export async function automationRoutes(app) {
    const module = new AutomationModule(app.log);
    const service = module.automationService;
    app.get("/api/reconai/divergencias", async (req) => {
        const query = z
            .object({
            workflowStatus: z.string().trim().optional(),
            status: z.string().trim().optional(),
            risco: z.string().trim().optional(),
            limit: z.coerce.number().int().min(1).max(5000).optional(),
        })
            .parse(req.query);
        const workflowStatus = query.workflowStatus?.toUpperCase();
        const status = query.status?.toUpperCase();
        const risco = query.risco?.toUpperCase();
        const limit = query.limit ?? 500;
        const rows = reconaiStore
            .listReconciliations()
            .filter((row) => (workflowStatus ? row.workflowStatus === workflowStatus : true))
            .filter((row) => (status ? row.status === status : true))
            .filter((row) => (risco ? row.risco_nivel === risco : true))
            .slice(0, limit);
        return {
            total: rows.length,
            rows,
        };
    });
    app.post("/api/reconai/automation/run", async (req) => {
        const body = z
            .object({
            divergenceIds: z.array(z.string().trim().min(1)).optional(),
            onlyCritical: z.coerce.boolean().optional(),
            limit: z.coerce.number().int().min(1).max(5000).optional(),
        })
            .default({})
            .parse(req.body ?? {});
        const result = await service.runAutomation(body);
        return result;
    });
    app.post("/api/reconai/automation/execute/:id", async (req) => {
        const { id } = z.object({ id: z.string().trim().min(1) }).parse(req.params);
        const divergence = reconaiStore.getReconciliationById(id);
        if (!divergence) {
            throw new AppError(`Divergencia ${id} nao encontrada. Execute /api/rede/sync antes.`, 404);
        }
        const result = await service.executeAction(divergence);
        return {
            result,
            updated: reconaiStore.getReconciliationById(id),
        };
    });
    app.get("/api/reconai/automation/logs", async (req) => {
        const query = z
            .object({
            divergenciaId: z.string().trim().optional(),
            limit: z.coerce.number().int().min(1).max(1000).optional(),
        })
            .parse(req.query);
        const logs = await service.getActionLogs(query);
        return {
            total: logs.length,
            logs,
        };
    });
    app.get("/api/reconai/automation/tickets", async (req) => {
        const query = z
            .object({
            divergenciaId: z.string().trim().optional(),
        })
            .parse(req.query);
        const tickets = service.getInternalTickets(query.divergenciaId);
        return {
            total: tickets.length,
            tickets,
        };
    });
}
