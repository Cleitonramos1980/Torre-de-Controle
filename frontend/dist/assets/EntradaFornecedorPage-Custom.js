import { r as React, j as jsxRuntime, J as Card, N as CardContent, B as Button } from "./index-Cw1PFMX8.js";
import { I as Input } from "./input-CnWhQnjH.js";
import { L as Label } from "./label-CRMrAwdj.js";

const h = jsxRuntime.jsx;
const hs = jsxRuntime.jsxs;

const BASE = "";

async function apiFetch(path, opts) {
    const token = (() => { try { return JSON.parse(localStorage.getItem("sgq.authSession") || "{}").token || ""; } catch { return ""; } })();
    const res = await fetch(BASE + path, {
        ...opts,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers || {}) },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || json?.message || `Erro ${res.status}`);
    return json;
}

function getToken() { try { return JSON.parse(localStorage.getItem("sgq.authSession") || "{}").token || ""; } catch { return ""; } }

function downloadCsv(url, filename) {
    fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } })
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

function fmtDateTime(iso) {
    if (!iso) return "-";
    return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtPermanencia(min) {
    if (min == null) return "-";
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function calcPermanenciaAtual(horaEntrada) {
    const diff = Math.round((Date.now() - new Date(horaEntrada).getTime()) / 60000);
    return fmtPermanencia(diff);
}

const statusLabel = { PRESENTE: "Presente", FINALIZADO: "Finalizado" };
const statusColor = { PRESENTE: { background: "#dcfce7", color: "#166534" }, FINALIZADO: { background: "#f1f5f9", color: "#64748b" } };

const fieldStyle = { width: "100%" };

const hoje = new Date().toISOString().slice(0, 10);
const inicioMes = hoje.slice(0, 7) + "-01";

const EMPTY_FORM = { fornecedor: "", cnpj: "", motorista: "", placa: "", tipoVeiculo: "", notaFiscal: "", localParada: "", obs: "" };

export default function EntradaFornecedorPage() {
    const [lista, setLista] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [filtroStatus, setFiltroStatus] = React.useState("TODOS");
    const [dataInicio, setDataInicio] = React.useState(inicioMes);
    const [dataFim, setDataFim] = React.useState(hoje);
    const [showForm, setShowForm] = React.useState(false);
    const [form, setForm] = React.useState(EMPTY_FORM);
    const [sending, setSending] = React.useState(false);
    const [formError, setFormError] = React.useState("");
    const [registrandoSaida, setRegistrandoSaida] = React.useState(null);
    const [tick, setTick] = React.useState(0);
    const [exportando, setExportando] = React.useState(false);

    React.useEffect(() => {
        const interval = setInterval(() => setTick(t => t + 1), 60000);
        return () => clearInterval(interval);
    }, []);

    const carregar = React.useCallback(async () => {
        setLoading(true);
        try {
            const params = [];
            if (dataInicio) params.push(`dataInicio=${dataInicio}`);
            if (dataFim) params.push(`dataFim=${dataFim}`);
            const qs = params.length ? "?" + params.join("&") : "";
            const data = await apiFetch(`/api/operacional/entradas-fornecedor${qs}`);
            setLista(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [dataInicio, dataFim]);

    React.useEffect(() => { carregar(); }, [carregar]);

    const listaFiltrada = React.useMemo(() => {
        if (filtroStatus === "TODOS") return lista;
        return lista.filter(e => e.status === filtroStatus);
    }, [lista, filtroStatus]);

    const presentes = lista.filter(e => e.status === "PRESENTE").length;
    const finalizados = lista.filter(e => e.status === "FINALIZADO").length;

    const handleChange = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

    const handleSubmit = async (ev) => {
        ev.preventDefault();
        setFormError("");
        if (!form.fornecedor.trim() || !form.placa.trim()) {
            setFormError("Fornecedor e Placa são obrigatórios.");
            return;
        }
        setSending(true);
        try {
            await apiFetch("/api/operacional/entradas-fornecedor", { method: "POST", body: JSON.stringify(form) });
            setShowForm(false);
            setForm(EMPTY_FORM);
            await carregar();
        } catch (e) {
            setFormError(e.message);
        } finally {
            setSending(false);
        }
    };

    const handleSaida = async (id) => {
        setRegistrandoSaida(id);
        try {
            await apiFetch(`/api/operacional/entradas-fornecedor/${id}/saida`, { method: "PUT" });
            await carregar();
        } catch (e) {
            alert(e.message);
        } finally {
            setRegistrandoSaida(null);
        }
    };

    const handleExport = () => {
        setExportando(true);
        const params = [];
        if (dataInicio) params.push(`dataInicio=${dataInicio}`);
        if (dataFim) params.push(`dataFim=${dataFim}`);
        if (filtroStatus !== "TODOS") params.push(`status=${filtroStatus}`);
        const url = `/api/operacional/entradas-fornecedor/export-csv` + (params.length ? "?" + params.join("&") : "");
        const fname = `entradas-fornecedor-${dataInicio || hoje}-a-${dataFim || hoje}.csv`;
        downloadCsv(url, fname);
        setTimeout(() => setExportando(false), 2000);
    };

    return hs("div", {
        className: "p-4 md:p-6 space-y-5 max-w-6xl mx-auto",
        children: [
            // Header
            hs("div", {
                className: "flex items-center justify-between",
                children: [
                    hs("div", {
                        children: [
                            h("h1", { className: "text-2xl font-bold", children: "Entrada de Fornecedores" }),
                            h("p", { className: "text-sm text-muted-foreground mt-0.5", children: "Controle de entrada, permanência e saída de veículos de fornecedores" }),
                        ],
                    }),
                    h(Button, {
                        onClick: () => { setShowForm(true); setFormError(""); setForm(EMPTY_FORM); },
                        style: { backgroundColor: "#2563eb", color: "#ffffff" },
                        children: "+ Registrar Entrada",
                    }),
                ],
            }),

            // KPIs
            hs("div", {
                className: "grid grid-cols-2 md:grid-cols-3 gap-3",
                children: [
                    h(Card, {
                        children: h(CardContent, {
                            className: "pt-4 pb-4",
                            children: hs("div", { children: [
                                h("p", { className: "text-xs text-muted-foreground", children: "No pátio agora" }),
                                h("p", { className: "text-2xl font-bold text-green-600", children: presentes }),
                            ] }),
                        }),
                    }),
                    h(Card, {
                        children: h(CardContent, {
                            className: "pt-4 pb-4",
                            children: hs("div", { children: [
                                h("p", { className: "text-xs text-muted-foreground", children: "Finalizados no período" }),
                                h("p", { className: "text-2xl font-bold", children: finalizados }),
                            ] }),
                        }),
                    }),
                    h(Card, {
                        children: h(CardContent, {
                            className: "pt-4 pb-4",
                            children: hs("div", { children: [
                                h("p", { className: "text-xs text-muted-foreground", children: "Total registros" }),
                                h("p", { className: "text-2xl font-bold", children: lista.length }),
                            ] }),
                        }),
                    }),
                ],
            }),

            // Filtros de data + export
            hs("div", {
                style: { display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" },
                children: [
                    hs("div", { style: { display: "flex", flexDirection: "column", gap: "4px" }, children: [
                        h(Label, { children: "De" }),
                        h(Input, { type: "date", value: dataInicio, onChange: e => setDataInicio(e.target.value), style: { width: "150px" } }),
                    ] }),
                    hs("div", { style: { display: "flex", flexDirection: "column", gap: "4px" }, children: [
                        h(Label, { children: "Até" }),
                        h(Input, { type: "date", value: dataFim, onChange: e => setDataFim(e.target.value), style: { width: "150px" } }),
                    ] }),
                    h(Button, { variant: "outline", onClick: carregar, children: "Filtrar" }),
                    h(Button, {
                        variant: "outline",
                        disabled: exportando,
                        onClick: handleExport,
                        style: { marginLeft: "auto" },
                        children: exportando ? "Gerando..." : "⬇ Exportar CSV",
                    }),
                ],
            }),

            // Filtro de status
            hs("div", {
                className: "flex gap-2",
                children: ["TODOS", "PRESENTE", "FINALIZADO"].map(s =>
                    h(Button, {
                        key: s,
                        variant: filtroStatus === s ? "default" : "outline",
                        style: filtroStatus === s ? { backgroundColor: "#2563eb", color: "#fff" } : {},
                        onClick: () => setFiltroStatus(s),
                        children: s === "TODOS" ? "Todos" : statusLabel[s],
                    })
                ),
            }),

            // Modal Form
            showForm ? h("div", {
                style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" },
                children: h(Card, {
                    style: { width: "100%", maxWidth: "560px", maxHeight: "90vh", overflowY: "auto" },
                    children: h(CardContent, {
                        className: "pt-6 pb-6",
                        children: hs("form", {
                            onSubmit: handleSubmit,
                            className: "space-y-4",
                            children: [
                                hs("div", {
                                    className: "flex items-center justify-between mb-2",
                                    children: [
                                        h("h2", { className: "text-lg font-bold", children: "Registrar Entrada de Fornecedor" }),
                                        h("button", { type: "button", onClick: () => setShowForm(false), style: { fontSize: "20px", cursor: "pointer", background: "none", border: "none", color: "inherit" }, children: "×" }),
                                    ],
                                }),

                                hs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-4", children: [
                                    hs("div", { className: "space-y-1", children: [h(Label, { children: "Fornecedor *" }), h(Input, { value: form.fornecedor, onChange: handleChange("fornecedor"), placeholder: "Nome do fornecedor", style: fieldStyle })] }),
                                    hs("div", { className: "space-y-1", children: [h(Label, { children: "CNPJ" }), h(Input, { value: form.cnpj, onChange: handleChange("cnpj"), placeholder: "00.000.000/0001-00", style: fieldStyle })] }),
                                ] }),

                                hs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-4", children: [
                                    hs("div", { className: "space-y-1", children: [h(Label, { children: "Placa *" }), h(Input, { value: form.placa, onChange: handleChange("placa"), placeholder: "ABC-1D23", style: fieldStyle })] }),
                                    hs("div", { className: "space-y-1", children: [h(Label, { children: "Tipo de Veículo" }), h(Input, { value: form.tipoVeiculo, onChange: handleChange("tipoVeiculo"), placeholder: "Caminhão, Van, Carreta...", style: fieldStyle })] }),
                                ] }),

                                hs("div", { className: "space-y-1", children: [h(Label, { children: "Motorista" }), h(Input, { value: form.motorista, onChange: handleChange("motorista"), placeholder: "Nome do motorista", style: fieldStyle })] }),

                                hs("div", { className: "grid grid-cols-1 sm:grid-cols-2 gap-4", children: [
                                    hs("div", { className: "space-y-1", children: [h(Label, { children: "Nota Fiscal" }), h(Input, { value: form.notaFiscal, onChange: handleChange("notaFiscal"), placeholder: "NF 12345", style: fieldStyle })] }),
                                    hs("div", { className: "space-y-1", children: [h(Label, { children: "Local de Parada" }), h(Input, { value: form.localParada, onChange: handleChange("localParada"), placeholder: "Doca 1, Pátio A...", style: fieldStyle })] }),
                                ] }),

                                hs("div", { className: "space-y-1", children: [
                                    h(Label, { children: "Observações" }),
                                    h("textarea", { value: form.obs, onChange: (e) => setForm(f => ({ ...f, obs: e.target.value })), placeholder: "Observações adicionais...", rows: 2, style: { width: "100%", padding: "8px 12px", borderRadius: "6px", border: "1px solid hsl(var(--input))", background: "hsl(var(--background))", color: "hsl(var(--foreground))", fontSize: "14px", resize: "vertical" } }),
                                ] }),

                                formError ? h("p", { className: "text-sm text-destructive font-medium", children: formError }) : null,

                                hs("div", { className: "flex gap-2 pt-2", children: [
                                    h(Button, { type: "button", variant: "outline", className: "flex-1", onClick: () => setShowForm(false), children: "Cancelar" }),
                                    h(Button, { type: "submit", disabled: sending, className: "flex-1", style: { backgroundColor: "#2563eb", color: "#ffffff" }, children: sending ? "Registrando..." : "Registrar Entrada" }),
                                ] }),
                            ],
                        }),
                    }),
                }),
            }) : null,

            // Tabela
            loading ? h("p", { className: "text-sm text-muted-foreground", children: "Carregando..." }) :
            listaFiltrada.length === 0 ? h(Card, {
                children: h(CardContent, {
                    className: "pt-8 pb-8 text-center",
                    children: h("p", { className: "text-sm text-muted-foreground", children: "Nenhum registro encontrado." }),
                }),
            }) :
            h(Card, {
                children: h(CardContent, {
                    className: "pt-0 pb-0",
                    children: h("div", {
                        style: { overflowX: "auto" },
                        children: h("table", {
                            style: { width: "100%", borderCollapse: "collapse", fontSize: "13px" },
                            children: hs("tbody", {
                                children: [
                                    h("tr", {
                                        style: { borderBottom: "1px solid hsl(var(--border))" },
                                        children: ["Fornecedor", "Placa / Veículo", "NF", "Local", "Entrada", "Permanência", "Saída", "Status", ""].map(col =>
                                            h("th", { key: col, style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "hsl(var(--muted-foreground))", whiteSpace: "nowrap", verticalAlign: "middle" }, children: col })
                                        ),
                                    }),
                                    ...listaFiltrada.map(e =>
                                        h("tr", {
                                            key: e.id,
                                            style: { borderBottom: "1px solid hsl(var(--border))", verticalAlign: "middle" },
                                            children: [
                                                hs("td", { style: { padding: "10px 12px", verticalAlign: "middle" }, children: [
                                                    h("p", { style: { fontWeight: 600, margin: 0 }, children: e.fornecedor }),
                                                    e.motorista ? h("p", { style: { fontSize: "11px", color: "hsl(var(--muted-foreground))", margin: 0 }, children: e.motorista }) : null,
                                                ] }),
                                                hs("td", { style: { padding: "10px 12px", verticalAlign: "middle" }, children: [
                                                    h("p", { style: { fontWeight: 500, margin: 0 }, children: e.placa }),
                                                    e.tipoVeiculo ? h("p", { style: { fontSize: "11px", color: "hsl(var(--muted-foreground))", margin: 0 }, children: e.tipoVeiculo }) : null,
                                                ] }),
                                                h("td", { style: { padding: "10px 12px", whiteSpace: "nowrap", verticalAlign: "middle" }, children: e.notaFiscal || "-" }),
                                                h("td", { style: { padding: "10px 12px", whiteSpace: "nowrap", verticalAlign: "middle" }, children: e.localParada || "-" }),
                                                h("td", { style: { padding: "10px 12px", whiteSpace: "nowrap", verticalAlign: "middle" }, children: fmtDateTime(e.horaEntrada) }),
                                                h("td", { style: { padding: "10px 12px", whiteSpace: "nowrap", fontWeight: e.status === "PRESENTE" ? 600 : 400, verticalAlign: "middle" }, children: e.status === "PRESENTE" ? calcPermanenciaAtual(e.horaEntrada) : fmtPermanencia(e.permanenciaMin) }),
                                                h("td", { style: { padding: "10px 12px", whiteSpace: "nowrap", verticalAlign: "middle" }, children: fmtDateTime(e.horaSaida) }),
                                                h("td", { style: { padding: "10px 12px", verticalAlign: "middle" }, children: h("span", { style: { ...statusColor[e.status], padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap" }, children: statusLabel[e.status] || e.status }) }),
                                                h("td", { style: { padding: "10px 12px", verticalAlign: "middle", whiteSpace: "nowrap" }, children: e.status === "PRESENTE" ? h(Button, { size: "sm", variant: "outline", disabled: registrandoSaida === e.id, onClick: () => handleSaida(e.id), style: { fontSize: "12px", whiteSpace: "nowrap" }, children: registrandoSaida === e.id ? "..." : "Registrar Saída" }) : null }),
                                            ],
                                        })
                                    ),
                                ],
                            }),
                        }),
                    }),
                }),
            }),
        ],
    });
}
