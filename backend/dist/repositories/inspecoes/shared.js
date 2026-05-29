import { randomUUID } from "node:crypto";
import { executeOracle, isOracleEnabled } from "../../db/oracle.js";
import { queryOne } from "../baseRepository.js";
const IDENTIFIER_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const TABLE_COLUMNS_CACHE = new Map();
function normalizeIdentifier(input, kind) {
    const value = String(input || "").trim().toUpperCase();
    if (!IDENTIFIER_PATTERN.test(value)) {
        throw new Error(`Identificador Oracle invalido para ${kind}: ${input}`);
    }
    return value;
}
async function loadTableColumns(tableName) {
    const table = normalizeIdentifier(tableName, "table");
    const cached = TABLE_COLUMNS_CACHE.get(table);
    if (cached)
        return cached;
    if (!isOracleEnabled()) {
        const empty = new Set();
        TABLE_COLUMNS_CACHE.set(table, empty);
        return empty;
    }
    try {
        const result = (await executeOracle(`SELECT * FROM ${table} WHERE 1 = 0`));
        const metaData = Array.isArray(result?.metaData) ? result.metaData : [];
        const columns = new Set(metaData
            .map((item) => item?.name)
            .filter(Boolean)
            .map((name) => String(name).toUpperCase()));
        TABLE_COLUMNS_CACHE.set(table, columns);
        return columns;
    }
    catch {
        const empty = new Set();
        TABLE_COLUMNS_CACHE.set(table, empty);
        return empty;
    }
}
export async function hasTableColumn(tableName, columnName) {
    const column = normalizeIdentifier(columnName, "column");
    const columns = await loadTableColumns(tableName);
    return columns.has(column);
}
export async function pickOptionalColumn(tableName, candidates) {
    for (const candidate of candidates) {
        if (await hasTableColumn(tableName, candidate)) {
            return normalizeIdentifier(candidate, "column");
        }
    }
    return null;
}
export async function pickFirstExistingColumn(tableName, candidates) {
    const picked = await pickOptionalColumn(tableName, candidates);
    if (picked)
        return picked;
    throw new Error(`Nenhuma coluna compatível em ${tableName}: ${candidates.join(", ")}`);
}
export async function getAuditTimestampColumns(tableName) {
    const createdAtColumn = await pickOptionalColumn(tableName, ["CRIADO_EM", "CREATED_AT"]);
    const updatedAtColumn = await pickOptionalColumn(tableName, ["ATUALIZADO_EM", "UPDATED_AT"]);
    return { createdAtColumn, updatedAtColumn };
}
export function clearOracleCompatibilityCache() {
    TABLE_COLUMNS_CACHE.clear();
}
export function uid(prefix) {
    return `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
}
export function asBool(value) {
    return value === 1 || value === "1" || value === true;
}
export function asNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}
export function normalizeStatusResultado(input) {
    const value = String(input || "").trim().toUpperCase();
    if (value === "CONFORME")
        return "CONFORME";
    if (value === "NAO_CONFORME")
        return "NAO_CONFORME";
    return "NAO_APLICA";
}
export async function findSetorIdByNome(setorNome) {
    const row = await queryOne(`SELECT ID FROM INS_SETOR WHERE UPPER(NOME) = UPPER(:nome) AND ATIVO = 1`, { nome: setorNome });
    return row?.ID ?? null;
}
export async function findSetorNomeById(setorId) {
    const row = await queryOne(`SELECT NOME FROM INS_SETOR WHERE ID = :id`, { id: setorId });
    return row?.NOME ?? null;
}
export async function ensureSetorIdFromModelo(modeloId) {
    const row = await queryOne(`SELECT SETOR_ID FROM INS_MODELO_CHECKLIST WHERE ID = :id`, { id: modeloId });
    return row?.SETOR_ID ?? null;
}
export async function ensureModeloNome(modeloId) {
    const row = await queryOne(`SELECT NOME FROM INS_MODELO_CHECKLIST WHERE ID = :id`, { id: modeloId });
    return row?.NOME ?? null;
}
export function toIso(value) {
    if (!value)
        return new Date().toISOString();
    if (typeof value === "string")
        return value;
    if (value instanceof Date)
        return value.toISOString();
    return String(value);
}
