import { r as React, j as jsxRuntime, J as Card, N as CardContent, B as Button } from "./index-Cw1PFMX8.js";
import { I as Input } from "./input-CnWhQnjH.js";
import { L as Label } from "./label-CRMrAwdj.js";

const h = jsxRuntime.jsx;
const hs = jsxRuntime.jsxs;

function getToken() { try { return JSON.parse(localStorage.getItem("sgq.authSession") || "{}").token || ""; } catch { return ""; } }
async function apiFetch(path, opts) {
    const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(opts?.headers || {}) } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || json?.message || `Erro ${res.status}`);
    return json;
}
function downloadCsv(url, filename) {
    fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } })
        .then(r => r.blob())
        .then(blob => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            a.click();
            URL.revokeObjectURL(a.href);
        })
        .catch(() => alert("Erro ao exportar. Tente novamente."));
}

function Toast({ msg, tipo, onClose }) {
    if (!msg) return null;
    const bg = tipo === "erro" ? "#fee2e2" : "#dcfce7";
    const color = tipo === "erro" ? "#991b1b" : "#166534";
    return hs("div", {
        style: { position: "fixed", top: "20px", right: "20px", zIndex: 9999, background: bg, color, border: `1px solid ${color}`, borderRadius: "8px", padding: "14px 20px", minWidth: "280px", maxWidth: "420px", boxShadow: "0 4px 12px rgba(0,0,0,0.15)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" },
        children: [
            h("span", { style: { fontSize: "13px", lineHeight: "1.5" }, children: msg }),
            h("button", { onClick: onClose, style: { background: "none", border: "none", cursor: "pointer", fontSize: "16px", color, lineHeight: 1, padding: 0 }, children: "×" }),
        ],
    });
}

const SEVERIDADE_CONFIG = {
    CRITICA: { borderColor: "#dc2626", bg: "#fff1f2", badgeBg: "#fee2e2", badgeColor: "#991b1b", label: "Crítica", icon: "🔴" },
    ALTA:    { borderColor: "#ea580c", bg: "#fff7ed", badgeBg: "#ffedd5", badgeColor: "#9a3412", label: "Alta",    icon: "🟠" },
    MEDIA:   { borderColor: "#2563eb", bg: "#eff6ff", badgeBg: "#dbeafe", badgeColor: "#1e40af", label: "Média",   icon: "🔵" },
    BAIXA:   { borderColor: "#16a34a", bg: "#f0fdf4", badgeBg: "#dcfce7", badgeColor: "#166534", label: "Baixa",   icon: "🟢" },
};

function KpiCard({ label, value, color }) {
    return h(Card, {
        children: h(CardContent, {
            style: { padding: "16px 20px" },
            children: hs("div", { children: [
                h("p", { style: { fontSize: "11px", color: "hsl(var(--muted-foreground))", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }, children: label }),
                h("p", { style: { fontSize: "26px", fontWeight: 700, color: color || "hsl(var(--foreground))", lineHeight: 1 }, children: value ?? "—" }),
            ]}),
        }),
    });
}

