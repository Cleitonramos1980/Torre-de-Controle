import { r as React, j as jsxRuntime, J as Card, N as CardContent, B as Button } from "./index-Cw1PFMX8.js";

const h = jsxRuntime.jsx;
const hs = jsxRuntime.jsxs;

function getToken() { try { return JSON.parse(localStorage.getItem("sgq.authSession") || "{}").token || ""; } catch { return ""; } }

const RELATORIOS = [
    {
        tipo: "os",
        titulo: "Ordens de Serviço",
        descricao: "Lista completa de OS com status, custo, técnico e filial. Inclui indicadores de prazo e retrabalho.",
        icon: "🔧",
        cor: "#2563eb",
        params: ["periodo", "status", "filial", "tipo"],
    },
    {
        tipo: "custos-filial",
        titulo: "Custos por Filial",
        descricao: "Custo realizado agrupado por filial, com totais de OS e horas. Ideal para rateio de custos.",
        icon: "💰",
        cor: "#d97706",
        params: ["periodo"],
    },
    {
        tipo: "historico-ativo",
        titulo: "Histórico de Ativos",
        descricao: "OS e ocorrências por ativo/equipamento. Útil para análise de confiabilidade e vida útil.",
        icon: "🏗️",
        cor: "#7c3aed",
        params: ["periodo", "ativo_id"],
    },
    {
        tipo: "estoque",
        titulo: "Relatório de Estoque",
        descricao: "Posição atual do estoque de engenharia com movimentações. Identifica itens críticos e consumo.",
        icon: "📦",
        cor: "#059669",
        params: [],
    },
];

const PERIODOS = [
    { value: "30", label: "Últimos 30 dias" },
    { value: "60", label: "Últimos 60 dias" },
    { value: "90", label: "Últimos 90 dias" },
    { value: "180", label: "Últimos 6 meses" },
    { value: "365", label: "Último ano" },
];

const STATUS_OS = ["", "PLANEJADA", "AGENDADA", "EM_ANDAMENTO", "PAUSADA", "CONCLUIDA", "CANCELADA", "RETRABALHO"];
const TIPO_OS = ["", "CORRETIVA", "PREVENTIVA", "MELHORIA", "EMERGENCIA"];

function baixarRelatorio(tipo, params) {
    const token = getToken();
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v)));
    const url = `/api/engenharia/relatorios/${tipo}?${q}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `engenharia-${tipo}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.style.display = "none";
    document.body.appendChild(a);
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => {
            if (!r.ok) return r.json().then(d => Promise.reject(new Error(d?.error?.message || `Erro ${r.status}`)));
            return r.blob();
        })
        .then(blob => {
            const burl = URL.createObjectURL(blob);
            a.href = burl;
            a.click();
            setTimeout(() => { URL.revokeObjectURL(burl); document.body.removeChild(a); }, 1000);
        })
        .catch(err => alert(`Erro ao gerar relatório: ${err.message}`));
}

