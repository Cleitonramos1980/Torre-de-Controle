import { i as useToast, r as React, j as jsxRuntime, J as Card, K as CardHeader, M as CardTitle, N as CardContent, B as Button, a as apiGet } from "./index-Cw1PFMX8.js";
import { T as Table, a as TableHeader, b as TableRow, c as TableHead, d as TableBody, e as TableCell } from "./table-BASKWVp-.js";

const h = jsxRuntime.jsx;
const hs = jsxRuntime.jsxs;

const API_BASE = "/financeiro-ti";

function toIso(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function defaultFilters() {
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth() + 4, 0);
  const start = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000);
  return {
    dataInicial: toIso(start),
    dataFinal: toIso(end),
    fornecedor: "",
    codFornec: "",
    codConta: "",
    centroCusto: "5.1.11",
    grupoConta: "",
    risco: "",
    status: "",
    tipoAnalise: "TODOS",
    visao: "TODOS",
  };
}

function buildQuery(filters = {}) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value == null) return;
    const text = String(value).trim();
    if (!text) return;
    query.set(key, text);
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

function money(value) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return "R$ 0,00";
  return parsed.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function percent(value) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return "0,00%";
  return `${parsed.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function datePtBr(value, suffixEstimated = false) {
  if (!value) return "Sem vencimento informado";
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  const base = parsed.toLocaleDateString("pt-BR");
  return suffixEstimated ? `${base} (estimado)` : base;
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (text.includes(";") || text.includes('"') || text.includes("\n")) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

function exportCsv(filename, columns, rows) {
  const header = columns.map((column) => csvEscape(column.label)).join(";");
  const body = rows.map((row) => columns.map((column) => csvEscape(column.value(row))).join(";")).join("\n");
  const content = `${header}\n${body}`;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function weekOfMonth(isoDate) {
  if (!isoDate) return 0;
  const parsed = new Date(`${String(isoDate).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return 0;
  return Math.floor((parsed.getDate() - 1) / 7) + 1;
}

function weekLabel(isoDate) {
  const month = String(isoDate || "").slice(0, 7);
  if (!month) return "Sem data";
  return `${month} - Semana ${weekOfMonth(isoDate)}`;
}

function matchesPeriod(isoDate, periodo, granularidade, semDataLabel) {
  if (!isoDate) {
    return periodo === semDataLabel;
  }
  if (granularidade === "SEMANAL") {
    return weekLabel(isoDate) === periodo;
  }
  return String(isoDate).slice(0, 7) === periodo;
}

function toText(value) {
  if (value == null) return "-";
  const text = String(value).trim();
  return text ? text : "-";
}

