import { AppError } from "../../utils/error.js";
import { db } from "../../repositories/dataStore.js";
const DATE_TOLERANCE_DAYS = 2;
const VALUE_TOLERANCE_PERCENT = 0.01;
const DEFAULT_LIST_LIMIT = 200;
const APPROXIMATE_MATCH_CROSS_PRODUCT_LIMIT = 2_000_000;
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
function normalizeSaleNumber(value) {
    const normalized = normalizeToken(value);
    if (!normalized)
        return null;
    return normalized.replace(/\s+/g, "");
}
function pushIndex(map, key, value) {
    if (!key)
        return;
    const list = map.get(key);
    if (list) {
        list.push(value);
        return;
    }
    map.set(key, [value]);
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
function cleanTextOrNull(value) {
    if (value == null)
        return null;
    const text = String(value).trim();
    if (!text || text === "-")
        return null;
    return text;
}
function includesNormalized(base, search) {
    if (!search || !String(search).trim())
        return true;
    const baseToken = normalizeToken(String(base ?? "")) ?? "";
    const searchToken = normalizeToken(String(search)) ?? "";
    return baseToken.includes(searchToken);
}
function matchesContextOrFilter(base, filter, context) {
    if (context && String(context).trim()) {
        return normalizeToken(String(base ?? "")) === normalizeToken(String(context));
    }
    return includesNormalized(base, filter);
}
function toNumber(value) {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value !== "string")
        return 0;
    const text = value.trim();
    if (!text)
        return 0;
    const normalized = text.includes(",")
        ? text.replace(/\./g, "").replace(",", ".")
        : text;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}
