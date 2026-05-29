import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
const _require = createRequire(import.meta.url);
const QRCode = _require("qrcode");
import { db, nextId, appendAudit } from "../repositories/dataStore.js";
import { persistCollection } from "../repositories/persistentCollectionStore.js";
import { executeOracle, isOracleEnabled } from "../db/oracle.js";

// ── Constantes de status ──────────────────────────────────────────────────────
const STATUS = {
    PENDENTE_APROVACAO: "PENDENTE_APROVACAO",
    APROVADA: "APROVADA",
    NEGADA: "NEGADA",
    EXPIRADA: "EXPIRADA",
    SAIDA_REALIZADA: "SAIDA_REALIZADA",
    RETORNO_CONFIRMADO: "RETORNO_CONFIRMADO",
    CANCELADA: "CANCELADA",
};

// Códigos com permissão de aprovar saídas (MAXSUEL=19, CLEITON RAMOS=270)
const APPROVER_CODIGOS = ["19", "270"];

// Validade padrão: 2 horas em ms
const DEFAULT_VALIDITY_MS = 2 * 60 * 60 * 1000;

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateToken() {
    return randomUUID().replace(/-/g, "");
}

function pad4(n) {
    return String(n).padStart(4, "0");
}

function nextSaidaCode() {
    const year = new Date().getFullYear();
    const list = db.portariaSaidaFuncionario;
    let max = 0;
    for (const item of list) {
        const m = (item.id || "").match(new RegExp(`^PSF-${year}-(\\d{4})$`));
        if (m) {
            const n = Number(m[1]);
            if (n > max) max = n;
        }
    }
    return `PSF-${year}-${pad4(max + 1)}`;
}

function currentUser(req) {
    return req?.authUser?.nome ?? "system";
}

function currentUserSub(req) {
    return req?.authUser?.sub ?? "0";
}

function appendSaidaLog(id, acao, statusAnterior, statusNovo, usuario, observacao, req) {
    const log = {
        id: nextId("SFL", db.portariaSaidaFuncionarioLog.length),
        idRequisicao: id,
        acao,
        statusAnterior,
        statusNovo,
        codUsuario: currentUserSub(req),
        nomeUsuario: currentUser(req),
        dataHora: new Date().toISOString(),
        observacao: observacao || "",
        ip: req?.ip || req?.socket?.remoteAddress || "",
        userAgent: req?.headers?.["user-agent"] || "",
    };
    db.portariaSaidaFuncionarioLog.unshift(log);
    return log;
}

function refreshExpired() {
    const now = new Date().toISOString();
    for (const item of db.portariaSaidaFuncionario) {
        if (
            item.status === STATUS.PENDENTE_APROVACAO ||
            item.status === STATUS.APROVADA
        ) {
            if (item.qrExpiraEm && item.qrExpiraEm < now) {
                item.status = STATUS.EXPIRADA;
                item.atualizadoEm = now;
                item.atualizadoPor = "system";
            }
        }
    }
}

async function lookupFuncionario(codFunc) {
    if (!isOracleEnabled() || !codFunc) return null;
    try {
        const result = await executeOracle(
            `SELECT MATRICULA, NOME, CODFILIAL, CODSETOR, CODFUNCAO FROM PCEMPR WHERE MATRICULA = :cod AND SITUACAO = 'A'`,
            { cod: codFunc }
        );
        const rows = Array.isArray(result.rows) ? result.rows : [];
        if (!rows[0]) return null;
        const r = rows[0];
        return {
            codFunc: String(r.MATRICULA || "").trim(),
            nomeFuncionario: String(r.NOME || "").trim(),
            codFilial: String(r.CODFILIAL || "").trim(),
            setor: String(r.CODSETOR || "").trim(),
            cargo: String(r.CODFUNCAO || "").trim(),
        };
    } catch {
        return null;
    }
}

// ── Schemas ───────────────────────────────────────────────────────────────────
const criarSaidaSchema = z.object({
    motivo: z.enum(["MEDICO", "BANCO", "FARMACIA", "PESSOAL", "ALMOCO_EXTERNO", "OUTRO"]),
    observacao: z.string().trim().max(1200).optional().or(z.literal("")),
    validadeMinutos: z.coerce.number().int().min(5).max(480).optional().default(120),
});

const aprovarSchema = z.object({
    observacao: z.string().trim().max(1200).optional().or(z.literal("")),
});

const negarSchema = z.object({
    observacao: z.string().trim().min(1, "Observação obrigatória ao negar").max(1200),
});

const validarQrSchema = z.object({
    token: z.string().trim().min(1),
});

