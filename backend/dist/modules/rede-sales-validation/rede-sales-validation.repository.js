import { randomUUID } from "node:crypto";
import { db } from "../../repositories/dataStore.js";
import { REDE_SALES_VALIDATION_STATUS as STATUS } from "./enums/validation-status.js";
function toBool(value) {
    if (value === true || value === false)
        return value;
    if (value == null)
        return false;
    const normalized = String(value).trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "sim" || normalized === "yes";
}
function toNumber(value) {
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (value == null)
        return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
function toIsoDate(value) {
    if (!value)
        return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()))
        return null;
    return parsed.toISOString().slice(0, 10);
}
function nowIso() {
    return new Date().toISOString();
}
function isDivergenceStatus(status) {
    return status !== STATUS.VENDA_VALIDADA;
}
export class RedeSalesValidationRepository {
    ensureCollections() {
        if (!Array.isArray(db.redeSalesValidationBatches)) {
            db.redeSalesValidationBatches = [];
        }
        if (!Array.isArray(db.redeSalesValidationItems)) {
            db.redeSalesValidationItems = [];
        }
        if (!Array.isArray(db.redeSalesValidationWinthorUnmatched)) {
            db.redeSalesValidationWinthorUnmatched = [];
        }
    }
    createBatch(input) {
        this.ensureCollections();
        const createdAt = nowIso();
        const batch = {
            id: input.id ?? `RSV-${Date.now()}-${randomUUID().slice(0, 8)}`,
            tenant_id: input.tenantId ?? "default",
            file_name: input.fileName,
            file_hash: input.fileHash,
            period_start: input.periodStart ?? null,
            period_end: input.periodEnd ?? null,
            total_rows: input.totalRows ?? 0,
            total_system_rows: input.totalSystemRows ?? 0,
            total_validated: input.totalValidated ?? 0,
            total_branch_not_found: input.totalBranchNotFound ?? 0,
            total_rede_not_found_winthor: input.totalRedeNotFoundWinthor ?? 0,
            total_winthor_not_found_rede: input.totalWinthorNotFoundRede ?? 0,
            total_nsu_divergence: input.totalNsuDivergence ?? 0,
            total_value_divergence: input.totalValueDivergence ?? 0,
            total_date_divergence: input.totalDateDivergence ?? 0,
            total_filial_divergence: input.totalFilialDivergence ?? 0,
            total_manual_review: input.totalManualReview ?? 0,
            total_match_provavel: input.totalMatchProvavel ?? 0,
            total_divergent_amount: input.totalDivergentAmount ?? 0,
            compliance_percent: input.compliancePercent ?? 0,
            status: input.status ?? "PROCESSANDO",
            uploaded_by: input.uploadedBy ?? "system",
            started_at: input.startedAt ?? createdAt,
            finished_at: input.finishedAt ?? null,
            created_at: createdAt,
            updated_at: createdAt,
            metadata: input.metadata ?? {},
        };
        db.redeSalesValidationBatches.unshift(batch);
        return batch;
    }
    updateBatch(batchId, patch) {
        this.ensureCollections();
        const index = db.redeSalesValidationBatches.findIndex((batch) => String(batch.id) === String(batchId));
        if (index < 0)
            return null;
        const current = db.redeSalesValidationBatches[index];
        const next = {
            ...current,
            ...patch,
            updated_at: nowIso(),
        };
        db.redeSalesValidationBatches[index] = next;
        return next;
    }
    replaceItems(batchId, items) {
        this.ensureCollections();
        db.redeSalesValidationItems = db.redeSalesValidationItems.filter((item) => String(item.batch_id) !== String(batchId));
        const createdAt = nowIso();
        const rows = items.map((item) => ({
            id: item.id ?? `RSVI-${Date.now()}-${randomUUID().slice(0, 8)}`,
            batch_id: batchId,
            created_at: createdAt,
            updated_at: createdAt,
            ...item,
        }));
        db.redeSalesValidationItems.push(...rows);
        return rows;
    }
    replaceWinthorUnmatched(batchId, rows) {
        this.ensureCollections();
        db.redeSalesValidationWinthorUnmatched = db.redeSalesValidationWinthorUnmatched.filter((item) => String(item.batch_id) !== String(batchId));
        const createdAt = nowIso();
        const mapped = rows.map((row) => ({
            id: row.id ?? `RSVU-${Date.now()}-${randomUUID().slice(0, 8)}`,
            batch_id: batchId,
            created_at: createdAt,
            ...row,
        }));
        db.redeSalesValidationWinthorUnmatched.push(...mapped);
        return mapped;
    }
    getBatchById(batchId) {
        this.ensureCollections();
        return db.redeSalesValidationBatches.find((batch) => String(batch.id) === String(batchId)) ?? null;
    }
    getItemsByBatchId(batchId) {
        this.ensureCollections();
        return db.redeSalesValidationItems.filter((item) => String(item.batch_id) === String(batchId));
    }
    getWinthorUnmatchedByBatchId(batchId) {
        this.ensureCollections();
        return db.redeSalesValidationWinthorUnmatched.filter((item) => String(item.batch_id) === String(batchId));
    }
    listHistory(limit = 50) {
        this.ensureCollections();
        const safeLimit = Math.max(1, Math.min(limit, 200));
        const registros = db.redeSalesValidationBatches
            .slice()
            .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
            .slice(0, safeLimit);
        return {
            total: db.redeSalesValidationBatches.length,
            registros,
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
            total_rows: batch.total_rows,
            total_system_rows: batch.total_system_rows ?? 0,
            total_validated: batch.total_validated,
            total_branch_not_found: batch.total_branch_not_found,
            total_rede_not_found_winthor: batch.total_rede_not_found_winthor,
            total_winthor_not_found_rede: batch.total_winthor_not_found_rede,
            total_nsu_divergence: batch.total_nsu_divergence ?? 0,
            total_value_divergence: batch.total_value_divergence,
            total_date_divergence: batch.total_date_divergence,
            total_filial_divergence: batch.total_filial_divergence ?? 0,
            total_manual_review: batch.total_manual_review,
            total_match_provavel: batch.total_match_provavel ?? 0,
            total_divergent_amount: batch.total_divergent_amount ?? 0,
            compliance_percent: batch.compliance_percent ?? 0,
            tolerances: batch.metadata?.tolerances ?? null,
            status: batch.status,
            file_name: batch.file_name,
            uploaded_by: batch.uploaded_by,
            created_at: batch.created_at,
            updated_at: batch.updated_at,
        };
    }
    filterItems(batchId, query) {
        const items = this.getItemsByBatchId(batchId);
        return items.filter((item) => {
            if (query.status && String(item.validation_status) !== String(query.status))
                return false;
            if (query.filial && String(item.pcfilial_codigo ?? "").trim() !== String(query.filial).trim())
                return false;
            if (query.cnpj && !String(item.branch_cnpj_normalized ?? "").includes(String(query.cnpj).replace(/[^0-9]/g, "")))
                return false;
            const redeDate = toIsoDate(item.rede_sale_date);
            if (query.periodoInicio && redeDate && redeDate < query.periodoInicio)
                return false;
            if (query.periodoFim && redeDate && redeDate > query.periodoFim)
                return false;
            const amount = toNumber(item.rede_amount);
            if (query.valorMin != null && amount != null && amount < query.valorMin)
                return false;
            if (query.valorMax != null && amount != null && amount > query.valorMax)
                return false;
            if (query.scoreMin != null && toNumber(item.match_score) != null && Number(item.match_score) < query.scoreMin)
                return false;
            if (query.somenteDivergencias && !isDivergenceStatus(item.validation_status))
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
            valorMin: toNumber(query.valorMin),
            valorMax: toNumber(query.valorMax),
            scoreMin: toNumber(query.scoreMin),
            somenteDivergencias: toBool(query.somenteDivergencias),
        });
        const ordered = filtered.sort((a, b) => Number(a.row_number) - Number(b.row_number));
        const totalItems = ordered.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
        const safePage = Math.min(page, totalPages);
        const start = (safePage - 1) * pageSize;
        return {
            total: totalItems,
            registros: ordered.slice(start, start + pageSize),
            paginacao: {
                page: safePage,
                pageSize,
                totalPages,
                totalItems,
            },
        };
    }
    listWinthorUnmatched(batchId, query) {
        const page = Math.max(1, Number(query.page ?? 1));
        const pageSize = Math.max(1, Math.min(200, Number(query.pageSize ?? 50)));
        const filialFilter = query.filial ? String(query.filial).trim() : "";
        const rows = this.getWinthorUnmatchedByBatchId(batchId)
            .filter((row) => {
            if (!filialFilter)
                return true;
            return String(row.codfilial ?? "").trim() === filialFilter;
        })
            .sort((a, b) => String(a.data ?? "").localeCompare(String(b.data ?? "")) || Number(b.vltotal ?? 0) - Number(a.vltotal ?? 0));
        const totalItems = rows.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
        const safePage = Math.min(page, totalPages);
        const start = (safePage - 1) * pageSize;
        return {
            total: totalItems,
            registros: rows.slice(start, start + pageSize),
            paginacao: {
                page: safePage,
                pageSize,
                totalPages,
                totalItems,
            },
        };
    }
    markItemManual(batchId, itemId, reason) {
        this.ensureCollections();
        const index = db.redeSalesValidationItems.findIndex((item) => String(item.batch_id) === String(batchId) && String(item.id) === String(itemId));
        if (index < 0)
            return null;
        const current = db.redeSalesValidationItems[index];
        const next = {
            ...current,
            validation_status: STATUS.ANALISE_MANUAL,
            reason: reason && reason.trim().length > 0 ? reason.trim() : current.reason,
            match_score: 40,
            match_classification: "NAO_ENCONTRADO",
            updated_at: nowIso(),
        };
        db.redeSalesValidationItems[index] = next;
        return next;
    }
}
