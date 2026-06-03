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

function isSlaVencido(sla) {
    if (!sla) return false;
    return new Date(sla) < new Date();
}

function truncar(str, n) {
    if (!str) return "-";
    return String(str).length > n ? String(str).slice(0, n) + "..." : String(str);
}

function prioridadeBadge(p) {
    const map = {
        CRITICA: { bg: "#fee2e2", color: "#991b1b" },
        ALTA: { bg: "#fef3c7", color: "#92400e" },
        MEDIA: { bg: "#dbeafe", color: "#1e40af" },
        BAIXA: { bg: "#dcfce7", color: "#166534" },
    };
    const style = map[p] || { bg: "#f3f4f6", color: "#374151" };
    return h("span", {
        style: { background: style.bg, color: style.color, padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700, whiteSpace: "nowrap" },
        children: p || "-",
    });
}

function statusBadge(status) {
    const map = {
        ABERTO: { bg: "#dbeafe", color: "#1e40af" },
        EM_ANDAMENTO: { bg: "#fef3c7", color: "#92400e" },
        VENCIDO: { bg: "#fee2e2", color: "#991b1b" },
        CONCLUIDO: { bg: "#dcfce7", color: "#166534" },
    };
    const style = map[status] || { bg: "#f3f4f6", color: "#374151" };
    return h("span", {
        style: { background: style.bg, color: style.color, padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700, whiteSpace: "nowrap" },
        children: String(status || "-").replace(/_/g, " "),
    });
}

function KpiCard({ title, value, color }) {
    return hs("div", {
        style: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "16px 20px", minWidth: 120 },
        children: [
            h("div", { style: { fontSize: 12, color: "#6b7280", marginBottom: 4 }, children: title }),
            h("div", { style: { fontSize: 22, fontWeight: 700, color: color || "#111827" }, children: value }),
        ],
    });
}