const confirmarSaidaSchema = z.object({
    acao: z.enum(["SAIDA", "RETORNO"]).optional().default("SAIDA"),
    localLeitura: z.string().trim().max(120).optional().or(z.literal("")),
    observacao: z.string().trim().max(600).optional().or(z.literal("")),
});

// ── Plugin de rotas ───────────────────────────────────────────────────────────
export async function portariaSaidaFuncionarioRoutes(app) {

    // POST /api/portaria/saida-funcionario/solicitar
    app.post("/api/portaria/saida-funcionario/solicitar", async (req, reply) => {
        const payload = criarSaidaSchema.parse(req.body);
        const nowIso = new Date().toISOString();
        const validadeMs = (payload.validadeMinutos ?? 120) * 60 * 1000;
        const expiraEm = new Date(Date.now() + validadeMs).toISOString();
        const id = nextSaidaCode();
        const qrToken = generateToken();

        const codFunc = currentUserSub(req);
        const nomeFuncionario = currentUser(req);

        // Try to enrich with Oracle data (setor/codFilial), non-blocking
        const oracle = await lookupFuncionario(codFunc).catch(() => null);

        const record = {
            id,
            codFunc,
            funcionarioMatricula: codFunc,
            nomeFuncionario,
            funcionarioNome: nomeFuncionario,
            codFilial: oracle?.codFilial || "",
            setor: oracle?.setor || "",
            cargo: oracle?.cargo || "",
            motivo: payload.motivo,
            observacaoSolicitante: payload.observacao || "",
            status: STATUS.PENDENTE_APROVACAO,
            qrToken,
            qrExpiraEm: expiraEm,
            codAprovador: null,
            nomeAprovador: null,
            aprovadorNome: null,
            dataAprovacao: null,
            observacaoAprovador: null,
            codPorteiro: null,
            nomePorteiro: null,
            dataLeituraPortaria: null,
            saidaEm: null,
            retornoEm: null,
            criadoPor: nomeFuncionario,
            criadoEm: nowIso,
            atualizadoPor: nomeFuncionario,
            atualizadoEm: nowIso,
        };

        db.portariaSaidaFuncionario.unshift(record);
        appendSaidaLog(id, "CRIAR", null, STATUS.PENDENTE_APROVACAO, nomeFuncionario, "Solicitacao de saida criada.", req);
        appendAudit("CRIAR", "PORTARIA_SAIDA_FUNC", id, `Solicitacao de saida criada por ${nomeFuncionario}`, nomeFuncionario);
        await persistCollection("portariaSaidaFuncionario");
        await persistCollection("portariaSaidaFuncionarioLog");
        return reply.status(201).send(record);
    });

    // GET /api/portaria/saida-funcionario/qrcode-image?token=... (público)
    app.get("/api/portaria/saida-funcionario/qrcode-image", async (req, reply) => {
        const token = String(req.query?.token || "").trim();
        if (!token || token.length > 200) {
            return reply.status(400).send("token invalido");
        }
        const buf = await QRCode.toBuffer(token, {
            width: 300,
            margin: 2,
            color: { dark: "#000000", light: "#FFFFFF" },
        });
        return reply
            .header("Content-Type", "image/png")
            .header("Cache-Control", "public, max-age=3600")
            .send(buf);
    });

    // GET /api/portaria/saida-funcionario/pendentes
    app.get("/api/portaria/saida-funcionario/pendentes", async (req) => {
        refreshExpired();
        const items = db.portariaSaidaFuncionario.filter(
            (item) => item.status === STATUS.PENDENTE_APROVACAO
        );
        return items;
    });

    // GET /api/portaria/saida-funcionario
    app.get("/api/portaria/saida-funcionario", async (req) => {
        refreshExpired();
        const query = (req.query ?? {});
        let items = [...db.portariaSaidaFuncionario];
        if (query.status) items = items.filter((i) => i.status === query.status);
        if (query.codFunc) items = items.filter((i) => i.codFunc === query.codFunc);
        if (query.codFilial) items = items.filter((i) => i.codFilial === query.codFilial);
        // Accept both param name variants (frontend sends: funcionario, dataInicial, dataFinal)
        const qFunc = query.funcionario || query.nomeFuncionario;
        if (qFunc) {
            const q = String(qFunc).toUpperCase();
            items = items.filter((i) =>
                (i.funcionarioNome || i.nomeFuncionario || "").toUpperCase().includes(q) ||
                (i.funcionarioMatricula || i.codFunc || "").includes(q)
            );
        }
        const dataIni = query.dataInicial || query.dataInicio;
        if (dataIni) items = items.filter((i) => i.criadoEm >= dataIni);
        const dataFim = query.dataFinal || query.dataFim;
        if (dataFim) items = items.filter((i) => i.criadoEm <= dataFim + "T23:59:59Z");
        if (query.aprovador) {
            const q = String(query.aprovador).toUpperCase();
            items = items.filter((i) => (i.nomeAprovador || i.aprovadorNome || "").toUpperCase().includes(q));
        }
        const limit = query.limit ? Math.min(Number(query.limit) || 100, 500) : 100;
        return items.slice(0, limit);
    });

    // GET /api/portaria/saida-funcionario/:id
    app.get("/api/portaria/saida-funcionario/:id", async (req, reply) => {
        refreshExpired();
        const { id } = z.object({ id: z.string() }).parse(req.params);
        const item = db.portariaSaidaFuncionario.find((i) => i.id === id);
        if (!item) return reply.status(404).send({ error: { message: "Solicitação não encontrada." } });
        return item;
    });

    // GET /api/portaria/saida-funcionario/:id/log
    app.get("/api/portaria/saida-funcionario/:id/log", async (req) => {
        const { id } = z.object({ id: z.string() }).parse(req.params);
        return db.portariaSaidaFuncionarioLog.filter((l) => l.idRequisicao === id);
    });

    // POST /api/portaria/saida-funcionario/:id/aprovar
    app.post("/api/portaria/saida-funcionario/:id/aprovar", async (req, reply) => {
        // Validar permissão no backend: apenas PCEMPR.CODIGO = 19 / MAXSUEL
        if (!APPROVER_CODIGOS.includes(currentUserSub(req))) {
            return reply.status(403).send({ error: { message: "Apenas o usuário autorizado (MAXSUEL) pode aprovar solicitações de saída." } });
        }
        const { id } = z.object({ id: z.string() }).parse(req.params);
        const payload = aprovarSchema.parse(req.body ?? {});
        const idx = db.portariaSaidaFuncionario.findIndex((i) => i.id === id);
        if (idx < 0) return reply.status(404).send({ error: { message: "Solicitação não encontrada." } });
        const item = db.portariaSaidaFuncionario[idx];
        if (item.status !== STATUS.PENDENTE_APROVACAO) {
            return reply.status(409).send({ error: { message: `Não é possível aprovar uma solicitação com status ${item.status}.` } });
        }
        const nowIso = new Date().toISOString();
        const statusAnterior = item.status;
        item.status = STATUS.APROVADA;
        item.codAprovador = currentUserSub(req);
        item.nomeAprovador = currentUser(req);
        item.aprovadorNome = currentUser(req);
        item.dataAprovacao = nowIso;
        item.observacaoAprovador = payload.observacao || "";
        item.atualizadoPor = currentUser(req);
        item.atualizadoEm = nowIso;
        appendSaidaLog(id, "APROVAR", statusAnterior, STATUS.APROVADA, currentUser(req), payload.observacao || "", req);
        appendAudit("APROVAR", "PORTARIA_SAIDA_FUNC", id, `Saida aprovada por ${currentUser(req)}`, currentUser(req));
        await persistCollection("portariaSaidaFuncionario");
        await persistCollection("portariaSaidaFuncionarioLog");
        return item;
    });

    // POST /api/portaria/saida-funcionario/:id/negar
    app.post("/api/portaria/saida-funcionario/:id/negar", async (req, reply) => {
        if (!APPROVER_CODIGOS.includes(currentUserSub(req))) {
            return reply.status(403).send({ error: { message: "Apenas o usuário autorizado (MAXSUEL) pode negar solicitações de saída." } });
        }
        const { id } = z.object({ id: z.string() }).parse(req.params);
        const payload = negarSchema.parse(req.body ?? {});
        const idx = db.portariaSaidaFuncionario.findIndex((i) => i.id === id);
        if (idx < 0) return reply.status(404).send({ error: { message: "Solicitação não encontrada." } });
        const item = db.portariaSaidaFuncionario[idx];
        if (item.status !== STATUS.PENDENTE_APROVACAO) {
            return reply.status(409).send({ error: { message: `Não é possível negar uma solicitação com status ${item.status}.` } });
        }
        const nowIso = new Date().toISOString();
        const statusAnterior = item.status;
        item.status = STATUS.NEGADA;
        item.codAprovador = currentUserSub(req);
        item.nomeAprovador = currentUser(req);
        item.dataAprovacao = nowIso;
        item.observacaoAprovador = payload.observacao;
        item.atualizadoPor = currentUser(req);
        item.atualizadoEm = nowIso;
        appendSaidaLog(id, "NEGAR", statusAnterior, STATUS.NEGADA, currentUser(req), payload.observacao, req);
        appendAudit("NEGAR", "PORTARIA_SAIDA_FUNC", id, `Saida negada por ${currentUser(req)}: ${payload.observacao}`, currentUser(req));
        await persistCollection("portariaSaidaFuncionario");
        await persistCollection("portariaSaidaFuncionarioLog");
        return item;
    });

    // POST /api/portaria/saida-funcionario/:id/cancelar
    app.post("/api/portaria/saida-funcionario/:id/cancelar", async (req, reply) => {
        const { id } = z.object({ id: z.string() }).parse(req.params);
        const idx = db.portariaSaidaFuncionario.findIndex((i) => i.id === id);
        if (idx < 0) return reply.status(404).send({ error: { message: "Solicitação não encontrada." } });
        const item = db.portariaSaidaFuncionario[idx];
        const cancelableStatuses = new Set([STATUS.PENDENTE_APROVACAO, STATUS.APROVADA]);
        if (!cancelableStatuses.has(item.status)) {
            return reply.status(409).send({ error: { message: `Não é possível cancelar uma solicitação com status ${item.status}.` } });
        }
        const nowIso = new Date().toISOString();
        const statusAnterior = item.status;
        item.status = STATUS.CANCELADA;
        item.atualizadoPor = currentUser(req);
        item.atualizadoEm = nowIso;
        appendSaidaLog(id, "CANCELAR", statusAnterior, STATUS.CANCELADA, currentUser(req), "", req);
        appendAudit("CANCELAR", "PORTARIA_SAIDA_FUNC", id, `Solicitacao cancelada`, currentUser(req));
        await persistCollection("portariaSaidaFuncionario");
        await persistCollection("portariaSaidaFuncionarioLog");
        return item;
    });

    // POST /api/portaria/saida-funcionario/validar-qrcode
    app.post("/api/portaria/saida-funcionario/validar-qrcode", async (req, reply) => {
        refreshExpired();
        const payload = validarQrSchema.parse(req.body ?? {});
        const token = payload.token.trim();
        const item = db.portariaSaidaFuncionario.find((i) => i.qrToken === token);

        if (!item) {
            appendSaidaLog("UNKNOWN", "QR_INVALIDO", null, null, currentUser(req), `Token invalido: ${token.slice(0, 8)}...`, req);
            return reply.status(200).send({
                status: "QR_CODE_INVALIDO",
                mensagem: "QR CODE INVÁLIDO",
                permitirConfirmacao: false,
            });
        }

        const nowIso = new Date().toISOString();
        appendSaidaLog(item.id, "LEITURA_QR", item.status, item.status, currentUser(req), "Leitura de QR Code na portaria.", req);

        if (item.status === STATUS.EXPIRADA || (item.qrExpiraEm && item.qrExpiraEm < nowIso)) {
            if (item.status !== STATUS.EXPIRADA) {
                item.status = STATUS.EXPIRADA;
                item.atualizadoEm = nowIso;
            }
            return reply.status(200).send({
                status: "EXPIRADA",
                mensagem: "QR CODE EXPIRADO",
                permitirConfirmacao: false,
                id: item.id,
            });
        }
        if (item.status === STATUS.SAIDA_REALIZADA) {
            return reply.status(200).send({
                valido: true,
                status: "SAIDA_REALIZADA",
                mensagem: "FUNCIONARIO FORA — AGUARDANDO RETORNO",
                permitirConfirmacao: true,
                id: item.id,
                nomeFuncionario: item.funcionarioNome || item.nomeFuncionario,
                saidaEm: item.saidaEm,
                solicitacao: item,
            });
        }
        if (item.status === STATUS.RETORNO_CONFIRMADO) {
            return reply.status(200).send({
                valido: true,
                status: "RETORNO_CONFIRMADO",
                mensagem: "RETORNO JÁ CONFIRMADO",
                permitirConfirmacao: false,
                id: item.id,
                nomeFuncionario: item.funcionarioNome || item.nomeFuncionario,
                retornoEm: item.retornoEm,
                solicitacao: item,
            });
        }
        if (item.status === STATUS.NEGADA) {
            return reply.status(200).send({
                status: "NEGADA",
                mensagem: "SAÍDA NEGADA PELA DIRETORIA",
                permitirConfirmacao: false,
                id: item.id,
                nomeFuncionario: item.nomeFuncionario,
                observacaoAprovador: item.observacaoAprovador,
            });
        }
        if (item.status === STATUS.CANCELADA) {
            return reply.status(200).send({
                status: "CANCELADA",
                mensagem: "SOLICITAÇÃO CANCELADA",
                permitirConfirmacao: false,
                id: item.id,
            });
        }
        if (item.status === STATUS.PENDENTE_APROVACAO) {
            return reply.status(200).send({
                status: "PENDENTE_APROVACAO",
                mensagem: "SAÍDA AINDA PENDENTE DE APROVAÇÃO",
                permitirConfirmacao: false,
                id: item.id,
                nomeFuncionario: item.nomeFuncionario,
            });
        }
        if (item.status === STATUS.APROVADA) {
            return reply.status(200).send({
                valido: true,
                status: "APROVADA",
                mensagem: "SAÍDA LIBERADA",
                permitirConfirmacao: true,
                id: item.id,
                nomeFuncionario: item.funcionarioNome || item.nomeFuncionario,
                codFunc: item.codFunc,
                motivo: item.motivo,
                nomeAprovador: item.aprovadorNome || item.nomeAprovador,
                dataAprovacao: item.dataAprovacao,
                solicitacao: item,
            });
        }
        return reply.status(200).send({
            status: item.status,
            mensagem: "Status desconhecido",
            permitirConfirmacao: false,
            id: item.id,
        });
    });

    // POST /api/portaria/saida-funcionario/:id/confirmar-saida
    app.post("/api/portaria/saida-funcionario/:id/confirmar-saida", async (req, reply) => {
        refreshExpired();
        const { id } = z.object({ id: z.string() }).parse(req.params);
        const payload = confirmarSaidaSchema.parse(req.body ?? {});
        const acao = payload.acao ?? "SAIDA";
        const idx = db.portariaSaidaFuncionario.findIndex((i) => i.id === id);
        if (idx < 0) return reply.status(404).send({ error: { message: "Solicitação não encontrada." } });
        const item = db.portariaSaidaFuncionario[idx];
        const nowIso = new Date().toISOString();
        const statusAnterior = item.status;

        if (acao === "SAIDA") {
            if (item.status !== STATUS.APROVADA) {
                const msgs = {
                    [STATUS.PENDENTE_APROVACAO]: "SAÍDA AINDA PENDENTE DE APROVAÇÃO",
                    [STATUS.NEGADA]: "SAÍDA NEGADA PELA DIRETORIA",
                    [STATUS.EXPIRADA]: "QR CODE EXPIRADO",
                    [STATUS.SAIDA_REALIZADA]: "QR CODE JÁ UTILIZADO",
                    [STATUS.CANCELADA]: "SOLICITAÇÃO CANCELADA",
                };
                return reply.status(409).send({ error: { message: msgs[item.status] ?? `Status inválido: ${item.status}` } });
            }
            item.status = STATUS.SAIDA_REALIZADA;
            item.codPorteiro = currentUserSub(req);
            item.nomePorteiro = currentUser(req);
            item.dataLeituraPortaria = nowIso;
            item.saidaEm = nowIso;
            item.localLeitura = payload.localLeitura || "";
            item.atualizadoPor = currentUser(req);
            item.atualizadoEm = nowIso;
            appendSaidaLog(id, "CONFIRMAR_SAIDA", statusAnterior, STATUS.SAIDA_REALIZADA, currentUser(req), payload.observacao || "", req);
            appendAudit("CONFIRMAR_SAIDA", "PORTARIA_SAIDA_FUNC", id, `Saida confirmada por ${currentUser(req)}`, currentUser(req));
        } else {
            if (item.status !== STATUS.SAIDA_REALIZADA) {
                return reply.status(409).send({ error: { message: "Retorno só pode ser confirmado após saída registrada." } });
            }
            item.status = STATUS.RETORNO_CONFIRMADO;
            item.retornoEm = nowIso;
            item.atualizadoPor = currentUser(req);
            item.atualizadoEm = nowIso;
            appendSaidaLog(id, "CONFIRMAR_RETORNO", statusAnterior, STATUS.RETORNO_CONFIRMADO, currentUser(req), payload.observacao || "", req);
            appendAudit("CONFIRMAR_RETORNO", "PORTARIA_SAIDA_FUNC", id, `Retorno confirmado por ${currentUser(req)}`, currentUser(req));
        }

        await persistCollection("portariaSaidaFuncionario");
        await persistCollection("portariaSaidaFuncionarioLog");
        return item;
    });

    // GET /api/portaria/saida-funcionario/funcionario/buscar
    app.get("/api/portaria/saida-funcionario/funcionario/buscar", async (req) => {
        const query = (req.query ?? {});
        const codFunc = String(query.codFunc || "").trim();
        if (!codFunc) return [];
        const oracle = await lookupFuncionario(codFunc);
        if (oracle) return [oracle];
        return [];
    });
}
