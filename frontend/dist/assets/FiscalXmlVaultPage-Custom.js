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

function formatDate(value) {
    if (!value) return "-";
    const d = new Date(value);
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString("pt-BR");
}

function formatBytes(bytes) {
    const n = Number(bytes || 0);
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function truncar(str, n) {
    if (!str) return "-";
    return String(str).length > n ? String(str).slice(0, n) + "..." : String(str);
}

function statusBadge(status) {
    if (status === "ATIVO") return h("span", { style: { background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700 }, children: "ATIVO" });
    return h("span", { style: { background: "#f3f4f6", color: "#6b7280", padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700 }, children: status || "INATIVO" });
}

function KpiCard({ title, value }) {
    return hs("div", {
        style: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "16px 20px", minWidth: 120 },
        children: [
            h("div", { style: { fontSize: 12, color: "#6b7280", marginBottom: 4 }, children: title }),
            h("div", { style: { fontSize: 22, fontWeight: 700, color: "#111827" }, children: value }),
        ],
    });
}

function MetadataModal({ xml, onClose }) {
    if (!xml) return null;
    const exclude = ["conteudoXml", "xml", "conteudo", "rawXml", "xmlContent"];
    const campos = Object.entries(xml).filter(([k]) => !exclude.includes(k));

    return h("div", {
        style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
        onClick: onClose,
        children: hs("div", {
            style: { background: "#fff", borderRadius: 10, padding: 24, width: 640, maxWidth: "95vw", maxHeight: "85vh", overflowY: "auto" },
            onClick: e => e.stopPropagation(),
            children: [
                hs("div", {
                    style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
                    children: [
                        h("h2", { style: { fontSize: 16, fontWeight: 700, margin: 0 }, children: "Metadados do XML" }),
                        h(Button, { variant: "outline", size: "sm", onClick: onClose, children: "Fechar" }),
                    ],
                }),
                h("table", {
                    style: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
                    children: h("tbody", {
                        children: campos.map(([key, val]) => hs("tr", {
                            style: { borderBottom: "1px solid #f3f4f6" },
                            children: [
                                h("td", { style: { padding: "6px 10px", fontWeight: 600, color: "#374151", whiteSpace: "nowrap", width: "40%" }, children: key }),
                                h("td", { style: { padding: "6px 10px", color: "#111827", wordBreak: "break-all" }, children: val == null ? h("span", { style: { color: "#94a3b8" }, children: "null" }) : String(val) }),
                            ],
                        }, key)),
                    }),
                }),
            ],
        }),
    });
}

