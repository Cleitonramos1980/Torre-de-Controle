import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { env, hasSmtpConfig } from "../../config/env.js";
import { AppError } from "../../utils/error.js";
import { insertActionLog, listActionLogs, listInternalTickets, saveInternalTicket, } from "../../repositories/reconai/actionLogsRepository.js";
import { reconaiStore } from "./reconaiStore.js";
function nowIso() {
    return new Date().toISOString();
}
function toNumber(value, fallback = 0) {
    if (value == null)
        return fallback;
    const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
    return Number.isFinite(parsed) ? parsed : fallback;
}
function formatMoney(value) {
    return new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
    }).format(value);
}
function addDaysIso(days) {
    const target = new Date();
    target.setDate(target.getDate() + days);
    return target.toISOString();
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function truncateResponse(response, maxLength = 4000) {
    if (response.length <= maxLength)
        return response;
    return `${response.slice(0, maxLength - 3)}...`;
}
export class AutomationService {
    logger;
    transporter = null;
    constructor(logger) {
        this.logger = logger;
    }
    getTransporter() {
        if (this.transporter)
            return this.transporter;
        if (!hasSmtpConfig()) {
            throw new AppError("SMTP nao configurado para envio automatico de emails.", 503);
        }
        this.transporter = nodemailer.createTransport({
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            secure: env.SMTP_SECURE,
            auth: {
                user: env.SMTP_USER,
                pass: env.SMTP_PASSWORD,
            },
            connectionTimeout: env.SMTP_TIMEOUT_MS,
            socketTimeout: env.SMTP_TIMEOUT_MS,
            greetingTimeout: env.SMTP_TIMEOUT_MS,
        });
        return this.transporter;
    }
    resolveOperadoraEmail(divergencia) {
        const raw = divergencia.rede?.raw ?? {};
        const fromRaw = raw.operadoraEmail ??
            raw.operatorEmail ??
            raw.contatoOperadora;
        const candidate = fromRaw?.trim() || env.RECONAI_OPERADORA_EMAIL;
        if (!candidate) {
            return "operadora@pendente.local";
        }
        return candidate;
    }
    resolveManagerEmail() {
        return env.RECONAI_MANAGER_EMAIL?.trim() || null;
    }
    resolveTransactionDate(divergencia) {
        return (divergencia.venda.dataVenda ??
            divergencia.rede?.dataPagamento ??
            divergencia.winthor?.dtemissao ??
            divergencia.createdAt.slice(0, 10));
    }
    resolveTransactionValue(divergencia) {
        return toNumber(divergencia.venda.valorVenda ?? divergencia.rede?.valorBruto ?? divergencia.winthor?.valorOriginal, 0);
    }
    resolvePrimaryNsu(divergencia) {
        return (divergencia.venda.nsu ??
            divergencia.rede?.nsu ??
            divergencia.venda.raw.nsu ??
            "N/A");
    }
    async registerAction(divergenciaId, actionType, status, response, actions) {
        const safeResponse = truncateResponse(response);
        const actionLog = {
            id: randomUUID(),
            divergencia_id: divergenciaId,
            action_type: actionType,
            status,
            response: safeResponse,
            created_at: nowIso(),
        };
        await insertActionLog(actionLog);
        actions.push({
            actionType,
            status,
            response: safeResponse,
        });
        const logFn = status === "ERROR" ? this.logger.error.bind(this.logger) : this.logger.info.bind(this.logger);
        logFn({
            component: "AutomationService",
            action: "registerAction",
            divergenciaId,
            actionType,
            status,
        }, safeResponse);
    }
    generateEmail(divergencia) {
        const valor = this.resolveTransactionValue(divergencia);
        const data = this.resolveTransactionDate(divergencia);
        const nsu = this.resolvePrimaryNsu(divergencia);
        return {
            destinatario: this.resolveOperadoraEmail(divergencia),
            assunto: "Divergencia financeira identificada",
            corpo: `Prezados,\n\nIdentificamos divergencia na transacao:\n\nNSU: ${nsu}\nValor: ${formatMoney(valor)}\nData: ${data}\n\nSolicitamos analise e correcao.\n\nAtenciosamente`,
        };
    }
    generateDisputeText(divergencia) {
        const valor = this.resolveTransactionValue(divergencia);
        const diferenca = toNumber(divergencia.diferenca_total, 0);
        const data = this.resolveTransactionDate(divergencia);
        const nsu = this.resolvePrimaryNsu(divergencia);
        return [
            "RESUMO TECNICO DA CONTESTACAO",
            `Status da divergencia: ${divergencia.status}`,
            `NSU: ${nsu}`,
            `Valor da transacao: ${formatMoney(valor)}`,
            `Diferenca apurada: ${formatMoney(diferenca)}`,
            `Data de referencia: ${data}`,
            `Score de risco: ${divergencia.risco_score} (${divergencia.risco_nivel})`,
            "",
            "SOLICITACAO FORMAL",
            "Solicitamos revisao da transacao e regularizacao financeira conforme dados conciliados no RECONAI.",
        ].join("\n");
    }
    async createInternalTicket(divergencia) {
        const prioridade = divergencia.risco_nivel === "CRITICO"
            ? "CRITICA"
            : divergencia.risco_nivel === "ALTO"
                ? "ALTA"
                : divergencia.risco_nivel === "MEDIO"
                    ? "MEDIA"
                    : "BAIXA";
        const ticket = {
            id: randomUUID(),
            divergenciaId: divergencia.id,
            titulo: `Divergencia ${divergencia.status} - ${divergencia.id}`,
            descricao: [
                `Filial: ${divergencia.venda.filial ?? "NAO INFORMADA"}`,
                `NSU: ${this.resolvePrimaryNsu(divergencia)}`,
                `Diferenca: ${formatMoney(toNumber(divergencia.diferenca_total, 0))}`,
                `Motivos: ${divergencia.reasons.join(" | ") || "Sem detalhes adicionais"}`,
            ].join("\n"),
            responsavel: `FINANCEIRO_${(divergencia.venda.filial ?? "GERAL").toUpperCase()}`,
            prazo: addDaysIso(prioridade === "CRITICA" ? 1 : prioridade === "ALTA" ? 2 : 5),
            prioridade,
            status: "ABERTO",
            createdAt: nowIso(),
            updatedAt: nowIso(),
        };
        await saveInternalTicket(ticket);
        return ticket;
    }
    async sendEmail(email) {
        if (!hasSmtpConfig()) {
            return {
                status: "ERROR",
                response: "SMTP nao configurado. Email nao enviado.",
            };
        }
        const transporter = this.getTransporter();
        const from = env.SMTP_FROM || env.SMTP_USER || "reconai@localhost";
        for (let attempt = 1; attempt <= env.SMTP_RETRY_ATTEMPTS; attempt += 1) {
            const startedAt = Date.now();
            try {
                const info = await transporter.sendMail({
                    from,
                    to: email.destinatario,
                    subject: email.assunto,
                    text: email.corpo,
                });
                const response = `Email enviado para ${email.destinatario}. MessageId=${info.messageId}`;
                this.logger.info({
                    component: "AutomationService",
                    action: "sendEmail",
                    attempt,
                    durationMs: Date.now() - startedAt,
                    destinatario: email.destinatario,
                }, response);
                return { status: "SUCCESS", response };
            }
            catch (error) {
                const message = error instanceof Error ? error.message : "erro desconhecido";
                this.logger.error({
                    component: "AutomationService",
                    action: "sendEmail",
                    attempt,
                    durationMs: Date.now() - startedAt,
                    destinatario: email.destinatario,
                    error,
                }, "Falha no envio de email");
                if (attempt >= env.SMTP_RETRY_ATTEMPTS) {
                    return {
                        status: "ERROR",
                        response: `Falha ao enviar email apos ${attempt} tentativa(s): ${message}`,
                    };
                }
                await sleep(250 * attempt);
            }
        }
        return {
            status: "ERROR",
            response: "Falha desconhecida no envio de email.",
        };
    }
    shouldEscalate(divergencia) {
        if (divergencia.risco_nivel === "CRITICO")
            return true;
        const valor = Math.abs(this.resolveTransactionValue(divergencia));
        if (valor >= env.AUTOMATION_HIGH_VALUE_THRESHOLD)
            return true;
        if (divergencia.dias_em_aberto > env.AUTOMATION_ESCALATION_DAYS)
            return true;
        return false;
    }
    async applyEscalation(divergencia, actions) {
        if (!this.shouldEscalate(divergencia))
            return;
        const managerEmail = this.resolveManagerEmail();
        if (!managerEmail) {
            await this.registerAction(divergencia.id, "ESCALATE", "SKIPPED", "Escalacao identificada, mas RECONAI_MANAGER_EMAIL nao configurado.", actions);
            return;
        }
        const email = {
            destinatario: managerEmail,
            assunto: `[ESCALACAO] Divergencia critica ${divergencia.id}`,
            corpo: [
                "Foi detectada divergencia com necessidade de escalacao.",
                `ID: ${divergencia.id}`,
                `Status conciliacao: ${divergencia.status}`,
                `Risco: ${divergencia.risco_nivel} (${divergencia.risco_score})`,
                `Diferenca total: ${formatMoney(toNumber(divergencia.diferenca_total, 0))}`,
            ].join("\n"),
        };
        const sendResult = await this.sendEmail(email);
        await this.registerAction(divergencia.id, "ESCALATE", sendResult.status, sendResult.response, actions);
    }
    resolveWorkflowAfterActions(divergencia, actions) {
        const hasEscalate = actions.some((row) => row.actionType === "ESCALATE" && row.status !== "ERROR");
        if (hasEscalate)
            return "ESCALADA";
        if (divergencia.status === "CONCILIADO")
            return "RESOLVIDA";
        if (actions.some((row) => row.actionType === "CREATE_TICKET" && row.status === "SUCCESS")) {
            return "EM_ANALISE";
        }
        if (actions.some((row) => row.actionType === "SEND_EMAIL" && row.status === "SUCCESS") &&
            actions.some((row) => row.actionType === "GENERATE_DISPUTE" && row.status === "SUCCESS")) {
            return "AGUARDANDO_RESPOSTA";
        }
        if (actions.some((row) => row.actionType === "GENERATE_DISPUTE" && row.status === "SUCCESS")) {
            return "CONTESTADA";
        }
        if (actions.length > 0)
            return "EM_ANALISE";
        return divergencia.workflowStatus;
    }
    async executeAction(divergencia) {
        const actions = [];
        const previousWorkflowStatus = divergencia.workflowStatus;
        if (divergencia.status === "NAO_RECEBIDO") {
            const contestacao = this.generateDisputeText(divergencia);
            await this.registerAction(divergencia.id, "GENERATE_DISPUTE", "SUCCESS", contestacao, actions);
            const emailPayload = this.generateEmail(divergencia);
            const emailResult = await this.sendEmail(emailPayload);
            await this.registerAction(divergencia.id, "SEND_EMAIL", emailResult.status, emailResult.response, actions);
        }
        else if (divergencia.status === "DIVERGENTE_TAXA") {
            const relatorio = [
                "RELATORIO AUTOMATICO DE DIVERGENCIA DE TAXA",
                this.generateDisputeText(divergencia),
            ].join("\n\n");
            await this.registerAction(divergencia.id, "GENERATE_DISPUTE", "SUCCESS", relatorio, actions);
            const emailPayload = this.generateEmail(divergencia);
            const emailResult = await this.sendEmail(emailPayload);
            await this.registerAction(divergencia.id, "SEND_EMAIL", emailResult.status, emailResult.response, actions);
        }
        else if (divergencia.status === "NAO_BAIXADO" || divergencia.status === "RECEBIDO_NAO_BAIXADO") {
            const ticket = await this.createInternalTicket(divergencia);
            await this.registerAction(divergencia.id, "CREATE_TICKET", "SUCCESS", `Ticket interno criado: ${ticket.id} (${ticket.prioridade})`, actions);
        }
        else if (divergencia.status === "CONCILIADO") {
            await this.registerAction(divergencia.id, "AUTO_RESOLVE", "SUCCESS", "Transacao conciliada. Nenhuma acao adicional necessaria.", actions);
        }
        else {
            await this.registerAction(divergencia.id, "FLAG_INTERNAL", "SUCCESS", "Divergencia sinalizada para analise manual do financeiro.", actions);
        }
        await this.applyEscalation(divergencia, actions);
        const workflowStatus = this.resolveWorkflowAfterActions(divergencia, actions);
        const updated = reconaiStore.updateWorkflowStatus(divergencia.id, workflowStatus, nowIso());
        if (!updated) {
            throw new AppError(`Divergencia ${divergencia.id} nao encontrada para atualizar workflow.`, 404);
        }
        return {
            divergenciaId: divergencia.id,
            previousWorkflowStatus,
            workflowStatus,
            actions,
        };
    }
    async runAutomation(input) {
        const startedAt = Date.now();
        const divergenceIds = new Set((input?.divergenceIds ?? []).filter(Boolean));
        const onlyCritical = Boolean(input?.onlyCritical);
        const safeLimit = Math.max(1, Math.min(5000, Number(input?.limit ?? 1000)));
        const divergencias = reconaiStore
            .listOpenDivergences()
            .filter((row) => (divergenceIds.size > 0 ? divergenceIds.has(row.id) : true))
            .filter((row) => (divergenceIds.size > 0 ? true : row.workflowStatus === "ABERTA"))
            .filter((row) => (onlyCritical ? row.risco_nivel === "CRITICO" : true))
            .slice(0, safeLimit);
        const results = [];
        let errors = 0;
        let escalated = 0;
        let resolved = 0;
        for (const divergencia of divergencias) {
            try {
                const result = await this.executeAction(divergencia);
                if (result.workflowStatus === "ESCALADA")
                    escalated += 1;
                if (result.workflowStatus === "RESOLVIDA")
                    resolved += 1;
                results.push(result);
            }
            catch (error) {
                errors += 1;
                this.logger.error({
                    component: "AutomationService",
                    action: "runAutomation",
                    divergenciaId: divergencia.id,
                    error,
                }, "Falha ao executar automacao da divergencia");
            }
        }
        this.logger.info({
            component: "AutomationService",
            action: "runAutomation",
            processed: divergencias.length,
            errors,
            escalated,
            resolved,
            durationMs: Date.now() - startedAt,
        }, "Execucao automatica de divergencias concluida");
        return {
            processed: divergencias.length,
            escalated,
            resolved,
            errors,
            durationMs: Date.now() - startedAt,
            results,
        };
    }
    async getActionLogs(input) {
        return listActionLogs(input);
    }
    getInternalTickets(divergenciaId) {
        return listInternalTickets(divergenciaId);
    }
}
