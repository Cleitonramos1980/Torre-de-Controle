import { isOracleEnabled, executeOracle } from "../db/oracle.js";

// ─── SQL NÍVEL 1 — Listagem paginada ──────────────────────────────────────────
// Query simplificada: usa apenas PCNFENT + joins opcionais, sem filtros restritivos
// de PCCONSUM/CODCONT que eliminariam registros válidos no contexto de monitoramento.
const SQL_CABECALHO_LISTAGEM = `
SELECT CABECALHO.NUMNOTA
     , CABECALHO.NUMTRANSENT
     , CABECALHO.NUMTRANSORIGEM
     , CABECALHO.CODFORNEC
     , NVL(PCFORNEC.FORNECEDOR, '') FORNECEDOR
     , CABECALHO.CODFILIAL
     , NVL(CABECALHO.VLTOTAL, 0) VLTOTAL
     , CABECALHO.SERIE
     , CABECALHO.ESPECIE
     , CABECALHO.DTENT
     , CABECALHO.DTEMISSAO
     , CABECALHO.TIPODESCARGA
     , CABECALHO.ROTINALANC
     , CABECALHO.CODFUNCLANC
     , NVL(PCEMPR.NOME, '') FUNCIONARIOLANC
     , CABECALHO.CODFORNECFRETE
     , NVL(PCTRANSPORTE.FORNECEDOR, '') TRANSPORTADORA
     , NVL(CABECALHO.IMPORTADOXML, 'N') IMPORTADOXML
  FROM PCNFENT CABECALHO
     , PCFORNEC
     , PCEMPR
     , PCFORNEC PCTRANSPORTE
 WHERE CABECALHO.CODFORNEC      = PCFORNEC.CODFORNEC
   AND CABECALHO.CODFUNCLANC    = PCEMPR.MATRICULA(+)
   AND CABECALHO.CODFORNECFRETE = PCTRANSPORTE.CODFORNEC(+)
   AND CABECALHO.CODFILIAL      = :CODFILIAL
   AND CABECALHO.DTENT BETWEEN :DTENTINICIO AND :DTENTFIM
`;

