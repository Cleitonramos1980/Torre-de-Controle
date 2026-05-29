import XLSX from "xlsx";
import { AppError } from "../../utils/error.js";
import { asNullableString, isPlaceholderEmpty, normalizeDigits, normalizeEstablishmentCode, normalizeHeader, normalizeName, } from "./card-receivable-settlement-normalization.js";
function isRowEmpty(row) {
    return !Array.isArray(row) || row.every((cell) => isPlaceholderEmpty(cell));
}
function findHeaderRow(rows, requiredGroups) {
    for (let index = 0; index < Math.min(rows.length, 40); index += 1) {
        const row = Array.isArray(rows[index]) ? rows[index] : [];
        const headers = row.map((value) => normalizeHeader(value)).filter(Boolean);
        if (headers.length === 0)
            continue;
        const allGroupsMatch = requiredGroups.every((group) => group.some((token) => headers.some((header) => header.includes(normalizeHeader(token)))));
        if (allGroupsMatch)
            return index;
    }
    return -1;
}
function findColumn(headers, groups) {
    const normalizedHeaders = headers.map((value) => normalizeHeader(value));
    for (let index = 0; index < normalizedHeaders.length; index += 1) {
        const header = normalizedHeaders[index];
        if (!header)
            continue;
        const matches = groups.some((group) => group.map((token) => normalizeHeader(token)).every((token) => header.includes(token)));
        if (matches)
            return index;
    }
    return -1;
}
function normalizeQuantidade(value) {
    if (value == null || String(value).trim() === "")
        return null;
    const parsed = Number(String(value).replace(",", "."));
    if (!Number.isFinite(parsed))
        return null;
    return Math.max(0, Math.trunc(parsed));
}
function parseMaquininhaWorkbook(buffer, fileName) {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheetName = workbook.SheetNames.find((name) => normalizeHeader(name) === "FOLHA1") ?? workbook.SheetNames[0];
    if (!sheetName) {
        throw new AppError("Planilha de maquininhas sem abas de dados.", 400);
    }
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
        throw new AppError("Nao foi possivel ler a aba de maquininhas.", 400);
    }
    const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: null,
        raw: true,
        blankrows: false,
    });
    const headerRowIndex = findHeaderRow(rows, [["FILIAL"], ["ESTABELECIMENTO"]]);
    if (headerRowIndex < 0) {
        throw new AppError("Nao foi possivel identificar o cabecalho da planilha de maquininhas (FILIAL/ESTABELECIMENTO).", 400);
    }
    const headers = (rows[headerRowIndex] ?? []).map((value, index) => String(value ?? `COLUNA_${index + 1}`).trim());
    const filialIndex = findColumn(headers, [["FILIAL"]]);
    const regionalIndex = findColumn(headers, [["REGIONAL"]]);
    const nomeIndex = findColumn(headers, [["NOME"]]);
    const estabelecimentoIndex = findColumn(headers, [["ESTABELECIMENTO"]]);
    const maquininhaIndex = findColumn(headers, [["MAQUININHA"]]);
    const numeroMaquininhaIndex = findColumn(headers, [["N MAQUININHA"], ["NUMERO MAQUININHA"]]);
    const situacaoIndex = findColumn(headers, [["SITUACAO"]]);
    const quantidadeIndex = findColumn(headers, [["QUANTIDADE DE MAQUINHAS"], ["QUANTIDADE"]]);
    if (filialIndex < 0 || estabelecimentoIndex < 0) {
        throw new AppError("Cabecalho da planilha de maquininhas sem colunas obrigatorias FILIAL e ESTABELECIMENTO.", 400);
    }
    const entries = [];
    let ignoredRows = 0;
    const dataRows = rows.slice(headerRowIndex + 1);
    for (let offset = 0; offset < dataRows.length; offset += 1) {
        const row = Array.isArray(dataRows[offset]) ? dataRows[offset] : [];
        if (isRowEmpty(row))
            continue;
        const filialCodigo = asNullableString(row[filialIndex]);
        const codigoEstabelecimento = normalizeEstablishmentCode(row[estabelecimentoIndex]);
        if (!filialCodigo || !codigoEstabelecimento) {
            ignoredRows += 1;
            continue;
        }
        const nomeMaquininha = asNullableString(maquininhaIndex >= 0 ? row[maquininhaIndex] : null);
        const nomeFilial = asNullableString(nomeIndex >= 0 ? row[nomeIndex] : null);
        const regional = asNullableString(regionalIndex >= 0 ? row[regionalIndex] : null);
        const numeroMaquininha = asNullableString(numeroMaquininhaIndex >= 0 ? row[numeroMaquininhaIndex] : null);
        const situacao = asNullableString(situacaoIndex >= 0 ? row[situacaoIndex] : null);
        const quantidadeMaquininhas = normalizeQuantidade(quantidadeIndex >= 0 ? row[quantidadeIndex] : null);
        entries.push({
            fileName,
            sheetName,
            rowNumber: headerRowIndex + 2 + offset,
            filialCodigo: String(filialCodigo).trim(),
            regional: regional ? regional.replace(/\s+/g, " ").trim() : null,
            nomeFilial,
            codigoEstabelecimento,
            nomeEstabelecimento: nomeFilial,
            nomeMaquininha,
            numeroMaquininha,
            situacao,
            quantidadeMaquininhas,
        });
    }
    return {
        fileName,
        sheetName,
        headerRowIndex,
        headers,
        entries,
        ignoredRows,
    };
}
function shouldIgnoreCnpjSheet(name) {
    return normalizeHeader(name).includes("DEFASADA");
}
function parseCnpjWorkbook(buffer, fileName) {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const entries = [];
    for (const sheetName of workbook.SheetNames) {
        if (shouldIgnoreCnpjSheet(sheetName))
            continue;
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet)
            continue;
        const rows = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: null,
            raw: true,
            blankrows: false,
        });
        const headerRowIndex = findHeaderRow(rows, [["CNPJ"], ["FILIAL", "COD FL", "COD. FL"]]);
        if (headerRowIndex < 0)
            continue;
        const headers = (rows[headerRowIndex] ?? []).map((value, index) => String(value ?? `COLUNA_${index + 1}`).trim());
        const filialIndex = findColumn(headers, [["FILIAL"], ["COD FL"], ["COD. FL"]]);
        const cnpjIndex = findColumn(headers, [["CNPJ"]]);
        const ufIndex = findColumn(headers, [["UF"]]);
        const municipioIndex = findColumn(headers, [["MUNICIPIO"], ["CIDADE"]]);
        const enderecoIndex = findColumn(headers, [["ENDERECO"]]);
        if (filialIndex < 0 || cnpjIndex < 0)
            continue;
        const dataRows = rows.slice(headerRowIndex + 1);
        for (const row of dataRows) {
            if (isRowEmpty(row))
                continue;
            const filialCodigo = asNullableString(row[filialIndex]);
            const cnpj = normalizeDigits(row[cnpjIndex]);
            if (!filialCodigo || cnpj.length < 8)
                continue;
            entries.push({
                fileName,
                sheetName,
                filialCodigo: String(filialCodigo).trim(),
                cnpjFilial: cnpj,
                uf: asNullableString(ufIndex >= 0 ? row[ufIndex] : null),
                municipio: asNullableString(municipioIndex >= 0 ? row[municipioIndex] : null),
                endereco: asNullableString(enderecoIndex >= 0 ? row[enderecoIndex] : null),
            });
        }
    }
    const byFilial = new Map();
    for (const entry of entries) {
        if (!byFilial.has(entry.filialCodigo)) {
            byFilial.set(entry.filialCodigo, entry);
        }
    }
    return {
        fileName,
        entries,
        byFilial,
    };
}
export class FilialEstabelecimentoLinkService {
    repository;
    constructor(repository) {
        this.repository = repository;
    }
    listLinks(filters = {}) {
        const rows = this.repository.list(filters);
        const ambiguous = this.repository.getAmbiguousEstablishments(filters.adquirente ?? "REDE", filters.tenantId ?? "default");
        return {
            total: rows.length,
            rows,
            ambiguidades: ambiguous,
        };
    }
    upsertLink(input) {
        const payload = {
            ...input,
            nome_estabelecimento_normalized: normalizeName(input.nome_estabelecimento),
            nome_maquininha_normalized: normalizeName(input.nome_maquininha),
        };
        const { row } = this.repository.upsert(payload);
        return row;
    }
    updateLink(id, patch) {
        const updated = this.repository.updateById(id, patch);
        if (!updated)
            throw new AppError("Vinculo filial x estabelecimento nao encontrado.", 404);
        return updated;
    }
    async importMaquininhaAndCnpj(payload) {
        const maquininhaParsed = parseMaquininhaWorkbook(payload.maquininhaBuffer, payload.maquininhaFileName);
        const cnpjParsed = payload.cnpjBuffer
            ? parseCnpjWorkbook(payload.cnpjBuffer, payload.cnpjFileName ?? "cnpj-filiais.xlsx")
            : null;
        let inserted = 0;
        let updated = 0;
        for (const entry of maquininhaParsed.entries) {
            const cnpjInfo = cnpjParsed?.byFilial.get(entry.filialCodigo) ?? null;
            const result = this.repository.upsert({
                tenant_id: payload.tenantId ?? "default",
                empresa_id: payload.empresaId ?? null,
                filial_id: entry.filialCodigo,
                filial_codigo: entry.filialCodigo,
                regional: entry.regional,
                nome_filial: entry.nomeFilial,
                adquirente: "REDE",
                codigo_estabelecimento: entry.codigoEstabelecimento,
                nome_estabelecimento: entry.nomeEstabelecimento ?? entry.nomeMaquininha ?? entry.nomeFilial,
                nome_maquininha: entry.nomeMaquininha,
                numero_maquininha: entry.numeroMaquininha,
                situacao: entry.situacao,
                quantidade_maquininhas: entry.quantidadeMaquininhas,
                cnpj_filial: cnpjInfo?.cnpjFilial ?? null,
                ativo: true,
                origem_importacao: payload.maquininhaFileName,
                metadata: {
                    sourceFile: payload.maquininhaFileName,
                    sourceSheet: entry.sheetName,
                    sourceRowNumber: entry.rowNumber,
                    cnpjSourceFile: cnpjInfo?.fileName ?? null,
                    cnpjSourceSheet: cnpjInfo?.sheetName ?? null,
                    cnpjUf: cnpjInfo?.uf ?? null,
                    cnpjMunicipio: cnpjInfo?.municipio ?? null,
                    cnpjEndereco: cnpjInfo?.endereco ?? null,
                },
            });
            if (result.operation === "inserted")
                inserted += 1;
            else
                updated += 1;
        }
        const ambiguous = this.repository.getAmbiguousEstablishments("REDE", payload.tenantId ?? "default");
        return {
            status: "ok",
            arquivoMaquininha: payload.maquininhaFileName,
            arquivoCnpj: payload.cnpjFileName ?? null,
            totalLinhasLidasMaquininha: maquininhaParsed.entries.length + maquininhaParsed.ignoredRows,
            totalLinhasIgnoradasMaquininha: maquininhaParsed.ignoredRows,
            totalVinculosImportados: maquininhaParsed.entries.length,
            totalInseridos: inserted,
            totalAtualizados: updated,
            totalAmbiguidadesAtivas: ambiguous.length,
            ambiguidades: ambiguous,
        };
    }
}
