import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { env, hasOracleConfig } from "../../config/env.js";
import { initOraclePool } from "../../db/oracle.js";
import { execDml, queryRows } from "../../repositories/baseRepository.js";
import { AppError } from "../../utils/error.js";
const CARD_COBRANCA_SCHEMA = z.object({
    codcob: z.string().trim().min(1).max(4),
    descricaoCobranca: z.string().trim().min(1).max(120),
    tipoCartao: z.enum(["CREDITO", "DEBITO", "PARCELADO", "POS_TEF", "OUTROS"]).default("OUTROS"),
    ativo: z.coerce.boolean().default(true),
    adquirentePadrao: z.string().trim().max(80).optional(),
    bandeiraPadrao: z.string().trim().max(60).optional(),
    taxaPctPadrao: z.coerce.number().min(0).max(100).optional(),
    diasRecPadrao: z.coerce.number().int().min(0).max(365).optional(),
});
const PLAN_CONFIG_SCHEMA = z.object({
    codplpag: z.coerce.number().int().min(0).max(9999),
    descricaoPlano: z.string().trim().min(1).max(120),
    qtdParcelas: z.coerce.number().int().min(1).max(36),
    diasPrimParc: z.coerce.number().int().min(0).max(365),
    intervaloDias: z.coerce.number().int().min(0).max(365),
    taxaPctPadrao: z.coerce.number().min(0).max(100).optional(),
    ativo: z.coerce.boolean().default(true),
});
function toIso(value) {
    if (!value)
        return null;
    const parsed = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(parsed.getTime()))
        return null;
    return parsed.toISOString();
}
function toDate(value) {
    if (!value)
        return null;
    const parsed = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(parsed.getTime()))
        return null;
    return parsed;
}
function normalizeDate(input) {
    return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate(), 0, 0, 0, 0));
}
function addDays(base, days) {
    const normalized = normalizeDate(base);
    return new Date(normalized.getTime() + days * 24 * 60 * 60 * 1000);
}
function round2(value) {
    return Number(value.toFixed(2));
}
function toNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function toInt(value) {
    if (typeof value !== "number" || !Number.isFinite(value))
        return null;
    return Math.trunc(value);
}
function countNonNullPositive(values) {
    return values.filter((value) => typeof value === "number" && value > 0).length;
}
function nonNullPositive(values) {
    return values.filter((value) => typeof value === "number" && value > 0);
}
function splitAmount(total, parcels) {
    const safeParcels = Math.max(1, Math.trunc(parcels));
    const totalCents = Math.round(total * 100);
    const signal = totalCents < 0 ? -1 : 1;
    const absTotalCents = Math.abs(totalCents);
    const base = Math.floor(absTotalCents / safeParcels);
    const remainder = absTotalCents % safeParcels;
    return Array.from({ length: safeParcels }, (_, index) => {
        const cents = base + (index < remainder ? 1 : 0);
        return round2((cents * signal) / 100);
    });
}
function inferTipoCartao(descricao, tipoOperacaoTef) {
    const text = descricao.toUpperCase();
    if (text.includes("TEF") || text.includes("POS"))
        return "POS_TEF";
    if (text.includes("DEBIT"))
        return "DEBITO";
    if (text.includes("PARCEL"))
        return "PARCELADO";
    if (text.includes("CRED"))
        return "CREDITO";
    if (tipoOperacaoTef === "01")
        return "DEBITO";
    if (tipoOperacaoTef === "02")
        return "CREDITO";
    return "OUTROS";
}
function nowIso() {
    return new Date().toISOString();
}
export class WinthorCardReceivablesService {
    logger;
    constructor(logger) {
        this.logger = logger;
    }
    getSalesCacheFilePath() {
        return path.resolve(process.cwd(), "tmp", "winthor-card-sales-cache.json");
    }
    mapSalesRows(rows) {
        return rows.map((row) => ({
            codfilial: row.CODFILIAL,
            nomeFilial: row.NOME_FILIAL,
            numped: row.NUMPED,
            dataVenda: toIso(row.DATA_VENDA),
            codcli: row.CODCLI,
            codcob: row.CODCOB,
            descricaoCobranca: row.DESCRICAO_COBRANCA,
            codplpag: row.CODPLPAG,
            descricaoPlpag: row.DESCRICAO_PLPAG,
            valorPedido: row.VALOR_PEDIDO,
            valorItens: row.VALOR_ITENS,
            posicaoCabecalho: row.POSICAO_CABECALHO,
            posicaoItem: row.POSICAO_ITEM,
            indDivergenciaValor: row.IND_DIVERGENCIA_VALOR === 1,
            nsu: row.NSU,
            codAutorizacao: row.CODAUTORIZACAO,
        }));
    }
    async persistSalesCache(rows) {
        try {
            const filePath = this.getSalesCacheFilePath();
            await mkdir(path.dirname(filePath), { recursive: true });
            await writeFile(filePath, JSON.stringify({
                savedAt: nowIso(),
                total: rows.length,
                rows,
            }, null, 2), "utf8");
        }
        catch (error) {
            this.logger.warn({ component: "WinthorCardReceivablesService", action: "persistSalesCache", error }, "Nao foi possivel salvar cache local de vendas WinThor.");
        }
    }
    async loadSalesCache(dataInicio, dataFim) {
        try {
            const filePath = this.getSalesCacheFilePath();
            const raw = await readFile(filePath, "utf8");
            const parsed = JSON.parse(raw);
            const rows = Array.isArray(parsed.rows) ? parsed.rows : [];
            return rows.filter((row) => {
                if (!row.dataVenda)
                    return false;
                const day = row.dataVenda.slice(0, 10);
                return day >= dataInicio && day <= dataFim;
            });
        }
        catch {
            return [];
        }
    }
    async ensurePool() {
        if (!hasOracleConfig()) {
            throw new AppError("Oracle WinThor nao configurado. Verifique ORACLE_USER/ORACLE_PASSWORD/ORACLE_CONNECT_STRING.", 503);
        }
        await initOraclePool();
    }
    async resolveItemTable() {
        await this.ensurePool();
        try {
            await queryRows("SELECT 1 AS ID FROM PCPEDI WHERE ROWNUM <= 1");
            return "PCPEDI";
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!message.includes("ORA-00942"))
                throw error;
        }
        try {
            await queryRows("SELECT 1 AS ID FROM PEPEDI WHERE ROWNUM <= 1");
            return "PEPEDI";
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes("ORA-00942")) {
                throw new AppError("Nem PCPEDI nem PEPEDI foram encontrados no schema Oracle atual.", 500);
            }
            throw error;
        }
    }
    async inspectSchema() {
        await this.ensurePool();
        const tables = ["PCCOB", "PCPEDC", "PCFILIAL", "PCPLPAG", "PCPEDI", "PEPEDI"];
        const tableBinds = Object.fromEntries(tables.map((table, index) => [`t${index}`, table]));
        const columns = await queryRows(`SELECT OWNER, TABLE_NAME, COLUMN_ID, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE, NULLABLE
         FROM ALL_TAB_COLUMNS
        WHERE TABLE_NAME IN (${tables.map((_, index) => `:t${index}`).join(",")})
        ORDER BY OWNER, TABLE_NAME, COLUMN_ID`, tableBinds);
        const pk = await queryRows(`SELECT ACC.OWNER, ACC.TABLE_NAME, ACC.COLUMN_NAME, ACC.CONSTRAINT_NAME, ACC.POSITION
         FROM ALL_CONS_COLUMNS ACC
         JOIN ALL_CONSTRAINTS AC
           ON AC.OWNER = ACC.OWNER
          AND AC.CONSTRAINT_NAME = ACC.CONSTRAINT_NAME
        WHERE AC.CONSTRAINT_TYPE = 'P'
          AND ACC.TABLE_NAME IN (${tables.map((_, index) => `:t${index}`).join(",")})
        ORDER BY ACC.OWNER, ACC.TABLE_NAME, ACC.POSITION`, tableBinds);
        const resolvedItemTable = await this.resolveItemTable();
        const substitutions = {
            PEPEDI: resolvedItemTable === "PCPEDI" ? "Tabela equivalente encontrada: PCPEDI." : "Tabela encontrada com o nome original PEPEDI.",
            PCPEDI_CODFILIAL: "Nao encontrado em PCPEDI. Substituir por PCPEDC.CODFILIAL via join por NUMPED.",
            PCPEDI_CODCOB: "Nao encontrado em PCPEDI. Substituir por PCPEDC.CODCOB no cabecalho.",
            PCPEDI_NUMNOTA: "Nao encontrado em PCPEDI. Substituir por PCPEDC.NUMNOTA no cabecalho.",
            PCFILIAL_STATUS: "Campo STATUS/ATIVO nao encontrado em PCFILIAL. Usar regra operacional externa para filial ativa/inativa.",
            PCCOB_STATUS: "Campo STATUS/ATIVO nao encontrado em PCCOB. Usar filtro funcional por mapeamento da tabela de configuracao RC_CFG_COBRANCA_CARTAO.",
        };
        const grouped = {};
        for (const row of columns) {
            const key = `${row.OWNER}.${row.TABLE_NAME}`;
            grouped[key] = grouped[key] ?? [];
            grouped[key].push({
                columnId: row.COLUMN_ID,
                column: row.COLUMN_NAME,
                dataType: row.DATA_TYPE,
                dataLength: row.DATA_LENGTH,
                dataPrecision: row.DATA_PRECISION,
                dataScale: row.DATA_SCALE,
                nullable: row.NULLABLE === "Y",
            });
        }
        return {
            inspectedAt: nowIso(),
            oracleUser: env.ORACLE_USER,
            resolvedItemTable,
            tables: grouped,
            primaryKeys: pk,
            substitutions,
        };
    }
    async listCobrancaConfig() {
        await this.ensurePool();
        const rows = await queryRows(`SELECT CODCOB, DESCRICAO_COBRANCA, TIPO_CARTAO, ATIVO, ADQUIRENTE_PADRAO, BANDEIRA_PADRAO, TAXA_PCT_PADRAO, DIAS_REC_PADRAO, ORIGEM_MAPEAMENTO, DT_CADASTRO, DT_ULTALTER
         FROM RC_CFG_COBRANCA_CARTAO
        ORDER BY CODCOB`);
        return rows.map((row) => ({
            codcob: row.CODCOB,
            descricaoCobranca: row.DESCRICAO_COBRANCA,
            tipoCartao: row.TIPO_CARTAO,
            ativo: row.ATIVO === 1,
            adquirentePadrao: row.ADQUIRENTE_PADRAO ?? null,
            bandeiraPadrao: row.BANDEIRA_PADRAO ?? null,
            taxaPctPadrao: row.TAXA_PCT_PADRAO ?? null,
            diasRecPadrao: row.DIAS_REC_PADRAO ?? null,
            origemMapeamento: row.ORIGEM_MAPEAMENTO ?? null,
            dtCadastro: toIso(row.DT_CADASTRO),
            dtUltAlter: toIso(row.DT_ULTALTER),
        }));
    }
    async upsertCobrancaConfig(input) {
        await this.ensurePool();
        const payload = CARD_COBRANCA_SCHEMA.parse(input);
        await execDml(`MERGE INTO RC_CFG_COBRANCA_CARTAO T
       USING (
         SELECT
           :codcob AS CODCOB,
           :descricao AS DESCRICAO_COBRANCA,
           :tipo AS TIPO_CARTAO,
           :ativo AS ATIVO,
           :adquirente AS ADQUIRENTE_PADRAO,
           :bandeira AS BANDEIRA_PADRAO,
           :taxa AS TAXA_PCT_PADRAO,
           :dias AS DIAS_REC_PADRAO
         FROM DUAL
       ) S
          ON (T.CODCOB = S.CODCOB)
       WHEN MATCHED THEN UPDATE SET
         T.DESCRICAO_COBRANCA = S.DESCRICAO_COBRANCA,
         T.TIPO_CARTAO = S.TIPO_CARTAO,
         T.ATIVO = S.ATIVO,
         T.ADQUIRENTE_PADRAO = S.ADQUIRENTE_PADRAO,
         T.BANDEIRA_PADRAO = S.BANDEIRA_PADRAO,
         T.TAXA_PCT_PADRAO = S.TAXA_PCT_PADRAO,
         T.DIAS_REC_PADRAO = S.DIAS_REC_PADRAO,
         T.ORIGEM_MAPEAMENTO = 'MANUAL',
         T.DT_ULTALTER = SYSDATE
       WHEN NOT MATCHED THEN INSERT (
         CODCOB, DESCRICAO_COBRANCA, TIPO_CARTAO, ATIVO, ADQUIRENTE_PADRAO, BANDEIRA_PADRAO, TAXA_PCT_PADRAO, DIAS_REC_PADRAO, ORIGEM_MAPEAMENTO, DT_CADASTRO, DT_ULTALTER
       ) VALUES (
         S.CODCOB, S.DESCRICAO_COBRANCA, S.TIPO_CARTAO, S.ATIVO, S.ADQUIRENTE_PADRAO, S.BANDEIRA_PADRAO, S.TAXA_PCT_PADRAO, S.DIAS_REC_PADRAO, 'MANUAL', SYSDATE, SYSDATE
       )`, {
            codcob: payload.codcob.toUpperCase(),
            descricao: payload.descricaoCobranca,
            tipo: payload.tipoCartao,
            ativo: payload.ativo ? 1 : 0,
            adquirente: payload.adquirentePadrao ?? null,
            bandeira: payload.bandeiraPadrao ?? null,
            taxa: payload.taxaPctPadrao ?? null,
            dias: payload.diasRecPadrao ?? null,
        });
        return { ok: true, codcob: payload.codcob.toUpperCase() };
    }
    async bootstrapCobrancaConfig() {
        await this.ensurePool();
        const sourceRows = await queryRows(`SELECT CODCOB, COBRANCA, CODOPERADORACARTAO, CODBANDEIRA, BANDEIRACARTAO, TIPOOPERACAOTEF, CARTAO
         FROM PCCOB
        WHERE NVL(CARTAO, 'N') = 'S'
           OR UPPER(COBRANCA) LIKE '%CART%'
           OR UPPER(COBRANCA) LIKE '%DEBIT%'
           OR UPPER(COBRANCA) LIKE '%CREDIT%'
           OR UPPER(COBRANCA) LIKE '%TEF%'`);
        let upserts = 0;
        for (const row of sourceRows) {
            await execDml(`MERGE INTO RC_CFG_COBRANCA_CARTAO T
         USING (
           SELECT
             :codcob AS CODCOB,
             :descricao AS DESCRICAO_COBRANCA,
             :tipo AS TIPO_CARTAO,
             :adquirente AS ADQUIRENTE_PADRAO,
             :bandeira AS BANDEIRA_PADRAO
           FROM DUAL
         ) S
            ON (T.CODCOB = S.CODCOB)
         WHEN MATCHED THEN UPDATE SET
           T.DESCRICAO_COBRANCA = S.DESCRICAO_COBRANCA,
           T.TIPO_CARTAO = S.TIPO_CARTAO,
           T.ADQUIRENTE_PADRAO = COALESCE(T.ADQUIRENTE_PADRAO, S.ADQUIRENTE_PADRAO),
           T.BANDEIRA_PADRAO = COALESCE(T.BANDEIRA_PADRAO, S.BANDEIRA_PADRAO),
           T.ATIVO = 1,
           T.ORIGEM_MAPEAMENTO = CASE WHEN T.ORIGEM_MAPEAMENTO = 'MANUAL' THEN T.ORIGEM_MAPEAMENTO ELSE 'AUTO_PCCOB' END,
           T.DT_ULTALTER = SYSDATE
         WHEN NOT MATCHED THEN INSERT (
           CODCOB, DESCRICAO_COBRANCA, TIPO_CARTAO, ATIVO, ADQUIRENTE_PADRAO, BANDEIRA_PADRAO, ORIGEM_MAPEAMENTO, DT_CADASTRO, DT_ULTALTER
         ) VALUES (
           S.CODCOB, S.DESCRICAO_COBRANCA, S.TIPO_CARTAO, 1, S.ADQUIRENTE_PADRAO, S.BANDEIRA_PADRAO, 'AUTO_PCCOB', SYSDATE, SYSDATE
         )`, {
                codcob: row.CODCOB,
                descricao: row.COBRANCA,
                tipo: inferTipoCartao(row.COBRANCA, row.TIPOOPERACAOTEF),
                adquirente: row.CODOPERADORACARTAO != null ? String(row.CODOPERADORACARTAO) : null,
                bandeira: row.BANDEIRACARTAO != null ? String(row.BANDEIRACARTAO) : row.CODBANDEIRA != null ? String(row.CODBANDEIRA) : null,
            });
            upserts += 1;
        }
        return {
            ok: true,
            analisadas: sourceRows.length,
            upserts,
        };
    }
    async listPlanConfig() {
        await this.ensurePool();
        const rows = await queryRows(`SELECT CODPLPAG, DESCRICAO_PLANO, QTD_PARCELAS, DIAS_PRIM_PARC, INTERVALO_DIAS, TAXA_PCT_PADRAO, ATIVO, ORIGEM_CONFIG, DT_CADASTRO, DT_ULTALTER
         FROM RC_CFG_PLPAG_CARTAO
        ORDER BY CODPLPAG`);
        return rows.map((row) => ({
            codplpag: row.CODPLPAG,
            descricaoPlano: row.DESCRICAO_PLANO,
            qtdParcelas: row.QTD_PARCELAS,
            diasPrimParc: row.DIAS_PRIM_PARC,
            intervaloDias: row.INTERVALO_DIAS,
            taxaPctPadrao: row.TAXA_PCT_PADRAO ?? null,
            ativo: row.ATIVO === 1,
            origemConfig: row.ORIGEM_CONFIG ?? null,
            dtCadastro: toIso(row.DT_CADASTRO),
            dtUltAlter: toIso(row.DT_ULTALTER),
        }));
    }
    async upsertPlanConfig(input) {
        await this.ensurePool();
        const payload = PLAN_CONFIG_SCHEMA.parse(input);
        await execDml(`MERGE INTO RC_CFG_PLPAG_CARTAO T
       USING (
         SELECT
           :codplpag AS CODPLPAG,
           :descricao AS DESCRICAO_PLANO,
           :qtd AS QTD_PARCELAS,
           :diasPrim AS DIAS_PRIM_PARC,
           :intervalo AS INTERVALO_DIAS,
           :taxa AS TAXA_PCT_PADRAO,
           :ativo AS ATIVO
         FROM DUAL
       ) S
          ON (T.CODPLPAG = S.CODPLPAG)
       WHEN MATCHED THEN UPDATE SET
         T.DESCRICAO_PLANO = S.DESCRICAO_PLANO,
         T.QTD_PARCELAS = S.QTD_PARCELAS,
         T.DIAS_PRIM_PARC = S.DIAS_PRIM_PARC,
         T.INTERVALO_DIAS = S.INTERVALO_DIAS,
         T.TAXA_PCT_PADRAO = S.TAXA_PCT_PADRAO,
         T.ATIVO = S.ATIVO,
         T.ORIGEM_CONFIG = 'MANUAL',
         T.DT_ULTALTER = SYSDATE
       WHEN NOT MATCHED THEN INSERT (
         CODPLPAG, DESCRICAO_PLANO, QTD_PARCELAS, DIAS_PRIM_PARC, INTERVALO_DIAS, TAXA_PCT_PADRAO, ATIVO, ORIGEM_CONFIG, DT_CADASTRO, DT_ULTALTER
       ) VALUES (
         S.CODPLPAG, S.DESCRICAO_PLANO, S.QTD_PARCELAS, S.DIAS_PRIM_PARC, S.INTERVALO_DIAS, S.TAXA_PCT_PADRAO, S.ATIVO, 'MANUAL', SYSDATE, SYSDATE
       )`, {
            codplpag: payload.codplpag,
            descricao: payload.descricaoPlano,
            qtd: payload.qtdParcelas,
            diasPrim: payload.diasPrimParc,
            intervalo: payload.intervaloDias,
            taxa: payload.taxaPctPadrao ?? null,
            ativo: payload.ativo ? 1 : 0,
        });
        return { ok: true, codplpag: payload.codplpag };
    }
    async bootstrapPlanConfig() {
        await this.ensurePool();
        const sourceRows = await queryRows(`SELECT PL.CODPLPAG, PL.DESCRICAO, PL.NUMPARCELAS, PL.NUMDIAS, PL.NUMDIASCARTAO,
              PL.PRAZO1, PL.PRAZO2, PL.PRAZO3, PL.PRAZO4, PL.PRAZO5, PL.PRAZO6,
              PL.PRAZO7, PL.PRAZO8, PL.PRAZO9, PL.PRAZO10, PL.PRAZO11, PL.PRAZO12, PL.STATUS
         FROM PCPLPAG PL
        WHERE NVL(PL.STATUS, 'A') = 'A'`);
        let upserts = 0;
        for (const row of sourceRows) {
            const prazoList = nonNullPositive([
                row.PRAZO1, row.PRAZO2, row.PRAZO3, row.PRAZO4, row.PRAZO5, row.PRAZO6,
                row.PRAZO7, row.PRAZO8, row.PRAZO9, row.PRAZO10, row.PRAZO11, row.PRAZO12,
            ]);
            const qtdParcelas = Math.max(1, toInt(row.NUMPARCELAS) ?? prazoList.length ?? 1);
            const diasPrimeira = prazoList[0] ?? toInt(row.NUMDIASCARTAO) ?? toInt(row.NUMDIAS) ?? 0;
            const intervalo = qtdParcelas > 1
                ? Math.max(0, (prazoList[1] ?? (diasPrimeira + (toInt(row.NUMDIASCARTAO) ?? 30))) - diasPrimeira)
                : 0;
            await execDml(`MERGE INTO RC_CFG_PLPAG_CARTAO T
         USING (
           SELECT :codplpag AS CODPLPAG, :descricao AS DESCRICAO_PLANO, :qtd AS QTD_PARCELAS, :diasPrim AS DIAS_PRIM_PARC, :intervalo AS INTERVALO_DIAS
             FROM DUAL
         ) S
            ON (T.CODPLPAG = S.CODPLPAG)
         WHEN MATCHED THEN UPDATE SET
           T.DESCRICAO_PLANO = S.DESCRICAO_PLANO,
           T.QTD_PARCELAS = S.QTD_PARCELAS,
           T.DIAS_PRIM_PARC = S.DIAS_PRIM_PARC,
           T.INTERVALO_DIAS = S.INTERVALO_DIAS,
           T.ATIVO = 1,
           T.ORIGEM_CONFIG = CASE WHEN T.ORIGEM_CONFIG = 'MANUAL' THEN T.ORIGEM_CONFIG ELSE 'AUTO_PCPLPAG' END,
           T.DT_ULTALTER = SYSDATE
         WHEN NOT MATCHED THEN INSERT (
           CODPLPAG, DESCRICAO_PLANO, QTD_PARCELAS, DIAS_PRIM_PARC, INTERVALO_DIAS, ATIVO, ORIGEM_CONFIG, DT_CADASTRO, DT_ULTALTER
         ) VALUES (
           S.CODPLPAG, S.DESCRICAO_PLANO, S.QTD_PARCELAS, S.DIAS_PRIM_PARC, S.INTERVALO_DIAS, 1, 'AUTO_PCPLPAG', SYSDATE, SYSDATE
         )`, {
                codplpag: row.CODPLPAG,
                descricao: row.DESCRICAO ?? `PLPAG ${row.CODPLPAG}`,
                qtd: qtdParcelas,
                diasPrim: diasPrimeira,
                intervalo,
            });
            upserts += 1;
        }
        return {
            ok: true,
            analisados: sourceRows.length,
            upserts,
        };
    }
    salesBaseSql(itemTable, onlyConfiguredCard) {
        const configuredCardClause = onlyConfiguredCard
            ? `AND EXISTS (
            SELECT 1
              FROM RC_CFG_COBRANCA_CARTAO CFG
             WHERE CFG.CODCOB = P.CODCOB
               AND CFG.ATIVO = 1
         )`
            : "";
        return `SELECT
      P.CODFILIAL,
      F.RAZAOSOCIAL AS NOME_FILIAL,
      P.NUMPED,
      NVL(P.DTFAT, P.DATA) AS DATA_VENDA,
      P.CODCLI,
      P.CODCOB,
      COB.COBRANCA AS DESCRICAO_COBRANCA,
      NVL(COB.CARTAO, 'N') AS INDICADOR_CARTAO_PCCOB,
      P.CODPLPAG,
      PL.DESCRICAO AS DESCRICAO_PLPAG,
      P.VLTOTAL AS VALOR_PEDIDO,
      IT.VALOR_ITENS_FATURADOS AS VALOR_ITENS,
      P.POSICAO AS POSICAO_CABECALHO,
      IT.POSICAO_ITEM_FATURADO AS POSICAO_ITEM,
      CASE WHEN ABS(NVL(P.VLTOTAL, 0) - NVL(IT.VALOR_ITENS_FATURADOS, 0)) > :tolerancia THEN 1 ELSE 0 END AS IND_DIVERGENCIA_VALOR,
      P.NSU,
      P.CODAUTORIZACAO,
      P.QTPARCELAS,
      P.PRAZO1,
      P.PRAZO2,
      P.PRAZO3,
      P.PRAZO4,
      P.PRAZO5,
      P.PRAZO6,
      P.PRAZO7,
      P.PRAZO8,
      P.PRAZO9,
      P.PRAZO10,
      P.PRAZO11,
      P.PRAZO12,
      PL.NUMPARCELAS AS PL_NUMPARCELAS,
      PL.NUMDIAS AS PL_NUMDIAS,
      PL.NUMDIASCARTAO AS PL_NUMDIASCARTAO,
      PL.PRAZO1 AS PL_PRAZO1,
      PL.PRAZO2 AS PL_PRAZO2,
      PL.PRAZO3 AS PL_PRAZO3,
      PL.PRAZO4 AS PL_PRAZO4,
      PL.PRAZO5 AS PL_PRAZO5,
      PL.PRAZO6 AS PL_PRAZO6,
      PL.PRAZO7 AS PL_PRAZO7,
      PL.PRAZO8 AS PL_PRAZO8,
      PL.PRAZO9 AS PL_PRAZO9,
      PL.PRAZO10 AS PL_PRAZO10,
      PL.PRAZO11 AS PL_PRAZO11,
      PL.PRAZO12 AS PL_PRAZO12
    FROM PCPEDC P
    JOIN (
      SELECT
        I.NUMPED,
        SUM(CASE WHEN I.POSICAO = 'F' THEN NVL(I.QT, 0) * NVL(I.PVENDA, 0) ELSE 0 END) AS VALOR_ITENS_FATURADOS,
        SUM(CASE WHEN I.POSICAO = 'F' THEN 1 ELSE 0 END) AS ITENS_FATURADOS,
        MAX(CASE WHEN I.POSICAO = 'F' THEN 'F' ELSE NULL END) AS POSICAO_ITEM_FATURADO
      FROM ${itemTable} I
      GROUP BY I.NUMPED
    ) IT ON IT.NUMPED = P.NUMPED
    LEFT JOIN PCCOB COB ON COB.CODCOB = P.CODCOB
    LEFT JOIN PCFILIAL F ON F.CODIGO = P.CODFILIAL
    LEFT JOIN PCPLPAG PL ON PL.CODPLPAG = P.CODPLPAG
    WHERE NVL(P.DTFAT, P.DATA) BETWEEN :data_inicio AND :data_fim
      AND P.POSICAO = 'F'
      AND IT.ITENS_FATURADOS > 0
      ${configuredCardClause}
    ORDER BY NVL(P.DTFAT, P.DATA), P.NUMPED`;
    }
    async getVendasFaturadasCartao(dataInicio, dataFim, onlyConfiguredCard = false) {
        let itemTable = "PCPEDI";
        try {
            await this.ensurePool();
            itemTable = await this.resolveItemTable();
            const rows = await queryRows(this.salesBaseSql(itemTable, onlyConfiguredCard), {
                data_inicio: new Date(`${dataInicio}T00:00:00.000Z`),
                data_fim: new Date(`${dataFim}T23:59:59.999Z`),
                tolerancia: 0.01,
            });
            const mappedRows = this.mapSalesRows(rows);
            await this.persistSalesCache(mappedRows);
            return {
                itemTable,
                dataInicio,
                dataFim,
                source: "ORACLE",
                total: mappedRows.length,
                rows: mappedRows,
            };
        }
        catch (error) {
            const cachedRows = await this.loadSalesCache(dataInicio, dataFim);
            if (cachedRows.length > 0) {
                this.logger.warn({
                    component: "WinthorCardReceivablesService",
                    action: "getVendasFaturadasCartao",
                    source: "CACHE",
                    itemTable,
                    dataInicio,
                    dataFim,
                    rows: cachedRows.length,
                    error,
                }, "Oracle indisponivel; retornando vendas WinThor a partir de cache local.");
                return {
                    itemTable: "CACHE",
                    dataInicio,
                    dataFim,
                    source: "CACHE",
                    total: cachedRows.length,
                    rows: cachedRows,
                };
            }
            throw error;
        }
    }
    deriveInstallmentDays(row, plpagCfg, cobrancaCfg) {
        const prazoCabecalho = nonNullPositive([
            row.PRAZO1, row.PRAZO2, row.PRAZO3, row.PRAZO4, row.PRAZO5, row.PRAZO6,
            row.PRAZO7, row.PRAZO8, row.PRAZO9, row.PRAZO10, row.PRAZO11, row.PRAZO12,
        ]);
        if (prazoCabecalho.length > 0)
            return prazoCabecalho;
        const prazoPlano = nonNullPositive([
            row.PL_PRAZO1, row.PL_PRAZO2, row.PL_PRAZO3, row.PL_PRAZO4, row.PL_PRAZO5, row.PL_PRAZO6,
            row.PL_PRAZO7, row.PL_PRAZO8, row.PL_PRAZO9, row.PL_PRAZO10, row.PL_PRAZO11, row.PL_PRAZO12,
        ]);
        if (prazoPlano.length > 0)
            return prazoPlano;
        const qtd = Math.max(1, plpagCfg?.QTD_PARCELAS ??
            toInt(row.QTPARCELAS) ??
            toInt(row.PL_NUMPARCELAS) ??
            countNonNullPositive([
                row.PRAZO1, row.PRAZO2, row.PRAZO3, row.PRAZO4, row.PRAZO5, row.PRAZO6,
                row.PRAZO7, row.PRAZO8, row.PRAZO9, row.PRAZO10, row.PRAZO11, row.PRAZO12,
            ]) ??
            1);
        const diasPrimeira = plpagCfg?.DIAS_PRIM_PARC ??
            toInt(row.PL_NUMDIASCARTAO) ??
            toInt(row.PL_NUMDIAS) ??
            cobrancaCfg?.DIAS_REC_PADRAO ??
            0;
        const intervalo = plpagCfg?.INTERVALO_DIAS ??
            (qtd > 1 ? (toInt(row.PL_NUMDIASCARTAO) ?? 30) : 0);
        return Array.from({ length: qtd }, (_, idx) => diasPrimeira + idx * Math.max(0, intervalo));
    }
    async gerarAgendaRecebiveisCartao(dataInicio, dataFim) {
        await this.ensurePool();
        const itemTable = await this.resolveItemTable();
        const salesRows = await queryRows(this.salesBaseSql(itemTable, true), {
            data_inicio: new Date(`${dataInicio}T00:00:00.000Z`),
            data_fim: new Date(`${dataFim}T23:59:59.999Z`),
            tolerancia: 0.01,
        });
        const cobrancaCfgRows = await queryRows(`SELECT CODCOB, DESCRICAO_COBRANCA, TIPO_CARTAO, ATIVO, ADQUIRENTE_PADRAO, BANDEIRA_PADRAO, TAXA_PCT_PADRAO, DIAS_REC_PADRAO, ORIGEM_MAPEAMENTO, DT_CADASTRO, DT_ULTALTER
         FROM RC_CFG_COBRANCA_CARTAO
        WHERE ATIVO = 1`);
        const plpagCfgRows = await queryRows(`SELECT CODPLPAG, DESCRICAO_PLANO, QTD_PARCELAS, DIAS_PRIM_PARC, INTERVALO_DIAS, TAXA_PCT_PADRAO, ATIVO, ORIGEM_CONFIG, DT_CADASTRO, DT_ULTALTER
         FROM RC_CFG_PLPAG_CARTAO
        WHERE ATIVO = 1`);
        const cobrancaMap = new Map(cobrancaCfgRows.map((row) => [row.CODCOB, row]));
        const plpagMap = new Map(plpagCfgRows.map((row) => [row.CODPLPAG, row]));
        const inconsistencias = [];
        let generated = 0;
        for (const sale of salesRows) {
            if (!sale.CODCOB) {
                inconsistencias.push({
                    tipo: "CODCOB_AUSENTE",
                    numped: sale.NUMPED,
                    codfilial: sale.CODFILIAL,
                });
                continue;
            }
            const cobrancaCfg = cobrancaMap.get(sale.CODCOB);
            if (!cobrancaCfg) {
                inconsistencias.push({
                    tipo: "CODCOB_NAO_CONFIGURADO",
                    numped: sale.NUMPED,
                    codfilial: sale.CODFILIAL,
                    codcob: sale.CODCOB,
                });
                continue;
            }
            const plpagCfg = sale.CODPLPAG != null ? plpagMap.get(sale.CODPLPAG) : undefined;
            const installmentDays = this.deriveInstallmentDays(sale, plpagCfg, cobrancaCfg);
            if (!installmentDays.length) {
                inconsistencias.push({
                    tipo: "PLANO_SEM_REGRA",
                    numped: sale.NUMPED,
                    codfilial: sale.CODFILIAL,
                    codplpag: sale.CODPLPAG,
                });
                continue;
            }
            const baseDate = toDate(sale.DATA_VENDA);
            if (!baseDate) {
                inconsistencias.push({
                    tipo: "DATA_VENDA_INVALIDA",
                    numped: sale.NUMPED,
                    codfilial: sale.CODFILIAL,
                });
                continue;
            }
            const valorVenda = toNumber(sale.VALOR_PEDIDO || sale.VALOR_ITENS);
            const parcelas = splitAmount(valorVenda, installmentDays.length);
            for (let idx = 0; idx < installmentDays.length; idx += 1) {
                const parcelaNum = idx + 1;
                const valorBruto = parcelas[idx] ?? 0;
                const taxaPct = cobrancaCfg.TAXA_PCT_PADRAO ?? plpagCfg?.TAXA_PCT_PADRAO ?? 0;
                const valorTaxa = round2((valorBruto * toNumber(taxaPct)) / 100);
                const valorLiquido = round2(valorBruto - valorTaxa);
                const dataPrev = addDays(baseDate, installmentDays[idx] ?? 0);
                await execDml(`MERGE INTO RC_RECEBIVEL_CARTAO_PREV T
           USING (
             SELECT
               :numped AS NUMPED,
               :codfilial AS CODFILIAL,
               :codcob AS CODCOB,
               :parcela AS PARCELA
             FROM DUAL
           ) S
              ON (T.NUMPED = S.NUMPED AND T.CODFILIAL = S.CODFILIAL AND T.CODCOB = S.CODCOB AND T.PARCELA = S.PARCELA)
           WHEN MATCHED AND T.STATUS NOT IN ('BAIXADO', 'CONCILIADO') THEN UPDATE SET
             T.NOME_FILIAL = :nome_filial,
             T.DATA_VENDA = :data_venda,
             T.CODCLI = :codcli,
             T.DESCRICAO_COBRANCA = :descricao_cobranca,
             T.CODPLPAG = :codplpag,
             T.DESCRICAO_PLPAG = :descricao_plpag,
             T.TOTAL_PARCELAS = :total_parcelas,
             T.VALOR_BRUTO = :valor_bruto,
             T.TAXA_PCT = :taxa_pct,
             T.VALOR_TAXA = :valor_taxa,
             T.VALOR_LIQ_PREV = :valor_liq_prev,
             T.DT_PREV_RECEB = :dt_prev_receb,
             T.STATUS = 'PREVISTO',
             T.ORIGEM = 'VENDA_ERP',
             T.DT_ULTALTER = SYSDATE
           WHEN NOT MATCHED THEN INSERT (
             ID, CODFILIAL, NOME_FILIAL, NUMPED, DATA_VENDA, CODCLI, CODCOB, DESCRICAO_COBRANCA, CODPLPAG, DESCRICAO_PLPAG, PARCELA, TOTAL_PARCELAS, VALOR_BRUTO, TAXA_PCT, VALOR_TAXA, VALOR_LIQ_PREV, DT_PREV_RECEB, STATUS, ORIGEM, DT_CADASTRO, DT_ULTALTER
           ) VALUES (
             :id, :codfilial, :nome_filial, :numped, :data_venda, :codcli, :codcob, :descricao_cobranca, :codplpag, :descricao_plpag, :parcela, :total_parcelas, :valor_bruto, :taxa_pct, :valor_taxa, :valor_liq_prev, :dt_prev_receb, 'PREVISTO', 'VENDA_ERP', SYSDATE, SYSDATE
           )`, {
                    id: randomUUID(),
                    codfilial: sale.CODFILIAL,
                    nome_filial: sale.NOME_FILIAL ?? null,
                    numped: sale.NUMPED,
                    data_venda: normalizeDate(baseDate),
                    codcli: sale.CODCLI ?? null,
                    codcob: sale.CODCOB,
                    descricao_cobranca: sale.DESCRICAO_COBRANCA ?? cobrancaCfg.DESCRICAO_COBRANCA,
                    codplpag: sale.CODPLPAG ?? null,
                    descricao_plpag: sale.DESCRICAO_PLPAG ?? plpagCfg?.DESCRICAO_PLANO ?? null,
                    parcela: parcelaNum,
                    total_parcelas: installmentDays.length,
                    valor_bruto: valorBruto,
                    taxa_pct: taxaPct,
                    valor_taxa: valorTaxa,
                    valor_liq_prev: valorLiquido,
                    dt_prev_receb: normalizeDate(dataPrev),
                });
                generated += 1;
            }
        }
        try {
            await execDml(`UPDATE RC_RECEBIVEL_CARTAO_PREV T SET
                T.DT_PREV_RECEB = (
                    SELECT TRUNC(PR.DTVENC)
                    FROM PCPREST PR
                    WHERE PR.NUMPED = T.NUMPED
                      AND PR.CODCLI = T.CODCLI
                      AND REGEXP_LIKE(TRIM(TO_CHAR(PR.PREST)), '^[0-9]+$')
                      AND TO_NUMBER(TRIM(TO_CHAR(PR.PREST))) = T.PARCELA
                      AND ROWNUM = 1
                ),
                T.DT_ULTALTER = SYSDATE
             WHERE T.STATUS NOT IN ('BAIXADO', 'CONCILIADO')
               AND T.DATA_VENDA BETWEEN :data_inicio AND :data_fim
               AND EXISTS (
                 SELECT 1 FROM PCPREST PR
                 WHERE PR.NUMPED = T.NUMPED
                   AND PR.CODCLI = T.CODCLI
                   AND REGEXP_LIKE(TRIM(TO_CHAR(PR.PREST)), '^[0-9]+$')
                   AND TO_NUMBER(TRIM(TO_CHAR(PR.PREST))) = T.PARCELA
               )`, {
                data_inicio: new Date(`${dataInicio}T00:00:00.000Z`),
                data_fim: new Date(`${dataFim}T23:59:59.999Z`),
            });
        }
        catch {
        }
        return {
            ok: true,
            dataInicio,
            dataFim,
            itemTable,
            vendasAnalisadas: salesRows.length,
            registrosGeradosOuAtualizados: generated,
            inconsistencias: {
                total: inconsistencias.length,
                itens: inconsistencias.slice(0, 200),
            },
        };
    }
    async listAgendaRecebiveis(dataInicio, dataFim) {
        await this.ensurePool();
        const binds = {};
        const where = [];
        if (dataInicio) {
            where.push("DT_PREV_RECEB >= :data_inicio");
            binds.data_inicio = new Date(`${dataInicio}T00:00:00.000Z`);
        }
        if (dataFim) {
            where.push("DT_PREV_RECEB <= :data_fim");
            binds.data_fim = new Date(`${dataFim}T23:59:59.999Z`);
        }
        const rows = await queryRows(`SELECT ID, CODFILIAL, NOME_FILIAL, NUMPED, DATA_VENDA, CODCLI, CODCOB, DESCRICAO_COBRANCA, CODPLPAG, DESCRICAO_PLPAG,
              PARCELA, TOTAL_PARCELAS, VALOR_BRUTO, TAXA_PCT, VALOR_TAXA, VALOR_LIQ_PREV, DT_PREV_RECEB, STATUS, ORIGEM, DT_CADASTRO, DT_ULTALTER
         FROM RC_RECEBIVEL_CARTAO_PREV
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY DT_PREV_RECEB, NUMPED, PARCELA`, binds);
        return {
            total: rows.length,
            rows: rows.map((row) => ({
                id: row.ID,
                codfilial: row.CODFILIAL,
                nomeFilial: row.NOME_FILIAL,
                numped: row.NUMPED,
                dataVenda: toIso(row.DATA_VENDA),
                codcli: row.CODCLI,
                codcob: row.CODCOB,
                descricaoCobranca: row.DESCRICAO_COBRANCA,
                codplpag: row.CODPLPAG,
                descricaoPlpag: row.DESCRICAO_PLPAG,
                parcela: row.PARCELA,
                totalParcelas: row.TOTAL_PARCELAS,
                valorBruto: row.VALOR_BRUTO,
                taxaPct: row.TAXA_PCT,
                valorTaxa: row.VALOR_TAXA,
                valorLiquidoPrev: row.VALOR_LIQ_PREV,
                dataPrevistaRecebimento: toIso(row.DT_PREV_RECEB),
                status: row.STATUS,
                origem: row.ORIGEM,
                criadoEm: toIso(row.DT_CADASTRO),
                atualizadoEm: toIso(row.DT_ULTALTER),
            })),
        };
    }
    async getInconsistencias(dataInicio, dataFim) {
        await this.ensurePool();
        const itemTable = await this.resolveItemTable();
        const baseBinds = {
            data_inicio: new Date(`${dataInicio}T00:00:00.000Z`),
            data_fim: new Date(`${dataFim}T23:59:59.999Z`),
        };
        const divergenceBinds = {
            ...baseBinds,
            tolerancia: 0.01,
        };
        const semAgenda = await queryRows(`SELECT V.CODFILIAL, V.NOME_FILIAL, V.NUMPED, V.DATA_VENDA, V.CODCOB, V.DESCRICAO_COBRANCA, V.CODPLPAG, V.DESCRICAO_PLPAG, V.VALOR_PEDIDO
         FROM VW_VENDAS_CARTAO_FATURADAS V
         JOIN RC_CFG_COBRANCA_CARTAO CFG
           ON CFG.CODCOB = V.CODCOB
          AND CFG.ATIVO = 1
         LEFT JOIN (
           SELECT DISTINCT NUMPED, CODFILIAL, CODCOB
             FROM RC_RECEBIVEL_CARTAO_PREV
         ) R
           ON R.NUMPED = V.NUMPED
          AND R.CODFILIAL = V.CODFILIAL
          AND R.CODCOB = V.CODCOB
        WHERE V.DATA_VENDA BETWEEN :data_inicio AND :data_fim
          AND R.NUMPED IS NULL
        FETCH FIRST 200 ROWS ONLY`, baseBinds);
        const naoFaturadosIncluidos = await queryRows(`SELECT R.CODFILIAL, R.NUMPED, R.CODCOB, R.PARCELA, P.POSICAO AS POSICAO_CABECALHO
         FROM RC_RECEBIVEL_CARTAO_PREV R
         LEFT JOIN PCPEDC P ON P.NUMPED = R.NUMPED
        WHERE (P.POSICAO IS NULL OR P.POSICAO <> 'F')
        FETCH FIRST 200 ROWS ONLY`);
        const divergenciaCabecalhoItens = await queryRows(`SELECT P.CODFILIAL, P.NUMPED, P.CODCOB, P.VLTOTAL AS VALOR_CABECALHO, IT.VALOR_ITENS
         FROM PCPEDC P
         JOIN (
           SELECT I.NUMPED, SUM(CASE WHEN I.POSICAO = 'F' THEN NVL(I.QT,0)*NVL(I.PVENDA,0) ELSE 0 END) AS VALOR_ITENS
             FROM ${itemTable} I
            GROUP BY I.NUMPED
         ) IT ON IT.NUMPED = P.NUMPED
        WHERE NVL(P.DTFAT, P.DATA) BETWEEN :data_inicio AND :data_fim
          AND P.POSICAO = 'F'
          AND ABS(NVL(P.VLTOTAL,0) - NVL(IT.VALOR_ITENS,0)) > :tolerancia
        FETCH FIRST 200 ROWS ONLY`, divergenceBinds);
        const codcobNaoConfigurado = await queryRows(`SELECT P.CODCOB, COB.COBRANCA, COUNT(*) AS QUANTIDADE_VENDAS
         FROM PCPEDC P
         LEFT JOIN PCCOB COB ON COB.CODCOB = P.CODCOB
        WHERE NVL(P.DTFAT, P.DATA) BETWEEN :data_inicio AND :data_fim
          AND P.POSICAO = 'F'
          AND NVL(COB.CARTAO, 'N') = 'S'
          AND NOT EXISTS (
            SELECT 1
              FROM RC_CFG_COBRANCA_CARTAO CFG
             WHERE CFG.CODCOB = P.CODCOB
               AND CFG.ATIVO = 1
          )
        GROUP BY P.CODCOB, COB.COBRANCA
        ORDER BY COUNT(*) DESC
        FETCH FIRST 200 ROWS ONLY`, baseBinds);
        const planoSemRegra = await queryRows(`SELECT P.CODPLPAG, PL.DESCRICAO AS DESCRICAO_PLPAG, COUNT(*) AS QUANTIDADE_VENDAS
         FROM PCPEDC P
         LEFT JOIN PCPLPAG PL ON PL.CODPLPAG = P.CODPLPAG
        WHERE NVL(P.DTFAT, P.DATA) BETWEEN :data_inicio AND :data_fim
          AND P.POSICAO = 'F'
          AND EXISTS (
            SELECT 1
              FROM RC_CFG_COBRANCA_CARTAO CFG
             WHERE CFG.CODCOB = P.CODCOB
               AND CFG.ATIVO = 1
          )
          AND NOT EXISTS (
            SELECT 1
              FROM RC_CFG_PLPAG_CARTAO PC
             WHERE PC.CODPLPAG = P.CODPLPAG
               AND PC.ATIVO = 1
          )
        GROUP BY P.CODPLPAG, PL.DESCRICAO
        ORDER BY COUNT(*) DESC
        FETCH FIRST 200 ROWS ONLY`, baseBinds);
        const vendasVsRecebFilial = await queryRows(`WITH V AS (
          SELECT P.CODFILIAL, SUM(NVL(P.VLTOTAL,0)) AS TOTAL_VENDAS
            FROM PCPEDC P
           WHERE NVL(P.DTFAT, P.DATA) BETWEEN :data_inicio AND :data_fim
             AND P.POSICAO = 'F'
             AND EXISTS (
               SELECT 1
                 FROM RC_CFG_COBRANCA_CARTAO CFG
                WHERE CFG.CODCOB = P.CODCOB
                  AND CFG.ATIVO = 1
             )
           GROUP BY P.CODFILIAL
        ),
        R AS (
          SELECT CODFILIAL, SUM(NVL(VALOR_BRUTO,0)) AS TOTAL_RECEBIVEIS
            FROM RC_RECEBIVEL_CARTAO_PREV
           WHERE DATA_VENDA BETWEEN :data_inicio AND :data_fim
           GROUP BY CODFILIAL
        )
        SELECT COALESCE(V.CODFILIAL, R.CODFILIAL) AS CODFILIAL,
               NVL(V.TOTAL_VENDAS, 0) AS TOTAL_VENDAS,
               NVL(R.TOTAL_RECEBIVEIS, 0) AS TOTAL_RECEBIVEIS,
               NVL(R.TOTAL_RECEBIVEIS, 0) - NVL(V.TOTAL_VENDAS, 0) AS DIFERENCA
          FROM V
          FULL OUTER JOIN R ON R.CODFILIAL = V.CODFILIAL
         ORDER BY ABS(NVL(R.TOTAL_RECEBIVEIS, 0) - NVL(V.TOTAL_VENDAS, 0)) DESC`, baseBinds);
        const vendasVsRecebCodcob = await queryRows(`WITH V AS (
          SELECT P.CODCOB, SUM(NVL(P.VLTOTAL,0)) AS TOTAL_VENDAS
            FROM PCPEDC P
           WHERE NVL(P.DTFAT, P.DATA) BETWEEN :data_inicio AND :data_fim
             AND P.POSICAO = 'F'
           GROUP BY P.CODCOB
        ),
        R AS (
          SELECT CODCOB, SUM(NVL(VALOR_BRUTO,0)) AS TOTAL_RECEBIVEIS
            FROM RC_RECEBIVEL_CARTAO_PREV
           WHERE DATA_VENDA BETWEEN :data_inicio AND :data_fim
           GROUP BY CODCOB
        )
        SELECT COALESCE(V.CODCOB, R.CODCOB) AS CODCOB,
               NVL(V.TOTAL_VENDAS, 0) AS TOTAL_VENDAS,
               NVL(R.TOTAL_RECEBIVEIS, 0) AS TOTAL_RECEBIVEIS,
               NVL(R.TOTAL_RECEBIVEIS, 0) - NVL(V.TOTAL_VENDAS, 0) AS DIFERENCA
          FROM V
          FULL OUTER JOIN R ON R.CODCOB = V.CODCOB
         ORDER BY ABS(NVL(R.TOTAL_RECEBIVEIS, 0) - NVL(V.TOTAL_VENDAS, 0)) DESC`, baseBinds);
        const vendasVsRecebPlpag = await queryRows(`WITH V AS (
          SELECT P.CODPLPAG, SUM(NVL(P.VLTOTAL,0)) AS TOTAL_VENDAS
            FROM PCPEDC P
           WHERE NVL(P.DTFAT, P.DATA) BETWEEN :data_inicio AND :data_fim
             AND P.POSICAO = 'F'
             AND EXISTS (
               SELECT 1
                 FROM RC_CFG_COBRANCA_CARTAO CFG
                WHERE CFG.CODCOB = P.CODCOB
                  AND CFG.ATIVO = 1
             )
           GROUP BY P.CODPLPAG
        ),
        R AS (
          SELECT CODPLPAG, SUM(NVL(VALOR_BRUTO,0)) AS TOTAL_RECEBIVEIS
            FROM RC_RECEBIVEL_CARTAO_PREV
           WHERE DATA_VENDA BETWEEN :data_inicio AND :data_fim
           GROUP BY CODPLPAG
        )
        SELECT COALESCE(V.CODPLPAG, R.CODPLPAG) AS CODPLPAG,
               NVL(V.TOTAL_VENDAS, 0) AS TOTAL_VENDAS,
               NVL(R.TOTAL_RECEBIVEIS, 0) AS TOTAL_RECEBIVEIS,
               NVL(R.TOTAL_RECEBIVEIS, 0) - NVL(V.TOTAL_VENDAS, 0) AS DIFERENCA
          FROM V
          FULL OUTER JOIN R ON R.CODPLPAG = V.CODPLPAG
         ORDER BY ABS(NVL(R.TOTAL_RECEBIVEIS, 0) - NVL(V.TOTAL_VENDAS, 0)) DESC`, baseBinds);
        return {
            dataInicio,
            dataFim,
            itemTable,
            inconsistencias: {
                pedidosFaturadosSemAgenda: semAgenda,
                pedidosNaoFaturadosIncluidos: naoFaturadosIncluidos,
                divergenciaCabecalhoVsItens: divergenciaCabecalhoItens,
                codcobCartaoSemConfiguracao: codcobNaoConfigurado,
                planoPagamentoSemRegra: planoSemRegra,
            },
            confrontos: {
                vendasVsRecebiveisPorFilial: vendasVsRecebFilial,
                vendasVsRecebiveisPorCodcob: vendasVsRecebCodcob,
                vendasVsRecebiveisPorPlano: vendasVsRecebPlpag,
            },
        };
    }
}
