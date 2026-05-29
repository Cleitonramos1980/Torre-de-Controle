import { r as React, j as jsxRuntime, J as Card, N as CardContent, B as Button } from "./index-Cw1PFMX8.js";

const h = jsxRuntime.jsx;
const hs = jsxRuntime.jsxs;

function getToken() { try { return JSON.parse(localStorage.getItem("sgq.authSession") || "{}").token || ""; } catch { return ""; } }
function getUser() { try { return JSON.parse(localStorage.getItem("sgq.authSession") || "{}"); } catch { return {}; } }
async function apiFetch(path, opts) {
    const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(opts?.headers || {}) } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || json?.message || json?.error || `Erro ${res.status}`);
    return json;
}

function formatDate(v) {
    if (!v) return "—";
    const d = new Date(String(v).includes("T") ? v : `${String(v).slice(0,10)}T00:00:00`);
    if (isNaN(d)) return String(v);
    return d.toLocaleDateString("pt-BR");
}
function formatDateTime(v) {
    if (!v) return "—";
    const d = new Date(v);
    if (isNaN(d)) return String(v);
    return d.toLocaleString("pt-BR");
}
function formatMoney(v) {
    const n = Number(v ?? 0);
    if (!Number.isFinite(n)) return "R$ 0,00";
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function StatusBadge({ status }) {
    const map = {
        PLANEJADA: { bg: "#dbeafe", color: "#1e40af" },
        AGENDADA: { bg: "#ede9fe", color: "#6d28d9" },
        EM_ANDAMENTO: { bg: "#fef3c7", color: "#92400e" },
        PAUSADA: { bg: "#fee2e2", color: "#991b1b" },
        CONCLUIDA: { bg: "#dcfce7", color: "#166534" },
        CANCELADA: { bg: "#f3f4f6", color: "#6b7280" },
        RETRABALHO: { bg: "#ffe4e6", color: "#be123c" },
        PENDENTE: { bg: "#fef3c7", color: "#92400e" },
        APROVADA: { bg: "#dcfce7", color: "#166534" },
        REJEITADA: { bg: "#fee2e2", color: "#991b1b" },
        EXPIRADA: { bg: "#f3f4f6", color: "#6b7280" },
    };
    const s = map[status] || { bg: "#f3f4f6", color: "#374151" };
    return h("span", { style: { background: s.bg, color: s.color, padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700 }, children: status || "—" });
}

function PriorBadge({ p }) {
    const map = { P0: { bg: "#fee2e2", color: "#991b1b" }, P1: { bg: "#fef3c7", color: "#92400e" }, P2: { bg: "#dbeafe", color: "#1e40af" }, P3: { bg: "#dcfce7", color: "#166534" } };
    const s = map[p] || { bg: "#f3f4f6", color: "#374151" };
    return h("span", { style: { background: s.bg, color: s.color, padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700 }, children: p || "—" });
}

const STATUS_LIST = ["PLANEJADA", "AGENDADA", "EM_ANDAMENTO", "PAUSADA", "CONCLUIDA", "CANCELADA", "RETRABALHO"];
const PRIORIDADE_LIST = ["P0", "P1", "P2", "P3"];
const TIPO_LIST = ["CORRETIVA", "PREVENTIVA", "MELHORIA", "EMERGENCIA"];

function ModalNovaOS({ onClose, onCriada }) {
    const [form, setForm] = React.useState({ titulo: "", descricao: "", tipo: "CORRETIVA", prioridade: "P2", codfilial: "", nome_filial: "", tecnico_responsavel: "", equipe: "", custo_estimado: "", horas_estimadas: "" });
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState("");
    const [tecnicos, setTecnicos] = React.useState([]);
    const [buscandoTec, setBuscandoTec] = React.useState(false);
    const [queryTec, setQueryTec] = React.useState("");
    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const buscarTecnicos = async (q) => {
        if (q.length < 2) { setTecnicos([]); return; }
        setBuscandoTec(true);
        try {
            const r = await apiFetch(`/api/engenharia/tecnicos?q=${encodeURIComponent(q)}`);
            setTecnicos(Array.isArray(r) ? r : []);
        } catch { setTecnicos([]); } finally { setBuscandoTec(false); }
    };

    const salvar = async () => {
        if (!form.titulo.trim()) { setErro("Título obrigatório."); return; }
        if (!form.codfilial.trim()) { setErro("Filial obrigatória."); return; }
        setSalvando(true); setErro("");
        try {
            const body = {
                titulo: form.titulo.trim(),
                descricao: form.descricao || undefined,
                tipo: form.tipo,
                prioridade: form.prioridade,
                codfilial: form.codfilial.trim(),
                nome_filial: form.nome_filial || undefined,
                tecnico_responsavel: form.tecnico_responsavel || undefined,
                equipe: form.equipe || undefined,
                custo_estimado: form.custo_estimado ? Number(form.custo_estimado) : undefined,
                horas_estimadas: form.horas_estimadas ? Number(form.horas_estimadas) : undefined,
            };
            const res = await apiFetch("/api/engenharia/os", { method: "POST", body: JSON.stringify(body) });
            onCriada(res);
        } catch (e) {
            setErro(e.message || "Erro ao criar OS.");
        } finally {
            setSalvando(false);
        }
    };

    const inp = { padding: "8px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px", width: "100%", boxSizing: "border-box" };
    const row = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" };
    const label = (txt) => h("label", { style: { fontSize: "12px", fontWeight: 600, marginBottom: "4px", display: "block" }, children: txt });

    return hs("div", {
        style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" },
        children: h(Card, {
            style: { width: "560px", maxHeight: "90vh", overflowY: "auto" },
            children: h(CardContent, {
                style: { padding: "24px" },
                children: hs("div", {
                    style: { display: "flex", flexDirection: "column", gap: "16px" },
                    children: [
                        hs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
                            h("h2", { style: { fontSize: "18px", fontWeight: 700, margin: 0 }, children: "Nova Ordem de Serviço" }),
                            h("button", { onClick: onClose, style: { background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#6b7280" }, children: "×" }),
                        ] }),

                        hs("div", { children: [label("Título *"), h("input", { style: inp, value: form.titulo, onChange: e => set("titulo", e.target.value), placeholder: "Descrição resumida da OS" })] }),
                        hs("div", { children: [label("Descrição"), h("textarea", { style: { ...inp, minHeight: "80px", resize: "vertical" }, value: form.descricao, onChange: e => set("descricao", e.target.value), placeholder: "Detalhes do serviço..." })] }),

                        hs("div", { style: row, children: [
                            hs("div", { children: [label("Tipo"), h("select", { style: inp, value: form.tipo, onChange: e => set("tipo", e.target.value), children: TIPO_LIST.map(t => h("option", { key: t, value: t, children: t })) })] }),
                            hs("div", { children: [label("Prioridade"), h("select", { style: inp, value: form.prioridade, onChange: e => set("prioridade", e.target.value), children: PRIORIDADE_LIST.map(p => h("option", { key: p, value: p, children: p })) })] }),
                        ] }),

                        hs("div", { style: row, children: [
                            hs("div", { children: [label("Filial (código) *"), h("input", { style: inp, value: form.codfilial, onChange: e => set("codfilial", e.target.value), placeholder: "Ex: 1, 2, 10..." })] }),
                            hs("div", { children: [label("Nome da Filial"), h("input", { style: inp, value: form.nome_filial, onChange: e => set("nome_filial", e.target.value), placeholder: "Nome da loja" })] }),
                        ] }),

                        hs("div", { style: row, children: [
                            hs("div", { children: [
                                label("Técnico Responsável"),
                                h("input", { style: inp, value: queryTec || form.tecnico_responsavel, onChange: e => { setQueryTec(e.target.value); set("tecnico_responsavel", e.target.value); buscarTecnicos(e.target.value); }, placeholder: "Digite o nome do técnico..." }),
                                tecnicos.length > 0 ? h("div", { style: { border: "1px solid #d1d5db", borderRadius: "6px", background: "#fff", maxHeight: "120px", overflowY: "auto", fontSize: "12px", marginTop: "2px" }, children: tecnicos.map(t => h("div", { key: t.MATRICULA, style: { padding: "6px 10px", cursor: "pointer", borderBottom: "1px solid #f3f4f6" }, onClick: () => { set("tecnico_responsavel", `${t.MATRICULA} — ${t.NOME}`); set("tecnico_matricula", t.MATRICULA); setTecnicos([]); setQueryTec(""); }, children: `${t.MATRICULA} — ${t.NOME}` })) }) : null,
                                buscandoTec ? h("span", { style: { fontSize: "11px", color: "#6b7280" }, children: "Buscando..." }) : null,
                            ] }),
                            hs("div", { children: [label("Equipe / Prestador"), h("input", { style: inp, value: form.equipe, onChange: e => set("equipe", e.target.value), placeholder: "Nome da equipe" })] }),
                        ] }),

                        hs("div", { style: row, children: [
                            hs("div", { children: [label("Horas Estimadas"), h("input", { type: "number", style: inp, value: form.horas_estimadas, onChange: e => set("horas_estimadas", e.target.value), placeholder: "0" })] }),
                            hs("div", { children: [label("Custo Estimado (R$)"), h("input", { type: "number", style: inp, value: form.custo_estimado, onChange: e => set("custo_estimado", e.target.value), placeholder: "0,00" })] }),
                        ] }),

                        erro ? h("div", { style: { background: "#fee2e2", color: "#991b1b", padding: "10px 14px", borderRadius: "6px", fontSize: "13px" }, children: erro }) : null,

                        hs("div", { style: { display: "flex", gap: "8px", justifyContent: "flex-end" }, children: [
                            h(Button, { variant: "outline", onClick: onClose, children: "Cancelar" }),
                            h(Button, { onClick: salvar, disabled: salvando, style: { background: "#16a34a", color: "#fff", border: "none" }, children: salvando ? "Criando..." : "Criar OS" }),
                        ] }),
                    ],
                }),
            }),
        }),
    });
}

function ModalAprovarPT({ pt, osId, onClose, onAprovada }) {
    const [obs, setObs] = React.useState("");
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState("");
    const user = getUser();

    const aprovar = async (aceitar) => {
        setSalvando(true); setErro("");
        try {
            await apiFetch(`/api/engenharia/os/${osId}/permissoes/${pt.ID}/aprovar`, {
                method: "PATCH",
                body: JSON.stringify({ aceitar, obs_aprovacao: obs || undefined, aprovador: user.nome || user.email, aprovador_matricula: user.matricula }),
            });
            onAprovada();
        } catch (e) {
            setErro(e.message);
        } finally {
            setSalvando(false);
        }
    };

    return hs("div", {
        style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1001, display: "flex", alignItems: "center", justifyContent: "center" },
        children: h(Card, {
            style: { width: "460px" },
            children: h(CardContent, {
                style: { padding: "24px" },
                children: hs("div", {
                    style: { display: "flex", flexDirection: "column", gap: "14px" },
                    children: [
                        hs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
                            h("h3", { style: { margin: 0, fontSize: "16px", fontWeight: 700 }, children: "Aprovar Permissão de Trabalho" }),
                            h("button", { onClick: onClose, style: { background: "none", border: "none", cursor: "pointer", fontSize: "18px", color: "#6b7280" }, children: "×" }),
                        ] }),
                        hs("div", { style: { background: "#f9fafb", borderRadius: "6px", padding: "12px", fontSize: "13px" }, children: [
                            h("b", { children: pt.TIPO }),
                            h("p", { style: { margin: "4px 0 0", color: "#6b7280" }, children: pt.DESCRICAO }),
                            pt.VALIDA_DE ? h("p", { style: { margin: "4px 0 0", color: "#6b7280", fontSize: "12px" }, children: `Válida: ${formatDateTime(pt.VALIDA_DE)} → ${formatDateTime(pt.VALIDA_ATE)}` }) : null,
                        ] }),
                        hs("div", { children: [
                            h("label", { style: { fontSize: "12px", fontWeight: 600 }, children: "Observação de aprovação (opcional)" }),
                            h("textarea", { style: { marginTop: "4px", width: "100%", boxSizing: "border-box", padding: "8px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px", resize: "vertical", minHeight: "60px" }, value: obs, onChange: e => setObs(e.target.value), placeholder: "Condições, ressalvas..." }),
                        ] }),
                        erro ? h("div", { style: { color: "#dc2626", fontSize: "13px" }, children: erro }) : null,
                        hs("div", { style: { display: "flex", gap: "8px", justifyContent: "flex-end" }, children: [
                            h(Button, { variant: "outline", onClick: onClose, children: "Cancelar" }),
                            h(Button, { onClick: () => aprovar(false), disabled: salvando, style: { background: "#dc2626", color: "#fff", border: "none", fontSize: "13px" }, children: salvando ? "..." : "Rejeitar" }),
                            h(Button, { onClick: () => aprovar(true), disabled: salvando, style: { background: "#16a34a", color: "#fff", border: "none", fontSize: "13px" }, children: salvando ? "..." : "Aprovar" }),
                        ] }),
                    ],
                }),
            }),
        }),
    });
}

