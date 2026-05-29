import { randomUUID } from "node:crypto";
import { db } from "../../repositories/dataStore.js";
import { normalizeName } from "./card-receivable-settlement-normalization.js";
function nowIso() {
    return new Date().toISOString();
}
function asBool(value, fallback = true) {
    if (value === true || value === false)
        return value;
    if (value == null)
        return fallback;
    return String(value).trim().toLowerCase() === "true" || String(value).trim() === "1";
}
function asNullableString(value) {
    if (value == null)
        return null;
    const raw = String(value).trim();
    if (!raw || raw === "-")
        return null;
    return raw;
}
function normalizeTenant(value) {
    const raw = asNullableString(value);
    return raw || "default";
}
export class FilialEstabelecimentoLinkRepository {
    ensureCollections() {
        if (!Array.isArray(db.cardSettlementFilialEstabelecimentoLinks)) {
            db.cardSettlementFilialEstabelecimentoLinks = [];
        }
    }
    list(filters = {}) {
        this.ensureCollections();
        const tenantId = normalizeTenant(filters.tenantId);
        const adquirente = asNullableString(filters.adquirente);
        const ativoFilter = filters.ativo;
        return db.cardSettlementFilialEstabelecimentoLinks
            .filter((row) => row.tenant_id === tenantId)
            .filter((row) => !adquirente || String(row.adquirente).toUpperCase() === String(adquirente).toUpperCase())
            .filter((row) => ativoFilter == null || Boolean(row.ativo) === Boolean(ativoFilter))
            .sort((a, b) => String(a.codigo_estabelecimento).localeCompare(String(b.codigo_estabelecimento), "pt-BR", { numeric: true, sensitivity: "base" }) ||
            String(a.filial_codigo).localeCompare(String(b.filial_codigo), "pt-BR", { numeric: true, sensitivity: "base" }));
    }
    getById(id) {
        this.ensureCollections();
        return db.cardSettlementFilialEstabelecimentoLinks.find((row) => String(row.id) === String(id)) ?? null;
    }
    buildKey(input) {
        return [
            normalizeTenant(input.tenant_id),
            String(input.adquirente ?? "REDE").toUpperCase(),
            String(input.codigo_estabelecimento ?? "").trim(),
            String(input.filial_codigo ?? "").trim(),
            String(input.numero_maquininha ?? "").trim(),
        ].join("|");
    }
    upsert(input) {
        this.ensureCollections();
        const createdAt = nowIso();
        const normalized = {
            id: asNullableString(input.id) ?? `FEL-${Date.now()}-${randomUUID().slice(0, 8)}`,
            tenant_id: normalizeTenant(input.tenant_id),
            empresa_id: asNullableString(input.empresa_id),
            filial_id: asNullableString(input.filial_id) ?? asNullableString(input.filial_codigo),
            filial_codigo: asNullableString(input.filial_codigo),
            regional: asNullableString(input.regional),
            nome_filial: asNullableString(input.nome_filial),
            adquirente: String(asNullableString(input.adquirente) ?? "REDE").toUpperCase(),
            codigo_estabelecimento: asNullableString(input.codigo_estabelecimento),
            nome_estabelecimento: asNullableString(input.nome_estabelecimento),
            nome_estabelecimento_normalized: normalizeName(input.nome_estabelecimento),
            nome_maquininha: asNullableString(input.nome_maquininha),
            nome_maquininha_normalized: normalizeName(input.nome_maquininha),
            numero_maquininha: asNullableString(input.numero_maquininha),
            situacao: asNullableString(input.situacao),
            quantidade_maquininhas: input.quantidade_maquininhas == null ? null : Number(input.quantidade_maquininhas),
            cnpj_filial: asNullableString(input.cnpj_filial),
            ativo: asBool(input.ativo, true),
            origem_importacao: asNullableString(input.origem_importacao),
            metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
            created_at: asNullableString(input.created_at) ?? createdAt,
            updated_at: createdAt,
        };
        if (!normalized.filial_codigo || !normalized.codigo_estabelecimento) {
            throw new Error("filial_codigo e codigo_estabelecimento sao obrigatorios para vinculo.");
        }
        const key = this.buildKey(normalized);
        const index = db.cardSettlementFilialEstabelecimentoLinks.findIndex((row) => this.buildKey(row) === key);
        if (index >= 0) {
            const next = {
                ...db.cardSettlementFilialEstabelecimentoLinks[index],
                ...normalized,
                id: db.cardSettlementFilialEstabelecimentoLinks[index].id,
                created_at: db.cardSettlementFilialEstabelecimentoLinks[index].created_at,
                updated_at: createdAt,
            };
            db.cardSettlementFilialEstabelecimentoLinks[index] = next;
            return { row: next, operation: "updated" };
        }
        db.cardSettlementFilialEstabelecimentoLinks.push(normalized);
        return { row: normalized, operation: "inserted" };
    }
    updateById(id, patch) {
        this.ensureCollections();
        const index = db.cardSettlementFilialEstabelecimentoLinks.findIndex((row) => String(row.id) === String(id));
        if (index < 0)
            return null;
        const current = db.cardSettlementFilialEstabelecimentoLinks[index];
        const next = {
            ...current,
            ...patch,
            tenant_id: normalizeTenant(patch.tenant_id ?? current.tenant_id),
            adquirente: String(asNullableString(patch.adquirente ?? current.adquirente) ?? "REDE").toUpperCase(),
            filial_id: asNullableString(patch.filial_id ?? current.filial_id) ?? asNullableString(patch.filial_codigo ?? current.filial_codigo),
            filial_codigo: asNullableString(patch.filial_codigo ?? current.filial_codigo),
            codigo_estabelecimento: asNullableString(patch.codigo_estabelecimento ?? current.codigo_estabelecimento),
            nome_estabelecimento: asNullableString(patch.nome_estabelecimento ?? current.nome_estabelecimento),
            nome_maquininha: asNullableString(patch.nome_maquininha ?? current.nome_maquininha),
            nome_estabelecimento_normalized: normalizeName(patch.nome_estabelecimento ?? current.nome_estabelecimento),
            nome_maquininha_normalized: normalizeName(patch.nome_maquininha ?? current.nome_maquininha),
            ativo: patch.ativo == null ? current.ativo : asBool(patch.ativo, current.ativo),
            updated_at: nowIso(),
        };
        db.cardSettlementFilialEstabelecimentoLinks[index] = next;
        return next;
    }
    findActiveByEstablishment(adquirente, codigoEstabelecimento, tenantId = "default") {
        const code = asNullableString(codigoEstabelecimento);
        if (!code)
            return [];
        return this.list({
            tenantId,
            adquirente: adquirente ?? "REDE",
            ativo: true,
        }).filter((row) => String(row.codigo_estabelecimento) === String(code));
    }
    findActiveByNormalizedName(adquirente, normalizedName, tenantId = "default") {
        const target = normalizeName(normalizedName);
        if (!target)
            return [];
        return this.list({
            tenantId,
            adquirente: adquirente ?? "REDE",
            ativo: true,
        }).filter((row) => row.nome_estabelecimento_normalized === target || row.nome_maquininha_normalized === target);
    }
    getAmbiguousEstablishments(adquirente, tenantId = "default") {
        const rows = this.list({ tenantId, adquirente, ativo: true });
        const map = new Map();
        for (const row of rows) {
            const code = String(row.codigo_estabelecimento ?? "").trim();
            if (!code)
                continue;
            const current = map.get(code) ?? new Set();
            current.add(String(row.filial_codigo ?? "").trim());
            map.set(code, current);
        }
        return Array.from(map.entries())
            .filter(([, filialSet]) => filialSet.size > 1)
            .map(([codigo_estabelecimento, filialSet]) => ({
            codigo_estabelecimento,
            filiais: Array.from(filialSet.values()).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" })),
        }));
    }
}
