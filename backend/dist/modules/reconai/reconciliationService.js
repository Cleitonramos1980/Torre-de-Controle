const MONEY_EPSILON = 0.01;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const TAX_DIVERGENCE_THRESHOLD = 0.005; // 0.5%
function normalizeToken(value) {
    if (!value)
        return null;
    const normalized = value.trim().toUpperCase();
    return normalized.length ? normalized : null;
}
function toNumber(value) {
    if (value == null)
        return null;
    const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
}
function toDate(value) {
    if (!value)
        return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function toIsoDate(value) {
    const parsed = toDate(value);
    if (!parsed)
        return null;
    return parsed.toISOString().slice(0, 10);
}
function toDateDiffInDays(from, to) {
    const start = toDate(from);
    const end = toDate(to);
    if (!start || !end)
        return null;
    const startUtc = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
    const endUtc = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
    return Math.floor(Math.abs(endUtc - startUtc) / ONE_DAY_MS);
}
function round2(value) {
    return Number(value.toFixed(2));
}
function isMoneyZero(value) {
    return Math.abs(value) <= MONEY_EPSILON;
}
function percentDiff(reference, compared) {
    const denominator = Math.abs(reference) > MONEY_EPSILON ? Math.abs(reference) : 1;
    return Math.abs(reference - compared) / denominator;
}
function pushIndex(map, key, value) {
    if (!key)
        return;
    const list = map.get(key);
    if (list) {
        list.push(value);
        return;
    }
    map.set(key, [value]);
}
function saleAmountDateKey(venda) {
    const date = toIsoDate(venda.data);
    if (!date || !Number.isFinite(venda.valor))
        return null;
    return `${round2(venda.valor)}|${date}`;
}
function paymentAmountDateKey(payment) {
    const amount = toNumber(payment.valorBruto) ?? toNumber(payment.valorRecebido);
    const date = toIsoDate(payment.dataPagamento);
    if (amount == null || !date)
        return null;
    return `${round2(amount)}|${date}`;
}
function winthorAmountDateKey(winthor) {
    const amount = toNumber(winthor.valorOriginal) ?? toNumber(winthor.valorPago);
    const date = toIsoDate(winthor.dtemissao ?? winthor.dtpag);
    if (amount == null || !date)
        return null;
    return `${round2(amount)}|${date}`;
}
function uniqueWinthorId(row, index) {
    return [
        row.numnota ?? "",
        row.numped ?? "",
        row.duplic ?? "",
        row.prest ?? "",
        row.codcli ?? "",
        index,
    ].join("|");
}
function getRiskLevel(score) {
    if (score <= 30)
        return "BAIXO";
    if (score <= 60)
        return "MEDIO";
    if (score <= 80)
        return "ALTO";
    return "CRITICO";
}
function extractFilial(venda) {
    if (venda.filial)
        return venda.filial;
    const rawFilial = (venda.raw.filial ?? venda.raw.branch ?? venda.raw.branchCode ?? venda.raw.estabelecimento);
    if (rawFilial == null)
        return null;
    const parsed = String(rawFilial).trim();
    return parsed.length ? parsed : null;
}
function convertSale(venda) {
    return {
        nsu: venda.nsu,
        autorizacao: venda.authorization,
        valor: toNumber(venda.valorVenda) ?? 0,
        data: venda.dataVenda,
        parcela: toNumber(venda.parcela),
        filial: extractFilial(venda),
        numped: venda.numped,
        numnota: venda.numnota,
    };
}
function convertRede(rede) {
    if (!rede)
        return null;
    return {
        nsu: rede.nsu,
        autorizacao: rede.authorization,
        valor_bruto: toNumber(rede.valorBruto),
        valor_liquido: toNumber(rede.valorRecebido),
        taxa: toNumber(rede.taxaEsperada) ?? toNumber(rede.taxaMdr),
        data_pagamento: rede.dataPagamento,
        parcela: toNumber(rede.parcela),
    };
}
function convertWinthor(winthor) {
    if (!winthor)
        return null;
    return {
        valor_original: toNumber(winthor.valorOriginal),
        valor_pago: toNumber(winthor.valorPago),
        valor_aberto: toNumber(winthor.valorAberto),
        data_pagamento: winthor.dtpag,
        status_titulo: winthor.statusTitulo,
        parcela: toNumber(winthor.prest),
        numped: winthor.numped,
        numnota: winthor.numnota,
    };
}
export function calculateMatchScore(venda, rede, winthor) {
    const saleNsu = normalizeToken(venda.nsu);
    const redeNsu = normalizeToken(rede?.nsu);
    const nsuMatch = Boolean(saleNsu && redeNsu && saleNsu === redeNsu);
    const saleAuth = normalizeToken(venda.autorizacao);
    const redeAuth = normalizeToken(rede?.autorizacao);
    const authMatch = Boolean(saleAuth && redeAuth && saleAuth === redeAuth);
    const candidateValues = [rede?.valor_bruto, winthor?.valor_original]
        .map((value) => toNumber(value))
        .filter((value) => value != null);
    const valueMatch = candidateValues.some((candidate) => percentDiff(venda.valor, candidate) < 0.01);
    const dateCandidates = [rede?.data_pagamento, winthor?.data_pagamento];
    const dateMatch = dateCandidates.some((candidate) => {
        const diff = toDateDiffInDays(venda.data, candidate ?? null);
        return diff != null && diff <= 2;
    });
    const parcelaCandidates = [rede?.parcela, winthor?.parcela]
        .map((value) => toNumber(value))
        .filter((value) => value != null);
    const parcelaMatch = venda.parcela != null &&
        parcelaCandidates.some((candidate) => candidate === venda.parcela);
    let score = 0;
    if (nsuMatch)
        score += 40;
    if (authMatch)
        score += 25;
    if (valueMatch)
        score += 15;
    if (dateMatch)
        score += 10;
    if (parcelaMatch)
        score += 10;
    return {
        score: Math.max(0, Math.min(100, score)),
        details: {
            nsu: nsuMatch,
            autorizacao: authMatch,
            valor: valueMatch,
            data: dateMatch,
            parcela: parcelaMatch,
        },
    };
}
function calculateRealFeeRate(rede) {
    if (!rede)
        return null;
    if (rede.valor_bruto == null || rede.valor_liquido == null || rede.valor_bruto <= MONEY_EPSILON)
        return null;
    return (rede.valor_bruto - rede.valor_liquido) / rede.valor_bruto;
}
function hasTaxDivergence(rede, taxaReal) {
    if (!rede || taxaReal == null || rede.taxa == null)
        return false;
    return Math.abs(taxaReal - rede.taxa) > TAX_DIVERGENCE_THRESHOLD;
}
function calculateDaysOpen(venda, rede, winthor) {
    const referenceDate = winthor?.data_pagamento ?? rede?.data_pagamento ?? new Date().toISOString();
    const days = toDateDiffInDays(venda.data, referenceDate);
    return days ?? 0;
}
function determineStatus(input) {
    const redeExists = input.rede != null;
    const winthorPago = (toNumber(input.winthor?.valor_pago) ?? 0) > MONEY_EPSILON;
    const redePagou = (toNumber(input.rede?.valor_liquido) ?? 0) > MONEY_EPSILON;
    const statusTitulo = normalizeToken(input.winthor?.status_titulo);
    if (!redeExists) {
        if (winthorPago)
            return "BAIXA_INCORRETA";
        return "NAO_RECEBIDO";
    }
    if (winthorPago && !redePagou) {
        return "BAIXA_INCORRETA";
    }
    if (redeExists && !winthorPago) {
        if (statusTitulo === "EM_ABERTO" && redePagou)
            return "RECEBIDO_NAO_BAIXADO";
        return "NAO_BAIXADO";
    }
    if (statusTitulo === "EM_ABERTO" && redePagou) {
        return "RECEBIDO_NAO_BAIXADO";
    }
    if (input.taxaDivergente) {
        return "DIVERGENTE_TAXA";
    }
    if (!isMoneyZero(input.diferencaValor)) {
        return "DIVERGENTE_VALOR";
    }
    if (input.matchScore >= 90 && isMoneyZero(input.diferencaTotal)) {
        return "CONCILIADO";
    }
    return "DIVERGENTE_VALOR";
}
export function calculateRiskScore(input) {
    let score = 0;
    if (input.valor > 10_000)
        score += 40;
    else if (input.valor > 5_000)
        score += 25;
    else if (input.valor > 1_000)
        score += 10;
    if (input.diasEmAberto > 30)
        score += 30;
    else if (input.diasEmAberto > 15)
        score += 20;
    else if (input.diasEmAberto > 7)
        score += 10;
    if (input.recorrenciaFilialErros > 5)
        score += 30;
    switch (input.status) {
        case "NAO_RECEBIDO":
            score += 40;
            break;
        case "DIVERGENTE_VALOR":
            score += 30;
            break;
        case "DIVERGENTE_TAXA":
            score += 20;
            break;
        case "BAIXA_INCORRETA":
            score += 35;
            break;
        case "RECEBIDO_NAO_BAIXADO":
            score += 30;
            break;
        case "NAO_BAIXADO":
            score += 20;
            break;
        default:
            break;
    }
    return {
        risco_score: score,
        risco_nivel: getRiskLevel(score),
    };
}
export function generateRecommendation(status) {
    switch (status) {
        case "NAO_RECEBIDO":
            return "Verificar operadora e contestar";
        case "NAO_BAIXADO":
        case "RECEBIDO_NAO_BAIXADO":
            return "Realizar baixa no WinThor";
        case "DIVERGENTE_TAXA":
            return "Revisar contrato e contestar";
        case "BAIXA_INCORRETA":
            return "Revisar lancamento financeiro";
        case "CONCILIADO":
            return "Nenhuma acao necessaria";
        default:
            return "Investigar divergencia de valores e regularizar conciliacao";
    }
}
function buildReasons(input) {
    const reasons = [];
    if (!input.match.details.nsu)
        reasons.push("NSU nao corresponde.");
    if (!input.match.details.autorizacao)
        reasons.push("Autorizacao nao corresponde.");
    if (!input.match.details.valor)
        reasons.push("Valor nao atende tolerancia de 1%.");
    if (!input.match.details.data)
        reasons.push("Data fora da janela de ±2 dias.");
    if (!input.match.details.parcela)
        reasons.push("Parcela divergente.");
    if (!isMoneyZero(input.diferencaValor))
        reasons.push(`Diferenca venda-rede: ${round2(input.diferencaValor)}.`);
    if (!isMoneyZero(input.diferencaTotal))
        reasons.push(`Diferenca total venda-winthor: ${round2(input.diferencaTotal)}.`);
    if (input.taxaDivergente)
        reasons.push("Taxa real divergente da taxa esperada acima de 0,5%.");
    if (!input.rede)
        reasons.push("Sem pagamento correspondente na REDE.");
    if (!input.winthor)
        reasons.push("Sem titulo correspondente no WinThor.");
    if (input.status === "RECEBIDO_NAO_BAIXADO")
        reasons.push("REDE indica pagamento, mas WinThor segue em aberto.");
    if (input.status === "BAIXA_INCORRETA")
        reasons.push("WinThor pago sem registro equivalente de pagamento na REDE.");
    return reasons;
}
export function reconcileTransaction(venda, rede, winthor) {
    const match = calculateMatchScore(venda, rede, winthor);
    const valorVenda = toNumber(venda.valor) ?? 0;
    const valorLiquidoRede = toNumber(rede?.valor_liquido) ?? 0;
    const valorPagoWinthor = toNumber(winthor?.valor_pago) ?? 0;
    const diferencaValor = round2(valorVenda - valorLiquidoRede);
    const diferencaWinthor = round2(valorLiquidoRede - valorPagoWinthor);
    const diferencaTotal = round2(valorVenda - valorPagoWinthor);
    const taxaReal = calculateRealFeeRate(rede);
    const taxaDivergente = hasTaxDivergence(rede, taxaReal);
    const status = determineStatus({
        venda,
        rede,
        winthor,
        matchScore: match.score,
        diferencaValor,
        diferencaTotal,
        taxaDivergente,
    });
    const diasEmAberto = calculateDaysOpen(venda, rede, winthor);
    const risk = calculateRiskScore({
        valor: valorVenda,
        diasEmAberto,
        recorrenciaFilialErros: 0,
        status,
    });
    const recomendacao = generateRecommendation(status);
    const tipoDivergencia = status === "CONCILIADO" ? null : status;
    const reasons = buildReasons({
        match,
        status,
        taxaDivergente,
        diferencaValor,
        diferencaTotal,
        rede,
        winthor,
    });
    return {
        match_score: match.score,
        matchScore: match.score,
        status,
        diferenca_valor: diferencaValor,
        diferencaValor,
        diferenca_winthor: diferencaWinthor,
        diferenca_total: diferencaTotal,
        taxa_real: taxaReal == null ? null : round2(taxaReal),
        risco_score: risk.risco_score,
        risco_nivel: risk.risco_nivel,
        recomendacao,
        tipo_divergencia: tipoDivergencia,
        dias_em_aberto: diasEmAberto,
        recorrencia_filial_erros: 0,
        reasons,
        comparison: {
            nsu: match.details.nsu,
            authorization: match.details.autorizacao,
            valor: match.details.valor,
            data: match.details.data,
            parcela: match.details.parcela,
        },
    };
}
function buildIndexes(redes, winthorRows) {
    const paymentsByNsu = new Map();
    const paymentsByAuth = new Map();
    const paymentsByAmountDate = new Map();
    const winthorByNota = new Map();
    const winthorByPedido = new Map();
    const winthorByAmountDate = new Map();
    for (const payment of redes) {
        pushIndex(paymentsByNsu, normalizeToken(payment.nsu), payment);
        pushIndex(paymentsByAuth, normalizeToken(payment.authorization), payment);
        pushIndex(paymentsByAmountDate, paymentAmountDateKey(payment), payment);
    }
    for (const row of winthorRows) {
        pushIndex(winthorByNota, normalizeToken(row.numnota), row);
        pushIndex(winthorByPedido, normalizeToken(row.numped), row);
        pushIndex(winthorByAmountDate, winthorAmountDateKey(row), row);
    }
    return {
        paymentsByNsu,
        paymentsByAuth,
        paymentsByAmountDate,
        winthorByNota,
        winthorByPedido,
        winthorByAmountDate,
    };
}
function pickUnused(candidates, used, keySelector) {
    if (!candidates || candidates.length === 0)
        return null;
    for (let index = 0; index < candidates.length; index += 1) {
        const item = candidates[index];
        const key = keySelector(item, index);
        if (used.has(key))
            continue;
        used.add(key);
        return item;
    }
    return null;
}
function paymentId(payment) {
    return payment.externalId || `${payment.nsu ?? ""}|${payment.authorization ?? ""}|${payment.dataPagamento ?? ""}`;
}
function findMatchingPayment(venda, indexes, usedPaymentIds) {
    const byNsu = pickUnused(indexes.paymentsByNsu.get(normalizeToken(venda.nsu) ?? "__none__"), usedPaymentIds, (item) => paymentId(item));
    if (byNsu)
        return byNsu;
    const byAuth = pickUnused(indexes.paymentsByAuth.get(normalizeToken(venda.autorizacao) ?? "__none__"), usedPaymentIds, (item) => paymentId(item));
    if (byAuth)
        return byAuth;
    const byAmountDate = pickUnused(indexes.paymentsByAmountDate.get(saleAmountDateKey(venda) ?? "__none__"), usedPaymentIds, (item) => paymentId(item));
    if (byAmountDate)
        return byAmountDate;
    return null;
}
function findMatchingWinthor(venda, indexes, usedWinthorIds) {
    const byNota = pickUnused(indexes.winthorByNota.get(normalizeToken(venda.numnota) ?? "__none__"), usedWinthorIds, (item, index) => uniqueWinthorId(item, index));
    if (byNota)
        return byNota;
    const byPedido = pickUnused(indexes.winthorByPedido.get(normalizeToken(venda.numped) ?? "__none__"), usedWinthorIds, (item, index) => uniqueWinthorId(item, index));
    if (byPedido)
        return byPedido;
    const byAmountDate = pickUnused(indexes.winthorByAmountDate.get(saleAmountDateKey(venda) ?? "__none__"), usedWinthorIds, (item, index) => uniqueWinthorId(item, index));
    if (byAmountDate)
        return byAmountDate;
    return null;
}
function enrichRiskByRecurrence(rows) {
    const errorCountByFilial = new Map();
    for (const row of rows) {
        if (row.status === "CONCILIADO")
            continue;
        const filial = normalizeToken(row.venda.filial) ?? "SEM_FILIAL";
        errorCountByFilial.set(filial, (errorCountByFilial.get(filial) ?? 0) + 1);
    }
    for (const row of rows) {
        const filial = normalizeToken(row.venda.filial) ?? "SEM_FILIAL";
        const recorrencia = errorCountByFilial.get(filial) ?? 0;
        row.recorrencia_filial_erros = recorrencia;
        const risk = calculateRiskScore({
            valor: toNumber(row.venda.valorVenda) ?? 0,
            diasEmAberto: row.dias_em_aberto,
            recorrenciaFilialErros: recorrencia,
            status: row.status,
        });
        row.risco_score = risk.risco_score;
        row.risco_nivel = risk.risco_nivel;
    }
}
function emptyStatusMap() {
    return {
        CONCILIADO: 0,
        DIVERGENTE_VALOR: 0,
        NAO_RECEBIDO: 0,
        NAO_BAIXADO: 0,
        DIVERGENTE_TAXA: 0,
        RECEBIDO_NAO_BAIXADO: 0,
        BAIXA_INCORRETA: 0,
    };
}
export function runFullReconciliation(vendas, redes, winthorRows) {
    const startedAt = Date.now();
    const indexes = buildIndexes(redes, winthorRows);
    const usedPaymentIds = new Set();
    const usedWinthorIds = new Set();
    const reconciliations = [];
    let errors = 0;
    const createdAt = new Date().toISOString();
    for (let index = 0; index < vendas.length; index += 1) {
        const sale = vendas[index];
        try {
            const vendaInput = convertSale(sale);
            const matchedPayment = findMatchingPayment(vendaInput, indexes, usedPaymentIds);
            const matchedWinthor = findMatchingWinthor(vendaInput, indexes, usedWinthorIds);
            const result = reconcileTransaction(vendaInput, convertRede(matchedPayment), convertWinthor(matchedWinthor));
            reconciliations.push({
                id: `REC-${Date.now()}-${String(index + 1).padStart(6, "0")}`,
                createdAt,
                workflowStatus: result.status === "CONCILIADO" ? "RESOLVIDA" : "ABERTA",
                workflowUpdatedAt: createdAt,
                lastActionAt: null,
                venda: sale,
                rede: matchedPayment,
                winthor: matchedWinthor,
                ...result,
            });
        }
        catch (error) {
            errors += 1;
            const vendaInput = convertSale(sale);
            const fallback = reconcileTransaction(vendaInput, null, null);
            reconciliations.push({
                id: `REC-${Date.now()}-${String(index + 1).padStart(6, "0")}`,
                createdAt,
                workflowStatus: fallback.status === "CONCILIADO" ? "RESOLVIDA" : "ABERTA",
                workflowUpdatedAt: createdAt,
                lastActionAt: null,
                venda: sale,
                rede: null,
                winthor: null,
                ...fallback,
                reasons: [
                    ...fallback.reasons,
                    `Erro no processamento: ${error instanceof Error ? error.message : "erro desconhecido"}.`,
                ],
            });
        }
    }
    enrichRiskByRecurrence(reconciliations);
    const byStatus = emptyStatusMap();
    for (const row of reconciliations) {
        byStatus[row.status] += 1;
    }
    const totalConciliated = byStatus.CONCILIADO;
    const totalDivergent = reconciliations.length - totalConciliated;
    return {
        reconciliations,
        summary: {
            processingMs: Date.now() - startedAt,
            totalSales: vendas.length,
            totalPayments: redes.length,
            totalReceivables: winthorRows.length,
            totalReconciliations: reconciliations.length,
            totalConciliated,
            totalDivergent,
            errors,
            byStatus,
        },
    };
}
export class ReconciliationService {
    runFullReconciliation(vendas, redes, winthorRows) {
        return runFullReconciliation(vendas, redes, winthorRows);
    }
}
export const reconciliationService = new ReconciliationService();
