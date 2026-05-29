import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import XLSX from "xlsx";
import { db } from "../../../repositories/dataStore.js";
import { CardReceivableFilialResolverService } from "../card-receivable-filial-resolver.service.js";
import { FilialEstabelecimentoLinkRepository } from "../filial-estabelecimento-link.repository.js";
import { FilialEstabelecimentoLinkService } from "../filial-estabelecimento-link.service.js";
function buildMaquininhaWorkbook() {
    const workbook = XLSX.utils.book_new();
    const rows = [
        ["FILIAL", "REGIONAL", "NOME", "ESTABELECIMENTO", "MAQUININHA", "N\u00ba MAQUININHA", "SITUA\u00c7\u00c3O", "QUANTIDADE DE MAQUINHAS"],
        ["11", "AM", "SHOPPING VIA NORTE", "87721546", "RODRIGUES MAO VIA", "SD155792", "ATIVA", 1],
        ["42", "PA", "MUDURUCUS", "89133579", "BELEM MUDURUCUS", "SD174677", "ATIVA", 1],
        ["2G", "PA", "AMADOR REIS", "99194457", "RODRIGUES JUCELINO", "SD100084", "ATIVA", 1],
        ["87", "PA", "BELEM PAAR EURO", "94139644", "PAAR", "SD179937", "ATIVA", 1],
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Folha1");
    return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}
function buildCnpjWorkbook() {
    const workbook = XLSX.utils.book_new();
    const rows = [
        ["titulo"],
        ["FILIAL", "CNPJ", "UF", "MUNICIPIO", "ENDERECO"],
        ["11", "12.345.678/0001-11", "AM", "MANAUS", "AV TESTE 11"],
        ["42", "12.345.678/0001-42", "PA", "BELEM", "AV TESTE 42"],
        ["2G", "12.345.678/0001-27", "PA", "BELEM", "AV TESTE 2G"],
        ["87", "12.345.678/0001-87", "PA", "BELEM", "AV TESTE 87"],
    ];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "RC - Filiais 2025_");
    return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}
