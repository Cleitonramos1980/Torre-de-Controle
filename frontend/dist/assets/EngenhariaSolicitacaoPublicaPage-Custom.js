import { r as React, j as jsxRuntime } from "./index-Cw1PFMX8.js";

const h = jsxRuntime.jsx;
const hs = jsxRuntime.jsxs;

// Página pública — sem autenticação. Chamada pela rota /engenharia/solicitacao-publica
// O backend valida o codfilial via PCFILIAL antes de gravar.

const PRIORIDADE_OPTS = [
    { value: "P2", label: "Normal — pode aguardar (até 72h)" },
    { value: "P1", label: "Urgente — impacta operação (até 24h)" },
    { value: "P0", label: "Emergência — operação parada" },
    { value: "P3", label: "Baixa — melhoria / sem urgência" },
];

const CATEGORIAS = [
    "Elétrica / Iluminação",
    "Hidráulica / Encanamento",
    "Climatização / AVAC",
    "Estrutura / Alvenaria",
    "Refrigeração",
    "Segurança / CFTV / Alarme",
    "TI / Rede",
    "Mobiliário / Fixação",
    "Limpeza / Conservação",
    "Outro",
];

function campo(lbl, children, obrigatorio) {
    return hs("div", { style: { display: "flex", flexDirection: "column", gap: "4px" }, children: [
        hs("label", { style: { fontSize: "13px", fontWeight: 600, color: "#374151" }, children: [lbl, obrigatorio ? h("span", { style: { color: "#dc2626" }, children: " *" }) : null] }),
        children,
    ] });
}

