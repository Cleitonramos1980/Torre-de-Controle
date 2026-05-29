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

function formatMoney(value) {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed)) return "R$ 0,00";
    return parsed.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value) {
    if (!value) return "-";
    const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleDateString("pt-BR");
}

function formatDateTime(value) {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString("pt-BR");
}

function buildQuery(params) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value == null) return;
        if (typeof value === "string" && !value.trim()) return;
        query.set(key, String(value));
    });
    const s = query.toString();
    return s ? `?${s}` : "";
}

function riscoBadge(risco) {
    const map = {
        CRITICO: { background: "#fee2e2", color: "#991b1b" },
        ALTO: { background: "#fef3c7", color: "#92400e" },
        MEDIO: { background: "#dbeafe", color: "#1e40af" },
        BAIXO: { background: "#dcfce7", color: "#166534" },
    };
    const s = map[risco] || map.BAIXO;
    return h("span", {
        style: { ...s, padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700 },
        children: risco || "—",
    });
}

function scoreColor(score) {
    const n = Number(score ?? 0);
    if (n >= 76) return "#dc2626";
    if (n >= 51) return "#d97706";
    if (n >= 26) return "#2563eb";
    return "#16a34a";
}

function KpiCard({ label, value, sub, color }) {
    return h(Card, {
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

function SectionTitle({ children }) {
    return h("h2", {
        style: { fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "hsl(var(--muted-foreground))", margin: "0 0 10px 0" },
        children,
    });
}

export default function FiscalDashboardPage() {
    const [dados, setDados] = React.useState(null);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState("");
    const [info, setInfo] = React.useState("");
    const [sincronizando, setSincronizando] = React.useState("");
    const [lastUpdate, setLastUpdate] = React.useState(null);
    const [dataInicio, setDataInicio] = React.useState("");
    const [dataFim, setDataFim] = React.useState("");

    const carregar = React.useCallback(async (filtros) => {
        setErro("");
        try {
            const q = buildQuery(filtros || {});
            const d = await apiFetch(`/api/fiscal/dashboard${q}`);
            setDados(d);
            setLastUpdate(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
        } catch (e) {
            setErro(e.message || "Erro ao carregar dashboard fiscal.");
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        carregar();
        const t = setInterval(() => carregar(), 60000);
        return () => clearInterval(t);
    }, [carregar]);

    const filtrar = () => carregar({ dataInicio, dataFim });

    const sincronizar = async (tipo) => {
        setSincronizando(tipo); setErro(""); setInfo("");
        try {
            const result = await apiFetch(`/api/fiscal/sync/${tipo}`, { method: "POST", body: JSON.stringify({}) });
            setInfo(result?.mensagem || "Sincronização concluída.");
            await carregar({ dataInicio, dataFim });
        } catch (e) {
            setErro(e.message || "Erro ao sincronizar.");
        } finally {
            setSincronizando("");
        }
    };

    const kpis = dados?.kpis || {};
    const documentosCriticos = dados?.documentosCriticos || [];
    const evolucao7Dias = dados?.evolucao7Dias || [];
    const ultimasSincronizacoes = dados?.ultimasSincronizacoes || [];

    return hs("div", {
        style: { padding: "24px", maxWidth: "1400px", margin: "0 auto" },
        children: [
            // Header
            hs("div", {
                style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px", flexWrap: "wrap", gap: "12px" },
                children: [
                    hs("div", {
                        children: [
                            h("h1", { style: { fontSize: "22px", fontWeight: 700, margin: "0 0 4px 0" }, children: "Dashboard Fiscal Executivo" }),
                            h("p", { style: { fontSize: "13px", color: "hsl(var(--muted-foreground))", margin: 0 }, children: "Monitoramento de NF-e e CT-e em tempo real" }),
                        ],
                    }),
                    hs("div", {
                        style: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" },
                        children: [
                            h("span", { style: { fontSize: "11px", color: "hsl(var(--muted-foreground))" }, children: lastUpdate ? `Atualizado às ${lastUpdate}` : "" }),
                            h(Button, { variant: "outline", style: { fontSize: "12px" }, onClick: () => carregar({ dataInicio, dataFim }), children: "↻ Atualizar" }),
                            h(Button, {
                                variant: "outline",
                                style: { fontSize: "12px" },
                                disabled: sincronizando === "nfe",
                                onClick: () => sincronizar("nfe"),
                                children: sincronizando === "nfe" ? "Sincronizando..." : "Sincronizar NF-e",
                            }),
                            h(Button, {
                                variant: "outline",
                                style: { fontSize: "12px" },
                                disabled: sincronizando === "cte",
                                onClick: () => sincronizar("cte"),
                                children: sincronizando === "cte" ? "Sincronizando..." : "Sincronizar CT-e",
                            }),
                        ],
                    }),
                ],
            }),

            // Filtro período
            h(Card, {
                style: { marginBottom: "20px" },
                children: h(CardContent, {
                    style: { padding: "12px 20px" },
                    children: hs("div", {
                        style: { display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" },
                        children: [
                            h("label", { style: { fontSize: "13px", fontWeight: 600 }, children: "Período:" }),
                            h("input", {
                                type: "date",
                                value: dataInicio,
                                onChange: (e) => setDataInicio(e.target.value),
                                style: { padding: "6px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px" },
                            }),
                            h("span", { style: { fontSize: "13px" }, children: "até" }),
                            h("input", {
                                type: "date",
                                value: dataFim,
                                onChange: (e) => setDataFim(e.target.value),
                                style: { padding: "6px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px" },
                            }),
                            h(Button, { onClick: filtrar, style: { fontSize: "13px" }, children: "Filtrar" }),
                        ],
                    }),
                }),
            }),

            erro ? h("div", {
                style: { background: "#fee2e2", color: "#991b1b", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" },
                children: erro,
            }) : null,
            info ? h("div", {
                style: { background: "#dbeafe", color: "#1e40af", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" },
                children: [info, h("span", { style: { cursor: "pointer", fontWeight: 700 }, onClick: () => setInfo(""), children: "×" })],
            }) : null,

            loading ? h("p", { style: { color: "hsl(var(--muted-foreground))", fontSize: "14px" }, children: "Carregando dashboard fiscal..." }) : hs("div", {
                style: { display: "flex", flexDirection: "column", gap: "24px" },
                children: [
                    // KPIs NF-e
                    hs("div", {
                        children: [
                            h(SectionTitle, { children: "NF-e" }),
                            h("div", {
                                style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px" },
                                children: [
                                    h(KpiCard, { label: "NF-e Hoje", value: kpis.nfeHoje, color: "#2563eb" }),
                                    h(KpiCard, { label: "Valor NF-e", value: formatMoney(kpis.valorNfe) }),
                                    h(KpiCard, { label: "Sem WinThor", value: kpis.semWinthor, color: kpis.semWinthor > 0 ? "#d97706" : undefined }),
                                    h(KpiCard, { label: "Pendentes Manifestação", value: kpis.pendentesManifestaçao || kpis.pendentesManifestaçao || kpis.pendentesManifestacao, color: kpis.pendentesManifestacao > 0 ? "#dc2626" : undefined }),
                                    h(KpiCard, { label: "Cancelados", value: kpis.cancelados }),
                                    h(KpiCard, { label: "Divergências Críticas", value: kpis.divergenciasCriticas, color: kpis.divergenciasCriticas > 0 ? "#dc2626" : undefined }),
                                    h(KpiCard, { label: "Sem Pedido", value: kpis.semPedido, color: kpis.semPedido > 0 ? "#d97706" : undefined }),
                                ],
                            }),
                        ],
                    }),

                    // KPIs CT-e
                    hs("div", {
                        children: [
                            h(SectionTitle, { children: "CT-e" }),
                            h("div", {
                                style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px" },
                                children: [
                                    h(KpiCard, { label: "CT-e Hoje", value: kpis.cteHoje, color: "#2563eb" }),
                                    h(KpiCard, { label: "Valor CT-e", value: formatMoney(kpis.valorCte) }),
                                ],
                            }),
                        ],
                    }),

                    // KPIs gerais
                    hs("div", {
                        children: [
                            h(SectionTitle, { children: "Indicadores Gerais" }),
                            h("div", {
                                style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px" },
                                children: [
                                    h(KpiCard, { label: "Cert. Vencendo", value: kpis.certificadosVencendo, color: kpis.certificadosVencendo > 0 ? "#dc2626" : undefined }),
                                    h(KpiCard, {
                                        label: "Score Fiscal",
                                        value: kpis.scoreFiscal != null ? `${kpis.scoreFiscal}` : "—",
                                        color: scoreColor(kpis.scoreFiscal),
                                        sub: "0=ótimo / 100=crítico",
                                    }),
                                ],
                            }),
                        ],
                    }),

                    // Top 10 documentos críticos
                    hs("div", {
                        children: [
                            h(SectionTitle, { children: "Top 10 Documentos Críticos" }),
                            h(Card, {
                                children: h(CardContent, {
                                    style: { padding: "0" },
                                    children: documentosCriticos.length === 0
                                        ? h("p", { style: { padding: "20px", fontSize: "13px", color: "hsl(var(--muted-foreground))" }, children: "Nenhum documento crítico encontrado." })
                                        : h("div", {
                                            style: { overflowX: "auto" },
                                            children: h("table", {
                                                style: { width: "100%", borderCollapse: "collapse", fontSize: "13px" },
                                                children: [
                                                    h("thead", {
                                                        children: h("tr", {
                                                            style: { borderBottom: "1px solid #e5e7eb", background: "#f9fafb" },
                                                            children: [
                                                                h("th", { style: { padding: "10px 14px", textAlign: "left", fontWeight: 600, fontSize: "12px", color: "#6b7280", whiteSpace: "nowrap" }, children: "Chave" }),
                                                                h("th", { style: { padding: "10px 14px", textAlign: "left", fontWeight: 600, fontSize: "12px", color: "#6b7280", whiteSpace: "nowrap" }, children: "Tipo" }),
                                                                h("th", { style: { padding: "10px 14px", textAlign: "left", fontWeight: 600, fontSize: "12px", color: "#6b7280", whiteSpace: "nowrap" }, children: "Emitente" }),
                                                                h("th", { style: { padding: "10px 14px", textAlign: "right", fontWeight: 600, fontSize: "12px", color: "#6b7280", whiteSpace: "nowrap" }, children: "Valor" }),
                                                                h("th", { style: { padding: "10px 14px", textAlign: "center", fontWeight: 600, fontSize: "12px", color: "#6b7280", whiteSpace: "nowrap" }, children: "Score" }),
                                                                h("th", { style: { padding: "10px 14px", textAlign: "center", fontWeight: 600, fontSize: "12px", color: "#6b7280", whiteSpace: "nowrap" }, children: "Risco" }),
                                                            ],
                                                        }),
                                                    }),
                                                    h("tbody", {
                                                        children: documentosCriticos.map((doc, i) => h("tr", {
                                                            key: doc.chave || i,
                                                            style: { borderBottom: "1px solid #f3f4f6", verticalAlign: "middle" },
                                                            children: [
                                                                h("td", { style: { padding: "10px 14px", fontFamily: "monospace", fontSize: "11px", verticalAlign: "middle" }, children: doc.chave ? `${doc.chave.slice(0, 12)}...` : "—" }),
                                                                h("td", { style: { padding: "10px 14px", verticalAlign: "middle" }, children: doc.tipo || "—" }),
                                                                h("td", { style: { padding: "10px 14px", verticalAlign: "middle" }, children: doc.emitente || "—" }),
                                                                h("td", { style: { padding: "10px 14px", textAlign: "right", verticalAlign: "middle" }, children: formatMoney(doc.valor) }),
                                                                h("td", { style: { padding: "10px 14px", textAlign: "center", color: scoreColor(doc.score), fontWeight: 700, verticalAlign: "middle" }, children: doc.score ?? "—" }),
                                                                h("td", { style: { padding: "10px 14px", textAlign: "center", verticalAlign: "middle" }, children: riscoBadge(doc.risco) }),
                                                            ],
                                                        })),
                                                    }),
                                                ],
                                            }),
                                        }),
                                }),
                            }),
                        ],
                    }),

                    // Evolução 7 dias
                    evolucao7Dias.length > 0 ? hs("div", {
                        children: [
                            h(SectionTitle, { children: "Evolução — Últimos 7 Dias" }),
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
                                                        style: { borderBottom: "1px solid #e5e7eb", background: "#f9fafb" },
                                                        children: [
                                                            h("th", { style: { padding: "10px 14px", textAlign: "left", fontWeight: 600, fontSize: "12px", color: "#6b7280", whiteSpace: "nowrap" }, children: "Data" }),
                                                            h("th", { style: { padding: "10px 14px", textAlign: "right", fontWeight: 600, fontSize: "12px", color: "#6b7280", whiteSpace: "nowrap" }, children: "NF-e" }),
                                                            h("th", { style: { padding: "10px 14px", textAlign: "right", fontWeight: 600, fontSize: "12px", color: "#6b7280", whiteSpace: "nowrap" }, children: "CT-e" }),
                                                            h("th", { style: { padding: "10px 14px", textAlign: "right", fontWeight: 600, fontSize: "12px", color: "#6b7280", whiteSpace: "nowrap" }, children: "Valor NF-e" }),
                                                            h("th", { style: { padding: "10px 14px", textAlign: "right", fontWeight: 600, fontSize: "12px", color: "#6b7280", whiteSpace: "nowrap" }, children: "Valor CT-e" }),
                                                            h("th", { style: { padding: "10px 14px", textAlign: "center", fontWeight: 600, fontSize: "12px", color: "#6b7280", whiteSpace: "nowrap" }, children: "Score Médio" }),
                                                        ],
                                                    }),
                                                }),
                                                h("tbody", {
                                                    children: evolucao7Dias.map((dia, i) => h("tr", {
                                                        key: dia.data || i,
                                                        style: { borderBottom: "1px solid #f3f4f6", verticalAlign: "middle" },
                                                        children: [
                                                            h("td", { style: { padding: "10px 14px", verticalAlign: "middle" }, children: formatDate(dia.data) }),
                                                            h("td", { style: { padding: "10px 14px", textAlign: "right", verticalAlign: "middle" }, children: dia.qtdNfe ?? "—" }),
                                                            h("td", { style: { padding: "10px 14px", textAlign: "right", verticalAlign: "middle" }, children: dia.qtdCte ?? "—" }),
                                                            h("td", { style: { padding: "10px 14px", textAlign: "right", verticalAlign: "middle" }, children: formatMoney(dia.valorNfe) }),
                                                            h("td", { style: { padding: "10px 14px", textAlign: "right", verticalAlign: "middle" }, children: formatMoney(dia.valorCte) }),
                                                            h("td", { style: { padding: "10px 14px", textAlign: "center", fontWeight: 700, color: scoreColor(dia.scoreMedio), verticalAlign: "middle" }, children: dia.scoreMedio ?? "—" }),
                                                        ],
                                                    })),
                                                }),
                                            ],
                                        }),
                                    }),
                                }),
                            }),
                        ],
                    }) : null,

                    // Últimas sincronizações
                    ultimasSincronizacoes.length > 0 ? hs("div", {
                        children: [
                            h(SectionTitle, { children: "Últimas Sincronizações SEFAZ" }),
                            h(Card, {
                                children: h(CardContent, {
                                    style: { padding: "16px 20px" },
                                    children: h("div", {
                                        style: { display: "flex", flexDirection: "column", gap: "8px" },
                                        children: ultimasSincronizacoes.map((s, i) => hs("div", {
                                            key: i,
                                            style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#f9fafb", borderRadius: "6px", fontSize: "13px" },
                                            children: [
                                                hs("div", {
                                                    children: [
                                                        h("span", { style: { fontWeight: 600 }, children: s.tipo || "—" }),
                                                        h("span", { style: { color: "#6b7280", marginLeft: "8px" }, children: s.mensagem || "" }),
                                                    ],
                                                }),
                                                hs("div", {
                                                    style: { display: "flex", gap: "12px", alignItems: "center" },
                                                    children: [
                                                        h("span", { style: { color: "#6b7280", fontSize: "12px" }, children: formatDateTime(s.dataHora) }),
                                                        h("span", {
                                                            style: {
                                                                padding: "2px 8px",
                                                                borderRadius: "9999px",
                                                                fontSize: "11px",
                                                                fontWeight: 700,
                                                                background: s.status === "OK" ? "#dcfce7" : "#fee2e2",
                                                                color: s.status === "OK" ? "#166534" : "#991b1b",
                                                            },
                                                            children: s.status || "—",
                                                        }),
                                                    ],
                                                }),
                                            ],
                                        })),
                                    }),
                                }),
                            }),
                        ],
                    }) : null,
                ],
            }),
        ],
    });
}
