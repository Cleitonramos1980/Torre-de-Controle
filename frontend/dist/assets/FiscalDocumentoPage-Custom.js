import { r as React, j as jsxRuntime, J as Card, N as CardContent, B as Button } from "./index-Cw1PFMX8.js";

const h = jsxRuntime.jsx;
const hs = jsxRuntime.jsxs;

function getToken() { try { return JSON.parse(localStorage.getItem("sgq.authSession") || "{}").token || ""; } catch { return ""; } }
async function apiFetch(path, opts) {
    const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(opts?.headers || {}) } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || json?.message || `Erro ${res.status}`);
    return json;
}

function formatMoney(value) {
    const parsed = Number(value ?? 0);
    if (!Number.isFinite(parsed)) return "R$ 0,00";
    return parsed.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value) {
    if (!value) return "-";
    const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleDateString("pt-BR");
}

function formatDateTime(value) {
    if (!value) return "-";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString("pt-BR");
}

function scoreColor(score) {
    const n = Number(score ?? 0);
    if (n >= 76) return "#dc2626";
    if (n >= 51) return "#d97706";
    if (n >= 26) return "#2563eb";
    return "#16a34a";
}

function severidadeBadge(sev) {
    const map = {
        CRITICA: { background: "#fee2e2", color: "#991b1b" },
        ALTA: { background: "#fef3c7", color: "#92400e" },
        MEDIA: { background: "#dbeafe", color: "#1e40af" },
        BAIXA: { background: "#dcfce7", color: "#166534" },
    };
    const s = map[sev] || { background: "#f3f4f6", color: "#374151" };
    return h("span", { style: { ...s, padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700 }, children: sev || "—" });
}

function SectionTitle({ children }) {
    return h("h3", {
        style: { fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "hsl(var(--muted-foreground))", margin: "0 0 12px 0" },
        children,
    });
}

