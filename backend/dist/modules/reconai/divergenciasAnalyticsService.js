import { AppError } from "../../utils/error.js";
import { db } from "../../repositories/dataStore.js";
import { reconaiStore } from "./reconaiStore.js";
const MONEY_TOLERANCE = 0.01;
function normalizeText(value) {
    if (!value)
        return "";
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim();
}
function toNumber(value) {
    if (value == null)
        return null;
    if (typeof value === "number")
        return Number.isFinite(value) ? value : null;
    const raw = String(value).trim();
    if (!raw)
        return null;
    const normalized = raw.includes(",") && raw.includes(".")
        ? raw.replace(/\./g, "").replace(",", ".")
        : raw.includes(",")
            ? raw.replace(",", ".")
            : raw;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
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
function parseDateOrNull(value) {
    if (!value || !value.trim())
        return null;
    const iso = toIsoDate(value.trim());
    if (!iso)
        return null;
    return iso;
}
function firstString(raw, keys) {
    if (!raw)
        return null;
    for (const key of keys) {
        const value = raw[key];
        if (value == null)
            continue;
        const parsed = String(value).trim();
        if (parsed.length > 0)
            return parsed;
    }
    return null;
}
function mapRiskToCriticidade(risk) {
    switch (risk) {
        case "CRITICO":
            return "CRITICA";
        case "ALTO":
            return "ALTA";
        case "MEDIO":
            return "MEDIA";
        default:
            return "BAIXA";
    }
}
function mapWorkflowStatus(status) {
    switch (status) {
        case "CONTESTADA":
            return "CONTESTADA";
        case "RESOLVIDA":
            return "RESOLVIDA";
        case "EM_ANALISE":
        case "AGUARDANDO_RESPOSTA":
        case "ESCALADA":
            return "EM_TRATAMENTO";
        case "ABERTA":
        default:
            return "ABERTA";
    }
}
function deriveVisualStatus(statusConciliacao, statusWorkflow, vendaRaw, redeRaw) {
    const cancelSale = normalizeText(firstString(vendaRaw, ["status", "saleStatus", "situation"]));
    const cancelPayment = normalizeText(firstString(redeRaw, ["status", "paymentStatus", "situation"]));
    if (cancelSale.includes("CANCEL") ||
        cancelSale.includes("ESTORN") ||
        cancelPayment.includes("CANCEL") ||
        cancelPayment.includes("ESTORN")) {
        return "CANCELADO";
    }
    if (statusWorkflow === "RESOLVIDA" && statusConciliacao === "CONCILIADO") {
        return "CONCILIADO";
    }
    if (statusConciliacao === "NAO_RECEBIDO" ||
        statusConciliacao === "NAO_BAIXADO" ||
        statusConciliacao === "RECEBIDO_NAO_BAIXADO") {
        return "PENDENTE";
    }
    if (statusConciliacao === "CONCILIADO") {
        return "CONCILIADO";
    }
    return "DIVERGENTE";
}
function includesNormalized(base, search) {
    if (!search || !search.trim())
        return true;
    return normalizeText(base).includes(normalizeText(search));
}
function eqNormalized(base, search) {
    if (!search || !search.trim())
        return true;
    return normalizeText(base) === normalizeText(search);
}
function parseOperadoraFromAdquirente(adquirente) {
    const normalized = normalizeText(adquirente);
    if (normalized.includes("REDE") || normalized.includes("REDECARD"))
        return "REDE";
    if (normalized.includes("CIELO"))
        return "CIELO";
    if (normalized.includes("STONE"))
        return "STONE";
    if (normalized.length > 0)
        return adquirente?.trim() || "N/D";
    return "N/D";
}
function isLegacyOperadoraAprovada(status) {
    const normalized = normalizeText(status);
    return normalized === "APROVADA" || normalized === "APROVADO" || normalized === "APPROVED";
}
function toFilialCode(value) {
    if (value == null)
        return "SEM_FILIAL";
    const parsed = String(value).trim();
    return parsed.length > 0 ? parsed : "SEM_FILIAL";
}
function sortByDateAsc(a, b) {
    return a.localeCompare(b);
}
function createTotals() {
    return {
        totalVendido: 0,
        totalEsperado: 0,
        totalRecebido: 0,
        totalDivergente: 0,
        quantidadeTransacoes: 0,
        quantidadeDivergencias: 0,
        percentualDivergencia: 0,
    };
}
function sumTotals(target, row) {
    target.totalVendido = round2(target.totalVendido + row.valorVenda);
    target.totalEsperado = round2(target.totalEsperado + row.valorEsperado);
    target.totalRecebido = round2(target.totalRecebido + row.valorRecebido);
    target.quantidadeTransacoes += 1;
    if (row.isDivergencia) {
        target.quantidadeDivergencias += 1;
        target.totalDivergente = round2(target.totalDivergente + Math.abs(row.valorDivergencia));
    }
}
function finalizeTotals(totals) {
    const percentual = totals.totalVendido > MONEY_TOLERANCE
        ? round2((totals.totalDivergente / totals.totalVendido) * 100)
        : 0;
    return {
        ...totals,
        percentualDivergencia: percentual,
    };
}
export class DivergenciasAnalyticsService {
    logger;
    manualMeta = new Map();
    constructor(logger) {
        this.logger = logger;
    }
    mapSnapshotRow(row) {
        const saleRaw = (row.venda.raw ?? null);
        const paymentRaw = (row.rede?.raw ?? null);
        const manualMeta = this.manualMeta.get(row.id);
        const filialCodigo = row.venda.filial ??
            firstString(saleRaw, ["filial", "branchCode", "branch", "estabelecimento"]) ??
            firstString(paymentRaw, ["filial", "branchCode", "branch", "estabelecimento"]) ??
            "SEM_FILIAL";
        const filialNome = firstString(saleRaw, ["filialNome", "branchName", "storeName"]) ??
            firstString(paymentRaw, ["filialNome", "branchName", "storeName"]) ??
            `Filial ${filialCodigo}`;
        const operadora = firstString(paymentRaw, ["adquirente", "acquirer", "acquirerName", "operadora"]) ??
            firstString(saleRaw, ["adquirente", "acquirer", "acquirerName", "operadora"]) ??
            "REDE";
        const bandeira = firstString(paymentRaw, ["bandeira", "brand", "cardBrand"]) ??
            firstString(saleRaw, ["bandeira", "brand", "cardBrand"]) ??
            "N/D";
        const modalidade = firstString(paymentRaw, ["modalidade", "cardType", "productType", "paymentType"]) ??
            firstString(saleRaw, ["modalidade", "cardType", "productType", "paymentType"]) ??
            "N/D";
        const valorVenda = toNumber(row.venda.valorVenda) ?? 0;
        const valorEsperado = toNumber(row.winthor?.valorOriginal) ?? valorVenda;
        const valorRecebido = toNumber(row.rede?.valorRecebido) ?? toNumber(row.winthor?.valorPago) ?? 0;
        const valorDivergencia = round2(valorRecebido - valorEsperado);
        const valorEmAberto = round2(valorEsperado - valorRecebido);
        const taxaDesconto = toNumber(row.rede?.valorTaxa);
        const valorLiquidoPrevisto = round2(valorEsperado - (taxaDesconto ?? 0));
        const statusDivergencia = manualMeta?.workflowStatus ?? mapWorkflowStatus(row.workflowStatus);
        const statusVisual = deriveVisualStatus(row.status, statusDivergencia, saleRaw, paymentRaw);
        const isDivergencia = statusVisual === "PENDENTE" || statusVisual === "DIVERGENTE";
        const numeroVenda = row.venda.numped ??
            row.venda.numnota ??
            firstString(saleRaw, ["numeroVenda", "cupom", "pedido", "orderId", "order_id"]) ??
            row.venda.externalId;
        const pedido = row.venda.numped ?? firstString(saleRaw, ["pedido", "orderId", "order_id"]);
        const cupom = firstString(saleRaw, ["cupom", "receiptNumber", "saleNumber"]);
        const cliente = row.winthor?.cliente ?? firstString(saleRaw, ["cliente", "customerName"]);
        const historico = [];
        const createdDate = toIsoDate(row.createdAt);
        if (createdDate) {
            historico.push({
                data: createdDate,
                evento: "Transacao registrada",
                origem: "RECONAI",
            });
        }
        const paidDate = toIsoDate(row.rede?.dataPagamento ?? undefined);
        if (paidDate) {
            historico.push({
                data: paidDate,
                evento: "Pagamento identificado",
                origem: "REDE",
            });
        }
        const workflowDate = toIsoDate(row.workflowUpdatedAt);
        if (workflowDate) {
            historico.push({
                data: workflowDate,
                evento: `Workflow: ${statusDivergencia}`,
                origem: "RECONAI",
            });
        }
        return {
            id: row.id,
            filialCodigo: String(filialCodigo),
            filialNome,
            dataVenda: toIsoDate(row.venda.dataVenda) ?? toIsoDate(row.createdAt) ?? new Date().toISOString().slice(0, 10),
            dataPrevistaRecebimento: toIsoDate(row.winthor?.dtvenc ?? undefined),
            dataRecebimento: toIsoDate(row.rede?.dataPagamento ?? undefined) ?? toIsoDate(row.winthor?.dtpag ?? undefined),
            numeroVenda,
            pedido,
            cupom,
            nsu: row.venda.nsu ?? row.rede?.nsu ?? null,
            autorizacao: row.venda.authorization ?? row.rede?.authorization ?? null,
            operadora,
            bandeira,
            modalidade,
            cliente,
            valorVenda: round2(valorVenda),
            valorEsperado: round2(valorEsperado),
            valorRecebido: round2(valorRecebido),
            valorDivergencia,
            valorEmAberto,
            valorLiquidoPrevisto,
            taxaDesconto: taxaDesconto == null ? null : round2(taxaDesconto),
            statusConciliacao: row.status,
            statusDivergencia,
            statusVisual,
            criticidade: mapRiskToCriticidade(row.risco_nivel),
            responsavel: manualMeta?.responsavel ?? firstString(saleRaw, ["responsavel"]) ?? "",
            motivoDivergencia: row.reasons?.[0] ?? null,
            isDivergencia,
            historico,
        };
    }
    buildFallbackRowsFromLegacyData() {
        const operadoraRows = (db.cartaoOperadoraMovimentos ?? []);
        const erpRows = (db.cartaoErpLancamentos ?? []);
        const approved = operadoraRows.filter((row) => isLegacyOperadoraAprovada(row.status));
        const dedupeErp = new Map();
        for (const row of erpRows) {
            const key = [
                toFilialCode(row.filial),
                toIsoDate(row.dataVenda ?? undefined) ?? "",
                String(row.numeroDocumento ?? ""),
                String(toNumber(row.valorBruto) ?? 0),
                String(row.parcela ?? ""),
            ].join("|");
            if (!dedupeErp.has(key)) {
                dedupeErp.set(key, row);
            }
        }
        const erpByValue = new Map();
        for (const row of dedupeErp.values()) {
            const key = [
                toFilialCode(row.filial),
                toIsoDate(row.dataVenda ?? undefined) ?? "",
                round2(toNumber(row.valorBruto) ?? 0).toFixed(2),
            ].join("|");
            const list = erpByValue.get(key);
            if (list) {
                list.push(row);
            }
            else {
                erpByValue.set(key, [row]);
            }
        }
        const rows = [];
        approved.forEach((row, index) => {
            const valorVenda = round2(toNumber(row.valorBruto) ?? 0);
            const filialCodigo = toFilialCode(row.filial);
            const dataVenda = toIsoDate(row.dataVenda ?? undefined) ?? new Date().toISOString().slice(0, 10);
            const queueKey = [filialCodigo, dataVenda, valorVenda.toFixed(2)].join("|");
            const queue = erpByValue.get(queueKey);
            const matched = queue && queue.length > 0 ? queue.shift() ?? null : null;
            const valorRecebido = round2(toNumber(matched?.valorBruto) ?? 0);
            const statusConciliacao = matched ? "CONCILIADO" : "NAO_RECEBIDO";
            const statusDivergencia = matched ? "RESOLVIDA" : "ABERTA";
            const valorDivergencia = round2(valorRecebido - valorVenda);
            const statusVisual = matched ? "CONCILIADO" : "PENDENTE";
            const id = row.id?.trim() ? `LEG-${row.id.trim()}` : `LEG-OPERADORA-${index + 1}`;
            const manualMeta = this.manualMeta.get(id);
            rows.push({
                id,
                filialCodigo,
                filialNome: `Filial ${filialCodigo}`,
                dataVenda,
                dataPrevistaRecebimento: dataVenda,
                dataRecebimento: matched ? dataVenda : null,
                numeroVenda: row.numeroVenda?.trim() || matched?.numeroDocumento?.trim() || id,
                pedido: row.numeroVenda?.trim() || null,
                cupom: null,
                nsu: row.nsu?.trim() || null,
                autorizacao: row.autorizacao?.trim() || null,
                operadora: row.operadora?.trim() || parseOperadoraFromAdquirente(matched?.adquirente),
                bandeira: row.bandeira?.trim() || "N/D",
                modalidade: row.modalidade?.trim() || "N/D",
                cliente: null,
                valorVenda,
                valorEsperado: valorVenda,
                valorRecebido,
                valorDivergencia,
                valorEmAberto: round2(valorVenda - valorRecebido),
                valorLiquidoPrevisto: valorVenda,
                taxaDesconto: null,
                statusConciliacao,
                statusDivergencia: manualMeta?.workflowStatus ?? statusDivergencia,
                statusVisual,
                criticidade: matched ? "BAIXA" : "ALTA",
                responsavel: manualMeta?.responsavel ?? "",
                motivoDivergencia: matched ? null : "Sem recebimento correspondente no ERP.",
                isDivergencia: !matched,
                historico: [],
            });
        });
        let orphanIndex = 0;
        for (const queue of erpByValue.values()) {
            while (queue.length > 0) {
                const erp = queue.shift();
                orphanIndex += 1;
                const valorRecebido = round2(toNumber(erp.valorBruto) ?? 0);
                const filialCodigo = toFilialCode(erp.filial);
                const dataVenda = toIsoDate(erp.dataVenda ?? undefined) ?? new Date().toISOString().slice(0, 10);
                const id = erp.id?.trim() ? `LEG-${erp.id.trim()}` : `LEG-ERP-${orphanIndex}`;
                const manualMeta = this.manualMeta.get(id);
                rows.push({
                    id,
                    filialCodigo,
                    filialNome: `Filial ${filialCodigo}`,
                    dataVenda,
                    dataPrevistaRecebimento: dataVenda,
                    dataRecebimento: dataVenda,
                    numeroVenda: erp.numeroDocumento?.trim() || id,
                    pedido: erp.numeroDocumento?.trim() || null,
                    cupom: null,
                    nsu: null,
                    autorizacao: null,
                    operadora: parseOperadoraFromAdquirente(erp.adquirente),
                    bandeira: "N/D",
                    modalidade: "N/D",
                    cliente: null,
                    valorVenda: 0,
                    valorEsperado: 0,
                    valorRecebido,
                    valorDivergencia: valorRecebido,
                    valorEmAberto: 0,
                    valorLiquidoPrevisto: 0,
                    taxaDesconto: null,
                    statusConciliacao: "BAIXA_INCORRETA",
                    statusDivergencia: manualMeta?.workflowStatus ?? "ABERTA",
                    statusVisual: "DIVERGENTE",
                    criticidade: "MEDIA",
                    responsavel: manualMeta?.responsavel ?? "",
                    motivoDivergencia: "Lancamento ERP sem venda de cartao correspondente.",
                    isDivergencia: true,
                    historico: [],
                });
            }
        }
        return rows;
    }
    getBaseRows() {
        const reconciliations = reconaiStore.listReconciliations();
        if (reconciliations.length > 0) {
            return reconciliations.map((row) => this.mapSnapshotRow(row));
        }
        const fallbackRows = this.buildFallbackRowsFromLegacyData();
        if (fallbackRows.length > 0) {
            return fallbackRows;
        }
        const winthorFallbackRows = (db.reconaiWinthorRows ?? []);
        if (Array.isArray(winthorFallbackRows) && winthorFallbackRows.length > 0) {
            return winthorFallbackRows;
        }
        if (fallbackRows.length === 0) {
            this.logger.warn({ component: "DivergenciasAnalyticsService", action: "getBaseRows" }, "Sem snapshot RECONAI, sem dados legados e sem fallback WinThor no cache local.");
        }
        return [];
    }
    applyFilters(rows, filters) {
        const startDate = parseDateOrNull(filters.dataInicio);
        const endDate = parseDateOrNull(filters.dataFim);
        const statusFilter = normalizeText(filters.status);
        const criticidadeFilter = normalizeText(filters.criticidade);
        return rows.filter((row) => {
            if (startDate && row.dataVenda < startDate)
                return false;
            if (endDate && row.dataVenda > endDate)
                return false;
            if (!includesNormalized(row.filialCodigo, filters.filial))
                return false;
            if (!includesNormalized(row.operadora, filters.operadora))
                return false;
            if (!includesNormalized(row.bandeira, filters.bandeira))
                return false;
            if (!includesNormalized(row.modalidade, filters.modalidade))
                return false;
            if (!includesNormalized(row.nsu, filters.nsu))
                return false;
            if (!includesNormalized(row.autorizacao, filters.autorizacao))
                return false;
            if (!includesNormalized(`${row.numeroVenda} ${row.pedido ?? ""} ${row.cupom ?? ""}`, filters.vendaNumero))
                return false;
            if (!includesNormalized(row.cliente, filters.cliente))
                return false;
            if (!includesNormalized(row.responsavel, filters.responsavel))
                return false;
            if (statusFilter && statusFilter !== "ALL") {
                const matchesStatus = normalizeText(row.statusDivergencia) === statusFilter ||
                    normalizeText(row.statusConciliacao) === statusFilter ||
                    normalizeText(row.statusVisual) === statusFilter;
                if (!matchesStatus)
                    return false;
            }
            if (criticidadeFilter && criticidadeFilter !== "ALL" && normalizeText(row.criticidade) !== criticidadeFilter) {
                return false;
            }
            return true;
        });
    }
    applyContext(rows, filters) {
        return rows.filter((row) => {
            if (!eqNormalized(row.dataVenda, filters.contextoDia))
                return false;
            if (!eqNormalized(row.filialCodigo, filters.contextoFilial))
                return false;
            if (!eqNormalized(row.operadora, filters.drillOperadora))
                return false;
            if (!eqNormalized(row.bandeira, filters.drillBandeira))
                return false;
            return true;
        });
    }
    calculateTotals(rows) {
        const totals = createTotals();
        for (const row of rows) {
            sumTotals(totals, row);
        }
        return finalizeTotals(totals);
    }
    getFilterOptions() {
        const rows = this.getBaseRows();
        const unique = (items) => Array.from(new Set(items.filter((item) => !!item && item.trim().length > 0))).sort((a, b) => a.localeCompare(b));
        return {
            filiais: unique(rows.map((row) => row.filialCodigo)),
            operadoras: unique(rows.map((row) => row.operadora)),
            bandeiras: unique(rows.map((row) => row.bandeira)),
            modalidades: unique(rows.map((row) => row.modalidade)),
            clientes: unique(rows.map((row) => row.cliente ?? "")),
            responsaveis: unique(rows.map((row) => row.responsavel ?? "")),
            statusDivergencia: unique(rows.flatMap((row) => [row.statusDivergencia, row.statusConciliacao, row.statusVisual])),
        };
    }
    getResumo(filters) {
        const rows = this.applyContext(this.applyFilters(this.getBaseRows(), filters), filters);
        return this.calculateTotals(rows);
    }
    getComparativoDia(filters) {
        const rows = this.applyContext(this.applyFilters(this.getBaseRows(), filters), filters);
        const grouped = new Map();
        for (const row of rows) {
            const key = row.dataVenda;
            const current = grouped.get(key) ?? createTotals();
            sumTotals(current, row);
            grouped.set(key, current);
        }
        const registros = Array.from(grouped.entries())
            .map(([data, totals]) => ({
            data,
            ...finalizeTotals(totals),
        }))
            .sort((a, b) => sortByDateAsc(a.data, b.data));
        return {
            total: registros.length,
            registros,
        };
    }
    getComparativoFilial(filters, ordenacao = "maior-divergencia") {
        const rows = this.applyContext(this.applyFilters(this.getBaseRows(), filters), filters);
        const grouped = new Map();
        for (const row of rows) {
            const key = row.filialCodigo;
            const current = grouped.get(key) ??
                {
                    filialCodigo: row.filialCodigo,
                    filialNome: row.filialNome,
                    ...createTotals(),
                };
            sumTotals(current, row);
            grouped.set(key, current);
        }
        const registros = Array.from(grouped.values()).map((item) => ({
            filialCodigo: item.filialCodigo,
            filialNome: item.filialNome,
            ...finalizeTotals(item),
        }));
        if (ordenacao === "filial") {
            registros.sort((a, b) => a.filialCodigo.localeCompare(b.filialCodigo));
        }
        else if (ordenacao === "menor-divergencia") {
            registros.sort((a, b) => a.totalDivergente - b.totalDivergente);
        }
        else {
            registros.sort((a, b) => b.totalDivergente - a.totalDivergente);
        }
        return {
            total: registros.length,
            registros,
        };
    }
    getDrilldownOperadoraBandeira(filters) {
        const rows = this.applyContext(this.applyFilters(this.getBaseRows(), filters), filters);
        const grouped = new Map();
        for (const row of rows) {
            const key = `${normalizeText(row.operadora)}|${normalizeText(row.bandeira)}|${normalizeText(row.modalidade)}`;
            const current = grouped.get(key) ??
                {
                    operadora: row.operadora,
                    bandeira: row.bandeira,
                    modalidade: row.modalidade,
                    ...createTotals(),
                };
            sumTotals(current, row);
            grouped.set(key, current);
        }
        const registros = Array.from(grouped.values())
            .map((item) => ({
            operadora: item.operadora,
            bandeira: item.bandeira,
            modalidade: item.modalidade,
            ...finalizeTotals(item),
        }))
            .sort((a, b) => b.totalDivergente - a.totalDivergente);
        return {
            total: registros.length,
            registros,
        };
    }
    getTransacoes(filters, pagination) {
        const page = pagination.page && pagination.page > 0 ? pagination.page : 1;
        const pageSize = pagination.pageSize && pagination.pageSize > 0 ? pagination.pageSize : 20;
        const filtered = this.listTransacoesParaValidacao(filters);
        const total = filtered.length;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const safePage = Math.min(page, totalPages);
        const start = (safePage - 1) * pageSize;
        const registros = filtered.slice(start, start + pageSize);
        return {
            total,
            registros,
            paginacao: {
                page: safePage,
                pageSize,
                totalPages,
                totalItems: total,
            },
        };
    }
    listTransacoesParaValidacao(filters) {
        return this.applyContext(this.applyFilters(this.getBaseRows(), filters), filters).sort((a, b) => {
            if (a.dataVenda !== b.dataVenda)
                return b.dataVenda.localeCompare(a.dataVenda);
            return Math.abs(b.valorDivergencia) - Math.abs(a.valorDivergencia);
        });
    }
    getTransacaoById(id) {
        const row = this.getBaseRows().find((item) => item.id === id);
        if (!row) {
            throw new AppError(`Divergencia ${id} nao encontrada.`, 404);
        }
        return row;
    }
    getTransacaoDetalhe(id) {
        const row = this.getTransacaoById(id);
        return {
            id: row.id,
            resumoExecutivo: row.statusVisual === "CONCILIADO"
                ? "Transacao conciliada sem indicio de perda financeira."
                : `Transacao com status ${row.statusVisual.toLowerCase()} e necessidade de tratativa financeira.`,
            dadosVenda: [
                { label: "Numero da venda/cupom/pedido", valor: row.numeroVenda },
                { label: "Filial", valor: `${row.filialCodigo} - ${row.filialNome}` },
                { label: "Data da venda", valor: row.dataVenda },
                { label: "Cliente", valor: row.cliente || "-" },
                { label: "Valor bruto da venda", valor: row.valorVenda },
                { label: "Forma de pagamento", valor: row.modalidade },
            ],
            dadosCartao: [
                { label: "Operadora/adquirente", valor: row.operadora },
                { label: "Bandeira", valor: row.bandeira },
                { label: "Modalidade", valor: row.modalidade },
                { label: "NSU", valor: row.nsu || "-" },
                { label: "Codigo de autorizacao", valor: row.autorizacao || "-" },
                { label: "Parcela", valor: "-" },
                { label: "Quantidade de parcelas", valor: "-" },
            ],
            dadosConciliacao: [
                { label: "Valor esperado", valor: row.valorEsperado },
                { label: "Taxa/desconto", valor: row.taxaDesconto ?? "-" },
                { label: "Valor liquido previsto", valor: row.valorLiquidoPrevisto },
                { label: "Valor recebido", valor: row.valorRecebido },
                { label: "Valor divergente", valor: row.valorDivergencia },
                { label: "Data prevista de recebimento", valor: row.dataPrevistaRecebimento || "-" },
                { label: "Data real de recebimento", valor: row.dataRecebimento || "-" },
                { label: "Status", valor: row.statusVisual },
                { label: "Motivo provavel", valor: row.motivoDivergencia || "-" },
            ],
            historico: row.historico,
        };
    }
    getLegacyDivergencias(filters) {
        const rows = this.applyContext(this.applyFilters(this.getBaseRows(), filters), filters).filter((row) => row.isDivergencia);
        const registros = rows.map((row) => ({
            id: row.id,
            tipo: row.motivoDivergencia || row.statusConciliacao,
            valor: Math.abs(row.valorDivergencia),
            status: row.statusDivergencia,
            criticidade: row.criticidade,
            responsavel: row.responsavel,
            conciliacaoId: row.id,
            dossieId: null,
        }));
        return {
            total: registros.length,
            registros,
        };
    }
    atribuirDivergencia(id, responsavel) {
        this.getTransacaoById(id);
        const current = this.manualMeta.get(id) ?? {};
        this.manualMeta.set(id, {
            ...current,
            responsavel,
        });
        return { status: "ok" };
    }
    gerarContestacao(id) {
        this.getTransacaoById(id);
        const current = this.manualMeta.get(id) ?? {};
        this.manualMeta.set(id, {
            ...current,
            workflowStatus: "CONTESTADA",
        });
        const persisted = reconaiStore.getReconciliationById(id);
        if (persisted) {
            reconaiStore.updateWorkflowStatus(id, "CONTESTADA");
        }
        return {
            protocolo: `CST-${Date.now()}`,
            status: "CONTESTADA",
        };
    }
}
