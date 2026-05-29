import { db } from "./dataStore.js";
function normalizeText(value) {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim();
}
function normalizeDateInput(value) {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed))
        return trimmed;
    const br = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (br)
        return `${br[3]}-${br[2]}-${br[1]}`;
    throw new Error("Data invalida. Use YYYY-MM-DD ou DD/MM/YYYY.");
}
function toMoney(value) {
    if (typeof value === "number")
        return Number(value.toFixed(2));
    if (typeof value === "string") {
        const normalized = value.replace(/\./g, "").replace(",", ".");
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
    }
    return 0;
}
function isOperadoraAprovada(status) {
    const normalized = normalizeText(status);
    return normalized === "APROVADA" || normalized === "APROVADO" || normalized === "APPROVED";
}
function deriveStatus(operadoraTotal, erpTotal, diferenca) {
    const tolerance = 0.009;
    if (operadoraTotal <= tolerance && erpTotal <= tolerance)
        return "SEM_MOVIMENTO";
    if (operadoraTotal > tolerance && erpTotal <= tolerance)
        return "MOVIMENTO_SO_OPERADORA";
    if (operadoraTotal <= tolerance && erpTotal > tolerance)
        return "MOVIMENTO_SO_ERP";
    if (Math.abs(diferenca) <= tolerance)
        return "CONCILIADO";
    return diferenca > 0 ? "DIVERGENTE_OPERADORA_MAIOR" : "DIVERGENTE_ERP_MAIOR";
}
function statusLabel(status) {
    switch (status) {
        case "SEM_MOVIMENTO":
            return "Sem movimento";
        case "MOVIMENTO_SO_OPERADORA":
            return "Movimento so Operadora";
        case "MOVIMENTO_SO_ERP":
            return "Movimento so ERP";
        case "CONCILIADO":
            return "Conciliado";
        case "DIVERGENTE_OPERADORA_MAIOR":
            return "Divergente (Operadora > ERP)";
        case "DIVERGENTE_ERP_MAIOR":
            return "Divergente (ERP > Operadora)";
        default:
            return "Indefinido";
    }
}
export function getAuditoriaCartaoAnalisePorFilial(query) {
    const dataNormalizada = normalizeDateInput(query.data);
    const adquirenteFiltro = normalizeText(query.adquirente || "REDECARD");
    const operadoraRows = db.cartaoOperadoraMovimentos.filter((row) => {
        return (row.filial === query.filial &&
            row.dataVenda === dataNormalizada &&
            isOperadoraAprovada(row.status) &&
            normalizeText(row.operadora).includes(adquirenteFiltro));
    });
    const operadoraQtde = operadoraRows.length;
    const operadoraValorBruto = Number(operadoraRows.reduce((acc, row) => acc + toMoney(row.valorBruto), 0).toFixed(2));
    const erpRowsBase = db.cartaoErpLancamentos.filter((row) => {
        return (row.filial === query.filial &&
            row.dataVenda === dataNormalizada &&
            normalizeText(row.adquirente).includes(adquirenteFiltro));
    });
    const dedupeMap = new Map();
    let erpDuplicidadesDescartadas = 0;
    for (const row of erpRowsBase) {
        const key = [
            row.filial,
            row.dataVenda,
            row.numeroDocumento,
            toMoney(row.valorBruto).toFixed(2),
            row.parcela,
        ].join("|");
        if (dedupeMap.has(key)) {
            erpDuplicidadesDescartadas += 1;
            continue;
        }
        dedupeMap.set(key, row);
    }
    const erpRowsConsolidados = Array.from(dedupeMap.values());
    const erpQtdeDocumentos = erpRowsConsolidados.length;
    const erpValorBruto = Number(erpRowsConsolidados.reduce((acc, row) => acc + toMoney(row.valorBruto), 0).toFixed(2));
    const diferencaValor = Number((operadoraValorBruto - erpValorBruto).toFixed(2));
    const basePercentual = operadoraValorBruto > 0 ? operadoraValorBruto : erpValorBruto;
    const diferencaPercentual = basePercentual > 0 ? Number(((diferencaValor / basePercentual) * 100).toFixed(2)) : 0;
    const status = deriveStatus(operadoraValorBruto, erpValorBruto, diferencaValor);
    const diagnostico = [];
    if (status === "MOVIMENTO_SO_ERP") {
        diagnostico.push("Nao houve movimentos aprovados da operadora para os filtros informados.");
    }
    if (status === "MOVIMENTO_SO_OPERADORA") {
        diagnostico.push("Nao houve lancamentos de ERP para os filtros informados.");
    }
    if (erpDuplicidadesDescartadas > 0) {
        diagnostico.push(`ERP continha ${erpDuplicidadesDescartadas} linhas duplicadas descartadas na consolidacao.`);
    }
    if (status === "DIVERGENTE_OPERADORA_MAIOR") {
        diagnostico.push("Operadora maior que ERP: revisar baixas, descontos e titulos nao conciliados.");
    }
    if (status === "DIVERGENTE_ERP_MAIOR") {
        diagnostico.push("ERP maior que Operadora: revisar estornos, cancelamentos e classificacao de adquirente.");
    }
    if (diagnostico.length === 0) {
        diagnostico.push("Sem anomalias criticas detectadas para o recorte informado.");
    }
    return {
        filtro: {
            filial: query.filial,
            data: dataNormalizada,
            adquirente: query.adquirente || "REDECARD",
        },
        operadora: {
            qtdeVendas: operadoraQtde,
            valorBruto: operadoraValorBruto,
        },
        erp: {
            qtdeDocumentos: erpQtdeDocumentos,
            valorBruto: erpValorBruto,
            duplicidadesDescartadas: erpDuplicidadesDescartadas,
        },
        divergencia: {
            valor: diferencaValor,
            percentual: diferencaPercentual,
        },
        status: {
            codigo: status,
            descricao: statusLabel(status),
        },
        diagnostico,
        detalhes: query.incluirDetalhes === false
            ? undefined
            : {
                operadora: operadoraRows,
                erp: erpRowsConsolidados,
            },
    };
}
