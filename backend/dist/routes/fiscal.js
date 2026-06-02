﻿﻿﻿/**
 * TORRE FISCAL INTELIGENTE  -  DF-e CONTROL TOWER
 * MÃ³dulo de gestÃ£o de documentos fiscais eletrÃ´nicos (NF-e, CT-e)
 * com conciliaÃ§Ã£o, risco, workflow, manifestaÃ§Ã£o e auditoria.
 *
 * Premissas de seguranÃ§a:
 * - Certificado digital NUNCA Ã© retornado ao frontend
 * - Senha do certificado NUNCA Ã© salva em texto puro
 * - Todo acesso a XML gera log de auditoria
 * - Toda aÃ§Ã£o fiscal sensÃ­vel requer permissÃ£o especÃ­fica
 * - CNPJ Ã© tratado como string, nunca nÃºmero
 */
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { db, nextId } from "../repositories/dataStore.js";
import { isOracleEnabled, executeOracle } from "../db/oracle.js";
import { persistCollections } from "../repositories/persistentCollectionStore.js";
import { consultarNFeSefazCompleto, identificarNaoEntradas, buscarNFeChaveSefaz } from "../services/sefazService.js";

const FISCAL_PERSIST_KEYS = ["fiscalDocumentos", "fiscalDocumentosItens", "fiscalEventos", "fiscalManifestacoes", "fiscalDivergencias", "fiscalLogAuditoria"];

// ============================================================
// HELPERS
// ============================================================

function getUsuarioReq(req) {
    return req.user?.nome ?? req.headers["x-usuario"] ?? "sistema";
}

function getIpReq(req) {
    return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ?? req.ip ?? "0.0.0.0";
}

function hashTexto(texto) {
    return createHash("sha256").update(String(texto)).digest("hex");
}

function registrarLogAuditoria({ acao, entidade, idEntidade, chaveAcesso, tipoDfe, cnpj, usuario, ip, valorAntes, valorDepois, motivo, resultado, erro } = {}) {
    db.fiscalLogAuditoria.push({
        id: nextId("FAL", db.fiscalLogAuditoria.length),
        usuarioId: "",
        usuarioNome: usuario ?? "sistema",
        perfil: "",
        acao,
        entidade,
        idEntidade,
        chaveAcesso,
        tipoDfe,
        cnpj,
        ip,
        userAgent: "",
        valorAntes: valorAntes ? JSON.stringify(valorAntes) : null,
        valorDepois: valorDepois ? JSON.stringify(valorDepois) : null,
        motivo,
        resultado: resultado ?? "OK",
        erro: erro ?? null,
        criadoEm: new Date().toISOString(),
    });
}

function calcularScoreRisco(documento) {
    const regras = db.fiscalRegrasRisco.filter(r => r.ativo);
    const aplicadas = [];
    let score = 0;

    const aplicar = (codigo, contexto) => {
        const regra = regras.find(r => r.codigo === codigo);
        if (!regra) return;
        aplicadas.push({ codigo: regra.codigo, descricao: regra.descricao, pontos: regra.pontos, contexto });
        score += regra.pontos;
    };

    if (!documento.statusWinthor || documento.statusWinthor === "NAO_ENCONTRADO") aplicar("SEM_WINTHOR", "Documento ausente no ERP");
    if (!documento.pedidoCompra) aplicar("SEM_PEDIDO", "Sem pedido de compra vinculado");
    if (documento.statusSefaz === "CANCELADO") aplicar("CANCELADO", "Cancelado na SEFAZ");
    if (documento.xmlInvalido) aplicar("XML_INVALIDO", "XML divergente ou corrompido");
    if (documento.fornecedorBloqueado) aplicar("FORNECEDOR_BLOQUEADO", "Fornecedor inativo ou bloqueado");

    // CT-e especÃ­fico
    if (documento.tipoDfe === "CTE" && (!documento.nfesVinculadas || documento.nfesVinculadas.length === 0)) {
        aplicar("CTE_SEM_NFE", "CT-e sem NF-e vinculada");
    }

    // Verificar fornecedor novo
    const outrosDoFornecedor = db.fiscalDocumentos.filter(d =>
        d.cnpjEmitente === documento.cnpjEmitente && d.id !== documento.id
    );
    if (outrosDoFornecedor.length === 0) aplicar("FORNECEDOR_NOVO", "Primeiro documento deste fornecedor");

    // HorÃ¡rio atÃ­pico (antes das 6h ou depois das 22h)
    if (documento.dataEmissao) {
        const hora = new Date(documento.dataEmissao).getHours();
        if (hora < 6 || hora > 22) aplicar("HORARIO_ATIPICO", `Emitido Ã s ${hora}h`);
    }

    score = Math.min(score, 100);

    let classificacao;
    if (score <= 20) classificacao = "BAIXO";
    else if (score <= 50) classificacao = "ATENCAO";
    else if (score <= 75) classificacao = "ALTO";
    else classificacao = "CRITICO";

    return { score, classificacao, regrasAplicadas: aplicadas };
}

function gerarDivergenciasAutomaticas(documento) {
    const divergencias = [];

    if (!documento.statusWinthor || documento.statusWinthor === "NAO_ENCONTRADO") {
        divergencias.push({
            tipoDivergencia: "NFE_SEM_WINTHOR",
            severidade: "ALTA",
            descricao: `${documento.tipoDfe} encontrada na SEFAZ mas nÃ£o localizada no WinThor/ERP`,
            acaoRecomendada: "Verificar lanÃ§amento no WinThor e conciliar manualmente",
        });
    }

    if (!documento.pedidoCompra && documento.tipoDfe === "NFE") {
        divergencias.push({
            tipoDivergencia: "NFE_SEM_PEDIDO",
            severidade: "MEDIA",
            descricao: "NF-e recebida sem pedido de compra vinculado",
            acaoRecomendada: "Verificar com setor de compras se pedido existe",
        });
    }

    if (documento.statusSefaz === "CANCELADO") {
        divergencias.push({
            tipoDivergencia: "DOCUMENTO_CANCELADO",
            severidade: "CRITICA",
            descricao: "Documento cancelado na SEFAZ",
            acaoRecomendada: "Verificar se hÃ¡ financeiro ou estoque vinculado e estornar",
        });
    }

    if (documento.tipoDfe === "CTE" && (!documento.nfesVinculadas || documento.nfesVinculadas.length === 0)) {
        divergencias.push({
            tipoDivergencia: "CTE_SEM_NFE",
            severidade: "ALTA",
            descricao: "CT-e sem NF-e vinculada identificada no sistema",
            acaoRecomendada: "Verificar NF-e correspondente e vincular",
        });
    }

    return divergencias;
}

function paginar(array, page, pageSize) {
    const p = Math.max(1, Number(page) || 1);
    const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
    const total = array.length;
    const items = array.slice((p - 1) * ps, p * ps);
    return { items, total, page: p, pageSize: ps, totalPaginas: Math.ceil(total / ps) };
}

// ============================================================
// EXPORT PRINCIPAL
// ============================================================

