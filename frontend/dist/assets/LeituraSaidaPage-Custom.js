import { i as useToast, r as React, j as jsxRuntime, J as Card, K as CardHeader, M as CardTitle, N as CardContent, B as Button, w as apiPost } from "./index-Cw1PFMX8.js";
import { I as Input } from "./input-CnWhQnjH.js";
import { B as Badge } from "./badge-B2SLyCXJ.js";

const h = jsxRuntime.jsx;
const hs = jsxRuntime.jsxs;

const MOTIVO_LABEL = {
    MEDICO: "Consulta Medica",
    BANCO: "Banco / Financeiro",
    FARMACIA: "Farmacia",
    PESSOAL: "Assunto Pessoal",
    ALMOCO_EXTERNO: "Almoco Externo",
    OUTRO: "Outro",
};

const STATUS_INFO = {
    APROVADA: { label: "Autorizada - Pode Sair", badgeVariant: "default", borderClass: "border-green-400" },
    SAIDA_REALIZADA: { label: "Saida ja Registrada", badgeVariant: "secondary", borderClass: "border-blue-400" },
    RETORNO_CONFIRMADO: { label: "Retorno Confirmado", badgeVariant: "secondary", borderClass: "border-blue-400" },
    PENDENTE_APROVACAO: { label: "Aguardando Aprovacao", badgeVariant: "secondary", borderClass: "border-yellow-400" },
    NEGADA: { label: "Negada", badgeVariant: "destructive", borderClass: "border-red-400" },
    EXPIRADA: { label: "Expirada", badgeVariant: "destructive", borderClass: "border-red-400" },
    CANCELADA: { label: "Cancelada", badgeVariant: "secondary", borderClass: "border-gray-400" },
};

function fmtDate(iso) {
    if (!iso) return "-";
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

async function loadJsQR() {
    if (typeof window !== "undefined" && typeof window.jsQR === "function") return window.jsQR;
    await new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-jsqr-loader="true"]');
        if (existing) {
            if (typeof window.jsQR === "function") { resolve(); return; }
            existing.addEventListener("load", () => resolve(), { once: true });
            existing.addEventListener("error", () => reject(new Error("Falha ao carregar jsQR.")), { once: true });
            return;
        }
        const s = document.createElement("script");
        s.src = "/assets/jsQR.min.js";
        s.async = true;
        s.defer = true;
        s.setAttribute("data-jsqr-loader", "true");
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Falha ao carregar jsQR."));
        document.head.appendChild(s);
    });
    if (typeof window.jsQR !== "function") throw new Error("jsQR indisponivel.");
    return window.jsQR;
}

