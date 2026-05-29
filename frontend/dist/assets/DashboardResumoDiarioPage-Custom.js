import { r as React, j as jsxRuntime, J as Card, N as CardContent, B as Button } from "./index-Cw1PFMX8.js";

const h = jsxRuntime.jsx;
const hs = jsxRuntime.jsxs;

function getToken() { try { return JSON.parse(localStorage.getItem("sgq.authSession") || "{}").token || ""; } catch { return ""; } }
async function apiFetch(path) {
    const res = await fetch(path, { headers: { Authorization: `Bearer ${getToken()}` } });
    return res.ok ? res.json().catch(() => ({})) : {};
}

function KpiCard({ label, value, sub, color }) {
    return h(Card, {
        children: h(CardContent, {
            className: "pt-4 pb-4 px-5",
            children: hs("div", {
                children: [
                    h("p", { style: { fontSize: "11px", color: "hsl(var(--muted-foreground))", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }, children: label }),
                    h("p", { style: { fontSize: "28px", fontWeight: 700, color: color || "hsl(var(--foreground))", lineHeight: 1 }, children: value ?? "—" }),
                    sub ? h("p", { style: { fontSize: "11px", color: "hsl(var(--muted-foreground))", marginTop: "4px" }, children: sub }) : null,
                ],
            }),
        }),
    });
}

function AlertBadge({ alerta }) {
    const colors = { ALTA: { background: "#fee2e2", color: "#991b1b" }, MEDIA: { background: "#fef3c7", color: "#92400e" }, BAIXA: { background: "#dbeafe", color: "#1e40af" } };
    const c = colors[alerta.prioridade] || colors.MEDIA;
    return hs("div", {
        style: { display: "flex", alignItems: "flex-start", gap: "10px", padding: "10px 14px", borderRadius: "8px", background: c.background, marginBottom: "6px" },
        children: [
            h("span", { style: { fontSize: "11px", fontWeight: 700, color: c.color, whiteSpace: "nowrap", marginTop: "1px" }, children: alerta.prioridade }),
            h("p", { style: { fontSize: "13px", color: c.color, margin: 0 }, children: alerta.descricao }),
        ],
    });
}

function SectionTitle({ children }) {
    return h("h2", { style: { fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "hsl(var(--muted-foreground))", margin: "0 0 10px 0" }, children });
}

