import { i as useToast, r as React, j as jsxRuntime, J as Card, K as CardHeader, M as CardTitle, N as CardContent, B as Button, a as apiGet, w as apiPost } from "./index-Cw1PFMX8.js";
import { I as Input } from "./input-CnWhQnjH.js";
import { B as Badge } from "./badge-B2SLyCXJ.js";

const h = jsxRuntime.jsx;
const hs = jsxRuntime.jsxs;

const MOTIVOS = [
    { value: "MEDICO", label: "Consulta Medica" },
    { value: "BANCO", label: "Banco / Financeiro" },
    { value: "FARMACIA", label: "Farmacia" },
    { value: "PESSOAL", label: "Assunto Pessoal" },
    { value: "ALMOCO_EXTERNO", label: "Almoco Externo" },
    { value: "OUTRO", label: "Outro" },
];

const PRAZOS = [
    { value: "30", label: "30 minutos" },
    { value: "60", label: "1 hora" },
    { value: "90", label: "1h 30min" },
    { value: "120", label: "2 horas" },
    { value: "180", label: "3 horas" },
    { value: "240", label: "4 horas" },
];

const STATUS_BADGE = {
    PENDENTE_APROVACAO: { label: "Aguardando Aprovacao", variant: "secondary" },
    APROVADA: { label: "Aprovada", variant: "default" },
    NEGADA: { label: "Negada", variant: "destructive" },
    SAIDA_REALIZADA: { label: "Fora", variant: "outline" },
    RETORNO_CONFIRMADO: { label: "Retornou", variant: "outline" },
    CANCELADA: { label: "Cancelada", variant: "secondary" },
    EXPIRADA: { label: "Expirada", variant: "secondary" },
};

