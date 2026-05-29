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

function Modal({ onClose, children }) {
    return h("div", {
        style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" },
        onClick: (e) => { if (e.target === e.currentTarget) onClose(); },
        children: h("div", {
            style: { background: "hsl(var(--background))", borderRadius: "12px", padding: "28px", width: "100%", maxWidth: "540px", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" },
            children,
        }),
    });
}

function SectionTitle({ children }) {
    return h("h2", {
        style: { fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "hsl(var(--muted-foreground))", margin: "0 0 12px 0" },
        children,
    });
}

function SyncStatusBadge({ status }) {
    const map = {
        aguardando: { background: "#f3f4f6", color: "#6b7280" },
        ok: { background: "#dcfce7", color: "#166534" },
        erro: { background: "#fee2e2", color: "#991b1b" },
        bloqueado: { background: "#fef3c7", color: "#92400e" },
    };
    const s = map[status] || map.aguardando;
    return h("span", {
        style: { ...s, padding: "2px 10px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700 },
        children: status || "—",
    });
}

function ModalCnpj({ onClose, onSalvo }) {
    const [form, setForm] = React.useState({
        cnpj: "", cnpjFormatado: "", cnpjRaiz: "", razaoSocial: "", nomeFantasia: "",
        filialWinthor: "", uf: "", municipio: "", ambiente: "PRODUCAO",
        monitorarNfe: true, monitorarCte: false,
    });
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState("");

    const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

    const salvar = async () => {
        if (!form.cnpj.trim()) { setErro("CNPJ é obrigatório."); return; }
        setSalvando(true);
        setErro("");
        try {
            await apiFetch("/api/fiscal/cnpjs", { method: "POST", body: JSON.stringify(form) });
            onSalvo();
        } catch (e) {
            setErro(e.message || "Erro ao adicionar CNPJ.");
        } finally {
            setSalvando(false);
        }
    };

    const fieldStyle = { display: "flex", flexDirection: "column", gap: "4px" };
    const inputStyle = { padding: "8px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px", width: "100%", boxSizing: "border-box" };
    const labelStyle = { fontSize: "12px", fontWeight: 600, color: "hsl(var(--foreground))" };

    return h(Modal, {
        onClose,
        children: hs("div", { children: [
            hs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }, children: [
                h("h2", { style: { fontSize: "16px", fontWeight: 700, margin: 0 }, children: "Adicionar CNPJ Monitorado" }),
                h("button", { onClick: onClose, style: { background: "none", border: "none", cursor: "pointer", fontSize: "20px", color: "hsl(var(--muted-foreground))" }, children: "×" }),
            ]}),

            // Aviso sobre CNPJ texto
            hs("div", { style: { background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: "8px", padding: "10px 14px", marginBottom: "18px" }, children: [
                h("p", { style: { margin: 0, fontSize: "12px", color: "#92400e", lineHeight: "1.5" }, children: "CNPJ é tratado como texto. Zeros à esquerda são preservados. O sistema está preparado para CNPJ alfanumérico." }),
            ]}),

            hs("div", { style: { display: "flex", flexDirection: "column", gap: "12px" }, children: [
                hs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }, children: [
                    hs("div", { style: fieldStyle, children: [
                        h("label", { style: labelStyle, children: "CNPJ *" }),
                        h("input", { type: "text", value: form.cnpj, onChange: e => set("cnpj", e.target.value), placeholder: "00.000.000/0001-00", maxLength: 18, style: inputStyle }),
                    ]}),
                    hs("div", { style: fieldStyle, children: [
                        h("label", { style: labelStyle, children: "CNPJ Formatado" }),
                        h("input", { type: "text", value: form.cnpjFormatado, onChange: e => set("cnpjFormatado", e.target.value), placeholder: "00.000.000/0001-00", style: inputStyle }),
                    ]}),
                ]}),
                hs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }, children: [
                    hs("div", { style: fieldStyle, children: [
                        h("label", { style: labelStyle, children: "CNPJ Raiz (8 chars)" }),
                        h("input", { type: "text", value: form.cnpjRaiz, onChange: e => set("cnpjRaiz", e.target.value), placeholder: "00000000", maxLength: 8, style: inputStyle }),
                    ]}),
                    hs("div", { style: fieldStyle, children: [
                        h("label", { style: labelStyle, children: "Filial WinThor" }),
                        h("input", { type: "text", value: form.filialWinthor, onChange: e => set("filialWinthor", e.target.value), placeholder: "Código filial", style: inputStyle }),
                    ]}),
                ]}),
                hs("div", { style: fieldStyle, children: [
                    h("label", { style: labelStyle, children: "Razão Social" }),
                    h("input", { type: "text", value: form.razaoSocial, onChange: e => set("razaoSocial", e.target.value), style: inputStyle }),
                ]}),
                hs("div", { style: fieldStyle, children: [
                    h("label", { style: labelStyle, children: "Nome Fantasia" }),
                    h("input", { type: "text", value: form.nomeFantasia, onChange: e => set("nomeFantasia", e.target.value), style: inputStyle }),
                ]}),
                hs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px" }, children: [
                    hs("div", { style: fieldStyle, children: [
                        h("label", { style: labelStyle, children: "UF" }),
                        h("input", { type: "text", value: form.uf, onChange: e => set("uf", e.target.value), maxLength: 2, placeholder: "MG", style: inputStyle }),
                    ]}),
                    hs("div", { style: { ...fieldStyle, gridColumn: "span 2" }, children: [
                        h("label", { style: labelStyle, children: "Município" }),
                        h("input", { type: "text", value: form.municipio, onChange: e => set("municipio", e.target.value), style: inputStyle }),
                    ]}),
                ]}),
                hs("div", { style: fieldStyle, children: [
                    h("label", { style: labelStyle, children: "Ambiente" }),
                    h("select", { value: form.ambiente, onChange: e => set("ambiente", e.target.value), style: inputStyle, children: [
                        h("option", { value: "PRODUCAO", children: "Produção" }),
                        h("option", { value: "HOMOLOGACAO", children: "Homologação" }),
                    ]}),
                ]}),
                hs("div", { style: { display: "flex", gap: "24px" }, children: [
                    hs("label", { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }, children: [
                        h("input", { type: "checkbox", checked: form.monitorarNfe, onChange: e => set("monitorarNfe", e.target.checked), style: { width: "16px", height: "16px" } }),
                        "Monitorar NF-e",
                    ]}),
                    hs("label", { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer" }, children: [
                        h("input", { type: "checkbox", checked: form.monitorarCte, onChange: e => set("monitorarCte", e.target.checked), style: { width: "16px", height: "16px" } }),
                        "Monitorar CT-e",
                    ]}),
                ]}),
                erro ? h("p", { style: { color: "#dc2626", fontSize: "12px", margin: 0 }, children: erro }) : null,
                hs("div", { style: { display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }, children: [
                    h(Button, { variant: "outline", onClick: onClose, children: "Cancelar" }),
                    h(Button, { onClick: salvar, disabled: salvando, style: { background: "#2563eb", color: "#fff" }, children: salvando ? "Salvando..." : "Adicionar CNPJ" }),
                ]}),
            ]}),
        ]}),
    });
}

