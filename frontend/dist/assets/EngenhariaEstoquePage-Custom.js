import { r as React, j as jsxRuntime, J as Card, N as CardContent, B as Button } from "./index-Cw1PFMX8.js";

const h = jsxRuntime.jsx;
const hs = jsxRuntime.jsxs;

function getToken() { try { return JSON.parse(localStorage.getItem("sgq.authSession") || "{}").token || ""; } catch { return ""; } }
async function apiFetch(path, opts) {
    const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(opts?.headers || {}) } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || json?.message || json?.error || `Erro ${res.status}`);
    return json;
}

function formatMoney(v) {
    const n = Number(v ?? 0);
    if (!Number.isFinite(n) || n === 0) return "—";
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDateTime(v) {
    if (!v) return "—";
    const d = new Date(v);
    if (isNaN(d)) return String(v);
    return d.toLocaleString("pt-BR");
}

function ModalNovoItem({ onClose, onCriado }) {
    const [form, setForm] = React.useState({
        descricao: "", unidade: "UN", categoria: "", qtd_inicial: "0",
        qtd_minima: "0", qtd_maxima: "", preco_medio: "", localizacao: "", codprod: "",
    });
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState("");
    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const salvar = async () => {
        if (!form.descricao.trim()) { setErro("Descrição obrigatória."); return; }
        setSalvando(true); setErro("");
        try {
            const body = {
                descricao: form.descricao.trim(),
                unidade: form.unidade || "UN",
                categoria: form.categoria || undefined,
                qtd_inicial: Number(form.qtd_inicial) || 0,
                qtd_minima: Number(form.qtd_minima) || 0,
                qtd_maxima: form.qtd_maxima ? Number(form.qtd_maxima) : undefined,
                preco_medio: form.preco_medio ? Number(form.preco_medio) : undefined,
                localizacao: form.localizacao || undefined,
                codprod: form.codprod ? Number(form.codprod) : undefined,
            };
            const res = await apiFetch("/api/engenharia/estoque/item", { method: "POST", body: JSON.stringify(body) });
            onCriado(res);
        } catch (e) {
            setErro(e.message || "Erro ao cadastrar item.");
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
            style: { width: "560px", maxHeight: "90vh", overflowY: "auto" },
            children: h(CardContent, {
                style: { padding: "24px" },
                children: hs("div", {
                    style: { display: "flex", flexDirection: "column", gap: "14px" },
                    children: [
                        hs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
                            h("h2", { style: { fontSize: "18px", fontWeight: 700, margin: 0 }, children: "Cadastrar Item de Estoque" }),
                            h("button", { onClick: onClose, style: { background: "none", border: "none", fontSize: "20px", cursor: "pointer" }, children: "×" }),
                        ] }),

                        hs("div", { children: [lbl("Descrição *"), h("input", { style: inp, value: form.descricao, onChange: e => set("descricao", e.target.value), placeholder: "Nome do material ou peça" })] }),

                        hs("div", { style: row2, children: [
                            hs("div", { children: [lbl("Unidade"), h("select", { style: inp, value: form.unidade, onChange: e => set("unidade", e.target.value), children: ["UN", "M", "M2", "M3", "L", "KG", "G", "CX", "PC", "PAR", "ROLO", "RL", "PCT", "FD", "GL"].map(u => h("option", { key: u, value: u, children: u })) })] }),
                            hs("div", { children: [lbl("Categoria"), h("input", { style: inp, value: form.categoria, onChange: e => set("categoria", e.target.value), placeholder: "Ex: Elétrico, Hidráulico..." })] }),
                        ] }),

                        hs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }, children: [
                            hs("div", { children: [lbl("Qtd Inicial"), h("input", { type: "number", min: "0", style: inp, value: form.qtd_inicial, onChange: e => set("qtd_inicial", e.target.value) })] }),
                            hs("div", { children: [lbl("Qtd Mínima"), h("input", { type: "number", min: "0", style: inp, value: form.qtd_minima, onChange: e => set("qtd_minima", e.target.value) })] }),
                            hs("div", { children: [lbl("Qtd Máxima"), h("input", { type: "number", min: "0", style: inp, value: form.qtd_maxima, onChange: e => set("qtd_maxima", e.target.value), placeholder: "Opcional" })] }),
                        ] }),

                        hs("div", { style: row2, children: [
                            hs("div", { children: [lbl("Preço Médio (R$)"), h("input", { type: "number", min: "0", step: "0.01", style: inp, value: form.preco_medio, onChange: e => set("preco_medio", e.target.value), placeholder: "0,00" })] }),
                            hs("div", { children: [lbl("Localização no Almox"), h("input", { style: inp, value: form.localizacao, onChange: e => set("localizacao", e.target.value), placeholder: "Ex: Prateleira A3, Bin 5..." })] }),
                        ] }),

                        hs("div", { children: [lbl("Cód. Produto WinThor (opcional)"), h("input", { type: "number", style: inp, value: form.codprod, onChange: e => set("codprod", e.target.value), placeholder: "CODPROD para vincular ao WinThor" })] }),

                        erro ? h("div", { style: { background: "#fee2e2", color: "#991b1b", padding: "10px 14px", borderRadius: "6px", fontSize: "13px" }, children: erro }) : null,

                        hs("div", { style: { display: "flex", gap: "8px", justifyContent: "flex-end" }, children: [
                            h(Button, { variant: "outline", onClick: onClose, children: "Cancelar" }),
                            h(Button, { onClick: salvar, disabled: salvando, style: { background: "#7c3aed", color: "#fff", border: "none" }, children: salvando ? "Cadastrando..." : "Cadastrar Item" }),
                        ] }),
                    ],
                }),
            }),
        }),
    });
}

