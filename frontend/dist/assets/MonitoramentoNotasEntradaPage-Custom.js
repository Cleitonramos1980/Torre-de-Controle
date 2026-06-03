import { r as React, j as jsxRuntime, J as Card, N as CardContent, B as Button } from "./index-Cw1PFMX8.js";
import { I as Input } from "./input-CnWhQnjH.js";

const h = jsxRuntime.jsx;
const hs = jsxRuntime.jsxs;

function getToken() { try { return JSON.parse(localStorage.getItem("sgq.authSession") || "{}").token || ""; } catch { return ""; } }
async function apiFetch(path, opts) {
    const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(opts?.headers || {}) } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || json?.error || json?.message || `Erro ${res.status}`);
    return json;
}
function fmt(v) { const n = Number(v ?? 0); return Number.isFinite(n) ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "R$ 0,00"; }
function fmtDate(v) { if (!v) return "—"; const s = String(v).slice(0, 10); const d = new Date(`${s}T00:00:00`); return isNaN(d) ? s : d.toLocaleDateString("pt-BR"); }
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

function KpiCard({ label, value, color }) {
    return h(Card, { children: h(CardContent, { style: { padding: "14px 18px" }, children: hs("div", { children: [
        h("p", { key: "l", style: { fontSize: "11px", color: "#6b7280", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }, children: label }),
        h("p", { key: "v", style: { fontSize: "22px", fontWeight: 700, color: color || "inherit", lineHeight: 1 }, children: value ?? "—" }),
    ]}) }) });
}