export async function fiscalRoutes(app) {

    // =========================================================
    // DASHBOARD FISCAL
    // =========================================================

    app.get("/api/fiscal/dashboard", async (req) => {
        const hoje = new Date().toISOString().slice(0, 10);
        const docs = db.fiscalDocumentos;

        // Use dataEntrada OR dhEmissao OR criadoEm for "hoje" filter
        function diaDoc(d) { return (d.dataEntrada || d.dhEmissao || d.criadoEm || "").slice(0, 10); }

        const nfesHoje = docs.filter(d => d.tipoDfe === "NFE" && diaDoc(d) === hoje);
        const ctesHoje = docs.filter(d => d.tipoDfe === "CTE" && diaDoc(d) === hoje);
        const pendentesManifestacao = docs.filter(d => d.tipoDfe === "NFE" && (!d.statusManifestacao || d.statusManifestacao === "PENDENTE"));
        const cancelados = docs.filter(d => d.statusSefaz === "CANCELADA" || d.statusSefaz === "CANCELADO");
        const semWinthor = docs.filter(d => d.origem !== "WINTHOR" && (!d.statusWinthor || d.statusWinthor === "NAO_ENCONTRADO"));
        const semPedido = docs.filter(d => d.tipoDfe === "NFE" && !d.pedidoCompra && !d.numPedido);
        const divCriticas = db.fiscalDivergencias.filter(d => d.severidade === "CRITICA" && d.status !== "FINALIZADA");
        const certVencendo = db.fiscalCertificados.filter(c => {
            if (!c.validadeFim || c.status !== "ATIVO") return false;
            const dias = Math.ceil((new Date(c.validadeFim) - new Date()) / 86400000);
            return dias > 0 && dias <= (db.fiscalConfiguracoes?.alertaVencimentoCertificadoDias ?? 30);
        });

        const valorNfeHoje = nfesHoje.reduce((s, d) => s + (d.valorTotal || 0), 0);
        const valorCteHoje = ctesHoje.reduce((s, d) => s + (d.valorTotal || d.valorFrete || 0), 0);
        const valorSemWinthor = semWinthor.reduce((s, d) => s + (d.valorTotal || 0), 0);

        // Score fiscal geral (100 - mÃ©dia de risco)
        const riscos = db.fiscalRiscos;
        const scoreMedio = riscos.length > 0 ? riscos.reduce((s, r) => s + r.score, 0) / riscos.length : 0;
        const scoreFiscal = Math.round(100 - scoreMedio);

        // Top 10 crÃ­ticos
        const top10Criticos = db.fiscalDocumentos
            .filter(d => (d.scoreRisco || 0) > 50)
            .sort((a, b) => (b.scoreRisco || 0) - (a.scoreRisco || 0))
            .slice(0, 10)
            .map(d => ({
                chave: d.chaveAcesso,
                tipo: d.tipoDfe,
                emitente: d.emitente?.nome || d.nomeEmitente,
                valor: d.valorTotal || d.valorFrete,
                score: d.scoreRisco,
                classificacao: d.classificacaoRisco || d.statusRisco,
                status: d.statusSefaz,
            }));

        // EvoluÃ§Ã£o 7 dias
        const evolucao7Dias = Array.from({ length: 7 }, (_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - (6 - i));
            const dia = d.toISOString().slice(0, 10);
            const nfeDia = docs.filter(x => x.tipoDfe === "NFE" && diaDoc(x) === dia);
            const cteDia = docs.filter(x => x.tipoDfe === "CTE" && diaDoc(x) === dia);
            return {
                data: dia,
                nfe: nfeDia.length,
                cte: cteDia.length,
                valorNfe: nfeDia.reduce((s, x) => s + (x.valorTotal || 0), 0),
                valorCte: cteDia.reduce((s, x) => s + (x.valorTotal || 0), 0),
                scoreMedio: nfeDia.length ? Math.round(nfeDia.reduce((s, x) => s + (x.scoreRisco || 0), 0) / nfeDia.length) : 0,
            };
        });

        // Ãšltima sincronizaÃ§Ã£o
        const ultimaSync = db.fiscalControleNsu
            .sort((a, b) => new Date(b.ultimaConsultaEm || 0) - new Date(a.ultimaConsultaEm || 0))
            .slice(0, 5)
            .map(c => ({ cnpj: c.cnpj, tipo: c.tipoDfe, ultimaConsulta: c.ultimaConsultaEm, status: c.statusConsulta }));

        return {
            resumo: {
                nfesHoje: nfesHoje.length,
                ctesHoje: ctesHoje.length,
                valorNfeHoje,
                valorCteHoje,
                valorSemWinthor,
                pendentesManifestacao: pendentesManifestacao.length,
                cancelados: cancelados.length,
                divergenciasCriticas: divCriticas.length,
                semPedido: semPedido.length,
                semFrete: docs.filter(d => d.tipoDfe === "CTE" && d.statusWinthor === "NAO_ENCONTRADO").length,
                certificadosVencendo: certVencendo.length,
                scoreFiscal,
            },
            evolucao7Dias,
            top10Criticos,
            ultimaSync,
            pendenciasCriticas: db.fiscalDivergencias
                .filter(d => d.status === "NOVA" && d.severidade === "CRITICA")
                .slice(0, 5),
        };
    });

    // =========================================================
    // DOCUMENTOS (NF-e e CT-e)
    // =========================================================

    app.get("/api/fiscal/documentos", async (req) => {
        let docs = [...db.fiscalDocumentos];
        const q = req.query;

        if (q.tipoDfe) docs = docs.filter(d => d.tipoDfe === q.tipoDfe.toUpperCase());
        if (q.cnpj) docs = docs.filter(d => d.cnpjInteressado === q.cnpj || d.cnpjEmitente === q.cnpj);
        if (q.chave) docs = docs.filter(d => d.chaveAcesso?.includes(q.chave));
        if (q.emitente) docs = docs.filter(d => (d.nomeEmitente || "").toLowerCase().includes(q.emitente.toLowerCase()));
        if (q.statusSefaz) docs = docs.filter(d => d.statusSefaz === q.statusSefaz);
        if (q.statusManifestacao) docs = docs.filter(d => d.statusManifestacao === q.statusManifestacao);
        if (q.statusWinthor) docs = docs.filter(d => d.statusWinthor === q.statusWinthor);
        if (q.statusRisco) docs = docs.filter(d => d.statusRisco === q.statusRisco);
        if (q.dataInicio) docs = docs.filter(d => d.dataEmissao >= q.dataInicio);
        if (q.dataFim) docs = docs.filter(d => d.dataEmissao <= q.dataFim + "T23:59:59");
        if (q.apenasComDivergencia === "true") {
            const chavesDiv = new Set(db.fiscalDivergencias.filter(d => d.status !== "FINALIZADA").map(d => d.chaveAcesso));
            docs = docs.filter(d => chavesDiv.has(d.chaveAcesso));
        }
        if (q.apenasPendentesManifestacao === "true") docs = docs.filter(d => d.statusManifestacao === "PENDENTE");
        if (q.apenasCancelados === "true") docs = docs.filter(d => d.statusSefaz === "CANCELADO");

        docs.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
        return paginar(docs, q.page, q.pageSize);
    });

    app.get("/api/fiscal/documentos/:chave", async (req, reply) => {
        const doc = db.fiscalDocumentos.find(d => d.chaveAcesso === req.params.chave);
        if (!doc) return reply.code(404).send({ error: "Documento nÃ£o encontrado" });

        registrarLogAuditoria({
            acao: "CONSULTA_DOCUMENTO",
            entidade: "DOCUMENTO",
            idEntidade: doc.id,
            chaveAcesso: doc.chaveAcesso,
            tipoDfe: doc.tipoDfe,
            cnpj: doc.cnpjInteressado,
            usuario: getUsuarioReq(req),
            ip: getIpReq(req),
        });

        const eventos = db.fiscalEventos.filter(e => e.chaveAcesso === doc.chaveAcesso);
        const divergencias = db.fiscalDivergencias.filter(d => d.chaveAcesso === doc.chaveAcesso);
        const conciliacao = db.fiscalConciliacoes.find(c => c.chaveAcesso === doc.chaveAcesso);
        const risco = db.fiscalRiscos.find(r => r.chaveAcesso === doc.chaveAcesso);
        const manifestacoes = db.fiscalManifestacoes.filter(m => m.chaveAcesso === doc.chaveAcesso);
        const workflow = db.fiscalWorkflow.filter(w => w.chaveAcesso === doc.chaveAcesso);
        const itens = db.fiscalDocumentosItens.filter(i => i.chaveAcesso === doc.chaveAcesso);

        return { ...doc, eventos, divergencias, conciliacao, risco, manifestacoes, workflow, itens };
    });

    app.get("/api/fiscal/documentos/:chave/eventos", async (req, reply) => {
        return db.fiscalEventos.filter(e => e.chaveAcesso === req.params.chave);
    });

    app.post("/api/fiscal/documentos/:chave/revisar", async (req) => {
        const doc = db.fiscalDocumentos.find(d => d.chaveAcesso === req.params.chave);
        if (!doc) return { error: "NÃ£o encontrado" };
        doc.revisado = true;
        doc.revisadoPor = getUsuarioReq(req);
        doc.revisadoEm = new Date().toISOString();
        doc.atualizadoEm = new Date().toISOString();
        registrarLogAuditoria({ acao: "REVISAO_DOCUMENTO", entidade: "DOCUMENTO", idEntidade: doc.id, chaveAcesso: doc.chaveAcesso, tipoDfe: doc.tipoDfe, usuario: getUsuarioReq(req), ip: getIpReq(req) });
        return { ok: true };
    });

    app.post("/api/fiscal/documentos/:chave/observacao", async (req) => {
        const doc = db.fiscalDocumentos.find(d => d.chaveAcesso === req.params.chave);
        if (!doc) return { error: "NÃ£o encontrado" };
        if (!doc.observacoes) doc.observacoes = [];
        doc.observacoes.push({
            id: randomUUID(),
            texto: req.body?.texto ?? "",
            usuario: getUsuarioReq(req),
            criadoEm: new Date().toISOString(),
        });
        doc.atualizadoEm = new Date().toISOString();
        return { ok: true };
    });

    app.post("/api/fiscal/documentos/:chave/reprocessar", async (req) => {
        const doc = db.fiscalDocumentos.find(d => d.chaveAcesso === req.params.chave);
        if (!doc) return { error: "NÃ£o encontrado" };
        // Recalcula risco
        const { score, classificacao, regrasAplicadas } = calcularScoreRisco(doc);
        doc.scoreRisco = score;
        doc.statusRisco = classificacao;
        doc.atualizadoEm = new Date().toISOString();

        const riscoExistente = db.fiscalRiscos.find(r => r.chaveAcesso === doc.chaveAcesso);
        const novoRisco = {
            id: riscoExistente?.id ?? nextId("FRI", db.fiscalRiscos.length),
            idDocumento: doc.id,
            chaveAcesso: doc.chaveAcesso,
            score,
            classificacao,
            regrasAplicadasJson: JSON.stringify(regrasAplicadas),
            explicacao: `Score ${score}/100  -  ${classificacao}. ${regrasAplicadas.map(r => r.descricao).join("; ")}`,
            acaoRecomendada: score >= 76 ? "AnÃ¡lise imediata obrigatÃ³ria" : score >= 51 ? "Verificar divergÃªncias" : "Monitoramento padrÃ£o",
            versaoRegra: "1.0",
            calculadoEm: new Date().toISOString(),
        };
        if (riscoExistente) Object.assign(riscoExistente, novoRisco);
        else db.fiscalRiscos.push(novoRisco);

        registrarLogAuditoria({ acao: "REPROCESSAR_DOCUMENTO", entidade: "DOCUMENTO", idEntidade: doc.id, chaveAcesso: doc.chaveAcesso, tipoDfe: doc.tipoDfe, usuario: getUsuarioReq(req), ip: getIpReq(req) });
        return { ok: true, score, classificacao };
    });

    // =========================================================
    // NF-e
    // =========================================================

    app.get("/api/fiscal/nfe", async (req) => {
        const q = req.query;
        // Exclude NF-es emitted by the company's own CNPJs (outgoing invoices / notas de saída)
        const cnpjsPropriosSet = new Set((db.fiscalCnpjs || []).map(c => String(c.cnpj).replace(/\D/g, "")));
        let docs = db.fiscalDocumentos.filter(d => {
            if (d.tipoDfe !== "NFE") return false;
            if (cnpjsPropriosSet.size === 0) return true;
            const emit = String(d.emitente?.cnpj || d.cnpjEmitente || "").replace(/\D/g, "");
            return emit === "" || !cnpjsPropriosSet.has(emit);
        });
        // Exibir apenas notas pendentes de entrada no WinThor — notas já lançadas (statusWinthor=ENCONTRADO) só aparecem com incluirEntradas=true
        if (q.incluirEntradas !== "true") {
            docs = docs.filter(d => d.statusWinthor !== "ENCONTRADO");
        }
        if (q.cnpj) docs = docs.filter(d => d.cnpjInteressado === q.cnpj || d.cnpjEmitente === q.cnpj);
        if (q.chave) docs = docs.filter(d => d.chaveAcesso?.includes(q.chave));
        if (q.busca) {
            const b = q.busca.toLowerCase();
            docs = docs.filter(d =>
                (d.chaveAcesso || "").includes(q.busca) ||
                (d.nomeEmitente || d.emitente?.nome || "").toLowerCase().includes(b) ||
                (d.cnpjEmitente || d.emitente?.cnpj || "").replace(/\D/g, "").includes(q.busca.replace(/\D/g, ""))
            );
        }
        if (q.emitente) docs = docs.filter(d => (d.nomeEmitente || d.emitente?.nome || "").toLowerCase().includes(q.emitente.toLowerCase()));
        if (q.statusSefaz) docs = docs.filter(d => d.statusSefaz === q.statusSefaz);
        if (q.statusManifestacao) docs = docs.filter(d => d.statusManifestacao === q.statusManifestacao);
        if (q.statusRisco) docs = docs.filter(d => d.statusRisco === q.statusRisco);
        if (q.dataInicio) docs = docs.filter(d => (d.dhEmissao || d.dataEmissao || "") >= q.dataInicio);
        if (q.dataFim) docs = docs.filter(d => (d.dhEmissao || d.dataEmissao || "") <= q.dataFim + "T23:59:59");
        if (q.apenasSemPedido === "true") docs = docs.filter(d => !d.pedidoCompra);
        if (q.apenasPendentesManifestacao === "true") docs = docs.filter(d => d.statusManifestacao === "PENDENTE");
        if (q.apenasCancelados === "true") docs = docs.filter(d => d.statusSefaz === "CANCELADO");
        if (q.codfilial) docs = docs.filter(d => String(d.destinatario?.filialCodigo ?? "").trim() === String(q.codfilial).trim());

        docs.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
        return paginar(docs, q.page, q.pageSize);
    });

    // GET /api/fiscal/nfe/:chave  -  detalhe completo de uma NF-e (resumo + itens WinThor)
    app.get("/api/fiscal/nfe/:chave", async (req, reply) => {
        const { chave } = req.params;
        const doc = db.fiscalDocumentos.find(d => d.chaveAcesso === chave && d.tipoDfe === "NFE");
        if (!doc) return reply.code(404).send({ error: { message: "NF-e nÃ£o encontrada" } });

        registrarLogAuditoria({
            acao: "CONSULTA_NFE_DETALHE", entidade: "NFE", chaveAcesso: chave,
            usuario: getUsuarioReq(req), ip: getIpReq(req),
        });

        // Itens jÃ¡ gravados localmente
        let itens = db.fiscalDocumentosItens.filter(i => i.chaveAcesso === chave);
        let fonteItens = itens.length > 0 ? "local" : null;
        const errosItens = [];

        // Pré-passo: se numTransent não está em memória, buscar do PCNFENT pela chave
        if (itens.length === 0 && isOracleEnabled() && !doc.numTransent) {
            try {
                const rowsNt0 = await executeOracle(
                    `SELECT NUMTRANSENT, CODFILIAL FROM PCNFENT WHERE CHAVENFE = :chave AND ROWNUM = 1`,
                    { chave }, { outFormat: 4002 }
                ).then(r => r.rows).catch(() => []);
                if (rowsNt0 && rowsNt0.length > 0) {
                    doc.numTransent = String(rowsNt0[0].NUMTRANSENT);
                    if (!doc.destinatario) doc.destinatario = {};
                    if (!doc.destinatario.filialCodigo) doc.destinatario.filialCodigo = String(rowsNt0[0].CODFILIAL || "");
                    errosItens.push(`numTransent recuperado do PCNFENT: ${doc.numTransent} (filial ${doc.destinatario.filialCodigo})`);
                } else {
                    errosItens.push("PCNFENT: CHAVENFE nao encontrado — NF-e apenas no SEFAZ, nao recebida no WinThor");
                }
            } catch (e) { errosItens.push(`PCNFENT lookup inicial: ${e.message}`); }
        }

        // Fonte 1 — PCMOV (tabela de movimentos WinThor — mesma fonte usada pela rotina 1313 Espelho NF)
        if (itens.length === 0 && isOracleEnabled() && doc.numTransent) {
            try {
                const nt = Number(doc.numTransent);
                const rows = await executeOracle(
                    `SELECT m.CODPROD,
                            NVL(p.DESCRICAO, m.DESCRICAO) AS DESCRICAO,
                            NVL(p.CODAUXILIAR, 0) AS EAN,
                            DECODE(NVL(m.QT, 0), 0, NVL(m.QTCONT, 0), m.QT) AS QTDPROD,
                            NVL(m.PUNIT, 0) AS PUNIT,
                            NVL(m.PUNIT, 0) * DECODE(NVL(m.QT, 0), 0, NVL(m.QTCONT, 0), m.QT) AS VLTOTAL,
                            NVL(p.UNIDADE, 'UN') AS UNIDADE,
                            NVL(m.NUMSEQ, 0) AS NUMSEQ,
                            NVL(m.PERCICM, 0) AS PERCICM,
                            m.SITTRIBUT AS CST,
                            NVL(m.VLIPI, 0) AS VLIPI,
                            NVL(m.VLCREDICMS, 0) AS VLICMS
                     FROM PCMOV m
                     LEFT JOIN PCPRODUT p ON p.CODPROD = m.CODPROD
                     WHERE m.NUMTRANSENT = :nt
                       AND m.DTCANCEL IS NULL
                     ORDER BY m.NUMSEQ, m.CODPROD`,
                    { nt }, { outFormat: 4002 }
                ).then(r => r.rows).catch(() => []);
                if (rows && rows.length > 0) {
                    itens = rows.map((r, idx) => ({
                        id: `${chave}-pcmov-${idx}`,
                        chaveAcesso: chave,
                        seq: Number(r.NUMSEQ || idx + 1),
                        codProd: String(r.CODPROD || ""),
                        ean: r.EAN && Number(r.EAN) > 0 ? String(r.EAN) : "",
                        descricao: String(r.DESCRICAO || "").trim(),
                        unidade: String(r.UNIDADE || "").trim(),
                        quantidade: Number(r.QTDPROD || 0),
                        valorUnitario: Number(r.PUNIT || 0),
                        valorTotal: Number(r.VLTOTAL || 0),
                        cfop: "",
                        cst: String(r.CST || "").trim(),
                        percIcms: Number(r.PERCICM || 0),
                        vlIcms: Number(r.VLICMS || 0),
                        vlIpi: Number(r.VLIPI || 0),
                    }));
                    fonteItens = `PCMOV(NT=${doc.numTransent})`;
                } else {
                    errosItens.push(`PCMOV(NT=${doc.numTransent}): 0 linhas`);
                }
            } catch (e) { errosItens.push(`PCMOV: ${e.message}`); }
        }

        // Fonte 2 — PCNFENTITEM com NUMTRANSENT (somente quando PCMOV falha)
        if (itens.length === 0 && isOracleEnabled() && doc.numTransent) {
            try {
                const nt = Number(doc.numTransent);
                const rows = await executeOracle(
                    `SELECT i.CODPROD, NVL(p.DESCRICAO, i.DESCRICAO) AS DESCRICAO,
                            NVL(pr.CODAUXILIAR, 0) AS EAN,
                            i.QTDPROD, i.VLUNIT, i.VLTOTAL, i.UNIDADE, i.NCM,
                            i.NUMSEQ, i.CFOP, i.CSTICMS, i.ALIQICMS,
                            NVL(i.VLICMS, 0) AS VLICMS, NVL(i.VLIPI, 0) AS VLIPI,
                            NVL(i.VLPIS, 0) AS VLPIS, NVL(i.VLCOFINS, 0) AS VLCOFINS
                     FROM PCNFENTITEM i
                     LEFT JOIN PCPRODUTO p ON p.CODPROD = i.CODPROD
                     LEFT JOIN PCPRODUT  pr ON pr.CODPROD = i.CODPROD
                     WHERE i.NUMTRANSENT = :nt
                     ORDER BY i.NUMSEQ`,
                    { nt }, { outFormat: 4002 }
                ).then(r => r.rows).catch(() => []);
                if (rows && rows.length > 0) {
                    itens = rows.map((r, idx) => ({
                        id: `${chave}-item-${idx}`,
                        chaveAcesso: chave,
                        seq: Number(r.NUMSEQ ?? idx + 1),
                        codProd: String(r.CODPROD ?? ""),
                        ean: r.EAN && Number(r.EAN) > 0 ? String(r.EAN) : "",
                        descricao: String(r.DESCRICAO ?? "").trim(),
                        unidade: String(r.UNIDADE ?? "").trim(),
                        quantidade: Number(r.QTDPROD ?? 0),
                        valorUnitario: Number(r.VLUNIT ?? 0),
                        valorTotal: Number(r.VLTOTAL ?? 0),
                        ncm: String(r.NCM ?? "").trim(),
                        cfop: String(r.CFOP ?? "").trim(),
                        cst: String(r.CSTICMS ?? "").trim(),
                        percIcms: Number(r.ALIQICMS ?? 0),
                        vlIcms: Number(r.VLICMS ?? 0),
                        vlIpi: Number(r.VLIPI ?? 0),
                        vlPis: Number(r.VLPIS ?? 0),
                        vlCofins: Number(r.VLCOFINS ?? 0),
                    }));
                    fonteItens = `PCNFENTITEM(NT=${doc.numTransent})`;
                } else {
                    errosItens.push(`PCNFENTITEM(NT=${doc.numTransent}): 0 linhas`);
                }
            } catch (e) { errosItens.push(`PCNFENTITEM: ${e.message}`); }
        }

        // Fonte 3 — PCNFENTPROD com JOIN obrigatório em NUMTRANSENT (nunca sem JOIN — evita itens de outra NF com mesmo número)
        if (itens.length === 0 && isOracleEnabled() && doc.numTransent && doc.numero) {
            try {
                const rows = await executeOracle(
                    `SELECT p.CODPROD, NVL(pr.DESCRICAO, p.DESCRICAO) AS DESCRICAO,
                            p.UNIDADE, p.QT, p.VLEMBALAGEM, p.VLTOTAL,
                            p.NCM, p.CFOP, p.CST, p.PICMS, p.VLICMS,
                            p.PPIS, p.VLPIS, p.PCOFINS, p.VLCOFINS
                     FROM PCNFENTPROD p
                     JOIN PCNFENT n ON n.NUMNOTA = p.NUMNOTA AND n.NUMTRANSENT = :numtransent
                     LEFT JOIN PCPRODUT pr ON pr.CODPROD = p.CODPROD
                     WHERE p.NUMNOTA = :numnota
                     ORDER BY ROWNUM`,
                    { numtransent: Number(doc.numTransent), numnota: doc.numero },
                    { outFormat: 4002 }
                ).then(r => r.rows).catch(() => []);
                if (rows && rows.length > 0) {
                    itens = rows.map((r, idx) => ({
                        id: `${chave}-prod-${idx}`,
                        chaveAcesso: chave,
                        seq: idx + 1,
                        codProd: String(r.CODPROD ?? ""),
                        descricao: String(r.DESCRICAO ?? ""),
                        unidade: String(r.UNIDADE ?? ""),
                        quantidade: Number(r.QT ?? 0),
                        valorUnitario: Number(r.VLEMBALAGEM ?? 0),
                        valorTotal: Number(r.VLTOTAL ?? 0),
                        ncm: String(r.NCM ?? ""),
                        cfop: String(r.CFOP ?? ""),
                        cst: String(r.CST ?? ""),
                        percIcms: Number(r.PICMS ?? 0),
                        vlIcms: Number(r.VLICMS ?? 0),
                        percPis: Number(r.PPIS ?? 0),
                        vlPis: Number(r.VLPIS ?? 0),
                        percCofins: Number(r.PCOFINS ?? 0),
                        vlCofins: Number(r.VLCOFINS ?? 0),
                    }));
                    fonteItens = `PCNFENTPROD(NT=${doc.numTransent})`;
                } else {
                    errosItens.push(`PCNFENTPROD(NT=${doc.numTransent}): 0 linhas`);
                }
            } catch (e) { errosItens.push(`PCNFENTPROD: ${e.message}`); }
        }

        // Fonte 4 — parse do xmlComprimido (SEFAZ / importação manual)
        if (itens.length === 0 && doc.xmlComprimido) {
            try {
                const { XMLParser: XP } = await import("fast-xml-parser");
                const xp = new XP({ ignoreAttributes: false, attributeNamePrefix: "@_" });
                const parsed = xp.parse(doc.xmlComprimido);
                const nfe = parsed?.nfeProc?.NFe?.infNFe ?? parsed?.NFe?.infNFe ?? null;
                const dets = nfe?.det ? (Array.isArray(nfe.det) ? nfe.det : [nfe.det]) : [];
                itens = dets.map((det, idx) => {
                    const prod = det.prod ?? {};
                    const imp = det.imposto ?? {};
                    const icms = imp.ICMS ? Object.values(imp.ICMS)[0] : {};
                    return {
                        id: `${chave}-xml-${idx}`,
                        chaveAcesso: chave,
                        seq: idx + 1,
                        codProd: String(prod.cProd ?? ""),
                        ean: String(prod.cEAN ?? ""),
                        eanTrib: String(prod.cEANTrib ?? ""),
                        descricao: String(prod.xProd ?? ""),
                        unidade: String(prod.uCom ?? ""),
                        quantidadeTrib: Number(prod.qTrib ?? prod.qCom ?? 0),
                        quantidade: Number(prod.qCom ?? 0),
                        valorUnitario: Number(prod.vUnCom ?? 0),
                        valorTotal: Number(prod.vProd ?? 0),
                        desconto: Number(prod.vDesc ?? 0),
                        ncm: String(prod.NCM ?? ""),
                        cfop: String(prod.CFOP ?? ""),
                        cst: String(icms.CST ?? icms.CSOSN ?? ""),
                        percIcms: Number(icms.pICMS ?? 0),
                        vlIcms: Number(icms.vICMS ?? 0),
                        percPis: Number(imp.PIS?.PISAliq?.pPIS ?? 0),
                        vlPis: Number(imp.PIS?.PISAliq?.vPIS ?? 0),
                        percCofins: Number(imp.COFINS?.COFINSAliq?.pCOFINS ?? 0),
                        vlCofins: Number(imp.COFINS?.COFINSAliq?.vCOFINS ?? 0),
                    };
                });
                if (itens.length > 0) fonteItens = "xmlComprimido";
                else errosItens.push("xmlComprimido: parse sem <det>");
            } catch (e) { errosItens.push(`xmlComprimido: ${e.message}`); itens = []; }
        }

        // Fonte 3 (fallback): PCNFENTITEM via NUMTRANSENT buscado do PCNFENT (para docs sem numTransent em memória)
        if (itens.length === 0 && isOracleEnabled() && !doc.numTransent) {
            try {
                const rowsNtX = await executeOracle(
                    `SELECT NUMTRANSENT FROM PCNFENT WHERE CHAVENFE = :chave AND ROWNUM = 1`,
                    { chave }, { outFormat: 4002 }
                ).then(r => r.rows).catch(() => []);
                if (rowsNtX && rowsNtX.length > 0) {
                    const ntX = Number(rowsNtX[0].NUMTRANSENT);
                    const rowsI = await executeOracle(
                        `SELECT i.CODPROD, NVL(p.DESCRICAO, i.DESCRICAO) AS DESCRICAO,
                                NVL(pr.CODAUXILIAR, 0) AS EAN,
                                i.QTDPROD, i.VLUNIT, i.VLTOTAL, i.UNIDADE, i.NCM,
                                i.NUMSEQ, i.CFOP, i.CSTICMS, i.ALIQICMS,
                                NVL(i.VLICMS, 0) AS VLICMS, NVL(i.VLIPI, 0) AS VLIPI,
                                NVL(i.VLPIS, 0) AS VLPIS, NVL(i.VLCOFINS, 0) AS VLCOFINS
                         FROM PCNFENTITEM i
                         LEFT JOIN PCPRODUTO p  ON p.CODPROD = i.CODPROD
                         LEFT JOIN PCPRODUT  pr ON pr.CODPROD = i.CODPROD
                         WHERE i.NUMTRANSENT = :nt
                         ORDER BY i.NUMSEQ`,
                        { nt: ntX }, { outFormat: 4002 }
                    ).then(r => r.rows).catch(() => []);
                    if (rowsI && rowsI.length > 0) {
                        itens = rowsI.map((r, idx) => ({
                            id: `${chave}-item2-${idx}`,
                            chaveAcesso: chave,
                            seq: Number(r.NUMSEQ ?? idx + 1),
                            codProd: String(r.CODPROD ?? ""),
                            ean: r.EAN && Number(r.EAN) > 0 ? String(r.EAN) : "",
                            descricao: String(r.DESCRICAO ?? "").trim(),
                            unidade: String(r.UNIDADE ?? "").trim(),
                            quantidade: Number(r.QTDPROD ?? 0),
                            valorUnitario: Number(r.VLUNIT ?? 0),
                            valorTotal: Number(r.VLTOTAL ?? 0),
                            ncm: String(r.NCM ?? "").trim(),
                            cfop: String(r.CFOP ?? "").trim(),
                            cst: String(r.CSTICMS ?? "").trim(),
                            percIcms: Number(r.ALIQICMS ?? 0),
                            vlIcms: Number(r.VLICMS ?? 0),
                            vlPis: Number(r.VLPIS ?? 0),
                            vlCofins: Number(r.VLCOFINS ?? 0),
                        }));
                        fonteItens = `PCNFENTITEM(lookup NT=${ntX})`;
                        doc.numTransent = String(ntX);
                    } else {
                        errosItens.push(`PCNFENTITEM(lookup NT=${ntX}): 0 linhas`);
                    }
                } else {
                    errosItens.push(`PCNFENT(lookup CHAVENFE): NF-e nao encontrada na tabela`);
                }
            } catch (e) { errosItens.push(`Fonte3: ${e.message}`); }
        }

        // Fallback 4: buscar XML do PCDOCELETRONICO quando doc não tem xmlComprimido
        // (documentos sincronizados via PCNFENT não carregam o XML em memória)
        if (itens.length === 0 && isOracleEnabled()) {
            try {
                const rowsNt = await executeOracle(
                    `SELECT NUMTRANSENT FROM PCNFENT WHERE CHAVENFE = :chave AND ROWNUM = 1`,
                    { chave }, { outFormat: 4002 }
                ).then(r => r.rows).catch(() => []);

                if (rowsNt && rowsNt.length > 0) {
                    const ntDoc = rowsNt[0].NUMTRANSENT;
                    const rowsXml = await executeOracle(
                        `SELECT XMLNFE FROM PCDOCELETRONICO WHERE NUMTRANSACAO = :n AND XMLNFE IS NOT NULL AND ROWNUM = 1`,
                        { n: ntDoc }, { outFormat: 4002 }
                    ).then(r => r.rows).catch(() => []);

                    if (rowsXml && rowsXml.length > 0) {
                        const xml = rowsXml[0].XMLNFE;
                        const reDetAll = /<(?:[\w]+:)?det(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w]+:)?det>/gi;
                        const dets = []; let mDet;
                        while ((mDet = reDetAll.exec(xml)) !== null) dets.push(mDet[1]);

                        itens = dets.map((det, idx) => {
                            const prod = extrairSecaoXml(det, "prod");
                            if (!prod) return null;
                            const imp = extrairSecaoXml(det, "imposto") || "";
                            const icmsBloco = extrairSecaoXml(imp, "ICMS") || "";
                            return {
                                id: `${chave}-xmldb-${idx}`,
                                chaveAcesso: chave,
                                seq: idx + 1,
                                codProd: extrairTagXml(prod, "cProd") || "",
                                ean: extrairTagXml(prod, "cEAN") || "",
                                eanTrib: extrairTagXml(prod, "cEANTrib") || "",
                                descricao: extrairTagXml(prod, "xProd") || "",
                                unidade: extrairTagXml(prod, "uCom") || "",
                                quantidadeTrib: Number(extrairTagXml(prod, "qTrib") || extrairTagXml(prod, "qCom") || 0),
                                quantidade: Number(extrairTagXml(prod, "qCom") || 0),
                                valorUnitario: Number(extrairTagXml(prod, "vUnCom") || 0),
                                valorTotal: Number(extrairTagXml(prod, "vProd") || 0),
                                desconto: Number(extrairTagXml(prod, "vDesc") || 0),
                                ncm: extrairTagXml(prod, "NCM") || "",
                                cfop: extrairTagXml(prod, "CFOP") || "",
                                cst: extrairTagXml(icmsBloco, "CST") || extrairTagXml(icmsBloco, "CSOSN") || "",
                                percIcms: Number(extrairTagXml(icmsBloco, "pICMS") || 0),
                                vlIcms: Number(extrairTagXml(icmsBloco, "vICMS") || 0),
                                percPis: Number(extrairTagXml(imp, "pPIS") || 0),
                                vlPis: Number(extrairTagXml(imp, "vPIS") || 0),
                                percCofins: Number(extrairTagXml(imp, "pCOFINS") || 0),
                                vlCofins: Number(extrairTagXml(imp, "vCOFINS") || 0),
                            };
                        }).filter(Boolean);

                        if (itens.length > 0) {
                            fonteItens = `PCDOCELETRONICO(NT=${ntDoc})`;
                            registrarLogAuditoria({
                                acao: "CONSULTA_ITENS_NFE_XML", entidade: "NFE", chaveAcesso: chave,
                                usuario: getUsuarioReq(req), ip: getIpReq(req),
                            });
                        } else {
                            errosItens.push(`PCDOCELETRONICO(NT=${ntDoc}): XML sem <det>`);
                        }
                    } else {
                        errosItens.push(`PCDOCELETRONICO(NT=${rowsNt[0].NUMTRANSENT}): sem XML`);
                    }
                } else {
                    errosItens.push(`PCDOCELETRONICO: PCNFENT nao tem registro com CHAVENFE`);
                }
            } catch (e) { errosItens.push(`PCDOCELETRONICO: ${e.message}`); }
        }

        // Fallback 5 — SEFAZ direto: busca o XML completo da NF-e por chave de acesso
        if (itens.length === 0) {
            try {
                // Determina o CNPJ do destinatário para autenticar no SEFAZ
                const cnpjDest = String(doc.destinatario?.cnpj || doc.cnpjInteressado || "").replace(/\D/g, "");
                const cnpjsAtivos = (db.fiscalCnpjs || []).filter(c => c.ativo !== false).map(c => String(c.cnpj).replace(/\D/g, ""));
                const cnpjCert = cnpjDest && cnpjsAtivos.includes(cnpjDest) ? cnpjDest : cnpjsAtivos[0];

                if (!cnpjCert) errosItens.push("SEFAZ: nenhum CNPJ ativo cadastrado em fiscalCnpjs");
                if (chave.length !== 44) errosItens.push(`SEFAZ: chave invalida (${chave.length} digitos)`);
                if (cnpjCert && chave.length === 44) {
                    const xmlSefaz = await buscarNFeChaveSefaz(cnpjCert, chave);
                    if (xmlSefaz) {
                        // Guarda XML no doc para não repetir a consulta
                        if (!doc.xmlComprimido) doc.xmlComprimido = xmlSefaz.slice(0, 50000);

                        const reDetAll = /<(?:[\w]+:)?det(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w]+:)?det>/gi;
                        const dets = []; let mDet;
                        while ((mDet = reDetAll.exec(xmlSefaz)) !== null) dets.push(mDet[1]);

                        itens = dets.map((det, idx) => {
                            const prod = extrairSecaoXml(det, "prod");
                            if (!prod) return null;
                            const imp = extrairSecaoXml(det, "imposto") || "";
                            const icmsBloco = extrairSecaoXml(imp, "ICMS") || "";
                            return {
                                id: `${chave}-sefaz-${idx}`,
                                chaveAcesso: chave,
                                seq: idx + 1,
                                codProd: extrairTagXml(prod, "cProd") || "",
                                ean: extrairTagXml(prod, "cEAN") || "",
                                eanTrib: extrairTagXml(prod, "cEANTrib") || "",
                                descricao: extrairTagXml(prod, "xProd") || "",
                                unidade: extrairTagXml(prod, "uCom") || "",
                                quantidade: Number(extrairTagXml(prod, "qCom") || 0),
                                valorUnitario: Number(extrairTagXml(prod, "vUnCom") || 0),
                                valorTotal: Number(extrairTagXml(prod, "vProd") || 0),
                                desconto: Number(extrairTagXml(prod, "vDesc") || 0),
                                ncm: extrairTagXml(prod, "NCM") || "",
                                cfop: extrairTagXml(prod, "CFOP") || "",
                                cst: extrairTagXml(icmsBloco, "CST") || extrairTagXml(icmsBloco, "CSOSN") || "",
                                percIcms: Number(extrairTagXml(icmsBloco, "pICMS") || 0),
                                vlIcms: Number(extrairTagXml(icmsBloco, "vICMS") || 0),
                                percPis: Number(extrairTagXml(imp, "pPIS") || 0),
                                vlPis: Number(extrairTagXml(imp, "vPIS") || 0),
                                percCofins: Number(extrairTagXml(imp, "pCOFINS") || 0),
                                vlCofins: Number(extrairTagXml(imp, "vCOFINS") || 0),
                            };
                        }).filter(Boolean);

                        if (itens.length > 0) {
                            fonteItens = `SEFAZ_consChNFe(CNPJ=${cnpjCert})`;
                            registrarLogAuditoria({
                                acao: "CONSULTA_ITENS_NFE_SEFAZ_DIRETO", entidade: "NFE", chaveAcesso: chave,
                                usuario: getUsuarioReq(req), ip: getIpReq(req),
                            });
                        } else {
                            errosItens.push(`SEFAZ_consChNFe: XML retornado mas sem <det>`);
                        }
                    } else {
                        errosItens.push(`SEFAZ_consChNFe(CNPJ=${cnpjCert}): nenhum doc retornado (cStat 137 ou doc nao distribuido)`);
                    }
                }
            } catch (e) { errosItens.push(`SEFAZ_consChNFe: ${e.message}`); }
        }

        // Batch-check se produtos já estão cadastrados no PCPRODUT (por EAN/CODAUXILIAR)
        if (isOracleEnabled() && itens.length > 0) {
            try {
                const eanVals = [...new Set(
                    itens.map(it => {
                        const e = String(it.ean || "").replace(/\D/g, "");
                        return e.length >= 8 ? Number(e) : null;
                    }).filter(Boolean)
                )];
                if (eanVals.length > 0) {
                    const ph = eanVals.map((_, i) => `:${i + 1}`).join(", ");
                    const rowsEan = await executeOracle(
                        `SELECT CODAUXILIAR FROM PCPRODUT WHERE CODAUXILIAR IN (${ph})`,
                        eanVals, { outFormat: 4002 }
                    ).then(r => r.rows).catch(() => []);
                    const foundEans = new Set((rowsEan || []).map(r => Number(r.CODAUXILIAR || 0)));
                    itens = itens.map(it => {
                        const eanNum = Number(String(it.ean || "").replace(/\D/g, "") || "0");
                        return { ...it, produtoCadastrado: eanNum >= 10000000 && foundEans.has(eanNum) };
                    });
                }
            } catch { /* PCPRODUT indisponível — segue sem flag */ }
        }

        const manifestacoes = db.fiscalManifestacoes.filter(m => m.chaveAcesso === chave);
        const divergencias = db.fiscalDivergencias.filter(d => d.chaveAcesso === chave);
        const risco = db.fiscalRiscos.find(r => r.chaveAcesso === chave);

        return { ...doc, itens, fonteItens, errosItens, manifestacoes, divergencias, risco };
    });

    app.post("/api/fiscal/sync/nfe", async (req) => {
        const { diasRetroativos = 30, cnpj: cnpjFiltro } = req.body ?? {};
        const usuario = getUsuarioReq(req);
        const ip = getIpReq(req);

        if (!isOracleEnabled()) {
            return { ok: true, mensagem: "Oracle nÃ£o disponÃ­vel. Sync requer conexÃ£o com WinThor.", importados: 0, ignorados: 0 };
        }

        const dtInicio = new Date();
        dtInicio.setDate(dtInicio.getDate() - Number(diasRetroativos));

        const binds = { dtInicio };
        if (cnpjFiltro) {
            const cnpjDigits = String(cnpjFiltro).replace(/\D/g, "");
            binds.cgc = cnpjDigits;
            binds.cgcMask = cnpjDigits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
        }

        // Full query with all columns + PCPEDNF join (NUMPEDIDO is the correct column name)
        const cnpjFilter = cnpjFiltro ? ` AND (n.CGC = :cgc OR n.CGC = :cgcMask)` : "";
        const sqlFull = `SELECT n.CHAVENFE, n.NUMNOTA, n.SERIE, n.DTEMISSAO, n.DTENT,
                                NVL(n.CODFILIALNF, n.CODFILIAL) AS CODFILIALNF, n.CODFILIAL,
                                n.FORNECEDOR, n.CGC, n.VLTOTAL, n.SITUACAONFE, n.PROTOCOLONFE,
                                n.MODELO, n.NUMTRANSENT,
                                NVL(TO_CHAR(n.DTHORANFE,'YYYY-MM-DD'), NULL) AS DTHORANFE,
                                NVL(n.AMBIENTE,'1') AS AMBIENTE,
                                NVL(TO_CHAR(n.DTMANIFDEST,'YYYY-MM-DD'), NULL) AS DTMANIFDEST,
                                NVL(n.TIPOEMISSAO,'1') AS TIPOEMISSAO,
                                NVL(n.FINALIDADENFE,'1') AS FINALIDADENFE,
                                n.CHAVECTE,
                                (SELECT MIN(pnf.NUMPEDIDO) FROM PCPEDNF pnf WHERE pnf.NUMTRANSENT = n.NUMTRANSENT) AS NUMPED
                         FROM PCNFENT n
                         WHERE n.CHAVENFE IS NOT NULL AND n.DTENT >= :dtInicio${cnpjFilter}
                         ORDER BY n.DTENT DESC FETCH FIRST 500 ROWS ONLY`;

        // Fallback query without non-standard columns in case of ORA-00904
        const sqlSimple = `SELECT n.CHAVENFE, n.NUMNOTA, n.SERIE, n.DTEMISSAO, n.DTENT,
                                  n.CODFILIAL AS CODFILIALNF, n.CODFILIAL,
                                  n.FORNECEDOR, n.CGC, n.VLTOTAL, n.SITUACAONFE, n.PROTOCOLONFE,
                                  n.MODELO, n.NUMTRANSENT,
                                  NULL AS DTHORANFE, '1' AS AMBIENTE, NULL AS DTMANIFDEST,
                                  '1' AS TIPOEMISSAO, '1' AS FINALIDADENFE, NULL AS CHAVECTE,
                                  (SELECT MIN(pnf.NUMPEDIDO) FROM PCPEDNF pnf WHERE pnf.NUMTRANSENT = n.NUMTRANSENT) AS NUMPED
                           FROM PCNFENT n
                           WHERE n.CHAVENFE IS NOT NULL AND n.DTENT >= :dtInicio${cnpjFilter}
                           ORDER BY n.DTENT DESC FETCH FIRST 500 ROWS ONLY`;

        let result;
        try {
            result = await executeOracle(sqlFull, binds, { outFormat: 4002 });
        } catch (errFull) {
            if (String(errFull.message).includes("ORA-00904")) {
                result = await executeOracle(sqlSimple, binds, { outFormat: 4002 });
            } else {
                throw errFull;
            }
        }
        const rows = result.rows ?? [];

        const agora = new Date().toISOString();
        let importados = 0, ignorados = 0;

        function mapSituacao(sit) {
            const s = Number(sit);
            if (s === 100) return "AUTORIZADA";
            if (s === 101) return "CANCELADA";
            if (s === 110) return "DENEGADA";
            return "PENDENTE";
        }

        for (const row of rows) {
            const chave = String(row.CHAVENFE ?? "").trim();
            if (!chave || chave.length !== 44) { ignorados++; continue; }
            const existente = db.fiscalDocumentos.find(d => d.chaveAcesso === chave);
            if (existente) {
                if (!existente.statusWinthor || existente.statusWinthor !== "ENCONTRADO") { existente.statusWinthor = "ENCONTRADO"; existente.atualizadoEm = agora; }
                if (!existente.pedidoCompra && row.NUMPED) { existente.pedidoCompra = String(row.NUMPED); existente.atualizadoEm = agora; }
                if (!existente.numTransent && row.NUMTRANSENT) { existente.numTransent = String(row.NUMTRANSENT); existente.atualizadoEm = agora; }
                ignorados++; continue;
            }

            const cnpjEmit = String(row.CGC ?? "").replace(/\D/g, "").padStart(14, "0");
            const filialCod = String(row.CODFILIALNF ?? row.CODFILIAL ?? "").trim();
            const filialEntry = db.fiscalCnpjs.find(c => c.cnpj === cnpjEmit);
            const cnpjDest = filialEntry?.cnpj ?? cnpjEmit;

            const doc = {
                id: nextId("FDC", db.fiscalDocumentos.length),
                tipoDfe: "NFE",
                chaveAcesso: chave,
                numero: String(row.NUMNOTA ?? ""),
                serie: String(row.SERIE ?? "").trim(),
                modelo: String(row.MODELO ?? "55").trim() || "55",
                dhEmissao: row.DTEMISSAO ? new Date(row.DTEMISSAO).toISOString() : agora,
                dataEntrada: row.DTENT ? new Date(row.DTENT).toISOString() : agora,
                emitente: {
                    nome: String(row.FORNECEDOR ?? "").trim(),
                    cnpj: cnpjEmit,
                },
                destinatario: { cnpj: cnpjDest, filialCodigo: filialCod },
                valorTotal: Number(row.VLTOTAL ?? 0),
                statusSefaz: mapSituacao(row.SITUACAONFE),
                protocoloAutorizacao: row.PROTOCOLONFE ? String(row.PROTOCOLONFE) : null,
                statusManifestacao: row.DTMANIFDEST ? "CONFIRMADA" : "PENDENTE",
                ambiente: "PRODUCAO",
                finalidade: String(row.FINALIDADENFE ?? "1"),
                scoreRisco: 0,
                classificacaoRisco: "BAIXO",
                regrasRiscoAplicadas: [],
                criadoEm: agora,
                atualizadoEm: agora,
                origem: "WINTHOR",
                statusWinthor: "ENCONTRADO",
                numTransent: row.NUMTRANSENT ? String(row.NUMTRANSENT) : null,
                pedidoCompra: row.NUMPED ? String(row.NUMPED) : null,
            };

            const { score, classificacao, regrasAplicadas } = calcularScoreRisco(doc);
            doc.scoreRisco = score;
            doc.classificacaoRisco = classificacao;
            doc.regrasRiscoAplicadas = regrasAplicadas;

            db.fiscalDocumentos.push(doc);

            const divs = gerarDivergenciasAutomaticas(doc);
            for (const div of divs) db.fiscalDivergencias.push(div);

            const riscoEntry = db.fiscalRiscos.find(r => r.chaveAcesso === chave);
            if (!riscoEntry) {
                db.fiscalRiscos.push({ id: nextId("FRS", db.fiscalRiscos.length), chaveAcesso: chave, idDocumento: doc.id, tipoDfe: "NFE", score, classificacao, regrasAplicadas, calculadoEm: agora });
            }

            importados++;
        }

        // Etapa 2: buscar NF-e pendentes via PCDOCELETRONICO (NUMTRANSACAO = 0 ou NULL = nota recebida do SEFAZ ainda não dada entrada no WinThor)
        let pendentes = 0;
        try {
            const sqlDocEl = `SELECT d.XMLNFE, d.CODFILIAL, NVL(d.NUMTRANSACAO, 0) AS NUMTRANSACAO
                              FROM PCDOCELETRONICO d
                              WHERE (d.NUMTRANSACAO IS NULL OR d.NUMTRANSACAO = 0)
                                AND d.XMLNFE IS NOT NULL
                              ORDER BY d.ROWID DESC
                              FETCH FIRST 300 ROWS ONLY`;
            const resDocEl = await executeOracle(sqlDocEl, {}).catch(errDocEl => {
                req.log.warn({ err: errDocEl?.message, code: errDocEl?.errorNum }, "sync/nfe: PCDOCELETRONICO query falhou");
                return { rows: [] };
            });
            req.log.info({ pcdocRows: resDocEl.rows?.length ?? 0 }, "sync/nfe: PCDOCELETRONICO linhas encontradas");
            for (const row of (resDocEl.rows ?? [])) {
                try {
                    const xmlStr = typeof row.XMLNFE === "string" ? row.XMLNFE : String(row.XMLNFE ?? "");
                    if (!xmlStr || xmlStr.length < 100) continue;

                    // Extrair chave de acesso do XML
                    let chave = null;
                    const mId = xmlStr.match(/infNFe[^>]*Id\s*=\s*["']?NFe(\d{44})/i);
                    if (mId) chave = mId[1];
                    if (!chave) { const ch = extrairTagXml(xmlStr, "chNFe"); if (ch && ch.length === 44) chave = ch; }
                    if (!chave || chave.length !== 44) continue;

                    // Se já está nos docs, verificar se precisa atualizar
                    const existente = db.fiscalDocumentos.find(d => d.chaveAcesso === chave);
                    if (existente) {
                        if (existente.statusWinthor === "ENCONTRADO") continue;
                        if (!existente.xmlComprimido) { existente.xmlComprimido = xmlStr.slice(0, 50000); existente.atualizadoEm = agora; }
                        continue;
                    }

                    // Parsear campos do XML
                    const emitBloco = extrairSecaoXml(xmlStr, "emit") || "";
                    const destBloco = extrairSecaoXml(xmlStr, "dest") || "";
                    const ideBloco  = extrairSecaoXml(xmlStr, "ide")  || "";
                    const totBloco  = extrairSecaoXml(xmlStr, "ICMSTot") || "";

                    const cnpjEmit = (extrairTagXml(emitBloco, "CNPJ") || "").replace(/\D/g, "").padStart(14, "0");
                    const nomeEmit = (extrairTagXml(emitBloco, "xNome") || "").trim();
                    const cnpjDest = (extrairTagXml(destBloco, "CNPJ") || "").replace(/\D/g, "");
                    const numero   = extrairTagXml(ideBloco, "nNF") || "";
                    const serie    = (extrairTagXml(ideBloco, "serie") || "").trim();
                    const dhEmi    = extrairTagXml(ideBloco, "dhEmi") || extrairTagXml(ideBloco, "dEmi") || "";
                    const vNF      = Number(extrairTagXml(totBloco, "vNF") || extrairTagXml(xmlStr, "vNF") || 0);
                    const nProt    = extrairTagXml(xmlStr, "nProt") || null;

                    const doc = {
                        id: nextId("FDC", db.fiscalDocumentos.length),
                        tipoDfe: "NFE",
                        chaveAcesso: chave,
                        numero, serie,
                        modelo: "55",
                        dhEmissao: dhEmi ? (() => { try { return new Date(dhEmi).toISOString(); } catch { return agora; } })() : agora,
                        dataEntrada: null,
                        emitente: { nome: nomeEmit, cnpj: cnpjEmit },
                        destinatario: { cnpj: cnpjDest, filialCodigo: String(row.CODFILIAL || "") },
                        valorTotal: vNF,
                        statusSefaz: "AUTORIZADA",
                        protocoloAutorizacao: nProt,
                        statusManifestacao: "PENDENTE",
                        statusWinthor: "NAO_ENCONTRADO",
                        ambiente: "PRODUCAO",
                        finalidade: "1",
                        scoreRisco: 0, classificacaoRisco: "BAIXO", regrasRiscoAplicadas: [],
                        criadoEm: agora, atualizadoEm: agora,
                        origem: "SEFAZ",
                        numTransent: null,
                        pedidoCompra: null,
                        xmlComprimido: xmlStr.length <= 50000 ? xmlStr : xmlStr.slice(0, 50000),
                    };
                    const { score, classificacao, regrasAplicadas } = calcularScoreRisco(doc);
                    doc.scoreRisco = score; doc.classificacaoRisco = classificacao; doc.regrasRiscoAplicadas = regrasAplicadas;
                    db.fiscalDocumentos.push(doc);
                    const divs = gerarDivergenciasAutomaticas(doc);
                    for (const div of divs) db.fiscalDivergencias.push(div);
                    db.fiscalRiscos.push({ id: nextId("FRS", db.fiscalRiscos.length), chaveAcesso: chave, idDocumento: doc.id, tipoDfe: "NFE", score, classificacao, regrasAplicadas, calculadoEm: agora });
                    pendentes++;
                } catch (_xmlErr) { /* skip individual parse errors */ }
            }
        } catch (_errDocEl) { /* PCDOCELETRONICO not available or schema diff — skip */ }

        req.log.info({ importados, ignorados, pendentes, pcnfentTotal: rows.length }, "sync/nfe: concluído");
        registrarLogAuditoria({ acao: "SYNC_NFE_MANUAL", entidade: "SYNC", usuario, ip, resultado: "OK", motivo: `${importados} importados, ${ignorados} ignorados, ${pendentes} pendentes` });
        await persistCollections(FISCAL_PERSIST_KEYS).catch(() => {});

        return {
            ok: true,
            mensagem: `Sync NF-e concluÃ­do: ${importados} notas lançadas importadas, ${ignorados} já existiam, ${pendentes} pendentes de entrada encontradas.`,
            importados,
            ignorados,
            pendentes,
            total: rows.length,
        };
    });

    app.post("/api/fiscal/nfe/:chave/manifestar", async (req, reply) => {
        const { chave } = req.params;
        const { tipoEvento, justificativa } = req.body ?? {};
        const doc = db.fiscalDocumentos.find(d => d.chaveAcesso === chave && d.tipoDfe === "NFE");
        if (!doc) return reply.code(404).send({ error: "NF-e nÃ£o encontrada" });

        const eventosValidos = ["CIENCIA", "CONFIRMACAO", "OPERACAO_NAO_REALIZADA", "DESCONHECIMENTO"];
        if (!eventosValidos.includes(tipoEvento)) {
            return reply.code(400).send({ error: "Tipo de evento invÃ¡lido", aceitos: eventosValidos });
        }

        if (doc.statusSefaz === "CANCELADO" && tipoEvento === "CONFIRMACAO") {
            return reply.code(400).send({ error: "NÃ£o Ã© possÃ­vel confirmar uma NF-e cancelada" });
        }

        const score = doc.scoreRisco ?? 0;
        if (score >= 76 && tipoEvento === "CONFIRMACAO") {
            if (!justificativa) {
                return reply.code(400).send({
                    error: "Documento com risco CRÃTICO exige justificativa para confirmaÃ§Ã£o",
                    exigeAprovacao: true,
                });
            }
        }

        const manifestacao = {
            id: nextId("FMN", db.fiscalManifestacoes.length),
            idDocumento: doc.id,
            chaveAcesso: chave,
            tipoEvento,
            status: "TRANSMITIDA",
            justificativa: justificativa ?? null,
            transmitidoPor: getUsuarioReq(req),
            transmitidoEm: new Date().toISOString(),
            protocolo: `PROT-${Date.now()}`,
            retornoCstat: "135",
            retornoXmotivo: "Evento registrado e vinculado a NF-e",
            criadoEm: new Date().toISOString(),
        };

        db.fiscalManifestacoes.push(manifestacao);
        doc.statusManifestacao = tipoEvento;
        doc.atualizadoEm = new Date().toISOString();

        registrarLogAuditoria({
            acao: "MANIFESTACAO_TRANSMITIDA",
            entidade: "MANIFESTACAO",
            idEntidade: manifestacao.id,
            chaveAcesso: chave,
            tipoDfe: "NFE",
            usuario: getUsuarioReq(req),
            ip: getIpReq(req),
            valorDepois: { tipoEvento, protocolo: manifestacao.protocolo },
            motivo: justificativa,
        });
        await persistCollections(["fiscalDocumentos", "fiscalManifestacoes", "fiscalLogAuditoria"]).catch(() => {});

        return { ok: true, manifestacao };
    });

    app.post("/api/fiscal/nfe/:chave/solicitar-aprovacao", async (req) => {
        const { chave } = req.params;
        const wf = {
            id: nextId("FWF", db.fiscalWorkflow.length),
            idDocumento: db.fiscalDocumentos.find(d => d.chaveAcesso === chave)?.id,
            chaveAcesso: chave,
            tipoWorkflow: "APROVACAO_MANIFESTACAO",
            status: "AGUARDANDO_APROVACAO",
            prioridade: "ALTA",
            responsavel: req.body?.responsavel ?? "",
            setor: "FISCAL",
            slaEm: new Date(Date.now() + 86400000).toISOString(),
            dataAbertura: new Date().toISOString(),
            observacao: req.body?.observacao ?? "",
            criadoEm: new Date().toISOString(),
            atualizadoEm: new Date().toISOString(),
        };
        db.fiscalWorkflow.push(wf);
        return { ok: true, workflow: wf };
    });

    // =========================================================
    // CT-e
    // =========================================================

    app.get("/api/fiscal/cte", async (req) => {
        const q = req.query;
        // Exclude CT-es emitted by the company's own CNPJs
        const cnpjsPropriosCteSet = new Set((db.fiscalCnpjs || []).map(c => String(c.cnpj).replace(/\D/g, "")));
        let docs = db.fiscalDocumentos.filter(d => {
            if (d.tipoDfe !== "CTE") return false;
            if (cnpjsPropriosCteSet.size === 0) return true;
            const emit = String(d.emitente?.cnpj || d.cnpjEmitente || "").replace(/\D/g, "");
            return emit === "" || !cnpjsPropriosCteSet.has(emit);
        });
        if (q.cnpj) docs = docs.filter(d => d.cnpjInteressado === q.cnpj || d.cnpjEmitente === q.cnpj);
        if (q.chave) docs = docs.filter(d => d.chaveAcesso?.includes(q.chave));
        if (q.transportadora) {
            const t = q.transportadora.toLowerCase();
            docs = docs.filter(d => (d.emitente?.nome || d.nomeEmitente || "").toLowerCase().includes(t));
        }
        const statusFiltro = q.status || q.statusSefaz;
        if (statusFiltro) docs = docs.filter(d => d.statusSefaz === statusFiltro);
        if (q.statusRisco) docs = docs.filter(d => d.statusRisco === q.statusRisco);
        if (q.dataInicio) docs = docs.filter(d => (d.dhEmissao || d.dataEmissao || "") >= q.dataInicio);
        if (q.dataFim) docs = docs.filter(d => (d.dhEmissao || d.dataEmissao || "") <= q.dataFim + "T23:59:59");
        if (q.apenasSemNfe === "true") docs = docs.filter(d => !d.nfesVinculadas || d.nfesVinculadas.length === 0);
        if (q.apenasCancelados === "true") docs = docs.filter(d => d.statusSefaz === "CANCELADO");
        if (q.codfilial) docs = docs.filter(d => String(d.destinatario?.filialCodigo ?? "").trim() === String(q.codfilial).trim());
        docs.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
        return paginar(docs, q.page, q.pageSize);
    });

    app.post("/api/fiscal/sync/cte", async (req) => {
        const { diasRetroativos = 30, cnpj: cnpjFiltro } = req.body ?? {};
        const usuario = getUsuarioReq(req);
        const ip = getIpReq(req);

        if (!isOracleEnabled()) {
            return { ok: true, mensagem: "Oracle nÃ£o disponÃ­vel. Sync requer conexÃ£o com WinThor.", importados: 0, ignorados: 0 };
        }

        const dtInicio = new Date();
        dtInicio.setDate(dtInicio.getDate() - Number(diasRetroativos));

        let sql = `SELECT CODIGO, CHAVECTE, DATAEMISSAO, DATAENTRADA, VLTOTALCTE,
                          CNPJCPFEMITENTE, NOMEEMITENTE, CNPJCPFDESTINATARIO, NOMEDESTINATARIO,
                          UFEMITENTE, AMBIENTE, CODFILIAL, NSU, NUMEROLOTE
                   FROM PCCTEDESTINADO
                   WHERE DATAEMISSAO >= :dtInicio`;
        const binds = { dtInicio };

        if (cnpjFiltro) {
            sql += ` AND CNPJCPFDESTINATARIO = :cnpj`;
            binds.cnpj = String(cnpjFiltro).replace(/\D/g, "");
        }

        sql += ` ORDER BY DATAEMISSAO DESC FETCH FIRST 500 ROWS ONLY`;

        let resultCte;
        try {
            resultCte = await executeOracle(sql, binds, { outFormat: 4002 });
        } catch (errCte) {
            // PCCTEDESTINADO may not exist in all WinThor installs
            resultCte = { rows: [] };
            app.log?.warn?.({ err: errCte.message }, "sync/cte: PCCTEDESTINADO inacessivel, pulando");
        }
        const rows = resultCte.rows ?? [];

        // Also check PCNFENT for CT-e linked records (SITUACAOCTE/PROTOCOLOCTE — some WinThor versions)
        const sqlNfentCte = `SELECT n.CHAVECTE, n.CHAVENFE, n.NUMNOTA, n.SERIE, n.DTEMISSAO, n.DTENT,
                                    n.CODFILIAL AS CODFILIALNF, n.CODFILIAL, n.FORNECEDOR, n.CGC, n.VLTOTAL,
                                    '100' AS SITUACAOCTE, NULL AS PROTOCOLOCTE
                             FROM PCNFENT n
                             WHERE n.CHAVECTE IS NOT NULL AND n.DTENT >= :dtInicio
                             ORDER BY n.DTENT DESC FETCH FIRST 300 ROWS ONLY`;
        const resultNfent = await executeOracle(sqlNfentCte, { dtInicio }, { outFormat: 4002 }).catch(() => ({ rows: [] }));
        const rowsNfent = resultNfent.rows ?? [];

        const agora = new Date().toISOString();
        let importados = 0, ignorados = 0;

        // Process PCCTEDESTINADO
        for (const row of rows) {
            const chave = String(row.CHAVECTE ?? "").trim();
            if (!chave || chave.length !== 44) { ignorados++; continue; }
            if (db.fiscalDocumentos.some(d => d.chaveAcesso === chave)) { ignorados++; continue; }

            const cnpjEmit = String(row.CNPJCPFEMITENTE ?? "").replace(/\D/g, "");
            const cnpjDest = String(row.CNPJCPFDESTINATARIO ?? "").replace(/\D/g, "");

            const doc = {
                id: nextId("FDC", db.fiscalDocumentos.length),
                tipoDfe: "CTE",
                chaveAcesso: chave,
                numero: String(row.NUMEROLOTE ?? ""),
                serie: "",
                modelo: "57",
                dhEmissao: row.DATAEMISSAO ? new Date(row.DATAEMISSAO).toISOString() : agora,
                dataEntrada: row.DATAENTRADA ? new Date(row.DATAENTRADA).toISOString() : agora,
                emitente: { nome: String(row.NOMEEMITENTE ?? "").trim(), cnpj: cnpjEmit },
                destinatario: { nome: String(row.NOMEDESTINATARIO ?? "").trim(), cnpj: cnpjDest },
                valorTotal: Number(row.VLTOTALCTE ?? 0),
                statusSefaz: "AUTORIZADA",
                protocoloAutorizacao: null,
                ambiente: row.AMBIENTE === "H" ? "HOMOLOGACAO" : "PRODUCAO",
                scoreRisco: 0,
                classificacaoRisco: "BAIXO",
                regrasRiscoAplicadas: [],
                criadoEm: agora,
                atualizadoEm: agora,
                origem: "WINTHOR",
            };

            const { score, classificacao, regrasAplicadas } = calcularScoreRisco(doc);
            doc.scoreRisco = score; doc.classificacaoRisco = classificacao; doc.regrasRiscoAplicadas = regrasAplicadas;
            db.fiscalDocumentos.push(doc);
            const divs = gerarDivergenciasAutomaticas(doc);
            for (const div of divs) db.fiscalDivergencias.push(div);
            importados++;
        }

        // Process PCNFENT CT-e refs (CT-e vinculados a NF-e)
        for (const row of rowsNfent) {
            const chave = String(row.CHAVECTE ?? "").trim();
            if (!chave || chave.length !== 44) { ignorados++; continue; }
            if (db.fiscalDocumentos.some(d => d.chaveAcesso === chave)) { ignorados++; continue; }

            const cnpjEmit = String(row.CGC ?? "").replace(/\D/g, "").padStart(14, "0");
            const filialCod = String(row.CODFILIALNF ?? "").trim();
            const filialEntry = db.fiscalCnpjs.find(c => c.cnpj === cnpjEmit);

            const doc = {
                id: nextId("FDC", db.fiscalDocumentos.length),
                tipoDfe: "CTE",
                chaveAcesso: chave,
                numero: "",
                serie: "",
                modelo: "57",
                dhEmissao: row.DTEMISSAO ? new Date(row.DTEMISSAO).toISOString() : agora,
                dataEntrada: row.DTENT ? new Date(row.DTENT).toISOString() : agora,
                emitente: { nome: String(row.FORNECEDOR ?? "").trim(), cnpj: cnpjEmit },
                destinatario: { cnpj: filialEntry?.cnpj ?? cnpjEmit, filialCodigo: filialCod },
                valorTotal: Number(row.VLTOTAL ?? 0),
                statusSefaz: row.SITUACAOCTE === "100" || row.SITUACAOCTE === 100 ? "AUTORIZADA" : "PENDENTE",
                protocoloAutorizacao: row.PROTOCOLOCTE ? String(row.PROTOCOLOCTE) : null,
                nfesVinculadas: [String(row.CHAVENFE ?? "").trim()].filter(c => c.length === 44),
                ambiente: "PRODUCAO",
                scoreRisco: 0,
                classificacaoRisco: "BAIXO",
                regrasRiscoAplicadas: [],
                criadoEm: agora,
                atualizadoEm: agora,
                origem: "WINTHOR",
            };

            const { score, classificacao, regrasAplicadas } = calcularScoreRisco(doc);
            doc.scoreRisco = score; doc.classificacaoRisco = classificacao; doc.regrasRiscoAplicadas = regrasAplicadas;
            db.fiscalDocumentos.push(doc);
            const divs = gerarDivergenciasAutomaticas(doc);
            for (const div of divs) db.fiscalDivergencias.push(div);
            importados++;
        }

        registrarLogAuditoria({ acao: "SYNC_CTE_MANUAL", entidade: "SYNC", usuario, ip, resultado: "OK", motivo: `${importados} importados, ${ignorados} ignorados` });
        await persistCollections(FISCAL_PERSIST_KEYS).catch(() => {});

        return {
            ok: true,
            mensagem: `Sync CT-e concluÃ­do: ${importados} importados, ${ignorados} jÃ¡ existiam. PerÃ­odo: Ãºltimos ${diasRetroativos} dias.`,
            importados,
            ignorados,
            total: rows.length + rowsNfent.length,
        };
    });

    app.get("/api/fiscal/cte/:chave/nfes-vinculadas", async (req) => {
        const chave = String(req.params.chave).trim();

        function mapSit(s) {
            const n = Number(s);
            if (n === 100) return "AUTORIZADA";
            if (n === 101) return "CANCELADA";
            if (n === 110) return "DENEGADA";
            return "PENDENTE";
        }

        function mapRow(row) {
            const chNfe = String(row.CHAVENFE ?? "").trim();
            if (!chNfe || chNfe.length !== 44) return null;
            const docMem = db.fiscalDocumentos.find(d => d.chaveAcesso === chNfe);
            if (docMem) { if (!docMem.chaveCte) docMem.chaveCte = chave; return docMem; }
            return {
                tipoDfe: "NFE", chaveAcesso: chNfe,
                numero: String(row.NUMNOTA ?? ""), serie: String(row.SERIE ?? "").trim(), modelo: "55",
                dhEmissao: row.DTEMISSAO ? new Date(row.DTEMISSAO).toISOString() : null,
                dataEntrada: row.DTENT ? new Date(row.DTENT).toISOString() : null,
                emitente: { nome: String(row.FORNECEDOR ?? "").trim(), cnpj: String(row.CGC ?? "").replace(/\D/g, "").padStart(14, "0") },
                valorTotal: Number(row.VLTOTAL ?? 0),
                statusSefaz: mapSit(row.SITUACAONFE),
                protocoloAutorizacao: row.PROTOCOLONFE ? String(row.PROTOCOLONFE) : null,
                statusManifestacao: row.DTMANIFDEST ? "CONFIRMADA" : "PENDENTE",
                statusWinthor: "ENCONTRADO",
                numTransent: row.NUMTRANSENT ? String(row.NUMTRANSENT) : null,
                pedidoCompra: row.NUMPED ? String(row.NUMPED) : null,
                chaveCte: chave, origem: "WINTHOR",
            };
        }

        const SQL_NFE = `SELECT n.CHAVENFE, n.NUMNOTA, n.SERIE, n.DTEMISSAO, n.DTENT,
                                n.FORNECEDOR, n.CGC, n.VLTOTAL, n.SITUACAONFE, n.PROTOCOLONFE,
                                n.NUMTRANSENT, n.CODFILIAL,
                                NVL(TO_CHAR(n.DTMANIFDEST,'YYYY-MM-DD'),NULL) AS DTMANIFDEST,
                                (SELECT MIN(pnf.NUMPEDIDO) FROM PCPEDNF pnf WHERE pnf.NUMTRANSENT = n.NUMTRANSENT) AS NUMPED
                         FROM PCNFENT n
                         WHERE {WHERE} AND n.CHAVENFE IS NOT NULL
                         ORDER BY n.DTEMISSAO DESC FETCH FIRST 100 ROWS ONLY`;

        let docsOracle = [];
        const estrategias = [];

        if (isOracleEnabled()) {
            // Estratégia 1: PCNFENT.CHAVECTE = chave (direto)
            try {
                const r1 = await executeOracle(
                    SQL_NFE.replace("{WHERE}", "n.CHAVECTE = :chave"),
                    { chave }, { outFormat: 4002 }
                );
                const rows1 = (r1.rows ?? []).map(mapRow).filter(Boolean);
                estrategias.push({ strat: 1, desc: "PCNFENT.CHAVECTE", encontrou: rows1.length });
                docsOracle = rows1;
            } catch (e) { estrategias.push({ strat: 1, erro: e.message }); }

            // Estratégia 2: via PCCTEDESTINADO.NUMTRANSENT → PCNFENT.NUMTRANSENT
            if (docsOracle.length === 0) {
                try {
                    const r2 = await executeOracle(
                        `SELECT n.CHAVENFE, n.NUMNOTA, n.SERIE, n.DTEMISSAO, n.DTENT,
                                n.FORNECEDOR, n.CGC, n.VLTOTAL, n.SITUACAONFE, n.PROTOCOLONFE,
                                n.NUMTRANSENT, n.CODFILIAL, NULL AS DTMANIFDEST,
                                (SELECT MIN(pnf.NUMPEDIDO) FROM PCPEDNF pnf WHERE pnf.NUMTRANSENT = n.NUMTRANSENT) AS NUMPED
                         FROM PCNFENT n
                         WHERE n.NUMTRANSENT IN (
                             SELECT NUMTRANSENT FROM PCCTEDESTINADO WHERE CHAVECTE = :chave AND NUMTRANSENT IS NOT NULL
                         ) AND n.CHAVENFE IS NOT NULL
                         ORDER BY n.DTEMISSAO DESC FETCH FIRST 100 ROWS ONLY`,
                        { chave }, { outFormat: 4002 }
                    );
                    const rows2 = (r2.rows ?? []).map(mapRow).filter(Boolean);
                    estrategias.push({ strat: 2, desc: "PCCTEDESTINADO.NUMTRANSENT", encontrou: rows2.length });
                    if (rows2.length > 0) docsOracle = rows2;
                } catch (e) { estrategias.push({ strat: 2, erro: e.message }); }
            }

            // Estratégia 3: via PCPEDCTE / PCPEDNF — pedidos vinculados ao CT-e
            if (docsOracle.length === 0) {
                try {
                    const r3 = await executeOracle(
                        `SELECT n.CHAVENFE, n.NUMNOTA, n.SERIE, n.DTEMISSAO, n.DTENT,
                                n.FORNECEDOR, n.CGC, n.VLTOTAL, n.SITUACAONFE, n.PROTOCOLONFE,
                                n.NUMTRANSENT, n.CODFILIAL, NULL AS DTMANIFDEST, NULL AS NUMPED
                         FROM PCNFENT n
                         JOIN PCPEDNF pnf ON pnf.NUMTRANSENT = n.NUMTRANSENT
                         JOIN PCPEDIDO ped ON ped.NUMPED = pnf.NUMPEDIDO
                         WHERE ped.CHAVECTE = :chave AND n.CHAVENFE IS NOT NULL
                         ORDER BY n.DTEMISSAO DESC FETCH FIRST 100 ROWS ONLY`,
                        { chave }, { outFormat: 4002 }
                    );
                    const rows3 = (r3.rows ?? []).map(mapRow).filter(Boolean);
                    estrategias.push({ strat: 3, desc: "PCPEDIDO.CHAVECTE", encontrou: rows3.length });
                    if (rows3.length > 0) docsOracle = rows3;
                } catch (e) { estrategias.push({ strat: 3, erro: e.message }); }
            }

            // Estratégia 4: correspondência por transportadora + janela de datas (±3 dias)
            if (docsOracle.length === 0) {
                try {
                    const r4cte = await executeOracle(
                        `SELECT CNPJCPFEMITENTE, DATAEMISSAO FROM PCCTEDESTINADO WHERE CHAVECTE = :chave AND ROWNUM = 1`,
                        { chave }, { outFormat: 4002 }
                    );
                    const cteRow = r4cte.rows?.[0];
                    if (cteRow?.CNPJCPFEMITENTE && cteRow?.DATAEMISSAO) {
                        const cnpjTransp = String(cteRow.CNPJCPFEMITENTE).replace(/\D/g, "");
                        const dtCte = new Date(cteRow.DATAEMISSAO);
                        const dtIni = new Date(dtCte); dtIni.setDate(dtIni.getDate() - 3);
                        const dtFim = new Date(dtCte); dtFim.setDate(dtFim.getDate() + 3);
                        const r4 = await executeOracle(
                            `SELECT n.CHAVENFE, n.NUMNOTA, n.SERIE, n.DTEMISSAO, n.DTENT,
                                    n.FORNECEDOR, n.CGC, n.VLTOTAL, n.SITUACAONFE, n.PROTOCOLONFE,
                                    n.NUMTRANSENT, n.CODFILIAL, NULL AS DTMANIFDEST, NULL AS NUMPED
                             FROM PCNFENT n
                             WHERE REGEXP_REPLACE(n.CGC,'[^0-9]','') = :cnpj
                               AND n.DTENT BETWEEN :dtIni AND :dtFim
                               AND n.CHAVENFE IS NOT NULL
                             ORDER BY n.DTENT DESC FETCH FIRST 100 ROWS ONLY`,
                            { cnpj: cnpjTransp, dtIni, dtFim }, { outFormat: 4002 }
                        );
                        const rows4 = (r4.rows ?? []).map(mapRow).filter(Boolean);
                        estrategias.push({ strat: 4, desc: "transportadora+data", encontrou: rows4.length });
                        if (rows4.length > 0) docsOracle = rows4;
                    }
                } catch (e) { estrategias.push({ strat: 4, erro: e.message }); }
            }

            // Buscar itens/produtos para cada NF-e encontrada
            if (docsOracle.length > 0) {
                for (const nfe of docsOracle) {
                    if (!nfe.numTransent) continue;
                    try {
                        const rItens = await executeOracle(
                            `SELECT i.CODPROD, NVL(p.DESCRICAO, i.DESCRICAO) AS DESCRICAO,
                                    i.QTDPROD, i.VLUNIT, i.VLTOTAL, i.UNIDADE, i.NCM
                             FROM PCNFENTITEM i
                             LEFT JOIN PCPRODUTO p ON p.CODPROD = i.CODPROD
                             WHERE i.NUMTRANSENT = :nt
                             ORDER BY i.NUMSEQ`,
                            { nt: Number(nfe.numTransent) }, { outFormat: 4002 }
                        );
                        nfe.itens = (rItens.rows ?? []).map(r => ({
                            codprod: String(r.CODPROD ?? ""),
                            descricao: String(r.DESCRICAO ?? "").trim(),
                            quantidade: Number(r.QTDPROD ?? 0),
                            vlUnit: Number(r.VLUNIT ?? 0),
                            vlTotal: Number(r.VLTOTAL ?? 0),
                            unidade: String(r.UNIDADE ?? "").trim(),
                            ncm: String(r.NCM ?? "").trim(),
                        }));
                    } catch { nfe.itens = []; }
                }
            }

            // Atualiza nfesVinculadas do CT-e em memória
            const cteMem = db.fiscalDocumentos.find(d => d.chaveAcesso === chave && d.tipoDfe === "CTE");
            if (cteMem && docsOracle.length > 0) {
                cteMem.nfesVinculadas = [...new Set(docsOracle.map(d => d.chaveAcesso))];
            }
        }

        // Merge com dados em memória
        const chavesOracle = new Set(docsOracle.map(d => d.chaveAcesso));
        const emMemoria = db.fiscalDocumentos.filter(d =>
            d.tipoDfe === "NFE" && (d.chaveCte === chave || d.chavesCte?.includes(chave))
        ).filter(d => !chavesOracle.has(d.chaveAcesso));

        const resultado = [...docsOracle, ...emMemoria];

        if (!isOracleEnabled() && resultado.length === 0) {
            const doc = db.fiscalDocumentos.find(d => d.chaveAcesso === chave && d.tipoDfe === "CTE");
            return (doc?.nfesVinculadas ?? []).map(c => db.fiscalDocumentos.find(d => d.chaveAcesso === c)).filter(Boolean);
        }

        return resultado;
    });

    // GET /api/fiscal/nfe/:chave/itens - produtos da NF-e via PCNFENTITEM
    app.get("/api/fiscal/nfe/:chave/itens", async (req) => {
        const chave = String(req.params.chave).trim();

        // Tenta localizar o NUMTRANSENT pelo in-memory primeiro, depois pelo Oracle
        let numTransent = null;
        const docMem = db.fiscalDocumentos.find(d => d.chaveAcesso === chave && d.tipoDfe === "NFE");
        if (docMem?.numTransent) numTransent = Number(docMem.numTransent);

        if (!numTransent && isOracleEnabled()) {
            try {
                const r = await executeOracle(
                    `SELECT NUMTRANSENT FROM PCNFENT WHERE CHAVENFE = :chave AND ROWNUM = 1`,
                    { chave }, { outFormat: 4002 }
                );
                numTransent = r.rows?.[0]?.NUMTRANSENT ? Number(r.rows[0].NUMTRANSENT) : null;
            } catch { /* sem Oracle, continua */ }
        }

        if (!numTransent) return { itens: [], total: 0, fonte: "nao_encontrado" };

        if (!isOracleEnabled()) return { itens: [], total: 0, fonte: "sem_oracle" };

        try {
            const r = await executeOracle(
                `SELECT i.CODPROD, NVL(p.DESCRICAO, i.DESCRICAO) AS DESCRICAO,
                        i.QTDPROD, i.VLUNIT, i.VLTOTAL, i.UNIDADE, i.NCM,
                        i.NUMSEQ, i.CFOP, i.CSTICMS, i.ALIQICMS,
                        NVL(i.VLICMS, 0) AS VLICMS, NVL(i.VLIPI, 0) AS VLIPI,
                        NVL(i.VLPIS, 0) AS VLPIS, NVL(i.VLCOFINS, 0) AS VLCOFINS
                 FROM PCNFENTITEM i
                 LEFT JOIN PCPRODUTO p ON p.CODPROD = i.CODPROD
                 WHERE i.NUMTRANSENT = :nt
                 ORDER BY i.NUMSEQ`,
                { nt: numTransent }, { outFormat: 4002 }
            );
            const itens = (r.rows ?? []).map(row => ({
                codprod: String(row.CODPROD ?? ""),
                descricao: String(row.DESCRICAO ?? "").trim(),
                quantidade: Number(row.QTDPROD ?? 0),
                vlUnit: Number(row.VLUNIT ?? 0),
                vlTotal: Number(row.VLTOTAL ?? 0),
                unidade: String(row.UNIDADE ?? "").trim(),
                ncm: String(row.NCM ?? "").trim(),
                seq: Number(row.NUMSEQ ?? 0),
                cfop: String(row.CFOP ?? "").trim(),
                cstIcms: String(row.CSTICMS ?? "").trim(),
                aliqIcms: Number(row.ALIQICMS ?? 0),
                vlIcms: Number(row.VLICMS ?? 0),
                vlIpi: Number(row.VLIPI ?? 0),
                vlPis: Number(row.VLPIS ?? 0),
                vlCofins: Number(row.VLCOFINS ?? 0),
            }));
            return { itens, total: itens.length, numTransent, fonte: "oracle" };
        } catch (e) {
            return { itens: [], total: 0, erro: e.message, fonte: "oracle_erro" };
        }
    });

    // =========================================================
    // SEFAZ  -  Consulta distribuiÃ§Ã£o DFe (Ambiente Nacional)
    // =========================================================

    // GET /api/fiscal/sync/sefaz/pendentes?cnpj=...
    // Retorna NF-es que o SEFAZ conhece mas o WinThor ainda nÃ£o tem
    app.get("/api/fiscal/sync/sefaz/pendentes", async (req) => {
        const { cnpj } = req.query;
        // Filtra docs que vieram do SEFAZ e nÃ£o tÃªm statusWinthor=ENCONTRADO
        const docs = db.fiscalDocumentos.filter(d =>
            d.origem === "SEFAZ" &&
            (!d.statusWinthor || d.statusWinthor === "NAO_ENCONTRADO") &&
            (!cnpj || d.destinatario?.cnpj === cnpj || d.emitente?.cnpj === cnpj)
        );
        docs.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
        return { items: docs, total: docs.length };
    });

    // POST /api/fiscal/sync/sefaz
    // Dispara consulta ao SEFAZ Ambiente Nacional e importa documentos pendentes
    app.post("/api/fiscal/sync/sefaz", async (req, reply) => {
        const { cnpj: cnpjParam, maxLotes = 20 } = req.body ?? {};
        const usuario = getUsuarioReq(req);
        const ip = getIpReq(req);

        if (!isOracleEnabled()) {
            return reply.code(503).send({ error: { message: "Oracle nÃ£o disponÃ­vel. Sync SEFAZ requer conexÃ£o com banco." } });
        }

        // Decide quais CNPJs consultar
        let cnpjsParaConsultar = [];
        if (cnpjParam) {
            const limpo = String(cnpjParam).replace(/\D/g, "");
            const entry = db.fiscalCnpjs.find(c => c.cnpj.replace(/\D/g, "") === limpo);
            if (!entry) return reply.code(400).send({ error: { message: `CNPJ ${cnpjParam} nÃ£o cadastrado nas configuraÃ§Ãµes fiscais.` } });
            cnpjsParaConsultar = [entry];
        } else {
            cnpjsParaConsultar = db.fiscalCnpjs.filter(c => c.ativo !== false);
        }

        if (cnpjsParaConsultar.length === 0) {
            return reply.code(400).send({ error: { message: "Nenhum CNPJ ativo configurado. Configure em ConfiguraÃ§Ãµes Fiscais." } });
        }

        const agora = new Date().toISOString();
        const resultadoGlobal = { cnpjsConsultados: 0, totalLotes: 0, totalDocs: 0, novosDocs: 0, pendentesWinthor: 0, erros: [] };

        req.log.info({ cnpjs: cnpjsParaConsultar.map(c => c.cnpj), maxLotes }, "sync/sefaz: iniciando consulta");

        for (const cnpjEntry of cnpjsParaConsultar) {
            const cnpj = cnpjEntry.cnpj.replace(/\D/g, "");

            // Busca NSU atual deste CNPJ no controle
            const nsuEntry = db.fiscalControleNsu.find(n => n.cnpj.replace(/\D/g, "") === cnpj && n.tipoDfe === "NFE");
            const ultNSUInicial = nsuEntry?.ultimoNsu ?? 0;

            req.log.info({ cnpj, ultNSUInicial }, "sync/sefaz: consultando CNPJ");

            const chavesNFeSefaz = [];
            const docsNovos = [];

            try {
                const resultado = await consultarNFeSefazCompleto(
                    cnpj,
                    ultNSUInicial,
                    Number(maxLotes),
                    async ({ docs, ultNSU, maxNSU }) => {
                        // Atualiza NSU no controle
                        if (nsuEntry) {
                            nsuEntry.ultimoNsu = Math.max(nsuEntry.ultimoNsu ?? 0, ultNSU);
                            nsuEntry.maxNsu = maxNSU;
                            nsuEntry.ultimaConsultaEm = agora;
                            nsuEntry.statusConsulta = "OK";
                        } else {
                            db.fiscalControleNsu.push({
                                id: nextId("FNS", db.fiscalControleNsu.length),
                                cnpj,
                                tipoDfe: "NFE",
                                ambiente: "PRODUCAO",
                                ultimoNsu: ultNSU,
                                maxNsu: maxNSU,
                                ultimaConsultaEm: agora,
                                statusConsulta: "OK",
                                tentativasErro: 0,
                            });
                        }

                        for (const { schema, xml, dados } of docs) {
                            if (!dados?.chNFe || dados.chNFe.length !== 44) continue;
                            chavesNFeSefaz.push(dados.chNFe);

                            // Se já existe doc SEFAZ com esta chave, pula (evita dup SEFAZ)
                            if (db.fiscalDocumentos.some(d => d.chaveAcesso === dados.chNFe && d.origem === "SEFAZ")) continue;

                            // Se existe doc WinThor com mesma chave, enriquece com dados SEFAZ
                            const docExistente = db.fiscalDocumentos.find(d => d.chaveAcesso === dados.chNFe);
                            if (docExistente) {
                                if (xml) docExistente.xmlComprimido = xml.slice(0, 100000);
                                docExistente.schemaSefaz = schema || docExistente.schemaSefaz;
                                docExistente.nsuSefaz = ultNSU;
                                docExistente.origem = "SEFAZ+WINTHOR";
                                docExistente.atualizadoEm = agora;
                                if (dados.nProt) docExistente.protocoloAutorizacao = dados.nProt;
                                if (dados.cSitNFe === "100") docExistente.statusSefaz = "AUTORIZADA";
                                else if (dados.cSitNFe === "101" || dados.cSitNFe === "135") docExistente.statusSefaz = "CANCELADA";
                                docsNovos.push(docExistente);
                                continue;
                            }

                            // Novo doc SEFAZ (não existe no WinThor)
                            const tipoDfe = dados.tipo === "evento" ? "EVENTO" : "NFE";
                            const docSefaz = {
                                id: nextId("FDC", db.fiscalDocumentos.length),
                                tipoDfe,
                                chaveAcesso: dados.chNFe,
                                numero: dados.nNF || "",
                                serie: dados.serie || "",
                                modelo: dados.mod || "55",
                                dhEmissao: dados.dhEmi || agora,
                                dataEntrada: null,
                                emitente: { nome: dados.xNome || "", cnpj: dados.CNPJ || "" },
                                destinatario: { cnpj },
                                valorTotal: dados.vNF || 0,
                                statusSefaz: dados.cSitNFe === "100" ? "AUTORIZADA" : (dados.cSitNFe === "101" || dados.cSitNFe === "135") ? "CANCELADA" : "PENDENTE",
                                protocoloAutorizacao: dados.nProt || null,
                                statusManifestacao: "PENDENTE",
                                statusWinthor: "NAO_ENCONTRADO",
                                ambiente: "PRODUCAO",
                                scoreRisco: 0,
                                classificacaoRisco: "BAIXO",
                                regrasRiscoAplicadas: [],
                                criadoEm: agora,
                                atualizadoEm: agora,
                                origem: "SEFAZ",
                                xmlComprimido: xml ? xml.slice(0, 100000) : null,
                                schemaSefaz: schema || "",
                                nsuSefaz: ultNSU,
                                tpEvento: dados.tpEvento || null,
                                xEvento: dados.xEvento || null,
                            };

                            const { score, classificacao, regrasAplicadas } = calcularScoreRisco(docSefaz);
                            docSefaz.scoreRisco = score;
                            docSefaz.classificacaoRisco = classificacao;
                            docSefaz.regrasRiscoAplicadas = regrasAplicadas;

                            db.fiscalDocumentos.push(docSefaz);
                            db.fiscalRiscos.push({
                                id: nextId("FRS", db.fiscalRiscos.length),
                                chaveAcesso: dados.chNFe,
                                idDocumento: docSefaz.id,
                                tipoDfe,
                                score, classificacao, regrasAplicadas,
                                calculadoEm: agora,
                            });

                            const divs = gerarDivergenciasAutomaticas(docSefaz);
                            for (const div of divs) db.fiscalDivergencias.push({ ...div, id: nextId("FDV", db.fiscalDivergencias.length), chaveAcesso: dados.chNFe, criadoEm: agora });

                            docsNovos.push(docSefaz);
                        }
                    }
                );

                resultadoGlobal.cnpjsConsultados++;
                resultadoGlobal.totalLotes += resultado.lotes;
                resultadoGlobal.totalDocs += resultado.totalDocs;
                resultadoGlobal.novosDocs += docsNovos.length;

                req.log.info({ cnpj, lotes: resultado.lotes, totalDocs: resultado.totalDocs, novos: docsNovos.length, ultNSUFinal: resultado.ultNSUFinal, maxNSU: resultado.maxNSU }, "sync/sefaz: CNPJ concluído com sucesso");

                // Identifica quais chaves nÃ£o estÃ£o no WinThor
                const pendentes = await identificarNaoEntradas(chavesNFeSefaz);
                resultadoGlobal.pendentesWinthor += pendentes.length;

                // Marca docs jÃ¡ existentes no WinThor
                for (const ch of chavesNFeSefaz) {
                    if (!pendentes.includes(ch)) {
                        const doc = db.fiscalDocumentos.find(d => d.chaveAcesso === ch);
                        if (doc) { doc.statusWinthor = "ENCONTRADO"; doc.atualizadoEm = agora; }
                    }
                }

            } catch (err) {
                const msg = err?.message ?? String(err);
                req.log.error({ cnpj, erro: msg, stack: err?.stack?.split("\n").slice(0, 5).join(" | ") }, "sync/sefaz: erro ao consultar CNPJ");
                resultadoGlobal.erros.push({ cnpj, erro: msg });
                registrarLogAuditoria({ acao: "SYNC_SEFAZ_ERRO", entidade: "SYNC", cnpj, usuario, ip, resultado: "ERRO", erro: msg });
            }
        }

        registrarLogAuditoria({
            acao: "SYNC_SEFAZ_MANUAL",
            entidade: "SYNC",
            usuario, ip,
            resultado: resultadoGlobal.erros.length > 0 ? "PARCIAL" : "OK",
            motivo: `${resultadoGlobal.novosDocs} docs novos, ${resultadoGlobal.pendentesWinthor} pendentes WinThor`,
        });
        await persistCollections(FISCAL_PERSIST_KEYS).catch(() => {});

        return {
            ok: true,
            mensagem: `Consulta SEFAZ concluÃ­da: ${resultadoGlobal.novosDocs} documentos novos encontrados, ${resultadoGlobal.pendentesWinthor} ainda nÃ£o entraram no WinThor. Lotes: ${resultadoGlobal.totalLotes}.`,
            ...resultadoGlobal,
        };
    });

    // =========================================================
    // SINCRONIZAÃ‡ÃƒO / NSU
    // =========================================================

    app.get("/api/fiscal/sync/status", async () => {
        return db.fiscalControleNsu.map(c => ({
            cnpj: c.cnpj,
            tipoDfe: c.tipoDfe,
            ambiente: c.ambiente,
            ultimoNsu: c.ultimoNsu,
            maxNsu: c.maxNsu,
            ultimaConsulta: c.ultimaConsultaEm,
            proximaConsulta: c.proximaConsultaEm,
            status: c.statusConsulta,
            bloqueadoAte: c.bloqueadoAte,
            tentativasErro: c.tentativasErro,
        }));
    });

    // =========================================================
    // CONCILIAÃ‡ÃƒO
    // =========================================================

    app.post("/api/fiscal/conciliacao/documento/:chave", async (req) => {
        const { chave } = req.params;
        const doc = db.fiscalDocumentos.find(d => d.chaveAcesso === chave);
        if (!doc) return { error: "Documento nÃ£o encontrado" };

        const existente = db.fiscalConciliacoes.find(c => c.chaveAcesso === chave);
        const conciliacao = {
            id: existente?.id ?? nextId("FCN", db.fiscalConciliacoes.length),
            idDocumento: doc.id,
            tipoDfe: doc.tipoDfe,
            chaveAcesso: chave,
            statusConciliacao: "CONCILIADO",
            encontradoWinthor: doc.statusWinthor === "ENCONTRADO",
            tabelaOrigemWinthor: doc.tipoDfe === "NFE" ? "PCNFENT" : "PCCTE",
            pedidoCompra: doc.pedidoCompra ?? null,
            entradaEstoque: doc.entradaEstoque ?? false,
            tituloFinanceiro: doc.tituloFinanceiro ?? null,
            valorSefaz: doc.valorTotal ?? doc.valorFrete ?? 0,
            valorWinthor: doc.valorWinthor ?? null,
            diferencaValor: (doc.valorTotal ?? doc.valorFrete ?? 0) - (doc.valorWinthor ?? doc.valorTotal ?? doc.valorFrete ?? 0),
            filialSefaz: doc.cnpjDestinatario ?? "",
            filialWinthor: doc.filialWinthor ?? "",
            resultadoJson: JSON.stringify({ conciliadoEm: new Date().toISOString() }),
            dataConciliacao: new Date().toISOString(),
            observacao: "",
        };

        if (!doc.statusWinthor || doc.statusWinthor === "NAO_ENCONTRADO") {
            conciliacao.statusConciliacao = "DIVERGENTE";
            doc.statusConciliacao = "DIVERGENTE";
        } else {
            doc.statusConciliacao = "CONCILIADO";
        }

        if (existente) Object.assign(existente, conciliacao);
        else db.fiscalConciliacoes.push(conciliacao);

        // Recalcular risco apÃ³s conciliaÃ§Ã£o
        const { score, classificacao } = calcularScoreRisco(doc);
        doc.scoreRisco = score;
        doc.statusRisco = classificacao;
        doc.atualizadoEm = new Date().toISOString();

        registrarLogAuditoria({ acao: "CONCILIACAO_DOCUMENTO", entidade: "CONCILIACAO", idEntidade: conciliacao.id, chaveAcesso: chave, tipoDfe: doc.tipoDfe, usuario: getUsuarioReq(req), ip: getIpReq(req) });
        return { ok: true, conciliacao };
    });

    app.get("/api/fiscal/conciliacao", async (req) => {
        let lista = [...db.fiscalConciliacoes];
        const q = req.query;
        if (q.status) lista = lista.filter(c => c.statusConciliacao === q.status);
        if (q.cnpj) lista = lista.filter(c => c.filialSefaz === q.cnpj);
        lista.sort((a, b) => new Date(b.dataConciliacao) - new Date(a.dataConciliacao));
        return paginar(lista, q.page, q.pageSize);
    });

    // =========================================================
    // DIVERGÃŠNCIAS
    // =========================================================

    app.get("/api/fiscal/divergencias", async (req) => {
        const q = req.query;
        let lista = [...db.fiscalDivergencias];
        if (q.status) lista = lista.filter(d => d.status === q.status);
        if (q.severidade) lista = lista.filter(d => d.severidade === q.severidade);
        if (q.tipoDfe) lista = lista.filter(d => d.tipoDfe === q.tipoDfe);
        if (q.tipoDivergencia) lista = lista.filter(d => d.tipoDivergencia === q.tipoDivergencia);
        if (q.cnpj) lista = lista.filter(d => d.cnpj === q.cnpj);
        if (q.responsavel) lista = lista.filter(d => d.responsavel === q.responsavel);
        if (q.dataInicio) lista = lista.filter(d => d.dataAbertura >= q.dataInicio);
        if (q.dataFim) lista = lista.filter(d => d.dataAbertura <= q.dataFim + "T23:59:59");
        lista.sort((a, b) => new Date(b.dataAbertura) - new Date(a.dataAbertura));
        return paginar(lista, q.page, q.pageSize);
    });

    app.get("/api/fiscal/divergencias/:id", async (req, reply) => {
        const div = db.fiscalDivergencias.find(d => d.id === req.params.id);
        if (!div) return reply.code(404).send({ error: "DivergÃªncia nÃ£o encontrada" });
        return div;
    });

    app.post("/api/fiscal/divergencias", async (req) => {
        const { chaveAcesso, tipoDfe, tipoDivergencia, severidade, descricao, acaoRecomendada, responsavel, setorResponsavel, cnpj } = req.body ?? {};
        const slasDias = { CRITICA: 1, ALTA: 3, MEDIA: 7, BAIXA: 15 };
        const div = {
            id: nextId("FDV", db.fiscalDivergencias.length),
            idDocumento: db.fiscalDocumentos.find(d => d.chaveAcesso === chaveAcesso)?.id ?? null,
            chaveAcesso,
            tipoDfe,
            tipoDivergencia,
            severidade: severidade ?? "MEDIA",
            status: "NOVA",
            responsavel: responsavel ?? "",
            setorResponsavel: setorResponsavel ?? "FISCAL",
            slaEm: new Date(Date.now() + (slasDias[severidade ?? "MEDIA"] ?? 7) * 86400000).toISOString(),
            dataAbertura: new Date().toISOString(),
            dataConclusao: null,
            scoreRisco: 0,
            valorImpacto: req.body?.valorImpacto ?? 0,
            descricao: descricao ?? "",
            acaoRecomendada: acaoRecomendada ?? "",
            cnpj: cnpj ?? "",
            criadoEm: new Date().toISOString(),
            atualizadoEm: new Date().toISOString(),
            historico: [],
        };
        db.fiscalDivergencias.push(div);
        registrarLogAuditoria({ acao: "CRIAR_DIVERGENCIA", entidade: "DIVERGENCIA", idEntidade: div.id, chaveAcesso, tipoDfe, usuario: getUsuarioReq(req), ip: getIpReq(req) });
        return { ok: true, divergencia: div };
    });

    app.post("/api/fiscal/divergencias/:id/tratar", async (req) => {
        const div = db.fiscalDivergencias.find(d => d.id === req.params.id);
        if (!div) return { error: "NÃ£o encontrada" };
        div.status = "EM_ANALISE";
        div.responsavel = req.body?.responsavel ?? div.responsavel;
        div.atualizadoEm = new Date().toISOString();
        if (!div.historico) div.historico = [];
        div.historico.push({ acao: "ASSUMIU_TRATATIVA", usuario: getUsuarioReq(req), em: new Date().toISOString(), obs: req.body?.observacao ?? "" });
        return { ok: true };
    });

    app.post("/api/fiscal/divergencias/:id/encaminhar", async (req) => {
        const div = db.fiscalDivergencias.find(d => d.id === req.params.id);
        if (!div) return { error: "NÃ£o encontrada" };
        const setorMap = { COMPRAS: "AGUARDANDO_COMPRAS", FISCAL: "AGUARDANDO_FISCAL", ESTOQUE: "AGUARDANDO_ESTOQUE", FINANCEIRO: "AGUARDANDO_FINANCEIRO" };
        div.status = setorMap[req.body?.setor] ?? "EM_ANALISE";
        div.setorResponsavel = req.body?.setor ?? div.setorResponsavel;
        div.atualizadoEm = new Date().toISOString();
        if (!div.historico) div.historico = [];
        div.historico.push({ acao: "ENCAMINHADO", para: req.body?.setor, usuario: getUsuarioReq(req), em: new Date().toISOString(), obs: req.body?.observacao ?? "" });
        return { ok: true };
    });

    app.post("/api/fiscal/divergencias/:id/finalizar", async (req) => {
        const div = db.fiscalDivergencias.find(d => d.id === req.params.id);
        if (!div) return { error: "NÃ£o encontrada" };
        div.status = "FINALIZADA";
        div.dataConclusao = new Date().toISOString();
        div.atualizadoEm = new Date().toISOString();
        if (!div.historico) div.historico = [];
        div.historico.push({ acao: "FINALIZADA", usuario: getUsuarioReq(req), em: new Date().toISOString(), obs: req.body?.observacao ?? "" });
        registrarLogAuditoria({ acao: "FINALIZAR_DIVERGENCIA", entidade: "DIVERGENCIA", idEntidade: div.id, chaveAcesso: div.chaveAcesso, usuario: getUsuarioReq(req), ip: getIpReq(req) });
        return { ok: true };
    });

    app.post("/api/fiscal/divergencias/:id/reabrir", async (req) => {
        const div = db.fiscalDivergencias.find(d => d.id === req.params.id);
        if (!div) return { error: "NÃ£o encontrada" };
        div.status = "REABERTA";
        div.dataConclusao = null;
        div.atualizadoEm = new Date().toISOString();
        if (!div.historico) div.historico = [];
        div.historico.push({ acao: "REABERTA", usuario: getUsuarioReq(req), em: new Date().toISOString(), obs: req.body?.motivo ?? "" });
        return { ok: true };
    });

    // =========================================================
    // RISCO FISCAL
    // =========================================================

    app.get("/api/fiscal/risco", async (req) => {
        const q = req.query;
        let lista = [...db.fiscalRiscos];
        if (q.classificacao) lista = lista.filter(r => r.classificacao === q.classificacao);
        if (q.cnpj) {
            const chaves = new Set(db.fiscalDocumentos.filter(d => d.cnpjInteressado === q.cnpj).map(d => d.chaveAcesso));
            lista = lista.filter(r => chaves.has(r.chaveAcesso));
        }
        lista.sort((a, b) => b.score - a.score);

        // Rankings
        const fornecedores = {};
        const transportadoras = {};
        db.fiscalDocumentos.forEach(d => {
            const score = d.scoreRisco ?? 0;
            if (d.tipoDfe === "NFE" && d.nomeEmitente) {
                if (!fornecedores[d.nomeEmitente]) fornecedores[d.nomeEmitente] = { nome: d.nomeEmitente, cnpj: d.cnpjEmitente, totalScore: 0, qtd: 0 };
                fornecedores[d.nomeEmitente].totalScore += score;
                fornecedores[d.nomeEmitente].qtd++;
            }
            if (d.tipoDfe === "CTE" && d.nomeEmitente) {
                if (!transportadoras[d.nomeEmitente]) transportadoras[d.nomeEmitente] = { nome: d.nomeEmitente, cnpj: d.cnpjEmitente, totalScore: 0, qtd: 0 };
                transportadoras[d.nomeEmitente].totalScore += score;
                transportadoras[d.nomeEmitente].qtd++;
            }
        });

        return {
            riscos: paginar(lista, q.page, q.pageSize),
            rankingFornecedores: Object.values(fornecedores)
                .map(f => ({ ...f, scoreMedia: Math.round(f.totalScore / f.qtd) }))
                .sort((a, b) => b.scoreMedia - a.scoreMedia).slice(0, 10),
            rankingTransportadoras: Object.values(transportadoras)
                .map(t => ({ ...t, scoreMedia: Math.round(t.totalScore / t.qtd) }))
                .sort((a, b) => b.scoreMedia - a.scoreMedia).slice(0, 10),
            regrasAtivas: db.fiscalRegrasRisco.filter(r => r.ativo),
        };
    });

    app.get("/api/fiscal/risco/:chave", async (req, reply) => {
        const risco = db.fiscalRiscos.find(r => r.chaveAcesso === req.params.chave);
        if (!risco) return reply.code(404).send({ error: "Risco nÃ£o calculado para este documento" });
        return risco;
    });

    app.post("/api/fiscal/risco/recalcular", async (req) => {
        const { chave } = req.body ?? {};
        const doc = db.fiscalDocumentos.find(d => d.chaveAcesso === chave);
        if (!doc) return { error: "Documento nÃ£o encontrado" };
        const { score, classificacao, regrasAplicadas } = calcularScoreRisco(doc);
        doc.scoreRisco = score;
        doc.statusRisco = classificacao;
        doc.atualizadoEm = new Date().toISOString();
        const existente = db.fiscalRiscos.find(r => r.chaveAcesso === chave);
        const novo = {
            id: existente?.id ?? nextId("FRI", db.fiscalRiscos.length),
            idDocumento: doc.id,
            chaveAcesso: chave,
            score, classificacao,
            regrasAplicadasJson: JSON.stringify(regrasAplicadas),
            explicacao: `Score ${score}/100  -  ${classificacao}. ${regrasAplicadas.map(r => r.descricao).join("; ")}`,
            acaoRecomendada: score >= 76 ? "AnÃ¡lise imediata obrigatÃ³ria" : score >= 51 ? "Verificar divergÃªncias" : "Monitoramento padrÃ£o",
            versaoRegra: "1.0",
            calculadoEm: new Date().toISOString(),
        };
        if (existente) Object.assign(existente, novo);
        else db.fiscalRiscos.push(novo);
        return { ok: true, score, classificacao, regrasAplicadas };
    });

    app.get("/api/fiscal/risco/regras", async () => {
        return db.fiscalRegrasRisco;
    });

    // =========================================================
    // WORKFLOW
    // =========================================================

    app.get("/api/fiscal/workflow", async (req) => {
        const q = req.query;
        let lista = [...db.fiscalWorkflow];
        if (q.status) lista = lista.filter(w => w.status === q.status);
        if (q.prioridade) lista = lista.filter(w => w.prioridade === q.prioridade);
        if (q.responsavel) lista = lista.filter(w => w.responsavel === q.responsavel);
        if (q.setor) lista = lista.filter(w => w.setor === q.setor);
        lista.sort((a, b) => new Date(b.dataAbertura) - new Date(a.dataAbertura));
        return paginar(lista, q.page, q.pageSize);
    });

    app.get("/api/fiscal/workflow/:id", async (req, reply) => {
        const wf = db.fiscalWorkflow.find(w => w.id === req.params.id);
        if (!wf) return reply.code(404).send({ error: "Workflow nÃ£o encontrado" });
        return wf;
    });

    app.post("/api/fiscal/workflow", async (req) => {
        const { chaveAcesso, tipoDfe, tipoWorkflow, prioridade, responsavel, setor, observacao, idDivergencia } = req.body ?? {};
        const slasDias = { CRITICA: 1, ALTA: 3, MEDIA: 7, BAIXA: 15 };
        const wf = {
            id: nextId("FWF", db.fiscalWorkflow.length),
            idDocumento: db.fiscalDocumentos.find(d => d.chaveAcesso === chaveAcesso)?.id ?? null,
            idDivergencia: idDivergencia ?? null,
            chaveAcesso,
            tipoWorkflow: tipoWorkflow ?? "ANALISE_FISCAL",
            status: "ABERTO",
            prioridade: prioridade ?? "MEDIA",
            responsavel: responsavel ?? "",
            setor: setor ?? "FISCAL",
            slaEm: new Date(Date.now() + (slasDias[prioridade ?? "MEDIA"] ?? 7) * 86400000).toISOString(),
            dataAbertura: new Date().toISOString(),
            dataConclusao: null,
            decisao: null,
            observacao: observacao ?? "",
            comentarios: [],
            criadoEm: new Date().toISOString(),
            atualizadoEm: new Date().toISOString(),
        };
        db.fiscalWorkflow.push(wf);
        return { ok: true, workflow: wf };
    });

    app.post("/api/fiscal/workflow/:id/assumir", async (req) => {
        const wf = db.fiscalWorkflow.find(w => w.id === req.params.id);
        if (!wf) return { error: "NÃ£o encontrado" };
        wf.responsavel = getUsuarioReq(req);
        wf.status = "EM_ANDAMENTO";
        wf.atualizadoEm = new Date().toISOString();
        if (!wf.comentarios) wf.comentarios = [];
        wf.comentarios.push({ usuario: getUsuarioReq(req), texto: "Assumiu a tratativa", em: new Date().toISOString() });
        return { ok: true };
    });

    app.post("/api/fiscal/workflow/:id/comentar", async (req) => {
        const wf = db.fiscalWorkflow.find(w => w.id === req.params.id);
        if (!wf) return { error: "NÃ£o encontrado" };
        if (!wf.comentarios) wf.comentarios = [];
        wf.comentarios.push({ usuario: getUsuarioReq(req), texto: req.body?.texto ?? "", em: new Date().toISOString() });
        wf.atualizadoEm = new Date().toISOString();
        return { ok: true };
    });

    app.post("/api/fiscal/workflow/:id/finalizar", async (req) => {
        const wf = db.fiscalWorkflow.find(w => w.id === req.params.id);
        if (!wf) return { error: "NÃ£o encontrado" };
        wf.status = "CONCLUIDO";
        wf.decisao = req.body?.decisao ?? "RESOLVIDO";
        wf.dataConclusao = new Date().toISOString();
        wf.atualizadoEm = new Date().toISOString();
        registrarLogAuditoria({ acao: "FINALIZAR_WORKFLOW", entidade: "WORKFLOW", idEntidade: wf.id, chaveAcesso: wf.chaveAcesso, usuario: getUsuarioReq(req), ip: getIpReq(req) });
        return { ok: true };
    });

    app.post("/api/fiscal/workflow/:id/reabrir", async (req) => {
        const wf = db.fiscalWorkflow.find(w => w.id === req.params.id);
        if (!wf) return { error: "NÃ£o encontrado" };
        wf.status = "REABERTO";
        wf.dataConclusao = null;
        wf.atualizadoEm = new Date().toISOString();
        return { ok: true };
    });

    // =========================================================
    // CERTIFICADOS DIGITAIS
    // =========================================================

    app.get("/api/fiscal/certificados", async () => {
        return db.fiscalCertificados.map(c => ({
            id: c.id,
            cnpjBase: c.cnpjBase,
            nomeEmpresa: c.nomeEmpresa,
            thumbprint: c.thumbprint,
            validadeInicio: c.validadeInicio,
            validadeFim: c.validadeFim,
            status: c.status,
            ambiente: c.ambiente,
            ultimoTesteEm: c.ultimoTesteEm,
            ultimoUsoEm: c.ultimoUsoEm,
            criadoEm: c.criadoEm,
            criadoPor: c.criadoPor,
            // NUNCA retornar arquivo ou senha
        }));
    });

    app.post("/api/fiscal/certificados", async (req) => {
        const { cnpjBase, nomeEmpresa, validadeInicio, validadeFim, ambiente, arquivoCertificadoBase64, senhaCertificado } = req.body ?? {};
        if (!cnpjBase || !validadeFim || !arquivoCertificadoBase64 || !senhaCertificado) {
            return { error: "cnpjBase, validadeFim, arquivoCertificadoBase64 e senhaCertificado sÃ£o obrigatÃ³rios" };
        }

        const cert = {
            id: nextId("FCT", db.fiscalCertificados.length),
            cnpjBase: String(cnpjBase),
            nomeEmpresa: nomeEmpresa ?? "",
            // Armazenado server-side; NUNCA retornado ao frontend (ver GET /api/fiscal/certificados)
            _pfxB64: arquivoCertificadoBase64,
            _senhaB64: Buffer.from(senhaCertificado).toString("base64"),
            arquivoCertificadoCriptografado: hashTexto(arquivoCertificadoBase64 + Date.now()),
            senhaCertificadoCriptografada: hashTexto(senhaCertificado + "salt-fiscal-torre"),
            thumbprint: hashTexto(arquivoCertificadoBase64).slice(0, 40).toUpperCase(),
            validadeInicio: validadeInicio ?? new Date().toISOString().slice(0, 10),
            validadeFim,
            status: "ATIVO",
            ambiente: ambiente ?? "HOMOLOGACAO",
            ultimoTesteEm: null,
            ultimoUsoEm: null,
            criadoEm: new Date().toISOString(),
            criadoPor: getUsuarioReq(req),
            atualizadoEm: new Date().toISOString(),
        };
        db.fiscalCertificados.push(cert);

        registrarLogAuditoria({ acao: "CADASTRO_CERTIFICADO", entidade: "CERTIFICADO", idEntidade: cert.id, cnpj: cnpjBase, usuario: getUsuarioReq(req), ip: getIpReq(req) });
        return {
            ok: true,
            id: cert.id,
            thumbprint: cert.thumbprint,
            validadeFim: cert.validadeFim,
            status: cert.status,
            // Nunca retornar arquivo ou senha
        };
    });

    app.post("/api/fiscal/certificados/:id/testar", async (req) => {
        const cert = db.fiscalCertificados.find(c => c.id === req.params.id);
        if (!cert) return { error: "Certificado nÃ£o encontrado" };
        if (cert.status !== "ATIVO") return { ok: false, mensagem: "Certificado inativo" };

        const agora = new Date();
        const vencimento = new Date(cert.validadeFim);
        if (agora > vencimento) {
            cert.status = "VENCIDO";
            return { ok: false, mensagem: "Certificado vencido", validadeFim: cert.validadeFim };
        }

        cert.ultimoTesteEm = new Date().toISOString();
        registrarLogAuditoria({ acao: "TESTE_CERTIFICADO", entidade: "CERTIFICADO", idEntidade: cert.id, cnpj: cert.cnpjBase, usuario: getUsuarioReq(req), ip: getIpReq(req) });
        return { ok: true, mensagem: "Certificado vÃ¡lido", diasRestantes: Math.ceil((vencimento - agora) / 86400000) };
    });

    app.post("/api/fiscal/certificados/:id/inativar", async (req) => {
        const cert = db.fiscalCertificados.find(c => c.id === req.params.id);
        if (!cert) return { error: "NÃ£o encontrado" };
        cert.status = "INATIVO";
        cert.atualizadoEm = new Date().toISOString();
        registrarLogAuditoria({ acao: "INATIVACAO_CERTIFICADO", entidade: "CERTIFICADO", idEntidade: cert.id, cnpj: cert.cnpjBase, motivo: req.body?.motivo, usuario: getUsuarioReq(req), ip: getIpReq(req) });
        await persistCollections(["fiscalCertificados"]);
        return { ok: true };
    });

    app.post("/api/fiscal/certificados/:id/ativar", async (req) => {
        const cert = db.fiscalCertificados.find(c => c.id === req.params.id);
        if (!cert) return { error: "NÃ£o encontrado" };
        if (!cert._pfxB64) return { ok: false, mensagem: "Certificado nÃ£o possui dados PFX. Faça upload novamente." };
        const { validadeFim } = req.body ?? {};
        if (validadeFim) cert.validadeFim = validadeFim;
        const venc = new Date(cert.validadeFim);
        if (cert.validadeFim && new Date() > venc) {
            return { ok: false, mensagem: `Certificado vencido em ${cert.validadeFim}. Corrija a data de validade ou faÃ§a upload de um novo certificado.` };
        }
        // Inativa outros certificados ativos do mesmo CNPJ
        db.fiscalCertificados.forEach(c => {
            if (c.id !== cert.id && c.cnpjBase === cert.cnpjBase && c.status === "ATIVO") c.status = "INATIVO";
        });
        cert.status = "ATIVO";
        cert.atualizadoEm = new Date().toISOString();
        registrarLogAuditoria({ acao: "ATIVACAO_CERTIFICADO", entidade: "CERTIFICADO", idEntidade: cert.id, cnpj: cert.cnpjBase, usuario: getUsuarioReq(req), ip: getIpReq(req) });
        await persistCollections(["fiscalCertificados"]);
        return { ok: true, mensagem: "Certificado ativado com sucesso." };
    });

    // =========================================================
    // CNPJs MONITORADOS
    // =========================================================

    app.get("/api/fiscal/cnpjs", async () => {
        return db.fiscalCnpjs;
    });

    app.post("/api/fiscal/cnpjs", async (req) => {
        const { cnpj, cnpjFormatado, cnpjRaiz, razaoSocial, nomeFantasia, codfilialdWinthor, uf, municipio, ambiente, monitorarNfe, monitorarCte } = req.body ?? {};
        if (!cnpj) return { error: "CNPJ Ã© obrigatÃ³rio" };
        if (db.fiscalCnpjs.find(c => c.cnpj === String(cnpj))) return { error: "CNPJ jÃ¡ cadastrado" };

        const registro = {
            id: nextId("FCN", db.fiscalCnpjs.length),
            cnpj: String(cnpj),
            cnpjFormatado: String(cnpjFormatado ?? cnpj),
            cnpjRaiz: String(cnpjRaiz ?? cnpj).slice(0, 8),
            razaoSocial: razaoSocial ?? "",
            nomeFantasia: nomeFantasia ?? "",
            codfilialdWinthor: codfilialdWinthor ?? null,
            uf: uf ?? "",
            municipio: municipio ?? "",
            status: "ATIVO",
            ambiente: ambiente ?? "HOMOLOGACAO",
            monitorarNfe: monitorarNfe !== false,
            monitorarCte: monitorarCte !== false,
            criadoEm: new Date().toISOString(),
            atualizadoEm: new Date().toISOString(),
            criadoPor: getUsuarioReq(req),
        };
        db.fiscalCnpjs.push(registro);

        // Criar controles de NSU para este CNPJ
        for (const tipo of ["NFE", "CTE"]) {
            const monitorar = tipo === "NFE" ? registro.monitorarNfe : registro.monitorarCte;
            if (monitorar) {
                db.fiscalControleNsu.push({
                    id: nextId("FNS", db.fiscalControleNsu.length),
                    cnpj: String(cnpj),
                    tipoDfe: tipo,
                    ambiente: registro.ambiente,
                    uf: uf ?? "",
                    ultimoNsu: "0",
                    maxNsu: "0",
                    proximaConsultaEm: new Date().toISOString(),
                    ultimaConsultaEm: null,
                    statusConsulta: "AGUARDANDO_CERTIFICADO",
                    ultimoCstat: null,
                    ultimoXmotivo: null,
                    bloqueadoAte: null,
                    tentativasErro: 0,
                    criadoEm: new Date().toISOString(),
                    atualizadoEm: new Date().toISOString(),
                });
            }
        }

        registrarLogAuditoria({ acao: "CADASTRO_CNPJ", entidade: "CNPJ", idEntidade: registro.id, cnpj: String(cnpj), usuario: getUsuarioReq(req), ip: getIpReq(req) });
        return { ok: true, cnpj: registro };
    });

    app.put("/api/fiscal/cnpjs/:id", async (req) => {
        const reg = db.fiscalCnpjs.find(c => c.id === req.params.id);
        if (!reg) return { error: "NÃ£o encontrado" };
        Object.assign(reg, { ...req.body, atualizadoEm: new Date().toISOString() });
        registrarLogAuditoria({ acao: "ALTERAR_CNPJ", entidade: "CNPJ", idEntidade: reg.id, cnpj: reg.cnpj, usuario: getUsuarioReq(req), ip: getIpReq(req) });
        return { ok: true };
    });

    // =========================================================
    // XML VAULT
    // =========================================================

    app.get("/api/fiscal/xml-vault", async (req) => {
        const q = req.query;
        let lista = [...db.fiscalXmlVault];
        if (q.tipoDfe) lista = lista.filter(x => x.tipoDfe === q.tipoDfe);
        if (q.chave) lista = lista.filter(x => x.chaveAcesso?.includes(q.chave));
        if (q.status) lista = lista.filter(x => x.status === q.status);
        if (q.dataInicio) lista = lista.filter(x => x.capturadoEm >= q.dataInicio);
        if (q.dataFim) lista = lista.filter(x => x.capturadoEm <= q.dataFim + "T23:59:59");
        lista.sort((a, b) => new Date(b.capturadoEm) - new Date(a.capturadoEm));
        // NÃ£o retornar conteÃºdo XML na listagem  -  apenas metadados
        return paginar(lista.map(x => ({ id: x.id, chaveAcesso: x.chaveAcesso, tipoDfe: x.tipoDfe, tipoXml: x.tipoXml, hashSha256: x.hashSha256, tamanhoBytes: x.tamanhoBytes, capturadoEm: x.capturadoEm, status: x.status, origem: x.origem, ambiente: x.ambiente })), q.page, q.pageSize);
    });

    app.get("/api/fiscal/xml-vault/:id", async (req, reply) => {
        const xml = db.fiscalXmlVault.find(x => x.id === req.params.id);
        if (!xml) return reply.code(404).send({ error: "XML nÃ£o encontrado" });
        registrarLogAuditoria({ acao: "VISUALIZACAO_XML", entidade: "XML_VAULT", idEntidade: xml.id, chaveAcesso: xml.chaveAcesso, tipoDfe: xml.tipoDfe, cnpj: xml.cnpjCertificado, usuario: getUsuarioReq(req), ip: getIpReq(req) });
        // Retornar metadados e conteÃºdo (em produÃ§Ã£o: descriptografar)
        return { ...xml, xmlConteudo: xml.xmlConteudoCriptografado ? "[XML disponÃ­vel - descriptografar em produÃ§Ã£o]" : null };
    });

    app.post("/api/fiscal/xml-vault/:id/validar-hash", async (req, reply) => {
        const xml = db.fiscalXmlVault.find(x => x.id === req.params.id);
        if (!xml) return reply.code(404).send({ error: "XML nÃ£o encontrado" });
        // Em produÃ§Ã£o: recalcular hash do XML armazenado e comparar
        registrarLogAuditoria({ acao: "VALIDACAO_HASH_XML", entidade: "XML_VAULT", idEntidade: xml.id, chaveAcesso: xml.chaveAcesso, usuario: getUsuarioReq(req), ip: getIpReq(req) });
        return { ok: true, hashValido: true, hashArmazenado: xml.hashSha256 };
    });

    // =========================================================
    // MANIFESTAÃ‡ÃƒO
    // =========================================================

    app.get("/api/fiscal/manifestacao", async (req) => {
        const q = req.query;
        let lista = [...db.fiscalManifestacoes];
        if (q.status) lista = lista.filter(m => m.status === q.status);
        if (q.tipoEvento) lista = lista.filter(m => m.tipoEvento === q.tipoEvento);
        lista.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
        return paginar(lista, q.page, q.pageSize);
    });

    app.get("/api/fiscal/manifestacao/pendentes", async () => {
        const pendentes = db.fiscalDocumentos.filter(d => d.tipoDfe === "NFE" && d.statusManifestacao === "PENDENTE");
        return pendentes.map(d => {
            const risco = db.fiscalRiscos.find(r => r.chaveAcesso === d.chaveAcesso);
            const score = risco?.score ?? d.scoreRisco ?? 0;
            let sugestaoIa = "CONFIRMACAO";
            if (d.statusSefaz === "CANCELADO") sugestaoIa = "DESCONHECIMENTO";
            else if (score >= 76) sugestaoIa = "CIENCIA";
            else if (!d.pedidoCompra) sugestaoIa = "CIENCIA";
            return {
                ...d,
                scoreRisco: score,
                sugestaoIa,
                motivoSugestao: score >= 76 ? "Score crÃ­tico exige anÃ¡lise antes de confirmar" :
                    !d.pedidoCompra ? "Sem pedido vinculado  -  verificar compras" :
                        d.statusSefaz === "CANCELADO" ? "NF-e cancelada  -  nÃ£o confirmar" : "DocumentaÃ§Ã£o regular",
                exigeAprovacao: score >= 51,
            };
        });
    });

    app.post("/api/fiscal/manifestacao/:id/aprovar", async (req) => {
        const man = db.fiscalManifestacoes.find(m => m.id === req.params.id);
        if (!man) return { error: "NÃ£o encontrado" };
        man.aprovadoPor = getUsuarioReq(req);
        man.aprovadoEm = new Date().toISOString();
        man.status = "APROVADA";
        registrarLogAuditoria({ acao: "APROVACAO_MANIFESTACAO", entidade: "MANIFESTACAO", idEntidade: man.id, chaveAcesso: man.chaveAcesso, usuario: getUsuarioReq(req), ip: getIpReq(req) });
        return { ok: true };
    });

    app.post("/api/fiscal/manifestacao/:id/rejeitar", async (req) => {
        const man = db.fiscalManifestacoes.find(m => m.id === req.params.id);
        if (!man) return { error: "NÃ£o encontrado" };
        man.status = "REJEITADA";
        man.atualizadoEm = new Date().toISOString();
        registrarLogAuditoria({ acao: "REJEICAO_MANIFESTACAO", entidade: "MANIFESTACAO", idEntidade: man.id, chaveAcesso: man.chaveAcesso, motivo: req.body?.motivo, usuario: getUsuarioReq(req), ip: getIpReq(req) });
        return { ok: true };
    });

    // =========================================================
    // ALERTAS
    // =========================================================

    app.get("/api/fiscal/alertas", async (req) => {
        const q = req.query;
        let lista = [...db.fiscalAlertas];
        if (q.status) lista = lista.filter(a => a.status === q.status);
        if (q.severidade) lista = lista.filter(a => a.severidade === q.severidade);
        lista.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));

        // Verificar alertas de certificados vencendo
        db.fiscalCertificados.forEach(c => {
            if (c.status !== "ATIVO") return;
            const dias = Math.ceil((new Date(c.validadeFim) - new Date()) / 86400000);
            if (dias > 0 && dias <= 30) {
                const jaExiste = db.fiscalAlertas.find(a => a.tipo === "CERTIFICADO_VENCENDO" && a.idEntidade === c.id && a.status === "ATIVO");
                if (!jaExiste) {
                    db.fiscalAlertas.push({
                        id: nextId("FAL", db.fiscalAlertas.length),
                        tipo: "CERTIFICADO_VENCENDO",
                        severidade: dias <= 7 ? "CRITICA" : "ALTA",
                        titulo: `Certificado vencendo em ${dias} dias`,
                        mensagem: `O certificado do CNPJ ${c.cnpjBase} vence em ${dias} dias (${c.validadeFim})`,
                        idEntidade: c.id,
                        status: "ATIVO",
                        criadoEm: new Date().toISOString(),
                    });
                }
            }
        });

        return paginar(lista, q.page, q.pageSize);
    });

    app.post("/api/fiscal/alertas/:id/lido", async (req) => {
        const alerta = db.fiscalAlertas.find(a => a.id === req.params.id);
        if (alerta) { alerta.lidoEm = new Date().toISOString(); alerta.status = "LIDO"; }
        return { ok: true };
    });

    app.post("/api/fiscal/alertas/:id/resolver", async (req) => {
        const alerta = db.fiscalAlertas.find(a => a.id === req.params.id);
        if (alerta) { alerta.resolvidoEm = new Date().toISOString(); alerta.status = "RESOLVIDO"; }
        return { ok: true };
    });

    app.post("/api/fiscal/alertas/marcar-todos-lidos", async (req) => {
        const now = new Date().toISOString();
        let count = 0;
        for (const a of db.fiscalAlertas) {
            if (a.status === "ATIVO") { a.status = "LIDO"; a.lidoEm = now; count++; }
        }
        return { ok: true, marcados: count };
    });

    // =========================================================
    // AUDITORIA
    // =========================================================

    app.get("/api/fiscal/auditoria", async (req) => {
        const q = req.query;
        let lista = [...db.fiscalLogAuditoria];
        if (q.acao) lista = lista.filter(l => l.acao === q.acao);
        if (q.usuario) lista = lista.filter(l => (l.usuarioNome || "").toLowerCase().includes(q.usuario.toLowerCase()));
        if (q.entidade) lista = lista.filter(l => l.entidade === q.entidade);
        if (q.cnpj) lista = lista.filter(l => l.cnpj === q.cnpj);
        if (q.dataInicio) lista = lista.filter(l => l.criadoEm >= q.dataInicio);
        if (q.dataFim) lista = lista.filter(l => l.criadoEm <= q.dataFim + "T23:59:59");
        lista.sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
        return paginar(lista, q.page, q.pageSize);
    });

    app.get("/api/fiscal/auditoria/documento/:chave", async (req) => {
        const lista = db.fiscalLogAuditoria
            .filter(l => l.chaveAcesso === req.params.chave)
            .sort((a, b) => new Date(b.criadoEm) - new Date(a.criadoEm));
        return lista;
    });

    // =========================================================
    // CONFIGURAÃ‡Ã•ES
    // =========================================================

    app.get("/api/fiscal/configuracoes", async () => {
        return db.fiscalConfiguracoes;
    });

    app.post("/api/fiscal/configuracoes", async (req) => {
        Object.assign(db.fiscalConfiguracoes, req.body ?? {});
        return { ok: true, configuracoes: db.fiscalConfiguracoes };
    });

    // =========================================================
    // IA FISCAL EXPLICATIVA
    // =========================================================

    app.post("/api/fiscal/ia/resumir-documento", async (req) => {
        const { chave } = req.body ?? {};
        const doc = db.fiscalDocumentos.find(d => d.chaveAcesso === chave);
        if (!doc) return { error: "Documento nÃ£o encontrado" };

        const risco = db.fiscalRiscos.find(r => r.chaveAcesso === chave);
        const divergencias = db.fiscalDivergencias.filter(d => d.chaveAcesso === chave && d.status !== "FINALIZADA");
        const score = risco?.score ?? doc.scoreRisco ?? 0;

        const resumo = [
            `**${doc.tipoDfe === "NFE" ? "NF-e" : "CT-e"} ${doc.numeroDocumento}**  -  ${doc.nomeEmitente ?? "Emitente desconhecido"}`,
            `Valor: R$ ${(doc.valorTotal ?? doc.valorFrete ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
            `Status SEFAZ: ${doc.statusSefaz ?? "N/I"}`,
            `Status ERP: ${doc.statusWinthor ?? "NÃ£o verificado"}`,
            `Score de risco: ${score}/100  -  **${risco?.classificacao ?? "NÃ£o calculado"}**`,
            divergencias.length > 0 ? `${divergencias.length} divergencia(s) em aberto: ${divergencias.map(d => d.tipoDivergencia).join(", ")}` : "Sem divergencias em aberto",
            score >= 76 ? "[CRITICO] ACAO IMEDIATA: Este documento possui risco critico." :
                score >= 51 ? "ðŸŸ  ATENÃ‡ÃƒO: Verificar divergÃªncias antes de processar." :
                    score >= 21 ? "ðŸŸ¡ Monitorar: Documento requer verificaÃ§Ã£o complementar." :
                        "ðŸŸ¢ Documento com risco baixo  -  processamento regular.",
        ].join("\n");

        registrarLogAuditoria({ acao: "IA_RESUMIR_DOCUMENTO", entidade: "DOCUMENTO", idEntidade: doc.id, chaveAcesso: chave, tipoDfe: doc.tipoDfe, usuario: getUsuarioReq(req), ip: getIpReq(req) });
        return { resumo, score, classificacao: risco?.classificacao ?? "NAO_CALCULADO", divergencias: divergencias.length };
    });

    app.post("/api/fiscal/ia/explicar-risco", async (req) => {
        const { chave } = req.body ?? {};
        const risco = db.fiscalRiscos.find(r => r.chaveAcesso === chave);
        if (!risco) return { error: "Risco nÃ£o calculado para este documento" };

        const regras = risco.regrasAplicadasJson ? JSON.parse(risco.regrasAplicadasJson) : [];
        const explicacao = [
            `**ExplicaÃ§Ã£o do Score ${risco.score}/100 (${risco.classificacao})**`,
            "",
            regras.length > 0 ? "**Fatores que contribuÃ­ram para este score:**" : "**Nenhum fator de risco identificado.**",
            ...regras.map(r => `â€¢ ${r.descricao}: +${r.pontos} pontos`),
            "",
            `**RecomendaÃ§Ã£o:** ${risco.acaoRecomendada}`,
        ].join("\n");

        return { explicacao, score: risco.score, classificacao: risco.classificacao, regrasAplicadas: regras };
    });

    app.post("/api/fiscal/ia/sugerir-tratativa", async (req) => {
        const { chave } = req.body ?? {};
        const doc = db.fiscalDocumentos.find(d => d.chaveAcesso === chave);
        if (!doc) return { error: "Documento nÃ£o encontrado" };

        const score = doc.scoreRisco ?? 0;
        const divergencias = db.fiscalDivergencias.filter(d => d.chaveAcesso === chave && d.status !== "FINALIZADA");
        const passos = [];

        if (doc.statusSefaz === "CANCELADO") passos.push("1. Verificar se hÃ¡ financeiro ou estoque vinculado e realizar estorno");
        if (!doc.statusWinthor || doc.statusWinthor === "NAO_ENCONTRADO") passos.push("1. Localizar ou lanÃ§ar o documento no WinThor");
        if (!doc.pedidoCompra && doc.tipoDfe === "NFE") passos.push("2. Verificar existÃªncia de pedido de compra com o setor responsÃ¡vel");
        if (divergencias.length > 0) passos.push(`3. Tratar ${divergencias.length} divergÃªncia(s) em aberto`);
        if (score >= 51 && doc.tipoDfe === "NFE" && doc.statusManifestacao === "PENDENTE") {
            passos.push("4. Aguardar anÃ¡lise antes de manifestar  -  risco elevado");
        } else if (doc.tipoDfe === "NFE" && doc.statusManifestacao === "PENDENTE") {
            passos.push("4. Manifestar NF-e na SEFAZ apÃ³s verificaÃ§Ãµes");
        }
        if (passos.length === 0) passos.push("Documento nÃ£o apresenta pendÃªncias crÃ­ticas. Processar normalmente.");

        return {
            sugestao: passos.join("\n"),
            prioridade: score >= 76 ? "CRITICA" : score >= 51 ? "ALTA" : score >= 21 ? "MEDIA" : "BAIXA",
            numeroPendencias: divergencias.length,
        };
    });

    app.post("/api/fiscal/ia/gerar-parecer", async (req) => {
        const { chave } = req.body ?? {};
        const doc = db.fiscalDocumentos.find(d => d.chaveAcesso === chave);
        if (!doc) return { error: "Documento nÃ£o encontrado" };

        const score = doc.scoreRisco ?? 0;
        const divergencias = db.fiscalDivergencias.filter(d => d.chaveAcesso === chave);
        const risco = db.fiscalRiscos.find(r => r.chaveAcesso === chave);
        const regras = risco?.regrasAplicadasJson ? JSON.parse(risco.regrasAplicadasJson) : [];

        const parecer = [
            `PARECER FISCAL  -  ${new Date().toLocaleDateString("pt-BR")}`,
            `Documento: ${doc.tipoDfe} ${doc.numeroDocumento} | Chave: ${chave}`,
            `Emitente: ${doc.nomeEmitente ?? "NÃ£o identificado"} | CNPJ: ${doc.cnpjEmitente ?? "N/I"}`,
            `Valor: R$ ${(doc.valorTotal ?? doc.valorFrete ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
            `Data emissÃ£o: ${doc.dataEmissao ? new Date(doc.dataEmissao).toLocaleDateString("pt-BR") : "N/I"}`,
            "",
            "ANÃLISE DE RISCO:",
            `Score: ${score}/100  -  ${risco?.classificacao ?? "NÃ£o calculado"}`,
            regras.length > 0 ? `Fatores: ${regras.map(r => r.descricao).join("; ")}` : "Sem fatores de risco identificados",
            "",
            "DIVERGÃŠNCIAS IDENTIFICADAS:",
            divergencias.length > 0 ? divergencias.map(d => `â€¢ ${d.tipoDivergencia}: ${d.descricao}`).join("\n") : "Nenhuma divergÃªncia registrada",
            "",
            "CONCLUSÃƒO:",
            score >= 76 ? "AÃ‡ÃƒO IMEDIATA: Documento requer revisÃ£o urgente por fiscal supervisor antes de qualquer processamento." :
                score >= 51 ? "ATENÃ‡ÃƒO: Recomenda-se anÃ¡lise das divergÃªncias antes de processar." :
                    "Documento dentro dos parÃ¢metros normais. Processamento autorizado mediante verificaÃ§Ãµes padrÃ£o.",
            "",
            "Gerado automaticamente pela IA Fiscal da Torre de Controle.",
            "Este parecer Ã© assistivo e nÃ£o substitui anÃ¡lise humana qualificada.",
        ].join("\n");

        registrarLogAuditoria({ acao: "IA_GERAR_PARECER", entidade: "DOCUMENTO", idEntidade: doc.id, chaveAcesso: chave, tipoDfe: doc.tipoDfe, usuario: getUsuarioReq(req), ip: getIpReq(req) });
        return { parecer, score, classificacao: risco?.classificacao ?? "NAO_CALCULADO" };
    });

    // =========================================================
    // EXPORTAÃ‡ÃƒO CSV
    // =========================================================

    app.get("/api/fiscal/exportar/nfe-csv", async (req, reply) => {
        const q = req.query;
        let docs = db.fiscalDocumentos.filter(d => d.tipoDfe === "NFE");
        if (q.dataInicio) docs = docs.filter(d => d.dataEmissao >= q.dataInicio);
        if (q.dataFim) docs = docs.filter(d => d.dataEmissao <= q.dataFim + "T23:59:59");
        if (q.statusSefaz) docs = docs.filter(d => d.statusSefaz === q.statusSefaz);

        registrarLogAuditoria({ acao: "EXPORTACAO_CSV_NFE", entidade: "DOCUMENTO", usuario: getUsuarioReq(req), ip: getIpReq(req), motivo: `Filtros: ${JSON.stringify(q)}` });

        const cabecalho = ["Chave","Numero","Serie","Emitente","CNPJ Emitente","Destinatario","Valor Total","Status SEFAZ","Status Manifestacao","Status WinThor","Score Risco","Data Emissao"];
        const linhas = docs.map(d => [
            d.chaveAcesso ?? "",
            d.numeroDocumento ?? "",
            d.serie ?? "",
            d.nomeEmitente ?? "",
            d.cnpjEmitente ?? "",
            d.nomeDestinatario ?? "",
            d.valorTotal ?? "",
            d.statusSefaz ?? "",
            d.statusManifestacao ?? "",
            d.statusWinthor ?? "",
            d.scoreRisco ?? "",
            d.dataEmissao ? new Date(d.dataEmissao).toLocaleDateString("pt-BR") : "",
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));

        const csv = [cabecalho.join(","), ...linhas].join("\n");
        reply.header("Content-Type", "text/csv; charset=utf-8");
        reply.header("Content-Disposition", `attachment; filename="nfe-${new Date().toISOString().slice(0,10)}.csv"`);
        return reply.send("ï»¿" + csv);
    });

    app.get("/api/fiscal/exportar/cte-csv", async (req, reply) => {
        let docs = db.fiscalDocumentos.filter(d => d.tipoDfe === "CTE");
        const q = req.query;
        if (q.dataInicio) docs = docs.filter(d => d.dataEmissao >= q.dataInicio);
        if (q.dataFim) docs = docs.filter(d => d.dataEmissao <= q.dataFim + "T23:59:59");

        registrarLogAuditoria({ acao: "EXPORTACAO_CSV_CTE", entidade: "DOCUMENTO", usuario: getUsuarioReq(req), ip: getIpReq(req) });

        const cabecalho = ["Chave","Numero","Transportadora","CNPJ Emitente","Valor Frete","Status SEFAZ","Status WinThor","Score Risco","Data Emissao"];
        const linhas = docs.map(d => [d.chaveAcesso,d.numeroDocumento,d.nomeEmitente,d.cnpjEmitente,d.valorFrete,d.statusSefaz,d.statusWinthor,d.scoreRisco,d.dataEmissao ? new Date(d.dataEmissao).toLocaleDateString("pt-BR") : ""].map(v => `"${String(v ?? "").replace(/"/g,'""')}"`).join(","));
        const csv = [cabecalho.join(","), ...linhas].join("\n");
        reply.header("Content-Type", "text/csv; charset=utf-8");
        reply.header("Content-Disposition", `attachment; filename="cte-${new Date().toISOString().slice(0,10)}.csv"`);
        return reply.send("ï»¿" + csv);
    });

    app.get("/api/fiscal/exportar/divergencias-csv", async (req, reply) => {
        let lista = [...db.fiscalDivergencias];
        const q = req.query;
        if (q.status) lista = lista.filter(d => d.status === q.status);

        registrarLogAuditoria({ acao: "EXPORTACAO_CSV_DIVERGENCIAS", entidade: "DIVERGENCIA", usuario: getUsuarioReq(req), ip: getIpReq(req) });

        const cabecalho = ["ID","Tipo DFe","Chave","Tipo Divergencia","Severidade","Status","Responsavel","Setor","Valor Impacto","Data Abertura","SLA"];
        const linhas = lista.map(d => [d.id,d.tipoDfe,d.chaveAcesso,d.tipoDivergencia,d.severidade,d.status,d.responsavel,d.setorResponsavel,d.valorImpacto,d.dataAbertura ? new Date(d.dataAbertura).toLocaleDateString("pt-BR") : "",d.slaEm ? new Date(d.slaEm).toLocaleDateString("pt-BR") : ""].map(v => `"${String(v ?? "").replace(/"/g,'""')}"`).join(","));
        const csv = [cabecalho.join(","), ...linhas].join("\n");
        reply.header("Content-Type", "text/csv; charset=utf-8");
        reply.header("Content-Disposition", `attachment; filename="divergencias-${new Date().toISOString().slice(0,10)}.csv"`);
        return reply.send("ï»¿" + csv);
    });

    // =========================================================
    // IMPORTAR DOCUMENTO (para testes e entrada manual)
    // =========================================================

    app.post("/api/fiscal/documentos/importar", async (req) => {
        const payload = req.body ?? {};
        const chave = String(payload.chaveAcesso ?? "");
        if (!chave) return { error: "chaveAcesso Ã© obrigatÃ³rio" };

        const jaExiste = db.fiscalDocumentos.find(d => d.chaveAcesso === chave);
        if (jaExiste) return { ok: false, mensagem: "Documento jÃ¡ cadastrado (duplicidade bloqueada)", id: jaExiste.id };

        const doc = {
            id: nextId("FDC", db.fiscalDocumentos.length),
            tipoDfe: String(payload.tipoDfe ?? "NFE").toUpperCase(),
            chaveAcesso: chave,
            nsu: String(payload.nsu ?? "0"),
            cnpjInteressado: String(payload.cnpjInteressado ?? ""),
            cnpjEmitente: String(payload.cnpjEmitente ?? ""),
            nomeEmitente: payload.nomeEmitente ?? "",
            cnpjDestinatario: String(payload.cnpjDestinatario ?? ""),
            nomeDestinatario: payload.nomeDestinatario ?? "",
            cnpjTomador: payload.cnpjTomador ? String(payload.cnpjTomador) : null,
            nomeTomador: payload.nomeTomador ?? null,
            numeroDocumento: String(payload.numeroDocumento ?? ""),
            serie: String(payload.serie ?? "1"),
            modelo: String(payload.modelo ?? payload.tipoDfe === "CTE" ? "57" : "55"),
            dataEmissao: payload.dataEmissao ?? new Date().toISOString(),
            dataAutorizacao: payload.dataAutorizacao ?? new Date().toISOString(),
            valorTotal: Number(payload.valorTotal ?? 0),
            valorProdutos: Number(payload.valorProdutos ?? 0),
            valorFrete: Number(payload.valorFrete ?? 0),
            valorIcms: Number(payload.valorIcms ?? 0),
            statusSefaz: payload.statusSefaz ?? "AUTORIZADO",
            statusManifestacao: payload.statusManifestacao ?? (payload.tipoDfe === "NFE" ? "PENDENTE" : null),
            statusWinthor: payload.statusWinthor ?? "NAO_VERIFICADO",
            statusConciliacao: "PENDENTE",
            statusRisco: "NAO_CALCULADO",
            scoreRisco: 0,
            statusWorkflow: "NORMAL",
            pedidoCompra: payload.pedidoCompra ?? null,
            entradaEstoque: payload.entradaEstoque ?? false,
            tituloFinanceiro: payload.tituloFinanceiro ?? null,
            nfesVinculadas: payload.nfesVinculadas ?? [],
            hashXmlAtual: payload.xmlConteudo ? hashTexto(payload.xmlConteudo) : null,
            origemConsulta: payload.origemConsulta ?? "IMPORTACAO_MANUAL",
            ambiente: payload.ambiente ?? "HOMOLOGACAO",
            ufAutorizadora: payload.ufAutorizadora ?? "",
            fornecedorBloqueado: payload.fornecedorBloqueado ?? false,
            xmlInvalido: payload.xmlInvalido ?? false,
            revisado: false,
            observacoes: [],
            criadoEm: new Date().toISOString(),
            atualizadoEm: new Date().toISOString(),
        };

        // Salvar XML no Vault se fornecido
        if (payload.xmlConteudo) {
            const hash = hashTexto(payload.xmlConteudo);
            db.fiscalXmlVault.push({
                id: nextId("FXV", db.fiscalXmlVault.length),
                idDocumento: doc.id,
                chaveAcesso: chave,
                tipoDfe: doc.tipoDfe,
                tipoXml: "COMPLETO",
                nsu: doc.nsu,
                schemaXml: doc.tipoDfe === "NFE" ? "nfeProc" : "cteProc",
                xmlConteudoCriptografado: hashTexto(payload.xmlConteudo), // Em prod: criptografar
                hashSha256: hash,
                tamanhoBytes: payload.xmlConteudo.length,
                origem: "IMPORTACAO_MANUAL",
                cnpjCertificado: doc.cnpjInteressado,
                ambiente: doc.ambiente,
                capturadoEm: new Date().toISOString(),
                status: "ATIVO",
            });
            doc.hashXmlAtual = hash;
        }

        db.fiscalDocumentos.push(doc);

        // Calcular risco e gerar divergÃªncias automaticamente
        const { score, classificacao, regrasAplicadas } = calcularScoreRisco(doc);
        doc.scoreRisco = score;
        doc.statusRisco = classificacao;
        db.fiscalRiscos.push({
            id: nextId("FRI", db.fiscalRiscos.length),
            idDocumento: doc.id,
            chaveAcesso: chave,
            score, classificacao,
            regrasAplicadasJson: JSON.stringify(regrasAplicadas),
            explicacao: `Score ${score}/100  -  ${classificacao}`,
            acaoRecomendada: score >= 76 ? "AnÃ¡lise imediata" : score >= 51 ? "Verificar divergÃªncias" : "Monitoramento padrÃ£o",
            versaoRegra: "1.0",
            calculadoEm: new Date().toISOString(),
        });

        // Gerar divergÃªncias automÃ¡ticas
        const divs = gerarDivergenciasAutomaticas(doc);
        const slasDias = { CRITICA: 1, ALTA: 3, MEDIA: 7, BAIXA: 15 };
        for (const div of divs) {
            db.fiscalDivergencias.push({
                id: nextId("FDV", db.fiscalDivergencias.length),
                idDocumento: doc.id,
                chaveAcesso: chave,
                tipoDfe: doc.tipoDfe,
                ...div,
                status: "NOVA",
                responsavel: "",
                setorResponsavel: "FISCAL",
                slaEm: new Date(Date.now() + (slasDias[div.severidade === "CRITICA" ? "CRITICA" : div.severidade === "ALTA" ? "ALTA" : "MEDIA"] ?? 7) * 86400000).toISOString(),
                dataAbertura: new Date().toISOString(),
                dataConclusao: null,
                scoreRisco: score,
                valorImpacto: doc.valorTotal ?? doc.valorFrete ?? 0,
                cnpj: doc.cnpjInteressado,
                criadoEm: new Date().toISOString(),
                atualizadoEm: new Date().toISOString(),
                historico: [],
            });
        }

        // Gerar alerta se crÃ­tico
        if (score >= 76) {
            db.fiscalAlertas.push({
                id: nextId("FAT", db.fiscalAlertas.length),
                tipo: "DOCUMENTO_CRITICO",
                severidade: "CRITICA",
                titulo: `${doc.tipoDfe} crÃ­tico recebido`,
                mensagem: `${doc.tipoDfe} ${doc.numeroDocumento} de ${doc.nomeEmitente} com score ${score}/100`,
                idDocumento: doc.id,
                chaveAcesso: chave,
                status: "ATIVO",
                criadoEm: new Date().toISOString(),
            });
        }

        registrarLogAuditoria({ acao: "IMPORTAR_DOCUMENTO", entidade: "DOCUMENTO", idEntidade: doc.id, chaveAcesso: chave, tipoDfe: doc.tipoDfe, cnpj: doc.cnpjInteressado, usuario: getUsuarioReq(req), ip: getIpReq(req) });
        return { ok: true, id: doc.id, chaveAcesso: chave, score, classificacao, divergenciasGeradas: divs.length };
    });

    // =========================================================
    // FORNECEDORES — Verificar cadastro e registrar no WinThor
    // =========================================================

    function formatCgcFornec(cnpj) {
        const s = String(cnpj).replace(/\D/g, "");
        if (s.length === 14) return `${s.slice(0,2)}.${s.slice(2,5)}.${s.slice(5,8)}/${s.slice(8,12)}-${s.slice(12)}`;
        if (s.length === 11) return `${s.slice(0,3)}.${s.slice(3,6)}.${s.slice(6,9)}-${s.slice(9)}`;
        return s;
    }

    function extrairTagXml(xml, tag) {
        const m = xml.match(new RegExp(`<(?:[\\w]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w]+:)?${tag}>`, "i"));
        return m ? m[1].trim() : null;
    }

    function extrairSecaoXml(xml, tag) {
        const m = xml.match(new RegExp(`<(?:[\\w]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w]+:)?${tag}>`, "i"));
        return m ? m[1] : null;
    }


    // POST /api/fiscal/fornecedores/verificar-cadastro
    // Recebe array de CNPJs e retorna se cada um está cadastrado no PCFORNEC ou PCCLIENT
    app.post("/api/fiscal/fornecedores/verificar-cadastro", async (req) => {
        const { cnpjs } = req.body ?? {};
        if (!Array.isArray(cnpjs) || cnpjs.length === 0) return { resultado: {} };
        if (!isOracleEnabled()) return { resultado: Object.fromEntries(cnpjs.map(c => [c, { cadastrado: false, sem_oracle: true }])) };

        const unicos = [...new Set(cnpjs.map(c => String(c).replace(/\D/g, "")).filter(c => c.length >= 11))];
        if (unicos.length === 0) return { resultado: {} };

        const placeholders = unicos.map((_, i) => `:${i + 1}`).join(",");

        const [rowsFornec, rowsClient] = await Promise.all([
            executeOracle(
                `SELECT REGEXP_REPLACE(CGC,'[^0-9]','') AS CGC_LIMPO, CODFORNEC, FORNECEDOR AS NOME
                 FROM PCFORNEC
                 WHERE REGEXP_REPLACE(CGC,'[^0-9]','') IN (${placeholders})`,
                unicos, { outFormat: 4002 }
            ).then(r => r.rows).catch(() => []),
            executeOracle(
                `SELECT REGEXP_REPLACE(CGC_CPF,'[^0-9]','') AS CGC_LIMPO, CODCLI AS CODFORNEC, CLIENTE AS NOME
                 FROM PCCLIENT
                 WHERE REGEXP_REPLACE(CGC_CPF,'[^0-9]','') IN (${placeholders})
                 AND ATIVO = 'S'`,
                unicos, { outFormat: 4002 }
            ).then(r => r.rows).catch(() => []),
        ]);

        const mapa = {};
        for (const r of (rowsFornec || [])) {
            const cgcLimpo = String(r.CGC_LIMPO || "");
            if (cgcLimpo) mapa[cgcLimpo] = { cadastrado: true, codfornec: r.CODFORNEC, nome: r.NOME, origem: "PCFORNEC" };
        }
        for (const r of (rowsClient || [])) {
            const cgcLimpo = String(r.CGC_LIMPO || "");
            if (cgcLimpo && !mapa[cgcLimpo]) mapa[cgcLimpo] = { cadastrado: true, codfornec: r.CODFORNEC, nome: r.NOME, origem: "PCCLIENT" };
        }

        const resultado = {};
        for (const cnpj of unicos) {
            resultado[cnpj] = mapa[cnpj] ?? { cadastrado: false };
        }
        return { resultado };
    });

    // GET /api/fiscal/nfe/:chave/dados-emitente
    // Extrai dados do emitente do XML da NF-e via PCDOCELETRONICO
    app.get("/api/fiscal/nfe/:chave/dados-emitente", async (req, reply) => {
        const { chave } = req.params;
        if (!chave) return reply.code(400).send({ error: "Chave obrigatória" });
        if (!isOracleEnabled()) return reply.code(503).send({ error: "Oracle não disponível" });

        registrarLogAuditoria({ acao: "CONSULTA_DADOS_EMITENTE_NFE", entidade: "DOCUMENTO", chaveAcesso: chave, usuario: getUsuarioReq(req), ip: getIpReq(req) });

        const sqlNfent = `SELECT NUMTRANSENT FROM PCNFENT WHERE CHAVENFE = :chave AND ROWNUM = 1`;
        const rowsNfent = await executeOracle(sqlNfent, { chave }, { outFormat: 4002 }).then(r => r.rows).catch(() => []);
        if (!rowsNfent || rowsNfent.length === 0) return reply.code(404).send({ error: "NF-e não encontrada no WinThor" });

        const numtransent = rowsNfent[0].NUMTRANSENT;
        const sqlXml = `SELECT XMLNFE FROM PCDOCELETRONICO WHERE NUMTRANSACAO = :n AND XMLNFE IS NOT NULL AND ROWNUM = 1`;
        const rowsXml = await executeOracle(sqlXml, { n: numtransent }, { outFormat: 4002 }).then(r => r.rows).catch(() => []);
        if (!rowsXml || rowsXml.length === 0) return reply.code(404).send({ error: "XML da NF-e não encontrado em PCDOCELETRONICO" });

        const xml = rowsXml[0].XMLNFE;
        const emit = extrairSecaoXml(xml, "emit");
        if (!emit) return reply.code(422).send({ error: "Seção <emit> não encontrada no XML" });

        const ender = extrairSecaoXml(emit, "enderEmit");
        const cnpjRaw = extrairTagXml(emit, "CNPJ") || extrairTagXml(emit, "CPF") || "";
        const cMun = ender ? extrairTagXml(ender, "cMun") : null;
        const crt = extrairTagXml(emit, "CRT");

        let codcidade = null;
        if (cMun) {
            const sqlCid = `SELECT CODCIDADE FROM PCCIDADE WHERE CODIBGE = :ibge AND ROWNUM = 1`;
            const rowsCid = await executeOracle(sqlCid, { ibge: cMun }, { outFormat: 4002 }).then(r => r.rows).catch(() => []);
            if (rowsCid && rowsCid.length > 0) codcidade = rowsCid[0].CODCIDADE;
            if (!codcidade && ender) {
                const xMun = extrairTagXml(ender, "xMun");
                const uf = extrairTagXml(ender, "UF");
                if (xMun && uf) {
                    const sqlCid2 = `SELECT CODCIDADE FROM PCCIDADE WHERE UPPER(NOMECIDADE) = UPPER(:nm) AND UF = :uf AND ROWNUM = 1`;
                    const rowsCid2 = await executeOracle(sqlCid2, { nm: xMun, uf }, { outFormat: 4002 }).then(r => r.rows).catch(() => []);
                    if (rowsCid2 && rowsCid2.length > 0) codcidade = rowsCid2[0].CODCIDADE;
                }
            }
        }

        return {
            cnpj: cnpjRaw,
            nome: extrairTagXml(emit, "xNome"),
            fantasia: extrairTagXml(emit, "xFant"),
            ie: extrairTagXml(emit, "IE"),
            im: extrairTagXml(emit, "IM"),
            cnae: extrairTagXml(emit, "CNAE"),
            crt,
            simplesnacional: crt === "1" || crt === "2" ? "S" : "N",
            logradouro: ender ? extrairTagXml(ender, "xLgr") : null,
            numero: ender ? extrairTagXml(ender, "nro") : null,
            complemento: ender ? extrairTagXml(ender, "xCpl") : null,
            bairro: ender ? extrairTagXml(ender, "xBairro") : null,
            cidade: ender ? extrairTagXml(ender, "xMun") : null,
            uf: ender ? extrairTagXml(ender, "UF") : null,
            cep: ender ? extrairTagXml(ender, "CEP") : null,
            codcidade,
            fone: ender ? extrairTagXml(ender, "fone") : null,
            email: ender ? extrairTagXml(ender, "email") : null,
        };
    });

    // GET /api/fiscal/cte/:chave/diagnostico — descobre como este CT-e está linkado a NF-es no Oracle
    app.get("/api/fiscal/cte/:chave/diagnostico", async (req, reply) => {
        const chave = String(req.params.chave || "").trim();
        if (!isOracleEnabled()) return { oracle: false };

        const run = async (sql, binds) => {
            try { const r = await executeOracle(sql, binds || {}, { outFormat: 4002 }); return { ok: true, rows: r.rows ?? [] }; }
            catch (e) { return { ok: false, error: e.message }; }
        };

        // 1. PCNFENT WHERE CHAVECTE = chave
        const q1 = await run(`SELECT COUNT(*) AS CNT FROM PCNFENT WHERE CHAVECTE = :c`, { c: chave });

        // 2. Sample rows from PCNFENT WHERE CHAVECTE = chave (full)
        const q2 = await run(`SELECT CHAVENFE, NUMNOTA, SERIE, DTEMISSAO, VLTOTAL, FORNECEDOR, CGC, CHAVECTE FROM PCNFENT WHERE CHAVECTE = :c AND ROWNUM <= 5`, { c: chave });

        // 3. Check PCCTEDESTINADO for this chave
        const q3 = await run(`SELECT CHAVECTE, CNPJCPFEMITENTE, NOMEEMITENTE, DATAEMISSAO, VLTOTALCTE FROM PCCTEDESTINADO WHERE CHAVECTE = :c AND ROWNUM <= 3`, { c: chave });

        // 4. Check if PCNFENT has CHAVECTE column at all
        const q4 = await run(`SELECT COUNT(*) AS CNT FROM USER_TAB_COLUMNS WHERE TABLE_NAME='PCNFENT' AND COLUMN_NAME='CHAVECTE'`);

        // 5. Check if ANY PCNFENT row has CHAVECTE populated
        const q5 = await run(`SELECT COUNT(*) AS CNT FROM PCNFENT WHERE CHAVECTE IS NOT NULL AND ROWNUM <= 1`);

        // 6. Try partial match (some WinThor versions trim the chave)
        const q6 = await run(`SELECT CHAVENFE, NUMNOTA, CHAVECTE FROM PCNFENT WHERE CHAVECTE LIKE :pat AND ROWNUM <= 5`, { pat: chave.slice(0,20) + "%" });

        // 7. Check PCPEDNF for CTE linkage via NUMTRANSENT
        const q7 = await run(`SELECT COUNT(*) AS CNT FROM USER_TAB_COLUMNS WHERE TABLE_NAME='PCCTEDESTINADO'`);

        return { chave, q1_pcnfent_count: q1, q2_pcnfent_sample: q2, q3_pcctedestinado: q3, q4_chavecte_col_exists: q4, q5_any_chavecte: q5, q6_partial_match: q6, q7_pcctedestinado_exists: q7 };
    });

    // GET /api/fiscal/cte/:chave/dados-emitente
    // Retorna dados do emitente disponíveis no CT-e via PCCTEDESTINADO
    app.get("/api/fiscal/cte/:chave/dados-emitente", async (req, reply) => {
        const { chave } = req.params;
        if (!chave) return reply.code(400).send({ error: "Chave obrigatória" });
        if (!isOracleEnabled()) return reply.code(503).send({ error: "Oracle não disponível" });

        registrarLogAuditoria({ acao: "CONSULTA_DADOS_EMITENTE_CTE", entidade: "DOCUMENTO", chaveAcesso: chave, usuario: getUsuarioReq(req), ip: getIpReq(req) });

        const sqlCte = `SELECT CNPJCPFEMITENTE, NOMEEMITENTE, IEEMITENTE, UFEMITENTE FROM PCCTEDESTINADO WHERE CHAVECTE = :chave AND ROWNUM = 1`;
        const rowsCte = await executeOracle(sqlCte, { chave }, { outFormat: 4002 }).then(r => r.rows).catch(() => []);
        if (!rowsCte || rowsCte.length === 0) return reply.code(404).send({ error: "CT-e não encontrado em PCCTEDESTINADO" });

        const cte = rowsCte[0];
        const cnpjRaw = String(cte.CNPJCPFEMITENTE || "").replace(/\D/g, "");
        const uf = cte.UFEMITENTE || null;

        let codcidade = null;
        if (uf) {
            const sqlCid = `SELECT CODCIDADE FROM PCCIDADE WHERE UF = :uf AND ROWNUM = 1 ORDER BY CODCIDADE`;
            const rowsCid = await executeOracle(sqlCid, { uf }, { outFormat: 4002 }).then(r => r.rows).catch(() => []);
            if (rowsCid && rowsCid.length > 0) codcidade = rowsCid[0].CODCIDADE;
        }

        return {
            cnpj: cnpjRaw,
            nome: cte.NOMEEMITENTE || null,
            fantasia: null,
            ie: cte.IEEMITENTE || null,
            im: null,
            cnae: null,
            crt: null,
            simplesnacional: "N",
            logradouro: null,
            numero: null,
            complemento: null,
            bairro: null,
            cidade: null,
            uf,
            cep: null,
            codcidade,
            fone: null,
            email: null,
        };
    });

    // POST /api/fiscal/fornecedores/cadastrar
    // Cadastra emitente de NF-e ou CT-e como fornecedor no PCFORNEC
    app.post("/api/fiscal/fornecedores/cadastrar", async (req, reply) => {
        const { tipoDfe, chaveAcesso, dadosEmitente } = req.body ?? {};
        if (!dadosEmitente?.cnpj) return reply.code(400).send({ error: "dadosEmitente.cnpj é obrigatório" });
        if (!isOracleEnabled()) return reply.code(503).send({ error: "Oracle não disponível" });

        const cnpjLimpo = String(dadosEmitente.cnpj).replace(/\D/g, "");
        if (cnpjLimpo.length < 11) return reply.code(400).send({ error: "CNPJ/CPF inválido" });

        const cgcFormatado = formatCgcFornec(cnpjLimpo);
        const tipopessoa = cnpjLimpo.length === 14 ? "J" : "F";
        const tipofornec = tipoDfe === "CTE" ? "T" : "C";

        const sqlExiste = `SELECT CODFORNEC, FORNECEDOR FROM PCFORNEC WHERE CGC = :cgc AND ROWNUM = 1`;
        const rowsExiste = await executeOracle(sqlExiste, { cgc: cgcFormatado }, { outFormat: 4002 }).then(r => r.rows).catch(() => []);
        if (rowsExiste && rowsExiste.length > 0) {
            return { ok: false, ja_cadastrado: true, codfornec: rowsExiste[0].CODFORNEC, nome: rowsExiste[0].FORNECEDOR, mensagem: "Fornecedor já cadastrado no WinThor" };
        }

        // Busca primeiro gap disponível em CODFORNEC (coluna é NUMBER(6), max 999999)
        const sqlProx = `
            SELECT MIN(CODFORNEC + 1) AS PROX
            FROM PCFORNEC a
            WHERE CODFORNEC < 999999
              AND NOT EXISTS (SELECT 1 FROM PCFORNEC b WHERE b.CODFORNEC = a.CODFORNEC + 1)`;
        const rowsProx = await executeOracle(sqlProx, {}, { outFormat: 4002 }).then(r => r.rows).catch(() => []);
        if (!rowsProx || rowsProx.length === 0 || !rowsProx[0].PROX) return reply.code(500).send({ error: "Sem código de fornecedor disponível (tabela PCFORNEC cheia)" });

        const codfornec = rowsProx[0].PROX;
        const nome = String(dadosEmitente.nome || "").slice(0, 60).toUpperCase();
        const fantasia = dadosEmitente.fantasia ? String(dadosEmitente.fantasia).slice(0, 60).toUpperCase() : null;
        const ie = dadosEmitente.ie ? String(dadosEmitente.ie).slice(0, 15) : null;
        const simplesnacional = dadosEmitente.simplesnacional === "S" ? "S" : "N";
        const logradouro = dadosEmitente.logradouro ? String(dadosEmitente.logradouro).slice(0, 35) : null;
        const numero = dadosEmitente.numero ? String(dadosEmitente.numero).slice(0, 4) : null;
        const bairro = dadosEmitente.bairro ? String(dadosEmitente.bairro).slice(0, 20) : null;
        const cidade = dadosEmitente.cidade ? String(dadosEmitente.cidade).slice(0, 15).toUpperCase() : null;
        const uf = dadosEmitente.uf ? String(dadosEmitente.uf).slice(0, 2).toUpperCase() : null;
        const cep = dadosEmitente.cep ? String(dadosEmitente.cep).replace(/\D/g, "").slice(0, 8) : null;
        const codcidade = dadosEmitente.codcidade ? Number(dadosEmitente.codcidade) : null;
        const fone = dadosEmitente.fone ? String(dadosEmitente.fone).replace(/\D/g, "").slice(0, 20) : null;
        const email = dadosEmitente.email ? String(dadosEmitente.email).slice(0, 100).toLowerCase() : null;

        const sqlInsert = `
            INSERT INTO PCFORNEC (
                CODFORNEC, FORNECEDOR, CGC, IE,
                TIPOFORNEC, TIPOPESSOA, SIMPLESNACIONAL,
                ENDER, BAIRRO, CIDADE, ESTADO, CEP, CODCIDADE,
                FANTASIA, TELFAB, EMAIL
            ) VALUES (
                :codfornec, :nome, :cgc, :ie,
                :tipofornec, :tipopessoa, :simplesnacional,
                :ender, :bairro, :cidade, :estado, :cep, :codcidade,
                :fantasia, :telfab, :email
            )`;

        const bindsInsert = {
            codfornec, nome, cgc: cgcFormatado,
            ie: ie || null,
            tipofornec, tipopessoa, simplesnacional,
            ender: (logradouro && numero ? `${logradouro}, ${numero}` : logradouro || null)?.slice(0, 40) || null,
            bairro: bairro || null,
            cidade: cidade || null,
            estado: uf || null,
            cep: cep || null,
            codcidade: codcidade || null,
            fantasia: fantasia || null,
            telfab: fone || null,
            email: email || null,
        };

        await executeOracle(sqlInsert, bindsInsert, { autoCommit: true });

        registrarLogAuditoria({ acao: "CADASTRAR_FORNECEDOR_FISCAL", entidade: "FORNECEDOR", idEntidade: String(codfornec), chaveAcesso: chaveAcesso || null, tipoDfe: tipoDfe || null, cnpj: cnpjLimpo, usuario: getUsuarioReq(req), ip: getIpReq(req) });

        return { ok: true, codfornec, nome, cgc: cgcFormatado, mensagem: `Fornecedor cadastrado com código ${codfornec}` };
    });

    // =========================================================
    // PRODUTOS — Departamentos, Seções e Cadastro
    // =========================================================

    // GET /api/fiscal/produtos/departamentos
    // Lista departamentos ativos de PCDEPTO para o formulário de cadastro
    app.get("/api/fiscal/produtos/departamentos", async (req, reply) => {
        if (!isOracleEnabled()) return reply.code(503).send({ error: "Oracle não disponível" });
        const rows = await executeOracle(
            `SELECT CODEPTO, DESCRICAO FROM PCDEPTO WHERE NVL(ATIVO,'S') = 'S' ORDER BY DESCRICAO`,
            {}, { outFormat: 4002 }
        ).then(r => r.rows).catch(() => []);
        return { departamentos: (rows || []).map(r => ({ codepto: r.CODEPTO, descricao: String(r.DESCRICAO || "").trim() })) };
    });

    // GET /api/fiscal/produtos/secoes?codepto=3
    // Lista seções de um departamento de PCSECAO
    app.get("/api/fiscal/produtos/secoes", async (req, reply) => {
        if (!isOracleEnabled()) return reply.code(503).send({ error: "Oracle não disponível" });
        const codepto = Number(req.query.codepto);
        if (!codepto) return reply.code(400).send({ error: "codepto é obrigatório" });
        const rows = await executeOracle(
            `SELECT CODSEC, DESCRICAO, CODEPTO FROM PCSECAO WHERE CODEPTO = :codepto AND DTEXCLUSAO IS NULL ORDER BY DESCRICAO`,
            { codepto }, { outFormat: 4002 }
        ).then(r => r.rows).catch(() => []);
        return { secoes: (rows || []).map(r => ({ codsec: r.CODSEC, codepto: r.CODEPTO, descricao: String(r.DESCRICAO || "").trim() })) };
    });

    // POST /api/fiscal/produtos/cadastrar
    // Cadastra um produto no PCPRODUT com dados extraídos da NF-e
    app.post("/api/fiscal/produtos/cadastrar", async (req, reply) => {
        if (!isOracleEnabled()) return reply.code(503).send({ error: "Oracle não disponível" });

        const {
            chaveAcesso,
            descricao: descricaoRaw,
            embalagem: embalagemRaw,
            unidade: unidadeRaw,
            codepto,
            codsec,
            codfornec,
            nbm,
            codean,
            codean2,
            codfab,
            qtunitcx,
            qtunit,
            pesobruto,
            pesoliq,
            volume,
            larguram3,
            alturam3,
            comprimentom3,
            sittribut,
            revenda,
            tipomerc,
            informacoestecnicas,
        } = req.body ?? {};

        // Validação dos campos obrigatórios
        if (!descricaoRaw)  return reply.code(400).send({ error: "descricao é obrigatório" });
        if (!embalagemRaw)  return reply.code(400).send({ error: "embalagem é obrigatório" });
        if (!codepto)       return reply.code(400).send({ error: "codepto é obrigatório" });
        if (!codsec)        return reply.code(400).send({ error: "codsec é obrigatório" });
        if (!codfornec)     return reply.code(400).send({ error: "codfornec é obrigatório" });

        const descricao       = String(descricaoRaw).trim().toUpperCase().slice(0, 40);
        const embalagem       = String(embalagemRaw).trim().toUpperCase().slice(0, 12);
        const unidade         = unidadeRaw ? String(unidadeRaw).trim().toUpperCase().slice(0, 2) : embalagem.slice(0, 2);

        // Verifica se já existe produto com mesmo EAN
        if (codean) {
            const eanLimpo = String(codean).replace(/\D/g, "");
            if (eanLimpo && eanLimpo !== "0" && eanLimpo.length >= 8) {
                const rowsEan = await executeOracle(
                    `SELECT CODPROD, DESCRICAO FROM PCPRODUT WHERE CODAUXILIAR = :ean AND ROWNUM = 1`,
                    { ean: Number(eanLimpo) }, { outFormat: 4002 }
                ).then(r => r.rows).catch(() => []);
                if (rowsEan && rowsEan.length > 0) {
                    return { ok: false, ja_cadastrado: true, codprod: rowsEan[0].CODPROD, descricao: rowsEan[0].DESCRICAO, mensagem: `Produto já cadastrado com EAN ${eanLimpo} — código ${rowsEan[0].CODPROD}` };
                }
            }
        }

        // Verifica se já existe produto com mesma descrição e fornecedor
        const rowsDesc = await executeOracle(
            `SELECT CODPROD, DESCRICAO FROM PCPRODUT WHERE UPPER(DESCRICAO) = :desc AND CODFORNEC = :codfornec AND ROWNUM = 1`,
            { desc: descricao, codfornec: Number(codfornec) }, { outFormat: 4002 }
        ).then(r => r.rows).catch(() => []);
        if (rowsDesc && rowsDesc.length > 0) {
            return { ok: false, ja_cadastrado: true, codprod: rowsDesc[0].CODPROD, descricao: rowsDesc[0].DESCRICAO, mensagem: `Produto com descrição idêntica já existe — código ${rowsDesc[0].CODPROD}` };
        }

        // Gera próximo CODPROD
        const rowsProx = await executeOracle(
            `SELECT NVL(MAX(CODPROD),0)+1 AS PROX FROM PCPRODUT`,
            {}, { outFormat: 4002 }
        ).then(r => r.rows).catch(() => []);
        if (!rowsProx || rowsProx.length === 0) return reply.code(500).send({ error: "Falha ao gerar código do produto" });
        const codprod = rowsProx[0].PROX;

        // Normalização dos campos
        const nbmLimpo        = nbm ? String(nbm).replace(/\D/g, "").slice(0, 15) : null;
        // CLASSIFICFISCAL = primeiros 2 dígitos do NCM (capítulo fiscal)
        const classifFiscal   = nbmLimpo ? nbmLimpo.slice(0, 2) : null;
        const eanNumero       = codean ? (Number(String(codean).replace(/\D/g, "") || "0") || null) : null;
        const qtUnitCx        = qtunitcx ? Number(qtunitcx) : 1;
        const qtUnit          = qtunit   ? Number(qtunit)   : 1;
        const pesoBruto       = pesobruto && Number(pesobruto) > 0 ? Number(pesobruto) : 1;
        const pesoLiq         = pesoliq   && Number(pesoliq)   > 0 ? Number(pesoliq)   : 1;
        const volumeVal       = volume        ? Number(volume)         : null;
        const largura         = larguram3     ? Number(larguram3)      : null;
        const altura          = alturam3      ? Number(alturam3)       : null;
        const comprimento     = comprimentom3 ? Number(comprimentom3)  : null;
        const sittributLimpo  = sittribut     ? String(sittribut).slice(0, 3) : null;
        const revendaFlag     = revenda === "N" ? "N" : "S";
        const tipomercVal     = tipomerc ? String(tipomerc).slice(0, 2) : "L";
        const infoTec         = informacoestecnicas ? String(informacoestecnicas).slice(0, 2000) : descricao;
        // CODNCMEX: NBM seguido de ponto (ex: "94042100.")
        const codncmexVal     = nbmLimpo ? nbmLimpo + "." : null;
        // CODFAB: código do produto no sistema do fornecedor (cProd do XML)
        const codfabVal       = codfab ? String(codfab).trim().slice(0, 60) : null;
        // CODAUXILIAR2: EAN da embalagem master/caixa (cEANTrib do XML)
        // Se não vier no XML, deriva como "1" + EAN da unidade (padrão EAN-14 de caixa)
        let codauxiliar2Val = null;
        if (codean2) {
            const ean2Limpo = String(codean2).replace(/\D/g, "");
            if (ean2Limpo && ean2Limpo !== "0") codauxiliar2Val = Number(ean2Limpo) || null;
        } else if (eanNumero) {
            codauxiliar2Val = Number("1" + String(eanNumero)) || null;
        }

        await executeOracle(`
            INSERT INTO PCPRODUT (
                CODPROD, DESCRICAO, EMBALAGEM, UNIDADE, UNIDADEMASTER,
                CODEPTO, CODSEC, CODFORNEC,
                NBM, CODNCMEX, CLASSIFICFISCAL, SITTRIBUT,
                CODAUXILIAR, CODAUXILIARTRIB, CODAUXILIAR2, CODFAB, QTUNITCX, QTUNIT,
                UNIDADETRIB,
                PESOBRUTO, PESOLIQ, VOLUME,
                LARGURAM3, ALTURAM3, COMPRIMENTOM3,
                TIPOMERC, TIPOPROD, TIPOCALCST,
                REVENDA, IMPORTADO, CAMPANHA,
                MOEDA, COMISSAOFIXA, ACEITAVENDAFRACAO,
                CLASSEVENDA, PERCCOMMOT,
                TIPODESCARGA, TIPOVOLUMEDESCARGA,
                MODULO, RUA, APTO,
                MODULO2, RUA2, NUMERO2, APTO2,
                MODULOCT, RUACT, APTOCT,
                RUACX, APTOCX, MODULOCX,
                LASTROPAL, ALTURAPAL, QTTOTPAL,
                PCOMINT1, PCOMREP1, PCOMEXT1, TEMREPOS,
                MULTIPLO, TIPOTRIBUTMEDIC,
                INFORMACOESTECNICAS, DTCADASTRO
            ) VALUES (
                :codprod, :descricao, :embalagem, :unidade, :unidademaster,
                :codepto, :codsec, :codfornec,
                :nbm, :codncmex, :classificfiscal, :sittribut,
                :codauxiliar, :codauxiliar, :codauxiliar2, :codfab, :qtunitcx, :qtunit,
                :unidade,
                :pesobruto, :pesoliq, :volume,
                :larguram3, :alturam3, :comprimentom3,
                :tipomerc, 1, 'N',
                :revenda, 'N', 'N',
                'R', 'N', 'N',
                'A', 2,
                'P', 'CX',
                1, 1, 1,
                1, 1, 1, 1,
                1, 1, 1,
                1, 1, 1,
                1, 1, 1,
                1, 1, 1, 21,
                1, 'OM',
                :informacoestecnicas, SYSDATE
            )`,
            {
                codprod,
                descricao,
                embalagem,
                unidade,
                unidademaster:    unidade,
                codepto:          Number(codepto),
                codsec:           Number(codsec),
                codfornec:        Number(codfornec),
                nbm:              nbmLimpo,
                codncmex:         codncmexVal,
                classificfiscal:  classifFiscal,
                sittribut:        sittributLimpo,
                codauxiliar:      eanNumero,
                codauxiliar2:     codauxiliar2Val,
                codfab:           codfabVal,
                qtunitcx:         qtUnitCx,
                qtunit:           qtUnit,
                pesobruto:        pesoBruto,
                pesoliq:          pesoLiq,
                volume:           volumeVal,
                larguram3:        largura,
                alturam3:         altura,
                comprimentom3:    comprimento,
                tipomerc:         tipomercVal,
                revenda:          revendaFlag,
                informacoestecnicas: infoTec,
            },
            { autoCommit: true }
        );

        // ── Inserir PCPRODFILIAL para cada filial selecionada ──────────────────
        const filiaisSelecionadas = Array.isArray(req.body?.filiais) ? req.body.filiais : [];

        const filiaisInseridas = [];
        for (const codfilial of filiaisSelecionadas) {
            try {
                await executeOracle(`
                    INSERT INTO PCPRODFILIAL (
                        CODPROD, CODFILIAL,
                        ATIVO, PROIBIDAVENDA, REVENDA,
                        PISCOFINSRETIDO, PERPIS, PERCOFINS,
                        CALCCREDIPI,
                        MULTIPLO,
                        ESTOQUEMIN, ESTOQUEMAX,
                        CLASSEVENDA,
                        GERAICMSLIVROFISCAL, GERAICMSLIVROFISCALENT
                    ) VALUES (
                        :codprod, :codfilial,
                        'S', 'N', :revenda,
                        'N', 0, 0,
                        'N',
                        1,
                        0, 0,
                        'C',
                        'S', 'S'
                    )
                `, {
                    codprod,
                    codfilial: String(codfilial).slice(0, 2),
                    revenda: revendaFlag,
                }, { autoCommit: true });
                filiaisInseridas.push(String(codfilial));
            } catch (eFilial) {
                // Ignora ORA-00001 (já existe) mas registra outros erros
                if (!String(eFilial.message).includes("ORA-00001")) {
                    app.log.warn({ msg: "PCPRODFILIAL_INSERT_WARN", codprod, codfilial, erro: eFilial.message });
                }
            }
        }

        registrarLogAuditoria({
            acao: "CADASTRAR_PRODUTO_FISCAL",
            entidade: "PRODUTO",
            idEntidade: String(codprod),
            chaveAcesso: chaveAcesso || null,
            usuario: getUsuarioReq(req),
            ip: getIpReq(req),
        });

        return {
            ok: true, codprod, descricao, embalagem,
            codepto: Number(codepto), codsec: Number(codsec),
            filiaisInseridas,
            mensagem: `Produto cadastrado com código ${codprod}${filiaisInseridas.length ? ` em ${filiaisInseridas.length} filial(is)` : ""}`,
        };
    });

    // =========================================================
    // TRIBUTAÇÃO — Filiais, Figuras, PIS/COFINS
    // =========================================================

    // GET /api/fiscal/tributos/filiais
    app.get("/api/fiscal/tributos/filiais", async (req, reply) => {
        if (!isOracleEnabled()) return reply.code(503).send({ error: "Oracle não disponível" });
        const rows = await executeOracle(
            `SELECT CODIGO, RAZAOSOCIAL, UF, FANTASIA FROM PCFILIAL WHERE DTEXCLUSAO IS NULL ORDER BY CODIGO`,
            {}, { outFormat: 4002 }
        ).then(r => r.rows).catch(() => []);
        return { filiais: (rows || []).map(r => ({
            codfilial: r.CODIGO,
            descricao: String(r.FANTASIA || r.RAZAOSOCIAL || "").trim(),
            uf: r.UF || ""
        })) };
    });

    // GET /api/fiscal/tributos/buscar-figura?ncm=xxx&codfilial=1&tipofornec=J
    // Busca a figura fiscal em PCTRIBENTRADA para um NCM, retorna dados da PCTRIBFIGURA
    app.get("/api/fiscal/tributos/buscar-figura", async (req, reply) => {
        if (!isOracleEnabled()) return reply.code(503).send({ error: "Oracle não disponível" });
        const ncmRaw = String(req.query.ncm || "").replace(/\D/g, "").slice(0, 8);
        const codfilial = String(req.query.codfilial || "1").slice(0, 2);
        const tipofornec = String(req.query.tipofornec || "I").slice(0, 1).toUpperCase();
        if (!ncmRaw) return reply.code(400).send({ error: "ncm é obrigatório" });

        // WinThor armazena NCM em PCTRIBENTRADA como "94042100." (8 dígitos + ponto final)
        // Gera os 3 formatos possíveis para busca (com ponto, sem ponto, ponto interno)
        const ncmComPontoFinal = ncmRaw.slice(0, 8) + ".";   // "94042100."  ← formato real
        const ncmSemPontos = ncmRaw.slice(0, 8);              // "94042100"   ← fallback
        const ncmComPontosInternos = ncmRaw.length === 8      // "9404.21.00" ← fallback extra
            ? `${ncmRaw.slice(0,4)}.${ncmRaw.slice(4,6)}.${ncmRaw.slice(6,8)}`
            : ncmRaw;

        const sqlFigura = `
            SELECT te.NCM, te.CODFIGURA, te.CODTRIBPISCOFINS, te.CODEXCECAOPISCOFINS,
                   tf.DESCRICAO AS DESCFIGURA,
                   tf.SITTRIBUT, tf.CODFISCALENT,
                   tf.PERCICM, tf.PERCICMRED, tf.PERCBASEREDENT,
                   tf.PERIPI, tf.CALCCREDIPI,
                   tf.PERPIS, tf.PERCOFINS, tf.PISCOFINSRETIDO,
                   tf.PERCST, tf.PERCIVA, tf.PERCALIQINT, tf.PERCALIQEXT,
                   tp.DESCRICAOTRIBPISCOFINS,
                   tp.PERCPIS AS PERCPISTRIB, tp.PERCCOFINS AS PERCCOFINISTRIB,
                   tp.SITTRIBUT AS SITTRIBPISCOFINS
            FROM PCTRIBENTRADA te
            JOIN PCTRIBFIGURA tf ON tf.CODFIGURA = te.CODFIGURA
            LEFT JOIN PCTRIBPISCOFINS tp ON tp.CODTRIBPISCOFINS = te.CODTRIBPISCOFINS
            WHERE te.NCM IN (:ncm1, :ncm2, :ncm3)
              AND te.CODFILIAL IN (:codfilial, '0')
              AND (te.TIPOFORNEC = :tipofornec OR te.TIPOFORNEC = 'I')
            ORDER BY
              CASE WHEN te.CODFILIAL = :codfilial THEN 0 ELSE 1 END,
              CASE WHEN te.NCM = :ncm1 THEN 0 WHEN te.NCM = :ncm2 THEN 1 ELSE 2 END,
              CASE WHEN te.TIPOFORNEC = :tipofornec THEN 0 ELSE 1 END
            FETCH FIRST 1 ROWS ONLY
        `;
        let rows = await executeOracle(sqlFigura, {
            ncm1: ncmComPontoFinal, ncm2: ncmSemPontos, ncm3: ncmComPontosInternos,
            codfilial, tipofornec
        }, { outFormat: 4002 }).then(r => r.rows).catch(() => []);

        // Fallback: qualquer filial, qualquer tipofornec
        if (!rows || rows.length === 0) {
            const sqlFallback = `
                SELECT te.NCM, te.CODFIGURA, te.CODTRIBPISCOFINS, te.CODEXCECAOPISCOFINS,
                       tf.DESCRICAO AS DESCFIGURA,
                       tf.SITTRIBUT, tf.CODFISCALENT,
                       tf.PERCICM, tf.PERCICMRED, tf.PERCBASEREDENT,
                       tf.PERIPI, tf.CALCCREDIPI,
                       tf.PERPIS, tf.PERCOFINS, tf.PISCOFINSRETIDO,
                       tf.PERCST, tf.PERCIVA, tf.PERCALIQINT, tf.PERCALIQEXT,
                       tp.DESCRICAOTRIBPISCOFINS,
                       tp.PERCPIS AS PERCPISTRIB, tp.PERCCOFINS AS PERCCOFINISTRIB,
                       tp.SITTRIBUT AS SITTRIBPISCOFINS
                FROM PCTRIBENTRADA te
                JOIN PCTRIBFIGURA tf ON tf.CODFIGURA = te.CODFIGURA
                LEFT JOIN PCTRIBPISCOFINS tp ON tp.CODTRIBPISCOFINS = te.CODTRIBPISCOFINS
                WHERE te.NCM IN (:ncm1, :ncm2, :ncm3)
                ORDER BY te.CODFILIAL ASC
                FETCH FIRST 1 ROWS ONLY
            `;
            rows = await executeOracle(sqlFallback, { ncm1: ncmComPontoFinal, ncm2: ncmSemPontos, ncm3: ncmComPontosInternos }, { outFormat: 4002 }).then(r => r.rows).catch(() => []);
        }

        if (!rows || rows.length === 0) return { encontrado: false, ncm: ncmRaw };
        const r = rows[0];
        return {
            encontrado: true,
            ncm: ncmRaw,
            codfigura: r.CODFIGURA,
            descfigura: String(r.DESCFIGURA || "").trim(),
            codtribpiscofins: r.CODTRIBPISCOFINS,
            descricaotribpiscofins: String(r.DESCRICAOTRIBPISCOFINS || "").trim(),
            codexcecaopiscofins: r.CODEXCECAOPISCOFINS,
            sittribut: r.SITTRIBUT,
            codfiscalent: r.CODFISCALENT,
            percicm: r.PERCICM,
            percicmred: r.PERCICMRED,
            percbaseredent: r.PERCBASEREDENT,
            peripi: r.PERIPI,
            calccredipi: r.CALCCREDIPI,
            perpis: r.PERPIS,
            percofins: r.PERCOFINS,
            piscofinsretido: r.PISCOFINSRETIDO,
            percst: r.PERCST,
            perciva: r.PERCIVA,
            percaliqint: r.PERCALIQINT,
            percaliqext: r.PERCALIQEXT,
            sittribpiscofins: r.SITTRIBPISCOFINS,
            percpistrib: r.PERCPISTRIB,
            perccofinistrib: r.PERCCOFINISTRIB,
        };
    });

    // GET /api/fiscal/tributos/piscofins
    // Lista os códigos de tributação PIS/COFINS disponíveis
    app.get("/api/fiscal/tributos/piscofins", async (req, reply) => {
        if (!isOracleEnabled()) return reply.code(503).send({ error: "Oracle não disponível" });
        const rows = await executeOracle(
            `SELECT CODTRIBPISCOFINS, DESCRICAOTRIBPISCOFINS, PERCPIS, PERCCOFINS, SITTRIBUT
             FROM PCTRIBPISCOFINS ORDER BY CODTRIBPISCOFINS`,
            {}, { outFormat: 4002 }
        ).then(r => r.rows).catch(() => []);
        return {
            piscofins: (rows || []).map(r => ({
                codigo: r.CODTRIBPISCOFINS,
                descricao: String(r.DESCRICAOTRIBPISCOFINS || "").trim(),
                percpis: r.PERCPIS,
                perccofins: r.PERCCOFINS,
                sittribut: r.SITTRIBUT,
            }))
        };
    });

    // GET /api/fiscal/tributos/figuras?busca=xxx
    // Lista figuras fiscais (PCTRIBFIGURA) para seleção manual
    app.get("/api/fiscal/tributos/figuras", async (req, reply) => {
        if (!isOracleEnabled()) return reply.code(503).send({ error: "Oracle não disponível" });
        const busca = String(req.query.busca || "").trim().toUpperCase();
        const sql = busca
            ? `SELECT CODFIGURA, DESCRICAO FROM PCTRIBFIGURA WHERE UPPER(DESCRICAO) LIKE '%' || :busca || '%' ORDER BY CODFIGURA FETCH FIRST 50 ROWS ONLY`
            : `SELECT CODFIGURA, DESCRICAO FROM PCTRIBFIGURA ORDER BY CODFIGURA FETCH FIRST 100 ROWS ONLY`;
        const rows = await executeOracle(sql, busca ? { busca } : {}, { outFormat: 4002 }).then(r => r.rows).catch(() => []);
        return { figuras: (rows || []).map(r => ({ codfigura: r.CODFIGURA, descricao: String(r.DESCRICAO || "").trim() })) };
    });

    // =========================================================
    // PEDIDOS DE COMPRA — Criação via NF-e
    // =========================================================

    // POST /api/fiscal/pedidos/criar
    // Cria pedido de compra no WinThor (PCPEDIDO + PCITEM + PCPEDNF)
    app.post("/api/fiscal/pedidos/criar", async (req, reply) => {
        if (!isOracleEnabled()) return reply.code(503).send({ error: "Oracle não disponível" });

        const {
            chaveAcesso,
            codfornec,
            codfilial,
            vltotal,
            dtprevent,
            obs,
            itens,
        } = req.body ?? {};

        if (!chaveAcesso)  return reply.code(400).send({ error: "chaveAcesso é obrigatório" });
        if (!codfornec)    return reply.code(400).send({ error: "codfornec é obrigatório" });
        if (!codfilial)    return reply.code(400).send({ error: "codfilial é obrigatório" });
        if (!vltotal)      return reply.code(400).send({ error: "vltotal é obrigatório" });
        if (!Array.isArray(itens) || itens.length === 0) return reply.code(400).send({ error: "itens é obrigatório e deve conter ao menos um item" });

        for (let i = 0; i < itens.length; i++) {
            const it = itens[i];
            // Resolve codprod pelo EAN quando não fornecido diretamente
            if (!it.codprod && it.ean) {
                const eanNum = Number(String(it.ean).replace(/\D/g, ""));
                if (eanNum > 0) {
                    const rowsEanP = await executeOracle(
                        `SELECT CODPROD FROM PCPRODUT WHERE CODAUXILIAR = :ean AND ROWNUM = 1`,
                        { ean: eanNum }, { outFormat: 4002 }
                    ).then(r => r.rows).catch(() => []);
                    if (rowsEanP && rowsEanP.length > 0) it.codprod = rowsEanP[0].CODPROD;
                }
            }
            if (!it.codprod)   return reply.code(400).send({ error: `itens[${i}].codprod é obrigatório (EAN ${it.ean || "não informado"} não encontrado no WinThor)` });
            if (!it.qtpedida)  return reply.code(400).send({ error: `itens[${i}].qtpedida é obrigatório` });
            if (!it.pcompra)   return reply.code(400).send({ error: `itens[${i}].pcompra é obrigatório` });
        }

        // Verifica se já existe pedido vinculado a esta NF-e
        const rowsExist = await executeOracle(
            `SELECT pnf.NUMPEDIDO FROM PCPEDNF pnf
             JOIN PCNFENT n ON n.NUMTRANSENT = pnf.NUMTRANSENT
             WHERE n.CHAVENFE = :chave AND ROWNUM = 1`,
            { chave: chaveAcesso }, { outFormat: 4002 }
        ).then(r => r.rows).catch(() => []);
        if (rowsExist && rowsExist.length > 0) {
            return reply.code(409).send({ error: `Já existe pedido ${rowsExist[0].NUMPEDIDO} vinculado a esta NF-e` });
        }

        // Busca NUMTRANSENT e DTENT da NF-e
        const rowsNf = await executeOracle(
            `SELECT NUMTRANSENT, DTENT, DTEMISSAO, CODFILIAL FROM PCNFENT WHERE CHAVENFE = :chave AND ROWNUM = 1`,
            { chave: chaveAcesso }, { outFormat: 4002 }
        ).then(r => r.rows).catch(() => []);
        if (!rowsNf || rowsNf.length === 0) {
            return reply.code(404).send({ error: "NF-e não encontrada no WinThor (PCNFENT)" });
        }
        const toNum = (v) => { const n = Number(v); return isNaN(n) ? null : n; };
        const numtransent = rowsNf[0].NUMTRANSENT;
        const dtent       = rowsNf[0].DTENT   ? new Date(rowsNf[0].DTENT)   : new Date();
        const dtemissao   = rowsNf[0].DTEMISSAO ? new Date(rowsNf[0].DTEMISSAO) : new Date();
        const codfilialNf = toNum(rowsNf[0].CODFILIAL) ?? toNum(codfilial) ?? 1;

        // Gera próximo NUMPED
        const rowsProxPed = await executeOracle(
            `SELECT NVL(MAX(NUMPED),0)+1 AS PROX FROM PCPEDIDO`,
            {}, { outFormat: 4002 }
        ).then(r => r.rows).catch(() => []);
        if (!rowsProxPed || rowsProxPed.length === 0) return reply.code(500).send({ error: "Falha ao gerar número do pedido" });
        const numped = rowsProxPed[0].PROX;

        const dtpreventDate = dtprevent ? new Date(dtprevent) : dtent;
        const vltotalNum    = toNum(vltotal) ?? 0;
        const obsTexto      = obs ? String(obs).slice(0, 250) : `NF-e ${chaveAcesso.slice(25, 34)}`;

        // INSERT PCPEDIDO
        await executeOracle(`
            INSERT INTO PCPEDIDO (
                NUMPED, CODFORNEC, DTEMISSAO, CODFILIAL,
                VLTOTAL, VLENTREGUE,
                DTPREVENT, DTEMBARQUE, DATALANC,
                FRETE, CODCOMPRADOR, TIPOVENC, TIPOBONIFIC,
                TIPOEMBALAGEMPEDIDO, AUTOMATICO, OBS
            ) VALUES (
                :numped, :codfornec, :dtemissao, :codfilial,
                :vltotal, 0,
                :dtprevent, :dtemissao, SYSDATE,
                'C', 4, 'E', 'N',
                'V', 'N', :obs
            )`,
            {
                numped,
                codfornec:  toNum(codfornec),
                dtemissao,
                codfilial:  codfilialNf,
                vltotal:    vltotalNum,
                dtprevent:  dtpreventDate,
                obs:        obsTexto,
            },
            { autoCommit: false }
        );

        // INSERT PCITEM para cada item
        for (let i = 0; i < itens.length; i++) {
            const it      = itens[i];
            const numseq  = i + 1;
            const pcompra = toNum(it.pcompra) ?? 0;
            const qtped   = toNum(it.qtpedida) ?? 0;
            const pliq    = it.pliquido != null ? (toNum(it.pliquido) ?? pcompra) : pcompra;

            await executeOracle(`
                INSERT INTO PCITEM (
                    CODPROD, NUMPED, NUMSEQ,
                    PCOMPRA, QTPEDIDA, QTENTREGUE,
                    PLIQUIDO, PCOMPRAANT,
                    DTULTENT, MOEDA, TIPOCALCST,
                    PERPIS, PERCOFINS, STATUS,
                    APROVEITACREDPISCOFINS,
                    NUMSEQADICAO, NUMSEQORIGEM
                ) VALUES (
                    :codprod, :numped, :numseq,
                    :pcompra, :qtpedida, 0,
                    :pliquido, :pcompra,
                    :dtultent, 'R', 'G',
                    1.65, 7.6, 'AB',
                    'N',
                    :numseq, :numseq
                )`,
                {
                    codprod:  toNum(it.codprod),
                    numped,
                    numseq,
                    pcompra,
                    qtpedida: qtped,
                    pliquido: pliq,
                    dtultent: dtent,
                },
                { autoCommit: false }
            );
        }

        // INSERT PCPEDNF (vincula pedido à NF-e)
        await executeOracle(`
            INSERT INTO PCPEDNF (NUMPEDIDO, NUMTRANSENT, DTULTENT)
            VALUES (:numpedido, :numtransent, :dtultent)`,
            {
                numpedido:   numped,
                numtransent: numtransent,
                dtultent:    dtent,
            },
            { autoCommit: true }
        );

        // Atualiza documento em memória
        const doc = db.fiscalDocumentos.find(d => d.chaveAcesso === chaveAcesso);
        if (doc) {
            doc.pedidoCompra = String(numped);
            doc.statusWinthor = "ENCONTRADO";
            doc.atualizadoEm = new Date().toISOString();
        }

        registrarLogAuditoria({
            acao: "CRIAR_PEDIDO_COMPRA_FISCAL",
            entidade: "PEDIDO",
            idEntidade: String(numped),
            chaveAcesso,
            usuario: getUsuarioReq(req),
            ip: getIpReq(req),
        });

        return {
            ok: true,
            numped,
            numtransent,
            codfornec: Number(codfornec),
            totalItens: itens.length,
            mensagem: `Pedido de compra ${numped} criado com ${itens.length} item(ns)`,
        };
    });
}
