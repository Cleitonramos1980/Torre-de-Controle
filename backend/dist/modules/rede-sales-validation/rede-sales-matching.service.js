import { REDE_SALES_VALIDATION_STATUS as STATUS } from "./enums/validation-status.js";
const DEFAULT_TOLERANCES = {
    tolerancia_valor_reais: 0.05,
    tolerancia_valor_percentual: 0.01,
    tolerancia_dias: 1,
    considerar_data_proxima: true,
    considerar_valor_aproximado: true,
};
function normalizeText(value) {
    if (value == null)
        return "";
    return String(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim();
}
function normalizeDoc(value) {
    return normalizeText(value).replace(/[^0-9A-Z]/g, "");
}
function normalizeNsu(value) {
    return normalizeDoc(value);
}
function toIsoDate(value) {
    if (!value)
        return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()))
        return null;
    return parsed.toISOString().slice(0, 10);
}
function toNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return Number(value.toFixed(2));
    }
    if (value == null)
        return 0;
    const parsed = Number(String(value).replace(",", "."));
    if (!Number.isFinite(parsed))
        return 0;
    return Number(parsed.toFixed(2));
}
function optionalNumber(value, fallback) {
    if (value == null || value === "")
        return fallback;
    const parsed = Number(String(value ?? "").replace(",", "."));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}
