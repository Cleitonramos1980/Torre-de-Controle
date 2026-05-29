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

function formatDate(value) {
    if (!value) return "-";
    const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleDateString("pt-BR");
}

function diasParaVencer(dataFim) {
    if (!dataFim) return null;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const fim = new Date(`${String(dataFim).slice(0, 10)}T00:00:00`);
    return Math.floor((fim - hoje) / (1000 * 60 * 60 * 24));
}

function StatusBadge({ status }) {
    const map = {
        ATIVO: { background: "#dcfce7", color: "#166534" },
        VENCIDO: { background: "#fee2e2", color: "#991b1b" },
        INATIVO: { background: "#f3f4f6", color: "#6b7280" },
    };
    const s = map[status] || map.INATIVO;
    return h("span", {
        style: { ...s, padding: "2px 10px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700 },
        children: status || "—",
    });
}

function AmbienteBadge({ ambiente }) {
    const s = ambiente === "PRODUCAO"
        ? { background: "#dbeafe", color: "#1e40af" }
        : { background: "#fef3c7", color: "#92400e" };
    return h("span", {
        style: { ...s, padding: "2px 10px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700 },
        children: ambiente === "PRODUCAO" ? "Produção" : "Homologação",
    });
}

function KpiCard({ label, value, color }) {
    return h(Card, {
        children: h(CardContent, {
            style: { padding: "16px 20px" },
            children: hs("div", {
                children: [
                    h("p", { style: { fontSize: "11px", color: "hsl(var(--muted-foreground))", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }, children: label }),
                    h("p", { style: { fontSize: "26px", fontWeight: 700, color: color || "hsl(var(--foreground))", lineHeight: 1 }, children: value ?? "—" }),
                ],
            }),
        }),
    });
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

function ModalCadastro({ onClose, onSalvo }) {
    const [form, setForm] = React.useState({
        cnpjBase: "", nomeEmpresa: "", validadeInicio: "", validadeFim: "", ambiente: "PRODUCAO",
        arquivoCertificadoBase64: "", senhaCertificado: "",
    });
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState("");

    const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

    const handleFile = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const base64 = ev.target.result.split(",")[1] || "";
            set("arquivoCertificadoBase64", base64);
        };
        reader.readAsDataURL(file);
    };

    const salvar = async () => {
        if (!form.cnpjBase.trim()) { setErro("CNPJ Base é obrigatório."); return; }
        if (!form.validadeFim) { setErro("Validade Fim é obrigatória."); return; }
        if (!form.arquivoCertificadoBase64) { setErro("Selecione o arquivo do certificado."); return; }
        if (!form.senhaCertificado) { setErro("Senha do certificado é obrigatória."); return; }
        setSalvando(true);
        setErro("");
        try {
            await apiFetch("/api/fiscal/certificados", { method: "POST", body: JSON.stringify(form) });
            onSalvo();
        } catch (e) {
            setErro(e.message || "Erro ao cadastrar certificado.");
        } finally {
            setSalvando(false);
        }
    };

    const fieldStyle = { display: "flex", flexDirection: "column", gap: "4px" };
    const inputStyle = { padding: "8px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px", width: "100%", boxSizing: "border-box" };
    const labelStyle = { fontSize: "12px", fontWeight: 600, color: "hsl(var(--foreground))" };

    return h(Modal, {
        onClose,
        children: hs("div", {
            children: [
                hs("div", {
                    style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" },
                    children: [
                        h("h2", { style: { fontSize: "16px", fontWeight: 700, margin: 0 }, children: "Cadastrar Certificado Digital A1" }),
                        h("button", { onClick: onClose, style: { background: "none", border: "none", cursor: "pointer", fontSize: "20px", color: "hsl(var(--muted-foreground))" }, children: "×" }),
                    ],
                }),

                // Alerta de segurança
                hs("div", {
                    style: { background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: "8px", padding: "12px 14px", marginBottom: "20px", display: "flex", gap: "10px" },
                    children: [
                        h("span", { style: { fontSize: "16px" }, children: "🔒" }),
                        h("p", { style: { margin: 0, fontSize: "12px", color: "#92400e", lineHeight: "1.5" }, children: "Arquivo e senha são enviados de forma segura e nunca ficam expostos no frontend após o envio." }),
                    ],
                }),

                hs("div", { style: { display: "flex", flexDirection: "column", gap: "14px" }, children: [
                    hs("div", { style: fieldStyle, children: [
                        h("label", { style: labelStyle, children: "CNPJ Base *" }),
                        h("input", { type: "text", value: form.cnpjBase, onChange: e => set("cnpjBase", e.target.value), placeholder: "Ex: 12345678", maxLength: 8, style: inputStyle }),
                    ]}),
                    hs("div", { style: fieldStyle, children: [
                        h("label", { style: labelStyle, children: "Nome da Empresa" }),
                        h("input", { type: "text", value: form.nomeEmpresa, onChange: e => set("nomeEmpresa", e.target.value), placeholder: "Razão Social", style: inputStyle }),
                    ]}),
                    hs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }, children: [
                        hs("div", { style: fieldStyle, children: [
                            h("label", { style: labelStyle, children: "Validade Início" }),
                            h("input", { type: "date", value: form.validadeInicio, onChange: e => set("validadeInicio", e.target.value), style: inputStyle }),
                        ]}),
                        hs("div", { style: fieldStyle, children: [
                            h("label", { style: labelStyle, children: "Validade Fim *" }),
                            h("input", { type: "date", value: form.validadeFim, onChange: e => set("validadeFim", e.target.value), style: inputStyle }),
                        ]}),
                    ]}),
                    hs("div", { style: fieldStyle, children: [
                        h("label", { style: labelStyle, children: "Ambiente" }),
                        h("select", { value: form.ambiente, onChange: e => set("ambiente", e.target.value), style: inputStyle, children: [
                            h("option", { value: "PRODUCAO", children: "Produção" }),
                            h("option", { value: "HOMOLOGACAO", children: "Homologação" }),
                        ]}),
                    ]}),
                    hs("div", { style: fieldStyle, children: [
                        h("label", { style: labelStyle, children: "Arquivo do Certificado (.pfx / .p12) *" }),
                        h("input", { type: "file", accept: ".pfx,.p12", onChange: handleFile, style: { ...inputStyle, padding: "6px 10px" } }),
                        form.arquivoCertificadoBase64 ? h("span", { style: { fontSize: "11px", color: "#16a34a" }, children: "Arquivo carregado com sucesso." }) : null,
                    ]}),
                    hs("div", { style: fieldStyle, children: [
                        h("label", { style: labelStyle, children: "Senha do Certificado *" }),
                        h("input", { type: "password", value: form.senhaCertificado, onChange: e => set("senhaCertificado", e.target.value), placeholder: "Senha do arquivo .pfx/.p12", style: inputStyle, autoComplete: "new-password" }),
                    ]}),
                    erro ? h("p", { style: { color: "#dc2626", fontSize: "12px", margin: 0 }, children: erro }) : null,
                    hs("div", { style: { display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }, children: [
                        h(Button, { variant: "outline", onClick: onClose, children: "Cancelar" }),
                        h(Button, { onClick: salvar, disabled: salvando, style: { background: "#2563eb", color: "#fff" }, children: salvando ? "Enviando..." : "Cadastrar Certificado" }),
                    ]}),
                ]}),
            ],
        }),
    });
}

