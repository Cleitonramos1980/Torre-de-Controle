import { r as React, j as jsxRuntime, J as Card, N as CardContent, B as Button } from "./index-Cw1PFMX8.js";
import { I as Input } from "./input-CnWhQnjH.js";

const h  = jsxRuntime.jsx;
const hs = jsxRuntime.jsxs;

// ── Utilitários ───────────────────────────────────────────────────────────────
function getToken() {
    try { return JSON.parse(localStorage.getItem("sgq.authSession") || "{}").token || ""; } catch { return ""; }
}
async function apiFetch(path, opts) {
    const res  = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(opts?.headers || {}) } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || json?.error || json?.message || `Erro ${res.status}`);
    return json;
}
function fmt(v) {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "R$ 0,00";
}
function fmtNum(v, dec = 2) {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec }) : "0";
}
function fmtDate(v) {
    if (!v) return "—";
    const s = String(v).slice(0, 10);
    const d = new Date(`${s}T00:00:00`);
    return isNaN(d) ? s : d.toLocaleDateString("pt-BR");
}
function bq(params) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
        if (v == null) return;
        if (typeof v === "boolean") { if (v) q.set(k, "true"); return; }
        if (typeof v === "string" && !v.trim()) return;
        q.set(k, String(v));
    });
    const s = q.toString(); return s ? `?${s}` : "";
}

// ── Badges de posição ─────────────────────────────────────────────────────────
const POSICAO_MAP = {
    B: { bg: "#fee2e2", color: "#991b1b", label: "Bloqueado" },
    P: { bg: "#fef3c7", color: "#92400e", label: "Pendente"  },
    L: { bg: "#dcfce7", color: "#166534", label: "Liberado"  },
    M: { bg: "#dbeafe", color: "#1e40af", label: "Montado"   },
    C: { bg: "#f3f4f6", color: "#6b7280", label: "Cancelado" },
};
function posicaoBadge(posicao) {
    const p = POSICAO_MAP[String(posicao || "").trim()] || { bg: "#f3f4f6", color: "#6b7280", label: posicao || "—" };
    return h("span", { style: { background: p.bg, color: p.color, padding: "2px 8px", borderRadius: "9999px", fontSize: "10px", fontWeight: 700, whiteSpace: "nowrap" }, children: p.label });
}
function wmsBadge(v) {
    if (String(v || "N").trim() === "S")
        return h("span", { style: { background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: "9999px", fontSize: "10px", fontWeight: 700 }, children: "WMS" });
    return h("span", { style: { background: "#f3f4f6", color: "#9ca3af", padding: "2px 6px", borderRadius: "9999px", fontSize: "10px" }, children: "—" });
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, color, sub }) {
    return h(Card, { children: h(CardContent, { style: { padding: "14px 18px" }, children:
        hs("div", { children: [
            h("p", { key: "l", style: { fontSize: "11px", color: "#6b7280", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }, children: label }),
            h("p", { key: "v", style: { fontSize: "22px", fontWeight: 700, color: color || "inherit", lineHeight: 1 }, children: value ?? "—" }),
            sub ? h("p", { key: "s", style: { fontSize: "10px", color: "#9ca3af", marginTop: "2px" } , children: sub }) : null,
        ]})
    })});
}

