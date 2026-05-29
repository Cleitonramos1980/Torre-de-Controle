import { i as useToast, r as React, j as jsxRuntime, J as Card, K as CardHeader, M as CardTitle, N as CardContent, B as Button, a as apiGet, w as apiPost, a2 as apiMultipart } from "./index-Cw1PFMX8.js";
import { T as Table, a as TableHeader, b as TableRow, c as TableHead, d as TableBody, e as TableCell } from "./table-BASKWVp-.js";
const h = jsxRuntime.jsx;
const hs = jsxRuntime.jsxs;
const API_BASE = "/recebiveis-cartao/conciliado-cartao";
const REPROCESS_POLL_INTERVAL_MS = 1500;
const REPROCESS_POLL_TIMEOUT_MS = 300000;
const STATUS_OPTIONS = [
    "RECEBIMENTO_CONCILIADO",
    "RECEBIMENTO_REDE_NAO_ENCONTRADO_WINTHOR",
    "BAIXA_WINTHOR_NAO_ENCONTRADA_REDE",
    "VALOR_RECEBIDO_DIVERGENTE",
    "DATA_PAGAMENTO_DIVERGENTE",
    "TITULO_LOCALIZADO_PENDENTE_BAIXA",
    "FILIAL_NAO_ENCONTRADA",
    "MATCH_PROVAVEL",
    "ANALISE_MANUAL",
];
const INITIAL_FILTERS = {
    status: "",
    filial: "",
    cnpj: "",
    periodoInicio: "",
    periodoFim: "",
    dataPagamento: "",
    valorMin: "",
    valorMax: "",
    scoreMin: "",
    banco: "",
    tipoDivergencia: "",
    somenteDivergencias: false,
};
function buildQuery(query) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
        if (value == null)
            return;
        if (typeof value === "string" && value.trim().length === 0)
            return;
        if (value === false)
            return;
        params.set(key, String(value));
    });
    const serialized = params.toString();
    return serialized ? `?${serialized}` : "";
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}
async function startReprocess(batchId) {
    return apiPost(`${API_BASE}/${batchId}/reprocess`, {
        asyncMode: true,
    }, { timeoutMs: 15000, retry: 0 });
}
async function getReprocessJob(batchId, jobId) {
    return apiGet(`${API_BASE}/${batchId}/reprocess/jobs/${jobId}`);
}
async function getConciliadorTelemetry(batchId) {
    return apiGet(`${API_BASE}/${batchId}/telemetria`);
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
        return "0,00%";
    return `${parsed.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}
function formatDate(value) {
    if (!value)
        return "-";
    const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(parsed.getTime()))
        return String(value);
    return parsed.toLocaleDateString("pt-BR");
}
function statusLabel(status) {
    return String(status ?? "-").replaceAll("_", " ");
}
function statusClass(status) {
    if (status === "RECEBIMENTO_CONCILIADO")
        return "bg-emerald-100 text-emerald-700";
    if (status === "MATCH_PROVAVEL")
        return "bg-blue-100 text-blue-700";
    if (status === "ANALISE_MANUAL")
        return "bg-violet-100 text-violet-700";
    if (String(status ?? "").includes("DIVERGENTE"))
        return "bg-amber-100 text-amber-700";
    if (String(status ?? "").includes("NAO_ENCONTR"))
        return "bg-rose-100 text-rose-700";
    return "bg-slate-100 text-slate-700";
}
function Badge({ value }) {
    return h("span", {
        className: `inline-flex whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${statusClass(value)}`,
        children: statusLabel(value),
    });
}
function SummaryCard({ title, value }) {
    return hs("div", {
        className: "rounded-md border border-border/70 bg-card p-4",
        children: [
            h("p", { className: "text-xs uppercase tracking-wide text-muted-foreground", children: title }),
            h("p", { className: "mt-2 text-2xl font-semibold text-foreground", children: value }),
        ],
    });
}
const COMPACT_TABLE = "min-w-max whitespace-nowrap text-sm";
const COMPACT_HEAD = "h-8 px-3 py-1.5 align-middle text-xs leading-4";
const COMPACT_CELL = "px-3 py-1.5 align-middle text-sm leading-5 whitespace-nowrap";
const COMPACT_CELL_RIGHT = `${COMPACT_CELL} text-right`;
const COMPACT_ROW = "h-9";
const COMPACT_REASON = `${COMPACT_CELL} w-[360px] max-w-[360px] overflow-hidden text-ellipsis`;
const COMPACT_ACTIONS = `${COMPACT_CELL} min-w-[210px]`;
const COMBO_HEAD = "px-3 py-2 align-top text-xs leading-4";
const FILTER_BAR_WRAPPER = "rounded-md border-[3px] border-primary/80 bg-primary/5 p-2";
const FILTER_BAR_GRID = "grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_48px]";
const FILTER_BAR_CONTROL = "h-12 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground";
const FILTER_BAR_ACTION = "inline-flex h-12 w-12 items-center justify-center rounded-md border border-input bg-background text-muted-foreground hover:text-foreground";
const HEADER_FILTER_CELL = `${COMPACT_HEAD} pt-0`;
const HEADER_FILTER_CONTROL = "rounded-md border border-input bg-background px-2 text-xs text-foreground";
const HEADER_FILTER_STYLE = { height: "28px", minWidth: "104px", width: "100%" };
const HEADER_FILTER_SMALL_STYLE = { height: "28px", minWidth: "76px", width: "100%" };
const ITEM_FILTER_COLUMNS = [
    { key: "colLinha", label: "Linha", small: true },
    { key: "colCnpjRede", label: "CNPJ/estab. Rede" },
    { key: "colFilialWinthor", label: "Filial WinThor", small: true },
    { key: "colFilialRede", label: "Filial Rede", small: true },
    { key: "colDataRede", label: "Data Rede" },
    { key: "colDataWinthor", label: "Data WinThor" },
    { key: "colStatusData", label: "Status data" },
    { key: "colValorRede", label: "Valor Rede", small: true, align: "right" },
    { key: "colValorWinthor", label: "Valor WinThor", small: true, align: "right" },
    { key: "colDiferenca", label: "Dif.", small: true, align: "right" },
    { key: "colStatusValor", label: "Status valor" },
    { key: "colNsuRede", label: "NSU Rede" },
    { key: "colNsuSistema", label: "NSU Sistema" },
    { key: "colDocumentoRede", label: "Documento Rede" },
    { key: "colDuplicata", label: "Duplicata", small: true },
    { key: "colPrestacao", label: "Prest.", small: true },
    { key: "colPedido", label: "Pedido", small: true },
    { key: "colNota", label: "Nota", small: true },
    { key: "colBanco", label: "Banco", small: true },
    { key: "colStatusTitulo", label: "Status titulo" },
    { key: "colDtEmissao", label: "Emissao", small: true },
    { key: "colDtVenc", label: "Venc.", small: true },
    { key: "colValorAberto", label: "Aberto", small: true, align: "right" },
    { key: "colParcelasVenda", label: "Parcelas", small: true },
    { key: "colTotalVenda", label: "Total venda", small: true, align: "right" },
    { key: "colTotalAberto", label: "Total aberto", small: true, align: "right" },
    { key: "colStatusBanco", label: "Status banco" },
    { key: "colScore", label: "Score", small: true, align: "right" },
    { key: "colStatusGeral", label: "Status geral" },
    { key: "colMotivo", label: "Motivo" },
];
function normalizeFilterText(value) {
    return String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function serializeColumnFilters(columnFilters) {
    const entries = Object.entries(columnFilters ?? {}).filter(([, values]) => Array.isArray(values) || values?.mode);
    return entries.length === 0 ? "" : JSON.stringify(Object.fromEntries(entries));
}
function resolveSelectedValues(selection) {
    if (!selection)
        return [];
    if (Array.isArray(selection))
        return selection.map((value) => String(value));
    if (Array.isArray(selection.values))
        return selection.values.map((value) => String(value));
    return [];
}
function HeaderFilterBlank({ small = false } = {}) {
    return h("div", { style: small ? HEADER_FILTER_SMALL_STYLE : HEADER_FILTER_STYLE });
}
function HeaderFilterInput({ value, onChange, type = "text", placeholder = "", small = false }) {
    return h("input", {
        className: HEADER_FILTER_CONTROL,
        style: small ? HEADER_FILTER_SMALL_STYLE : HEADER_FILTER_STYLE,
        value: value ?? "",
        type,
        placeholder,
        onClick: (event) => event.stopPropagation(),
        onChange: (event) => onChange(event.target.value),
    });
}
function HeaderFilterSelect({ value, onChange, children, small = false }) {
    return h("select", {
        className: HEADER_FILTER_CONTROL,
        style: small ? HEADER_FILTER_SMALL_STYLE : HEADER_FILTER_STYLE,
        value: value ?? "",
        onClick: (event) => event.stopPropagation(),
        onChange: (event) => onChange(event.target.value),
        children,
    });
}
function ExcelColumnFilter({ column, options = [], selectedValues, onApply, showLabel = true, toolbar = false }) {
    const [open, setOpen] = React.useState(false);
    const [search, setSearch] = React.useState("");
    const rootRef = React.useRef(null);
    const selectedList = resolveSelectedValues(selectedValues);
    const selectedSet = React.useMemo(() => new Set(selectedList), [selectedList]);
    const hasFilter = selectedValues != null;
    const emptyText = toolbar ? column.label : "Todos";
    const displayValue = (() => {
        if (!hasFilter)
            return emptyText;
        if (selectedList.length === 0)
            return "0 selecionados";
        if (selectedList.length === 1) {
            const option = options.find((item) => String(item.value) === selectedList[0]);
            return option?.label ?? selectedList[0];
        }
        return `${selectedList.length} selecionados`;
    })();
    const visibleOptions = React.useMemo(() => {
        const needle = normalizeFilterText(search);
        const filtered = needle
            ? options.filter((option) => normalizeFilterText(option.label ?? option.value).includes(needle))
            : options;
        return filtered.slice(0, 250);
    }, [options, search]);
    const openDropdown = () => {
        setOpen(true);
    };
    React.useEffect(() => {
        if (!open)
            return;
        const onDocumentClick = (event) => {
            const target = event.target;
            if (!rootRef.current || !target)
                return;
            if (!rootRef.current.contains(target)) {
                setOpen(false);
                setSearch("");
            }
        };
        document.addEventListener("mousedown", onDocumentClick);
        return () => document.removeEventListener("mousedown", onDocumentClick);
    }, [open]);
    const clear = () => {
        onApply(null);
        setOpen(false);
        setSearch("");
    };
    const toggleValue = (value) => {
        const next = new Set(hasFilter ? selectedList : []);
        const normalizedValue = String(value);
        if (next.has(normalizedValue))
            next.delete(normalizedValue);
        else
            next.add(normalizedValue);
        onApply(Array.from(next));
    };
    return hs("div", {
        ref: rootRef,
        className: `relative text-left ${showLabel ? "space-y-1" : ""}`,
        children: [
            showLabel ? h("div", { className: "whitespace-nowrap font-medium text-muted-foreground", children: column.label }) : null,
            hs("div", {
                className: `flex ${toolbar ? "h-12" : "h-8"} ${column.small ? toolbar ? "w-40 min-w-40" : "w-28 min-w-28" : toolbar ? "w-56 min-w-56" : "w-44 min-w-44"} overflow-hidden rounded-md border ${hasFilter ? "border-primary bg-primary/5" : "border-input bg-background"}`,
                onClick: (event) => {
                    event.stopPropagation();
                    openDropdown();
                },
                children: [
                    h("input", {
                        className: `min-w-0 flex-1 bg-transparent ${toolbar ? "px-3 text-sm" : "px-2 text-xs"} outline-none placeholder:text-muted-foreground`,
                        value: open ? search : displayValue,
                        placeholder: emptyText,
                        onFocus: () => openDropdown(),
                        onChange: (event) => {
                            if (!open)
                                openDropdown();
                            setSearch(event.target.value);
                        },
                        onKeyDown: (event) => {
                            if (event.key === "Enter" && visibleOptions[0]) {
                                toggleValue(visibleOptions[0].value);
                                setSearch("");
                            }
                            if (event.key === "Escape") {
                                setOpen(false);
                                setSearch("");
                            }
                        },
                    }),
                    hasFilter && !toolbar
                        ? h("button", {
                            type: "button",
                            className: "w-6 text-xs text-muted-foreground hover:text-foreground",
                            onClick: (event) => {
                                event.stopPropagation();
                                clear();
                            },
                            children: "x",
                        })
                        : null,
                    h("button", {
                        type: "button",
                        className: `${toolbar ? "w-10" : "w-7"} border-l border-border bg-muted/60 text-xs text-muted-foreground`,
                        onClick: (event) => {
                            event.stopPropagation();
                            if (open) {
                                setOpen(false);
                                setSearch("");
                            }
                            else {
                                openDropdown();
                            }
                        },
                        children: "▾",
                    }),
                ],
            }),
            open
                ? hs("div", {
                    className: "absolute left-0 top-full z-40 mt-1 w-72 overflow-hidden rounded-md border border-border bg-background text-left text-xs shadow-lg",
                    onClick: (event) => event.stopPropagation(),
                    children: hs("div", {
                        className: "max-h-64 overflow-auto py-1",
                        children: [
                            h("button", {
                                type: "button",
                                className: `flex w-full items-center justify-between gap-3 px-2 py-1.5 text-left hover:bg-muted ${!hasFilter ? "bg-primary text-primary-foreground hover:bg-primary" : "text-foreground"}`,
                                onClick: clear,
                                children: [
                                    h("span", { className: "truncate", children: "Todos" }),
                                    h("span", { className: "shrink-0 opacity-70", children: options.reduce((sum, option) => sum + Number(option.count ?? 0), 0) }),
                                ],
                            }, "__todos"),
                            visibleOptions.map((option) => h("button", {
                                type: "button",
                                className: `flex w-full items-center justify-between gap-3 px-2 py-1.5 text-left hover:bg-muted ${selectedSet.has(String(option.value)) ? "bg-primary/10 text-primary" : "text-foreground"}`,
                                onClick: () => {
                                    toggleValue(option.value);
                                },
                                children: [
                                    h("input", { type: "checkbox", checked: selectedSet.has(String(option.value)), readOnly: true, className: "pointer-events-none h-3 w-3 shrink-0" }),
                                    h("span", { className: "truncate", title: String(option.label ?? option.value), children: String(option.label ?? option.value) }),
                                    h("span", { className: "shrink-0 opacity-70", children: option.count ?? "" }),
                                ],
                            }, String(option.value))),
                            options.length > visibleOptions.length
                                ? h("div", { className: "px-2 py-1 text-muted-foreground", children: "Digite para localizar mais valores." })
                                : null,
                            options.length === 0
                                ? h("div", { className: "px-2 py-4 text-center text-muted-foreground", children: "Sem valores." })
                                : null,
                        ],
                    }),
                })
                : null,
        ],
    });
}
function FilterInput(props) {
    return hs("label", {
        className: "space-y-1 text-sm",
        children: [
            h("span", { className: "text-xs font-medium text-muted-foreground", children: props.label }),
            h("input", {
                className: "h-10 w-full rounded-md border border-input bg-background px-3 text-sm",
                value: props.value ?? "",
                type: props.type ?? "text",
                onChange: (event) => props.onChange(event.target.value),
                placeholder: props.placeholder ?? "",
            }),
        ],
    });
}
function downloadDataUrl(payload) {
    if (!payload?.downloadUrl)
        return;
    const anchor = document.createElement("a");
    anchor.href = payload.downloadUrl;
    anchor.download = payload.fileName || "conciliado-cartao.xlsx";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
}
function exportRow(row) {
    const blob = new Blob([JSON.stringify(row, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `conciliado-cartao-linha-${row.row_number ?? row.id}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}
