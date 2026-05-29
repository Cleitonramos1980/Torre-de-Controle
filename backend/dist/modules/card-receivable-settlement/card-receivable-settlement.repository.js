import { randomUUID } from "node:crypto";
import { db } from "../../repositories/dataStore.js";
import { CARD_SETTLEMENT_STATUS as STATUS } from "./enums/settlement-status.js";
function nowIso() {
    return new Date().toISOString();
}
function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
function toBool(value) {
    if (value === true || value === false)
        return value;
    if (value == null)
        return false;
    const normalized = String(value).trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "sim" || normalized === "yes";
}
function toIsoDate(value) {
    if (!value)
        return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()))
        return null;
    return parsed.toISOString().slice(0, 10);
}
function formatDateDisplay(value) {
    const iso = toIsoDate(value);
    if (!iso)
        return "";
    return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
function formatMoneyDisplay(value) {
    const parsed = toNumber(value);
    if (parsed == null)
        return "";
    return parsed.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function normalizeSearch(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}
function statusLabel(value) {
    return String(value ?? "").replace(/_/g, " ");
}
const ITEM_FILTER_COLUMNS = [
    "colLinha",
    "colCnpjRede",
    "colFilialWinthor",
    "colFilialRede",
    "colDataRede",
    "colDataWinthor",
    "colStatusData",
    "colValorRede",
    "colValorWinthor",
    "colDiferenca",
    "colStatusValor",
    "colNsuRede",
    "colNsuSistema",
    "colDocumentoRede",
    "colDuplicata",
    "colPrestacao",
    "colPedido",
    "colNota",
    "colBanco",
    "colStatusTitulo",
    "colDtEmissao",
    "colDtVenc",
    "colValorAberto",
    "colParcelasVenda",
    "colTotalVenda",
    "colTotalAberto",
    "colStatusBanco",
    "colScore",
    "colStatusGeral",
    "colMotivo",
];
function displayOrDash(value) {
    if (value == null || String(value).trim().length === 0)
        return "-";
    return String(value);
}
function columnDisplayValue(item, key) {
    const redeAmount = item.rede_gross_amount ?? item.rede_received_amount;
    const winthorAmount = item.winthor_valor_original ?? item.winthor_valor_pago;
    switch (key) {
        case "colLinha":
            return displayOrDash(item.row_number);
        case "colCnpjRede":
            return displayOrDash(item.branch_cnpj_raw);
        case "colFilialWinthor":
            return displayOrDash(item.winthor_codfilial);
        case "colFilialRede":
            return displayOrDash(item.filial_rede_codigo ?? item.filial_codigo ?? item.pcfilial_codigo);
        case "colDataRede":
            return displayOrDash(formatDateDisplay(item.rede_payment_date));
        case "colDataWinthor":
            return displayOrDash(formatDateDisplay(item.winthor_dt_pag));
        case "colStatusData":
            return displayOrDash(item.date_status);
        case "colValorRede":
            return displayOrDash(formatMoneyDisplay(redeAmount));
        case "colValorWinthor":
            return displayOrDash(formatMoneyDisplay(winthorAmount));
        case "colDiferenca":
            return displayOrDash(formatMoneyDisplay(item.value_difference));
        case "colStatusValor":
            return displayOrDash(item.value_status);
        case "colNsuRede":
            return displayOrDash(item.rede_nsu);
        case "colNsuSistema":
            return displayOrDash(item.winthor_nsu);
        case "colDocumentoRede":
            return displayOrDash(item.rede_document);
        case "colDuplicata":
            return displayOrDash(item.winthor_duplic);
        case "colPrestacao":
            return displayOrDash(item.winthor_prest);
        case "colPedido":
            return displayOrDash(item.winthor_numped);
        case "colNota":
            return displayOrDash(item.winthor_numnota);
        case "colBanco":
            return displayOrDash(item.winthor_codbanco);
        case "colStatusTitulo":
            return displayOrDash(item.winthor_status_titulo);
        case "colDtEmissao":
            return displayOrDash(formatDateDisplay(item.winthor_dt_emissao));
        case "colDtVenc":
            return displayOrDash(formatDateDisplay(item.winthor_dt_venc));
        case "colValorAberto":
            return displayOrDash(formatMoneyDisplay(item.winthor_valor_aberto));
        case "colParcelasVenda":
            return displayOrDash(item.winthor_parcelas_venda);
        case "colTotalVenda":
            return displayOrDash(formatMoneyDisplay(item.winthor_total_venda));
        case "colTotalAberto":
            return displayOrDash(formatMoneyDisplay(item.winthor_total_aberto_venda));
        case "colStatusBanco":
            return displayOrDash(item.bank_status);
        case "colScore":
            return displayOrDash(item.match_score);
        case "colStatusGeral":
            return displayOrDash(statusLabel(item.validation_status));
        case "colMotivo":
            return displayOrDash(item.reason);
        default:
            return "-";
    }
}
function parseColumnFilters(value) {
    if (!value)
        return {};
    try {
        const parsed = typeof value === "string" ? JSON.parse(value) : value;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
            return {};
        return Object.fromEntries(Object.entries(parsed)
            .filter(([key, values]) => ITEM_FILTER_COLUMNS.includes(key) && (Array.isArray(values) || Array.isArray(values?.values)))
            .map(([key, values]) => {
            if (Array.isArray(values))
                return [key, { mode: "include", values: values.map((item) => String(item)) }];
            return [key, { mode: values.mode === "exclude" ? "exclude" : "include", values: values.values.map((item) => String(item)) }];
        }));
    }
    catch {
        return {};
    }
}
function applyColumnSelectionFilters(item, columnFilters) {
    for (const [key, filter] of Object.entries(columnFilters)) {
        const selectedValues = Array.isArray(filter?.values) ? filter.values : [];
        if (!filter || typeof filter !== "object")
            continue;
        if (filter.mode !== "exclude" && selectedValues.length === 0)
            return false;
        const displayValue = normalizeSearch(columnDisplayValue(item, key));
        const matches = selectedValues.some((value) => normalizeSearch(value) === displayValue);
        if (filter.mode === "exclude" && matches)
            return false;
        if (filter.mode !== "exclude" && !matches)
            return false;
    }
    return true;
}
function contentMatches(needle, values) {
    const normalizedNeedle = normalizeSearch(needle);
    if (!normalizedNeedle)
        return true;
    return values.some((value) => normalizeSearch(value).includes(normalizedNeedle));
}
function applyColumnContentFilters(item, query) {
    const redeAmount = item.rede_gross_amount ?? item.rede_received_amount;
    const winthorAmount = item.winthor_valor_original ?? item.winthor_valor_pago;
    const filters = [
        ["colLinha", [item.row_number]],
        ["colCnpjRede", [item.branch_cnpj_raw, item.branch_cnpj_normalized]],
        ["colFilialWinthor", [item.winthor_codfilial]],
        ["colFilialRede", [item.filial_rede_codigo, item.filial_codigo, item.pcfilial_codigo]],
        ["colDataRede", [item.rede_payment_date, formatDateDisplay(item.rede_payment_date)]],
        ["colDataWinthor", [item.winthor_dt_pag, formatDateDisplay(item.winthor_dt_pag)]],
        ["colStatusData", [item.date_status, statusLabel(item.date_status)]],
        ["colValorRede", [redeAmount, formatMoneyDisplay(redeAmount)]],
        ["colValorWinthor", [winthorAmount, formatMoneyDisplay(winthorAmount)]],
        ["colDiferenca", [item.value_difference, formatMoneyDisplay(item.value_difference)]],
        ["colStatusValor", [item.value_status, statusLabel(item.value_status)]],
        ["colNsuRede", [item.rede_nsu]],
        ["colNsuSistema", [item.winthor_nsu]],
        ["colDocumentoRede", [item.rede_document]],
        ["colDuplicata", [item.winthor_duplic]],
        ["colPrestacao", [item.winthor_prest]],
        ["colPedido", [item.winthor_numped]],
        ["colNota", [item.winthor_numnota]],
        ["colBanco", [item.winthor_codbanco]],
        ["colStatusTitulo", [item.winthor_status_titulo]],
        ["colDtEmissao", [item.winthor_dt_emissao, formatDateDisplay(item.winthor_dt_emissao)]],
        ["colDtVenc", [item.winthor_dt_venc, formatDateDisplay(item.winthor_dt_venc)]],
        ["colValorAberto", [item.winthor_valor_aberto, formatMoneyDisplay(item.winthor_valor_aberto)]],
        ["colParcelasVenda", [item.winthor_parcelas_venda]],
        ["colTotalVenda", [item.winthor_total_venda, formatMoneyDisplay(item.winthor_total_venda)]],
        ["colTotalAberto", [item.winthor_total_aberto_venda, formatMoneyDisplay(item.winthor_total_aberto_venda)]],
        ["colStatusBanco", [item.bank_status, statusLabel(item.bank_status)]],
        ["colScore", [item.match_score]],
        ["colStatusGeral", [item.validation_status, statusLabel(item.validation_status)]],
        ["colMotivo", [item.reason]],
    ];
    return filters.every(([key, values]) => contentMatches(query[key], values));
}
function isDivergenceStatus(status) {
    return status !== STATUS.RECEBIMENTO_CONCILIADO;
}
function isEligibleForSettlementConfirmation(item) {
    if (!item)
        return false;
    if (item.value_status !== "VALOR_RECEBIDO_IGUAL" && item.value_status !== "VALOR_RECEBIDO_APROXIMADO")
        return false;
    const validationStatus = String(item.validation_status ?? "");
    const allowedStatuses = new Set([
        STATUS.TITULO_LOCALIZADO_PENDENTE_BAIXA,
        STATUS.RECEBIMENTO_CONCILIADO,
        STATUS.MATCH_PROVAVEL,
    ]);
    if (!allowedStatuses.has(validationStatus))
        return false;
    const titleOpenFlag = item.winthor_title_open === true ||
        String(item.winthor_status_titulo ?? "").trim().toUpperCase() === "EM_ABERTO" ||
        String(item.winthor_status_titulo ?? "").trim().toUpperCase() === "PAGO_PARCIAL" ||
        !item.winthor_dt_pag ||
        toNumber(item.winthor_valor_aberto) > 0;
    if (!titleOpenFlag)
        return false;
    if (!String(item.winthor_codcli ?? "").trim())
        return false;
    if (!String(item.winthor_duplic ?? "").trim())
        return false;
    return true;
}
function settlementComparableValue(item) {
    const value = item.rede_gross_amount ?? item.rede_received_amount;
    const parsed = toNumber(value);
    return parsed == null ? 0 : parsed;
}
function settlementMatchKey(item) {
    return [
        String(item.winthor_codcli ?? "").trim(),
        String(item.winthor_duplic ?? "").trim().toUpperCase(),
        String(item.winthor_prest ?? "").trim().toUpperCase(),
    ].join("|");
}
function buildAmbiguityMaps(rows) {
    const byMatchKey = new Map();
    const byNsu = new Map();
    for (const item of rows) {
        const key = settlementMatchKey(item);
        if (key !== "||") {
            byMatchKey.set(key, (byMatchKey.get(key) ?? 0) + 1);
        }
        const nsu = String(item.rede_nsu ?? item.winthor_nsu ?? "").trim();
        if (nsu) {
            byNsu.set(nsu, (byNsu.get(nsu) ?? 0) + 1);
        }
    }
    return { byMatchKey, byNsu };
}
function buildCandidateExplainability(item, isAmbiguous) {
    const score = Number(item.match_score ?? 0);
    const evidencias = [
        {
            tipo: "VALOR",
            status: String(item.value_status ?? "NAO_CLASSIFICADO"),
            peso: item.value_status === "VALOR_RECEBIDO_IGUAL" ? 40 : item.value_status === "VALOR_RECEBIDO_APROXIMADO" ? 30 : 0,
            detalhe: `Diferenca: ${Number(item.value_difference ?? 0).toFixed(2)}`,
        },
        {
            tipo: "DATA",
            status: String(item.date_status ?? "NAO_CLASSIFICADO"),
            peso: item.date_status === "DATA_PAGAMENTO_IGUAL" ? 20 : item.date_status === "DATA_PAGAMENTO_PROXIMA" ? 10 : 0,
            detalhe: `Data Rede ${item.rede_payment_date ?? "-"} / WinThor ${item.winthor_dt_pag ?? "-"}`,
        },
        {
            tipo: "NSU",
            status: String(item.nsu_status ?? "NAO_CLASSIFICADO"),
            peso: item.nsu_status === "NSU_IGUAL" ? 20 : 0,
            detalhe: `NSU Rede ${item.rede_nsu ?? "-"} / WinThor ${item.winthor_nsu ?? "-"}`,
        },
        {
            tipo: "FILIAL",
            status: String(item.filial_status ?? "NAO_CLASSIFICADO"),
            peso: item.filial_status === "FILIAL_LOCALIZADA" ? 20 : 0,
            detalhe: `Filial ${item.filial_codigo ?? item.winthor_codfilial ?? "-"}`,
        },
    ];
    const riscos = [];
    if (isAmbiguous) {
        riscos.push("AMBIGUIDADE_DE_MATCH");
    }
    if (item.validation_status === STATUS.MATCH_PROVAVEL) {
        riscos.push("MATCH_PROVAVEL_REVISAR");
    }
    if (String(item.winthor_status_titulo ?? "").trim().toUpperCase() === "PAGO_PARCIAL") {
        riscos.push("TITULO_PAGO_PARCIAL");
    }
    return {
        score,
        classificacao: item.match_classification ?? null,
        evidencias,
        riscos,
        explicacao_curta: `${item.value_status ?? "-"} / ${item.date_status ?? "-"} / score ${score}`,
    };
}
function toHistoryBatchRow(batch) {
    if (!batch)
        return null;
    return {
        id: batch.id,
        tenant_id: batch.tenant_id,
        file_name: batch.file_name,
        period_start: batch.period_start ?? null,
        period_end: batch.period_end ?? null,
        total_rede_rows: batch.total_rede_rows ?? 0,
        total_winthor_rows: batch.total_winthor_rows ?? 0,
        total_conciliated: batch.total_conciliated ?? 0,
        total_rede_not_found_winthor: batch.total_rede_not_found_winthor ?? 0,
        total_winthor_not_found_rede: batch.total_winthor_not_found_rede ?? 0,
        total_value_divergence: batch.total_value_divergence ?? 0,
        total_date_divergence: batch.total_date_divergence ?? 0,
        total_title_pending_settlement: batch.total_title_pending_settlement ?? 0,
        total_branch_not_found: batch.total_branch_not_found ?? 0,
        total_rede_amount: batch.total_rede_amount ?? 0,
        total_winthor_paid_amount: batch.total_winthor_paid_amount ?? 0,
        total_difference_amount: batch.total_difference_amount ?? 0,
        conformity_percentage: batch.conformity_percentage ?? 0,
        status: batch.status,
        uploaded_by: batch.uploaded_by,
        started_at: batch.started_at ?? null,
        finished_at: batch.finished_at ?? null,
        created_at: batch.created_at,
        updated_at: batch.updated_at,
    };
}
export class CardReceivableSettlementRepository {
    ensureCollections() {
        if (!Array.isArray(db.cardSettlementBatches))
            db.cardSettlementBatches = [];
        if (!Array.isArray(db.cardSettlementItems))
            db.cardSettlementItems = [];
        if (!Array.isArray(db.cardSettlementWinthorUnmatched))
            db.cardSettlementWinthorUnmatched = [];
        if (!Array.isArray(db.cardSettlementActionLogs))
            db.cardSettlementActionLogs = [];
    }
    appendActionLog(input) {
        this.ensureCollections();
        const row = {
            id: `CSTLOG-${Date.now()}-${randomUUID().slice(0, 8)}`,
            created_at: nowIso(),
            batch_id: String(input.batchId ?? ""),
            event_type: String(input.eventType ?? "INFO"),
            actor_id: String(input.actorId ?? "system"),
            actor_name: String(input.actorName ?? "system"),
            actor_profile: String(input.actorProfile ?? "SYSTEM"),
            payload: input.payload ?? {},
        };
        db.cardSettlementActionLogs.unshift(row);
        return row;
    }
    listActionLogs(batchId, limit = 200) {
        this.ensureCollections();
        const safeLimit = Math.max(1, Math.min(Number(limit ?? 200), 1000));
        const registros = db.cardSettlementActionLogs
            .filter((row) => !batchId || String(row.batch_id) === String(batchId))
            .slice(0, safeLimit);
        return {
            total: registros.length,
            registros,
        };
    }
    createBatch(input) {
        this.ensureCollections();
        const createdAt = nowIso();
        const batch = {
            id: input.id ?? `CST-${Date.now()}-${randomUUID().slice(0, 8)}`,
            tenant_id: input.tenantId ?? "default",
            file_name: input.fileName,
            file_hash: input.fileHash,
            period_start: input.periodStart ?? null,
            period_end: input.periodEnd ?? null,
            total_rede_rows: input.totalRedeRows ?? 0,
            total_winthor_rows: input.totalWinthorRows ?? 0,
            total_conciliated: input.totalConciliated ?? 0,
            total_rede_not_found_winthor: input.totalRedeNotFoundWinthor ?? 0,
            total_winthor_not_found_rede: input.totalWinthorNotFoundRede ?? 0,
            total_value_divergence: input.totalValueDivergence ?? 0,
            total_date_divergence: input.totalDateDivergence ?? 0,
            total_title_pending_settlement: input.totalTitlePendingSettlement ?? 0,
            total_branch_not_found: input.totalBranchNotFound ?? 0,
            total_bank_divergence: input.totalBankDivergence ?? 0,
            total_manual_review: input.totalManualReview ?? 0,
            total_rede_amount: input.totalRedeAmount ?? 0,
            total_winthor_paid_amount: input.totalWinthorPaidAmount ?? 0,
            total_difference_amount: input.totalDifferenceAmount ?? 0,
            conformity_percentage: input.conformityPercentage ?? 0,
            status: input.status ?? "PROCESSANDO",
            uploaded_by: input.uploadedBy ?? "system",
            started_at: input.startedAt ?? createdAt,
            finished_at: input.finishedAt ?? null,
            created_at: createdAt,
            updated_at: createdAt,
            metadata: input.metadata ?? {},
        };
        db.cardSettlementBatches.unshift(batch);
        return batch;
    }
    updateBatch(batchId, patch) {
        this.ensureCollections();
        const index = db.cardSettlementBatches.findIndex((batch) => String(batch.id) === String(batchId));
        if (index < 0)
            return null;
        const next = { ...db.cardSettlementBatches[index], ...patch, updated_at: nowIso() };
        db.cardSettlementBatches[index] = next;
        return next;
    }
    replaceItems(batchId, items) {
        this.ensureCollections();
        db.cardSettlementItems = db.cardSettlementItems.filter((item) => String(item.batch_id) !== String(batchId));
        const createdAt = nowIso();
        const rows = items.map((item) => ({
            id: item.id ?? `CSTI-${Date.now()}-${randomUUID().slice(0, 8)}`,
            batch_id: batchId,
            created_at: createdAt,
            updated_at: createdAt,
            ...item,
        }));
        db.cardSettlementItems.push(...rows);
        return rows;
    }
    replaceWinthorUnmatched(batchId, rows) {
        this.ensureCollections();
        db.cardSettlementWinthorUnmatched = db.cardSettlementWinthorUnmatched.filter((item) => String(item.batch_id) !== String(batchId));
        const createdAt = nowIso();
        const mapped = rows.map((row) => ({
            id: row.id ?? `CSTU-${Date.now()}-${randomUUID().slice(0, 8)}`,
            batch_id: batchId,
            created_at: createdAt,
            ...row,
        }));
        db.cardSettlementWinthorUnmatched.push(...mapped);
        return mapped;
    }
    getBatchById(batchId) {
        this.ensureCollections();
        return db.cardSettlementBatches.find((batch) => String(batch.id) === String(batchId)) ?? null;
    }
    getItemsByBatchId(batchId) {
        this.ensureCollections();
        return db.cardSettlementItems.filter((item) => String(item.batch_id) === String(batchId));
    }
    getWinthorUnmatchedByBatchId(batchId) {
        this.ensureCollections();
        return db.cardSettlementWinthorUnmatched.filter((item) => String(item.batch_id) === String(batchId));
    }
    listHistory(limit = 50) {
        this.ensureCollections();
        const safeLimit = Math.max(1, Math.min(Number(limit ?? 50), 200));
        return {
            total: db.cardSettlementBatches.length,
            registros: db.cardSettlementBatches
                .slice()
                .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
                .slice(0, safeLimit)
                .map((batch) => toHistoryBatchRow(batch)),
        };
    }
    getSummary(batchId) {
        const batch = this.getBatchById(batchId);
        if (!batch)
            return null;
        return {
            id: batch.id,
            period_start: batch.period_start,
            period_end: batch.period_end,
            total_rede_rows: batch.total_rede_rows,
            total_winthor_rows: batch.total_winthor_rows,
            total_conciliated: batch.total_conciliated,
            total_rede_not_found_winthor: batch.total_rede_not_found_winthor,
            total_winthor_not_found_rede: batch.total_winthor_not_found_rede,
            total_value_divergence: batch.total_value_divergence,
            total_date_divergence: batch.total_date_divergence,
            total_title_pending_settlement: batch.total_title_pending_settlement ?? 0,
            total_branch_not_found: batch.total_branch_not_found,
            total_bank_divergence: batch.total_bank_divergence,
            total_manual_review: batch.total_manual_review,
            total_rede_amount: batch.total_rede_amount,
            total_winthor_paid_amount: batch.total_winthor_paid_amount,
            total_difference_amount: batch.total_difference_amount,
            conformity_percentage: batch.conformity_percentage,
            total_establishments_unique: batch.metadata?.totalEstablishmentsUnique ?? null,
            total_establishments_located: batch.metadata?.totalEstablishmentsLocated ?? null,
            total_filial_by_venda_original: batch.metadata?.totalFilialByVendaOriginal ?? null,
            total_filial_by_estabelecimento_rede: batch.metadata?.totalFilialByEstabelecimentoRede ?? null,
            total_filial_by_nome: batch.metadata?.totalFilialByNome ?? null,
            total_sem_filial: batch.metadata?.totalSemFilial ?? null,
            total_divergencia_filial: batch.metadata?.totalDivergenciaFilial ?? null,
            total_bloqueado: batch.metadata?.totalBloqueado ?? null,
            tolerances: batch.metadata?.tolerances ?? null,
            status: batch.status,
            file_name: batch.file_name,
            uploaded_by: batch.uploaded_by,
            created_at: batch.created_at,
            updated_at: batch.updated_at,
        };
    }
    getItemFilterOptions(batchId) {
        const optionMaps = Object.fromEntries(ITEM_FILTER_COLUMNS.map((key) => [key, new Map()]));
        for (const item of this.getItemsByBatchId(batchId)) {
            for (const key of ITEM_FILTER_COLUMNS) {
                const value = columnDisplayValue(item, key);
                const map = optionMaps[key];
                map.set(value, (map.get(value) ?? 0) + 1);
            }
        }
        const columns = Object.fromEntries(ITEM_FILTER_COLUMNS.map((key) => {
            const options = Array.from(optionMaps[key].entries())
                .map(([value, count]) => ({ value, label: value, count }))
                .sort((a, b) => String(a.label).localeCompare(String(b.label), "pt-BR", { numeric: true, sensitivity: "base" }));
            return [key, options];
        }));
        return { columns };
    }
    filterItems(batchId, query) {
        const columnFilters = parseColumnFilters(query.columnFilters);
        return this.getItemsByBatchId(batchId).filter((item) => {
            if (query.status && String(item.validation_status) !== String(query.status))
                return false;
            if (query.filial && String(item.winthor_codfilial ?? item.pcfilial_codigo ?? "").trim() !== String(query.filial).trim())
                return false;
            if (query.cnpj && !String(item.branch_cnpj_normalized ?? "").includes(String(query.cnpj).replace(/\D/g, "")))
                return false;
            const redeDate = toIsoDate(item.rede_payment_date);
            if (query.periodoInicio && redeDate && redeDate < query.periodoInicio)
                return false;
            if (query.periodoFim && redeDate && redeDate > query.periodoFim)
                return false;
            if (query.dataPagamento && redeDate !== query.dataPagamento)
                return false;
            const amount = toNumber(item.rede_received_amount);
            if (query.valorMin != null && amount != null && amount < query.valorMin)
                return false;
            if (query.valorMax != null && amount != null && amount > query.valorMax)
                return false;
            if (query.scoreMin != null && toNumber(item.match_score) != null && Number(item.match_score) < query.scoreMin)
                return false;
            if (query.banco && String(item.winthor_codbanco ?? "").trim() !== String(query.banco).trim())
                return false;
            if (query.tipoDivergencia) {
                const type = String(query.tipoDivergencia);
                if (type === "valor" && item.value_status !== "VALOR_RECEBIDO_DIVERGENTE")
                    return false;
                if (type === "data" && item.date_status !== "DATA_PAGAMENTO_DIVERGENTE")
                    return false;
                if (type === "filial" &&
                    item.filial_status !== "FILIAL_NAO_ENCONTRADA" &&
                    item.validation_status !== STATUS.FILIAL_DIVERGENTE &&
                    item.validation_status !== STATUS.VINCULO_DUPLICADO &&
                    item.validation_status !== STATUS.PENDENTE_VINCULO_FILIAL)
                    return false;
            }
            if (query.somenteDivergencias && !isDivergenceStatus(item.validation_status))
                return false;
            if (!applyColumnContentFilters(item, query))
                return false;
            if (!applyColumnSelectionFilters(item, columnFilters))
                return false;
            return true;
        });
    }
    listItems(batchId, query) {
        const page = Math.max(1, Number(query.page ?? 1));
        const pageSize = Math.max(1, Math.min(200, Number(query.pageSize ?? 50)));
        const filtered = this.filterItems(batchId, {
            status: query.status ?? null,
            filial: query.filial ?? null,
            cnpj: query.cnpj ?? null,
            periodoInicio: query.periodoInicio ?? null,
            periodoFim: query.periodoFim ?? null,
            dataPagamento: query.dataPagamento ?? null,
            valorMin: toNumber(query.valorMin),
            valorMax: toNumber(query.valorMax),
            scoreMin: toNumber(query.scoreMin),
            banco: query.banco ?? null,
            tipoDivergencia: query.tipoDivergencia ?? null,
            somenteDivergencias: toBool(query.somenteDivergencias),
            colLinha: query.colLinha ?? null,
            colCnpjRede: query.colCnpjRede ?? null,
            colFilialWinthor: query.colFilialWinthor ?? null,
            colFilialRede: query.colFilialRede ?? null,
            colDataRede: query.colDataRede ?? null,
            colDataWinthor: query.colDataWinthor ?? null,
            colStatusData: query.colStatusData ?? null,
            colValorRede: query.colValorRede ?? null,
            colValorWinthor: query.colValorWinthor ?? null,
            colDiferenca: query.colDiferenca ?? null,
            colStatusValor: query.colStatusValor ?? null,
            colNsuRede: query.colNsuRede ?? null,
            colNsuSistema: query.colNsuSistema ?? null,
            colDocumentoRede: query.colDocumentoRede ?? null,
            colDuplicata: query.colDuplicata ?? null,
            colPrestacao: query.colPrestacao ?? null,
            colPedido: query.colPedido ?? null,
            colNota: query.colNota ?? null,
            colBanco: query.colBanco ?? null,
            colStatusTitulo: query.colStatusTitulo ?? null,
            colDtEmissao: query.colDtEmissao ?? null,
            colDtVenc: query.colDtVenc ?? null,
            colValorAberto: query.colValorAberto ?? null,
            colParcelasVenda: query.colParcelasVenda ?? null,
            colTotalVenda: query.colTotalVenda ?? null,
            colTotalAberto: query.colTotalAberto ?? null,
            colStatusBanco: query.colStatusBanco ?? null,
            colScore: query.colScore ?? null,
            colStatusGeral: query.colStatusGeral ?? null,
            colMotivo: query.colMotivo ?? null,
            columnFilters: query.columnFilters ?? null,
        }).sort((a, b) => Number(a.row_number) - Number(b.row_number));
        const totalItems = filtered.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
        const safePage = Math.min(page, totalPages);
        const start = (safePage - 1) * pageSize;
        return {
            total: totalItems,
            registros: filtered.slice(start, start + pageSize),
            paginacao: { page: safePage, pageSize, totalPages, totalItems },
        };
    }
    listWinthorUnmatched(batchId, query) {
        const page = Math.max(1, Number(query.page ?? 1));
        const pageSize = Math.max(1, Math.min(200, Number(query.pageSize ?? 50)));
        const filialFilter = query.filial ? String(query.filial).trim() : "";
        const rows = this.getWinthorUnmatchedByBatchId(batchId)
            .filter((row) => !filialFilter || String(row.codfilial ?? "").trim() === filialFilter)
            .sort((a, b) => String(a.dtpag ?? "").localeCompare(String(b.dtpag ?? "")) || Number(b.valor_pago ?? 0) - Number(a.valor_pago ?? 0));
        const totalItems = rows.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
        const safePage = Math.min(page, totalPages);
        const start = (safePage - 1) * pageSize;
        return {
            total: totalItems,
            registros: rows.slice(start, start + pageSize),
            paginacao: { page: safePage, pageSize, totalPages, totalItems },
        };
    }
    markItemManual(batchId, itemId, reason) {
        this.ensureCollections();
        const index = db.cardSettlementItems.findIndex((item) => String(item.batch_id) === String(batchId) && String(item.id) === String(itemId));
        if (index < 0)
            return null;
        const current = db.cardSettlementItems[index];
        const next = {
            ...current,
            validation_status: STATUS.ANALISE_MANUAL,
            reason: reason && reason.trim().length > 0 ? reason.trim() : current.reason,
            match_score: 40,
            match_classification: "NAO_ENCONTRADO",
            updated_at: nowIso(),
        };
        db.cardSettlementItems[index] = next;
        return next;
    }
    listSettlementCandidates(batchId, options = {}) {
        this.ensureCollections();
        const onlyUnconfirmed = options.onlyUnconfirmed !== false;
        const includeExplainability = options.includeExplainability !== false;
        const filialFilter = String(options.filial ?? "").trim();
        const rows = this.getItemsByBatchId(batchId)
            .filter((item) => isEligibleForSettlementConfirmation(item))
            .filter((item) => {
            if (!onlyUnconfirmed)
                return true;
            return !item.baixa_confirmada_at;
        })
            .filter((item) => {
            if (!filialFilter)
                return true;
            const filial = String(item.filial_codigo ?? item.winthor_codfilial ?? "").trim();
            return filial === filialFilter;
        })
            .sort((a, b) => Number(a.row_number ?? 0) - Number(b.row_number ?? 0));
        const ambiguity = buildAmbiguityMaps(rows);
        const summary = {
            total_registros: rows.length,
            total_valor: Number(rows.reduce((sum, item) => sum + settlementComparableValue(item), 0).toFixed(2)),
            total_valor_recebido_igual: Number(rows
                .filter((item) => item.value_status === "VALOR_RECEBIDO_IGUAL")
                .reduce((sum, item) => sum + settlementComparableValue(item), 0)
                .toFixed(2)),
            total_valor_recebido_aproximado: Number(rows
                .filter((item) => item.value_status === "VALOR_RECEBIDO_APROXIMADO")
                .reduce((sum, item) => sum + settlementComparableValue(item), 0)
                .toFixed(2)),
            total_qtd_recebido_igual: rows.filter((item) => item.value_status === "VALOR_RECEBIDO_IGUAL").length,
            total_qtd_recebido_aproximado: rows.filter((item) => item.value_status === "VALOR_RECEBIDO_APROXIMADO").length,
            total_confirmados: rows.filter((item) => Boolean(item.baixa_confirmada_at)).length,
            total_pendentes_confirmacao: rows.filter((item) => !item.baixa_confirmada_at).length,
            total_ambiguidade: rows.filter((item) => {
                const key = settlementMatchKey(item);
                const nsu = String(item.rede_nsu ?? item.winthor_nsu ?? "").trim();
                const byMatchKey = ambiguity.byMatchKey.get(key) ?? 0;
                const byNsu = nsu ? ambiguity.byNsu.get(nsu) ?? 0 : 0;
                return byMatchKey > 1 || byNsu > 1;
            }).length,
        };
        const registros = rows.map((item) => ({
            ambiguous: (() => {
                const key = settlementMatchKey(item);
                const nsu = String(item.rede_nsu ?? item.winthor_nsu ?? "").trim();
                const byMatchKey = ambiguity.byMatchKey.get(key) ?? 0;
                const byNsu = nsu ? ambiguity.byNsu.get(nsu) ?? 0 : 0;
                return byMatchKey > 1 || byNsu > 1;
            })(),
            id: item.id,
            row_number: item.row_number,
            filial_codigo: item.filial_codigo ?? item.winthor_codfilial ?? null,
            filial_id: item.filial_id ?? null,
            codcli: item.winthor_codcli ?? null,
            cliente: item.winthor_cliente ?? null,
            duplicata: item.winthor_duplic ?? null,
            prestacao: item.winthor_prest ?? null,
            pedido: item.winthor_numped ?? null,
            nota: item.winthor_numnota ?? null,
            data_pagamento_rede: item.rede_payment_date ?? null,
            data_pagamento_winthor: item.winthor_dt_pag ?? null,
            valor_rede: settlementComparableValue(item),
            valor_winthor: toNumber(item.winthor_valor_original ?? item.winthor_valor_pago) ?? 0,
            valor_aberto_winthor: toNumber(item.winthor_valor_aberto) ?? 0,
            value_status: item.value_status,
            validation_status: item.validation_status,
            match_score: item.match_score,
            reason: item.reason,
            baixa_confirmada_at: item.baixa_confirmada_at ?? null,
            baixa_confirmada_por: item.baixa_confirmada_por ?? null,
            baixa_confirmada_usuario_id: item.baixa_confirmada_usuario_id ?? null,
            baixa_execucao_status: item.baixa_execucao_status ?? null,
            baixa_execucao_at: item.baixa_execucao_at ?? null,
            baixa_execucao_msg: item.baixa_execucao_msg ?? null,
            explainability: includeExplainability
                ? buildCandidateExplainability(item, (() => {
                    const key = settlementMatchKey(item);
                    const nsu = String(item.rede_nsu ?? item.winthor_nsu ?? "").trim();
                    const byMatchKey = ambiguity.byMatchKey.get(key) ?? 0;
                    const byNsu = nsu ? ambiguity.byNsu.get(nsu) ?? 0 : 0;
                    return byMatchKey > 1 || byNsu > 1;
                })())
                : undefined,
        }));
        return { summary, registros };
    }
    confirmSettlementCandidates(batchId, itemIds, actor) {
        this.ensureCollections();
        const ids = Array.from(new Set((itemIds ?? []).map((value) => String(value).trim()).filter(Boolean)));
        if (ids.length === 0) {
            return { totalSolicitados: 0, totalAtualizados: 0, atualizados: [], ignorados: [] };
        }
        const byId = new Set(ids);
        const now = nowIso();
        let updatedCount = 0;
        const updatedRows = [];
        const ignoredRows = [];
        for (let index = 0; index < db.cardSettlementItems.length; index += 1) {
            const current = db.cardSettlementItems[index];
            if (String(current.batch_id) !== String(batchId))
                continue;
            if (!byId.has(String(current.id)))
                continue;
            if (!isEligibleForSettlementConfirmation(current)) {
                ignoredRows.push({
                    id: current.id,
                    motivo: "ITEM_NAO_ELEGIVEL",
                });
                continue;
            }
            const currentNsu = String(current.rede_nsu ?? current.winthor_nsu ?? "").trim();
            const siblings = db.cardSettlementItems.filter((row) => String(row.batch_id) === String(batchId) &&
                String(row.id) !== String(current.id) &&
                (settlementMatchKey(row) === settlementMatchKey(current) ||
                    (currentNsu && String(row.rede_nsu ?? row.winthor_nsu ?? "").trim() === currentNsu)));
            if (siblings.length > 0) {
                ignoredRows.push({
                    id: current.id,
                    motivo: "AMBIGUIDADE_DE_MATCH",
                });
                continue;
            }
            const next = {
                ...current,
                baixa_confirmada_at: now,
                baixa_confirmada_por: String(actor?.userName ?? "system"),
                baixa_confirmada_usuario_id: String(actor?.userId ?? "system"),
                baixa_confirmada_perfil: String(actor?.perfil ?? ""),
                baixa_execucao_status: current.baixa_execucao_status ?? "CONFIRMADO_PARA_BAIXA",
                updated_at: now,
            };
            db.cardSettlementItems[index] = next;
            updatedCount += 1;
            updatedRows.push({
                id: next.id,
                row_number: next.row_number,
                codcli: next.winthor_codcli ?? null,
                duplicata: next.winthor_duplic ?? null,
                prestacao: next.winthor_prest ?? null,
                value_status: next.value_status,
                baixa_confirmada_at: next.baixa_confirmada_at,
                baixa_confirmada_por: next.baixa_confirmada_por,
            });
        }
        const missing = ids.filter((id) => !updatedRows.some((row) => String(row.id) === id) && !ignoredRows.some((row) => String(row.id) === id));
        for (const id of missing) {
            ignoredRows.push({ id, motivo: "ITEM_NAO_ENCONTRADO" });
        }
        return {
            totalSolicitados: ids.length,
            totalAtualizados: updatedCount,
            atualizados: updatedRows,
            ignorados: ignoredRows,
        };
    }
    getConfirmedCandidatesForSettlement(batchId, itemIds = null) {
        this.ensureCollections();
        const filterIds = Array.isArray(itemIds) && itemIds.length > 0
            ? new Set(itemIds.map((value) => String(value).trim()).filter(Boolean))
            : null;
        return db.cardSettlementItems
            .filter((item) => String(item.batch_id) === String(batchId))
            .filter((item) => !filterIds || filterIds.has(String(item.id)))
            .filter((item) => Boolean(item.baixa_confirmada_at))
            .filter((item) => isEligibleForSettlementConfirmation(item))
            .sort((a, b) => Number(a.row_number ?? 0) - Number(b.row_number ?? 0));
    }
    markSettlementExecution(batchId, itemId, patch) {
        this.ensureCollections();
        const index = db.cardSettlementItems.findIndex((item) => String(item.batch_id) === String(batchId) && String(item.id) === String(itemId));
        if (index < 0)
            return null;
        const next = {
            ...db.cardSettlementItems[index],
            ...patch,
            updated_at: nowIso(),
        };
        db.cardSettlementItems[index] = next;
        return next;
    }
}
