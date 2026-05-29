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

function SectionTitle({ children }) {
    return h("h2", {
        style: { fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "hsl(var(--muted-foreground))", margin: "0 0 14px 0" },
        children,
    });
}

function GroupTitle({ children }) {
    return h("h3", {
        style: { fontSize: "15px", fontWeight: 700, margin: "0 0 14px 0", color: "hsl(var(--foreground))", borderLeft: "4px solid #2563eb", paddingLeft: "10px" },
        children,
    });
}

const inputStyle = { padding: "8px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px", width: "100%", boxSizing: "border-box" };
const fieldStyle = { display: "flex", flexDirection: "column", gap: "4px" };
const labelStyle = { fontSize: "12px", fontWeight: 600, color: "hsl(var(--muted-foreground))" };

function buildQuery(params) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
        if (v == null) return;
        if (typeof v === "string" && !v.trim()) return;
        q.set(k, String(v));
    });
    const s = q.toString();
    return s ? `?${s}` : "";
}

// Grupo 1 - NF-e Recebidas
function CardNfe() {
    const [dataInicio, setDataInicio] = React.useState("");
    const [dataFim, setDataFim] = React.useState("");
    const [statusSefaz, setStatusSefaz] = React.useState("");

    const exportar = () => {
        const q = buildQuery({ dataInicio, dataFim, statusSefaz });
        downloadCsv(`/api/fiscal/exportar/nfe-csv${q}`, `nfe-recebidas-${new Date().toISOString().slice(0, 10)}.csv`);
    };

    return h(Card, {
        children: h(CardContent, {
            style: { padding: "20px" },
            children: hs("div", { children: [
                hs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }, children: [
                    hs("div", { children: [
                        h("p", { style: { fontSize: "14px", fontWeight: 700, margin: "0 0 2px 0" }, children: "NF-e Recebidas" }),
                        h("p", { style: { fontSize: "12px", color: "hsl(var(--muted-foreground))", margin: 0 }, children: "Notas fiscais eletrônicas recebidas no período" }),
                    ]}),
                    h("span", { style: { fontSize: "20px" }, children: "📄" }),
                ]}),
                hs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "10px", alignItems: "flex-end" }, children: [
                    hs("div", { style: fieldStyle, children: [
                        h("label", { style: labelStyle, children: "Data Início" }),
                        h("input", { type: "date", value: dataInicio, onChange: e => setDataInicio(e.target.value), style: inputStyle }),
                    ]}),
                    hs("div", { style: fieldStyle, children: [
                        h("label", { style: labelStyle, children: "Data Fim" }),
                        h("input", { type: "date", value: dataFim, onChange: e => setDataFim(e.target.value), style: inputStyle }),
                    ]}),
                    hs("div", { style: fieldStyle, children: [
                        h("label", { style: labelStyle, children: "Status SEFAZ" }),
                        h("select", { value: statusSefaz, onChange: e => setStatusSefaz(e.target.value), style: inputStyle, children: [
                            h("option", { value: "", children: "Todos" }),
                            h("option", { value: "100", children: "100 — Autorizado" }),
                            h("option", { value: "101", children: "101 — Cancelado" }),
                            h("option", { value: "110", children: "110 — Denegado" }),
                            h("option", { value: "301", children: "301 — Irregularidade" }),
                            h("option", { value: "302", children: "302 — Bloqueado" }),
                        ]}),
                    ]}),
                    h(Button, {
                        onClick: exportar,
                        style: { background: "#2563eb", color: "#fff", fontSize: "13px", whiteSpace: "nowrap" },
                        children: "⬇ Exportar CSV",
                    }),
                ]}),
            ]}),
        }),
    });
}

