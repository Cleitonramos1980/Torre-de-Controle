import { r as React, j as jsxRuntime } from "./index-Cw1PFMX8.js";

const h = React.createElement;

function getToken() { try { return JSON.parse(localStorage.getItem("sgq.authSession") || "{}").token || ""; } catch { return ""; } }
async function apiFetch(path, opts) {
    const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(opts?.headers || {}) } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || json?.message || `Erro ${res.status}`);
    return json;
}

const emptyServico = () => ({ codigo: "", descricao: "", aliquota: "", cnaeVinculado: "", ativo: true });

function ModalServico({ servico, onSalvar, onFechar, salvando }) {
    const [form, setForm] = React.useState(servico ? { ...servico } : emptyServico());
    const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const inp = (label, key, type) => h("div", { style: { display: "flex", flexDirection: "column", gap: 4 } },
        h("label", { style: { fontSize: 12, color: "#374151", fontWeight: 600 } }, label),
        h("input", { type: type || "text", value: form[key] ?? "", onChange: e => setF(key, e.target.value),
            style: { border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: 13 } })
    );

    return h("div", { style: { position: "fixed", inset: 0, background: "#0006", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 } },
        h("div", { style: { background: "#fff", borderRadius: 12, padding: 28, width: 480, boxShadow: "0 20px 60px #0003" } },
            h("h3", { style: { margin: "0 0 20px", fontSize: 16, fontWeight: 700 } }, servico ? "Editar Servico" : "Novo Servico"),
            h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 } },
                inp("Codigo do Servico", "codigo"),
                inp("Aliquota ISS (%)", "aliquota", "number"),
                inp("CNAE Vinculado", "cnaeVinculado"),
                h("div", { style: { display: "flex", alignItems: "center", gap: 8, paddingTop: 20 } },
                    h("input", { type: "checkbox", id: "svcAtivo", checked: !!form.ativo, onChange: e => setF("ativo", e.target.checked), style: { width: 16, height: 16 } }),
                    h("label", { htmlFor: "svcAtivo", style: { fontSize: 13, cursor: "pointer" } }, "Ativo")
                )
            ),
            h("div", { style: { marginBottom: 14 } },
                h("label", { style: { fontSize: 12, color: "#374151", fontWeight: 600, display: "block", marginBottom: 4 } }, "Descricao do Servico"),
                h("textarea", { value: form.descricao || "", onChange: e => setF("descricao", e.target.value), rows: 3,
                    style: { width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: 10, fontSize: 13, resize: "vertical", boxSizing: "border-box" } })
            ),
            h("div", { style: { display: "flex", gap: 10, justifyContent: "flex-end" } },
                h("button", { onClick: onFechar, style: { border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 18px", cursor: "pointer", background: "#fff" } }, "Cancelar"),
                h("button", { onClick: () => onSalvar(form), disabled: salvando || !form.codigo || !form.descricao,
                    style: { background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "8px 22px", cursor: "pointer", fontWeight: 600, opacity: salvando ? 0.7 : 1 } },
                    salvando ? "Salvando..." : "Salvar")
            )
        )
    );
}

