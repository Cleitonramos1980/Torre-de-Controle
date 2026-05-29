import { i as useToast, r as React, j as jsxRuntime, J as Card, K as CardHeader, M as CardTitle, N as CardContent, u as Button, a as apiGet, w as apiPost, a2 as apiMultipart } from "./index-Cw1PFMX8.js";
import { T as Table, a as TableHeader, b as TableRow, c as TableHead, d as TableBody, e as TableCell } from "./table-BASKWVp-.js";
const h = jsxRuntime.jsx;
const hs = jsxRuntime.jsxs;
const API_BASE = "/recebiveis-cartao/rede-sales-validation";
const STATUS_OPTIONS = [
    "VENDA_VALIDADA",
    "VENDA_REDE_NAO_ENCONTRADA_NO_SISTEMA",
    "VENDA_SISTEMA_NAO_ENCONTRADA_NA_REDE",
    "NSU_DIVERGENTE",
    "VALOR_DIVERGENTE",
    "DATA_DIVERGENTE",
    "FILIAL_DIVERGENTE",
    "MATCH_PROVAVEL",
    "ANALISE_MANUAL",
];
function buildQuery(query) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
        if (value == null)
            return;
        if (typeof value === "string" && value.trim().length === 0)
            return;
        params.set(key, String(value));
    });
    const serialized = params.toString();
    return serialized.length > 0 ? `?${serialized}` : "";
}
function formatMoney(value) {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed))
        return "R$ 0,00";
    return parsed.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatPercent(value) {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed))
        return "0%";
    return `${parsed.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}
function isDivergence(status) {
    return String(status) !== "VENDA_VALIDADA";
}
function statusClass(status) {
    if (status === "VENDA_VALIDADA")
        return "bg-emerald-100 text-emerald-700";
    if (status === "MATCH_PROVAVEL")
        return "bg-blue-100 text-blue-700";
    if (status === "ANALISE_MANUAL")
        return "bg-violet-100 text-violet-700";
    if (status === "NSU_DIVERGENTE" || status === "VALOR_DIVERGENTE" || status === "DATA_DIVERGENTE" || status === "FILIAL_DIVERGENTE")
        return "bg-amber-100 text-amber-700";
    if (status === "VENDA_REDE_NAO_ENCONTRADA_NO_SISTEMA" || status === "VENDA_SISTEMA_NAO_ENCONTRADA_NA_REDE")
        return "bg-rose-100 text-rose-700";
    return "bg-slate-100 text-slate-700";
}
function statusLabel(status) {
    return String(status ?? "")
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/\b\w/g, (match) => match.toUpperCase());
}
function SummaryCard(props) {
    return hs("div", {
        className: "rounded-md border border-border/70 bg-card p-4",
        children: [
            h("p", { className: "text-xs uppercase tracking-wide text-muted-foreground", children: props.title }),
            h("p", { className: "mt-2 text-2xl font-semibold text-foreground", children: props.value }),
        ],
    });
}
function MiniButton(props) {
    return h(Button, {
        variant: "outline",
        size: "sm",
        disabled: props.disabled,
        onClick: props.onClick,
        children: props.children,
    });
}
const DEFAULT_FILTERS = {
    status: "",
    filial: "",
    cnpj: "",
    periodoInicio: "",
    periodoFim: "",
    valorMin: "",
    valorMax: "",
    scoreMin: "",
    somenteDivergencias: false,
};
const DEFAULT_TOLERANCES = {
    tolerancia_valor_reais: "0.05",
    tolerancia_valor_percentual: "0.01",
    tolerancia_dias: "1",
    considerar_data_proxima: true,
    considerar_valor_aproximado: true,
};
const DEFAULT_ITEMS_RESPONSE = {
    registros: [],
    paginacao: { page: 1, pageSize: 25, totalPages: 1, totalItems: 0 },
    total: 0,
};
const DEFAULT_UNMATCHED_RESPONSE = {
    registros: [],
    paginacao: { page: 1, pageSize: 25, totalPages: 1, totalItems: 0 },
    total: 0,
};
const DEFAULT_HISTORY = { registros: [], total: 0 };
function ValidationResultsTable(props) {
    if (!props.items.length) {
        return h("div", {
            className: "rounded-md border border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground",
            children: "Nenhum item encontrado para os filtros aplicados.",
        });
    }
    return h("div", {
        className: "overflow-x-auto",
        children: hs(Table, {
            children: [
                h(TableHeader, {
                    children: hs(TableRow, {
                        children: [
                            h(TableHead, { children: "Linha" }),
                            h(TableHead, { children: "CNPJ Rede" }),
                            h(TableHead, { children: "Codigo filial WinThor" }),
                            h(TableHead, { children: "NSU Rede" }),
                            h(TableHead, { children: "NSU Sistema" }),
                            h(TableHead, { children: "Status NSU" }),
                            h(TableHead, { children: "Data Rede" }),
                            h(TableHead, { children: "Data Sistema" }),
                            h(TableHead, { children: "Status Data" }),
                            h(TableHead, { children: "Valor Rede" }),
                            h(TableHead, { children: "Valor Sistema" }),
                            h(TableHead, { children: "Diferenca Valor" }),
                            h(TableHead, { children: "Status Valor" }),
                            h(TableHead, { children: "Pedido Rede" }),
                            h(TableHead, { children: "Pedido Sistema" }),
                            h(TableHead, { children: "Nota Sistema" }),
                            h(TableHead, { children: "Status Geral" }),
                            h(TableHead, { children: "Match Score" }),
                            h(TableHead, { children: "Motivo da divergencia" }),
                            h(TableHead, { className: "text-right", children: "Acoes" }),
                        ],
                    }),
                }),
                h(TableBody, {
                    children: props.items.map((row) => hs(TableRow, {
                        children: [
                            h(TableCell, { children: row.row_number }),
                            h(TableCell, { children: row.branch_cnpj_raw || "-" }),
                            h(TableCell, { children: row.pcfilial_codigo || "-" }),
                            h(TableCell, { children: row.rede_nsu || "-" }),
                            h(TableCell, { children: row.winthor_nsu || "-" }),
                            h(TableCell, { children: statusLabel(row.nsu_status) }),
                            h(TableCell, { children: row.rede_sale_date || "-" }),
                            h(TableCell, { children: row.winthor_sale_date || "-" }),
                            h(TableCell, { children: statusLabel(row.date_status) }),
                            h(TableCell, { children: formatMoney(row.rede_amount) }),
                            h(TableCell, { children: formatMoney(row.winthor_amount) }),
                            h(TableCell, { children: row.value_difference == null ? "-" : formatMoney(row.value_difference) }),
                            h(TableCell, { children: statusLabel(row.value_status) }),
                            h(TableCell, { children: row.rede_document || "-" }),
                            h(TableCell, { children: row.winthor_numped || "-" }),
                            h(TableCell, { children: row.winthor_numnota || "-" }),
                            h(TableCell, {
                                children: h("span", {
                                    className: `inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusClass(row.validation_status)}`,
                                    children: statusLabel(row.validation_status),
                                }),
                            }),
                            h(TableCell, { children: row.match_score ?? 0 }),
                            h(TableCell, {
                                className: "max-w-[280px] truncate",
                                title: row.reason || "-",
                                children: row.reason || "-",
                            }),
                            h(TableCell, {
                                className: "text-right",
                                children: hs("div", {
                                    className: "flex justify-end gap-2",
                                    children: [
                                        h(MiniButton, {
                                            onClick: () => props.onViewRow(row),
                                            children: "Detalhe",
                                        }),
                                        h(MiniButton, {
                                            onClick: () => props.onMarkManual(row),
                                            children: "Analise manual",
                                        }),
                                        h(MiniButton, {
                                            onClick: () => props.onExportRow(row),
                                            children: "Exportar",
                                        }),
                                    ],
                                }),
                            }),
                        ],
                    }, row.id)),
                }),
            ],
        }),
    });
}
function WinthorUnmatchedTable(props) {
    if (!props.items.length) {
        return h("div", {
            className: "rounded-md border border-border/70 bg-muted/20 p-6 text-sm text-muted-foreground",
            children: "Nenhuma venda do Sistema sem correspondencia na planilha REDE.",
        });
    }
    return h("div", {
        className: "overflow-x-auto",
        children: hs(Table, {
            children: [
                h(TableHeader, {
                    children: hs(TableRow, {
                        children: [
                            h(TableHead, { children: "Codigo filial" }),
                            h(TableHead, { children: "Data sistema" }),
                            h(TableHead, { children: "Pedido sistema" }),
                            h(TableHead, { children: "Nota sistema" }),
                            h(TableHead, { children: "Valor sistema" }),
                            h(TableHead, { children: "Cliente" }),
                            h(TableHead, { children: "Cobranca" }),
                            h(TableHead, { children: "NSU sistema" }),
                            h(TableHead, { children: "Motivo" }),
                            h(TableHead, { children: "Status" }),
                        ],
                    }),
                }),
                h(TableBody, {
                    children: props.items.map((row) => hs(TableRow, {
                        children: [
                            h(TableCell, { children: row.codfilial || "-" }),
                            h(TableCell, { children: row.data || "-" }),
                            h(TableCell, { children: row.numped || "-" }),
                            h(TableCell, { children: row.numnota || "-" }),
                            h(TableCell, { children: formatMoney(row.vltotal) }),
                            h(TableCell, { children: row.codcli || "-" }),
                            h(TableCell, { children: row.codcob || "-" }),
                            h(TableCell, { children: row.nsu || "-" }),
                            h(TableCell, { children: row.reason || "-" }),
                            h(TableCell, { children: statusLabel(row.status) }),
                        ],
                    }, row.id)),
                }),
            ],
        }),
    });
}
function HistoryList(props) {
    return hs("div", {
        className: "space-y-2",
        children: props.items.length === 0 ? [h("p", { className: "text-sm text-muted-foreground", children: "Sem validacoes anteriores." })] : props.items.map((row) => hs("div", {
            className: "flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2",
            children: [
                hs("div", {
                    className: "space-y-0.5",
                    children: [
                        h("p", { className: "text-sm font-medium text-foreground", children: row.file_name }),
                        h("p", { className: "text-xs text-muted-foreground", children: `${row.period_start || "-"} ate ${row.period_end || "-"}` }),
                    ],
                }),
                hs("div", {
                    className: "flex items-center gap-2",
                    children: [
                        h("span", { className: `inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusClass(row.status)}`, children: statusLabel(row.status) }),
                        h(Button, {
                            size: "sm",
                            variant: "outline",
                            onClick: () => props.onOpen(row.id),
                            children: "Abrir",
                        }),
                    ],
                }),
            ],
        }, row.id)),
    });
}
const ValidationPage = () => {
    var _a, _b;
    const { toast } = useToast();
    const [loadingUpload, setLoadingUpload] = React.useState(false);
    const [loadingItems, setLoadingItems] = React.useState(false);
    const [loadingUnmatched, setLoadingUnmatched] = React.useState(false);
    const [selectedFile, setSelectedFile] = React.useState(null);
    const [activeTab, setActiveTab] = React.useState("resultados");
    const [batchId, setBatchId] = React.useState("");
    const [summary, setSummary] = React.useState(null);
    const [preview, setPreview] = React.useState([]);
    const [itemsResponse, setItemsResponse] = React.useState(DEFAULT_ITEMS_RESPONSE);
    const [unmatchedResponse, setUnmatchedResponse] = React.useState(DEFAULT_UNMATCHED_RESPONSE);
    const [history, setHistory] = React.useState(DEFAULT_HISTORY);
    const [filters, setFilters] = React.useState(DEFAULT_FILTERS);
    const [tolerances, setTolerances] = React.useState(DEFAULT_TOLERANCES);
    const loadHistory = React.useCallback(async () => {
        try {
            const data = await apiGet(`${API_BASE}/history`);
            setHistory(data || DEFAULT_HISTORY);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Falha ao carregar historico.";
            toast({ title: "Historico", description: message, variant: "destructive" });
        }
    }, [toast]);
    const loadDetails = React.useCallback(async (id) => {
        const data = await apiGet(`${API_BASE}/${id}`);
        setSummary(data.summary || null);
        setPreview(data.preview || []);
    }, []);
    const loadItems = React.useCallback(async (id, nextFilters = filters, page = 1) => {
        setLoadingItems(true);
        try {
            const query = {
                ...nextFilters,
                page,
                pageSize: 25,
                somenteDivergencias: nextFilters.somenteDivergencias ? "true" : "",
            };
            const data = await apiGet(`${API_BASE}/${id}/items${buildQuery(query)}`);
            setItemsResponse(data || DEFAULT_ITEMS_RESPONSE);
        }
        finally {
            setLoadingItems(false);
        }
    }, [filters]);
    const loadUnmatched = React.useCallback(async (id, filial = "", page = 1) => {
        setLoadingUnmatched(true);
        try {
            const data = await apiGet(`${API_BASE}/${id}/winthor-unmatched${buildQuery({ filial, page, pageSize: 25 })}`);
            setUnmatchedResponse(data || DEFAULT_UNMATCHED_RESPONSE);
        }
        finally {
            setLoadingUnmatched(false);
        }
    }, []);
    const openBatch = React.useCallback(async (id) => {
        setBatchId(id);
        await loadDetails(id);
        await Promise.all([loadItems(id, filters, 1), loadUnmatched(id, "", 1)]);
    }, [filters, loadDetails, loadItems, loadUnmatched]);
    React.useEffect(() => {
        loadHistory();
    }, [loadHistory]);
    const processUpload = async () => {
        if (!selectedFile)
            return;
        setLoadingUpload(true);
        try {
            const formData = new FormData();
            formData.append("file", selectedFile);
            Object.entries(tolerances).forEach(([key, value]) => {
                formData.append(key, String(value));
            });
            const result = await apiMultipart(`${API_BASE}/upload`, formData, { timeoutMs: 300000, retry: 0 });
            const newBatchId = result.batchId;
            setBatchId(newBatchId);
            setPreview(result.preview || []);
            await loadDetails(newBatchId);
            await Promise.all([loadItems(newBatchId, filters, 1), loadUnmatched(newBatchId, "", 1)]);
            await loadHistory();
            toast({
                title: "Validacao concluida",
                description: "Planilha processada com sucesso.",
            });
        }
        catch (error) {
            const message = error instanceof Error
                ? error.message
                : "Nao foi possivel processar a planilha.";
            toast({
                title: "Erro ao processar",
                description: message,
                variant: "destructive",
            });
        }
        finally {
            setLoadingUpload(false);
        }
    };
    const handleFilterChange = (key, value) => {
        setFilters((current) => ({ ...current, [key]: value }));
    };
    const handleToleranceChange = (key, value) => {
        setTolerances((current) => ({ ...current, [key]: value }));
    };
    const applyFilters = async () => {
        if (!batchId)
            return;
        await loadItems(batchId, filters, 1);
    };
    const exportResults = async (scope, format) => {
        if (!batchId)
            return;
        try {
            const data = await apiGet(`${API_BASE}/${batchId}/export${buildQuery({ scope, format })}`);
            if (data.downloadUrl) {
                window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Falha na exportacao.";
            toast({ title: "Exportacao", description: message, variant: "destructive" });
        }
    };
    const reprocess = async () => {
        if (!batchId)
            return;
        try {
            await apiPost(`${API_BASE}/${batchId}/reprocess`, {});
            await Promise.all([loadDetails(batchId), loadItems(batchId, filters, 1), loadUnmatched(batchId, "", 1), loadHistory()]);
            toast({ title: "Reprocessado", description: "Validacao reprocessada com sucesso." });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Falha no reprocessamento.";
            toast({ title: "Erro", description: message, variant: "destructive" });
        }
    };
    const markManual = async (row) => {
        if (!batchId)
            return;
        try {
            await apiPost(`${API_BASE}/${batchId}/items/${row.id}/manual`, {
                reason: "Marcado manualmente pelo usuario.",
            });
            await Promise.all([loadDetails(batchId), loadItems(batchId, filters, (_a = itemsResponse.paginacao) === null || _a === void 0 ? void 0 : _a.page)]);
            toast({ title: "Item atualizado", description: "Item marcado para analise manual." });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : "Falha ao marcar item.";
            toast({ title: "Erro", description: message, variant: "destructive" });
        }
    };
    const viewRow = (row) => {
        const message = row.reason || "Sem motivo informado.";
        toast({
            title: `Linha ${row.row_number}`,
            description: message,
        });
    };
    const exportRow = (row) => {
        const headers = Object.keys(row);
        const csv = `${headers.join(";")}\n${headers.map((key) => {
            const value = row[key];
            if (value == null)
                return "";
            const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
            return raw.includes(";") || raw.includes("\"") ? `"${raw.replace(/"/g, "\"\"")}"` : raw;
        }).join(";")}`;
        const url = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
        window.open(url, "_blank", "noopener,noreferrer");
    };
    const summaryView = summary || {
        total_rows: 0,
        total_system_rows: 0,
        total_validated: 0,
        total_branch_not_found: 0,
        total_rede_not_found_winthor: 0,
        total_winthor_not_found_rede: 0,
        total_nsu_divergence: 0,
        total_value_divergence: 0,
        total_date_divergence: 0,
        total_filial_divergence: 0,
        total_manual_review: 0,
        total_match_provavel: 0,
        total_divergent_amount: 0,
        compliance_percent: 0,
    };
    return hs("div", {
        className: "space-y-6 animate-fade-in",
        children: [
            hs("div", {
                children: [
                    h("h1", {
                        className: "text-2xl font-bold text-foreground",
                        children: "Validacao Vendas Rede x WinThor",
                    }),
                    h("p", {
                        className: "mt-1 text-sm text-muted-foreground",
                        children: "Suba a planilha de vendas da Rede para validar com PCFILIAL, PCPEDC e PCPEDI no WinThor.",
                    }),
                ],
            }),
            hs("div", {
                className: "grid gap-4 lg:grid-cols-3",
                children: [
                    hs(Card, {
                        className: "border-border/70 lg:col-span-2",
                        children: [
                            h(CardHeader, { children: h(CardTitle, { className: "text-sm font-semibold", children: "Upload da planilha REDE" }) }),
                            hs(CardContent, {
                                className: "space-y-3",
                                children: [
                                    hs("label", {
                                        className: "flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border/70 bg-muted/20 p-3 text-sm text-foreground",
                                        children: [
                                            h("input", {
                                                type: "file",
                                                className: "hidden",
                                                accept: ".xlsx,.xls",
                                                onChange: (event) => {
                                                    var _a, _b;
                                                    setSelectedFile((((_b = (_a = event.target.files) === null || _a === void 0 ? void 0 : _a.item(0)) !== null && _b !== void 0 ? _b : null));
                                                },
                                            }),
                                            h("span", { children: selectedFile ? selectedFile.name : "Selecionar arquivo XLSX/XLS" }),
                                        ],
                                    }),
                                    hs("div", {
                                        className: "flex flex-wrap gap-2",
                                        children: [
                                            h(Button, {
                                                disabled: !selectedFile || loadingUpload,
                                                onClick: processUpload,
                                                children: loadingUpload ? "Processando..." : "Processar validacao",
                                            }),
                                            h(Button, {
                                                variant: "outline",
                                                disabled: !batchId,
                                                onClick: reprocess,
                                                children: "Reprocessar",
                                            }),
                                            h(Button, {
                                                variant: "outline",
                                                disabled: !batchId,
                                                onClick: () => exportResults("all", "xlsx"),
                                                children: "Exportar resultado",
                                            }),
                                            h(Button, {
                                                variant: "outline",
                                                disabled: !batchId,
                                                onClick: () => exportResults("divergencias", "xlsx"),
                                                children: "Exportar divergencias",
                                            }),
                                            h(Button, {
                                                variant: "outline",
                                                disabled: !batchId,
                                                onClick: () => exportResults("rede-nao-encontradas", "xlsx"),
                                                children: "Rede sem sistema",
                                            }),
                                            h(Button, {
                                                variant: "outline",
                                                disabled: !batchId,
                                                onClick: () => exportResults("sistema-nao-encontradas", "xlsx"),
                                                children: "Sistema sem Rede",
                                            }),
                                            h(Button, {
                                                variant: "outline",
                                                disabled: !batchId,
                                                onClick: () => exportResults("valor", "xlsx"),
                                                children: "Diverg. valor",
                                            }),
                                            h(Button, {
                                                variant: "outline",
                                                disabled: !batchId,
                                                onClick: () => exportResults("data", "xlsx"),
                                                children: "Diverg. data",
                                            }),
                                            h(Button, {
                                                variant: "outline",
                                                disabled: !batchId,
                                                onClick: () => exportResults("nsu", "xlsx"),
                                                children: "Diverg. NSU",
                                            }),
                                        ],
                                    }),
                                    hs("div", {
                                        className: "grid gap-2 md:grid-cols-5",
                                        children: [
                                            h("input", {
                                                className: "h-9 rounded-md border border-input bg-background px-2 text-sm",
                                                type: "number",
                                                step: "0.01",
                                                placeholder: "Tol. valor R$",
                                                value: tolerances.tolerancia_valor_reais,
                                                onChange: (event) => handleToleranceChange("tolerancia_valor_reais", event.target.value),
                                            }),
                                            h("input", {
                                                className: "h-9 rounded-md border border-input bg-background px-2 text-sm",
                                                type: "number",
                                                step: "0.01",
                                                placeholder: "Tol. valor %",
                                                value: tolerances.tolerancia_valor_percentual,
                                                onChange: (event) => handleToleranceChange("tolerancia_valor_percentual", event.target.value),
                                            }),
                                            h("input", {
                                                className: "h-9 rounded-md border border-input bg-background px-2 text-sm",
                                                type: "number",
                                                step: "1",
                                                placeholder: "Tol. dias",
                                                value: tolerances.tolerancia_dias,
                                                onChange: (event) => handleToleranceChange("tolerancia_dias", event.target.value),
                                            }),
                                            hs("label", {
                                                className: "flex items-center gap-2 rounded-md border border-input px-2 text-sm",
                                                children: [
                                                    h("input", {
                                                        type: "checkbox",
                                                        checked: Boolean(tolerances.considerar_valor_aproximado),
                                                        onChange: (event) => handleToleranceChange("considerar_valor_aproximado", event.target.checked),
                                                    }),
                                                    h("span", { children: "Valor aprox." }),
                                                ],
                                            }),
                                            hs("label", {
                                                className: "flex items-center gap-2 rounded-md border border-input px-2 text-sm",
                                                children: [
                                                    h("input", {
                                                        type: "checkbox",
                                                        checked: Boolean(tolerances.considerar_data_proxima),
                                                        onChange: (event) => handleToleranceChange("considerar_data_proxima", event.target.checked),
                                                    }),
                                                    h("span", { children: "Data proxima" }),
                                                ],
                                            }),
                                        ],
                                    }),
                                ],
                            }),
                        ],
                    }),
                    hs(Card, {
                        className: "border-border/70",
                        children: [
                            h(CardHeader, { children: h(CardTitle, { className: "text-sm font-semibold", children: "Regras da planilha" }) }),
                            hs(CardContent, {
                                className: "space-y-2 text-sm text-muted-foreground",
                                children: [
                                    h("p", { children: "- A coluna X deve conter o CNPJ da filial." }),
                                    h("p", { children: "- CNPJ comparado com PCFILIAL.CGC normalizado." }),
                                    h("p", { children: "- CODIGO da PCFILIAL e usado para validar PCPEDC/PCPEDI." }),
                                ],
                            }),
                        ],
                    }),
                ],
            }),
            hs("div", {
                className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-5",
                children: [
                    h(SummaryCard, { title: "Total vendas Rede", value: summaryView.total_rows }),
                    h(SummaryCard, { title: "Total vendas Sistema", value: summaryView.total_system_rows }),
                    h(SummaryCard, { title: "Vendas validadas", value: summaryView.total_validated }),
                    h(SummaryCard, { title: "Rede sem Sistema", value: summaryView.total_rede_not_found_winthor }),
                    h(SummaryCard, { title: "Sistema sem Rede", value: summaryView.total_winthor_not_found_rede }),
                    h(SummaryCard, { title: "NSU divergente", value: summaryView.total_nsu_divergence }),
                    h(SummaryCard, { title: "Valor divergente", value: summaryView.total_value_divergence }),
                    h(SummaryCard, { title: "Data divergente", value: summaryView.total_date_divergence }),
                    h(SummaryCard, { title: "Filiais nao encontradas", value: summaryView.total_branch_not_found }),
                    h(SummaryCard, { title: "Valor total divergente", value: formatMoney(summaryView.total_divergent_amount) }),
                    h(SummaryCard, { title: "Conformidade", value: formatPercent(summaryView.compliance_percent) }),
                ],
            }),
            hs(Card, {
                className: "border-border/70",
                children: [
                    h(CardHeader, { children: h(CardTitle, { className: "text-sm font-semibold", children: "Historico de validacoes" }) }),
                    h(CardContent, {
                        children: h(HistoryList, {
                            items: history.registros || [],
                            onOpen: openBatch,
                        }),
                    }),
                ],
            }),
            hs(Card, {
                className: "border-border/70",
                children: [
                    h(CardHeader, {
                        children: hs("div", {
                            className: "flex flex-wrap items-center justify-between gap-2",
                            children: [
                                h(CardTitle, { className: "text-sm font-semibold", children: "Resultados da validacao" }),
                                hs("div", {
                                    className: "inline-flex rounded-md border border-border/70 p-1",
                                    children: [
                                        h(Button, {
                                            size: "sm",
                                            variant: activeTab === "resultados" ? "default" : "ghost",
                                            onClick: () => setActiveTab("resultados"),
                                            children: "Resultado REDE x WinThor",
                                        }),
                                        h(Button, {
                                            size: "sm",
                                            variant: activeTab === "winthor" ? "default" : "ghost",
                                            onClick: () => setActiveTab("winthor"),
                                            children: "Vendas do Sistema nao encontradas na Rede",
                                        }),
                                    ],
                                }),
                            ],
                        }),
                    }),
                    hs(CardContent, {
                        className: "space-y-4",
                        children: [
                            hs("div", {
                                className: "grid gap-2 md:grid-cols-5",
                                children: [
                                    hs("select", {
                                        className: "h-9 rounded-md border border-input bg-background px-2 text-sm",
                                        value: filters.status,
                                        onChange: (event) => handleFilterChange("status", event.target.value),
                                        children: [
                                            h("option", { value: "", children: "Status (todos)" }),
                                            STATUS_OPTIONS.map((status) => h("option", { value: status, children: statusLabel(status) }, status)),
                                        ],
                                    }),
                                    h("input", {
                                        className: "h-9 rounded-md border border-input bg-background px-2 text-sm",
                                        placeholder: "Filial WinThor",
                                        value: filters.filial,
                                        onChange: (event) => handleFilterChange("filial", event.target.value),
                                    }),
                                    h("input", {
                                        className: "h-9 rounded-md border border-input bg-background px-2 text-sm",
                                        placeholder: "CNPJ",
                                        value: filters.cnpj,
                                        onChange: (event) => handleFilterChange("cnpj", event.target.value),
                                    }),
                                    h("input", {
                                        className: "h-9 rounded-md border border-input bg-background px-2 text-sm",
                                        type: "date",
                                        value: filters.periodoInicio,
                                        onChange: (event) => handleFilterChange("periodoInicio", event.target.value),
                                    }),
                                    h("input", {
                                        className: "h-9 rounded-md border border-input bg-background px-2 text-sm",
                                        type: "date",
                                        value: filters.periodoFim,
                                        onChange: (event) => handleFilterChange("periodoFim", event.target.value),
                                    }),
                                    h("input", {
                                        className: "h-9 rounded-md border border-input bg-background px-2 text-sm",
                                        type: "number",
                                        placeholder: "Valor min",
                                        value: filters.valorMin,
                                        onChange: (event) => handleFilterChange("valorMin", event.target.value),
                                    }),
                                    h("input", {
                                        className: "h-9 rounded-md border border-input bg-background px-2 text-sm",
                                        type: "number",
                                        placeholder: "Valor max",
                                        value: filters.valorMax,
                                        onChange: (event) => handleFilterChange("valorMax", event.target.value),
                                    }),
                                    h("input", {
                                        className: "h-9 rounded-md border border-input bg-background px-2 text-sm",
                                        type: "number",
                                        placeholder: "Score minimo",
                                        value: filters.scoreMin,
                                        onChange: (event) => handleFilterChange("scoreMin", event.target.value),
                                    }),
                                    hs("label", {
                                        className: "flex items-center gap-2 rounded-md border border-input px-2 text-sm",
                                        children: [
                                            h("input", {
                                                type: "checkbox",
                                                checked: Boolean(filters.somenteDivergencias),
                                                onChange: (event) => handleFilterChange("somenteDivergencias", event.target.checked),
                                            }),
                                            h("span", { children: "Somente divergencias" }),
                                        ],
                                    }),
                                    h(Button, {
                                        variant: "outline",
                                        onClick: applyFilters,
                                        disabled: !batchId || loadingItems,
                                        children: "Aplicar filtros",
                                    }),
                                ],
                            }),
                            activeTab === "resultados"
                                ? h(ValidationResultsTable, {
                                    items: itemsResponse.registros || [],
                                    onViewRow: viewRow,
                                    onMarkManual: markManual,
                                    onExportRow: exportRow,
                                })
                                : h(WinthorUnmatchedTable, {
                                    items: unmatchedResponse.registros || [],
                                }),
                            hs("div", {
                                className: "flex items-center justify-between text-xs text-muted-foreground",
                                children: [
                                    h("span", {
                                        children: activeTab === "resultados"
                                            ? `Total: ${(_b = itemsResponse.paginacao) === null || _b === void 0 ? void 0 : _b.totalItems}`
                                            : `Total: ${unmatchedResponse.paginacao.totalItems}`,
                                    }),
                                    hs("div", {
                                        className: "flex items-center gap-2",
                                        children: [
                                            h(Button, {
                                                size: "sm",
                                                variant: "outline",
                                                disabled: !batchId,
                                                onClick: async () => {
                                                    var _a;
                                                    if (!batchId)
                                                        return;
                                                    if (activeTab === "resultados") {
                                                        const currentPage = ((_a = itemsResponse.paginacao) === null || _a === void 0 ? void 0 : _a.page) || 1;
                                                        await loadItems(batchId, filters, Math.max(1, currentPage - 1));
                                                    }
                                                    else {
                                                        await loadUnmatched(batchId, filters.filial, Math.max(1, unmatchedResponse.paginacao.page - 1));
                                                    }
                                                },
                                                children: "Anterior",
                                            }),
                                            h(Button, {
                                                size: "sm",
                                                variant: "outline",
                                                disabled: !batchId,
                                                onClick: async () => {
                                                    var _a;
                                                    if (!batchId)
                                                        return;
                                                    if (activeTab === "resultados") {
                                                        const currentPage = ((_a = itemsResponse.paginacao) === null || _a === void 0 ? void 0 : _a.page) || 1;
                                                        await loadItems(batchId, filters, currentPage + 1);
                                                    }
                                                    else {
                                                        await loadUnmatched(batchId, filters.filial, unmatchedResponse.paginacao.page + 1);
                                                    }
                                                },
                                                children: "Proxima",
                                            }),
                                        ],
                                    }),
                                ],
                            }),
                        ],
                    }),
                ],
            }),
            preview.length > 0
                ? hs(Card, {
                    className: "border-border/70",
                    children: [
                        h(CardHeader, { children: h(CardTitle, { className: "text-sm font-semibold", children: "Preview da planilha" }) }),
                        h(CardContent, {
                            children: h("div", {
                                className: "overflow-x-auto",
                                children: hs(Table, {
                                    children: [
                                        h(TableHeader, {
                                            children: hs(TableRow, {
                                                children: [
                                                    h(TableHead, { children: "Linha" }),
                                                    h(TableHead, { children: "CNPJ" }),
                                                    h(TableHead, { children: "Data" }),
                                                    h(TableHead, { children: "Valor" }),
                                                    h(TableHead, { children: "NSU" }),
                                                    h(TableHead, { children: "Autorizacao" }),
                                                    h(TableHead, { children: "Documento" }),
                                                ],
                                            }),
                                        }),
                                        h(TableBody, {
                                            children: preview.map((row) => hs(TableRow, {
                                                children: [
                                                    h(TableCell, { children: row.rowNumber }),
                                                    h(TableCell, { children: row.branchCnpjRaw || "-" }),
                                                    h(TableCell, { children: row.redeSaleDate || "-" }),
                                                    h(TableCell, { children: formatMoney(row.redeAmount) }),
                                                    h(TableCell, { children: row.redeNsu || "-" }),
                                                    h(TableCell, { children: row.redeAuthorization || "-" }),
                                                    h(TableCell, { children: row.redeDocument || "-" }),
                                                ],
                                            }, `preview-${row.rowNumber}`)),
                                        }),
                                    ],
                                }),
                            }),
                        }),
                    ],
                })
                : null,
            loadingItems || loadingUnmatched
                ? h("p", {
                    className: "text-xs text-muted-foreground",
                    children: "Atualizando resultados...",
                })
                : null,
            batchId && summary
                ? h("p", {
                    className: "text-xs text-muted-foreground",
                    children: `Validacao atual: ${batchId} | Periodo ${summary.period_start || "-"} ate ${summary.period_end || "-"}`,
                })
                : null,
        ],
    });
};
export default ValidationPage;

