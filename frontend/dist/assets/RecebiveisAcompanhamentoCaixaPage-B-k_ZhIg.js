import {
  c as ce,
  i as de,
  bv as xe,
  r as s,
  j as a,
  B as t,
  f as he,
  J as c,
  K as d,
  M as x,
  N as h,
  l as y,
  m as S,
  n as I,
  o as O,
  e as me,
  a1 as z,
} from "./index-Cw1PFMX8.js";
import { u as B, r as f } from "./queryKeys-DTadpFID.js";
import { u as E } from "./useMutation-BkrZfWtA.js";
import { A as ue, b as je, a as pe } from "./alert-DlvOSeOm.js";
import { B as W } from "./badge-B2SLyCXJ.js";
import { I as D } from "./input-CnWhQnjH.js";
import { L as p } from "./label-CRMrAwdj.js";
import {
  S as Ja,
  a as Za,
  b as $a,
  c as wa,
  d as Xa,
} from "./select-BwD7H_FL.js";
import {
  T as ve,
  a as ge,
  b as G,
  c as j,
  d as fe,
  e as m,
} from "./table-BASKWVp-.js";
import { T as Ya } from "./textarea-Ch7hFFqp.js";
import { f as N, a as ae, c as ee } from "./formatters-yKX9NL29.js";
import {
  f as Ne,
  h as Ae,
  i as be,
  j as Ce,
  k as ye,
  l as Se,
  m as Ie,
  s as Oe,
  n as Ee,
  acompanhamentoCaixaResumoFechamento as Gee,
} from "./recebiveisCartao-B2POAfEy.js";
import { R as De } from "./refresh-ccw-CH_141Zj.js";
import { T as Te } from "./timer-reset-DXDADk4Z.js";
import "./index-BdQq_4o_.js";
import "./index-lgCT-RbZ.js";
import "./index-CM7B8zZL.js";
import "./check-BVac9zGz.js";
/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */
const Fe = ce("FileArchive", [
    ["path", { d: "M10 12v-1", key: "v7bkov" }],
    ["path", { d: "M10 18v-2", key: "1cjy8d" }],
    ["path", { d: "M10 7V6", key: "dljcrl" }],
    ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4", key: "tnqrlb" }],
    [
      "path",
      {
        d: "M15.5 22H18a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v16a2 2 0 0 0 .274 1.01",
        key: "gkbcor",
      },
    ],
    ["circle", { cx: "10", cy: "20", r: "2", key: "1xzdoj" }],
  ]),
  Re = [
    "ALL",
    "ABERTO",
    "FECHADO_WINTHOR",
    "SNAPSHOT_GERADO",
    "EM_AUDITORIA",
    "AUDITADO_SEM_DIVERGENCIA",
    "AUDITADO_COM_DIVERGENCIA",
    "ACERTO_EM_APROVACAO",
    "ACERTO_APROVADO",
    "ACERTO_REPROVADO",
    "FINALIZADO",
  ],
  ke = ["ALL", "BAIXA", "MEDIA", "ALTA", "CRITICA"];
function Le() {
  return /* @__PURE__ */ new Date().toISOString().slice(0, 10);
}
function Qe(n) {
  const e = Number(n ?? 0);
  if (!Number.isFinite(e)) return "0";
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 0,
  }).format(e);
}
function Ve(n) {
  if (!n) return "-";
  if (typeof n === "string") {
    const e = n.trim();
    const t = e.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (t) return `${t[3]}/${t[2]}/${t[1]}`;
    const r = e.match(/^(\d{4})-(\d{2})-(\d{2})T/);
    if (r) return `${r[3]}/${r[2]}/${r[1]}`;
    const o = e.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (o) return e;
  }
  const e = new Date(n);
  if (Number.isNaN(e.getTime())) return String(n);
  return e.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}