// ─── SQL NÍVEL 1 — Cabeçalho completo (detalhe, todas as colunas originais) ───
const SQL_CABECALHO_DETALHE = `
select CABECALHO.NUMNOTA
     , CABECALHO.NUMTRANSENT
     , CABECALHO.NUMTRANSORIGEM
     , CABECALHO.CODFORNEC
     , PCFORNEC.FORNECEDOR
     , CABECALHO.CODFILIAL
     , NVL(CABECALHO.VLTOTAL, 0) VLTOTAL
     , CABECALHO.SERIE
     , CABECALHO.ESPECIE
     , NVL(CABECALHO.RESTRINGIRCREDICMSTV10,'N') RESTRINGIRCREDICMSTV10
     , NVL(CABECALHO.GERANFVENDA,'N') GERANFVENDA
     , CABECALHO.DTENT
     , CABECALHO.CODFISCAL
     , CABECALHO.CODCONT
     , CABECALHO.DTEMISSAO
     , CABECALHO.DTSAIDA
     , CABECALHO.TIPODESCARGA
     , CABECALHO.ROTINALANC
     , CABECALHO.CODENTVEICULO
     , CABECALHO.FUNCLANC
     , CABECALHO.CODFUNCLANC
     , NVL(CABECALHO.PERCALTERCUSTOENT, 0) PERCALTERCUSTOENT
     , PCEMPR.NOME FUNCIONARIOLANC
     , CABECALHO.CODFORNECFRETE
     , PCTRANSPORTE.FORNECEDOR TRANSPORTADORA
     , NVL(CABECALHO.VLIPI,0) VLIPI
     , NVL(CABECALHO.VLBASEIPI,0) VLBASEIPI
     , NVL(CABECALHO.VLDESCFIN,0) VLDESCFIN
     , NVL(CABECALHO.VLFRETE,0) VLFRETE
     , NVL(CABECALHO.TIPOFRETECIFFOB,'C') TIPOFRETECIFFOB
     , NVL(CABECALHO.VLDESCONTO, 0) VLDESCONTO
     , NVL(CABECALHO.BASEICST, 0) BASEICST
     , NVL(CABECALHO.VLST, 0) VLST
     , NVL(CABECALHO.VLICMS, 0) VLICMS
     , NVL(CABECALHO.VLISENTAS, 0) VLISENTAS
     , NVL(CABECALHO.VLBONIFIC, 0) VLBONIFIC
     , CABECALHO.OBS
     , CABECALHO.OBS1
     , CABECALHO.OBS2
     , PCFORNEC.OBS FORNECOBS
     , PCFORNEC.OBS2 FORNECOBS2
     , PCFORNEC.OBSERVACAO FORNECOBSERVACAO
     , PCFORNEC.ENDER
     , PCFORNEC.CGC
     , PCFORNEC.CIDADE
     , PCFORNEC.ESTADO
     , PCFORNEC.TELFAB
     , PCFORNEC.TELREP
     , PCFORNEC.FAXREP
     , PCFORNEC.FAXFAB
     , PCFORNEC.TELEXREP
     , PCFORNEC.TELEXFAB
     , PCFORNEC.TELCOB
     , PCFORNEC.TELEFONECOM
     , PCFORNEC.TELEFONEADM
     , CABECALHO.NUMBONUS
     , CABECALHO.NUMVOL
     , CABECALHO.NUMDIIMPORTACAO
     , NVL(CABECALHO.TOTPESOLIQ,0) TOTPESOLIQ
     , NVL(CABECALHO.TOTPESO,0) TOTPESO
     , NVL(CABECALHO.IMPORTADOXML,'N') IMPORTADOXML
     , CABECALHO.VERSAOROTINA
     , NVL(CABECALHO.REMESSACOMBENEFIC,'N') REMESSACOMBENEFIC
     , CABECALHO.ORIGEMCUSTOTRANSF
     , NVL(CABECALHO.APLICAVERBAREBCUSTO,'N') APLICVERBAREBCUSTO
     , (SELECT COUNT(1) FROM PCMOV M WHERE M.NUMTRANSENT = CABECALHO.NUMTRANSENT AND M.CODFILIAL = CABECALHO.CODFILIAL AND M.DTCANCEL IS NULL) TOTALITENS
  FROM PCNFENT CABECALHO
     , PCFORNEC
     , PCEMPR
     , PCFORNEC PCTRANSPORTE
 WHERE CABECALHO.CODFORNEC      = PCFORNEC.CODFORNEC
   AND CABECALHO.CODFUNCLANC    = PCEMPR.MATRICULA(+)
   AND CABECALHO.CODFORNECFRETE = PCTRANSPORTE.CODFORNEC(+)
   AND CABECALHO.CODFILIAL      = :CODFILIAL
   AND CABECALHO.NUMTRANSENT    = :NUMTRANSENT
ORDER BY CABECALHO.NUMTRANSENT
`;

