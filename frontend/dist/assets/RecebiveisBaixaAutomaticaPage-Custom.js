import { i as useToast, r as React, j as jsxRuntime, J as Card, K as CardHeader, M as CardTitle, N as CardContent, B as Button, a as apiGet, w as apiPost } from "./index-Cw1PFMX8.js";
import { T as Table, a as TableHeader, b as TableRow, c as TableHead, d as TableBody, e as TableCell } from "./table-BASKWVp-.js";

const h = jsxRuntime.jsx;
const hs = jsxRuntime.jsxs;

const API_BASE = "/recebiveis-cartao/conciliado-cartao";
const HISTORY_CACHE_KEY = "recebiveis.baixa-automatica.history";
const HISTORY_TIMEOUT_MS = 20000;
const CANDIDATES_TIMEOUT_MS = 45000;
const EXEC_TIMEOUT_MS = 120000;
const DEFAULT_RETRY_ATTEMPTS = 2;
const DEFAULT_RETRY_DELAY_MS = 1200;

function buildQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value == null) return;
    if (typeof value === "string" && value.trim() === "") return;
    query.set(key, String(value));
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

function formatMoney(value) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return "R$ 0,00";
  return parsed.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("pt-BR");
}

function formatDate(value) {
  if (!value) return "-";
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString("pt-BR");
}

function readCachedHistory() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCachedHistory(rows) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HISTORY_CACHE_KEY, JSON.stringify(Array.isArray(rows) ? rows : []));
  } catch {
    // Ignora falha de cache local.
  }
}

async function withTimeout(promise, timeoutMs, message) {
  let timeoutId = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

async function withRetry(task, attempts = DEFAULT_RETRY_ATTEMPTS, delayMs = DEFAULT_RETRY_DELAY_MS) {
  let lastError = null;
  for (let index = 0; index <= attempts; index += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (index >= attempts) break;
      await sleep(delayMs * (index + 1));
    }
  }
  throw lastError ?? new Error("Falha na requisicao.");
}

function SummaryCard({ title, value }) {
  return hs("div", {
    className: "rounded-md border border-border/70 bg-card p-4",
    children: [
      h("p", { className: "text-xs uppercase tracking-wide text-muted-foreground", children: title }),
      h("p", { className: "mt-2 text-2xl font-semibold text-foreground", children: value }),
    ],
  });
}

function ValueStatusBadge({ value }) {
  const variant = value === "VALOR_RECEBIDO_IGUAL"
    ? "bg-emerald-100 text-emerald-700"
    : value === "VALOR_RECEBIDO_APROXIMADO"
      ? "bg-blue-100 text-blue-700"
      : "bg-slate-100 text-slate-700";
  return h("span", {
    className: `inline-flex rounded-full px-2 py-1 text-xs font-medium ${variant}`,
    children: String(value ?? "-").replaceAll("_", " "),
  });
}

function ExecutionBadge({ value }) {
  const status = String(value ?? "").toUpperCase();
  if (!status) {
    return h("span", { className: "text-xs text-muted-foreground", children: "-" });
  }
  const variant = status === "EXECUTADO_SUCESSO"
    ? "bg-emerald-100 text-emerald-700"
    : status === "ERRO_EXECUCAO"
      ? "bg-red-100 text-red-700"
      : status === "EM_EXECUCAO"
        ? "bg-amber-100 text-amber-700"
        : "bg-blue-100 text-blue-700";
  return h("span", {
    className: `inline-flex rounded-full px-2 py-1 text-xs font-medium ${variant}`,
    children: status.replaceAll("_", " "),
  });
}

async function fetchHistory() {
  return apiGet(`${API_BASE}/history?limit=100`);
}

async function fetchCandidates(batchId, filters) {
  return apiGet(`${API_BASE}/${batchId}/baixa-automatica/candidatos${buildQuery(filters)}`);
}

async function confirmCandidates(batchId, itemIds) {
  return apiPost(`${API_BASE}/${batchId}/baixa-automatica/confirmar`, { itemIds });
}

async function fetchTelemetry(batchId) {
  return apiGet(`${API_BASE}/${batchId}/telemetria`);
}

async function simulateExecution(batchId, itemIds, strictMode) {
  return apiPost(`${API_BASE}/${batchId}/baixa-automatica/simular`, { itemIds, strictMode });
}

async function executeSettlement(batchId, itemIds, strictMode) {
  return apiPost(`${API_BASE}/${batchId}/baixa-automatica/executar`, { itemIds, strictMode });
}

