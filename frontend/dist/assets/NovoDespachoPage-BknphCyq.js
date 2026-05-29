import { h as k, r, a_ as N, j as s, B as m, E as z, T as $ } from "./index-Cw1PFMX8.js";
import { I as u } from "./input-CnWhQnjH.js";
import { L as c } from "./label-CRMrAwdj.js";
import { T as _ } from "./textarea-Ch7hFFqp.js";
import { S, a as b, b as D, c as E, d as R } from "./select-BwD7H_FL.js";
import { S as p } from "./SectionCard-CQqIWUnE.js";
import { i as B, D as zs, E as ks, F as Js } from "./operacional-4Pj5wcXo.js";
import { U as K } from "./user-5S6ImT4k.js";
import { T as U } from "./trash-2-tWujf5iP.js";
import { P as q } from "./plus-CQ4h-jDM.js";
import "./index-BdQq_4o_.js";
import "./index-lgCT-RbZ.js";
import "./index-CM7B8zZL.js";
import "./check-BVac9zGz.js";

const VEHICLE_STATUS_RECOMMENDED = new Set(["DISPONIVEL", "PARADA_PROGRAMADA"]);

function normalizePlate(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

const cs = () => {
  const g = k();
  const [veiculoId, setVeiculoId] = r.useState("");
  const [motoristaMatricula, setMotoristaMatricula] = r.useState("");
  const [origem, setOrigem] = r.useState("");
  const [destino, setDestino] = r.useState("");
  const [observacao, setObservacao] = r.useState("");
  const [notas, setNotas] = r.useState([{ numero: "", descricao: "" }]);

  const [veiculosBase, setVeiculosBase] = r.useState([]);
  const [veiculosBusca, setVeiculosBusca] = r.useState([]);
  const [placaBusca, setPlacaBusca] = r.useState("");
  const [motoristas, setMotoristas] = r.useState([]);
  const [pesquisandoVeiculo, setPesquisandoVeiculo] = r.useState(false);
  const [salvando, setSalvando] = r.useState(false);

  r.useEffect(() => {
    B()
      .then((items) => setVeiculosBase(Array.isArray(items) ? items : []))
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Falha ao carregar veiculos.";
        N.error(`Erro ao carregar dados: ${message}`);
      });

    ks({ limit: 120 })
      .then((items) => setMotoristas(Array.isArray(items) ? items : []))
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Falha ao carregar motoristas.";
        N.error(`Erro ao carregar motoristas: ${message}`);
      });
  }, []);

  r.useEffect(() => {
    const query = placaBusca.trim();
    if (!query) {
      setVeiculosBusca([]);
      setVeiculoId("");
      return;
    }

    setPesquisandoVeiculo(true);
    const timer = setTimeout(() => {
      zs({ q: query, limit: 40 })
        .then((items) => {
          const encontrados = Array.isArray(items) ? items : [];
          setVeiculosBusca(encontrados);

          const normalizedQuery = normalizePlate(query);
          const exact = encontrados.find((item) => normalizePlate(item?.placa) === normalizedQuery);
          setVeiculoId(exact ? exact.id : "");
        })
        .catch((err) => {
          const message = err instanceof Error ? err.message : "Falha ao pesquisar placa.";
          N.error(message);
          setVeiculosBusca([]);
          setVeiculoId("");
        })
        .finally(() => setPesquisandoVeiculo(false));
    }, 220);

    return () => clearTimeout(timer);
  }, [placaBusca]);

  const veiculosDisponiveis = r.useMemo(() => {
    const origem = veiculosBusca.length > 0 ? veiculosBusca : veiculosBase;
    return origem;
  }, [veiculosBase, veiculosBusca]);

  const veiculoSelecionado = r.useMemo(() => {
    if (!veiculoId) return null;
    return (
      veiculosBusca.find((item) => item.id === veiculoId) ||
      veiculosBase.find((item) => item.id === veiculoId) ||
      null
    );
  }, [veiculoId, veiculosBase, veiculosBusca]);

  const motoristaSelecionado = r.useMemo(
    () => motoristas.find((item) => String(item?.matricula ?? "") === String(motoristaMatricula)) || null,
    [motoristaMatricula, motoristas],
  );

  const notasValidas = r.useMemo(() => notas.filter((item) => item.numero.trim()), [notas]);

  const adicionarNota = () => setNotas((prev) => [...prev, { numero: "", descricao: "" }]);
  const removerNota = (index) => setNotas((prev) => prev.filter((_, i) => i !== index));
  const atualizarNota = (index, field, value) =>
    setNotas((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));

  const handlePlacaInput = (value) => {
    setPlacaBusca(value);
    const normalized = normalizePlate(value);
    if (!normalized) {
      setVeiculoId("");
      return;
    }

    const fromCurrent = veiculosDisponiveis.find((item) => normalizePlate(item?.placa) === normalized);
    if (fromCurrent) {
      setVeiculoId(fromCurrent.id);
    }
  };

  const registrarDespacho = async () => {
    if (!veiculoId || !motoristaMatricula || !origem.trim() || !destino.trim() || notasValidas.length === 0) {
      N.error("Preencha os campos obrigatorios e adicione pelo menos uma nota fiscal.");
      return;
    }

    if (!motoristaSelecionado) {
      N.error("Selecione um motorista valido.");
      return;
    }

    setSalvando(true);
    try {
      await Js({
        veiculoId,
        motorista: motoristaSelecionado.nome,
        motoristaMatricula: motoristaSelecionado.matricula,
        motoristaCodFilial: motoristaSelecionado.codFilial,
        origem: origem.trim(),
        destino: destino.trim(),
        observacao: observacao.trim(),
        notasFiscais: notasValidas,
      });

      N.success(
        `Despacho registrado - ${(veiculoSelecionado == null ? void 0 : veiculoSelecionado.placa) || "veiculo"} com ${
          notasValidas.length
        } NF(s), ${origem} -> ${destino}`,
      );
      g("/frota");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao registrar despacho.";
      N.error(message);
    } finally {
      setSalvando(false);
    }
  };

  return s.jsxs("div", {
    className: "space-y-6 animate-fade-in max-w-3xl mx-auto",
    children: [
      s.jsxs("div", {
        className: "flex items-center gap-3",
        children: [
          s.jsx(m, {
            variant: "ghost",
            size: "icon",
            onClick: () => g("/frota"),
            children: s.jsx(z, { className: "h-5 w-5" }),
          }),
          s.jsxs("div", {
            children: [
              s.jsx("h1", { className: "text-2xl font-bold text-foreground", children: "Registrar Despacho" }),
              s.jsx("p", {
                className: "text-sm text-muted-foreground",
                children: "Informe veiculo, motorista, notas fiscais, origem e destino",
              }),
            ],
          }),
        ],
      }),

      s.jsxs(p, {
        title: "Veiculo e Motorista",
        children: [
          s.jsxs("div", {
            className: "grid grid-cols-1 md:grid-cols-2 gap-4",
            children: [
              s.jsxs("div", {
                className: "space-y-1.5",
                children: [
                  s.jsx(c, { children: "Veiculo *" }),
                  s.jsx(u, {
                    value: placaBusca,
                    onChange: (event) => handlePlacaInput(event.target.value),
                    placeholder: "Digite a placa (ex: ABC1D23)",
                    autoComplete: "off",
                    list: "despacho-veiculos-list",
                  }),
                  s.jsx("datalist", {
                    id: "despacho-veiculos-list",
                    children: veiculosDisponiveis.slice(0, 60).map((item) =>
                      s.jsx(
                        "option",
                        {
                          value: item.placa || "",
                          label: `${item.placa || "-"} - ${item.modelo || "Sem modelo"} (${item.status || "SEM_STATUS"})`,
                        },
                        item.id,
                      ),
                    ),
                  }),
                  pesquisandoVeiculo &&
                    s.jsx("p", {
                      className: "text-xs text-muted-foreground",
                      children: "Pesquisando placa na PCVEICUL...",
                    }),
                  placaBusca &&
                    !veiculoSelecionado &&
                    !pesquisandoVeiculo &&
                    s.jsx("p", {
                      className: "text-xs text-amber-600",
                      children: "Placa nao localizada ou indisponivel para despacho.",
                    }),
                  veiculoSelecionado &&
                    !VEHICLE_STATUS_RECOMMENDED.has(String(veiculoSelecionado.status ?? "").toUpperCase()) &&
                    s.jsx("p", {
                      className: "text-xs text-amber-600",
                      children: "Atencao: veiculo em status nao recomendado para novo despacho.",
                    }),
                ],
              }),

              s.jsxs("div", {
                className: "space-y-1.5",
                children: [
                  s.jsx(c, { children: "Motorista *" }),
                  s.jsxs(S, {
                    value: motoristaMatricula,
                    onValueChange: setMotoristaMatricula,
                    children: [
                      s.jsx(b, { children: s.jsx(D, { placeholder: "Selecione o motorista" }) }),
                      s.jsx(E, {
                        children: motoristas.map((item, index) =>
                          s.jsxs(
                            R,
                            {
                              value: String(item?.matricula ?? ""),
                              children: [String(item?.matricula ?? "-"), " - ", item?.nome || "Sem nome"],
                            },
                            `${String(item?.matricula ?? "SEM_MATRICULA")}-${index}`,
                          ),
                        ),
                      }),
                    ],
                  }),
                  s.jsx("p", {
                    className: "text-xs text-muted-foreground",
                    children: `${motoristas.length} motoristas ativos da PCEMPR`,
                  }),
                ],
              }),
            ],
          }),

          veiculoSelecionado &&
            s.jsxs("div", {
              className: "mt-3 rounded-md border bg-muted/30 p-3 text-sm space-y-1",
              children: [
                s.jsxs("div", {
                  className: "flex items-center gap-2",
                  children: [
                    s.jsx(K, { className: "h-3.5 w-3.5 text-muted-foreground" }),
                    s.jsx("span", { className: "text-muted-foreground", children: "Responsavel atual:" }),
                    s.jsx("span", {
                      className: "font-medium text-foreground",
                      children: veiculoSelecionado.motoristaResponsavel || "Nao informado",
                    }),
                  ],
                }),
                s.jsxs("p", {
                  className: "text-xs text-muted-foreground",
                  children: [
                    "Km: ",
                    Number(veiculoSelecionado.quilometragem || 0).toLocaleString("pt-BR"),
                    " - Setor: ",
                    veiculoSelecionado.setor || "-",
                    " - Status: ",
                    veiculoSelecionado.status || "-",
                  ],
                }),
              ],
            }),
        ],
      }),

      s.jsx(p, {
        title: "Rota",
        children: s.jsxs("div", {
          className: "grid grid-cols-1 md:grid-cols-2 gap-4",
          children: [
            s.jsxs("div", {
              className: "space-y-1.5",
              children: [
                s.jsx(c, { children: "Origem *" }),
                s.jsx(u, {
                  value: origem,
                  onChange: (event) => setOrigem(event.target.value),
                  placeholder: "Ex: Fabrica MAO, CD Manaus...",
                }),
              ],
            }),
            s.jsxs("div", {
              className: "space-y-1.5",
              children: [
                s.jsx(c, { children: "Destino *" }),
                s.jsx(u, {
                  value: destino,
                  onChange: (event) => setDestino(event.target.value),
                  placeholder: "Ex: Cliente Magazine Luiza - Centro",
                }),
              ],
            }),
          ],
        }),
      }),

      s.jsx(p, {
        title: `Notas Fiscais (${notasValidas.length})`,
        children: s.jsxs("div", {
          className: "space-y-3",
          children: [
            notas.map((item, index) =>
              s.jsxs(
                "div",
                {
                  className: "flex items-start gap-3",
                  children: [
                    s.jsxs("div", {
                      className: "flex-1 grid grid-cols-1 md:grid-cols-2 gap-3",
                      children: [
                        s.jsxs("div", {
                          className: "space-y-1",
                          children: [
                            s.jsx(c, { className: "text-xs", children: "N da NF *" }),
                            s.jsx(u, {
                              value: item.numero,
                              onChange: (event) => atualizarNota(index, "numero", event.target.value),
                              placeholder: "Ex: 112500",
                            }),
                          ],
                        }),
                        s.jsxs("div", {
                          className: "space-y-1",
                          children: [
                            s.jsx(c, { className: "text-xs", children: "Descricao / Cliente" }),
                            s.jsx(u, {
                              value: item.descricao,
                              onChange: (event) => atualizarNota(index, "descricao", event.target.value),
                              placeholder: "Ex: Colchoes King - Loja Centro",
                            }),
                          ],
                        }),
                      ],
                    }),
                    notas.length > 1 &&
                      s.jsx(m, {
                        variant: "ghost",
                        size: "icon",
                        className: "mt-5 text-destructive",
                        onClick: () => removerNota(index),
                        children: s.jsx(U, { className: "h-4 w-4" }),
                      }),
                  ],
                },
                index,
              ),
            ),
            s.jsxs(m, {
              variant: "outline",
              size: "sm",
              onClick: adicionarNota,
              className: "gap-1.5",
              children: [s.jsx(q, { className: "h-3.5 w-3.5" }), " Adicionar NF"],
            }),
          ],
        }),
      }),

      s.jsx(p, {
        title: "Observacao",
        children: s.jsx(_, {
          value: observacao,
          onChange: (event) => setObservacao(event.target.value),
          placeholder: "Informacoes adicionais sobre o despacho...",
          rows: 3,
        }),
      }),

      veiculoId &&
        motoristaSelecionado &&
        origem.trim() &&
        destino.trim() &&
        notasValidas.length > 0 &&
        s.jsxs("div", {
          className: "rounded-lg border-2 border-primary/30 bg-primary/5 p-4 space-y-2",
          children: [
            s.jsx("h3", { className: "text-sm font-semibold text-foreground", children: "Resumo do Despacho" }),
            s.jsxs("div", {
              className: "text-sm text-foreground/80 space-y-1",
              children: [
                s.jsxs("p", {
                  children: [
                    s.jsx("strong", { children: "Veiculo:" }),
                    " ",
                    (veiculoSelecionado == null ? void 0 : veiculoSelecionado.placa) || "-",
                    " - ",
                    (veiculoSelecionado == null ? void 0 : veiculoSelecionado.modelo) || "-",
                  ],
                }),
                s.jsxs("p", {
                  children: [s.jsx("strong", { children: "Motorista:" }), " ", motoristaSelecionado.nome || "-"],
                }),
                s.jsxs("p", {
                  children: [s.jsx("strong", { children: "Rota:" }), " ", origem, " -> ", destino],
                }),
                s.jsxs("p", {
                  children: [s.jsx("strong", { children: "Notas Fiscais:" }), " ", notasValidas.map((item) => item.numero).join(", ")],
                }),
              ],
            }),
            s.jsxs("p", {
              className: "text-xs text-muted-foreground mt-1",
              children: ["Status do veiculo sera alterado para ", s.jsx("strong", { children: "EM_DESLOCAMENTO" }), " (Em Rota)"],
            }),
          ],
        }),

      s.jsxs("div", {
        className: "flex justify-end gap-3 pb-8",
        children: [
          s.jsx(m, { variant: "outline", onClick: () => g("/frota"), children: "Cancelar" }),
          s.jsxs(m, {
            onClick: registrarDespacho,
            className: "gap-2",
            disabled: salvando,
            children: [s.jsx($, { className: "h-4 w-4" }), salvando ? " Registrando..." : " Registrar Despacho"],
          }),
        ],
      }),
    ],
  });
};

export { cs as default };
