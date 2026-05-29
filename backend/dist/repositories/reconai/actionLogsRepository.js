import { ACTION_TYPE } from "../../modules/reconai/types.js";
import { isOracleEnabled } from "../../db/oracle.js";
import { execDml, queryRows } from "../baseRepository.js";
import { db } from "../dataStore.js";
function nowIso() {
    return new Date().toISOString();
}
function toIsoDate(value) {
    if (value instanceof Date)
        return value.toISOString();
    if (typeof value === "string") {
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime()))
            return parsed.toISOString();
    }
    return nowIso();
}
function normalizeStatus(value) {
    if (value === "SUCCESS" || value === "ERROR" || value === "SKIPPED")
        return value;
    return "SKIPPED";
}
function normalizeActionType(value) {
    const types = new Set(Object.values(ACTION_TYPE));
    if (value && types.has(value)) {
        return value;
    }
    return ACTION_TYPE.FLAG_INTERNAL;
}
function mapOracleRow(row) {
    return {
        id: String(row.ID ?? ""),
        divergencia_id: String(row.DIVERGENCIA_ID ?? ""),
        action_type: normalizeActionType(typeof row.ACTION_TYPE === "string" ? row.ACTION_TYPE : undefined),
        status: normalizeStatus(row.STATUS),
        response: String(row.RESPONSE ?? ""),
        created_at: toIsoDate(row.CREATED_AT),
    };
}
export async function insertActionLog(entry) {
    db.reconaiActionLogs.unshift(entry);
    if (!isOracleEnabled())
        return;
    try {
        await execDml(`INSERT INTO ACTION_LOGS (
        ID, DIVERGENCIA_ID, ACTION_TYPE, STATUS, RESPONSE, CREATED_AT
      ) VALUES (
        :id, :divergenciaId, :actionType, :status, :response, SYSTIMESTAMP
      )`, {
            id: entry.id,
            divergenciaId: entry.divergencia_id,
            actionType: entry.action_type,
            status: entry.status,
            response: entry.response,
        });
    }
    catch (error) {
        console.error("Falha ao persistir ACTION_LOGS no Oracle. Mantido em memoria.", error);
    }
}
export async function listActionLogs(input) {
    const divergenciaId = input?.divergenciaId?.trim() || undefined;
    const safeLimit = Math.max(1, Math.min(1000, Number(input?.limit ?? 200)));
    if (!isOracleEnabled()) {
        const rows = db.reconaiActionLogs;
        const filtered = divergenciaId
            ? rows.filter((row) => row.divergencia_id === divergenciaId)
            : rows;
        return filtered.slice(0, safeLimit);
    }
    const whereClause = divergenciaId ? "WHERE DIVERGENCIA_ID = :divergenciaId" : "";
    const sql = `
    SELECT ID, DIVERGENCIA_ID, ACTION_TYPE, STATUS, RESPONSE, CREATED_AT
      FROM ACTION_LOGS
      ${whereClause}
     ORDER BY CREATED_AT DESC
     FETCH FIRST ${safeLimit} ROWS ONLY
  `;
    try {
        const rows = await queryRows(sql, divergenciaId ? { divergenciaId } : {});
        return rows.map(mapOracleRow);
    }
    catch (error) {
        console.error("Falha ao consultar ACTION_LOGS no Oracle. Usando fallback em memoria.", error);
        const rows = db.reconaiActionLogs;
        const filtered = divergenciaId
            ? rows.filter((row) => row.divergencia_id === divergenciaId)
            : rows;
        return filtered.slice(0, safeLimit);
    }
}
export async function saveInternalTicket(ticket) {
    db.reconaiInternalTickets.unshift(ticket);
}
export function listInternalTickets(divergenciaId) {
    const rows = db.reconaiInternalTickets;
    if (!divergenciaId)
        return [...rows];
    return rows.filter((row) => row.divergenciaId === divergenciaId);
}
