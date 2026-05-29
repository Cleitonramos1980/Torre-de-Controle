import { i as useToastHook, aL as useParamsHook, r as React, j as jsxRuntime, B as Button, L as Link, E as ArrowLeft, d as Shield, X as putRequest } from "./index-Cw1PFMX8.js";
import { C as AlertCard, O as OperationalTimeline } from "./OperationalTimeline-D3LGMnZC.js";
import { T as TraceabilityCard } from "./TraceabilityCard-DuUbLGZ_.js";
import { R as RelatedActionsPanel } from "./RelatedActionsPanel-_1DiurXu.js";
import { S as StatusSemaphore } from "./StatusSemaphore-CQBihzSh.js";
import { b as fetchAcessoById, c as fetchTimelineByOrigem } from "./operacional-4Pj5wcXo.js";
import "./circle-C6El4rM0.js";
import "./clock-BvPSHmb1.js";
import "./circle-check-big-BBYG8Ose.js";
import "./external-link-l36vzcWY.js";
import "./file-warning-DEs0oEir.js";
import "./statusText-CAD0X8BX.js";

function formatDateTime(value) {
  if (!value) return void 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR");
}

const AcessoDetalhePage = () => {
  const { toast } = useToastHook();
  const { id } = useParamsHook();
  const [acesso, setAcesso] = React.useState(null);
  const [timeline, setTimeline] = React.useState([]);
  const [selfieError, setSelfieError] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState(false);

  const loadAcesso = React.useCallback(async () => {
    if (!id) return;
    try {
      const [acessoData, timelineData] = await Promise.all([
        fetchAcessoById(id),
        fetchTimelineByOrigem(id),
      ]);
      setAcesso(acessoData || null);
      setTimeline(Array.isArray(timelineData) ? timelineData : []);
    } catch (error) {
      setAcesso(null);
      const message = error instanceof Error ? error.message : "Falha ao carregar acesso.";
      toast({
        title: "Erro ao carregar acesso",
        description: message,
        variant: "destructive",
      });
    }
  }, [id, toast]);

  React.useEffect(() => {
    loadAcesso();
  }, [loadAcesso]);

  React.useEffect(() => {
    setSelfieError(false);
  }, [acesso == null ? void 0 : acesso.selfieUrl]);

  const refreshTimeline = React.useCallback(async () => {
    if (!id) return;
    try {
      const events = await fetchTimelineByOrigem(id);
      setTimeline(Array.isArray(events) ? events : []);
    } catch {
      return;
    }
  }, [id]);

  const handleLiberarEntrada = React.useCallback(async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      const updated = await putRequest(`/operacional/acessos/${id}/liberar`, {});
      setAcesso(updated || null);
      await refreshTimeline();
      toast({
        title: "Entrada liberada",
        description: "Status atualizado com sucesso.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao liberar entrada.";
      toast({
        title: "Falha ao liberar entrada",
        description: message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  }, [id, refreshTimeline, toast]);

  const handleRegistrarSaida = React.useCallback(async () => {
    if (!id) return;
    setActionLoading(true);
    try {
      const updated = await putRequest(`/operacional/acessos/${id}/saida`, {});
      setAcesso(updated || null);
      await refreshTimeline();
      toast({
        title: "Saida registrada",
        description: "A permanencia foi encerrada com sucesso.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao registrar saida.";
      toast({
        title: "Falha ao registrar saida",
        description: message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  }, [id, refreshTimeline, toast]);

  if (!acesso) {
    return jsxRuntime.jsx("div", {
      className: "p-8 text-center text-muted-foreground",
      children: "Carregando...",
    });
  }

  const criticidadeTipo = acesso.criticidade === "CRITICA"
    ? "danger"
    : acesso.criticidade === "ALTA"
      ? "warning"
      : "info";

  const canLiberar = ["PRE_AUTORIZADO", "AGUARDANDO_VALIDACAO"].includes(acesso.status);
  const canRegistrarSaida = ["ENTRADA_REGISTRADA", "ENTRADA_LIBERADA", "EM_PERMANENCIA"].includes(acesso.status);

  return jsxRuntime.jsxs("div", {
    className: "space-y-6 animate-fade-in",
    children: [
      jsxRuntime.jsxs("div", {
        className: "flex items-center gap-3",
        children: [
          jsxRuntime.jsx(Button, {
            variant: "ghost",
            size: "icon",
            asChild: true,
            children: jsxRuntime.jsx(Link, {
              to: "/portaria",
              children: jsxRuntime.jsx(ArrowLeft, { className: "h-4 w-4" }),
            }),
          }),
          jsxRuntime.jsxs("div", {
            className: "flex-1",
            children: [
              jsxRuntime.jsxs("div", {
                className: "flex items-center gap-3",
                children: [
                  jsxRuntime.jsx("h1", {
                    className: "text-2xl font-bold text-foreground",
                    children: acesso.id,
                  }),
                  jsxRuntime.jsx(StatusSemaphore, { status: acesso.status }),
                ],
              }),
              jsxRuntime.jsxs("p", {
                className: "text-sm text-muted-foreground",
                children: [acesso.tipo, " — ", acesso.nome],
              }),
            ],
          }),
          jsxRuntime.jsxs("div", {
            className: "flex gap-2",
            children: [
              canLiberar && jsxRuntime.jsx(Button, {
                size: "sm",
                className: "bg-success hover:bg-success/90 text-success-foreground",
                onClick: handleLiberarEntrada,
                disabled: actionLoading,
                children: actionLoading ? "Liberando..." : "Liberar Entrada",
              }),
              canLiberar && jsxRuntime.jsx(Button, {
                variant: "destructive",
                size: "sm",
                children: "Recusar",
              }),
              canRegistrarSaida && jsxRuntime.jsx(Button, {
                size: "sm",
                onClick: handleRegistrarSaida,
                disabled: actionLoading,
                children: actionLoading ? "Registrando..." : "Registrar Saida",
              }),
            ],
          }),
        ],
      }),
      acesso.criticidade !== "BAIXA" && jsxRuntime.jsx(AlertCard, {
        tipo: criticidadeTipo,
        titulo: `Criticidade ${acesso.criticidade}`,
        descricao: acesso.motivo,
      }),
      jsxRuntime.jsxs("div", {
        className: "grid gap-6 lg:grid-cols-3",
        children: [
          jsxRuntime.jsxs("div", {
            className: "lg:col-span-2 space-y-6",
            children: [
              jsxRuntime.jsx(TraceabilityCard, {
                titulo: "Dados do Acesso",
                dados: [
                  { label: "Tipo", valor: acesso.tipo },
                  { label: "Nome", valor: acesso.nome },
                  { label: "Documento", valor: acesso.documento },
                  { label: "Empresa", valor: acesso.empresa },
                  { label: "Motivo", valor: acesso.motivo },
                  { label: "Setor Destino", valor: acesso.setorDestino },
                  { label: "Responsável Interno", valor: acesso.responsavelInterno },
                  { label: "Placa", valor: acesso.placa },
                  { label: "Tipo Veículo", valor: acesso.tipoVeiculo },
                  { label: "Horário Previsto", valor: formatDateTime(acesso.horarioPrevisto) },
                  { label: "Horário Real", valor: formatDateTime(acesso.horarioReal) },
                  { label: "Saída", valor: formatDateTime(acesso.horarioSaida) },
                  { label: "Planta", valor: acesso.planta },
                  { label: "Criado em", valor: formatDateTime(acesso.criadoEm) },
                  { label: "Criado por", valor: acesso.criadoPor },
                ],
              }),
              jsxRuntime.jsxs("div", {
                className: "glass-card rounded-lg p-5",
                children: [
                  jsxRuntime.jsx("h3", {
                    className: "mb-4 text-sm font-semibold text-foreground",
                    children: "Timeline de Eventos",
                  }),
                  jsxRuntime.jsx(OperationalTimeline, { eventos: timeline }),
                ],
              }),
            ],
          }),
          jsxRuntime.jsxs("div", {
            className: "space-y-6",
            children: [
              acesso.selfieUrl && jsxRuntime.jsxs("div", {
                className: "glass-card rounded-lg p-4",
                children: [
                  jsxRuntime.jsx("h3", {
                    className: "mb-3 text-sm font-semibold text-foreground",
                    children: "Selfie / Identificação",
                  }),
                  jsxRuntime.jsx("div", {
                    className: "aspect-square rounded-lg bg-muted flex items-center justify-center overflow-hidden",
                    children: selfieError
                      ? jsxRuntime.jsx("p", {
                          className: "px-4 text-center text-xs text-muted-foreground",
                          children: "Selfie indisponivel neste cadastro. Solicite novo envio da foto.",
                        })
                      : jsxRuntime.jsx("img", {
                          src: acesso.selfieUrl,
                          alt: "Selfie",
                          className: "h-full w-full object-cover",
                          onError: () => setSelfieError(true),
                        }),
                  }),
                  jsxRuntime.jsxs("p", {
                    className: "mt-2 text-[10px] text-muted-foreground flex items-center gap-1",
                    children: [
                      jsxRuntime.jsx(Shield, { className: "h-3 w-3" }),
                      " Dado sensível • LGPD. Retenção: 90 dias.",
                    ],
                  }),
                ],
              }),
              jsxRuntime.jsxs("div", {
                className: "glass-card rounded-lg p-4",
                children: [
                  jsxRuntime.jsx("h3", {
                    className: "mb-3 text-sm font-semibold text-foreground",
                    children: "Auditoria",
                  }),
                  jsxRuntime.jsxs("dl", {
                    className: "space-y-2 text-xs",
                    children: [
                      jsxRuntime.jsxs("div", {
                        children: [
                          jsxRuntime.jsx("dt", { className: "text-muted-foreground", children: "Origem" }),
                          jsxRuntime.jsx("dd", { className: "text-foreground", children: acesso.criadoPor }),
                        ],
                      }),
                      jsxRuntime.jsxs("div", {
                        children: [
                          jsxRuntime.jsx("dt", { className: "text-muted-foreground", children: "Status Atual" }),
                          jsxRuntime.jsx("dd", { children: jsxRuntime.jsx(StatusSemaphore, { status: acesso.status }) }),
                        ],
                      }),
                      jsxRuntime.jsxs("div", {
                        children: [
                          jsxRuntime.jsx("dt", { className: "text-muted-foreground", children: "Criticidade" }),
                          jsxRuntime.jsx("dd", { children: jsxRuntime.jsx(StatusSemaphore, { status: acesso.criticidade }) }),
                        ],
                      }),
                      jsxRuntime.jsxs("div", {
                        children: [
                          jsxRuntime.jsx("dt", { className: "text-muted-foreground", children: "Criado em" }),
                          jsxRuntime.jsx("dd", { children: formatDateTime(acesso.criadoEm) }),
                        ],
                      }),
                      jsxRuntime.jsxs("div", {
                        children: [
                          jsxRuntime.jsx("dt", { className: "text-muted-foreground", children: "Última Atualização" }),
                          jsxRuntime.jsx("dd", { children: formatDateTime(acesso.ultimaAtualizacao) }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              jsxRuntime.jsx(RelatedActionsPanel, { origemId: acesso.id }),
            ],
          }),
        ],
      }),
    ],
  });
};

export { AcessoDetalhePage as default };
