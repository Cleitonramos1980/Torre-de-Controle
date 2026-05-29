import { r as React, j as jsxRuntime, J as Card, N as CardContent, d as BuildingIcon, B as Button } from "./index-Cw1PFMX8.js";
import { I as Input } from "./input-CnWhQnjH.js";
import { L as Label } from "./label-CRMrAwdj.js";

const h = jsxRuntime.jsx;
const hs = jsxRuntime.jsxs;

const BASE_URL = typeof window !== "undefined"
    ? window.location.origin
    : "https://visitante.rodriguescolchoes.com.br:3344";

async function apiWalkIn(body) {
    const res = await fetch(`${BASE_URL}/api/operacional/visitantes/walk-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error?.message || json?.message || `Erro ${res.status}`);
    return json;
}

function qrUrl(acessoId) {
    return `${BASE_URL}/api/portaria/saida-funcionario/qrcode-image?token=${encodeURIComponent(acessoId)}`;
}

const fieldStyle = {
    width: "100%",
};

export default function VisitanteEntradaPage() {
    const [screen, setScreen] = React.useState("form");
    const [sending, setSending] = React.useState(false);
    const [error, setError] = React.useState("");
    const [result, setResult] = React.useState(null);

    const [nome, setNome] = React.useState("");
    const [documento, setDocumento] = React.useState("");
    const [empresa, setEmpresa] = React.useState("");
    const [telefone, setTelefone] = React.useState("");
    const [email, setEmail] = React.useState("");
    const [obs, setObs] = React.useState("");
    const [possuiVeiculo, setPossuiVeiculo] = React.useState(false);
    const [placa, setPlaca] = React.useState("");

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        if (!nome.trim() || !documento.trim() || !empresa.trim() || !telefone.trim()) {
            setError("Preencha nome, documento, empresa e telefone.");
            return;
        }
        setSending(true);
        try {
            const data = await apiWalkIn({
                nome: nome.trim(),
                documento: documento.trim(),
                empresa: empresa.trim(),
                telefone: telefone.trim(),
                email: email.trim(),
                obs: obs.trim(),
                possuiVeiculo,
                placa: placa.trim(),
            });
            setResult(data);
            setScreen("qrcode");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Erro ao registrar. Tente novamente.");
        } finally {
            setSending(false);
        }
    };

    const handleNovo = () => {
        setNome(""); setDocumento(""); setEmpresa(""); setTelefone("");
        setEmail(""); setObs(""); setPossuiVeiculo(false); setPlaca("");
        setError(""); setResult(null); setScreen("form");
    };

    if (screen === "qrcode" && result) {
        return h("div", {
            className: "min-h-screen bg-background flex items-center justify-center p-4",
            children: h(Card, {
                className: "max-w-sm w-full",
                children: h(CardContent, {
                    className: "pt-6 pb-6 space-y-5 text-center",
                    children: hs("div", {
                        children: [
                            h("div", {
                                className: "h-16 w-16 mx-auto rounded-full flex items-center justify-center mb-2",
                                style: { backgroundColor: "#dbeafe" },
                                children: h(BuildingIcon, { className: "h-8 w-8", style: { color: "#2563eb" } }),
                            }),
                            h("h2", { className: "text-xl font-bold text-foreground", children: "Cadastro Realizado!" }),
                            h("p", {
                                className: "text-sm text-muted-foreground",
                                children: `Bem-vindo(a), ${result.nome}. Apresente o QR Code abaixo ao porteiro.`,
                            }),
                            h("div", {
                                className: "mx-auto rounded-xl border-2 border-border bg-card p-3 space-y-2",
                                style: { width: "fit-content" },
                                children: hs("div", {
                                    children: [
                                        h("img", {
                                            src: qrUrl(result.acessoId),
                                            alt: "QR Code de entrada",
                                            className: "mx-auto rounded-lg bg-white",
                                            style: { width: "220px", height: "220px" },
                                        }),
                                        h("p", {
                                            className: "text-xs text-muted-foreground font-mono mt-1",
                                            children: result.acessoId,
                                        }),
                                    ],
                                }),
                            }),
                            h("p", {
                                className: "text-xs text-muted-foreground",
                                children: "O porteiro vai escanear este codigo para liberar sua entrada.",
                            }),
                            h(Button, {
                                variant: "outline",
                                className: "w-full",
                                onClick: handleNovo,
                                children: "Novo Cadastro",
                            }),
                        ],
                    }),
                }),
            }),
        });
    }

    return hs("div", {
        className: "min-h-screen bg-background",
        children: [
            h("header", {
                className: "border-b border-border bg-card",
                children: h("div", {
                    className: "max-w-lg mx-auto px-4 py-4 flex items-center gap-3",
                    children: hs("div", {
                        className: "flex items-center gap-3",
                        children: [
                            h("div", {
                                className: "h-10 w-10 rounded-lg flex items-center justify-center",
                                style: { backgroundColor: "#dbeafe" },
                                children: h(BuildingIcon, { className: "h-5 w-5", style: { color: "#2563eb" } }),
                            }),
                            hs("div", {
                                children: [
                                    h("h1", { className: "text-sm font-bold text-foreground", children: "Entrada de Visitante" }),
                                    h("p", { className: "text-xs text-muted-foreground", children: "Rodrigues Colchoes - Portaria" }),
                                ],
                            }),
                        ],
                    }),
                }),
            }),
            h("main", {
                className: "max-w-lg mx-auto px-4 py-6",
                children: h(Card, {
                    children: h(CardContent, {
                        className: "pt-6",
                        children: hs("form", {
                            onSubmit: handleSubmit,
                            className: "space-y-4",
                            children: [
                                h("p", {
                                    className: "text-sm text-muted-foreground mb-2",
                                    children: "Preencha seus dados para gerar o codigo de entrada.",
                                }),

                                // Nome
                                hs("div", {
                                    className: "space-y-1",
                                    children: [
                                        h(Label, { children: "Nome Completo *" }),
                                        h(Input, {
                                            value: nome,
                                            onChange: (e) => setNome(e.target.value),
                                            placeholder: "Seu nome completo",
                                            style: fieldStyle,
                                            autoComplete: "name",
                                        }),
                                    ],
                                }),

                                // Documento
                                hs("div", {
                                    className: "space-y-1",
                                    children: [
                                        h(Label, { children: "CPF / RG / Documento *" }),
                                        h(Input, {
                                            value: documento,
                                            onChange: (e) => setDocumento(e.target.value),
                                            placeholder: "Numero do documento",
                                            style: fieldStyle,
                                            autoComplete: "off",
                                        }),
                                    ],
                                }),

                                // Empresa e Telefone lado a lado em telas maiores
                                hs("div", {
                                    className: "grid grid-cols-1 sm:grid-cols-2 gap-4",
                                    children: [
                                        hs("div", {
                                            className: "space-y-1",
                                            children: [
                                                h(Label, { children: "Empresa / Origem *" }),
                                                h(Input, {
                                                    value: empresa,
                                                    onChange: (e) => setEmpresa(e.target.value),
                                                    placeholder: "Nome da empresa",
                                                    style: fieldStyle,
                                                }),
                                            ],
                                        }),
                                        hs("div", {
                                            className: "space-y-1",
                                            children: [
                                                h(Label, { children: "Telefone *" }),
                                                h(Input, {
                                                    value: telefone,
                                                    onChange: (e) => setTelefone(e.target.value),
                                                    placeholder: "(00) 00000-0000",
                                                    type: "tel",
                                                    style: fieldStyle,
                                                    autoComplete: "tel",
                                                }),
                                            ],
                                        }),
                                    ],
                                }),

                                // Email opcional
                                hs("div", {
                                    className: "space-y-1",
                                    children: [
                                        h(Label, { children: "E-mail (opcional)" }),
                                        h(Input, {
                                            value: email,
                                            onChange: (e) => setEmail(e.target.value),
                                            placeholder: "seu@email.com",
                                            type: "email",
                                            style: fieldStyle,
                                            autoComplete: "email",
                                        }),
                                    ],
                                }),

                                // Veículo
                                hs("div", {
                                    className: "space-y-2",
                                    children: [
                                        hs("label", {
                                            className: "flex items-center gap-2 cursor-pointer",
                                            children: [
                                                h("input", {
                                                    type: "checkbox",
                                                    checked: possuiVeiculo,
                                                    onChange: (e) => setPossuiVeiculo(e.target.checked),
                                                    className: "h-4 w-4 rounded border border-input",
                                                }),
                                                h("span", { className: "text-sm", children: "Estou com veiculo" }),
                                            ],
                                        }),
                                        possuiVeiculo ? hs("div", {
                                            className: "space-y-1",
                                            children: [
                                                h(Label, { children: "Placa do Veiculo" }),
                                                h(Input, {
                                                    value: placa,
                                                    onChange: (e) => setPlaca(e.target.value),
                                                    placeholder: "ABC-1D23",
                                                    style: fieldStyle,
                                                }),
                                            ],
                                        }) : null,
                                    ],
                                }),

                                // Obs opcional
                                hs("div", {
                                    className: "space-y-1",
                                    children: [
                                        h(Label, { children: "Observacao (opcional)" }),
                                        h("textarea", {
                                            value: obs,
                                            onChange: (e) => setObs(e.target.value),
                                            placeholder: "Motivo da visita, setor destino...",
                                            rows: 2,
                                            style: {
                                                width: "100%", padding: "8px 12px", borderRadius: "6px",
                                                border: "1px solid hsl(var(--input))", background: "hsl(var(--background))",
                                                color: "hsl(var(--foreground))", fontSize: "14px", resize: "vertical",
                                            },
                                        }),
                                    ],
                                }),

                                // Erro
                                error ? h("p", {
                                    className: "text-sm text-destructive font-medium",
                                    children: error,
                                }) : null,

                                // Botão
                                h(Button, {
                                    type: "submit",
                                    disabled: sending,
                                    className: "w-full",
                                    style: { backgroundColor: "#2563eb", color: "#ffffff" },
                                    children: sending ? "Registrando..." : "Registrar Entrada e Gerar QR Code",
                                }),
                            ],
                        }),
                    }),
                }),
            }),
        ],
    });
}
