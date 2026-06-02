import { createRequire } from "node:module";
const _require = createRequire(import.meta.url);
const XLSX = _require("xlsx");
const { readFile, utils } = XLSX;

function excelDateToYMD(v) {
    if (!v || v === "-" || isNaN(Number(v))) return "";
    const d = new Date((Number(v) - 25569) * 86400000);
    return [
        d.getUTCFullYear(),
        String(d.getUTCMonth() + 1).padStart(2, "0"),
        String(d.getUTCDate()).padStart(2, "0"),
    ].join("");
}

function toCents(v) {
    if (!v || v === "-") return "0";
    const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
    if (isNaN(n)) return "0";
    return String(Math.round(Math.abs(n) * 100));
}

// Código bandeira SiTef (1-dígito usado no layout 3.6)
const SITEF_BRAND = {
    visa: "8",
    mastercard: "7", master: "7",
    elo: "4",
    amex: "1", "american express": "1",
    diners: "2", "diners club": "2",
    hipercard: "3", hiper: "3",
    cabal: "5", sorocred: "5",
    aura: "6",
};
function brandCodeSitef(bandeira) {
    if (!bandeira || bandeira === "-") return "";
    const k = String(bandeira).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return SITEF_BRAND[k] || "";
}

// Código BACEN do banco
const BANCO_CODE = {
    "itau unibanco": "341",
    "bradesco": "237",
    "banco do brasil": "1",
    "caixa economica federal": "104",
    "santander": "033",
    "nubank": "260",
    "inter": "077",
    "original": "212",
    "sicoob": "756",
    "sicredi": "748",
};
function bancoCode(nome) {
    if (!nome || nome === "-") return "";
    if (/^\d+$/.test(String(nome).trim())) return String(nome).trim();
    const k = String(nome).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    for (const [key, code] of Object.entries(BANCO_CODE)) {
        if (k.includes(key)) return code;
    }
    return "";
}