function SecaoCnpjs({ showToast }) {
    const [lista, setLista] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [showModal, setShowModal] = React.useState(false);

    const carregar = async () => {
        setLoading(true);
        try {
            const data = await apiFetch("/api/fiscal/cnpjs");
            setLista(Array.isArray(data) ? data : (data.cnpjs || []));
        } catch (e) {
            showToast(e.message || "Erro ao carregar CNPJs.", "erro");
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => { carregar(); }, []);

    const thStyle = { padding: "9px 12px", textAlign: "left", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "hsl(var(--muted-foreground))", borderBottom: "1px solid hsl(var(--border))", whiteSpace: "nowrap" };
    const tdStyle = { padding: "9px 12px", fontSize: "13px", borderBottom: "1px solid hsl(var(--border))", verticalAlign: "middle" };
    const checkIcon = (v) => h("span", { style: { color: v ? "#16a34a" : "#9ca3af", fontWeight: 700 }, children: v ? "✓" : "✗" });

    return hs("div", { children: [
        showModal ? h(ModalCnpj, { onClose: () => setShowModal(false), onSalvo: () => { setShowModal(false); carregar(); showToast("CNPJ adicionado com sucesso.", "ok"); } }) : null,
        hs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }, children: [
            h(SectionTitle, { children: "CNPJs Monitorados" }),
            h(Button, { style: { background: "#2563eb", color: "#fff", fontSize: "12px" }, onClick: () => setShowModal(true), children: "+ Adicionar CNPJ" }),
        ]}),
        h(Card, { children: h(CardContent, { style: { padding: 0 }, children:
            loading
                ? h("div", { style: { padding: "30px", textAlign: "center", color: "hsl(var(--muted-foreground))" }, children: "Carregando..." })
                : h("div", { style: { overflowX: "auto" }, children:
                    h("table", { style: { width: "100%", borderCollapse: "collapse" }, children:
                        hs("tbody", { children: [
                            h("tr", { children: [
                                h("th", { style: thStyle, children: "CNPJ" }),
                                h("th", { style: thStyle, children: "Razão Social" }),
                                h("th", { style: thStyle, children: "UF" }),
                                h("th", { style: thStyle, children: "Ambiente" }),
                                h("th", { style: { ...thStyle, textAlign: "center" }, children: "NF-e" }),
                                h("th", { style: { ...thStyle, textAlign: "center" }, children: "CT-e" }),
                                h("th", { style: thStyle, children: "Status" }),
                            ]}),
                            lista.length === 0
                                ? h("tr", { children: h("td", { colSpan: 7, style: { ...tdStyle, textAlign: "center", color: "hsl(var(--muted-foreground))", padding: "30px" }, children: "Nenhum CNPJ cadastrado." }) })
                                : lista.map((c, i) => h("tr", {
                                    key: c.id || i,
                                    onMouseEnter: e => e.currentTarget.style.background = "hsl(var(--muted)/0.4)",
                                    onMouseLeave: e => e.currentTarget.style.background = "",
                                    children: [
                                        h("td", { style: tdStyle, children: h("code", { style: { fontSize: "12px" }, children: c.cnpjFormatado || c.cnpj || "—" }) }),
                                        h("td", { style: tdStyle, children: c.razaoSocial || "—" }),
                                        h("td", { style: tdStyle, children: c.uf || "—" }),
                                        h("td", { style: tdStyle, children: h("span", { style: { fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "9999px", background: c.ambiente === "PRODUCAO" ? "#dbeafe" : "#fef3c7", color: c.ambiente === "PRODUCAO" ? "#1e40af" : "#92400e" }, children: c.ambiente === "PRODUCAO" ? "Produção" : "Homologação" }) }),
                                        h("td", { style: { ...tdStyle, textAlign: "center" }, children: checkIcon(c.monitorarNfe) }),
                                        h("td", { style: { ...tdStyle, textAlign: "center" }, children: checkIcon(c.monitorarCte) }),
                                        h("td", { style: tdStyle, children: h("span", { style: { fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "9999px", background: c.ativo !== false ? "#dcfce7" : "#f3f4f6", color: c.ativo !== false ? "#166534" : "#6b7280" }, children: c.ativo !== false ? "Ativo" : "Inativo" }) }),
                                    ],
                                })),
                        ]}),
                    }),
                }),
        })}),
    ]});
}

