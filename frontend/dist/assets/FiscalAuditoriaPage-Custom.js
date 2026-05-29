import { r as React, j as jsxRuntime, J as Card, N as CardContent, B as Button } from "./index-Cw1PFMX8.js";
import { I as Input } from "./input-CnWhQnjH.js";
import { L as Label } from "./label-CRMrAwdj.js";

const h = jsxRuntime.jsx;
const hs = jsxRuntime.jsxs;

function getToken() { try { return JSON.parse(localStorage.getItem("sgq.authSession") || "{}").token || ""; } catch { return ""; } }
async function apiFetch(path, opts) {
    const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(opts?.headers || {}) } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || json?.message || `Erro ${res.status}`);
    return json;
}

function formatDateTime(value) {
    if (!value) return "-";
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString("pt-BR");
}

function truncar(str, n) {
    if (!str) return "-";
    return String(str).length > n ? String(str).slice(0, n) + "..." : String(str);
}

const ACOES_DISPONIVEIS = [
    "CONSULTA_DOCUMENTO",
    "VISUALIZACAO_XML",
    "DOWNLOAD_XML",
    "EXPORTACAO_CSV_NFE",
    "EXPORTACAO_CSV_CTE",
    "MANIFESTACAO_TRANSMITIDA",
    "APROVACAO_MANIFESTACAO",
    "IMPORTAR_DOCUMENTO",
    "REPROCESSAR_DOCUMENTO",
    "CADASTRO_CNPJ",
    "CADASTRO_CERTIFICADO",
    "CRIAR_DIVERGENCIA",
    "FINALIZAR_DIVERGENCIA",
    "IA_GERAR_PARECER",
    "SYNC_NFE_MANUAL",
    "SYNC_CTE_MANUAL",
];

const ENTIDADES_DISPONIVEIS = [
    "NFE",
    "CTE",
    "NFCE",
    "MDFE",
    "XML_VAULT",
    "DIVERGENCIA",
    "WORKFLOW",
    "CERTIFICADO",
    "CNPJ",
    "MANIFESTACAO",
];

