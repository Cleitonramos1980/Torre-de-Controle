import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { hasOracleConfig } from "../../config/env.js";
import { initOraclePool } from "../../db/oracle.js";
import { execDml, queryOne, queryRows } from "../../repositories/baseRepository.js";
import { AppError } from "../../utils/error.js";
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DATE_BR_REGEX = /^\d{2}\/\d{2}\/\d{4}$/;
const snapshotRequestSchema = z.object({
    dataMovimento: z.string().trim().regex(DATE_REGEX),
    codfilial: z.string().trim().min(1).max(10).optional(),
    forceReprocess: z.coerce.boolean().optional().default(false),
});
const caixasListSchema = z.object({
    dataMovimento: z.string().trim().regex(DATE_REGEX),
    codfilial: z.string().trim().min(1).max(10).optional(),
    status: z.string().trim().optional(),
    risco: z.enum(["BAIXA", "MEDIA", "ALTA", "CRITICA"]).optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(5000).optional().default(50),
});
const resumoFechamentoSchema = z
    .object({
    dataMovimento: z.string().trim().optional(),
    dataInicio: z.string().trim().optional(),
    dataFim: z.string().trim().optional(),
    codfilial: z.string().trim().min(1).max(10).optional(),
    tipoResumo: z.enum(["FECHADO", "ABERTO"]).optional(),
})
    .superRefine((value, ctx) => {
    const hasDataMovimento = Boolean(value.dataMovimento);
    const hasDataInicio = Boolean(value.dataInicio);
    const hasDataFim = Boolean(value.dataFim);
    const isValidDateInput = (input) => DATE_REGEX.test(input) || DATE_BR_REGEX.test(input);
    if (!hasDataMovimento && !(hasDataInicio && hasDataFim)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Informe dataMovimento ou dataInicio/dataFim.",
            path: ["dataMovimento"],
        });
        return;
    }
    if ((hasDataInicio && !hasDataFim) || (!hasDataInicio && hasDataFim)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Informe dataInicio e dataFim juntos.",
            path: hasDataInicio ? ["dataFim"] : ["dataInicio"],
        });
    }
    if (hasDataMovimento && !isValidDateInput(value.dataMovimento ?? "")) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "dataMovimento invalida.",
            path: ["dataMovimento"],
        });
    }
    if (hasDataInicio && !isValidDateInput(value.dataInicio ?? "")) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "dataInicio invalida.",
            path: ["dataInicio"],
        });
    }
    if (hasDataFim && !isValidDateInput(value.dataFim ?? "")) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "dataFim invalida.",
            path: ["dataFim"],
        });
    }
});
const auditoriaFinalSchema = z.object({
    valorInformadoOperador: z.coerce.number().finite().optional(),
    valorAuditado: z.coerce.number().finite(),
    observacao: z.string().trim().max(4000).optional(),
});
const acertoSolicitacaoSchema = z.object({
    valor: z.coerce.number().finite(),
    justificativa: z.string().trim().min(5).max(4000),
    motivo: z.string().trim().min(3).max(500).optional(),
});
const acertoDecisaoSchema = z.object({
    observacao: z.string().trim().max(4000).optional(),
});
const anexarEvidenciaSchema = z.object({
    tipoEvidencia: z.string().trim().min(1).max(80),
    nomeArquivoOriginal: z.string().trim().min(1).max(260),
    mimeType: z.string().trim().min(1).max(120),
    tamanhoBytes: z.coerce.number().int().min(0),
    hashArquivo: z.string().trim().min(16).max(128),
    storagePath: z.string().trim().min(1).max(500),
    observacao: z.string().trim().max(2000).optional(),
});
const finalizarFilialDiaSchema = z.object({
    codfilial: z.string().trim().min(1).max(10),
    dataMovimento: z.string().trim().regex(DATE_REGEX),
    observacao: z.string().trim().max(2000).optional(),
});
const compararSnapshotSchema = z.object({
    caixaId: z.string().trim().min(1),
});
const pacoteAuditoriaSchema = z.object({
    caixaId: z.string().trim().min(1),
});
const verifyLedgerSchema = z.object({
    caixaId: z.string().trim().optional(),
});
const caixaTransitions = {
    IDENTIFICADO_WINTHOR: ["ABERTO", "FECHADO_WINTHOR", "SNAPSHOT_GERADO"],
    ABERTO: ["FECHADO_WINTHOR", "CANCELADO_LOGICAMENTE"],
    FECHADO_WINTHOR: ["SNAPSHOT_GERADO", "EM_AUDITORIA"],
    SNAPSHOT_GERADO: ["EM_AUDITORIA", "REABERTO_COM_AUTORIZACAO"],
    EM_AUDITORIA: ["AUDITADO_SEM_DIVERGENCIA", "AUDITADO_COM_DIVERGENCIA"],
    AUDITADO_SEM_DIVERGENCIA: ["FINALIZADO"],
    AUDITADO_COM_DIVERGENCIA: ["ACERTO_SOLICITADO", "FINALIZADO"],
    ACERTO_SOLICITADO: ["ACERTO_EM_APROVACAO", "ACERTO_REPROVADO"],
    ACERTO_EM_APROVACAO: ["ACERTO_APROVADO", "ACERTO_REPROVADO"],
    ACERTO_APROVADO: ["FINALIZADO"],
    ACERTO_REPROVADO: ["ACERTO_SOLICITADO", "EM_AUDITORIA"],
    FINALIZADO: ["REABERTO_COM_AUTORIZACAO"],
    REABERTO_COM_AUTORIZACAO: ["EM_AUDITORIA", "FINALIZADO"],
    CANCELADO_LOGICAMENTE: [],
};
const sensitiveTokenMasks = [
    { key: "CGC", regex: /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g },
    { key: "CPF", regex: /\d{3}\.\d{3}\.\d{3}-\d{2}/g },
    { key: "CONTA", regex: /\b\d{4,20}\b/g },
];
function asString(value, fallback = "") {
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : fallback;
    }
    if (typeof value === "number" && Number.isFinite(value))
        return String(value);
    return fallback;
}
function asNumber(value) {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    return 0;
}
function asIsoDate(value) {
    if (!value)
        return null;
    const parsed = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(parsed.getTime()))
        return null;
    return parsed.toISOString();
}
function toDateOnly(value) {
    return new Date(`${value}T00:00:00.000Z`);
}
function normalizeDateInput(value) {
    const normalized = asString(value);
    if (DATE_BR_REGEX.test(normalized)) {
        const [dia, mes, ano] = normalized.split("/");
        return `${ano}-${mes}-${dia}`;
    }
    return normalized;
}
function toDateOnlyEnd(value) {
    return new Date(`${value}T23:59:59.999Z`);
}
function buildDateRange(startIso, endIso) {
    const start = new Date(`${startIso}T00:00:00.000Z`);
    const end = new Date(`${endIso}T00:00:00.000Z`);
    const days = [];
    const cursor = new Date(start.getTime());
    while (cursor.getTime() <= end.getTime()) {
        days.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return days;
}
function round2(value) {
    return Number(value.toFixed(2));
}
function hashAny(input) {
    return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
function normalizeDia(value) {
    const parsed = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(parsed.getTime()))
        return new Date().toISOString().slice(0, 10);
    return parsed.toISOString().slice(0, 10);
}
function money(value) {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatWeekdayLabel(value) {
    const parsed = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(parsed.getTime()))
        return "";
    const label = new Intl.DateTimeFormat("pt-BR", {
        weekday: "long",
        timeZone: "UTC",
    }).format(parsed);
    return label
        .split("-")
        .map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
        .join("-");
}
export class CaixaAuditService {
    logger;
    constructor(logger) {
        this.logger = logger;
    }
    async ensurePool() {
        if (!hasOracleConfig()) {
            throw new AppError("Oracle WinThor nao configurado para acompanhamento de caixa. Verifique ORACLE_USER/ORACLE_PASSWORD/ORACLE_CONNECT_STRING.", 503);
        }
        await initOraclePool();
    }
    canAudit(perfil) {
        return ["ADMIN", "AUDITOR", "DIRETORIA"].includes(perfil.toUpperCase());
    }
    canApprove(perfil) {
        return ["ADMIN", "DIRETORIA"].includes(perfil.toUpperCase());
    }
    canFinalize(perfil) {
        return ["ADMIN", "DIRETORIA"].includes(perfil.toUpperCase());
    }
    maskSensitiveByPerfil(perfil, input) {
        if (["ADMIN", "DIRETORIA", "AUDITOR"].includes(perfil.toUpperCase()))
            return input;
        let masked = input;
        for (const token of sensitiveTokenMasks) {
            masked = masked.replace(token.regex, `[${token.key}_MASCARADO]`);
        }
        return masked;
    }
    async resolvePcprestColumns() {
        await this.ensurePool();
        const rows = await queryRows(`SELECT COLUMN_NAME
         FROM ALL_TAB_COLUMNS
        WHERE TABLE_NAME = 'PCPREST'`);
        return new Set(rows.map((row) => row.COLUMN_NAME.toUpperCase()));
    }
    resolveColumn(set, candidates) {
        for (const candidate of candidates) {
            const key = candidate.toUpperCase();
            if (set.has(key))
                return key;
        }
        return null;
    }
    async resolvePcprestMapping() {
        const columns = await this.resolvePcprestColumns();
        const codfilial = this.resolveColumn(columns, ["CODFILIAL"]);
        const dataMovimento = this.resolveColumn(columns, ["DTMOVIMENTOCX", "DTFECHA", "DTEMISSAO", "DATA"]);
        const dataMovimentoFallback = dataMovimento === "DTMOVIMENTOCX"
            ? this.resolveColumn(columns, ["DTFECHA", "DTEMISSAO", "DATA"])
            : null;
        const numcheckout = this.resolveColumn(columns, ["NUMCHECKOUT", "NUMCAIXA", "NUMECF", "NUMPDV"]);
        const codfunccheckout = this.resolveColumn(columns, ["CODFUNCCHECKOUT", "CODFUNC", "CODUSUR"]);
        const valor = this.resolveColumn(columns, ["VALOR", "VLTOTAL", "VLRPAGO", "VLPAGO"]);
        if (!codfilial || !dataMovimento || !numcheckout || !codfunccheckout || !valor) {
            throw new AppError("PCPREST sem colunas minimas para acompanhamento de caixa (CODFILIAL, data, checkout, operador, valor).", 500);
        }
        return {
            codfilial,
            dataMovimento,
            dataMovimentoFallback,
            numcheckout,
            codfunccheckout,
            valor,
            dtfecha: this.resolveColumn(columns, ["DTFECHA"]),
            dtcancel: this.resolveColumn(columns, ["DTCANCEL"]),
            dtestorno: this.resolveColumn(columns, ["DTESTORNO"]),
            numtransvenda: this.resolveColumn(columns, ["NUMTRANSVENDA", "NUMTRANS"]),
            prest: this.resolveColumn(columns, ["PREST"]),
            codcob: this.resolveColumn(columns, ["CODCOB"]),
            nsu: this.resolveColumn(columns, ["NSUTEF", "NSU"]),
            codaut: this.resolveColumn(columns, ["CODAUTORIZACAOTEF", "CODAUTORIZACAO"]),
        };
    }
    buildSnapshotSql(mapping, includeFilial, options = {}) {
        const includeOrder = options.includeOrder !== false;
        const dtfechaExpr = mapping.dtfecha ? `P.${mapping.dtfecha}` : "NULL";
        const numtransExpr = mapping.numtransvenda ? `TO_CHAR(P.${mapping.numtransvenda})` : "NULL";
        const prestExpr = mapping.prest ? `TO_CHAR(P.${mapping.prest})` : "NULL";
        const codcobExpr = mapping.codcob ? `TO_CHAR(P.${mapping.codcob})` : "NULL";
        const nsuExpr = mapping.nsu ? `TO_CHAR(P.${mapping.nsu})` : "NULL";
        const codautExpr = mapping.codaut ? `TO_CHAR(P.${mapping.codaut})` : "NULL";
        const dataMovimentoExpr = mapping.dataMovimentoFallback
            ? `COALESCE(P.${mapping.dataMovimento}, P.${mapping.dataMovimentoFallback})`
            : `P.${mapping.dataMovimento}`;
        const whereClauses = [
            `TRUNC(${dataMovimentoExpr}) BETWEEN :data_inicio AND :data_fim`,
            `NVL(P.${mapping.valor},0) <> 0`,
            `NVL(P.${mapping.numcheckout}, 0) <> 0`,
        ];
        if (includeFilial) {
            whereClauses.push(`TO_CHAR(P.${mapping.codfilial}) = :codfilial`);
        }
        if (mapping.codcob) {
            whereClauses.push(`TO_CHAR(P.${mapping.codcob}) NOT IN ('DESD','DEVT','DEVP','ESTR','CANC')`);
        }
        if (mapping.dtcancel) {
            whereClauses.push(`P.${mapping.dtcancel} IS NULL`);
        }
        if (mapping.dtestorno) {
            whereClauses.push(`P.${mapping.dtestorno} IS NULL`);
        }
        const orderBy = includeOrder
            ? `\n    ORDER BY TO_CHAR(P.${mapping.codfilial}), TRUNC(${dataMovimentoExpr}), TO_CHAR(P.${mapping.numcheckout}), TO_CHAR(P.${mapping.codfunccheckout})`
            : "";
        return `SELECT
      TO_CHAR(P.${mapping.codfilial}) AS CODFILIAL,
      TRUNC(${dataMovimentoExpr}) AS DATA_MOVIMENTO,
      TO_CHAR(P.${mapping.numcheckout}) AS NUMCHECKOUT,
      TO_CHAR(P.${mapping.codfunccheckout}) AS CODFUNCCHECKOUT,
      ${dtfechaExpr} AS DTFECHA,
      ${numtransExpr} AS NUMTRANSVENDA,
      ${prestExpr} AS PREST,
      ${codcobExpr} AS CODCOB,
      NVL(P.${mapping.valor}, 0) AS VALOR,
      ${nsuExpr} AS NSUTEF,
      ${codautExpr} AS CODAUTORIZACAOTEF
    FROM PCPREST P
    WHERE ${whereClauses.join("\n      AND ")}
    ${orderBy}`;
    }
    buildCaixaKey(row) {
        const codfilial = asString(row.CODFILIAL, "SEM_FILIAL");
        const dataMovimento = normalizeDia(asIsoDate(row.DATA_MOVIMENTO) ?? new Date().toISOString());
        const numcheckout = asString(row.NUMCHECKOUT, "SEM_CHECKOUT");
        const codfunccheckout = asString(row.CODFUNCCHECKOUT, "SEM_OPERADOR");
        return `${codfilial}|${dataMovimento}|${numcheckout}|${codfunccheckout}`;
    }
    parseCaixaKey(caixaKey) {
        const [codfilial, dataMovimento, numcheckout, codfunccheckout] = caixaKey.split("|");
        return {
            codfilial: codfilial ?? "SEM_FILIAL",
            dataMovimento: dataMovimento ?? new Date().toISOString().slice(0, 10),
            numcheckout: numcheckout ?? "SEM_CHECKOUT",
            codfunccheckout: codfunccheckout ?? "SEM_OPERADOR",
        };
    }
    buildRowKey(row) {
        return [
            asString(row.NUMTRANSVENDA, "SEM_TRANS"),
            asString(row.PREST, "SEM_PREST"),
            asString(row.CODCOB, "SEM_CODCOB"),
            asString(row.NSUTEF, "SEM_NSU"),
            asString(row.CODAUTORIZACAOTEF, "SEM_AUT"),
        ].join("|");
    }
    computeRisk(params) {
        let score = 0;
        const motivos = [];
        const absDiff = Math.abs(params.diferencaFinal);
        if (absDiff > 10000) {
            score += 40;
            motivos.push("Divergencia acima de R$ 10.000,00.");
        }
        else if (absDiff > 5000) {
            score += 25;
            motivos.push("Divergencia acima de R$ 5.000,00.");
        }
        else if (absDiff > 1000) {
            score += 10;
            motivos.push("Divergencia acima de R$ 1.000,00.");
        }
        const perc = params.valorEsperadoWinthor > 0 ? absDiff / params.valorEsperadoWinthor : 0;
        if (perc >= 0.1) {
            score += 25;
            motivos.push("Percentual de divergencia acima de 10%.");
        }
        else if (perc >= 0.05) {
            score += 15;
            motivos.push("Percentual de divergencia acima de 5%.");
        }
        if (params.qtdAjustesPendentes > 0) {
            score += 15;
            motivos.push("Possui ajuste pendente.");
        }
        if (params.qtdAjustesReprovados > 0) {
            score += 15;
            motivos.push("Possui ajuste reprovado.");
        }
        if (params.qtdReabertura > 0) {
            score += 10;
            motivos.push("Caixa reaberto com autorizacao.");
        }
        if (params.qtdTentativasBypass > 0) {
            score += 20;
            motivos.push("Tentativas de bypass detectadas.");
        }
        const bounded = Math.min(100, Math.max(0, score));
        if (bounded >= 81)
            return { riscoScore: bounded, riscoNivel: "CRITICA", motivos };
        if (bounded >= 61)
            return { riscoScore: bounded, riscoNivel: "ALTA", motivos };
        if (bounded >= 31)
            return { riscoScore: bounded, riscoNivel: "MEDIA", motivos };
        return { riscoScore: bounded, riscoNivel: "BAIXA", motivos };
    }
    allowedTransition(from, to) {
        const list = caixaTransitions[from] ?? [];
        return list.includes(to);
    }
    normalizeStatusFilter(status) {
        const value = asString(status).toUpperCase();
        if (!value)
            return null;
        if (value === "FECHADO")
            return "FECHADO_WINTHOR";
        if (value === "EM_CONFERENCIA")
            return "SNAPSHOT_GERADO";
        return value;
    }
    async ensureDailySummaryIfMissing(params) {
        const binds = {
            data_movimento: toDateOnly(params.dataMovimento),
        };
        const where = ["DATA_MOVIMENTO = :data_movimento"];
        if (params.codfilial) {
            where.push("CODFILIAL = :codfilial");
            binds.codfilial = params.codfilial;
        }
        const existing = await queryOne(`SELECT COUNT(*) AS TOTAL
       FROM RC_CAIXA_AUDIT_SUMMARY
       WHERE ${where.join(" AND ")}`, binds);
        if (asNumber(existing?.TOTAL) > 0)
            return;
        try {
            await this.hydrateSummaryFromWinthor(params);
        }
        catch (error) {
            this.logger?.warn?.({
                error,
                dataMovimento: params.dataMovimento,
                codfilial: params.codfilial ?? null,
            }, "Falha ao hidratar resumo de caixas a partir do WinThor.");
        }
    }
    async hydrateSummaryFromWinthor(params) {
        await this.ensurePool();
        const mapping = await this.resolvePcprestMapping();
        const baseSql = this.buildSnapshotSql(mapping, Boolean(params.codfilial), { includeOrder: false });
        const binds = {
            data_inicio: toDateOnly(params.dataMovimento),
            data_fim: toDateOnlyEnd(params.dataMovimento),
        };
        if (params.codfilial) {
            binds.codfilial = params.codfilial;
        }
        const caixas = await queryRows(`SELECT
        CODFILIAL,
        DATA_MOVIMENTO,
        NUMCHECKOUT,
        CODFUNCCHECKOUT,
        ROUND(SUM(NVL(VALOR, 0)), 2) AS VALOR_ESPERADO_WINTHOR,
        MAX(CASE WHEN DTFECHA IS NULL THEN 1 ELSE 0 END) AS TEM_ABERTO
      FROM (
        ${baseSql}
      )
      GROUP BY CODFILIAL, DATA_MOVIMENTO, NUMCHECKOUT, CODFUNCCHECKOUT`, binds);
        for (const row of caixas) {
            const key = {
                codfilial: asString(row.CODFILIAL),
                dataMovimento: normalizeDia(row.DATA_MOVIMENTO),
                numcheckout: asString(row.NUMCHECKOUT),
                codfunccheckout: asString(row.CODFUNCCHECKOUT),
            };
            const existing = await this.getSummaryByKey(key);
            const expected = round2(asNumber(row.VALOR_ESPERADO_WINTHOR));
            const statusBase = asNumber(row.TEM_ABERTO) > 0 ? "ABERTO" : "FECHADO_WINTHOR";
            await execDml(`MERGE INTO RC_CAIXA_AUDIT_SUMMARY T
          USING (
            SELECT
              :id AS ID,
              :codfilial AS CODFILIAL,
              :data_movimento AS DATA_MOVIMENTO,
              :numcheckout AS NUMCHECKOUT,
              :codfunccheckout AS CODFUNCCHECKOUT
            FROM DUAL
          ) S
          ON (T.CODFILIAL = S.CODFILIAL
              AND T.DATA_MOVIMENTO = S.DATA_MOVIMENTO
              AND T.NUMCHECKOUT = S.NUMCHECKOUT
              AND T.CODFUNCCHECKOUT = S.CODFUNCCHECKOUT)
          WHEN MATCHED THEN UPDATE SET
            T.STATUS_CAIXA = CASE
              WHEN T.STATUS_CAIXA IN (
                'EM_AUDITORIA',
                'AUDITADO_SEM_DIVERGENCIA',
                'AUDITADO_COM_DIVERGENCIA',
                'ACERTO_SOLICITADO',
                'ACERTO_EM_APROVACAO',
                'ACERTO_APROVADO',
                'ACERTO_REPROVADO',
                'FINALIZADO'
              ) THEN T.STATUS_CAIXA
              ELSE :status_caixa_base
            END,
            T.STATUS_FILIAL_DIA = 'EM_CONFERENCIA',
            T.VALOR_ESPERADO_WINTHOR = :valor_esperado_winthor,
            T.DIFERENCA_ORIGINAL = CASE
              WHEN T.VALOR_INFORMADO_OPERADOR IS NULL THEN NULL
              ELSE :diferenca_original
            END,
            T.DIFERENCA_FINAL = CASE
              WHEN T.VALOR_AUDITADO IS NULL THEN :diferenca_final_sem_auditoria
              ELSE :diferenca_final_com_auditoria
            END,
            T.ATUALIZADO_EM = SYSTIMESTAMP
          WHEN NOT MATCHED THEN INSERT (
            ID, CODFILIAL, DATA_MOVIMENTO, NUMCHECKOUT, CODFUNCCHECKOUT,
            STATUS_CAIXA, STATUS_FILIAL_DIA,
            VALOR_ESPERADO_WINTHOR, VALOR_INFORMADO_OPERADOR, VALOR_AUDITADO, VALOR_ACERTOS_APROVADOS,
            DIFERENCA_ORIGINAL, DIFERENCA_FINAL,
            RISCO_SCORE, RISCO_NIVEL,
            ULTIMO_SNAPSHOT_ID, ULTIMA_SQL_VERSAO, ULTIMA_SQL_HASH, ULTIMO_RESULT_HASH,
            SNAPSHOT_GERADO_EM, CRIADO_EM, ATUALIZADO_EM
          ) VALUES (
            :id, :codfilial, :data_movimento, :numcheckout, :codfunccheckout,
            :status_caixa_base, 'EM_CONFERENCIA',
            :valor_esperado_winthor, NULL, NULL, 0,
            NULL, :diferenca_final_sem_auditoria,
            0, 'BAIXA',
            NULL, NULL, NULL, NULL,
            NULL, SYSTIMESTAMP, SYSTIMESTAMP
          )`, {
                id: existing?.ID ? asString(existing.ID) : randomUUID(),
                codfilial: key.codfilial,
                data_movimento: toDateOnly(key.dataMovimento),
                numcheckout: key.numcheckout,
                codfunccheckout: key.codfunccheckout,
                status_caixa_base: statusBase,
                valor_esperado_winthor: expected,
                diferenca_original: existing?.VALOR_INFORMADO_OPERADOR == null ? null : round2(expected - asNumber(existing?.VALOR_INFORMADO_OPERADOR)),
                diferenca_final_sem_auditoria: existing?.VALOR_AUDITADO == null
                    ? expected
                    : round2(expected - (asNumber(existing?.VALOR_AUDITADO) + asNumber(existing?.VALOR_ACERTOS_APROVADOS))),
                diferenca_final_com_auditoria: existing?.VALOR_AUDITADO == null
                    ? expected
                    : round2(expected - (asNumber(existing?.VALOR_AUDITADO) + asNumber(existing?.VALOR_ACERTOS_APROVADOS))),
            });
        }
    }
    async getSummaryById(caixaId) {
        return queryOne(`SELECT
        ID, CODFILIAL, DATA_MOVIMENTO, NUMCHECKOUT, CODFUNCCHECKOUT,
        STATUS_CAIXA, STATUS_FILIAL_DIA,
        VALOR_ESPERADO_WINTHOR, VALOR_INFORMADO_OPERADOR, VALOR_AUDITADO, VALOR_ACERTOS_APROVADOS,
        DIFERENCA_ORIGINAL, DIFERENCA_FINAL, RISCO_SCORE, RISCO_NIVEL,
        ULTIMO_SNAPSHOT_ID, ULTIMA_SQL_VERSAO, ULTIMA_SQL_HASH, ULTIMO_RESULT_HASH, SNAPSHOT_GERADO_EM,
        CRIADO_EM, ATUALIZADO_EM
      FROM RC_CAIXA_AUDIT_SUMMARY
      WHERE ID = :id`, { id: caixaId });
    }
    async getSummaryByKey(params) {
        return queryOne(`SELECT
        ID, CODFILIAL, DATA_MOVIMENTO, NUMCHECKOUT, CODFUNCCHECKOUT,
        STATUS_CAIXA, STATUS_FILIAL_DIA,
        VALOR_ESPERADO_WINTHOR, VALOR_INFORMADO_OPERADOR, VALOR_AUDITADO, VALOR_ACERTOS_APROVADOS,
        DIFERENCA_ORIGINAL, DIFERENCA_FINAL, RISCO_SCORE, RISCO_NIVEL,
        ULTIMO_SNAPSHOT_ID, ULTIMA_SQL_VERSAO, ULTIMA_SQL_HASH, ULTIMO_RESULT_HASH, SNAPSHOT_GERADO_EM,
        CRIADO_EM, ATUALIZADO_EM
      FROM RC_CAIXA_AUDIT_SUMMARY
      WHERE CODFILIAL = :codfilial
        AND DATA_MOVIMENTO = :data_movimento
        AND NUMCHECKOUT = :numcheckout
        AND CODFUNCCHECKOUT = :codfunccheckout`, {
            codfilial: params.codfilial,
            data_movimento: toDateOnly(params.dataMovimento),
            numcheckout: params.numcheckout,
            codfunccheckout: params.codfunccheckout,
        });
    }
    async getNextSnapshotVersion(caixaId) {
        const row = await queryOne(`SELECT MAX(SNAPSHOT_VERSION) AS MAX_VER
         FROM RC_CAIXA_AUDIT_SNAPSHOT
        WHERE CAIXA_ID = :caixa_id`, { caixa_id: caixaId });
        const current = asNumber(row?.MAX_VER);
        return Math.trunc(current) + 1;
    }
    async ensureSqlCatalog(nomeConsulta, sqlText, actor) {
        const hashSql = hashAny(sqlText);
        const latest = await queryOne(`SELECT VERSAO, HASH_SQL
         FROM RC_CAIXA_SQL_CATALOG
        WHERE NOME_CONSULTA = :nome
        ORDER BY VERSAO DESC
        FETCH FIRST 1 ROWS ONLY`, { nome: nomeConsulta });
        if (latest && latest.HASH_SQL === hashSql) {
            return { versao: asNumber(latest.VERSAO), hashSql };
        }
        const novaVersao = latest ? asNumber(latest.VERSAO) + 1 : 1;
        await execDml(`INSERT INTO RC_CAIXA_SQL_CATALOG (
        ID, NOME_CONSULTA, VERSAO, HASH_SQL, SQL_TEXT,
        ALTERADO_POR_ID, ALTERADO_POR_NOME, ALTERADO_EM, MOTIVO_ALTERACAO
      ) VALUES (
        :id, :nome, :versao, :hash_sql, :sql_text,
        :user_id, :user_name, SYSTIMESTAMP, :motivo
      )`, {
            id: randomUUID(),
            nome: nomeConsulta,
            versao: novaVersao,
            hash_sql: hashSql,
            sql_text: sqlText,
            user_id: actor.userId,
            user_name: actor.userName,
            motivo: "Atualizacao de SQL versionada para snapshot de caixa.",
        });
        return { versao: novaVersao, hashSql };
    }
    async appendLedgerEvent(input) {
        const payloadHash = hashAny(input.payload);
        const payloadJson = JSON.stringify(input.payload);
        const previous = await queryOne(`SELECT HASH_EVENTO, SEQ_NUM
         FROM RC_CAIXA_AUDIT_EVENT_LEDGER
        WHERE AGGREGATE_TYPE = :aggregate_type
          AND AGGREGATE_ID = :aggregate_id
        ORDER BY SEQ_NUM DESC
        FETCH FIRST 1 ROWS ONLY`, {
            aggregate_type: input.aggregateType,
            aggregate_id: input.aggregateId,
        });
        const nextSeq = previous ? asNumber(previous.SEQ_NUM) + 1 : 1;
        const prevHash = previous?.HASH_EVENTO ?? null;
        const hashEvento = hashAny({
            aggregateType: input.aggregateType,
            aggregateId: input.aggregateId,
            eventType: input.eventType,
            payloadHash,
            prevHash,
            seq: nextSeq,
            actorId: input.actor.userId,
            correlationId: input.actor.correlationId,
            requestId: input.actor.requestId,
        });
        await execDml(`INSERT INTO RC_CAIXA_AUDIT_EVENT_LEDGER (
        ID, AGGREGATE_TYPE, AGGREGATE_ID, EVENTO_TIPO, EVENTO_VERSAO,
        PAYLOAD_JSON, PAYLOAD_HASH, HASH_EVENTO, HASH_EVENTO_ANTERIOR,
        USUARIO_ID, USUARIO_NOME, PERFIL_USUARIO,
        CODFILIAL, DATA_MOVIMENTO, NUMCHECKOUT, CODFUNCCHECKOUT,
        CORRELATION_ID, REQUEST_ID, IP_ORIGEM, USER_AGENT,
        CRIADO_EM_UTC, CRIADO_EM_LOCAL, TIMEZONE_LOCAL,
        MOTIVO, OBSERVACAO, SEQ_NUM
      ) VALUES (
        :id, :aggregate_type, :aggregate_id, :evento_tipo, :evento_versao,
        :payload_json, :payload_hash, :hash_evento, :hash_evento_anterior,
        :usuario_id, :usuario_nome, :perfil_usuario,
        :codfilial, :data_movimento, :numcheckout, :codfunccheckout,
        :correlation_id, :request_id, :ip_origem, :user_agent,
        SYSTIMESTAMP, SYSTIMESTAMP, :timezone_local,
        :motivo, :observacao, :seq_num
      )`, {
            id: randomUUID(),
            aggregate_type: input.aggregateType,
            aggregate_id: input.aggregateId,
            evento_tipo: input.eventType,
            evento_versao: 1,
            payload_json: payloadJson,
            payload_hash: payloadHash,
            hash_evento: hashEvento,
            hash_evento_anterior: prevHash,
            usuario_id: input.actor.userId,
            usuario_nome: input.actor.userName,
            perfil_usuario: input.actor.perfil,
            codfilial: input.codfilial ?? null,
            data_movimento: input.dataMovimento ? toDateOnly(input.dataMovimento) : null,
            numcheckout: input.numcheckout ?? null,
            codfunccheckout: input.codfunccheckout ?? null,
            correlation_id: input.actor.correlationId,
            request_id: input.actor.requestId,
            ip_origem: input.actor.ipOrigem,
            user_agent: input.actor.userAgent,
            timezone_local: "America/Santiago",
            motivo: input.motivo ?? null,
            observacao: input.observacao ?? null,
            seq_num: nextSeq,
        });
    }
    async logBypass(params) {
        try {
            await this.appendLedgerEvent({
                aggregateType: "CAIXA",
                aggregateId: params.caixaId,
                eventType: "TENTATIVA_BYPASS_BLOQUEADA",
                payload: {
                    action: params.action,
                    reason: params.reason,
                    payload: params.payload ?? {},
                },
                actor: params.actor,
                motivo: params.reason,
            });
        }
        catch (error) {
            this.logger.error({ error, action: params.action, reason: params.reason }, "Falha ao registrar tentativa de bypass.");
        }
    }
    assertCanAudit(actor, caixa) {
        if (!this.canAudit(actor.perfil)) {
            void this.logBypass({
                actor,
                caixaId: caixa.ID,
                action: "AUDITORIA",
                reason: "Perfil sem permissao para auditar.",
            });
            throw new AppError("Perfil sem permissao para auditar caixa.", 403);
        }
        if (caixa.CODFUNCCHECKOUT === actor.userId) {
            void this.logBypass({
                actor,
                caixaId: caixa.ID,
                action: "AUDITORIA",
                reason: "Operador nao pode auditar proprio caixa.",
            });
            throw new AppError("Operador nao pode auditar o proprio caixa.", 403);
        }
    }
    assertCanApprove(actor, acerto) {
        if (!this.canApprove(actor.perfil)) {
            throw new AppError("Perfil sem permissao para aprovar acertos.", 403);
        }
        if (acerto.SOLICITANTE_ID === actor.userId) {
            throw new AppError("Solicitante nao pode aprovar o proprio acerto.", 403);
        }
    }
    async updateSummaryMetrics(caixaId) {
        const summary = await this.getSummaryById(caixaId);
        if (!summary) {
            throw new AppError("Caixa nao encontrado.", 404);
        }
        const acertos = await queryRows(`SELECT
        ID, CAIXA_ID, STATUS, VALOR, JUSTIFICATIVA, MOTIVO,
        SOLICITANTE_ID, SOLICITANTE_NOME, APROVADOR_ID, APROVADOR_NOME,
        APROVADO_EM, REPROVADO_EM, OBSERVACAO_DECISAO, REQUEST_ID, CRIADO_EM, ATUALIZADO_EM
      FROM RC_CAIXA_AUDIT_ACERTO
      WHERE CAIXA_ID = :caixa_id`, { caixa_id: caixaId });
        const valorAcertosAprovados = round2(acertos
            .filter((row) => row.STATUS === "ACERTO_APROVADO")
            .reduce((sum, row) => sum + asNumber(row.VALOR), 0));
        const valorAuditado = summary.VALOR_AUDITADO ?? summary.VALOR_INFORMADO_OPERADOR ?? summary.VALOR_ESPERADO_WINTHOR;
        const valorFinalAuditado = round2(valorAuditado + valorAcertosAprovados);
        const diferencaFinal = round2(summary.VALOR_ESPERADO_WINTHOR - valorFinalAuditado);
        const diferencaOriginal = summary.VALOR_INFORMADO_OPERADOR == null
            ? null
            : round2(summary.VALOR_ESPERADO_WINTHOR - summary.VALOR_INFORMADO_OPERADOR);
        const reaberturas = await queryOne(`SELECT COUNT(*) AS TOTAL
       FROM RC_CAIXA_AUDIT_EVENT_LEDGER
       WHERE AGGREGATE_TYPE = 'CAIXA'
         AND AGGREGATE_ID = :caixa_id
         AND EVENTO_TIPO = 'CAIXA_REABERTO'`, { caixa_id: caixaId });
        const bypass = await queryOne(`SELECT COUNT(*) AS TOTAL
       FROM RC_CAIXA_AUDIT_EVENT_LEDGER
       WHERE AGGREGATE_TYPE = 'CAIXA'
         AND AGGREGATE_ID = :caixa_id
         AND EVENTO_TIPO = 'TENTATIVA_BYPASS_BLOQUEADA'`, { caixa_id: caixaId });
        const risk = this.computeRisk({
            valorEsperadoWinthor: asNumber(summary.VALOR_ESPERADO_WINTHOR),
            diferencaFinal,
            qtdAjustesPendentes: acertos.filter((row) => row.STATUS === "ACERTO_EM_APROVACAO" || row.STATUS === "ACERTO_SOLICITADO").length,
            qtdAjustesReprovados: acertos.filter((row) => row.STATUS === "ACERTO_REPROVADO").length,
            qtdReabertura: asNumber(reaberturas?.TOTAL),
            qtdTentativasBypass: asNumber(bypass?.TOTAL),
        });
        await execDml(`UPDATE RC_CAIXA_AUDIT_SUMMARY
          SET VALOR_ACERTOS_APROVADOS = :valor_acertos_aprovados,
              DIFERENCA_ORIGINAL = :diferenca_original,
              DIFERENCA_FINAL = :diferenca_final,
              RISCO_SCORE = :risco_score,
              RISCO_NIVEL = :risco_nivel,
              ATUALIZADO_EM = SYSTIMESTAMP
        WHERE ID = :id`, {
            id: caixaId,
            valor_acertos_aprovados: valorAcertosAprovados,
            diferenca_original: diferencaOriginal,
            diferenca_final: diferencaFinal,
            risco_score: risk.riscoScore,
            risco_nivel: risk.riscoNivel,
        });
        const updated = await this.getSummaryById(caixaId);
        if (!updated)
            throw new AppError("Caixa nao encontrado apos atualizar metricas.", 500);
        return updated;
    }
    async setCaixaStatus(params) {
        const summary = await this.getSummaryById(params.caixaId);
        if (!summary)
            throw new AppError("Caixa nao encontrado.", 404);
        if (!this.allowedTransition(summary.STATUS_CAIXA, params.nextStatus)) {
            await this.logBypass({
                actor: params.actor,
                caixaId: params.caixaId,
                action: "MUDANCA_STATUS_CAIXA",
                reason: `Transicao invalida: ${summary.STATUS_CAIXA} -> ${params.nextStatus}`,
            });
            throw new AppError(`Transicao de estado invalida: ${summary.STATUS_CAIXA} -> ${params.nextStatus}.`, 422);
        }
        await execDml(`UPDATE RC_CAIXA_AUDIT_SUMMARY
          SET STATUS_CAIXA = :status_caixa,
              ATUALIZADO_EM = SYSTIMESTAMP
        WHERE ID = :id`, { id: params.caixaId, status_caixa: params.nextStatus });
        await this.appendLedgerEvent({
            aggregateType: "CAIXA",
            aggregateId: params.caixaId,
            eventType: params.nextStatus === "EM_AUDITORIA"
                ? "AUDITORIA_INICIADA"
                : params.nextStatus === "FINALIZADO"
                    ? "AUDITORIA_FINALIZADA"
                    : params.nextStatus === "REABERTO_COM_AUTORIZACAO"
                        ? "CAIXA_REABERTO"
                        : params.nextStatus === "SNAPSHOT_GERADO"
                            ? "SNAPSHOT_GERADO"
                            : "CONFIGURACAO_ALTERADA",
            payload: {
                from: summary.STATUS_CAIXA,
                to: params.nextStatus,
            },
            actor: params.actor,
            codfilial: summary.CODFILIAL,
            dataMovimento: normalizeDia(summary.DATA_MOVIMENTO),
            numcheckout: summary.NUMCHECKOUT,
            codfunccheckout: summary.CODFUNCCHECKOUT,
            motivo: params.motivo,
            observacao: params.observacao,
        });
        const updated = await this.getSummaryById(params.caixaId);
        if (!updated)
            throw new AppError("Caixa nao encontrado apos atualizar status.", 500);
        return updated;
    }
    async generateSnapshot(rawInput, actor) {
        const input = snapshotRequestSchema.parse(rawInput);
        await this.ensurePool();
        const mapping = await this.resolvePcprestMapping();
        const sql = this.buildSnapshotSql(mapping, Boolean(input.codfilial));
        const sqlMeta = await this.ensureSqlCatalog("PCPREST_CAIXA_SNAPSHOT", sql, actor);
        const snapshotBinds = {
            data_inicio: toDateOnly(input.dataMovimento),
            data_fim: toDateOnlyEnd(input.dataMovimento),
        };
        if (input.codfilial) {
            snapshotBinds.codfilial = input.codfilial;
        }
        const rows = await queryRows(sql, snapshotBinds);
        const grouped = new Map();
        for (const row of rows) {
            const key = this.buildCaixaKey(row);
            const list = grouped.get(key) ?? [];
            list.push(row);
            grouped.set(key, list);
        }
        let totalSnapshots = 0;
        let totalLinhas = 0;
        for (const [caixaKey, caixaRows] of grouped.entries()) {
            const keyData = this.parseCaixaKey(caixaKey);
            const existing = await this.getSummaryByKey(keyData);
            const caixaId = existing?.ID ?? randomUUID();
            if (existing &&
                !input.forceReprocess &&
                ["FINALIZADO", "ACERTO_EM_APROVACAO"].includes(existing.STATUS_CAIXA)) {
                await this.logBypass({
                    actor,
                    caixaId,
                    action: "SNAPSHOT_GERAR",
                    reason: "Caixa finalizado ou em aprovacao de acerto. Use forceReprocess.",
                    payload: keyData,
                });
                continue;
            }
            const snapshotVersion = await this.getNextSnapshotVersion(caixaId);
            const snapshotId = randomUUID();
            const expected = round2(caixaRows.reduce((sum, row) => sum + asNumber(row.VALOR), 0));
            const statusCaixaBase = caixaRows.some((row) => !row.DTFECHA) ? "ABERTO" : "FECHADO_WINTHOR";
            const rowHashes = [];
            for (const row of caixaRows) {
                const rowKey = this.buildRowKey(row);
                const rowHash = hashAny({
                    rowKey,
                    codfilial: asString(row.CODFILIAL),
                    dataMovimento: normalizeDia(asIsoDate(row.DATA_MOVIMENTO) ?? input.dataMovimento),
                    numcheckout: asString(row.NUMCHECKOUT),
                    codfunccheckout: asString(row.CODFUNCCHECKOUT),
                    dtfecha: asIsoDate(row.DTFECHA),
                    numtransvenda: asString(row.NUMTRANSVENDA, ""),
                    prest: asString(row.PREST, ""),
                    codcob: asString(row.CODCOB, ""),
                    valor: round2(asNumber(row.VALOR)),
                    nsu: asString(row.NSUTEF, ""),
                    codaut: asString(row.CODAUTORIZACAOTEF, ""),
                });
                rowHashes.push(rowHash);
                await execDml(`INSERT INTO RC_CAIXA_AUDIT_SNAPSHOT (
            ID, CAIXA_ID, SNAPSHOT_ID, SNAPSHOT_VERSION, ROW_KEY, ROW_HASH,
            CODFILIAL, DATA_MOVIMENTO, NUMCHECKOUT, CODFUNCCHECKOUT, DTFECHA,
            NUMTRANSVENDA, PREST, CODCOB, VALOR, NSUTEF, CODAUTORIZACAOTEF,
            SQL_NOME, SQL_VERSAO, SQL_HASH, PARAMETROS_JSON, PARAMETROS_HASH,
            RESULT_HASH, AMBIENTE_ORIGEM, SCHEMA_ORIGEM, CRIADO_EM
          ) VALUES (
            :id, :caixa_id, :snapshot_id, :snapshot_version, :row_key, :row_hash,
            :codfilial, :data_movimento, :numcheckout, :codfunccheckout, :dtfecha,
            :numtransvenda, :prest, :codcob, :valor, :nsutef, :codautorizacao,
            :sql_nome, :sql_versao, :sql_hash, :params_json, :params_hash,
            :result_hash, :ambiente_origem, :schema_origem, SYSTIMESTAMP
          )`, {
                    id: randomUUID(),
                    caixa_id: caixaId,
                    snapshot_id: snapshotId,
                    snapshot_version: snapshotVersion,
                    row_key: rowKey,
                    row_hash: rowHash,
                    codfilial: keyData.codfilial,
                    data_movimento: toDateOnly(keyData.dataMovimento),
                    numcheckout: keyData.numcheckout,
                    codfunccheckout: keyData.codfunccheckout,
                    dtfecha: row.DTFECHA ? new Date(String(row.DTFECHA)) : null,
                    numtransvenda: asString(row.NUMTRANSVENDA, ""),
                    prest: asString(row.PREST, ""),
                    codcob: asString(row.CODCOB, ""),
                    valor: round2(asNumber(row.VALOR)),
                    nsutef: asString(row.NSUTEF, ""),
                    codautorizacao: asString(row.CODAUTORIZACAOTEF, ""),
                    sql_nome: "PCPREST_CAIXA_SNAPSHOT",
                    sql_versao: sqlMeta.versao,
                    sql_hash: sqlMeta.hashSql,
                    params_json: JSON.stringify({
                        dataMovimento: input.dataMovimento,
                        codfilial: input.codfilial ?? null,
                    }),
                    params_hash: hashAny({ dataMovimento: input.dataMovimento, codfilial: input.codfilial ?? null }),
                    result_hash: "",
                    ambiente_origem: "ORACLE",
                    schema_origem: "PCPREST",
                });
                totalLinhas += 1;
            }
            const snapshotHash = hashAny({
                snapshotId,
                snapshotVersion,
                rowHashes,
            });
            await execDml(`UPDATE RC_CAIXA_AUDIT_SNAPSHOT
            SET RESULT_HASH = :result_hash
          WHERE SNAPSHOT_ID = :snapshot_id`, {
                result_hash: snapshotHash,
                snapshot_id: snapshotId,
            });
            await execDml(`MERGE INTO RC_CAIXA_AUDIT_SUMMARY T
          USING (
            SELECT
              :id AS ID,
              :codfilial AS CODFILIAL,
              :data_movimento AS DATA_MOVIMENTO,
              :numcheckout AS NUMCHECKOUT,
              :codfunccheckout AS CODFUNCCHECKOUT
            FROM DUAL
          ) S
          ON (T.CODFILIAL = S.CODFILIAL
              AND T.DATA_MOVIMENTO = S.DATA_MOVIMENTO
              AND T.NUMCHECKOUT = S.NUMCHECKOUT
              AND T.CODFUNCCHECKOUT = S.CODFUNCCHECKOUT)
          WHEN MATCHED THEN UPDATE SET
            T.STATUS_CAIXA = CASE
              WHEN T.STATUS_CAIXA IN (
                'EM_AUDITORIA',
                'AUDITADO_SEM_DIVERGENCIA',
                'AUDITADO_COM_DIVERGENCIA',
                'ACERTO_SOLICITADO',
                'ACERTO_EM_APROVACAO',
                'ACERTO_APROVADO',
                'ACERTO_REPROVADO',
                'FINALIZADO'
              ) THEN T.STATUS_CAIXA
              ELSE :status_caixa_base
            END,
            T.STATUS_FILIAL_DIA = 'EM_CONFERENCIA',
            T.VALOR_ESPERADO_WINTHOR = :valor_esperado_winthor,
            T.DIFERENCA_ORIGINAL = CASE WHEN T.VALOR_INFORMADO_OPERADOR IS NULL THEN NULL ELSE :diferenca_original END,
            T.DIFERENCA_FINAL = CASE WHEN T.VALOR_AUDITADO IS NULL THEN :diferenca_final_sem_auditoria ELSE :diferenca_final_com_auditoria END,
            T.ULTIMO_SNAPSHOT_ID = :ultimo_snapshot_id,
            T.ULTIMA_SQL_VERSAO = :ultima_sql_versao,
            T.ULTIMA_SQL_HASH = :ultima_sql_hash,
            T.ULTIMO_RESULT_HASH = :ultimo_result_hash,
            T.SNAPSHOT_GERADO_EM = SYSTIMESTAMP,
            T.ATUALIZADO_EM = SYSTIMESTAMP
          WHEN NOT MATCHED THEN INSERT (
            ID, CODFILIAL, DATA_MOVIMENTO, NUMCHECKOUT, CODFUNCCHECKOUT,
            STATUS_CAIXA, STATUS_FILIAL_DIA,
            VALOR_ESPERADO_WINTHOR, VALOR_INFORMADO_OPERADOR, VALOR_AUDITADO, VALOR_ACERTOS_APROVADOS,
            DIFERENCA_ORIGINAL, DIFERENCA_FINAL,
            RISCO_SCORE, RISCO_NIVEL,
            ULTIMO_SNAPSHOT_ID, ULTIMA_SQL_VERSAO, ULTIMA_SQL_HASH, ULTIMO_RESULT_HASH,
            SNAPSHOT_GERADO_EM, CRIADO_EM, ATUALIZADO_EM
          ) VALUES (
            :id, :codfilial, :data_movimento, :numcheckout, :codfunccheckout,
            :status_caixa_base, 'EM_CONFERENCIA',
            :valor_esperado_winthor, NULL, NULL, 0,
            NULL, :diferenca_final_sem_auditoria,
            0, 'BAIXA',
            :ultimo_snapshot_id, :ultima_sql_versao, :ultima_sql_hash, :ultimo_result_hash,
            SYSTIMESTAMP, SYSTIMESTAMP, SYSTIMESTAMP
          )`, {
                id: caixaId,
                codfilial: keyData.codfilial,
                data_movimento: toDateOnly(keyData.dataMovimento),
                numcheckout: keyData.numcheckout,
                codfunccheckout: keyData.codfunccheckout,
                status_caixa_base: statusCaixaBase,
                valor_esperado_winthor: expected,
                diferenca_original: existing?.VALOR_INFORMADO_OPERADOR == null ? null : round2(expected - (existing?.VALOR_INFORMADO_OPERADOR ?? 0)),
                diferenca_final_sem_auditoria: existing?.VALOR_AUDITADO == null
                    ? expected
                    : round2(expected - (existing.VALOR_AUDITADO + asNumber(existing.VALOR_ACERTOS_APROVADOS))),
                diferenca_final_com_auditoria: existing?.VALOR_AUDITADO == null
                    ? expected
                    : round2(expected - (existing.VALOR_AUDITADO + asNumber(existing.VALOR_ACERTOS_APROVADOS))),
                ultimo_snapshot_id: snapshotId,
                ultima_sql_versao: sqlMeta.versao,
                ultima_sql_hash: sqlMeta.hashSql,
                ultimo_result_hash: snapshotHash,
            });
            await this.appendLedgerEvent({
                aggregateType: "CAIXA",
                aggregateId: caixaId,
                eventType: "SNAPSHOT_GERADO",
                payload: {
                    snapshotId,
                    snapshotVersion,
                    rows: caixaRows.length,
                    valorEsperadoWinthor: expected,
                    sql: {
                        nomeConsulta: "PCPREST_CAIXA_SNAPSHOT",
                        versaoConsulta: sqlMeta.versao,
                        hashSql: sqlMeta.hashSql,
                        parametros: {
                            dataMovimento: input.dataMovimento,
                            codfilial: input.codfilial ?? null,
                        },
                        hashResultado: snapshotHash,
                    },
                },
                actor,
                codfilial: keyData.codfilial,
                dataMovimento: keyData.dataMovimento,
                numcheckout: keyData.numcheckout,
                codfunccheckout: keyData.codfunccheckout,
                motivo: "Snapshot WinThor gerado para auditoria de caixa.",
            });
            totalSnapshots += 1;
        }
        return {
            status: "ok",
            dataMovimento: input.dataMovimento,
            codfilial: input.codfilial ?? null,
            totalCaixasSnapshot: totalSnapshots,
            totalLinhasSnapshot: totalLinhas,
            sql: {
                nomeConsulta: "PCPREST_CAIXA_SNAPSHOT",
                versaoConsulta: sqlMeta.versao,
                hashSql: sqlMeta.hashSql,
            },
        };
    }
    async listCaixas(rawInput) {
        const input = caixasListSchema.parse(rawInput);
        const statusFilter = this.normalizeStatusFilter(input.status);
        if (statusFilter === "ABERTO") {
            try {
                await this.hydrateSummaryFromWinthor({
                    dataMovimento: input.dataMovimento,
                    codfilial: input.codfilial,
                });
            }
            catch (error) {
                this.logger?.warn?.({
                    error,
                    dataMovimento: input.dataMovimento,
                    codfilial: input.codfilial ?? null,
                }, "Falha ao sincronizar caixas em aberto a partir do WinThor.");
            }
        }
        await this.ensureDailySummaryIfMissing({
            dataMovimento: input.dataMovimento,
            codfilial: input.codfilial,
        });
        const binds = {
            data_movimento: toDateOnly(input.dataMovimento),
        };
        const usarFiltroAbertoPorRelatorio = statusFilter === "ABERTO";
        const paginationBinds = {
            offset_rows: (input.page - 1) * input.pageSize,
            fetch_rows: input.pageSize,
        };
        const where = ["DATA_MOVIMENTO = :data_movimento"];
        if (input.codfilial) {
            where.push("CODFILIAL = :codfilial");
            binds.codfilial = input.codfilial;
        }
        if (statusFilter && statusFilter !== "ALL" && !usarFiltroAbertoPorRelatorio) {
            where.push("STATUS_CAIXA = :status_caixa");
            binds.status_caixa = statusFilter;
        }
        if (input.risco) {
            where.push("RISCO_NIVEL = :risco_nivel");
            binds.risco_nivel = input.risco;
        }
        const whereSql = where.join(" AND ");
        const listBinds = {
            ...binds,
            ...(usarFiltroAbertoPorRelatorio
                ? { offset_rows: 0, fetch_rows: 5000 }
                : paginationBinds),
        };
        const rows = await queryRows(`SELECT
        ID, CODFILIAL, DATA_MOVIMENTO, NUMCHECKOUT, CODFUNCCHECKOUT,
        STATUS_CAIXA, STATUS_FILIAL_DIA, VALOR_ESPERADO_WINTHOR, VALOR_INFORMADO_OPERADOR, VALOR_AUDITADO, VALOR_ACERTOS_APROVADOS,
        DIFERENCA_ORIGINAL, DIFERENCA_FINAL, RISCO_SCORE, RISCO_NIVEL,
        ULTIMO_SNAPSHOT_ID, ULTIMA_SQL_VERSAO, ULTIMA_SQL_HASH, ULTIMO_RESULT_HASH, SNAPSHOT_GERADO_EM,
        CRIADO_EM, ATUALIZADO_EM
      FROM RC_CAIXA_AUDIT_SUMMARY
      WHERE ${whereSql}
      ORDER BY CODFILIAL, NUMCHECKOUT, CODFUNCCHECKOUT
      OFFSET :offset_rows ROWS FETCH NEXT :fetch_rows ROWS ONLY`, listBinds);
        const count = await queryOne(`SELECT COUNT(*) AS TOTAL
       FROM RC_CAIXA_AUDIT_SUMMARY
       WHERE ${whereSql}`, binds);
        const total = asNumber(count?.TOTAL);
        const mapped = rows.map((row) => ({
            id: row.ID,
            codfilial: row.CODFILIAL,
            dataMovimento: normalizeDia(row.DATA_MOVIMENTO),
            numcheckout: row.NUMCHECKOUT,
            codfunccheckout: row.CODFUNCCHECKOUT,
            statusCaixa: row.STATUS_CAIXA,
            statusFilialDia: row.STATUS_FILIAL_DIA,
            valorEsperadoWinthor: round2(asNumber(row.VALOR_ESPERADO_WINTHOR)),
            valorInformadoOperador: row.VALOR_INFORMADO_OPERADOR == null ? null : round2(asNumber(row.VALOR_INFORMADO_OPERADOR)),
            valorAuditado: row.VALOR_AUDITADO == null ? null : round2(asNumber(row.VALOR_AUDITADO)),
            valorAcertosAprovados: round2(asNumber(row.VALOR_ACERTOS_APROVADOS)),
            diferencaOriginal: row.DIFERENCA_ORIGINAL == null ? null : round2(asNumber(row.DIFERENCA_ORIGINAL)),
            diferencaFinal: row.DIFERENCA_FINAL == null ? null : round2(asNumber(row.DIFERENCA_FINAL)),
            riscoScore: row.RISCO_SCORE == null ? 0 : asNumber(row.RISCO_SCORE),
            riscoNivel: row.RISCO_NIVEL ?? "BAIXA",
            ultimoSnapshotId: row.ULTIMO_SNAPSHOT_ID,
            ultimaSqlVersao: row.ULTIMA_SQL_VERSAO,
            ultimaSqlHash: row.ULTIMA_SQL_HASH,
            ultimoResultHash: row.ULTIMO_RESULT_HASH,
            snapshotGeradoEm: asIsoDate(row.SNAPSHOT_GERADO_EM),
            criadoEm: asIsoDate(row.CRIADO_EM),
            atualizadoEm: asIsoDate(row.ATUALIZADO_EM),
            supervisorPrincipal: null,
            qtSupervisores: 0,
            emitentePrincipal: null,
            qtEmitentes: 0,
            qtdeTitulosWinthor: 0,
            vendaBrutaWinthor: 0,
            vendaLiquidaWinthor: 0,
            dinheiroWinthor: 0,
            cartaoTefWinthor: 0,
            cartaoPosWinthor: 0,
            outrosWinthor: 0,
        }));
        if (statusFilter === "ABERTO") {
            const bindsAberto = {
                DT1: toDateOnly(input.dataMovimento),
                DT2_NEXT: new Date(toDateOnly(input.dataMovimento).getTime() + 86400000),
            };
            const whereFilialAberto = input.codfilial ? "\n       AND TO_CHAR(p2.codfilial) = :CODFILIAL" : "";
            if (input.codfilial) {
                bindsAberto.CODFILIAL = input.codfilial;
            }
            const detalhesAbertosRows = await queryRows(`SELECT
        TO_CHAR(p2.codfilial) AS CODFILIAL,
        TRUNC(p2.dtemissao) AS DATA_MOVIMENTO,
        TO_CHAR(n.caixa) AS NUMCHECKOUT,
        TO_CHAR(p2.codfunccheckout) AS CODFUNCCHECKOUT,
        MIN(TO_CHAR(p2.codsupervisor) || '-' || NVL(ps.nome, '')) AS SUPERVISOR_PRINCIPAL,
        COUNT(DISTINCT p2.codsupervisor) AS QT_SUPERVISORES,
        MIN(TO_CHAR(n.codemitente) || '-' || NVL(pe.nome, '')) AS EMITENTE_PRINCIPAL,
        COUNT(DISTINCT n.codemitente) AS QT_EMITENTES,
        COUNT(p2.duplic) AS QTDE_TIT,
        NVL(SUM(p2.valor),0) AS VL_BRUTA,
        SUM(CASE WHEN (p2.codcob = 'CANC' AND p2.valor = p2.valororig) THEN p2.valor ELSE 0 END) AS VL_CANCELADOS,
        NVL(SUM(p2.valor) - SUM(CASE WHEN (p2.codcob = 'CANC' AND p2.valor = p2.valororig) THEN p2.valor ELSE 0 END), 0) AS VL_LIQUIDO,
        NVL(SUM((SELECT SUM(p.valor)
                 FROM pcprest p
                 WHERE p.numtransvenda = p2.numtransvenda
                   AND p.dtestorno IS NULL
                   AND p.prest = p2.prest
                   AND p.codcob = 'D')),0) AS DINHEIRO,
        NVL(SUM((SELECT SUM(p.valor)
                 FROM pcprest p
                 WHERE p.numtransvenda = p2.numtransvenda
                   AND p.dtestorno IS NULL
                   AND p.prest = p2.prest
                   AND p.codcob IN (SELECT CODCOB FROM PCCOB WHERE CARTAO = 'S')
                   AND p.correspondente = '1')),0) AS CARTAOTEF,
        NVL(SUM((SELECT SUM(p.valor)
                 FROM pcprest p
                 WHERE p.numtransvenda = p2.numtransvenda
                   AND p.dtestorno IS NULL
                   AND p.prest = p2.prest
                   AND p.codcob IN (SELECT CODCOB FROM PCCOB WHERE CARTAO = 'S')
                   AND p.correspondente = '2')),0) AS CARTAOPOS,
        NVL(SUM((SELECT SUM(p.valor)
                 FROM pcprest p
                 WHERE p.numtransvenda = p2.numtransvenda
                   AND p.dtestorno IS NULL
                   AND p.prest = p2.prest
                   AND p.codcob NOT IN (SELECT CODCOB FROM PCCOB WHERE CARTAO = 'S')
                   AND p.codcob NOT IN (SELECT CODCOB FROM PCCOB WHERE BOLETO = 'S')
                   AND p.codcob NOT IN ('CHP', 'D', 'CAR', 'TK', 'C', 'CHV', 'DESD', 'DEVP', 'DEVT', 'ESTR'))),0) AS OUTROS
      FROM pcprest p2
      JOIN pcnfsaid n ON p2.numtransvenda = n.numtransvenda
      JOIN pcpedc p3 ON p3.numped = n.numped
      LEFT JOIN pcsuperv ps ON ps.codsupervisor = p2.codsupervisor
      LEFT JOIN pcempr pe ON pe.matricula = n.codemitente
     WHERE p2.codcob NOT IN ('DESD', 'DEVP', 'DEVT', 'ESTR')
       AND n.condvenda <> 4
       AND ((p2.dtfecha IS NULL) OR
            (p2.codcob = 'CRED' AND 1 = (CASE
               WHEN p2.codcob = 'CRED' THEN (CASE
                 WHEN (SELECT COUNT(*)
                         FROM pcprest p3
                        WHERE p2.numcheckout = p3.numcheckout
                          AND p2.codcob = p3.codcob
                          AND p2.dtemissao = p3.dtemissao
                          AND p2.numtransvenda = p3.numtransvenda
                          AND p3.dtfecha IS NULL) > 0
                 THEN 1 ELSE 0 END)
               ELSE 1 END)))
       AND p2.dtestorno IS NULL
       AND n.caixa <> 0
       AND p2.dtcancel IS NULL
       AND p2.dtemissao >= :DT1
       AND p2.dtemissao < :DT2_NEXT
       ${whereFilialAberto}
     GROUP BY TO_CHAR(p2.codfilial), TRUNC(p2.dtemissao), TO_CHAR(n.caixa), TO_CHAR(p2.codfunccheckout)`, bindsAberto);
            const detalhePorCaixa = new Map();
            for (const row of detalhesAbertosRows) {
                const key = `${asString(row.CODFILIAL)}|${normalizeDia(row.DATA_MOVIMENTO)}|${asString(row.NUMCHECKOUT)}|${asString(row.CODFUNCCHECKOUT)}`;
                detalhePorCaixa.set(key, {
                    supervisorPrincipal: asString(row.SUPERVISOR_PRINCIPAL) || null,
                    qtSupervisores: asNumber(row.QT_SUPERVISORES),
                    emitentePrincipal: asString(row.EMITENTE_PRINCIPAL) || null,
                    qtEmitentes: asNumber(row.QT_EMITENTES),
                    qtdeTitulosWinthor: asNumber(row.QTDE_TIT),
                    vendaBrutaWinthor: round2(asNumber(row.VL_BRUTA)),
                    vendaLiquidaWinthor: round2(asNumber(row.VL_LIQUIDO)),
                    dinheiroWinthor: round2(asNumber(row.DINHEIRO)),
                    cartaoTefWinthor: round2(asNumber(row.CARTAOTEF)),
                    cartaoPosWinthor: round2(asNumber(row.CARTAOPOS)),
                    outrosWinthor: round2(asNumber(row.OUTROS)),
                });
            }
            for (const row of mapped) {
                const key = `${row.codfilial}|${row.dataMovimento}|${row.numcheckout}|${row.codfunccheckout}`;
                const detalhe = detalhePorCaixa.get(key);
                if (!detalhe) {
                    continue;
                }
                row.statusCaixa = "ABERTO";
                row.supervisorPrincipal = detalhe.supervisorPrincipal;
                row.qtSupervisores = detalhe.qtSupervisores;
                row.emitentePrincipal = detalhe.emitentePrincipal;
                row.qtEmitentes = detalhe.qtEmitentes;
                row.qtdeTitulosWinthor = detalhe.qtdeTitulosWinthor;
                row.vendaBrutaWinthor = detalhe.vendaBrutaWinthor;
                row.vendaLiquidaWinthor = detalhe.vendaLiquidaWinthor;
                row.dinheiroWinthor = detalhe.dinheiroWinthor;
                row.cartaoTefWinthor = detalhe.cartaoTefWinthor;
                row.cartaoPosWinthor = detalhe.cartaoPosWinthor;
                row.outrosWinthor = detalhe.outrosWinthor;
                if (usarFiltroAbertoPorRelatorio) {
                    row.valorEsperadoWinthor = detalhe.vendaLiquidaWinthor;
                    row.diferencaOriginal = row.valorInformadoOperador == null
                        ? null
                        : round2(detalhe.vendaLiquidaWinthor - row.valorInformadoOperador);
                    row.diferencaFinal = row.valorAuditado == null
                        ? detalhe.vendaLiquidaWinthor
                        : round2(detalhe.vendaLiquidaWinthor - (row.valorAuditado + row.valorAcertosAprovados));
                }
            }
            if (usarFiltroAbertoPorRelatorio) {
                const onlyAbertos = mapped.filter((row) => {
                    const key = `${row.codfilial}|${row.dataMovimento}|${row.numcheckout}|${row.codfunccheckout}`;
                    return detalhePorCaixa.has(key);
                });
                const totalAbertos = onlyAbertos.length;
                const start = (input.page - 1) * input.pageSize;
                const end = start + input.pageSize;
                const pagedAbertos = onlyAbertos.slice(start, end);
                const valorTotalFilialDiaAbertos = round2(onlyAbertos.reduce((sum, row) => sum + row.valorEsperadoWinthor, 0));
                const totalCardsAbertos = {
                    caixas: totalAbertos,
                    valorTotalFilialDia: valorTotalFilialDiaAbertos,
                    totalDiferencaFinal: round2(onlyAbertos.reduce((sum, row) => sum + (row.diferencaFinal ?? 0), 0)),
                    emDivergencia: onlyAbertos.filter((row) => Math.abs(row.diferencaFinal ?? 0) > 0.009).length,
                    riscoCritico: onlyAbertos.filter((row) => row.riscoNivel === "CRITICA").length,
                };
                return {
                    total: totalAbertos,
                    page: input.page,
                    pageSize: input.pageSize,
                    totalPages: totalAbertos > 0 ? Math.ceil(totalAbertos / input.pageSize) : 1,
                    cards: totalCardsAbertos,
                    registros: pagedAbertos,
                };
            }
        }
        const valorTotalFilialDia = round2(mapped.reduce((sum, row) => sum + row.valorEsperadoWinthor, 0));
        const totalCards = {
            caixas: total,
            valorTotalFilialDia,
            totalDiferencaFinal: round2(mapped.reduce((sum, row) => sum + (row.diferencaFinal ?? 0), 0)),
            emDivergencia: mapped.filter((row) => Math.abs(row.diferencaFinal ?? 0) > 0.009).length,
            riscoCritico: mapped.filter((row) => row.riscoNivel === "CRITICA").length,
        };
        return {
            total,
            page: input.page,
            pageSize: input.pageSize,
            totalPages: total > 0 ? Math.ceil(total / input.pageSize) : 1,
            cards: totalCards,
            registros: mapped,
        };
    }
    async getDashboard(rawInput) {
        const input = z.object({
            dataMovimento: z.string().trim().regex(DATE_REGEX),
            codfilial: z.string().trim().min(1).max(10).optional(),
        }).parse(rawInput);
        const data = await this.listCaixas({
            dataMovimento: input.dataMovimento,
            codfilial: input.codfilial,
            page: 1,
            pageSize: 5000,
        });
        const registros = data.registros;
        const cardTotal = round2(registros.reduce((sum, row) => sum + row.valorEsperadoWinthor, 0));
        const cardDetalhe = round2(registros.reduce((sum, row) => sum + row.valorEsperadoWinthor, 0));
        const integridade = Math.abs(cardTotal - cardDetalhe) < 0.0001;
        if (!integridade) {
            throw new AppError("Erro de integridade: dashboard nao reconcilia com o detalhe.", 500);
        }
        return {
            ...data,
            integridadeDashboard: {
                ok: integridade,
                totalDashboard: cardTotal,
                totalDetalhe: cardDetalhe,
            },
        };
    }
    async getResumoFechamento(rawInput) {
        await this.ensurePool();
        const input = resumoFechamentoSchema.parse(rawInput);
        const tipoResumo = input.tipoResumo ?? "FECHADO";
        const usarPeriodo = Boolean(input.dataInicio && input.dataFim);
        const dataInicio = normalizeDateInput(usarPeriodo ? input.dataInicio : input.dataMovimento);
        const dataFim = normalizeDateInput(usarPeriodo ? input.dataFim : input.dataMovimento);
        if (toDateOnly(dataInicio).getTime() > toDateOnly(dataFim).getTime()) {
            throw new AppError("Intervalo de datas invalido: dataInicio maior que dataFim.", 400);
        }
        const binds = {
            DT1: toDateOnly(dataInicio),
            DT2_NEXT: new Date(toDateOnly(dataFim).getTime() + 86400000),
        };
        if (tipoResumo === "ABERTO") {
            const whereFilial = input.codfilial ? "\n        AND TO_CHAR(p2.codfilial) = :CODFILIAL" : "";
            const bindsAbertoBase = {
                DT1_STR: dataInicio,
                DT2_STR: dataFim,
            };
            const bindsAberto = input.codfilial
                ? { ...bindsAbertoBase, CODFILIAL: input.codfilial }
                : bindsAbertoBase;
            const resumoAbertoRows = await queryRows(`SELECT
        TO_CHAR(TRUNC(p2.dtemissao), 'YYYY-MM-DD') AS DATA_REF,
        COUNT(p2.duplic) AS QTDE_TIT,
        NVL(SUM(p2.valor),0) AS VL_BRUTA,
        SUM(CASE WHEN (p2.codcob = 'CANC' AND p2.valor = p2.valororig) THEN p2.valor ELSE 0 END) AS VL_CANCELADOS,
        NVL(SUM(p2.valor) - SUM(CASE WHEN (p2.codcob = 'CANC' AND p2.valor = p2.valororig) THEN p2.valor ELSE 0 END), 0) AS VL_LIQUIDO,
        NVL(SUM((SELECT SUM(p.valor)
                 FROM pcprest p
                 WHERE p.numtransvenda = p2.numtransvenda
                   AND p.dtestorno IS NULL
                   AND p.prest = p2.prest
                   AND p.codcob = 'D')),0) AS DINHEIRO,
        NVL(SUM((SELECT SUM(p.valor)
                 FROM pcprest p
                 WHERE p.numtransvenda = p2.numtransvenda
                   AND p.dtestorno IS NULL
                   AND p.prest = p2.prest
                   AND p.codcob = 'CHP')),0) AS CHP,
        NVL(SUM((SELECT SUM(p.valor)
                 FROM pcprest p
                 WHERE p.numtransvenda = p2.numtransvenda
                   AND p.dtestorno IS NULL
                   AND p.prest = p2.prest
                   AND p.codcob = 'CHV')),0) AS CHV,
        NVL(SUM((SELECT SUM(p.valor)
                 FROM pcprest p
                 WHERE p.numtransvenda = p2.numtransvenda
                   AND p.dtestorno IS NULL
                   AND p.prest = p2.prest
                   AND p.codcob = 'TK')),0) AS TK,
        NVL(SUM((SELECT SUM(p.valor)
                 FROM pcprest p
                 WHERE p.numtransvenda = p2.numtransvenda
                   AND p.dtestorno IS NULL
                   AND p.prest = p2.prest
                   AND p.codcob IN (SELECT CODCOB FROM PCCOB WHERE BOLETO = 'S'))),0) AS BOLETO,
        NVL(SUM((SELECT SUM(p.valor)
                 FROM pcprest p
                 WHERE p.numtransvenda = p2.numtransvenda
                   AND p.dtestorno IS NULL
                   AND p.prest = p2.prest
                   AND p.codcob = 'C')),0) AS CARTEIRA,
        NVL(SUM((SELECT SUM(p.valor)
                 FROM pcprest p
                 WHERE p.numtransvenda = p2.numtransvenda
                   AND p.dtestorno IS NULL
                   AND p.prest = p2.prest
                   AND p.codcob IN (SELECT CODCOB FROM PCCOB WHERE CARTAO = 'S')
                   AND p.correspondente = '1')),0) AS CARTAOTEF,
        NVL(SUM((SELECT SUM(p.valor)
                 FROM pcprest p
                 WHERE p.numtransvenda = p2.numtransvenda
                   AND p.dtestorno IS NULL
                   AND p.prest = p2.prest
                   AND p.codcob IN (SELECT CODCOB FROM PCCOB WHERE CARTAO = 'S')
                   AND p.correspondente = '2')),0) AS CARTAOPOS,
        NVL(SUM((SELECT SUM(p.valor)
                 FROM pcprest p
                 WHERE p.numtransvenda = p2.numtransvenda
                   AND p.dtestorno IS NULL
                   AND p.prest = p2.prest
                   AND p.codcob NOT IN (SELECT CODCOB FROM PCCOB WHERE CARTAO = 'S')
                   AND p.codcob NOT IN (SELECT CODCOB FROM PCCOB WHERE BOLETO = 'S')
                   AND p.codcob NOT IN ('CHP', 'D', 'CAR', 'TK', 'C', 'CHV', 'DESD', 'DEVP', 'DEVT', 'ESTR'))),0) AS OUTROS
      FROM pcprest p2, pcnfsaid n, pcpedc p3
     WHERE p2.codcob NOT IN ('DESD', 'DEVP', 'DEVT', 'ESTR')
       AND n.condvenda <> 4
       AND p3.numped = n.numped
       AND ((p2.dtfecha IS NULL) OR
            (p2.codcob = 'CRED' AND 1 = (CASE
               WHEN p2.codcob = 'CRED' THEN (CASE
                 WHEN (SELECT COUNT(*)
                         FROM pcprest p3
                        WHERE p2.numcheckout = p3.numcheckout
                          AND p2.codcob = p3.codcob
                          AND p2.dtemissao = p3.dtemissao
                          AND p2.numtransvenda = p3.numtransvenda
                          AND p3.dtfecha IS NULL) > 0
                 THEN 1 ELSE 0 END)
               ELSE 1 END)))
       AND p2.dtestorno IS NULL
       AND n.caixa <> 0
       AND p2.dtcancel IS NULL
       AND TRUNC(p2.dtemissao) BETWEEN TO_DATE(:DT1_STR, 'YYYY-MM-DD') AND TO_DATE(:DT2_STR, 'YYYY-MM-DD')
       ${whereFilial}
       AND p2.numtransvenda = n.numtransvenda
     GROUP BY TRUNC(p2.dtemissao)
     ORDER BY TRUNC(p2.dtemissao)`, bindsAberto);
            const resumoCobrancaRows = await queryRows(`SELECT
        p2.codcob AS COD_COBRANCA,
        NVL(pcob.cobranca, p2.codcob) AS COBRANCA,
        pcob.codmoeda AS MOEDA,
        SUM(NVL(p2.valor,0)) AS VALOR
      FROM pcprest p2
      JOIN pcnfsaid n ON p2.numtransvenda = n.numtransvenda
      JOIN pcpedc p3 ON p3.numped = n.numped
      LEFT JOIN pccob pcob ON pcob.codcob = p2.codcob
      WHERE p2.codcob NOT IN ('DESD', 'DEVP', 'DEVT', 'ESTR')
        AND n.condvenda <> 4
        AND ((p2.dtfecha IS NULL) OR
             (p2.codcob = 'CRED' AND 1 = (CASE
               WHEN p2.codcob = 'CRED' THEN (CASE
                 WHEN (SELECT COUNT(*)
                         FROM pcprest p3
                        WHERE p2.numcheckout = p3.numcheckout
                          AND p2.codcob = p3.codcob
                          AND p2.dtemissao = p3.dtemissao
                          AND p2.numtransvenda = p3.numtransvenda
                          AND p3.dtfecha IS NULL) > 0
                 THEN 1 ELSE 0 END)
               ELSE 1 END)))
        AND p2.dtestorno IS NULL
        AND n.caixa <> 0
        AND p2.dtcancel IS NULL
        AND TRUNC(p2.dtemissao) BETWEEN TO_DATE(:DT1_STR, 'YYYY-MM-DD') AND TO_DATE(:DT2_STR, 'YYYY-MM-DD')
        ${whereFilial}
      GROUP BY p2.codcob, NVL(pcob.cobranca, p2.codcob), pcob.codmoeda
      ORDER BY SUM(NVL(p2.valor,0)) DESC, p2.codcob`, bindsAberto);
            const diarioByDate = new Map();
            for (const row of resumoAbertoRows) {
                const dataIso = normalizeDateInput(asString(row.DATA_REF)) || dataInicio;
                const valorDinheiro = round2(asNumber(row.DINHEIRO));
                const chequePrazo = round2(asNumber(row.CHP));
                const chequeVista = round2(asNumber(row.CHV));
                const ticket = round2(asNumber(row.TK));
                const boleto = round2(asNumber(row.BOLETO));
                const carteira = round2(asNumber(row.CARTEIRA));
                const cartaoTef = round2(asNumber(row.CARTAOTEF));
                const cartaoPos = round2(asNumber(row.CARTAOPOS));
                const outros = round2(asNumber(row.OUTROS));
                const valorTotal = round2(valorDinheiro +
                    chequePrazo +
                    chequeVista +
                    ticket +
                    boleto +
                    carteira +
                    cartaoTef +
                    cartaoPos +
                    outros);
                diarioByDate.set(dataIso, {
                    data: dataIso,
                    diaSemana: formatWeekdayLabel(toDateOnly(dataIso)),
                    qtdeTitulos: asNumber(row.QTDE_TIT),
                    vendaBruta: round2(asNumber(row.VL_BRUTA)),
                    vendaLiquida: round2(asNumber(row.VL_LIQUIDO)),
                    valorDinheiro,
                    chequePrazo,
                    chequeVista,
                    ticket,
                    boleto,
                    carteira,
                    cartaoTef,
                    cartaoPos,
                    outros,
                    valorTotal,
                });
            }
            const periodo = buildDateRange(dataInicio, dataFim);
            const resumoDiario = periodo.map((dataIso) => {
                var _a;
                return ((_a = diarioByDate.get(dataIso)) !== null && _a !== void 0 ? _a : {
                    data: dataIso,
                    diaSemana: formatWeekdayLabel(toDateOnly(dataIso)),
                    qtdeTitulos: 0,
                    vendaBruta: 0,
                    vendaLiquida: 0,
                    valorDinheiro: 0,
                    chequePrazo: 0,
                    chequeVista: 0,
                    ticket: 0,
                    boleto: 0,
                    carteira: 0,
                    cartaoTef: 0,
                    cartaoPos: 0,
                    outros: 0,
                    valorTotal: 0,
                });
            });
            const totais = resumoDiario.reduce((acc, row) => ({
                qtdeTitulos: acc.qtdeTitulos + row.qtdeTitulos,
                vendaBruta: round2(acc.vendaBruta + row.vendaBruta),
                vendaLiquida: round2(acc.vendaLiquida + row.vendaLiquida),
                valorDinheiro: round2(acc.valorDinheiro + row.valorDinheiro),
                chequePrazo: round2(acc.chequePrazo + row.chequePrazo),
                chequeVista: round2(acc.chequeVista + row.chequeVista),
                ticket: round2(acc.ticket + row.ticket),
                boleto: round2(acc.boleto + row.boleto),
                carteira: round2(acc.carteira + row.carteira),
                cartaoTef: round2(acc.cartaoTef + row.cartaoTef),
                cartaoPos: round2(acc.cartaoPos + row.cartaoPos),
                outros: round2(acc.outros + row.outros),
                valorTotal: round2(acc.valorTotal + row.valorTotal),
            }), {
                qtdeTitulos: 0,
                vendaBruta: 0,
                vendaLiquida: 0,
                valorDinheiro: 0,
                chequePrazo: 0,
                chequeVista: 0,
                ticket: 0,
                boleto: 0,
                carteira: 0,
                cartaoTef: 0,
                cartaoPos: 0,
                outros: 0,
                valorTotal: 0,
            });
            const resumoCobranca = resumoCobrancaRows.map((row) => ({
                codCobranca: asString(row.COD_COBRANCA),
                cobranca: asString(row.COBRANCA),
                moeda: asString(row.MOEDA),
                valor: round2(asNumber(row.VALOR)),
            }));
            const totalCobranca = round2(resumoCobranca.reduce((sum, row) => sum + row.valor, 0));
            return {
                filtro: {
                    tipoResumo,
                    modo: usarPeriodo ? "PERIODO" : "DIA",
                    dataMovimento: usarPeriodo ? null : dataInicio,
                    dataInicio,
                    dataFim,
                    codfilial: input.codfilial ?? null,
                    codfilialIgnorada: false,
                },
                resumoDiario,
                totais,
                resumoCobranca,
                totalCobranca,
            };
        }
        // Mantem a mesma logica do relatorio WinThor "Relatorio Acerto de Caixa".
        const resumoBaseRows = await queryRows(`SELECT DISTINCT
        TRUNC(PCPREST.DTEMISSAO) AS DATA_REF,
        SUM(NVL(TBLDINHEIRO.VALOR, 0)) AS VL_DINHEIRO,
        SUM(NVL(TBLTROCO.VALOR, 0)) AS VL_TROCO
      FROM PCPREST
      LEFT JOIN PCPEDC ON (PCPEDC.NUMTRANSVENDA = PCPREST.NUMTRANSVENDA)
      LEFT JOIN (
        SELECT SUM(VALOR) VALOR, CODFUNCCHECKOUT, CODFILIAL, DTEMISSAO, CODCOB, CODFUNCFECHA, PREST, NUMTRANSVENDA
        FROM PCPREST
        WHERE CODCOB = 'D'
          AND DTFECHA IS NOT NULL
          AND DTESTORNO IS NULL
          AND DTEMISSAO >= :DT1
          AND DTEMISSAO < :DT2_NEXT
        GROUP BY CODFUNCCHECKOUT, CODFILIAL, DTEMISSAO, CODCOB, CODFUNCFECHA, PREST, NUMTRANSVENDA
      ) TBLDINHEIRO ON (
        PCPREST.CODFUNCCHECKOUT = TBLDINHEIRO.CODFUNCCHECKOUT
        AND PCPREST.CODFILIAL = TBLDINHEIRO.CODFILIAL
        AND PCPREST.DTEMISSAO = TBLDINHEIRO.DTEMISSAO
        AND PCPREST.CODCOB IN (TBLDINHEIRO.CODCOB)
        AND PCPREST.CODFUNCFECHA IN (TBLDINHEIRO.CODFUNCFECHA)
        AND PCPREST.PREST = TBLDINHEIRO.PREST
        AND PCPREST.NUMTRANSVENDA = TBLDINHEIRO.NUMTRANSVENDA
      )
      LEFT JOIN (
        SELECT SUM(VALOR) VALOR, CODFUNCCHECKOUT, CODFILIAL, DTEMISSAO, CODCOB, CODFUNCFECHA, NUMTRANSVENDA, PREST
        FROM PCPREST
        WHERE CODCOB = 'TR'
          AND DTFECHA IS NOT NULL
          AND DTESTORNO IS NULL
          AND DTEMISSAO >= :DT1
          AND DTEMISSAO < :DT2_NEXT
        GROUP BY CODFUNCCHECKOUT, CODFILIAL, DTEMISSAO, CODCOB, CODFUNCFECHA, NUMTRANSVENDA, PREST
      ) TBLTROCO ON (
        PCPREST.CODFUNCCHECKOUT = TBLTROCO.CODFUNCCHECKOUT
        AND PCPREST.CODFILIAL = TBLTROCO.CODFILIAL
        AND PCPREST.DTEMISSAO = TBLTROCO.DTEMISSAO
        AND PCPREST.PREST = TBLTROCO.PREST
        AND TBLTROCO.CODCOB IN (PCPREST.CODCOB)
        AND TBLTROCO.CODFUNCFECHA IN (PCPREST.CODFUNCFECHA)
        AND TBLTROCO.NUMTRANSVENDA = PCPREST.NUMTRANSVENDA
      )
      LEFT JOIN PCEMPR ON (PCPREST.CODFUNCCHECKOUT = PCEMPR.MATRICULA)
      WHERE PCPREST.CODCOB NOT IN ('DESD','DEVT','DEVP','ESTR','CANC')
        AND PCPREST.DTFECHA IS NOT NULL
        AND PCPREST.NUMCHECKOUT <> 0
        AND PCPREST.VALOR <> 0
        AND PCPREST.DTCANCEL IS NULL
        AND 1 = (CASE
          WHEN PCPREST.CODCOB = 'CRED' THEN
            (CASE
              WHEN (SELECT COUNT(*)
                    FROM PCPREST P2
                    WHERE PCPREST.NUMCHECKOUT = P2.NUMCHECKOUT
                      AND PCPREST.DTEMISSAO = P2.DTEMISSAO
                      AND PCPREST.NUMTRANSVENDA = P2.NUMTRANSVENDA
                      AND P2.DTFECHA IS NULL) > 0
                THEN 0
              ELSE 1
            END)
          ELSE 1
        END)
        AND PCPREST.DTESTORNO IS NULL
        AND PCPREST.DTEMISSAO >= :DT1
        AND PCPREST.DTEMISSAO < :DT2_NEXT
      GROUP BY TRUNC(PCPREST.DTEMISSAO)
      ORDER BY TRUNC(PCPREST.DTEMISSAO)`, binds);
        const faltaRows = await queryRows(`SELECT
        TRUNC(L.DTEMISSAO) AS DATA_REF,
        SUM(NVL(L.VALOR * (-1), 0)) AS FALTA
      FROM PCLANC L, PCMOVCR M, PCCAIXABALCAO C
      WHERE L.NUMTRANS = M.NUMTRANS
        AND L.CODFILIAL = C.CODFILIAL
        AND C.FAIXANUMTRANS LIKE '%' || L.NUMTRANS || '%'
        AND L.DTEMISSAO >= :DT1
        AND L.DTEMISSAO < :DT2_NEXT
        AND ((L.HISTORICO LIKE 'REF FALTA NO ACERTO DO CAIXA.%')
         OR  (L.HISTORICO LIKE 'REF.FALTA ACERTO CX EM%'))
        AND M.ESTORNO = 'N'
      GROUP BY TRUNC(L.DTEMISSAO)`, binds);
        const sobraRows = await queryRows(`SELECT
        TRUNC(L.DTEMISSAO) AS DATA_REF,
        ABS(SUM(NVL(L.VALOR, 0))) AS SOBRA
      FROM PCLANC L, PCMOVCR M, PCCAIXABALCAO C
      WHERE L.NUMTRANS = M.NUMTRANS
        AND L.CODFILIAL = C.CODFILIAL
        AND C.FAIXANUMTRANS LIKE '%' || L.NUMTRANS || '%'
        AND L.DTEMISSAO >= :DT1
        AND L.DTEMISSAO < :DT2_NEXT
        AND ((L.HISTORICO LIKE 'REF SOBRA DO ACERTO NO CAIXA.%')
         OR  (L.HISTORICO LIKE 'REF.SOBRA ACERTO CX EM%'))
        AND M.ESTORNO = 'N'
      GROUP BY TRUNC(L.DTEMISSAO)`, binds);
        const suprimentoRows = await queryRows(`SELECT
        TRUNC(PCVALECX.DTLANC) AS DATA_REF,
        SUM(NVL(PCVALECX.VALOR, 0)) AS VALOR
      FROM PCVALECX, PCCAIXA
      WHERE PCVALECX.NUMCX = PCCAIXA.NUMCAIXA
        AND PCVALECX.DTLANC >= :DT1
        AND PCVALECX.DTLANC < :DT2_NEXT
        AND PCVALECX.TIPO = 'U'
      GROUP BY TRUNC(PCVALECX.DTLANC)`, binds);
        const sangriaRows = await queryRows(`SELECT
        TRUNC(PCVALECX.DTLANC) AS DATA_REF,
        SUM(NVL(PCVALECX.VALOR, 0) * (-1)) AS VALOR
      FROM PCVALECX, PCCAIXA
      WHERE PCVALECX.NUMCX = PCCAIXA.NUMCAIXA
        AND PCVALECX.DTLANC >= :DT1
        AND PCVALECX.DTLANC < :DT2_NEXT
        AND PCVALECX.TIPO = 'A'
      GROUP BY TRUNC(PCVALECX.DTLANC)`, binds);
        const resumoCobrancaRows = await queryRows(`SELECT
        PCPREST.CODCOB AS COD_COBRANCA,
        PCCOB.COBRANCA AS COBRANCA,
        PCCOB.CODMOEDA AS MOEDA,
        SUM(PCPREST.VALOR) AS VALOR
      FROM PCPREST, PCCOB
      WHERE PCPREST.CODCOB = PCCOB.CODCOB
        AND PCPREST.NUMCHECKOUT <> 0
        AND PCPREST.VALOR <> 0
        AND PCPREST.DTESTORNO IS NULL
        AND PCPREST.CODCOB NOT IN ('DESD','ESTR','CANC')
        AND (PCPREST.DTEMISSAOORIG = PCPREST.DTEMISSAO OR PCPREST.DTEMISSAOORIG IS NULL)
        AND PCPREST.DTEMISSAO >= :DT1
        AND PCPREST.DTEMISSAO < :DT2_NEXT
      GROUP BY PCPREST.CODCOB, PCCOB.COBRANCA, PCCOB.CODMOEDA
      ORDER BY SUM(PCPREST.VALOR) DESC, PCPREST.CODCOB`, binds);
        const valorDinheiroByDate = new Map();
        const trocoByDate = new Map();
        const faltaByDate = new Map();
        const sobraByDate = new Map();
        const suprimentoByDate = new Map();
        const sangriaByDate = new Map();
        for (const row of resumoBaseRows) {
            const dataRef = normalizeDia(row.DATA_REF);
            valorDinheiroByDate.set(dataRef, round2(asNumber(row.VL_DINHEIRO)));
            trocoByDate.set(dataRef, round2(asNumber(row.VL_TROCO)));
        }
        for (const row of faltaRows) {
            faltaByDate.set(normalizeDia(row.DATA_REF), round2(asNumber(row.FALTA)));
        }
        for (const row of sobraRows) {
            sobraByDate.set(normalizeDia(row.DATA_REF), round2(asNumber(row.SOBRA)));
        }
        for (const row of suprimentoRows) {
            suprimentoByDate.set(normalizeDia(row.DATA_REF), round2(asNumber(row.VALOR)));
        }
        for (const row of sangriaRows) {
            sangriaByDate.set(normalizeDia(row.DATA_REF), round2(asNumber(row.VALOR)));
        }
        const periodo = buildDateRange(dataInicio, dataFim);
        const resumoDiario = periodo.map((dataIso) => {
            const valorDinheiro = valorDinheiroByDate.get(dataIso) ?? 0;
            const suprimento = suprimentoByDate.get(dataIso) ?? 0;
            const sangria = sangriaByDate.get(dataIso) ?? 0;
            const troco = trocoByDate.get(dataIso) ?? 0;
            const falta = faltaByDate.get(dataIso) ?? 0;
            const sobra = sobraByDate.get(dataIso) ?? 0;
            const valorTotal = round2(valorDinheiro + suprimento + sangria + troco + falta + sobra);
            return {
                data: dataIso,
                diaSemana: formatWeekdayLabel(toDateOnly(dataIso)),
                valorDinheiro,
                suprimento,
                sangria,
                troco,
                falta,
                sobra,
                valorTotal,
            };
        });
        const totais = resumoDiario.reduce((acc, row) => ({
            valorDinheiro: round2(acc.valorDinheiro + row.valorDinheiro),
            suprimento: round2(acc.suprimento + row.suprimento),
            sangria: round2(acc.sangria + row.sangria),
            troco: round2(acc.troco + row.troco),
            falta: round2(acc.falta + row.falta),
            sobra: round2(acc.sobra + row.sobra),
            valorTotal: round2(acc.valorTotal + row.valorTotal),
        }), {
            valorDinheiro: 0,
            suprimento: 0,
            sangria: 0,
            troco: 0,
            falta: 0,
            sobra: 0,
            valorTotal: 0,
        });
        const resumoCobranca = resumoCobrancaRows.map((row) => ({
            codCobranca: asString(row.COD_COBRANCA),
            cobranca: asString(row.COBRANCA),
            moeda: asString(row.MOEDA),
            valor: round2(asNumber(row.VALOR)),
        }));
        const totalCobranca = round2(resumoCobranca.reduce((sum, row) => sum + row.valor, 0));
        return {
            filtro: {
                modo: usarPeriodo ? "PERIODO" : "DIA",
                dataMovimento: usarPeriodo ? null : dataInicio,
                dataInicio,
                dataFim,
                codfilial: null,
                codfilialIgnorada: Boolean(input.codfilial),
            },
            resumoDiario,
            totais,
            resumoCobranca,
            totalCobranca,
        };
    }
    async getCaixaDetalhe(caixaId, actor) {
        const summary = await this.getSummaryById(caixaId);
        if (!summary)
            throw new AppError("Caixa nao encontrado.", 404);
        const snapshotRows = await queryRows(`SELECT
        CAIXA_ID, SNAPSHOT_ID, SNAPSHOT_VERSION, ROW_KEY, ROW_HASH,
        CODFILIAL, DATA_MOVIMENTO, NUMCHECKOUT, CODFUNCCHECKOUT, DTFECHA,
        NUMTRANSVENDA, PREST, CODCOB, VALOR, NSUTEF, CODAUTORIZACAOTEF
      FROM RC_CAIXA_AUDIT_SNAPSHOT
      WHERE CAIXA_ID = :caixa_id
      ORDER BY SNAPSHOT_VERSION DESC, ROW_KEY`, { caixa_id: caixaId });
        const acertos = await queryRows(`SELECT
        ID, CAIXA_ID, STATUS, VALOR, JUSTIFICATIVA, MOTIVO,
        SOLICITANTE_ID, SOLICITANTE_NOME, APROVADOR_ID, APROVADOR_NOME,
        APROVADO_EM, REPROVADO_EM, OBSERVACAO_DECISAO, REQUEST_ID, CRIADO_EM, ATUALIZADO_EM
      FROM RC_CAIXA_AUDIT_ACERTO
      WHERE CAIXA_ID = :caixa_id
      ORDER BY CRIADO_EM DESC`, { caixa_id: caixaId });
        const evidencias = await queryRows(`SELECT
        ID, ENTIDADE_TIPO, ENTIDADE_ID, TIPO_EVIDENCIA, NOME_ARQUIVO_ORIGINAL, NOME_ARQUIVO_STORAGE,
        MIME_TYPE, TAMANHO_BYTES, HASH_ARQUIVO, STORAGE_PATH, USUARIO_UPLOAD, DATA_UPLOAD,
        OBSERVACAO, VERSAO, ATIVO
      FROM RC_CAIXA_AUDIT_EVIDENCIA
      WHERE ENTIDADE_TIPO = 'CAIXA'
        AND ENTIDADE_ID = :caixa_id
      ORDER BY DATA_UPLOAD DESC`, { caixa_id: caixaId });
        const ledger = await queryRows(`SELECT
        ID, AGGREGATE_TYPE, AGGREGATE_ID, EVENTO_TIPO, EVENTO_VERSAO, PAYLOAD_JSON, PAYLOAD_HASH,
        HASH_EVENTO, HASH_EVENTO_ANTERIOR, USUARIO_ID, USUARIO_NOME, PERFIL_USUARIO,
        CODFILIAL, DATA_MOVIMENTO, NUMCHECKOUT, CODFUNCCHECKOUT,
        CORRELATION_ID, REQUEST_ID, IP_ORIGEM, USER_AGENT,
        CRIADO_EM_UTC, MOTIVO, OBSERVACAO, SEQ_NUM
      FROM RC_CAIXA_AUDIT_EVENT_LEDGER
      WHERE AGGREGATE_TYPE = 'CAIXA'
        AND AGGREGATE_ID = :caixa_id
      ORDER BY SEQ_NUM`, { caixa_id: caixaId });
        await this.appendLedgerEvent({
            aggregateType: "CAIXA",
            aggregateId: caixaId,
            eventType: "DADO_SENSIVEL_VISUALIZADO",
            payload: {
                perfil: actor.perfil,
                endpoint: "getCaixaDetalhe",
            },
            actor,
            codfilial: summary.CODFILIAL,
            dataMovimento: normalizeDia(summary.DATA_MOVIMENTO),
            numcheckout: summary.NUMCHECKOUT,
            codfunccheckout: summary.CODFUNCCHECKOUT,
            motivo: "Consulta detalhada de caixa.",
        });
        const snapshotMasked = snapshotRows.map((row) => ({
            snapshotId: row.SNAPSHOT_ID,
            snapshotVersion: row.SNAPSHOT_VERSION,
            rowKey: row.ROW_KEY,
            rowHash: row.ROW_HASH,
            codfilial: row.CODFILIAL,
            dataMovimento: normalizeDia(row.DATA_MOVIMENTO),
            numcheckout: row.NUMCHECKOUT,
            codfunccheckout: row.CODFUNCCHECKOUT,
            dtfecha: asIsoDate(row.DTFECHA),
            numtransvenda: this.maskSensitiveByPerfil(actor.perfil, asString(row.NUMTRANSVENDA, "-")),
            prest: asString(row.PREST, "-"),
            codcob: asString(row.CODCOB, "-"),
            valor: round2(asNumber(row.VALOR)),
            nsutef: this.maskSensitiveByPerfil(actor.perfil, asString(row.NSUTEF, "-")),
            codautorizacaoTef: this.maskSensitiveByPerfil(actor.perfil, asString(row.CODAUTORIZACAOTEF, "-")),
        }));
        return {
            resumo: {
                id: summary.ID,
                codfilial: summary.CODFILIAL,
                dataMovimento: normalizeDia(summary.DATA_MOVIMENTO),
                numcheckout: summary.NUMCHECKOUT,
                codfunccheckout: summary.CODFUNCCHECKOUT,
                statusCaixa: summary.STATUS_CAIXA,
                statusFilialDia: summary.STATUS_FILIAL_DIA,
                valorEsperadoWinthor: round2(asNumber(summary.VALOR_ESPERADO_WINTHOR)),
                valorInformadoOperador: summary.VALOR_INFORMADO_OPERADOR == null ? null : round2(asNumber(summary.VALOR_INFORMADO_OPERADOR)),
                valorAuditado: summary.VALOR_AUDITADO == null ? null : round2(asNumber(summary.VALOR_AUDITADO)),
                valorAcertosAprovados: round2(asNumber(summary.VALOR_ACERTOS_APROVADOS)),
                diferencaOriginal: summary.DIFERENCA_ORIGINAL == null ? null : round2(asNumber(summary.DIFERENCA_ORIGINAL)),
                diferencaFinal: summary.DIFERENCA_FINAL == null ? null : round2(asNumber(summary.DIFERENCA_FINAL)),
                riscoScore: summary.RISCO_SCORE ?? 0,
                riscoNivel: summary.RISCO_NIVEL ?? "BAIXA",
                ultimoSnapshotId: summary.ULTIMO_SNAPSHOT_ID,
                ultimaSqlVersao: summary.ULTIMA_SQL_VERSAO,
                ultimaSqlHash: summary.ULTIMA_SQL_HASH,
                ultimoResultHash: summary.ULTIMO_RESULT_HASH,
            },
            snapshot: snapshotMasked,
            acertos: acertos.map((row) => ({
                id: row.ID,
                status: row.STATUS,
                valor: round2(asNumber(row.VALOR)),
                justificativa: row.JUSTIFICATIVA,
                motivo: row.MOTIVO,
                solicitanteId: row.SOLICITANTE_ID,
                solicitanteNome: row.SOLICITANTE_NOME,
                aprovadorId: row.APROVADOR_ID,
                aprovadorNome: row.APROVADOR_NOME,
                aprovadoEm: asIsoDate(row.APROVADO_EM),
                reprovadoEm: asIsoDate(row.REPROVADO_EM),
                observacaoDecisao: row.OBSERVACAO_DECISAO,
                requestId: row.REQUEST_ID,
                criadoEm: asIsoDate(row.CRIADO_EM),
                atualizadoEm: asIsoDate(row.ATUALIZADO_EM),
            })),
            evidencias: evidencias.map((row) => ({
                id: row.ID,
                tipoEvidencia: row.TIPO_EVIDENCIA,
                nomeArquivoOriginal: row.NOME_ARQUIVO_ORIGINAL,
                nomeArquivoStorage: row.NOME_ARQUIVO_STORAGE,
                mimeType: row.MIME_TYPE,
                tamanhoBytes: row.TAMANHO_BYTES,
                hashArquivo: row.HASH_ARQUIVO,
                storagePath: row.STORAGE_PATH,
                usuarioUpload: row.USUARIO_UPLOAD,
                dataUpload: asIsoDate(row.DATA_UPLOAD),
                observacao: row.OBSERVACAO,
                versao: row.VERSAO,
                ativo: row.ATIVO === 1,
            })),
            ledger: ledger.map((row) => ({
                id: row.ID,
                seqNum: row.SEQ_NUM,
                eventoTipo: row.EVENTO_TIPO,
                payloadHash: row.PAYLOAD_HASH,
                hashEvento: row.HASH_EVENTO,
                hashEventoAnterior: row.HASH_EVENTO_ANTERIOR,
                usuario: row.USUARIO_NOME,
                perfil: row.PERFIL_USUARIO,
                criadoEmUtc: asIsoDate(row.CRIADO_EM_UTC),
                motivo: row.MOTIVO,
                observacao: row.OBSERVACAO,
                requestId: row.REQUEST_ID,
            })),
        };
    }
    async iniciarAuditoria(caixaId, actor) {
        const summary = await this.getSummaryById(caixaId);
        if (!summary)
            throw new AppError("Caixa nao encontrado.", 404);
        this.assertCanAudit(actor, summary);
        const updated = await this.setCaixaStatus({
            caixaId,
            nextStatus: "EM_AUDITORIA",
            actor,
            motivo: "Auditoria iniciada.",
        });
        return { status: "ok", caixa: updated };
    }
    async finalizarAuditoria(caixaId, rawInput, actor) {
        const input = auditoriaFinalSchema.parse(rawInput);
        const summary = await this.getSummaryById(caixaId);
        if (!summary)
            throw new AppError("Caixa nao encontrado.", 404);
        this.assertCanAudit(actor, summary);
        if (["FINALIZADO", "CANCELADO_LOGICAMENTE"].includes(summary.STATUS_CAIXA)) {
            await this.logBypass({
                actor,
                caixaId,
                action: "FINALIZAR_AUDITORIA",
                reason: "Tentativa de alterar caixa finalizado/cancelado.",
            });
            throw new AppError("Caixa finalizado ou cancelado nao pode ser alterado.", 422);
        }
        const valorInformado = input.valorInformadoOperador ?? summary.VALOR_INFORMADO_OPERADOR ?? summary.VALOR_ESPERADO_WINTHOR;
        const diferencaOriginal = round2(asNumber(summary.VALOR_ESPERADO_WINTHOR) - asNumber(valorInformado));
        const valorAuditado = round2(input.valorAuditado);
        const diferencaFinal = round2(asNumber(summary.VALOR_ESPERADO_WINTHOR) - valorAuditado);
        await execDml(`UPDATE RC_CAIXA_AUDIT_SUMMARY
          SET VALOR_INFORMADO_OPERADOR = :valor_informado_operador,
              VALOR_AUDITADO = :valor_auditado,
              DIFERENCA_ORIGINAL = :diferenca_original,
              DIFERENCA_FINAL = :diferenca_final,
              ATUALIZADO_EM = SYSTIMESTAMP
        WHERE ID = :id`, {
            id: caixaId,
            valor_informado_operador: round2(asNumber(valorInformado)),
            valor_auditado: valorAuditado,
            diferenca_original: diferencaOriginal,
            diferenca_final: diferencaFinal,
        });
        const targetStatus = Math.abs(diferencaFinal) < 0.009
            ? "AUDITADO_SEM_DIVERGENCIA"
            : "AUDITADO_COM_DIVERGENCIA";
        if (!this.allowedTransition(summary.STATUS_CAIXA, targetStatus)) {
            await this.logBypass({
                actor,
                caixaId,
                action: "FINALIZAR_AUDITORIA",
                reason: `Transicao invalida: ${summary.STATUS_CAIXA} -> ${targetStatus}`,
            });
            throw new AppError(`Transicao invalida para finalizar auditoria: ${summary.STATUS_CAIXA} -> ${targetStatus}.`, 422);
        }
        await execDml(`UPDATE RC_CAIXA_AUDIT_SUMMARY
          SET STATUS_CAIXA = :status_caixa,
              ATUALIZADO_EM = SYSTIMESTAMP
        WHERE ID = :id`, { id: caixaId, status_caixa: targetStatus });
        await this.appendLedgerEvent({
            aggregateType: "CAIXA",
            aggregateId: caixaId,
            eventType: targetStatus === "AUDITADO_SEM_DIVERGENCIA" ? "AUDITORIA_FINALIZADA" : "DIVERGENCIA_DETECTADA",
            payload: {
                valorEsperadoWinthor: summary.VALOR_ESPERADO_WINTHOR,
                valorInformadoOperador: valorInformado,
                valorAuditado,
                diferencaOriginal,
                diferencaFinal,
            },
            actor,
            codfilial: summary.CODFILIAL,
            dataMovimento: normalizeDia(summary.DATA_MOVIMENTO),
            numcheckout: summary.NUMCHECKOUT,
            codfunccheckout: summary.CODFUNCCHECKOUT,
            motivo: "Auditoria de caixa finalizada.",
            observacao: input.observacao,
        });
        const updated = await this.updateSummaryMetrics(caixaId);
        return {
            status: "ok",
            caixa: {
                id: updated.ID,
                statusCaixa: updated.STATUS_CAIXA,
                valorEsperadoWinthor: updated.VALOR_ESPERADO_WINTHOR,
                valorInformadoOperador: updated.VALOR_INFORMADO_OPERADOR,
                valorAuditado: updated.VALOR_AUDITADO,
                valorAcertosAprovados: updated.VALOR_ACERTOS_APROVADOS,
                diferencaOriginal: updated.DIFERENCA_ORIGINAL,
                diferencaFinal: updated.DIFERENCA_FINAL,
            },
        };
    }
    async solicitarAcerto(caixaId, rawInput, actor) {
        const input = acertoSolicitacaoSchema.parse(rawInput);
        const summary = await this.getSummaryById(caixaId);
        if (!summary)
            throw new AppError("Caixa nao encontrado.", 404);
        this.assertCanAudit(actor, summary);
        if (summary.STATUS_CAIXA === "FINALIZADO") {
            await this.logBypass({
                actor,
                caixaId,
                action: "SOLICITAR_ACERTO",
                reason: "Tentativa de solicitar acerto em caixa finalizado.",
            });
            throw new AppError("Nao e permitido solicitar acerto para caixa finalizado.", 422);
        }
        const acertoId = randomUUID();
        await execDml(`INSERT INTO RC_CAIXA_AUDIT_ACERTO (
        ID, CAIXA_ID, STATUS, VALOR, JUSTIFICATIVA, MOTIVO,
        SOLICITANTE_ID, SOLICITANTE_NOME, APROVADOR_ID, APROVADOR_NOME,
        APROVADO_EM, REPROVADO_EM, OBSERVACAO_DECISAO, REQUEST_ID,
        CRIADO_EM, ATUALIZADO_EM
      ) VALUES (
        :id, :caixa_id, 'ACERTO_EM_APROVACAO', :valor, :justificativa, :motivo,
        :solicitante_id, :solicitante_nome, NULL, NULL,
        NULL, NULL, NULL, :request_id,
        SYSTIMESTAMP, SYSTIMESTAMP
      )`, {
            id: acertoId,
            caixa_id: caixaId,
            valor: round2(input.valor),
            justificativa: input.justificativa,
            motivo: input.motivo ?? null,
            solicitante_id: actor.userId,
            solicitante_nome: actor.userName,
            request_id: actor.requestId,
        });
        const nextStatus = summary.STATUS_CAIXA === "ACERTO_EM_APROVACAO" ? "ACERTO_EM_APROVACAO" : "ACERTO_SOLICITADO";
        if (this.allowedTransition(summary.STATUS_CAIXA, nextStatus)) {
            await execDml(`UPDATE RC_CAIXA_AUDIT_SUMMARY
            SET STATUS_CAIXA = :status_caixa,
                ATUALIZADO_EM = SYSTIMESTAMP
          WHERE ID = :id`, { id: caixaId, status_caixa: nextStatus });
        }
        await execDml(`UPDATE RC_CAIXA_AUDIT_SUMMARY
          SET STATUS_CAIXA = 'ACERTO_EM_APROVACAO',
              STATUS_FILIAL_DIA = 'COM_ACERTO_PENDENTE',
              ATUALIZADO_EM = SYSTIMESTAMP
        WHERE ID = :id`, { id: caixaId });
        await this.appendLedgerEvent({
            aggregateType: "CAIXA",
            aggregateId: caixaId,
            eventType: "ACERTO_SOLICITADO",
            payload: {
                acertoId,
                valor: round2(input.valor),
                justificativa: input.justificativa,
                motivo: input.motivo ?? null,
            },
            actor,
            codfilial: summary.CODFILIAL,
            dataMovimento: normalizeDia(summary.DATA_MOVIMENTO),
            numcheckout: summary.NUMCHECKOUT,
            codfunccheckout: summary.CODFUNCCHECKOUT,
            motivo: "Acerto solicitado para divergencia de caixa.",
        });
        const updated = await this.updateSummaryMetrics(caixaId);
        return {
            status: "ok",
            acertoId,
            caixa: updated,
        };
    }
    async getAcertoById(acertoId) {
        return queryOne(`SELECT
        ID, CAIXA_ID, STATUS, VALOR, JUSTIFICATIVA, MOTIVO,
        SOLICITANTE_ID, SOLICITANTE_NOME, APROVADOR_ID, APROVADOR_NOME,
        APROVADO_EM, REPROVADO_EM, OBSERVACAO_DECISAO, REQUEST_ID, CRIADO_EM, ATUALIZADO_EM
      FROM RC_CAIXA_AUDIT_ACERTO
      WHERE ID = :id`, { id: acertoId });
    }
    async aprovarAcerto(acertoId, rawInput, actor) {
        const input = acertoDecisaoSchema.parse(rawInput);
        const acerto = await this.getAcertoById(acertoId);
        if (!acerto)
            throw new AppError("Acerto nao encontrado.", 404);
        this.assertCanApprove(actor, acerto);
        if (acerto.REQUEST_ID && acerto.REQUEST_ID === actor.requestId) {
            await this.logBypass({
                actor,
                caixaId: acerto.CAIXA_ID,
                action: "APROVAR_ACERTO",
                reason: "Request duplicado para aprovacao.",
            });
            throw new AppError("Requisicao duplicada detectada para esta aprovacao.", 409);
        }
        if (acerto.STATUS === "ACERTO_APROVADO") {
            await this.logBypass({
                actor,
                caixaId: acerto.CAIXA_ID,
                action: "APROVAR_ACERTO",
                reason: "Acerto ja aprovado.",
            });
            throw new AppError("Acerto ja aprovado.", 409);
        }
        if (!["ACERTO_SOLICITADO", "ACERTO_EM_APROVACAO"].includes(acerto.STATUS)) {
            throw new AppError(`Acerto em status invalido para aprovacao: ${acerto.STATUS}.`, 422);
        }
        await execDml(`UPDATE RC_CAIXA_AUDIT_ACERTO
          SET STATUS = 'ACERTO_APROVADO',
              APROVADOR_ID = :aprovador_id,
              APROVADOR_NOME = :aprovador_nome,
              APROVADO_EM = SYSTIMESTAMP,
              OBSERVACAO_DECISAO = :observacao,
              REQUEST_ID = :request_id,
              ATUALIZADO_EM = SYSTIMESTAMP
        WHERE ID = :id`, {
            id: acertoId,
            aprovador_id: actor.userId,
            aprovador_nome: actor.userName,
            observacao: input.observacao ?? null,
            request_id: actor.requestId,
        });
        const summary = await this.getSummaryById(acerto.CAIXA_ID);
        if (!summary)
            throw new AppError("Caixa do acerto nao encontrado.", 404);
        await this.appendLedgerEvent({
            aggregateType: "CAIXA",
            aggregateId: acerto.CAIXA_ID,
            eventType: "ACERTO_APROVADO",
            payload: {
                acertoId,
                valor: acerto.VALOR,
                solicitanteId: acerto.SOLICITANTE_ID,
            },
            actor,
            codfilial: summary.CODFILIAL,
            dataMovimento: normalizeDia(summary.DATA_MOVIMENTO),
            numcheckout: summary.NUMCHECKOUT,
            codfunccheckout: summary.CODFUNCCHECKOUT,
            motivo: "Acerto aprovado.",
            observacao: input.observacao,
        });
        if (this.allowedTransition(summary.STATUS_CAIXA, "ACERTO_APROVADO")) {
            await execDml(`UPDATE RC_CAIXA_AUDIT_SUMMARY
            SET STATUS_CAIXA = 'ACERTO_APROVADO',
                STATUS_FILIAL_DIA = 'PRONTA_PARA_FINALIZAR',
                ATUALIZADO_EM = SYSTIMESTAMP
          WHERE ID = :id`, { id: summary.ID });
        }
        const updated = await this.updateSummaryMetrics(acerto.CAIXA_ID);
        return {
            status: "ok",
            acertoId,
            caixa: updated,
        };
    }
    async reprovarAcerto(acertoId, rawInput, actor) {
        const input = acertoDecisaoSchema.parse(rawInput);
        const acerto = await this.getAcertoById(acertoId);
        if (!acerto)
            throw new AppError("Acerto nao encontrado.", 404);
        this.assertCanApprove(actor, acerto);
        if (acerto.STATUS === "ACERTO_REPROVADO") {
            throw new AppError("Acerto ja reprovado.", 409);
        }
        await execDml(`UPDATE RC_CAIXA_AUDIT_ACERTO
          SET STATUS = 'ACERTO_REPROVADO',
              APROVADOR_ID = :aprovador_id,
              APROVADOR_NOME = :aprovador_nome,
              REPROVADO_EM = SYSTIMESTAMP,
              OBSERVACAO_DECISAO = :observacao,
              REQUEST_ID = :request_id,
              ATUALIZADO_EM = SYSTIMESTAMP
        WHERE ID = :id`, {
            id: acertoId,
            aprovador_id: actor.userId,
            aprovador_nome: actor.userName,
            observacao: input.observacao ?? null,
            request_id: actor.requestId,
        });
        const summary = await this.getSummaryById(acerto.CAIXA_ID);
        if (!summary)
            throw new AppError("Caixa do acerto nao encontrado.", 404);
        await this.appendLedgerEvent({
            aggregateType: "CAIXA",
            aggregateId: acerto.CAIXA_ID,
            eventType: "ACERTO_REPROVADO",
            payload: {
                acertoId,
                valor: acerto.VALOR,
                solicitanteId: acerto.SOLICITANTE_ID,
            },
            actor,
            codfilial: summary.CODFILIAL,
            dataMovimento: normalizeDia(summary.DATA_MOVIMENTO),
            numcheckout: summary.NUMCHECKOUT,
            codfunccheckout: summary.CODFUNCCHECKOUT,
            motivo: "Acerto reprovado.",
            observacao: input.observacao,
        });
        await execDml(`UPDATE RC_CAIXA_AUDIT_SUMMARY
          SET STATUS_CAIXA = 'ACERTO_REPROVADO',
              STATUS_FILIAL_DIA = 'COM_DIVERGENCIA',
              ATUALIZADO_EM = SYSTIMESTAMP
        WHERE ID = :id`, { id: summary.ID });
        const updated = await this.updateSummaryMetrics(acerto.CAIXA_ID);
        return {
            status: "ok",
            acertoId,
            caixa: updated,
        };
    }
    async anexarEvidencia(caixaId, rawInput, actor) {
        const input = anexarEvidenciaSchema.parse(rawInput);
        const summary = await this.getSummaryById(caixaId);
        if (!summary)
            throw new AppError("Caixa nao encontrado.", 404);
        const versionRow = await queryOne(`SELECT MAX(VERSAO) AS MAX_VER
       FROM RC_CAIXA_AUDIT_EVIDENCIA
       WHERE ENTIDADE_TIPO = 'CAIXA'
         AND ENTIDADE_ID = :entidade_id
         AND HASH_ARQUIVO = :hash_arquivo`, {
            entidade_id: caixaId,
            hash_arquivo: input.hashArquivo,
        });
        const nextVersion = asNumber(versionRow?.MAX_VER) + 1;
        const storageName = `${caixaId}_${Date.now()}_${input.nomeArquivoOriginal}`;
        await execDml(`INSERT INTO RC_CAIXA_AUDIT_EVIDENCIA (
        ID, ENTIDADE_TIPO, ENTIDADE_ID, TIPO_EVIDENCIA,
        NOME_ARQUIVO_ORIGINAL, NOME_ARQUIVO_STORAGE, MIME_TYPE, TAMANHO_BYTES,
        HASH_ARQUIVO, STORAGE_PATH, USUARIO_UPLOAD, DATA_UPLOAD,
        OBSERVACAO, VERSAO, ATIVO
      ) VALUES (
        :id, 'CAIXA', :entidade_id, :tipo_evidencia,
        :nome_arquivo_original, :nome_arquivo_storage, :mime_type, :tamanho_bytes,
        :hash_arquivo, :storage_path, :usuario_upload, SYSTIMESTAMP,
        :observacao, :versao, 1
      )`, {
            id: randomUUID(),
            entidade_id: caixaId,
            tipo_evidencia: input.tipoEvidencia,
            nome_arquivo_original: input.nomeArquivoOriginal,
            nome_arquivo_storage: storageName,
            mime_type: input.mimeType,
            tamanho_bytes: input.tamanhoBytes,
            hash_arquivo: input.hashArquivo,
            storage_path: input.storagePath,
            usuario_upload: actor.userName,
            observacao: input.observacao ?? null,
            versao: nextVersion,
        });
        await this.appendLedgerEvent({
            aggregateType: "CAIXA",
            aggregateId: caixaId,
            eventType: "EVIDENCIA_ANEXADA",
            payload: {
                tipoEvidencia: input.tipoEvidencia,
                hashArquivo: input.hashArquivo,
                tamanhoBytes: input.tamanhoBytes,
                versao: nextVersion,
            },
            actor,
            codfilial: summary.CODFILIAL,
            dataMovimento: normalizeDia(summary.DATA_MOVIMENTO),
            numcheckout: summary.NUMCHECKOUT,
            codfunccheckout: summary.CODFUNCCHECKOUT,
            motivo: "Evidencia anexada ao caixa.",
        });
        return { status: "ok", versao: nextVersion };
    }
    async finalizarFilialDia(rawInput, actor) {
        if (!this.canFinalize(actor.perfil)) {
            throw new AppError("Perfil sem permissao para finalizar filial/dia.", 403);
        }
        const input = finalizarFilialDiaSchema.parse(rawInput);
        const caixas = await queryRows(`SELECT
        ID, CODFILIAL, DATA_MOVIMENTO, NUMCHECKOUT, CODFUNCCHECKOUT,
        STATUS_CAIXA, STATUS_FILIAL_DIA,
        VALOR_ESPERADO_WINTHOR, VALOR_INFORMADO_OPERADOR, VALOR_AUDITADO, VALOR_ACERTOS_APROVADOS,
        DIFERENCA_ORIGINAL, DIFERENCA_FINAL, RISCO_SCORE, RISCO_NIVEL,
        ULTIMO_SNAPSHOT_ID, ULTIMA_SQL_VERSAO, ULTIMA_SQL_HASH, ULTIMO_RESULT_HASH, SNAPSHOT_GERADO_EM,
        CRIADO_EM, ATUALIZADO_EM
      FROM RC_CAIXA_AUDIT_SUMMARY
      WHERE CODFILIAL = :codfilial
        AND DATA_MOVIMENTO = :data_movimento`, {
            codfilial: input.codfilial,
            data_movimento: toDateOnly(input.dataMovimento),
        });
        if (caixas.length === 0) {
            throw new AppError("Nenhum caixa encontrado para filial/dia.", 404);
        }
        const caixasAbertos = caixas.filter((row) => ["ABERTO", "FECHADO_WINTHOR", "SNAPSHOT_GERADO", "EM_AUDITORIA"].includes(row.STATUS_CAIXA));
        if (caixasAbertos.length > 0) {
            throw new AppError("Nao e permitido finalizar filial/dia com caixas em aberto ou em auditoria.", 422);
        }
        const acertosPendentes = await queryOne(`SELECT COUNT(*) AS TOTAL
       FROM RC_CAIXA_AUDIT_ACERTO A
       JOIN RC_CAIXA_AUDIT_SUMMARY S ON S.ID = A.CAIXA_ID
       WHERE S.CODFILIAL = :codfilial
         AND S.DATA_MOVIMENTO = :data_movimento
         AND A.STATUS IN ('ACERTO_SOLICITADO','ACERTO_EM_APROVACAO')`, {
            codfilial: input.codfilial,
            data_movimento: toDateOnly(input.dataMovimento),
        });
        if (asNumber(acertosPendentes?.TOTAL) > 0) {
            throw new AppError("Nao e permitido finalizar filial/dia com acertos pendentes.", 422);
        }
        const hasDivergencia = caixas.some((row) => Math.abs(asNumber(row.DIFERENCA_FINAL)) > 0.009);
        const nextFilialStatus = hasDivergencia ? "FINALIZADA_COM_DIVERGENCIA_APROVADA" : "FINALIZADA_SEM_DIVERGENCIA";
        await execDml(`UPDATE RC_CAIXA_AUDIT_SUMMARY
          SET STATUS_CAIXA = CASE
                WHEN STATUS_CAIXA = 'ACERTO_APROVADO' OR STATUS_CAIXA = 'AUDITADO_SEM_DIVERGENCIA' OR STATUS_CAIXA = 'AUDITADO_COM_DIVERGENCIA' THEN 'FINALIZADO'
                ELSE STATUS_CAIXA
              END,
              STATUS_FILIAL_DIA = :status_filial_dia,
              ATUALIZADO_EM = SYSTIMESTAMP
        WHERE CODFILIAL = :codfilial
          AND DATA_MOVIMENTO = :data_movimento`, {
            status_filial_dia: nextFilialStatus,
            codfilial: input.codfilial,
            data_movimento: toDateOnly(input.dataMovimento),
        });
        const aggregateId = `${input.codfilial}|${input.dataMovimento}`;
        await this.appendLedgerEvent({
            aggregateType: "FILIAL_DIA",
            aggregateId,
            eventType: "FILIAL_DIA_FINALIZADA",
            payload: {
                codfilial: input.codfilial,
                dataMovimento: input.dataMovimento,
                totalCaixas: caixas.length,
                comDivergencia: hasDivergencia,
            },
            actor,
            codfilial: input.codfilial,
            dataMovimento: input.dataMovimento,
            motivo: "Finalizacao de filial/dia.",
            observacao: input.observacao,
        });
        return {
            status: "ok",
            codfilial: input.codfilial,
            dataMovimento: input.dataMovimento,
            statusFilialDia: nextFilialStatus,
            totalCaixas: caixas.length,
        };
    }
    async compareSnapshotWithWinthor(rawInput, actor) {
        const input = compararSnapshotSchema.parse(rawInput);
        const summary = await this.getSummaryById(input.caixaId);
        if (!summary)
            throw new AppError("Caixa nao encontrado.", 404);
        const snapshotRows = await queryRows(`SELECT
        CAIXA_ID, SNAPSHOT_ID, SNAPSHOT_VERSION, ROW_KEY, ROW_HASH,
        CODFILIAL, DATA_MOVIMENTO, NUMCHECKOUT, CODFUNCCHECKOUT, DTFECHA,
        NUMTRANSVENDA, PREST, CODCOB, VALOR, NSUTEF, CODAUTORIZACAOTEF
      FROM RC_CAIXA_AUDIT_SNAPSHOT
      WHERE CAIXA_ID = :caixa_id`, { caixa_id: input.caixaId });
        if (snapshotRows.length === 0) {
            throw new AppError("Snapshot nao encontrado para o caixa informado.", 404);
        }
        const mapping = await this.resolvePcprestMapping();
        const sql = this.buildSnapshotSql(mapping, true);
        const currentRows = await queryRows(sql, {
            data_inicio: toDateOnly(normalizeDia(summary.DATA_MOVIMENTO)),
            data_fim: toDateOnlyEnd(normalizeDia(summary.DATA_MOVIMENTO)),
            codfilial: summary.CODFILIAL,
        });
        const filteredCurrent = currentRows.filter((row) => {
            return asString(row.NUMCHECKOUT) === summary.NUMCHECKOUT && asString(row.CODFUNCCHECKOUT) === summary.CODFUNCCHECKOUT;
        });
        const snapByKey = new Map();
        for (const row of snapshotRows)
            snapByKey.set(row.ROW_KEY, row);
        const currentByKey = new Map();
        for (const row of filteredCurrent) {
            const rowKey = this.buildRowKey(row);
            const rowHash = hashAny({
                rowKey,
                codfilial: asString(row.CODFILIAL),
                dataMovimento: normalizeDia(asIsoDate(row.DATA_MOVIMENTO) ?? normalizeDia(summary.DATA_MOVIMENTO)),
                numcheckout: asString(row.NUMCHECKOUT),
                codfunccheckout: asString(row.CODFUNCCHECKOUT),
                dtfecha: asIsoDate(row.DTFECHA),
                numtransvenda: asString(row.NUMTRANSVENDA, ""),
                prest: asString(row.PREST, ""),
                codcob: asString(row.CODCOB, ""),
                valor: round2(asNumber(row.VALOR)),
                nsu: asString(row.NSUTEF, ""),
                codaut: asString(row.CODAUTORIZACAOTEF, ""),
            });
            currentByKey.set(rowKey, { row, hash: rowHash });
        }
        const removidas = [];
        const adicionadas = [];
        const alteradas = [];
        for (const [rowKey, snap] of snapByKey.entries()) {
            const now = currentByKey.get(rowKey);
            if (!now) {
                removidas.push({
                    rowKey,
                    numtransvenda: snap.NUMTRANSVENDA,
                    prest: snap.PREST,
                    codcob: snap.CODCOB,
                    valor: snap.VALOR,
                    nsu: snap.NSUTEF,
                    codautorizacao: snap.CODAUTORIZACAOTEF,
                });
                continue;
            }
            if (now.hash !== snap.ROW_HASH) {
                alteradas.push({
                    rowKey,
                    snapshotHash: snap.ROW_HASH,
                    currentHash: now.hash,
                    snapshot: {
                        valor: snap.VALOR,
                        codcob: snap.CODCOB,
                        dtfecha: asIsoDate(snap.DTFECHA),
                        nsu: snap.NSUTEF,
                        codautorizacao: snap.CODAUTORIZACAOTEF,
                        numtransvenda: snap.NUMTRANSVENDA,
                        prest: snap.PREST,
                    },
                    atual: {
                        valor: round2(asNumber(now.row.VALOR)),
                        codcob: asString(now.row.CODCOB, ""),
                        dtfecha: asIsoDate(now.row.DTFECHA),
                        nsu: asString(now.row.NSUTEF, ""),
                        codautorizacao: asString(now.row.CODAUTORIZACAOTEF, ""),
                        numtransvenda: asString(now.row.NUMTRANSVENDA, ""),
                        prest: asString(now.row.PREST, ""),
                    },
                });
            }
        }
        for (const [rowKey, current] of currentByKey.entries()) {
            if (!snapByKey.has(rowKey)) {
                adicionadas.push({
                    rowKey,
                    numtransvenda: asString(current.row.NUMTRANSVENDA, ""),
                    prest: asString(current.row.PREST, ""),
                    codcob: asString(current.row.CODCOB, ""),
                    valor: round2(asNumber(current.row.VALOR)),
                    nsu: asString(current.row.NSUTEF, ""),
                    codautorizacao: asString(current.row.CODAUTORIZACAOTEF, ""),
                });
            }
        }
        const divergente = removidas.length > 0 || adicionadas.length > 0 || alteradas.length > 0;
        await this.appendLedgerEvent({
            aggregateType: "CAIXA",
            aggregateId: input.caixaId,
            eventType: "COMPARACAO_SNAPSHOT_WINTHOR",
            payload: {
                divergente,
                removidas: removidas.length,
                adicionadas: adicionadas.length,
                alteradas: alteradas.length,
            },
            actor,
            codfilial: summary.CODFILIAL,
            dataMovimento: normalizeDia(summary.DATA_MOVIMENTO),
            numcheckout: summary.NUMCHECKOUT,
            codfunccheckout: summary.CODFUNCCHECKOUT,
            motivo: divergente ? "Divergencia detectada entre snapshot e WinThor atual." : "Snapshot e WinThor atual reconciliados.",
        });
        if (divergente) {
            await execDml(`UPDATE RC_CAIXA_AUDIT_SUMMARY
            SET STATUS_FILIAL_DIA = 'COM_DIVERGENCIA',
                ATUALIZADO_EM = SYSTIMESTAMP
          WHERE ID = :id`, { id: input.caixaId });
        }
        return {
            caixaId: input.caixaId,
            divergente,
            resumo: {
                removidas: removidas.length,
                adicionadas: adicionadas.length,
                alteradas: alteradas.length,
            },
            detalhes: {
                removidas,
                adicionadas,
                alteradas,
            },
        };
    }
    async verificarLedger(rawInput) {
        const input = verifyLedgerSchema.parse(rawInput);
        const binds = {};
        const where = input.caixaId
            ? "WHERE AGGREGATE_TYPE = 'CAIXA' AND AGGREGATE_ID = :caixa_id"
            : "WHERE AGGREGATE_TYPE IN ('CAIXA','FILIAL_DIA')";
        if (input.caixaId)
            binds.caixa_id = input.caixaId;
        const rows = await queryRows(`SELECT
        ID, AGGREGATE_TYPE, AGGREGATE_ID, EVENTO_TIPO, EVENTO_VERSAO, PAYLOAD_JSON, PAYLOAD_HASH,
        HASH_EVENTO, HASH_EVENTO_ANTERIOR, USUARIO_ID, USUARIO_NOME, PERFIL_USUARIO,
        CODFILIAL, DATA_MOVIMENTO, NUMCHECKOUT, CODFUNCCHECKOUT,
        CORRELATION_ID, REQUEST_ID, IP_ORIGEM, USER_AGENT,
        CRIADO_EM_UTC, MOTIVO, OBSERVACAO, SEQ_NUM
      FROM RC_CAIXA_AUDIT_EVENT_LEDGER
      ${where}
      ORDER BY AGGREGATE_TYPE, AGGREGATE_ID, SEQ_NUM`, binds);
        const inconsistencias = [];
        const grouped = new Map();
        for (const row of rows) {
            const key = `${row.AGGREGATE_TYPE}|${row.AGGREGATE_ID}`;
            const list = grouped.get(key) ?? [];
            list.push(row);
            grouped.set(key, list);
        }
        for (const [key, list] of grouped.entries()) {
            let previousHash = null;
            for (const row of list) {
                const payload = (() => {
                    try {
                        return row.PAYLOAD_JSON ? JSON.parse(row.PAYLOAD_JSON) : {};
                    }
                    catch {
                        return {};
                    }
                })();
                const expected = hashAny({
                    aggregateType: row.AGGREGATE_TYPE,
                    aggregateId: row.AGGREGATE_ID,
                    eventType: row.EVENTO_TIPO,
                    payloadHash: row.PAYLOAD_HASH,
                    prevHash: row.HASH_EVENTO_ANTERIOR ?? null,
                    seq: row.SEQ_NUM,
                    actorId: row.USUARIO_ID,
                    correlationId: row.CORRELATION_ID,
                    requestId: row.REQUEST_ID,
                });
                if ((row.HASH_EVENTO_ANTERIOR ?? null) !== previousHash) {
                    inconsistencias.push({
                        aggregate: key,
                        seqNum: row.SEQ_NUM,
                        motivo: "Hash anterior nao confere com evento precedente.",
                    });
                }
                if (row.HASH_EVENTO !== expected) {
                    inconsistencias.push({
                        aggregate: key,
                        seqNum: row.SEQ_NUM,
                        motivo: "Hash do evento invalido.",
                        payload,
                    });
                }
                previousHash = row.HASH_EVENTO;
            }
        }
        return {
            totalEventos: rows.length,
            aggregates: grouped.size,
            integridade: inconsistencias.length === 0,
            inconsistencias,
        };
    }
    async gerarPacoteAuditoria(rawInput) {
        const input = pacoteAuditoriaSchema.parse(rawInput);
        const summary = await this.getSummaryById(input.caixaId);
        if (!summary)
            throw new AppError("Caixa nao encontrado.", 404);
        const detalhe = await this.getCaixaDetalhe(input.caixaId, {
            userId: "system",
            userName: "system",
            perfil: "ADMIN",
            ipOrigem: "127.0.0.1",
            userAgent: "system",
            correlationId: randomUUID(),
            requestId: randomUUID(),
        });
        const ledgerIntegrity = await this.verificarLedger({ caixaId: input.caixaId });
        const manifest = {
            pacoteId: randomUUID(),
            geradoEm: new Date().toISOString(),
            caixa: {
                id: summary.ID,
                codfilial: summary.CODFILIAL,
                dataMovimento: normalizeDia(summary.DATA_MOVIMENTO),
                numcheckout: summary.NUMCHECKOUT,
                codfunccheckout: summary.CODFUNCCHECKOUT,
            },
            resumo: detalhe,
            ledgerIntegrity,
        };
        const manifestHash = hashAny(manifest);
        return {
            ...manifest,
            manifestoHash: manifestHash,
            artefatos: [
                {
                    nome: "manifesto.json",
                    hash: manifestHash,
                    tamanhoBytes: JSON.stringify(manifest).length,
                },
            ],
        };
    }
}
export const caixaAuditSchemas = {
    snapshotRequestSchema,
    caixasListSchema,
    resumoFechamentoSchema,
    auditoriaFinalSchema,
    acertoSolicitacaoSchema,
    acertoDecisaoSchema,
    anexarEvidenciaSchema,
    finalizarFilialDiaSchema,
    compararSnapshotSchema,
    pacoteAuditoriaSchema,
    verifyLedgerSchema,
};
