import oracledb from "oracledb";
import { isOracleEnabled } from "../db/oracle.js";
import { execDml, queryOne } from "./baseRepository.js";
import { db } from "./dataStore.js";
const TABLE_NAME = "SGQ_COLLECTION_STORE";
const COLLECTION_KEYS = [
    "usuarios",
    "auditLog",
    "parametros",
    "atendimentos",
    "sacAtendimentoAnexos",
    "requisicoesSac",
    "garantias",
    "ncs",
    "capas",
    "auditorias",
    "auditoriaTemplates",
    "auditoriaTemplateItems",
    "documentosQualidade",
    "treinamentosQualidade",
    "treinamentoParticipantes",
    "mudancasQualidade",
    "fornecedoresQualidade",
    "scarsFornecedores",
    "metrologiaInstrumentos",
    "metrologiaMsa",
    "indicadoresIndustriais",
    "regrasRiscoSla",
    "avaliacoesRiscoSla",
    "auditoriasCamadas",
    "gatesFornecedores",
    "isoReadiness",
    "osAssistencia",
    "reqMaterial",
    "consumoPeca",
    "osTransitionLog",
    "uxMetrics",
    "sacAvaliacoes",
    "inventarioLojas",
    "inventarioDepartamentos",
    "inventarioFrequencias",
    "inventarioTarefas",
    "inventarioContagens",
    "inventarioDivergencias",
    "inventarioChecklists",
    "inventarioInternoHeaders",
    "inventarioInternoItens",
    "inventarioInternoExportacoes",
    "inventarioInternoFilialMap",
    "operacionalAcessos",
    "operacionalVisitantes",
    "operacionalVeiculosVisitantes",
    "operacionalFrota",
    "operacionalDeslocamentos",
    "operacionalTransportadoras",
    "operacionalMotoristasTerceiros",
    "operacionalVeiculosTerceiros",
    "operacionalOperacoes",
    "operacionalAgendamentos",
    "operacionalDocas",
    "operacionalFilaPatio",
    "operacionalAlertas",
    "operacionalExcecoes",
    "operacionalNFsTransito",
    "operacionalExcecoesFiscais",
    "operacionalMovimentacoesFrota",
    "operacionalTimeline",
    "operacionalDashboard",
    "operacionalSolicitacoesAcesso",
    "cartaoOperadoraMovimentos",
    "cartaoErpLancamentos",
    "reconaiImportacoes",
    "reconaiRecebiveisConfiguracoes",
    "reconaiSnapshot",
    "reconaiActionLogs",
    "reconaiInternalTickets",
    "redeSalesValidationBatches",
    "redeSalesValidationItems",
    "redeSalesValidationWinthorUnmatched",
    "cardSettlementBatches",
    "cardSettlementItems",
    "cardSettlementWinthorUnmatched",
    "torreExcecoes",
    "torreKPIs",
    "agendamentosSlots",
    "agendamentoDockCapacity",
    "agendamentoKPIs",
    "custodias",
    "custodiaKPIs",
    "sesmt",
    "portariaSaidaFuncionario",
    "portariaSaidaFuncionarioLog",
    // Fiscal module collections
    "fiscalCnpjs",
    "fiscalCertificados",
    "fiscalControleNsu",
    "fiscalDocumentos",
    "fiscalDocumentosItens",
    "fiscalEventos",
    "fiscalXmlVault",
    "fiscalManifestacoes",
    "fiscalConciliacoes",
    "fiscalDivergencias",
    "fiscalRiscos",
    "fiscalWorkflow",
    "fiscalAlertas",
    "fiscalLogAuditoria",
    "fiscalExportacoes",
    "fiscalConfiguracoes",
    "fiscalRegrasRisco",
    // NFS-e Nacional module collections
    "nfseEmitidas",
    "nfseTomadas",
    "nfseServicos",
    "nfseTomadores",
    "nfseLotes",
    "nfseLogAuditoria",
    "nfseConfig",
    // Inspeções module now uses dedicated INS_* Oracle tables.
    // These collections are NO LONGER persisted via SGQ_COLLECTION_STORE.
    // They remain in dataStore only as in-memory fallback for local dev.
];
let ensured = false;
async function ensureTable() {
    if (!isOracleEnabled() || ensured)
        return;
    await execDml(`
    BEGIN
      EXECUTE IMMEDIATE '
        CREATE TABLE ${TABLE_NAME} (
          COLLECTION_KEY VARCHAR2(80) PRIMARY KEY,
          PAYLOAD CLOB NOT NULL,
          UPDATED_AT TIMESTAMP DEFAULT SYSTIMESTAMP NOT NULL
        )
      ';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLCODE != -955 THEN
          RAISE;
        END IF;
    END;
  `);
    ensured = true;
}
async function loadCollectionFromOracle(key) {
    const row = await queryOne(`SELECT PAYLOAD FROM ${TABLE_NAME} WHERE COLLECTION_KEY = :collectionKey`, { collectionKey: key });
    if (!row?.PAYLOAD)
        return null;
    try {
        return JSON.parse(row.PAYLOAD);
    }
    catch {
        return null;
    }
}
async function saveCollectionToOracle(key, value) {
    const payload = JSON.stringify(value);
    await execDml(`MERGE INTO ${TABLE_NAME} t
      USING (SELECT :collectionKey AS COLLECTION_KEY, :payload AS PAYLOAD FROM DUAL) s
      ON (t.COLLECTION_KEY = s.COLLECTION_KEY)
     WHEN MATCHED THEN
      UPDATE SET t.PAYLOAD = s.PAYLOAD, t.UPDATED_AT = SYSTIMESTAMP
     WHEN NOT MATCHED THEN
      INSERT (COLLECTION_KEY, PAYLOAD, UPDATED_AT)
      VALUES (s.COLLECTION_KEY, s.PAYLOAD, SYSTIMESTAMP)`, {
        collectionKey: key,
        payload: { val: payload, type: oracledb.CLOB },
    });
}
export async function initPersistentCollections() {
    if (!isOracleEnabled())
        return;
    try {
        await ensureTable();
        for (const key of COLLECTION_KEYS) {
            const loaded = await loadCollectionFromOracle(key);
            if (loaded == null) {
                await saveCollectionToOracle(key, db[key]);
            }
            else {
                db[key] = loaded;
            }
        }
    }
    catch (error) {
        console.error("Falha ao inicializar SGQ_COLLECTION_STORE no Oracle. Mantendo store em memoria.", error);
    }
}
export async function persistCollection(key) {
    if (!isOracleEnabled())
        return;
    try {
        await ensureTable();
        await saveCollectionToOracle(key, db[key]);
    }
    catch (error) {
        console.error(`Falha ao persistir colecao ${String(key)} no Oracle.`, error);
    }
}
export async function persistCollections(keys) {
    if (!isOracleEnabled())
        return;
    for (const key of keys) {
        await persistCollection(key);
    }
}
export async function persistAllCollections() {
    await persistCollections(COLLECTION_KEYS);
}