function ComentarModal({ wfId, onClose, onDone }) {
    const [comentario, setComentario] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const [erro, setErro] = React.useState("");

    async function enviar() {
        if (!comentario.trim()) { setErro("Informe o comentário."); return; }
        setLoading(true);
        setErro("");
        try {
            await apiFetch(`/api/fiscal/workflow/${wfId}/comentar`, {
                method: "POST",
                body: JSON.stringify({ comentario }),
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
        style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" },
        onClick: onClose,
        children: hs("div", {
            style: { background: "#fff", borderRadius: 10, padding: 28, width: 440, maxWidth: "95vw" },
            onClick: e => e.stopPropagation(),
            children: [
                h("h2", { style: { fontSize: 16, fontWeight: 700, marginBottom: 16 }, children: "Comentar Workflow" }),
                hs("div", {
                    style: { marginBottom: 12 },
                    children: [
                        h(Label, { children: "Comentário *" }),
                        h("textarea", {
                            value: comentario,
                            onChange: e => setComentario(e.target.value),
                            rows: 4,
                            style: { width: "100%", border: "1px solid #e5e7eb", borderRadius: 6, padding: "6px 10px", fontSize: 14 },
                            placeholder: "Descreva a ação ou observação...",
                        }),
                    ],
                }),
                erro ? h("div", { style: { color: "#991b1b", fontSize: 13, marginBottom: 8 }, children: erro }) : null,
                hs("div", {
                    style: { display: "flex", gap: 8, justifyContent: "flex-end" },
                    children: [
                        h(Button, { variant: "outline", onClick: onClose, children: "Cancelar" }),
                        h(Button, { onClick: enviar, disabled: loading, style: { background: "#2563eb", color: "#fff" }, children: loading ? "Enviando..." : "Enviar" }),
                    ],
                }),
            ],
        }),
    });
}

function FinalizarModal({ wfId, onClose, onDone }) {
    const [decisao, setDecisao] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const [erro, setErro] = React.useState("");

    async function finalizar() {
        if (!decisao.trim()) { setErro("Informe a decisão."); return; }
        setLoading(true);
        setErro("");
        try {
            await apiFetch(`/api/fiscal/workflow/${wfId}/finalizar`, {
                method: "POST",
                body: JSON.stringify({ decisao }),
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
        style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" },
        onClick: onClose,
        children: hs("div", {
            style: { background: "#fff", borderRadius: 10, padding: 28, width: 440, maxWidth: "95vw" },
            onClick: e => e.stopPropagation(),
            children: [
                h("h2", { style: { fontSize: 16, fontWeight: 700, marginBottom: 16 }, children: "Finalizar Workflow" }),
                hs("div", {
                    style: { marginBottom: 12 },
                    children: [
                        h(Label, { children: "Decisão *" }),
                        h("textarea", {
                            value: decisao,
                            onChange: e => setDecisao(e.target.value),
                            rows: 4,
                            style: { width: "100%", border: "1px solid #e5e7eb", borderRadius: 6, padding: "6px 10px", fontSize: 14 },
                            placeholder: "Descreva a decisão tomada...",
                        }),
                    ],
                }),
                erro ? h("div", { style: { color: "#991b1b", fontSize: 13, marginBottom: 8 }, children: erro }) : null,
                hs("div", {
                    style: { display: "flex", gap: 8, justifyContent: "flex-end" },
                    children: [
                        h(Button, { variant: "outline", onClick: onClose, children: "Cancelar" }),
                        h(Button, { onClick: finalizar, disabled: loading, style: { background: "#166534", color: "#fff" }, children: loading ? "Finalizando..." : "Finalizar" }),
                    ],
                }),
            ],
        }),
    });
}

function NovoWorkflowModal({ onClose, onDone }) {
    const [form, setForm] = React.useState({ chaveAcesso: "", tipoWorkflow: "", prioridade: "", responsavel: "", setor: "", observacao: "" });
    const [loading, setLoading] = React.useState(false);
    const [erro, setErro] = React.useState("");

    function setF(k, v) { setForm(p => ({ ...p, [k]: v })); }

    async function criar() {
        if (!form.tipoWorkflow || !form.prioridade) { setErro("Tipo e prioridade são obrigatórios."); return; }
        setLoading(true);
        setErro("");
        try {
            await apiFetch("/api/fiscal/workflow", {
                method: "POST",
                body: JSON.stringify(form),
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
        style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
        onClick: onClose,
        children: hs("div", {
            style: { background: "#fff", borderRadius: 10, padding: 28, width: 520, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto" },
            onClick: e => e.stopPropagation(),
            children: [
                h("h2", { style: { fontSize: 16, fontWeight: 700, marginBottom: 16 }, children: "Novo Workflow Fiscal" }),
                hs("div", {
                    style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 },
                    children: [
                        hs("div", { style: { gridColumn: "1 / -1" }, children: [h(Label, { children: "Chave de Acesso" }), h(Input, { value: form.chaveAcesso, onChange: e => setF("chaveAcesso", e.target.value), placeholder: "44 dígitos..." })] }),
                        hs("div", {
                            children: [
                                h(Label, { children: "Tipo Workflow *" }),
                                h("select", {
                                    value: form.tipoWorkflow,
                                    onChange: e => setF("tipoWorkflow", e.target.value),
                                    style: { width: "100%", height: 36, border: "1px solid #e5e7eb", borderRadius: 6, padding: "0 8px", fontSize: 14 },
                                    children: [
                                        h("option", { value: "", children: "Selecione..." }),
                                        h("option", { value: "DIVERGENCIA", children: "Divergência" }),
                                        h("option", { value: "MANIFESTACAO", children: "Manifestação" }),
                                        h("option", { value: "CANCELAMENTO", children: "Cancelamento" }),
                                        h("option", { value: "INUTILIZACAO", children: "Inutilização" }),
                                        h("option", { value: "CONSULTA", children: "Consulta" }),
                                        h("option", { value: "OUTRO", children: "Outro" }),
                                    ],
                                }),
                            ],
                        }),
                        hs("div", {
                            children: [
                                h(Label, { children: "Prioridade *" }),
                                h("select", {
                                    value: form.prioridade,
                                    onChange: e => setF("prioridade", e.target.value),
                                    style: { width: "100%", height: 36, border: "1px solid #e5e7eb", borderRadius: 6, padding: "0 8px", fontSize: 14 },
                                    children: [
                                        h("option", { value: "", children: "Selecione..." }),
                                        h("option", { value: "CRITICA", children: "Crítica" }),
                                        h("option", { value: "ALTA", children: "Alta" }),
                                        h("option", { value: "MEDIA", children: "Média" }),
                                        h("option", { value: "BAIXA", children: "Baixa" }),
                                    ],
                                }),
                            ],
                        }),
                        hs("div", { children: [h(Label, { children: "Responsável" }), h(Input, { value: form.responsavel, onChange: e => setF("responsavel", e.target.value), placeholder: "Nome do responsável..." })] }),
                        hs("div", { children: [h(Label, { children: "Setor" }), h(Input, { value: form.setor, onChange: e => setF("setor", e.target.value), placeholder: "Ex: Fiscal, Jurídico..." })] }),
                        hs("div", { style: { gridColumn: "1 / -1" }, children: [h(Label, { children: "Observação" }), h("textarea", { value: form.observacao, onChange: e => setF("observacao", e.target.value), rows: 3, style: { width: "100%", border: "1px solid #e5e7eb", borderRadius: 6, padding: "6px 10px", fontSize: 14 }, placeholder: "Observação adicional..." })] }),
                    ],
                }),
                erro ? h("div", { style: { color: "#991b1b", fontSize: 13, marginBottom: 8 }, children: erro }) : null,
                hs("div", {
                    style: { display: "flex", gap: 8, justifyContent: "flex-end" },
                    children: [
                        h(Button, { variant: "outline", onClick: onClose, children: "Cancelar" }),
                        h(Button, { onClick: criar, disabled: loading, style: { background: "#2563eb", color: "#fff" }, children: loading ? "Criando..." : "Criar Workflow" }),
                    ],
                }),
            ],
        }),
    });
}

function FiscalWorkflowPage() {
    const [dados, setDados] = React.useState(null);
    const [loading, setLoading] = React.useState(false);
    const [erro, setErro] = React.useState("");
    const [filtros, setFiltros] = React.useState({ status: "", prioridade: "", setor: "", responsavel: "" });
    const [actionLoading, setActionLoading] = React.useState({});
    const [comentarId, setComentarId] = React.useState(null);
    const [finalizarId, setFinalizarId] = React.useState(null);
    const [novoModal, setNovoModal] = React.useState(false);

    async function carregar() {
        setLoading(true);
        setErro("");
        try {
            const params = new URLSearchParams();
            Object.entries(filtros).forEach(([k, v]) => { if (v) params.set(k, v); });
            const qs = params.toString() ? `?${params}` : "";
            const data = await apiFetch(`/api/fiscal/workflow${qs}`);
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
            await apiFetch(`/api/fiscal/workflow/${id}/assumir`, { method: "POST" });
            await carregar();
        } catch (e) {
            alert(e.message);
        } finally {
            setActionLoading(p => ({ ...p, [id + "_assumir"]: false }));
        }
    }

    const kpis = dados?.kpis || {};
    const lista = dados?.workflows || dados?.registros || [];

    return hs("div", {
        style: { padding: 24, maxWidth: 1400, margin: "0 auto" },
        children: [
            hs("div", {
                style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
                children: [
                    hs("div", {
                        children: [
                            h("h1", { style: { fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }, children: "Workflow Fiscal" }),
                            h("p", { style: { fontSize: 14, color: "#6b7280", marginTop: 4 }, children: "Gerencie o ciclo de vida dos processos fiscais com controle de SLA e responsabilidade." }),
                        ],
                    }),
                    h(Button, { onClick: () => setNovoModal(true), style: { background: "#2563eb", color: "#fff" }, children: "+ Novo Workflow" }),
                ],
            }),

            // KPIs
            hs("div", {
                style: { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 },
                children: [
                    h(KpiCard, { title: "Total", value: kpis.total ?? 0 }),
                    h(KpiCard, { title: "Abertos", value: kpis.abertos ?? 0, color: "#1e40af" }),
                    h(KpiCard, { title: "Em Andamento", value: kpis.emAndamento ?? 0, color: "#92400e" }),
                    h(KpiCard, { title: "Vencidos", value: kpis.vencidos ?? 0, color: "#991b1b" }),
                    h(KpiCard, { title: "Concluídos", value: kpis.concluidos ?? 0, color: "#166534" }),
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
                                        style: { height: 36, border: "1px solid #e5e7eb", borderRadius: 6, padding: "0 8px", fontSize: 14 },
                                        children: [
                                            h("option", { value: "", children: "Todos" }),
                                            h("option", { value: "ABERTO", children: "Aberto" }),
                                            h("option", { value: "EM_ANDAMENTO", children: "Em Andamento" }),
                                            h("option", { value: "VENCIDO", children: "Vencido" }),
                                            h("option", { value: "CONCLUIDO", children: "Concluído" }),
                                        ],
                                    }),
                                ],
                            }),
                            hs("div", {
                                children: [
                                    h(Label, { children: "Prioridade" }),
                                    h("select", {
                                        value: filtros.prioridade,
                                        onChange: e => setFiltros(p => ({ ...p, prioridade: e.target.value })),
                                        style: { height: 36, border: "1px solid #e5e7eb", borderRadius: 6, padding: "0 8px", fontSize: 14 },
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
                                    h(Label, { children: "Setor" }),
                                    h(Input, { value: filtros.setor, onChange: e => setFiltros(p => ({ ...p, setor: e.target.value })), placeholder: "Setor...", style: { height: 36, width: 140 } }),
                                ],
                            }),
                            hs("div", {
                                children: [
                                    h(Label, { children: "Responsável" }),
                                    h(Input, { value: filtros.responsavel, onChange: e => setFiltros(p => ({ ...p, responsavel: e.target.value })), placeholder: "Nome...", style: { height: 36, width: 160 } }),
                                ],
                            }),
                            h(Button, { onClick: carregar, style: { background: "#2563eb", color: "#fff", height: 36 }, children: "Filtrar" }),
                            h(Button, { variant: "outline", onClick: () => setFiltros({ status: "", prioridade: "", setor: "", responsavel: "" }), style: { height: 36 }, children: "Limpar" }),
                        ],
                    }),
                }),
            }),

            erro ? h("div", { style: { color: "#991b1b", background: "#fee2e2", padding: 12, borderRadius: 8, marginBottom: 16 }, children: erro }) : null,
            loading ? h("div", { style: { textAlign: "center", padding: 40, color: "#6b7280" }, children: "Carregando..." }) : null,

            // Tabela
            !loading && h(Card, {
                children: h(CardContent, {
                    style: { padding: 0, overflowX: "auto" },
                    children: h("table", {
                        style: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
                        children: hs("tbody", {
                            children: [
                                h("tr", {
                                    style: { background: "#f9fafb", borderBottom: "1px solid #e5e7eb" },
                                    children: [
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "ID" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "Chave" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "Tipo Workflow" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "Prioridade" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "Status" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "Responsável" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "Setor" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "SLA" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "Abertura" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "Ações" }),
                                    ],
                                }),
                                ...lista.length === 0
                                    ? [h("tr", { children: h("td", { colSpan: 10, style: { padding: 40, textAlign: "center", color: "#6b7280" }, children: "Nenhum workflow encontrado." }) })]
                                    : lista.map(row => {
                                        const vencido = isSlaVencido(row.sla);
                                        return hs("tr", {
                                            style: { borderBottom: "1px solid #f3f4f6" },
                                            children: [
                                                h("td", { style: { padding: "8px 12px" }, children: row.id }),
                                                h("td", { style: { padding: "8px 12px", fontFamily: "monospace", fontSize: 12 }, children: truncar(row.chave || row.chaveAcesso, 18) }),
                                                h("td", { style: { padding: "8px 12px", color: "#374151" }, children: String(row.tipoWorkflow || row.tipo || "-").replace(/_/g, " ") }),
                                                h("td", { style: { padding: "8px 12px" }, children: prioridadeBadge(row.prioridade) }),
                                                h("td", { style: { padding: "8px 12px" }, children: statusBadge(row.status) }),
                                                h("td", { style: { padding: "8px 12px" }, children: row.responsavel || "-" }),
                                                h("td", { style: { padding: "8px 12px" }, children: row.setor || "-" }),
                                                h("td", { style: { padding: "8px 12px", color: vencido ? "#991b1b" : "#111827", fontWeight: vencido ? 700 : 400 }, children: formatDate(row.sla) }),
                                                h("td", { style: { padding: "8px 12px" }, children: formatDate(row.abertura || row.criadoEm || row.createdAt || row.created_at) }),
                                                hs("td", {
                                                    style: { padding: "8px 12px", verticalAlign: "middle", whiteSpace: "nowrap" },
                                                    children: hs("div", {
                                                        style: { display: "flex", gap: 4, alignItems: "center", flexWrap: "nowrap" },
                                                        children: [
                                                            h(Button, { key: "as", variant: "outline", size: "sm", disabled: !!actionLoading[row.id + "_assumir"], onClick: () => assumir(row.id), style: { fontSize: 12, whiteSpace: "nowrap" }, children: actionLoading[row.id + "_assumir"] ? "..." : "Assumir" }),
                                                            h(Button, { key: "cm", variant: "outline", size: "sm", onClick: () => setComentarId(row.id), style: { fontSize: 12, whiteSpace: "nowrap" }, children: "Comentar" }),
                                                            h(Button, { key: "fn", variant: "outline", size: "sm", onClick: () => setFinalizarId(row.id), style: { fontSize: 12, whiteSpace: "nowrap" }, children: "Finalizar" }),
                                                        ],
                                                    }),
                                                }),
                                            ],
                                        }, row.id);
                                    }),
                            ],
                        }),
                    }),
                }),
            }),

            comentarId ? h(ComentarModal, { wfId: comentarId, onClose: () => setComentarId(null), onDone: carregar }) : null,
            finalizarId ? h(FinalizarModal, { wfId: finalizarId, onClose: () => setFinalizarId(null), onDone: carregar }) : null,
            novoModal ? h(NovoWorkflowModal, { onClose: () => setNovoModal(false), onDone: carregar }) : null,
        ],
    });
}

export default FiscalWorkflowPage;