// Grupo 1 - CT-e Recebidos
function CardCte() {
    const [dataInicio, setDataInicio] = React.useState("");
    const [dataFim, setDataFim] = React.useState("");

    const exportar = () => {
        const q = buildQuery({ dataInicio, dataFim });
        downloadCsv(`/api/fiscal/exportar/cte-csv${q}`, `cte-recebidos-${new Date().toISOString().slice(0, 10)}.csv`);
    };

    return h(Card, {
        children: h(CardContent, {
            style: { padding: "20px" },
            children: hs("div", { children: [
                hs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }, children: [
                    hs("div", { children: [
                        h("p", { style: { fontSize: "14px", fontWeight: 700, margin: "0 0 2px 0" }, children: "CT-e Recebidos" }),
                        h("p", { style: { fontSize: "12px", color: "hsl(var(--muted-foreground))", margin: 0 }, children: "Conhecimentos de transporte eletrônico recebidos" }),
                    ]}),
                    h("span", { style: { fontSize: "20px" }, children: "🚚" }),
                ]}),
                hs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "10px", alignItems: "flex-end" }, children: [
                    hs("div", { style: fieldStyle, children: [
                        h("label", { style: labelStyle, children: "Data Início" }),
                        h("input", { type: "date", value: dataInicio, onChange: e => setDataInicio(e.target.value), style: inputStyle }),
                    ]}),
                    hs("div", { style: fieldStyle, children: [
                        h("label", { style: labelStyle, children: "Data Fim" }),
                        h("input", { type: "date", value: dataFim, onChange: e => setDataFim(e.target.value), style: inputStyle }),
                    ]}),
                    h(Button, {
                        onClick: exportar,
                        style: { background: "#2563eb", color: "#fff", fontSize: "13px", whiteSpace: "nowrap" },
                        children: "⬇ Exportar CSV",
                    }),
                ]}),
            ]}),
        }),
    });
}

// Grupo 2 - Divergências
function CardDivergencias() {
    const [dataInicio, setDataInicio] = React.useState("");
    const [dataFim, setDataFim] = React.useState("");
    const [status, setStatus] = React.useState("");

    const exportar = () => {
        const q = buildQuery({ dataInicio, dataFim, status });
        downloadCsv(`/api/fiscal/exportar/divergencias-csv${q}`, `divergencias-${new Date().toISOString().slice(0, 10)}.csv`);
    };

    return h(Card, {
        children: h(CardContent, {
            style: { padding: "20px" },
            children: hs("div", { children: [
                hs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }, children: [
                    hs("div", { children: [
                        h("p", { style: { fontSize: "14px", fontWeight: 700, margin: "0 0 2px 0" }, children: "Divergências" }),
                        h("p", { style: { fontSize: "12px", color: "hsl(var(--muted-foreground))", margin: 0 }, children: "Documentos com inconsistências ou riscos identificados" }),
                    ]}),
                    h("span", { style: { fontSize: "20px" }, children: "⚠️" }),
                ]}),
                hs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: "10px", alignItems: "flex-end" }, children: [
                    hs("div", { style: fieldStyle, children: [
                        h("label", { style: labelStyle, children: "Data Início" }),
                        h("input", { type: "date", value: dataInicio, onChange: e => setDataInicio(e.target.value), style: inputStyle }),
                    ]}),
                    hs("div", { style: fieldStyle, children: [
                        h("label", { style: labelStyle, children: "Data Fim" }),
                        h("input", { type: "date", value: dataFim, onChange: e => setDataFim(e.target.value), style: inputStyle }),
                    ]}),
                    hs("div", { style: fieldStyle, children: [
                        h("label", { style: labelStyle, children: "Status" }),
                        h("select", { value: status, onChange: e => setStatus(e.target.value), style: inputStyle, children: [
                            h("option", { value: "", children: "Todos" }),
                            h("option", { value: "ABERTA", children: "Aberta" }),
                            h("option", { value: "EM_ANALISE", children: "Em análise" }),
                            h("option", { value: "RESOLVIDA", children: "Resolvida" }),
                            h("option", { value: "IGNORADA", children: "Ignorada" }),
                        ]}),
                    ]}),
                    h(Button, {
                        onClick: exportar,
                        style: { background: "#2563eb", color: "#fff", fontSize: "13px", whiteSpace: "nowrap" },
                        children: "⬇ Exportar CSV",
                    }),
                ]}),
            ]}),
        }),
    });
}