// Tipo produto SiTef: 1=Débito, 2=Crédito à vista, 3=Crédito parcelado
function tipoProduto(modalidade, qtdParcelas) {
    const m = String(modalidade || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (m.includes("debito")) return "1";
    const qtd = parseInt(String(qtdParcelas || "1"), 10);
    return qtd <= 1 ? "2" : "3";
}

function parseSheet(ws) {
    if (!ws || !ws["!ref"]) return [];
    const range = utils.decode_range(ws["!ref"]);
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

const TOTAL_FIELDS = 26;

function makeRow(vals) {
    const row = Array(TOTAL_FIELDS).fill("");
    for (let i = 0; i < vals.length && i < TOTAL_FIELDS; i++) {
        if (vals[i] !== undefined && vals[i] !== null) row[i] = String(vals[i]);
    }
    return row.join(";");
}

export function converterRedeParaSitef36(xlsxPath) {
    const wb = readFile(xlsxPath);
    const pagamentos = parseSheet(wb.Sheets["pagamentos"]);

    const now = new Date();
    const today = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0"),
    ].join("");
    // Hora sem zero à esquerda no campo [2] (ref: 95144 para 09:51:44)
    const timeNoZero = String(now.getHours()) +
                       String(now.getMinutes()).padStart(2, "0") +
                       String(now.getSeconds()).padStart(2, "0");
    // Data+hora com zero no campo [7]
    const dateTimeFull = today +
                         String(now.getHours()).padStart(2, "0") +
                         String(now.getMinutes()).padStart(2, "0") +
                         String(now.getSeconds()).padStart(2, "0");

    // Filtra apenas os recebimentos da data mais recente ("data do recebimento")
    const datasReceb = pagamentos
        .map(r => r["data do recebimento"])
        .filter(v => v && !isNaN(Number(v)))
        .map(Number);
    const maxDataReceb = datasReceb.length ? Math.max(...datasReceb) : 0;
    const registros = maxDataReceb
        ? pagamentos.filter(r => r["data do recebimento"] && Number(r["data do recebimento"]) === maxDataReceb)
        : pagamentos;

    // Período baseado em "data original da venda" dos registros filtrados
    const datasVenda = registros
        .map(r => r["data original da venda"])
        .filter(v => v && !isNaN(Number(v)))
        .map(Number).sort((a, b) => a - b);
    const periodStart = datasVenda.length ? excelDateToYMD(datasVenda[0]) : today;
    const periodEnd   = datasVenda.length ? excelDateToYMD(datasVenda[datasVenda.length - 1]) : today;

    const lines = [];
    let seq = 1;

    // ── Registro 0: Cabeçalho ────────────────────────────────────────────────
    // 26 campos: [0]tipo [1]data [2]hora(sem zero) [3]periodoInicio [4]periodoFim
    // [5]versao [6]"0" [7]dataHora [8]seq [9..25]vazio
    lines.push(makeRow(["0", today, timeNoZero, periodStart, periodEnd, "V3.6", "0", dateTimeFull, String(seq)]));
    seq++;

    // ── Registros 100 + 200: Um par por linha da planilha ───────────────────
    for (const r of registros) {
        const nsu        = String(r["nsu/cv"] || "");
        const resumo     = String(r["resumo de vendas/número do lote"] || "");
        const dataVenda  = excelDateToYMD(r["data original da venda"]);
        const dataVencto = excelDateToYMD(r["data original de vencimento"]);
        const dataReceb  = excelDateToYMD(r["data do recebimento"]);
        const vBruto     = toCents(r["valor bruto da parcela original"]);
        const vBrutoAtu  = r["valor bruto da parcela atualizada"] && r["valor bruto da parcela atualizada"] !== "-"
                           ? toCents(r["valor bruto da parcela atualizada"])
                           : vBruto;
        const vLiquido   = toCents(r["valor líquido da parcela"]);
        const banco      = bancoCode(r["banco"]);
        const agencia    = String(r["agência"] || "");
        const conta      = String(r["conta-corrente"] || "");
        const cartao     = String(r["número do cartão"] || "").replace(/\*/g, "X");
        const parcelas   = String(parseInt(String(r["número de parcelas"] || "1"), 10));
        const modalidade = String(r["modalidade"] || "").toUpperCase();
        const autorizacao = String(r["número da autorização"] || "");
        const bandeira   = brandCodeSitef(r["bandeira"]);
        const produto    = tipoProduto(r["modalidade"], r["número de parcelas"]);
        const tid        = r["tid"] && r["tid"] !== "-" ? String(r["tid"]) : nsu;

        // Registro 100 — Cabeçalho de pagamento
        // [0]"100" [1]NSU [2]"" [3]Resumo [4]DataVenda [5]VlLiquidoCents
        // [6]"0" [7]"1" [8]DataVencto [9]VlBrutoAtuCents [10]VlBrutoCents
        // [11]Banco [12]Agencia [13]Conta [14]"" [15]Seq [16..25]""
        const v100 = Array(TOTAL_FIELDS).fill("");
        v100[0]  = "100";
        v100[1]  = nsu;
        v100[3]  = resumo;
        v100[4]  = dataVenda;
        v100[5]  = vLiquido;
        v100[6]  = "0";
        v100[7]  = "1";
        v100[8]  = dataVencto;
        v100[9]  = vBrutoAtu;
        v100[10] = vBruto;
        v100[11] = banco;
        v100[12] = agencia;
        v100[13] = conta;
        v100[15] = String(seq);
        lines.push(v100.join(";"));
        seq++;

        // Registro 200 — Detalhe da transação
        // [0]"200" [1]"" [2]NSU [3]DataReceb [4]Resumo [5]TID [6]TID
        // [7]Cartão [8]VlBrutoCents [9]Parcelas [10]Modalidade [11]"1"
        // [12]TipoProduto [13]"" [14]Autorização [15]"" [16]BandeiraSiTef
        // [17]DataReceb [18..20]"" [21]"0" [22..23]"" [24]"1" [25]Seq
        const v200 = Array(TOTAL_FIELDS).fill("");
        v200[0]  = "200";
        v200[2]  = nsu;
        v200[3]  = dataReceb;
        v200[4]  = resumo;
        v200[5]  = tid;
        v200[6]  = tid;
        v200[7]  = cartao;
        v200[8]  = vBruto;
        v200[9]  = parcelas;
        v200[10] = modalidade;
        v200[11] = "1";
        v200[12] = produto;
        v200[14] = autorizacao;
        v200[16] = bandeira;
        v200[17] = dataReceb;
        v200[21] = "0";
        v200[24] = "1";
        v200[25] = String(seq);
        lines.push(v200.join(";"));
        seq++;
    }

    // ── Registro 9: Trailler ─────────────────────────────────────────────────
    const trailer = Array(TOTAL_FIELDS).fill("");
    trailer[0] = "9";
    trailer[1] = String(seq);
    lines.push(trailer.join(";"));

    const csv = lines.join("\r\n");
    return { csv, periodStart, periodEnd };
}