function FiscalXmlVaultPage() {
    const [dados, setDados] = React.useState(null);
    const [loading, setLoading] = React.useState(false);
    const [erro, setErro] = React.useState("");
    const [filtros, setFiltros] = React.useState({ tipoDfe: "", status: "", dataInicio: "", dataFim: "", busca: "" });
    const [metaModal, setMetaModal] = React.useState(null);
    const [validacaoMsg, setValidacaoMsg] = React.useState({});
    const [validacaoLoading, setValidacaoLoading] = React.useState({});

    async function carregar() {
        setLoading(true);
        setErro("");
        try {
            const params = new URLSearchParams();
            Object.entries(filtros).forEach(([k, v]) => { if (v) params.set(k, v); });
            const qs = params.toString() ? `?${params}` : "";
            const data = await apiFetch(`/api/fiscal/xml-vault${qs}`);
            setDados(data);
        } catch (e) {
            setErro(e.message);
        } finally {
            setLoading(false);
        }
    }

    React.useEffect(() => { carregar(); }, []);

    async function validarHash(id) {
        setValidacaoLoading(p => ({ ...p, [id]: true }));
        setValidacaoMsg(p => ({ ...p, [id]: "" }));
        try {
            const res = await apiFetch(`/api/fiscal/xml-vault/${id}/validar-hash`, { method: "POST" });
            setValidacaoMsg(p => ({ ...p, [id]: res.valido ? "Hash válido" : "Hash INVÁLIDO!" }));
        } catch (e) {
            setValidacaoMsg(p => ({ ...p, [id]: `Erro: ${e.message}` }));
        } finally {
            setValidacaoLoading(p => ({ ...p, [id]: false }));
        }
    }

    const kpis = dados?.kpis || {};
    const lista = dados?.xmls || dados?.registros || [];

    return hs("div", {
        style: { padding: 24, maxWidth: 1400, margin: "0 auto" },
        children: [
            // Banner
            hs("div", {
                style: { background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: 8, padding: "12px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 },
                children: [
                    h("span", { style: { fontSize: 18 }, children: "⚠️" }),
                    h("span", { style: { fontWeight: 600, color: "#92400e", fontSize: 14 }, children: "XML fiscal é evidência jurídica. Exclusão física não é permitida." }),
                ],
            }),

            hs("div", {
                style: { marginBottom: 20 },
                children: [
                    h("h1", { style: { fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }, children: "Cofre Fiscal — XML Vault" }),
                    h("p", { style: { fontSize: 14, color: "#6b7280", marginTop: 4 }, children: "Repositório imutável de XMLs fiscais com validação de integridade por hash SHA-256." }),
                ],
            }),

            // KPIs
            hs("div", {
                style: { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 },
                children: [
                    h(KpiCard, { title: "Total XMLs", value: kpis.total ?? 0 }),
                    h(KpiCard, { title: "Ativos", value: kpis.ativos ?? 0 }),
                    h(KpiCard, { title: "NF-e", value: kpis.nfe ?? 0 }),
                    h(KpiCard, { title: "CT-e", value: kpis.cte ?? 0 }),
                    h(KpiCard, { title: "NFC-e", value: kpis.nfce ?? 0 }),
                    h(KpiCard, { title: "MDF-e", value: kpis.mdfe ?? 0 }),
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
                                    h(Label, { children: "Tipo DFe" }),
                                    h("select", {
                                        value: filtros.tipoDfe,
                                        onChange: e => setFiltros(p => ({ ...p, tipoDfe: e.target.value })),
                                        style: { height: 36, border: "1px solid #e5e7eb", borderRadius: 6, padding: "0 8px", fontSize: 14 },
                                        children: [
                                            h("option", { value: "", children: "Todos" }),
                                            h("option", { value: "NFE", children: "NF-e" }),
                                            h("option", { value: "CTE", children: "CT-e" }),
                                            h("option", { value: "NFCE", children: "NFC-e" }),
                                            h("option", { value: "MDFE", children: "MDF-e" }),
                                        ],
                                    }),
                                ],
                            }),
                            hs("div", {
                                children: [
                                    h(Label, { children: "Status" }),
                                    h("select", {
                                        value: filtros.status,
                                        onChange: e => setFiltros(p => ({ ...p, status: e.target.value })),
                                        style: { height: 36, border: "1px solid #e5e7eb", borderRadius: 6, padding: "0 8px", fontSize: 14 },
                                        children: [
                                            h("option", { value: "", children: "Todos" }),
                                            h("option", { value: "ATIVO", children: "Ativo" }),
                                            h("option", { value: "INATIVO", children: "Inativo" }),
                                        ],
                                    }),
                                ],
                            }),
                            hs("div", {
                                children: [
                                    h(Label, { children: "Capturado de" }),
                                    h(Input, { type: "date", value: filtros.dataInicio, onChange: e => setFiltros(p => ({ ...p, dataInicio: e.target.value })), style: { height: 36 } }),
                                ],
                            }),
                            hs("div", {
                                children: [
                                    h(Label, { children: "Capturado até" }),
                                    h(Input, { type: "date", value: filtros.dataFim, onChange: e => setFiltros(p => ({ ...p, dataFim: e.target.value })), style: { height: 36 } }),
                                ],
                            }),
                            hs("div", { style: { flex: 1, minWidth: 180 },
                                children: [
                                    h(Label, { children: "Busca por chave" }),
                                    h(Input, { value: filtros.busca, onChange: e => setFiltros(p => ({ ...p, busca: e.target.value })), placeholder: "Chave de acesso...", style: { height: 36 } }),
                                ],
                            }),
                            h(Button, { onClick: carregar, style: { background: "#2563eb", color: "#fff", height: 36 }, children: "Filtrar" }),
                            h(Button, { variant: "outline", onClick: () => setFiltros({ tipoDfe: "", status: "", dataInicio: "", dataFim: "", busca: "" }), style: { height: 36 }, children: "Limpar" }),
                        ],
                    }),
                }),
            }),

            erro ? h("div", { style: { color: "#991b1b", background: "#fee2e2", padding: 12, borderRadius: 8, marginBottom: 16 }, children: erro }) : null,
            loading ? h("div", { style: { textAlign: "center", padding: 40, color: "#6b7280" }, children: "Carregando..." }) : null,

            // Tabela
            !loading && h(Card, {
                children: h(CardContent, {
                    style: { padding: 0, overflowX: "auto" },
                    children: h("table", {
                        style: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
                        children: hs("tbody", {
                            children: [
                                h("tr", {
                                    style: { background: "#f9fafb", borderBottom: "1px solid #e5e7eb" },
                                    children: [
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "ID" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "Chave" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "Tipo DFe" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "Tipo XML" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "Hash SHA-256" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "Tamanho" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "Capturado em" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "Status" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "Origem" }),
                                        h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "Ações" }),
                                    ],
                                }),
                                ...lista.length === 0
                                    ? [h("tr", { children: h("td", { colSpan: 10, style: { padding: 40, textAlign: "center", color: "#6b7280" }, children: "Nenhum XML encontrado." }) })]
                                    : lista.map(row => h("tr", {
                                        style: { borderBottom: "1px solid #f3f4f6" },
                                        children: [
                                            h("td", { style: { padding: "8px 12px" }, children: row.id }),
                                            h("td", { style: { padding: "8px 12px", fontFamily: "monospace", fontSize: 12 }, children: truncar(row.chave || row.chaveAcesso, 22) }),
                                            h("td", { style: { padding: "8px 12px" }, children: h("span", { style: { background: "#dbeafe", color: "#1e40af", padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700 }, children: row.tipoDfe || "-" }) }),
                                            h("td", { style: { padding: "8px 12px", color: "#374151" }, children: row.tipoXml || row.tipo || "-" }),
                                            h("td", { style: { padding: "8px 12px", fontFamily: "monospace", fontSize: 11 }, children: truncar(row.hashSha256 || row.hash, 16) }),
                                            h("td", { style: { padding: "8px 12px" }, children: formatBytes(row.tamanho || row.size) }),
                                            h("td", { style: { padding: "8px 12px" }, children: formatDate(row.capturadoEm || row.createdAt || row.created_at) }),
                                            h("td", { style: { padding: "8px 12px" }, children: statusBadge(row.status) }),
                                            h("td", { style: { padding: "8px 12px", color: "#6b7280" }, children: row.origem || "-" }),
                                            hs("td", {
                                                style: { padding: "8px 12px", verticalAlign: "middle", whiteSpace: "nowrap" },
                                                children: hs("div", {
                                                    style: { display: "flex", gap: 4, alignItems: "center", flexWrap: "nowrap" },
                                                    children: [
                                                        h(Button, { key: "meta", variant: "outline", size: "sm", onClick: () => setMetaModal(row), style: { fontSize: 12, whiteSpace: "nowrap" }, children: "Ver Metadados" }),
                                                        h(Button, {
                                                            key: "hash",
                                                            variant: "outline",
                                                            size: "sm",
                                                            disabled: !!validacaoLoading[row.id],
                                                            onClick: () => validarHash(row.id),
                                                            style: { fontSize: 12, whiteSpace: "nowrap" },
                                                            children: validacaoLoading[row.id] ? "Validando..." : "Validar Hash",
                                                        }),
                                                        validacaoMsg[row.id] ? h("span", {
                                                            key: "msg",
                                                            style: { fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", color: validacaoMsg[row.id].includes("válido") && !validacaoMsg[row.id].includes("INVÁLIDO") ? "#166534" : "#991b1b" },
                                                            children: validacaoMsg[row.id],
                                                        }) : null,
                                                    ],
                                                }),
                                            }),
                                        ],
                                    }, row.id)),
                            ],
                        }),
                    }),
                }),
            }),

            metaModal ? h(MetadataModal, { xml: metaModal, onClose: () => setMetaModal(null) }) : null,
        ],
    });
}

export default FiscalXmlVaultPage;
