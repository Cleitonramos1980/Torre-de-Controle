import { env, hasOpenAiConfig } from "../../config/env.js";
import { AppError } from "../../utils/error.js";
const BASE_PROMPT = `Voce e um auditor financeiro especialista em:

- cartoes de credito
- adquirentes (Rede, Cielo, Stone)
- ERP WinThor
- contas a receber
- taxas MDR
- chargebacks

Analise:

VENDA:
{{venda}}

REDE:
{{rede}}

WINTHOR:
{{winthor}}

Retorne:

1. EXPLICACAO
2. DIAGNOSTICO
3. IMPACTO FINANCEIRO
4. RECOMENDACAO

5. ACAO GERADA:

EMAIL:
Texto profissional

CONTESTACAO:
Texto tecnico

TICKET:
Resumo interno

Regras:
- nao inventar dados
- ser objetivo
- usar apenas dados reais`;
function safeJsonStringify(value) {
    try {
        return JSON.stringify(value, null, 2);
    }
    catch {
        return "{}";
    }
}
function coerceString(value) {
    if (typeof value === "string")
        return value.trim();
    if (value == null)
        return "";
    return String(value).trim();
}
function extractJsonFromText(text) {
    const trimmed = text.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        try {
            return JSON.parse(trimmed);
        }
        catch {
            return null;
        }
    }
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
        const candidate = trimmed.slice(start, end + 1);
        try {
            return JSON.parse(candidate);
        }
        catch {
            return null;
        }
    }
    return null;
}
function parseSectionsFromText(text) {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const plain = lines.join(" ");
    return {
        explicacao: plain || "Nao foi possivel extrair explicacao da IA.",
        diagnostico: plain || "Nao foi possivel extrair diagnostico da IA.",
        impactoFinanceiro: plain || "Nao foi possivel extrair impacto financeiro da IA.",
        recomendacao: plain || "Nao foi possivel extrair recomendacao da IA.",
        acaoGerada: {
            email: plain || "Nao foi possivel gerar email.",
            contestacao: plain || "Nao foi possivel gerar contestacao.",
            ticket: plain || "Nao foi possivel gerar ticket.",
        },
        rawText: text,
    };
}
function parseModelResponse(content) {
    const parsed = extractJsonFromText(content);
    if (!parsed)
        return parseSectionsFromText(content);
    const actionRaw = (parsed.acaoGerada ?? parsed.acao_gerada ?? {});
    return {
        explicacao: coerceString(parsed.explicacao),
        diagnostico: coerceString(parsed.diagnostico),
        impactoFinanceiro: coerceString(parsed.impactoFinanceiro ?? parsed.impacto_financeiro),
        recomendacao: coerceString(parsed.recomendacao),
        acaoGerada: {
            email: coerceString(actionRaw.email),
            contestacao: coerceString(actionRaw.contestacao),
            ticket: coerceString(actionRaw.ticket),
        },
        rawText: content,
    };
}
export class AiFinancialService {
    logger;
    constructor(logger) {
        this.logger = logger;
    }
    getChatUrl() {
        return new URL("/chat/completions", env.OPENAI_BASE_URL).toString();
    }
    buildPrompt(record) {
        const base = BASE_PROMPT
            .replace("{{venda}}", safeJsonStringify(record.venda))
            .replace("{{rede}}", safeJsonStringify(record.rede))
            .replace("{{winthor}}", safeJsonStringify(record.winthor));
        const instruction = `\n\nRetorne APENAS JSON valido com este formato:
{
  "explicacao": "string",
  "diagnostico": "string",
  "impactoFinanceiro": "string",
  "recomendacao": "string",
  "acaoGerada": {
    "email": "string",
    "contestacao": "string",
    "ticket": "string"
  }
}

Contexto adicional da conciliacao:
${safeJsonStringify({
            id: record.id,
            status: record.status,
            matchScore: record.matchScore,
            diferencaValor: record.diferencaValor,
            reasons: record.reasons,
        })}`;
        return `${base}${instruction}`;
    }
    async analyzeDivergence(record) {
        if (!hasOpenAiConfig()) {
            throw new AppError("OPENAI_API_KEY nao configurada.", 503);
        }
        const startedAt = Date.now();
        const payload = {
            model: env.OPENAI_MODEL,
            temperature: env.OPENAI_TEMPERATURE,
            messages: [
                {
                    role: "system",
                    content: "Voce deve responder apenas com JSON valido, sem markdown, sem texto adicional.",
                },
                {
                    role: "user",
                    content: this.buildPrompt(record),
                },
            ],
        };
        let response;
        try {
            response = await fetch(this.getChatUrl(), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${env.OPENAI_API_KEY}`,
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(env.OPENAI_TIMEOUT_MS),
            });
        }
        catch (error) {
            this.logger.error({
                component: "AiFinancialService",
                action: "analyzeDivergence",
                divergenceId: record.id,
                durationMs: Date.now() - startedAt,
                error,
            }, "Falha de rede ao chamar OpenAI");
            throw new AppError("Falha de conexao com OpenAI.", 502);
        }
        if (!response.ok) {
            const body = await response.text();
            this.logger.error({
                component: "AiFinancialService",
                action: "analyzeDivergence",
                divergenceId: record.id,
                durationMs: Date.now() - startedAt,
                statusCode: response.status,
                body,
            }, "OpenAI retornou erro HTTP");
            throw new AppError(`Erro OpenAI (HTTP ${response.status}).`, 502);
        }
        let parsed;
        try {
            parsed = (await response.json());
        }
        catch (error) {
            this.logger.error({
                component: "AiFinancialService",
                action: "analyzeDivergence",
                divergenceId: record.id,
                durationMs: Date.now() - startedAt,
                error,
            }, "Resposta OpenAI invalida (JSON)");
            throw new AppError("Resposta invalida da OpenAI.", 502);
        }
        const content = parsed.choices?.[0]?.message?.content;
        if (!content) {
            throw new AppError("OpenAI nao retornou conteudo para analise.", 502);
        }
        const analysis = parseModelResponse(content);
        this.logger.info({
            component: "AiFinancialService",
            action: "analyzeDivergence",
            divergenceId: record.id,
            durationMs: Date.now() - startedAt,
        }, "Analise financeira gerada pela IA");
        return analysis;
    }
}
