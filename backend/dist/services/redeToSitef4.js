import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const { readFile, utils } = XLSX;
import path from "node:path";

// Excel serial date → "YYYYMMDD"
function excelDateToYMD(v) {
    if (!v || v === "-" || isNaN(Number(v))) return "";
    const d = new Date((Number(v) - 25569) * 86400000);
    return [
        d.getUTCFullYear(),
        String(d.getUTCMonth() + 1).padStart(2, "0"),
        String(d.getUTCDate()).padStart(2, "0"),
    ].join("");
}

// Monetary value → integer centavos string
function toCents(v) {
    if (!v || v === "-") return "0";
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
    if (isNaN(n)) return "0";
    return String(Math.round(Math.abs(n) * 100));
}

// MDR rate → SiTef format: 0.03 → "300" (3.00%)
function toRate(v) {
    if (!v || v === "-") return "0";
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", ".").replace("%", ""));
    if (isNaN(n)) return "0";
    return String(Math.round(Math.abs(n) * 10000));
}

// Crédito/Débito → C/S/D
function produtoType(modalidade, qtdParcelas) {
    const m = String(modalidade || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (m.includes("debito")) return "D";
    if (m.includes("voucher")) return "V";
    const qtd = parseInt(String(qtdParcelas || "1"), 10);
    return qtd <= 1 ? "S" : "C";
}

// Bandeira name → 4-char SiTef code
const BRAND = {
    visa: "0022", mastercard: "0001", master: "0001",
    elo: "0041", amex: "0003", "american express": "0003",
    hipercard: "0062", hiper: "0062", diners: "0004", "diners club": "0004",
    aura: "0058", cabal: "0069", jcb: "0005", discover: "0006",
    sorocred: "0084", banescard: "0071", sicredi: "0073",
};
function brandCode(bandeira) {
    if (!bandeira || bandeira === "-") return "0000";
    const k = String(bandeira).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return BRAND[k] || "0000";
}

// Parse an xlsx sheet → array of row objects, auto-detecting header row
function parseSheet(ws) {
    if (!ws || !ws["!ref"]) return [];
    const range = utils.decode_range(ws["!ref"]);
    // Find row with most filled cells (header)
    let headerRow = range.s.r, maxFill = 0;
    for (let r = range.s.r; r <= Math.min(range.s.r + 10, range.e.r); r++) {
        let n = 0;
        for (let c = range.s.c; c <= range.e.c; c++)
            if (ws[utils.encode_cell({ r, c })]) n++;
        if (n > maxFill) { maxFill = n; headerRow = r; }
    }
    const headers = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[utils.encode_cell({ r: headerRow, c })];
        headers.push(cell ? String(cell.v).trim().toLowerCase() : "");
    }
    const rows = [];
    for (let r = headerRow + 1; r <= range.e.r; r++) {
        const row = {};
        let filled = false;
        for (let c = range.s.c; c <= range.e.c; c++) {
            const cell = ws[utils.encode_cell({ r, c })];
            if (cell !== undefined && headers[c - range.s.c]) {
                row[headers[c - range.s.c]] = cell.v;
                filled = true;
            }
        }
        if (filled) rows.push(row);
    }
    return rows;
}

