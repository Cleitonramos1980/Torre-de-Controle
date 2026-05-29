import {
  i as useToast,
  bv as useQueryClient,
  r as React,
  B as Button,
  J as Card,
  K as CardHeader,
  M as CardTitle,
  N as CardContent,
} from "./index-Cw1PFMX8.js";
import { u as useQuery, r as queryKeys } from "./queryKeys-DTadpFID.js";
import { u as useMutation } from "./useMutation-BkrZfWtA.js";
import {
  Z as getConfiguracoes,
  _ as saveConfiguracoes,
  listFilialEstabelecimentos as listFilialEstabelecimentosApi,
  createFilialEstabelecimento as createFilialEstabelecimentoApi,
  ativarFilialEstabelecimento as ativarFilialEstabelecimentoApi,
  inativarFilialEstabelecimento as inativarFilialEstabelecimentoApi,
  importFilialEstabelecimentos as importFilialEstabelecimentosApi,
} from "./recebiveisCartao-B2POAfEy.js";
import { T as Tabs, a as TabsList, b as TabsTrigger, c as TabsContent } from "./tabs-Db0aGz2s.js";
import { I as Input } from "./input-CnWhQnjH.js";
import { S as Switch } from "./switch-zatCesyM.js";
import { P as Plus } from "./plus-CQ4h-jDM.js";
import { S as Save } from "./save-BEDBI_Gf.js";
import { U as Upload } from "./upload-Cjz052ay.js";

const CADASTROS_QUERY_KEY = [...queryKeys.configuracoes(), "filial-estabelecimentos"];

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function withDefaultConfig(value) {
  const data = value && typeof value === "object" ? value : {};
  return {
    empresas: ensureArray(data.empresas),
    filiais: ensureArray(data.filiais),
    operadoras: ensureArray(data.operadoras),
    taxas: ensureArray(data.taxas),
  };
}

function cloneConfig(value) {
  return JSON.parse(JSON.stringify(withDefaultConfig(value)));
}

function toMessage(error, fallback) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function normalizeEstablishmentCode(value) {
  return String(value ?? "")
    .replace(/\D+/g, "")
    .trim();
}

function newConfigRow(section) {
  const suffix = String(Date.now()).slice(-6);
  if (section === "empresas") {
    return { id: `EMP-${suffix}`, nome: "", cnpj: "", ativa: true };
  }
  if (section === "filiais") {
    return { id: `FIL-${suffix}`, empresaId: "", codigo: "", nome: "", ativa: true };
  }
  if (section === "operadoras") {
    return { id: `OPR-${suffix}`, nome: "", codigo: "", ativa: true };
  }
  return { id: `TX-${suffix}`, operadoraId: "", modalidade: "PADRAO", percentual: 0 };
}

const initialNovoCadastro = {
  filial_codigo: "",
  regional: "",
  nome_filial: "",
  codigo_estabelecimento: "",
  nome_estabelecimento: "",
  nome_maquininha: "",
  numero_maquininha: "",
  cnpj_filial: "",
  situacao: "",
  ativo: true,
};

