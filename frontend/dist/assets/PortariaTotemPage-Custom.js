import { r as React, j as jsxRuntime, B as Button } from "./index-Cw1PFMX8.js";
import { I as Input } from "./input-CnWhQnjH.js";

const h = jsxRuntime.jsx;
const hs = jsxRuntime.jsxs;

function getToken() { try { return JSON.parse(localStorage.getItem("sgq.authSession") || "{}").token || ""; } catch { return ""; } }
async function apiFetch(path, opts) {
    const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(opts?.headers || {}) } });
    return res.json().catch(() => ({}));
}

function fmtTime(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function fmtElapsed(iso) {
    const diff = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (diff < 60) return `${diff}min`;
    return `${Math.floor(diff / 60)}h${diff % 60 ? ` ${diff % 60}min` : ""}`;
}

const statusColors = {
    DENTRO: { bg: "#dcfce7", text: "#166534", label: "Dentro" },
    PRESENTE: { bg: "#dcfce7", text: "#166534", label: "Presente" },
    AGUARDANDO_VALIDACAO: { bg: "#fef3c7", text: "#92400e", label: "Aguardando" },
    SAIU: { bg: "#f3f4f6", text: "#6b7280", label: "Saiu" },
    FINALIZADO: { bg: "#f3f4f6", text: "#6b7280", label: "Saiu" },
};

export default function PortariaTotemPage() {
    const [acessos, setAcessos] = React.useState([]);
    const [fornecedores, setFornecedores] = React.useState([]);
    const [busca, setBusca] = React.useState("");
    const [tick, setTick] = React.useState(0);
    const [hora, setHora] = React.useState("");
    const [showQr, setShowQr] = React.useState(false);

    const ENTRADA_URL = "https://visitante.rodriguescolchoes.com.br:3344/visitante/entrada";
    const QR_IMG_URL = `/api/portaria/saida-funcionario/qrcode-image?token=${encodeURIComponent(ENTRADA_URL)}`;

    React.useEffect(() => {
        const tick = setInterval(() => {
            setTick(t => t + 1);
            setHora(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
        }, 1000);
        return () => clearInterval(tick);
    }, []);

    const carregar = React.useCallback(async () => {
        const [a, f] = await Promise.all([
            apiFetch("/api/operacional/acessos"),
            apiFetch("/api/operacional/entradas-fornecedor?status=PRESENTE"),
        ]);
        const lista = Array.isArray(a) ? a : (a?.items || []);
        const presentes = lista.filter(x => x.status === "DENTRO" || x.status === "PRESENTE" || x.status === "AGUARDANDO_VALIDACAO");
        setAcessos(presentes.slice(-30).reverse());
        setFornecedores(Array.isArray(f) ? f : []);
    }, []);

    React.useEffect(() => { carregar(); }, [carregar]);
    React.useEffect(() => { const t = setInterval(carregar, 30000); return () => clearInterval(t); }, [carregar]);

    const hoje = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

    const acessosFiltrados = acessos.filter(a => {
        if (!busca) return true;
        const q = busca.toLowerCase();
        return (a.nome || "").toLowerCase().includes(q) || (a.empresa || "").toLowerCase().includes(q) || (a.documento || "").toLowerCase().includes(q);
    });

    return hs("div", {
        style: { minHeight: "100vh", background: "hsl(var(--background))", display: "flex", flexDirection: "column" },
        children: [
            // Header
            hs("header", {
                style: { background: "#1e3a5f", color: "#fff", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" },
                children: [
                    hs("div", {
                        children: [
                            h("h1", { style: { fontSize: "20px", fontWeight: 700, margin: 0 }, children: "Torre de Controle — Portaria" }),
                            h("p", { style: { fontSize: "13px", opacity: 0.7, margin: "2px 0 0", textTransform: "capitalize" }, children: hoje }),
                        ],
                    }),
                    hs("div", { style: { textAlign: "right" }, children: [
                        h("p", { style: { fontSize: "28px", fontWeight: 700, fontVariantNumeric: "tabular-nums", letterSpacing: "0.05em" }, children: hora }),
                        h("p", { style: { fontSize: "11px", opacity: 0.6 }, children: "Atualiza a cada 30s" }),
                    ] }),
                ],
            }),

            // Contadores topo
            hs("div", {
                style: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", padding: "16px 24px", background: "#f9fafb", borderBottom: "1px solid hsl(var(--border))" },
                children: [
                    hs("div", { style: { background: "#dcfce7", borderRadius: "10px", padding: "14px 16px", textAlign: "center" }, children: [
                        h("p", { style: { fontSize: "32px", fontWeight: 800, color: "#166534", lineHeight: 1 }, children: acessos.length }),
                        h("p", { style: { fontSize: "12px", color: "#166534", marginTop: "4px" }, children: "Pessoas presentes" }),
                    ] }),
                    hs("div", { style: { background: "#dbeafe", borderRadius: "10px", padding: "14px 16px", textAlign: "center" }, children: [
                        h("p", { style: { fontSize: "32px", fontWeight: 800, color: "#1e40af", lineHeight: 1 }, children: fornecedores.length }),
                        h("p", { style: { fontSize: "12px", color: "#1e40af", marginTop: "4px" }, children: "Fornecedores no pátio" }),
                    ] }),
                    hs("div", { style: { background: "#fef3c7", borderRadius: "10px", padding: "14px 16px", textAlign: "center" }, children: [
                        h("p", { style: { fontSize: "32px", fontWeight: 800, color: "#92400e", lineHeight: 1 }, children: acessos.filter(a => a.status === "AGUARDANDO_VALIDACAO").length }),
                        h("p", { style: { fontSize: "12px", color: "#92400e", marginTop: "4px" }, children: "Aguardando liberação" }),
                    ] }),
                ],
            }),

            // Botão QR e Busca
            hs("div", {
                style: { display: "flex", gap: "12px", padding: "12px 24px", alignItems: "center" },
                children: [
                    h(Input, { placeholder: "Buscar por nome, empresa ou documento...", value: busca, onChange: e => setBusca(e.target.value), style: { flex: 1 } }),
                    h(Button, { onClick: () => setShowQr(s => !s), variant: "outline", children: showQr ? "Fechar QR" : "QR Entrada Visitante" }),
                    h(Button, { onClick: carregar, variant: "outline", children: "↻" }),
                ],
            }),

            // QR Panel
            showQr ? hs("div", {
                style: { padding: "0 24px 12px" },
                children: hs("div", {
                    style: { display: "flex", alignItems: "center", gap: "24px", padding: "16px", background: "#f9fafb", borderRadius: "12px", border: "1px solid hsl(var(--border))" },
                    children: [
                        h("img", { src: QR_IMG_URL, alt: "QR Entrada", style: { width: "160px", height: "160px", borderRadius: "8px", background: "#fff", border: "1px solid #e5e7eb" } }),
                        hs("div", {
                            children: [
                                h("p", { style: { fontWeight: 700, fontSize: "15px" }, children: "Acesso de Visitante" }),
                                h("p", { style: { fontSize: "13px", color: "hsl(var(--muted-foreground))", marginTop: "4px" }, children: "O visitante escaneia o QR, preenche os dados e recebe o código de entrada." }),
                                h("p", { style: { fontSize: "11px", fontFamily: "monospace", marginTop: "8px", background: "#e5e7eb", padding: "4px 8px", borderRadius: "4px" }, children: ENTRADA_URL }),
                            ],
                        }),
                    ],
                }),
            }) : null,

            // Lista de presentes
            hs("div", {
                style: { flex: 1, padding: "0 24px 24px", overflowY: "auto" },
                children: [
                    h("h2", { style: { fontSize: "13px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "hsl(var(--muted-foreground))", margin: "0 0 10px" }, children: `Presentes agora (${acessosFiltrados.length})` }),
                    acessosFiltrados.length === 0 ? h("p", { style: { fontSize: "14px", color: "hsl(var(--muted-foreground))", textAlign: "center", padding: "40px 0" }, children: "Nenhum registro encontrado." }) :
                    h("div", {
                        style: { display: "grid", gap: "8px" },
                        children: acessosFiltrados.map(a => {
                            const sc = statusColors[a.status] || statusColors.SAIU;
                            return hs("div", {
                                key: a.id,
                                style: { display: "flex", alignItems: "center", gap: "14px", padding: "12px 16px", borderRadius: "10px", border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" },
                                children: [
                                    h("div", { style: { width: "10px", height: "10px", borderRadius: "50%", background: sc.text, flexShrink: 0 } }),
                                    hs("div", { style: { flex: 1, minWidth: 0 }, children: [
                                        h("p", { style: { fontWeight: 600, fontSize: "14px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }, children: a.nome || a.visitanteNome || "—" }),
                                        h("p", { style: { fontSize: "12px", color: "hsl(var(--muted-foreground))" }, children: [a.empresa, a.documento].filter(Boolean).join(" · ") || "—" }),
                                    ] }),
                                    hs("div", { style: { textAlign: "right", flexShrink: 0 }, children: [
                                        h("span", { style: { fontSize: "11px", fontWeight: 700, background: sc.bg, color: sc.text, padding: "2px 8px", borderRadius: "9999px" }, children: sc.label }),
                                        h("p", { style: { fontSize: "11px", color: "hsl(var(--muted-foreground))", marginTop: "4px" }, children: a.dataHora ? `${fmtTime(a.dataHora)} · ${fmtElapsed(a.dataHora)}` : "—" }),
                                    ] }),
                                ],
                            });
                        }),
                    }),
                ],
            }),
        ],
    });
}
