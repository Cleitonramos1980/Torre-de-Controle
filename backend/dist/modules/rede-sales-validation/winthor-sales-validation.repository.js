import { initOraclePool, isOracleEnabled } from "../../db/oracle.js";
import { queryRows } from "../../repositories/baseRepository.js";
import { AppError } from "../../utils/error.js";
function toIsoDate(value) {
    if (!value)
        return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()))
        return null;
    return parsed.toISOString().slice(0, 10);
}
function normalizeDigits(value) {
    if (!value)
        return "";
    return String(value).replace(/[^0-9]/g, "");
}
function normalizeDoc(value) {
    if (value == null)
        return "";
    return String(value).replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}
function sqlStringExpr(alias, column) {
    return column ? `TO_CHAR(${alias}.${column})` : "NULL";
}
function sqlValueExpr(alias, column, fallback = "NULL") {
    return column ? `${alias}.${column}` : fallback;
}
export class WinthorSalesValidationRepository {
    logger;
    constructor(logger) {
        this.logger = logger;
    }
    async ensureOracle() {
        if (!isOracleEnabled()) {
            throw new AppError("Oracle WinThor nao configurado para validacao de vendas REDE x WinThor.", 503);
        }
        await initOraclePool();
    }
    async resolvePcpedcColumns() {
        await this.ensureOracle();
        const rows = await queryRows(`SELECT COLUMN_NAME
         FROM ALL_TAB_COLUMNS
        WHERE TABLE_NAME = 'PCPEDC'`);
        return new Set(rows.map((row) => String(row.COLUMN_NAME ?? "").toUpperCase()));
    }
    resolveColumn(columns, candidates) {
        for (const candidate of candidates) {
            const key = candidate.toUpperCase();
            if (columns.has(key))
                return key;
        }
        return null;
    }
    async resolvePcpedcMapping() {
        const columns = await this.resolvePcpedcColumns();
        const mapping = {
            numped: this.resolveColumn(columns, ["NUMPED"]),
            codfilial: this.resolveColumn(columns, ["CODFILIAL"]),
            codcli: this.resolveColumn(columns, ["CODCLI"]),
            data: this.resolveColumn(columns, ["DATA", "DTEMISSAO", "DTSAIDA", "DTMOV"]),
            posicao: this.resolveColumn(columns, ["POSICAO"]),
            vltotal: this.resolveColumn(columns, ["VLTOTAL", "VLTOTGER", "VLATEND"]),
            numnota: this.resolveColumn(columns, ["NUMNOTA", "NUMNOTAFISCAL"]),
            nsu: this.resolveColumn(columns, ["NSU", "NSUTEF", "NSU_REDE", "NSUCARTAO", "NSU_CARTAO", "NSUHOST", "NSU_HOST"]),
            codautorizacao: this.resolveColumn(columns, ["CODAUTORIZACAO", "CODAUTORIZACAOTEF", "CODAUT", "AUTORIZACAO", "CODAUTORIZACAOCARTAO", "CODAUTORIZACAO_CARTAO"]),
            codcob: this.resolveColumn(columns, ["CODCOB"]),
            codplpag: this.resolveColumn(columns, ["CODPLPAG"]),
            condvenda: this.resolveColumn(columns, ["CONDVENDA"]),
            origemped: this.resolveColumn(columns, ["ORIGEMPED"]),
        };
        if (!mapping.numped || !mapping.codfilial || !mapping.data || !mapping.vltotal) {
            throw new AppError("PCPEDC sem colunas minimas para validacao REDE x WinThor (NUMPED, CODFILIAL, DATA, VLTOTAL).", 500);
        }
        return mapping;
    }
    buildSaleSelect(mapping) {
        return `SELECT
             ${sqlStringExpr("C", mapping.numped)} AS NUMPED,
             ${sqlStringExpr("C", mapping.codfilial)} AS CODFILIAL,
             ${sqlStringExpr("C", mapping.codcli)} AS CODCLI,
             ${sqlValueExpr("C", mapping.data)} AS DATA,
             ${sqlStringExpr("C", mapping.posicao)} AS POSICAO,
             NVL(${sqlValueExpr("C", mapping.vltotal, "0")}, 0) AS VLTOTAL,
             ${sqlStringExpr("C", mapping.numnota)} AS NUMNOTA,
             ${sqlStringExpr("C", mapping.nsu)} AS NSU,
             ${sqlStringExpr("C", mapping.codautorizacao)} AS CODAUTORIZACAO,
             ${sqlStringExpr("C", mapping.codcob)} AS CODCOB,
             ${sqlStringExpr("C", mapping.codplpag)} AS CODPLPAG,
             ${sqlStringExpr("C", mapping.condvenda)} AS CONDVENDA,
             ${sqlStringExpr("C", mapping.origemped)} AS ORIGEMPED
            FROM PCPEDC C`;
    }
    mapFilialRow(row) {
        return {
            codigo: String(row.CODIGO ?? "").trim(),
            cgc: String(row.CGC ?? "").trim(),
            razaoSocial: String(row.RAZAOSOCIAL ?? "").trim(),
            fantasia: String(row.FANTASIA ?? "").trim(),
        };
    }
    mapSaleRow(row) {
        return {
            id: `WINTHOR-${String(row.CODFILIAL ?? "").trim()}-${String(row.NUMPED ?? row.NUMNOTA ?? Math.random()).trim()}`,
            numped: row.NUMPED == null ? null : String(row.NUMPED).trim(),
            codfilial: row.CODFILIAL == null ? null : String(row.CODFILIAL).trim(),
            codcli: row.CODCLI == null ? null : String(row.CODCLI).trim(),
            data: toIsoDate(row.DATA),
            posicao: row.POSICAO == null ? null : String(row.POSICAO).trim(),
            vltotal: typeof row.VLTOTAL === "number" ? Number(row.VLTOTAL.toFixed(2)) : Number(row.VLTOTAL ?? 0),
            numnota: row.NUMNOTA == null ? null : String(row.NUMNOTA).trim(),
            nsu: row.NSU == null ? null : String(row.NSU).trim(),
            codautorizacao: row.CODAUTORIZACAO == null ? null : String(row.CODAUTORIZACAO).trim(),
            codcob: row.CODCOB == null ? null : String(row.CODCOB).trim(),
            codplpag: row.CODPLPAG == null ? null : String(row.CODPLPAG).trim(),
            condvenda: row.CONDVENDA == null ? null : String(row.CONDVENDA).trim(),
            origemped: row.ORIGEMPED == null ? null : String(row.ORIGEMPED).trim(),
            raw: row,
        };
    }
    async findFiliaisByCnpjs(cnpjs) {
        await this.ensureOracle();
        const uniqueCnpjs = Array.from(new Set(cnpjs.map((value) => normalizeDigits(value)).filter((value) => value.length > 0)));
        const output = new Map();
        for (const cnpj of uniqueCnpjs) {
            const rows = await queryRows(`SELECT CODIGO, CGC, RAZAOSOCIAL, FANTASIA
           FROM PCFILIAL
          WHERE REGEXP_REPLACE(CGC, '[^0-9]', '') = :cnpj_normalizado`, {
                cnpj_normalizado: cnpj,
            });
            if (!rows.length)
                continue;
            output.set(cnpj, this.mapFilialRow(rows[0]));
        }
        return output;
    }
    async listSalesByFiliaisAndPeriod(codfiliais, dataInicio, dataFim) {
        const mapping = await this.resolvePcpedcMapping();
        const uniqueFiliais = Array.from(new Set(codfiliais.map((value) => String(value ?? "").trim()).filter((value) => value.length > 0)));
        if (uniqueFiliais.length === 0)
            return [];
        const allRows = [];
        const saleSelect = this.buildSaleSelect(mapping);
        for (const codfilial of uniqueFiliais) {
            const rows = await queryRows(`${saleSelect}
           WHERE TO_CHAR(C.${mapping.codfilial}) = :codfilial
             AND C.${mapping.data} BETWEEN :data_inicio AND :data_fim`, {
                codfilial,
                data_inicio: new Date(`${dataInicio}T00:00:00.000Z`),
                data_fim: new Date(`${dataFim}T23:59:59.999Z`),
            });
            for (const row of rows) {
                allRows.push(this.mapSaleRow(row));
            }
        }
        return allRows;
    }
    async listItemsByFiliaisAndPeriod(codfiliais, dataInicio, dataFim) {
        const mapping = await this.resolvePcpedcMapping();
        const uniqueFiliais = Array.from(new Set(codfiliais.map((value) => String(value ?? "").trim()).filter((value) => value.length > 0)));
        if (uniqueFiliais.length === 0)
            return [];
        const output = [];
        for (const codfilial of uniqueFiliais) {
            const rows = await queryRows(`SELECT
             I.NUMPED,
             C.CODFILIAL AS CODFILIAL,
             I.CODPROD,
             I.QT,
             I.PVENDA,
             I.PTABELA,
             I.VLCUSTOFIN,
             I.NUMSEQ
            FROM PCPEDI I
            JOIN PCPEDC C
              ON C.${mapping.numped} = I.NUMPED
           WHERE TO_CHAR(C.${mapping.codfilial}) = :codfilial
             AND C.${mapping.data} BETWEEN :data_inicio AND :data_fim`, {
                codfilial,
                data_inicio: new Date(`${dataInicio}T00:00:00.000Z`),
                data_fim: new Date(`${dataFim}T23:59:59.999Z`),
            });
            for (const row of rows) {
                output.push({
                    numped: row.NUMPED == null ? null : String(row.NUMPED).trim(),
                    codfilial: row.CODFILIAL == null ? null : String(row.CODFILIAL).trim(),
                    codprod: row.CODPROD == null ? null : String(row.CODPROD).trim(),
                    qt: row.QT ?? null,
                    pvenda: row.PVENDA ?? null,
                    ptabela: row.PTABELA ?? null,
                    vlcustofin: row.VLCUSTOFIN ?? null,
                    numseq: row.NUMSEQ ?? null,
                    raw: row,
                });
            }
        }
        return output;
    }
    async findSalesByDocumentAnyFilial(documento, dataInicio, dataFim) {
        const mapping = await this.resolvePcpedcMapping();
        const normalizedDocument = normalizeDoc(documento);
        if (!normalizedDocument)
            return [];
        const saleSelect = this.buildSaleSelect(mapping);
        const documentClauses = [
            `REGEXP_REPLACE(TO_CHAR(C.${mapping.numped}), '[^0-9A-Za-z]', '') = :documento`,
        ];
        if (mapping.numnota) {
            documentClauses.push(`REGEXP_REPLACE(TO_CHAR(C.${mapping.numnota}), '[^0-9A-Za-z]', '') = :documento`);
        }
        const rows = await queryRows(`${saleSelect}
         WHERE C.${mapping.data} BETWEEN :data_inicio AND :data_fim
           AND (
             ${documentClauses.join("\n             OR ")}
           )`, {
            documento: normalizedDocument,
            data_inicio: new Date(`${dataInicio}T00:00:00.000Z`),
            data_fim: new Date(`${dataFim}T23:59:59.999Z`),
        });
        return rows.map((row) => this.mapSaleRow(row));
    }
}
