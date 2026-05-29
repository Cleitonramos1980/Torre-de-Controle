import * as XLSX from "xlsx";
import { AppError } from "../../utils/error.js";
function normalizeText(value) {
    if (value == null)
        return "";
    return String(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim();
}
function normalizeCnpj(value) {
    if (value == null)
        return "";
    return String(value).replace(/[^0-9]/g, "");
}
function isRowEmpty(row) {
    return !Array.isArray(row) || row.every((cell) => {
        if (cell == null)
            return true;
        if (typeof cell === "string")
            return cell.trim().length === 0;
        return false;
    });
}
function toIsoDateFromExcelSerial(serial) {
    if (typeof serial !== "number" || !Number.isFinite(serial))
        return null;
    const parsed = XLSX.SSF.parse_date_code(serial);
    if (!parsed)
        return null;
    const year = parsed.y;
    const month = String(parsed.m).padStart(2, "0");
    const day = String(parsed.d).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
function toIsoDate(value) {
    if (value == null)
        return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }
    if (typeof value === "number") {
        const fromSerial = toIsoDateFromExcelSerial(value);
        if (fromSerial)
            return fromSerial;
    }
    const raw = String(value).trim();
    if (!raw)
        return null;
    const brMatch = raw.match(/^(\d{2})[\/.-](\d{2})[\/.-](\d{4})$/);
    if (brMatch) {
        const [, dd, mm, yyyy] = brMatch;
        return `${yyyy}-${mm}-${dd}`;
    }
    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        const [, yyyy, mm, dd] = isoMatch;
        return `${yyyy}-${mm}-${dd}`;
    }
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime()))
        return null;
    return parsed.toISOString().slice(0, 10);
}
function toMoney(value) {
    if (value == null)
        return null;
    if (typeof value === "number" && Number.isFinite(value)) {
        return Number(value.toFixed(2));
    }
    const raw = String(value).trim();
    if (!raw)
        return null;
    const normalized = raw
        .replace(/R\$/gi, "")
        .replace(/\s/g, "")
        .replace(/\.(?=\d{3}(?:\D|$))/g, "")
        .replace(",", ".")
        .replace(/[^0-9.-]/g, "");
    if (!normalized)
        return null;
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed))
        return null;
    return Number(parsed.toFixed(2));
}
function detectHeaderRow(rows) {
    let bestIndex = -1;
    let bestScore = -1;
    const scanLimit = Math.min(rows.length, 30);
    for (let index = 0; index < scanLimit; index += 1) {
        const row = rows[index];
        if (!Array.isArray(row))
            continue;
        const tokens = row.map((cell) => normalizeText(cell)).filter((token) => token.length > 0);
        if (tokens.length === 0)
            continue;
        let score = tokens.length;
        for (const token of tokens) {
            if (token.includes("DATA"))
                score += 2;
            if (token.includes("VALOR"))
                score += 2;
            if (token.includes("CNPJ"))
                score += 3;
            if (token.includes("NSU"))
                score += 1;
        }
        if (score > bestScore) {
            bestScore = score;
            bestIndex = index;
        }
    }
    if (bestIndex >= 0)
        return bestIndex;
    return 0;
}
function findColumnIndex(headerTokens, keywordGroups, fallback = -1) {
    for (let index = 0; index < headerTokens.length; index += 1) {
        const token = headerTokens[index];
        if (!token)
            continue;
        for (const group of keywordGroups) {
            const matches = group.every((keyword) => token.includes(keyword));
            if (matches) {
                return index;
            }
        }
    }
    return fallback;
}
function mapRawJson(headers, row) {
    const payload = {};
    const maxLength = Math.max(headers.length, row.length);
    for (let index = 0; index < maxLength; index += 1) {
        const key = headers[index] || `COLUNA_${index + 1}`;
        payload[key] = row[index] ?? null;
    }
    return payload;
}
export class RedeSalesParserService {
    parseWorkbook(buffer, fileName) {
        let workbook;
        try {
            workbook = XLSX.read(buffer, { type: "buffer", raw: true, cellDates: true });
        }
        catch {
            throw new AppError("Arquivo invalido. Envie uma planilha XLSX/XLS da REDE.", 400);
        }
        const firstSheetName = workbook.SheetNames[0];
        if (!firstSheetName) {
            throw new AppError("Planilha sem abas de dados.", 400);
        }
        const sheet = workbook.Sheets[firstSheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, {
            header: 1,
            defval: null,
            raw: true,
            blankrows: false,
        });
        if (!Array.isArray(rows) || rows.length === 0) {
            throw new AppError("Planilha vazia. Nenhum dado foi encontrado.", 400);
        }
        const headerRowIndex = detectHeaderRow(rows);
        const headerRaw = Array.isArray(rows[headerRowIndex]) ? rows[headerRowIndex] : [];
        const headers = headerRaw.map((cell, index) => {
            const token = String(cell ?? "").trim();
            return token.length > 0 ? token : `COLUNA_${index + 1}`;
        });
        const headerTokens = headers.map((token) => normalizeText(token));
        const cnpjIndex = 23;
        if (headers.length <= cnpjIndex) {
            throw new AppError("Nao foi possivel identificar a coluna X com o CNPJ da filial. Verifique se o layout e o relatorio de vendas da Rede.", 400);
        }
        const dateIndex = findColumnIndex(headerTokens, [
            ["DATA", "VENDA"],
            ["DATA", "TRANSA"],
            ["DATA"],
        ]);
        const amountIndex = findColumnIndex(headerTokens, [
            ["VALOR", "VENDA"],
            ["VALOR", "TOTAL"],
            ["VALOR"],
            ["AMOUNT"],
        ]);
        const nsuIndex = findColumnIndex(headerTokens, [["NSU"]]);
        const authorizationIndex = findColumnIndex(headerTokens, [
            ["AUTORIZ"],
            ["AUTH"],
            ["APPROVAL"],
        ]);
        const documentIndex = findColumnIndex(headerTokens, [
            ["PEDIDO"],
            ["DOCUMENTO"],
            ["CUPOM"],
            ["TRANSA"],
            ["NOTA"],
            ["ORDER"],
        ]);
        if (dateIndex < 0 || amountIndex < 0) {
            throw new AppError("Nao foi possivel identificar colunas de data/valor na planilha. Verifique o layout do relatorio de vendas da Rede.", 400);
        }
        const dataRows = rows.slice(headerRowIndex + 1);
        const hasColumnX = dataRows.some((row) => Array.isArray(row) && String(row[cnpjIndex] ?? "").trim().length > 0);
        if (!hasColumnX) {
            throw new AppError("Nao foi possivel identificar a coluna X com o CNPJ da filial. Verifique se o layout e o relatorio de vendas da Rede.", 400);
        }
        const parsedRows = [];
        let periodStart = null;
        let periodEnd = null;
        for (let offset = 0; offset < dataRows.length; offset += 1) {
            const row = Array.isArray(dataRows[offset]) ? dataRows[offset] : [];
            if (isRowEmpty(row))
                continue;
            const rowNumber = headerRowIndex + 2 + offset;
            const branchCnpjRaw = row[cnpjIndex] == null ? "" : String(row[cnpjIndex]).trim();
            const branchCnpjNormalized = normalizeCnpj(branchCnpjRaw);
            const redeSaleDate = toIsoDate(row[dateIndex]);
            const redeAmount = toMoney(row[amountIndex]);
            const redeNsu = nsuIndex >= 0 && row[nsuIndex] != null ? String(row[nsuIndex]).trim() : null;
            const redeAuthorization = authorizationIndex >= 0 && row[authorizationIndex] != null
                ? String(row[authorizationIndex]).trim()
                : null;
            const redeDocument = documentIndex >= 0 && row[documentIndex] != null ? String(row[documentIndex]).trim() : null;
            if (redeSaleDate) {
                if (!periodStart || redeSaleDate < periodStart)
                    periodStart = redeSaleDate;
                if (!periodEnd || redeSaleDate > periodEnd)
                    periodEnd = redeSaleDate;
            }
            parsedRows.push({
                rowNumber,
                branchCnpjRaw,
                branchCnpjNormalized,
                redeSaleDate,
                redeAmount,
                redeNsu: redeNsu || null,
                redeAuthorization: redeAuthorization || null,
                redeDocument: redeDocument || null,
                redeRawJson: mapRawJson(headers, row),
            });
        }
        if (parsedRows.length === 0) {
            throw new AppError("Planilha sem linhas validas para processamento.", 400);
        }
        const preview = parsedRows.slice(0, 15).map((row) => ({
            rowNumber: row.rowNumber,
            branchCnpjRaw: row.branchCnpjRaw,
            branchCnpjNormalized: row.branchCnpjNormalized,
            redeSaleDate: row.redeSaleDate,
            redeAmount: row.redeAmount,
            redeNsu: row.redeNsu,
            redeAuthorization: row.redeAuthorization,
            redeDocument: row.redeDocument,
        }));
        return {
            fileName,
            sheetName: firstSheetName,
            headerRowIndex,
            headers,
            parsedRows,
            preview,
            periodStart,
            periodEnd,
        };
    }
}
