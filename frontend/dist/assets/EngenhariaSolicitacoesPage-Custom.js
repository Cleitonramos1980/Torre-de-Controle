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

function formatDateTime(v) {
    if (!v) return "—";
    const d = new Date(v);
    if (isNaN(d)) return String(v);
    return d.toLocaleString("pt-BR");
}

function PriorBadge({ p }) {
    const map = { P0: { bg: "#fee2e2", color: "#991b1b" }, P1: { bg: "#fef3c7", color: "#92400e" }, P2: { bg: "#dbeafe", color: "#1e40af" }, P3: { bg: "#dcfce7", color: "#166534" } };
    const s = map[p] || { bg: "#f3f4f6", color: "#374151" };
    return h("span", { style: { background: s.bg, color: s.color, padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700 }, children: p || "—" });
}

function StatusSolBadge({ status }) {
    const map = {
        ABERTA: { bg: "#fef3c7", color: "#92400e" },
        EM_TRIAGEM: { bg: "#dbeafe", color: "#1e40af" },
        AGUARDANDO_OS: { bg: "#ede9fe", color: "#6d28d9" },
        EM_ANDAMENTO: { bg: "#fef9c3", color: "#713f12" },
        CONCLUIDA: { bg: "#dcfce7", color: "#166534" },
        CANCELADA: { bg: "#f3f4f6", color: "#6b7280" },
    };
    const s = map[status] || { bg: "#f3f4f6", color: "#374151" };
    return h("span", { style: { background: s.bg, color: s.color, padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700 }, children: status || "—" });
}

