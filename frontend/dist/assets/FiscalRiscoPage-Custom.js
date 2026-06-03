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
    return d.toLocaleDateString("pt-BR");
}

function classificacaoBadge(cls) {
    const map = {
        CRITICO: { bg: "#fee2e2", color: "#991b1b" },
        ALTO: { bg: "#fef3c7", color: "#92400e" },
        ATENCAO: { bg: "#dbeafe", color: "#1e40af" },
        BAIXO: { bg: "#dcfce7", color: "#166534" },
    };
    const style = map[cls] || { bg: "#f3f4f6", color: "#374151" };
    return h("span", {
        style: { background: style.bg, color: style.color, padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700, whiteSpace: "nowrap" },
        children: cls || "-",
    });
}

function scoreColor(score) {
    const s = Number(score || 0);
    if (s >= 80) return "#991b1b";
    if (s >= 60) return "#92400e";
    if (s >= 40) return "#1e40af";
    return "#166534";
}

function ScoreBar({ score }) {
    const s = Math.min(100, Math.max(0, Number(score || 0)));
    const color = scoreColor(s);
    return hs("div", {
        style: { display: "flex", alignItems: "center", gap: 8 },
        children: [
            hs("div", {
                style: { width: 80, height: 10, background: "#e5e7eb", borderRadius: 5, overflow: "hidden" },
                children: [
                    h("div", { style: { width: `${s}%`, height: "100%", background: color, borderRadius: 5, transition: "width 0.3s" } }),
                ],
            }),
            h("span", { style: { fontSize: 12, fontWeight: 700, color, minWidth: 28 }, children: s }),
        ],
    });
}