export default function FiscalCertificadosPage() {
    const [lista, setLista] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState("");
    const [toast, setToast] = React.useState({ msg: "", tipo: "" });
    const [showModal, setShowModal] = React.useState(false);
    const [testando, setTestando] = React.useState("");
    const [inativando, setInativando] = React.useState("");

    const showToast = (msg, tipo = "ok") => {
        setToast({ msg, tipo });
        setTimeout(() => setToast({ msg: "", tipo: "" }), 6000);
    };

    const carregar = React.useCallback(async () => {
        setErro("");
        setLoading(true);
        try {
            const data = await apiFetch("/api/fiscal/certificados");
            setLista(Array.isArray(data) ? data : (data.certificados || []));
        } catch (e) {
            setErro(e.message || "Erro ao carregar certificados.");
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => { carregar(); }, [carregar]);

    const testar = async (cert) => {
        setTestando(cert.id);
        try {
            const result = await apiFetch(`/api/fiscal/certificados/${cert.id}/testar`, { method: "POST", body: JSON.stringify({}) });
            showToast(result.mensagem || result.message || "Teste realizado com sucesso.", "ok");
        } catch (e) {
            showToast(e.message || "Erro ao testar certificado.", "erro");
        } finally {
            setTestando("");
        }
    };

    const inativar = async (cert) => {
        if (!window.confirm(`Confirmar inativação do certificado de "${cert.nomeEmpresa || cert.cnpjBase}"?`)) return;
        setInativando(cert.id);
        try {
            await apiFetch(`/api/fiscal/certificados/${cert.id}/inativar`, { method: "POST", body: JSON.stringify({}) });
            showToast("Certificado inativado com sucesso.", "ok");
            carregar();
        } catch (e) {
            showToast(e.message || "Erro ao inativar.", "erro");
        } finally {
            setInativando("");
        }
    };

    const total = lista.length;
    const ativos = lista.filter(c => c.status === "ATIVO").length;
    const vencidos = lista.filter(c => c.status === "VENCIDO").length;
    const vencendoEm30 = lista.filter(c => {
        const dias = diasParaVencer(c.validadeFim);
        return dias !== null && dias >= 0 && dias <= 30 && c.status === "ATIVO";
    }).length;

    const thStyle = { padding: "10px 14px", textAlign: "left", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "hsl(var(--muted-foreground))", borderBottom: "1px solid hsl(var(--border))", whiteSpace: "nowrap" };
    const tdStyle = { padding: "10px 14px", fontSize: "13px", borderBottom: "1px solid hsl(var(--border))", verticalAlign: "middle" };

    return hs("div", {
        style: { padding: "24px", maxWidth: "1400px", margin: "0 auto" },
        children: [
            h(Toast, { msg: toast.msg, tipo: toast.tipo, onClose: () => setToast({ msg: "", tipo: "" }) }),
            showModal ? h(ModalCadastro, { onClose: () => setShowModal(false), onSalvo: () => { setShowModal(false); carregar(); showToast("Certificado cadastrado com sucesso.", "ok"); } }) : null,

            // Header
            hs("div", {
                style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", flexWrap: "wrap", gap: "12px" },
                children: [
                    hs("div", { children: [
                        h("h1", { style: { fontSize: "22px", fontWeight: 700, margin: "0 0 4px 0" }, children: "Certificados Digitais A1" }),
                        h("p", { style: { fontSize: "13px", color: "hsl(var(--muted-foreground))", margin: 0 }, children: "Gerenciamento de certificados fiscais" }),
                    ]}),
                    hs("div", { style: { display: "flex", gap: "8px" }, children: [
                        h(Button, { variant: "outline", style: { fontSize: "12px" }, onClick: carregar, children: "↻ Atualizar" }),
                        h(Button, { style: { background: "#2563eb", color: "#fff", fontSize: "13px" }, onClick: () => setShowModal(true), children: "+ Cadastrar Certificado" }),
                    ]}),
                ],
            }),

            // Banner de segurança
            hs("div", {
                style: { background: "#dbeafe", border: "1px solid #93c5fd", borderRadius: "10px", padding: "14px 18px", marginBottom: "20px", display: "flex", gap: "12px", alignItems: "flex-start" },
                children: [
                    h("span", { style: { fontSize: "18px", marginTop: "1px" }, children: "🔐" }),
                    hs("div", { children: [
                        h("p", { style: { margin: "0 0 2px 0", fontSize: "13px", fontWeight: 700, color: "#1e40af" }, children: "Segurança dos Certificados Digitais" }),
                        h("p", { style: { margin: 0, fontSize: "12px", color: "#1e40af", lineHeight: "1.5" }, children: "Certificados digitais são armazenados de forma segura no servidor. Nenhum arquivo ou senha é exposto nesta interface." }),
                    ]}),
                ],
            }),

            // KPIs
            hs("div", {
                style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "14px", marginBottom: "24px" },
                children: [
                    h(KpiCard, { label: "Total", value: total }),
                    h(KpiCard, { label: "Ativos", value: ativos, color: "#16a34a" }),
                    h(KpiCard, { label: "Vencidos", value: vencidos, color: "#dc2626" }),
                    h(KpiCard, { label: "Vencendo em 30 dias", value: vencendoEm30, color: "#d97706" }),
                ],
            }),

            // Tabela
            h(Card, {
                children: h(CardContent, {
                    style: { padding: 0 },
                    children: loading
                        ? h("div", { style: { padding: "40px", textAlign: "center", color: "hsl(var(--muted-foreground))" }, children: "Carregando certificados..." })
                        : erro
                            ? h("div", { style: { padding: "40px", textAlign: "center", color: "#dc2626" }, children: erro })
                            : h("div", { style: { overflowX: "auto" }, children:
                                h("table", {
                                    style: { width: "100%", borderCollapse: "collapse" },
                                    children: hs("tbody", {
                                        children: [
                                            h("tr", {
                                                children: [
                                                    h("th", { style: thStyle, children: "CNPJ Base" }),
                                                    h("th", { style: thStyle, children: "Nome Empresa" }),
                                                    h("th", { style: thStyle, children: "Thumbprint" }),
                                                    h("th", { style: thStyle, children: "Validade até" }),
                                                    h("th", { style: thStyle, children: "Status" }),
                                                    h("th", { style: thStyle, children: "Ambiente" }),
                                                    h("th", { style: thStyle, children: "Último Teste" }),
                                                    h("th", { style: { ...thStyle, textAlign: "right" }, children: "Ações" }),
                                                ],
                                            }),
                                            lista.length === 0
                                                ? h("tr", { children: h("td", { colSpan: 8, style: { ...tdStyle, textAlign: "center", color: "hsl(var(--muted-foreground))", padding: "40px" }, children: "Nenhum certificado cadastrado." }) })
                                                : lista.map(cert => {
                                                    const dias = diasParaVencer(cert.validadeFim);
                                                    const validadeColor = dias !== null && dias < 30 ? "#dc2626" : "inherit";
                                                    const thumbprint = cert.thumbprint ? `${String(cert.thumbprint).slice(0, 8)}...${String(cert.thumbprint).slice(-8)}` : "—";
                                                    return h("tr", {
                                                        key: cert.id,
                                                        style: { transition: "background 0.15s" },
                                                        onMouseEnter: e => e.currentTarget.style.background = "hsl(var(--muted)/0.4)",
                                                        onMouseLeave: e => e.currentTarget.style.background = "",
                                                        children: [
                                                            h("td", { style: tdStyle, children: h("code", { style: { fontSize: "12px" }, children: cert.cnpjBase || "—" }) }),
                                                            h("td", { style: tdStyle, children: cert.nomeEmpresa || "—" }),
                                                            h("td", { style: tdStyle, children: h("code", { style: { fontSize: "11px", color: "hsl(var(--muted-foreground))" }, children: thumbprint }) }),
                                                            h("td", { style: { ...tdStyle, color: validadeColor, fontWeight: dias !== null && dias < 30 ? 700 : 400 }, children: formatDate(cert.validadeFim) }),
                                                            h("td", { style: tdStyle, children: h(StatusBadge, { status: cert.status }) }),
                                                            h("td", { style: tdStyle, children: h(AmbienteBadge, { ambiente: cert.ambiente }) }),
                                                            h("td", { style: { ...tdStyle, fontSize: "12px", color: "hsl(var(--muted-foreground))" }, children: cert.ultimoTeste ? new Date(cert.ultimoTeste).toLocaleString("pt-BR") : "Nunca" }),
                                                            h("td", { style: { ...tdStyle, textAlign: "right" }, children: hs("div", { style: { display: "flex", gap: "6px", justifyContent: "flex-end" }, children: [
                                                                h(Button, {
                                                                    variant: "outline",
                                                                    style: { fontSize: "11px", padding: "4px 10px", height: "auto" },
                                                                    disabled: testando === cert.id,
                                                                    onClick: () => testar(cert),
                                                                    children: testando === cert.id ? "Testando..." : "Testar",
                                                                }),
                                                                cert.status !== "INATIVO" ? h(Button, {
                                                                    variant: "outline",
                                                                    style: { fontSize: "11px", padding: "4px 10px", height: "auto", color: "#dc2626", borderColor: "#dc2626" },
                                                                    disabled: inativando === cert.id,
                                                                    onClick: () => inativar(cert),
                                                                    children: inativando === cert.id ? "..." : "Inativar",
                                                                }) : null,
                                                            ]}),
                                                            }),
                                                        ],
                                                    });
                                                }),
                                        ],
                                    }),
                                }),
                            }),
                }),
            }),
        ],
    });
}
