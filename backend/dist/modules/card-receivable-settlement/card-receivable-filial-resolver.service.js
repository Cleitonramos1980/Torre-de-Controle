import { normalizeDigits, normalizeEstablishmentCode, normalizeName } from "./card-receivable-settlement-normalization.js";
function normalizeDoc(value) {
    const raw = String(value ?? "").trim();
    if (!raw || raw === "-")
        return "";
    return raw.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}
function toIsoDate(value) {
    if (!value)
        return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()))
        return null;
    return parsed.toISOString().slice(0, 10);
}
function toNumber(value) {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}
function valueNear(a, b, tolerance = 0.05) {
    return Math.abs(toNumber(a) - toNumber(b)) <= tolerance;
}
function dateNear(a, b, toleranceDays = 1) {
    const dateA = toIsoDate(a);
    const dateB = toIsoDate(b);
    if (!dateA || !dateB)
        return false;
    const start = new Date(`${dateA}T00:00:00.000Z`);
    const end = new Date(`${dateB}T00:00:00.000Z`);
    const diff = Math.round(Math.abs(start.getTime() - end.getTime()) / (24 * 60 * 60 * 1000));
    return diff <= toleranceDays;
}
function saleIdentifierValues(payment) {
    return [
        payment?.duplic,
        payment?.prest,
        payment?.numnota,
        payment?.numped,
        payment?.numtrans,
        payment?.numtransvenda,
    ].map((value) => normalizeDoc(value)).filter(Boolean);
}
function compareFilial(codfilialA, codfilialB) {
    return String(codfilialA ?? "").trim() === String(codfilialB ?? "").trim();
}
function scoreSaleCandidate(row, payment) {
    const redeNsu = normalizeDoc(row.redeNsu);
    const redeAuthorization = normalizeDoc(row.redeAuthorization);
    const redeDocument = normalizeDoc(row.redeDocument);
    const redeBatch = normalizeDoc(row.redeBatchNumber);
    const redeInstallment = normalizeDigits(row.redeInstallment);
    const paymentNsu = normalizeDoc(payment.nsu);
    const paymentAuthorization = normalizeDoc(payment.codautorizacao);
    const paymentIdentifiers = saleIdentifierValues(payment);
    const rowEstablishment = normalizeEstablishmentCode(row.establishmentCode);
    const paymentEstablishment = normalizeEstablishmentCode(payment.codestabelecimento);
    const rowComparableAmount = row.redeGrossAmount != null ? row.redeGrossAmount : row.redeReceivedAmount;
    const paymentComparableAmount = row.redeGrossAmount != null ? payment.valorOriginal : payment.valorPago;
    let score = 0;
    if (redeNsu && paymentNsu && redeNsu === paymentNsu)
        score += 90;
    if (redeAuthorization && paymentAuthorization && redeAuthorization === paymentAuthorization)
        score += 80;
    if (redeDocument && paymentIdentifiers.includes(redeDocument))
        score += 40;
    if (redeBatch && paymentIdentifiers.includes(redeBatch))
        score += 30;
    if (redeInstallment && normalizeDigits(payment.prest) === redeInstallment)
        score += 20;
    if (rowEstablishment && paymentEstablishment && rowEstablishment === paymentEstablishment)
        score += 35;
    if (valueNear(rowComparableAmount, paymentComparableAmount))
        score += 15;
    if (dateNear(row.redeSaleDate ?? row.redePaymentDate, payment.dtemissao ?? payment.dtpag))
        score += 15;
    return score;
}
function pickBestSale(row, payments) {
    const scored = (payments ?? [])
        .map((payment) => ({
        payment,
        score: scoreSaleCandidate(row, payment),
    }))
        .filter((candidate) => candidate.score >= 60)
        .sort((a, b) => b.score - a.score);
    if (scored.length === 0)
        return { payment: null, ambiguous: false };
    const first = scored[0];
    const topWithSameScore = scored.filter((candidate) => candidate.score === first.score);
    if (topWithSameScore.length > 1) {
        const filialSet = new Set(topWithSameScore.map((candidate) => String(candidate.payment?.codfilial ?? "").trim()).filter(Boolean));
        if (filialSet.size > 1) {
            return { payment: null, ambiguous: true };
        }
    }
    return { payment: first.payment, ambiguous: false };
}
function uniqueByFilial(rows) {
    const map = new Map();
    for (const row of rows ?? []) {
        const key = String(row.filial_codigo ?? "").trim();
        if (!key)
            continue;
        if (!map.has(key))
            map.set(key, row);
    }
    return Array.from(map.values());
}
function buildPending(base, motivo, extra = {}) {
    return {
        ...base,
        found: false,
        filialId: null,
        filialCodigo: null,
        origemResolucaoFilial: "PENDENTE",
        pendencia: {
            motivo,
            ...extra,
        },
    };
}
export class CardReceivableFilialResolverService {
    linkRepository;
    constructor(linkRepository) {
        this.linkRepository = linkRepository;
    }
    resolve(row, context) {
        const tenantId = context?.tenantId ?? "default";
        const adquirente = String(context?.adquirente ?? "REDE").toUpperCase();
        const estabelecimentoRaw = String(row.establishmentCodeRaw ?? row.establishmentCode ?? "").trim();
        const codigoEstabelecimento = normalizeEstablishmentCode(row.establishmentCode ?? row.establishmentCodeRaw);
        const nomeEstabelecimento = String(row.establishmentName ?? "").trim() || null;
        const nomeEstabelecimentoNormalized = normalizeName(nomeEstabelecimento);
        const base = {
            codigoEstabelecimentoRede: codigoEstabelecimento || null,
            nomeEstabelecimentoRede: nomeEstabelecimento,
            nomeMaquininha: null,
            numeroMaquininha: null,
            regional: null,
            cnpjFilial: null,
            vendaId: null,
            divergencia: null,
            metadata: {},
        };
        const saleLookup = pickBestSale(row, context?.winthorPayments ?? []);
        if (saleLookup.ambiguous) {
            return buildPending(base, "VENDA_NAO_LOCALIZADA", {
                detalhe: "Mais de uma venda candidata encontrada com filiais diferentes.",
            });
        }
        const sale = saleLookup.payment;
        const linksByCode = codigoEstabelecimento
            ? uniqueByFilial(this.linkRepository.findActiveByEstablishment(adquirente, codigoEstabelecimento, tenantId))
            : [];
        if (sale?.codfilial) {
            const saleFilial = String(sale.codfilial).trim();
            if (linksByCode.length > 0) {
                const linkMatchesSale = linksByCode.some((link) => compareFilial(link.filial_codigo, saleFilial));
                if (!linkMatchesSale) {
                    return buildPending({
                        ...base,
                        vendaId: sale.id,
                    }, "FILIAL_DIVERGENTE", {
                        detalhe: "Filial da venda original diverge do vinculo do estabelecimento.",
                        filialVenda: saleFilial,
                        filiaisVinculoEstabelecimento: linksByCode.map((link) => link.filial_codigo),
                    });
                }
            }
            const matchingLink = linksByCode.find((link) => compareFilial(link.filial_codigo, saleFilial)) ?? null;
            return {
                ...base,
                found: true,
                filialId: saleFilial,
                filialCodigo: saleFilial,
                vendaId: sale.id,
                nomeMaquininha: matchingLink?.nome_maquininha ?? null,
                numeroMaquininha: matchingLink?.numero_maquininha ?? null,
                regional: matchingLink?.regional ?? null,
                cnpjFilial: matchingLink?.cnpj_filial ?? null,
                origemResolucaoFilial: "VENDA_ORIGINAL",
                pendencia: null,
                metadata: {
                    saleScoreSource: "IDENTIFICADORES_REDE",
                },
            };
        }
        if (!codigoEstabelecimento) {
            if (nomeEstabelecimentoNormalized) {
                const linksByName = uniqueByFilial(this.linkRepository.findActiveByNormalizedName(adquirente, nomeEstabelecimentoNormalized, tenantId));
                if (linksByName.length === 1) {
                    const link = linksByName[0];
                    const matchedByMaquininha = link.nome_maquininha_normalized === nomeEstabelecimentoNormalized;
                    return {
                        ...base,
                        found: true,
                        filialId: link.filial_id ?? link.filial_codigo,
                        filialCodigo: link.filial_codigo,
                        vendaId: null,
                        nomeMaquininha: link.nome_maquininha ?? null,
                        numeroMaquininha: link.numero_maquininha ?? null,
                        regional: link.regional ?? null,
                        cnpjFilial: link.cnpj_filial ?? null,
                        origemResolucaoFilial: matchedByMaquininha ? "MAQUININHA_FILIAL" : "NOME_ESTABELECIMENTO",
                        pendencia: null,
                        metadata: {},
                    };
                }
                if (linksByName.length > 1) {
                    return buildPending(base, "VINCULO_DUPLICADO", {
                        detalhe: "Mais de um vinculo encontrado para o nome do estabelecimento/maquininha.",
                        filiais: linksByName.map((link) => link.filial_codigo),
                    });
                }
            }
            return buildPending(base, estabelecimentoRaw ? "CODIGO_ESTABELECIMENTO_INVALIDO" : "ESTABELECIMENTO_AUSENTE", {
                detalhe: estabelecimentoRaw
                    ? "Codigo de estabelecimento presente, mas invalido apos normalizacao."
                    : "Linha sem codigo de estabelecimento.",
            });
        }
        if (linksByCode.length === 0) {
            return buildPending(base, "SEM_VINCULO_FILIAL", {
                detalhe: "Codigo de estabelecimento sem vinculo ativo para a adquirente REDE.",
            });
        }
        if (linksByCode.length > 1) {
            return buildPending(base, "VINCULO_DUPLICADO", {
                detalhe: "Codigo de estabelecimento com mais de uma filial ativa.",
                filiais: linksByCode.map((link) => link.filial_codigo),
            });
        }
        const link = linksByCode[0];
        return {
            ...base,
            found: true,
            filialId: link.filial_id ?? link.filial_codigo,
            filialCodigo: link.filial_codigo,
            vendaId: null,
            nomeMaquininha: link.nome_maquininha ?? null,
            numeroMaquininha: link.numero_maquininha ?? null,
            regional: link.regional ?? null,
            cnpjFilial: link.cnpj_filial ?? null,
            origemResolucaoFilial: "ESTABELECIMENTO_REDE",
            pendencia: null,
            metadata: {},
        };
    }
}
