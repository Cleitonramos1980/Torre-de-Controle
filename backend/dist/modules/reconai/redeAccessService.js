import { env, hasRedeConfig } from "../../config/env.js";
import { AppError } from "../../utils/error.js";
function buildEndpointUrl(baseUrl, endpoint) {
    if (/^https?:\/\//i.test(endpoint))
        return endpoint;
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    const normalizedEndpoint = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
    return `${normalizedBase}/${normalizedEndpoint}`;
}
async function safeReadBody(response) {
    try {
        return await response.text();
    }
    catch {
        return "";
    }
}
function firstMessage(payload) {
    if (!payload || typeof payload !== "object")
        return null;
    const obj = payload;
    if (typeof obj.message === "string" && obj.message.trim())
        return obj.message.trim();
    if (typeof obj.error === "string" && obj.error.trim())
        return obj.error.trim();
    if (obj.error && typeof obj.error === "object" && typeof obj.error.message === "string" && obj.error.message.trim()) {
        return obj.error.message.trim();
    }
    return null;
}
export class RedeAccessService {
    logger;
    authService;
    constructor(logger, authService) {
        this.logger = logger;
        this.authService = authService;
    }
    getBaseUrl() {
        if (!env.REDE_BASE_URL) {
            throw new AppError("REDE_BASE_URL nao configurada.", 503);
        }
        return env.REDE_BASE_URL;
    }
    buildUrl(path) {
        return buildEndpointUrl(this.getBaseUrl(), path);
    }
    async requestWithRetry(method, path, body) {
        if (!hasRedeConfig()) {
            throw new AppError("Credenciais da REDE nao configuradas.", 503);
        }
        const maxAttempts = env.REDE_RETRY_ATTEMPTS;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            const startedAt = Date.now();
            const forceRefresh = attempt > 1;
            try {
                const token = await this.authService.getAccessToken(forceRefresh);
                const response = await fetch(this.buildUrl(path), {
                    method,
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/json",
                        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
                    },
                    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
                    signal: AbortSignal.timeout(env.REDE_TIMEOUT_MS),
                });
                const rawBody = await safeReadBody(response);
                let jsonBody = null;
                if (rawBody) {
                    try {
                        jsonBody = JSON.parse(rawBody);
                    }
                    catch {
                        jsonBody = null;
                    }
                }
                if (response.status === 401 && attempt < maxAttempts) {
                    this.logger.warn({
                        component: "RedeAccessService",
                        action: "requestWithRetry",
                        endpoint: path,
                        method,
                        attempt,
                        statusCode: response.status,
                    }, "REDE Gestao de Acessos retornou 401. Forcando renovacao de token.");
                    continue;
                }
                if (!response.ok) {
                    const message = firstMessage(jsonBody) ?? rawBody ?? `HTTP ${response.status}`;
                    throw new AppError(`Falha na API Gestao de Acessos da REDE (${response.status}): ${message}`, response.status >= 500 ? 502 : response.status);
                }
                this.logger.info({
                    component: "RedeAccessService",
                    action: "requestWithRetry",
                    endpoint: path,
                    method,
                    attempt,
                    durationMs: Date.now() - startedAt,
                }, "Gestao de Acessos REDE chamada com sucesso.");
                if (jsonBody !== null) {
                    return jsonBody;
                }
                return { ok: true, rawBody };
            }
            catch (error) {
                const shouldRetry = attempt < maxAttempts && !(error instanceof AppError && [400, 401, 403, 404, 409, 422].includes(error.statusCode));
                this.logger.error({
                    component: "RedeAccessService",
                    action: "requestWithRetry",
                    endpoint: path,
                    method,
                    attempt,
                    durationMs: Date.now() - startedAt,
                    shouldRetry,
                    error,
                }, "Falha ao chamar API Gestao de Acessos da REDE.");
                if (!shouldRetry) {
                    if (error instanceof AppError)
                        throw error;
                    throw new AppError("Falha de comunicacao com API Gestao de Acessos da REDE.", 502);
                }
            }
        }
        throw new AppError("Falha na API Gestao de Acessos da REDE apos retries.", 502);
    }
    async createMerchantStatementAccessRequest(payload) {
        return this.requestWithRetry("POST", "/partner/v1/organizations/requests/features/merchant-statement", payload);
    }
    async getMerchantStatementAccessRequest(requestId) {
        return this.requestWithRetry("GET", `/partner/v1/organizations/requests/${encodeURIComponent(requestId)}/features/merchant-statement`);
    }
    async cancelMerchantStatementAccessRequest(requestId) {
        return this.requestWithRetry("PUT", `/partner/v1/organizations/requests/${encodeURIComponent(requestId)}/features/merchant-statement/cancel`);
    }
}
