import { r as React } from "./index-Cw1PFMX8.js";
const { useState, useEffect, useCallback } = React;

function getToken() {
    try { return JSON.parse(localStorage.getItem("sgq.authSession") || "{}").token || ""; } catch { return ""; }
}
async function apiFetch(path, opts = {}) {
    const hasBody = opts.body != null;
    const headers = { Authorization: `Bearer ${getToken()}`, ...(opts.headers || {}) };
    if (hasBody) headers["Content-Type"] = "application/json";
    const res = await fetch(path, { ...opts, headers });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `HTTP ${res.status}`); }
    return res.json();
}

function formatBytes(b) {
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b/1024).toFixed(1)} KB`;
    return `${(b/1048576).toFixed(1)} MB`;
}
function formatData(iso) {
    try { return new Date(iso).toLocaleString("pt-BR"); } catch { return iso; }
}
function formatDataSimples(aaaa_mm_dd) {
    if (!aaaa_mm_dd) return "-";
    const [y, m, d] = aaaa_mm_dd.split("-");
    return `${d}/${m}/${y}`;
}

export default function RedeRelatorioPage() {
    const [arquivos,   setArquivos]   = useState([]);
    const [status,     setStatus]     = useState(null);
    const [loading,    setLoading]    = useState(false);
    const [syncMsg,    setSyncMsg]    = useState("");
    const [erro,       setErro]       = useState("");
    const [convertendo,   setConvertendo]   = useState({});
    const [convertendo36, setConvertendo36] = useState({});

    const carregar = useCallback(async () => {
        setLoading(true);
        try {
            const [r1, r2] = await Promise.all([
                apiFetch("/api/rede-relatorio/arquivos"),
                apiFetch("/api/rede-relatorio/status"),
            ]);
            setArquivos(r1.data || []);
            setStatus(r2);
        } catch (e) { setErro(e.message); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { carregar(); }, [carregar]);

    async function disparar() {
        setSyncMsg(""); setErro("");
        try {
            await apiFetch("/api/rede-relatorio/sync", { method: "POST" });
            setSyncMsg("Download iniciado em segundo plano. Pode levar até 2 minutos. Atualize a lista após.");
            setTimeout(carregar, 90000);
        } catch (e) { setErro(e.message); }
    }

    async function converterSitef4(nome) {
        setErro("");
        setConvertendo(prev => ({ ...prev, [nome]: true }));
        try {
            const res = await fetch(`/api/rede-relatorio/converter-sitef4/${encodeURIComponent(nome)}`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            if (!res.ok) {
                const e = await res.json().catch(() => ({}));
                throw new Error(e?.error?.message || `HTTP ${res.status}`);
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `conversao_rede_para_sitef_layout_4_1_${nome}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        } catch(e) {
            setErro(`Erro na conversão: ${e.message}`);
        } finally {
            setConvertendo(prev => ({ ...prev, [nome]: false }));
        }
    }

    async function converterSitef36(nome) {
        setErro("");
        setConvertendo36(prev => ({ ...prev, [nome]: true }));
        try {
            const res = await fetch(`/api/rede-relatorio/converter-sitef36/${encodeURIComponent(nome)}`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            if (!res.ok) {
                const e = await res.json().catch(() => ({}));
                throw new Error(e?.error?.message || `HTTP ${res.status}`);
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `EEXTRATO_${nome.replace(/\.[^.]+$/, "")}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        } catch(e) {
            setErro(`Erro na conversão: ${e.message}`);
        } finally {
            setConvertendo36(prev => ({ ...prev, [nome]: false }));
        }
    }

    async function baixar(nome) {
        setErro("");
        try {
            const res = await fetch(`/api/rede-relatorio/download/${encodeURIComponent(nome)}`, {
                headers: { Authorization: `Bearer ${getToken()}` }
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = nome;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        } catch(e) {
            setErro(`Erro ao baixar: ${e.message}`);
        }
    }

    const s = { fontFamily: "inherit" };

    return React.createElement("div", { style: { ...s, padding: 24, maxWidth: 900 } },
        // Header
        React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 } },
            React.createElement("div", null,
                React.createElement("h1", { style: { margin: 0, fontSize: 22, fontWeight: 700 } }, "Relatório Rede — Recebimentos"),
                React.createElement("p", { style: { margin: "4px 0 0", color: "#6b7280", fontSize: 14 } }, "Download automático diário do extrato de recebimentos do portal Rede")
            ),
            React.createElement("button", {
                onClick: disparar,
                disabled: status?.syncEmAndamento,
                style: {
                    background: status?.syncEmAndamento ? "#9ca3af" : "#2563eb",
                    color: "#fff", border: "none", borderRadius: 8,
                    padding: "10px 20px", cursor: status?.syncEmAndamento ? "default" : "pointer",
                    fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8
                }
            },
                status?.syncEmAndamento
                    ? React.createElement("span", null, "⏳ Baixando...")
                    : React.createElement("span", null, "⬇️ Baixar Agora")
            )
        ),

        // Status card
        status && React.createElement("div", {
            style: { background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "12px 18px", marginBottom: 20, display: "flex", gap: 32, flexWrap: "wrap" }
        },
            React.createElement("div", null,
                React.createElement("div", { style: { fontSize: 11, color: "#6b7280", textTransform: "uppercase", fontWeight: 600 } }, "Agendamento"),
                React.createElement("div", { style: { fontSize: 15, fontWeight: 700, color: "#166534" } }, status.agendamento)
            ),
            status.ultimoArquivo && React.createElement("div", null,
                React.createElement("div", { style: { fontSize: 11, color: "#6b7280", textTransform: "uppercase", fontWeight: 600 } }, "Último Download"),
                React.createElement("div", { style: { fontSize: 15, fontWeight: 700, color: "#166534" } }, formatData(status.ultimoArquivo.baixadoEm))
            ),
            status.ultimoArquivo && React.createElement("div", null,
                React.createElement("div", { style: { fontSize: 11, color: "#6b7280", textTransform: "uppercase", fontWeight: 600 } }, "Data do Relatório"),
                React.createElement("div", { style: { fontSize: 15, fontWeight: 700, color: "#166534" } }, formatDataSimples(status.ultimoArquivo.data))
            )
        ),

        // Mensagens
        syncMsg && React.createElement("div", { style: { background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: "#1e40af", fontSize: 14 } }, "ℹ️ ", syncMsg),
        erro    && React.createElement("div", { style: { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", marginBottom: 16, color: "#991b1b", fontSize: 14 } }, "❌ ", erro),

        // Tabela de arquivos
        React.createElement("div", { style: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" } },
            React.createElement("div", { style: { padding: "14px 18px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" } },
                React.createElement("span", { style: { fontWeight: 600, fontSize: 15 } }, "Arquivos Disponíveis"),
                React.createElement("button", { onClick: carregar, style: { background: "none", border: "1px solid #e5e7eb", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 13, color: "#374151" } },
                    loading ? "Carregando..." : "🔄 Atualizar"
                )
            ),

            arquivos.length === 0
                ? React.createElement("div", { style: { padding: 40, textAlign: "center", color: "#9ca3af" } },
                    loading ? "Carregando..." : "Nenhum relatório disponível. Clique em \"Baixar Agora\" para obter o primeiro arquivo."
                )
                : React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 14 } },
                    React.createElement("thead", null,
                        React.createElement("tr", { style: { background: "#f9fafb" } },
                            ["Data do Relatório", "Arquivo", "Tamanho", "Baixado em", ""].map(h =>
                                React.createElement("th", { key: h, style: { padding: "10px 16px", textAlign: "left", fontWeight: 600, color: "#374151", fontSize: 12, textTransform: "uppercase", borderBottom: "1px solid #e5e7eb" } }, h)
                            )
                        )
                    ),
                    React.createElement("tbody", null,
                        arquivos.map((arq, i) =>
                            React.createElement("tr", { key: arq.nome, style: { borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "#fff" : "#fafafa" } },
                                React.createElement("td", { style: { padding: "12px 16px", fontWeight: 700, color: "#111827" } }, formatDataSimples(arq.data)),
                                React.createElement("td", { style: { padding: "12px 16px", color: "#6b7280", fontFamily: "monospace", fontSize: 12 } }, arq.nome),
                                React.createElement("td", { style: { padding: "12px 16px", color: "#6b7280" } }, formatBytes(arq.tamanhoBytes)),
                                React.createElement("td", { style: { padding: "12px 16px", color: "#6b7280" } }, formatData(arq.baixadoEm)),
                                React.createElement("td", { style: { padding: "12px 16px", display: "flex", gap: 8, flexWrap: "wrap" } },
                                    React.createElement("button", {
                                        onClick: () => baixar(arq.nome),
                                        style: { background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }
                                    }, "⬇️ Baixar"),
                                    React.createElement("button", {
                                        onClick: () => converterSitef4(arq.nome),
                                        disabled: !!convertendo[arq.nome],
                                        title: "Converter para SiTef Conciliador Layout 4.1",
                                        style: { background: convertendo[arq.nome] ? "#9ca3af" : "#7c3aed", color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", cursor: convertendo[arq.nome] ? "default" : "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }
                                    }, convertendo[arq.nome] ? "⏳ Convertendo..." : "⚙️ SiTef 4.1"),
                                    React.createElement("button", {
                                        onClick: () => converterSitef36(arq.nome),
                                        disabled: !!convertendo36[arq.nome],
                                        title: "Converter para SiTef Conciliador Layout 3.6",
                                        style: { background: convertendo36[arq.nome] ? "#9ca3af" : "#0369a1", color: "#fff", border: "none", borderRadius: 6, padding: "6px 14px", cursor: convertendo36[arq.nome] ? "default" : "pointer", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }
                                    }, convertendo36[arq.nome] ? "⏳ Convertendo..." : "⚙️ SiTef 3.6")
                                )
                            )
                        )
                    )
                )
        ),

        // Informativo
        React.createElement("div", { style: { marginTop: 16, padding: "12px 16px", background: "#fafafa", borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13, color: "#6b7280" } },
            React.createElement("strong", null, "Como funciona: "),
            "Todo dia às 6h o sistema acessa automaticamente o portal da Rede, seleciona o relatório detalhado de recebimentos do dia e baixa o arquivo Excel. Você também pode acionar o download manualmente a qualquer momento."
        )
    );
}
