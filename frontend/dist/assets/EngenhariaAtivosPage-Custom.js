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

function formatDate(v) {
    if (!v) return "—";
    const d = new Date(`${String(v).slice(0, 10)}T00:00:00`);
    if (isNaN(d)) return String(v);
    return d.toLocaleDateString("pt-BR");
}
function formatMoney(v) {
    const n = Number(v ?? 0);
    if (!Number.isFinite(n) || n === 0) return "—";
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function computeHealthScore(ativo) {
    if (ativo.STATUS === "DESCARTADO") return { score: 0, label: "Descartado", color: "#9ca3af" };
    if (ativo.STATUS === "INATIVO") return { score: 15, label: "Inativo", color: "#9ca3af" };

    let score = 100;
    const now = Date.now();

    // Manutenção vencida
    if (ativo.PROXIMA_MANUTENCAO) {
        const prox = new Date(`${String(ativo.PROXIMA_MANUTENCAO).slice(0, 10)}T00:00:00`).getTime();
        if (prox < now) score -= 35;
        else if (prox < now + 15 * 864e5) score -= 10;
    }

    // Garantia vencida
    if (ativo.DATA_GARANTIA_FIM) {
        const fim = new Date(`${String(ativo.DATA_GARANTIA_FIM).slice(0, 10)}T00:00:00`).getTime();
        if (fim < now) score -= 15;
    }

    // Idade vs vida útil
    if (ativo.DATA_AQUISICAO && ativo.VIDA_UTIL_ANOS) {
        const aq = new Date(`${String(ativo.DATA_AQUISICAO).slice(0, 10)}T00:00:00`).getTime();
        const vidaMs = Number(ativo.VIDA_UTIL_ANOS) * 365 * 864e5;
        const ratio = (now - aq) / vidaMs;
        if (ratio >= 1) score -= 30;
        else if (ratio > 0.8) score -= 20;
        else if (ratio > 0.6) score -= 10;
    }

    // Em manutenção no momento
    if (ativo.STATUS === "MANUTENCAO") score -= 20;

    score = Math.max(0, Math.min(100, score));
    const label = score >= 80 ? "Bom" : score >= 60 ? "Regular" : score >= 40 ? "Atenção" : "Crítico";
    const color = score >= 80 ? "#16a34a" : score >= 60 ? "#d97706" : score >= 40 ? "#ea580c" : "#dc2626";
    return { score, label, color };
}

function HealthBar({ ativo }) {
    const { score, label, color } = computeHealthScore(ativo);
    return hs("div", {
        style: { display: "flex", alignItems: "center", gap: "8px" },
        children: [
            h("div", {
                style: { flex: 1, height: "6px", background: "#e5e7eb", borderRadius: "3px", overflow: "hidden" },
                children: h("div", { style: { height: "100%", width: `${score}%`, background: color, borderRadius: "3px", transition: "width .4s" } }),
            }),
            h("span", { style: { fontSize: "11px", fontWeight: 700, color, minWidth: "36px" }, children: `${score}` }),
            h("span", { style: { fontSize: "10px", color: "#6b7280" }, children: label }),
        ],
    });
}

function StatusAtivoBadge({ status }) {
    const map = {
        ATIVO: { bg: "#dcfce7", color: "#166534" },
        INATIVO: { bg: "#f3f4f6", color: "#6b7280" },
        MANUTENCAO: { bg: "#fef3c7", color: "#92400e" },
        DESCARTADO: { bg: "#fee2e2", color: "#991b1b" },
    };
    const s = map[status] || { bg: "#f3f4f6", color: "#374151" };
    return h("span", { style: { background: s.bg, color: s.color, padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700 }, children: status || "—" });
}

function BuscaProdutoWinThor({ onSelecionado }) {
    const [q, setQ] = React.useState("");
    const [resultados, setResultados] = React.useState([]);
    const [buscando, setBuscando] = React.useState(false);

    const buscar = async () => {
        if (q.trim().length < 2) return;
        setBuscando(true);
        try {
            const r = await apiFetch(`/api/engenharia/produtos?q=${encodeURIComponent(q.trim())}`);
            setResultados(Array.isArray(r) ? r : []);
        } catch { setResultados([]); } finally { setBuscando(false); }
    };

    return hs("div", {
        style: { display: "flex", flexDirection: "column", gap: "8px" },
        children: [
            hs("div", { style: { display: "flex", gap: "6px" }, children: [
                h("input", {
                    style: { flex: 1, padding: "7px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px" },
                    value: q, placeholder: "Buscar produto WinThor (mín. 2 chars)...",
                    onChange: e => setQ(e.target.value),
                    onKeyDown: e => e.key === "Enter" && buscar(),
                }),
                h(Button, { onClick: buscar, disabled: buscando || q.trim().length < 2, style: { fontSize: "12px" }, children: buscando ? "..." : "Buscar" }),
            ] }),
            resultados.length > 0 ? h("div", {
                style: { border: "1px solid #e5e7eb", borderRadius: "6px", maxHeight: "160px", overflowY: "auto", fontSize: "12px" },
                children: resultados.map(p => h("div", {
                    key: p.CODPROD,
                    style: { padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #f3f4f6", display: "flex", gap: "12px" },
                    onClick: () => { onSelecionado(p); setResultados([]); setQ(""); },
                    children: hs("span", { children: [`[${p.CODPROD}] `, h("b", { children: p.DESCRICAO }), ` — ${p.UNIDADE || ""}`] }),
                })),
            }) : null,
        ],
    });
}

function ModalNovoAtivo({ onClose, onCriado }) {
    const [form, setForm] = React.useState({
        codigo: "", nome: "", categoria: "", subcategoria: "",
        fabricante: "", modelo: "", num_serie: "",
        codfilial: "", nome_filial: "", local: "",
        data_aquisicao: "", valor_aquisicao: "",
        data_garantia_fim: "", vida_util_anos: "",
        ciclos_manutencao_dias: "", obs: "",
        codprod: "",
    });
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState("");
    const [mostrarBuscaProd, setMostrarBuscaProd] = React.useState(false);
    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const salvar = async () => {
        if (!form.codigo.trim() || !form.nome.trim()) { setErro("Código e Nome são obrigatórios."); return; }
        setSalvando(true); setErro("");
        try {
            const body = {
                codigo: form.codigo.trim(),
                nome: form.nome.trim(),
                categoria: form.categoria || undefined,
                subcategoria: form.subcategoria || undefined,
                fabricante: form.fabricante || undefined,
                modelo: form.modelo || undefined,
                num_serie: form.num_serie || undefined,
                codfilial: form.codfilial || undefined,
                nome_filial: form.nome_filial || undefined,
                local: form.local || undefined,
                data_aquisicao: form.data_aquisicao || undefined,
                valor_aquisicao: form.valor_aquisicao ? Number(form.valor_aquisicao) : undefined,
                data_garantia_fim: form.data_garantia_fim || undefined,
                vida_util_anos: form.vida_util_anos ? Number(form.vida_util_anos) : undefined,
                ciclos_manutencao_dias: form.ciclos_manutencao_dias ? Number(form.ciclos_manutencao_dias) : undefined,
                obs: form.obs || undefined,
            };
            const res = await apiFetch("/api/engenharia/ativos", { method: "POST", body: JSON.stringify(body) });
            onCriado(res);
        } catch (e) {
            setErro(e.message || "Erro ao cadastrar ativo.");
        } finally {
            setSalvando(false);
        }
    };

    const inp = { padding: "8px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px", width: "100%", boxSizing: "border-box" };
    const row2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" };
    const row3 = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" };
    const lbl = (t) => h("label", { style: { fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }, children: t });

    return hs("div", {
        style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" },
        children: h(Card, {
            style: { width: "680px", maxHeight: "92vh", overflowY: "auto" },
            children: h(CardContent, {
                style: { padding: "24px" },
                children: hs("div", {
                    style: { display: "flex", flexDirection: "column", gap: "14px" },
                    children: [
                        hs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
                            h("h2", { style: { fontSize: "18px", fontWeight: 700, margin: 0 }, children: "Cadastrar Ativo / Equipamento" }),
                            h("button", { onClick: onClose, style: { background: "none", border: "none", fontSize: "20px", cursor: "pointer" }, children: "×" }),
                        ] }),

                        hs("div", { style: row2, children: [
                            hs("div", { children: [lbl("Código *"), h("input", { style: inp, value: form.codigo, onChange: e => set("codigo", e.target.value), placeholder: "Ex: AC-001, HVAC-003..." })] }),
                            hs("div", { children: [lbl("Nome *"), h("input", { style: inp, value: form.nome, onChange: e => set("nome", e.target.value), placeholder: "Nome completo do equipamento" })] }),
                        ] }),

                        hs("div", { style: row2, children: [
                            hs("div", { children: [lbl("Categoria"), h("input", { style: inp, value: form.categoria, onChange: e => set("categoria", e.target.value), placeholder: "Ex: AVAC, Elétrico, Estrutura..." })] }),
                            hs("div", { children: [lbl("Subcategoria"), h("input", { style: inp, value: form.subcategoria, onChange: e => set("subcategoria", e.target.value), placeholder: "Ex: Climatizador, Disjuntor..." })] }),
                        ] }),

                        hs("div", { style: row3, children: [
                            hs("div", { children: [lbl("Fabricante"), h("input", { style: inp, value: form.fabricante, onChange: e => set("fabricante", e.target.value), placeholder: "Marca" })] }),
                            hs("div", { children: [lbl("Modelo"), h("input", { style: inp, value: form.modelo, onChange: e => set("modelo", e.target.value), placeholder: "Modelo" })] }),
                            hs("div", { children: [lbl("Nº de Série"), h("input", { style: inp, value: form.num_serie, onChange: e => set("num_serie", e.target.value), placeholder: "SN..." })] }),
                        ] }),

                        hs("div", { style: row3, children: [
                            hs("div", { children: [lbl("Filial (código)"), h("input", { style: inp, value: form.codfilial, onChange: e => set("codfilial", e.target.value), placeholder: "1, 2, 10..." })] }),
                            hs("div", { children: [lbl("Nome da Filial"), h("input", { style: inp, value: form.nome_filial, onChange: e => set("nome_filial", e.target.value), placeholder: "Nome da loja" })] }),
                            hs("div", { children: [lbl("Local"), h("input", { style: inp, value: form.local, onChange: e => set("local", e.target.value), placeholder: "Sala, andar, seção..." })] }),
                        ] }),

                        // Produto WinThor opcional
                        hs("div", { children: [
                            hs("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }, children: [
                                lbl("Produto WinThor (opcional)"),
                                h("button", { type: "button", onClick: () => setMostrarBuscaProd(v => !v), style: { fontSize: "11px", padding: "2px 8px", borderRadius: "4px", border: "1px solid #d1d5db", background: "none", cursor: "pointer", color: "#6b7280" }, children: mostrarBuscaProd ? "Ocultar" : "Buscar produto" }),
                            ] }),
                            form.codprod ? h("div", { style: { fontSize: "12px", color: "#2563eb", marginBottom: "4px" }, children: `Produto vinculado: ${form.codprod} — ${form._prodDescricao || ""}` }) : null,
                            mostrarBuscaProd ? h(BuscaProdutoWinThor, { onSelecionado: p => { set("codprod", String(p.CODPROD)); set("_prodDescricao", p.DESCRICAO); setMostrarBuscaProd(false); } }) : null,
                        ] }),

                        h("p", { style: { fontSize: "12px", fontWeight: 700, margin: 0 }, children: "Informações de Aquisição e Garantia" }),
                        hs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "12px" }, children: [
                            hs("div", { children: [lbl("Data Aquisição"), h("input", { type: "date", style: inp, value: form.data_aquisicao, onChange: e => set("data_aquisicao", e.target.value) })] }),
                            hs("div", { children: [lbl("Valor (R$)"), h("input", { type: "number", style: inp, value: form.valor_aquisicao, onChange: e => set("valor_aquisicao", e.target.value), placeholder: "0,00" })] }),
                            hs("div", { children: [lbl("Fim Garantia"), h("input", { type: "date", style: inp, value: form.data_garantia_fim, onChange: e => set("data_garantia_fim", e.target.value) })] }),
                            hs("div", { children: [lbl("Vida Útil (anos)"), h("input", { type: "number", style: inp, value: form.vida_util_anos, onChange: e => set("vida_util_anos", e.target.value), placeholder: "Ex: 10" })] }),
                        ] }),

                        hs("div", { style: row2, children: [
                            hs("div", { children: [lbl("Ciclos Manutenção (dias)"), h("input", { type: "number", style: inp, value: form.ciclos_manutencao_dias, onChange: e => set("ciclos_manutencao_dias", e.target.value), placeholder: "Ex: 90, 180, 365" })] }),
                        ] }),

                        hs("div", { children: [lbl("Observações"), h("textarea", { style: { ...inp, minHeight: "60px" }, value: form.obs, onChange: e => set("obs", e.target.value) })] }),

                        erro ? h("div", { style: { background: "#fee2e2", color: "#991b1b", padding: "10px 14px", borderRadius: "6px", fontSize: "13px" }, children: erro }) : null,

                        hs("div", { style: { display: "flex", gap: "8px", justifyContent: "flex-end" }, children: [
                            h(Button, { variant: "outline", onClick: onClose, children: "Cancelar" }),
                            h(Button, { onClick: salvar, disabled: salvando, style: { background: "#d97706", color: "#fff", border: "none" }, children: salvando ? "Cadastrando..." : "Cadastrar Ativo" }),
                        ] }),
                    ],
                }),
            }),
        }),
    });
}

