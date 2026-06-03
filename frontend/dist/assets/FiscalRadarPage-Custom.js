// Fiscal Radar NF-e — página principal
import { r as React } from "./index-Cw1PFMX8.js";

function getToken() { try { return JSON.parse(localStorage.getItem("sgq.authSession") || "{}").token || ""; } catch { return ""; } }
async function apiFetch(path, opts) {
    const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}`, ...(opts?.headers || {}) } });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || json?.error || json?.message || `Erro ${res.status}`);
    return json;
}

const { useState, useEffect, useCallback, useRef } = React;

// ─── helpers ──────────────────────────────────────────────────────────────────
const fmtMoeda = v => (v != null ? Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—");
const fmtData  = v => { if (!v) return "—"; try { return new Date(v).toLocaleDateString("pt-BR"); } catch { return v; } };
const fmtCnpj  = v => { if (!v || v.length < 14) return v || "—"; return `${v.slice(0,2)}.${v.slice(2,5)}.${v.slice(5,8)}/${v.slice(8,12)}-${v.slice(12,14)}`; };

const CORES_STATUS_ENTRADA = {
    LANCADA_WINTHOR:    { bg: "#d1fae5", cor: "#065f46", txt: "Lançada WinThor" },
    BAIXADA_NAO_LANCADA:{ bg: "#fef3c7", cor: "#92400e", txt: "Não lançada" },
    EM_DIGITACAO:       { bg: "#dbeafe", cor: "#1e40af", txt: "Em digitação" },
    CANCELADA:          { bg: "#fee2e2", cor: "#991b1b", txt: "Cancelada" },
};
const CORES_MANIFESTACAO = {
    PENDENTE:     { bg: "#fef3c7", cor: "#92400e" },
    CIENTE:       { bg: "#dbeafe", cor: "#1e40af" },
    CONFIRMADA:   { bg: "#d1fae5", cor: "#065f46" },
    DESCONHECIDA: { bg: "#f3e8ff", cor: "#6b21a8" },
    NAO_REALIZADA:{ bg: "#fee2e2", cor: "#991b1b" },
};

function BadgeEntrada({ status }) {
    const c = CORES_STATUS_ENTRADA[status] || { bg: "#f3f4f6", cor: "#374151", txt: status };
    return React.createElement("span", { style: { background: c.bg, color: c.cor, borderRadius: "9999px", padding: "2px 8px", fontSize: 11, fontWeight: 700 } }, c.txt);
}
function BadgeManifest({ status }) {
    const c = CORES_MANIFESTACAO[status] || { bg: "#f3f4f6", cor: "#374151" };
    return React.createElement("span", { style: { background: c.bg, color: c.cor, borderRadius: "9999px", padding: "2px 8px", fontSize: 11, fontWeight: 700 } }, status || "—");
}

// ─── Dashboard Cards ──────────────────────────────────────────────────────────
function DashboardCards({ dash }) {
    if (!dash) return null;
    const cards = [
        { label: "Total NF-e",     valor: dash.totalDocumentos ?? 0, tipo: "num" },
        { label: "Valor Total",    valor: dash.valorTotal ?? 0,      tipo: "moeda" },
        { label: "Não Lançadas",   valor: dash.porStatusEntrada?.BAIXADA_NAO_LANCADA ?? 0, tipo: "num", alerta: true },
        { label: "Pendente Manif.",valor: dash.porStatusManifestacao?.PENDENTE ?? 0, tipo: "num", alerta: true },
        { label: "Itens c/ Erro",  valor: dash.porStatusItem?.NAO_ENCONTRADO ?? 0,  tipo: "num", alerta: true },
    ];
    return React.createElement("div", { style: { display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 } },
        cards.map((c, i) =>
            React.createElement("div", { key: i, style: { background: c.alerta && c.valor > 0 ? "#fff7ed" : "#f9fafb", border: `1px solid ${c.alerta && c.valor > 0 ? "#fed7aa" : "#e5e7eb"}`, borderRadius: 10, padding: "14px 20px", minWidth: 140, flex: "1 1 130px" } },
                React.createElement("div", { style: { fontSize: 11, color: "#6b7280", marginBottom: 4 } }, c.label),
                React.createElement("div", { style: { fontSize: 22, fontWeight: 700, color: c.alerta && c.valor > 0 ? "#c2410c" : "#111827" } },
                    c.tipo === "moeda" ? fmtMoeda(c.valor) : c.valor.toLocaleString("pt-BR"))
            )
        )
    );
}

// ─── Filtros ──────────────────────────────────────────────────────────────────
function PainelFiltros({ filtros, onChange, cnpjs }) {
    const inp = (k, v) => onChange({ ...filtros, [k]: v });
    return React.createElement("div", { style: { background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 16px", marginBottom: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" } },
        React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 11, color: "#6b7280", display: "block", marginBottom: 2 } }, "Empresa"),
            React.createElement("select", { value: filtros.cnpjEmpresa, onChange: e => inp("cnpjEmpresa", e.target.value), style: { padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, minWidth: 180 } },
                React.createElement("option", { value: "" }, "Todas"),
                (cnpjs || []).map(c => React.createElement("option", { key: c, value: c }, fmtCnpj(c)))
            )
        ),
        React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 11, color: "#6b7280", display: "block", marginBottom: 2 } }, "Status entrada"),
            React.createElement("select", { value: filtros.statusEntrada, onChange: e => inp("statusEntrada", e.target.value), style: { padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 } },
                React.createElement("option", { value: "" }, "Todos"),
                React.createElement("option", { value: "BAIXADA_NAO_LANCADA" }, "Não lançada"),
                React.createElement("option", { value: "LANCADA_WINTHOR" }, "Lançada WinThor"),
            )
        ),
        React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 11, color: "#6b7280", display: "block", marginBottom: 2 } }, "Manifestação"),
            React.createElement("select", { value: filtros.statusManifestacao, onChange: e => inp("statusManifestacao", e.target.value), style: { padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 } },
                React.createElement("option", { value: "" }, "Todos"),
                React.createElement("option", { value: "PENDENTE" }, "Pendente"),
                React.createElement("option", { value: "CIENTE" }, "Ciente"),
                React.createElement("option", { value: "CONFIRMADA" }, "Confirmada"),
                React.createElement("option", { value: "DESCONHECIDA" }, "Desconhecida"),
                React.createElement("option", { value: "NAO_REALIZADA" }, "Não Realizada"),
            )
        ),
        React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 11, color: "#6b7280", display: "block", marginBottom: 2 } }, "Emissão início"),
            React.createElement("input", { type: "date", value: filtros.dataInicio, onChange: e => inp("dataInicio", e.target.value), style: { padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 } })
        ),
        React.createElement("div", null,
            React.createElement("label", { style: { fontSize: 11, color: "#6b7280", display: "block", marginBottom: 2 } }, "Emissão fim"),
            React.createElement("input", { type: "date", value: filtros.dataFim, onChange: e => inp("dataFim", e.target.value), style: { padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13 } })
        ),
        React.createElement("div", { style: { flex: 1, minWidth: 180 } },
            React.createElement("label", { style: { fontSize: 11, color: "#6b7280", display: "block", marginBottom: 2 } }, "Busca"),
            React.createElement("input", { placeholder: "Nome, CNPJ ou chave...", value: filtros.busca, onChange: e => inp("busca", e.target.value), style: { padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 13, width: "100%", boxSizing: "border-box" } })
        ),
        React.createElement("label", { style: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#374151", cursor: "pointer", paddingBottom: 4 } },
            React.createElement("input", { type: "checkbox", checked: filtros.apenasNaoLancadas, onChange: e => inp("apenasNaoLancadas", e.target.checked) }),
            "Apenas não lançadas"
        ),
    );
}

// ─── Tabela de documentos ─────────────────────────────────────────────────────
function TabelaDocumentos({ registros, onSelect, selecionado }) {
    if (!registros.length) return React.createElement("div", { style: { padding: 40, textAlign: "center", color: "#9ca3af" } }, "Nenhum documento encontrado.");
    return React.createElement("div", { style: { overflowX: "auto" } },
        React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 12 } },
            React.createElement("thead", null,
                React.createElement("tr", { style: { background: "#f3f4f6" } },
                    ["#", "Emitente", "Nº", "Emissão", "Valor Total", "Status Entrada", "Manifestação", ""].map((h, i) =>
                        React.createElement("th", { key: i, style: { padding: "8px 10px", textAlign: i > 3 ? "right" : "left", fontWeight: 600, color: "#374151", borderBottom: "2px solid #e5e7eb", whiteSpace: "nowrap" } }, h)
                    )
                )
            ),
            React.createElement("tbody", null,
                registros.map(r => React.createElement("tr", {
                    key: r.idDfe,
                    onClick: () => onSelect(r),
                    style: { cursor: "pointer", background: selecionado?.idDfe === r.idDfe ? "#eff6ff" : "white", borderBottom: "1px solid #f3f4f6", transition: "background 0.15s" },
                    onMouseEnter: e => { if (selecionado?.idDfe !== r.idDfe) e.currentTarget.style.background = "#f9fafb"; },
                    onMouseLeave: e => { if (selecionado?.idDfe !== r.idDfe) e.currentTarget.style.background = "white"; },
                },
                    React.createElement("td", { style: { padding: "8px 10px", color: "#6b7280" } }, r.idDfe),
                    React.createElement("td", { style: { padding: "8px 10px" } },
                        React.createElement("div", { style: { fontWeight: 500 } }, r.nomeEmitente || "—"),
                        React.createElement("div", { style: { color: "#9ca3af", fontSize: 11 } }, fmtCnpj(r.cnpjEmitente))
                    ),
                    React.createElement("td", { style: { padding: "8px 10px" } }, `${r.numero || "—"}/${r.serie || ""}`),
                    React.createElement("td", { style: { padding: "8px 10px", whiteSpace: "nowrap" } }, fmtData(r.dataEmissao)),
                    React.createElement("td", { style: { padding: "8px 10px", textAlign: "right", fontWeight: 600 } }, fmtMoeda(r.valorTotal)),
                    React.createElement("td", { style: { padding: "8px 10px", textAlign: "right" } }, React.createElement(BadgeEntrada, { status: r.statusEntrada })),
                    React.createElement("td", { style: { padding: "8px 10px", textAlign: "right" } }, React.createElement(BadgeManifest, { status: r.statusManifestacao })),
                    React.createElement("td", { style: { padding: "8px 10px" } },
                        React.createElement("button", { onClick: e => { e.stopPropagation(); onSelect(r); }, style: { padding: "3px 10px", fontSize: 11, borderRadius: 5, border: "1px solid #d1d5db", background: "white", cursor: "pointer", color: "#374151" } }, "Ver")
                    )
                ))
            )
        )
    );
}

// ─── Painel de detalhe ────────────────────────────────────────────────────────
function PainelDetalhe({ idDfe, onClose, onAuditarWinthor }) {
    const [aba, setAba] = useState("cabecalho");
    const [detalhe, setDetalhe] = useState(null);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState("");
    const [obsTexto, setObsTexto] = useState("");
    const [salvarObs, setSalvarObs] = useState(false);
    const [manifestando, setManifestando] = useState(false);
    const [auditando, setAuditando] = useState(false);
    const [msgAcao, setMsgAcao] = useState("");
    const [modalMapear, setModalMapear] = useState(null);

    useEffect(() => {
        setLoading(true); setErro(""); setDetalhe(null); setMsgAcao("");
        apiFetch(`/api/fiscal/radar/documentos/${idDfe}`)
            .then(d => { setDetalhe(d); setObsTexto(d.documento?.OBSERVACAO || ""); })
            .catch(e => setErro(e.message))
            .finally(() => setLoading(false));
    }, [idDfe]);

    const manifestar = async (tipoEvento, justificativa) => {
        setManifestando(true); setMsgAcao("");
        try {
            const r = await apiFetch(`/api/fiscal/radar/documentos/${idDfe}/manifestar`, {
                method: "POST", body: JSON.stringify({ tipoEvento, justificativa })
            });
            setMsgAcao(`Manifestação registrada: ${r.descEvento}`);
            // Recarregar detalhe
            const d = await apiFetch(`/api/fiscal/radar/documentos/${idDfe}`);
            setDetalhe(d);
        } catch (e) { setMsgAcao(`Erro: ${e.message}`); }
        finally { setManifestando(false); }
    };

    const auditar = async () => {
        setAuditando(true); setMsgAcao("");
        try {
            const r = await apiFetch(`/api/fiscal/radar/documentos/${idDfe}/auditoria`, { method: "POST" });
            setMsgAcao(`WinThor: ${r.statusEntrada === "LANCADA_WINTHOR" ? `Encontrada — NUMTRANSENT ${r.auditoria?.entradas?.[0]?.numTransent}` : "Não lançada"}`);
            const d = await apiFetch(`/api/fiscal/radar/documentos/${idDfe}`);
            setDetalhe(d); onAuditarWinthor?.();
        } catch (e) { setMsgAcao(`Erro: ${e.message}`); }
        finally { setAuditando(false); }
    };

    const salvarObservacao = async () => {
        setSalvarObs(true);
        try {
            await apiFetch(`/api/fiscal/radar/documentos/${idDfe}/observacao`, { method: "POST", body: JSON.stringify({ observacao: obsTexto }) });
            setMsgAcao("Observação salva.");
        } catch (e) { setMsgAcao(`Erro: ${e.message}`); }
        finally { setSalvarObs(false); }
    };

    if (loading) return React.createElement("div", { style: { padding: 40, textAlign: "center", color: "#9ca3af" } }, "Carregando...");
    if (erro) return React.createElement("div", { style: { padding: 20, color: "#dc2626" } }, erro);
    if (!detalhe) return null;

    const doc = detalhe.documento;
    const abas = ["cabecalho", "itens", "totais", "transporte", "cobranca", "eventos"];
    const abaLabels = { cabecalho: "Cabeçalho", itens: `Itens (${detalhe.itens?.length ?? 0})`, totais: "Totais", transporte: "Transporte", cobranca: `Cobrança (${detalhe.cobrancas?.length ?? 0})`, eventos: `Eventos (${detalhe.eventos?.length ?? 0})` };

    return React.createElement("div", { style: { background: "white", borderRadius: 12, border: "1px solid #e5e7eb", padding: 0, marginTop: 16 } },
        // Header do detalhe
        React.createElement("div", { style: { padding: "14px 20px", borderBottom: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 } },
            React.createElement("div", null,
                React.createElement("div", { style: { fontWeight: 700, fontSize: 15 } }, `NF-e ${doc.NUMERO_NOTA}/${doc.SERIE} — ${doc.NOME_EMITENTE || "Emitente desconhecido"}`),
                React.createElement("div", { style: { fontSize: 11, color: "#9ca3af", marginTop: 2, fontFamily: "monospace" } }, doc.CHAVE_NFE),
                React.createElement("div", { style: { marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" } },
                    React.createElement(BadgeEntrada, { status: doc.STATUS_ENTRADA }),
                    React.createElement(BadgeManifest, { status: doc.STATUS_MANIFESTACAO }),
                )
            ),
            React.createElement("button", { onClick: onClose, style: { background: "#f3f4f6", border: "none", borderRadius: 6, padding: "6px 14px", cursor: "pointer", fontSize: 13 } }, "Fechar")
        ),

        // Ações rápidas
        React.createElement("div", { style: { padding: "10px 20px", borderBottom: "1px solid #f3f4f6", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" } },
            React.createElement("button", { onClick: auditar, disabled: auditando, style: { padding: "5px 14px", fontSize: 12, borderRadius: 6, border: "1px solid #d1d5db", background: "#f9fafb", cursor: "pointer" } }, auditando ? "Auditando..." : "Auditar WinThor"),
            React.createElement("button", { onClick: () => manifestar("210210"), disabled: manifestando, style: { padding: "5px 14px", fontSize: 12, borderRadius: 6, border: "1px solid #bfdbfe", background: "#eff6ff", cursor: "pointer", color: "#1e40af" } }, "Ciência"),
            React.createElement("button", { onClick: () => manifestar("210240"), disabled: manifestando, style: { padding: "5px 14px", fontSize: 12, borderRadius: 6, border: "1px solid #bbf7d0", background: "#f0fdf4", cursor: "pointer", color: "#166534" } }, "Confirmar"),
            React.createElement("button", { onClick: () => { const j = prompt("Justificativa (obrigatória):"); if (j) manifestar("210230", j); }, disabled: manifestando, style: { padding: "5px 14px", fontSize: 12, borderRadius: 6, border: "1px solid #fecaca", background: "#fef2f2", cursor: "pointer", color: "#991b1b" } }, "Não Realizada"),
            React.createElement("button", { onClick: () => manifestar("210220"), disabled: manifestando, style: { padding: "5px 14px", fontSize: 12, borderRadius: 6, border: "1px solid #e9d5ff", background: "#faf5ff", cursor: "pointer", color: "#6b21a8" } }, "Desconhecimento"),
            msgAcao && React.createElement("span", { style: { fontSize: 12, color: "#059669", marginLeft: 4 } }, msgAcao),
        ),

        // Abas
        React.createElement("div", { style: { display: "flex", gap: 0, borderBottom: "1px solid #e5e7eb", paddingLeft: 12 } },
            abas.map(a => React.createElement("button", { key: a, onClick: () => setAba(a), style: { padding: "8px 14px", fontSize: 12, border: "none", borderBottom: aba === a ? "2px solid #3b82f6" : "2px solid transparent", background: "none", cursor: "pointer", color: aba === a ? "#2563eb" : "#6b7280", fontWeight: aba === a ? 600 : 400 } }, abaLabels[a]))
        ),

        // Conteúdo da aba
        React.createElement("div", { style: { padding: "16px 20px" } },
            aba === "cabecalho" && React.createElement(AbaCabecalho, { doc }),
            aba === "itens"    && React.createElement(AbaItens,     { itens: detalhe.itens, cnpjEmitente: doc.CNPJ_EMITENTE, onMapear: setModalMapear }),
            aba === "totais"   && React.createElement(AbaTotais,    { totais: detalhe.totais }),
            aba === "transporte" && React.createElement(AbaTransporte, { transp: detalhe.transporte }),
            aba === "cobranca"  && React.createElement(AbaCobranca,  { cobrancas: detalhe.cobrancas }),
            aba === "eventos"   && React.createElement(AbaEventos,   { eventos: detalhe.eventos }),
        ),

        // Observação
        React.createElement("div", { style: { padding: "12px 20px", borderTop: "1px solid #f3f4f6" } },
            React.createElement("label", { style: { fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 } }, "Observação interna"),
            React.createElement("div", { style: { display: "flex", gap: 8 } },
                React.createElement("textarea", { value: obsTexto, onChange: e => setObsTexto(e.target.value), rows: 2, style: { flex: 1, fontSize: 12, padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", resize: "vertical" } }),
                React.createElement("button", { onClick: salvarObservacao, disabled: salvarObs, style: { padding: "6px 14px", fontSize: 12, borderRadius: 6, border: "1px solid #d1d5db", background: "#f9fafb", cursor: "pointer", alignSelf: "flex-start" } }, salvarObs ? "..." : "Salvar")
            )
        ),

        // Modal mapeamento de produto
        modalMapear && React.createElement(ModalMapearProduto, { item: modalMapear, cnpjFornecedor: doc.CNPJ_EMITENTE, onClose: () => setModalMapear(null), onSalvo: () => { setModalMapear(null); setMsgAcao("Produto mapeado."); } }),
    );
}

// ─── Aba Cabeçalho ────────────────────────────────────────────────────────────
function AbaCabecalho({ doc }) {
    const row = (k, v) => React.createElement("tr", { key: k },
        React.createElement("td", { style: { padding: "5px 10px", fontSize: 12, color: "#6b7280", fontWeight: 500, whiteSpace: "nowrap", width: "30%" } }, k),
        React.createElement("td", { style: { padding: "5px 10px", fontSize: 12 } }, v || "—")
    );
    return React.createElement("table", { style: { width: "100%", borderCollapse: "collapse" } },
        React.createElement("tbody", null,
            row("Emitente",         `${doc.NOME_EMITENTE} (${fmtCnpj(doc.CNPJ_EMITENTE)})`),
            row("IE Emitente",      doc.IE_EMITENTE),
            row("UF Emitente",      doc.UF_EMITENTE),
            row("Destinatário",     `${doc.NOME_DESTINATARIO} (${fmtCnpj(doc.CNPJ_DESTINATARIO)})`),
            row("UF Destinatário",  doc.UF_DESTINATARIO),
            row("Modelo/Série/Nº",  `${doc.MODELO} / ${doc.SERIE} / ${doc.NUMERO_NOTA}`),
            row("Emissão",          fmtData(doc.DATA_EMISSAO)),
            row("Saída/Entrada",    fmtData(doc.DATA_SAIDA_ENTRADA)),
            row("Natureza operação",doc.NATUREZA_OPERACAO),
            row("Tipo operação",    doc.TIPO_OPERACAO === "0" ? "Entrada" : "Saída"),
            row("Finalidade",       { "1": "Normal", "2": "Complementar", "3": "Ajuste", "4": "Devolução" }[doc.FINALIDADE_NFE] || doc.FINALIDADE_NFE),
            row("Protocolo",        doc.PROTOCOLO_AUTORIZACAO),
            row("Data autorização", fmtData(doc.DATA_AUTORIZACAO)),
            row("Valor Total NF-e", fmtMoeda(doc.VALOR_TOTAL_NFE)),
            row("NUMTRANSENT",      doc.NUMTRANSENT_WINTHOR ? String(doc.NUMTRANSENT_WINTHOR) : "Não lançada"),
            row("Codfornec",        doc.CODFORNEC_WINTHOR || "—"),
            row("NSU",              doc.NSU),
            row("Download",         fmtData(doc.DATA_DOWNLOAD)),
        )
    );
}

// ─── Aba Itens ────────────────────────────────────────────────────────────────
function AbaItens({ itens, cnpjEmitente, onMapear }) {
    if (!itens?.length) return React.createElement("div", { style: { color: "#9ca3af", padding: 20 } }, "Sem itens.");
    return React.createElement("div", { style: { overflowX: "auto" } },
        React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 11 } },
            React.createElement("thead", null,
                React.createElement("tr", { style: { background: "#f9fafb" } },
                    ["#", "Cód.Forn", "EAN", "Descrição XML", "CFOP", "Qtde", "Vl.Unit", "Vl.Total", "Prod.WinThor", "Status", ""].map((h, i) =>
                        React.createElement("th", { key: i, style: { padding: "6px 8px", textAlign: "left", borderBottom: "1px solid #e5e7eb", whiteSpace: "nowrap" } }, h)
                    )
                )
            ),
            React.createElement("tbody", null,
                itens.map(it => React.createElement("tr", { key: it.ID_ITEM, style: { borderBottom: "1px solid #f3f4f6" } },
                    React.createElement("td", { style: { padding: "5px 8px" } }, it.NUM_ITEM),
                    React.createElement("td", { style: { padding: "5px 8px", fontFamily: "monospace" } }, it.COD_PROD_FORNECEDOR),
                    React.createElement("td", { style: { padding: "5px 8px", fontFamily: "monospace" } }, it.EAN_COMERCIAL || "—"),
                    React.createElement("td", { style: { padding: "5px 8px", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, it.DESCRICAO_XML),
                    React.createElement("td", { style: { padding: "5px 8px" } }, it.CFOP),
                    React.createElement("td", { style: { padding: "5px 8px", textAlign: "right" } }, Number(it.QTDE_COMERCIAL).toLocaleString("pt-BR", { maximumFractionDigits: 4 })),
                    React.createElement("td", { style: { padding: "5px 8px", textAlign: "right" } }, fmtMoeda(it.VALOR_UNITARIO)),
                    React.createElement("td", { style: { padding: "5px 8px", textAlign: "right", fontWeight: 600 } }, fmtMoeda(it.VALOR_TOTAL_ITEM)),
                    React.createElement("td", { style: { padding: "5px 8px" } },
                        it.CODPROD_WINTHOR
                            ? React.createElement("span", { style: { color: "#059669", fontWeight: 600 } }, `${it.CODPROD_WINTHOR} — ${it.DESCRICAO_WINTHOR || ""}`)
                            : React.createElement("span", { style: { color: "#9ca3af" } }, "—")
                    ),
                    React.createElement("td", { style: { padding: "5px 8px" } },
                        React.createElement("span", { style: { background: it.STATUS_CADASTRO === "ENCONTRADO_WINTHOR" || it.STATUS_CADASTRO === "MAPEADO_MANUAL" ? "#d1fae5" : "#fee2e2", color: it.STATUS_CADASTRO === "ENCONTRADO_WINTHOR" || it.STATUS_CADASTRO === "MAPEADO_MANUAL" ? "#065f46" : "#991b1b", borderRadius: "9999px", padding: "2px 8px", fontSize: 11, fontWeight: 700 } },
                            it.STATUS_CADASTRO === "ENCONTRADO_WINTHOR" ? "OK" : it.STATUS_CADASTRO === "MAPEADO_MANUAL" ? "Mapeado" : "Não encontrado")
                    ),
                    React.createElement("td", { style: { padding: "5px 8px" } },
                        !["ENCONTRADO_WINTHOR", "MAPEADO_MANUAL"].includes(it.STATUS_CADASTRO) &&
                        React.createElement("button", { onClick: () => onMapear?.(it), style: { padding: "2px 8px", fontSize: 10, borderRadius: 4, border: "1px solid #d1d5db", cursor: "pointer", background: "#eff6ff", color: "#1e40af" } }, "Mapear")
                    )
                ))
            )
        )
    );
}

// ─── Aba Totais ───────────────────────────────────────────────────────────────
function AbaTotais({ totais }) {
    if (!totais) return React.createElement("div", { style: { color: "#9ca3af" } }, "Sem dados de totais.");
    const campos = [
        ["Base ICMS", totais.V_BC], ["ICMS", totais.V_ICMS], ["ICMS Desonerad.", totais.V_ICMS_DESON],
        ["FCP", totais.V_FCP], ["Base ST", totais.V_BC_ST], ["ICMS ST", totais.V_ST], ["FCP ST", totais.V_FCP_ST],
        ["Produtos", totais.V_PROD], ["Frete", totais.V_FRETE], ["Seguro", totais.V_SEG],
        ["Desconto", totais.V_DESC], ["II", totais.V_II], ["IPI", totais.V_IPI],
        ["PIS", totais.V_PIS], ["COFINS", totais.V_COFINS], ["Outros", totais.V_OUTRO],
        ["Valor NF-e", totais.V_NF],
    ];
    return React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 } },
        campos.map(([k, v]) => React.createElement("div", { key: k, style: { background: "#f9fafb", borderRadius: 6, padding: "8px 12px" } },
            React.createElement("div", { style: { fontSize: 11, color: "#6b7280" } }, k),
            React.createElement("div", { style: { fontSize: 14, fontWeight: 600 } }, fmtMoeda(v))
        ))
    );
}

// ─── Aba Transporte ───────────────────────────────────────────────────────────
function AbaTransporte({ transp }) {
    if (!transp) return React.createElement("div", { style: { color: "#9ca3af" } }, "Sem dados de transporte.");
    const mf = { "0": "Contratação do Frete por conta do Emitente", "1": "Contratação do Frete por conta do Destinatário", "2": "Contratação do Frete por conta de Terceiros", "9": "Sem Ocorrência de Transporte" };
    return React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 } },
        [["Modal frete", mf[transp.MOD_FRETE] || transp.MOD_FRETE], ["Transportadora", transp.NOME_TRANSP], ["CNPJ", fmtCnpj(transp.CNPJ_TRANSP)], ["Placa", transp.PLACA], ["Qtd. volumes", transp.QTD_VOL], ["Peso líq. (kg)", transp.PESO_LIQ], ["Peso bruto (kg)", transp.PESO_BRT]].map(([k, v]) =>
            React.createElement("div", { key: k, style: { background: "#f9fafb", borderRadius: 6, padding: "8px 12px" } },
                React.createElement("div", { style: { fontSize: 11, color: "#6b7280" } }, k),
                React.createElement("div", { style: { fontWeight: 500 } }, v || "—")
            )
        )
    );
}

// ─── Aba Cobrança ─────────────────────────────────────────────────────────────
function AbaCobranca({ cobrancas }) {
    if (!cobrancas?.length) return React.createElement("div", { style: { color: "#9ca3af" } }, "Sem dados de cobrança.");
    return React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 12 } },
        React.createElement("thead", null, React.createElement("tr", { style: { background: "#f9fafb" } },
            ["Tipo", "Nº Fat/Dup", "Venc.", "Valor", "Forma Pag.", "V.Pag."].map(h =>
                React.createElement("th", { key: h, style: { padding: "6px 10px", textAlign: "left", borderBottom: "1px solid #e5e7eb" } }, h))
        )),
        React.createElement("tbody", null,
            cobrancas.map((c, i) => React.createElement("tr", { key: i, style: { borderBottom: "1px solid #f3f4f6" } },
                React.createElement("td", { style: { padding: "5px 10px" } }, c.TIPO),
                React.createElement("td", { style: { padding: "5px 10px" } }, c.NUM_FAT || c.NUM_DUP || "—"),
                React.createElement("td", { style: { padding: "5px 10px" } }, fmtData(c.DT_VENC)),
                React.createElement("td", { style: { padding: "5px 10px", textAlign: "right" } }, fmtMoeda(c.VALOR)),
                React.createElement("td", { style: { padding: "5px 10px" } }, c.TPAG || "—"),
                React.createElement("td", { style: { padding: "5px 10px", textAlign: "right" } }, c.VPAG ? fmtMoeda(c.VPAG) : "—"),
            ))
        )
    );
}

// ─── Aba Eventos ──────────────────────────────────────────────────────────────
function AbaEventos({ eventos }) {
    if (!eventos?.length) return React.createElement("div", { style: { color: "#9ca3af" } }, "Sem eventos registrados.");
    return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
        eventos.map(e => React.createElement("div", { key: e.ID_EVENTO, style: { background: "#f9fafb", borderRadius: 8, padding: "10px 14px" } },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", marginBottom: 4 } },
                React.createElement("span", { style: { fontWeight: 600, fontSize: 12 } }, e.DESC_EVENTO || e.TIPO_EVENTO),
                React.createElement("span", { style: { fontSize: 11, color: "#9ca3af" } }, fmtData(e.DATA_GRAVACAO))
            ),
            e.JUSTIFICATIVA && React.createElement("div", { style: { fontSize: 11, color: "#374151" } }, e.JUSTIFICATIVA),
            e.PROTOCOLO && React.createElement("div", { style: { fontSize: 11, color: "#6b7280", fontFamily: "monospace" } }, `Protocolo: ${e.PROTOCOLO}`),
            React.createElement("span", { style: { background: e.STATUS === "PENDENTE" ? "#fef3c7" : "#d1fae5", color: e.STATUS === "PENDENTE" ? "#92400e" : "#065f46", borderRadius: "9999px", padding: "2px 8px", fontSize: 11, fontWeight: 700 } }, e.STATUS)
        ))
    );
}

// ─── Modal mapear produto ─────────────────────────────────────────────────────
function ModalMapearProduto({ item, cnpjFornecedor, onClose, onSalvo }) {
    const [busca, setBusca] = useState("");
    const [resultados, setResultados] = useState([]);
    const [buscando, setBuscando] = useState(false);
    const [selecionado, setSelecionado] = useState(null);
    const [fator, setFator] = useState("1");
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState("");

    const pesquisar = async () => {
        if (busca.length < 3) return;
        setBuscando(true);
        try {
            const r = await apiFetch("/api/fiscal/radar/produtos/buscar", { method: "POST", body: JSON.stringify({ texto: busca, ean: busca.length >= 8 ? busca : null }) });
            setResultados(r.produtos || []);
        } catch { setResultados([]); }
        finally { setBuscando(false); }
    };

    const salvar = async () => {
        if (!selecionado) return;
        setSalvando(true); setErro("");
        try {
            await apiFetch("/api/fiscal/radar/produtos/mapear", {
                method: "POST",
                body: JSON.stringify({
                    cnpjFornecedor, codProdFornecedor: item.COD_PROD_FORNECEDOR,
                    ean: item.EAN_COMERCIAL, codprodWinthor: selecionado.codprod,
                    descricaoForn: item.DESCRICAO_XML, unidadeForn: item.UNIDADE_COMERCIAL,
                    fatorConversao: parseFloat(fator) || 1, idItem: item.ID_ITEM,
                })
            });
            onSalvo?.();
        } catch (e) { setErro(e.message); }
        finally { setSalvando(false); }
    };

    return React.createElement("div", { style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" } },
        React.createElement("div", { style: { background: "white", borderRadius: 12, padding: 24, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" } },
            React.createElement("div", { style: { fontWeight: 700, fontSize: 16, marginBottom: 4 } }, "Mapear Produto"),
            React.createElement("div", { style: { fontSize: 12, color: "#6b7280", marginBottom: 16 } },
                `Item ${item.NUM_ITEM}: ${item.DESCRICAO_XML} | Cód. Forn: ${item.COD_PROD_FORNECEDOR} | EAN: ${item.EAN_COMERCIAL || "—"}`
            ),
            React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 12 } },
                React.createElement("input", { placeholder: "Buscar produto por descrição ou EAN...", value: busca, onChange: e => setBusca(e.target.value), onKeyDown: e => e.key === "Enter" && pesquisar(), style: { flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13 } }),
                React.createElement("button", { onClick: pesquisar, disabled: buscando, style: { padding: "8px 16px", borderRadius: 8, border: "none", background: "#2563eb", color: "white", cursor: "pointer", fontSize: 13 } }, buscando ? "..." : "Buscar")
            ),
            resultados.length > 0 && React.createElement("div", { style: { border: "1px solid #e5e7eb", borderRadius: 8, marginBottom: 12, maxHeight: 200, overflowY: "auto" } },
                resultados.map(p => React.createElement("div", {
                    key: p.codprod,
                    onClick: () => setSelecionado(p),
                    style: { padding: "8px 12px", cursor: "pointer", background: selecionado?.codprod === p.codprod ? "#eff6ff" : "white", borderBottom: "1px solid #f3f4f6", fontSize: 12 }
                },
                    React.createElement("div", { style: { fontWeight: 600 } }, `[${p.codprod}] ${p.descricao}`),
                    React.createElement("div", { style: { color: "#9ca3af" } }, `EAN: ${p.ean || "—"} | Unid: ${p.unidade}`)
                ))
            ),
            selecionado && React.createElement("div", { style: { background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 12 } },
                React.createElement("div", { style: { fontWeight: 600 } }, `Selecionado: [${selecionado.codprod}] ${selecionado.descricao}`),
                React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center", marginTop: 8 } },
                    React.createElement("label", { style: { fontSize: 11 } }, "Fator de conversão:"),
                    React.createElement("input", { type: "number", step: "0.000001", value: fator, onChange: e => setFator(e.target.value), style: { width: 80, padding: "4px 8px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 12 } })
                )
            ),
            erro && React.createElement("div", { style: { color: "#dc2626", fontSize: 12, marginBottom: 8 } }, erro),
            React.createElement("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end" } },
                React.createElement("button", { onClick: onClose, style: { padding: "8px 16px", borderRadius: 8, border: "1px solid #d1d5db", background: "white", cursor: "pointer", fontSize: 13 } }, "Cancelar"),
                React.createElement("button", { onClick: salvar, disabled: !selecionado || salvando, style: { padding: "8px 16px", borderRadius: 8, border: "none", background: selecionado ? "#2563eb" : "#93c5fd", color: "white", cursor: selecionado ? "pointer" : "default", fontSize: 13 } }, salvando ? "Salvando..." : "Salvar Mapeamento")
            )
        )
    );
}

// ─── Painel Sync ──────────────────────────────────────────────────────────────
function PainelSync({ empresas, onSincronizado }) {
    const [cnpj, setCnpj] = useState("");
    const [modo, setModo] = useState("sefaz");
    const [maxLotes, setMaxLotes] = useState("10");
    const [sincronizando, setSincronizando] = useState(false);
    const [progresso, setProgresso] = useState("");
    const [msg, setMsg] = useState("");
    const [erro, setErro] = useState("");

    // Pré-seleciona a primeira empresa com certificado
    useEffect(() => {
        const comCert = (empresas || []).find(e => e.temCertificado);
        if (comCert && !cnpj) setCnpj(comCert.cnpj);
        else if (empresas?.length && !cnpj) setCnpj(empresas[0].cnpj);
    }, [empresas]);

    const empSelecionada = (empresas || []).find(e => e.cnpj === cnpj);
    const temCert = empSelecionada?.temCertificado ?? false;

    const sincronizar = async () => {
        if (!cnpj) { setErro("Selecione uma empresa."); return; }
        if (modo === "sefaz" && !temCert) { setErro("Esta empresa não possui certificado A1 configurado no PCFILIAL."); return; }
        setSincronizando(true); setMsg(""); setErro(""); setProgresso("Iniciando consulta ao SEFAZ...");
        try {
            if (modo === "sefaz") {
                setProgresso("Consultando SEFAZ DFe-Nacional — aguarde, pode levar alguns minutos...");
                const r = await apiFetch("/api/fiscal/radar/sync", { method: "POST", body: JSON.stringify({ cnpjEmpresa: cnpj, maxLotes: parseInt(maxLotes) || 10 }) });
                setMsg(`Importados: ${r.importados} NF-e | Erros: ${r.erros} | NSU atual: ${r.ultNsu}${r.maxNsu ? ` / máx ${r.maxNsu}` : ""}`);
            } else {
                setProgresso("Lendo PCDOCELETRONICO...");
                const r = await apiFetch("/api/fiscal/radar/sync/pcdoc", { method: "POST", body: JSON.stringify({ cnpjEmpresa: cnpj, limite: 500 }) });
                setMsg(`Lidos: ${r.lidos} | Importados: ${r.importados} | Ignorados: ${r.ignorados} | Erros: ${r.erros}`);
            }
            onSincronizado?.();
        } catch (e) { setErro(e.message); }
        finally { setSincronizando(false); setProgresso(""); }
    };

    return React.createElement("div", { style: { background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 12, padding: "18px 20px", marginBottom: 16 } },
        React.createElement("div", { style: { fontWeight: 700, fontSize: 14, marginBottom: 14, color: "#0c4a6e" } }, "Importar NF-e do SEFAZ"),

        React.createElement("div", { style: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 } },
            // Empresa
            React.createElement("div", { style: { flex: "1 1 220px" } },
                React.createElement("label", { style: { fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 } }, "Empresa (CNPJ)"),
                React.createElement("select", {
                    value: cnpj, onChange: e => setCnpj(e.target.value),
                    style: { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13 }
                },
                    React.createElement("option", { value: "" }, "— Selecione —"),
                    (empresas || []).map(emp => React.createElement("option", { key: emp.cnpj, value: emp.cnpj },
                        `${emp.nome ? emp.nome + " — " : ""}${fmtCnpj(emp.cnpj)}${emp.temCertificado ? " ✓" : ""}`
                    ))
                ),
                cnpj && React.createElement("div", { style: { fontSize: 11, marginTop: 4, color: temCert ? "#059669" : "#d97706" } },
                    temCert ? "Certificado A1 encontrado no PCFILIAL" : "Sem certificado — apenas importação via PCDOCELETRONICO disponível"
                )
            ),

            // Modo
            React.createElement("div", { style: { flex: "0 0 auto" } },
                React.createElement("label", { style: { fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 } }, "Origem"),
                React.createElement("div", { style: { display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", border: "1px solid #d1d5db" } },
                    React.createElement("button", {
                        onClick: () => setModo("sefaz"),
                        style: { padding: "8px 16px", fontSize: 12, border: "none", cursor: "pointer", fontWeight: modo === "sefaz" ? 700 : 400, background: modo === "sefaz" ? "#2563eb" : "white", color: modo === "sefaz" ? "white" : "#374151" }
                    }, "SEFAZ direto"),
                    React.createElement("button", {
                        onClick: () => setModo("pcdoc"),
                        style: { padding: "8px 16px", fontSize: 12, border: "none", borderLeft: "1px solid #d1d5db", cursor: "pointer", fontWeight: modo === "pcdoc" ? 700 : 400, background: modo === "pcdoc" ? "#2563eb" : "white", color: modo === "pcdoc" ? "white" : "#374151" }
                    }, "WinThor (PCDOC)")
                )
            ),

            // Lotes (só para SEFAZ)
            modo === "sefaz" && React.createElement("div", { style: { flex: "0 0 auto" } },
                React.createElement("label", { style: { fontSize: 11, fontWeight: 600, color: "#374151", display: "block", marginBottom: 4 } }, "Lotes (máx 50/lote)"),
                React.createElement("input", { type: "number", min: 1, max: 50, value: maxLotes, onChange: e => setMaxLotes(e.target.value), style: { width: 70, padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13 } })
            ),

            // Botão
            React.createElement("div", { style: { flex: "0 0 auto" } },
                React.createElement("button", {
                    onClick: sincronizar,
                    disabled: sincronizando || !cnpj,
                    style: { padding: "9px 22px", borderRadius: 8, border: "none", background: sincronizando || !cnpj ? "#93c5fd" : "#1d4ed8", color: "white", cursor: sincronizando || !cnpj ? "default" : "pointer", fontSize: 14, fontWeight: 700 }
                }, sincronizando ? "Consultando..." : "Importar do SEFAZ")
            ),
        ),

        // Info
        modo === "sefaz" && React.createElement("div", { style: { fontSize: 11, color: "#0369a1", background: "#e0f2fe", borderRadius: 6, padding: "6px 10px", marginBottom: 8 } },
            "Cada lote retorna até 50 NF-e do SEFAZ DFe-Nacional. Para baixar o histórico completo, aumente o número de lotes. Requer certificado A1 configurado no PCFILIAL."
        ),

        progresso && React.createElement("div", { style: { fontSize: 12, color: "#2563eb", marginTop: 8, display: "flex", alignItems: "center", gap: 8 } },
            React.createElement("span", { style: { display: "inline-block", width: 12, height: 12, borderRadius: "50%", background: "#2563eb", animation: "pulse 1s infinite" } }),
            progresso
        ),
        msg  && React.createElement("div", { style: { marginTop: 8, fontSize: 13, color: "#065f46", background: "#d1fae5", borderRadius: 6, padding: "8px 12px" } }, msg),
        erro && React.createElement("div", { style: { marginTop: 8, fontSize: 13, color: "#991b1b", background: "#fee2e2", borderRadius: 6, padding: "8px 12px" } }, erro),
    );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function FiscalRadarPage() {
    const [filtros, setFiltros] = useState({ cnpjEmpresa: "", statusEntrada: "", statusManifestacao: "", dataInicio: "", dataFim: "", busca: "", apenasNaoLancadas: true });
    const [pagina, setPagina] = useState(1);
    const [dados, setDados] = useState({ total: 0, registros: [] });
    const [dash, setDash] = useState(null);
    const [loading, setLoading] = useState(false);
    const [selecionado, setSelecionado] = useState(null);
    const [empresas, setEmpresas] = useState([]);
    const [erro, setErro] = useState("");
    const [mostrarSync, setMostrarSync] = useState(true);
    const debounceRef = useRef(null);

    // Carrega lista de empresas (PCFILIAL com certificado + controles NSU existentes)
    useEffect(() => {
        apiFetch("/api/fiscal/radar/status")
            .then(r => {
                const lista = r.empresas || (r.controles || []).map(c => ({ cnpj: c.cnpj, nome: c.cnpj, temCertificado: false }));
                setEmpresas(lista);
                const primeiro = lista[0]?.cnpj;
                if (primeiro) setFiltros(f => ({ ...f, cnpjEmpresa: primeiro }));
            })
            .catch(() => {
                // Sem controles NSU ainda — tenta carregar da API de documentos
            });
    }, []);

    const carregarDados = useCallback((f, p) => {
        setLoading(true); setErro("");
        const params = new URLSearchParams();
        if (f.cnpjEmpresa)       params.set("cnpjEmpresa",       f.cnpjEmpresa.replace(/\D/g, ""));
        if (f.statusEntrada)     params.set("statusEntrada",     f.statusEntrada);
        if (f.statusManifestacao)params.set("statusManifestacao",f.statusManifestacao);
        if (f.dataInicio)        params.set("dataInicio",        f.dataInicio);
        if (f.dataFim)           params.set("dataFim",           f.dataFim);
        if (f.busca)             params.set("busca",             f.busca);
        if (f.apenasNaoLancadas) params.set("apenasNaoLancadas", "true");
        params.set("pagina",  p || 1);
        params.set("limite",  50);

        const cnpjDash = f.cnpjEmpresa?.replace(/\D/g, "") || "";
        Promise.all([
            apiFetch(`/api/fiscal/radar/documentos?${params}`),
            apiFetch(`/api/fiscal/radar/dashboard${cnpjDash ? `?cnpjEmpresa=${cnpjDash}` : ""}`),
        ])
            .then(([lista, dashData]) => { setDados(lista); setDash(dashData); })
            .catch(e => setErro(e.message))
            .finally(() => setLoading(false));
    }, []);

    // Debounce filtros
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => { setPagina(1); carregarDados(filtros, 1); }, 400);
        return () => clearTimeout(debounceRef.current);
    }, [filtros, carregarDados]);

    const totalPaginas = Math.max(1, Math.ceil(dados.total / 50));

    return React.createElement("div", { style: { padding: "24px 28px", maxWidth: 1600, margin: "0 auto" } },
        // Header
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 } },
            React.createElement("div", null,
                React.createElement("h1", { style: { fontSize: 22, fontWeight: 700, margin: 0, color: "#111827" } }, "Fiscal Radar NF-e"),
                React.createElement("p", { style: { color: "#6b7280", fontSize: 13, margin: "4px 0 0" } },
                    "NF-e recebidas do SEFAZ — validação, manifestação e lançamento no WinThor")
            ),
            React.createElement("button", { onClick: () => setMostrarSync(!mostrarSync), style: { padding: "7px 16px", borderRadius: 8, border: "1px solid #d1d5db", background: "white", cursor: "pointer", fontSize: 13 } },
                mostrarSync ? "Ocultar importação" : "Importar NF-e")
        ),

        // Painel sync (toggle)
        mostrarSync && React.createElement(PainelSync, { empresas, onSincronizado: () => { carregarDados(filtros, 1); } }),

        // Dashboard
        React.createElement(DashboardCards, { dash }),

        // Filtros
        React.createElement(PainelFiltros, { filtros, onChange: f => setFiltros(f), cnpjs: empresas.map(e => e.cnpj) }),

        // Erro
        erro && React.createElement("div", { style: { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 16px", marginBottom: 12, color: "#dc2626", fontSize: 13 } }, erro),

        // Tabela
        React.createElement("div", { style: { background: "white", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" } },
            React.createElement("div", { style: { padding: "10px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", justifyContent: "space-between", alignItems: "center" } },
                React.createElement("span", { style: { fontSize: 13, color: "#374151" } },
                    loading ? "Carregando..." : `${dados.total.toLocaleString("pt-BR")} documento(s) encontrado(s)`),
                dados.total > 50 && React.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center" } },
                    React.createElement("button", { onClick: () => { const np = Math.max(1, pagina - 1); setPagina(np); carregarDados(filtros, np); }, disabled: pagina <= 1, style: { padding: "4px 10px", borderRadius: 5, border: "1px solid #d1d5db", background: "white", cursor: "pointer", fontSize: 12 } }, "‹"),
                    React.createElement("span", { style: { fontSize: 12, color: "#6b7280" } }, `${pagina} / ${totalPaginas}`),
                    React.createElement("button", { onClick: () => { const np = Math.min(totalPaginas, pagina + 1); setPagina(np); carregarDados(filtros, np); }, disabled: pagina >= totalPaginas, style: { padding: "4px 10px", borderRadius: 5, border: "1px solid #d1d5db", background: "white", cursor: "pointer", fontSize: 12 } }, "›"),
                )
            ),
            React.createElement(TabelaDocumentos, { registros: dados.registros, onSelect: r => setSelecionado(selecionado?.idDfe === r.idDfe ? null : r), selecionado })
        ),

        // Painel de detalhe
        selecionado && React.createElement(PainelDetalhe, {
            idDfe: selecionado.idDfe,
            onClose: () => setSelecionado(null),
            onAuditarWinthor: () => carregarDados(filtros, pagina),
        }),
    );
}
