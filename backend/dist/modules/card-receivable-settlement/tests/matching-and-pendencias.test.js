import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../../repositories/dataStore.js";
import { CardReceivableSettlementMatchingService } from "../card-receivable-settlement-matching.service.js";
import { CardReceivableSettlementRepository } from "../card-receivable-settlement.repository.js";
import { CARD_SETTLEMENT_STATUS as STATUS } from "../enums/settlement-status.js";
beforeEach(() => {
    db.cardSettlementBatches = [];
    db.cardSettlementItems = [];
    db.cardSettlementWinthorUnmatched = [];
});
test("bloqueia item sem filial e nao preenche matriz/filial padrao", async () => {
    const matching = new CardReceivableSettlementMatchingService({
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
    });
    const result = await matching.match({
        parsedRows: [
            {
                rowNumber: 2,
                branchCnpjRaw: null,
                branchCnpjNormalized: null,
                branchDocumentIsCnpj: false,
                establishmentCode: "87721546",
                establishmentCodeRaw: "87721546",
                establishmentName: "RODRIGUES MAO VIA NORTE",
                redePaymentDate: "2026-05-05",
                redeSaleDate: "2026-05-01",
                redeGrossAmount: 100,
                redeNetAmount: 100,
                redeReceivedAmount: 100,
                redeNsu: "184192984",
                redeAuthorization: "0643052",
                redeTid: "TID-1",
                redeCardNumber: "650722******4275",
                redeBatchNumber: "LOTE-1",
                redeModalidade: "CREDITO",
                redeBandeira: "VISA",
                redeInstallments: "3",
                redeInstallment: "1",
                redeDocument: "DOC-1",
                redeRawJson: {},
                sourceSheetName: "pagamentos",
            },
        ],
        winthorPayments: [],
        resolveFilial: () => ({
            found: false,
            pendencia: {
                motivo: "SEM_VINCULO_FILIAL",
                detalhe: "Codigo de estabelecimento sem vinculo ativo para a adquirente REDE.",
            },
            origemResolucaoFilial: "PENDENTE",
        }),
    });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].validation_status, STATUS.FILIAL_NAO_ENCONTRADA);
    assert.equal(result.items[0].filial_id, null);
    assert.equal(result.items[0].filial_codigo, null);
});
test("gera relatorio de pendencias com campos obrigatorios", async () => {
    process.env.JWT_SECRET_KEY = process.env.JWT_SECRET_KEY ?? "test-secret-key-with-at-least-32-chars";
    process.env.AUTH_STATIC_PASSWORD = process.env.AUTH_STATIC_PASSWORD ?? "test-password";
    const { CardReceivableSettlementService } = await import("../card-receivable-settlement.service.js");
    const repository = new CardReceivableSettlementRepository();
    const batch = repository.createBatch({
        id: "BATCH-1",
        fileName: "Rede_Rel_Recebimentos.xlsx",
        fileHash: "hash",
        uploadedBy: "tester",
        tenantId: "default",
        status: "PROCESSADO",
    });
    repository.replaceItems(batch.id, [
        {
            row_number: 4,
            source_sheet_name: "pagamentos",
            codigo_estabelecimento_rede: "87721546",
            nome_estabelecimento_rede: "RODRIGUES MAO VIA NORTE",
            nome_maquininha: null,
            rede_nsu: "184192984",
            rede_tid: "TID-123",
            rede_authorization: "0643052",
            rede_card_number: "650722******4275",
            rede_sale_date: "2026-05-01",
            rede_received_amount: 100,
            filial_id: null,
            filial_codigo: null,
            pendencia_motivo: "SEM_VINCULO_FILIAL",
            pendencia_detalhe: "Codigo de estabelecimento sem vinculo.",
            validation_status: STATUS.FILIAL_NAO_ENCONTRADA,
            reason: "Filial nao localizada.",
        },
    ]);
    const service = new CardReceivableSettlementService({
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
    }, {
        parserService: {},
        importService: {},
        repository,
        matchingService: {},
        winthorRepository: {},
        filialResolverService: {},
        filialEstabelecimentoLinkService: {
            listLinks: () => ({ rows: [] }),
        },
    });
    const pendencias = service.getPendencias(batch.id);
    assert.equal(pendencias.total, 1);
    assert.equal(pendencias.rows[0].arquivo, "Rede_Rel_Recebimentos.xlsx");
    assert.equal(pendencias.rows[0].aba, "pagamentos");
    assert.equal(pendencias.rows[0].linha, 4);
    assert.equal(pendencias.rows[0].codigo_estabelecimento, "87721546");
    assert.equal(pendencias.rows[0].motivo_pendencia, "SEM_VINCULO_FILIAL");
});
