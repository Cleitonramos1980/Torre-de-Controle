import { r as React, j as jsxRuntime } from "./index-Cw1PFMX8.js";

const h = React.createElement;

function getToken() { try { return JSON.parse(localStorage.getItem("sgq.authSession") || "{}").token || ""; } catch { return ""; } }
async function apiFetch(path, opts) {
    const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(opts?.headers || {}) } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || json?.message || `Erro ${res.status}`);
    return json;
}

function fmt(v) { const n = Number(v ?? 0); return Number.isFinite(n) ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "R$ 0,00"; }
function fmtN(v) { return Number(v ?? 0).toLocaleString("pt-BR"); }

const metricCard = (title, value, sub, color) =>
    h("div", { style: { background: "#fff", borderRadius: 10, padding: "18px 22px", boxShadow: "0 1px 4px #0001", borderLeft: `4px solid ${color || "#6366f1"}` } },
        h("div", { style: { fontSize: 12, color: "#6b7280", marginBottom: 4 } }, title),
        h("div", { style: { fontSize: 26, fontWeight: 700, color: "#111827" } }, value),
        sub && h("div", { style: { fontSize: 11, color: "#9ca3af", marginTop: 2 } }, sub)
    );

export default function FiscalNFSeNacionalPage() {
    const [dados, setDados] = React.useState(null);
    const [config, setConfig] = React.useState(null);
    const [loading, setLoading] = React.useState(true);
    const [erro, setErro] = React.useState("");
    const [sincronizando, setSincronizando] = React.useState(false);
    const [info, setInfo] = React.useState("");

    const carregar = React.useCallback(async () => {
        setLoading(true); setErro("");
        try {
            const [d, c] = await Promise.all([
                apiFetch("/api/fiscal/nfse/dashboard").catch(() => ({})),
                apiFetch("/api/fiscal/nfse/config").catch(() => ({})),
            ]);
            setDados(d); setConfig(c);
        } catch (e) { setErro(e.message); }
        finally { setLoading(false); }
    }, []);

    React.useEffect(() => { carregar(); }, [carregar]);

    const sincronizar = async () => {
        setSincronizando(true); setInfo(""); setErro("");
        try {
            const r = await apiFetch("/api/fiscal/nfse/conciliacao/executar", { method: "POST", body: JSON.stringify({}) });
            setInfo(r?.mensagem || "Conciliacao concluida.");
            await carregar();
        } catch (e) { setErro(e.message); }
        finally { setSincronizando(false); }
    };

    const goTo = (path) => { window.location.hash = "#" + path; };

    return h("div", { style: { padding: 24, minHeight: "100vh", background: "#f9fafb" } },
        h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 } },
            h("div", null,
                h("h1", { style: { fontSize: 22, fontWeight: 700, margin: 0 } }, "NFS-e Nacional"),
                h("p", { style: { color: "#6b7280", margin: "4px 0 0" } }, "Gestao de Notas Fiscais de Servicos Eletronicas")
            ),
            h("div", { style: { display: "flex", gap: 10, alignItems: "center" } },
                config?.municipio && h("span", { style: { background: "#eff6ff", color: "#1d4ed8", padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600 } }, config.municipio),
                h("button", {
                    onClick: sincronizar, disabled: sincronizando,
                    style: { background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", cursor: "pointer", fontWeight: 600, fontSize: 13 }
                }, sincronizando ? "Sincronizando..." : "Sincronizar")
            )
        ),
        erro && h("div", { style: { background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626", padding: "10px 16px", borderRadius: 8, marginBottom: 16 } }, erro),
        info && h("div", { style: { background: "#f0fdf4", border: "1px solid #86efac", color: "#16a34a", padding: "10px 16px", borderRadius: 8, marginBottom: 16 } }, info),
        loading ? h("div", { style: { textAlign: "center", padding: 60, color: "#6b7280" } }, "Carregando...") :
        h("div", null,
            h("div", { style: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 24 } },
                metricCard("NFS-e Emitidas (mes)", fmtN(dados?.emitidas?.mes ?? 0), fmt(dados?.emitidas?.valorMes ?? 0), "#6366f1"),
                metricCard("NFS-e Tomadas (mes)", fmtN(dados?.tomadas?.mes ?? 0), fmt(dados?.tomadas?.valorMes ?? 0), "#0891b2"),
                metricCard("Conciliacoes Pendentes", fmtN(dados?.conciliacao?.pendentes ?? 0), null, "#f59e0b"),
                metricCard("Impostos Retidos (mes)", fmt(dados?.impostos?.totalRetido ?? 0), null, "#16a34a")
            ),
            config && h("div", { style: { background: "#fff", borderRadius: 10, padding: 20, boxShadow: "0 1px 4px #0001", marginBottom: 20 } },
                h("h3", { style: { margin: "0 0 16px", fontSize: 15, fontWeight: 700, color: "#374151" } }, "Configuracao Ativa"),
                h("div", { style: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 } },
                    [
                        ["Municipio", config.municipio],
                        ["CNPJ Prestador", config.cnpjPrestador],
                        ["Regime Tributario", config.regimeTributario],
                        ["Ambiente", config.ambiente],
                    ].map(([label, val]) => h("div", { key: label },
                        h("div", { style: { fontSize: 11, color: "#6b7280" } }, label),
                        h("div", { style: { fontWeight: 600, color: "#111827" } }, val || "—")
                    ))
                )
            ),
            h("div", { style: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 } },
                [
                    { label: "NFS-e Emitidas", desc: "Gerenciar notas emitidas pela empresa", path: "/fiscal/nfse-emitidas", color: "#6366f1" },
                    { label: "NFS-e Tomadas", desc: "Notas de servicos tomados / contratados", path: "/fiscal/nfse-tomadas", color: "#0891b2" },
                    { label: "Nova Emissao NFS-e", desc: "Emitir nova nota fiscal de servico", path: "/fiscal/nfse-nova-emissao", color: "#16a34a" },
                    { label: "Catalogo de Servicos", desc: "Codigos e aliquotas de servicos", path: "/fiscal/nfse-servicos", color: "#f59e0b" },
                    { label: "Configuracoes NFS-e", desc: "Parametros, certificado e integracoes", path: "/fiscal/nfse-config", color: "#8b5cf6" },
                    { label: "Auditoria NFS-e", desc: "Log de todas as operacoes", path: "/fiscal/auditoria", color: "#374151" },
                ].map(({ label, desc, path, color }) =>
                    h("div", { key: path, onClick: () => goTo(path),
                        style: { background: "#fff", borderRadius: 10, padding: "18px 20px", boxShadow: "0 1px 4px #0001", cursor: "pointer", borderLeft: `4px solid ${color}` } },
                        h("div", { style: { fontWeight: 700, fontSize: 14, color: "#111827", marginBottom: 4 } }, label),
                        h("div", { style: { fontSize: 12, color: "#6b7280" } }, desc)
                    )
                )
            )
        )
    );
}