// ── Painel de Itens (Nível 2) ─────────────────────────────────────────────────
function PainelItens({ numped }) {
    const [itens,   setItens]   = React.useState(null);
    const [loading, setLoading] = React.useState(true);
    const [erro,    setErro]    = React.useState(null);

    React.useEffect(() => {
        if (!numped) return;
        setLoading(true); setErro(null); setItens(null);
        apiFetch(`/api/monitoramento/pedidos/${numped}/itens`)
            .then(r => setItens(r.data || []))
            .catch(e => setErro(e.message))
            .finally(() => setLoading(false));
    }, [numped]);

    if (loading) return h("div", { style: { padding: "20px 0", color: "#6b7280", textAlign: "center", fontSize: "12px" }, children: "Carregando itens..." });
    if (erro)    return h("div", { style: { padding: "12px 0", color: "#dc2626", fontSize: "12px" }, children: `Erro: ${erro}` });
    if (!itens || itens.length === 0)
        return h("div", { style: { padding: "12px 0", color: "#6b7280", fontSize: "12px" }, children: "Nenhum item encontrado para este pedido." });

    const th  = { padding: "6px 10px", textAlign: "left",  fontWeight: 700, fontSize: "11px", color: "#374151", whiteSpace: "nowrap", borderBottom: "2px solid #d1d5db", background: "#e8f0fe" };
    const thR = { ...th, textAlign: "right" };
    const td  = { padding: "5px 10px", verticalAlign: "middle", fontSize: "12px", borderBottom: "1px solid #f3f4f6" };
    const tdR = { ...td, textAlign: "right" };

    return h("div", { style: { overflowX: "auto" }, children:
        hs("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "12px" }, children: [
            h("thead", { key: "th", children: h("tr", { children: [
                h("th", { key: "sq",  style: th,               children: "Seq."       }),
                h("th", { key: "cp",  style: th,               children: "Cód."       }),
                h("th", { key: "dc",  style: { ...th, minWidth: "180px" }, children: "Descrição"  }),
                h("th", { key: "em",  style: th,               children: "Embalagem"  }),
                h("th", { key: "un",  style: th,               children: "Unid."      }),
                h("th", { key: "ps",  style: th,               children: "Posição"    }),
                h("th", { key: "qt",  style: thR,              children: "Qtde"       }),
                h("th", { key: "qd",  style: thR,              children: "Qt. Disp."  }),
                h("th", { key: "pv",  style: thR,              children: "Venda"      }),
                h("th", { key: "pt",  style: thR,              children: "Tabela"     }),
                h("th", { key: "pd",  style: thR,              children: "% Desc."    }),
                h("th", { key: "pc",  style: thR,              children: "% Com."     }),
                h("th", { key: "st",  style: thR,              children: "ST"         }),
                h("th", { key: "ip",  style: thR,              children: "IPI"        }),
                h("th", { key: "cr",  style: thR,              children: "C. Real"    }),
                h("th", { key: "cf",  style: thR,              children: "C. Fin."    }),
                h("th", { key: "lt",  style: th,               children: "Lote"       }),
                h("th", { key: "te",  style: th,               children: "Tp. Entrega"}),
            ]}) }),
            h("tbody", { key: "tb", children: itens.map((item, i) =>
                hs("tr", { key: i, style: { background: i % 2 === 0 ? "#fff" : "#f9fafb" }, children: [
                    h("td", { key: "sq",  style: { ...td, fontFamily: "monospace" },              children: String(item.NUMSEQ      || "—") }),
                    h("td", { key: "cp",  style: { ...td, fontFamily: "monospace" },              children: String(item.CODPROD     || "—") }),
                    h("td", { key: "dc",  style: { ...td, maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: item.DESCRICAO || "", children: item.DESCRICAO || "—" }),
                    h("td", { key: "em",  style: { ...td, whiteSpace: "nowrap" },                children: item.EMBALAGEM  || "—" }),
                    h("td", { key: "un",  style: { ...td, whiteSpace: "nowrap" },                children: item.UNIDADE    || "—" }),
                    h("td", { key: "ps",  style: { ...td, whiteSpace: "nowrap" },                children: posicaoBadge(item.POSICAO) }),
                    h("td", { key: "qt",  style: { ...tdR, whiteSpace: "nowrap" },               children: fmtNum(item.QT,          4) }),
                    h("td", { key: "qd",  style: { ...tdR, whiteSpace: "nowrap" },               children: fmtNum(item.QTDISPONIVEL, 4) }),
                    h("td", { key: "pv",  style: { ...tdR, whiteSpace: "nowrap" },               children: fmt(item.PVENDA)      }),
                    h("td", { key: "pt",  style: { ...tdR, whiteSpace: "nowrap" },               children: fmt(item.PTABELA)     }),
                    h("td", { key: "pd",  style: { ...tdR, whiteSpace: "nowrap" },               children: fmtNum(item.PERDESC) + "%" }),
                    h("td", { key: "pc",  style: { ...tdR, whiteSpace: "nowrap" },               children: fmtNum(item.PERCOM)  + "%" }),
                    h("td", { key: "st",  style: { ...tdR, whiteSpace: "nowrap" },               children: fmt(item.ST)          }),
                    h("td", { key: "ip",  style: { ...tdR, whiteSpace: "nowrap" },               children: fmt(item.VLIPI)       }),
                    h("td", { key: "cr",  style: { ...tdR, whiteSpace: "nowrap" },               children: fmt(item.VLCUSTOREAL) }),
                    h("td", { key: "cf",  style: { ...tdR, whiteSpace: "nowrap" },               children: fmt(item.VLCUSTOFIN)  }),
                    h("td", { key: "lt",  style: { ...td,  whiteSpace: "nowrap" },               children: item.NUMLOTE      || "—" }),
                    h("td", { key: "te",  style: { ...td,  whiteSpace: "nowrap" },               children: item.TIPOENTREGA  || "—" }),
                ]})
            ) }),
        ]})
    });
}