// ─── SQL NÍVEL 2 — Itens da nota (monitoramento) ─────────────────────────────
// Versão simplificada: remove joins problemáticos (PCTRIBUT inner join que elimina
// linhas quando PCTABPR.CODST=NULL, e aritmética de data com TIMESTAMP bind).
// Datas DTENT_INICIO e DTENT_FIM são pré-calculadas no JS (dtEnt ± 2 dias).
const SQL_ITENS = `
SELECT ITENS.ROWID AS ROWID_ITEM
     , ITENS.NUMPED
     , ITENS.NUMTRANSENT
     , ITENS.NUMLOTE
     , NVL(ITENS.NUMLOTEFAB, '') NUMLOTEFAB
     , ITENS.CODPROD
     , NVL(ITENS.DESCRICAO, PCPRODUT.DESCRICAO) DESCRICAO
     , NVL(PCPRODUT.UNIDADE, '') UNIDADE
     , NVL(PCPRODUT.EMBALAGEM, '') EMBALAGEM
     , NVL(PCPRODUT.CODEPTO, 0) CODEPTO
     , NVL(PCPRODUT.CODSEC, 0) CODSEC
     , NVL(PCPRODUT.NBM, '') NBM
     , NVL(PCPRODUT.CLASSIFICFISCAL, '') CLASSIFICFISCAL
     , ITENS.NUMSEQ
     , NVL(ITENS.ST, 0) ST
     , NVL(ITENS.VLIPI, 0) VLIPI
     , NVL(ITENS.VLCREDICMS, 0) VLCREDICMS
     , DECODE(NVL(ITENS.PUNIT,0), 0, NVL(ITENS.PUNITCONT,0), ITENS.PUNIT) PUNIT
     , NVL(ITENS.PERCIPI, 0) PERCIPI
     , DECODE(NVL(ITENS.PERICMGUIAPROPRIA,0), 0, NVL(ITENS.PERCICM,0), ITENS.PERICMGUIAPROPRIA) PERCICM
     , NVL(ITENS.PERCST, 0) PERCST
     , DECODE(NVL(ITENS.QT,0), 0, NVL(ITENS.QTCONT,0), ITENS.QT) QT
     , NVL(ITENS.QTCONT, 0) QTCONT
     , NVL(ITENS.PTABELA, 0) PBRUTO
     , NVL(ITENS.PERCBON, 0) PERCBON
     , NVL(ITENS.PERCDESC, 0) PERCDESC
     , NVL(ITENS.SITTRIBUT, '') SITTRIBUT
     , NVL(ITENS.CODFISCAL, 0) CODFISCALITEM
     , NVL(ITENS.VLBONIFIC, 0) VLBONIFIC
     , NVL(ITENS.VLSUFRAMA, 0) VLSUFRAMA
     , NVL(ITENS.VLDESCONTO, 0) VLDESCONTO
     , (NVL(ITENS.PTABELA,0) - NVL(ITENS.VLDESCONTO,0) - NVL(ITENS.VLSUFRAMA,0)
        - NVL(COMPLEMENTO.VLICMSDESONERACAO,0)) AS PLIQUIDO
     , NVL(ITENS.VLFRETE, 0) VLFRETE
     , NVL(ITENS.VLDESCFIN, 0) VLDESCFIN
     , NVL(ITENS.VLOUTRASDESP, 0) VLOUTRASDESP
     , NVL(ITENS.PRODBONIFICADO, 'N') PRODBONIFICADO
     , NVL(ITENS.CUSTOREAL, 0) CUSTOREAL
     , NVL(ITENS.CUSTOFIN, 0) CUSTOFIN
     , NVL(ITENS.CUSTOULTENT, 0) CUSTOULTENT
     , NVL(ITENS.PERCREDICMS, 0) PERCREDICMS
     , NVL(COMPLEMENTO.PERPISBKP, 0) PERPIS
     , NVL(COMPLEMENTO.PERCOFINSBKP, 0) PERCOFINS
     , NVL(COMPLEMENTO.VLCREDPISBKP, 0) VLCREDPIS
     , NVL(COMPLEMENTO.VLCREDCOFINSBKP, 0) VLCREDCOFINS
     , NVL(COMPLEMENTO.VLICMSDESONERACAO, 0) VLICMSDESONERACAO
     , NVL(PCDEPTO.DESCRICAO, '') DEPTO
     , NVL(PCSECAO.DESCRICAO, '') SECAO
     , NVL(((NVL(ITENS.PUNIT,0) - (NVL(ITENS.BASEICMS,0) * (NVL(ITENS.PERCICM,0)/100)))
            / NULLIF(1 + (NVL(ITENS.PERCBON,0)/100), 0)), 0) VLTOTPUNIT
  FROM PCMOV ITENS
     , PCPRODUT
     , PCMOVCOMPLE COMPLEMENTO
     , PCDEPTO
     , PCSECAO
 WHERE ITENS.CODPROD       = PCPRODUT.CODPROD
   AND ITENS.DTCANCEL     IS NULL
   AND ITENS.CODFILIAL     = :CODFILIAL
   AND ITENS.NUMTRANSENT   = :NUMTRANSENT
   AND ITENS.DTMOV        BETWEEN :DTENT_INICIO AND :DTENT_FIM
   AND ITENS.NUMTRANSITEM  = COMPLEMENTO.NUMTRANSITEM(+)
   AND PCPRODUT.CODEPTO    = PCDEPTO.CODEPTO(+)
   AND PCPRODUT.CODSEC     = PCSECAO.CODSEC(+)
 ORDER BY NVL(ITENS.DESCRICAO, PCPRODUT.DESCRICAO), ITENS.CODPROD
`;

