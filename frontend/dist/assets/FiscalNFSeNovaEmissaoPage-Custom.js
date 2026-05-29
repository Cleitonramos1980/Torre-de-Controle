import { r as React, j as jsxRuntime } from "./index-Cw1PFMX8.js";

const h = React.createElement;

function getToken() { try { return JSON.parse(localStorage.getItem("sgq.authSession") || "{}").token || ""; } catch { return ""; } }
async function apiFetch(path, opts) {
    const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(opts?.headers || {}) } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || json?.message || `Erro ${res.status}`);
    return json;
}

function inp(label, value, onChange, opts) {
    return h("div", { style: { display: "flex", flexDirection: "column", gap: 4 } },
        h("label", { style: { fontSize: 12, color: "#374151", fontWeight: 600 } }, label, opts?.required && h("span", { style: { color: "#dc2626" } }, " *")),
        h("input", { type: opts?.type || "text", value, onChange: e => onChange(e.target.value), placeholder: opts?.placeholder || "",
            style: { border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: 13, ...(opts?.style || {}) } })
    );
}

const emptyForm = () => ({
    tomadorNome: "", tomadorCnpj: "", tomadorEmail: "", tomadorTelefone: "",
    codigoServico: "", discriminacao: "", valorServico: "", aliquotaIss: "",
    issRetido: false, dataCompetencia: new Date().toISOString().slice(0, 7),
    observacoes: "",
});

