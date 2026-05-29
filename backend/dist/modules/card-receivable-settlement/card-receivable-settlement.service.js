import XLSX from "xlsx";
import { randomUUID } from "node:crypto";
import { AppError } from "../../utils/error.js";
import { CARD_SETTLEMENT_STATUS as STATUS } from "./enums/settlement-status.js";
import { CARD_SETTLEMENT_ALLOWED_CODCOB } from "./winthor-pcprest-settlement.repository.js";
function normalizeDoc(value) {
    return String(value ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}
function uniquePayments(payments) {
    const output = [];
    const seen = new Set();
    for (const payment of payments) {
        if (!payment?.id || seen.has(payment.id))
            continue;
        seen.add(payment.id);
        output.push(payment);
    }
    return output;
}
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
    const raw = String(value);
    if (raw.includes(";") || raw.includes('"') || raw.includes("\n")) {
        return `"${raw.replace(/"/g, '""')}"`;
    }
    return raw;
}
function nowIso() {
    return new Date().toISOString();
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}
function createActor(actor) {
    return {
        userId: String(actor?.userId ?? "system"),
        userName: String(actor?.userName ?? "system"),
        perfil: String(actor?.perfil ?? "SYSTEM"),
    };
}
function sanitizeIdentifier(value) {
    return String(value ?? "").replace(/[^0-9A-Za-z_-]/g, "").slice(0, 64);
}
function sanitizeBatchForApi(batch) {
    if (!batch)
        return null;
    const source = batch.metadata && typeof batch.metadata === "object" ? batch.metadata : {};
    const metadata = {
        sheetName: source.sheetName ?? null,
        headerRowIndex: source.headerRowIndex ?? null,
        parserPeriodStart: source.parserPeriodStart ?? null,
        parserPeriodEnd: source.parserPeriodEnd ?? null,
        tolerances: source.tolerances ?? null,
        regraPrimeiroFiltro: source.regraPrimeiroFiltro ?? null,
        bancoFiltro: source.bancoFiltro ?? null,
        bancoRegra: source.bancoRegra ?? null,
        codcobFiltro: source.codcobFiltro ?? null,
        cobrancaRegra: source.cobrancaRegra ?? null,
        origem: source.origem ?? null,
    };
    return {
        ...batch,
        metadata,
    };
}
function summarizePcprestTitles(payments) {
    const rows = payments.map((payment) => ({
        codfilial: payment.codfilial,
        codcli: payment.codcli,
        cliente: payment.cliente,
        documento_cliente: payment.documentoCliente,
        duplic: payment.duplic,
        prest: payment.prest,
        numped: payment.numped,
        numnota: payment.numnota,
        nsutef: payment.nsu,
        autorizacao: payment.codautorizacao,
        dtemissao: payment.dtemissao,
        dtvenc: payment.dtvenc,
        dtpag: payment.dtpag,
        valor_original: payment.valorOriginal,
        valor_pago: payment.valorPago,
        valor_aberto: payment.valorAberto,
        codcob: payment.codcob,
        cobranca: payment.cobranca,
        codbanco: payment.codbanco,
        status_titulo: payment.statusTitulo,
    })).sort((a, b) => String(a.dtvenc ?? "").localeCompare(String(b.dtvenc ?? "")) || Number(a.prest ?? 0) - Number(b.prest ?? 0));
    const totalValor = Number(rows.reduce((sum, row) => sum + Number(row.valor_original ?? 0), 0).toFixed(2));
    const totalPago = Number(rows.reduce((sum, row) => sum + Number(row.valor_pago ?? 0), 0).toFixed(2));
    const totalAberto = Number(rows.reduce((sum, row) => sum + Number(row.valor_aberto ?? 0), 0).toFixed(2));
    return {
        total_titulos: rows.length,
        total_valor: totalValor,
        total_pago: totalPago,
        total_aberto: totalAberto,
        titulos_abertos: rows.filter((row) => row.status_titulo === "EM_ABERTO").length,
        titulos_parciais: rows.filter((row) => row.status_titulo === "PAGO_PARCIAL").length,
        titulos_pagos: rows.filter((row) => row.status_titulo === "PAGO").length,
        rows,
    };
}
export class CardReceivableSettlementService {
    logger;
    parserService;
    importService;
    repository;
    matchingService;
    winthorRepository;
    filialResolverService;
    filialEstabelecimentoLinkService;
    reprocessJobs;
    reprocessByBatch;
    constructor(logger, dependencies) {
        this.logger = logger;
        this.parserService = dependencies.parserService;
        this.importService = dependencies.importService;
        this.repository = dependencies.repository;
        this.matchingService = dependencies.matchingService;
        this.winthorRepository = dependencies.winthorRepository;
        this.filialResolverService = dependencies.filialResolverService;
        this.filialEstabelecimentoLinkService = dependencies.filialEstabelecimentoLinkService;
        this.reprocessJobs = new Map();
        this.reprocessByBatch = new Map();
    }
    pruneReprocessJobs(max = 200) {
        const rows = Array.from(this.reprocessJobs.values())
            .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
        for (const row of rows.slice(max)) {
            this.reprocessJobs.delete(row.id);
        }
    }
    toJobSnapshot(job) {
        return {
            id: job.id,
            batchId: job.batchId,
            status: job.status,
            reused: Boolean(job.reused),
            startedAt: job.startedAt,
            finishedAt: job.finishedAt ?? null,
            error: job.error ?? null,
            actor: job.actor,
            durationMs: job.finishedAt ? Math.max(0, new Date(job.finishedAt).getTime() - new Date(job.startedAt).getTime()) : null,
            result: job.result ?? null,
        };
    }
    createReprocessJob(batchId, actor) {
        const now = nowIso();
        const job = {
            id: `CST-RP-${Date.now()}-${randomUUID().slice(0, 8)}`,
            batchId,
            status: "RUNNING",
            reused: false,
            startedAt: now,
            finishedAt: null,
            actor: createActor(actor),
            error: null,
            result: null,
            promise: null,
        };
        this.reprocessJobs.set(job.id, job);
        this.reprocessByBatch.set(String(batchId), job.id);
        this.repository.appendActionLog({
            batchId,
            eventType: "REPROCESS_START",
            actorId: job.actor.userId,
            actorName: job.actor.userName,
            actorProfile: job.actor.perfil,
            payload: { jobId: job.id },
        });
        this.pruneReprocessJobs();
        return job;
    }
    getRunningReprocessJob(batchId) {
        const runningId = this.reprocessByBatch.get(String(batchId));
        if (!runningId)
            return null;
        return this.reprocessJobs.get(String(runningId)) ?? null;
    }
    resolvePeriod(parsed) {
        const today = new Date().toISOString().slice(0, 10);
        return {
            start: parsed.periodStart ?? today,
            end: parsed.periodEnd ?? parsed.periodStart ?? today,
        };
    }
    async executeMatch(batch, parsedRows, periodStart, periodEnd, tolerances) {
        const activeLinks = this.filialEstabelecimentoLinkService.listLinks({
            tenantId: batch.tenant_id ?? "default",
            adquirente: "REDE",
            ativo: true,
        }).rows;
        const filialCodes = Array.from(new Set(activeLinks.map((row) => String(row.filial_codigo ?? "").trim()).filter(Boolean)));
        const uniqueNsuKeys = Array.from(new Set(parsedRows.flatMap((row) => [row.redeNsu, row.redeAuthorization].map((value) => normalizeDoc(value))).filter(Boolean)));
        const nsutefPayments = await this.winthorRepository.findPaymentsByNsutef(uniqueNsuKeys);
        const periodPayments = await this.winthorRepository.listPaidByFiliaisAndPeriod(filialCodes, periodStart, periodEnd);
        const winthorPayments = uniquePayments([...nsutefPayments, ...periodPayments]);
        const resolveFilial = (row) => this.filialResolverService.resolve(row, {
            tenantId: batch.tenant_id ?? "default",
            adquirente: "REDE",
            winthorPayments,
        });
        const match = await this.matchingService.match({
            parsedRows,
            winthorPayments,
            tolerances,
            resolveFilial,
            establishmentCoverage: batch.metadata?.establishmentCoverage ?? null,
        });
        const items = this.repository.replaceItems(batch.id, match.items);
        const unmatched = this.repository.replaceWinthorUnmatched(batch.id, match.winthorUnmatched);
        const hasBlockingFilial = Number(match.summary.totalSemFilial ?? 0) > 0 ||
            Number(match.summary.totalDivergenciaFilial ?? 0) > 0 ||
            Number(match.summary.totalBloqueado ?? 0) > 0;
        const updatedBatch = this.repository.updateBatch(batch.id, {
            status: hasBlockingFilial ? "PENDENTE_VINCULO_FILIAL" : "PROCESSADO",
            total_rede_rows: match.summary.totalRedeRows,
            total_winthor_rows: match.summary.totalWinthorRows,
            total_conciliated: match.summary.totalConciliated,
            total_rede_not_found_winthor: match.summary.totalRedeNotFoundWinthor,
            total_winthor_not_found_rede: match.summary.totalWinthorNotFoundRede,
            total_value_divergence: match.summary.totalValueDivergence,
            total_date_divergence: match.summary.totalDateDivergence,
            total_title_pending_settlement: match.summary.totalTitlePendingSettlement,
            total_branch_not_found: match.summary.totalBranchNotFound,
            total_bank_divergence: match.summary.totalBankDivergence,
            total_manual_review: match.summary.totalManualReview,
            total_rede_amount: match.summary.totalRedeAmount,
            total_winthor_paid_amount: match.summary.totalWinthorPaidAmount,
            total_difference_amount: match.summary.totalDifferenceAmount,
            conformity_percentage: match.summary.conformityPercentage,
            finished_at: new Date().toISOString(),
            metadata: {
                ...(batch.metadata ?? {}),
                tolerances: match.summary.tolerances,
                filiaisMapeadas: filialCodes,
                vinculosEstabelecimentoAtivos: activeLinks.length,
                winthorRowsChecked: winthorPayments.length,
                nsutefKeysChecked: uniqueNsuKeys.length,
                nsutefRowsChecked: nsutefPayments.length,
                periodoRowsChecked: periodPayments.length,
                totalEstablishmentsUnique: match.summary.totalEstablishmentsUnique,
                totalEstablishmentsLocated: match.summary.totalEstablishmentsLocated,
                totalFilialByVendaOriginal: match.summary.totalFilialByVendaOriginal,
                totalFilialByEstabelecimentoRede: match.summary.totalFilialByEstabelecimentoRede,
                totalFilialByNome: match.summary.totalFilialByNome,
                totalSemFilial: match.summary.totalSemFilial,
                totalDivergenciaFilial: match.summary.totalDivergenciaFilial,
                totalBloqueado: match.summary.totalBloqueado,
                regraPrimeiroFiltro: "PCPREST.NSUTEF = NSU/CV_REDE",
                bancoFiltro: null,
                bancoRegra: "PCPREST_INDEPENDENTE_DO_CODBANCO",
                codcobFiltro: CARD_SETTLEMENT_ALLOWED_CODCOB,
                cobrancaRegra: "PCPREST_FILTRADA_POR_CODCOB_RECEBIVEIS_CARTAO",
                origem: "REDE_RECEBIMENTOS_X_PCPREST",
            },
        });
        return {
            batchId: updatedBatch?.id ?? batch.id,
            resumo: this.repository.getSummary(batch.id),
            itensProcessados: items.length,
            winthorSemRede: unmatched.length,
        };
    }
    async processUpload(payload) {
        const importMeta = this.importService.buildFilePayload(payload.fileName, payload.buffer, payload.uploadedBy);
        const batch = this.repository.createBatch({
            fileName: importMeta.fileName,
            fileHash: importMeta.fileHash,
            uploadedBy: importMeta.uploadedBy,
            tenantId: payload.tenantId,
            status: "PROCESSANDO",
            startedAt: importMeta.uploadedAt,
        });
        this.repository.appendActionLog({
            batchId: batch.id,
            eventType: "UPLOAD_RECEBIDO",
            actorId: String(payload.uploadedBy ?? "system"),
            actorName: String(payload.uploadedBy ?? "system"),
            actorProfile: "UPLOAD",
            payload: {
                fileName: importMeta.fileName,
                fileHash: importMeta.fileHash,
                uploadedAt: importMeta.uploadedAt,
            },
        });
        try {
            const parsed = this.parserService.parseWorkbook(payload.buffer, payload.fileName);
            const period = this.resolvePeriod(parsed);
            this.repository.updateBatch(batch.id, {
                period_start: period.start,
                period_end: period.end,
                total_rede_rows: parsed.parsedRows.length,
                total_rede_amount: Number(parsed.parsedRows.reduce((sum, row) => sum + Number(row.redeReceivedAmount ?? 0), 0).toFixed(2)),
                metadata: {
                    sheetName: parsed.sheetName,
                    headerRowIndex: parsed.headerRowIndex,
                    headers: parsed.headers,
                    preview: parsed.preview,
                    parserPeriodStart: parsed.periodStart,
                    parserPeriodEnd: parsed.periodEnd,
                    establishmentCoverage: parsed.establishmentCoverage ?? null,
                    parsedRows: parsed.parsedRows,
                    tolerances: payload.tolerances ?? {},
                    regraPrimeiroFiltro: "PCPREST.NSUTEF = NSU/CV_REDE",
                    bancoFiltro: null,
                    bancoRegra: "PCPREST_INDEPENDENTE_DO_CODBANCO",
                    codcobFiltro: CARD_SETTLEMENT_ALLOWED_CODCOB,
                    cobrancaRegra: "PCPREST_FILTRADA_POR_CODCOB_RECEBIVEIS_CARTAO",
                    origem: "REDE_RECEBIMENTOS_X_PCPREST",
                },
            });
            const result = await this.executeMatch({ ...batch, metadata: this.repository.getBatchById(batch.id)?.metadata ?? {} }, parsed.parsedRows, period.start, period.end, payload.tolerances ?? {});
            this.repository.appendActionLog({
                batchId: batch.id,
                eventType: "UPLOAD_PROCESSADO",
                actorId: String(payload.uploadedBy ?? "system"),
                actorName: String(payload.uploadedBy ?? "system"),
                actorProfile: "UPLOAD",
                payload: {
                    periodStart: period.start,
                    periodEnd: period.end,
                    itensProcessados: result.itensProcessados,
                    winthorSemRede: result.winthorSemRede,
                },
            });
            return result;
        }
        catch (error) {
            this.repository.updateBatch(batch.id, {
                status: "ERRO",
                finished_at: new Date().toISOString(),
                metadata: {
                    ...(batch.metadata ?? {}),
                    error: error instanceof Error ? error.message : String(error),
                    regraPrimeiroFiltro: "PCPREST.NSUTEF = NSU/CV_REDE",
                    bancoFiltro: null,
                    bancoRegra: "PCPREST_INDEPENDENTE_DO_CODBANCO",
                    codcobFiltro: CARD_SETTLEMENT_ALLOWED_CODCOB,
                    cobrancaRegra: "PCPREST_FILTRADA_POR_CODCOB_RECEBIVEIS_CARTAO",
                },
            });
            this.repository.appendActionLog({
                batchId: batch.id,
                eventType: "UPLOAD_ERRO",
                actorId: String(payload.uploadedBy ?? "system"),
                actorName: String(payload.uploadedBy ?? "system"),
                actorProfile: "UPLOAD",
                payload: {
                    message: error instanceof Error ? error.message : String(error),
                },
            });
            throw error;
        }
    }
    getBatchOrThrow(batchId) {
        const batch = this.repository.getBatchById(batchId);
        if (!batch)
            throw new AppError("Processamento de conciliado cartao nao encontrado.", 404);
        return batch;
    }
    getDetails(batchId) {
        const batch = this.getBatchOrThrow(batchId);
        return {
            batch: sanitizeBatchForApi(batch),
            summary: this.repository.getSummary(batch.id),
            preview: batch.metadata?.preview ?? [],
            winthorSemRede: this.repository.listWinthorUnmatched(batch.id, { page: 1, pageSize: 50 }),
        };
    }
    getItems(batchId, query) {
        this.getBatchOrThrow(batchId);
        return this.repository.listItems(batchId, query);
    }
    async getItemTitles(batchId, itemId) {
        this.getBatchOrThrow(batchId);
        const item = this.repository.getItemsByBatchId(batchId).find((row) => String(row.id) === String(itemId));
        if (!item)
            throw new AppError("Item de conciliado cartao nao encontrado.", 404);
        const nsuKeys = Array.from(new Set([item.winthor_nsu, item.rede_nsu, item.rede_authorization, item.winthor_authorization]
            .map((value) => normalizeDoc(value))
            .filter(Boolean)));
        if (nsuKeys.length === 0) {
            return {
                filtro_principal: "PCPREST.NSUTEF",
                nsus_pesquisados: [],
                total_titulos: 0,
                total_valor: 0,
                total_pago: 0,
                total_aberto: 0,
                titulos_abertos: 0,
                titulos_parciais: 0,
                titulos_pagos: 0,
                rows: [],
            };
        }
        const payments = await this.winthorRepository.findPaymentsByNsutef(nsuKeys);
        return {
            filtro_principal: "PCPREST.NSUTEF",
            nsus_pesquisados: nsuKeys,
            ...summarizePcprestTitles(payments),
        };
    }
    getItemFilterOptions(batchId) {
        this.getBatchOrThrow(batchId);
        return this.repository.getItemFilterOptions(batchId);
    }
    getSummary(batchId) {
        this.getBatchOrThrow(batchId);
        return this.repository.getSummary(batchId);
    }
    getSettlementCandidates(batchId, query = {}) {
        this.getBatchOrThrow(batchId);
        return this.repository.listSettlementCandidates(batchId, {
            onlyUnconfirmed: query.onlyUnconfirmed,
            filial: query.filial ?? null,
            includeExplainability: query.includeExplainability,
        });
    }
    confirmSettlementCandidates(batchId, itemIds, actor) {
        this.getBatchOrThrow(batchId);
        if (!Array.isArray(itemIds) || itemIds.length === 0) {
            throw new AppError("Selecione ao menos um titulo para confirmar baixa.", 400);
        }
        const safeActor = createActor(actor);
        const result = this.repository.confirmSettlementCandidates(batchId, itemIds, safeActor);
        this.repository.appendActionLog({
            batchId,
            eventType: "BAIXA_CONFIRMACAO",
            actorId: safeActor.userId,
            actorName: safeActor.userName,
            actorProfile: safeActor.perfil,
            payload: {
                totalSolicitados: result.totalSolicitados,
                totalAtualizados: result.totalAtualizados,
                totalIgnorados: result.ignorados.length,
            },
        });
        return {
            ...result,
            summary: this.repository.listSettlementCandidates(batchId, { onlyUnconfirmed: false, includeExplainability: false }).summary,
        };
    }
    getWinthorUnmatched(batchId, query) {
        this.getBatchOrThrow(batchId);
        return this.repository.listWinthorUnmatched(batchId, query);
    }
    getHistory(limit) {
        return this.repository.listHistory(limit);
    }
    listActionLogs(batchId, limit = 200) {
        this.getBatchOrThrow(batchId);
        return this.repository.listActionLogs(batchId, limit);
    }
    getOperationalTelemetry(batchId) {
        const batch = this.getBatchOrThrow(batchId);
        const summary = this.repository.getSummary(batchId);
        const candidates = this.repository.listSettlementCandidates(batchId, { onlyUnconfirmed: false, includeExplainability: false });
        const logs = this.repository.listActionLogs(batchId, 100).registros;
        const runningJob = this.getRunningReprocessJob(batchId);
        return {
            batchId: batch.id,
            status: batch.status,
            summary,
            baixaAutomatica: {
                ...candidates.summary,
                total_executados_sucesso: candidates.registros.filter((row) => row.baixa_execucao_status === "EXECUTADO_SUCESSO").length,
                total_execucao_erro: candidates.registros.filter((row) => row.baixa_execucao_status === "ERRO_EXECUCAO").length,
            },
            reprocessamento: runningJob ? this.toJobSnapshot(runningJob) : null,
            eventosRecentes: logs,
            generatedAt: nowIso(),
        };
    }
    listFilialEstabelecimentoLinks(filters = {}) {
        return this.filialEstabelecimentoLinkService.listLinks(filters);
    }
    upsertFilialEstabelecimentoLink(payload) {
        return this.filialEstabelecimentoLinkService.upsertLink(payload);
    }
    updateFilialEstabelecimentoLink(id, payload) {
        return this.filialEstabelecimentoLinkService.updateLink(id, payload);
    }
    async importFilialEstabelecimentoLinks(payload) {
        return this.filialEstabelecimentoLinkService.importMaquininhaAndCnpj(payload);
    }
    getPendencias(batchId) {
        const batch = this.getBatchOrThrow(batchId);
        const blockedStatuses = new Set([
            STATUS.FILIAL_NAO_ENCONTRADA,
            STATUS.FILIAL_DIVERGENTE,
            STATUS.VINCULO_DUPLICADO,
            STATUS.PENDENTE_VINCULO_FILIAL,
        ]);
        const rows = this.repository.getItemsByBatchId(batchId)
            .filter((item) => !item.filial_id || blockedStatuses.has(item.validation_status))
            .sort((a, b) => Number(a.row_number) - Number(b.row_number))
            .map((item) => ({
            arquivo: batch.file_name,
            aba: item.source_sheet_name ?? batch.metadata?.sheetName ?? null,
            linha: item.row_number,
            codigo_estabelecimento: item.codigo_estabelecimento_rede ?? null,
            nome_estabelecimento: item.nome_estabelecimento_rede ?? null,
            nome_maquininha: item.nome_maquininha ?? null,
            nsu_cv: item.rede_nsu ?? null,
            tid: item.rede_tid ?? null,
            numero_autorizacao: item.rede_authorization ?? null,
            numero_cartao: item.rede_card_number ?? null,
            data_original_venda: item.rede_sale_date ?? null,
            valor: item.rede_gross_amount ?? item.rede_received_amount ?? null,
            filial_sugerida: item.filial_codigo ?? item.winthor_codfilial ?? null,
            motivo_pendencia: item.pendencia_motivo ?? item.validation_status,
            detalhe: item.pendencia_detalhe ?? item.reason ?? null,
        }));
        return {
            total: rows.length,
            rows,
        };
    }
    async performReprocess(batchId) {
        const batch = this.getBatchOrThrow(batchId);
        const parsedRows = Array.isArray(batch.metadata?.parsedRows) ? batch.metadata.parsedRows : null;
        if (!parsedRows || parsedRows.length === 0)
            throw new AppError("Nao ha dados salvos para reprocessamento deste conciliado.", 400);
        const periodStart = batch.period_start ?? toIsoDate(batch.metadata?.parserPeriodStart) ?? new Date().toISOString().slice(0, 10);
        const periodEnd = batch.period_end ?? toIsoDate(batch.metadata?.parserPeriodEnd) ?? periodStart;
        this.repository.updateBatch(batch.id, { status: "REPROCESSANDO" });
        return this.executeMatch(batch, parsedRows, periodStart, periodEnd, batch.metadata?.tolerances ?? {});
    }
    async startOrJoinReprocess(batchId, actor) {
        this.getBatchOrThrow(batchId);
        const running = this.getRunningReprocessJob(batchId);
        if (running) {
            running.reused = true;
            return running;
        }
        const job = this.createReprocessJob(batchId, actor);
        job.promise = (async () => {
            try {
                const result = await this.performReprocess(batchId);
                job.status = "SUCCESS";
                job.result = result;
                job.finishedAt = nowIso();
                this.repository.appendActionLog({
                    batchId,
                    eventType: "REPROCESS_SUCCESS",
                    actorId: job.actor.userId,
                    actorName: job.actor.userName,
                    actorProfile: job.actor.perfil,
                    payload: {
                        jobId: job.id,
                        itensProcessados: result.itensProcessados,
                        winthorSemRede: result.winthorSemRede,
                    },
                });
                return result;
            }
            catch (error) {
                job.status = "ERROR";
                job.error = error instanceof Error ? error.message : String(error);
                job.finishedAt = nowIso();
                this.repository.appendActionLog({
                    batchId,
                    eventType: "REPROCESS_ERROR",
                    actorId: job.actor.userId,
                    actorName: job.actor.userName,
                    actorProfile: job.actor.perfil,
                    payload: {
                        jobId: job.id,
                        message: job.error,
                    },
                });
                throw error;
            }
            finally {
                if (this.reprocessByBatch.get(String(batchId)) === job.id) {
                    this.reprocessByBatch.delete(String(batchId));
                }
            }
        })();
        return job;
    }
    async reprocess(batchId, options = {}) {
        const actor = createActor(options.actor);
        const asyncMode = options.asyncMode === true;
        const waitTimeoutMs = Math.max(1000, Number(options.waitTimeoutMs ?? 600000));
        const job = await this.startOrJoinReprocess(batchId, actor);
        if (asyncMode) {
            return {
                accepted: true,
                batchId,
                job: this.toJobSnapshot(job),
            };
        }
        if (!job.promise) {
            throw new AppError("Falha ao iniciar reprocessamento.", 500);
        }
        const result = await Promise.race([
            job.promise,
            (async () => {
                await sleep(waitTimeoutMs);
                throw new AppError("Reprocessamento ainda em andamento. Consulte o status do job.", 202);
            })(),
        ]);
        return {
            ...result,
            reprocessJob: this.toJobSnapshot(job),
        };
    }
    getReprocessJob(batchId, jobId) {
        this.getBatchOrThrow(batchId);
        const job = this.reprocessJobs.get(String(jobId));
        if (!job || String(job.batchId) !== String(batchId)) {
            throw new AppError("Job de reprocessamento nao encontrado para este lote.", 404);
        }
        return this.toJobSnapshot(job);
    }
    listReprocessJobs(batchId) {
        this.getBatchOrThrow(batchId);
        const registros = Array.from(this.reprocessJobs.values())
            .filter((job) => String(job.batchId) === String(batchId))
            .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
            .map((job) => this.toJobSnapshot(job));
        return {
            total: registros.length,
            registros,
        };
    }
    simulateSettlementExecution(batchId, input = {}, actor = null) {
        this.getBatchOrThrow(batchId);
        const itemIds = Array.isArray(input.itemIds) ? input.itemIds : [];
        const rows = this.repository.getConfirmedCandidatesForSettlement(batchId, itemIds);
        const keys = new Map();
        const nsuKeys = new Map();
        for (const row of rows) {
            const key = [String(row.winthor_codcli ?? "").trim(), String(row.winthor_duplic ?? "").trim(), String(row.winthor_prest ?? "").trim()].join("|");
            keys.set(key, (keys.get(key) ?? 0) + 1);
            const nsu = String(row.rede_nsu ?? row.winthor_nsu ?? "").trim();
            if (nsu) {
                nsuKeys.set(nsu, (nsuKeys.get(nsu) ?? 0) + 1);
            }
        }
        const analise = rows.map((row) => {
            const key = [String(row.winthor_codcli ?? "").trim(), String(row.winthor_duplic ?? "").trim(), String(row.winthor_prest ?? "").trim()].join("|");
            const nsu = String(row.rede_nsu ?? row.winthor_nsu ?? "").trim();
            const ambiguidade = (keys.get(key) ?? 0) > 1 || (nsu && (nsuKeys.get(nsu) ?? 0) > 1);
            const bloqueios = [];
            if (!String(row.winthor_codcli ?? "").trim())
                bloqueios.push("CODCLI_AUSENTE");
            if (!String(row.winthor_duplic ?? "").trim())
                bloqueios.push("DUPLICATA_AUSENTE");
            if (ambiguidade)
                bloqueios.push("AMBIGUIDADE_DE_MATCH");
            if (row.baixa_execucao_status === "EXECUTADO_SUCESSO")
                bloqueios.push("JA_EXECUTADO");
            return {
                id: row.id,
                row_number: row.row_number,
                codcli: row.winthor_codcli ?? null,
                duplicata: row.winthor_duplic ?? null,
                prestacao: row.winthor_prest ?? null,
                valor_rede: Number(row.rede_gross_amount ?? row.rede_received_amount ?? 0),
                value_status: row.value_status,
                validation_status: row.validation_status,
                bloqueios,
                apto_execucao: bloqueios.length === 0,
            };
        });
        const resumo = {
            total: analise.length,
            aptos: analise.filter((row) => row.apto_execucao).length,
            bloqueados: analise.filter((row) => !row.apto_execucao).length,
            total_valor_apto: Number(analise
                .filter((row) => row.apto_execucao)
                .reduce((sum, row) => sum + Number(row.valor_rede ?? 0), 0)
                .toFixed(2)),
        };
        const safeActor = createActor(actor);
        this.repository.appendActionLog({
            batchId,
            eventType: "BAIXA_SIMULACAO",
            actorId: safeActor.userId,
            actorName: safeActor.userName,
            actorProfile: safeActor.perfil,
            payload: {
                total: resumo.total,
                aptos: resumo.aptos,
                bloqueados: resumo.bloqueados,
                strictMode: input.strictMode !== false,
            },
        });
        return {
            batchId,
            resumo,
            registros: analise,
            generatedAt: nowIso(),
        };
    }
    async executeSettlement(batchId, input = {}, actor = null) {
        this.getBatchOrThrow(batchId);
        const strictMode = input.strictMode !== false;
        const simulation = this.simulateSettlementExecution(batchId, input, actor);
        if (simulation.resumo.total === 0) {
            throw new AppError("Nao ha titulos confirmados para executar baixa.", 400);
        }
        if (strictMode && simulation.resumo.bloqueados > 0) {
            throw new AppError("Simulacao encontrou bloqueios. Corrija antes de executar em modo estrito.", 409);
        }
        const safeActor = createActor(actor);
        const execucoes = [];
        for (const row of simulation.registros) {
            if (!row.apto_execucao)
                continue;
            this.repository.markSettlementExecution(batchId, row.id, {
                baixa_execucao_status: "EM_EXECUCAO",
                baixa_execucao_at: nowIso(),
                baixa_execucao_msg: "Baixa em processamento no WinThor.",
            });
            try {
                const txid = sanitizeIdentifier(`CST-${batchId}-${row.id}-${Date.now()}`);
                const e2e = sanitizeIdentifier(`E2E-${batchId}-${row.id}-${Date.now()}`);
                const result = await this.winthorRepository.settleTitlePayment({
                    codcli: row.codcli,
                    duplicata: row.duplicata,
                    prestacao: row.prestacao,
                    valorPago: row.valor_rede,
                    dtpag: new Date().toISOString().slice(0, 10),
                    txid,
                    endToEndId: e2e,
                });
                this.repository.markSettlementExecution(batchId, row.id, {
                    baixa_execucao_status: "EXECUTADO_SUCESSO",
                    baixa_execucao_at: nowIso(),
                    baixa_execucao_msg: `NumLanc ${result.numLanc} aplicado com sucesso.`,
                    baixa_execucao_txid: txid,
                    baixa_execucao_endtoendid: e2e,
                });
                execucoes.push({
                    id: row.id,
                    status: "SUCESSO",
                    numLanc: result.numLanc,
                    valorBaixa: result.valorBaixa,
                    msg: "Baixa executada com sucesso.",
                });
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.repository.markSettlementExecution(batchId, row.id, {
                    baixa_execucao_status: "ERRO_EXECUCAO",
                    baixa_execucao_at: nowIso(),
                    baixa_execucao_msg: message,
                });
                execucoes.push({
                    id: row.id,
                    status: "ERRO",
                    msg: message,
                });
                if (strictMode) {
                    break;
                }
            }
        }
        const resumoExecucao = {
            totalSolicitados: simulation.resumo.total,
            totalAptos: simulation.resumo.aptos,
            totalSucesso: execucoes.filter((row) => row.status === "SUCESSO").length,
            totalErro: execucoes.filter((row) => row.status === "ERRO").length,
            strictMode,
        };
        this.repository.appendActionLog({
            batchId,
            eventType: "BAIXA_EXECUCAO",
            actorId: safeActor.userId,
            actorName: safeActor.userName,
            actorProfile: safeActor.perfil,
            payload: resumoExecucao,
        });
        return {
            batchId,
            resumo: resumoExecucao,
            registros: execucoes,
            generatedAt: nowIso(),
        };
    }
    markItemManual(batchId, itemId, reason) {
        this.getBatchOrThrow(batchId);
        const updated = this.repository.markItemManual(batchId, itemId, reason);
        if (!updated)
            throw new AppError("Item de conciliado cartao nao encontrado.", 404);
        return updated;
    }
    exportBatch(batchId, format, scope = "all") {
        const batch = this.getBatchOrThrow(batchId);
        const safeFormat = String(format ?? "xlsx").toLowerCase() === "csv" ? "csv" : "xlsx";
        const allowedScopes = new Set(["all", "divergencias", "rede-nao-encontradas", "winthor-nao-encontradas", "valor", "data", "filial"]);
        const safeScope = allowedScopes.has(scope) ? scope : "all";
        const allItems = this.repository.getItemsByBatchId(batchId);
        const unmatched = this.repository.getWinthorUnmatchedByBatchId(batchId);
        const items = allItems.filter((item) => {
            if (safeScope === "all")
                return true;
            if (safeScope === "divergencias")
                return item.validation_status !== STATUS.RECEBIMENTO_CONCILIADO;
            if (safeScope === "rede-nao-encontradas")
                return item.validation_status === STATUS.RECEBIMENTO_REDE_NAO_ENCONTRADO_WINTHOR;
            if (safeScope === "valor")
                return item.value_status === "VALOR_RECEBIDO_DIVERGENTE";
            if (safeScope === "data")
                return item.date_status === "DATA_PAGAMENTO_DIVERGENTE";
            if (safeScope === "filial")
                return item.filial_status === "FILIAL_NAO_ENCONTRADA" ||
                    item.validation_status === STATUS.FILIAL_DIVERGENTE ||
                    item.validation_status === STATUS.VINCULO_DUPLICADO ||
                    item.validation_status === STATUS.PENDENTE_VINCULO_FILIAL;
            return true;
        });
        const baseRows = items.map((item) => ({
            linha_planilha: item.row_number,
            cnpj_estabelecimento_rede: item.branch_cnpj_raw,
            codigo_filial_winthor: item.winthor_codfilial ?? item.pcfilial_codigo,
            codigo_filial_rede: item.filial_rede_codigo ?? item.filial_codigo ?? item.pcfilial_codigo,
            filial_id: item.filial_id,
            filial_codigo: item.filial_codigo,
            codigo_estabelecimento_rede: item.codigo_estabelecimento_rede,
            nome_estabelecimento_rede: item.nome_estabelecimento_rede,
            nome_maquininha: item.nome_maquininha,
            numero_maquininha: item.numero_maquininha,
            regional: item.regional,
            cnpj_filial: item.cnpj_filial,
            origem_resolucao_filial: item.origem_resolucao_filial,
            venda_id: item.venda_id,
            pendencia_motivo: item.pendencia_motivo,
            data_recebimento_rede: item.rede_payment_date,
            data_venda_rede: item.rede_sale_date,
            data_pagamento_winthor: item.winthor_dt_pag,
            status_data: item.date_status,
            valor_bruto_rede: item.rede_gross_amount,
            valor_liquido_rede: item.rede_received_amount,
            valor_rede_comparado: item.rede_gross_amount ?? item.rede_received_amount,
            valor_original_winthor: item.winthor_valor_original,
            valor_pago_winthor: item.winthor_valor_pago,
            valor_winthor_comparado: item.rede_gross_amount != null ? item.winthor_valor_original : item.winthor_valor_pago,
            diferenca_valor: item.value_difference,
            status_valor: item.value_status,
            nsu_rede: item.rede_nsu,
            nsu_sistema: item.winthor_nsu,
            documento_rede: item.rede_document,
            duplicata_winthor: item.winthor_duplic,
            prestacao_winthor: item.winthor_prest,
            pedido_winthor: item.winthor_numped,
            nota_winthor: item.winthor_numnota,
            banco_winthor: item.winthor_codbanco,
            cobranca_winthor: item.winthor_codcob,
            status_titulo_winthor: item.winthor_status_titulo,
            valor_aberto_winthor: item.winthor_valor_aberto,
            parcelas_venda_winthor: item.winthor_parcelas_venda,
            total_venda_winthor: item.winthor_total_venda,
            total_pago_venda_winthor: item.winthor_total_pago_venda,
            total_aberto_venda_winthor: item.winthor_total_aberto_venda,
            titulos_abertos_venda_winthor: item.winthor_titulos_abertos_venda,
            status_banco: item.bank_status,
            match_score: item.match_score,
            status_geral: item.validation_status,
            motivo: item.reason,
        }));
        const unmatchedRows = unmatched.map((item) => ({
            codigo_filial: item.codfilial,
            cliente: item.cliente,
            documento_cliente: item.documento_cliente,
            duplicata: item.duplic,
            prestacao: item.prest,
            pedido: item.numped,
            nota: item.numnota,
            data_pagamento: item.dtpag,
            valor_pago: item.valor_pago,
            banco: item.codbanco,
            cobranca: item.cobranca,
            status: item.status,
            motivo: item.reason,
        }));
        const exportRows = safeScope === "winthor-nao-encontradas" ? unmatchedRows : baseRows;
        const fileName = `conciliado-cartao-${batch.id}-${safeScope}.${safeFormat}`;
        if (safeFormat === "csv") {
            const headers = Object.keys(exportRows[0] ?? {});
            const csvLines = [headers.join(";")];
            for (const row of exportRows) {
                csvLines.push(headers.map((key) => asCsvCell(row[key])).join(";"));
            }
            return {
                format: "csv",
                fileName,
                downloadUrl: `data:text/csv;charset=utf-8,${encodeURIComponent(csvLines.join("\n"))}`,
                totalRows: exportRows.length,
            };
        }
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(exportRows), "Recebimentos");
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(unmatchedRows), "WinThorSemRede");
        const base64 = XLSX.write(workbook, { bookType: "xlsx", type: "base64" });
        return {
            format: "xlsx",
            fileName,
            downloadUrl: `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`,
            totalRows: exportRows.length,
        };
    }
}