function fmtDate(iso) {
    if (!iso) return "-";
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function qrUrl(token) {
    return `/api/portaria/saida-funcionario/qrcode-image?token=${encodeURIComponent(token)}`;
}

const selectStyle = {
    width: "100%", height: "40px", padding: "0 12px", borderRadius: "6px",
    border: "1px solid hsl(var(--input))", background: "hsl(var(--background))",
    color: "hsl(var(--foreground))", fontSize: "14px",
};

const textareaStyle = {
    width: "100%", padding: "8px 12px", borderRadius: "6px",
    border: "1px solid hsl(var(--input))", background: "hsl(var(--background))",
    color: "hsl(var(--foreground))", fontSize: "14px", minHeight: "72px", resize: "vertical",
};

export default function SaidaFuncionarioPage() {
    const { toast } = useToast();

    const [currentUser, setCurrentUser] = React.useState(null);
    const [minhas, setMinhas] = React.useState([]);
    const [loadingMinhas, setLoadingMinhas] = React.useState(false);

    const [motivo, setMotivo] = React.useState("");
    const [observacao, setObservacao] = React.useState("");
    const [validadeMinutos, setValidadeMinutos] = React.useState("120");
    const [submitting, setSubmitting] = React.useState(false);
    const [solicitacaoAtual, setSolicitacaoAtual] = React.useState(null);
    const [showQrFor, setShowQrFor] = React.useState(new Set());

    const loadMinhas = React.useCallback(async () => {
        setLoadingMinhas(true);
        try {
            const data = await apiGet("/portaria/saida-funcionario?limit=10");
            setMinhas(Array.isArray(data) ? data : (data.items || []));
        } catch {}
        finally { setLoadingMinhas(false); }
    }, []);

    React.useEffect(() => {
        apiGet("/auth/me").then((u) => setCurrentUser(u)).catch(() => {});
        loadMinhas();
    }, [loadMinhas]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!motivo) { toast({ title: "Informe o motivo", variant: "destructive" }); return; }
        setSubmitting(true);
        try {
            const result = await apiPost("/portaria/saida-funcionario/solicitar", {
                motivo,
                observacao: observacao.trim() || undefined,
                validadeMinutos: Number(validadeMinutos),
            });
            setSolicitacaoAtual(result);
            toast({ title: "Solicitacao enviada!", description: "Apresente o QR Code ao autorizador." });
            setMotivo("");
            setObservacao("");
            loadMinhas();
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Erro ao solicitar.";
            toast({ title: "Erro", description: msg, variant: "destructive" });
        } finally {
            setSubmitting(false);
        }
    };

    const handleCancelar = async (id) => {
        try {
            await apiPost(`/portaria/saida-funcionario/${id}/cancelar`, {});
            toast({ title: "Solicitacao cancelada" });
            if (solicitacaoAtual?.id === id) setSolicitacaoAtual(null);
            loadMinhas();
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Erro ao cancelar.";
            toast({ title: "Erro", description: msg, variant: "destructive" });
        }
    };

    const toggleQr = (id) => setShowQrFor((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
    });

    return hs("div", {
        className: "p-4 md:p-6 max-w-2xl mx-auto space-y-6",
        children: [
            hs("div", {
                children: [
                    h("h1", { className: "text-2xl font-bold", children: "Saida Temporaria" }),
                    h("p", {
                        className: "text-muted-foreground text-sm",
                        children: currentUser ? `Funcionario: ${currentUser.nome}` : "Solicite autorizacao de saida",
                    }),
                ],
            }),

            // QR code da solicitação atual (após submit)
            solicitacaoAtual ? hs(Card, {
                className: "border-2 border-blue-400",
                children: [
                    h(CardHeader, {
                        className: "pb-2",
                        children: hs("div", {
                            className: "flex items-center justify-between",
                            children: [
                                h(CardTitle, { className: "text-base", children: "Apresente este QR Code ao autorizador" }),
                                h(Button, {
                                    variant: "ghost", size: "sm",
                                    onClick: () => setSolicitacaoAtual(null),
                                    children: "Fechar",
                                }),
                            ],
                        }),
                    }),
                    h(CardContent, {
                        children: hs("div", {
                            className: "flex flex-col items-center gap-3",
                            children: [
                                h("img", {
                                    src: qrUrl(solicitacaoAtual.qrToken),
                                    alt: "QR Code de saida",
                                    className: "w-56 h-56 border rounded-lg",
                                    style: { imageRendering: "pixelated" },
                                }),
                                hs("div", {
                                    className: "text-center text-sm text-muted-foreground",
                                    children: [
                                        h("p", { children: `Motivo: ${MOTIVOS.find((m) => m.value === solicitacaoAtual.motivo)?.label || solicitacaoAtual.motivo}` }),
                                        h("p", { className: "font-mono text-xs mt-1 break-all", children: `ID: ${solicitacaoAtual.id}` }),
                                    ],
                                }),
                                h(Badge, { variant: "secondary", children: "Aguardando aprovacao do autorizador" }),
                            ],
                        }),
                    }),
                ],
            }) : null,

            // Formulário de nova solicitação
            hs(Card, {
                children: [
                    h(CardHeader, { children: h(CardTitle, { children: "Nova Solicitacao" }) }),
                    h(CardContent, {
                        children: hs("form", {
                            onSubmit: handleSubmit,
                            className: "space-y-4",
                            children: [
                                hs("div", {
                                    className: "space-y-1",
                                    children: [
                                        h("label", { className: "text-sm font-medium", children: "Motivo *" }),
                                        h("select", {
                                            value: motivo,
                                            onChange: (e) => setMotivo(e.target.value),
                                            style: selectStyle,
                                            children: [
                                                h("option", { value: "", children: "Selecione o motivo..." }),
                                                ...MOTIVOS.map((m) => h("option", { key: m.value, value: m.value, children: m.label })),
                                            ],
                                        }),
                                    ],
                                }),
                                hs("div", {
                                    className: "space-y-1",
                                    children: [
                                        h("label", { className: "text-sm font-medium", children: "Prazo de retorno" }),
                                        h("select", {
                                            value: validadeMinutos,
                                            onChange: (e) => setValidadeMinutos(e.target.value),
                                            style: selectStyle,
                                            children: PRAZOS.map((p) => h("option", { key: p.value, value: p.value, children: p.label })),
                                        }),
                                    ],
                                }),
                                hs("div", {
                                    className: "space-y-1",
                                    children: [
                                        h("label", { className: "text-sm font-medium", children: "Observacao (opcional)" }),
                                        h("textarea", {
                                            value: observacao,
                                            onChange: (e) => setObservacao(e.target.value),
                                            placeholder: "Informacoes adicionais...",
                                            style: textareaStyle,
                                        }),
                                    ],
                                }),
                                h(Button, {
                                    type: "submit",
                                    disabled: submitting,
                                    className: "w-full",
                                    children: submitting ? "Enviando..." : "Solicitar Saida",
                                }),
                            ],
                        }),
                    }),
                ],
            }),

            // Minhas solicitações recentes
            hs(Card, {
                children: [
                    h(CardHeader, { children: h(CardTitle, { children: "Minhas Solicitacoes Recentes" }) }),
                    h(CardContent, {
                        children: loadingMinhas
                            ? h("p", { className: "text-sm text-muted-foreground", children: "Carregando..." })
                            : minhas.length === 0
                                ? h("p", { className: "text-sm text-muted-foreground", children: "Nenhuma solicitacao encontrada." })
                                : hs("div", {
                                    className: "space-y-3",
                                    children: minhas.map((s) => {
                                        const bInfo = STATUS_BADGE[s.status] || { label: s.status, variant: "secondary" };
                                        const podeQr = (s.status === "PENDENTE_APROVACAO" || s.status === "APROVADA") && s.qrToken;
                                        const qrAberto = showQrFor.has(s.id);
                                        return hs("div", {
                                            className: "border rounded-lg overflow-hidden",
                                            children: [
                                                hs("div", {
                                                    className: "flex items-center justify-between p-3 gap-2",
                                                    children: [
                                                        hs("div", {
                                                            className: "flex-1 min-w-0",
                                                            children: [
                                                                hs("div", {
                                                                    className: "flex items-center gap-2 flex-wrap",
                                                                    children: [
                                                                        h("span", {
                                                                            className: "text-sm font-medium",
                                                                            children: MOTIVOS.find((m) => m.value === s.motivo)?.label || s.motivo,
                                                                        }),
                                                                        h(Badge, { variant: bInfo.variant, children: bInfo.label }),
                                                                    ],
                                                                }),
                                                                h("p", {
                                                                    className: "text-xs text-muted-foreground mt-0.5",
                                                                    children: `Solicitado: ${fmtDate(s.criadoEm)}`,
                                                                }),
                                                            ],
                                                        }),
                                                        hs("div", {
                                                            className: "flex gap-2 shrink-0",
                                                            children: [
                                                                podeQr ? h(Button, {
                                                                    size: "sm",
                                                                    variant: qrAberto ? "default" : "outline",
                                                                    onClick: () => toggleQr(s.id),
                                                                    children: qrAberto ? "Fechar QR" : "Ver QR",
                                                                }) : null,
                                                                s.status === "PENDENTE_APROVACAO" ? h(Button, {
                                                                    size: "sm",
                                                                    variant: "outline",
                                                                    onClick: () => handleCancelar(s.id),
                                                                    children: "Cancelar",
                                                                }) : null,
                                                            ],
                                                        }),
                                                    ],
                                                }),
                                                qrAberto && s.qrToken ? hs("div", {
                                                    className: "border-t p-4 flex flex-col items-center gap-2 bg-muted/30",
                                                    children: [
                                                        h("img", {
                                                            src: qrUrl(s.qrToken),
                                                            alt: "QR Code",
                                                            className: "w-48 h-48 border rounded bg-white",
                                                            style: { imageRendering: "pixelated" },
                                                        }),
                                                        h("p", {
                                                            className: "text-xs text-muted-foreground text-center",
                                                            children: "Apresente ao autorizador para aprovacao",
                                                        }),
                                                    ],
                                                }) : null,
                                            ],
                                        }, s.id);
                                    }),
                                }),
                    }),
                ],
            }),
        ],
    });
}
