PROMPT: Baixa Automática de Título — PCPREST + PCMOVCR (WinThor/Oracle)

CONTEXTO
Você está integrando com um banco de dados Oracle WinThor. Ao receber confirmação de pagamento (ex: webhook PIX, boleto pago), você deve executar a baixa de título de forma atômica. O processo envolve 4 tabelas e deve ser executado dentro de uma única transação Oracle com COMMIT ao final.

⚠️ Regra fundamental: Nunca faça COMMIT parcial. Se qualquer etapa falhar, faça ROLLBACK de tudo.

TABELAS ENVOLVIDAS
Tabela	Papel
PCCONSUM	Gerador de número sequencial de lançamento (PROXNUMLANC)
PCPREST	Títulos/duplicatas em aberto (aqui vive o "a receber")
PCMOVCR	Movimento de caixa/banco (aqui registra a entrada de dinheiro)
LARA_PIX_COBRANCAS	(Opcional) Marca cobrança PIX como paga no sistema Lara

INPUTS NECESSÁRIOS
Antes de iniciar, você precisa ter em mãos:

codcli       : number   — código do cliente
duplicata    : string   — número da duplicata (ex: "NF00123")
prestacao    : string   — número da prestação (ex: "1", "2") — pode ser vazio
valor_pago   : number   — valor recebido (float, 2 casas decimais)
dtpag        : Date     — data do pagamento (default: hoje)
txid         : string   — ID da transação PIX (para rastreabilidade)
endToEndId   : string   — E2E ID do PIX

SEQUÊNCIA DE OPERAÇÕES (ordem obrigatória)
ETAPA 1 — Reservar número de lançamento (PCCONSUM)

-- Lock exclusivo para evitar race condition em múltiplas baixas simultâneas
SELECT PROXNUMLANC
  FROM PCCONSUM
   FOR UPDATE;

-- Incrementar imediatamente (não aguardar commit)
UPDATE PCCONSUM
   SET PROXNUMLANC = PROXNUMLANC + 1;

-- Guardar o valor lido como: numLanc
Por quê: O PROXNUMLANC é o próximo número disponível. O FOR UPDATE garante que duas baixas simultâneas não recebam o mesmo número.

ETAPA 2 — Ler dados do título em PCPREST

-- Se prestacao foi informada:
SELECT NVL(p.NUMTRANSVENDA, 0)           AS NUMTRANSVENDA,
       NVL(TRIM(p.CODCOB), 'D')          AS CODCOB,
       TRIM(p.PREST)                     AS PREST,
       NVL(p.VALOR, 0) - NVL(p.VPAGO, 0) AS SALDO_ABERTO
  FROM PCPREST p
 WHERE p.CODCLI       = :codcli
   AND TRIM(p.DUPLIC) = TRIM(:duplicata)
   AND TRIM(p.PREST)  = TRIM(:prestacao)
   AND p.DTPAG IS NULL;

-- Se prestacao NÃO foi informada (pega o primeiro título em aberto):
SELECT NVL(p.NUMTRANSVENDA, 0)           AS NUMTRANSVENDA,
       NVL(TRIM(p.CODCOB), 'D')          AS CODCOB,
       TRIM(p.PREST)                     AS PREST,
       NVL(p.VALOR, 0) - NVL(p.VPAGO, 0) AS SALDO_ABERTO
  FROM PCPREST p
 WHERE p.CODCLI       = :codcli
   AND TRIM(p.DUPLIC) = TRIM(:duplicata)
   AND p.DTPAG IS NULL
   FETCH FIRST 1 ROW ONLY;

Validações obrigatórias após o SELECT:

Se 0 rows returned → título não existe ou já foi baixado → abortar com erro
Guardar: numtransvenda, codcob, prest, saldo_aberto
Calcular: valorBaixa = saldo_aberto > 0 ? saldo_aberto : valor_pago
Por quê DTPAG IS NULL: Título já baixado tem DTPAG preenchida. Se não filtrar, você baixa duas vezes.

ETAPA 3 — Ler saldo atual do banco PIX (PCMOVCR)

SELECT NVL(MAX(VLSALDO), 0) AS VLSALDO
  FROM PCMOVCR
 WHERE CODBANCO = 1007;   -- 1007 = conta PIX

Guardar como: saldoAtual
Calcular: novoSaldo = saldoAtual + valorBaixa
Por quê: PCMOVCR é um razão bancário. Cada linha mantém o saldo acumulado. O INSERT precisa do saldo novo já calculado.

ETAPA 4 — Inserir movimento em PCMOVCR

INSERT INTO PCMOVCR (
  NUMTRANS,    DATA,          CODBANCO,  CODCOB,     VALOR,
  TIPO,        HISTORICO,     NUMCARR,   VLSALDO,
  HORA,        MINUTO,        CODFUNC,   INDICE,
  DATACOMPLETA,               CODROTINALANC
) VALUES (
  :numLanc,                        -- número reservado na ETAPA 1
  TRUNC(SYSDATE),                  -- data de hoje (sem hora)
  1007,                            -- código do banco PIX
  :codcob,                         -- lido da PCPREST na ETAPA 2
  :valorBaixa,                     -- calculado na ETAPA 2
  'D',                             -- 'D' = crédito/entrada (débito no passivo)
  :historico,                      -- "BAIXA PIX TRANSACAO {numtransvenda} PREST:{prest}"
  :numtransvenda,                  -- rastreabilidade com a venda original
  :novoSaldo,                      -- calculado na ETAPA 3
  :hora,                           -- hora atual (0-23)
  :minuto,                         -- minuto atual (0-59)
  309,                             -- CODFUNC fixo = sistema automático
  'A',                             -- INDICE fixo = ativo
  SYSDATE,                         -- timestamp completo
  9850                             -- CODROTINALANC fixo = rotina de integração
);