// ─── SQL auxiliar para parâmetros do nível 2 ──────────────────────────────────
// Removido PCFILIAL.POLITICAFILIAL (coluna inexistente nesta versão WinThor)
// e PARAMFILIAL.OBTERCOMOVARCHAR2 (package pode não existir) — defaults no JS
const SQL_AUX_PARAMS = `
SELECT NVL(PCCONSUM.CODMOEDA, 1) CODMOEDA
     , NVL(PCCONSUM.NUMREGIAOPADRAO, 1) NUMREGIAOPADRAO
     , NVL(PCCONSUM.USATRIBUTACAOVENDA, 'N') USATRIBUTACAOVENDA
  FROM PCCONSUM
`;

// ─── PEDIDOS — SQL resumo (cards/totais) ──────────────────────────────────────
const SQL_RESUMO_PEDIDOS = `
SELECT COUNT(*) QTPEDIDO
     , SUM(NVL(PCPEDC.VLATEND, 0)) VLATEND
     , SUM(NVL(PCPEDC.TOTPESO, 0)) TOTPESO
     , SUM(NVL(DECODE(PCPEDC.CONDVENDA,
                      5,  PCPEDC.VLBONIFIC,
                      6,  PCPEDC.VLBONIFIC,
                      8,  PCPEDC.VLTABELA,
                      11, PCPEDC.VLBONIFIC,
                      12, PCPEDC.VLBONIFIC,
                      PCPEDC.VLTOTAL), 0)) VLPEDIDOS
     , SUM(CASE WHEN PCPEDC.POSICAO = 'B' THEN 1 ELSE 0 END) QT_BLOQUEADOS
     , SUM(CASE WHEN PCPEDC.POSICAO = 'P' THEN 1 ELSE 0 END) QT_PENDENTES
     , SUM(CASE WHEN PCPEDC.POSICAO = 'L' THEN 1 ELSE 0 END) QT_LIBERADOS
     , SUM(CASE WHEN PCPEDC.POSICAO = 'M' THEN 1 ELSE 0 END) QT_MONTADOS
     , SUM(CASE WHEN NVL(PCPEDC.USAINTEGRACAOWMS,'N') = 'S' THEN 1 ELSE 0 END) QT_WMS
  FROM PCPEDC
 WHERE PCPEDC.CODFILIAL   = :CODFILIAL
   AND PCPEDC.DATA       >= :DTINICIO
   AND PCPEDC.DATA       <= :DTFIM
   AND PCPEDC.POSICAO     IN ('B','P','L','M')
   AND PCPEDC.CONDVENDA NOT IN (98)
`;

// ─── PEDIDOS — SQL nível 1 (listagem paginada) ────────────────────────────────
const SQL_PEDIDOS_NIVEL_1 = `
SELECT PCPEDC.NUMPED
     , TO_CHAR(PCPEDC.DATA, 'YYYY-MM-DD') DATA
     , '0' HORA
     , '0' MINUTO
     , PCPEDC.CODCLI
     , NVL(PC.CLIENTE, '') CLIENTE
     , '' FANTASIA
     , NVL(PC.CGCENT, '') CGCENT
     , '' IEENT
     , PCPEDC.POSICAO
     , PCPEDC.CONDVENDA
     , 0 NUMITENS
     , NVL(PCPEDC.VLTOTAL,   0) VLTOTAL
     , NVL(PCPEDC.VLATEND,   0) VLATEND
     , NVL(PCPEDC.VLTABELA,  0) VLTABELA
     , NVL(PCPEDC.VLBONIFIC, 0) VLBONIFIC
     , NVL(PCPEDC.VLFRETE,   0) VLFRETE
     , NVL(PCPEDC.VLDESCONTO,0) VLDESCONTO
     , NVL(PCPEDC.TOTPESO,   0) TOTPESO
     , 0 LIMCRED
     , 0 VLFATURAR
     , 0 VLPENDENTE
     , PCPEDC.CODFILIAL
     , PCPEDC.CODUSUR
     , '' NOMEUSUR
     , PCPEDC.CODCOB
     , '' COBRANCA
     , PCPEDC.CODPLPAG
     , '' DESCPLPAG
     , NVL(PCPEDC.NUMCAR, 0) NUMCAR
     , 'N' BLOQUEIO
     , NULL CODMOTIVO
     , '' MOTIVOBLOQUEIO
     , '' ORIGEMPED
     , 'N' IMPORTADO
     , NVL(PCPEDC.USAINTEGRACAOWMS, 'N') USAINTEGRACAOWMS
     , '' NUMNOTAMANIF
  FROM PCPEDC
  LEFT JOIN PCCLIENT PC ON PC.CODCLI = PCPEDC.CODCLI
 WHERE PCPEDC.CODFILIAL = :CODFILIAL
   AND PCPEDC.DATA     >= :DTINICIO
   AND PCPEDC.DATA     <= :DTFIM
   AND PCPEDC.CONDVENDA NOT IN (98)
`;