const STATUS_LIST = ["ABERTA", "EM_TRIAGEM", "AGUARDANDO_OS", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"];
const PRIORIDADE_LIST = ["P0", "P1", "P2", "P3"];
const TIPO_LIST = ["CORRETIVA", "PREVENTIVA", "MELHORIA", "EMERGENCIA"];

function LookupTecnico({ valor, onChange }) {
    const [query, setQuery] = React.useState(valor || "");
    const [resultados, setResultados] = React.useState([]);
    const [buscando, setBuscando] = React.useState(false);

    const buscar = async (q) => {
        if (q.trim().length < 2) { setResultados([]); return; }
        setBuscando(true);
        try {
            const r = await apiFetch(`/api/engenharia/tecnicos?q=${encodeURIComponent(q.trim())}`);
            setResultados(Array.isArray(r) ? r : []);
        } catch { setResultados([]); } finally { setBuscando(false); }
    };

    return hs("div", {
        style: { position: "relative" },
        children: [
            h("input", {
                style: { padding: "8px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px", width: "100%", boxSizing: "border-box" },
                value: query, placeholder: "Digite para buscar técnico WinThor...",
                onChange: e => { setQuery(e.target.value); onChange(e.target.value, null); buscar(e.target.value); },
            }),
            buscando ? h("span", { style: { fontSize: "11px", color: "#6b7280", position: "absolute", right: "8px", top: "10px" }, children: "…" }) : null,
            resultados.length > 0 ? h("div", {
                style: { position: "absolute", zIndex: 10, left: 0, right: 0, background: "white", border: "1px solid #d1d5db", borderRadius: "6px", maxHeight: "160px", overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", fontSize: "12px", marginTop: "2px" },
                children: resultados.map(t => h("div", {
                    key: t.MATRICULA,
                    style: { padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #f3f4f6" },
                    onClick: () => { const val = `${t.NOME} (${t.MATRICULA})`; setQuery(val); onChange(val, t.MATRICULA); setResultados([]); },
                    children: `${t.MATRICULA} — ${t.NOME}${t.FUNCAO ? ` (${t.FUNCAO})` : ""}`,
                })),
            }) : null,
        ],
    });
}

function ModalNovaSolicitacao({ onClose, onCriada }) {
    const [form, setForm] = React.useState({
        titulo: "", descricao: "", tipo: "CORRETIVA", prioridade: "P2",
        codfilial: "", nome_filial: "", categoria: "", local_especifico: "",
        solicitante_nome: "", solicitante_email: "", solicitante_fone: "",
    });
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState("");
    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const salvar = async () => {
        if (!form.titulo.trim()) { setErro("Título obrigatório."); return; }
        if (!form.codfilial.trim()) { setErro("Filial obrigatória."); return; }
        setSalvando(true); setErro("");
        try {
            const body = {
                titulo: form.titulo.trim(),
                descricao: form.descricao || undefined,
                tipo: form.tipo, prioridade: form.prioridade,
                codfilial: form.codfilial.trim(),
                nome_filial: form.nome_filial || undefined,
                categoria: form.categoria || undefined,
                local_especifico: form.local_especifico || undefined,
                solicitante_nome: form.solicitante_nome || undefined,
                solicitante_email: form.solicitante_email || undefined,
                solicitante_fone: form.solicitante_fone || undefined,
            };
            const res = await apiFetch("/api/engenharia/solicitacoes", { method: "POST", body: JSON.stringify(body) });
            onCriada(res);
        } catch (e) {
            setErro(e.message || "Erro ao registrar solicitação.");
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
            style: { width: "600px", maxHeight: "90vh", overflowY: "auto" },
            children: h(CardContent, {
                style: { padding: "24px" },
                children: hs("div", {
                    style: { display: "flex", flexDirection: "column", gap: "14px" },
                    children: [
                        hs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
                            h("h2", { style: { fontSize: "18px", fontWeight: 700, margin: 0 }, children: "Nova Solicitação de Serviço" }),
                            h("button", { onClick: onClose, style: { background: "none", border: "none", fontSize: "20px", cursor: "pointer" }, children: "×" }),
                        ] }),

                        hs("div", { children: [lbl("Título *"), h("input", { style: inp, value: form.titulo, onChange: e => set("titulo", e.target.value), placeholder: "Descreva brevemente o problema ou necessidade" })] }),
                        hs("div", { children: [lbl("Descrição detalhada"), h("textarea", { style: { ...inp, minHeight: "80px", resize: "vertical" }, value: form.descricao, onChange: e => set("descricao", e.target.value), placeholder: "Inclua detalhes, localização exata, urgência..." })] }),

                        hs("div", { style: row2, children: [
                            hs("div", { children: [lbl("Tipo"), h("select", { style: inp, value: form.tipo, onChange: e => set("tipo", e.target.value), children: TIPO_LIST.map(t => h("option", { key: t, value: t, children: t })) })] }),
                            hs("div", { children: [lbl("Prioridade"), h("select", { style: inp, value: form.prioridade, onChange: e => set("prioridade", e.target.value), children: PRIORIDADE_LIST.map(p => h("option", { key: p, value: p, children: `${p} — ${p === "P0" ? "Emergência" : p === "P1" ? "Urgente (24h)" : p === "P2" ? "Normal (72h)" : "Baixa (7d)"}` })) })] }),
                        ] }),

                        hs("div", { style: row2, children: [
                            hs("div", { children: [lbl("Filial (código) *"), h("input", { style: inp, value: form.codfilial, onChange: e => set("codfilial", e.target.value), placeholder: "Ex: 1, 2, 10..." })] }),
                            hs("div", { children: [lbl("Nome da Filial"), h("input", { style: inp, value: form.nome_filial, onChange: e => set("nome_filial", e.target.value), placeholder: "Nome da loja" })] }),
                        ] }),

                        hs("div", { style: row2, children: [
                            hs("div", { children: [lbl("Categoria"), h("input", { style: inp, value: form.categoria, onChange: e => set("categoria", e.target.value), placeholder: "Ex: Elétrica, Hidráulica, AVAC..." })] }),
                            hs("div", { children: [lbl("Local Específico"), h("input", { style: inp, value: form.local_especifico, onChange: e => set("local_especifico", e.target.value), placeholder: "Ex: Sala de vendas, Depósito..." })] }),
                        ] }),

                        h("p", { style: { fontSize: "12px", fontWeight: 700, color: "#374151", margin: 0 }, children: "Solicitante" }),
                        hs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }, children: [
                            hs("div", { children: [lbl("Nome"), h("input", { style: inp, value: form.solicitante_nome, onChange: e => set("solicitante_nome", e.target.value), placeholder: "Nome do solicitante" })] }),
                            hs("div", { children: [lbl("E-mail"), h("input", { style: inp, value: form.solicitante_email, onChange: e => set("solicitante_email", e.target.value), placeholder: "email@empresa.com" })] }),
                            hs("div", { children: [lbl("Telefone"), h("input", { style: inp, value: form.solicitante_fone, onChange: e => set("solicitante_fone", e.target.value), placeholder: "(00) 00000-0000" })] }),
                        ] }),

                        erro ? h("div", { style: { background: "#fee2e2", color: "#991b1b", padding: "10px 14px", borderRadius: "6px", fontSize: "13px" }, children: erro }) : null,

                        hs("div", { style: { display: "flex", gap: "8px", justifyContent: "flex-end" }, children: [
                            h(Button, { variant: "outline", onClick: onClose, children: "Cancelar" }),
                            h(Button, { onClick: salvar, disabled: salvando, style: { background: "#2563eb", color: "#fff", border: "none" }, children: salvando ? "Registrando..." : "Registrar Solicitação" }),
                        ] }),
                    ],
                }),
            }),
        }),
    });
}