function BaixaAutomaticaCartaoPage() {
  const { toast } = useToast();
  const [history, setHistory] = React.useState(() => readCachedHistory());
  const [batchId, setBatchId] = React.useState(() => {
    const cached = readCachedHistory();
    return cached?.[0]?.id ? String(cached[0].id) : "";
  });
  const [filial, setFilial] = React.useState("");
  const [apenasNaoConfirmados, setApenasNaoConfirmados] = React.useState(false);
  const [loadingHistory, setLoadingHistory] = React.useState(false);
  const [loadingCandidates, setLoadingCandidates] = React.useState(false);
  const [loadingTelemetry, setLoadingTelemetry] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [executing, setExecuting] = React.useState(false);
  const [strictMode, setStrictMode] = React.useState(true);
  const [payload, setPayload] = React.useState({ summary: {}, registros: [] });
  const [selectedIds, setSelectedIds] = React.useState([]);
  const [telemetry, setTelemetry] = React.useState(null);
  const [lastExecution, setLastExecution] = React.useState(null);

  const loadHistory = React.useCallback(async () => {
    setLoadingHistory(true);
    try {
      const data = await withRetry(
        () => withTimeout(fetchHistory(), HISTORY_TIMEOUT_MS, "Tempo limite ao carregar lotes."),
        DEFAULT_RETRY_ATTEMPTS,
      );
      const rows = data?.registros ?? [];
      setHistory(rows);
      writeCachedHistory(rows);
      setBatchId((current) => {
        if (!current && rows.length > 0) {
          return String(rows[0].id);
        }
        if (current && rows.length > 0 && !rows.some((row) => String(row.id) === String(current))) {
          return String(rows[0].id);
        }
        return current;
      });
    } catch (error) {
      const cachedRows = readCachedHistory();
      if (cachedRows.length > 0) {
        setHistory(cachedRows);
        setBatchId((current) => current || String(cachedRows[0].id));
        toast({
          title: "Historico em cache",
          description: "API instavel no momento. Exibindo lotes salvos localmente.",
        });
      } else {
      toast({
        title: "Historico",
        description: error instanceof Error ? error.message : "Falha ao carregar historico.",
        variant: "destructive",
      });
      }
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const loadCandidates = React.useCallback(async (currentBatchId) => {
    if (!currentBatchId) {
      setPayload({ summary: {}, registros: [] });
      setSelectedIds([]);
      return;
    }
    setLoadingCandidates(true);
    try {
      const data = await withRetry(
        () => withTimeout(fetchCandidates(currentBatchId, {
          apenasNaoConfirmados,
          filial,
          includeExplainability: false,
        }), CANDIDATES_TIMEOUT_MS, "Tempo limite ao carregar titulos elegiveis."),
        DEFAULT_RETRY_ATTEMPTS,
      );
      setPayload({
        summary: data?.summary ?? {},
        registros: Array.isArray(data?.registros) ? data.registros : [],
      });
      setSelectedIds([]);
    } catch (error) {
      toast({
        title: "Baixa automatica",
        description: error instanceof Error ? error.message : "Falha ao carregar titulos elegiveis.",
        variant: "destructive",
      });
    } finally {
      setLoadingCandidates(false);
    }
  }, [apenasNaoConfirmados, filial, toast]);

  const loadTelemetry = React.useCallback(async (currentBatchId, silent = true) => {
    if (!currentBatchId) {
      setTelemetry(null);
      return;
    }
    setLoadingTelemetry(true);
    try {
      const data = await withRetry(
        () => withTimeout(fetchTelemetry(currentBatchId), HISTORY_TIMEOUT_MS, "Tempo limite ao carregar telemetria."),
        1,
        1000,
      );
      setTelemetry(data ?? null);
    } catch (error) {
      if (!silent) {
        toast({
          title: "Telemetria",
          description: error instanceof Error ? error.message : "Falha ao carregar telemetria.",
          variant: "destructive",
        });
      }
    } finally {
      setLoadingTelemetry(false);
    }
  }, []);

  React.useEffect(() => {
    loadHistory().catch(() => {});
  }, []);

  React.useEffect(() => {
    loadCandidates(batchId).catch(() => {});
    loadTelemetry(batchId).catch(() => {});
  }, [batchId]);

  const refreshCurrentBatch = React.useCallback(async () => {
    if (!batchId) return;
    await Promise.all([
      loadCandidates(batchId),
      loadTelemetry(batchId, false),
    ]);
  }, [batchId, loadCandidates, loadTelemetry]);

  const registros = payload?.registros ?? [];
  const summary = payload?.summary ?? {};

  const allSelected = registros.length > 0 && registros.every((row) => selectedIds.includes(String(row.id)));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(registros.map((row) => String(row.id)));
  };

  const toggleOne = (id) => {
    const key = String(id);
    setSelectedIds((current) => current.includes(key)
      ? current.filter((item) => item !== key)
      : [...current, key]);
  };

  const confirmSelected = async () => {
    if (!batchId || selectedIds.length === 0) {
      toast({
        title: "Selecao obrigatoria",
        description: "Selecione ao menos um titulo para confirmar.",
        variant: "destructive",
      });
      return;
    }
    setConfirming(true);
    try {
      const result = await confirmCandidates(batchId, selectedIds);
      const totalAtualizados = Number(result?.totalAtualizados ?? 0);
      toast({
        title: "Confirmacao registrada",
        description: `${totalAtualizados} titulo(s) confirmado(s) para baixa automatica.`,
      });
      await refreshCurrentBatch();
    } catch (error) {
      toast({
        title: "Erro na confirmacao",
        description: error instanceof Error ? error.message : "Falha ao confirmar titulos.",
        variant: "destructive",
      });
    } finally {
      setConfirming(false);
    }
  };

  const executeSelected = async () => {
    if (!batchId || selectedIds.length === 0) {
      toast({
        title: "Selecao obrigatoria",
        description: "Selecione ao menos um titulo para executar a baixa.",
        variant: "destructive",
      });
      return;
    }
    setExecuting(true);
    try {
      const simulation = await withRetry(
        () => withTimeout(simulateExecution(batchId, selectedIds, strictMode), EXEC_TIMEOUT_MS, "Tempo limite na simulacao de baixa."),
        0,
      );
      const bloqueados = Number(simulation?.resumo?.bloqueados ?? 0);
      if (strictMode && bloqueados > 0) {
        toast({
          title: "Simulacao com bloqueios",
          description: `${bloqueados} registro(s) bloqueado(s). Corrija antes da execucao em modo estrito.`,
          variant: "destructive",
        });
        return;
      }
      const result = await withRetry(
        () => withTimeout(executeSettlement(batchId, selectedIds, strictMode), EXEC_TIMEOUT_MS, "Tempo limite na execucao de baixa."),
        0,
      );
      setLastExecution(result ?? null);
      toast({
        title: "Execucao concluida",
        description: `${result?.resumo?.totalSucesso ?? 0} sucesso(s) e ${result?.resumo?.totalErro ?? 0} erro(s).`,
      });
      await refreshCurrentBatch();
      setSelectedIds([]);
    } catch (error) {
      toast({
        title: "Erro na execucao",
        description: error instanceof Error ? error.message : "Falha ao executar baixas.",
        variant: "destructive",
      });
    } finally {
      setExecuting(false);
    }
  };

  return hs("div", {
    className: "space-y-6 animate-fade-in",
    children: [
      hs("div", {
        children: [
          h("h1", { className: "text-2xl font-bold text-foreground", children: "Baixa Automatica de Titulos" }),
          h("p", {
            className: "mt-1 text-sm text-muted-foreground",
            children: "Selecione os titulos com VALOR_RECEBIDO_IGUAL e VALOR_RECEBIDO_APROXIMADO para confirmar a baixa financeira.",
          }),
        ],
      }),
      hs(Card, {
        className: "border-border/70",
        children: [
          h(CardHeader, { children: h(CardTitle, { className: "text-sm font-semibold", children: "Filtros da fila de baixa" }) }),
          hs(CardContent, {
            className: "space-y-3",
            children: [
              hs("div", {
                className: "grid gap-3 lg:grid-cols-3",
                children: [
                  hs("label", {
                    className: "space-y-1 text-sm",
                    children: [
                      h("span", { className: "text-muted-foreground", children: "Lote do conciliador" }),
                      h("select", {
                        className: "h-10 w-full rounded-md border border-input bg-background px-3 text-sm",
                        value: batchId,
                        onChange: (event) => setBatchId(event.target.value),
                        children: [
                          h("option", { value: "", children: loadingHistory ? "Carregando..." : "Selecione um lote" }),
                          ...history.map((row) => h("option", {
                            value: row.id,
                            children: `${row.file_name} (${formatDate(row.created_at)})`,
                          }, row.id)),
                        ],
                      }),
                    ],
                  }),
                  hs("label", {
                    className: "space-y-1 text-sm",
                    children: [
                      h("span", { className: "text-muted-foreground", children: "Filial (opcional)" }),
                      h("input", {
                        className: "h-10 w-full rounded-md border border-input bg-background px-3 text-sm",
                        value: filial,
                        onChange: (event) => setFilial(event.target.value),
                        placeholder: "Ex: 11, 2G, 4A",
                      }),
                    ],
                  }),
                  hs("label", {
                    className: "flex items-end gap-2 text-sm",
                    children: [
                      h("input", {
                        type: "checkbox",
                        checked: apenasNaoConfirmados,
                        onChange: (event) => setApenasNaoConfirmados(event.target.checked),
                      }),
                      h("span", { className: "text-muted-foreground", children: "Mostrar apenas nao confirmados" }),
                    ],
                  }),
                ],
              }),
              hs("div", {
                className: "flex items-center gap-2 text-sm",
                children: [
                  h("input", {
                    id: "strict-mode-baixa",
                    type: "checkbox",
                    checked: strictMode,
                    onChange: (event) => setStrictMode(event.target.checked),
                  }),
                  h("label", {
                    htmlFor: "strict-mode-baixa",
                    className: "text-muted-foreground",
                    children: "Modo estrito (bloqueia execucao se houver pendencia).",
                  }),
                ],
              }),
              hs("div", {
                className: "flex flex-wrap gap-2",
                children: [
                  h(Button, {
                    variant: "outline",
                    onClick: () => loadCandidates(batchId),
                    disabled: !batchId || loadingCandidates,
                    children: loadingCandidates ? "Atualizando..." : "Atualizar fila",
                  }),
                  h(Button, {
                    variant: "outline",
                    onClick: () => loadTelemetry(batchId, false),
                    disabled: !batchId || loadingTelemetry,
                    children: loadingTelemetry ? "Carregando telemetria..." : "Atualizar telemetria",
                  }),
                  h(Button, {
                    onClick: confirmSelected,
                    disabled: confirming || selectedIds.length === 0 || !batchId,
                    children: confirming ? "Confirmando..." : `Confirmar baixa dos selecionados (${selectedIds.length})`,
                  }),
                  h(Button, {
                    variant: "secondary",
                    onClick: executeSelected,
                    disabled: executing || selectedIds.length === 0 || !batchId,
                    children: executing ? "Executando baixa..." : `Executar baixa financeira (${selectedIds.length})`,
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      hs("div", {
        className: "grid gap-3 md:grid-cols-2 xl:grid-cols-6",
        children: [
          h(SummaryCard, { title: "Qtd elegiveis", value: summary.total_registros ?? 0 }),
          h(SummaryCard, { title: "Valor elegivel total", value: formatMoney(summary.total_valor) }),
          h(SummaryCard, { title: "Qtd valor igual", value: summary.total_qtd_recebido_igual ?? 0 }),
          h(SummaryCard, { title: "Valor recebido igual", value: formatMoney(summary.total_valor_recebido_igual) }),
          h(SummaryCard, { title: "Qtd valor aproximado", value: summary.total_qtd_recebido_aproximado ?? 0 }),
          h(SummaryCard, { title: "Valor recebido aproximado", value: formatMoney(summary.total_valor_recebido_aproximado) }),
          h(SummaryCard, { title: "Confirmados", value: summary.total_confirmados ?? 0 }),
          h(SummaryCard, { title: "Pendentes confirmacao", value: summary.total_pendentes_confirmacao ?? 0 }),
          h(SummaryCard, { title: "Ambiguidade", value: summary.total_ambiguidade ?? 0 }),
          h(SummaryCard, { title: "Execucao sucesso", value: telemetry?.baixaAutomatica?.total_executados_sucesso ?? 0 }),
          h(SummaryCard, { title: "Execucao erro", value: telemetry?.baixaAutomatica?.total_execucao_erro ?? 0 }),
        ],
      }),
      telemetry
        ? hs(Card, {
          className: "border-border/70",
          children: [
            h(CardHeader, { children: h(CardTitle, { className: "text-sm font-semibold", children: "Telemetria operacional do lote" }) }),
            hs(CardContent, {
              className: "grid gap-3 md:grid-cols-2 xl:grid-cols-4 text-sm",
              children: [
                hs("div", { className: "rounded-md border border-border/70 p-3", children: [h("p", { className: "text-xs text-muted-foreground", children: "Status lote" }), h("p", { className: "mt-1 font-medium", children: telemetry?.status ?? "-" })] }),
                hs("div", { className: "rounded-md border border-border/70 p-3", children: [h("p", { className: "text-xs text-muted-foreground", children: "Ultimo evento" }), h("p", { className: "mt-1 font-medium", children: telemetry?.eventosRecentes?.[0]?.event_type ?? "-" })] }),
                hs("div", { className: "rounded-md border border-border/70 p-3", children: [h("p", { className: "text-xs text-muted-foreground", children: "Reprocessamento" }), h("p", { className: "mt-1 font-medium", children: telemetry?.reprocessamento?.status ?? "SEM JOB EM EXECUCAO" })] }),
                hs("div", { className: "rounded-md border border-border/70 p-3", children: [h("p", { className: "text-xs text-muted-foreground", children: "Gerado em" }), h("p", { className: "mt-1 font-medium", children: formatDateTime(telemetry?.generatedAt) })] }),
              ],
            }),
          ],
        })
        : null,
      lastExecution
        ? hs(Card, {
          className: "border-border/70",
          children: [
            h(CardHeader, { children: h(CardTitle, { className: "text-sm font-semibold", children: "Ultima execucao de baixa" }) }),
            hs(CardContent, {
              className: "text-sm text-muted-foreground",
              children: [
                hs("p", { children: ["Sucessos: ", h("strong", { className: "text-foreground", children: String(lastExecution?.resumo?.totalSucesso ?? 0) }), " | Erros: ", h("strong", { className: "text-foreground", children: String(lastExecution?.resumo?.totalErro ?? 0) })] }),
                h("p", { className: "mt-1", children: `Gerado em ${formatDateTime(lastExecution?.generatedAt)}` }),
              ],
            }),
          ],
        })
        : null,
      hs(Card, {
        className: "border-border/70",
        children: [
          h(CardHeader, { children: h(CardTitle, { className: "text-sm font-semibold", children: "Titulos elegiveis para baixa" }) }),
          h(CardContent, {
            className: "overflow-x-auto",
            children: hs(Table, {
              children: [
                h(TableHeader, {
                  children: hs(TableRow, {
                    children: [
                      h(TableHead, { className: "w-[44px]", children: h("input", { type: "checkbox", checked: allSelected, onChange: toggleAll }) }),
                      h(TableHead, { children: "Linha" }),
                      h(TableHead, { children: "Filial" }),
                      h(TableHead, { children: "CODCLI" }),
                      h(TableHead, { children: "Cliente" }),
                      h(TableHead, { children: "Duplicata" }),
                      h(TableHead, { children: "Prest." }),
                      h(TableHead, { children: "Pedido" }),
                      h(TableHead, { children: "Nota" }),
                      h(TableHead, { children: "Data Rede" }),
                      h(TableHead, { className: "text-right", children: "Valor Rede" }),
                      h(TableHead, { children: "Status valor" }),
                      h(TableHead, { children: "Execucao" }),
                      h(TableHead, { children: "Mensagem execucao" }),
                      h(TableHead, { children: "Confirmado em" }),
                      h(TableHead, { children: "Confirmado por" }),
                    ],
                  }),
                }),
                hs(TableBody, {
                  children: [
                    registros.map((row) => hs(TableRow, {
                      children: [
                        h(TableCell, { children: h("input", { type: "checkbox", checked: selectedIds.includes(String(row.id)), onChange: () => toggleOne(row.id) }) }),
                        h(TableCell, { children: row.row_number ?? "-" }),
                        h(TableCell, { children: row.filial_codigo ?? "-" }),
                        h(TableCell, { children: row.codcli ?? "-" }),
                        h(TableCell, { children: row.cliente ?? "-" }),
                        h(TableCell, { children: row.duplicata ?? "-" }),
                        h(TableCell, { children: row.prestacao ?? "-" }),
                        h(TableCell, { children: row.pedido ?? "-" }),
                        h(TableCell, { children: row.nota ?? "-" }),
                        h(TableCell, { children: formatDate(row.data_pagamento_rede) }),
                        h(TableCell, { className: "text-right", children: formatMoney(row.valor_rede) }),
                        h(TableCell, { children: h(ValueStatusBadge, { value: row.value_status }) }),
                        h(TableCell, { children: h(ExecutionBadge, { value: row.baixa_execucao_status }) }),
                        h(TableCell, { children: row.baixa_execucao_msg ?? "-" }),
                        h(TableCell, { children: formatDateTime(row.baixa_confirmada_at) }),
                        h(TableCell, { children: row.baixa_confirmada_por ?? "-" }),
                      ],
                    }, row.id)),
                    !loadingCandidates && registros.length === 0
                      ? h(TableRow, { children: h(TableCell, { colSpan: 16, className: "py-10 text-center text-sm text-muted-foreground", children: "Nenhum titulo elegivel encontrado para este lote." }) })
                      : null,
                  ],
                }),
              ],
            }),
          }),
        ],
      }),
    ],
  });
}

export default BaixaAutomaticaCartaoPage;
