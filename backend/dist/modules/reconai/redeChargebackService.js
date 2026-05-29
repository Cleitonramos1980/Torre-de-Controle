import { env, getRedeChargebackClientId, getRedeChargebackClientSecret, hasRedeChargebackConfig, } from "../../config/env.js";
import { AppError } from "../../utils/error.js";
function safeToString(value) {
    if (value == null)
        return null;
    const parsed = String(value).trim();
    return parsed.length > 0 ? parsed : null;
}
function firstString(source, keys) {
    for (const key of keys) {
        const value = safeToString(source[key]);
        if (value)
            return value;
    }
    return null;
}
function firstNumber(source, keys) {
    for (const key of keys) {
        const value = source[key];
        if (value == null)
            continue;
        const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
        if (Number.isFinite(parsed))
            return parsed;
    }
    return null;
}
function firstBoolean(source, keys) {
    for (const key of keys) {
        const value = source[key];
        if (typeof value === "boolean")
            return value;
        if (typeof value === "string") {
            const normalized = value.trim().toLowerCase();
            if (normalized === "true")
                return true;
            if (normalized === "false")
                return false;
        }
    }
    return null;
}
function asObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return null;
    return value;
}
function toIsoDate(value) {
    if (!value)
        return null;
    const normalized = value.includes("/") ? value.replace(/\//g, "-") : value;
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime()))
        return null;
    return parsed.toISOString().slice(0, 10);
}
function normalizeDateInput(value, field) {
    if (!value || !value.trim())
        return null;
    const iso = toIsoDate(value.trim());
    if (!iso) {
        throw new AppError(`${field} invalida. Use formato YYYY-MM-DD.`, 400);
    }
    return iso;
}
function shiftDate(baseIso, days) {
    const parsed = new Date(`${baseIso}T00:00:00.000Z`);
    parsed.setUTCDate(parsed.getUTCDate() + days);
    return parsed.toISOString().slice(0, 10);
}
function round2(value) {
    return Number(value.toFixed(2));
}
function sumMoney(rows, key) {
    return round2(rows.reduce((acc, row) => {
        const value = row[key];
        return acc + (value == null ? 0 : value);
    }, 0));
}
function parseDateMs(value) {
    const iso = toIsoDate(value ?? null);
    if (!iso)
        return null;
    const parsed = new Date(`${iso}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}
function normalizeStatus(value) {
    if (!value)
        return "NAO_CLASSIFICADO";
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim()
        .replace(/\s+/g, "_");
}
function safeReadBody(response) {
    return response.text().catch(() => "");
}
function extractList(payload) {
    if (!payload || typeof payload !== "object")
        return [];
    const obj = payload;
    if (Array.isArray(obj.list)) {
        return obj.list.filter((item) => Boolean(item && typeof item === "object"));
    }
    if (Array.isArray(obj.data)) {
        return obj.data.filter((item) => Boolean(item && typeof item === "object"));
    }
    const data = asObject(obj.data);
    if (data && Array.isArray(data.list)) {
        return data.list.filter((item) => Boolean(item && typeof item === "object"));
    }
    return [];
}
function extractPagination(payload, fallbackTotal, fallbackSize) {
    const defaultValue = {
        recordsQuantity: fallbackTotal,
        quantityPerPage: fallbackSize,
        currentPage: 1,
        nextPage: "",
    };
    if (!payload || typeof payload !== "object")
        return defaultValue;
    const obj = payload;
    const pagination = asObject(obj.pagination);
    if (!pagination)
        return defaultValue;
    const recordsQuantity = firstNumber(pagination, ["recordsQuantity", "total", "totalItems"]) ?? fallbackTotal;
    const quantityPerPage = firstNumber(pagination, ["quantityPerPage", "size", "pageSize"]) ?? fallbackSize;
    const currentPage = firstNumber(pagination, ["currentPage", "page"]) ?? 1;
    const nextPage = firstString(pagination, ["nextPage"]) ?? "";
    return {
        recordsQuantity,
        quantityPerPage,
        currentPage,
        nextPage,
    };
}
function deriveStatus(details) {
    const status = firstString(details, ["processSituationDescription", "processTypeDescription", "status"]) ??
        "Nao classificado";
    return normalizeStatus(status);
}
function mapChargebackRecord(source, merchantId, item, index) {
    const details = asObject(item.chargebackDetails) ??
        asObject(item.processDetails) ??
        asObject(item.details) ??
        item;
    const id = firstString(item, ["chargebackId", "id"]) ??
        firstString(details, ["chargebackId", "id"]) ??
        `${source}-${merchantId}-${index + 1}`;
    const processNumber = firstString(details, ["processNumber"]);
    const processTypeDescription = firstString(details, ["processTypeDescription"]);
    const processCicleDescription = firstString(details, ["processCicleDescription"]);
    const processSituationDescription = firstString(details, ["processSituationDescription"]);
    const transactionDate = toIsoDate(firstString(details, ["transactionDate"]));
    const incomingDate = toIsoDate(firstString(details, ["incomingDate", "openingDate"]));
    const solutionDate = toIsoDate(firstString(details, ["solutionDate"]));
    const attendanceLimitDate = toIsoDate(firstString(details, ["attendanceLimitDate", "dataFimPrazoAtendimento"]));
    return {
        id,
        origem: source,
        merchantId,
        processNumber,
        processTypeDescription,
        processCicleDescription,
        processSituationDescription,
        status: deriveStatus(details),
        brandDescription: firstString(details, ["brandDescription"]),
        paymentTypeDescription: firstString(details, ["paymentTypeDescription"]),
        chargebackReasonCode: firstNumber(details, ["chargebackReasonCode"]),
        chargebackReasonDescription: firstString(details, ["chargebackReasonDescription"]),
        authorizationCode: firstString(details, ["authorizationCode"]),
        transactionDate,
        incomingDate,
        solutionDate,
        attendanceLimitDate,
        cardNumberMasked: firstString(details, ["cardNumber"]),
        isFraude: firstBoolean(details, ["isFraude"]),
        processValue: firstNumber(details, ["processValue"]),
        transactionValue: firstNumber(details, ["transactionValue"]),
        uniqueSequentialNumber: firstString(details, ["uniqueSequentialNumber"]),
        reference: firstString(details, ["reference"]),
        raw: item,
    };
}
function sortByMostRecent(records) {
    return [...records].sort((a, b) => {
        const dateA = parseDateMs(a.incomingDate ?? a.transactionDate ?? null) ?? 0;
        const dateB = parseDateMs(b.incomingDate ?? b.transactionDate ?? null) ?? 0;
        if (dateA !== dateB)
            return dateB - dateA;
        return a.id.localeCompare(b.id);
    });
}
function emptyListResponse(merchantId, openingDate) {
    return {
        merchantId,
        openingDate,
        total: 0,
        paginacao: {
            recordsQuantity: 0,
            quantityPerPage: 0,
            currentPage: 1,
            nextPage: "",
        },
        registros: [],
    };
}
function getTodayUtcMs() {
    const today = new Date();
    const todayIso = today.toISOString().slice(0, 10);
    return new Date(`${todayIso}T00:00:00.000Z`).getTime();
}
function buildEndpointUrl(baseUrl, endpoint) {
    if (/^https?:\/\//i.test(endpoint))
        return endpoint;
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    const normalizedEndpoint = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
    return `${normalizedBase}/${normalizedEndpoint}`;
}
export class RedeChargebackService {
    logger;
    tokenCache = null;
    constructor(logger) {
        this.logger = logger;
    }
    getBaseUrl() {
        if (!env.REDE_BASE_URL) {
            throw new AppError("REDE_BASE_URL nao configurada.", 503);
        }
        return env.REDE_BASE_URL;
    }
    resolveMerchantId(inputMerchantId) {
        const merchantId = (inputMerchantId || env.REDE_CHARGEBACK_DEFAULT_MERCHANT_ID || "").trim();
        if (!merchantId) {
            throw new AppError("merchantId obrigatorio para consulta de chargeback. Informe via filtro ou REDE_CHARGEBACK_DEFAULT_MERCHANT_ID.", 400);
        }
        return merchantId;
    }
    resolveOpeningDate(inputDate) {
        const parsed = normalizeDateInput(inputDate, "openingDate");
        if (parsed)
            return parsed;
        const today = new Date().toISOString().slice(0, 10);
        return shiftDate(today, -30);
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
    isTokenValid() {
        if (!this.tokenCache)
            return false;
        return this.tokenCache.expiresAtMs > Date.now() + 30_000;
    }
    async getAccessToken(forceRefresh = false) {
        if (!hasRedeChargebackConfig()) {
            throw new AppError("Credenciais da REDE Chargeback nao configuradas. Verifique REDE_BASE_URL e REDE_CHARGEBACK_CLIENT_ID/SECRET.", 503);
        }
        if (!forceRefresh && this.isTokenValid()) {
            return this.tokenCache.accessToken;
        }
        const clientId = getRedeChargebackClientId();
        const clientSecret = getRedeChargebackClientSecret();
        if (!clientId || !clientSecret) {
            throw new AppError("REDE Chargeback sem clientId/clientSecret.", 503);
        }
        const authUrl = this.buildUrl(env.REDE_AUTH_PATH);
        const payload = new URLSearchParams({ grant_type: "client_credentials" });
        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
        let response;
        try {
            response = await fetch(authUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Authorization: `Basic ${credentials}`,
                },
                body: payload.toString(),
                signal: AbortSignal.timeout(env.REDE_CHARGEBACK_TIMEOUT_MS),
            });
        }
        catch (error) {
            this.logger.error({
                component: "RedeChargebackService",
                action: "getAccessToken",
                error,
            }, "Falha de rede ao autenticar na REDE Chargeback");
            throw new AppError("Falha de conexao ao autenticar na API de Chargeback.", 502);
        }
        if (!response.ok) {
            const body = await safeReadBody(response);
            this.logger.error({
                component: "RedeChargebackService",
                action: "getAccessToken",
                statusCode: response.status,
                body,
            }, "Erro HTTP na autenticacao de Chargeback");
            if (response.status === 401 || response.status === 403) {
                throw new AppError("Credenciais de Chargeback invalidas ou sem permissao.", 502);
            }
            throw new AppError(`Erro ao autenticar Chargeback (HTTP ${response.status}).`, 502);
        }
        let tokenData;
        try {
            tokenData = (await response.json());
        }
        catch (error) {
            this.logger.error({
                component: "RedeChargebackService",
                action: "getAccessToken",
                error,
            }, "Resposta de token Chargeback invalida");
            throw new AppError("Resposta invalida ao autenticar na API de Chargeback.", 502);
        }
        if (!tokenData.access_token) {
            throw new AppError("Token de acesso Chargeback nao retornado.", 502);
        }
        const expiresIn = Number(tokenData.expires_in ?? 300);
        this.tokenCache = {
            accessToken: tokenData.access_token,
            tokenType: tokenData.token_type ?? "Bearer",
            expiresAtMs: Date.now() + Math.max(30, expiresIn) * 1000,
        };
        return this.tokenCache.accessToken;
    }
    async requestWithRetry(path, query) {
        const maxAttempts = env.REDE_CHARGEBACK_RETRY_ATTEMPTS;
        const url = this.buildUrl(path, query);
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            const forceRefresh = attempt > 1;
            try {
                const accessToken = await this.getAccessToken(forceRefresh);
                const response = await fetch(url, {
                    method: "GET",
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        Accept: "application/json",
                    },
                    signal: AbortSignal.timeout(env.REDE_CHARGEBACK_TIMEOUT_MS),
                });
                if (response.status === 401) {
                    if (attempt < maxAttempts) {
                        await new Promise((resolve) => setTimeout(resolve, env.REDE_CHARGEBACK_RETRY_BASE_DELAY_MS * attempt));
                        continue;
                    }
                    throw new AppError("Chargeback retornou 401 apos tentativas de renovacao de token.", 502);
                }
                if (response.status === 403) {
                    throw new AppError("Chargeback retornou 403: credencial sem permissao.", 403);
                }
                if (response.status >= 500) {
                    const body = await safeReadBody(response);
                    this.logger.error({
                        component: "RedeChargebackService",
                        action: "requestWithRetry",
                        path,
                        query,
                        attempt,
                        statusCode: response.status,
                        body,
                    }, "Erro 5xx na API de Chargeback");
                    if (attempt < maxAttempts) {
                        await new Promise((resolve) => setTimeout(resolve, env.REDE_CHARGEBACK_RETRY_BASE_DELAY_MS * attempt));
                        continue;
                    }
                    throw new AppError(`API de Chargeback indisponivel (HTTP ${response.status}).`, 502);
                }
                if (!response.ok) {
                    const body = await safeReadBody(response);
                    throw new AppError(`Falha na chamada de Chargeback (HTTP ${response.status}): ${body}`, 502);
                }
                try {
                    return await response.json();
                }
                catch {
                    return {};
                }
            }
            catch (error) {
                const isLastAttempt = attempt >= maxAttempts;
                if (isLastAttempt) {
                    if (error instanceof AppError)
                        throw error;
                    throw new AppError("Falha de comunicacao com API de Chargeback.", 502);
                }
                await new Promise((resolve) => setTimeout(resolve, env.REDE_CHARGEBACK_RETRY_BASE_DELAY_MS * attempt));
            }
        }
        throw new AppError("Falha ao consumir API de Chargeback apos retries.", 502);
    }
    mapResponse(source, merchantId, openingDate, payload, fallbackSize) {
        const list = extractList(payload).map((item, index) => mapChargebackRecord(source, merchantId, item, index));
        const sorted = sortByMostRecent(list);
        const pagination = extractPagination(payload, sorted.length, fallbackSize);
        return {
            merchantId,
            openingDate,
            total: pagination.recordsQuantity || sorted.length,
            paginacao: pagination,
            registros: sorted,
        };
    }
    async getNotifications(input) {
        const merchantId = this.resolveMerchantId(input.merchantId);
        const openingDate = this.resolveOpeningDate(input.openingDate);
        const page = input.page && input.page > 0 ? input.page : 1;
        const size = input.size && input.size > 0 ? Math.min(input.size, 500) : 100;
        const payload = await this.requestWithRetry(env.REDE_CHARGEBACK_NOTIFICATIONS_PATH, {
            merchantId,
            openingDate,
            page,
            size,
        });
        return this.mapResponse("NOTIFICACAO", merchantId, openingDate, payload, size);
    }
    async getSolicitations(input) {
        const merchantId = this.resolveMerchantId(input.merchantId);
        const openingDate = this.resolveOpeningDate(input.openingDate);
        const page = input.page && input.page > 0 ? input.page : 1;
        const size = input.size && input.size > 0 ? Math.min(input.size, 500) : 100;
        const payload = await this.requestWithRetry(env.REDE_CHARGEBACK_SOLICITATIONS_PATH, {
            merchantId,
            openingDate,
            page,
            size,
        });
        return this.mapResponse("SOLICITACAO", merchantId, openingDate, payload, size);
    }
    async getHistory(input) {
        const merchantId = this.resolveMerchantId(input.merchantId);
        const openingDate = this.resolveOpeningDate(input.openingDate);
        const page = input.page && input.page > 0 ? input.page : 1;
        const size = input.size && input.size > 0 ? Math.min(input.size, 500) : 100;
        const historyPath = `${env.REDE_CHARGEBACK_HISTORY_PATH}/${encodeURIComponent(merchantId)}`;
        const payload = await this.requestWithRetry(historyPath, {
            openingDate,
            processNumber: input.processNumber,
            chargebackId: input.chargebackId,
            page,
            size,
        });
        return this.mapResponse("HISTORICO", merchantId, openingDate, payload, size);
    }
    async getHistoryByProcess(input) {
        const merchantId = this.resolveMerchantId(input.merchantId);
        const processNumber = (input.processNumber || "").trim();
        if (!processNumber) {
            throw new AppError("processNumber obrigatorio para consulta de historico por processo.", 400);
        }
        const openingDate = this.resolveOpeningDate(input.openingDate);
        const page = input.page && input.page > 0 ? input.page : 1;
        const size = input.size && input.size > 0 ? Math.min(input.size, 500) : 100;
        const historyPath = `${env.REDE_CHARGEBACK_HISTORY_PATH}/${encodeURIComponent(merchantId)}/by-process`;
        const payload = await this.requestWithRetry(historyPath, {
            processNumber,
            page,
            size,
        });
        return this.mapResponse("HISTORICO", merchantId, openingDate, payload, size);
    }
    async getResumo(input) {
        const merchantId = this.resolveMerchantId(input.merchantId);
        const openingDate = this.resolveOpeningDate(input.openingDate);
        const [notificacoes, solicitacoes] = await Promise.all([
            this.getNotifications({ merchantId, openingDate, page: 1, size: 500 }).catch((error) => {
                this.logger.warn({
                    component: "RedeChargebackService",
                    action: "getResumo",
                    source: "notifications",
                    merchantId,
                    openingDate,
                    error,
                }, "Falha ao carregar notificacoes para resumo de chargeback. Seguindo com lista vazia.");
                return emptyListResponse(merchantId, openingDate);
            }),
            this.getSolicitations({ merchantId, openingDate, page: 1, size: 500 }).catch((error) => {
                this.logger.warn({
                    component: "RedeChargebackService",
                    action: "getResumo",
                    source: "solicitations",
                    merchantId,
                    openingDate,
                    error,
                }, "Falha ao carregar solicitacoes para resumo de chargeback. Seguindo com lista vazia.");
                return emptyListResponse(merchantId, openingDate);
            }),
        ]);
        const all = [...notificacoes.registros, ...solicitacoes.registros];
        const todayMs = getTodayUtcMs();
        const thresholdMs = todayMs + 5 * 24 * 60 * 60 * 1000;
        const totalEmAnalise = all.filter((item) => item.status.includes("ANALISE") || item.status.includes("AGUARDANDO"))
            .length;
        const totalFraudeSuspeita = all.filter((item) => item.isFraude === true).length;
        const totalPrazoProximo = all.filter((item) => {
            const dateMs = parseDateMs(item.attendanceLimitDate);
            return dateMs != null && dateMs >= todayMs && dateMs <= thresholdMs;
        }).length;
        const totalPrazoVencido = all.filter((item) => {
            const dateMs = parseDateMs(item.attendanceLimitDate);
            return dateMs != null && dateMs < todayMs;
        }).length;
        return {
            merchantId,
            openingDate,
            totalNotificacoes: notificacoes.total,
            totalSolicitacoes: solicitacoes.total,
            totalAberto: notificacoes.total + solicitacoes.total,
            totalEmAnalise,
            totalFraudeSuspeita,
            totalPrazoProximo,
            totalPrazoVencido,
            valorTotalProcesso: sumMoney(all, "processValue"),
            valorTotalTransacao: sumMoney(all, "transactionValue"),
        };
    }
}
