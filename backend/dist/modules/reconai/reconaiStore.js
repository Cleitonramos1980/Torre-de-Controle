import { db } from "../../repositories/dataStore.js";
function nowIso() {
    return new Date().toISOString();
}
function normalizeReconciliation(row) {
    const normalizedWorkflowStatus = row.workflowStatus ?? (row.status === "CONCILIADO" ? "RESOLVIDA" : "ABERTA");
    return {
        ...row,
        workflowStatus: normalizedWorkflowStatus,
        workflowUpdatedAt: row.workflowUpdatedAt ?? row.createdAt ?? nowIso(),
        lastActionAt: row.lastActionAt ?? null,
    };
}
class ReconaiStore {
    syncedAt;
    sales;
    payments;
    receivables;
    reconciliations;
    reconciliationById;
    constructor() {
        const snapshot = db.reconaiSnapshot ?? {};
        this.syncedAt = snapshot.syncedAt ?? null;
        this.sales = Array.isArray(snapshot.sales) ? snapshot.sales : [];
        this.payments = Array.isArray(snapshot.payments) ? snapshot.payments : [];
        this.receivables = Array.isArray(snapshot.receivables) ? snapshot.receivables : [];
        this.reconciliations = Array.isArray(snapshot.reconciliations)
            ? snapshot.reconciliations.map((row) => normalizeReconciliation(row))
            : [];
        this.reconciliationById = new Map(this.reconciliations.map((row) => [row.id, row]));
    }
    replaceSnapshot(input) {
        this.syncedAt = input.syncedAt;
        this.sales = input.sales;
        this.payments = input.payments;
        this.receivables = input.receivables;
        this.reconciliations = input.reconciliations.map((row) => normalizeReconciliation(row));
        this.reconciliationById = new Map(this.reconciliations.map((row) => [row.id, row]));
        db.reconaiSnapshot = this.getSnapshot();
    }
    getReconciliationById(id) {
        return this.reconciliationById.get(id) ?? null;
    }
    listReconciliations() {
        return [...this.reconciliations];
    }
    listOpenDivergences() {
        return this.reconciliations.filter((row) => row.status !== "CONCILIADO" && row.workflowStatus !== "RESOLVIDA");
    }
    updateWorkflowStatus(id, workflowStatus, actionAt) {
        const current = this.reconciliationById.get(id);
        if (!current)
            return null;
        const updated = {
            ...current,
            workflowStatus,
            workflowUpdatedAt: nowIso(),
            lastActionAt: actionAt ?? current.lastActionAt,
        };
        this.reconciliationById.set(id, updated);
        this.reconciliations = this.reconciliations.map((row) => (row.id === id ? updated : row));
        db.reconaiSnapshot = this.getSnapshot();
        return updated;
    }
    getSnapshot() {
        return {
            syncedAt: this.syncedAt,
            sales: this.sales,
            payments: this.payments,
            receivables: this.receivables,
            reconciliations: this.reconciliations,
        };
    }
}
export const reconaiStore = new ReconaiStore();