function isoDateOrEmpty(value) {
  if (!value) return "";
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function firstValidIsoDate(...values) {
  for (const value of values) {
    const iso = isoDateOrEmpty(value);
    if (iso) return iso;
  }
  return "";
}

function fluxoPeriodoSortValue(periodo) {
  const text = String(periodo ?? "").trim();
  const weekly = text.match(/^(\d{4})-(\d{2})\s*-\s*Semana\s*(\d{1,2})$/i);
  if (weekly) {
    const year = Number(weekly[1]);
    const month = Number(weekly[2]);
    const week = Number(weekly[3]);
    return year * 100000 + month * 1000 + week;
  }
  const monthly = text.match(/^(\d{4})-(\d{2})$/);
  if (monthly) {
    const year = Number(monthly[1]);
    const month = Number(monthly[2]);
    return year * 100000 + month * 1000;
  }
  return Number.MAX_SAFE_INTEGER;
}

function normalizeMatchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function supplierKey(row) {
  const codFornec = row?.codFornec == null ? "" : String(row.codFornec).trim();
  const fornecedor = normalizeMatchText(row?.fornecedor);
  return `${codFornec}::${fornecedor}`;
}

function supplierAccountKey(row) {
  const conta = row?.codConta == null ? "" : String(row.codConta).trim();
  return `${supplierKey(row)}::${conta}`;
}

function supplierNameKey(row) {
  return normalizeMatchText(row?.fornecedor);
}

function supplierNameAccountKey(row) {
  const conta = row?.codConta == null ? "" : String(row.codConta).trim();
  return `${supplierNameKey(row)}::${conta}`;
}

function filialKey(row) {
  const value = row?.codFilial ?? row?.codfilial ?? "";
  return String(value).trim();
}

function filialSupplierAccountKey(row) {
  return `${filialKey(row)}::${supplierAccountKey(row)}`;
}

function filialSupplierNameAccountKey(row) {
  return `${filialKey(row)}::${supplierNameAccountKey(row)}`;
}

function filialSupplierNameKey(row) {
  return `${filialKey(row)}::${supplierNameKey(row)}`;
}

function tituloIdentidade(row) {
  const recnum = row?.recnum == null ? "" : String(row.recnum).trim();
  if (recnum) return `RECNUM::${recnum}`;
  return [
    "ALT",
    filialKey(row),
    row?.codFornec == null ? "" : String(row.codFornec).trim(),
    row?.codConta == null ? "" : String(row.codConta).trim(),
    row?.numNota == null ? "" : String(row.numNota).trim(),
    isoDateOrEmpty(row?.dtPagto) || isoDateOrEmpty(row?.dtVencimento) || isoDateOrEmpty(row?.dtLanc),
    Number(row?.valorCentroCusto ?? 0).toFixed(2),
  ].join("::");
}

function toMonthLabel(isoMonth) {
  if (!isoMonth || !/^\d{4}-\d{2}$/.test(isoMonth)) return isoMonth || "-";
  const [year, month] = isoMonth.split("-");
  const parsed = new Date(`${year}-${month}-01T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoMonth;
  return parsed.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function shouldIgnoreContainerDrilldown(target) {
  if (!target || !(target instanceof Element)) return false;
  if (target.closest("[data-no-drilldown='true']")) return true;
  if (target.closest("button, a, input, select, textarea")) return true;
  if (target.closest("tbody tr")) return true;
  return false;
}

function KpiCard({ title, value, subtitle, onClick }) {
  const clickable = typeof onClick === "function";
  const className = clickable
    ? "rounded-md border border-border/70 bg-card p-4 text-left transition hover:bg-muted/30 cursor-pointer"
    : "rounded-md border border-border/70 bg-card p-4";
  const props = clickable
    ? {
        role: "button",
        tabIndex: 0,
        onClick,
        onKeyDown: (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick();
          }
        },
      }
    : {};
  return hs("div", {
    className,
    ...props,
    children: [
      h("p", { className: "text-xs uppercase tracking-wide text-muted-foreground", children: title }),
      h("p", { className: "mt-2 text-2xl font-semibold text-foreground", children: value }),
      subtitle ? h("p", { className: "mt-1 text-xs text-muted-foreground", children: subtitle }) : null,
    ],
  });
}

function DrilldownModal({ state, onClose }) {
  if (!state?.open) return null;
  const rows = Array.isArray(state.rows) ? state.rows : [];
  const columns = Array.isArray(state.columns) ? state.columns : [];
  const desktopSidebarOffset = typeof window !== "undefined" && window.innerWidth >= 1024 ? 272 : 0;
  const dialogWidth = desktopSidebarOffset > 0
    ? `min(1800px, calc(100vw - ${desktopSidebarOffset + 24}px))`
    : "min(1800px, calc(100vw - 1rem))";

  return hs("div", {
    className: "fixed inset-0 flex items-start justify-center overflow-y-auto overscroll-contain p-1 sm:p-3",
    style: {
      zIndex: 2147483000,
      paddingLeft: desktopSidebarOffset > 0 ? `${desktopSidebarOffset + 8}px` : undefined,
    },
    onClick: onClose,
    children: [
      h("div", { className: "absolute inset-0 bg-black/50" }),
      hs("div", {
        className: "relative my-1 sm:my-4 flex w-[min(1800px,calc(100vw-0.5rem))] sm:w-[min(1800px,calc(100vw-1.5rem))] h-[calc(100vh-0.5rem)] sm:h-[calc(100vh-1.5rem)] min-h-0 flex-col overflow-hidden rounded-md border bg-background shadow-2xl",
        style: { width: dialogWidth, maxWidth: dialogWidth },
        onClick: (event) => event.stopPropagation(),
        children: [
          hs("div", {
            className: "flex items-start justify-between gap-4 border-b px-4 py-3",
            children: [
              hs("div", {
                className: "min-w-0",
                children: [
                  h("h3", { className: "text-lg font-semibold text-foreground", children: state.title || "Origem das informacoes" }),
                  state.subtitle
                    ? h("p", { className: "mt-1 text-xs text-muted-foreground", children: state.subtitle })
                    : null,
                  h("p", { className: "mt-1 text-xs text-muted-foreground", children: `${rows.length} registro(s)` }),
                ],
              }),
              h("button", {
                type: "button",
                className: "rounded-md border px-3 py-1 text-sm hover:bg-muted",
                onClick: onClose,
                children: "Fechar",
              }),
            ],
          }),
          h("div", {
            className: "min-h-0 flex-1 overflow-auto p-2 sm:p-4",
            style: { WebkitOverflowScrolling: "touch" },
            children: rows.length === 0
              ? h("p", { className: "text-sm text-muted-foreground", children: "Nenhum registro encontrado para esta origem." })
              : h("div", {
                  className: "max-w-full overflow-auto",
                  children: hs(Table, {
                    className: "min-w-[980px] lg:min-w-[1200px]",
                    children: [
                      h(TableHeader, {
                        children: h(TableRow, {
                          children: columns.map((column, index) => {
                            const label = column.label || `Coluna ${index + 1}`;
                            const headerClass = /fornecedor/i.test(label)
                              ? "min-w-[260px]"
                              : /historico|comentario|mensagem/i.test(label)
                                ? "min-w-[240px]"
                                : /conta/i.test(label)
                                  ? "min-w-[180px]"
                                  : "min-w-[120px]";
                            return h(TableHead, { className: headerClass, children: label }, `${label}-${index}`);
                          }),
                        }),
                      }),
                      h(TableBody, {
                        children: rows.map((row, rowIndex) =>
                          h(TableRow, {
                            className: "align-top",
                            children: columns.map((column, colIndex) => {
                              const rawValue = typeof column.value === "function" ? column.value(row, rowIndex) : row?.[column.key];
                              const label = column.label || "";
                              const cellClass = /fornecedor/i.test(label)
                                ? "text-xs whitespace-normal break-words min-w-[260px]"
                                : /historico|comentario|mensagem/i.test(label)
                                  ? "text-xs whitespace-normal break-words min-w-[240px]"
                                  : "text-xs whitespace-normal break-words";
                              return h(TableCell, { className: cellClass, children: toText(rawValue) }, `${rowIndex}-${colIndex}`);
                            }),
                          }, `row-${rowIndex}`)),
                      }),
                    ],
                  }),
                }),
          }),
        ],
      }),
    ],
  });
}

function FinanceiroTiPage() {
  const { toast } = useToast();
  const [filters, setFilters] = React.useState(defaultFilters);
  const [appliedFilters, setAppliedFilters] = React.useState(defaultFilters);
  const [loading, setLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState("");
  const [payload, setPayload] = React.useState(null);
  const [drilldown, setDrilldown] = React.useState({
    open: false,
    title: "",
    subtitle: "",
    columns: [],
    rows: [],
  });

  const loadDashboard = React.useCallback(async (currentFilters) => {
    setLoading(true);
    setErrorMessage("");
    try {
      const data = await apiGet(`${API_BASE}/dashboard${buildQuery(currentFilters)}`);
      setPayload(data ?? null);
    } catch (error) {
      const description = error instanceof Error ? error.message : "Falha ao carregar Financeiro-TI.";
      setErrorMessage(description);
      toast({
        title: "Financeiro-TI",
        description,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadDashboard(appliedFilters).catch(() => {});
  }, [appliedFilters]);

  const resumo = payload?.resumo ?? {};
  const recorrencias = payload?.recorrenciasAusentes ?? [];
  const fluxo = payload?.fluxoProjetado ?? [];
  const alertas = payload?.alertas ?? [];
  const historico = payload?.historicoPagamentos ?? [];
  const aberto = payload?.contasEmAberto ?? [];
  const vencimentoDisponivel = Boolean(payload?.vencimentoDetectado);

  const top5Aberto = React.useMemo(() => {
    const grouped = new Map();
    for (const row of aberto) {
      const key = `${row.codFornec ?? "SEM_COD"}::${row.fornecedor ?? "SEM_FORNECEDOR"}`;
      const current = grouped.get(key) || {
        codFornec: row.codFornec ?? null,
        fornecedor: row.fornecedor ?? "SEM_FORNECEDOR",
        valorAberto: 0,
        qtdTitulos: 0,
      };
      current.valorAberto += Number(row.valorCentroCusto ?? 0);
      current.qtdTitulos += 1;
      grouped.set(key, current);
    }
    return [...grouped.values()]
      .sort((a, b) => b.valorAberto - a.valorAberto)
      .slice(0, 5)
      .map((row, index) => ({
        ...row,
        percentual: Number(resumo.totalAbertoRegistrado ?? 0) > 0
          ? (row.valorAberto / Number(resumo.totalAbertoRegistrado)) * 100
          : 0,
        posicao: index + 1,
      }));
  }, [aberto, resumo.totalAbertoRegistrado]);

  const projecaoQuatroMeses = React.useMemo(() => {
    const months = [];
    const base = new Date();
    base.setDate(1);
    const inicioMesAtual = new Date(base.getFullYear(), base.getMonth(), 1);

    const atrasados = {
      key: "__ATRASADOS__",
      mes: "__ATRASADOS__",
      titulo: "Atrasados",
      contasAPagarRegistrado: 0,
      recorrenciasEstimadas: 0,
      totalProjetado: 0,
      isAtrasado: true,
    };

    for (let index = 0; index < 4; index += 1) {
      const current = new Date(base.getFullYear(), base.getMonth() + index, 1);
      const isoMonth = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
      months.push({
        key: isoMonth,
        mes: isoMonth,
        titulo: toMonthLabel(isoMonth),
        contasAPagarRegistrado: 0,
        recorrenciasEstimadas: 0,
        totalProjetado: 0,
        isAtrasado: false,
      });
    }

    const monthMap = new Map(months.map((item) => [item.mes, item]));
    for (const item of fluxo) {
      if (String(item?.granularidade || "").toUpperCase() !== "MENSAL") continue;
      const periodo = String(item?.periodo || "");
      if (!/^\d{4}-\d{2}$/.test(periodo)) continue;
      const target = monthMap.get(periodo);
      if (!target) continue;
      target.contasAPagarRegistrado += Number(item?.contasAPagarRegistrado ?? 0);
      target.recorrenciasEstimadas += Number(item?.recorrenciasEstimadasNaoLancadas ?? 0);
      target.totalProjetado += Number(item?.totalProjetado ?? 0);
    }

    for (const row of aberto) {
      const refIso = String(row?.dtVencimento || row?.dtLanc || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(refIso)) continue;
      const refDate = new Date(`${refIso}T00:00:00`);
      if (Number.isNaN(refDate.getTime())) continue;
      if (refDate >= inicioMesAtual) continue;
      const valor = Number(row?.valorCentroCusto ?? 0);
      atrasados.contasAPagarRegistrado += valor;
      atrasados.totalProjetado += valor;
    }

    return [atrasados, ...months.map((item) => ({
      ...item,
      contasAPagarRegistrado: Number(item.contasAPagarRegistrado.toFixed(2)),
      recorrenciasEstimadas: Number(item.recorrenciasEstimadas.toFixed(2)),
      totalProjetado: Number(item.totalProjetado.toFixed(2)),
    }))].map((item) => ({
      ...item,
      contasAPagarRegistrado: Number(item.contasAPagarRegistrado.toFixed(2)),
      recorrenciasEstimadas: Number(item.recorrenciasEstimadas.toFixed(2)),
      totalProjetado: Number(item.totalProjetado.toFixed(2)),
    }));
  }, [fluxo, aberto]);

  const historicoUltimosCincoMeses = React.useMemo(() => {
    const grouped = new Map();
    for (const row of historico) {
      const dtPagto = String(row?.dtPagto || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dtPagto)) continue;
      const mes = dtPagto.slice(0, 7);
      if (!grouped.has(mes)) {
        grouped.set(mes, {
          key: mes,
          mes,
          titulo: toMonthLabel(mes),
          totalPago: 0,
          totalLancamento: 0,
          qtdLancamentos: 0,
        });
      }
      const current = grouped.get(mes);
      current.totalPago += Number(row?.valorCentroCusto ?? 0);
      current.totalLancamento += Number(row?.valorLanc ?? 0);
      current.qtdLancamentos += 1;
    }

    return [...grouped.values()]
      .sort((a, b) => a.mes.localeCompare(b.mes))
      .slice(-5)
      .map((item) => ({
        ...item,
        totalPago: Number(item.totalPago.toFixed(2)),
        totalLancamento: Number(item.totalLancamento.toFixed(2)),
      }));
  }, [historico]);

  const abertoVisivel = React.useMemo(
    () => aberto.filter((row) => !isoDateOrEmpty(row?.dtPagto)),
    [aberto],
  );

  const abertoComHistoricoAlinhado = React.useMemo(() => {
    if (abertoVisivel.length === 0) return [];

    const abertosIds = new Set(abertoVisivel.map((row) => tituloIdentidade(row)));

    const historicoOrdenado = historico
      .filter((row) => Boolean(isoDateOrEmpty(row?.dtPagto)))
      .filter((row) => !abertosIds.has(tituloIdentidade(row)))
      .sort((a, b) =>
      firstValidIsoDate(b?.dtPagto, b?.dtVencimento, b?.dtLanc).localeCompare(
        firstValidIsoDate(a?.dtPagto, a?.dtVencimento, a?.dtLanc),
      ));

    const queueByFilialStrictAccount = new Map();
    const queueByFilialNameAccount = new Map();
    const queueByFilialName = new Map();

    for (const item of historicoOrdenado) {
      const keyFilialStrictAccount = filialSupplierAccountKey(item);
      const keyFilialNameAccount = filialSupplierNameAccountKey(item);
      const keyFilialName = filialSupplierNameKey(item);

      if (!queueByFilialStrictAccount.has(keyFilialStrictAccount)) queueByFilialStrictAccount.set(keyFilialStrictAccount, []);
      if (!queueByFilialNameAccount.has(keyFilialNameAccount)) queueByFilialNameAccount.set(keyFilialNameAccount, []);
      if (!queueByFilialName.has(keyFilialName)) queueByFilialName.set(keyFilialName, []);

      queueByFilialStrictAccount.get(keyFilialStrictAccount).push(item);
      queueByFilialNameAccount.get(keyFilialNameAccount).push(item);
      queueByFilialName.get(keyFilialName).push(item);
    }

    const used = new Set();
    const getId = (row) => tituloIdentidade(row);

    const takeFirstAvailable = (list = []) => {
      for (const row of list) {
        const id = getId(row);
        if (used.has(id)) continue;
        used.add(id);
        return row;
      }
      return null;
    };

    const abertoOrdenado = [...abertoVisivel].sort((a, b) => {
      const dateA = firstValidIsoDate(a?.dtVencimento, a?.dtLanc);
      const dateB = firstValidIsoDate(b?.dtVencimento, b?.dtLanc);
      if (dateA !== dateB) return dateA.localeCompare(dateB);

      const filialA = filialKey(a);
      const filialB = filialKey(b);
      if (filialA !== filialB) return filialA.localeCompare(filialB, "pt-BR", { numeric: true, sensitivity: "base" });

      const fornecA = supplierNameKey(a);
      const fornecB = supplierNameKey(b);
      if (fornecA !== fornecB) return fornecA.localeCompare(fornecB, "pt-BR", { numeric: true, sensitivity: "base" });

      const contaA = a?.codConta == null ? "" : String(a.codConta);
      const contaB = b?.codConta == null ? "" : String(b.codConta);
      if (contaA !== contaB) return contaA.localeCompare(contaB, "pt-BR", { numeric: true, sensitivity: "base" });

      return 0;
    });

    return abertoOrdenado.map((abertoItem) => {
      const strictAccountFilial = filialSupplierAccountKey(abertoItem);
      const nameAccountFilial = filialSupplierNameAccountKey(abertoItem);
      const nameOnlyFilial = filialSupplierNameKey(abertoItem);

      let hist =
        takeFirstAvailable(queueByFilialStrictAccount.get(strictAccountFilial)) ||
        takeFirstAvailable(queueByFilialNameAccount.get(nameAccountFilial)) ||
        takeFirstAvailable(queueByFilialName.get(nameOnlyFilial)) ||
        null;

      if (hist) {
        const sameSupplier = supplierNameKey(hist) === supplierNameKey(abertoItem);
        const sameFilial = filialKey(hist) === filialKey(abertoItem);
        if (!sameSupplier || !sameFilial) hist = null;
      }

      return {
        aberto: abertoItem,
        historico: hist,
      };
    });
  }, [abertoVisivel, historico]);

  const buildHierarquiaNiveis = React.useCallback((rows, options) => {
    const source = Array.isArray(rows) ? rows : [];
    if (source.length === 0) return [];

    const l1Map = new Map();
    for (const originalRow of source) {
      const row = options?.rowTransform ? options.rowTransform(originalRow) : originalRow;
      const l1Key = toText(options.level1Key(row));
      const l2Key = toText(options.level2Key(row));
      const l1Label = toText(options.level1Label(row));
      const l2Label = toText(options.level2Label(row));
      const primaryValue = Number(options.primaryValue?.(row) ?? 0);
      const secondaryValue = Number(options.secondaryValue?.(row) ?? 0);

      if (!l1Map.has(l1Key)) {
        l1Map.set(l1Key, {
          key: l1Key,
          label: l1Label,
          qtdRegistros: 0,
          qtdSubitens: 0,
          totalPrimary: 0,
          totalSecondary: 0,
          level2Map: new Map(),
        });
      }
      const l1 = l1Map.get(l1Key);
      l1.qtdRegistros += 1;
      l1.totalPrimary += primaryValue;
      l1.totalSecondary += secondaryValue;

      if (!l1.level2Map.has(l2Key)) {
        l1.level2Map.set(l2Key, {
          key: l2Key,
          label: l2Label,
          qtdRegistros: 0,
          totalPrimary: 0,
          totalSecondary: 0,
          rows: [],
        });
      }
      const l2 = l1.level2Map.get(l2Key);
      l2.qtdRegistros += 1;
      l2.totalPrimary += primaryValue;
      l2.totalSecondary += secondaryValue;
      l2.rows.push(row);
    }

    const sortDate = options?.sortDate || ((row) => firstValidIsoDate(row?.dtVencimento, row?.dtPagto, row?.dtLanc));
    const level1Sort = options?.level1Sort || ((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    const level2Sort = options?.level2Sort || ((a, b) => b.totalPrimary - a.totalPrimary);
    const rowSortDirection = options?.rowSortDirection === "asc" ? 1 : -1;

    return [...l1Map.values()]
      .map((l1) => {
        const level2 = [...l1.level2Map.values()]
          .map((l2) => ({
            ...l2,
            totalPrimary: Number(l2.totalPrimary.toFixed(2)),
            totalSecondary: Number(l2.totalSecondary.toFixed(2)),
            rows: [...l2.rows].sort((a, b) => {
              const sa = sortDate(a);
              const sb = sortDate(b);
              const cmp = sa.localeCompare(sb);
              return rowSortDirection === 1 ? cmp : -cmp;
            }),
          }))
          .sort(level2Sort);

        return {
          key: l1.key,
          label: l1.label,
          qtdRegistros: l1.qtdRegistros,
          qtdSubitens: level2.length,
          totalPrimary: Number(l1.totalPrimary.toFixed(2)),
          totalSecondary: Number(l1.totalSecondary.toFixed(2)),
          level2,
        };
      })
      .sort(level1Sort);
  }, []);

  const niveisEvolucao = React.useMemo(() => buildHierarquiaNiveis(historico, {
    level1Key: (row) => String(row?.dtPagto || "").slice(0, 7) || "SEM_MES",
    level1Label: (row) => {
      const month = String(row?.dtPagto || "").slice(0, 7);
      return month ? toMonthLabel(month) : "Sem mes";
    },
    level2Key: (row) => `${row?.codConta ?? "SEM_CONTA"}::${toText(row?.conta)}`,
    level2Label: (row) => `${toText(row?.conta)} (${row?.codConta ?? "-"})`,
    primaryValue: (row) => row?.valorCentroCusto,
    secondaryValue: (row) => row?.valorLanc,
    sortDate: (row) => firstValidIsoDate(row?.dtPagto, row?.dtVencimento, row?.dtLanc),
    rowSortDirection: "asc",
    level1Sort: (a, b) => String(a.key).localeCompare(String(b.key)),
  }), [historico, buildHierarquiaNiveis]);

  const niveisFluxoProjetado = React.useMemo(() => buildHierarquiaNiveis(fluxo, {
    level1Key: (row) => row?.granularidade || "SEM_GRANULARIDADE",
    level1Label: (row) => row?.granularidade || "Sem granularidade",
    level2Key: (row) => row?.periodo || "SEM_PERIODO",
    level2Label: (row) => row?.periodo || "Sem periodo",
    primaryValue: (row) => row?.contasAPagarRegistrado,
    secondaryValue: (row) => row?.totalProjetado,
    sortDate: (row) => toText(row?.periodo),
    rowSortDirection: "asc",
    level1Sort: (a, b) => a.label.localeCompare(b.label, "pt-BR"),
    level2Sort: (a, b) => fluxoPeriodoSortValue(a.key) - fluxoPeriodoSortValue(b.key),
  }), [fluxo, buildHierarquiaNiveis]);

  const niveisRecorrencias = React.useMemo(() => buildHierarquiaNiveis(recorrencias, {
    level1Key: (row) => row?.risco || "SEM_RISCO",
    level1Label: (row) => row?.risco || "Sem risco",
    level2Key: (row) => `${row?.codConta ?? "SEM_CONTA"}::${toText(row?.conta)}`,
    level2Label: (row) => `${toText(row?.conta)} (${row?.codConta ?? "-"})`,
    primaryValue: (row) => row?.valorMedioHistorico,
    secondaryValue: (row) => row?.valorMedioHistorico,
    sortDate: (row) => firstValidIsoDate(row?.proximoVencimentoEstimado, row?.ultimoPagamento),
    level1Sort: (a, b) => {
      const peso = { ALTO: 3, MEDIO: 2, BAIXO: 1 };
      const pa = peso[a.label] ?? 0;
      const pb = peso[b.label] ?? 0;
      return pb - pa;
    },
  }), [recorrencias, buildHierarquiaNiveis]);

  const niveisAberto = React.useMemo(() => buildHierarquiaNiveis(aberto, {
    level1Key: (row) => row?.grupoConta ?? "SEM_GRUPO",
    level1Label: (row) => row?.grupoConta == null ? "Sem grupo" : `Grupo ${row.grupoConta}`,
    level2Key: (row) => `${row?.codConta ?? "SEM_CONTA"}::${toText(row?.conta)}`,
    level2Label: (row) => `${toText(row?.conta)} (${row?.codConta ?? "-"})`,
    primaryValue: (row) => row?.valorCentroCusto,
    secondaryValue: (row) => row?.valorLanc,
    sortDate: (row) => firstValidIsoDate(row?.dtVencimento, row?.dtLanc),
    level1Sort: (a, b) => {
      const an = Number(a.key);
      const bn = Number(b.key);
      const av = Number.isFinite(an);
      const bv = Number.isFinite(bn);
      if (av && bv) return an - bn;
      if (av) return -1;
      if (bv) return 1;
      return a.label.localeCompare(b.label, "pt-BR");
    },
  }), [aberto, buildHierarquiaNiveis]);

  const niveisHistorico = React.useMemo(() => buildHierarquiaNiveis(historico, {
    level1Key: (row) => row?.grupoConta ?? "SEM_GRUPO",
    level1Label: (row) => row?.grupoConta == null ? "Sem grupo" : `Grupo ${row.grupoConta}`,
    level2Key: (row) => `${row?.codConta ?? "SEM_CONTA"}::${toText(row?.conta)}`,
    level2Label: (row) => `${toText(row?.conta)} (${row?.codConta ?? "-"})`,
    primaryValue: (row) => row?.valorCentroCusto,
    secondaryValue: (row) => row?.valorLanc,
    sortDate: (row) => firstValidIsoDate(row?.dtPagto, row?.dtVencimento, row?.dtLanc),
    level1Sort: (a, b) => {
      const an = Number(a.key);
      const bn = Number(b.key);
      const av = Number.isFinite(an);
      const bv = Number.isFinite(bn);
      if (av && bv) return an - bn;
      if (av) return -1;
      if (bv) return 1;
      return a.label.localeCompare(b.label, "pt-BR");
    },
  }), [historico, buildHierarquiaNiveis]);

  const agrupamentoGrupoConta = React.useMemo(() => {
    const rows = [
      ...aberto.map((row) => ({ ...row, __origem: "EM_ABERTO" })),
      ...historico.map((row) => ({ ...row, __origem: "PAGO" })),
    ];
    if (rows.length === 0) return [];

    const groupMap = new Map();
    for (const row of rows) {
      const grupoContaCodigo = row?.grupoConta == null || row?.grupoConta === ""
        ? "SEM_GRUPO"
        : String(row.grupoConta);
      const grupoDescricaoRaw = toText(row?.grupoDescricao);
      const grupoDescricao = grupoDescricaoRaw === "-" || /^SEM_DESCRICAO_GRUPO$/i.test(grupoDescricaoRaw)
        ? ""
        : grupoDescricaoRaw;
      const grupoConta = `${grupoContaCodigo}::${grupoDescricao || "SEM_DESCRICAO"}`;
      const codConta = row?.codConta == null || row?.codConta === ""
        ? "SEM_CONTA"
        : String(row.codConta);
      const contaNome = toText(row?.conta);
      const contaKey = `${codConta}::${contaNome}`;

      if (!groupMap.has(grupoConta)) {
        groupMap.set(grupoConta, {
          key: grupoConta,
          codigo: grupoContaCodigo,
          descricao: grupoDescricao,
          label: grupoContaCodigo === "SEM_GRUPO"
            ? "Sem grupo de conta"
            : (grupoDescricao || `Grupo ${grupoContaCodigo}`),
          qtdLancamentos: 0,
          totalRateado: 0,
          totalLanc: 0,
          contas: new Map(),
        });
      }

      const group = groupMap.get(grupoConta);
      group.qtdLancamentos += 1;
      group.totalRateado += Number(row?.valorCentroCusto ?? 0);
      group.totalLanc += Number(row?.valorLanc ?? 0);

      if (!group.contas.has(contaKey)) {
        group.contas.set(contaKey, {
          key: contaKey,
          codConta,
          conta: contaNome,
          qtdLancamentos: 0,
          totalRateado: 0,
          totalLanc: 0,
          detalhes: [],
        });
      }

      const conta = group.contas.get(contaKey);
      conta.qtdLancamentos += 1;
      conta.totalRateado += Number(row?.valorCentroCusto ?? 0);
      conta.totalLanc += Number(row?.valorLanc ?? 0);
      conta.detalhes.push(row);
    }

    return [...groupMap.values()]
      .map((group) => {
        const contas = [...group.contas.values()]
          .map((conta) => ({
            ...conta,
            totalRateado: Number(conta.totalRateado.toFixed(2)),
            totalLanc: Number(conta.totalLanc.toFixed(2)),
            detalhes: [...conta.detalhes].sort((a, b) => {
              const aDate = firstValidIsoDate(a?.dtVencimento, a?.dtPagto, a?.dtLanc);
              const bDate = firstValidIsoDate(b?.dtVencimento, b?.dtPagto, b?.dtLanc);
              return bDate.localeCompare(aDate);
            }),
          }))
          .sort((a, b) => b.totalRateado - a.totalRateado);

        return {
          key: group.key,
          codigo: group.codigo,
          descricao: group.descricao,
          label: group.label,
          qtdLancamentos: group.qtdLancamentos,
          qtdContas: contas.length,
          totalRateado: Number(group.totalRateado.toFixed(2)),
          totalLanc: Number(group.totalLanc.toFixed(2)),
          contas,
        };
      })
      .sort((a, b) => {
        if (a.codigo === "SEM_GRUPO") return 1;
        if (b.codigo === "SEM_GRUPO") return -1;
        const aNum = Number(a.codigo);
        const bNum = Number(b.codigo);
        const aValid = Number.isFinite(aNum);
        const bValid = Number.isFinite(bNum);
        if (aValid && bValid) return aNum - bNum;
        if (aValid) return -1;
        if (bValid) return 1;
        return a.label.localeCompare(b.label, "pt-BR");
      });
  }, [aberto, historico]);

  const resumoPorFornecedor = React.useMemo(() => {
    const grouped = new Map();

    const ensureSupplier = (row) => {
      const codFornec = row?.codFornec == null || row?.codFornec === ""
        ? "SEM_COD"
        : String(row.codFornec);
      const fornecedor = toText(row?.fornecedor);
      const key = `${codFornec}::${fornecedor}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          codFornec,
          fornecedor,
          totalPago: 0,
          totalAberto: 0,
          totalGeral: 0,
          detalhes: [],
        });
      }
      return grouped.get(key);
    };

    for (const row of historico) {
      const supplier = ensureSupplier(row);
      const valorRateado = Number(row?.valorCentroCusto ?? 0);
      const valorLanc = Number(row?.valorLanc ?? 0);
      supplier.totalPago += valorRateado;
      supplier.totalGeral += valorRateado;
      supplier.detalhes.push({
        ...row,
        __origem: "PAGO",
        __valorRateado: valorRateado,
        __valorLanc: valorLanc,
      });
    }

    for (const row of aberto) {
      const supplier = ensureSupplier(row);
      const valorRateado = Number(row?.valorCentroCusto ?? 0);
      const valorLanc = Number(row?.valorLanc ?? 0);
      supplier.totalAberto += valorRateado;
      supplier.totalGeral += valorRateado;
      supplier.detalhes.push({
        ...row,
        __origem: "EM_ABERTO",
        __valorRateado: valorRateado,
        __valorLanc: valorLanc,
      });
    }

    return [...grouped.values()]
      .map((item) => ({
        ...item,
        totalPago: Number(item.totalPago.toFixed(2)),
        totalAberto: Number(item.totalAberto.toFixed(2)),
        totalGeral: Number(item.totalGeral.toFixed(2)),
        detalhes: [...item.detalhes].sort((a, b) => {
          const ad = firstValidIsoDate(a?.dtVencimento, a?.dtPagto, a?.dtLanc);
          const bd = firstValidIsoDate(b?.dtVencimento, b?.dtPagto, b?.dtLanc);
          const cmp = ad.localeCompare(bd);
          if (cmp !== 0) return cmp;
          return String(a?.numNota ?? "").localeCompare(String(b?.numNota ?? ""), "pt-BR", { numeric: true, sensitivity: "base" });
        }),
      }))
      .sort((a, b) => b.totalGeral - a.totalGeral);
  }, [aberto, historico]);

  const onFilterChange = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const applyFilters = () => setAppliedFilters({ ...filters });
  const clearFilters = () => {
    const defaults = defaultFilters();
    setFilters(defaults);
    setAppliedFilters(defaults);
  };

  const closeDrilldown = () => {
    setDrilldown((current) => ({ ...current, open: false }));
  };

  const openDrilldown = (title, subtitle, columns, rows) => {
    setDrilldown({
      open: true,
      title,
      subtitle: subtitle || "",
      columns: Array.isArray(columns) ? columns : [],
      rows: Array.isArray(rows) ? rows : [],
    });
  };

  const commonLancColumns = [
    { label: "Data", value: (row) => datePtBr(row.dtPagto || row.dtVencimento || row.dtLanc || null, false) },
    { label: "DTVENC", value: (row) => row.dtVencimento ? datePtBr(row.dtVencimento, false) : "Sem vencimento informado" },
    { label: "Cod. filial", value: (row) => row.codFilial ?? "-" },
    { label: "Fornecedor", value: (row) => row.fornecedor || "-" },
    { label: "Cod. fornecedor", value: (row) => row.codFornec ?? "-" },
    { label: "Conta", value: (row) => row.conta || "-" },
    { label: "Cod. conta", value: (row) => row.codConta ?? "-" },
    { label: "Centro de custo", value: (row) => row.codCentroCusto || "-" },
    { label: "Historico", value: (row) => row.historico || "-" },
    { label: "Num. nota", value: (row) => row.numNota || "-" },
    { label: "Valor rateado", value: (row) => money(row.valorCentroCusto) },
    { label: "Valor lancamento", value: (row) => money(row.valorLanc) },
    { label: "Recnum", value: (row) => row.recnum ?? "-" },
  ];

  const recorrenciaColumns = [
    { label: "DTVENC", value: (row) => row.dtVencimento ? datePtBr(row.dtVencimento, false) : "Sem vencimento informado" },
    { label: "Cod. filial", value: (row) => row.codFilial ?? "-" },
    { label: "Cod. fornecedor", value: (row) => row.codFornec ?? "-" },
    { label: "Fornecedor", value: (row) => row.fornecedor || "-" },
    { label: "Conta", value: (row) => row.conta || "-" },
    { label: "Cod. conta", value: (row) => row.codConta ?? "-" },
    { label: "Qtd pagamentos", value: (row) => row.qtdPagamentos ?? 0 },
    { label: "Media historica", value: (row) => money(row.valorMedioHistorico) },
    { label: "Ultimo pagamento", value: (row) => datePtBr(row.ultimoPagamento, false) },
    { label: "Prox. vencimento estimado", value: (row) => datePtBr(row.proximoVencimentoEstimado, true) },
    { label: "Risco", value: (row) => row.risco || "-" },
    { label: "Comentario", value: (row) => row.comentario || "-" },
  ];

  const alertaColumns = [
    { label: "Tipo", value: (row) => row.tipo || "-" },
    { label: "Mensagem", value: (row) => row.mensagem || "-" },
    { label: "Valor", value: (row) => money(row.valor) },
    { label: "Risco", value: (row) => row.risco || "-" },
    { label: "Acao recomendada", value: (row) => row.acaoRecomendada || "-" },
  ];

  const projectedCombinedColumns = [
    { label: "Origem", value: (row) => row.origem || "-" },
    { label: "Periodo de referencia", value: (row) => row.periodoRef || "-" },
    { label: "Data referencia", value: (row) => row.dataRef || "-" },
    { label: "Fornecedor", value: (row) => row.fornecedor || "-" },
    { label: "Conta", value: (row) => row.conta || "-" },
    { label: "Valor", value: (row) => row.valorFormatado || money(row.valor) },
    { label: "Observacao", value: (row) => row.observacao || "-" },
  ];

  const exportRecorrencias = () => {
    exportCsv(
      "financeiro-ti-recorrencias-ausentes.csv",
      [
        { label: "DTVENC", value: (row) => row.dtVencimento ?? "" },
        { label: "Codigo filial", value: (row) => row.codFilial ?? "" },
        { label: "Codigo fornecedor", value: (row) => row.codFornec ?? "" },
        { label: "Fornecedor", value: (row) => row.fornecedor ?? "" },
        { label: "Codigo conta", value: (row) => row.codConta ?? "" },
        { label: "Conta", value: (row) => row.conta ?? "" },
        { label: "Qtd pagamentos", value: (row) => row.qtdPagamentos ?? 0 },
        { label: "Valor medio historico", value: (row) => row.valorMedioHistorico ?? 0 },
        { label: "Ultimo pagamento", value: (row) => row.ultimoPagamento ?? "" },
        { label: "Frequencia provavel", value: (row) => row.frequenciaProvavel ?? "" },
        { label: "Proximo vencimento estimado", value: (row) => row.proximoVencimentoEstimado ?? "" },
        { label: "Risco", value: (row) => row.risco ?? "" },
        { label: "Comentario", value: (row) => row.comentario ?? "" },
      ],
      recorrencias,
    );
  };

  const exportFluxo = () => {
    exportCsv(
      "financeiro-ti-fluxo-projetado.csv",
      [
        { label: "Periodo", value: (row) => row.periodo ?? "" },
        { label: "Granularidade", value: (row) => row.granularidade ?? "" },
        { label: "Contas a pagar registrado", value: (row) => row.contasAPagarRegistrado ?? 0 },
        { label: "Recorrencias estimadas nao lancadas", value: (row) => row.recorrenciasEstimadasNaoLancadas ?? 0 },
        { label: "Total projetado", value: (row) => row.totalProjetado ?? 0 },
        { label: "Risco", value: (row) => row.risco ?? "" },
        { label: "Observacao", value: (row) => row.observacao ?? "" },
      ],
      fluxo,
    );
  };

  const openTotalPago = () => {
    openDrilldown(
      "Origem - Total pago no historico",
      "Lancamentos oficiais com DTPAGTO preenchido.",
      commonLancColumns,
      historico,
    );
  };

  const openTotalAberto = () => {
    openDrilldown(
      "Origem - Total em aberto registrado",
      "Lancamentos oficiais com DTPAGTO nulo.",
      commonLancColumns,
      aberto,
    );
  };

  const openRecorrencias = () => {
    openDrilldown(
      "Origem - Recorrencias estimadas nao lancadas",
      "Estimativas calculadas a partir do historico de pagamentos.",
      recorrenciaColumns,
      recorrencias,
    );
  };

  const openTotalProjetado = () => {
    const oficiais = aberto.map((row) => ({
      origem: "Contas a pagar registrado",
      periodoRef: row.dtVencimento ? String(row.dtVencimento).slice(0, 7) : "Sem vencimento informado",
      dataRef: datePtBr(row.dtVencimento || row.dtLanc || null, false),
      fornecedor: row.fornecedor || "-",
      conta: row.conta || "-",
      valor: Number(row.valorCentroCusto ?? 0),
      valorFormatado: money(row.valorCentroCusto),
      observacao: "Titulo oficial em aberto",
    }));
    const estimados = recorrencias.map((row) => ({
      origem: "Recorrencia estimada",
      periodoRef: row.proximoVencimentoEstimado ? String(row.proximoVencimentoEstimado).slice(0, 7) : "Sem estimativa",
      dataRef: datePtBr(row.proximoVencimentoEstimado, true),
      fornecedor: row.fornecedor || "-",
      conta: row.conta || "-",
      valor: Number(row.valorMedioHistorico ?? 0),
      valorFormatado: money(row.valorMedioHistorico),
      observacao: row.comentario || "Estimativa por historico",
    }));
    openDrilldown(
      "Origem - Total projetado",
      "Composicao entre aberto oficial e recorrencias estimadas.",
      projectedCombinedColumns,
      [...oficiais, ...estimados],
    );
  };

  const openTop5Concentracao = () => {
    const columns = [
      { label: "Posicao", value: (row) => row.posicao },
      { label: "Fornecedor", value: (row) => row.fornecedor || "-" },
      { label: "Cod. fornecedor", value: (row) => row.codFornec ?? "-" },
      { label: "Valor em aberto", value: (row) => money(row.valorAberto) },
      { label: "Qtd titulos", value: (row) => row.qtdTitulos ?? 0 },
      { label: "% concentracao", value: (row) => percent(row.percentual) },
    ];
    openDrilldown(
      "Origem - Concentracao top 5",
      "Top 5 fornecedores que concentram contas em aberto.",
      columns,
      top5Aberto,
    );
  };

  const openMaiorRisco = () => {
    const prioridade = alertas.filter((item) => String(item.risco || "").toUpperCase() === "ALTO");
    openDrilldown(
      "Origem - Maior risco identificado",
      "Alertas gerenciais utilizados para classificacao de risco.",
      alertaColumns,
      prioridade.length > 0 ? prioridade : alertas,
    );
  };

  const openRegistroHistorico = () => {
    const rows = [
      ...historico.map((row) => ({ ...row, _origem: "PAGO" })),
      ...aberto.map((row) => ({ ...row, _origem: "EM_ABERTO" })),
    ];
    const columns = [
      { label: "Origem", value: (row) => row._origem },
      ...commonLancColumns,
    ];
    openDrilldown(
      "Origem - Registros historicos",
      "Base consolidada de pagamentos e contas em aberto.",
      columns,
      rows,
    );
  };

  const openResumoExecutivo = () => {
    const rows = [
      { indicador: "Total pago no historico", valor: money(resumo.totalPagoHistorico), origem: "Lancamentos com DTPAGTO preenchido" },
      { indicador: "Total em aberto registrado", valor: money(resumo.totalAbertoRegistrado), origem: "Lancamentos com DTPAGTO nulo" },
      { indicador: "Recorrencias estimadas nao lancadas", valor: money(resumo.totalRecorrenciasEstimadas), origem: "Estimativa por recorrencia historica" },
      { indicador: "Total projetado", valor: money(resumo.totalProjetado), origem: "Aberto registrado + recorrencias estimadas" },
      { indicador: "Concentracao top 5", valor: percent(resumo.percentualConcentracaoTop5), origem: "Soma dos 5 maiores fornecedores em aberto" },
      { indicador: "Maior risco", valor: resumo.maiorRisco || "-", origem: "Classificacao de alertas gerenciais" },
    ];
    openDrilldown(
      "Origem - Resumo executivo",
      "Composicao e regras aplicadas em cada indicador.",
      [
        { label: "Indicador", value: (row) => row.indicador },
        { label: "Valor", value: (row) => row.valor },
        { label: "Origem", value: (row) => row.origem },
      ],
      rows,
    );
  };

  const openFluxoItem = (item) => {
    const oficiais = aberto.filter((row) =>
      matchesPeriod(row.dtVencimento || null, item.periodo, item.granularidade, "Sem vencimento informado"));
    const estimados = recorrencias.filter((row) =>
      matchesPeriod(row.proximoVencimentoEstimado || null, item.periodo, item.granularidade, "Sem estimativa de data"));

    const rows = [
      ...oficiais.map((row) => ({
        origem: "Oficial lancado",
        periodoRef: item.periodo,
        dataRef: datePtBr(row.dtVencimento || row.dtLanc || null, false),
        fornecedor: row.fornecedor || "-",
        conta: row.conta || "-",
        valor: Number(row.valorCentroCusto ?? 0),
        valorFormatado: money(row.valorCentroCusto),
        observacao: row.historico || "Titulo oficial",
      })),
      ...estimados.map((row) => ({
        origem: "Recorrencia estimada",
        periodoRef: item.periodo,
        dataRef: datePtBr(row.proximoVencimentoEstimado, true),
        fornecedor: row.fornecedor || "-",
        conta: row.conta || "-",
        valor: Number(row.valorMedioHistorico ?? 0),
        valorFormatado: money(row.valorMedioHistorico),
        observacao: row.comentario || "Estimativa por historico",
      })),
    ];

    openDrilldown(
      `Origem - Fluxo projetado (${item.periodo})`,
      `Granularidade: ${item.granularidade}. Clique em cada linha para revisar detalhes.`,
      projectedCombinedColumns,
      rows.length > 0 ? rows : [{
        origem: "Sem origem localizada",
        periodoRef: item.periodo,
        dataRef: "-",
        fornecedor: "-",
        conta: "-",
        valor: 0,
        valorFormatado: money(0),
        observacao: "Nao houve registros compatíveis para este periodo.",
      }],
    );
  };

  const openProjecaoMensal = (item) => {
    if (item?.isAtrasado) {
      const now = new Date();
      const inicioMesAtualIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const rows = aberto
        .filter((row) => {
          const refIso = String(row?.dtVencimento || row?.dtLanc || "").slice(0, 10);
          return /^\d{4}-\d{2}-\d{2}$/.test(refIso) && refIso < inicioMesAtualIso;
        })
        .sort((a, b) => String(a?.dtVencimento || a?.dtLanc || "").localeCompare(String(b?.dtVencimento || b?.dtLanc || "")));

      openDrilldown(
        "Origem - Titulos atrasados",
        "Titulos em aberto com vencimento/data de lancamento anterior ao primeiro dia do mes atual.",
        commonLancColumns,
        rows,
      );
      return;
    }

    openFluxoItem({
      periodo: item?.mes,
      granularidade: "MENSAL",
      risco: "BAIXO",
    });
  };

  const openHistoricoMensalPago = (item) => {
    const mes = String(item?.mes || "");
    const rows = historico
      .filter((row) => String(row?.dtPagto || "").slice(0, 7) === mes)
      .sort((a, b) => String(b?.dtPagto || "").localeCompare(String(a?.dtPagto || "")));

    openDrilldown(
      `Origem - Historico pago (${item?.titulo || mes})`,
      "Lancamentos pagos que compoem o total do mes selecionado.",
      commonLancColumns,
      rows,
    );
  };

  const openRecorrenciaItem = (item) => {
    const historicoOrigem = historico.filter((row) =>
      Number(row.codFornec ?? -1) === Number(item.codFornec ?? -2) &&
      Number(row.codConta ?? -1) === Number(item.codConta ?? -2));
    const abertoOrigem = aberto.filter((row) =>
      Number(row.codFornec ?? -1) === Number(item.codFornec ?? -2) &&
      Number(row.codConta ?? -1) === Number(item.codConta ?? -2));

    const rows = [
      ...historicoOrigem.map((row) => ({ ...row, _origem: "Historico pago" })),
      ...abertoOrigem.map((row) => ({ ...row, _origem: "Aberto oficial" })),
    ];
    openDrilldown(
      `Origem - Recorrencia ${item.fornecedor || "-"}`,
      "Historico e aberto relacionado ao fornecedor/conta da recorrencia selecionada.",
      [{ label: "Origem", value: (row) => row._origem || "-" }, ...commonLancColumns],
      rows.length > 0 ? rows : [item],
    );
  };

  const openAbertoItem = (item) => {
    openDrilldown(
      `Origem - Titulo em aberto (RECNUM ${item.recnum ?? "-"})`,
      "Registro oficial vindo do contas a pagar em aberto.",
      commonLancColumns,
      [item],
    );
  };

  const openHistoricoItem = (item) => {
    openDrilldown(
      `Origem - Pagamento historico (RECNUM ${item.recnum ?? "-"})`,
      "Registro oficial de pagamento realizado.",
      commonLancColumns,
      [item],
    );
  };

  const openAlertaItem = (item) => {
    let rows = [item];
    if (item.tipo === "RECORRENCIA_AUSENTE") {
      rows = recorrencias;
    } else if (item.tipo === "ABERTO_SEM_VENCIMENTO") {
      rows = aberto.filter((row) => !row.dtVencimento);
    } else if (item.tipo === "CONCENTRACAO_TOP5") {
      rows = top5Aberto;
    }
    const columns = item.tipo === "CONCENTRACAO_TOP5"
      ? [
          { label: "Posicao", value: (row) => row.posicao },
          { label: "Fornecedor", value: (row) => row.fornecedor || "-" },
          { label: "Valor aberto", value: (row) => money(row.valorAberto) },
          { label: "Qtd titulos", value: (row) => row.qtdTitulos ?? 0 },
          { label: "Concentracao", value: (row) => percent(row.percentual) },
        ]
      : item.tipo === "RECORRENCIA_AUSENTE"
        ? recorrenciaColumns
        : alertaColumns;
    openDrilldown(
      `Origem - Alerta ${item.tipo || "-"}`,
      "Dados utilizados para compor o alerta selecionado.",
      columns,
      rows,
    );
  };

  const openTodosAlertas = () => {
    openDrilldown(
      "Origem - Alertas gerenciais",
      "Conjunto completo de alertas e regras aplicadas.",
      alertaColumns,
      alertas,
    );
  };

  const onContainerDrilldown = (event, openHandler) => {
    if (shouldIgnoreContainerDrilldown(event?.target)) return;
    if (typeof openHandler === "function") {
      openHandler();
    }
  };

  const renderNiveisEmAbas = ({
    itens,
    emptyText,
    level1CountLabel,
    level2CountLabel,
    primaryLabel,
    secondaryLabel,
    columns,
    onRowClick,
    rowKey,
    tableClassName = "min-w-[1180px]",
  }) => {
    if (!Array.isArray(itens) || itens.length === 0) {
      return h("p", {
        className: "text-sm text-muted-foreground",
        children: loading ? "Carregando..." : (emptyText || "Sem registros para os filtros atuais."),
      });
    }

    return h("div", {
      className: "space-y-3",
      children: itens.map((level1) =>
        hs("details", {
          className: "rounded-md border bg-muted/20",
          children: [
            hs("summary", {
              className: "cursor-pointer select-none list-none px-3 py-2 hover:bg-muted/30",
              children: [
                hs("div", {
                  className: "grid grid-cols-1 md:grid-cols-5 gap-2 text-sm",
                  children: [
                    h("span", { className: "font-medium text-foreground", children: level1.label }),
                    h("span", { className: "text-muted-foreground", children: `${level1CountLabel}: ${level1.qtdSubitens}` }),
                    h("span", { className: "text-muted-foreground", children: `${level2CountLabel}: ${level1.qtdRegistros}` }),
                    h("span", { children: `${primaryLabel}: ${money(level1.totalPrimary)}` }),
                    h("span", { children: `${secondaryLabel}: ${money(level1.totalSecondary)}` }),
                  ],
                }),
              ],
            }),
            h("div", {
              className: "space-y-2 p-3 pt-0",
              children: level1.level2.map((level2) =>
                hs("details", {
                  className: "rounded-md border bg-background",
                  children: [
                    hs("summary", {
                      className: "cursor-pointer select-none list-none px-3 py-2 hover:bg-muted/20",
                      children: [
                        hs("div", {
                          className: "grid grid-cols-1 md:grid-cols-5 gap-2 text-sm",
                          children: [
                            h("span", { className: "font-medium text-foreground", children: level2.label }),
                            h("span", { className: "text-muted-foreground", children: `${level2CountLabel}: ${level2.qtdRegistros}` }),
                            h("span", { className: "text-muted-foreground", children: "Detalhamento" }),
                            h("span", { children: `${primaryLabel}: ${money(level2.totalPrimary)}` }),
                            h("span", { children: `${secondaryLabel}: ${money(level2.totalSecondary)}` }),
                          ],
                        }),
                      ],
                    }),
                    h("div", {
                      className: "p-3 pt-0",
                      children: h("div", {
                        className: "max-w-full overflow-auto",
                        children: hs(Table, {
                          className: tableClassName,
                          children: [
                            h(TableHeader, {
                              children: h(TableRow, {
                                children: columns.map((column, index) =>
                                  h(TableHead, {
                                    className: column.headerClassName || "",
                                    children: column.label,
                                  }, `${column.label}-${index}`)),
                              }),
                            }),
                            h(TableBody, {
                              children: level2.rows.length === 0
                                ? h(TableRow, {
                                    children: h(TableCell, {
                                      colSpan: columns.length,
                                      className: "text-center text-muted-foreground py-6",
                                      children: "Sem detalhes para este nivel.",
                                    }),
                                  })
                                : level2.rows.map((row, rowIndex) =>
                                    h(TableRow, {
                                      className: `${onRowClick ? "cursor-pointer hover:bg-muted/30 " : ""}align-top`,
                                      onClick: onRowClick ? () => onRowClick(row) : void 0,
                                      children: columns.map((column, colIndex) => {
                                        const raw = typeof column.value === "function"
                                          ? column.value(row, rowIndex)
                                          : row?.[column.key];
                                        return h(TableCell, {
                                          className: column.cellClassName || "",
                                          children: raw == null || raw === "" ? "-" : raw,
                                        }, `${rowIndex}-${colIndex}`);
                                      }),
                                    }, rowKey ? rowKey(row, rowIndex, level1, level2) : `${level1.key}-${level2.key}-${rowIndex}`)),
                            }),
                          ],
                        }),
                      }),
                    }),
                  ],
                }, `${level1.key}-${level2.key}`)),
            }),
          ],
        }, level1.key)),
    });
  };

  const colunasEvolucaoNiveis = [
    { label: "Data pagamento", value: (row) => datePtBr(row.dtPagto, false) },
    { label: "DTVENC", value: (row) => row.dtVencimento ? datePtBr(row.dtVencimento, false) : "Sem vencimento informado" },
    { label: "Cod. filial", value: (row) => row.codFilial ?? "-" },
    { label: "Cod. fornecedor", value: (row) => row.codFornec ?? "-" },
    { label: "Fornecedor", headerClassName: "min-w-[260px]", cellClassName: "max-w-[320px] whitespace-normal break-words", value: (row) => row.fornecedor || "-" },
    { label: "Conta", value: (row) => row.conta || "-" },
    { label: "Cod. conta", value: (row) => row.codConta ?? "-" },
    { label: "Historico", headerClassName: "min-w-[240px]", cellClassName: "max-w-[280px] whitespace-normal break-words text-xs text-muted-foreground", value: (row) => row.historico || "-" },
    { label: "Valor rateado", value: (row) => money(row.valorCentroCusto) },
    { label: "Valor lancamento", value: (row) => money(row.valorLanc) },
    { label: "Recnum", value: (row) => row.recnum ?? "-" },
  ];

  const colunasFluxoNiveis = [
    { label: "Periodo", value: (row) => row.periodo || "-" },
    { label: "Granularidade", value: (row) => row.granularidade || "-" },
    { label: "Contas a pagar", value: (row) => money(row.contasAPagarRegistrado) },
    { label: "Recorrencias estimadas", value: (row) => money(row.recorrenciasEstimadasNaoLancadas) },
    { label: "Total projetado", cellClassName: "font-semibold", value: (row) => money(row.totalProjetado) },
    { label: "Risco", value: (row) => row.risco || "-" },
    { label: "Observacao", headerClassName: "min-w-[220px]", cellClassName: "max-w-[280px] whitespace-normal break-words text-xs text-muted-foreground", value: (row) => row.observacao || "-" },
  ];

  const colunasRecorrenciasNiveis = [
    { label: "DTVENC", value: (row) => row.dtVencimento ? datePtBr(row.dtVencimento, false) : "Sem vencimento informado" },
    { label: "Cod. filial", value: (row) => row.codFilial ?? "-" },
    { label: "Cod. fornecedor", value: (row) => row.codFornec ?? "-" },
    { label: "Fornecedor", headerClassName: "min-w-[240px]", cellClassName: "max-w-[300px] whitespace-normal break-words", value: (row) => row.fornecedor || "-" },
    { label: "Conta", value: (row) => row.conta || "-" },
    { label: "Cod. conta", value: (row) => row.codConta ?? "-" },
    { label: "Qtd pagamentos", value: (row) => row.qtdPagamentos ?? 0 },
    { label: "Media historica", value: (row) => money(row.valorMedioHistorico) },
    { label: "Ultimo pagamento", value: (row) => datePtBr(row.ultimoPagamento, false) },
    { label: "Prox. vencimento estimado", value: (row) => datePtBr(row.proximoVencimentoEstimado, true) },
    { label: "Risco", value: (row) => row.risco || "-" },
    { label: "Comentario", headerClassName: "min-w-[260px]", cellClassName: "max-w-[320px] whitespace-normal break-words text-xs text-muted-foreground", value: (row) => row.comentario || "-" },
  ];

  const colunasAbertoNiveis = [
    { label: "Vencimento", value: (row) => row.dtVencimento ? datePtBr(row.dtVencimento, false) : "Sem vencimento informado" },
    { label: "DTVENC", value: (row) => row.dtVencimento ? datePtBr(row.dtVencimento, false) : "Sem vencimento informado" },
    { label: "Cod. filial", value: (row) => row.codFilial ?? "-" },
    { label: "Cod. fornecedor", value: (row) => row.codFornec ?? "-" },
    { label: "Fornecedor", headerClassName: "min-w-[240px]", cellClassName: "max-w-[300px] whitespace-normal break-words", value: (row) => row.fornecedor || "-" },
    { label: "Conta", value: (row) => row.conta || "-" },
    { label: "Cod. conta", value: (row) => row.codConta ?? "-" },
    { label: "Historico", headerClassName: "min-w-[220px]", cellClassName: "max-w-[280px] whitespace-normal break-words text-xs text-muted-foreground", value: (row) => row.historico || "-" },
    { label: "Num. nota", value: (row) => row.numNota || "-" },
    { label: "Valor rateado", value: (row) => money(row.valorCentroCusto) },
    { label: "Valor lancamento", value: (row) => money(row.valorLanc) },
    { label: "Recnum", value: (row) => row.recnum ?? "-" },
  ];

  const colunasHistoricoNiveis = [
    { label: "Data pagamento", value: (row) => datePtBr(row.dtPagto, false) },
    { label: "DTVENC", value: (row) => row.dtVencimento ? datePtBr(row.dtVencimento, false) : "Sem vencimento informado" },
    { label: "Cod. filial", value: (row) => row.codFilial ?? "-" },
    { label: "Cod. fornecedor", value: (row) => row.codFornec ?? "-" },
    { label: "Fornecedor", headerClassName: "min-w-[240px]", cellClassName: "max-w-[300px] whitespace-normal break-words", value: (row) => row.fornecedor || "-" },
    { label: "Conta", value: (row) => row.conta || "-" },
    { label: "Cod. conta", value: (row) => row.codConta ?? "-" },
    { label: "Centro custo", value: (row) => row.codCentroCusto || "-" },
    { label: "Historico", headerClassName: "min-w-[220px]", cellClassName: "max-w-[280px] whitespace-normal break-words text-xs text-muted-foreground", value: (row) => row.historico || "-" },
    { label: "Num. nota", value: (row) => row.numNota || "-" },
    { label: "Valor rateado", value: (row) => money(row.valorCentroCusto) },
    { label: "Valor lancamento", value: (row) => money(row.valorLanc) },
    { label: "Recnum", value: (row) => row.recnum ?? "-" },
  ];

  return hs("div", {
    className: "space-y-6 animate-fade-in",
    children: [
      hs("div", {
        children: [
          h("h1", { className: "text-2xl font-bold text-foreground", children: "Financeiro-TI" }),
          h("p", {
            className: "text-sm text-muted-foreground mt-1",
            children: "Fluxo de pagamentos, recorrencias e riscos de furo no caixa de TI.",
          }),
        ],
      }),
      hs(Card, {
        children: [
          hs(CardHeader, {
            className: "pb-3",
            children: [
              h(CardTitle, { children: "Filtros da analise" }),
              h("p", { className: "text-xs text-muted-foreground", children: "Use os filtros para cruzar historico, em aberto e estimativas." }),
            ],
          }),
          hs(CardContent, {
            className: "space-y-3",
            children: [
              hs("div", {
                className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3",
                children: [
                  hs("label", { className: "text-xs text-muted-foreground", children: ["Data inicial", h("input", { className: "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm", type: "date", value: filters.dataInicial, onChange: (event) => onFilterChange("dataInicial", event.target.value) })] }),
                  hs("label", { className: "text-xs text-muted-foreground", children: ["Data final", h("input", { className: "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm", type: "date", value: filters.dataFinal, onChange: (event) => onFilterChange("dataFinal", event.target.value) })] }),
                  hs("label", { className: "text-xs text-muted-foreground", children: ["Fornecedor", h("input", { className: "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm", placeholder: "Nome do fornecedor", value: filters.fornecedor, onChange: (event) => onFilterChange("fornecedor", event.target.value) })] }),
                  hs("label", { className: "text-xs text-muted-foreground", children: ["Cod. fornecedor", h("input", { className: "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm", placeholder: "Ex.: 123", value: filters.codFornec, onChange: (event) => onFilterChange("codFornec", event.target.value.replace(/[^\d]/g, "")) })] }),
                  hs("label", { className: "text-xs text-muted-foreground", children: ["Cod. conta", h("input", { className: "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm", placeholder: "Ex.: 210101", value: filters.codConta, onChange: (event) => onFilterChange("codConta", event.target.value.replace(/[^\d]/g, "")) })] }),
                ],
              }),
              hs("div", {
                className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3",
                children: [
                  hs("label", { className: "text-xs text-muted-foreground", children: ["Centro de custo", h("input", { className: "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm", placeholder: "Ex.: 5.1.11", value: filters.centroCusto, onChange: (event) => onFilterChange("centroCusto", event.target.value) })] }),
                  hs("label", { className: "text-xs text-muted-foreground", children: ["Grupo conta", h("input", { className: "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm", placeholder: "Ex.: 200", value: filters.grupoConta, onChange: (event) => onFilterChange("grupoConta", event.target.value.replace(/[^\d]/g, "")) })] }),
                  hs("label", { className: "text-xs text-muted-foreground", children: ["Risco", hs("select", { className: "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm", value: filters.risco, onChange: (event) => onFilterChange("risco", event.target.value), children: [h("option", { value: "", children: "Todos" }), h("option", { value: "ALTO", children: "Alto" }), h("option", { value: "MEDIO", children: "Medio" }), h("option", { value: "BAIXO", children: "Baixo" })] })] }),
                  hs("label", { className: "text-xs text-muted-foreground", children: ["Status", hs("select", { className: "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm", value: filters.status, onChange: (event) => onFilterChange("status", event.target.value), children: [h("option", { value: "", children: "Todos" }), h("option", { value: "PAGO", children: "Pago" }), h("option", { value: "EM_ABERTO", children: "Em aberto" }), h("option", { value: "RECORRENCIA_ESTIMADA", children: "Recorrencia estimada" })] })] }),
                  hs("label", { className: "text-xs text-muted-foreground", children: ["Tipo de analise", hs("select", { className: "mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm", value: filters.tipoAnalise, onChange: (event) => onFilterChange("tipoAnalise", event.target.value), children: [h("option", { value: "TODOS", children: "Todos" }), h("option", { value: "OFICIAL_LANCADO", children: "Oficial lancado" }), h("option", { value: "ESTIMADO_HISTORICO", children: "Estimado por historico" })] })] }),
                ],
              }),
              hs("div", {
                className: "flex flex-wrap gap-2",
                children: [
                  hs("label", { className: "text-xs text-muted-foreground", children: ["Visao do fluxo", hs("select", { className: "mt-1 w-full min-w-[180px] rounded-md border bg-background px-3 py-2 text-sm", value: filters.visao, onChange: (event) => onFilterChange("visao", event.target.value), children: [h("option", { value: "TODOS", children: "Semanal + Mensal" }), h("option", { value: "SEMANAL", children: "Semanal" }), h("option", { value: "MENSAL", children: "Mensal" })] })] }),
                  h(Button, { type: "button", onClick: applyFilters, children: loading ? "Atualizando..." : "Aplicar filtros" }),
                  h(Button, { type: "button", variant: "outline", onClick: clearFilters, children: "Limpar filtros" }),
                ],
              }),
            ],
          }),
        ],
      }),
      errorMessage
        ? h("div", { className: "rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive", children: errorMessage })
        : null,
      !vencimentoDisponivel
        ? h("div", {
            className: "rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900",
            children: "Atencao: base sem coluna de vencimento oficial detectada. Projecoes de aberto usam classificacao sem vencimento informado e estimativas por historico.",
          })
        : null,

      h("p", {
        className: "text-xs text-muted-foreground",
        children: "Dica: clique em cards, barras ou linhas das tabelas para abrir a origem/historico que gerou cada informacao.",
      }),

      hs("div", {
        className: "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4",
        children: [
          h(KpiCard, { title: "Total pago no historico", value: money(resumo.totalPagoHistorico), onClick: openTotalPago }),
          h(KpiCard, { title: "Total em aberto registrado", value: money(resumo.totalAbertoRegistrado), onClick: openTotalAberto }),
          h(KpiCard, { title: "Recorrencias estimadas nao lancadas", value: money(resumo.totalRecorrenciasEstimadas), onClick: openRecorrencias }),
          h(KpiCard, { title: "Total projetado", value: money(resumo.totalProjetado), onClick: openTotalProjetado }),
          h(KpiCard, { title: "Fornecedores recorrentes ausentes", value: String(resumo.qtdFornecedoresRecorrentesAusentes ?? 0), onClick: openRecorrencias }),
          h(KpiCard, { title: "Concentracao top 5", value: percent(resumo.percentualConcentracaoTop5), onClick: openTop5Concentracao }),
          h(KpiCard, { title: "Maior risco identificado", value: resumo.maiorRisco || "-", onClick: openMaiorRisco }),
          h(KpiCard, { title: "Registros historicos", value: String(historico.length), subtitle: `${aberto.length} em aberto`, onClick: openRegistroHistorico }),
        ],
      }),

      hs("div", {
        className: "space-y-2",
        children: [
          h("p", {
            className: "text-sm font-medium text-foreground",
            children: "Historico mensal pago (ultimos 5 meses)",
          }),
          historicoUltimosCincoMeses.length === 0
            ? h("p", {
                className: "text-sm text-muted-foreground",
                children: loading ? "Carregando..." : "Sem pagamentos para montar historico mensal.",
              })
            : hs("div", {
                className: "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4",
                children: historicoUltimosCincoMeses.map((item) =>
                  h(KpiCard, {
                    title: item.titulo,
                    value: money(item.totalPago),
                    subtitle: `Total do mes: ${money(item.totalLancamento)}`,
                    onClick: () => openHistoricoMensalPago(item),
                  }, item.key)),
              }),
        ],
      }),

      hs("div", {
        className: "space-y-2",
        children: [
          h("p", {
            className: "text-sm font-medium text-foreground",
            children: "Fluxo mensal lancado (atrasados + mes atual + proximos 3 meses)",
          }),
          hs("div", {
            className: "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4",
            children: projecaoQuatroMeses.map((item) =>
              h(KpiCard, {
                title: item.titulo,
                value: money(item.contasAPagarRegistrado),
                subtitle: item.isAtrasado
                  ? `Total atrasado: ${money(item.totalProjetado)}`
                  : `Total do mes: ${money(item.totalProjetado)}`,
                onClick: () => openProjecaoMensal(item),
              }, item.key || item.mes)),
          }),
        ],
      }),

      hs(Card, {
        className: "cursor-pointer transition hover:bg-muted/20",
        onClick: openResumoExecutivo,
        children: [
          hs(CardHeader, {
            className: "pb-2",
            children: [
              h(CardTitle, { children: "Resumo executivo" }),
              h("p", { className: "text-sm text-muted-foreground", children: resumo.resumoExecutivo || "Sem dados para os filtros aplicados." }),
            ],
          }),
          h(CardContent, {
            children: h("p", {
              className: "text-xs text-muted-foreground",
              children: "Valores de recorrencia sao estimativos e nao representam titulos oficiais lancados no contas a pagar.",
            }),
          }),
        ],
      }),

      hs(Card, {
        children: [
          hs(CardHeader, {
            className: "pb-2",
            children: [
              h(CardTitle, { children: "Agrupamento por Grupo de Conta" }),
              h("p", {
                className: "text-xs text-muted-foreground",
                children: "1o nivel: GRUPOCONTA | 2o nivel: CONTA gerencial | 3o nivel: detalhamento de lancamentos.",
              }),
            ],
          }),
          h(CardContent, {
            children: agrupamentoGrupoConta.length === 0
              ? h("p", {
                  className: "text-sm text-muted-foreground",
                  children: loading ? "Carregando..." : "Sem lancamentos para agrupar no periodo selecionado.",
                })
              : h("div", {
                  className: "space-y-3",
                  children: agrupamentoGrupoConta.map((grupo) =>
                    hs("details", {
                      className: "rounded-md border bg-muted/20",
                      children: [
                        hs("summary", {
                          className: "cursor-pointer select-none list-none px-3 py-2 hover:bg-muted/30",
                          children: [
                            hs("div", {
                              className: "grid grid-cols-1 md:grid-cols-5 gap-2 text-sm",
                              children: [
                                h("span", { className: "font-medium text-foreground", children: grupo.label }),
                                h("span", { className: "text-muted-foreground", children: `Contas: ${grupo.qtdContas}` }),
                                h("span", { className: "text-muted-foreground", children: `Lancamentos: ${grupo.qtdLancamentos}` }),
                                h("span", { children: `Valor rateado: ${money(grupo.totalRateado)}` }),
                                h("span", { children: `Valor lancamento: ${money(grupo.totalLanc)}` }),
                              ],
                            }),
                          ],
                        }),
                        h("div", {
                          className: "space-y-2 p-3 pt-0",
                          children: grupo.contas.map((conta) =>
                            hs("details", {
                              className: "rounded-md border bg-background",
                              children: [
                                hs("summary", {
                                  className: "cursor-pointer select-none list-none px-3 py-2 hover:bg-muted/20",
                                  children: [
                                    hs("div", {
                                      className: "grid grid-cols-1 md:grid-cols-5 gap-2 text-sm",
                                      children: [
                                        h("span", { className: "font-medium text-foreground", children: conta.conta }),
                                        h("span", { className: "text-muted-foreground", children: `Cod. conta: ${conta.codConta}` }),
                                        h("span", { className: "text-muted-foreground", children: `Lancamentos: ${conta.qtdLancamentos}` }),
                                        h("span", { children: `Valor rateado: ${money(conta.totalRateado)}` }),
                                        h("span", { children: `Valor lancamento: ${money(conta.totalLanc)}` }),
                                      ],
                                    }),
                                  ],
                                }),
                                h("div", {
                                  className: "p-3 pt-0",
                                  children: hs("div", {
                                    className: "max-w-full overflow-auto",
                                    children: hs(Table, {
                                      className: "min-w-[1180px]",
                                      children: [
                                        h(TableHeader, {
                                          children: hs(TableRow, {
                                            children: [
                                              h(TableHead, { children: "Data ref." }),
                                              h(TableHead, { children: "Origem" }),
                                              h(TableHead, { children: "Cod. filial" }),
                                              h(TableHead, { children: "Cod. fornecedor" }),
                                              h(TableHead, { children: "Fornecedor" }),
                                              h(TableHead, { children: "Historico" }),
                                              h(TableHead, { children: "Num. nota" }),
                                              h(TableHead, { children: "Valor rateado" }),
                                              h(TableHead, { children: "Valor lancamento" }),
                                              h(TableHead, { children: "Recnum" }),
                                            ],
                                          }),
                                        }),
                                        h(TableBody, {
                                          children: conta.detalhes.map((item, index) =>
                                            hs(TableRow, {
                                              className: "cursor-pointer hover:bg-muted/30",
                                              onClick: () => (item.__origem === "EM_ABERTO" ? openAbertoItem(item) : openHistoricoItem(item)),
                                              children: [
                                                h(TableCell, { children: datePtBr(item.dtVencimento || item.dtPagto || item.dtLanc, false) }),
                                                h(TableCell, { children: item.__origem === "EM_ABERTO" ? "Em aberto" : "Pago" }),
                                                h(TableCell, { children: item.codFilial ?? "-" }),
                                                h(TableCell, { children: item.codFornec ?? "-" }),
                                                h(TableCell, { className: "max-w-[320px] whitespace-normal break-words", children: item.fornecedor || "-" }),
                                                h(TableCell, { className: "max-w-[280px] whitespace-normal break-words", children: item.historico || "-" }),
                                                h(TableCell, { children: item.numNota || "-" }),
                                                h(TableCell, { children: money(item.valorCentroCusto) }),
                                                h(TableCell, { children: money(item.valorLanc) }),
                                                h(TableCell, { children: item.recnum ?? "-" }),
                                              ],
                                            }, `${conta.key}-${item.recnum ?? "sem-recnum"}-${index}`)),
                                        }),
                                      ],
                                    }),
                                  }),
                                }),
                              ],
                            }, `${grupo.key}-${conta.key}`)),
                        }),
                      ],
                    }, grupo.key)),
                }),
          }),
        ],
      }),

      hs(Card, {
        children: [
          hs(CardHeader, {
            className: "pb-2",
            children: [
              h(CardTitle, { children: "Evolucao mensal dos pagamentos" }),
              h("p", {
                className: "text-xs text-muted-foreground",
                children: "1o nivel: Mes de pagamento | 2o nivel: CONTA gerencial | 3o nivel: lancamentos pagos.",
              }),
            ],
          }),
          h(CardContent, {
            children: renderNiveisEmAbas({
              itens: niveisEvolucao,
              emptyText: "Sem pagamentos no periodo selecionado.",
              level1CountLabel: "Contas",
              level2CountLabel: "Lancamentos",
              primaryLabel: "Valor pago",
              secondaryLabel: "Valor lancamento",
              columns: colunasEvolucaoNiveis,
              onRowClick: openHistoricoItem,
              rowKey: (row, rowIndex) => `evolucao-${row.recnum ?? "sem-recnum"}-${rowIndex}`,
              tableClassName: "min-w-[1280px]",
            }),
          }),
        ],
      }),

      hs(Card, {
        children: [
          hs(CardHeader, {
            className: "pb-2 flex flex-row items-center justify-between",
            children: [
              hs("div", {
                children: [
                  h(CardTitle, { children: "Fluxo de pagamento projetado" }),
                  h("p", {
                    className: "text-xs text-muted-foreground",
                    children: "1o nivel: Granularidade | 2o nivel: Periodo | 3o nivel: linhas projetadas.",
                  }),
                ],
              }),
              h(Button, {
                type: "button",
                variant: "outline",
                "data-no-drilldown": "true",
                onClick: exportFluxo,
                children: "Exportar CSV",
              }),
            ],
          }),
          h(CardContent, {
            children: renderNiveisEmAbas({
              itens: niveisFluxoProjetado,
              emptyText: "Sem dados para fluxo projetado.",
              level1CountLabel: "Periodos",
              level2CountLabel: "Linhas",
              primaryLabel: "Contas a pagar",
              secondaryLabel: "Total projetado",
              columns: colunasFluxoNiveis,
              onRowClick: openFluxoItem,
              rowKey: (row, rowIndex) => `fluxo-${row.periodo ?? "sem-periodo"}-${row.granularidade ?? "sem-gran"}-${rowIndex}`,
              tableClassName: "min-w-[1120px]",
            }),
          }),
        ],
      }),

      hs(Card, {
        children: [
          hs(CardHeader, {
            className: "pb-2 flex flex-row items-center justify-between",
            children: [
              hs("div", {
                children: [
                  h(CardTitle, { children: "Pagamentos recorrentes ausentes" }),
                  h("p", {
                    className: "text-xs text-muted-foreground",
                    children: "1o nivel: Risco | 2o nivel: CONTA gerencial | 3o nivel: recorrencias estimadas.",
                  }),
                ],
              }),
              h(Button, {
                type: "button",
                variant: "outline",
                "data-no-drilldown": "true",
                onClick: exportRecorrencias,
                children: "Exportar CSV",
              }),
            ],
          }),
          h(CardContent, {
            children: renderNiveisEmAbas({
              itens: niveisRecorrencias,
              emptyText: "Nenhuma recorrencia ausente para os filtros atuais.",
              level1CountLabel: "Contas",
              level2CountLabel: "Registros",
              primaryLabel: "Media historica",
              secondaryLabel: "Media historica",
              columns: colunasRecorrenciasNiveis,
              onRowClick: openRecorrenciaItem,
              rowKey: (row, rowIndex) => `recorrencia-${row.codFornec ?? "sf"}-${row.codConta ?? "sc"}-${rowIndex}`,
              tableClassName: "min-w-[1480px]",
            }),
          }),
        ],
      }),

      hs(Card, {
        children: [
          hs(CardHeader, {
            className: "pb-2",
            children: [
              h(CardTitle, { children: "Contas a pagar em aberto x Historico de pagamentos" }),
            ],
          }),
          h(CardContent, {
            children: hs("details", {
              className: "rounded-md border bg-background",
              open: true,
              children: [
                h("summary", {
                  className: "cursor-pointer select-none list-none px-3 py-2 text-xs text-muted-foreground hover:bg-muted/20",
                  children: "Alinhamento 1:1 por filial + fornecedor + conta. Sem correspondencia, lado direito fica em branco.",
                }),
                abertoComHistoricoAlinhado.length === 0
                  ? h("div", { className: "h-24" })
                  : h("div", {
                      className: "max-w-full overflow-auto border-t",
                      children: hs(Table, {
                        className: "min-w-[1760px]",
                        children: [
                          h(TableHeader, {
                            children: [
                              hs(TableRow, {
                                children: [
                                  h(TableHead, { colSpan: 7, className: "border-r text-sm font-semibold text-foreground", children: "Contas a pagar em aberto (DTPAGTO nulo)" }),
                                  h(TableHead, { colSpan: 7, className: "text-sm font-semibold text-foreground", children: "Historico de pagamentos (DTPAGTO preenchido)" }),
                                ],
                              }),
                              hs(TableRow, {
                                children: [
                                  h(TableHead, { children: "Filial" }),
                                  h(TableHead, { children: "Cod. fornecedor" }),
                                  h(TableHead, { className: "min-w-[260px]", children: "Fornecedor" }),
                                  h(TableHead, { children: "Num. nota" }),
                                  h(TableHead, { className: "min-w-[220px]", children: "Conta" }),
                                  h(TableHead, { children: "DTVENC" }),
                                  h(TableHead, { className: "border-r", children: "Valor aberto" }),
                                  h(TableHead, { children: "Filial" }),
                                  h(TableHead, { children: "Cod. fornecedor" }),
                                  h(TableHead, { className: "min-w-[260px]", children: "Fornecedor" }),
                                  h(TableHead, { children: "Num. nota" }),
                                  h(TableHead, { className: "min-w-[220px]", children: "Conta" }),
                                  h(TableHead, { children: "Dt. pagamento" }),
                                  h(TableHead, { children: "Valor pago" }),
                                ],
                              }),
                            ],
                          }),
                          h(TableBody, {
                            children: abertoComHistoricoAlinhado.map((pair, index) => {
                              const hist = pair.historico;
                              return hs(TableRow, {
                                className: "align-top",
                                children: [
                                  h(TableCell, { className: "cursor-pointer hover:bg-muted/30", onClick: () => openAbertoItem(pair.aberto), children: pair.aberto?.codFilial ?? "-" }),
                                  h(TableCell, { className: "cursor-pointer hover:bg-muted/30", onClick: () => openAbertoItem(pair.aberto), children: pair.aberto?.codFornec ?? "-" }),
                                  h(TableCell, { className: "max-w-[280px] whitespace-normal break-words cursor-pointer hover:bg-muted/30", onClick: () => openAbertoItem(pair.aberto), children: pair.aberto?.fornecedor || "-" }),
                                  h(TableCell, { className: "cursor-pointer hover:bg-muted/30", onClick: () => openAbertoItem(pair.aberto), children: pair.aberto?.numNota || "-" }),
                                  h(TableCell, { className: "max-w-[240px] whitespace-normal break-words cursor-pointer hover:bg-muted/30", onClick: () => openAbertoItem(pair.aberto), children: pair.aberto?.conta || "-" }),
                                  h(TableCell, { className: "cursor-pointer hover:bg-muted/30", onClick: () => openAbertoItem(pair.aberto), children: pair.aberto?.dtVencimento ? datePtBr(pair.aberto.dtVencimento, false) : "Sem vencimento" }),
                                  h(TableCell, { className: "font-semibold border-r cursor-pointer hover:bg-muted/30", onClick: () => openAbertoItem(pair.aberto), children: money(pair.aberto?.valorCentroCusto) }),

                                  h(TableCell, { className: hist ? "cursor-pointer hover:bg-muted/30" : "", onClick: hist ? () => openHistoricoItem(hist) : void 0, children: hist?.codFilial ?? "" }),
                                  h(TableCell, { className: hist ? "cursor-pointer hover:bg-muted/30" : "", onClick: hist ? () => openHistoricoItem(hist) : void 0, children: hist?.codFornec ?? "" }),
                                  h(TableCell, { className: `max-w-[280px] whitespace-normal break-words ${hist ? "cursor-pointer hover:bg-muted/30" : ""}`, onClick: hist ? () => openHistoricoItem(hist) : void 0, children: hist?.fornecedor || "" }),
                                  h(TableCell, { className: hist ? "cursor-pointer hover:bg-muted/30" : "", onClick: hist ? () => openHistoricoItem(hist) : void 0, children: hist?.numNota || "" }),
                                  h(TableCell, { className: `max-w-[240px] whitespace-normal break-words ${hist ? "cursor-pointer hover:bg-muted/30" : ""}`, onClick: hist ? () => openHistoricoItem(hist) : void 0, children: hist?.conta || "" }),
                                  h(TableCell, { className: hist ? "cursor-pointer hover:bg-muted/30" : "", onClick: hist ? () => openHistoricoItem(hist) : void 0, children: hist ? datePtBr(hist.dtPagto || hist.dtLanc || null, false) : "" }),
                                  h(TableCell, { className: `font-semibold ${hist ? "cursor-pointer hover:bg-muted/30" : ""}`, onClick: hist ? () => openHistoricoItem(hist) : void 0, children: hist ? money(hist.valorCentroCusto) : "" }),
                                ],
                              }, `par-open-paid-${pair.aberto?.recnum ?? "sem-recnum"}-${index}`);
                            }),
                          }),
                        ],
                      }),
                    }),
              ],
            }),
          }),
        ],
      }),

      hs(Card, {
        children: [
          hs(CardHeader, {
            className: "pb-2",
            children: [
              h(CardTitle, { children: "Resumo por fornecedor" }),
              h("p", {
                className: "text-xs text-muted-foreground",
                children: "1o nivel: linha Resumo por fornecedor | 2o nivel: cod. fornecedor + fornecedor + total pago + total em aberto + total geral | 3o nivel: detalhamento dos lancamentos pagos e em aberto.",
              }),
            ],
          }),
          h(CardContent, {
            children: resumoPorFornecedor.length === 0
              ? h("p", { className: "text-sm text-muted-foreground", children: loading ? "Carregando..." : "Sem dados de fornecedor para os filtros aplicados." })
              : hs("details", {
                  className: "rounded-md border bg-background",
                  open: true,
                  children: [
                    h("summary", {
                      className: "cursor-pointer select-none list-none px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/20",
                      children: "Resumo por fornecedor",
                    }),
                    h("div", {
                      className: "space-y-3 p-3 pt-0",
                      children: resumoPorFornecedor.map((fornecedor) =>
                        hs("details", {
                          className: "rounded-md border bg-muted/20",
                          children: [
                            hs("summary", {
                              className: "cursor-pointer select-none list-none px-3 py-2 hover:bg-muted/30",
                              children: [
                                hs("div", {
                                  className: "grid grid-cols-1 md:grid-cols-5 gap-2 text-sm",
                                  children: [
                                    h("span", { className: "font-medium text-foreground", children: `${fornecedor.codFornec} - ${fornecedor.fornecedor}` }),
                                    h("span", { className: "text-muted-foreground", children: `Lancamentos: ${fornecedor.detalhes.length}` }),
                                    h("span", { children: `Total pago: ${money(fornecedor.totalPago)}` }),
                                    h("span", { children: `Total em aberto: ${money(fornecedor.totalAberto)}` }),
                                    h("span", { children: `Total geral: ${money(fornecedor.totalGeral)}` }),
                                  ],
                                }),
                              ],
                            }),
                            h("div", {
                              className: "p-3 pt-0",
                              children: h("div", {
                                className: "max-w-full overflow-auto",
                                children: hs(Table, {
                                  className: "min-w-[1600px]",
                                  children: [
                                    h(TableHeader, {
                                      children: hs(TableRow, {
                                        children: [
                                          h(TableHead, { children: "Origem" }),
                                          h(TableHead, { children: "Data ref." }),
                                          h(TableHead, { children: "Cod. filial" }),
                                          h(TableHead, { children: "Num. nota" }),
                                          h(TableHead, { className: "min-w-[220px]", children: "Conta" }),
                                          h(TableHead, { children: "DTVENC" }),
                                          h(TableHead, { children: "Dt. pagamento" }),
                                          h(TableHead, { className: "min-w-[260px]", children: "Historico" }),
                                          h(TableHead, { children: "Valor rateado" }),
                                          h(TableHead, { children: "Valor lancamento" }),
                                          h(TableHead, { children: "Recnum" }),
                                        ],
                                      }),
                                    }),
                                    h(TableBody, {
                                      children: fornecedor.detalhes.length === 0
                                        ? h(TableRow, { children: h(TableCell, { colSpan: 11, className: "text-center text-muted-foreground py-6", children: "Sem detalhamento para este fornecedor." }) })
                                        : fornecedor.detalhes.map((item, index) =>
                                            hs(TableRow, {
                                              className: "cursor-pointer hover:bg-muted/30 align-top",
                                              onClick: () => (item.__origem === "EM_ABERTO" ? openAbertoItem(item) : openHistoricoItem(item)),
                                              children: [
                                                h(TableCell, { children: item.__origem === "EM_ABERTO" ? "Em aberto" : "Pago" }),
                                                h(TableCell, { children: datePtBr(item.dtVencimento || item.dtPagto || item.dtLanc, false) }),
                                                h(TableCell, { children: item.codFilial ?? "-" }),
                                                h(TableCell, { children: item.numNota || "-" }),
                                                h(TableCell, { className: "max-w-[260px] whitespace-normal break-words", children: item.conta || "-" }),
                                                h(TableCell, { children: item.dtVencimento ? datePtBr(item.dtVencimento, false) : "Sem vencimento" }),
                                                h(TableCell, { children: item.dtPagto ? datePtBr(item.dtPagto, false) : "-" }),
                                                h(TableCell, { className: "max-w-[300px] whitespace-normal break-words text-xs text-muted-foreground", children: item.historico || "-" }),
                                                h(TableCell, { children: money(item.__valorRateado) }),
                                                h(TableCell, { children: money(item.__valorLanc) }),
                                                h(TableCell, { children: item.recnum ?? "-" }),
                                              ],
                                            }, `${fornecedor.key}-${item.recnum ?? "sem-recnum"}-${index}`)),
                                    }),
                                  ],
                                }),
                              }),
                            }),
                          ],
                        }, fornecedor.key)),
                    }),
                  ],
                }),
          }),
        ],
      }),

      hs(Card, {
        className: "cursor-pointer transition hover:bg-muted/20",
        onClick: (event) => onContainerDrilldown(event, openTodosAlertas),
        children: [
          hs(CardHeader, { className: "pb-2", children: [h(CardTitle, { children: "Alertas gerenciais" }), h("p", { className: "text-xs text-muted-foreground", children: "Use os alertas para decidir ajustes de provisao e lancamento." })] }),
          h(CardContent, {
            children: hs(Table, {
              children: [
                h(TableHeader, { children: hs(TableRow, { children: [h(TableHead, { children: "Tipo" }), h(TableHead, { children: "Mensagem" }), h(TableHead, { children: "Valor envolvido" }), h(TableHead, { children: "Risco" }), h(TableHead, { children: "Acao recomendada" })] }) }),
                hs(TableBody, {
                  children: [
                    alertas.length === 0
                      ? h(TableRow, { children: h(TableCell, { colSpan: 5, className: "text-center text-muted-foreground py-8", children: loading ? "Carregando..." : "Sem alertas para os filtros aplicados." }) })
                      : null,
                    ...alertas.map((item, index) =>
                      hs(TableRow, {
                        className: "cursor-pointer hover:bg-muted/30",
                        onClick: () => openAlertaItem(item),
                        children: [
                          h(TableCell, { className: "font-medium", children: item.tipo || "-" }),
                          h(TableCell, { className: "text-sm", children: item.mensagem || "-" }),
                          h(TableCell, { className: "font-semibold", children: money(item.valor) }),
                          h(TableCell, { children: item.risco || "-" }),
                          h(TableCell, { className: "text-xs text-muted-foreground", children: item.acaoRecomendada || "-" }),
                        ],
                      }, `${item.tipo ?? "ALERTA"}-${index}`)),
                  ],
                }),
              ],
            }),
          }),
        ],
      }),

      h(DrilldownModal, { state: drilldown, onClose: closeDrilldown }),
    ],
  });
}

export default FinanceiroTiPage;
