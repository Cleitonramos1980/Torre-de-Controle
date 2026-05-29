import { reconaiStore } from "./reconaiStore.js";
import { db } from "../../repositories/dataStore.js";
const DATE_TOLERANCE_DAYS = 2;
const VALUE_TOLERANCE_PERCENT = 0.01;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;
const CONFRONTO_DATASET_CACHE_TTL_MS = 180_000;
const CONFRONTO_DATASET_WAIT_MS = 1_800;
const VALUE_DATE_CANDIDATE_LIMIT = 200;
const CONFRONTO_FILTER_KEYS = [
    "dataInicio",
    "dataFim",
    "filial",
    "operadora",
    "bandeira",
    "modalidade",
    "status",
    "criticidade",
    "responsavel",
    "nsu",
    "autorizacao",
    "vendaNumero",
    "cliente",
    "contextoDia",
    "contextoFilial",
    "drillOperadora",
    "drillBandeira",
];
function getConfrontoDatasetCacheKey(filters) {
    return JSON.stringify(CONFRONTO_FILTER_KEYS.map((key) => [key, filters[key] ?? ""]));
}
function getConfrontoRecordsCacheKey(direction, filters) {
    return `${direction}|${getConfrontoDatasetCacheKey(filters)}`;
}
function round2(value) {
    return Number(value.toFixed(2));
}
function toIsoDate(value) {
    if (!value)
        return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()))
        return null;
    return parsed.toISOString().slice(0, 10);
}
function normalizeToken(value) {
    if (!value)
        return null;
    const normalized = value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim();
    return normalized.length > 0 ? normalized : null;
}
function normalizeCodeToken(value) {
    const token = normalizeToken(value);
    if (!token)
        return null;
    const compact = token.replace(/[^0-9A-Z]/g, "");
    return compact.length > 0 ? compact : null;
}
function normalizeSaleNumber(value) {
    const token = normalizeToken(value);
    if (!token)
        return null;
    return token.replace(/\s+/g, "");
}
function cleanTextOrNull(value) {
    if (value == null)
        return null;
    const text = String(value).trim();
    if (!text || text === "-")
        return null;
    return text;
}
function includesNormalized(base, search) {
    if (!search || !search.trim())
        return true;
    const baseToken = normalizeToken(base) ?? "";
    const searchToken = normalizeToken(search) ?? "";
    return baseToken.includes(searchToken);
}
function matchesContextOrFilter(base, filter, context) {
    if (context && context.trim()) {
        return normalizeToken(base) === normalizeToken(context);
    }
    return includesNormalized(base, filter);
}
function toNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function pushMapArray(map, key, value) {
    if (!key)
        return;
    const list = map.get(key);
    if (list) {
        list.push(value);
        return;
    }
    map.set(key, [value]);
}
function coveragePercent(found, total) {
    if (total <= 0)
        return 0;
    return round2((found / total) * 100);
}
function dateDiffInDays(a, b) {
    const dateA = toIsoDate(a);
    const dateB = toIsoDate(b);
    if (!dateA || !dateB)
        return null;
    const parsedA = new Date(`${dateA}T00:00:00.000Z`);
    const parsedB = new Date(`${dateB}T00:00:00.000Z`);
    const diffMs = Math.abs(parsedA.getTime() - parsedB.getTime());
    return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}
