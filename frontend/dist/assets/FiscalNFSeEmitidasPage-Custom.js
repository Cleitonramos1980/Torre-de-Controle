import { r as React, j as jsxRuntime } from "./index-Cw1PFMX8.js";

const h = React.createElement;

function getToken() { try { return JSON.parse(localStorage.getItem("sgq.authSession") || "{}").token || ""; } catch { return ""; } }
async function apiFetch(path, opts) {
    const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(opts?.headers || {}) } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || json?.message || `Erro ${res.status}`);
    return json;
}

function fmt(v) { const n = Number(v ?? 0); return Number.isFinite(n) ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "R$ 0,00"; }
function fmtDate(v) { if (!v) return "—"; const d = new Date(String(v).slice(0,10)+"T00:00:00"); return isNaN(d) ? v : d.toLocaleDateString("pt-BR"); }

const STATUS_COLORS = {
    AUTORIZADA: { bg: "#dcfce7", color: "#166534" },
    CANCELADA:  { bg: "#fee2e2", color: "#dc2626" },
    NEGADA:     { bg: "#fef2f2", color: "#b91c1c" },
    PENDENTE:   { bg: "#fef3c7", color: "#92400e" },
    PROCESSANDO:{ bg: "#dbeafe", color: "#1e40af" },
};

function Badge({ status }) {
    const s = STATUS_COLORS[status] || { bg: "#f3f4f6", color: "#374151" };
    return h("span", { style: { background: s.bg, color: s.color, padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700, whiteSpace: "nowrap" } }, status || "—");
}

