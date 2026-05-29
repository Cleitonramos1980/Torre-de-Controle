import XLSX from "xlsx";
import { AppError } from "../../utils/error.js";
import { asNullableString, isPlaceholderEmpty, normalizeDigits, normalizeEstablishmentCode, normalizeHeader, normalizeName, normalizeText, } from "./card-receivable-settlement-normalization.js";
function isBlank(value) {
    return value == null || String(value).trim().length === 0 || String(value).trim() === "-";
}
function isRowEmpty(row) {
    return !row.some((value) => !isBlank(value));
}
function excelSerialToDate(value) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed)
        return null;
    const year = String(parsed.y).padStart(4, "0");
    const month = String(parsed.m).padStart(2, "0");
    const day = String(parsed.d).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
function toIsoDate(value) {
    if (value == null || value === "-" || value === "—")
        return null;
    if (value instanceof Date && !Number.isNaN(value.getTime()))
        return value.toISOString().slice(0, 10);
    if (typeof value === "number" && Number.isFinite(value))
        return excelSerialToDate(value);
    const raw = String(value).trim();
    if (!raw)
        return null;
    const brMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (brMatch) {
        const day = brMatch[1].padStart(2, "0");
        const month = brMatch[2].padStart(2, "0");
        const year = brMatch[3].length === 2 ? `20${brMatch[3]}` : brMatch[3];
        return `${year}-${month}-${day}`;
    }
    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch)
        return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime()))
        return parsed.toISOString().slice(0, 10);
    return null;
}
function toMoney(value) {
    if (value == null || value === "-" || value === "—")
        return null;
    if (typeof value === "number" && Number.isFinite(value))
        return Number(value.toFixed(2));
    let raw = String(value).trim();
    if (!raw)
        return null;
    raw = raw.replace(/R\$/gi, "").replace(/\s/g, "");
    const isNegative = raw.startsWith("(") && raw.endsWith(")");
    raw = raw.replace(/[()]/g, "");
    if (raw.includes(",") && raw.includes(".")) {
        raw = raw.replace(/\./g, "").replace(",", ".");
    }
    else if (raw.includes(",")) {
        raw = raw.replace(",", ".");
    }
    raw = raw.replace(/[^0-9.-]/g, "");
    const parsed = Number(raw);
    if (!Number.isFinite(parsed))
        return null;
    return Number((isNegative ? -parsed : parsed).toFixed(2));
}
function findColumn(headers, candidateGroups) {
    const normalized = headers.map((header) => normalizeHeader(header));
    for (const group of candidateGroups) {
        const tokens = group.map((token) => normalizeHeader(token));
        const index = normalized.findIndex((header) => tokens.every((token) => header.includes(token)));
        if (index >= 0)
            return index;
    }
    return -1;
}
function findExactColumn(headers, expected) {
    const target = normalizeHeader(expected);
    return headers.findIndex((header) => normalizeHeader(header) === target);
}
function findColumns(headers, candidateGroups) {
    const indexes = [];
    const normalized = headers.map((header) => normalizeHeader(header));
    for (let index = 0; index < normalized.length; index += 1) {
        const header = normalized[index];
        const matches = candidateGroups.some((group) => group.map((token) => normalizeHeader(token)).every((token) => header.includes(token)));
        if (matches)
            indexes.push(index);
    }
    return indexes;
}
function mapRawJson(headers, row) {
    const raw = {};
    headers.forEach((header, index) => {
        const key = String(header ?? `COLUNA_${index + 1}`).trim() || `COLUNA_${index + 1}`;
        const value = row[index];
        raw[key] = value instanceof Date ? value.toISOString() : value;
    });
    return raw;
}
function detectHeaderRow(rows) {
    for (let index = 0; index < Math.min(rows.length, 40); index += 1) {
        const row = Array.isArray(rows[index]) ? rows[index] : [];
        const normalized = row.map((value) => normalizeHeader(value)).join(" | ");
        if ((normalized.includes("DATA DO RECEBIMENTO") || normalized.includes("DATA RECEBIMENTO")) &&
            normalized.includes("ESTABELECIMENTO") &&
            (normalized.includes("VALOR LIQUIDO") || normalized.includes("VALOR RECEBIDO"))) {
            return index;
        }
    }
    return -1;
}
function detectEstablishmentHeaderRow(rows) {
    for (let index = 0; index < Math.min(rows.length, 40); index += 1) {
        const row = Array.isArray(rows[index]) ? rows[index] : [];
        const normalizedCells = row.map((value) => normalizeHeader(value)).filter(Boolean);
        const hasEstablishment = normalizedCells.some((cell) => cell.includes("ESTABELECIMENTO"));
        const hasName = normalizedCells.some((cell) => cell.includes("NOME"));
        if (hasEstablishment && normalizedCells.length >= (hasName ? 2 : 1))
            return index;
    }
    return 0;
}
function pickSheet(workbook) {
    const preferred = workbook.SheetNames.find((name) => normalizeHeader(name) === "PAGAMENTOS");
    if (preferred)
        return preferred;
    const received = workbook.SheetNames.find((name) => normalizeHeader(name) === "RECEBIDOS");
    if (received)
        return received;
    return preferred ?? workbook.SheetNames[0];
}
function pickFirstCleanValue(row, indexes) {
    for (const index of indexes) {
        if (index < 0)
            continue;
        const raw = row[index] == null ? "" : String(row[index]).trim();
        if (raw && raw !== "-")
            return raw;
    }
    return null;
}
function normalizeIntegerString(value) {
    if (isPlaceholderEmpty(value))
        return null;
    const digits = normalizeDigits(value);
    return digits || null;
}
function collectEstablishmentReferences(workbook, fileName) {
    const references = [];
    const relevantSheets = workbook.SheetNames.filter((sheetName) => {
        const normalized = normalizeHeader(sheetName);
        return normalized.includes("PAGAMENTOS") ||
            normalized.includes("RECEBIDOS") ||
            normalized.includes("AJUSTES") ||
            normalized.includes("CANCELAMENTOS") ||
            normalized.includes("CONTESTACOES") ||
            normalized.includes("COBRANCAS EM ABERTO") ||
            normalized.includes("BLOQUEADOS SUSPENSO") ||
            normalized.includes("BLOQUEADOS RETIDO") ||
            normalized.includes("CAPA");
    });
    for (const sheetName of relevantSheets) {
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet)
            continue;
        const rows = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: null,
            raw: true,
            blankrows: false,
        });
        if (!Array.isArray(rows) || rows.length === 0)
            continue;
        const headerRowIndex = detectEstablishmentHeaderRow(rows);
        const headers = (rows[headerRowIndex] ?? []).map((value, index) => String(value ?? `COLUNA_${index + 1}`).trim());
        const establishmentColumns = findColumns(headers, [
            ["ESTABELECIMENTO"],
            ["NUMERO DO ESTABELECIMENTO"],
            ["ESTABELECIMENTO DA COBRANCA"],
            ["ESTABELECIMENTO DA VENDA"],
            ["ESTABELECIMENTO AJUSTADO"],
        ]).filter((index) => !normalizeHeader(headers[index]).includes("NOME"));
        const nameColumns = findColumns(headers, [
            ["NOME DO ESTABELECIMENTO"],
            ["NOME DO ESTABELECIMENTO COBRADO"],
            ["NOME DO ESTABELECIMENTO DA VENDA"],
            ["NOME DO ESTABELECIMENTO AJUSTADO"],
            ["MAQUININHA"],
        ]);
        if (establishmentColumns.length === 0)
            continue;
        const dataRows = rows.slice(headerRowIndex + 1);
        for (let offset = 0; offset < dataRows.length; offset += 1) {
            const row = Array.isArray(dataRows[offset]) ? dataRows[offset] : [];
            if (isRowEmpty(row))
                continue;
            const rowNumber = headerRowIndex + 2 + offset;
            let nameValue = null;
            for (const nameIndex of nameColumns) {
                const candidate = asNullableString(row[nameIndex]);
                if (candidate) {
                    nameValue = candidate;
                    break;
                }
            }
            for (const codeIndex of establishmentColumns) {
                const rawValue = row[codeIndex];
                const normalizedCode = normalizeEstablishmentCode(rawValue);
                if (!normalizedCode)
                    continue;
                references.push({
                    fileName,
                    sheetName,
                    rowNumber,
                    fieldName: String(headers[codeIndex] ?? `COLUNA_${codeIndex + 1}`),
                    establishmentCode: normalizedCode,
                    establishmentName: nameValue,
                });
            }
        }
    }
    const uniqueCodes = Array.from(new Set(references.map((row) => row.establishmentCode).filter(Boolean)));
    return {
        references,
        uniqueCodes,
        totalRows: references.length,
        totalUniqueCodes: uniqueCodes.length,
    };
}
export class CardReceivableSettlementParserService {
    parseWorkbook(buffer, fileName) {
        const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
        const sheetName = pickSheet(workbook);
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) {
            throw new AppError("Nao foi possivel identificar o layout de recebimentos da Rede. Verifique se o arquivo enviado e o relatorio de recebimentos da Rede com a aba pagamentos.", 400);
        }
        const rows = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: null,
            raw: true,
            blankrows: false,
        });
        const headerRowIndex = detectHeaderRow(rows);
        if (headerRowIndex < 0) {
            throw new AppError("Nao foi possivel identificar o layout de recebimentos da Rede. Verifique se o arquivo enviado e o relatorio de recebimentos da Rede com a aba pagamentos.", 400);
        }
        const headers = rows[headerRowIndex].map((value, index) => String(value ?? `COLUNA_${index + 1}`).trim());
        const dateIndex = findColumn(headers, [["DATA DO RECEBIMENTO"], ["DATA RECEBIMENTO"], ["DATA PAGAMENTO"], ["DATA DO PAGAMENTO"]]);
        const saleDateIndex = findColumn(headers, [["DATA DA VENDA"], ["DATA VENDA"], ["DATA DA TRANSACAO"], ["DATA TRANSACAO"]]);
        const establishmentNameIndex = findColumn(headers, [["NOME DO ESTABELECIMENTO"], ["ESTABELECIMENTO NOME"]]);
        const establishmentIndex = findExactColumn(headers, "ESTABELECIMENTO") >= 0
            ? findExactColumn(headers, "ESTABELECIMENTO")
            : findColumn(headers, [["NUMERO DO ESTABELECIMENTO"], ["CODIGO DO ESTABELECIMENTO"], ["ESTABELECIMENTO"]]);
        const cnpjIndex = findColumn(headers, [["CNPJ FILIAL"], ["CNPJ ESTABELECIMENTO"], ["CNPJ CPF DO ESTABELECIMENTO"], ["CNPJ/CPF DO ESTABELECIMENTO"]]);
        const netIndex = findColumn(headers, [["VALOR LIQUIDO DO DEPOSITO"], ["VALOR LIQUIDO"], ["LIQUIDO RECEBIDO"], ["VALOR RECEBIDO"]]);
        const grossIndex = findColumn(headers, [["VALOR BRUTO DA PARCELA ORIGINAL"], ["VALOR BRUTO DA PARCELA ATUALIZADA"], ["VALOR BRUTO"], ["VALOR DA VENDA"], ["VALOR ORIGINAL"]]);
        const nsuIndex = findColumn(headers, [["NSU"], ["NSU REDE"], ["NSU CV"], ["CV"]]);
        const authorizationIndex = findColumn(headers, [["AUTORIZACAO"], ["CODIGO AUTORIZACAO"], ["COD AUTORIZACAO"], ["CV"], ["NSU CV"]]);
        const cardNumberIndex = findColumn(headers, [["NUMERO DO CARTAO"], ["CARTAO"]]);
        const tidIndex = findColumn(headers, [["TID"]]);
        const batchIndex = findColumn(headers, [["RESUMO DE VENDAS"], ["NUMERO DO LOTE"], ["LOTE"]]);
        const modalityIndex = findColumn(headers, [["MODALIDADE"]]);
        const brandIndex = findColumn(headers, [["BANDEIRA"]]);
        const installmentsIndex = findColumn(headers, [["NUMERO DE PARCELAS"], ["QTD PARCELAS"]]);
        const installmentIndex = findColumn(headers, [["PARCELA"]]);
        const documentIndexes = [
            findColumn(headers, [["NUMERO DO PEDIDO"], ["PEDIDO"]]),
            findColumn(headers, [["DOCUMENTO"]]),
            findColumn(headers, [["TID"]]),
            findColumn(headers, [["RESUMO DE VENDAS"], ["NUMERO DO LOTE"], ["RESUMO"]]),
            findColumn(headers, [["PAYMENT ID"], ["NUMERO CONTRATO"], ["CONTRATO"], ["NEGOCIACAO"]]),
        ];
        if (dateIndex < 0 || netIndex < 0 || establishmentIndex < 0) {
            throw new AppError("Nao foi possivel identificar o layout de recebimentos da Rede. Verifique se o arquivo enviado e o relatorio de recebimentos da Rede com a aba pagamentos.", 400);
        }
        const parsedRows = [];
        let periodStart = null;
        let periodEnd = null;
        const dataRows = rows.slice(headerRowIndex + 1);
        for (let offset = 0; offset < dataRows.length; offset += 1) {
            const row = Array.isArray(dataRows[offset]) ? dataRows[offset] : [];
            if (isRowEmpty(row))
                continue;
            const rowNumber = headerRowIndex + 2 + offset;
            const paymentDate = toIsoDate(row[dateIndex]);
            const netAmount = toMoney(row[netIndex]);
            if (!paymentDate && netAmount == null)
                continue;
            const cnpjRaw = cnpjIndex >= 0 && row[cnpjIndex] != null ? String(row[cnpjIndex]).trim() : "";
            const establishmentRaw = row[establishmentIndex] == null ? "" : String(row[establishmentIndex]).trim();
            const establishmentCode = normalizeEstablishmentCode(row[establishmentIndex]);
            const establishmentName = establishmentNameIndex >= 0 && row[establishmentNameIndex] != null
                ? String(row[establishmentNameIndex]).trim()
                : null;
            const cnpjDigits = normalizeDigits(cnpjRaw);
            const branchCnpjNormalized = cnpjDigits.length >= 14 ? cnpjDigits.slice(-14) : "";
            if (paymentDate) {
                if (!periodStart || paymentDate < periodStart)
                    periodStart = paymentDate;
                if (!periodEnd || paymentDate > periodEnd)
                    periodEnd = paymentDate;
            }
            parsedRows.push({
                rowNumber,
                branchCnpjRaw: branchCnpjNormalized ? cnpjRaw : establishmentRaw,
                branchCnpjNormalized: branchCnpjNormalized || establishmentCode,
                branchDocumentIsCnpj: Boolean(branchCnpjNormalized),
                establishmentCode: establishmentCode || null,
                establishmentCodeRaw: establishmentRaw || null,
                establishmentName: asNullableString(establishmentName),
                establishmentNameNormalized: normalizeName(establishmentName),
                redePaymentDate: paymentDate,
                redeSaleDate: saleDateIndex >= 0 ? toIsoDate(row[saleDateIndex]) : null,
                redeGrossAmount: grossIndex >= 0 ? toMoney(row[grossIndex]) : null,
                redeNetAmount: netAmount,
                redeReceivedAmount: netAmount,
                redeNsu: asNullableString(nsuIndex >= 0 ? row[nsuIndex] : null),
                redeAuthorization: asNullableString(authorizationIndex >= 0 ? row[authorizationIndex] : null),
                redeTid: asNullableString(tidIndex >= 0 ? row[tidIndex] : null),
                redeCardNumber: asNullableString(cardNumberIndex >= 0 ? row[cardNumberIndex] : null),
                redeBatchNumber: asNullableString(batchIndex >= 0 ? row[batchIndex] : null),
                redeModalidade: asNullableString(modalityIndex >= 0 ? row[modalityIndex] : null),
                redeBandeira: asNullableString(brandIndex >= 0 ? row[brandIndex] : null),
                redeInstallments: normalizeIntegerString(installmentsIndex >= 0 ? row[installmentsIndex] : null),
                redeInstallment: normalizeIntegerString(installmentIndex >= 0 ? row[installmentIndex] : null),
                redeDocument: pickFirstCleanValue(row, documentIndexes),
                redeRawJson: mapRawJson(headers, row),
                sourceSheetName: sheetName,
            });
        }
        if (parsedRows.length === 0) {
            throw new AppError("Planilha de recebimentos da Rede sem linhas validas para processamento.", 400);
        }
        const establishmentCoverage = collectEstablishmentReferences(workbook, fileName);
        return {
            fileName,
            sheetName,
            headerRowIndex,
            headers,
            periodStart,
            periodEnd,
            parsedRows,
            preview: parsedRows.slice(0, 15),
            establishmentCoverage,
        };
    }
}