Regras dos campos:

HISTORICO máximo 200 caracteres → truncar se necessário
CODBANCO = 1007 é fixo para PIX
CODFUNC = 309 identifica que foi o sistema automático (não um usuário humano)
CODROTINALANC = 9850 identifica a rotina específica de integração

ETAPA 5 — Atualizar título em PCPREST (a baixa propriamente dita)

UPDATE PCPREST
   SET DTPAG         = TO_DATE(:dtpag, 'YYYY-MM-DD'),   -- data do pagamento
       DTBAIXA       = TO_DATE(:dtpag, 'YYYY-MM-DD'),   -- data da baixa (igual)
       VPAGO         = :valorBaixa,                      -- valor efetivamente pago
       CODBANCOBAIXA = 1007,                             -- banco que recebeu (PIX)
       NUMTRANS      = :numLanc,                         -- liga ao movimento PCMOVCR
       ROTINAPAG     = NULL,                             -- limpar rotina pendente
       DTULTALTER    = SYSDATE,                          -- auditoria
       OBS2          = :obs2                             -- rastreio PIX
 WHERE CODCLI       = :codcli
   AND TRIM(DUPLIC) = TRIM(:duplicata)
   AND TRIM(PREST)  = TRIM(:prest)
   AND DTPAG IS NULL;                -- proteção extra: não atualiza se já baixado

Montagem do campo OBS2:

obs2 = "PIX-AUTO TXID:{txid[0..29]} E2E:{endToEndId[0..29]}"
     → truncar para 80 caracteres no total

Após o UPDATE:

Verificar rowsAffected
Se rowsAffected == 0 → título não foi encontrado ou já estava baixado → ROLLBACK + erro
Se rowsAffected == 1 → sucesso → continuar para COMMIT

ETAPA 6 — COMMIT

COMMIT;
Apenas execute COMMIT se todas as etapas anteriores foram bem-sucedidas. Qualquer exceção → ROLLBACK.

ETAPA 7 (Opcional) — Marcar cobrança PIX como paga

UPDATE LARA_PIX_COBRANCAS
   SET PAGO   = 1,
       DTPAG  = SYSDATE
 WHERE TXID = :txid
   AND PAGO  = 0;

COMMIT;
Esta etapa é separada e independente. Se falhar, não desfaz a baixa já commitada.

FLUXO COMPLETO EM PSEUDOCÓDIGO

função baixarTitulo(codcli, duplicata, prestacao, valorPago, dtpag, txid, e2eId):

  iniciar transação Oracle (autoCommit = false)

  TRY:
    // 1. Reservar número
    numLanc = SELECT PROXNUMLANC FROM PCCONSUM FOR UPDATE
    UPDATE PCCONSUM SET PROXNUMLANC = PROXNUMLANC + 1

    // 2. Ler título
    row = SELECT ... FROM PCPREST WHERE codcli + duplic + prest + DTPAG IS NULL
    SE row vazio → RAISE "Título não encontrado"
    valorBaixa = row.saldo_aberto > 0 ? row.saldo_aberto : valorPago

    // 3. Ler saldo banco
    saldoAtual = SELECT MAX(VLSALDO) FROM PCMOVCR WHERE CODBANCO = 1007
    novoSaldo = saldoAtual + valorBaixa

    // 4. Inserir movimento
    INSERT INTO PCMOVCR (...)

    // 5. Baixar título
    affected = UPDATE PCPREST SET DTPAG=... WHERE ... AND DTPAG IS NULL
    SE affected == 0 → RAISE "Título já baixado ou não encontrado"

    // 6. Commit
    COMMIT

    retornar { sucesso: true, rows_updated: 1 }

  CATCH erro:
    ROLLBACK
    RAISE erro

ERROS COMUNS E COMO TRATAR
Erro	Causa	Ação
rowsAffected = 0 no UPDATE PCPREST	Título já baixado, DTPAG já preenchida	ROLLBACK, retornar erro "já baixado"
0 rows no SELECT PCPREST	Duplicata/prestação errada ou não existe	ROLLBACK, retornar erro "não encontrado"
PROXNUMLANC = 0 ou NULL	PCCONSUM não inicializada	ROLLBACK, erro crítico de configuração
Timeout no FOR UPDATE	Outra transação está baixando ao mesmo tempo	Aguardar e retry com backoff
Oracle desabilitado	Ambiente sem conexão Oracle	Usar fallback para store in-memory

REGRAS DE NEGÓCIO CRÍTICAS
Nunca baixar um título com DTPAG já preenchida — sempre incluir AND DTPAG IS NULL no WHERE
CODBANCO = 1007 é fixo para PIX — não inventar outros valores
valorBaixa usa o saldo em aberto (VALOR - VPAGO), não o valor recebido, para evitar sobrepagamento
O NUMTRANS da PCPREST deve ser o mesmo numLanc inserido na PCMOVCR — é o elo entre as duas tabelas
VLSALDO na PCMOVCR deve ser o saldo acumulado correto — use MAX(VLSALDO) para garantir que é o último saldo do banco
Todo o processo é atômico — PCCONSUM + PCMOVCR + PCPREST em uma única transação

Este prompt cobre 100% do processo implementado no sistema Lara para baixa automática via PIX. Siga a sequência exatamente como descrita.
