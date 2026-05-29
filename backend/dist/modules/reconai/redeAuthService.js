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
export class RedeAuthService {
    logger;
    tokenCache = null;
    constructor(logger) {
        this.logger = logger;
    }
    getAuthUrl() {
        if (!env.REDE_BASE_URL) {
            throw new AppError("REDE_BASE_URL nao configurada.", 503);
        }
        return buildEndpointUrl(env.REDE_BASE_URL, env.REDE_AUTH_PATH);
    }
    isTokenValid() {
        if (!this.tokenCache)
            return false;
        return this.tokenCache.expiresAtMs > Date.now() + 30_000;
    }
    async getAccessToken(forceRefresh = false) {
        if (!hasRedeConfig()) {
            throw new AppError("Credenciais da REDE nao configuradas. Verifique REDE_CLIENT_ID/REDE_CLIENT_SECRET/REDE_BASE_URL.", 503);
        }
        if (!forceRefresh && this.isTokenValid()) {
            return this.tokenCache.accessToken;
        }
        const startedAt = Date.now();
        const authUrl = this.getAuthUrl();
        const credentials = Buffer.from(`${env.REDE_CLIENT_ID}:${env.REDE_CLIENT_SECRET}`).toString("base64");
        const payload = new URLSearchParams({ grant_type: "client_credentials" });
        let response;
        try {
            response = await fetch(authUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Authorization: `Basic ${credentials}`,
                },
                body: payload.toString(),
                signal: AbortSignal.timeout(env.REDE_TIMEOUT_MS),
            });
        }
        catch (error) {
            this.logger.error({
                component: "RedeAuthService",
                action: "getAccessToken",
                durationMs: Date.now() - startedAt,
                error,
            }, "Falha de rede ao autenticar na REDE");
            throw new AppError("Falha de conexao ao autenticar na API da REDE.", 502);
        }
        if (!response.ok) {
            const body = await safeReadBody(response);
            this.logger.error({
                component: "RedeAuthService",
                action: "getAccessToken",
                durationMs: Date.now() - startedAt,
                statusCode: response.status,
                body,
            }, "Autenticacao REDE retornou erro HTTP");
            if (response.status === 401 || response.status === 403) {
                throw new AppError("Credenciais REDE invalidas ou sem permissao.", 502);
            }
            throw new AppError(`Erro ao autenticar na REDE (HTTP ${response.status}).`, 502);
        }
        let tokenResponse;
        try {
            tokenResponse = (await response.json());
        }
        catch (error) {
            this.logger.error({
                component: "RedeAuthService",
                action: "getAccessToken",
                durationMs: Date.now() - startedAt,
                error,
            }, "Resposta de token REDE invalida");
            throw new AppError("Resposta invalida ao autenticar na API da REDE.", 502);
        }
        if (!tokenResponse.access_token) {
            this.logger.error({
                component: "RedeAuthService",
                action: "getAccessToken",
                durationMs: Date.now() - startedAt,
                tokenResponse,
            }, "Token REDE ausente na resposta");
            throw new AppError("Token de acesso da REDE nao retornado.", 502);
        }
        const expiresIn = Number(tokenResponse.expires_in ?? 300);
        this.tokenCache = {
            accessToken: tokenResponse.access_token,
            tokenType: tokenResponse.token_type ?? "Bearer",
            expiresAtMs: Date.now() + Math.max(30, expiresIn) * 1000,
        };
        this.logger.info({
            component: "RedeAuthService",
            action: "getAccessToken",
            durationMs: Date.now() - startedAt,
            expiresIn,
        }, "Token REDE obtido com sucesso");
        return this.tokenCache.accessToken;
    }
}
