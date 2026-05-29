import { randomUUID } from "node:crypto";
import { z } from "zod";
import { queryRows, queryOne, execDml } from "../repositories/baseRepository.js";
import { appendAudit } from "../repositories/dataStore.js";

// ── helpers ──────────────────────────────────────────────────────────────────

function now() { return new Date().toISOString(); }

function nextOsNumero(seq) {
  const n = (seq || 1);
  return `OS-${String(n).padStart(6, "0")}`;
}

const PRIORIDADE_SLA = { P0: 4, P1: 24, P2: 72, P3: 168 }; // horas

function calcPrazo(prioridade) {
  const horas = PRIORIDADE_SLA[prioridade] || 72;
  const d = new Date();
  d.setHours(d.getHours() + horas);
  return d.toISOString();
}

function rejectIfNotEngenharia(req, reply) {
  const perfil = req.authUser?.perfil;
  if (!["ADMIN", "ENGENHARIA"].includes(perfil)) {
    reply.code(403).send({ error: "Acesso restrito ao módulo de Engenharia" });
    return true;
  }
  return false;
}

// ── route registration ────────────────────────────────────────────────────────

export async function engenhariaRoutes(app) {

  // ────────────────────────────────────────────────────────
  // SOLICITAÇÕES
  // ────────────────────────────────────────────────────────

  app.get("/api/engenharia/solicitacoes", async (req, reply) => {
    const { status, codfilial, prioridade, tipo, limit: lim } = req.query || {};
    let sql = `SELECT s.ID, s.TITULO, s.DESCRICAO, s.CODFILIAL, s.NOME_FILIAL,
                s.TIPO, s.PRIORIDADE, s.STATUS, s.CATEGORIA, s.LOCAL_ESPECIFICO,
                s.SOLICITANTE_NOME, s.SOLICITANTE_EMAIL, s.SOLICITANTE_FONE,
                s.ATIVO_ID, s.ATIVO_NOME, s.OS_ID,
                s.PRAZO_ATENDIMENTO, s.DATA_ATENDIMENTO,
                s.CRIADO_EM, s.ATUALIZADO_EM
               FROM ENG_SOLICITACAO s WHERE 1=1`;
    const binds = {};
    if (status) { sql += " AND s.STATUS = :status"; binds.status = status; }
    if (codfilial) { sql += " AND s.CODFILIAL = :codfilial"; binds.codfilial = String(codfilial); }
    if (prioridade) { sql += " AND s.PRIORIDADE = :prioridade"; binds.prioridade = prioridade; }
    if (tipo) { sql += " AND s.TIPO = :tipo"; binds.tipo = tipo; }
    sql += " ORDER BY s.CRIADO_EM DESC";
    if (lim) sql += ` FETCH FIRST ${Math.min(Number(lim) || 100, 500)} ROWS ONLY`;
    return queryRows(sql, binds);
  });

  app.get("/api/engenharia/solicitacoes/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const row = await queryOne(
      `SELECT s.ID, s.TITULO, s.DESCRICAO, s.CODFILIAL, s.NOME_FILIAL,
              s.TIPO, s.PRIORIDADE, s.STATUS, s.CATEGORIA, s.LOCAL_ESPECIFICO,
              s.SOLICITANTE_MATRICULA, s.SOLICITANTE_NOME, s.SOLICITANTE_EMAIL, s.SOLICITANTE_FONE,
              s.ATIVO_ID, s.ATIVO_NOME, s.TRIAGEM_ID, s.OS_ID,
              s.PRAZO_ATENDIMENTO, s.DATA_ATENDIMENTO, s.OBS_TRIAGEM,
              s.CRIADO_EM, s.ATUALIZADO_EM
       FROM ENG_SOLICITACAO s WHERE s.ID = :id`, { id }
    );
    if (!row) return reply.code(404).send({ error: "Solicitação não encontrada" });
    return row;
  });

  app.post("/api/engenharia/solicitacoes", async (req, reply) => {
    const body = z.object({
      titulo: z.string().min(3),
      descricao: z.string().optional(),
      codfilial: z.string(),
      nome_filial: z.string().optional(),
      tipo: z.enum(["CORRETIVA", "PREVENTIVA", "MELHORIA", "EMERGENCIA"]).default("CORRETIVA"),
      prioridade: z.enum(["P0", "P1", "P2", "P3"]).default("P2"),
      categoria: z.string().optional(),
      local_especifico: z.string().optional(),
      solicitante_matricula: z.string().optional(),
      solicitante_nome: z.string().optional(),
      solicitante_email: z.string().optional(),
      solicitante_fone: z.string().optional(),
      ativo_id: z.string().optional(),
      ativo_nome: z.string().optional(),
    }).parse(req.body);

    const id = randomUUID();
    const prazo = calcPrazo(body.prioridade);

    await execDml(
      `INSERT INTO ENG_SOLICITACAO (ID, TITULO, DESCRICAO, CODFILIAL, NOME_FILIAL,
        TIPO, PRIORIDADE, STATUS, CATEGORIA, LOCAL_ESPECIFICO,
        SOLICITANTE_MATRICULA, SOLICITANTE_NOME, SOLICITANTE_EMAIL, SOLICITANTE_FONE,
        ATIVO_ID, ATIVO_NOME, PRAZO_ATENDIMENTO, CRIADO_EM, ATUALIZADO_EM)
       VALUES (:id, :titulo, :descricao, :codfilial, :nome_filial,
        :tipo, :prioridade, 'ABERTA', :categoria, :local_especifico,
        :sol_mat, :sol_nome, :sol_email, :sol_fone,
        :ativo_id, :ativo_nome, TO_TIMESTAMP(:prazo, 'YYYY-MM-DD"T"HH24:MI:SS"."FF3'),
        SYSTIMESTAMP, SYSTIMESTAMP)`,
      {
        id, titulo: body.titulo, descricao: body.descricao || null,
        codfilial: body.codfilial, nome_filial: body.nome_filial || null,
        tipo: body.tipo, prioridade: body.prioridade,
        categoria: body.categoria || null, local_especifico: body.local_especifico || null,
        sol_mat: body.solicitante_matricula || null, sol_nome: body.solicitante_nome || null,
        sol_email: body.solicitante_email || null, sol_fone: body.solicitante_fone || null,
        ativo_id: body.ativo_id || null, ativo_nome: body.ativo_nome || null,
        prazo: prazo.replace("Z", "").replace("T", "T"),
      }
    );

    appendAudit("CRIAR_SOLICITACAO", "ENG_SOLICITACAO", id, body, req.authUser?.email || "sistema");
    reply.code(201).send({ id, status: "ABERTA", prazo_atendimento: prazo });
  });

  app.patch("/api/engenharia/solicitacoes/:id/status", async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { status, obs } = z.object({
      status: z.enum(["ABERTA", "EM_TRIAGEM", "AGUARDANDO_OS", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"]),
      obs: z.string().optional(),
    }).parse(req.body);

    await execDml(
      `UPDATE ENG_SOLICITACAO SET STATUS = :status, OBS_TRIAGEM = NVL(:obs, OBS_TRIAGEM), ATUALIZADO_EM = SYSTIMESTAMP WHERE ID = :id`,
      { status, obs: obs || null, id }
    );
    appendAudit("ATUALIZAR_STATUS_SOLICITACAO", "ENG_SOLICITACAO", id, { status }, req.authUser?.email || "sistema");
    return { id, status };
  });

  // ────────────────────────────────────────────────────────
  // TRIAGEM
  // ────────────────────────────────────────────────────────

  app.get("/api/engenharia/triagem", async (req, reply) => {
    const { status } = req.query || {};
    let sql = `SELECT t.ID, t.SOLICITACAO_ID, t.STATUS, t.TIPO_SERVICO,
               t.CLASSIFICACAO, t.PRIORIDADE_AJUSTADA, t.REQUER_VISITA,
               t.REQUER_MATERIAL, t.REQUER_TERCEIRO,
               t.ESTIMATIVA_HORAS, t.ESTIMATIVA_CUSTO,
               t.OBS_TECNICO, t.TECNICO_NOME, t.DATA_TRIAGEM,
               t.CRIADO_EM
               FROM ENG_TRIAGEM t WHERE 1=1`;
    const binds = {};
    if (status) { sql += " AND t.STATUS = :status"; binds.status = status; }
    sql += " ORDER BY t.CRIADO_EM DESC FETCH FIRST 200 ROWS ONLY";
    return queryRows(sql, binds);
  });

  app.post("/api/engenharia/triagem", async (req, reply) => {
    if (rejectIfNotEngenharia(req, reply)) return;
    const body = z.object({
      solicitacao_id: z.string(),
      tipo_servico: z.string().optional(),
      classificacao: z.string().optional(),
      prioridade_ajustada: z.enum(["P0", "P1", "P2", "P3"]).optional(),
      requer_visita: z.boolean().default(false),
      requer_material: z.boolean().default(false),
      requer_terceiro: z.boolean().default(false),
      estimativa_horas: z.number().optional(),
      estimativa_custo: z.number().optional(),
      obs_tecnico: z.string().optional(),
      criar_os: z.boolean().default(false),
    }).parse(req.body);

    const id = randomUUID();
    await execDml(
      `INSERT INTO ENG_TRIAGEM (ID, SOLICITACAO_ID, STATUS, TIPO_SERVICO,
        CLASSIFICACAO, PRIORIDADE_AJUSTADA, REQUER_VISITA, REQUER_MATERIAL,
        REQUER_TERCEIRO, ESTIMATIVA_HORAS, ESTIMATIVA_CUSTO, OBS_TECNICO,
        TECNICO_MATRICULA, TECNICO_NOME, DATA_TRIAGEM, CRIADO_EM, ATUALIZADO_EM)
       VALUES (:id, :sol_id, 'CONCLUIDA', :tipo_servico,
        :classificacao, :prioridade_aj, :requer_visita, :requer_material,
        :requer_terceiro, :est_horas, :est_custo, :obs_tecnico,
        :tec_mat, :tec_nome, SYSTIMESTAMP, SYSTIMESTAMP, SYSTIMESTAMP)`,
      {
        id, sol_id: body.solicitacao_id,
        tipo_servico: body.tipo_servico || null, classificacao: body.classificacao || null,
        prioridade_aj: body.prioridade_ajustada || null,
        requer_visita: body.requer_visita ? 1 : 0,
        requer_material: body.requer_material ? 1 : 0,
        requer_terceiro: body.requer_terceiro ? 1 : 0,
        est_horas: body.estimativa_horas || null, est_custo: body.estimativa_custo || null,
        obs_tecnico: body.obs_tecnico || null,
        tec_mat: req.authUser?.sub || null,
        tec_nome: req.authUser?.nome || null,
      }
    );

    await execDml(
      `UPDATE ENG_SOLICITACAO SET STATUS = 'EM_TRIAGEM', TRIAGEM_ID = :triagem_id,
       PRIORIDADE = NVL(:prioridade, PRIORIDADE), ATUALIZADO_EM = SYSTIMESTAMP WHERE ID = :sol_id`,
      { triagem_id: id, prioridade: body.prioridade_ajustada || null, sol_id: body.solicitacao_id }
    );

    appendAudit("TRIAGEM", "ENG_TRIAGEM", id, body, req.authUser?.email || "sistema");
    reply.code(201).send({ id, solicitacao_id: body.solicitacao_id });
  });

  // ────────────────────────────────────────────────────────
  // ORDENS DE SERVIÇO
  // ────────────────────────────────────────────────────────

  app.get("/api/engenharia/os", async (req, reply) => {
    const { status, codfilial, prioridade, tipo, tecnico, limit: lim } = req.query || {};
    let sql = `SELECT o.ID, o.NUMERO, o.SOLICITACAO_ID, o.TITULO, o.TIPO,
               o.PRIORIDADE, o.STATUS, o.CODFILIAL, o.NOME_FILIAL,
               o.ATIVO_ID, o.ATIVO_NOME, o.TECNICO_RESPONSAVEL, o.EQUIPE,
               o.DATA_PLANEJADA, o.DATA_INICIO, o.DATA_FIM,
               o.HORAS_ESTIMADAS, o.HORAS_REALIZADAS,
               o.CUSTO_ESTIMADO, o.CUSTO_REALIZADO,
               o.PERCENTUAL_CONCLUIDO, o.ACEITE_LOJA,
               o.CRIADO_EM, o.ATUALIZADO_EM
               FROM ENG_ORDEM_SERVICO o WHERE 1=1`;
    const binds = {};
    if (status) { sql += " AND o.STATUS = :status"; binds.status = status; }
    if (codfilial) { sql += " AND o.CODFILIAL = :codfilial"; binds.codfilial = String(codfilial); }
    if (prioridade) { sql += " AND o.PRIORIDADE = :prioridade"; binds.prioridade = prioridade; }
    if (tipo) { sql += " AND o.TIPO = :tipo"; binds.tipo = tipo; }
    if (tecnico) { sql += " AND UPPER(o.TECNICO_RESPONSAVEL) LIKE UPPER(:tecnico)"; binds.tecnico = `%${tecnico}%`; }
    sql += " ORDER BY o.CRIADO_EM DESC";
    if (lim) sql += ` FETCH FIRST ${Math.min(Number(lim) || 100, 500)} ROWS ONLY`;
    else sql += " FETCH FIRST 200 ROWS ONLY";
    return queryRows(sql, binds);
  });

  app.get("/api/engenharia/os/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const os = await queryOne(
      `SELECT o.ID, o.NUMERO, o.SOLICITACAO_ID, o.TRIAGEM_ID,
              o.TITULO, o.DESCRICAO, o.TIPO, o.PRIORIDADE, o.STATUS,
              o.CODFILIAL, o.NOME_FILIAL, o.ATIVO_ID, o.ATIVO_NOME,
              o.TECNICO_RESPONSAVEL, o.TECNICO_MATRICULA, o.EQUIPE, o.PRESTADOR,
              o.DATA_PLANEJADA, o.DATA_INICIO, o.DATA_FIM,
              o.HORAS_ESTIMADAS, o.HORAS_REALIZADAS,
              o.CUSTO_ESTIMADO, o.CUSTO_REALIZADO,
              o.PERCENTUAL_CONCLUIDO, o.CAUSA_RAIZ, o.SOLUCAO_APLICADA,
              o.OBS_FECHAMENTO, o.RETRABALHO,
              o.ACEITE_LOJA, o.ACEITE_LOJA_EM, o.ACEITE_LOJA_POR,
              o.CRIADO_EM, o.ATUALIZADO_EM
       FROM ENG_ORDEM_SERVICO o WHERE o.ID = :id`, { id }
    );
    if (!os) return reply.code(404).send({ error: "OS não encontrada" });

    const atividades = await queryRows(
      `SELECT a.ID, a.DESCRICAO, a.STATUS, a.RESPONSAVEL, a.ORDEM,
              a.HORAS_ESTIMADAS, a.HORAS_REALIZADAS, a.DATA_INICIO, a.DATA_FIM, a.OBS
       FROM ENG_OS_ATIVIDADE a WHERE a.OS_ID = :os_id ORDER BY a.ORDEM`,
      { os_id: id }
    );
    const materiais = await queryRows(
      `SELECT m.ID, m.CODPROD, m.DESCRICAO, m.UNIDADE, m.QTD_SOLICITADA,
              m.QTD_RETIRADA, m.QTD_DEVOLVIDA, m.PRECO_UNITARIO, m.ORIGEM, m.STATUS, m.OBS
       FROM ENG_OS_MATERIAL m WHERE m.OS_ID = :os_id ORDER BY m.CRIADO_EM`,
      { os_id: id }
    );
    const evidencias = await queryRows(
      `SELECT e.ID, e.TIPO, e.FASE, e.ARQUIVO, e.DESCRICAO, e.CRIADO_POR, e.CRIADO_EM
       FROM ENG_EVIDENCIA e WHERE e.OS_ID = :os_id ORDER BY e.CRIADO_EM`,
      { os_id: id }
    );
    return { ...os, atividades, materiais, evidencias };
  });

  app.post("/api/engenharia/os", async (req, reply) => {
    if (rejectIfNotEngenharia(req, reply)) return;
    const body = z.object({
      titulo: z.string().min(3),
      descricao: z.string().optional(),
      tipo: z.enum(["CORRETIVA", "PREVENTIVA", "MELHORIA", "EMERGENCIA"]).default("CORRETIVA"),
      prioridade: z.enum(["P0", "P1", "P2", "P3"]).default("P2"),
      codfilial: z.string(),
      nome_filial: z.string().optional(),
      solicitacao_id: z.string().optional(),
      triagem_id: z.string().optional(),
      ativo_id: z.string().optional(),
      ativo_nome: z.string().optional(),
      tecnico_responsavel: z.string().optional(),
      tecnico_matricula: z.string().optional(),
      equipe: z.string().optional(),
      prestador: z.string().optional(),
      data_planejada: z.string().optional(),
      horas_estimadas: z.number().optional(),
      custo_estimado: z.number().optional(),
    }).parse(req.body);

    const id = randomUUID();

    // get next sequence number
    const seqRow = await queryOne(
      `SELECT NVL(MAX(TO_NUMBER(REGEXP_SUBSTR(NUMERO, '[0-9]+'))), 0) + 1 AS NEXT_NUM FROM ENG_ORDEM_SERVICO`,
      {}
    ).catch(() => ({ NEXT_NUM: 1 }));
    const numero = nextOsNumero(seqRow?.NEXT_NUM || 1);

    await execDml(
      `INSERT INTO ENG_ORDEM_SERVICO (ID, NUMERO, SOLICITACAO_ID, TRIAGEM_ID,
        TITULO, DESCRICAO, TIPO, PRIORIDADE, STATUS,
        CODFILIAL, NOME_FILIAL, ATIVO_ID, ATIVO_NOME,
        TECNICO_RESPONSAVEL, TECNICO_MATRICULA, EQUIPE, PRESTADOR,
        DATA_PLANEJADA, HORAS_ESTIMADAS, CUSTO_ESTIMADO,
        PERCENTUAL_CONCLUIDO, CRIADO_EM, ATUALIZADO_EM)
       VALUES (:id, :numero, :sol_id, :tri_id,
        :titulo, :descricao, :tipo, :prioridade, 'PLANEJADA',
        :codfilial, :nome_filial, :ativo_id, :ativo_nome,
        :tec_resp, :tec_mat, :equipe, :prestador,
        :data_plan, :horas_est, :custo_est,
        0, SYSTIMESTAMP, SYSTIMESTAMP)`,
      {
        id, numero, sol_id: body.solicitacao_id || null, tri_id: body.triagem_id || null,
        titulo: body.titulo, descricao: body.descricao || null,
        tipo: body.tipo, prioridade: body.prioridade,
        codfilial: body.codfilial, nome_filial: body.nome_filial || null,
        ativo_id: body.ativo_id || null, ativo_nome: body.ativo_nome || null,
        tec_resp: body.tecnico_responsavel || null, tec_mat: body.tecnico_matricula || null,
        equipe: body.equipe || null, prestador: body.prestador || null,
        data_plan: body.data_planejada || null,
        horas_est: body.horas_estimadas || null, custo_est: body.custo_estimado || null,
      }
    );

    if (body.solicitacao_id) {
      await execDml(
        `UPDATE ENG_SOLICITACAO SET STATUS = 'AGUARDANDO_OS', OS_ID = :os_id, ATUALIZADO_EM = SYSTIMESTAMP WHERE ID = :sol_id`,
        { os_id: id, sol_id: body.solicitacao_id }
      ).catch(() => {});
    }

    appendAudit("CRIAR_OS", "ENG_ORDEM_SERVICO", id, { numero, ...body }, req.authUser?.email || "sistema");
    reply.code(201).send({ id, numero });
  });

  app.patch("/api/engenharia/os/:id", async (req, reply) => {
    if (rejectIfNotEngenharia(req, reply)) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({
      status: z.enum(["PLANEJADA", "AGENDADA", "EM_ANDAMENTO", "PAUSADA", "CONCLUIDA", "CANCELADA", "RETRABALHO"]).optional(),
      tecnico_responsavel: z.string().optional(),
      tecnico_matricula: z.string().optional(),
      equipe: z.string().optional(),
      prestador: z.string().optional(),
      data_planejada: z.string().optional(),
      data_inicio: z.string().optional(),
      data_fim: z.string().optional(),
      horas_realizadas: z.number().optional(),
      custo_realizado: z.number().optional(),
      percentual_concluido: z.number().min(0).max(100).optional(),
      causa_raiz: z.string().optional(),
      solucao_aplicada: z.string().optional(),
      obs_fechamento: z.string().optional(),
    }).parse(req.body);

    const sets = ["ATUALIZADO_EM = SYSTIMESTAMP"];
    const binds = { id };
    if (body.status !== undefined) { sets.push("STATUS = :status"); binds.status = body.status; }
    if (body.tecnico_responsavel !== undefined) { sets.push("TECNICO_RESPONSAVEL = :tec_resp"); binds.tec_resp = body.tecnico_responsavel; }
    if (body.tecnico_matricula !== undefined) { sets.push("TECNICO_MATRICULA = :tec_mat"); binds.tec_mat = body.tecnico_matricula; }
    if (body.equipe !== undefined) { sets.push("EQUIPE = :equipe"); binds.equipe = body.equipe; }
    if (body.prestador !== undefined) { sets.push("PRESTADOR = :prestador"); binds.prestador = body.prestador; }
    if (body.data_planejada !== undefined) { sets.push("DATA_PLANEJADA = :data_plan"); binds.data_plan = body.data_planejada; }
    if (body.data_inicio !== undefined) { sets.push("DATA_INICIO = :data_ini"); binds.data_ini = body.data_inicio; }
    if (body.data_fim !== undefined) { sets.push("DATA_FIM = :data_fim"); binds.data_fim = body.data_fim; }
    if (body.horas_realizadas !== undefined) { sets.push("HORAS_REALIZADAS = :horas_real"); binds.horas_real = body.horas_realizadas; }
    if (body.custo_realizado !== undefined) { sets.push("CUSTO_REALIZADO = :custo_real"); binds.custo_real = body.custo_realizado; }
    if (body.percentual_concluido !== undefined) { sets.push("PERCENTUAL_CONCLUIDO = :pct"); binds.pct = body.percentual_concluido; }
    if (body.causa_raiz !== undefined) { sets.push("CAUSA_RAIZ = :causa"); binds.causa = body.causa_raiz; }
    if (body.solucao_aplicada !== undefined) { sets.push("SOLUCAO_APLICADA = :solucao"); binds.solucao = body.solucao_aplicada; }
    if (body.obs_fechamento !== undefined) { sets.push("OBS_FECHAMENTO = :obs_fec"); binds.obs_fec = body.obs_fechamento; }

    // Busca valores atuais dos campos que serão alterados para gravar histórico
    const CAMPOS_HISTORICO = ["STATUS", "TECNICO_RESPONSAVEL", "PERCENTUAL_CONCLUIDO", "CAUSA_RAIZ", "SOLUCAO_APLICADA", "EQUIPE", "PRESTADOR"];
    const bodyToColMap = { status: "STATUS", tecnico_responsavel: "TECNICO_RESPONSAVEL", percentual_concluido: "PERCENTUAL_CONCLUIDO", causa_raiz: "CAUSA_RAIZ", solucao_aplicada: "SOLUCAO_APLICADA", equipe: "EQUIPE", prestador: "PRESTADOR" };
    const camposAlterados = Object.keys(body).filter(k => bodyToColMap[k] && body[k] !== undefined);
    let osAtual = null;
    if (camposAlterados.length > 0) {
      const cols = camposAlterados.map(k => bodyToColMap[k]).join(", ");
      osAtual = await queryOne(`SELECT ${cols} FROM ENG_ORDEM_SERVICO WHERE ID = :id`, { id }).catch(() => null);
    }

    await execDml(`UPDATE ENG_ORDEM_SERVICO SET ${sets.join(", ")} WHERE ID = :id`, binds);

    // Grava histórico para cada campo alterado
    if (osAtual) {
      const usuario = req.authUser?.nome || req.authUser?.email || "sistema";
      const matricula = req.authUser?.sub || null;
      for (const k of camposAlterados) {
        const col = bodyToColMap[k];
        const anterior = osAtual[col] != null ? String(osAtual[col]) : null;
        const novo = body[k] != null ? String(body[k]) : null;
        if (anterior === novo) continue;
        await execDml(
          `INSERT INTO ENG_OS_HISTORICO (ID, OS_ID, CAMPO, VALOR_ANTERIOR, VALOR_NOVO, USUARIO, USUARIO_MATRICULA, CRIADO_EM)
           VALUES (:hid, :os_id, :campo, :ant, :novo, :usr, :mat, SYSTIMESTAMP)`,
          { hid: randomUUID(), os_id: id, campo: col, ant: anterior, novo, usr: usuario, mat: matricula }
        ).catch(() => {}); // não bloqueia a atualização se o histórico falhar
      }
    }

    appendAudit("ATUALIZAR_OS", "ENG_ORDEM_SERVICO", id, body, req.authUser?.email || "sistema");
    return { id, ...body };
  });

  // OS Atividades
  app.get("/api/engenharia/os/:id/atividades", async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    return queryRows(
      `SELECT a.ID, a.DESCRICAO, a.STATUS, a.RESPONSAVEL, a.ORDEM,
              a.HORAS_ESTIMADAS, a.HORAS_REALIZADAS, a.OBS
       FROM ENG_OS_ATIVIDADE a WHERE a.OS_ID = :os_id ORDER BY a.ORDEM`,
      { os_id: id }
    );
  });

  app.post("/api/engenharia/os/:id/atividades", async (req, reply) => {
    const { id: os_id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({
      descricao: z.string().min(2),
      responsavel: z.string().optional(),
      ordem: z.number().int().optional(),
      horas_estimadas: z.number().optional(),
      obs: z.string().optional(),
    }).parse(req.body);

    const aid = randomUUID();
    const maxOrdem = await queryOne(
      `SELECT NVL(MAX(ORDEM), 0) + 1 AS NEXT_ORDEM FROM ENG_OS_ATIVIDADE WHERE OS_ID = :os_id`,
      { os_id }
    ).catch(() => ({ NEXT_ORDEM: 1 }));

    await execDml(
      `INSERT INTO ENG_OS_ATIVIDADE (ID, OS_ID, DESCRICAO, STATUS, RESPONSAVEL, ORDEM, HORAS_ESTIMADAS, OBS, CRIADO_EM)
       VALUES (:id, :os_id, :desc, 'PENDENTE', :resp, :ordem, :horas, :obs, SYSTIMESTAMP)`,
      { id: aid, os_id, desc: body.descricao, resp: body.responsavel || null, ordem: body.ordem || maxOrdem?.NEXT_ORDEM || 1, horas: body.horas_estimadas || null, obs: body.obs || null }
    );
    reply.code(201).send({ id: aid, os_id });
  });

  app.patch("/api/engenharia/os/:id/atividades/:aid", async (req, reply) => {
    const { id: os_id, aid } = z.object({ id: z.string(), aid: z.string() }).parse(req.params);
    const body = z.object({
      status: z.enum(["PENDENTE", "EM_ANDAMENTO", "CONCLUIDA"]).optional(),
      horas_realizadas: z.number().optional(),
      obs: z.string().optional(),
    }).parse(req.body);
    const sets = [];
    const binds = { aid };
    if (body.status) { sets.push("STATUS = :status"); binds.status = body.status; }
    if (body.horas_realizadas !== undefined) { sets.push("HORAS_REALIZADAS = :horas"); binds.horas = body.horas_realizadas; }
    if (body.obs !== undefined) { sets.push("OBS = :obs"); binds.obs = body.obs; }
    if (sets.length === 0) return { id: aid };
    await execDml(`UPDATE ENG_OS_ATIVIDADE SET ${sets.join(", ")} WHERE ID = :aid`, binds);
    return { id: aid, ...body };
  });

  // OS Materiais
  app.get("/api/engenharia/os/:id/materiais", async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    return queryRows(
      `SELECT m.ID, m.CODPROD, m.DESCRICAO, m.UNIDADE,
              m.QTD_SOLICITADA, m.QTD_RETIRADA, m.QTD_DEVOLVIDA,
              m.PRECO_UNITARIO, m.ORIGEM, m.STATUS
       FROM ENG_OS_MATERIAL m WHERE m.OS_ID = :os_id ORDER BY m.CRIADO_EM`,
      { os_id: id }
    );
  });

  app.post("/api/engenharia/os/:id/materiais", async (req, reply) => {
    const { id: os_id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({
      codprod: z.number().optional(),
      descricao: z.string().min(2),
      unidade: z.string().default("UN"),
      qtd_solicitada: z.number().positive().default(1),
      preco_unitario: z.number().optional(),
      origem: z.enum(["ESTOQUE_ENG", "WINTHOR", "COMPRA_DIRETA"]).default("ESTOQUE_ENG"),
      obs: z.string().optional(),
    }).parse(req.body);
    const mid = randomUUID();
    await execDml(
      `INSERT INTO ENG_OS_MATERIAL (ID, OS_ID, CODPROD, DESCRICAO, UNIDADE, QTD_SOLICITADA, PRECO_UNITARIO, ORIGEM, STATUS, OBS, CRIADO_EM)
       VALUES (:id, :os_id, :codprod, :descricao, :unidade, :qtd, :preco, :origem, 'SOLICITADO', :obs, SYSTIMESTAMP)`,
      { id: mid, os_id, codprod: body.codprod || null, descricao: body.descricao, unidade: body.unidade, qtd: body.qtd_solicitada, preco: body.preco_unitario || null, origem: body.origem, obs: body.obs || null }
    );
    reply.code(201).send({ id: mid, os_id });
  });

  // ────────────────────────────────────────────────────────
  // ATIVOS / EQUIPAMENTOS
  // ────────────────────────────────────────────────────────

  app.get("/api/engenharia/ativos", async (req, reply) => {
    const { codfilial, categoria, status, q } = req.query || {};
    let sql = `SELECT a.ID, a.CODIGO, a.NOME, a.CATEGORIA, a.SUBCATEGORIA,
               a.FABRICANTE, a.MODELO, a.NUM_SERIE,
               a.CODFILIAL, a.NOME_FILIAL, a.LOCAL,
               a.STATUS, a.DATA_AQUISICAO, a.VALOR_AQUISICAO,
               a.DATA_GARANTIA_FIM, a.VIDA_UTIL_ANOS,
               a.ULTIMA_MANUTENCAO, a.PROXIMA_MANUTENCAO, a.QR_CODE
               FROM ENG_ATIVO a WHERE a.ATIVO = 1`;
    const binds = {};
    if (codfilial) { sql += " AND a.CODFILIAL = :codfilial"; binds.codfilial = String(codfilial); }
    if (categoria) { sql += " AND a.CATEGORIA = :categoria"; binds.categoria = categoria; }
    if (status) { sql += " AND a.STATUS = :status"; binds.status = status; }
    if (q) { sql += " AND (UPPER(a.NOME) LIKE UPPER(:q) OR UPPER(a.CODIGO) LIKE UPPER(:q))"; binds.q = `%${q}%`; }
    sql += " ORDER BY a.NOME FETCH FIRST 200 ROWS ONLY";
    return queryRows(sql, binds);
  });

  app.get("/api/engenharia/ativos/:id", async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const row = await queryOne(
      `SELECT a.ID, a.CODIGO, a.NOME, a.CATEGORIA, a.SUBCATEGORIA,
              a.FABRICANTE, a.MODELO, a.NUM_SERIE,
              a.CODFILIAL, a.NOME_FILIAL, a.LOCAL,
              a.STATUS, a.DATA_AQUISICAO, a.VALOR_AQUISICAO,
              a.DATA_GARANTIA_FIM, a.VIDA_UTIL_ANOS,
              a.CICLOS_MANUTENCAO_DIAS, a.ULTIMA_MANUTENCAO, a.PROXIMA_MANUTENCAO,
              a.QR_CODE, a.OBS, a.CRIADO_EM
       FROM ENG_ATIVO a WHERE a.ID = :id`, { id }
    );
    if (!row) return reply.code(404).send({ error: "Ativo não encontrado" });
    return row;
  });

  app.post("/api/engenharia/ativos", async (req, reply) => {
    if (rejectIfNotEngenharia(req, reply)) return;
    const body = z.object({
      codigo: z.string().min(1),
      nome: z.string().min(2),
      categoria: z.string().optional(),
      subcategoria: z.string().optional(),
      fabricante: z.string().optional(),
      modelo: z.string().optional(),
      num_serie: z.string().optional(),
      codfilial: z.string().optional(),
      nome_filial: z.string().optional(),
      local: z.string().optional(),
      data_aquisicao: z.string().optional(),
      valor_aquisicao: z.number().optional(),
      data_garantia_fim: z.string().optional(),
      vida_util_anos: z.number().optional(),
      ciclos_manutencao_dias: z.number().int().optional(),
      obs: z.string().optional(),
    }).parse(req.body);

    const id = randomUUID();
    const qrCode = `ENG-ATIVO-${body.codigo}-${id.slice(0, 8).toUpperCase()}`;
    await execDml(
      `INSERT INTO ENG_ATIVO (ID, CODIGO, NOME, CATEGORIA, SUBCATEGORIA,
        FABRICANTE, MODELO, NUM_SERIE, CODFILIAL, NOME_FILIAL, LOCAL,
        STATUS, DATA_AQUISICAO, VALOR_AQUISICAO, DATA_GARANTIA_FIM,
        VIDA_UTIL_ANOS, CICLOS_MANUTENCAO_DIAS, QR_CODE, OBS, ATIVO, CRIADO_EM, ATUALIZADO_EM)
       VALUES (:id, :codigo, :nome, :categoria, :subcategoria,
        :fabricante, :modelo, :num_serie, :codfilial, :nome_filial, :local,
        'ATIVO', :data_aq, :valor_aq, :data_grt,
        :vida_util, :ciclos, :qr_code, :obs, 1, SYSTIMESTAMP, SYSTIMESTAMP)`,
      {
        id, codigo: body.codigo, nome: body.nome,
        categoria: body.categoria || null, subcategoria: body.subcategoria || null,
        fabricante: body.fabricante || null, modelo: body.modelo || null,
        num_serie: body.num_serie || null, codfilial: body.codfilial || null,
        nome_filial: body.nome_filial || null, local: body.local || null,
        data_aq: body.data_aquisicao || null, valor_aq: body.valor_aquisicao || null,
        data_grt: body.data_garantia_fim || null, vida_util: body.vida_util_anos || null,
        ciclos: body.ciclos_manutencao_dias || null, qr_code: qrCode, obs: body.obs || null,
      }
    );
    appendAudit("CRIAR_ATIVO", "ENG_ATIVO", id, body, req.authUser?.email || "sistema");
    reply.code(201).send({ id, codigo: body.codigo, qr_code: qrCode });
  });

  app.patch("/api/engenharia/ativos/:id", async (req, reply) => {
    if (rejectIfNotEngenharia(req, reply)) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({
      nome: z.string().optional(),
      status: z.enum(["ATIVO", "INATIVO", "MANUTENCAO", "DESCARTADO"]).optional(),
      local: z.string().optional(),
      proxima_manutencao: z.string().optional(),
      ultima_manutencao: z.string().optional(),
      obs: z.string().optional(),
    }).parse(req.body);
    const sets = ["ATUALIZADO_EM = SYSTIMESTAMP"];
    const binds = { id };
    if (body.nome) { sets.push("NOME = :nome"); binds.nome = body.nome; }
    if (body.status) { sets.push("STATUS = :status"); binds.status = body.status; }
    if (body.local !== undefined) { sets.push("LOCAL = :local"); binds.local = body.local; }
    if (body.proxima_manutencao) { sets.push("PROXIMA_MANUTENCAO = TO_DATE(:prox_man, 'YYYY-MM-DD')"); binds.prox_man = body.proxima_manutencao; }
    if (body.ultima_manutencao) { sets.push("ULTIMA_MANUTENCAO = TO_DATE(:ult_man, 'YYYY-MM-DD')"); binds.ult_man = body.ultima_manutencao; }
    if (body.obs !== undefined) { sets.push("OBS = :obs"); binds.obs = body.obs; }
    await execDml(`UPDATE ENG_ATIVO SET ${sets.join(", ")} WHERE ID = :id`, binds);
    return { id, ...body };
  });

  // ────────────────────────────────────────────────────────
  // ESTOQUE ENGENHARIA
  // ────────────────────────────────────────────────────────

  app.get("/api/engenharia/estoque", async (req, reply) => {
    const { q, categoria, alerta } = req.query || {};
    let sql = `SELECT i.ID, i.ESTOQUE_ID, i.CODPROD, i.DESCRICAO, i.UNIDADE,
               i.CATEGORIA, i.QTD_ATUAL, i.QTD_MINIMA, i.QTD_MAXIMA,
               i.PRECO_MEDIO, i.LOCALIZACAO
               FROM ENG_ESTOQUE_ITEM i WHERE i.ATIVO = 1`;
    const binds = {};
    if (q) { sql += " AND UPPER(i.DESCRICAO) LIKE UPPER(:q)"; binds.q = `%${q}%`; }
    if (categoria) { sql += " AND i.CATEGORIA = :categoria"; binds.categoria = categoria; }
    if (alerta === "true") { sql += " AND i.QTD_ATUAL <= i.QTD_MINIMA"; }
    sql += " ORDER BY i.DESCRICAO FETCH FIRST 300 ROWS ONLY";
    return queryRows(sql, binds);
  });

  app.post("/api/engenharia/estoque/item", async (req, reply) => {
    if (rejectIfNotEngenharia(req, reply)) return;
    const body = z.object({
      codprod: z.number().optional(),
      descricao: z.string().min(2),
      unidade: z.string().default("UN"),
      categoria: z.string().optional(),
      qtd_inicial: z.number().default(0),
      qtd_minima: z.number().default(0),
      qtd_maxima: z.number().optional(),
      preco_medio: z.number().optional(),
      localizacao: z.string().optional(),
    }).parse(req.body);

    // Ensure default estoque exists
    let estoqueRow = await queryOne(`SELECT ID FROM ENG_ESTOQUE WHERE ROWNUM = 1`, {}).catch(() => null);
    if (!estoqueRow) {
      const estoqueId = randomUUID();
      await execDml(
        `INSERT INTO ENG_ESTOQUE (ID, CODFILIAL, NOME, CRIADO_EM) VALUES (:id, 'CD', 'Almoxarifado Engenharia', SYSTIMESTAMP)`,
        { id: estoqueId }
      );
      estoqueRow = { ID: estoqueId };
    }

    const id = randomUUID();
    await execDml(
      `INSERT INTO ENG_ESTOQUE_ITEM (ID, ESTOQUE_ID, CODPROD, DESCRICAO, UNIDADE, CATEGORIA,
        QTD_ATUAL, QTD_MINIMA, QTD_MAXIMA, PRECO_MEDIO, LOCALIZACAO, ATIVO, CRIADO_EM, ATUALIZADO_EM)
       VALUES (:id, :est_id, :codprod, :descricao, :unidade, :categoria,
        :qtd_ini, :qtd_min, :qtd_max, :preco, :localizacao, 1, SYSTIMESTAMP, SYSTIMESTAMP)`,
      { id, est_id: estoqueRow.ID, codprod: body.codprod || null, descricao: body.descricao, unidade: body.unidade, categoria: body.categoria || null, qtd_ini: body.qtd_inicial, qtd_min: body.qtd_minima, qtd_max: body.qtd_maxima || null, preco: body.preco_medio || null, localizacao: body.localizacao || null }
    );

    if (body.qtd_inicial > 0) {
      await execDml(
        `INSERT INTO ENG_ESTOQUE_MOV (ID, ITEM_ID, TIPO, QTD, QTD_ANTES, QTD_DEPOIS, MOTIVO, RESPONSAVEL, CRIADO_EM)
         VALUES (:id, :item_id, 'ENTRADA', :qtd, 0, :qtd, 'Estoque inicial', :resp, SYSTIMESTAMP)`,
        { id: randomUUID(), item_id: id, qtd: body.qtd_inicial, resp: req.authUser?.nome || "sistema" }
      );
    }
    reply.code(201).send({ id });
  });

  app.post("/api/engenharia/estoque/movimentar", async (req, reply) => {
    if (rejectIfNotEngenharia(req, reply)) return;
    const body = z.object({
      item_id: z.string(),
      tipo: z.enum(["ENTRADA", "SAIDA", "AJUSTE", "DEVOLUCAO"]),
      qtd: z.number().positive(),
      os_id: z.string().optional(),
      motivo: z.string().optional(),
      preco_unitario: z.number().optional(),
    }).parse(req.body);

    const item = await queryOne(
      `SELECT ID, QTD_ATUAL FROM ENG_ESTOQUE_ITEM WHERE ID = :id`, { id: body.item_id }
    );
    if (!item) return reply.code(404).send({ error: "Item de estoque não encontrado" });

    const qtdAntes = Number(item.QTD_ATUAL || 0);
    const qtdDepois = body.tipo === "ENTRADA" || body.tipo === "DEVOLUCAO"
      ? qtdAntes + body.qtd
      : qtdAntes - body.qtd;

    if (qtdDepois < 0 && body.tipo === "SAIDA") {
      return reply.code(400).send({ error: `Estoque insuficiente. Disponível: ${qtdAntes}` });
    }

    await execDml(
      `UPDATE ENG_ESTOQUE_ITEM SET QTD_ATUAL = :qtd_depois, ATUALIZADO_EM = SYSTIMESTAMP WHERE ID = :id`,
      { qtd_depois: qtdDepois, id: body.item_id }
    );

    const movId = randomUUID();
    await execDml(
      `INSERT INTO ENG_ESTOQUE_MOV (ID, ITEM_ID, OS_ID, TIPO, QTD, QTD_ANTES, QTD_DEPOIS, PRECO_UNITARIO, MOTIVO, RESPONSAVEL, RESPONSAVEL_MATRICULA, CRIADO_EM)
       VALUES (:id, :item_id, :os_id, :tipo, :qtd, :qtd_antes, :qtd_depois, :preco, :motivo, :resp, :mat, SYSTIMESTAMP)`,
      { id: movId, item_id: body.item_id, os_id: body.os_id || null, tipo: body.tipo, qtd: body.qtd, qtd_antes: qtdAntes, qtd_depois: qtdDepois, preco: body.preco_unitario || null, motivo: body.motivo || null, resp: req.authUser?.nome || "sistema", mat: req.authUser?.sub || null }
    );
    return { movimentacao_id: movId, qtd_antes: qtdAntes, qtd_depois: qtdDepois };
  });

  app.get("/api/engenharia/estoque/movimentacoes", async (req, reply) => {
    const { item_id, os_id } = req.query || {};
    let sql = `SELECT m.ID, m.ITEM_ID, m.OS_ID, m.TIPO, m.QTD,
               m.QTD_ANTES, m.QTD_DEPOIS, m.PRECO_UNITARIO,
               m.MOTIVO, m.RESPONSAVEL, m.CRIADO_EM,
               i.DESCRICAO AS ITEM_DESCRICAO
               FROM ENG_ESTOQUE_MOV m
               JOIN ENG_ESTOQUE_ITEM i ON i.ID = m.ITEM_ID WHERE 1=1`;
    const binds = {};
    if (item_id) { sql += " AND m.ITEM_ID = :item_id"; binds.item_id = item_id; }
    if (os_id) { sql += " AND m.OS_ID = :os_id"; binds.os_id = os_id; }
    sql += " ORDER BY m.CRIADO_EM DESC FETCH FIRST 200 ROWS ONLY";
    return queryRows(sql, binds);
  });

  // ────────────────────────────────────────────────────────
  // MANUTENÇÃO PREVENTIVA
  // ────────────────────────────────────────────────────────

  app.get("/api/engenharia/preventiva", async (req, reply) => {
    const { ativo, codfilial } = req.query || {};
    let sql = `SELECT p.ID, p.NOME, p.ATIVO_ID, p.ATIVO_NOME, p.CODFILIAL,
               p.PERIODICIDADE_DIAS, p.DURACAO_HORAS, p.TECNICO_PADRAO,
               p.PROXIMA_EXECUCAO, p.ULTIMA_EXECUCAO, p.ATIVO
               FROM ENG_PREVENTIVA p WHERE p.ATIVO = 1`;
    const binds = {};
    if (ativo) { sql += " AND p.ATIVO_ID = :ativo"; binds.ativo = ativo; }
    if (codfilial) { sql += " AND p.CODFILIAL = :codfilial"; binds.codfilial = String(codfilial); }
    sql += " ORDER BY p.PROXIMA_EXECUCAO FETCH FIRST 200 ROWS ONLY";
    return queryRows(sql, binds);
  });

  app.post("/api/engenharia/preventiva", async (req, reply) => {
    if (rejectIfNotEngenharia(req, reply)) return;
    const body = z.object({
      nome: z.string().min(3),
      ativo_id: z.string().optional(),
      ativo_nome: z.string().optional(),
      codfilial: z.string().optional(),
      periodicidade_dias: z.number().int().positive(),
      duracao_horas: z.number().optional(),
      instrucoes: z.string().optional(),
      tecnico_padrao: z.string().optional(),
      proxima_execucao: z.string().optional(),
    }).parse(req.body);

    const id = randomUUID();
    await execDml(
      `INSERT INTO ENG_PREVENTIVA (ID, NOME, ATIVO_ID, ATIVO_NOME, CODFILIAL,
        PERIODICIDADE_DIAS, DURACAO_HORAS, INSTRUCOES, TECNICO_PADRAO,
        PROXIMA_EXECUCAO, ATIVO, CRIADO_EM, ATUALIZADO_EM)
       VALUES (:id, :nome, :ativo_id, :ativo_nome, :codfilial,
        :period, :duracao, :instrucoes, :tecnico,
        :prox_exec, 1, SYSTIMESTAMP, SYSTIMESTAMP)`,
      { id, nome: body.nome, ativo_id: body.ativo_id || null, ativo_nome: body.ativo_nome || null, codfilial: body.codfilial || null, period: body.periodicidade_dias, duracao: body.duracao_horas || null, instrucoes: body.instrucoes || null, tecnico: body.tecnico_padrao || null, prox_exec: body.proxima_execucao || null }
    );
    reply.code(201).send({ id });
  });

  // ────────────────────────────────────────────────────────
  // AGENDAMENTO
  // ────────────────────────────────────────────────────────

  app.get("/api/engenharia/agendamentos", async (req, reply) => {
    const { data_inicio, data_fim, tecnico } = req.query || {};
    let sql = `SELECT a.ID, a.OS_ID, a.TECNICO_NOME, a.DATA_INICIO, a.DATA_FIM,
               a.STATUS, a.TIPO, a.OBS,
               o.NUMERO AS OS_NUMERO, o.TITULO AS OS_TITULO, o.CODFILIAL
               FROM ENG_AGENDAMENTO a
               LEFT JOIN ENG_ORDEM_SERVICO o ON o.ID = a.OS_ID WHERE 1=1`;
    const binds = {};
    if (data_inicio) { sql += " AND a.DATA_INICIO >= TO_TIMESTAMP(:dt_ini, 'YYYY-MM-DD\"T\"HH24:MI:SS')"; binds.dt_ini = data_inicio; }
    if (data_fim) { sql += " AND a.DATA_FIM <= TO_TIMESTAMP(:dt_fim, 'YYYY-MM-DD\"T\"HH24:MI:SS')"; binds.dt_fim = data_fim; }
    if (tecnico) { sql += " AND UPPER(a.TECNICO_NOME) LIKE UPPER(:tecnico)"; binds.tecnico = `%${tecnico}%`; }
    sql += " ORDER BY a.DATA_INICIO FETCH FIRST 300 ROWS ONLY";
    return queryRows(sql, binds);
  });

  app.post("/api/engenharia/agendamentos", async (req, reply) => {
    if (rejectIfNotEngenharia(req, reply)) return;
    const body = z.object({
      os_id: z.string(),
      tecnico_matricula: z.string().optional(),
      tecnico_nome: z.string().optional(),
      data_inicio: z.string(),
      data_fim: z.string(),
      obs: z.string().optional(),
    }).parse(req.body);

    const id = randomUUID();
    const osRow = await queryOne(`SELECT TIPO FROM ENG_ORDEM_SERVICO WHERE ID = :id`, { id: body.os_id }).catch(() => null);

    await execDml(
      `INSERT INTO ENG_AGENDAMENTO (ID, OS_ID, TECNICO_MATRICULA, TECNICO_NOME,
        DATA_INICIO, DATA_FIM, STATUS, TIPO, OBS, CRIADO_EM)
       VALUES (:id, :os_id, :tec_mat, :tec_nome,
        TO_TIMESTAMP(:dt_ini, 'YYYY-MM-DD"T"HH24:MI:SS'),
        TO_TIMESTAMP(:dt_fim, 'YYYY-MM-DD"T"HH24:MI:SS'),
        'AGENDADO', :tipo, :obs, SYSTIMESTAMP)`,
      { id, os_id: body.os_id, tec_mat: body.tecnico_matricula || null, tec_nome: body.tecnico_nome || null, dt_ini: body.data_inicio.slice(0, 19), dt_fim: body.data_fim.slice(0, 19), tipo: osRow?.TIPO || "CORRETIVA", obs: body.obs || null }
    );

    await execDml(
      `UPDATE ENG_ORDEM_SERVICO SET STATUS = 'AGENDADA', DATA_PLANEJADA = TO_TIMESTAMP(:dt_ini, 'YYYY-MM-DD"T"HH24:MI:SS'),
       TECNICO_RESPONSAVEL = NVL(:tec_nome, TECNICO_RESPONSAVEL), ATUALIZADO_EM = SYSTIMESTAMP WHERE ID = :os_id`,
      { dt_ini: body.data_inicio.slice(0, 19), tec_nome: body.tecnico_nome || null, os_id: body.os_id }
    ).catch(() => {});

    reply.code(201).send({ id });
  });

  // ────────────────────────────────────────────────────────
  // ACEITE DIGITAL DA LOJA
  // ────────────────────────────────────────────────────────

  app.get("/api/engenharia/os/:id/aceite", async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const row = await queryOne(
      `SELECT a.ID, a.OS_ID, a.CODFILIAL, a.RESPONSAVEL_LOJA, a.CARGO,
              a.ACEITO, a.RESSALVAS, a.DATA_ACEITE, a.CRIADO_EM
       FROM ENG_ACEITE_LOJA a WHERE a.OS_ID = :id`, { id }
    );
    return row || { os_id: id, aceito: false };
  });

  app.post("/api/engenharia/os/:id/aceite", async (req, reply) => {
    const { id: os_id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({
      responsavel_loja: z.string().min(2),
      cargo: z.string().optional(),
      aceito: z.boolean(),
      ressalvas: z.string().optional(),
      assinatura: z.string().optional(),
    }).parse(req.body);

    const aceiteId = randomUUID();
    const os = await queryOne(`SELECT CODFILIAL FROM ENG_ORDEM_SERVICO WHERE ID = :id`, { id: os_id }).catch(() => null);

    await execDml(
      `INSERT INTO ENG_ACEITE_LOJA (ID, OS_ID, CODFILIAL, RESPONSAVEL_LOJA, CARGO, ACEITO, RESSALVAS, ASSINATURA, DATA_ACEITE, CRIADO_EM)
       VALUES (:id, :os_id, :codfilial, :resp, :cargo, :aceito, :ressalvas, :assinatura, SYSTIMESTAMP, SYSTIMESTAMP)`,
      { id: aceiteId, os_id, codfilial: os?.CODFILIAL || null, resp: body.responsavel_loja, cargo: body.cargo || null, aceito: body.aceito ? 1 : 0, ressalvas: body.ressalvas || null, assinatura: body.assinatura || null }
    );

    if (body.aceito) {
      await execDml(
        `UPDATE ENG_ORDEM_SERVICO SET ACEITE_LOJA = 1, ACEITE_LOJA_EM = SYSTIMESTAMP, ACEITE_LOJA_POR = :resp,
         STATUS = 'CONCLUIDA', ATUALIZADO_EM = SYSTIMESTAMP WHERE ID = :id`,
        { resp: body.responsavel_loja, id: os_id }
      ).catch(() => {});
    }

    appendAudit("ACEITE_LOJA", "ENG_ACEITE_LOJA", aceiteId, { os_id, aceito: body.aceito }, req.authUser?.email || "sistema");
    reply.code(201).send({ id: aceiteId, aceito: body.aceito });
  });

  // ────────────────────────────────────────────────────────
  // EVIDÊNCIAS
  // ────────────────────────────────────────────────────────

  app.post("/api/engenharia/os/:id/evidencias", async (req, reply) => {
    const { id: os_id } = z.object({ id: z.string() }).parse(req.params);
    const parts = [];
    const fields = {};

    for await (const part of req.parts()) {
      if (part.type === "file") {
        const chunks = [];
        for await (const c of part.file) chunks.push(c);
        const ext = (part.filename || "").split(".").pop()?.toLowerCase() || "bin";
        const allowed = ["jpg", "jpeg", "png", "gif", "pdf", "mp4", "mov"];
        if (!allowed.includes(ext)) {
          return reply.code(400).send({ error: `Tipo de arquivo não permitido: .${ext}` });
        }
        const fname = `evidencia-${randomUUID()}.${ext}`;
        const fpath = `uploads/${fname}`;
        const { writeFile } = await import("node:fs/promises");
        await writeFile(fpath, Buffer.concat(chunks));
        parts.push({ filename: fname });
      } else {
        fields[part.fieldname] = part.value;
      }
    }

    const results = [];
    for (const p of parts) {
      const eid = randomUUID();
      await execDml(
        `INSERT INTO ENG_EVIDENCIA (ID, OS_ID, TIPO, FASE, ARQUIVO, DESCRICAO, CRIADO_POR, CRIADO_EM)
         VALUES (:id, :os_id, :tipo, :fase, :arquivo, :descricao, :por, SYSTIMESTAMP)`,
        { id: eid, os_id, tipo: fields.tipo || "FOTO", fase: fields.fase || null, arquivo: p.filename, descricao: fields.descricao || null, por: req.authUser?.nome || "sistema" }
      );
      results.push({ id: eid, arquivo: p.filename });
    }
    reply.code(201).send(results);
  });

  // ────────────────────────────────────────────────────────
  // DASHBOARD
  // ────────────────────────────────────────────────────────

  app.get("/api/engenharia/dashboard", async (req, reply) => {
    const dias = Math.min(365, Math.max(1, Number(req.query?.dias) || 30));
    const [
      kpiSolicitacoes,
      kpiOs,
      osAbertasPorStatus,
      solicitacoesPorPrioridade,
      estoqueCritico,
      prevAtrasadas,
    ] = await Promise.all([
      queryOne(
        `SELECT
          COUNT(*) AS TOTAL,
          SUM(CASE WHEN STATUS = 'ABERTA' THEN 1 ELSE 0 END) AS ABERTAS,
          SUM(CASE WHEN STATUS = 'EM_TRIAGEM' THEN 1 ELSE 0 END) AS EM_TRIAGEM,
          SUM(CASE WHEN STATUS = 'CONCLUIDA' THEN 1 ELSE 0 END) AS CONCLUIDAS,
          SUM(CASE WHEN PRIORIDADE IN ('P0','P1') AND STATUS NOT IN ('CONCLUIDA','CANCELADA') THEN 1 ELSE 0 END) AS CRITICAS
         FROM ENG_SOLICITACAO WHERE TRUNC(CRIADO_EM) >= TRUNC(SYSDATE) - :dias`,
        { dias }
      ).catch(() => ({})),
      queryOne(
        `SELECT
          COUNT(*) AS TOTAL,
          SUM(CASE WHEN STATUS = 'PLANEJADA' THEN 1 ELSE 0 END) AS PLANEJADAS,
          SUM(CASE WHEN STATUS = 'EM_ANDAMENTO' THEN 1 ELSE 0 END) AS EM_ANDAMENTO,
          SUM(CASE WHEN STATUS = 'CONCLUIDA' AND TRUNC(DATA_FIM) = TRUNC(SYSDATE) THEN 1 ELSE 0 END) AS CONCLUIDAS_HOJE,
          SUM(CASE WHEN DATA_PLANEJADA < SYSDATE AND STATUS NOT IN ('CONCLUIDA','CANCELADA') THEN 1 ELSE 0 END) AS ATRASADAS,
          SUM(CASE WHEN STATUS = 'CONCLUIDA' AND TRUNC(DATA_FIM) >= TRUNC(SYSDATE) - :dias THEN NVL(CUSTO_REALIZADO, 0) ELSE 0 END) AS CUSTO_MES
         FROM ENG_ORDEM_SERVICO WHERE STATUS != 'CANCELADA'`,
        { dias }
      ).catch(() => ({})),
      queryRows(
        `SELECT STATUS, COUNT(*) AS QTD FROM ENG_ORDEM_SERVICO WHERE STATUS != 'CANCELADA' GROUP BY STATUS ORDER BY QTD DESC`,
        {}
      ).catch(() => []),
      queryRows(
        `SELECT PRIORIDADE, COUNT(*) AS QTD FROM ENG_SOLICITACAO WHERE STATUS NOT IN ('CONCLUIDA','CANCELADA')
         GROUP BY PRIORIDADE ORDER BY PRIORIDADE`,
        {}
      ).catch(() => []),
      queryRows(
        `SELECT i.ID, i.DESCRICAO, i.QTD_ATUAL, i.QTD_MINIMA, i.UNIDADE
         FROM ENG_ESTOQUE_ITEM i WHERE i.ATIVO = 1 AND i.QTD_ATUAL <= i.QTD_MINIMA
         ORDER BY i.QTD_ATUAL FETCH FIRST 10 ROWS ONLY`,
        {}
      ).catch(() => []),
      queryOne(
        `SELECT COUNT(*) AS TOTAL FROM ENG_PREVENTIVA WHERE ATIVO = 1 AND PROXIMA_EXECUCAO < TRUNC(SYSDATE)`,
        {}
      ).catch(() => ({ TOTAL: 0 })),
    ]);

    return {
      kpiSolicitacoes,
      kpiOs,
      osAbertasPorStatus,
      solicitacoesPorPrioridade,
      estoqueCritico,
      preventivas_atrasadas: prevAtrasadas?.TOTAL || 0,
    };
  });

  // ────────────────────────────────────────────────────────
  // FILIAIS (from WinThor - read only)
  // ────────────────────────────────────────────────────────

  app.get("/api/engenharia/filiais", async (req, reply) => {
    const rows = await queryRows(
      `SELECT f.NUMFILIAL, f.NOMEFANTASIA, f.CIDADE, f.UF
       FROM PCFILIAL f WHERE f.ATIVO = 'S' ORDER BY f.NUMFILIAL FETCH FIRST 100 ROWS ONLY`,
      {}
    ).catch(() => []);
    return rows;
  });

  // ────────────────────────────────────────────────────────
  // PERMISSÕES DE TRABALHO
  // ────────────────────────────────────────────────────────

  app.get("/api/engenharia/os/:id/permissoes", async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    return queryRows(
      `SELECT p.ID, p.TIPO, p.DESCRICAO, p.VALIDA_DE, p.VALIDA_ATE, p.APROVADOR, p.STATUS
       FROM ENG_PERMISSAO_TRABALHO p WHERE p.OS_ID = :id ORDER BY p.CRIADO_EM`,
      { id }
    );
  });

  app.post("/api/engenharia/os/:id/permissoes", async (req, reply) => {
    if (rejectIfNotEngenharia(req, reply)) return;
    const { id: os_id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({
      tipo: z.string().min(2),
      descricao: z.string().optional(),
      valida_de: z.string().optional(),
      valida_ate: z.string().optional(),
      aprovador: z.string().optional(),
    }).parse(req.body);
    const pid = randomUUID();
    await execDml(
      `INSERT INTO ENG_PERMISSAO_TRABALHO (ID, OS_ID, TIPO, DESCRICAO, VALIDA_DE, VALIDA_ATE, APROVADOR, STATUS, CRIADO_POR, CRIADO_EM)
       VALUES (:id, :os_id, :tipo, :descricao, :val_de, :val_ate, :aprovador, 'PENDENTE', :criado_por, SYSTIMESTAMP)`,
      { id: pid, os_id, tipo: body.tipo, descricao: body.descricao || null, val_de: body.valida_de || null, val_ate: body.valida_ate || null, aprovador: body.aprovador || null, criado_por: req.authUser?.nome || null }
    );
    reply.code(201).send({ id: pid });
  });

  // PT: Aprovar / Rejeitar
  app.patch("/api/engenharia/os/:id/permissoes/:pid/aprovar", async (req, reply) => {
    if (rejectIfNotEngenharia(req, reply)) return;
    const { id: os_id, pid } = z.object({ id: z.string(), pid: z.string() }).parse(req.params);
    const body = z.object({
      aprovado: z.boolean(),
      obs_aprovacao: z.string().optional(),
    }).parse(req.body);

    const novo_status = body.aprovado ? "APROVADO" : "REJEITADO";
    await execDml(
      `UPDATE ENG_PERMISSAO_TRABALHO SET STATUS = :status,
       APROVADOR = NVL(APROVADOR, :aprovador), APROVADOR_MATRICULA = :mat,
       DATA_APROVACAO = SYSTIMESTAMP, OBS_APROVACAO = :obs WHERE ID = :pid AND OS_ID = :os_id`,
      { status: novo_status, aprovador: req.authUser?.nome || null, mat: req.authUser?.sub || null, obs: body.obs_aprovacao || null, pid, os_id }
    );
    return { id: pid, status: novo_status };
  });

  // ────────────────────────────────────────────────────────
  // HISTÓRICO DA OS (trilha de auditoria)
  // ────────────────────────────────────────────────────────

  app.get("/api/engenharia/os/:id/historico", async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    return queryRows(
      `SELECT h.ID, h.CAMPO, h.VALOR_ANTERIOR, h.VALOR_NOVO,
              h.USUARIO, h.USUARIO_MATRICULA, h.CRIADO_EM
       FROM ENG_OS_HISTORICO h WHERE h.OS_ID = :id ORDER BY h.CRIADO_EM DESC`,
      { id }
    );
  });

  app.post("/api/engenharia/os/:id/historico", async (req, reply) => {
    const { id: os_id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({
      campo: z.string(),
      valor_anterior: z.string().optional(),
      valor_novo: z.string().optional(),
    }).parse(req.body);
    const hid = randomUUID();
    await execDml(
      `INSERT INTO ENG_OS_HISTORICO (ID, OS_ID, CAMPO, VALOR_ANTERIOR, VALOR_NOVO, USUARIO, USUARIO_MATRICULA, CRIADO_EM)
       VALUES (:id, :os_id, :campo, :val_ant, :val_novo, :usuario, :mat, SYSTIMESTAMP)`,
      { id: hid, os_id, campo: body.campo, val_ant: body.valor_anterior || null, val_novo: body.valor_novo || null, usuario: req.authUser?.nome || "sistema", mat: req.authUser?.sub || null }
    );
    reply.code(201).send({ id: hid });
  });

  // ────────────────────────────────────────────────────────
  // KPIs AVANÇADOS (MTTR, MTBF, retrabalho, custo/ativo)
  // ────────────────────────────────────────────────────────

  app.get("/api/engenharia/kpis", async (req, reply) => {
    const { codfilial, dias } = req.query || {};
    const periodo = Math.min(Number(dias) || 30, 365);
    const binds_fil = codfilial ? { codfilial: String(codfilial) } : {};
    const fil_where = codfilial ? " AND CODFILIAL = :codfilial" : "";

    const [mttr, retrabalho, osNoPrazo, custoPorFilial, topAtivos] = await Promise.all([
      // MTTR: média de horas para resolver (DATA_FIM - DATA_INICIO)
      queryOne(
        `SELECT ROUND(AVG((DATA_FIM - DATA_INICIO) * 24), 2) AS MTTR_HORAS,
                COUNT(*) AS OS_CONCLUIDAS
         FROM ENG_ORDEM_SERVICO
         WHERE STATUS = 'CONCLUIDA' AND DATA_INICIO IS NOT NULL AND DATA_FIM IS NOT NULL
           AND TRUNC(DATA_FIM) >= TRUNC(SYSDATE) - :periodo${fil_where}`,
        { periodo, ...binds_fil }
      ).catch(() => ({ MTTR_HORAS: null, OS_CONCLUIDAS: 0 })),

      // Taxa de retrabalho
      queryOne(
        `SELECT COUNT(*) AS TOTAL,
                SUM(CASE WHEN RETRABALHO = 1 THEN 1 ELSE 0 END) AS RETRABALHOS
         FROM ENG_ORDEM_SERVICO
         WHERE STATUS = 'CONCLUIDA' AND TRUNC(CRIADO_EM) >= TRUNC(SYSDATE) - :periodo${fil_where}`,
        { periodo, ...binds_fil }
      ).catch(() => ({ TOTAL: 0, RETRABALHOS: 0 })),

      // OS concluídas no prazo vs atrasadas
      queryOne(
        `SELECT
           SUM(CASE WHEN DATA_FIM <= DATA_PLANEJADA THEN 1 ELSE 0 END) AS NO_PRAZO,
           SUM(CASE WHEN DATA_FIM > DATA_PLANEJADA THEN 1 ELSE 0 END) AS ATRASADAS,
           COUNT(*) AS TOTAL
         FROM ENG_ORDEM_SERVICO
         WHERE STATUS = 'CONCLUIDA' AND DATA_PLANEJADA IS NOT NULL AND DATA_FIM IS NOT NULL
           AND TRUNC(DATA_FIM) >= TRUNC(SYSDATE) - :periodo${fil_where}`,
        { periodo, ...binds_fil }
      ).catch(() => ({ NO_PRAZO: 0, ATRASADAS: 0, TOTAL: 0 })),

      // Custo realizado por filial (top 10)
      queryRows(
        `SELECT CODFILIAL, NOME_FILIAL,
                SUM(NVL(CUSTO_REALIZADO, 0)) AS CUSTO_TOTAL,
                COUNT(*) AS TOTAL_OS
         FROM ENG_ORDEM_SERVICO
         WHERE TRUNC(CRIADO_EM) >= TRUNC(SYSDATE) - :periodo
         GROUP BY CODFILIAL, NOME_FILIAL
         ORDER BY CUSTO_TOTAL DESC FETCH FIRST 10 ROWS ONLY`,
        { periodo }
      ).catch(() => []),

      // Ativos com mais OS (mais problemáticos)
      queryRows(
        `SELECT o.ATIVO_ID, o.ATIVO_NOME,
                COUNT(*) AS TOTAL_OS,
                SUM(NVL(o.CUSTO_REALIZADO, 0)) AS CUSTO_TOTAL,
                SUM(CASE WHEN o.RETRABALHO = 1 THEN 1 ELSE 0 END) AS RETRABALHOS
         FROM ENG_ORDEM_SERVICO o
         WHERE o.ATIVO_ID IS NOT NULL AND TRUNC(o.CRIADO_EM) >= TRUNC(SYSDATE) - :periodo
         GROUP BY o.ATIVO_ID, o.ATIVO_NOME
         ORDER BY TOTAL_OS DESC FETCH FIRST 10 ROWS ONLY`,
        { periodo }
      ).catch(() => []),
    ]);

    const taxaRetrabalho = retrabalho?.TOTAL > 0
      ? Math.round((Number(retrabalho.RETRABALHOS) / Number(retrabalho.TOTAL)) * 100)
      : 0;
    const pctNoPrazo = osNoPrazo?.TOTAL > 0
      ? Math.round((Number(osNoPrazo.NO_PRAZO) / Number(osNoPrazo.TOTAL)) * 100)
      : null;

    return { mttr, taxaRetrabalho, retrabalho, osNoPrazo, pctNoPrazo, custoPorFilial, topAtivos, periodo };
  });

  // ────────────────────────────────────────────────────────
  // PRESTADORES TERCEIRIZADOS
  // ────────────────────────────────────────────────────────

  app.get("/api/engenharia/prestadores", async (req, reply) => {
    const { q, ativo } = req.query || {};
    let sql = `SELECT p.ID, p.RAZAO_SOCIAL, p.NOME_FANTASIA, p.CNPJ,
               p.ESPECIALIDADES, p.CONTATO_NOME, p.CONTATO_FONE, p.CONTATO_EMAIL,
               p.CIDADE, p.UF, p.AVALIACAO_MEDIA, p.TOTAL_OS, p.OS_NO_PRAZO,
               p.VALIDADE_DOCS, p.ATIVO, p.CRIADO_EM
               FROM ENG_PRESTADOR p WHERE 1=1`;
    const binds = {};
    if (ativo !== undefined) { sql += " AND p.ATIVO = :ativo"; binds.ativo = ativo === "false" ? 0 : 1; }
    else { sql += " AND p.ATIVO = 1"; }
    if (q) { sql += " AND (UPPER(p.RAZAO_SOCIAL) LIKE UPPER(:q) OR UPPER(p.NOME_FANTASIA) LIKE UPPER(:q) OR p.CNPJ LIKE :q)"; binds.q = `%${q}%`; }
    sql += " ORDER BY p.RAZAO_SOCIAL FETCH FIRST 200 ROWS ONLY";
    return queryRows(sql, binds);
  });

  app.post("/api/engenharia/prestadores", async (req, reply) => {
    if (rejectIfNotEngenharia(req, reply)) return;
    const body = z.object({
      razao_social: z.string().min(3),
      nome_fantasia: z.string().optional(),
      cnpj: z.string().optional(),
      especialidades: z.string().optional(),
      contato_nome: z.string().optional(),
      contato_fone: z.string().optional(),
      contato_email: z.string().email().optional().or(z.literal("")),
      cidade: z.string().optional(),
      uf: z.string().max(2).optional(),
      validade_docs: z.string().optional(),
      obs: z.string().optional(),
    }).parse(req.body);

    const id = randomUUID();
    await execDml(
      `INSERT INTO ENG_PRESTADOR (ID, RAZAO_SOCIAL, NOME_FANTASIA, CNPJ, ESPECIALIDADES,
        CONTATO_NOME, CONTATO_FONE, CONTATO_EMAIL, CIDADE, UF, VALIDADE_DOCS, OBS, ATIVO, CRIADO_EM, ATUALIZADO_EM)
       VALUES (:id, :razao, :fantasia, :cnpj, :esp, :ctt_nome, :ctt_fone, :ctt_email, :cidade, :uf, :val_docs, :obs, 1, SYSTIMESTAMP, SYSTIMESTAMP)`,
      { id, razao: body.razao_social, fantasia: body.nome_fantasia || null, cnpj: body.cnpj || null, esp: body.especialidades || null, ctt_nome: body.contato_nome || null, ctt_fone: body.contato_fone || null, ctt_email: body.contato_email || null, cidade: body.cidade || null, uf: body.uf || null, val_docs: body.validade_docs || null, obs: body.obs || null }
    );
    appendAudit("CRIAR_PRESTADOR", "ENG_PRESTADOR", id, body, req.authUser?.email || "sistema");
    reply.code(201).send({ id });
  });

  app.patch("/api/engenharia/prestadores/:id", async (req, reply) => {
    if (rejectIfNotEngenharia(req, reply)) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({
      razao_social: z.string().optional(),
      nome_fantasia: z.string().optional(),
      cnpj: z.string().optional(),
      especialidades: z.string().optional(),
      contato_nome: z.string().optional(),
      contato_fone: z.string().optional(),
      contato_email: z.string().optional(),
      cidade: z.string().optional(),
      uf: z.string().max(2).optional(),
      validade_docs: z.string().optional(),
      obs: z.string().optional(),
      ativo: z.boolean().optional(),
    }).parse(req.body);

    const sets = ["ATUALIZADO_EM = SYSTIMESTAMP"];
    const binds = { id };
    if (body.razao_social) { sets.push("RAZAO_SOCIAL = :razao"); binds.razao = body.razao_social; }
    if (body.nome_fantasia !== undefined) { sets.push("NOME_FANTASIA = :fantasia"); binds.fantasia = body.nome_fantasia; }
    if (body.cnpj !== undefined) { sets.push("CNPJ = :cnpj"); binds.cnpj = body.cnpj; }
    if (body.especialidades !== undefined) { sets.push("ESPECIALIDADES = :esp"); binds.esp = body.especialidades; }
    if (body.contato_nome !== undefined) { sets.push("CONTATO_NOME = :ctt_nome"); binds.ctt_nome = body.contato_nome; }
    if (body.contato_fone !== undefined) { sets.push("CONTATO_FONE = :ctt_fone"); binds.ctt_fone = body.contato_fone; }
    if (body.contato_email !== undefined) { sets.push("CONTATO_EMAIL = :ctt_email"); binds.ctt_email = body.contato_email; }
    if (body.cidade !== undefined) { sets.push("CIDADE = :cidade"); binds.cidade = body.cidade; }
    if (body.uf !== undefined) { sets.push("UF = :uf"); binds.uf = body.uf; }
    if (body.validade_docs !== undefined) { sets.push("VALIDADE_DOCS = TO_DATE(:val_docs, 'YYYY-MM-DD')"); binds.val_docs = body.validade_docs; }
    if (body.obs !== undefined) { sets.push("OBS = :obs"); binds.obs = body.obs; }
    if (body.ativo !== undefined) { sets.push("ATIVO = :ativo"); binds.ativo = body.ativo ? 1 : 0; }
    await execDml(`UPDATE ENG_PRESTADOR SET ${sets.join(", ")} WHERE ID = :id`, binds);
    return { id, ...body };
  });

  app.post("/api/engenharia/prestadores/:id/avaliar", async (req, reply) => {
    if (rejectIfNotEngenharia(req, reply)) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { nota, no_prazo } = z.object({
      nota: z.number().min(0).max(5),
      no_prazo: z.boolean().default(true),
    }).parse(req.body);

    await execDml(
      `UPDATE ENG_PRESTADOR SET
        TOTAL_OS = TOTAL_OS + 1,
        OS_NO_PRAZO = OS_NO_PRAZO + :no_prazo,
        AVALIACAO_MEDIA = ROUND((NVL(AVALIACAO_MEDIA, 0) * NVL(TOTAL_OS, 0) + :nota) / (NVL(TOTAL_OS, 0) + 1), 1),
        ATUALIZADO_EM = SYSTIMESTAMP
       WHERE ID = :id`,
      { nota, no_prazo: no_prazo ? 1 : 0, id }
    );
    return { id, nota };
  });

  // ────────────────────────────────────────────────────────
  // TÉCNICOS (from WinThor PCEMPR - read only)
  // ────────────────────────────────────────────────────────

  app.get("/api/engenharia/tecnicos", async (req, reply) => {
    const { q } = req.query || {};
    const binds = {};
    let where = "e.SITUACAO = 'A'";
    if (q) {
      where += " AND (UPPER(e.NOME) LIKE UPPER(:q) OR UPPER(e.NOME_GUERRA) LIKE UPPER(:q))";
      binds.q = `%${q}%`;
    }
    const rows = await queryRows(
      `SELECT e.MATRICULA, e.NOME, e.NOME_GUERRA, e.CODFUNCAO, e.CODFILIAL
       FROM PCEMPR e WHERE ${where}
       ORDER BY e.NOME FETCH FIRST 100 ROWS ONLY`,
      binds
    ).catch(() => []);
    return rows;
  });

  // ────────────────────────────────────────────────────────
  // PRODUTOS WINTHOR (PCPROD - read only, para materiais)
  // ────────────────────────────────────────────────────────

  app.get("/api/engenharia/produtos", async (req, reply) => {
    const { q } = req.query || {};
    if (!q || String(q).trim().length < 2) return [];
    const rows = await queryRows(
      `SELECT p.CODPROD, p.DESCRICAO, p.UNIDADE, p.PESOLIQ
       FROM PCPROD p
       WHERE (UPPER(p.DESCRICAO) LIKE UPPER(:q) OR TO_CHAR(p.CODPROD) LIKE :q2)
         AND p.ATIVO = 'S'
       ORDER BY p.DESCRICAO FETCH FIRST 30 ROWS ONLY`,
      { q: `%${String(q).trim()}%`, q2: `%${String(q).trim()}%` }
    ).catch(() => []);
    return rows;
  });

  // ────────────────────────────────────────────────────────
  // PORTAL PÚBLICO DE SOLICITAÇÕES (sem autenticação)
  // ────────────────────────────────────────────────────────

  app.get("/api/engenharia/publica/filial/:codfilial", async (req, reply) => {
    const { codfilial } = z.object({ codfilial: z.string() }).parse(req.params);
    const filial = await queryOne(
      `SELECT f.NUMFILIAL, f.NOMEFANTASIA, f.CIDADE, f.UF
       FROM PCFILIAL f WHERE f.NUMFILIAL = :codfilial AND f.ATIVO = 'S'`,
      { codfilial }
    ).catch(() => null);
    if (!filial) return reply.code(404).send({ error: "Filial não encontrada ou inativa" });
    return filial;
  });

  app.post("/api/engenharia/publica/solicitacao", async (req, reply) => {
    const body = z.object({
      titulo: z.string().min(5).max(300),
      descricao: z.string().max(2000).optional(),
      codfilial: z.string(),
      nome_filial: z.string().optional(),
      tipo: z.enum(["CORRETIVA", "PREVENTIVA", "MELHORIA", "EMERGENCIA"]).default("CORRETIVA"),
      prioridade: z.enum(["P0", "P1", "P2", "P3"]).default("P2"),
      local_especifico: z.string().max(300).optional(),
      solicitante_nome: z.string().min(2).max(200),
      solicitante_email: z.string().email().optional().or(z.literal("")),
      solicitante_fone: z.string().max(30).optional(),
    }).parse(req.body);

    const id = randomUUID();
    const prazo = calcPrazo(body.prioridade);

    await execDml(
      `INSERT INTO ENG_SOLICITACAO (ID, TITULO, DESCRICAO, CODFILIAL, NOME_FILIAL,
        TIPO, PRIORIDADE, STATUS, LOCAL_ESPECIFICO,
        SOLICITANTE_NOME, SOLICITANTE_EMAIL, SOLICITANTE_FONE,
        PRAZO_ATENDIMENTO, CRIADO_EM, ATUALIZADO_EM)
       VALUES (:id, :titulo, :descricao, :codfilial, :nome_filial,
        :tipo, :prioridade, 'ABERTA', :local,
        :sol_nome, :sol_email, :sol_fone,
        TO_TIMESTAMP(:prazo, 'YYYY-MM-DD"T"HH24:MI:SS"."FF3'),
        SYSTIMESTAMP, SYSTIMESTAMP)`,
      {
        id, titulo: body.titulo, descricao: body.descricao || null,
        codfilial: body.codfilial, nome_filial: body.nome_filial || null,
        tipo: body.tipo, prioridade: body.prioridade,
        local: body.local_especifico || null,
        sol_nome: body.solicitante_nome, sol_email: body.solicitante_email || null,
        sol_fone: body.solicitante_fone || null,
        prazo: prazo.replace("Z", "").replace("T", "T"),
      }
    );

    reply.code(201).send({
      id,
      protocolo: `SOL-${id.slice(0, 8).toUpperCase()}`,
      status: "ABERTA",
      prazo_estimado: prazo,
      mensagem: "Solicitação registrada com sucesso. Guarde o número de protocolo para acompanhamento.",
    });
  });

  // ────────────────────────────────────────────────────────
  // RELATÓRIOS (exportação Excel via xlsx)
  // ────────────────────────────────────────────────────────

  app.get("/api/engenharia/relatorios/:tipo", async (req, reply) => {
    if (rejectIfNotEngenharia(req, reply)) return;
    const { tipo } = z.object({ tipo: z.enum(["os", "custos-filial", "historico-ativo", "estoque"]) }).parse(req.params);
    const { codfilial, ativo_id, data_ini, data_fim, formato, periodo, status: filtStatus, tipo: filtTipo } = req.query || {};
    const fmt = formato === "json" ? "json" : "xlsx";

    const diasAtras = periodo ? Number(periodo) : 90;
    const periodo_ini = data_ini || new Date(Date.now() - diasAtras * 86400000).toISOString().slice(0, 10);
    const periodo_fim = data_fim || new Date().toISOString().slice(0, 10);

    let rows = [];
    let sheetName = "Relatório";

    if (tipo === "os") {
      sheetName = "Ordens de Serviço";
      let sql = `SELECT o.NUMERO, o.TITULO, o.TIPO, o.PRIORIDADE, o.STATUS,
                        o.CODFILIAL, o.NOME_FILIAL, o.TECNICO_RESPONSAVEL, o.EQUIPE,
                        o.DATA_PLANEJADA, o.DATA_INICIO, o.DATA_FIM,
                        o.HORAS_ESTIMADAS, o.HORAS_REALIZADAS,
                        o.CUSTO_ESTIMADO, o.CUSTO_REALIZADO,
                        o.PERCENTUAL_CONCLUIDO, o.RETRABALHO,
                        o.CAUSA_RAIZ, o.SOLUCAO_APLICADA, o.CRIADO_EM
                 FROM ENG_ORDEM_SERVICO o
                 WHERE TRUNC(o.CRIADO_EM) >= TO_DATE(:di, 'YYYY-MM-DD')
                   AND TRUNC(o.CRIADO_EM) <= TO_DATE(:df, 'YYYY-MM-DD')`;
      const binds = { di: periodo_ini, df: periodo_fim };
      if (codfilial) { sql += " AND o.CODFILIAL = :codfilial"; binds.codfilial = String(codfilial); }
      if (filtStatus) { sql += " AND o.STATUS = :fstatus"; binds.fstatus = String(filtStatus); }
      if (filtTipo) { sql += " AND o.TIPO = :ftipo"; binds.ftipo = String(filtTipo); }
      sql += " ORDER BY o.CRIADO_EM DESC FETCH FIRST 2000 ROWS ONLY";
      rows = await queryRows(sql, binds).catch(() => []);

    } else if (tipo === "custos-filial") {
      sheetName = "Custos por Filial";
      rows = await queryRows(
        `SELECT o.CODFILIAL, o.NOME_FILIAL,
                SUM(CASE WHEN o.TIPO = 'CORRETIVA' THEN NVL(o.CUSTO_REALIZADO, 0) ELSE 0 END) AS CUSTO_CORRETIVA,
                SUM(CASE WHEN o.TIPO = 'PREVENTIVA' THEN NVL(o.CUSTO_REALIZADO, 0) ELSE 0 END) AS CUSTO_PREVENTIVA,
                SUM(NVL(o.CUSTO_REALIZADO, 0)) AS CUSTO_TOTAL,
                COUNT(*) AS TOTAL_OS,
                SUM(CASE WHEN o.STATUS = 'CONCLUIDA' THEN 1 ELSE 0 END) AS CONCLUIDAS,
                SUM(CASE WHEN o.RETRABALHO = 1 THEN 1 ELSE 0 END) AS RETRABALHOS
         FROM ENG_ORDEM_SERVICO o
         WHERE TRUNC(o.CRIADO_EM) >= TO_DATE(:di, 'YYYY-MM-DD')
           AND TRUNC(o.CRIADO_EM) <= TO_DATE(:df, 'YYYY-MM-DD')
         GROUP BY o.CODFILIAL, o.NOME_FILIAL
         ORDER BY CUSTO_TOTAL DESC`,
        { di: periodo_ini, df: periodo_fim }
      ).catch(() => []);

    } else if (tipo === "historico-ativo") {
      sheetName = "Histórico do Ativo";
      let sql = `SELECT o.NUMERO, o.TITULO, o.TIPO, o.STATUS,
                        o.ATIVO_NOME, o.CODFILIAL,
                        o.DATA_PLANEJADA, o.DATA_INICIO, o.DATA_FIM,
                        o.HORAS_REALIZADAS, o.CUSTO_REALIZADO,
                        o.CAUSA_RAIZ, o.SOLUCAO_APLICADA, o.RETRABALHO,
                        o.CRIADO_EM
                 FROM ENG_ORDEM_SERVICO o
                 WHERE o.ATIVO_ID IS NOT NULL`;
      const binds = {};
      if (ativo_id) { sql += " AND o.ATIVO_ID = :ativo_id"; binds.ativo_id = ativo_id; }
      sql += " ORDER BY o.CRIADO_EM DESC FETCH FIRST 2000 ROWS ONLY";
      rows = await queryRows(sql, binds).catch(() => []);

    } else if (tipo === "estoque") {
      sheetName = "Estoque Engenharia";
      rows = await queryRows(
        `SELECT i.DESCRICAO, i.CATEGORIA, i.UNIDADE,
                i.QTD_ATUAL, i.QTD_MINIMA, i.QTD_MAXIMA, i.PRECO_MEDIO,
                ROUND(i.QTD_ATUAL * NVL(i.PRECO_MEDIO, 0), 2) AS VALOR_TOTAL,
                i.LOCALIZACAO,
                CASE WHEN i.QTD_ATUAL <= i.QTD_MINIMA THEN 'CRITICO' ELSE 'OK' END AS SITUACAO
         FROM ENG_ESTOQUE_ITEM i WHERE i.ATIVO = 1
         ORDER BY SITUACAO, i.DESCRICAO`,
        {}
      ).catch(() => []);
    }

    if (fmt === "json") return { rows, periodo_ini, periodo_fim, tipo };

    // Excel
    try {
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
      const filename = `engenharia-${tipo}-${periodo_ini}-${periodo_fim}.xlsx`;
      reply
        .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(buf);
    } catch (err) {
      // xlsx not available — fallback to CSV
      const csv = [
        Object.keys(rows[0] || {}).join(";"),
        ...rows.map(r => Object.values(r).map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")),
      ].join("\n");
      reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="engenharia-${tipo}.csv"`)
        .send("﻿" + csv);
    }
  });
}

// ────────────────────────────────────────────────────────
// JOB: geração automática de OS preventivas
// Chamado pelo server.js via setInterval diário
// ────────────────────────────────────────────────────────

export async function runPreventivosJob() {
  try {
    const { queryRows, queryOne, execDml } = await import("../repositories/baseRepository.js");
    const { randomUUID } = await import("node:crypto");

    const vencidas = await queryRows(
      `SELECT p.ID, p.NOME, p.ATIVO_ID, p.ATIVO_NOME, p.CODFILIAL,
              p.PERIODICIDADE_DIAS, p.DURACAO_HORAS, p.INSTRUCOES, p.TECNICO_PADRAO
       FROM ENG_PREVENTIVA p
       WHERE p.ATIVO = 1
         AND (p.PROXIMA_EXECUCAO IS NULL OR TRUNC(p.PROXIMA_EXECUCAO) <= TRUNC(SYSDATE))`,
      {}
    ).catch(() => []);

    let geradas = 0;
    for (const prev of vencidas) {
      // Verifica se já existe OS preventiva aberta para este plano
      const jaExiste = await queryOne(
        `SELECT COUNT(*) AS QTD FROM ENG_ORDEM_SERVICO
         WHERE TIPO = 'PREVENTIVA' AND STATUS NOT IN ('CONCLUIDA','CANCELADA')
           AND DESCRICAO LIKE :id_like`,
        { id_like: `%${prev.ID}%` }
      ).catch(() => ({ QTD: 0 }));

      if (Number(jaExiste?.QTD) > 0) continue;

      const osId = randomUUID();
      const seqRow = await queryOne(
        `SELECT NVL(MAX(TO_NUMBER(REGEXP_SUBSTR(NUMERO, '[0-9]+'))), 0) + 1 AS NEXT_NUM FROM ENG_ORDEM_SERVICO`,
        {}
      ).catch(() => ({ NEXT_NUM: 1 }));
      const numero = `OS-${String(seqRow?.NEXT_NUM || 1).padStart(6, "0")}`;

      await execDml(
        `INSERT INTO ENG_ORDEM_SERVICO (ID, NUMERO, TITULO, DESCRICAO, TIPO, PRIORIDADE, STATUS,
          CODFILIAL, ATIVO_ID, ATIVO_NOME, TECNICO_RESPONSAVEL, HORAS_ESTIMADAS, PERCENTUAL_CONCLUIDO, CRIADO_EM, ATUALIZADO_EM)
         VALUES (:id, :numero, :titulo, :descricao, 'PREVENTIVA', 'P2', 'PLANEJADA',
          :codfilial, :ativo_id, :ativo_nome, :tecnico, :horas, 0, SYSTIMESTAMP, SYSTIMESTAMP)`,
        {
          id: osId, numero,
          titulo: `[PREVENTIVA] ${prev.NOME}`,
          descricao: `Gerado automaticamente pelo plano ID:${prev.ID}\n${prev.INSTRUCOES || ""}`,
          codfilial: prev.CODFILIAL || "CD",
          ativo_id: prev.ATIVO_ID || null, ativo_nome: prev.ATIVO_NOME || null,
          tecnico: prev.TECNICO_PADRAO || null, horas: prev.DURACAO_HORAS || null,
        }
      );

      // Avança próxima execução
      await execDml(
        `UPDATE ENG_PREVENTIVA SET
           ULTIMA_EXECUCAO = TRUNC(SYSDATE),
           PROXIMA_EXECUCAO = TRUNC(SYSDATE) + :dias,
           ATUALIZADO_EM = SYSTIMESTAMP
         WHERE ID = :id`,
        { dias: Number(prev.PERIODICIDADE_DIAS), id: prev.ID }
      );

      await execDml(
        `INSERT INTO ENG_PREV_EXECUCAO (ID, PREVENTIVA_ID, OS_ID, DATA_EXECUCAO, STATUS, OBS, CRIADO_EM)
         VALUES (:id, :prev_id, :os_id, SYSTIMESTAMP, 'PENDENTE', 'OS gerada automaticamente pelo job', SYSTIMESTAMP)`,
        { id: randomUUID(), prev_id: prev.ID, os_id: osId }
      );

      geradas++;
    }

    return { geradas, verificadas: vencidas.length };
  } catch (err) {
    console.warn("[engenharia-job]", err?.message || err);
    return { geradas: 0, erro: String(err?.message) };
  }
}
