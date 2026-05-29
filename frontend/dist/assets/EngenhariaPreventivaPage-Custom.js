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

function navigate(path) { window.history.pushState({}, "", path); window.dispatchEvent(new PopStateEvent("popstate")); }

function StatusPrevBadge({ proxExec }) {
    if (!proxExec) return h("span", { style: { background: "#f3f4f6", color: "#6b7280", padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700 }, children: "Sem data" });
    const d = new Date(`${String(proxExec).slice(0, 10)}T00:00:00`);
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const diff = Math.floor((d - hoje) / (1000 * 60 * 60 * 24));
    if (diff < 0) return h("span", { style: { background: "#fee2e2", color: "#991b1b", padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700 }, children: `Atrasada ${Math.abs(diff)}d` });
    if (diff <= 7) return h("span", { style: { background: "#fef3c7", color: "#92400e", padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700 }, children: `Em ${diff}d` });
    return h("span", { style: { background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700 }, children: `Em ${diff}d` });
}

function ModalNovaPreventiva({ onClose, onCriada }) {
    const [form, setForm] = React.useState({
        nome: "", ativo_id: "", ativo_nome: "", codfilial: "",
        periodicidade_dias: "90", duracao_horas: "", instrucoes: "",
        tecnico_padrao: "", proxima_execucao: "",
    });
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState("");
    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const salvar = async () => {
        if (!form.nome.trim()) { setErro("Nome do plano obrigatório."); return; }
        if (!form.periodicidade_dias || Number(form.periodicidade_dias) <= 0) { setErro("Periodicidade inválida."); return; }
        setSalvando(true); setErro("");
        try {
            const body = {
                nome: form.nome.trim(),
                ativo_id: form.ativo_id || undefined,
                ativo_nome: form.ativo_nome || undefined,
                codfilial: form.codfilial || undefined,
                periodicidade_dias: Number(form.periodicidade_dias),
                duracao_horas: form.duracao_horas ? Number(form.duracao_horas) : undefined,
                instrucoes: form.instrucoes || undefined,
                tecnico_padrao: form.tecnico_padrao || undefined,
                proxima_execucao: form.proxima_execucao || undefined,
            };
            const res = await apiFetch("/api/engenharia/preventiva", { method: "POST", body: JSON.stringify(body) });
            onCriada(res);
        } catch (e) {
            setErro(e.message || "Erro ao criar plano.");
        } finally {
            setSalvando(false);
        }
    };

    const inp = { padding: "8px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px", width: "100%", boxSizing: "border-box" };
    const row2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" };
    const lbl = (t) => h("label", { style: { fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }, children: t });

    const PERIODICIDADE_OPTIONS = [
        { v: "7", l: "Semanal (7 dias)" }, { v: "15", l: "Quinzenal (15 dias)" },
        { v: "30", l: "Mensal (30 dias)" }, { v: "60", l: "Bimestral (60 dias)" },
        { v: "90", l: "Trimestral (90 dias)" }, { v: "180", l: "Semestral (180 dias)" },
        { v: "365", l: "Anual (365 dias)" },
    ];

    return hs("div", {
        style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" },
        children: h(Card, {
            style: { width: "580px", maxHeight: "90vh", overflowY: "auto" },
            children: h(CardContent, {
                style: { padding: "24px" },
                children: hs("div", {
                    style: { display: "flex", flexDirection: "column", gap: "14px" },
                    children: [
                        hs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
                            h("h2", { style: { fontSize: "18px", fontWeight: 700, margin: 0 }, children: "Criar Plano de Manutenção Preventiva" }),
                            h("button", { onClick: onClose, style: { background: "none", border: "none", fontSize: "20px", cursor: "pointer" }, children: "×" }),
                        ] }),

                        hs("div", { children: [lbl("Nome do Plano *"), h("input", { style: inp, value: form.nome, onChange: e => set("nome", e.target.value), placeholder: "Ex: Manutenção Preventiva AVAC Loja X..." })] }),

                        hs("div", { style: row2, children: [
                            hs("div", { children: [lbl("Ativo/Equipamento"), h("input", { style: inp, value: form.ativo_nome, onChange: e => set("ativo_nome", e.target.value), placeholder: "Nome do equipamento..." })] }),
                            hs("div", { children: [lbl("Filial"), h("input", { style: inp, value: form.codfilial, onChange: e => set("codfilial", e.target.value), placeholder: "Código da filial..." })] }),
                        ] }),

                        hs("div", { style: row2, children: [
                            hs("div", { children: [
                                lbl("Periodicidade"),
                                h("select", { style: inp, value: form.periodicidade_dias, onChange: e => set("periodicidade_dias", e.target.value), children:
                                    PERIODICIDADE_OPTIONS.map(o => h("option", { key: o.v, value: o.v, children: o.l }))
                                }),
                            ] }),
                            hs("div", { children: [lbl("Duração (horas)"), h("input", { type: "number", min: "0.5", step: "0.5", style: inp, value: form.duracao_horas, onChange: e => set("duracao_horas", e.target.value), placeholder: "Ex: 4" })] }),
                        ] }),

                        hs("div", { style: row2, children: [
                            hs("div", { children: [lbl("Técnico Padrão"), h("input", { style: inp, value: form.tecnico_padrao, onChange: e => set("tecnico_padrao", e.target.value), placeholder: "Nome do técnico..." })] }),
                            hs("div", { children: [lbl("Próxima Execução"), h("input", { type: "date", style: inp, value: form.proxima_execucao, onChange: e => set("proxima_execucao", e.target.value) })] }),
                        ] }),

                        hs("div", { children: [
                            lbl("Instruções de Manutenção"),
                            h("textarea", { style: { ...inp, minHeight: "100px", resize: "vertical" }, value: form.instrucoes, onChange: e => set("instrucoes", e.target.value), placeholder: "Passos detalhados, checklist, pontos de inspeção, EPI necessário..." }),
                        ] }),

                        erro ? h("div", { style: { background: "#fee2e2", color: "#991b1b", padding: "10px 14px", borderRadius: "6px", fontSize: "13px" }, children: erro }) : null,

                        hs("div", { style: { display: "flex", gap: "8px", justifyContent: "flex-end" }, children: [
                            h(Button, { variant: "outline", onClick: onClose, children: "Cancelar" }),
                            h(Button, { onClick: salvar, disabled: salvando, style: { background: "#2563eb", color: "#fff", border: "none" }, children: salvando ? "Criando..." : "Criar Plano" }),
                        ] }),
                    ],
                }),
            }),
        }),
    });
}