export default function FiscalNFSeEmitidasPage() {
    const [lista, setLista] = React.useState([]);
    const [total, setTotal] = React.useState(0);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState("");
    const [info, setInfo] = React.useState("");
    const [page, setPage] = React.useState(1);
    const [filtros, setFiltros] = React.useState({ tomadorNome: "", status: "", dtInicio: "", dtFim: "" });
    const [cancelando, setCancelando] = React.useState(null);
    const [motivoCancelamento, setMotivoCancelamento] = React.useState("");
    const pageSize = 20;

    const carregar = React.useCallback(async (pg, f) => {
        setLoading(true); setErro("");
        try {
            const p = f || filtros;
            const qs = new URLSearchParams({ page: pg || page, pageSize, ...Object.fromEntries(Object.entries(p).filter(([,v]) => v)) }).toString();
            const r = await apiFetch(`/api/fiscal/nfse/emitidas?${qs}`);
            setLista(r.items || r.data || []);
            setTotal(r.total || 0);
        } catch (e) { setErro(e.message); }
        finally { setLoading(false); }
    }, [page, filtros]);

    React.useEffect(() => { carregar(); }, []);

    const buscar = () => { setPage(1); carregar(1, filtros); };

    const cancelar = async (id) => {
        if (!motivoCancelamento.trim()) return;
        try {
            await apiFetch(`/api/fiscal/nfse/emitidas/${id}/cancelar`, { method: "POST", body: JSON.stringify({ motivo: motivoCancelamento }) });
            setInfo("NFS-e cancelada com sucesso."); setCancelando(null); setMotivoCancelamento("");
            await carregar();
        } catch (e) { setErro(e.message); }
    };

    const totalPages = Math.ceil(total / pageSize);

    const input = (label, key, type) => h("div", { key, style: { display: "flex", flexDirection: "column", gap: 4 } },
        h("label", { style: { fontSize: 12, color: "#374151", fontWeight: 500 } }, label),
        h("input", { type: type || "text", value: filtros[key], onChange: e => setFiltros(p => ({ ...p, [key]: e.target.value }),),
            style: { border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 } })
    );

    return h("div", { style: { padding: 24, minHeight: "100vh", background: "#f9fafb" } },
        h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 } },
            h("div", null,
                h("h1", { style: { fontSize: 20, fontWeight: 700, margin: 0 } }, "NFS-e Emitidas"),
                h("p", { style: { color: "#6b7280", margin: "3px 0 0", fontSize: 13 } }, `${total} nota(s) encontrada(s)`)
            ),
            h("button", { onClick: () => window.location.hash = "#/fiscal/nfse-nova-emissao",
                style: { background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", cursor: "pointer", fontWeight: 600, fontSize: 13 } },
                "+ Nova NFS-e")
        ),
        erro && h("div", { style: { background: "#fef2f2", color: "#dc2626", padding: "10px 16px", borderRadius: 8, marginBottom: 12 } }, erro),
        info && h("div", { style: { background: "#f0fdf4", color: "#16a34a", padding: "10px 16px", borderRadius: 8, marginBottom: 12 } }, info),
        // Filtros
        h("div", { style: { background: "#fff", borderRadius: 10, padding: 16, boxShadow: "0 1px 4px #0001", marginBottom: 16, display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: 12, alignItems: "end" } },
            input("Tomador", "tomadorNome"),
            h("div", { style: { display: "flex", flexDirection: "column", gap: 4 } },
                h("label", { style: { fontSize: 12, color: "#374151", fontWeight: 500 } }, "Status"),
                h("select", { value: filtros.status, onChange: e => setFiltros(p => ({ ...p, status: e.target.value })),
                    style: { border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13 } },
                    h("option", { value: "" }, "Todos"),
                    ["AUTORIZADA","CANCELADA","NEGADA","PENDENTE","PROCESSANDO"].map(s => h("option", { key: s, value: s }, s))
                )
            ),
            input("Data Início", "dtInicio", "date"),
            input("Data Fim", "dtFim", "date"),
            h("button", { onClick: buscar, style: { background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", cursor: "pointer", fontWeight: 600 } }, "Buscar")
        ),
        // Tabela
        h("div", { style: { background: "#fff", borderRadius: 10, boxShadow: "0 1px 4px #0001", overflow: "hidden" } },
            loading ? h("div", { style: { padding: 40, textAlign: "center", color: "#6b7280" } }, "Carregando...") :
            lista.length === 0 ? h("div", { style: { padding: 40, textAlign: "center", color: "#9ca3af" } }, "Nenhuma NFS-e encontrada.") :
            h("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 13 } },
                h("thead", null,
                    h("tr", { style: { background: "#f9fafb", borderBottom: "1px solid #e5e7eb" } },
                        ["Nº / Série","Emissão","Tomador","CNPJ Tomador","Valor","ISS","Status","Ações"].map(c =>
                            h("th", { key: c, style: { padding: "10px 12px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6b7280" } }, c)
                        )
                    )
                ),
                h("tbody", null,
                    lista.map(n =>
                        h("tr", { key: n.id, style: { borderBottom: "1px solid #f3f4f6" } },
                            h("td", { style: { padding: "10px 12px", fontWeight: 600, color: "#1d4ed8" } }, `${n.numero || "—"}/${n.serie || "1"}`),
                            h("td", { style: { padding: "10px 12px" } }, fmtDate(n.dataEmissao)),
                            h("td", { style: { padding: "10px 12px", fontWeight: 500 } }, n.tomadorNome || "—"),
                            h("td", { style: { padding: "10px 12px", fontFamily: "monospace", fontSize: 12 } }, n.tomadorCnpj || "—"),
                            h("td", { style: { padding: "10px 12px", fontWeight: 600 } }, fmt(n.valorServico)),
                            h("td", { style: { padding: "10px 12px" } }, fmt(n.valorIss)),
                            h("td", { style: { padding: "10px 12px" } }, h(Badge, { status: n.status })),
                            h("td", { style: { padding: "10px 12px" } },
                                h("div", { style: { display: "flex", gap: 6 } },
                                    n.status === "AUTORIZADA" && h("button", { onClick: () => { setCancelando(n.id); setMotivoCancelamento(""); },
                                        style: { background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 12 } },
                                        "Cancelar"
                                    )
                                )
                            )
                        )
                    )
                )
            )
        ),
        // Paginacao
        totalPages > 1 && h("div", { style: { display: "flex", justifyContent: "center", gap: 8, marginTop: 16 } },
            h("button", { onClick: () => { setPage(p => Math.max(1,p-1)); carregar(Math.max(1,page-1), filtros); }, disabled: page <= 1,
                style: { border: "1px solid #d1d5db", borderRadius: 6, padding: "5px 14px", cursor: "pointer", background: "#fff" } }, "Anterior"),
            h("span", { style: { padding: "5px 14px", fontSize: 13, color: "#374151" } }, `Página ${page} de ${totalPages}`),
            h("button", { onClick: () => { setPage(p => Math.min(totalPages,p+1)); carregar(Math.min(totalPages,page+1), filtros); }, disabled: page >= totalPages,
                style: { border: "1px solid #d1d5db", borderRadius: 6, padding: "5px 14px", cursor: "pointer", background: "#fff" } }, "Próxima")
        ),
        // Modal cancelamento
        cancelando && h("div", { style: { position: "fixed", inset: 0, background: "#0006", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 } },
            h("div", { style: { background: "#fff", borderRadius: 12, padding: 28, width: 440, boxShadow: "0 20px 60px #0003" } },
                h("h3", { style: { margin: "0 0 16px", fontSize: 16, fontWeight: 700 } }, "Cancelar NFS-e"),
                h("p", { style: { fontSize: 13, color: "#6b7280", margin: "0 0 12px" } }, "Informe o motivo do cancelamento:"),
                h("textarea", { value: motivoCancelamento, onChange: e => setMotivoCancelamento(e.target.value), rows: 3,
                    style: { width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: 10, fontSize: 13, resize: "vertical", boxSizing: "border-box" } }),
                h("div", { style: { display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" } },
                    h("button", { onClick: () => setCancelando(null),
                        style: { border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 18px", cursor: "pointer", background: "#fff" } }, "Voltar"),
                    h("button", { onClick: () => cancelar(cancelando), disabled: !motivoCancelamento.trim(),
                        style: { background: "#dc2626", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", cursor: "pointer", fontWeight: 600 } }, "Confirmar Cancelamento")
                )
            )
        )
    );
}