function KpiCard({ title, value, bg, color }) {
    return hs("div", {
        style: { background: bg || "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "16px 20px", minWidth: 120 },
        children: [
            h("div", { style: { fontSize: 12, color: color ? "#fff" : "#6b7280", marginBottom: 4, opacity: color ? 0.85 : 1 }, children: title }),
            h("div", { style: { fontSize: 22, fontWeight: 700, color: color || "#111827" }, children: value }),
        ],
    });
}

function truncar(str, n) {
    if (!str) return "-";
    return String(str).length > n ? String(str).slice(0, n) + "..." : String(str);
}

function FiscalRiscoPage() {
    const [dados, setDados] = React.useState(null);
    const [loading, setLoading] = React.useState(false);
    const [erro, setErro] = React.useState("");
    const [filtroClass, setFiltroClass] = React.useState("");

    async function carregar() {
        setLoading(true);
        setErro("");
        try {
            const qs = filtroClass ? `?classificacao=${filtroClass}` : "";
            const data = await apiFetch(`/api/fiscal/risco${qs}`);
            setDados(data);
        } catch (e) {
            setErro(e.message);
        } finally {
            setLoading(false);
        }
    }

    React.useEffect(() => { carregar(); }, []);

    const kpis = dados?.kpis || {};
    const documentos = dados?.documentos || [];
    const fornecedores = dados?.rankingFornecedores || [];
    const regras = dados?.regras || [];

    const docsFiltrados = filtroClass
        ? documentos.filter(d => d.classificacao === filtroClass)
        : documentos;

    return hs("div", {
        style: { padding: 24, maxWidth: 1400, margin: "0 auto" },
        children: [
            hs("div", {
                style: { marginBottom: 20 },
                children: [
                    h("h1", { style: { fontSize: 22, fontWeight: 700, color: "#111827", margin: 0 }, children: "Motor de Risco Fiscal" }),
                    h("p", { style: { fontSize: 14, color: "#6b7280", marginTop: 4 }, children: "Ranking de documentos fiscais por score de risco calculado pelas regras ativas." }),
                ],
            }),

            // KPIs
            hs("div", {
                style: { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 },
                children: [
                    h(KpiCard, { title: "Documentos Analisados", value: kpis.total ?? 0 }),
                    h(KpiCard, { title: "Críticos", value: kpis.criticos ?? 0, color: "#991b1b" }),
                    h(KpiCard, { title: "Alto", value: kpis.alto ?? 0, color: "#92400e" }),
                    h(KpiCard, { title: "Atenção", value: kpis.atencao ?? 0, color: "#1e40af" }),
                    h(KpiCard, { title: "Baixo", value: kpis.baixo ?? 0, color: "#166534" }),
                ],
            }),

            // Filtro classificação
            hs("div", {
                style: { display: "flex", gap: 8, alignItems: "center", marginBottom: 16 },
                children: [
                    h(Label, { children: "Filtrar classificação:" }),
                    h("select", {
                        value: filtroClass,
                        onChange: e => setFiltroClass(e.target.value),
                        style: { height: 36, border: "1px solid #e5e7eb", borderRadius: 6, padding: "0 8px", fontSize: 14 },
                        children: [
                            h("option", { value: "", children: "Todos" }),
                            h("option", { value: "CRITICO", children: "Crítico" }),
                            h("option", { value: "ALTO", children: "Alto" }),
                            h("option", { value: "ATENCAO", children: "Atenção" }),
                            h("option", { value: "BAIXO", children: "Baixo" }),
                        ],
                    }),
                    h(Button, { onClick: carregar, style: { background: "#2563eb", color: "#fff", height: 36 }, children: "Atualizar" }),
                ],
            }),

            erro ? h("div", { style: { color: "#991b1b", background: "#fee2e2", padding: 12, borderRadius: 8, marginBottom: 16 }, children: erro }) : null,
            loading ? h("div", { style: { textAlign: "center", padding: 40, color: "#6b7280" }, children: "Carregando..." }) : null,

            // Tabela Principal - Ranking de documentos
            !loading && hs(Card, {
                style: { marginBottom: 24 },
                children: [
                    h("div", { style: { padding: "16px 20px 8px", fontWeight: 700, fontSize: 15, color: "#111827" }, children: "Ranking de Documentos por Risco" }),
                    h(CardContent, {
                        style: { padding: 0, overflowX: "auto" },
                        children: h("table", {
                            style: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
                            children: hs("tbody", {
                                children: [
                                    h("tr", {
                                        style: { background: "#f9fafb", borderBottom: "1px solid #e5e7eb" },
                                        children: [
                                            h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "#" }),
                                            h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "Chave" }),
                                            h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "Tipo" }),
                                            h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "Emitente" }),
                                            h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "Score" }),
                                            h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "Classificação" }),
                                            h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "Data Cálculo" }),
                                        ],
                                    }),
                                    ...docsFiltrados.length === 0
                                        ? [h("tr", { children: h("td", { colSpan: 7, style: { padding: 40, textAlign: "center", color: "#6b7280" }, children: "Nenhum documento encontrado." }) })]
                                        : docsFiltrados.map((doc, idx) => h("tr", {
                                            style: { borderBottom: "1px solid #f3f4f6" },
                                            children: [
                                                h("td", { style: { padding: "8px 12px", fontWeight: 700, color: "#6b7280" }, children: idx + 1 }),
                                                h("td", { style: { padding: "8px 12px", fontFamily: "monospace", fontSize: 12 }, children: truncar(doc.chave, 20) }),
                                                h("td", { style: { padding: "8px 12px" }, children: h("span", { style: { background: "#dbeafe", color: "#1e40af", padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700 }, children: doc.tipo || "-" }) }),
                                                h("td", { style: { padding: "8px 12px" }, children: truncar(doc.emitente, 30) }),
                                                h("td", { style: { padding: "8px 12px" }, children: h(ScoreBar, { score: doc.score }) }),
                                                h("td", { style: { padding: "8px 12px" }, children: classificacaoBadge(doc.classificacao) }),
                                                h("td", { style: { padding: "8px 12px" }, children: formatDate(doc.dataCalculo) }),
                                            ],
                                        }, doc.id || idx)),
                                ],
                            }),
                        }),
                    }),
                ],
            }),

            // Ranking Fornecedores de Risco
            !loading && hs(Card, {
                style: { marginBottom: 24 },
                children: [
                    h("div", { style: { padding: "16px 20px 8px", fontWeight: 700, fontSize: 15, color: "#111827" }, children: "Ranking Fornecedores de Risco (Top 10)" }),
                    h(CardContent, {
                        style: { padding: 0, overflowX: "auto" },
                        children: h("table", {
                            style: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
                            children: hs("tbody", {
                                children: [
                                    h("tr", {
                                        style: { background: "#f9fafb", borderBottom: "1px solid #e5e7eb" },
                                        children: [
                                            h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "#" }),
                                            h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "Nome / Razão Social" }),
                                            h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "CNPJ" }),
                                            h("th", { style: { padding: "10px 12px", textAlign: "center", fontWeight: 600, color: "#374151" }, children: "Score Médio" }),
                                            h("th", { style: { padding: "10px 12px", textAlign: "center", fontWeight: 600, color: "#374151" }, children: "Qtd. Docs" }),
                                        ],
                                    }),
                                    ...fornecedores.length === 0
                                        ? [h("tr", { children: h("td", { colSpan: 5, style: { padding: 40, textAlign: "center", color: "#6b7280" }, children: "Sem dados de fornecedores." }) })]
                                        : fornecedores.slice(0, 10).map((f, idx) => h("tr", {
                                            style: { borderBottom: "1px solid #f3f4f6" },
                                            children: [
                                                h("td", { style: { padding: "8px 12px", fontWeight: 700, color: "#6b7280" }, children: idx + 1 }),
                                                h("td", { style: { padding: "8px 12px" }, children: f.nome || f.razaoSocial || "-" }),
                                                h("td", { style: { padding: "8px 12px", fontFamily: "monospace", fontSize: 12 }, children: f.cnpj || "-" }),
                                                h("td", { style: { padding: "8px 12px", textAlign: "center" }, children: h(ScoreBar, { score: f.scoreMedia ?? f.scoreMedio }) }),
                                                h("td", { style: { padding: "8px 12px", textAlign: "center", fontWeight: 600 }, children: f.quantidade ?? f.qtd ?? "-" }),
                                            ],
                                        }, f.cnpj || idx)),
                                ],
                            }),
                        }),
                    }),
                ],
            }),

            // Regras Ativas
            !loading && hs(Card, {
                children: [
                    h("div", { style: { padding: "16px 20px 8px", fontWeight: 700, fontSize: 15, color: "#111827" }, children: "Regras Ativas" }),
                    h(CardContent, {
                        style: { padding: 0, overflowX: "auto" },
                        children: h("table", {
                            style: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
                            children: hs("tbody", {
                                children: [
                                    h("tr", {
                                        style: { background: "#f9fafb", borderBottom: "1px solid #e5e7eb" },
                                        children: [
                                            h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "Código" }),
                                            h("th", { style: { padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }, children: "Descrição" }),
                                            h("th", { style: { padding: "10px 12px", textAlign: "center", fontWeight: 600, color: "#374151" }, children: "Pontos" }),
                                        ],
                                    }),
                                    ...regras.length === 0
                                        ? [h("tr", { children: h("td", { colSpan: 3, style: { padding: 40, textAlign: "center", color: "#6b7280" }, children: "Nenhuma regra ativa cadastrada." }) })]
                                        : regras.map((r, idx) => h("tr", {
                                            style: { borderBottom: "1px solid #f3f4f6" },
                                            children: [
                                                h("td", { style: { padding: "8px 12px", fontFamily: "monospace", fontWeight: 600 }, children: r.codigo || r.code || "-" }),
                                                h("td", { style: { padding: "8px 12px", color: "#374151" }, children: r.descricao || r.description || "-" }),
                                                h("td", { style: { padding: "8px 12px", textAlign: "center", fontWeight: 700, color: scoreColor(r.pontos || 0) }, children: r.pontos ?? r.points ?? "-" }),
                                            ],
                                        }, r.id || r.codigo || idx)),
                                ],
                            }),
                        }),
                    }),
                ],
            }),
        ],
    });
}

export default FiscalRiscoPage;