const ee = () => {
  const h = React.createElement;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = React.useState("cadastros");
  const [config, setConfig] = React.useState(withDefaultConfig(null));
  const [mostrarInativos, setMostrarInativos] = React.useState(true);
  const [maquininhaFile, setMaquininhaFile] = React.useState(null);
  const [cnpjFile, setCnpjFile] = React.useState(null);
  const [novoCadastro, setNovoCadastro] = React.useState(initialNovoCadastro);

  const configQuery = useQuery({
    queryKey: queryKeys.configuracoes(),
    queryFn: getConfiguracoes,
  });

  React.useEffect(() => {
    if (configQuery.data) {
      setConfig(cloneConfig(configQuery.data));
    }
  }, [configQuery.data]);

  const cadastrosKey = React.useMemo(
    () => [...CADASTROS_QUERY_KEY, mostrarInativos ? "todos" : "ativos"],
    [mostrarInativos],
  );

  const cadastrosQuery = useQuery({
    queryKey: cadastrosKey,
    queryFn: () =>
      listFilialEstabelecimentosApi({
        adquirente: "REDE",
        ativo: mostrarInativos ? undefined : true,
      }),
  });

  const saveConfigMutation = useMutation({
    mutationFn: (payload) => saveConfiguracoes(payload),
    onSuccess: () => {
      toast({ title: "Configuracoes salvas" });
      queryClient.invalidateQueries({ queryKey: queryKeys.configuracoes() });
    },
    onError: (error) => {
      toast({
        title: "Erro ao salvar configuracoes",
        description: toMessage(error, "Nao foi possivel salvar."),
        variant: "destructive",
      });
    },
  });

  const importMutation = useMutation({
    mutationFn: ({ maquininha, cnpj }) => importFilialEstabelecimentosApi(maquininha, cnpj),
    onSuccess: () => {
      toast({ title: "Importacao concluida", description: "Vinculos atualizados com sucesso." });
      queryClient.invalidateQueries({ queryKey: CADASTROS_QUERY_KEY });
      setMaquininhaFile(null);
      setCnpjFile(null);
    },
    onError: (error) => {
      toast({
        title: "Erro na importacao",
        description: toMessage(error, "Falha ao importar planilha."),
        variant: "destructive",
      });
    },
  });

  const createCadastroMutation = useMutation({
    mutationFn: (payload) => createFilialEstabelecimentoApi(payload),
    onSuccess: () => {
      toast({ title: "Cadastro salvo" });
      queryClient.invalidateQueries({ queryKey: CADASTROS_QUERY_KEY });
      setNovoCadastro(initialNovoCadastro);
    },
    onError: (error) => {
      toast({
        title: "Erro ao salvar cadastro",
        description: toMessage(error, "Nao foi possivel criar o vinculo."),
        variant: "destructive",
      });
    },
  });

  const toggleCadastroMutation = useMutation({
    mutationFn: ({ id, ativo }) =>
      ativo ? ativarFilialEstabelecimentoApi(id) : inativarFilialEstabelecimentoApi(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CADASTROS_QUERY_KEY });
    },
    onError: (error) => {
      toast({
        title: "Erro ao atualizar cadastro",
        description: toMessage(error, "Nao foi possivel atualizar o status."),
        variant: "destructive",
      });
    },
  });

  const updateConfigField = (section, index, key, value) => {
    setConfig((current) => {
      const next = cloneConfig(current);
      if (!next[section] || !next[section][index]) return current;
      next[section][index] = { ...next[section][index], [key]: value };
      return next;
    });
  };

  const addConfigRow = (section) => {
    setConfig((current) => {
      const next = cloneConfig(current);
      next[section] = [...ensureArray(next[section]), newConfigRow(section)];
      return next;
    });
  };

  const removeConfigRow = (section, index) => {
    setConfig((current) => {
      const next = cloneConfig(current);
      next[section] = ensureArray(next[section]).filter((_, i) => i !== index);
      return next;
    });
  };

  const onSalvarConfiguracoes = () => {
    saveConfigMutation.mutate(config);
  };

  const onImportarCadastros = () => {
    if (!maquininhaFile) {
      toast({
        title: "Arquivo obrigatorio",
        description: "Selecione a planilha de maquininhas.",
        variant: "destructive",
      });
      return;
    }
    importMutation.mutate({ maquininha: maquininhaFile, cnpj: cnpjFile });
  };

  const onSalvarNovoCadastro = () => {
    const payload = {
      adquirente: "REDE",
      filial_codigo: String(novoCadastro.filial_codigo ?? "").trim(),
      regional: String(novoCadastro.regional ?? "").trim(),
      nome_filial: String(novoCadastro.nome_filial ?? "").trim(),
      codigo_estabelecimento: normalizeEstablishmentCode(novoCadastro.codigo_estabelecimento),
      nome_estabelecimento: String(novoCadastro.nome_estabelecimento ?? "").trim(),
      nome_maquininha: String(novoCadastro.nome_maquininha ?? "").trim(),
      numero_maquininha: String(novoCadastro.numero_maquininha ?? "").trim(),
      cnpj_filial: String(novoCadastro.cnpj_filial ?? "").trim(),
      situacao: String(novoCadastro.situacao ?? "").trim(),
      ativo: Boolean(novoCadastro.ativo),
    };
    if (!payload.filial_codigo || !payload.codigo_estabelecimento) {
      toast({
        title: "Campos obrigatorios",
        description: "Preencha filial e estabelecimento.",
        variant: "destructive",
      });
      return;
    }
    createCadastroMutation.mutate(payload);
  };

  const renderTextCell = (value) =>
    h("td", { className: "p-2 text-sm text-foreground" }, value == null || value === "" ? "-" : String(value));

  const renderConfigActions = (section, index) =>
    h(
      "td",
      { className: "p-2 text-right" },
      h(
        Button,
        {
          variant: "ghost",
          size: "sm",
          onClick: () => removeConfigRow(section, index),
        },
        "Remover",
      ),
    );

  const empresas = ensureArray(config.empresas);
  const filiais = ensureArray(config.filiais);
  const operadoras = ensureArray(config.operadoras);
  const taxas = ensureArray(config.taxas);
  const cadastros = ensureArray(cadastrosQuery.data?.rows);
  const ambiguidades = ensureArray(cadastrosQuery.data?.ambiguidades);

  return h("div", { className: "space-y-6 animate-fade-in" }, [
    h("div", { key: "header", className: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" }, [
      h("div", { key: "titles" }, [
        h("h1", { key: "h1", className: "text-2xl font-bold text-foreground" }, "Configuracoes"),
        h(
          "p",
          { key: "p", className: "mt-1 text-sm text-muted-foreground" },
          "Empresas, filiais, operadoras, taxas e cadastros de estabelecimento REDE.",
        ),
      ]),
      h(
        Button,
        {
          key: "save-btn",
          onClick: onSalvarConfiguracoes,
          disabled: saveConfigMutation.isPending,
        },
        [
          h(Save, { key: "save-icon", className: "mr-1 h-4 w-4" }),
          "Salvar configuracoes",
        ],
      ),
    ]),

    h(
      Tabs,
      { key: "tabs", value: tab, onValueChange: setTab, className: "space-y-4" },
      [
        h(
          TabsList,
          { key: "tabs-list", className: "grid w-full grid-cols-2 gap-2 sm:grid-cols-5 h-auto p-1" },
          [
            h(TabsTrigger, { key: "tab-empresas", value: "empresas" }, "Empresas"),
            h(TabsTrigger, { key: "tab-filiais", value: "filiais" }, "Filiais"),
            h(TabsTrigger, { key: "tab-operadoras", value: "operadoras" }, "Operadoras"),
            h(TabsTrigger, { key: "tab-taxas", value: "taxas" }, "Taxas"),
            h(TabsTrigger, { key: "tab-cadastros", value: "cadastros" }, "Cadastros"),
          ],
        ),

        h(TabsContent, { key: "empresas-content", value: "empresas" }, [
          h(Card, { key: "empresas-card", className: "border-border/70" }, [
            h(CardHeader, { key: "empresas-header" }, h(CardTitle, { className: "text-sm" }, "Empresas")),
            h(CardContent, { key: "empresas-body", className: "space-y-3" }, [
              h("div", { key: "empresas-actions", className: "flex justify-end" }, [
                h(
                  Button,
                  { key: "add-empresa", variant: "outline", size: "sm", onClick: () => addConfigRow("empresas") },
                  [h(Plus, { key: "plus", className: "mr-1 h-4 w-4" }), "Adicionar empresa"],
                ),
              ]),
              h("div", { key: "empresas-table-wrap", className: "overflow-x-auto" }, [
                h("table", { key: "empresas-table", className: "w-full text-sm" }, [
                  h("thead", { key: "head" }, [
                    h("tr", { key: "trh", className: "border-b border-border" }, [
                      h("th", { key: "h1", className: "p-2 text-left" }, "ID"),
                      h("th", { key: "h2", className: "p-2 text-left" }, "Nome"),
                      h("th", { key: "h3", className: "p-2 text-left" }, "CNPJ"),
                      h("th", { key: "h4", className: "p-2 text-center" }, "Ativa"),
                      h("th", { key: "h5", className: "p-2 text-right" }, "Acoes"),
                    ]),
                  ]),
                  h(
                    "tbody",
                    { key: "body" },
                    empresas.length === 0
                      ? [
                          h("tr", { key: "empty" }, [
                            h(
                              "td",
                              { colSpan: 5, className: "p-6 text-center text-muted-foreground" },
                              "Nenhuma empresa cadastrada.",
                            ),
                          ]),
                        ]
                      : empresas.map((row, index) =>
                          h("tr", { key: row.id || `empresa-${index}`, className: "border-b border-border/50" }, [
                            h(
                              "td",
                              { key: "id", className: "p-2" },
                              h(Input, {
                                value: row.id ?? "",
                                onChange: (event) =>
                                  updateConfigField("empresas", index, "id", event.target.value),
                                className: "h-8",
                              }),
                            ),
                            h(
                              "td",
                              { key: "nome", className: "p-2" },
                              h(Input, {
                                value: row.nome ?? "",
                                onChange: (event) =>
                                  updateConfigField("empresas", index, "nome", event.target.value),
                                className: "h-8",
                              }),
                            ),
                            h(
                              "td",
                              { key: "cnpj", className: "p-2" },
                              h(Input, {
                                value: row.cnpj ?? "",
                                onChange: (event) =>
                                  updateConfigField("empresas", index, "cnpj", event.target.value),
                                className: "h-8",
                              }),
                            ),
                            h(
                              "td",
                              { key: "ativa", className: "p-2 text-center" },
                              h(Switch, {
                                checked: Boolean(row.ativa),
                                onCheckedChange: (value) => updateConfigField("empresas", index, "ativa", value),
                              }),
                            ),
                            renderConfigActions("empresas", index),
                          ]),
                        ),
                  ),
                ]),
              ]),
            ]),
          ]),
        ]),

        h(TabsContent, { key: "filiais-content", value: "filiais" }, [
          h(Card, { key: "filiais-card", className: "border-border/70" }, [
            h(CardHeader, { key: "filiais-header" }, h(CardTitle, { className: "text-sm" }, "Filiais")),
            h(CardContent, { key: "filiais-body", className: "space-y-3" }, [
              h("div", { key: "filiais-actions", className: "flex justify-end" }, [
                h(
                  Button,
                  { key: "add-filial", variant: "outline", size: "sm", onClick: () => addConfigRow("filiais") },
                  [h(Plus, { key: "plus", className: "mr-1 h-4 w-4" }), "Adicionar filial"],
                ),
              ]),
              h("div", { key: "filiais-table-wrap", className: "overflow-x-auto" }, [
                h("table", { key: "filiais-table", className: "w-full text-sm" }, [
                  h("thead", { key: "head" }, [
                    h("tr", { key: "trh", className: "border-b border-border" }, [
                      h("th", { key: "h1", className: "p-2 text-left" }, "ID"),
                      h("th", { key: "h2", className: "p-2 text-left" }, "Empresa"),
                      h("th", { key: "h3", className: "p-2 text-left" }, "Codigo"),
                      h("th", { key: "h4", className: "p-2 text-left" }, "Nome"),
                      h("th", { key: "h5", className: "p-2 text-center" }, "Ativa"),
                      h("th", { key: "h6", className: "p-2 text-right" }, "Acoes"),
                    ]),
                  ]),
                  h(
                    "tbody",
                    { key: "body" },
                    filiais.length === 0
                      ? [
                          h("tr", { key: "empty" }, [
                            h(
                              "td",
                              { colSpan: 6, className: "p-6 text-center text-muted-foreground" },
                              "Nenhuma filial cadastrada.",
                            ),
                          ]),
                        ]
                      : filiais.map((row, index) =>
                          h("tr", { key: row.id || `filial-${index}`, className: "border-b border-border/50" }, [
                            h(
                              "td",
                              { key: "id", className: "p-2" },
                              h(Input, {
                                value: row.id ?? "",
                                onChange: (event) =>
                                  updateConfigField("filiais", index, "id", event.target.value),
                                className: "h-8",
                              }),
                            ),
                            h(
                              "td",
                              { key: "empresaId", className: "p-2" },
                              h(Input, {
                                value: row.empresaId ?? "",
                                onChange: (event) =>
                                  updateConfigField("filiais", index, "empresaId", event.target.value),
                                className: "h-8",
                              }),
                            ),
                            h(
                              "td",
                              { key: "codigo", className: "p-2" },
                              h(Input, {
                                value: row.codigo ?? "",
                                onChange: (event) =>
                                  updateConfigField("filiais", index, "codigo", event.target.value),
                                className: "h-8",
                              }),
                            ),
                            h(
                              "td",
                              { key: "nome", className: "p-2" },
                              h(Input, {
                                value: row.nome ?? "",
                                onChange: (event) =>
                                  updateConfigField("filiais", index, "nome", event.target.value),
                                className: "h-8",
                              }),
                            ),
                            h(
                              "td",
                              { key: "ativa", className: "p-2 text-center" },
                              h(Switch, {
                                checked: Boolean(row.ativa),
                                onCheckedChange: (value) => updateConfigField("filiais", index, "ativa", value),
                              }),
                            ),
                            renderConfigActions("filiais", index),
                          ]),
                        ),
                  ),
                ]),
              ]),
            ]),
          ]),
        ]),

        h(TabsContent, { key: "operadoras-content", value: "operadoras" }, [
          h(Card, { key: "operadoras-card", className: "border-border/70" }, [
            h(CardHeader, { key: "operadoras-header" }, h(CardTitle, { className: "text-sm" }, "Operadoras")),
            h(CardContent, { key: "operadoras-body", className: "space-y-3" }, [
              h("div", { key: "operadoras-actions", className: "flex justify-end" }, [
                h(
                  Button,
                  {
                    key: "add-operadora",
                    variant: "outline",
                    size: "sm",
                    onClick: () => addConfigRow("operadoras"),
                  },
                  [h(Plus, { key: "plus", className: "mr-1 h-4 w-4" }), "Adicionar operadora"],
                ),
              ]),
              h("div", { key: "operadoras-table-wrap", className: "overflow-x-auto" }, [
                h("table", { key: "operadoras-table", className: "w-full text-sm" }, [
                  h("thead", { key: "head" }, [
                    h("tr", { key: "trh", className: "border-b border-border" }, [
                      h("th", { key: "h1", className: "p-2 text-left" }, "ID"),
                      h("th", { key: "h2", className: "p-2 text-left" }, "Nome"),
                      h("th", { key: "h3", className: "p-2 text-left" }, "Codigo"),
                      h("th", { key: "h4", className: "p-2 text-center" }, "Ativa"),
                      h("th", { key: "h5", className: "p-2 text-right" }, "Acoes"),
                    ]),
                  ]),
                  h(
                    "tbody",
                    { key: "body" },
                    operadoras.length === 0
                      ? [
                          h("tr", { key: "empty" }, [
                            h(
                              "td",
                              { colSpan: 5, className: "p-6 text-center text-muted-foreground" },
                              "Nenhuma operadora cadastrada.",
                            ),
                          ]),
                        ]
                      : operadoras.map((row, index) =>
                          h("tr", { key: row.id || `operadora-${index}`, className: "border-b border-border/50" }, [
                            h(
                              "td",
                              { key: "id", className: "p-2" },
                              h(Input, {
                                value: row.id ?? "",
                                onChange: (event) =>
                                  updateConfigField("operadoras", index, "id", event.target.value),
                                className: "h-8",
                              }),
                            ),
                            h(
                              "td",
                              { key: "nome", className: "p-2" },
                              h(Input, {
                                value: row.nome ?? "",
                                onChange: (event) =>
                                  updateConfigField("operadoras", index, "nome", event.target.value),
                                className: "h-8",
                              }),
                            ),
                            h(
                              "td",
                              { key: "codigo", className: "p-2" },
                              h(Input, {
                                value: row.codigo ?? "",
                                onChange: (event) =>
                                  updateConfigField("operadoras", index, "codigo", event.target.value),
                                className: "h-8",
                              }),
                            ),
                            h(
                              "td",
                              { key: "ativa", className: "p-2 text-center" },
                              h(Switch, {
                                checked: Boolean(row.ativa),
                                onCheckedChange: (value) =>
                                  updateConfigField("operadoras", index, "ativa", value),
                              }),
                            ),
                            renderConfigActions("operadoras", index),
                          ]),
                        ),
                  ),
                ]),
              ]),
            ]),
          ]),
        ]),

        h(TabsContent, { key: "taxas-content", value: "taxas" }, [
          h(Card, { key: "taxas-card", className: "border-border/70" }, [
            h(CardHeader, { key: "taxas-header" }, h(CardTitle, { className: "text-sm" }, "Taxas")),
            h(CardContent, { key: "taxas-body", className: "space-y-3" }, [
              h("div", { key: "taxas-actions", className: "flex justify-end" }, [
                h(
                  Button,
                  { key: "add-taxa", variant: "outline", size: "sm", onClick: () => addConfigRow("taxas") },
                  [h(Plus, { key: "plus", className: "mr-1 h-4 w-4" }), "Adicionar taxa"],
                ),
              ]),
              h("div", { key: "taxas-table-wrap", className: "overflow-x-auto" }, [
                h("table", { key: "taxas-table", className: "w-full text-sm" }, [
                  h("thead", { key: "head" }, [
                    h("tr", { key: "trh", className: "border-b border-border" }, [
                      h("th", { key: "h1", className: "p-2 text-left" }, "ID"),
                      h("th", { key: "h2", className: "p-2 text-left" }, "Operadora"),
                      h("th", { key: "h3", className: "p-2 text-left" }, "Modalidade"),
                      h("th", { key: "h4", className: "p-2 text-left" }, "Percentual"),
                      h("th", { key: "h5", className: "p-2 text-right" }, "Acoes"),
                    ]),
                  ]),
                  h(
                    "tbody",
                    { key: "body" },
                    taxas.length === 0
                      ? [
                          h("tr", { key: "empty" }, [
                            h(
                              "td",
                              { colSpan: 5, className: "p-6 text-center text-muted-foreground" },
                              "Nenhuma taxa cadastrada.",
                            ),
                          ]),
                        ]
                      : taxas.map((row, index) =>
                          h("tr", { key: row.id || `taxa-${index}`, className: "border-b border-border/50" }, [
                            h(
                              "td",
                              { key: "id", className: "p-2" },
                              h(Input, {
                                value: row.id ?? "",
                                onChange: (event) =>
                                  updateConfigField("taxas", index, "id", event.target.value),
                                className: "h-8",
                              }),
                            ),
                            h(
                              "td",
                              { key: "operadoraId", className: "p-2" },
                              h(Input, {
                                value: row.operadoraId ?? "",
                                onChange: (event) =>
                                  updateConfigField("taxas", index, "operadoraId", event.target.value),
                                className: "h-8",
                              }),
                            ),
                            h(
                              "td",
                              { key: "modalidade", className: "p-2" },
                              h(Input, {
                                value: row.modalidade ?? "",
                                onChange: (event) =>
                                  updateConfigField("taxas", index, "modalidade", event.target.value),
                                className: "h-8",
                              }),
                            ),
                            h(
                              "td",
                              { key: "percentual", className: "p-2" },
                              h(Input, {
                                type: "number",
                                step: "0.01",
                                value: row.percentual ?? 0,
                                onChange: (event) =>
                                  updateConfigField("taxas", index, "percentual", Number(event.target.value)),
                                className: "h-8",
                              }),
                            ),
                            renderConfigActions("taxas", index),
                          ]),
                        ),
                  ),
                ]),
              ]),
            ]),
          ]),
        ]),

        h(TabsContent, { key: "cadastros-content", value: "cadastros", className: "space-y-4" }, [
          h(Card, { key: "import-card", className: "border-border/70" }, [
            h(
              CardHeader,
              { key: "import-header" },
              h(CardTitle, { className: "text-sm" }, "Importar vinculos de maquininhas"),
            ),
            h(CardContent, { key: "import-body", className: "space-y-4" }, [
              h("div", { key: "files", className: "grid gap-3 md:grid-cols-2" }, [
                h("label", { key: "maq-label", className: "space-y-1 text-sm block" }, [
                  h("span", { key: "maq-text", className: "text-muted-foreground" }, "Planilha MAQUININHA"),
                  h("input", {
                    key: "maq-input",
                    type: "file",
                    accept: ".xlsx,.xls",
                    onChange: (event) => setMaquininhaFile(event.target.files?.[0] ?? null),
                    className: "block w-full text-xs",
                  }),
                ]),
                h("label", { key: "cnpj-label", className: "space-y-1 text-sm block" }, [
                  h("span", { key: "cnpj-text", className: "text-muted-foreground" }, "Planilha CNPJ (opcional)"),
                  h("input", {
                    key: "cnpj-input",
                    type: "file",
                    accept: ".xlsx,.xls",
                    onChange: (event) => setCnpjFile(event.target.files?.[0] ?? null),
                    className: "block w-full text-xs",
                  }),
                ]),
              ]),
              h("div", { key: "import-action", className: "flex justify-end" }, [
                h(
                  Button,
                  {
                    key: "import-button",
                    onClick: onImportarCadastros,
                    disabled: importMutation.isPending,
                  },
                  [h(Upload, { key: "upload-icon", className: "mr-1 h-4 w-4" }), "Importar planilhas"],
                ),
              ]),
              importMutation.data
                ? h("div", { key: "import-result", className: "rounded border border-border/70 p-3 text-xs" }, [
                    h(
                      "p",
                      { key: "r1", className: "text-foreground" },
                      `Importados: ${importMutation.data.totalVinculosImportados ?? 0}`,
                    ),
                    h(
                      "p",
                      { key: "r2", className: "text-muted-foreground" },
                      `Ambiguidades: ${importMutation.data.totalAmbiguidadesAtivas ?? 0}`,
                    ),
                  ])
                : null,
            ]),
          ]),

          h(Card, { key: "novo-card", className: "border-border/70" }, [
            h(CardHeader, { key: "novo-header" }, h(CardTitle, { className: "text-sm" }, "Novo cadastro manual")),
            h(CardContent, { key: "novo-body", className: "space-y-4" }, [
              h("div", { key: "grid", className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-3" }, [
                h(Input, {
                  key: "filial",
                  placeholder: "Filial (ex: 2G)",
                  value: novoCadastro.filial_codigo,
                  onChange: (event) =>
                    setNovoCadastro((current) => ({ ...current, filial_codigo: event.target.value })),
                }),
                h(Input, {
                  key: "est",
                  placeholder: "Estabelecimento REDE",
                  value: novoCadastro.codigo_estabelecimento,
                  onChange: (event) =>
                    setNovoCadastro((current) => ({ ...current, codigo_estabelecimento: event.target.value })),
                }),
                h(Input, {
                  key: "regional",
                  placeholder: "Regional",
                  value: novoCadastro.regional,
                  onChange: (event) => setNovoCadastro((current) => ({ ...current, regional: event.target.value })),
                }),
                h(Input, {
                  key: "nome-filial",
                  placeholder: "Nome da filial",
                  value: novoCadastro.nome_filial,
                  onChange: (event) =>
                    setNovoCadastro((current) => ({ ...current, nome_filial: event.target.value })),
                }),
                h(Input, {
                  key: "nome-est",
                  placeholder: "Nome do estabelecimento",
                  value: novoCadastro.nome_estabelecimento,
                  onChange: (event) =>
                    setNovoCadastro((current) => ({ ...current, nome_estabelecimento: event.target.value })),
                }),
                h(Input, {
                  key: "nome-maq",
                  placeholder: "Nome da maquininha",
                  value: novoCadastro.nome_maquininha,
                  onChange: (event) =>
                    setNovoCadastro((current) => ({ ...current, nome_maquininha: event.target.value })),
                }),
                h(Input, {
                  key: "num-maq",
                  placeholder: "Numero maquininha",
                  value: novoCadastro.numero_maquininha,
                  onChange: (event) =>
                    setNovoCadastro((current) => ({ ...current, numero_maquininha: event.target.value })),
                }),
                h(Input, {
                  key: "cnpj",
                  placeholder: "CNPJ filial",
                  value: novoCadastro.cnpj_filial,
                  onChange: (event) =>
                    setNovoCadastro((current) => ({ ...current, cnpj_filial: event.target.value })),
                }),
                h(Input, {
                  key: "situacao",
                  placeholder: "Situacao",
                  value: novoCadastro.situacao,
                  onChange: (event) => setNovoCadastro((current) => ({ ...current, situacao: event.target.value })),
                }),
              ]),
              h("div", { key: "novo-footer", className: "flex items-center justify-between" }, [
                h("label", { key: "ativo-wrap", className: "inline-flex items-center gap-2 text-sm" }, [
                  h(Switch, {
                    key: "ativo-switch",
                    checked: Boolean(novoCadastro.ativo),
                    onCheckedChange: (value) => setNovoCadastro((current) => ({ ...current, ativo: value })),
                  }),
                  h("span", { key: "ativo-label" }, "Ativo"),
                ]),
                h(
                  Button,
                  {
                    key: "save-cadastro",
                    onClick: onSalvarNovoCadastro,
                    disabled: createCadastroMutation.isPending,
                  },
                  [h(Save, { key: "save-icon", className: "mr-1 h-4 w-4" }), "Salvar cadastro"],
                ),
              ]),
            ]),
          ]),

          h(Card, { key: "lista-card", className: "border-border/70" }, [
            h(CardHeader, { key: "lista-header" }, [
              h(CardTitle, { key: "title", className: "text-sm" }, "Cadastros de vinculo"),
              h("p", { key: "subtitle", className: "text-xs text-muted-foreground" }, [
                `Total: ${cadastros.length} `,
                ambiguidades.length > 0 ? `| Ambiguidades: ${ambiguidades.length}` : "",
              ]),
            ]),
            h(CardContent, { key: "lista-body", className: "space-y-3" }, [
              h("div", { key: "filters", className: "flex items-center justify-between" }, [
                h("label", { key: "filter-label", className: "inline-flex items-center gap-2 text-sm" }, [
                  h(Switch, {
                    key: "filter-switch",
                    checked: mostrarInativos,
                    onCheckedChange: (value) => setMostrarInativos(Boolean(value)),
                  }),
                  h("span", { key: "filter-text" }, "Mostrar inativos"),
                ]),
              ]),
              ambiguidades.length > 0
                ? h("div", { key: "amb", className: "rounded border border-warning/40 bg-warning/10 p-3 text-xs" }, [
                    h(
                      "p",
                      { key: "amb-title", className: "font-medium text-foreground" },
                      "Ambiguidades encontradas",
                    ),
                    h(
                      "p",
                      { key: "amb-txt", className: "text-muted-foreground mt-1" },
                      ambiguidades
                        .map((item) => `${item.codigo_estabelecimento} -> ${ensureArray(item.filiais).join(", ")}`)
                        .join(" | "),
                    ),
                  ])
                : null,
              h("div", { key: "table-wrap", className: "overflow-x-auto" }, [
                h("table", { key: "table", className: "w-full text-sm" }, [
                  h("thead", { key: "thead" }, [
                    h("tr", { key: "trh", className: "border-b border-border" }, [
                      h("th", { key: "h1", className: "p-2 text-left" }, "Estabelecimento"),
                      h("th", { key: "h2", className: "p-2 text-left" }, "Filial"),
                      h("th", { key: "h3", className: "p-2 text-left" }, "Maquininha"),
                      h("th", { key: "h4", className: "p-2 text-left" }, "Numero"),
                      h("th", { key: "h5", className: "p-2 text-left" }, "Regional"),
                      h("th", { key: "h6", className: "p-2 text-left" }, "CNPJ"),
                      h("th", { key: "h7", className: "p-2 text-left" }, "Status"),
                      h("th", { key: "h8", className: "p-2 text-right" }, "Acoes"),
                    ]),
                  ]),
                  h(
                    "tbody",
                    { key: "tbody" },
                    cadastros.length === 0
                      ? [
                          h("tr", { key: "empty" }, [
                            h(
                              "td",
                              { colSpan: 8, className: "p-6 text-center text-muted-foreground" },
                              cadastrosQuery.isLoading ? "Carregando cadastros..." : "Nenhum cadastro encontrado.",
                            ),
                          ]),
                        ]
                      : cadastros.map((row) =>
                          h("tr", { key: row.id, className: "border-b border-border/50" }, [
                            renderTextCell(row.codigo_estabelecimento),
                            renderTextCell(row.filial_codigo),
                            renderTextCell(row.nome_maquininha || row.nome_estabelecimento),
                            renderTextCell(row.numero_maquininha),
                            renderTextCell(row.regional),
                            renderTextCell(row.cnpj_filial),
                            h(
                              "td",
                              { key: `st-${row.id}`, className: "p-2 text-sm" },
                              row.ativo ? "Ativo" : "Inativo",
                            ),
                            h(
                              "td",
                              { key: `ac-${row.id}`, className: "p-2 text-right" },
                              h(
                                Button,
                                {
                                  variant: "outline",
                                  size: "sm",
                                  onClick: () =>
                                    toggleCadastroMutation.mutate({
                                      id: row.id,
                                      ativo: !row.ativo,
                                    }),
                                  disabled: toggleCadastroMutation.isPending,
                                },
                                row.ativo ? "Inativar" : "Ativar",
                              ),
                            ),
                          ]),
                        ),
                  ),
                ]),
              ]),
            ]),
          ]),
        ]),
      ],
    ),
  ]);
};

export { ee as default };
