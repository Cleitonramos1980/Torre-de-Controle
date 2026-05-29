import { randomUUID } from "node:crypto";
import { isOracleEnabled, runOracleTransaction } from "../../db/oracle.js";
import { AppError } from "../../utils/error.js";
import { appendAudit, db, nextId } from "../dataStore.js";
import { execDml, queryOne, queryRows } from "../baseRepository.js";
const INVENTARIO_STATUS = {
    RASCUNHO: "RASCUNHO",
    EM_CONTAGEM: "EM_CONTAGEM",
    AGUARDANDO_VALIDACAO: "AGUARDANDO_VALIDACAO",
    VALIDADO: "VALIDADO",
    FINALIZACAO_SOLICITADA: "FINALIZACAO_SOLICITADA",
    FINALIZADO: "FINALIZADO",
    APROVACAO_PENDENTE: "APROVACAO_PENDENTE",
    FINALIZACAO_APROVADA: "FINALIZACAO_APROVADA",
    EXPORTANDO_WINTHOR: "EXPORTANDO_WINTHOR",
    EXPORTADO_WINTHOR: "EXPORTADO_WINTHOR",
    ERRO_EXPORTACAO_WINTHOR: "ERRO_EXPORTACAO_WINTHOR",
    CANCELADO: "CANCELADO",
};
const EXPORT_STATUS = {
    NAO_EXPORTADO: "NAO_EXPORTADO",
    PRONTO_PARA_EXPORTAR: "PRONTO_PARA_EXPORTAR",
    EXPORTANDO: "EXPORTANDO",
    EXPORTADO: "EXPORTADO",
    ERRO: "ERRO",
    REPROCESSAR: "REPROCESSAR",
    CANCELADO: "CANCELADO",
};
const ITEM_STATUS = {
    PENDENTE: "PENDENTE",
    CONTADO: "CONTADO",
    VALIDADO: "VALIDADO",
    RECONTAGEM: "RECONTAGEM",
    BLOQUEADO: "BLOQUEADO",
};
const LOCKED_INVENTARIO_STATUSES = new Set([
    INVENTARIO_STATUS.FINALIZADO,
    INVENTARIO_STATUS.APROVACAO_PENDENTE,
    INVENTARIO_STATUS.FINALIZACAO_APROVADA,
    INVENTARIO_STATUS.EXPORTANDO_WINTHOR,
    INVENTARIO_STATUS.EXPORTADO_WINTHOR,
]);
const APPROVER_PROFILES = new Set(["ADMIN", "DIRETORIA", "DIRETOR", "GESTOR", "SUPERVISOR"]);
function nowIso() {
    return new Date().toISOString();
}
function toIsoDate(input) {
    if (!input)
        return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(input))
        return input;
    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime()))
        return null;
    return parsed.toISOString().slice(0, 10);
}
function asNumber(value, fallback = null) {
    if (value == null)
        return fallback;
    if (typeof value === "number" && Number.isFinite(value))
        return value;
    if (typeof value === "string") {
        const normalized = Number(value.replace(",", "."));
        if (Number.isFinite(normalized))
            return normalized;
    }
    return fallback;
}
function asUpperTrim(value) {
    if (value == null)
        return "";
    return String(value).trim().toUpperCase();
}
function ensureActorName(actor) {
    return actor?.userName?.trim() || actor?.userId?.trim() || "system";
}
function ensureCanApprove(actor) {
    const profile = String(actor?.profile ?? "").trim().toUpperCase();
    if (!APPROVER_PROFILES.has(profile)) {
        throw new AppError("Usuario sem permissao para aprovar finalizacao do inventario.", 403);
    }
}
function computeConsensus(qt1, qt2, qt3, qtestgerInput) {
    const explicit = asNumber(qtestgerInput);
    if (explicit != null)
        return explicit;
    const a = asNumber(qt1);
    const b = asNumber(qt2);
    const c = asNumber(qt3);
    if (a != null && b != null && a === b)
        return a;
    if (a != null && c != null && a === c)
        return a;
    if (b != null && c != null && b === c)
        return b;
    return null;
}
function computeItemStatus(item) {
    if (item.qtestger == null) {
        const hasDivergence = item.qt1 != null && item.qt2 != null && item.qt1 !== item.qt2;
        if (hasDivergence || (item.qt3 != null && item.qt2 != null && item.qt2 !== item.qt3)) {
            return { status: ITEM_STATUS.RECONTAGEM, needsRecount: 1 };
        }
        return { status: ITEM_STATUS.PENDENTE, needsRecount: 0 };
    }
    if (Number(item.validado ?? 0) === 1) {
        return { status: ITEM_STATUS.VALIDADO, needsRecount: 0 };
    }
    return { status: ITEM_STATUS.CONTADO, needsRecount: 0 };
}
function assertEditableInventario(status) {
    if (LOCKED_INVENTARIO_STATUSES.has(status)) {
        throw new AppError(`Inventario bloqueado para edicao no status ${status}.`, 409);
    }
}
function normalizeCodlocal(value, fallback = "0") {
    const normalized = String(value ?? fallback).trim();
    if (!normalized)
        return fallback;
    return normalized;
}
function normalizeFilial(value) {
    const normalized = asUpperTrim(value);
    if (!normalized)
        return null;
    return normalized.slice(0, 2);
}
function resolveCodfuncMontagem(actor) {
    const actorId = String(actor?.userId ?? "").trim();
    if (/^\d+$/.test(actorId)) {
        const parsed = Number(actorId);
        if (Number.isFinite(parsed) && parsed > 0)
            return parsed;
    }
    const envValue = Number(process.env.PCINVENTROT_CODFUNC_MONTAGEM ?? 309);
    if (Number.isFinite(envValue) && envValue > 0)
        return envValue;
    return 309;
}
function buildIdempotencyKey(inventarioId, itemId, codfilial, codprod, codlocal) {
    return `${inventarioId}|${itemId}|${codfilial}|${codprod}|${codlocal}`;
}
async function writeAudit(modulo, acao, entidade, entidadeId, detalhe, payload, actor) {
    appendAudit(acao, entidade, entidadeId ?? "N/A", detalhe ?? "", ensureActorName(actor));
    if (!isOracleEnabled())
        return;
    await execDml(`INSERT INTO SGQ_AUDITORIA_EVENTOS (
      ID, MODULO, ACAO, ENTIDADE, ENTIDADE_ID, USUARIO_ID, USUARIO_NOME, PERFIL, DETALHE, PAYLOAD
    ) VALUES (
      :id, :modulo, :acao, :entidade, :entidadeId, :usuarioId, :usuarioNome, :perfil, :detalhe, :payload
    )`, {
        id: randomUUID(),
        modulo,
        acao,
        entidade,
        entidadeId: entidadeId ?? null,
        usuarioId: actor?.userId ?? null,
        usuarioNome: ensureActorName(actor),
        perfil: actor?.profile ?? null,
        detalhe: detalhe ?? null,
        payload: payload ? JSON.stringify(payload) : null,
    });
}
function ensureFallbackCollections() {
    if (!Array.isArray(db.inventarioInternoHeaders))
        db.inventarioInternoHeaders = [];
    if (!Array.isArray(db.inventarioInternoItens))
        db.inventarioInternoItens = [];
    if (!Array.isArray(db.inventarioInternoExportacoes))
        db.inventarioInternoExportacoes = [];
    if (!Array.isArray(db.inventarioInternoFilialMap))
        db.inventarioInternoFilialMap = [];
}
function mapHeaderFallback(row) {
    return {
        id: String(row.id),
        numero: String(row.numero),
        lojaId: String(row.lojaId),
        lojaNome: String(row.lojaNome ?? ""),
        filialWinthor: row.filialWinthor ? String(row.filialWinthor) : null,
        codlocalWinthor: normalizeCodlocal(row.codlocalWinthor, "0"),
        origem: String(row.origem ?? "TORRE_CONTROLE"),
        observacoes: row.observacoes ? String(row.observacoes) : "",
        status: String(row.status),
        itensTotal: Number(row.itensTotal ?? 0),
        itensContados: Number(row.itensContados ?? 0),
        acuracidade: Number(row.acuracidade ?? 0),
        criadoEm: row.criadoEm ?? null,
        criadoPor: row.criadoPor ?? null,
        finalizadoEm: row.finalizadoEm ?? null,
        finalizadoPor: row.finalizadoPor ?? null,
        aprovacaoSolicitadaEm: row.aprovacaoSolicitadaEm ?? null,
        aprovacaoSolicitadaPor: row.aprovacaoSolicitadaPor ?? null,
        aprovadoEm: row.aprovadoEm ?? null,
        aprovadoPor: row.aprovadoPor ?? null,
        exportNuminvent: row.exportNuminvent ?? null,
        exportStatus: String(row.exportStatus ?? EXPORT_STATUS.NAO_EXPORTADO),
        exportLote: row.exportLote ?? null,
        exportErro: row.exportErro ?? null,
        exportadoEm: row.exportadoEm ?? null,
        exportadoPor: row.exportadoPor ?? null,
    };
}
function mapItemFallback(row) {
    return {
        id: String(row.id),
        inventarioId: String(row.inventarioId),
        ordemItem: Number(row.ordemItem ?? 0),
        codprod: row.codprod == null ? null : Number(row.codprod),
        codigoItem: row.codigoItem ? String(row.codigoItem) : "",
        descricao: String(row.descricao ?? ""),
        codlocalWinthor: normalizeCodlocal(row.codlocalWinthor, "0"),
        qt1: asNumber(row.qt1),
        qt2: asNumber(row.qt2),
        qt3: asNumber(row.qt3),
        qtestger: asNumber(row.qtestger),
        divergencia: asNumber(row.divergencia),
        statusItem: String(row.statusItem ?? ITEM_STATUS.PENDENTE),
        necessitaRecontagem: Number(row.necessitaRecontagem ?? 0),
        validado: Number(row.validado ?? 0),
        validadoEm: row.validadoEm ?? null,
        validadoPor: row.validadoPor ?? null,
        responsavelContagem: row.responsavelContagem ?? null,
        contadoEm: row.contadoEm ?? null,
        observacao: row.observacao ?? null,
        exportStatus: String(row.exportStatus ?? EXPORT_STATUS.NAO_EXPORTADO),
        ultimoErroExport: row.ultimoErroExport ?? null,
        createdAt: row.createdAt ?? null,
        updatedAt: row.updatedAt ?? null,
    };
}
function mapExportFallback(row) {
    return {
        id: String(row.id),
        inventarioId: String(row.inventarioId),
        itemId: row.itemId ? String(row.itemId) : null,
        loteId: String(row.loteId),
        idempotencyKey: String(row.idempotencyKey),
        numinvent: row.numinvent == null ? null : Number(row.numinvent),
        codfilial: row.codfilial ? String(row.codfilial) : null,
        codprod: row.codprod == null ? null : Number(row.codprod),
        codlocal: row.codlocal ? String(row.codlocal) : null,
        modo: String(row.modo),
        status: String(row.status),
        tentativa: Number(row.tentativa ?? 1),
        erro: row.erro ?? null,
        aprovadoPor: row.aprovadoPor ?? null,
        executadoPor: row.executadoPor ?? null,
        criadoEm: row.criadoEm ?? null,
        sucessoEm: row.sucessoEm ?? null,
    };
}
async function getLojasMapOracle() {
    const rows = await queryRows(`SELECT ID, NOME, CODIGO FROM LOJAS_INVENTARIO WHERE ATIVO = 1`);
    const map = new Map();
    for (const row of rows) {
        map.set(String(row.ID), {
            id: String(row.ID),
            nome: String(row.NOME),
            codigo: String(row.CODIGO),
        });
    }
    return map;
}
async function getHeaderByIdOracle(id) {
    const row = await queryOne(`SELECT
      h.ID,
      h.NUMERO,
      h.LOJA_ID,
      l.NOME AS LOJA_NOME,
      h.FILIAL_WINTHOR,
      h.CODLOCAL_WINTHOR,
      h.ORIGEM,
      h.OBSERVACOES,
      h.STATUS,
      h.ITENS_TOTAL,
      h.ITENS_CONTADOS,
      h.ACURACIDADE,
      TO_CHAR(h.CRIADO_EM, 'YYYY-MM-DD\"T\"HH24:MI:SS') AS CRIADO_EM,
      h.CRIADO_POR,
      TO_CHAR(h.FINALIZADO_EM, 'YYYY-MM-DD\"T\"HH24:MI:SS') AS FINALIZADO_EM,
      h.FINALIZADO_POR,
      TO_CHAR(h.APROVACAO_SOLICITADA_EM, 'YYYY-MM-DD\"T\"HH24:MI:SS') AS APROVACAO_SOLICITADA_EM,
      h.APROVACAO_SOLICITADA_POR,
      TO_CHAR(h.APROVADO_EM, 'YYYY-MM-DD\"T\"HH24:MI:SS') AS APROVADO_EM,
      h.APROVADO_POR,
      h.EXPORT_NUMINVENT,
      h.EXPORT_STATUS,
      h.EXPORT_LOTE,
      h.EXPORT_ERRO,
      TO_CHAR(h.EXPORTADO_EM, 'YYYY-MM-DD\"T\"HH24:MI:SS') AS EXPORTADO_EM,
      h.EXPORTADO_POR
    FROM INVENTARIO_INTERNO_TC h
    JOIN LOJAS_INVENTARIO l ON l.ID = h.LOJA_ID
    WHERE h.ID = :id`, { id });
    if (!row)
        return null;
    return {
        id: String(row.ID),
        numero: String(row.NUMERO),
        lojaId: String(row.LOJA_ID),
        lojaNome: String(row.LOJA_NOME ?? ""),
        filialWinthor: row.FILIAL_WINTHOR ? String(row.FILIAL_WINTHOR) : null,
        codlocalWinthor: normalizeCodlocal(row.CODLOCAL_WINTHOR, "0"),
        origem: String(row.ORIGEM ?? "TORRE_CONTROLE"),
        observacoes: String(row.OBSERVACOES ?? ""),
        status: String(row.STATUS),
        itensTotal: Number(row.ITENS_TOTAL ?? 0),
        itensContados: Number(row.ITENS_CONTADOS ?? 0),
        acuracidade: Number(row.ACURACIDADE ?? 0),
        criadoEm: row.CRIADO_EM ?? null,
        criadoPor: row.CRIADO_POR ?? null,
        finalizadoEm: row.FINALIZADO_EM ?? null,
        finalizadoPor: row.FINALIZADO_POR ?? null,
        aprovacaoSolicitadaEm: row.APROVACAO_SOLICITADA_EM ?? null,
        aprovacaoSolicitadaPor: row.APROVACAO_SOLICITADA_POR ?? null,
        aprovadoEm: row.APROVADO_EM ?? null,
        aprovadoPor: row.APROVADO_POR ?? null,
        exportNuminvent: row.EXPORT_NUMINVENT == null ? null : Number(row.EXPORT_NUMINVENT),
        exportStatus: String(row.EXPORT_STATUS ?? EXPORT_STATUS.NAO_EXPORTADO),
        exportLote: row.EXPORT_LOTE ?? null,
        exportErro: row.EXPORT_ERRO ?? null,
        exportadoEm: row.EXPORTADO_EM ?? null,
        exportadoPor: row.EXPORTADO_POR ?? null,
    };
}
async function listItemsByInventarioIdOracle(inventarioId) {
    const rows = await queryRows(`SELECT
      ID,
      INVENTARIO_ID,
      ORDEM_ITEM,
      CODPROD,
      CODIGO_ITEM,
      CODLOCAL_WINTHOR,
      DESCRICAO,
      QT1,
      QT2,
      QT3,
      QTESTGER,
      DIVERGENCIA,
      STATUS_ITEM,
      NECESSITA_RECONTAGEM,
      VALIDADO,
      TO_CHAR(VALIDADO_EM, 'YYYY-MM-DD\"T\"HH24:MI:SS') AS VALIDADO_EM,
      VALIDADO_POR,
      RESPONSAVEL_CONTAGEM,
      TO_CHAR(CONTADO_EM, 'YYYY-MM-DD\"T\"HH24:MI:SS') AS CONTADO_EM,
      OBSERVACAO,
      EXPORT_STATUS,
      ULTIMO_ERRO_EXPORT,
      TO_CHAR(CREATED_AT, 'YYYY-MM-DD\"T\"HH24:MI:SS') AS CREATED_AT,
      TO_CHAR(UPDATED_AT, 'YYYY-MM-DD\"T\"HH24:MI:SS') AS UPDATED_AT
    FROM INVENTARIO_INTERNO_ITEM_TC
    WHERE INVENTARIO_ID = :inventarioId
    ORDER BY ORDEM_ITEM, ID`, { inventarioId });
    return rows.map((row) => ({
        id: String(row.ID),
        inventarioId: String(row.INVENTARIO_ID),
        ordemItem: Number(row.ORDEM_ITEM ?? 0),
        codprod: row.CODPROD == null ? null : Number(row.CODPROD),
        codigoItem: String(row.CODIGO_ITEM ?? ""),
        descricao: String(row.DESCRICAO ?? ""),
        codlocalWinthor: normalizeCodlocal(row.CODLOCAL_WINTHOR, "0"),
        qt1: asNumber(row.QT1),
        qt2: asNumber(row.QT2),
        qt3: asNumber(row.QT3),
        qtestger: asNumber(row.QTESTGER),
        divergencia: asNumber(row.DIVERGENCIA),
        statusItem: String(row.STATUS_ITEM ?? ITEM_STATUS.PENDENTE),
        necessitaRecontagem: Number(row.NECESSITA_RECONTAGEM ?? 0),
        validado: Number(row.VALIDADO ?? 0),
        validadoEm: row.VALIDADO_EM ?? null,
        validadoPor: row.VALIDADO_POR ?? null,
        responsavelContagem: row.RESPONSAVEL_CONTAGEM ?? null,
        contadoEm: row.CONTADO_EM ?? null,
        observacao: row.OBSERVACAO ?? null,
        exportStatus: String(row.EXPORT_STATUS ?? EXPORT_STATUS.NAO_EXPORTADO),
        ultimoErroExport: row.ULTIMO_ERRO_EXPORT ?? null,
        createdAt: row.CREATED_AT ?? null,
        updatedAt: row.UPDATED_AT ?? null,
    }));
}
async function listExportRowsOracle(inventarioId) {
    const rows = await queryRows(`SELECT
      ID,
      INVENTARIO_ID,
      ITEM_ID,
      LOTE_ID,
      IDEMPOTENCY_KEY,
      NUMINVENT,
      CODFILIAL,
      CODPROD,
      CODLOCAL,
      MODO,
      STATUS,
      TENTATIVA,
      ERRO,
      APROVADO_POR,
      EXECUTADO_POR,
      TO_CHAR(CRIADO_EM, 'YYYY-MM-DD\"T\"HH24:MI:SS') AS CRIADO_EM,
      TO_CHAR(SUCESSO_EM, 'YYYY-MM-DD\"T\"HH24:MI:SS') AS SUCESSO_EM
    FROM INVENTARIO_EXPORT_WINTHOR_TC
    WHERE INVENTARIO_ID = :inventarioId
    ORDER BY CRIADO_EM DESC, ID DESC`, { inventarioId });
    return rows.map((row) => ({
        id: String(row.ID),
        inventarioId: String(row.INVENTARIO_ID),
        itemId: row.ITEM_ID ? String(row.ITEM_ID) : null,
        loteId: String(row.LOTE_ID ?? ""),
        idempotencyKey: String(row.IDEMPOTENCY_KEY),
        numinvent: row.NUMINVENT == null ? null : Number(row.NUMINVENT),
        codfilial: row.CODFILIAL ? String(row.CODFILIAL) : null,
        codprod: row.CODPROD == null ? null : Number(row.CODPROD),
        codlocal: row.CODLOCAL ? String(row.CODLOCAL) : null,
        modo: String(row.MODO),
        status: String(row.STATUS),
        tentativa: Number(row.TENTATIVA ?? 1),
        erro: row.ERRO ?? null,
        aprovadoPor: row.APROVADO_POR ?? null,
        executadoPor: row.EXECUTADO_POR ?? null,
        criadoEm: row.CRIADO_EM ?? null,
        sucessoEm: row.SUCESSO_EM ?? null,
    }));
}
async function recalcHeaderOracle(inventarioId, actor) {
    const agg = await queryOne(`SELECT
      COUNT(*) AS TOTAL,
      SUM(CASE WHEN QTESTGER IS NOT NULL THEN 1 ELSE 0 END) AS CONTADOS,
      SUM(CASE WHEN NECESSITA_RECONTAGEM = 1 THEN 1 ELSE 0 END) AS RECONTAGEM
    FROM INVENTARIO_INTERNO_ITEM_TC
    WHERE INVENTARIO_ID = :inventarioId`, { inventarioId });
    const total = Number(agg?.TOTAL ?? 0);
    const contados = Number(agg?.CONTADOS ?? 0);
    const recontagem = Number(agg?.RECONTAGEM ?? 0);
    const acuracidade = total > 0 ? Number((((total - recontagem) / total) * 100).toFixed(2)) : 0;
    await execDml(`UPDATE INVENTARIO_INTERNO_TC
      SET ITENS_TOTAL = :total,
          ITENS_CONTADOS = :contados,
          ACURACIDADE = :acuracidade,
          UPDATED_AT = SYSTIMESTAMP,
          UPDATED_BY = :updatedBy
    WHERE ID = :id`, {
        id: inventarioId,
        total,
        contados,
        acuracidade,
        updatedBy: ensureActorName(actor),
    });
}
function recalcHeaderFallback(inventarioId, actor) {
    ensureFallbackCollections();
    const header = db.inventarioInternoHeaders.find((row) => row.id === inventarioId);
    if (!header)
        return;
    const items = db.inventarioInternoItens.filter((row) => row.inventarioId === inventarioId);
    const total = items.length;
    const contados = items.filter((row) => row.qtestger != null).length;
    const recontagem = items.filter((row) => Number(row.necessitaRecontagem ?? 0) === 1).length;
    const acuracidade = total > 0 ? Number((((total - recontagem) / total) * 100).toFixed(2)) : 0;
    header.itensTotal = total;
    header.itensContados = contados;
    header.acuracidade = acuracidade;
    header.updatedAt = nowIso();
    header.updatedBy = ensureActorName(actor);
}
function validateForFinalization(header, items) {
    const errors = [];
    if (!header)
        errors.push("Inventario interno nao encontrado.");
    if (!Array.isArray(items) || items.length === 0)
        errors.push("Inventario sem itens para finalizacao.");
    for (const item of items ?? []) {
        if (item.qtestger == null) {
            errors.push(`Item ${item.id} sem quantidade final (QTESTGER).`);
        }
        if (Number(item.necessitaRecontagem ?? 0) === 1) {
            errors.push(`Item ${item.id} ainda com necessidade de recontagem.`);
        }
        if (item.codprod == null || !Number.isFinite(Number(item.codprod))) {
            errors.push(`Item ${item.id} sem CODPROD valido.`);
        }
    }
    return errors;
}
function normalizeExportEnv() {
    const enabled = /^(1|true|yes|on)$/i.test(String(process.env.ENABLE_PCINVENTROT_EXPORT ?? "false"));
    const mode = String(process.env.PCINVENTROT_EXPORT_MODE ?? "dry-run").trim().toLowerCase();
    const numinventStrategy = String(process.env.PCINVENTROT_NUMINVENT_STRATEGY ?? "PCCONSUM").trim().toUpperCase();
    const dryRunDefault = mode !== "real";
    return { enabled, mode, dryRunDefault, numinventStrategy };
}
async function fetchPcInventrotColumns() {
    const rows = await queryRows(`SELECT COLUMN_NAME
      FROM ALL_TAB_COLUMNS
     WHERE OWNER = 'U_CC4UJM_WI'
       AND TABLE_NAME = 'PCINVENTROT'`);
    return new Set(rows.map((row) => String(row.COLUMN_NAME).toUpperCase()));
}
async function checkFilialExists(codfilial) {
    const row = await queryOne(`SELECT COUNT(*) AS CNT
      FROM PCFILIAL
     WHERE TRIM(TO_CHAR(CODIGO)) = TRIM(:codfilial)`, { codfilial });
    return Number(row?.CNT ?? 0) > 0;
}
async function checkProductExists(codprod) {
    const row = await queryOne(`SELECT COUNT(*) AS CNT
      FROM PCPRODUT
     WHERE CODPROD = :codprod`, { codprod });
    return Number(row?.CNT ?? 0) > 0;
}
async function checkCodlocalValid(codlocal) {
    if (String(codlocal).trim() === "0")
        return true;
    const row = await queryOne(`SELECT COUNT(*) AS CNT
      FROM PCLOCALINVENTARIO
     WHERE TRIM(TO_CHAR(CODLOCAL)) = TRIM(:codlocal)`, { codlocal });
    return Number(row?.CNT ?? 0) > 0;
}
async function hasOpenInventarioForProduct(codprod, codfilial, numinventExclude = null) {
    const row = await queryOne(`SELECT 1 AS CNT
      FROM PCINVENTROT
     WHERE CODPROD = :codprod
       AND CODFILIAL = :codfilial
       AND DTATUALIZACAO IS NULL
       AND (:numinventExclude IS NULL OR NUMINVENT <> :numinventExclude)
       AND ROWNUM = 1`, {
        codprod,
        codfilial,
        numinventExclude,
    });
    return !!row;
}
async function hasInventarioJaAtualizado(numinvent, codfilial) {
    const row = await queryOne(`SELECT 1 AS CNT
      FROM PCINVENTROT
     WHERE NUMINVENT = :numinvent
       AND CODFILIAL = :codfilial
       AND DTATUALIZACAO IS NOT NULL
       AND ROWNUM = 1`, {
        numinvent,
        codfilial,
    });
    return !!row;
}
function resolveTipoCustoFromValue(value) {
    const tipo = String(value ?? "").trim().toUpperCase();
    if (["F", "P", "R", "U", "C"].includes(tipo))
        return tipo;
    return "F";
}
async function getTipoCustoAjuste() {
    const row = await queryOne(`SELECT NVL(TIPOCUSTOAJUSTE, 'F') AS TIPO FROM PCCONSUM`);
    return resolveTipoCustoFromValue(row?.TIPO ?? "F");
}
async function getEstoqueECustoProduto(codprod, codfilial, tipoCusto) {
    const row = await queryOne(`SELECT NVL(QTEST, 0) QTEST,
       NVL((CASE
              WHEN :tipoCusto = 'F' THEN NVL(CUSTOFIN, 0)
              WHEN :tipoCusto = 'P' THEN NVL(CUSTOREP, 0)
              WHEN :tipoCusto = 'R' THEN NVL(CUSTOREAL, 0)
              WHEN :tipoCusto = 'U' THEN NVL(CUSTOULTENT, 0)
              WHEN :tipoCusto = 'C' THEN NVL(CUSTOCONT, 0)
            END), 0) CUSTO
      FROM PCEST
     WHERE CODPROD = :codprod
       AND CODFILIAL = :codfilial`, {
        tipoCusto,
        codprod,
        codfilial,
    });
    return {
        qtest: asNumber(row?.QTEST, 0) ?? 0,
        custo: asNumber(row?.CUSTO, 0) ?? 0,
    };
}
async function getMappedFilialByLojaOracle(lojaId) {
    const row = await queryOne(`SELECT FILIAL_WINTHOR, CODLOCAL_WINTHOR
      FROM INVENTARIO_FILIAL_MAP_TC
     WHERE LOJA_ID = :lojaId
       AND ATIVO = 1`, { lojaId });
    if (!row)
        return { filialWinthor: null, codlocalWinthor: "0" };
    return {
        filialWinthor: normalizeFilial(row.FILIAL_WINTHOR),
        codlocalWinthor: normalizeCodlocal(row.CODLOCAL_WINTHOR, "0"),
    };
}
function getMappedFilialByLojaFallback(lojaId) {
    ensureFallbackCollections();
    const row = db.inventarioInternoFilialMap.find((m) => m.lojaId === lojaId && Number(m.ativo ?? 1) === 1);
    if (!row)
        return { filialWinthor: null, codlocalWinthor: "0" };
    return {
        filialWinthor: normalizeFilial(row.filialWinthor),
        codlocalWinthor: normalizeCodlocal(row.codlocalWinthor, "0"),
    };
}
async function getInventarioComItens(id) {
    if (!isOracleEnabled()) {
        ensureFallbackCollections();
        const lojasMap = new Map((db.inventarioLojas ?? []).map((l) => [String(l.id), l]));
        const headerRaw = db.inventarioInternoHeaders.find((row) => row.id === id);
        if (!headerRaw)
            return null;
        const header = mapHeaderFallback({
            ...headerRaw,
            lojaNome: headerRaw.lojaNome ?? lojasMap.get(String(headerRaw.lojaId))?.nome ?? "",
        });
        const items = db.inventarioInternoItens.filter((row) => row.inventarioId === id).map(mapItemFallback);
        const exportacoes = db.inventarioInternoExportacoes
            .filter((row) => row.inventarioId === id)
            .map(mapExportFallback);
        return { ...header, items, exportacoes };
    }
    const header = await getHeaderByIdOracle(id);
    if (!header)
        return null;
    const items = await listItemsByInventarioIdOracle(id);
    const exportacoes = await listExportRowsOracle(id);
    return { ...header, items, exportacoes };
}
export const inventarioInternoRepository = {
    async listFilialMappings() {
        if (!isOracleEnabled()) {
            ensureFallbackCollections();
            const lojasMap = new Map((db.inventarioLojas ?? []).map((l) => [String(l.id), l]));
            return db.inventarioInternoFilialMap.map((row) => ({
                id: String(row.id),
                lojaId: String(row.lojaId),
                lojaNome: String(lojasMap.get(String(row.lojaId))?.nome ?? ""),
                filialWinthor: row.filialWinthor ? String(row.filialWinthor) : null,
                codlocalWinthor: normalizeCodlocal(row.codlocalWinthor, "0"),
                ativo: Number(row.ativo ?? 1) === 1,
                observacoes: String(row.observacoes ?? ""),
            }));
        }
        const rows = await queryRows(`SELECT
          m.ID,
          m.LOJA_ID,
          l.NOME AS LOJA_NOME,
          m.FILIAL_WINTHOR,
          m.CODLOCAL_WINTHOR,
          m.ATIVO,
          m.OBSERVACOES
        FROM INVENTARIO_FILIAL_MAP_TC m
        JOIN LOJAS_INVENTARIO l ON l.ID = m.LOJA_ID
        ORDER BY l.CODIGO`);
        return rows.map((row) => ({
            id: String(row.ID),
            lojaId: String(row.LOJA_ID),
            lojaNome: String(row.LOJA_NOME),
            filialWinthor: row.FILIAL_WINTHOR ? String(row.FILIAL_WINTHOR) : null,
            codlocalWinthor: normalizeCodlocal(row.CODLOCAL_WINTHOR, "0"),
            ativo: Number(row.ATIVO ?? 1) === 1,
            observacoes: String(row.OBSERVACOES ?? ""),
        }));
    },
    async upsertFilialMapping(payload, actor) {
        const lojaId = String(payload?.lojaId ?? "").trim();
        if (!lojaId)
            throw new AppError("lojaId obrigatorio para mapear filial WinThor.", 400);
        const filialWinthor = normalizeFilial(payload?.filialWinthor);
        const codlocalWinthor = normalizeCodlocal(payload?.codlocalWinthor, "0");
        const ativo = payload?.ativo === false ? 0 : 1;
        const observacoes = String(payload?.observacoes ?? "").slice(0, 1000);
        if (!isOracleEnabled()) {
            ensureFallbackCollections();
            const loja = (db.inventarioLojas ?? []).find((l) => String(l.id) === lojaId);
            if (!loja)
                throw new AppError("Loja nao encontrada para mapeamento.", 404);
            const existing = db.inventarioInternoFilialMap.find((m) => String(m.lojaId) === lojaId);
            if (existing) {
                existing.filialWinthor = filialWinthor;
                existing.codlocalWinthor = codlocalWinthor;
                existing.ativo = ativo;
                existing.observacoes = observacoes;
                existing.updatedAt = nowIso();
            }
            else {
                db.inventarioInternoFilialMap.push({
                    id: nextId("IFM", db.inventarioInternoFilialMap.length),
                    lojaId,
                    filialWinthor,
                    codlocalWinthor,
                    ativo,
                    observacoes,
                    createdAt: nowIso(),
                    updatedAt: nowIso(),
                });
            }
            const result = await this.listFilialMappings();
            await writeAudit("INVENTARIO_INTERNO", "UPSERT", "FILIAL_MAP", lojaId, "Mapeamento de filial WinThor atualizado.", { lojaId, filialWinthor, codlocalWinthor, ativo }, actor);
            return result.find((row) => row.lojaId === lojaId) ?? null;
        }
        const lojaExists = await queryOne(`SELECT ID FROM LOJAS_INVENTARIO WHERE ID = :id`, { id: lojaId });
        if (!lojaExists)
            throw new AppError("Loja nao encontrada para mapeamento.", 404);
        await execDml(`MERGE INTO INVENTARIO_FILIAL_MAP_TC t
      USING (SELECT :lojaId AS LOJA_ID FROM DUAL) s
      ON (t.LOJA_ID = s.LOJA_ID)
      WHEN MATCHED THEN
        UPDATE SET FILIAL_WINTHOR = :filialWinthor,
                   CODLOCAL_WINTHOR = :codlocalWinthor,
                   ATIVO = :ativo,
                   OBSERVACOES = :observacoes,
                   UPDATED_AT = SYSTIMESTAMP
      WHEN NOT MATCHED THEN
        INSERT (ID, LOJA_ID, FILIAL_WINTHOR, CODLOCAL_WINTHOR, ATIVO, OBSERVACOES, CREATED_AT, UPDATED_AT)
        VALUES (:id, :lojaId, :filialWinthor, :codlocalWinthor, :ativo, :observacoes, SYSTIMESTAMP, SYSTIMESTAMP)`, {
            id: randomUUID(),
            lojaId,
            filialWinthor,
            codlocalWinthor,
            ativo,
            observacoes,
        });
        await writeAudit("INVENTARIO_INTERNO", "UPSERT", "FILIAL_MAP", lojaId, "Mapeamento de filial WinThor atualizado.", { lojaId, filialWinthor, codlocalWinthor, ativo }, actor);
        const result = await this.listFilialMappings();
        return result.find((row) => row.lojaId === lojaId) ?? null;
    },
    async createInventarioInterno(payload, actor) {
        const lojaId = String(payload?.lojaId ?? "").trim();
        if (!lojaId)
            throw new AppError("lojaId obrigatorio para criar inventario interno.", 400);
        const numero = String(payload?.numero ?? `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomUUID().slice(0, 8)}`).trim().slice(0, 60);
        const origem = String(payload?.origem ?? "TORRE_CONTROLE").trim().slice(0, 80) || "TORRE_CONTROLE";
        const observacoes = String(payload?.observacoes ?? "").slice(0, 2000);
        const status = INVENTARIO_STATUS.RASCUNHO;
        const filialFromPayload = normalizeFilial(payload?.filialWinthor);
        const codlocalFromPayload = normalizeCodlocal(payload?.codlocalWinthor, "0");
        const createdBy = ensureActorName(actor);
        const payloadItens = Array.isArray(payload?.itens) ? payload.itens : [];
        if (!isOracleEnabled()) {
            ensureFallbackCollections();
            const loja = (db.inventarioLojas ?? []).find((row) => String(row.id) === lojaId);
            if (!loja)
                throw new AppError("Loja nao encontrada para criar inventario interno.", 404);
            const map = getMappedFilialByLojaFallback(lojaId);
            const id = nextId("INVINT", db.inventarioInternoHeaders.length);
            db.inventarioInternoHeaders.push({
                id,
                numero,
                lojaId,
                lojaNome: String(loja.nome ?? ""),
                filialWinthor: filialFromPayload ?? map.filialWinthor,
                codlocalWinthor: codlocalFromPayload || map.codlocalWinthor || "0",
                origem,
                observacoes,
                status,
                itensTotal: 0,
                itensContados: 0,
                acuracidade: 0,
                criadoEm: nowIso(),
                criadoPor: createdBy,
                exportStatus: EXPORT_STATUS.NAO_EXPORTADO,
                createdAt: nowIso(),
                updatedAt: nowIso(),
                updatedBy: createdBy,
            });
            await writeAudit("INVENTARIO_INTERNO", "CRIAR", "INVENTARIO_INTERNO", id, "Inventario interno criado em fallback.", { lojaId, numero }, actor);
            if (payloadItens.length > 0) {
                await this.addItensInventarioInterno(id, { itens: payloadItens }, actor);
                await this.updateInventarioStatus(id, INVENTARIO_STATUS.EM_CONTAGEM, actor, "Inventario movido para EM_CONTAGEM apos inclusao de itens.");
            }
            return this.getInventarioInternoById(id);
        }
        const lojaExists = await queryOne(`SELECT ID FROM LOJAS_INVENTARIO WHERE ID = :id`, { id: lojaId });
        if (!lojaExists)
            throw new AppError("Loja nao encontrada para criar inventario interno.", 404);
        const map = await getMappedFilialByLojaOracle(lojaId);
        const id = String(payload?.id ?? randomUUID());
        await execDml(`INSERT INTO INVENTARIO_INTERNO_TC (
        ID, NUMERO, LOJA_ID, FILIAL_WINTHOR, CODLOCAL_WINTHOR, ORIGEM, OBSERVACOES, STATUS,
        ITENS_TOTAL, ITENS_CONTADOS, ACURACIDADE, CRIADO_EM, CRIADO_POR, EXPORT_STATUS, CREATED_AT, UPDATED_AT, UPDATED_BY
      ) VALUES (
        :id, :numero, :lojaId, :filialWinthor, :codlocalWinthor, :origem, :observacoes, :status,
        0, 0, 0, SYSTIMESTAMP, :criadoPor, :exportStatus, SYSTIMESTAMP, SYSTIMESTAMP, :updatedBy
      )`, {
            id,
            numero,
            lojaId,
            filialWinthor: filialFromPayload ?? map.filialWinthor,
            codlocalWinthor: codlocalFromPayload || map.codlocalWinthor || "0",
            origem,
            observacoes,
            status,
            criadoPor: createdBy,
            exportStatus: EXPORT_STATUS.NAO_EXPORTADO,
            updatedBy: createdBy,
        });
        await writeAudit("INVENTARIO_INTERNO", "CRIAR", "INVENTARIO_INTERNO", id, "Inventario interno criado.", { lojaId, numero }, actor);
        if (payloadItens.length > 0) {
            await this.addItensInventarioInterno(id, { itens: payloadItens }, actor);
            await this.updateInventarioStatus(id, INVENTARIO_STATUS.EM_CONTAGEM, actor, "Inventario movido para EM_CONTAGEM apos inclusao de itens.");
        }
        return this.getInventarioInternoById(id);
    },
    async listInventariosInternos(filters = {}) {
        const statusFilter = filters?.status ? String(filters.status).trim().toUpperCase() : null;
        const lojaFilter = filters?.lojaId ? String(filters.lojaId).trim() : null;
        if (!isOracleEnabled()) {
            ensureFallbackCollections();
            let headers = db.inventarioInternoHeaders.map(mapHeaderFallback);
            if (statusFilter)
                headers = headers.filter((row) => row.status === statusFilter);
            if (lojaFilter)
                headers = headers.filter((row) => row.lojaId === lojaFilter);
            return headers.sort((a, b) => String(b.criadoEm ?? "").localeCompare(String(a.criadoEm ?? "")));
        }
        const binds = {};
        const where = [];
        if (statusFilter) {
            binds.status = statusFilter;
            where.push("h.STATUS = :status");
        }
        if (lojaFilter) {
            binds.lojaId = lojaFilter;
            where.push("h.LOJA_ID = :lojaId");
        }
        const rows = await queryRows(`SELECT
      h.ID,
      h.NUMERO,
      h.LOJA_ID,
      l.NOME AS LOJA_NOME,
      h.FILIAL_WINTHOR,
      h.CODLOCAL_WINTHOR,
      h.ORIGEM,
      h.OBSERVACOES,
      h.STATUS,
      h.ITENS_TOTAL,
      h.ITENS_CONTADOS,
      h.ACURACIDADE,
      TO_CHAR(h.CRIADO_EM, 'YYYY-MM-DD\"T\"HH24:MI:SS') AS CRIADO_EM,
      h.CRIADO_POR,
      TO_CHAR(h.FINALIZADO_EM, 'YYYY-MM-DD\"T\"HH24:MI:SS') AS FINALIZADO_EM,
      h.FINALIZADO_POR,
      TO_CHAR(h.APROVACAO_SOLICITADA_EM, 'YYYY-MM-DD\"T\"HH24:MI:SS') AS APROVACAO_SOLICITADA_EM,
      h.APROVACAO_SOLICITADA_POR,
      TO_CHAR(h.APROVADO_EM, 'YYYY-MM-DD\"T\"HH24:MI:SS') AS APROVADO_EM,
      h.APROVADO_POR,
      h.EXPORT_NUMINVENT,
      h.EXPORT_STATUS,
      h.EXPORT_LOTE,
      h.EXPORT_ERRO,
      TO_CHAR(h.EXPORTADO_EM, 'YYYY-MM-DD\"T\"HH24:MI:SS') AS EXPORTADO_EM,
      h.EXPORTADO_POR
    FROM INVENTARIO_INTERNO_TC h
    JOIN LOJAS_INVENTARIO l ON l.ID = h.LOJA_ID
    ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY h.CRIADO_EM DESC, h.NUMERO DESC`, binds);
        return rows.map((row) => ({
            id: String(row.ID),
            numero: String(row.NUMERO),
            lojaId: String(row.LOJA_ID),
            lojaNome: String(row.LOJA_NOME ?? ""),
            filialWinthor: row.FILIAL_WINTHOR ? String(row.FILIAL_WINTHOR) : null,
            codlocalWinthor: normalizeCodlocal(row.CODLOCAL_WINTHOR, "0"),
            origem: String(row.ORIGEM ?? "TORRE_CONTROLE"),
            observacoes: String(row.OBSERVACOES ?? ""),
            status: String(row.STATUS),
            itensTotal: Number(row.ITENS_TOTAL ?? 0),
            itensContados: Number(row.ITENS_CONTADOS ?? 0),
            acuracidade: Number(row.ACURACIDADE ?? 0),
            criadoEm: row.CRIADO_EM ?? null,
            criadoPor: row.CRIADO_POR ?? null,
            finalizadoEm: row.FINALIZADO_EM ?? null,
            finalizadoPor: row.FINALIZADO_POR ?? null,
            aprovacaoSolicitadaEm: row.APROVACAO_SOLICITADA_EM ?? null,
            aprovacaoSolicitadaPor: row.APROVACAO_SOLICITADA_POR ?? null,
            aprovadoEm: row.APROVADO_EM ?? null,
            aprovadoPor: row.APROVADO_POR ?? null,
            exportNuminvent: row.EXPORT_NUMINVENT == null ? null : Number(row.EXPORT_NUMINVENT),
            exportStatus: String(row.EXPORT_STATUS ?? EXPORT_STATUS.NAO_EXPORTADO),
            exportLote: row.EXPORT_LOTE ?? null,
            exportErro: row.EXPORT_ERRO ?? null,
            exportadoEm: row.EXPORTADO_EM ?? null,
            exportadoPor: row.EXPORTADO_POR ?? null,
        }));
    },
    async getInventarioInternoById(id) {
        const result = await getInventarioComItens(String(id));
        if (!result)
            return null;
        return {
            ...result,
            bloqueadoEdicao: LOCKED_INVENTARIO_STATUSES.has(result.status),
        };
    },
    async addItensInventarioInterno(inventarioId, payload, actor) {
        const id = String(inventarioId);
        const header = await this.getInventarioInternoById(id);
        if (!header)
            throw new AppError("Inventario interno nao encontrado.", 404);
        assertEditableInventario(header.status);
        const itens = Array.isArray(payload?.itens) ? payload.itens : [];
        if (itens.length === 0)
            throw new AppError("Nenhum item informado para inclusao.", 400);
        if (!isOracleEnabled()) {
            ensureFallbackCollections();
            let ordem = db.inventarioInternoItens.filter((row) => row.inventarioId === id).length + 1;
            for (const item of itens) {
                const codprod = asNumber(item?.codprod, null);
                const codigoItem = String(item?.codigoItem ?? codprod ?? "").trim();
                const descricao = String(item?.descricao ?? "").trim();
                if (!descricao)
                    throw new AppError("Descricao obrigatoria para item do inventario interno.", 400);
                if (codprod == null && !codigoItem)
                    throw new AppError("Informe codprod ou codigoItem para o item.", 400);
                const codlocal = normalizeCodlocal(item?.codlocalWinthor, header.codlocalWinthor || "0");
                const duplicate = db.inventarioInternoItens.find((row) => row.inventarioId === id &&
                    Number(row.codprod ?? -1) === Number(codprod ?? -1) &&
                    normalizeCodlocal(row.codlocalWinthor, "0") === codlocal);
                if (duplicate)
                    continue;
                db.inventarioInternoItens.push({
                    id: nextId("INVI", db.inventarioInternoItens.length),
                    inventarioId: id,
                    ordemItem: ordem,
                    codprod,
                    codigoItem,
                    codlocalWinthor: codlocal,
                    descricao,
                    qt1: asNumber(item?.qt1),
                    qt2: asNumber(item?.qt2),
                    qt3: asNumber(item?.qt3),
                    qtestger: asNumber(item?.qtestger),
                    divergencia: null,
                    statusItem: ITEM_STATUS.PENDENTE,
                    necessitaRecontagem: 0,
                    validado: 0,
                    exportStatus: EXPORT_STATUS.NAO_EXPORTADO,
                    createdAt: nowIso(),
                    updatedAt: nowIso(),
                });
                ordem += 1;
            }
            recalcHeaderFallback(id, actor);
            await this.updateInventarioStatus(id, INVENTARIO_STATUS.EM_CONTAGEM, actor, "Inventario iniciado para contagem.");
            await writeAudit("INVENTARIO_INTERNO", "ADICIONAR_ITENS", "INVENTARIO_INTERNO", id, "Itens adicionados ao inventario interno.", { totalItensNovos: itens.length }, actor);
            return this.getInventarioInternoById(id);
        }
        const existingItems = await listItemsByInventarioIdOracle(id);
        let ordem = existingItems.length + 1;
        for (const item of itens) {
            const codprod = asNumber(item?.codprod, null);
            const codigoItem = String(item?.codigoItem ?? codprod ?? "").trim();
            const descricao = String(item?.descricao ?? "").trim();
            if (!descricao)
                throw new AppError("Descricao obrigatoria para item do inventario interno.", 400);
            if (codprod == null && !codigoItem)
                throw new AppError("Informe codprod ou codigoItem para o item.", 400);
            const codlocal = normalizeCodlocal(item?.codlocalWinthor, header.codlocalWinthor || "0");
            const duplicate = existingItems.find((row) => Number(row.codprod ?? -1) === Number(codprod ?? -1) &&
                normalizeCodlocal(row.codlocalWinthor, "0") === codlocal);
            if (duplicate)
                continue;
            const qt1 = asNumber(item?.qt1);
            const qt2 = asNumber(item?.qt2);
            const qt3 = asNumber(item?.qt3);
            const qtestger = computeConsensus(qt1, qt2, qt3, item?.qtestger);
            const statusItem = qtestger != null ? ITEM_STATUS.CONTADO : ITEM_STATUS.PENDENTE;
            const precisaRecontagem = qtestger == null && qt1 != null && qt2 != null && qt1 !== qt2 ? 1 : 0;
            await execDml(`INSERT INTO INVENTARIO_INTERNO_ITEM_TC (
          ID, INVENTARIO_ID, ORDEM_ITEM, CODPROD, CODIGO_ITEM, CODLOCAL_WINTHOR, DESCRICAO,
          QT1, QT2, QT3, QTESTGER, DIVERGENCIA, STATUS_ITEM, NECESSITA_RECONTAGEM, VALIDADO,
          EXPORT_STATUS, CREATED_AT, UPDATED_AT
        ) VALUES (
          :id, :inventarioId, :ordemItem, :codprod, :codigoItem, :codlocalWinthor, :descricao,
          :qt1, :qt2, :qt3, :qtestger, :divergencia, :statusItem, :necessitaRecontagem, 0,
          :exportStatus, SYSTIMESTAMP, SYSTIMESTAMP
        )`, {
                id: randomUUID(),
                inventarioId: id,
                ordemItem: ordem,
                codprod,
                codigoItem,
                codlocalWinthor: codlocal,
                descricao,
                qt1,
                qt2,
                qt3,
                qtestger,
                divergencia: qtestger != null && qt1 != null ? Number((qtestger - qt1).toFixed(3)) : null,
                statusItem,
                necessitaRecontagem: precisaRecontagem,
                exportStatus: EXPORT_STATUS.NAO_EXPORTADO,
            });
            ordem += 1;
        }
        await recalcHeaderOracle(id, actor);
        await this.updateInventarioStatus(id, INVENTARIO_STATUS.EM_CONTAGEM, actor, "Inventario iniciado para contagem.");
        await writeAudit("INVENTARIO_INTERNO", "ADICIONAR_ITENS", "INVENTARIO_INTERNO", id, "Itens adicionados ao inventario interno.", { totalItensNovos: itens.length }, actor);
        return this.getInventarioInternoById(id);
    },
    async registrarContagemItem(inventarioId, itemId, payload, actor) {
        const id = String(inventarioId);
        const itemIdNorm = String(itemId);
        const header = await this.getInventarioInternoById(id);
        if (!header)
            throw new AppError("Inventario interno nao encontrado.", 404);
        assertEditableInventario(header.status);
        const qt1 = payload?.qt1 !== undefined ? asNumber(payload.qt1) : undefined;
        const qt2 = payload?.qt2 !== undefined ? asNumber(payload.qt2) : undefined;
        const qt3 = payload?.qt3 !== undefined ? asNumber(payload.qt3) : undefined;
        const qtestgerInput = payload?.qtestger !== undefined ? asNumber(payload.qtestger) : undefined;
        const observacao = payload?.observacao != null ? String(payload.observacao).slice(0, 1000) : undefined;
        const validar = payload?.validar === true;
        const responsavelContagem = payload?.responsavelContagem ? String(payload.responsavelContagem).slice(0, 140) : ensureActorName(actor);
        if (!isOracleEnabled()) {
            ensureFallbackCollections();
            const item = db.inventarioInternoItens.find((row) => row.id === itemIdNorm && row.inventarioId === id);
            if (!item)
                throw new AppError("Item do inventario interno nao encontrado.", 404);
            if (qt1 !== undefined)
                item.qt1 = qt1;
            if (qt2 !== undefined)
                item.qt2 = qt2;
            if (qt3 !== undefined)
                item.qt3 = qt3;
            if (observacao !== undefined)
                item.observacao = observacao;
            item.qtestger = computeConsensus(item.qt1, item.qt2, item.qt3, qtestgerInput ?? item.qtestger);
            item.divergencia = item.qtestger != null && item.qt1 != null ? Number((item.qtestger - item.qt1).toFixed(3)) : null;
            item.contadoEm = nowIso();
            item.responsavelContagem = responsavelContagem;
            if (validar && item.qtestger != null) {
                item.validado = 1;
                item.validadoEm = nowIso();
                item.validadoPor = ensureActorName(actor);
            }
            const statusCalc = computeItemStatus(item);
            item.statusItem = statusCalc.status;
            item.necessitaRecontagem = statusCalc.needsRecount;
            item.exportStatus = item.statusItem === ITEM_STATUS.VALIDADO || item.statusItem === ITEM_STATUS.CONTADO
                ? EXPORT_STATUS.PRONTO_PARA_EXPORTAR
                : EXPORT_STATUS.NAO_EXPORTADO;
            item.updatedAt = nowIso();
            recalcHeaderFallback(id, actor);
            await this.updateInventarioStatus(id, INVENTARIO_STATUS.EM_CONTAGEM, actor, "Contagem de item atualizada.");
            await writeAudit("INVENTARIO_INTERNO", "CONTAR_ITEM", "INVENTARIO_INTERNO_ITEM", itemIdNorm, "Contagem de item registrada.", { inventarioId: id, itemId: itemIdNorm }, actor);
            return this.getInventarioInternoById(id);
        }
        const current = await queryOne(`SELECT
          ID, QT1, QT2, QT3, QTESTGER, VALIDADO, STATUS_ITEM, NECESSITA_RECONTAGEM, OBSERVACAO
        FROM INVENTARIO_INTERNO_ITEM_TC
        WHERE ID = :itemId
          AND INVENTARIO_ID = :inventarioId`, { itemId: itemIdNorm, inventarioId: id });
        if (!current)
            throw new AppError("Item do inventario interno nao encontrado.", 404);
        const merged = {
            qt1: qt1 !== undefined ? qt1 : asNumber(current.QT1),
            qt2: qt2 !== undefined ? qt2 : asNumber(current.QT2),
            qt3: qt3 !== undefined ? qt3 : asNumber(current.QT3),
            qtestger: computeConsensus(qt1 !== undefined ? qt1 : current.QT1, qt2 !== undefined ? qt2 : current.QT2, qt3 !== undefined ? qt3 : current.QT3, qtestgerInput !== undefined ? qtestgerInput : current.QTESTGER),
            validado: validar || Number(current.VALIDADO ?? 0) === 1 ? 1 : 0,
            observacao: observacao !== undefined ? observacao : current.OBSERVACAO,
        };
        const statusCalc = computeItemStatus({
            qt1: merged.qt1,
            qt2: merged.qt2,
            qt3: merged.qt3,
            qtestger: merged.qtestger,
            validado: merged.validado,
        });
        await execDml(`UPDATE INVENTARIO_INTERNO_ITEM_TC
        SET QT1 = :qt1,
            QT2 = :qt2,
            QT3 = :qt3,
            QTESTGER = :qtestger,
            DIVERGENCIA = :divergencia,
            STATUS_ITEM = :statusItem,
            NECESSITA_RECONTAGEM = :necessitaRecontagem,
            VALIDADO = :validado,
            VALIDADO_EM = CASE WHEN :validado = 1 THEN SYSTIMESTAMP ELSE VALIDADO_EM END,
            VALIDADO_POR = CASE WHEN :validado = 1 THEN :validadoPor ELSE VALIDADO_POR END,
            RESPONSAVEL_CONTAGEM = :responsavelContagem,
            CONTADO_EM = SYSTIMESTAMP,
            OBSERVACAO = :observacao,
            EXPORT_STATUS = :exportStatus,
            UPDATED_AT = SYSTIMESTAMP
      WHERE ID = :itemId
        AND INVENTARIO_ID = :inventarioId`, {
            qt1: merged.qt1,
            qt2: merged.qt2,
            qt3: merged.qt3,
            qtestger: merged.qtestger,
            divergencia: merged.qtestger != null && merged.qt1 != null ? Number((merged.qtestger - merged.qt1).toFixed(3)) : null,
            statusItem: statusCalc.status,
            necessitaRecontagem: statusCalc.needsRecount,
            validado: merged.validado,
            validadoPor: ensureActorName(actor),
            responsavelContagem,
            observacao: merged.observacao ?? null,
            exportStatus: statusCalc.status === ITEM_STATUS.VALIDADO || statusCalc.status === ITEM_STATUS.CONTADO
                ? EXPORT_STATUS.PRONTO_PARA_EXPORTAR
                : EXPORT_STATUS.NAO_EXPORTADO,
            itemId: itemIdNorm,
            inventarioId: id,
        });
        await recalcHeaderOracle(id, actor);
        await this.updateInventarioStatus(id, INVENTARIO_STATUS.EM_CONTAGEM, actor, "Contagem de item atualizada.");
        await writeAudit("INVENTARIO_INTERNO", "CONTAR_ITEM", "INVENTARIO_INTERNO_ITEM", itemIdNorm, "Contagem de item registrada.", { inventarioId: id, itemId: itemIdNorm }, actor);
        return this.getInventarioInternoById(id);
    },
    async updateInventarioStatus(inventarioId, nextStatus, actor, detalhe = "Status atualizado.") {
        const id = String(inventarioId);
        const status = String(nextStatus).trim().toUpperCase();
        if (!Object.values(INVENTARIO_STATUS).includes(status)) {
            throw new AppError(`Status de inventario interno invalido: ${status}`, 400);
        }
        if (!isOracleEnabled()) {
            ensureFallbackCollections();
            const header = db.inventarioInternoHeaders.find((row) => row.id === id);
            if (!header)
                throw new AppError("Inventario interno nao encontrado.", 404);
            header.status = status;
            header.updatedAt = nowIso();
            header.updatedBy = ensureActorName(actor);
            await writeAudit("INVENTARIO_INTERNO", "STATUS", "INVENTARIO_INTERNO", id, detalhe, { status }, actor);
            return this.getInventarioInternoById(id);
        }
        const exists = await queryOne(`SELECT ID FROM INVENTARIO_INTERNO_TC WHERE ID = :id`, { id });
        if (!exists)
            throw new AppError("Inventario interno nao encontrado.", 404);
        await execDml(`UPDATE INVENTARIO_INTERNO_TC
        SET STATUS = :status,
            UPDATED_AT = SYSTIMESTAMP,
            UPDATED_BY = :updatedBy
      WHERE ID = :id`, {
            id,
            status,
            updatedBy: ensureActorName(actor),
        });
        await writeAudit("INVENTARIO_INTERNO", "STATUS", "INVENTARIO_INTERNO", id, detalhe, { status }, actor);
        return this.getInventarioInternoById(id);
    },
    async validarInventarioInterno(inventarioId, actor) {
        const id = String(inventarioId);
        const current = await this.getInventarioInternoById(id);
        if (!current)
            throw new AppError("Inventario interno nao encontrado.", 404);
        assertEditableInventario(current.status);
        const errors = validateForFinalization(current, current.items);
        if (errors.length > 0) {
            throw new AppError(`Inventario interno invalido para validacao: ${errors[0]}`, 400);
        }
        if (!isOracleEnabled()) {
            ensureFallbackCollections();
            for (const item of db.inventarioInternoItens.filter((row) => row.inventarioId === id)) {
                item.validado = 1;
                item.validadoPor = ensureActorName(actor);
                item.validadoEm = nowIso();
                item.statusItem = ITEM_STATUS.VALIDADO;
                item.exportStatus = EXPORT_STATUS.PRONTO_PARA_EXPORTAR;
                item.updatedAt = nowIso();
            }
            await this.updateInventarioStatus(id, INVENTARIO_STATUS.VALIDADO, actor, "Inventario interno validado.");
            return this.getInventarioInternoById(id);
        }
        await execDml(`UPDATE INVENTARIO_INTERNO_ITEM_TC
        SET VALIDADO = 1,
            VALIDADO_EM = SYSTIMESTAMP,
            VALIDADO_POR = :validadoPor,
            STATUS_ITEM = 'VALIDADO',
            EXPORT_STATUS = :exportStatus,
            UPDATED_AT = SYSTIMESTAMP
      WHERE INVENTARIO_ID = :inventarioId`, {
            inventarioId: id,
            validadoPor: ensureActorName(actor),
            exportStatus: EXPORT_STATUS.PRONTO_PARA_EXPORTAR,
        });
        await this.updateInventarioStatus(id, INVENTARIO_STATUS.VALIDADO, actor, "Inventario interno validado.");
        return this.getInventarioInternoById(id);
    },
    async solicitarFinalizacaoInventario(inventarioId, actor) {
        const id = String(inventarioId);
        const current = await this.getInventarioInternoById(id);
        if (!current)
            throw new AppError("Inventario interno nao encontrado.", 404);
        assertEditableInventario(current.status);
        const errors = validateForFinalization(current, current.items);
        if (errors.length > 0) {
            throw new AppError(`Nao foi possivel solicitar finalizacao: ${errors[0]}`, 400);
        }
        if (!isOracleEnabled()) {
            ensureFallbackCollections();
            const header = db.inventarioInternoHeaders.find((row) => row.id === id);
            header.status = INVENTARIO_STATUS.FINALIZACAO_SOLICITADA;
            header.aprovacaoSolicitadaEm = nowIso();
            header.aprovacaoSolicitadaPor = ensureActorName(actor);
            header.updatedAt = nowIso();
            header.updatedBy = ensureActorName(actor);
            await writeAudit("INVENTARIO_INTERNO", "SOLICITAR_FINALIZACAO", "INVENTARIO_INTERNO", id, "Finalizacao solicitada.", null, actor);
            return this.getInventarioInternoById(id);
        }
        await execDml(`UPDATE INVENTARIO_INTERNO_TC
        SET STATUS = :status,
            APROVACAO_SOLICITADA_EM = SYSTIMESTAMP,
            APROVACAO_SOLICITADA_POR = :solicitadoPor,
            UPDATED_AT = SYSTIMESTAMP,
            UPDATED_BY = :updatedBy
      WHERE ID = :id`, {
            id,
            status: INVENTARIO_STATUS.FINALIZACAO_SOLICITADA,
            solicitadoPor: ensureActorName(actor),
            updatedBy: ensureActorName(actor),
        });
        await writeAudit("INVENTARIO_INTERNO", "SOLICITAR_FINALIZACAO", "INVENTARIO_INTERNO", id, "Finalizacao solicitada.", null, actor);
        return this.getInventarioInternoById(id);
    },
    async finalizarInventario(inventarioId, actor) {
        const id = String(inventarioId);
        const current = await this.getInventarioInternoById(id);
        if (!current)
            throw new AppError("Inventario interno nao encontrado.", 404);
        assertEditableInventario(current.status);
        const errors = validateForFinalization(current, current.items);
        if (errors.length > 0)
            throw new AppError(`Nao foi possivel finalizar: ${errors[0]}`, 400);
        if (!isOracleEnabled()) {
            ensureFallbackCollections();
            const header = db.inventarioInternoHeaders.find((row) => row.id === id);
            header.status = INVENTARIO_STATUS.APROVACAO_PENDENTE;
            header.finalizadoEm = nowIso();
            header.finalizadoPor = ensureActorName(actor);
            header.exportStatus = EXPORT_STATUS.PRONTO_PARA_EXPORTAR;
            header.updatedAt = nowIso();
            header.updatedBy = ensureActorName(actor);
            await writeAudit("INVENTARIO_INTERNO", "FINALIZAR", "INVENTARIO_INTERNO", id, "Inventario finalizado e pendente de aprovacao.", null, actor);
            return this.getInventarioInternoById(id);
        }
        await execDml(`UPDATE INVENTARIO_INTERNO_TC
        SET STATUS = :status,
            FINALIZADO_EM = SYSTIMESTAMP,
            FINALIZADO_POR = :finalizadoPor,
            EXPORT_STATUS = :exportStatus,
            UPDATED_AT = SYSTIMESTAMP,
            UPDATED_BY = :updatedBy
      WHERE ID = :id`, {
            id,
            status: INVENTARIO_STATUS.APROVACAO_PENDENTE,
            finalizadoPor: ensureActorName(actor),
            exportStatus: EXPORT_STATUS.PRONTO_PARA_EXPORTAR,
            updatedBy: ensureActorName(actor),
        });
        await writeAudit("INVENTARIO_INTERNO", "FINALIZAR", "INVENTARIO_INTERNO", id, "Inventario finalizado e pendente de aprovacao.", null, actor);
        return this.getInventarioInternoById(id);
    },
    async aprovarFinalizacaoInventario(inventarioId, actor) {
        ensureCanApprove(actor);
        const id = String(inventarioId);
        const current = await this.getInventarioInternoById(id);
        if (!current)
            throw new AppError("Inventario interno nao encontrado.", 404);
        if (![INVENTARIO_STATUS.APROVACAO_PENDENTE, INVENTARIO_STATUS.FINALIZADO, INVENTARIO_STATUS.FINALIZACAO_SOLICITADA].includes(current.status)) {
            throw new AppError(`Status ${current.status} nao permite aprovacao final.`, 409);
        }
        const errors = validateForFinalization(current, current.items);
        if (errors.length > 0)
            throw new AppError(`Aprovacao bloqueada: ${errors[0]}`, 400);
        if (!isOracleEnabled()) {
            ensureFallbackCollections();
            const header = db.inventarioInternoHeaders.find((row) => row.id === id);
            header.status = INVENTARIO_STATUS.FINALIZACAO_APROVADA;
            header.aprovadoEm = nowIso();
            header.aprovadoPor = ensureActorName(actor);
            header.exportStatus = EXPORT_STATUS.PRONTO_PARA_EXPORTAR;
            header.updatedAt = nowIso();
            header.updatedBy = ensureActorName(actor);
            await writeAudit("INVENTARIO_INTERNO", "APROVAR_FINALIZACAO", "INVENTARIO_INTERNO", id, "Finalizacao aprovada.", null, actor);
            return this.getInventarioInternoById(id);
        }
        await execDml(`UPDATE INVENTARIO_INTERNO_TC
        SET STATUS = :status,
            APROVADO_EM = SYSTIMESTAMP,
            APROVADO_POR = :aprovadoPor,
            EXPORT_STATUS = :exportStatus,
            UPDATED_AT = SYSTIMESTAMP,
            UPDATED_BY = :updatedBy
      WHERE ID = :id`, {
            id,
            status: INVENTARIO_STATUS.FINALIZACAO_APROVADA,
            aprovadoPor: ensureActorName(actor),
            exportStatus: EXPORT_STATUS.PRONTO_PARA_EXPORTAR,
            updatedBy: ensureActorName(actor),
        });
        await writeAudit("INVENTARIO_INTERNO", "APROVAR_FINALIZACAO", "INVENTARIO_INTERNO", id, "Finalizacao aprovada.", null, actor);
        return this.getInventarioInternoById(id);
    },
    async dryRunExportacaoWinthor(inventarioId, actor, options = {}) {
        const id = String(inventarioId);
        const inventario = await this.getInventarioInternoById(id);
        if (!inventario)
            throw new AppError("Inventario interno nao encontrado.", 404);
        const envCfg = normalizeExportEnv();
        const mapped = isOracleEnabled() ? await getMappedFilialByLojaOracle(inventario.lojaId) : getMappedFilialByLojaFallback(inventario.lojaId);
        const codfilial = normalizeFilial(inventario.filialWinthor ?? mapped.filialWinthor);
        const defaultCodlocal = normalizeCodlocal(inventario.codlocalWinthor ?? mapped.codlocalWinthor ?? "0", "0");
        const exportRows = [];
        const criticalErrors = [];
        const warnings = [];
        if (![INVENTARIO_STATUS.APROVACAO_PENDENTE, INVENTARIO_STATUS.FINALIZACAO_APROVADA, INVENTARIO_STATUS.ERRO_EXPORTACAO_WINTHOR, INVENTARIO_STATUS.EXPORTADO_WINTHOR].includes(inventario.status)) {
            warnings.push(`Dry-run executado com inventario no status ${inventario.status}.`);
        }
        if (!codfilial) {
            criticalErrors.push("Filial WinThor nao mapeada para o inventario.");
        }
        const existingExports = (inventario.exportacoes ?? []).filter((row) => row.status === EXPORT_STATUS.EXPORTADO);
        const numinventAtual = asNumber(inventario.exportNuminvent, null);
        let filialExists = false;
        if (isOracleEnabled() && codfilial) {
            filialExists = await checkFilialExists(codfilial);
            if (!filialExists)
                criticalErrors.push(`Filial WinThor ${codfilial} nao encontrada em PCFILIAL.`);
            if (numinventAtual != null) {
                const inventarioJaAtualizado = await hasInventarioJaAtualizado(numinventAtual, codfilial);
                if (inventarioJaAtualizado) {
                    criticalErrors.push(`NUMINVENT ${numinventAtual} ja possui DTATUALIZACAO preenchida para filial ${codfilial}.`);
                }
            }
        }
        if (!isOracleEnabled()) {
            warnings.push("Oracle desabilitado: validacao em tabelas WinThor foi simulada.");
        }
        const productCache = new Map();
        const codlocalCache = new Map();
        for (const item of inventario.items ?? []) {
            const codprod = asNumber(item.codprod, null);
            const codlocal = normalizeCodlocal(item.codlocalWinthor ?? defaultCodlocal, defaultCodlocal);
            const key = buildIdempotencyKey(id, item.id, codfilial ?? "-", codprod ?? "-", codlocal);
            const rowErrors = [];
            const rowWarnings = [];
            if (codprod == null || !Number.isFinite(codprod)) {
                rowErrors.push("CODPROD invalido.");
            }
            if (item.qtestger == null) {
                rowErrors.push("QTESTGER ausente.");
            }
            if (!codfilial) {
                rowErrors.push("Filial WinThor ausente.");
            }
            if (isOracleEnabled() && codprod != null) {
                if (!productCache.has(codprod)) {
                    productCache.set(codprod, await checkProductExists(codprod));
                }
                if (!productCache.get(codprod)) {
                    rowErrors.push(`Produto ${codprod} nao encontrado em PCPRODUT.`);
                }
                if (codfilial) {
                    const emOutroInventarioAberto = await hasOpenInventarioForProduct(codprod, codfilial, numinventAtual);
                    if (emOutroInventarioAberto) {
                        rowErrors.push(`Produto ${codprod} ja esta em outro inventario aberto na filial ${codfilial}.`);
                    }
                }
            }
            if (isOracleEnabled()) {
                const codlocalKey = codlocal;
                if (!codlocalCache.has(codlocalKey)) {
                    codlocalCache.set(codlocalKey, await checkCodlocalValid(codlocalKey));
                }
                if (!codlocalCache.get(codlocalKey)) {
                    rowErrors.push(`CODLOCAL ${codlocal} invalido na regra atual.`);
                }
            }
            const alreadyExported = existingExports.some((row) => row.idempotencyKey === key);
            if (alreadyExported) {
                rowWarnings.push("Item ja exportado anteriormente (idempotencia).");
            }
            if (Number(item.necessitaRecontagem ?? 0) === 1) {
                rowErrors.push("Item com necessidade de recontagem.");
            }
            exportRows.push({
                itemId: item.id,
                codigoItem: item.codigoItem,
                descricao: item.descricao,
                codfilial,
                codprod,
                codlocal,
                qt1: item.qt1,
                qt2: item.qt2,
                qt3: item.qt3,
                qtestger: item.qtestger,
                statusItem: item.statusItem,
                exportStatus: item.exportStatus,
                idempotencyKey: key,
                alreadyExported,
                errors: rowErrors,
                warnings: rowWarnings,
            });
        }
        const rowErrorCount = exportRows.reduce((sum, row) => sum + row.errors.length, 0);
        const statusPermiteExportacao = [
            INVENTARIO_STATUS.FINALIZACAO_APROVADA,
            INVENTARIO_STATUS.ERRO_EXPORTACAO_WINTHOR,
        ].includes(inventario.status);
        const canExport = criticalErrors.length === 0 &&
            rowErrorCount === 0 &&
            statusPermiteExportacao &&
            exportRows.length > 0;
        return {
            inventarioId: id,
            numeroInventarioInterno: inventario.numero,
            statusInventario: inventario.status,
            exportStatusInventario: inventario.exportStatus,
            mode: "DRY_RUN",
            config: {
                ENABLE_PCINVENTROT_EXPORT: envCfg.enabled,
                PCINVENTROT_EXPORT_MODE: envCfg.mode,
                PCINVENTROT_NUMINVENT_STRATEGY: envCfg.numinventStrategy,
            },
            summary: {
                totalItens: exportRows.length,
                itensValidos: exportRows.filter((row) => row.errors.length === 0).length,
                itensInvalidos: exportRows.filter((row) => row.errors.length > 0).length,
                itensJaExportados: exportRows.filter((row) => row.alreadyExported).length,
                canExport,
            },
            criticalErrors,
            warnings,
            rows: options?.onlyErrors
                ? exportRows.filter((row) => row.errors.length > 0)
                : exportRows,
            generatedAt: nowIso(),
            requestedBy: ensureActorName(actor),
        };
    },
    async exportarParaWinthor(inventarioId, actor, options = {}) {
        const id = String(inventarioId);
        const envCfg = normalizeExportEnv();
        const mode = String(options?.mode ?? (envCfg.dryRunDefault ? "dry-run" : "real")).toLowerCase();
        if (mode !== "real") {
            return this.dryRunExportacaoWinthor(id, actor, {});
        }
        if (!envCfg.enabled) {
            throw new AppError("Exportacao real desabilitada. Ajuste ENABLE_PCINVENTROT_EXPORT=true para habilitar.", 409);
        }
        if (!isOracleEnabled()) {
            throw new AppError("Oracle indisponivel: exportacao real para PCINVENTROT nao pode ser executada.", 503);
        }
        const preview = await this.dryRunExportacaoWinthor(id, actor, {});
        if (!preview.summary.canExport) {
            throw new AppError("Dry-run bloqueou a exportacao: existem erros criticos ou itens invalidos.", 409);
        }
        const rowsToProcess = (options?.reprocessOnly
            ? preview.rows.filter((row) => row.exportStatus === EXPORT_STATUS.ERRO || row.exportStatus === EXPORT_STATUS.REPROCESSAR)
            : preview.rows);
        if (rowsToProcess.length === 0) {
            return {
                inventarioId: id,
                message: "Nenhum item elegivel para exportacao no modo solicitado.",
                totalItens: 0,
                mode: "REAL",
            };
        }
        if (envCfg.numinventStrategy !== "PCCONSUM") {
            throw new AppError(`Estrategia de NUMINVENT nao suportada: ${envCfg.numinventStrategy}.`, 500);
        }
        const loteId = `LOT-${new Date().toISOString().slice(0, 19).replace(/[:T-]/g, "")}-${randomUUID().slice(0, 8)}`;
        const colSet = await fetchPcInventrotColumns();
        const mandatoryCols = [
            "NUMINVENT",
            "DATA",
            "CODFILIAL",
            "CODPROD",
            "QTESTGER",
            "NUMSEQ",
            "CODFUNCMONTAGEM",
            "INVENTAVARIA",
            "CODLOCAL",
            "QTEST",
            "CUSTO",
        ];
        for (const col of mandatoryCols) {
            if (!colSet.has(col)) {
                throw new AppError(`Estrutura PCINVENTROT inesperada: coluna obrigatoria ${col} nao encontrada.`, 500);
            }
        }
        const result = await runOracleTransaction(async (connection, oracledb) => {
            const headerLock = await connection.execute(`SELECT ID, STATUS, EXPORT_NUMINVENT
              FROM INVENTARIO_INTERNO_TC
             WHERE ID = :id
             FOR UPDATE`, { id }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
            const headerRow = headerLock.rows?.[0];
            if (!headerRow)
                throw new AppError("Inventario interno nao encontrado para exportacao.", 404);
            const statusAtual = String(headerRow.STATUS ?? "");
            if (![
                INVENTARIO_STATUS.FINALIZACAO_APROVADA,
                INVENTARIO_STATUS.ERRO_EXPORTACAO_WINTHOR,
                INVENTARIO_STATUS.EXPORTADO_WINTHOR,
            ].includes(statusAtual)) {
                throw new AppError(`Status ${statusAtual} nao permite exportacao para WinThor.`, 409);
            }
            await connection.execute(`UPDATE INVENTARIO_INTERNO_TC
                 SET STATUS = :status,
                     EXPORT_STATUS = :exportStatus,
                     EXPORT_LOTE = :loteId,
                     EXPORT_ERRO = NULL,
                     UPDATED_AT = SYSTIMESTAMP,
                     UPDATED_BY = :updatedBy
               WHERE ID = :id`, {
                id,
                status: INVENTARIO_STATUS.EXPORTANDO_WINTHOR,
                exportStatus: EXPORT_STATUS.EXPORTANDO,
                loteId,
                updatedBy: ensureActorName(actor),
            });
            let numinvent = Number(headerRow.EXPORT_NUMINVENT ?? 0);
            if (!Number.isFinite(numinvent) || numinvent <= 0) {
                const seqResult = await connection.execute(`SELECT PROXNUMINVENTROT
                  FROM PCCONSUM
                 FOR UPDATE`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
                const seqRow = seqResult.rows?.[0] ?? {};
                numinvent = Number(seqRow.PROXNUMINVENTROT ?? seqRow.proxnuminventrot ?? 0);
                if (!Number.isFinite(numinvent) || numinvent <= 0) {
                    throw new AppError("PCCONSUM.PROXNUMINVENTROT invalido para gerar NUMINVENT.", 500);
                }
                await connection.execute(`UPDATE PCCONSUM SET PROXNUMINVENTROT = PROXNUMINVENTROT + 1`);
                await connection.execute(`UPDATE INVENTARIO_INTERNO_TC
                   SET EXPORT_NUMINVENT = :numinvent
                 WHERE ID = :id`, { id, numinvent });
            }
            const tipoCustoResult = await connection.execute(`SELECT NVL(TIPOCUSTOAJUSTE, 'F') AS TIPO FROM PCCONSUM`, {}, { outFormat: oracledb.OUT_FORMAT_OBJECT });
            const tipoCusto = resolveTipoCustoFromValue(tipoCustoResult.rows?.[0]?.TIPO ?? "F");
            const codfuncMontagem = resolveCodfuncMontagem(actor);
            const dataInventario = new Date();
            dataInventario.setHours(0, 0, 0, 0);
            const summary = {
                inventarioId: id,
                loteId,
                numinvent,
                exportados: 0,
                erros: 0,
                ignoradosJaExportados: 0,
                rows: [],
            };
            const custoCache = new Map();
            const filialCheckedForDtAtualizacao = new Set();
            for (const row of rowsToProcess) {
                const itemId = String(row.itemId);
                const idempotencyKey = row.idempotencyKey;
                const codfilial = String(row.codfilial ?? "").trim();
                const codprod = Number(row.codprod);
                const codlocal = String(row.codlocal ?? "0").trim() || "0";
                if (row.errors.length > 0) {
                    await connection.execute(`MERGE INTO INVENTARIO_EXPORT_WINTHOR_TC t
                    USING (SELECT :idempotencyKey AS IDEMPOTENCY_KEY FROM DUAL) s
                    ON (t.IDEMPOTENCY_KEY = s.IDEMPOTENCY_KEY)
                    WHEN MATCHED THEN
                      UPDATE SET t.STATUS = :status, t.ERRO = :erro, t.TENTATIVA = NVL(t.TENTATIVA, 0) + 1,
                                 t.MODO = 'REAL', t.EXECUTADO_POR = :executadoPor
                    WHEN NOT MATCHED THEN
                      INSERT (ID, INVENTARIO_ID, ITEM_ID, LOTE_ID, IDEMPOTENCY_KEY, NUMINVENT, CODFILIAL, CODPROD, CODLOCAL, MODO, STATUS, TENTATIVA, ERRO, APROVADO_POR, EXECUTADO_POR, CRIADO_EM)
                      VALUES (:id, :inventarioId, :itemId, :loteId, :idempotencyKey, :numinvent, :codfilial, :codprod, :codlocal, 'REAL', :status, 1, :erro, :aprovadoPor, :executadoPor, SYSTIMESTAMP)`, {
                        id: randomUUID(),
                        inventarioId: id,
                        itemId,
                        loteId,
                        idempotencyKey,
                        numinvent,
                        codfilial,
                        codprod,
                        codlocal,
                        status: EXPORT_STATUS.ERRO,
                        erro: row.errors.join(" | "),
                        aprovadoPor: preview?.statusInventario === INVENTARIO_STATUS.FINALIZACAO_APROVADA ? ensureActorName(actor) : null,
                        executadoPor: ensureActorName(actor),
                    });
                    await connection.execute(`UPDATE INVENTARIO_INTERNO_ITEM_TC
                       SET EXPORT_STATUS = :status,
                           ULTIMO_ERRO_EXPORT = :erro,
                           UPDATED_AT = SYSTIMESTAMP
                     WHERE ID = :itemId
                       AND INVENTARIO_ID = :inventarioId`, {
                        itemId,
                        inventarioId: id,
                        status: EXPORT_STATUS.ERRO,
                        erro: row.errors.join(" | "),
                    });
                    summary.erros += 1;
                    summary.rows.push({
                        itemId,
                        codprod,
                        status: EXPORT_STATUS.ERRO,
                        erro: row.errors.join(" | "),
                    });
                    continue;
                }
                const exportedRow = await connection.execute(`SELECT STATUS
                  FROM INVENTARIO_EXPORT_WINTHOR_TC
                 WHERE IDEMPOTENCY_KEY = :idempotencyKey`, {
                    idempotencyKey,
                }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
                const already = String(exportedRow.rows?.[0]?.STATUS ?? "") === EXPORT_STATUS.EXPORTADO;
                if (already) {
                    summary.ignoradosJaExportados += 1;
                    summary.rows.push({
                        itemId,
                        codprod,
                        status: "IGNORADO_IDEMPOTENTE",
                    });
                    continue;
                }
                try {
                    if (!filialCheckedForDtAtualizacao.has(codfilial)) {
                        const dtAtualizacaoCheck = await connection.execute(`SELECT 1 AS CNT
                            FROM PCINVENTROT
                           WHERE NUMINVENT = :numinvent
                             AND CODFILIAL = :codfilial
                             AND DTATUALIZACAO IS NOT NULL
                             AND ROWNUM = 1`, {
                            numinvent,
                            codfilial,
                        }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
                        if (dtAtualizacaoCheck.rows?.length) {
                            throw new AppError(`Inventario ${numinvent} da filial ${codfilial} ja foi atualizado no WinThor (DTATUALIZACAO preenchida).`, 409);
                        }
                        filialCheckedForDtAtualizacao.add(codfilial);
                    }
                    const openInvCheck = await connection.execute(`SELECT 1 AS CNT
                        FROM PCINVENTROT
                       WHERE NUMINVENT <> :numinvent
                         AND CODPROD = :codprod
                         AND CODFILIAL = :codfilial
                         AND DTATUALIZACAO IS NULL
                         AND ROWNUM = 1`, {
                        numinvent,
                        codprod,
                        codfilial,
                    }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
                    if (openInvCheck.rows?.length) {
                        throw new AppError(`Produto ${codprod} ja esta em outro inventario aberto na filial ${codfilial}.`, 409);
                    }
                    const custoKey = `${codfilial}|${codprod}`;
                    if (!custoCache.has(custoKey)) {
                        const custoRow = await connection.execute(`SELECT NVL(QTEST, 0) QTEST,
                         NVL((CASE
                                WHEN :tipoCusto = 'F' THEN NVL(CUSTOFIN, 0)
                                WHEN :tipoCusto = 'P' THEN NVL(CUSTOREP, 0)
                                WHEN :tipoCusto = 'R' THEN NVL(CUSTOREAL, 0)
                                WHEN :tipoCusto = 'U' THEN NVL(CUSTOULTENT, 0)
                                WHEN :tipoCusto = 'C' THEN NVL(CUSTOCONT, 0)
                              END), 0) CUSTO
                        FROM PCEST
                       WHERE CODPROD = :codprod
                         AND CODFILIAL = :codfilial`, {
                            tipoCusto,
                            codprod,
                            codfilial,
                        }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
                        const data = custoRow.rows?.[0] ?? {};
                        custoCache.set(custoKey, {
                            qtest: asNumber(data.QTEST, 0) ?? 0,
                            custo: asNumber(data.CUSTO, 0) ?? 0,
                        });
                    }
                    const custoInfo = custoCache.get(custoKey);
                    await connection.execute(`INSERT INTO PCINVENTROT
                      (NUMINVENT, DATA, CODFILIAL, CODPROD, QTESTGER, NUMSEQ, CODFUNCMONTAGEM, INVENTAVARIA, CODLOCAL, QTEST, CUSTO)
                    VALUES
                      (:numinvent, :data, :codfilial, :codprod, :qtestger, :numseq, :codfuncMontagem, :inventavaria, :codlocal, :qtest, :custo)`, {
                        numinvent,
                        data: dataInventario,
                        codfilial,
                        codprod,
                        qtestger: row.qtestger == null ? null : Number(row.qtestger),
                        numseq: 0,
                        codfuncMontagem,
                        inventavaria: "N",
                        codlocal,
                        qtest: custoInfo.qtest,
                        custo: custoInfo.custo,
                    });
                    await connection.execute(`MERGE INTO INVENTARIO_EXPORT_WINTHOR_TC t
                    USING (SELECT :idempotencyKey AS IDEMPOTENCY_KEY FROM DUAL) s
                    ON (t.IDEMPOTENCY_KEY = s.IDEMPOTENCY_KEY)
                    WHEN MATCHED THEN
                      UPDATE SET t.STATUS = :status, t.ERRO = NULL, t.TENTATIVA = NVL(t.TENTATIVA, 0) + 1,
                                 t.NUMINVENT = :numinvent, t.LOTE_ID = :loteId, t.CODFILIAL = :codfilial, t.CODPROD = :codprod,
                                 t.CODLOCAL = :codlocal, t.MODO = 'REAL', t.EXECUTADO_POR = :executadoPor, t.SUCESSO_EM = SYSTIMESTAMP
                    WHEN NOT MATCHED THEN
                      INSERT (ID, INVENTARIO_ID, ITEM_ID, LOTE_ID, IDEMPOTENCY_KEY, NUMINVENT, CODFILIAL, CODPROD, CODLOCAL, MODO, STATUS, TENTATIVA, ERRO, APROVADO_POR, EXECUTADO_POR, CRIADO_EM, SUCESSO_EM)
                      VALUES (:id, :inventarioId, :itemId, :loteId, :idempotencyKey, :numinvent, :codfilial, :codprod, :codlocal, 'REAL', :status, 1, NULL, :aprovadoPor, :executadoPor, SYSTIMESTAMP, SYSTIMESTAMP)`, {
                        id: randomUUID(),
                        inventarioId: id,
                        itemId,
                        loteId,
                        idempotencyKey,
                        numinvent,
                        codfilial,
                        codprod,
                        codlocal,
                        status: EXPORT_STATUS.EXPORTADO,
                        aprovadoPor: ensureActorName(actor),
                        executadoPor: ensureActorName(actor),
                    });
                    await connection.execute(`UPDATE INVENTARIO_INTERNO_ITEM_TC
                       SET EXPORT_STATUS = :status,
                           ULTIMO_ERRO_EXPORT = NULL,
                           UPDATED_AT = SYSTIMESTAMP
                     WHERE ID = :itemId
                       AND INVENTARIO_ID = :inventarioId`, {
                        itemId,
                        inventarioId: id,
                        status: EXPORT_STATUS.EXPORTADO,
                    });
                    summary.exportados += 1;
                    summary.rows.push({
                        itemId,
                        codprod,
                        status: EXPORT_STATUS.EXPORTADO,
                    });
                }
                catch (error) {
                    const errMsg = error instanceof Error ? error.message.slice(0, 1800) : "Falha ao inserir em PCINVENTROT.";
                    await connection.execute(`MERGE INTO INVENTARIO_EXPORT_WINTHOR_TC t
                    USING (SELECT :idempotencyKey AS IDEMPOTENCY_KEY FROM DUAL) s
                    ON (t.IDEMPOTENCY_KEY = s.IDEMPOTENCY_KEY)
                    WHEN MATCHED THEN
                      UPDATE SET t.STATUS = :status, t.ERRO = :erro, t.TENTATIVA = NVL(t.TENTATIVA, 0) + 1,
                                 t.NUMINVENT = :numinvent, t.CODFILIAL = :codfilial, t.CODPROD = :codprod,
                                 t.CODLOCAL = :codlocal, t.LOTE_ID = :loteId, t.MODO = 'REAL', t.EXECUTADO_POR = :executadoPor
                    WHEN NOT MATCHED THEN
                      INSERT (ID, INVENTARIO_ID, ITEM_ID, LOTE_ID, IDEMPOTENCY_KEY, NUMINVENT, CODFILIAL, CODPROD, CODLOCAL, MODO, STATUS, TENTATIVA, ERRO, APROVADO_POR, EXECUTADO_POR, CRIADO_EM)
                      VALUES (:id, :inventarioId, :itemId, :loteId, :idempotencyKey, :numinvent, :codfilial, :codprod, :codlocal, 'REAL', :status, 1, :erro, :aprovadoPor, :executadoPor, SYSTIMESTAMP)`, {
                        id: randomUUID(),
                        inventarioId: id,
                        itemId,
                        loteId,
                        idempotencyKey,
                        numinvent,
                        codfilial,
                        codprod,
                        codlocal,
                        status: EXPORT_STATUS.ERRO,
                        erro: errMsg,
                        aprovadoPor: ensureActorName(actor),
                        executadoPor: ensureActorName(actor),
                    });
                    await connection.execute(`UPDATE INVENTARIO_INTERNO_ITEM_TC
                       SET EXPORT_STATUS = :status,
                           ULTIMO_ERRO_EXPORT = :erro,
                           UPDATED_AT = SYSTIMESTAMP
                     WHERE ID = :itemId
                       AND INVENTARIO_ID = :inventarioId`, {
                        itemId,
                        inventarioId: id,
                        status: EXPORT_STATUS.ERRO,
                        erro: errMsg.slice(0, 1000),
                    });
                    summary.erros += 1;
                    summary.rows.push({
                        itemId,
                        codprod,
                        status: EXPORT_STATUS.ERRO,
                        erro: errMsg,
                    });
                }
            }
            if (summary.erros > 0) {
                await connection.execute(`UPDATE INVENTARIO_INTERNO_TC
                   SET STATUS = :status,
                       EXPORT_STATUS = :exportStatus,
                       EXPORT_ERRO = :exportErro,
                       UPDATED_AT = SYSTIMESTAMP,
                       UPDATED_BY = :updatedBy
                 WHERE ID = :id`, {
                    id,
                    status: INVENTARIO_STATUS.ERRO_EXPORTACAO_WINTHOR,
                    exportStatus: EXPORT_STATUS.ERRO,
                    exportErro: `Exportacao com ${summary.erros} erro(s). Consulte rastreio.`,
                    updatedBy: ensureActorName(actor),
                });
            }
            else {
                await connection.execute(`UPDATE INVENTARIO_INTERNO_TC
                   SET STATUS = :status,
                       EXPORT_STATUS = :exportStatus,
                       EXPORT_ERRO = NULL,
                       EXPORTADO_EM = SYSTIMESTAMP,
                       EXPORTADO_POR = :exportadoPor,
                       UPDATED_AT = SYSTIMESTAMP,
                       UPDATED_BY = :updatedBy
                 WHERE ID = :id`, {
                    id,
                    status: INVENTARIO_STATUS.EXPORTADO_WINTHOR,
                    exportStatus: EXPORT_STATUS.EXPORTADO,
                    exportadoPor: ensureActorName(actor),
                    updatedBy: ensureActorName(actor),
                });
            }
            return summary;
        });
        await writeAudit("INVENTARIO_INTERNO", "EXPORTAR_WINTHOR", "INVENTARIO_INTERNO", id, `Exportacao real concluida. Lote ${result.loteId}.`, result, actor);
        const atualizado = await this.getInventarioInternoById(id);
        return {
            ...result,
            inventario: atualizado,
        };
    },
    async getExportacaoInventario(inventarioId) {
        const id = String(inventarioId);
        const inventario = await this.getInventarioInternoById(id);
        if (!inventario)
            throw new AppError("Inventario interno nao encontrado.", 404);
        const logs = inventario.exportacoes ?? [];
        return {
            inventarioId: id,
            statusInventario: inventario.status,
            exportStatusInventario: inventario.exportStatus,
            numinvent: inventario.exportNuminvent ?? null,
            lote: inventario.exportLote ?? null,
            totalLogs: logs.length,
            logs,
        };
    },
    async reprocessarExportacaoComErro(inventarioId, actor) {
        const id = String(inventarioId);
        const inv = await this.getInventarioInternoById(id);
        if (!inv)
            throw new AppError("Inventario interno nao encontrado.", 404);
        if (![INVENTARIO_STATUS.FINALIZACAO_APROVADA, INVENTARIO_STATUS.ERRO_EXPORTACAO_WINTHOR, INVENTARIO_STATUS.EXPORTADO_WINTHOR].includes(inv.status)) {
            throw new AppError(`Status ${inv.status} nao permite reprocessamento.`, 409);
        }
        if (!isOracleEnabled()) {
            throw new AppError("Reprocessamento real exige Oracle habilitado.", 503);
        }
        const erros = (inv.items ?? []).filter((item) => item.exportStatus === EXPORT_STATUS.ERRO || item.exportStatus === EXPORT_STATUS.REPROCESSAR);
        if (erros.length === 0) {
            return {
                inventarioId: id,
                message: "Nenhum item com erro para reprocessar.",
                totalItensErro: 0,
            };
        }
        return this.exportarParaWinthor(id, actor, { mode: "real", reprocessOnly: true });
    },
};