function AlertaCard({ alerta, onLido, onResolvido, processando }) {
    const sev = SEVERIDADE_CONFIG[alerta.severidade] || SEVERIDADE_CONFIG.BAIXA;
    const lido = alerta.status === "LIDO";
    const resolvido = alerta.status === "RESOLVIDO";

    return h("div", {
        style: {
            border: `2px solid ${sev.borderColor}`,
            borderRadius: "10px",
            background: sev.bg,
            padding: "16px 18px",
            opacity: lido ? 0.65 : 1,
            transition: "opacity 0.2s",
            display: "flex",
            gap: "14px",
            alignItems: "flex-start",
        },
        children: [
            // Ícone de severidade
            h("div", {
                style: { flexShrink: 0, marginTop: "2px" },
                children: hs("div", { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }, children: [
                    h("span", { style: { fontSize: "20px", lineHeight: 1 }, children: sev.icon }),
                    h("span", { style: { fontSize: "9px", fontWeight: 700, padding: "1px 6px", borderRadius: "9999px", background: sev.badgeBg, color: sev.badgeColor, whiteSpace: "nowrap" }, children: sev.label }),
                ]}),
            }),

            // Conteúdo
            hs("div", { style: { flex: 1, minWidth: 0 }, children: [
                h("p", { style: { margin: "0 0 4px 0", fontSize: "14px", fontWeight: 700, color: "hsl(var(--foreground))" }, children: alerta.titulo || alerta.tipo || "Alerta Fiscal" }),
                h("p", { style: { margin: "0 0 8px 0", fontSize: "13px", color: "hsl(var(--foreground))", lineHeight: "1.5", opacity: 0.85 }, children: alerta.mensagem || "—" }),

                // Link para documento
                alerta.chaveDocumento ? hs("p", { style: { margin: "0 0 8px 0", fontSize: "12px" }, children: [
                    h("span", { style: { color: "hsl(var(--muted-foreground))" }, children: "Documento: " }),
                    h("a", {
                        href: `/fiscal/documentos/${alerta.chaveDocumento}`,
                        style: { color: "#2563eb", fontFamily: "monospace", fontSize: "11px", wordBreak: "break-all", textDecoration: "underline" },
                        children: alerta.chaveDocumento,
                    }),
                ]}) : null,

                // Data
                h("p", { style: { margin: "0 0 10px 0", fontSize: "11px", color: "hsl(var(--muted-foreground))" }, children: alerta.criadoEm ? `Criado em ${new Date(alerta.criadoEm).toLocaleString("pt-BR")}` : "" }),

                // Ações
                !resolvido ? hs("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" }, children: [
                    !lido ? h(Button, {
                        variant: "outline",
                        style: { fontSize: "11px", padding: "4px 12px", height: "auto", background: "#fff" },
                        disabled: processando === `lido-${alerta.id}`,
                        onClick: () => onLido(alerta.id),
                        children: processando === `lido-${alerta.id}` ? "..." : "Marcar como lido",
                    }) : null,
                    h(Button, {
                        variant: "outline",
                        style: { fontSize: "11px", padding: "4px 12px", height: "auto", background: "#fff", color: "#16a34a", borderColor: "#86efac" },
                        disabled: processando === `resolver-${alerta.id}`,
                        onClick: () => onResolvido(alerta.id),
                        children: processando === `resolver-${alerta.id}` ? "..." : "Resolver",
                    }),
                ]}) : h("span", { style: { fontSize: "11px", fontWeight: 700, color: "#16a34a" }, children: "Resolvido" }),
            ]}),
        ],
    });
}