function ModalTriagem({ sol, onClose, onSalvo }) {
    const [form, setForm] = React.useState({
        tipo_servico: "", classificacao: "",
        prioridade_ajustada: sol.PRIORIDADE || "P2",
        requer_visita: false, requer_material: false, requer_terceiro: false,
        obs_tecnico: "", estimativa_horas: "", estimativa_custo: "",
        tecnico_nome: "", tecnico_matricula: "",
    });
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState("");
    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const salvar = async () => {
        setSalvando(true); setErro("");
        try {
            await apiFetch("/api/engenharia/triagem", {
                method: "POST",
                body: JSON.stringify({
                    solicitacao_id: sol.ID,
                    tipo_servico: form.tipo_servico || undefined,
                    classificacao: form.classificacao || undefined,
                    prioridade_ajustada: form.prioridade_ajustada || undefined,
                    requer_visita: form.requer_visita ? 1 : 0,
                    requer_material: form.requer_material ? 1 : 0,
                    requer_terceiro: form.requer_terceiro ? 1 : 0,
                    obs_tecnico: form.obs_tecnico || undefined,
                    estimativa_horas: form.estimativa_horas ? Number(form.estimativa_horas) : undefined,
                    estimativa_custo: form.estimativa_custo ? Number(form.estimativa_custo) : undefined,
                    tecnico_nome: form.tecnico_nome || undefined,
                    tecnico_matricula: form.tecnico_matricula || undefined,
                }),
            });
            onSalvo();
        } catch (e) {
            setErro(e.message || "Erro ao salvar triagem.");
        } finally {
            setSalvando(false);
        }
    };

    const inp = { padding: "8px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px", width: "100%", boxSizing: "border-box" };
    const lbl = (t) => h("label", { style: { fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }, children: t });

    return hs("div", {
        style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" },
        children: h(Card, {
            style: { width: "600px", maxHeight: "92vh", overflowY: "auto" },
            children: h(CardContent, {
                style: { padding: "24px" },
                children: hs("div", {
                    style: { display: "flex", flexDirection: "column", gap: "14px" },
                    children: [
                        hs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
                            h("h2", { style: { fontSize: "16px", fontWeight: 700, margin: 0 }, children: "Triagem Técnica" }),
                            h("button", { onClick: onClose, style: { background: "none", border: "none", fontSize: "20px", cursor: "pointer" }, children: "×" }),
                        ] }),
                        h("div", { style: { background: "hsl(var(--muted))", borderRadius: "6px", padding: "10px 12px", fontSize: "13px" }, children: h("strong", { children: sol.TITULO }) }),

                        hs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }, children: [
                            hs("div", { children: [lbl("Tipo de Serviço"), h("input", { style: inp, value: form.tipo_servico, onChange: e => set("tipo_servico", e.target.value), placeholder: "Ex: Elétrico, Civil, AVAC..." })] }),
                            hs("div", { children: [lbl("Prioridade Ajustada"), h("select", { style: inp, value: form.prioridade_ajustada, onChange: e => set("prioridade_ajustada", e.target.value), children: PRIORIDADE_LIST.map(p => h("option", { key: p, value: p, children: p })) })] }),
                        ] }),

                        hs("div", { children: [lbl("Classificação"), h("input", { style: inp, value: form.classificacao, onChange: e => set("classificacao", e.target.value), placeholder: "Ex: Manutenção corretiva emergencial..." })] }),

                        // Técnico responsável com lookup WinThor
                        hs("div", { children: [
                            lbl("Técnico Responsável (WinThor)"),
                            h(LookupTecnico, {
                                valor: form.tecnico_nome,
                                onChange: (nome, matricula) => { set("tecnico_nome", nome); if (matricula) set("tecnico_matricula", matricula); },
                            }),
                            form.tecnico_matricula ? h("p", { style: { fontSize: "11px", color: "#2563eb", margin: "2px 0 0" }, children: `Matrícula: ${form.tecnico_matricula}` }) : null,
                        ] }),

                        hs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }, children: [
                            hs("div", { children: [lbl("Estimativa (horas)"), h("input", { type: "number", step: "0.5", style: inp, value: form.estimativa_horas, onChange: e => set("estimativa_horas", e.target.value), placeholder: "0" })] }),
                            hs("div", { children: [lbl("Estimativa de Custo (R$)"), h("input", { type: "number", style: inp, value: form.estimativa_custo, onChange: e => set("estimativa_custo", e.target.value), placeholder: "0,00" })] }),
                        ] }),

                        hs("div", { children: [lbl("Observação Técnica"), h("textarea", { style: { ...inp, minHeight: "80px" }, value: form.obs_tecnico, onChange: e => set("obs_tecnico", e.target.value), placeholder: "Diagnóstico e recomendações..." })] }),

                        hs("div", { style: { display: "flex", gap: "20px", flexWrap: "wrap" }, children: [
                            hs("label", { style: { display: "flex", gap: "6px", alignItems: "center", fontSize: "13px", cursor: "pointer" }, children: [h("input", { type: "checkbox", checked: form.requer_visita, onChange: e => set("requer_visita", e.target.checked) }), "Requer Visita Prévia"] }),
                            hs("label", { style: { display: "flex", gap: "6px", alignItems: "center", fontSize: "13px", cursor: "pointer" }, children: [h("input", { type: "checkbox", checked: form.requer_material, onChange: e => set("requer_material", e.target.checked) }), "Requer Materiais"] }),
                            hs("label", { style: { display: "flex", gap: "6px", alignItems: "center", fontSize: "13px", cursor: "pointer" }, children: [h("input", { type: "checkbox", checked: form.requer_terceiro, onChange: e => set("requer_terceiro", e.target.checked) }), "Requer Empresa Terceirizada"] }),
                        ] }),

                        erro ? h("div", { style: { background: "#fee2e2", color: "#991b1b", padding: "10px 14px", borderRadius: "6px", fontSize: "13px" }, children: erro }) : null,

                        hs("div", { style: { display: "flex", gap: "8px", justifyContent: "flex-end" }, children: [
                            h(Button, { variant: "outline", onClick: onClose, children: "Cancelar" }),
                            h(Button, { onClick: salvar, disabled: salvando, style: { background: "#7c3aed", color: "#fff", border: "none" }, children: salvando ? "Salvando..." : "Concluir Triagem" }),
                        ] }),
                    ],
                }),
            }),
        }),
    });
}