function DetalhePreventiva({ plan, onClose, onGerarOS }) {
    const [gerando, setGerando] = React.useState(false);
    const [erro, setErro] = React.useState("");

    const gerarOS = async () => {
        setGerando(true); setErro("");
        try {
            const res = await apiFetch("/api/engenharia/os", {
                method: "POST",
                body: JSON.stringify({
                    titulo: `[PREVENTIVA] ${plan.NOME}`,
                    descricao: plan.INSTRUCOES,
                    tipo: "PREVENTIVA",
                    prioridade: "P2",
                    codfilial: plan.CODFILIAL || "1",
                    ativo_nome: plan.ATIVO_NOME || undefined,
                    tecnico_responsavel: plan.TECNICO_PADRAO || undefined,
                    horas_estimadas: plan.DURACAO_HORAS || undefined,
                }),
            });
            onGerarOS(res);
        } catch (e) {
            setErro(e.message || "Erro ao gerar OS.");
        } finally {
            setGerando(false);
        }
    };

    const row = (label, value) => hs("div", { style: { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f3f4f6", fontSize: "13px" }, children: [
        h("span", { style: { color: "#6b7280", fontWeight: 500 }, children: label }),
        h("span", { style: { fontWeight: 600, textAlign: "right" }, children: value || "—" }),
    ] });

    const periodLabel = (d) => {
        const n = Number(d);
        if (n === 7) return "Semanal";
        if (n === 15) return "Quinzenal";
        if (n === 30) return "Mensal";
        if (n === 60) return "Bimestral";
        if (n === 90) return "Trimestral";
        if (n === 180) return "Semestral";
        if (n === 365) return "Anual";
        return `${n} dias`;
    };

    return hs("div", {
        style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" },
        children: h(Card, {
            style: { width: "580px", maxHeight: "90vh", overflowY: "auto" },
            children: h(CardContent, {
                style: { padding: "24px" },
                children: hs("div", { style: { display: "flex", flexDirection: "column", gap: "14px" }, children: [
                    hs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" }, children: [
                        hs("div", { children: [
                            h("span", { style: { fontSize: "12px", color: "#6b7280" }, children: "Plano de Manutenção Preventiva" }),
                            h("h2", { style: { fontSize: "18px", fontWeight: 700, margin: "4px 0 0 0" }, children: plan.NOME }),
                        ] }),
                        h("button", { onClick: onClose, style: { background: "none", border: "none", fontSize: "20px", cursor: "pointer" }, children: "×" }),
                    ] }),

                    h(StatusPrevBadge, { proxExec: plan.PROXIMA_EXECUCAO }),

                    hs("div", { style: { display: "flex", flexDirection: "column" }, children: [
                        row("Equipamento / Ativo", plan.ATIVO_NOME),
                        row("Filial", plan.CODFILIAL),
                        row("Periodicidade", periodLabel(plan.PERIODICIDADE_DIAS)),
                        row("Duração Estimada", plan.DURACAO_HORAS ? `${plan.DURACAO_HORAS}h` : "—"),
                        row("Técnico Padrão", plan.TECNICO_PADRAO),
                        row("Última Execução", formatDate(plan.ULTIMA_EXECUCAO)),
                        row("Próxima Execução", formatDate(plan.PROXIMA_EXECUCAO)),
                    ] }),

                    plan.INSTRUCOES ? hs("div", { children: [
                        h("p", { style: { fontSize: "12px", fontWeight: 700, color: "#374151", marginBottom: "6px" }, children: "Instruções" }),
                        h("div", { style: { background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "6px", padding: "12px", fontSize: "13px", color: "#374151", lineHeight: "1.6", whiteSpace: "pre-wrap" }, children: plan.INSTRUCOES }),
                    ] }) : null,

                    erro ? h("div", { style: { background: "#fee2e2", color: "#991b1b", padding: "10px 14px", borderRadius: "6px", fontSize: "13px" }, children: erro }) : null,

                    hs("div", { style: { display: "flex", gap: "8px", justifyContent: "space-between", alignItems: "center" }, children: [
                        h(Button, { variant: "outline", onClick: onClose, children: "Fechar" }),
                        h(Button, { onClick: gerarOS, disabled: gerando, style: { background: "#16a34a", color: "#fff", border: "none" }, children: gerando ? "Gerando OS..." : "Gerar OS para Execução" }),
                    ] }),
                ] }),
            }),
        }),
    });
}

