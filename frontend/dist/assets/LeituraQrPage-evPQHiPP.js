import { h as k, i as L, r as n, j as e, B as o, E as T, J as c, K as b, M as E, b8 as g, N as m, k as D, L as V, w as U, X as W } from "./index-Cw1PFMX8.js";
import { I as B } from "./input-CnWhQnjH.js";
import { C as S } from "./circle-check-big-BBYG8Ose.js";
import { C as P } from "./clock-BvPSHmb1.js";
import { B as $ } from "./ban-Ccr6Z31U.js";
import "./statusText-CAD0X8BX.js";
const H = {
    ENCONTRADO: {
        title: "Identificacao confirmada",
        className: "border-success/30",
        tone: "success",
        icon: S,
    },
    EXPIRADO: {
        title: "QR expirado",
        className: "border-warning/30",
        tone: "warning",
        icon: P,
    },
    BLOQUEADO: {
        title: "Acesso bloqueado",
        className: "border-destructive/30",
        tone: "destructive",
        icon: $,
    },
    UTILIZADO: {
        title: "Acesso ja utilizado",
        className: "border-primary/30",
        tone: "primary",
        icon: S,
    },
    NAO_ENCONTRADO: {
        title: "Nao encontrado",
        className: "border-destructive/30",
        tone: "destructive",
        icon: $,
    },
};
function F(a) {
    const r = (a || "").trim();
    if (!r) {
        return "";
    }
    const t = r.match(/\/visitante\/cadastro\/([A-Za-z0-9_-]{8,})/i);
    return t?.[1] || r;
}
function J(a) {
    return H[a] ?? H.NAO_ENCONTRADO;
}
const G = () => {
    const a = k();
    const { toast: r } = L();
    const t = n.useRef(null);
    const i = n.useRef(null);
    const l = n.useRef(null);
    const u = n.useRef(null);
    const z = n.useRef(null);
    const [f, p] = n.useState("");
    const [v, h] = n.useState(null);
    const [x, _] = n.useState(null);
    const [w, A] = n.useState(false);
    const [C, N] = n.useState(false);
    const [y, M] = n.useState(false);
    const [R, I] = n.useState("");
    const [fe, ge] = n.useState(false);
    const [he, me] = n.useState(false);
    const q = n.useCallback(() => {
        if (l.current) {
            clearInterval(l.current);
            l.current = null;
        }
        if (z.current) {
            clearTimeout(z.current);
            z.current = null;
        }
        if (i.current) {
            i.current.getTracks().forEach((s) => s.stop());
            i.current = null;
        }
        if (t.current) {
            t.current.pause();
            t.current.srcObject = null;
        }
        N(false);
        ge(false);
        me(false);
    }, []);
    n.useEffect(() => () => q(), [q]);
    const X = n.useCallback(async (s) => {
        const d = F(s);
        if (!d) {
            return;
        }
        A(true);
        h(null);
        _(null);
        try {
            const O = await U("/operacional/portaria/qr/scan", { code: d });
            h(O);
            _(O.status || "NAO_ENCONTRADO");
            p(d);
        }
        catch (O) {
            const j = O instanceof Error ? O.message : "Falha ao validar QR Code.";
            _( "NAO_ENCONTRADO");
            h({
                status: "NAO_ENCONTRADO",
                message: j,
            });
            r({
                title: "Falha na leitura",
                description: j,
                variant: "destructive",
            });
        }
        finally {
            A(false);
        }
    }, [r]);
    const K = n.useCallback(async () => {
        const s = v?.acesso?.id;
        if (!s) {
            r({
                title: "Acesso sem vinculacao",
                description: "Nao foi possivel identificar o acesso para liberar.",
                variant: "destructive",
            });
            return;
        }
        M(true);
        try {
            const d = await W(`/operacional/acessos/${s}/liberar`, {});
            h((O) => O ? {
                ...O,
                status: "UTILIZADO",
                message: "Entrada liberada com sucesso na portaria.",
                permitirLiberacao: false,
                acesso: d,
            } : O);
            _("UTILIZADO");
            r({
                title: "Entrada liberada",
                description: "Status atualizado com sucesso.",
            });
        }
        catch (d) {
            const O = d instanceof Error ? d.message : "Falha ao liberar entrada.";
            r({
                title: "Falha ao liberar",
                description: O,
                variant: "destructive",
            });
        }
        finally {
            M(false);
        }
    }, [v, r]);
    const Y = n.useCallback(async () => {
        if (!f.trim()) {
            r({
                title: "Informe o codigo",
                description: "Cole o link/token ou digite o codigo do QR.",
                variant: "destructive",
            });
            return;
        }
        await X(f);
    }, [f, X, r]);
    const se = n.useCallback(async () => {
        if (typeof window === "undefined") {
            return null;
        }
        if (typeof window.jsQR === "function") {
            return window.jsQR;
        }
        await new Promise((s, d) => {
            const O = document.querySelector('script[data-jsqr-loader="true"]');
            if (O) {
                if (typeof window.jsQR === "function") {
                    s();
                    return;
                }
                O.addEventListener("load", () => s(), { once: true });
                O.addEventListener("error", () => d(new Error("Falha ao carregar leitor QR.")), { once: true });
                return;
            }
            const j = document.createElement("script");
            j.src = "/assets/jsQR.min.js";
            j.async = true;
            j.defer = true;
            j.setAttribute("data-jsqr-loader", "true");
            j.onload = () => s();
            j.onerror = () => d(new Error("Falha ao carregar leitor QR."));
            document.head.appendChild(j);
        });
        if (typeof window.jsQR !== "function") {
            throw new Error("Biblioteca jsQR indisponivel.");
        }
        return window.jsQR;
    }, []);
    const Z = n.useCallback(async () => {
        if (!navigator.mediaDevices?.getUserMedia) {
            I("Navegador sem suporte de camera. Use o campo manual.");
            return;
        }
        q();
        I("");
        me(true);
        ge(false);
        let d = null;
        const s = [
            { video: { facingMode: { exact: "environment" } }, audio: false },
            { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
            { video: true, audio: false },
        ];
        try {
            let O = null;
            for (const j of s) {
                try {
                    O = await navigator.mediaDevices.getUserMedia(j);
                    break;
                }
                catch (le) {
                    d = le;
                }
            }
            if (!O) {
                throw d || new Error("Nao foi possivel iniciar a camera.");
            }
            i.current = O;
            N(true);
            await new Promise((j) => setTimeout(j, 0));
            const j = t.current;
            if (!j) {
                throw new Error("Elemento de camera indisponivel.");
            }
            j.setAttribute("playsinline", "true");
            j.setAttribute("webkit-playsinline", "true");
            j.setAttribute("autoplay", "true");
            j.setAttribute("muted", "true");
            j.autoplay = true;
            j.muted = true;
            j.playsInline = true;
            j.srcObject = O;
            await new Promise((le) => {
                const ce = () => {
                    if (j.videoWidth > 0 && j.videoHeight > 0) {
                        return le();
                    }
                };
                const pe = setTimeout(() => {
                    j.removeEventListener("loadedmetadata", ce);
                    j.removeEventListener("canplay", ce);
                    le();
                }, 6000);
                j.addEventListener("loadedmetadata", () => {
                    clearTimeout(pe);
                    ce();
                }, { once: true });
                j.addEventListener("canplay", () => {
                    clearTimeout(pe);
                    ce();
                }, { once: true });
            });
            await j.play().catch(() => void 0);
            ge(true);
            me(false);
            z.current = setTimeout(() => {
                const le = t.current;
                if (!le) {
                    return;
                }
                const ce = le.videoWidth > 0 && le.videoHeight > 0 && le.readyState >= 2;
                if (!ce) {
                    I("A camera iniciou, mas nao entregou imagem. Feche outros apps de camera e toque em Reiniciar camera.");
                    return;
                }
            }, 12000);
            if (typeof window === "undefined") {
                I("Leitura automatica nao suportada neste navegador. Use o campo manual.");
                return;
            }
            if ("BarcodeDetector" in window) {
                const re = new window.BarcodeDetector({ formats: ["qr_code"] });
                l.current = setInterval(async () => {
                    if (!t.current || u.current) {
                        return;
                    }
                    u.current = true;
                    try {
                        const oe = await re.detect(t.current);
                        const ae = oe?.[0]?.rawValue;
                        if (!ae) {
                            return;
                        }
                        p(ae);
                        q();
                        await X(ae);
                    }
                    catch {
                        return;
                    }
                    finally {
                        u.current = false;
                    }
                }, 700);
                return;
            }
            const re = await se();
            const oe = document.createElement("canvas");
            const ae = oe.getContext("2d", { willReadFrequently: true });
            if (!ae) {
                I("Nao foi possivel preparar leitor de imagem da camera.");
                return;
            }
            l.current = setInterval(async () => {
                if (!t.current || u.current) {
                    return;
                }
                if (t.current.readyState < 2) {
                    return;
                }
                const le = t.current.videoWidth || 0;
                const ce = t.current.videoHeight || 0;
                if (!le || !ce) {
                    return;
                }
                u.current = true;
                try {
                    if (oe.width !== le || oe.height !== ce) {
                        oe.width = le;
                        oe.height = ce;
                    }
                    ae.drawImage(t.current, 0, 0, le, ce);
                    const pe = ae.getImageData(0, 0, le, ce);
                    const ve = re(pe.data, le, ce, { inversionAttempts: "dontInvert" });
                    const we = ve?.data;
                    if (!we) {
                        return;
                    }
                    p(we);
                    q();
                    await X(we);
                }
                catch {
                    return;
                }
                finally {
                    u.current = false;
                }
            }, 450);
        }
        catch (O) {
            const j = O instanceof Error ? O.message : "Falha ao acessar camera.";
            const le = typeof O == "object" && O !== null && "name" in O ? String(O.name) : "";
            const ce = le === "NotAllowedError"
                ? "Permissao da camera negada no navegador. Habilite camera para este site e tente novamente."
                : le === "NotReadableError"
                    ? "Camera ocupada por outro aplicativo. Feche o app que estiver usando a camera e tente novamente."
                    : le === "NotFoundError"
                        ? "Nenhuma camera foi encontrada no dispositivo."
                        : `Nao foi possivel abrir a camera: ${j}`;
            I(ce);
            N(false);
            me(false);
            ge(false);
        }
    }, [q, X, se]);
    const aa = () => {
        h(null);
        _(null);
        p("");
    };
    const Q = J(x || "NAO_ENCONTRADO");
    const ee = v?.acesso || null;
    const te = v?.visitante || null;
    const ne = v?.destino || {};
    const re = ee?.id ? `/portaria/${ee.id}` : te?.id ? `/visitantes/${te.id}` : null;
    const oe = Q.icon;
    const ae = !fe || he;
    return e.jsxs("div", { className: "space-y-6 animate-fade-in max-w-4xl mx-auto", children: [e.jsxs("div", { className: "flex items-center gap-3", children: [e.jsx(o, { variant: "ghost", size: "icon", onClick: () => a("/portaria"), children: e.jsx(T, { className: "h-5 w-5" }) }), e.jsxs("div", { children: [e.jsx("h1", { className: "text-2xl font-bold text-foreground", children: "Leitura de QR Code" }), e.jsx("p", { className: "text-sm text-muted-foreground", children: "Leia o QR real do visitante para identificar destino e liberar entrada." })] })] }), e.jsxs(c, { children: [e.jsx(b, { children: e.jsxs(E, { className: "flex items-center gap-2 text-base", children: [e.jsx(g, { className: "h-5 w-5 text-primary" }), " Area de leitura"] }) }), e.jsxs(m, { className: "space-y-4", children: [e.jsxs("div", { className: `aspect-video rounded-lg border-2 ${w ? "border-primary animate-pulse" : "border-dashed border-border"} bg-muted/30 overflow-hidden`, children: [C && e.jsxs("div", { className: "relative h-full w-full bg-black", children: [e.jsx("video", { ref: t, autoPlay: true, muted: true, playsInline: true, className: "w-full h-full object-cover bg-black" }), ae && e.jsxs("div", { className: "absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-white px-4 text-center", children: [e.jsx("p", { className: "text-sm font-medium", children: he ? "Abrindo camera..." : "Carregando imagem da camera..." }), e.jsx("p", { className: "text-xs text-white/80", children: "Se continuar em branco, toque em Tentar novamente." }), e.jsx(o, { variant: "outline", onClick: Z, className: "bg-white text-black hover:bg-white/90", children: "Tentar novamente" })] })] }), !C && e.jsxs("div", { className: "h-full w-full flex flex-col items-center justify-center gap-3", children: [e.jsx(g, { className: "h-16 w-16 text-muted-foreground" }), e.jsx("p", { className: "text-sm text-muted-foreground", children: "Camera pronta para leitura real de QR." }), e.jsx(o, { variant: "outline", onClick: Z, children: "Iniciar camera" })] })] }), R && e.jsx("p", { className: "text-xs text-destructive", children: R }), C && e.jsxs("div", { className: "flex justify-end gap-2", children: [e.jsx(o, { variant: "outline", onClick: Z, children: "Reiniciar camera" }), e.jsx(o, { variant: "ghost", onClick: q, children: "Parar camera" })] }), e.jsxs("div", { className: "flex gap-2", children: [e.jsx(B, { value: f, onChange: (s) => p(s.target.value), placeholder: "Cole o link/token ou digite o codigo...", onKeyDown: (s) => s.key === "Enter" && Y() }), e.jsxs(o, { onClick: Y, className: "gap-1.5", disabled: w, children: [e.jsx(D, { className: "h-4 w-4" }), " Buscar"] })] })] })] }), v && e.jsxs(c, { className: Q.className, children: [e.jsx(b, { className: "pb-3", children: e.jsxs(E, { className: "text-base flex items-center gap-2", children: [e.jsx(oe, { className: `h-5 w-5 text-${Q.tone}` }), Q.title] }) }), e.jsxs(m, { className: "space-y-3", children: [e.jsx("p", { className: "text-sm text-muted-foreground", children: v.message || "Resultado da leitura." }), e.jsxs("dl", { className: "grid grid-cols-2 gap-x-6 gap-y-2 text-sm", children: [e.jsxs("div", { children: [e.jsx("dt", { className: "text-muted-foreground", children: "Nome" }), e.jsx("dd", { className: "font-medium text-foreground", children: ee?.nome || te?.nome || "-" })] }), e.jsxs("div", { children: [e.jsx("dt", { className: "text-muted-foreground", children: "Documento" }), e.jsx("dd", { className: "font-mono text-foreground", children: ee?.documento || te?.documento || "-" })] }), e.jsxs("div", { children: [e.jsx("dt", { className: "text-muted-foreground", children: "Empresa" }), e.jsx("dd", { className: "text-foreground", children: ee?.empresa || te?.empresa || "-" })] }), e.jsxs("div", { children: [e.jsx("dt", { className: "text-muted-foreground", children: "Planta" }), e.jsx("dd", { className: "text-foreground", children: ne.planta || "-" })] }), e.jsxs("div", { children: [e.jsx("dt", { className: "text-muted-foreground", children: "Setor destino" }), e.jsx("dd", { className: "text-foreground", children: ne.setorDestino || "-" })] }), e.jsxs("div", { children: [e.jsx("dt", { className: "text-muted-foreground", children: "Responsavel interno" }), e.jsx("dd", { className: "text-foreground", children: ne.responsavelInterno || "-" })] })] }), e.jsxs("div", { className: "flex gap-2 pt-2", children: [v.permitirLiberacao && ee?.id && e.jsxs(o, { onClick: K, className: "gap-1.5 bg-success hover:bg-success/90", disabled: y, children: [e.jsx(S, { className: "h-4 w-4" }), " Liberar Entrada"] }), re && e.jsx(o, { variant: "outline", asChild: true, children: e.jsx(V, { to: re, children: "Ver Detalhe" }) }), e.jsx(o, { variant: "ghost", onClick: aa, children: "Nova Leitura" })] })] })] })] });
};
export { G as default };