function se(n) {
  return n.includes("DIVERGENCIA") || n.includes("REPROVADO")
    ? "destructive"
    : n.includes("APROVACAO") || n.includes("AUDITORIA")
      ? "secondary"
      : n === "FINALIZADO" || n.includes("SEM_DIVERGENCIA")
        ? "default"
        : "outline";
}
const Ye = ({ viewMode: n = "all" }) => {
  var ma,
    ua,
    ja,
    pa,
    va,
    ga,
    fa,
    Na,
    Aa,
    ba,
    Ca,
    ya,
    Sa,
    Ia,
    Oa,
    Ea,
    Da,
    Ta,
    Fa,
    Ra,
    ka,
    La,
    Va,
    Pa,
    Ma,
    za,
    Ba,
    _a,
    qa,
    Ha,
    Ka,
    Qa,
    Wa,
    Ga;
  const { toast: o } = de(),
    T = xe(),
    A =
      n === "abertos" ? "ABERTO" : n === "fechados" ? "FECHADO_WINTHOR" : null,
    ie =
      n === "abertos"
        ? "Caixas Em aberto"
        : n === "fechados"
          ? "Caixas Fechado"
          : "Acompanhamento Caixa",
    te =
      n === "abertos"
        ? "Lista exclusiva de caixas em aberto para tratamento operacional."
        : n === "fechados"
          ? "Lista exclusiva de caixas fechados para auditoria e reconciliacao."
          : "Auditoria rastreavel por PDV com snapshot WinThor, trilha de eventos e reconciliacao final.",
    [v, re] = s.useState(Le()),
    [b, U] = s.useState(""),
    [F, _] = s.useState(A ?? "ALL"),
    [R, J] = s.useState("ALL"),
    [Z, k] = s.useState(1),
    [$] = s.useState(50),
    [u, w] = s.useState(null),
    [i, X] = s.useState(null),
    [L, Y] = s.useState(null),
    [q, V] = s.useState(null),
    [H, P] = s.useState(null),
    [K, aa] = s.useState(""),
    [ea, sa] = s.useState(""),
    [ia, ta] = s.useState(""),
    [ra, la] = s.useState(""),
    [Q, na] = s.useState(""),
    [resumoModo, setResumoModo] = s.useState("DIA"),
    [resumoDataInicio, setResumoDataInicio] = s.useState(Le()),
    [resumoDataFim, setResumoDataFim] = s.useState(Le());
  s.useEffect(() => {
    A && _(A);
  }, [A]);
  const oa = s.useMemo(
      () => ({
        dataMovimento: v,
        codfilial: b || void 0,
        status: F === "ALL" ? void 0 : F,
        risco: R === "ALL" ? void 0 : R,
        page: Z,
        pageSize: $,
      }),
      [b, v, Z, $, R, F],
    ),
    M = B({
      queryKey: f.acompanhamentoCaixaDashboard(v, b || void 0),
      queryFn: () => Ae(v, b || void 0),
      enabled: !!v,
    }),
    g = B({
      queryKey: f.acompanhamentoCaixaLista(oa),
      queryFn: () => be(oa),
      enabled: !!v,
    }),
    l = B({
      queryKey: f.acompanhamentoCaixaDetalhe(
        (u == null ? void 0 : u.id) ?? null,
      ),
      queryFn: () => Ne(u == null ? void 0 : u.id),
      enabled: !!(u != null && u.id),
    }),
    C = B({
      queryKey: f.acompanhamentoCaixaPacote(L),
      queryFn: () => Ce(L),
      enabled: !!L,
    }),
    meResumo = B({
      queryKey: [
        ...f.all,
        "acompanhamento-caixa-resumo-fechamento",
        n,
        resumoModo,
        resumoModo === "PERIODO" ? resumoDataInicio : v,
        resumoModo === "PERIODO" ? resumoDataFim : null,
        n === "abertos" ? b : null,
      ],
      queryFn: () =>
        Gee(
          resumoModo === "PERIODO"
            ? {
                dataInicio: resumoDataInicio,
                dataFim: resumoDataFim,
                codfilial: n === "abertos" ? b || void 0 : void 0,
                tipoResumo: n === "abertos" ? "ABERTO" : "FECHADO",
              }
            : {
                dataMovimento: v,
                codfilial: n === "abertos" ? b || void 0 : void 0,
                tipoResumo: n === "abertos" ? "ABERTO" : "FECHADO",
              },
        ),
      enabled:
        (n === "fechados" || n === "abertos") &&
        (resumoModo === "PERIODO"
          ? !!resumoDataInicio && !!resumoDataFim
          : !!v),
    }),
    ca = E({
      mutationFn: () => ye({ dataMovimento: v, codfilial: b || void 0 }),
      onSuccess: (e) => {
        (o({
          title: "Snapshot gerado",
          description: `${e.totalCaixasSnapshot} caixas e ${e.totalLinhasSnapshot} linhas auditadas.`,
        }),
          T.invalidateQueries({ queryKey: f.all }));
      },
      onError: (e) => {
        o({
          title: "Falha ao gerar snapshot",
          description: z(e, "Erro na geracao de snapshot."),
          variant: "destructive",
        });
      },
    }),
    le = E({
      mutationFn: (e) => Se(e),
      onSuccess: () => {
        (o({
          title: "Auditoria iniciada",
          description: "Caixa movido para EM_AUDITORIA.",
        }),
          T.invalidateQueries({ queryKey: f.all }));
      },
    }),
    da = E({
      mutationFn: (e) =>
        Ie(e.id, {
          valorInformadoOperador: e.valorInformadoOperador,
          valorAuditado: e.valorAuditado,
          observacao: e.observacao,
        }),
      onSuccess: () => {
        (o({
          title: "Auditoria finalizada",
          description: "Estado de caixa atualizado com sucesso.",
        }),
          V(null),
          aa(""),
          sa(""),
          ta(""),
          T.invalidateQueries({ queryKey: f.all }));
      },
      onError: (e) => {
        o({
          title: "Falha ao finalizar auditoria",
          description: z(e, "Erro ao finalizar auditoria."),
          variant: "destructive",
        });
      },
    }),
    xa = E({
      mutationFn: (e) =>
        Oe(e.id, { valor: e.valor, justificativa: e.justificativa }),
      onSuccess: () => {
        (o({
          title: "Acerto solicitado",
          description: "Fluxo de aprovacao iniciado.",
        }),
          P(null),
          la(""),
          na(""),
          T.invalidateQueries({ queryKey: f.all }));
      },
      onError: (e) => {
        o({
          title: "Falha ao solicitar acerto",
          description: z(e, "Erro ao solicitar acerto."),
          variant: "destructive",
        });
      },
    }),
    ne = E({
      mutationFn: (e) => Ee(e),
      onSuccess: (e) => X(e),
      onError: (e) => {
        o({
          title: "Comparacao falhou",
          description: z(e, "Erro ao comparar snapshot com WinThor atual."),
          variant: "destructive",
        });
      },
    }),
    oe = (e) => {
      (e.preventDefault(),
        k(1),
        g.refetch(),
        M.refetch(),
        (n === "fechados" || n === "abertos") && meResumo.refetch());
    },
    r = (ma = M.data) == null ? void 0 : ma.cards,
    ha = ((ua = g.data) == null ? void 0 : ua.registros) ?? [],
    resumoFechamento = meResumo.data ?? {
      resumoDiario: [],
      totais: {
        qtdeTitulos: 0,
        vendaBruta: 0,
        vendaLiquida: 0,
        valorDinheiro: 0,
        chequePrazo: 0,
        chequeVista: 0,
        ticket: 0,
        boleto: 0,
        carteira: 0,
        cartaoTef: 0,
        cartaoPos: 0,
        outros: 0,
        suprimento: 0,
        sangria: 0,
        troco: 0,
        falta: 0,
        sobra: 0,
        valorTotal: 0,
      },
      resumoCobranca: [],
      totalCobranca: 0,
    };
  return a.jsxs("div", {
    className: "space-y-6 animate-fade-in",
    children: [
      a.jsxs("div", {
        className: "flex flex-wrap items-center justify-between gap-3",
        children: [
          a.jsxs("div", {
            children: [
              a.jsx("h1", {
                className: "text-2xl font-bold text-foreground",
                children: ie,
              }),
              a.jsx("p", {
                className: "mt-1 text-sm text-muted-foreground",
                children: te,
              }),
            ],
          }),
          a.jsxs("div", {
            className: "flex gap-2",
            children: [
              a.jsxs(t, {
                variant: "outline",
                onClick: () => {
                  (g.refetch(),
                    M.refetch(),
                    (n === "fechados" || n === "abertos") &&
                      meResumo.refetch());
                },
                children: [
                  a.jsx(De, { className: "mr-2 h-4 w-4" }),
                  "Atualizar",
                ],
              }),
              a.jsxs(t, {
                onClick: () => ca.mutate(),
                disabled: ca.isPending,
                children: [
                  a.jsx(Te, { className: "mr-2 h-4 w-4" }),
                  "Gerar snapshot",
                ],
              }),
            ],
          }),
        ],
      }),
      ((pa = (ja = M.data) == null ? void 0 : ja.integridadeDashboard) == null
        ? void 0
        : pa.ok) === false
        ? a.jsxs(ue, {
            variant: "destructive",
            children: [
              a.jsx(he, { className: "h-4 w-4" }),
              a.jsx(je, { children: "Erro de integridade" }),
              a.jsx(pe, {
                children:
                  "O total do dashboard nao bate com o detalhe. Investigacao obrigatoria.",
              }),
            ],
          })
        : null,
      n === "abertos"
        ? a.jsxs(c, {
            className: "border-border/70",
            children: [
              a.jsx(d, {
                children: a.jsx(x, {
                  className: "text-sm font-semibold",
                  children: "Resumo Acerto CX. Balcao (Aberto)",
                }),
              }),
              a.jsxs(h, {
                className: "space-y-4",
                children: [
                  a.jsxs("div", {
                    className: "rounded-md border border-border/60 bg-muted/20 p-3",
                    children: [
                      a.jsx("p", {
                        className: "mb-2 text-xs text-muted-foreground",
                        children: "Resumo aderente ao relatorio WinThor (caixa aberto sintetico).",
                      }),
                      a.jsxs("div", {
                        className: "grid gap-3 md:grid-cols-5",
                        children: [
                          a.jsxs("div", {
                            className: "space-y-1",
                            children: [
                              a.jsx(p, { children: "Modo de data" }),
                              a.jsxs(Ja, {
                                value: resumoModo,
                                onValueChange: (e) => setResumoModo(e),
                                children: [
                                  a.jsx(Za, { children: a.jsx($a, {}) }),
                                  a.jsxs(wa, {
                                    children: [
                                      a.jsx(Xa, {
                                        value: "DIA",
                                        children: "Dia",
                                      }),
                                      a.jsx(Xa, {
                                        value: "PERIODO",
                                        children: "Periodo",
                                      }),
                                    ],
                                  }),
                                ],
                              }),
                            ],
                          }),
                          resumoModo === "DIA"
                            ? a.jsxs("div", {
                                className: "space-y-1",
                                children: [
                                  a.jsx(p, { children: "Data" }),
                                  a.jsx(D, {
                                    type: "date",
                                    value: v,
                                    onChange: (e) => re(e.target.value),
                                  }),
                                ],
                              })
                            : null,
                          resumoModo === "PERIODO"
                            ? a.jsxs(a.Fragment, {
                                children: [
                                  a.jsxs("div", {
                                    className: "space-y-1",
                                    children: [
                                      a.jsx(p, { children: "Inicio" }),
                                      a.jsx(D, {
                                        type: "date",
                                        value: resumoDataInicio,
                                        onChange: (e) =>
                                          setResumoDataInicio(e.target.value),
                                      }),
                                    ],
                                  }),
                                  a.jsxs("div", {
                                    className: "space-y-1",
                                    children: [
                                      a.jsx(p, { children: "Fim" }),
                                      a.jsx(D, {
                                        type: "date",
                                        value: resumoDataFim,
                                        onChange: (e) =>
                                          setResumoDataFim(e.target.value),
                                      }),
                                    ],
                                  }),
                                ],
                              })
                            : null,
                          a.jsx("div", {
                            className: "space-y-1",
                            children: [
                              a.jsx(p, { children: "Filial (opcional)" }),
                              a.jsx(D, {
                                value: b,
                                onChange: (e) => U(e.target.value),
                                placeholder: "Todas",
                              }),
                            ],
                          }),
                          a.jsx("div", {
                            className: "flex items-end",
                            children: a.jsx(t, {
                              type: "button",
                              variant: "outline",
                              className: "w-full",
                              onClick: () => meResumo.refetch(),
                              children: "Atualizar resumo",
                            }),
                          }),
                        ],
                      }),
                    ],
                  }),
                  meResumo.isLoading
                    ? a.jsx("p", {
                        className: "text-sm text-muted-foreground",
                        children: "Carregando resumo de caixa aberto...",
                      })
                    : null,
                  meResumo.error
                    ? a.jsx("p", {
                        className: "text-sm text-destructive",
                        children: "Falha ao carregar resumo de caixa aberto.",
                      })
                    : a.jsxs(a.Fragment, {
                        children: [
                          a.jsxs("div", {
                            className: "overflow-x-auto",
                            children: [
                              a.jsxs(ve, {
                                children: [
                                  a.jsx(ge, {
                                    children: a.jsxs(G, {
                                      children: [
                                        a.jsx(j, { children: "Data" }),
                                        a.jsx(j, { children: "Dia Semana" }),
                                        a.jsx(j, {
                                          className: "text-right",
                                          children: "Qtde Tit.",
                                        }),
                                        a.jsx(j, {
                                          className: "text-right",
                                          children: "Venda Bruta",
                                        }),
                                        a.jsx(j, {
                                          className: "text-right",
                                          children: "Venda Liquida",
                                        }),
                                        a.jsx(j, {
                                          className: "text-right",
                                          children: "Dinheiro",
                                        }),
                                        a.jsx(j, {
                                          className: "text-right",
                                          children: "Cartao TEF",
                                        }),
                                        a.jsx(j, {
                                          className: "text-right",
                                          children: "Cartao POS",
                                        }),
                                        a.jsx(j, {
                                          className: "text-right",
                                          children: "Outros",
                                        }),
                                        a.jsx(j, {
                                          className: "text-right",
                                          children: "Valor Total",
                                        }),
                                      ],
                                    }),
                                  }),
                                  a.jsxs(fe, {
                                    children: [
                                      resumoFechamento.resumoDiario.map(
                                        (e, t2) =>
                                          a.jsxs(
                                            G,
                                            {
                                              children: [
                                                a.jsx(m, {
                                                  children: Ve(e.data),
                                                }),
                                                a.jsx(m, {
                                                  children: e.diaSemana ?? "",
                                                }),
                                                a.jsx(m, {
                                                  className: "text-right",
                                                  children: Qe(
                                                    e.qtdeTitulos ?? 0,
                                                  ),
                                                }),
                                                a.jsx(m, {
                                                  className: "text-right",
                                                  children: N(
                                                    e.vendaBruta ?? 0,
                                                  ),
                                                }),
                                                a.jsx(m, {
                                                  className: "text-right",
                                                  children: N(
                                                    e.vendaLiquida ?? 0,
                                                  ),
                                                }),
                                                a.jsx(m, {
                                                  className: "text-right",
                                                  children: N(
                                                    e.valorDinheiro ?? 0,
                                                  ),
                                                }),
                                                a.jsx(m, {
                                                  className: "text-right",
                                                  children: N(
                                                    e.cartaoTef ?? 0,
                                                  ),
                                                }),
                                                a.jsx(m, {
                                                  className: "text-right",
                                                  children: N(
                                                    e.cartaoPos ?? 0,
                                                  ),
                                                }),
                                                a.jsx(m, {
                                                  className: "text-right",
                                                  children: N(e.outros ?? 0),
                                                }),
                                                a.jsx(m, {
                                                  className:
                                                    "text-right font-semibold",
                                                  children: N(
                                                    e.valorTotal ?? 0,
                                                  ),
                                                }),
                                              ],
                                            },
                                            `resumo-aberto-dia-${t2}`,
                                          ),
                                      ),
                                      a.jsxs(G, {
                                        children: [
                                          a.jsx(m, {
                                            className: "font-semibold",
                                            children: "TOTAL",
                                          }),
                                          a.jsx(m, {}),
                                          a.jsx(m, {
                                            className:
                                              "text-right font-semibold",
                                            children: Qe(
                                              resumoFechamento.totais
                                                .qtdeTitulos ?? 0,
                                            ),
                                          }),
                                          a.jsx(m, {
                                            className:
                                              "text-right font-semibold",
                                            children: N(
                                              resumoFechamento.totais
                                                .vendaBruta ?? 0,
                                            ),
                                          }),
                                          a.jsx(m, {
                                            className:
                                              "text-right font-semibold",
                                            children: N(
                                              resumoFechamento.totais
                                                .vendaLiquida ?? 0,
                                            ),
                                          }),
                                          a.jsx(m, {
                                            className:
                                              "text-right font-semibold",
                                            children: N(
                                              resumoFechamento.totais
                                                .valorDinheiro ?? 0,
                                            ),
                                          }),
                                          a.jsx(m, {
                                            className:
                                              "text-right font-semibold",
                                            children: N(
                                              resumoFechamento.totais
                                                .cartaoTef ?? 0,
                                            ),
                                          }),
                                          a.jsx(m, {
                                            className:
                                              "text-right font-semibold",
                                            children: N(
                                              resumoFechamento.totais
                                                .cartaoPos ?? 0,
                                            ),
                                          }),
                                          a.jsx(m, {
                                            className:
                                              "text-right font-semibold",
                                            children: N(
                                              resumoFechamento.totais.outros ?? 0,
                                            ),
                                          }),
                                          a.jsx(m, {
                                            className:
                                              "text-right font-semibold",
                                            children: N(
                                              resumoFechamento.totais
                                                .valorTotal ?? 0,
                                            ),
                                          }),
                                        ],
                                      }),
                                    ],
                                  }),
                                ],
                              }),
                            ],
                          }),
                          a.jsxs("div", {
                            className: "overflow-x-auto",
                            children: [
                              a.jsxs(ve, {
                                children: [
                                  a.jsx(ge, {
                                    children: a.jsxs(G, {
                                      children: [
                                        a.jsx(j, { children: "Cod.Cob." }),
                                        a.jsx(j, { children: "Cobranca" }),
                                        a.jsx(j, { children: "Moeda" }),
                                        a.jsx(j, {
                                          className: "text-right",
                                          children: "Valor",
                                        }),
                                      ],
                                    }),
                                  }),
                                  a.jsxs(fe, {
                                    children: [
                                      resumoFechamento.resumoCobranca.map(
                                        (e, t2) =>
                                          a.jsxs(
                                            G,
                                            {
                                              children: [
                                                a.jsx(m, {
                                                  children: e.codCobranca,
                                                }),
                                                a.jsx(m, {
                                                  children: e.cobranca,
                                                }),
                                                a.jsx(m, {
                                                  children: e.moeda || "-",
                                                }),
                                                a.jsx(m, {
                                                  className: "text-right",
                                                  children: N(e.valor ?? 0),
                                                }),
                                              ],
                                            },
                                            `resumo-aberto-cob-${t2}`,
                                          ),
                                      ),
                                      a.jsxs(G, {
                                        children: [
                                          a.jsx(m, {
                                            className: "font-semibold",
                                            children: "TOTAL",
                                          }),
                                          a.jsx(m, {}),
                                          a.jsx(m, {}),
                                          a.jsx(m, {
                                            className:
                                              "text-right font-semibold",
                                            children: N(
                                              resumoFechamento.totalCobranca ??
                                                0,
                                            ),
                                          }),
                                        ],
                                      }),
                                    ],
                                  }),
                                ],
                              }),
                            ],
                          }),
                        ],
                      }),
                ],
              }),
            ],
          })
        : n === "fechados"
        ? a.jsxs(c, {
            className: "border-border/70",
            children: [
              a.jsx(d, {
                children: a.jsx(x, {
                  className: "text-sm font-semibold",
                  children: "Resumo Acerto CX. Balcao",
                }),
              }),
              a.jsxs(h, {
                className: "space-y-4",
                children: [
                  a.jsxs("div", {
                    className: "rounded-md border border-border/60 bg-muted/20 p-3",
                    children: [
                      a.jsx("p", {
                        className: "mb-2 text-xs text-muted-foreground",
                        children: "Resumo consolidado (filial nao aplicada).",
                      }),
                      a.jsxs("div", {
                        className: "grid gap-3 md:grid-cols-5",
                        children: [
                          a.jsxs("div", {
                            className: "space-y-1",
                            children: [
                              a.jsx(p, { children: "Modo de data" }),
                              a.jsxs(Ja, {
                                value: resumoModo,
                                onValueChange: (e) => setResumoModo(e),
                                children: [
                                  a.jsx(Za, { children: a.jsx($a, {}) }),
                                  a.jsxs(wa, {
                                    children: [
                                      a.jsx(Xa, {
                                        value: "DIA",
                                        children: "Dia",
                                      }),
                                      a.jsx(Xa, {
                                        value: "PERIODO",
                                        children: "Periodo",
                                      }),
                                    ],
                                  }),
                                ],
                              }),
                            ],
                          }),
                          resumoModo === "DIA"
                            ? a.jsxs("div", {
                                className: "space-y-1",
                                children: [
                                  a.jsx(p, { children: "Data" }),
                                  a.jsx(D, {
                                    type: "date",
                                    value: v,
                                    onChange: (e) => re(e.target.value),
                                  }),
                                ],
                              })
                            : null,
                          resumoModo === "PERIODO"
                            ? a.jsxs(a.Fragment, {
                                children: [
                                  a.jsxs("div", {
                                    className: "space-y-1",
                                    children: [
                                      a.jsx(p, { children: "Inicio" }),
                                      a.jsx(D, {
                                        type: "date",
                                        value: resumoDataInicio,
                                        onChange: (e) =>
                                          setResumoDataInicio(e.target.value),
                                      }),
                                    ],
                                  }),
                                  a.jsxs("div", {
                                    className: "space-y-1",
                                    children: [
                                      a.jsx(p, { children: "Fim" }),
                                      a.jsx(D, {
                                        type: "date",
                                        value: resumoDataFim,
                                        onChange: (e) =>
                                          setResumoDataFim(e.target.value),
                                      }),
                                    ],
                                  }),
                                ],
                              })
                            : null,
                          a.jsx("div", {
                            className: "flex items-end",
                            children: a.jsx(t, {
                              type: "button",
                              variant: "outline",
                              className: "w-full",
                              onClick: () => meResumo.refetch(),
                              children: "Atualizar resumo",
                            }),
                          }),
                        ],
                      }),
                    ],
                  }),
                  meResumo.isLoading
                    ? a.jsx("p", {
                        className: "text-sm text-muted-foreground",
                        children: "Carregando resumo de fechamento...",
                      })
                    : null,
                  meResumo.error
                    ? a.jsx("p", {
                        className: "text-sm text-destructive",
                        children: "Falha ao carregar resumo de fechamento.",
                      })
                    : a.jsxs(a.Fragment, {
                        children: [
                          a.jsxs("div", {
                            className: "overflow-x-auto",
                            children: [
                              a.jsxs(ve, {
                                children: [
                                  a.jsx(ge, {
                                    children: a.jsxs(G, {
                                      children: [
                                        a.jsx(j, { children: "Data" }),
                                        a.jsx(j, { children: "Dia Semana" }),
                                        a.jsx(j, {
                                          className: "text-right",
                                          children: "Valor em Dinheiro",
                                        }),
                                        a.jsx(j, {
                                          className: "text-right",
                                          children: "Suprimento",
                                        }),
                                        a.jsx(j, {
                                          className: "text-right",
                                          children: "Sangria",
                                        }),
                                        a.jsx(j, {
                                          className: "text-right",
                                          children: "Troco",
                                        }),
                                        a.jsx(j, {
                                          className: "text-right",
                                          children: "Falta",
                                        }),
                                        a.jsx(j, {
                                          className: "text-right",
                                          children: "Sobra",
                                        }),
                                        a.jsx(j, {
                                          className: "text-right",
                                          children: "Valor Total",
                                        }),
                                      ],
                                    }),
                                  }),
                                  a.jsxs(fe, {
                                    children: [
                                      resumoFechamento.resumoDiario.map(
                                        (e, t2) =>
                                          a.jsxs(
                                            G,
                                            {
                                              children: [
                                                a.jsx(m, {
                                                  children: Ve(e.data),
                                                }),
                                                a.jsx(m, {
                                                  children: e.diaSemana ?? "",
                                                }),
                                                a.jsx(m, {
                                                  className: "text-right",
                                                  children: N(
                                                    e.valorDinheiro ?? 0,
                                                  ),
                                                }),
                                                a.jsx(m, {
                                                  className: "text-right",
                                                  children: N(
                                                    e.suprimento ?? 0,
                                                  ),
                                                }),
                                                a.jsx(m, {
                                                  className: "text-right",
                                                  children: N(e.sangria ?? 0),
                                                }),
                                                a.jsx(m, {
                                                  className: "text-right",
                                                  children: N(e.troco ?? 0),
                                                }),
                                                a.jsx(m, {
                                                  className: "text-right",
                                                  children: N(e.falta ?? 0),
                                                }),
                                                a.jsx(m, {
                                                  className: "text-right",
                                                  children: N(e.sobra ?? 0),
                                                }),
                                                a.jsx(m, {
                                                  className:
                                                    "text-right font-semibold",
                                                  children: N(
                                                    e.valorTotal ?? 0,
                                                  ),
                                                }),
                                              ],
                                            },
                                            `resumo-dia-${t2}`,
                                          ),
                                      ),
                                      a.jsxs(G, {
                                        children: [
                                          a.jsx(m, {
                                            className: "font-semibold",
                                            children: "TOTAL",
                                          }),
                                          a.jsx(m, {}),
                                          a.jsx(m, {
                                            className:
                                              "text-right font-semibold",
                                            children: N(
                                              resumoFechamento.totais
                                                .valorDinheiro ?? 0,
                                            ),
                                          }),
                                          a.jsx(m, {
                                            className:
                                              "text-right font-semibold",
                                            children: N(
                                              resumoFechamento.totais
                                                .suprimento ?? 0,
                                            ),
                                          }),
                                          a.jsx(m, {
                                            className:
                                              "text-right font-semibold",
                                            children: N(
                                              resumoFechamento.totais.sangria ??
                                                0,
                                            ),
                                          }),
                                          a.jsx(m, {
                                            className:
                                              "text-right font-semibold",
                                            children: N(
                                              resumoFechamento.totais.troco ??
                                                0,
                                            ),
                                          }),
                                          a.jsx(m, {
                                            className:
                                              "text-right font-semibold",
                                            children: N(
                                              resumoFechamento.totais.falta ??
                                                0,
                                            ),
                                          }),
                                          a.jsx(m, {
                                            className:
                                              "text-right font-semibold",
                                            children: N(
                                              resumoFechamento.totais.sobra ??
                                                0,
                                            ),
                                          }),
                                          a.jsx(m, {
                                            className:
                                              "text-right font-semibold",
                                            children: N(
                                              resumoFechamento.totais
                                                .valorTotal ?? 0,
                                            ),
                                          }),
                                        ],
                                      }),
                                    ],
                                  }),
                                ],
                              }),
                            ],
                          }),
                          a.jsxs("div", {
                            className: "overflow-x-auto",
                            children: [
                              a.jsxs(ve, {
                                children: [
                                  a.jsx(ge, {
                                    children: a.jsxs(G, {
                                      children: [
                                        a.jsx(j, { children: "Cod.Cob." }),
                                        a.jsx(j, { children: "Cobranca" }),
                                        a.jsx(j, { children: "Moeda" }),
                                        a.jsx(j, {
                                          className: "text-right",
                                          children: "Valor",
                                        }),
                                      ],
                                    }),
                                  }),
                                  a.jsxs(fe, {
                                    children: [
                                      resumoFechamento.resumoCobranca.map(
                                        (e, t2) =>
                                          a.jsxs(
                                            G,
                                            {
                                              children: [
                                                a.jsx(m, {
                                                  children: e.codCobranca,
                                                }),
                                                a.jsx(m, {
                                                  children: e.cobranca,
                                                }),
                                                a.jsx(m, {
                                                  children: e.moeda || "-",
                                                }),
                                                a.jsx(m, {
                                                  className: "text-right",
                                                  children: N(e.valor ?? 0),
                                                }),
                                              ],
                                            },
                                            `resumo-cob-${t2}`,
                                          ),
                                      ),
                                      a.jsxs(G, {
                                        children: [
                                          a.jsx(m, {
                                            className: "font-semibold",
                                            children: "TOTAL",
                                          }),
                                          a.jsx(m, {}),
                                          a.jsx(m, {}),
                                          a.jsx(m, {
                                            className:
                                              "text-right font-semibold",
                                            children: N(
                                              resumoFechamento.totalCobranca ??
                                                0,
                                            ),
                                          }),
                                        ],
                                      }),
                                    ],
                                  }),
                                ],
                              }),
                            ],
                          }),
                        ],
                      }),
                ],
              }),
            ],
          })
        : null,
      a.jsxs(c, {
        className: "border-border/70",
        children: [
          a.jsx(d, {
            children: a.jsx(x, {
              className: "text-sm font-semibold",
              children: "Filtros de auditoria",
            }),
          }),
          a.jsx(h, {
            children: a.jsxs("form", {
              className: "grid gap-3 md:grid-cols-3 lg:grid-cols-6",
              onSubmit: oe,
              children: [
                a.jsxs("div", {
                  className: "space-y-1",
                  children: [
                    a.jsx(p, {
                      htmlFor: "movimento",
                      children: "Data movimento",
                    }),
                    a.jsx(D, {
                      id: "movimento",
                      type: "date",
                      value: v,
                      onChange: (e) => re(e.target.value),
                    }),
                  ],
                }),
                a.jsxs("div", {
                  className: "space-y-1",
                  children: [
                    a.jsx(p, { htmlFor: "filial", children: "Filial" }),
                    a.jsx(D, {
                      id: "filial",
                      value: b,
                      onChange: (e) => U(e.target.value),
                      placeholder: "Todas",
                    }),
                  ],
                }),
                a.jsxs("div", {
                  className: "space-y-1",
                  children: [
                    a.jsx(p, { children: "Status caixa" }),
                    a.jsxs(Ja, {
                      value: F,
                      onValueChange: (e) => _(e),
                      disabled: !!A,
                      children: [
                        a.jsx(Za, { children: a.jsx($a, {}) }),
                        a.jsx(wa, {
                          children: Re.map((e) =>
                            a.jsx(
                              Xa,
                              { value: e, children: e === "ALL" ? "Todos" : e },
                              e,
                            ),
                          ),
                        }),
                      ],
                    }),
                  ],
                }),
                a.jsxs("div", {
                  className: "space-y-1",
                  children: [
                    a.jsx(p, { children: "Risco" }),
                    a.jsxs(Ja, {
                      value: R,
                      onValueChange: (e) => J(e),
                      children: [
                        a.jsx(Za, { children: a.jsx($a, {}) }),
                        a.jsx(wa, {
                          children: ke.map((e) =>
                            a.jsx(
                              Xa,
                              { value: e, children: e === "ALL" ? "Todos" : e },
                              e,
                            ),
                          ),
                        }),
                      ],
                    }),
                  ],
                }),
                a.jsxs("div", {
                  className: "flex items-end gap-2 lg:col-span-2",
                  children: [
                    a.jsx(t, {
                      type: "submit",
                      className: "w-full",
                      children: "Filtrar",
                    }),
                    a.jsx(t, {
                      type: "button",
                      variant: "outline",
                      onClick: () => {
                        (U(""), _(A ?? "ALL"), J("ALL"), k(1));
                      },
                      children: "Limpar",
                    }),
                  ],
                }),
              ],
            }),
          }),
        ],
      }),
      a.jsxs("div", {
        className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-5",
        children: [
          a.jsxs(c, {
            className: "border-border/70",
            children: [
              a.jsx(d, {
                className: "pb-2",
                children: a.jsx(x, {
                  className:
                    "text-xs uppercase tracking-wide text-muted-foreground",
                  children: "Caixas",
                }),
              }),
              a.jsx(h, {
                children: a.jsx("p", {
                  className: "text-2xl font-semibold",
                  children: (r == null ? void 0 : r.caixas) ?? 0,
                }),
              }),
            ],
          }),
          a.jsxs(c, {
            className: "border-border/70",
            children: [
              a.jsx(d, {
                className: "pb-2",
                children: a.jsx(x, {
                  className:
                    "text-xs uppercase tracking-wide text-muted-foreground",
                  children: "Valor total WinThor",
                }),
              }),
              a.jsx(h, {
                children: a.jsx("p", {
                  className: "text-2xl font-semibold",
                  children: N(
                    (r == null ? void 0 : r.valorTotalFilialDia) ?? 0,
                  ),
                }),
              }),
            ],
          }),
          a.jsxs(c, {
            className: "border-border/70",
            children: [
              a.jsx(d, {
                className: "pb-2",
                children: a.jsx(x, {
                  className:
                    "text-xs uppercase tracking-wide text-muted-foreground",
                  children: "Diferenca final",
                }),
              }),
              a.jsx(h, {
                children: a.jsx("p", {
                  className: "text-2xl font-semibold",
                  children: N(
                    (r == null ? void 0 : r.totalDiferencaFinal) ?? 0,
                  ),
                }),
              }),
            ],
          }),
          a.jsxs(c, {
            className: "border-border/70",
            children: [
              a.jsx(d, {
                className: "pb-2",
                children: a.jsx(x, {
                  className:
                    "text-xs uppercase tracking-wide text-muted-foreground",
                  children: "Em divergencia",
                }),
              }),
              a.jsx(h, {
                children: a.jsx("p", {
                  className: "text-2xl font-semibold",
                  children: (r == null ? void 0 : r.emDivergencia) ?? 0,
                }),
              }),
            ],
          }),
          a.jsxs(c, {
            className: "border-border/70",
            children: [
              a.jsx(d, {
                className: "pb-2",
                children: a.jsx(x, {
                  className:
                    "text-xs uppercase tracking-wide text-muted-foreground",
                  children: "Risco critico",
                }),
              }),
              a.jsx(h, {
                children: a.jsx("p", {
                  className: "text-2xl font-semibold",
                  children: (r == null ? void 0 : r.riscoCritico) ?? 0,
                }),
              }),
            ],
          }),
        ],
      }),
      a.jsxs(c, {
        className: "border-border/70",
        children: [
          a.jsx(d, {
            children: a.jsx(x, {
              className: "text-sm font-semibold",
              children: "Caixas identificados",
            }),
          }),
          a.jsxs(h, {
            className: "overflow-x-auto",
            children: [
              a.jsxs(ve, {
                children: [
                  a.jsx(ge, {
                    children: a.jsxs(G, {
                      children: [
                        a.jsx(j, { children: "Filial" }),
                        a.jsx(j, { children: "Data" }),
                        a.jsx(j, { children: "Checkout" }),
                        n === "abertos"
                          ? a.jsx(j, { children: "Supervisor" })
                          : null,
                        n === "abertos"
                          ? a.jsx(j, { children: "Emitente" })
                          : null,
                        a.jsx(j, { children: "Operador" }),
                        n === "abertos"
                          ? a.jsx(j, {
                              className: "text-right",
                              children: "Qtde Tit.",
                            })
                          : null,
                        n === "abertos"
                          ? a.jsx(j, {
                              className: "text-right",
                              children: "Venda Liquida",
                            })
                          : null,
                        a.jsx(j, { children: "Status" }),
                        a.jsx(j, { children: "Risco" }),
                        a.jsx(j, {
                          className: "text-right",
                          children: "Esperado WinThor",
                        }),
                        a.jsx(j, {
                          className: "text-right",
                          children: "Auditado",
                        }),
                        a.jsx(j, {
                          className: "text-right",
                          children: "Dif. final",
                        }),
                        a.jsx(j, {
                          className: "text-right",
                          children: "Acoes",
                        }),
                      ],
                    }),
                  }),
                  a.jsxs(fe, {
                    children: [
                      ha.map((e) =>
                        a.jsxs(
                          G,
                          {
                            children: [
                              a.jsx(m, { children: e.codfilial }),
                              a.jsx(m, { children: Ve(e.dataMovimento) }),
                              a.jsx(m, { children: e.numcheckout }),
                              n === "abertos"
                                ? a.jsx(m, {
                                    children: e.supervisorPrincipal
                                      ? `${e.supervisorPrincipal}${(e.qtSupervisores ?? 0) > 1 ? ` (+${(e.qtSupervisores ?? 1) - 1})` : ""}`
                                      : "-",
                                  })
                                : null,
                              n === "abertos"
                                ? a.jsx(m, {
                                    children: e.emitentePrincipal
                                      ? `${e.emitentePrincipal}${(e.qtEmitentes ?? 0) > 1 ? ` (+${(e.qtEmitentes ?? 1) - 1})` : ""}`
                                      : "-",
                                  })
                                : null,
                              a.jsx(m, { children: e.codfunccheckout }),
                              n === "abertos"
                                ? a.jsx(m, {
                                    className: "text-right",
                                    children: Qe(e.qtdeTitulosWinthor ?? 0),
                                  })
                                : null,
                              n === "abertos"
                                ? a.jsx(m, {
                                    className: "text-right",
                                    children: N(e.vendaLiquidaWinthor ?? 0),
                                  })
                                : null,
                              a.jsx(m, {
                                children: a.jsx(W, {
                                  variant: se(e.statusCaixa),
                                  children: e.statusCaixa,
                                }),
                              }),
                              a.jsx(m, {
                                children: a.jsx(W, {
                                  variant: se(e.riscoNivel),
                                  children: e.riscoNivel,
                                }),
                              }),
                              a.jsx(m, {
                                className: "text-right",
                                children: N(e.valorEsperadoWinthor),
                              }),
                              a.jsx(m, {
                                className: "text-right",
                                children: N(e.valorAuditado ?? 0),
                              }),
                              a.jsx(m, {
                                className: "text-right",
                                children: N(e.diferencaFinal ?? 0),
                              }),
                              a.jsx(m, {
                                className: "text-right",
                                children: a.jsxs("div", {
                                  className: "flex justify-end gap-1",
                                  children: [
                                    a.jsx(t, {
                                      variant: "ghost",
                                      size: "sm",
                                      onClick: () => w(e),
                                      children: "Detalhe",
                                    }),
                                    a.jsx(t, {
                                      variant: "ghost",
                                      size: "sm",
                                      onClick: () => le.mutate(e.id),
                                      children: "Iniciar",
                                    }),
                                    a.jsx(t, {
                                      variant: "ghost",
                                      size: "sm",
                                      onClick: () => V(e.id),
                                      children: "Auditar",
                                    }),
                                    a.jsx(t, {
                                      variant: "ghost",
                                      size: "sm",
                                      onClick: () => P(e.id),
                                      children: "Acerto",
                                    }),
                                    a.jsx(t, {
                                      variant: "ghost",
                                      size: "sm",
                                      onClick: () => ne.mutate(e.id),
                                      children: "Comparar",
                                    }),
                                    a.jsx(t, {
                                      variant: "ghost",
                                      size: "sm",
                                      onClick: () => Y(e.id),
                                      children: a.jsx(Fe, {
                                        className: "h-4 w-4",
                                      }),
                                    }),
                                  ],
                                }),
                              }),
                            ],
                          },
                          e.id,
                        ),
                      ),
                      ha.length === 0
                        ? a.jsx(G, {
                            children: a.jsx(m, {
                              colSpan: 10,
                              className:
                                "py-10 text-center text-sm text-muted-foreground",
                              children:
                                "Nenhum caixa encontrado para os filtros atuais.",
                            }),
                          })
                        : null,
                    ],
                  }),
                ],
              }),
              a.jsxs("div", {
                className: "mt-4 flex items-center justify-between",
                children: [
                  a.jsxs("p", {
                    className: "text-xs text-muted-foreground",
                    children: [
                      "Pagina ",
                      ((va = g.data) == null ? void 0 : va.page) ?? 1,
                      " de ",
                      ((ga = g.data) == null ? void 0 : ga.totalPages) ?? 1,
                    ],
                  }),
                  a.jsxs("div", {
                    className: "flex gap-2",
                    children: [
                      a.jsx(t, {
                        variant: "outline",
                        size: "sm",
                        disabled:
                          (((fa = g.data) == null ? void 0 : fa.page) ?? 1) <=
                          1,
                        onClick: () => k((e) => Math.max(1, e - 1)),
                        children: "Anterior",
                      }),
                      a.jsx(t, {
                        variant: "outline",
                        size: "sm",
                        disabled:
                          (((Na = g.data) == null ? void 0 : Na.page) ?? 1) >=
                          (((Aa = g.data) == null ? void 0 : Aa.totalPages) ??
                            1),
                        onClick: () => k((e) => e + 1),
                        children: "Proxima",
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
      a.jsx(y, {
        open: !!u,
        onOpenChange: (e) => !e && w(null),
        children: a.jsxs(S, {
          className: "max-w-6xl",
          children: [
            a.jsx(I, {
              children: a.jsx(O, { children: "Detalhe do caixa auditavel" }),
            }),
            a.jsxs("div", {
              className: "grid gap-4 md:grid-cols-2 xl:grid-cols-4",
              children: [
                a.jsxs(c, {
                  children: [
                    a.jsx(d, {
                      className: "pb-2",
                      children: a.jsx(x, {
                        className: "text-xs",
                        children: "Resumo",
                      }),
                    }),
                    a.jsxs(h, {
                      className: "space-y-1 text-sm",
                      children: [
                        a.jsxs("p", {
                          children: [
                            "Status: ",
                            ((ba = l.data) == null
                              ? void 0
                              : ba.resumo.statusCaixa) ?? "-",
                          ],
                        }),
                        a.jsxs("p", {
                          children: [
                            "Filial: ",
                            ((Ca = l.data) == null
                              ? void 0
                              : Ca.resumo.codfilial) ?? "-",
                          ],
                        }),
                        a.jsxs("p", {
                          children: [
                            "Data: ",
                            Ve(
                              ((ya = l.data) == null
                                ? void 0
                                : ya.resumo.dataMovimento) ?? null,
                            ),
                          ],
                        }),
                        a.jsxs("p", {
                          children: [
                            "Esperado: ",
                            N(
                              ((Sa = l.data) == null
                                ? void 0
                                : Sa.resumo.valorEsperadoWinthor) ?? 0,
                            ),
                          ],
                        }),
                        a.jsxs("p", {
                          children: [
                            "Dif. final: ",
                            N(
                              ((Ia = l.data) == null
                                ? void 0
                                : Ia.resumo.diferencaFinal) ?? 0,
                            ),
                          ],
                        }),
                      ],
                    }),
                  ],
                }),
                a.jsxs(c, {
                  children: [
                    a.jsx(d, {
                      className: "pb-2",
                      children: a.jsx(x, {
                        className: "text-xs",
                        children: "Snapshot",
                      }),
                    }),
                    a.jsxs(h, {
                      className: "space-y-1 text-sm",
                      children: [
                        a.jsxs("p", {
                          children: [
                            "Linhas: ",
                            ((Oa = l.data) == null
                              ? void 0
                              : Oa.snapshot.length) ?? 0,
                          ],
                        }),
                        a.jsxs("p", {
                          children: [
                            "Versao atual: ",
                            ((Da =
                              (Ea = l.data) == null
                                ? void 0
                                : Ea.snapshot[0]) == null
                              ? void 0
                              : Da.snapshotVersion) ?? "-",
                          ],
                        }),
                        a.jsxs("p", {
                          children: [
                            "Snapshot id: ",
                            ((Fa =
                              (Ta = l.data) == null
                                ? void 0
                                : Ta.snapshot[0]) == null
                              ? void 0
                              : Fa.snapshotId) ?? "-",
                          ],
                        }),
                      ],
                    }),
                  ],
                }),
                a.jsxs(c, {
                  children: [
                    a.jsx(d, {
                      className: "pb-2",
                      children: a.jsx(x, {
                        className: "text-xs",
                        children: "Acertos",
                      }),
                    }),
                    a.jsxs(h, {
                      className: "space-y-1 text-sm",
                      children: [
                        a.jsxs("p", {
                          children: [
                            "Total: ",
                            ((Ra = l.data) == null
                              ? void 0
                              : Ra.acertos.length) ?? 0,
                          ],
                        }),
                        a.jsxs("p", {
                          children: [
                            "Em aprovacao: ",
                            (
                              ((ka = l.data) == null ? void 0 : ka.acertos) ??
                              []
                            ).filter((e) => e.status.includes("APROVACAO"))
                              .length,
                          ],
                        }),
                        a.jsxs("p", {
                          children: [
                            "Aprovados: ",
                            (
                              ((La = l.data) == null ? void 0 : La.acertos) ??
                              []
                            ).filter((e) => e.status === "ACERTO_APROVADO")
                              .length,
                          ],
                        }),
                      ],
                    }),
                  ],
                }),
                a.jsxs(c, {
                  children: [
                    a.jsx(d, {
                      className: "pb-2",
                      children: a.jsx(x, {
                        className: "text-xs",
                        children: "Ledger",
                      }),
                    }),
                    a.jsxs(h, {
                      className: "space-y-1 text-sm",
                      children: [
                        a.jsxs("p", {
                          children: [
                            "Eventos: ",
                            ((Va = l.data) == null
                              ? void 0
                              : Va.ledger.length) ?? 0,
                          ],
                        }),
                        a.jsxs("p", {
                          children: [
                            "Ultimo evento: ",
                            ((Ma =
                              (Pa = l.data) == null
                                ? void 0
                                : Pa.ledger.at(-1)) == null
                              ? void 0
                              : Ma.eventoTipo) ?? "-",
                          ],
                        }),
                        a.jsxs("p", {
                          children: [
                            "Criado em: ",
                            ee(
                              ((Ba =
                                (za = l.data) == null
                                  ? void 0
                                  : za.ledger.at(-1)) == null
                                ? void 0
                                : Ba.criadoEmUtc) ?? null,
                            ),
                          ],
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      }),
      a.jsx(y, {
        open: !!q,
        onOpenChange: (e) => !e && V(null),
        children: a.jsxs(S, {
          className: "max-w-xl",
          children: [
            a.jsx(I, {
              children: a.jsx(O, { children: "Finalizar auditoria" }),
            }),
            a.jsxs("div", {
              className: "space-y-3",
              children: [
                a.jsxs("div", {
                  className: "grid gap-3 md:grid-cols-2",
                  children: [
                    a.jsxs("div", {
                      className: "space-y-1",
                      children: [
                        a.jsx(p, {
                          htmlFor: "valor-informado",
                          children: "Valor informado operador",
                        }),
                        a.jsx(D, {
                          id: "valor-informado",
                          type: "number",
                          value: K,
                          onChange: (e) => aa(e.target.value),
                        }),
                      ],
                    }),
                    a.jsxs("div", {
                      className: "space-y-1",
                      children: [
                        a.jsx(p, {
                          htmlFor: "valor-auditado",
                          children: "Valor auditado",
                        }),
                        a.jsx(D, {
                          id: "valor-auditado",
                          type: "number",
                          value: ea,
                          onChange: (e) => sa(e.target.value),
                        }),
                      ],
                    }),
                  ],
                }),
                a.jsxs("div", {
                  className: "space-y-1",
                  children: [
                    a.jsx(p, { htmlFor: "audit-obs", children: "Observacao" }),
                    a.jsx(Ya, {
                      id: "audit-obs",
                      value: ia,
                      onChange: (e) => ta(e.target.value),
                    }),
                  ],
                }),
                a.jsxs("div", {
                  className: "flex justify-end gap-2",
                  children: [
                    a.jsx(t, {
                      variant: "outline",
                      onClick: () => V(null),
                      children: "Cancelar",
                    }),
                    a.jsxs(t, {
                      onClick: () => {
                        if (!q) return;
                        const e = Number(ea);
                        if (!Number.isFinite(e)) {
                          o({
                            title: "Valor invalido",
                            description: "Informe o valor auditado.",
                            variant: "destructive",
                          });
                          return;
                        }
                        const Ua = K.trim().length > 0 ? Number(K) : void 0;
                        da.mutate({
                          id: q,
                          valorInformadoOperador: Number.isFinite(Ua ?? NaN)
                            ? Ua
                            : void 0,
                          valorAuditado: e,
                          observacao: ia || void 0,
                        });
                      },
                      disabled: da.isPending,
                      children: [
                        a.jsx(me, { className: "mr-2 h-4 w-4" }),
                        "Confirmar",
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      }),
      a.jsx(y, {
        open: !!H,
        onOpenChange: (e) => !e && P(null),
        children: a.jsxs(S, {
          className: "max-w-xl",
          children: [
            a.jsx(I, { children: a.jsx(O, { children: "Solicitar acerto" }) }),
            a.jsxs("div", {
              className: "space-y-3",
              children: [
                a.jsxs("div", {
                  className: "space-y-1",
                  children: [
                    a.jsx(p, {
                      htmlFor: "valor-acerto",
                      children: "Valor do acerto",
                    }),
                    a.jsx(D, {
                      id: "valor-acerto",
                      type: "number",
                      value: ra,
                      onChange: (e) => la(e.target.value),
                    }),
                  ],
                }),
                a.jsxs("div", {
                  className: "space-y-1",
                  children: [
                    a.jsx(p, {
                      htmlFor: "justificativa-acerto",
                      children: "Justificativa",
                    }),
                    a.jsx(Ya, {
                      id: "justificativa-acerto",
                      value: Q,
                      onChange: (e) => na(e.target.value),
                    }),
                  ],
                }),
                a.jsxs("div", {
                  className: "flex justify-end gap-2",
                  children: [
                    a.jsx(t, {
                      variant: "outline",
                      onClick: () => P(null),
                      children: "Cancelar",
                    }),
                    a.jsx(t, {
                      onClick: () => {
                        if (!H) return;
                        const e = Number(ra);
                        if (!Number.isFinite(e)) {
                          o({
                            title: "Valor invalido",
                            description: "Informe o valor do acerto.",
                            variant: "destructive",
                          });
                          return;
                        }
                        if (!Q.trim()) {
                          o({
                            title: "Justificativa obrigatoria",
                            description: "Preencha a justificativa do acerto.",
                            variant: "destructive",
                          });
                          return;
                        }
                        xa.mutate({ id: H, valor: e, justificativa: Q.trim() });
                      },
                      disabled: xa.isPending,
                      children: "Solicitar",
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      }),
      a.jsx(y, {
        open: !!i,
        onOpenChange: (e) => !e && X(null),
        children: a.jsxs(S, {
          className: "max-w-2xl",
          children: [
            a.jsx(I, {
              children: a.jsx(O, {
                children: "Comparacao snapshot x WinThor atual",
              }),
            }),
            a.jsxs("div", {
              className: "space-y-2 text-sm",
              children: [
                a.jsxs("p", {
                  children: [
                    "Divergente: ",
                    a.jsx(W, {
                      variant:
                        i != null && i.divergente ? "destructive" : "default",
                      children: i != null && i.divergente ? "SIM" : "NAO",
                    }),
                  ],
                }),
                a.jsxs("p", {
                  children: [
                    "Removidas: ",
                    (i == null ? void 0 : i.resumo.removidas) ?? 0,
                  ],
                }),
                a.jsxs("p", {
                  children: [
                    "Adicionadas: ",
                    (i == null ? void 0 : i.resumo.adicionadas) ?? 0,
                  ],
                }),
                a.jsxs("p", {
                  children: [
                    "Alteradas: ",
                    (i == null ? void 0 : i.resumo.alteradas) ?? 0,
                  ],
                }),
              ],
            }),
          ],
        }),
      }),
      a.jsx(y, {
        open: !!L,
        onOpenChange: (e) => !e && Y(null),
        children: a.jsxs(S, {
          className: "max-w-2xl",
          children: [
            a.jsx(I, {
              children: a.jsx(O, { children: "Pacote de auditoria" }),
            }),
            C.isLoading
              ? a.jsx("p", {
                  className: "text-sm text-muted-foreground",
                  children: "Gerando pacote...",
                })
              : a.jsxs("div", {
                  className: "space-y-2 text-sm",
                  children: [
                    a.jsxs("p", {
                      children: [
                        "Pacote: ",
                        ((_a = C.data) == null ? void 0 : _a.pacoteId) ?? "-",
                      ],
                    }),
                    a.jsxs("p", {
                      children: [
                        "Gerado em: ",
                        ee(
                          ((qa = C.data) == null ? void 0 : qa.geradoEm) ??
                            null,
                        ),
                      ],
                    }),
                    a.jsxs("p", {
                      children: [
                        "Hash do manifesto: ",
                        ((Ha = C.data) == null ? void 0 : Ha.manifestoHash) ??
                          "-",
                      ],
                    }),
                    a.jsxs("p", {
                      children: [
                        "Eventos no ledger: ",
                        ((Qa =
                          (Ka = C.data) == null
                            ? void 0
                            : Ka.ledgerIntegrity) == null
                          ? void 0
                          : Qa.totalEventos) ?? 0,
                      ],
                    }),
                    a.jsxs("p", {
                      children: [
                        "Integridade hash chain: ",
                        (Ga =
                          (Wa = C.data) == null
                            ? void 0
                            : Wa.ledgerIntegrity) != null && Ga.integridade
                          ? "OK"
                          : "COM INCONSISTENCIAS",
                      ],
                    }),
                  ],
                }),
          ],
        }),
      }),
    ],
  });
};
export { Ye as default };
