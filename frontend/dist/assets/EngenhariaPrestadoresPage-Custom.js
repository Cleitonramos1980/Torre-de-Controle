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

function formatDate(v) {
    if (!v) return "—";
    const d = new Date(`${String(v).slice(0, 10)}T00:00:00`);
    if (isNaN(d)) return String(v);
    return d.toLocaleDateString("pt-BR");
}

function StarRating({ value, onChange, readonly }) {
    const stars = [1, 2, 3, 4, 5];
    return h("div", {
        style: { display: "flex", gap: "2px" },
        children: stars.map(s => h("span", {
            key: s,
            style: { fontSize: "18px", cursor: readonly ? "default" : "pointer", color: s <= Math.round(value || 0) ? "#f59e0b" : "#d1d5db" },
            onClick: () => !readonly && onChange && onChange(s),
            children: "★",
        })),
    });
}

function DocsBadge({ validade }) {
    if (!validade) return h("span", { style: { fontSize: "11px", color: "#9ca3af" }, children: "Docs: —" });
    const ok = new Date(`${String(validade).slice(0, 10)}T00:00:00`) > new Date();
    return h("span", {
        style: { fontSize: "11px", padding: "2px 8px", borderRadius: "9999px", background: ok ? "#dcfce7" : "#fee2e2", color: ok ? "#166534" : "#991b1b", fontWeight: 600 },
        children: `Docs: ${ok ? "OK" : "Vencido"} (${formatDate(validade)})`,
    });
}

