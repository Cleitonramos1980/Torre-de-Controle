import { randomUUID } from "node:crypto";
import { db } from "../repositories/dataStore.js";
import { persistCollection } from "../repositories/persistentCollectionStore.js";
import { executeOracle, isOracleEnabled } from "../db/oracle.js";

function ensureCol() {
    if (!db.portariaChecklist) db.portariaChecklist = [];
}

function currentUser(req) { return req?.authUser?.nome ?? "system"; }

function nextNum() {
    ensureCol();
    const year = new Date().getFullYear();
    let max = 0;
    for (const item of db.portariaChecklist) {
        const m = (item.numeroChecklist || "").match(new RegExp(`^CKL-${year}-(\\d{4})$`));
        if (m) { const n = Number(m[1]); if (n > max) max = n; }
    }
    return `CKL-${year}-${String(max + 1).padStart(4, "0")}`;
}

export async function checklistPortariaRoutes(app) {

    // GET /api/portaria/checklists — listagem com filtros
    app.get("/api/portaria/checklists", async (req, reply) => {
        ensureCol();
        let list = [...db.portariaChecklist];
        const q = req.query;
        if (q.placa?.trim())      list = list.filter(c => c.placa?.toLowerCase().includes(q.placa.trim().toLowerCase()));
        if (q.motorista?.trim())  list = list.filter(c => c.motorista?.toLowerCase().includes(q.motorista.trim().toLowerCase()));
        if (q.proprietario?.trim()) list = list.filter(c => c.proprietario?.toLowerCase().includes(q.proprietario.trim().toLowerCase()));
        if (q.seguradora?.trim()) list = list.filter(c => c.seguradora?.toLowerCase().includes(q.seguradora.trim().toLowerCase()));
        if (q.status)             list = list.filter(c => c.status === q.status);
        if (q.dtInicio)           list = list.filter(c => (c.dataSolicitacao || "") >= q.dtInicio);
        if (q.dtFim)              list = list.filter(c => (c.dataSolicitacao || "") <= q.dtFim);
        list.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
        return { data: list, total: list.length };
    });

    // GET /api/portaria/checklists/:id
    app.get("/api/portaria/checklists/:id", async (req, reply) => {
        ensureCol();
        const item = db.portariaChecklist.find(c => c.id === req.params.id);
        if (!item) return reply.code(404).send({ error: { message: "Checklist não encontrado." } });
        return item;
    });

    // POST /api/portaria/checklists — criar
    app.post("/api/portaria/checklists", async (req, reply) => {
        ensureCol();
        const body = req.body || {};
        const now  = new Date().toISOString();
        const item = {
            id: randomUUID(),
            numeroChecklist: nextNum(),
            tipoMovimento:    body.tipoMovimento    || "",
            placa:            body.placa            || "",
            km:               body.km               || "",
            tipoAtendimento:  body.tipoAtendimento  || "",
            dataSolicitacao:  body.dataSolicitacao  || now.slice(0, 10),
            horaSolicitacao:  body.horaSolicitacao  || now.slice(11, 16),
            motorista:        body.motorista        || "",
            sinistro:         body.sinistro         || "",
            proprietario:     body.proprietario     || "",
            seguradora:       body.seguradora       || "",
            telefone:         body.telefone         || "",
            veiculo:          body.veiculo          || "",
            ano:              body.ano              || "",
            cor:              body.cor              || "",
            localAtendimento: body.localAtendimento || {},
            localDestino:     body.localDestino     || {},
            fotografado:      body.fotografado      ?? null,
            nivelCombustivel: body.nivelCombustivel || "",
            pneus:            body.pneus            || {},
            avarias:          body.avarias          || [],
            acessorios:       body.acessorios       || {},
            termos:           body.termos           || {},
            assinaturas:      body.assinaturas      || {},
            status:           "RASCUNHO",
            createdAt:        now,
            updatedAt:        now,
            createdBy:        currentUser(req),
            updatedBy:        currentUser(req),
        };
        db.portariaChecklist.push(item);
        await persistCollection("portariaChecklist");
        return reply.code(201).send(item);
    });

    // PUT /api/portaria/checklists/:id — atualizar
    app.put("/api/portaria/checklists/:id", async (req, reply) => {
        ensureCol();
        const idx = db.portariaChecklist.findIndex(c => c.id === req.params.id);
        if (idx < 0) return reply.code(404).send({ error: { message: "Checklist não encontrado." } });
        const existing = db.portariaChecklist[idx];
        if (existing.status === "CANCELADO")
            return reply.code(400).send({ error: { message: "Checklist cancelado não pode ser alterado." } });
        const body = req.body || {};
        const now  = new Date().toISOString();
        const editableFields = [
            "tipoMovimento","placa","km","tipoAtendimento","dataSolicitacao","horaSolicitacao",
            "motorista","sinistro","proprietario","seguradora","telefone",
            "veiculo","ano","cor","localAtendimento","localDestino",
            "fotografado","nivelCombustivel","pneus","avarias","acessorios",
            "termos","assinaturas","status",
        ];
        const updated = { ...existing };
        for (const f of editableFields) { if (body[f] !== undefined) updated[f] = body[f]; }
        updated.updatedAt = now;
        updated.updatedBy = currentUser(req);
        db.portariaChecklist[idx] = updated;
        await persistCollection("portariaChecklist");
        return updated;
    });

    // DELETE /api/portaria/checklists/:id — cancelar
    app.delete("/api/portaria/checklists/:id", async (req, reply) => {
        ensureCol();
        const idx = db.portariaChecklist.findIndex(c => c.id === req.params.id);
        if (idx < 0) return reply.code(404).send({ error: { message: "Checklist não encontrado." } });
        db.portariaChecklist[idx].status    = "CANCELADO";
        db.portariaChecklist[idx].updatedAt = new Date().toISOString();
        db.portariaChecklist[idx].updatedBy = currentUser(req);
        await persistCollection("portariaChecklist");
        return { ok: true };
    });

    // GET /api/portaria/carregamento/:numcar — itens do carregamento para conferência de saída
    app.get("/api/portaria/carregamento/:numcar", async (req, reply) => {
        if (!isOracleEnabled()) return reply.status(503).send({ error: "Oracle indisponível" });
        const numcar = parseInt(req.params.numcar);
        if (!numcar || numcar <= 0) return reply.status(400).send({ error: "Número de carregamento inválido" });
        try {
            const res = await executeOracle(
                `WITH ITENS AS (
                    SELECT M.NUMCAR, COUNT(DISTINCT M.CODPROD) AS TOTITENS
                    FROM PCMOV M WHERE M.NUMCAR = :numcar GROUP BY M.NUMCAR
                )
                SELECT
                    M.CODPROD, P.DV, P.DESCRICAO, P.EMBALAGEM, P.CODFAB, P.CODAUXILIAR,
                    C.NUMCAR, C.DESTINO,
                    P.CODEPTO, D.DESCRICAO AS DEPARTAMENTO,
                    V.DESCRICAO AS VEICULO, V.PLACA,
                    E.NOME AS MOTORISTA,
                    SUM(M.QT) AS QT,
                    MAX(I.TOTITENS) AS TOTITENS
                FROM PCCARREG C
                JOIN PCMOV M ON M.NUMCAR = C.NUMCAR
                JOIN PCPEDC PED ON PED.NUMPED = M.NUMPED AND PED.CODFILIAL = M.CODFILIAL AND PED.NUMTRANSVENDA = M.NUMTRANSVENDA
                JOIN PCPRODUT P ON P.CODPROD = M.CODPROD
                LEFT JOIN PCDEPTO D ON D.CODEPTO = P.CODEPTO
                LEFT JOIN PCVEICUL V ON V.CODVEICULO = C.CODVEICULO
                LEFT JOIN PCEMPR E ON E.MATRICULA = C.CODMOTORISTA
                LEFT JOIN ITENS I ON I.NUMCAR = C.NUMCAR
                WHERE C.NUMCAR = :numcar
                GROUP BY M.CODPROD, P.DV, P.DESCRICAO, P.EMBALAGEM, P.CODFAB, P.CODAUXILIAR,
                         C.NUMCAR, C.DESTINO, P.CODEPTO, D.DESCRICAO,
                         C.CODVEICULO, V.DESCRICAO, V.PLACA, C.CODMOTORISTA, E.NOME
                ORDER BY P.DESCRICAO`,
                { numcar },
                { outFormat: 4002 }
            );
            const rows = res?.rows ?? [];
            if (!rows.length) return reply.status(404).send({ error: `Carregamento ${numcar} não encontrado.` });
            const primeira = rows[0];
            return reply.send({
                numcar,
                destino:    primeira.DESTINO   || "",
                veiculo:    primeira.VEICULO    || "",
                placa:      primeira.PLACA      || "",
                motorista:  primeira.MOTORISTA  || "",
                totItens:   primeira.TOTITENS   ?? rows.length,
                itens: rows.map(r => ({
                    codprod:     r.CODPROD,
                    dv:          r.DV,
                    descricao:   r.DESCRICAO,
                    embalagem:   r.EMBALAGEM,
                    codfab:      r.CODFAB,
                    codAuxiliar: r.CODAUXILIAR,
                    codepto:     r.CODEPTO,
                    departamento:r.DEPARTAMENTO,
                    qt:          r.QT,
                })),
            });
        } catch (e) {
            return reply.status(500).send({ error: e.message });
        }
    });
}
