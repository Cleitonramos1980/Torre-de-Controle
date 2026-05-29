import { r as React, j as jsxRuntime, J as Card, N as CardContent, B as Button } from "./index-Cw1PFMX8.js";

const h = jsxRuntime.jsx;
const hs = jsxRuntime.jsxs;

function getToken() { try { return JSON.parse(localStorage.getItem("sgq.authSession") || "{}").token || ""; } catch { return ""; } }
async function apiFetch(path, opts) {
    const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(opts?.headers || {}) } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || json?.message || `Erro ${res.status}`);
    return json;
}

function formatMoney(v) {
    const n = Number(v ?? 0);
    if (!Number.isFinite(n)) return "R$ 0,00";
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function navigate(path) { window.history.pushState({}, "", path); window.dispatchEvent(new PopStateEvent("popstate")); }

function KpiCard({ label, value, sub, color, onClick, warn }) {
    return h(Card, {
        style: { cursor: onClick ? "pointer" : "default", border: warn ? "2px solid #dc2626" : undefined },
        onClick,
        children: h(CardContent, {
            style: { padding: "16px 20px" },
            children: hs("div", {
                children: [
                    h("p", { style: { fontSize: "11px", color: "hsl(var(--muted-foreground))", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }, children: label }),
                    h("p", { style: { fontSize: "26px", fontWeight: 700, color: color || "hsl(var(--foreground))", lineHeight: 1 }, children: value ?? "—" }),
                    sub ? h("p", { style: { fontSize: "11px", color: "hsl(var(--muted-foreground))", marginTop: "4px" }, children: sub }) : null,
                ],
            }),
        }),
    });
}

function StatusBadge({ status }) {
    const map = {
        PLANEJADA: { bg: "#dbeafe", color: "#1e40af" },
        AGENDADA: { bg: "#ede9fe", color: "#6d28d9" },
        EM_ANDAMENTO: { bg: "#fef3c7", color: "#92400e" },
        PAUSADA: { bg: "#fee2e2", color: "#991b1b" },
        CONCLUIDA: { bg: "#dcfce7", color: "#166534" },
        CANCELADA: { bg: "#f3f4f6", color: "#6b7280" },
        RETRABALHO: { bg: "#ffe4e6", color: "#be123c" },
    };
    const s = map[status] || { bg: "#f3f4f6", color: "#374151" };
    return h("span", { style: { background: s.bg, color: s.color, padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700 }, children: status || "—" });
}

function PrioridadeBadge({ prioridade }) {
    const map = { P0: { bg: "#fee2e2", color: "#991b1b" }, P1: { bg: "#fef3c7", color: "#92400e" }, P2: { bg: "#dbeafe", color: "#1e40af" }, P3: { bg: "#dcfce7", color: "#166534" } };
    const s = map[prioridade] || { bg: "#f3f4f6", color: "#374151" };
    return h("span", { style: { background: s.bg, color: s.color, padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700 }, children: prioridade || "—" });
}

function SectionTitle({ children }) {
    return h("h2", {
        style: { fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "hsl(var(--muted-foreground))", margin: "0 0 10px 0" },
        children,
    });
}

function MiniBar({ label, value, max, color }) {
    const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
    return hs("div", {
        style: { marginBottom: "10px" },
        children: [
            hs("div", {
                style: { display: "flex", justifyContent: "space-between", fontSize: "12px", color: "hsl(var(--muted-foreground))", marginBottom: "4px" },
                children: [
                    h("span", { children: label }),
                    h("span", { style: { fontWeight: 600 }, children: String(value ?? 0) }),
                ],
            }),
            h("div", {
                style: { height: "6px", background: "hsl(var(--muted))", borderRadius: "3px", overflow: "hidden" },
                children: h("div", { style: { height: "100%", width: `${pct}%`, background: color || "#3b82f6", borderRadius: "3px", transition: "width .4s" } }),
            }),
        ],
    });
}

export default function EngenhariaDashboardPage() {
    const [dados, setDados] = React.useState(null);
    const [kpis, setKpis] = React.useState(null);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState("");
    const [periodo, setPeriodo] = React.useState(30);

    const carregar = React.useCallback(async () => {
        setErro("");
        try {
            const [d, k] = await Promise.all([
                apiFetch(`/api/engenharia/dashboard?dias=${periodo}`),
                apiFetch(`/api/engenharia/kpis?dias=${periodo}`).catch(() => ({})),
            ]);
            setDados(d);
            setKpis(k);
        } catch (e) {
            setErro(e.message || "Erro ao carregar dashboard de engenharia.");
        } finally {
            setLoading(false);
        }
    }, [periodo]);

    React.useEffect(() => { carregar(); const t = setInterval(carregar, 120000); return () => clearInterval(t); }, [carregar]);

    const kpiSol = dados?.kpiSolicitacoes || {};
    const kpiOs = dados?.kpiOs || {};
    const osStatus = dados?.osAbertasPorStatus || [];
    const solPrioridade = dados?.solicitacoesPorPrioridade || [];
    const estoqueCritico = dados?.estoqueCritico || [];
    const prevAtrasadas = dados?.preventivas_atrasadas || 0;

    const mttr = kpis?.mttr_horas;
    const taxaRetrab = kpis?.taxa_retrabalho;
    const taxaPrazo = kpis?.taxa_no_prazo;
    const custoTotal = kpis?.custo_total_realizado;
    const custoFilial = kpis?.custo_por_filial || [];
    const topAtivos = kpis?.top_ativos_problematicos || [];
    const maxCusto = custoFilial.reduce((m, r) => Math.max(m, Number(r.custo_total) || 0), 0);
    const maxOs = topAtivos.reduce((m, r) => Math.max(m, Number(r.total_os) || 0), 0);

    const fmtH = (v) => v != null ? `${Number(v).toFixed(1)} h` : "—";
    const fmtPct = (v) => v != null ? `${Number(v).toFixed(1)}%` : "—";

    return hs("div", {
        style: { padding: "24px", maxWidth: "1400px", margin: "0 auto" },
        children: [
            // Header
            hs("div", {
                style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px", flexWrap: "wrap", gap: "12px" },
                children: [
                    hs("div", {
                        children: [
                            h("h1", { style: { fontSize: "22px", fontWeight: 700, margin: "0 0 4px 0" }, children: "Engenharia & Facilities" }),
                            h("p", { style: { fontSize: "13px", color: "hsl(var(--muted-foreground))", margin: 0 }, children: "Dashboard operacional — Ordens de Serviço, Manutenção e Ativos" }),
                        ],
                    }),
                    hs("div", {
                        style: { display: "flex", gap: "8px", flexWrap: "wrap" },
                        children: [
                            ...[30, 60, 90].map(p => h("button", {
                                key: p,
                                onClick: () => setPeriodo(p),
                                style: { padding: "6px 12px", borderRadius: "6px", border: "1px solid hsl(var(--border))", cursor: "pointer", fontSize: "12px", background: periodo === p ? "hsl(var(--primary))" : "transparent", color: periodo === p ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))", fontWeight: periodo === p ? 700 : 400 },
                                children: `${p}d`,
                            })),
                            h(Button, { variant: "outline", style: { fontSize: "12px" }, onClick: carregar, children: "↻" }),
                            h(Button, { style: { fontSize: "12px", background: "#2563eb", color: "#fff", border: "none" }, onClick: () => navigate("/engenharia/solicitacoes"), children: "+ Solicitação" }),
                            h(Button, { style: { fontSize: "12px", background: "#16a34a", color: "#fff", border: "none" }, onClick: () => navigate("/engenharia/os"), children: "+ OS" }),
                        ],
                    }),
                ],
            }),

            // Alerta preventiva atrasada
            prevAtrasadas > 0 ? h("div", {
                style: { background: "#fef3c7", border: "1px solid #d97706", borderRadius: "8px", padding: "10px 16px", fontSize: "13px", color: "#92400e", marginBottom: "16px" },
                children: `⚠️ ${prevAtrasadas} plano(s) de manutenção preventiva com data vencida. Acesse Manutenção Preventiva para verificar.`,
            }) : null,

            erro ? h("div", { style: { background: "#fee2e2", color: "#991b1b", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }, children: erro }) : null,

            loading ? h("p", { style: { color: "hsl(var(--muted-foreground))", fontSize: "14px" }, children: "Carregando dashboard..." }) : hs("div", {
                style: { display: "flex", flexDirection: "column", gap: "24px" },
                children: [
                    // KPIs de qualidade (MTTR, retrabalho, SLA, custo)
                    hs("div", {
                        children: [
                            h(SectionTitle, { children: `Indicadores de Desempenho — ${periodo} dias` }),
                            h("div", {
                                style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px" },
                                children: [
                                    h(KpiCard, { label: "MTTR", value: fmtH(mttr), sub: "tempo médio de reparo", color: "#0891b2" }),
                                    h(KpiCard, { label: "Retrabalho", value: fmtPct(taxaRetrab), sub: `${kpis?.os_retrabalho ?? "—"} de ${kpis?.os_concluidas ?? "—"} OS`, color: taxaRetrab > 10 ? "#dc2626" : "#16a34a", warn: taxaRetrab > 10 }),
                                    h(KpiCard, { label: "OS no Prazo", value: fmtPct(taxaPrazo), sub: `${kpis?.os_no_prazo ?? "—"} de ${kpis?.os_com_prazo ?? "—"} c/ prazo`, color: taxaPrazo < 80 ? "#dc2626" : taxaPrazo < 90 ? "#d97706" : "#16a34a", warn: taxaPrazo < 80 }),
                                    h(KpiCard, { label: "Custo Realizado", value: formatMoney(custoTotal), sub: "OS concluídas no período" }),
                                ],
                            }),
                        ],
                    }),

                    // KPIs Solicitações
                    hs("div", {
                        children: [
                            h(SectionTitle, { children: "Solicitações" }),
                            h("div", {
                                style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(145px, 1fr))", gap: "12px" },
                                children: [
                                    h(KpiCard, { label: "Total", value: kpiSol.TOTAL, onClick: () => navigate("/engenharia/solicitacoes") }),
                                    h(KpiCard, { label: "Abertas", value: kpiSol.ABERTAS, color: "#d97706", onClick: () => navigate("/engenharia/solicitacoes?status=ABERTA") }),
                                    h(KpiCard, { label: "Em Triagem", value: kpiSol.EM_TRIAGEM, color: "#2563eb" }),
                                    h(KpiCard, { label: "Concluídas", value: kpiSol.CONCLUIDAS, color: "#16a34a" }),
                                    h(KpiCard, { label: "Críticas (P0/P1)", value: kpiSol.CRITICAS, color: kpiSol.CRITICAS > 0 ? "#dc2626" : undefined, warn: kpiSol.CRITICAS > 0 }),
                                ],
                            }),
                        ],
                    }),

                    // KPIs OS
                    hs("div", {
                        children: [
                            h(SectionTitle, { children: "Ordens de Serviço" }),
                            h("div", {
                                style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(145px, 1fr))", gap: "12px" },
                                children: [
                                    h(KpiCard, { label: "Total OS Ativas", value: kpiOs.TOTAL, onClick: () => navigate("/engenharia/os") }),
                                    h(KpiCard, { label: "Planejadas", value: kpiOs.PLANEJADAS, color: "#6d28d9" }),
                                    h(KpiCard, { label: "Em Andamento", value: kpiOs.EM_ANDAMENTO, color: "#d97706" }),
                                    h(KpiCard, { label: "Concluídas Hoje", value: kpiOs.CONCLUIDAS_HOJE, color: "#16a34a" }),
                                    h(KpiCard, { label: "Atrasadas", value: kpiOs.ATRASADAS, color: kpiOs.ATRASADAS > 0 ? "#dc2626" : undefined, warn: kpiOs.ATRASADAS > 0 }),
                                    h(KpiCard, { label: "Custo Realizado", value: formatMoney(kpiOs.CUSTO_MES), sub: "ordens ativas" }),
                                ],
                            }),
                        ],
                    }),

                    // Rankings e distribuições
                    hs("div", {
                        style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" },
                        children: [
                            // OS por Status
                            hs("div", {
                                children: [
                                    h(SectionTitle, { children: "OS por Status" }),
                                    h(Card, {
                                        children: h(CardContent, {
                                            style: { padding: "16px" },
                                            children: osStatus.length === 0
                                                ? h("p", { style: { fontSize: "13px", color: "hsl(var(--muted-foreground))" }, children: "Nenhuma OS cadastrada." })
                                                : h("div", {
                                                    style: { display: "flex", flexDirection: "column", gap: "8px" },
                                                    children: osStatus.map((s, i) => hs("div", {
                                                        key: s.STATUS || i,
                                                        style: { display: "flex", justifyContent: "space-between", alignItems: "center" },
                                                        children: [h(StatusBadge, { status: s.STATUS }), h("span", { style: { fontWeight: 700, fontSize: "14px" }, children: s.QTD })],
                                                    })),
                                                }),
                                        }),
                                    }),
                                ],
                            }),

                            // Sol por Prioridade
                            hs("div", {
                                children: [
                                    h(SectionTitle, { children: "Solicitações Abertas por Prioridade" }),
                                    h(Card, {
                                        children: h(CardContent, {
                                            style: { padding: "16px" },
                                            children: solPrioridade.length === 0
                                                ? h("p", { style: { fontSize: "13px", color: "hsl(var(--muted-foreground))" }, children: "Nenhuma solicitação aberta." })
                                                : h("div", {
                                                    style: { display: "flex", flexDirection: "column", gap: "8px" },
                                                    children: solPrioridade.map((p, i) => hs("div", {
                                                        key: p.PRIORIDADE || i,
                                                        style: { display: "flex", justifyContent: "space-between", alignItems: "center" },
                                                        children: [h(PrioridadeBadge, { prioridade: p.PRIORIDADE }), h("span", { style: { fontWeight: 700, fontSize: "14px" }, children: p.QTD })],
                                                    })),
                                                }),
                                        }),
                                    }),
                                ],
                            }),
                        ],
                    }),

                    // Custo por filial e top ativos
                    (custoFilial.length > 0 || topAtivos.length > 0) ? hs("div", {
                        style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" },
                        children: [
                            custoFilial.length > 0 ? hs("div", {
                                children: [
                                    h(SectionTitle, { children: "Custo Realizado por Filial (Top 10)" }),
                                    h(Card, {
                                        children: h(CardContent, {
                                            style: { padding: "16px" },
                                            children: custoFilial.slice(0, 10).map((r, i) =>
                                                h(MiniBar, {
                                                    key: r.codfilial || i,
                                                    label: `${r.codfilial} ${r.nome_filial ? "— " + r.nome_filial : ""}`,
                                                    value: Number(r.custo_total || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
                                                    max: maxCusto,
                                                    color: "#f59e0b",
                                                })
                                            ),
                                        }),
                                    }),
                                ],
                            }) : null,

                            topAtivos.length > 0 ? hs("div", {
                                children: [
                                    h(SectionTitle, { children: "Ativos com Mais OS (Top 8)" }),
                                    h(Card, {
                                        children: h(CardContent, {
                                            style: { padding: "16px" },
                                            children: topAtivos.slice(0, 8).map((r, i) =>
                                                h(MiniBar, {
                                                    key: r.ativo_id || r.ativo_nome || i,
                                                    label: r.ativo_nome || "(sem ativo)",
                                                    value: r.total_os || 0,
                                                    max: maxOs,
                                                    color: "#ef4444",
                                                })
                                            ),
                                        }),
                                    }),
                                ],
                            }) : null,
                        ],
                    }) : null,

                    // Estoque crítico
                    estoqueCritico.length > 0 ? hs("div", {
                        children: [
                            h(SectionTitle, { children: "Estoque Crítico — Itens Abaixo do Mínimo" }),
                            h(Card, {
                                children: h(CardContent, {
                                    style: { padding: "0" },
                                    children: h("div", {
                                        style: { overflowX: "auto" },
                                        children: h("table", {
                                            style: { width: "100%", borderCollapse: "collapse", fontSize: "13px" },
                                            children: [
                                                h("thead", {
                                                    children: h("tr", {
                                                        style: { borderBottom: "1px solid hsl(var(--border))", background: "hsl(var(--muted))" },
                                                        children: [
                                                            h("th", { style: { padding: "10px 14px", textAlign: "left", fontWeight: 600, fontSize: "12px", color: "hsl(var(--muted-foreground))" }, children: "Item" }),
                                                            h("th", { style: { padding: "10px 14px", textAlign: "right", fontWeight: 600, fontSize: "12px", color: "hsl(var(--muted-foreground))" }, children: "Atual" }),
                                                            h("th", { style: { padding: "10px 14px", textAlign: "right", fontWeight: 600, fontSize: "12px", color: "hsl(var(--muted-foreground))" }, children: "Mínimo" }),
                                                            h("th", { style: { padding: "10px 14px", textAlign: "center", fontWeight: 600, fontSize: "12px", color: "hsl(var(--muted-foreground))" }, children: "Un." }),
                                                        ],
                                                    }),
                                                }),
                                                h("tbody", {
                                                    children: estoqueCritico.map((item, i) => h("tr", {
                                                        key: item.ID || i,
                                                        style: { borderBottom: "1px solid hsl(var(--border))" },
                                                        children: [
                                                            h("td", { style: { padding: "10px 14px", fontWeight: 500 }, children: item.DESCRICAO }),
                                                            h("td", { style: { padding: "10px 14px", textAlign: "right", color: "#dc2626", fontWeight: 700 }, children: item.QTD_ATUAL }),
                                                            h("td", { style: { padding: "10px 14px", textAlign: "right" }, children: item.QTD_MINIMA }),
                                                            h("td", { style: { padding: "10px 14px", textAlign: "center", color: "hsl(var(--muted-foreground))" }, children: item.UNIDADE }),
                                                        ],
                                                    })),
                                                }),
                                            ],
                                        }),
                                    }),
                                }),
                            }),
                            h("div", { style: { marginTop: "8px", textAlign: "right" }, children: h(Button, { variant: "outline", style: { fontSize: "12px" }, onClick: () => navigate("/engenharia/estoque"), children: "Ver Estoque Completo →" }) }),
                        ],
                    }) : null,

                    // Acesso rápido
                    hs("div", {
                        children: [
                            h(SectionTitle, { children: "Acesso Rápido" }),
                            h("div", {
                                style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px" },
                                children: [
                                    h(Card, { style: { cursor: "pointer" }, onClick: () => navigate("/engenharia/os"), children: h(CardContent, { style: { padding: "16px", textAlign: "center" }, children: hs("div", { children: [h("div", { style: { fontSize: "24px", marginBottom: "8px" }, children: "🔧" }), h("p", { style: { fontWeight: 600, fontSize: "13px" }, children: "Ordens de Serviço" })] }) }) }),
                                    h(Card, { style: { cursor: "pointer" }, onClick: () => navigate("/engenharia/solicitacoes"), children: h(CardContent, { style: { padding: "16px", textAlign: "center" }, children: hs("div", { children: [h("div", { style: { fontSize: "24px", marginBottom: "8px" }, children: "📋" }), h("p", { style: { fontWeight: 600, fontSize: "13px" }, children: "Solicitações" })] }) }) }),
                                    h(Card, { style: { cursor: "pointer" }, onClick: () => navigate("/engenharia/ativos"), children: h(CardContent, { style: { padding: "16px", textAlign: "center" }, children: hs("div", { children: [h("div", { style: { fontSize: "24px", marginBottom: "8px" }, children: "🏗️" }), h("p", { style: { fontWeight: 600, fontSize: "13px" }, children: "Ativos / Equipamentos" })] }) }) }),
                                    h(Card, { style: { cursor: "pointer" }, onClick: () => navigate("/engenharia/estoque"), children: h(CardContent, { style: { padding: "16px", textAlign: "center" }, children: hs("div", { children: [h("div", { style: { fontSize: "24px", marginBottom: "8px" }, children: "📦" }), h("p", { style: { fontWeight: 600, fontSize: "13px" }, children: "Estoque Eng." })] }) }) }),
                                    h(Card, { style: { cursor: "pointer" }, onClick: () => navigate("/engenharia/preventiva"), children: h(CardContent, { style: { padding: "16px", textAlign: "center" }, children: hs("div", { children: [h("div", { style: { fontSize: "24px", marginBottom: "8px" }, children: "🔄" }), h("p", { style: { fontWeight: 600, fontSize: "13px" }, children: "Manutenção Preventiva" })] }) }) }),
                                    h(Card, { style: { cursor: "pointer" }, onClick: () => navigate("/engenharia/prestadores"), children: h(CardContent, { style: { padding: "16px", textAlign: "center" }, children: hs("div", { children: [h("div", { style: { fontSize: "24px", marginBottom: "8px" }, children: "🤝" }), h("p", { style: { fontWeight: 600, fontSize: "13px" }, children: "Prestadores" })] }) }) }),
                                    h(Card, { style: { cursor: "pointer" }, onClick: () => navigate("/engenharia/relatorios"), children: h(CardContent, { style: { padding: "16px", textAlign: "center" }, children: hs("div", { children: [h("div", { style: { fontSize: "24px", marginBottom: "8px" }, children: "📊" }), h("p", { style: { fontWeight: 600, fontSize: "13px" }, children: "Relatórios" })] }) }) }),
                                ],
                            }),
                        ],
                    }),
                ],
            }),
        ],
    });
}
