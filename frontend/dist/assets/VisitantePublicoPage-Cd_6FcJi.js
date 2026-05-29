import { aL as useParams, r as React, j as jsxRuntime, J as Card, N as CardContent, d as BuildingIcon, B as Button, E as ArrowLeft, t as toast } from "./index-Cw1PFMX8.js";
import { I as Input } from "./input-CnWhQnjH.js";
import { L as Label } from "./label-CRMrAwdj.js";
import { T as Textarea } from "./textarea-Ch7hFFqp.js";
import { C as Checkbox } from "./checkbox-C6abMMwx.js";
import { S as Select, a as SelectTrigger, b as SelectValue, c as SelectContent, d as SelectItem } from "./select-BwD7H_FL.js";
import { A as fetchPublicSolicitacao, B as preencherPublicSolicitacao } from "./operacional-4Pj5wcXo.js";
import { C as CheckIcon } from "./check-BVac9zGz.js";
import "./index-CM7B8zZL.js";
import "./index-BdQq_4o_.js";
import "./index-lgCT-RbZ.js";

const STEPS = ["Identificacao", "Selfie", "Veiculo", "Revisao"];
const MAX_SELFIE_BYTES = 900000;

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Falha ao ler selfie."));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Falha ao processar selfie."));
    image.src = src;
  });
}