function ModalMovimentar({ item, onClose, onMovimentado }) {
    const [tipo, setTipo] = React.useState("ENTRADA");
    const [qtd, setQtd] = React.useState("1");
    const [motivo, setMotivo] = React.useState("");
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState("");

    const salvar = async () => {
        if (!qtd || Number(qtd) <= 0) { setErro("Quantidade inválida."); return; }
        setSalvando(true); setErro("");
        try {
            const res = await apiFetch("/api/engenharia/estoque/movimentar", {
                method: "POST",
                body: JSON.stringify({ item_id: item.ID, tipo, qtd: Number(qtd), motivo: motivo || undefined }),
            });
            onMovimentado(res);
        } catch (e) {
            setErro(e.message || "Erro ao movimentar.");
        } finally {
            setSalvando(false);
        }
    };

    const inp = { padding: "8px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px", width: "100%", boxSizing: "border-box" };
    const tipoColor = { ENTRADA: "#dcfce7", SAIDA: "#fee2e2", AJUSTE: "#dbeafe", DEVOLUCAO: "#fef3c7" };

    return hs("div", {
        style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" },
        children: h(Card, {
            style: { width: "440px" },
            children: h(CardContent, {
                style: { padding: "24px" },
                children: hs("div", { style: { display: "flex", flexDirection: "column", gap: "14px" }, children: [
                    hs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
                        h("h2", { style: { fontSize: "16px", fontWeight: 700, margin: 0 }, children: "Movimentar Estoque" }),
                        h("button", { onClick: onClose, style: { background: "none", border: "none", fontSize: "20px", cursor: "pointer" }, children: "×" }),
                    ] }),

                    h("div", { style: { background: "#f3f4f6", borderRadius: "6px", padding: "10px 12px" }, children:
                        hs("div", { children: [
                            h("p", { style: { fontWeight: 700, fontSize: "14px", margin: "0 0 4px 0" }, children: item.DESCRICAO }),
                            h("p", { style: { fontSize: "12px", color: "#6b7280", margin: 0 }, children: `Estoque atual: ${item.QTD_ATUAL} ${item.UNIDADE} | Mínimo: ${item.QTD_MINIMA} ${item.UNIDADE}` }),
                        ] }),
                    }),

                    hs("div", { children: [
                        h("label", { style: { fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "8px" }, children: "Tipo de Movimentação" }),
                        h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }, children:
                            ["ENTRADA", "SAIDA", "DEVOLUCAO", "AJUSTE"].map(t => h("button", {
                                key: t,
                                onClick: () => setTipo(t),
                                style: {
                                    padding: "10px",
                                    borderRadius: "6px",
                                    border: tipo === t ? "2px solid #2563eb" : "1px solid #d1d5db",
                                    background: tipo === t ? "#dbeafe" : "#fff",
                                    cursor: "pointer",
                                    fontSize: "12px",
                                    fontWeight: tipo === t ? 700 : 400,
                                    color: tipo === t ? "#1e40af" : "#374151",
                                },
                                children: t,
                            })),
                        }),
                    ] }),

                    hs("div", { children: [
                        h("label", { style: { fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }, children: `Quantidade (${item.UNIDADE})` }),
                        h("input", { type: "number", min: "0.001", step: "0.001", style: inp, value: qtd, onChange: e => setQtd(e.target.value) }),
                    ] }),

                    hs("div", { children: [
                        h("label", { style: { fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }, children: "Motivo / Observação" }),
                        h("input", { style: inp, value: motivo, onChange: e => setMotivo(e.target.value), placeholder: "Ex: Reposição, uso na OS-000123..." }),
                    ] }),

                    erro ? h("div", { style: { background: "#fee2e2", color: "#991b1b", padding: "10px 14px", borderRadius: "6px", fontSize: "13px" }, children: erro }) : null,

                    hs("div", { style: { display: "flex", gap: "8px", justifyContent: "flex-end" }, children: [
                        h(Button, { variant: "outline", onClick: onClose, children: "Cancelar" }),
                        h(Button, { onClick: salvar, disabled: salvando, style: {
                            background: tipo === "ENTRADA" ? "#16a34a" : tipo === "SAIDA" ? "#dc2626" : "#2563eb",
                            color: "#fff", border: "none",
                        }, children: salvando ? "..." : `Confirmar ${tipo}` }),
                    ] }),
                ] }),
            }),
        }),
    });
}