// Painel de itens — carrega automaticamente quando montado
function PainelItens({ numTransEnt, codfilial, dtEnt }) {
    const [itens, setItens] = React.useState(null);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState(null);

    React.useEffect(() => {
        if (!numTransEnt || !codfilial || !dtEnt) return;
        setLoading(true); setErro(null); setItens(null);
        apiFetch(`/api/monitoramento/notas-entrada/${numTransEnt}/itens${bq({ codfilial, dtEnt })}`)
            .then(r => setItens(r.data || []))
            .catch(e => setErro(e.message))
            .finally(() => setLoading(false));
    }, [numTransEnt, codfilial, dtEnt]);

    if (loading) return h("div", { style: { padding: "20px 0", color: "#6b7280", textAlign: "center", fontSize: "12px" }, children: "Carregando itens..." });
    if (erro) return h("div", { style: { padding: "12px 0", color: "#dc2626", fontSize: "12px" }, children: `Erro: ${erro}` });
    if (!itens || itens.length === 0) return h("div", { style: { padding: "12px 0", color: "#6b7280", fontSize: "12px" }, children: "Nenhum item encontrado para esta nota." });

    const th = { padding: "6px 10px", textAlign: "left", fontWeight: 700, fontSize: "11px", color: "#374151", whiteSpace: "nowrap", borderBottom: "2px solid #d1d5db", background: "#e8f0fe" };
    const td = { padding: "5px 10px", verticalAlign: "middle", fontSize: "12px", borderBottom: "1px solid #f3f4f6" };
    const tdR = { ...td, textAlign: "right" };

    return h("div", { style: { overflowX: "auto" }, children:
        hs("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "12px" }, children: [
            h("thead", { key: "th", children: h("tr", { children: [
                h("th", { key: "cp", style: th, children: "Cód." }),
                h("th", { key: "dc", style: { ...th, minWidth: "180px" }, children: "Descrição" }),
                h("th", { key: "un", style: th, children: "Unid." }),
                h("th", { key: "em", style: th, children: "Embalagem" }),
                h("th", { key: "qt", style: { ...th, textAlign: "right" }, children: "Qtde" }),
                h("th", { key: "pu", style: { ...th, textAlign: "right" }, children: "P. Unit." }),
                h("th", { key: "pb", style: { ...th, textAlign: "right" }, children: "P. Bruto" }),
                h("th", { key: "pl", style: { ...th, textAlign: "right" }, children: "P. Líquido" }),
                h("th", { key: "st", style: { ...th, textAlign: "right" }, children: "ICMS-ST" }),
                h("th", { key: "cr", style: { ...th, textAlign: "right" }, children: "Créd. ICMS" }),
                h("th", { key: "ip", style: { ...th, textAlign: "right" }, children: "IPI" }),
                h("th", { key: "nr", style: th, children: "NBM" }),
                h("th", { key: "cf", style: th, children: "Cód. Fiscal" }),
                h("th", { key: "sb", style: th, children: "SitTribut" }),
                h("th", { key: "dp", style: th, children: "Depto" }),
                h("th", { key: "sc", style: th, children: "Seção" }),
            ]}) }),
            h("tbody", { key: "tb", children: itens.map((item, i) =>
                hs("tr", { key: i, style: { background: i % 2 === 0 ? "#fff" : "#f9fafb" }, children: [
                    h("td", { key: "cp", style: { ...td, fontFamily: "monospace", whiteSpace: "nowrap" }, children: String(item.CODPROD || "—") }),
                    h("td", { key: "dc", style: { ...td, maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: item.DESCRICAO || "", children: item.DESCRICAO || "—" }),
                    h("td", { key: "un", style: { ...td, whiteSpace: "nowrap" }, children: item.UNIDADE || "—" }),
                    h("td", { key: "em", style: { ...td, whiteSpace: "nowrap" }, children: item.EMBALAGEM || "—" }),
                    h("td", { key: "qt", style: { ...tdR, whiteSpace: "nowrap" }, children: Number(item.QT || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) }),
                    h("td", { key: "pu", style: { ...tdR, whiteSpace: "nowrap" }, children: fmt(item.PUNIT) }),
                    h("td", { key: "pb", style: { ...tdR, whiteSpace: "nowrap" }, children: fmt(item.PBRUTO) }),
                    h("td", { key: "pl", style: { ...tdR, whiteSpace: "nowrap" }, children: fmt(item.PLIQUIDO) }),
                    h("td", { key: "st", style: { ...tdR, whiteSpace: "nowrap" }, children: fmt(item.ST) }),
                    h("td", { key: "cr", style: { ...tdR, whiteSpace: "nowrap" }, children: fmt(item.VLCREDICMS) }),
                    h("td", { key: "ip", style: { ...tdR, whiteSpace: "nowrap" }, children: fmt(item.VLIPI) }),
                    h("td", { key: "nr", style: { ...td, whiteSpace: "nowrap" }, children: item.NBM || "—" }),
                    h("td", { key: "cf", style: { ...td, whiteSpace: "nowrap" }, children: String(item.CODFISCALITEM || "—") }),
                    h("td", { key: "sb", style: { ...td, whiteSpace: "nowrap" }, children: item.SITTRIBUT || "—" }),
                    h("td", { key: "dp", style: { ...td, whiteSpace: "nowrap" }, children: item.DEPTO || "—" }),
                    h("td", { key: "sc", style: { ...td, whiteSpace: "nowrap" }, children: item.SECAO || "—" }),
                ]})
            ) }),
        ]})
    });
}

function xmlBadge(v) {
    if (String(v || "N").trim() === "S")
        return h("span", { style: { background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: "9999px", fontSize: "10px", fontWeight: 700 }, children: "XML" });
    return h("span", { style: { background: "#f3f4f6", color: "#9ca3af", padding: "2px 6px", borderRadius: "9999px", fontSize: "10px" }, children: "—" });
}

