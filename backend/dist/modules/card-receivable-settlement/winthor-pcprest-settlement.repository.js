import { initOraclePool, isOracleEnabled, runOracleTransaction } from "../../db/oracle.js";
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
    return String(value ?? "").replace(/\D/g, "");
}
function normalizeDoc(value) {
    return String(value ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}
function truncateText(value, maxLength) {
    return String(value ?? "").slice(0, Math.max(0, Number(maxLength ?? 0)));
}
function chunkArray(values, size) {
    const chunks = [];
    for (let index = 0; index < values.length; index += size) {
        chunks.push(values.slice(index, index + size));
    }
    return chunks;
}
function sqlStringExpr(alias, column) {
    return column ? `TO_CHAR(${alias}.${column})` : "NULL";
}
function sqlValueExpr(alias, column, fallback = "NULL") {
    return column ? `${alias}.${column}` : fallback;
}
export const CARD_SETTLEMENT_ALLOWED_CODCOB = [
    "AMRE",
    "AMEX",
    "CAR",
    "CARC",
    "CARV",
    "CARD",
    "VOUC",
    "CRS",
    "CRER",
    "DINR",
    "DCRE",
    "ELRR",
    "ELOC",
    "ELOD",
    "EDRR",
    "HIPR",
    "HIPE",
    "KER",
    "KERR",
    "MCCR",
    "MCDE",
    "MPRR",
    "MCRE",
    "MDRR",
    "MDEB",
    "VISC",
    "VISR",
    "VISD",
    "VIRR",
    "VISA",
    "VCRE",
    "VDEB",
    "VERR",
];
export class WinthorPcprestSettlementRepository {
    logger;
    constructor(logger) {
        this.logger = logger;
    }
    async ensureOracle() {
        if (!isOracleEnabled()) {
            throw new AppError("Oracle WinThor nao configurado para conciliacao financeira PCPREST.", 503);
        }
        await initOraclePool();
    }
    async resolveTableColumns(tableName) {
        await this.ensureOracle();
        const rows = await queryRows(`SELECT COLUMN_NAME
         FROM ALL_TAB_COLUMNS
        WHERE TABLE_NAME = :table_name`, { table_name: tableName.toUpperCase() });
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
    async resolvePcprestMapping() {
        const columns = await this.resolveTableColumns("PCPREST");
        const mapping = {
            codfilial: this.resolveColumn(columns, ["CODFILIAL"]),
            codcli: this.resolveColumn(columns, ["CODCLI"]),
            duplic: this.resolveColumn(columns, ["DUPLIC"]),
            prest: this.resolveColumn(columns, ["PREST"]),
            numnota: this.resolveColumn(columns, ["NUMNOTA", "NUMNOTAFISCAL"]),
            numped: this.resolveColumn(columns, ["NUMPED"]),
            dtemissao: this.resolveColumn(columns, ["DTEMISSAO", "DTEMISSAOORIG"]),
            dtvenc: this.resolveColumn(columns, ["DTVENC", "DTVENCIMENTO"]),
            dtpag: this.resolveColumn(columns, ["DTPAG", "DTPAGTO", "DTPAGAMENTO"]),
            valor: this.resolveColumn(columns, ["VALOR", "VLTOTAL", "VLORIG"]),
            valorpago: this.resolveColumn(columns, ["VALORPAGO", "VPAGO", "VLPAGO", "VLPAG", "VALOR_PAGO"]),
            codcob: this.resolveColumn(columns, ["CODCOB"]),
            codbanco: this.resolveColumn(columns, ["CODBANCO", "BANCO"]),
            numtrans: this.resolveColumn(columns, ["NUMTRANS"]),
            numtransvenda: this.resolveColumn(columns, ["NUMTRANSVENDA"]),
            codestabelecimento: this.resolveColumn(columns, ["CODESTABELECIMENTO", "CODIGOESTABELECIMENTO"]),
            nsu: this.resolveColumn(columns, ["NSU", "NSUTEF", "NSU_REDE", "NSUCARTAO", "NSU_CARTAO", "NSUHOST", "NSU_HOST"]),
            codautorizacao: this.resolveColumn(columns, ["CODAUTORIZACAO", "CODAUTORIZACAOTEF", "CODAUT", "AUTORIZACAO", "CODAUTORIZACAOCARTAO"]),
            posicao: this.resolveColumn(columns, ["POSICAO"]),
        };
        if (!mapping.codfilial || !mapping.codcli || !mapping.duplic || !mapping.prest || !mapping.dtpag || !mapping.valor) {
            throw new AppError("PCPREST sem colunas minimas para conciliacao financeira (CODFILIAL, CODCLI, DUPLIC, PREST, DTPAG, VALOR).", 500);
        }
        return mapping;
    }
    buildPaymentSelect(mapping) {
        return `SELECT
             ${sqlStringExpr("P", mapping.codfilial)} AS CODFILIAL,
             ${sqlStringExpr("P", mapping.codcli)} AS CODCLI,
             C.CLIENTE AS CLIENTE,
             C.CGCENT AS DOCUMENTO_CLIENTE,
             ${sqlStringExpr("P", mapping.duplic)} AS DUPLIC,
             ${sqlStringExpr("P", mapping.prest)} AS PREST,
             ${sqlStringExpr("P", mapping.numnota)} AS NUMNOTA,
             ${sqlStringExpr("P", mapping.numped)} AS NUMPED,
             ${sqlValueExpr("P", mapping.dtemissao)} AS DTEMISSAO,
             ${sqlValueExpr("P", mapping.dtvenc)} AS DTVENC,
             ${sqlValueExpr("P", mapping.dtpag)} AS DTPAG,
             NVL(${sqlValueExpr("P", mapping.valor, "0")}, 0) AS VALOR_ORIGINAL,
             NVL(${sqlValueExpr("P", mapping.valorpago, "0")}, 0) AS VALOR_PAGO,
             (NVL(${sqlValueExpr("P", mapping.valor, "0")}, 0) - NVL(${sqlValueExpr("P", mapping.valorpago, "0")}, 0)) AS VALOR_ABERTO,
             ${sqlStringExpr("P", mapping.codcob)} AS CODCOB,
             COB.COBRANCA AS COBRANCA,
             ${sqlStringExpr("P", mapping.codbanco)} AS CODBANCO,
             ${sqlStringExpr("P", mapping.numtrans)} AS NUMTRANS,
             ${sqlStringExpr("P", mapping.numtransvenda)} AS NUMTRANSVENDA,
             ${sqlStringExpr("P", mapping.codestabelecimento)} AS CODESTABELECIMENTO,
             ${sqlStringExpr("P", mapping.nsu)} AS NSU,
             ${sqlStringExpr("P", mapping.codautorizacao)} AS CODAUTORIZACAO,
             ${mapping.posicao ? `UPPER(TRIM(TO_CHAR(P.${mapping.posicao})))` : `'?'`} AS POSICAO,
             CASE
               WHEN ${mapping.posicao ? `UPPER(TRIM(TO_CHAR(P.${mapping.posicao})))` : `'?'`} = 'F' THEN 'PAGO'
               WHEN ${mapping.posicao ? `UPPER(TRIM(TO_CHAR(P.${mapping.posicao})))` : `'?'`} = 'C' THEN 'CANCELADO'
               WHEN P.${mapping.dtpag} IS NULL THEN 'EM_ABERTO'
               WHEN NVL(${sqlValueExpr("P", mapping.valorpago, "0")}, 0) = 0 THEN 'EM_ABERTO'
               WHEN NVL(${sqlValueExpr("P", mapping.valorpago, "0")}, 0) < NVL(${sqlValueExpr("P", mapping.valor, "0")}, 0) THEN 'PAGO_PARCIAL'
               ELSE 'PAGO'
             END AS STATUS_TITULO
            FROM PCPREST P
            LEFT JOIN PCCLIENT C ON C.CODCLI = P.${mapping.codcli}
            LEFT JOIN PCCOB COB ON ${mapping.codcob ? `COB.CODCOB = P.${mapping.codcob}` : "1 = 0"}`;
    }
    buildAllowedCodcobWhere(mapping, binds) {
        if (!mapping.codcob) {
            throw new AppError("PCPREST sem coluna CODCOB para filtrar cobrancas de recebiveis cartao.", 500);
        }
        const placeholders = CARD_SETTLEMENT_ALLOWED_CODCOB.map((codcob, index) => {
            const bindName = `codcob_${index}`;
            binds[bindName] = codcob;
            return `:${bindName}`;
        });
        return `AND UPPER(TRIM(TO_CHAR(P.${mapping.codcob}))) IN (${placeholders.join(", ")})`;
    }
    mapFilialRow(row) {
        return {
            codigo: String(row.CODIGO ?? "").trim(),
            cgc: String(row.CGC ?? "").trim(),
            razaoSocial: String(row.RAZAOSOCIAL ?? "").trim(),
            fantasia: String(row.FANTASIA ?? "").trim(),
        };
    }
    mapPaymentRow(row) {
        const codfilial = String(row.CODFILIAL ?? "").trim();
        const duplic = String(row.DUPLIC ?? "").trim();
        const prest = String(row.PREST ?? "").trim();
        return {
            id: ["PCPREST", codfilial, duplic, prest, String(row.NUMTRANS ?? row.NUMTRANSVENDA ?? "")].join("-"),
            codfilial,
            codcli: row.CODCLI == null ? null : String(row.CODCLI).trim(),
            cliente: row.CLIENTE == null ? null : String(row.CLIENTE).trim(),
            documentoCliente: row.DOCUMENTO_CLIENTE == null ? null : String(row.DOCUMENTO_CLIENTE).trim(),
            duplic,
            prest,
            numnota: row.NUMNOTA == null ? null : String(row.NUMNOTA).trim(),
            numped: row.NUMPED == null ? null : String(row.NUMPED).trim(),
            dtemissao: toIsoDate(row.DTEMISSAO),
            dtvenc: toIsoDate(row.DTVENC),
            dtpag: toIsoDate(row.DTPAG),
            valorOriginal: Number(Number(row.VALOR_ORIGINAL ?? 0).toFixed(2)),
            valorPago: Number(Number(row.VALOR_PAGO ?? 0).toFixed(2)),
            valorAberto: Number(Number(row.VALOR_ABERTO ?? 0).toFixed(2)),
            codcob: row.CODCOB == null ? null : String(row.CODCOB).trim(),
            cobranca: row.COBRANCA == null ? null : String(row.COBRANCA).trim(),
            codbanco: row.CODBANCO == null ? null : String(row.CODBANCO).trim(),
            numtrans: row.NUMTRANS == null ? null : String(row.NUMTRANS).trim(),
            numtransvenda: row.NUMTRANSVENDA == null ? null : String(row.NUMTRANSVENDA).trim(),
            codestabelecimento: row.CODESTABELECIMENTO == null ? null : String(row.CODESTABELECIMENTO).trim(),
            nsu: row.NSU == null ? null : String(row.NSU).trim(),
            codautorizacao: row.CODAUTORIZACAO == null ? null : String(row.CODAUTORIZACAO).trim(),
            posicao: (row.POSICAO == null || String(row.POSICAO).trim() === "?") ? null : String(row.POSICAO).trim(),
            statusTitulo: row.STATUS_TITULO == null ? null : String(row.STATUS_TITULO).trim(),
            raw: row,
        };
    }
    async findFiliaisByCnpjs(cnpjs) {
        await this.ensureOracle();
        const uniqueCnpjs = Array.from(new Set(cnpjs.map((value) => normalizeDigits(value)).filter((value) => value.length === 14)));
        const output = new Map();
        for (const cnpj of uniqueCnpjs) {
            const rows = await queryRows(`SELECT CODIGO, CGC, RAZAOSOCIAL, FANTASIA
           FROM PCFILIAL
          WHERE REGEXP_REPLACE(CGC, '[^0-9]', '') = :cnpj_normalizado`, {
                cnpj_normalizado: cnpj,
            });
            if (rows.length > 0)
                output.set(cnpj, this.mapFilialRow(rows[0]));
        }
        return output;
    }
    async listPaidByFiliaisAndPeriod(codfiliais, dataInicio, dataFim) {
        const mapping = await this.resolvePcprestMapping();
        const select = this.buildPaymentSelect(mapping);
        const uniqueFiliais = Array.from(new Set((codfiliais ?? []).map((value) => String(value ?? "").trim()).filter(Boolean)));
        const output = [];
        const runQuery = async (extraWhere, binds) => {
            const codcobWhere = this.buildAllowedCodcobWhere(mapping, binds);
            const rows = await queryRows(`${select}
             WHERE P.${mapping.dtpag} BETWEEN :data_inicio AND :data_fim
               ${codcobWhere}
               ${extraWhere}
             ORDER BY P.${mapping.dtpag}, P.${mapping.codfilial}, P.${mapping.numnota ?? mapping.duplic}, P.${mapping.prest}`, binds);
            output.push(...rows.map((row) => this.mapPaymentRow(row)));
        };
        const baseBinds = {
            data_inicio: new Date(`${dataInicio}T00:00:00.000Z`),
            data_fim: new Date(`${dataFim}T23:59:59.999Z`),
        };
        if (uniqueFiliais.length === 0) {
            await runQuery("", baseBinds);
            return output;
        }
        for (const codfilial of uniqueFiliais) {
            await runQuery(`AND TO_CHAR(P.${mapping.codfilial}) = :codfilial`, {
                ...baseBinds,
                codfilial,
            });
        }
        return output;
    }
    async findPaymentsByNsutef(nsus) {
        const normalizedNsus = Array.from(new Set((nsus ?? []).map((value) => normalizeDoc(value)).filter(Boolean)));
        if (normalizedNsus.length === 0)
            return [];
        const mapping = await this.resolvePcprestMapping();
        if (!mapping.nsu)
            return [];
        const select = this.buildPaymentSelect(mapping);
        const output = [];
        for (const nsuChunk of chunkArray(normalizedNsus, 500)) {
            const binds = {};
            const placeholders = nsuChunk.map((nsu, index) => {
                const bindName = `nsu_${index}`;
                binds[bindName] = nsu;
                return `:${bindName}`;
            });
            const codcobWhere = this.buildAllowedCodcobWhere(mapping, binds);
            const rows = await queryRows(`${select}
             WHERE REGEXP_REPLACE(TO_CHAR(P.${mapping.nsu}), '[^0-9A-Za-z]', '') IN (${placeholders.join(", ")})
               ${codcobWhere}
             ORDER BY P.${mapping.codfilial}, P.${mapping.dtpag}, P.${mapping.numnota ?? mapping.duplic}, P.${mapping.prest}`, binds);
            output.push(...rows.map((row) => this.mapPaymentRow(row)));
        }
        return output;
    }
    async findPaymentsByDocumentAnyBank(documento, dataInicio, dataFim) {
        const normalizedDocument = normalizeDoc(documento);
        if (!normalizedDocument)
            return [];
        const mapping = await this.resolvePcprestMapping();
        const select = this.buildPaymentSelect(mapping);
        const documentClauses = [
            `REGEXP_REPLACE(TO_CHAR(P.${mapping.duplic}), '[^0-9A-Za-z]', '') = :documento`,
            `REGEXP_REPLACE(TO_CHAR(P.${mapping.prest}), '[^0-9A-Za-z]', '') = :documento`,
        ];
        for (const column of [mapping.numnota, mapping.numped, mapping.numtrans, mapping.numtransvenda].filter(Boolean)) {
            documentClauses.push(`REGEXP_REPLACE(TO_CHAR(P.${column}), '[^0-9A-Za-z]', '') = :documento`);
        }
        const binds = {
            documento: normalizedDocument,
            data_inicio: new Date(`${dataInicio}T00:00:00.000Z`),
            data_fim: new Date(`${dataFim}T23:59:59.999Z`),
        };
        const codcobWhere = this.buildAllowedCodcobWhere(mapping, binds);
        const rows = await queryRows(`${select}
           WHERE P.${mapping.dtpag} BETWEEN :data_inicio AND :data_fim
             ${codcobWhere}
             AND (${documentClauses.join(" OR ")})`, binds);
        return rows.map((row) => this.mapPaymentRow(row));
    }
    async settleTitlePayment(input) {
        await this.ensureOracle();
        const mapping = await this.resolvePcprestMapping();
        if (!mapping.valorpago) {
            throw new AppError("PCPREST sem coluna de valor pago (VPAGO/VALORPAGO) para baixa automatica.", 500);
        }
        const columns = await this.resolveTableColumns("PCPREST");
        const optionalColumns = {
            dtbaixa: this.resolveColumn(columns, ["DTBAIXA"]),
            codbancobaixa: this.resolveColumn(columns, ["CODBANCOBAIXA"]),
            rotinapag: this.resolveColumn(columns, ["ROTINAPAG"]),
            dtultalter: this.resolveColumn(columns, ["DTULTALTER"]),
            obs2: this.resolveColumn(columns, ["OBS2"]),
        };
        const codcli = Number(input.codcli);
        const duplicata = String(input.duplicata ?? "").trim();
        const prestacao = String(input.prestacao ?? "").trim();
        const valorPagoInput = Number(input.valorPago ?? 0);
        const txid = truncateText(input.txid ?? "", 64);
        const endToEndId = truncateText(input.endToEndId ?? "", 64);
        if (!Number.isFinite(codcli) || codcli <= 0) {
            throw new AppError("CODCLI invalido para baixa automatica.", 400);
        }
        if (!duplicata) {
            throw new AppError("Duplicata obrigatoria para baixa automatica.", 400);
        }
        if (!Number.isFinite(valorPagoInput) || valorPagoInput <= 0) {
            throw new AppError("Valor pago invalido para baixa automatica.", 400);
        }
        const dtpagIso = toIsoDate(input.dtpag) ?? new Date().toISOString().slice(0, 10);
        return runOracleTransaction(async (connection, oracledb) => {
            const proxResult = await connection.execute(`SELECT PROXNUMLANC FROM PCCONSUM FOR UPDATE NOWAIT`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
            const proxRow = proxResult.rows?.[0] ?? {};
            const numLanc = Number(proxRow.PROXNUMLANC ?? proxRow.proxnumlanc ?? 0);
            if (!Number.isFinite(numLanc) || numLanc <= 0) {
                throw new AppError("PCCONSUM.PROXNUMLANC invalido para baixa automatica.", 500);
            }
            await connection.execute(`UPDATE PCCONSUM SET PROXNUMLANC = PROXNUMLANC + 1`);
            const titleBinds = {
                codcli,
                duplicata,
            };
            const titleWhere = [
                `P.${mapping.codcli} = :codcli`,
                `TRIM(TO_CHAR(P.${mapping.duplic})) = TRIM(:duplicata)`,
                `P.${mapping.dtpag} IS NULL`,
            ];
            if (prestacao) {
                titleWhere.push(`TRIM(TO_CHAR(P.${mapping.prest})) = TRIM(:prestacao)`);
                titleBinds.prestacao = prestacao;
            }
            const titleSql = `SELECT
                NVL(${sqlValueExpr("P", mapping.numtransvenda, "0")}, 0) AS NUMTRANSVENDA,
                NVL(TRIM(TO_CHAR(${sqlValueExpr("P", mapping.codcob, "NULL")})), 'D') AS CODCOB,
                TRIM(TO_CHAR(P.${mapping.prest})) AS PREST,
                NVL(${sqlValueExpr("P", mapping.valor, "0")}, 0) - NVL(${sqlValueExpr("P", mapping.valorpago, "0")}, 0) AS SALDO_ABERTO,
                ${mapping.codbanco ? `TO_NUMBER(NVL(TRIM(TO_CHAR(P.${mapping.codbanco})), '0'))` : `0`} AS CODBANCO_PREST,
                ${mapping.numped ? `TRIM(TO_CHAR(P.${mapping.numped}))` : `NULL`} AS NUMPED_PREST
              FROM PCPREST P
             WHERE ${titleWhere.join("\n               AND ")}
             ${prestacao ? "" : "FETCH FIRST 1 ROW ONLY"}`;
            const titleResult = await connection.execute(titleSql, titleBinds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
            const titleRow = titleResult.rows?.[0];
            if (!titleRow) {
                throw new AppError("Titulo nao encontrado ou ja baixado (DTPAG preenchida).", 409);
            }
            const numtransvenda = Number(titleRow.NUMTRANSVENDA ?? 0);
            const codcob = String(titleRow.CODCOB ?? "D").trim() || "D";
            const prestEncontrada = String(titleRow.PREST ?? prestacao ?? "").trim();
            const saldoAberto = Number(titleRow.SALDO_ABERTO ?? 0);
            const valorBaixa = Number((saldoAberto > 0 ? saldoAberto : valorPagoInput).toFixed(2));
            if (!Number.isFinite(valorBaixa) || valorBaixa <= 0) {
                throw new AppError("Saldo/valor invalido para baixa automatica.", 400);
            }
            const numpedPrest = String(titleRow.NUMPED_PREST ?? "").trim() || null;
            let resolvedCodbanco = Number(titleRow.CODBANCO_PREST ?? 0);
            if (!resolvedCodbanco || resolvedCodbanco <= 0) {
                const bankResult = await connection.execute(`SELECT CODBANCO FROM (SELECT CODBANCO FROM PCMOVCR WHERE CODCOB = :codcob AND CODBANCO IS NOT NULL AND CODBANCO > 0 ORDER BY NUMTRANS DESC) WHERE ROWNUM = 1`, { codcob }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
                resolvedCodbanco = Number(bankResult.rows?.[0]?.CODBANCO ?? 0);
            }
            if (!resolvedCodbanco || resolvedCodbanco <= 0)
                resolvedCodbanco = 1007;
            const saldoResult = await connection.execute(`SELECT NVL(VLSALDO, 0) AS VLSALDO FROM (SELECT VLSALDO FROM PCMOVCR WHERE CODBANCO = :codbanco ORDER BY NUMTRANS DESC) WHERE ROWNUM = 1`, { codbanco: resolvedCodbanco }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
            const saldoAtual = Number(saldoResult.rows?.[0]?.VLSALDO ?? 0);
            const novoSaldo = Number((saldoAtual + valorBaixa).toFixed(2));
            const now = new Date();
            const hora = now.getHours();
            const minuto = now.getMinutes();
            const historico = truncateText(`BAIXA CARTAO AUTO TRANSACAO ${numtransvenda || 0} PREST:${prestEncontrada || "-"}`, 200);
            await connection.execute(`INSERT INTO PCMOVCR (
              NUMTRANS, DATA, CODBANCO, CODCOB, VALOR,
              TIPO, HISTORICO, NUMCARR, VLSALDO,
              HORA, MINUTO, CODFUNC, INDICE,
              DATACOMPLETA, CODROTINALANC
            ) VALUES (
              :numtrans, TRUNC(SYSDATE), :codbanco, :codcob, :valor,
              'D', :historico, :numcarr, :vlsaldo,
              :hora, :minuto, 309, 'A',
              SYSDATE, 9850
            )`, {
                numtrans: numLanc,
                codbanco: resolvedCodbanco,
                codcob,
                valor: valorBaixa,
                historico,
                numcarr: numtransvenda || null,
                vlsaldo: novoSaldo,
                hora,
                minuto,
            });
            const obs2 = truncateText(`CARTAO-AUTO TXID:${truncateText(txid, 30)} E2E:${truncateText(endToEndId, 30)}`, 80);
            const updateParts = [
                `${mapping.dtpag} = TO_DATE(:dtpag, 'YYYY-MM-DD')`,
                `${mapping.valorpago} = :vpago`,
            ];
            if (mapping.numtrans)
                updateParts.push(`${mapping.numtrans} = :numtrans`);
            if (optionalColumns.dtbaixa)
                updateParts.push(`${optionalColumns.dtbaixa} = TO_DATE(:dtpag, 'YYYY-MM-DD')`);
            if (optionalColumns.codbancobaixa)
                updateParts.push(`${optionalColumns.codbancobaixa} = :codbancobaixa`);
            if (optionalColumns.rotinapag)
                updateParts.push(`${optionalColumns.rotinapag} = NULL`);
            if (optionalColumns.dtultalter)
                updateParts.push(`${optionalColumns.dtultalter} = SYSDATE`);
            if (optionalColumns.obs2)
                updateParts.push(`${optionalColumns.obs2} = :obs2`);
            const updateBinds = {
                codcli,
                duplicata,
                prestacao: prestEncontrada || prestacao,
                dtpag: dtpagIso,
                vpago: valorBaixa,
                numtrans: numLanc,
                obs2,
                codbancobaixa: resolvedCodbanco,
            };
            const updateResult = await connection.execute(`UPDATE PCPREST
               SET ${updateParts.join(",\n                   ")}
             WHERE ${mapping.codcli} = :codcli
               AND TRIM(TO_CHAR(${mapping.duplic})) = TRIM(:duplicata)
               AND TRIM(TO_CHAR(${mapping.prest})) = TRIM(:prestacao)
               AND ${mapping.dtpag} IS NULL`, updateBinds);
            if (Number(updateResult.rowsAffected ?? 0) === 0) {
                throw new AppError("Titulo ja baixado ou nao encontrado durante atualizacao PCPREST.", 409);
            }
            if (numpedPrest) {
                try {
                    await connection.execute(`UPDATE RC_RECEBIVEL_CARTAO_PREV SET STATUS = 'BAIXADO', DT_ULTALTER = SYSDATE
                        WHERE CODCLI = :codcli AND CODCOB = :codcob AND NUMPED = :numped
                          AND REGEXP_LIKE(TRIM(TO_CHAR(PARCELA)), '^[0-9]+$')
                          AND TO_NUMBER(TRIM(TO_CHAR(PARCELA))) = TO_NUMBER(TRIM(:prest))
                          AND STATUS NOT IN ('BAIXADO', 'CONCILIADO')`, { codcli, codcob, numped: numpedPrest, prest: prestEncontrada || prestacao });
                }
                catch (prevErr) {
                    this.logger?.warn?.({ prevErr, codcli, numped: numpedPrest }, "RC_RECEBIVEL_CARTAO_PREV STATUS update falhou; WinThor baixa PCPREST executada com sucesso.");
                }
            }
            return {
                numLanc,
                codcli,
                duplicata,
                prestacao: prestEncontrada || prestacao,
                valorBaixa,
                saldoAnterior: saldoAtual,
                saldoAtualizado: novoSaldo,
                numtransvenda: numtransvenda || null,
                dtpag: dtpagIso,
                codbanco: resolvedCodbanco,
                codcob,
                numped: numpedPrest,
            };
        });
    }
}