export default function EngenhariaEstoquePage() {
    const [lista, setLista] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState("");
    const [sucesso, setSucesso] = React.useState("");
    const [filtQ, setFiltQ] = React.useState("");
    const [filtCategoria, setFiltCategoria] = React.useState("");
    const [filtAlerta, setFiltAlerta] = React.useState(false);
    const [modalNovo, setModalNovo] = React.useState(false);
    const [modalMovimentar, setModalMovimentar] = React.useState(null);

    const carregar = React.useCallback(async () => {
        setErro("");
        try {
            const q = new URLSearchParams();
            if (filtQ) q.set("q", filtQ);
            if (filtCategoria) q.set("categoria", filtCategoria);
            if (filtAlerta) q.set("alerta", "true");
            const data = await apiFetch(`/api/engenharia/estoque?${q}`);
            setLista(Array.isArray(data) ? data : []);
        } catch (e) {
            setErro(e.message || "Erro ao carregar estoque.");
        } finally {
            setLoading(false);
        }
    }, [filtQ, filtCategoria, filtAlerta]);

    React.useEffect(() => { carregar(); }, [carregar]);

    const qtdCriticos = lista.filter(i => Number(i.QTD_ATUAL) <= Number(i.QTD_MINIMA)).length;
    const valorTotal = lista.reduce((s, i) => s + (Number(i.QTD_ATUAL || 0) * Number(i.PRECO_MEDIO || 0)), 0);

    const inp = { padding: "7px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px" };

    return hs("div", {
        style: { padding: "24px", maxWidth: "1400px", margin: "0 auto" },
        children: [
            // Header
            hs("div", {
                style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", flexWrap: "wrap", gap: "12px" },
                children: [
                    hs("div", { children: [
                        h("h1", { style: { fontSize: "22px", fontWeight: 700, margin: "0 0 4px 0" }, children: "Estoque de Engenharia" }),
                        h("p", { style: { fontSize: "13px", color: "hsl(var(--muted-foreground))", margin: 0 }, children: "Almoxarifado interno — materiais, peças e insumos" }),
                    ] }),
                    hs("div", { style: { display: "flex", gap: "8px" }, children: [
                        h(Button, { variant: "outline", onClick: carregar, style: { fontSize: "12px" }, children: "↻ Atualizar" }),
                        h(Button, { onClick: () => setModalNovo(true), style: { background: "#7c3aed", color: "#fff", border: "none", fontSize: "12px" }, children: "+ Cadastrar Item" }),
                    ] }),
                ],
            }),

            // KPIs
            h("div", {
                style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px", marginBottom: "20px" },
                children: [
                    h(Card, { children: h(CardContent, { style: { padding: "16px" }, children: hs("div", { children: [h("p", { style: { fontSize: "11px", color: "#6b7280", textTransform: "uppercase", marginBottom: "4px" }, children: "Total de Itens" }), h("p", { style: { fontSize: "24px", fontWeight: 700 }, children: lista.length })] }) }) }),
                    h(Card, { children: h(CardContent, { style: { padding: "16px" }, children: hs("div", { children: [h("p", { style: { fontSize: "11px", color: "#6b7280", textTransform: "uppercase", marginBottom: "4px" }, children: "Itens Críticos" }), h("p", { style: { fontSize: "24px", fontWeight: 700, color: qtdCriticos > 0 ? "#dc2626" : "#374151" }, children: qtdCriticos })] }) }) }),
                    h(Card, { children: h(CardContent, { style: { padding: "16px" }, children: hs("div", { children: [h("p", { style: { fontSize: "11px", color: "#6b7280", textTransform: "uppercase", marginBottom: "4px" }, children: "Valor Estimado" }), h("p", { style: { fontSize: "18px", fontWeight: 700 }, children: valorTotal > 0 ? valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—" })] }) }) }),
                ],
            }),

            // Filtros
            h(Card, {
                style: { marginBottom: "16px" },
                children: h(CardContent, {
                    style: { padding: "12px 16px" },
                    children: hs("div", {
                        style: { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" },
                        children: [
                            h("input", { style: { ...inp, minWidth: "220px" }, value: filtQ, onChange: e => setFiltQ(e.target.value), placeholder: "Buscar item...", onKeyDown: e => e.key === "Enter" && carregar() }),
                            h("input", { style: inp, value: filtCategoria, onChange: e => setFiltCategoria(e.target.value), placeholder: "Categoria..." }),
                            hs("label", { style: { display: "flex", gap: "6px", alignItems: "center", fontSize: "13px", cursor: "pointer" }, children: [
                                h("input", { type: "checkbox", checked: filtAlerta, onChange: e => setFiltAlerta(e.target.checked) }),
                                "Somente críticos",
                            ] }),
                            h(Button, { variant: "outline", style: { fontSize: "12px" }, onClick: carregar, children: "Buscar" }),
                        ],
                    }),
                }),
            }),

            erro ? h("div", { style: { background: "#fee2e2", color: "#991b1b", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }, children: erro }) : null,
            sucesso ? hs("div", { style: { background: "#dcfce7", color: "#166534", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px", display: "flex", justifyContent: "space-between" }, children: [sucesso, h("span", { style: { cursor: "pointer", fontWeight: 700 }, onClick: () => setSucesso(""), children: "×" })] }) : null,

            // Tabela
            h(Card, {
                children: h(CardContent, {
                    style: { padding: "0" },
                    children: loading
                        ? h("p", { style: { padding: "24px", fontSize: "14px", color: "#6b7280" }, children: "Carregando estoque..." })
                        : lista.length === 0
                            ? h("p", { style: { padding: "24px", fontSize: "14px", color: "#6b7280", textAlign: "center" }, children: "Nenhum item encontrado." })
                            : h("div", {
                                style: { overflowX: "auto" },
                                children: h("table", {
                                    style: { width: "100%", borderCollapse: "collapse", fontSize: "13px" },
                                    children: [
                                        h("thead", {
                                            children: h("tr", {
                                                style: { borderBottom: "1px solid #e5e7eb", background: "#f9fafb" },
                                                children: ["Descrição", "Categoria", "Un", "Atual", "Mínimo", "Máximo", "Preço Médio", "Valor Total", "Local", "Ações"].map(c =>
                                                    h("th", { key: c, style: { padding: "10px 14px", textAlign: "left", fontWeight: 600, fontSize: "12px", color: "#6b7280", whiteSpace: "nowrap" }, children: c })
                                                ),
                                            }),
                                        }),
                                        h("tbody", {
                                            children: lista.map((item, i) => {
                                                const critico = Number(item.QTD_ATUAL) <= Number(item.QTD_MINIMA);
                                                const vt = Number(item.QTD_ATUAL || 0) * Number(item.PRECO_MEDIO || 0);
                                                return h("tr", {
                                                    key: item.ID || i,
                                                    style: { borderBottom: "1px solid #f3f4f6", background: critico ? "#fff5f5" : undefined, verticalAlign: "middle" },
                                                    children: [
                                                        h("td", { style: { padding: "10px 14px", fontWeight: 600 }, children: hs("div", { children: [
                                                            h("span", { children: item.DESCRICAO }),
                                                            item.CODPROD ? h("span", { style: { fontSize: "11px", color: "#6b7280", display: "block" }, children: `WinThor: ${item.CODPROD}` }) : null,
                                                        ] }) }),
                                                        h("td", { style: { padding: "10px 14px", color: "#6b7280" }, children: item.CATEGORIA || "—" }),
                                                        h("td", { style: { padding: "10px 14px" }, children: item.UNIDADE }),
                                                        h("td", { style: { padding: "10px 14px", fontWeight: 700, color: critico ? "#dc2626" : "#374151" }, children:
                                                            hs("span", { children: [
                                                                item.QTD_ATUAL,
                                                                critico ? h("span", { style: { fontSize: "10px", marginLeft: "4px", color: "#dc2626" }, children: "⚠️" }) : null,
                                                            ] })
                                                        }),
                                                        h("td", { style: { padding: "10px 14px" }, children: item.QTD_MINIMA }),
                                                        h("td", { style: { padding: "10px 14px", color: "#6b7280" }, children: item.QTD_MAXIMA || "—" }),
                                                        h("td", { style: { padding: "10px 14px" }, children: formatMoney(item.PRECO_MEDIO) }),
                                                        h("td", { style: { padding: "10px 14px", fontWeight: 600 }, children: vt > 0 ? vt.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—" }),
                                                        h("td", { style: { padding: "10px 14px", color: "#6b7280", fontSize: "12px" }, children: item.LOCALIZACAO || "—" }),
                                                        h("td", { style: { padding: "10px 14px" }, children: h(Button, {
                                                            variant: "outline",
                                                            style: { fontSize: "11px", padding: "4px 8px" },
                                                            onClick: () => setModalMovimentar(item),
                                                            children: "Movimentar",
                                                        }) }),
                                                    ],
                                                });
                                            }),
                                        }),
                                    ],
                                }),
                            }),
                }),
            }),

            modalNovo ? h(ModalNovoItem, {
                onClose: () => setModalNovo(false),
                onCriado: () => { setModalNovo(false); setSucesso("Item cadastrado com sucesso!"); carregar(); },
            }) : null,

            modalMovimentar ? h(ModalMovimentar, {
                item: modalMovimentar,
                onClose: () => setModalMovimentar(null),
                onMovimentado: (res) => {
                    setModalMovimentar(null);
                    setSucesso(`Movimentação registrada. Saldo: ${res.qtd_depois} → ${res.qtd_depois}`);
                    carregar();
                },
            }) : null,
        ],
    });
}
