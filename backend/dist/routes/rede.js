import { z } from "zod";
import { reconaiStore } from "../modules/reconai/reconaiStore.js";
import { RedeModule } from "../modules/reconai/redeModule.js";
function defaultDateRange() {
    const today = new Date();
    const endDate = today.toISOString().slice(0, 10);
    const startDateRef = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startDate = startDateRef.toISOString().slice(0, 10);
    return { startDate, endDate };
}
function normalizeRequestType(value) {
    const normalized = String(value ?? "").trim().toUpperCase();
    if (["I", "INDIVIDUAL"].includes(normalized))
        return "I";
    if (["P", "PARTIAL", "PARCIAL"].includes(normalized))
        return "P";
    if (["T", "TOTAL"].includes(normalized))
        return "T";
    return normalized;
}
function normalizePermission(value) {
    const normalized = String(value ?? "").trim().toUpperCase();
    if (!normalized)
        return "L";
    if (["L", "LEITURA", "READ", "R"].includes(normalized))
        return "L";
    return normalized;
}
function normalizeCompanyNumbers(value) {
    if (value == null)
        return undefined;
    if (Array.isArray(value)) {
        const normalized = value
            .map((item) => String(item ?? "").trim())
            .filter((item) => item.length > 0);
        return normalized.length > 0 ? normalized : undefined;
    }
    const text = String(value).trim();
    if (!text)
        return undefined;
    const normalized = text
        .split(/[;,]/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    return normalized.length > 0 ? normalized : undefined;
}
export async function redeRoutes(app) {
    const module = new RedeModule(app.log);
    const service = module.redeService;
    const accessService = module.redeAccessService;
    const salesQuerySchema = z.object({
        startDate: z.string().trim().optional(),
        endDate: z.string().trim().optional(),
    });
    const accessRequestParamsSchema = z.object({
        requestId: z.string().trim().min(1).max(120),
    });
    const accessCreateSchema = z
        .object({
        requestCompanyNumber: z.string().trim().min(1).max(20).optional(),
        requestType: z.string().trim().min(1).max(20).optional(),
        permission: z.string().trim().min(1).max(20).optional(),
        companyNumbers: z.union([z.array(z.string().trim().min(1).max(20)), z.string().trim().min(1)]).optional(),
        payload: z.record(z.any()).optional(),
    })
        .passthrough();
    app.get("/api/rede/sales", async (req) => {
        const query = salesQuerySchema.parse(req.query);
        const defaults = defaultDateRange();
        const startDate = query.startDate || defaults.startDate;
        const endDate = query.endDate || defaults.endDate;
        const rows = await service.getSales(startDate, endDate);
        return {
            startDate,
            endDate,
            total: rows.length,
            rows,
        };
    });
    app.get("/api/rede/payments", async (req) => {
        const query = salesQuerySchema.parse(req.query);
        const defaults = defaultDateRange();
        const startDate = query.startDate || defaults.startDate;
        const endDate = query.endDate || defaults.endDate;
        const rows = await service.getPayments(startDate, endDate);
        return {
            startDate,
            endDate,
            total: rows.length,
            rows,
        };
    });
    app.post("/api/rede/sync", async (req) => {
        const body = z
            .object({
            startDate: z.string().trim().optional(),
            endDate: z.string().trim().optional(),
        })
            .default({})
            .parse(req.body ?? {});
        const defaults = defaultDateRange();
        const startDate = body.startDate || defaults.startDate;
        const endDate = body.endDate || defaults.endDate;
        const syncResult = await service.sync(startDate, endDate);
        return {
            ...syncResult,
            snapshot: reconaiStore.getSnapshot(),
        };
    });
    app.post("/api/rede/access-requests/merchant-statement", async (req) => {
        const body = accessCreateSchema.parse(req.body ?? {});
        const payload = body.payload && typeof body.payload === "object"
            ? body.payload
            : {
                requestCompanyNumber: body.requestCompanyNumber,
                requestType: normalizeRequestType(body.requestType),
                permission: normalizePermission(body.permission),
                ...(normalizeCompanyNumbers(body.companyNumbers) ? { companyNumbers: normalizeCompanyNumbers(body.companyNumbers) } : {}),
            };
        if (!payload.requestCompanyNumber || !payload.requestType) {
            return {
                ok: false,
                message: "Informe requestCompanyNumber e requestType (I, P ou T), ou envie payload completo.",
                example: {
                    requestCompanyNumber: "87669447",
                    requestType: "T",
                    permission: "L",
                },
            };
        }
        const response = await accessService.createMerchantStatementAccessRequest(payload);
        return {
            ok: true,
            request: payload,
            response,
        };
    });
    app.get("/api/rede/access-requests/merchant-statement/:requestId", async (req) => {
        const { requestId } = accessRequestParamsSchema.parse(req.params ?? {});
        const response = await accessService.getMerchantStatementAccessRequest(requestId);
        return {
            ok: true,
            requestId,
            response,
        };
    });
    app.put("/api/rede/access-requests/merchant-statement/:requestId/cancel", async (req) => {
        const { requestId } = accessRequestParamsSchema.parse(req.params ?? {});
        const response = await accessService.cancelMerchantStatementAccessRequest(requestId);
        return {
            ok: true,
            requestId,
            response,
        };
    });
}
