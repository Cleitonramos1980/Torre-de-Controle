import { i as useToast, r as React, j as jsxRuntime, J as Card, K as CardHeader, M as CardTitle, N as CardContent, B as Button, a as apiGet, w as apiPost } from "./index-Cw1PFMX8.js";
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

function fmtDate(iso) {
    if (!iso) return "-";
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function fmtExpiry(iso) {
    if (!iso) return "-";
    const diff = new Date(iso) - new Date();
    if (diff <= 0) return "Expirado";
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}min`;
    return `${Math.floor(mins / 60)}h ${mins % 60}min`;
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
        s.setAttribute("data-jsqr-loader", "true");
        s.onload = () => resolve();
        s.onerror = () => reject(new Error("Falha ao carregar jsQR."));
        document.head.appendChild(s);
    });
    if (typeof window.jsQR !== "function") throw new Error("jsQR indisponivel.");
    return window.jsQR;
}

export default function AprovacaoSaidaPage() {
    const { toast } = useToast();

    const [pendentes, setPendentes] = React.useState([]);
    const [loading, setLoading] = React.useState(false);
    const [actionId, setActionId] = React.useState(null);
    const [obsMap, setObsMap] = React.useState({});
    const [currentUser, setCurrentUser] = React.useState(null);

    // Scanner state
    const videoRef = React.useRef(null);
    const canvasRef = React.useRef(null);
    const streamRef = React.useRef(null);
    const intervalRef = React.useRef(null);
    const [scannerAtivo, setScannerAtivo] = React.useState(false);
    const [scanLoading, setScanLoading] = React.useState(false);
    const [scanResultado, setScanResultado] = React.useState(null);
    const [tokenManual, setTokenManual] = React.useState("");

    const loadPendentes = React.useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiGet("/portaria/saida-funcionario/pendentes");
            setPendentes(Array.isArray(data) ? data : []);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Erro ao carregar.";
            toast({ title: "Erro", description: msg, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    React.useEffect(() => {
        apiGet("/auth/me").then((u) => setCurrentUser(u)).catch(() => {});
        loadPendentes();
        const interval = setInterval(loadPendentes, 30000);
        return () => clearInterval(interval);
    }, [loadPendentes]);

    // Cleanup camera on unmount
    const pararScanner = React.useCallback(() => {
        if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
        if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
        if (videoRef.current) { videoRef.current.pause(); videoRef.current.srcObject = null; }
        setScannerAtivo(false);
    }, []);
    React.useEffect(() => () => pararScanner(), [pararScanner]);

    const validarTokenScan = React.useCallback(async (tokenStr) => {
        const code = tokenStr.trim();
        if (!code) return;
        pararScanner();
        setScanLoading(true);
        setScanResultado(null);
        try {
            const data = await apiPost("/portaria/saida-funcionario/validar-qrcode", { token: code });
            setScanResultado(data);
            if (data.status !== "PENDENTE_APROVACAO") {
                toast({ title: "Aviso", description: data.mensagem || data.status, variant: "destructive" });
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Token invalido.";
            toast({ title: "Token invalido", description: msg, variant: "destructive" });
        } finally {
            setScanLoading(false);
        }
    }, [toast, pararScanner]);

    const iniciarScanner = async () => {
        try {
            const jsQR = await loadJsQR();
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false,
            });
            streamRef.current = stream;
            setScannerAtivo(true);
            setTimeout(() => {
                const video = videoRef.current;
                if (video) { video.srcObject = stream; video.play().catch(() => {}); }
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
                if (code?.data) validarTokenScan(code.data);
            }, 500);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Erro ao acessar camera.";
            toast({ title: "Erro na camera", description: msg, variant: "destructive" });
        }
    };

    // Aprovar/Negar diretamente de um resultado de scan
    const handleAprovarScan = async () => {
        if (!scanResultado?.id) return;
        setActionId(scanResultado.id);
        try {
            await apiPost(`/portaria/saida-funcionario/${scanResultado.id}/aprovar`, {
                observacao: obsMap[scanResultado.id] || undefined,
            });
            toast({ title: "Aprovado!" });
            setScanResultado(null);
            setTokenManual("");
            loadPendentes();
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Erro ao aprovar.";
            toast({ title: "Erro", description: msg, variant: "destructive" });
        } finally {
            setActionId(null);
        }
    };

    const handleNegarScan = async () => {
        if (!scanResultado?.id) return;
        setActionId(scanResultado.id);
        try {
            await apiPost(`/portaria/saida-funcionario/${scanResultado.id}/negar`, {
                observacao: obsMap[scanResultado.id] || "Negado via leitura QR.",
            });
            toast({ title: "Negado." });
            setScanResultado(null);
            setTokenManual("");
            loadPendentes();
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Erro ao negar.";
            toast({ title: "Erro", description: msg, variant: "destructive" });
        } finally {
            setActionId(null);
        }
    };

    // Aprovar/Negar da lista de pendentes
    const handleAprovar = async (id) => {
        setActionId(id);
        try {
            await apiPost(`/portaria/saida-funcionario/${id}/aprovar`, {
                observacao: obsMap[id] || undefined,
            });
            toast({ title: "Aprovado!" });
            setPendentes((prev) => prev.filter((p) => p.id !== id));
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Erro ao aprovar.";
            toast({ title: "Erro", description: msg, variant: "destructive" });
        } finally {
            setActionId(null);
        }
    };

    const handleNegar = async (id) => {
        setActionId(id);
        try {
            await apiPost(`/portaria/saida-funcionario/${id}/negar`, {
                observacao: obsMap[id] || undefined,
            });
            toast({ title: "Negado." });
            setPendentes((prev) => prev.filter((p) => p.id !== id));
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Erro ao negar.";
            toast({ title: "Erro", description: msg, variant: "destructive" });
        } finally {
            setActionId(null);
        }
    };

    const isApprover = ["19", "270"].includes(currentUser?.id);

    if (currentUser && !isApprover) {
        return h(Card, {
            className: "m-6 max-w-lg",
            children: h(CardContent, {
                className: "pt-6",
                children: hs("div", {
                    children: [
                        h("h2", { className: "text-lg font-bold mb-2", children: "Acesso Restrito" }),
                        h("p", { className: "text-muted-foreground", children: "Esta pagina e reservada ao responsavel autorizado." }),
                    ],
                }),
            }),
        });
    }

    const scanSol = scanResultado?.solicitacao || (scanResultado?.id ? scanResultado : null);

    return hs("div", {
        className: "p-4 md:p-6 max-w-2xl mx-auto space-y-4",
        children: [
            // Header
            hs("div", {
                className: "flex items-center justify-between",
                children: [
                    hs("div", {
                        children: [
                            h("h1", { className: "text-2xl font-bold", children: "Aprovacao de Saidas" }),
                            h("p", {
                                className: "text-muted-foreground text-sm",
                                children: `${pendentes.length} solicitacao(oes) pendente(s)`,
                            }),
                        ],
                    }),
                    h(Button, {
                        variant: "outline", size: "sm",
                        onClick: loadPendentes, disabled: loading,
                        children: loading ? "Atualizando..." : "Atualizar",
                    }),
                ],
            }),

            // Scanner de QR Code do funcionário
            hs(Card, {
                className: "border-blue-300 border",
                children: [
                    h(CardHeader, {
                        className: "pb-2",
                        children: h(CardTitle, { className: "text-base", children: "Escanear QR do Funcionario" }),
                    }),
                    h(CardContent, {
                        className: "space-y-3",
                        children: hs("div", {
                            children: [
                                // Camera view (always in DOM for iOS compat)
                                hs("div", {
                                    className: `relative bg-black rounded-lg overflow-hidden${scannerAtivo ? "" : " hidden"}`,
                                    style: { minHeight: "200px" },
                                    children: [
                                        h("video", {
                                            ref: videoRef,
                                            className: "w-full h-full object-cover",
                                            playsInline: true, muted: true, autoPlay: true,
                                            onLoadedMetadata: () => { if (videoRef.current) videoRef.current.play().catch(() => {}); },
                                        }),
                                        h("canvas", { ref: canvasRef, className: "hidden" }),
                                    ],
                                }),
                                // Camera controls
                                !scannerAtivo
                                    ? h(Button, { className: "w-full", onClick: iniciarScanner, children: "Iniciar Camera para Escanear" })
                                    : h(Button, { variant: "outline", className: "w-full", onClick: pararScanner, children: "Parar Camera" }),
                                // Manual token input
                                hs("form", {
                                    onSubmit: (e) => { e.preventDefault(); validarTokenScan(tokenManual); },
                                    className: "flex gap-2",
                                    children: [
                                        h(Input, {
                                            placeholder: "Ou cole o token do funcionario aqui...",
                                            value: tokenManual,
                                            onChange: (e) => setTokenManual(e.target.value),
                                            className: "flex-1 font-mono text-sm",
                                        }),
                                        h(Button, {
                                            type: "submit",
                                            disabled: scanLoading || !tokenManual.trim(),
                                            variant: "outline",
                                            children: scanLoading ? "..." : "Buscar",
                                        }),
                                    ],
                                }),

                                // Resultado do scan
                                scanResultado ? hs("div", {
                                    className: `border-2 rounded-lg p-3 space-y-2 ${scanResultado.status === "PENDENTE_APROVACAO" ? "border-orange-400 bg-orange-50/30" : "border-gray-300"}`,
                                    children: [
                                        hs("div", {
                                            className: "flex items-center justify-between",
                                            children: [
                                                h("p", {
                                                    className: "font-medium text-sm",
                                                    children: scanResultado.nomeFuncionario || scanSol?.funcionarioNome || "-",
                                                }),
                                                h(Badge, {
                                                    variant: scanResultado.status === "PENDENTE_APROVACAO" ? "secondary" : "destructive",
                                                    children: scanResultado.mensagem || scanResultado.status,
                                                }),
                                            ],
                                        }),
                                        scanSol ? hs("div", {
                                            className: "text-xs text-muted-foreground grid grid-cols-2 gap-1",
                                            children: [
                                                hs("div", {
                                                    children: [
                                                        h("span", { className: "font-medium", children: "Motivo: " }),
                                                        h("span", { children: MOTIVO_LABEL[scanSol.motivo] || scanSol.motivo }),
                                                    ],
                                                }),
                                                hs("div", {
                                                    children: [
                                                        h("span", { className: "font-medium", children: "Solicitado: " }),
                                                        h("span", { children: fmtDate(scanSol.criadoEm) }),
                                                    ],
                                                }),
                                                hs("div", {
                                                    children: [
                                                        h("span", { className: "font-medium", children: "Expira em: " }),
                                                        h("span", { children: fmtExpiry(scanSol.qrExpiraEm) }),
                                                    ],
                                                }),
                                            ],
                                        }) : null,
                                        scanResultado.status === "PENDENTE_APROVACAO" ? hs("div", {
                                            className: "space-y-2",
                                            children: [
                                                h(Input, {
                                                    placeholder: "Observacao (opcional)",
                                                    value: obsMap[scanResultado.id] || "",
                                                    onChange: (e) => setObsMap((prev) => ({ ...prev, [scanResultado.id]: e.target.value })),
                                                }),
                                                hs("div", {
                                                    className: "flex gap-2",
                                                    children: [
                                                        h(Button, {
                                                            className: "flex-1",
                                                            style: { backgroundColor: "#2563eb", color: "#ffffff" },
                                                            disabled: actionId === scanResultado.id,
                                                            onClick: handleAprovarScan,
                                                            children: actionId === scanResultado.id ? "Aprovando..." : "Aprovar",
                                                        }),
                                                        h(Button, {
                                                            variant: "destructive",
                                                            className: "flex-1",
                                                            disabled: actionId === scanResultado.id,
                                                            onClick: handleNegarScan,
                                                            children: actionId === scanResultado.id ? "..." : "Negar",
                                                        }),
                                                    ],
                                                }),
                                            ],
                                        }) : null,
                                        h(Button, {
                                            variant: "ghost", size: "sm",
                                            onClick: () => { setScanResultado(null); setTokenManual(""); },
                                            children: "Limpar",
                                        }),
                                    ],
                                }) : null,
                            ],
                        }),
                    }),
                ],
            }),

            // Lista de pendentes
            loading && pendentes.length === 0
                ? h("p", { className: "text-muted-foreground text-sm", children: "Carregando..." })
                : pendentes.length === 0
                    ? h(Card, {
                        children: h(CardContent, {
                            className: "pt-6 text-center text-muted-foreground",
                            children: "Nenhuma solicitacao pendente.",
                        }),
                    })
                    : hs("div", {
                        className: "space-y-4",
                        children: pendentes.map((p) =>
                            hs(Card, {
                                className: "border-l-4 border-l-orange-400",
                                children: [
                                    h(CardHeader, {
                                        className: "pb-2",
                                        children: hs("div", {
                                            className: "flex items-start justify-between gap-2",
                                            children: [
                                                hs("div", {
                                                    children: [
                                                        h(CardTitle, {
                                                            className: "text-base",
                                                            children: p.funcionarioNome || p.nomeFuncionario || p.funcionarioMatricula,
                                                        }),
                                                        h("p", {
                                                            className: "text-xs text-muted-foreground",
                                                            children: `Matricula: ${p.funcionarioMatricula || p.codFunc}`,
                                                        }),
                                                    ],
                                                }),
                                                h(Badge, { variant: "secondary", children: "Pendente" }),
                                            ],
                                        }),
                                    }),
                                    h(CardContent, {
                                        className: "space-y-3",
                                        children: hs("div", {
                                            children: [
                                                hs("div", {
                                                    className: "grid grid-cols-2 gap-2 text-sm mb-3",
                                                    children: [
                                                        hs("div", {
                                                            children: [
                                                                h("span", { className: "font-medium", children: "Motivo: " }),
                                                                h("span", { children: MOTIVO_LABEL[p.motivo] || p.motivo }),
                                                            ],
                                                        }),
                                                        hs("div", {
                                                            children: [
                                                                h("span", { className: "font-medium", children: "Solicitado: " }),
                                                                h("span", { children: fmtDate(p.criadoEm) }),
                                                            ],
                                                        }),
                                                        hs("div", {
                                                            children: [
                                                                h("span", { className: "font-medium", children: "Expira em: " }),
                                                                h("span", { children: fmtExpiry(p.qrExpiraEm) }),
                                                            ],
                                                        }),
                                                        p.observacaoSolicitante ? hs("div", {
                                                            className: "col-span-2",
                                                            children: [
                                                                h("span", { className: "font-medium", children: "Obs: " }),
                                                                h("span", { children: p.observacaoSolicitante }),
                                                            ],
                                                        }) : null,
                                                    ],
                                                }),
                                                h(Input, {
                                                    placeholder: "Observacao (opcional)",
                                                    value: obsMap[p.id] || "",
                                                    onChange: (e) => setObsMap((prev) => ({ ...prev, [p.id]: e.target.value })),
                                                    className: "mb-3",
                                                }),
                                                hs("div", {
                                                    className: "flex gap-2",
                                                    children: [
                                                        h(Button, {
                                                            className: "flex-1",
                                                            style: { backgroundColor: "#2563eb", color: "#ffffff" },
                                                            disabled: actionId === p.id,
                                                            onClick: () => handleAprovar(p.id),
                                                            children: actionId === p.id ? "Aprovando..." : "Aprovar",
                                                        }),
                                                        h(Button, {
                                                            variant: "destructive",
                                                            className: "flex-1",
                                                            disabled: actionId === p.id,
                                                            onClick: () => handleNegar(p.id),
                                                            children: actionId === p.id ? "..." : "Negar",
                                                        }),
                                                    ],
                                                }),
                                            ],
                                        }),
                                    }),
                                ],
                            }, p.id)
                        ),
                    }),
        ],
    });
}
