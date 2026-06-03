import { r as React, j as jsxRuntime, J as Card, N as CardContent, B as Button } from "./index-Cw1PFMX8.js";
import { I as Input } from "./input-CnWhQnjH.js";
import { L as Label } from "./label-CRMrAwdj.js";

const h = jsxRuntime.jsx;
const hs = jsxRuntime.jsxs;

function getToken() { try { return JSON.parse(localStorage.getItem("sgq.authSession") || "{}").token || ""; } catch { return ""; } }
async function apiFetch(path, opts = {}) {
    const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(opts.headers || {}) } });
    if (!res.ok && res.status !== 404) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `HTTP ${res.status}`); }
    return res.json().catch(() => ({}));
}

const TIPO_LABELS = { "210200": "Ciência da Operação", "210210": "Confirmação da Operação", "210220": "Operação não Realizada", "210240": "Desconhecimento da Operação" };
const STATUS_COLORS = { PENDENTE: "#fef3c7", TRANSMITIDA: "#dcfce7", REJEITADA: "#fee2e2", AGUARDANDO_APROVACAO: "#dbeafe" };
const STATUS_TEXT = { PENDENTE: "#92400e", TRANSMITIDA: "#166534", REJEITADA: "#991b1b", AGUARDANDO_APROVACAO: "#1e40af" };
const RISCO_COLOR = { BAIXO: "#16a34a", ATENCAO: "#d97706", ALTO: "#c2410c", CRITICO: "#991b1b" };
const RISCO_BG    = { BAIXO: "#dcfce7", ATENCAO: "#fef3c7", ALTO: "#ffedd5", CRITICO: "#fee2e2" };

function Badge({ color, bg, text }) {
    return h("span", { style: { fontSize: "11px", fontWeight: 700, background: bg || "#f3f4f6", color: color || "#374151", padding: "2px 8px", borderRadius: "9999px" }, children: text });
}

function fmtDate(iso) { if (!iso) return "—"; return new Date(iso).toLocaleString("pt-BR"); }
function fmtChave(ch) { if (!ch) return "—"; return ch.slice(0, 10) + "..." + ch.slice(-6); }