// Grupo 3 - Importar Documento
function CardImportarDocumento({ showToast }) {
    const emptyForm = {
        chaveAcesso: "", tipoDfe: "NFE", cnpjInteressado: "", cnpjEmitente: "", nomeEmitente: "",
        cnpjDestinatario: "", nomeDestinatario: "", numeroDocumento: "", serie: "",
        dataEmissao: "", valorTotal: "", valorFrete: "", statusSefaz: "100",
        pedidoCompra: "", statusWinthor: "NAO_VERIFICADO", ambiente: "HOMOLOGACAO",
    };
    const [form, setForm] = React.useState(emptyForm);
    const [importando, setImportando] = React.useState(false);
    const [resultado, setResultado] = React.useState(null);

    const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

    const importar = async () => {
        if (!form.chaveAcesso || form.chaveAcesso.trim().length !== 44) {
            showToast("Chave de acesso deve ter exatamente 44 caracteres.", "erro");
            return;
        }
        setImportando(true);
        setResultado(null);
        try {
            const payload = { ...form };
            if (payload.valorTotal) payload.valorTotal = Number(payload.valorTotal);
            if (payload.valorFrete) payload.valorFrete = Number(payload.valorFrete);
            const data = await apiFetch("/api/fiscal/documentos/importar", { method: "POST", body: JSON.stringify(payload) });
            setResultado(data);
            showToast("Documento importado com sucesso.", "ok");
        } catch (e) {
            showToast(e.message || "Erro ao importar documento.", "erro");
        } finally {
            setImportando(false);
        }
    };

    const limpar = () => { setForm(emptyForm); setResultado(null); };

    return h(Card, {
        children: h(CardContent, {
            style: { padding: "20px" },
            children: hs("div", { children: [
                hs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }, children: [
                    hs("div", { children: [
                        h("p", { style: { fontSize: "14px", fontWeight: 700, margin: "0 0 2px 0" }, children: "Importar Documento Fiscal" }),
                        h("p", { style: { fontSize: "12px", color: "hsl(var(--muted-foreground))", margin: 0 }, children: "Inserção manual de documento para teste ou homologação" }),
                    ]}),
                    h("span", { style: { fontSize: "20px" }, children: "📥" }),
                ]}),

                // Aviso ambiente homologação
                hs("div", { style: { background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", display: "flex", gap: "8px" }, children: [
                    h("span", { style: { fontSize: "14px" }, children: "⚠️" }),
                    h("p", { style: { margin: 0, fontSize: "12px", color: "#92400e", lineHeight: "1.5" }, children: "Esta função é destinada a ambientes de homologação e testes. Não utilize em produção sem supervisão." }),
                ]}),

                hs("div", { style: { display: "flex", flexDirection: "column", gap: "14px" }, children: [
                    // Chave de acesso
                    hs("div", { style: fieldStyle, children: [
                        h("label", { style: { ...labelStyle, fontWeight: 700, color: "hsl(var(--foreground))" }, children: "Chave de Acesso (44 chars) *" }),
                        h("input", {
                            type: "text",
                            value: form.chaveAcesso,
                            onChange: e => set("chaveAcesso", e.target.value.replace(/\D/g, "").slice(0, 44)),
                            placeholder: "00000000000000000000000000000000000000000000",
                            maxLength: 44,
                            style: { ...inputStyle, fontFamily: "monospace", fontSize: "12px", letterSpacing: "0.05em" },
                        }),
                        h("span", { style: { fontSize: "11px", color: form.chaveAcesso.length === 44 ? "#16a34a" : "hsl(var(--muted-foreground))" }, children: `${form.chaveAcesso.length}/44 caracteres` }),
                    ]}),

                    // Tipo e Ambiente
                    hs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }, children: [
                        hs("div", { style: fieldStyle, children: [
                            h("label", { style: labelStyle, children: "Tipo DFe" }),
                            h("select", { value: form.tipoDfe, onChange: e => set("tipoDfe", e.target.value), style: inputStyle, children: [
                                h("option", { value: "NFE", children: "NF-e" }),
                                h("option", { value: "CTE", children: "CT-e" }),
                            ]}),
                        ]}),
                        hs("div", { style: fieldStyle, children: [
                            h("label", { style: labelStyle, children: "Ambiente" }),
                            h("select", { value: form.ambiente, onChange: e => set("ambiente", e.target.value), style: inputStyle, children: [
                                h("option", { value: "HOMOLOGACAO", children: "Homologação" }),
                                h("option", { value: "PRODUCAO", children: "Produção" }),
                            ]}),
                        ]}),
                    ]}),

                    // CNPJs
                    hs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }, children: [
                        hs("div", { style: fieldStyle, children: [
                            h("label", { style: labelStyle, children: "CNPJ Interessado" }),
                            h("input", { type: "text", value: form.cnpjInteressado, onChange: e => set("cnpjInteressado", e.target.value), maxLength: 18, style: inputStyle }),
                        ]}),
                        hs("div", { style: fieldStyle, children: [
                            h("label", { style: labelStyle, children: "CNPJ Emitente" }),
                            h("input", { type: "text", value: form.cnpjEmitente, onChange: e => set("cnpjEmitente", e.target.value), maxLength: 18, style: inputStyle }),
                        ]}),
                        hs("div", { style: fieldStyle, children: [
                            h("label", { style: labelStyle, children: "CNPJ Destinatário" }),
                            h("input", { type: "text", value: form.cnpjDestinatario, onChange: e => set("cnpjDestinatario", e.target.value), maxLength: 18, style: inputStyle }),
                        ]}),
                    ]}),

                    // Nomes
                    hs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }, children: [
                        hs("div", { style: fieldStyle, children: [
                            h("label", { style: labelStyle, children: "Nome Emitente" }),
                            h("input", { type: "text", value: form.nomeEmitente, onChange: e => set("nomeEmitente", e.target.value), style: inputStyle }),
                        ]}),
                        hs("div", { style: fieldStyle, children: [
                            h("label", { style: labelStyle, children: "Nome Destinatário" }),
                            h("input", { type: "text", value: form.nomeDestinatario, onChange: e => set("nomeDestinatario", e.target.value), style: inputStyle }),
                        ]}),
                    ]}),

                    // Número, Série, Data
                    hs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px" }, children: [
                        hs("div", { style: fieldStyle, children: [
                            h("label", { style: labelStyle, children: "Número Documento" }),
                            h("input", { type: "text", value: form.numeroDocumento, onChange: e => set("numeroDocumento", e.target.value), style: inputStyle }),
                        ]}),
                        hs("div", { style: fieldStyle, children: [
                            h("label", { style: labelStyle, children: "Série" }),
                            h("input", { type: "text", value: form.serie, onChange: e => set("serie", e.target.value), maxLength: 3, style: inputStyle }),
                        ]}),
                        hs("div", { style: fieldStyle, children: [
                            h("label", { style: labelStyle, children: "Data de Emissão" }),
                            h("input", { type: "date", value: form.dataEmissao, onChange: e => set("dataEmissao", e.target.value), style: inputStyle }),
                        ]}),
                        hs("div", { style: fieldStyle, children: [
                            h("label", { style: labelStyle, children: "Pedido de Compra" }),
                            h("input", { type: "text", value: form.pedidoCompra, onChange: e => set("pedidoCompra", e.target.value), style: inputStyle }),
                        ]}),
                    ]}),

                    // Valores
                    hs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }, children: [
                        hs("div", { style: fieldStyle, children: [
                            h("label", { style: labelStyle, children: "Valor Total (R$)" }),
                            h("input", { type: "number", value: form.valorTotal, onChange: e => set("valorTotal", e.target.value), min: 0, step: "0.01", placeholder: "0,00", style: inputStyle }),
                        ]}),
                        hs("div", { style: fieldStyle, children: [
                            h("label", { style: labelStyle, children: "Valor Frete (R$)" }),
                            h("input", { type: "number", value: form.valorFrete, onChange: e => set("valorFrete", e.target.value), min: 0, step: "0.01", placeholder: "0,00", style: inputStyle }),
                        ]}),
                    ]}),

                    // Status
                    hs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }, children: [
                        hs("div", { style: fieldStyle, children: [
                            h("label", { style: labelStyle, children: "Status SEFAZ" }),
                            h("select", { value: form.statusSefaz, onChange: e => set("statusSefaz", e.target.value), style: inputStyle, children: [
                                h("option", { value: "100", children: "100 — Autorizado" }),
                                h("option", { value: "101", children: "101 — Cancelado" }),
                                h("option", { value: "110", children: "110 — Denegado" }),
                                h("option", { value: "301", children: "301 — Irregularidade" }),
                                h("option", { value: "302", children: "302 — Bloqueado" }),
                            ]}),
                        ]}),
                        hs("div", { style: fieldStyle, children: [
                            h("label", { style: labelStyle, children: "Status WinThor" }),
                            h("select", { value: form.statusWinthor, onChange: e => set("statusWinthor", e.target.value), style: inputStyle, children: [
                                h("option", { value: "NAO_VERIFICADO", children: "Não verificado" }),
                                h("option", { value: "ENCONTRADO", children: "Encontrado" }),
                                h("option", { value: "NAO_ENCONTRADO", children: "Não encontrado" }),
                            ]}),
                        ]}),
                    ]}),

                    // Botões
                    hs("div", { style: { display: "flex", gap: "10px", justifyContent: "flex-end" }, children: [
                        h(Button, { variant: "outline", onClick: limpar, children: "Limpar" }),
                        h(Button, {
                            onClick: importar,
                            disabled: importando,
                            style: { background: "#2563eb", color: "#fff" },
                            children: importando ? "Importando..." : "Importar Documento",
                        }),
                    ]}),

                    // Resultado
                    resultado ? h(Card, {
                        style: { marginTop: "4px" },
                        children: h(CardContent, {
                            style: { padding: "16px", background: "#f0fdf4", borderRadius: "8px" },
                            children: hs("div", { children: [
                                h("p", { style: { fontSize: "13px", fontWeight: 700, color: "#166534", margin: "0 0 10px 0" }, children: "Documento importado com sucesso" }),
                                hs("div", { style: { display: "flex", flexDirection: "column", gap: "6px" }, children: [
                                    resultado.id ? hs("div", { style: { display: "flex", gap: "8px" }, children: [
                                        h("span", { style: { fontSize: "12px", color: "hsl(var(--muted-foreground))", minWidth: "120px" }, children: "ID gerado:" }),
                                        h("code", { style: { fontSize: "12px", fontWeight: 700 }, children: resultado.id }),
                                    ]}) : null,
                                    resultado.scoreRisco != null ? hs("div", { style: { display: "flex", gap: "8px" }, children: [
                                        h("span", { style: { fontSize: "12px", color: "hsl(var(--muted-foreground))", minWidth: "120px" }, children: "Score de risco:" }),
                                        h("span", { style: { fontSize: "12px", fontWeight: 700, color: resultado.scoreRisco >= 76 ? "#dc2626" : resultado.scoreRisco >= 51 ? "#d97706" : resultado.scoreRisco >= 26 ? "#2563eb" : "#16a34a" }, children: `${resultado.scoreRisco}/100` }),
                                    ]}) : null,
                                    resultado.divergencias != null ? hs("div", { style: { display: "flex", gap: "8px" }, children: [
                                        h("span", { style: { fontSize: "12px", color: "hsl(var(--muted-foreground))", minWidth: "120px" }, children: "Divergências:" }),
                                        h("span", { style: { fontSize: "12px", fontWeight: 700, color: resultado.divergencias > 0 ? "#dc2626" : "#16a34a" }, children: resultado.divergencias > 0 ? `${resultado.divergencias} divergência(s) gerada(s)` : "Nenhuma divergência" }),
                                    ]}) : null,
                                    resultado.mensagem ? hs("div", { style: { display: "flex", gap: "8px" }, children: [
                                        h("span", { style: { fontSize: "12px", color: "hsl(var(--muted-foreground))", minWidth: "120px" }, children: "Mensagem:" }),
                                        h("span", { style: { fontSize: "12px" }, children: resultado.mensagem }),
                                    ]}) : null,
                                ]}),
                            ]}),
                        }),
                    }) : null,
                ]}),
            ]}),
        }),
    });
}