function DetalheOS({ osId, onVoltar }) {
    const [os, setOs] = React.useState(null);
    const [historico, setHistorico] = React.useState([]);
    const [permissoes, setPermissoes] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState("");
    const [atualizando, setAtualizando] = React.useState(false);
    const [editStatus, setEditStatus] = React.useState("");
    const [editPct, setEditPct] = React.useState("");
    const [editSolucao, setEditSolucao] = React.useState("");
    const [editCausa, setEditCausa] = React.useState("");
    const [novaAtiv, setNovaAtiv] = React.useState("");
    const [adicionandoAtiv, setAdicionandoAtiv] = React.useState(false);
    const [ptModal, setPtModal] = React.useState(null);
    const [abaAtiva, setAbaAtiva] = React.useState("info");

    const carregar = React.useCallback(async () => {
        setErro("");
        try {
            const [d, hist, pts] = await Promise.all([
                apiFetch(`/api/engenharia/os/${osId}`),
                apiFetch(`/api/engenharia/os/${osId}/historico`).catch(() => []),
                apiFetch(`/api/engenharia/os/${osId}/permissoes`).catch(() => []),
            ]);
            setOs(d);
            setHistorico(Array.isArray(hist) ? hist : []);
            setPermissoes(Array.isArray(pts) ? pts : []);
            setEditStatus(d.STATUS || "");
            setEditPct(String(d.PERCENTUAL_CONCLUIDO || 0));
            setEditSolucao(d.SOLUCAO_APLICADA || "");
            setEditCausa(d.CAUSA_RAIZ || "");
        } catch (e) {
            setErro(e.message || "Erro ao carregar OS.");
        } finally {
            setLoading(false);
        }
    }, [osId]);

    React.useEffect(() => { carregar(); }, [carregar]);

    const salvarAtualizacao = async () => {
        setAtualizando(true);
        try {
            await apiFetch(`/api/engenharia/os/${osId}`, {
                method: "PATCH",
                body: JSON.stringify({
                    status: editStatus || undefined,
                    percentual_concluido: editPct ? Number(editPct) : undefined,
                    solucao_aplicada: editSolucao || undefined,
                    causa_raiz: editCausa || undefined,
                }),
            });
            await carregar();
        } catch (e) {
            setErro(e.message);
        } finally {
            setAtualizando(false);
        }
    };

    const adicionarAtividade = async () => {
        if (!novaAtiv.trim()) return;
        setAdicionandoAtiv(true);
        try {
            await apiFetch(`/api/engenharia/os/${osId}/atividades`, { method: "POST", body: JSON.stringify({ descricao: novaAtiv }) });
            setNovaAtiv("");
            await carregar();
        } catch (e) {
            setErro(e.message);
        } finally {
            setAdicionandoAtiv(false);
        }
    };

    const atualizarAtividade = async (aid, status) => {
        try {
            await apiFetch(`/api/engenharia/os/${osId}/atividades/${aid}`, { method: "PATCH", body: JSON.stringify({ status }) });
            await carregar();
        } catch (e) { setErro(e.message); }
    };

    const inp = { padding: "8px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px", width: "100%", boxSizing: "border-box" };
    const abas = [
        { id: "info", label: "Informações" },
        { id: "atividades", label: `Atividades (${os?.atividades?.length ?? 0})` },
        { id: "materiais", label: `Materiais (${os?.materiais?.length ?? 0})` },
        { id: "permissoes", label: `Permissões PT (${permissoes.length})` },
        { id: "historico", label: `Histórico (${historico.length})` },
    ];

    if (loading) return h("p", { style: { padding: "24px", fontSize: "14px" }, children: "Carregando OS..." });
    if (!os) return h("p", { style: { padding: "24px", color: "#dc2626" }, children: erro || "OS não encontrada." });

    const ptsPendentes = permissoes.filter(p => p.STATUS === "PENDENTE");

    return hs("div", {
        style: { padding: "24px", maxWidth: "1100px", margin: "0 auto" },
        children: [
            // Breadcrumb
            hs("div", { style: { display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }, children: [
                h("button", { onClick: onVoltar, style: { background: "none", border: "none", cursor: "pointer", color: "#2563eb", fontSize: "13px", fontWeight: 600 }, children: "← Ordens de Serviço" }),
                h("span", { style: { color: "#9ca3af" }, children: "/" }),
                h("span", { style: { fontSize: "13px", color: "#374151" }, children: os.NUMERO }),
            ] }),

            // Alerta PT pendente
            ptsPendentes.length > 0 ? h("div", {
                style: { background: "#fef3c7", border: "1px solid #d97706", borderRadius: "8px", padding: "10px 16px", fontSize: "13px", color: "#92400e", marginBottom: "16px" },
                children: `⚠️ ${ptsPendentes.length} Permissão(ões) de Trabalho aguardando aprovação. Clique na aba "Permissões PT" para revisar.`,
            }) : null,

            // Header OS
            h(Card, {
                style: { marginBottom: "16px" },
                children: h(CardContent, {
                    style: { padding: "20px" },
                    children: hs("div", {
                        style: { display: "flex", flexWrap: "wrap", gap: "20px", justifyContent: "space-between" },
                        children: [
                            hs("div", { children: [
                                hs("div", { style: { display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px", flexWrap: "wrap" }, children: [
                                    h("span", { style: { fontFamily: "monospace", fontSize: "14px", fontWeight: 700, color: "#2563eb" }, children: os.NUMERO }),
                                    h(StatusBadge, { status: os.STATUS }),
                                    h(PriorBadge, { p: os.PRIORIDADE }),
                                    h("span", { style: { fontSize: "11px", background: "#f3f4f6", color: "#374151", padding: "2px 8px", borderRadius: "9999px" }, children: os.TIPO }),
                                ] }),
                                h("h1", { style: { fontSize: "18px", fontWeight: 700, margin: "0 0 6px 0" }, children: os.TITULO }),
                                h("p", { style: { fontSize: "13px", color: "#6b7280", margin: 0 }, children: os.DESCRICAO || "Sem descrição" }),
                            ] }),
                            hs("div", { style: { display: "grid", gridTemplateColumns: "auto auto", gap: "4px 20px", fontSize: "12px", alignContent: "start" }, children: [
                                h("span", { style: { color: "#6b7280" }, children: "Filial" }), h("span", { style: { fontWeight: 600 }, children: `${os.CODFILIAL} — ${os.NOME_FILIAL || ""}` }),
                                h("span", { style: { color: "#6b7280" }, children: "Técnico" }), h("span", { style: { fontWeight: 600 }, children: os.TECNICO_RESPONSAVEL || "—" }),
                                h("span", { style: { color: "#6b7280" }, children: "Equipe" }), h("span", { style: { fontWeight: 600 }, children: os.EQUIPE || "—" }),
                                h("span", { style: { color: "#6b7280" }, children: "Planejado" }), h("span", { style: { fontWeight: 600 }, children: formatDateTime(os.DATA_PLANEJADA) }),
                                h("span", { style: { color: "#6b7280" }, children: "Custo Est." }), h("span", { style: { fontWeight: 600 }, children: formatMoney(os.CUSTO_ESTIMADO) }),
                                h("span", { style: { color: "#6b7280" }, children: "Custo Real." }), h("span", { style: { fontWeight: 600 }, children: formatMoney(os.CUSTO_REALIZADO) }),
                                h("span", { style: { color: "#6b7280" }, children: "% Concluído" }), h("span", { style: { fontWeight: 600 }, children: `${os.PERCENTUAL_CONCLUIDO ?? 0}%` }),
                            ] }),
                        ],
                    }),
                }),
            }),

            // Abas
            hs("div", { style: { display: "flex", gap: "4px", marginBottom: "16px", flexWrap: "wrap" }, children:
                abas.map(a => h("button", {
                    key: a.id, onClick: () => setAbaAtiva(a.id),
                    style: { padding: "7px 14px", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "13px", fontWeight: abaAtiva === a.id ? 700 : 400, background: abaAtiva === a.id ? "hsl(var(--primary))" : "hsl(var(--muted))", color: abaAtiva === a.id ? "hsl(var(--primary-foreground))" : "hsl(var(--muted-foreground))" },
                    children: a.label,
                }))
            }),

            erro ? h("div", { style: { background: "#fee2e2", color: "#991b1b", padding: "10px 14px", borderRadius: "6px", fontSize: "13px", marginBottom: "16px" }, children: erro }) : null,

            // Aba: Informações
            abaAtiva === "info" ? h(Card, {
                children: h(CardContent, {
                    style: { padding: "20px" },
                    children: hs("div", { style: { display: "flex", flexDirection: "column", gap: "12px" }, children: [
                        h("h3", { style: { fontSize: "14px", fontWeight: 700, margin: 0 }, children: "Atualizar OS" }),
                        hs("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }, children: [
                            hs("div", { children: [
                                h("label", { style: { fontSize: "12px", fontWeight: 600 }, children: "Status" }),
                                h("select", { style: { ...inp, marginTop: "4px" }, value: editStatus, onChange: e => setEditStatus(e.target.value), children: STATUS_LIST.map(s => h("option", { key: s, value: s, children: s })) }),
                            ] }),
                            hs("div", { children: [
                                h("label", { style: { fontSize: "12px", fontWeight: 600 }, children: "% Concluído" }),
                                h("input", { type: "number", min: 0, max: 100, style: { ...inp, marginTop: "4px" }, value: editPct, onChange: e => setEditPct(e.target.value) }),
                            ] }),
                        ] }),
                        hs("div", { children: [
                            h("label", { style: { fontSize: "12px", fontWeight: 600 }, children: "Causa Raiz" }),
                            h("textarea", { style: { ...inp, marginTop: "4px", minHeight: "60px" }, value: editCausa, onChange: e => setEditCausa(e.target.value), placeholder: "Diagnóstico técnico..." }),
                        ] }),
                        hs("div", { children: [
                            h("label", { style: { fontSize: "12px", fontWeight: 600 }, children: "Solução Aplicada" }),
                            h("textarea", { style: { ...inp, marginTop: "4px", minHeight: "60px" }, value: editSolucao, onChange: e => setEditSolucao(e.target.value), placeholder: "O que foi feito..." }),
                        ] }),
                        hs("div", { style: { display: "flex", justifyContent: "flex-end" }, children: [
                            h(Button, { onClick: salvarAtualizacao, disabled: atualizando, style: { background: "#2563eb", color: "#fff", border: "none", fontSize: "13px" }, children: atualizando ? "Salvando..." : "Salvar Atualização" }),
                        ] }),

                        // Aceite da loja
                        os.STATUS === "CONCLUIDA" && !os.ACEITE_LOJA ? h("div", {
                            style: { background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: "8px", padding: "16px", marginTop: "8px" },
                            children: hs("div", { children: [
                                h("p", { style: { fontWeight: 600, fontSize: "13px", marginBottom: "4px", marginTop: 0 }, children: "Aguardando Aceite Digital da Loja" }),
                                h("p", { style: { fontSize: "12px", color: "#92400e", margin: 0 }, children: "OS concluída. Solicite a assinatura digital do responsável da loja para encerrar." }),
                            ] }),
                        }) : null,
                        os.ACEITE_LOJA ? h("div", {
                            style: { background: "#dcfce7", border: "1px solid #86efac", borderRadius: "8px", padding: "16px", marginTop: "8px" },
                            children: hs("div", { children: [
                                h("p", { style: { fontWeight: 600, fontSize: "13px", color: "#166534", margin: "0 0 4px" }, children: "✓ Aceite da Loja Confirmado" }),
                                h("p", { style: { fontSize: "12px", color: "#166534", margin: 0 }, children: `Por: ${os.ACEITE_LOJA_POR || "—"} em ${formatDateTime(os.ACEITE_LOJA_EM)}` }),
                            ] }),
                        }) : null,
                    ] }),
                }),
            }) : null,

            // Aba: Atividades
            abaAtiva === "atividades" ? h(Card, {
                children: h(CardContent, {
                    style: { padding: "20px" },
                    children: hs("div", { style: { display: "flex", flexDirection: "column", gap: "12px" }, children: [
                        hs("div", { style: { display: "flex", gap: "8px" }, children: [
                            h("input", { style: { ...inp, flex: 1 }, value: novaAtiv, onChange: e => setNovaAtiv(e.target.value), placeholder: "Descrição da atividade...", onKeyDown: e => e.key === "Enter" && adicionarAtividade() }),
                            h(Button, { onClick: adicionarAtividade, disabled: adicionandoAtiv || !novaAtiv.trim(), style: { background: "#16a34a", color: "#fff", border: "none", fontSize: "12px" }, children: adicionandoAtiv ? "..." : "+ Adicionar" }),
                        ] }),
                        ...(os.atividades || []).map((a, i) => hs("div", {
                            key: a.ID || i,
                            style: { display: "flex", gap: "10px", alignItems: "center", padding: "8px 12px", background: "hsl(var(--muted))", borderRadius: "6px" },
                            children: [
                                h("input", { type: "checkbox", checked: a.STATUS === "CONCLUIDA", onChange: e => atualizarAtividade(a.ID, e.target.checked ? "CONCLUIDA" : "PENDENTE"), style: { cursor: "pointer" } }),
                                h("span", { style: { flex: 1, fontSize: "13px", textDecoration: a.STATUS === "CONCLUIDA" ? "line-through" : "none", color: a.STATUS === "CONCLUIDA" ? "#9ca3af" : "hsl(var(--foreground))" }, children: a.DESCRICAO }),
                                a.RESPONSAVEL ? h("span", { style: { fontSize: "11px", color: "#6b7280" }, children: a.RESPONSAVEL }) : null,
                            ],
                        })),
                        (os.atividades || []).length === 0 ? h("p", { style: { fontSize: "13px", color: "#9ca3af", textAlign: "center", padding: "8px" }, children: "Nenhuma atividade cadastrada." }) : null,
                    ] }),
                }),
            }) : null,

            // Aba: Materiais
            abaAtiva === "materiais" ? h(Card, {
                children: h(CardContent, {
                    style: { padding: "20px" },
                    children: (os.materiais || []).length === 0
                        ? h("p", { style: { fontSize: "13px", color: "#9ca3af" }, children: "Nenhum material solicitado." })
                        : h("div", {
                            style: { overflowX: "auto" },
                            children: h("table", {
                                style: { width: "100%", borderCollapse: "collapse", fontSize: "13px" },
                                children: [
                                    h("thead", { children: h("tr", { style: { background: "hsl(var(--muted))", borderBottom: "1px solid hsl(var(--border))" }, children: ["Descrição", "Qtd", "Un", "Preço Un", "Total", "Status"].map(c => h("th", { key: c, style: { padding: "8px 12px", textAlign: "left", fontWeight: 600, fontSize: "12px", color: "hsl(var(--muted-foreground))" }, children: c })) }) }),
                                    h("tbody", { children: (os.materiais || []).map((m, i) => h("tr", { key: m.ID || i, style: { borderBottom: "1px solid hsl(var(--border))" }, children: [
                                        h("td", { style: { padding: "8px 12px" }, children: m.DESCRICAO }),
                                        h("td", { style: { padding: "8px 12px" }, children: m.QTD_SOLICITADA }),
                                        h("td", { style: { padding: "8px 12px" }, children: m.UNIDADE }),
                                        h("td", { style: { padding: "8px 12px" }, children: formatMoney(m.PRECO_UNITARIO) }),
                                        h("td", { style: { padding: "8px 12px" }, children: formatMoney(Number(m.QTD_SOLICITADA || 0) * Number(m.PRECO_UNITARIO || 0)) }),
                                        h("td", { style: { padding: "8px 12px" }, children: h(StatusBadge, { status: m.STATUS }) }),
                                    ] })) }),
                                ],
                            }),
                        }),
                }),
            }) : null,

            // Aba: Permissões de Trabalho
            abaAtiva === "permissoes" ? h(Card, {
                children: h(CardContent, {
                    style: { padding: "20px" },
                    children: hs("div", { style: { display: "flex", flexDirection: "column", gap: "12px" }, children: [
                        h("h3", { style: { fontSize: "14px", fontWeight: 700, margin: 0 }, children: "Permissões de Trabalho (PT)" }),
                        permissoes.length === 0
                            ? h("p", { style: { fontSize: "13px", color: "#9ca3af" }, children: "Nenhuma PT cadastrada para esta OS." })
                            : permissoes.map((pt, i) => hs("div", {
                                key: pt.ID || i,
                                style: { border: "1px solid hsl(var(--border))", borderRadius: "8px", padding: "14px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" },
                                children: [
                                    hs("div", { style: { flex: 1 }, children: [
                                        hs("div", { style: { display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px" }, children: [
                                            h("b", { style: { fontSize: "13px" }, children: pt.TIPO }),
                                            h(StatusBadge, { status: pt.STATUS }),
                                        ] }),
                                        pt.DESCRICAO ? h("p", { style: { fontSize: "12px", color: "#6b7280", margin: "0 0 4px" }, children: pt.DESCRICAO }) : null,
                                        pt.VALIDA_DE ? h("p", { style: { fontSize: "11px", color: "#6b7280", margin: 0 }, children: `Válida: ${formatDateTime(pt.VALIDA_DE)} → ${formatDateTime(pt.VALIDA_ATE)}` }) : null,
                                        pt.APROVADOR ? h("p", { style: { fontSize: "11px", color: "#16a34a", marginTop: "4px" }, children: `Aprovado por ${pt.APROVADOR} em ${formatDateTime(pt.DATA_APROVACAO)}` }) : null,
                                        pt.OBS_APROVACAO ? h("p", { style: { fontSize: "11px", color: "#6b7280", marginTop: "2px", fontStyle: "italic" }, children: `Obs: ${pt.OBS_APROVACAO}` }) : null,
                                    ] }),
                                    pt.STATUS === "PENDENTE" ? h(Button, {
                                        onClick: () => setPtModal(pt),
                                        style: { background: "#2563eb", color: "#fff", border: "none", fontSize: "12px", whiteSpace: "nowrap" },
                                        children: "Revisar",
                                    }) : null,
                                ],
                            })),
                    ] }),
                }),
            }) : null,

            // Aba: Histórico / Timeline
            abaAtiva === "historico" ? h(Card, {
                children: h(CardContent, {
                    style: { padding: "20px" },
                    children: hs("div", { style: { display: "flex", flexDirection: "column", gap: "0" }, children: [
                        h("h3", { style: { fontSize: "14px", fontWeight: 700, margin: "0 0 16px" }, children: "Histórico de Alterações" }),
                        historico.length === 0
                            ? h("p", { style: { fontSize: "13px", color: "#9ca3af" }, children: "Nenhuma alteração registrada ainda." })
                            : historico.map((item, i) => hs("div", {
                                key: item.ID || i,
                                style: { display: "flex", gap: "14px", paddingBottom: "16px", position: "relative" },
                                children: [
                                    hs("div", { style: { display: "flex", flexDirection: "column", alignItems: "center" }, children: [
                                        h("div", { style: { width: 10, height: 10, borderRadius: "50%", background: "#2563eb", flexShrink: 0, marginTop: 3 } }),
                                        i < historico.length - 1 ? h("div", { style: { width: 2, flex: 1, background: "#e5e7eb", margin: "4px 0" } }) : null,
                                    ] }),
                                    hs("div", { style: { flex: 1, paddingBottom: "8px" }, children: [
                                        hs("div", { style: { display: "flex", gap: "8px", alignItems: "baseline", flexWrap: "wrap" }, children: [
                                            h("b", { style: { fontSize: "13px" }, children: item.CAMPO }),
                                            h("span", { style: { fontSize: "12px", color: "#6b7280" }, children: `por ${item.USUARIO || "—"} ${item.USUARIO_MATRICULA ? `(${item.USUARIO_MATRICULA})` : ""}` }),
                                            h("span", { style: { fontSize: "11px", color: "#9ca3af", marginLeft: "auto" }, children: formatDateTime(item.CRIADO_EM) }),
                                        ] }),
                                        hs("div", { style: { fontSize: "12px", marginTop: "4px", display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }, children: [
                                            item.VALOR_ANTERIOR ? hs("span", { children: [
                                                h("span", { style: { color: "#9ca3af" }, children: "De: " }),
                                                h("span", { style: { background: "#fee2e2", color: "#991b1b", padding: "1px 6px", borderRadius: "4px" }, children: item.VALOR_ANTERIOR }),
                                            ] }) : null,
                                            item.VALOR_ANTERIOR && item.VALOR_NOVO ? h("span", { style: { color: "#9ca3af" }, children: "→" }) : null,
                                            item.VALOR_NOVO ? hs("span", { children: [
                                                h("span", { style: { color: "#9ca3af" }, children: "Para: " }),
                                                h("span", { style: { background: "#dcfce7", color: "#166534", padding: "1px 6px", borderRadius: "4px" }, children: item.VALOR_NOVO }),
                                            ] }) : null,
                                        ] }),
                                    ] }),
                                ],
                            })),
                    ] }),
                }),
            }) : null,

            // Modal aprovação PT
            ptModal ? h(ModalAprovarPT, {
                pt: ptModal,
                osId,
                onClose: () => setPtModal(null),
                onAprovada: () => { setPtModal(null); carregar(); },
            }) : null,
        ],
    });
}