// ─── PEDIDOS — SQL nível 2 (itens por NUMPED) ────────────────────────────────
// Somente SELECT — sem FOR UPDATE, sem UPDATE, sem lock de pedido
const SQL_ITENS_PEDIDO = `
SELECT PCPEDI.NUMPED
     , NVL(PCPEDI.NUMSEQ, 0) NUMSEQ
     , PCPEDI.CODPROD
     , NVL(PCPRODUT.DESCRICAO, '') DESCRICAO
     , '' NUMORIGINAL
     , '' EMBALAGEM
     , NVL(PCPRODUT.UNIDADE,   '') UNIDADE
     , PCPEDI.POSICAO
     , NVL(PCPEDI.QT,      0) QT
     , 0 QTDISPONIVEL
     , NVL(PCPEDI.PVENDA,  0) PVENDA
     , NVL(PCPEDI.PTABELA, 0) PTABELA
     , NVL(PCPEDI.PERDESC, 0) PERDESC
     , NVL(PCPEDI.PERCOM,  0) PERCOM
     , 0 VLIPI
     , 0 ST
     , 0 VLCUSTOREAL
     , 0 VLCUSTOFIN
     , '' NUMLOTE
     , NVL(PCPEDI.CODUSUR, 0) CODUSUR_ITEM
     , '' TIPOENTREGA
  FROM PCPEDI
     , PCPRODUT
 WHERE PCPEDI.NUMPED  = :NUMPED
   AND PCPEDI.CODPROD = PCPRODUT.CODPROD
   AND PCPEDI.POSICAO NOT IN ('C')
ORDER BY PCPEDI.NUMPED, PCPEDI.CODPROD
`;

