import { w as requestApi, r as React, h as useNavigate, i as useToast, j as jsxRuntime, D as Building2, B as Button, y as setSession, z as resolveHomeRoute } from "./index-Cw1PFMX8.js";
import { I as Input } from "./input-CnWhQnjH.js";
import { L as Label } from "./label-CRMrAwdj.js";

async function authenticate(usuario, senha) {
  return await requestApi("/auth/login", { usuario, senha });
}

const LoginPage = () => {
  const [usuario, setUsuario] = React.useState("");
  const [senha, setSenha] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;

    setLoading(true);

    let authPayload = null;
    try {
      authPayload = await authenticate(usuario, senha);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha de autenticacao.";
      toast({
        title: "Login invalido",
        description: message,
        variant: "destructive"
      });
      setLoading(false);
      return;
    }

    try {
      setSession({ token: authPayload.token, user: authPayload.user });
      let destination = "/";
      try {
        destination = resolveHomeRoute(authPayload?.user?.perfil) || "/";
      } catch {
        destination = "/";
      }
      navigate(destination);
    } catch {
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  return jsxRuntime.jsx("div", {
    className: "min-h-screen flex items-center justify-center bg-sidebar p-4",
    children: jsxRuntime.jsxs("div", {
      className: "w-full max-w-sm",
      children: [
        jsxRuntime.jsxs("div", {
          className: "text-center mb-8",
          children: [
            jsxRuntime.jsx("div", {
              className: "flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mx-auto mb-4",
              children: jsxRuntime.jsx(Building2, { className: "h-8 w-8 text-primary" })
            }),
            jsxRuntime.jsx("h1", {
              className: "text-xl font-bold text-sidebar-primary",
              children: "Torre de Controle"
            }),
            jsxRuntime.jsxs("p", {
              className: "text-xs text-sidebar-foreground/50 mt-1 leading-relaxed",
              children: [
                "SAC - Qualidade - Inventario - Assistencia Tecnica",
                jsxRuntime.jsx("br", {}),
                "Acessos - Portaria - Controle de Patio e Frota"
              ]
            })
          ]
        }),
        jsxRuntime.jsxs("form", {
          onSubmit: handleSubmit,
          className: "space-y-4 bg-card rounded-xl p-6 shadow-lg border border-border",
          children: [
            jsxRuntime.jsxs("div", {
              className: "space-y-2",
              children: [
                jsxRuntime.jsx(Label, { htmlFor: "usuario", children: "Usuario" }),
                jsxRuntime.jsx(Input, {
                  id: "usuario",
                  type: "text",
                  autoComplete: "username",
                  placeholder: "NOME.GUERRA",
                  value: usuario,
                  onChange: (event) => setUsuario(event.target.value.toUpperCase()),
                  required: true
                })
              ]
            }),
            jsxRuntime.jsxs("div", {
              className: "space-y-2",
              children: [
                jsxRuntime.jsx(Label, { htmlFor: "password", children: "Senha" }),
                jsxRuntime.jsx(Input, {
                  id: "password",
                  type: "password",
                  autoComplete: "current-password",
                  placeholder: "********",
                  value: senha,
                  onChange: (event) => setSenha(event.target.value.toUpperCase()),
                  required: true
                })
              ]
            }),
            jsxRuntime.jsx(Button, {
              type: "submit",
              className: "w-full",
              disabled: loading,
              children: loading ? "Entrando..." : "Entrar"
            }),
            jsxRuntime.jsx("p", {
              className: "text-center text-xs text-muted-foreground",
              children: "Acesso seguro - autenticacao corporativa"
            })
          ]
        })
      ]
    })
  });
};

export { LoginPage as default };