function parseDate(value, field) {
    if (!value)
        return null;
    const iso = toIsoDate(value.trim());
    if (!iso) {
        throw new AppError(`${field} invalida. Use formato YYYY-MM-DD.`, 400);
    }
    return iso;
}
function shiftDate(baseIso, offsetDays) {
    const parsed = new Date(`${baseIso}T00:00:00.000Z`);
    parsed.setUTCDate(parsed.getUTCDate() + offsetDays);
    return parsed.toISOString().slice(0, 10);
}
function dateDiffInDays(a, b) {
    const dateA = toIsoDate(a ?? null);
    const dateB = toIsoDate(b ?? null);
    if (!dateA || !dateB)
        return null;
    const parsedA = new Date(`${dateA}T00:00:00.000Z`);
    const parsedB = new Date(`${dateB}T00:00:00.000Z`);
    const diff = Math.abs(parsedB.getTime() - parsedA.getTime());
    return Math.floor(diff / (24 * 60 * 60 * 1000));
}
function percentDiff(reference, compared) {
    const denominator = Math.abs(reference) > 0.0001 ? Math.abs(reference) : 1;
    return Math.abs(reference - compared) / denominator;
}
function compatibleFilial(systemFilial, redeFilial) {
    const a = normalizeToken(systemFilial);
    const b = normalizeToken(redeFilial);
    if (!a || !b)
        return true;
    return a === b;
}
function getSaleIdentifier(sale) {
    return sale.externalId || `${sale.nsu ?? ""}|${sale.authorization ?? ""}|${sale.dataVenda ?? ""}`;
}
function getSaleDateKeys(dateIso) {
    const keys = [];
    for (let i = -DATE_TOLERANCE_DAYS; i <= DATE_TOLERANCE_DAYS; i += 1) {
        keys.push(shiftDate(dateIso, i));
    }
    return keys;
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
function getRedeSaleValor(sale) {
    return sale.valorVenda == null ? null : round2(sale.valorVenda);
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
function getLatestValidationItemsForPeriod(range) {
    const items = Array.isArray(db.redeSalesValidationItems) ? db.redeSalesValidationItems : [];
    const periodItems = items.filter((item) => {
        const date = toIsoDate(item?.rede_sale_date);
        if (!date)
            return false;
        return date >= range.dataInicio && date <= range.dataFim;
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
function loadSalesFromValidationItems(range, filters = {}) {
    const items = getLatestValidationItemsForPeriod(range);
    const sales = items.map((item, index) => {
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
    return sales.filter((sale) => {
        const date = toIsoDate(sale.dataVenda);
        if (!date)
            return false;
        if (!matchesContextOrFilter(getRedeSaleFilial(sale), filters.filial, filters.contextoFilial))
            return false;
        return true;
    });
}
function inferNotFoundReason(row) {
    const hasNsu = Boolean(normalizeToken(row.nsu));
    const hasAuth = Boolean(normalizeToken(row.autorizacao));
    if (!hasNsu && !hasAuth) {
        return "Transacao sem NSU e sem autorizacao para busca direta na REDE.";
    }
    return "Nenhuma venda correspondente encontrada na REDE para os criterios informados.";
}
function inferNotFoundReasonFromRede(sale) {
    const hasNsu = Boolean(normalizeToken(sale.nsu));
    const hasAuth = Boolean(normalizeToken(sale.authorization));
    if (!hasNsu && !hasAuth) {
        return "Venda da REDE sem NSU/autorizacao para vinculo primario no sistema.";
    }
    return "Venda presente na REDE sem registro correspondente no sistema.";
}
function confidenceByMatchType(matchType) {
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
function coveragePercent(found, total) {
    if (total <= 0)
        return 0;
    return round2((found / total) * 100);
}
function selectFirstUnused(sales, used) {
    if (!sales || sales.length === 0)
        return null;
    for (const sale of sales) {
        const saleId = getSaleIdentifier(sale);
        if (used.has(saleId))
            continue;
        used.add(saleId);
        return sale;
    }
    return null;
}
function selectFirstUnusedSystem(rows, used) {
    if (!rows || rows.length === 0)
        return null;
    for (const row of rows) {
        if (used.has(row.id))
            continue;
        used.add(row.id);
        return row;
    }
    return null;
}
function createRedeIndex(sales) {
    const index = {
        byNsu: new Map(),
        byAuthorization: new Map(),
        byNumeroVenda: new Map(),
        byDate: new Map(),
    };
    for (const sale of sales) {
        pushIndex(index.byNsu, normalizeToken(sale.nsu), sale);
        pushIndex(index.byAuthorization, normalizeToken(sale.authorization), sale);
        for (const saleNumber of getSaleNumberCandidatesFromRede(sale)) {
            pushIndex(index.byNumeroVenda, saleNumber, sale);
        }
        pushIndex(index.byDate, toIsoDate(sale.dataVenda), sale);
    }
    return index;
}
function createSystemIndex(rows) {
    const index = {
        byNsu: new Map(),
        byAuthorization: new Map(),
        byNumeroVenda: new Map(),
        byDate: new Map(),
    };
    for (const row of rows) {
        pushIndex(index.byNsu, normalizeToken(row.nsu), row);
        pushIndex(index.byAuthorization, normalizeToken(row.autorizacao), row);
        for (const saleNumber of getSaleNumberCandidatesFromSystem(row)) {
            pushIndex(index.byNumeroVenda, saleNumber, row);
        }
        pushIndex(index.byDate, toIsoDate(row.dataVenda), row);
    }
    return index;
}
function chooseBestByAmountDate(row, index, used) {
    const rowDate = toIsoDate(row.dataVenda);
    if (!rowDate)
        return null;
    const rowValor = round2(row.valorVenda);
    const candidates = [];
    for (const dateKey of getSaleDateKeys(rowDate)) {
        const sales = index.byDate.get(dateKey) ?? [];
        for (const sale of sales) {
            const saleId = getSaleIdentifier(sale);
            if (used.has(saleId))
                continue;
            const saleValor = getRedeSaleValor(sale);
            if (saleValor == null)
                continue;
            if (!compatibleFilial(row.filialCodigo, getRedeSaleFilial(sale)))
                continue;
            const valueDiff = percentDiff(rowValor, saleValor);
            if (valueDiff > VALUE_TOLERANCE_PERCENT)
                continue;
            const dateDiff = dateDiffInDays(rowDate, sale.dataVenda) ?? 99;
            candidates.push({ sale, valueDiff, dateDiff });
        }
    }
    candidates.sort((a, b) => {
        if (a.valueDiff !== b.valueDiff)
            return a.valueDiff - b.valueDiff;
        return a.dateDiff - b.dateDiff;
    });
    const winner = candidates[0]?.sale ?? null;
    if (!winner)
        return null;
    used.add(getSaleIdentifier(winner));
    return winner;
}
function chooseBestSystemByAmountDate(sale, index, used) {
    const saleDate = toIsoDate(sale.dataVenda);
    const saleValor = getRedeSaleValor(sale);
    if (!saleDate || saleValor == null)
        return null;
    const candidates = [];
    for (const dateKey of getSaleDateKeys(saleDate)) {
        const rows = index.byDate.get(dateKey) ?? [];
        for (const row of rows) {
            if (used.has(row.id))
                continue;
            if (!compatibleFilial(row.filialCodigo, getRedeSaleFilial(sale)))
                continue;
            const valueDiff = percentDiff(saleValor, round2(row.valorVenda));
            if (valueDiff > VALUE_TOLERANCE_PERCENT)
                continue;
            const dateDiff = dateDiffInDays(row.dataVenda, saleDate) ?? 99;
            candidates.push({ row, valueDiff, dateDiff });
        }
    }
    candidates.sort((a, b) => {
        if (a.valueDiff !== b.valueDiff)
            return a.valueDiff - b.valueDiff;
        return a.dateDiff - b.dateDiff;
    });
    const winner = candidates[0]?.row ?? null;
    if (!winner)
        return null;
    used.add(winner.id);
    return winner;
}
function matchSystemToRede(row, index, usedRedeSales, allowApproximateValueDate = true) {
    const nsuMatch = selectFirstUnused(index.byNsu.get(normalizeToken(row.nsu) ?? "__none__"), usedRedeSales);
    if (nsuMatch) {
        return { sale: nsuMatch, matchType: "NSU", confidence: confidenceByMatchType("NSU") };
    }
    const authMatch = selectFirstUnused(index.byAuthorization.get(normalizeToken(row.autorizacao) ?? "__none__"), usedRedeSales);
    if (authMatch) {
        return { sale: authMatch, matchType: "AUTORIZACAO", confidence: confidenceByMatchType("AUTORIZACAO") };
    }
    for (const numberCandidate of getSaleNumberCandidatesFromSystem(row)) {
        const match = selectFirstUnused(index.byNumeroVenda.get(numberCandidate), usedRedeSales);
        if (match) {
            return { sale: match, matchType: "NUMERO_VENDA", confidence: confidenceByMatchType("NUMERO_VENDA") };
        }
    }
    if (allowApproximateValueDate) {
        const valueDateMatch = chooseBestByAmountDate(row, index, usedRedeSales);
        if (valueDateMatch) {
            return { sale: valueDateMatch, matchType: "VALOR_DATA", confidence: confidenceByMatchType("VALOR_DATA") };
        }
    }
    return { sale: null, matchType: "SEM_MATCH", confidence: "NENHUMA" };
}
function matchRedeToSystem(sale, index, usedSystemRows, allowApproximateValueDate = true) {
    const nsuMatch = selectFirstUnusedSystem(index.byNsu.get(normalizeToken(sale.nsu) ?? "__none__"), usedSystemRows);
    if (nsuMatch) {
        return { row: nsuMatch, matchType: "NSU", confidence: confidenceByMatchType("NSU") };
    }
    const authMatch = selectFirstUnusedSystem(index.byAuthorization.get(normalizeToken(sale.authorization) ?? "__none__"), usedSystemRows);
    if (authMatch) {
        return { row: authMatch, matchType: "AUTORIZACAO", confidence: confidenceByMatchType("AUTORIZACAO") };
    }
    for (const numberCandidate of getSaleNumberCandidatesFromRede(sale)) {
        const match = selectFirstUnusedSystem(index.byNumeroVenda.get(numberCandidate), usedSystemRows);
        if (match) {
            return { row: match, matchType: "NUMERO_VENDA", confidence: confidenceByMatchType("NUMERO_VENDA") };
        }
    }
    if (allowApproximateValueDate) {
        const valueDateMatch = chooseBestSystemByAmountDate(sale, index, usedSystemRows);
        if (valueDateMatch) {
            return { row: valueDateMatch, matchType: "VALOR_DATA", confidence: confidenceByMatchType("VALOR_DATA") };
        }
    }
    return { row: null, matchType: "SEM_MATCH", confidence: "NENHUMA" };
}
function resolveDateRange(rows, options) {
    const dataInicioInput = parseDate(options.dataInicio, "dataInicio");
    const dataFimInput = parseDate(options.dataFim, "dataFim");
    if (dataInicioInput && dataFimInput && dataInicioInput > dataFimInput) {
        throw new AppError("dataInicio nao pode ser maior que dataFim.", 400);
    }
    if (dataInicioInput && dataFimInput) {
        return { dataInicio: dataInicioInput, dataFim: dataFimInput };
    }
    const rowDates = rows
        .map((row) => toIsoDate(row.dataVenda))
        .filter((date) => Boolean(date))
        .sort((a, b) => a.localeCompare(b));
    if (rowDates.length > 0) {
        const inferred = {
            dataInicio: dataInicioInput ?? rowDates[0],
            dataFim: dataFimInput ?? rowDates[rowDates.length - 1],
        };
        if (inferred.dataInicio > inferred.dataFim) {
            throw new AppError("dataInicio nao pode ser maior que dataFim.", 400);
        }
        return inferred;
    }
    const today = new Date().toISOString().slice(0, 10);
    const fallback = {
        dataInicio: dataInicioInput ?? shiftDate(today, -7),
        dataFim: dataFimInput ?? today,
    };
    if (fallback.dataInicio > fallback.dataFim) {
        throw new AppError("dataInicio nao pode ser maior que dataFim.", 400);
    }
    return fallback;
}
function formatTransactionMessage(matchType) {
    switch (matchType) {
        case "NSU":
            return "Venda validada na REDE por NSU.";
        case "AUTORIZACAO":
            return "Venda validada na REDE por codigo de autorizacao.";
        case "NUMERO_VENDA":
            return "Venda validada na REDE por numero de venda/pedido.";
        case "VALOR_DATA":
            return "Venda validada na REDE por aproximacao de valor e data.";
        default:
            return "Venda do sistema nao localizada na REDE no periodo consultado.";
    }
}
export class RedeCrossValidationService {
    logger;
    analyticsService;
    redeService;
    constructor(logger, analyticsService, redeService) {
        this.logger = logger;
        this.analyticsService = analyticsService;
        this.redeService = redeService;
    }
    async loadRedeSales(range, filters) {
        const localSales = loadSalesFromValidationItems(range, filters);
        if (localSales.length > 0) {
            return { sales: localSales, origemRede: "VALIDACAO_PLANILHA" };
        }
        try {
            const redeSales = await this.redeService.getSales(range.dataInicio, range.dataFim);
            if (redeSales.length > 0) {
                return { sales: redeSales, origemRede: "API" };
            }
            const fallbackSales = loadSalesFromValidationItems(range, filters);
            if (fallbackSales.length > 0) {
                this.logger.warn({
                    component: "RedeCrossValidationService",
                    action: "loadRedeSales",
                    range,
                    fallbackRows: fallbackSales.length,
                }, "API REDE sem vendas no periodo. Utilizando vendas importadas pela validacao da planilha.");
                return { sales: fallbackSales, origemRede: "VALIDACAO_PLANILHA" };
            }
            return { sales: redeSales, origemRede: "API" };
        }
        catch (error) {
            const fallbackSales = loadSalesFromValidationItems(range, filters);
            if (fallbackSales.length > 0) {
                this.logger.warn({
                    component: "RedeCrossValidationService",
                    action: "loadRedeSales",
                    error,
                    range,
                    fallbackRows: fallbackSales.length,
                }, "Falha na API REDE. Utilizando vendas importadas pela validacao da planilha.");
                return { sales: fallbackSales, origemRede: "VALIDACAO_PLANILHA" };
            }
            throw error;
        }
    }
    async validatePeriod(filters, options = {}) {
        const limiteLista = Math.max(1, Math.min(options.limiteLista ?? DEFAULT_LIST_LIMIT, 500));
        const systemRows = this.analyticsService.listTransacoesParaValidacao(filters);
        const range = resolveDateRange(systemRows, {
            dataInicio: options.dataInicio ?? filters.dataInicio,
            dataFim: options.dataFim ?? filters.dataFim,
        });
        const { sales: redeSales, origemRede } = await this.loadRedeSales(range, filters);
        const redeIndex = createRedeIndex(redeSales);
        const systemIndex = createSystemIndex(systemRows);
        const allowApproximateValueDate = systemRows.length * Math.max(redeSales.length, 1) <= APPROXIMATE_MATCH_CROSS_PRODUCT_LIMIT;
        const usedRedeForSystem = new Set();
        const usedSystemForRede = new Set();
        const sistemaSemCorrespondencia = [];
        const redeSemCorrespondencia = [];
        const correspondenciasAmostra = [];
        for (const row of systemRows) {
            const match = matchSystemToRede(row, redeIndex, usedRedeForSystem, allowApproximateValueDate);
            if (!match.sale) {
                sistemaSemCorrespondencia.push({
                    transacaoId: row.id,
                    filial: row.filialCodigo,
                    dataVenda: row.dataVenda,
                    numeroVenda: row.numeroVenda,
                    nsu: row.nsu,
                    autorizacao: row.autorizacao,
                    valorVenda: row.valorVenda,
                    motivo: inferNotFoundReason(row),
                });
                continue;
            }
            if (correspondenciasAmostra.length < limiteLista) {
                correspondenciasAmostra.push({
                    transacaoId: row.id,
                    redeSaleId: getSaleIdentifier(match.sale),
                    matchType: match.matchType,
                    confidence: match.confidence,
                    filialSistema: row.filialCodigo,
                    filialRede: getRedeSaleFilial(match.sale),
                    dataSistema: row.dataVenda,
                    dataRede: toIsoDate(match.sale.dataVenda),
                    valorSistema: row.valorVenda,
                    valorRede: getRedeSaleValor(match.sale),
                    nsu: row.nsu ?? match.sale.nsu,
                    autorizacao: row.autorizacao ?? match.sale.authorization,
                });
            }
        }
        for (const sale of redeSales) {
            const match = matchRedeToSystem(sale, systemIndex, usedSystemForRede, allowApproximateValueDate);
            if (match.row)
                continue;
            redeSemCorrespondencia.push({
                redeSaleId: getSaleIdentifier(sale),
                filial: getRedeSaleFilial(sale),
                dataVenda: toIsoDate(sale.dataVenda),
                numeroVenda: sale.numped ?? sale.numnota ?? sale.externalId,
                nsu: sale.nsu,
                autorizacao: sale.authorization,
                valorVenda: getRedeSaleValor(sale),
                motivo: inferNotFoundReasonFromRede(sale),
            });
        }
        const totalSistema = systemRows.length;
        const naoEncontradasSistema = sistemaSemCorrespondencia.length;
        const encontradasSistema = totalSistema - naoEncontradasSistema;
        const totalRede = redeSales.length;
        const naoEncontradasRede = redeSemCorrespondencia.length;
        const encontradasRede = totalRede - naoEncontradasRede;
        this.logger.info({
            component: "RedeCrossValidationService",
            action: "validatePeriod",
            range,
            totalSistema,
            totalRede,
            encontradasSistema,
            encontradasRede,
            origemRede,
            allowApproximateValueDate,
        }, "Validacao cruzada Sistema x REDE concluida");
        return {
            executadoEm: new Date().toISOString(),
            origemRede,
            periodoRede: range,
            sistema: {
                totalVendas: totalSistema,
                encontradasNaRede: encontradasSistema,
                naoEncontradasNaRede: naoEncontradasSistema,
                coberturaPercentual: coveragePercent(encontradasSistema, totalSistema),
            },
            rede: {
                totalVendas: totalRede,
                encontradasNoSistema: encontradasRede,
                naoEncontradasNoSistema: naoEncontradasRede,
                coberturaPercentual: coveragePercent(encontradasRede, totalRede),
            },
            sistemaSemCorrespondencia: {
                total: sistemaSemCorrespondencia.length,
                itens: sistemaSemCorrespondencia.slice(0, limiteLista),
            },
            redeSemCorrespondencia: {
                total: redeSemCorrespondencia.length,
                itens: redeSemCorrespondencia.slice(0, limiteLista),
            },
            correspondenciasAmostra,
        };
    }
    async validateTransaction(transacaoId, janelaDias = DATE_TOLERANCE_DAYS) {
        const safeWindow = Math.max(0, Math.min(janelaDias, 15));
        const row = this.analyticsService.getTransacaoById(transacaoId);
        const rowDate = toIsoDate(row.dataVenda);
        if (!rowDate) {
            throw new AppError(`Transacao ${transacaoId} sem data de venda valida para consultar a REDE.`, 400);
        }
        const range = {
            dataInicio: shiftDate(rowDate, -safeWindow),
            dataFim: shiftDate(rowDate, safeWindow),
        };
        const { sales: redeSales, origemRede } = await this.loadRedeSales(range, { filial: row.filialCodigo });
        const redeIndex = createRedeIndex(redeSales);
        const match = matchSystemToRede(row, redeIndex, new Set());
        return {
            executadoEm: new Date().toISOString(),
            origemRede,
            periodoRede: range,
            transacaoSistema: {
                transacaoId: row.id,
                filial: row.filialCodigo,
                dataVenda: row.dataVenda,
                numeroVenda: row.numeroVenda,
                nsu: row.nsu,
                autorizacao: row.autorizacao,
                valorVenda: row.valorVenda,
            },
            encontradaNaRede: Boolean(match.sale),
            matchType: match.matchType,
            confidence: match.confidence,
            mensagem: formatTransactionMessage(match.matchType),
            rede: match.sale
                ? {
                    redeSaleId: getSaleIdentifier(match.sale),
                    filial: getRedeSaleFilial(match.sale),
                    dataVenda: toIsoDate(match.sale.dataVenda),
                    numeroVenda: match.sale.numped ?? match.sale.numnota ?? match.sale.externalId,
                    nsu: match.sale.nsu,
                    autorizacao: match.sale.authorization,
                    valorVenda: getRedeSaleValor(match.sale),
                }
                : null,
        };
    }
}