function acaoBadge(acao) {
    const leitura = ["CONSULTA_DOCUMENTO", "VISUALIZACAO_XML", "DOWNLOAD_XML"];
    const exportacao = ["EXPORTACAO_CSV_NFE", "EXPORTACAO_CSV_CTE"];
    const escrita = ["IMPORTAR_DOCUMENTO", "REPROCESSAR_DOCUMENTO", "CADASTRO_CNPJ", "CADASTRO_CERTIFICADO", "CRIAR_DIVERGENCIA", "FINALIZAR_DIVERGENCIA", "SYNC_NFE_MANUAL", "SYNC_CTE_MANUAL"];
    const aprovacao = ["MANIFESTACAO_TRANSMITIDA", "APROVACAO_MANIFESTACAO"];
    const ia = ["IA_GERAR_PARECER"];

    let bg = "#f1f5f9", color = "#475569";
    if (leitura.includes(acao)) { bg = "#dbeafe"; color = "#1e40af"; }
    else if (exportacao.includes(acao)) { bg = "#ede9fe"; color = "#5b21b6"; }
    else if (escrita.includes(acao)) { bg = "#fef3c7"; color = "#92400e"; }
    else if (aprovacao.includes(acao)) { bg = "#dcfce7"; color = "#166534"; }
    else if (ia.includes(acao)) { bg = "#fce7f3"; color = "#9d174d"; }

    return h("span", {
        style: { background: bg, color, padding: "2px 8px", borderRadius: 9999, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" },
        children: String(acao || "-").replace(/_/g, " "),
    });
}

function resultadoBadge(resultado) {
    if (resultado === "OK" || resultado === "SUCESSO") {
        return h("span", { style: { background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: 9999, fontSize: 12, fontWeight: 600 }, children: resultado });
    }
    if (resultado === "ERRO" || resultado === "FALHA") {
        return h("span", { style: { background: "#fee2e2", color: "#991b1b", padding: "2px 8px", borderRadius: 9999, fontSize: 12, fontWeight: 600 }, children: resultado });
    }
    return h("span", { style: { background: "#f1f5f9", color: "#475569", padding: "2px 8px", borderRadius: 9999, fontSize: 12, fontWeight: 600 }, children: resultado || "-" });
}

function DetalheModal({ log, onClose }) {
    if (!log) return null;

    function renderValor(val) {
        if (val == null) return h("span", { style: { color: "#94a3b8" }, children: "null" });
        if (typeof val === "object") {
            return h("pre", { style: { margin: 0, fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-all", background: "#f8fafc", padding: 8, borderRadius: 6 }, children: JSON.stringify(val, null, 2) });
        }
        return h("span", { style: { wordBreak: "break-all" }, children: String(val) });
    }

    const camposDetalhe = [
        ["ID", log.id],
        ["Usuário", log.usuario],
        ["Ação", log.acao],
        ["Entidade", log.entidade],
        ["Chave Documento", log.chaveDocumento || log.chave],
        ["IP", log.ip],
        ["Data/Hora", formatDateTime(log.dataHora || log.createdAt || log.created_at)],
        ["Resultado", log.resultado],
        ["Motivo", log.motivo],
        ["Erro", log.erro],
        ["Antes", log.antes || log.estadoAntes],
        ["Depois", log.depois || log.estadoDepois],
        ["User Agent", log.userAgent],
        ["Sessão", log.sessaoId || log.sessionId],
        ["Observação", log.observacao],
    ].filter(([, val]) => val != null && val !== "");

    return h("div", {
        style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
        onClick: onClose,
        children: hs("div", {
            style: { background: "#fff", borderRadius: 10, padding: 24, width: 680, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto" },
            onClick: e => e.stopPropagation(),
            children: [
                hs("div", {
                    style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
                    children: [
                        h("h2", { style: { fontSize: 16, fontWeight: 700, margin: 0 }, children: "Detalhes do Log de Auditoria" }),
                        h(Button, { variant: "outline", size: "sm", onClick: onClose, children: "Fechar" }),
                    ],
                }),
                h("table", {
                    style: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
                    children: h("tbody", {
                        children: camposDetalhe.map(([label, val]) => hs("tr", {
                            style: { borderBottom: "1px solid #f1f5f9" },
                            children: [
                                h("td", { style: { padding: "8px 10px", fontWeight: 600, color: "#475569", whiteSpace: "nowrap", verticalAlign: "top", width: "35%" }, children: label }),
                                h("td", { style: { padding: "8px 10px", color: "#1e293b" }, children: renderValor(val) }),
                            ],
                        }, label)),
                    }),
                }),
            ],
        }),
    });
}

function FiscalAuditoriaPage() {
    const [dados, setDados] = React.useState(null);
    const [loading, setLoading] = React.useState(false);
    const [erro, setErro] = React.useState("");
    const [filtros, setFiltros] = React.useState({ usuario: "", acao: "", entidade: "", dataInicio: "", dataFim: "", busca: "" });
    const [detalheLog, setDetalheLog] = React.useState(null);
    const [pagina, setPagina] = React.useState(1);

    async function carregar(pg) {
        const p = pg || pagina;
        setLoading(true);
        setErro("");
        try {
            const params = new URLSearchParams();
            Object.entries(filtros).forEach(([k, v]) => { if (v) params.set(k, v); });
            params.set("page", String(p));
            const qs = params.toString() ? `?${params}` : "";
            const data = await apiFetch(`/api/fiscal/auditoria${qs}`);
            setDados(data);
        } catch (e) {
            setErro(e.message);
        } finally {
            setLoading(false);
        }
    }

    React.useEffect(() => { carregar(1); }, []);

    function filtrar() {
        setPagina(1);
        carregar(1);
    }

    function limpar() {
        setFiltros({ usuario: "", acao: "", entidade: "", dataInicio: "", dataFim: "", busca: "" });
        setPagina(1);
    }

    function irPagina(p) {
        setPagina(p);
        carregar(p);
    }

    const lista = dados?.logs || dados?.registros || [];
    const paginacao = dados?.paginacao || null;

    return hs("div", {
        style: { padding: 24, maxWidth: 1400, margin: "0 auto" },
        children: [
            // Banner jurídico
            hs("div", {
                style: { background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: "12px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 },
                children: [
                    h("span", { style: { fontSize: 18 }, children: "⚖️" }),
                    h("span", { style: { fontWeight: 600, color: "#991b1b", fontSize: 14 }, children: "Todos os acessos e ações são registrados para fins jurídicos e de compliance." }),
                ],
            }),

            hs("div", {
                style: { marginBottom: 20 },
                children: [
                    h("h1", { style: { fontSize: 22, fontWeight: 700, color: "#1e293b", margin: 0 }, children: "Auditoria Jurídica" }),
                    h("p", { style: { fontSize: 14, color: "#64748b", marginTop: 4 }, children: "Rastreio completo de todas as ações executadas no sistema fiscal, com trilha de auditoria imutável." }),
                ],
            }),

            // Filtros
            h(Card, {
                style: { marginBottom: 20 },
                children: h(CardContent, {
                    style: { padding: 16 },
                    children: hs("div", {
                        style: { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" },
                        children: [
                            hs("div", {
                                children: [
                                    h(Label, { children: "Usuário" }),
                                    h(Input, { value: filtros.usuario, onChange: e => setFiltros(p => ({ ...p, usuario: e.target.value })), placeholder: "Nome ou matrícula...", style: { height: 36, width: 160 } }),
                                ],
                            }),
                            hs("div", {
                                children: [
                                    h(Label, { children: "Ação" }),
                                    h("select", {
                                        value: filtros.acao,
                                        onChange: e => setFiltros(p => ({ ...p, acao: e.target.value })),
                                        style: { height: 36, border: "1px solid #e2e8f0", borderRadius: 6, padding: "0 8px", fontSize: 14, maxWidth: 220 },
                                        children: [
                                            h("option", { value: "", children: "Todas" }),
                                            ...ACOES_DISPONIVEIS.map(a => h("option", { value: a, key: a, children: a.replace(/_/g, " ") })),
                                        ],
                                    }),
                                ],
                            }),
                            hs("div", {
                                children: [
                                    h(Label, { children: "Entidade" }),
                                    h("select", {
                                        value: filtros.entidade,
                                        onChange: e => setFiltros(p => ({ ...p, entidade: e.target.value })),
                                        style: { height: 36, border: "1px solid #e2e8f0", borderRadius: 6, padding: "0 8px", fontSize: 14 },
                                        children: [
                                            h("option", { value: "", children: "Todas" }),
                                            ...ENTIDADES_DISPONIVEIS.map(e => h("option", { value: e, key: e, children: e.replace(/_/g, " ") })),
                                        ],
                                    }),
                                ],
                            }),
                            hs("div", {
                                children: [
                                    h(Label, { children: "Data Início" }),
                                    h(Input, { type: "date", value: filtros.dataInicio, onChange: e => setFiltros(p => ({ ...p, dataInicio: e.target.value })), style: { height: 36 } }),
                                ],
                            }),
                            hs("div", {
                                children: [
                                    h(Label, { children: "Data Fim" }),
                                    h(Input, { type: "date", value: filtros.dataFim, onChange: e => setFiltros(p => ({ ...p, dataFim: e.target.value })), style: { height: 36 } }),
                                ],
                            }),
                            hs("div", { style: { flex: 1, minWidth: 160 },
                                children: [
                                    h(Label, { children: "Busca por chave" }),
                                    h(Input, { value: filtros.busca, onChange: e => setFiltros(p => ({ ...p, busca: e.target.value })), placeholder: "Chave de acesso...", style: { height: 36 } }),
                                ],
                            }),
                            h(Button, { onClick: filtrar, style: { background: "#2563eb", color: "#fff", height: 36 }, children: "Filtrar" }),
                            h(Button, { variant: "outline", onClick: limpar, style: { height: 36 }, children: "Limpar" }),
                        ],
                    }),
                }),
            }),

            erro ? h("div", { style: { color: "#991b1b", background: "#fee2e2", padding: 12, borderRadius: 8, marginBottom: 16 }, children: erro }) : null,
            loading ? h("div", { style: { textAlign: "center", padding: 40, color: "#64748b" }, children: "Carregando..." }) : null,

            // Tabela
            !loading && h(Card, {
                children: h(CardContent, {
                    style: { padding: 0, overflowX: "auto" },
                    children: h("table", {
                        style: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
                        children: hs("tbody", {
                            children: [
                                h("tr", {
                                    style: { background: "#f8fafc", borderBottom: "1px solid #e2e8f0" },
                                    children: [
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#475569" }, children: "ID" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#475569" }, children: "Usuário" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#475569" }, children: "Ação" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#475569" }, children: "Entidade" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#475569" }, children: "Chave Documento" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#475569" }, children: "IP" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#475569" }, children: "Data/Hora" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#475569" }, children: "Resultado" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#475569" }, children: "Detalhes" }),
                                    ],
                                }),
                                ...lista.length === 0
                                    ? [h("tr", { children: h("td", { colSpan: 9, style: { padding: 40, textAlign: "center", color: "#64748b" }, children: "Nenhum registro de auditoria encontrado." }) })]
                                    : lista.map((row, idx) => hs("tr", {
                                        style: { borderBottom: "1px solid #f1f5f9", cursor: "pointer" },
                                        onClick: () => setDetalheLog(row),
                                        children: [
                                            h("td", { style: { padding: "8px 12px" }, children: row.id }),
                                            h("td", { style: { padding: "8px 12px", fontWeight: 600 }, children: row.usuario || row.user || "-" }),
                                            h("td", { style: { padding: "8px 12px" }, children: acaoBadge(row.acao || row.action) }),
                                            h("td", { style: { padding: "8px 12px", color: "#475569" }, children: String(row.entidade || row.entity || "-").replace(/_/g, " ") }),
                                            h("td", { style: { padding: "8px 12px", fontFamily: "monospace", fontSize: 12 }, children: truncar(row.chaveDocumento || row.chave || row.documentKey, 18) }),
                                            h("td", { style: { padding: "8px 12px", fontFamily: "monospace", fontSize: 12 }, children: row.ip || "-" }),
                                            h("td", { style: { padding: "8px 12px", whiteSpace: "nowrap" }, children: formatDateTime(row.dataHora || row.createdAt || row.created_at) }),
                                            h("td", { style: { padding: "8px 12px" }, children: resultadoBadge(row.resultado || row.result) }),
                                            h("td", { style: { padding: "8px 12px" }, children: h(Button, { variant: "outline", size: "sm", onClick: e => { e.stopPropagation(); setDetalheLog(row); }, style: { fontSize: 12 }, children: "Ver" }) }),
                                        ],
                                    }, row.id || idx)),
                            ],
                        }),
                    }),
                }),
            }),

            // Paginação
            !loading && paginacao && hs("div", {
                style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, fontSize: 13, color: "#64748b" },
                children: [
                    hs("span", {
                        children: ["Página ", paginacao.page || pagina, " de ", paginacao.totalPages || 1, " (", paginacao.totalItems || lista.length, " registros)"],
                    }),
                    hs("div", {
                        style: { display: "flex", gap: 8 },
                        children: [
                            h(Button, { variant: "outline", size: "sm", disabled: pagina <= 1, onClick: () => irPagina(pagina - 1), children: "Anterior" }),
                            h(Button, { variant: "outline", size: "sm", disabled: pagina >= (paginacao.totalPages || 1), onClick: () => irPagina(pagina + 1), children: "Próxima" }),
                        ],
                    }),
                ],
            }),

            detalheLog ? h(DetalheModal, { log: detalheLog, onClose: () => setDetalheLog(null) }) : null,
        ],
    });
}

export default FiscalAuditoriaPage;