export default function FiscalNFSeServicosPage() {
    const [lista, setLista] = React.useState([]);
    const [total, setTotal] = React.useState(0);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState("");
    const [info, setInfo] = React.useState("");
    const [busca, setBusca] = React.useState("");
    const [modal, setModal] = React.useState(null);
    const [salvando, setSalvando] = React.useState(false);
    const [excluindo, setExcluindo] = React.useState(null);

    const carregar = React.useCallback(async () => {
        setLoading(true); setErro("");
        try {
            const qs = busca ? `?search=${encodeURIComponent(busca)}` : "";
            const r = await apiFetch(`/api/fiscal/nfse/servicos${qs}`);
            const items = r.items || r.data || r || [];
            setLista(items);
            setTotal(Array.isArray(items) ? items.length : r.total || 0);
        } catch (e) { setErro(e.message); }
        finally { setLoading(false); }
    }, [busca]);

    React.useEffect(() => { carregar(); }, []);

    const salvar = async (form) => {
        setSalvando(true); setErro(""); setInfo("");
        try {
            if (form.id) {
                await apiFetch(`/api/fiscal/nfse/servicos/${form.id}`, { method: "PUT", body: JSON.stringify(form) });
                setInfo("Servico atualizado com sucesso.");
            } else {
                await apiFetch("/api/fiscal/nfse/servicos", { method: "POST", body: JSON.stringify(form) });
                setInfo("Servico cadastrado com sucesso.");
            }
            setModal(null);
            await carregar();
        } catch (e) { setErro(e.message); }
        finally { setSalvando(false); }
    };

    const excluir = async (id) => {
        setExcluindo(id);
        try {
            await apiFetch(`/api/fiscal/nfse/servicos/${id}`, { method: "DELETE" });
            setInfo("Servico removido.");
            await carregar();
        } catch (e) { setErro(e.message); }
        finally { setExcluindo(null); }
    };

    const filtered = busca
        ? lista.filter(s => s.codigo?.toLowerCase().includes(busca.toLowerCase()) || s.descricao?.toLowerCase().includes(busca.toLowerCase()))
        : lista;

    return h("div", { style: { padding: 24, minHeight: "100vh", background: "#f9fafb" } },
        h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 } },
            h("div", null,
                h("h1", { style: { fontSize: 20, fontWeight: 700, margin: 0 } }, "Catalogo de Servicos NFS-e"),
                h("p", { style: { color: "#6b7280", margin: "3px 0 0", fontSize: 13 } }, `${total} servico(s) cadastrado(s)`)
            ),
            h("button", { onClick: () => setModal(emptyServico()),
                style: { background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", cursor: "pointer", fontWeight: 600, fontSize: 13 } },
                "+ Novo Servico")
        ),
        erro && h("div", { style: { background: "#fef2f2", color: "#dc2626", padding: "10px 16px", borderRadius: 8, marginBottom: 12 } }, erro),
        info && h("div", { style: { background: "#f0fdf4", color: "#16a34a", padding: "10px 16px", borderRadius: 8, marginBottom: 12 } }, info),
        h("div", { style: { background: "#fff", borderRadius: 10, padding: 16, boxShadow: "0 1px 4px #0001", marginBottom: 16, display: "flex", gap: 10, alignItems: "center" } },
            h("input", { value: busca, onChange: e => setBusca(e.target.value), placeholder: "Buscar por codigo ou descricao...",
                style: { flex: 1, border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 12px", fontSize: 13 } }),
            h("button", { onClick: carregar, style: { background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 14px", cursor: "pointer", fontSize: 13 } }, "Buscar")
        ),
        h("div", { style: { background: "#fff", borderRadius: 10, boxShadow: "0 1px 4px #0001", overflow: "hidden" } },
            loading ? h("div", { style: { padding: 40, textAlign: "center", color: "#6b7280" } }, "Carregando...") :
            filtered.length === 0 ? h("div", { style: { padding: 40, textAlign: "center", color: "#9ca3af" } }, "Nenhum servico cadastrado. Clique em '+ Novo Servico' para comecar.") :
            h("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 13 } },
                h("thead", null,
                    h("tr", { style: { background: "#f9fafb", borderBottom: "1px solid #e5e7eb" } },
                        ["Codigo","Descricao","Aliquota ISS","CNAE","Status","Acoes"].map(c =>
                            h("th", { key: c, style: { padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#6b7280" } }, c)
                        )
                    )
                ),
                h("tbody", null,
                    filtered.map(s =>
                        h("tr", { key: s.id || s.codigo, style: { borderBottom: "1px solid #f3f4f6" } },
                            h("td", { style: { padding: "10px 14px", fontWeight: 700, color: "#1d4ed8", fontFamily: "monospace" } }, s.codigo),
                            h("td", { style: { padding: "10px 14px", maxWidth: 300 } }, s.descricao),
                            h("td", { style: { padding: "10px 14px" } }, s.aliquota ? `${s.aliquota}%` : "—"),
                            h("td", { style: { padding: "10px 14px", fontFamily: "monospace", fontSize: 12 } }, s.cnaeVinculado || "—"),
                            h("td", { style: { padding: "10px 14px" } },
                                h("span", { style: { background: s.ativo !== false ? "#dcfce7" : "#f3f4f6", color: s.ativo !== false ? "#166534" : "#6b7280", padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700 } },
                                    s.ativo !== false ? "Ativo" : "Inativo")
                            ),
                            h("td", { style: { padding: "10px 14px" } },
                                h("div", { style: { display: "flex", gap: 6 } },
                                    h("button", { onClick: () => setModal({ ...s }),
                                        style: { background: "#eff6ff", color: "#1d4ed8", border: "1px solid #bfdbfe", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 12 } }, "Editar"),
                                    h("button", { onClick: () => excluir(s.id), disabled: excluindo === s.id,
                                        style: { background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontSize: 12 } },
                                        excluindo === s.id ? "..." : "Remover")
                                )
                            )
                        )
                    )
                )
            )
        ),
        modal && h(ModalServico, { servico: modal, onSalvar: salvar, onFechar: () => setModal(null), salvando })
    );
}
