import { randomUUID } from "node:crypto";
import path from "node:path";
import * as XLSX from "xlsx";
import { z } from "zod";
import { hasRedeConfig } from "../config/env.js";
import { DivergenciasAnalyticsService, } from "../modules/reconai/divergenciasAnalyticsService.js";
import { CaixaAuditService } from "../modules/reconai/caixaAuditService.js";
import { reconaiStore } from "../modules/reconai/reconaiStore.js";
import { RedeChargebackService } from "../modules/reconai/redeChargebackService.js";
import { RedeCrossValidationService } from "../modules/reconai/redeCrossValidationService.js";
import { RedeModule } from "../modules/reconai/redeModule.js";
import { RedeWinthorConfrontoService } from "../modules/reconai/redeWinthorConfrontoService.js";
import { WinthorCardReceivablesService } from "../modules/reconai/winthorCardReceivablesService.js";
import { registerRedeSalesValidationModule } from "../modules/rede-sales-validation/rede-sales-validation.module.js";
import { registerCardReceivableSettlementModule } from "../modules/card-receivable-settlement/card-receivable-settlement.module.js";
import { db } from "../repositories/dataStore.js";
const filtroQuerySchema = z.object({
    dataInicio: z.string().trim().optional(),
    dataFim: z.string().trim().optional(),
    filial: z.string().trim().optional(),
    operadora: z.string().trim().optional(),
    bandeira: z.string().trim().optional(),
    modalidade: z.string().trim().optional(),
    status: z.string().trim().optional(),
    criticidade: z.string().trim().optional(),
    responsavel: z.string().trim().optional(),
    nsu: z.string().trim().optional(),
    autorizacao: z.string().trim().optional(),
    vendaNumero: z.string().trim().optional(),
    cliente: z.string().trim().optional(),
    contextoDia: z.string().trim().optional(),
    contextoFilial: z.string().trim().optional(),
    drillOperadora: z.string().trim().optional(),
    drillBandeira: z.string().trim().optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(200).optional(),
    ordenacao: z.enum(["maior-divergencia", "menor-divergencia", "filial"]).optional(),
});
const paramsSchema = z.object({
    id: z.string().trim().min(1),
});
const atribuirBodySchema = z.object({
    responsavel: z.string().trim().min(1),
});
const validacaoRedeQuerySchema = filtroQuerySchema.extend({
    dataInicioRede: z.string().trim().optional(),
    dataFimRede: z.string().trim().optional(),
    limiteLista: z.coerce.number().int().min(1).max(500).optional(),
});
const validacaoTransacaoQuerySchema = z.object({
    janelaDias: z.coerce.number().int().min(0).max(15).optional(),
});
const confrontoListagemQuerySchema = filtroQuerySchema.extend({
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(200).optional(),
});
const chargebackQuerySchema = z.object({
    merchantId: z.string().trim().optional(),
    openingDate: z.string().trim().optional(),
    page: z.coerce.number().int().min(1).optional(),
    size: z.coerce.number().int().min(1).max(500).optional(),
    processNumber: z.string().trim().optional(),
    chargebackId: z.string().trim().optional(),
    transactionDate: z.string().trim().optional(),
    uniqueSequentialNumber: z.string().trim().optional(),
    paymentTypeCode: z.string().trim().optional(),
});
const chargebackHistoryByProcessQuerySchema = chargebackQuerySchema.extend({
    processNumber: z.string().trim().min(1),
});
const redeSyncBodySchema = z.object({
    startDate: z.string().trim().optional(),
    endDate: z.string().trim().optional(),
});
const iaPerguntaBodySchema = z.object({
    pergunta: z.string().trim().min(1).max(1000),
});
const relatorioFormatoSchema = z.object({
    formato: z.enum(["csv", "xlsx"]),
});
const relatorioPayloadSchema = z.object({
    dataInicio: z.string().trim().optional(),
    dataFim: z.string().trim().optional(),
    filial: z.string().trim().optional(),
    operadora: z.string().trim().optional(),
});
const configuracoesSchema = z.object({
    empresas: z.array(z.object({
        id: z.string().trim().min(1),
        nome: z.string().trim().min(1),
        cnpj: z.string().trim().min(1),
        ativa: z.boolean(),
    })),
    filiais: z.array(z.object({
        id: z.string().trim().min(1),
        empresaId: z.string().trim().min(1),
        codigo: z.string().trim().min(1),
        nome: z.string().trim().min(1),
        ativa: z.boolean(),
    })),
    operadoras: z.array(z.object({
        id: z.string().trim().min(1),
        nome: z.string().trim().min(1),
        codigo: z.string().trim().min(1),
        ativa: z.boolean(),
    })),
    taxas: z.array(z.object({
        id: z.string().trim().min(1),
        operadoraId: z.string().trim().min(1),
        modalidade: z.string().trim().min(1),
        percentual: z.coerce.number().finite(),
    })),
});
const conciliacaoQuerySchema = z.object({
    filial: z.string().trim().optional(),
    data: z.string().trim().optional(),
    valorMin: z.coerce.number().optional(),
    valorMax: z.coerce.number().optional(),
    status: z.string().trim().optional(),
    risco: z.string().trim().optional(),
    operadora: z.string().trim().optional(),
});
const conciliacaoManualBodySchema = z.object({
    observacao: z.string().trim().optional(),
});
function getAuditActor(req) {
    const authUser = req?.authUser ?? {};
    const requestIdHeader = req?.headers?.["x-request-id"];
    const requestId = typeof requestIdHeader === "string" && requestIdHeader.trim().length > 0
        ? requestIdHeader.trim()
        : randomUUID();
    return {
        userId: authUser?.sub ? String(authUser.sub) : "anonymous",
        userName: authUser?.nome ? String(authUser.nome) : "anonymous",
        perfil: authUser?.perfil ? String(authUser.perfil) : "SEM_PERFIL",
        ipOrigem: req?.ip ? String(req.ip) : "",
        userAgent: typeof req?.headers?.["user-agent"] === "string" ? req.headers["user-agent"] : "",
        correlationId: req?.correlationId ? String(req.correlationId) : randomUUID(),
        requestId,
    };
}
function toFilters(query) {
    return {
        dataInicio: query.dataInicio,
        dataFim: query.dataFim,
        filial: query.filial,
        operadora: query.operadora,
        bandeira: query.bandeira,
        modalidade: query.modalidade,
        status: query.status,
        criticidade: query.criticidade,
        responsavel: query.responsavel,
        nsu: query.nsu,
        autorizacao: query.autorizacao,
        vendaNumero: query.vendaNumero,
        cliente: query.cliente,
        contextoDia: query.contextoDia,
        contextoFilial: query.contextoFilial,
        drillOperadora: query.drillOperadora,
        drillBandeira: query.drillBandeira,
    };
}
function defaultDateRange() {
    const today = new Date();
    const endDate = today.toISOString().slice(0, 10);
    const startDateRef = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startDate = startDateRef.toISOString().slice(0, 10);
    return { startDate, endDate };
}
function round2(value) {
    return Number(value.toFixed(2));
}
function toNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
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
        return "";
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim();
}
function includesNormalized(base, search) {
    if (!search || !search.trim())
        return true;
    return normalizeToken(base).includes(normalizeToken(search));
}
function normalizeConciliacaoStatus(value) {
    const token = normalizeToken(typeof value === "string" ? value : "");
    if (token === "CONCILIADO")
        return "CONCILIADO";
    if (token === "DIVERGENTE")
        return "DIVERGENTE";
    if (token === "NAO_LOCALIZADO")
        return "NAO_LOCALIZADO";
    if (token === "EM_ANALISE")
        return "EM_ANALISE";
    return "PENDENTE";
}
function normalizeConciliacaoRisco(value) {
    const token = normalizeToken(typeof value === "string" ? value : "");
    if (token === "CRITICO")
        return "CRITICO";
    if (token === "ALTO")
        return "ALTO";
    if (token === "MEDIO")
        return "MEDIO";
    return "BAIXO";
}
function asNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function asString(value, fallback = "-") {
    if (typeof value !== "string")
        return fallback;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
}
function inDateRange(dateIso, startIso, endIso) {
    return dateIso >= startIso && dateIso <= endIso;
}
function mapWinthorVendaToConciliacao(row, index, defaultDate) {
    const filial = String(row.codfilial ?? "SEM_FILIAL").trim() || "SEM_FILIAL";
    const pedido = row.numped == null ? `SEM_PEDIDO_${index + 1}` : String(row.numped).trim();
    const dataVenda = toIsoDate(row.dataVenda ?? undefined) ?? defaultDate;
    const valorWinthor = round2(toNumber(row.valorPedido) > 0 ? toNumber(row.valorPedido) : toNumber(row.valorItens));
    const valorRecebido = 0;
    const diferenca = round2(valorRecebido - valorWinthor);
    const risco = riscoFromValue(Math.abs(valorWinthor));
    const status = valorRecebido > 0 ? "CONCILIADO" : "PENDENTE";
    const id = ["CONC", filial, pedido, dataVenda, row.codcob ?? "SEM_CODCOB"].join("-");
    return {
        id,
        dataVenda,
        filial,
        cliente: row.codcli == null ? "-" : String(row.codcli),
        pedido,
        nota: "-",
        nsu: row.nsu?.trim() || "-",
        autorizacao: row.codAutorizacao == null ? "-" : String(row.codAutorizacao),
        operadora: "WINTHOR",
        valorVenda: valorWinthor,
        valorRecebido,
        valorWinthor,
        diferenca,
        taxa: 0,
        status,
        score: status === "CONCILIADO" ? 100 : 40,
        risco,
        dossieId: null,
    };
}
function mapFallbackSnapshotToConciliacao(row) {
    const dataVenda = toIsoDate(row?.dataVenda) ?? new Date().toISOString().slice(0, 10);
    const valorVenda = round2(asNumber(row?.valorVenda));
    const valorRecebido = round2(asNumber(row?.valorRecebido));
    const valorWinthor = round2(asNumber(row?.valorEsperado) > 0 ? asNumber(row?.valorEsperado) : valorVenda);
    const diferenca = round2(valorRecebido - valorWinthor);
    const status = normalizeConciliacaoStatus(row?.statusVisual || row?.statusConciliacao);
    const risco = normalizeConciliacaoRisco(row?.criticidade || row?.risco);
    return {
        id: asString(row?.id, `CACHE-${Math.random().toString(36).slice(2, 9)}`),
        dataVenda,
        filial: asString(row?.filialCodigo || row?.filial, "SEM_FILIAL"),
        cliente: asString(row?.cliente),
        pedido: asString(row?.pedido || row?.numeroVenda),
        nota: asString(row?.cupom),
        nsu: asString(row?.nsu),
        autorizacao: asString(row?.autorizacao),
        operadora: asString(row?.operadora, "WINTHOR"),
        valorVenda,
        valorRecebido,
        valorWinthor,
        diferenca,
        taxa: round2(asNumber(row?.taxaDesconto)),
        status,
        score: typeof row?.scoreMatch === "number" ? Math.max(0, Math.min(100, Math.trunc(row.scoreMatch))) : status === "CONCILIADO" ? 100 : 40,
        risco,
        dossieId: null,
    };
}
function mapCachedConciliacaoRow(row) {
    const dataVenda = toIsoDate(typeof row.dataVenda === "string" ? row.dataVenda : undefined) ?? new Date().toISOString().slice(0, 10);
    const status = normalizeConciliacaoStatus(row.status);
    return {
        id: asString(row.id),
        dataVenda,
        filial: asString(row.filial, "SEM_FILIAL"),
        cliente: asString(row.cliente),
        pedido: asString(row.pedido),
        nota: asString(row.nota),
        nsu: asString(row.nsu),
        autorizacao: asString(row.autorizacao),
        operadora: asString(row.operadora, "WINTHOR"),
        valorVenda: round2(asNumber(row.valorVenda)),
        valorRecebido: round2(asNumber(row.valorRecebido)),
        valorWinthor: round2(asNumber(row.valorWinthor)),
        diferenca: round2(asNumber(row.diferenca)),
        taxa: round2(asNumber(row.taxa)),
        status,
        score: typeof row.score === "number" ? Math.max(0, Math.min(100, Math.trunc(row.score))) : status === "CONCILIADO" ? 100 : 40,
        risco: normalizeConciliacaoRisco(row.risco),
        dossieId: (typeof row.dossieId === "string" && row.dossieId.trim().length > 0) ? row.dossieId : null,
    };
}
function resolveConciliacaoRange(data) {
    const iso = toIsoDate(data);
    if (iso) {
        return { dataInicio: iso, dataFim: iso };
    }
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    return {
        dataInicio: start.toISOString().slice(0, 10),
        dataFim: end.toISOString().slice(0, 10),
    };
}
function riscoFromValue(value) {
    if (value >= 10000)
        return "CRITICO";
    if (value >= 5000)
        return "ALTO";
    if (value >= 1000)
        return "MEDIO";
    return "BAIXO";
}
function toDateLabel(isoDate) {
    if (!isoDate)
        return "-";
    return isoDate;
}
function safeArray(value) {
    return Array.isArray(value) ? value : [];
}
function ensureRecebiveisImportacoesStore() {
    const current = db.reconaiImportacoes;
    if (!Array.isArray(current)) {
        db.reconaiImportacoes = [];
    }
    return db.reconaiImportacoes;
}
function ensureRecebiveisConfigStore() {
    const current = db.reconaiRecebiveisConfiguracoes;
    if (!current || typeof current !== "object") {
        db.reconaiRecebiveisConfiguracoes = null;
    }
    return db.reconaiRecebiveisConfiguracoes;
}
function inferImportFormat(fileName) {
    const extension = path.extname(fileName).toLowerCase();
    return extension === ".xlsx" || extension === ".xls" ? "XLSX" : "CSV";
}
function parseCsvLine(line) {
    const delimiter = line.includes(";") ? ";" : ",";
    return line.split(delimiter).map((token) => token.trim());
}
function previewFromCsv(buffer) {
    const text = buffer.toString("utf8").replace(/^\uFEFF/, "");
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length === 0) {
        return { totalLinhas: 0, linhasValidas: 0, linhasComErro: 0, preview: [] };
    }
    const header = parseCsvLine(lines[0]);
    const preview = [];
    let linhasValidas = 0;
    let linhasComErro = 0;
    for (let index = 1; index < lines.length; index += 1) {
        const values = parseCsvLine(lines[index]);
        const dados = {};
        header.forEach((column, columnIndex) => {
            dados[column || `coluna_${columnIndex + 1}`] = values[columnIndex] ?? null;
        });
        const hasData = Object.values(dados).some((value) => value != null && String(value).trim().length > 0);
        const status = hasData ? "VALIDA" : "ERRO";
        if (status === "VALIDA")
            linhasValidas += 1;
        else
            linhasComErro += 1;
        if (preview.length < 25) {
            preview.push({
                linha: index + 1,
                status,
                mensagem: hasData ? undefined : "Linha sem dados aproveitaveis.",
                dados,
            });
        }
    }
    return {
        totalLinhas: Math.max(0, lines.length - 1),
        linhasValidas,
        linhasComErro,
        preview,
    };
}
function previewFromXlsx(buffer) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
        return { totalLinhas: 0, linhasValidas: 0, linhasComErro: 0, preview: [] };
    }
    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
    const preview = [];
    let linhasValidas = 0;
    let linhasComErro = 0;
    rows.forEach((row, index) => {
        const dados = {};
        Object.entries(row).forEach(([key, value]) => {
            if (value == null) {
                dados[key] = null;
            }
            else if (typeof value === "number") {
                dados[key] = value;
            }
            else {
                dados[key] = String(value);
            }
        });
        const hasData = Object.values(dados).some((value) => value != null && String(value).trim().length > 0);
        const status = hasData ? "VALIDA" : "ERRO";
        if (status === "VALIDA")
            linhasValidas += 1;
        else
            linhasComErro += 1;
        if (preview.length < 25) {
            preview.push({
                linha: index + 2,
                status,
                mensagem: hasData ? undefined : "Linha sem dados aproveitaveis.",
                dados,
            });
        }
    });
    return {
        totalLinhas: rows.length,
        linhasValidas,
        linhasComErro,
        preview,
    };
}
async function collectAllValidationItems(redeSalesValidationService, batchId) {
    const pageSize = 200;
    let page = 1;
    const items = [];
    while (true) {
        const chunk = redeSalesValidationService.getValidationItems(batchId, {
            page,
            pageSize,
        });
        const registros = Array.isArray(chunk?.registros) ? chunk.registros : [];
        items.push(...registros);
        const totalPages = Number(chunk?.paginacao?.totalPages ?? 1);
        if (page >= totalPages) {
            break;
        }
        page += 1;
    }
    return items;
}
function buildImportacaoPreviewFromValidation(items) {
    return items.slice(0, 25).map((item) => ({
        linha: Number(item.row_number ?? 0),
        status: previewStatusFromValidation(item.validation_status),
        mensagem: item.reason ?? undefined,
        dados: {
            cnpj_filial: item.branch_cnpj_raw ?? item.branch_cnpj_normalized ?? "-",
            filial_winthor: item.pcfilial_codigo ?? "-",
            data_rede: item.rede_sale_date ?? "-",
            valor_rede: item.rede_amount ?? 0,
            pedido_winthor: item.winthor_numped ?? "-",
            data_winthor: item.winthor_sale_date ?? "-",
            valor_winthor: item.winthor_amount ?? 0,
            diferenca_valor: item.value_difference ?? null,
            status_validacao: item.validation_status ?? "-",
        },
    }));
}
function previewStatusFromValidation(status) {
    const normalized = String(status ?? "");
    if (normalized === "VENDA_VALIDADA")
        return "VALIDA";
    if (normalized === "ANALISE_MANUAL" || normalized === "MATCH_PROVAVEL")
        return "ANALISE";
    return "DIVERGENCIA";
}
function validationDivergenceCount(summary, totalLinhas, linhasValidas) {
    const explicit = Number(summary?.total_divergencias ?? NaN);
    if (Number.isFinite(explicit))
        return Math.max(0, explicit);
    return Math.max(0, Number(totalLinhas ?? 0) - Number(linhasValidas ?? 0));
}
function normalizeValidationImportacaoRecord(importacao) {
    if (!importacao?.validacaoBatchId)
        return importacao;
    const totalLinhas = Number(importacao.totalLinhas ?? importacao.resumoValidacao?.total_rows ?? 0);
    const linhasValidas = Number(importacao.linhasValidas ?? importacao.resumoValidacao?.total_validated ?? 0);
    const linhasDivergentes = validationDivergenceCount(importacao.resumoValidacao, totalLinhas, linhasValidas);
    return {
        ...importacao,
        status: linhasDivergentes > 0 ? "PROCESSADA" : "VALIDADA",
        linhasComErro: 0,
        linhasDivergentes,
    };
}
function updateReconaiSnapshotFromValidation(batchId, items) {
    const snapshot = reconaiStore.getSnapshot();
    const sales = items
        .map((item) => {
        const dataVenda = toIsoDate(item.rede_sale_date);
        if (!dataVenda)
            return null;
        const valorVenda = Number(item.rede_amount ?? 0);
        const externalId = item.rede_document ??
            item.rede_nsu ??
            item.rede_authorization ??
            `REDE-IMPORT-${batchId}-${item.row_number ?? randomUUID().slice(0, 8)}`;
        const nsuRaw = item.rede_nsu == null ? null : String(item.rede_nsu);
        const authorizationRaw = item.rede_authorization == null ? null : String(item.rede_authorization);
        const filial = item.winthor_codfilial ??
            item.pcfilial_codigo ??
            item.branch_cnpj_normalized ??
            item.branch_cnpj_raw ??
            null;
        return {
            externalId: String(externalId),
            filial: filial == null ? null : String(filial),
            nsu: nsuRaw,
            authorization: authorizationRaw,
            dataVenda,
            valorVenda: Number.isFinite(valorVenda) ? Number(valorVenda.toFixed(2)) : 0,
            raw: {
                source: "PLANILHA_REDE_VALIDACAO",
                batchId,
                rowNumber: item.row_number ?? null,
                branchCnpjRaw: item.branch_cnpj_raw ?? null,
                branchCnpjNormalized: item.branch_cnpj_normalized ?? null,
                redeDocument: item.rede_document ?? null,
                validationStatus: item.validation_status ?? null,
            },
        };
    })
        .filter((sale) => Boolean(sale));
    reconaiStore.replaceSnapshot({
        syncedAt: new Date().toISOString(),
        sales,
        payments: Array.isArray(snapshot?.payments) ? snapshot.payments : [],
        receivables: Array.isArray(snapshot?.receivables) ? snapshot.receivables : [],
        reconciliations: Array.isArray(snapshot?.reconciliations) ? snapshot.reconciliations : [],
    });
}
function asCsvValue(value) {
    if (value == null)
        return "";
    const raw = String(value);
    if (raw.includes(",") || raw.includes(";") || raw.includes("\"") || raw.includes("\n")) {
        return `"${raw.replace(/"/g, "\"\"")}"`;
    }
    return raw;
}
export async function recebiveisCartaoRoutes(app) {
    const redeSalesValidationService = await registerRedeSalesValidationModule(app, app.log);
    await registerCardReceivableSettlementModule(app, app.log);
    const service = new DivergenciasAnalyticsService(app.log);
    const redeModule = new RedeModule(app.log);
    const winthorCardService = new WinthorCardReceivablesService(app.log);
    const chargebackService = new RedeChargebackService(app.log);
    const caixaAuditService = new CaixaAuditService(app.log);
    const redeCrossValidationService = new RedeCrossValidationService(app.log, service, redeModule.redeService);
    const redeWinthorConfrontoService = new RedeWinthorConfrontoService(app.log, service, redeModule.redeService, winthorCardService);
    const conciliacaoCache = new Map();
    let fallbackMeta = null;
    let fallbackLoad = null;
    let winthorLastSyncAt = null;
    function getConciliacaoCacheRows(range) {
        const cacheSnapshotRows = Array.isArray(db.reconaiWinthorRows)
            ? db.reconaiWinthorRows
                .map((row) => mapFallbackSnapshotToConciliacao(row))
                .filter((row) => inDateRange(row.dataVenda, range.dataInicio, range.dataFim))
            : [];
        if (cacheSnapshotRows.length > 0) {
            return { rows: cacheSnapshotRows, fonte: "CACHE_SNAPSHOT" };
        }
        const cacheConciliacaoRows = Array.from(conciliacaoCache.values())
            .map((row) => mapCachedConciliacaoRow(row))
            .filter((row) => inDateRange(row.dataVenda, range.dataInicio, range.dataFim));
        if (cacheConciliacaoRows.length > 0) {
            return { rows: cacheConciliacaoRows, fonte: "CACHE_CONCILIACAO" };
        }
        return { rows: [], fonte: "CACHE_VAZIO" };
    }
    async function loadConciliacaoRegistros(input) {
        const range = resolveConciliacaoRange(input.data);
        let fonte = "ORACLE";
        let mapped = [];
        const cachedRows = getConciliacaoCacheRows(range);
        if (cachedRows.rows.length > 0) {
            mapped = cachedRows.rows;
            fonte = cachedRows.fonte;
        }
        else {
        try {
            let timeoutId;
            const oraclePromise = winthorCardService
                .getVendasFaturadasCartao(range.dataInicio, range.dataFim, false)
                .then((result) => ({
                status: "loaded",
                rows: result.rows.map((row, index) => mapWinthorVendaToConciliacao(row, index, range.dataInicio)),
            }))
                .catch((error) => ({
                status: "error",
                error,
            }));
            const timeoutPromise = new Promise((resolve) => {
                timeoutId = setTimeout(() => resolve({ status: "timeout" }), 1800);
            });
            const result = await Promise.race([oraclePromise, timeoutPromise]);
            clearTimeout(timeoutId);
            if (result.status === "loaded") {
                mapped = result.rows;
            }
            else if (result.status === "timeout") {
                fonte = "CACHE_EM_CARGA";
                void primeWinthorFallbackForDivergencias({ dataInicio: range.dataInicio });
                app.log.warn({
                    component: "recebiveisCartaoRoutes",
                    action: "loadConciliacaoRegistros",
                    range,
                }, "Consulta WinThor da conciliacao ainda em andamento; respondendo sem bloquear a API.");
            }
            else {
                throw result.error;
            }
        }
        catch (error) {
            const fallbackRows = getConciliacaoCacheRows(range);
            if (fallbackRows.rows.length > 0) {
                mapped = fallbackRows.rows;
                fonte = fallbackRows.fonte;
            }
            else {
                mapped = [];
                fonte = "CACHE_INDISPONIVEL";
            }
            app.log.warn({
                component: "recebiveisCartaoRoutes",
                action: "loadConciliacaoRegistros",
                fonte,
                range,
                rows: mapped.length,
                error,
            }, "Oracle indisponivel para conciliacao; retornando cache local.");
        }
        }
        const filtered = mapped.filter((row) => {
            if (!includesNormalized(row.filial, input.filial))
                return false;
            if (!includesNormalized(row.operadora, input.operadora))
                return false;
            if (typeof input.valorMin === "number" && row.valorVenda < input.valorMin)
                return false;
            if (typeof input.valorMax === "number" && row.valorVenda > input.valorMax)
                return false;
            if (input.status && input.status !== "ALL" && normalizeToken(row.status) !== normalizeToken(input.status))
                return false;
            if (input.risco && input.risco !== "ALL" && normalizeToken(row.risco) !== normalizeToken(input.risco))
                return false;
            return true;
        });
        for (const row of filtered) {
            conciliacaoCache.set(row.id, row);
        }
        return {
            range,
            registros: filtered,
            total: filtered.length,
            fonte,
        };
    }
    async function primeWinthorFallbackForDivergencias(filters) {
        const range = resolveConciliacaoRange(filters.dataInicio || filters.contextoDia);
        if (fallbackMeta &&
            fallbackMeta.dataInicio === range.dataInicio &&
            fallbackMeta.dataFim === range.dataFim &&
            Date.now() - fallbackMeta.loadedAtMs < 180_000 &&
            Array.isArray(db.reconaiWinthorRows) &&
            db.reconaiWinthorRows.length > 0) {
            return;
        }
        const key = `${range.dataInicio}|${range.dataFim}`;
        if (!fallbackLoad || fallbackLoad.key !== key) {
            const loadPromise = (async () => {
                try {
                    const result = await winthorCardService.getVendasFaturadasCartao(range.dataInicio, range.dataFim, false);
                    const rows = result.rows.map((row, index) => {
                        const filialCodigo = String(row.codfilial ?? "SEM_FILIAL").trim() || "SEM_FILIAL";
                        const pedido = row.numped == null ? null : String(row.numped).trim();
                        const dataVenda = toIsoDate(row.dataVenda ?? undefined) ?? range.dataInicio;
                        const valorVenda = round2(toNumber(row.valorPedido) > 0 ? toNumber(row.valorPedido) : toNumber(row.valorItens));
                        const id = ["WINTHOR", filialCodigo, pedido ?? `SEM_PEDIDO_${index + 1}`, dataVenda].join("-");
                        return {
                            id,
                            filialCodigo,
                            filialNome: row.nomeFilial?.trim() || `Filial ${filialCodigo}`,
                            dataVenda,
                            dataPrevistaRecebimento: null,
                            dataRecebimento: null,
                            numeroVenda: pedido ?? id,
                            pedido,
                            cupom: null,
                            nsu: row.nsu?.trim() || null,
                            autorizacao: row.codAutorizacao == null ? null : String(row.codAutorizacao),
                            operadora: "WINTHOR",
                            bandeira: "N/D",
                            modalidade: row.descricaoCobranca?.trim() || "CARTAO",
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
                            historico: [],
                        };
                    });
                    db.reconaiWinthorRows = rows;
                    fallbackMeta = {
                        dataInicio: range.dataInicio,
                        dataFim: range.dataFim,
                        loadedAtMs: Date.now(),
                    };
                }
                catch (error) {
                    app.log.warn({
                        component: "recebiveisCartaoRoutes",
                        action: "primeWinthorFallbackForDivergencias",
                        error,
                        range,
                    }, "Nao foi possivel carregar fallback do WinThor para divergencias.");
                }
                finally {
                    if (fallbackLoad?.promise === loadPromise) {
                        fallbackLoad = null;
                    }
                }
            })();
            fallbackLoad = { key, promise: loadPromise, startedAtMs: Date.now() };
        }
        let timeoutId;
        const timeout = new Promise((resolve) => {
            timeoutId = setTimeout(() => resolve("timeout"), 1800);
        });
        const result = await Promise.race([fallbackLoad.promise.then(() => "loaded"), timeout]);
        clearTimeout(timeoutId);
        if (result === "timeout") {
            app.log.warn({
                component: "recebiveisCartaoRoutes",
                action: "primeWinthorFallbackForDivergencias",
                range,
                elapsedMs: Date.now() - fallbackLoad.startedAtMs,
            }, "Carga WinThor ainda em andamento; respondendo divergencias com cache atual.");
        }
    }
    function buildRecebiveisConfigDefault() {
        const filterOptions = service.getFilterOptions();
        const empresas = [
            {
                id: "EMP-001",
                nome: "Rodrigues Industria e Comercio de Colchoes S/A",
                cnpj: "41.032.961/0001-65",
                ativa: true,
            },
        ];
        const filiais = (filterOptions.filiais.length > 0 ? filterOptions.filiais : ["1B"]).map((codigo, index) => ({
            id: `FIL-${String(index + 1).padStart(3, "0")}`,
            empresaId: "EMP-001",
            codigo,
            nome: `Filial ${codigo}`,
            ativa: true,
        }));
        const operadoras = (filterOptions.operadoras.length > 0 ? filterOptions.operadoras : ["REDE", "WINTHOR"]).map((nome, index) => ({
            id: `OPR-${String(index + 1).padStart(3, "0")}`,
            nome,
            codigo: nome.toUpperCase().replace(/\s+/g, "_"),
            ativa: true,
        }));
        const taxas = operadoras.map((item, index) => ({
            id: `TX-${String(index + 1).padStart(3, "0")}`,
            operadoraId: item.id,
            modalidade: "PADRAO",
            percentual: 0,
        }));
        return { empresas, filiais, operadoras, taxas };
    }
    function getRecebiveisConfigSnapshot() {
        const existing = ensureRecebiveisConfigStore();
        if (existing)
            return existing;
        const fallback = buildRecebiveisConfigDefault();
        db.reconaiRecebiveisConfiguracoes = fallback;
        return fallback;
    }
    app.get("/api/recebiveis-cartao/rede/status", async () => {
        const snapshot = reconaiStore.getSnapshot();
        const ultimaSincronizacao = snapshot.syncedAt;
        if (!hasRedeConfig()) {
            return {
                status: "OFFLINE",
                mensagem: "Credenciais da REDE nao configuradas. Defina REDE_BASE_URL, REDE_CLIENT_ID e REDE_CLIENT_SECRET.",
                ultimaSincronizacao,
            };
        }
        try {
            await redeModule.authService.getAccessToken();
            if (!ultimaSincronizacao) {
                return {
                    status: "ATENCAO",
                    mensagem: "API autenticada com sucesso. Execute a sincronizacao para carregar os dados.",
                    ultimaSincronizacao,
                };
            }
            return {
                status: "ONLINE",
                mensagem: "API da REDE conectada e sincronizacao disponivel.",
                ultimaSincronizacao,
            };
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Falha ao autenticar na API da REDE.";
            return {
                status: "OFFLINE",
                mensagem: message,
                ultimaSincronizacao,
            };
        }
    });
    app.get("/api/recebiveis-cartao/rede/indicadores", async () => {
        const snapshot = reconaiStore.getSnapshot();
        const vendas = snapshot.sales.reduce((sum, row) => sum + toNumber(row.valorVenda), 0);
        const recebimentos = snapshot.payments.reduce((sum, row) => sum + (toNumber(row.valorRecebido) || toNumber(row.valorBruto)), 0);
        const divergencias = snapshot.reconciliations.reduce((sum, row) => {
            if (row.status === "CONCILIADO")
                return sum;
            return sum + Math.abs(toNumber(row.diferenca_total));
        }, 0);
        return {
            vendas: round2(vendas),
            recebimentos: round2(recebimentos),
            divergencias: round2(divergencias),
        };
    });
    app.post("/api/recebiveis-cartao/rede/sincronizar", async (req) => {
        const body = redeSyncBodySchema.parse(req.body ?? {});
        const defaults = defaultDateRange();
        const startDate = body.startDate || defaults.startDate;
        const endDate = body.endDate || defaults.endDate;
        const result = await redeModule.redeService.sync(startDate, endDate);
        return {
            status: "ONLINE",
            mensagem: `Sincronizacao concluida: ${result.summary.totalReconciliations} transacoes analisadas.`,
            ultimaSincronizacao: result.syncedAt,
            janela: { startDate, endDate },
            resumo: result.summary,
        };
    });
    app.get("/api/recebiveis-cartao/visao-geral", async () => {
        await primeWinthorFallbackForDivergencias({});
        const resumo = service.getResumo({});
        const comparativoDia = service.getComparativoDia({}).registros;
        const comparativoFilial = service.getComparativoFilial({}, "maior-divergencia").registros;
        const drilldown = service.getDrilldownOperadoraBandeira({}).registros;
        const transacoes = service.listTransacoesParaValidacao({});
        const totalConciliado = round2(Math.max(0, resumo.totalEsperado - resumo.totalDivergente));
        const recebidosNaoBaixados = round2(transacoes
            .filter((row) => row.statusConciliacao === "NAO_BAIXADO" || row.statusConciliacao === "RECEBIDO_NAO_BAIXADO")
            .reduce((sum, row) => sum + Math.max(0, row.valorRecebido || row.valorEsperado), 0));
        const titulosEmAberto = round2(transacoes
            .filter((row) => row.statusVisual !== "CONCILIADO")
            .reduce((sum, row) => sum + Math.max(0, row.valorEmAberto || row.valorEsperado - row.valorRecebido), 0));
        const dinheiroRecuperavel = round2(transacoes
            .filter((row) => row.statusVisual === "DIVERGENTE" || row.statusVisual === "PENDENTE")
            .reduce((sum, row) => sum + Math.max(0, Math.abs(row.valorDivergencia)), 0));
        const divergenciasPorTipoMap = new Map();
        for (const row of transacoes) {
            const key = row.statusConciliacao || row.statusVisual;
            divergenciasPorTipoMap.set(key, (divergenciasPorTipoMap.get(key) ?? 0) + Math.abs(row.valorDivergencia));
        }
        const divergenciasPorTipo = Array.from(divergenciasPorTipoMap.entries())
            .map(([nome, valor]) => ({ nome, valor: round2(valor) }))
            .sort((a, b) => b.valor - a.valor)
            .slice(0, 8);
        const vendasVsRecebimentos = comparativoDia.map((item) => ({
            periodo: item.data,
            valorA: round2(item.totalVendido),
            valorB: round2(item.totalRecebido),
        }));
        const diasComMaioresDiferencas = [...comparativoDia]
            .sort((a, b) => b.totalDivergente - a.totalDivergente)
            .slice(0, 10)
            .map((item) => ({ periodo: item.data, valorA: round2(item.totalDivergente) }));
        const filialMaisProblematica = [...comparativoFilial].sort((a, b) => b.totalDivergente - a.totalDivergente)[0];
        const operadoraMaiorErro = [...drilldown].sort((a, b) => b.totalDivergente - a.totalDivergente)[0];
        const diaCritico = [...comparativoDia].sort((a, b) => b.totalDivergente - a.totalDivergente)[0];
        return {
            metricas: {
                totalVendido: round2(resumo.totalVendido),
                totalRecebido: round2(resumo.totalRecebido),
                totalConciliado,
                totalDivergente: round2(resumo.totalDivergente),
                dinheiroEmRisco: round2(resumo.totalDivergente),
                dinheiroRecuperavel,
                recebidosNaoBaixados,
                titulosEmAberto,
            },
            vendasVsRecebimentos,
            divergenciasPorTipo,
            divergenciasPorFilial: comparativoFilial.slice(0, 10).map((item) => ({
                nome: `${item.filialCodigo} - ${item.filialNome}`,
                valor: round2(item.totalDivergente),
            })),
            divergenciasPorOperadora: [...drilldown]
                .sort((a, b) => b.totalDivergente - a.totalDivergente)
                .slice(0, 10)
                .map((item) => ({
                nome: item.operadora,
                valor: round2(item.totalDivergente),
            })),
            diasComMaioresDiferencas,
            insightsIa: {
                filialMaisProblematica: filialMaisProblematica
                    ? `${filialMaisProblematica.filialCodigo} - ${filialMaisProblematica.filialNome}`
                    : "-",
                operadoraMaiorErro: operadoraMaiorErro?.operadora ?? "-",
                diaCritico: diaCritico?.data ?? "-",
                recomendacao: resumo.quantidadeDivergencias > 0
                    ? "Priorizar tratativa das filiais com maior divergencia e revisar baixas pendentes no WinThor."
                    : "Nenhuma divergencia critica no periodo atual.",
            },
        };
    });
    app.get("/api/recebiveis-cartao/winthor/conexao", async () => {
        const health = await redeModule.winThorService.health();
        return {
            status: health.status === "UP" ? "ONLINE" : "OFFLINE",
            mensagem: health.detail,
            ultimaSincronizacao: winthorLastSyncAt,
        };
    });
    app.post("/api/recebiveis-cartao/winthor/sincronizar", async () => {
        const range = defaultDateRange();
        await winthorCardService.getVendasFaturadasCartao(range.startDate, range.endDate, false);
        winthorLastSyncAt = new Date().toISOString();
        return {
            status: "ONLINE",
            mensagem: "Sincronizacao WinThor concluida com sucesso.",
            ultimaSincronizacao: winthorLastSyncAt,
        };
    });
    app.get("/api/recebiveis-cartao/winthor/titulos", async () => {
        const range = defaultDateRange();
        try {
            const rows = await redeModule.winThorService.getReceivables(range.startDate, range.endDate);
            const registros = rows.slice(0, 200).map((row, index) => ({
                id: `${row.numped ?? row.duplic ?? "TIT"}-${row.prest ?? index + 1}`,
                cliente: row.cliente || row.documento || "Cliente nao informado",
                valor: round2(toNumber(row.valorAberto ?? row.valorOriginal)),
                vencimento: toIsoDate(row.dtvenc ?? row.dtemissao ?? undefined) ?? range.endDate,
                status: row.statusTitulo ?? "EM_ABERTO",
            }));
            return {
                registros,
                total: registros.length,
            };
        }
        catch (error) {
            await primeWinthorFallbackForDivergencias({ dataInicio: range.startDate, dataFim: range.endDate });
            const fallback = safeArray(db.reconaiWinthorRows).slice(0, 200).map((row, index) => ({
                id: row.id ?? `WINTHOR-${index + 1}`,
                cliente: row.cliente ?? "Cliente nao informado",
                valor: round2(asNumber(row.valorEsperado) > 0 ? asNumber(row.valorEsperado) : asNumber(row.valorVenda)),
                vencimento: toIsoDate(typeof row.dataVenda === "string" ? row.dataVenda : undefined) ?? range.endDate,
                status: "EM_ABERTO",
            }));
            app.log.warn({
                component: "recebiveisCartaoRoutes",
                action: "winthorTitulosFallback",
                error,
                total: fallback.length,
            }, "Falha no WinThor /receivables. Retornando fallback de vendas faturadas.");
            return {
                registros: fallback,
                total: fallback.length,
            };
        }
    });
    app.get("/api/recebiveis-cartao/dossies", async () => {
        await primeWinthorFallbackForDivergencias({});
        const rows = service
            .listTransacoesParaValidacao({})
            .filter((row) => row.isDivergencia)
            .slice(0, 300)
            .map((row) => ({
            id: row.id,
            titulo: `${row.filialCodigo} - ${row.numeroVenda}`,
            status: row.statusDivergencia,
            atualizadoEm: row.historico?.[0]?.data ?? row.dataVenda,
            valorImpactado: round2(Math.abs(row.valorDivergencia)),
        }));
        return {
            registros: rows,
            total: rows.length,
        };
    });
    app.get("/api/recebiveis-cartao/dossies/:id", async (req, reply) => {
        const { id } = paramsSchema.parse(req.params);
        try {
            const detalhe = service.getTransacaoDetalhe(id);
            return {
                id,
                resumoExecutivo: detalhe.resumoExecutivo,
                dadosVenda: detalhe.dadosVenda,
                dadosRede: detalhe.dadosCartao,
                dadosWinthor: detalhe.dadosConciliacao,
                analiseIa: "Analise automatica: divergencia encontrada entre os dados esperados do sistema e os dados recebidos.",
                recomendacao: "Priorizar validacao da transacao e executar tratativa de conciliacao com a adquirente quando aplicavel.",
            };
        }
        catch (error) {
            return reply.status(404).send({ error: { message: error instanceof Error ? error.message : "Dossie nao encontrado." } });
        }
    });
    app.post("/api/recebiveis-cartao/dossies/:id/gerar-email", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        return {
            dossieId: id,
            protocolo: `EML-${Date.now()}`,
            status: "GERADO",
        };
    });
    app.post("/api/recebiveis-cartao/dossies/:id/gerar-contestacao", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        return {
            dossieId: id,
            protocolo: `CST-${Date.now()}`,
            status: "GERADO",
        };
    });
    app.post("/api/recebiveis-cartao/dossies/:id/gerar-ticket", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        const ticket = {
            id: `TKT-${Date.now()}`,
            divergenciaId: id,
            status: "ABERTO",
            createdAt: new Date().toISOString(),
        };
        db.reconaiInternalTickets.unshift(ticket);
        return {
            dossieId: id,
            protocolo: ticket.id,
            status: "GERADO",
        };
    });
    app.post("/api/recebiveis-cartao/ia-financeira/perguntar", async (req) => {
        const { pergunta } = iaPerguntaBodySchema.parse(req.body ?? {});
        await primeWinthorFallbackForDivergencias({});
        const resumo = service.getResumo({});
        const topFilial = service.getComparativoFilial({}, "maior-divergencia").registros[0];
        const topDia = service.getComparativoDia({}).registros.sort((a, b) => b.totalDivergente - a.totalDivergente)[0];
        const prompt = normalizeToken(pergunta);
        let resposta = `No periodo analisado, existem ${resumo.quantidadeDivergencias} transacoes divergentes, com impacto de R$ ${round2(resumo.totalDivergente).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`;
        if (prompt.includes("FILIAL")) {
            resposta = topFilial
                ? `A filial com maior impacto e ${topFilial.filialCodigo} (${topFilial.filialNome}), com divergencia total de R$ ${topFilial.totalDivergente.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
                : "Nao foi encontrada filial com divergencia no periodo.";
        }
        else if (prompt.includes("DIA")) {
            resposta = topDia
                ? `O dia mais critico foi ${topDia.data}, com divergencia de R$ ${topDia.totalDivergente.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
                : "Nao foi encontrado dia critico no periodo informado.";
        }
        else if (prompt.includes("PERD")) {
            resposta = `Voce esta perdendo principalmente em transacoes pendentes/divergentes. Total em risco: R$ ${round2(resumo.totalDivergente).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Recomendo priorizar conciliacao das filiais com maior impacto.`;
        }
        return {
            resposta: {
                id: randomUUID(),
                role: "assistant",
                conteudo: resposta,
                criadoEm: new Date().toISOString(),
            },
        };
    });
    app.get("/api/recebiveis-cartao/importacoes", async () => {
        const registros = ensureRecebiveisImportacoesStore()
            .slice()
            .sort((a, b) => String(b.criadoEm ?? "").localeCompare(String(a.criadoEm ?? "")))
            .map((row) => normalizeValidationImportacaoRecord(row));
        return {
            registros,
            total: registros.length,
        };
    });
    app.post("/api/recebiveis-cartao/importacoes/upload", async (req, reply) => {
        const file = await req.file();
        if (!file) {
            return reply.status(400).send({ error: { message: "Arquivo obrigatorio." } });
        }
        const fileName = file.filename || "importacao.csv";
        const format = inferImportFormat(fileName);
        const chunks = [];
        for await (const chunk of file.file) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const buffer = Buffer.concat(chunks);
        if (format === "XLSX") {
            const result = await redeSalesValidationService.processUpload({
                fileName,
                buffer,
                uploadedBy: req.authUser?.nome || req.authUser?.email || "system",
                tenantId: req.authUser?.tenantId || "default",
            });
            const summary = result.resumo ?? redeSalesValidationService.getValidationSummary(result.batchId) ?? null;
            const validationItems = await collectAllValidationItems(redeSalesValidationService, result.batchId);
            const preview = buildImportacaoPreviewFromValidation(validationItems);
            updateReconaiSnapshotFromValidation(result.batchId, validationItems);
            redeWinthorConfrontoService.clearDatasetCache();
            const totalLinhas = Number(summary?.total_rows ?? validationItems.length);
            const linhasValidas = Number(summary?.total_validated ?? 0);
            const linhasDivergentes = validationDivergenceCount(summary, totalLinhas, linhasValidas);
            const importacao = {
                id: randomUUID(),
                nomeArquivo: fileName,
                formato: format,
                status: linhasDivergentes > 0 ? "PROCESSADA" : "VALIDADA",
                totalLinhas,
                linhasValidas,
                linhasComErro: 0,
                linhasDivergentes,
                criadoEm: new Date().toISOString(),
                validacaoBatchId: result.batchId,
                resumoValidacao: summary,
            };
            const store = ensureRecebiveisImportacoesStore();
            store.unshift(importacao);
            return {
                importacao,
                preview,
                batchId: result.batchId,
                resumoValidacao: summary,
            };
        }
        const parsed = previewFromCsv(buffer);
        const importacao = {
            id: randomUUID(),
            nomeArquivo: fileName,
            formato: format,
            status: parsed.linhasComErro > 0 ? "COM_ERRO" : "PROCESSADA",
            totalLinhas: parsed.totalLinhas,
            linhasValidas: parsed.linhasValidas,
            linhasComErro: parsed.linhasComErro,
            criadoEm: new Date().toISOString(),
        };
        const store = ensureRecebiveisImportacoesStore();
        store.unshift(importacao);
        return {
            importacao,
            preview: parsed.preview,
        };
    });
    app.delete("/api/recebiveis-cartao/importacoes/:id", async (req, reply) => {
        const { id } = paramsSchema.parse(req.params);
        const store = ensureRecebiveisImportacoesStore();
        const index = store.findIndex((row) => String(row.id) === id);
        if (index < 0) {
            return reply.status(404).send({ error: { message: "Importacao nao encontrada." } });
        }
        store.splice(index, 1);
        return reply.status(204).send();
    });
    app.post("/api/recebiveis-cartao/relatorios/exportar/:formato", async (req) => {
        const { formato } = relatorioFormatoSchema.parse(req.params);
        const payload = relatorioPayloadSchema.parse(req.body ?? {});
        await primeWinthorFallbackForDivergencias({
            dataInicio: payload.dataInicio,
            dataFim: payload.dataFim,
            filial: payload.filial,
            operadora: payload.operadora,
        });
        const rows = service.listTransacoesParaValidacao({
            dataInicio: payload.dataInicio,
            dataFim: payload.dataFim,
            filial: payload.filial,
            operadora: payload.operadora,
        });
        const baseRows = rows.map((row) => ({
            dataVenda: row.dataVenda,
            filial: row.filialCodigo,
            numeroVenda: row.numeroVenda,
            operadora: row.operadora,
            bandeira: row.bandeira,
            valorVenda: round2(row.valorVenda),
            valorEsperado: round2(row.valorEsperado),
            valorRecebido: round2(row.valorRecebido),
            valorDivergencia: round2(row.valorDivergencia),
            status: row.statusVisual,
        }));
        const protocolo = `REL-${Date.now()}`;
        if (formato === "csv") {
            const headers = [
                "Data venda",
                "Filial",
                "Numero venda",
                "Operadora",
                "Bandeira",
                "Valor venda",
                "Valor esperado",
                "Valor recebido",
                "Valor divergencia",
                "Status",
            ];
            const lines = [headers.join(";")];
            for (const row of baseRows) {
                lines.push([
                    asCsvValue(row.dataVenda),
                    asCsvValue(row.filial),
                    asCsvValue(row.numeroVenda),
                    asCsvValue(row.operadora),
                    asCsvValue(row.bandeira),
                    asCsvValue(row.valorVenda),
                    asCsvValue(row.valorEsperado),
                    asCsvValue(row.valorRecebido),
                    asCsvValue(row.valorDivergencia),
                    asCsvValue(row.status),
                ].join(";"));
            }
            const csv = lines.join("\n");
            const downloadUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
            return {
                formato: "CSV",
                status: `Relatorio gerado com ${baseRows.length} registros.`,
                downloadUrl,
                protocolo,
            };
        }
        const worksheet = XLSX.utils.json_to_sheet(baseRows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Recebiveis");
        const file64 = XLSX.write(workbook, { bookType: "xlsx", type: "base64" });
        return {
            formato: "XLSX",
            status: `Relatorio gerado com ${baseRows.length} registros.`,
            downloadUrl: `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${file64}`,
            protocolo,
        };
    });
    app.get("/api/recebiveis-cartao/configuracoes", async () => {
        return getRecebiveisConfigSnapshot();
    });
    app.put("/api/recebiveis-cartao/configuracoes", async (req) => {
        const parsed = configuracoesSchema.parse(req.body ?? {});
        db.reconaiRecebiveisConfiguracoes = parsed;
        return {
            status: "ok",
        };
    });
    app.get("/api/recebiveis-cartao/conciliacao", async (req) => {
        const query = conciliacaoQuerySchema.parse(req.query);
        return loadConciliacaoRegistros(query);
    });
    app.get("/api/recebiveis-cartao/conciliacao/:id", async (req, reply) => {
        const { id } = paramsSchema.parse(req.params);
        const cached = conciliacaoCache.get(id);
        if (cached) {
            return {
                id: cached.id,
                venda: [
                    { label: "Data venda", valor: cached.dataVenda },
                    { label: "Filial", valor: cached.filial },
                    { label: "Cliente", valor: cached.cliente },
                    { label: "Pedido", valor: cached.pedido },
                    { label: "Nota", valor: cached.nota },
                    { label: "Valor venda", valor: cached.valorVenda },
                ],
                rede: [
                    { label: "NSU", valor: cached.nsu },
                    { label: "Autorizacao", valor: cached.autorizacao },
                    { label: "Operadora", valor: cached.operadora },
                    { label: "Valor recebido", valor: cached.valorRecebido },
                ],
                winthor: [
                    { label: "Valor WinThor", valor: cached.valorWinthor },
                    { label: "Diferenca", valor: cached.diferenca },
                    { label: "Status", valor: cached.status },
                    { label: "Risco", valor: cached.risco },
                ],
            };
        }
        const query = conciliacaoQuerySchema.parse(req.query ?? {});
        const { registros } = await loadConciliacaoRegistros(query);
        const row = registros.find((item) => item.id === id);
        if (!row) {
            return reply.status(404).send({ error: { message: "Conciliacao nao encontrada." } });
        }
        return {
            id: row.id,
            venda: [
                { label: "Data venda", valor: row.dataVenda },
                { label: "Filial", valor: row.filial },
                { label: "Cliente", valor: row.cliente },
                { label: "Pedido", valor: row.pedido },
                { label: "Nota", valor: row.nota },
                { label: "Valor venda", valor: row.valorVenda },
            ],
            rede: [
                { label: "NSU", valor: row.nsu },
                { label: "Autorizacao", valor: row.autorizacao },
                { label: "Operadora", valor: row.operadora },
                { label: "Valor recebido", valor: row.valorRecebido },
            ],
            winthor: [
                { label: "Valor WinThor", valor: row.valorWinthor },
                { label: "Diferenca", valor: row.diferenca },
                { label: "Status", valor: row.status },
                { label: "Risco", valor: row.risco },
            ],
        };
    });
    app.post("/api/recebiveis-cartao/conciliacao/:id/explicar", async (req, reply) => {
        const { id } = paramsSchema.parse(req.params);
        const query = conciliacaoQuerySchema.parse(req.query ?? {});
        const { registros } = await loadConciliacaoRegistros(query);
        const row = registros.find((item) => item.id === id);
        if (!row) {
            return reply.status(404).send({ error: { message: "Conciliacao nao encontrada." } });
        }
        return {
            conciliacaoId: row.id,
            explicacao: row.status === "CONCILIADO"
                ? "Venda conciliada entre sistema e recebimento."
                : "Venda faturada no WinThor sem recebimento correspondente da REDE no momento.",
        };
    });
    app.put("/api/recebiveis-cartao/conciliacao/:id/conciliar-manual", async (req, reply) => {
        const { id } = paramsSchema.parse(req.params);
        conciliacaoManualBodySchema.parse(req.body ?? {});
        const query = conciliacaoQuerySchema.parse(req.query ?? {});
        const { registros } = await loadConciliacaoRegistros(query);
        const row = registros.find((item) => item.id === id);
        if (!row) {
            return reply.status(404).send({ error: { message: "Conciliacao nao encontrada." } });
        }
        return {
            status: "ok",
            conciliacaoId: row.id,
        };
    });
    app.get("/api/recebiveis-cartao/filtros", async () => {
        const base = service.getFilterOptions();
        if (base.filiais.length > 0 || base.operadoras.length > 0) {
            return base;
        }
        const cachedRows = Array.isArray(db.reconaiWinthorRows) ? db.reconaiWinthorRows : [];
        if (cachedRows.length > 0) {
            const filiais = Array.from(new Set(cachedRows.map((row) => String(row.filialCodigo ?? row.codfilial ?? "").trim()).filter((row) => row.length > 0))).sort((a, b) => a.localeCompare(b));
            const modalidades = Array.from(new Set(cachedRows.map((row) => String(row.modalidade ?? row.descricaoCobranca ?? "").trim()).filter((row) => row.length > 0))).sort((a, b) => a.localeCompare(b));
            return {
                filiais,
                operadoras: ["WINTHOR"],
                bandeiras: ["N/D"],
                modalidades,
                clientes: [],
                statusDivergencia: ["ABERTA", "EM_TRATAMENTO", "RESOLVIDA", "CONTESTADA", "PENDENTE", "DIVERGENTE"],
                responsaveis: [],
            };
        }
        void primeWinthorFallbackForDivergencias({});
        try {
            const range = resolveConciliacaoRange(undefined);
            let timeoutId;
            const result = await Promise.race([
                winthorCardService
                    .getVendasFaturadasCartao(range.dataInicio, range.dataFim, false)
                    .then((data) => ({ status: "loaded", data }))
                    .catch((error) => ({ status: "error", error })),
                new Promise((resolve) => {
                    timeoutId = setTimeout(() => resolve({ status: "timeout" }), 1800);
                }),
            ]);
            clearTimeout(timeoutId);
            if (result.status === "timeout") {
                return base;
            }
            if (result.status === "error") {
                throw result.error;
            }
            const rows = result.data.rows;
            const filiais = Array.from(new Set(rows.map((row) => String(row.codfilial ?? "").trim()).filter((row) => row.length > 0))).sort((a, b) => a.localeCompare(b));
            const modalidades = Array.from(new Set(rows.map((row) => row.descricaoCobranca?.trim() ?? "").filter((row) => row.length > 0))).sort((a, b) => a.localeCompare(b));
            return {
                filiais,
                operadoras: ["WINTHOR"],
                bandeiras: ["N/D"],
                modalidades,
                clientes: [],
                statusDivergencia: ["ABERTA", "EM_TRATAMENTO", "RESOLVIDA", "CONTESTADA", "PENDENTE", "DIVERGENTE"],
                responsaveis: [],
            };
        }
        catch {
            return base;
        }
    });
    app.get("/api/recebiveis-cartao/divergencias/resumo", async (req) => {
        const query = filtroQuerySchema.parse(req.query);
        await primeWinthorFallbackForDivergencias(toFilters(query));
        return service.getResumo(toFilters(query));
    });
    app.get("/api/recebiveis-cartao/divergencias/comparativo-dia", async (req) => {
        const query = filtroQuerySchema.parse(req.query);
        await primeWinthorFallbackForDivergencias(toFilters(query));
        return service.getComparativoDia(toFilters(query));
    });
    app.get("/api/recebiveis-cartao/divergencias/comparativo-filial", async (req) => {
        const query = filtroQuerySchema.parse(req.query);
        await primeWinthorFallbackForDivergencias(toFilters(query));
        return service.getComparativoFilial(toFilters(query), query.ordenacao);
    });
    app.get("/api/recebiveis-cartao/divergencias/drilldown", async (req) => {
        const query = filtroQuerySchema.parse(req.query);
        await primeWinthorFallbackForDivergencias(toFilters(query));
        return service.getDrilldownOperadoraBandeira(toFilters(query));
    });
    app.get("/api/recebiveis-cartao/divergencias/transacoes", async (req) => {
        const query = filtroQuerySchema.parse(req.query);
        await primeWinthorFallbackForDivergencias(toFilters(query));
        return service.getTransacoes(toFilters(query), {
            page: query.page,
            pageSize: query.pageSize,
        });
    });
    app.get("/api/recebiveis-cartao/divergencias/validacao-rede", async (req) => {
        const query = validacaoRedeQuerySchema.parse(req.query);
        const filters = toFilters(query);
        await primeWinthorFallbackForDivergencias(filters);
        return redeCrossValidationService.validatePeriod(filters, {
            dataInicio: query.dataInicioRede,
            dataFim: query.dataFimRede,
            limiteLista: query.limiteLista,
        });
    });
    app.get("/api/recebiveis-cartao/divergencias/transacoes/:id/validacao-rede", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        const query = validacaoTransacaoQuerySchema.parse(req.query);
        return redeCrossValidationService.validateTransaction(id, query.janelaDias);
    });
    app.get("/api/recebiveis-cartao/confronto/dashboard", async (req) => {
        const query = filtroQuerySchema.parse(req.query);
        return redeWinthorConfrontoService.getDashboard(toFilters(query));
    });
    app.get("/api/recebiveis-cartao/confronto/rede-para-winthor/dia", async (req) => {
        const query = filtroQuerySchema.parse(req.query);
        return redeWinthorConfrontoService.getRedeParaWinthorResumoDia(toFilters(query));
    });
    app.get("/api/recebiveis-cartao/confronto/rede-para-winthor/filial", async (req) => {
        const query = filtroQuerySchema.parse(req.query);
        return redeWinthorConfrontoService.getRedeParaWinthorResumoFilial(toFilters(query));
    });
    app.get("/api/recebiveis-cartao/confronto/rede-para-winthor/transacoes", async (req) => {
        const query = confrontoListagemQuerySchema.parse(req.query);
        return redeWinthorConfrontoService.getRedeParaWinthorTransacoes(toFilters(query), {
            page: query.page,
            pageSize: query.pageSize,
        });
    });
    app.get("/api/recebiveis-cartao/confronto/winthor-para-rede/dia", async (req) => {
        const query = filtroQuerySchema.parse(req.query);
        return redeWinthorConfrontoService.getWinthorParaRedeResumoDia(toFilters(query));
    });
    app.get("/api/recebiveis-cartao/confronto/winthor-para-rede/filial", async (req) => {
        const query = filtroQuerySchema.parse(req.query);
        return redeWinthorConfrontoService.getWinthorParaRedeResumoFilial(toFilters(query));
    });
    app.get("/api/recebiveis-cartao/confronto/winthor-para-rede/transacoes", async (req) => {
        const query = confrontoListagemQuerySchema.parse(req.query);
        return redeWinthorConfrontoService.getWinthorParaRedeTransacoes(toFilters(query), {
            page: query.page,
            pageSize: query.pageSize,
        });
    });
    app.get("/api/recebiveis-cartao/confronto/pendencias/rede-sem-sistema", async (req) => {
        const query = confrontoListagemQuerySchema.parse(req.query);
        return redeWinthorConfrontoService.getRedeSemSistema(toFilters(query), {
            page: query.page,
            pageSize: query.pageSize,
        });
    });
    app.get("/api/recebiveis-cartao/confronto/pendencias/winthor-sem-rede", async (req) => {
        const query = confrontoListagemQuerySchema.parse(req.query);
        return redeWinthorConfrontoService.getWinthorSemRede(toFilters(query), {
            page: query.page,
            pageSize: query.pageSize,
        });
    });
    app.post("/api/recebiveis-cartao/acompanhamento-caixa/snapshot", async (req) => {
        return caixaAuditService.generateSnapshot(req.body ?? {}, getAuditActor(req));
    });
    app.get("/api/recebiveis-cartao/acompanhamento-caixa/dashboard", async (req) => {
        return caixaAuditService.getDashboard(req.query ?? {});
    });
    app.get("/api/recebiveis-cartao/acompanhamento-caixa/resumo-fechamento", async (req) => {
        return caixaAuditService.getResumoFechamento(req.query ?? {});
    });
    app.get("/api/recebiveis-cartao/acompanhamento-caixa/caixas", async (req) => {
        return caixaAuditService.listCaixas(req.query ?? {});
    });
    app.get("/api/recebiveis-cartao/acompanhamento-caixa/caixas/:id", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        return caixaAuditService.getCaixaDetalhe(id, getAuditActor(req));
    });
    app.post("/api/recebiveis-cartao/acompanhamento-caixa/caixas/:id/iniciar-auditoria", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        return caixaAuditService.iniciarAuditoria(id, getAuditActor(req));
    });
    app.post("/api/recebiveis-cartao/acompanhamento-caixa/caixas/:id/finalizar-auditoria", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        return caixaAuditService.finalizarAuditoria(id, req.body ?? {}, getAuditActor(req));
    });
    app.post("/api/recebiveis-cartao/acompanhamento-caixa/caixas/:id/acertos", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        return caixaAuditService.solicitarAcerto(id, req.body ?? {}, getAuditActor(req));
    });
    app.post("/api/recebiveis-cartao/acompanhamento-caixa/acertos/:id/aprovar", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        return caixaAuditService.aprovarAcerto(id, req.body ?? {}, getAuditActor(req));
    });
    app.post("/api/recebiveis-cartao/acompanhamento-caixa/acertos/:id/reprovar", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        return caixaAuditService.reprovarAcerto(id, req.body ?? {}, getAuditActor(req));
    });
    app.post("/api/recebiveis-cartao/acompanhamento-caixa/caixas/:id/evidencias", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        return caixaAuditService.anexarEvidencia(id, req.body ?? {}, getAuditActor(req));
    });
    app.post("/api/recebiveis-cartao/acompanhamento-caixa/filial-dia/finalizar", async (req) => {
        return caixaAuditService.finalizarFilialDia(req.body ?? {}, getAuditActor(req));
    });
    app.get("/api/recebiveis-cartao/acompanhamento-caixa/caixas/:id/comparar-snapshot-winthor", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        return caixaAuditService.compareSnapshotWithWinthor({ caixaId: id }, getAuditActor(req));
    });
    app.get("/api/recebiveis-cartoes/acompanhamento-caixa/:id/comparar-snapshot-winthor", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        return caixaAuditService.compareSnapshotWithWinthor({ caixaId: id }, getAuditActor(req));
    });
    app.get("/api/recebiveis-cartao/acompanhamento-caixa/ledger/verificar", async (req) => {
        return caixaAuditService.verificarLedger(req.query ?? {});
    });
    app.get("/api/recebiveis-cartao/acompanhamento-caixa/caixas/:id/pacote-auditoria", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        return caixaAuditService.gerarPacoteAuditoria({ caixaId: id });
    });
    app.get("/api/recebiveis-cartao/chargeback/resumo", async (req) => {
        const query = chargebackQuerySchema.parse(req.query);
        return chargebackService.getResumo(query);
    });
    app.get("/api/recebiveis-cartao/chargeback/notificacoes", async (req) => {
        const query = chargebackQuerySchema.parse(req.query);
        return chargebackService.getNotifications(query);
    });
    app.get("/api/recebiveis-cartao/chargeback/solicitacoes", async (req) => {
        const query = chargebackQuerySchema.parse(req.query);
        return chargebackService.getSolicitations(query);
    });
    app.get("/api/recebiveis-cartao/chargeback/historico", async (req) => {
        const query = chargebackQuerySchema.parse(req.query);
        return chargebackService.getHistory(query);
    });
    app.get("/api/recebiveis-cartao/chargeback/historico/processo", async (req) => {
        const query = chargebackHistoryByProcessQuerySchema.parse(req.query);
        return chargebackService.getHistoryByProcess(query);
    });
    app.get("/api/recebiveis-cartao/divergencias/transacoes/:id", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        await primeWinthorFallbackForDivergencias({});
        return service.getTransacaoDetalhe(id);
    });
    // Compatibilidade com a implementacao anterior da aba.
    app.get("/api/recebiveis-cartao/divergencias", async (req) => {
        const query = filtroQuerySchema.parse(req.query);
        await primeWinthorFallbackForDivergencias(toFilters(query));
        return service.getLegacyDivergencias(toFilters(query));
    });
    app.post("/api/recebiveis-cartao/divergencias/:id/contestacao", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        return service.gerarContestacao(id);
    });
    app.put("/api/recebiveis-cartao/divergencias/:id/atribuir", async (req) => {
        const { id } = paramsSchema.parse(req.params);
        const body = atribuirBodySchema.parse(req.body ?? {});
        return service.atribuirDivergencia(id, body.responsavel);
    });
}
