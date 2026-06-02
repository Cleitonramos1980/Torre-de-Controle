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
function fmtN(v) { const n = Number(v ?? 0); return Number.isFinite(n) ? n.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : "0"; }
function fmtDate(v) { if (!v) return "-"; const d = new Date(`${String(v).slice(0, 10)}T00:00:00`); return isNaN(d) ? String(v) : d.toLocaleDateString("pt-BR"); }
function fmtDT(v) { if (!v) return "-"; const d = new Date(v); return isNaN(d) ? String(v) : d.toLocaleString("pt-BR"); }
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
function rBadge(r) { const [bg, fg] = RC[r] || ["#f3f4f6","#374151"]; return h("span", { style: { background: bg, color: fg, padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700 }, children: r || "—" }); }
const SC = { AUTORIZADA: ["#dcfce7","#166534"], CANCELADA: ["#fee2e2","#991b1b"], DENEGADA: ["#fef3c7","#92400e"] };
function sBadge(s) { const [bg, fg] = SC[String(s||"").toUpperCase()] || ["#f3f4f6","#374151"]; return h("span", { style: { background: bg, color: fg, padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 600 }, children: s || "—" }); }
function scoreColor(n) { if (n >= 76) return "#dc2626"; if (n >= 51) return "#d97706"; if (n >= 26) return "#2563eb"; return "#16a34a"; }

function KpiCard({ label, value, color }) {
    return h(Card, { children: h(CardContent, { style: { padding: "14px 18px" }, children: hs("div", { children: [
        h("p", { key: "l", style: { fontSize: "11px", color: "#6b7280", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }, children: label }),
        h("p", { key: "v", style: { fontSize: "24px", fontWeight: 700, color: color || "inherit", lineHeight: 1 }, children: value ?? "—" }),
    ]}) }) });
}

function Campo({ label, value, mono }) {
    return hs("div", { style: { marginBottom: "10px" }, children: [
        h("p", { key: "l", style: { fontSize: "10px", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: "2px" }, children: label }),
        h("p", { key: "v", style: { fontSize: "13px", color: "#111827", fontFamily: mono ? "monospace" : undefined, wordBreak: "break-all" }, children: value || "—" }),
    ]});
}

function Secao({ titulo, cor, open: initOpen = false, children }) {
    const [open, setOpen] = React.useState(initOpen);
    return hs("div", { style: { border: "1px solid #e5e7eb", borderRadius: "8px", marginBottom: "12px", overflow: "hidden" }, children: [
        h("button", { key: "btn", onClick: () => setOpen(!open), style: { width: "100%", textAlign: "left", padding: "12px 16px", background: cor || "#f9fafb", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", fontWeight: 700, fontSize: "13px" }, children: [
            h("span", { key: "t", children: titulo }),
            h("span", { key: "ic", style: { fontSize: "16px", color: "#9ca3af" }, children: open ? "▲" : "▼" }),
        ]}),
        open ? h("div", { key: "body", style: { padding: "16px" }, children: children }) : null,
    ]});
}

