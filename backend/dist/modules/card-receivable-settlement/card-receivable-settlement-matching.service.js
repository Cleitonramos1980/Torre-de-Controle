import { CARD_SETTLEMENT_STATUS as STATUS } from "./enums/settlement-status.js";
const DEFAULT_TOLERANCES = {
    tolerancia_valor_reais: 0.05,
    tolerancia_valor_percentual: 0.01,
    tolerancia_dias_pagamento: 1,
    considerar_valor_aproximado: true,
    considerar_data_proxima: true,
};
function normalizeDigits(value) {
    return String(value ?? "").replace(/\D/g, "");
}
function normalizeDoc(value) {
    const raw = String(value ?? "").trim();
    if (!raw || raw === "-")
        return "";
    return raw.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}
function cleanText(value) {
    const raw = String(value ?? "").trim();
    return raw && raw !== "-" ? raw : null;
}
function toNumber(value) {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}
function round2(value) {
    return Number(value.toFixed(2));
}
function comparableRedeValue(row) {
    return row?.redeGrossAmount != null ? row.redeGrossAmount : row?.redeReceivedAmount;
}
function comparableWinthorValue(row, payment) {
    return row?.redeGrossAmount != null ? payment?.valorOriginal : payment?.valorPago;
}
function toIsoDate(value) {
    if (!value)
        return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()))
        return null;
    return parsed.toISOString().slice(0, 10);
}
function dateDiffDays(a, b) {
    const dateA = toIsoDate(a);
    const dateB = toIsoDate(b);
    if (!dateA || !dateB)
        return null;
    const start = new Date(`${dateA}T00:00:00.000Z`);
    const end = new Date(`${dateB}T00:00:00.000Z`);
    return Math.round((start.getTime() - end.getTime()) / (24 * 60 * 60 * 1000));
}
function isValueEqual(a, b, tolerances) {
    const diff = Math.abs(toNumber(a) - toNumber(b));
    if (diff <= toNumber(tolerances.tolerancia_valor_reais))
        return true;
    if (!tolerances.considerar_valor_aproximado)
        return false;
    const denominator = Math.abs(toNumber(b)) > 0.0001 ? Math.abs(toNumber(b)) : 1;
    return diff / denominator <= toNumber(tolerances.tolerancia_valor_percentual) / 100;
}
function isDateNear(a, b, tolerances) {
    const diff = dateDiffDays(a, b);
    if (diff == null)
        return false;
    if (diff === 0)
        return true;
    return Boolean(tolerances.considerar_data_proxima) && Math.abs(diff) <= toNumber(tolerances.tolerancia_dias_pagamento);
}
function paymentDocs(payment) {
    return [
        payment?.duplic,
        payment?.prest,
        payment?.numnota,
        payment?.numped,
        payment?.numtrans,
        payment?.numtransvenda,
    ].map(normalizeDoc).filter(Boolean);
}
function hasDocumentMatch(row, payment) {
    const doc = normalizeDoc(row?.redeDocument);
    return Boolean(doc && paymentDocs(payment).includes(doc));
}
function hasNsuMatch(row, payment) {
    const redeKeys = [row?.redeNsu, row?.redeAuthorization].map(normalizeDoc).filter(Boolean);
    const winthorKeys = [payment?.nsu, payment?.codautorizacao].map(normalizeDoc).filter(Boolean);
    return redeKeys.some((key) => winthorKeys.includes(key));
}
function hasAuthorizationMatch(row, payment) {
    const redeAuth = normalizeDoc(row?.redeAuthorization);
    const winthorAuth = normalizeDoc(payment?.codautorizacao);
    return Boolean(redeAuth && winthorAuth && redeAuth === winthorAuth);
}
function hasEstablishmentMatch(row, payment) {
    const redeCode = normalizeDigits(row?.establishmentCode);
    const winthorCode = normalizeDigits(payment?.codestabelecimento);
    return Boolean(redeCode && winthorCode && redeCode === winthorCode);
}
function isTitleOpen(payment) {
    const status = String(payment?.statusTitulo ?? "").trim().toUpperCase();
    if (status === "CANCELADO")
        return false;
    if (status === "EM_ABERTO" || status === "PAGO_PARCIAL")
        return true;
    if (!payment?.dtpag)
        return true;
    return toNumber(payment?.valorPago) <= 0;
}
function addToIndex(index, key, payment) {
    if (!key)
        return;
    const current = index.get(key);
    if (current)
        current.push(payment);
    else
        index.set(key, [payment]);
}
function amountCents(value) {
    return Math.round(toNumber(value) * 100);
}
function amountToleranceCents(value, tolerances) {
    const reais = Math.abs(toNumber(tolerances.tolerancia_valor_reais));
    const percentual = tolerances.considerar_valor_aproximado
        ? Math.abs(toNumber(value)) * (Math.abs(toNumber(tolerances.tolerancia_valor_percentual)) / 100)
        : 0;
    return Math.max(0, Math.ceil(Math.max(reais, percentual) * 100));
}
function addDaysIso(isoDate, offset) {
    const date = new Date(`${isoDate}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()))
        return null;
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
}
function uniquePayments(lists) {
    const output = [];
    const seen = new Set();
    for (const list of lists) {
        for (const payment of list ?? []) {
            if (!payment?.id || seen.has(payment.id))
                continue;
            seen.add(payment.id);
            output.push(payment);
        }
    }
    return output;
}
function buildPaymentIndexes(payments) {
    const indexes = {
        byDocument: new Map(),
        byNsu: new Map(),
        byAuthorization: new Map(),
        byDateAmount: new Map(),
    };
    for (const payment of payments) {
        for (const doc of paymentDocs(payment))
            addToIndex(indexes.byDocument, doc, payment);
        addToIndex(indexes.byNsu, normalizeDoc(payment.nsu), payment);
        addToIndex(indexes.byAuthorization, normalizeDoc(payment.codautorizacao), payment);
        for (const date of [toIsoDate(payment.dtpag), toIsoDate(payment.dtemissao)].filter(Boolean)) {
            addToIndex(indexes.byDateAmount, `${date}|${amountCents(payment.valorPago)}`, payment);
            if (payment.valorOriginal != null)
                addToIndex(indexes.byDateAmount, `${date}|${amountCents(payment.valorOriginal)}`, payment);
        }
    }
    return indexes;
}
function saleGroupKey(payment) {
    const nsu = normalizeDoc(payment?.nsu);
    if (nsu) {
        const prest = normalizeDoc(payment?.prest) || "0";
        return `NSU|${nsu}|${prest}`;
    }
    const filial = cleanText(payment?.codfilial) ?? "-";
    const emissao = toIsoDate(payment?.dtemissao) ?? "-";
    const duplic = normalizeDoc(payment?.duplic) || normalizeDoc(payment?.numtransvenda) || normalizeDoc(payment?.numtrans);
    return `VENDA|${filial}|${emissao}|${duplic}`;
}
function buildPaymentGroupStats(payments) {
    const groups = new Map();
    for (const payment of payments) {
        const key = saleGroupKey(payment);
        const current = groups.get(key) ?? {
            key,
            parcelas: 0,
            totalValor: 0,
            totalPago: 0,
            totalAberto: 0,
            titulosAbertos: 0,
            titulosPagos: 0,
            titulosParciais: 0,
        };
        current.parcelas += 1;
        current.totalValor = round2(current.totalValor + toNumber(payment.valorOriginal));
        current.totalPago = round2(current.totalPago + toNumber(payment.valorPago));
        current.totalAberto = round2(current.totalAberto + toNumber(payment.valorAberto));
        const status = String(payment.statusTitulo ?? "").trim().toUpperCase();
        if (status === "PAGO")
            current.titulosPagos += 1;
        else if (status === "PAGO_PARCIAL")
            current.titulosParciais += 1;
        else
            current.titulosAbertos += 1;
        groups.set(key, current);
    }
    return groups;
}
function dateValueCandidates(row, indexes, tolerances) {
    const date = toIsoDate(row.redeSaleDate) ?? toIsoDate(row.redePaymentDate);
    if (!date)
        return [];
    const redeValue = comparableRedeValue(row);
    const cents = amountCents(redeValue);
    const centsRange = amountToleranceCents(redeValue, tolerances);
    const dayRange = Boolean(tolerances.considerar_data_proxima)
        ? Math.max(0, Math.floor(toNumber(tolerances.tolerancia_dias_pagamento)))
        : 0;
    const lists = [];
    for (let day = -dayRange; day <= dayRange; day += 1) {
        const candidateDate = addDaysIso(date, day);
        if (!candidateDate)
            continue;
        for (let amount = cents - centsRange; amount <= cents + centsRange; amount += 1) {
            const list = indexes.byDateAmount.get(`${candidateDate}|${amount}`);
            if (list)
                lists.push(list);
        }
    }
    return uniquePayments(lists);
}
function scopeCandidates(row, candidates, filial, usedPayments) {
    const available = uniquePayments([candidates]).filter((payment) => !usedPayments.has(payment.id));
    const filialCandidates = filial
        ? available.filter((payment) => String(payment.codfilial) === String(filial.codigo))
        : available;
    if (!filial && cleanText(row.establishmentCode)) {
        const establishmentCandidates = filialCandidates.filter((payment) => hasEstablishmentMatch(row, payment));
        if (establishmentCandidates.length > 0)
            return establishmentCandidates;
    }
    return filialCandidates;
}
function comparePayment(row, payment, filial, tolerances) {
    const valueDiff = round2(toNumber(comparableRedeValue(row)) - toNumber(comparableWinthorValue(row, payment)));
    const dateDiff = dateDiffDays(row.redePaymentDate, payment?.dtpag);
    const valueEqual = isValueEqual(comparableRedeValue(row), comparableWinthorValue(row, payment), tolerances);
    const dateNear = isDateNear(row.redePaymentDate, payment?.dtpag, tolerances);
    const dateEqual = dateDiff === 0;
    const documentMatch = hasDocumentMatch(row, payment);
    const nsuMatch = hasNsuMatch(row, payment) || hasAuthorizationMatch(row, payment);
    const filialMatch = filial?.codigo && String(payment?.codfilial ?? "").trim() === String(filial.codigo).trim();
    const establishmentMatch = hasEstablishmentMatch(row, payment);
    let score = 0;
    if (filialMatch || establishmentMatch)
        score += 25;
    if (valueEqual)
        score += 25;
    if (dateNear)
        score += 20;
    if (documentMatch)
        score += 15;
    if (nsuMatch) {
        if (filialMatch || establishmentMatch)
            score += 45;
        else
            score += 15;
    }
    return {
        score: Math.max(0, Math.min(100, score)),
        valueDiff,
        dateDiff,
        valueEqual,
        dateNear,
        dateEqual,
        documentMatch,
        nsuMatch,
        filialMatch,
        establishmentMatch,
    };
}
function classify(score) {
    if (score >= 90)
        return "MATCH_FORTE";
    if (score >= 70)
        return "MATCH_PROVAVEL";
    if (score >= 50)
        return "MATCH_FRACO";
    return "NAO_ENCONTRADO";
}
function mapPendenciaToStatus(motivo) {
    if (motivo === "VINCULO_DUPLICADO")
        return STATUS.VINCULO_DUPLICADO;
    if (motivo === "FILIAL_DIVERGENTE")
        return STATUS.FILIAL_DIVERGENTE;
    if (motivo === "SEM_VINCULO_FILIAL" ||
        motivo === "ESTABELECIMENTO_AUSENTE" ||
        motivo === "CODIGO_ESTABELECIMENTO_INVALIDO") {
        return STATUS.FILIAL_NAO_ENCONTRADA;
    }
    return STATUS.PENDENTE_VINCULO_FILIAL;
}
const BLOCKING_FILIAL_STATUSES = new Set([
    STATUS.FILIAL_NAO_ENCONTRADA,
    STATUS.FILIAL_DIVERGENTE,
    STATUS.VINCULO_DUPLICADO,
    STATUS.PENDENTE_VINCULO_FILIAL,
]);
function buildSummary(items, winthorRows, unmatched, tolerances, establishmentCoverage) {
    const usesGrossTitleValue = items.some((item) => item.rede_gross_amount != null);
    const totalRedeAmount = round2(items.reduce((sum, item) => sum + toNumber(item.rede_received_amount), 0));
    const totalWinthorPaidAmount = round2(winthorRows.reduce((sum, item) => sum + toNumber(usesGrossTitleValue ? item.valorOriginal : item.valorPago), 0));
    const totalDifferenceAmount = round2(items.reduce((sum, item) => sum + toNumber(item.value_difference), 0));
    const totalConciliated = items.filter((item) => item.validation_status === STATUS.RECEBIMENTO_CONCILIADO).length;
    const totalRows = items.length;
    const totalEstablishmentsUniqueByItems = new Set(items.map((item) => String(item.codigo_estabelecimento_rede ?? "").trim()).filter(Boolean)).size;
    const totalEstablishmentsUniqueByWorkbook = Number(establishmentCoverage?.totalUniqueCodes ?? 0);
    const totalEstablishmentsUnique = Math.max(totalEstablishmentsUniqueByItems, totalEstablishmentsUniqueByWorkbook);
    const totalEstablishmentsLocated = new Set(items
        .filter((item) => item.filial_id && item.codigo_estabelecimento_rede)
        .map((item) => `${item.codigo_estabelecimento_rede}|${item.filial_codigo ?? item.filial_id}`)).size;
    const totalFilialByVendaOriginal = items.filter((item) => item.origem_resolucao_filial === "VENDA_ORIGINAL").length;
    const totalFilialByEstabelecimentoRede = items.filter((item) => item.origem_resolucao_filial === "ESTABELECIMENTO_REDE").length;
    const totalFilialByNome = items.filter((item) => item.origem_resolucao_filial === "NOME_ESTABELECIMENTO" || item.origem_resolucao_filial === "MAQUININHA_FILIAL").length;
    const totalSemFilial = items.filter((item) => !item.filial_id).length;
    const totalDivergenciaFilial = items.filter((item) => item.validation_status === STATUS.FILIAL_DIVERGENTE).length;
    const totalBloqueado = items.filter((item) => BLOCKING_FILIAL_STATUSES.has(item.validation_status)).length;
    return {
        totalRedeRows: totalRows,
        totalEstablishmentsUnique,
        totalEstablishmentsLocated,
        totalFilialByVendaOriginal,
        totalFilialByEstabelecimentoRede,
        totalFilialByNome,
        totalSemFilial,
        totalDivergenciaFilial,
        totalBloqueado,
        totalWinthorRows: winthorRows.length,
        totalConciliated,
        totalRedeNotFoundWinthor: items.filter((item) => item.validation_status === STATUS.RECEBIMENTO_REDE_NAO_ENCONTRADO_WINTHOR).length,
        totalWinthorNotFoundRede: unmatched.length,
        totalValueDivergence: items.filter((item) => item.value_status === "VALOR_RECEBIDO_DIVERGENTE").length,
        totalDateDivergence: items.filter((item) => item.date_status === "DATA_PAGAMENTO_DIVERGENTE").length,
        totalTitlePendingSettlement: items.filter((item) => item.validation_status === STATUS.TITULO_LOCALIZADO_PENDENTE_BAIXA).length,
        totalBranchNotFound: items.filter((item) => item.filial_status === "FILIAL_NAO_ENCONTRADA").length,
        totalBankDivergence: 0,
        totalManualReview: items.filter((item) => item.validation_status === STATUS.ANALISE_MANUAL).length,
        totalRedeAmount,
        totalWinthorPaidAmount,
        totalDifferenceAmount,
        conformityPercentage: totalRows > 0 ? round2((totalConciliated / totalRows) * 100) : 0,
        tolerances,
    };
}
export class CardReceivableSettlementMatchingService {
    logger;
    constructor(logger) {
        this.logger = logger;
    }
    resolveTolerances(input = {}) {
        return {
            tolerancia_valor_reais: Number(input.tolerancia_valor_reais ?? DEFAULT_TOLERANCES.tolerancia_valor_reais),
            tolerancia_valor_percentual: Number(input.tolerancia_valor_percentual ?? DEFAULT_TOLERANCES.tolerancia_valor_percentual),
            tolerancia_dias_pagamento: Number(input.tolerancia_dias_pagamento ?? DEFAULT_TOLERANCES.tolerancia_dias_pagamento),
            considerar_valor_aproximado: input.considerar_valor_aproximado == null ? DEFAULT_TOLERANCES.considerar_valor_aproximado : String(input.considerar_valor_aproximado) !== "false",
            considerar_data_proxima: input.considerar_data_proxima == null ? DEFAULT_TOLERANCES.considerar_data_proxima : String(input.considerar_data_proxima) !== "false",
        };
    }
    buildBaseItem(row, resolvedFilial) {
        return {
            row_number: row.rowNumber,
            branch_cnpj_raw: row.branchCnpjRaw,
            branch_cnpj_normalized: row.branchCnpjNormalized,
            pcfilial_codigo: resolvedFilial?.filialCodigo ?? null,
            filial_rede_codigo: resolvedFilial?.filialCodigo ?? null,
            pcfilial_name: null,
            filial_id: resolvedFilial?.filialId ?? null,
            filial_codigo: resolvedFilial?.filialCodigo ?? null,
            codigo_estabelecimento_rede: resolvedFilial?.codigoEstabelecimentoRede ?? row.establishmentCode ?? null,
            nome_estabelecimento_rede: resolvedFilial?.nomeEstabelecimentoRede ?? row.establishmentName ?? null,
            nome_maquininha: resolvedFilial?.nomeMaquininha ?? null,
            numero_maquininha: resolvedFilial?.numeroMaquininha ?? null,
            regional: resolvedFilial?.regional ?? null,
            cnpj_filial: resolvedFilial?.cnpjFilial ?? null,
            venda_id: resolvedFilial?.vendaId ?? null,
            origem_resolucao_filial: resolvedFilial?.origemResolucaoFilial ?? "PENDENTE",
            pendencia_motivo: resolvedFilial?.pendencia?.motivo ?? null,
            pendencia_detalhe: resolvedFilial?.pendencia?.detalhe ?? null,
            rede_payment_date: row.redePaymentDate,
            rede_sale_date: row.redeSaleDate,
            rede_gross_amount: row.redeGrossAmount,
            rede_net_amount: row.redeNetAmount,
            rede_received_amount: row.redeReceivedAmount,
            rede_nsu: row.redeNsu,
            rede_authorization: row.redeAuthorization,
            rede_tid: row.redeTid,
            rede_card_number: row.redeCardNumber,
            rede_batch_number: row.redeBatchNumber,
            rede_modalidade: row.redeModalidade,
            rede_bandeira: row.redeBandeira,
            rede_installments: row.redeInstallments,
            rede_installment: row.redeInstallment,
            rede_document: row.redeDocument,
            rede_raw_json: row.redeRawJson,
            source_sheet_name: row.sourceSheetName ?? null,
            winthor_codfilial: null,
            winthor_codcli: null,
            winthor_cliente: null,
            winthor_duplic: null,
            winthor_prest: null,
            winthor_numped: null,
            winthor_numnota: null,
            winthor_dt_emissao: null,
            winthor_dt_venc: null,
            winthor_dt_pag: null,
            winthor_valor_original: null,
            winthor_valor_pago: null,
            winthor_valor_aberto: null,
            winthor_codbanco: null,
            winthor_codcob: null,
            winthor_cobranca: null,
            winthor_codestabelecimento: null,
            winthor_nsu: null,
            winthor_authorization: null,
            winthor_status_titulo: null,
            winthor_title_open: null,
            winthor_sale_group_key: null,
            winthor_parcelas_venda: null,
            winthor_total_venda: null,
            winthor_total_pago_venda: null,
            winthor_total_aberto_venda: null,
            winthor_titulos_abertos_venda: null,
            winthor_titulos_pagos_venda: null,
            winthor_titulos_parciais_venda: null,
            winthor_raw_json: null,
            filial_status: resolvedFilial?.found ? "FILIAL_LOCALIZADA" : "FILIAL_NAO_ENCONTRADA",
            date_status: "DATA_PAGAMENTO_NAO_LOCALIZADA",
            value_status: "VALOR_RECEBIDO_NAO_LOCALIZADO",
            gross_value_status: "VALOR_BRUTO_NAO_COMPARAVEL",
            nsu_status: cleanText(row.redeNsu) || cleanText(row.redeAuthorization) ? "NSU_NAO_LOCALIZADO_NO_WINTHOR" : "NSU_NAO_DISPONIVEL",
            document_status: cleanText(row.redeDocument) ? "DOCUMENTO_NAO_LOCALIZADO" : "DOCUMENTO_NAO_DISPONIVEL",
            bank_status: "BANCO_NAO_APLICAVEL",
            match_score: 0,
            match_classification: "NAO_ENCONTRADO",
            validation_status: resolvedFilial?.found ? STATUS.RECEBIMENTO_REDE_NAO_ENCONTRADO_WINTHOR : mapPendenciaToStatus(resolvedFilial?.pendencia?.motivo),
            value_difference: null,
            date_difference_days: null,
            reason: resolvedFilial?.found
                ? "Recebimento da Rede nao localizado na PCPREST."
                : (resolvedFilial?.pendencia?.detalhe ?? "Filial nao localizada para o recebimento da Rede."),
        };
    }
    applyPayment(baseItem, row, payment, filial, comparison, tolerances, groupStats) {
        const valueStatus = comparison.valueEqual
            ? (Math.abs(comparison.valueDiff) <= Number.EPSILON ? "VALOR_RECEBIDO_IGUAL" : "VALOR_RECEBIDO_APROXIMADO")
            : "VALOR_RECEBIDO_DIVERGENTE";
        const dateStatus = comparison.dateEqual
            ? "DATA_PAGAMENTO_IGUAL"
            : comparison.dateNear
                ? "DATA_PAGAMENTO_PROXIMA"
                : "DATA_PAGAMENTO_DIVERGENTE";
        let grossStatus = "VALOR_BRUTO_NAO_COMPARAVEL";
        if (row.redeGrossAmount != null && payment?.valorOriginal != null) {
            grossStatus = isValueEqual(row.redeGrossAmount, payment.valorOriginal, tolerances)
                ? "VALOR_BRUTO_IGUAL"
                : "VALOR_BRUTO_DIVERGENTE";
        }
        const documentStatus = cleanText(row.redeDocument)
            ? (comparison.documentMatch ? "DOCUMENTO_IGUAL" : "DOCUMENTO_DIVERGENTE")
            : "DOCUMENTO_NAO_DISPONIVEL";
        const nsuStatus = cleanText(row.redeNsu) || cleanText(row.redeAuthorization)
            ? (comparison.nsuMatch ? "NSU_IGUAL" : "NSU_NAO_LOCALIZADO_NO_WINTHOR")
            : "NSU_NAO_DISPONIVEL";
        let validationStatus = STATUS.ANALISE_MANUAL;
        const bankStatus = cleanText(payment.codbanco) ? "BANCO_INFORMATIVO" : "BANCO_NAO_LOCALIZADO";
        const titleOpen = isTitleOpen(payment);
        if (titleOpen) {
            validationStatus = STATUS.TITULO_LOCALIZADO_PENDENTE_BAIXA;
        }
        if (filial?.codigo && !comparison.filialMatch) {
            validationStatus = STATUS.FILIAL_DIVERGENTE;
        }
        else if (!comparison.valueEqual) {
            validationStatus = STATUS.VALOR_RECEBIDO_DIVERGENTE;
        }
        else if (!comparison.dateNear) {
            validationStatus = STATUS.DATA_PAGAMENTO_DIVERGENTE;
        }
        else if (comparison.score >= 90) {
            validationStatus = STATUS.RECEBIMENTO_CONCILIADO;
        }
        else if (comparison.score >= 70) {
            validationStatus = STATUS.MATCH_PROVAVEL;
        }
        const reasonParts = [];
        if (validationStatus === STATUS.RECEBIMENTO_CONCILIADO)
            reasonParts.push("Recebimento conciliado com PCPREST.");
        if (validationStatus === STATUS.TITULO_LOCALIZADO_PENDENTE_BAIXA)
            reasonParts.push("Titulo localizado na PCPREST por NSUTEF/CV, porem ainda pendente de baixa financeira.");
        if (validationStatus === STATUS.FILIAL_DIVERGENTE)
            reasonParts.push("Titulo localizado, mas a filial do titulo diverge da filial resolvida para o recebimento.");
        if (valueStatus === "VALOR_RECEBIDO_DIVERGENTE")
            reasonParts.push(row.redeGrossAmount != null
                ? "Valor bruto da parcela Rede x PCPREST.VALOR divergente."
                : "Valor recebido Rede x PCPREST.VALORPAGO divergente.");
        if (dateStatus === "DATA_PAGAMENTO_DIVERGENTE")
            reasonParts.push("Data de recebimento Rede x PCPREST.DTPAG divergente.");
        if (documentStatus === "DOCUMENTO_DIVERGENTE")
            reasonParts.push("Documento/titulo nao bate diretamente.");
        if (nsuStatus === "NSU_NAO_LOCALIZADO_NO_WINTHOR")
            reasonParts.push("NSU/autorizacao nao localizado em PCPREST.");
        if (validationStatus === STATUS.MATCH_PROVAVEL || validationStatus === STATUS.ANALISE_MANUAL)
            reasonParts.push("Correspondencia provavel por data/valor; revisar origem.");
        return {
            ...baseItem,
            pcfilial_codigo: filial?.codigo ?? baseItem.pcfilial_codigo ?? (comparison.establishmentMatch ? payment.codfilial : baseItem.pcfilial_codigo),
            filial_rede_codigo: baseItem.filial_rede_codigo ?? baseItem.filial_codigo ?? filial?.codigo ?? null,
            pcfilial_name: filial?.fantasia || filial?.razaoSocial || baseItem.pcfilial_name,
            filial_id: baseItem.filial_id ?? filial?.codigo ?? payment.codfilial ?? null,
            filial_codigo: baseItem.filial_codigo ?? filial?.codigo ?? payment.codfilial ?? null,
            winthor_codfilial: payment.codfilial,
            winthor_codcli: payment.codcli,
            winthor_cliente: payment.cliente,
            winthor_duplic: payment.duplic,
            winthor_prest: payment.prest,
            winthor_numped: payment.numped,
            winthor_numnota: payment.numnota,
            winthor_dt_emissao: payment.dtemissao,
            winthor_dt_venc: payment.dtvenc,
            winthor_dt_pag: payment.dtpag,
            winthor_valor_original: payment.valorOriginal,
            winthor_valor_pago: payment.valorPago,
            winthor_valor_aberto: payment.valorAberto,
            winthor_codbanco: payment.codbanco,
            winthor_codcob: payment.codcob,
            winthor_cobranca: payment.cobranca,
            winthor_codestabelecimento: payment.codestabelecimento,
            winthor_nsu: payment.nsu,
            winthor_authorization: payment.codautorizacao,
            winthor_status_titulo: payment.statusTitulo,
            winthor_title_open: titleOpen,
            winthor_sale_group_key: groupStats?.key ?? saleGroupKey(payment),
            winthor_parcelas_venda: groupStats?.parcelas ?? 1,
            winthor_total_venda: groupStats?.totalValor ?? payment.valorOriginal,
            winthor_total_pago_venda: groupStats?.totalPago ?? payment.valorPago,
            winthor_total_aberto_venda: groupStats?.totalAberto ?? payment.valorAberto,
            winthor_titulos_abertos_venda: groupStats?.titulosAbertos ?? (titleOpen ? 1 : 0),
            winthor_titulos_pagos_venda: groupStats?.titulosPagos ?? (titleOpen ? 0 : 1),
            winthor_titulos_parciais_venda: groupStats?.titulosParciais ?? 0,
            winthor_raw_json: payment.raw,
            filial_status: filial ? (comparison.filialMatch ? "FILIAL_LOCALIZADA" : "FILIAL_DIVERGENTE") : comparison.establishmentMatch ? "FILIAL_LOCALIZADA" : baseItem.filial_status,
            date_status: dateStatus,
            value_status: valueStatus,
            gross_value_status: grossStatus,
            nsu_status: nsuStatus,
            document_status: documentStatus,
            bank_status: bankStatus,
            match_score: comparison.score,
            match_classification: classify(comparison.score),
            validation_status: validationStatus,
            value_difference: comparison.valueDiff,
            date_difference_days: comparison.dateDiff,
            reason: reasonParts.join(" ") || "Dados insuficientes para decisao automatica.",
        };
    }
    rankCandidates(row, candidates, filial, tolerances) {
        const scored = candidates.map((payment) => ({
            payment,
            comparison: comparePayment(row, payment, filial, tolerances),
        }));
        scored.sort((a, b) => {
            if (b.comparison.score !== a.comparison.score)
                return b.comparison.score - a.comparison.score;
            const valueA = Math.abs(a.comparison.valueDiff ?? 999999);
            const valueB = Math.abs(b.comparison.valueDiff ?? 999999);
            if (valueA !== valueB)
                return valueA - valueB;
            return Math.abs(a.comparison.dateDiff ?? 999) - Math.abs(b.comparison.dateDiff ?? 999);
        });
        return scored[0] ?? null;
    }
    async match(payload) {
        const tolerances = this.resolveTolerances(payload.tolerances);
        const { parsedRows, winthorPayments } = payload;
        const indexes = buildPaymentIndexes(winthorPayments);
        const paymentGroupStats = buildPaymentGroupStats(winthorPayments);
        const usedPayments = new Set();
        const items = [];
        for (const row of parsedRows) {
            const resolvedFilial = typeof payload.resolveFilial === "function"
                ? payload.resolveFilial(row)
                : {
                    found: false,
                    pendencia: { motivo: "SEM_VINCULO_FILIAL", detalhe: "Resolver de filial indisponivel." },
                    origemResolucaoFilial: "PENDENTE",
                };
            const filial = resolvedFilial?.found
                ? {
                    codigo: resolvedFilial.filialCodigo,
                    fantasia: resolvedFilial.filialCodigo,
                    razaoSocial: null,
                }
                : null;
            const baseItem = this.buildBaseItem(row, resolvedFilial);
            if (!resolvedFilial?.found) {
                items.push({
                    ...baseItem,
                    validation_status: mapPendenciaToStatus(resolvedFilial?.pendencia?.motivo),
                    reason: resolvedFilial?.pendencia?.detalhe ?? baseItem.reason,
                });
                continue;
            }
            const docCandidates = cleanText(row.redeDocument)
                ? scopeCandidates(row, indexes.byDocument.get(normalizeDoc(row.redeDocument)) ?? [], filial, usedPayments)
                : [];
            const nsuKeys = [row.redeNsu, row.redeAuthorization].map(normalizeDoc).filter(Boolean);
            const nsuCandidates = nsuKeys.length > 0
                ? scopeCandidates(row, uniquePayments(nsuKeys.flatMap((key) => [
                    indexes.byNsu.get(key) ?? [],
                    indexes.byAuthorization.get(key) ?? [],
                ])), filial, usedPayments)
                : [];
            const valueCandidates = scopeCandidates(row, dateValueCandidates(row, indexes, tolerances), filial, usedPayments);
            const candidatesBase = nsuCandidates.length > 0 ? nsuCandidates : docCandidates.length > 0 ? docCandidates : valueCandidates;
            const vendaOrigemCandidate = resolvedFilial?.vendaId
                ? winthorPayments.find((payment) => String(payment.id) === String(resolvedFilial.vendaId)) ?? null
                : null;
            const candidates = vendaOrigemCandidate
                ? uniquePayments([[vendaOrigemCandidate], candidatesBase])
                : candidatesBase;
            const ranked = this.rankCandidates(row, candidates, filial, tolerances);
            if (!ranked) {
                items.push(baseItem);
                continue;
            }
            usedPayments.add(ranked.payment.id);
            let item = this.applyPayment(baseItem, row, ranked.payment, filial, ranked.comparison, tolerances, paymentGroupStats.get(saleGroupKey(ranked.payment)));
            if (candidates.length > 1 && item.validation_status !== STATUS.RECEBIMENTO_CONCILIADO) {
                item = {
                    ...item,
                    reason: `${item.reason} Mais de uma baixa PCPREST candidata encontrada para data/valor/documento.`,
                };
            }
            items.push(item);
        }
        const unmatched = winthorPayments
            .filter((payment) => !usedPayments.has(payment.id))
            .map((payment) => ({
            codfilial: payment.codfilial,
            codcli: payment.codcli,
            cliente: payment.cliente,
            documento_cliente: payment.documentoCliente,
            duplic: payment.duplic,
            prest: payment.prest,
            numped: payment.numped,
            numnota: payment.numnota,
            dtpag: payment.dtpag,
            valor_pago: payment.valorPago,
            codbanco: payment.codbanco,
            codcob: payment.codcob,
            cobranca: payment.cobranca,
            reason: "Titulo PCPREST nao encontrado na planilha de recebimentos da Rede.",
            status: STATUS.BAIXA_WINTHOR_NAO_ENCONTRADA_REDE,
            raw_json: payment.raw,
        }));
        return {
            items,
            winthorUnmatched: unmatched,
            summary: buildSummary(items, winthorPayments, unmatched, tolerances, payload.establishmentCoverage),
        };
    }
}
