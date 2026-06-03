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
function fmtDate(v) { if (!v) return "-"; const d = new Date(`${String(v).slice(0, 10)}T00:00:00`); return isNaN(d) ? String(v) : d.toLocaleDateString("pt-BR"); }
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

const RC = { CRITICO: ["#fee2e2","#991b1b"], ALTO: ["#fef3c7","#92400e"], ATENCAO: ["#dbeafe","#1e40af"], BAIXO: ["#dcfce7","#166534"] };
function rBadge(r) { const [bg,fg] = RC[r] || ["#f3f4f6","#374151"]; return h("span",{style:{background:bg,color:fg,padding:"2px 8px",borderRadius:"9999px",fontSize:"11px",fontWeight:700},children:r||"—"}); }
const SC = { AUTORIZADA:["#dcfce7","#166534"], CANCELADA:["#fee2e2","#991b1b"], DENEGADA:["#fef3c7","#92400e"], PENDENTE:["#e0e7ff","#3730a3"] };
function sBadge(s) { const [bg,fg] = SC[String(s||"").toUpperCase()] || ["#f3f4f6","#374151"]; return h("span",{style:{background:bg,color:fg,padding:"2px 8px",borderRadius:"9999px",fontSize:"11px",fontWeight:700},children:s||"—"}); }
function scoreColor(n) { if (n>=76) return "#dc2626"; if (n>=51) return "#d97706"; if (n>=26) return "#2563eb"; return "#16a34a"; }

function KpiCard({ label, value, color }) {
    return h(Card, { children: h(CardContent, { style: { padding: "14px 18px" }, children: hs("div", { children: [
        h("p", { key:"l", style: { fontSize:"11px", color:"#6b7280", marginBottom:"4px", textTransform:"uppercase", letterSpacing:"0.05em" }, children: label }),
        h("p", { key:"v", style: { fontSize:"24px", fontWeight:700, color:color||"inherit", lineHeight:1 }, children: value ?? "—" }),
    ]}) }) });
}