function toBool(value, fallback) {
    if (value === true || value === false)
        return value;
    if (value == null || value === "")
        return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (["1", "true", "sim", "yes", "s"].includes(normalized))
        return true;
    if (["0", "false", "nao", "no", "n"].includes(normalized))
        return false;
    return fallback;
}
function resolveTolerances(input) {
    return {
        tolerancia_valor_reais: optionalNumber(input?.tolerancia_valor_reais, DEFAULT_TOLERANCES.tolerancia_valor_reais),
        tolerancia_valor_percentual: optionalNumber(input?.tolerancia_valor_percentual, DEFAULT_TOLERANCES.tolerancia_valor_percentual),
        tolerancia_dias: optionalNumber(input?.tolerancia_dias, DEFAULT_TOLERANCES.tolerancia_dias),
        considerar_data_proxima: toBool(input?.considerar_data_proxima, DEFAULT_TOLERANCES.considerar_data_proxima),
        considerar_valor_aproximado: toBool(input?.considerar_valor_aproximado, DEFAULT_TOLERANCES.considerar_valor_aproximado),
    };
}
function signedDaysDiff(dateRede, dateSistema) {
    const rede = toIsoDate(dateRede);
    const sistema = toIsoDate(dateSistema);
    if (!rede || !sistema)
        return null;
    const redeDate = new Date(`${rede}T00:00:00.000Z`);
    const sistemaDate = new Date(`${sistema}T00:00:00.000Z`);
    return Math.round((redeDate.getTime() - sistemaDate.getTime()) / (24 * 60 * 60 * 1000));
}
function valueDiffPercent(redeAmount, sistemaAmount) {
    const denominator = Math.abs(redeAmount) > 0.0001 ? Math.abs(redeAmount) : 1;
    return (Math.abs(redeAmount - sistemaAmount) / denominator) * 100;
}
function isValueEqual(redeAmount, sistemaAmount, tolerances) {
    const diff = Math.abs(redeAmount - sistemaAmount);
    if (!tolerances.considerar_valor_aproximado)
        return diff === 0;
    return diff <= tolerances.tolerancia_valor_reais || valueDiffPercent(redeAmount, sistemaAmount) <= tolerances.tolerancia_valor_percentual;
}
function isDateEqual(redeDate, sistemaDate, tolerances) {
    const diff = signedDaysDiff(redeDate, sistemaDate);
    if (diff == null)
        return false;
    if (!tolerances.considerar_data_proxima)
        return diff === 0;
    return Math.abs(diff) <= tolerances.tolerancia_dias;
}
function buildWinthorIndexByFilial(sales) {
    const map = new Map();
    for (const sale of sales) {
        const filial = String(sale.codfilial ?? "").trim();
        if (!filial)
            continue;
        const list = map.get(filial);
        if (list) {
            list.push(sale);
        }
        else {
            map.set(filial, [sale]);
        }
    }
    return map;
}
function buildWinthorItemIndex(items) {
    const map = new Map();
    for (const item of items ?? []) {
        const filial = String(item?.codfilial ?? "").trim();
        const numped = String(item?.numped ?? "").trim();
        if (!filial || !numped)
            continue;
        const key = `${filial}|${numped}`;
        map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
}
function hasWinthorItemsForSale(sale, itemIndex) {
    const filial = String(sale?.codfilial ?? "").trim();
    const numped = String(sale?.numped ?? "").trim();
    if (!filial || !numped)
        return false;
    return (itemIndex.get(`${filial}|${numped}`) ?? 0) > 0;
}
function matchesDocument(doc, sale) {
    if (!doc)
        return false;
    const salePedido = normalizeDoc(sale.numped);
    const saleNota = normalizeDoc(sale.numnota);
    return doc === salePedido || doc === saleNota;
}
function matchesNsu(nsu, sale) {
    if (!nsu)
        return false;
    return nsu === normalizeNsu(sale.nsu);
}
function scoreFromComparisons(comparison) {
    let score = 0;
    if (comparison.filial_status === "FILIAL_LOCALIZADA")
        score += 30;
    if (comparison.nsu_status === "NSU_IGUAL")
        score += 25;
    if (comparison.value_status === "VALOR_IGUAL")
        score += 20;
    if (comparison.date_status === "DATA_IGUAL")
        score += 15;
    if (comparison.document_status === "DOCUMENTO_IGUAL")
        score += 10;
    return score;
}
function classifyScore(score) {
    if (score >= 90)
        return "MATCH_FORTE";
    if (score >= 70)
        return "MATCH_PROVAVEL";
    if (score >= 50)
        return "MATCH_FRACO";
    return "NAO_ENCONTRADO";
}
function isDivergentStatus(status) {
    return status !== STATUS.VENDA_VALIDADA;
}
function pickGeneralStatus(comparison, matchClassification, matchSale) {
    if (!matchSale)
        return STATUS.VENDA_REDE_NAO_ENCONTRADA_NO_SISTEMA;
    if (comparison.filial_status === "FILIAL_DIVERGENTE" || comparison.filial_status === "FILIAL_NAO_ENCONTRADA")
        return STATUS.FILIAL_DIVERGENTE;
    if (comparison.nsu_status === "NSU_DIVERGENTE")
        return STATUS.NSU_DIVERGENTE;
    if (comparison.value_status === "VALOR_DIVERGENTE")
        return STATUS.VALOR_DIVERGENTE;
    if (comparison.date_status === "DATA_DIVERGENTE")
        return STATUS.DATA_DIVERGENTE;
    if (matchClassification === "MATCH_FORTE")
        return STATUS.VENDA_VALIDADA;
    if (matchClassification === "MATCH_PROVAVEL")
        return STATUS.MATCH_PROVAVEL;
    return STATUS.ANALISE_MANUAL;
}
function buildComparison(baseItem, matchSale, filialStatus, tolerances) {
    const redeAmount = toNumber(baseItem.rede_amount);
    const winthorAmount = matchSale ? toNumber(matchSale.vltotal) : 0;
    const valueDifference = matchSale ? Number((redeAmount - winthorAmount).toFixed(2)) : null;
    const dateDifferenceDays = matchSale ? signedDaysDiff(baseItem.rede_sale_date, matchSale.data) : null;
    const redeNsu = normalizeNsu(baseItem.rede_nsu);
    const winthorNsu = normalizeNsu(matchSale?.nsu);
    const redeDocument = normalizeDoc(baseItem.rede_document);
    let nsuStatus = "NSU_NAO_LOCALIZADO_NO_WINTHOR";
    if (!redeNsu && winthorNsu)
        nsuStatus = "NSU_NAO_LOCALIZADO_NA_REDE";
    else if (redeNsu && winthorNsu)
        nsuStatus = redeNsu === winthorNsu ? "NSU_IGUAL" : "NSU_DIVERGENTE";
    else if (!redeNsu && !winthorNsu)
        nsuStatus = "NSU_NAO_LOCALIZADO_NO_WINTHOR";
    const valueStatus = matchSale && isValueEqual(redeAmount, winthorAmount, tolerances) ? "VALOR_IGUAL" : "VALOR_DIVERGENTE";
    const dateStatus = matchSale && isDateEqual(baseItem.rede_sale_date, matchSale.data, tolerances) ? "DATA_IGUAL" : "DATA_DIVERGENTE";
    let documentStatus = "DOCUMENTO_NAO_LOCALIZADO";
    if (redeDocument && matchSale) {
        documentStatus = matchesDocument(redeDocument, matchSale) ? "DOCUMENTO_IGUAL" : "DOCUMENTO_DIVERGENTE";
    }
    return {
        filial_status: filialStatus,
        nsu_status: nsuStatus,
        value_status: valueStatus,
        date_status: dateStatus,
        document_status: documentStatus,
        value_difference: valueDifference,
        date_difference_days: dateDifferenceDays,
    };
}
function statusReason(status, comparison, matchSale, sourceReason) {
    if (sourceReason)
        return sourceReason;
    if (!matchSale)
        return "Venda da planilha REDE nao encontrada no WinThor para filial/periodo informado.";
    if (status === STATUS.NSU_DIVERGENTE)
        return "Venda provavel localizada, mas o NSU diverge entre REDE e WinThor.";
    if (status === STATUS.VALOR_DIVERGENTE)
        return "Venda localizada, mas valor REDE x WinThor diverge.";
    if (status === STATUS.DATA_DIVERGENTE)
        return "Venda localizada, mas data REDE x WinThor diverge.";
    if (status === STATUS.FILIAL_DIVERGENTE)
        return comparison.filial_status === "FILIAL_NAO_ENCONTRADA"
            ? "CNPJ da coluna X nao foi encontrado na PCFILIAL."
            : "Venda localizada em filial diferente no WinThor.";
    if (status === STATUS.MATCH_PROVAVEL)
        return "Venda parece ser a mesma, mas existe divergencia ou falta identificador principal.";
    if (status === STATUS.ANALISE_MANUAL)
        return "Dados insuficientes para decisao automatica.";
    return "Venda validada no WinThor por filial, identificadores, data e valor.";
}
export class RedeSalesMatchingService {
    logger;
    constructor(logger) {
        this.logger = logger;
    }
    findExactByAmountAndDate(redeRow, filialSales, tolerances) {
        const targetDate = toIsoDate(redeRow.redeSaleDate);
        const targetAmount = toNumber(redeRow.redeAmount);
        return filialSales.filter((sale) => {
            const saleDate = toIsoDate(sale.data);
            const saleAmount = toNumber(sale.vltotal);
            return Boolean(targetDate && saleDate && targetDate === saleDate && isValueEqual(targetAmount, saleAmount, tolerances));
        });
    }
    findProbableByAmountAndDate(redeRow, filialSales, tolerances) {
        const targetAmount = toNumber(redeRow.redeAmount);
        return filialSales.filter((sale) => {
            const diffDays = signedDaysDiff(redeRow.redeSaleDate, sale.data);
            if (diffDays == null || Math.abs(diffDays) > tolerances.tolerancia_dias)
                return false;
            return isValueEqual(targetAmount, toNumber(sale.vltotal), tolerances);
        });
    }
    buildBaseItem(row) {
        return {
            row_number: row.rowNumber,
            branch_cnpj_raw: row.branchCnpjRaw,
            branch_cnpj_normalized: row.branchCnpjNormalized,
            pcfilial_codigo: null,
            pcfilial_cgc: null,
            pcfilial_name: null,
            rede_sale_date: row.redeSaleDate,
            rede_amount: row.redeAmount,
            rede_nsu: row.redeNsu,
            rede_authorization: row.redeAuthorization,
            rede_document: row.redeDocument,
            rede_raw_json: row.redeRawJson,
            winthor_numped: null,
            winthor_numnota: null,
            winthor_codfilial: null,
            winthor_sale_date: null,
            winthor_amount: null,
            winthor_nsu: null,
            winthor_authorization: null,
            winthor_raw_json: null,
            filial_status: "FILIAL_NAO_ENCONTRADA",
            nsu_status: "NSU_NAO_LOCALIZADO_NO_WINTHOR",
            value_status: "VALOR_DIVERGENTE",
            date_status: "DATA_DIVERGENTE",
            document_status: "DOCUMENTO_NAO_LOCALIZADO",
            match_score: 0,
            match_classification: "NAO_ENCONTRADO",
            validation_status: STATUS.ANALISE_MANUAL,
            value_difference: null,
            date_difference_days: null,
            reason: "Item em analise.",
        };
    }
    buildItemFromMatch(baseItem, matchSale, filialStatus, tolerances, reason) {
        const comparison = buildComparison(baseItem, matchSale, filialStatus, tolerances);
        const score = scoreFromComparisons(comparison);
        const matchClassification = classifyScore(score);
        const status = pickGeneralStatus(comparison, matchClassification, matchSale);
        return {
            ...baseItem,
            winthor_numped: matchSale?.numped ?? null,
            winthor_numnota: matchSale?.numnota ?? null,
            winthor_codfilial: matchSale?.codfilial ?? null,
            winthor_sale_date: matchSale?.data ?? null,
            winthor_amount: matchSale?.vltotal ?? null,
            winthor_nsu: matchSale?.nsu ?? null,
            winthor_authorization: matchSale?.codautorizacao ?? null,
            winthor_raw_json: matchSale?.raw ?? null,
            ...comparison,
            match_score: score,
            match_classification: matchClassification,
            validation_status: status,
            reason: statusReason(status, comparison, matchSale, reason),
        };
    }
    buildManualItem(baseItem, status, reason, comparison = {}) {
        const mergedComparison = {
            filial_status: comparison.filial_status ?? baseItem.filial_status,
            nsu_status: comparison.nsu_status ?? baseItem.nsu_status,
            value_status: comparison.value_status ?? baseItem.value_status,
            date_status: comparison.date_status ?? baseItem.date_status,
            document_status: comparison.document_status ?? baseItem.document_status,
        };
        const score = scoreFromComparisons(mergedComparison);
        return {
            ...baseItem,
            ...mergedComparison,
            validation_status: status,
            match_score: score,
            match_classification: classifyScore(score),
            reason,
        };
    }
    async match(payload) {
        const { parsedRows, filialByCnpjMap, winthorSales, winthorItems, findCrossFilialByDocument } = payload;
        const tolerances = resolveTolerances(payload.tolerances);
        const salesByFilial = buildWinthorIndexByFilial(winthorSales);
        const winthorItemIndex = buildWinthorItemIndex(winthorItems);
        const usedWinthorIds = new Set();
        const items = [];
        for (const row of parsedRows) {
            const baseItem = this.buildBaseItem(row);
            const cnpjNormalized = row.branchCnpjNormalized;
            if (!cnpjNormalized) {
                items.push(this.buildManualItem(baseItem, STATUS.FILIAL_DIVERGENTE, "CNPJ da filial vazio na coluna X.", { filial_status: "FILIAL_NAO_ENCONTRADA" }));
                continue;
            }
            const filial = filialByCnpjMap.get(cnpjNormalized);
            if (!filial) {
                items.push(this.buildManualItem(baseItem, STATUS.FILIAL_DIVERGENTE, "CNPJ da coluna X nao foi encontrado na PCFILIAL.", { filial_status: "FILIAL_NAO_ENCONTRADA" }));
                continue;
            }
            baseItem.pcfilial_codigo = filial.codigo;
            baseItem.pcfilial_cgc = filial.cgc;
            baseItem.pcfilial_name = filial.fantasia || filial.razaoSocial || filial.codigo;
            baseItem.filial_status = "FILIAL_LOCALIZADA";
            const filialSales = salesByFilial.get(filial.codigo) ?? [];
            const doc = normalizeDoc(row.redeDocument);
            const nsu = normalizeNsu(row.redeNsu);
            let selectedSale = null;
            let selectedFilialStatus = "FILIAL_LOCALIZADA";
            let selectedReason = "";
            if (doc) {
                const documentMatches = filialSales.filter((sale) => matchesDocument(doc, sale));
                if (documentMatches.length > 1) {
                    items.push(this.buildManualItem(baseItem, STATUS.ANALISE_MANUAL, "Mais de uma venda WinThor encontrada para o mesmo pedido/documento.", { filial_status: "FILIAL_LOCALIZADA" }));
                    continue;
                }
                if (documentMatches.length === 1) {
                    selectedSale = documentMatches[0];
                }
                else {
                    const crossMatches = await findCrossFilialByDocument(doc);
                    if (crossMatches.length > 0) {
                        selectedSale = crossMatches[0];
                        selectedFilialStatus = "FILIAL_DIVERGENTE";
                    }
                }
            }
            if (!selectedSale && nsu) {
                const nsuMatches = filialSales.filter((sale) => matchesNsu(nsu, sale));
                if (nsuMatches.length > 1) {
                    items.push(this.buildManualItem(baseItem, STATUS.ANALISE_MANUAL, "Mais de uma venda WinThor encontrada para o mesmo NSU.", { filial_status: "FILIAL_LOCALIZADA", nsu_status: "NSU_IGUAL" }));
                    continue;
                }
                if (nsuMatches.length === 1) {
                    selectedSale = nsuMatches[0];
                }
            }
            if (!selectedSale) {
                const exactMatches = this.findExactByAmountAndDate(row, filialSales, tolerances);
                if (exactMatches.length === 1) {
                    selectedSale = exactMatches[0];
                }
                else if (exactMatches.length > 1) {
                    items.push(this.buildManualItem(baseItem, STATUS.ANALISE_MANUAL, "Mais de uma venda WinThor encontrada para data/valor.", { filial_status: "FILIAL_LOCALIZADA", value_status: "VALOR_IGUAL", date_status: "DATA_IGUAL" }));
                    continue;
                }
            }
            if (!selectedSale) {
                const probableMatches = this.findProbableByAmountAndDate(row, filialSales, tolerances);
                if (probableMatches.length === 1) {
                    selectedSale = probableMatches[0];
                    selectedReason = "Match provavel por proximidade de data e valor.";
                }
                else if (probableMatches.length > 1) {
                    items.push(this.buildManualItem(baseItem, STATUS.ANALISE_MANUAL, "Mais de um match provavel encontrado. Necessaria analise manual.", { filial_status: "FILIAL_LOCALIZADA" }));
                    continue;
                }
            }
            if (selectedSale) {
                const hasItems = hasWinthorItemsForSale(selectedSale, winthorItemIndex);
                const reason = !hasItems
                    ? "Venda localizada na PCPEDC; sem itens PCPEDI encontrados no periodo para conferencia secundaria."
                    : selectedReason;
                items.push(this.buildItemFromMatch(baseItem, selectedSale, selectedFilialStatus, tolerances, reason));
                usedWinthorIds.add(selectedSale.id);
                continue;
            }
            items.push(this.buildManualItem(baseItem, STATUS.VENDA_REDE_NAO_ENCONTRADA_NO_SISTEMA, "Venda da planilha REDE nao encontrada no WinThor para filial/periodo informado.", {
                filial_status: "FILIAL_LOCALIZADA",
            }));
        }
        const winthorUnmatched = winthorSales
            .filter((sale) => !usedWinthorIds.has(sale.id))
            .map((sale) => ({
            codfilial: sale.codfilial,
            data: sale.data,
            numped: sale.numped,
            numnota: sale.numnota,
            vltotal: sale.vltotal,
            codcli: sale.codcli,
            codcob: sale.codcob,
            nsu: sale.nsu ?? null,
            reason: "Venda do Sistema nao encontrada na planilha REDE.",
            raw_json: sale.raw,
            status: STATUS.VENDA_SISTEMA_NAO_ENCONTRADA_NA_REDE,
        }));
        const totalDivergentAmount = items
            .filter((item) => item.value_status === "VALOR_DIVERGENTE" && item.value_difference != null)
            .reduce((sum, item) => sum + Math.abs(Number(item.value_difference ?? 0)), 0);
        const summary = {
            totalRows: items.length,
            totalSystemRows: winthorSales.length,
            totalValidated: items.filter((item) => item.validation_status === STATUS.VENDA_VALIDADA).length,
            totalBranchNotFound: items.filter((item) => item.filial_status === "FILIAL_NAO_ENCONTRADA").length,
            totalRedeNotFoundWinthor: items.filter((item) => item.validation_status === STATUS.VENDA_REDE_NAO_ENCONTRADA_NO_SISTEMA).length,
            totalWinthorNotFoundRede: winthorUnmatched.length,
            totalNsuDivergence: items.filter((item) => item.nsu_status === "NSU_DIVERGENTE").length,
            totalValueDivergence: items.filter((item) => item.value_status === "VALOR_DIVERGENTE" && item.winthor_amount != null).length,
            totalDateDivergence: items.filter((item) => item.date_status === "DATA_DIVERGENTE" && item.winthor_sale_date != null).length,
            totalFilialDivergence: items.filter((item) => item.validation_status === STATUS.FILIAL_DIVERGENTE).length,
            totalManualReview: items.filter((item) => item.validation_status === STATUS.ANALISE_MANUAL).length,
            totalMatchProvavel: items.filter((item) => item.validation_status === STATUS.MATCH_PROVAVEL).length,
            totalDivergencias: items.filter((item) => isDivergentStatus(item.validation_status)).length,
            totalDivergentAmount: Number(totalDivergentAmount.toFixed(2)),
            compliancePercent: items.length > 0 ? Number(((items.filter((item) => item.validation_status === STATUS.VENDA_VALIDADA).length / items.length) * 100).toFixed(2)) : 100,
            tolerances,
        };
        this.logger.info({
            component: "RedeSalesMatchingService",
            action: "match",
            summary,
        }, "Matching REDE x WinThor finalizado.");
        return {
            items,
            winthorUnmatched,
            summary,
        };
    }
}
