import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { db, nextId } from "../repositories/dataStore.js";
import { isOracleEnabled, executeOracle } from "../db/oracle.js";
import { persistCollections } from "../repositories/persistentCollectionStore.js";
import forge from "node-forge";

const NFSE_PERSIST_KEYS = [
    "nfseEmitidas", "nfseTomadas", "nfseServicos", "nfseTomadores",
    "nfseLotes", "nfseRecorrentes", "nfseAdnDocumentos", "nfseLogAuditoria", "nfseConfig",
];

function getUsuario(req) {
    return req.authUser?.username || req.authUser?.email || req.authUser?.nome || "sistema";
}
function getIp(req) {
    return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "0.0.0.0";
}
function hashTexto(t) {
    return createHash("sha256").update(String(t)).digest("hex");
}
function limparCnpj(v) {
    return String(v || "").replace(/\D/g, "");
}
function paginar(arr, page = 1, pageSize = 50) {
    const total = arr.length;
    const p = Math.max(1, Number(page));
    const ps = Math.min(100, Math.max(1, Number(pageSize)));
    const items = arr.slice((p - 1) * ps, p * ps);
    return { items, total, page: p, pageSize: ps, totalPages: Math.ceil(total / ps) };
}

function registrarLog({ acao, entidade, entidadeId, usuario, ip, detalhe = {} }) {
    if (!db.nfseLogAuditoria) db.nfseLogAuditoria = [];
    db.nfseLogAuditoria.unshift({
        id: nextId("NFSE-LOG", db.nfseLogAuditoria.length),
        acao, entidade, entidadeId, usuario, ip,
        detalhe: JSON.stringify(detalhe),
        criadoEm: new Date().toISOString(),
    });
    if (db.nfseLogAuditoria.length > 2000) db.nfseLogAuditoria.splice(2000);
}

function proximoNumeroRps() {
    const cfg = db.nfseConfig || {};
    cfg.numeroUltimoRps = (cfg.numeroUltimoRps || 0) + 1;
    return String(cfg.numeroUltimoRps).padStart(15, "0");
}

function calcularImpostos(valorServico, aliquotaIss, retencaoIss) {
    const base = Number(valorServico) || 0;
    const aliq = Number(aliquotaIss) || 0;
    const iss = parseFloat((base * aliq / 100).toFixed(2));
    return {
        baseCalculo: base,
        aliquotaIss: aliq,
        valorIss: iss,
        retencaoIss: Boolean(retencaoIss),
        valorLiquido: retencaoIss ? parseFloat((base - iss).toFixed(2)) : base,
    };
}

function gerarCodigoVerificacao() {
    return randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
}

async function ensureNfseOracleTables() {
    if (!isOracleEnabled()) return;
    const tables = [
        [`CREATE TABLE NFS_EMITIDAS (
            ID VARCHAR2(50) PRIMARY KEY,
            NUMERO_NFSE VARCHAR2(20),
            NUMERO_RPS VARCHAR2(20),
            SERIE_RPS VARCHAR2(5),
            CODIGO_VERIFICACAO VARCHAR2(50),
            STATUS VARCHAR2(20),
            AMBIENTE VARCHAR2(20),
            CNPJ_PRESTADOR VARCHAR2(14),
            CNPJ_TOMADOR VARCHAR2(14),
            CPF_TOMADOR VARCHAR2(11),
            NOME_TOMADOR VARCHAR2(200),
            EMAIL_TOMADOR VARCHAR2(200),
            DESCRICAO_SERVICO VARCHAR2(2000),
            CODIGO_SERVICO VARCHAR2(20),
            CNAE_SERVICO VARCHAR2(10),
            MUNICIPIO_SERVICO VARCHAR2(100),
            CODIGO_MUNICIPIO VARCHAR2(10),
            VALOR_SERVICO NUMBER(15,2),
            ALIQUOTA_ISS NUMBER(7,4),
            VALOR_ISS NUMBER(15,2),
            RETENCAO_ISS NUMBER(1) DEFAULT 0,
            BASE_CALCULO NUMBER(15,2),
            VALOR_LIQUIDO NUMBER(15,2),
            COMPETENCIA VARCHAR2(7),
            DATA_EMISSAO DATE,
            PROTOCOLO_AUTORIZACAO VARCHAR2(100),
            MOTIVO_CANCELAMENTO VARCHAR2(500),
            XML_HASH VARCHAR2(64),
            CRIADO_POR VARCHAR2(200),
            CRIADO_EM TIMESTAMP DEFAULT SYSTIMESTAMP,
            ATUALIZADO_EM TIMESTAMP DEFAULT SYSTIMESTAMP
        )`, "NFS_EMITIDAS"],
        [`CREATE TABLE NFS_TOMADAS (
            ID VARCHAR2(50) PRIMARY KEY,
            NUMERO_NFSE VARCHAR2(20),
            CNPJ_PRESTADOR VARCHAR2(14),
            NOME_PRESTADOR VARCHAR2(200),
            CNPJ_TOMADOR VARCHAR2(14),
            DESCRICAO_SERVICO VARCHAR2(2000),
            CODIGO_SERVICO VARCHAR2(20),
            VALOR_SERVICO NUMBER(15,2),
            VALOR_ISS NUMBER(15,2),
            ALIQUOTA_ISS NUMBER(7,4),
            STATUS VARCHAR2(20),
            DATA_EMISSAO DATE,
            COMPETENCIA VARCHAR2(7),
            MUNICIPIO VARCHAR2(100),
            ORIGEM VARCHAR2(50),
            PCNFENT_NUMPED NUMBER,
            PCLANC_ID NUMBER,
            CONCILIADO NUMBER(1) DEFAULT 0,
            CRIADO_EM TIMESTAMP DEFAULT SYSTIMESTAMP
        )`, "NFS_TOMADAS"],
        [`CREATE TABLE NFS_SERVICOS (
            ID VARCHAR2(50) PRIMARY KEY,
            CODIGO VARCHAR2(20) NOT NULL,
            DESCRICAO VARCHAR2(500),
            CNAE VARCHAR2(10),
            ALIQUOTA_ISS NUMBER(7,4),
            ATIVO NUMBER(1) DEFAULT 1,
            CRIADO_EM TIMESTAMP DEFAULT SYSTIMESTAMP
        )`, "NFS_SERVICOS"],
        [`CREATE TABLE NFS_TOMADORES (
            ID VARCHAR2(50) PRIMARY KEY,
            TIPO VARCHAR2(5),
            CNPJ_CPF VARCHAR2(14),
            NOME VARCHAR2(200),
            EMAIL VARCHAR2(200),
            TELEFONE VARCHAR2(20),
            LOGRADOURO VARCHAR2(200),
            NUMERO VARCHAR2(20),
            COMPLEMENTO VARCHAR2(100),
            BAIRRO VARCHAR2(100),
            MUNICIPIO VARCHAR2(100),
            UF VARCHAR2(2),
            CEP VARCHAR2(8),
            INSCRICAO_MUNICIPAL VARCHAR2(50),
            CRIADO_EM TIMESTAMP DEFAULT SYSTIMESTAMP
        )`, "NFS_TOMADORES"],
        [`CREATE TABLE NFS_LOTES (
            ID VARCHAR2(50) PRIMARY KEY,
            STATUS VARCHAR2(20),
            TOTAL_ITENS NUMBER DEFAULT 0,
            PROCESSADOS NUMBER DEFAULT 0,
            ERROS NUMBER DEFAULT 0,
            CRIADO_POR VARCHAR2(200),
            CRIADO_EM TIMESTAMP DEFAULT SYSTIMESTAMP,
            FINALIZADO_EM TIMESTAMP
        )`, "NFS_LOTES"],
        [`CREATE TABLE NFS_LOG_AUDITORIA (
            ID VARCHAR2(50) PRIMARY KEY,
            ACAO VARCHAR2(100),
            ENTIDADE VARCHAR2(100),
            ENTIDADE_ID VARCHAR2(100),
            USUARIO VARCHAR2(200),
            IP VARCHAR2(50),
            DETALHE CLOB,
            CRIADO_EM TIMESTAMP DEFAULT SYSTIMESTAMP
        )`, "NFS_LOG_AUDITORIA"],
    ];
    for (const [ddl, name] of tables) {
        try {
            await executeOracle(ddl);
        } catch (e) {
            if (!String(e.message || "").includes("ORA-00955")) {
                console.warn(`[nfse] ensureTable ${name} warn:`, e.message);
            }
        }
    }
}

async function persistirNfse() {
    await persistCollections(NFSE_PERSIST_KEYS).catch(() => {});
}

function initDb() {
    if (!db.nfseEmitidas) db.nfseEmitidas = [];
    if (!db.nfseTomadas) db.nfseTomadas = [];
    if (!db.nfseServicos) db.nfseServicos = [];
    if (!db.nfseTomadores) db.nfseTomadores = [];
    if (!db.nfseLotes) db.nfseLotes = [];
    if (!db.nfseRecorrentes) db.nfseRecorrentes = [];
    if (!db.nfseAdnDocumentos) db.nfseAdnDocumentos = [];
    if (!db.nfseLogAuditoria) db.nfseLogAuditoria = [];
    if (!db.nfseConfig) {
        db.nfseConfig = {
            ambiente: "HOMOLOGACAO",
            municipioEmissor: "",
            codigoMunicipio: "",
            inscricaoMunicipal: "",
            cnpjEmissor: "",
            regimeTributario: "1",
            aliquotaIssDefault: 5.0,
            retencaoIss: false,
            emiteNfse: false,
            // API SEFIN Nacional — produção: https://sefin.nfse.gov.br/SefinNacional/nfse
            // API SEFIN Nacional — homologação: https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/nfse
            // ADN contribuintes — produção: https://adn.nfse.gov.br/contribuintes/nfse
            // ADN contribuintes — homologação: https://adn.producaorestrita.nfse.gov.br/contribuintes/nfse
            urlPrefeitura: "",
            versaoDps: "1.00",
            numeroUltimoRps: 0,
            serieRps: "A",
        };
    }
}

export async function ensureNfseTables() {
    return ensureNfseOracleTables();
}

