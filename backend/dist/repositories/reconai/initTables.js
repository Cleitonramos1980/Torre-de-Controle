import { executeOracle, isOracleEnabled } from "../../db/oracle.js";
import { execDml, queryOne } from "../baseRepository.js";
let initialized = false;
async function tableExists(tableName) {
    try {
        await executeOracle(`SELECT * FROM ${tableName} WHERE 1 = 0`);
        return true;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("ORA-00942"))
            return false;
        throw error;
    }
}
async function indexExists(indexName) {
    const row = await queryOne(`SELECT COUNT(*) AS CNT FROM USER_INDEXES WHERE INDEX_NAME = :indexName`, { indexName: indexName.toUpperCase() });
    return Number(row?.CNT ?? 0) > 0;
}
async function createActionLogsTableIfMissing() {
    if (await tableExists("ACTION_LOGS"))
        return;
    try {
        await execDml(`CREATE TABLE ACTION_LOGS (
      ID VARCHAR2(36) PRIMARY KEY,
      DIVERGENCIA_ID VARCHAR2(80) NOT NULL,
      ACTION_TYPE VARCHAR2(40) NOT NULL,
      STATUS VARCHAR2(20) NOT NULL,
      RESPONSE CLOB,
      CREATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
    )`);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("ORA-00955") || message.includes("ORA-01031"))
            return;
        throw error;
    }
}
async function createCfgCobrancaCartaoTableIfMissing() {
    if (await tableExists("RC_CFG_COBRANCA_CARTAO"))
        return;
    try {
        await execDml(`CREATE TABLE RC_CFG_COBRANCA_CARTAO (
      CODCOB VARCHAR2(4) PRIMARY KEY,
      DESCRICAO_COBRANCA VARCHAR2(120) NOT NULL,
      TIPO_CARTAO VARCHAR2(30) NOT NULL,
      ATIVO NUMBER(1) DEFAULT 1 NOT NULL,
      ADQUIRENTE_PADRAO VARCHAR2(80),
      BANDEIRA_PADRAO VARCHAR2(60),
      TAXA_PCT_PADRAO NUMBER(9,4),
      DIAS_REC_PADRAO NUMBER(5),
      ORIGEM_MAPEAMENTO VARCHAR2(30) DEFAULT 'MANUAL' NOT NULL,
      DT_CADASTRO DATE DEFAULT SYSDATE NOT NULL,
      DT_ULTALTER DATE DEFAULT SYSDATE NOT NULL
    )`);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("ORA-00955") || message.includes("ORA-01031"))
            return;
        throw error;
    }
}
async function createCfgPlpagCartaoTableIfMissing() {
    if (await tableExists("RC_CFG_PLPAG_CARTAO"))
        return;
    try {
        await execDml(`CREATE TABLE RC_CFG_PLPAG_CARTAO (
      CODPLPAG NUMBER(4,0) PRIMARY KEY,
      DESCRICAO_PLANO VARCHAR2(120) NOT NULL,
      QTD_PARCELAS NUMBER(3,0) NOT NULL,
      DIAS_PRIM_PARC NUMBER(5,0) NOT NULL,
      INTERVALO_DIAS NUMBER(5,0) NOT NULL,
      TAXA_PCT_PADRAO NUMBER(9,4),
      ATIVO NUMBER(1) DEFAULT 1 NOT NULL,
      ORIGEM_CONFIG VARCHAR2(30) DEFAULT 'MANUAL' NOT NULL,
      DT_CADASTRO DATE DEFAULT SYSDATE NOT NULL,
      DT_ULTALTER DATE DEFAULT SYSDATE NOT NULL
    )`);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("ORA-00955") || message.includes("ORA-01031"))
            return;
        throw error;
    }
}
async function createRecebivelPrevistoTableIfMissing() {
    if (await tableExists("RC_RECEBIVEL_CARTAO_PREV"))
        return;
    try {
        await execDml(`CREATE TABLE RC_RECEBIVEL_CARTAO_PREV (
      ID VARCHAR2(36) PRIMARY KEY,
      CODFILIAL VARCHAR2(2) NOT NULL,
      NOME_FILIAL VARCHAR2(80),
      NUMPED NUMBER(10,0) NOT NULL,
      DATA_VENDA DATE NOT NULL,
      CODCLI NUMBER(6,0),
      CODCOB VARCHAR2(4) NOT NULL,
      DESCRICAO_COBRANCA VARCHAR2(120),
      CODPLPAG NUMBER(4,0),
      DESCRICAO_PLPAG VARCHAR2(120),
      PARCELA NUMBER(3,0) NOT NULL,
      TOTAL_PARCELAS NUMBER(3,0) NOT NULL,
      VALOR_BRUTO NUMBER(16,3) NOT NULL,
      TAXA_PCT NUMBER(9,4),
      VALOR_TAXA NUMBER(16,3),
      VALOR_LIQ_PREV NUMBER(16,3) NOT NULL,
      DT_PREV_RECEB DATE NOT NULL,
      STATUS VARCHAR2(20) DEFAULT 'PREVISTO' NOT NULL,
      ORIGEM VARCHAR2(20) DEFAULT 'VENDA_ERP' NOT NULL,
      DT_CADASTRO DATE DEFAULT SYSDATE NOT NULL,
      DT_ULTALTER DATE DEFAULT SYSDATE NOT NULL
    )`);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("ORA-00955") || message.includes("ORA-01031"))
            return;
        throw error;
    }
}
async function createRecebivelUniqueConstraintIfMissing() {
    if (!(await tableExists("RC_RECEBIVEL_CARTAO_PREV")))
        return;
    try {
        await execDml(`ALTER TABLE RC_RECEBIVEL_CARTAO_PREV
      ADD CONSTRAINT UK_RC_RECEBIVEL_PREV
      UNIQUE (NUMPED, CODFILIAL, CODCOB, PARCELA)`);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("ORA-00955") ||
            message.includes("ORA-02261") ||
            message.includes("ORA-02264") ||
            message.includes("ORA-01031")) {
            return;
        }
        throw error;
    }
}
async function createCaixaAuditSummaryTableIfMissing() {
    if (await tableExists("RC_CAIXA_AUDIT_SUMMARY"))
        return;
    try {
        await execDml(`CREATE TABLE RC_CAIXA_AUDIT_SUMMARY (
      ID VARCHAR2(36) PRIMARY KEY,
      CODFILIAL VARCHAR2(10) NOT NULL,
      DATA_MOVIMENTO DATE NOT NULL,
      NUMCHECKOUT VARCHAR2(30) NOT NULL,
      CODFUNCCHECKOUT VARCHAR2(30) NOT NULL,
      STATUS_CAIXA VARCHAR2(40) NOT NULL,
      STATUS_FILIAL_DIA VARCHAR2(50) NOT NULL,
      VALOR_ESPERADO_WINTHOR NUMBER(18,2) NOT NULL,
      VALOR_INFORMADO_OPERADOR NUMBER(18,2),
      VALOR_AUDITADO NUMBER(18,2),
      VALOR_ACERTOS_APROVADOS NUMBER(18,2) DEFAULT 0 NOT NULL,
      DIFERENCA_ORIGINAL NUMBER(18,2),
      DIFERENCA_FINAL NUMBER(18,2),
      RISCO_SCORE NUMBER(9,2),
      RISCO_NIVEL VARCHAR2(12),
      ULTIMO_SNAPSHOT_ID VARCHAR2(36),
      ULTIMA_SQL_VERSAO NUMBER(6,0),
      ULTIMA_SQL_HASH VARCHAR2(64),
      ULTIMO_RESULT_HASH VARCHAR2(64),
      SNAPSHOT_GERADO_EM TIMESTAMP,
      CRIADO_EM TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      ATUALIZADO_EM TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
    )`);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("ORA-00955") || message.includes("ORA-01031"))
            return;
        throw error;
    }
}
async function createCaixaAuditSummaryUniqueIfMissing() {
    if (!(await tableExists("RC_CAIXA_AUDIT_SUMMARY")))
        return;
    try {
        await execDml(`ALTER TABLE RC_CAIXA_AUDIT_SUMMARY
      ADD CONSTRAINT UK_RC_CAIXA_SUMMARY
      UNIQUE (CODFILIAL, DATA_MOVIMENTO, NUMCHECKOUT, CODFUNCCHECKOUT)`);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("ORA-00955") ||
            message.includes("ORA-02261") ||
            message.includes("ORA-02264") ||
            message.includes("ORA-01031")) {
            return;
        }
        throw error;
    }
}
async function createCaixaAuditSnapshotTableIfMissing() {
    if (await tableExists("RC_CAIXA_AUDIT_SNAPSHOT"))
        return;
    try {
        await execDml(`CREATE TABLE RC_CAIXA_AUDIT_SNAPSHOT (
      ID VARCHAR2(36) PRIMARY KEY,
      CAIXA_ID VARCHAR2(36) NOT NULL,
      SNAPSHOT_ID VARCHAR2(36) NOT NULL,
      SNAPSHOT_VERSION NUMBER(6,0) NOT NULL,
      ROW_KEY VARCHAR2(300) NOT NULL,
      ROW_HASH VARCHAR2(64) NOT NULL,
      CODFILIAL VARCHAR2(10) NOT NULL,
      DATA_MOVIMENTO DATE NOT NULL,
      NUMCHECKOUT VARCHAR2(30) NOT NULL,
      CODFUNCCHECKOUT VARCHAR2(30) NOT NULL,
      DTFECHA TIMESTAMP,
      NUMTRANSVENDA VARCHAR2(40),
      PREST VARCHAR2(20),
      CODCOB VARCHAR2(10),
      VALOR NUMBER(18,2) NOT NULL,
      NSUTEF VARCHAR2(120),
      CODAUTORIZACAOTEF VARCHAR2(120),
      SQL_NOME VARCHAR2(80) NOT NULL,
      SQL_VERSAO NUMBER(6,0) NOT NULL,
      SQL_HASH VARCHAR2(64) NOT NULL,
      PARAMETROS_JSON CLOB NOT NULL,
      PARAMETROS_HASH VARCHAR2(64) NOT NULL,
      RESULT_HASH VARCHAR2(64),
      AMBIENTE_ORIGEM VARCHAR2(40) NOT NULL,
      SCHEMA_ORIGEM VARCHAR2(80) NOT NULL,
      CRIADO_EM TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
    )`);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("ORA-00955") || message.includes("ORA-01031"))
            return;
        throw error;
    }
}
async function createCaixaAuditEventLedgerTableIfMissing() {
    if (await tableExists("RC_CAIXA_AUDIT_EVENT_LEDGER"))
        return;
    try {
        await execDml(`CREATE TABLE RC_CAIXA_AUDIT_EVENT_LEDGER (
      ID VARCHAR2(36) PRIMARY KEY,
      AGGREGATE_TYPE VARCHAR2(40) NOT NULL,
      AGGREGATE_ID VARCHAR2(80) NOT NULL,
      EVENTO_TIPO VARCHAR2(80) NOT NULL,
      EVENTO_VERSAO NUMBER(6,0) NOT NULL,
      PAYLOAD_JSON CLOB,
      PAYLOAD_HASH VARCHAR2(64) NOT NULL,
      HASH_EVENTO VARCHAR2(64) NOT NULL,
      HASH_EVENTO_ANTERIOR VARCHAR2(64),
      USUARIO_ID VARCHAR2(80) NOT NULL,
      USUARIO_NOME VARCHAR2(180) NOT NULL,
      PERFIL_USUARIO VARCHAR2(80) NOT NULL,
      CODFILIAL VARCHAR2(10),
      DATA_MOVIMENTO DATE,
      NUMCHECKOUT VARCHAR2(30),
      CODFUNCCHECKOUT VARCHAR2(30),
      CORRELATION_ID VARCHAR2(80),
      REQUEST_ID VARCHAR2(80),
      IP_ORIGEM VARCHAR2(120),
      USER_AGENT VARCHAR2(500),
      CRIADO_EM_UTC TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      CRIADO_EM_LOCAL TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      TIMEZONE_LOCAL VARCHAR2(80) DEFAULT 'America/Santiago' NOT NULL,
      MOTIVO VARCHAR2(500),
      OBSERVACAO VARCHAR2(2000),
      SEQ_NUM NUMBER(10,0) NOT NULL
    )`);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("ORA-00955") || message.includes("ORA-01031"))
            return;
        throw error;
    }
}
async function createCaixaAuditAjusteTableIfMissing() {
    if (await tableExists("RC_CAIXA_AUDIT_ACERTO"))
        return;
    try {
        await execDml(`CREATE TABLE RC_CAIXA_AUDIT_ACERTO (
      ID VARCHAR2(36) PRIMARY KEY,
      CAIXA_ID VARCHAR2(36) NOT NULL,
      STATUS VARCHAR2(40) NOT NULL,
      VALOR NUMBER(18,2) NOT NULL,
      JUSTIFICATIVA VARCHAR2(4000) NOT NULL,
      MOTIVO VARCHAR2(500),
      SOLICITANTE_ID VARCHAR2(80) NOT NULL,
      SOLICITANTE_NOME VARCHAR2(180) NOT NULL,
      APROVADOR_ID VARCHAR2(80),
      APROVADOR_NOME VARCHAR2(180),
      APROVADO_EM TIMESTAMP,
      REPROVADO_EM TIMESTAMP,
      OBSERVACAO_DECISAO VARCHAR2(4000),
      REQUEST_ID VARCHAR2(80),
      CRIADO_EM TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      ATUALIZADO_EM TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
    )`);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("ORA-00955") || message.includes("ORA-01031"))
            return;
        throw error;
    }
}
async function createCaixaAuditEvidenciaTableIfMissing() {
    if (await tableExists("RC_CAIXA_AUDIT_EVIDENCIA"))
        return;
    try {
        await execDml(`CREATE TABLE RC_CAIXA_AUDIT_EVIDENCIA (
      ID VARCHAR2(36) PRIMARY KEY,
      ENTIDADE_TIPO VARCHAR2(40) NOT NULL,
      ENTIDADE_ID VARCHAR2(80) NOT NULL,
      TIPO_EVIDENCIA VARCHAR2(80) NOT NULL,
      NOME_ARQUIVO_ORIGINAL VARCHAR2(260) NOT NULL,
      NOME_ARQUIVO_STORAGE VARCHAR2(260) NOT NULL,
      MIME_TYPE VARCHAR2(120) NOT NULL,
      TAMANHO_BYTES NUMBER(12,0) NOT NULL,
      HASH_ARQUIVO VARCHAR2(128) NOT NULL,
      STORAGE_PATH VARCHAR2(500) NOT NULL,
      USUARIO_UPLOAD VARCHAR2(180) NOT NULL,
      DATA_UPLOAD TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      OBSERVACAO VARCHAR2(2000),
      VERSAO NUMBER(6,0) DEFAULT 1 NOT NULL,
      ATIVO NUMBER(1) DEFAULT 1 NOT NULL
    )`);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("ORA-00955") || message.includes("ORA-01031"))
            return;
        throw error;
    }
}
async function createCaixaAuditExcecaoTableIfMissing() {
    if (await tableExists("RC_CAIXA_AUDIT_EXCECAO"))
        return;
    try {
        await execDml(`CREATE TABLE RC_CAIXA_AUDIT_EXCECAO (
      ID VARCHAR2(36) PRIMARY KEY,
      ORIGEM VARCHAR2(60) NOT NULL,
      TIPO_EXCECAO VARCHAR2(80) NOT NULL,
      CRITICIDADE VARCHAR2(20) NOT NULL,
      CODFILIAL VARCHAR2(10) NOT NULL,
      DATA_MOVIMENTO DATE NOT NULL,
      NUMCHECKOUT VARCHAR2(30),
      CODFUNCCHECKOUT VARCHAR2(30),
      VALOR_EM_RISCO NUMBER(18,2) DEFAULT 0 NOT NULL,
      DESCRICAO VARCHAR2(2000) NOT NULL,
      CAUSA_RAIZ VARCHAR2(2000),
      RESPONSAVEL VARCHAR2(180),
      PRAZO_SLA TIMESTAMP,
      STATUS VARCHAR2(40) NOT NULL,
      PLANO_ACAO VARCHAR2(2000),
      DATA_ABERTURA TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      DATA_FECHAMENTO TIMESTAMP,
      USUARIO_FECHAMENTO VARCHAR2(180)
    )`);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("ORA-00955") || message.includes("ORA-01031"))
            return;
        throw error;
    }
}
async function createCaixaAuditSqlCatalogTableIfMissing() {
    if (await tableExists("RC_CAIXA_SQL_CATALOG"))
        return;
    try {
        await execDml(`CREATE TABLE RC_CAIXA_SQL_CATALOG (
      ID VARCHAR2(36) PRIMARY KEY,
      NOME_CONSULTA VARCHAR2(80) NOT NULL,
      VERSAO NUMBER(6,0) NOT NULL,
      HASH_SQL VARCHAR2(64) NOT NULL,
      SQL_TEXT CLOB NOT NULL,
      ALTERADO_POR_ID VARCHAR2(80) NOT NULL,
      ALTERADO_POR_NOME VARCHAR2(180) NOT NULL,
      ALTERADO_EM TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL,
      MOTIVO_ALTERACAO VARCHAR2(500)
    )`);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("ORA-00955") || message.includes("ORA-01031"))
            return;
        throw error;
    }
}
async function createVendasCartaoFaturadasView() {
    const itemTable = (await tableExists("PCPEDI")) ? "PCPEDI" : ((await tableExists("PEPEDI")) ? "PEPEDI" : null);
    if (!itemTable)
        return;
    const sql = `CREATE OR REPLACE VIEW VW_VENDAS_CARTAO_FATURADAS AS
    SELECT
      P.CODFILIAL,
      F.RAZAOSOCIAL AS NOME_FILIAL,
      P.NUMPED,
      NVL(P.DTFAT, P.DATA) AS DATA_VENDA,
      P.CODCLI,
      P.CODCOB,
      COB.COBRANCA AS DESCRICAO_COBRANCA,
      P.CODPLPAG,
      PL.DESCRICAO AS DESCRICAO_PLPAG,
      P.VLTOTAL AS VALOR_PEDIDO,
      IT.VALOR_ITENS_FATURADOS AS VALOR_ITENS,
      P.POSICAO AS POSICAO_CABECALHO,
      IT.POSICAO_ITEM_FATURADO AS POSICAO_ITEM,
      CASE
        WHEN ABS(NVL(P.VLTOTAL, 0) - NVL(IT.VALOR_ITENS_FATURADOS, 0)) > 0.01 THEN 1
        ELSE 0
      END AS IND_DIVERGENCIA_VALOR
    FROM PCPEDC P
    LEFT JOIN (
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
    WHERE P.POSICAO = 'F'`;
    try {
        await execDml(sql);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("ORA-01031"))
            return;
        throw error;
    }
}
async function createIndexesIfMissing() {
    const indexes = [
        { name: "IDX_ACTION_LOGS_DIV", ddl: "CREATE INDEX IDX_ACTION_LOGS_DIV ON ACTION_LOGS (DIVERGENCIA_ID)" },
        { name: "IDX_ACTION_LOGS_DATE", ddl: "CREATE INDEX IDX_ACTION_LOGS_DATE ON ACTION_LOGS (CREATED_AT)" },
        { name: "IDX_RC_REC_PREV_PED", ddl: "CREATE INDEX IDX_RC_REC_PREV_PED ON RC_RECEBIVEL_CARTAO_PREV (NUMPED, CODFILIAL, CODCOB, PARCELA)" },
        { name: "IDX_RC_REC_PREV_DATA", ddl: "CREATE INDEX IDX_RC_REC_PREV_DATA ON RC_RECEBIVEL_CARTAO_PREV (DT_PREV_RECEB)" },
        { name: "IDX_RC_REC_PREV_ST", ddl: "CREATE INDEX IDX_RC_REC_PREV_ST ON RC_RECEBIVEL_CARTAO_PREV (STATUS, ORIGEM)" },
        { name: "IDX_RC_CFG_COB_ATIVO", ddl: "CREATE INDEX IDX_RC_CFG_COB_ATIVO ON RC_CFG_COBRANCA_CARTAO (ATIVO, TIPO_CARTAO)" },
        { name: "IDX_RC_CFG_PLP_ATIVO", ddl: "CREATE INDEX IDX_RC_CFG_PLP_ATIVO ON RC_CFG_PLPAG_CARTAO (ATIVO)" },
        { name: "IDX_RC_CAIXA_SUMMARY_KEY", ddl: "CREATE INDEX IDX_RC_CAIXA_SUMMARY_KEY ON RC_CAIXA_AUDIT_SUMMARY (CODFILIAL, DATA_MOVIMENTO, NUMCHECKOUT, CODFUNCCHECKOUT)" },
        { name: "IDX_RC_CAIXA_SUMMARY_STATUS", ddl: "CREATE INDEX IDX_RC_CAIXA_SUMMARY_STATUS ON RC_CAIXA_AUDIT_SUMMARY (STATUS_CAIXA, STATUS_FILIAL_DIA, RISCO_NIVEL)" },
        { name: "IDX_RC_CAIXA_SNAP_CAIXA", ddl: "CREATE INDEX IDX_RC_CAIXA_SNAP_CAIXA ON RC_CAIXA_AUDIT_SNAPSHOT (CAIXA_ID, SNAPSHOT_VERSION)" },
        { name: "IDX_RC_CAIXA_SNAP_KEY", ddl: "CREATE INDEX IDX_RC_CAIXA_SNAP_KEY ON RC_CAIXA_AUDIT_SNAPSHOT (CODFILIAL, DATA_MOVIMENTO, NUMCHECKOUT, CODFUNCCHECKOUT)" },
        { name: "IDX_RC_CAIXA_LEDGER_AGG", ddl: "CREATE INDEX IDX_RC_CAIXA_LEDGER_AGG ON RC_CAIXA_AUDIT_EVENT_LEDGER (AGGREGATE_TYPE, AGGREGATE_ID, SEQ_NUM)" },
        { name: "IDX_RC_CAIXA_LEDGER_EVT", ddl: "CREATE INDEX IDX_RC_CAIXA_LEDGER_EVT ON RC_CAIXA_AUDIT_EVENT_LEDGER (EVENTO_TIPO, CRIADO_EM_UTC)" },
        { name: "IDX_RC_CAIXA_ACERTO_CAIXA", ddl: "CREATE INDEX IDX_RC_CAIXA_ACERTO_CAIXA ON RC_CAIXA_AUDIT_ACERTO (CAIXA_ID, STATUS)" },
        { name: "IDX_RC_CAIXA_ACERTO_REQ", ddl: "CREATE INDEX IDX_RC_CAIXA_ACERTO_REQ ON RC_CAIXA_AUDIT_ACERTO (REQUEST_ID)" },
        { name: "IDX_RC_CAIXA_EVIDENCIA_ENT", ddl: "CREATE INDEX IDX_RC_CAIXA_EVIDENCIA_ENT ON RC_CAIXA_AUDIT_EVIDENCIA (ENTIDADE_TIPO, ENTIDADE_ID, ATIVO)" },
        { name: "IDX_RC_CAIXA_SQL_CAT", ddl: "CREATE INDEX IDX_RC_CAIXA_SQL_CAT ON RC_CAIXA_SQL_CATALOG (NOME_CONSULTA, VERSAO)" },
        { name: "IDX_RC_CAIXA_EXC_KEY", ddl: "CREATE INDEX IDX_RC_CAIXA_EXC_KEY ON RC_CAIXA_AUDIT_EXCECAO (CODFILIAL, DATA_MOVIMENTO, STATUS, CRITICIDADE)" },
    ];
    for (const index of indexes) {
        const tableName = index.ddl.match(/ON\\s+([A-Z0-9_]+)/i)?.[1] ?? "";
        if (tableName && !(await tableExists(tableName)))
            continue;
        if (await indexExists(index.name))
            continue;
        try {
            await execDml(index.ddl);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes("ORA-00955") || message.includes("ORA-01408") || message.includes("ORA-01031")) {
                continue;
            }
            throw error;
        }
    }
}
export async function ensureReconaiTables() {
    if (!isOracleEnabled() || initialized)
        return;
    await createActionLogsTableIfMissing();
    await createCfgCobrancaCartaoTableIfMissing();
    await createCfgPlpagCartaoTableIfMissing();
    await createRecebivelPrevistoTableIfMissing();
    await createRecebivelUniqueConstraintIfMissing();
    await createCaixaAuditSummaryTableIfMissing();
    await createCaixaAuditSummaryUniqueIfMissing();
    await createCaixaAuditSnapshotTableIfMissing();
    await createCaixaAuditEventLedgerTableIfMissing();
    await createCaixaAuditAjusteTableIfMissing();
    await createCaixaAuditEvidenciaTableIfMissing();
    await createCaixaAuditExcecaoTableIfMissing();
    await createCaixaAuditSqlCatalogTableIfMissing();
    await createVendasCartaoFaturadasView();
    await createIndexesIfMissing();
    initialized = true;
}