function Campo({ label, value }) {
    return hs("div", {
        style: { display: "flex", flexDirection: "column", gap: "2px" },
        children: [
            h("span", { style: { fontSize: "11px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }, children: label }),
            h("span", { style: { fontSize: "13px", fontWeight: 500 }, children: value ?? "—" }),
        ],
    });
}

function TabButton({ active, onClick, children }) {
    return h("button", {
        onClick,
        style: {
            padding: "8px 16px",
            fontSize: "13px",
            fontWeight: active ? 700 : 400,
            color: active ? "#2563eb" : "#6b7280",
            background: "none",
            border: "none",
            borderBottom: active ? "2px solid #2563eb" : "2px solid transparent",
            cursor: "pointer",
            whiteSpace: "nowrap",
        },
        children,
    });
}

function ModalObservacao({ onClose, onSalvar, chave }) {
    const [texto, setTexto] = React.useState("");
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState("");

    const salvar = async () => {
        if (!texto.trim()) { setErro("Informe a observação."); return; }
        setSalvando(true);
        setErro("");
        try {
            await apiFetch(`/api/fiscal/documentos/${chave}/observacao`, {
                method: "POST",
                body: JSON.stringify({ texto }),
            });
            onSalvar();
        } catch (e) {
            setErro(e.message || "Erro ao salvar.");
        } finally {
            setSalvando(false);
        }
    };

    return h("div", {
        style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" },
        onClick: onClose,
        children: h("div", {
            style: { background: "var(--background, #fff)", borderRadius: "10px", padding: "28px", width: "440px", maxWidth: "95vw", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" },
            onClick: (e) => e.stopPropagation(),
            children: hs("div", {
                style: { display: "flex", flexDirection: "column", gap: "14px" },
                children: [
                    h("h2", { style: { fontSize: "16px", fontWeight: 700, margin: 0 }, children: "Adicionar Observação" }),
                    h("textarea", {
                        value: texto,
                        onChange: (e) => setTexto(e.target.value),
                        placeholder: "Descreva a observação...",
                        rows: 4,
                        style: { padding: "8px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px", resize: "vertical" },
                    }),
                    erro ? h("p", { style: { fontSize: "13px", color: "#dc2626", margin: 0 }, children: erro }) : null,
                    hs("div", {
                        style: { display: "flex", justifyContent: "flex-end", gap: "8px" },
                        children: [
                            h(Button, { variant: "outline", onClick: onClose, children: "Cancelar" }),
                            h(Button, { onClick: salvar, disabled: salvando, children: salvando ? "Salvando..." : "Salvar" }),
                        ],
                    }),
                ],
            }),
        }),
    });
}

export default function FiscalDocumentoPage() {
    const chave = window.location.pathname.split("/").pop();

    const [doc, setDoc] = React.useState(null);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState("");
    const [abaAtiva, setAbaAtiva] = React.useState("geral");
    const [iaResultados, setIaResultados] = React.useState({});
    const [iaLoading, setIaLoading] = React.useState({});
    const [modalObs, setModalObs] = React.useState(false);
    const [acao, setAcao] = React.useState("");

    const carregar = React.useCallback(async () => {
        setErro("");
        try {
            const d = await apiFetch(`/api/fiscal/documentos/${chave}`);
            setDoc(d);
        } catch (e) {
            setErro(e.message || "Erro ao carregar documento.");
        } finally {
            setLoading(false);
        }
    }, [chave]);

    React.useEffect(() => { carregar(); }, [carregar]);

    const chamarIA = async (tipo) => {
        setIaLoading((prev) => ({ ...prev, [tipo]: true }));
        try {
            const d = await apiFetch(`/api/fiscal/ia/${tipo}`, {
                method: "POST",
                body: JSON.stringify({ chave }),
            });
            setIaResultados((prev) => ({ ...prev, [tipo]: d?.resultado || d?.texto || JSON.stringify(d) }));
        } catch (e) {
            setIaResultados((prev) => ({ ...prev, [tipo]: `Erro: ${e.message}` }));
        } finally {
            setIaLoading((prev) => ({ ...prev, [tipo]: false }));
        }
    };

    const executarAcao = async (tipo) => {
        setAcao(tipo);
        try {
            await apiFetch(`/api/fiscal/documentos/${chave}/${tipo}`, { method: "POST" });
            await carregar();
        } catch (e) {
            setErro(e.message || `Erro ao executar ação ${tipo}.`);
        } finally {
            setAcao("");
        }
    };

    if (loading) return h("div", { style: { padding: "40px", textAlign: "center", color: "hsl(var(--muted-foreground))", fontSize: "14px" }, children: "Carregando documento..." });
    if (erro && !doc) return h("div", { style: { padding: "24px" }, children: h("div", { style: { background: "#fee2e2", color: "#991b1b", padding: "14px 18px", borderRadius: "8px", fontSize: "13px" }, children: erro }) });

    const dados = doc || {};
    const divergencias = dados.divergencias || [];
    const regrasAplicadas = dados.regrasAplicadas || dados.risco?.regras || [];
    const auditoria = dados.auditoria || dados.logs || [];
    const workflow = dados.workflow || [];

    const abas = [
        { key: "geral", label: "Dados Gerais" },
        { key: "risco", label: "Risco" },
        { key: "manifestacao", label: "Manifestação" },
        { key: "conciliacao", label: "Conciliação" },
        { key: "divergencias", label: `Divergências (${divergencias.length})` },
        { key: "workflow", label: "Workflow" },
        { key: "auditoria", label: "Auditoria" },
        { key: "ia", label: "IA Fiscal" },
    ];

    return hs("div", {
        style: { padding: "24px", maxWidth: "1200px", margin: "0 auto" },
        children: [
            modalObs ? h(ModalObservacao, { chave, onClose: () => setModalObs(false), onSalvar: () => { setModalObs(false); carregar(); } }) : null,

            // Header
            hs("div", {
                style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", flexWrap: "wrap", gap: "12px" },
                children: [
                    hs("div", {
                        children: [
                            h("h1", { style: { fontSize: "20px", fontWeight: 700, margin: "0 0 4px 0" }, children: `Documento Fiscal — ${dados.tipo || ""}` }),
                            h("p", { style: { fontSize: "12px", color: "#6b7280", margin: 0, fontFamily: "monospace" }, children: chave }),
                        ],
                    }),
                    hs("div", {
                        style: { display: "flex", gap: "8px", flexWrap: "wrap" },
                        children: [
                            h(Button, { variant: "outline", disabled: acao === "reprocessar", onClick: () => executarAcao("reprocessar"), style: { fontSize: "12px" }, children: acao === "reprocessar" ? "Reprocessando..." : "Reprocessar" }),
                            h(Button, { variant: "outline", disabled: acao === "revisar", onClick: () => executarAcao("revisar"), style: { fontSize: "12px" }, children: acao === "revisar" ? "Revisando..." : "Revisar" }),
                            h(Button, { variant: "outline", onClick: () => setModalObs(true), style: { fontSize: "12px" }, children: "Adicionar Observação" }),
                        ],
                    }),
                ],
            }),

            erro ? h("div", { style: { background: "#fee2e2", color: "#991b1b", padding: "10px 14px", borderRadius: "6px", fontSize: "13px", marginBottom: "12px" }, children: erro }) : null,

            // Abas
            h(Card, {
                children: hs(CardContent, {
                    style: { padding: 0 },
                    children: [
                        // Navegação de abas
                        h("div", {
                            style: { display: "flex", borderBottom: "1px solid #e5e7eb", overflowX: "auto" },
                            children: abas.map((aba) => h(TabButton, { key: aba.key, active: abaAtiva === aba.key, onClick: () => setAbaAtiva(aba.key), children: aba.label })),
                        }),

                        // Conteúdo das abas
                        h("div", {
                            style: { padding: "20px" },
                            children: (() => {
                                if (abaAtiva === "geral") return h("div", {
                                    style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "16px" },
                                    children: [
                                        h(Campo, { label: "Tipo", value: dados.tipo }),
                                        h(Campo, { label: "Chave", value: dados.chave }),
                                        h(Campo, { label: "Número", value: dados.numero }),
                                        h(Campo, { label: "Série", value: dados.serie }),
                                        h(Campo, { label: "Emitente", value: dados.emitente }),
                                        h(Campo, { label: "CNPJ Emitente", value: dados.cnpjEmitente }),
                                        h(Campo, { label: "Destinatário", value: dados.destinatario }),
                                        h(Campo, { label: "CNPJ Dest.", value: dados.cnpjDestinatario }),
                                        h(Campo, { label: "Valor Total", value: formatMoney(dados.valor) }),
                                        h(Campo, { label: "Data Emissão", value: formatDate(dados.dataEmissao) }),
                                        h(Campo, { label: "Data Entrada", value: formatDate(dados.dataEntrada) }),
                                        h(Campo, { label: "Status SEFAZ", value: dados.statusSefaz }),
                                        h(Campo, { label: "Pedido WinThor", value: dados.pedidoWinthor }),
                                        h(Campo, { label: "Nota WinThor", value: dados.notaWinthor }),
                                        h(Campo, { label: "Natureza Operação", value: dados.naturezaOperacao }),
                                        h(Campo, { label: "CFOP", value: dados.cfop }),
                                        h(Campo, { label: "Base ICMS", value: formatMoney(dados.baseIcms) }),
                                        h(Campo, { label: "Valor ICMS", value: formatMoney(dados.valorIcms) }),
                                        h(Campo, { label: "Valor IPI", value: formatMoney(dados.valorIpi) }),
                                        h(Campo, { label: "Valor PIS", value: formatMoney(dados.valorPis) }),
                                        h(Campo, { label: "Valor COFINS", value: formatMoney(dados.valorCofins) }),
                                        h(Campo, { label: "Valor Frete", value: formatMoney(dados.valorFrete) }),
                                        h(Campo, { label: "Qtd. Itens", value: dados.qtdItens }),
                                        h(Campo, { label: "Protocolo", value: dados.protocolo }),
                                    ],
                                });

                                if (abaAtiva === "risco") {
                                    const score = dados.risco?.score ?? dados.score ?? 0;
                                    const pct = Math.min(100, Math.max(0, Number(score)));
                                    return hs("div", {
                                        style: { display: "flex", flexDirection: "column", gap: "20px" },
                                        children: [
                                            // Score visual
                                            hs("div", {
                                                children: [
                                                    hs("div", {
                                                        style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" },
                                                        children: [
                                                            h("span", { style: { fontSize: "14px", fontWeight: 700 }, children: "Score de Risco" }),
                                                            h("span", { style: { fontSize: "22px", fontWeight: 700, color: scoreColor(score) }, children: `${score}/100` }),
                                                        ],
                                                    }),
                                                    h("div", {
                                                        style: { width: "100%", height: "14px", background: "#e5e7eb", borderRadius: "9999px", overflow: "hidden" },
                                                        children: h("div", {
                                                            style: {
                                                                width: `${pct}%`,
                                                                height: "100%",
                                                                background: scoreColor(score),
                                                                borderRadius: "9999px",
                                                                transition: "width 0.4s",
                                                            },
                                                        }),
                                                    }),
                                                    h("p", { style: { fontSize: "12px", color: "#6b7280", marginTop: "6px" }, children: "0 = sem risco | 100 = risco crítico" }),
                                                ],
                                            }),
                                            // Regras aplicadas
                                            hs("div", {
                                                children: [
                                                    h(SectionTitle, { children: "Regras de Risco Aplicadas" }),
                                                    regrasAplicadas.length === 0
                                                        ? h("p", { style: { fontSize: "13px", color: "#6b7280" }, children: "Nenhuma regra de risco disparada." })
                                                        : h("div", {
                                                            style: { display: "flex", flexDirection: "column", gap: "8px" },
                                                            children: regrasAplicadas.map((regra, i) => hs("div", {
                                                                key: i,
                                                                style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 14px", background: "#f9fafb", borderRadius: "6px", fontSize: "13px" },
                                                                children: [
                                                                    hs("div", {
                                                                        children: [
                                                                            h("p", { style: { fontWeight: 600, margin: "0 0 2px 0" }, children: regra.nome || regra.descricao || `Regra ${i + 1}` }),
                                                                            regra.detalhe ? h("p", { style: { color: "#6b7280", margin: 0, fontSize: "12px" }, children: regra.detalhe }) : null,
                                                                        ],
                                                                    }),
                                                                    h("span", { style: { fontWeight: 700, color: scoreColor(regra.peso), whiteSpace: "nowrap", marginLeft: "12px" }, children: regra.peso != null ? `+${regra.peso}pts` : "" }),
                                                                ],
                                                            })),
                                                        }),
                                                ],
                                            }),
                                        ],
                                    });
                                }

                                if (abaAtiva === "manifestacao") {
                                    const m = dados.manifestacao || {};
                                    return h("div", {
                                        style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px" },
                                        children: [
                                            h(Campo, { label: "Status", value: m.status }),
                                            h(Campo, { label: "Tipo Evento", value: m.tipoEvento }),
                                            h(Campo, { label: "Data/Hora", value: formatDateTime(m.dataHora) }),
                                            h(Campo, { label: "Protocolo SEFAZ", value: m.protocolo }),
                                            h(Campo, { label: "Transmitido por", value: m.usuario }),
                                            h(Campo, { label: "Justificativa", value: m.justificativa }),
                                        ],
                                    });
                                }

                                if (abaAtiva === "conciliacao") {
                                    const c = dados.conciliacao || {};
                                    return hs("div", {
                                        style: { display: "flex", flexDirection: "column", gap: "16px" },
                                        children: [
                                            h("div", {
                                                style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px" },
                                                children: [
                                                    h(Campo, { label: "Status Conciliação", value: c.status }),
                                                    h(Campo, { label: "Pedido WinThor", value: c.pedidoWinthor }),
                                                    h(Campo, { label: "Nota WinThor", value: c.notaWinthor }),
                                                    h(Campo, { label: "Valor Sistema", value: formatMoney(c.valorSistema) }),
                                                    h(Campo, { label: "Diferença", value: formatMoney(c.diferenca) }),
                                                    h(Campo, { label: "Data Conciliação", value: formatDateTime(c.dataConciliacao) }),
                                                ],
                                            }),
                                            c.observacao ? hs("div", {
                                                children: [
                                                    h("p", { style: { fontSize: "12px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }, children: "Observação" }),
                                                    h("p", { style: { fontSize: "13px" }, children: c.observacao }),
                                                ],
                                            }) : null,
                                        ],
                                    });
                                }

                                if (abaAtiva === "divergencias") {
                                    return divergencias.length === 0
                                        ? h("p", { style: { fontSize: "13px", color: "#6b7280" }, children: "Nenhuma divergência registrada neste documento." })
                                        : h("div", {
                                            style: { overflowX: "auto" },
                                            children: h("table", {
                                                style: { width: "100%", borderCollapse: "collapse", fontSize: "13px" },
                                                children: [
                                                    h("thead", {
                                                        children: h("tr", {
                                                            style: { borderBottom: "1px solid #e5e7eb", background: "#f9fafb" },
                                                            children: [
                                                                h("th", { style: { padding: "10px 14px", textAlign: "left", fontWeight: 600, fontSize: "12px", color: "#6b7280", whiteSpace: "nowrap" }, children: "Tipo" }),
                                                                h("th", { style: { padding: "10px 14px", textAlign: "center", fontWeight: 600, fontSize: "12px", color: "#6b7280", whiteSpace: "nowrap" }, children: "Severidade" }),
                                                                h("th", { style: { padding: "10px 14px", textAlign: "center", fontWeight: 600, fontSize: "12px", color: "#6b7280", whiteSpace: "nowrap" }, children: "Status" }),
                                                                h("th", { style: { padding: "10px 14px", textAlign: "left", fontWeight: 600, fontSize: "12px", color: "#6b7280", whiteSpace: "nowrap" }, children: "Ação Recomendada" }),
                                                            ],
                                                        }),
                                                    }),
                                                    h("tbody", {
                                                        children: divergencias.map((div, i) => h("tr", {
                                                            key: i,
                                                            style: { borderBottom: "1px solid #f3f4f6", verticalAlign: "middle" },
                                                            children: [
                                                                h("td", { style: { padding: "10px 14px", verticalAlign: "middle" }, children: div.tipo || "—" }),
                                                                h("td", { style: { padding: "10px 14px", textAlign: "center", verticalAlign: "middle" }, children: severidadeBadge(div.severidade) }),
                                                                h("td", { style: { padding: "10px 14px", textAlign: "center", verticalAlign: "middle" }, children: div.status || "—" }),
                                                                h("td", { style: { padding: "10px 14px", verticalAlign: "middle" }, children: div.acaoRecomendada || "—" }),
                                                            ],
                                                        })),
                                                    }),
                                                ],
                                            }),
                                        });
                                }

                                if (abaAtiva === "workflow") {
                                    return workflow.length === 0
                                        ? h("p", { style: { fontSize: "13px", color: "#6b7280" }, children: "Nenhuma etapa de workflow registrada." })
                                        : h("div", {
                                            style: { display: "flex", flexDirection: "column", gap: "10px" },
                                            children: workflow.map((etapa, i) => hs("div", {
                                                key: i,
                                                style: { display: "flex", gap: "14px", alignItems: "flex-start", padding: "12px 16px", background: "#f9fafb", borderRadius: "8px", fontSize: "13px" },
                                                children: [
                                                    h("span", {
                                                        style: {
                                                            width: "24px", height: "24px", borderRadius: "9999px", background: etapa.concluido ? "#dcfce7" : "#e5e7eb",
                                                            color: etapa.concluido ? "#166534" : "#6b7280", display: "flex", alignItems: "center", justifyContent: "center",
                                                            fontSize: "12px", fontWeight: 700, flexShrink: 0,
                                                        },
                                                        children: etapa.concluido ? "✓" : `${i + 1}`,
                                                    }),
                                                    hs("div", {
                                                        children: [
                                                            h("p", { style: { fontWeight: 600, margin: "0 0 2px 0" }, children: etapa.etapa || etapa.nome || `Etapa ${i + 1}` }),
                                                            etapa.usuario ? h("p", { style: { color: "#6b7280", margin: "0 0 2px 0", fontSize: "12px" }, children: `Por: ${etapa.usuario}` }) : null,
                                                            etapa.dataHora ? h("p", { style: { color: "#6b7280", margin: 0, fontSize: "12px" }, children: formatDateTime(etapa.dataHora) }) : null,
                                                        ],
                                                    }),
                                                ],
                                            })),
                                        });
                                }

                                if (abaAtiva === "auditoria") {
                                    return auditoria.length === 0
                                        ? h("p", { style: { fontSize: "13px", color: "#6b7280" }, children: "Nenhum registro de auditoria encontrado." })
                                        : h("div", {
                                            style: { overflowX: "auto" },
                                            children: h("table", {
                                                style: { width: "100%", borderCollapse: "collapse", fontSize: "13px" },
                                                children: hs("thead", {
                                                    children: [
                                                        h("tr", {
                                                            style: { borderBottom: "1px solid #e5e7eb", background: "#f9fafb" },
                                                            children: [
                                                                h("th", { style: { padding: "10px 14px", textAlign: "left", fontWeight: 600, fontSize: "12px", color: "#6b7280" }, children: "Data/Hora" }),
                                                                h("th", { style: { padding: "10px 14px", textAlign: "left", fontWeight: 600, fontSize: "12px", color: "#6b7280" }, children: "Usuário" }),
                                                                h("th", { style: { padding: "10px 14px", textAlign: "left", fontWeight: 600, fontSize: "12px", color: "#6b7280" }, children: "Ação" }),
                                                                h("th", { style: { padding: "10px 14px", textAlign: "left", fontWeight: 600, fontSize: "12px", color: "#6b7280" }, children: "Detalhe" }),
                                                            ],
                                                        }),
                                                        h("tbody", {
                                                            children: auditoria.map((log, i) => h("tr", {
                                                                key: i,
                                                                style: { borderBottom: "1px solid #f3f4f6" },
                                                                children: hs("td", {
                                                                    children: [
                                                                        h("td", { style: { padding: "10px 14px", whiteSpace: "nowrap" }, children: formatDateTime(log.dataHora || log.createdAt) }),
                                                                        h("td", { style: { padding: "10px 14px" }, children: log.usuario || log.user || "—" }),
                                                                        h("td", { style: { padding: "10px 14px", fontWeight: 600 }, children: log.acao || log.action || "—" }),
                                                                        h("td", { style: { padding: "10px 14px", color: "#6b7280" }, children: log.detalhe || log.detail || log.descricao || "—" }),
                                                                    ],
                                                                }),
                                                            })),
                                                        }),
                                                    ],
                                                }),
                                            }),
                                        });
                                }

                                if (abaAtiva === "ia") {
                                    const acoes = [
                                        { key: "resumir-documento", label: "Resumir Documento" },
                                        { key: "explicar-risco", label: "Explicar Risco" },
                                        { key: "sugerir-tratativa", label: "Sugerir Tratativa" },
                                        { key: "gerar-parecer", label: "Gerar Parecer Fiscal" },
                                    ];
                                    return hs("div", {
                                        style: { display: "flex", flexDirection: "column", gap: "20px" },
                                        children: acoes.map((acao) => hs("div", {
                                            key: acao.key,
                                            style: { display: "flex", flexDirection: "column", gap: "10px" },
                                            children: [
                                                hs("div", {
                                                    style: { display: "flex", justifyContent: "space-between", alignItems: "center" },
                                                    children: [
                                                        h("span", { style: { fontSize: "14px", fontWeight: 600 }, children: acao.label }),
                                                        h(Button, {
                                                            variant: "outline",
                                                            disabled: iaLoading[acao.key],
                                                            onClick: () => chamarIA(acao.key),
                                                            style: { fontSize: "12px" },
                                                            children: iaLoading[acao.key] ? "Consultando IA..." : "Executar",
                                                        }),
                                                    ],
                                                }),
                                                iaResultados[acao.key] ? h("textarea", {
                                                    value: iaResultados[acao.key],
                                                    readOnly: true,
                                                    rows: 6,
                                                    style: {
                                                        width: "100%",
                                                        padding: "12px 14px",
                                                        borderRadius: "6px",
                                                        border: "1px solid #e5e7eb",
                                                        fontSize: "13px",
                                                        lineHeight: 1.6,
                                                        background: "#f9fafb",
                                                        resize: "vertical",
                                                        boxSizing: "border-box",
                                                    },
                                                }) : null,
                                            ],
                                        })),
                                    });
                                }

                                return null;
                            })(),
                        }),
                    ],
                }),
            }),
        ],
    });
}