export default function LeituraSaidaPage() {
    const { toast } = useToast();

    const videoRef = React.useRef(null);
    const canvasRef = React.useRef(null);
    const streamRef = React.useRef(null);
    const intervalRef = React.useRef(null);

    const [token, setToken] = React.useState("");
    const [cameraAtiva, setCameraAtiva] = React.useState(false);
    const [carregando, setCarregando] = React.useState(false);
    const [resultado, setResultado] = React.useState(null);
    const [confirmando, setConfirmando] = React.useState(false);

    const pararCamera = React.useCallback(() => {
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
        if (videoRef.current) { videoRef.current.pause(); videoRef.current.srcObject = null; }
        setCameraAtiva(false);
    }, []);

    React.useEffect(() => () => pararCamera(), [pararCamera]);

    const validarToken = React.useCallback(async (t) => {
        const code = t.trim();
        if (!code) return;
        setCarregando(true);
        setResultado(null);
        try {
            const data = await apiPost("/portaria/saida-funcionario/validar-qrcode", { token: code });
            setResultado(data);
            pararCamera();
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Token invalido.";
            setResultado({ valido: false, mensagem: msg });
            toast({ title: "Token invalido", description: msg, variant: "destructive" });
        } finally {
            setCarregando(false);
        }
    }, [toast, pararCamera]);

    const iniciarCamera = async () => {
        try {
            const jsQR = await loadJsQR();
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false,
            });
            streamRef.current = stream;
            setCameraAtiva(true);
            // Assign srcObject after state update so video element is in DOM
            setTimeout(() => {
                const video = videoRef.current;
                if (video) {
                    video.srcObject = stream;
                    video.play().catch(() => {});
                }
            }, 0);
            intervalRef.current = setInterval(() => {
                const video = videoRef.current;
                const canvas = canvasRef.current;
                if (!video || !canvas || video.readyState < 2 || video.videoWidth === 0) return;
                const ctx = canvas.getContext("2d");
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
                if (code?.data) validarToken(code.data);
            }, 500);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Erro ao acessar camera.";
            toast({ title: "Erro na camera", description: msg, variant: "destructive" });
        }
    };

    const handleManual = async (e) => {
        e.preventDefault();
        await validarToken(token);
    };

    const handleConfirmar = async (acao) => {
        if (!resultado?.solicitacao?.id) return;
        setConfirmando(true);
        try {
            const data = await apiPost(`/portaria/saida-funcionario/${resultado.solicitacao.id}/confirmar-saida`, { acao });
            toast({ title: acao === "SAIDA" ? "Saida registrada!" : "Retorno confirmado!" });
            setResultado((prev) => prev ? { ...prev, solicitacao: data } : prev);
            setToken("");
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Erro ao confirmar.";
            toast({ title: "Erro", description: msg, variant: "destructive" });
        } finally {
            setConfirmando(false);
        }
    };

    const sol = resultado?.solicitacao;
    const statusInfo = sol ? (STATUS_INFO[sol.status] || { label: sol.status, badgeVariant: "secondary", borderClass: "border-gray-400" }) : null;
    const podeConfirmarSaida = sol?.status === "APROVADA";
    const podeConfirmarRetorno = sol?.status === "SAIDA_REALIZADA";

    return hs("div", {
        className: "p-4 md:p-6 max-w-lg mx-auto space-y-4",
        children: [
            hs("div", {
                children: [
                    h("h1", { className: "text-2xl font-bold", children: "Leitura - Saida de Funcionario" }),
                    h("p", { className: "text-muted-foreground text-sm", children: "Leia o QR Code ou digite o token" }),
                ],
            }),

            hs(Card, {
                children: [
                    h(CardHeader, {
                        className: "pb-2",
                        children: h(CardTitle, { className: "text-base", children: "Camera QR Code" }),
                    }),
                    h(CardContent, {
                        className: "space-y-3",
                        children: hs("div", {
                            children: [
                                hs("div", {
                                    className: `relative bg-black rounded-lg overflow-hidden${cameraAtiva ? "" : " hidden"}`,
                                    style: { minHeight: "240px" },
                                    children: [
                                        h("video", {
                                            ref: videoRef,
                                            className: "w-full h-full object-cover",
                                            playsInline: true,
                                            muted: true,
                                            autoPlay: true,
                                            onLoadedMetadata: () => { if (videoRef.current) videoRef.current.play().catch(() => {}); },
                                        }),
                                        h("canvas", { ref: canvasRef, className: "hidden" }),
                                    ],
                                }),
                                !cameraAtiva
                                    ? h(Button, { className: "w-full", onClick: iniciarCamera, children: "Iniciar Camera" })
                                    : h(Button, { variant: "outline", className: "w-full", onClick: pararCamera, children: "Parar Camera" }),
                            ],
                        }),
                    }),
                ],
            }),

            hs(Card, {
                children: [
                    h(CardHeader, {
                        className: "pb-2",
                        children: h(CardTitle, { className: "text-base", children: "Token Manual" }),
                    }),
                    h(CardContent, {
                        children: hs("form", {
                            onSubmit: handleManual,
                            className: "flex gap-2",
                            children: [
                                h(Input, {
                                    placeholder: "Token de 32 caracteres...",
                                    value: token,
                                    onChange: (e) => setToken(e.target.value),
                                    className: "flex-1 font-mono",
                                }),
                                h(Button, {
                                    type: "submit",
                                    disabled: carregando || !token.trim(),
                                    children: carregando ? "..." : "Validar",
                                }),
                            ],
                        }),
                    }),
                ],
            }),

            resultado ? hs(Card, {
                className: `border-2 ${statusInfo?.borderClass || ""}`,
                children: [
                    h(CardHeader, {
                        className: "pb-2",
                        children: hs("div", {
                            className: "flex items-center justify-between",
                            children: [
                                h(CardTitle, { className: "text-base", children: "Resultado" }),
                                statusInfo ? h(Badge, { variant: statusInfo.badgeVariant, children: statusInfo.label }) : null,
                            ],
                        }),
                    }),
                    h(CardContent, {
                        className: "space-y-3",
                        children: hs("div", {
                            children: [
                                !resultado.valido
                                    ? hs("div", {
                                        children: [
                                            h("p", { className: "text-destructive font-medium", children: "Token invalido" }),
                                            h("p", { className: "text-sm text-muted-foreground", children: resultado.mensagem || "" }),
                                        ],
                                    })
                                    : hs("div", {
                                        className: "space-y-2",
                                        children: [
                                            hs("div", {
                                                className: "grid grid-cols-2 gap-2 text-sm",
                                                children: [
                                                    hs("div", {
                                                        children: [
                                                            h("span", { className: "font-medium", children: "Funcionario: " }),
                                                            h("span", { children: sol?.funcionarioNome || sol?.funcionarioMatricula || "-" }),
                                                        ],
                                                    }),
                                                    hs("div", {
                                                        children: [
                                                            h("span", { className: "font-medium", children: "Matricula: " }),
                                                            h("span", { children: sol?.funcionarioMatricula || "-" }),
                                                        ],
                                                    }),
                                                    hs("div", {
                                                        children: [
                                                            h("span", { className: "font-medium", children: "Motivo: " }),
                                                            h("span", { children: MOTIVO_LABEL[sol?.motivo] || sol?.motivo || "-" }),
                                                        ],
                                                    }),
                                                    hs("div", {
                                                        children: [
                                                            h("span", { className: "font-medium", children: "Aprovado por: " }),
                                                            h("span", { children: sol?.aprovadorNome || "-" }),
                                                        ],
                                                    }),
                                                    sol?.saidaEm ? hs("div", {
                                                        children: [
                                                            h("span", { className: "font-medium", children: "Saiu em: " }),
                                                            h("span", { children: fmtDate(sol.saidaEm) }),
                                                        ],
                                                    }) : null,
                                                    sol?.retornoEm ? hs("div", {
                                                        children: [
                                                            h("span", { className: "font-medium", children: "Retornou: " }),
                                                            h("span", { children: fmtDate(sol.retornoEm) }),
                                                        ],
                                                    }) : null,
                                                ],
                                            }),
                                            (podeConfirmarSaida || podeConfirmarRetorno)
                                                ? hs("div", {
                                                    className: "flex gap-2 pt-2",
                                                    children: [
                                                        podeConfirmarSaida
                                                            ? h(Button, {
                                                                className: "flex-1 bg-green-600 hover:bg-green-700",
                                                                disabled: confirmando,
                                                                onClick: () => handleConfirmar("SAIDA"),
                                                                children: confirmando ? "..." : "Confirmar Saida",
                                                            })
                                                            : null,
                                                        podeConfirmarRetorno
                                                            ? h(Button, {
                                                                className: "flex-1 bg-blue-600 hover:bg-blue-700",
                                                                disabled: confirmando,
                                                                onClick: () => handleConfirmar("RETORNO"),
                                                                children: confirmando ? "..." : "Confirmar Retorno",
                                                            })
                                                            : null,
                                                    ],
                                                })
                                                : null,
                                        ],
                                    }),
                                h(Button, {
                                    variant: "ghost",
                                    size: "sm",
                                    className: "mt-2",
                                    onClick: () => { setResultado(null); setToken(""); pararCamera(); },
                                    children: "Nova Leitura",
                                }),
                            ],
                        }),
                    }),
                ],
            }) : null,
        ],
    });
}
