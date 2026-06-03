import { r as React, j as jsxRuntime, J as Card, N as CardContent, B as Button } from "./index-Cw1PFMX8.js";
import { I as Input } from "./input-CnWhQnjH.js";

const h  = jsxRuntime.jsx;
const hs = jsxRuntime.jsxs;

function getToken() {
    try { return JSON.parse(localStorage.getItem("sgq.authSession") || "{}").token || ""; } catch { return ""; }
}
async function apiFetch(path, opts) {
    const res  = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(opts?.headers || {}) } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || json?.error || json?.message || `Erro ${res.status}`);
    return json;
}
function bq(params) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
        if (v == null) return;
        if (typeof v === "string" && !v.trim()) return;
        q.set(k, String(v));
    });
    const s = q.toString(); return s ? `?${s}` : "";
}
function fmtDate(v) {
    if (!v) return "—";
    const parts = String(v).slice(0, 10).split("-");
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : v;
}

const STATUS_MAP = {
    RASCUNHO:   { bg: "#fef3c7", color: "#92400e", label: "Rascunho"   },
    FINALIZADO: { bg: "#dcfce7", color: "#166534", label: "Finalizado"  },
    CANCELADO:  { bg: "#fee2e2", color: "#991b1b", label: "Cancelado"   },
};
function statusBadge(s) {
    const m = STATUS_MAP[s] || { bg: "#f3f4f6", color: "#6b7280", label: s || "—" };
    return h("span", { style: { background: m.bg, color: m.color, padding: "2px 10px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700 }, children: m.label });
}

export default function ChecklistPortariaListPage() {
    const [filtros,  setFiltros]  = React.useState({ placa: "", motorista: "", status: "", dtInicio: "", dtFim: "" });
    const [dados,    setDados]    = React.useState(null);
    const [loading,  setLoading]  = React.useState(false);
    const [erro,     setErro]     = React.useState(null);

    function carregar(f) {
        const params = f || filtros;
        setLoading(true); setErro(null);
        apiFetch(`/api/portaria/checklists${bq(params)}`)
            .then(r  => setDados(r.data || []))
            .catch(e => setErro(e.message))
            .finally(() => setLoading(false));
    }
    React.useEffect(() => { carregar(); }, []);

    function navForm(id) {
        window.location.href = id ? `/portaria/checklist/${id}` : "/portaria/checklist/novo";
    }
    async function cancelar(id) {
        if (!window.confirm("Cancelar este checklist? Esta ação não pode ser desfeita.")) return;
        try {
            await apiFetch(`/api/portaria/checklists/${id}`, { method: "DELETE" });
            carregar();
        } catch(e) { alert("Erro ao cancelar: " + e.message); }
    }

    const th  = { padding: "9px 14px", textAlign: "left",   fontWeight: 700, fontSize: "11px", color: "#374151", borderBottom: "2px solid #d1d5db", background: "#f9fafb", whiteSpace: "nowrap" };
    const thC = { ...th, textAlign: "center" };
    const td  = { padding: "9px 14px", fontSize: "12px", borderBottom: "1px solid #f3f4f6", verticalAlign: "middle" };
    const tdC = { ...td, textAlign: "center" };

    const setF = (k, v) => setFiltros(f => ({ ...f, [k]: v }));
    const fieldStyle = { fontSize: "11px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "4px" };
    const selectStyle = { width: "100%", padding: "6px 8px", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "12px", background: "#fff" };

    return hs("div", { style: { padding: "24px", maxWidth: "1300px", margin: "0 auto" }, children: [
        // ── Cabeçalho ──
        hs("div", { key: "hdr", style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }, children: [
            hs("div", { key: "t", children: [
                h("h1", { key: "h1", style: { fontSize: "22px", fontWeight: 700, color: "#111827", margin: 0 }, children: "Checklist de Vistoria" }),
                h("p",  { key: "p",  style: { fontSize: "12px", color: "#6b7280", margin: "4px 0 0" }, children: "Acessos / Portaria — Controle de vistoria de veículos" }),
            ]}),
            h(Button, { key: "btn", onClick: () => navForm(null), style: { background: "#2563eb", color: "#fff", fontWeight: 600 }, children: "+ Novo Checklist" }),
        ]}),

        // ── Filtros ──
        h(Card, { key: "filt", style: { marginBottom: "16px" }, children:
            h(CardContent, { style: { padding: "16px" }, children:
                hs("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "12px", alignItems: "end" }, children: [
                    hs("div", { key: "placa", children: [h("label", { key: "l", style: fieldStyle }, "Placa"), h(Input, { key: "i", placeholder: "ABC-1234", value: filtros.placa,     onChange: e => setF("placa", e.target.value) })] }),
                    hs("div", { key: "mot",   children: [h("label", { key: "l", style: fieldStyle }, "Motorista"), h(Input, { key: "i", placeholder: "Nome...", value: filtros.motorista, onChange: e => setF("motorista", e.target.value) })] }),
                    hs("div", { key: "sta",   children: [
                        h("label", { key: "l", style: fieldStyle }, "Status"),
                        h("select", { key: "s", value: filtros.status, onChange: e => setF("status", e.target.value), style: selectStyle, children: [
                            h("option", { key: "a", value: ""           }, "Todos"),
                            h("option", { key: "r", value: "RASCUNHO"   }, "Rascunho"),
                            h("option", { key: "f", value: "FINALIZADO" }, "Finalizado"),
                            h("option", { key: "c", value: "CANCELADO"  }, "Cancelado"),
                        ]}),
                    ]}),
                    hs("div", { key: "di", children: [h("label", { key: "l", style: fieldStyle }, "Data Início"), h(Input, { key: "i", type: "date", value: filtros.dtInicio, onChange: e => setF("dtInicio", e.target.value) })] }),
                    hs("div", { key: "df", children: [h("label", { key: "l", style: fieldStyle }, "Data Fim"),    h(Input, { key: "i", type: "date", value: filtros.dtFim,    onChange: e => setF("dtFim",    e.target.value) })] }),
                    h(Button, { key: "go", onClick: () => carregar(), style: { background: "#2563eb", color: "#fff", alignSelf: "flex-end" }, children: "Filtrar" }),
                ]}),
            }),
        }),

        // ── Tabela ──
        h(Card, { key: "tbl", children:
            h(CardContent, { style: { padding: 0, overflowX: "auto" }, children:
                erro
                    ? h("div", { style: { padding: "32px", color: "#dc2626", textAlign: "center" }, children: "Erro: " + erro })
                    : loading
                        ? h("div", { style: { padding: "32px", color: "#6b7280", textAlign: "center" }, children: "Carregando..." })
                        : (!dados || dados.length === 0)
                            ? h("div", { style: { padding: "48px", color: "#6b7280", textAlign: "center", fontSize: "14px" }, children: 'Nenhum checklist encontrado. Clique em "+ Novo Checklist" para criar.' })
                            : hs("table", { style: { width: "100%", borderCollapse: "collapse" }, children: [
                                h("thead", { key: "head", children:
                                    h("tr", { children: [
                                        h("th", { key: "n",   style: th  }, "Nº Checklist"),
                                        h("th", { key: "pl",  style: th  }, "Placa"),
                                        h("th", { key: "ve",  style: th  }, "Veículo"),
                                        h("th", { key: "mo",  style: th  }, "Motorista"),
                                        h("th", { key: "pr",  style: th  }, "Proprietário"),
                                        h("th", { key: "se",  style: th  }, "Seguradora"),
                                        h("th", { key: "dt",  style: th  }, "Data"),
                                        h("th", { key: "st",  style: th  }, "Status"),
                                        h("th", { key: "ac",  style: thC }, "Ações"),
                                    ]}),
                                }),
                                h("tbody", { key: "body", children:
                                    dados.map(c => h("tr", { key: c.id, style: { background: "#fff" }, children: [
                                        h("td", { key: "n",  style: { ...td, fontWeight: 700, color: "#2563eb" } }, c.numeroChecklist || "—"),
                                        h("td", { key: "pl", style: td }, c.placa || "—"),
                                        h("td", { key: "ve", style: td }, c.veiculo || "—"),
                                        h("td", { key: "mo", style: td }, c.motorista || "—"),
                                        h("td", { key: "pr", style: td }, c.proprietario || "—"),
                                        h("td", { key: "se", style: td }, c.seguradora || "—"),
                                        h("td", { key: "dt", style: td }, fmtDate(c.dataSolicitacao)),
                                        h("td", { key: "st", style: td }, statusBadge(c.status)),
                                        h("td", { key: "ac", style: tdC }, hs("div", { style: { display: "flex", gap: "6px", justifyContent: "center", flexWrap: "wrap" } }, [
                                            c.status !== "CANCELADO" && h("button", { key: "ed", onClick: () => navForm(c.id), style: { padding: "4px 10px", fontSize: "11px", fontWeight: 600, background: "#2563eb", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" } }, "Editar"),
                                            h("button", { key: "pr", onClick: () => { window.open(`/portaria/checklist/${c.id}?imprimir=1`, "_blank"); }, style: { padding: "4px 10px", fontSize: "11px", fontWeight: 600, background: "#059669", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" } }, "Imprimir"),
                                            c.status === "RASCUNHO" && h("button", { key: "ca", onClick: () => cancelar(c.id), style: { padding: "4px 10px", fontSize: "11px", fontWeight: 600, background: "#dc2626", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" } }, "Cancelar"),
                                        ].filter(Boolean))),
                                    ]}))
                                }),
                            ]}),
            }),
        }),
    ]});
}
