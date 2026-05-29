import { r as React, j as jsxRuntime, J as Card, N as CardContent, B as Button } from "./index-Cw1PFMX8.js";

const h = React.createElement;
const hs = React.createElement;

function getToken() { try { return JSON.parse(localStorage.getItem("sgq.authSession") || "{}").token || ""; } catch { return ""; } }
async function apiFetch(path, opts) {
    const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(opts?.headers || {}) } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || json?.message || `Erro ${res.status}`);
    return json;
}

function formatMoney(v) {
    const n = Number(v ?? 0);
    if (!Number.isFinite(n)) return "R$ 0,00";
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatDate(v) {
    if (!v) return "-";
    const d = new Date(`${String(v).slice(0, 10)}T00:00:00`);
    if (isNaN(d)) return String(v);
    return d.toLocaleDateString("pt-BR");
}
function formatCnpj(v) {
    const s = String(v || "").replace(/\D/g, "");
    return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") || v || "—";
}

function BadgeWinthor({ constaWinthor }) {
    if (constaWinthor === true)
        return h("span", { style: { background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700, whiteSpace: "nowrap" } }, "✅ Consta");
    if (constaWinthor === false)
        return h("span", { style: { background: "#fee2e2", color: "#991b1b", padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700, whiteSpace: "nowrap" } }, "❌ Não consta");
    return h("span", { style: { background: "#f3f4f6", color: "#6b7280", padding: "2px 8px", borderRadius: "9999px", fontSize: "11px", fontWeight: 700, whiteSpace: "nowrap" } }, "⏳ Não validado");
}

// ── Modal de cadastro manual de NFS-e Tomada (DANFSe físico) ──────────────────
function ModalManual({ onClose, onSalvo }) {
    const HOJE = new Date().toISOString().slice(0, 10);
    const MES = HOJE.slice(0, 7);
    const [f, setF] = React.useState({
        numeroNfse: "", chaveAcesso: "",
        cnpjPrestador: "", nomePrestador: "",
        cnpjTomador: "", descricaoServico: "",
        valorServico: "", valorIss: "", aliquotaIss: "",
        competencia: MES, dataEmissao: HOJE, municipio: "",
    });
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState("");
    const set = (k, v) => setF(p => ({ ...p, [k]: v }));

    // Auto-calcula alíquota
    React.useEffect(() => {
        const vs = parseFloat(f.valorServico) || 0;
        const vi = parseFloat(f.valorIss) || 0;
        if (vs > 0 && vi > 0) set("aliquotaIss", ((vi / vs) * 100).toFixed(4));
    }, [f.valorServico, f.valorIss]);

    // Auto-preenche competência a partir da data de emissão
    React.useEffect(() => {
        if (f.dataEmissao && f.dataEmissao.length >= 7) set("competencia", f.dataEmissao.slice(0, 7));
    }, [f.dataEmissao]);

    const salvar = async () => {
        if (!f.cnpjPrestador.trim()) { setErro("CNPJ do Prestador é obrigatório."); return; }
        if (!f.nomePrestador.trim()) { setErro("Nome do Prestador é obrigatório."); return; }
        if (!f.numeroNfse.trim()) { setErro("Número da NFS-e é obrigatório."); return; }
        if (!f.valorServico || isNaN(parseFloat(f.valorServico))) { setErro("Valor do Serviço é obrigatório."); return; }
        setSalvando(true); setErro("");
        try {
            await apiFetch("/api/fiscal/nfse/tomadas", {
                method: "POST",
                body: JSON.stringify({
                    numeroNfse: f.numeroNfse,
                    chaveAcesso: f.chaveAcesso || undefined,
                    cnpjPrestador: f.cnpjPrestador.replace(/\D/g, ""),
                    nomePrestador: f.nomePrestador,
                    cnpjTomador: f.cnpjTomador.replace(/\D/g, ""),
                    descricaoServico: f.descricaoServico,
                    valorServico: parseFloat(f.valorServico) || 0,
                    valorIss: parseFloat(f.valorIss) || 0,
                    aliquotaIss: parseFloat(f.aliquotaIss) || 0,
                    competencia: f.competencia,
                    dataEmissao: f.dataEmissao,
                    municipio: f.municipio,
                    status: "ATIVA",
                    origem: "MANUAL",
                }),
            });
            onSalvo("NFS-e cadastrada manualmente com sucesso. Agora você pode lançá-la no WinThor.");
        } catch (e) { setErro(e.message); } finally { setSalvando(false); }
    };

    const inp = { padding: "7px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px", width: "100%", boxSizing: "border-box" };
    const lbl = (t, req) => h("label", { style: { fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "3px", color: req ? "#b91c1c" : "#374151" } }, t + (req ? " *" : ""));
    const field = (label, key, extra = {}) => hs("div", { style: { display: "flex", flexDirection: "column" } }, [
        lbl(label, extra.required),
        h("input", { style: inp, value: f[key], onChange: e => set(key, e.target.value), ...extra }),
    ]);

    return h("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" } },
        hs("div", { style: { background: "#fff", borderRadius: "12px", padding: "28px", width: "100%", maxWidth: "640px", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" } }, [
            hs("div", { key: "hdr", style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" } }, [
                h("h2", { style: { fontSize: "16px", fontWeight: 700, margin: 0 } }, "📄 Inserir NFS-e Tomada Manualmente"),
                h("button", { onClick: onClose, style: { border: "none", background: "none", fontSize: "22px", cursor: "pointer", color: "#9ca3af" } }, "×"),
            ]),
            h("p", { key: "tip", style: { fontSize: "12px", color: "#6b7280", marginBottom: "16px", padding: "10px 14px", background: "#fef3c7", borderRadius: "8px", border: "1px solid #fbbf24" } },
                "Use para inserir NFS-e a partir do DANFSe físico quando o município ainda não está integrado ao ambiente nacional (ADN)."
            ),
            hs("div", { key: "form", style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" } }, [
                hs("div", { key: "nfse", style: { gridColumn: "1" } }, [lbl("Número NFS-e", true), h("input", { style: inp, value: f.numeroNfse, onChange: e => set("numeroNfse", e.target.value), placeholder: "16" })]),
                hs("div", { key: "emissao", style: { gridColumn: "2" } }, [lbl("Data de Emissão", true), h("input", { type: "date", style: inp, value: f.dataEmissao, onChange: e => set("dataEmissao", e.target.value) })]),
                hs("div", { key: "cnpjp", style: { gridColumn: "1" } }, [lbl("CNPJ Prestador", true), h("input", { style: inp, value: f.cnpjPrestador, onChange: e => set("cnpjPrestador", e.target.value), placeholder: "62.177.004/0001-05" })]),
                hs("div", { key: "nomep", style: { gridColumn: "2" } }, [lbl("Nome Prestador", true), h("input", { style: inp, value: f.nomePrestador, onChange: e => set("nomePrestador", e.target.value), placeholder: "AGENOR MOTA DOS SANTOS" })]),
                hs("div", { key: "cnpjt", style: { gridColumn: "1" } }, [lbl("CNPJ Tomador"), h("input", { style: inp, value: f.cnpjTomador, onChange: e => set("cnpjTomador", e.target.value), placeholder: "41.032.961/0024-51" })]),
                hs("div", { key: "mun", style: { gridColumn: "2" } }, [lbl("Município"), h("input", { style: inp, value: f.municipio, onChange: e => set("municipio", e.target.value), placeholder: "Santarém - PA" })]),
                hs("div", { key: "vs", style: { gridColumn: "1" } }, [lbl("Valor do Serviço (R$)", true), h("input", { type: "number", step: "0.01", style: inp, value: f.valorServico, onChange: e => set("valorServico", e.target.value), placeholder: "0,00" })]),
                hs("div", { key: "viss", style: { gridColumn: "2" } }, [lbl("Valor ISS (R$)"), h("input", { type: "number", step: "0.01", style: inp, value: f.valorIss, onChange: e => set("valorIss", e.target.value), placeholder: "0,00" })]),
                hs("div", { key: "desc", style: { gridColumn: "1 / -1" } }, [
                    lbl("Descrição do Serviço"),
                    h("textarea", { style: { ...inp, minHeight: "60px", resize: "vertical" }, value: f.descricaoServico, onChange: e => set("descricaoServico", e.target.value), placeholder: "REFERENTE A SERVIÇOS PRESTADOS DE SEGURANÇA PATRIMONIAL..." }),
                ]),
                hs("div", { key: "chave", style: { gridColumn: "1 / -1" } }, [lbl("Chave de Acesso (opcional)"), h("input", { style: { ...inp, fontFamily: "monospace", fontSize: "11px" }, value: f.chaveAcesso, onChange: e => set("chaveAcesso", e.target.value), placeholder: "15068072262177004000105000000000016260523298133589" })]),
            ]),
            erro ? h("p", { key: "err", style: { color: "#dc2626", fontSize: "12px", marginTop: "12px" } }, `⚠️ ${erro}`) : null,
            hs("div", { key: "footer", style: { display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "20px" } }, [
                h("button", { onClick: onClose, style: { padding: "8px 18px", border: "1px solid #d1d5db", borderRadius: "8px", background: "#fff", cursor: "pointer", fontSize: "13px" } }, "Cancelar"),
                h("button", { onClick: salvar, disabled: salvando, style: { padding: "8px 20px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, fontSize: "13px", cursor: "pointer", opacity: salvando ? 0.7 : 1 } }, salvando ? "Salvando..." : "💾 Salvar NFS-e"),
            ]),
        ])
    );
}

// ── Modal buscar NFS-e por chave de acesso (DANFSe físico) ───────────────────
function ModalBuscaChave({ onClose, onImportado, onManual, onSincronizar }) {
    const [chave, setChave] = React.useState("");
    const [cnpjConsulta, setCnpjConsulta] = React.useState("41032961002451");
    const [buscando, setBuscando] = React.useState(false);
    const [fazendoAdesao, setFazendoAdesao] = React.useState(false);
    const [resultado, setResultado] = React.useState(null);
    const [adesaoResult, setAdesaoResult] = React.useState(null);

    const buscar = async () => {
        const chaveLimpa = chave.replace(/\s/g, "").trim();
        if (chaveLimpa.length < 40) { setResultado({ erro: "Chave inválida — deve ter no mínimo 40 caracteres." }); return; }
        setBuscando(true); setResultado(null); setAdesaoResult(null);
        try {
            const r = await apiFetch("/api/fiscal/nfse/tomadas/buscar-por-chave", {
                method: "POST",
                body: JSON.stringify({ chaveAcesso: chaveLimpa, cnpjConsulta: cnpjConsulta.replace(/\D/g, "") }),
            });
            setResultado(r);
            if (r.importado) { setTimeout(() => { onImportado(r.mensagem); }, 800); }
        } catch (e) { setResultado({ erro: e.message }); }
        finally { setBuscando(false); }
    };

    const fazerAdesao = async () => {
        const cnpj = cnpjConsulta.replace(/\D/g, "");
        if (cnpj.length !== 14) { alert("CNPJ da filial inválido."); return; }
        setFazendoAdesao(true); setAdesaoResult(null);
        try {
            const r = await apiFetch("/api/fiscal/nfse/tomadas/fazer-adesao-adn", {
                method: "POST",
                body: JSON.stringify({ cnpj }),
            });
            setAdesaoResult(r);
        } catch (e) { setAdesaoResult({ sucesso: false, mensagem: e.message }); }
        finally { setFazendoAdesao(false); }
    };

    const inp = { padding: "7px 10px", borderRadius: "6px", border: "1px solid #d1d5db", fontSize: "13px", width: "100%", boxSizing: "border-box" };
    const monoInp = { ...inp, fontFamily: "monospace", fontSize: "11px", letterSpacing: "0.5px" };

    const mostrarAdesao = resultado?.encontrado === false && resultado?.precisaAdesao;

    return h("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" } },
        hs("div", { style: { background: "#fff", borderRadius: "12px", padding: "28px", width: "100%", maxWidth: "560px", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" } }, [
            hs("div", { key: "hdr", style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" } }, [
                h("h2", { style: { fontSize: "16px", fontWeight: 700, margin: 0 } }, "🔑 Buscar NFS-e por Chave de Acesso"),
                h("button", { onClick: onClose, style: { border: "none", background: "none", fontSize: "22px", cursor: "pointer", color: "#9ca3af" } }, "×"),
            ]),
            h("p", { key: "info", style: { fontSize: "12px", color: "#6b7280", marginBottom: "16px", padding: "10px 14px", background: "#eff6ff", borderRadius: "8px", border: "1px solid #bfdbfe" } },
                "Informe a Chave de Acesso da NFS-e impressa no DANFSe. O sistema tentará buscar a nota no ADN Gov.br (10+ padrões de endpoint)."
            ),
            hs("div", { key: "form", style: { display: "flex", flexDirection: "column", gap: "12px" } }, [
                hs("div", {}, [
                    h("label", { style: { fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "3px", color: "#374151" } }, "Chave de Acesso da NFS-e *"),
                    h("input", { style: monoInp, value: chave, onChange: e => setChave(e.target.value), placeholder: "150680762177004000105700000000000000000009xxxxxxxx" }),
                    h("p", { style: { fontSize: "10px", color: chave.replace(/\s/g,"").length >= 50 ? "#166534" : "#9ca3af", margin: "3px 0 0" } },
                        `${chave.replace(/\s/g, "").length} dígitos (NFS-e nacional = 50 dígitos)`),
                ]),
                hs("div", {}, [
                    h("label", { style: { fontSize: "11px", fontWeight: 600, display: "block", marginBottom: "3px", color: "#374151" } }, "CNPJ Tomador (filial)"),
                    h("input", { style: monoInp, value: cnpjConsulta, onChange: e => setCnpjConsulta(e.target.value), placeholder: "41032961002451" }),
                    h("p", { style: { fontSize: "10px", color: "#9ca3af", margin: "3px 0 0" } }, "CNPJ da filial tomadora — padrão: Santarém (41032961002451)"),
                ]),

                // Resultado da busca
                resultado && (
                    resultado.importado ? h("div", { style: { padding: "12px", background: "#f0fdf4", borderRadius: "8px", border: "1px solid #86efac" } }, [
                        h("p", { style: { color: "#166534", fontSize: "13px", margin: 0, fontWeight: 700 } }, `✅ ${resultado.mensagem}`),
                    ]) :
                    resultado.duplicado ? h("p", { style: { color: "#854d0e", fontSize: "12px", padding: "8px 12px", background: "#fefce8", borderRadius: "6px" } }, `ℹ️ ${resultado.mensagem}`) :
                    resultado.encontrado === false ? h("div", { style: { padding: "14px", background: "#fef3c7", borderRadius: "8px", border: "1px solid #fbbf24", display: "flex", flexDirection: "column", gap: "10px" } }, [
                        h("p", { style: { color: "#92400e", fontSize: "13px", fontWeight: 700, margin: 0 } }, "⚠️ Nota não localizada no ADN Gov.br"),
                        h("p", { style: { color: "#78350f", fontSize: "11px", margin: 0, lineHeight: "1.5" } },
                            resultado.mensagem || "O ADN não retornou a nota por nenhum dos endpoints testados."),
                        mostrarAdesao ? hs("div", { style: { display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" } }, [
                            h("p", { style: { fontSize: "12px", color: "#92400e", fontWeight: 600, margin: 0 } },
                                `Causa identificada: CNPJ ${resultado.cnpjParaAdesao} não está inscrito no ADN para receber DFe.`),
                            h("button", {
                                onClick: fazerAdesao,
                                disabled: fazendoAdesao,
                                style: { fontSize: "13px", fontWeight: 700, padding: "10px 16px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", opacity: fazendoAdesao ? 0.7 : 1 },
                            }, fazendoAdesao ? "⏳ Tentando inscrever no ADN..." : "🔗 Fazer Adesão ADN (inscrever filial)"),
                            h("button", { onClick: () => { onClose(); onManual(); }, style: { fontSize: "12px", fontWeight: 600, padding: "8px 16px", background: "#0f172a", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" } },
                                "➕ Inserir Manualmente com dados do DANFSe"),
                        ]) : null,
                    ]) :
                    resultado.erro ? h("p", { style: { color: "#dc2626", fontSize: "12px", padding: "8px 12px", background: "#fef2f2", borderRadius: "6px" } }, `⚠️ ${resultado.erro}`) : null
                ),

                // Resultado da adesão
                adesaoResult && (
                    adesaoResult.sucesso
                        ? h("div", { style: { padding: "12px 14px", background: "#f0fdf4", borderRadius: "8px", border: "1px solid #86efac" } }, [
                            h("p", { style: { color: "#166534", fontWeight: 700, fontSize: "13px", margin: "0 0 8px" } }, "✅ Adesão realizada com sucesso!"),
                            h("p", { style: { color: "#15803d", fontSize: "12px", margin: "0 0 10px" } }, adesaoResult.mensagem),
                            h("button", { onClick: () => { onClose(); onSincronizar && onSincronizar(); }, style: { fontSize: "13px", fontWeight: 700, padding: "8px 16px", background: "#059669", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" } },
                                "🔄 Sincronizar ADN agora"),
                          ])
                        : h("div", { style: { padding: "12px 14px", background: "#fef3c7", borderRadius: "8px", border: "1px solid #fbbf24" } }, [
                            h("p", { style: { color: "#92400e", fontWeight: 700, fontSize: "12px", margin: "0 0 6px" } }, "⚠️ Adesão não foi possível via API automática."),
                            h("p", { style: { color: "#78350f", fontSize: "11px", margin: "0 0 10px", lineHeight: "1.6" } }, "É necessário fazer a inscrição manualmente no portal Gov.br:"),
                            adesaoResult.instrucoes && h("ol", { style: { margin: "0 0 10px", paddingLeft: "18px", fontSize: "11px", color: "#78350f", lineHeight: "1.8" } },
                                adesaoResult.instrucoes.map((inst, i) => h("li", { key: i }, inst))
                            ),
                            h("button", { onClick: () => { onClose(); onManual(); }, style: { fontSize: "12px", fontWeight: 600, padding: "8px 16px", background: "#0f172a", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" } },
                                "➕ Inserir Manualmente enquanto isso"),
                          ])
                ),
            ]),
            hs("div", { key: "footer", style: { display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "20px" } }, [
                h("button", { onClick: onClose, style: { padding: "8px 18px", border: "1px solid #d1d5db", borderRadius: "8px", background: "#fff", cursor: "pointer", fontSize: "13px" } }, "Cancelar"),
                h("button", { onClick: buscar, disabled: buscando || chave.replace(/\s/g, "").length < 40, style: { padding: "8px 20px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, fontSize: "13px", cursor: "pointer", opacity: (buscando || chave.replace(/\s/g, "").length < 40) ? 0.6 : 1 } },
                    buscando ? "⏳ Buscando em 10+ endpoints..." : "🔍 Buscar no ADN"),
            ]),
        ])
    );
}

// ── Modal: Importar NFS-e via XML (colar conteúdo do arquivo baixado) ──────────
function ModalImportarXml({ onClose, onImportado }) {
    const [xml, setXml] = React.useState("");
    const [importando, setImportando] = React.useState(false);
    const [resultado, setResultado] = React.useState(null);

    const importar = async () => {
        const xmlLimpo = xml.trim();
        if (xmlLimpo.length < 50) return;
        setImportando(true); setResultado(null);
        try {
            const r = await apiFetch("/api/fiscal/nfse/tomadas/importar-xml", {
                method: "POST",
                body: JSON.stringify({ xml: xmlLimpo }),
            });
            setResultado(r);
            if (r.importado) {
                setTimeout(() => { onImportado(r.mensagem); }, 1500);
            }
        } catch (e) {
            setResultado({ erro: e.message });
        } finally { setImportando(false); }
    };

    const carregarArquivo = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => setXml(ev.target.result || "");
        reader.readAsText(file, "utf-8");
    };

    const backdrop = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" };
    const box = { background: "#fff", borderRadius: "12px", padding: "28px", width: "min(700px,96vw)", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", gap: "16px" };

    return h("div", { style: backdrop, onClick: (e) => { if (e.target === e.currentTarget) onClose(); } },
        h("div", { style: box }, [
            hs("div", { key: "hdr", style: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, [
                h("h2", { style: { margin: 0, fontSize: "17px", fontWeight: 700 } }, "📋 Importar NFS-e via XML"),
                h("button", { onClick: onClose, style: { background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "#6b7280" } }, "×"),
            ]),
            h("p", { key: "desc", style: { margin: 0, fontSize: "13px", color: "#6b7280", lineHeight: 1.5 } },
                "Cole o conteúdo do arquivo XML baixado do portal NFSe.gov.br ou selecione o arquivo. Todos os campos (prestador, valor, ISS, competência) são preenchidos automaticamente."),
            hs("div", { key: "upload", style: { display: "flex", gap: "10px", alignItems: "center" } }, [
                h("label", {
                    style: { padding: "7px 14px", background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: "6px", fontSize: "13px", cursor: "pointer", fontWeight: 600 },
                    children: [
                        "📁 Selecionar arquivo .xml",
                        h("input", { type: "file", accept: ".xml,text/xml,application/xml", style: { display: "none" }, onChange: carregarArquivo }),
                    ],
                }),
                xml.length > 0 ? h("span", { style: { fontSize: "12px", color: "#059669" } }, `✅ ${xml.length} caracteres carregados`) : null,
            ]),
            h("textarea", {
                key: "ta",
                value: xml,
                onChange: (e) => setXml(e.target.value),
                placeholder: '<?xml version="1.0" encoding="utf-8"?><NFSe ...',
                style: { width: "100%", height: "180px", fontFamily: "monospace", fontSize: "11px", padding: "10px", borderRadius: "6px", border: "1px solid #d1d5db", resize: "vertical", boxSizing: "border-box" },
            }),
            resultado ? (
                resultado.importado
                    ? h("div", { key: "ok", style: { padding: "12px 14px", background: "#dcfce7", borderRadius: "8px", border: "1px solid #86efac" } }, [
                        h("p", { style: { color: "#166534", fontWeight: 700, fontSize: "14px", margin: "0 0 4px" } }, "✅ Importada com sucesso!"),
                        h("p", { style: { color: "#15803d", fontSize: "13px", margin: 0 } }, resultado.mensagem),
                      ])
                    : resultado.duplicado
                        ? h("div", { key: "dup", style: { padding: "12px 14px", background: "#fef9c3", borderRadius: "8px", border: "1px solid #fde047" } }, [
                            h("p", { style: { color: "#713f12", fontWeight: 700, fontSize: "13px", margin: "0 0 4px" } }, "⚠️ Nota já cadastrada"),
                            h("p", { style: { color: "#854d0e", fontSize: "12px", margin: 0 } }, resultado.mensagem),
                          ])
                        : h("p", { key: "err", style: { color: "#dc2626", fontSize: "12px", padding: "8px 12px", background: "#fef2f2", borderRadius: "6px" } }, `⚠️ ${resultado.erro || resultado.mensagem}`)
            ) : null,
            hs("div", { key: "ftr", style: { display: "flex", gap: "10px", justifyContent: "flex-end" } }, [
                h("button", { onClick: onClose, style: { padding: "8px 18px", border: "1px solid #d1d5db", borderRadius: "8px", background: "#fff", cursor: "pointer", fontSize: "13px" } }, "Cancelar"),
                h("button", {
                    onClick: importar,
                    disabled: importando || xml.trim().length < 50,
                    style: { padding: "8px 22px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 700, fontSize: "13px", cursor: "pointer", opacity: (importando || xml.trim().length < 50) ? 0.6 : 1 },
                }, importando ? "⏳ Importando..." : "📋 Importar XML"),
            ]),
        ])
    );
}

export function FiscalNFSeTomadasPage() {
    const [docs, setDocs] = React.useState([]);
    const [total, setTotal] = React.useState(0);
    const [page, setPage] = React.useState(1);
    const [totalPages, setTotalPages] = React.useState(1);
    const [loading, setLoading] = React.useState(false);
    const [importing, setImporting] = React.useState(false);
    const [validando, setValidando] = React.useState(false);
    const [lancando, setLancando] = React.useState(null);
    const [cadastrandoFornec, setCadastrandoFornec] = React.useState(null);
    const [error, setError] = React.useState(null);
    const [info, setInfo] = React.useState(null);
    const [selected, setSelected] = React.useState(null);
    const [showManual, setShowManual] = React.useState(false);
    const [showBuscaChave, setShowBuscaChave] = React.useState(false);

    const [filtroStatus, setFiltroStatus] = React.useState("");
    const mesAtual = new Date().toISOString().slice(0, 7);
    const [filtroCompetencia, setFiltroCompetencia] = React.useState(mesAtual);
    const [filtroWinthor, setFiltroWinthor] = React.useState("");
    const [filtroBusca, setFiltroBusca] = React.useState("");
    const [filtroFilial, setFiltroFilial] = React.useState("");

    const [limpando, setLimpando] = React.useState(false);
    const [showImportarXml, setShowImportarXml] = React.useState(false);
    const [dtvencLancar, setDtvencLancar] = React.useState(() => {
        const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10);
    });

    const autoSyncDone = React.useRef(false);
    const validacaoAutoRef = React.useRef(null); // competência já auto-validada nesta sessão
    const [temCertificado, setTemCertificado] = React.useState(null); // null=verificando, true/false
    const [sincronizando, setSincronizando] = React.useState(false);
    const [adnSyncInfo, setAdnSyncInfo] = React.useState(null);

    // Verifica se há certificado A1 ativo configurado
    React.useEffect(() => {
        apiFetch("/api/fiscal/certificados")
            .then(certs => setTemCertificado(Array.isArray(certs) && certs.some(c => c.status === "ATIVO")))
            .catch(() => setTemCertificado(false));
    }, []);

    function buildQuery(p = 1, overrides = {}) {
        const params = new URLSearchParams({ page: p, pageSize: 50 });
        if (filtroStatus) params.set("status", filtroStatus);
        const compUsada = "competencia" in overrides ? overrides.competencia : filtroCompetencia;
        if (compUsada) params.set("competencia", compUsada);
        const buscaNorm = filtroBusca.replace(/[%_]/g, "").trim();
        if (buscaNorm) params.set("busca", buscaNorm);
        if (filtroWinthor) params.set("winthor", filtroWinthor);
        if (filtroFilial) params.set("codfilial", filtroFilial);
        return params.toString();
    }

    function carregar(p = 1, overrides = {}) {
        setLoading(true); setError(null);
        apiFetch(`/api/fiscal/nfse/tomadas?${buildQuery(p, overrides)}`)
            .then(r => {
                const items = r.items || [];
                setDocs(items); setTotal(r.total || 0); setTotalPages(r.totalPages || 1); setPage(p);
                // Auto-sync ADN na primeira abertura se não houver notas
                if ((r.total || 0) === 0 && !autoSyncDone.current && p === 1) {
                    autoSyncDone.current = true;
                    sincronizarAdn(true);
                }
                // Batch-check PCFORNEC para esconder botão Cadastrar sem precisar clicar
                const cnpjsSemFlag = [...new Set(
                    items
                        .filter(d => !d.fornecedorCadastrado && !d.winthorCodfornec)
                        .map(d => String(d.cnpjPrestador || "").replace(/\D/g, ""))
                        .filter(c => c.length >= 11)
                )];
                if (cnpjsSemFlag.length > 0) {
                    apiFetch("/api/fiscal/nfse/pcfornec/batch-check", { method: "POST", body: JSON.stringify({ cnpjs: cnpjsSemFlag }) })
                        .then(res => {
                            const mapa = res.fornecedores || {};
                            if (Object.keys(mapa).length > 0) {
                                setDocs(prev => prev.map(d => {
                                    const c = String(d.cnpjPrestador || "").replace(/\D/g, "");
                                    const f = mapa[c];
                                    if (f && !d.fornecedorCadastrado) return { ...d, fornecedorCadastrado: true, winthorCodfornec: f.codfornec };
                                    return d;
                                }));
                            }
                        })
                        .catch(() => {});
                }
            })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }

    React.useEffect(() => { carregar(1); }, [filtroStatus, filtroCompetencia, filtroWinthor]);

    // Auto-valida WinThor ao mudar competência (uma vez por competência por sessão)
    React.useEffect(() => {
        if (filtroCompetencia && validacaoAutoRef.current !== filtroCompetencia) {
            validacaoAutoRef.current = filtroCompetencia;
            // Pequeno delay para não disparar antes do carregar()
            const t = setTimeout(() => validarWinthor(filtroCompetencia), 800);
            return () => clearTimeout(t);
        }
    }, [filtroCompetencia]);

    // Sincroniza NFS-e tomadas do ambiente nacional Gov.br (ADN) via mTLS
    // Loop automático: processa até MAX_LOTES lotes sequenciais por clique, parando quando todos os CNPJs finalizaram
    async function sincronizarAdn(silencioso = false, opcoes = {}) {
        setSincronizando(true);
        if (!silencioso) { setError(null); setInfo(null); }
        // Clique manual força (ignora cooldown) e processa mais lotes; auto-sync respeita cooldown
        const MAX_LOTES = silencioso ? 3 : 25;
        const payload = { forcar: true, ...opcoes }; // sempre forcar para não travar no meio do loop
        let totalNovos = 0;
        let lote = 0;
        try {
            while (lote < MAX_LOTES) {
                lote++;
                const r = await apiFetch("/api/fiscal/nfse/tomadas/sincronizar-adn", { method: "POST", body: JSON.stringify(payload) });
                if (r.precisaCertificado) {
                    setAdnSyncInfo({ tipo: "sem-certificado" });
                    if (silencioso) importarWinthor();
                    break;
                }
                if (r.erroAdn) {
                    const msg = r.mensagem || r.erro || "Erro ao consultar ADN";
                    setAdnSyncInfo({ tipo: "erro", mensagem: msg });
                    if (!silencioso) setError(msg);
                    if (silencioso) importarWinthor();
                    break;
                }
                totalNovos += r.novos || 0;
                // Parar quando todos os CNPJs finalizaram (semMaisDocumentos ou cooldown/E2220)
                const res = r.resultadosPorCnpj || [];
                const todosFinalizados = res.length === 0 || res.every(x => x.semMaisDocumentos || x.cooldown || x.e2220);
                if (todosFinalizados) break;
                // Aguarda 1.5s entre lotes para não sobrecarregar o ADN
                if (lote < MAX_LOTES) await new Promise(ok => setTimeout(ok, 1500));
            }
            const msgFinal = totalNovos > 0
                ? `${totalNovos} NFS-e(s) importada(s) em ${lote} lote(s).`
                : `Sincronizado. ${lote} lote(s) verificado(s) — nenhuma nota nova.`;
            setAdnSyncInfo({ tipo: "ok", novos: totalNovos, mensagem: msgFinal });
            if (totalNovos > 0) {
                setFiltroCompetencia("");
                carregar(1, { competencia: "" });
                if (!silencioso) setInfo(msgFinal + " Exibindo todas as competências.");
            } else {
                if (!silencioso) setInfo(msgFinal);
                carregar(1);
            }
        } catch (e) {
            setAdnSyncInfo({ tipo: "erro", mensagem: e.message });
            if (!silencioso) setError(e.message);
            if (silencioso) importarWinthor();
        } finally { setSincronizando(false); }
    }

    // Busca NFS-e do WinThor (PCLANC) como baseline de serviços contratados
    async function importarWinthor() {
        setImporting(true); setError(null); setInfo(null);
        try {
            const r = await apiFetch("/api/fiscal/nfse/tomadas/importar-winthor", { method: "POST", body: JSON.stringify({}) });
            setInfo(r.mensagem);
            carregar(1);
        } catch (e) { setError(e.message); } finally { setImporting(false); }
    }

    // Valida NFS-e do mês contra o WinThor (PCLANC/PCNFENT)
    // Fluxo: ADN Nacional (fonte) → WinThor (validação) → exibe apenas não lançadas
    async function validarWinthor(competencia) {
        setValidando(true); setError(null); setInfo(null);
        const comp = competencia || filtroCompetencia || new Date().toISOString().slice(0, 7);
        try {
            const r = await apiFetch("/api/fiscal/nfse/tomadas/validar-winthor", { method: "POST", body: JSON.stringify({ competencia: comp }) });
            setInfo(r.mensagem);
            carregar(page);
        } catch (e) { setError(e.message); }
        finally { setValidando(false); }
    }

    async function limparVaziosERessinc() {
        if (!window.confirm("Isso vai remover todas as notas com valor R$0,00 da lista. Confirmar?")) return;
        setLimpando(true); setError(null); setInfo(null);
        try {
            const r = await apiFetch("/api/fiscal/nfse/tomadas/limpar-vazios", { method: "POST", body: JSON.stringify({ resetarNSU: true }) });
            setInfo(r.mensagem);
            carregar(1, { competencia: "" });
            if (r.nsuReset) {
                setFiltroCompetencia("");
                setTimeout(() => sincronizarAdn(false), 800);
            }
        } catch (e) { setError(e.message); }
        finally { setLimpando(false); }
    }

    async function conciliarManual(id) {
        try {
            await apiFetch(`/api/fiscal/nfse/tomadas/${id}/conciliar`, { method: "PATCH", body: JSON.stringify({ conciliado: true }) });
            carregar(page);
        } catch (e) { setError(e.message); }
    }

    async function cadastrarFornecedor(id) {
        setCadastrandoFornec(id); setError(null); setInfo(null);
        try {
            const r = await apiFetch(`/api/fiscal/nfse/tomadas/${id}/cadastrar-fornecedor`, { method: "POST", body: JSON.stringify({}) });
            setInfo(`✅ ${r.mensagem}`);
            // Atualiza imediatamente no estado local para o botão sumir sem esperar reload
            setDocs(prev => prev.map(d => d.id === id ? { ...d, fornecedorCadastrado: true, winthorCodfornec: r.codfornec } : d));
            carregar(page);
        } catch (e) {
            setError(e.message);
        } finally { setCadastrandoFornec(null); }
    }

    async function lancarWinthor(id, dtvenc) {
        setLancando(id); setError(null); setInfo(null);
        try {
            const r = await apiFetch(`/api/fiscal/nfse/tomadas/${id}/lancar-winthor`, { method: "POST", body: JSON.stringify({ dtvenc: dtvenc || dtvencLancar }) });
            const detalhes = [
                r.mensagem || "NFS-e lançada no WinThor com sucesso!",
                r.dtvenc ? `Vencimento: ${formatDate(r.dtvenc)}` : null,
                r.historico ? `Histórico: ${r.historico}` : null,
                r.usouHistorico === false ? "(padrão fallback — sem histórico anterior)" : null,
            ].filter(Boolean).join(" | ");
            setInfo(detalhes);
            carregar(page);
        } catch (e) {
            setError(e.message);
        } finally { setLancando(null); }
    }

    async function desfazerLancamento(id) {
        if (!window.confirm("Isso vai resetar o status WinThor desta nota para 'não validado'. Confirme que o lançamento já foi cancelado no WinThor antes de continuar.")) return;
        try {
            const r = await apiFetch(`/api/fiscal/nfse/tomadas/${id}/desfazer-lancamento`, { method: "PATCH", body: JSON.stringify({}) });
            setInfo(r.mensagem);
            setSelected(null);
            carregar(page);
        } catch (e) { setError(e.message); }
    }

    async function excluirTomada(id) {
        if (!window.confirm("Excluir esta NFS-e tomada do sistema? Esta ação não pode ser desfeita.")) return;
        try {
            await apiFetch(`/api/fiscal/nfse/tomadas/${id}`, { method: "DELETE" });
            setInfo("Nota excluída com sucesso.");
            setSelected(null);
            carregar(page);
        } catch (e) { setError(e.message); }
    }

    // Server-side filtered — docs already matches filtroWinthor
    const docsFiltrados = docs;
    const totalValorFiltrado = docs.reduce((s, d) => s + Number(d.valorServico || 0), 0);

    return hs("div", { style: { padding: "24px", maxWidth: "1280px", margin: "0 auto" } }, [
        // Cabeçalho
        hs("div", { key: "hdr", style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", flexWrap: "wrap", gap: "12px" } }, [
            hs("div", { key: "title" }, [
                h("h1", { key: "h1", style: { fontSize: "22px", fontWeight: 700, margin: 0 } }, "NFS-e Tomadas"),
                h("p", { key: "sub", style: { color: "#6b7280", fontSize: "13px", margin: "4px 0 0" } },
                    validando
                        ? `⏳ Verificando notas no WinThor...`
                        : filtroWinthor === "nao"
                            ? `${total} nota(s) NÃO lançadas no WinThor — Total: ${totalValorFiltrado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
                            : filtroWinthor === "sim"
                                ? `${total} nota(s) já lançadas no WinThor — Total: ${totalValorFiltrado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
                                : filtroWinthor === "pendente"
                                    ? `${total} nota(s) ainda não verificadas`
                                    : `${total} nota(s) — Total: ${totalValorFiltrado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
                ),
            ]),
            hs("div", { key: "btns-hdr", style: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" } }, [
                // Grupo ADN: sincronizar + "desde o início"
                hs("div", { key: "grp-adn", style: { display: "flex", borderRadius: "8px", overflow: "hidden", border: `2px solid ${temCertificado ? "#059669" : "#6b7280"}` } }, [
                    h("button", {
                        key: "btn-adn",
                        onClick: () => sincronizarAdn(false),
                        disabled: sincronizando || importing,
                        title: "Busca NFS-e tomadas do ambiente nacional Gov.br (ADN) — ignora cooldown de 1h",
                        style: { padding: "7px 14px", background: temCertificado ? "#059669" : "#6b7280", color: "#fff", border: "none", fontWeight: 600, fontSize: "13px", cursor: "pointer" },
                    }, sincronizando ? "Sincronizando..." : "🔄 Sincronizar ADN"),
                    h("button", {
                        key: "btn-adn-reset",
                        onClick: () => {
                            const cnpjFilial = window.prompt(
                                "CNPJ completo da filial tomadora (14 dígitos, ex: 41032961002451):\n" +
                                "Deixe em branco para usar o CNPJ padrão do certificado.\n" +
                                "Use quando a nota foi emitida para uma filial específica.",
                                ""
                            );
                            if (cnpjFilial === null) return; // cancelou
                            const opcoes = { resetarNSU: true };
                            if (cnpjFilial.trim()) opcoes.cnpjConsulta = cnpjFilial.replace(/\D/g, "");
                            sincronizarAdn(false, opcoes);
                        },
                        disabled: sincronizando || importing,
                        title: "Reinicia a busca desde o início — permite especificar CNPJ de filial específica",
                        style: { padding: "7px 10px", background: temCertificado ? "#047857" : "#4b5563", color: "#fff", border: "none", borderLeft: "1px solid rgba(255,255,255,0.3)", fontWeight: 700, fontSize: "13px", cursor: "pointer" },
                    }, "↺"),
                ]),
                h("button", {
                    key: "btn-wt", onClick: importarWinthor, disabled: importing || sincronizando,
                    title: "Importa contas a pagar de serviços do WinThor (PCLANC) como complemento",
                    style: { padding: "7px 14px", background: "#f59e0b", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, fontSize: "13px", cursor: "pointer" },
                }, importing ? "Importando..." : "📥 WinThor PCLANC"),
                h("button", {
                    key: "btn-val", onClick: () => validarWinthor(filtroCompetencia), disabled: validando,
                    title: `Verifica se as NFS-e de ${filtroCompetencia} constam no WinThor (PCLANC/PCNFENT)`,
                    style: { padding: "7px 14px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, fontSize: "13px", cursor: "pointer" },
                }, validando ? "⏳ Validando..." : "🔍 Validar WinThor"),
                h("button", {
                    key: "btn-chave", onClick: () => setShowBuscaChave(true),
                    title: "Buscar NFS-e específica pela Chave de Acesso impressa no DANFSe (consulta direta no ADN)",
                    style: { padding: "7px 14px", background: "#1d4ed8", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, fontSize: "13px", cursor: "pointer" },
                }, "🔑 Buscar por Chave"),
                h("button", {
                    key: "btn-xml", onClick: () => setShowImportarXml(true),
                    title: "Importe o arquivo XML baixado do portal NFSe.gov.br — todos os campos são preenchidos automaticamente",
                    style: { padding: "7px 14px", background: "#0891b2", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, fontSize: "13px", cursor: "pointer" },
                }, "📋 Importar XML"),
                h("button", {
                    key: "btn-limpar", onClick: limparVaziosERessinc, disabled: limpando,
                    title: "Remove todas as notas com valor R$0,00 da lista",
                    style: { padding: "7px 14px", background: "#b45309", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, fontSize: "13px", cursor: "pointer", opacity: limpando ? 0.7 : 1 },
                }, limpando ? "⏳ Limpando..." : "🧹 Remover Notas R$0,00"),
                h("button", {
                    key: "btn-manual", onClick: () => setShowManual(true),
                    title: "Inserir NFS-e manualmente a partir do DANFSe físico (quando município não está integrado ao ADN)",
                    style: { padding: "7px 14px", background: "#0f172a", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, fontSize: "13px", cursor: "pointer" },
                }, "➕ Inserir Manualmente"),
            ]),
        ]),

        // Modal buscar por chave de acesso
        showBuscaChave && h(ModalBuscaChave, {
            key: "modal-chave",
            onClose: () => setShowBuscaChave(false),
            onImportado: (msg) => { setShowBuscaChave(false); setInfo(msg); setFiltroCompetencia(""); carregar(1, { competencia: "" }); },
            onManual: () => { setShowBuscaChave(false); setShowManual(true); },
            onSincronizar: () => { setShowBuscaChave(false); sincronizarAdn(false); },
        }),
        // Modal de cadastro manual
        showManual && h(ModalManual, {
            key: "modal-manual",
            onClose: () => setShowManual(false),
            onSalvo: (msg) => { setShowManual(false); setInfo(msg); carregar(1); },
        }),
        // Modal importar XML
        showImportarXml && h(ModalImportarXml, {
            key: "modal-xml",
            onClose: () => setShowImportarXml(false),
            onImportado: (msg) => { setShowImportarXml(false); setInfo(msg); setFiltroCompetencia(""); carregar(1, { competencia: "" }); },
        }),

        // Banner status certificado ADN
        temCertificado === false && h("div", { key: "cert-warn", style: { background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: "8px", padding: "12px 16px", marginBottom: "12px", fontSize: "13px", color: "#92400e" } },
            "⚠️ Nenhum certificado digital A1 ativo. Para buscar NFS-e tomadas do ambiente nacional (Gov.br), " +
            "configure seu certificado ICP-Brasil em Fiscal > Certificados, depois clique em \"Sincronizar Nacional (ADN)\". " +
            "Sem o certificado, somente as contas a pagar do WinThor (PCLANC) são exibidas."
        ),
        adnSyncInfo?.tipo === "sem-certificado" && h("div", { key: "cert-info", style: { background: "#fef3c7", border: "1px solid #fbbf24", borderRadius: "8px", padding: "10px 16px", marginBottom: "12px", fontSize: "13px", color: "#92400e" } },
            "⚠️ Configure o certificado digital A1 em Fiscal > Certificados para sincronizar com o Gov.br."
        ),
        // Banner: status da validação
        validando && h("div", { key: "val-banner", style: { background: "#f3f0ff", border: "1px solid #a78bfa", borderRadius: "8px", padding: "10px 16px", marginBottom: "12px", fontSize: "13px", color: "#5b21b6" } },
            `⏳ Verificando notas de ${filtroCompetencia} no WinThor (PCLANC/PCNFENT)...`
        ),

        // Filtros
        h(Card, { key: "filtros", style: { marginBottom: "16px" } },
            h(CardContent, {},
                hs("div", { style: { display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-end" } }, [
                    hs("div", { key: "f1" }, [
                        h("label", { key: "l1", style: { fontSize: "12px", color: "#6b7280", display: "block", marginBottom: "4px" } }, "Status"),
                        h("select", {
                            key: "s1", value: filtroStatus, onChange: e => setFiltroStatus(e.target.value),
                            style: { border: "1px solid #d1d5db", borderRadius: "6px", padding: "6px 10px", fontSize: "13px" },
                        }, [
                            h("option", { key: "all", value: "" }, "Todos"),
                            h("option", { key: "a", value: "ATIVA" }, "Ativa"),
                            h("option", { key: "c", value: "CANCELADA" }, "Cancelada"),
                        ]),
                    ]),
                    hs("div", { key: "f2" }, [
                        h("label", { key: "l2", style: { fontSize: "12px", color: "#6b7280", display: "block", marginBottom: "4px" } }, "Consta no WinThor"),
                        h("select", {
                            key: "s2", value: filtroWinthor, onChange: e => setFiltroWinthor(e.target.value),
                            style: { border: "1px solid #d1d5db", borderRadius: "6px", padding: "6px 10px", fontSize: "13px" },
                        }, [
                            h("option", { key: "all", value: "" }, "Todas"),
                            h("option", { key: "s", value: "sim" }, "✅ Consta"),
                            h("option", { key: "n", value: "nao" }, "❌ Não consta"),
                            h("option", { key: "p", value: "pendente" }, "⏳ Não validado"),
                        ]),
                    ]),
                    hs("div", { key: "f3" }, [
                        h("label", { key: "l3", style: { fontSize: "12px", color: "#6b7280", display: "block", marginBottom: "4px" } }, "Competência"),
                        h("input", {
                            key: "i3", type: "month", value: filtroCompetencia,
                            onChange: e => setFiltroCompetencia(e.target.value),
                            style: { border: "1px solid #d1d5db", borderRadius: "6px", padding: "6px 10px", fontSize: "13px" },
                        }),
                    ]),
                    hs("div", { key: "f4", style: { flex: 1, minWidth: "200px" } }, [
                        h("label", { key: "l4", style: { fontSize: "12px", color: "#6b7280", display: "block", marginBottom: "4px" } }, "Busca"),
                        hs("div", { key: "brow", style: { display: "flex", gap: "6px" } }, [
                            h("input", {
                                key: "i4", type: "text", value: filtroBusca, placeholder: "Prestador, Nº NFS-e...",
                                onChange: e => setFiltroBusca(e.target.value),
                                onKeyDown: e => e.key === "Enter" && carregar(1),
                                style: { border: "1px solid #d1d5db", borderRadius: "6px", padding: "6px 10px", fontSize: "13px", flex: 1 },
                            }),
                            h("button", {
                                key: "btnb", onClick: () => carregar(1),
                                style: { padding: "6px 14px", background: "#374151", color: "#fff", border: "none", borderRadius: "6px", fontSize: "13px", cursor: "pointer" },
                            }, "Buscar"),
                        ]),
                    ]),
                    hs("div", { key: "f5" }, [
                        h("label", { key: "l5", style: { fontSize: "12px", color: "#6b7280", display: "block", marginBottom: "4px" } }, "Filial"),
                        h("input", {
                            key: "i5", type: "text", value: filtroFilial, placeholder: "Cód. filial",
                            onChange: e => { setFiltroFilial(e.target.value); },
                            onKeyDown: e => e.key === "Enter" && carregar(1),
                            style: { border: "1px solid #d1d5db", borderRadius: "6px", padding: "6px 10px", fontSize: "13px", width: "100px" },
                        }),
                    ]),
                ])
            )
        ),

        error && h("div", { key: "err", style: { background: "#fee2e2", color: "#991b1b", borderRadius: "8px", padding: "12px 16px", marginBottom: "12px", fontSize: "13px" } }, `⚠️ ${error}`),
        info && hs("div", { key: "inf", style: { background: "#dbeafe", color: "#1e40af", borderRadius: "8px", padding: "12px 16px", marginBottom: "12px", fontSize: "13px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" } }, [
            h("span", { key: "msg" }, `ℹ️ ${info}`),
            // Se o info for mensagem de cooldown, oferece botão para forçar "desde o início"
            info.includes("espera") && h("button", {
                key: "force-btn",
                onClick: () => { setInfo(null); sincronizarAdn(false, { resetarNSU: true }); },
                disabled: sincronizando,
                style: { padding: "5px 12px", background: "#1e40af", color: "#fff", border: "none", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" },
            }, "↺ Buscar desde o início"),
        ]),

        // Tabela
        h(Card, { key: "tabela" },
            h(CardContent, {},
                loading
                    ? h("div", { style: { textAlign: "center", padding: "48px", color: "#9ca3af" } }, "Carregando...")
                    : docsFiltrados.length === 0
                        ? hs("div", { style: { textAlign: "center", padding: "48px", color: "#9ca3af" } }, [
                            h("div", { key: "i", style: { fontSize: "48px", marginBottom: "12px" } }, validando ? "⏳" : "📄"),
                            h("div", { key: "t", style: { fontWeight: 600 } },
                                validando ? "Verificando no WinThor..." :
                                "Nenhuma NFS-e tomada encontrada"
                            ),
                            h("div", { key: "s", style: { fontSize: "13px", marginTop: "4px" } },
                                validando ? `Cruzando notas de ${filtroCompetencia} com PCLANC e PCNFENT...` :
                                total === 0 ? "Clique em \"WinThor PCLANC\" ou \"Sincronizar Nacional (ADN)\" para importar NFS-e." :
                                "Nenhuma nota corresponde ao filtro selecionado."
                            ),
                        ])
                        : hs("div", { style: { overflowX: "auto" } },
                            hs("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: "13px" } }, [
                                h("thead", { key: "th" },
                                    h("tr", { style: { borderBottom: "2px solid #e5e7eb", background: "#f9fafb" } },
                                        ["Nº NFS-e", "Prestador", "CNPJ", "Competência", "Valor", "ISS", "WinThor", "Emissão", "Ações"].map(c =>
                                            h("th", { key: c, style: { padding: "8px 12px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap", fontSize: "12px" } }, c)
                                        )
                                    )
                                ),
                                h("tbody", { key: "tb" },
                                    docsFiltrados.map((doc, i) =>
                                        h("tr", {
                                            key: doc.id || i,
                                            style: {
                                                borderBottom: "1px solid #f3f4f6",
                                                background: doc.constaWinthor === false
                                                    ? "#fff7f7"
                                                    : i % 2 === 0 ? "#fff" : "#fafafa",
                                            },
                                        },
                                            h("td", { style: { padding: "6px 12px", fontFamily: "monospace", fontSize: "12px" } }, doc.numeroNfse || "—"),
                                            h("td", { style: { padding: "6px 12px", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, doc.nomePrestador || "—"),
                                            h("td", { style: { padding: "6px 12px", fontFamily: "monospace", fontSize: "11px" } }, formatCnpj(doc.cnpjPrestador)),
                                            h("td", { style: { padding: "6px 12px" } }, doc.competencia || "—"),
                                            h("td", { style: { padding: "6px 12px", textAlign: "right" } }, formatMoney(doc.valorServico)),
                                            h("td", { style: { padding: "6px 12px", textAlign: "right" } }, formatMoney(doc.valorIss)),
                                            h("td", { style: { padding: "6px 12px" } }, h(BadgeWinthor, { constaWinthor: doc.constaWinthor })),
                                            h("td", { style: { padding: "6px 12px", whiteSpace: "nowrap" } }, formatDate(doc.dataEmissao)),
                                            h("td", { style: { padding: "6px 12px" } },
                                                (function() {
                                                        const cnpjDigits = String(doc.cnpjPrestador || "").replace(/\D/g, "");
                                                        const temCnpj = cnpjDigits.length >= 11;
                                                        const jaCadastrado = doc.fornecedorCadastrado || !!doc.winthorCodfornec;
                                                        return hs("div", { style: { display: "flex", gap: "4px", flexWrap: "wrap" } }, [
                                                            h("button", {
                                                                key: "d", onClick: () => setSelected(doc),
                                                                style: { fontSize: "11px", padding: "3px 8px", borderRadius: "5px", border: "1px solid #d1d5db", background: "#f9fafb", cursor: "pointer" },
                                                            }, "Detalhes"),
                                                            // "Cadastrar Emitente" — só se tem CNPJ válido e emitente ainda NÃO cadastrado
                                                            temCnpj && !jaCadastrado && doc.constaWinthor !== true && h("button", {
                                                                key: "cad",
                                                                onClick: () => cadastrarFornecedor(doc.id),
                                                                disabled: cadastrandoFornec === doc.id || lancando === doc.id,
                                                                title: "Verificar/cadastrar o emitente em PCFORNEC no WinThor",
                                                                style: { fontSize: "11px", padding: "3px 8px", borderRadius: "5px", border: "1px solid #f59e0b", background: cadastrandoFornec === doc.id ? "#fef3c7" : "#fffbeb", color: "#92400e", cursor: (cadastrandoFornec === doc.id || lancando === doc.id) ? "default" : "pointer", opacity: (cadastrandoFornec === doc.id || lancando === doc.id) ? 0.7 : 1 },
                                                            }, cadastrandoFornec === doc.id ? "⏳ Verificando..." : "👤 Cadastrar Emitente"),
                                                            // "Lançar Nota" — só se tem CNPJ válido e ainda não lançada
                                                            temCnpj && doc.constaWinthor !== true && h("button", {
                                                                key: "lanc",
                                                                onClick: () => setSelected(doc),
                                                                disabled: lancando === doc.id || cadastrandoFornec === doc.id,
                                                                title: "Abrir detalhes para informar vencimento e lançar no WinThor",
                                                                style: { fontSize: "11px", padding: "3px 8px", borderRadius: "5px", border: "1px solid #a78bfa", background: lancando === doc.id ? "#e9d5ff" : "#f5f3ff", color: "#5b21b6", cursor: (lancando === doc.id || cadastrandoFornec === doc.id) ? "default" : "pointer", opacity: (lancando === doc.id || cadastrandoFornec === doc.id) ? 0.7 : 1 },
                                                            }, lancando === doc.id ? "⏳ Lançando..." : "📋 Lançar Nota"),
                                                        ].filter(Boolean));
                                                    })()
                                            ),
                                        )
                                    )
                                ),
                            ])
                        )
            )
        ),

        totalPages > 1 && hs("div", { key: "pag", style: { display: "flex", justifyContent: "center", gap: "8px", marginTop: "16px" } }, [
            h("button", { key: "prev", disabled: page <= 1, onClick: () => carregar(page - 1), style: { padding: "6px 14px", border: "1px solid #d1d5db", borderRadius: "6px", background: "#fff", cursor: page <= 1 ? "default" : "pointer", opacity: page <= 1 ? 0.5 : 1 } }, "← Anterior"),
            h("span", { key: "pg", style: { padding: "6px 12px", fontSize: "13px", color: "#6b7280" } }, `${page} / ${totalPages}`),
            h("button", { key: "next", disabled: page >= totalPages, onClick: () => carregar(page + 1), style: { padding: "6px 14px", border: "1px solid #d1d5db", borderRadius: "6px", background: "#fff", cursor: page >= totalPages ? "default" : "pointer", opacity: page >= totalPages ? 0.5 : 1 } }, "Próxima →"),
        ]),

        // Modal detalhes
        selected && hs("div", { key: "modal", style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 } },
            hs("div", { style: { background: "#fff", borderRadius: "12px", padding: "28px", maxWidth: "560px", width: "100%", maxHeight: "80vh", overflowY: "auto" } }, [
                hs("div", { key: "mhdr", style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" } }, [
                    h("h2", { key: "mh2", style: { fontSize: "16px", fontWeight: 700, margin: 0 } }, `NFS-e Tomada — ${selected.numeroNfse || selected.id}`),
                    h("button", { key: "mcl", onClick: () => setSelected(null), style: { border: "none", background: "none", fontSize: "22px", cursor: "pointer", color: "#9ca3af" } }, "×"),
                ]),
                // Status WinThor destacado
                hs("div", { key: "wtstatus", style: { marginBottom: "16px", padding: "10px 14px", borderRadius: "8px", background: selected.constaWinthor === true ? "#dcfce7" : selected.constaWinthor === false ? "#fee2e2" : "#f3f4f6" } }, [
                    h("div", { key: "wt-lbl", style: { fontSize: "11px", fontWeight: 700, color: "#6b7280", marginBottom: "4px" } }, "STATUS WINTHOR (PCLANC)"),
                    h("div", { key: "wt-val", style: { fontWeight: 700, fontSize: "14px" } },
                        selected.constaWinthor === true ? "✅ Consta no WinThor" :
                        selected.constaWinthor === false ? "❌ NÃO consta no WinThor — lançar no ERP" :
                        "⏳ Ainda não validado — clique em \"Validar no WinThor\""
                    ),
                ]),
                hs("dl", { key: "dlist", style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 24px", fontSize: "13px" } },
                    [
                        ["Nº NFS-e", selected.numeroNfse || "—"],
                        ["Prestador", selected.nomePrestador || "—"],
                        ["CNPJ Prestador", formatCnpj(selected.cnpjPrestador)],
                        ["Competência", selected.competencia || "—"],
                        ["Valor Serviço", formatMoney(selected.valorServico)],
                        ["Valor ISS", formatMoney(selected.valorIss)],
                        ["Alíquota ISS", `${selected.aliquotaIss || 0}%`],
                        ["Emissão", formatDate(selected.dataEmissao)],
                        ["Origem", selected.origem || "—"],
                        selected.pclancId && ["PCLANC ID", String(selected.pclancId)],
                        selected.pclanc && ["PCLANC", String(selected.pclanc)],
                    ].filter(Boolean).map(([k, v]) =>
                        hs("div", { key: k }, [
                            h("dt", { key: "dt", style: { fontSize: "11px", color: "#6b7280", fontWeight: 600, textTransform: "uppercase" } }, k),
                            h("dd", { key: "dd", style: { margin: 0 } }, v),
                        ])
                    )
                ),
                selected.descricaoServico && hs("div", { key: "desc", style: { marginTop: "16px", padding: "12px", background: "#f9fafb", borderRadius: "8px" } }, [
                    h("div", { key: "dl", style: { fontSize: "11px", fontWeight: 600, color: "#6b7280", marginBottom: "4px" } }, "DESCRIÇÃO"),
                    h("div", { key: "dv", style: { fontSize: "13px" } }, selected.descricaoServico),
                ]),
                selected.constaWinthor !== true && hs("div", {
                    key: "lancar-bloco",
                    style: { marginTop: "16px", padding: "12px", background: "#f5f3ff", borderRadius: "8px", border: "1px solid #ddd6fe" },
                }, [
                    hs("label", { key: "lbl", style: { display: "block", fontSize: "11px", fontWeight: 700, color: "#5b21b6", marginBottom: "6px", textTransform: "uppercase" } }, [
                        "📅 Data de Vencimento (Contas a Pagar)",
                    ]),
                    h("input", {
                        key: "inp",
                        type: "date",
                        value: dtvencLancar,
                        onChange: e => setDtvencLancar(e.target.value),
                        style: { width: "100%", padding: "8px 10px", border: "1px solid #c4b5fd", borderRadius: "6px", fontSize: "13px", marginBottom: "10px", boxSizing: "border-box", background: "#fff" },
                    }),
                    h("button", {
                        key: "btn",
                        disabled: lancando === selected.id || !dtvencLancar,
                        onClick: () => { const v = dtvencLancar; setSelected(null); lancarWinthor(selected.id, v); },
                        style: { width: "100%", padding: "10px", background: lancando === selected.id ? "#a78bfa" : "#7c3aed", color: "#fff", border: "none", borderRadius: "8px", fontWeight: 600, cursor: (lancando === selected.id || !dtvencLancar) ? "default" : "pointer", fontSize: "14px" },
                    }, lancando === selected.id ? "⏳ Lançando no WinThor..." : "⬆ Lançar no WinThor"),
                ]),
                hs("div", { key: "btns-danger", style: { display: "flex", gap: "8px", marginTop: "10px" } }, [
                    selected.constaWinthor === true && h("button", {
                        key: "desfazer",
                        onClick: () => desfazerLancamento(selected.id),
                        style: { flex: 1, padding: "8px", background: "#fff7ed", color: "#c2410c", border: "1px solid #fed7aa", borderRadius: "8px", fontWeight: 600, fontSize: "13px", cursor: "pointer" },
                    }, "↩ Desfazer Lançamento"),
                    h("button", {
                        key: "excluir",
                        onClick: () => excluirTomada(selected.id),
                        style: { flex: selected.constaWinthor === true ? "0 0 auto" : 1, padding: "8px 16px", background: "#fff1f2", color: "#be123c", border: "1px solid #fecdd3", borderRadius: "8px", fontWeight: 600, fontSize: "13px", cursor: "pointer" },
                    }, "🗑 Excluir"),
                ].filter(Boolean)),
            ])
        ),
    ]);
}

export default FiscalNFSeTomadasPage;