function DetalheAtivo({ ativo, onFechar, onAtualizado }) {
    const [editStatus, setEditStatus] = React.useState(ativo.STATUS);
    const [editLocal, setEditLocal] = React.useState(ativo.LOCAL || "");
    const [editObs, setEditObs] = React.useState(ativo.OBS || "");
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState("");
    const { score, label, color } = computeHealthScore(ativo);

    const salvar = async () => {
        setSalvando(true); setErro("");
        try {
            await apiFetch(`/api/engenharia/ativos/${ativo.ID}`, {
                method: "PATCH",
                body: JSON.stringify({ status: editStatus, local: editLocal, obs: editObs }),
            });
            onAtualizado();
        } catch (e) {
            setErro(e.message);
        } finally {
            setSalvando(false);
        }
    };

    const inp = { padding: "8px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px", width: "100%", boxSizing: "border-box" };
    const row = (lbl, val) => hs("div", { style: { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid hsl(var(--border))", fontSize: "13px" }, children: [
        h("span", { style: { color: "hsl(var(--muted-foreground))", fontWeight: 500 }, children: lbl }),
        h("span", { style: { fontWeight: 600, textAlign: "right" }, children: val || "—" }),
    ] });

    const garantiaVencendo = ativo.DATA_GARANTIA_FIM && new Date(`${String(ativo.DATA_GARANTIA_FIM).slice(0, 10)}T00:00:00`) < new Date(Date.now() + 30 * 86400000);

    return hs("div", {
        style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" },
        children: h(Card, {
            style: { width: "640px", maxHeight: "90vh", overflowY: "auto" },
            children: h(CardContent, {
                style: { padding: "24px" },
                children: hs("div", { style: { display: "flex", flexDirection: "column", gap: "14px" }, children: [
                    hs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" }, children: [
                        hs("div", { children: [
                            hs("div", { style: { display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px" }, children: [
                                h("span", { style: { fontFamily: "monospace", fontSize: "12px", fontWeight: 700, color: "#6b7280" }, children: ativo.CODIGO }),
                                h(StatusAtivoBadge, { status: ativo.STATUS }),
                            ] }),
                            h("h2", { style: { fontSize: "18px", fontWeight: 700, margin: 0 }, children: ativo.NOME }),
                        ] }),
                        h("button", { onClick: onFechar, style: { background: "none", border: "none", fontSize: "20px", cursor: "pointer" }, children: "×" }),
                    ] }),

                    // Health score
                    hs("div", { style: { background: "hsl(var(--muted))", borderRadius: "8px", padding: "12px 16px" }, children: [
                        hs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }, children: [
                            h("span", { style: { fontSize: "12px", fontWeight: 700, color: "hsl(var(--muted-foreground))" }, children: "ÍNDICE DE SAÚDE DO ATIVO" }),
                            h("span", { style: { fontSize: "20px", fontWeight: 900, color } }, `${score}%`),
                        ] }),
                        h("div", { style: { height: "8px", background: "#e5e7eb", borderRadius: "4px", overflow: "hidden" }, children: h("div", { style: { height: "100%", width: `${score}%`, background: color, borderRadius: "4px", transition: "width .5s" } }) }),
                        h("span", { style: { fontSize: "11px", color, marginTop: "4px", display: "block" }, children: label }),
                    ] }),

                    garantiaVencendo ? h("div", { style: { background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: "6px", padding: "8px 12px", fontSize: "12px", color: "#92400e", fontWeight: 600 }, children: `⚠️ Garantia vence em ${formatDate(ativo.DATA_GARANTIA_FIM)}` }) : null,

                    hs("div", { style: { display: "flex", flexDirection: "column" }, children: [
                        row("Categoria", `${ativo.CATEGORIA || "—"} / ${ativo.SUBCATEGORIA || "—"}`),
                        row("Fabricante / Modelo", `${ativo.FABRICANTE || "—"} / ${ativo.MODELO || "—"}`),
                        row("Nº de Série", ativo.NUM_SERIE),
                        row("Filial", `${ativo.CODFILIAL || "—"} — ${ativo.NOME_FILIAL || "—"}`),
                        row("Local", ativo.LOCAL),
                        row("Data de Aquisição", formatDate(ativo.DATA_AQUISICAO)),
                        row("Valor de Aquisição", formatMoney(ativo.VALOR_AQUISICAO)),
                        row("Fim de Garantia", formatDate(ativo.DATA_GARANTIA_FIM)),
                        row("Vida Útil", ativo.VIDA_UTIL_ANOS ? `${ativo.VIDA_UTIL_ANOS} anos` : "—"),
                        row("Ciclo de Manutenção", ativo.CICLOS_MANUTENCAO_DIAS ? `${ativo.CICLOS_MANUTENCAO_DIAS} dias` : "—"),
                        row("Última Manutenção", formatDate(ativo.ULTIMA_MANUTENCAO)),
                        row("Próxima Manutenção", formatDate(ativo.PROXIMA_MANUTENCAO)),
                    ] }),

                    h("p", { style: { fontSize: "12px", fontWeight: 700, margin: 0 }, children: "Atualizar" }),
                    hs("div", { style: { display: "grid", gridTemplateColumns: "1fr 2fr", gap: "12px" }, children: [
                        hs("div", { children: [
                            h("label", { style: { fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }, children: "Status" }),
                            h("select", { style: inp, value: editStatus, onChange: e => setEditStatus(e.target.value), children: ["ATIVO", "INATIVO", "MANUTENCAO", "DESCARTADO"].map(s => h("option", { key: s, value: s, children: s })) }),
                        ] }),
                        hs("div", { children: [
                            h("label", { style: { fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }, children: "Local" }),
                            h("input", { style: inp, value: editLocal, onChange: e => setEditLocal(e.target.value) }),
                        ] }),
                    ] }),
                    hs("div", { children: [
                        h("label", { style: { fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }, children: "Observações" }),
                        h("textarea", { style: { ...inp, minHeight: "60px" }, value: editObs, onChange: e => setEditObs(e.target.value) }),
                    ] }),

                    erro ? h("div", { style: { background: "#fee2e2", color: "#991b1b", padding: "10px 14px", borderRadius: "6px", fontSize: "13px" }, children: erro }) : null,

                    hs("div", { style: { display: "flex", gap: "8px", justifyContent: "flex-end" }, children: [
                        h(Button, { variant: "outline", onClick: onFechar, children: "Fechar" }),
                        h(Button, { onClick: salvar, disabled: salvando, style: { background: "#d97706", color: "#fff", border: "none" }, children: salvando ? "Salvando..." : "Salvar" }),
                    ] }),
                ] }),
            }),
        }),
    });
}