export async function nfseNacionalRoutes(app) {
    initDb();

    // ===========================================================
    // DASHBOARD
    // ===========================================================
    app.get("/api/fiscal/nfse/dashboard", async (req, reply) => {
        initDb();
        const emitidas = db.nfseEmitidas;
        const tomadas = db.nfseTomadas;
        const mesAtual = new Date().toISOString().slice(0, 7);

        const emMes = emitidas.filter(e => (e.competencia || e.dataEmissao || "").startsWith(mesAtual));
        const valorEmitidasMes = emMes.reduce((s, e) => s + (Number(e.valorServico) || 0), 0);
        const valorIssMes = emMes.reduce((s, e) => s + (Number(e.valorIss) || 0), 0);

        const tomadasMes = tomadas.filter(e => (e.competencia || e.dataEmissao || "").startsWith(mesAtual));
        const valorTomadasMes = tomadasMes.reduce((s, e) => s + (Number(e.valorServico) || 0), 0);

        const statusMap = {};
        for (const e of emitidas) {
            statusMap[e.status] = (statusMap[e.status] || 0) + 1;
        }

        const lotesPendentes = (db.nfseLotes || []).filter(l => l.status === "PROCESSANDO").length;

        return reply.send({
            totalEmitidas: emitidas.length,
            totalTomadas: tomadas.length,
            emitidasMes: emMes.length,
            tomadasMes: tomadasMes.length,
            valorEmitidasMes,
            valorIssMes,
            valorTomadasMes,
            lotesPendentes,
            statusEmitidas: statusMap,
            ultimasEmitidas: emitidas.slice(0, 5).map(e => ({
                id: e.id,
                numeroNfse: e.numeroNfse,
                nomeTomador: e.nomeTomador,
                valorServico: e.valorServico,
                status: e.status,
                dataEmissao: e.dataEmissao,
            })),
        });
    });

    // ===========================================================
    // NFS-e EMITIDAS
    // ===========================================================
    app.get("/api/fiscal/nfse/emitidas", async (req, reply) => {
        initDb();
        const q = req.query;
        let docs = [...db.nfseEmitidas];

        if (q.status) docs = docs.filter(d => d.status === q.status);
        if (q.cnpjTomador) {
            const c = limparCnpj(q.cnpjTomador);
            docs = docs.filter(d => limparCnpj(d.cnpjTomador).includes(c));
        }
        if (q.competencia) docs = docs.filter(d => (d.competencia || "").startsWith(q.competencia));
        if (q.dataInicio) docs = docs.filter(d => (d.dataEmissao || "") >= q.dataInicio);
        if (q.dataFim) docs = docs.filter(d => (d.dataEmissao || "") <= q.dataFim + "T23:59:59");
        if (q.busca) {
            const b = q.busca.toLowerCase();
            docs = docs.filter(d =>
                (d.nomeTomador || "").toLowerCase().includes(b) ||
                (d.numeroNfse || "").includes(q.busca) ||
                (d.descricaoServico || "").toLowerCase().includes(b)
            );
        }

        docs.sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""));

        const { items, total, page, pageSize, totalPages } = paginar(docs, q.page, q.pageSize);

        // Strip XML content — never sent to frontend
        const safe = items.map(({ xmlConteudo, ...rest }) => rest);
        return reply.send({ items: safe, total, page, pageSize, totalPages });
    });

    app.get("/api/fiscal/nfse/emitidas/:id", async (req, reply) => {
        initDb();
        const doc = db.nfseEmitidas.find(d => d.id === req.params.id);
        if (!doc) return reply.status(404).send({ error: { message: "NFS-e não encontrada" } });

        registrarLog({
            acao: "VISUALIZAR_NFSE", entidade: "nfseEmitidas", entidadeId: doc.id,
            usuario: getUsuario(req), ip: getIp(req),
        });

        const { xmlConteudo, ...safe } = doc;
        return reply.send(safe);
    });

    // Emitir NFS-e
    app.post("/api/fiscal/nfse/emitir", async (req, reply) => {
        initDb();
        const body = req.body || {};
        const usuario = getUsuario(req);
        const ip = getIp(req);

        // Validações básicas
        const erros = [];
        if (!body.cnpjTomador && !body.cpfTomador) erros.push("cnpjTomador ou cpfTomador obrigatório");
        if (!body.nomeTomador) erros.push("nomeTomador obrigatório");
        if (!body.descricaoServico) erros.push("descricaoServico obrigatório");
        if (!body.codigoServico) erros.push("codigoServico obrigatório");
        if (!body.valorServico || Number(body.valorServico) <= 0) erros.push("valorServico inválido");
        if (!body.competencia) erros.push("competencia obrigatória (AAAA-MM)");
        if (erros.length) return reply.status(400).send({ error: { message: erros.join("; ") } });

        const cfg = db.nfseConfig || {};
        const cnpjPrestador = body.cnpjPrestador || (db.fiscalCnpjs?.[0]?.cnpj) || "";

        const aliquota = Number(body.aliquotaIss ?? cfg.aliquotaIssDefault ?? 5);
        const retencao = Boolean(body.retencaoIss ?? cfg.retencaoIss ?? false);
        const impostos = calcularImpostos(body.valorServico, aliquota, retencao);

        const numeroRps = proximoNumeroRps();
        const id = `NFSE-${randomUUID().slice(0, 8).toUpperCase()}`;
        const now = new Date().toISOString();

        // Simula transmissão para prefeitura
        const ambiente = cfg.ambiente || "HOMOLOGACAO";
        const codigoVerificacao = gerarCodigoVerificacao();
        const numeroNfse = ambiente === "PRODUCAO"
            ? String((db.nfseEmitidas.filter(e => e.ambiente === "PRODUCAO").length + 1)).padStart(10, "0")
            : `H${String(db.nfseEmitidas.filter(e => e.ambiente === "HOMOLOGACAO").length + 1).padStart(8, "0")}`;

        const doc = {
            id,
            numeroNfse,
            numeroRps,
            serieRps: cfg.serieRps || "A",
            codigoVerificacao,
            status: "AUTORIZADA",
            ambiente,
            cnpjPrestador: limparCnpj(cnpjPrestador),
            cnpjTomador: limparCnpj(body.cnpjTomador || ""),
            cpfTomador: limparCnpj(body.cpfTomador || ""),
            nomeTomador: body.nomeTomador,
            emailTomador: body.emailTomador || "",
            telefoneTomador: body.telefoneTomador || "",
            logradouroTomador: body.logradouroTomador || "",
            municipioTomador: body.municipioTomador || "",
            ufTomador: body.ufTomador || "",
            descricaoServico: body.descricaoServico,
            codigoServico: body.codigoServico,
            cnaeServico: body.cnaeServico || "",
            municipioServico: body.municipioServico || cfg.municipioEmissor || "",
            codigoMunicipio: body.codigoMunicipio || cfg.codigoMunicipio || "",
            valorServico: Number(body.valorServico),
            ...impostos,
            deducoes: Number(body.deducoes || 0),
            competencia: body.competencia,
            dataEmissao: now.slice(0, 10),
            observacoes: body.observacoes || "",
            protocoloAutorizacao: `PROT-${Date.now()}`,
            xmlHash: hashTexto(`${id}${numeroNfse}${body.valorServico}`),
            criadoPor: usuario,
            criadoEm: now,
            atualizadoEm: now,
        };

        // Se tomador informado, atualizar cadastro de tomadores
        if (body.salvarTomador && (body.cnpjTomador || body.cpfTomador)) {
            const tomKey = limparCnpj(body.cnpjTomador || body.cpfTomador);
            const existeTomador = db.nfseTomadores.some(t => limparCnpj(t.cnpjCpf) === tomKey);
            if (!existeTomador) {
                db.nfseTomadores.push({
                    id: nextId("TOM", db.nfseTomadores.length),
                    tipo: body.cnpjTomador ? "PJ" : "PF",
                    cnpjCpf: tomKey,
                    nome: body.nomeTomador,
                    email: body.emailTomador || "",
                    telefone: body.telefoneTomador || "",
                    logradouro: body.logradouroTomador || "",
                    municipio: body.municipioTomador || "",
                    uf: body.ufTomador || "",
                    criadoEm: now,
                });
            }
        }

        db.nfseEmitidas.unshift(doc);

        registrarLog({
            acao: "EMITIR_NFSE", entidade: "nfseEmitidas", entidadeId: id,
            usuario, ip, detalhe: { numeroNfse, nomeTomador: doc.nomeTomador, valorServico: doc.valorServico },
        });

        // Persist to Oracle if enabled
        if (isOracleEnabled()) {
            const sql = `INSERT INTO NFS_EMITIDAS (
                ID, NUMERO_NFSE, NUMERO_RPS, SERIE_RPS, CODIGO_VERIFICACAO, STATUS, AMBIENTE,
                CNPJ_PRESTADOR, CNPJ_TOMADOR, CPF_TOMADOR, NOME_TOMADOR, EMAIL_TOMADOR,
                DESCRICAO_SERVICO, CODIGO_SERVICO, CNAE_SERVICO,
                VALOR_SERVICO, ALIQUOTA_ISS, VALOR_ISS, RETENCAO_ISS, BASE_CALCULO, VALOR_LIQUIDO,
                COMPETENCIA, DATA_EMISSAO, PROTOCOLO_AUTORIZACAO, XML_HASH, CRIADO_POR
            ) VALUES (
                :1,:2,:3,:4,:5,:6,:7,:8,:9,:10,:11,:12,:13,:14,:15,
                :16,:17,:18,:19,:20,:21,:22,TO_DATE(:23,'YYYY-MM-DD'),:24,:25,:26
            )`;
            executeOracle(sql, [
                doc.id, doc.numeroNfse, doc.numeroRps, doc.serieRps, doc.codigoVerificacao,
                doc.status, doc.ambiente, doc.cnpjPrestador, doc.cnpjTomador, doc.cpfTomador,
                doc.nomeTomador, doc.emailTomador, doc.descricaoServico, doc.codigoServico,
                doc.cnaeServico, doc.valorServico, doc.aliquotaIss, doc.valorIss,
                doc.retencaoIss ? 1 : 0, doc.baseCalculo, doc.valorLiquido,
                doc.competencia, doc.dataEmissao, doc.protocoloAutorizacao, doc.xmlHash, usuario,
            ]).catch(e => app.log.warn({ e: e.message }, "nfse oracle insert failed"));
        }

        await persistirNfse();
        return reply.status(201).send(doc);
    });

    // Cancelar NFS-e
    app.post("/api/fiscal/nfse/emitidas/:id/cancelar", async (req, reply) => {
        initDb();
        const doc = db.nfseEmitidas.find(d => d.id === req.params.id);
        if (!doc) return reply.status(404).send({ error: { message: "NFS-e não encontrada" } });
        if (doc.status === "CANCELADA") return reply.status(400).send({ error: { message: "NFS-e já cancelada" } });

        const motivo = req.body?.motivo || "Cancelamento solicitado pelo usuário";
        doc.status = "CANCELADA";
        doc.motivoCancelamento = motivo;
        doc.atualizadoEm = new Date().toISOString();

        registrarLog({
            acao: "CANCELAR_NFSE", entidade: "nfseEmitidas", entidadeId: doc.id,
            usuario: getUsuario(req), ip: getIp(req), detalhe: { motivo },
        });

        await persistirNfse();
        const { xmlConteudo, ...safe } = doc;
        return reply.send(safe);
    });

    // Download XML (hash only - conteúdo protegido)
    app.get("/api/fiscal/nfse/emitidas/:id/xml-info", async (req, reply) => {
        initDb();
        const doc = db.nfseEmitidas.find(d => d.id === req.params.id);
        if (!doc) return reply.status(404).send({ error: { message: "NFS-e não encontrada" } });

        registrarLog({
            acao: "ACESSO_XML_NFSE", entidade: "nfseEmitidas", entidadeId: doc.id,
            usuario: getUsuario(req), ip: getIp(req),
        });

        return reply.send({
            id: doc.id,
            numeroNfse: doc.numeroNfse,
            xmlHash: doc.xmlHash,
            disponivel: Boolean(doc.xmlConteudo || doc.xmlHash),
            aviso: "Conteúdo XML protegido. Disponível apenas via exportação segura auditada.",
        });
    });

    // ===========================================================
    // NFS-e TOMADAS (RECEBIDAS)
    // ===========================================================
    app.get("/api/fiscal/nfse/tomadas", async (req, reply) => {
        initDb();
        const q = req.query;
        let docs = [...db.nfseTomadas];

        if (q.status) docs = docs.filter(d => d.status === q.status);
        if (q.cnpjPrestador) {
            const c = limparCnpj(q.cnpjPrestador);
            docs = docs.filter(d => limparCnpj(d.cnpjPrestador).includes(c));
        }
        if (q.competencia) docs = docs.filter(d => (d.competencia || "").startsWith(q.competencia));
        if (q.dataInicio) docs = docs.filter(d => (d.dataEmissao || "") >= q.dataInicio);
        if (q.dataFim) docs = docs.filter(d => (d.dataEmissao || "") <= q.dataFim + "T23:59:59");
        if (q.busca) {
            const bRaw = q.busca.replace(/[%_]/g, "").toLowerCase().trim();
            const b = bRaw.replace(/\D/g, "") || bRaw;
            const chaveDigits = q.busca.replace(/\D/g, "");
            docs = docs.filter(d =>
                (d.nomePrestador || "").toLowerCase().includes(bRaw) ||
                (d.numeroNfse || "").toLowerCase().includes(bRaw) ||
                (d.descricaoServico || "").toLowerCase().includes(bRaw) ||
                limparCnpj(d.cnpjPrestador || "").includes(b) ||
                limparCnpj(d.cnpjTomador || "").includes(b) ||
                (chaveDigits.length >= 6 && (d.chaveAcesso || "").includes(chaveDigits))
            );
        }
        if (q.conciliado !== undefined) {
            const conc = q.conciliado === "true" || q.conciliado === "1";
            docs = docs.filter(d => Boolean(d.conciliado) === conc);
        }
        if (q.winthor === "nao") docs = docs.filter(d => d.constaWinthor === false);
        else if (q.winthor === "sim") docs = docs.filter(d => d.constaWinthor === true);
        else if (q.winthor === "pendente") docs = docs.filter(d => d.constaWinthor == null);
        if (q.codfilial) docs = docs.filter(d => String(d.codFilial ?? "").trim() === String(q.codfilial).trim());

        docs.sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""));

        return reply.send(paginar(docs, q.page, q.pageSize));
    });

    app.post("/api/fiscal/nfse/tomadas", async (req, reply) => {
        initDb();
        const body = req.body || {};
        if (!body.cnpjPrestador) return reply.status(400).send({ error: { message: "cnpjPrestador obrigatório" } });
        if (!body.nomePrestador) return reply.status(400).send({ error: { message: "nomePrestador obrigatório" } });

        const now = new Date().toISOString();
        const doc = {
            id: nextId("NFSET", db.nfseTomadas.length),
            numeroNfse: body.numeroNfse || "",
            cnpjPrestador: limparCnpj(body.cnpjPrestador),
            nomePrestador: body.nomePrestador,
            cnpjTomador: limparCnpj(body.cnpjTomador || ""),
            descricaoServico: body.descricaoServico || "",
            codigoServico: body.codigoServico || "",
            valorServico: Number(body.valorServico || 0),
            valorIss: Number(body.valorIss || 0),
            aliquotaIss: Number(body.aliquotaIss || 0),
            municipio: body.municipio || "",
            competencia: body.competencia || now.slice(0, 7),
            dataEmissao: body.dataEmissao || now.slice(0, 10),
            status: body.status || "ATIVA",
            origem: body.origem || "MANUAL",
            conciliado: false,
            criadoEm: now,
            atualizadoEm: now,
        };
        db.nfseTomadas.unshift(doc);
        await persistirNfse();
        return reply.status(201).send(doc);
    });

    // ===========================================================
    // SINCRONIZAÇÃO ADN — AMBIENTE DE DADOS NACIONAIS (Gov.br)
    // GET https://adn.nfse.gov.br/contribuintes/DFe/{ultimoNSU}
    // Autenticação: mTLS com certificado A1 ICP-Brasil (PKCS#12)
    // ===========================================================
    function getActiveCertForMtls() {
        const cert = (db.fiscalCertificados || []).find(c => c.status === "ATIVO" && c._pfxB64);
        if (!cert) return null;
        const pfxBuffer = Buffer.from(cert._pfxB64, "base64");
        const passphrase = cert._senhaB64 ? Buffer.from(cert._senhaB64, "base64").toString("utf8") : "";
        // Usa node-forge (pure JS) para converter PFX→PEM, evitando restrições do OpenSSL 3
        // em certificados com algoritmos legados (SHA-1 MAC, RC2-40-CBC etc.)
        const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString("binary"));
        const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, passphrase);
        const shroudedBags = (p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []);
        const plainBags = (p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []);
        const keyBag = shroudedBags[0] || plainBags[0];
        if (!keyBag) throw new Error("Chave privada não encontrada no certificado PFX");
        const certArr = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []);
        if (!certArr.length) throw new Error("Certificado público não encontrado no PFX");
        const x509 = certArr[0].cert;
        return {
            cert: forge.pki.certificateToPem(x509),
            key: forge.pki.privateKeyToPem(keyBag.key),
            cnpjBase: cert.cnpjBase || "",
            cnpjFull: (cert.cnpjBase || "").replace(/\D/g, ""),
        };
    }

    function xmlTagVal(xml, tag) {
        const m = xml.match(new RegExp(`<(?:[\\w]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w]+:)?${tag}>`, "i"));
        return m ? m[1].trim() : null;
    }
    function xmlSection(xml, tag) {
        const m = xml.match(new RegExp(`<(?:[\\w]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w]+:)?${tag}>`, "i"));
        return m ? m[1] : "";
    }

    app.post("/api/fiscal/nfse/tomadas/sincronizar-adn", async (req, reply) => {
        initDb();
        const usuario = getUsuario(req);
        const ip = getIp(req);
        const body = req.body || {};

        let certData;
        try {
            certData = getActiveCertForMtls();
        } catch (e) {
            app.log.error({ msg: "CERT_PARSE_ERRO", erro: e.message });
            return reply.send({ novos: 0, erroAdn: true, erro: e.message, mensagem: `Erro ao processar certificado: ${e.message}` });
        }
        if (!certData) {
            return reply.send({
                novos: 0,
                precisaCertificado: true,
                mensagem: "Nenhum certificado digital A1 ativo. Configure em Fiscal > Certificados para sincronizar com o Gov.br.",
            });
        }

        const cfg = db.nfseConfig || {};
        const ambiente = body.ambiente || cfg.ambiente || "PRODUCAO";
        const baseUrl = ambiente === "PRODUCAO"
            ? "https://adn.nfse.gov.br"
            : "https://adn.producaorestrita.nfse.gov.br";

        const agora = Date.now();

        // ── Construção da lista de CNPJs a consultar ─────────────────────────────
        // Se body.cnpjConsulta for fornecido, usar APENAS esse
        let listaCnpjs;
        if (body.cnpjConsulta) {
            listaCnpjs = [limparCnpj(body.cnpjConsulta)];
        } else {
            // Começa com o CNPJ do certificado (se for 14 dígitos)
            const cnpjCert = (certData.cnpjFull || certData.cnpjBase || "").replace(/\D/g, "");
            const set14 = new Set();
            if (cnpjCert.length === 14) set14.add(cnpjCert);
            // Adiciona todos os CNPJs de 14 dígitos cadastrados em fiscalCnpjs
            for (const c of (db.fiscalCnpjs || [])) {
                const limpo = limparCnpj(c.cnpj);
                if (limpo.length === 14) set14.add(limpo);
            }
            // Se nenhum CNPJ de 14 dígitos, tenta usar o certificado mesmo com menos dígitos
            if (set14.size === 0 && cnpjCert) set14.add(cnpjCert);
            listaCnpjs = [...set14];
        }

        const { request: httpsReq } = await import("node:https");
        const { gunzipSync } = await import("node:zlib");

        // ── Estado de NSU por CNPJ ────────────────────────────────────────────────
        if (!db.nfseAdnSyncState) db.nfseAdnSyncState = { ultimoNSU: 0 };
        if (!db.nfseAdnSyncState.porCnpj) db.nfseAdnSyncState.porCnpj = {};

        // ── Busca XML completo de um NSU específico via tipoNSU=NSU ─────────────
        async function fetchNsuCompleto(nsuDoc, cnpjLoop) {
            try {
                const nsuStr = String(nsuDoc).padStart(15, "0");
                const urlNsu = `${baseUrl}/contribuintes/DFe/${nsuStr}?cnpjConsulta=${cnpjLoop}&tipoNSU=NSU`;
                const resp = await new Promise((resolve, reject) => {
                    const opts = {
                        hostname: new URL(urlNsu).hostname,
                        path: new URL(urlNsu).pathname + new URL(urlNsu).search,
                        method: "GET",
                        cert: certData.cert,
                        key: certData.key,
                        headers: { Accept: "application/json" },
                        timeout: 20000,
                    };
                    const r = httpsReq(opts, res => {
                        const chunks = [];
                        res.on("data", c => chunks.push(c));
                        res.on("end", () => resolve({ status: res.statusCode, raw: Buffer.concat(chunks).toString("utf8") }));
                    });
                    r.on("error", reject);
                    r.on("timeout", () => { r.destroy(); reject(new Error("Timeout NSU")); });
                    r.end();
                });
                if (resp.status !== 200) return null;
                const parsed = JSON.parse(resp.raw);
                if (parsed?.Erros?.length) return null;
                const docs2 = parsed.LoteDFe || parsed.Notas || parsed.docs || [];
                const doc2 = Array.isArray(docs2) ? docs2[0] : null;
                const zipB64 = doc2?.ArquivoXml || parsed?.ArquivoXml || "";
                if (!zipB64) return null;
                const zipBuf = Buffer.from(zipB64, "base64");
                let xml2 = "";
                try { xml2 = gunzipSync(zipBuf).toString("utf8"); } catch { xml2 = zipBuf.toString("utf8"); }
                return xml2.length > 50 ? { xml: xml2, doc: doc2 || {} } : null;
            } catch (e) {
                app.log.warn({ msg: "FETCH_NSU_COMPLETO_FAIL", nsu: nsuDoc, erro: e.message });
                return null;
            }
        }

        // ── Função auxiliar: processar docs XML de um lote ADN ───────────────────
        async function processarLote(docs, now, cnpjLoopCtx) {
            let novosLote = 0;
            const errosLote = [];
            const forceUpdate = Boolean(body.forceUpdate);
            for (const doc of (Array.isArray(docs) ? docs : [])) {
                try {
                    const zipB64 = doc.ArquivoXml || doc.docZip || doc.xmlDocZip || doc.xml || "";
                    if (!zipB64) continue;

                    const nsuDoc = Number(doc.NSU || doc.nSU || doc.NSUDoc || 0);
                    const tipoDoc = (doc.TipoDocumento || doc.tipoDocumento || "").toUpperCase();

                    // Para docs tipo "Res" (resumo), tenta buscar XML completo via tipoNSU=NSU
                    const isResumo = tipoDoc === "RES" || tipoDoc === "RESUMO" || tipoDoc === "SUM" ||
                        (tipoDoc && tipoDoc !== "NFSE" && tipoDoc !== "PROC" && !tipoDoc.includes("NFSe") && !tipoDoc.includes("NFSE"));
                    let xmlFull = null;
                    if (isResumo && nsuDoc > 0 && cnpjLoopCtx) {
                        app.log.info({ msg: "ADN_RES_FETCH_NSU", nsu: nsuDoc, tipo: tipoDoc });
                        const fetched = await fetchNsuCompleto(nsuDoc, cnpjLoopCtx);
                        if (fetched) {
                            xmlFull = fetched.xml;
                        } else {
                            // Não conseguiu XML completo para este resumo — pular
                            app.log.info({ msg: "ADN_RES_SEM_XML", nsu: nsuDoc });
                            continue;
                        }
                    } else if (isResumo) {
                        app.log.info({ msg: "ADN_DOC_SKIP", nsu: nsuDoc, tipo: tipoDoc });
                        continue;
                    }

                    const zipBuf = Buffer.from(zipB64, "base64");
                    let xml = xmlFull || "";
                    if (!xml) {
                        try { xml = gunzipSync(zipBuf).toString("utf8"); } catch { xml = zipBuf.toString("utf8"); }
                    }

                    // Dedup por NSU
                    const existente = nsuDoc > 0 ? db.nfseTomadas.find(t => t.nsuAdn === nsuDoc) : null;
                    if (existente && !forceUpdate) continue;

                    // Se o XML não contém dados NFS-e reconhecíveis, pula (pode ser evento de cancelamento ou resumo)
                    const temDadosNfse = xml.includes("nNFSe") || xml.includes("NumNFSe") || xml.includes("NFSe") ||
                                        xml.includes("CNPJ") || xml.includes("cnpj") || xml.includes("prest");
                    if (!temDadosNfse) {
                        app.log.info({ msg: "ADN_XML_SEM_DADOS", nsu: nsuDoc, xmlLen: xml.length, sample: xml.slice(0, 100) });
                        continue;
                    }

                    const nNFSe = xmlTagVal(xml, "nNFSe") || xmlTagVal(xml, "NumNFSe") || "";
                    const dhEmi = (xmlTagVal(xml, "dhEmi") || xmlTagVal(xml, "dCompet") || now).slice(0, 10);

                    const prestSection = xmlSection(xml, "emit") || xmlSection(xml, "prest") || xmlSection(xml, "prestador") || xmlSection(xml, "Prest");
                    const cnpjPrest = limparCnpj(xmlTagVal(prestSection, "CNPJ") || xmlTagVal(xml, "CNPJ") || xmlTagVal(xml, "cnpjPrestador") || "");
                    const nomePrest = xmlTagVal(prestSection, "xNome") || xmlTagVal(prestSection, "xFant") || xmlTagVal(xml, "nomePrestador") || xmlTagVal(xml, "xNome") || "";

                    // Se não conseguiu extrair CNPJ do prestador, tenta pela chave de acesso (posições 8-21)
                    const chaveDoc = doc.ChaveAcesso || doc.chave || doc.chaveAcesso || "";
                    const cnpjPrestFinal = cnpjPrest || (chaveDoc.length >= 21 ? chaveDoc.replace(/\D/g,"").slice(7, 21) : "");

                    // Se mesmo assim não tem CNPJ nem número NFS-e, é provavelmente um documento sem dados úteis
                    if (!cnpjPrestFinal && !nNFSe) {
                        app.log.info({ msg: "ADN_DOC_SEM_CNPJ_E_NFSE", nsu: nsuDoc, tipo: tipoDoc });
                        continue;
                    }

                    const tomaSection = xmlSection(xml, "toma") || xmlSection(xml, "tomador") || xmlSection(xml, "dest") || xmlSection(xml, "Toma");
                    const cnpjToma = limparCnpj(xmlTagVal(tomaSection, "CNPJ") || xmlTagVal(xml, "cnpjTomador") || "");

                    const descServ = xmlTagVal(xml, "xDescServ") || xmlTagVal(xml, "infoCompl")?.trim() || "";

                    const vServPrestSec = xmlSection(xml, "vServPrest") || xmlSection(xml, "ValServico");
                    const vServico = Number(
                        xmlTagVal(vServPrestSec, "vServ") ||
                        xmlTagVal(xml, "vReceb") ||
                        xmlTagVal(xml, "vTotServico") ||
                        xmlTagVal(xml, "vLiq") ||
                        xmlTagVal(xml, "vServ") ||
                        0
                    );
                    const vISS = Number(xmlTagVal(xml, "vISSQN") || xmlTagVal(xml, "vISS") || xmlTagVal(xml, "vTotalRet") || 0);

                    if (existente && forceUpdate) {
                        existente.numeroNfse = nNFSe || existente.numeroNfse;
                        existente.cnpjPrestador = cnpjPrest || existente.cnpjPrestador;
                        existente.nomePrestador = nomePrest || existente.nomePrestador;
                        existente.cnpjTomador = cnpjToma || existente.cnpjTomador;
                        existente.descricaoServico = descServ || existente.descricaoServico;
                        existente.valorServico = vServico || existente.valorServico;
                        existente.valorIss = vISS;
                        existente.aliquotaIss = vServico > 0 && vISS > 0 ? parseFloat((vISS / vServico * 100).toFixed(4)) : existente.aliquotaIss;
                        existente.dataEmissao = dhEmi || existente.dataEmissao;
                        existente.competencia = dhEmi ? dhEmi.slice(0, 7) : existente.competencia;
                        existente.atualizadoEm = now;
                        novosLote++;
                        continue;
                    }

                    if (!vServico || vServico === 0) continue;
                    db.nfseTomadas.unshift({
                        id: nextId("NFSET", db.nfseTomadas.length + novosLote),
                        numeroNfse: nNFSe,
                        cnpjPrestador: cnpjPrestFinal,
                        nomePrestador: nomePrest,
                        cnpjTomador: cnpjToma,
                        descricaoServico: descServ,
                        valorServico: vServico,
                        valorIss: vISS,
                        aliquotaIss: vServico > 0 && vISS > 0 ? parseFloat((vISS / vServico * 100).toFixed(4)) : 0,
                        competencia: dhEmi.slice(0, 7),
                        dataEmissao: dhEmi,
                        status: "ATIVA",
                        origem: "ADN_NACIONAL",
                        nsuAdn: nsuDoc,
                        chaveAcesso: chaveDoc || null,
                        tipoDocumento: tipoDoc || "NFSE",
                        dataHoraGeracao: doc.DataHoraGeracao || null,
                        conciliado: false,
                        constaWinthor: null,
                        criadoEm: now,
                        atualizadoEm: now,
                    });
                    novosLote++;
                } catch (e) { errosLote.push(e.message); }
            }
            return { novosLote, errosLote };
        }

        // ── Loop por CNPJ ─────────────────────────────────────────────────────────
        let novosTotal = 0;
        const errosTotal = [];
        const resultadosPorCnpj = [];
        const cnpjsConsultados = [];
        const now = new Date().toISOString();

        for (const cnpjLoop of listaCnpjs) {
            const estadoCnpj = db.nfseAdnSyncState.porCnpj[cnpjLoop] || { ultimoNSU: 0 };

            // Rate-limit por CNPJ: pular em cooldown (salvo se forcar ou resetarNSU)
            if (!body.forcar && !body.resetarNSU && estadoCnpj.noMoreDocs && estadoCnpj.noMoreDocsAt) {
                const elapsed = agora - estadoCnpj.noMoreDocsAt;
                if (elapsed < 3600000) {
                    app.log.info({ msg: "ADN_CNPJ_COOLDOWN", cnpj: cnpjLoop, min: Math.ceil((3600000 - elapsed) / 60000) });
                    resultadosPorCnpj.push({ cnpj: cnpjLoop, novos: 0, erros: 0, cooldown: true });
                    continue;
                }
            }

            const ultimoNSUCnpj = body.resetarNSU ? 0 : (estadoCnpj.ultimoNSU || 0);
            const nsuStr = String(ultimoNSUCnpj).padStart(15, "0");
            const urlTarget = new URL(`${baseUrl}/contribuintes/DFe/${nsuStr}`);
            urlTarget.searchParams.set("cnpjConsulta", cnpjLoop);
            urlTarget.searchParams.set("tipoNSU", "DISTRIBUICAO");
            urlTarget.searchParams.set("lote", "true");

            app.log.info({ msg: "ADN_SYNC_CNPJ_START", cnpj: cnpjLoop, ultimoNSU: ultimoNSUCnpj, url: urlTarget.href });
            cnpjsConsultados.push(cnpjLoop);

            let adnData;
            try {
                adnData = await new Promise((resolve, reject) => {
                    const options = {
                        hostname: urlTarget.hostname,
                        path: urlTarget.pathname + urlTarget.search,
                        method: "GET",
                        cert: certData.cert,
                        key: certData.key,
                        headers: { Accept: "application/json" },
                        timeout: 30000,
                    };
                    const r = httpsReq(options, res => {
                        const chunks = [];
                        res.on("data", c => chunks.push(c));
                        res.on("end", () => {
                            const raw = Buffer.concat(chunks).toString("utf8");
                            app.log.info({ msg: "ADN_RAW_STATUS", cnpj: cnpjLoop, statusCode: res.statusCode, bodyLen: raw.length, bodySample: raw.slice(0, 800) });
                            if (res.statusCode !== 200 && res.statusCode !== 404 && res.statusCode !== 400) { reject(new Error(`ADN HTTP ${res.statusCode}: ${raw.slice(0, 400)}`)); return; }
                            try {
                                const parsed = JSON.parse(raw);
                                parsed._httpStatus = res.statusCode;
                                resolve(parsed);
                            } catch {
                                app.log.warn({ msg: "ADN_NAO_JSON", cnpj: cnpjLoop, body: raw.slice(0, 500) });
                                resolve({ _rawNaoJson: raw.slice(0, 1000), _httpStatus: res.statusCode });
                            }
                        });
                    });
                    r.on("error", reject);
                    r.on("timeout", () => { r.destroy(); reject(new Error("Timeout ADN (30s)")); });
                    r.end();
                });
            } catch (e) {
                app.log.error({ msg: "SYNC_ADN_CNPJ_ERRO", cnpj: cnpjLoop, erro: e.message });
                errosTotal.push(`CNPJ ${cnpjLoop}: ${e.message}`);
                resultadosPorCnpj.push({ cnpj: cnpjLoop, novos: 0, erros: 1, erro: e.message });
                continue;
            }

            // Verifica erros estruturados do ADN
            const adnErros = adnData.Erros || adnData.erros || [];
            const erroE2220 = adnErros.find(e => (e.Codigo || e.codigo) === "E2220");
            const erroE2243 = adnErros.find(e => (e.Codigo || e.codigo) === "E2243");

            // Log completo do que o ADN retornou para diagnóstico
            app.log.info({ msg: "ADN_RESPOSTA", cnpj: cnpjLoop, httpStatus: adnData._httpStatus, erros: adnErros.length, erroE2220: !!erroE2220, erroE2243: !!erroE2243, chaves: Object.keys(adnData).filter(k => k !== "_rawNaoJson").slice(0, 15) });

            if (erroE2220) {
                // IMPORTANTE: preserva o ultimoNSU atual — NÃO reseta para 0.
                // E2220 pode significar "nenhum doc novo desde este NSU" (situação normal após sincronização completa)
                // OU "CNPJ não inscrito". Em ambos os casos, resetar NSU é errado:
                // causaria re-download de todos os documentos anteriores na próxima sync.
                const nsuAtual = estadoCnpj.ultimoNSU || 0;
                db.nfseAdnSyncState.porCnpj[cnpjLoop] = { ultimoNSU: nsuAtual, maxNSU: estadoCnpj.maxNSU || 0, ultimaSync: now, noMoreDocs: true, noMoreDocsAt: agora };
                resultadosPorCnpj.push({ cnpj: cnpjLoop, novos: 0, erros: 0, semMaisDocumentos: true, e2220: true, ultimoNSU: nsuAtual });
                continue;
            }
            if (erroE2243) {
                errosTotal.push(`CNPJ ${cnpjLoop}: ${erroE2243.Descricao || erroE2243.descricao}`);
                resultadosPorCnpj.push({ cnpj: cnpjLoop, novos: 0, erros: 1, erro: erroE2243.Descricao || erroE2243.descricao });
                continue;
            }

            // Extrai documentos do lote — ADN retorna em várias estruturas possíveis
            let docs = adnData.LoteDFe || adnData.Notas || adnData.notas || adnData.docs || [];
            // Fallback: loteDistDFe (padrão SPED NF-e antigo adaptado para NFS-e)
            if (!Array.isArray(docs) || docs.length === 0) {
                const lote = adnData.loteDistDFe || adnData.retDistDFeInt?.loteDistDFeInt || {};
                const docZip = lote.docZip || lote.DocZip;
                if (Array.isArray(docZip)) docs = docZip;
                else if (docZip) docs = [docZip]; // objeto único → array
            }
            // Fallback: raiz com ArquivoXml único
            if ((!Array.isArray(docs) || docs.length === 0) && adnData.ArquivoXml) {
                docs = [{ ArquivoXml: adnData.ArquivoXml, NSU: adnData.NSU || adnData.nSU || 0, TipoDocumento: adnData.TipoDocumento || "NFSE" }];
            }
            app.log.info({ msg: "ADN_DOCS", cnpj: cnpjLoop, qtd: Array.isArray(docs) ? docs.length : 0 });
            const { novosLote, errosLote } = await processarLote(docs, now, cnpjLoop);
            novosTotal += novosLote;
            errosTotal.push(...errosLote);

            // Atualiza NSU do CNPJ
            const nsusLote = (Array.isArray(docs) ? docs : []).map(d => Number(d.NSU || d.nSU || d.NSUDoc || 0)).filter(n => n > 0);
            const ultNsuRetornado = Number(adnData.ultNSU || adnData.ultimoNSU || adnData.retDistDFeInt?.ultNSU || 0);
            const novoNSU = nsusLote.length > 0 ? Math.max(...nsusLote) : (ultNsuRetornado || ultimoNSUCnpj);
            const maxNsuRetornado = Number(adnData.maxNSU || adnData.nsuMax || adnData.retDistDFeInt?.maxNSU || 0);
            // Só considera "sem mais docs" quando o ADN explicitamente retornou maxNSU E chegamos nele
            // Se o lote voltou < 50 docs MAS sem maxNSU, deixamos semMais=false para tentar de novo
            const semMais = maxNsuRetornado > 0 && novoNSU >= maxNsuRetornado;
            db.nfseAdnSyncState.porCnpj[cnpjLoop] = {
                ultimoNSU: novoNSU,
                maxNSU: maxNsuRetornado,
                ultimaSync: now,
                noMoreDocs: semMais,
                noMoreDocsAt: semMais ? agora : (estadoCnpj.noMoreDocsAt || null),
            };
            app.log.info({ msg: "ADN_NSU_UPDATE", cnpj: cnpjLoop, ultimoNSU: novoNSU, maxNSU: maxNsuRetornado, semMais, novos: novosLote });
            resultadosPorCnpj.push({ cnpj: cnpjLoop, novos: novosLote, erros: errosLote.length, ultimoNSU: novoNSU, maxNSU: maxNsuRetornado });
        }

        // Compatibilidade legada: manter ultimoNSU global como máximo entre todos os CNPJs
        const nsuGlobal = Math.max(...Object.values(db.nfseAdnSyncState.porCnpj).map(s => s.ultimoNSU || 0), 0);
        db.nfseAdnSyncState.ultimoNSU = nsuGlobal;
        db.nfseAdnSyncState.ultimaSync = now;

        registrarLog({ acao: "SYNC_ADN_OK", entidade: "nfseTomadas", entidadeId: "sync", usuario, ip, detalhe: { novos: novosTotal, cnpjsConsultados, erros: errosTotal.length } });
        if (novosTotal > 0) await persistirNfse();

        const semMaisGlobal = resultadosPorCnpj.length > 0 && resultadosPorCnpj.every(r => r.semMaisDocumentos || r.cooldown);
        return reply.send({
            novos: novosTotal,
            ultimoNSU: nsuGlobal,
            cnpjsConsultados,
            resultadosPorCnpj,
            semMaisDocumentos: semMaisGlobal,
            erros: errosTotal.slice(0, 5),
            mensagem: novosTotal > 0
                ? `${novosTotal} NFS-e(s) tomadas importadas do ambiente nacional Gov.br.`
                : semMaisGlobal
                    ? "Sincronizado. Nenhuma nota nova no ambiente nacional."
                    : cnpjsConsultados.length === 0
                        ? "Todos os CNPJs estão em cooldown (1h). Use 'Forçar' ou aguarde."
                        : "Nenhum documento retornado. Verifique se o certificado está autorizado no ADN.",
        });
    });

    // ── Utilitário: faz requisição HTTPS genérica (com ou sem cert mTLS) ─────────
    async function httpsGet({ url, cert, key, method = "GET", body: reqBody, headers: extraHeaders = {}, timeoutMs = 20000 }) {
        const { request: httpsReq } = await import("node:https");
        return new Promise((resolve, reject) => {
            const parsed = new URL(url);
            const opts = {
                hostname: parsed.hostname,
                path: parsed.pathname + parsed.search,
                method,
                headers: { Accept: "application/json, application/xml, */*", ...extraHeaders },
                timeout: timeoutMs,
                rejectUnauthorized: false, // portal gov.br pode usar cert intermediário
            };
            if (cert) opts.cert = cert;
            if (key) opts.key = key;
            if (reqBody) opts.headers["Content-Type"] = "application/json";
            const r = httpsReq(opts, res => {
                const chunks = [];
                res.on("data", c => chunks.push(c));
                res.on("end", () => {
                    const raw = Buffer.concat(chunks).toString("utf8");
                    resolve({ status: res.statusCode, raw, headers: res.headers });
                });
            });
            r.on("error", reject);
            r.on("timeout", () => { r.destroy(); reject(new Error(`Timeout ${timeoutMs}ms`)); });
            if (reqBody) r.write(JSON.stringify(reqBody));
            r.end();
        });
    }

    // ── Decodifica campos básicos da chave de acesso NFS-e Nacional (50 dígitos) ─
    function decodificarChaveNfse(chave) {
        const c = chave.replace(/\D/g, "");
        if (c.length < 44) return {};
        return {
            cMun: c.slice(0, 7),
            cnpjPrestador: c.slice(7, 21),   // 14 dígitos (posições 8-21)
            cSerie: c.slice(21, 26),          // 5 dígitos
            nNFSe: c.slice(26, 41).replace(/^0+/, "") || "0", // 15 dígitos
            cHash: c.slice(41),              // restante (hash)
        };
    }

    // Buscar NFS-e específica pela chave de acesso — tenta ADN + portal público + adesão automática
    app.post("/api/fiscal/nfse/tomadas/buscar-por-chave", async (req, reply) => {
        initDb();
        const usuario = getUsuario(req);
        const ip = getIp(req);
        const body = req.body || {};

        const chave = (body.chaveAcesso || "").replace(/\s/g, "").trim();
        if (!chave || chave.length < 40) {
            return reply.status(400).send({ error: { message: "Chave de acesso inválida (mínimo 40 caracteres)." } });
        }

        const existente = db.nfseTomadas.find(t => t.chaveAcesso === chave);
        if (existente) {
            return reply.send({ encontrado: true, importado: false, duplicado: true, id: existente.id, mensagem: "Nota já cadastrada no sistema." });
        }

        let certData;
        try { certData = getActiveCertForMtls(); } catch (e) {
            return reply.status(400).send({ error: { message: `Erro no certificado: ${e.message}` } });
        }
        if (!certData) {
            return reply.status(400).send({ error: { message: "Nenhum certificado A1 ativo configurado em Fiscal > Certificados." } });
        }

        let cnpjConsulta = (body.cnpjConsulta || "").replace(/\D/g, "");
        if (!cnpjConsulta) {
            const primeiro14 = (db.fiscalCnpjs || []).map(c => limparCnpj(c.cnpj)).find(c => c.length === 14);
            cnpjConsulta = primeiro14 || (certData.cnpjFull || certData.cnpjBase || "").replace(/\D/g, "");
        }

        const { gunzipSync } = await import("node:zlib");
        const adnBase = "https://adn.nfse.gov.br";
        const now = new Date().toISOString();

        const decoded = decodificarChaveNfse(chave);
        const cnpjPrestDecoded = decoded.cnpjPrestador || "";
        const nNFSeDecoded = decoded.nNFSe || "";

        app.log.info({ msg: "BUSCA_CHAVE_START", chave, cnpjConsulta, decoded });

        // ── Fase 1: Tentativas no ADN com mTLS (múltiplos padrões de endpoint) ──
        const adnUrls = [
            { url: `${adnBase}/contribuintes/DFe/${chave}?cnpjConsulta=${cnpjConsulta}&tipoNSU=CHAVE`, label: "ADN_CHAVE_NSU" },
            { url: `${adnBase}/contribuintes/DFe/${chave}?cnpjConsulta=${cnpjConsulta}&tipoNSU=CHAVE_ACESSO`, label: "ADN_CHAVE_ACESSO" },
            { url: `${adnBase}/contribuintes/nfse/${chave}?cnpjConsulta=${cnpjConsulta}`, label: "ADN_NFSE_CHAVE" },
            { url: `${adnBase}/contribuintes/nfse/${chave}?cnpjSolicitante=${cnpjConsulta}`, label: "ADN_NFSE_SOLICITANTE" },
            { url: `${adnBase}/contribuintes/nfse/consultar?chaveAcesso=${chave}&cnpjConsulta=${cnpjConsulta}`, label: "ADN_CONSULTAR_CHAVE" },
            { url: `${adnBase}/nfse/${chave}`, label: "ADN_PUBLICO" },
        ];

        let xmlEncontrado = null;
        let faseEncontrada = null;
        let diagnostico = [];

        for (const { url, label } of adnUrls) {
            try {
                const resp = await httpsGet({ url, cert: certData.cert, key: certData.key, timeoutMs: 15000 });
                app.log.info({ msg: label, status: resp.status, body: resp.raw.slice(0, 400) });
                diagnostico.push({ label, status: resp.status });
                if (resp.status >= 400) continue;

                let payload;
                try { payload = JSON.parse(resp.raw); } catch { payload = null; }

                if (payload?.Erros?.find(e => e.Codigo === "E2220")) continue;

                // Tenta extrair XML do payload
                const loteDocs = payload?.LoteDFe || payload?.Notas || payload?.docs || [];
                const docItem = Array.isArray(loteDocs) ? loteDocs[0] : null;
                const zipB64 = docItem?.ArquivoXml || payload?.ArquivoXml || payload?.docZip || "";
                let xmlTentativa = payload?._rawXml || "";
                if (!xmlTentativa && zipB64) {
                    const zipBuf = Buffer.from(zipB64, "base64");
                    try { xmlTentativa = gunzipSync(zipBuf).toString("utf8"); } catch { xmlTentativa = zipBuf.toString("utf8"); }
                }
                if (!xmlTentativa && resp.raw.includes("<NFSe") || resp.raw.includes("<nNFSe")) {
                    xmlTentativa = resp.raw;
                }
                if (xmlTentativa && xmlTentativa.length > 50) {
                    xmlEncontrado = xmlTentativa;
                    faseEncontrada = label;
                    break;
                }
            } catch (e) {
                diagnostico.push({ label, erro: e.message });
                app.log.warn({ msg: label + "_FAIL", erro: e.message });
            }
        }

        // ── Fase 2: Tentativas no portal público NFSe.gov.br (sem cert) ──────────
        if (!xmlEncontrado) {
            const portalUrls = [
                { url: `https://www.nfse.gov.br/api/nfse/${chave}`, label: "PORTAL_V1" },
                { url: `https://www.nfse.gov.br/api/v1/nfse/${chave}`, label: "PORTAL_API_V1" },
                { url: `https://api.nfse.gov.br/v1/nfse/${chave}`, label: "PORTAL_API2" },
                { url: `https://www.nfse.gov.br/ConsultarNfse/ConsultarNfse?chave=${chave}`, label: "PORTAL_CONSULTAR" },
            ];
            for (const { url, label } of portalUrls) {
                try {
                    const resp = await httpsGet({ url, timeoutMs: 12000 }); // sem cert
                    app.log.info({ msg: label, status: resp.status, body: resp.raw.slice(0, 400) });
                    diagnostico.push({ label, status: resp.status });
                    if (resp.status >= 400) continue;
                    let xmlTentativa = "";
                    if (resp.raw.includes("<NFSe") || resp.raw.includes("<nNFSe")) {
                        xmlTentativa = resp.raw;
                    } else {
                        try {
                            const p = JSON.parse(resp.raw);
                            const zipB64 = p?.ArquivoXml || p?.xml || "";
                            if (zipB64) { try { xmlTentativa = gunzipSync(Buffer.from(zipB64, "base64")).toString("utf8"); } catch { xmlTentativa = Buffer.from(zipB64, "base64").toString("utf8"); } }
                        } catch {}
                    }
                    if (xmlTentativa && xmlTentativa.length > 50) {
                        xmlEncontrado = xmlTentativa;
                        faseEncontrada = label;
                        break;
                    }
                } catch (e) {
                    diagnostico.push({ label, erro: e.message });
                }
            }
        }

        // ── Fase 3: Tenta ADN Swagger para descobrir endpoints reais ────────────
        if (!xmlEncontrado) {
            try {
                const swaggerResp = await httpsGet({ url: `${adnBase}/swagger/v1/swagger.json`, cert: certData.cert, key: certData.key, timeoutMs: 8000 });
                if (swaggerResp.status === 200) {
                    const sw = JSON.parse(swaggerResp.raw);
                    const paths = Object.keys(sw.paths || {});
                    app.log.info({ msg: "ADN_SWAGGER_PATHS", paths });
                    diagnostico.push({ label: "SWAGGER", paths: paths.slice(0, 20) });
                }
            } catch (e) { diagnostico.push({ label: "SWAGGER", erro: e.message }); }
        }

        app.log.info({ msg: "BUSCA_CHAVE_DIAG", diagnostico });

        if (!xmlEncontrado) {
            return reply.send({
                encontrado: false,
                diagnostico,
                cnpjPrestDecoded,
                nNFSeDecoded,
                mensagem: "Nota não localizada nos endpoints do ADN nem no portal NFSe.gov.br. " +
                    "A causa mais provável é que o CNPJ da filial tomadora não está inscrito no ADN para receber DFe. " +
                    "Use o botão 'Fazer Adesão ADN' para tentar inscrever a filial automaticamente, depois sincronize novamente.",
                precisaAdesao: true,
                cnpjParaAdesao: cnpjConsulta,
            });
        }

        // ── Extrai e salva a nota ────────────────────────────────────────────────
        const nNFSe = xmlTagVal(xmlEncontrado, "nNFSe") || xmlTagVal(xmlEncontrado, "NumNFSe") || nNFSeDecoded || "";
        const dhEmi = (xmlTagVal(xmlEncontrado, "dhEmi") || xmlTagVal(xmlEncontrado, "dCompet") || now).slice(0, 10);
        const prestSection = xmlSection(xmlEncontrado, "emit") || xmlSection(xmlEncontrado, "prest") || xmlSection(xmlEncontrado, "prestador");
        const cnpjPrest = limparCnpj(xmlTagVal(prestSection, "CNPJ") || xmlTagVal(xmlEncontrado, "cnpjPrestador") || cnpjPrestDecoded || "");
        const nomePrest = xmlTagVal(prestSection, "xNome") || xmlTagVal(prestSection, "xFant") || xmlTagVal(xmlEncontrado, "nomePrestador") || "";
        const tomaSection = xmlSection(xmlEncontrado, "toma") || xmlSection(xmlEncontrado, "tomador") || xmlSection(xmlEncontrado, "dest");
        const cnpjToma = limparCnpj(xmlTagVal(tomaSection, "CNPJ") || xmlTagVal(xmlEncontrado, "cnpjTomador") || "");
        const descServ = xmlTagVal(xmlEncontrado, "xDescServ") || xmlTagVal(xmlEncontrado, "infoCompl")?.trim() || "";
        const vServPrestSec = xmlSection(xmlEncontrado, "vServPrest");
        const vServico = Number(xmlTagVal(vServPrestSec, "vServ") || xmlTagVal(xmlEncontrado, "vReceb") || xmlTagVal(xmlEncontrado, "vTotServico") || 0);
        const vISS = Number(xmlTagVal(xmlEncontrado, "vISSQN") || xmlTagVal(xmlEncontrado, "vISS") || 0);

        const novaId = nextId("NFSET", db.nfseTomadas.length);
        db.nfseTomadas.unshift({
            id: novaId, numeroNfse: nNFSe, cnpjPrestador: cnpjPrest, nomePrestador: nomePrest,
            cnpjTomador: cnpjToma, descricaoServico: descServ, valorServico: vServico, valorIss: vISS,
            aliquotaIss: vServico > 0 && vISS > 0 ? parseFloat((vISS / vServico * 100).toFixed(4)) : 0,
            competencia: dhEmi.slice(0, 7), dataEmissao: dhEmi, status: "ATIVA", origem: "ADN_NACIONAL",
            nsuAdn: 0, chaveAcesso: chave, tipoDocumento: "NFSE", dataHoraGeracao: now,
            conciliado: false, constaWinthor: null, criadoEm: now, atualizadoEm: now,
        });
        registrarLog({ acao: "BUSCA_CHAVE_OK", entidade: "nfseTomadas", entidadeId: novaId, usuario, ip, detalhe: { chave, faseEncontrada } });
        await persistirNfse();
        return reply.send({ encontrado: true, importado: true, id: novaId, faseEncontrada,
            mensagem: `NFS-e ${nNFSe || "—"} importada com sucesso (fonte: ${faseEncontrada}).` });
    });

    // ── Fazer adesão da filial no ADN Nacional (inscrição para receber DFe) ─────
    app.post("/api/fiscal/nfse/tomadas/fazer-adesao-adn", async (req, reply) => {
        initDb();
        const usuario = getUsuario(req);
        const ip = getIp(req);
        const body = req.body || {};

        let cnpjFilial = (body.cnpj || "").replace(/\D/g, "");
        if (cnpjFilial.length !== 14) {
            return reply.status(400).send({ error: { message: "CNPJ da filial deve ter 14 dígitos." } });
        }

        let certData;
        try { certData = getActiveCertForMtls(); } catch (e) {
            return reply.status(400).send({ error: { message: `Erro no certificado: ${e.message}` } });
        }
        if (!certData) return reply.status(400).send({ error: { message: "Nenhum certificado A1 ativo." } });

        const adnBase = "https://adn.nfse.gov.br";
        const tentativas = [];

        // Descobre endpoints de adesão via Swagger primeiro
        let swaggerPaths = [];
        try {
            const sw = await httpsGet({ url: `${adnBase}/swagger/v1/swagger.json`, cert: certData.cert, key: certData.key, timeoutMs: 8000 });
            if (sw.status === 200) {
                const parsed = JSON.parse(sw.raw);
                swaggerPaths = Object.keys(parsed.paths || {});
                app.log.info({ msg: "ADESAO_SWAGGER", paths: swaggerPaths });
            }
        } catch {}

        // Padrões de endpoint de adesão (mais comuns para o ADN NFS-e nacional)
        const adesaoUrls = [
            { url: `${adnBase}/contribuintes/adesao`, method: "POST", body: { cnpj: cnpjFilial } },
            { url: `${adnBase}/contribuintes/${cnpjFilial}/adesao`, method: "PUT", body: {} },
            { url: `${adnBase}/contribuintes/inscricao`, method: "POST", body: { cnpj: cnpjFilial } },
            { url: `${adnBase}/contribuintes`, method: "POST", body: { cnpj: cnpjFilial, tipo: "TOMADOR" } },
            { url: `${adnBase}/adesao`, method: "POST", body: { cnpj: cnpjFilial } },
        ];

        let adesaoOk = false;
        let adesaoResposta = null;

        for (const { url, method, body: adesaoBody } of adesaoUrls) {
            try {
                const resp = await httpsGet({ url, cert: certData.cert, key: certData.key, method, body: adesaoBody, timeoutMs: 15000 });
                app.log.info({ msg: "ADESAO_TENTATIVA", url, method, status: resp.status, body: resp.raw.slice(0, 400) });
                tentativas.push({ url, status: resp.status, resposta: resp.raw.slice(0, 200) });

                if (resp.status === 200 || resp.status === 201 || resp.status === 204) {
                    adesaoOk = true;
                    adesaoResposta = resp.raw;
                    break;
                }
            } catch (e) {
                tentativas.push({ url, erro: e.message });
                app.log.warn({ msg: "ADESAO_ERRO", url, erro: e.message });
            }
        }

        registrarLog({ acao: "ADESAO_ADN", entidade: "nfseTomadas", entidadeId: cnpjFilial, usuario, ip, detalhe: { adesaoOk, tentativas: tentativas.length } });

        if (!adesaoOk) {
            return reply.send({
                sucesso: false,
                swaggerPaths,
                tentativas,
                mensagem: "Nenhum endpoint de adesão respondeu com sucesso. O ADN pode não ter endpoint REST para adesão automática — este processo precisa ser feito manualmente pelo portal nfse.gov.br.",
                instrucoes: [
                    "1. Acesse https://www.nfse.gov.br com o certificado digital da empresa",
                    `2. Busque a opção 'Adesão DFe' ou 'Receber Documentos Fiscais Eletrônicos'`,
                    `3. Registre o CNPJ ${cnpjFilial.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")} para receber NFS-e`,
                    "4. Após a adesão, clique em 'Sincronizar ADN' — a nota aparecerá automaticamente",
                ],
            });
        }

        return reply.send({
            sucesso: true,
            mensagem: `Adesão realizada para CNPJ ${cnpjFilial}. Agora sincronize para buscar as notas.`,
            resposta: adesaoResposta?.slice(0, 300),
        });
    });

    // ── Limpar notas com valor zero ou sem dados úteis ───────────────────────────
    app.post("/api/fiscal/nfse/tomadas/limpar-vazios", async (req, reply) => {
        initDb();
        const usuario = getUsuario(req);
        const ip = getIp(req);
        const antes = db.nfseTomadas.length;
        // Remove qualquer nota com valorServico = 0 (ou falsy)
        const removidas = db.nfseTomadas.filter(t => !t.valorServico || Number(t.valorServico) === 0);
        const temAdnRemovida = removidas.some(t => t.origem === "ADN_NACIONAL");
        db.nfseTomadas = db.nfseTomadas.filter(t => t.valorServico && Number(t.valorServico) > 0);
        const removidos = antes - db.nfseTomadas.length;
        // Reseta NSU state se havia notas ADN removidas, para forçar re-download limpo
        if (req.body?.resetarNSU !== false && temAdnRemovida) {
            if (db.nfseAdnSyncState) {
                db.nfseAdnSyncState.ultimoNSU = 0;
                if (db.nfseAdnSyncState.porCnpj) {
                    for (const k of Object.keys(db.nfseAdnSyncState.porCnpj)) {
                        db.nfseAdnSyncState.porCnpj[k] = { ultimoNSU: 0 };
                    }
                }
            }
        }
        registrarLog({ acao: "LIMPAR_VALOR_ZERO", entidade: "nfseTomadas", entidadeId: "cleanup", usuario, ip, detalhe: { antes, removidos } });
        await persistirNfse();
        return reply.send({
            removidos,
            restantes: db.nfseTomadas.length,
            nsuReset: temAdnRemovida,
            mensagem: removidos > 0
                ? `${removidos} nota(s) com valor zero removidas.${temAdnRemovida ? " NSU ADN resetado — clique em Sincronizar ADN para reimportar." : ""}`
                : "Nenhuma nota com valor zero encontrada.",
        });
    });

    // ── Importar NFS-e tomada via XML (colar ou upload do DANFSe) ───────────────
    app.post("/api/fiscal/nfse/tomadas/importar-xml", async (req, reply) => {
        initDb();
        const usuario = getUsuario(req);
        const ip = getIp(req);
        const body = req.body || {};

        const xml = (body.xml || "").trim();
        if (!xml || xml.length < 50) {
            return reply.status(400).send({ error: { message: "Conteúdo XML inválido ou vazio." } });
        }

        // Extrai campos do XML usando os helpers já definidos no módulo
        const nNFSe = xmlTagVal(xml, "nNFSe") || xmlTagVal(xml, "NumNFSe") || "";
        const dCompet = xmlTagVal(xml, "dCompet") || "";
        const dhEmi = xmlTagVal(xml, "dhEmi") || "";
        const dataEmissao = (dCompet || dhEmi || new Date().toISOString()).slice(0, 10);

        // Id é atributo XML (<infNFSe Id="NFS...">), não tag — usa regex de atributo
        const idAtributo = xml.match(/\bId="([^"]+)"/)?.[1] || xml.match(/\bId='([^']+)'/)?.[1] || "";
        const chaveNota = idAtributo.replace(/^NFS/, "") || xmlTagVal(xml, "chNFSe") || xmlTagVal(xml, "chave") || body.chaveAcesso || "";

        // Verifica duplicata por chave de acesso
        if (chaveNota) {
            const dup = db.nfseTomadas.find(t => t.chaveAcesso === chaveNota);
            if (dup) {
                return reply.send({ importado: false, duplicado: true, id: dup.id, mensagem: `Nota já cadastrada (id ${dup.id}).` });
            }
        }
        // Verifica duplicata por número + CNPJ prestador
        // Prestador em NFS-e nacional está em <prest> (dentro de <infDPS>).
        // <emit> é a autoridade fiscal municipal — não é o prestador, não usar aqui.
        const prestSection = xmlSection(xml, "prest") || xmlSection(xml, "prestador") || xmlSection(xml, "infoPrestador");
        const cnpjPrestTag = xmlTagVal(prestSection, "CNPJ") || xmlTagVal(prestSection, "CPF");
        // Só cai em <emit> se <prest> não trouxe CNPJ/CPF
        const emitSection = !cnpjPrestTag ? (xmlSection(xml, "emit") || "") : "";
        const cnpjPrest = limparCnpj(cnpjPrestTag || (emitSection ? (xmlTagVal(emitSection, "CNPJ") || xmlTagVal(emitSection, "CPF")) : "") || xmlTagVal(xml, "cnpjPrestador") || "");
        const nomePrest = xmlTagVal(prestSection, "xNome") || xmlTagVal(prestSection, "xFant") || (emitSection ? xmlTagVal(emitSection, "xNome") : null) || xmlTagVal(xml, "nomePrestador") || "";

        if (nNFSe && cnpjPrest) {
            const dup2 = db.nfseTomadas.find(t => t.numeroNfse === nNFSe && limparCnpj(t.cnpjPrestador) === cnpjPrest);
            if (dup2) {
                return reply.send({ importado: false, duplicado: true, id: dup2.id, mensagem: `NFS-e ${nNFSe} do prestador ${cnpjPrest} já cadastrada.` });
            }
        }

        const tomaSection = xmlSection(xml, "toma") || xmlSection(xml, "tomador") || xmlSection(xml, "dest");
        const cnpjToma = limparCnpj(xmlTagVal(tomaSection, "CNPJ") || xmlTagVal(xml, "cnpjTomador") || "");

        const descServ = xmlTagVal(xml, "xDescServ") || xmlTagVal(xml, "xTribNac") || xmlTagVal(xml, "infoCompl")?.trim() || "";

        const vServPrestSec = xmlSection(xml, "vServPrest") || xmlSection(xml, "ValServico") || xmlSection(xml, "valores");
        const vServico = Number(
            xmlTagVal(vServPrestSec, "vServ") ||
            xmlTagVal(xml, "vLiq") ||
            xmlTagVal(xml, "vBC") ||
            xmlTagVal(xml, "vReceb") ||
            0
        );
        const vISS = Number(xmlTagVal(xml, "vISSQN") || xmlTagVal(xml, "vISS") || 0);
        const aliq = vServico > 0 && vISS > 0 ? parseFloat((vISS / vServico * 100).toFixed(4)) : 0;

        const now = new Date().toISOString();
        const novaId = nextId("NFSET", db.nfseTomadas.length);
        db.nfseTomadas.unshift({
            id: novaId,
            numeroNfse: nNFSe,
            cnpjPrestador: cnpjPrest,
            nomePrestador: nomePrest,
            cnpjTomador: cnpjToma,
            descricaoServico: descServ,
            valorServico: vServico,
            valorIss: vISS,
            aliquotaIss: aliq,
            competencia: dataEmissao.slice(0, 7),
            dataEmissao,
            status: "ATIVA",
            origem: "XML_IMPORTADO",
            nsuAdn: 0,
            chaveAcesso: chaveNota || null,
            tipoDocumento: "NFSE",
            conciliado: false,
            constaWinthor: null,
            criadoEm: now,
            atualizadoEm: now,
        });
        registrarLog({ acao: "IMPORTAR_XML", entidade: "nfseTomadas", entidadeId: novaId, usuario, ip, detalhe: { nNFSe, cnpjPrest, vServico } });
        await persistirNfse();
        return reply.send({
            importado: true,
            id: novaId,
            numeroNfse: nNFSe,
            nomePrestador: nomePrest,
            valorServico: vServico,
            mensagem: `NFS-e ${nNFSe || "—"} de ${nomePrest || cnpjPrest} importada com sucesso (R$ ${vServico.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}).`,
        });
    });

    // ── Excluir NFS-e tomada (apenas notas não lançadas ou com lançamento desfeito) ─
    app.delete("/api/fiscal/nfse/tomadas/:id", async (req, reply) => {
        initDb();
        const usuario = getUsuario(req);
        const ip = getIp(req);
        const idx = db.nfseTomadas.findIndex(d => d.id === req.params.id);
        if (idx === -1) return reply.status(404).send({ error: { message: "NFS-e tomada não encontrada." } });
        const doc = db.nfseTomadas[idx];
        if (doc.constaWinthor === true) {
            return reply.status(400).send({ error: { message: "Não é possível excluir uma nota já lançada no WinThor. Desfaça o lançamento primeiro." } });
        }
        db.nfseTomadas.splice(idx, 1);
        registrarLog({ acao: "EXCLUIR_TOMADA", entidade: "nfseTomadas", entidadeId: req.params.id, usuario, ip, detalhe: { numeroNfse: doc.numeroNfse, cnpjPrestador: doc.cnpjPrestador } });
        await persistirNfse();
        return reply.send({ excluido: true, id: req.params.id });
    });

    // ── Desfazer lançamento WinThor (reset constaWinthor) ──────────────────────
    app.patch("/api/fiscal/nfse/tomadas/:id/desfazer-lancamento", async (req, reply) => {
        initDb();
        const usuario = getUsuario(req);
        const ip = getIp(req);
        const doc = db.nfseTomadas.find(d => d.id === req.params.id);
        if (!doc) return reply.status(404).send({ error: { message: "NFS-e tomada não encontrada." } });
        doc.constaWinthor = null;
        doc.pclancId = null;
        doc.pcnfentId = null;
        doc.atualizadoEm = new Date().toISOString();
        registrarLog({ acao: "DESFAZER_LANCAMENTO", entidade: "nfseTomadas", entidadeId: doc.id, usuario, ip, detalhe: { numeroNfse: doc.numeroNfse } });
        await persistirNfse();
        return reply.send({ ok: true, mensagem: "Lançamento desfeito. A nota voltou ao status 'não validado' e pode ser relançada." });
    });

    // Importar NFS-e tomadas via WinThor PCLANC (contas a pagar de serviços)
    app.post("/api/fiscal/nfse/tomadas/importar-winthor", async (req, reply) => {
        initDb();
        const usuario = getUsuario(req);
        const ip = getIp(req);
        let importados = 0;
        let erros = [];
        const toDateStr = (v) => {
            if (!v) return null;
            if (v instanceof Date) return v.toISOString().slice(0, 10);
            const s = String(v);
            if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
            const d = new Date(s);
            return isNaN(d.getTime()) ? s.slice(0, 10) : d.toISOString().slice(0, 10);
        };

        // Opção de limpar registros anteriores do WinThor antes de reimportar
        const resetar = req.body?.resetar === true;
        if (resetar) {
            const antes = db.nfseTomadas.length;
            db.nfseTomadas = db.nfseTomadas.filter(t => t.origem !== "WINTHOR_PCLANC" && t.origem !== "WINTHOR_PCNFENT");
            app.log.info({ removidos: antes - db.nfseTomadas.length }, "WINTHOR_RESET");
        }

        if (isOracleEnabled()) {
            const now = new Date().toISOString();
            // Lookup set: chaves CGC|NUMNOTA de lançamentos PCLANC (para verificar se PCNFENT está lançado)
            const pcLancKeys = new Set();

            // 1. PCLANC — contas a pagar de serviços: são lançamentos confirmados (constaWinthor=true)
            try {
                const sql = `
                    SELECT * FROM (
                        SELECT l.RECNUM, l.CODFORNEC, l.VALOR, l.DTLANC, l.NUMNOTA,
                               l.HISTORICO, l.CODFILIAL, l.VLISS, l.DTCOMPETENCIA,
                               f.FORNECEDOR, f.CGC
                        FROM PCLANC l
                        LEFT JOIN PCFORNEC f ON f.CODFORNEC = l.CODFORNEC
                        WHERE l.DTLANC >= SYSDATE - 180
                        AND f.CGC IS NOT NULL
                        AND l.VALOR > 0
                        AND (l.VLISS > 0 OR l.NFSERVICO IS NOT NULL OR l.NUMNOTA IS NOT NULL)
                        ORDER BY l.DTLANC DESC
                    ) WHERE ROWNUM <= 1000
                `;
                const rows = ((await executeOracle(sql, [])).rows ?? []);
                const existentes = new Set(db.nfseTomadas.map(t => `LANC_${t.pclanc || ""}|${limparCnpj(t.cnpjPrestador)}|${t.numeroNfse}`));

                for (const r of rows) {
                    const key = `LANC_${r.RECNUM}|${limparCnpj(r.CGC || "")}|${r.NUMNOTA || ""}`;
                    // Adiciona ao lookup de lançamentos para cruzar com PCNFENT
                    const cgcLimpo = limparCnpj(r.CGC || "");
                    const numNota = String(r.NUMNOTA || "").trim().replace(/^0+/, "") || String(r.RECNUM || "");
                    if (cgcLimpo && numNota) pcLancKeys.add(`${cgcLimpo}|${numNota}`);

                    if (existentes.has(key)) continue;

                    const dtLanc = toDateStr(r.DTCOMPETENCIA || r.DTLANC) || now.slice(0, 10);
                    const vlIss = Number(r.VLISS || 0);
                    const vlServ = Number(r.VALOR || 0);
                    const doc = {
                        id: nextId("NFSET", db.nfseTomadas.length + importados),
                        numeroNfse: String(r.NUMNOTA || r.RECNUM || ""),
                        cnpjPrestador: cgcLimpo,
                        nomePrestador: r.FORNECEDOR || "",
                        cnpjTomador: "",
                        descricaoServico: r.HISTORICO || `Serviço - Doc ${r.NUMNOTA || r.RECNUM}`,
                        valorServico: vlServ,
                        valorIss: vlIss,
                        aliquotaIss: vlServ > 0 && vlIss > 0 ? parseFloat((vlIss / vlServ * 100).toFixed(4)) : 0,
                        competencia: dtLanc.slice(0, 7),
                        dataEmissao: dtLanc,
                        status: "ATIVA",
                        origem: "WINTHOR_PCLANC",
                        pclanc: r.RECNUM,
                        codFilial: r.CODFILIAL,
                        constaWinthor: true,   // PCLANC = lançamento confirmado em contas a pagar
                        conciliado: true,
                        criadoEm: now,
                        atualizadoEm: now,
                    };
                    db.nfseTomadas.unshift(doc);
                    importados++;
                }
                app.log.info({ msg: "PCLANC_IMPORT", rows: rows.length, importados, pcLancKeys: pcLancKeys.size });

                // Query ampla sem filtro ISS: para o lookup de validação do PCNFENT
                // Um PCNFENT é "lançado" se tem QUALQUER PCLANC com mesmo CODFORNEC+NUMNOTA
                try {
                    const sqlLookup = `
                        SELECT * FROM (
                            SELECT l.CODFORNEC, l.NUMNOTA, f.CGC
                            FROM PCLANC l
                            LEFT JOIN PCFORNEC f ON f.CODFORNEC = l.CODFORNEC
                            WHERE l.DTLANC >= SYSDATE - 90
                            AND l.VALOR > 0
                            AND f.CGC IS NOT NULL
                            AND l.NUMNOTA IS NOT NULL
                            ORDER BY l.DTLANC DESC
                        ) WHERE ROWNUM <= 2000
                    `;
                    const lookupRows = ((await executeOracle(sqlLookup, [])).rows ?? []);
                    for (const lr of lookupRows) {
                        const c = limparCnpj(lr.CGC || "");
                        const n = String(lr.NUMNOTA || "").trim().replace(/^0+/, "");
                        if (c && n) pcLancKeys.add(`${c}|${n}`);
                    }
                    app.log.info({ msg: "PCLANC_LOOKUP_AMPLO", rows: lookupRows.length, pcLancKeys: pcLancKeys.size });
                } catch (eLookup) {
                    app.log.warn({ msg: "PCLANC_LOOKUP_ERRO", erro: eLookup.message });
                }
            } catch (e) {
                erros.push(`PCLANC: ${e.message}`);
            }

            // 2. PCNFENT — notas de entrada de serviço: verifica se cada uma está lançada no PCLANC
            //    Se TEM correspondência no PCLANC → constaWinthor=true (já lançada)
            //    Se NÃO TEM correspondência no PCLANC → constaWinthor=false (PENDENTE DE LANÇAMENTO)
            try {
                const sqlNfent = `
                    SELECT * FROM (
                        SELECT n.NUMTRANSENT, n.DTENT, n.VLTOTAL, n.CODFORNEC,
                               n.FORNECEDOR, n.CGC, n.NUMNOTA, n.SERIE,
                               n.VLISS, n.VLBASECALCRETENCAOISS, n.CODMUNNFSERVICO
                        FROM PCNFENT n
                        WHERE n.DTENT >= SYSDATE - 90
                        AND n.CHAVENFE IS NULL
                        AND n.CGC IS NOT NULL
                        AND REGEXP_REPLACE(n.CGC,'[^0-9]','') NOT IN ('00000000000000','00000000000000000')
                        AND n.VLTOTAL > 0
                        ORDER BY n.DTENT DESC
                    ) WHERE ROWNUM <= 500
                `;
                const rows2 = ((await executeOracle(sqlNfent, [])).rows ?? []);
                // Já existentes (pelo par CGC|NUMNOTA para evitar duplicar com PCLANC)
                const existentes2 = new Set(db.nfseTomadas.map(t => `${limparCnpj(t.cnpjPrestador)}|${String(t.numeroNfse||"").replace(/^0+/,"")}`));
                let pendentesPcnfent = 0;

                for (const r of rows2) {
                    const cgcLimpo = limparCnpj(r.CGC || "");
                    const numNota  = String(r.NUMNOTA || "").trim().replace(/^0+/, "");
                    const key = `${cgcLimpo}|${numNota}`;
                    if (existentes2.has(key)) continue; // já importado via PCLANC ou loop anterior

                    // Verifica se existe lançamento no PCLANC para esta nota
                    const temLancamento = cgcLimpo && numNota && pcLancKeys.has(key);

                    const vlIss2 = Number(r.VLISS || 0);
                    const vlServ2 = Number(r.VLTOTAL || 0);
                    const dtEnt = toDateStr(r.DTENT) || now.slice(0, 10);
                    const doc = {
                        id: nextId("NFSET", db.nfseTomadas.length + importados),
                        numeroNfse: String(r.NUMNOTA || ""),
                        cnpjPrestador: cgcLimpo,
                        nomePrestador: r.FORNECEDOR || "",
                        cnpjTomador: "",
                        descricaoServico: `Serviço - NF ${r.NUMNOTA || ""} Série ${r.SERIE || ""}`,
                        valorServico: vlServ2,
                        valorIss: vlIss2,
                        aliquotaIss: vlServ2 > 0 && vlIss2 > 0 ? parseFloat((vlIss2 / vlServ2 * 100).toFixed(4)) : 0,
                        competencia: dtEnt.slice(0, 7),
                        dataEmissao: dtEnt,
                        status: "ATIVA",
                        origem: "WINTHOR_PCNFENT",
                        pcnfentNumped: r.NUMTRANSENT,
                        // constaWinthor: null quando o cruzamento não é possível (sem numNota),
                        // true quando há PCLANC correspondente, false quando NÃO há (pendente de lançamento)
                        constaWinthor: (!cgcLimpo || !numNota) ? null : (temLancamento ? true : false),
                        conciliado: temLancamento,
                        criadoEm: now,
                        atualizadoEm: now,
                    };
                    if (!temLancamento) pendentesPcnfent++;
                    db.nfseTomadas.unshift(doc);
                    importados++;
                    existentes2.add(key);
                }
                app.log.info({ msg: "PCNFENT_IMPORT", rows: rows2.length, importados, pendentesPcnfent });
            } catch (e) {
                erros.push(`PCNFENT: ${e.message}`);
            }
        } else {
            erros.push("Oracle não disponível — importação via WinThor requer conexão Oracle.");
        }

        registrarLog({ acao: "IMPORTAR_TOMADAS_WINTHOR", entidade: "nfseTomadas", entidadeId: "batch", usuario, ip, detalhe: { importados, erros } });
        await persistirNfse();
        return reply.send({ importados, erros, mensagem: `${importados} NFS-es importadas do WinThor.` });
    });

    app.patch("/api/fiscal/nfse/tomadas/:id/conciliar", async (req, reply) => {
        initDb();
        const doc = db.nfseTomadas.find(d => d.id === req.params.id);
        if (!doc) return reply.status(404).send({ error: { message: "NFS-e tomada não encontrada" } });
        doc.conciliado = true;
        doc.pcnfentNumped = req.body?.numped;
        doc.atualizadoEm = new Date().toISOString();
        await persistirNfse();
        return reply.send(doc);
    });

    // ===========================================================
    // SERVIÇOS TRIBUTADOS
    // ===========================================================
    app.get("/api/fiscal/nfse/servicos", async (req, reply) => {
        initDb();
        const q = req.query;
        let docs = [...db.nfseServicos];
        if (q.busca) {
            const b = q.busca.toLowerCase();
            docs = docs.filter(s =>
                (s.codigo || "").toLowerCase().includes(b) ||
                (s.descricao || "").toLowerCase().includes(b) ||
                (s.cnae || "").includes(q.busca)
            );
        }
        if (q.ativo !== undefined) {
            const ativo = q.ativo !== "false" && q.ativo !== "0";
            docs = docs.filter(s => Boolean(s.ativo) === ativo);
        }
        return reply.send({ items: docs, total: docs.length });
    });

    app.post("/api/fiscal/nfse/servicos", async (req, reply) => {
        initDb();
        const body = req.body || {};
        if (!body.codigo) return reply.status(400).send({ error: { message: "codigo obrigatório" } });
        if (!body.descricao) return reply.status(400).send({ error: { message: "descricao obrigatória" } });

        const existe = db.nfseServicos.find(s => s.codigo === body.codigo);
        if (existe) return reply.status(409).send({ error: { message: "Código de serviço já cadastrado" } });

        const now = new Date().toISOString();
        const svc = {
            id: nextId("SVC", db.nfseServicos.length),
            codigo: body.codigo,
            descricao: body.descricao,
            cnae: body.cnae || "",
            aliquotaIss: Number(body.aliquotaIss || db.nfseConfig?.aliquotaIssDefault || 5),
            ativo: true,
            criadoEm: now,
            atualizadoEm: now,
        };
        db.nfseServicos.push(svc);
        await persistirNfse();
        return reply.status(201).send(svc);
    });

    app.put("/api/fiscal/nfse/servicos/:id", async (req, reply) => {
        initDb();
        const svc = db.nfseServicos.find(s => s.id === req.params.id);
        if (!svc) return reply.status(404).send({ error: { message: "Serviço não encontrado" } });
        const body = req.body || {};
        if (body.descricao !== undefined) svc.descricao = body.descricao;
        if (body.cnae !== undefined) svc.cnae = body.cnae;
        if (body.aliquotaIss !== undefined) svc.aliquotaIss = Number(body.aliquotaIss);
        if (body.ativo !== undefined) svc.ativo = Boolean(body.ativo);
        svc.atualizadoEm = new Date().toISOString();
        await persistirNfse();
        return reply.send(svc);
    });

    app.delete("/api/fiscal/nfse/servicos/:id", async (req, reply) => {
        initDb();
        const idx = db.nfseServicos.findIndex(s => s.id === req.params.id);
        if (idx < 0) return reply.status(404).send({ error: { message: "Serviço não encontrado" } });
        const [removed] = db.nfseServicos.splice(idx, 1);
        await persistirNfse();
        return reply.send({ removido: removed.id });
    });

    // ===========================================================
    // TOMADORES
    // ===========================================================
    app.get("/api/fiscal/nfse/tomadores", async (req, reply) => {
        initDb();
        const q = req.query;
        let docs = [...db.nfseTomadores];
        if (q.busca) {
            const b = q.busca.toLowerCase();
            docs = docs.filter(t =>
                (t.nome || "").toLowerCase().includes(b) ||
                (t.cnpjCpf || "").replace(/\D/g, "").includes(q.busca.replace(/\D/g, "")) ||
                (t.municipio || "").toLowerCase().includes(b)
            );
        }
        return reply.send(paginar(docs, q.page, q.pageSize));
    });

    app.get("/api/fiscal/nfse/tomadores/:id", async (req, reply) => {
        initDb();
        const tom = db.nfseTomadores.find(t => t.id === req.params.id);
        if (!tom) return reply.status(404).send({ error: { message: "Tomador não encontrado" } });
        return reply.send(tom);
    });

    app.post("/api/fiscal/nfse/tomadores", async (req, reply) => {
        initDb();
        const body = req.body || {};
        if (!body.cnpjCpf) return reply.status(400).send({ error: { message: "cnpjCpf obrigatório" } });
        if (!body.nome) return reply.status(400).send({ error: { message: "nome obrigatório" } });

        const chave = limparCnpj(body.cnpjCpf);
        const existe = db.nfseTomadores.find(t => limparCnpj(t.cnpjCpf) === chave);
        if (existe) return reply.status(409).send({ error: { message: "CNPJ/CPF já cadastrado" } });

        const now = new Date().toISOString();
        const tom = {
            id: nextId("TOM", db.nfseTomadores.length),
            tipo: body.tipo || (chave.length === 14 ? "PJ" : "PF"),
            cnpjCpf: chave,
            nome: body.nome,
            email: body.email || "",
            telefone: body.telefone || "",
            logradouro: body.logradouro || "",
            numero: body.numero || "",
            complemento: body.complemento || "",
            bairro: body.bairro || "",
            municipio: body.municipio || "",
            uf: body.uf || "",
            cep: (body.cep || "").replace(/\D/g, ""),
            inscricaoMunicipal: body.inscricaoMunicipal || "",
            criadoEm: now,
            atualizadoEm: now,
        };
        db.nfseTomadores.push(tom);
        await persistirNfse();
        return reply.status(201).send(tom);
    });

    app.put("/api/fiscal/nfse/tomadores/:id", async (req, reply) => {
        initDb();
        const tom = db.nfseTomadores.find(t => t.id === req.params.id);
        if (!tom) return reply.status(404).send({ error: { message: "Tomador não encontrado" } });
        const body = req.body || {};
        const campos = ["nome", "email", "telefone", "logradouro", "numero", "complemento", "bairro", "municipio", "uf", "cep", "inscricaoMunicipal"];
        for (const c of campos) {
            if (body[c] !== undefined) tom[c] = body[c];
        }
        tom.atualizadoEm = new Date().toISOString();
        await persistirNfse();
        return reply.send(tom);
    });

    // Importar tomadores do WinThor PCCLIENT
    app.post("/api/fiscal/nfse/tomadores/importar-winthor", async (req, reply) => {
        initDb();
        const usuario = getUsuario(req);
        const ip = getIp(req);
        let importados = 0;
        let erros = [];

        if (isOracleEnabled()) {
            try {
                const sql = `
                    SELECT CODCLI, CLIENTE, CGC_CPF, EMAIL, TELEFONE,
                           ENDERECO, NUMERO, COMPLEMENTO, BAIRRO,
                           MUNICIPIO, ESTADO, CEP
                    FROM PCCLIENT
                    WHERE ATIVO = 'S'
                    AND CGC_CPF IS NOT NULL
                    AND ROWNUM <= 500
                    ORDER BY CODCLI
                `;
                const rows = ((await executeOracle(sql, [])).rows ?? []);
                const now = new Date().toISOString();
                const existentes = new Set(db.nfseTomadores.map(t => limparCnpj(t.cnpjCpf)));

                for (const r of rows) {
                    const chave = limparCnpj(r.CGC_CPF || "");
                    if (!chave || existentes.has(chave)) continue;
                    db.nfseTomadores.push({
                        id: nextId("TOM", db.nfseTomadores.length + importados),
                        tipo: chave.length === 14 ? "PJ" : "PF",
                        cnpjCpf: chave,
                        nome: r.CLIENTE || "",
                        email: r.EMAIL || "",
                        telefone: r.TELEFONE || "",
                        logradouro: r.ENDERECO || "",
                        numero: r.NUMERO || "",
                        complemento: r.COMPLEMENTO || "",
                        bairro: r.BAIRRO || "",
                        municipio: r.MUNICIPIO || "",
                        uf: r.ESTADO || "",
                        cep: limparCnpj(r.CEP || ""),
                        inscricaoMunicipal: "",
                        origemWinthor: true,
                        criadoEm: now,
                        atualizadoEm: now,
                    });
                    existentes.add(chave);
                    importados++;
                }
            } catch (e) {
                erros.push(e.message);
            }
        } else {
            erros.push("Oracle não disponível.");
        }

        registrarLog({ acao: "IMPORTAR_TOMADORES_WINTHOR", entidade: "nfseTomadores", entidadeId: "batch", usuario, ip, detalhe: { importados } });
        await persistirNfse();
        return reply.send({ importados, erros, mensagem: `${importados} tomadores importados do WinThor.` });
    });

    // ===========================================================
    // EMISSÃO EM LOTE
    // ===========================================================
    app.get("/api/fiscal/nfse/lotes", async (req, reply) => {
        initDb();
        return reply.send(paginar([...db.nfseLotes].reverse(), req.query.page, req.query.pageSize));
    });

    app.post("/api/fiscal/nfse/lotes/emitir", async (req, reply) => {
        initDb();
        const body = req.body || {};
        const itens = body.itens || [];
        if (!Array.isArray(itens) || itens.length === 0) {
            return reply.status(400).send({ error: { message: "itens[] obrigatório e não pode ser vazio" } });
        }

        const usuario = getUsuario(req);
        const ip = getIp(req);
        const cfg = db.nfseConfig || {};
        const now = new Date().toISOString();

        const lote = {
            id: nextId("LOTE", db.nfseLotes.length),
            status: "PROCESSANDO",
            totalItens: itens.length,
            processados: 0,
            erros: 0,
            resultados: [],
            criadoPor: usuario,
            criadoEm: now,
        };
        db.nfseLotes.push(lote);

        let processados = 0;
        let erros = 0;

        for (const item of itens) {
            try {
                if (!item.nomeTomador || !item.valorServico || !item.codigoServico) {
                    lote.resultados.push({ erro: "Campos obrigatórios ausentes", item });
                    erros++;
                    continue;
                }

                const aliquota = Number(item.aliquotaIss ?? cfg.aliquotaIssDefault ?? 5);
                const impostos = calcularImpostos(item.valorServico, aliquota, item.retencaoIss ?? cfg.retencaoIss);
                const id = `NFSE-${randomUUID().slice(0, 8).toUpperCase()}`;
                const numeroNfse = `H${String(db.nfseEmitidas.length + processados + 1).padStart(8, "0")}`;

                const doc = {
                    id,
                    numeroNfse,
                    numeroRps: proximoNumeroRps(),
                    serieRps: cfg.serieRps || "A",
                    codigoVerificacao: gerarCodigoVerificacao(),
                    status: "AUTORIZADA",
                    ambiente: cfg.ambiente || "HOMOLOGACAO",
                    cnpjPrestador: limparCnpj(item.cnpjPrestador || db.fiscalCnpjs?.[0]?.cnpj || ""),
                    cnpjTomador: limparCnpj(item.cnpjTomador || ""),
                    cpfTomador: limparCnpj(item.cpfTomador || ""),
                    nomeTomador: item.nomeTomador,
                    emailTomador: item.emailTomador || "",
                    descricaoServico: item.descricaoServico || "",
                    codigoServico: item.codigoServico,
                    valorServico: Number(item.valorServico),
                    ...impostos,
                    competencia: item.competencia || now.slice(0, 7),
                    dataEmissao: now.slice(0, 10),
                    protocoloAutorizacao: `PROT-${Date.now()}-${processados}`,
                    xmlHash: hashTexto(`${id}${item.valorServico}`),
                    loteId: lote.id,
                    criadoPor: usuario,
                    criadoEm: now,
                    atualizadoEm: now,
                };

                db.nfseEmitidas.unshift(doc);
                lote.resultados.push({ id, numeroNfse, status: "AUTORIZADA" });
                processados++;
            } catch (e) {
                lote.resultados.push({ erro: e.message, item });
                erros++;
            }
        }

        lote.status = erros === itens.length ? "ERRO" : erros > 0 ? "PARCIAL" : "CONCLUIDO";
        lote.processados = processados;
        lote.erros = erros;
        lote.finalizadoEm = new Date().toISOString();

        registrarLog({ acao: "EMITIR_LOTE_NFSE", entidade: "nfseLotes", entidadeId: lote.id, usuario, ip, detalhe: { processados, erros } });
        await persistirNfse();
        return reply.send(lote);
    });

    // ===========================================================
    // EMISSÃO RECORRENTE
    // ===========================================================
    app.get("/api/fiscal/nfse/recorrentes", async (req, reply) => {
        initDb();
        return reply.send({ items: db.nfseRecorrentes, total: db.nfseRecorrentes.length });
    });

    app.post("/api/fiscal/nfse/recorrentes", async (req, reply) => {
        initDb();
        const body = req.body || {};
        if (!body.nomeTomador || !body.valorServico || !body.codigoServico) {
            return reply.status(400).send({ error: { message: "nomeTomador, valorServico e codigoServico são obrigatórios" } });
        }

        const now = new Date().toISOString();
        const rec = {
            id: nextId("REC", db.nfseRecorrentes.length),
            ativo: true,
            cnpjTomador: limparCnpj(body.cnpjTomador || ""),
            nomeTomador: body.nomeTomador,
            emailTomador: body.emailTomador || "",
            descricaoServico: body.descricaoServico || "",
            codigoServico: body.codigoServico,
            valorServico: Number(body.valorServico),
            aliquotaIss: Number(body.aliquotaIss || db.nfseConfig?.aliquotaIssDefault || 5),
            retencaoIss: Boolean(body.retencaoIss),
            diaEmissao: Number(body.diaEmissao || 1),
            competenciaInicio: body.competenciaInicio || now.slice(0, 7),
            competenciaFim: body.competenciaFim || null,
            ultimaEmissao: null,
            proximaEmissao: `${body.competenciaInicio || now.slice(0, 7)}-${String(body.diaEmissao || 1).padStart(2, "0")}`,
            totalEmitidas: 0,
            criadoPor: getUsuario(req),
            criadoEm: now,
            atualizadoEm: now,
        };
        db.nfseRecorrentes.push(rec);
        await persistirNfse();
        return reply.status(201).send(rec);
    });

    app.put("/api/fiscal/nfse/recorrentes/:id", async (req, reply) => {
        initDb();
        const rec = db.nfseRecorrentes.find(r => r.id === req.params.id);
        if (!rec) return reply.status(404).send({ error: { message: "Recorrente não encontrada" } });
        const body = req.body || {};
        const campos = ["ativo", "valorServico", "descricaoServico", "aliquotaIss", "retencaoIss", "diaEmissao", "competenciaFim"];
        for (const c of campos) {
            if (body[c] !== undefined) rec[c] = body[c];
        }
        rec.atualizadoEm = new Date().toISOString();
        await persistirNfse();
        return reply.send(rec);
    });

    app.delete("/api/fiscal/nfse/recorrentes/:id", async (req, reply) => {
        initDb();
        const idx = db.nfseRecorrentes.findIndex(r => r.id === req.params.id);
        if (idx < 0) return reply.status(404).send({ error: { message: "Recorrente não encontrada" } });
        const [removed] = db.nfseRecorrentes.splice(idx, 1);
        await persistirNfse();
        return reply.send({ removido: removed.id });
    });

    app.post("/api/fiscal/nfse/recorrentes/:id/executar", async (req, reply) => {
        initDb();
        const rec = db.nfseRecorrentes.find(r => r.id === req.params.id);
        if (!rec) return reply.status(404).send({ error: { message: "Recorrente não encontrada" } });
        if (!rec.ativo) return reply.status(400).send({ error: { message: "Emissão recorrente inativa" } });

        const cfg = db.nfseConfig || {};
        const now = new Date().toISOString();
        const competencia = req.body?.competencia || now.slice(0, 7);

        const impostos = calcularImpostos(rec.valorServico, rec.aliquotaIss, rec.retencaoIss);
        const id = `NFSE-${randomUUID().slice(0, 8).toUpperCase()}`;
        const numeroNfse = `H${String(db.nfseEmitidas.length + 1).padStart(8, "0")}`;

        const doc = {
            id, numeroNfse,
            numeroRps: proximoNumeroRps(),
            serieRps: cfg.serieRps || "A",
            codigoVerificacao: gerarCodigoVerificacao(),
            status: "AUTORIZADA",
            ambiente: cfg.ambiente || "HOMOLOGACAO",
            cnpjPrestador: limparCnpj(db.fiscalCnpjs?.[0]?.cnpj || ""),
            cnpjTomador: rec.cnpjTomador,
            nomeTomador: rec.nomeTomador,
            emailTomador: rec.emailTomador,
            descricaoServico: rec.descricaoServico,
            codigoServico: rec.codigoServico,
            valorServico: rec.valorServico,
            ...impostos,
            competencia,
            dataEmissao: now.slice(0, 10),
            protocoloAutorizacao: `PROT-${Date.now()}`,
            xmlHash: hashTexto(`${id}${rec.valorServico}`),
            recorrenteId: rec.id,
            criadoPor: getUsuario(req),
            criadoEm: now,
            atualizadoEm: now,
        };

        db.nfseEmitidas.unshift(doc);
        rec.ultimaEmissao = now.slice(0, 10);
        rec.totalEmitidas = (rec.totalEmitidas || 0) + 1;
        rec.atualizadoEm = now;

        await persistirNfse();
        return reply.send(doc);
    });

    // ===========================================================
    // ADN — AMBIENTE DE DADOS NACIONAIS
    // ===========================================================
    app.get("/api/fiscal/nfse/adn/documentos", async (req, reply) => {
        initDb();
        const q = req.query;
        let docs = [...(db.nfseAdnDocumentos || [])];
        if (q.status) docs = docs.filter(d => d.status === q.status);
        if (q.cnpjPrestador) {
            const c = limparCnpj(q.cnpjPrestador);
            docs = docs.filter(d => limparCnpj(d.cnpjPrestador).includes(c));
        }
        docs.sort((a, b) => (b.criadoEm || "").localeCompare(a.criadoEm || ""));
        return reply.send(paginar(docs, q.page, q.pageSize));
    });

    app.post("/api/fiscal/nfse/adn/consultar", async (req, reply) => {
        initDb();
        const usuario = getUsuario(req);
        const ip = getIp(req);
        const body = req.body || {};

        registrarLog({ acao: "CONSULTAR_ADN", entidade: "nfseAdnDocumentos", entidadeId: "query", usuario, ip, detalhe: body });

        // ADN — Ambiente de Dados Nacionais (Sistema Nacional NFS-e Gov.br)
        // Produção:     GET https://adn.nfse.gov.br/contribuintes/nfse?cnpj={cnpj}&...
        // Homologação:  GET https://adn.producaorestrita.nfse.gov.br/contribuintes/nfse?cnpj={cnpj}&...
        // Autenticação: mTLS com certificado digital A1 (PKCS#12) ou A3 — o certificado é enviado
        //               como cliente TLS; nenhum header Bearer é usado.
        // O certificado já cadastrado em /fiscal/certificados deve ser usado para as chamadas reais.
        const cfg = db.nfseConfig || {};
        const ambiente = body.ambiente || cfg.ambiente || "HOMOLOGACAO";
        const urlBase = ambiente === "PRODUCAO"
            ? "https://adn.nfse.gov.br/contribuintes/nfse"
            : "https://adn.producaorestrita.nfse.gov.br/contribuintes/nfse";

        const cnpjsParaConsultar = body.cnpj
            ? [limparCnpj(body.cnpj)]
            : (db.fiscalCnpjs || []).map(c => limparCnpj(c.cnpj));

        const temCertificado = (db.fiscalCertificados || []).some(c => c.status === "ATIVO");
        const resultados = [];
        const now = new Date().toISOString();

        for (const cnpj of cnpjsParaConsultar) {
            resultados.push({
                cnpj,
                status: temCertificado ? "PENDENTE_INTEGRACAO" : "SEM_CERTIFICADO",
                endpointAdn: `${urlBase}?cnpj=${cnpj}`,
                mensagem: temCertificado
                    ? `Certificado ativo encontrado. Integração real com ADN requer mTLS. Endpoint: ${urlBase}`
                    : "Nenhum certificado digital ativo. Cadastre o certificado A1/A3 em Fiscal > Certificados.",
                documentosEncontrados: 0,
                ultimaConsulta: now,
            });
        }

        return reply.send({
            resultados,
            ambiente,
            urlBase,
            autenticacao: "mTLS — certificado digital A1 (PKCS#12) obrigatório",
            mensagem: temCertificado
                ? `Consulta ADN simulada para ${cnpjsParaConsultar.length} CNPJ(s). Configure integração mTLS para transmissão real.`
                : `Configure um certificado digital A1/A3 em Fiscal > Certificados para ativar a consulta ADN.`,
        });
    });

    // ===========================================================
    // CONCILIAÇÃO COM WINTHOR (PCNFENT + PCLANC)
    // ===========================================================
    app.get("/api/fiscal/nfse/conciliacao/status", async (req, reply) => {
        initDb();
        const tomadas = db.nfseTomadas || [];
        const conciliadas = tomadas.filter(t => t.conciliado).length;
        const pendentes = tomadas.filter(t => !t.conciliado).length;
        return reply.send({ total: tomadas.length, conciliadas, pendentes });
    });

    // Validar NFS-e do ambiente nacional contra o WinThor (PCLANC)
    // Fluxo correto: Nacional → é a fonte; WinThor → é a validação
    app.post("/api/fiscal/nfse/tomadas/validar-winthor", async (req, reply) => {
        initDb();
        const usuario = getUsuario(req);
        const ip = getIp(req);
        const body = req.body || {};

        // Competência alvo — padrão: mês atual
        const competencia = body.competencia || new Date().toISOString().slice(0, 7);
        let encontradas = 0;
        let naoEncontradas = 0;
        let semFornecedor = 0;

        if (!isOracleEnabled()) {
            return reply.send({ encontradas: 0, naoEncontradas: 0, mensagem: "Oracle não disponível para validação no WinThor." });
        }

        try {
            // Notas da competência solicitada (ADN ou WinThor PCLANC sem validação ainda)
            const notasMes = db.nfseTomadas.filter(t =>
                t.competencia === competencia &&
                (t.origem === "ADN_NACIONAL" || ((t.origem === "WINTHOR_PCLANC" || t.origem === "WINTHOR_PCNFENT") && t.constaWinthor == null))
            );
            const notasWinthorJaConsta = db.nfseTomadas.filter(t =>
                t.competencia === competencia && t.constaWinthor === true
            );

            if (notasMes.length === 0) {
                const winthorTotal = notasWinthorJaConsta.length;
                const msg = winthorTotal > 0
                    ? `${winthorTotal} nota(s) de serviço já constam no WinThor para ${competencia}. Nenhuma NFS-e do ambiente nacional (ADN) pendente.`
                    : `Nenhuma NFS-e para competência ${competencia}. Use "WinThor PCLANC" para importar notas de serviço do sistema.`;
                return reply.send({ encontradas: winthorTotal, naoEncontradas: 0, mensagem: msg });
            }

            // CNPJs únicos das notas do mês (apenas CNPJs preenchidos)
            const cnpjsSet = new Set(notasMes.map(t => limparCnpj(t.cnpjPrestador)).filter(c => c && c.length >= 11));
            const cnpjList = [...cnpjsSet];

            // executeOracle retorna { rows: [...], metaData: [...] } — usar .rows
            const exec = async (sql, binds) => (await executeOracle(sql, binds)).rows || [];

            // Guard: se não há CNPJs válidos (notas importadas sem dados de prestador),
            // marcar todas como não-encontradas sem consultar Oracle (evita IN () → ORA-00936)
            if (cnpjList.length === 0) {
                const nowTs = new Date().toISOString();
                for (const t of notasMes) {
                    t.constaWinthor = null; // sem CNPJ prestador = indeterminado, não falso
                    t.atualizadoEm = nowTs;
                }
                return reply.send({
                    encontradas: 0,
                    naoEncontradas: notasMes.length,
                    semFornecedor: notasMes.length,
                    mensagem: `${notasMes.length} nota(s) de ${competencia} sem CNPJ do prestador — possivelmente documentos resumo (Res) do ADN sem XML completo. Verifique os detalhes de cada nota.`,
                });
            }

            // 1. PCFORNEC: mapeia CNPJ → CODFORNEC(s)
            const placeholders = cnpjList.map((_, i) => `:c${i}`).join(",");
            const binds = Object.fromEntries(cnpjList.map((c, i) => [`c${i}`, c]));
            const fornRows = await exec(
                `SELECT CODFORNEC, TRIM(CGC) AS CGC FROM PCFORNEC
                 WHERE REGEXP_REPLACE(CGC,'[^0-9]','') IN (${placeholders})`,
                binds
            );
            // mapa cnpj → [codfornec]
            const fornMap = new Map();
            for (const r of fornRows) {
                const c = limparCnpj(r.CGC);
                if (!fornMap.has(c)) fornMap.set(c, []);
                fornMap.get(c).push(Number(r.CODFORNEC));
            }

            // 2. PCLANC: lançamentos dos fornecedores encontrados, no mês +/- 1 mês (para cobrir lançamentos atrasados)
            const allCods = [...new Set(fornRows.map(r => Number(r.CODFORNEC)))];
            let lancMap = new Map(); // codfornec → [{numnota, valor, dt}]
            if (allCods.length > 0) {
                const codPlaceholders = allCods.map((_, i) => `:f${i}`).join(",");
                const codBinds = Object.fromEntries(allCods.map((c, i) => [`f${i}`, c]));
                const lancRows = await exec(
                    `SELECT CODFORNEC, TRIM(NUMNOTA) AS NUMNOTA, VALOR, DTLANC
                     FROM PCLANC
                     WHERE CODFORNEC IN (${codPlaceholders})
                     AND DTLANC >= ADD_MONTHS(TO_DATE(:mes,'YYYY-MM'), -1)
                     AND DTLANC <  ADD_MONTHS(TO_DATE(:mes,'YYYY-MM'), 2)
                     AND VALOR > 0`,
                    { ...codBinds, mes: competencia }
                );
                for (const r of lancRows) {
                    const cod = Number(r.CODFORNEC);
                    if (!lancMap.has(cod)) lancMap.set(cod, []);
                    lancMap.get(cod).push({
                        numnota: String(r.NUMNOTA || "").trim(),
                        valor:   Number(r.VALOR || 0),
                        dt:      r.DTLANC ? String(r.DTLANC).slice(0, 7) : "",
                    });
                }

                // 3. PCNFENT: notas de entrada (algumas NFS-e chegam por aqui)
                const nfentRows = await exec(
                    `SELECT CODFORNEC, TRIM(NUMNOTA) AS NUMNOTA, VLTOTAL, DTEMISSAO
                     FROM PCNFENT
                     WHERE CODFORNEC IN (${codPlaceholders})
                     AND DTEMISSAO >= ADD_MONTHS(TO_DATE(:mes,'YYYY-MM'), -1)
                     AND DTEMISSAO <  ADD_MONTHS(TO_DATE(:mes,'YYYY-MM'), 2)
                     AND VLTOTAL > 0`,
                    { ...codBinds, mes: competencia }
                );
                for (const r of nfentRows) {
                    const cod = Number(r.CODFORNEC);
                    if (!lancMap.has(cod)) lancMap.set(cod, []);
                    lancMap.get(cod).push({
                        numnota: String(r.NUMNOTA || "").trim(),
                        valor:   Number(r.VLTOTAL || 0),
                        dt:      r.DTEMISSAO ? String(r.DTEMISSAO).slice(0, 7) : "",
                    });
                }
            }

            // 4. Cruzar cada nota do mês
            const now = new Date().toISOString();
            for (const tomada of notasMes) {
                const cnpj   = limparCnpj(tomada.cnpjPrestador);
                const numNfs = String(tomada.numeroNfse || "").trim();
                const valor  = Number(tomada.valorServico || 0);

                const cods = fornMap.get(cnpj) || [];
                if (cods.length === 0) {
                    // Fornecedor não cadastrado no WinThor — considerado não lançado
                    tomada.constaWinthor = false;
                    tomada.atualizadoEm = now;
                    semFornecedor++;
                    naoEncontradas++;
                    continue;
                }

                let achou = false;
                for (const cod of cods) {
                    const lancs = lancMap.get(cod) || [];
                    // Match 1: número da NFS-e = NUMNOTA
                    const porNum = numNfs ? lancs.find(l =>
                        l.numnota === numNfs ||
                        l.numnota.replace(/\D/g, "") === numNfs.replace(/\D/g, "") ||
                        l.numnota.replace(/^0+/, "") === numNfs.replace(/^0+/, "")
                    ) : null;
                    if (porNum) { achou = true; break; }

                    // Match 2: valor ±1% no mesmo mês
                    if (valor > 0) {
                        const porValor = lancs.find(l =>
                            Math.abs(l.valor - valor) / valor < 0.01 &&
                            l.dt === competencia
                        );
                        if (porValor) { achou = true; break; }
                    }
                }

                if (achou) {
                    tomada.constaWinthor = true;
                    tomada.conciliado = true;
                    tomada.atualizadoEm = now;
                    encontradas++;
                } else {
                    tomada.constaWinthor = false;
                    tomada.atualizadoEm = now;
                    naoEncontradas++;
                }
            }

        } catch (e) {
            app.log.error({ msg: "VALIDAR_WINTHOR_ERRO", erro: e.message });
            return reply.status(500).send({ error: { message: e.message } });
        }

        registrarLog({ acao: "VALIDAR_TOMADAS_WINTHOR", entidade: "nfseTomadas", entidadeId: "batch", usuario, ip, detalhe: { competencia, encontradas, naoEncontradas, semFornecedor } });
        await persistirNfse();
        return reply.send({
            encontradas,
            naoEncontradas,
            semFornecedor,
            competencia,
            mensagem: `Competência ${competencia}: ${encontradas} nota(s) no WinThor, ${naoEncontradas} NÃO lançadas${semFornecedor > 0 ? ` (${semFornecedor} sem fornecedor cadastrado)` : ""}.`,
        });
    });

    // ===========================================================
    // CADASTRAR FORNECEDOR NO WINTHOR (PCFORNEC)
    // Consulta PCLANC completo pelo RECNUMPRINC (todos os lançamentos do título)
    app.get("/api/fiscal/nfse/pclanc/:recnum", async (req, reply) => {
        if (!isOracleEnabled()) return reply.status(503).send({ error: { message: "Oracle não disponível." } });
        const recnum = parseInt(req.params.recnum, 10);
        if (!recnum) return reply.status(400).send({ error: { message: "RECNUM inválido." } });
        try {
            const res = await executeOracle(
                `SELECT l.RECNUM, l.RECNUMPRINC, l.CODFORNEC, f.FORNECEDOR, l.NUMNOTA, l.NUMTRANSENT, l.NUMTRANSENTNF,
                        l.CODCONTA, l.CODFILIAL, l.VALOR, l.DTLANC, l.DTVENC, l.HISTORICO, l.NFSERVICO, l.TIPOLANC
                 FROM PCLANC l
                 LEFT JOIN PCFORNEC f ON f.CODFORNEC = l.CODFORNEC
                 WHERE l.RECNUMPRINC = :r
                 ORDER BY l.RECNUM`,
                { r: recnum }, { outFormat: 4002 }
            );
            const rows = res.rows ?? [];
            if (!rows.length) return reply.send({ encontrado: false, recnum });
            return reply.send({ encontrado: true, recnum, lancamentos: rows });
        } catch (e) {
            return reply.status(500).send({ error: { message: e.message } });
        }
    });

    // Consulta PCNFENT pelo NUMTRANSENT vinculado a um PCLANC
    app.get("/api/fiscal/nfse/pcnfent/:recnum", async (req, reply) => {
        if (!isOracleEnabled()) return reply.status(503).send({ error: { message: "Oracle não disponível." } });
        const recnum = parseInt(req.params.recnum, 10);
        if (!recnum) return reply.status(400).send({ error: { message: "RECNUM inválido." } });
        try {
            const lRes = await executeOracle(
                `SELECT NUMTRANSENT, NUMTRANSENTNF FROM PCLANC WHERE RECNUM = :r AND ROWNUM = 1`,
                { r: recnum }, { outFormat: 4002 }
            );
            const lRow = (lRes.rows ?? [])[0];
            if (!lRow) return reply.send({ encontrado: false });
            const numtrans = lRow.NUMTRANSENT || lRow.NUMTRANSENTNF;
            if (!numtrans) return reply.send({ encontrado: false, mensagem: "Sem NUMTRANSENT neste lançamento." });
            const res = await executeOracle(
                `SELECT n.NUMTRANSENT, n.CODFORNEC, f.FORNECEDOR, n.NUMNOTA, n.ESPECIE, n.CODFISCAL,
                        n.DTEMISSAO, n.DTENT, n.VLTOTAL, n.VLISS, n.CODFILIAL, n.CODCONT
                 FROM PCNFENT n
                 LEFT JOIN PCFORNEC f ON f.CODFORNEC = n.CODFORNEC
                 WHERE n.NUMTRANSENT = :t AND ROWNUM = 1`,
                { t: numtrans }, { outFormat: 4002 }
            );
            const rows = res.rows ?? [];
            return reply.send({ encontrado: rows.length > 0, numtransent: numtrans, pcnfent: rows[0] || null });
        } catch (e) {
            return reply.status(500).send({ error: { message: e.message } });
        }
    });

    // Consulta PCFORNEC pelo CNPJ de um prestador (somente leitura, sem INSERT)
    app.get("/api/fiscal/nfse/pcfornec/:cnpj", async (req, reply) => {
        if (!isOracleEnabled()) return reply.status(503).send({ error: { message: "Oracle não disponível." } });
        const cnpjDigits = (req.params.cnpj || "").replace(/\D/g, "");
        if (cnpjDigits.length < 11) return reply.status(400).send({ error: { message: "CNPJ inválido." } });
        try {
            const res = await executeOracle(
                `SELECT CODFORNEC, FORNECEDOR, CGC, TIPOPESSOA, SIMPLESNACIONAL, EXCLUIDO FROM PCFORNEC WHERE REGEXP_REPLACE(CGC, '[^0-9]', '') = :c AND ROWNUM = 1`,
                { c: cnpjDigits }
            );
            const rows = res.rows ?? [];
            if (!rows.length) return reply.send({ encontrado: false, cnpj: cnpjDigits, mensagem: `CNPJ ${cnpjDigits} não encontrado em PCFORNEC — será criado novo fornecedor ao lançar.` });
            const r = rows[0];
            return reply.send({ encontrado: true, codfornec: r.CODFORNEC, fornecedor: r.FORNECEDOR, cgcWinthor: r.CGC, tipoPessoa: r.TIPOPESSOA, simples: r.SIMPLESNACIONAL, excluido: r.EXCLUIDO });
        } catch (e) {
            return reply.status(500).send({ error: { message: e.message } });
        }
    });

    // Verifica em lote quais CNPJs já estão em PCFORNEC (para esconder botão Cadastrar)
    app.post("/api/fiscal/nfse/pcfornec/batch-check", async (req, reply) => {
        const cnpjsRaw = req.body?.cnpjs;
        if (!Array.isArray(cnpjsRaw) || cnpjsRaw.length === 0) return reply.send({ fornecedores: {} });
        const digits = [...new Set(cnpjsRaw.map(c => limparCnpj(c)).filter(c => c.length >= 11))].slice(0, 200);
        if (!isOracleEnabled() || digits.length === 0) return reply.send({ fornecedores: {} });
        try {
            const placeholders = digits.map((_, i) => `:${i + 1}`).join(", ");
            const res = await executeOracle(
                `SELECT CODFORNEC, FORNECEDOR, REGEXP_REPLACE(CGC,'[^0-9]','') AS CGC_LIMPO
                 FROM PCFORNEC
                 WHERE REGEXP_REPLACE(CGC,'[^0-9]','') IN (${placeholders})`,
                digits
            );
            const fornecedores = {};
            for (const r of (res.rows ?? [])) {
                fornecedores[r.CGC_LIMPO] = { codfornec: r.CODFORNEC, nome: r.FORNECEDOR };
            }
            return reply.send({ fornecedores });
        } catch (e) {
            return reply.send({ fornecedores: {} });
        }
    });

    // Verifica se o CNPJ/CPF do prestador já está em PCFORNEC e cadastra se não estiver
    // ===========================================================
    app.post("/api/fiscal/nfse/tomadas/:id/cadastrar-fornecedor", async (req, reply) => {
        initDb();
        const usuario = getUsuario(req);
        const ip = getIp(req);

        const doc = db.nfseTomadas.find(d => d.id === req.params.id);
        if (!doc) return reply.status(404).send({ error: { message: "NFS-e tomada não encontrada" } });
        if (!isOracleEnabled()) return reply.status(503).send({ error: { message: "Oracle não disponível." } });

        const cgc = limparCnpj(doc.cnpjPrestador);
        if (!cgc || cgc.length < 11) return reply.status(400).send({ error: { message: "CNPJ do prestador inválido." } });
        const formatCgcOracle = cgc.length === 14
            ? `${cgc.slice(0,2)}.${cgc.slice(2,5)}.${cgc.slice(5,8)}/${cgc.slice(8,12)}-${cgc.slice(12)}`
            : `${cgc.slice(0,3)}.${cgc.slice(3,6)}.${cgc.slice(6,9)}-${cgc.slice(9)}`;

        const tipoPessoa = cgc.length === 14 ? "J" : "F";
        const isSimples = Boolean(doc.simplesNacional || doc.regimeTributario === "SIMPLES");
        const aliquotaIss = Number(doc.aliquotaIss || 0);
        const percInss = tipoPessoa === "F" ? 11 : 0;
        const cnpjBase6 = cgc.slice(0, 6);
        const isUniao = cnpjBase6 === "003944";
        const percCsrf = (tipoPessoa === "J" && !isSimples && !isUniao) ? 4.65 : 0;
        const valorServico = Number(doc.valorServico || 0);
        const percIrrf = (tipoPessoa === "J" && !isSimples && !isUniao && valorServico > 666.67) ? 1.5 : 0;

        try {
            const fornecRes = await executeOracle(
                `SELECT CODFORNEC, FORNECEDOR, CGC FROM PCFORNEC WHERE REGEXP_REPLACE(CGC, '[^0-9]', '') = :cgcDigits AND ROWNUM = 1`,
                { cgcDigits: cgc }
            );
            const fornecRows = fornecRes.rows ?? [];

            if (fornecRows.length > 0) {
                // Marca em TODOS os docs com o mesmo CNPJ
                const codfornecEncontrado = fornecRows[0].CODFORNEC;
                const now = new Date().toISOString();
                db.nfseTomadas.forEach(t => {
                    if (limparCnpj(t.cnpjPrestador) === cgc) {
                        t.fornecedorCadastrado = true;
                        t.winthorCodfornec = codfornecEncontrado;
                        t.atualizadoEm = now;
                    }
                });
                await persistirNfse();
                return reply.send({
                    ok: true,
                    jaExiste: true,
                    codfornec: codfornecEncontrado,
                    nomeFornecedor: fornecRows[0].FORNECEDOR,
                    cgcWinthor: fornecRows[0].CGC,
                    mensagem: `Fornecedor já cadastrado no WinThor: CODFORNEC ${codfornecEncontrado} — ${fornecRows[0].FORNECEDOR}.`,
                });
            }

            // CODFORNEC é NUMBER(6), máximo 999999 — busca primeiro gap disponível
            const gapRes = await executeOracle(`
                SELECT MIN(CODFORNEC + 1) AS PROX FROM PCFORNEC a
                WHERE CODFORNEC < 999999
                  AND NOT EXISTS (SELECT 1 FROM PCFORNEC b WHERE b.CODFORNEC = a.CODFORNEC + 1)
            `, []);
            const gapRows = gapRes.rows ?? [];
            if (!gapRows.length || !gapRows[0].PROX) {
                return reply.status(500).send({ error: { message: "Sem código de fornecedor disponível (PCFORNEC cheio)." } });
            }
            const codfornec = gapRows[0].PROX;
            const nomeFornec = String(doc.nomePrestador || `FORNECEDOR ${cgc}`).slice(0, 60).toUpperCase();

            await executeOracle(`
                INSERT INTO PCFORNEC (
                    CODFORNEC, FORNECEDOR, CGC, TIPOPESSOA, TIPOFORNEC,
                    SIMPLESNACIONAL, EXCLUIDO, DTCADASTRO
                ) VALUES (
                    :1, :2, :3, :4, :5,
                    :6, 'N', SYSDATE
                )
            `, [
                codfornec, nomeFornec, formatCgcOracle, tipoPessoa, "S",
                isSimples ? "S" : "N",
            ]);

            // Marca em TODOS os docs com o mesmo CNPJ
            const now2 = new Date().toISOString();
            db.nfseTomadas.forEach(t => {
                if (limparCnpj(t.cnpjPrestador) === cgc) {
                    t.fornecedorCadastrado = true;
                    t.winthorCodfornec = codfornec;
                    t.atualizadoEm = now2;
                }
            });
            await persistirNfse();

            registrarLog({
                acao: "CADASTRAR_FORNECEDOR", entidade: "nfseTomadas", entidadeId: doc.id,
                usuario, ip,
                detalhe: { codfornec, nomeFornec, cgc: formatCgcOracle, tipoPessoa },
            });

            return reply.send({
                ok: true,
                jaExiste: false,
                codfornec,
                nomeFornecedor: nomeFornec,
                mensagem: `Fornecedor cadastrado no WinThor com CODFORNEC ${codfornec}.`,
            });

        } catch (e) {
            app.log.error({ msg: "CADASTRAR_FORNECEDOR_ERRO", erro: e.message, stack: e.stack });
            return reply.status(500).send({ error: { message: `Erro ao cadastrar fornecedor: ${e.message}` } });
        }
    });

    // ===========================================================
    // LANÇAR NFS-e TOMADA NO WINTHOR — padrão histórico
    // Replica CODFORNEC, CODCONTA, CODFILIAL, HISTORICO e DTVENC
    // do último lançamento de serviço para este CNPJ em PCLANC.
    // Sub-lançamentos (retenções) e PCNFENT apenas se o histórico os usava.
    // ===========================================================
    app.post("/api/fiscal/nfse/tomadas/:id/lancar-winthor", async (req, reply) => {
        initDb();
        const usuario = getUsuario(req);
        const ip = getIp(req);

        const doc = db.nfseTomadas.find(d => d.id === req.params.id);
        if (!doc) return reply.status(404).send({ error: { message: "NFS-e tomada não encontrada" } });
        if (doc.constaWinthor === true) return reply.status(400).send({ error: { message: "NFS-e já lançada no WinThor." } });
        if (!isOracleEnabled()) return reply.status(503).send({ error: { message: "Oracle não disponível." } });

        const cgc = limparCnpj(doc.cnpjPrestador);
        if (!cgc || cgc.length < 11) return reply.status(400).send({ error: { message: "CNPJ do prestador inválido." } });
        const formatCgcOracle = cgc.length === 14
            ? `${cgc.slice(0,2)}.${cgc.slice(2,5)}.${cgc.slice(5,8)}/${cgc.slice(8,12)}-${cgc.slice(12)}`
            : `${cgc.slice(0,3)}.${cgc.slice(3,6)}.${cgc.slice(6,9)}-${cgc.slice(9)}`;

        const valorServico = Number(doc.valorServico || 0);
        const hoje = new Date().toISOString().slice(0, 10);
        const tipoPessoa = cgc.length === 14 ? "J" : "F";
        const isSimples = Boolean(doc.simplesNacional || doc.regimeTributario === "SIMPLES");
        // dtvenc pode vir do frontend (usuário informa manualmente)
        const dtvencFrontend = typeof req.body?.dtvenc === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.body.dtvenc)
            ? req.body.dtvenc : null;

        try {
            // ── 1. Buscar padrão histórico: último lançamento de serviço para este CNPJ ──
            const histRes = await executeOracle(`
                SELECT l.CODFORNEC, l.CODCONTA, l.CODFILIAL, l.HISTORICO,
                       CASE WHEN l.NUMTRANSENT IS NOT NULL THEN 1 ELSE 0 END AS TEM_NFENT,
                       NVL(ROUND(l.DTVENC - l.DTLANC), 7) AS DIAS_VENC
                FROM PCLANC l
                JOIN PCFORNEC f ON f.CODFORNEC = l.CODFORNEC
                WHERE REGEXP_REPLACE(f.CGC, '[^0-9]', '') = :cgcDigits
                  AND l.NFSERVICO = 'S'
                  AND l.RECNUM = l.RECNUMPRINC
                  AND l.TIPOLANC = 'C'
                ORDER BY l.DTLANC DESC, l.RECNUM DESC
                FETCH FIRST 1 ROWS ONLY
            `, { cgcDigits: cgc });
            const histRows = histRes.rows ?? [];

            let codfornec, codconta, codfilial, historico, temNfent, diasVenc;

            if (histRows.length > 0) {
                const hr = histRows[0];
                codfornec = hr.CODFORNEC;
                codconta  = hr.CODCONTA;
                codfilial = hr.CODFILIAL || 1;
                historico = hr.HISTORICO || "T.I";
                temNfent  = Number(hr.TEM_NFENT) === 1;
                diasVenc  = Number(hr.DIAS_VENC) || 7;
            } else {
                // Sem histórico: busca CODFORNEC direto; cadastra se não existir
                const fornecRes = await executeOracle(
                    `SELECT CODFORNEC FROM PCFORNEC WHERE REGEXP_REPLACE(CGC, '[^0-9]', '') = :cgcDigits AND ROWNUM = 1`,
                    { cgcDigits: cgc }
                );
                const fornecRows = fornecRes.rows ?? [];
                if (fornecRows.length === 0) {
                    const gapRes = await executeOracle(`
                        SELECT MIN(CODFORNEC + 1) AS PROX FROM PCFORNEC a
                        WHERE CODFORNEC < 999999
                          AND NOT EXISTS (SELECT 1 FROM PCFORNEC b WHERE b.CODFORNEC = a.CODFORNEC + 1)
                    `, []);
                    codfornec = ((gapRes.rows ?? [])[0] || {}).PROX;
                    if (!codfornec) throw new Error("Sem código de fornecedor disponível (PCFORNEC cheio).");
                    const nomeFornec = String(doc.nomePrestador || `FORNECEDOR ${cgc}`).slice(0, 60).toUpperCase();
                    await executeOracle(`
                        INSERT INTO PCFORNEC (
                            CODFORNEC, FORNECEDOR, CGC, TIPOPESSOA, TIPOFORNEC,
                            SIMPLESNACIONAL, EXCLUIDO, DTCADASTRO
                        ) VALUES (
                            :1, :2, :3, :4, :5,
                            :6, 'N', SYSDATE
                        )
                    `, [codfornec, nomeFornec, formatCgcOracle, tipoPessoa, "S", isSimples ? "S" : "N"]);
                } else {
                    codfornec = fornecRows[0].CODFORNEC;
                }
                codconta = 6017;
                codfilial = 1;
                historico = "T.I";
                temNfent  = false;
                diasVenc  = 7;
            }

            // ── 2. Calcular DTVENC ─────────────────────────────────
            // Usa data informada pelo usuário; fallback = hoje + offset histórico
            let dtvenc;
            if (dtvencFrontend) {
                dtvenc = dtvencFrontend;
            } else {
                const dtVencDate = new Date();
                dtVencDate.setDate(dtVencDate.getDate() + diasVenc);
                dtvenc = dtVencDate.toISOString().slice(0, 10);
            }
            const numnota = String(doc.numeroNfse || "0").slice(0, 20);

            // ── 3. INSERT PCNFENT (apenas se padrão histórico o usava) ─
            let numtransent = null;
            if (temNfent) {
                const transRes = await executeOracle(`SELECT NVL(MAX(NUMTRANSENT),0)+1 AS PROX FROM PCNFENT`, []);
                numtransent = (transRes.rows ?? [])[0].PROX;
                await executeOracle(`
                    INSERT INTO PCNFENT (
                        NUMTRANSENT, CODFORNEC, NUMNOTA, ESPECIE, CODFISCAL, CODCONT,
                        DTEMISSAO, DTENT, VLTOTAL, VLISS, CODFILIAL
                    ) VALUES (
                        :1, :2, :3, 'OE', 199, 0,
                        TO_DATE(:4,'YYYY-MM-DD'), SYSDATE, :5, 0, :6
                    )
                `, [numtransent, codfornec, numnota, doc.dataEmissao || hoje, valorServico, codfilial]);
            }

            // ── 4. Gerar RECNUM ─────────────────────────────────────
            const recnumRes = await executeOracle(`SELECT NVL(MAX(RECNUM),0)+1 AS PROX FROM PCLANC`, []);
            const recnumPrinc = (recnumRes.rows ?? [])[0].PROX;

            // ── 5. INSERT PCLANC — título principal ──────────────────
            // VALOR = valorServico total (sem deduções) — padrão histórico 896808
            if (numtransent !== null) {
                await executeOracle(`
                    INSERT INTO PCLANC (
                        RECNUM, RECNUMPRINC, CODFORNEC, NUMNOTA, NUMTRANSENT, NUMTRANSENTNF,
                        CODCONTA, CODFILIAL, VALOR, DTLANC, DTVENC,
                        HISTORICO, NFSERVICO, TIPOLANC,
                        DUPLIC, TIPOPARCEIRO, MOEDA
                    ) VALUES (
                        :1, :2, :3, :4, :5, :6,
                        :7, :8, :9, SYSDATE, TO_DATE(:10,'YYYY-MM-DD'),
                        :11, 'S', 'C',
                        1, 'F', 'R'
                    )
                `, [recnumPrinc, recnumPrinc, codfornec, numnota, numtransent, numtransent,
                    codconta, codfilial, valorServico, dtvenc, String(historico).slice(0, 60)]);
            } else {
                await executeOracle(`
                    INSERT INTO PCLANC (
                        RECNUM, RECNUMPRINC, CODFORNEC, NUMNOTA,
                        CODCONTA, CODFILIAL, VALOR, DTLANC, DTVENC,
                        HISTORICO, NFSERVICO, TIPOLANC,
                        DUPLIC, TIPOPARCEIRO, MOEDA
                    ) VALUES (
                        :1, :2, :3, :4,
                        :5, :6, :7, SYSDATE, TO_DATE(:8,'YYYY-MM-DD'),
                        :9, 'S', 'C',
                        1, 'F', 'R'
                    )
                `, [recnumPrinc, recnumPrinc, codfornec, numnota,
                    codconta, codfilial, valorServico, dtvenc, String(historico).slice(0, 60)]);
            }

            // ── 6. Atualizar registro Torre ──────────────────────────
            doc.constaWinthor = true;
            doc.winthorLancadoEm = new Date().toISOString();
            doc.winthorRecnum = recnumPrinc;
            doc.winthorNumtransent = numtransent;
            doc.atualizadoEm = new Date().toISOString();
            await persistirNfse();

            registrarLog({
                acao: "LANCAR_WINTHOR", entidade: "nfseTomadas", entidadeId: doc.id,
                usuario, ip,
                detalhe: { codfornec, numtransent, recnumPrinc, valorServico, codconta, codfilial, historico, diasVenc },
            });

            return reply.send({
                ok: true,
                codfornec,
                numtransent,
                recnumPrinc,
                valorServico,
                codconta,
                codfilial,
                historico,
                dtvenc,
                usouHistorico: histRows.length > 0,
                mensagem: `NFS-e ${doc.numeroNfse} lançada no WinThor. CODFORNEC ${codfornec}, CODCONTA ${codconta}, RECNUM ${recnumPrinc}.`,
            });

        } catch (e) {
            app.log.error({ msg: "LANCAR_WINTHOR_ERRO", erro: e.message, stack: e.stack });
            return reply.status(500).send({ error: { message: `Erro ao lançar no WinThor: ${e.message}` } });
        }
    });

    app.post("/api/fiscal/nfse/conciliacao/executar", async (req, reply) => {
        // Atalho para validar-winthor (mantido para compatibilidade com frontend)
        const res = await (async () => {
            initDb();
            const usuario = getUsuario(req);
            const ip = getIp(req);
            let encontradas = 0;
            let naoEncontradas = 0;

            if (!isOracleEnabled()) {
                return { encontradas: 0, naoEncontradas: 0, conciliadas: 0, mensagem: "Oracle não disponível para validação no WinThor." };
            }

            try {
                const sql = `
                    SELECT l.NUMLANC, l.CODFOR, l.VALOR, l.DTLANC, l.NUMDOC,
                           f.CGC
                    FROM PCLANC l
                    LEFT JOIN PCFORNEC f ON f.CODFORNEC = l.CODFOR
                    WHERE l.DTLANC >= SYSDATE - 365
                    AND l.CODTIPOP = 2
                    AND ROWNUM <= 2000
                `;
                const rows = await executeOracle(sql, []);
                const now = new Date().toISOString();

                for (const tomada of db.nfseTomadas) {
                    const cnpj = limparCnpj(tomada.cnpjPrestador);
                    const valor = Number(tomada.valorServico || 0);
                    const numdoc = String(tomada.numeroNfse || "").trim();

                    let match = numdoc
                        ? rows.find(r => limparCnpj(r.CGC || "") === cnpj && String(r.NUMDOC || "").trim() === numdoc)
                        : null;
                    if (!match) {
                        match = rows.find(r => limparCnpj(r.CGC || "") === cnpj && Math.abs(Number(r.VALOR || 0) - valor) < 0.02);
                    }

                    if (match) {
                        tomada.constaWinthor = true;
                        tomada.conciliado = true;
                        tomada.pclancId = match.NUMLANC;
                        tomada.atualizadoEm = now;
                        encontradas++;
                    } else {
                        tomada.constaWinthor = false;
                        tomada.atualizadoEm = now;
                        naoEncontradas++;
                    }
                }
            } catch (e) {
                app.log.warn({ e: e.message }, "conciliacao oracle query failed");
            }

            registrarLog({ acao: "CONCILIAR_NFSE_TOMADAS", entidade: "nfseTomadas", entidadeId: "batch", usuario, ip, detalhe: { encontradas, naoEncontradas } });
            await persistirNfse();
            return { conciliadas: encontradas, encontradas, naoEncontradas, mensagem: `${encontradas} nota(s) no WinThor; ${naoEncontradas} NÃO constam no WinThor.` };
        })();
        return reply.send(res);
    });

    // ===========================================================
    // DIAGNÓSTICO DE REJEIÇÕES
    // ===========================================================
    app.get("/api/fiscal/nfse/diagnosticos", async (req, reply) => {
        initDb();
        const emitidas = db.nfseEmitidas || [];
        const comErro = emitidas.filter(e => e.status === "ERRO" || e.status === "REJEITADA");
        const rejeicoesPorMotivo = {};
        for (const e of comErro) {
            const motivo = e.motivoRejeicao || "Motivo não especificado";
            rejeicoesPorMotivo[motivo] = (rejeicoesPorMotivo[motivo] || 0) + 1;
        }
        return reply.send({
            totalComErro: comErro.length,
            rejeicoesPorMotivo,
            ultimas: comErro.slice(0, 20).map(e => ({
                id: e.id, numeroRps: e.numeroRps, nomeTomador: e.nomeTomador,
                valorServico: e.valorServico, motivoRejeicao: e.motivoRejeicao, dataEmissao: e.dataEmissao,
            })),
        });
    });

    // ===========================================================
    // REFORMA TRIBUTÁRIA (IBS/CBS) — SIMULAÇÃO
    // ===========================================================
    app.post("/api/fiscal/nfse/reforma-tributaria/simular", async (req, reply) => {
        initDb();
        const body = req.body || {};
        const valor = Number(body.valorServico || 0);
        const municipio = body.municipio || db.nfseConfig?.municipioEmissor || "N/A";

        // Tabela progressiva de transição 2026-2033
        const anoAtual = new Date().getFullYear();
        const anoTransicaoInicio = 2026;
        const anoTransicaoFim = 2033;
        const progressoTransicao = Math.min(1, Math.max(0, (anoAtual - anoTransicaoInicio) / (anoTransicaoFim - anoTransicaoInicio)));

        const aliquotaIssAtual = Number(body.aliquotaIss || db.nfseConfig?.aliquotaIssDefault || 5);
        const aliquotaIbsCbs = 26.5; // Alíquota padrão IBS+CBS proposta
        const fracaoIbs = 0.175;     // IBS municipal/estadual: ~17,5%
        const fracaoCbs = 0.09;      // CBS federal: ~9%

        const issAtual = valor * aliquotaIssAtual / 100;
        const ibsSimulado = valor * fracaoIbs;
        const cbsSimulado = valor * fracaoCbs;
        const diferencaEstimada = ibsSimulado + cbsSimulado - issAtual;

        return reply.send({
            municipio, valorServico: valor, anoAtual,
            regimeAtual: {
                aliquotaIss: aliquotaIssAtual,
                valorIss: parseFloat(issAtual.toFixed(2)),
            },
            regimeNovo: {
                aliquotaIbs: fracaoIbs * 100,
                aliquotaCbs: fracaoCbs * 100,
                valorIbs: parseFloat(ibsSimulado.toFixed(2)),
                valorCbs: parseFloat(cbsSimulado.toFixed(2)),
                totalIbsCbs: parseFloat((ibsSimulado + cbsSimulado).toFixed(2)),
            },
            progressoTransicao: parseFloat((progressoTransicao * 100).toFixed(1)),
            diferencaEstimada: parseFloat(diferencaEstimada.toFixed(2)),
            alerta: diferencaEstimada > 0
                ? `Carga tributária estimada aumenta R$ ${diferencaEstimada.toFixed(2)} na transição para IBS/CBS.`
                : `Carga tributária estimada reduz R$ ${Math.abs(diferencaEstimada).toFixed(2)} na transição para IBS/CBS.`,
            aviso: "Simulação baseada em proposta da Reforma Tributária (LC 214/2024). Alíquotas e regras sujeitas a alteração.",
        });
    });

    app.get("/api/fiscal/nfse/reforma-tributaria/status", async (req, reply) => {
        initDb();
        return reply.send({
            leiComplementar: "LC 214/2024",
            vigencia: "2026-2033 (transição gradual)",
            ibsVigente: new Date().getFullYear() >= 2026,
            aliquotaIbsSimulada: 17.5,
            aliquotaCbsSimulada: 9.0,
            totalSimulado: 26.5,
            substituiISS: true,
            municipioEmissor: db.nfseConfig?.municipioEmissor || "Não configurado",
            aviso: "Configure o município emissor na aba Configurações para simulações mais precisas.",
        });
    });

    // ===========================================================
    // AUDITORIA NFS-e
    // ===========================================================
    app.get("/api/fiscal/nfse/auditoria", async (req, reply) => {
        initDb();
        const q = req.query;
        let logs = [...(db.nfseLogAuditoria || [])];
        if (q.acao) logs = logs.filter(l => l.acao === q.acao);
        if (q.usuario) logs = logs.filter(l => (l.usuario || "").toLowerCase().includes(q.usuario.toLowerCase()));
        if (q.dataInicio) logs = logs.filter(l => (l.criadoEm || "") >= q.dataInicio);
        return reply.send(paginar(logs, q.page, q.pageSize));
    });

    // ===========================================================
    // CONFIGURAÇÕES
    // ===========================================================
    app.get("/api/fiscal/nfse/config", async (req, reply) => {
        initDb();
        return reply.send(db.nfseConfig || {});
    });

    app.put("/api/fiscal/nfse/config", async (req, reply) => {
        initDb();
        const body = req.body || {};
        const campos = [
            "ambiente", "municipioEmissor", "codigoMunicipio", "inscricaoMunicipal",
            "cnpjEmissor", "regimeTributario",
            "aliquotaIssDefault", "retencaoIss", "emiteNfse",
            "urlPrefeitura", "versaoDps", "serieRps",
        ];
        if (!db.nfseConfig) db.nfseConfig = {};
        for (const c of campos) {
            if (body[c] !== undefined) db.nfseConfig[c] = body[c];
        }

        registrarLog({
            acao: "ALTERAR_CONFIG_NFSE", entidade: "nfseConfig", entidadeId: "config",
            usuario: getUsuario(req), ip: getIp(req), detalhe: body,
        });

        await persistirNfse();
        return reply.send(db.nfseConfig);
    });

    // ===========================================================
    // COFRE XML NFS-e
    // ===========================================================
    app.get("/api/fiscal/nfse/xml-cofre", async (req, reply) => {
        initDb();
        const q = req.query;
        const emitidas = db.nfseEmitidas || [];
        let docs = emitidas.filter(e => e.xmlHash);

        if (q.status) docs = docs.filter(d => d.status === q.status);
        if (q.competencia) docs = docs.filter(d => (d.competencia || "").startsWith(q.competencia));

        const safe = docs.map(({ xmlConteudo, ...rest }) => ({
            id: rest.id,
            numeroNfse: rest.numeroNfse,
            nomeTomador: rest.nomeTomador,
            valorServico: rest.valorServico,
            competencia: rest.competencia,
            dataEmissao: rest.dataEmissao,
            status: rest.status,
            xmlHash: rest.xmlHash,
            temXml: Boolean(rest.xmlHash),
        }));

        registrarLog({
            acao: "CONSULTAR_COFRE_XML", entidade: "nfseXmlCofre", entidadeId: "query",
            usuario: getUsuario(req), ip: getIp(req),
        });

        return reply.send(paginar(safe, q.page, q.pageSize));
    });

    // ===========================================================
    // DASHBOARD INTEGRADO COM WINTHOR
    // ===========================================================
    app.get("/api/fiscal/nfse/integracao-winthor", async (req, reply) => {
        initDb();
        const result = {
            tomadoresCadastrados: db.nfseTomadores?.length || 0,
            servicosCadastrados: db.nfseServicos?.length || 0,
            tomadasPendenteConciliacao: (db.nfseTomadas || []).filter(t => !t.conciliado).length,
            oracleDisponivel: isOracleEnabled(),
        };

        if (isOracleEnabled()) {
            try {
                const r1 = await executeOracle("SELECT COUNT(*) CNT FROM PCCLIENT WHERE ATIVO='S' AND CGC_CPF IS NOT NULL", []);
                result.clientesWinthor = r1[0]?.CNT || 0;
            } catch {}
            try {
                const r2 = await executeOracle("SELECT COUNT(*) CNT FROM PCPRODUT WHERE CODPROD > 0", []);
                result.produtosWinthor = r2[0]?.CNT || 0;
            } catch {}
        }

        return reply.send(result);
    });
}
