import { z } from "zod";
import { db, nextId, appendAudit } from "../repositories/dataStore.js";
import { NFTransitoWinthorService } from "../modules/nfTransito/nfTransitoWinthorService.js";
export async function torreAgendaCustodiaRoutes(app) {
    const nfTransitoService = new NFTransitoWinthorService(app.log);
    const normalizeCustodiaStatus = (status, emRisco) => {
        const raw = String(status ?? "").trim().toUpperCase();
        if (raw === "RECEBIMENTO_CONFIRMADO") {
            return "CHEGADA_REGISTRADA";
        }
        if (["EM_RISCO", "CRITICA", "EXCECAO_FISCAL"].includes(raw) || emRisco) {
            return "EM_RISCO";
        }
        if (["AGUARDANDO_CONFIRMACAO", "EM_TRANSITO"].includes(raw)) {
            return "EM_TRANSITO";
        }
        return "EM_TRANSITO";
    };
    const normalizeNfNumero = (value) => {
        const raw = String(value ?? "").trim();
        if (!raw)
            return "-";
        return /^NF[\s-]?/i.test(raw) ? raw : `NF-${raw}`;
    };
    const asFiniteNumber = (value, fallback = 0) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    };
    const mapCheckpointTipo = (tipo) => {
        const raw = String(tipo ?? "").trim().toUpperCase();
        if (raw.includes("EMITIDA"))
            return "EMISSAO";
        if (raw.includes("SAIDA"))
            return "SAIDA";
        if (raw.includes("TRANSITO"))
            return "CHECKPOINT";
        if (raw.includes("CHECKPOINT"))
            return "CHECKPOINT";
        if (raw.includes("ENTREGA"))
            return "ENTREGA";
        return raw || "CHECKPOINT";
    };
    const mapCheckpointEtapa = (tipo) => {
        const raw = String(tipo ?? "").trim().toUpperCase();
        if (raw.includes("EMITIDA"))
            return "Emissao";
        if (raw.includes("SAIDA"))
            return "Saida";
        if (raw.includes("TRANSITO"))
            return "Em Transito";
        if (raw.includes("CHECKPOINT"))
            return "Checkpoint";
        if (raw.includes("ENTREGA"))
            return "Entrega";
        return "Evento";
    };
    const mergeUniqueById = (base, incoming) => {
        const output = Array.isArray(base) ? [...base] : [];
        const seen = new Set(output.map((item) => String(item?.id ?? "")));
        for (const item of Array.isArray(incoming) ? incoming : []) {
            const key = String(item?.id ?? "");
            if (!key || seen.has(key))
                continue;
            seen.add(key);
            output.push(item);
        }
        return output;
    };
    const buildCustodiaFromDocumento = (doc, cadeia) => {
        const status = normalizeCustodiaStatus(doc?.status ?? doc?.status_transito, Boolean(doc?.emRisco));
        const checkpoints = Array.isArray(doc?.checkpoints) ? doc.checkpoints : [];
        const eventosFromCheckpoints = checkpoints.map((cp, index) => ({
            id: cp?.id ? `CP-${cp.id}` : `CP-${doc.id}-${index + 1}`,
            etapa: mapCheckpointEtapa(cp?.tipo),
            descricao: cp?.descricao || "Evento de rastreabilidade",
            dataHora: cp?.dataHora || doc?.dtsaida || new Date().toISOString(),
            localizacao: cp?.localizacao || undefined,
            responsavel: cp?.responsavel || "WinThor",
            tipo: mapCheckpointTipo(cp?.tipo),
        }));
        const eventosFromCadeia = Array.isArray(cadeia?.eventos)
            ? cadeia.eventos.map((evento, index) => ({
                id: `CD-${doc.id}-${index + 1}`,
                etapa: evento?.etapa || "Evento",
                descricao: evento?.descricao || "Atualizacao da cadeia de custodia",
                dataHora: evento?.dataHora || doc?.dtsaida || new Date().toISOString(),
                localizacao: evento?.localizacao || undefined,
                responsavel: evento?.responsavel || "Torre de Controle",
                tipo: mapCheckpointTipo(evento?.tipo || evento?.etapa),
            }))
            : [];
        const eventos = mergeUniqueById(eventosFromCheckpoints, eventosFromCadeia).sort((a, b) => new Date(a.dataHora).getTime() - new Date(b.dataHora).getTime());
        const evidencias = [
            {
                id: `EV-SAIDA-${doc.id}`,
                tipo: "COMPROVANTE_SAIDA",
                descricao: "Registro de saida para transito",
                dataHora: doc?.dtsaida || new Date().toISOString(),
                responsavel: "WinThor",
            },
        ];
        if (String(doc?.statusImportacao ?? "").toUpperCase() === "IMPORTADA") {
            evidencias.push({
                id: `EV-CHEGADA-${doc.id}`,
                tipo: "COMPROVANTE_CHEGADA",
                descricao: "Entrada/importacao registrada",
                dataHora: new Date().toISOString(),
                responsavel: "WinThor",
            });
        }
        const valor = asFiniteNumber(doc?.valor ?? doc?.vltotal, 0);
        return {
            id: String(doc?.id ?? ""),
            nfId: String(doc?.id ?? ""),
            nfNumero: normalizeNfNumero(doc?.numnota ?? doc?.numero),
            status,
            cliente: doc?.cliente || "-",
            filialSaida: doc?.flsaida || doc?.codfilial || doc?.planta || "-",
            filialEntrada: doc?.flentrada || "-",
            destino: doc?.destino || doc?.fornecedor || "-",
            valor,
            veiculoPlaca: doc?.placa || "-",
            motoristaNome: doc?.motoristaNome || "-",
            transportadoraNome: doc?.transportadoraNome || doc?.fornecedor || "-",
            docaSaida: doc?.codfilial ? `Filial ${doc.codfilial}` : "-",
            operacaoPatio: doc?.carga && doc.carga !== "-" ? `Carga ${doc.carga}` : undefined,
            dataEmissao: doc?.dataEmissao || doc?.dataSaidaFormatada || "-",
            dataSaidaPortaria: doc?.dataSaidaReal || doc?.dtsaida || null,
            dataChegadaDestino: null,
            dataEntrega: null,
            recebedorNome: undefined,
            statusAceite: String(doc?.statusImportacao ?? "").toUpperCase() === "IMPORTADA" ? "ACEITO" : "PENDENTE",
            divergencia: status === "EM_RISCO" ? doc?.motivoRisco || doc?.motivo_risco || undefined : undefined,
            eventos,
            evidencias,
            diasEmTransito: asFiniteNumber(doc?.diasEmTransito ?? doc?.dias_em_transito, 0),
            scoreRisco: asFiniteNumber(doc?.scoreRisco ?? doc?.score_risco, 0),
            planta: doc?.codfilial || doc?.planta || "-",
            origemDados: "PCNFSAID",
            atualizadoEm: new Date().toISOString(),
        };
    };
    const mergeWithLocalCustodia = (base) => {
        const local = db.custodias.find((item) => String(item?.id ?? "") === String(base.id));
        if (!local)
            return base;
        const lifecycleOverrideStatuses = new Set([
            "CHEGADA_REGISTRADA",
            "ENTREGUE",
            "ENTREGUE_COM_RESSALVA",
            "NAO_ENTREGUE",
            "DEVOLVIDA",
            "ENCERRADA",
        ]);
        const shouldOverrideLifecycle = lifecycleOverrideStatuses.has(String(local.status ?? "").toUpperCase());
        const override = {
            status: local.status,
            recebedorNome: local.recebedorNome,
            statusAceite: local.statusAceite,
            divergencia: local.divergencia,
            dataChegadaDestino: local.dataChegadaDestino,
            dataEntrega: local.dataEntrega,
            operacaoPatio: local.operacaoPatio,
            docaSaida: local.docaSaida,
            veiculoPlaca: local.veiculoPlaca,
            motoristaNome: local.motoristaNome,
            transportadoraNome: local.transportadoraNome,
            scoreRisco: local.scoreRisco,
            atualizadoEm: local.atualizadoEm || base.atualizadoEm,
        };
        return {
            ...base,
            ...(shouldOverrideLifecycle
                ? Object.fromEntries(Object.entries(override).filter(([, value]) => value !== undefined && value !== null && value !== ""))
                : {}),
            eventos: mergeUniqueById(base.eventos, local.eventos),
            evidencias: mergeUniqueById(base.evidencias, local.evidencias),
        };
    };
    const buildCustodiaView = async (filters = {}) => {
        const result = await nfTransitoService.listDocumentos(filters);
        return result.items.map((doc) => mergeWithLocalCustodia(buildCustodiaFromDocumento(doc)));
    };
    const ensureWritableCustodia = async (id, filters = {}) => {
        const existing = db.custodias.find((item) => String(item?.id ?? "") === String(id));
        if (existing)
            return existing;
        const [doc, cadeia] = await Promise.all([
            nfTransitoService.getDocumentoById(String(id), filters),
            nfTransitoService.getCadeiaCustodia(String(id), filters).catch(() => null),
        ]);
        const mirror = {
            ...buildCustodiaFromDocumento(doc, cadeia),
            eventos: mergeUniqueById([], buildCustodiaFromDocumento(doc, cadeia).eventos),
            evidencias: mergeUniqueById([], buildCustodiaFromDocumento(doc, cadeia).evidencias),
            criadoEm: new Date().toISOString(),
            atualizadoEm: new Date().toISOString(),
            origemDados: "PCNFSAID_MIRROR",
        };
        db.custodias.unshift(mirror);
        return mirror;
    };
    // ══════════════════════════════════════════════════
    // PHASE 1 — TORRE DE CONTROLE DE EXCEÇÕES
    // ══════════════════════════════════════════════════
    app.get("/api/operacional/torre-controle/excecoes", async () => db.torreExcecoes);
    app.get("/api/operacional/torre-controle/kpis", async () => {
        const list = db.torreExcecoes;
        const active = list.filter((e) => e.status !== "RESOLVIDA" && e.status !== "ENCERRADA");
        return {
            totalAbertas: active.length,
            criticas: active.filter((e) => e.criticidade === "CRITICA").length,
            slaEstourado: active.filter((e) => e.prazo && new Date(e.prazo) < new Date()).length,
            semResponsavel: active.filter((e) => !e.responsavel).length,
            nfsEmRisco: active.filter((e) => e.categoria === "NF_TRANSITO").length,
            docasCongestionadas: active.filter((e) => e.categoria === "PATIO" && e.titulo?.includes("oca")).length,
            permanenciaFora: active.filter((e) => e.titulo?.toLowerCase().includes("permanência") || e.titulo?.toLowerCase().includes("permanencia")).length,
            pendenciasDocumentais: active.filter((e) => e.categoria === "DOCUMENTACAO" || e.categoria === "TRANSPORTADORA").length,
            transportadorasIrregulares: active.filter((e) => e.categoria === "TRANSPORTADORA").length,
            semTratativa: active.filter((e) => !e.tratativa).length,
            resolvidasHoje: list.filter((e) => e.status === "RESOLVIDA" && e.atualizadoEm?.slice(0, 10) === new Date().toISOString().slice(0, 10)).length,
            reincidentes: active.filter((e) => e.reincidencias > 0).length,
        };
    });
    app.get("/api/operacional/torre-controle/excecoes/:id", async (req, reply) => {
        const { id } = z.object({ id: z.string() }).parse(req.params);
        const item = db.torreExcecoes.find((e) => e.id === id);
        if (!item)
            return reply.status(404).send({ error: { message: "Exceção não encontrada." } });
        return item;
    });
    app.put("/api/operacional/torre-controle/excecoes/:id/responsavel", async (req, reply) => {
        const { id } = z.object({ id: z.string() }).parse(req.params);
        const { responsavel } = req.body;
        const idx = db.torreExcecoes.findIndex((e) => e.id === id);
        if (idx < 0)
            return reply.status(404).send({ error: { message: "Exceção não encontrada." } });
        const exc = db.torreExcecoes[idx];
        exc.responsavel = responsavel;
        exc.atualizadoEm = new Date().toISOString();
        exc.historico.push({
            id: `H-${Date.now()}`, tipo: "ATRIBUICAO", descricao: `Responsável atribuído: ${responsavel}`,
            dataHora: new Date().toISOString(), usuario: req.authUser?.nome ?? "system",
        });
        appendAudit("ATRIBUIR_RESPONSAVEL", "TORRE_EXCECAO", id, `Responsável: ${responsavel}`, req.authUser?.nome ?? "system");
        return exc;
    });
    app.put("/api/operacional/torre-controle/excecoes/:id/status", async (req, reply) => {
        const { id } = z.object({ id: z.string() }).parse(req.params);
        const { status, justificativa } = req.body;
        const idx = db.torreExcecoes.findIndex((e) => e.id === id);
        if (idx < 0)
            return reply.status(404).send({ error: { message: "Exceção não encontrada." } });
        const exc = db.torreExcecoes[idx];
        const prev = exc.status;
        exc.status = status;
        exc.atualizadoEm = new Date().toISOString();
        if (justificativa)
            exc.justificativa = justificativa;
        exc.historico.push({
            id: `H-${Date.now()}`, tipo: "STATUS", descricao: `Status: ${prev} → ${status}${justificativa ? ` — ${justificativa}` : ""}`,
            dataHora: new Date().toISOString(), usuario: req.authUser?.nome ?? "system",
        });
        appendAudit("MUDAR_STATUS", "TORRE_EXCECAO", id, `${prev} → ${status}`, req.authUser?.nome ?? "system");
        return exc;
    });
    app.put("/api/operacional/torre-controle/excecoes/:id/tratativa", async (req, reply) => {
        const { id } = z.object({ id: z.string() }).parse(req.params);
        const { tratativa } = req.body;
        const idx = db.torreExcecoes.findIndex((e) => e.id === id);
        if (idx < 0)
            return reply.status(404).send({ error: { message: "Exceção não encontrada." } });
        const exc = db.torreExcecoes[idx];
        exc.tratativa = tratativa;
        exc.atualizadoEm = new Date().toISOString();
        if (exc.status === "ABERTA")
            exc.status = "EM_TRATATIVA";
        exc.historico.push({
            id: `H-${Date.now()}`, tipo: "TRATATIVA", descricao: `Tratativa: ${tratativa}`,
            dataHora: new Date().toISOString(), usuario: req.authUser?.nome ?? "system",
        });
        appendAudit("REGISTRAR_TRATATIVA", "TORRE_EXCECAO", id, tratativa, req.authUser?.nome ?? "system");
        return exc;
    });
    app.post("/api/operacional/torre-controle/excecoes", async (req) => {
        const body = req.body;
        const rec = {
            ...body,
            id: nextId("TOR", db.torreExcecoes.length),
            criadoEm: new Date().toISOString(),
            atualizadoEm: new Date().toISOString(),
            historico: [{ id: `H-${Date.now()}`, tipo: "CRIACAO", descricao: "Exceção criada", dataHora: new Date().toISOString(), usuario: req.authUser?.nome ?? "system" }],
            tags: body.tags || [],
            reincidencias: 0,
        };
        db.torreExcecoes.push(rec);
        appendAudit("CRIAR", "TORRE_EXCECAO", rec.id, rec.titulo, req.authUser?.nome ?? "system");
        return rec;
    });
    // ══════════════════════════════════════════════════
    // PHASE 2 — AGENDAMENTO INTELIGENTE DE DOCA / PÁTIO
    // ══════════════════════════════════════════════════
    app.get("/api/operacional/agendamentos-dock", async () => db.agendamentosSlots);
    app.get("/api/operacional/dock-capacity", async () => db.agendamentoDockCapacity);
    app.get("/api/operacional/agendamento-kpis", async () => {
        const list = db.agendamentosSlots;
        const active = list.filter((s) => new Date(s.dataHoraPrevista).toDateString() === new Date().toDateString());
        return {
            taxaOcupacao: 32,
            tempoMedioEspera: 42,
            tempoMedioOperacao: 68,
            atrasosDia: active.filter((s) => s.status === "ATRASADO").length,
            dentroJanela: active.length > 0 ? Math.round(active.filter((s) => s.sla >= 80).length / active.length * 100) : 100,
            noShow: active.filter((s) => s.status === "NAO_COMPARECEU").length,
            remarcacoes: active.filter((s) => s.status === "REMARCADO").length,
            conflitoAgenda: 1,
            permanenciaMedia: 95,
            throughputDoca: 3.2,
        };
    });
    app.post("/api/operacional/agendamentos-dock", async (req) => {
        const body = req.body;
        const rec = {
            ...body,
            id: nextId("AGD", db.agendamentosSlots.length),
            codigo: `AGD-${String(db.agendamentosSlots.length + 1).padStart(3, "0")}`,
            status: body.status || "AGENDADO",
            sla: 100,
            pendencias: body.pendencias || [],
            criadoEm: new Date().toISOString(),
            atualizadoEm: new Date().toISOString(),
        };
        db.agendamentosSlots.push(rec);
        appendAudit("CRIAR", "AGENDAMENTO", rec.id, `Agendamento ${rec.codigo}`, req.authUser?.nome ?? "system");
        return rec;
    });
    app.put("/api/operacional/agendamentos-dock/:id", async (req, reply) => {
        const { id } = z.object({ id: z.string() }).parse(req.params);
        const body = req.body;
        const idx = db.agendamentosSlots.findIndex((s) => s.id === id);
        if (idx < 0)
            return reply.status(404).send({ error: { message: "Agendamento não encontrado." } });
        db.agendamentosSlots[idx] = { ...db.agendamentosSlots[idx], ...body, atualizadoEm: new Date().toISOString() };
        appendAudit("EDITAR", "AGENDAMENTO", id, `Status: ${body.status || "update"}`, req.authUser?.nome ?? "system");
        return db.agendamentosSlots[idx];
    });
    app.put("/api/operacional/agendamentos-dock/:id/status", async (req, reply) => {
        const { id } = z.object({ id: z.string() }).parse(req.params);
        const { status, observacao } = req.body;
        const idx = db.agendamentosSlots.findIndex((s) => s.id === id);
        if (idx < 0)
            return reply.status(404).send({ error: { message: "Agendamento não encontrado." } });
        const slot = db.agendamentosSlots[idx];
        slot.status = status;
        slot.atualizadoEm = new Date().toISOString();
        if (status === "CHEGOU" && !slot.dataHoraRealChegada)
            slot.dataHoraRealChegada = new Date().toISOString();
        if (observacao)
            slot.observacoes = (slot.observacoes ? slot.observacoes + "\n" : "") + observacao;
        appendAudit("STATUS_AGENDAMENTO", "AGENDAMENTO", id, `Status → ${status}`, req.authUser?.nome ?? "system");
        // Generate torre exception for delays
        if (status === "ATRASADO" || status === "NAO_COMPARECEU") {
            const exc = {
                id: nextId("TOR", db.torreExcecoes.length),
                titulo: status === "ATRASADO" ? `Atraso no agendamento ${slot.codigo}` : `No-show: ${slot.codigo}`,
                descricao: `${slot.transportadoraNome} — ${slot.tipoOperacao} na ${slot.docaPrevistaNome || "doca"}`,
                categoria: "PATIO", criticidade: status === "NAO_COMPARECEU" ? "ALTA" : "MEDIA",
                status: "ABERTA", origem: "Agendamento", origemId: id, origemRota: `/patio/agendamento/${id}`,
                criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString(),
                prazo: new Date(Date.now() + 4 * 3600000).toISOString(), reincidencias: 0,
                acaoSugerida: status === "NAO_COMPARECEU" ? "Contatar transportadora" : "Verificar status do veículo",
                historico: [{ id: `H-${Date.now()}`, tipo: "CRIACAO", descricao: "Gerada automaticamente do agendamento", dataHora: new Date().toISOString(), usuario: "Sistema" }],
                tags: ["agendamento", status.toLowerCase()], planta: slot.planta || "MAO",
            };
            db.torreExcecoes.push(exc);
        }
        return slot;
    });
    app.put("/api/operacional/agendamentos-dock/:id/doca", async (req, reply) => {
        const { id } = z.object({ id: z.string() }).parse(req.params);
        const { docaId, docaNome } = req.body;
        const idx = db.agendamentosSlots.findIndex((s) => s.id === id);
        if (idx < 0)
            return reply.status(404).send({ error: { message: "Agendamento não encontrado." } });
        const slot = db.agendamentosSlots[idx];
        slot.docaRealId = docaId;
        slot.docaRealNome = docaNome;
        slot.atualizadoEm = new Date().toISOString();
        appendAudit("ALOCAR_DOCA", "AGENDAMENTO", id, `Doca: ${docaNome}`, req.authUser?.nome ?? "system");
        return slot;
    });
    // ══════════════════════════════════════════════════
    // PHASE 3 — CADEIA DE CUSTÓDIA DIGITAL
    // ══════════════════════════════════════════════════
    app.get("/api/operacional/custodia", async (req) => {
        return buildCustodiaView(req.query ?? {});
    });
    app.get("/api/operacional/custodia/kpis", async (req) => {
        const list = await buildCustodiaView(req.query ?? {});
        const active = list.filter((c) => c.status !== "ENCERRADA");
        const dentroSla = active.filter((c) => asFiniteNumber(c.diasEmTransito, 0) <= 3).length;
        const leadTimeMedio = active.length > 0 ? +(active.reduce((sum, item) => sum + asFiniteNumber(item.diasEmTransito, 0), 0) / active.length).toFixed(1) : 0;
        return {
            nfsEmTransito: active.filter((c) => ["EM_TRANSITO", "SAIU_PORTARIA", "EM_RISCO", "CHEGADA_REGISTRADA"].includes(c.status)).length,
            nfsEmRisco: active.filter((c) => c.status === "EM_RISCO" || asFiniteNumber(c.scoreRisco, 0) > 50).length,
            nfsAtrasadas: active.filter((c) => asFiniteNumber(c.diasEmTransito, 0) > 5).length,
            nfsSemConfirmacao: active.filter((c) => c.statusAceite === "PENDENTE").length,
            nfsComDivergencia: active.filter((c) => Boolean(c.divergencia)).length,
            entregasComRessalva: list.filter((c) => c.status === "ENTREGUE_COM_RESSALVA").length,
            devolucoes: list.filter((c) => c.status === "DEVOLVIDA").length,
            leadTimeMedio,
            slaRota: active.length > 0 ? Math.round((dentroSla / active.length) * 100) : 100,
            envelhecimentoMedio: leadTimeMedio,
        };
    });
    app.get("/api/operacional/custodia/:id", async (req) => {
        const { id } = z.object({ id: z.string() }).parse(req.params);
        try {
            const [doc, cadeia] = await Promise.all([
                nfTransitoService.getDocumentoById(id, req.query ?? {}),
                nfTransitoService.getCadeiaCustodia(id, req.query ?? {}).catch(() => null),
            ]);
            return mergeWithLocalCustodia(buildCustodiaFromDocumento(doc, cadeia));
        }
        catch (error) {
            const local = db.custodias.find((item) => String(item?.id ?? "") === String(id));
            if (local)
                return local;
            throw error;
        }
    });
    app.post("/api/operacional/custodia/:id/evento", async (req, reply) => {
        try {
            const { id } = z.object({ id: z.string() }).parse(req.params);
            const body = req.body ?? {};
            const cust = await ensureWritableCustodia(id, req.query ?? {});
            const idxMirror = db.custodias.findIndex((item) => String(item?.id ?? "") === String(cust.id));
            const evento = {
                id: `CE-${Date.now()}`,
                etapa: body.etapa || body.tipo || "Evento",
                descricao: body.descricao || "Atualizacao manual da cadeia de custodia",
                dataHora: new Date().toISOString(),
                localizacao: body.localizacao,
                responsavel: req.authUser?.nome ?? body.responsavel ?? "system",
                tipo: body.tipo || "CHECKPOINT",
            };
            cust.eventos = mergeUniqueById(cust.eventos, [evento]);
            cust.atualizadoEm = new Date().toISOString();
            const statusMap = {
                CHEGADA: "CHEGADA_REGISTRADA",
                ENTREGA: "ENTREGUE",
                DEVOLUCAO: "DEVOLVIDA",
                ENCERRAMENTO: "ENCERRADA",
            };
            if (statusMap[body.tipo]) {
                cust.status = statusMap[body.tipo];
            }
            if (body.tipo === "CHEGADA") {
                cust.dataChegadaDestino = new Date().toISOString();
            }
            if (body.tipo === "ENTREGA") {
                cust.dataEntrega = new Date().toISOString();
                cust.statusAceite = cust.statusAceite || "ACEITO";
                cust.scoreRisco = 0;
            }
            if (idxMirror >= 0) {
                db.custodias[idxMirror] = cust;
            }
            appendAudit("EVENTO_CUSTODIA", "CUSTODIA", id, `${body.tipo || "EVENTO"}: ${evento.descricao}`, req.authUser?.nome ?? "system");
            if (body.tipo === "DIVERGENCIA" || body.tipo === "DEVOLUCAO") {
                const exc = {
                    id: nextId("TOR", db.torreExcecoes.length),
                    titulo: body.tipo === "DEVOLUCAO" ? `Devolucao: ${cust.nfNumero}` : `Divergencia: ${cust.nfNumero}`,
                    descricao: evento.descricao,
                    categoria: "NF_TRANSITO",
                    criticidade: body.tipo === "DEVOLUCAO" ? "CRITICA" : "ALTA",
                    status: "ABERTA",
                    origem: "Custodia",
                    origemId: id,
                    origemRota: `/custodia/${id}`,
                    criadoEm: new Date().toISOString(),
                    atualizadoEm: new Date().toISOString(),
                    prazo: new Date(Date.now() + 8 * 3600000).toISOString(),
                    reincidencias: 0,
                    historico: [{ id: `H-${Date.now()}`, tipo: "CRIACAO", descricao: "Gerada pela cadeia de custodia", dataHora: new Date().toISOString(), usuario: "Sistema" }],
                    tags: ["custodia", String(body.tipo || "evento").toLowerCase()],
                    planta: cust.planta || "MAO",
                };
                db.torreExcecoes.push(exc);
            }
            return mergeWithLocalCustodia(cust);
        }
        catch (error) {
            app.log.warn({ error, component: "torreAgendaCustodiaRoutes", action: "postCustodiaEventoFallback" }, "Falha ao registrar evento de custodia com base real. Usando fallback local.");
        }
        const { id } = z.object({ id: z.string() }).parse(req.params);
        const body = req.body;
        const idx = db.custodias.findIndex((c) => c.id === id);
        if (idx < 0)
            return reply.status(404).send({ error: { message: "Custódia não encontrada." } });
        const cust = db.custodias[idx];
        const evento = {
            id: `CE-${Date.now()}`,
            etapa: body.etapa,
            descricao: body.descricao,
            dataHora: new Date().toISOString(),
            localizacao: body.localizacao,
            responsavel: req.authUser?.nome ?? body.responsavel ?? "system",
            tipo: body.tipo,
        };
        cust.eventos.push(evento);
        cust.atualizadoEm = new Date().toISOString();
        // Update status based on event type
        const statusMap = {
            CHEGADA: "CHEGADA_REGISTRADA", ENTREGA: "ENTREGUE",
            DEVOLUCAO: "DEVOLVIDA", ENCERRAMENTO: "ENCERRADA",
        };
        if (statusMap[body.tipo])
            cust.status = statusMap[body.tipo];
        if (body.tipo === "CHEGADA")
            cust.dataChegadaDestino = new Date().toISOString();
        if (body.tipo === "ENTREGA")
            cust.dataEntrega = new Date().toISOString();
        appendAudit("EVENTO_CUSTODIA", "CUSTODIA", id, `${body.tipo}: ${body.descricao}`, req.authUser?.nome ?? "system");
        // Generate torre exception for critical events
        if (body.tipo === "DIVERGENCIA" || body.tipo === "DEVOLUCAO") {
            const exc = {
                id: nextId("TOR", db.torreExcecoes.length),
                titulo: body.tipo === "DEVOLUCAO" ? `Devolução: ${cust.nfNumero}` : `Divergência: ${cust.nfNumero}`,
                descricao: body.descricao,
                categoria: "NF_TRANSITO", criticidade: body.tipo === "DEVOLUCAO" ? "CRITICA" : "ALTA",
                status: "ABERTA", origem: "Custódia", origemId: id, origemRota: `/custodia/${id}`,
                criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString(),
                prazo: new Date(Date.now() + 8 * 3600000).toISOString(), reincidencias: 0,
                historico: [{ id: `H-${Date.now()}`, tipo: "CRIACAO", descricao: "Gerada pela cadeia de custódia", dataHora: new Date().toISOString(), usuario: "Sistema" }],
                tags: ["custodia", body.tipo.toLowerCase()], planta: cust.planta || "MAO",
            };
            db.torreExcecoes.push(exc);
        }
        return cust;
    });
    app.post("/api/operacional/custodia/:id/evidencia", async (req, reply) => {
        try {
            const { id } = z.object({ id: z.string() }).parse(req.params);
            const body = req.body ?? {};
            const cust = await ensureWritableCustodia(id, req.query ?? {});
            const idxMirror = db.custodias.findIndex((item) => String(item?.id ?? "") === String(cust.id));
            const evidencia = {
                id: `EV-${Date.now()}`,
                tipo: body.tipo || "DOCUMENTO",
                descricao: body.descricao || "Evidencia registrada manualmente",
                dataHora: new Date().toISOString(),
                responsavel: req.authUser?.nome ?? body.responsavel ?? "system",
                observacao: body.observacao,
                url: body.url,
                categoria: body.categoria,
                etapaRelacionada: body.etapaRelacionada,
                nomeArquivo: body.nomeArquivo,
                mimeType: body.mimeType,
                tamanhoArquivo: body.tamanhoArquivo,
            };
            cust.evidencias = mergeUniqueById(cust.evidencias, [evidencia]);
            cust.atualizadoEm = new Date().toISOString();
            if (idxMirror >= 0) {
                db.custodias[idxMirror] = cust;
            }
            appendAudit("EVIDENCIA_CUSTODIA", "CUSTODIA", id, `${evidencia.tipo}: ${evidencia.descricao}`, req.authUser?.nome ?? "system");
            return mergeWithLocalCustodia(cust);
        }
        catch (error) {
            app.log.warn({ error, component: "torreAgendaCustodiaRoutes", action: "postCustodiaEvidenciaFallback" }, "Falha ao registrar evidencia de custodia com base real. Usando fallback local.");
        }
        const { id } = z.object({ id: z.string() }).parse(req.params);
        const body = req.body;
        const idx = db.custodias.findIndex((c) => c.id === id);
        if (idx < 0)
            return reply.status(404).send({ error: { message: "Custódia não encontrada." } });
        const cust = db.custodias[idx];
        const ev = {
            id: `EV-${Date.now()}`,
            tipo: body.tipo,
            descricao: body.descricao,
            dataHora: new Date().toISOString(),
            responsavel: req.authUser?.nome ?? body.responsavel ?? "system",
            observacao: body.observacao,
            url: body.url,
            categoria: body.categoria,
            etapaRelacionada: body.etapaRelacionada,
            nomeArquivo: body.nomeArquivo,
            mimeType: body.mimeType,
            tamanhoArquivo: body.tamanhoArquivo,
        };
        cust.evidencias.push(ev);
        appendAudit("EVIDENCIA_CUSTODIA", "CUSTODIA", id, `${body.tipo}: ${body.descricao}`, req.authUser?.nome ?? "system");
        return cust;
    });
    app.put("/api/operacional/custodia/:id/status", async (req, reply) => {
        try {
            const { id } = z.object({ id: z.string() }).parse(req.params);
            const { status, recebedorNome, statusAceite, divergencia } = req.body ?? {};
            const cust = await ensureWritableCustodia(id, req.query ?? {});
            const idxMirror = db.custodias.findIndex((item) => String(item?.id ?? "") === String(cust.id));
            if (status) {
                cust.status = status;
            }
            if (recebedorNome) {
                cust.recebedorNome = recebedorNome;
            }
            if (statusAceite) {
                cust.statusAceite = statusAceite;
            }
            if (divergencia) {
                cust.divergencia = divergencia;
            }
            if (cust.status === "ENTREGUE" || cust.status === "ENTREGUE_COM_RESSALVA") {
                cust.dataEntrega = new Date().toISOString();
                cust.scoreRisco = 0;
            }
            cust.atualizadoEm = new Date().toISOString();
            if (idxMirror >= 0) {
                db.custodias[idxMirror] = cust;
            }
            appendAudit("STATUS_CUSTODIA", "CUSTODIA", id, `Status -> ${cust.status}`, req.authUser?.nome ?? "system");
            return mergeWithLocalCustodia(cust);
        }
        catch (error) {
            app.log.warn({ error, component: "torreAgendaCustodiaRoutes", action: "putCustodiaStatusFallback" }, "Falha ao atualizar status de custodia com base real. Usando fallback local.");
        }
        const { id } = z.object({ id: z.string() }).parse(req.params);
        const { status, recebedorNome, statusAceite, divergencia } = req.body;
        const idx = db.custodias.findIndex((c) => c.id === id);
        if (idx < 0)
            return reply.status(404).send({ error: { message: "Custódia não encontrada." } });
        const cust = db.custodias[idx];
        cust.status = status;
        if (recebedorNome)
            cust.recebedorNome = recebedorNome;
        if (statusAceite)
            cust.statusAceite = statusAceite;
        if (divergencia)
            cust.divergencia = divergencia;
        if (status === "ENTREGUE" || status === "ENTREGUE_COM_RESSALVA") {
            cust.dataEntrega = new Date().toISOString();
            cust.scoreRisco = 0;
        }
        appendAudit("STATUS_CUSTODIA", "CUSTODIA", id, `Status → ${status}`, req.authUser?.nome ?? "system");
        return cust;
    });
}