export default function DashboardResumoDiarioPage() {
    const [resumo, setResumo] = React.useState(null);
    const [alertas, setAlertas] = React.useState({ total: 0, alertas: [] });
    const [loading, setLoading] = React.useState(true);
    const [lastUpdate, setLastUpdate] = React.useState(null);

    const carregar = React.useCallback(async () => {
        const [r, a] = await Promise.all([apiFetch("/api/resumo-diario"), apiFetch("/api/alertas-sla")]);
        setResumo(r);
        setAlertas(a);
        setLastUpdate(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
        setLoading(false);
    }, []);

    React.useEffect(() => {
        carregar();
        const t = setInterval(carregar, 60000);
        return () => clearInterval(t);
    }, [carregar]);

    const hoje = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

    return hs("div", {
        className: "p-4 md:p-6 space-y-6 max-w-6xl mx-auto",
        children: [
            // Header
            hs("div", {
                className: "flex items-start justify-between",
                children: [
                    hs("div", {
                        children: [
                            h("h1", { className: "text-2xl font-bold", children: "Resumo do Dia" }),
                            h("p", { style: { fontSize: "13px", color: "hsl(var(--muted-foreground))", textTransform: "capitalize", marginTop: "2px" }, children: hoje }),
                        ],
                    }),
                    hs("div", { style: { textAlign: "right" }, children: [
                        h("p", { style: { fontSize: "11px", color: "hsl(var(--muted-foreground))" }, children: "Atualizado às" }),
                        h("p", { style: { fontSize: "14px", fontWeight: 600 }, children: lastUpdate || "—" }),
                        h(Button, { variant: "outline", style: { marginTop: "6px", fontSize: "12px" }, onClick: carregar, children: "↻ Atualizar" }),
                    ] }),
                ],
            }),

            loading ? h("p", { className: "text-muted-foreground text-sm", children: "Carregando..." }) : hs("div", {
                className: "space-y-6",
                children: [
                    // Alertas
                    alertas.total > 0 ? hs("div", {
                        children: [
                            h(SectionTitle, { children: `⚠ Alertas Ativos (${alertas.total})` }),
                            h("div", { children: alertas.alertas.map((a, i) => h(AlertBadge, { key: i, alerta: a })) }),
                        ],
                    }) : null,

                    // Portaria
                    hs("div", {
                        children: [
                            h(SectionTitle, { children: "Portaria & Visitantes" }),
                            h("div", {
                                className: "grid grid-cols-2 md:grid-cols-4 gap-3",
                                children: [
                                    h(KpiCard, { label: "Acessos hoje", value: resumo?.portaria?.acessosHoje, color: "#2563eb" }),
                                    h(KpiCard, { label: "Visitantes presentes", value: resumo?.portaria?.visitantesPresentes, color: resumo?.portaria?.visitantesPresentes > 0 ? "#16a34a" : undefined }),
                                    h(KpiCard, { label: "Fornecedores no pátio", value: resumo?.portaria?.fornecedoresPresentes, color: resumo?.portaria?.fornecedoresPresentes > 0 ? "#d97706" : undefined }),
                                    h(KpiCard, { label: "Saídas pendentes", value: resumo?.portaria?.solicitacoesSaidaPendentes, color: resumo?.portaria?.solicitacoesSaidaPendentes > 0 ? "#dc2626" : undefined }),
                                ],
                            }),
                        ],
                    }),

                    // Frota
                    hs("div", {
                        children: [
                            h(SectionTitle, { children: "Frota & Logística" }),
                            h("div", {
                                className: "grid grid-cols-2 md:grid-cols-3 gap-3",
                                children: [
                                    h(KpiCard, { label: "Veículos em deslocamento", value: resumo?.frota?.veiculosAtivos, color: "#2563eb" }),
                                    h(KpiCard, { label: "Total da frota", value: resumo?.frota?.totalFrota }),
                                    h(KpiCard, { label: "Agendamentos hoje", value: resumo?.frota?.agendamentosHoje }),
                                ],
                            }),
                        ],
                    }),

                    // Pátio
                    hs("div", {
                        children: [
                            h(SectionTitle, { children: "Pátio e Docas" }),
                            h("div", {
                                className: "grid grid-cols-2 md:grid-cols-3 gap-3",
                                children: [
                                    h(KpiCard, { label: "Docas ocupadas", value: resumo?.patio?.docasOcupadas != null ? `${resumo.patio.docasOcupadas}/${resumo.patio.docasTotal}` : "—", color: resumo?.patio?.docasOcupadas > 0 ? "#d97706" : "#16a34a" }),
                                    h(KpiCard, { label: "Na fila", value: resumo?.patio?.naFila }),
                                    h(KpiCard, { label: "Fornecedores hoje", value: resumo?.portaria?.fornecedoresHoje }),
                                ],
                            }),
                        ],
                    }),

                    // Sistema
                    hs("div", {
                        children: [
                            h(SectionTitle, { children: "Sistema & Alertas" }),
                            h("div", {
                                className: "grid grid-cols-2 md:grid-cols-2 gap-3",
                                children: [
                                    h(KpiCard, { label: "Alertas operacionais abertos", value: resumo?.alertas?.abertos, color: resumo?.alertas?.abertos > 0 ? "#dc2626" : "#16a34a" }),
                                    h(KpiCard, { label: "Exceções pendentes", value: resumo?.alertas?.excecoesPendentes, color: resumo?.alertas?.excecoesPendentes > 0 ? "#d97706" : "#16a34a" }),
                                ],
                            }),
                        ],
                    }),
                ],
            }),
        ],
    });
}