function Campo({ label, value, mono }) {
    return hs("div", { style: { marginBottom: "10px" }, children: [
        h("p", { key:"l", style: { fontSize:"10px", color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.06em", fontWeight:600, marginBottom:"2px" }, children: label }),
        h("p", { key:"v", style: { fontSize:"13px", color:"#111827", fontFamily:mono?"monospace":undefined, wordBreak:"break-all" }, children: value || "—" }),
    ]});
}

function Secao({ titulo, cor, open: initOpen = false, children }) {
    const [open, setOpen] = React.useState(initOpen);
    return hs("div", { style: { border:"1px solid #e5e7eb", borderRadius:"8px", marginBottom:"12px", overflow:"hidden" }, children: [
        h("button", { key:"btn", onClick: () => setOpen(!open), style: { width:"100%", textAlign:"left", padding:"12px 16px", background:cor||"#f9fafb", border:"none", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center", fontWeight:700, fontSize:"13px" }, children: [
            h("span", { key:"t", children: titulo }),
            h("span", { key:"ic", style: { fontSize:"16px", color:"#9ca3af" }, children: open ? "▲" : "▼" }),
        ]}),
        open ? h("div", { key:"body", style: { padding:"16px" }, children: children }) : null,
    ]});
}

function fmt2(v) { const n = Number(v ?? 0); return Number.isFinite(n) ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0,00"; }

// ── PAINEL LATERAL CT-e ──
function PainelCTe({ chave, onClose }) {
    const [doc, setDoc] = React.useState(null);
    const [nfes, setNfes] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState(null);
    const [expandidas, setExpandidas] = React.useState({});
    const [itensMap, setItensMap] = React.useState({});
    const [loadingItens, setLoadingItens] = React.useState({});

    React.useEffect(() => {
        if (!chave) return;
        setLoading(true); setErro(null); setDoc(null); setNfes([]); setExpandidas({}); setItensMap({});
        apiFetch(`/api/fiscal/documentos/${encodeURIComponent(chave)}`)
            .then(d => {
                setDoc(d);
                return apiFetch(`/api/fiscal/cte/${encodeURIComponent(chave)}/nfes-vinculadas`);
            })
            .then(ns => {
                const lista = Array.isArray(ns) ? ns : [];
                setNfes(lista);
                // Pre-popula itens que já vieram na resposta da rota nfes-vinculadas
                const preItens = {};
                for (const nfe of lista) {
                    if (nfe.itens && nfe.itens.length > 0) preItens[nfe.chaveAcesso] = nfe.itens;
                }
                if (Object.keys(preItens).length > 0) setItensMap(preItens);
            })
            .catch(e => setErro(e.message))
            .finally(() => setLoading(false));
    }, [chave]);

    const toggleItens = async (nfeCh) => {
        const jaExpandido = expandidas[nfeCh];
        setExpandidas(p => ({ ...p, [nfeCh]: !jaExpandido }));
        if (!jaExpandido && !itensMap[nfeCh]) {
            setLoadingItens(p => ({ ...p, [nfeCh]: true }));
            try {
                const r = await apiFetch(`/api/fiscal/nfe/${encodeURIComponent(nfeCh)}/itens`);
                setItensMap(p => ({ ...p, [nfeCh]: r.itens || [] }));
            } catch { setItensMap(p => ({ ...p, [nfeCh]: [] })); }
            finally { setLoadingItens(p => ({ ...p, [nfeCh]: false })); }
        }
    };

    const emit = doc?.emitente || {};
    const dest = doc?.destinatario || {};
    const score = doc?.scoreRisco ?? 0;
    const chaveVinc = doc?.nfesVinculadas || [];

    return h("div", { style: { position:"fixed", inset:0, zIndex:1000, display:"flex" }, children: [
        h("div", { key:"ov", onClick: onClose, style: { flex:1, background:"rgba(0,0,0,.45)" } }),
        hs("div", { key:"dw", style: { width:"min(820px,100vw)", background:"#fff", height:"100%", overflowY:"auto", boxShadow:"-4px 0 24px rgba(0,0,0,.15)", display:"flex", flexDirection:"column" }, children: [
            hs("div", { key:"hdr", style: { padding:"18px 24px", borderBottom:"1px solid #e5e7eb", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, background:"#fff", zIndex:10 }, children: [
                hs("div", { key:"info", children: [
                    h("p", { key:"s", style: { fontSize:"11px", color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:"2px" }, children: "Detalhes CT-e" }),
                    h("p", { key:"c", style: { fontSize:"11px", fontFamily:"monospace", color:"#374151", wordBreak:"break-all" }, children: chave }),
                ]}),
                h("button", { key:"cls", onClick: onClose, style: { border:"none", background:"none", fontSize:"24px", cursor:"pointer", color:"#9ca3af", lineHeight:1 }, children: "×" }),
            ]}),
            h("div", { key:"body", style: { padding:"20px 24px", flex:1 }, children:
                loading ? h("p", { style:{ color:"#9ca3af", padding:"24px 0" }, children:"Carregando..." })
                : erro ? h("p", { style:{ color:"#dc2626", padding:"12px 0" }, children:`Erro: ${erro}` })
                : hs("div", { children: [
                    hs("div", { key:"badges", style:{ display:"flex", gap:"8px", flexWrap:"wrap", marginBottom:"16px" }, children: [
                        sBadge(doc.statusSefaz),
                        rBadge(doc.classificacaoRisco),
                        doc.origem ? h("span",{key:"or",style:{background:"#f3f4f6",color:"#6b7280",padding:"2px 8px",borderRadius:"9999px",fontSize:"11px"},children:doc.origem}) : null,
                    ]}),

                    // RESUMO
                    h(Secao, { key:"res", titulo:"Resumo do CT-e", cor:"#fefce8", open:true, children:
                        hs("div", { children: [
                            hs("div", { key:"g1", style:{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 24px" }, children: [
                                h(Campo, { key:"ch", label:"Chave de Acesso", value:chave, mono:true }),
                                h(Campo, { key:"ns", label:"Número / Série / Modelo", value:`${doc.numero||"—"} / ${doc.serie||"—"} / ${doc.modelo||"57"}` }),
                                h(Campo, { key:"em", label:"Data de Emissão", value:fmtDate(doc.dhEmissao||doc.dataEmissao) }),
                                h(Campo, { key:"en", label:"Data de Entrada", value:fmtDate(doc.dataEntrada) }),
                                h(Campo, { key:"vf", label:"Valor do Frete", value:fmt(doc.valorTotal) }),
                                h(Campo, { key:"pr", label:"Protocolo SEFAZ", value:doc.protocoloAutorizacao }),
                            ]}),
                            h("hr", { key:"hr1", style:{ border:"none", borderTop:"1px solid #e5e7eb", margin:"8px 0 12px" } }),
                            h("p", { key:"ttr", style:{ fontSize:"11px", fontWeight:700, color:"#374151", marginBottom:"8px", textTransform:"uppercase" }, children:"Transportadora (Emitente)" }),
                            hs("div", { key:"g2", style:{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 24px" }, children: [
                                h(Campo, { key:"nm", label:"Nome / Razão Social", value:emit.nome||emit.xNome }),
                                h(Campo, { key:"cn", label:"CNPJ", value:emit.cnpj, mono:true }),
                                emit.uf ? h(Campo, { key:"uf", label:"UF / Município", value:`${emit.uf}${emit.xMun?" — "+emit.xMun:""}` }) : null,
                            ]}),
                            h("hr", { key:"hr2", style:{ border:"none", borderTop:"1px solid #e5e7eb", margin:"8px 0 12px" } }),
                            h("p", { key:"ttom", style:{ fontSize:"11px", fontWeight:700, color:"#374151", marginBottom:"8px", textTransform:"uppercase" }, children:"Tomador (Destinatário)" }),
                            hs("div", { key:"g3", style:{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 24px" }, children: [
                                h(Campo, { key:"dc", label:"CNPJ Tomador", value:dest.cnpj, mono:true }),
                                h(Campo, { key:"df", label:"Cód. Filial", value:dest.filialCodigo }),
                            ]}),
                            doc.scoreRisco != null ? hs("div", { key:"score", style:{ background:"#f9fafb", borderRadius:"8px", padding:"12px", marginTop:"8px" }, children: [
                                h("p", { key:"sl", style:{ fontSize:"11px", color:"#6b7280", marginBottom:"4px", textTransform:"uppercase", fontWeight:600 }, children:"Score de Risco" }),
                                hs("div", { key:"sr", style:{ display:"flex", alignItems:"center", gap:"12px" }, children: [
                                    h("p", { key:"sv", style:{ fontSize:"28px", fontWeight:800, color:scoreColor(score), margin:0 }, children:String(score) }),
                                    rBadge(doc.classificacaoRisco),
                                ]}),
                            ]}) : null,
                        ]})
                    }),

                    // NF-es VINCULADAS
                    h(Secao, { key:"nfes", titulo:`NF-es Vinculadas ao CT-e (${nfes.length > 0 ? nfes.length : chaveVinc.length || 0})`, cor:"#eff6ff", open:true, children:
                        nfes.length === 0 && chaveVinc.length === 0
                            ? h("p", { style:{ color:"#d97706", fontSize:"13px", fontWeight:600 }, children:"Nenhuma NF-e vinculada encontrada neste CT-e." })
                            : nfes.length > 0
                                ? h("div", { style:{ overflowX:"auto" }, children:
                                    hs("table", { style:{ width:"100%", borderCollapse:"collapse", fontSize:"12px" }, children: [
                                        h("thead", { key:"th", children:
                                            h("tr", { style:{ background:"#dbeafe", borderBottom:"1px solid #bfdbfe" }, children:
                                                ["","Chave NF-e","Nº / Série","Emitente","CNPJ Emit.","Emissão","Valor Total","Status","Manifest."].map(c =>
                                                    h("th", { key:c, style:{ padding:"7px 10px", textAlign: c==="Valor Total"?"right":"left", fontWeight:700, whiteSpace:"nowrap", fontSize:"11px" }, children:c })
                                                )
                                            })
                                        }),
                                        h("tbody", { key:"tb", children:
                                            nfes.flatMap((nfe, i) => {
                                                const nfeCh = nfe.chaveAcesso || nfe.chave || "";
                                                const emNome = nfe.emitente?.nome || nfe.nomeEmitente || "—";
                                                const emCnpj = nfe.emitente?.cnpj || nfe.cnpjEmitente || "—";
                                                const expandido = expandidas[nfeCh];
                                                const itens = itensMap[nfeCh] || nfe.itens || [];
                                                const carregando = loadingItens[nfeCh];
                                                const bgRow = i % 2 ? "#f8faff" : "#fff";
                                                const rows = [
                                                    h("tr", { key:nfeCh||i, style:{ borderBottom: expandido ? "none" : "1px solid #f3f4f6", background:bgRow, verticalAlign:"middle", cursor:"pointer" }, onClick:()=>toggleItens(nfeCh), children: [
                                                        h("td", { key:"exp", style:{ padding:"7px 6px", textAlign:"center", color:"#6366f1", fontWeight:700, fontSize:"14px", width:24 }, children: expandido ? "▼" : "▶" }),
                                                        h("td", { key:"ch", style:{ padding:"7px 10px", fontFamily:"monospace", fontSize:"11px" }, children: nfeCh ? `${nfeCh.slice(0,10)}…${nfeCh.slice(-6)}` : "—" }),
                                                        h("td", { key:"nn", style:{ padding:"7px 10px", fontFamily:"monospace" }, children:`${nfe.numero||"—"}/${nfe.serie||"—"}` }),
                                                        h("td", { key:"em", style:{ padding:"7px 10px", maxWidth:"140px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }, children: emNome }),
                                                        h("td", { key:"cn", style:{ padding:"7px 10px", fontFamily:"monospace", fontSize:"11px" }, children: emCnpj }),
                                                        h("td", { key:"dt", style:{ padding:"7px 10px", whiteSpace:"nowrap" }, children: fmtDate(nfe.dhEmissao||nfe.dataEmissao) }),
                                                        h("td", { key:"vl", style:{ padding:"7px 10px", textAlign:"right", fontWeight:600 }, children: fmt(nfe.valorTotal??nfe.valor) }),
                                                        h("td", { key:"ss", style:{ padding:"7px 10px" }, children: sBadge(nfe.statusSefaz||nfe.status) }),
                                                        h("td", { key:"mf", style:{ padding:"7px 10px", fontSize:"11px" }, children: nfe.statusManifestacao||"—" }),
                                                    ]}),
                                                ];
                                                if (expandido) {
                                                    rows.push(h("tr", { key:`itens-${nfeCh}`, style:{ background:"#f0f4ff", borderBottom:"2px solid #c7d7fe" }, children:
                                                        h("td", { colSpan:9, style:{ padding:"0 0 0 32px" }, children:
                                                            carregando
                                                                ? h("p", { style:{ padding:"10px 0", color:"#6b7280", fontSize:"12px" }, children:"Carregando produtos..." })
                                                                : itens.length === 0
                                                                    ? h("p", { style:{ padding:"10px 0", color:"#9ca3af", fontSize:"12px" }, children:"Nenhum produto encontrado para esta NF-e." })
                                                                    : hs("table", { style:{ width:"100%", borderCollapse:"collapse", fontSize:"11px", marginBottom:8 }, children: [
                                                                        h("thead", { key:"ih", children:
                                                                            h("tr", { style:{ background:"#c7d7fe", borderBottom:"1px solid #a5b4fc" }, children:
                                                                                ["Cód.","Descrição do Produto","Qtd","Un","Vl Unit.","Vl Total","NCM","CFOP","CST","Aliq ICMS","ICMS","IPI","PIS","COFINS"].map(c =>
                                                                                    h("th", { key:c, style:{ padding:"5px 8px", textAlign:["Qtd","Vl Unit.","Vl Total","Aliq ICMS","ICMS","IPI","PIS","COFINS"].includes(c)?"right":"left", fontWeight:700, whiteSpace:"nowrap", color:"#1e3a8a" }, children:c })
                                                                                )
                                                                            })
                                                                        }),
                                                                        h("tbody", { key:"ib", children:
                                                                            itens.map((it, j) =>
                                                                                h("tr", { key:j, style:{ borderBottom:"1px solid #dbeafe", background:j%2?"#eff6ff":"#fff" }, children: [
                                                                                    h("td", { key:"cp", style:{ padding:"4px 8px", fontFamily:"monospace", fontWeight:700, color:"#1d4ed8" }, children:it.codprod }),
                                                                                    h("td", { key:"dc", style:{ padding:"4px 8px", maxWidth:"220px" }, children:it.descricao }),
                                                                                    h("td", { key:"qt", style:{ padding:"4px 8px", textAlign:"right" }, children:fmt2(it.quantidade) }),
                                                                                    h("td", { key:"un", style:{ padding:"4px 8px" }, children:it.unidade||"—" }),
                                                                                    h("td", { key:"vu", style:{ padding:"4px 8px", textAlign:"right" }, children:fmt2(it.vlUnit) }),
                                                                                    h("td", { key:"vt", style:{ padding:"4px 8px", textAlign:"right", fontWeight:600 }, children:fmt(it.vlTotal) }),
                                                                                    h("td", { key:"nc", style:{ padding:"4px 8px", fontFamily:"monospace", fontSize:"10px" }, children:it.ncm||"—" }),
                                                                                    h("td", { key:"cf", style:{ padding:"4px 8px", fontFamily:"monospace" }, children:it.cfop||"—" }),
                                                                                    h("td", { key:"cs", style:{ padding:"4px 8px", fontFamily:"monospace" }, children:it.cstIcms||"—" }),
                                                                                    h("td", { key:"ai", style:{ padding:"4px 8px", textAlign:"right" }, children:it.aliqIcms?`${it.aliqIcms}%`:"—" }),
                                                                                    h("td", { key:"ic", style:{ padding:"4px 8px", textAlign:"right" }, children:fmt2(it.vlIcms) }),
                                                                                    h("td", { key:"ip", style:{ padding:"4px 8px", textAlign:"right" }, children:fmt2(it.vlIpi) }),
                                                                                    h("td", { key:"ps", style:{ padding:"4px 8px", textAlign:"right" }, children:fmt2(it.vlPis) }),
                                                                                    h("td", { key:"co", style:{ padding:"4px 8px", textAlign:"right" }, children:fmt2(it.vlCofins) }),
                                                                                ]})
                                                                            )
                                                                        }),
                                                                        h("tfoot", { key:"if", children:
                                                                            h("tr", { style:{ background:"#dbeafe", fontWeight:700, borderTop:"2px solid #93c5fd" }, children: [
                                                                                h("td", { key:"a", colSpan:5, style:{ padding:"5px 8px", textAlign:"right", color:"#1e40af" }, children:`${itens.length} produto(s)` }),
                                                                                h("td", { key:"b", style:{ padding:"5px 8px", textAlign:"right", color:"#1e40af" }, children: fmt(itens.reduce((s,it)=>s+Number(it.vlTotal??0),0)) }),
                                                                                h("td", { key:"c", colSpan:8 }),
                                                                            ]})
                                                                        }),
                                                                    ]})
                                                        })
                                                    }));
                                                }
                                                return rows;
                                            })
                                        }),
                                        h("tfoot", { key:"tf", children:
                                            h("tr", { style:{ background:"#dbeafe", borderTop:"2px solid #93c5fd", fontWeight:700 }, children: [
                                                    h("td", { key:"a", colSpan:6, style:{ padding:"8px 10px", textAlign:"right" }, children:`${nfes.length} NF-e(s) — TOTAL:` }),
                                                    h("td", { key:"b", style:{ padding:"8px 10px", textAlign:"right" }, children: fmt(nfes.reduce((s,n) => s + Number(n.valorTotal??n.valor??0), 0)) }),
                                                    h("td", { key:"c", colSpan:2 }),
                                                ]})
                                        }),
                                    ]})
                                })
                                : h("div", { children: chaveVinc.map((ch, i) =>
                                    h("p", { key:i, style:{ fontFamily:"monospace", fontSize:"12px", padding:"4px 0", borderBottom:"1px solid #f3f4f6" }, children:ch })
                                )})
                    }),

                    // Divergências
                    doc.divergencias?.length > 0 ? h(Secao, { key:"divs", titulo:`Divergências (${doc.divergencias.length})`, cor:"#fff1f2", children:
                        h("table", { style:{ width:"100%", fontSize:"12px", borderCollapse:"collapse" }, children:
                            h("tbody", { children: doc.divergencias.map((d, i) =>
                                h("tr", { key:i, style:{ borderBottom:"1px solid #ffe4e6", verticalAlign:"middle" }, children: [
                                        h("td", { key:"tp", style:{ padding:"6px 8px", fontWeight:600, color:"#dc2626", verticalAlign:"middle" }, children:d.tipoDivergencia }),
                                        h("td", { key:"ds", style:{ padding:"6px 8px", verticalAlign:"middle" }, children:d.descricao }),
                                        h("td", { key:"ac", style:{ padding:"6px 8px", color:"#6b7280", verticalAlign:"middle" }, children:d.acaoRecomendada }),
                                    ]})
                            )})
                        })
                    }) : null,

                    // XML
                    doc.xmlComprimido ? h(Secao, { key:"xml", titulo:"XML do CT-e (SEFAZ)", cor:"#fafaf9", children:
                        h("pre", { style:{ fontSize:"10.5px", background:"#0f172a", color:"#e5e7eb", padding:"16px", borderRadius:"6px", overflowX:"auto", maxHeight:"380px", overflowY:"auto", lineHeight:1.5, margin:0, whiteSpace:"pre-wrap" }, children:doc.xmlComprimido })
                    }) : null,
                ]})
            }),
        ]}),
    ]});
}

// ── MODAL CADASTRO FORNECEDOR — CT-e ──
function ModalCadastroFornecCte({ cte, onClose, onCadastrado }) {
    const [dados, setDados] = React.useState(null);
    const [carregando, setCarregando] = React.useState(true);
    const [erro, setErro] = React.useState("");
    const [salvando, setSalvando] = React.useState(false);
    const [simplesnacional, setSimplesnacional] = React.useState("N");
    const chave = cte?.chaveAcesso || cte?.chave || "";

    React.useEffect(() => {
        if (!chave) return;
        setCarregando(true); setErro("");
        apiFetch(`/api/fiscal/cte/${encodeURIComponent(chave)}/dados-emitente`)
            .then(r => { setDados(r); setSimplesnacional(r.simplesnacional || "N"); })
            .catch(e => setErro(e.message))
            .finally(() => setCarregando(false));
    }, [chave]);

    const cadastrar = async () => {
        if (!dados) return;
        setSalvando(true); setErro("");
        try {
            const res = await apiFetch("/api/fiscal/fornecedores/cadastrar", { method: "POST", body: JSON.stringify({ tipoDfe: "CTE", chaveAcesso: chave, dadosEmitente: { ...dados, simplesnacional } }) });
            onCadastrado(res);
        } catch (e) { setErro(e.message); } finally { setSalvando(false); }
    };

    const infoRow = (label, value) => hs("div", { style: { display: "flex", gap: "8px", fontSize: "13px", marginBottom: "4px" }, children: [
        h("span", { key: "l", style: { color: "#6b7280", minWidth: "130px", flexShrink: 0 }, children: label }),
        h("span", { key: "v", style: { fontWeight: 500, wordBreak: "break-all" }, children: value || "—" }),
    ]});

    return h("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }, onClick: onClose, children:
        h("div", { style: { background: "#fff", borderRadius: "10px", padding: "28px", width: "480px", maxWidth: "95vw", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,.18)" }, onClick: e => e.stopPropagation(), children:
            hs("div", { style: { display: "flex", flexDirection: "column", gap: "14px" }, children: [
                h("h2", { key: "h", style: { fontSize: "16px", fontWeight: 700, margin: 0 }, children: "Cadastrar Transportadora no WinThor" }),
                carregando ? h("p", { key: "ld", style: { color: "#9ca3af", fontSize: "13px" }, children: "Carregando dados do CT-e…" }) : null,
                erro ? h("p", { key: "er", style: { color: "#dc2626", fontSize: "13px", margin: 0 }, children: erro }) : null,
                dados && !carregando ? hs("div", { key: "dados", style: { background: "#f9fafb", padding: "12px", borderRadius: "8px" }, children: [
                    infoRow("CNPJ", dados.cnpj),
                    infoRow("Razão Social", dados.nome),
                    infoRow("IE", dados.ie),
                    infoRow("UF", dados.uf),
                    infoRow("Tipo", "T — Transportadora (CT-e)"),
                    h("div", { key: "obs", style: { marginTop: "8px", padding: "8px", background: "#fef3c7", borderRadius: "6px", fontSize: "12px", color: "#92400e" }, children: "Endereço não disponível no CT-e. Preencha no WinThor após o cadastro se necessário." }),
                ]}) : null,
                dados && !carregando ? hs("div", { key: "simp", children: [
                    h("label", { key: "l", style: { fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "4px" }, children: "Simples Nacional" }),
                    h("select", { key: "s", value: simplesnacional, onChange: e => setSimplesnacional(e.target.value), style: { padding: "8px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px" }, children: [
                        h("option", { key: "n", value: "N", children: "N — Regime Normal" }),
                        h("option", { key: "s2", value: "S", children: "S — Simples Nacional" }),
                    ]}),
                ]}) : null,
                hs("div", { key: "btns", style: { display: "flex", justifyContent: "flex-end", gap: "8px" }, children: [
                    h(Button, { key: "c", variant: "outline", onClick: onClose, children: "Cancelar" }),
                    dados && !carregando ? h(Button, { key: "s", onClick: cadastrar, disabled: salvando, children: salvando ? "Cadastrando…" : "Cadastrar no WinThor" }) : null,
                ]}),
            ]})
        })
    });
}

// ── PÁGINA PRINCIPAL CT-e ──
export default function FiscalCTePage() {
    const [dados, setDados] = React.useState({ items: [], total: 0 });
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState("");
    const [pagina, setPagina] = React.useState(1);
    const [filtros, setFiltros] = React.useState({ transportadora: "", status: "", dataInicio: "", dataFim: "", codfilial: "", apenasSemNfe: false });
    const [detalheChave, setDetalheChave] = React.useState(null);
    const [exportando, setExportando] = React.useState(false);
    const [fornecStatus, setFornecStatus] = React.useState({});
    const [modalFornec, setModalFornec] = React.useState(null);

    const carregar = React.useCallback(async (f, pg) => {
        setErro(""); setLoading(true);
        try {
            const d = await apiFetch(`/api/fiscal/cte${bq({ ...f, page:pg||1, pageSize:50 })}`);
            setDados(d || { items:[], total:0 });
            const itensCarregados = (d?.items || d?.ctes || []);
            const cnpjs = [...new Set(itensCarregados.map(c => String(c.emitente?.cnpj || c.cnpjEmitente || "").replace(/\D/g, "")).filter(c => c.length >= 11))];
            if (cnpjs.length > 0) {
                apiFetch("/api/fiscal/fornecedores/verificar-cadastro", { method: "POST", body: JSON.stringify({ cnpjs }) })
                    .then(r => setFornecStatus(r.resultado || {}))
                    .catch(() => {});
            }
        } catch (e) { setErro(e.message); } finally { setLoading(false); }
    }, []);
    React.useEffect(() => { carregar(filtros, 1); }, []);
    const filtrar = () => { setPagina(1); carregar(filtros,1); };
    const setF = (k, v) => setFiltros(p => ({ ...p, [k]:v }));

    const exportarCsv = async () => {
        setExportando(true);
        try {
            const res = await fetch(`/api/fiscal/exportar/cte-csv${bq(filtros)}`, { headers: { Authorization:`Bearer ${getToken()}` } });
            const blob = await res.blob(); const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href=url; a.download=`cte-${new Date().toISOString().slice(0,10)}.csv`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        } catch (e) { setErro(e.message); } finally { setExportando(false); }
    };

    const ctes = dados.items || dados.ctes || [];
    const totFrete = ctes.reduce((s,c) => s + Number(c.valorTotal??c.valorFrete??0), 0);
    const semNfe = ctes.filter(c => !c.nfesVinculadas || c.nfesVinculadas.length === 0).length;
    const cancel = ctes.filter(c => ["CANCELADA","CANCELADO"].includes(c.statusSefaz||c.status)).length;

    return hs("div", { style: { padding:"24px", maxWidth:"1400px", margin:"0 auto" }, children: [
        detalheChave ? h(PainelCTe, { key:"drawer", chave:detalheChave, onClose:()=>setDetalheChave(null) }) : null,
        modalFornec ? h(ModalCadastroFornecCte, { key:"mfornec", cte:modalFornec, onClose:()=>setModalFornec(null), onCadastrado:(res)=>{ setModalFornec(null); const cnpj=String(modalFornec.emitente?.cnpj||modalFornec.cnpjEmitente||"").replace(/\D/g,""); if (cnpj) setFornecStatus(prev=>({...prev,[cnpj]:{cadastrado:true,codfornec:res.codfornec,nome:res.nome}})); } }) : null,

        // Header
        hs("div", { key:"hdr", style:{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"20px", flexWrap:"wrap", gap:"12px" }, children: [
            hs("div", { key:"t", children: [
                h("h1", { key:"h1", style:{ fontSize:"22px", fontWeight:700, margin:"0 0 4px 0" }, children:"CT-e Recebidos" }),
                h("p", { key:"s", style:{ fontSize:"13px", color:"#6b7280", margin:0 }, children:"Clique em Detalhe para ver chave, emissão, valor e NF-es vinculadas" }),
            ]}),
            h(Button, { key:"exp", variant:"outline", onClick:exportarCsv, disabled:exportando, style:{ fontSize:"12px" }, children:exportando?"Exportando...":"Exportar CSV" }),
        ]}),

        // KPIs
        h("div", { key:"kpis", style:{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(150px, 1fr))", gap:"12px", marginBottom:"20px" }, children: [
            h(KpiCard, { key:"k1", label:"Total CT-e", value:dados.total||ctes.length, color:"#2563eb" }),
            h(KpiCard, { key:"k2", label:"Valor Frete", value:fmt(totFrete) }),
            h(KpiCard, { key:"k3", label:"Sem NF-e Vinc.", value:semNfe, color:semNfe>0?"#d97706":undefined }),
            h(KpiCard, { key:"k4", label:"Cancelados", value:cancel }),
        ]}),

        // Filtros
        h(Card, { key:"filtros", style:{ marginBottom:"16px" }, children:
            h(CardContent, { style:{ padding:"16px 20px" }, children:
                hs("div", { style:{ display:"flex", flexDirection:"column", gap:"12px" }, children: [
                    h("div", { key:"r1", style:{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px, 1fr))", gap:"10px" }, children: [
                        h(Input, { key:"tr", placeholder:"Transportadora (nome ou CNPJ)", value:filtros.transportadora, onChange:e=>setF("transportadora",e.target.value) }),
                        h("select", { key:"st", value:filtros.status, onChange:e=>setF("status",e.target.value), style:{ padding:"8px 10px", borderRadius:"6px", border:"1px solid #d1d5db", fontSize:"13px" }, children: [
                            h("option", { key:"a", value:"", children:"Status (todos)" }),
                            h("option", { key:"b", value:"AUTORIZADA", children:"Autorizada" }),
                            h("option", { key:"c", value:"PENDENTE", children:"Pendente" }),
                            h("option", { key:"d", value:"CANCELADA", children:"Cancelada" }),
                            h("option", { key:"e", value:"DENEGADA", children:"Denegada" }),
                        ]}),
                        h("input", { key:"di", type:"date", value:filtros.dataInicio, onChange:e=>setF("dataInicio",e.target.value), style:{ padding:"8px 10px", borderRadius:"6px", border:"1px solid #d1d5db", fontSize:"13px" } }),
                        h("input", { key:"df", type:"date", value:filtros.dataFim, onChange:e=>setF("dataFim",e.target.value), style:{ padding:"8px 10px", borderRadius:"6px", border:"1px solid #d1d5db", fontSize:"13px" } }),
                        h(Input, { key:"cf", placeholder:"Filial (cód.)", value:filtros.codfilial, onChange:e=>setF("codfilial",e.target.value) }),
                    ]}),
                    hs("div", { key:"r2", style:{ display:"flex", gap:"16px", alignItems:"center" }, children: [
                        hs("label", { key:"l1", style:{ display:"flex", alignItems:"center", gap:"6px", fontSize:"13px", cursor:"pointer" }, children: [
                            h("input", { key:"c", type:"checkbox", checked:filtros.apenasSemNfe, onChange:e=>setF("apenasSemNfe",e.target.checked) }),
                            "Apenas sem NF-e vinculada",
                        ]}),
                        h(Button, { key:"btn", onClick:filtrar, style:{ fontSize:"13px" }, children:"Filtrar" }),
                    ]}),
                ]})
            })
        }),

        erro ? h("div", { key:"err", style:{ background:"#fee2e2", color:"#991b1b", padding:"12px 16px", borderRadius:"8px", fontSize:"13px", marginBottom:"12px" }, children:erro }) : null,

        // Tabela
        h(Card, { key:"tabela", children:
            h(CardContent, { style:{ padding:0 }, children:
                loading
                    ? h("p", { style:{ padding:"24px", color:"#9ca3af" }, children:"Carregando..." })
                    : ctes.length === 0
                        ? h("p", { style:{ padding:"24px", color:"#9ca3af" }, children:"Nenhum CT-e encontrado para os filtros aplicados." })
                        : hs("div", { style:{ overflowX:"auto" }, children: [
                            h("table", { key:"t", style:{ width:"100%", borderCollapse:"collapse", fontSize:"13px" }, children: [
                                h("thead", { key:"th", children:
                                    h("tr", { style:{ borderBottom:"1px solid #e5e7eb", background:"#f9fafb" }, children:
                                        ["Risco","Chave CT-e","Nº/Série","Transportadora","CNPJ Emit.","Emissão","Entrada","Vl. Frete","Status SEFAZ","NF-es Vinc.","Fornecedor","Score","Ações"].map(c =>
                                            h("th", { key:c, style:{ padding:"10px 10px", textAlign:"left", fontWeight:600, fontSize:"11px", color:"#6b7280", whiteSpace:"nowrap", verticalAlign:"middle" }, children:c })
                                        )
                                    })
                                }),
                                h("tbody", { key:"tb", children:
                                    ctes.map((cte, i) => {
                                        const chave = cte.chaveAcesso || cte.chave || "";
                                        const emNome = cte.emitente?.nome || cte.transportadora || cte.nomeEmitente || "—";
                                        const emCnpj = cte.emitente?.cnpj || cte.cnpjEmitente || "—";
                                        const risco = cte.classificacaoRisco || cte.risco || "BAIXO";
                                        const score = cte.scoreRisco ?? cte.score ?? 0;
                                        const qtdNfes = cte.nfesVinculadas?.length ?? cte.qtdNfesVinculadas ?? 0;
                                        const emCnpjLimpo = String(emCnpj).replace(/\D/g, "");
                                        const fStatus = fornecStatus[emCnpjLimpo];
                                        return h("tr", { key:chave||i, style:{ borderBottom:"1px solid #f3f4f6", background:i%2?"#fafafa":"#fff", verticalAlign:"middle" }, children: [
                                            h("td", { key:"r", style:{ padding:"8px 10px", verticalAlign:"middle" }, children: rBadge(risco) }),
                                            h("td", { key:"ch", style:{ padding:"8px 10px", fontFamily:"monospace", fontSize:"11px", whiteSpace:"nowrap", verticalAlign:"middle" }, children: chave?`${chave.slice(0,8)}…${chave.slice(-6)}`:"—" }),
                                            h("td", { key:"nn", style:{ padding:"8px 10px", fontFamily:"monospace", fontSize:"12px", verticalAlign:"middle" }, children:`${cte.numero||"—"}/${cte.serie||"—"}` }),
                                            h("td", { key:"tr2", style:{ padding:"8px 10px", maxWidth:"150px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", verticalAlign:"middle" }, children: emNome }),
                                            h("td", { key:"cn", style:{ padding:"8px 10px", fontFamily:"monospace", fontSize:"11px", verticalAlign:"middle" }, children: emCnpj }),
                                            h("td", { key:"de", style:{ padding:"8px 10px", whiteSpace:"nowrap", verticalAlign:"middle" }, children: fmtDate(cte.dhEmissao||cte.dataEmissao) }),
                                            h("td", { key:"en", style:{ padding:"8px 10px", whiteSpace:"nowrap", verticalAlign:"middle" }, children: fmtDate(cte.dataEntrada) }),
                                            h("td", { key:"vl", style:{ padding:"8px 10px", textAlign:"right", fontWeight:600, whiteSpace:"nowrap", verticalAlign:"middle" }, children: fmt(cte.valorTotal??cte.valorFrete) }),
                                            h("td", { key:"ss", style:{ padding:"8px 10px", verticalAlign:"middle" }, children: sBadge(cte.statusSefaz||cte.status) }),
                                            h("td", { key:"nf", style:{ padding:"8px 10px", textAlign:"center", whiteSpace:"nowrap", verticalAlign:"middle" }, children:
                                                qtdNfes === 0
                                                    ? h("span",{style:{color:"#d97706",fontWeight:700,fontSize:"12px"},children:"Sem NF-e"})
                                                    : h("span",{style:{color:"#2563eb",fontWeight:600},children:`${qtdNfes} NF-e`})
                                            }),
                                            h("td", { key:"forn", style:{ padding:"8px 10px", whiteSpace:"nowrap", verticalAlign:"middle" }, children:
                                                fStatus == null
                                                    ? h("span",{style:{color:"#9ca3af",fontSize:"11px"},children:"…"})
                                                    : fStatus.cadastrado
                                                        ? h("span",{style:{background:"#dcfce7",color:"#166534",padding:"2px 7px",borderRadius:"9999px",fontSize:"11px",fontWeight:600},children:`#${fStatus.codfornec}`})
                                                        : hs("div",{style:{display:"flex",gap:"6px",alignItems:"center",flexWrap:"nowrap"},children:[
                                                            h("span",{key:"b",style:{background:"#fee2e2",color:"#991b1b",padding:"2px 7px",borderRadius:"9999px",fontSize:"11px",fontWeight:600,whiteSpace:"nowrap"},children:"Não cadastrado"}),
                                                            chave ? h(Button,{key:"cad",style:{fontSize:"10px",padding:"2px 8px",background:"#2563eb",color:"#fff",border:"none",lineHeight:"1.5",whiteSpace:"nowrap",flexShrink:0},onClick:()=>setModalFornec(cte),children:"Cadastrar"}) : null,
                                                        ]})
                                            }),
                                            h("td", { key:"sc", style:{ padding:"8px 10px", fontWeight:700, color:scoreColor(score), textAlign:"center", verticalAlign:"middle" }, children:String(score) }),
                                            h("td", { key:"ac", style:{ padding:"8px 10px", whiteSpace:"nowrap", verticalAlign:"middle" }, children:
                                                h(Button, { variant:"outline", style:{ fontSize:"11px", padding:"4px 10px", whiteSpace:"nowrap" }, onClick:()=>setDetalheChave(chave), children:"Detalhe + NF-es" })
                                            }),
                                        ]});
                                    })
                                }),
                            ]}),
                            hs("div", { key:"pag", style:{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 16px", borderTop:"1px solid #e5e7eb", fontSize:"13px" }, children: [
                                h("span", { key:"t", style:{ color:"#6b7280" }, children:`Total: ${dados.total||ctes.length} CT-e` }),
                                hs("div", { key:"btns", style:{ display:"flex", gap:"8px" }, children: [
                                    h(Button, { key:"prev", variant:"outline", disabled:pagina<=1, onClick:()=>{ const p=pagina-1; setPagina(p); carregar(filtros,p); }, style:{ fontSize:"12px" }, children:"Anterior" }),
                                    h("span", { key:"pg", style:{ padding:"6px 10px", fontSize:"12px" }, children:`Pág. ${pagina}` }),
                                    h(Button, { key:"next", variant:"outline", onClick:()=>{ const p=pagina+1; setPagina(p); carregar(filtros,p); }, style:{ fontSize:"12px" }, children:"Próxima" }),
                                ]}),
                            ]}),
                        ]})
            })
        }),
    ]});
}
