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

function formatMoney(v) {
    const n = Number(v ?? 0);
    if (!Number.isFinite(n)) return "R$ 0,00";
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDate(v) {
    if (!v) return "-";
    const d = new Date(`${String(v).slice(0, 10)}T00:00:00`);
    if (isNaN(d)) return String(v);
    return d.toLocaleDateString("pt-BR");
}

function statusBadge(s) {
    const map = { AUTORIZADA: ["#dcfce7","#166534"], CANCELADA: ["#fee2e2","#991b1b"], DENEGADA: ["#fef3c7","#92400e"], PENDENTE: ["#e0e7ff","#3730a3"] };
    const [bg, fg] = map[s] || ["#f3f4f6","#374151"];
    return h("span", { style: { background: bg, color: fg, padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700 }, children: s || "—" });
}
function riscoBadge(r) {
    const map = { CRITICO: ["#fee2e2","#991b1b"], ALTO: ["#fef3c7","#92400e"], ATENCAO: ["#dbeafe","#1e40af"], BAIXO: ["#dcfce7","#166534"] };
    const [bg, fg] = map[r] || ["#f3f4f6","#374151"];
    return h("span", { style: { background: bg, color: fg, padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700 }, children: r || "—" });
}

export function FiscalSefazPendentesPage() {
    const [docs, setDocs] = React.useState([]);
    const [total, setTotal] = React.useState(0);
    const [loading, setLoading] = React.useState(false);
    const [syncing, setSyncing] = React.useState(false);
    const [error, setError] = React.useState(null);
    const [info, setInfo] = React.useState(null);
    const [cnpjs, setCnpjs] = React.useState([]);
    const [cnpjFiltro, setCnpjFiltro] = React.useState("");
    const [maxLotes, setMaxLotes] = React.useState(20);
    const [selected, setSelected] = React.useState(null);

    React.useEffect(() => {
        apiFetch("/api/fiscal/cnpjs").then(r => setCnpjs(r || [])).catch(() => {});
        carregarPendentes();
    }, []);

    function carregarPendentes(cnpj) {
        setLoading(true); setError(null);
        const q = cnpj ? `?cnpj=${cnpj}` : "";
        apiFetch(`/api/fiscal/sync/sefaz/pendentes${q}`)
            .then(r => { setDocs(r.items || []); setTotal(r.total || 0); })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }

    async function sincronizarSefaz() {
        setSyncing(true); setError(null); setInfo(null);
        try {
            const body = { maxLotes };
            if (cnpjFiltro) body.cnpj = cnpjFiltro;
            const r = await apiFetch("/api/fiscal/sync/sefaz", { method: "POST", body: JSON.stringify(body) });
            setInfo(r.mensagem || "Sync concluído.");
            carregarPendentes(cnpjFiltro || undefined);
        } catch (e) {
            setError(e.message);
        } finally {
            setSyncing(false);
        }
    }

    const rows = docs;

    return hs("div", { style: { padding: "24px", maxWidth: "1200px", margin: "0 auto" } }, [
        // Cabeçalho
        hs("div", { key: "hdr", style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" } }, [
            hs("div", { key: "title" }, [
                h("h1", { key: "h1", style: { fontSize: "22px", fontWeight: 700, margin: 0 } }, "NF-e SEFAZ — Pendentes de Entrada"),
                h("p", { key: "sub", style: { color: "#6b7280", margin: "4px 0 0", fontSize: "13px" } }, "NF-es encontradas no SEFAZ (Ambiente Nacional) que ainda não deram entrada no WinThor"),
            ]),
            h(Button, { key: "btn-sync", onClick: sincronizarSefaz, disabled: syncing, children: syncing ? "Consultando SEFAZ..." : "Consultar SEFAZ Agora" }),
        ]),

        // Filtros
        h(Card, { key: "filtros", style: { marginBottom: "16px" } },
            h(CardContent, { key: "fc" },
                hs("div", { key: "row", style: { display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" } }, [
                    hs("div", { key: "f1" }, [
                        h("label", { key: "l1", style: { fontSize: "12px", color: "#6b7280", display: "block", marginBottom: "4px" } }, "CNPJ Destinatário"),
                        h("select", {
                            key: "s1",
                            value: cnpjFiltro,
                            onChange: e => { setCnpjFiltro(e.target.value); carregarPendentes(e.target.value || undefined); },
                            style: { border: "1px solid #d1d5db", borderRadius: "6px", padding: "6px 10px", fontSize: "13px" }
                        }, [
                            h("option", { key: "all", value: "" }, "Todos os CNPJs"),
                            ...cnpjs.map(c => h("option", { key: c.cnpj, value: c.cnpj }, `${c.razaoSocial || c.cnpj} (${c.cnpj})`))
                        ]),
                    ]),
                    hs("div", { key: "f2" }, [
                        h("label", { key: "l2", style: { fontSize: "12px", color: "#6b7280", display: "block", marginBottom: "4px" } }, "Máx. Lotes por CNPJ"),
                        h("input", {
                            key: "i2", type: "number", min: 1, max: 50, value: maxLotes,
                            onChange: e => setMaxLotes(Number(e.target.value)),
                            style: { width: "80px", border: "1px solid #d1d5db", borderRadius: "6px", padding: "6px 10px", fontSize: "13px" }
                        }),
                    ]),
                    h("span", { key: "count", style: { color: "#6b7280", fontSize: "13px", paddingBottom: "6px" } }, `${total} pendentes`),
                ])
            )
        ),

        // Alertas
        error && h("div", { key: "err", style: { background: "#fee2e2", color: "#991b1b", borderRadius: "8px", padding: "12px 16px", marginBottom: "12px", fontSize: "13px" } }, `Erro: ${error}`),
        info && h("div", { key: "inf", style: { background: "#dbeafe", color: "#1e40af", borderRadius: "8px", padding: "12px 16px", marginBottom: "12px", fontSize: "13px" } }, info),

        // Explicação
        h("div", { key: "explain", style: { background: "#fefce8", border: "1px solid #fde68a", borderRadius: "8px", padding: "12px 16px", marginBottom: "16px", fontSize: "13px", color: "#78350f" } },
            "Este módulo consulta o SEFAZ Nacional (NFeDistribuicaoDFe) usando o certificado digital A1 cadastrado no WinThor (PCFILIAL). Documentos listados aqui foram emitidos para os CNPJs da empresa e constam na SEFAZ, mas não estão lançados no WinThor/ERP."
        ),

        // Tabela
        h(Card, { key: "tabela" },
            h(CardContent, { key: "tc" },
                loading
                    ? h("div", { key: "load", style: { textAlign: "center", padding: "48px", color: "#9ca3af" } }, "Carregando...")
                    : rows.length === 0
                        ? h("div", { key: "empty", style: { textAlign: "center", padding: "48px", color: "#9ca3af" } },
                            hs("div", { key: "d" }, [
                                h("div", { key: "i", style: { fontSize: "48px", marginBottom: "12px" } }, "✅"),
                                h("div", { key: "t", style: { fontWeight: 600 } }, "Nenhuma NF-e pendente"),
                                h("div", { key: "s", style: { fontSize: "13px", marginTop: "4px" } }, 'Clique em "Consultar SEFAZ Agora" para buscar documentos.'),
                            ])
                        )
                        : hs("div", { key: "wrap", style: { overflowX: "auto" } },
                            hs("table", { key: "t", style: { width: "100%", borderCollapse: "collapse", fontSize: "13px" } }, [
                                h("thead", { key: "th" },
                                    h("tr", { key: "r", style: { borderBottom: "2px solid #e5e7eb", background: "#f9fafb" } },
                                        ["Chave NF-e", "Nº / Série", "Emitente", "CNPJ Emitente", "Emissão", "Valor", "Status SEFAZ", "Risco", "Ações"].map(col =>
                                            h("th", { key: col, style: { padding: "8px 12px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" } }, col)
                                        )
                                    )
                                ),
                                h("tbody", { key: "tb" },
                                    rows.map((doc, i) =>
                                        hs("tr", { key: doc.id || i, style: { borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" } }, [
                                            h("td", { key: "ch", style: { padding: "8px 12px", fontFamily: "monospace", fontSize: "11px", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, doc.chaveAcesso || "—"),
                                            h("td", { key: "nn", style: { padding: "8px 12px", whiteSpace: "nowrap" } }, `${doc.numero || "—"} / ${doc.serie || "—"}`),
                                            h("td", { key: "em", style: { padding: "8px 12px" } }, doc.emitente?.nome || "—"),
                                            h("td", { key: "cnpj", style: { padding: "8px 12px", fontFamily: "monospace", fontSize: "12px" } }, doc.emitente?.cnpj || "—"),
                                            h("td", { key: "dt", style: { padding: "8px 12px", whiteSpace: "nowrap" } }, formatDate(doc.dhEmissao || doc.dataEmissao)),
                                            h("td", { key: "vl", style: { padding: "8px 12px", textAlign: "right", whiteSpace: "nowrap" } }, formatMoney(doc.valorTotal)),
                                            h("td", { key: "st", style: { padding: "8px 12px" } }, statusBadge(doc.statusSefaz)),
                                            h("td", { key: "rs", style: { padding: "8px 12px" } }, riscoBadge(doc.classificacaoRisco)),
                                            h("td", { key: "ac", style: { padding: "8px 12px" } },
                                                h("button", {
                                                    key: "ver", onClick: () => setSelected(doc),
                                                    style: { fontSize: "12px", padding: "4px 10px", borderRadius: "6px", border: "1px solid #d1d5db", background: "#f9fafb", cursor: "pointer" }
                                                }, "Detalhes")
                                            ),
                                        ])
                                    )
                                ),
                            ])
                        )
            )
        ),

        // Modal detalhes
        selected && hs("div", { key: "modal", style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 } },
            hs("div", { key: "panel", style: { background: "#fff", borderRadius: "12px", padding: "28px", maxWidth: "640px", width: "100%", maxHeight: "80vh", overflowY: "auto" } }, [
                hs("div", { key: "mhdr", style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" } }, [
                    h("h2", { key: "mh2", style: { fontSize: "16px", fontWeight: 700, margin: 0 } }, "Detalhes da NF-e"),
                    h("button", { key: "mcl", onClick: () => setSelected(null), style: { border: "none", background: "none", fontSize: "20px", cursor: "pointer", color: "#9ca3af" } }, "×"),
                ]),
                hs("dl", { key: "dlist", style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px" } },
                    [
                        ["Chave de Acesso", selected.chaveAcesso],
                        ["Número / Série", `${selected.numero || "—"} / ${selected.serie || "—"}`],
                        ["Emitente", selected.emitente?.nome || "—"],
                        ["CNPJ Emitente", selected.emitente?.cnpj || "—"],
                        ["Destinatário (CNPJ)", selected.destinatario?.cnpj || "—"],
                        ["Data de Emissão", formatDate(selected.dhEmissao || selected.dataEmissao)],
                        ["Valor Total", formatMoney(selected.valorTotal)],
                        ["Status SEFAZ", selected.statusSefaz || "—"],
                        ["Status WinThor", selected.statusWinthor || "NAO_ENCONTRADO"],
                        ["Protocolo", selected.protocoloAutorizacao || "—"],
                        ["Origem", selected.origem || "—"],
                        ["Score de Risco", `${selected.scoreRisco ?? 0} — ${selected.classificacaoRisco || "—"}`],
                        ["Criado em", selected.criadoEm ? new Date(selected.criadoEm).toLocaleString("pt-BR") : "—"],
                    ].map(([k, v]) =>
                        hs("div", { key: k }, [
                            h("dt", { key: "dt", style: { fontSize: "11px", color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" } }, k),
                            h("dd", { key: "dd", style: { fontSize: "13px", margin: 0, wordBreak: "break-all" } }, v),
                        ])
                    )
                ),
                selected.regrasRiscoAplicadas?.length > 0 && hs("div", { key: "regras", style: { marginTop: "16px" } }, [
                    h("p", { key: "rp", style: { fontWeight: 600, fontSize: "13px", marginBottom: "8px" } }, "Regras de Risco Aplicadas:"),
                    ...selected.regrasRiscoAplicadas.map((r, i) =>
                        hs("div", { key: i, style: { background: "#fef3c7", borderRadius: "6px", padding: "8px 12px", marginBottom: "6px", fontSize: "12px" } }, [
                            hs("span", { key: "rc", style: { fontWeight: 700, marginRight: "8px" } }, r.codigo),
                            h("span", { key: "rd" }, `${r.descricao} (+${r.pontos} pts)`),
                        ])
                    ),
                ]),
            ])
        ),
    ]);
}

export default FiscalSefazPendentesPage;