export default function FiscalNFSeNovaEmissaoPage() {
    const [form, setForm] = React.useState(emptyForm());
    const [servicos, setServicos] = React.useState([]);
    const [tomadores, setTomadores] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [loadingServicos, setLoadingServicos] = React.useState(true);
    const [erro, setErro] = React.useState("");
    const [sucesso, setSucesso] = React.useState("");
    const [buscandoTomador, setBuscandoTomador] = React.useState(false);

    React.useEffect(() => {
        Promise.all([
            apiFetch("/api/fiscal/nfse/servicos").catch(() => ({ items: [] })),
            apiFetch("/api/fiscal/nfse/tomadores").catch(() => ({ items: [] })),
        ]).then(([s, t]) => {
            setServicos(s.items || s.data || []);
            setTomadores(t.items || t.data || []);
        }).finally(() => setLoadingServicos(false));
    }, []);

    const setF = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const selecionarServico = (cod) => {
        const s = servicos.find(x => x.codigo === cod);
        if (s) { setF("codigoServico", cod); setF("aliquotaIss", String(s.aliquota || "")); }
        else setF("codigoServico", cod);
    };

    const selecionarTomador = (id) => {
        const t = tomadores.find(x => x.id === id);
        if (t) {
            setForm(p => ({ ...p, tomadorNome: t.nome || "", tomadorCnpj: t.cnpj || "", tomadorEmail: t.email || "", tomadorTelefone: t.telefone || "" }));
        }
    };

    const buscarTomadorPorCnpj = async () => {
        if (!form.tomadorCnpj.replace(/\D/g,"").length) return;
        setBuscandoTomador(true);
        try {
            const r = await apiFetch(`/api/fiscal/nfse/tomadores?cnpj=${encodeURIComponent(form.tomadorCnpj)}`);
            const t = (r.items || r.data || [])[0];
            if (t) { setForm(p => ({ ...p, tomadorNome: t.nome || p.tomadorNome, tomadorEmail: t.email || p.tomadorEmail, tomadorTelefone: t.telefone || p.tomadorTelefone })); }
        } catch { }
        finally { setBuscandoTomador(false); }
    };

    const emitir = async () => {
        setErro(""); setSucesso(""); setLoading(true);
        try {
            const payload = { ...form, valorServico: Number(form.valorServico) || 0, aliquotaIss: Number(form.aliquotaIss) || 0 };
            const r = await apiFetch("/api/fiscal/nfse/emitir", { method: "POST", body: JSON.stringify(payload) });
            setSucesso(`NFS-e emitida com sucesso! Numero: ${r.numero || r.id || "—"}`);
            setForm(emptyForm());
        } catch (e) { setErro(e.message); }
        finally { setLoading(false); }
    };

    const section = (title, children) => h("div", { style: { background: "#fff", borderRadius: 10, padding: 20, boxShadow: "0 1px 4px #0001", marginBottom: 16 } },
        h("h3", { style: { margin: "0 0 16px", fontSize: 14, fontWeight: 700, color: "#374151" } }, title),
        children
    );

    return h("div", { style: { padding: 24, minHeight: "100vh", background: "#f9fafb", maxWidth: 900, margin: "0 auto" } },
        h("div", { style: { display: "flex", alignItems: "center", gap: 16, marginBottom: 24 } },
            h("button", { onClick: () => window.location.hash = "#/fiscal/nfse-emitidas",
                style: { background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13 } }, "← Voltar"),
            h("h1", { style: { fontSize: 20, fontWeight: 700, margin: 0 } }, "Nova Emissao NFS-e")
        ),
        erro && h("div", { style: { background: "#fef2f2", color: "#dc2626", padding: "10px 16px", borderRadius: 8, marginBottom: 12 } }, erro),
        sucesso && h("div", { style: { background: "#f0fdf4", color: "#16a34a", padding: "10px 16px", borderRadius: 8, marginBottom: 12 } }, sucesso),
        // Tomadores rapidos
        tomadores.length > 0 && section("Tomadores Cadastrados",
            h("div", { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
                h("select", { onChange: e => selecionarTomador(e.target.value), value: "",
                    style: { border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px", fontSize: 13, minWidth: 280 } },
                    h("option", { value: "" }, "Selecionar tomador cadastrado..."),
                    tomadores.map(t => h("option", { key: t.id, value: t.id }, `${t.nome} — ${t.cnpj}`))
                )
            )
        ),
        // Dados do tomador
        section("Dados do Tomador",
            h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 } },
                inp("Nome / Razao Social", form.tomadorNome, v => setF("tomadorNome", v), { required: true }),
                h("div", { style: { display: "flex", flexDirection: "column", gap: 4 } },
                    h("label", { style: { fontSize: 12, color: "#374151", fontWeight: 600 } }, "CNPJ / CPF ", h("span", { style: { color: "#dc2626" } }, "*")),
                    h("div", { style: { display: "flex", gap: 6 } },
                        h("input", { value: form.tomadorCnpj, onChange: e => setF("tomadorCnpj", e.target.value), placeholder: "00.000.000/0000-00",
                            style: { flex: 1, border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: 13 } }),
                        h("button", { onClick: buscarTomadorPorCnpj, disabled: buscandoTomador,
                            style: { background: "#f3f4f6", border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 12px", cursor: "pointer", fontSize: 12 } },
                            buscandoTomador ? "..." : "Buscar")
                    )
                ),
                inp("E-mail", form.tomadorEmail, v => setF("tomadorEmail", v), { type: "email" }),
                inp("Telefone", form.tomadorTelefone, v => setF("tomadorTelefone", v)),
            )
        ),
        // Dados do servico
        section("Dados do Servico",
            h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 } },
                h("div", { style: { display: "flex", flexDirection: "column", gap: 4 } },
                    h("label", { style: { fontSize: 12, color: "#374151", fontWeight: 600 } }, "Codigo do Servico ", h("span", { style: { color: "#dc2626" } }, "*")),
                    loadingServicos ? h("div", { style: { fontSize: 13, color: "#6b7280" } }, "Carregando...") :
                    servicos.length > 0 ?
                        h("select", { value: form.codigoServico, onChange: e => selecionarServico(e.target.value),
                            style: { border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: 13 } },
                            h("option", { value: "" }, "Selecionar servico..."),
                            servicos.map(s => h("option", { key: s.id || s.codigo, value: s.codigo }, `${s.codigo} — ${s.descricao}`))
                        ) :
                        h("input", { value: form.codigoServico, onChange: e => setF("codigoServico", e.target.value),
                            style: { border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: 13 } })
                ),
                inp("Valor do Servico (R$)", form.valorServico, v => setF("valorServico", v), { type: "number", required: true }),
                inp("Aliquota ISS (%)", form.aliquotaIss, v => setF("aliquotaIss", v), { type: "number" }),
                h("div", { style: { display: "flex", flexDirection: "column", gap: 4 } },
                    h("label", { style: { fontSize: 12, color: "#374151", fontWeight: 600 } }, "Competencia"),
                    h("input", { type: "month", value: form.dataCompetencia, onChange: e => setF("dataCompetencia", e.target.value),
                        style: { border: "1px solid #d1d5db", borderRadius: 6, padding: "7px 10px", fontSize: 13 } })
                ),
                h("div", { style: { display: "flex", alignItems: "center", gap: 8, paddingTop: 20 } },
                    h("input", { type: "checkbox", id: "issRetido", checked: form.issRetido, onChange: e => setF("issRetido", e.target.checked), style: { width: 16, height: 16 } }),
                    h("label", { htmlFor: "issRetido", style: { fontSize: 13, color: "#374151", cursor: "pointer" } }, "ISS Retido na Fonte")
                ),
            ),
            h("div", { style: { marginTop: 14 } },
                h("label", { style: { fontSize: 12, color: "#374151", fontWeight: 600, display: "block", marginBottom: 4 } }, "Discriminacao do Servico ", h("span", { style: { color: "#dc2626" } }, "*")),
                h("textarea", { value: form.discriminacao, onChange: e => setF("discriminacao", e.target.value), rows: 4,
                    placeholder: "Descreva detalhadamente o servico prestado...",
                    style: { width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: 10, fontSize: 13, resize: "vertical", boxSizing: "border-box" } })
            ),
            h("div", { style: { marginTop: 14 } },
                h("label", { style: { fontSize: 12, color: "#374151", fontWeight: 600, display: "block", marginBottom: 4 } }, "Observacoes"),
                h("textarea", { value: form.observacoes, onChange: e => setF("observacoes", e.target.value), rows: 2,
                    style: { width: "100%", border: "1px solid #d1d5db", borderRadius: 6, padding: 10, fontSize: 13, resize: "vertical", boxSizing: "border-box" } })
            )
        ),
        // Resumo e emitir
        h("div", { style: { background: "#fff", borderRadius: 10, padding: 20, boxShadow: "0 1px 4px #0001", display: "flex", alignItems: "center", justifyContent: "space-between" } },
            h("div", null,
                h("div", { style: { fontSize: 13, color: "#6b7280" } }, "Valor do Servico"),
                h("div", { style: { fontSize: 22, fontWeight: 700, color: "#111827" } }, `R$ ${(Number(form.valorServico) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`),
                form.aliquotaIss && h("div", { style: { fontSize: 12, color: "#6b7280" } },
                    `ISS ${form.aliquotaIss}% = R$ ${((Number(form.valorServico) || 0) * (Number(form.aliquotaIss) || 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`)
            ),
            h("div", { style: { display: "flex", gap: 10 } },
                h("button", { onClick: () => setForm(emptyForm()),
                    style: { border: "1px solid #d1d5db", borderRadius: 8, padding: "10px 20px", cursor: "pointer", background: "#fff", fontSize: 14 } }, "Limpar"),
                h("button", { onClick: emitir, disabled: loading || !form.tomadorNome || !form.valorServico || !form.discriminacao,
                    style: { background: "#16a34a", color: "#fff", border: "none", borderRadius: 8, padding: "10px 28px", cursor: "pointer", fontWeight: 700, fontSize: 14, opacity: loading ? 0.7 : 1 } },
                    loading ? "Emitindo..." : "Emitir NFS-e")
            )
        )
    );
}
