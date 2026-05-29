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

function formatDate(value) {
    if (!value) return "-";
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString("pt-BR");
}

function formatMoney(value) {
    const n = Number(value ?? 0);
    if (!isFinite(n)) return "R$ 0,00";
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function isSlaVencido(sla) {
    if (!sla) return false;
    return new Date(sla) < new Date();
}

function severidadeBadge(sev) {
    const map = {
        CRITICA: { bg: "#fee2e2", color: "#991b1b" },
        ALTA: { bg: "#fef3c7", color: "#92400e" },
        MEDIA: { bg: "#dbeafe", color: "#1e40af" },
        BAIXA: { bg: "#dcfce7", color: "#166534" },
    };
    const style = map[sev] || { bg: "#f1f5f9", color: "#475569" };
    return h("span", {
        style: { background: style.bg, color: style.color, padding: "2px 8px", borderRadius: 9999, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" },
        children: sev || "-",
    });
}

function statusBadge(status) {
    const map = {
        NOVA: { bg: "#dbeafe", color: "#1e40af" },
        EM_ANALISE: { bg: "#fef3c7", color: "#92400e" },
        ENCAMINHADA: { bg: "#ede9fe", color: "#5b21b6" },
        FINALIZADA: { bg: "#dcfce7", color: "#166534" },
    };
    const style = map[status] || { bg: "#f1f5f9", color: "#475569" };
    return h("span", {
        style: { background: style.bg, color: style.color, padding: "2px 8px", borderRadius: 9999, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" },
        children: String(status || "-").replace(/_/g, " "),
    });
}

function KpiCard({ title, value, color }) {
    return hs("div", {
        style: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "16px 20px", minWidth: 120 },
        children: [
            h("div", { style: { fontSize: 12, color: "#64748b", marginBottom: 4 }, children: title }),
            h("div", { style: { fontSize: 22, fontWeight: 700, color: color || "#1e293b" }, children: value }),
        ],
    });
}

function EncaminharModal({ divId, onClose, onDone }) {
    const [setor, setSetor] = React.useState("");
    const [obs, setObs] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const [erro, setErro] = React.useState("");

    async function confirmar() {
        if (!setor.trim()) { setErro("Informe o setor."); return; }
        setLoading(true);
        setErro("");
        try {
            await apiFetch(`/api/fiscal/divergencias/${divId}/encaminhar`, {
                method: "POST",
                body: JSON.stringify({ setor, observacao: obs }),
            });
            onDone();
            onClose();
        } catch (e) {
            setErro(e.message);
        } finally {
            setLoading(false);
        }
    }

    return h("div", {
        style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" },
        onClick: onClose,
        children: hs("div", {
            style: { background: "#fff", borderRadius: 10, padding: 28, width: 400, maxWidth: "95vw" },
            onClick: e => e.stopPropagation(),
            children: [
                h("h2", { style: { fontSize: 16, fontWeight: 700, marginBottom: 16 }, children: "Encaminhar Divergência" }),
                hs("div", {
                    style: { marginBottom: 12 },
                    children: [
                        h(Label, { children: "Setor *" }),
                        h(Input, { value: setor, onChange: e => setSetor(e.target.value), placeholder: "Ex: Fiscal, Contabilidade..." }),
                    ],
                }),
                hs("div", {
                    style: { marginBottom: 12 },
                    children: [
                        h(Label, { children: "Observação" }),
                        h("textarea", {
                            value: obs,
                            onChange: e => setObs(e.target.value),
                            rows: 3,
                            style: { width: "100%", border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 10px", fontSize: 14 },
                            placeholder: "Opcional...",
                        }),
                    ],
                }),
                erro ? h("div", { style: { color: "#991b1b", fontSize: 13, marginBottom: 8 }, children: erro }) : null,
                hs("div", {
                    style: { display: "flex", gap: 8, justifyContent: "flex-end" },
                    children: [
                        h(Button, { variant: "outline", onClick: onClose, children: "Cancelar" }),
                        h(Button, { onClick: confirmar, disabled: loading, style: { background: "#2563eb", color: "#fff" }, children: loading ? "Enviando..." : "Confirmar" }),
                    ],
                }),
            ],
        }),
    });
}

function FiscalDivergenciasPage() {
    const [dados, setDados] = React.useState(null);
    const [loading, setLoading] = React.useState(false);
    const [erro, setErro] = React.useState("");
    const [filtros, setFiltros] = React.useState({ status: "", severidade: "", tipoDfe: "", dataInicio: "", dataFim: "", busca: "" });
    const [actionLoading, setActionLoading] = React.useState({});
    const [encaminharId, setEncaminharId] = React.useState(null);

    async function carregar() {
        setLoading(true);
        setErro("");
        try {
            const params = new URLSearchParams();
            Object.entries(filtros).forEach(([k, v]) => { if (v) params.set(k, v); });
            const qs = params.toString() ? `?${params}` : "";
            const data = await apiFetch(`/api/fiscal/divergencias${qs}`);
            setDados(data);
        } catch (e) {
            setErro(e.message);
        } finally {
            setLoading(false);
        }
    }

    React.useEffect(() => { carregar(); }, []);

    async function assumir(id) {
        setActionLoading(p => ({ ...p, [id + "_assumir"]: true }));
        try {
            await apiFetch(`/api/fiscal/divergencias/${id}/tratar`, { method: "POST" });
            await carregar();
        } catch (e) {
            alert(e.message);
        } finally {
            setActionLoading(p => ({ ...p, [id + "_assumir"]: false }));
        }
    }

    async function finalizar(id) {
        setActionLoading(p => ({ ...p, [id + "_finalizar"]: true }));
        try {
            await apiFetch(`/api/fiscal/divergencias/${id}/finalizar`, { method: "POST" });
            await carregar();
        } catch (e) {
            alert(e.message);
        } finally {
            setActionLoading(p => ({ ...p, [id + "_finalizar"]: false }));
        }
    }

    async function exportarCsv() {
        try {
            const token = getToken();
            const a = document.createElement("a");
            a.href = `/api/fiscal/exportar/divergencias-csv?token=${encodeURIComponent(token)}`;
            a.download = "divergencias-fiscais.csv";
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (e) {
            alert(e.message);
        }
    }

    const kpis = dados?.kpis || {};
    const lista = dados?.divergencias || [];

    return hs("div", {
        style: { padding: 24, maxWidth: 1400, margin: "0 auto" },
        children: [
            hs("div", {
                style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
                children: [
                    hs("div", {
                        children: [
                            h("h1", { style: { fontSize: 22, fontWeight: 700, color: "#1e293b", margin: 0 }, children: "Divergências Fiscais" }),
                            h("p", { style: { fontSize: 14, color: "#64748b", marginTop: 4 }, children: "Gerencie e trate todas as divergências identificadas nos documentos fiscais." }),
                        ],
                    }),
                    h(Button, { onClick: exportarCsv, style: { background: "#2563eb", color: "#fff" }, children: "Exportar CSV" }),
                ],
            }),

            // KPIs
            hs("div", {
                style: { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 },
                children: [
                    h(KpiCard, { title: "Total Divergências", value: kpis.total ?? 0 }),
                    h(KpiCard, { title: "Novas", value: kpis.novas ?? 0, color: "#1e40af" }),
                    h(KpiCard, { title: "Em Análise", value: kpis.emAnalise ?? 0, color: "#92400e" }),
                    h(KpiCard, { title: "Críticas", value: kpis.criticas ?? 0, color: "#991b1b" }),
                    h(KpiCard, { title: "Valor Impacto", value: formatMoney(kpis.valorImpactoTotal) }),
                ],
            }),

            // Filtros
            h(Card, {
                style: { marginBottom: 20 },
                children: h(CardContent, {
                    style: { padding: 16 },
                    children: hs("div", {
                        style: { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" },
                        children: [
                            hs("div", {
                                children: [
                                    h(Label, { children: "Status" }),
                                    h("select", {
                                        value: filtros.status,
                                        onChange: e => setFiltros(p => ({ ...p, status: e.target.value })),
                                        style: { height: 36, border: "1px solid #e2e8f0", borderRadius: 6, padding: "0 8px", fontSize: 14 },
                                        children: [
                                            h("option", { value: "", children: "Todos" }),
                                            h("option", { value: "NOVA", children: "Nova" }),
                                            h("option", { value: "EM_ANALISE", children: "Em Análise" }),
                                            h("option", { value: "ENCAMINHADA", children: "Encaminhada" }),
                                            h("option", { value: "FINALIZADA", children: "Finalizada" }),
                                        ],
                                    }),
                                ],
                            }),
                            hs("div", {
                                children: [
                                    h(Label, { children: "Severidade" }),
                                    h("select", {
                                        value: filtros.severidade,
                                        onChange: e => setFiltros(p => ({ ...p, severidade: e.target.value })),
                                        style: { height: 36, border: "1px solid #e2e8f0", borderRadius: 6, padding: "0 8px", fontSize: 14 },
                                        children: [
                                            h("option", { value: "", children: "Todas" }),
                                            h("option", { value: "CRITICA", children: "Crítica" }),
                                            h("option", { value: "ALTA", children: "Alta" }),
                                            h("option", { value: "MEDIA", children: "Média" }),
                                            h("option", { value: "BAIXA", children: "Baixa" }),
                                        ],
                                    }),
                                ],
                            }),
                            hs("div", {
                                children: [
                                    h(Label, { children: "Tipo DFe" }),
                                    h("select", {
                                        value: filtros.tipoDfe,
                                        onChange: e => setFiltros(p => ({ ...p, tipoDfe: e.target.value })),
                                        style: { height: 36, border: "1px solid #e2e8f0", borderRadius: 6, padding: "0 8px", fontSize: 14 },
                                        children: [
                                            h("option", { value: "", children: "Todos" }),
                                            h("option", { value: "NFE", children: "NF-e" }),
                                            h("option", { value: "CTE", children: "CT-e" }),
                                            h("option", { value: "NFCE", children: "NFC-e" }),
                                            h("option", { value: "MDFE", children: "MDF-e" }),
                                        ],
                                    }),
                                ],
                            }),
                            hs("div", {
                                children: [
                                    h(Label, { children: "Data Início" }),
                                    h(Input, { type: "date", value: filtros.dataInicio, onChange: e => setFiltros(p => ({ ...p, dataInicio: e.target.value })), style: { height: 36 } }),
                                ],
                            }),
                            hs("div", {
                                children: [
                                    h(Label, { children: "Data Fim" }),
                                    h(Input, { type: "date", value: filtros.dataFim, onChange: e => setFiltros(p => ({ ...p, dataFim: e.target.value })), style: { height: 36 } }),
                                ],
                            }),
                            hs("div", { style: { flex: 1, minWidth: 180 },
                                children: [
                                    h(Label, { children: "Busca (chave / emitente)" }),
                                    h(Input, { value: filtros.busca, onChange: e => setFiltros(p => ({ ...p, busca: e.target.value })), placeholder: "Chave ou emitente...", style: { height: 36 } }),
                                ],
                            }),
                            h(Button, { onClick: carregar, style: { background: "#2563eb", color: "#fff", height: 36 }, children: "Filtrar" }),
                            h(Button, { variant: "outline", onClick: () => { setFiltros({ status: "", severidade: "", tipoDfe: "", dataInicio: "", dataFim: "", busca: "" }); }, style: { height: 36 }, children: "Limpar" }),
                        ],
                    }),
                }),
            }),

            erro ? h("div", { style: { color: "#991b1b", background: "#fee2e2", padding: 12, borderRadius: 8, marginBottom: 16 }, children: erro }) : null,
            loading ? h("div", { style: { textAlign: "center", padding: 40, color: "#64748b" }, children: "Carregando..." }) : null,

            // Tabela
            !loading && h(Card, {
                children: h(CardContent, {
                    style: { padding: 0, overflowX: "auto" },
                    children: h("table", {
                        style: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
                        children: hs("thead", {
                            children: [
                                h("tr", {
                                    style: { background: "#f8fafc", borderBottom: "1px solid #e2e8f0" },
                                    children: [
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#475569" }, children: "ID" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#475569" }, children: "Tipo DFe" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#475569" }, children: "Tipo Divergência" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#475569" }, children: "Severidade" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#475569" }, children: "Status" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#475569" }, children: "Responsável" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#475569" }, children: "Setor" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#475569" }, children: "SLA" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "right", fontWeight: 600, color: "#475569" }, children: "Valor Impacto" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#475569" }, children: "Ações" }),
                                    ],
                                }),
                            ],
                        }),
                    }),
                }),
            }),

            !loading && h("div", {
                style: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" },
                children: h("div", {
                    style: { overflowX: "auto" },
                    children: h("table", {
                        style: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
                        children: hs("tbody", {
                            children: lista.length === 0
                                ? [h("tr", { children: h("td", { colSpan: 10, style: { padding: 40, textAlign: "center", color: "#64748b" }, children: "Nenhuma divergência encontrada." }) })]
                                : lista.map(row => {
                                    const vencido = isSlaVencido(row.sla);
                                    return hs("tr", {
                                        style: { borderBottom: "1px solid #f1f5f9" },
                                        children: [
                                            h("td", { style: { padding: "8px 12px" }, children: row.id }),
                                            h("td", { style: { padding: "8px 12px" }, children: h("span", { style: { background: "#dbeafe", color: "#1e40af", padding: "2px 8px", borderRadius: 9999, fontSize: 12, fontWeight: 600 }, children: row.tipoDfe || "-" }) }),
                                            h("td", { style: { padding: "8px 12px", color: "#475569" }, children: String(row.tipoDivergencia || "-").replace(/_/g, " ") }),
                                            h("td", { style: { padding: "8px 12px" }, children: severidadeBadge(row.severidade) }),
                                            h("td", { style: { padding: "8px 12px" }, children: statusBadge(row.status) }),
                                            h("td", { style: { padding: "8px 12px" }, children: row.responsavel || "-" }),
                                            h("td", { style: { padding: "8px 12px" }, children: row.setor || "-" }),
                                            h("td", { style: { padding: "8px 12px", color: vencido ? "#991b1b" : "#1e293b", fontWeight: vencido ? 700 : 400 }, children: formatDate(row.sla) }),
                                            h("td", { style: { padding: "8px 12px", textAlign: "right" }, children: formatMoney(row.valorImpacto) }),
                                            hs("td", {
                                                style: { padding: "8px 12px", verticalAlign: "middle", whiteSpace: "nowrap" },
                                                children: hs("div", {
                                                    style: { display: "flex", gap: 4, alignItems: "center", flexWrap: "nowrap" },
                                                    children: [
                                                        h(Button, { key: "as", variant: "outline", size: "sm", disabled: !!actionLoading[row.id + "_assumir"], onClick: () => assumir(row.id), style: { fontSize: 12, whiteSpace: "nowrap" }, children: actionLoading[row.id + "_assumir"] ? "..." : "Assumir" }),
                                                        h(Button, { key: "en", variant: "outline", size: "sm", onClick: () => setEncaminharId(row.id), style: { fontSize: 12, whiteSpace: "nowrap" }, children: "Encaminhar" }),
                                                        h(Button, { key: "fn", variant: "outline", size: "sm", disabled: !!actionLoading[row.id + "_finalizar"], onClick: () => finalizar(row.id), style: { fontSize: 12, whiteSpace: "nowrap" }, children: actionLoading[row.id + "_finalizar"] ? "..." : "Finalizar" }),
                                                    ],
                                                }),
                                            }),
                                        ],
                                    }, row.id);
                                }),
                        }),
                    }),
                }),
            }),

            encaminharId ? h(EncaminharModal, { divId: encaminharId, onClose: () => setEncaminharId(null), onDone: carregar }) : null,
        ],
    });
}

export default FiscalDivergenciasPage;