export function converterRedeParaSitef4(xlsxPath) {
    const wb = readFile(xlsxPath);

    const pagamentos = parseSheet(wb.Sheets["pagamentos"]);
    const ajustes    = parseSheet(wb.Sheets["ajustes"]);

    const now   = new Date();
    const today = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
    ].join("");
    const nowTime = [
        String(now.getHours()).padStart(2, "0"),
        String(now.getMinutes()).padStart(2, "0"),
        String(now.getSeconds()).padStart(2, "0"),
    ].join("");

    // Determine period from data
    const datasReceb = pagamentos
        .map(r => r["data do recebimento"])
        .filter(v => v && !isNaN(Number(v)))
        .map(Number).sort((a, b) => a - b);
    const periodStart = datasReceb.length ? excelDateToYMD(datasReceb[0]) : today;
    const periodEnd   = datasReceb.length ? excelDateToYMD(datasReceb[datasReceb.length - 1]) : today;

    const records = [];
    let seq = 1;

    // ── Tipo 0: Header ──────────────────────────────────────────────────────
    records.push({
        tipo: "0",
        campos: [
            "0",
            today,
            nowTime,
            periodStart,
            periodEnd,
            "V4.1",
            "003",               // Rede network code
            today + nowTime,     // file ID
            String(seq).padStart(6, "0"),
        ],
    });
    seq++;

    // ── Tipo 10: Credit Details ─────────────────────────────────────────────
    for (const r of pagamentos) {
        const estab       = String(r["estabelecimento"] || "");
        const dataVenda   = excelDateToYMD(r["data original da venda"]);
        const dataCredito = excelDateToYMD(r["data do recebimento"]);
        const dataCredOri = excelDateToYMD(r["data original de vencimento"]);
        const nsu         = String(r["nsu/cv"] || "");
        const cartao      = String(r["número do cartão"] || "").replace(/[^0-9*]/g, "");
        const resumo      = String(r["resumo de vendas/número do lote"] || "");
        const autorizacao = String(r["número da autorização"] || "");
        const parcelas    = String(r["número de parcelas"] || "1").padStart(2, "0");
        const parcelaNum  = String(r["parcela"] || "1").padStart(2, "0");
        const produto     = produtoType(r["modalidade"], r["número de parcelas"]);
        const banco       = String(r["banco"] || "");
        const agencia     = String(r["agência"] || "");
        const conta       = String(r["conta-corrente"] || "");
        const vBruto      = toCents(r["valor bruto da parcela original"]);
        const vLiquido    = toCents(r["valor líquido da parcela"]);
        const comissao    = toCents(r["valor mdr descontado"]);
        const taxa        = toRate(r["taxa mdr"]);
        const bandeira    = brandCode(r["bandeira"]);
        const status      = String(r["status"] || "").toLowerCase();
        const lancamento  = status.includes("antecipa") ? "0" : "1";

        records.push({
            tipo: "10",
            campos: [
                "10",         // C01 tipo
                estab,        // C02 código cliente
                estab,        // C03 estabelecimento
                dataVenda,    // C04 data venda
                resumo,       // C05 resumo/lote
                nsu,          // C06 comprovante
                nsu,          // C07 NSU host
                cartao,       // C08 nº cartão
                vBruto,       // C09 valor bruto (centavos)
                parcelas,     // C10 qtd parcelas
                vLiquido,     // C11 valor líquido parcela
                vLiquido,     // C12 valor líquido original
                dataCredito,  // C13 data crédito
                dataCredOri,  // C14 data crédito original
                parcelaNum,   // C15 nº parcela
                produto,      // C16 tipo produto C/S/D
                "1",          // C17 tipo captura (1=não-TEF)
                "003",        // C18 rede (Rede=003)
                banco,        // C19 banco
                agencia,      // C20 agência
                conta,        // C21 conta corrente
                comissao,     // C22 valor comissão (centavos)
                taxa,         // C23 taxa serviço (ex: 300=3.00%)
                "",           // C24 cód loja SiTef
                autorizacao,  // C25 cód autorização
                "",           // C26 cupom fiscal
                bandeira,     // C27 cód bandeira (4 chars)
                dataVenda,    // C28 data venda SiTef
                "",           // C29 hora venda SiTef
                "",           // C30 nº PDV
                "",           // C31 nº único resumo
                "0",          // C32 indicador recuperação
                "",           // C33 hora autorizadora
                "1",          // C34 método captura
                lancamento,   // C35 tipo lançamento (0=antecip/1=normal)
                today,        // C36 data fiscal
                nsu,          // C37 NSU host SiTef
                "",           // C38 subtipo transação
                String(seq).padStart(6, "0"), // C39 seq
            ],
        });
        seq++;
    }

    // ── Tipo 2: Adjustments ─────────────────────────────────────────────────
    for (const r of ajustes) {
        const estab     = String(r["número do estabelecimento cobrado"] || r["número do estabelecimento de origem da cobrança"] || "");
        const dataAj    = excelDateToYMD(r["data do ajuste"]);
        const vBruto    = toCents(r["valor total original do ajuste"]);
        const vLiquido  = toCents(r["valor cobrado nesta data"]);
        const resumo    = String(r["resumo de vendas/número do lote ajustado"] || "");
        const motivo    = String(r["motivo"] || "");
        const banco     = String(r["banco"] || "");
        const agencia   = String(r["agência"] || "");
        const conta     = String(r["conta-corrente"] || "");

        records.push({
            tipo: "2",
            campos: [
                "2",        // A01
                estab,      // A02 estabelecimento
                dataAj,     // A03 data ajuste
                vBruto,     // A04 valor bruto
                vLiquido,   // A05 valor líquido
                resumo,     // A06 resumo/lote
                "",         // A07 nº cartão
                "",         // A08 comprovante
                "",         // A09 data venda
                "",         // A10 código motivo
                motivo,     // A11 descrição motivo
                "",         // A12 nº referência
                "",         // A13 nº resumo original
                "",         // A14 mês referência (AAMMDD)
                "003",      // A15 rede
                banco,      // A16 banco
                agencia,    // A17 agência
                conta,      // A18 conta
                "0",        // A19 valor comissão
                "0",        // A20 valor taxa
                "",         // A21 cód loja SiTef
                "",         // A22 nº único resumo
                String(seq).padStart(6, "0"), // A23
            ],
        });
        seq++;
    }

    // ── Tipo 9: Trailer ──────────────────────────────────────────────────────
    records.push({
        tipo: "9",
        campos: ["9", String(seq).padStart(6, "0")],
    });

    // ── Gerar Excel ──────────────────────────────────────────────────────────
    const outWb = utils.book_new();

    // Sheet 1 — Pagamentos (Tipo 10) com colunas legíveis
    const hdrs10 = [
        "C01-Tipo", "C02-Cód.Cliente", "C03-Estabelecimento", "C04-Dt.Venda(AAAAMMDD)",
        "C05-Resumo/Lote", "C06-Comprovante", "C07-NSU Host", "C08-Nº Cartão",
        "C09-Vl.Bruto(cent)", "C10-Qtd.Parcelas", "C11-Vl.Líq.Parcela(cent)",
        "C12-Vl.Líq.Original(cent)", "C13-Dt.Crédito(AAAAMMDD)", "C14-Dt.Créd.Original(AAAAMMDD)",
        "C15-Nº Parcela", "C16-Tipo Produto(C/S/D)", "C17-Tp.Captura", "C18-Rede",
        "C19-Banco", "C20-Agência", "C21-Conta Corrente",
        "C22-Vl.Comissão(cent)", "C23-Taxa Serviço(ex:300=3%)", "C24-Cód.Loja SiTef",
        "C25-Cód.Autorização", "C26-Cupom Fiscal", "C27-Cód.Bandeira(4ch)",
        "C28-Dt.Venda SiTef", "C29-Hora Venda", "C30-Nº PDV",
        "C31-Nº Único Resumo", "C32-Ind.Recuperação", "C33-Hora Autorizadora",
        "C34-Método Captura", "C35-Tp.Lançamento(0=antec/1=norm)", "C36-Dt.Fiscal",
        "C37-NSU SiTef", "C38-Subtipo", "C39-Seq",
    ];
    const rows10 = [hdrs10, ...records.filter(r => r.tipo === "10").map(r => r.campos)];
    utils.book_append_sheet(outWb, utils.aoa_to_sheet(rows10), "Pagamentos (Tipo 10)");

    // Sheet 2 — Ajustes (Tipo 2)
    const hdrs2 = [
        "A01-Tipo", "A02-Estabelecimento", "A03-Dt.Ajuste(AAAAMMDD)",
        "A04-Vl.Bruto(cent)", "A05-Vl.Líq.(cent)", "A06-Resumo/Lote",
        "A07-Nº Cartão", "A08-Comprovante", "A09-Dt.Venda",
        "A10-Cód.Motivo", "A11-Desc.Motivo", "A12-Nº Referência",
        "A13-Nº Resumo Orig.", "A14-Mês Ref.", "A15-Rede",
        "A16-Banco", "A17-Agência", "A18-Conta",
        "A19-Vl.Comissão", "A20-Vl.Taxa", "A21-Cód.Loja SiTef",
        "A22-Nº Único Resumo", "A23-Seq",
    ];
    const rows2 = [hdrs2, ...records.filter(r => r.tipo === "2").map(r => r.campos)];
    utils.book_append_sheet(outWb, utils.aoa_to_sheet(rows2), "Ajustes (Tipo 2)");

    // Sheet 3 — Resumo
    const totalPag  = records.filter(r => r.tipo === "10").length;
    const totalAj   = records.filter(r => r.tipo === "2").length;
    const resumoSheet = utils.aoa_to_sheet([
        ["Resumo da Conversão"],
        [],
        ["Arquivo origem", path.basename(xlsxPath)],
        ["Período", `${periodStart.slice(6, 8)}/${periodStart.slice(4, 6)}/${periodStart.slice(0, 4)} a ${periodEnd.slice(6, 8)}/${periodEnd.slice(4, 6)}/${periodEnd.slice(0, 4)}`],
        ["Gerado em", `${today.slice(6, 8)}/${today.slice(4, 6)}/${today.slice(0, 4)} ${nowTime.slice(0, 2)}:${nowTime.slice(2, 4)}`],
        [],
        ["Tipo 10 - Pagamentos (créditos)", totalPag],
        ["Tipo  2 - Ajustes", totalAj],
        ["Total de registros (incl. header/trailer)", records.length],
        [],
        ["Rede (código SiTef)", "003"],
        ["Versão Layout", "V4.1"],
        [],
        ["NOTAS:"],
        ["- Bandeiras sem código mapeado recebem '0000' — ajuste em BRAND no serviço se necessário"],
        ["- C17 Tipo Captura fixo '1' (não-TEF) — ajuste se houver TEF"],
        ["- Valores em centavos (sem vírgula decimal)"],
    ]);
    utils.book_append_sheet(outWb, resumoSheet, "Resumo");

    // Move Resumo para primeira posição
    const sheetOrder = ["Resumo", "Pagamentos (Tipo 10)", "Ajustes (Tipo 2)"];
    outWb.SheetNames = sheetOrder;

    return { wb: outWb, periodStart, periodEnd };
}