function SecaoParametros({ showToast }) {
    const [form, setForm] = React.useState({
        ambientePadrao: "PRODUCAO",
        frequenciaNfe: 30, frequenciaCte: 30,
        retencaoXmlAnos: 5, alertaVencimentoCertDias: 30,
        slaCritico: 1, slaAlto: 3, slaMedio: 7, slaBaixo: 15,
    });
    const [loading, setLoading] = React.useState(true);
    const [salvando, setSalvando] = React.useState(false);

    React.useEffect(() => {
        apiFetch("/api/fiscal/configuracoes")
            .then(data => setForm(f => ({ ...f, ...data })))
            .catch(e => showToast(e.message || "Erro ao carregar parâmetros.", "erro"))
            .finally(() => setLoading(false));
    }, []);

    const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

    const salvar = async () => {
        setSalvando(true);
        try {
            await apiFetch("/api/fiscal/configuracoes", { method: "POST", body: JSON.stringify(form) });
            showToast("Parâmetros salvos com sucesso.", "ok");
        } catch (e) {
            showToast(e.message || "Erro ao salvar.", "erro");
        } finally {
            setSalvando(false);
        }
    };

    const fieldStyle = { display: "flex", flexDirection: "column", gap: "4px" };
    const inputStyle = { padding: "8px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px", width: "100%", boxSizing: "border-box" };
    const labelStyle = { fontSize: "12px", fontWeight: 600, color: "hsl(var(--foreground))" };

    return hs("div", { children: [
        h(SectionTitle, { children: "Parâmetros Fiscais" }),
        h(Card, { children: h(CardContent, { style: { padding: "20px" }, children:
            loading
                ? h("div", { style: { padding: "20px", textAlign: "center", color: "hsl(var(--muted-foreground))" }, children: "Carregando..." })
                : hs("div", { style: { display: "flex", flexDirection: "column", gap: "20px" }, children: [
                    hs("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }, children: [
                        hs("div", { style: fieldStyle, children: [
                            h("label", { style: labelStyle, children: "Ambiente Padrão" }),
                            h("select", { value: form.ambientePadrao, onChange: e => set("ambientePadrao", e.target.value), style: inputStyle, children: [
                                h("option", { value: "PRODUCAO", children: "Produção" }),
                                h("option", { value: "HOMOLOGACAO", children: "Homologação" }),
                            ]}),
                        ]}),
                        hs("div", { style: fieldStyle, children: [
                            h("label", { style: labelStyle, children: "Frequência NF-e (minutos)" }),
                            h("input", { type: "number", value: form.frequenciaNfe, onChange: e => set("frequenciaNfe", Number(e.target.value)), min: 1, style: inputStyle }),
                        ]}),
                        hs("div", { style: fieldStyle, children: [
                            h("label", { style: labelStyle, children: "Frequência CT-e (minutos)" }),
                            h("input", { type: "number", value: form.frequenciaCte, onChange: e => set("frequenciaCte", Number(e.target.value)), min: 1, style: inputStyle }),
                        ]}),
                        hs("div", { style: fieldStyle, children: [
                            h("label", { style: labelStyle, children: "Retenção XML (anos)" }),
                            h("input", { type: "number", value: form.retencaoXmlAnos, onChange: e => set("retencaoXmlAnos", Number(e.target.value)), min: 1, style: inputStyle }),
                        ]}),
                        hs("div", { style: fieldStyle, children: [
                            h("label", { style: labelStyle, children: "Alerta vencimento certificado (dias)" }),
                            h("input", { type: "number", value: form.alertaVencimentoCertDias, onChange: e => set("alertaVencimentoCertDias", Number(e.target.value)), min: 1, style: inputStyle }),
                        ]}),
                    ]}),

                    hs("div", { children: [
                        h("p", { style: { fontSize: "13px", fontWeight: 700, marginBottom: "12px" }, children: "SLA por Prioridade (dias)" }),
                        hs("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" }, children: [
                            hs("div", { style: fieldStyle, children: [
                                h("label", { style: { ...labelStyle, color: "#991b1b" }, children: "Crítico" }),
                                h("input", { type: "number", value: form.slaCritico, onChange: e => set("slaCritico", Number(e.target.value)), min: 1, style: { ...inputStyle, borderColor: "#fca5a5" } }),
                            ]}),
                            hs("div", { style: fieldStyle, children: [
                                h("label", { style: { ...labelStyle, color: "#92400e" }, children: "Alto" }),
                                h("input", { type: "number", value: form.slaAlto, onChange: e => set("slaAlto", Number(e.target.value)), min: 1, style: { ...inputStyle, borderColor: "#fcd34d" } }),
                            ]}),
                            hs("div", { style: fieldStyle, children: [
                                h("label", { style: { ...labelStyle, color: "#1e40af" }, children: "Médio" }),
                                h("input", { type: "number", value: form.slaMedio, onChange: e => set("slaMedio", Number(e.target.value)), min: 1, style: { ...inputStyle, borderColor: "#93c5fd" } }),
                            ]}),
                            hs("div", { style: fieldStyle, children: [
                                h("label", { style: { ...labelStyle, color: "#166534" }, children: "Baixo" }),
                                h("input", { type: "number", value: form.slaBaixo, onChange: e => set("slaBaixo", Number(e.target.value)), min: 1, style: { ...inputStyle, borderColor: "#86efac" } }),
                            ]}),
                        ]}),
                    ]}),

                    hs("div", { style: { display: "flex", justifyContent: "flex-end" }, children: [
                        h(Button, { onClick: salvar, disabled: salvando, style: { background: "#2563eb", color: "#fff" }, children: salvando ? "Salvando..." : "Salvar Parâmetros" }),
                    ]}),
                ]}),
        })}),
    ]});
}