export default function FiscalAlertasPage() {
    const [alertas, setAlertas] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState("");
    const [toast, setToast] = React.useState({ msg: "", tipo: "" });
    const [processando, setProcessando] = React.useState("");
    const [marcandoTodos, setMarcandoTodos] = React.useState(false);
    const [filtroStatus, setFiltroStatus] = React.useState("ATIVO");
    const [filtroSeveridade, setFiltroSeveridade] = React.useState("");

    const showToast = (msg, tipo = "ok") => {
        setToast({ msg, tipo });
        setTimeout(() => setToast({ msg: "", tipo: "" }), 6000);
    };

    const carregar = React.useCallback(async () => {
        setErro("");
        try {
            const params = new URLSearchParams();
            if (filtroStatus) params.set("status", filtroStatus);
            if (filtroSeveridade) params.set("severidade", filtroSeveridade);
            const q = params.toString() ? `?${params.toString()}` : "";
            const data = await apiFetch(`/api/fiscal/alertas${q}`);
            setAlertas(Array.isArray(data) ? data : (data.alertas || []));
        } catch (e) {
            setErro(e.message || "Erro ao carregar alertas.");
        } finally {
            setLoading(false);
        }
    }, [filtroStatus, filtroSeveridade]);

    React.useEffect(() => {
        carregar();
        const t = setInterval(() => carregar(), 60000);
        return () => clearInterval(t);
    }, [carregar]);

    const marcarLido = async (id) => {
        setProcessando(`lido-${id}`);
        try {
            await apiFetch(`/api/fiscal/alertas/${id}/lido`, { method: "POST" });
            setAlertas(prev => prev.map(a => a.id === id ? { ...a, status: "LIDO" } : a));
        } catch (e) {
            showToast(e.message || "Erro ao marcar alerta.", "erro");
        } finally {
            setProcessando("");
        }
    };

    const resolver = async (id) => {
        setProcessando(`resolver-${id}`);
        try {
            await apiFetch(`/api/fiscal/alertas/${id}/resolver`, { method: "POST" });
            setAlertas(prev => prev.map(a => a.id === id ? { ...a, status: "RESOLVIDO" } : a));
        } catch (e) {
            showToast(e.message || "Erro ao resolver alerta.", "erro");
        } finally {
            setProcessando("");
        }
    };

    const marcarTodosLidos = async () => {
        if (!window.confirm("Marcar todos os alertas ativos como lidos?")) return;
        setMarcandoTodos(true);
        try {
            await apiFetch("/api/fiscal/alertas/marcar-todos-lidos", { method: "POST" });
            await carregar();
            showToast("Todos os alertas foram marcados como lidos.", "ok");
        } catch (e) {
            showToast(e.message || "Erro ao marcar todos.", "erro");
        } finally {
            setMarcandoTodos(false);
        }
    };

    const total = alertas.length;
    const criticos = alertas.filter(a => a.severidade === "CRITICA" && a.status !== "RESOLVIDO").length;
    const naoLidos = alertas.filter(a => a.status === "ATIVO").length;
    const resolvidos = alertas.filter(a => a.status === "RESOLVIDO").length;

    const selectStyle = { padding: "7px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px", minWidth: "160px" };

    return hs("div", {
        style: { padding: "24px", maxWidth: "1000px", margin: "0 auto" },
        children: [
            h(Toast, { msg: toast.msg, tipo: toast.tipo, onClose: () => setToast({ msg: "", tipo: "" }) }),

            // Header
            hs("div", {
                style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", flexWrap: "wrap", gap: "12px" },
                children: [
                    hs("div", { children: [
                        h("h1", { style: { fontSize: "22px", fontWeight: 700, margin: "0 0 4px 0" }, children: "Alertas Inteligentes" }),
                        h("p", { style: { fontSize: "13px", color: "hsl(var(--muted-foreground))", margin: 0 }, children: "Monitoramento automático — atualizado a cada 60 segundos" }),
                    ]}),
                    hs("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" }, children: [
                        h(Button, { variant: "outline", style: { fontSize: "12px" }, onClick: carregar, children: "↻ Atualizar" }),
                        h(Button, {
                            variant: "outline",
                            style: { fontSize: "12px" },
                            disabled: marcandoTodos,
                            onClick: marcarTodosLidos,
                            children: marcandoTodos ? "Processando..." : "Marcar todos como lidos",
                        }),
                    ]}),
                ],
            }),

            // KPIs
            hs("div", {
                style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "14px", marginBottom: "20px" },
                children: [
                    h(KpiCard, { label: "Total alertas ativos", value: total }),
                    h(KpiCard, { label: "Críticos", value: criticos, color: "#dc2626" }),
                    h(KpiCard, { label: "Não lidos", value: naoLidos, color: "#d97706" }),
                    h(KpiCard, { label: "Resolvidos", value: resolvidos, color: "#16a34a" }),
                ],
            }),

            // Filtros
            h(Card, {
                style: { marginBottom: "20px" },
                children: h(CardContent, {
                    style: { padding: "12px 16px" },
                    children: hs("div", {
                        style: { display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" },
                        children: [
                            h("span", { style: { fontSize: "13px", fontWeight: 600 }, children: "Filtros:" }),
                            hs("div", { style: { display: "flex", flexDirection: "column", gap: "2px" }, children: [
                                h("label", { style: { fontSize: "11px", color: "hsl(var(--muted-foreground))" }, children: "Status" }),
                                h("select", {
                                    value: filtroStatus,
                                    onChange: e => setFiltroStatus(e.target.value),
                                    style: selectStyle,
                                    children: [
                                        h("option", { value: "", children: "Todos" }),
                                        h("option", { value: "ATIVO", children: "Ativo" }),
                                        h("option", { value: "LIDO", children: "Lido" }),
                                        h("option", { value: "RESOLVIDO", children: "Resolvido" }),
                                    ],
                                }),
                            ]}),
                            hs("div", { style: { display: "flex", flexDirection: "column", gap: "2px" }, children: [
                                h("label", { style: { fontSize: "11px", color: "hsl(var(--muted-foreground))" }, children: "Severidade" }),
                                h("select", {
                                    value: filtroSeveridade,
                                    onChange: e => setFiltroSeveridade(e.target.value),
                                    style: selectStyle,
                                    children: [
                                        h("option", { value: "", children: "Todas" }),
                                        h("option", { value: "CRITICA", children: "Crítica" }),
                                        h("option", { value: "ALTA", children: "Alta" }),
                                        h("option", { value: "MEDIA", children: "Média" }),
                                        h("option", { value: "BAIXA", children: "Baixa" }),
                                    ],
                                }),
                            ]}),
                        ],
                    }),
                }),
            }),

            // Lista de alertas
            loading
                ? h("div", { style: { padding: "60px", textAlign: "center", color: "hsl(var(--muted-foreground))" }, children: "Carregando alertas..." })
                : erro
                    ? h("div", { style: { padding: "40px", textAlign: "center", color: "#dc2626", background: "#fee2e2", borderRadius: "10px" }, children: erro })
                    : alertas.length === 0
                        ? h("div", { style: { padding: "60px", textAlign: "center", color: "hsl(var(--muted-foreground))", background: "hsl(var(--muted)/0.3)", borderRadius: "12px" }, children: "Nenhum alerta encontrado para os filtros selecionados." })
                        : hs("div", {
                            style: { display: "flex", flexDirection: "column", gap: "12px" },
                            children: alertas.map((alerta, i) => h(AlertaCard, {
                                key: alerta.id || i,
                                alerta,
                                onLido: marcarLido,
                                onResolvido: resolver,
                                processando,
                            })),
                        }),
        ],
    });
}