function ModalPrestador({ prestador, onClose, onSalvo }) {
    const isEdit = !!prestador?.ID;
    const [form, setForm] = React.useState({
        razao_social: prestador?.RAZAO_SOCIAL || "",
        nome_fantasia: prestador?.NOME_FANTASIA || "",
        cnpj: prestador?.CNPJ || "",
        especialidades: prestador?.ESPECIALIDADES || "",
        contato_nome: prestador?.CONTATO_NOME || "",
        contato_fone: prestador?.CONTATO_FONE || "",
        contato_email: prestador?.CONTATO_EMAIL || "",
        cidade: prestador?.CIDADE || "",
        uf: prestador?.UF || "",
        validade_docs: prestador?.VALIDADE_DOCS ? String(prestador.VALIDADE_DOCS).slice(0, 10) : "",
        obs: prestador?.OBS || "",
        ativo: prestador?.ATIVO !== 0,
    });
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState("");
    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const salvar = async () => {
        if (!form.razao_social.trim()) { setErro("Razão Social obrigatória."); return; }
        setSalvando(true); setErro("");
        try {
            const body = {
                razao_social: form.razao_social.trim(),
                nome_fantasia: form.nome_fantasia || undefined,
                cnpj: form.cnpj || undefined,
                especialidades: form.especialidades || undefined,
                contato_nome: form.contato_nome || undefined,
                contato_fone: form.contato_fone || undefined,
                contato_email: form.contato_email || undefined,
                cidade: form.cidade || undefined,
                uf: form.uf || undefined,
                validade_docs: form.validade_docs || undefined,
                obs: form.obs || undefined,
                ativo: form.ativo ? 1 : 0,
            };
            if (isEdit) {
                await apiFetch(`/api/engenharia/prestadores/${prestador.ID}`, { method: "PATCH", body: JSON.stringify(body) });
            } else {
                await apiFetch("/api/engenharia/prestadores", { method: "POST", body: JSON.stringify(body) });
            }
            onSalvo();
        } catch (e) {
            setErro(e.message || "Erro ao salvar prestador.");
        } finally {
            setSalvando(false);
        }
    };

    const inp = { padding: "8px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px", width: "100%", boxSizing: "border-box" };
    const row2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" };
    const lbl = (t) => h("label", { style: { fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }, children: t });

    return hs("div", {
        style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" },
        children: h(Card, {
            style: { width: "620px", maxHeight: "92vh", overflowY: "auto" },
            children: h(CardContent, {
                style: { padding: "24px" },
                children: hs("div", {
                    style: { display: "flex", flexDirection: "column", gap: "14px" },
                    children: [
                        hs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
                            h("h2", { style: { fontSize: "18px", fontWeight: 700, margin: 0 }, children: isEdit ? "Editar Prestador" : "Novo Prestador" }),
                            h("button", { onClick: onClose, style: { background: "none", border: "none", fontSize: "20px", cursor: "pointer" }, children: "×" }),
                        ] }),

                        hs("div", { style: row2, children: [
                            hs("div", { children: [lbl("Razão Social *"), h("input", { style: inp, value: form.razao_social, onChange: e => set("razao_social", e.target.value), placeholder: "Razão social da empresa" })] }),
                            hs("div", { children: [lbl("Nome Fantasia"), h("input", { style: inp, value: form.nome_fantasia, onChange: e => set("nome_fantasia", e.target.value), placeholder: "Nome comercial" })] }),
                        ] }),

                        hs("div", { style: row2, children: [
                            hs("div", { children: [lbl("CNPJ"), h("input", { style: inp, value: form.cnpj, onChange: e => set("cnpj", e.target.value), placeholder: "00.000.000/0000-00" })] }),
                            hs("div", { children: [lbl("Especialidades"), h("input", { style: inp, value: form.especialidades, onChange: e => set("especialidades", e.target.value), placeholder: "Ex: Elétrica, AVAC, Civil..." })] }),
                        ] }),

                        h("p", { style: { fontSize: "12px", fontWeight: 700, margin: 0 }, children: "Contato" }),
                        hs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }, children: [
                            hs("div", { children: [lbl("Nome"), h("input", { style: inp, value: form.contato_nome, onChange: e => set("contato_nome", e.target.value), placeholder: "Nome do contato" })] }),
                            hs("div", { children: [lbl("Telefone"), h("input", { style: inp, value: form.contato_fone, onChange: e => set("contato_fone", e.target.value), placeholder: "(00) 00000-0000" })] }),
                            hs("div", { children: [lbl("E-mail"), h("input", { style: inp, value: form.contato_email, onChange: e => set("contato_email", e.target.value), placeholder: "email@prestador.com" })] }),
                        ] }),

                        hs("div", { style: { display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "12px" }, children: [
                            hs("div", { children: [lbl("Cidade"), h("input", { style: inp, value: form.cidade, onChange: e => set("cidade", e.target.value), placeholder: "Cidade" })] }),
                            hs("div", { children: [lbl("UF"), h("input", { style: inp, maxLength: 2, value: form.uf, onChange: e => set("uf", e.target.value.toUpperCase()), placeholder: "SP" })] }),
                            hs("div", { children: [lbl("Validade Docs"), h("input", { type: "date", style: inp, value: form.validade_docs, onChange: e => set("validade_docs", e.target.value) })] }),
                        ] }),

                        hs("div", { children: [lbl("Observações"), h("textarea", { style: { ...inp, minHeight: "60px" }, value: form.obs, onChange: e => set("obs", e.target.value) })] }),

                        hs("label", { style: { display: "flex", gap: "8px", alignItems: "center", cursor: "pointer", fontSize: "13px" }, children: [
                            h("input", { type: "checkbox", checked: form.ativo, onChange: e => set("ativo", e.target.checked) }),
                            "Prestador ativo",
                        ] }),

                        erro ? h("div", { style: { background: "#fee2e2", color: "#991b1b", padding: "10px 14px", borderRadius: "6px", fontSize: "13px" }, children: erro }) : null,

                        hs("div", { style: { display: "flex", gap: "8px", justifyContent: "flex-end" }, children: [
                            h(Button, { variant: "outline", onClick: onClose, children: "Cancelar" }),
                            h(Button, { onClick: salvar, disabled: salvando, style: { background: "#0891b2", color: "#fff", border: "none" }, children: salvando ? "Salvando..." : (isEdit ? "Salvar" : "Cadastrar Prestador") }),
                        ] }),
                    ],
                }),
            }),
        }),
    });
}