export default function EngenhariaSolicitacoesPage() {
    const params = new URLSearchParams(window.location.search);
    const [lista, setLista] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState("");
    const [sucesso, setSucesso] = React.useState("");
    const [filtStatus, setFiltStatus] = React.useState(params.get("status") || "");
    const [filtPrioridade, setFiltPrioridade] = React.useState("");
    const [modalNova, setModalNova] = React.useState(false);
    const [modalTriagem, setModalTriagem] = React.useState(null);
    const [expandedId, setExpandedId] = React.useState(null);

    const carregar = React.useCallback(async () => {
        setErro("");
        try {
            const q = new URLSearchParams();
            if (filtStatus) q.set("status", filtStatus);
            if (filtPrioridade) q.set("prioridade", filtPrioridade);
            const data = await apiFetch(`/api/engenharia/solicitacoes?${q}`);
            setLista(Array.isArray(data) ? data : []);
        } catch (e) {
            setErro(e.message || "Erro ao carregar solicitações.");
        } finally {
            setLoading(false);
        }
    }, [filtStatus, filtPrioridade]);

    React.useEffect(() => { carregar(); }, [carregar]);

    const criarOS = async (sol) => {
        try {
            const res = await apiFetch("/api/engenharia/os", {
                method: "POST",
                body: JSON.stringify({
                    titulo: sol.TITULO,
                    descricao: sol.DESCRICAO,
                    tipo: sol.TIPO || "CORRETIVA",
                    prioridade: sol.PRIORIDADE || "P2",
                    codfilial: sol.CODFILIAL,
                    nome_filial: sol.NOME_FILIAL,
                    solicitacao_id: sol.ID,
                }),
            });
            setSucesso(`OS ${res.numero || res.NUMERO} criada com sucesso!`);
            carregar();
        } catch (e) { setErro(e.message); }
    };

    const inp = { padding: "7px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px" };

    // Contadores por status para kanban-like summary
    const counts = lista.reduce((acc, s) => { acc[s.STATUS] = (acc[s.STATUS] || 0) + 1; return acc; }, {});

    return hs("div", {
        style: { padding: "24px", maxWidth: "1400px", margin: "0 auto" },
        children: [
            hs("div", {
                style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", flexWrap: "wrap", gap: "12px" },
                children: [
                    hs("div", { children: [
                        h("h1", { style: { fontSize: "22px", fontWeight: 700, margin: "0 0 4px 0" }, children: "Solicitações de Serviço" }),
                        h("p", { style: { fontSize: "13px", color: "hsl(var(--muted-foreground))", margin: 0 }, children: "Registre e acompanhe solicitações das lojas e setores" }),
                    ] }),
                    hs("div", { style: { display: "flex", gap: "8px" }, children: [
                        h(Button, { variant: "outline", onClick: carregar, style: { fontSize: "12px" }, children: "↻ Atualizar" }),
                        h(Button, { onClick: () => setModalNova(true), style: { background: "#2563eb", color: "#fff", border: "none", fontSize: "12px" }, children: "+ Nova Solicitação" }),
                    ] }),
                ],
            }),

            // Sumário por status
            !loading && lista.length > 0 ? h("div", {
                style: { display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" },
                children: STATUS_LIST.filter(s => counts[s]).map(s => hs("button", {
                    key: s, onClick: () => setFiltStatus(filtStatus === s ? "" : s),
                    style: { padding: "4px 12px", borderRadius: "9999px", border: "none", cursor: "pointer", fontSize: "12px", fontWeight: 600, background: filtStatus === s ? "#2563eb" : "hsl(var(--muted))", color: filtStatus === s ? "#fff" : "hsl(var(--muted-foreground))" },
                    children: [`${s} `, h("span", { style: { background: "rgba(255,255,255,0.3)", padding: "1px 6px", borderRadius: "9999px", fontSize: "11px" }, children: counts[s] })],
                })),
            }) : null,

            h(Card, {
                style: { marginBottom: "16px" },
                children: h(CardContent, {
                    style: { padding: "12px 16px" },
                    children: hs("div", {
                        style: { display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" },
                        children: [
                            h("label", { style: { fontSize: "12px", fontWeight: 600 }, children: "Filtros:" }),
                            h("select", { style: inp, value: filtStatus, onChange: e => setFiltStatus(e.target.value), children: [h("option", { value: "", children: "Todos os status" }), ...STATUS_LIST.map(s => h("option", { key: s, value: s, children: s }))] }),
                            h("select", { style: inp, value: filtPrioridade, onChange: e => setFiltPrioridade(e.target.value), children: [h("option", { value: "", children: "Todas as prioridades" }), ...PRIORIDADE_LIST.map(p => h("option", { key: p, value: p, children: p }))] }),
                            h(Button, { variant: "outline", style: { fontSize: "12px" }, onClick: carregar, children: "Filtrar" }),
                        ],
                    }),
                }),
            }),

            erro ? h("div", { style: { background: "#fee2e2", color: "#991b1b", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }, children: erro }) : null,
            sucesso ? hs("div", { style: { background: "#dcfce7", color: "#166534", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px", display: "flex", justifyContent: "space-between" }, children: [sucesso, h("span", { style: { cursor: "pointer", fontWeight: 700 }, onClick: () => setSucesso(""), children: "×" })] }) : null,

            h(Card, {
                children: h(CardContent, {
                    style: { padding: "0" },
                    children: loading
                        ? h("p", { style: { padding: "24px", fontSize: "14px", color: "#6b7280" }, children: "Carregando solicitações..." })
                        : lista.length === 0
                            ? h("p", { style: { padding: "24px", fontSize: "14px", color: "#6b7280", textAlign: "center" }, children: "Nenhuma solicitação encontrada." })
                            : h("div", {
                                children: lista.map((sol, i) => hs("div", {
                                    key: sol.ID || i,
                                    style: { borderBottom: i < lista.length - 1 ? "1px solid hsl(var(--border))" : "none" },
                                    children: [
                                        hs("div", {
                                            style: { padding: "16px 20px", cursor: "pointer", display: "flex", gap: "14px", alignItems: "flex-start" },
                                            onClick: () => setExpandedId(expandedId === sol.ID ? null : sol.ID),
                                            children: [
                                                h("div", { style: { width: "4px", minHeight: "48px", borderRadius: "2px", background: sol.PRIORIDADE === "P0" ? "#dc2626" : sol.PRIORIDADE === "P1" ? "#d97706" : sol.PRIORIDADE === "P2" ? "#2563eb" : "#16a34a", flexShrink: 0 } }),
                                                hs("div", { style: { flex: 1, minWidth: 0 }, children: [
                                                    hs("div", { style: { display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px", flexWrap: "wrap" }, children: [
                                                        h("span", { style: { fontWeight: 700, fontSize: "14px" }, children: sol.TITULO }),
                                                        h(StatusSolBadge, { status: sol.STATUS }),
                                                        h(PriorBadge, { p: sol.PRIORIDADE }),
                                                        h("span", { style: { fontSize: "11px", background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))", padding: "2px 6px", borderRadius: "4px" }, children: sol.TIPO }),
                                                    ] }),
                                                    hs("div", { style: { display: "flex", gap: "16px", fontSize: "12px", color: "hsl(var(--muted-foreground))", flexWrap: "wrap" }, children: [
                                                        h("span", { children: `Filial: ${sol.CODFILIAL}${sol.NOME_FILIAL ? ` — ${sol.NOME_FILIAL}` : ""}` }),
                                                        sol.CATEGORIA ? h("span", { children: `Cat: ${sol.CATEGORIA}` }) : null,
                                                        sol.LOCAL_ESPECIFICO ? h("span", { children: `Local: ${sol.LOCAL_ESPECIFICO}` }) : null,
                                                        h("span", { children: `Criado: ${formatDateTime(sol.CRIADO_EM)}` }),
                                                    ] }),
                                                ] }),
                                                hs("div", { style: { display: "flex", gap: "6px", flexShrink: 0, flexWrap: "wrap" }, children: [
                                                    sol.STATUS === "ABERTA" ? h(Button, { style: { fontSize: "11px", padding: "4px 8px", background: "#7c3aed", color: "#fff", border: "none" }, onClick: e => { e.stopPropagation(); setModalTriagem(sol); }, children: "Triagem" }) : null,
                                                    sol.STATUS !== "CONCLUIDA" && sol.STATUS !== "CANCELADA" && !sol.OS_ID ? h(Button, { style: { fontSize: "11px", padding: "4px 8px", background: "#16a34a", color: "#fff", border: "none" }, onClick: e => { e.stopPropagation(); criarOS(sol); }, children: "Criar OS" }) : null,
                                                    sol.OS_ID ? h("span", { style: { fontSize: "11px", background: "#dcfce7", color: "#166534", padding: "4px 8px", borderRadius: "4px", fontWeight: 600 }, children: "OS vinculada" }) : null,
                                                ] }),
                                            ],
                                        }),

                                        expandedId === sol.ID ? h("div", {
                                            style: { padding: "0 20px 16px 38px", display: "flex", flexDirection: "column", gap: "6px" },
                                            children: [
                                                sol.DESCRICAO ? h("p", { style: { fontSize: "13px", color: "hsl(var(--muted-foreground))", margin: "0 0 6px" }, children: sol.DESCRICAO }) : null,
                                                sol.SOLICITANTE_NOME ? hs("div", { style: { fontSize: "12px", display: "flex", gap: "16px", flexWrap: "wrap" }, children: [
                                                    h("span", { children: `Solicitante: ${sol.SOLICITANTE_NOME}` }),
                                                    sol.SOLICITANTE_EMAIL ? h("span", { children: sol.SOLICITANTE_EMAIL }) : null,
                                                    sol.SOLICITANTE_FONE ? h("span", { children: sol.SOLICITANTE_FONE }) : null,
                                                ] }) : null,
                                                sol.OBS_TRIAGEM ? h("div", { style: { background: "#ede9fe", borderRadius: "6px", padding: "8px 12px", fontSize: "12px", color: "#6d28d9" }, children: `Triagem: ${sol.OBS_TRIAGEM}` }) : null,
                                            ],
                                        }) : null,
                                    ],
                                })),
                            }),
                }),
            }),

            modalNova ? h(ModalNovaSolicitacao, { onClose: () => setModalNova(false), onCriada: () => { setModalNova(false); setSucesso("Solicitação registrada com sucesso!"); carregar(); } }) : null,
            modalTriagem ? h(ModalTriagem, { sol: modalTriagem, onClose: () => setModalTriagem(null), onSalvo: () => { setModalTriagem(null); setSucesso("Triagem salva com sucesso!"); carregar(); } }) : null,
        ],
    });
}
