import { z } from "zod";
import { hasOracleConfig } from "../../config/env.js";
import { initOraclePool } from "../../db/oracle.js";
import { queryRows } from "../../repositories/baseRepository.js";
import { AppError } from "../../utils/error.js";
const filterSchema = z.object({
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
const DUE_DATE_CANDIDATES = [
    "DTVENC",
    "DTVENCIMENTO",
    "DTVENCTO",
];
const RISCO_LEVEL = {
    ALTO: 3,
    MEDIO: 2,
    BAIXO: 1,
};
function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}
function round2(value) {
    return Number(toNumber(value).toFixed(2));
}
function toTrimmedString(value, fallback = "") {
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed.length > 0)
            return trimmed;
    }
    if (typeof value === "number")
        return String(value);
    return fallback;
}
function normalizeToken(value) {
    return String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
}
function toIsoDate(value) {
    if (!value)
        return null;
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed)
            return null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed))
            return trimmed;
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
            const [dd, mm, yyyy] = trimmed.split("/");
            return `${yyyy}-${mm}-${dd}`;
        }
        const parsed = new Date(trimmed);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed.toISOString().slice(0, 10);
        }
        return null;
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10);
    }
    return null;
}
function parseInputDate(value) {
    const iso = toIsoDate(value);
    if (!iso)
        return null;
    return new Date(`${iso}T00:00:00.000Z`);
}
function formatMonthKey(isoDate) {
    if (!isoDate)
        return "SEM_DATA";
    return String(isoDate).slice(0, 7);
}
function getWeekOfMonth(isoDate) {
    if (!isoDate)
        return 0;
    const parsed = new Date(`${isoDate}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()))
        return 0;
    const day = parsed.getUTCDate();
    return Math.floor((day - 1) / 7) + 1;
}
function average(values) {
    if (!Array.isArray(values) || values.length === 0)
        return 0;
    const total = values.reduce((acc, curr) => acc + toNumber(curr), 0);
    return total / values.length;
}
function classifyRiskByValue(value) {
    if (value >= 10000)
        return "ALTO";
    if (value >= 3000)
        return "MEDIO";
    return "BAIXO";
}
function sortByRiskAndValue(a, b) {
    const riskDiff = (RISCO_LEVEL[b.risco] ?? 0) - (RISCO_LEVEL[a.risco] ?? 0);
    if (riskDiff !== 0)
        return riskDiff;
    return toNumber(b.valorMedioHistorico) - toNumber(a.valorMedioHistorico);
}
function pickMostCommonText(values) {
    const counter = new Map();
    for (const value of values) {
        const text = toTrimmedString(value, "-");
        if (text === "-")
            continue;
        counter.set(text, (counter.get(text) ?? 0) + 1);
    }
    let best = "-";
    let score = 0;
    for (const [key, count] of counter.entries()) {
        if (count > score) {
            best = key;
            score = count;
        }
    }
    return best;
}
function buildDateRange(parsedFilters) {
    const dataInicialIso = toIsoDate(parsedFilters.dataInicial);
    const dataFinalIso = toIsoDate(parsedFilters.dataFinal);
    const dataInicial = dataInicialIso ? new Date(`${dataInicialIso}T00:00:00.000Z`) : null;
    const dataFinal = dataFinalIso ? new Date(`${dataFinalIso}T23:59:59.999Z`) : null;
    return {
        dataInicialIso,
        dataFinalIso,
        dataInicial,
        dataFinal,
    };
}
function isBetween(dateIso, range) {
    if (!dateIso)
        return false;
    const parsed = new Date(`${dateIso}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()))
        return false;
    if (range.dataInicial && parsed < range.dataInicial)
        return false;
    if (range.dataFinal && parsed > range.dataFinal)
        return false;
    return true;
}
function mapStatusGerencial(dtPagto) {
    return dtPagto ? "PAGO" : "EM_ABERTO";
}
function asFornecedorKey(row) {
    const cod = row.codFornec == null ? "" : String(row.codFornec);
    const nome = normalizeToken(row.fornecedor || "SEM_FORNECEDOR");
    return `${cod}::${nome}`;
}
function asFornecedorContaKey(row) {
    return `${asFornecedorKey(row)}::${row.codConta ?? "0"}`;
}
function formatFrequency(intervalDays) {
    const rounded = Math.max(1, Math.round(intervalDays));
    if (rounded >= 26 && rounded <= 35)
        return "Mensal estimada";
    if (rounded >= 12 && rounded <= 18)
        return "Quinzenal estimada";
    if (rounded >= 6 && rounded <= 8)
        return "Semanal estimada";
    return `${rounded} dias (estimado)`;
}
function addDaysIso(isoDate, days) {
    const parsed = new Date(`${isoDate}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()))
        return null;
    parsed.setUTCDate(parsed.getUTCDate() + Math.max(1, Math.round(days)));
    return parsed.toISOString().slice(0, 10);
}
function formatDatePtBr(isoDate) {
    if (!isoDate)
        return "-";
    const parsed = new Date(`${isoDate}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()))
        return "-";
    return parsed.toLocaleDateString("pt-BR");
}
function formatCurrency(value) {
    return round2(value).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
    });
}
export class FinanceiroTiService {
    logger;
    dueDateColumn = null;
    dueDateColumnResolved = false;
    constructor(logger) {
        this.logger = logger;
    }
    async ensurePool() {
        if (!hasOracleConfig()) {
            throw new AppError("Oracle WinThor nao configurado para o modulo Financeiro-TI.", 503);
        }
        await initOraclePool();
    }
    async resolveDueDateColumn() {
        if (this.dueDateColumnResolved)
            return this.dueDateColumn;
        this.dueDateColumnResolved = true;
        try {
            const userRows = await queryRows(`
        SELECT COLUMN_NAME
          FROM USER_TAB_COLUMNS
         WHERE TABLE_NAME = 'PCLANC'
           AND COLUMN_NAME IN ('DTVENC', 'DTVENCIMENTO', 'DTVENCTO')
      `);
            const available = new Set((userRows ?? []).map((row) => toTrimmedString(row.COLUMN_NAME).toUpperCase()));
            for (const candidate of DUE_DATE_CANDIDATES) {
                if (available.has(candidate)) {
                    this.dueDateColumn = candidate;
                    return this.dueDateColumn;
                }
            }
        }
        catch (error) {
            this.logger?.warn?.({ error }, "Financeiro-TI: nao foi possivel detectar coluna de vencimento");
        }
        this.dueDateColumn = null;
        return null;
    }
    buildSql(filters, dueDateColumn) {
        const whereExtra = [];
        if (filters.codFornec != null) {
            whereExtra.push("AND L.CODFORNEC = :codFornec");
        }
        if (filters.codConta != null) {
            whereExtra.push("AND L.CODCONTA = :codConta");
        }
        if (filters.centroCusto) {
            whereExtra.push("AND R.CODIGOCENTROCUSTO LIKE :centroCustoLike");
        }
        if (filters.grupoConta != null) {
            whereExtra.push("AND P.GRUPOCONTA = :grupoConta");
        }
        if (filters.fornecedor) {
            whereExtra.push("AND UPPER(NVL(F.FORNECEDOR, ' ')) LIKE :fornecedorLike");
        }
        if (filters.status === "PAGO") {
            whereExtra.push("AND L.DTPAGTO IS NOT NULL");
        }
        if (filters.status === "EM_ABERTO") {
            whereExtra.push("AND L.DTPAGTO IS NULL");
        }
        const dueExpr = dueDateColumn
            ? `L.${dueDateColumn} AS DTVENCIMENTO`
            : "CAST(NULL AS DATE) AS DTVENCIMENTO";
        const dateRefExpr = dueDateColumn
            ? `NVL(L.DTPAGTO, NVL(L.${dueDateColumn}, L.DTLANC))`
            : "NVL(L.DTPAGTO, L.DTLANC)";
        if (filters.dataInicial) {
            whereExtra.push(`AND TRUNC(${dateRefExpr}) >= :dataInicialRef`);
        }
        if (filters.dataFinal) {
            whereExtra.push(`AND TRUNC(${dateRefExpr}) <= :dataFinalRef`);
        }
        return `
      WITH BASE AS (
          SELECT
              R.CODIGOCENTROCUSTO,
              C.DESCRICAO,
              L.RECNUM,
              L.CODFILIAL,
              R.VALOR AS VALOR_RATEIO,
              L.VALOR AS VALOR_LANCAMENTO,
              R.PERCRATEIO,
               L.CODCONTA,
               P.CONTA,
               P.GRUPOCONTA,
               NVL(TRIM(G.GRUPO), 'SEM_DESCRICAO_GRUPO') AS GRUPO_DESCRICAO,
               L.NUMNOTA,
               L.CODFORNEC,
               NVL(TRIM(F.FORNECEDOR), 'SEM_FORNECEDOR') AS FORNECEDOR,
              L.HISTORICO,
              L.DTPAGTO,
              L.DTLANC,
              ${dueExpr}
          FROM PCLANC L
          JOIN PCRATEIOCENTROCUSTO R
            ON R.CODCONTA = L.CODCONTA
           AND R.RECNUM = L.RECNUM
          JOIN PCCENTROCUSTO C
            ON C.CODIGOCENTROCUSTO = R.CODIGOCENTROCUSTO
          JOIN PCCONTA P
            ON P.CODCONTA = L.CODCONTA
          LEFT JOIN PCGRUPO G
            ON G.CODGRUPO = P.GRUPOCONTA
          LEFT JOIN PCFORNEC F
            ON F.CODFORNEC = L.CODFORNEC
          LEFT JOIN PCNFSAID NFS
            ON NFS.NUMTRANSVENDA = L.NUMTRANSVENDA
          WHERE R.CODIGOCENTROCUSTO LIKE '5.1.11%'
            AND NVL(L.CODROTINABAIXA, 0) <> 737
            AND L.DTESTORNOBAIXA IS NULL
            AND L.DTCANCEL IS NULL
            AND NVL(L.VALOR, 0) > 0
            AND NVL(R.VALOR, 0) > 0
            AND UPPER(NVL(L.HISTORICO, ' ')) NOT LIKE '%ESTORNO%'
            AND NVL(NFS.CONDVENDA, 0) NOT IN (10, 20, 98, 99)
            AND (
                   NVL(NFS.CODFISCAL, 0) NOT IN (522, 622, 722, 532, 632, 732)
                   OR TO_CHAR(L.CODCONTA) = (
                          SELECT VALOR
                            FROM PCPARAMFILIAL
                           WHERE NOME = 'CON_CODCONTRECJUR'
                      )
                )
            AND NOT EXISTS (
                  SELECT 1
                    FROM PCESTCOM D
                    JOIN PCNFSAID N
                      ON N.NUMTRANSVENDA = D.NUMTRANSVENDA
                   WHERE D.NUMTRANSENT = L.NUMTRANSENT
                     AND D.DTESTORNO = L.DTLANC
                     AND N.CONDVENDA IN (20)
                )
            AND NVL(P.INVESTIMENTO, 'N') <> 'S'
            AND P.GRUPOCONTA BETWEEN 200 AND 900
            ${whereExtra.join("\n            ")}
      ),
      TOT AS (
          SELECT
              CODIGOCENTROCUSTO,
              COUNT(DISTINCT RECNUM) AS QTDCENTROCUSTO,
              SUM(VALOR_RATEIO) AS VLRTOTALCENTROCUSTO
            FROM BASE
           GROUP BY CODIGOCENTROCUSTO
      )
      SELECT
          B.CODIGOCENTROCUSTO,
          B.DESCRICAO,
          B.RECNUM,
          B.CODFILIAL,
          SUM(B.VALOR_RATEIO) AS VALORCENTROCUSTO,
          SUM(B.VALOR_LANCAMENTO) AS VALORLANC,
          SUM(B.PERCRATEIO) AS PERCRATEIO,
          B.CODCONTA,
          B.CONTA,
          B.RECNUM AS NUMLANC,
          B.GRUPOCONTA,
          B.GRUPO_DESCRICAO,
          B.NUMNOTA,
          B.CODFORNEC,
          B.FORNECEDOR,
          B.HISTORICO,
          B.DTPAGTO,
          B.DTLANC,
          B.DTVENCIMENTO,
          NVL(T.QTDCENTROCUSTO, 0) AS QTDCENTROCUSTO,
          NVL(T.VLRTOTALCENTROCUSTO, 0) AS VLRTOTALCENTROCUSTO
        FROM BASE B
        LEFT JOIN TOT T
          ON T.CODIGOCENTROCUSTO = B.CODIGOCENTROCUSTO
       GROUP BY
          B.CODIGOCENTROCUSTO,
          B.DESCRICAO,
          B.CODCONTA,
          B.CONTA,
          B.RECNUM,
          B.CODFILIAL,
          B.GRUPOCONTA,
          B.GRUPO_DESCRICAO,
          B.NUMNOTA,
          B.CODFORNEC,
          B.FORNECEDOR,
          B.HISTORICO,
          B.DTPAGTO,
          B.DTLANC,
          B.DTVENCIMENTO,
          NVL(T.QTDCENTROCUSTO, 0),
          NVL(T.VLRTOTALCENTROCUSTO, 0)
      HAVING SUM(B.VALOR_RATEIO) <> 0
       ORDER BY
          B.CODIGOCENTROCUSTO,
          B.CODCONTA,
          VALORCENTROCUSTO DESC,
          B.RECNUM
    `;
    }
    buildBinds(parsedFilters) {
        const binds = {};
        if (parsedFilters.codFornec != null)
            binds.codFornec = parsedFilters.codFornec;
        if (parsedFilters.codConta != null)
            binds.codConta = parsedFilters.codConta;
        if (parsedFilters.grupoConta != null)
            binds.grupoConta = parsedFilters.grupoConta;
        if (parsedFilters.centroCusto)
            binds.centroCustoLike = `${parsedFilters.centroCusto.trim()}%`;
        if (parsedFilters.fornecedor)
            binds.fornecedorLike = `%${parsedFilters.fornecedor.trim().toUpperCase()}%`;
        const dataInicialRef = parseInputDate(parsedFilters.dataInicial);
        const dataFinalRef = parseInputDate(parsedFilters.dataFinal);
        if (dataInicialRef)
            binds.dataInicialRef = dataInicialRef;
        if (dataFinalRef)
            binds.dataFinalRef = dataFinalRef;
        return binds;
    }
    mapRow(row) {
        const dtPagto = toIsoDate(row.DTPAGTO);
        const dtLanc = toIsoDate(row.DTLANC);
        const dtVencimento = toIsoDate(row.DTVENCIMENTO);
        const valorCentroCusto = round2(row.VALORCENTROCUSTO);
        const valorLanc = round2(row.VALORLANC);
        return {
            codCentroCusto: toTrimmedString(row.CODIGOCENTROCUSTO, "-"),
            centroCusto: toTrimmedString(row.DESCRICAO, "-"),
            recnum: Number(row.RECNUM ?? 0),
            codFilial: toTrimmedString(row.CODFILIAL, "-"),
            numLanc: Number(row.NUMLANC ?? row.RECNUM ?? 0),
            codConta: Number(row.CODCONTA ?? 0),
            conta: toTrimmedString(row.CONTA, "-"),
            grupoConta: Number(row.GRUPOCONTA ?? 0),
            grupoDescricao: toTrimmedString(row.GRUPO_DESCRICAO, "SEM_DESCRICAO_GRUPO"),
            numNota: toTrimmedString(row.NUMNOTA, "-"),
            codFornec: row.CODFORNEC == null ? null : Number(row.CODFORNEC),
            fornecedor: toTrimmedString(row.FORNECEDOR, "SEM_FORNECEDOR"),
            historico: toTrimmedString(row.HISTORICO, "-"),
            dtPagto,
            dtLanc,
            dtVencimento,
            valorCentroCusto,
            valorLanc,
            percRateio: round2(row.PERCRATEIO),
            qtdCentroCusto: Number(row.QTDCENTROCUSTO ?? 0),
            vlrTotalCentroCusto: round2(row.VLRTOTALCENTROCUSTO),
            statusGerencial: mapStatusGerencial(dtPagto),
        };
    }
    filterRows(rows, filters) {
        const range = buildDateRange(filters);
        if (!range.dataInicial && !range.dataFinal)
            return rows;
        return rows.filter((row) => {
            const refDate = row.dtPagto || row.dtVencimento || row.dtLanc;
            if (!refDate)
                return false;
            return isBetween(refDate, range);
        });
    }
    buildRecurringMissing(rows, filters) {
        const pagos = rows.filter((row) => row.statusGerencial === "PAGO" && row.dtPagto);
        const emAberto = rows.filter((row) => row.statusGerencial === "EM_ABERTO");
        const openByGroup = new Set(emAberto.map((row) => asFornecedorContaKey(row)));
        const byGroup = new Map();
        for (const row of pagos) {
            const key = asFornecedorContaKey(row);
            if (!byGroup.has(key))
                byGroup.set(key, []);
            byGroup.get(key).push(row);
        }
        const results = [];
        for (const [key, group] of byGroup.entries()) {
            if (group.length <= 3)
                continue;
            const months = new Set(group.map((item) => formatMonthKey(item.dtPagto)));
            if (months.size < 2)
                continue;
            if (openByGroup.has(key))
                continue;
            const pagamentosOrdenados = [...group]
                .map((item) => item.dtPagto)
                .filter(Boolean)
                .sort();
            const valores = group.map((item) => item.valorCentroCusto);
            const valorMedioHistorico = round2(average(valores));
            const ultimoPagamento = pagamentosOrdenados[pagamentosOrdenados.length - 1] ?? null;
            const intervals = [];
            for (let index = 1; index < pagamentosOrdenados.length; index += 1) {
                const previous = new Date(`${pagamentosOrdenados[index - 1]}T00:00:00.000Z`);
                const current = new Date(`${pagamentosOrdenados[index]}T00:00:00.000Z`);
                if (!Number.isNaN(previous.getTime()) && !Number.isNaN(current.getTime())) {
                    const diff = Math.round((current.getTime() - previous.getTime()) / (24 * 60 * 60 * 1000));
                    if (diff > 0)
                        intervals.push(diff);
                }
            }
            const mediaIntervalo = intervals.length > 0 ? average(intervals) : 30;
            const proximoVencimentoEstimado = ultimoPagamento ? addDaysIso(ultimoPagamento, mediaIntervalo || 30) : null;
            const amostra = group[0];
            const risco = classifyRiskByValue(valorMedioHistorico);
            const frequenciaProvavel = formatFrequency(mediaIntervalo || 30);
            const historicoMaisComum = pickMostCommonText(group.map((item) => item.historico));
            const constaContasAPagar = openByGroup.has(key);
            const comentario = "Fornecedor pago de forma recorrente no historico sem lancamento equivalente em aberto.";
            results.push({
                codFornec: amostra.codFornec,
                fornecedor: amostra.fornecedor,
                codFilial: amostra.codFilial,
                dtVencimento: amostra.dtVencimento ?? null,
                codConta: amostra.codConta,
                conta: amostra.conta,
                historicoMaisComum,
                qtdPagamentos: group.length,
                valorMedioHistorico,
                ultimoPagamento,
                frequenciaProvavel,
                proximoVencimentoEstimado,
                constaContasAPagar,
                risco,
                comentario,
                valorMedioHistoricoFormatado: formatCurrency(valorMedioHistorico),
                ultimoPagamentoFormatado: formatDatePtBr(ultimoPagamento),
                proximoVencimentoEstimadoFormatado: proximoVencimentoEstimado
                    ? `${formatDatePtBr(proximoVencimentoEstimado)} (estimado)`
                    : "Sem estimativa",
            });
        }
        const filtered = results.filter((item) => {
            if (filters.risco && item.risco !== filters.risco)
                return false;
            if (filters.codFornec != null && Number(item.codFornec ?? -1) !== Number(filters.codFornec))
                return false;
            if (filters.codConta != null && Number(item.codConta ?? -1) !== Number(filters.codConta))
                return false;
            if (filters.fornecedor && !normalizeToken(item.fornecedor).includes(normalizeToken(filters.fornecedor)))
                return false;
            return true;
        });
        return filtered.sort(sortByRiskAndValue);
    }
    buildTop5Concentration(openRows) {
        const totalOpen = openRows.reduce((acc, row) => acc + row.valorCentroCusto, 0);
        if (totalOpen <= 0)
            return 0;
        const byFornecedor = new Map();
        for (const row of openRows) {
            const key = asFornecedorKey(row);
            byFornecedor.set(key, (byFornecedor.get(key) ?? 0) + row.valorCentroCusto);
        }
        const top5 = [...byFornecedor.values()].sort((a, b) => b - a).slice(0, 5);
        const totalTop5 = top5.reduce((acc, value) => acc + value, 0);
        return Number(((totalTop5 / totalOpen) * 100).toFixed(2));
    }
    buildResumo(rows, recurringMissing, hasDueDateColumn) {
        const pagos = rows.filter((row) => row.statusGerencial === "PAGO");
        const emAberto = rows.filter((row) => row.statusGerencial === "EM_ABERTO");
        const totalPagoHistorico = round2(pagos.reduce((acc, row) => acc + row.valorCentroCusto, 0));
        const totalAbertoRegistrado = round2(emAberto.reduce((acc, row) => acc + row.valorCentroCusto, 0));
        const totalRecorrenciasEstimadas = round2(recurringMissing.reduce((acc, row) => acc + row.valorMedioHistorico, 0));
        const totalProjetado = round2(totalAbertoRegistrado + totalRecorrenciasEstimadas);
        const percentualConcentracaoTop5 = this.buildTop5Concentration(emAberto);
        const qtdFornecedoresRecorrentesAusentes = recurringMissing.length;
        const maiorRisco = recurringMissing.some((item) => item.risco === "ALTO")
            ? "Fornecedores recorrentes sem provisao no contas a pagar."
            : emAberto.some((item) => !item.dtVencimento)
                ? "Contas em aberto sem vencimento informado."
                : "Sem risco critico identificado no periodo filtrado.";
        return {
            totalPagoHistorico,
            totalAbertoRegistrado,
            totalRecorrenciasEstimadas,
            totalProjetado,
            qtdFornecedoresRecorrentesAusentes,
            maiorRisco,
            percentualConcentracaoTop5,
            totalPagoHistoricoFormatado: formatCurrency(totalPagoHistorico),
            totalAbertoRegistradoFormatado: formatCurrency(totalAbertoRegistrado),
            totalRecorrenciasEstimadasFormatado: formatCurrency(totalRecorrenciasEstimadas),
            totalProjetadoFormatado: formatCurrency(totalProjetado),
            percentualConcentracaoTop5Formatado: `${percentualConcentracaoTop5.toFixed(2)}%`,
            vencimentoDisponivel: Boolean(hasDueDateColumn),
            mensagemVencimento: hasDueDateColumn
                ? null
                : "Base sem coluna de vencimento detectada em PCLANC. Projecoes usam datas estimadas.",
        };
    }
    buildFluxoProjetado(rows, recurringMissing, filters, hasDueDateColumn) {
        const emAberto = rows.filter((row) => row.statusGerencial === "EM_ABERTO");
        const agrupador = new Map();
        const pushBucket = (key, label, tipo, oficial, estimado, observacao) => {
            const current = agrupador.get(key) ?? {
                periodo: label,
                granularidade: tipo,
                contasAPagarRegistrado: 0,
                recorrenciasEstimadasNaoLancadas: 0,
                totalProjetado: 0,
                observacao: observacao ?? "",
                risco: "BAIXO",
            };
            current.contasAPagarRegistrado = round2(current.contasAPagarRegistrado + oficial);
            current.recorrenciasEstimadasNaoLancadas = round2(current.recorrenciasEstimadasNaoLancadas + estimado);
            current.totalProjetado = round2(current.contasAPagarRegistrado + current.recorrenciasEstimadasNaoLancadas);
            const riscoAtual = classifyRiskByValue(current.totalProjetado);
            current.risco = RISCO_LEVEL[riscoAtual] >= RISCO_LEVEL[current.risco] ? riscoAtual : current.risco;
            agrupador.set(key, current);
        };
        const includeMensal = filters.visao === "MENSAL" || filters.visao === "TODOS";
        const includeSemanal = filters.visao === "SEMANAL" || filters.visao === "TODOS";
        for (const row of emAberto) {
            const dueDate = row.dtVencimento || row.dtLanc || null;
            const usingDueDate = Boolean(row.dtVencimento);
            const periodBase = dueDate ?? "SEM_DATA_REFERENCIA";
            const observacaoOficial = usingDueDate
                ? "Oficial lançado"
                : "Oficial lançado (sem DTVENC; usando DTLANC)";
            if (includeSemanal) {
                const label = dueDate
                    ? `${periodBase.slice(0, 7)} - Semana ${getWeekOfMonth(periodBase)}`
                    : "Sem data de referencia";
                pushBucket(`S:${label}`, label, "SEMANAL", row.valorCentroCusto, 0, observacaoOficial);
            }
            if (includeMensal) {
                const monthLabel = dueDate ? periodBase.slice(0, 7) : "Sem data de referencia";
                pushBucket(`M:${monthLabel}`, monthLabel, "MENSAL", row.valorCentroCusto, 0, observacaoOficial);
            }
        }
        for (const item of recurringMissing) {
            const dueDate = item.proximoVencimentoEstimado || null;
            const periodBase = dueDate ?? "SEM_ESTIMATIVA";
            if (includeSemanal) {
                const label = dueDate
                    ? `${periodBase.slice(0, 7)} - Semana ${getWeekOfMonth(periodBase)}`
                    : "Sem estimativa de data";
                pushBucket(`S:${label}`, label, "SEMANAL", 0, item.valorMedioHistorico, "Recorrência estimada");
            }
            if (includeMensal) {
                const monthLabel = dueDate ? periodBase.slice(0, 7) : "Sem estimativa de data";
                pushBucket(`M:${monthLabel}`, monthLabel, "MENSAL", 0, item.valorMedioHistorico, "Recorrência estimada");
            }
        }
        const rowsFluxo = [...agrupador.values()]
            .map((item) => ({
            ...item,
            contasAPagarRegistradoFormatado: formatCurrency(item.contasAPagarRegistrado),
            recorrenciasEstimadasNaoLancadasFormatado: formatCurrency(item.recorrenciasEstimadasNaoLancadas),
            totalProjetadoFormatado: formatCurrency(item.totalProjetado),
            observacao: item.observacao || (hasDueDateColumn ? "Oficial lançado" : "Sem vencimento oficial"),
        }))
            .filter((item) => !filters.risco || item.risco === filters.risco)
            .sort((a, b) => {
            const typeWeight = a.granularidade === b.granularidade ? 0 : a.granularidade === "SEMANAL" ? -1 : 1;
            if (typeWeight !== 0)
                return typeWeight;
            return a.periodo.localeCompare(b.periodo, "pt-BR");
        });
        return rowsFluxo;
    }
    buildAlertas(rows, recurringMissing, resumo) {
        const alertas = [];
        if (recurringMissing.length > 0) {
            const valor = recurringMissing.reduce((acc, row) => acc + row.valorMedioHistorico, 0);
            const risco = valor >= 10000 ? "ALTO" : valor >= 3000 ? "MEDIO" : "BAIXO";
            alertas.push({
                tipo: "RECORRENCIA_AUSENTE",
                mensagem: "Fornecedores recorrentes com estimativa sem lançamento oficial em aberto.",
                valor: round2(valor),
                valorFormatado: formatCurrency(valor),
                risco,
                acaoRecomendada: "Validar contratos/boletos e provisionar no contas a pagar.",
            });
        }
        const semVencimento = rows
            .filter((row) => row.statusGerencial === "EM_ABERTO")
            .filter((row) => !row.dtVencimento);
        if (semVencimento.length > 0) {
            const valor = semVencimento.reduce((acc, row) => acc + row.valorCentroCusto, 0);
            alertas.push({
                tipo: "ABERTO_SEM_VENCIMENTO",
                mensagem: "Existem contas em aberto sem vencimento oficial informado.",
                valor: round2(valor),
                valorFormatado: formatCurrency(valor),
                risco: valor >= 10000 ? "ALTO" : valor >= 3000 ? "MEDIO" : "BAIXO",
                acaoRecomendada: "Completar campo de vencimento no ERP para melhorar a projeção do fluxo.",
            });
        }
        if (resumo.percentualConcentracaoTop5 >= 60) {
            alertas.push({
                tipo: "CONCENTRACAO_TOP5",
                mensagem: "Alta concentração do contas a pagar nos 5 maiores fornecedores.",
                valor: round2(resumo.totalAbertoRegistrado),
                valorFormatado: formatCurrency(resumo.totalAbertoRegistrado),
                risco: resumo.percentualConcentracaoTop5 >= 80 ? "ALTO" : "MEDIO",
                acaoRecomendada: "Distribuir desembolsos e revisar planejamento de caixa para evitar pico.",
            });
        }
        if (alertas.length === 0) {
            alertas.push({
                tipo: "SEM_ALERTAS_CRITICOS",
                mensagem: "Nenhum alerta crítico identificado para os filtros aplicados.",
                valor: 0,
                valorFormatado: formatCurrency(0),
                risco: "BAIXO",
                acaoRecomendada: "Manter monitoramento periódico da carteira de TI.",
            });
        }
        return alertas.sort((a, b) => (RISCO_LEVEL[b.risco] ?? 0) - (RISCO_LEVEL[a.risco] ?? 0));
    }
    buildEvolucaoMensal(rows) {
        const pagos = rows.filter((row) => row.statusGerencial === "PAGO" && row.dtPagto);
        const buckets = new Map();
        for (const row of pagos) {
            const mes = formatMonthKey(row.dtPagto);
            buckets.set(mes, round2((buckets.get(mes) ?? 0) + row.valorCentroCusto));
        }
        return [...buckets.entries()]
            .map(([mes, valor]) => ({
            mes,
            totalPago: valor,
            totalPagoFormatado: formatCurrency(valor),
        }))
            .sort((a, b) => a.mes.localeCompare(b.mes, "pt-BR"));
    }
    async loadBaseRows(rawFilters = {}) {
        await this.ensurePool();
        const filters = filterSchema.parse({
            ...rawFilters,
            dataInicial: rawFilters?.dataInicial || rawFilters?.dataInicio || rawFilters?.dtInicial,
            dataFinal: rawFilters?.dataFinal || rawFilters?.dataFim || rawFilters?.dtFinal,
            tipoAnalise: rawFilters?.tipoAnalise || "TODOS",
            visao: rawFilters?.visao || "TODOS",
        });
        const dueDateColumn = await this.resolveDueDateColumn();
        const sql = this.buildSql(filters, dueDateColumn);
        const binds = this.buildBinds(filters);
        const rawRows = await queryRows(sql, binds);
        const mapped = rawRows.map((row) => this.mapRow(row));
        const filtered = this.filterRows(mapped, filters);
        return {
            filters,
            dueDateColumn,
            rows: filtered,
        };
    }
    async getLancamentos(rawFilters = {}) {
        const dataset = await this.loadBaseRows(rawFilters);
        const rows = dataset.rows.filter((row) => {
            if (dataset.filters.status === "RECORRENCIA_ESTIMADA")
                return false;
            if (dataset.filters.tipoAnalise === "ESTIMADO_HISTORICO")
                return false;
            if (dataset.filters.status && dataset.filters.status !== "RECORRENCIA_ESTIMADA") {
                return row.statusGerencial === dataset.filters.status;
            }
            return true;
        });
        return {
            filtrosAplicados: dataset.filters,
            vencimentoDetectado: dataset.dueDateColumn,
            vencimentoDisponivel: Boolean(dataset.dueDateColumn),
            avisoVencimento: dataset.dueDateColumn
                ? null
                : "Sem vencimento oficial em PCLANC para esta consulta.",
            total: rows.length,
            itens: rows,
        };
    }
    async getResumo(rawFilters = {}) {
        const dataset = await this.loadBaseRows(rawFilters);
        const recurringMissing = this.buildRecurringMissing(dataset.rows, dataset.filters);
        const resumo = this.buildResumo(dataset.rows, recurringMissing, Boolean(dataset.dueDateColumn));
        return {
            ...resumo,
            resumoExecutivo: `Foram identificados ${formatCurrency(resumo.totalAbertoRegistrado)} em contas a pagar registradas para TI e ${formatCurrency(resumo.totalRecorrenciasEstimadas)} em recorrências prováveis não lançadas. O total gerencial projetado é de ${formatCurrency(resumo.totalProjetado)}.`,
        };
    }
    async getRecorrenciasAusentes(rawFilters = {}) {
        const dataset = await this.loadBaseRows(rawFilters);
        const recurringMissing = this.buildRecurringMissing(dataset.rows, dataset.filters);
        return {
            filtrosAplicados: dataset.filters,
            total: recurringMissing.length,
            itens: recurringMissing,
        };
    }
    async getFluxoProjetado(rawFilters = {}) {
        const dataset = await this.loadBaseRows(rawFilters);
        const recurringMissing = this.buildRecurringMissing(dataset.rows, dataset.filters);
        const fluxo = this.buildFluxoProjetado(dataset.rows, recurringMissing, dataset.filters, Boolean(dataset.dueDateColumn));
        return {
            filtrosAplicados: dataset.filters,
            total: fluxo.length,
            itens: fluxo,
        };
    }
    async getAlertas(rawFilters = {}) {
        const dataset = await this.loadBaseRows(rawFilters);
        const recurringMissing = this.buildRecurringMissing(dataset.rows, dataset.filters);
        const resumo = this.buildResumo(dataset.rows, recurringMissing, Boolean(dataset.dueDateColumn));
        const alertas = this.buildAlertas(dataset.rows, recurringMissing, resumo);
        return {
            filtrosAplicados: dataset.filters,
            total: alertas.length,
            itens: alertas,
        };
    }
    async getDashboard(rawFilters = {}) {
        const dataset = await this.loadBaseRows(rawFilters);
        const recurringMissing = this.buildRecurringMissing(dataset.rows, dataset.filters);
        const resumo = this.buildResumo(dataset.rows, recurringMissing, Boolean(dataset.dueDateColumn));
        const fluxo = this.buildFluxoProjetado(dataset.rows, recurringMissing, dataset.filters, Boolean(dataset.dueDateColumn));
        const alertas = this.buildAlertas(dataset.rows, recurringMissing, resumo);
        const evolucaoMensal = this.buildEvolucaoMensal(dataset.rows);
        const contasEmAberto = dataset.rows.filter((row) => row.statusGerencial === "EM_ABERTO");
        const historicoPagamentos = dataset.rows.filter((row) => row.statusGerencial === "PAGO");
        return {
            filtrosAplicados: dataset.filters,
            vencimentoDetectado: dataset.dueDateColumn,
            resumo,
            recorrenciasAusentes: recurringMissing,
            fluxoProjetado: fluxo,
            alertas,
            evolucaoMensal,
            contasEmAberto,
            historicoPagamentos,
        };
    }
}