export default function EngenhariaSolicitacaoPublicaPage() {
    const [passo, setPasso] = React.useState(1);
    const [form, setForm] = React.useState({
        codfilial: "", nome_filial: "",
        titulo: "", descricao: "", categoria: "", local_especifico: "", prioridade: "P2",
        solicitante_nome: "", solicitante_email: "", solicitante_fone: "", solicitante_cargo: "",
    });
    const [enviando, setEnviando] = React.useState(false);
    const [protocolo, setProtocolo] = React.useState(null);
    const [erro, setErro] = React.useState("");
    const [validandoFilial, setValidandoFilial] = React.useState(false);
    const [filialOk, setFilialOk] = React.useState(false);

    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const inp = {
        padding: "10px 12px", borderRadius: "8px",
        border: "1px solid #d1d5db", fontSize: "14px",
        width: "100%", boxSizing: "border-box",
        outline: "none",
    };

    const validarFilial = async () => {
        if (!form.codfilial.trim()) return;
        setValidandoFilial(true); setErro(""); setFilialOk(false);
        try {
            const r = await fetch(`/api/engenharia/publica/filial/${form.codfilial.trim()}`);
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(j?.error?.message || "Filial não encontrada.");
            set("nome_filial", j.RAZAO || j.nome_filial || "");
            setFilialOk(true);
        } catch (e) {
            setErro(e.message);
            setFilialOk(false);
        } finally {
            setValidandoFilial(false);
        }
    };

    const avancar = () => {
        setErro("");
        if (passo === 1) {
            if (!filialOk) { setErro("Confirme a filial antes de avançar."); return; }
        }
        if (passo === 2) {
            if (!form.titulo.trim()) { setErro("Descreva o problema/necessidade."); return; }
        }
        if (passo === 3) {
            if (!form.solicitante_nome.trim()) { setErro("Informe seu nome."); return; }
        }
        setPasso(p => p + 1);
    };

    const enviar = async () => {
        if (!form.solicitante_nome.trim()) { setErro("Informe seu nome."); return; }
        setEnviando(true); setErro("");
        try {
            const body = {
                codfilial: form.codfilial.trim(),
                nome_filial: form.nome_filial || undefined,
                titulo: form.titulo.trim(),
                descricao: form.descricao || undefined,
                categoria: form.categoria || undefined,
                local_especifico: form.local_especifico || undefined,
                prioridade: form.prioridade,
                solicitante_nome: form.solicitante_nome.trim(),
                solicitante_email: form.solicitante_email || undefined,
                solicitante_fone: form.solicitante_fone || undefined,
                solicitante_cargo: form.solicitante_cargo || undefined,
            };
            const r = await fetch("/api/engenharia/publica/solicitacao", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(j?.error?.message || `Erro ${r.status}`);
            setProtocolo(j.protocolo || j.id || "OK");
        } catch (e) {
            setErro(e.message || "Erro ao enviar solicitação.");
        } finally {
            setEnviando(false);
        }
    };

    const containerStyle = {
        minHeight: "100vh",
        background: "linear-gradient(135deg, #1e40af 0%, #1d4ed8 50%, #2563eb 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily: "system-ui, -apple-system, sans-serif",
    };

    const cardStyle = {
        background: "#fff",
        borderRadius: "16px",
        padding: "36px",
        width: "100%",
        maxWidth: "560px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
    };

    const btnPrimary = {
        padding: "12px 24px", borderRadius: "8px", border: "none",
        background: "#2563eb", color: "#fff", fontSize: "15px",
        fontWeight: 700, cursor: "pointer", width: "100%",
    };

    const btnSecondary = {
        padding: "12px 24px", borderRadius: "8px",
        border: "1px solid #d1d5db", background: "#fff", color: "#374151",
        fontSize: "14px", cursor: "pointer",
    };

    // Tela de confirmação
    if (protocolo) {
        return h("div", { style: containerStyle, children: h("div", { style: cardStyle, children: hs("div", { style: { textAlign: "center", display: "flex", flexDirection: "column", gap: "16px", alignItems: "center" }, children: [
            h("div", { style: { fontSize: "56px" }, children: "✅" }),
            h("h2", { style: { fontSize: "22px", fontWeight: 800, color: "#166534", margin: 0 }, children: "Solicitação Enviada!" }),
            h("p", { style: { fontSize: "14px", color: "#6b7280", margin: 0 }, children: "Sua solicitação foi registrada com sucesso. Aguarde o contato da equipe de engenharia." }),
            h("div", { style: { background: "#f0fdf4", borderRadius: "10px", padding: "16px 24px", width: "100%", boxSizing: "border-box" }, children: hs("div", { children: [
                h("p", { style: { fontSize: "12px", color: "#6b7280", margin: "0 0 4px" }, children: "Protocolo" }),
                h("p", { style: { fontSize: "20px", fontWeight: 900, fontFamily: "monospace", color: "#166534", margin: 0 }, children: protocolo }),
            ] }) }),
            h("p", { style: { fontSize: "12px", color: "#9ca3af", margin: 0 }, children: "Guarde o número do protocolo para acompanhar o andamento." }),
            h("button", {
                style: { ...btnSecondary, width: "100%" },
                onClick: () => { setProtocolo(null); setPasso(1); setForm({ codfilial: "", nome_filial: "", titulo: "", descricao: "", categoria: "", local_especifico: "", prioridade: "P2", solicitante_nome: "", solicitante_email: "", solicitante_fone: "", solicitante_cargo: "" }); setFilialOk(false); },
                children: "Fazer nova solicitação",
            }),
        ] }) }) });
    }

    const passoLabel = ["", "Identificação da Loja", "Detalhes do Problema", "Seus Dados", "Confirmar e Enviar"];

    return h("div", { style: containerStyle, children: h("div", { style: cardStyle, children: hs("div", { style: { display: "flex", flexDirection: "column", gap: "24px" }, children: [
        // Header
        hs("div", { style: { textAlign: "center" }, children: [
            h("p", { style: { fontSize: "12px", fontWeight: 700, color: "#93c5fd", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.08em" }, children: "RODRIGUES COLCHÕES" }),
            h("h1", { style: { fontSize: "22px", fontWeight: 800, color: "#1e3a8a", margin: "0 0 4px" }, children: "Solicitar Serviço de Engenharia" }),
            h("p", { style: { fontSize: "13px", color: "#6b7280", margin: 0 }, children: "Reporte problemas ou solicite manutenção para sua loja" }),
        ] }),

        // Indicador de passo
        hs("div", { style: { display: "flex", gap: "6px", alignItems: "center" }, children:
            [1, 2, 3, 4].map((n, i, arr) => [
                h("div", { key: `step-${n}`, style: { width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 700, flexShrink: 0, background: passo >= n ? "#2563eb" : "#e5e7eb", color: passo >= n ? "#fff" : "#9ca3af" }, children: passo > n ? "✓" : n }),
                i < arr.length - 1 ? h("div", { key: `line-${n}`, style: { flex: 1, height: 2, background: passo > n ? "#2563eb" : "#e5e7eb" } }) : null,
            ]).flat().filter(Boolean)
        }),
        h("p", { style: { fontSize: "13px", fontWeight: 600, color: "#374151", margin: 0, textAlign: "center" }, children: passoLabel[passo] }),

        // Passo 1: Filial
        passo === 1 ? hs("div", { style: { display: "flex", flexDirection: "column", gap: "14px" }, children: [
            campo("Código da Filial", hs("div", { style: { display: "flex", gap: "8px" }, children: [
                h("input", { style: { ...inp, flex: 1 }, value: form.codfilial, onChange: e => { set("codfilial", e.target.value); setFilialOk(false); set("nome_filial", ""); }, placeholder: "Ex: 1, 2, 10, 25...", onKeyDown: e => e.key === "Enter" && validarFilial() }),
                h("button", { onClick: validarFilial, disabled: validandoFilial || !form.codfilial.trim(), style: { padding: "10px 16px", borderRadius: "8px", border: "none", background: "#1e40af", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "13px" }, children: validandoFilial ? "..." : "Confirmar" }),
            ] }), true),
            filialOk ? h("div", { style: { background: "#f0fdf4", borderRadius: "8px", padding: "12px 16px", display: "flex", gap: "10px", alignItems: "center" }, children: hs("div", { children: [
                h("p", { style: { margin: 0, fontSize: "11px", color: "#6b7280" }, children: "Filial confirmada" }),
                h("p", { style: { margin: 0, fontWeight: 700, color: "#166534" }, children: `${form.codfilial} — ${form.nome_filial}` }),
            ] }) }) : null,
            erro ? h("p", { style: { color: "#dc2626", fontSize: "13px", margin: 0 }, children: erro }) : null,
        ] }) : null,

        // Passo 2: Problema
        passo === 2 ? hs("div", { style: { display: "flex", flexDirection: "column", gap: "14px" }, children: [
            campo("O que está acontecendo?", h("textarea", { style: { ...inp, minHeight: "80px", resize: "vertical" }, value: form.titulo, onChange: e => set("titulo", e.target.value), placeholder: "Ex: Ar-condicionado da sala de vendas não está funcionando..." }), true),
            campo("Detalhes adicionais", h("textarea", { style: { ...inp, minHeight: "60px", resize: "vertical" }, value: form.descricao, onChange: e => set("descricao", e.target.value), placeholder: "Mais informações que ajudem o técnico a entender o problema..." })),
            campo("Categoria", h("select", { style: inp, value: form.categoria, onChange: e => set("categoria", e.target.value), children: [h("option", { value: "", children: "Selecione a categoria..." }), ...CATEGORIAS.map(c => h("option", { key: c, value: c, children: c }))] })),
            campo("Local específico na loja", h("input", { style: inp, value: form.local_especifico, onChange: e => set("local_especifico", e.target.value), placeholder: "Ex: Sala de vendas, Depósito, Caixa, Banheiro..." })),
            campo("Urgência", h("div", { style: { display: "flex", flexDirection: "column", gap: "8px" }, children: PRIORIDADE_OPTS.map(p => hs("label", { key: p.value, style: { display: "flex", gap: "10px", alignItems: "flex-start", cursor: "pointer", padding: "10px 12px", borderRadius: "8px", border: `2px solid ${form.prioridade === p.value ? "#2563eb" : "#e5e7eb"}`, background: form.prioridade === p.value ? "#eff6ff" : "#fff" }, children: [
                h("input", { type: "radio", name: "prioridade", value: p.value, checked: form.prioridade === p.value, onChange: () => set("prioridade", p.value), style: { marginTop: "2px" } }),
                h("span", { style: { fontSize: "13px", color: "#374151" }, children: p.label }),
            ] })) })),
            erro ? h("p", { style: { color: "#dc2626", fontSize: "13px", margin: 0 }, children: erro }) : null,
        ] }) : null,

        // Passo 3: Dados do solicitante
        passo === 3 ? hs("div", { style: { display: "flex", flexDirection: "column", gap: "14px" }, children: [
            campo("Seu nome completo", h("input", { style: inp, value: form.solicitante_nome, onChange: e => set("solicitante_nome", e.target.value), placeholder: "Nome completo" }), true),
            campo("Cargo / Função", h("input", { style: inp, value: form.solicitante_cargo, onChange: e => set("solicitante_cargo", e.target.value), placeholder: "Ex: Gerente, Vendedor, Auxiliar..." })),
            campo("Telefone para contato", h("input", { style: inp, value: form.solicitante_fone, onChange: e => set("solicitante_fone", e.target.value), placeholder: "(00) 00000-0000" })),
            campo("E-mail (opcional)", h("input", { style: inp, type: "email", value: form.solicitante_email, onChange: e => set("solicitante_email", e.target.value), placeholder: "email@empresa.com" })),
            erro ? h("p", { style: { color: "#dc2626", fontSize: "13px", margin: 0 }, children: erro }) : null,
        ] }) : null,

        // Passo 4: Confirmar
        passo === 4 ? hs("div", { style: { display: "flex", flexDirection: "column", gap: "12px" }, children: [
            h("div", { style: { background: "#f9fafb", borderRadius: "10px", padding: "16px" }, children: hs("div", { style: { display: "flex", flexDirection: "column", gap: "8px", fontSize: "13px" }, children: [
                hs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [h("span", { style: { color: "#6b7280" }, children: "Filial" }), h("span", { style: { fontWeight: 600 }, children: `${form.codfilial} — ${form.nome_filial}` })] }),
                hs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [h("span", { style: { color: "#6b7280" }, children: "Problema" }), h("span", { style: { fontWeight: 600, maxWidth: "65%", textAlign: "right" }, children: form.titulo })] }),
                form.categoria ? hs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [h("span", { style: { color: "#6b7280" }, children: "Categoria" }), h("span", { style: { fontWeight: 600 }, children: form.categoria })] }) : null,
                hs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [h("span", { style: { color: "#6b7280" }, children: "Urgência" }), h("span", { style: { fontWeight: 600 }, children: PRIORIDADE_OPTS.find(p => p.value === form.prioridade)?.label })] }),
                hs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [h("span", { style: { color: "#6b7280" }, children: "Solicitante" }), h("span", { style: { fontWeight: 600 }, children: form.solicitante_nome })] }),
                form.solicitante_fone ? hs("div", { style: { display: "flex", justifyContent: "space-between" }, children: [h("span", { style: { color: "#6b7280" }, children: "Telefone" }), h("span", { style: { fontWeight: 600 }, children: form.solicitante_fone })] }) : null,
            ].filter(Boolean) }) }),
            erro ? h("p", { style: { color: "#dc2626", fontSize: "13px", margin: 0 }, children: erro }) : null,
        ] }) : null,

        // Ações
        hs("div", { style: { display: "flex", gap: "10px", marginTop: "4px" }, children: [
            passo > 1 ? h("button", { onClick: () => { setErro(""); setPasso(p => p - 1); }, style: { ...btnSecondary, flex: 1 }, children: "← Voltar" }) : null,
            passo < 4 ? h("button", { onClick: avancar, style: { ...btnPrimary, flex: 2 }, children: "Continuar →" }) : null,
            passo === 4 ? h("button", { onClick: enviar, disabled: enviando, style: { ...btnPrimary, flex: 2, background: "#16a34a" }, children: enviando ? "Enviando..." : "Enviar Solicitação ✓" }) : null,
        ] }),
    ] }) }) });
}
