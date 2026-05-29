import { r as React, j as jsxRuntime, J as Card, N as CardContent, B as Button } from "./index-Cw1PFMX8.js";
import { I as Input } from "./input-CnWhQnjH.js";
import { L as Label } from "./label-CRMrAwdj.js";

const h = jsxRuntime.jsx;
const hs = jsxRuntime.jsxs;

function getToken() { try { return JSON.parse(localStorage.getItem("sgq.authSession") || "{}").token || ""; } catch { return ""; } }

function downloadCsv(url, filename) {
    const fullUrl = url + (url.includes("?") ? "&" : "?") + `_t=${Date.now()}`;
    fetch(fullUrl, { headers: { Authorization: `Bearer ${getToken()}` } })
        .then(r => r.blob())
        .then(blob => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            a.click();
            URL.revokeObjectURL(a.href);
        })
        .catch(() => alert("Erro ao exportar. Tente novamente."));
}

const hoje = new Date().toISOString().slice(0, 10);
const inicioMes = hoje.slice(0, 7) + "-01";

const RELATORIOS = [
    {
        id: "entradas-fornecedor",
        titulo: "Entrada de Fornecedores",
        descricao: "Histórico de entrada e saída de veículos de fornecedores com permanência",
        endpoint: "/api/operacional/entradas-fornecedor/export-csv",
        filename: "entradas-fornecedor.csv",
        filtros: ["dataInicio", "dataFim", "status"],
        statusOpcoes: ["TODOS", "PRESENTE", "FINALIZADO"],
        grupo: "Pátio & Logística",
    },
    {
        id: "visitantes",
        titulo: "Visitantes",
        descricao: "Cadastro de visitantes registrados no sistema",
        endpoint: "/api/operacional/visitantes/export-csv",
        filename: "visitantes.csv",
        filtros: ["dataInicio", "dataFim"],
        grupo: "Portaria",
    },
    {
        id: "acessos",
        titulo: "Acessos / Portaria",
        descricao: "Registro completo de acessos à empresa",
        endpoint: "/api/operacional/acessos/export-csv",
        filename: "acessos.csv",
        filtros: ["dataInicio", "dataFim", "status"],
        statusOpcoes: ["TODOS", "DENTRO", "SAIU", "AGUARDANDO_VALIDACAO"],
        grupo: "Portaria",
    },
    {
        id: "frota",
        titulo: "Frota de Veículos",
        descricao: "Situação atual da frota própria cadastrada",
        endpoint: "/api/operacional/frota/export-csv",
        filename: "frota.csv",
        filtros: [],
        grupo: "Frota & Logística",
    },
];

function ReportCard({ rel }) {
    const [dataInicio, setDataInicio] = React.useState(inicioMes);
    const [dataFim, setDataFim] = React.useState(hoje);
    const [status, setStatus] = React.useState("TODOS");
    const [baixando, setBaixando] = React.useState(false);

    const temDataInicio = rel.filtros.includes("dataInicio");
    const temDataFim = rel.filtros.includes("dataFim");
    const temStatus = rel.filtros.includes("status");

    const handleExport = () => {
        setBaixando(true);
        const params = [];
        if (temDataInicio && dataInicio) params.push(`dataInicio=${dataInicio}`);
        if (temDataFim && dataFim) params.push(`dataFim=${dataFim}`);
        if (temStatus && status !== "TODOS") params.push(`status=${status}`);
        const url = rel.endpoint + (params.length ? "?" + params.join("&") : "");
        const fname = rel.filename.replace(".csv", `-${dataInicio || hoje}-a-${dataFim || hoje}.csv`);
        downloadCsv(url, fname);
        setTimeout(() => setBaixando(false), 2000);
    };

    return h(Card, {
        children: h(CardContent, {
            className: "pt-5 pb-5",
            children: hs("div", {
                className: "space-y-3",
                children: [
                    hs("div", {
                        children: [
                            h("h3", { style: { fontWeight: 700, fontSize: "15px" }, children: rel.titulo }),
                            h("p", { style: { fontSize: "12px", color: "hsl(var(--muted-foreground))", marginTop: "2px" }, children: rel.descricao }),
                        ],
                    }),

                    (temDataInicio || temDataFim || temStatus) ? hs("div", {
                        className: "grid grid-cols-1 sm:grid-cols-3 gap-3",
                        children: [
                            temDataInicio ? hs("div", { className: "space-y-1", children: [h(Label, { children: "De" }), h(Input, { type: "date", value: dataInicio, onChange: e => setDataInicio(e.target.value), style: { width: "100%" } })] }) : null,
                            temDataFim ? hs("div", { className: "space-y-1", children: [h(Label, { children: "Até" }), h(Input, { type: "date", value: dataFim, onChange: e => setDataFim(e.target.value), style: { width: "100%" } })] }) : null,
                            temStatus ? hs("div", { className: "space-y-1", children: [
                                h(Label, { children: "Status" }),
                                h("select", {
                                    value: status,
                                    onChange: e => setStatus(e.target.value),
                                    style: { width: "100%", padding: "8px 10px", borderRadius: "6px", border: "1px solid hsl(var(--input))", background: "hsl(var(--background))", color: "hsl(var(--foreground))", fontSize: "13px" },
                                    children: (rel.statusOpcoes || ["TODOS"]).map(s => h("option", { key: s, value: s, children: s })),
                                }),
                            ] }) : null,
                        ],
                    }) : null,

                    h(Button, {
                        disabled: baixando,
                        style: { backgroundColor: "#2563eb", color: "#fff", width: "100%" },
                        onClick: handleExport,
                        children: baixando ? "Gerando..." : "⬇ Exportar CSV",
                    }),
                ],
            }),
        }),
    });
}

export default function RelatoriosPage() {
    const grupos = [...new Set(RELATORIOS.map(r => r.grupo))];

    return hs("div", {
        className: "p-4 md:p-6 space-y-6 max-w-4xl mx-auto",
        children: [
            hs("div", {
                children: [
                    h("h1", { className: "text-2xl font-bold", children: "Relatórios" }),
                    h("p", { className: "text-sm text-muted-foreground mt-1", children: "Exporte dados em CSV para análise no Excel ou outros sistemas." }),
                ],
            }),

            ...grupos.map(grupo =>
                hs("div", {
                    key: grupo,
                    className: "space-y-3",
                    children: [
                        h("h2", { style: { fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "hsl(var(--muted-foreground))" }, children: grupo }),
                        h("div", {
                            className: "grid grid-cols-1 md:grid-cols-2 gap-3",
                            children: RELATORIOS.filter(r => r.grupo === grupo).map(rel => h(ReportCard, { key: rel.id, rel })),
                        }),
                    ],
                })
            ),
        ],
    });
}