function ModalAvaliar({ prestador, onClose, onSalvo }) {
    const [nota, setNota] = React.useState(0);
    const [obs, setObs] = React.useState("");
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState("");

    const salvar = async () => {
        if (!nota) { setErro("Selecione uma nota de 1 a 5."); return; }
        setSalvando(true); setErro("");
        try {
            await apiFetch(`/api/engenharia/prestadores/${prestador.ID}/avaliar`, {
                method: "POST",
                body: JSON.stringify({ nota, obs }),
            });
            onSalvo();
        } catch (e) {
            setErro(e.message);
        } finally {
            setSalvando(false);
        }
    };

    return hs("div", {
        style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1001, display: "flex", alignItems: "center", justifyContent: "center" },
        children: h(Card, {
            style: { width: "400px" },
            children: h(CardContent, {
                style: { padding: "24px" },
                children: hs("div", {
                    style: { display: "flex", flexDirection: "column", gap: "14px" },
                    children: [
                        hs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [
                            h("h3", { style: { margin: 0, fontSize: "16px", fontWeight: 700 }, children: "Avaliar Prestador" }),
                            h("button", { onClick: onClose, style: { background: "none", border: "none", cursor: "pointer", fontSize: "18px" }, children: "×" }),
                        ] }),
                        h("p", { style: { margin: 0, fontSize: "14px", fontWeight: 600 }, children: prestador.RAZAO_SOCIAL }),
                        hs("div", { children: [
                            h("label", { style: { fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "8px" }, children: "Nota (1 a 5 estrelas)" }),
                            h(StarRating, { value: nota, onChange: setNota }),
                        ] }),
                        hs("div", { children: [
                            h("label", { style: { fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }, children: "Observação (opcional)" }),
                            h("textarea", { style: { width: "100%", boxSizing: "border-box", padding: "8px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px", minHeight: "60px" }, value: obs, onChange: e => setObs(e.target.value), placeholder: "Qualidade do serviço, pontualidade, etc." }),
                        ] }),
                        erro ? h("div", { style: { color: "#dc2626", fontSize: "13px" }, children: erro }) : null,
                        hs("div", { style: { display: "flex", gap: "8px", justifyContent: "flex-end" }, children: [
                            h(Button, { variant: "outline", onClick: onClose, children: "Cancelar" }),
                            h(Button, { onClick: salvar, disabled: salvando || !nota, style: { background: "#f59e0b", color: "#fff", border: "none" }, children: salvando ? "Salvando..." : "Registrar Avaliação" }),
                        ] }),
                    ],
                }),
            }),
        }),
    });
}