function SecaoSyncNsu({ showToast }) {
    const [lista, setLista] = React.useState([]);
    const [loading, setLoading] = React.useState(true);

    const carregar = async () => {
        setLoading(true);
        try {
            const data = await apiFetch("/api/fiscal/sync/status");
            setLista(Array.isArray(data) ? data : (data.status || []));
        } catch (e) {
            showToast(e.message || "Erro ao carregar status de sincronização.", "erro");
        } finally {
            setLoading(false);
        }
    };

    React.useEffect(() => { carregar(); }, []);

    const thStyle = { padding: "9px 12px", textAlign: "left", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "hsl(var(--muted-foreground))", borderBottom: "1px solid hsl(var(--border))", whiteSpace: "nowrap" };
    const tdStyle = { padding: "9px 12px", fontSize: "13px", borderBottom: "1px solid hsl(var(--border))", verticalAlign: "middle" };

    return hs("div", { children: [
        hs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }, children: [
            h(SectionTitle, { children: "Status de Sincronização NSU" }),
            h(Button, { variant: "outline", style: { fontSize: "12px" }, onClick: carregar, children: "↻ Atualizar" }),
        ]}),
        h(Card, { children: h(CardContent, { style: { padding: 0 }, children:
            loading
                ? h("div", { style: { padding: "30px", textAlign: "center", color: "hsl(var(--muted-foreground))" }, children: "Carregando..." })
                : h("div", { style: { overflowX: "auto" }, children:
                    h("table", { style: { width: "100%", borderCollapse: "collapse" }, children:
                        hs("tbody", { children: [
                            h("tr", { children: [
                                h("th", { style: thStyle, children: "CNPJ" }),
                                h("th", { style: thStyle, children: "Tipo" }),
                                h("th", { style: thStyle, children: "Ambiente" }),
                                h("th", { style: thStyle, children: "Último NSU" }),
                                h("th", { style: thStyle, children: "Próxima consulta" }),
                                h("th", { style: thStyle, children: "Status" }),
                                h("th", { style: thStyle, children: "Bloqueado até" }),
                            ]}),
                            lista.length === 0
                                ? h("tr", { children: h("td", { colSpan: 7, style: { ...tdStyle, textAlign: "center", color: "hsl(var(--muted-foreground))", padding: "30px" }, children: "Nenhum registro de sincronização." }) })
                                : lista.map((s, i) => h("tr", {
                                    key: s.id || i,
                                    onMouseEnter: e => e.currentTarget.style.background = "hsl(var(--muted)/0.4)",
                                    onMouseLeave: e => e.currentTarget.style.background = "",
                                    children: [
                                        h("td", { style: tdStyle, children: h("code", { style: { fontSize: "12px" }, children: s.cnpj || "—" }) }),
                                        h("td", { style: tdStyle, children: s.tipo || "—" }),
                                        h("td", { style: tdStyle, children: h("span", { style: { fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "9999px", background: s.ambiente === "PRODUCAO" ? "#dbeafe" : "#fef3c7", color: s.ambiente === "PRODUCAO" ? "#1e40af" : "#92400e" }, children: s.ambiente === "PRODUCAO" ? "Produção" : "Homologação" }) }),
                                        h("td", { style: { ...tdStyle, fontFamily: "monospace", fontSize: "12px" }, children: s.ultimoNsu ?? "—" }),
                                        h("td", { style: { ...tdStyle, fontSize: "12px" }, children: s.proximaConsulta ? new Date(s.proximaConsulta).toLocaleString("pt-BR") : "—" }),
                                        h("td", { style: tdStyle, children: h(SyncStatusBadge, { status: s.status }) }),
                                        h("td", { style: { ...tdStyle, fontSize: "12px" }, children: s.bloqueadoAte ? new Date(s.bloqueadoAte).toLocaleString("pt-BR") : "—" }),
                                    ],
                                })),
                        ]}),
                    }),
                }),
        })}),
    ]});
}

export default function FiscalConfiguracoesPage() {
    const [toast, setToast] = React.useState({ msg: "", tipo: "" });
    const showToast = (msg, tipo = "ok") => {
        setToast({ msg, tipo });
        setTimeout(() => setToast({ msg: "", tipo: "" }), 6000);
    };

    return hs("div", {
        style: { padding: "24px", maxWidth: "1200px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "32px" },
        children: [
            h(Toast, { msg: toast.msg, tipo: toast.tipo, onClose: () => setToast({ msg: "", tipo: "" }) }),

            hs("div", { children: [
                h("h1", { style: { fontSize: "22px", fontWeight: 700, margin: "0 0 4px 0" }, children: "Configurações Fiscais" }),
                h("p", { style: { fontSize: "13px", color: "hsl(var(--muted-foreground))", margin: 0 }, children: "Gerencie CNPJs monitorados, parâmetros e sincronização NSU" }),
            ]}),

            h(SecaoCnpjs, { showToast }),
            h(SecaoParametros, { showToast }),
            h(SecaoSyncNsu, { showToast }),
        ],
    });
}