export default function EngenhariaOSPage() {
    const params = new URLSearchParams(window.location.search);
    const osIdFromUrl = window.location.pathname.match(/\/engenharia\/os\/([^/]+)/)?.[1];
    const [view, setView] = React.useState(osIdFromUrl ? "detalhe" : "lista");
    const [selectedId, setSelectedId] = React.useState(osIdFromUrl || null);
    const [osList, setOsList] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState("");
    const [filtStatus, setFiltStatus] = React.useState(params.get("status") || "");
    const [filtPrioridade, setFiltPrioridade] = React.useState("");
    const [filtTipo, setFiltTipo] = React.useState("");
    const [modalNova, setModalNova] = React.useState(false);

    const carregar = React.useCallback(async () => {
        setErro("");
        try {
            const q = new URLSearchParams();
            if (filtStatus) q.set("status", filtStatus);
            if (filtPrioridade) q.set("prioridade", filtPrioridade);
            if (filtTipo) q.set("tipo", filtTipo);
            const data = await apiFetch(`/api/engenharia/os?${q}`);
            setOsList(Array.isArray(data) ? data : []);
        } catch (e) {
            setErro(e.message || "Erro ao carregar ordens.");
        } finally {
            setLoading(false);
        }
    }, [filtStatus, filtPrioridade, filtTipo]);

    React.useEffect(() => {
        if (view === "lista") carregar();
    }, [view, carregar]);

    const abrirDetalhe = (id) => { setSelectedId(id); setView("detalhe"); };
    const voltarLista = () => { setSelectedId(null); setView("lista"); };

    const inp = { padding: "7px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px" };

    if (view === "detalhe" && selectedId) {
        return h(DetalheOS, { osId: selectedId, onVoltar: voltarLista });
    }

    return hs("div", {
        style: { padding: "24px", maxWidth: "1400px", margin: "0 auto" },
        children: [
            hs("div", {
                style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", flexWrap: "wrap", gap: "12px" },
                children: [
                    hs("div", { children: [
                        h("h1", { style: { fontSize: "22px", fontWeight: 700, margin: "0 0 4px 0" }, children: "Ordens de Serviço" }),
                        h("p", { style: { fontSize: "13px", color: "hsl(var(--muted-foreground))", margin: 0 }, children: "Gestão completa das OS de engenharia e facilities" }),
                    ] }),
                    hs("div", { style: { display: "flex", gap: "8px" }, children: [
                        h(Button, { variant: "outline", onClick: carregar, style: { fontSize: "12px" }, children: "↻ Atualizar" }),
                        h(Button, { onClick: () => setModalNova(true), style: { background: "#16a34a", color: "#fff", border: "none", fontSize: "12px" }, children: "+ Nova OS" }),
                    ] }),
                ],
            }),

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
                            h("select", { style: inp, value: filtTipo, onChange: e => setFiltTipo(e.target.value), children: [h("option", { value: "", children: "Todos os tipos" }), ...TIPO_LIST.map(t => h("option", { key: t, value: t, children: t }))] }),
                            h(Button, { variant: "outline", style: { fontSize: "12px" }, onClick: carregar, children: "Filtrar" }),
                        ],
                    }),
                }),
            }),

            erro ? h("div", { style: { background: "#fee2e2", color: "#991b1b", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }, children: erro }) : null,

            h(Card, {
                children: h(CardContent, {
                    style: { padding: "0" },
                    children: loading
                        ? h("p", { style: { padding: "24px", fontSize: "14px", color: "#6b7280" }, children: "Carregando ordens..." })
                        : osList.length === 0
                            ? h("p", { style: { padding: "24px", fontSize: "14px", color: "#6b7280", textAlign: "center" }, children: "Nenhuma OS encontrada com os filtros selecionados." })
                            : h("div", {
                                style: { overflowX: "auto" },
                                children: h("table", {
                                    style: { width: "100%", borderCollapse: "collapse", fontSize: "13px" },
                                    children: [
                                        h("thead", { children: h("tr", { style: { background: "hsl(var(--muted))", borderBottom: "1px solid hsl(var(--border))" }, children: ["Número", "Título", "Filial", "Técnico", "Status", "Prioridade", "Tipo", "Planejado", "Custo Est."].map(c => h("th", { key: c, style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, fontSize: "12px", color: "hsl(var(--muted-foreground))", whiteSpace: "nowrap" }, children: c })) }) }),
                                        h("tbody", { children: osList.map((os, i) => h("tr", {
                                            key: os.ID || i,
                                            onClick: () => abrirDetalhe(os.ID),
                                            style: { borderBottom: "1px solid hsl(var(--border))", cursor: "pointer" },
                                            children: [
                                                h("td", { style: { padding: "10px 12px", fontFamily: "monospace", fontWeight: 700, color: "#2563eb" }, children: os.NUMERO }),
                                                h("td", { style: { padding: "10px 12px", maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: os.TITULO }),
                                                h("td", { style: { padding: "10px 12px" }, children: os.CODFILIAL }),
                                                h("td", { style: { padding: "10px 12px", maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: os.TECNICO_RESPONSAVEL || "—" }),
                                                h("td", { style: { padding: "10px 12px" }, children: h(StatusBadge, { status: os.STATUS }) }),
                                                h("td", { style: { padding: "10px 12px" }, children: h(PriorBadge, { p: os.PRIORIDADE }) }),
                                                h("td", { style: { padding: "10px 12px", fontSize: "11px", color: "#6b7280" }, children: os.TIPO }),
                                                h("td", { style: { padding: "10px 12px", fontSize: "12px", whiteSpace: "nowrap" }, children: formatDateTime(os.DATA_PLANEJADA) }),
                                                h("td", { style: { padding: "10px 12px", fontSize: "12px", whiteSpace: "nowrap" }, children: formatMoney(os.CUSTO_ESTIMADO) }),
                                            ],
                                        })) }),
                                    ],
                                }),
                            }),
                }),
            }),

            modalNova ? h(ModalNovaOS, { onClose: () => setModalNova(false), onCriada: (os) => { setModalNova(false); abrirDetalhe(os.ID || os.id); } }) : null,
        ],
    });
}
