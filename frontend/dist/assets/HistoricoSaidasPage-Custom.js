import { i as useToast, r as React, j as jsxRuntime, J as Card, K as CardHeader, M as CardTitle, N as CardContent, B as Button, a as apiGet } from "./index-Cw1PFMX8.js";
import { I as Input } from "./input-CnWhQnjH.js";
import { B as Badge } from "./badge-B2SLyCXJ.js";
import { T as Table, a as TableHeader, b as TableRow, c as TableHead, d as TableBody, e as TableCell } from "./table-BASKWVp-.js";

const h = jsxRuntime.jsx;
const hs = jsxRuntime.jsxs;

const MOTIVO_LABEL = {
    MEDICO: "Consulta Medica",
    BANCO: "Banco",
    FARMACIA: "Farmacia",
    PESSOAL: "Pessoal",
    ALMOCO_EXTERNO: "Almoco Ext.",
    OUTRO: "Outro",
};

const STATUS_BADGE = {
    PENDENTE_APROVACAO: { label: "Pendente", variant: "secondary" },
    APROVADA: { label: "Aprovada", variant: "default" },
    NEGADA: { label: "Negada", variant: "destructive" },
    SAIDA_REALIZADA: { label: "Fora", variant: "outline" },
    RETORNO_CONFIRMADO: { label: "Retornou", variant: "outline" },
    CANCELADA: { label: "Cancelada", variant: "secondary" },
    EXPIRADA: { label: "Expirada", variant: "secondary" },
};

const STATUS_OPTIONS = [
    { value: "", label: "Todos os status" },
    { value: "PENDENTE_APROVACAO", label: "Pendente" },
    { value: "APROVADA", label: "Aprovada" },
    { value: "NEGADA", label: "Negada" },
    { value: "SAIDA_REALIZADA", label: "Fora" },
    { value: "RETORNO_CONFIRMADO", label: "Retornou" },
    { value: "CANCELADA", label: "Cancelada" },
    { value: "EXPIRADA", label: "Expirada" },
];

