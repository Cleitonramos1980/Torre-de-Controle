import { r as React, j as jsxRuntime, J as Card, N as CardContent } from "./index-Cw1PFMX8.js";

const h = jsxRuntime.jsx;
const hs = jsxRuntime.jsxs;

const ENTRADA_URL = "https://visitante.rodriguescolchoes.com.br:3344/visitante/entrada";
const QR_IMG_URL = `/api/portaria/saida-funcionario/qrcode-image?token=${encodeURIComponent(ENTRADA_URL)}`;

export default function AcessoImediatoPage() {
    const [imgOk, setImgOk] = React.useState(true);

    return hs("div", {
        className: "p-4 md:p-6 max-w-lg mx-auto space-y-6",
        children: [
            hs("div", {
                children: [
                    h("h1", { className: "text-2xl font-bold", children: "Acesso Imediato" }),
                    h("p", {
                        className: "text-muted-foreground text-sm mt-1",
                        children: "Exiba este QR Code para o visitante escanear e preencher os dados de entrada.",
                    }),
                ],
            }),

            h(Card, {
                children: h(CardContent, {
                    className: "pt-6 pb-6 flex flex-col items-center gap-4",
                    children: hs("div", {
                        children: [
                            imgOk
                                ? h("img", {
                                    src: QR_IMG_URL,
                                    alt: "QR Code de Acesso Imediato",
                                    onError: () => setImgOk(false),
                                    style: {
                                        width: "280px",
                                        height: "280px",
                                        imageRendering: "pixelated",
                                        borderRadius: "12px",
                                        border: "1px solid #e5e7eb",
                                        background: "#ffffff",
                                        display: "block",
                                        margin: "0 auto",
                                    },
                                })
                                : h("img", {
                                    src: `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=2&data=${encodeURIComponent(ENTRADA_URL)}`,
                                    alt: "QR Code de Acesso Imediato",
                                    style: {
                                        width: "280px",
                                        height: "280px",
                                        borderRadius: "12px",
                                        border: "1px solid #e5e7eb",
                                        background: "#ffffff",
                                        display: "block",
                                        margin: "0 auto",
                                    },
                                }),

                            h("p", {
                                className: "text-xs text-muted-foreground text-center font-mono break-all mt-2",
                                children: ENTRADA_URL,
                            }),

                            hs("div", {
                                className: "text-sm text-center text-muted-foreground space-y-1 mt-2",
                                children: [
                                    h("p", { children: "1. Visitante escaneia o QR Code" }),
                                    h("p", { children: "2. Preenche nome, documento, empresa e telefone" }),
                                    h("p", { children: "3. Recebe um QR de entrada" }),
                                    h("p", { children: "4. Porteiro escaneia o QR em Portaria > Leitura QR" }),
                                ],
                            }),
                        ],
                    }),
                }),
            }),
        ],
    });
}
