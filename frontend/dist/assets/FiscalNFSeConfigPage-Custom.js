import { r as React, j as jsxRuntime } from "./index-Cw1PFMX8.js";

const h = React.createElement;

function getToken() { try { return JSON.parse(localStorage.getItem("sgq.authSession") || "{}").token || ""; } catch { return ""; } }
async function apiFetch(path, opts) {
    const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(opts?.headers || {}) } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || json?.message || `Erro ${res.status}`);
    return json;
}

function Field({ label, value, onChange, type, options, readOnly }) {
    const style = { border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: 13, width: "100%", boxSizing: "border-box", background: readOnly ? "#f9fafb" : "#fff" };
    return h("div", { style: { display: "flex", flexDirection: "column", gap: 4 } },
        h("label", { style: { fontSize: 12, color: "#374151", fontWeight: 600 } }, label),
        options ?
            h("select", { value: value || "", onChange: e => onChange && onChange(e.target.value), style, disabled: readOnly },
                h("option", { value: "" }, "Selecionar..."),
                options.map(o => h("option", { key: o.value || o, value: o.value || o }, o.label || o))
            ) :
            h("input", { type: type || "text", value: value || "", onChange: e => onChange && onChange(e.target.value), style, readOnly })
    );
}

export default function FiscalNFSeConfigPage() {
    const [config, setConfig] = React.useState(null);
    const [loading, setLoading] = React.useState(true);
    const [salvando, setSalvando] = React.useState(false);
    const [erro, setErro] = React.useState("");
    const [info, setInfo] = React.useState("");

    React.useEffect(() => {
        apiFetch("/api/fiscal/nfse/config")
            .then(c => setConfig(c || {}))
            .catch(e => setErro(e.message))
            .finally(() => setLoading(false));
    }, []);

    const setF = (k, v) => setConfig(p => ({ ...p, [k]: v }));

    const salvar = async () => {
        setSalvando(true); setErro(""); setInfo("");
        try {
            await apiFetch("/api/fiscal/nfse/config", { method: "PUT", body: JSON.stringify(config) });
            setInfo("Configuracoes salvas com sucesso.");
        } catch (e) { setErro(e.message); }
        finally { setSalvando(false); }
    };

    const section = (title, children) => h("div", { style: { background: "#fff", borderRadius: 10, padding: 20, boxShadow: "0 1px 4px #0001", marginBottom: 16 } },
        h("h3", { style: { margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#374151" } }, title),
        children
    );

    if (loading) return h("div", { style: { padding: 40, textAlign: "center", color: "#6b7280" } }, "Carregando configuracoes...");

    return h("div", { style: { padding: 24, minHeight: "100vh", background: "#f9fafb", maxWidth: 860, margin: "0 auto" } },
        h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 } },
            h("h1", { style: { fontSize: 20, fontWeight: 700, margin: 0 } }, "Configuracoes NFS-e"),
            h("button", { onClick: salvar, disabled: salvando || !config,
                style: { background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "9px 22px", cursor: "pointer", fontWeight: 600, fontSize: 13 } },
                salvando ? "Salvando..." : "Salvar Configuracoes")
        ),
        erro && h("div", { style: { background: "#fef2f2", color: "#dc2626", padding: "10px 16px", borderRadius: 8, marginBottom: 12 } }, erro),
        info && h("div", { style: { background: "#f0fdf4", color: "#16a34a", padding: "10px 16px", borderRadius: 8, marginBottom: 12 } }, info),
        config && h("div", null,
            section("Prestador de Servicos",
                h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 } },
                    h(Field, { label: "CNPJ do Prestador", value: config.cnpjPrestador, onChange: v => setF("cnpjPrestador", v) }),
                    h(Field, { label: "Razao Social", value: config.razaoSocial, onChange: v => setF("razaoSocial", v) }),
                    h(Field, { label: "Inscricao Municipal", value: config.inscricaoMunicipal, onChange: v => setF("inscricaoMunicipal", v) }),
                    h(Field, { label: "Municipio", value: config.municipio, onChange: v => setF("municipio", v) }),
                    h(Field, { label: "Codigo do Municipio (IBGE)", value: config.codigoMunicipio, onChange: v => setF("codigoMunicipio", v) }),
                    h(Field, { label: "UF", value: config.uf, onChange: v => setF("uf", v) }),
                )
            ),
            section("Parametros Fiscais",
                h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 } },
                    h(Field, { label: "Regime Tributario", value: config.regimeTributario, onChange: v => setF("regimeTributario", v),
                        options: [
                            { value: "SIMPLES_NACIONAL", label: "Simples Nacional" },
                            { value: "LUCRO_PRESUMIDO", label: "Lucro Presumido" },
                            { value: "LUCRO_REAL", label: "Lucro Real" },
                        ]
                    }),
                    h(Field, { label: "Ambiente", value: config.ambiente, onChange: v => setF("ambiente", v),
                        options: [
                            { value: "PRODUCAO", label: "Producao" },
                            { value: "HOMOLOGACAO", label: "Homologacao" },
                        ]
                    }),
                    h(Field, { label: "Aliquota ISS Padrao (%)", value: config.aliquotaPadraoIss, onChange: v => setF("aliquotaPadraoIss", v), type: "number" }),
                    h(Field, { label: "Serie Padrao", value: config.seriePadrao, onChange: v => setF("seriePadrao", v) }),
                    h(Field, { label: "Numero Inicial", value: config.numeroInicial, onChange: v => setF("numeroInicial", v), type: "number" }),
                )
            ),
            section("Integracao com Prefeitura",
                h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 } },
                    h(Field, { label: "URL Webservice Producao", value: config.urlWebserviceProducao, onChange: v => setF("urlWebserviceProducao", v) }),
                    h(Field, { label: "URL Webservice Homologacao", value: config.urlWebserviceHomologacao, onChange: v => setF("urlWebserviceHomologacao", v) }),
                    h(Field, { label: "Usuario (login prefeitura)", value: config.usuarioPrefeitura, onChange: v => setF("usuarioPrefeitura", v) }),
                    h(Field, { label: "Senha (login prefeitura)", value: config.senhaPrefeitura, onChange: v => setF("senhaPrefeitura", v), type: "password" }),
                )
            ),
            section("E-mail e Notificacoes",
                h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 } },
                    h(Field, { label: "E-mail Padrao para Envio de NFS-e", value: config.emailPadrao, onChange: v => setF("emailPadrao", v), type: "email" }),
                    h(Field, { label: "Assunto Padrao do E-mail", value: config.emailAssunto, onChange: v => setF("emailAssunto", v) }),
                ),
                h("div", { style: { marginTop: 14, display: "flex", gap: 20 } },
                    [
                        ["Enviar NFS-e por E-mail automaticamente", "enviarEmailAutomatico"],
                        ["Notificar cancelamentos", "notificarCancelamento"],
                    ].map(([label, key]) => h("label", { key, style: { display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#374151" } },
                        h("input", { type: "checkbox", checked: !!config[key], onChange: e => setF(key, e.target.checked), style: { width: 16, height: 16 } }),
                        label
                    ))
                )
            )
        )
    );
}