async function optimizeSelfie(file) {
  const dataUrl = await fileToDataUrl(file);
  if (!dataUrl.startsWith("data:image/")) {
    throw new Error("Formato de selfie invalido.");
  }
  let image;
  try {
    image = await loadImage(dataUrl);
  } catch {
    throw new Error("Formato da selfie nao suportado. Tire outra foto no formato JPG.");
  }
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  let width = image.width;
  let height = image.height;
  const scale = Math.min(1, 1280 / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const draw = () => {
    canvas.width = width;
    canvas.height = height;
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
  };

  draw();
  let quality = 0.86;
  let output = canvas.toDataURL("image/jpeg", quality);
  while (output.length > MAX_SELFIE_BYTES && quality > 0.45) {
    quality -= 0.08;
    output = canvas.toDataURL("image/jpeg", quality);
  }
  while (output.length > MAX_SELFIE_BYTES && (width > 480 || height > 480)) {
    width = Math.max(480, Math.round(width * 0.85));
    height = Math.max(480, Math.round(height * 0.85));
    draw();
    quality = 0.74;
    output = canvas.toDataURL("image/jpeg", quality);
    while (output.length > MAX_SELFIE_BYTES && quality > 0.45) {
      quality -= 0.08;
      output = canvas.toDataURL("image/jpeg", quality);
    }
    if (width === 480 && height === 480) break;
  }
  return output.length <= MAX_SELFIE_BYTES ? output : "";
}

const VisitantePublicoPage = () => {
  const { token } = useParams();
  const [screen, setScreen] = React.useState("loading");
  const [step, setStep] = React.useState(0);
  const [sending, setSending] = React.useState(false);
  const fileRef = React.useRef(null);
  const [selfieUrl, setSelfieUrl] = React.useState(null);
  const [form, setForm] = React.useState({
    nome: "",
    documento: "",
    empresa: "",
    telefone: "",
    email: "",
    possuiVeiculo: false,
    placa: "",
    tipoVeiculo: "",
    modelo: "",
    cor: "",
    obs: "",
  });

  const qrDestino = `${typeof window < "u" ? window.location.origin : "https://visitante.rodriguescolchoes.com.br:3344"}/visitante/cadastro/${token || ""}`;
  const qrImagem = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=1&data=${encodeURIComponent(qrDestino)}`;

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  React.useEffect(() => {
    if (!token) {
      setScreen("error");
      return;
    }
    let active = true;
    setScreen("loading");
    fetchPublicSolicitacao(token)
      .then((payload) => {
        if (!active) return;
        if (["PREENCHIDO", "VALIDADO", "CONVERTIDO_EM_ACESSO"].includes(payload.status) || payload.visitantePreenchido) {
          setScreen("used");
          return;
        }
        if (payload.status === "EXPIRADO") {
          setScreen("expired");
          return;
        }
        setScreen("form");
      })
      .catch((error) => {
        if (!active) return;
        if (error?.status === 410) {
          setScreen("expired");
          return;
        }
        if (error?.status === 409) {
          setScreen("used");
          return;
        }
        setScreen("error");
      });
    return () => {
      active = false;
    };
  }, [token]);

  const onSelfieChange = async (event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;
    try {
      const optimized = await optimizeSelfie(file);
      if (!optimized) {
        setSelfieUrl(null);
        toast({
          title: "Selfie invalida",
          description: "Nao foi possivel preparar a selfie para envio. Tire outra foto mais proxima do rosto.",
          variant: "destructive",
        });
        return;
      }
      setSelfieUrl(optimized);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao processar selfie.";
      toast({
        title: "Erro na selfie",
        description: message,
        variant: "destructive",
      });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const validateForm = () => {
    if (!form.nome.trim() || !form.documento.trim() || !form.empresa.trim() || !form.telefone.trim()) {
      toast({
        title: "Campos obrigatorios",
        description: "Preencha nome, documento, empresa e telefone.",
        variant: "destructive",
      });
      setStep(0);
      return false;
    }
    if (form.possuiVeiculo && !form.placa.trim()) {
      toast({
        title: "Placa obrigatoria",
        description: "Informe a placa do veiculo.",
        variant: "destructive",
      });
      setStep(2);
      return false;
    }
    return true;
  };

  const submit = async () => {
    if (!token || !validateForm()) return;
    setSending(true);
    try {
      await preencherPublicSolicitacao(token, {
        nome: form.nome.trim(),
        documento: form.documento.trim(),
        empresa: form.empresa.trim(),
        telefone: form.telefone.trim(),
        email: form.email.trim(),
        possuiVeiculo: form.possuiVeiculo,
        placa: form.placa.trim(),
        tipoVeiculo: form.tipoVeiculo.trim(),
        modelo: form.modelo.trim(),
        cor: form.cor.trim(),
        obs: form.obs.trim(),
        selfieUrl: selfieUrl || "",
      });
      setScreen("submitted");
    } catch (error) {
      if (error?.status === 410) {
        setScreen("expired");
        return;
      }
      if (error?.status === 409) {
        setScreen("used");
        return;
      }
      const message = error?.message || "Nao foi possivel enviar o cadastro.";
      toast({
        title: "Falha ao enviar",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  if (screen === "loading") {
    return jsxRuntime.jsx("div", {
      className: "min-h-screen bg-background flex items-center justify-center p-4",
      children: jsxRuntime.jsx("p", { className: "text-sm text-muted-foreground", children: "Validando link de preenchimento..." }),
    });
  }

  if (screen === "expired") {
    return jsxRuntime.jsx("div", {
      className: "min-h-screen bg-background flex items-center justify-center p-4",
      children: jsxRuntime.jsxs(Card, {
        className: "max-w-md w-full text-center",
        children: [
          jsxRuntime.jsx(CardContent, {
            className: "pt-8 pb-8 space-y-4",
            children: jsxRuntime.jsxs(jsxRuntime.Fragment, {
              children: [
                jsxRuntime.jsx("h2", { className: "text-xl font-bold text-foreground", children: "Link Expirado" }),
                jsxRuntime.jsx("p", { className: "text-sm text-muted-foreground", children: "Este link nao e mais valido. Solicite um novo convite ao responsavel interno." }),
              ],
            }),
          }),
        ],
      }),
    });
  }

  if (screen === "used") {
    return jsxRuntime.jsx("div", {
      className: "min-h-screen bg-background flex items-center justify-center p-4",
      children: jsxRuntime.jsx(Card, {
        className: "max-w-md w-full text-center",
        children: jsxRuntime.jsx(CardContent, {
          className: "pt-8 pb-8 space-y-4",
          children: jsxRuntime.jsxs(jsxRuntime.Fragment, {
            children: [
              jsxRuntime.jsx("h2", { className: "text-xl font-bold text-foreground", children: "Cadastro Ja Realizado" }),
              jsxRuntime.jsx("p", { className: "text-sm text-muted-foreground", children: "Seus dados ja foram enviados para validacao da portaria." }),
            ],
          }),
        }),
      }),
    });
  }

  if (screen === "error") {
    return jsxRuntime.jsx("div", {
      className: "min-h-screen bg-background flex items-center justify-center p-4",
      children: jsxRuntime.jsx(Card, {
        className: "max-w-md w-full text-center",
        children: jsxRuntime.jsx(CardContent, {
          className: "pt-8 pb-8 space-y-4",
          children: jsxRuntime.jsxs(jsxRuntime.Fragment, {
            children: [
              jsxRuntime.jsx("h2", { className: "text-xl font-bold text-foreground", children: "Link Invalido" }),
              jsxRuntime.jsx("p", { className: "text-sm text-muted-foreground", children: "Nao foi possivel validar este link. Confira o endereco recebido." }),
            ],
          }),
        }),
      }),
    });
  }

  if (screen === "submitted") {
    return jsxRuntime.jsx("div", {
      className: "min-h-screen bg-background flex items-center justify-center p-4",
      children: jsxRuntime.jsx(Card, {
        className: "max-w-md w-full text-center",
        children: jsxRuntime.jsxs(CardContent, {
          className: "pt-8 pb-8 space-y-6",
          children: [
            jsxRuntime.jsx("div", {
              className: "h-20 w-20 mx-auto rounded-full bg-success/10 flex items-center justify-center",
              children: jsxRuntime.jsx(CheckIcon, { className: "h-10 w-10 text-success" }),
            }),
            jsxRuntime.jsxs("div", {
              children: [
                jsxRuntime.jsx("h2", { className: "text-xl font-bold text-foreground", children: "Cadastro Enviado com Sucesso!" }),
                jsxRuntime.jsx("p", { className: "text-sm text-muted-foreground mt-2", children: "Seus dados foram recebidos e estao aguardando validacao da portaria." }),
              ],
            }),
            jsxRuntime.jsxs("div", {
              className: "mx-auto w-56 rounded-xl border-2 border-border bg-card p-3 space-y-2",
              children: [
                jsxRuntime.jsx("img", {
                  src: qrImagem,
                  alt: "QR Code de acesso",
                  className: "mx-auto h-48 w-48 rounded-lg bg-white",
                }),
                jsxRuntime.jsx("p", {
                  className: "text-[10px] text-muted-foreground break-all font-mono",
                  children: qrDestino,
                }),
              ],
            }),
          ],
        }),
      }),
    });
  }

  return jsxRuntime.jsxs("div", {
    className: "min-h-screen bg-background",
    children: [
      jsxRuntime.jsx("header", {
        className: "border-b border-border bg-card",
        children: jsxRuntime.jsxs("div", {
          className: "max-w-2xl mx-auto px-4 py-4 flex items-center gap-3",
          children: [
            jsxRuntime.jsx("div", {
              className: "h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center",
              children: jsxRuntime.jsx(BuildingIcon, { className: "h-5 w-5 text-primary" }),
            }),
            jsxRuntime.jsxs("div", {
              children: [
                jsxRuntime.jsx("h1", { className: "text-sm font-bold text-foreground", children: "Cadastro de Visitante" }),
                jsxRuntime.jsx("p", { className: "text-xs text-muted-foreground", children: "Portal de Pre-autorizacao Segura" }),
              ],
            }),
          ],
        }),
      }),
      jsxRuntime.jsxs("main", {
        className: "max-w-2xl mx-auto px-4 py-6 space-y-6",
        children: [
          jsxRuntime.jsx("div", {
            className: "flex items-center gap-2",
            children: STEPS.map((label, idx) => jsxRuntime.jsxs("div", {
              className: "flex items-center gap-2",
              children: [
                jsxRuntime.jsx("div", {
                  className: `flex items-center justify-center h-8 w-8 rounded-full text-xs font-bold border-2 ${idx < step ? "bg-primary text-primary-foreground border-primary" : idx === step ? "border-primary text-primary bg-primary/10" : "border-muted text-muted-foreground"}`,
                  children: idx < step ? jsxRuntime.jsx(CheckIcon, { className: "h-4 w-4" }) : idx + 1,
                }),
                jsxRuntime.jsx("span", {
                  className: `text-xs hidden sm:inline ${idx === step ? "font-semibold text-foreground" : "text-muted-foreground"}`,
                  children: label,
                }),
                idx < STEPS.length - 1 && jsxRuntime.jsx("div", { className: "w-6 h-px bg-border" }),
              ],
            }, label)),
          }),
          jsxRuntime.jsx(Card, {
            children: jsxRuntime.jsxs(CardContent, {
              className: "pt-6 space-y-5",
              children: [
                step === 0 && jsxRuntime.jsxs("div", {
                  className: "space-y-4",
                  children: [
                    jsxRuntime.jsxs("div", {
                      className: "grid grid-cols-1 sm:grid-cols-2 gap-4",
                      children: [
                        jsxRuntime.jsxs("div", { className: "space-y-2", children: [jsxRuntime.jsx(Label, { children: "Nome Completo *" }), jsxRuntime.jsx(Input, { value: form.nome, onChange: (evt) => setField("nome", evt.target.value) })] }),
                        jsxRuntime.jsxs("div", { className: "space-y-2", children: [jsxRuntime.jsx(Label, { children: "CPF / Documento *" }), jsxRuntime.jsx(Input, { value: form.documento, onChange: (evt) => setField("documento", evt.target.value) })] }),
                        jsxRuntime.jsxs("div", { className: "space-y-2", children: [jsxRuntime.jsx(Label, { children: "Empresa *" }), jsxRuntime.jsx(Input, { value: form.empresa, onChange: (evt) => setField("empresa", evt.target.value) })] }),
                        jsxRuntime.jsxs("div", { className: "space-y-2", children: [jsxRuntime.jsx(Label, { children: "Telefone *" }), jsxRuntime.jsx(Input, { value: form.telefone, onChange: (evt) => setField("telefone", evt.target.value) })] }),
                        jsxRuntime.jsxs("div", { className: "space-y-2 sm:col-span-2", children: [jsxRuntime.jsx(Label, { children: "E-mail" }), jsxRuntime.jsx(Input, { value: form.email, onChange: (evt) => setField("email", evt.target.value), type: "email" })] }),
                      ],
                    }),
                  ],
                }),
                step === 1 && jsxRuntime.jsxs("div", {
                  className: "space-y-3",
                  children: [
                    selfieUrl
                      ? jsxRuntime.jsx("img", { src: selfieUrl, alt: "Selfie", className: "mx-auto w-48 h-48 rounded-xl object-cover border-2 border-success" })
                      : jsxRuntime.jsx("div", { className: "mx-auto w-48 h-48 rounded-xl border-2 border-dashed border-border bg-muted/30 flex items-center justify-center text-xs text-muted-foreground px-4 text-center", children: "Toque para tirar foto ou enviar imagem" }),
                    jsxRuntime.jsxs("div", {
                      className: "flex justify-center gap-2",
                      children: [
                        jsxRuntime.jsx(Button, {
                          variant: "outline",
                          onClick: () => fileRef.current && fileRef.current.click(),
                          children: selfieUrl ? "Trocar Foto" : "Selecionar Foto",
                        }),
                      ],
                    }),
                    jsxRuntime.jsx("input", {
                      ref: fileRef,
                      type: "file",
                      accept: "image/*",
                      capture: "user",
                      className: "hidden",
                      onChange: onSelfieChange,
                    }),
                  ],
                }),
                step === 2 && jsxRuntime.jsxs("div", {
                  className: "space-y-4",
                  children: [
                    jsxRuntime.jsxs("div", {
                      className: "flex items-center gap-2",
                      children: [
                        jsxRuntime.jsx(Checkbox, {
                          checked: form.possuiVeiculo,
                          onCheckedChange: (value) => setField("possuiVeiculo", !!value),
                          id: "veiculo-publico",
                        }),
                        jsxRuntime.jsx(Label, { htmlFor: "veiculo-publico", children: "Vou com veiculo" }),
                      ],
                    }),
                    form.possuiVeiculo && jsxRuntime.jsxs("div", {
                      className: "grid grid-cols-1 sm:grid-cols-2 gap-4",
                      children: [
                        jsxRuntime.jsxs("div", { className: "space-y-2", children: [jsxRuntime.jsx(Label, { children: "Placa *" }), jsxRuntime.jsx(Input, { value: form.placa, onChange: (evt) => setField("placa", evt.target.value), placeholder: "ABC-1D23" })] }),
                        jsxRuntime.jsxs("div", {
                          className: "space-y-2",
                          children: [
                            jsxRuntime.jsx(Label, { children: "Tipo" }),
                            jsxRuntime.jsxs(Select, {
                              value: form.tipoVeiculo,
                              onValueChange: (value) => setField("tipoVeiculo", value),
                              children: [
                                jsxRuntime.jsx(SelectTrigger, { children: jsxRuntime.jsx(SelectValue, { placeholder: "Selecione" }) }),
                                jsxRuntime.jsxs(SelectContent, { children: [jsxRuntime.jsx(SelectItem, { value: "carro", children: "Carro" }), jsxRuntime.jsx(SelectItem, { value: "moto", children: "Moto" }), jsxRuntime.jsx(SelectItem, { value: "utilitario", children: "Utilitario" })] }),
                              ],
                            }),
                          ],
                        }),
                        jsxRuntime.jsxs("div", { className: "space-y-2", children: [jsxRuntime.jsx(Label, { children: "Modelo" }), jsxRuntime.jsx(Input, { value: form.modelo, onChange: (evt) => setField("modelo", evt.target.value) })] }),
                        jsxRuntime.jsxs("div", { className: "space-y-2", children: [jsxRuntime.jsx(Label, { children: "Cor" }), jsxRuntime.jsx(Input, { value: form.cor, onChange: (evt) => setField("cor", evt.target.value) })] }),
                      ],
                    }),
                    jsxRuntime.jsxs("div", {
                      className: "space-y-2",
                      children: [
                        jsxRuntime.jsx(Label, { children: "Observacoes" }),
                        jsxRuntime.jsx(Textarea, { value: form.obs, onChange: (evt) => setField("obs", evt.target.value), rows: 2 }),
                      ],
                    }),
                  ],
                }),
                step === 3 && jsxRuntime.jsxs("div", {
                  className: "space-y-3",
                  children: [
                    jsxRuntime.jsx("p", { className: "text-sm text-muted-foreground", children: "Confira os dados antes de enviar." }),
                    jsxRuntime.jsxs("div", {
                      className: "grid grid-cols-2 gap-x-6 gap-y-2 text-sm",
                      children: [
                        jsxRuntime.jsx("span", { className: "text-muted-foreground", children: "Nome:" }),
                        jsxRuntime.jsx("span", { className: "font-medium", children: form.nome || "-" }),
                        jsxRuntime.jsx("span", { className: "text-muted-foreground", children: "Documento:" }),
                        jsxRuntime.jsx("span", { className: "font-medium", children: form.documento || "-" }),
                        jsxRuntime.jsx("span", { className: "text-muted-foreground", children: "Empresa:" }),
                        jsxRuntime.jsx("span", { className: "font-medium", children: form.empresa || "-" }),
                        jsxRuntime.jsx("span", { className: "text-muted-foreground", children: "Telefone:" }),
                        jsxRuntime.jsx("span", { className: "font-medium", children: form.telefone || "-" }),
                        jsxRuntime.jsx("span", { className: "text-muted-foreground", children: "Selfie:" }),
                        jsxRuntime.jsx("span", { className: "font-medium", children: selfieUrl ? "Enviada" : "Nao enviada" }),
                      ],
                    }),
                  ],
                }),
                jsxRuntime.jsxs("div", {
                  className: "flex justify-between pt-4 border-t border-border",
                  children: [
                    jsxRuntime.jsxs(Button, {
                      variant: "outline",
                      onClick: () => step > 0 && setStep(step - 1),
                      disabled: step === 0 || sending,
                      children: [jsxRuntime.jsx(ArrowLeft, { className: "mr-1.5 h-4 w-4" }), " Voltar"],
                    }),
                    step < 3
                      ? jsxRuntime.jsx(Button, {
                          onClick: () => setStep(step + 1),
                          disabled: sending,
                          children: "Proximo",
                        })
                      : jsxRuntime.jsx(Button, {
                          onClick: submit,
                          disabled: sending,
                          children: sending ? "Enviando..." : "Enviar Cadastro",
                        }),
                  ],
                }),
              ],
            }),
          }),
        ],
      }),
    ],
  });
};

export { VisitantePublicoPage as default };