export async function monitoramentoRoutes(app) {

    // ── GET /api/monitoramento/notas-entrada ── Listagem paginada (Nível 1) ──
    app.get("/api/monitoramento/notas-entrada", async (req, reply) => {
        if (!isOracleEnabled()) {
            return reply.code(503).send({ error: { message: "Oracle não disponível para consulta de notas de entrada." } });
        }

        const q = req.query;
        const codfilial = String(q.codfilial || "").trim();
        const dtInicioStr = String(q.dtInicio || "").trim();
        const dtFimStr = String(q.dtFim || "").trim();

        if (!codfilial) return reply.code(400).send({ error: { message: "Parâmetro 'codfilial' é obrigatório." } });
        if (!dtInicioStr || !dtFimStr) return reply.code(400).send({ error: { message: "Parâmetros 'dtInicio' e 'dtFim' são obrigatórios." } });

        const dtInicio = new Date(`${dtInicioStr}T00:00:00`);
        const dtFim = new Date(`${dtFimStr}T23:59:59`);
        if (isNaN(dtInicio) || isNaN(dtFim)) return reply.code(400).send({ error: { message: "Datas inválidas." } });

        const page = Math.max(1, Number(q.page || 1));
        const pageSize = Math.min(200, Math.max(1, Number(q.pageSize || 50)));
        const offset = (page - 1) * pageSize;

        const binds = { CODFILIAL: codfilial, DTENTINICIO: dtInicio, DTENTFIM: dtFim };
        let filtrosExtras = "";

        if (q.numNota?.trim()) {
            filtrosExtras += ` AND CABECALHO.NUMNOTA = :NUMNOTA`;
            binds.NUMNOTA = Number(q.numNota.trim());
        }
        if (q.numTransEnt?.trim()) {
            filtrosExtras += ` AND CABECALHO.NUMTRANSENT = :NUMTRANSENT_FILTER`;
            binds.NUMTRANSENT_FILTER = Number(q.numTransEnt.trim());
        }
        if (q.codFornec?.trim()) {
            filtrosExtras += ` AND CABECALHO.CODFORNEC = :CODFORNEC`;
            binds.CODFORNEC = Number(q.codFornec.trim());
        }
        if (q.fornecedor?.trim()) {
            filtrosExtras += ` AND UPPER(PCFORNEC.FORNECEDOR) LIKE :FORNECEDOR`;
            binds.FORNECEDOR = `%${q.fornecedor.trim().toUpperCase()}%`;
        }
        if (q.serie?.trim()) {
            filtrosExtras += ` AND UPPER(CABECALHO.SERIE) = UPPER(:SERIE)`;
            binds.SERIE = q.serie.trim();
        }
        if (q.especie?.trim()) {
            filtrosExtras += ` AND UPPER(CABECALHO.ESPECIE) = UPPER(:ESPECIE)`;
            binds.ESPECIE = q.especie.trim();
        }
        if (q.tipoDescarga?.trim()) {
            filtrosExtras += ` AND UPPER(CABECALHO.TIPODESCARGA) = UPPER(:TIPODESCARGA)`;
            binds.TIPODESCARGA = q.tipoDescarga.trim();
        }

        const sql = SQL_CABECALHO_LISTAGEM + filtrosExtras
            + ` ORDER BY CABECALHO.NUMTRANSENT DESC`
            + ` OFFSET :OFFSET ROWS FETCH NEXT :PAGE_SIZE ROWS ONLY`;

        binds.OFFSET = offset;
        binds.PAGE_SIZE = pageSize;

        try {
            const result = await executeOracle(sql, binds, { outFormat: 4002 });
            const rows = result.rows ?? [];
            return { data: rows, page, pageSize };
        } catch (err) {
            req.log.error({ err, sql }, "Erro ao consultar notas de entrada nivel 1");
            return reply.code(500).send({ error: { message: `Erro ao consultar notas de entrada: ${err.message}` } });
        }
    });

    // ── GET /api/monitoramento/notas-entrada/:numTransEnt ── Detalhe completo ──
    app.get("/api/monitoramento/notas-entrada/:numTransEnt", async (req, reply) => {
        if (!isOracleEnabled()) return reply.code(503).send({ error: { message: "Oracle não disponível." } });

        const numTransEnt = Number(req.params.numTransEnt);
        if (!numTransEnt || isNaN(numTransEnt)) return reply.code(400).send({ error: { message: "numTransEnt inválido." } });

        const q = req.query;
        const codfilial = String(q.codfilial || "").trim();
        if (!codfilial) return reply.code(400).send({ error: { message: "Parâmetro 'codfilial' é obrigatório." } });

        const binds = { CODFILIAL: codfilial, NUMTRANSENT: numTransEnt };

        try {
            const result = await executeOracle(SQL_CABECALHO_DETALHE, binds, { outFormat: 4002 });
            const rows = result.rows ?? [];
            if (rows.length === 0) return reply.code(404).send({ error: { message: "Nota não encontrada." } });
            return rows[0];
        } catch (err) {
            req.log.error({ err }, "Erro ao consultar detalhe da nota");
            return reply.code(500).send({ error: { message: `Erro ao consultar detalhe da nota: ${err.message}` } });
        }
    });

    // ── GET /api/monitoramento/notas-entrada/:numTransEnt/itens ── Nível 2 ──
    app.get("/api/monitoramento/notas-entrada/:numTransEnt/itens", async (req, reply) => {
        if (!isOracleEnabled()) return reply.code(503).send({ error: { message: "Oracle não disponível." } });

        const numTransEnt = Number(req.params.numTransEnt);
        if (!numTransEnt || isNaN(numTransEnt)) return reply.code(400).send({ error: { message: "numTransEnt inválido." } });

        const q = req.query;
        const codfilial = String(q.codfilial || "").trim();
        if (!codfilial) return reply.code(400).send({ error: { message: "Parâmetro 'codfilial' é obrigatório." } });

        const dtEntStr = String(q.dtEnt || "").trim();
        if (!dtEntStr) return reply.code(400).send({ error: { message: "Parâmetro 'dtEnt' é obrigatório." } });

        const dtEnt = new Date(`${dtEntStr}T00:00:00`);
        if (isNaN(dtEnt)) return reply.code(400).send({ error: { message: "Data inválida." } });

        try {
            // Pré-calcular datas para evitar aritmética de TIMESTAMP no Oracle
            const dtInicio = new Date(dtEnt);
            dtInicio.setDate(dtInicio.getDate() - 2);
            const dtFim = new Date(dtEnt);
            dtFim.setDate(dtFim.getDate() + 2);

            const binds = {
                CODFILIAL: codfilial,
                NUMTRANSENT: numTransEnt,
                DTENT_INICIO: dtInicio,
                DTENT_FIM: dtFim,
            };

            const result = await executeOracle(SQL_ITENS, binds, { outFormat: 4002 });
            return { data: result.rows ?? [] };
        } catch (err) {
            req.log.error({ err }, "Erro ao consultar itens da nota");
            return reply.code(500).send({ error: { message: `Erro ao consultar itens da nota: ${err.message}` } });
        }
    });

    // ── GET /api/monitoramento/pedidos/resumo ── Cards de resumo ──────────────
    app.get("/api/monitoramento/pedidos/resumo", async (req, reply) => {
        if (!isOracleEnabled()) return reply.code(503).send({ error: { message: "Oracle não disponível para consulta de pedidos." } });

        const q = req.query;
        const codfilial   = String(q.codfilial  || "").trim();
        const dtInicioStr = String(q.dtInicio   || "").trim();
        const dtFimStr    = String(q.dtFim      || "").trim();

        if (!codfilial)                   return reply.code(400).send({ error: { message: "Parâmetro 'codfilial' é obrigatório." } });
        if (!dtInicioStr || !dtFimStr)    return reply.code(400).send({ error: { message: "Parâmetros 'dtInicio' e 'dtFim' são obrigatórios." } });

        const dtInicio = new Date(`${dtInicioStr}T00:00:00`);
        const dtFim    = new Date(`${dtFimStr}T23:59:59`);
        if (isNaN(dtInicio) || isNaN(dtFim)) return reply.code(400).send({ error: { message: "Datas inválidas." } });

        try {
            const result = await executeOracle(SQL_RESUMO_PEDIDOS, { CODFILIAL: codfilial, DTINICIO: dtInicio, DTFIM: dtFim }, { outFormat: 4002 });
            const row = (result.rows ?? [])[0];
            return row ?? { QTPEDIDO: 0, VLATEND: 0, TOTPESO: 0, VLPEDIDOS: 0, QT_BLOQUEADOS: 0, QT_PENDENTES: 0, QT_LIBERADOS: 0, QT_MONTADOS: 0, QT_WMS: 0 };
        } catch (err) {
            req.log.error({ err }, "Erro ao consultar resumo de pedidos");
            return reply.code(500).send({ error: { message: `Erro ao consultar resumo: ${err.message}` } });
        }
    });

    // ── GET /api/monitoramento/pedidos ── Listagem paginada (Nível 1) ─────────
    app.get("/api/monitoramento/pedidos", async (req, reply) => {
        if (!isOracleEnabled()) return reply.code(503).send({ error: { message: "Oracle não disponível para consulta de pedidos." } });

        const q = req.query;
        const codfilial   = String(q.codfilial  || "").trim();
        const dtInicioStr = String(q.dtInicio   || "").trim();
        const dtFimStr    = String(q.dtFim      || "").trim();

        if (!codfilial)                   return reply.code(400).send({ error: { message: "Parâmetro 'codfilial' é obrigatório." } });
        if (!dtInicioStr || !dtFimStr)    return reply.code(400).send({ error: { message: "Parâmetros 'dtInicio' e 'dtFim' são obrigatórios." } });

        const dtInicio = new Date(`${dtInicioStr}T00:00:00`);
        const dtFim    = new Date(`${dtFimStr}T23:59:59`);
        if (isNaN(dtInicio) || isNaN(dtFim)) return reply.code(400).send({ error: { message: "Datas inválidas." } });

        const page     = Math.max(1, Number(q.page     || 1));
        const pageSize = Math.min(200, Math.max(1, Number(q.pageSize || 50)));
        const offset   = (page - 1) * pageSize;

        const binds = { CODFILIAL: codfilial, DTINICIO: dtInicio, DTFIM: dtFim };
        let filtrosExtras = "";

        // Posição: padrão B/P/L/M; override se informado
        if (q.posicao?.trim()) {
            filtrosExtras += ` AND PCPEDC.POSICAO = :POSICAO`;
            binds.POSICAO = q.posicao.trim().toUpperCase();
        } else {
            filtrosExtras += ` AND PCPEDC.POSICAO IN ('B','P','L','M')`;
        }
        if (q.numped?.trim()) {
            filtrosExtras += ` AND PCPEDC.NUMPED = :NUMPED_FILTER`;
            binds.NUMPED_FILTER = Number(q.numped.trim());
        }
        if (q.codcli?.trim()) {
            filtrosExtras += ` AND PCPEDC.CODCLI = :CODCLI`;
            binds.CODCLI = Number(q.codcli.trim());
        }
        if (q.cliente?.trim()) {
            filtrosExtras += ` AND UPPER(PC.CLIENTE) LIKE :CLIENTE`;
            binds.CLIENTE = `%${q.cliente.trim().toUpperCase()}%`;
        }
        if (q.cnpj?.trim()) {
            filtrosExtras += ` AND PC.CGCENT LIKE :CGC`;
            binds.CGC = `%${q.cnpj.trim().replace(/\D/g, "")}%`;
        }
        if (q.codusur?.trim()) {
            filtrosExtras += ` AND PCPEDC.CODUSUR = :CODUSUR`;
            binds.CODUSUR = Number(q.codusur.trim());
        }
        if (q.codcob?.trim()) {
            filtrosExtras += ` AND PCPEDC.CODCOB = :CODCOB`;
            binds.CODCOB = q.codcob.trim();
        }
        if (q.codplpag?.trim()) {
            filtrosExtras += ` AND PCPEDC.CODPLPAG = :CODPLPAG`;
            binds.CODPLPAG = Number(q.codplpag.trim());
        }
        if (q.numcar?.trim()) {
            filtrosExtras += ` AND PCPEDC.NUMCAR = :NUMCAR`;
            binds.NUMCAR = Number(q.numcar.trim());
        }
        if (q.origemPed?.trim()) {
            filtrosExtras += ` AND UPPER(PCPEDC.ORIGEMPED) = UPPER(:ORIGEMPED)`;
            binds.ORIGEMPED = q.origemPed.trim();
        }
        if (q.wms === "S") {
            filtrosExtras += ` AND NVL(PCPEDC.USAINTEGRACAOWMS,'N') = 'S'`;
        }

        const sql = SQL_PEDIDOS_NIVEL_1 + filtrosExtras
            + ` ORDER BY PCPEDC.NUMPED DESC`
            + ` OFFSET :OFFSET ROWS FETCH NEXT :PAGE_SIZE ROWS ONLY`;
        binds.OFFSET    = offset;
        binds.PAGE_SIZE = pageSize;

        try {
            const result = await executeOracle(sql, binds, { outFormat: 4002 });
            return { data: result.rows ?? [], page, pageSize };
        } catch (err) {
            req.log.error({ err, sql }, "Erro ao consultar pedidos nivel 1");
            return reply.code(500).send({ error: { message: `Erro ao consultar pedidos: ${err.message}` } });
        }
    });

    // ── GET /api/monitoramento/pedidos/:numped/itens ── Nível 2 ──────────────
    app.get("/api/monitoramento/pedidos/:numped/itens", async (req, reply) => {
        if (!isOracleEnabled()) return reply.code(503).send({ error: { message: "Oracle não disponível." } });

        const numped = Number(req.params.numped);
        if (!numped || isNaN(numped)) return reply.code(400).send({ error: { message: "Número de pedido inválido." } });

        try {
            const result = await executeOracle(SQL_ITENS_PEDIDO, { NUMPED: numped }, { outFormat: 4002 });
            return { data: result.rows ?? [] };
        } catch (err) {
            req.log.error({ err }, "Erro ao consultar itens do pedido");
            return reply.code(500).send({ error: { message: `Erro ao consultar itens do pedido: ${err.message}` } });
        }
    });
}