// Linha expandida — apenas itens da nota
function LinhaExpandida({ nota, colSpan }) {
    const dtEnt = nota.DTENT ? String(nota.DTENT).slice(0, 10) : "";
    return h("tr", { children:
        h("td", { colSpan, style: { padding: 0, background: "#f0f7ff", borderBottom: "2px solid #3b82f6", borderTop: "none" }, children:
            hs("div", { style: { padding: "12px 16px 16px 40px" }, children: [
                h("div", { key: "itens-hdr", style: { fontSize: "11px", fontWeight: 700, color: "#1d4ed8", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.04em" }, children: "Itens da Nota" }),
                h(PainelItens, { key: "pi", numTransEnt: nota.NUMTRANSENT, codfilial: nota.CODFILIAL, dtEnt }),
            ]})
        })
    });
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function MonitoramentoNotasEntradaPage() {
    const hoje = new Date();
    const seteAtras = new Date(hoje);
    seteAtras.setDate(seteAtras.getDate() - 7);
    const toInputDate = (d) => d.toISOString().slice(0, 10);

    const [filtros, setFiltros] = React.useState({
        codfilial: "", dtInicio: toInputDate(seteAtras), dtFim: toInputDate(hoje),
        numNota: "", numTransEnt: "", codFornec: "", fornecedor: "",
        serie: "", especie: "", tipoDescarga: "",
    });
    const [notas, setNotas] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [erro, setErro] = React.useState(null);
    const [page, setPage] = React.useState(1);
    const pageSize = 50;
    const [buscaFeita, setBuscaFeita] = React.useState(false);
    const [expandedKey, setExpandedKey] = React.useState(null);

    function setF(k, v) { setFiltros(prev => ({ ...prev, [k]: v })); }

    function limpar() {
        setFiltros({ codfilial: "", dtInicio: toInputDate(seteAtras), dtFim: toInputDate(hoje), numNota: "", numTransEnt: "", codFornec: "", fornecedor: "", serie: "", especie: "", tipoDescarga: "" });
        setNotas([]); setErro(null); setBuscaFeita(false); setPage(1); setExpandedKey(null);
    }

    async function buscar(pg) {
        const p = pg ?? page;
        if (!filtros.codfilial.trim()) { setErro("Filial é obrigatória para a consulta."); return; }
        if (!filtros.dtInicio || !filtros.dtFim) { setErro("Período de entrada é obrigatório."); return; }
        setLoading(true); setErro(null); setBuscaFeita(true); setExpandedKey(null);
        try {
            const params = { codfilial: filtros.codfilial, dtInicio: filtros.dtInicio, dtFim: filtros.dtFim, page: p, pageSize };
            if (filtros.numNota) params.numNota = filtros.numNota;
            if (filtros.numTransEnt) params.numTransEnt = filtros.numTransEnt;
            if (filtros.codFornec) params.codFornec = filtros.codFornec;
            if (filtros.fornecedor) params.fornecedor = filtros.fornecedor;
            if (filtros.serie) params.serie = filtros.serie;
            if (filtros.especie) params.especie = filtros.especie;
            if (filtros.tipoDescarga) params.tipoDescarga = filtros.tipoDescarga;
            const r = await apiFetch(`/api/monitoramento/notas-entrada${bq(params)}`);
            setNotas(r.data || []);
            setPage(p);
        } catch (e) {
            setErro(e.message);
        } finally {
            setLoading(false);
        }
    }

    function toggleRow(key) {
        setExpandedKey(prev => prev === key ? null : key);
    }

    const kpiTotal = notas.length;
    const kpiValor = notas.reduce((s, n) => s + Number(n.VLTOTAL || 0), 0);
    const kpiItens = notas.reduce((s, n) => s + Number(n.TOTALITENS || 0), 0);
    const kpiXml = notas.filter(n => String(n.IMPORTADOXML || "N").trim() === "S").length;

    const lblStyle = { fontSize: "11px", color: "#6b7280", fontWeight: 600, marginBottom: "3px" };
    // toggle + NºNota + Trans + Filial + Fornecedor + Série + Espécie + DtEnt + DtEmissão + ValorTotal + Tp.Desc + Rotina + Func.Lanç. + XML
    const COLS = 14;
    const thStyle = { padding: "10px 10px", textAlign: "left", fontWeight: 700, fontSize: "11px", color: "#374151", whiteSpace: "nowrap", background: "#f9fafb", borderBottom: "2px solid #e5e7eb" };

    return hs("div", { className: "space-y-6 animate-fade-in", children: [

        // Cabeçalho
        hs("div", { key: "hdr", children: [
            h("h1", { key: "t", className: "text-2xl font-bold text-foreground", children: "Notas de Entrada" }),
            h("p", { key: "s", className: "text-sm text-muted-foreground mt-1", children: "Clique em uma linha para expandir os itens da nota." }),
        ]}),

        // KPIs
        hs("div", { key: "kpis", style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }, children: [
            h(KpiCard, { key: "k1", label: "Total de Notas", value: kpiTotal.toLocaleString("pt-BR"), color: "#2563eb" }),
            h(KpiCard, { key: "k2", label: "Valor Total", value: fmt(kpiValor), color: "#16a34a" }),
            h(KpiCard, { key: "k3", label: "Total de Itens", value: kpiItens.toLocaleString("pt-BR"), color: "#7c3aed" }),
            h(KpiCard, { key: "k4", label: "Importadas por XML", value: kpiXml.toLocaleString("pt-BR"), color: "#d97706" }),
        ]}),

        // Filtros
        h(Card, { key: "filtros", children: h(CardContent, { style: { padding: "16px" }, children:
            hs("div", { children: [
                h("p", { key: "tit", style: { fontSize: "12px", fontWeight: 700, color: "#374151", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.04em" }, children: "Filtros" }),
                hs("div", { key: "r1", style: { display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "10px", alignItems: "flex-end" }, children: [
                    hs("div", { key: "f1", style: { display: "flex", flexDirection: "column", gap: "3px" }, children: [
                        h("label", { key: "l", style: lblStyle, children: "Filial *" }),
                        h(Input, { style: { width: "100px" }, placeholder: "Cód. Filial", value: filtros.codfilial, onChange: e => setF("codfilial", e.target.value.toUpperCase()), onKeyDown: e => e.key === "Enter" && buscar(1) }),
                    ]}),
                    hs("div", { key: "f2", style: { display: "flex", flexDirection: "column", gap: "3px" }, children: [
                        h("label", { key: "l", style: lblStyle, children: "Entrada Inicial *" }),
                        h(Input, { type: "date", style: { width: "145px" }, value: filtros.dtInicio, onChange: e => setF("dtInicio", e.target.value) }),
                    ]}),
                    hs("div", { key: "f3", style: { display: "flex", flexDirection: "column", gap: "3px" }, children: [
                        h("label", { key: "l", style: lblStyle, children: "Entrada Final *" }),
                        h(Input, { type: "date", style: { width: "145px" }, value: filtros.dtFim, onChange: e => setF("dtFim", e.target.value) }),
                    ]}),
                    hs("div", { key: "f4", style: { display: "flex", flexDirection: "column", gap: "3px" }, children: [
                        h("label", { key: "l", style: lblStyle, children: "Nº Nota" }),
                        h(Input, { style: { width: "100px" }, placeholder: "Nº Nota", value: filtros.numNota, onChange: e => setF("numNota", e.target.value) }),
                    ]}),
                    hs("div", { key: "f5", style: { display: "flex", flexDirection: "column", gap: "3px" }, children: [
                        h("label", { key: "l", style: lblStyle, children: "Nº Transação" }),
                        h(Input, { style: { width: "120px" }, placeholder: "NUMTRANSENT", value: filtros.numTransEnt, onChange: e => setF("numTransEnt", e.target.value) }),
                    ]}),
                    hs("div", { key: "f6", style: { display: "flex", flexDirection: "column", gap: "3px" }, children: [
                        h("label", { key: "l", style: lblStyle, children: "Cód. Fornecedor" }),
                        h(Input, { style: { width: "100px" }, placeholder: "Cód.", value: filtros.codFornec, onChange: e => setF("codFornec", e.target.value) }),
                    ]}),
                    hs("div", { key: "f7", style: { display: "flex", flexDirection: "column", gap: "3px" }, children: [
                        h("label", { key: "l", style: lblStyle, children: "Fornecedor" }),
                        h(Input, { style: { width: "200px" }, placeholder: "Nome do fornecedor", value: filtros.fornecedor, onChange: e => setF("fornecedor", e.target.value) }),
                    ]}),
                ]}),
                hs("div", { key: "r2", style: { display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "14px", alignItems: "flex-end" }, children: [
                    hs("div", { key: "f8", style: { display: "flex", flexDirection: "column", gap: "3px" }, children: [
                        h("label", { key: "l", style: lblStyle, children: "Série" }),
                        h(Input, { style: { width: "80px" }, placeholder: "Série", value: filtros.serie, onChange: e => setF("serie", e.target.value) }),
                    ]}),
                    hs("div", { key: "f9", style: { display: "flex", flexDirection: "column", gap: "3px" }, children: [
                        h("label", { key: "l", style: lblStyle, children: "Espécie" }),
                        h(Input, { style: { width: "80px" }, placeholder: "Espécie", value: filtros.especie, onChange: e => setF("especie", e.target.value) }),
                    ]}),
                    hs("div", { key: "f10", style: { display: "flex", flexDirection: "column", gap: "3px" }, children: [
                        h("label", { key: "l", style: lblStyle, children: "Tipo Descarga" }),
                        h(Input, { style: { width: "100px" }, placeholder: "Tipo", value: filtros.tipoDescarga, onChange: e => setF("tipoDescarga", e.target.value) }),
                    ]}),
                    hs("div", { key: "btns", style: { display: "flex", gap: "8px" }, children: [
                        h(Button, { key: "btn-filtrar", onClick: () => buscar(1), disabled: loading, children: loading ? "Buscando..." : "Filtrar" }),
                        h(Button, { key: "btn-limpar", variant: "outline", onClick: limpar, children: "Limpar" }),
                    ]}),
                ]}),
                erro ? h("p", { key: "erro", style: { color: "#dc2626", fontSize: "13px" }, children: erro }) : null,
            ]})
        }) }),

        // Tabela principal
        h(Card, { key: "tabela", children: h(CardContent, { style: { padding: 0 }, children:
            !buscaFeita
            ? h("div", { style: { padding: "48px", textAlign: "center", color: "#9ca3af" }, children: h("p", { children: "Informe a filial e o período e clique em Filtrar." }) })
            : loading
            ? h("div", { style: { padding: "48px", textAlign: "center", color: "#9ca3af" }, children: h("p", { children: "Buscando..." }) })
            : notas.length === 0
            ? h("div", { style: { padding: "48px", textAlign: "center", color: "#9ca3af" }, children: h("p", { children: "Nenhuma nota encontrada para os filtros informados." }) })
            : hs("div", { children: [
                // Paginação
                hs("div", { key: "pg", style: { padding: "10px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
                    h("span", { key: "cnt", style: { fontSize: "13px", color: "#374151" }, children: `${notas.length} registros — Página ${page}` }),
                    hs("div", { key: "btns", style: { display: "flex", gap: "8px" }, children: [
                        h(Button, { key: "prev", size: "sm", variant: "outline", onClick: () => buscar(page - 1), disabled: page <= 1, children: "← Anterior" }),
                        h(Button, { key: "next", size: "sm", variant: "outline", onClick: () => buscar(page + 1), disabled: notas.length < pageSize, children: "Próxima →" }),
                    ]}),
                ]}),
                h("div", { key: "scroll", style: { overflowX: "auto" }, children:
                    hs("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "12px" }, children: [
                        h("thead", { key: "th", children:
                            h("tr", { children: [
                                h("th", { key: "tog", style: { ...thStyle, width: "28px", padding: "10px 6px" }, children: "" }),
                                h("th", { key: "nt", style: thStyle, children: "Nº Nota" }),
                                h("th", { key: "te", style: thStyle, children: "Transação" }),
                                h("th", { key: "fl", style: thStyle, children: "Filial" }),
                                h("th", { key: "fn", style: { ...thStyle, minWidth: "180px" }, children: "Fornecedor" }),
                                h("th", { key: "sr", style: thStyle, children: "Série" }),
                                h("th", { key: "es", style: thStyle, children: "Espécie" }),
                                h("th", { key: "de", style: thStyle, children: "Dt. Entrada" }),
                                h("th", { key: "dm", style: thStyle, children: "Dt. Emissão" }),
                                h("th", { key: "vt", style: { ...thStyle, textAlign: "right" }, children: "Valor Total" }),
                                h("th", { key: "td", style: thStyle, children: "Tp. Desc." }),
                                h("th", { key: "rl", style: thStyle, children: "Rotina" }),
                                h("th", { key: "fc", style: { ...thStyle, minWidth: "140px" }, children: "Func. Lançamento" }),
                                h("th", { key: "xl", style: { ...thStyle, textAlign: "center" }, children: "XML" }),
                            ]})
                        }),
                        h("tbody", { key: "tb", children:
                            notas.flatMap((nota, i) => {
                                const key = nota.NUMTRANSENT || i;
                                const isOpen = expandedKey === key;
                                const tdCell = { padding: "9px 10px", verticalAlign: "middle", whiteSpace: "nowrap" };
                                const rowBg = isOpen ? "#e0f0ff" : (i % 2 === 0 ? "#fff" : "#fafafa");

                                const mainRow = hs("tr", {
                                    key: `r-${key}`,
                                    onClick: () => toggleRow(key),
                                    style: { borderBottom: isOpen ? "none" : "1px solid #f0f0f0", background: rowBg, cursor: "pointer", transition: "background 0.12s" },
                                    children: [
                                        h("td", { key: "tog", style: { ...tdCell, padding: "9px 6px", textAlign: "center", color: isOpen ? "#2563eb" : "#9ca3af", fontSize: "11px", fontWeight: 700 }, children: isOpen ? "▼" : "▶" }),
                                        h("td", { key: "nt", style: { ...tdCell, fontFamily: "monospace" }, children: String(nota.NUMNOTA || "—") }),
                                        h("td", { key: "te", style: { ...tdCell, fontFamily: "monospace" }, children: String(nota.NUMTRANSENT || "—") }),
                                        h("td", { key: "fl", style: tdCell, children: String(nota.CODFILIAL || "—") }),
                                        h("td", { key: "fn", style: { ...tdCell, maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: nota.FORNECEDOR || "", children: nota.FORNECEDOR || "—" }),
                                        h("td", { key: "sr", style: tdCell, children: nota.SERIE || "—" }),
                                        h("td", { key: "es", style: tdCell, children: nota.ESPECIE || "—" }),
                                        h("td", { key: "de", style: tdCell, children: fmtDate(nota.DTENT) }),
                                        h("td", { key: "dm", style: tdCell, children: fmtDate(nota.DTEMISSAO) }),
                                        h("td", { key: "vt", style: { ...tdCell, textAlign: "right" }, children: fmt(nota.VLTOTAL) }),
                                        h("td", { key: "td2", style: tdCell, children: nota.TIPODESCARGA || "—" }),
                                        h("td", { key: "rl2", style: { ...tdCell, maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis" }, title: nota.ROTINALANC || "", children: nota.ROTINALANC || "—" }),
                                        h("td", { key: "fc2", style: { ...tdCell, maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis" }, title: nota.FUNCIONARIOLANC || "", children: nota.FUNCIONARIOLANC || "—" }),
                                        h("td", { key: "xl", style: { ...tdCell, textAlign: "center" }, children: xmlBadge(nota.IMPORTADOXML) }),
                                    ]
                                });

                                return isOpen
                                    ? [mainRow, h(LinhaExpandida, { key: `e-${key}`, nota, colSpan: COLS })]
                                    : [mainRow];
                            })
                        }),
                    ]})
                }),
            ]})
        }) }),
    ]});
}