function baseRow(overrides = {}) {
    return {
        establishmentCode: null,
        establishmentCodeRaw: null,
        establishmentName: null,
        redeNsu: null,
        redeAuthorization: null,
        redeDocument: null,
        redeBatchNumber: null,
        redeInstallment: null,
        redeSaleDate: "2026-05-01",
        redePaymentDate: "2026-05-05",
        redeGrossAmount: 100,
        redeReceivedAmount: 100,
        ...overrides,
    };
}
beforeEach(() => {
    db.cardSettlementFilialEstabelecimentoLinks = [];
});
test("importa planilha de maquininhas com filial alfanumerica e estabelecimento string", async () => {
    const repository = new FilialEstabelecimentoLinkRepository();
    const service = new FilialEstabelecimentoLinkService(repository);
    const result = await service.importMaquininhaAndCnpj({
        tenantId: "default",
        maquininhaFileName: "MAQUININHA FILIAIS atulizado.xlsx",
        maquininhaBuffer: buildMaquininhaWorkbook(),
        cnpjFileName: "CNPJ DAS FILIAIS ATUALIZADO.xlsx",
        cnpjBuffer: buildCnpjWorkbook(),
    });
    assert.equal(result.totalVinculosImportados, 4);
    const links = repository.list({ tenantId: "default", adquirente: "REDE", ativo: true });
    assert.equal(links.length, 4);
    const filial2G = links.find((row) => row.filial_codigo === "2G");
    assert.ok(filial2G);
    assert.equal(filial2G.codigo_estabelecimento, "99194457");
    assert.equal(filial2G.cnpj_filial, "12345678000127");
});
test("resolve filial por venda original", () => {
    const repository = new FilialEstabelecimentoLinkRepository();
    repository.upsert({
        tenant_id: "default",
        adquirente: "REDE",
        filial_codigo: "11",
        filial_id: "11",
        codigo_estabelecimento: "87721546",
        nome_maquininha: "RODRIGUES MAO VIA",
        ativo: true,
    });
    const resolver = new CardReceivableFilialResolverService(repository);
    const resolved = resolver.resolve(baseRow({
        establishmentCode: "87721546",
        establishmentName: "RODRIGUES MAO VIA NORTE",
        redeNsu: "184192984",
        redeAuthorization: "0643052",
    }), {
        tenantId: "default",
        adquirente: "REDE",
        winthorPayments: [
            {
                id: "PAY-1",
                codfilial: "11",
                nsu: "184192984",
                codautorizacao: "0643052",
                codestabelecimento: "87721546",
                valorPago: 100,
                valorOriginal: 100,
                dtemissao: "2026-05-01",
                dtpag: "2026-05-05",
            },
        ],
    });
    assert.equal(resolved.found, true);
    assert.equal(resolved.filialCodigo, "11");
    assert.equal(resolved.origemResolucaoFilial, "VENDA_ORIGINAL");
    assert.equal(resolved.vendaId, "PAY-1");
});
test("resolve filial por estabelecimento rede", () => {
    const repository = new FilialEstabelecimentoLinkRepository();
    repository.upsert({
        tenant_id: "default",
        adquirente: "REDE",
        filial_codigo: "42",
        filial_id: "42",
        codigo_estabelecimento: "89133579",
        nome_maquininha: "BELEM MUDURUCUS",
        ativo: true,
    });
    const resolver = new CardReceivableFilialResolverService(repository);
    const resolved = resolver.resolve(baseRow({
        establishmentCode: "89133579",
        establishmentName: "BELEM MUNDURUCUS",
    }), {
        tenantId: "default",
        adquirente: "REDE",
        winthorPayments: [],
    });
    assert.equal(resolved.found, true);
    assert.equal(resolved.filialCodigo, "42");
    assert.equal(resolved.origemResolucaoFilial, "ESTABELECIMENTO_REDE");
});
test("resolve fixture de ajustes para filial 87 por estabelecimento", () => {
    const repository = new FilialEstabelecimentoLinkRepository();
    repository.upsert({
        tenant_id: "default",
        adquirente: "REDE",
        filial_codigo: "87",
        filial_id: "87",
        codigo_estabelecimento: "94139644",
        nome_maquininha: "PAAR",
        ativo: true,
    });
    const resolver = new CardReceivableFilialResolverService(repository);
    const resolved = resolver.resolve(baseRow({
        establishmentCode: "94139644",
        establishmentName: "PAAR",
    }), {
        tenantId: "default",
        adquirente: "REDE",
        winthorPayments: [],
    });
    assert.equal(resolved.found, true);
    assert.equal(resolved.filialCodigo, "87");
    assert.equal(resolved.origemResolucaoFilial, "ESTABELECIMENTO_REDE");
});
test("resolve filial por nome de maquininha quando estabelecimento ausente", () => {
    const repository = new FilialEstabelecimentoLinkRepository();
    repository.upsert({
        tenant_id: "default",
        adquirente: "REDE",
        filial_codigo: "2G",
        filial_id: "2G",
        codigo_estabelecimento: "99194457",
        nome_maquininha: "RODRIGUES JUCELINO",
        ativo: true,
    });
    const resolver = new CardReceivableFilialResolverService(repository);
    const resolved = resolver.resolve(baseRow({
        establishmentCode: null,
        establishmentName: "RODRIGUES JUCELINO",
    }), {
        tenantId: "default",
        adquirente: "REDE",
        winthorPayments: [],
    });
    assert.equal(resolved.found, true);
    assert.equal(resolved.filialCodigo, "2G");
    assert.equal(resolved.origemResolucaoFilial, "MAQUININHA_FILIAL");
});
test("bloqueia quando estabelecimento nao tem vinculo", () => {
    const repository = new FilialEstabelecimentoLinkRepository();
    const resolver = new CardReceivableFilialResolverService(repository);
    const resolved = resolver.resolve(baseRow({
        establishmentCode: "87721546",
        establishmentName: "RODRIGUES MAO VIA NORTE",
    }), {
        tenantId: "default",
        adquirente: "REDE",
        winthorPayments: [],
    });
    assert.equal(resolved.found, false);
    assert.equal(resolved.filialId, null);
    assert.equal(resolved.pendencia?.motivo, "SEM_VINCULO_FILIAL");
});
test("marca codigo estabelecimento invalido quando nao ha digitos validos", () => {
    const repository = new FilialEstabelecimentoLinkRepository();
    const resolver = new CardReceivableFilialResolverService(repository);
    const resolved = resolver.resolve(baseRow({
        establishmentCodeRaw: "ABC-SEM-DIGITO",
        establishmentCode: null,
        establishmentName: "LOJA TESTE",
    }), {
        tenantId: "default",
        adquirente: "REDE",
        winthorPayments: [],
    });
    assert.equal(resolved.found, false);
    assert.equal(resolved.pendencia?.motivo, "CODIGO_ESTABELECIMENTO_INVALIDO");
});
test("bloqueia quando o mesmo estabelecimento aponta para filiais diferentes", () => {
    const repository = new FilialEstabelecimentoLinkRepository();
    repository.upsert({
        tenant_id: "default",
        adquirente: "REDE",
        filial_codigo: "11",
        filial_id: "11",
        codigo_estabelecimento: "87721546",
        ativo: true,
    });
    repository.upsert({
        tenant_id: "default",
        adquirente: "REDE",
        filial_codigo: "42",
        filial_id: "42",
        codigo_estabelecimento: "87721546",
        ativo: true,
    });
    const resolver = new CardReceivableFilialResolverService(repository);
    const resolved = resolver.resolve(baseRow({
        establishmentCode: "87721546",
    }), {
        tenantId: "default",
        adquirente: "REDE",
        winthorPayments: [],
    });
    assert.equal(resolved.found, false);
    assert.equal(resolved.pendencia?.motivo, "VINCULO_DUPLICADO");
});
test("bloqueia divergencia entre venda original e vinculo estabelecimento", () => {
    const repository = new FilialEstabelecimentoLinkRepository();
    repository.upsert({
        tenant_id: "default",
        adquirente: "REDE",
        filial_codigo: "42",
        filial_id: "42",
        codigo_estabelecimento: "87721546",
        ativo: true,
    });
    const resolver = new CardReceivableFilialResolverService(repository);
    const resolved = resolver.resolve(baseRow({
        establishmentCode: "87721546",
        redeNsu: "184192984",
        redeAuthorization: "0643052",
    }), {
        tenantId: "default",
        adquirente: "REDE",
        winthorPayments: [
            {
                id: "PAY-1",
                codfilial: "11",
                nsu: "184192984",
                codautorizacao: "0643052",
                codestabelecimento: "87721546",
                valorPago: 100,
                valorOriginal: 100,
                dtemissao: "2026-05-01",
                dtpag: "2026-05-05",
            },
        ],
    });
    assert.equal(resolved.found, false);
    assert.equal(resolved.filialId, null);
    assert.equal(resolved.pendencia?.motivo, "FILIAL_DIVERGENTE");
});