function fmtDate(iso) {
    if (!iso) return "-";
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function toIso(date) {
    return date instanceof Date ? date.toISOString().slice(0, 10) : "";
}

function defaultFilters() {
    const today = new Date();
    const start = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { funcionario: "", status: "", dataInicial: toIso(start), dataFinal: toIso(today) };
}

function exportCsv(rows) {
    const headers = ["ID", "Funcionario", "Matricula", "Motivo", "Status", "Solicitado", "Saiu em", "Retornou em", "Aprovador"];
    const lines = [
        headers.join(";"),
        ...rows.map((r) => [
            r.id,
            r.funcionarioNome || "",
            r.funcionarioMatricula || "",
            MOTIVO_LABEL[r.motivo] || r.motivo,
            r.status,
            fmtDate(r.criadoEm),
            fmtDate(r.saidaEm),
            fmtDate(r.retornoEm),
            r.aprovadorNome || "",
        ].join(";"))
    ];
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `saidas_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

const selectStyle = {
    width: "100%",
    height: "40px",
    padding: "0 12px",
    borderRadius: "6px",
    border: "1px solid hsl(var(--input))",
    background: "hsl(var(--background))",
    color: "hsl(var(--foreground))",
    fontSize: "14px",
};

export default function HistoricoSaidasPage() {
    const { toast } = useToast();

    const [filters, setFilters] = React.useState(defaultFilters);
    const [rows, setRows] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [total, setTotal] = React.useState(0);

    const loadData = React.useCallback(async (f) => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (f.funcionario) params.set("funcionario", f.funcionario);
            if (f.status) params.set("status", f.status);
            if (f.dataInicial) params.set("dataInicial", f.dataInicial);
            if (f.dataFinal) params.set("dataFinal", f.dataFinal);
            params.set("limit", "100");
            const qs = params.toString();
            const data = await apiGet(`/portaria/saida-funcionario${qs ? "?" + qs : ""}`);
            const items = Array.isArray(data) ? data : (data.items || []);
            setRows(items);
            setTotal(data.total || items.length);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Erro ao carregar.";
            toast({ title: "Erro", description: msg, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    React.useEffect(() => { loadData(filters); }, []);

    const setF = (key, val) => setFilters((prev) => ({ ...prev, [key]: val }));

    return hs("div", {
        className: "p-4 md:p-6 space-y-4",
        children: [
            hs("div", {
                className: "flex items-center justify-between flex-wrap gap-2",
                children: [
                    hs("div", {
                        children: [
                            h("h1", { className: "text-2xl font-bold", children: "Historico de Saidas" }),
                            h("p", { className: "text-muted-foreground text-sm", children: `${total} registro(s)` }),
                        ],
                    }),
                    h(Button, {
                        variant: "outline",
                        onClick: () => exportCsv(rows),
                        disabled: rows.length === 0,
                        children: "Exportar CSV",
                    }),
                ],
            }),

            h(Card, {
                children: h(CardContent, {
                    className: "pt-4",
                    children: hs("div", {
                        className: "grid grid-cols-2 md:grid-cols-4 gap-3",
                        children: [
                            h(Input, {
                                placeholder: "Funcionario / matricula",
                                value: filters.funcionario,
                                onChange: (e) => setF("funcionario", e.target.value),
                            }),
                            h("select", {
                                value: filters.status,
                                onChange: (e) => setF("status", e.target.value),
                                style: selectStyle,
                                children: STATUS_OPTIONS.map((o) => h("option", { key: o.value, value: o.value, children: o.label })),
                            }),
                            h(Input, {
                                type: "date",
                                value: filters.dataInicial,
                                onChange: (e) => setF("dataInicial", e.target.value),
                            }),
                            h(Input, {
                                type: "date",
                                value: filters.dataFinal,
                                onChange: (e) => setF("dataFinal", e.target.value),
                            }),
                            h(Button, {
                                onClick: () => loadData(filters),
                                disabled: loading,
                                className: "col-span-2 md:col-span-4",
                                children: loading ? "Buscando..." : "Buscar",
                            }),
                        ],
                    }),
                }),
            }),

            h(Card, {
                children: h(CardContent, {
                    className: "pt-4 overflow-x-auto",
                    children: loading
                        ? h("p", { className: "text-sm text-muted-foreground text-center py-4", children: "Carregando..." })
                        : rows.length === 0
                            ? h("p", { className: "text-sm text-muted-foreground text-center py-4", children: "Nenhum registro encontrado." })
                            : hs(Table, {
                                children: [
                                    h(TableHeader, {
                                        children: hs(TableRow, {
                                            children: [
                                                h(TableHead, { children: "ID" }),
                                                h(TableHead, { children: "Funcionario" }),
                                                h(TableHead, { children: "Motivo" }),
                                                h(TableHead, { children: "Status" }),
                                                h(TableHead, { children: "Solicitado" }),
                                                h(TableHead, { children: "Saiu em" }),
                                                h(TableHead, { children: "Retornou" }),
                                                h(TableHead, { children: "Aprovador" }),
                                            ],
                                        }),
                                    }),
                                    h(TableBody, {
                                        children: rows.map((r) => {
                                            const bInfo = STATUS_BADGE[r.status] || { label: r.status, variant: "secondary" };
                                            return hs(TableRow, {
                                                children: [
                                                    h(TableCell, { className: "font-mono text-xs", children: r.id }),
                                                    h(TableCell, {
                                                        children: hs("div", {
                                                            children: [
                                                                h("p", { className: "font-medium text-sm", children: r.funcionarioNome || "-" }),
                                                                h("p", { className: "text-xs text-muted-foreground", children: r.funcionarioMatricula || "" }),
                                                            ],
                                                        }),
                                                    }),
                                                    h(TableCell, { className: "text-sm", children: MOTIVO_LABEL[r.motivo] || r.motivo }),
                                                    h(TableCell, { children: h(Badge, { variant: bInfo.variant, children: bInfo.label }) }),
                                                    h(TableCell, { className: "text-xs whitespace-nowrap", children: fmtDate(r.criadoEm) }),
                                                    h(TableCell, { className: "text-xs whitespace-nowrap", children: fmtDate(r.saidaEm) }),
                                                    h(TableCell, { className: "text-xs whitespace-nowrap", children: fmtDate(r.retornoEm) }),
                                                    h(TableCell, { className: "text-sm", children: r.aprovadorNome || "-" }),
                                                ],
                                            }, r.id);
                                        }),
                                    }),
                                ],
                            }),
                }),
            }),
        ],
    });
}
