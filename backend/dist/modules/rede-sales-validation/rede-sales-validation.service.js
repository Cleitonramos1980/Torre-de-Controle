import * as XLSX from "xlsx";
import { AppError } from "../../utils/error.js";
import { REDE_SALES_VALIDATION_STATUS as STATUS } from "./enums/validation-status.js";
function toIsoDate(value) {
    if (!value)
        return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()))
        return null;
    return parsed.toISOString().slice(0, 10);
}
function asCsvCell(value) {
    if (value == null)
        return "";
    const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
    if (/[",;\n]/.test(raw)) {
        return `"${raw.replace(/"/g, "\"\"")}"`;
    }
    return raw;
}
function normalizeDigits(value) {
    if (!value)
        return "";
    return String(value).replace(/[^0-9]/g, "");
}
export class RedeSalesValidationService {
    logger;
    parserService;
    importService;
    repository;
    matchingService;
    winthorRepository;
    constructor(logger, dependencies) {
        this.logger = logger;
        this.parserService = dependencies.parserService;
        this.importService = dependencies.importService;
        this.repository = dependencies.repository;
        this.matchingService = dependencies.matchingService;
        this.winthorRepository = dependencies.winthorRepository;
    }
    resolvePeriod(parsed) {
        const today = new Date().toISOString().slice(0, 10);
        return {
            start: parsed.periodStart ?? today,
            end: parsed.periodEnd ?? parsed.periodStart ?? today,
        };
    }
    async processUpload(payload) {
        const tolerances = payload.tolerances ?? {};
        const importMeta = this.importService.buildFilePayload(payload.fileName, payload.buffer, payload.uploadedBy);
        const batch = this.repository.createBatch({
            fileName: importMeta.fileName,
            fileHash: importMeta.fileHash,
            uploadedBy: importMeta.uploadedBy,
            tenantId: payload.tenantId,
            status: "PROCESSANDO",
            startedAt: importMeta.uploadedAt,
        });
        try {
            const parsed = this.parserService.parseWorkbook(payload.buffer, payload.fileName);
            const period = this.resolvePeriod(parsed);
            this.repository.updateBatch(batch.id, {
                period_start: period.start,
                period_end: period.end,
                total_rows: parsed.parsedRows.length,
                metadata: {
                    sheetName: parsed.sheetName,
                    headerRowIndex: parsed.headerRowIndex,
                    headers: parsed.headers,
                    preview: parsed.preview,
                    parserPeriodStart: parsed.periodStart,
                    parserPeriodEnd: parsed.periodEnd,
                    parsedRows: parsed.parsedRows,
                    tolerances,
                },
            });
            const uniqueCnpjs = Array.from(new Set(parsed.parsedRows.map((row) => normalizeDigits(row.branchCnpjNormalized)).filter((value) => value.length > 0)));
            const filialByCnpjMap = await this.winthorRepository.findFiliaisByCnpjs(uniqueCnpjs);
            const filialCodes = Array.from(new Set(Array.from(filialByCnpjMap.values()).map((row) => row.codigo)));
            const winthorSales = filialCodes.length > 0
                ? await this.winthorRepository.listSalesByFiliaisAndPeriod(filialCodes, period.start, period.end)
                : [];
            const winthorItems = filialCodes.length > 0
                ? await this.winthorRepository.listItemsByFiliaisAndPeriod(filialCodes, period.start, period.end)
                : [];
            const crossDocCache = new Map();
            const getCrossFilialByDocument = async (documento) => {
                const key = String(documento ?? "").trim();
                if (!key)
                    return [];
                if (crossDocCache.has(key))
                    return crossDocCache.get(key) ?? [];
                const rows = await this.winthorRepository.findSalesByDocumentAnyFilial(key, period.start, period.end);
                crossDocCache.set(key, rows);
                return rows;
            };
            const match = await this.matchingService.match({
                parsedRows: parsed.parsedRows,
                filialByCnpjMap,
                winthorSales,
                winthorItems,
                findCrossFilialByDocument: getCrossFilialByDocument,
                tolerances,
            });
            const items = this.repository.replaceItems(batch.id, match.items);
            const unmatched = this.repository.replaceWinthorUnmatched(batch.id, match.winthorUnmatched);
            const updatedBatch = this.repository.updateBatch(batch.id, {
                status: "PROCESSADO",
                total_rows: match.summary.totalRows,
                total_system_rows: match.summary.totalSystemRows,
                total_validated: match.summary.totalValidated,
                total_branch_not_found: match.summary.totalBranchNotFound,
                total_rede_not_found_winthor: match.summary.totalRedeNotFoundWinthor,
                total_winthor_not_found_rede: match.summary.totalWinthorNotFoundRede,
                total_nsu_divergence: match.summary.totalNsuDivergence,
                total_value_divergence: match.summary.totalValueDivergence,
                total_date_divergence: match.summary.totalDateDivergence,
                total_filial_divergence: match.summary.totalFilialDivergence,
                total_manual_review: match.summary.totalManualReview,
                total_match_provavel: match.summary.totalMatchProvavel,
                total_divergent_amount: match.summary.totalDivergentAmount,
                compliance_percent: match.summary.compliancePercent,
                finished_at: new Date().toISOString(),
                metadata: {
                    ...(batch.metadata ?? {}),
                    sheetName: parsed.sheetName,
                    headerRowIndex: parsed.headerRowIndex,
                    headers: parsed.headers,
                    preview: parsed.preview,
                    parserPeriodStart: parsed.periodStart,
                    parserPeriodEnd: parsed.periodEnd,
                    winthorItemsChecked: winthorItems.length,
                    filiaisMapeadas: Array.from(filialByCnpjMap.values()),
                    tolerances: match.summary.tolerances,
                },
            });
            return {
                batchId: updatedBatch?.id ?? batch.id,
                resumo: this.repository.getSummary(batch.id),
                preview: parsed.preview,
                itensProcessados: items.length,
                winthorSemRede: unmatched.length,
            };
        }
        catch (error) {
            this.repository.updateBatch(batch.id, {
                status: "ERRO",
                finished_at: new Date().toISOString(),
                metadata: {
                    ...(batch.metadata ?? {}),
                    error: error instanceof Error ? error.message : String(error),
                },
            });
            throw error;
        }
    }
    getBatchOrThrow(batchId) {
        const batch = this.repository.getBatchById(batchId);
        if (!batch) {
            throw new AppError("Validacao nao encontrada.", 404);
        }
        return batch;
    }
    getValidationDetails(batchId) {
        const batch = this.getBatchOrThrow(batchId);
        const summary = this.repository.getSummary(batch.id);
        const unmatched = this.repository.listWinthorUnmatched(batch.id, {
            page: 1,
            pageSize: 50,
        });
        return {
            batch,
            summary,
            winthorSemRede: unmatched,
            preview: batch.metadata?.preview ?? [],
        };
    }
    getValidationItems(batchId, query) {
        this.getBatchOrThrow(batchId);
        return this.repository.listItems(batchId, query);
    }
    getValidationSummary(batchId) {
        this.getBatchOrThrow(batchId);
        return this.repository.getSummary(batchId);
    }
    getValidationWinthorUnmatched(batchId, query) {
        this.getBatchOrThrow(batchId);
        return this.repository.listWinthorUnmatched(batchId, query);
    }
    getHistory(limit) {
        return this.repository.listHistory(limit);
    }
    async reprocess(batchId) {
        const batch = this.getBatchOrThrow(batchId);
        const parsedRows = Array.isArray(batch.metadata?.parsedRows) ? batch.metadata.parsedRows : null;
        if (!parsedRows || parsedRows.length === 0) {
            throw new AppError("Nao ha dados salvos para reprocessamento desta validacao.", 400);
        }
        const periodStart = batch.period_start ?? toIsoDate(new Date()) ?? new Date().toISOString().slice(0, 10);
        const periodEnd = batch.period_end ?? periodStart;
        const tolerances = batch.metadata?.tolerances ?? {};
        this.repository.updateBatch(batchId, {
            status: "REPROCESSANDO",
        });
        const uniqueCnpjs = Array.from(new Set(parsedRows.map((row) => normalizeDigits(row.branchCnpjNormalized)).filter((value) => value.length > 0)));
        const filialByCnpjMap = await this.winthorRepository.findFiliaisByCnpjs(uniqueCnpjs);
        const filialCodes = Array.from(new Set(Array.from(filialByCnpjMap.values()).map((row) => row.codigo)));
        const winthorSales = filialCodes.length > 0
            ? await this.winthorRepository.listSalesByFiliaisAndPeriod(filialCodes, periodStart, periodEnd)
            : [];
        const winthorItems = filialCodes.length > 0
            ? await this.winthorRepository.listItemsByFiliaisAndPeriod(filialCodes, periodStart, periodEnd)
            : [];
        const crossDocCache = new Map();
        const getCrossFilialByDocument = async (documento) => {
            const key = String(documento ?? "").trim();
            if (!key)
                return [];
            if (crossDocCache.has(key))
                return crossDocCache.get(key) ?? [];
            const rows = await this.winthorRepository.findSalesByDocumentAnyFilial(key, periodStart, periodEnd);
            crossDocCache.set(key, rows);
            return rows;
        };
        const match = await this.matchingService.match({
            parsedRows,
            filialByCnpjMap,
            winthorSales,
            winthorItems,
            findCrossFilialByDocument: getCrossFilialByDocument,
            tolerances,
        });
        this.repository.replaceItems(batch.id, match.items);
        this.repository.replaceWinthorUnmatched(batch.id, match.winthorUnmatched);
        this.repository.updateBatch(batch.id, {
            status: "PROCESSADO",
            total_rows: match.summary.totalRows,
            total_system_rows: match.summary.totalSystemRows,
            total_validated: match.summary.totalValidated,
            total_branch_not_found: match.summary.totalBranchNotFound,
            total_rede_not_found_winthor: match.summary.totalRedeNotFoundWinthor,
            total_winthor_not_found_rede: match.summary.totalWinthorNotFoundRede,
            total_nsu_divergence: match.summary.totalNsuDivergence,
            total_value_divergence: match.summary.totalValueDivergence,
            total_date_divergence: match.summary.totalDateDivergence,
            total_filial_divergence: match.summary.totalFilialDivergence,
            total_manual_review: match.summary.totalManualReview,
            total_match_provavel: match.summary.totalMatchProvavel,
            total_divergent_amount: match.summary.totalDivergentAmount,
            compliance_percent: match.summary.compliancePercent,
            finished_at: new Date().toISOString(),
        });
        return {
            batchId: batch.id,
            resumo: this.repository.getSummary(batch.id),
        };
    }
    markItemManual(batchId, itemId, reason) {
        this.getBatchOrThrow(batchId);
        const updated = this.repository.markItemManual(batchId, itemId, reason);
        if (!updated) {
            throw new AppError("Item de validacao nao encontrado.", 404);
        }
        return updated;
    }
    exportBatch(batchId, format, scope = "all") {
        const batch = this.getBatchOrThrow(batchId);
        const safeFormat = String(format ?? "xlsx").toLowerCase() === "csv" ? "csv" : "xlsx";
        const allowedScopes = new Set(["all", "divergencias", "rede-nao-encontradas", "sistema-nao-encontradas", "valor", "data", "nsu"]);
        const safeScope = allowedScopes.has(scope) ? scope : "all";
        const allItems = this.repository.getItemsByBatchId(batchId);
        const unmatched = this.repository.getWinthorUnmatchedByBatchId(batchId);
        const items = allItems
            .filter((item) => {
            if (safeScope === "all")
                return true;
            if (safeScope === "divergencias")
                return item.validation_status !== STATUS.VENDA_VALIDADA;
            if (safeScope === "rede-nao-encontradas")
                return item.validation_status === STATUS.VENDA_REDE_NAO_ENCONTRADA_NO_SISTEMA;
            if (safeScope === "valor")
                return item.value_status === "VALOR_DIVERGENTE";
            if (safeScope === "data")
                return item.date_status === "DATA_DIVERGENTE";
            if (safeScope === "nsu")
                return item.nsu_status === "NSU_DIVERGENTE";
            return true;
        })
            .sort((a, b) => Number(a.row_number) - Number(b.row_number));
        const baseRows = items.map((item) => ({
            linha_planilha: item.row_number,
            cnpj_rede: item.branch_cnpj_raw,
            cnpj_rede_normalizado: item.branch_cnpj_normalized,
            codigo_filial_winthor: item.pcfilial_codigo,
            nsu_rede: item.rede_nsu,
            nsu_sistema: item.winthor_nsu,
            status_nsu: item.nsu_status,
            data_rede: item.rede_sale_date,
            data_sistema: item.winthor_sale_date,
            status_data: item.date_status,
            valor_rede: item.rede_amount,
            valor_sistema: item.winthor_amount,
            diferenca_valor: item.value_difference,
            status_valor: item.value_status,
            diferenca_dias: item.date_difference_days,
            pedido_rede: item.rede_document,
            pedido_sistema: item.winthor_numped,
            nota_sistema: item.winthor_numnota,
            status_documento: item.document_status,
            status_filial: item.filial_status,
            status_geral: item.validation_status,
            match_score: item.match_score,
            match_classification: item.match_classification,
            motivo_divergencia: item.reason,
        }));
        const unmatchedRows = unmatched.map((item) => ({
            linha_planilha: "",
            cnpj_rede: "",
            cnpj_rede_normalizado: "",
            codigo_filial_winthor: item.codfilial,
            nsu_rede: "",
            nsu_sistema: item.nsu,
            status_nsu: item.nsu ? "NSU_NAO_LOCALIZADO_NA_REDE" : "NSU_NAO_LOCALIZADO_NO_WINTHOR",
            data_rede: "",
            data_sistema: item.data,
            status_data: "DATA_DIVERGENTE",
            valor_rede: "",
            valor_sistema: item.vltotal,
            diferenca_valor: "",
            status_valor: "VALOR_DIVERGENTE",
            diferenca_dias: "",
            pedido_rede: "",
            pedido_sistema: item.numped,
            nota_sistema: item.numnota,
            cliente: item.codcli,
            cobranca: item.codcob,
            status_geral: item.status,
            match_score: 0,
            match_classification: "NAO_ENCONTRADO",
            motivo_divergencia: item.reason,
        }));
        const exportRows = safeScope === "sistema-nao-encontradas" ? unmatchedRows : baseRows;
        const fileName = `rede-sales-validation-${batch.id}-${safeScope}.${safeFormat}`;
        if (safeFormat === "csv") {
            const headers = Object.keys(exportRows[0] ?? {
                linha_planilha: "",
                cnpj_rede: "",
                codigo_filial_winthor: "",
                nsu_rede: "",
                nsu_sistema: "",
                status_nsu: "",
                data_rede: "",
                data_sistema: "",
                status_data: "",
                valor_rede: "",
                valor_sistema: "",
                diferenca_valor: "",
                status_valor: "",
                pedido_rede: "",
                pedido_sistema: "",
                nota_sistema: "",
                status_geral: "",
                match_score: "",
                motivo_divergencia: "",
            });
            const csvLines = [headers.join(";")];
            for (const row of exportRows) {
                csvLines.push(headers.map((key) => asCsvCell(row[key])).join(";"));
            }
            const csvContent = csvLines.join("\n");
            return {
                format: "csv",
                fileName,
                downloadUrl: `data:text/csv;charset=utf-8,${encodeURIComponent(csvContent)}`,
                totalRows: exportRows.length,
            };
        }
        const workbook = XLSX.utils.book_new();
        const resultSheet = XLSX.utils.json_to_sheet(exportRows);
        XLSX.utils.book_append_sheet(workbook, resultSheet, "Resultados");
        const unmatchedSheet = XLSX.utils.json_to_sheet(unmatchedRows);
        XLSX.utils.book_append_sheet(workbook, unmatchedSheet, "WinthorSemRede");
        const base64 = XLSX.write(workbook, { bookType: "xlsx", type: "base64" });
        return {
            format: "xlsx",
            fileName,
            downloadUrl: `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`,
            totalRows: exportRows.length,
        };
    }
}