function RelatorioCard({ rel }) {
    const [periodo, setPeriodo] = React.useState("90");
    const [status, setStatus] = React.useState("");
    const [filial, setFilial] = React.useState("");
    const [tipo, setTipo] = React.useState("");
    const [ativoId, setAtivoId] = React.useState("");
    const [baixando, setBaixando] = React.useState(false);

    const temParam = (p) => rel.params.includes(p);

    const baixar = () => {
        setBaixando(true);
        const params = { periodo, status, filial, tipo, ativo_id: ativoId };
        baixarRelatorio(rel.tipo, params);
        setTimeout(() => setBaixando(false), 2000);
    };

    const inp = { padding: "7px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "12px", width: "100%", boxSizing: "border-box" };
    const lbl = (t) => h("label", { style: { fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "3px", color: "hsl(var(--muted-foreground))" }, children: t });

    return h(Card, {
        style: { borderLeft: `4px solid ${rel.cor}` },
        children: h(CardContent, {
            style: { padding: "20px" },
            children: hs("div", { style: { display: "flex", flexDirection: "column", gap: "14px" }, children: [
                hs("div", { children: [
                    hs("div", { style: { display: "flex", gap: "10px", alignItems: "center", marginBottom: "4px" }, children: [
                        h("span", { style: { fontSize: "22px" }, children: rel.icon }),
                        h("h3", { style: { margin: 0, fontSize: "15px", fontWeight: 700 }, children: rel.titulo }),
                    ] }),
                    h("p", { style: { margin: 0, fontSize: "13px", color: "hsl(var(--muted-foreground))" }, children: rel.descricao }),
                ] }),

                rel.params.length > 0 ? hs("div", { style: { display: "flex", flexDirection: "column", gap: "10px" }, children: [
                    temParam("periodo") ? hs("div", { children: [lbl("Período"), h("select", { style: inp, value: periodo, onChange: e => setPeriodo(e.target.value), children: PERIODOS.map(p => h("option", { key: p.value, value: p.value, children: p.label })) })] }) : null,
                    temParam("status") ? hs("div", { children: [lbl("Status da OS"), h("select", { style: inp, value: status, onChange: e => setStatus(e.target.value), children: STATUS_OS.map(s => h("option", { key: s, value: s, children: s || "Todos os status" })) })] }) : null,
                    temParam("tipo") ? hs("div", { children: [lbl("Tipo de OS"), h("select", { style: inp, value: tipo, onChange: e => setTipo(e.target.value), children: TIPO_OS.map(t => h("option", { key: t, value: t, children: t || "Todos os tipos" })) })] }) : null,
                    temParam("filial") ? hs("div", { children: [lbl("Filial (código)"), h("input", { style: inp, value: filial, onChange: e => setFilial(e.target.value), placeholder: "Deixar em branco = todas" })] }) : null,
                    temParam("ativo_id") ? hs("div", { children: [lbl("ID do Ativo (opcional)"), h("input", { style: inp, value: ativoId, onChange: e => setAtivoId(e.target.value), placeholder: "Deixar em branco = todos os ativos" })] }) : null,
                ].filter(Boolean) }) : null,

                h(Button, {
                    onClick: baixar,
                    disabled: baixando,
                    style: { background: rel.cor, color: "#fff", border: "none", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" },
                    children: baixando ? "Gerando..." : "⬇ Baixar Excel (.xlsx)",
                }),
            ] }),
        }),
    });
}

export default function EngenhariaRelatoriosPage() {
    return hs("div", {
        style: { padding: "24px", maxWidth: "1200px", margin: "0 auto" },
        children: [
            hs("div", { style: { marginBottom: "28px" }, children: [
                h("h1", { style: { fontSize: "22px", fontWeight: 700, margin: "0 0 4px 0" }, children: "Relatórios de Engenharia" }),
                h("p", { style: { fontSize: "13px", color: "hsl(var(--muted-foreground))", margin: 0 }, children: "Exporte dados do módulo de engenharia em formato Excel (.xlsx)" }),
            ] }),

            h("div", {
                style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "16px" },
                children: RELATORIOS.map(rel => h(RelatorioCard, { key: rel.tipo, rel })),
            }),

            h(Card, {
                style: { marginTop: "24px", border: "1px dashed hsl(var(--border))" },
                children: h(CardContent, {
                    style: { padding: "20px" },
                    children: hs("div", { style: { display: "flex", gap: "12px", alignItems: "flex-start" }, children: [
                        h("span", { style: { fontSize: "24px" }, children: "ℹ️" }),
                        hs("div", { children: [
                            h("h4", { style: { margin: "0 0 6px", fontSize: "14px", fontWeight: 700 }, children: "Sobre os Relatórios" }),
                            h("ul", { style: { margin: 0, paddingLeft: "18px", fontSize: "13px", color: "hsl(var(--muted-foreground))", lineHeight: "1.8" }, children: [
                                h("li", { children: "Os relatórios são gerados em tempo real a partir dos dados do Oracle." }),
                                h("li", { children: "O download inicia automaticamente no seu navegador." }),
                                h("li", { children: "Arquivos .xlsx são compatíveis com Excel, LibreOffice e Google Sheets." }),
                                h("li", { children: "O parâmetro de período conta dias retroativos a partir de hoje." }),
                            ] }),
                        ] }),
                    ] }),
                }),
            }),
        ],
    });
}