function ItemsTable({ items, filterOptions, columnFilters, setColumnFilter, onDetail, onManual }) {
    return h("div", {
        className: "overflow-x-auto",
        children: hs(Table, {
            className: COMPACT_TABLE,
            children: [
                h(TableHeader, {
                    children: h(TableRow, {
                        children: ITEM_FILTER_COLUMNS.map((column) => h(TableHead, {
                            className: `${COMBO_HEAD} ${column.align === "right" ? "text-right" : ""}`,
                            children: h(ExcelColumnFilter, {
                                column,
                                options: filterOptions?.[column.key] ?? [],
                                selectedValues: columnFilters?.[column.key],
                                onApply: (values) => setColumnFilter(column.key, values),
                                showLabel: false,
                                toolbar: true,
                            }),
                        }, column.key)).concat([
                            h(TableHead, {
                                className: COMBO_HEAD,
                                children: h(Button, {
                                    variant: "ghost",
                                    size: "sm",
                                    onClick: () => {
                                        ITEM_FILTER_COLUMNS.forEach((column) => setColumnFilter(column.key, null));
                                    },
                                    children: "Limpar",
                                }),
                            }, "acoes"),
                        ]),
                    }),
                }),
                hs(TableBody, {
                    children: [
                        items.map((row) => hs(TableRow, {
                            onDoubleClick: () => onDetail(row),
                            className: `${COMPACT_ROW} cursor-pointer`,
                            children: [
                                h(TableCell, { className: COMPACT_CELL, children: row.row_number }),
                                h(TableCell, { className: COMPACT_CELL, children: row.branch_cnpj_raw || "-" }),
                                h(TableCell, { className: COMPACT_CELL, children: row.winthor_codfilial || "-" }),
                                h(TableCell, { className: COMPACT_CELL, children: row.filial_rede_codigo || row.filial_codigo || row.pcfilial_codigo || "-" }),
                                h(TableCell, { className: COMPACT_CELL, children: formatDate(row.rede_payment_date) }),
                                h(TableCell, { className: COMPACT_CELL, children: formatDate(row.winthor_dt_pag) }),
                                h(TableCell, { className: COMPACT_CELL, children: row.date_status || "-" }),
                                h(TableCell, { className: COMPACT_CELL_RIGHT, children: formatMoney(row.rede_gross_amount ?? row.rede_received_amount) }),
                                h(TableCell, { className: COMPACT_CELL_RIGHT, children: (row.winthor_valor_original ?? row.winthor_valor_pago) == null ? "-" : formatMoney(row.winthor_valor_original ?? row.winthor_valor_pago) }),
                                h(TableCell, { className: COMPACT_CELL_RIGHT, children: row.value_difference == null ? "-" : formatMoney(row.value_difference) }),
                                h(TableCell, { className: COMPACT_CELL, children: row.value_status || "-" }),
                                h(TableCell, { className: COMPACT_CELL, children: row.rede_nsu || "-" }),
                                h(TableCell, { className: COMPACT_CELL, children: row.winthor_nsu || "-" }),
                                h(TableCell, { className: COMPACT_CELL, children: row.rede_document || "-" }),
                                h(TableCell, { className: COMPACT_CELL, children: row.winthor_duplic || "-" }),
                                h(TableCell, { className: COMPACT_CELL, children: row.winthor_prest || "-" }),
                                h(TableCell, { className: COMPACT_CELL, children: row.winthor_numped || "-" }),
                                h(TableCell, { className: COMPACT_CELL, children: row.winthor_numnota || "-" }),
                                h(TableCell, { className: COMPACT_CELL, children: row.winthor_codbanco || "-" }),
                                h(TableCell, { className: COMPACT_CELL, children: row.winthor_status_titulo || "-" }),
                                h(TableCell, { className: COMPACT_CELL, children: formatDate(row.winthor_dt_emissao) }),
                                h(TableCell, { className: COMPACT_CELL, children: formatDate(row.winthor_dt_venc) }),
                                h(TableCell, { className: COMPACT_CELL_RIGHT, children: row.winthor_valor_aberto == null ? "-" : formatMoney(row.winthor_valor_aberto) }),
                                h(TableCell, { className: COMPACT_CELL_RIGHT, children: row.winthor_parcelas_venda ?? "-" }),
                                h(TableCell, { className: COMPACT_CELL_RIGHT, children: row.winthor_total_venda == null ? "-" : formatMoney(row.winthor_total_venda) }),
                                h(TableCell, { className: COMPACT_CELL_RIGHT, children: row.winthor_total_aberto_venda == null ? "-" : formatMoney(row.winthor_total_aberto_venda) }),
                                h(TableCell, { className: COMPACT_CELL, children: row.bank_status || "-" }),
                                h(TableCell, { className: COMPACT_CELL_RIGHT, children: row.match_score ?? 0 }),
                                h(TableCell, { className: COMPACT_CELL, children: h(Badge, { value: row.validation_status }) }),
                                h(TableCell, { className: COMPACT_REASON, title: row.reason || "-", children: row.reason || "-" }),
                                hs(TableCell, {
                                    className: COMPACT_ACTIONS,
                                    children: [
                                        h(Button, { variant: "outline", size: "sm", onClick: () => onDetail(row), children: "Ver detalhe" }),
                                        h(Button, { variant: "outline", size: "sm", className: "ml-2", onClick: () => onManual(row), children: "Analise" }),
                                        h(Button, { variant: "outline", size: "sm", className: "ml-2", onClick: () => exportRow(row), children: "Exportar" }),
                                    ],
                                }),
                            ],
                        }, row.id)),
                        items.length === 0
                            ? h(TableRow, { children: h(TableCell, { colSpan: ITEM_FILTER_COLUMNS.length + 1, className: "py-10 text-center text-sm text-muted-foreground", children: "Nenhum recebimento encontrado para os filtros." }) })
                            : null,
                    ],
                }),
            ],
        }),
    });
}
function UnmatchedTable({ rows, onDetail }) {
    return h("div", {
        className: "overflow-x-auto",
        children: hs(Table, {
            className: COMPACT_TABLE,
            children: [
                h(TableHeader, {
                    children: hs(TableRow, {
                        children: [
                            h(TableHead, { className: COMPACT_HEAD, children: "Filial" }),
                            h(TableHead, { className: COMPACT_HEAD, children: "Cliente" }),
                            h(TableHead, { className: COMPACT_HEAD, children: "Documento cliente" }),
                            h(TableHead, { className: COMPACT_HEAD, children: "Duplicata" }),
                            h(TableHead, { className: COMPACT_HEAD, children: "Prestacao" }),
                            h(TableHead, { className: COMPACT_HEAD, children: "Pedido" }),
                            h(TableHead, { className: COMPACT_HEAD, children: "Nota" }),
                            h(TableHead, { className: COMPACT_HEAD, children: "Data pagamento" }),
                            h(TableHead, { className: `${COMPACT_HEAD} text-right`, children: "Valor pago" }),
                            h(TableHead, { className: COMPACT_HEAD, children: "Banco" }),
                            h(TableHead, { className: COMPACT_HEAD, children: "Cobranca" }),
                            h(TableHead, { className: COMPACT_HEAD, children: "Status" }),
                            h(TableHead, { className: COMPACT_HEAD, children: "Motivo" }),
                            h(TableHead, { className: COMPACT_HEAD, children: "Acoes" }),
                        ],
                    }),
                }),
                hs(TableBody, {
                    children: [
                        rows.map((row) => hs(TableRow, {
                            onDoubleClick: () => onDetail(row),
                            className: `${COMPACT_ROW} cursor-pointer`,
                            children: [
                                h(TableCell, { className: COMPACT_CELL, children: row.codfilial || "-" }),
                                h(TableCell, { className: COMPACT_CELL, children: row.cliente || "-" }),
                                h(TableCell, { className: COMPACT_CELL, children: row.documento_cliente || "-" }),
                                h(TableCell, { className: COMPACT_CELL, children: row.duplic || "-" }),
                                h(TableCell, { className: COMPACT_CELL, children: row.prest || "-" }),
                                h(TableCell, { className: COMPACT_CELL, children: row.numped || "-" }),
                                h(TableCell, { className: COMPACT_CELL, children: row.numnota || "-" }),
                                h(TableCell, { className: COMPACT_CELL, children: formatDate(row.dtpag) }),
                                h(TableCell, { className: COMPACT_CELL_RIGHT, children: formatMoney(row.valor_pago) }),
                                h(TableCell, { className: COMPACT_CELL, children: row.codbanco || "-" }),
                                h(TableCell, { className: COMPACT_CELL, children: row.cobranca || row.codcob || "-" }),
                                h(TableCell, { className: COMPACT_CELL, children: h(Badge, { value: row.status }) }),
                                h(TableCell, { className: COMPACT_REASON, title: row.reason || "-", children: row.reason || "-" }),
                                h(TableCell, { className: COMPACT_CELL, children: h(Button, { variant: "outline", size: "sm", onClick: () => onDetail(row), children: "Ver detalhe" }) }),
                            ],
                        }, row.id)),
                        rows.length === 0
                            ? h(TableRow, { children: h(TableCell, { colSpan: 14, className: "py-10 text-center text-sm text-muted-foreground", children: "Nenhuma baixa WinThor pendente para os filtros." }) })
                            : null,
                    ],
                }),
            ],
        }),
    });
}
function TitleAnalysis({ data, loading }) {
    if (loading)
        return h("div", { className: "rounded-md border border-border/70 p-4 text-sm text-muted-foreground", children: "Carregando titulos PCPREST..." });
    if (!data)
        return null;
    const rows = data.rows ?? [];
    return hs("div", {
        className: "mb-4 space-y-3",
        children: [
            hs("div", {
                className: "grid gap-2 md:grid-cols-4",
                children: [
                    h(SummaryCard, { title: "Titulos PCPREST", value: data.total_titulos ?? 0 }),
                    h(SummaryCard, { title: "Total parcelas", value: formatMoney(data.total_valor) }),
                    h(SummaryCard, { title: "Total pago", value: formatMoney(data.total_pago) }),
                    h(SummaryCard, { title: "Total aberto", value: formatMoney(data.total_aberto) }),
                ],
            }),
            h("div", {
                className: "overflow-x-auto rounded-md border border-border/70",
                children: hs(Table, {
                    className: COMPACT_TABLE,
                    children: [
                        h(TableHeader, {
                            children: hs(TableRow, {
                                children: [
                                    h(TableHead, { className: COMPACT_HEAD, children: "Filial" }),
                                    h(TableHead, { className: COMPACT_HEAD, children: "Duplicata" }),
                                    h(TableHead, { className: COMPACT_HEAD, children: "Prest." }),
                                    h(TableHead, { className: COMPACT_HEAD, children: "NSUTEF" }),
                                    h(TableHead, { className: COMPACT_HEAD, children: "Emissao" }),
                                    h(TableHead, { className: COMPACT_HEAD, children: "Venc." }),
                                    h(TableHead, { className: COMPACT_HEAD, children: "Pagamento" }),
                                    h(TableHead, { className: `${COMPACT_HEAD} text-right`, children: "Valor" }),
                                    h(TableHead, { className: `${COMPACT_HEAD} text-right`, children: "Pago" }),
                                    h(TableHead, { className: `${COMPACT_HEAD} text-right`, children: "Aberto" }),
                                    h(TableHead, { className: COMPACT_HEAD, children: "Cobranca" }),
                                    h(TableHead, { className: COMPACT_HEAD, children: "Status" }),
                                ],
                            }),
                        }),
                        hs(TableBody, {
                            children: [
                                rows.map((title, index) => hs(TableRow, {
                                    className: COMPACT_ROW,
                                    children: [
                                        h(TableCell, { className: COMPACT_CELL, children: title.codfilial || "-" }),
                                        h(TableCell, { className: COMPACT_CELL, children: title.duplic || "-" }),
                                        h(TableCell, { className: COMPACT_CELL, children: title.prest || "-" }),
                                        h(TableCell, { className: COMPACT_CELL, children: title.nsutef || "-" }),
                                        h(TableCell, { className: COMPACT_CELL, children: formatDate(title.dtemissao) }),
                                        h(TableCell, { className: COMPACT_CELL, children: formatDate(title.dtvenc) }),
                                        h(TableCell, { className: COMPACT_CELL, children: formatDate(title.dtpag) }),
                                        h(TableCell, { className: COMPACT_CELL_RIGHT, children: formatMoney(title.valor_original) }),
                                        h(TableCell, { className: COMPACT_CELL_RIGHT, children: formatMoney(title.valor_pago) }),
                                        h(TableCell, { className: COMPACT_CELL_RIGHT, children: formatMoney(title.valor_aberto) }),
                                        h(TableCell, { className: COMPACT_CELL, children: title.codcob || title.cobranca || "-" }),
                                        h(TableCell, { className: COMPACT_CELL, children: title.status_titulo || "-" }),
                                    ],
                                }, `${title.duplic ?? "titulo"}-${title.prest ?? index}`)),
                                rows.length === 0
                                    ? h(TableRow, { children: h(TableCell, { colSpan: 12, className: "py-6 text-center text-sm text-muted-foreground", children: "Nenhum titulo PCPREST localizado por NSUTEF para esta linha." }) })
                                    : null,
                            ],
                        }),
                    ],
                }),
            }),
        ],
    });
}
function DetailModal({ row, titles, loadingTitles, onClose }) {
    if (!row)
        return null;
    return h("div", {
        className: "fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6",
        onClick: onClose,
        children: hs("div", {
            className: "max-h-[85vh] w-full max-w-5xl overflow-auto rounded-md bg-background p-5 shadow-lg",
            onClick: (event) => event.stopPropagation(),
            children: [
                hs("div", {
                    className: "mb-4 flex items-center justify-between",
                    children: [
                        h("h2", { className: "text-lg font-semibold", children: "Origem dos dados" }),
                        h(Button, { variant: "outline", size: "sm", onClick: onClose, children: "Fechar" }),
                    ],
                }),
                h(TitleAnalysis, { data: titles, loading: loadingTitles }),
                h("pre", { className: "rounded-md bg-muted p-4 text-xs", children: JSON.stringify(row, null, 2) }),
            ],
        }),
    });
}
function ConciliadoCartaoPage() {
    const { toast } = useToast();
    const [selectedFile, setSelectedFile] = React.useState(null);
    const [loadingUpload, setLoadingUpload] = React.useState(false);
    const [loadingReprocess, setLoadingReprocess] = React.useState(false);
    const [reprocessJob, setReprocessJob] = React.useState(null);
    const [telemetry, setTelemetry] = React.useState(null);
    const [history, setHistory] = React.useState([]);
    const [batchId, setBatchId] = React.useState(null);
    const [summary, setSummary] = React.useState(null);
    const [items, setItems] = React.useState([]);
    const [unmatched, setUnmatched] = React.useState([]);
    const [itemsPage, setItemsPage] = React.useState(1);
    const [unmatchedPage, setUnmatchedPage] = React.useState(1);
    const [itemsPagination, setItemsPagination] = React.useState(null);
    const [unmatchedPagination, setUnmatchedPagination] = React.useState(null);
    const [activeTab, setActiveTab] = React.useState("rede");
    const [detailRow, setDetailRow] = React.useState(null);
    const [detailTitles, setDetailTitles] = React.useState(null);
    const [loadingDetailTitles, setLoadingDetailTitles] = React.useState(false);
    const [itemFilterOptions, setItemFilterOptions] = React.useState({});
    const [columnFilters, setColumnFilters] = React.useState({});
    const [filters, setFilters] = React.useState(INITIAL_FILTERS);
    const loadHistory = React.useCallback(async () => {
        const data = await apiGet(`${API_BASE}/history`);
        setHistory(data.registros ?? []);
        if (!batchId && data.registros?.[0]?.id)
            setBatchId(data.registros[0].id);
    }, [batchId]);
    const loadBatch = React.useCallback(async (id) => {
        if (!id)
            return;
        const data = await apiGet(`${API_BASE}/${id}`);
        setSummary(data.summary ?? data.batch ?? null);
    }, []);
    const loadTelemetry = React.useCallback(async (id) => {
        if (!id)
            return;
        const data = await getConciliadorTelemetry(id);
        setTelemetry(data ?? null);
    }, []);
    const loadItemFilterOptions = React.useCallback(async (id) => {
        if (!id)
            return;
        const data = await apiGet(`${API_BASE}/${id}/items/filter-options`);
        setItemFilterOptions(data.columns ?? {});
    }, []);
    const loadItems = React.useCallback(async (id, page = 1) => {
        if (!id)
            return;
        const data = await apiGet(`${API_BASE}/${id}/items${buildQuery({ ...filters, columnFilters: serializeColumnFilters(columnFilters), page, pageSize: 25 })}`);
        setItems(data.registros ?? []);
        setItemsPagination(data.paginacao ?? null);
    }, [filters, columnFilters]);
    const loadUnmatched = React.useCallback(async (id, page = 1) => {
        if (!id)
            return;
        const data = await apiGet(`${API_BASE}/${id}/unmatched-winthor${buildQuery({ filial: filters.filial, page, pageSize: 25 })}`);
        setUnmatched(data.registros ?? []);
        setUnmatchedPagination(data.paginacao ?? null);
    }, [filters.filial]);
    React.useEffect(() => {
        loadHistory().catch((error) => toast({ title: "Historico", description: error.message, variant: "destructive" }));
    }, []);
    React.useEffect(() => {
        if (!batchId)
            return;
        loadBatch(batchId).catch((error) => toast({ title: "Conciliador Cartao", description: error.message, variant: "destructive" }));
        loadItemFilterOptions(batchId).catch((error) => toast({ title: "Filtros", description: error.message, variant: "destructive" }));
        loadTelemetry(batchId).catch(() => { });
    }, [batchId, loadBatch, loadItemFilterOptions, loadTelemetry]);
    React.useEffect(() => {
        if (!batchId)
            return;
        loadItems(batchId, itemsPage).catch((error) => toast({ title: "Recebimentos", description: error.message, variant: "destructive" }));
    }, [batchId, itemsPage, loadItems]);
    React.useEffect(() => {
        if (!batchId)
            return;
        loadUnmatched(batchId, unmatchedPage).catch((error) => toast({ title: "Baixas WinThor", description: error.message, variant: "destructive" }));
    }, [batchId, unmatchedPage, loadUnmatched]);
    const processUpload = async () => {
        if (!selectedFile)
            return;
        setLoadingUpload(true);
        try {
            const formData = new FormData();
            formData.append("file", selectedFile);
            const result = await apiMultipart(`${API_BASE}/upload`, formData, { timeoutMs: 300000, retry: 0 });
            setBatchId(result.batchId);
            setSummary(result.resumo ?? null);
            setItemsPage(1);
            setUnmatchedPage(1);
            await loadHistory();
            toast({ title: "Conciliador Cartao", description: "Arquivo processado contra PCPREST." });
        }
        catch (error) {
            toast({ title: "Erro no upload", description: error instanceof Error ? error.message : "Falha no processamento.", variant: "destructive" });
        }
        finally {
            setLoadingUpload(false);
        }
    };
    const reprocess = async () => {
        if (!batchId || loadingReprocess)
            return;
        setLoadingReprocess(true);
        try {
            const started = await startReprocess(batchId);
            const jobId = started?.job?.id;
            if (!jobId) {
                throw new Error("Nao foi possivel iniciar o job de reprocessamento.");
            }
            let done = false;
            const startedAt = Date.now();
            setReprocessJob(started.job);
            while (!done) {
                if (Date.now() - startedAt > REPROCESS_POLL_TIMEOUT_MS) {
                    throw new Error("Tempo limite aguardando fim do reprocessamento.");
                }
                await sleep(REPROCESS_POLL_INTERVAL_MS);
                const snapshot = await getReprocessJob(batchId, jobId);
                setReprocessJob(snapshot);
                const status = String(snapshot?.status ?? "").toUpperCase();
                if (status === "SUCCESS") {
                    done = true;
                    break;
                }
                if (status === "ERROR") {
                    throw new Error(snapshot?.error || "Falha durante o reprocessamento.");
                }
            }
            await loadBatch(batchId);
            await loadItemFilterOptions(batchId);
            await loadItems(batchId, itemsPage);
            await loadUnmatched(batchId, unmatchedPage);
            await loadTelemetry(batchId);
            toast({ title: "Reprocessado", description: "Conciliador Cartao reprocessado com sucesso." });
        }
        catch (error) {
            toast({
                title: "Erro ao reprocessar",
                description: error instanceof Error ? error.message : "Falha no reprocessamento.",
                variant: "destructive",
            });
        }
        finally {
            setLoadingReprocess(false);
        }
    };
    const markManual = async (row) => {
        if (!batchId || !row?.id)
            return;
        await apiPost(`${API_BASE}/${batchId}/items/${row.id}/manual`, { reason: "Marcado manualmente pelo usuario." });
        await loadItems(batchId, itemsPage);
        toast({ title: "Analise manual", description: "Linha marcada para analise manual." });
    };
    const exportResults = async (scope, format = "xlsx") => {
        if (!batchId)
            return;
        const payload = await apiGet(`${API_BASE}/${batchId}/export${buildQuery({ scope, format })}`);
        downloadDataUrl(payload);
    };
    const openDetail = async (row) => {
        setDetailRow(row);
        setDetailTitles(null);
        if (!batchId || !row?.id || !row?.rede_nsu)
            return;
        setLoadingDetailTitles(true);
        try {
            const data = await apiGet(`${API_BASE}/${batchId}/items/${row.id}/titles`);
            setDetailTitles(data);
        }
        catch (error) {
            toast({ title: "Titulos PCPREST", description: error instanceof Error ? error.message : "Falha ao carregar titulos.", variant: "destructive" });
        }
        finally {
            setLoadingDetailTitles(false);
        }
    };
    const setFilter = (key, value) => {
        setFilters((current) => ({ ...current, [key]: value }));
        setItemsPage(1);
        setUnmatchedPage(1);
    };
    const setColumnFilter = (key, values) => {
        setColumnFilters((current) => {
            const next = { ...current };
            if (values == null)
                delete next[key];
            else
                next[key] = values;
            return next;
        });
        setItemsPage(1);
    };
    const applyGlobalFilters = () => {
        if (!batchId)
            return;
        setItemsPage(1);
        setUnmatchedPage(1);
        loadItems(batchId, 1).catch((error) => toast({ title: "Recebimentos", description: error.message, variant: "destructive" }));
        loadUnmatched(batchId, 1).catch((error) => toast({ title: "Baixas WinThor", description: error.message, variant: "destructive" }));
    };
    const clearGlobalFilters = () => {
        setFilters({ ...INITIAL_FILTERS });
        setItemsPage(1);
        setUnmatchedPage(1);
    };
    const s = summary ?? {};
    return hs("div", {
        className: "space-y-6 animate-fade-in",
        children: [
            hs("div", {
                children: [
                    h("h1", { className: "text-2xl font-bold text-foreground", children: "Conciliador Cartao" }),
                    h("p", { className: "mt-1 text-sm text-muted-foreground", children: "Suba a planilha de recebimentos da Rede para validar os valores recebidos contra os titulos financeiros do WinThor na PCPREST." }),
                ],
            }),
            hs("div", {
                className: "grid gap-4 lg:grid-cols-2",
                children: [
                    hs(Card, {
                        className: "border-border/70",
                        children: [
                            h(CardHeader, { children: h(CardTitle, { className: "text-sm font-semibold", children: "Upload de recebimentos Rede" }) }),
                            hs(CardContent, {
                                className: "space-y-3",
                                children: [
                                    h("label", {
                                        htmlFor: "conciliado-cartao-file",
                                        className: "block cursor-pointer rounded-md border border-dashed border-border/80 p-4 text-sm text-foreground",
                                        children: selectedFile ? selectedFile.name : "Selecionar arquivo .xlsx ou .xls",
                                    }),
                                    h("input", {
                                        id: "conciliado-cartao-file",
                                        type: "file",
                                        className: "hidden",
                                        accept: ".xlsx,.xls",
                                        onChange: (event) => setSelectedFile(event.target.files?.[0] ?? null),
                                    }),
                                    hs("div", {
                                        className: "flex flex-wrap gap-2",
                                        children: [
                                            h(Button, { onClick: processUpload, disabled: !selectedFile || loadingUpload, children: loadingUpload ? "Processando..." : "Processar" }),
                                            h(Button, { variant: "outline", onClick: reprocess, disabled: !batchId || loadingReprocess, children: loadingReprocess ? "Reprocessando..." : "Reprocessar" }),
                                            h(Button, { variant: "outline", onClick: () => exportResults("all"), disabled: !batchId, children: "Exportar resultado" }),
                                            h(Button, { variant: "outline", onClick: () => exportResults("divergencias"), disabled: !batchId, children: "Exportar divergencias" }),
                                        ],
                                    }),
                                ],
                            }),
                        ],
                    }),
                    hs(Card, {
                        className: "border-border/70",
                        children: [
                            h(CardHeader, { children: h(CardTitle, { className: "text-sm font-semibold", children: "Regra financeira" }) }),
                            hs(CardContent, {
                                className: "space-y-2 text-sm text-muted-foreground",
                                children: [
                                    h("p", { children: "Esta tela valida recebimentos da Rede contra PCPREST." }),
                                    h("p", { children: "A validacao da PCPREST e independente do CODBANCO; o banco fica apenas como informacao para auditoria." }),
                                    h("p", { children: "O primeiro filtro e NSU/CV da Rede contra PCPREST.NSUTEF; titulos em aberto aparecem para analise de baixa." }),
                                ],
                            }),
                        ],
                    }),
                ],
            }),
            hs("div", {
                className: "grid gap-3 md:grid-cols-2 xl:grid-cols-4",
                children: [
                    h(SummaryCard, { title: "Reprocessamento", value: reprocessJob?.status ?? telemetry?.reprocessamento?.status ?? "SEM JOB" }),
                    h(SummaryCard, { title: "Execucao sucesso", value: telemetry?.baixaAutomatica?.total_executados_sucesso ?? 0 }),
                    h(SummaryCard, { title: "Execucao erro", value: telemetry?.baixaAutomatica?.total_execucao_erro ?? 0 }),
                    h(SummaryCard, { title: "Ultimo evento", value: telemetry?.eventosRecentes?.[0]?.event_type ?? "-" }),
                ],
            }),
            hs("div", {
                className: "grid gap-3 md:grid-cols-2 xl:grid-cols-5",
                children: [
                    h(SummaryCard, { title: "Total recebido na Rede", value: formatMoney(s.total_rede_amount) }),
                    h(SummaryCard, { title: "Total WinThor PCPREST", value: formatMoney(s.total_winthor_paid_amount) }),
                    h(SummaryCard, { title: "Recebimentos conciliados", value: s.total_conciliated ?? 0 }),
                    h(SummaryCard, { title: "Rede sem WinThor", value: s.total_rede_not_found_winthor ?? 0 }),
                    h(SummaryCard, { title: "WinThor sem Rede", value: s.total_winthor_not_found_rede ?? 0 }),
                    h(SummaryCard, { title: "Divergencias valor", value: s.total_value_divergence ?? 0 }),
                    h(SummaryCard, { title: "Divergencias data", value: s.total_date_divergence ?? 0 }),
                    h(SummaryCard, { title: "Titulos para baixa", value: s.total_title_pending_settlement ?? 0 }),
                    h(SummaryCard, { title: "Filiais nao encontradas", value: s.total_branch_not_found ?? 0 }),
                    h(SummaryCard, { title: "Valor divergente", value: formatMoney(s.total_difference_amount) }),
                    h(SummaryCard, { title: "Conformidade financeira", value: formatPercent(s.conformity_percentage) }),
                ],
            }),
            hs("div", {
                className: "flex flex-wrap gap-2",
                children: [
                    h(Button, { variant: activeTab === "rede" ? "default" : "outline", onClick: () => setActiveTab("rede"), children: "Recebimentos Rede x WinThor" }),
                    h(Button, { variant: activeTab === "winthor" ? "default" : "outline", onClick: () => setActiveTab("winthor"), children: "Baixas WinThor nao encontradas na Rede" }),
                    h(Button, { variant: "outline", onClick: () => exportResults("rede-nao-encontradas"), disabled: !batchId, children: "Exportar Rede sem WinThor" }),
                    h(Button, { variant: "outline", onClick: () => exportResults("winthor-nao-encontradas"), disabled: !batchId, children: "Exportar WinThor sem Rede" }),
                    h(Button, { variant: "outline", onClick: () => exportResults("valor"), disabled: !batchId, children: "Exportar valor" }),
                    h(Button, { variant: "outline", onClick: () => exportResults("data"), disabled: !batchId, children: "Exportar data" }),
                    h(Button, { variant: "outline", onClick: () => exportResults("filial"), disabled: !batchId, children: "Exportar filial" }),
                ],
            }),
            hs(Card, {
                className: "border-border/70",
                children: [
                    h(CardHeader, { children: h(CardTitle, { className: "text-sm font-semibold", children: activeTab === "rede" ? "Recebimentos Rede x WinThor" : "Baixas WinThor nao encontradas na Rede" }) }),
                    hs(CardContent, {
                        className: "space-y-3",
                        children: [
                            activeTab === "rede"
                                ? h(ItemsTable, { items, filterOptions: itemFilterOptions, columnFilters, setColumnFilter, onDetail: openDetail, onManual: markManual })
                                : h(UnmatchedTable, { rows: unmatched, onDetail: openDetail }),
                            activeTab === "rede" && itemsPagination
                                ? hs("div", { className: "flex items-center justify-between text-sm text-muted-foreground", children: [hs("span", { children: ["Pagina ", itemsPagination.page, " de ", itemsPagination.totalPages, " (", itemsPagination.totalItems, " registros)"] }), hs("div", { className: "flex gap-2", children: [h(Button, { variant: "outline", size: "sm", disabled: itemsPagination.page <= 1, onClick: () => setItemsPage((page) => Math.max(1, page - 1)), children: "Anterior" }), h(Button, { variant: "outline", size: "sm", disabled: itemsPagination.page >= itemsPagination.totalPages, onClick: () => setItemsPage((page) => page + 1), children: "Proxima" })] })] })
                                : null,
                            activeTab === "winthor" && unmatchedPagination
                                ? hs("div", { className: "flex items-center justify-between text-sm text-muted-foreground", children: [hs("span", { children: ["Pagina ", unmatchedPagination.page, " de ", unmatchedPagination.totalPages, " (", unmatchedPagination.totalItems, " registros)"] }), hs("div", { className: "flex gap-2", children: [h(Button, { variant: "outline", size: "sm", disabled: unmatchedPagination.page <= 1, onClick: () => setUnmatchedPage((page) => Math.max(1, page - 1)), children: "Anterior" }), h(Button, { variant: "outline", size: "sm", disabled: unmatchedPagination.page >= unmatchedPagination.totalPages, onClick: () => setUnmatchedPage((page) => page + 1), children: "Proxima" })] })] })
                                : null,
                        ],
                    }),
                ],
            }),
            hs(Card, {
                className: "border-border/70",
                children: [
                    h(CardHeader, { children: h(CardTitle, { className: "text-sm font-semibold", children: "Historico" }) }),
                    h(CardContent, {
                        className: "overflow-x-auto",
                        children: hs(Table, {
                            children: [
                                h(TableHeader, { children: hs(TableRow, { children: [h(TableHead, { children: "Arquivo" }), h(TableHead, { children: "Status" }), h(TableHead, { children: "Periodo" }), h(TableHead, { className: "text-right", children: "Rede" }), h(TableHead, { className: "text-right", children: "WinThor" }), h(TableHead, { className: "text-right", children: "Conciliados" }), h(TableHead, { children: "Criado em" }), h(TableHead, { children: "Acoes" })] }) }),
                                hs(TableBody, {
                                    children: [
                                        history.map((row) => hs(TableRow, { children: [h(TableCell, { children: row.file_name }), h(TableCell, { children: h(Badge, { value: row.status }) }), h(TableCell, { children: `${formatDate(row.period_start)} a ${formatDate(row.period_end)}` }), h(TableCell, { className: "text-right", children: row.total_rede_rows ?? 0 }), h(TableCell, { className: "text-right", children: row.total_winthor_rows ?? 0 }), h(TableCell, { className: "text-right", children: row.total_conciliated ?? 0 }), h(TableCell, { children: formatDate(row.created_at) }), h(TableCell, { children: h(Button, { variant: "outline", size: "sm", onClick: () => setBatchId(row.id), children: "Abrir" }) })] }, row.id)),
                                        history.length === 0 ? h(TableRow, { children: h(TableCell, { colSpan: 8, className: "py-10 text-center text-sm text-muted-foreground", children: "Nenhum processamento registrado." }) }) : null,
                                    ],
                                }),
                            ],
                        }),
                    }),
                ],
            }),
            h(DetailModal, { row: detailRow, titles: detailTitles, loadingTitles: loadingDetailTitles, onClose: () => {
                    setDetailRow(null);
                    setDetailTitles(null);
                } }),
        ],
    });
}
export default ConciliadoCartaoPage;
