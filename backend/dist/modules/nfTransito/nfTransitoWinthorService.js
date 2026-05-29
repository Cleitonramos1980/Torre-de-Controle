import { z } from "zod";
import { hasOracleConfig } from "../../config/env.js";
import { initOraclePool } from "../../db/oracle.js";
import { queryRows } from "../../repositories/baseRepository.js";
import { AppError } from "../../utils/error.js";
const DEFAULT_SLA_DIAS = 3;
const filtersSchema = z.object({
    codfilial: z.string().trim().min(1).max(10).optional(),
    codfilialEntrada: z.string().trim().min(1).max(10).optional(),
    codcli: z.coerce.number().int().positive().optional(),
    dataSaidaInicio: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    dataSaidaFim: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    numnota: z.string().trim().min(1).max(40).optional(),
    numped: z.coerce.number().int().positive().optional(),
    numtransvenda: z.coerce.number().int().positive().optional(),
    fornecedor: z.string().trim().min(1).max(120).optional(),
    cliente: z.string().trim().min(1).max(120).optional(),
    somenteGnreSt: z.coerce.boolean().optional(),
    somenteEmRisco: z.coerce.boolean().optional(),
    somenteAcimaSla: z.coerce.boolean().optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(5000).optional(),
    sortBy: z
        .enum([
        "dtsaida",
        "numnota",
        "numped",
        "numtransvenda",
        "vltotal",
        "codfilial",
        "cliente",
        "fornecedor",
        "dias_em_transito",
        "criticidade",
    ])
        .optional(),
    sortDir: z.enum(["asc", "desc"]).optional(),
});
const SORT_MAP = {
    dtsaida: "DTSAIDA",
    numnota: "NUMNOTA",
    numped: "NUMPED",
    numtransvenda: "NUMTRANSVENDA",
    vltotal: "VLTOTAL",
    codfilial: "FLSAIDA",
    cliente: "CLIENTE",
    fornecedor: "CLIENTE",
    dias_em_transito: "DTSAIDA",
    criticidade: "DTSAIDA",
};
function toIso(value) {
    if (!value)
        return null;
    const parsed = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(parsed.getTime()))
        return null;
    return parsed.toISOString();
}
function formatDate(value) {
    if (!value)
        return "-";
    const parsed = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(parsed.getTime()))
        return "-";
    return parsed.toLocaleDateString("pt-BR");
}
function toStartOfDay(value) {
    return new Date(`${value}T00:00:00.000Z`);
}
function toEndOfDay(value) {
    return new Date(`${value}T23:59:59.999Z`);
}
function asNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function asString(value, fallback = "") {
    if (typeof value === "string")
        return value.trim();
    if (typeof value === "number")
        return String(value);
    return fallback;
}
function moneyBr(value) {
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function diffDays(fromDate) {
    if (!fromDate)
        return 0;
    const raw = fromDate instanceof Date ? fromDate : new Date(String(fromDate));
    if (Number.isNaN(raw.getTime()))
        return 0;
    const now = new Date();
    const from = new Date(raw.getFullYear(), raw.getMonth(), raw.getDate()).getTime();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const ms = today - from;
    if (ms <= 0)
        return 0;
    return Math.floor(ms / (24 * 60 * 60 * 1000));
}
function addDays(fromDate, days) {
    const base = fromDate ? new Date(fromDate) : new Date();
    if (Number.isNaN(base.getTime()))
        return new Date().toISOString();
    base.setUTCDate(base.getUTCDate() + days);
    return base.toISOString();
}
function classifyCriticidade(diasEmTransito) {
    if (diasEmTransito <= 1)
        return "VERDE";
    if (diasEmTransito <= 3)
        return "AMARELO";
    if (diasEmTransito <= 7)
        return "VERMELHO";
    return "CRITICO";
}
function buildRisk(row, diasEmTransito) {
    const motivos = [];
    const operacaoTipo = asString(row.OPERACAO_TIPO).toUpperCase();
    const isTransferenciaInterna = operacaoTipo === "TRANSFERENCIA_INTERNA";
    const possuiGnreSt = !isTransferenciaInterna && (asNumber(row.ICMSRETIDOGNRE) > 0 || row.CODFORNECSTGUIA !== null);
    const semChave = asString(row.CHAVENFE).length === 0;
    const acimaSla = diasEmTransito > DEFAULT_SLA_DIAS;
    if (acimaSla)
        motivos.push(`SLA excedido (${diasEmTransito} dias em trânsito).`);
    if (possuiGnreSt)
        motivos.push("Possui pendência de GNRE/ST.");
    if (semChave)
        motivos.push("Chave NF-e ausente.");
    let scoreRisco = Math.min(100, diasEmTransito * 10);
    if (possuiGnreSt)
        scoreRisco = Math.min(100, scoreRisco + 20);
    if (semChave)
        scoreRisco = Math.min(100, scoreRisco + 25);
    const criticidade = classifyCriticidade(diasEmTransito);
    const emRisco = acimaSla || possuiGnreSt || semChave || criticidade === "CRITICO";
    const statusFiscal = possuiGnreSt ? "PENDENCIA_GNRE_ST" : semChave ? "EXCECAO_FISCAL" : "OK";
    let statusTransito = "EM_TRANSITO";
    if (semChave || possuiGnreSt)
        statusTransito = "EXCECAO_FISCAL";
    else if (criticidade === "CRITICO")
        statusTransito = "CRITICA";
    else if (emRisco)
        statusTransito = "EM_RISCO";
    else if (diasEmTransito > 1)
        statusTransito = "AGUARDANDO_CONFIRMACAO";
    return {
        statusTransito,
        criticidade,
        emRisco,
        scoreRisco,
        motivoRisco: motivos.join(" ") || "Sem riscos relevantes identificados.",
        statusFiscal,
    };
}
function mapRowToDocumento(row) {
    const diasEmTransito = diffDays(row.DTSAIDA);
    const risk = buildRisk(row, diasEmTransito);
    const vltotal = Number(asNumber(row.VLTOTAL).toFixed(2));
    const dtsaidaIso = toIso(row.DTSAIDA);
    const dataSaidaFormatada = formatDate(row.DTSAIDA);
    const numeroNota = asString(row.NUMNOTA, "-");
    const numTransVenda = asString(row.NUMTRANSVENDA, "-");
    const cliente = asString(row.CLIENTE, "-");
    const filialSaida = asString(row.FLSAIDA || row.CODFILIAL, "-");
    const filialEntrada = asString(row.FLENTRADA, "-");
    const destinoTransferencia = filialEntrada && filialEntrada !== "-" ? `Filial ${filialEntrada}` : cliente;
    const fornecedor = destinoTransferencia;
    const codfilial = filialSaida;
    const chaveNfe = asString(row.CHAVENFE);
    const statusImportacao = row.NUMTRANSVENDAORIG === null || row.NUMTRANSVENDAORIG === 0 ? "NAO_IMPORTADA" : "IMPORTADA";
    const checkpoints = [
        {
            id: `${numTransVenda}-emitida`,
            tipo: "NF_EMITIDA",
            descricao: `NF ${numeroNota} emitida para a filial ${codfilial}.`,
            dataHora: dtsaidaIso ?? new Date().toISOString(),
            responsavel: "WinThor",
            localizacao: `Filial ${codfilial}`,
        },
        {
            id: `${numTransVenda}-transito`,
            tipo: "EM_TRANSITO",
            descricao: "Documento segue em trânsito aguardando importação de entrada.",
            dataHora: dtsaidaIso ?? new Date().toISOString(),
            responsavel: "Torre de Controle",
            localizacao: fornecedor,
        },
    ];
    return {
        id: numTransVenda,
        numped: asString(row.NUMPED, "-"),
        importar: asString(row.IMPORTAR, "N"),
        dtsaida: dtsaidaIso,
        numnota: numeroNota,
        numtransvenda: numTransVenda,
        importado: asNumber(row.IMPORTADO),
        lista_pedidos: asString(row.LISTA_PEDIDOS, "-"),
        numnftransf: asString(row.NUMNFTRANSF, "-"),
        codcli: row.CODCLI,
        geracp: asString(row.GERACP, "N"),
        cliente,
        codfilial,
        codfornec: row.CODFORNEC,
        fornecedor,
        posicao: asString(row.POSICAO, "-"),
        condvenda: row.CONDVENDA,
        condvenda_nf: row.CONDVENDA_NF,
        numcar: asString(row.NUMCAR, "-"),
        vltotal,
        possuidevolucao: asString(row.POSSUIDEVOLUCAO, "N"),
        icmsretidognre: asNumber(row.ICMSRETIDOGNRE),
        codfornecstguia: row.CODFORNECSTGUIA,
        fornecedorstguia: asString(row.FORNECEDORSTGUIA, "-"),
        codparcela: asString(row.CODPARCELA, "-"),
        parcela: asString(row.PARCELA, "-"),
        qtdmaxparcela: row.QTDMAXPARCELA,
        diabase: row.DIABASE,
        dtemissaostguia: toIso(row.DTEMISSAOSTGUIA),
        chavenfe: chaveNfe,
        usacfopvendanatv10: asString(row.USACFOPVENDANATV10, "S"),
        codparcelafornec: asString(row.CODPARCELAFORNEC, "-"),
        numtransvendaorig: row.NUMTRANSVENDAORIG,
        dias_em_transito: diasEmTransito,
        diasEmTransito,
        status_transito: risk.statusTransito,
        status: risk.statusTransito,
        criticidade: risk.criticidade,
        em_risco: risk.emRisco ? "S" : "N",
        emRisco: risk.emRisco,
        motivo_risco: risk.motivoRisco,
        motivoRisco: risk.motivoRisco,
        status_importacao: statusImportacao,
        statusImportacao,
        status_fiscal: risk.statusFiscal,
        statusFiscal: risk.statusFiscal,
        status_recebimento: statusImportacao === "IMPORTADA" ? "RECEBIDA" : "AGUARDANDO_ENTRADA",
        statusRecebimento: statusImportacao === "IMPORTADA" ? "RECEBIDA" : "AGUARDANDO_ENTRADA",
        score_risco: risk.scoreRisco,
        scoreRisco: risk.scoreRisco,
        valor_formatado: moneyBr(vltotal),
        valorFormatado: moneyBr(vltotal),
        data_saida_formatada: dataSaidaFormatada,
        dataSaidaFormatada,
        numero: numeroNota,
        chaveNfe: chaveNfe || "-",
        destino: destinoTransferencia,
        uf: "-",
        valor: vltotal,
        dataEmissao: dataSaidaFormatada,
        dataSaidaPrevista: dataSaidaFormatada,
        dataSaidaReal: dtsaidaIso ?? undefined,
        dataEntregaPrevista: formatDate(addDays(row.DTSAIDA, DEFAULT_SLA_DIAS)),
        dataEntregaReal: undefined,
        pedido: asString(row.NUMPED, "-"),
        carga: asString(row.NUMCAR, "-"),
        mdfeNumero: "-",
        mdfeStatus: "PENDENTE",
        cteNumero: "-",
        cteStatus: "PENDENTE",
        placa: "-",
        motoristaNome: "-",
        transportadoraNome: "Transferencia interna",
        checkpoints,
        alertas: risk.emRisco ? [risk.motivoRisco] : [],
        planta: codfilial,
        flsaida: filialSaida,
        flentrada: filialEntrada,
        codprod: row.CODPROD ?? null,
        descricaoItem: asString(row.DESCRICAO, "-"),
        custoFin: asNumber(row.CUSTOFIN),
        quantidadeItens: asNumber(row.QT),
        valorTotalCusto: asNumber(row.VALOR_TOTAL),
        operacaoTipo: asString(row.OPERACAO_TIPO, "TRANSFERENCIA_INTERNA"),
    };
}
export class NFTransitoWinthorService {
    logger;
    constructor(logger) {
        this.logger = logger;
    }
    async ensurePool() {
        if (!hasOracleConfig()) {
            throw new AppError("Oracle WinThor nao configurado para NF em transito. Verifique ORACLE_USER/ORACLE_PASSWORD/ORACLE_CONNECT_STRING.", 503);
        }
        await initOraclePool();
    }
    buildWhere(filters, binds) {
        const clauses = [
            "S.CHAVENFE IS NOT NULL",
            "S.DTCANCEL IS NULL",
            "UPPER(C.CLIENTE) LIKE '%RODRIGUES%'",
            "UPPER(C.CLIENTE) LIKE '%INDUSTRIA%'",
            "NOT EXISTS (SELECT 1 FROM PCNFENT E WHERE E.CHAVENFE = S.CHAVENFE)",
        ];
        if (filters.codfilial) {
            clauses.push("TO_CHAR(S.CODFILIAL) = :codfilial");
            binds.codfilial = filters.codfilial;
        }
        if (filters.codfilialEntrada) {
            clauses.push("TO_CHAR(FL.CODIGO) = :codfilial_entrada");
            binds.codfilial_entrada = filters.codfilialEntrada;
        }
        if (typeof filters.codcli === "number") {
            clauses.push("S.CODCLI = :codcli");
            binds.codcli = filters.codcli;
        }
        if (filters.dataSaidaInicio) {
            clauses.push("TRUNC(S.DTSAIDA) >= :dtsaida_inicio");
            binds.dtsaida_inicio = toStartOfDay(filters.dataSaidaInicio);
        }
        if (filters.dataSaidaFim) {
            clauses.push("TRUNC(S.DTSAIDA) <= :dtsaida_fim");
            binds.dtsaida_fim = toEndOfDay(filters.dataSaidaFim);
        }
        if (filters.numnota) {
            clauses.push("TO_CHAR(S.NUMNOTA) LIKE :numnota_like");
            binds.numnota_like = `%${filters.numnota}%`;
        }
        if (typeof filters.numped === "number") {
            clauses.push("S.NUMPED = :numped");
            binds.numped = filters.numped;
        }
        if (typeof filters.numtransvenda === "number") {
            clauses.push("S.NUMTRANSVENDA = :numtransvenda");
            binds.numtransvenda = filters.numtransvenda;
        }
        if (filters.fornecedor) {
            clauses.push("UPPER(C.CLIENTE) LIKE :fornecedor_like");
            binds.fornecedor_like = `%${filters.fornecedor.toUpperCase()}%`;
        }
        if (filters.cliente) {
            clauses.push("UPPER(C.CLIENTE) LIKE :cliente_like");
            binds.cliente_like = `%${filters.cliente.toUpperCase()}%`;
        }
        if (filters.somenteGnreSt) {
            clauses.push("1 = 0");
        }
        if (filters.somenteEmRisco) {
            clauses.push("TRUNC(SYSDATE) - TRUNC(S.DTSAIDA) > :sla_dias_risco");
            binds.sla_dias_risco = DEFAULT_SLA_DIAS;
        }
        if (filters.somenteAcimaSla) {
            clauses.push("TRUNC(SYSDATE) - TRUNC(S.DTSAIDA) > :sla_dias");
            binds.sla_dias = DEFAULT_SLA_DIAS;
        }
        return clauses.join("\n    AND ");
    }
    buildSelectSql(whereSql) {
        return `
      SELECT
          S.NUMPED AS NUMPED
        , TO_CHAR('N') AS IMPORTAR
        , S.DTSAIDA AS DTSAIDA
        , S.NUMNOTA AS NUMNOTA
        , S.NUMTRANSVENDA AS NUMTRANSVENDA
        , 0 AS IMPORTADO
        , TO_CHAR(S.NUMPED) AS LISTA_PEDIDOS
        , TO_CHAR(NULL) AS NUMNFTRANSF
        , S.CODCLI AS CODCLI
        , TO_CHAR('N') AS GERACP
        , C.CLIENTE AS CLIENTE
        , S.CODFILIAL AS CODFILIAL
        , S.CODFILIAL AS FLSAIDA
        , FL.CODIGO AS FLENTRADA
        , 0 AS CODFORNEC
        , C.CLIENTE AS FORNECEDOR
        , TO_CHAR('-') AS POSICAO
        , S.CONDVENDA AS CONDVENDA
        , S.CONDVENDA AS CONDVENDA_NF
        , S.NUMCAR AS NUMCAR
        , S.VLTOTAL AS VLTOTAL
        , TO_CHAR('N') AS POSSUIDEVOLUCAO
        , 0 AS ICMSRETIDOGNRE
        , TO_NUMBER(NULL) AS CODFORNECSTGUIA
        , TO_CHAR(NULL) AS FORNECEDORSTGUIA
        , TO_CHAR(NULL) AS CODPARCELA
        , TO_CHAR(NULL) AS PARCELA
        , 0 AS QTDMAXPARCELA
        , 0 AS DIABASE
        , TRUNC(SYSDATE) AS DTEMISSAOSTGUIA
        , S.CHAVENFE AS CHAVENFE
        , TO_CHAR('S') AS USACFOPVENDANATV10
        , TO_CHAR(NULL) AS CODPARCELAFORNEC
        , TO_NUMBER(NULL) AS NUMTRANSVENDAORIG
        , M.CODPROD_REF AS CODPROD
        , M.DESCRICAO_REF AS DESCRICAO
        , M.CUSTOFIN_MEDIO AS CUSTOFIN
        , M.QT_TOTAL AS QT
        , NVL(M.VALOR_TOTAL, NVL(S.VLTOTAL, 0)) AS VALOR_TOTAL
        , TO_CHAR('TRANSFERENCIA_INTERNA') AS OPERACAO_TIPO
      FROM PCNFSAID S
      JOIN PCCLIENT C
        ON C.CODCLI = S.CODCLI
      LEFT JOIN (
        SELECT
            REGEXP_REPLACE(CGC, '[^0-9]', '') AS CGC_NUM
          , MIN(CODIGO) AS CODIGO
        FROM PCFILIAL
        GROUP BY REGEXP_REPLACE(CGC, '[^0-9]', '')
      ) FL
        ON FL.CGC_NUM = REGEXP_REPLACE(C.CGCENT, '[^0-9]', '')
      LEFT JOIN (
        SELECT
            NUMTRANSVENDA
          , MIN(CODPROD) AS CODPROD_REF
          , MIN(DESCRICAO) AS DESCRICAO_REF
          , AVG(NVL(CUSTOFIN, 0)) AS CUSTOFIN_MEDIO
          , SUM(NVL(QT, 0)) AS QT_TOTAL
          , SUM(NVL(CUSTOFIN, 0) * NVL(QT, 0)) AS VALOR_TOTAL
        FROM PCMOV
        GROUP BY NUMTRANSVENDA
      ) M
        ON M.NUMTRANSVENDA = S.NUMTRANSVENDA
      WHERE ${whereSql}
    `;
    }
    parseFilters(input = {}) {
        const parsed = filtersSchema.parse(input);
        const page = parsed.page ?? 1;
        const pageSize = parsed.pageSize ?? 50;
        const sortBy = parsed.sortBy ?? "dtsaida";
        const sortDir = parsed.sortDir ?? "desc";
        return {
            ...parsed,
            page,
            pageSize,
            sortBy,
            sortDir,
        };
    }
    async queryRowsFiltered(filters) {
        await this.ensurePool();
        const binds = {};
        const whereSql = this.buildWhere(filters, binds);
        const selectSql = this.buildSelectSql(whereSql);
        const sortBy = SORT_MAP[filters.sortBy ?? "dtsaida"] ?? SORT_MAP.dtsaida;
        const sortDir = filters.sortDir === "asc" ? "ASC" : "DESC";
        const page = filters.page ?? 1;
        const pageSize = filters.pageSize ?? 50;
        const offsetRows = (page - 1) * pageSize;
        binds.offset_rows = offsetRows;
        binds.fetch_rows = pageSize;
        const sql = `
      SELECT *
      FROM (
        ${selectSql}
        ORDER BY ${sortBy} ${sortDir}, NUMTRANSVENDA ${sortDir}
      )
      OFFSET :offset_rows ROWS FETCH NEXT :fetch_rows ROWS ONLY
    `;
        return queryRows(sql, binds);
    }
    async countRows(filters) {
        await this.ensurePool();
        const binds = {};
        const whereSql = this.buildWhere(filters, binds);
        const sql = `
      SELECT COUNT(1) AS TOTAL
      FROM (
        ${this.buildSelectSql(whereSql)}
      )
    `;
        const rows = await queryRows(sql, binds);
        return asNumber(rows[0]?.TOTAL);
    }
    async queryAllRows(filters = {}) {
        await this.ensurePool();
        const parsed = this.parseFilters({
            ...filters,
            page: 1,
            pageSize: 5000,
            sortBy: filters.sortBy ?? "dtsaida",
            sortDir: filters.sortDir ?? "desc",
        });
        const binds = {};
        const whereSql = this.buildWhere(parsed, binds);
        const sortBy = SORT_MAP[parsed.sortBy ?? "dtsaida"] ?? SORT_MAP.dtsaida;
        const sortDir = parsed.sortDir === "asc" ? "ASC" : "DESC";
        const sql = `
      ${this.buildSelectSql(whereSql)}
      ORDER BY ${sortBy} ${sortDir}, NUMTRANSVENDA ${sortDir}
    `;
        return queryRows(sql, binds);
    }
    groupSum(docs, keyGetter) {
        const map = new Map();
        for (const doc of docs) {
            const key = keyGetter(doc);
            const current = map.get(key) ?? { quantidade: 0, valor: 0 };
            current.quantidade += 1;
            current.valor += doc.vltotal;
            map.set(key, current);
        }
        return Array.from(map.entries()).map(([key, value]) => ({
            key,
            quantidade: value.quantidade,
            valor: Number(value.valor.toFixed(2)),
        }));
    }
    buildExcecoes(docs) {
        const items = [];
        for (const doc of docs) {
            if (doc.icmsretidognre > 0) {
                items.push({
                    id: `EXC-GNRE-${doc.id}`,
                    tipo: "GNRE_ST",
                    nfId: doc.id,
                    nfNumero: doc.numnota,
                    descricao: `NF com ICMS retido/GNRE (valor ${moneyBr(doc.icmsretidognre)}).`,
                    criticidade: doc.criticidade,
                    status: "ABERTA",
                    criadoEm: doc.dtsaida ?? new Date().toISOString(),
                    responsavel: "Fiscal",
                });
            }
            if (!doc.chavenfe || doc.chavenfe === "-") {
                items.push({
                    id: `EXC-CHAVE-${doc.id}`,
                    tipo: "CHAVE_NFE_AUSENTE",
                    nfId: doc.id,
                    nfNumero: doc.numnota,
                    descricao: "NF sem chave de acesso preenchida.",
                    criticidade: "CRITICO",
                    status: "ABERTA",
                    criadoEm: doc.dtsaida ?? new Date().toISOString(),
                    responsavel: "Fiscal",
                });
            }
            if (!doc.codfornecstguia && doc.operacaoTipo !== "TRANSFERENCIA_INTERNA") {
                items.push({
                    id: `EXC-STGUIA-${doc.id}`,
                    tipo: "ST_GUIA_NAO_CONFIGURADA",
                    nfId: doc.id,
                    nfNumero: doc.numnota,
                    descricao: "Fornecedor ST guia não configurado para esta filial.",
                    criticidade: "AMARELO",
                    status: "EM_TRATAMENTO",
                    criadoEm: doc.dtsaida ?? new Date().toISOString(),
                    responsavel: "Fiscal",
                });
            }
        }
        return items;
    }
    async listDocumentos(input = {}) {
        const filters = this.parseFilters(input);
        const [rows, total] = await Promise.all([this.queryRowsFiltered(filters), this.countRows(filters)]);
        let docs = rows.map(mapRowToDocumento);
        if (filters.somenteEmRisco) {
            docs = docs.filter((item) => item.emRisco);
        }
        return {
            items: docs,
            page: filters.page ?? 1,
            pageSize: filters.pageSize ?? 50,
            total,
            filters,
            sort: {
                by: filters.sortBy ?? "dtsaida",
                dir: filters.sortDir === "asc" ? "asc" : "desc",
            },
        };
    }
    async getDashboard(input = {}) {
        const rows = await this.queryAllRows(input);
        const docs = rows.map(mapRowToDocumento);
        const totalNfsTransito = docs.length;
        const totalEmRisco = docs.filter((item) => item.emRisco).length;
        const valorEmTransito = Number(docs.reduce((sum, item) => sum + item.vltotal, 0).toFixed(2));
        const valorEmRisco = Number(docs.filter((item) => item.emRisco).reduce((sum, item) => sum + item.vltotal, 0).toFixed(2));
        const mediaDiasTransito = totalNfsTransito
            ? Number((docs.reduce((sum, item) => sum + item.diasEmTransito, 0) / totalNfsTransito).toFixed(2))
            : 0;
        const nfsSemConfirmacao = docs.filter((item) => item.status === "AGUARDANDO_CONFIRMACAO" || item.status === "EM_TRANSITO").length;
        const nfsPorCriticidade = this.groupSum(docs, (item) => item.criticidade).map((item) => ({
            label: item.key,
            quantidade: item.quantidade,
            valor: item.valor,
        }));
        const nfsPorFornecedor = this.groupSum(docs, (item) => item.fornecedor).map((item) => ({
            fornecedor: item.key,
            quantidade: item.quantidade,
            valor: item.valor,
        }));
        const nfsPorFilial = this.groupSum(docs, (item) => item.codfilial).map((item) => ({
            codfilial: item.key,
            quantidade: item.quantidade,
            valor: item.valor,
        }));
        const agingRanges = [
            { label: "0-1 dia", min: 0, max: 1 },
            { label: "2-3 dias", min: 2, max: 3 },
            { label: "4-7 dias", min: 4, max: 7 },
            { label: "8+ dias", min: 8, max: Number.POSITIVE_INFINITY },
        ];
        const aging = agingRanges.map((range) => {
            const bucketDocs = docs.filter((doc) => doc.diasEmTransito >= range.min && doc.diasEmTransito <= range.max);
            return {
                faixa: range.label,
                quantidade: bucketDocs.length,
                valor: Number(bucketDocs.reduce((sum, item) => sum + item.vltotal, 0).toFixed(2)),
            };
        });
        return {
            totalNfsTransito,
            totalEmRisco,
            valorEmTransito,
            valorEmRisco,
            mediaDiasTransito,
            nfsSemConfirmacao,
            nfsPorCriticidade,
            nfsPorFornecedor,
            nfsPorFilial,
            aging,
            generatedAt: new Date().toISOString(),
        };
    }
    async getDocumentoById(id, input = {}) {
        const parsedId = Number(id);
        const filters = this.parseFilters({
            ...input,
            page: 1,
            pageSize: 1,
            numtransvenda: Number.isFinite(parsedId) ? parsedId : undefined,
        });
        if (!filters.numtransvenda && Number.isNaN(parsedId)) {
            throw new AppError("ID da NF em trânsito inválido.", 400);
        }
        const rows = await this.queryRowsFiltered(filters);
        const doc = rows.map(mapRowToDocumento)[0];
        if (!doc) {
            throw new AppError("NF em trânsito não encontrada para os filtros informados.", 404);
        }
        return doc;
    }
    async getPainelRisco(input = {}) {
        const rows = await this.queryAllRows(input);
        const docs = rows.map(mapRowToDocumento);
        const emRisco = docs.filter((item) => item.emRisco);
        return {
            total: docs.length,
            totalEmRisco: emRisco.length,
            valorEmRisco: Number(emRisco.reduce((sum, item) => sum + item.vltotal, 0).toFixed(2)),
            itens: emRisco,
        };
    }
    async getAgingSla(input = {}) {
        const rows = await this.queryAllRows(input);
        const docs = rows.map(mapRowToDocumento);
        const dentroSla = docs.filter((item) => item.diasEmTransito <= DEFAULT_SLA_DIAS).length;
        const foraSla = docs.length - dentroSla;
        const dashboard = await this.getDashboard(input);
        return {
            slaDias: DEFAULT_SLA_DIAS,
            total: docs.length,
            dentroSla,
            foraSla,
            faixas: dashboard.aging,
            itens: docs,
        };
    }
    async getExcecoesFiscais(input = {}) {
        const rows = await this.queryAllRows(input);
        const docs = rows.map(mapRowToDocumento);
        return this.buildExcecoes(docs);
    }
    async getCadeiaCustodia(id, input = {}) {
        const doc = await this.getDocumentoById(id, input);
        return {
            documento: doc,
            eventos: [
                {
                    etapa: "Pedido gerado",
                    descricao: `Pedido ${doc.numped} vinculado à NF ${doc.numnota}.`,
                    dataHora: doc.dtsaida ?? new Date().toISOString(),
                    status: "CONCLUIDA",
                },
                {
                    etapa: "NF emitida",
                    descricao: `Nota ${doc.numnota} emitida para a filial ${doc.codfilial}.`,
                    dataHora: doc.dtsaida ?? new Date().toISOString(),
                    status: "CONCLUIDA",
                },
                {
                    etapa: "NF em trânsito",
                    descricao: "Documento aguardando entrada/importação na unidade de destino.",
                    dataHora: doc.dtsaida ?? new Date().toISOString(),
                    status: "CONCLUIDA",
                },
                {
                    etapa: "Recebimento/importação",
                    descricao: "Aguardando confirmação de recebimento no sistema de entrada.",
                    dataHora: new Date().toISOString(),
                    status: "PENDENTE",
                },
            ],
        };
    }
    async confirmRecebimento(id) {
        const doc = await this.getDocumentoById(id);
        this.logger.info({
            component: "NFTransitoWinthorService",
            action: "confirmRecebimento",
            id,
            numtransvenda: doc.numtransvenda,
        }, "Confirmacao registrada apenas no fluxo da Torre (consulta WinThor e read-only).");
        return {
            ...doc,
            status: "AGUARDANDO_CONFIRMACAO",
            status_transito: "AGUARDANDO_CONFIRMACAO",
            motivoRisco: "Confirmação solicitada na Torre de Controle. Integração de baixa não altera WinThor.",
            motivo_risco: "Confirmação solicitada na Torre de Controle. Integração de baixa não altera WinThor.",
        };
    }
}