export default function EngenhariaPreventivaPage() {
    const [lista, setLista] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState("");
    const [sucesso, setSucesso] = React.useState("");
    const [modalNovo, setModalNovo] = React.useState(false);
    const [detalhe, setDetalhe] = React.useState(null);

    const carregar = React.useCallback(async () => {
        setErro("");
        try {
            const data = await apiFetch("/api/engenharia/preventiva");
            setLista(Array.isArray(data) ? data : []);
        } catch (e) {
            setErro(e.message || "Erro ao carregar planos preventivos.");
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => { carregar(); }, [carregar]);

    const hojeMs = Date.now();
    const em7Dias = hojeMs + 7 * 24 * 60 * 60 * 1000;
    const atrasados = lista.filter(p => p.PROXIMA_EXECUCAO && new Date(`${p.PROXIMA_EXECUCAO}T00:00:00`).getTime() < hojeMs).length;
    const urgentes = lista.filter(p => p.PROXIMA_EXECUCAO && new Date(`${p.PROXIMA_EXECUCAO}T00:00:00`).getTime() >= hojeMs && new Date(`${p.PROXIMA_EXECUCAO}T00:00:00`).getTime() <= em7Dias).length;

    return hs("div", {
        style: { padding: "24px", maxWidth: "1400px", margin: "0 auto" },
        children: [
            // Header
            hs("div", {
                style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", flexWrap: "wrap", gap: "12px" },
                children: [
                    hs("div", { children: [
                        h("h1", { style: { fontSize: "22px", fontWeight: 700, margin: "0 0 4px 0" }, children: "Manutenção Preventiva" }),
                        h("p", { style: { fontSize: "13px", color: "hsl(var(--muted-foreground))", margin: 0 }, children: "Planos e execuções de manutenção programada" }),
                    ] }),
                    hs("div", { style: { display: "flex", gap: "8px" }, children: [
                        h(Button, { variant: "outline", onClick: carregar, style: { fontSize: "12px" }, children: "↻ Atualizar" }),
                        h(Button, { onClick: () => setModalNovo(true), style: { background: "#2563eb", color: "#fff", border: "none", fontSize: "12px" }, children: "+ Novo Plano" }),
                    ] }),
                ],
            }),

            // KPIs
            h("div", {
                style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px", marginBottom: "20px" },
                children: [
                    h(Card, { children: h(CardContent, { style: { padding: "16px" }, children: hs("div", { children: [h("p", { style: { fontSize: "11px", color: "#6b7280", textTransform: "uppercase", marginBottom: "4px" }, children: "Total de Planos" }), h("p", { style: { fontSize: "24px", fontWeight: 700 }, children: lista.length })] }) }) }),
                    h(Card, { children: h(CardContent, { style: { padding: "16px" }, children: hs("div", { children: [h("p", { style: { fontSize: "11px", color: "#6b7280", textTransform: "uppercase", marginBottom: "4px" }, children: "Atrasadas" }), h("p", { style: { fontSize: "24px", fontWeight: 700, color: atrasados > 0 ? "#dc2626" : "#374151" }, children: atrasados })] }) }) }),
                    h(Card, { children: h(CardContent, { style: { padding: "16px" }, children: hs("div", { children: [h("p", { style: { fontSize: "11px", color: "#6b7280", textTransform: "uppercase", marginBottom: "4px" }, children: "Próximos 7 Dias" }), h("p", { style: { fontSize: "24px", fontWeight: 700, color: urgentes > 0 ? "#d97706" : "#374151" }, children: urgentes })] }) }) }),
                ],
            }),

            erro ? h("div", { style: { background: "#fee2e2", color: "#991b1b", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px" }, children: erro }) : null,
            sucesso ? hs("div", { style: { background: "#dcfce7", color: "#166534", padding: "12px 16px", borderRadius: "8px", fontSize: "13px", marginBottom: "16px", display: "flex", justifyContent: "space-between" }, children: [sucesso, h("span", { style: { cursor: "pointer", fontWeight: 700 }, onClick: () => setSucesso(""), children: "×" })] }) : null,

            // Lista
            loading
                ? h("p", { style: { fontSize: "14px", color: "#6b7280" }, children: "Carregando planos preventivos..." })
                : lista.length === 0
                    ? hs("div", { style: { textAlign: "center", padding: "48px" }, children: [
                        h("p", { style: { fontSize: "14px", color: "#6b7280", marginBottom: "12px" }, children: "Nenhum plano preventivo cadastrado." }),
                        h(Button, { onClick: () => setModalNovo(true), style: { background: "#2563eb", color: "#fff", border: "none" }, children: "Criar Primeiro Plano" }),
                    ] })
                    : h("div", {
                        style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "12px" },
                        children: lista.map((plan, i) => {
                            const d = plan.PROXIMA_EXECUCAO ? new Date(`${plan.PROXIMA_EXECUCAO}T00:00:00`) : null;
                            const isAtrasado = d && d.getTime() < hojeMs;
                            const isUrgente = d && !isAtrasado && d.getTime() <= em7Dias;

                            return h(Card, {
                                key: plan.ID || i,
                                style: {
                                    cursor: "pointer",
                                    border: isAtrasado ? "2px solid #fca5a5" : isUrgente ? "2px solid #fcd34d" : "1px solid #e5e7eb",
                                },
                                onClick: () => setDetalhe(plan),
                                children: h(CardContent, {
                                    style: { padding: "16px" },
                                    children: hs("div", { style: { display: "flex", flexDirection: "column", gap: "10px" }, children: [
                                        hs("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" }, children: [
                                            hs("div", { style: { flex: 1, marginRight: "8px" }, children: [
                                                h("p", { style: { fontWeight: 700, fontSize: "14px", margin: "0 0 4px 0" }, children: plan.NOME }),
                                                hs("div", { style: { fontSize: "12px", color: "#6b7280", display: "flex", flexDirection: "column", gap: "2px" }, children: [
                                                    plan.ATIVO_NOME ? h("span", { children: `Ativo: ${plan.ATIVO_NOME}` }) : null,
                                                    plan.CODFILIAL ? h("span", { children: `Filial: ${plan.CODFILIAL}` }) : null,
                                                    plan.TECNICO_PADRAO ? h("span", { children: `Técnico: ${plan.TECNICO_PADRAO}` }) : null,
                                                ] }),
                                            ] }),
                                            h(StatusPrevBadge, { proxExec: plan.PROXIMA_EXECUCAO }),
                                        ] }),

                                        hs("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" }, children: [
                                            h("span", { style: { background: "#dbeafe", color: "#1e40af", padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 600 }, children:
                                                `${Number(plan.PERIODICIDADE_DIAS) === 7 ? "Semanal" : Number(plan.PERIODICIDADE_DIAS) === 30 ? "Mensal" : Number(plan.PERIODICIDADE_DIAS) === 90 ? "Trimestral" : Number(plan.PERIODICIDADE_DIAS) === 365 ? "Anual" : `${plan.PERIODICIDADE_DIAS}d`}`
                                            }),
                                            plan.DURACAO_HORAS ? h("span", { style: { background: "#f3f4f6", color: "#374151", padding: "2px 8px", borderRadius: "4px", fontSize: "11px" }, children: `${plan.DURACAO_HORAS}h estimadas` }) : null,
                                        ] }),

                                        hs("div", { style: { display: "flex", justifyContent: "space-between", fontSize: "12px" }, children: [
                                            h("span", { style: { color: "#6b7280" }, children: `Última: ${formatDate(plan.ULTIMA_EXECUCAO)}` }),
                                            h("span", { style: { fontWeight: 600, color: isAtrasado ? "#dc2626" : "#374151" }, children: `Próxima: ${formatDate(plan.PROXIMA_EXECUCAO)}` }),
                                        ] }),
                                    ] }),
                                }),
                            });
                        }),
                    }),

            modalNovo ? h(ModalNovaPreventiva, {
                onClose: () => setModalNovo(false),
                onCriada: () => { setModalNovo(false); setSucesso("Plano preventivo criado com sucesso!"); carregar(); },
            }) : null,

            detalhe ? h(DetalhePreventiva, {
                plan: detalhe,
                onClose: () => setDetalhe(null),
                onGerarOS: (res) => {
                    setDetalhe(null);
                    setSucesso(`OS ${res.numero} gerada! Acesse Ordens de Serviço para agendar.`);
                },
            }) : null,
        ],
    });
}
