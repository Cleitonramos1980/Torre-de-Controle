import test from "node:test";
import assert from "node:assert/strict";
import XLSX from "xlsx";
import { CardReceivableSettlementParserService } from "../card-receivable-settlement-parser.service.js";
import { normalizeEstablishmentCode, normalizeHeader } from "../card-receivable-settlement-normalization.js";
test("normaliza cabecalho removendo acento, caixa e simbolos", () => {
    assert.equal(normalizeHeader("N\u00famero   do  Cart\u00e3o"), "NUMERO DO CARTAO");
    assert.equal(normalizeHeader("  Data/original da Venda "), "DATA ORIGINAL DA VENDA");
});
test("normaliza codigo de estabelecimento como string de digitos", () => {
    assert.equal(normalizeEstablishmentCode(" 00.123.456 "), "00123456");
    assert.equal(normalizeEstablishmentCode(87721546), "87721546");
    assert.equal(normalizeEstablishmentCode("-"), "");
});
test("le a aba pagamentos por cabecalho e preserva estabelecimento", () => {
    const workbook = XLSX.utils.book_new();
    const rows = [
        ["Observacao livre"],
        ["Outra linha"],
        [
            "Bandeira",
            "Valor liquido da parcela",
            "Data do recebimento",
            "NSU/CV",
            "Nome do estabelecimento",
            "Estabelecimento",
            "Data original da venda",
            "Numero da autorizacao",
            "TID",
            "Numero do cartao",
            "Resumo de vendas/numero do lote",
            "Numero de parcelas",
            "Parcela",
        ],
        [
            "VISA",
            "1.234,56",
            "05/05/2026",
            "184192984",
            "RODRIGUES MAO VIA NORTE",
            "00123456",
            "01/05/2026",
            "0643052",
            "TID-123",
            "650722******4275",
            "LOTE-XYZ",
            "3",
            "1",
        ],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, "pagamentos");
    const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
    const parser = new CardReceivableSettlementParserService();
    const parsed = parser.parseWorkbook(buffer, "rede.xlsx");
    assert.equal(parsed.sheetName, "pagamentos");
    assert.equal(parsed.parsedRows.length, 1);
    const row = parsed.parsedRows[0];
    assert.equal(row.establishmentCode, "00123456");
    assert.equal(row.establishmentName, "RODRIGUES MAO VIA NORTE");
    assert.equal(row.redeNsu, "184192984");
    assert.equal(row.redeAuthorization, "0643052");
    assert.equal(row.redeTid, "TID-123");
    assert.equal(row.redeCardNumber, "650722******4275");
});
