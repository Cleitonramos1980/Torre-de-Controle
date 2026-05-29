import { z } from "zod";
import { randomUUID } from "node:crypto";
import { db, nextId, appendAudit } from "../repositories/dataStore.js";
import { env } from "../config/env.js";
import { executeOracle, isOracleEnabled } from "../db/oracle.js";
import { NFTransitoWinthorService } from "../modules/nfTransito/nfTransitoWinthorService.js";
const SOLICITACAO_STATUS = {
    LINK_GERADO: "LINK_GERADO",
    ENVIADO: "ENVIADO",
    PREENCHIDO: "PREENCHIDO",
    VALIDADO: "VALIDADO",
    RECUSADO: "RECUSADO",
    EXPIRADO: "EXPIRADO",
    CONVERTIDO_EM_ACESSO: "CONVERTIDO_EM_ACESSO",
};
const QR_SCAN_STATUS = {
    ENCONTRADO: "ENCONTRADO",
    EXPIRADO: "EXPIRADO",
    BLOQUEADO: "BLOQUEADO",
    UTILIZADO: "UTILIZADO",
    NAO_ENCONTRADO: "NAO_ENCONTRADO",
};
const BLOQUEADO_STATUS = new Set([
    SOLICITACAO_STATUS.RECUSADO,
    "REJEITADO",
    "RECUSADO",
    "BLOQUEADO",
]);
const EXPIRADO_STATUS = new Set([
    SOLICITACAO_STATUS.EXPIRADO,
    "EXPIRADO",
]);
const UTILIZADO_STATUS = new Set([
    "SAIDA_REALIZADA",
    "SAIDA_REGISTRADA",
    "ENCERRADO",
    "ENTRADA_LIBERADA",
    "ENTRADA_REGISTRADA",
    "EM_PERMANENCIA",
]);
function normalizeQrInput(value) {
    return value.trim();
}
function extractTokenFromQrInput(input) {
    const raw = normalizeQrInput(input);
    if (!raw) {
        return null;
    }
    const byPath = raw.match(/\/visitante\/cadastro\/([A-Za-z0-9_-]{8,})/i);
    if (byPath?.[1]) {
        return byPath[1];
    }
    if (/^[A-Fa-f0-9]{24,64}$/.test(raw) || /^[A-Za-z0-9_-]{24,128}$/.test(raw)) {
        return raw;
    }
    return null;
}
function classifyQrScan(solicitacao, acesso, visitante) {
    const statuses = [solicitacao?.status, acesso?.status, visitante?.status].filter(Boolean);
    if (statuses.some((status) => EXPIRADO_STATUS.has(status))) {
        return {
            status: QR_SCAN_STATUS.EXPIRADO,
            message: "QR Code expirado. Solicite um novo link.",
            permitirLiberacao: false,
        };
    }
    if (statuses.some((status) => BLOQUEADO_STATUS.has(status))) {
        return {
            status: QR_SCAN_STATUS.BLOQUEADO,
            message: "Acesso bloqueado ou recusado.",
            permitirLiberacao: false,
        };
    }
    if (statuses.some((status) => UTILIZADO_STATUS.has(status))) {
        return {
            status: QR_SCAN_STATUS.UTILIZADO,
            message: "Este QR Code ja foi utilizado.",
            permitirLiberacao: false,
        };
    }
    return {
        status: QR_SCAN_STATUS.ENCONTRADO,
        message: "Visitante identificado com sucesso.",
        permitirLiberacao: Boolean(acesso),
    };
}
function isSupportedSelfieDataUrl(value) {
    const normalized = value.trim();
    if (normalized.length === 0)
        return true;
    const lower = normalized.toLowerCase();
    if (lower.startsWith("data:image/jpeg;base64,") || lower.startsWith("data:image/jpg;base64,")) {
        return normalized.includes("/9j/");
    }
    if (lower.startsWith("data:image/png;base64,")) {
        return normalized.includes("iVBOR");
    }
    if (lower.startsWith("data:image/webp;base64,")) {
        return normalized.includes("UklGR");
    }
    return false;
}
function pad4(value) {
    return String(value).padStart(4, "0");
}
function nextOperationalCode(prefix, records) {
    const year = new Date().getFullYear();
    const regex = new RegExp(`^${prefix}-${year}-(\\d{4})$`);
    let max = 0;
    for (const record of records) {
        const candidate = record.codigo || record.id;
        if (!candidate)
            continue;
        const match = candidate.match(regex);
        if (!match)
            continue;
        const seq = Number(match[1]);
        if (Number.isFinite(seq) && seq > max)
            max = seq;
    }
    return `${prefix}-${year}-${pad4(max + 1)}`;
}
function buildSolicitacaoLink(req, token) {
    const fallbackOrigin = "http://localhost:5173";
    const configuredPublicUrl = env.APP_PUBLIC_URL?.trim();
    const originHeader = typeof req.headers?.origin === "string" && req.headers.origin.trim().length > 0
        ? req.headers.origin.trim()
        : fallbackOrigin;
    const baseUrl = (configuredPublicUrl || originHeader).replace(/\/+$/, "");
    return `${baseUrl}/visitante/cadastro/${token}`;
}
function buildTimelineEvent(acessoId, tipo, descricao, usuario, detalhes) {
    return {
        id: nextId("EVT", db.operacionalTimeline.length),
        acessoId,
        tipo,
        descricao,
        dataHora: new Date().toISOString(),
        usuario,
        detalhes,
    };
}
function addSolicitacaoHistorico(solicitacao, tipo, descricao, usuario) {
    if (!Array.isArray(solicitacao.historico)) {
        solicitacao.historico = [];
    }
    solicitacao.historico.unshift({
        id: nextId("HST", solicitacao.historico.length),
        tipo,
        descricao,
        dataHora: new Date().toISOString(),
        usuario,
    });
}
function refreshExpiredSolicitacoes() {
    const nowIso = new Date().toISOString();
    const solicitacoes = db.operacionalSolicitacoesAcesso;
    const acessos = db.operacionalAcessos;
    for (const solicitacao of solicitacoes) {
        if (solicitacao.status !== SOLICITACAO_STATUS.LINK_GERADO && solicitacao.status !== SOLICITACAO_STATUS.ENVIADO) {
            continue;
        }
        if (!solicitacao.expiraEm || solicitacao.expiraEm >= nowIso) {
            continue;
        }
        solicitacao.status = SOLICITACAO_STATUS.EXPIRADO;
        solicitacao.atualizadoEm = nowIso;
        addSolicitacaoHistorico(solicitacao, SOLICITACAO_STATUS.EXPIRADO, "Link expirado automaticamente por validade.", "system");
        const acesso = acessos.find((item) => item.id === solicitacao.acessoId);
        if (acesso) {
            acesso.status = "EXPIRADO";
            acesso.ultimaAtualizacao = nowIso;
        }
    }
}
const FROTA_ORACLE_STATUS_MAP = {
    V: "EM_DESLOCAMENTO",
    L: "DISPONIVEL",
    D: "DISPONIVEL",
    M: "EM_MANUTENCAO",
    B: "BLOQUEADO",
    I: "BLOQUEADO",
    P: "PARADA_NAO_PROGRAMADA",
    A: "DISPONIVEL",
};
const FROTA_ALLOWED_STATUS = new Set([
    "DISPONIVEL",
    "EM_DESLOCAMENTO",
    "PARADA_PROGRAMADA",
    "PARADA_NAO_PROGRAMADA",
    "EM_MANUTENCAO",
    "BLOQUEADO",
]);
function toTrimmedString(value) {
    if (value === null || value === undefined) {
        return "";
    }
    return String(value).trim();
}
function toIsoOrNull(value) {
    if (!value) {
        return null;
    }
    const parsed = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(parsed.getTime())) {
        return null;
    }
    return parsed.toISOString();
}
function toNumberOrNull(value) {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}
function toNumberOrZero(value) {
    const parsed = toNumberOrNull(value);
    return parsed ?? 0;
}
function normalizeStatus(status) {
    const normalized = toTrimmedString(status).toUpperCase();
    if (!normalized) {
        return undefined;
    }
    return FROTA_ALLOWED_STATUS.has(normalized) ? normalized : undefined;
}
function mapOracleSituacaoToStatus(situacao) {
    const key = toTrimmedString(situacao).toUpperCase();
    if (!key) {
        return "DISPONIVEL";
    }
    return FROTA_ORACLE_STATUS_MAP[key] ?? "DISPONIVEL";
}
function buildOracleVehicleId(codVeiculo) {
    return `PCV-${toTrimmedString(codVeiculo)}`;
}
function toIsoDateOnly(value) {
    const iso = toIsoOrNull(value);
    return iso ? iso.slice(0, 10) : null;
}
function calculateTripStatus(row) {
    if (row.DT_CANCEL) {
        return "CANCELADO";
    }
    if (row.DTRETORNO || row.DTFECHA) {
        return "CONCLUIDO";
    }
    return "EM_ROTA";
}
function inferMovementKind(status) {
    if (status === "EM_DESLOCAMENTO") {
        return "SAIDA";
    }
    if (status === "DISPONIVEL" || status === "PARADA_PROGRAMADA" || status === "PARADA_NAO_PROGRAMADA") {
        return "ENTRADA";
    }
    return "ATUALIZACAO";
}
function normalizePlateDigits(value) {
    return toTrimmedString(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}
async function loadFrotaOracleData(logger) {
    if (!isOracleEnabled()) {
        return { vehicles: [], deslocamentos: [] };
    }
    try {
        const vehicleResult = await executeOracle(`
      SELECT
        V.CODVEICULO,
        TRIM(V.PLACA) AS PLACA,
        TRIM(V.DESCRICAO) AS DESCRICAO,
        TRIM(V.MARCA) AS MARCA,
        TRIM(V.TIPOVEICULO) AS TIPOVEICULO,
        TRIM(V.SITUACAO) AS SITUACAO,
        TRIM(V.PROPRIO) AS PROPRIO,
        TRIM(V.CODFILIAL) AS CODFILIAL,
        V.KMATUAL,
        V.ULTVIAGEM
      FROM PCVEICUL V
      WHERE NVL(TRIM(V.SITUACAO), 'L') <> 'I'
      ORDER BY V.CODVEICULO
    `);
        const deslocamentoResult = await executeOracle(`
      SELECT
        C.NUMCAR,
        C.CODVEICULO,
        TRIM(TO_CHAR(C.CODFILIALSAIDA)) AS CODFILIAL,
        C.DTSAIDA,
        C.DTFECHA,
        C.DTRETORNO,
        C.DT_CANCEL,
        TRIM(C.DESTINO) AS DESTINO,
        C.CODMOTORISTA,
        TRIM(E.NOME) AS MOTORISTA,
        TRIM(V.PLACA) AS PLACA
      FROM PCCARREG C
      LEFT JOIN PCEMPR E ON E.MATRICULA = C.CODMOTORISTA
      LEFT JOIN PCVEICUL V ON V.CODVEICULO = C.CODVEICULO
      WHERE C.CODVEICULO > 0
        AND NVL(C.DTSAIDA, C.DATACONF) >= TRUNC(SYSDATE) - 45
      ORDER BY NVL(C.DTSAIDA, C.DATACONF) DESC, C.NUMCAR DESC
    `);
        const deslocamentosRows = Array.isArray(deslocamentoResult.rows) ? deslocamentoResult.rows : [];
        const deslocamentos = [];
        const lastTripByVehicleId = new Map();
        for (const row of deslocamentosRows) {
            const codVeiculo = toTrimmedString(row.CODVEICULO);
            if (!codVeiculo) {
                continue;
            }
            const veiculoId = buildOracleVehicleId(codVeiculo);
            const saidaIso = toIsoOrNull(row.DTSAIDA);
            if (!lastTripByVehicleId.has(veiculoId)) {
                lastTripByVehicleId.set(veiculoId, row);
            }
            const status = calculateTripStatus(row);
            if (status === "CONCLUIDO" || status === "CANCELADO") {
                continue;
            }
            const saidaDate = saidaIso ? new Date(saidaIso).getTime() : Date.now();
            const previsaoDate = new Date(saidaDate + 4 * 60 * 60 * 1000).toISOString();
            deslocamentos.push({
                id: `DSL-PC-${toTrimmedString(row.NUMCAR) || codVeiculo}`,
                veiculoId,
                placa: toTrimmedString(row.PLACA),
                motorista: toTrimmedString(row.MOTORISTA) || "Nao informado",
                origem: `Filial ${toTrimmedString(row.CODFILIAL) || "N/A"}`,
                destino: toTrimmedString(row.DESTINO) || "Destino nao informado",
                horarioSaida: saidaIso || new Date().toISOString(),
                horarioPrevistoChegada: previsaoDate,
                status,
                numCarregamento: toTrimmedString(row.NUMCAR),
                codFilial: toTrimmedString(row.CODFILIAL) || null,
            });
        }
        const vehicleRows = Array.isArray(vehicleResult.rows) ? vehicleResult.rows : [];
        const vehicles = vehicleRows.map((row) => {
            const codVeiculo = toTrimmedString(row.CODVEICULO);
            const id = buildOracleVehicleId(codVeiculo);
            const trip = lastTripByVehicleId.get(id);
            const statusBySituacao = mapOracleSituacaoToStatus(row.SITUACAO);
            const status = trip && calculateTripStatus(trip) === "EM_ROTA" ? "EM_DESLOCAMENTO" : statusBySituacao;
            return {
                id,
                codVeiculo,
                placa: toTrimmedString(row.PLACA) || `SEM-PLACA-${codVeiculo}`,
                tipo: toTrimmedString(row.TIPOVEICULO) || "Nao informado",
                modelo: toTrimmedString(row.DESCRICAO) || toTrimmedString(row.MARCA) || `Veiculo ${codVeiculo}`,
                ano: null,
                setor: `Filial ${toTrimmedString(row.CODFILIAL) || "N/A"}`,
                motoristaResponsavel: trip ? toTrimmedString(trip.MOTORISTA) || "Nao informado" : "Nao informado",
                status,
                ultimaMovimentacao: toIsoOrNull(row.ULTVIAGEM) || toIsoOrNull(trip?.DTSAIDA) || new Date().toISOString(),
                quilometragem: toNumberOrZero(row.KMATUAL),
                planta: toTrimmedString(row.CODFILIAL) || "N/A",
                alertas: [],
                origemDados: "PCVEICUL",
                situacaoWinthor: toTrimmedString(row.SITUACAO) || null,
                proprio: toTrimmedString(row.PROPRIO) || null,
                ultimaViagem: toIsoDateOnly(row.ULTVIAGEM) || toIsoDateOnly(trip?.DTSAIDA),
                numCarregamentoAtual: trip ? toTrimmedString(trip.NUMCAR) || null : null,
                destinoAtual: trip ? toTrimmedString(trip.DESTINO) || null : null,
            };
        });
        return { vehicles, deslocamentos };
    }
    catch (error) {
        logger?.warn?.({
            error,
            component: "operacionalRoutes",
            action: "loadFrotaOracleData",
        }, "Nao foi possivel consultar PCVEICUL/PCCARREG. Usando base local.");
        return { vehicles: [], deslocamentos: [] };
    }
}
export async function operacionalRoutes(app) {
    const nfTransitoService = new NFTransitoWinthorService(app.log);
    const nfTransitoFiltersSchema = z.object({
        codfilial: z.string().trim().min(1).max(10).optional(),
        codfilialEntrada: z.string().trim().min(1).max(10).optional(),
        codcli: z.coerce.number().int().positive().optional(),
        dataSaidaInicio: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        dataSaidaFim: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        dataInicio: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        dataFim: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        numnota: z.string().trim().max(40).optional(),
        numped: z.coerce.number().int().positive().optional(),
        numtransvenda: z.coerce.number().int().positive().optional(),
        fornecedor: z.string().trim().max(120).optional(),
        cliente: z.string().trim().max(120).optional(),
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
    function parseNfFilters(input) {
        const raw = (input ?? {});
        const safe = {};
        const allowedKeys = [
            "codfilial",
            "codfilialEntrada",
            "codcli",
            "dataSaidaInicio",
            "dataSaidaFim",
            "dataInicio",
            "dataFim",
            "numnota",
            "numped",
            "numtransvenda",
            "fornecedor",
            "cliente",
            "somenteGnreSt",
            "somenteEmRisco",
            "somenteAcimaSla",
            "page",
            "pageSize",
            "sortBy",
            "sortDir",
        ];
        for (const key of allowedKeys) {
            if (Object.prototype.hasOwnProperty.call(raw, key)) {
                const v = raw[key];
                // Ignora strings vazias para evitar erro 400 no Zod (min(1))
                if (v !== "" && v !== null && v !== undefined) {
                    safe[key] = v;
                }
            }
        }
        const clampInt = (value, min, max) => {
            if (value === undefined || value === null || value === "")
                return undefined;
            const numeric = Number(value);
            if (!Number.isFinite(numeric))
                return undefined;
            const truncated = Math.trunc(numeric);
            if (truncated < min)
                return min;
            if (truncated > max)
                return max;
            return truncated;
        };
        const safePage = clampInt(safe.page, 1, 1_000_000);
        const safePageSize = clampInt(safe.pageSize, 1, 5_000);
        if (safePage !== undefined)
            safe.page = safePage;
        if (safePageSize !== undefined)
            safe.pageSize = safePageSize;
        if (safePageSize === undefined)
            delete safe.pageSize;
        if (safePage === undefined)
            delete safe.page;
        const parsed = nfTransitoFiltersSchema.parse(safe);
        return {
            ...parsed,
            dataSaidaInicio: parsed.dataSaidaInicio ?? parsed.dataInicio,
            dataSaidaFim: parsed.dataSaidaFim ?? parsed.dataFim,
        };
    }
    const createSolicitacaoSchema = z.object({
        tipoAcesso: z.enum(["VISITANTE", "MOTORISTA", "PRESTADOR", "FUNCIONARIO", "ENTREGA"]),
        responsavelInterno: z.string().trim().min(1),
        setorDestino: z.string().trim().min(1),
        unidadePlanta: z.string().trim().min(1),
        validadeHoras: z.coerce.number().int().min(1).max(168).default(24),
        observacaoInterna: z.string().trim().max(1200).optional().or(z.literal("")),
        solicitadoPor: z.string().trim().min(1),
        horarioPrevisto: z.string().optional(),
    });
    const preencherSolicitacaoSchema = z.object({
        nome: z.string().trim().min(1),
        documento: z.string().trim().min(1),
        empresa: z.string().trim().min(1),
        telefone: z.string().trim().min(1),
        email: z.string().trim().optional().or(z.literal("")),
        possuiVeiculo: z.boolean().default(false),
        placa: z.string().trim().optional().or(z.literal("")),
        tipoVeiculo: z.string().trim().optional().or(z.literal("")),
        modelo: z.string().trim().optional().or(z.literal("")),
        cor: z.string().trim().optional().or(z.literal("")),
        obs: z.string().trim().optional().or(z.literal("")),
        selfieUrl: z.string().trim().optional().or(z.literal("")).refine((value) => isSupportedSelfieDataUrl(value || ""), { message: "Selfie invalida. Envie uma imagem JPG, PNG ou WEBP valida." }),
    });
    const qrScanBodySchema = z.object({
        code: z.string().trim().min(1),
    });
    function currentUser(req) {
        return req?.authUser?.nome ?? "system";
    }
    // -- SOLICITACOES DE ACESSO --
    app.get("/api/operacional/solicitacoes-acesso", async () => {
        refreshExpiredSolicitacoes();
        return db.operacionalSolicitacoesAcesso;
    });
    app.get("/api/operacional/solicitacoes-acesso/:id", async (req, reply) => {
        refreshExpiredSolicitacoes();
        const { id } = z.object({ id: z.string() }).parse(req.params);
        const item = db.operacionalSolicitacoesAcesso.find((s) => s.id === id || s.codigo === id);
        if (!item)
            return reply.status(404).send({ error: { message: "Solicitacao de acesso nao encontrada." } });
        return item;
    });
    app.post("/api/operacional/solicitacoes-acesso", async (req, reply) => {
        refreshExpiredSolicitacoes();
        const payload = createSolicitacaoSchema.parse(req.body);
        const nowIso = new Date().toISOString();
        const expiraEm = new Date(Date.now() + payload.validadeHoras * 60 * 60 * 1000).toISOString();
        const solicitacoes = db.operacionalSolicitacoesAcesso;
        const acessos = db.operacionalAcessos;
        const visitantes = db.operacionalVisitantes;
        const solicitacaoCodigo = nextOperationalCode("SOL", solicitacoes);
        const acessoCodigo = nextOperationalCode("ACS", acessos);
        const token = randomUUID().replace(/-/g, "");
        const linkPreenchimento = buildSolicitacaoLink(req, token);
        const solicitacao = {
            id: solicitacaoCodigo,
            codigo: solicitacaoCodigo,
            token,
            linkPreenchimento,
            status: SOLICITACAO_STATUS.LINK_GERADO,
            tipoAcesso: payload.tipoAcesso,
            responsavelInterno: payload.responsavelInterno,
            setorDestino: payload.setorDestino,
            unidadePlanta: payload.unidadePlanta,
            validadeHoras: payload.validadeHoras,
            observacaoInterna: payload.observacaoInterna || "",
            solicitadoPor: payload.solicitadoPor,
            horarioPrevisto: payload.horarioPrevisto || nowIso,
            expiraEm,
            criadoEm: nowIso,
            atualizadoEm: nowIso,
            acessoId: acessoCodigo,
            visitanteId: null,
            preenchimento: null,
            historico: [],
        };
        addSolicitacaoHistorico(solicitacao, SOLICITACAO_STATUS.LINK_GERADO, "Solicitacao interna criada e link unico gerado.", currentUser(req));
        const acesso = {
            id: acessoCodigo,
            tipo: payload.tipoAcesso,
            nome: "Aguardando preenchimento",
            documento: "-",
            empresa: "-",
            placa: "",
            tipoVeiculo: "",
            responsavelInterno: payload.responsavelInterno,
            setorDestino: payload.setorDestino,
            horarioPrevisto: payload.horarioPrevisto || nowIso,
            status: "AGUARDANDO_PREENCHIMENTO",
            criticidade: "BAIXA",
            motivo: payload.observacaoInterna || "Cadastro aguardando preenchimento via link.",
            planta: payload.unidadePlanta,
            criadoEm: nowIso,
            criadoPor: payload.solicitadoPor,
            ultimaAtualizacao: nowIso,
            obs: payload.observacaoInterna || "",
            solicitacaoId: solicitacao.id,
            linkPreenchimento,
            expiraEm,
            visitanteId: null,
        };
        const visitante = {
            id: nextOperationalCode("VIS", visitantes),
            nome: "Aguardando preenchimento",
            documento: "-",
            empresa: "-",
            telefone: "-",
            email: "",
            responsavelInterno: payload.responsavelInterno,
            setorDestino: payload.setorDestino,
            motivoVisita: payload.observacaoInterna || "Cadastro externo pendente.",
            status: "LINK_ENVIADO",
            possuiVeiculo: false,
            dataVisitaPrevista: nowIso.slice(0, 10),
            criadoEm: nowIso,
            criadoPor: payload.solicitadoPor,
            ultimaAtualizacao: nowIso,
            planta: payload.unidadePlanta,
            linkPreenchimento,
            solicitacaoId: solicitacao.id,
            acessoId: acesso.id,
        };
        solicitacao.visitanteId = visitante.id;
        solicitacoes.unshift(solicitacao);
        acessos.unshift(acesso);
        visitantes.unshift(visitante);
        db.operacionalTimeline.unshift(buildTimelineEvent(acesso.id, "LINK_GERADO", "Solicitacao criada e link de preenchimento disponibilizado.", currentUser(req), solicitacao.codigo));
        appendAudit("CRIAR", "SOLICITACAO_ACESSO", solicitacao.id, "Solicitacao de acesso criada com link unico", currentUser(req));
        return reply.status(201).send({
            solicitacao,
            acesso,
            visitante,
        });
    });
    app.put("/api/operacional/solicitacoes-acesso/:id/enviar", async (req, reply) => {
        refreshExpiredSolicitacoes();
        const { id } = z.object({ id: z.string() }).parse(req.params);
        const solicitacao = db.operacionalSolicitacoesAcesso.find((item) => item.id === id || item.codigo === id);
        if (!solicitacao)
            return reply.status(404).send({ error: { message: "Solicitacao de acesso nao encontrada." } });
        if (solicitacao.status === SOLICITACAO_STATUS.EXPIRADO) {
            return reply.status(409).send({ error: { message: "Link expirado. Gere uma nova solicitacao." } });
        }
        if (solicitacao.status === SOLICITACAO_STATUS.LINK_GERADO) {
            solicitacao.status = SOLICITACAO_STATUS.ENVIADO;
            solicitacao.atualizadoEm = new Date().toISOString();
            addSolicitacaoHistorico(solicitacao, SOLICITACAO_STATUS.ENVIADO, "Solicitacao marcada como link enviado ao visitante.", currentUser(req));
            appendAudit("ATUALIZAR", "SOLICITACAO_ACESSO", solicitacao.id, "Solicitacao marcada como enviada", currentUser(req));
        }
        return solicitacao;
    });
    app.get("/api/operacional/solicitacoes-acesso/public/:token", async (req, reply) => {
        refreshExpiredSolicitacoes();
        const { token } = z.object({ token: z.string().min(1) }).parse(req.params);
        const solicitacao = db.operacionalSolicitacoesAcesso.find((item) => item.token === token);
        if (!solicitacao)
            return reply.status(404).send({ error: { message: "Link de solicitacao nao encontrado." } });
        if (solicitacao.status === SOLICITACAO_STATUS.EXPIRADO) {
            return reply.status(410).send({
                status: SOLICITACAO_STATUS.EXPIRADO,
                codigo: solicitacao.codigo,
                expiraEm: solicitacao.expiraEm,
            });
        }
        return {
            id: solicitacao.id,
            codigo: solicitacao.codigo,
            token: solicitacao.token,
            status: solicitacao.status,
            tipoAcesso: solicitacao.tipoAcesso,
            unidadePlanta: solicitacao.unidadePlanta,
            setorDestino: solicitacao.setorDestino,
            responsavelInterno: solicitacao.responsavelInterno,
            expiraEm: solicitacao.expiraEm,
            visitantePreenchido: Boolean(solicitacao.preenchimento),
        };
    });
    app.post("/api/operacional/solicitacoes-acesso/public/:token/preencher", async (req, reply) => {
        refreshExpiredSolicitacoes();
        const { token } = z.object({ token: z.string().min(1) }).parse(req.params);
        const payload = preencherSolicitacaoSchema.parse(req.body);
        const solicitacao = db.operacionalSolicitacoesAcesso.find((item) => item.token === token);
        if (!solicitacao)
            return reply.status(404).send({ error: { message: "Link de solicitacao nao encontrado." } });
        if (solicitacao.status === SOLICITACAO_STATUS.EXPIRADO) {
            return reply.status(410).send({ error: { message: "Link expirado. Solicite um novo acesso." } });
        }
        if (solicitacao.status === SOLICITACAO_STATUS.PREENCHIDO
            || solicitacao.status === SOLICITACAO_STATUS.VALIDADO
            || solicitacao.status === SOLICITACAO_STATUS.CONVERTIDO_EM_ACESSO) {
            return reply.status(409).send({ error: { message: "Este link ja foi utilizado." } });
        }
        const nowIso = new Date().toISOString();
        const visitante = db.operacionalVisitantes.find((item) => item.id === solicitacao.visitanteId);
        const acesso = db.operacionalAcessos.find((item) => item.id === solicitacao.acessoId);
        if (!visitante || !acesso) {
            return reply.status(500).send({ error: { message: "Solicitacao sem vinculos internos validos." } });
        }
        solicitacao.status = SOLICITACAO_STATUS.PREENCHIDO;
        solicitacao.atualizadoEm = nowIso;
        solicitacao.preenchidoEm = nowIso;
        solicitacao.preenchimento = {
            ...payload,
            nome: payload.nome,
            documento: payload.documento,
            empresa: payload.empresa,
            telefone: payload.telefone,
            email: payload.email || "",
            placa: payload.placa || "",
            tipoVeiculo: payload.tipoVeiculo || "",
            modelo: payload.modelo || "",
            cor: payload.cor || "",
            obs: payload.obs || "",
            selfieUrl: payload.selfieUrl || "",
        };
        addSolicitacaoHistorico(solicitacao, SOLICITACAO_STATUS.PREENCHIDO, "Visitante finalizou o preenchimento externo.", payload.nome);
        visitante.nome = payload.nome;
        visitante.documento = payload.documento;
        visitante.empresa = payload.empresa;
        visitante.telefone = payload.telefone;
        visitante.email = payload.email || "";
        visitante.possuiVeiculo = payload.possuiVeiculo;
        visitante.status = "CADASTRO_PREENCHIDO";
        visitante.ultimaAtualizacao = nowIso;
        visitante.selfieUrl = payload.selfieUrl || "";
        visitante.placa = payload.placa || "";
        visitante.tipoVeiculo = payload.tipoVeiculo || "";
        visitante.modelo = payload.modelo || "";
        visitante.cor = payload.cor || "";
        visitante.obs = payload.obs || "";
        acesso.nome = payload.nome;
        acesso.documento = payload.documento;
        acesso.empresa = payload.empresa;
        acesso.placa = payload.placa || "";
        acesso.tipoVeiculo = payload.tipoVeiculo || "";
        acesso.status = "AGUARDANDO_VALIDACAO";
        acesso.ultimaAtualizacao = nowIso;
        acesso.selfieUrl = payload.selfieUrl || "";
        acesso.obs = payload.obs || acesso.obs;
        acesso.visitanteId = visitante.id;
        db.operacionalTimeline.unshift(buildTimelineEvent(acesso.id, "CADASTRO_PREENCHIDO", "Visitante concluiu o formulario externo pelo link unico.", payload.nome));
        appendAudit("PREENCHER", "SOLICITACAO_ACESSO", solicitacao.id, `Formulario externo preenchido por ${payload.nome}`, payload.nome);
        return {
            status: "ok",
            solicitacao,
            acesso,
            visitante,
        };
    });
    // ── WALK-IN (auto-cadastro na portaria, sem link pré-gerado) ──
    app.post("/api/operacional/visitantes/walk-in", async (req) => {
        const walkInSchema = z.object({
            nome: z.string().trim().min(2).max(200),
            documento: z.string().trim().min(3).max(30),
            empresa: z.string().trim().min(1).max(200),
            telefone: z.string().trim().min(5).max(30),
            email: z.string().trim().max(200).optional().default(""),
            selfieUrl: z.string().max(1500000).optional().default(""),
            possuiVeiculo: z.boolean().optional().default(false),
            placa: z.string().trim().max(20).optional().default(""),
            tipoVeiculo: z.string().trim().max(40).optional().default(""),
            modelo: z.string().trim().max(100).optional().default(""),
            cor: z.string().trim().max(40).optional().default(""),
            obs: z.string().trim().max(1000).optional().default(""),
        });
        const body = walkInSchema.parse(req.body);
        const nowIso = new Date().toISOString();
        const visitante = {
            id: nextId("VIS", db.operacionalVisitantes.length),
            nome: body.nome,
            documento: body.documento,
            empresa: body.empresa,
            telefone: body.telefone,
            email: body.email,
            possuiVeiculo: body.possuiVeiculo,
            placa: body.placa,
            tipoVeiculo: body.tipoVeiculo,
            modelo: body.modelo,
            cor: body.cor,
            obs: body.obs,
            selfieUrl: body.selfieUrl,
            status: "CADASTRO_PREENCHIDO",
            tipo: "WALK_IN",
            criadoEm: nowIso,
            ultimaAtualizacao: nowIso,
        };
        db.operacionalVisitantes.push(visitante);
        const acesso = {
            id: nextId("ACS", db.operacionalAcessos.length),
            nome: body.nome,
            documento: body.documento,
            empresa: body.empresa,
            telefone: body.telefone,
            email: body.email,
            placa: body.placa,
            tipoVeiculo: body.tipoVeiculo,
            modelo: body.modelo,
            cor: body.cor,
            selfieUrl: body.selfieUrl,
            obs: body.obs,
            status: "AGUARDANDO_VALIDACAO",
            tipo: "VISITANTE_WALK_IN",
            visitanteId: visitante.id,
            criadoEm: nowIso,
            ultimaAtualizacao: nowIso,
        };
        db.operacionalAcessos.push(acesso);
        visitante.acessoId = acesso.id;
        db.operacionalTimeline.unshift(buildTimelineEvent(acesso.id, "WALK_IN_CADASTRO", `Auto-cadastro portaria: ${body.nome}`, "walk-in"));
        appendAudit("CRIAR", "ACESSO_WALK_IN", acesso.id, `Walk-in portaria: ${body.nome}`, "walk-in");
        return { acessoId: acesso.id, visitanteId: visitante.id, nome: body.nome };
    });
    // ── ACESSOS ──
    app.post("/api/operacional/portaria/qr/scan", async (req, reply) => {
        refreshExpiredSolicitacoes();
        const payload = qrScanBodySchema.parse(req.body);
        const input = normalizeQrInput(payload.code);
        const inputUpper = input.toUpperCase();
        const token = extractTokenFromQrInput(input);
        let solicitacao = null;
        let acesso = null;
        let visitante = null;
        if (token) {
            const tokenLower = token.toLowerCase();
            solicitacao = db.operacionalSolicitacoesAcesso.find((item) => (item.token || "").toLowerCase() === tokenLower) ?? null;
        }
        if (!solicitacao && inputUpper.startsWith("SOL-")) {
            solicitacao = db.operacionalSolicitacoesAcesso.find((item) => item.id === inputUpper || item.codigo === inputUpper) ?? null;
        }
        if (solicitacao) {
            acesso = db.operacionalAcessos.find((item) => item.id === solicitacao.acessoId) ?? null;
            visitante = db.operacionalVisitantes.find((item) => item.id === solicitacao.visitanteId) ?? null;
        }
        if (!acesso && inputUpper.startsWith("ACS-")) {
            acesso = db.operacionalAcessos.find((item) => item.id === inputUpper) ?? null;
        }
        if (!visitante && inputUpper.startsWith("VIS-")) {
            visitante = db.operacionalVisitantes.find((item) => item.id === inputUpper) ?? null;
        }
        if (!solicitacao && acesso?.solicitacaoId) {
            solicitacao = db.operacionalSolicitacoesAcesso.find((item) => item.id === acesso.solicitacaoId || item.codigo === acesso.solicitacaoId) ?? null;
        }
        if (!solicitacao && visitante?.solicitacaoId) {
            solicitacao = db.operacionalSolicitacoesAcesso.find((item) => item.id === visitante.solicitacaoId || item.codigo === visitante.solicitacaoId) ?? null;
        }
        if (!acesso && visitante?.acessoId) {
            acesso = db.operacionalAcessos.find((item) => item.id === visitante.acessoId) ?? null;
        }
        if (!visitante && acesso?.visitanteId) {
            visitante = db.operacionalVisitantes.find((item) => item.id === acesso.visitanteId) ?? null;
        }
        if (!solicitacao && input.includes("/visitante/cadastro/")) {
            solicitacao = db.operacionalSolicitacoesAcesso.find((item) => item.linkPreenchimento === input) ?? null;
            if (solicitacao) {
                acesso = db.operacionalAcessos.find((item) => item.id === solicitacao.acessoId) ?? null;
                visitante = db.operacionalVisitantes.find((item) => item.id === solicitacao.visitanteId) ?? null;
            }
        }
        if (!solicitacao && !acesso && !visitante) {
            return {
                status: QR_SCAN_STATUS.NAO_ENCONTRADO,
                message: "Nenhum visitante/acesso encontrado para o QR lido.",
                code: input,
                permitirLiberacao: false,
            };
        }
        const resultado = classifyQrScan(solicitacao, acesso, visitante);
        return {
            status: resultado.status,
            message: resultado.message,
            permitirLiberacao: resultado.permitirLiberacao,
            code: input,
            token: solicitacao?.token ?? token ?? null,
            solicitacao,
            acesso,
            visitante,
            destino: {
                planta: solicitacao?.unidadePlanta ?? acesso?.planta ?? visitante?.planta ?? null,
                setorDestino: solicitacao?.setorDestino ?? acesso?.setorDestino ?? visitante?.setorDestino ?? null,
                responsavelInterno: solicitacao?.responsavelInterno ?? acesso?.responsavelInterno ?? visitante?.responsavelInterno ?? null,
                tipoAcesso: solicitacao?.tipoAcesso ?? acesso?.tipo ?? null,
            },
        };
    });
    app.get("/api/operacional/acessos", async () => {
        refreshExpiredSolicitacoes();
        return db.operacionalAcessos;
    });
    app.get("/api/operacional/acessos/:id", async (req, reply) => {
        const { id } = z.object({ id: z.string() }).parse(req.params);
        const item = db.operacionalAcessos.find((a) => a.id === id);
        if (!item)
            return reply.status(404).send({ error: { message: "Acesso não encontrado." } });
        return item;
    });
    app.post("/api/operacional/acessos", async (req) => {
        const body = req.body;
        const rec = { ...body, id: nextId("ACS", db.operacionalAcessos.length), criadoEm: new Date().toISOString(), ultimaAtualizacao: new Date().toISOString() };
        db.operacionalAcessos.push(rec);
        appendAudit("CRIAR", "ACESSO", rec.id, "Acesso criado", req.authUser?.nome ?? "system");
        return rec;
    });
    app.put("/api/operacional/acessos/:id/liberar", async (req, reply) => {
        const { id } = z.object({ id: z.string() }).parse(req.params);
        const idx = db.operacionalAcessos.findIndex((a) => a.id === id);
        if (idx < 0)
            return reply.status(404).send({ error: { message: "Acesso não encontrado." } });
        const nowIso = new Date().toISOString();
        const acessoAtual = db.operacionalAcessos[idx];
        db.operacionalAcessos[idx] = { ...acessoAtual, status: "ENTRADA_LIBERADA", horarioReal: nowIso, ultimaAtualizacao: nowIso };
        const solicitacao = db.operacionalSolicitacoesAcesso.find((item) => item.acessoId === id || item.id === acessoAtual.solicitacaoId || item.codigo === acessoAtual.solicitacaoId);
        if (solicitacao) {
            solicitacao.status = SOLICITACAO_STATUS.CONVERTIDO_EM_ACESSO;
            solicitacao.atualizadoEm = nowIso;
            addSolicitacaoHistorico(solicitacao, SOLICITACAO_STATUS.CONVERTIDO_EM_ACESSO, "Entrada liberada na portaria.", currentUser(req));
        }
        const visitante = db.operacionalVisitantes.find((item) => item.id === acessoAtual.visitanteId || item.id === solicitacao?.visitanteId);
        if (visitante) {
            visitante.status = "VISITA_EM_ANDAMENTO";
            visitante.ultimaAtualizacao = nowIso;
        }
        db.operacionalTimeline.unshift(buildTimelineEvent(id, "ENTRADA_LIBERADA", "Entrada liberada na portaria via leitura QR.", currentUser(req), acessoAtual.nome || id));
        appendAudit("LIBERAR", "ACESSO", id, "Entrada liberada", req.authUser?.nome ?? "system");
        return db.operacionalAcessos[idx];
    });
    app.put("/api/operacional/acessos/:id/saida", async (req, reply) => {
        const { id } = z.object({ id: z.string() }).parse(req.params);
        const idx = db.operacionalAcessos.findIndex((a) => a.id === id);
        if (idx < 0)
            return reply.status(404).send({ error: { message: "Acesso não encontrado." } });
        db.operacionalAcessos[idx] = { ...db.operacionalAcessos[idx], status: "SAIDA_REGISTRADA", horarioSaida: new Date().toISOString(), ultimaAtualizacao: new Date().toISOString() };
        appendAudit("SAIDA", "ACESSO", id, "Saída registrada", req.authUser?.nome ?? "system");
        return db.operacionalAcessos[idx];
    });
    // ── VISITANTES ──
    app.get("/api/operacional/visitantes", async () => {
        refreshExpiredSolicitacoes();
        return db.operacionalVisitantes;
    });
    app.get("/api/operacional/visitantes/:id", async (req, reply) => {
        const { id } = z.object({ id: z.string() }).parse(req.params);
        const item = db.operacionalVisitantes.find((v) => v.id === id);
        if (!item)
            return reply.status(404).send({ error: { message: "Visitante não encontrado." } });
        return item;
    });
    app.post("/api/operacional/visitantes", async (req) => {
        const body = req.body;
        const rec = { ...body, id: nextId("VIS", db.operacionalVisitantes.length), criadoEm: new Date().toISOString(), ultimaAtualizacao: new Date().toISOString() };
        db.operacionalVisitantes.push(rec);
        appendAudit("CRIAR", "VISITANTE", rec.id, "Visitante criado", req.authUser?.nome ?? "system");
        return rec;
    });
    app.put("/api/operacional/visitantes/:id/aprovar", async (req, reply) => {
        const { id } = z.object({ id: z.string() }).parse(req.params);
        const idx = db.operacionalVisitantes.findIndex((v) => v.id === id);
        if (idx < 0)
            return reply.status(404).send({ error: { message: "Visitante não encontrado." } });
        db.operacionalVisitantes[idx] = { ...db.operacionalVisitantes[idx], status: "APROVADO", ultimaAtualizacao: new Date().toISOString() };
        appendAudit("APROVAR", "VISITANTE", id, "Visitante aprovado", req.authUser?.nome ?? "system");
        return db.operacionalVisitantes[idx];
    });
    // ── VEÍCULOS VISITANTES ──
    app.get("/api/operacional/veiculos-visitantes", async () => db.operacionalVeiculosVisitantes);
    // ── FROTA ──
    const frotaMovimentacaoSchema = z.object({
        status: z.string().trim().max(40).optional(),
        quilometragem: z.coerce.number().min(0).optional(),
        observacao: z.string().trim().max(600).optional(),
        docaId: z.string().trim().max(120).optional(),
    });
    async function loadFrotaContext() {
        const oracleSnapshot = await loadFrotaOracleData(app.log);
        const localItems = Array.isArray(db.operacionalFrota) ? db.operacionalFrota.map((item) => ({ ...item })) : [];
        const localMap = new Map(localItems.map((item) => [item.id, item]));
        const oracleMap = new Map(oracleSnapshot.vehicles.map((item) => [item.id, item]));
        const mergedOracleVehicles = oracleSnapshot.vehicles.map((item) => {
            const local = localMap.get(item.id);
            if (!local) {
                return item;
            }
            const overrideStatus = normalizeStatus(local.status);
            return {
                ...item,
                ...local,
                status: overrideStatus ?? item.status,
                quilometragem: local.quilometragem ?? item.quilometragem,
                ultimaMovimentacao: local.ultimaMovimentacao || item.ultimaMovimentacao,
                alertas: Array.isArray(local.alertas) ? local.alertas : item.alertas,
                origemDados: "PCVEICUL+LOCAL",
            };
        });
        const localOnlyVehicles = localItems.filter((item) => {
            const id = toTrimmedString(item.id);
            return id.startsWith("PCV-") && !oracleMap.has(id);
        });
        const localVehiclesWhenOracleUnavailable = localItems.filter((item) => toTrimmedString(item.id).startsWith("PCV-"));
        const vehicles = mergedOracleVehicles.length > 0
            ? [...mergedOracleVehicles, ...localOnlyVehicles]
            : (isOracleEnabled() ? localVehiclesWhenOracleUnavailable : localItems);
        const deslocamentos = [...oracleSnapshot.deslocamentos];
        const existingDeslocamentoIds = new Set(deslocamentos.map((item) => item.id));
        const localDeslocamentos = isOracleEnabled()
            ? db.operacionalDeslocamentos.filter((item) => toTrimmedString(item.veiculoId).startsWith("PCV-"))
            : db.operacionalDeslocamentos;
        for (const local of localDeslocamentos) {
            const saidaIso = toIsoOrNull(local.horarioSaida) || new Date().toISOString();
            const previsaoIso = toIsoOrNull(local.horarioPrevistoChegada) || new Date(new Date(saidaIso).getTime() + 4 * 60 * 60 * 1000).toISOString();
            const record = {
                ...local,
                id: local.id || nextId("DSL", db.operacionalDeslocamentos.length),
                horarioSaida: saidaIso,
                horarioPrevistoChegada: previsaoIso,
                status: local.status || "EM_ROTA",
            };
            if (!existingDeslocamentoIds.has(record.id)) {
                deslocamentos.push(record);
                existingDeslocamentoIds.add(record.id);
            }
        }
        deslocamentos.sort((a, b) => {
            const aTs = Date.parse(toTrimmedString(a.horarioSaida)) || 0;
            const bTs = Date.parse(toTrimmedString(b.horarioSaida)) || 0;
            return bTs - aTs;
        });
        return { vehicles, deslocamentos };
    }
    function upsertFrotaLocalSnapshot(vehicle, patch) {
        const idx = db.operacionalFrota.findIndex((item) => item.id === vehicle.id);
        const base = idx >= 0 ? db.operacionalFrota[idx] : {};
        const merged = {
            ...base,
            id: vehicle.id,
            placa: vehicle.placa,
            tipo: vehicle.tipo,
            modelo: vehicle.modelo,
            ano: vehicle.ano ?? null,
            setor: vehicle.setor,
            motoristaResponsavel: vehicle.motoristaResponsavel,
            planta: vehicle.planta,
            alertas: Array.isArray(base.alertas) ? base.alertas : [],
            ...patch,
        };
        if (idx >= 0) {
            db.operacionalFrota[idx] = merged;
        }
        else {
            db.operacionalFrota.push(merged);
        }
        return merged;
    }
    function syncLocalDeslocamentoByStatus(vehicle, status) {
        if (status === "EM_DESLOCAMENTO") {
            const active = db.operacionalDeslocamentos.find((item) => item.veiculoId === vehicle.id && item.status === "EM_ROTA");
            if (!active) {
                db.operacionalDeslocamentos.unshift({
                    id: nextId("DSL", db.operacionalDeslocamentos.length),
                    veiculoId: vehicle.id,
                    placa: vehicle.placa,
                    motorista: vehicle.motoristaResponsavel || "Nao informado",
                    origem: vehicle.setor || "Unidade",
                    destino: "Em deslocamento",
                    horarioSaida: new Date().toISOString(),
                    horarioPrevistoChegada: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
                    status: "EM_ROTA",
                    notasFiscais: [],
                });
            }
            return;
        }
        if (status === "DISPONIVEL" || status === "PARADA_PROGRAMADA" || status === "PARADA_NAO_PROGRAMADA") {
            const nowIso = new Date().toISOString();
            for (const item of db.operacionalDeslocamentos) {
                if (item.veiculoId === vehicle.id && (item.status === "EM_ROTA" || item.status === "ATRASADO")) {
                    item.status = "CONCLUIDO";
                    item.horarioRealChegada = nowIso;
                }
            }
        }
    }
    const frotaLookupQuerySchema = z.object({
        q: z.string().trim().max(80).optional(),
        limit: z.coerce.number().int().min(1).max(100).optional(),
    });
    app.get("/api/operacional/frota/veiculos/search", async (req) => {
        const query = frotaLookupQuerySchema.parse(req.query ?? {});
        const limit = query.limit ?? 20;
        const q = toTrimmedString(query.q);
        const qUpper = q.toUpperCase();
        const qDigits = normalizePlateDigits(qUpper);
        if (isOracleEnabled()) {
            try {
                const result = await executeOracle(`
          SELECT * FROM (
            SELECT
              V.CODVEICULO,
              TRIM(V.PLACA) AS PLACA,
              TRIM(V.DESCRICAO) AS DESCRICAO,
              TRIM(V.TIPOVEICULO) AS TIPOVEICULO,
              TRIM(V.SITUACAO) AS SITUACAO,
              TRIM(V.CODFILIAL) AS CODFILIAL,
              V.KMATUAL,
              V.ULTVIAGEM
            FROM PCVEICUL V
            WHERE NVL(TRIM(V.SITUACAO), 'L') <> 'I'
              AND (
                :p_q IS NULL
                OR UPPER(TRIM(V.PLACA)) LIKE :p_q_like
                OR REPLACE(UPPER(TRIM(V.PLACA)), '-', '') LIKE :p_q_digits_like
                OR UPPER(TRIM(V.DESCRICAO)) LIKE :p_q_like
                OR TO_CHAR(V.CODVEICULO) LIKE :p_q_like
              )
            ORDER BY
              CASE WHEN :p_plate_exact IS NOT NULL AND REPLACE(UPPER(TRIM(V.PLACA)), '-', '') = :p_plate_exact THEN 0 ELSE 1 END,
              CASE WHEN :p_q IS NOT NULL AND UPPER(TRIM(V.PLACA)) LIKE :p_q_prefix THEN 0 ELSE 1 END,
              V.CODVEICULO
          )
          WHERE ROWNUM <= :p_limit
        `, {
                    p_q: q ? qUpper : null,
                    p_q_like: q ? `%${qUpper}%` : null,
                    p_q_digits_like: qDigits ? `%${qDigits}%` : null,
                    p_plate_exact: qDigits || null,
                    p_q_prefix: q ? `${qUpper}%` : null,
                    p_limit: limit,
                });
                const rows = Array.isArray(result.rows) ? result.rows : [];
                return rows.map((row) => {
                    const codVeiculo = toTrimmedString(row.CODVEICULO);
                    return {
                        id: buildOracleVehicleId(codVeiculo),
                        codVeiculo,
                        placa: toTrimmedString(row.PLACA) || `SEM-PLACA-${codVeiculo}`,
                        modelo: toTrimmedString(row.DESCRICAO) || `Veiculo ${codVeiculo}`,
                        tipo: toTrimmedString(row.TIPOVEICULO) || "Nao informado",
                        status: mapOracleSituacaoToStatus(row.SITUACAO),
                        situacaoWinthor: toTrimmedString(row.SITUACAO) || null,
                        setor: `Filial ${toTrimmedString(row.CODFILIAL) || "N/A"}`,
                        quilometragem: toNumberOrZero(row.KMATUAL),
                        ultimaMovimentacao: toIsoOrNull(row.ULTVIAGEM),
                        origemDados: "PCVEICUL",
                    };
                });
            }
            catch (error) {
                app.log.warn({
                    error,
                    component: "operacionalRoutes",
                    action: "frotaVeiculosSearch",
                }, "Falha ao consultar busca de veiculos na PCVEICUL.");
            }
        }
        const context = await loadFrotaContext();
        return context.vehicles
            .filter((vehicle) => {
            if (!qUpper) {
                return true;
            }
            const placa = toTrimmedString(vehicle.placa).toUpperCase();
            const placaDigits = normalizePlateDigits(placa);
            const modelo = toTrimmedString(vehicle.modelo).toUpperCase();
            const codVeiculo = toTrimmedString(vehicle.codVeiculo || vehicle.id).toUpperCase();
            return placa.includes(qUpper) || placaDigits.includes(qDigits) || modelo.includes(qUpper) || codVeiculo.includes(qUpper);
        })
            .slice(0, limit);
    });
    app.get("/api/operacional/frota/motoristas", async (req) => {
        const query = frotaLookupQuerySchema.parse(req.query ?? {});
        const limit = query.limit ?? 80;
        const q = toTrimmedString(query.q);
        const qUpper = q.toUpperCase();
        const qDigits = qUpper.replace(/\D/g, "");
        if (isOracleEnabled()) {
            try {
                const result = await executeOracle(`
          SELECT * FROM (
            SELECT
              E.CODFILIAL,
              E.MATRICULA,
              E.NOME,
              E.ADMISSAO,
              E.CPF,
              E.ENDERECO,
              E.CELULAR,
              E.NUMBANCO,
              E.NUMAGENCIA,
              E.NUMCCORRENTE,
              E.BAIRRO,
              E.CIDADE,
              E.CODSETOR,
              E.ESTADO,
              E.CEP,
              E.FONE,
              E.SITUACAO,
              E.FATORCOMISSAO,
              E.CNH,
              E.UFCNH,
              E.TIPOENVIO,
              E.TIPO,
              E.PERCOMMOT,
              E.VLFRETEENTREGA,
              E.CODVEICULO,
              E.REFERENCIAPESSOAL,
              E.DDDTEL,
              E.NOMEPAI,
              E.NOMEMAE,
              E.CATEGORIACNH,
              E.RG,
              E.TIPOMOTORISTA,
              E.SEXO,
              E.DTNASC,
              E.DTVALIDADECNH,
              E.ORGAOEMISSORRG,
              E.NUMDVAGENCIA,
              E.NOME_GUERRA,
              E.OBSINATIVO,
              E.OBS,
              E.TIPOCOMISSAO,
              E.COMISSAOFIXA,
              E.CHAPA_RM
            FROM PCEMPR E
            WHERE E.CODSETOR IN (SELECT C.CODSETORMOTORISTA FROM PCCONSUM C)
              AND NVL(TRIM(E.SITUACAO), 'A') <> 'I'
              AND E.MATRICULA IS NOT NULL
              AND NVL(TRIM(E.NOME), 'X') <> 'X'
              AND (
                :p_q IS NULL
                OR UPPER(TRIM(E.NOME)) LIKE :p_q_like
                OR UPPER(TRIM(E.NOME_GUERRA)) LIKE :p_q_like
                OR TO_CHAR(E.MATRICULA) LIKE :p_q_like
                OR REGEXP_REPLACE(NVL(E.CPF, ''), '[^0-9]', '') LIKE :p_q_digits_like
              )
            ORDER BY UPPER(TRIM(E.NOME)), E.MATRICULA
          )
          WHERE ROWNUM <= :p_limit
        `, {
                    p_q: q ? qUpper : null,
                    p_q_like: q ? `%${qUpper}%` : null,
                    p_q_digits_like: qDigits ? `%${qDigits}%` : null,
                    p_limit: limit,
                });
                const rows = Array.isArray(result.rows) ? result.rows : [];
                return rows.map((row) => ({
                    id: `MOT-${toTrimmedString(row.MATRICULA)}`,
                    matricula: toTrimmedString(row.MATRICULA),
                    nome: toTrimmedString(row.NOME),
                    nomeGuerra: toTrimmedString(row.NOME_GUERRA) || null,
                    codFilial: toTrimmedString(row.CODFILIAL) || null,
                    setor: toTrimmedString(row.CODSETOR) || null,
                    situacao: toTrimmedString(row.SITUACAO) || null,
                    cpf: toTrimmedString(row.CPF) || null,
                    cnh: toTrimmedString(row.CNH) || null,
                    categoriaCnh: toTrimmedString(row.CATEGORIACNH) || null,
                    ufCnh: toTrimmedString(row.UFCNH) || null,
                    tipoMotorista: toTrimmedString(row.TIPOMOTORISTA) || null,
                    codVeiculoVinculado: toTrimmedString(row.CODVEICULO) || null,
                    celular: toTrimmedString(row.CELULAR) || null,
                    fone: toTrimmedString(row.FONE) || null,
                    observacaoInativo: toTrimmedString(row.OBSINATIVO) || null,
                    observacao: toTrimmedString(row.OBS) || null,
                    label: `${toTrimmedString(row.MATRICULA)} - ${toTrimmedString(row.NOME)}`,
                    origemDados: "PCEMPR",
                }));
            }
            catch (error) {
                app.log.warn({
                    error,
                    component: "operacionalRoutes",
                    action: "frotaMotoristasList",
                }, "Falha ao consultar motoristas da PCEMPR.");
            }
        }
        return (db.operacionalMotoristasTerceiros ?? [])
            .filter((item) => {
            if (!qUpper) {
                return true;
            }
            const nome = toTrimmedString(item.nome).toUpperCase();
            return nome.includes(qUpper);
        })
            .slice(0, limit)
            .map((item) => ({
            id: item.id,
            matricula: toTrimmedString(item.id),
            nome: toTrimmedString(item.nome),
            nomeGuerra: null,
            codFilial: null,
            setor: null,
            situacao: toTrimmedString(item.status) || null,
            cpf: null,
            cnh: null,
            categoriaCnh: null,
            ufCnh: null,
            tipoMotorista: null,
            codVeiculoVinculado: null,
            celular: toTrimmedString(item.telefone) || null,
            fone: toTrimmedString(item.telefone) || null,
            observacaoInativo: null,
            observacao: null,
            label: toTrimmedString(item.nome),
            origemDados: "FALLBACK_LOCAL",
        }));
    });
    app.get("/api/operacional/frota", async () => {
        const context = await loadFrotaContext();
        return context.vehicles;
    });
    app.get("/api/operacional/frota/:id", async (req, reply) => {
        const { id } = z.object({ id: z.string() }).parse(req.params);
        const context = await loadFrotaContext();
        const item = context.vehicles.find((vehicle) => vehicle.id === id);
        if (!item) {
            return reply.status(404).send({ error: { message: "Veiculo nao encontrado." } });
        }
        return item;
    });
    app.get("/api/operacional/frota/deslocamentos", async () => {
        const context = await loadFrotaContext();
        return context.deslocamentos;
    });
    app.post("/api/operacional/frota/despacho", async (req, reply) => {
        const body = req.body ?? {};
        const veiculoId = toTrimmedString(body.veiculoId);
        if (!veiculoId) {
            return reply.status(400).send({ error: { message: "veiculoId e obrigatorio para despacho." } });
        }
        const context = await loadFrotaContext();
        const vehicle = context.vehicles.find((item) => item.id === veiculoId);
        if (!vehicle) {
            return reply.status(404).send({ error: { message: "Veiculo nao encontrado para despacho." } });
        }
        const saidaIso = new Date().toISOString();
        const previsaoIso = toIsoOrNull(body.horarioPrevistoChegada) || new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
        const rec = {
            ...body,
            id: nextId("DSL", db.operacionalDeslocamentos.length),
            veiculoId,
            placa: vehicle.placa,
            motorista: toTrimmedString(body.motorista) || vehicle.motoristaResponsavel || "Nao informado",
            origem: toTrimmedString(body.origem) || vehicle.setor || "Unidade",
            destino: toTrimmedString(body.destino) || "Destino nao informado",
            horarioSaida: saidaIso,
            horarioPrevistoChegada: previsaoIso,
            status: "EM_ROTA",
        };
        db.operacionalDeslocamentos.unshift(rec);
        upsertFrotaLocalSnapshot(vehicle, {
            status: "EM_DESLOCAMENTO",
            ultimaMovimentacao: saidaIso,
        });
        db.operacionalMovimentacoesFrota.unshift({
            id: nextId("MOV", db.operacionalMovimentacoesFrota.length),
            veiculoId,
            statusAnterior: vehicle.status || "DISPONIVEL",
            statusNovo: "EM_DESLOCAMENTO",
            tipoRegistro: "SAIDA",
            descricao: body.observacao || `Despacho registrado para ${rec.destino}.`,
            dataHora: saidaIso,
            usuario: req.authUser?.nome ?? "system",
            km: vehicle.quilometragem,
        });
        appendAudit("DESPACHO", "FROTA", rec.id, "Despacho registrado", req.authUser?.nome ?? "system");
        return rec;
    });
    app.put("/api/operacional/frota/:id/movimentacao", async (req, reply) => {
        const { id } = z.object({ id: z.string() }).parse(req.params);
        const body = frotaMovimentacaoSchema.parse(req.body ?? {});
        const context = await loadFrotaContext();
        const vehicle = context.vehicles.find((item) => item.id === id);
        if (!vehicle) {
            return reply.status(404).send({ error: { message: "Veiculo nao encontrado." } });
        }
        const normalizedStatus = body.status ? normalizeStatus(body.status) : undefined;
        if (body.status && !normalizedStatus) {
            return reply.status(400).send({ error: { message: "Status de movimentacao invalido." } });
        }
        const statusNovo = normalizedStatus || normalizeStatus(vehicle.status) || "DISPONIVEL";
        const statusAnterior = normalizeStatus(vehicle.status) || "DISPONIVEL";
        const nowIso = new Date().toISOString();
        const kmAtual = body.quilometragem ?? toNumberOrNull(vehicle.quilometragem) ?? 0;
        const atualizado = upsertFrotaLocalSnapshot(vehicle, {
            status: statusNovo,
            quilometragem: kmAtual,
            ultimaMovimentacao: nowIso,
        });
        syncLocalDeslocamentoByStatus(vehicle, statusNovo);
        db.operacionalMovimentacoesFrota.unshift({
            id: nextId("MOV", db.operacionalMovimentacoesFrota.length),
            veiculoId: id,
            statusAnterior,
            statusNovo,
            tipoRegistro: inferMovementKind(statusNovo),
            descricao: body.observacao || "Movimentacao registrada",
            dataHora: nowIso,
            usuario: req.authUser?.nome ?? "system",
            docaNome: body.docaId,
            km: kmAtual,
        });
        appendAudit("MOVIMENTACAO", "FROTA", id, `Status: ${statusNovo}`, req.authUser?.nome ?? "system");
        return { ...vehicle, ...atualizado, status: statusNovo, quilometragem: kmAtual, ultimaMovimentacao: nowIso };
    });
    app.get("/api/operacional/frota/movimentacoes", async () => db.operacionalMovimentacoesFrota);
    // ── TERCEIROS ──
    app.get("/api/operacional/transportadoras", async () => db.operacionalTransportadoras);
    app.get("/api/operacional/motoristas-terceiros", async () => db.operacionalMotoristasTerceiros);
    app.get("/api/operacional/veiculos-terceiros", async () => db.operacionalVeiculosTerceiros);
    app.get("/api/operacional/operacoes", async () => db.operacionalOperacoes);
    app.get("/api/operacional/agendamentos", async () => db.operacionalAgendamentos);
    // ── PÁTIO / DOCAS ──
    app.get("/api/operacional/docas", async () => db.operacionalDocas);
    app.get("/api/operacional/fila-patio", async () => db.operacionalFilaPatio);
    // ── ENTRADA DE FORNECEDORES ──
    app.get("/api/operacional/entradas-fornecedor", async (req) => {
        const { status, data } = req.query;
        let lista = db.operacionalEntradasFornecedor;
        if (status) lista = lista.filter(e => e.status === status);
        if (data) lista = lista.filter(e => e.horaEntrada?.startsWith(data));
        return lista.sort((a, b) => new Date(b.horaEntrada) - new Date(a.horaEntrada));
    });
    app.post("/api/operacional/entradas-fornecedor", async (req, reply) => {
        const schema = z.object({
            fornecedor: z.string().trim().min(2).max(200),
            cnpj: z.string().trim().max(20).optional().default(""),
            motorista: z.string().trim().max(200).optional().default(""),
            placa: z.string().trim().min(1).max(20),
            tipoVeiculo: z.string().trim().max(60).optional().default(""),
            notaFiscal: z.string().trim().max(100).optional().default(""),
            localParada: z.string().trim().max(100).optional().default(""),
            obs: z.string().trim().max(500).optional().default(""),
        });
        const body = schema.parse(req.body);
        const entrada = {
            id: nextId("ENF", db.operacionalEntradasFornecedor.length),
            ...body,
            horaEntrada: new Date().toISOString(),
            horaSaida: null,
            permanenciaMin: null,
            status: "PRESENTE",
            criadoEm: new Date().toISOString(),
        };
        db.operacionalEntradasFornecedor.push(entrada);
        return reply.status(201).send(entrada);
    });
    app.put("/api/operacional/entradas-fornecedor/:id/saida", async (req, reply) => {
        const entrada = db.operacionalEntradasFornecedor.find(e => e.id === req.params.id);
        if (!entrada) return reply.status(404).send({ error: "Registro nao encontrado" });
        if (entrada.status === "FINALIZADO") return reply.status(400).send({ error: "Saida ja registrada" });
        entrada.horaSaida = new Date().toISOString();
        entrada.permanenciaMin = Math.round((new Date(entrada.horaSaida) - new Date(entrada.horaEntrada)) / 60000);
        entrada.status = "FINALIZADO";
        return entrada;
    });
    // ── EXPORT CSV ──
    function toCsvRow(fields, obj) {
        return fields.map(f => {
            const v = obj[f] ?? "";
            const s = String(v).replace(/"/g, '""');
            return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s}"` : s;
        }).join(",");
    }
    function csvResponse(reply, filename, headers, rows) {
        const lines = [headers.join(","), ...rows];
        reply.header("Content-Type", "text/csv; charset=utf-8");
        reply.header("Content-Disposition", `attachment; filename="${filename}"`);
        return lines.join("\r\n");
    }
    app.get("/api/operacional/entradas-fornecedor/export-csv", async (req, reply) => {
        const { dataInicio, dataFim, status } = req.query;
        let lista = db.operacionalEntradasFornecedor;
        if (status && status !== "TODOS") lista = lista.filter(e => e.status === status);
        if (dataInicio) lista = lista.filter(e => e.horaEntrada >= dataInicio);
        if (dataFim) lista = lista.filter(e => e.horaEntrada <= dataFim + "T23:59:59");
        lista = lista.sort((a, b) => new Date(b.horaEntrada) - new Date(a.horaEntrada));
        const fields = ["id","fornecedor","cnpj","placa","tipoVeiculo","motorista","notaFiscal","localParada","horaEntrada","horaSaida","permanenciaMin","status","obs"];
        const headers = ["ID","Fornecedor","CNPJ","Placa","Tipo Veiculo","Motorista","Nota Fiscal","Local de Parada","Hora Entrada","Hora Saida","Permanencia (min)","Status","Observacoes"];
        const rows = lista.map(e => toCsvRow(fields, e));
        return csvResponse(reply, `entradas-fornecedor-${new Date().toISOString().slice(0,10)}.csv`, headers, rows);
    });
    app.get("/api/operacional/acessos/export-csv", async (req, reply) => {
        const { dataInicio, dataFim, status } = req.query;
        let lista = db.operacionalAcessos || [];
        if (status && status !== "TODOS") lista = lista.filter(e => e.status === status);
        if (dataInicio) lista = lista.filter(e => (e.dataHora || e.createdAt || "") >= dataInicio);
        if (dataFim) lista = lista.filter(e => (e.dataHora || e.createdAt || "") <= dataFim + "T23:59:59");
        lista = lista.slice(-500);
        const fields = ["id","tipo","nome","documento","empresa","status","dataHora","createdAt"];
        const headers = ["ID","Tipo","Nome","Documento","Empresa","Status","Data/Hora","Criado Em"];
        const rows = lista.map(e => toCsvRow(fields, e));
        return csvResponse(reply, `acessos-${new Date().toISOString().slice(0,10)}.csv`, headers, rows);
    });
    app.get("/api/operacional/visitantes/export-csv", async (req, reply) => {
        const { dataInicio, dataFim } = req.query;
        let lista = db.operacionalVisitantes || [];
        if (dataInicio) lista = lista.filter(e => (e.createdAt || "") >= dataInicio);
        if (dataFim) lista = lista.filter(e => (e.createdAt || "") <= dataFim + "T23:59:59");
        lista = lista.slice(-500);
        const fields = ["id","nome","documento","empresa","telefone","email","status","tipo","createdAt"];
        const headers = ["ID","Nome","Documento","Empresa","Telefone","E-mail","Status","Tipo","Criado Em"];
        const rows = lista.map(e => toCsvRow(fields, e));
        return csvResponse(reply, `visitantes-${new Date().toISOString().slice(0,10)}.csv`, headers, rows);
    });
    app.get("/api/operacional/frota/export-csv", async (req, reply) => {
        const lista = (db.operacionalFrota || []).slice(0, 500);
        const fields = ["id","placa","tipo","modelo","ano","setor","motoristaResponsavel","status","quilometragem","planta"];
        const headers = ["ID","Placa","Tipo","Modelo","Ano","Setor","Motorista Responsavel","Status","Quilometragem","Planta"];
        const rows = lista.map(e => toCsvRow(fields, e));
        return csvResponse(reply, `frota-${new Date().toISOString().slice(0,10)}.csv`, headers, rows);
    });
    app.get("/api/operacional/nf-transito/export-csv", async (req, reply) => {
        const filters = parseNfFilters({ ...req.query, pageSize: "5000", page: "1" });
        const result = await nfTransitoService.listDocumentos(filters);
        const docs = result.items ?? result ?? [];
        const headers = ["NF","Data Saida","Pedido","Carga","Cliente","Filial Saida","Filial Entrada","Valor (R$)","Fornecedor","Dias em Transito","Score Risco","Status","Chave NF-e","Operacao"];
        const fields = ["numero","dataEmissao","pedido","carga","cliente","flsaida","flentrada","valor","transportadoraNome","diasEmTransito","scoreRisco","status","chaveNfe","operacaoTipo"];
        const rows = docs.map(d => toCsvRow(fields, d));
        const bom = "﻿";
        const lines = [headers.join(";"), ...rows.map(r => r.replace(/,/g, ";"))];
        reply.header("Content-Type", "text/csv; charset=utf-8");
        reply.header("Content-Disposition", `attachment; filename="nf-transito-${new Date().toISOString().slice(0,10)}.csv"`);
        return bom + lines.join("\r\n");
    });
    // ── RESUMO DIÁRIO ──
    app.get("/api/resumo-diario", async () => {
        const hoje = new Date().toISOString().slice(0, 10);
        const acessosHoje = (db.operacionalAcessos || []).filter(a => (a.dataHora || a.createdAt || "").startsWith(hoje));
        const visitantesPresentes = (db.operacionalAcessos || []).filter(a => a.status === "DENTRO" || a.status === "PRESENTE" || a.status === "AGUARDANDO_VALIDACAO").length;
        const fornecedoresPresentes = (db.operacionalEntradasFornecedor || []).filter(e => e.status === "PRESENTE").length;
        const fornecedoresHoje = (db.operacionalEntradasFornecedor || []).filter(e => (e.horaEntrada || "").startsWith(hoje)).length;
        const frotaAtiva = (db.operacionalFrota || []).filter(v => v.status === "EM_DESLOCAMENTO").length;
        const frotaTotal = (db.operacionalFrota || []).length;
        const docasOcupadas = (db.operacionalDocas || []).filter(d => d.status === "OCUPADA").length;
        const docasTotal = (db.operacionalDocas || []).length;
        const agendamentosHoje = (db.operacionalAgendamentos || []).filter(a => (a.data || a.janelaInicio || "").startsWith(hoje)).length;
        const alertasAbertos = (db.operacionalAlertas || []).filter(a => a.status !== "RESOLVIDO").length;
        const excecoes = (db.operacionalExcecoes || []).filter(e => e.status === "ABERTA" || e.status === "PENDENTE").length;
        const solicitacoesAtivas = (db.operacionalSolicitacoesSaida || []).filter(s => s.status === "PENDENTE" || s.status === "APROVADO").length;
        return {
            data: hoje,
            portaria: {
                acessosHoje: acessosHoje.length,
                visitantesPresentes,
                fornecedoresPresentes,
                fornecedoresHoje,
                solicitacoesSaidaPendentes: solicitacoesAtivas,
            },
            frota: {
                veiculosAtivos: frotaAtiva,
                totalFrota: frotaTotal,
                agendamentosHoje,
            },
            patio: {
                docasOcupadas,
                docasTotal,
                naFila: (db.operacionalFilaPatio || []).length,
            },
            alertas: {
                abertos: alertasAbertos,
                excecoesPendentes: excecoes,
            },
        };
    });
    // ── ALERTAS SLA ──
    app.get("/api/alertas-sla", async () => {
        const agora = new Date();
        const alertas = [];
        // Fornecedores com permanência longa (> 4h)
        for (const e of db.operacionalEntradasFornecedor || []) {
            if (e.status === "PRESENTE" && e.horaEntrada) {
                const min = Math.round((agora - new Date(e.horaEntrada)) / 60000);
                if (min > 240) alertas.push({ tipo: "FORNECEDOR_LONGO", id: e.id, descricao: `${e.fornecedor} (${e.placa}) há ${min} min no pátio`, prioridade: min > 480 ? "ALTA" : "MEDIA" });
            }
        }
        // Solicitações de saída pendentes há mais de 1h
        for (const s of db.operacionalSolicitacoesSaida || []) {
            if (s.status === "PENDENTE" && s.createdAt) {
                const min = Math.round((agora - new Date(s.createdAt)) / 60000);
                if (min > 60) alertas.push({ tipo: "SAIDA_PENDENTE", id: s.id, descricao: `Saída de ${s.funcionarioNome || s.nome || "funcionário"} aguarda aprovação há ${min} min`, prioridade: "ALTA" });
            }
        }
        // Exceções abertas
        for (const e of db.operacionalExcecoes || []) {
            if (e.status === "ABERTA" || e.status === "PENDENTE") {
                alertas.push({ tipo: "EXCECAO", id: e.id, descricao: e.descricao || "Exceção em aberto", prioridade: e.prioridade || "MEDIA" });
            }
        }
        return { total: alertas.length, alertas };
    });
    // ── MONITORAMENTO ──
    app.get("/api/operacional/alertas", async () => db.operacionalAlertas);
    app.get("/api/operacional/excecoes", async () => db.operacionalExcecoes);
    // ── DASHBOARD ──
    app.get("/api/operacional/dashboard", async (req) => {
        const base = { ...db.operacionalDashboard };
        try {
            const filters = parseNfFilters(req.query);
            const nfDash = await nfTransitoService.getDashboard(filters);
            return {
                ...base,
                nfsEmTransito: nfDash.totalNfsTransito,
                nfsEmRisco: nfDash.totalEmRisco,
                nfsSemConfirmacao: nfDash.nfsSemConfirmacao,
                valorEmTransito: nfDash.valorEmTransito,
                valorEmRisco: nfDash.valorEmRisco,
                mediaDiasTransito: nfDash.mediaDiasTransito,
            };
        }
        catch (error) {
            app.log.warn({ error, component: "operacionalRoutes", action: "dashboardNfFallback" }, "Nao foi possivel atualizar KPIs de NF em transito no dashboard operacional.");
            return base;
        }
    });
    // ── NF TRÂNSITO ──
    app.get("/api/operacional/nf-transito/dashboard", async (req) => {
        const filters = parseNfFilters(req.query);
        return nfTransitoService.getDashboard(filters);
    });
    app.get("/api/operacional/nf-transito/documentos", async (req) => {
        const filters = parseNfFilters(req.query);
        return nfTransitoService.listDocumentos(filters);
    });
    // Compatibilidade com o frontend atual
    app.get("/api/operacional/nf-transito", async (req) => {
        const filters = parseNfFilters(req.query);
        const result = await nfTransitoService.listDocumentos(filters);
        return result.items;
    });
    app.get("/api/operacional/nf-transito/risco", async (req) => {
        const filters = parseNfFilters(req.query);
        return nfTransitoService.getPainelRisco(filters);
    });
    app.get("/api/operacional/nf-transito/aging-sla", async (req) => {
        const filters = parseNfFilters(req.query);
        return nfTransitoService.getAgingSla(filters);
    });
    app.get("/api/operacional/nf-transito/excecoes-fiscais", async (req) => {
        const filters = parseNfFilters(req.query);
        return nfTransitoService.getExcecoesFiscais(filters);
    });
    // Compatibilidade com o frontend atual
    app.get("/api/operacional/excecoes-fiscais", async (req) => {
        const filters = parseNfFilters(req.query);
        return nfTransitoService.getExcecoesFiscais(filters);
    });
    app.get("/api/operacional/nf-transito/cadeia-custodia/:id", async (req) => {
        const params = z.object({ id: z.string().min(1) }).parse(req.params);
        const filters = parseNfFilters(req.query);
        return nfTransitoService.getCadeiaCustodia(params.id, filters);
    });
    app.get("/api/operacional/nf-transito/documentos/:id", async (req) => {
        const params = z.object({ id: z.string().min(1) }).parse(req.params);
        const filters = parseNfFilters(req.query);
        return nfTransitoService.getDocumentoById(params.id, filters);
    });
    app.get("/api/operacional/nf-transito/:id", async (req) => {
        const params = z.object({ id: z.string().min(1) }).parse(req.params);
        const filters = parseNfFilters(req.query);
        return nfTransitoService.getDocumentoById(params.id, filters);
    });
    app.put("/api/operacional/nf-transito/:id/confirmar-recebimento", async (req) => {
        const params = z.object({ id: z.string().min(1) }).parse(req.params);
        const item = await nfTransitoService.confirmRecebimento(params.id);
        appendAudit("CONFIRMAR_RECEBIMENTO", "NF_TRANSITO", params.id, "Recebimento confirmado", req.authUser?.nome ?? "system");
        return item;
    });
    app.get("/api/operacional/_legacy/nf-transito/:id", async (req, reply) => {
        const { id } = z.object({ id: z.string() }).parse(req.params);
        const item = db.operacionalNFsTransito.find((nf) => nf.id === id);
        if (!item)
            return reply.status(404).send({ error: { message: "NF não encontrada." } });
        return item;
    });
    app.get("/api/operacional/_legacy/excecoes-fiscais", async () => db.operacionalExcecoesFiscais);
    app.put("/api/operacional/_legacy/nf-transito/:id/confirmar-recebimento", async (req, reply) => {
        const { id } = z.object({ id: z.string() }).parse(req.params);
        const idx = db.operacionalNFsTransito.findIndex((nf) => nf.id === id);
        if (idx < 0)
            return reply.status(404).send({ error: { message: "NF não encontrada." } });
        db.operacionalNFsTransito[idx] = {
            ...db.operacionalNFsTransito[idx],
            status: "RECEBIMENTO_CONFIRMADO",
            dataEntregaReal: new Date().toISOString(),
            criticidade: "VERDE",
            scoreRisco: 0,
        };
        appendAudit("CONFIRMAR_RECEBIMENTO", "NF_TRANSITO", id, "Recebimento confirmado", req.authUser?.nome ?? "system");
        return db.operacionalNFsTransito[idx];
    });
    // ── TIMELINE ──
    app.get("/api/operacional/timeline/:acessoId", async (req) => {
        const { acessoId } = z.object({ acessoId: z.string() }).parse(req.params);
        const timeline = db.operacionalTimeline.filter((item) => !item.acessoId || item.acessoId === acessoId);
        return timeline;
    });
}