export default function EngenhariaAtivosPage() {
    const [lista, setLista] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState("");
    const [sucesso, setSucesso] = React.useState("");
    const [filtStatus, setFiltStatus] = React.useState("");
    const [filtCategoria, setFiltCategoria] = React.useState("");
    const [filtQ, setFiltQ] = React.useState("");
    const [modalNovo, setModalNovo] = React.useState(false);
    const [ativoDetalhe, setAtivoDetalhe] = React.useState(null);

    const carregar = React.useCallback(async () => {
        setErro("");
        try {
            const q = new URLSearchParams();
            if (filtStatus) q.set("status", filtStatus);
            if (filtCategoria) q.set("categoria", filtCategoria);
            if (filtQ) q.set("q", filtQ);
            const data = await apiFetch(`/api/engenharia/ativos?${q}`);
            setLista(Array.isArray(data) ? data : []);
        } catch (e) {
            setErro(e.message || "Erro ao carregar ativos.");
        } finally {
            setLoading(false);
        }
    }, [filtStatus, filtCategoria, filtQ]);

    React.useEffect(() => { carregar(); }, [carregar]);

    const inp = { padding: "7px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px" };
    const hojeMs = Date.now();
    const em30Dias = hojeMs + 30 * 86400000;

    // Métricas rápidas
    const totais = lista.reduce((acc, a) => {
        acc.total++;
        if (a.STATUS === "ATIVO") acc.ativos++;
        if (a.STATUS === "MANUTENCAO") acc.manutencao++;
        const hs = computeHealthScore(a);
        if (hs.score < 40) acc.criticos++;
        return acc;
    }, { total: 0, ativos: 0, manutencao: 0, criticos: 0 });

    return hs("div", {
        style: { padding: "24px", maxWidth: "1400px", margin: "0 auto" },
        children: [
            hs("div", {
                style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", flexWrap: "wrap", gap: "12px" },
                children: [
                    hs("div", { children: [
                        h("h1", { style: { fontSize: "22px", fontWeight: 700, margin: "0 0 4px 0" }, children: "Ativos / Equipamentos" }),
                        h("p", { style: { fontSize: "13px", color: "hsl(var(--muted-foreground))", margin: 0 }, children: "Registro e gestão do patrimônio técnico" }),
                    ] }),
                    hs("div", { style: { display: "flex", gap: "8px" }, children: [
                        h(Button, { variant: "outline", onClick: carregar, style: { fontSize: "12px" }, children: "↻ Atualizar" }),
                        h(Button, { onClick: () => setModalNovo(true), style: { background: "#d97706", color: "#fff", border: "none", fontSize: "12px" }, children: "+ Cadastrar Ativo" }),
                    ] }),
                ],
            }),

            // Métricas resumo
            !loading ? h("div", {
                style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "10px", marginBottom: "16px" },
                children: [
                    h(Card, { children: h(CardContent, { style: { padding: "12px 16px" }, children: hs("div", { children: [h("p", { style: { fontSize: "11px", color: "hsl(var(--muted-foreground))", margin: "0 0 4px" }, children: "TOTAL" }), h("p", { style: { fontSize: "22px", fontWeight: 700, margin: 0 }, children: totais.total })] }) }) }),
                    h(Card, { children: h(CardContent, { style: { padding: "12px 16px" }, children: hs("div", { children: [h("p", { style: { fontSize: "11px", color: "hsl(var(--muted-foreground))", margin: "0 0 4px" }, children: "ATIVOS" }), h("p", { style: { fontSize: "22px", fontWeight: 700, margin: 0, color: "#16a34a" }, children: totais.ativos })] }) }) }),
                    h(Card, { children: h(CardContent, { style: { padding: "12px 16px" }, children: hs("div", { children: [h("p", { style: { fontSize: "11px", color: "hsl(var(--muted-foreground))", margin: "0 0 4px" }, children: "EM MANUTENÇÃO" }), h("p", { style: { fontSize: "22px", fontWeight: 700, margin: 0, color: "#d97706" }, children: totais.manutencao })] }) }) }),
                    h(Card, { children: h(CardContent, { style: { padding: "12px 16px" }, children: hs("div", { children: [h("p", { style: { fontSize: "11px", color: "hsl(var(--muted-foreground))", margin: "0 0 4px" }, children: "SAÚDE CRÍTICA" }), h("p", { style: { fontSize: "22px", fontWeight: 700, margin: 0, color: totais.criticos > 0 ? "#dc2626" : "#16a34a" }, children: totais.criticos })] }) }) }),
                ],
            }) : null,

            h(Card, {
                style: { marginBottom: "16px" },
                children: h(CardContent, {
                    style: { padding: "12px 16px" },
                    children: hs("div", {
                        style: { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" },
                        children: [
                            h("input", { style: { ...inp, minWidth: "200px" }, value: filtQ, onChange: e => setFiltQ(e.target.value), placeholder: "Buscar por nome ou código...", onKeyDown: e => e.key === "Enter" && carregar() }),
                            h("select", { style: inp, value: filtStatus, onChange: e => setFiltStatus(e.target.value), children: [h("option", { value: "", children: "Todos os status" }), ...["ATIVO", "INATIVO", "MANUTENCAO", "DESCARTADO"].map(s => h("option", { key: s, value: s, children: s }))] }),
                            h("input", { style: inp, value: filtCategoria, onChange: e => setFiltCategoria(e.target.value), placeholder: "Categoria..." }),
                            h(Button, { variant: "outline", style: { fontSize: "12px" }, onClick: carregar, children: "Buscar" }),
                        ],
                    }),
                }),
            }),

            erro ? h("div", { style: { background: "#fee2e2", color: "#991b1b", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }, children: erro }) : null,
            sucesso ? hs("div", { style: { background: "#dcfce7", color: "#166534", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px", display: "flex", justifyContent: "space-between" }, children: [sucesso, h("span", { style: { cursor: "pointer", fontWeight: 700 }, onClick: () => setSucesso(""), children: "×" })] }) : null,

            loading
                ? h("p", { style: { fontSize: "14px", color: "#6b7280" }, children: "Carregando ativos..." })
                : lista.length === 0
                    ? h("p", { style: { fontSize: "14px", color: "#6b7280", textAlign: "center", padding: "40px" }, children: "Nenhum ativo encontrado." })
                    : h("div", {
                        style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "12px" },
                        children: lista.map((ativo, i) => {
                            const garantiaAlert = ativo.DATA_GARANTIA_FIM && new Date(`${String(ativo.DATA_GARANTIA_FIM).slice(0, 10)}T00:00:00`).getTime() < em30Dias;
                            const manutAlert = ativo.PROXIMA_MANUTENCAO && new Date(`${String(ativo.PROXIMA_MANUTENCAO).slice(0, 10)}T00:00:00`).getTime() < em30Dias;
                            const { score, color } = computeHealthScore(ativo);
                            return h(Card, {
                                key: ativo.ID || i,
                                style: { cursor: "pointer", border: score < 40 ? "2px solid #fca5a5" : garantiaAlert || manutAlert ? "2px solid #fcd34d" : undefined },
                                onClick: () => setAtivoDetalhe(ativo),
                                children: h(CardContent, {
                                    style: { padding: "16px" },
                                    children: hs("div", { style: { display: "flex", flexDirection: "column", gap: "10px" }, children: [
                                        hs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" }, children: [
                                            hs("div", { style: { flex: 1, minWidth: 0 }, children: [
                                                h("p", { style: { fontSize: "11px", fontFamily: "monospace", color: "hsl(var(--muted-foreground))", margin: "0 0 2px" }, children: ativo.CODIGO }),
                                                h("p", { style: { fontSize: "14px", fontWeight: 700, margin: "0 0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: ativo.NOME }),
                                                h(StatusAtivoBadge, { status: ativo.STATUS }),
                                            ] }),
                                            h("div", { style: { fontSize: "18px", fontWeight: 900, color, marginLeft: "8px", flexShrink: 0 }, children: `${score}` }),
                                        ] }),

                                        h(HealthBar, { ativo }),

                                        hs("div", { style: { fontSize: "11px", color: "hsl(var(--muted-foreground))", display: "flex", justifyContent: "space-between" }, children: [
                                            h("span", { children: ativo.CATEGORIA || "Sem categoria" }),
                                            h("span", { children: `Filial ${ativo.CODFILIAL || "—"}` }),
                                        ] }),

                                        (garantiaAlert || manutAlert) ? h("div", { style: { fontSize: "11px", color: "#92400e", background: "#fef3c7", borderRadius: "4px", padding: "3px 8px" }, children: garantiaAlert ? `⚠️ Garantia: ${formatDate(ativo.DATA_GARANTIA_FIM)}` : `⚠️ Manutenção: ${formatDate(ativo.PROXIMA_MANUTENCAO)}` }) : null,
                                    ] }),
                                }),
                            });
                        }),
                    }),

            modalNovo ? h(ModalNovoAtivo, { onClose: () => setModalNovo(false), onCriado: () => { setModalNovo(false); setSucesso("Ativo cadastrado com sucesso!"); carregar(); } }) : null,
            ativoDetalhe ? h(DetalheAtivo, { ativo: ativoDetalhe, onFechar: () => setAtivoDetalhe(null), onAtualizado: () => { setAtivoDetalhe(null); carregar(); } }) : null,
        ],
    });
}