export default function EngenhariaPrestadoresPage() {
    const [lista, setLista] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState("");
    const [sucesso, setSucesso] = React.useState("");
    const [filtQ, setFiltQ] = React.useState("");
    const [filtAtivo, setFiltAtivo] = React.useState("1");
    const [modalForm, setModalForm] = React.useState(null);
    const [modalAvaliar, setModalAvaliar] = React.useState(null);

    const carregar = React.useCallback(async () => {
        setErro("");
        try {
            const q = new URLSearchParams();
            if (filtQ) q.set("q", filtQ);
            if (filtAtivo !== "") q.set("ativo", filtAtivo);
            const data = await apiFetch(`/api/engenharia/prestadores?${q}`);
            setLista(Array.isArray(data) ? data : []);
        } catch (e) {
            setErro(e.message || "Erro ao carregar prestadores.");
        } finally {
            setLoading(false);
        }
    }, [filtQ, filtAtivo]);

    React.useEffect(() => { carregar(); }, [carregar]);

    const inp = { padding: "7px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px" };

    return hs("div", {
        style: { padding: "24px", maxWidth: "1400px", margin: "0 auto" },
        children: [
            hs("div", {
                style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", flexWrap: "wrap", gap: "12px" },
                children: [
                    hs("div", { children: [
                        h("h1", { style: { fontSize: "22px", fontWeight: 700, margin: "0 0 4px 0" }, children: "Prestadores de Serviço" }),
                        h("p", { style: { fontSize: "13px", color: "hsl(var(--muted-foreground))", margin: 0 }, children: "Gestão de empresas e técnicos terceirizados" }),
                    ] }),
                    hs("div", { style: { display: "flex", gap: "8px" }, children: [
                        h(Button, { variant: "outline", onClick: carregar, style: { fontSize: "12px" }, children: "↻ Atualizar" }),
                        h(Button, { onClick: () => setModalForm({}), style: { background: "#0891b2", color: "#fff", border: "none", fontSize: "12px" }, children: "+ Novo Prestador" }),
                    ] }),
                ],
            }),

            h(Card, {
                style: { marginBottom: "16px" },
                children: h(CardContent, {
                    style: { padding: "12px 16px" },
                    children: hs("div", { style: { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }, children: [
                        h("input", { style: { ...inp, minWidth: "220px" }, value: filtQ, onChange: e => setFiltQ(e.target.value), placeholder: "Buscar por nome ou CNPJ...", onKeyDown: e => e.key === "Enter" && carregar() }),
                        h("select", { style: inp, value: filtAtivo, onChange: e => setFiltAtivo(e.target.value), children: [
                            h("option", { value: "1", children: "Somente ativos" }),
                            h("option", { value: "0", children: "Somente inativos" }),
                            h("option", { value: "", children: "Todos" }),
                        ] }),
                        h(Button, { variant: "outline", style: { fontSize: "12px" }, onClick: carregar, children: "Buscar" }),
                    ] }),
                }),
            }),

            erro ? h("div", { style: { background: "#fee2e2", color: "#991b1b", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }, children: erro }) : null,
            sucesso ? hs("div", { style: { background: "#dcfce7", color: "#166534", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px", display: "flex", justifyContent: "space-between" }, children: [sucesso, h("span", { style: { cursor: "pointer", fontWeight: 700 }, onClick: () => setSucesso(""), children: "×" })] }) : null,

            loading
                ? h("p", { style: { fontSize: "14px", color: "#6b7280" }, children: "Carregando prestadores..." })
                : lista.length === 0
                    ? h("p", { style: { fontSize: "14px", color: "#6b7280", textAlign: "center", padding: "40px" }, children: "Nenhum prestador encontrado." })
                    : h("div", {
                        style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "12px" },
                        children: lista.map((p, i) => h(Card, {
                            key: p.ID || i,
                            style: { border: p.ATIVO === 0 ? "1px solid #e5e7eb" : undefined, opacity: p.ATIVO === 0 ? 0.6 : 1 },
                            children: h(CardContent, {
                                style: { padding: "16px" },
                                children: hs("div", { style: { display: "flex", flexDirection: "column", gap: "10px" }, children: [
                                    hs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" }, children: [
                                        hs("div", { style: { flex: 1, minWidth: 0 }, children: [
                                            h("p", { style: { fontWeight: 700, fontSize: "14px", margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: p.NOME_FANTASIA || p.RAZAO_SOCIAL }),
                                            p.NOME_FANTASIA ? h("p", { style: { fontSize: "11px", color: "hsl(var(--muted-foreground))", margin: 0 }, children: p.RAZAO_SOCIAL }) : null,
                                        ] }),
                                        p.ATIVO === 0 ? h("span", { style: { fontSize: "10px", background: "#f3f4f6", color: "#6b7280", padding: "2px 6px", borderRadius: "4px", flexShrink: 0 }, children: "INATIVO" }) : null,
                                    ] }),

                                    hs("div", { style: { display: "flex", alignItems: "center", gap: "8px" }, children: [
                                        h(StarRating, { value: p.AVALIACAO_MEDIA || 0, readonly: true }),
                                        h("span", { style: { fontSize: "12px", color: "hsl(var(--muted-foreground))" }, children: `${Number(p.AVALIACAO_MEDIA || 0).toFixed(1)} (${p.TOTAL_OS || 0} OS)` }),
                                    ] }),

                                    p.ESPECIALIDADES ? h("p", { style: { fontSize: "12px", color: "hsl(var(--muted-foreground))", margin: 0 }, children: p.ESPECIALIDADES }) : null,

                                    hs("div", { style: { fontSize: "12px", display: "flex", gap: "12px", flexWrap: "wrap", color: "hsl(var(--muted-foreground))" }, children: [
                                        p.CNPJ ? h("span", { children: p.CNPJ }) : null,
                                        (p.CIDADE || p.UF) ? h("span", { children: `${p.CIDADE || ""}${p.UF ? `/${p.UF}` : ""}` }) : null,
                                    ] }),

                                    p.CONTATO_NOME ? hs("div", { style: { fontSize: "12px", color: "hsl(var(--muted-foreground))" }, children: [
                                        h("span", { children: `${p.CONTATO_NOME}` }),
                                        p.CONTATO_FONE ? h("span", { children: ` · ${p.CONTATO_FONE}` }) : null,
                                    ] }) : null,

                                    h(DocsBadge, { validade: p.VALIDADE_DOCS }),

                                    hs("div", { style: { display: "flex", gap: "6px", justifyContent: "flex-end" }, children: [
                                        h(Button, { variant: "outline", style: { fontSize: "11px", padding: "4px 8px" }, onClick: () => setModalAvaliar(p), children: "Avaliar" }),
                                        h(Button, { variant: "outline", style: { fontSize: "11px", padding: "4px 8px" }, onClick: () => setModalForm(p), children: "Editar" }),
                                    ] }),
                                ] }),
                            }),
                        })),
                    }),

            modalForm !== null ? h(ModalPrestador, {
                prestador: modalForm?.ID ? modalForm : null,
                onClose: () => setModalForm(null),
                onSalvo: () => { setModalForm(null); setSucesso("Prestador salvo com sucesso!"); carregar(); },
            }) : null,

            modalAvaliar ? h(ModalAvaliar, {
                prestador: modalAvaliar,
                onClose: () => setModalAvaliar(null),
                onSalvo: () => { setModalAvaliar(null); setSucesso("Avaliação registrada!"); carregar(); },
            }) : null,
        ],
    });
}