export default function FiscalManifestacaoPage() {
    const [tab, setTab] = React.useState("pendentes");
    const [pendentes, setPendentes] = React.useState([]);
    const [transmitidas, setTransmitidas] = React.useState([]);
    const [aguardando, setAguardando] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [modal, setModal] = React.useState(null);
    const [tipoManif, setTipoManif] = React.useState("210210");
    const [justificativa, setJustificativa] = React.useState("");
    const [submitting, setSubmitting] = React.useState(false);
    const [erro, setErro] = React.useState("");
    const [filtro, setFiltro] = React.useState("");

    const carregar = React.useCallback(async () => {
        setLoading(true);
        try {
            const [pend, trans, aguar] = await Promise.all([
                apiFetch("/api/fiscal/manifestacao/pendentes").catch(() => []),
                apiFetch("/api/fiscal/manifestacao?status=TRANSMITIDA&pageSize=50").catch(() => ({ items: [] })),
                apiFetch("/api/fiscal/manifestacao?status=AGUARDANDO_APROVACAO&pageSize=50").catch(() => ({ items: [] })),
            ]);
            setPendentes(Array.isArray(pend) ? pend : []);
            setTransmitidas((trans?.items || []).concat(Array.isArray(trans) ? trans : []));
            setAguardando((aguar?.items || []).concat(Array.isArray(aguar) ? aguar : []));
        } finally { setLoading(false); }
    }, []);

    React.useEffect(() => { carregar(); }, [carregar]);

    async function manifestar() {
        if (!modal) return;
        if (!tipoManif) return setErro("Selecione o tipo de manifestação.");
        const precisaJust = modal.scoreRisco >= 51 || tipoManif === "210220" || tipoManif === "210240";
        if (precisaJust && !justificativa.trim()) return setErro("Justificativa obrigatória para este tipo/risco.");
        setSubmitting(true); setErro("");
        try {
            await apiFetch(`/api/fiscal/nfe/${modal.chaveAcesso}/manifestar`, {
                method: "POST",
                body: JSON.stringify({ tipoManifestacao: tipoManif, justificativa: justificativa.trim() }),
            });
            setModal(null); setJustificativa(""); setTipoManif("210210");
            await carregar();
        } catch (e) { setErro(e.message); }
        finally { setSubmitting(false); }
    }

    const filtrar = (arr) => arr.filter(d => !filtro || (d.chaveAcesso || "").includes(filtro) || (d.emitente?.nome || "").toLowerCase().includes(filtro.toLowerCase()) || (d.numero || "").includes(filtro));

    const tabStyle = (t) => ({ padding: "8px 18px", borderRadius: "6px", border: "none", cursor: "pointer", fontWeight: 600, fontSize: "13px", background: tab === t ? "#1e3a5f" : "transparent", color: tab === t ? "#fff" : "hsl(var(--muted-foreground))" });

    return hs("div", { style: { padding: "24px", maxWidth: "1200px", margin: "0 auto" }, children: [
        hs("div", { style: { marginBottom: "20px" }, children: [
            h("h1", { style: { fontSize: "22px", fontWeight: 700, margin: 0 }, children: "Manifestação do Destinatário" }),
            h("p", { style: { fontSize: "13px", color: "hsl(var(--muted-foreground))", marginTop: "4px" }, children: "Gestão de manifestações eletrônicas das NF-e recebidas." }),
        ] }),
        hs("div", { style: { display: "flex", gap: "8px", marginBottom: "16px", background: "hsl(var(--muted))", padding: "4px", borderRadius: "8px", width: "fit-content" }, children: [
            h("button", { style: tabStyle("pendentes"), onClick: () => setTab("pendentes"), children: `Pendentes (${pendentes.length})` }),
            h("button", { style: tabStyle("transmitidas"), onClick: () => setTab("transmitidas"), children: `Transmitidas (${transmitidas.length})` }),
            h("button", { style: tabStyle("aguardando"), onClick: () => setTab("aguardando"), children: `Aguardando Aprovação (${aguardando.length})` }),
        ] }),
        hs("div", { style: { display: "flex", gap: "8px", marginBottom: "16px" }, children: [
            h(Input, { placeholder: "Buscar por chave, emitente ou número...", value: filtro, onChange: e => setFiltro(e.target.value), style: { maxWidth: "400px" } }),
            h(Button, { onClick: carregar, variant: "outline", disabled: loading, children: loading ? "Carregando..." : "↻ Atualizar" }),
        ] }),
        tab === "pendentes" && h(TabelaPendentes, { docs: filtrar(pendentes), onManifestar: doc => { setModal(doc); setTipoManif("210210"); setJustificativa(""); setErro(""); } }),
        tab === "transmitidas" && h(TabelaTransmitidas, { docs: filtrar(transmitidas) }),
        tab === "aguardando" && h(TabelaAguardando, { docs: filtrar(aguardando), onAprovar: carregar }),
        modal && hs("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }, children: [
            h(Card, { style: { width: "520px", maxHeight: "90vh", overflowY: "auto" }, children: h(CardContent, { style: { padding: "24px" }, children: hs("div", { children: [
                hs("div", { style: { marginBottom: "16px" }, children: [
                    h("h2", { style: { fontSize: "17px", fontWeight: 700, margin: 0 }, children: "Manifestar NF-e" }),
                    h("p", { style: { fontSize: "12px", color: "hsl(var(--muted-foreground))", marginTop: "4px" }, children: `Chave: ${fmtChave(modal.chaveAcesso)}` }),
                ] }),
                modal.scoreRisco >= 76 && h("div", { style: { background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", padding: "10px 14px", marginBottom: "12px", fontSize: "13px", color: "#dc2626", fontWeight: 600 }, children: "⚠ Documento com risco CRÍTICO. Justificativa obrigatória e aprovação será necessária." }),
                modal.scoreRisco >= 51 && modal.scoreRisco < 76 && h("div", { style: { background: "#fff7ed", border: "1px solid #fdba74", borderRadius: "8px", padding: "10px 14px", marginBottom: "12px", fontSize: "13px", color: "#c2410c" }, children: "⚠ Documento com risco ALTO. Justificativa obrigatória." }),
                hs("div", { style: { marginBottom: "14px" }, children: [
                    h(Label, { children: "Tipo de Manifestação" }),
                    h("select", { value: tipoManif, onChange: e => setTipoManif(e.target.value), style: { width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid hsl(var(--border))", marginTop: "4px" }, children:
                        Object.entries(TIPO_LABELS).map(([k, v]) => h("option", { key: k, value: k, children: v }))
                    }),
                ] }),
                hs("div", { style: { marginBottom: "14px" }, children: [
                    h(Label, { children: (modal.scoreRisco >= 51 || tipoManif === "210220" || tipoManif === "210240") ? "Justificativa (obrigatória)" : "Justificativa (opcional)" }),
                    h("textarea", { value: justificativa, onChange: e => setJustificativa(e.target.value), rows: 4, style: { width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid hsl(var(--border))", resize: "vertical", marginTop: "4px", fontSize: "13px" }, placeholder: "Descreva o motivo da manifestação..." }),
                ] }),
                erro && h("p", { style: { color: "#dc2626", fontSize: "13px", marginBottom: "10px" }, children: erro }),
                hs("div", { style: { display: "flex", gap: "8px", justifyContent: "flex-end" }, children: [
                    h(Button, { variant: "outline", onClick: () => setModal(null), disabled: submitting, children: "Cancelar" }),
                    h(Button, { onClick: manifestar, disabled: submitting, children: submitting ? "Enviando..." : "Confirmar Manifestação" }),
                ] }),
            ] }) }) }),
        ] }),
    ] });
}

function TabelaPendentes({ docs, onManifestar }) {
    if (!docs.length) return h("p", { style: { textAlign: "center", color: "hsl(var(--muted-foreground))", padding: "40px" }, children: "Nenhum documento pendente de manifestação." });
    return h("div", { style: { display: "grid", gap: "8px" }, children: docs.map(d => hs("div", { key: d.id || d.chaveAcesso, style: { display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", border: "1px solid hsl(var(--border))", borderRadius: "8px", background: "hsl(var(--card))" }, children: [
        hs("div", { style: { flex: 1 }, children: [
            hs("div", { style: { display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px" }, children: [
                h("span", { style: { fontWeight: 700, fontSize: "14px" }, children: `NF-e ${d.numero || "—"} / ${d.serie || "—"}` }),
                d.scoreRisco != null && h(Badge, { color: RISCO_COLOR[d.classificacaoRisco] || "#374151", bg: RISCO_BG[d.classificacaoRisco] || "#f3f4f6", text: `Risco: ${d.scoreRisco}` }),
            ] }),
            h("p", { style: { fontSize: "12px", color: "hsl(var(--muted-foreground))" }, children: `${d.emitente?.nome || "—"} · Valor: R$ ${(d.valorTotal || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} · Emissão: ${fmtDate(d.dhEmissao)}` }),
            h("p", { style: { fontSize: "11px", fontFamily: "monospace", color: "hsl(var(--muted-foreground))", marginTop: "2px" }, children: fmtChave(d.chaveAcesso) }),
        ] }),
        h(Button, { onClick: () => onManifestar(d), size: "sm", children: "Manifestar" }),
    ] })) });
}

function TabelaTransmitidas({ docs }) {
    if (!docs.length) return h("p", { style: { textAlign: "center", color: "hsl(var(--muted-foreground))", padding: "40px" }, children: "Nenhuma manifestação transmitida encontrada." });
    return h("div", { style: { display: "grid", gap: "8px" }, children: docs.map(d => hs("div", { key: d.id, style: { padding: "12px 16px", border: "1px solid hsl(var(--border))", borderRadius: "8px", background: "hsl(var(--card))" }, children: [
        hs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
            h("span", { style: { fontWeight: 600, fontSize: "14px" }, children: TIPO_LABELS[d.tipoManifestacao] || d.tipoManifestacao }),
            h("span", { style: { fontSize: "11px", fontWeight: 700, color: STATUS_TEXT[d.status] || "#6b7280", background: STATUS_COLORS[d.status] || "#f3f4f6", padding: "2px 8px", borderRadius: "9999px" }, children: d.status }),
        ] }),
        h("p", { style: { fontSize: "12px", color: "hsl(var(--muted-foreground))", marginTop: "4px" }, children: `Chave: ${fmtChave(d.chaveAcesso)} · ${fmtDate(d.dataTransmissao)}` }),
        d.justificativa && h("p", { style: { fontSize: "12px", marginTop: "4px", fontStyle: "italic" }, children: d.justificativa }),
    ] })) });
}

function TabelaAguardando({ docs, onAprovar }) {
    if (!docs.length) return h("p", { style: { textAlign: "center", color: "hsl(var(--muted-foreground))", padding: "40px" }, children: "Nenhuma manifestação aguardando aprovação." });
    return h("div", { style: { display: "grid", gap: "8px" }, children: docs.map(d => hs("div", { key: d.id, style: { padding: "12px 16px", border: "1px solid #dbeafe", borderRadius: "8px", background: "#f0f9ff" }, children: [
        hs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
            h("span", { style: { fontWeight: 600, fontSize: "14px" }, children: TIPO_LABELS[d.tipoManifestacao] || d.tipoManifestacao }),
            hs("div", { style: { display: "flex", gap: "8px" } }),
        ] }),
        h("p", { style: { fontSize: "12px", color: "hsl(var(--muted-foreground))", marginTop: "4px" }, children: `Chave: ${fmtChave(d.chaveAcesso)} · Score: ${d.scoreRisco}` }),
        d.justificativa && h("p", { style: { fontSize: "12px", marginTop: "4px", fontStyle: "italic" }, children: d.justificativa }),
    ] })) });
}