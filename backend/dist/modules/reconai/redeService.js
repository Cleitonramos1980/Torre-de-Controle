import { env, hasRedeConfig } from "../../config/env.js";
import { AppError } from "../../utils/error.js";
import { reconciliationService } from "./reconciliationService.js";
import { reconaiStore } from "./reconaiStore.js";
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function firstString(input, keys) {
    for (const key of keys) {
        const value = input[key];
        if (value == null)
            continue;
        const parsed = String(value).trim();
        if (parsed.length > 0)
            return parsed;
    }
    return null;
}
function firstNumber(input, keys) {
    for (const key of keys) {
        const value = input[key];
        if (value == null)
            continue;
        const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
        if (Number.isFinite(parsed))
            return parsed;
    }
    return null;
}
function ensureDate(input) {
    const parsed = new Date(`${input}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
        throw new AppError(`Data invalida: ${input}. Use formato YYYY-MM-DD.`, 400);
    }
    return input;
}
function objectArray(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter((item) => Boolean(item && typeof item === "object"));
}
function extractArrayFromObject(objectPayload, preferredKeys) {
    for (const key of preferredKeys) {
        const directArray = objectArray(objectPayload[key]);
        if (directArray.length > 0)
            return directArray;
    }
    const fallbackKeys = ["sales", "payments", "records", "transactions", "items", "content"];
    for (const key of fallbackKeys) {
        const directArray = objectArray(objectPayload[key]);
        if (directArray.length > 0)
            return directArray;
    }
    return [];
}
function extractArray(payload, preferredKeys) {
    if (!payload || typeof payload !== "object")
        return [];
    const objectPayload = payload;
    const directRows = extractArrayFromObject(objectPayload, preferredKeys);
    if (directRows.length > 0)
        return directRows;
    const data = objectPayload.data;
    const dataArray = objectArray(data);
    if (dataArray.length > 0)
        return dataArray;
    if (data && typeof data === "object") {
        const dataRows = extractArrayFromObject(data, preferredKeys);
        if (dataRows.length > 0)
            return dataRows;
    }
    const content = objectPayload.content;
    const contentArray = objectArray(content);
    if (contentArray.length > 0)
        return contentArray;
    if (content && typeof content === "object") {
        const contentRows = extractArrayFromObject(content, preferredKeys);
        if (contentRows.length > 0)
            return contentRows;
    }
    return [];
}
function extractNextPage(payload, currentPage) {
    if (!payload || typeof payload !== "object")
        return null;
    const objectPayload = payload;
    const directNext = objectPayload.nextPage ?? objectPayload.next_page ?? objectPayload.pageNext;
    if (typeof directNext === "number" && Number.isFinite(directNext) && directNext > currentPage) {
        return directNext;
    }
    if (typeof directNext === "string") {
        const parsed = Number(directNext);
        if (Number.isFinite(parsed) && parsed > currentPage)
            return parsed;
    }
    const pagination = objectPayload.pagination;
    if (pagination && typeof pagination === "object") {
        const next = pagination.nextPage ?? pagination.next_page;
        if (typeof next === "number" && next > currentPage)
            return next;
        if (typeof next === "string") {
            const parsed = Number(next);
            if (Number.isFinite(parsed) && parsed > currentPage)
                return parsed;
        }
        const hasNext = pagination.hasNext;
        if (hasNext === true)
            return currentPage + 1;
    }
    if (objectPayload.hasNext === true)
        return currentPage + 1;
    return null;
}
function extractNextPageKey(payload) {
    if (!payload || typeof payload !== "object")
        return null;
    const objectPayload = payload;
    const directKey = firstString(objectPayload, ["pageKey", "nextPageKey", "nextKey", "next_page_key"]);
    if (directKey)
        return directKey;
    const cursor = objectPayload.cursor;
    if (cursor && typeof cursor === "object") {
        const cursorObj = cursor;
        const nextKey = firstString(cursorObj, ["nextKey", "nextPageKey", "next"]);
        if (nextKey)
            return nextKey;
    }
    const pagination = objectPayload.pagination;
    if (pagination && typeof pagination === "object") {
        const paginationObj = pagination;
        const nextKey = firstString(paginationObj, ["nextKey", "nextPageKey", "next_page_key"]);
        if (nextKey)
            return nextKey;
    }
    return null;
}
function buildEndpointUrl(baseUrl, endpoint) {
    if (/^https?:\/\//i.test(endpoint))
        return endpoint;
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    const normalizedEndpoint = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
    return `${normalizedBase}/${normalizedEndpoint}`;
}
function resolveSalesScopeQuery(path, scope) {
    const normalizedPath = String(path ?? "").toLowerCase();
    if (normalizedPath.includes("/v1/sales")) {
        return {
            parentCompanyNumber: scope.parentCompanyNumber,
        };
    }
    return {
        parentMerchantId: scope.parentMerchantId,
    };
}
export class RedeService {
    logger;
    authService;
    winThorService;
    constructor(logger, authService, winThorService) {
        this.logger = logger;
        this.authService = authService;
        this.winThorService = winThorService;
    }
    getBaseUrl() {
        if (!env.REDE_BASE_URL) {
            throw new AppError("REDE_BASE_URL nao configurada.", 503);
        }
        return env.REDE_BASE_URL;
    }
    buildUrl(path, query) {
        const url = new URL(buildEndpointUrl(this.getBaseUrl(), path));
        if (query) {
            for (const [key, value] of Object.entries(query)) {
                if (value == null || value === "")
                    continue;
                url.searchParams.set(key, String(value));
            }
        }
        return url.toString();
    }
    async parseJsonResponse(response, context) {
        try {
            return await response.json();
        }
        catch (error) {
            this.logger.error({
                component: "RedeService",
                action: context,
                error,
                statusCode: response.status,
            }, "Resposta JSON invalida da REDE");
            throw new AppError("Resposta invalida da API da REDE.", 502);
        }
    }
    async requestWithRetry(path, query) {
        if (!hasRedeConfig()) {
            throw new AppError("Credenciais da REDE nao configuradas.", 503);
        }
        const maxAttempts = env.REDE_RETRY_ATTEMPTS;
        const url = this.buildUrl(path, query);
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            const startedAt = Date.now();
            const forceRefresh = attempt > 1;
            let token = "";
            try {
                token = await this.authService.getAccessToken(forceRefresh);
                const response = await fetch(url, {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/json",
                    },
                    signal: AbortSignal.timeout(env.REDE_TIMEOUT_MS),
                });
                if (response.status === 401) {
                    this.logger.warn({
                        component: "RedeService",
                        action: "requestWithRetry",
                        endpoint: path,
                        attempt,
                        statusCode: response.status,
                    }, "REDE retornou 401. Forcando renovacao de token.");
                    if (attempt < maxAttempts) {
                        await sleep(env.REDE_RETRY_BASE_DELAY_MS * attempt);
                        continue;
                    }
                    throw new AppError("REDE retornou 401 apos tentativas de renovacao de token.", 502);
                }
                if (response.status === 403) {
                    throw new AppError("REDE retornou 403: credencial sem permissao para este recurso.", 403);
                }
                if (response.status >= 500) {
                    const body = await response.text();
                    this.logger.error({
                        component: "RedeService",
                        action: "requestWithRetry",
                        endpoint: path,
                        attempt,
                        statusCode: response.status,
                        body,
                    }, "Erro 5xx na REDE");
                    if (attempt < maxAttempts) {
                        await sleep(env.REDE_RETRY_BASE_DELAY_MS * attempt);
                        continue;
                    }
                    throw new AppError(`REDE indisponivel (HTTP ${response.status}).`, 502);
                }
                if (!response.ok) {
                    const body = await response.text();
                    throw new AppError(`Falha na chamada da REDE (HTTP ${response.status}): ${body}`, 502);
                }
                const payload = await this.parseJsonResponse(response, "requestWithRetry");
                this.logger.info({
                    component: "RedeService",
                    action: "requestWithRetry",
                    endpoint: path,
                    durationMs: Date.now() - startedAt,
                    attempt,
                }, "Chamada REDE concluida com sucesso");
                return payload;
            }
            catch (error) {
                const nonRetriable = error instanceof AppError &&
                    [400, 401, 403, 404, 422, 503].includes(error.statusCode);
                const retriable = attempt < maxAttempts && !nonRetriable;
                this.logger.error({
                    component: "RedeService",
                    action: "requestWithRetry",
                    endpoint: path,
                    attempt,
                    durationMs: Date.now() - startedAt,
                    error,
                    retriable,
                }, "Falha em chamada da REDE");
                if (!retriable) {
                    if (error instanceof AppError)
                        throw error;
                    throw new AppError("Falha de comunicacao com a API da REDE.", 502);
                }
                await sleep(env.REDE_RETRY_BASE_DELAY_MS * attempt);
            }
        }
        throw new AppError("Falha ao consumir API da REDE apos retries.", 502);
    }
    async fetchPaginated(path, query, preferredKeys) {
        const rows = [];
        let page = typeof query.page === "number" && Number.isFinite(query.page) ? Number(query.page) : 1;
        let pageKey = typeof query.pageKey === "string" && query.pageKey.trim() ? query.pageKey.trim() : null;
        const baseQuery = { ...query };
        delete baseQuery.page;
        delete baseQuery.pageKey;
        const maxPages = 200;
        for (let pageCount = 1; pageCount <= maxPages; pageCount += 1) {
            const payload = await this.requestWithRetry(path, {
                ...baseQuery,
                ...(pageKey ? { pageKey } : { page }),
            });
            const pageRows = extractArray(payload, preferredKeys);
            rows.push(...pageRows);
            const nextPageKey = extractNextPageKey(payload);
            if (nextPageKey && nextPageKey !== pageKey) {
                pageKey = nextPageKey;
                continue;
            }
            const nextPage = extractNextPage(payload, page);
            if (nextPage && nextPage > page) {
                page = nextPage;
                pageKey = null;
                continue;
            }
            if (pageRows.length === 0)
                break;
            break;
        }
        return rows;
    }
    resolveMerchantScope() {
        const parentMerchantId = env.REDE_PARENT_MERCHANT_ID?.trim() || env.REDE_PARENT_COMPANY_NUMBER?.trim() || "";
        const parentCompanyNumber = env.REDE_PARENT_COMPANY_NUMBER?.trim() || env.REDE_PARENT_MERCHANT_ID?.trim() || "";
        const subsidiaries = env.REDE_SUBSIDIARIES?.trim() || parentCompanyNumber || parentMerchantId || "";
        if (!parentMerchantId || !parentCompanyNumber || !subsidiaries) {
            throw new AppError("Escopo de consulta da REDE nao configurado. Defina REDE_PARENT_MERCHANT_ID/REDE_PARENT_COMPANY_NUMBER e REDE_SUBSIDIARIES.", 503);
        }
        return {
            parentMerchantId,
            parentCompanyNumber,
            subsidiaries,
        };
    }
    normalizeSale(row, index) {
        const nsu = firstString(row, ["nsu", "NSU", "transactionNsu", "transaction_nsu"]);
        const authorization = firstString(row, [
            "authorization",
            "authorizationCode",
            "authorization_code",
            "autorizacao",
            "authCode",
        ]);
        const externalId = firstString(row, ["id", "uuid", "saleId", "sale_id", "transactionId", "transaction_id"]) ??
            nsu ??
            authorization ??
            `sale-${Date.now()}-${index + 1}`;
        return {
            externalId,
            nsu,
            authorization,
            valorVenda: firstNumber(row, ["amount", "grossAmount", "gross_amount", "valor", "saleAmount"]),
            dataVenda: firstString(row, ["saleDate", "sale_date", "transactionDate", "transaction_date", "date"]),
            parcela: firstNumber(row, ["installment", "parcel", "parcela", "installments"]),
            numped: firstString(row, ["numped", "orderId", "order_id", "pedido"]),
            numnota: firstString(row, ["numnota", "invoiceNumber", "invoice_number", "nota"]),
            filial: firstString(row, ["filial", "branch", "branchCode", "estabelecimento", "storeCode"]),
            raw: row,
        };
    }
    normalizePayment(row, index) {
        const nsu = firstString(row, ["nsu", "NSU", "transactionNsu", "transaction_nsu"]);
        const authorization = firstString(row, [
            "authorization",
            "authorizationCode",
            "authorization_code",
            "autorizacao",
            "authCode",
        ]);
        const externalId = firstString(row, ["id", "uuid", "paymentId", "payment_id", "transactionId", "transaction_id"]) ??
            nsu ??
            authorization ??
            `payment-${Date.now()}-${index + 1}`;
        return {
            externalId,
            nsu,
            authorization,
            valorRecebido: firstNumber(row, ["netAmount", "net_amount", "valorRecebido", "amountNet"]),
            valorBruto: firstNumber(row, ["grossAmount", "gross_amount", "amount", "valorBruto"]),
            valorTaxa: firstNumber(row, ["feeAmount", "fee_amount", "mdrAmount", "valorTaxa"]),
            taxaEsperada: firstNumber(row, ["taxa", "expectedRate", "expected_rate", "contractRate", "taxaEsperada"]),
            taxaMdr: firstNumber(row, ["mdr", "mdrRate", "mdr_rate", "taxaMdr"]),
            dataPagamento: firstString(row, ["paymentDate", "payment_date", "date", "settlementDate"]),
            parcela: firstNumber(row, ["installment", "parcel", "parcela", "installments"]),
            filial: firstString(row, ["filial", "branch", "branchCode", "estabelecimento", "storeCode"]),
            raw: row,
        };
    }
    async getSales(startDate, endDate) {
        ensureDate(startDate);
        ensureDate(endDate);
        const scope = this.resolveMerchantScope();
        const salesScopeQuery = resolveSalesScopeQuery(env.REDE_SALES_PATH, scope);
        const rows = await this.fetchPaginated(env.REDE_SALES_PATH, {
            ...salesScopeQuery,
            subsidiaries: scope.subsidiaries,
            startDate,
            endDate,
            size: env.REDE_PAGE_SIZE,
        }, ["sales", "records", "transactions"]);
        return rows.map((row, index) => this.normalizeSale(row, index));
    }
    async getPayments(startDate, endDate) {
        ensureDate(startDate);
        ensureDate(endDate);
        const scope = this.resolveMerchantScope();
        const rows = await this.fetchPaginated(env.REDE_PAYMENTS_PATH, {
            parentCompanyNumber: scope.parentCompanyNumber,
            subsidiaries: scope.subsidiaries,
            startDate,
            endDate,
            size: env.REDE_PAGE_SIZE,
        }, ["payments", "records", "transactions"]);
        return rows.map((row, index) => this.normalizePayment(row, index));
    }
    async sync(startDate, endDate) {
        ensureDate(startDate);
        ensureDate(endDate);
        const syncedAt = new Date().toISOString();
        const [sales, payments] = await Promise.all([
            this.getSales(startDate, endDate),
            this.getPayments(startDate, endDate),
        ]);
        let receivables = [];
        try {
            receivables = await this.winThorService.getReceivables(startDate, endDate);
        }
        catch (error) {
            this.logger.warn({
                component: "RedeService",
                action: "sync",
                error,
            }, "Falha ao consultar WinThor durante sincronizacao da REDE. Continuando com receivaveis vazios.");
        }
        const batchResult = reconciliationService.runFullReconciliation(sales, payments, receivables);
        const reconciliations = batchResult.reconciliations;
        const summary = batchResult.summary;
        reconaiStore.replaceSnapshot({
            syncedAt,
            sales,
            payments,
            receivables,
            reconciliations,
        });
        this.logger.info({
            component: "RedeService",
            action: "sync",
            syncedAt,
            summary,
        }, "Sincronizacao REDE + WinThor concluida");
        return {
            syncedAt,
            summary,
            reconciliations,
        };
    }
}