export default function FiscalRelatoriosFiscaisPage() {
    const [toast, setToast] = React.useState({ msg: "", tipo: "" });
    const showToast = (msg, tipo = "ok") => {
        setToast({ msg, tipo });
        setTimeout(() => setToast({ msg: "", tipo: "" }), 6000);
    };

    return hs("div", {
        style: { padding: "24px", maxWidth: "1200px", margin: "0 auto" },
        children: [
            h(Toast, { msg: toast.msg, tipo: toast.tipo, onClose: () => setToast({ msg: "", tipo: "" }) }),

            // Header
            hs("div", { style: { marginBottom: "28px" }, children: [
                h("h1", { style: { fontSize: "22px", fontWeight: 700, margin: "0 0 4px 0" }, children: "Relatórios Fiscais" }),
                h("p", { style: { fontSize: "13px", color: "hsl(var(--muted-foreground))", margin: 0 }, children: "Exportações e importações de documentos fiscais" }),
            ]}),

            // Grupo 1 - Documentos Fiscais
            hs("div", { style: { marginBottom: "32px" }, children: [
                h(GroupTitle, { children: "Documentos Fiscais" }),
                hs("div", { style: { display: "flex", flexDirection: "column", gap: "16px" }, children: [
                    h(CardNfe, {}),
                    h(CardCte, {}),
                ]}),
            ]}),

            // Grupo 2 - Divergências e Riscos
            hs("div", { style: { marginBottom: "32px" }, children: [
                h(GroupTitle, { children: "Divergências e Riscos" }),
                h(CardDivergencias, {}),
            ]}),

            // Grupo 3 - Importar Documento
            hs("div", { style: { marginBottom: "32px" }, children: [
                h(GroupTitle, { children: "Importar Documento para Teste" }),
                h(CardImportarDocumento, { showToast }),
            ]}),
        ],
    });
}