// ── Linha expandida ───────────────────────────────────────────────────────────
function LinhaExpandida({ pedido, colSpan }) {
    return h("tr", { children:
        h("td", { colSpan, style: { padding: 0, background: "#f0f7ff", borderBottom: "2px solid #3b82f6", borderTop: "none" }, children:
            hs("div", { style: { padding: "12px 16px 16px 40px" }, children: [
                h("div", { key: "hdr", style: { fontSize: "11px", fontWeight: 700, color: "#1d4ed8", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.04em" }, children: `Itens do Pedido ${pedido.NUMPED}` }),
                h(PainelItens, { key: "pi", numped: pedido.NUMPED }),
            ]})
        })
    });
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function MonitoramentoPedidosPage() {
    const hoje      = new Date();
    const seteDias  = new Date(hoje);
    seteDias.setDate(seteDias.getDate() - 7);
    const toInputDate = d => d.toISOString().slice(0, 10);

    const [filtros, setFiltros] = React.useState({
        codfilial: "", dtInicio: toInputDate(seteDias), dtFim: toInputDate(hoje),
        numped: "", codcli: "", cliente: "", cnpj: "",
        posicao: "", codusur: "", codcob: "", codplpag: "",
        numcar: "", origemPed: "", wms: "",
    });
    const [pedidos,     setPedidos]     = React.useState([]);
    const [resumo,      setResumo]      = React.useState(null);
    const [loading,     setLoading]     = React.useState(false);
    const [loadingRes,  setLoadingRes]  = React.useState(false);
    const [erro,        setErro]        = React.useState(null);
    const [page,        setPage]        = React.useState(1);
    const pageSize  = 50;
    const [buscaFeita,  setBuscaFeita]  = React.useState(false);
    const [expandedKey, setExpandedKey] = React.useState(null);

    function setF(k, v) { setFiltros(prev => ({ ...prev, [k]: v })); }

    function limpar() {
        setFiltros({ codfilial: "", dtInicio: toInputDate(seteDias), dtFim: toInputDate(hoje), numped: "", codcli: "", cliente: "", cnpj: "", posicao: "", codusur: "", codcob: "", codplpag: "", numcar: "", origemPed: "", wms: "" });
        setPedidos([]); setResumo(null); setErro(null); setBuscaFeita(false); setPage(1); setExpandedKey(null);
    }

    async function buscar(pg) {
        const p = pg ?? page;
        if (!filtros.codfilial.trim()) { setErro("Filial é obrigatória para a consulta."); return; }
        if (!filtros.dtInicio || !filtros.dtFim) { setErro("Período é obrigatório."); return; }

        setLoading(true); setErro(null); setBuscaFeita(true); setExpandedKey(null);

        // Resumo paralelo apenas na primeira página
        if (p === 1) {
            setLoadingRes(true);
            apiFetch(`/api/monitoramento/pedidos/resumo${bq({ codfilial: filtros.codfilial, dtInicio: filtros.dtInicio, dtFim: filtros.dtFim })}`)
                .then(r => setResumo(r))
                .catch(() => setResumo(null))
                .finally(() => setLoadingRes(false));
        }

        try {
            const params = { codfilial: filtros.codfilial, dtInicio: filtros.dtInicio, dtFim: filtros.dtFim, page: p, pageSize };
            if (filtros.numped)    params.numped    = filtros.numped;
            if (filtros.codcli)    params.codcli    = filtros.codcli;
            if (filtros.cliente)   params.cliente   = filtros.cliente;
            if (filtros.cnpj)      params.cnpj      = filtros.cnpj;
            if (filtros.posicao)   params.posicao   = filtros.posicao;
            if (filtros.codusur)   params.codusur   = filtros.codusur;
            if (filtros.codcob)    params.codcob    = filtros.codcob;
            if (filtros.codplpag)  params.codplpag  = filtros.codplpag;
            if (filtros.numcar)    params.numcar    = filtros.numcar;
            if (filtros.origemPed) params.origemPed = filtros.origemPed;
            if (filtros.wms === "S") params.wms = "S";

            const r = await apiFetch(`/api/monitoramento/pedidos${bq(params)}`);
            setPedidos(r.data || []);
            setPage(p);
        } catch (e) {
            setErro(e.message);
        } finally {
            setLoading(false);
        }
    }

    function toggleRow(key) { setExpandedKey(prev => prev === key ? null : key); }

    // ── Estilos reutilizáveis ─────────────────────────────────────────────────
    const lblStyle = { fontSize: "11px", color: "#6b7280", fontWeight: 600, marginBottom: "3px" };
    const COLS     = 17;
    const thStyle  = { padding: "10px 10px", textAlign: "left", fontWeight: 700, fontSize: "11px", color: "#374151", whiteSpace: "nowrap", background: "#f9fafb", borderBottom: "2px solid #e5e7eb" };
    const thRStyle = { ...thStyle, textAlign: "right" };

    // ── Totais da página atual ─────────────────────────────────────────────────
    const totVlTotal  = pedidos.reduce((s, p) => s + Number(p.VLTOTAL  || 0), 0);
    const totVlAtend  = pedidos.reduce((s, p) => s + Number(p.VLATEND  || 0), 0);
    const totPeso     = pedidos.reduce((s, p) => s + Number(p.TOTPESO  || 0), 0);

    return hs("div", { className: "space-y-6 animate-fade-in", children: [

        // ── Cabeçalho ─────────────────────────────────────────────────────────
        hs("div", { key: "hdr", children: [
            h("h1", { key: "t", className: "text-2xl font-bold text-foreground", children: "Pedidos" }),
            h("p",  { key: "s", className: "text-sm text-muted-foreground mt-1", children: "Relatório para análise dos pedidos de venda do WinThor. Somente consulta." }),
        ]}),

        // ── KPIs — totais gerais (resumo do período) ──────────────────────────
        resumo ? hs("div", { key: "kpis1", style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }, children: [
            h(KpiCard, { key: "k1", label: "Total de Pedidos",  value: Number(resumo.QTPEDIDO     || 0).toLocaleString("pt-BR"), color: "#2563eb" }),
            h(KpiCard, { key: "k2", label: "Valor dos Pedidos", value: fmt(resumo.VLPEDIDOS),  color: "#16a34a" }),
            h(KpiCard, { key: "k3", label: "Valor Atendido",    value: fmt(resumo.VLATEND),    color: "#0891b2" }),
            h(KpiCard, { key: "k4", label: "Peso Total (kg)",   value: fmtNum(resumo.TOTPESO), color: "#d97706" }),
        ]}) : (loadingRes ? h("div", { key: "kpis-load", style: { color: "#9ca3af", fontSize: "12px", padding: "8px 0" }, children: "Carregando resumo..." }) : null),

        // ── KPIs — status ─────────────────────────────────────────────────────
        resumo ? hs("div", { key: "kpis2", style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px" }, children: [
            h(KpiCard, { key: "kb", label: "Bloqueados", value: Number(resumo.QT_BLOQUEADOS || 0).toLocaleString("pt-BR"), color: "#dc2626" }),
            h(KpiCard, { key: "kp", label: "Pendentes",  value: Number(resumo.QT_PENDENTES  || 0).toLocaleString("pt-BR"), color: "#d97706" }),
            h(KpiCard, { key: "kl", label: "Liberados",  value: Number(resumo.QT_LIBERADOS  || 0).toLocaleString("pt-BR"), color: "#16a34a" }),
            h(KpiCard, { key: "km", label: "Montados",   value: Number(resumo.QT_MONTADOS   || 0).toLocaleString("pt-BR"), color: "#2563eb" }),
        ]}) : null,

        // ── Filtros ───────────────────────────────────────────────────────────
        h(Card, { key: "filtros", children: h(CardContent, { style: { padding: "16px" }, children:
            hs("div", { children: [
                h("p", { key: "tit", style: { fontSize: "12px", fontWeight: 700, color: "#374151", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.04em" }, children: "Filtros" }),

                // Linha 1: campos principais obrigatórios
                hs("div", { key: "r1", style: { display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "10px", alignItems: "flex-end" }, children: [
                    hs("div", { key: "fl", style: { display: "flex", flexDirection: "column", gap: "3px" }, children: [
                        h("label", { key: "l", style: lblStyle, children: "Filial *" }),
                        h(Input, { style: { width: "90px" }, placeholder: "Cód. Filial", value: filtros.codfilial, onChange: e => setF("codfilial", e.target.value.toUpperCase()), onKeyDown: e => e.key === "Enter" && buscar(1) }),
                    ]}),
                    hs("div", { key: "di", style: { display: "flex", flexDirection: "column", gap: "3px" }, children: [
                        h("label", { key: "l", style: lblStyle, children: "Data Inicial *" }),
                        h(Input, { type: "date", style: { width: "145px" }, value: filtros.dtInicio, onChange: e => setF("dtInicio", e.target.value) }),
                    ]}),
                    hs("div", { key: "df", style: { display: "flex", flexDirection: "column", gap: "3px" }, children: [
                        h("label", { key: "l", style: lblStyle, children: "Data Final *" }),
                        h(Input, { type: "date", style: { width: "145px" }, value: filtros.dtFim, onChange: e => setF("dtFim", e.target.value) }),
                    ]}),
                    hs("div", { key: "np", style: { display: "flex", flexDirection: "column", gap: "3px" }, children: [
                        h("label", { key: "l", style: lblStyle, children: "Nº Pedido" }),
                        h(Input, { style: { width: "100px" }, placeholder: "NUMPED", value: filtros.numped, onChange: e => setF("numped", e.target.value) }),
                    ]}),
                    hs("div", { key: "cc", style: { display: "flex", flexDirection: "column", gap: "3px" }, children: [
                        h("label", { key: "l", style: lblStyle, children: "Cód. Cliente" }),
                        h(Input, { style: { width: "90px" }, placeholder: "CODCLI", value: filtros.codcli, onChange: e => setF("codcli", e.target.value) }),
                    ]}),
                    hs("div", { key: "cl", style: { display: "flex", flexDirection: "column", gap: "3px" }, children: [
                        h("label", { key: "l", style: lblStyle, children: "Cliente" }),
                        h(Input, { style: { width: "180px" }, placeholder: "Nome do cliente", value: filtros.cliente, onChange: e => setF("cliente", e.target.value) }),
                    ]}),
                    hs("div", { key: "cn", style: { display: "flex", flexDirection: "column", gap: "3px" }, children: [
                        h("label", { key: "l", style: lblStyle, children: "CNPJ/CPF" }),
                        h(Input, { style: { width: "140px" }, placeholder: "CNPJ ou CPF", value: filtros.cnpj, onChange: e => setF("cnpj", e.target.value) }),
                    ]}),
                ]}),

                // Linha 2: filtros adicionais
                hs("div", { key: "r2", style: { display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "14px", alignItems: "flex-end" }, children: [
                    hs("div", { key: "ps", style: { display: "flex", flexDirection: "column", gap: "3px" }, children: [
                        h("label", { key: "l", style: lblStyle, children: "Posição" }),
                        h(Input, { style: { width: "80px" }, placeholder: "B/P/L/M", value: filtros.posicao, maxLength: 1, onChange: e => setF("posicao", e.target.value.toUpperCase()) }),
                    ]}),
                    hs("div", { key: "cu", style: { display: "flex", flexDirection: "column", gap: "3px" }, children: [
                        h("label", { key: "l", style: lblStyle, children: "Vendedor" }),
                        h(Input, { style: { width: "90px" }, placeholder: "CODUSUR", value: filtros.codusur, onChange: e => setF("codusur", e.target.value) }),
                    ]}),
                    hs("div", { key: "cb", style: { display: "flex", flexDirection: "column", gap: "3px" }, children: [
                        h("label", { key: "l", style: lblStyle, children: "Cobrança" }),
                        h(Input, { style: { width: "90px" }, placeholder: "CODCOB", value: filtros.codcob, onChange: e => setF("codcob", e.target.value) }),
                    ]}),
                    hs("div", { key: "pp", style: { display: "flex", flexDirection: "column", gap: "3px" }, children: [
                        h("label", { key: "l", style: lblStyle, children: "Plano Pgto" }),
                        h(Input, { style: { width: "90px" }, placeholder: "CODPLPAG", value: filtros.codplpag, onChange: e => setF("codplpag", e.target.value) }),
                    ]}),
                    hs("div", { key: "nc", style: { display: "flex", flexDirection: "column", gap: "3px" }, children: [
                        h("label", { key: "l", style: lblStyle, children: "Carregamento" }),
                        h(Input, { style: { width: "100px" }, placeholder: "NUMCAR", value: filtros.numcar, onChange: e => setF("numcar", e.target.value) }),
                    ]}),
                    hs("div", { key: "op", style: { display: "flex", flexDirection: "column", gap: "3px" }, children: [
                        h("label", { key: "l", style: lblStyle, children: "Origem" }),
                        h(Input, { style: { width: "90px" }, placeholder: "Origem", value: filtros.origemPed, onChange: e => setF("origemPed", e.target.value) }),
                    ]}),
                    hs("div", { key: "wm", style: { display: "flex", flexDirection: "column", gap: "3px" }, children: [
                        h("label", { key: "l", style: lblStyle, children: "WMS" }),
                        hs("select", { style: { width: "80px", height: "36px", border: "1px solid #d1d5db", borderRadius: "6px", padding: "0 8px", fontSize: "13px", background: "#fff" }, value: filtros.wms, onChange: e => setF("wms", e.target.value), children: [
                            h("option", { key: "t", value: "" , children: "Todos" }),
                            h("option", { key: "s", value: "S", children: "Sim"   }),
                        ]}),
                    ]}),
                    hs("div", { key: "btns", style: { display: "flex", gap: "8px" }, children: [
                        h(Button, { key: "b1", onClick: () => buscar(1), disabled: loading, children: loading ? "Buscando..." : "Filtrar" }),
                        h(Button, { key: "b2", variant: "outline", onClick: limpar, children: "Limpar" }),
                    ]}),
                ]}),

                erro ? h("p", { key: "erro", style: { color: "#dc2626", fontSize: "13px" }, children: erro }) : null,
            ]})
        }) }),

        // ── Tabela principal ──────────────────────────────────────────────────
        h(Card, { key: "tabela", children: h(CardContent, { style: { padding: 0 }, children:
            !buscaFeita
            ? h("div", { style: { padding: "48px", textAlign: "center", color: "#9ca3af" }, children: h("p", { children: "Informe a filial e o período e clique em Filtrar." }) })
            : loading
            ? h("div", { style: { padding: "48px", textAlign: "center", color: "#9ca3af" }, children: h("p", { children: "Buscando pedidos..." }) })
            : pedidos.length === 0
            ? h("div", { style: { padding: "48px", textAlign: "center", color: "#9ca3af" }, children: h("p", { children: "Nenhum pedido encontrado para os filtros informados." }) })
            : hs("div", { children: [

                // Paginação
                hs("div", { key: "pg", style: { padding: "10px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
                    h("span", { key: "cnt", style: { fontSize: "13px", color: "#374151" }, children: `${pedidos.length} registros — Página ${page}` }),
                    hs("div",  { key: "btns", style: { display: "flex", gap: "8px" }, children: [
                        h(Button, { key: "prev", size: "sm", variant: "outline", onClick: () => buscar(page - 1), disabled: page <= 1,                   children: "← Anterior" }),
                        h(Button, { key: "next", size: "sm", variant: "outline", onClick: () => buscar(page + 1), disabled: pedidos.length < pageSize, children: "Próxima →"  }),
                    ]}),
                ]}),

                // Tabela
                h("div", { key: "scroll", style: { overflowX: "auto" }, children:
                    hs("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "12px" }, children: [
                        h("thead", { key: "th", children: h("tr", { children: [
                            h("th", { key: "tog", style: { ...thStyle, width: "28px", padding: "10px 6px" }, children: "" }),
                            h("th", { key: "np",  style: thStyle,                              children: "Pedido"      }),
                            h("th", { key: "dt",  style: thStyle,                              children: "Data"        }),
                            h("th", { key: "fl",  style: thStyle,                              children: "Filial"      }),
                            h("th", { key: "cd",  style: thStyle,                              children: "Cód. Cli."   }),
                            h("th", { key: "cl",  style: { ...thStyle, minWidth: "160px" },    children: "Cliente"     }),
                            h("th", { key: "cn",  style: thStyle,                              children: "CNPJ/CPF"    }),
                            h("th", { key: "ps",  style: thStyle,                              children: "Posição"     }),
                            h("th", { key: "mb",  style: { ...thStyle, minWidth: "120px" },    children: "Motivo Bloq."}),
                            h("th", { key: "vd",  style: thStyle,                              children: "Vendedor"    }),
                            h("th", { key: "pp",  style: { ...thStyle, minWidth: "110px" },    children: "Plano Pgto"  }),
                            h("th", { key: "ni",  style: thRStyle,                             children: "Itens"       }),
                            h("th", { key: "vt",  style: thRStyle,                             children: "Vl. Pedido"  }),
                            h("th", { key: "va",  style: thRStyle,                             children: "Vl. Atend."  }),
                            h("th", { key: "vf",  style: thRStyle,                             children: "Vl. Frete"   }),
                            h("th", { key: "nc",  style: thStyle,                              children: "Carreg."     }),
                            h("th", { key: "wm",  style: { ...thStyle, textAlign: "center" },  children: "WMS"         }),
                        ]}) }),
                        h("tbody", { key: "tb", children:
                            pedidos.flatMap((ped, i) => {
                                const key   = ped.NUMPED || i;
                                const isOpen = expandedKey === key;
                                const tdCell = { padding: "9px 10px", verticalAlign: "middle", whiteSpace: "nowrap" };
                                const tdCellR = { ...tdCell, textAlign: "right" };
                                const rowBg = isOpen ? "#e0f0ff" : (i % 2 === 0 ? "#fff" : "#fafafa");

                                const mainRow = hs("tr", {
                                    key: `r-${key}`,
                                    onClick: () => toggleRow(key),
                                    style: { borderBottom: isOpen ? "none" : "1px solid #f0f0f0", background: rowBg, cursor: "pointer", transition: "background 0.12s" },
                                    children: [
                                        h("td", { key: "tog", style: { ...tdCell, padding: "9px 6px", textAlign: "center", color: isOpen ? "#2563eb" : "#9ca3af", fontSize: "11px", fontWeight: 700 }, children: isOpen ? "▼" : "▶" }),
                                        h("td", { key: "np",  style: { ...tdCell, fontFamily: "monospace", fontWeight: 700 }, children: String(ped.NUMPED    || "—") }),
                                        h("td", { key: "dt",  style: tdCell,  children: fmtDate(ped.DATA) }),
                                        h("td", { key: "fl",  style: tdCell,  children: String(ped.CODFILIAL || "—") }),
                                        h("td", { key: "cd",  style: { ...tdCell, fontFamily: "monospace" }, children: String(ped.CODCLI || "—") }),
                                        h("td", { key: "cl",  style: { ...tdCell, maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis" }, title: ped.CLIENTE || "", children: ped.FANTASIA || ped.CLIENTE || "—" }),
                                        h("td", { key: "cn",  style: { ...tdCell, fontFamily: "monospace", fontSize: "11px" }, children: ped.CGCENT || "—" }),
                                        h("td", { key: "ps",  style: tdCell,  children: posicaoBadge(ped.POSICAO) }),
                                        h("td", { key: "mb",  style: { ...tdCell, maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", fontSize: "11px", color: "#dc2626" }, title: ped.MOTIVOBLOQUEIO || "", children: ped.MOTIVOBLOQUEIO || "—" }),
                                        h("td", { key: "vd",  style: { ...tdCell, maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis" }, title: ped.NOMEUSUR || "", children: ped.NOMEUSUR || String(ped.CODUSUR || "—") }),
                                        h("td", { key: "pp",  style: { ...tdCell, maxWidth: "130px", overflow: "hidden", textOverflow: "ellipsis" }, title: ped.DESCPLPAG || "", children: ped.DESCPLPAG || String(ped.CODPLPAG || "—") }),
                                        h("td", { key: "ni",  style: tdCellR, children: Number(ped.NUMITENS || 0).toLocaleString("pt-BR") }),
                                        h("td", { key: "vt",  style: tdCellR, children: fmt(ped.VLTOTAL)  }),
                                        h("td", { key: "va",  style: tdCellR, children: fmt(ped.VLATEND)  }),
                                        h("td", { key: "vf",  style: tdCellR, children: fmt(ped.VLFRETE)  }),
                                        h("td", { key: "nc",  style: { ...tdCell, fontFamily: "monospace" }, children: ped.NUMCAR ? String(ped.NUMCAR) : "—" }),
                                        h("td", { key: "wm",  style: { ...tdCell, textAlign: "center" }, children: wmsBadge(ped.USAINTEGRACAOWMS) }),
                                    ]
                                });

                                return isOpen
                                    ? [mainRow, h(LinhaExpandida, { key: `e-${key}`, pedido: ped, colSpan: COLS })]
                                    : [mainRow];
                            })
                        }),
                    ]})
                }),

                // Rodapé com totais da página
                hs("div", { key: "footer", style: { padding: "10px 16px", borderTop: "2px solid #e5e7eb", display: "flex", gap: "24px", fontSize: "12px", color: "#374151", background: "#f9fafb" }, children: [
                    hs("span", { key: "tv", children: [h("strong", { key: "l" }, "Vl. Total: "), fmt(totVlTotal)]  }),
                    hs("span", { key: "ta", children: [h("strong", { key: "l" }, "Vl. Atendido: "), fmt(totVlAtend)]  }),
                    hs("span", { key: "tp", children: [h("strong", { key: "l" }, "Peso Total (kg): "), fmtNum(totPeso)] }),
                    h("span",  { key: "inf", style: { color: "#9ca3af" }, children: "* Totais referentes à página atual" }),
                ]}),
            ]})
        }) }),
    ]});
}