// ── PAINEL LATERAL NF-e ──
function PainelNFe({ chave, onClose, fornecStatus, onFornecCadastrado }) {
    const [doc, setDoc] = React.useState(null);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState(null);
    const [modalProduto, setModalProduto] = React.useState(null);
    const [modalPedido, setModalPedido] = React.useState(false);
    const [modalFornecPanel, setModalFornecPanel] = React.useState(false);
    const [fornecCadastradoLocal, setFornecCadastradoLocal] = React.useState(null);

    React.useEffect(() => {
        if (!chave) return;
        setLoading(true); setErro(null); setDoc(null); setFornecCadastradoLocal(null);
        apiFetch(`/api/fiscal/nfe/${encodeURIComponent(chave)}`)
            .then(r => setDoc(r))
            .catch(e => setErro(e.message))
            .finally(() => setLoading(false));
    }, [chave]);

    const emit = doc?.emitente || {};
    const dest = doc?.destinatario || {};
    const itens = doc?.itens || [];
    const score = doc?.scoreRisco ?? 0;
    const cnpjEmit = String(emit.cnpj || "").replace(/\D/g, "");
    const codfornecWinthor = fornecCadastradoLocal?.codfornec ?? fornecStatus?.[cnpjEmit]?.codfornec ?? null;
    const fornecJaCadastrado = fornecCadastradoLocal?.cadastrado ?? fornecStatus?.[cnpjEmit]?.cadastrado ?? false;

    return h("div", { style: { position: "fixed", inset: 0, zIndex: 1000, display: "flex" }, children: [
        modalProduto ? h(ModalCadastroProduto, { key: "mprod", item: modalProduto, chaveAcesso: chave, codfornec: codfornecWinthor, onClose: () => setModalProduto(null), onCadastrado: (res) => { setModalProduto(null); } }) : null,
        modalPedido ? h(ModalCriarPedido, { key: "mped", doc, chaveAcesso: chave, codfornec: codfornecWinthor, onClose: () => setModalPedido(false), onCriado: (res) => { setModalPedido(false); setDoc(p => p ? { ...p, pedidoCompra: String(res.numped) } : p); } }) : null,
        modalFornecPanel ? h(ModalCadastroFornecNfe, { key: "mfp", nfe: doc ? { ...doc, chaveAcesso: chave } : { chaveAcesso: chave }, onClose: () => setModalFornecPanel(false), onCadastrado: (res) => { setModalFornecPanel(false); setFornecCadastradoLocal({ cadastrado: true, codfornec: res.codfornec }); if (onFornecCadastrado) onFornecCadastrado(cnpjEmit, res); } }) : null,
        h("div", { key: "ov", onClick: onClose, style: { flex: 1, background: "rgba(0,0,0,0.45)" } }),
        hs("div", { key: "dw", style: { width: "min(760px, 100vw)", background: "#fff", height: "100%", overflowY: "auto", boxShadow: "-4px 0 24px rgba(0,0,0,.15)", display: "flex", flexDirection: "column" }, children: [
            // Header fixo
            hs("div", { key: "hdr", style: { padding: "18px 24px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff", zIndex: 10 }, children: [
                hs("div", { key: "info", children: [
                    h("p", { key: "s", style: { fontSize: "11px", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "2px" }, children: "Detalhes NF-e" }),
                    h("p", { key: "c", style: { fontSize: "11px", fontFamily: "monospace", color: "#374151", wordBreak: "break-all" }, children: chave }),
                ]}),
                h("button", { key: "cls", onClick: onClose, style: { border: "none", background: "none", fontSize: "24px", cursor: "pointer", color: "#9ca3af", lineHeight: 1 }, children: "×" }),
            ]}),
            // Body
            h("div", { key: "body", style: { padding: "20px 24px", flex: 1 }, children:
                loading ? h("p", { style: { color: "#9ca3af", padding: "24px 0" }, children: "Carregando..." })
                : erro ? h("p", { style: { color: "#dc2626", padding: "12px 0" }, children: `Erro: ${erro}` })
                : hs("div", { children: [
                    // badges de status
                    hs("div", { key: "badges", style: { display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }, children: [
                        sBadge(doc.statusSefaz),
                        rBadge(doc.classificacaoRisco),
                        doc.statusManifestacao ? h("span", { key: "mf", style: { background: "#e0e7ff", color: "#3730a3", padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 600 }, children: doc.statusManifestacao }) : null,
                        doc.origem ? h("span", { key: "or", style: { background: "#f3f4f6", color: "#6b7280", padding: "2px 8px", borderRadius: "9999px", fontSize: "11px" }, children: doc.origem }) : null,
                    ]}),

                    // NÍVEL 1
                    h(Secao, { key: "n1", titulo: "Nível 1 — Resumo da Nota", cor: "#f0fdf4", open: true, children:
                        hs("div", { children: [
                            hs("div", { key: "g1", style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }, children: [
                                h(Campo, { key: "ch", label: "Chave de Acesso", value: chave, mono: true }),
                                h(Campo, { key: "ns", label: "Número / Série / Modelo", value: `${doc.numero || "—"} / ${doc.serie || "—"} / ${doc.modelo || "55"}` }),
                                h(Campo, { key: "em", label: "Data de Emissão", value: fmtDate(doc.dhEmissao || doc.dataEmissao) }),
                                h(Campo, { key: "en", label: "Data de Entrada", value: fmtDate(doc.dataEntrada) }),
                                h(Campo, { key: "vt", label: "Valor Total", value: fmt(doc.valorTotal) }),
                                h(Campo, { key: "pr", label: "Protocolo SEFAZ", value: doc.protocoloAutorizacao }),
                                h(Campo, { key: "am", label: "Ambiente", value: doc.ambiente }),
                                h(Campo, { key: "wt", label: "Status WinThor", value: doc.statusWinthor || "—" }),
                            ]}),
                            h("hr", { key: "hr1", style: { border: "none", borderTop: "1px solid #e5e7eb", margin: "8px 0 12px" } }),
                            h("p", { key: "te", style: { fontSize: "11px", fontWeight: 700, color: "#374151", marginBottom: "8px", textTransform: "uppercase" }, children: "Emitente (Fornecedor)" }),
                            hs("div", { key: "g2", style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }, children: [
                                h(Campo, { key: "nm", label: "Nome / Razão Social", value: emit.nome || emit.xNome }),
                                h(Campo, { key: "cn", label: "CNPJ", value: emit.cnpj, mono: true }),
                                emit.ie ? h(Campo, { key: "ie", label: "IE", value: emit.ie }) : null,
                                emit.uf ? h(Campo, { key: "uf", label: "UF / Município", value: `${emit.uf}${emit.xMun ? " — " + emit.xMun : ""}` }) : null,
                                emit.logradouro ? h(Campo, { key: "end", label: "Endereço", value: `${emit.logradouro}, ${emit.nro || ""}` }) : null,
                                emit.fone ? h(Campo, { key: "fone", label: "Telefone", value: emit.fone, mono: true }) : null,
                            ]}),
                            h("hr", { key: "hr2", style: { border: "none", borderTop: "1px solid #e5e7eb", margin: "8px 0 12px" } }),
                            h("p", { key: "td", style: { fontSize: "11px", fontWeight: 700, color: "#374151", marginBottom: "8px", textTransform: "uppercase" }, children: "Destinatário" }),
                            hs("div", { key: "g3", style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }, children: [
                                h(Campo, { key: "dc", label: "CNPJ Destinatário", value: dest.cnpj, mono: true }),
                                h(Campo, { key: "df", label: "Cód. Filial", value: dest.filialCodigo }),
                                dest.nome ? h(Campo, { key: "dn", label: "Nome", value: dest.nome }) : null,
                            ]}),
                            doc.scoreRisco != null ? hs("div", { key: "score", style: { background: "#f9fafb", borderRadius: "8px", padding: "12px", marginTop: "8px" }, children: [
                                h("p", { key: "sl", style: { fontSize: "11px", color: "#6b7280", marginBottom: "4px", textTransform: "uppercase", fontWeight: 600 }, children: "Score de Risco" }),
                                hs("div", { key: "sr", style: { display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }, children: [
                                    h("p", { key: "sv", style: { fontSize: "28px", fontWeight: 800, color: scoreColor(score), margin: 0 }, children: String(score) }),
                                    rBadge(doc.classificacaoRisco),
                                ]}),
                                doc.regrasRiscoAplicadas?.length > 0 ? h("div", { key: "regras", children: doc.regrasRiscoAplicadas.map((r, i) =>
                                    h("p", { key: i, style: { fontSize: "12px", color: "#6b7280", margin: "2px 0" }, children: `• ${r.codigo}: ${r.descricao} (+${r.pontos} pts)` })
                                )}) : null,
                            ]}) : null,
                            // Botão Cadastrar Fornecedor — aparece no Nível 1 quando o emitente não está no WinThor
                            cnpjEmit && !fornecJaCadastrado
                                ? h("div", { key: "forn-cad-bloco", style: { marginTop: "12px", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: "8px", padding: "10px 14px", display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" } }, [
                                    h("span", { key: "txt", style: { fontSize: "13px", color: "#92400e", fontWeight: 500, flex: 1 } }, "Emitente não cadastrado como fornecedor no WinThor."),
                                    h(Button, { key: "btn", style: { background: "#2563eb", color: "#fff", border: "none", fontSize: "12px", whiteSpace: "nowrap" }, onClick: () => setModalFornecPanel(true) }, "Cadastrar Fornecedor"),
                                  ])
                                : cnpjEmit && fornecJaCadastrado
                                    ? h("div", { key: "forn-ok", style: { marginTop: "12px", background: "#dcfce7", color: "#166534", padding: "8px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 600 } }, `Fornecedor cadastrado no WinThor — CODFORNEC ${codfornecWinthor}`)
                                    : null,
                            // Botão criar pedido de compra — só disponível quando NF-e já está no WinThor (PCNFENT)
                            doc.pedidoCompra
                                ? h("div", { key: "ped-ok", style: { marginTop: "12px", background: "#dcfce7", color: "#166534", padding: "8px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 600 }, children: `Pedido de compra vinculado: #${doc.pedidoCompra}` })
                                : doc.statusWinthor === "ENCONTRADO"
                                    ? h("div", { key: "btn-ped", style: { marginTop: "12px", display: "flex", gap: "8px", alignItems: "center" }, children: [
                                        h(Button, { key: "b", style: { background: "#16a34a", color: "#fff", border: "none", fontSize: "12px" }, onClick: () => setModalPedido(true), children: "Criar Pedido de Compra no WinThor" }),
                                        h("span", { key: "h", style: { fontSize: "11px", color: "#9ca3af" }, children: "Crie o pedido após cadastrar produtos no Nível 2" }),
                                    ]})
                                    : h("div", { key: "ped-wt", style: { marginTop: "12px", background: "#fef3c7", color: "#92400e", padding: "8px 12px", borderRadius: "6px", fontSize: "12px" }, children: "NF-e ainda não registrada no WinThor (PCNFENT). Sincronize primeiro." }),
                        ]})
                    }),

                    // NÍVEL 2 — PRODUTOS
                    h(Secao, { key: "n2", titulo: `Nível 2 — Produtos / Itens (${itens.length})`, cor: "#eff6ff", children:
                        itens.length === 0
                            ? h("p", { style: { color: "#9ca3af", fontSize: "13px" }, children: "Nenhum item encontrado. Execute Sincronizar para buscar itens do WinThor (PCNFENTITEM)." })
                            : h("div", { style: { overflowX: "auto" }, children:
                                hs("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "12px" }, children: [
                                    h("thead", { key: "th", children:
                                        h("tr", { style: { background: "#dbeafe", borderBottom: "1px solid #bfdbfe" }, children:
                                            ["#","Cód. Forn.","EAN","Descrição","Un","Qtd","Vl.Unit.","Total","CFOP","CST","ICMS%",""].map(c =>
                                                h("th", { key: c || "ac", style: { padding: "6px 8px", textAlign: c === "Qtd" || c === "Vl.Unit." || c === "Total" || c === "ICMS%" ? "right" : "left", fontWeight: 700, whiteSpace: "nowrap", fontSize: "11px" }, children: c })
                                            )
                                        })
                                    }),
                                    h("tbody", { key: "tb", children: itens.map((it, i) =>
                                        h("tr", { key: it.id || i, style: { borderBottom: "1px solid #f3f4f6", background: i % 2 ? "#f8faff" : "#fff" }, children: [
                                            h("td", { key: "seq", style: { padding: "6px 8px", color: "#9ca3af", fontSize: "11px" }, children: String(it.seq ?? i+1) }),
                                            h("td", { key: "cod", style: { padding: "6px 8px", fontFamily: "monospace", fontSize: "11px" }, children: it.codProd || "—" }),
                                            h("td", { key: "ean", style: { padding: "6px 8px", fontFamily: "monospace", fontSize: "11px", color: "#4b5563" }, children: it.ean && it.ean !== "SEM GTIN" && it.ean !== "0" ? it.ean : "—" }),
                                            h("td", { key: "dsc", style: { padding: "6px 8px", maxWidth: "220px", fontWeight: 500 }, children: it.descricao || "—" }),
                                            h("td", { key: "un", style: { padding: "6px 8px" }, children: it.unidade || "—" }),
                                            h("td", { key: "qt", style: { padding: "6px 8px", textAlign: "right" }, children: fmtN(it.quantidade) }),
                                            h("td", { key: "vu", style: { padding: "6px 8px", textAlign: "right" }, children: fmt(it.valorUnitario) }),
                                            h("td", { key: "vt2", style: { padding: "6px 8px", textAlign: "right", fontWeight: 700 }, children: fmt(it.valorTotal) }),
                                            h("td", { key: "cfop", style: { padding: "6px 8px", fontFamily: "monospace", fontSize: "11px" }, children: it.cfop || "—" }),
                                            h("td", { key: "cst", style: { padding: "6px 8px", fontFamily: "monospace", fontSize: "11px" }, children: it.cst || "—" }),
                                            h("td", { key: "pi", style: { padding: "6px 8px", textAlign: "right" }, children: it.percIcms ? `${it.percIcms}%` : "—" }),
                                            h("td", { key: "ac", style: { padding: "4px 8px", whiteSpace: "nowrap" }, children:
                                                h("button", { onClick: () => setModalProduto(it), style: { fontSize: "11px", padding: "3px 10px", borderRadius: "5px", border: "1px solid #2563eb", background: "#eff6ff", color: "#1d4ed8", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }, children: "Cadastrar" })
                                            }),
                                        ]})
                                    )}),
                                    h("tfoot", { key: "tf", children:
                                        h("tr", { style: { background: "#dbeafe", borderTop: "2px solid #93c5fd", fontWeight: 700 }, children: [
                                            h("td", { key: "a", colSpan: 7, style: { padding: "8px", textAlign: "right" }, children: `${itens.length} item(ns) — TOTAL:` }),
                                            h("td", { key: "b", style: { padding: "8px", textAlign: "right" }, children: fmt(itens.reduce((s,i) => s + Number(i.valorTotal ?? 0), 0)) }),
                                            h("td", { key: "c", colSpan: 3, style: { padding: "8px", textAlign: "right", color: "#6b7280", fontWeight: 400, fontSize: "11px" }, children: "Fonte: XML SEFAZ (PCDOCELETRONICO)" }),
                                        ]})
                                    }),
                                ]})
                            })
                    }),

                    // XML
                    doc.xmlComprimido ? h(Secao, { key: "xml", titulo: "XML da Nota (SEFAZ)", cor: "#fafaf9", children:
                        h("pre", { style: { fontSize: "10.5px", background: "#0f172a", color: "#e2e8f0", padding: "16px", borderRadius: "6px", overflowX: "auto", maxHeight: "400px", overflowY: "auto", lineHeight: 1.5, margin: 0, whiteSpace: "pre-wrap" }, children: doc.xmlComprimido })
                    }) : null,

                    // Manifestações
                    doc.manifestacoes?.length > 0 ? h(Secao, { key: "mf", titulo: `Manifestações (${doc.manifestacoes.length})`, cor: "#fdf4ff", children:
                        h("table", { style: { width: "100%", fontSize: "12px", borderCollapse: "collapse" }, children:
                            h("tbody", { children: doc.manifestacoes.map((m, i) =>
                                h("tr", { key: i, style: { borderBottom: "1px solid #f3e8ff" }, children: [
                                    h("td", { key: "ev", style: { padding: "6px 8px", fontWeight: 600, verticalAlign: "middle" }, children: m.tipoEvento }),
                                    h("td", { key: "dt", style: { padding: "6px 8px", color: "#6b7280", verticalAlign: "middle", whiteSpace: "nowrap" }, children: fmtDT(m.transmitidoEm) }),
                                    h("td", { key: "por", style: { padding: "6px 8px", color: "#6b7280", verticalAlign: "middle" }, children: m.transmitidoPor }),
                                    h("td", { key: "pr", style: { padding: "6px 8px", fontFamily: "monospace", fontSize: "11px", color: "#9ca3af", verticalAlign: "middle" }, children: m.protocolo }),
                                ]}))
                            })
                        })
                    }) : null,
                ]})
            }),
        ]}),
    ]});
}

// ── MODAL MANIFESTAÇÃO ──
const TIPOS_EV = [
    { value: "CIENCIA", label: "Ciência da Operação" },
    { value: "CONFIRMACAO", label: "Confirmação da Operação" },
    { value: "OPERACAO_NAO_REALIZADA", label: "Operação Não Realizada" },
    { value: "DESCONHECIMENTO", label: "Desconhecimento da Operação" },
];
function ModalManif({ nfe, onClose, onSalvar }) {
    const [tipo, setTipo] = React.useState("CIENCIA");
    const [just, setJust] = React.useState("");
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState("");
    const altoRisco = Number(nfe?.scoreRisco ?? nfe?.score ?? 0) >= 51;
    const chave = nfe?.chaveAcesso || nfe?.chave || "";
    const salvar = async () => {
        if (altoRisco && !just.trim()) { setErro("Justificativa obrigatória para risco alto."); return; }
        setSalvando(true); setErro("");
        try {
            await apiFetch(`/api/fiscal/nfe/${encodeURIComponent(chave)}/manifestar`, { method: "POST", body: JSON.stringify({ tipoEvento: tipo, justificativa: just }) });
            onSalvar();
        } catch (e) { setErro(e.message); } finally { setSalvando(false); }
    };
    return h("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }, onClick: onClose, children:
        h("div", { style: { background: "#fff", borderRadius: "10px", padding: "28px", width: "480px", maxWidth: "95vw", boxShadow: "0 8px 32px rgba(0,0,0,.18)" }, onClick: e => e.stopPropagation(), children:
            hs("div", { style: { display: "flex", flexDirection: "column", gap: "14px" }, children: [
                h("h2", { key: "h", style: { fontSize: "16px", fontWeight: 700, margin: 0 }, children: "Manifestar NF-e" }),
                altoRisco ? h("div", { key: "w", style: { background: "#fef3c7", color: "#92400e", padding: "10px", borderRadius: "6px", fontSize: "13px" }, children: "Atenção: risco ALTO/CRÍTICO. Justificativa obrigatória." }) : null,
                hs("div", { key: "f1", children: [
                    h("label", { key: "l", style: { fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "4px" }, children: "Tipo de Evento" }),
                    h("select", { key: "s", value: tipo, onChange: e => setTipo(e.target.value), style: { width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px" }, children: TIPOS_EV.map(t => h("option", { key: t.value, value: t.value, children: t.label })) }),
                ]}),
                hs("div", { key: "f2", children: [
                    h("label", { key: "l", style: { fontSize: "13px", fontWeight: 600, display: "block", marginBottom: "4px" }, children: altoRisco ? "Justificativa (obrigatória)" : "Justificativa (opcional)" }),
                    h("textarea", { key: "ta", value: just, onChange: e => setJust(e.target.value), rows: 3, placeholder: "Descreva o motivo...", style: { width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px", resize: "vertical", boxSizing: "border-box" } }),
                ]}),
                erro ? h("p", { key: "err", style: { fontSize: "13px", color: "#dc2626", margin: 0 }, children: erro }) : null,
                hs("div", { key: "btns", style: { display: "flex", justifyContent: "flex-end", gap: "8px" }, children: [
                    h(Button, { key: "c", variant: "outline", onClick: onClose, children: "Cancelar" }),
                    h(Button, { key: "s", onClick: salvar, disabled: salvando, children: salvando ? "Enviando..." : "Manifestar" }),
                ]}),
            ]})
        })
    });
}

// ── MODAL CADASTRO FORNECEDOR — NF-e ──
function ModalCadastroFornecNfe({ nfe, onClose, onCadastrado }) {
    const [dados, setDados] = React.useState(null);
    const [carregando, setCarregando] = React.useState(true);
    const [erro, setErro] = React.useState("");
    const [salvando, setSalvando] = React.useState(false);
    const [simplesnacional, setSimplesnacional] = React.useState("N");
    const chave = nfe?.chaveAcesso || nfe?.chave || "";

    React.useEffect(() => {
        if (!chave) return;
        setCarregando(true); setErro("");
        apiFetch(`/api/fiscal/nfe/${encodeURIComponent(chave)}/dados-emitente`)
            .then(r => { setDados(r); setSimplesnacional(r.simplesnacional || "N"); })
            .catch(e => setErro(e.message))
            .finally(() => setCarregando(false));
    }, [chave]);

    const cadastrar = async () => {
        if (!dados) return;
        setSalvando(true); setErro("");
        try {
            const res = await apiFetch("/api/fiscal/fornecedores/cadastrar", { method: "POST", body: JSON.stringify({ tipoDfe: "NFE", chaveAcesso: chave, dadosEmitente: { ...dados, simplesnacional } }) });
            onCadastrado(res);
        } catch (e) { setErro(e.message); } finally { setSalvando(false); }
    };

    const infoRow = (label, value) => hs("div", { style: { display: "flex", gap: "8px", fontSize: "13px", marginBottom: "4px" }, children: [
        h("span", { key: "l", style: { color: "#6b7280", minWidth: "130px", flexShrink: 0 }, children: label }),
        h("span", { key: "v", style: { fontWeight: 500, wordBreak: "break-all" }, children: value || "—" }),
    ]});

    return h("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center" }, onClick: onClose, children:
        h("div", { style: { background: "#fff", borderRadius: "10px", padding: "28px", width: "520px", maxWidth: "95vw", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,.18)" }, onClick: e => e.stopPropagation(), children:
            hs("div", { style: { display: "flex", flexDirection: "column", gap: "14px" }, children: [
                h("h2", { key: "h", style: { fontSize: "16px", fontWeight: 700, margin: 0 }, children: "Cadastrar Fornecedor no WinThor" }),
                carregando ? h("p", { key: "ld", style: { color: "#9ca3af", fontSize: "13px" }, children: "Carregando dados do XML…" }) : null,
                erro ? h("p", { key: "er", style: { color: "#dc2626", fontSize: "13px", margin: 0 }, children: erro }) : null,
                dados && !carregando ? hs("div", { key: "dados", style: { background: "#f9fafb", padding: "12px", borderRadius: "8px" }, children: [
                    infoRow("CNPJ", dados.cnpj),
                    infoRow("Razão Social", dados.nome),
                    infoRow("Fantasia", dados.fantasia),
                    infoRow("IE", dados.ie),
                    infoRow("CNAE", dados.cnae),
                    infoRow("Logradouro", dados.logradouro && dados.numero ? `${dados.logradouro}, ${dados.numero}` : dados.logradouro),
                    infoRow("Bairro", dados.bairro),
                    infoRow("Cidade / UF", dados.cidade && dados.uf ? `${dados.cidade} / ${dados.uf}` : (dados.cidade || dados.uf)),
                    infoRow("CEP", dados.cep),
                    infoRow("Fone", dados.fone),
                    infoRow("Tipo", "C — Mercadoria (NF-e)"),
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

// ── MODAL CADASTRO PRODUTO — NF-e ──
function ModalCadastroProduto({ item, chaveAcesso, codfornec, onClose, onCadastrado }) {
    const [departamentos, setDepartamentos] = React.useState([]);
    const [secoes, setSecoes] = React.useState([]);
    const [filiais, setFiliais] = React.useState([]);
    const [carregandoDep, setCarregandoDep] = React.useState(true);
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState("");
    const [aviso, setAviso] = React.useState("");

    const ncmItem = String(item?.ncm || item?.nbm || "").replace(/\D/g, "").slice(0, 8);
    const descricaoInicial = String(item?.descricao || "").trim().toUpperCase().slice(0, 40);
    const embalagemInicial = String(item?.unidade || "UN").trim().toUpperCase().slice(0, 12);
    const eanInicial = (() => { const e = String(item?.ean || "").replace(/\D/g, ""); return (e && e !== "0" && e.length >= 8) ? e : ""; })();
    const eanTribInicial = (() => { const e = String(item?.eanTrib || "").replace(/\D/g, ""); return (e && e !== "0" && e.length >= 8) ? e : ""; })();

    const [form, setForm] = React.useState({
        descricao:  descricaoInicial,
        embalagem:  embalagemInicial,
        codean:     eanInicial,
        codean2:    eanTribInicial,
        codepto:    "",
        codsec:     "",
        filiaisSel: [],
    });
    const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

    React.useEffect(() => {
        setCarregandoDep(true);
        Promise.all([
            apiFetch("/api/fiscal/produtos/departamentos").then(r => r.departamentos || []).catch(() => []),
            apiFetch("/api/fiscal/tributos/filiais").then(r => r.filiais || []).catch(() => []),
        ]).then(([deps, fils]) => {
            setDepartamentos(deps);
            setFiliais(fils);
        }).catch(e => setErro(e.message)).finally(() => setCarregandoDep(false));
    }, []);

    React.useEffect(() => {
        if (!form.codepto) { setSecoes([]); return; }
        apiFetch(`/api/fiscal/produtos/secoes?codepto=${form.codepto}`)
            .then(r => setSecoes(r.secoes || []))
            .catch(() => setSecoes([]));
        setF("codsec", "");
    }, [form.codepto]);

    const toggleFilial = (cod) => {
        setForm(p => {
            const s = p.filiaisSel.includes(cod) ? p.filiaisSel.filter(x => x !== cod) : [...p.filiaisSel, cod];
            return { ...p, filiaisSel: s };
        });
    };

    const cadastrar = async () => {
        if (!form.descricao.trim()) { setErro("Descrição é obrigatória."); return; }
        if (!form.embalagem.trim()) { setErro("Embalagem é obrigatória."); return; }
        if (!form.codepto) { setErro("Selecione o departamento."); return; }
        if (!form.codsec)  { setErro("Selecione a seção."); return; }
        if (!codfornec)    { setErro("Fornecedor não cadastrado no WinThor. Cadastre o fornecedor primeiro."); return; }

        setSalvando(true); setErro(""); setAviso("");
        try {
            const res = await apiFetch("/api/fiscal/produtos/cadastrar", {
                method: "POST",
                body: JSON.stringify({
                    chaveAcesso,
                    descricao:          form.descricao.trim().toUpperCase(),
                    embalagem:          form.embalagem.trim().toUpperCase(),
                    unidade:            item?.unidade ? String(item.unidade).trim().toUpperCase().slice(0, 2) : null,
                    codepto:            Number(form.codepto),
                    codsec:             Number(form.codsec),
                    codfornec:          Number(codfornec),
                    nbm:                ncmItem || null,
                    codean:             form.codean || null,
                    codean2:            form.codean2 || null,
                    codfab:             item?.codProd || null,
                    qtunitcx:           item?.quantidadeTrib ? Number(item.quantidadeTrib) : 1,
                    qtunit:             item?.quantidade ? Number(item.quantidade) : 1,
                    pesobruto:          item?.pesobruto ? Number(item.pesobruto) : 1,
                    pesoliq:            item?.pesoliq ? Number(item.pesoliq) : 1,
                    filiais:            form.filiaisSel.map(String),
                }),
            });
            if (res.ja_cadastrado) {
                setAviso(`Produto já existe no WinThor — cód. ${res.codprod}: ${res.descricao}`);
                setSalvando(false); return;
            }
            onCadastrado(res);
        } catch (e) { setErro(e.message); } finally { setSalvando(false); }
    };

    const lbStyle = { fontSize: "12px", fontWeight: 600, color: "#374151", display: "block", marginBottom: "4px" };
    const inStyle = { width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px", boxSizing: "border-box" };

    return h("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center" }, onClick: onClose, children:
        h("div", { style: { background: "#fff", borderRadius: "10px", padding: "28px", width: "640px", maxWidth: "97vw", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,.2)" }, onClick: e => e.stopPropagation(), children:
            hs("div", { style: { display: "flex", flexDirection: "column", gap: "14px" }, children: [
                hs("div", { key: "hdr", style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" }, children: [
                    hs("div", { key: "t", children: [
                        h("h2", { key: "h", style: { fontSize: "16px", fontWeight: 700, margin: "0 0 2px 0" }, children: "Cadastrar Produto no WinThor" }),
                        h("p",  { key: "s", style: { fontSize: "12px", color: "#6b7280", margin: 0 }, children: `Item ${item?.seq ?? ""}: ${item?.codProd || "—"}` }),
                    ]}),
                    h("button", { key: "x", onClick: onClose, style: { border: "none", background: "none", fontSize: "22px", cursor: "pointer", color: "#9ca3af", lineHeight: 1 }, children: "×" }),
                ]}),

                h("div", { key: "inf", style: { background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "8px", padding: "10px 12px", fontSize: "12px", color: "#0c4a6e" }, children:
                    hs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px" }, children: [
                        hs("span", { key: "a", children: [h("b", { key: "l", children: "EAN: " }), item?.ean && item.ean !== "SEM GTIN" && item.ean !== "0" ? item.ean : "Sem GTIN"] }),
                        hs("span", { key: "b", children: [h("b", { key: "l", children: "Cód.Forn.: " }), item?.codProd || "—"] }),
                        hs("span", { key: "c", children: [h("b", { key: "l", children: "Qtd: " }), fmtN(item?.quantidade)] }),
                        hs("span", { key: "d", children: [h("b", { key: "l", children: "Vl.Unit.: " }), fmt(item?.valorUnitario)] }),
                        hs("span", { key: "e", children: [h("b", { key: "l", children: "NCM: " }), ncmItem || "—"] }),
                        hs("span", { key: "f", children: [h("b", { key: "l", children: "CFOP: " }), item?.cfop || "—"] }),
                    ]}),
                }),

                !codfornec ? h("div", { key: "wfornec", style: { background: "#fef3c7", color: "#92400e", padding: "10px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 500 }, children: "Atenção: o fornecedor desta NF-e não está cadastrado no WinThor. Cadastre o fornecedor antes de cadastrar produtos." }) : null,

                hs("div", { key: "fdesc", children: [
                    h("label", { key: "l", style: lbStyle, children: `Descrição (máx 40 caracteres) — ${form.descricao.length}/40` }),
                    h("input", { key: "i", type: "text", maxLength: 40, value: form.descricao, onChange: e => setF("descricao", e.target.value.toUpperCase()), style: inStyle }),
                ]}),

                hs("div", { key: "femb", children: [
                    h("label", { key: "l", style: lbStyle, children: "Embalagem (máx 12 caracteres)" }),
                    h("input", { key: "i", type: "text", maxLength: 12, value: form.embalagem, onChange: e => setF("embalagem", e.target.value.toUpperCase()), style: inStyle }),
                ]}),

                hs("div", { key: "fean", style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }, children: [
                    hs("div", { key: "e1", children: [
                        h("label", { key: "l", style: lbStyle, children: "Cód. de Barras — EAN (cEAN)" }),
                        h("input", { key: "i", type: "text", value: form.codean, onChange: e => setF("codean", e.target.value.replace(/\D/g, "")), style: inStyle, placeholder: "ex: 7898941300011" }),
                    ]}),
                    hs("div", { key: "e2", children: [
                        h("label", { key: "l", style: lbStyle, children: "EAN Tributário — caixa (cEANTrib)" }),
                        h("input", { key: "i", type: "text", value: form.codean2, onChange: e => setF("codean2", e.target.value.replace(/\D/g, "")), style: inStyle, placeholder: "ex: 17898941300018" }),
                    ]}),
                ]}),

                carregandoDep
                    ? h("p", { key: "ldep", style: { fontSize: "13px", color: "#9ca3af" }, children: "Carregando dados…" })
                    : hs("div", { key: "fdep", children: [
                        h("label", { key: "l", style: lbStyle, children: "Departamento" }),
                        h("select", { key: "s", value: form.codepto, onChange: e => setF("codepto", e.target.value), style: inStyle, children: [
                            h("option", { key: "0", value: "", children: "Selecione…" }),
                            ...departamentos.map(d => h("option", { key: d.codepto, value: d.codepto, children: `${d.codepto} — ${d.descricao}` })),
                        ]}),
                    ]}),

                form.codepto ? hs("div", { key: "fsec", children: [
                    h("label", { key: "l", style: lbStyle, children: "Seção" }),
                    h("select", { key: "s", value: form.codsec, onChange: e => setF("codsec", e.target.value), style: inStyle, children: [
                        h("option", { key: "0", value: "", children: secoes.length ? "Selecione…" : "Carregando…" }),
                        ...secoes.map(s => h("option", { key: s.codsec, value: s.codsec, children: `${s.codsec} — ${s.descricao}` })),
                    ]}),
                ]}) : null,

                // ── Filiais ──
                filiais.length > 0 ? hs("div", { key: "ffiliais", style: { background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "12px" }, children: [
                    hs("div", { key: "hf", style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }, children: [
                        h("p", { key: "t", style: { fontSize: "12px", fontWeight: 700, color: "#374151", margin: 0 }, children: `Filiais (${form.filiaisSel.length}/${filiais.length} selecionadas)` }),
                        hs("div", { key: "bts", style: { display: "flex", gap: "6px" }, children: [
                            h("button", { key: "all", type: "button", onClick: () => setF("filiaisSel", filiais.map(f => String(f.codfilial))), style: { fontSize: "11px", padding: "2px 8px", borderRadius: "4px", border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }, children: "Todas" }),
                            h("button", { key: "none", type: "button", onClick: () => setF("filiaisSel", []), style: { fontSize: "11px", padding: "2px 8px", borderRadius: "4px", border: "1px solid #d1d5db", background: "#fff", cursor: "pointer" }, children: "Nenhuma" }),
                        ]}),
                    ]}),
                    h("div", { key: "grid", style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "4px", maxHeight: "180px", overflowY: "auto" }, children:
                        filiais.map(f => {
                            const cod = String(f.codfilial);
                            const sel = form.filiaisSel.includes(cod);
                            return hs("label", { key: cod, style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", cursor: "pointer", padding: "3px 4px", borderRadius: "4px", background: sel ? "#dbeafe" : "transparent" }, children: [
                                h("input", { key: "cb", type: "checkbox", checked: sel, onChange: () => toggleFilial(cod), style: { cursor: "pointer" } }),
                                `${f.codfilial} — ${f.descricao}${f.uf ? ` (${f.uf})` : ""}`,
                            ]});
                        })
                    }),
                ]}) : null,

                aviso ? h("div", { key: "av", style: { background: "#fef9c3", color: "#713f12", padding: "10px 12px", borderRadius: "6px", fontSize: "13px", fontWeight: 500 }, children: aviso }) : null,
                erro  ? h("p",   { key: "er", style: { fontSize: "13px", color: "#dc2626", margin: 0 }, children: erro }) : null,

                hs("div", { key: "btns", style: { display: "flex", justifyContent: "flex-end", gap: "8px", paddingTop: "4px" }, children: [
                    h(Button, { key: "c", variant: "outline", onClick: onClose, children: "Cancelar" }),
                    h(Button, { key: "s", onClick: cadastrar, disabled: salvando || !codfornec, children: salvando ? "Cadastrando…" : "Cadastrar no WinThor" }),
                ]}),
            ]})
        })
    });
}

// ── MODAL CRIAR PEDIDO DE COMPRA — NF-e ──
function ModalCriarPedido({ doc, chaveAcesso, codfornec, onClose, onCriado }) {
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState("");
    const [obs, setObs] = React.useState("");
    const itensNfe = doc?.itens || [];

    const [overrides, setOverrides] = React.useState(() => {
        const o = {};
        itensNfe.forEach((it, i) => { o[i] = { qtpedida: it.quantidade || 1, pcompra: it.valorUnitario || 0 }; });
        return o;
    });

    const setQty  = (i, v) => setOverrides(p => ({ ...p, [i]: { ...p[i], qtpedida: v } }));
    const setPrec = (i, v) => setOverrides(p => ({ ...p, [i]: { ...p[i], pcompra: v } }));

    const vltotal = itensNfe.reduce((s, it, i) => {
        const o = overrides[i] || {};
        return s + (Number(o.qtpedida || 0) * Number(o.pcompra || 0));
    }, 0);

    const criar = async () => {
        if (itensNfe.length === 0) { setErro("Nenhum item carregado. Aguarde o Nível 2 carregar os produtos."); return; }
        setSalvando(true); setErro("");
        try {
            const itensPayload = itensNfe.map((it, i) => {
                const o = overrides[i] || {};
                const codprodNum = Number(it.codProd) > 0 ? Number(it.codProd) : null;
                return {
                    codprod: codprodNum,
                    ean: it.ean && it.ean !== "SEM GTIN" && it.ean !== "0" ? it.ean : null,
                    qtpedida: Number(o.qtpedida) || it.quantidade || 0,
                    pcompra:  Number(o.pcompra)  || it.valorUnitario || 0,
                };
            });
            const codfilialDest = doc?.destinatario?.filialCodigo || doc?.codfilial || "1";
            const res = await apiFetch("/api/fiscal/pedidos/criar", {
                method: "POST",
                body: JSON.stringify({ chaveAcesso, codfornec, codfilial: codfilialDest, vltotal, obs: obs || null, itens: itensPayload }),
            });
            onCriado(res);
        } catch (e) { setErro(e.message); } finally { setSalvando(false); }
    };

    const thS = { padding: "6px 8px", fontSize: "11px", fontWeight: 700, background: "#e0e7ff", whiteSpace: "nowrap" };
    const tdS = { padding: "5px 8px", fontSize: "12px", verticalAlign: "middle", borderBottom: "1px solid #f3f4f6" };
    const inpS = { width: "80px", padding: "3px 6px", borderRadius: "4px", border: "1px solid #d1d5db", fontSize: "12px", textAlign: "right" };

    return h("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", zIndex: 1300, display: "flex", alignItems: "center", justifyContent: "center" }, onClick: onClose, children:
        h("div", { style: { background: "#fff", borderRadius: "10px", padding: "24px", width: "800px", maxWidth: "97vw", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,.22)" }, onClick: e => e.stopPropagation(), children:
            hs("div", { style: { display: "flex", flexDirection: "column", gap: "14px" }, children: [
                hs("div", { key: "hdr", style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
                    h("h2", { key: "h", style: { fontSize: "16px", fontWeight: 700, margin: 0 }, children: "Criar Pedido de Compra no WinThor" }),
                    h("button", { key: "x", onClick: onClose, style: { border: "none", background: "none", fontSize: "22px", cursor: "pointer", color: "#9ca3af", lineHeight: 1 }, children: "×" }),
                ]}),
                !codfornec ? h("div", { key: "wf", style: { background: "#fef3c7", color: "#92400e", padding: "10px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 500 }, children: "Atenção: fornecedor não cadastrado no WinThor. Cadastre-o primeiro." }) : null,
                itensNfe.length === 0 ? h("div", { key: "wno", style: { background: "#fef3c7", color: "#92400e", padding: "10px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 500 }, children: "Nenhum item carregado. Feche, aguarde o Nível 2 exibir os produtos e tente novamente." }) : null,
                itensNfe.length > 0 ? hs("div", { key: "tab", style: { overflowX: "auto" }, children: [
                    h("p", { key: "hint", style: { fontSize: "11px", color: "#6b7280", margin: "0 0 6px" }, children: "Ajuste quantidade e preço se necessário. O CODPROD WinThor é resolvido pelo EAN automaticamente." }),
                    h("table", { key: "t", style: { width: "100%", borderCollapse: "collapse", fontSize: "12px" }, children: [
                        h("thead", { key: "th", children:
                            h("tr", { children: ["#","Cód.Forn./EAN","Descrição","Un","Qtd","Vl.Compra","Total"].map(c =>
                                h("th", { key: c, style: { ...thS, textAlign: ["Qtd","Vl.Compra","Total"].includes(c) ? "right" : "left" }, children: c })
                            )})
                        }),
                        h("tbody", { key: "tb", children: itensNfe.map((it, i) => {
                            const o = overrides[i] || {};
                            const tot = Number(o.qtpedida || 0) * Number(o.pcompra || 0);
                            return h("tr", { key: i, style: { background: i%2 ? "#fafafa" : "#fff" }, children: [
                                h("td", { key:"s",  style: tdS, children: String(it.seq ?? i+1) }),
                                h("td", { key:"c",  style: { ...tdS, fontFamily:"monospace", fontSize:"11px" }, children: hs("div", { children: [
                                    h("div", { key:"cp", children: it.codProd || "—" }),
                                    it.ean && it.ean !== "SEM GTIN" && it.ean !== "0" ? h("div", { key:"ea", style: { color: "#9ca3af", fontSize: "10px" }, children: it.ean }) : null,
                                ]}) }),
                                h("td", { key:"d",  style: { ...tdS, maxWidth:"200px", fontWeight:500 }, children: it.descricao || "—" }),
                                h("td", { key:"u",  style: tdS, children: it.unidade || "—" }),
                                h("td", { key:"q",  style: { ...tdS, textAlign:"right" }, children: h("input", { type:"number", min:0, step:"0.001", value: o.qtpedida ?? "", onChange: e => setQty(i, e.target.value), style: inpS }) }),
                                h("td", { key:"p",  style: { ...tdS, textAlign:"right" }, children: h("input", { type:"number", min:0, step:"0.01",  value: o.pcompra  ?? "", onChange: e => setPrec(i, e.target.value), style: inpS }) }),
                                h("td", { key:"t",  style: { ...tdS, textAlign:"right", fontWeight:600 }, children: fmt(tot) }),
                            ]});
                        }) }),
                        h("tfoot", { key: "tf", children:
                            h("tr", { style: { background: "#e0e7ff", fontWeight: 700 }, children: [
                                h("td", { key:"a", colSpan: 6, style: { padding: "8px", textAlign: "right", fontSize: "13px" }, children: `${itensNfe.length} item(ns) — TOTAL:` }),
                                h("td", { key:"b", style: { padding: "8px", textAlign: "right", fontSize: "13px" }, children: fmt(vltotal) }),
                            ]})
                        }),
                    ]}),
                ]}) : null,
                hs("div", { key: "fobs", children: [
                    h("label", { key: "l", style: { fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }, children: "Observação (opcional)" }),
                    h("input", { key: "i", type: "text", value: obs, onChange: e => setObs(e.target.value), placeholder: "Ex: NF-e 001234 jan/2025", style: { width: "100%", padding: "7px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px", boxSizing: "border-box" } }),
                ]}),
                erro ? h("p", { key: "er", style: { color: "#dc2626", fontSize: "13px", margin: 0 }, children: erro }) : null,
                hs("div", { key: "btns", style: { display: "flex", justifyContent: "flex-end", gap: "8px" }, children: [
                    h(Button, { key: "c", variant: "outline", onClick: onClose, children: "Cancelar" }),
                    h(Button, { key: "s", onClick: criar, disabled: salvando || !codfornec || itensNfe.length === 0, children: salvando ? "Criando pedido…" : `Criar Pedido (${fmt(vltotal)})` }),
                ]}),
            ]})
        })
    });
}

// ── PAINEL ITENS NF-e (sub-row inline) ──
function PainelItensNFe({ doc, loading, erro, onCadastrarProduto, valorTotalNota }) {
    const thS = { padding: "6px 10px", textAlign: "left", fontWeight: 700, fontSize: "11px", color: "#374151", whiteSpace: "nowrap", borderBottom: "2px solid #d1d5db", background: "#e8f0fe" };
    const tdS = { padding: "5px 10px", verticalAlign: "middle", fontSize: "12px", borderBottom: "1px solid #f3f4f6" };
    const tdR = { ...tdS, textAlign: "right" };

    if (loading) return h("div", { style: { padding: "16px 0", color: "#6b7280", fontSize: "12px" }, children: "Carregando itens..." });
    if (erro) return h("div", { style: { padding: "12px 0", color: "#dc2626", fontSize: "12px" }, children: `Erro: ${erro}` });
    const itens = doc?.itens || [];
    if (itens.length === 0) {
        const erros = doc?.errosItens || [];
        const fonte = doc?.fonteItens;
        return hs("div", { style: { padding: "12px 0" }, children: [
            h("p", { key: "msg", style: { color: "#6b7280", fontSize: "12px", margin: "0 0 6px" }, children: "Nenhum item encontrado para esta nota. Execute Sincronizar para atualizar os dados do WinThor." }),
            fonte ? h("p", { key: "fonte", style: { color: "#6b7280", fontSize: "11px", margin: "0 0 4px" }, children: `Fonte usada: ${fonte}` }) : null,
            erros.length > 0 ? hs("ul", { key: "erros", style: { margin: "4px 0 0 16px", padding: 0, listStyle: "disc", color: "#b45309", fontSize: "11px" }, children:
                erros.map((e, i) => h("li", { key: i, children: e }))
            }) : null,
        ]});
    }

    const totalItens = itens.reduce((s, it) => s + Number(it.valorTotal || 0), 0);
    const valorNota = Number(valorTotalNota || 0);
    const divergencia = valorNota > 0 && Math.abs(totalItens - valorNota) > 0.05;

    return hs("div", { style: { overflowX: "auto" }, children: [
        divergencia ? hs("div", { key: "alerta", style: { display: "flex", alignItems: "center", gap: "8px", background: "#fef9c3", border: "1px solid #f59e0b", borderRadius: "6px", padding: "6px 12px", marginBottom: "8px", fontSize: "12px", color: "#92400e" }, children: [
            h("span", { key: "ic", style: { fontWeight: 700 }, children: "⚠ Divergência de valor:" }),
            h("span", { key: "ni", children: `Itens somam ${fmt(totalItens)}` }),
            h("span", { key: "sep", style: { color: "#b45309" }, children: "×" }),
            h("span", { key: "nc", children: `Cabeçalho da nota: ${fmt(valorNota)}` }),
            h("span", { key: "info", style: { color: "#b45309", fontStyle: "italic" }, children: "— Os itens exibidos podem ser de outra NF-e com o mesmo número. Sincronize para atualizar." }),
        ]}) : null,
        hs("table", { key: "tbl", style: { width: "100%", borderCollapse: "collapse", fontSize: "12px" }, children: [
            h("thead", { key: "th", children: h("tr", { children: [
                h("th", { key: "seq", style: thS, children: "#" }),
                h("th", { key: "cod", style: thS, children: "Cód." }),
                h("th", { key: "ean", style: thS, children: "EAN" }),
                h("th", { key: "desc", style: { ...thS, minWidth: "200px" }, children: "Descrição" }),
                h("th", { key: "un", style: thS, children: "Unid." }),
                h("th", { key: "qt", style: { ...thS, textAlign: "right" }, children: "Qtde" }),
                h("th", { key: "vu", style: { ...thS, textAlign: "right" }, children: "Vl. Unit." }),
                h("th", { key: "vt", style: { ...thS, textAlign: "right" }, children: "Total" }),
                h("th", { key: "cfop", style: thS, children: "CFOP" }),
                h("th", { key: "cst", style: thS, children: "CST" }),
                h("th", { key: "ac", style: { ...thS, textAlign: "center" }, children: "" }),
            ]}) }),
            h("tbody", { key: "tb", children:
                itens.map((it, idx) =>
                    hs("tr", { key: it.id || idx, style: { background: idx % 2 === 0 ? "#fff" : "#f8fafc" }, children: [
                        h("td", { key: "seq", style: { ...tdS, color: "#9ca3af" }, children: String(it.seq ?? idx + 1) }),
                        h("td", { key: "cod", style: { ...tdS, fontFamily: "monospace" }, children: it.codProd || "—" }),
                        h("td", { key: "ean", style: { ...tdS, fontFamily: "monospace", color: "#4b5563" }, children: it.ean && it.ean !== "SEM GTIN" && it.ean !== "0" ? it.ean : "—" }),
                        h("td", { key: "desc", style: { ...tdS, maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: it.descricao || "", children: it.descricao || "—" }),
                        h("td", { key: "un", style: tdS, children: it.unidade || "—" }),
                        h("td", { key: "qt", style: tdR, children: Number(it.quantidade || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) }),
                        h("td", { key: "vu", style: tdR, children: fmt(it.valorUnitario) }),
                        h("td", { key: "vt2", style: { ...tdR, fontWeight: 600 }, children: fmt(it.valorTotal) }),
                        h("td", { key: "cfop", style: { ...tdS, fontFamily: "monospace" }, children: it.cfop || "—" }),
                        h("td", { key: "cst", style: tdS, children: it.cstIcms || it.cst || "—" }),
                        h("td", { key: "ac", style: { ...tdS, textAlign: "center" }, children:
                            it.produtoCadastrado
                                ? h("span", { style: { background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap" }, children: "✓ Cadastrado" })
                                : h("button", { style: { fontSize: "11px", padding: "2px 10px", borderRadius: "5px", border: "1px solid #2563eb", background: "#eff6ff", color: "#1d4ed8", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }, onClick: e => { e.stopPropagation(); onCadastrarProduto(it); }, children: "Cadastrar" })
                        }),
                    ]})
                )
            }),
            h("tfoot", { key: "tf", children:
                h("tr", { style: { background: "#f0f7ff", borderTop: "2px solid #bfdbfe" }, children: [
                    h("td", { key: "lbl", colSpan: 7, style: { ...tdS, fontWeight: 700, color: "#1e40af", textAlign: "right", borderBottom: "none" }, children: "Total dos Itens:" }),
                    h("td", { key: "tot", style: { ...tdR, fontWeight: 700, color: divergencia ? "#dc2626" : "#166534", fontSize: "13px", borderBottom: "none" }, children: fmt(totalItens) }),
                    h("td", { key: "sp1", colSpan: 3, style: { ...tdS, borderBottom: "none" }, children:
                        valorNota > 0 ? hs("span", { style: { fontSize: "11px", color: divergencia ? "#dc2626" : "#16a34a", fontWeight: 600 }, children: [
                            divergencia ? "⚠ " : "✓ ",
                            `Nota: ${fmt(valorNota)}`,
                        ]}) : null
                    }),
                ]})
            }),
        ]}),
    ]});
}

function LinhaExpandidaNFe({ chave, doc, loading, erro, colSpan, codfornec, onCadastrarProduto, valorTotalNota }) {
    return h("tr", { children:
        h("td", { colSpan, style: { padding: 0, background: "#f0f7ff", borderBottom: "2px solid #3b82f6", borderTop: "none" }, children:
            hs("div", { style: { padding: "12px 16px 16px 44px" }, children: [
                h("div", { key: "hdr", style: { fontSize: "11px", fontWeight: 700, color: "#1d4ed8", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.04em" }, children: "Itens da Nota" }),
                h(PainelItensNFe, { key: "itens", doc, loading, erro, onCadastrarProduto, valorTotalNota }),
            ]})
        })
    });
}

// ── PÁGINA PRINCIPAL ──
export default function FiscalNFePage() {
    const [dados, setDados] = React.useState({ items: [], total: 0 });
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState("");
    const [pagina, setPagina] = React.useState(1);
    const [filtros, setFiltros] = React.useState({ busca: "", statusSefaz: "", statusManifestacao: "", statusRisco: "", dataInicio: "", dataFim: "", codfilial: "", apenasSemPedido: false, apenasCancelados: false, incluirEntradas: false });
    const [manifestarNfe, setManifestarNfe] = React.useState(null);
    const [exportando, setExportando] = React.useState(false);
    const [fornecStatus, setFornecStatus] = React.useState({});
    const [modalFornec, setModalFornec] = React.useState(null);
    const [modalProduto, setModalProduto] = React.useState(null);
    const [expandedChave, setExpandedChave] = React.useState(null);
    const [expandedDoc, setExpandedDoc] = React.useState(null);
    const [expandedLoading, setExpandedLoading] = React.useState(false);
    const [expandedError, setExpandedError] = React.useState(null);

    function toggleDetalhe(chave) {
        if (expandedChave === chave) { setExpandedChave(null); setExpandedDoc(null); return; }
        setExpandedChave(chave); setExpandedDoc(null); setExpandedLoading(true); setExpandedError(null);
        apiFetch(`/api/fiscal/nfe/${encodeURIComponent(chave)}`)
            .then(d => { setExpandedDoc(d); setExpandedLoading(false); })
            .catch(e => { setExpandedError(e.message); setExpandedLoading(false); });
    }

    const carregar = React.useCallback(async (f, pg) => {
        setErro(""); setLoading(true);
        try {
            const d = await apiFetch(`/api/fiscal/nfe${bq({ ...f, page: pg || 1, pageSize: 50 })}`);
            setDados(d || { items: [], total: 0 });
            const itensCarregados = (d?.items || d?.nfes || []);
            const cnpjs = [...new Set(itensCarregados.map(n => String(n.emitente?.cnpj || n.cnpjEmitente || "").replace(/\D/g, "")).filter(c => c.length >= 11))];
            if (cnpjs.length > 0) {
                apiFetch("/api/fiscal/fornecedores/verificar-cadastro", { method: "POST", body: JSON.stringify({ cnpjs }) })
                    .then(r => setFornecStatus(r.resultado || {}))
                    .catch(() => {});
            }
        } catch (e) { setErro(e.message); } finally { setLoading(false); }
    }, []);
    React.useEffect(() => { carregar(filtros, 1); }, []);
    const filtrar = () => { setPagina(1); carregar(filtros, 1); };
    const setF = (k, v) => setFiltros(p => ({ ...p, [k]: v }));

    const [sincronizando, setSincronizando] = React.useState(false);
    const [sincronizandoSefaz, setSincronizandoSefaz] = React.useState(false);
    const [msgSync, setMsgSync] = React.useState("");

    const sincronizar = async () => {
        setSincronizando(true); setMsgSync(""); setErro("");
        try {
            const r = await apiFetch("/api/fiscal/sync/nfe", { method: "POST", body: JSON.stringify({ diasRetroativos: 60 }) });
            setMsgSync(r.mensagem || `Sincronizado: ${r.importados ?? 0} notas lançadas, ${r.pendentes ?? 0} pendentes de entrada.`);
            carregar(filtros, 1);
        } catch (e) { setErro(`Erro ao sincronizar: ${e.message}`); } finally { setSincronizando(false); }
    };

    const sincronizarSefaz = async () => {
        setSincronizandoSefaz(true); setMsgSync(""); setErro("");
        try {
            const r = await apiFetch("/api/fiscal/sync/sefaz", { method: "POST", body: JSON.stringify({ maxLotes: 30 }) });
            setMsgSync(r.mensagem || `SEFAZ: ${r.novosDocs ?? 0} notas novas, ${r.pendentesWinthor ?? 0} pendentes de entrada.`);
            carregar(filtros, 1);
        } catch (e) { setErro(`Erro ao sincronizar SEFAZ: ${e.message}`); } finally { setSincronizandoSefaz(false); }
    };

    const exportarCsv = async () => {
        setExportando(true);
        try {
            const res = await fetch(`/api/fiscal/exportar/nfe-csv${bq(filtros)}`, { headers: { Authorization: `Bearer ${getToken()}` } });
            const blob = await res.blob(); const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = `nfe-${new Date().toISOString().slice(0,10)}.csv`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        } catch (e) { setErro(e.message); } finally { setExportando(false); }
    };

    const nfes = dados.items || dados.nfes || [];
    const totVal = nfes.reduce((s, n) => s + Number(n.valorTotal ?? n.valor ?? 0), 0);
    const pendMf = nfes.filter(n => !n.statusManifestacao || n.statusManifestacao === "PENDENTE").length;
    const cancel = nfes.filter(n => ["CANCELADA","CANCELADO"].includes(n.statusSefaz)).length;

    return hs("div", { style: { padding: "24px", maxWidth: "1400px", margin: "0 auto" }, children: [
        manifestarNfe ? h(ModalManif, { key: "modal", nfe: manifestarNfe, onClose: () => setManifestarNfe(null), onSalvar: () => { setManifestarNfe(null); carregar(filtros, pagina); } }) : null,
        modalFornec ? h(ModalCadastroFornecNfe, { key: "mfornec", nfe: modalFornec, onClose: () => setModalFornec(null), onCadastrado: (res) => { setModalFornec(null); const cnpj = String(modalFornec.emitente?.cnpj || modalFornec.cnpjEmitente || "").replace(/\D/g,""); if (cnpj) setFornecStatus(prev => ({ ...prev, [cnpj]: { cadastrado: true, codfornec: res.codfornec, nome: res.nome } })); } }) : null,
        modalProduto ? h(ModalCadastroProduto, { key: "mprod", item: modalProduto.item, chaveAcesso: modalProduto.chave, codfornec: modalProduto.codfornec, onClose: () => setModalProduto(null), onCadastrado: () => setModalProduto(null) }) : null,

        // Header
        hs("div", { key: "hdr", style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }, children: [
            hs("div", { key: "t", children: [
                h("h1", { key: "h1", style: { fontSize: "22px", fontWeight: 700, margin: "0 0 4px 0" }, children: "NF-e Recebidas" }),
                h("p", { key: "s", style: { fontSize: "13px", color: "#6b7280", margin: 0 }, children: "Notas emitidas no SEFAZ para o CNPJ da empresa e ainda não dadas entrada no WinThor. Clique para expandir." }),
            ]}),
            hs("div", { key: "btns", style: { display: "flex", gap: "8px", flexWrap: "wrap" }, children: [
                h(Button, { key: "sefaz", onClick: sincronizarSefaz, disabled: sincronizandoSefaz || sincronizando, style: { fontSize: "12px", background: "#16a34a", color: "#fff", border: "none" }, title: "Baixar NF-e diretamente do SEFAZ (usa certificado digital da PCFILIAL)", children: sincronizandoSefaz ? "Consultando SEFAZ..." : "⬇ Sincronizar SEFAZ" }),
                h(Button, { key: "sync", onClick: sincronizar, disabled: sincronizando || sincronizandoSefaz, style: { fontSize: "12px", background: "#2563eb", color: "#fff", border: "none" }, title: "Importar notas já lançadas no WinThor (PCNFENT)", children: sincronizando ? "Sincronizando..." : "Sincronizar WinThor" }),
                h(Button, { key: "exp", variant: "outline", onClick: exportarCsv, disabled: exportando, style: { fontSize: "12px" }, children: exportando ? "Exportando..." : "Exportar CSV" }),
            ]}),
        ]}),
        msgSync ? h("div", { key: "msync", style: { background: "#dcfce7", color: "#166534", padding: "10px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "12px" }, children: msgSync }) : null,

        // KPIs
        h("div", { key: "kpis", style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "12px", marginBottom: "20px" }, children: [
            h(KpiCard, { key: "k1", label: "Total NF-e", value: dados.total || nfes.length, color: "#2563eb" }),
            h(KpiCard, { key: "k2", label: "Valor Total", value: fmt(totVal) }),
            h(KpiCard, { key: "k3", label: "Pend. Manifestação", value: pendMf, color: pendMf > 0 ? "#dc2626" : undefined }),
            h(KpiCard, { key: "k4", label: "Canceladas", value: cancel }),
        ]}),

        // Filtros
        h(Card, { key: "filtros", style: { marginBottom: "16px" }, children:
            h(CardContent, { style: { padding: "16px 20px" }, children:
                hs("div", { style: { display: "flex", flexDirection: "column", gap: "12px" }, children: [
                    h("div", { key: "r1", style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "10px" }, children: [
                        h(Input, { key: "busca", placeholder: "Chave, emitente, CNPJ...", value: filtros.busca, onChange: e => setF("busca", e.target.value) }),
                        h("select", { key: "ss", value: filtros.statusSefaz, onChange: e => setF("statusSefaz", e.target.value), style: { padding: "8px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px" }, children: [
                            h("option", { key: "a", value: "", children: "Status SEFAZ (todos)" }),
                            h("option", { key: "b", value: "AUTORIZADA", children: "Autorizada" }),
                            h("option", { key: "c", value: "PENDENTE", children: "Pendente" }),
                            h("option", { key: "d", value: "CANCELADA", children: "Cancelada" }),
                            h("option", { key: "e", value: "DENEGADA", children: "Denegada" }),
                        ]}),
                        h("select", { key: "sm", value: filtros.statusManifestacao, onChange: e => setF("statusManifestacao", e.target.value), style: { padding: "8px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px" }, children: [
                            h("option", { key: "a", value: "", children: "Manifestação (todas)" }),
                            h("option", { key: "b", value: "PENDENTE", children: "Pendente" }),
                            h("option", { key: "c", value: "CIENCIA", children: "Ciência" }),
                            h("option", { key: "d", value: "CONFIRMACAO", children: "Confirmação" }),
                            h("option", { key: "e", value: "DESCONHECIMENTO", children: "Desconhecimento" }),
                        ]}),
                        h("select", { key: "sr", value: filtros.statusRisco, onChange: e => setF("statusRisco", e.target.value), style: { padding: "8px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px" }, children: [
                            h("option", { key: "a", value: "", children: "Risco (todos)" }),
                            h("option", { key: "b", value: "CRITICO", children: "Crítico" }),
                            h("option", { key: "c", value: "ALTO", children: "Alto" }),
                            h("option", { key: "d", value: "ATENCAO", children: "Atenção" }),
                            h("option", { key: "e", value: "BAIXO", children: "Baixo" }),
                        ]}),
                        h("input", { key: "di", type: "date", value: filtros.dataInicio, onChange: e => setF("dataInicio", e.target.value), style: { padding: "8px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px" } }),
                        h("input", { key: "df", type: "date", value: filtros.dataFim, onChange: e => setF("dataFim", e.target.value), style: { padding: "8px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px" } }),
                        h(Input, { key: "cf", placeholder: "Filial (cód.)", value: filtros.codfilial, onChange: e => setF("codfilial", e.target.value) }),
                    ]}),
                    hs("div", { key: "r2", style: { display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }, children: [
                        hs("label", { key: "l1", style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }, children: [
                            h("input", { key: "c", type: "checkbox", checked: filtros.apenasSemPedido, onChange: e => setF("apenasSemPedido", e.target.checked) }),
                            "Sem pedido WinThor",
                        ]}),
                        hs("label", { key: "l2", style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }, children: [
                            h("input", { key: "c", type: "checkbox", checked: filtros.apenasCancelados, onChange: e => setF("apenasCancelados", e.target.checked) }),
                            "Apenas canceladas",
                        ]}),
                        hs("label", { key: "l3", style: { display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer" }, children: [
                            h("input", { key: "c", type: "checkbox", checked: filtros.incluirEntradas, onChange: e => setF("incluirEntradas", e.target.checked) }),
                            "Incluir já lançadas no WinThor",
                        ]}),
                        h(Button, { key: "btn", onClick: filtrar, style: { fontSize: "13px" }, children: "Filtrar" }),
                    ]}),
                ]})
            })
        }),

        erro ? h("div", { key: "err", style: { background: "#fee2e2", color: "#991b1b", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "12px" }, children: erro }) : null,

        // Tabela
        h(Card, { key: "tabela", children:
            h(CardContent, { style: { padding: 0 }, children:
                loading
                    ? h("p", { style: { padding: "24px", color: "#9ca3af" }, children: "Carregando..." })
                    : nfes.length === 0
                        ? hs("div", { style: { padding: "24px" }, children: [
                        h("p", { key: "m1", style: { color: "#374151", fontWeight: 600, marginBottom: "6px" }, children: "Nenhuma NF-e pendente de entrada encontrada." }),
                        h("p", { key: "m2", style: { color: "#6b7280", fontSize: "13px", margin: "0 0 4px" }, children: "Clique em \"Sincronizar WinThor\" para buscar notas recebidas do SEFAZ ainda sem entrada no sistema." }),
                        h("p", { key: "m3", style: { color: "#6b7280", fontSize: "13px", margin: 0 }, children: "Para ver notas já lançadas no WinThor, marque \"Incluir já lançadas no WinThor\" nos filtros." }),
                      ]})
                        : hs("div", { children: [
                            hs("div", { key: "pg-top", style: { padding: "10px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
                                h("span", { key: "cnt", style: { fontSize: "13px", color: "#374151" }, children: `${dados.total || nfes.length} notas — Página ${pagina}` }),
                                hs("div", { key: "btns-pg", style: { display: "flex", gap: "8px" }, children: [
                                    h(Button, { key: "prev", size: "sm", variant: "outline", disabled: pagina <= 1, onClick: () => { const p = pagina-1; setPagina(p); carregar(filtros, p); }, children: "← Anterior" }),
                                    h(Button, { key: "next", size: "sm", variant: "outline", onClick: () => { const p = pagina+1; setPagina(p); carregar(filtros, p); }, children: "Próxima →" }),
                                ]}),
                            ]}),
                            h("div", { key: "scroll", style: { overflowX: "auto" }, children:
                                hs("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "12px" }, children: [
                                    h("thead", { key: "th", children: h("tr", { style: { background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }, children: [
                                        h("th", { key: "tog", style: { padding: "10px 6px", width: "28px", textAlign: "center", fontWeight: 700, fontSize: "11px", color: "#374151", whiteSpace: "nowrap" }, children: "" }),
                                        h("th", { key: "nn",   style: { padding: "10px 10px", fontWeight: 700, fontSize: "11px", color: "#374151", whiteSpace: "nowrap" }, children: "Nº/Série" }),
                                        h("th", { key: "em",   style: { padding: "10px 10px", fontWeight: 700, fontSize: "11px", color: "#374151", whiteSpace: "nowrap", minWidth: "160px" }, children: "Emitente" }),
                                        h("th", { key: "cn",   style: { padding: "10px 10px", fontWeight: 700, fontSize: "11px", color: "#374151", whiteSpace: "nowrap" }, children: "CNPJ" }),
                                        h("th", { key: "de",   style: { padding: "10px 10px", fontWeight: 700, fontSize: "11px", color: "#374151", whiteSpace: "nowrap" }, children: "Emissão" }),
                                        h("th", { key: "en",   style: { padding: "10px 10px", fontWeight: 700, fontSize: "11px", color: "#374151", whiteSpace: "nowrap" }, children: "Entrada" }),
                                        h("th", { key: "vl",   style: { padding: "10px 10px", fontWeight: 700, fontSize: "11px", color: "#374151", whiteSpace: "nowrap", textAlign: "right" }, children: "Valor Total" }),
                                        h("th", { key: "ss",   style: { padding: "10px 10px", fontWeight: 700, fontSize: "11px", color: "#374151", whiteSpace: "nowrap" }, children: "Status SEFAZ" }),
                                        h("th", { key: "mf",   style: { padding: "10px 10px", fontWeight: 700, fontSize: "11px", color: "#374151", whiteSpace: "nowrap" }, children: "Manifestação" }),
                                        h("th", { key: "wt",   style: { padding: "10px 10px", fontWeight: 700, fontSize: "11px", color: "#374151", whiteSpace: "nowrap" }, children: "WinThor" }),
                                        h("th", { key: "forn", style: { padding: "10px 10px", fontWeight: 700, fontSize: "11px", color: "#374151", whiteSpace: "nowrap", minWidth: "180px" }, children: "Fornecedor" }),
                                        h("th", { key: "ac",   style: { padding: "10px 10px", fontWeight: 700, fontSize: "11px", color: "#374151", whiteSpace: "nowrap" }, children: "Ações" }),
                                    ]}) }),
                                    h("tbody", { key: "tb", children:
                                        nfes.flatMap((nfe, i) => {
                                            const chave = nfe.chaveAcesso || nfe.chave || "";
                                            const emNome = nfe.emitente?.nome || nfe.nomeEmitente || nfe.emitente || "—";
                                            const emCnpj = nfe.emitente?.cnpj || nfe.cnpjEmitente || "—";
                                            const isPend = !nfe.statusManifestacao || nfe.statusManifestacao === "PENDENTE";
                                            const emCnpjLimpo = String(emCnpj).replace(/\D/g, "");
                                            const fStatus = fornecStatus[emCnpjLimpo];
                                            const isExpanded = expandedChave === chave;
                                            const codfornecRow = fStatus?.codfornec ?? null;
                                            const tdC = { padding: "9px 10px", verticalAlign: "middle", whiteSpace: "nowrap" };
                                            const rowBg = isExpanded ? "#e0f0ff" : (i % 2 === 0 ? "#fff" : "#fafafa");

                                            const mainRow = hs("tr", {
                                                key: `r-${chave || i}`,
                                                onClick: () => chave && toggleDetalhe(chave),
                                                style: { borderBottom: isExpanded ? "none" : "1px solid #f0f0f0", background: rowBg, cursor: chave ? "pointer" : "default", transition: "background 0.12s" },
                                                children: [
                                                    h("td", { key: "tog", style: { ...tdC, padding: "9px 6px", textAlign: "center", color: isExpanded ? "#2563eb" : "#9ca3af", fontSize: "12px", fontWeight: 700 }, children: chave ? (isExpanded ? "▼" : "▶") : "" }),
                                                    h("td", { key: "nn",  style: { ...tdC, fontFamily: "monospace", fontSize: "12px" }, children: `${nfe.numero||"—"}/${nfe.serie||"—"}` }),
                                                    h("td", { key: "em",  style: { ...tdC, maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis" }, title: emNome, children: emNome }),
                                                    h("td", { key: "cn",  style: { ...tdC, fontFamily: "monospace", fontSize: "11px" }, children: emCnpj }),
                                                    h("td", { key: "de",  style: tdC, children: fmtDate(nfe.dhEmissao || nfe.dataEmissao) }),
                                                    h("td", { key: "en",  style: tdC, children: fmtDate(nfe.dataEntrada) }),
                                                    h("td", { key: "vl",  style: { ...tdC, textAlign: "right", fontWeight: 600 }, children: fmt(nfe.valorTotal ?? nfe.valor) }),
                                                    h("td", { key: "ss",  style: tdC, children: sBadge(nfe.statusSefaz || nfe.status) }),
                                                    h("td", { key: "mf",  style: { ...tdC, fontSize: "12px" }, children: isPend ? h("span", { style: { color: "#d97706", fontWeight: 600 }, children: "PENDENTE" }) : h("span", { style: { color: "#16a34a" }, children: nfe.statusManifestacao || "—" }) }),
                                                    h("td", { key: "wt",  style: { ...tdC, fontSize: "12px" }, children:
                                                        nfe.statusWinthor === "ENCONTRADO"
                                                            ? hs("div", { style: { display: "flex", flexDirection: "column", gap: "1px" }, children: [
                                                                h("span", { key: "s", style: { color: "#16a34a", fontWeight: 600 }, children: "✓ WinThor" }),
                                                                h("span", { key: "p", style: { color: "#6b7280", fontSize: "10px" }, children: (nfe.pedidoCompra || nfe.numPedido) ? "#" + (nfe.pedidoCompra || nfe.numPedido) : "S/Pedido" }),
                                                            ]})
                                                            : nfe.statusWinthor === "NAO_ENCONTRADO" ? h("span", { style: { color: "#d97706", fontWeight: 600 }, children: "Pendente" })
                                                            : h("span", { style: { color: "#9ca3af" }, children: "—" })
                                                    }),
                                                    h("td", { key: "forn", style: tdC, children:
                                                        fStatus == null
                                                            ? h("span", { style: { color: "#9ca3af", fontSize: "11px" }, children: "…" })
                                                            : fStatus.cadastrado
                                                                ? h("span", { style: { display: "inline-block", background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 600 }, children: `#${fStatus.codfornec}` })
                                                                : hs("div", { style: { display: "flex", flexDirection: "column", gap: "3px" }, children: [
                                                                    h("span", { key: "b", style: { display: "inline-block", background: "#fee2e2", color: "#991b1b", padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 600 }, children: "Não cadastrado" }),
                                                                    chave ? h("button", { key: "cad", style: { fontSize: "10px", padding: "2px 8px", borderRadius: "4px", border: "1px solid #2563eb", background: "#eff6ff", color: "#1d4ed8", cursor: "pointer", fontWeight: 600 }, onClick: e => { e.stopPropagation(); setModalFornec(nfe); }, children: "Cadastrar Fornecedor" }) : null,
                                                                ]})
                                                    }),
                                                    h("td", { key: "ac", style: tdC, children:
                                                        isPend && chave ? h("button", { style: { fontSize: "11px", padding: "3px 10px", borderRadius: "4px", border: "none", background: "#2563eb", color: "#fff", cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }, onClick: e => { e.stopPropagation(); setManifestarNfe(nfe); }, children: "Manifestar" }) : null
                                                    }),
                                                ],
                                            });

                                            if (!isExpanded) return [mainRow];

                                            const subRow = h(LinhaExpandidaNFe, {
                                                key: `exp-${chave}`,
                                                chave,
                                                doc: expandedDoc,
                                                loading: expandedLoading,
                                                erro: expandedError,
                                                colSpan: 12,
                                                codfornec: codfornecRow,
                                                valorTotalNota: nfe.valorTotal ?? nfe.valor,
                                                onCadastrarProduto: (it) => setModalProduto({ item: it, chave, codfornec: codfornecRow }),
                                            });

                                            return [mainRow, subRow];
                                        })
                                    }),
                                ]})
                            }),
                        ]})
            })
        }),
    ]});
}