function percentDiff(reference, compared) {
    const denominator = Math.abs(reference) > 0.0001 ? Math.abs(reference) : 1;
    return Math.abs(reference - compared) / denominator;
}
function getDateNeighborhood(dateIso) {
    const base = new Date(`${dateIso}T00:00:00.000Z`);
    const output = [];
    for (let offset = -DATE_TOLERANCE_DAYS; offset <= DATE_TOLERANCE_DAYS; offset += 1) {
        const cursor = new Date(base);
        cursor.setUTCDate(cursor.getUTCDate() + offset);
        output.push(cursor.toISOString().slice(0, 10));
    }
    return output;
}
function getSaleIdentifier(sale) {
    return sale.externalId || `${sale.nsu ?? ""}|${sale.authorization ?? ""}|${sale.dataVenda ?? ""}`;
}
function getRedeSaleFilial(sale) {
    if (sale.filial)
        return String(sale.filial).trim();
    const raw = sale.raw;
    const candidate = raw.filial ?? raw.branch ?? raw.branchCode ?? raw.estabelecimento ?? raw.storeCode;
    if (candidate == null)
        return null;
    const parsed = String(candidate).trim();
    return parsed.length > 0 ? parsed : null;
}
function getRedeSaleNumeroVenda(sale) {
    const raw = sale.raw;
    const candidate = sale.numped ??
        sale.numnota ??
        (typeof raw.numeroVenda === "string" ? raw.numeroVenda : null) ??
        (typeof raw.orderId === "string" ? raw.orderId : null) ??
        (typeof raw.order_id === "string" ? raw.order_id : null) ??
        sale.externalId;
    return candidate ? String(candidate).trim() : null;
}
function getRedeSaleOperadora(sale) {
    const raw = sale.raw;
    const candidate = raw.adquirente ??
        raw.acquirer ??
        raw.acquirerName ??
        raw.operadora ??
        raw.provider ??
        raw.processor;
    if (candidate == null)
        return null;
    const parsed = String(candidate).trim();
    return parsed.length > 0 ? parsed : null;
}
function getRedeSaleBandeira(sale) {
    const raw = sale.raw;
    const candidate = raw.bandeira ?? raw.brand ?? raw.cardBrand;
    if (candidate == null)
        return null;
    const parsed = String(candidate).trim();
    return parsed.length > 0 ? parsed : null;
}
function getRedeSaleModalidade(sale) {
    const raw = sale.raw;
    const candidate = raw.modalidade ?? raw.cardType ?? raw.productType ?? raw.paymentType;
    if (candidate == null)
        return null;
    const parsed = String(candidate).trim();
    return parsed.length > 0 ? parsed : null;
}
function getSaleNumberCandidatesFromRede(sale) {
    const raw = sale.raw;
    const values = [
        sale.externalId,
        sale.numped,
        sale.numnota,
        typeof raw.orderId === "string" ? raw.orderId : null,
        typeof raw.order_id === "string" ? raw.order_id : null,
        typeof raw.numeroVenda === "string" ? raw.numeroVenda : null,
        typeof raw.cupom === "string" ? raw.cupom : null,
    ];
    const unique = new Set();
    for (const value of values) {
        const normalized = normalizeSaleNumber(value);
        if (normalized)
            unique.add(normalized);
    }
    return Array.from(unique);
}
function getSaleNumberCandidatesFromSystem(row) {
    const values = [row.numeroVenda, row.pedido, row.cupom];
    const unique = new Set();
    for (const value of values) {
        const normalized = normalizeSaleNumber(value);
        if (normalized)
            unique.add(normalized);
    }
    return Array.from(unique);
}
function deriveStatusPedidoNormalizado(row) {
    if (row.statusVisual === "CANCELADO")
        return "CANCELADO";
    if (row.statusConciliacao === "NAO_RECEBIDO" && Math.abs(row.valorRecebido) <= 0.01)
        return "DIGITADO";
    if (row.statusConciliacao === "NAO_BAIXADO" || row.statusConciliacao === "RECEBIDO_NAO_BAIXADO")
        return "FATURADO";
    if (row.statusDivergencia === "EM_TRATAMENTO")
        return "PENDENTE";
    if (row.statusDivergencia === "ABERTA")
        return "FATURADO";
    return "FATURADO";
}
function getMatchConfidence(matchType) {
    switch (matchType) {
        case "NSU":
        case "AUTORIZACAO":
            return "ALTA";
        case "NUMERO_VENDA":
            return "MEDIA";
        case "VALOR_DATA":
            return "BAIXA";
        default:
            return "NENHUMA";
    }
}
function calculateMatchScore(row, sale, matchType) {
    if (!row || !sale || matchType === "SEM_MATCH")
        return 0;
    const nsuEqual = normalizeToken(row.nsu) != null &&
        normalizeToken(row.nsu) === normalizeToken(sale.nsu);
    const authEqual = normalizeToken(row.autorizacao) != null &&
        normalizeToken(row.autorizacao) === normalizeToken(sale.authorization);
    const valorVendaSistema = toNumber(row.valorVenda);
    const valorVendaRede = toNumber(sale.valorVenda);
    const valueNear = percentDiff(valorVendaSistema, valorVendaRede) <= VALUE_TOLERANCE_PERCENT;
    const dateNear = (dateDiffInDays(row.dataVenda, sale.dataVenda) ?? 99) <= DATE_TOLERANCE_DAYS;
    const numeroMatch = getSaleNumberCandidatesFromSystem(row).some((candidate) => getSaleNumberCandidatesFromRede(sale).includes(candidate));
    let score = 0;
    if (nsuEqual)
        score += 40;
    if (authEqual)
        score += 25;
    if (valueNear)
        score += 15;
    if (dateNear)
        score += 10;
    if (numeroMatch)
        score += 10;
    return Math.max(0, Math.min(100, score));
}
function calculateMatchMetrics(row, sale) {
    const valueDiffPct = percentDiff(toNumber(row.valorVenda), toNumber(sale.valorVenda));
    const dateDiffDays = dateDiffInDays(row.dataVenda, sale.dataVenda);
    const filialDivergente = normalizeToken(row.filialCodigo) != null &&
        normalizeToken(getRedeSaleFilial(sale)) != null &&
        normalizeToken(row.filialCodigo) !== normalizeToken(getRedeSaleFilial(sale));
    return {
        valueDiffPct,
        dateDiffDays,
        filialDivergente,
        valorDivergente: valueDiffPct > VALUE_TOLERANCE_PERCENT,
        dataDivergente: (dateDiffDays ?? 99) > DATE_TOLERANCE_DAYS,
    };
}
function rankSaleCandidates(row, sales, matchType) {
    if (sales.length === 0)
        return null;
    const scored = sales.map((sale) => {
        const metrics = calculateMatchMetrics(row, sale);
        const score = calculateMatchScore(row, sale, matchType);
        return { sale, score, metrics };
    });
    scored.sort((a, b) => {
        if (b.score !== a.score)
            return b.score - a.score;
        if (a.metrics.valueDiffPct !== b.metrics.valueDiffPct)
            return a.metrics.valueDiffPct - b.metrics.valueDiffPct;
        return (a.metrics.dateDiffDays ?? 99) - (b.metrics.dateDiffDays ?? 99);
    });
    return scored[0]?.sale ?? null;
}
function rankSystemCandidates(sale, rows, matchType) {
    if (rows.length === 0)
        return null;
    const scored = rows.map((row) => {
        const metrics = calculateMatchMetrics(row, sale);
        const score = calculateMatchScore(row, sale, matchType);
        return { row, score, metrics };
    });
    scored.sort((a, b) => {
        if (b.score !== a.score)
            return b.score - a.score;
        if (a.metrics.valueDiffPct !== b.metrics.valueDiffPct)
            return a.metrics.valueDiffPct - b.metrics.valueDiffPct;
        return (a.metrics.dateDiffDays ?? 99) - (b.metrics.dateDiffDays ?? 99);
    });
    return scored[0]?.row ?? null;
}
function createRedeIndex(sales) {
    const index = {
        byNsu: new Map(),
        byAuthorization: new Map(),
        byNumeroVenda: new Map(),
        byDate: new Map(),
        byDateFilial: new Map(),
    };
    for (const sale of sales) {
        pushMapArray(index.byNsu, normalizeCodeToken(sale.nsu), sale);
        pushMapArray(index.byAuthorization, normalizeCodeToken(sale.authorization), sale);
        for (const candidate of getSaleNumberCandidatesFromRede(sale)) {
            pushMapArray(index.byNumeroVenda, candidate, sale);
        }
        const dateKey = toIsoDate(sale.dataVenda);
        pushMapArray(index.byDate, dateKey, sale);
        const filialKey = normalizeToken(getRedeSaleFilial(sale));
        if (dateKey && filialKey) {
            pushMapArray(index.byDateFilial, `${dateKey}|${filialKey}`, sale);
        }
    }
    return index;
}
function createSystemIndex(rows) {
    const index = {
        byNsu: new Map(),
        byAuthorization: new Map(),
        byNumeroVenda: new Map(),
        byDate: new Map(),
        byDateFilial: new Map(),
    };
    for (const row of rows) {
        pushMapArray(index.byNsu, normalizeCodeToken(row.nsu), row);
        pushMapArray(index.byAuthorization, normalizeCodeToken(row.autorizacao), row);
        for (const candidate of getSaleNumberCandidatesFromSystem(row)) {
            pushMapArray(index.byNumeroVenda, candidate, row);
        }
        const dateKey = toIsoDate(row.dataVenda);
        pushMapArray(index.byDate, dateKey, row);
        const filialKey = normalizeToken(row.filialCodigo);
        if (dateKey && filialKey) {
            pushMapArray(index.byDateFilial, `${dateKey}|${filialKey}`, row);
        }
    }
    return index;
}
function limitValueDateCandidates(candidates, referenceValue, getCandidateValue) {
    if (candidates.length <= VALUE_DATE_CANDIDATE_LIMIT)
        return candidates;
    return candidates
        .slice()
        .sort((a, b) => Math.abs(toNumber(getCandidateValue(a)) - referenceValue) - Math.abs(toNumber(getCandidateValue(b)) - referenceValue))
        .slice(0, VALUE_DATE_CANDIDATE_LIMIT);
}
function parseDateOrNull(input) {
    if (!input || !input.trim())
        return null;
    return toIsoDate(input.trim());
}
function applyRedeSaleFilters(sales, filters) {
    const dataInicio = parseDateOrNull(filters.dataInicio);
    const dataFim = parseDateOrNull(filters.dataFim);
    return sales.filter((sale) => {
        const dataVenda = toIsoDate(sale.dataVenda);
        if (dataInicio && dataVenda && dataVenda < dataInicio)
            return false;
        if (dataFim && dataVenda && dataVenda > dataFim)
            return false;
        if (filters.contextoDia && !includesNormalized(dataVenda, filters.contextoDia))
            return false;
        if (!matchesContextOrFilter(getRedeSaleFilial(sale), filters.filial, filters.contextoFilial))
            return false;
        if (!includesNormalized(getRedeSaleOperadora(sale), filters.operadora || filters.drillOperadora))
            return false;
        if (!includesNormalized(getRedeSaleBandeira(sale), filters.bandeira || filters.drillBandeira))
            return false;
        if (!includesNormalized(getRedeSaleModalidade(sale), filters.modalidade))
            return false;
        if (!includesNormalized(sale.nsu, filters.nsu))
            return false;
        if (!includesNormalized(sale.authorization, filters.autorizacao))
            return false;
        if (!includesNormalized(getRedeSaleNumeroVenda(sale), filters.vendaNumero))
            return false;
        return true;
    });
}
function getLatestValidationItemsForPeriod(periodoRede) {
    const items = Array.isArray(db.redeSalesValidationItems) ? db.redeSalesValidationItems : [];
    const periodItems = items.filter((item) => {
        const date = toIsoDate(item?.rede_sale_date);
        if (!date)
            return false;
        return date >= periodoRede.dataInicio && date <= periodoRede.dataFim;
    });
    if (periodItems.length === 0)
        return [];
    const batches = Array.isArray(db.redeSalesValidationBatches) ? db.redeSalesValidationBatches : [];
    const itemBatchIds = new Set(periodItems.map((item) => String(item?.batch_id ?? "")).filter((batchId) => batchId.length > 0));
    const latestBatch = batches
        .filter((batch) => itemBatchIds.has(String(batch.id)))
        .sort((a, b) => String(b.updated_at ?? b.created_at ?? "").localeCompare(String(a.updated_at ?? a.created_at ?? "")))[0];
    if (!latestBatch)
        return periodItems;
    return periodItems.filter((item) => String(item?.batch_id ?? "") === String(latestBatch.id));
}
function getLatestValidationUnmatchedForPeriod(periodoRede) {
    const rows = Array.isArray(db.redeSalesValidationWinthorUnmatched) ? db.redeSalesValidationWinthorUnmatched : [];
    const periodRows = rows.filter((row) => {
        const date = toIsoDate(row?.data);
        if (!date)
            return false;
        return date >= periodoRede.dataInicio && date <= periodoRede.dataFim;
    });
    if (periodRows.length === 0)
        return [];
    const batches = Array.isArray(db.redeSalesValidationBatches) ? db.redeSalesValidationBatches : [];
    const rowBatchIds = new Set(periodRows.map((row) => String(row?.batch_id ?? "")).filter((batchId) => batchId.length > 0));
    const latestBatch = batches
        .filter((batch) => rowBatchIds.has(String(batch.id)))
        .sort((a, b) => String(b.updated_at ?? b.created_at ?? "").localeCompare(String(a.updated_at ?? a.created_at ?? "")))[0];
    if (!latestBatch)
        return periodRows;
    return periodRows.filter((row) => String(row?.batch_id ?? "") === String(latestBatch.id));
}
function loadSalesFromValidationItems(periodoRede, filters) {
    const items = getLatestValidationItemsForPeriod(periodoRede);
    const mapped = items.map((item, index) => {
        const nsu = cleanTextOrNull(item?.rede_nsu);
        const authorization = cleanTextOrNull(item?.rede_authorization);
        const document = cleanTextOrNull(item?.rede_document);
        const rawRede = item?.rede_raw_json && typeof item.rede_raw_json === "object"
            ? item.rede_raw_json
            : {};
        const externalId = document ??
            cleanTextOrNull(item?.winthor_numped) ??
            cleanTextOrNull(item?.winthor_numnota) ??
            nsu ??
            authorization ??
            cleanTextOrNull(item?.id) ??
            `VALIDACAO-${index + 1}`;
        const filial = cleanTextOrNull(item?.winthor_codfilial) ??
            cleanTextOrNull(item?.pcfilial_codigo) ??
            cleanTextOrNull(item?.branch_cnpj_normalized) ??
            cleanTextOrNull(item?.branch_cnpj_raw);
        return {
            externalId: String(externalId),
            nsu,
            authorization,
            valorVenda: toNumber(item?.rede_amount),
            dataVenda: toIsoDate(item?.rede_sale_date),
            filial: filial == null ? null : String(filial),
            raw: {
                ...rawRede,
                source: "VALIDACAO_PLANILHA",
                rowNumber: item?.row_number ?? null,
                winthorNumped: item?.winthor_numped ?? null,
                winthorNumnota: item?.winthor_numnota ?? null,
            },
        };
    });
    return applyRedeSaleFilters(mapped, filters);
}
function resolveDateRange(systemRows, filters) {
    const dataInicioFiltro = parseDateOrNull(filters.dataInicio);
    const dataFimFiltro = parseDateOrNull(filters.dataFim);
    if (dataInicioFiltro && dataFimFiltro) {
        return { dataInicio: dataInicioFiltro, dataFim: dataFimFiltro };
    }
    const dates = systemRows
        .map((row) => toIsoDate(row.dataVenda))
        .filter((value) => Boolean(value))
        .sort((a, b) => a.localeCompare(b));
    if (dates.length > 0) {
        return {
            dataInicio: dataInicioFiltro ?? dates[0],
            dataFim: dataFimFiltro ?? dates[dates.length - 1],
        };
    }
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return {
        dataInicio: dataInicioFiltro ?? weekAgo,
        dataFim: dataFimFiltro ?? today,
    };
}
function paginate(rows, pagination) {
    const pageSize = Math.max(1, Math.min(pagination.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE));
    const page = Math.max(1, pagination.page ?? 1);
    const totalItems = rows.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    return {
        registros: rows.slice(start, start + pageSize),
        paginacao: {
            page: safePage,
            pageSize,
            totalPages,
            totalItems,
        },
    };
}
export class RedeWinthorConfrontoService {
    logger;
    analyticsService;
    redeService;
    winthorCardService;
    datasetCache = new Map();
    datasetLoads = new Map();
    recordsCache = new Map();
    constructor(logger, analyticsService, redeService, winthorCardService) {
        this.logger = logger;
        this.analyticsService = analyticsService;
        this.redeService = redeService;
        this.winthorCardService = winthorCardService;
    }
    resolveSystemRange(filters) {
        const dataInicio = parseDateOrNull(filters.dataInicio);
        const dataFim = parseDateOrNull(filters.dataFim);
        if (dataInicio && dataFim) {
            return { dataInicio, dataFim };
        }
        // Sem filtro explicito, mantemos uma janela maior para trazer vendas WinThor
        // mesmo quando o snapshot REDE estiver vazio.
        const end = new Date();
        const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
        return {
            dataInicio: dataInicio ?? start.toISOString().slice(0, 10),
            dataFim: dataFim ?? end.toISOString().slice(0, 10),
        };
    }
    mapWinthorRowsToSystemRows(rows) {
        const output = [];
        for (const row of rows) {
            const filialCodigo = String(row.codfilial ?? "SEM_FILIAL").trim() || "SEM_FILIAL";
            const pedido = row.numped == null ? null : String(row.numped).trim();
            const numeroVenda = pedido || `VENDA-${filialCodigo}`;
            const dataVenda = toIsoDate(row.dataVenda ?? undefined) ?? new Date().toISOString().slice(0, 10);
            const valorVenda = round2(toNumber(row.valorPedido) > 0 ? toNumber(row.valorPedido) : toNumber(row.valorItens));
            const codAutorizacao = row.codAutorizacao == null ? null : String(row.codAutorizacao).trim();
            const descricaoCobranca = row.descricaoCobranca?.trim() || "CARTAO";
            const id = [
                "WINTHOR",
                filialCodigo,
                pedido ?? "SEM_PEDIDO",
                row.codcob ?? "SEM_CODCOB",
                dataVenda,
            ].join("-");
            output.push({
                id,
                filialCodigo,
                filialNome: row.nomeFilial?.trim() || `Filial ${filialCodigo}`,
                dataVenda,
                dataPrevistaRecebimento: null,
                dataRecebimento: null,
                numeroVenda,
                pedido,
                cupom: null,
                nsu: row.nsu?.trim() || null,
                autorizacao: codAutorizacao,
                operadora: "WINTHOR",
                bandeira: "N/D",
                modalidade: descricaoCobranca,
                cliente: row.codcli == null ? null : String(row.codcli),
                valorVenda,
                valorEsperado: valorVenda,
                valorRecebido: 0,
                valorDivergencia: round2(-valorVenda),
                valorEmAberto: valorVenda,
                valorLiquidoPrevisto: valorVenda,
                taxaDesconto: null,
                statusConciliacao: "NAO_BAIXADO",
                statusDivergencia: "ABERTA",
                statusVisual: "PENDENTE",
                criticidade: valorVenda >= 10000 ? "CRITICA" : valorVenda >= 5000 ? "ALTA" : valorVenda >= 1000 ? "MEDIA" : "BAIXA",
                responsavel: "",
                motivoDivergencia: "Venda faturada no WinThor aguardando confrontacao com a REDE.",
                isDivergencia: true,
                historico: [
                    {
                        data: dataVenda,
                        evento: "Venda faturada carregada do WinThor",
                        origem: "WINTHOR",
                    },
                ],
            });
        }
        return output;
    }
    applySystemFilters(rows, filters) {
        const dataInicio = parseDateOrNull(filters.dataInicio);
        const dataFim = parseDateOrNull(filters.dataFim);
        const statusFilter = normalizeToken(filters.status);
        const criticidadeFilter = normalizeToken(filters.criticidade);
        return rows.filter((row) => {
            if (dataInicio && row.dataVenda < dataInicio)
                return false;
            if (dataFim && row.dataVenda > dataFim)
                return false;
            if (!matchesContextOrFilter(row.filialCodigo, filters.filial, filters.contextoFilial))
                return false;
            if (!includesNormalized(row.operadora, filters.operadora || filters.drillOperadora))
                return false;
            if (!includesNormalized(row.bandeira, filters.bandeira || filters.drillBandeira))
                return false;
            if (!includesNormalized(row.modalidade, filters.modalidade))
                return false;
            if (!includesNormalized(row.nsu, filters.nsu))
                return false;
            if (!includesNormalized(row.autorizacao, filters.autorizacao))
                return false;
            if (!includesNormalized(`${row.numeroVenda} ${row.pedido ?? ""} ${row.cupom ?? ""}`, filters.vendaNumero))
                return false;
            if (!includesNormalized(row.cliente, filters.cliente))
                return false;
            if (!includesNormalized(row.responsavel, filters.responsavel))
                return false;
            if (!includesNormalized(row.dataVenda, filters.contextoDia))
                return false;
            if (statusFilter &&
                statusFilter !== "ALL" &&
                statusFilter !== "TODOS" &&
                ![normalizeToken(row.statusConciliacao), normalizeToken(row.statusDivergencia), normalizeToken(row.statusVisual)].includes(statusFilter)) {
                return false;
            }
            if (criticidadeFilter &&
                criticidadeFilter !== "ALL" &&
                criticidadeFilter !== "TODOS" &&
                normalizeToken(row.criticidade) !== criticidadeFilter) {
                return false;
            }
            return true;
        });
    }
    createDataset(periodoRede, origemRede, redeSales, systemRows) {
        return {
            executadoEm: new Date().toISOString(),
            periodoRede,
            origemRede,
            redeSales,
            systemRows,
            redeIndex: createRedeIndex(redeSales),
            systemIndex: createSystemIndex(systemRows),
        };
    }
    buildLocalDataset(filters, origemRede = "CACHE_LOCAL") {
        const analyticsRows = this.analyticsService.listTransacoesParaValidacao(filters);
        const cachedSystemRows = Array.isArray(db.reconaiWinthorRows)
            ? this.applySystemFilters(db.reconaiWinthorRows, filters)
            : [];
        let systemRows = cachedSystemRows.length > 0 ? cachedSystemRows : analyticsRows;
        let periodoRede = resolveDateRange(systemRows, filters);
        if (systemRows.length === 0) {
            const validationSystemRows = this.loadSystemRowsFromValidationUnmatched(periodoRede, filters);
            if (validationSystemRows.length > 0) {
                systemRows = validationSystemRows;
                periodoRede = resolveDateRange(systemRows, filters);
            }
        }
        const validationSales = loadSalesFromValidationItems(periodoRede, filters);
        if (validationSales.length > 0) {
            return this.createDataset(periodoRede, "VALIDACAO_PLANILHA", validationSales, systemRows);
        }
        const snapshotSales = reconaiStore
            .getSnapshot()
            .sales.filter((sale) => {
            const date = toIsoDate(sale.dataVenda);
            if (!date)
                return false;
            return date >= periodoRede.dataInicio && date <= periodoRede.dataFim;
        });
        const redeSales = applyRedeSaleFilters(snapshotSales, filters);
        return this.createDataset(periodoRede, origemRede, redeSales, systemRows);
    }
    loadSystemRowsFromValidationUnmatched(periodoRede, filters) {
        const rows = getLatestValidationUnmatchedForPeriod(periodoRede).map((row, index) => {
            const raw = row?.raw_json && typeof row.raw_json === "object" ? row.raw_json : {};
            const filialCodigo = cleanTextOrNull(row?.codfilial) ?? "SEM_FILIAL";
            const pedido = cleanTextOrNull(row?.numped);
            const dataVenda = toIsoDate(row?.data) ?? periodoRede.dataInicio;
            const valorVenda = round2(toNumber(row?.vltotal));
            const codAutorizacao = cleanTextOrNull(row?.codAutorizacao) ?? cleanTextOrNull(raw.CODAUTORIZACAO);
            const codcob = cleanTextOrNull(row?.codcob) ?? cleanTextOrNull(raw.CODCOB) ?? "CARTAO";
            const id = [
                "WINTHOR-VALIDACAO",
                filialCodigo,
                pedido ?? `SEM_PEDIDO_${index + 1}`,
                dataVenda,
            ].join("-");
            return {
                id,
                filialCodigo,
                filialNome: `Filial ${filialCodigo}`,
                dataVenda,
                dataPrevistaRecebimento: null,
                dataRecebimento: null,
                numeroVenda: pedido ?? id,
                pedido,
                cupom: null,
                nsu: cleanTextOrNull(row?.nsu),
                autorizacao: codAutorizacao,
                operadora: "WINTHOR",
                bandeira: "N/D",
                modalidade: codcob,
                cliente: cleanTextOrNull(row?.codcli),
                valorVenda,
                valorEsperado: valorVenda,
                valorRecebido: 0,
                valorDivergencia: round2(-valorVenda),
                valorEmAberto: valorVenda,
                valorLiquidoPrevisto: valorVenda,
                taxaDesconto: null,
                statusConciliacao: "NAO_BAIXADO",
                statusDivergencia: "ABERTA",
                statusVisual: "PENDENTE",
                criticidade: valorVenda >= 10000 ? "CRITICA" : valorVenda >= 5000 ? "ALTA" : valorVenda >= 1000 ? "MEDIA" : "BAIXA",
                responsavel: "",
                motivoDivergencia: cleanTextOrNull(row?.reason) ?? "Venda do Sistema nao encontrada na planilha REDE.",
                isDivergencia: true,
                historico: [
                    {
                        data: dataVenda,
                        evento: "Venda faturada carregada da validacao reversa",
                        origem: "VALIDACAO_PLANILHA",
                    },
                ],
            };
        });
        return this.applySystemFilters(rows, filters);
    }
    async loadSystemRows(filters) {
        const analyticsRows = this.analyticsService.listTransacoesParaValidacao(filters);
        const range = this.resolveSystemRange(filters);
        try {
            const winthorResult = await this.winthorCardService.getVendasFaturadasCartao(range.dataInicio, range.dataFim, false);
            const winthorRows = Array.isArray(winthorResult.rows)
                ? this.mapWinthorRowsToSystemRows(winthorResult.rows)
                : [];
            const filtered = this.applySystemFilters(winthorRows, filters);
            if (filtered.length > 0) {
                return filtered;
            }
            const validationRows = this.loadSystemRowsFromValidationUnmatched(range, filters);
            if (validationRows.length > 0) {
                return validationRows;
            }
            this.logger.warn({
                component: "RedeWinthorConfrontoService",
                action: "loadSystemRows",
                range,
                totalWinthorRows: winthorRows.length,
            }, "WinThor retornou zero linhas apos filtros; fallback para base analitica atual.");
        }
        catch (error) {
            this.logger.warn({
                component: "RedeWinthorConfrontoService",
                action: "loadSystemRows",
                range,
                error,
            }, "Falha ao consultar vendas faturadas do WinThor; fallback para base analitica atual.");
        }
        const validationRows = this.loadSystemRowsFromValidationUnmatched(range, filters);
        if (validationRows.length > 0) {
            return validationRows;
        }
        return analyticsRows;
    }
    async loadDatasetFresh(filters) {
        const systemRows = await this.loadSystemRows(filters);
        const periodoRede = resolveDateRange(systemRows, filters);
        try {
            const redeFromApi = await this.redeService.getSales(periodoRede.dataInicio, periodoRede.dataFim);
            const redeSales = applyRedeSaleFilters(redeFromApi, filters);
            if (redeSales.length > 0) {
                return this.createDataset(periodoRede, "API", redeSales, systemRows);
            }
            const validationSales = loadSalesFromValidationItems(periodoRede, filters);
            if (validationSales.length > 0) {
                this.logger.warn({
                    component: "RedeWinthorConfrontoService",
                    action: "loadDataset",
                    periodoRede,
                    fallbackRows: validationSales.length,
                }, "API REDE sem vendas no periodo. Utilizando vendas importadas pela validacao da planilha.");
                return this.createDataset(periodoRede, "VALIDACAO_PLANILHA", validationSales, systemRows);
            }
            return this.createDataset(periodoRede, "API", redeSales, systemRows);
        }
        catch (error) {
            const validationSales = loadSalesFromValidationItems(periodoRede, filters);
            if (validationSales.length > 0) {
                this.logger.warn({
                    component: "RedeWinthorConfrontoService",
                    action: "loadDataset",
                    error,
                    periodoRede,
                    fallbackRows: validationSales.length,
                }, "Falha na API REDE. Utilizando vendas importadas pela validacao da planilha.");
                return this.createDataset(periodoRede, "VALIDACAO_PLANILHA", validationSales, systemRows);
            }
            const snapshotSales = reconaiStore
                .getSnapshot()
                .sales.filter((sale) => {
                const date = toIsoDate(sale.dataVenda);
                if (!date)
                    return false;
                return date >= periodoRede.dataInicio && date <= periodoRede.dataFim;
            });
            const redeSales = applyRedeSaleFilters(snapshotSales, filters);
            this.logger.warn({
                component: "RedeWinthorConfrontoService",
                action: "loadDataset",
                error,
                periodoRede,
                fallbackRows: redeSales.length,
            }, "Falha ao consultar REDE em tempo real. Utilizando snapshot sincronizado.");
            return this.createDataset(periodoRede, "SNAPSHOT", redeSales, systemRows);
        }
    }
    async waitDatasetLoad(key, filters, loadPromise) {
        let timeoutId = null;
        try {
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error("CONFRONTO_DATASET_TIMEOUT")), CONFRONTO_DATASET_WAIT_MS);
            });
            return await Promise.race([loadPromise, timeoutPromise]);
        }
        catch (error) {
            const cached = this.datasetCache.get(key);
            if (cached) {
                this.logger.warn({
                    component: "RedeWinthorConfrontoService",
                    action: "loadDataset",
                    key,
                    ageMs: Date.now() - cached.loadedAtMs,
                    error,
                }, "Carga do confronto ainda em andamento; retornando dataset em cache.");
                return cached.dataset;
            }
            this.logger.warn({
                component: "RedeWinthorConfrontoService",
                action: "loadDataset",
                key,
                error,
            }, "Carga do confronto ainda em andamento; retornando base local temporaria.");
            return this.buildLocalDataset(filters, "CACHE_EM_CARGA");
        }
        finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        }
    }
    async loadDataset(filters) {
        const key = getConfrontoDatasetCacheKey(filters);
        const cached = this.datasetCache.get(key);
        if (cached && Date.now() - cached.loadedAtMs < CONFRONTO_DATASET_CACHE_TTL_MS) {
            return cached.dataset;
        }
        let loadPromise = this.datasetLoads.get(key);
        if (!loadPromise) {
            loadPromise = this.loadDatasetFresh(filters)
                .then((dataset) => {
                this.datasetCache.set(key, {
                    loadedAtMs: Date.now(),
                    dataset,
                });
                return dataset;
            })
                .catch((error) => {
                const fallbackDataset = this.buildLocalDataset(filters, "CACHE_LOCAL");
                this.datasetCache.set(key, {
                    loadedAtMs: Date.now(),
                    dataset: fallbackDataset,
                });
                this.logger.warn({
                    component: "RedeWinthorConfrontoService",
                    action: "loadDataset",
                    key,
                    error,
                }, "Falha ao atualizar dataset do confronto; retornando fallback local.");
                return fallbackDataset;
            })
                .finally(() => {
                if (this.datasetLoads.get(key) === loadPromise) {
                    this.datasetLoads.delete(key);
                }
            });
            this.datasetLoads.set(key, loadPromise);
        }
        return this.waitDatasetLoad(key, filters, loadPromise);
    }
    getCachedRecords(direction, filters) {
        const key = getConfrontoRecordsCacheKey(direction, filters);
        const cached = this.recordsCache.get(key);
        if (cached && Date.now() - cached.loadedAtMs < CONFRONTO_DATASET_CACHE_TTL_MS) {
            return cached.context;
        }
        return null;
    }
    async getRecordsContext(direction, filters, builder) {
        const cached = this.getCachedRecords(direction, filters);
        if (cached)
            return cached;
        const dataset = await this.loadDataset(filters);
        const cachedAfterDataset = this.getCachedRecords(direction, filters);
        if (cachedAfterDataset)
            return cachedAfterDataset;
        const context = {
            dataset,
            records: builder(dataset),
        };
        this.recordsCache.set(getConfrontoRecordsCacheKey(direction, filters), {
            loadedAtMs: Date.now(),
            context,
        });
        return context;
    }
    async getRedeToWinthorContext(filters) {
        return this.getRecordsContext("REDE_TO_WINTHOR", filters, (dataset) => this.buildRedeToWinthorRecords(dataset));
    }
    async getWinthorToRedeContext(filters) {
        return this.getRecordsContext("WINTHOR_TO_REDE", filters, (dataset) => this.buildWinthorToRedeRecords(dataset));
    }
    clearDatasetCache() {
        this.datasetCache.clear();
        this.datasetLoads.clear();
        this.recordsCache.clear();
    }
    findSaleForSystemRow(row, index) {
        const nsu = normalizeCodeToken(row.nsu);
        if (nsu) {
            const candidates = index.byNsu.get(nsu) ?? [];
            if (candidates.length > 0) {
                const best = rankSaleCandidates(row, candidates, "NSU");
                if (best) {
                    const metrics = calculateMatchMetrics(row, best);
                    return {
                        item: best,
                        matchType: "NSU",
                        confidence: getMatchConfidence("NSU"),
                        scoreMatch: calculateMatchScore(row, best, "NSU"),
                        metrics,
                        candidateCount: candidates.length,
                    };
                }
            }
        }
        const authorization = normalizeCodeToken(row.autorizacao);
        if (authorization) {
            const candidates = index.byAuthorization.get(authorization) ?? [];
            if (candidates.length > 0) {
                const best = rankSaleCandidates(row, candidates, "AUTORIZACAO");
                if (best) {
                    const metrics = calculateMatchMetrics(row, best);
                    return {
                        item: best,
                        matchType: "AUTORIZACAO",
                        confidence: getMatchConfidence("AUTORIZACAO"),
                        scoreMatch: calculateMatchScore(row, best, "AUTORIZACAO"),
                        metrics,
                        candidateCount: candidates.length,
                    };
                }
            }
        }
        for (const candidate of getSaleNumberCandidatesFromSystem(row)) {
            const candidates = index.byNumeroVenda.get(candidate) ?? [];
            if (candidates.length > 0) {
                const best = rankSaleCandidates(row, candidates, "NUMERO_VENDA");
                if (best) {
                    const metrics = calculateMatchMetrics(row, best);
                    return {
                        item: best,
                        matchType: "NUMERO_VENDA",
                        confidence: getMatchConfidence("NUMERO_VENDA"),
                        scoreMatch: calculateMatchScore(row, best, "NUMERO_VENDA"),
                        metrics,
                        candidateCount: candidates.length,
                    };
                }
            }
        }
        const rowDate = toIsoDate(row.dataVenda);
        if (rowDate) {
            const filialKey = normalizeToken(row.filialCodigo);
            const dateCandidatesBase = getDateNeighborhood(rowDate)
                .flatMap((dateKey) => filialKey
                ? index.byDateFilial.get(`${dateKey}|${filialKey}`) ?? []
                : index.byDate.get(dateKey) ?? []);
            const dateCandidates = limitValueDateCandidates(dateCandidatesBase
                .filter((sale) => {
                const metrics = calculateMatchMetrics(row, sale);
                return !metrics.filialDivergente && !metrics.valorDivergente;
            }), toNumber(row.valorVenda), (sale) => sale.valorVenda);
            if (dateCandidates.length > 0) {
                const best = rankSaleCandidates(row, dateCandidates, "VALOR_DATA");
                if (best) {
                    const metrics = calculateMatchMetrics(row, best);
                    return {
                        item: best,
                        matchType: "VALOR_DATA",
                        confidence: getMatchConfidence("VALOR_DATA"),
                        scoreMatch: calculateMatchScore(row, best, "VALOR_DATA"),
                        metrics,
                        candidateCount: dateCandidates.length,
                    };
                }
            }
        }
        return null;
    }
    findSystemRowForSale(sale, index) {
        const nsu = normalizeCodeToken(sale.nsu);
        if (nsu) {
            const candidates = index.byNsu.get(nsu) ?? [];
            if (candidates.length > 0) {
                const best = rankSystemCandidates(sale, candidates, "NSU");
                if (best) {
                    const metrics = calculateMatchMetrics(best, sale);
                    return {
                        item: best,
                        matchType: "NSU",
                        confidence: getMatchConfidence("NSU"),
                        scoreMatch: calculateMatchScore(best, sale, "NSU"),
                        metrics,
                        candidateCount: candidates.length,
                    };
                }
            }
        }
        const authorization = normalizeCodeToken(sale.authorization);
        if (authorization) {
            const candidates = index.byAuthorization.get(authorization) ?? [];
            if (candidates.length > 0) {
                const best = rankSystemCandidates(sale, candidates, "AUTORIZACAO");
                if (best) {
                    const metrics = calculateMatchMetrics(best, sale);
                    return {
                        item: best,
                        matchType: "AUTORIZACAO",
                        confidence: getMatchConfidence("AUTORIZACAO"),
                        scoreMatch: calculateMatchScore(best, sale, "AUTORIZACAO"),
                        metrics,
                        candidateCount: candidates.length,
                    };
                }
            }
        }
        for (const candidate of getSaleNumberCandidatesFromRede(sale)) {
            const candidates = index.byNumeroVenda.get(candidate) ?? [];
            if (candidates.length > 0) {
                const best = rankSystemCandidates(sale, candidates, "NUMERO_VENDA");
                if (best) {
                    const metrics = calculateMatchMetrics(best, sale);
                    return {
                        item: best,
                        matchType: "NUMERO_VENDA",
                        confidence: getMatchConfidence("NUMERO_VENDA"),
                        scoreMatch: calculateMatchScore(best, sale, "NUMERO_VENDA"),
                        metrics,
                        candidateCount: candidates.length,
                    };
                }
            }
        }
        const saleDate = toIsoDate(sale.dataVenda);
        if (saleDate) {
            const filialKey = normalizeToken(getRedeSaleFilial(sale));
            const dateCandidatesBase = getDateNeighborhood(saleDate)
                .flatMap((dateKey) => filialKey
                ? index.byDateFilial.get(`${dateKey}|${filialKey}`) ?? []
                : index.byDate.get(dateKey) ?? []);
            const dateCandidates = limitValueDateCandidates(dateCandidatesBase
                .filter((row) => {
                const metrics = calculateMatchMetrics(row, sale);
                return !metrics.filialDivergente && !metrics.valorDivergente;
            }), toNumber(sale.valorVenda), (row) => row.valorVenda);
            if (dateCandidates.length > 0) {
                const best = rankSystemCandidates(sale, dateCandidates, "VALOR_DATA");
                if (best) {
                    const metrics = calculateMatchMetrics(best, sale);
                    return {
                        item: best,
                        matchType: "VALOR_DATA",
                        confidence: getMatchConfidence("VALOR_DATA"),
                        scoreMatch: calculateMatchScore(best, sale, "VALOR_DATA"),
                        metrics,
                        candidateCount: dateCandidates.length,
                    };
                }
            }
        }
        return null;
    }
    buildWinthorToRedeRecords(dataset) {
        const base = dataset.systemRows.map((row) => {
            const match = this.findSaleForSystemRow(row, dataset.redeIndex);
            return {
                row,
                match,
            };
        });
        const saleUsage = new Map();
        for (const item of base) {
            if (!item.match)
                continue;
            const saleId = getSaleIdentifier(item.match.item);
            saleUsage.set(saleId, (saleUsage.get(saleId) ?? 0) + 1);
        }
        return base.map(({ row, match }) => {
            const statusPedido = deriveStatusPedidoNormalizado(row);
            if (!match) {
                return {
                    transacaoIdWinthor: row.id,
                    numpedWinthor: row.pedido ?? row.numeroVenda,
                    dataVendaWinthor: row.dataVenda,
                    filialWinthor: row.filialCodigo,
                    statusPedidoWinthor: statusPedido,
                    nsu: row.nsu,
                    autorizacao: row.autorizacao,
                    operadora: row.operadora,
                    bandeira: row.bandeira,
                    modalidade: row.modalidade,
                    valorWinthor: row.valorVenda,
                    idVendaRede: null,
                    dataVendaRede: null,
                    filialRede: null,
                    valorRede: null,
                    diferencaValor: null,
                    statusWinthorParaRede: statusPedido === "FATURADO"
                        ? "WINTHOR_PEDIDO_FATURADO_NAO_CONFIRMADO_NA_REDE"
                        : "WINTHOR_PEDIDO_DIGITADO_NAO_CONFIRMADO_NA_REDE",
                    matchType: "SEM_MATCH",
                    confidence: "NENHUMA",
                    scoreMatch: 0,
                };
            }
            const sale = match.item;
            const saleId = getSaleIdentifier(sale);
            const duplicatedMatch = (saleUsage.get(saleId) ?? 0) > 1 || match.candidateCount > 1;
            const diferencaValor = round2(toNumber(row.valorVenda) - toNumber(sale.valorVenda));
            const status = duplicatedMatch
                ? "WINTHOR_COM_MATCH_AMBIGUO"
                : match.metrics.filialDivergente
                    ? "WINTHOR_COM_DIVERGENCIA_FILIAL"
                    : match.metrics.dataDivergente
                        ? "WINTHOR_COM_DIVERGENCIA_DATA"
                        : match.metrics.valorDivergente
                            ? "WINTHOR_COM_DIVERGENCIA_VALOR"
                            : "WINTHOR_CONFIRMADO_NA_REDE";
            return {
                transacaoIdWinthor: row.id,
                numpedWinthor: row.pedido ?? row.numeroVenda,
                dataVendaWinthor: row.dataVenda,
                filialWinthor: row.filialCodigo,
                statusPedidoWinthor: statusPedido,
                nsu: row.nsu,
                autorizacao: row.autorizacao,
                operadora: row.operadora,
                bandeira: row.bandeira,
                modalidade: row.modalidade,
                valorWinthor: row.valorVenda,
                idVendaRede: saleId,
                dataVendaRede: toIsoDate(sale.dataVenda),
                filialRede: getRedeSaleFilial(sale),
                valorRede: toNumber(sale.valorVenda),
                diferencaValor,
                statusWinthorParaRede: status,
                matchType: match.matchType,
                confidence: match.confidence,
                scoreMatch: match.scoreMatch,
            };
        });
    }
    buildRedeToWinthorRecords(dataset) {
        const base = dataset.redeSales.map((sale) => {
            const match = this.findSystemRowForSale(sale, dataset.systemIndex);
            return { sale, match };
        });
        const systemUsage = new Map();
        for (const item of base) {
            if (!item.match)
                continue;
            const rowId = item.match.item.id;
            systemUsage.set(rowId, (systemUsage.get(rowId) ?? 0) + 1);
        }
        return base.map(({ sale, match }) => {
            const saleId = getSaleIdentifier(sale);
            const valorRede = sale.valorVenda == null ? null : toNumber(sale.valorVenda);
            if (!match) {
                return {
                    idVendaRede: saleId,
                    dataVendaRede: toIsoDate(sale.dataVenda),
                    filialRede: getRedeSaleFilial(sale),
                    filialWinthorMapeada: null,
                    numeroVendaRede: getRedeSaleNumeroVenda(sale),
                    nsu: sale.nsu,
                    autorizacao: sale.authorization,
                    operadora: getRedeSaleOperadora(sale),
                    bandeira: getRedeSaleBandeira(sale),
                    modalidade: getRedeSaleModalidade(sale),
                    valorRede,
                    numpedWinthor: null,
                    dataVendaWinthor: null,
                    statusPedidoWinthor: null,
                    valorWinthor: null,
                    diferencaValor: null,
                    statusRedeParaWinthor: "REDE_SEM_PEDIDO_SISTEMA",
                    matchType: "SEM_MATCH",
                    confidence: "NENHUMA",
                    scoreMatch: 0,
                };
            }
            const row = match.item;
            const statusPedido = deriveStatusPedidoNormalizado(row);
            const duplicatedMatch = (systemUsage.get(row.id) ?? 0) > 1 || match.candidateCount > 1;
            const diferencaValor = round2(toNumber(row.valorVenda) - toNumber(sale.valorVenda));
            const status = duplicatedMatch
                ? "REDE_COM_MATCH_AMBIGUO"
                : statusPedido === "CANCELADO"
                    ? "REDE_CANCELADA"
                    : statusPedido === "DIGITADO" || statusPedido === "PENDENTE"
                        ? "REDE_COM_PEDIDO_NAO_FATURADO"
                        : match.metrics.filialDivergente
                            ? "REDE_COM_DIVERGENCIA_FILIAL"
                            : match.metrics.dataDivergente
                                ? "REDE_COM_DIVERGENCIA_DATA"
                                : match.metrics.valorDivergente
                                    ? "REDE_COM_DIVERGENCIA_VALOR"
                                    : "REDE_COM_PEDIDO_FATURADO";
            return {
                idVendaRede: saleId,
                dataVendaRede: toIsoDate(sale.dataVenda),
                filialRede: getRedeSaleFilial(sale),
                filialWinthorMapeada: row.filialCodigo,
                numeroVendaRede: getRedeSaleNumeroVenda(sale),
                nsu: sale.nsu,
                autorizacao: sale.authorization,
                operadora: getRedeSaleOperadora(sale),
                bandeira: getRedeSaleBandeira(sale),
                modalidade: getRedeSaleModalidade(sale),
                valorRede,
                numpedWinthor: row.pedido ?? row.numeroVenda,
                dataVendaWinthor: row.dataVenda,
                statusPedidoWinthor: statusPedido,
                valorWinthor: row.valorVenda,
                diferencaValor,
                statusRedeParaWinthor: status,
                matchType: match.matchType,
                confidence: match.confidence,
                scoreMatch: match.scoreMatch,
            };
        });
    }
    async getDashboard(filters) {
        const redeContext = await this.getRedeToWinthorContext(filters);
        const systemContext = await this.getWinthorToRedeContext(filters);
        const dataset = redeContext.dataset;
        const redeToSystem = redeContext.records;
        const systemToRede = systemContext.records;
        const totalValorRede = round2(redeToSystem.reduce((sum, row) => sum + toNumber(row.valorRede), 0));
        const totalValorWinthor = round2(systemToRede.reduce((sum, row) => sum + toNumber(row.valorWinthor), 0));
        const redeEncontradas = redeToSystem.filter((row) => row.numpedWinthor).length;
        const redeSemSistema = redeToSystem.length - redeEncontradas;
        const redeDivergentes = redeToSystem.filter((row) => row.statusRedeParaWinthor.includes("DIVERGENCIA") ||
            row.statusRedeParaWinthor.includes("AMBIGUO")).length;
        const systemConfirmadas = systemToRede.filter((row) => row.idVendaRede).length;
        const systemSemRede = systemToRede.length - systemConfirmadas;
        const systemDivergentes = systemToRede.filter((row) => row.statusWinthorParaRede.includes("DIVERGENCIA") ||
            row.statusWinthorParaRede.includes("AMBIGUO")).length;
        return {
            executadoEm: dataset.executadoEm,
            origemRede: dataset.origemRede,
            periodoRede: dataset.periodoRede,
            redeParaSistema: {
                totalVendasRede: redeToSystem.length,
                totalValorRede,
                encontradasNoSistema: redeEncontradas,
                naoEncontradasNoSistema: redeSemSistema,
                comDivergencia: redeDivergentes,
                coberturaPercentual: coveragePercent(redeEncontradas, redeToSystem.length),
            },
            sistemaParaRede: {
                totalVendasSistema: systemToRede.length,
                totalValorSistema: totalValorWinthor,
                confirmadasNaRede: systemConfirmadas,
                naoConfirmadasNaRede: systemSemRede,
                comDivergencia: systemDivergentes,
                coberturaPercentual: coveragePercent(systemConfirmadas, systemToRede.length),
            },
            diferencaTotalValor: round2(totalValorRede - totalValorWinthor),
        };
    }
    async getRedeParaWinthorResumoDia(filters) {
        const { dataset, records: rows } = await this.getRedeToWinthorContext(filters);
        const grouped = new Map();
        for (const row of rows) {
            const data = row.dataVendaRede ?? "SEM_DATA";
            const current = grouped.get(data) ?? {
                data,
                totalRede: 0,
                totalComPedido: 0,
                totalSemPedido: 0,
                quantidadeVendasRede: 0,
                quantidadeComPedidoDigitado: 0,
                quantidadeComPedidoFaturado: 0,
                quantidadeSemPedido: 0,
                quantidadeDivergente: 0,
                diferencaValor: 0,
            };
            const valorRede = toNumber(row.valorRede);
            const valorWinthor = toNumber(row.valorWinthor);
            const temPedido = Boolean(row.numpedWinthor);
            const pedidoFaturado = row.statusPedidoWinthor === "FATURADO";
            const pedidoDigitado = row.statusPedidoWinthor === "DIGITADO" || row.statusPedidoWinthor === "PENDENTE";
            const divergente = row.statusRedeParaWinthor.includes("DIVERGENCIA") || row.statusRedeParaWinthor.includes("AMBIGUO");
            current.quantidadeVendasRede += 1;
            current.totalRede = round2(current.totalRede + valorRede);
            if (temPedido) {
                current.totalComPedido = round2(current.totalComPedido + valorWinthor);
            }
            else {
                current.totalSemPedido = round2(current.totalSemPedido + valorRede);
                current.quantidadeSemPedido += 1;
            }
            if (pedidoFaturado)
                current.quantidadeComPedidoFaturado += 1;
            if (pedidoDigitado)
                current.quantidadeComPedidoDigitado += 1;
            if (divergente)
                current.quantidadeDivergente += 1;
            current.diferencaValor = round2(current.diferencaValor + toNumber(row.diferencaValor));
            grouped.set(data, current);
        }
        const registros = Array.from(grouped.values()).sort((a, b) => a.data.localeCompare(b.data));
        return {
            executadoEm: dataset.executadoEm,
            origemRede: dataset.origemRede,
            periodoRede: dataset.periodoRede,
            total: registros.length,
            registros,
        };
    }
    async getRedeParaWinthorResumoFilial(filters) {
        const { dataset, records: rows } = await this.getRedeToWinthorContext(filters);
        const grouped = new Map();
        for (const row of rows) {
            const filialCodigo = row.filialWinthorMapeada ?? row.filialRede ?? "SEM_FILIAL";
            const filialNome = row.filialWinthorMapeada ? `Filial ${row.filialWinthorMapeada}` : "Filial REDE sem mapeamento";
            const current = grouped.get(filialCodigo) ?? {
                filialCodigo,
                filialNome,
                totalRede: 0,
                totalComPedido: 0,
                totalSemPedido: 0,
                quantidadeVendasRede: 0,
                quantidadeComPedidoDigitado: 0,
                quantidadeComPedidoFaturado: 0,
                quantidadeSemPedido: 0,
                quantidadeDivergente: 0,
                percentualConciliado: 0,
            };
            const valorRede = toNumber(row.valorRede);
            const valorWinthor = toNumber(row.valorWinthor);
            const temPedido = Boolean(row.numpedWinthor);
            const pedidoFaturado = row.statusPedidoWinthor === "FATURADO";
            const pedidoDigitado = row.statusPedidoWinthor === "DIGITADO" || row.statusPedidoWinthor === "PENDENTE";
            const divergente = row.statusRedeParaWinthor.includes("DIVERGENCIA") || row.statusRedeParaWinthor.includes("AMBIGUO");
            current.quantidadeVendasRede += 1;
            current.totalRede = round2(current.totalRede + valorRede);
            if (temPedido) {
                current.totalComPedido = round2(current.totalComPedido + valorWinthor);
            }
            else {
                current.totalSemPedido = round2(current.totalSemPedido + valorRede);
                current.quantidadeSemPedido += 1;
            }
            if (pedidoFaturado)
                current.quantidadeComPedidoFaturado += 1;
            if (pedidoDigitado)
                current.quantidadeComPedidoDigitado += 1;
            if (divergente)
                current.quantidadeDivergente += 1;
            grouped.set(filialCodigo, current);
        }
        const registros = Array.from(grouped.values())
            .map((row) => ({
            ...row,
            percentualConciliado: coveragePercent(row.quantidadeVendasRede - row.quantidadeSemPedido, row.quantidadeVendasRede),
        }))
            .sort((a, b) => b.totalSemPedido - a.totalSemPedido || b.quantidadeDivergente - a.quantidadeDivergente);
        return {
            executadoEm: dataset.executadoEm,
            origemRede: dataset.origemRede,
            periodoRede: dataset.periodoRede,
            total: registros.length,
            registros,
        };
    }
    async getRedeParaWinthorTransacoes(filters, pagination) {
        const { dataset, records } = await this.getRedeToWinthorContext(filters);
        const rows = records.slice().sort((a, b) => {
            const dateA = a.dataVendaRede ?? "";
            const dateB = b.dataVendaRede ?? "";
            if (dateA !== dateB)
                return dateB.localeCompare(dateA);
            return Math.abs(toNumber(b.diferencaValor)) - Math.abs(toNumber(a.diferencaValor));
        });
        const paginated = paginate(rows, pagination);
        return {
            executadoEm: dataset.executadoEm,
            origemRede: dataset.origemRede,
            periodoRede: dataset.periodoRede,
            total: rows.length,
            ...paginated,
        };
    }
    async getWinthorParaRedeResumoDia(filters) {
        const { dataset, records: rows } = await this.getWinthorToRedeContext(filters);
        const grouped = new Map();
        for (const row of rows) {
            const data = row.dataVendaWinthor ?? "SEM_DATA";
            const current = grouped.get(data) ?? {
                data,
                totalWinthor: 0,
                totalConfirmadoNaRede: 0,
                totalSemRede: 0,
                quantidadeWinthor: 0,
                quantidadeConfirmada: 0,
                quantidadeSemRede: 0,
                quantidadeDivergente: 0,
                diferencaValor: 0,
            };
            const confirmada = Boolean(row.idVendaRede);
            const divergente = row.statusWinthorParaRede.includes("DIVERGENCIA") || row.statusWinthorParaRede.includes("AMBIGUO");
            current.quantidadeWinthor += 1;
            current.totalWinthor = round2(current.totalWinthor + toNumber(row.valorWinthor));
            if (confirmada) {
                current.quantidadeConfirmada += 1;
                current.totalConfirmadoNaRede = round2(current.totalConfirmadoNaRede + toNumber(row.valorRede));
            }
            else {
                current.quantidadeSemRede += 1;
                current.totalSemRede = round2(current.totalSemRede + toNumber(row.valorWinthor));
            }
            if (divergente)
                current.quantidadeDivergente += 1;
            current.diferencaValor = round2(current.diferencaValor + toNumber(row.diferencaValor));
            grouped.set(data, current);
        }
        const registros = Array.from(grouped.values()).sort((a, b) => a.data.localeCompare(b.data));
        return {
            executadoEm: dataset.executadoEm,
            origemRede: dataset.origemRede,
            periodoRede: dataset.periodoRede,
            total: registros.length,
            registros,
        };
    }
    async getWinthorParaRedeResumoFilial(filters) {
        const { dataset, records: rows } = await this.getWinthorToRedeContext(filters);
        const grouped = new Map();
        for (const row of rows) {
            const filialCodigo = row.filialWinthor ?? "SEM_FILIAL";
            const current = grouped.get(filialCodigo) ?? {
                filialCodigo,
                filialNome: `Filial ${filialCodigo}`,
                totalWinthor: 0,
                totalConfirmadoNaRede: 0,
                totalSemRede: 0,
                quantidadeWinthor: 0,
                quantidadeConfirmada: 0,
                quantidadeSemRede: 0,
                quantidadeDivergente: 0,
                percentualConfirmado: 0,
            };
            const confirmada = Boolean(row.idVendaRede);
            const divergente = row.statusWinthorParaRede.includes("DIVERGENCIA") || row.statusWinthorParaRede.includes("AMBIGUO");
            current.quantidadeWinthor += 1;
            current.totalWinthor = round2(current.totalWinthor + toNumber(row.valorWinthor));
            if (confirmada) {
                current.quantidadeConfirmada += 1;
                current.totalConfirmadoNaRede = round2(current.totalConfirmadoNaRede + toNumber(row.valorRede));
            }
            else {
                current.quantidadeSemRede += 1;
                current.totalSemRede = round2(current.totalSemRede + toNumber(row.valorWinthor));
            }
            if (divergente)
                current.quantidadeDivergente += 1;
            grouped.set(filialCodigo, current);
        }
        const registros = Array.from(grouped.values())
            .map((row) => ({
            ...row,
            percentualConfirmado: coveragePercent(row.quantidadeConfirmada, row.quantidadeWinthor),
        }))
            .sort((a, b) => b.totalSemRede - a.totalSemRede || b.quantidadeDivergente - a.quantidadeDivergente);
        return {
            executadoEm: dataset.executadoEm,
            origemRede: dataset.origemRede,
            periodoRede: dataset.periodoRede,
            total: registros.length,
            registros,
        };
    }
    async getWinthorParaRedeTransacoes(filters, pagination) {
        const { dataset, records } = await this.getWinthorToRedeContext(filters);
        const rows = records.slice().sort((a, b) => {
            if (a.dataVendaWinthor !== b.dataVendaWinthor)
                return b.dataVendaWinthor.localeCompare(a.dataVendaWinthor);
            return Math.abs(toNumber(b.diferencaValor)) - Math.abs(toNumber(a.diferencaValor));
        });
        const paginated = paginate(rows, pagination);
        return {
            executadoEm: dataset.executadoEm,
            origemRede: dataset.origemRede,
            periodoRede: dataset.periodoRede,
            total: rows.length,
            ...paginated,
        };
    }
    async getRedeSemSistema(filters, pagination) {
        const { dataset, records } = await this.getRedeToWinthorContext(filters);
        const rows = records.filter((row) => row.statusRedeParaWinthor === "REDE_SEM_PEDIDO_SISTEMA");
        const paginated = paginate(rows, pagination);
        return {
            executadoEm: dataset.executadoEm,
            origemRede: dataset.origemRede,
            periodoRede: dataset.periodoRede,
            total: rows.length,
            ...paginated,
        };
    }
    async getWinthorSemRede(filters, pagination) {
        const { dataset, records } = await this.getWinthorToRedeContext(filters);
        const rows = records.filter((row) => row.statusWinthorParaRede === "WINTHOR_PEDIDO_FATURADO_NAO_CONFIRMADO_NA_REDE" ||
            row.statusWinthorParaRede === "WINTHOR_PEDIDO_DIGITADO_NAO_CONFIRMADO_NA_REDE");
        const paginated = paginate(rows, pagination);
        return {
            executadoEm: dataset.executadoEm,
            origemRede: dataset.origemRede,
            periodoRede: dataset.periodoRede,
            total: rows.length,
            ...paginated,
        };
    }
}
