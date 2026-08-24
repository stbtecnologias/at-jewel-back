-- ============================================================
-- A.T. JEWEL — Migracao 38: leitura de auditoria dos atendimentos
--
-- POR QUE: a migracao 35 criou `atendimentos` e `atendimento_interacoes` e
-- desde 19/08 elas guardam o episodio inteiro — quem atendeu quem, o que ficou
-- combinado, o lembrete, a cobranca, o relato e o desfecho. NINGUEM NUNCA LEU.
-- Nao ha rota, nao ha tela: hoje a unica forma de saber se a vendedora falou
-- com a cliente e perguntar a ela.
--
-- Esta migracao NAO cria tabela nem coluna. Ela faz duas coisas:
--   1. uma VIEW que calcula a ETAPA de cada atendimento
--   2. a permissao de leitura dessa auditoria
--
-- ------------------------------------------------------------
-- POR QUE UMA VIEW, E NAO UMA COLUNA `etapa`
--
-- A etapa JA ESTA no banco — ela e consequencia do que aconteceu, nao um
-- estado a parte que alguem precise manter. Uma coluna seria um segundo lugar
-- onde a verdade mora, e o dia em que os dois divergissem ninguem saberia qual
-- esta certo.
--
-- A view existe para a regra morar em UM lugar. Se ela fosse reescrita dentro
-- da consulta da tela, passaria a existir em dois — e a regra e sutil o
-- bastante para nao sobreviver a isso (ver a nota da retomada, abaixo).
--
-- Se o volume crescer a ponto de doer, esta mesma view vira MATERIALIZED sem
-- que a tela precise saber.
--
-- ------------------------------------------------------------
-- A REGRA DA ETAPA, EM ORDEM
--
--   CONCLUIDO         fechado com desfecho VENDA
--   NAO_AVANCOU       fechado com SEM_VENDA ou INATIVIDADE
--   REMARCADO         o ultimo acontecimento foi um REAGENDAMENTO
--   SEM_CONTATO       ha RELATO, mas existe RETOMADA em aberto
--   EM_NEGOCIACAO     ha RELATO e nenhuma retomada pendente
--   PRIMEIRO_CONTATO  ainda nao houve RELATO nenhum
--
-- COMO SE RECONHECE UMA RETOMADA (a parte sutil):
--   Quando a vendedora responde "liguei e ninguem atendeu", o sistema agenda
--   uma COBRANCA nova para 48h depois — e ela nasce SEM `combinado_em`, porque
--   nao houve nada combinado com a cliente. Toda cobranca normal vem de um
--   horario combinado. Entao:
--
--       COBRANCA com combinado_em NULL  ==  retomada
--
--   Isso ja era verdade no codigo desde 20/08 (ProcessarRelatoVendedoraUseCase,
--   `agendarRetomada`), e esta view apenas passa a depender disso
--   explicitamente. QUEM UM DIA CRIAR UMA COBRANCA SEM HORARIO POR OUTRO
--   MOTIVO muda o significado de todas as etapas — o lugar de olhar e aqui.
--
-- DESEMPATE: RELATO e REAGENDAMENTO nascem no mesmo instante quando a cliente
-- remarca (os dois com `ocorrido_em = now()`). Ordenar so por tempo daria
-- resultado sorteado, entao o REAGENDAMENTO ganha no empate: ele e o fato
-- posterior.
--
-- Aditiva e idempotente: CREATE OR REPLACE VIEW e INSERT ... ON CONFLICT.
-- ============================================================

CREATE OR REPLACE VIEW vw_atendimentos_auditoria AS
SELECT
  a.id,
  a.cliente_id,
  a.vendedora_id,
  a.ocasiao,
  a.aberto_em,
  a.fechado_em,
  a.desfecho,

  CASE
    WHEN a.desfecho = 'VENDA'                        THEN 'CONCLUIDO'
    WHEN a.desfecho IN ('SEM_VENDA', 'INATIVIDADE')  THEN 'NAO_AVANCOU'
    WHEN ultimo.tipo = 'REAGENDAMENTO'               THEN 'REMARCADO'
    WHEN retomada.aberta                             THEN 'SEM_CONTATO'
    WHEN ultimo.tipo IS NOT NULL                     THEN 'EM_NEGOCIACAO'
    ELSE 'PRIMEIRO_CONTATO'
  END AS etapa,

  -- Quando alguma coisa aconteceu neste atendimento pela ultima vez. E o que
  -- alimenta o "ultimo registro ha 8 min" e o corte de "parado ha dias".
  atividade.ultima_em AS ultima_atividade_em,

  -- A FILA DO QUE ESTA DEVENDO. Sao estes tres campos, e nao a etapa, que
  -- respondem "quem nao respondeu" — a pergunta que se faz as 8h da manha.
  COALESCE(pendencia.aguardando, false) AS aguardando_relato,
  COALESCE(pendencia.expiradas, 0)      AS interacoes_expiradas,
  COALESCE(retomada.total, 0)           AS retomadas,

  -- Proximo compromisso com a CLIENTE (`combinado_em`), nao o proximo disparo
  -- nosso (`notificar_em`). A agenda e feita do que foi combinado.
  proximo.combinado_em AS proximo_contato_em

FROM atendimentos a

-- O ultimo acontecimento que descreve o estado do episodio. LEMBRETE e
-- COBRANCA ficam de fora de proposito: sao acoes NOSSAS, e disparar um
-- lembrete nao muda em que pe esta a negociacao.
LEFT JOIN LATERAL (
  SELECT i.tipo
  FROM atendimento_interacoes i
  WHERE i.atendimento_id = a.id
    AND i.tipo IN ('RELATO', 'REAGENDAMENTO')
  ORDER BY
    i.ocorrido_em DESC NULLS LAST,
    i.criado_em DESC,
    (i.tipo = 'REAGENDAMENTO') DESC
  LIMIT 1
) ultimo ON true

LEFT JOIN LATERAL (
  SELECT
    COUNT(*) AS total,
    BOOL_OR(i.status IN ('PENDENTE', 'ENVIADA', 'AGUARDANDO_RESPOSTA')) AS aberta
  FROM atendimento_interacoes i
  WHERE i.atendimento_id = a.id
    AND i.tipo = 'COBRANCA'
    AND i.combinado_em IS NULL
) retomada ON true

LEFT JOIN LATERAL (
  SELECT
    BOOL_OR(i.status = 'AGUARDANDO_RESPOSTA') AS aguardando,
    COUNT(*) FILTER (WHERE i.status = 'EXPIRADA') AS expiradas
  FROM atendimento_interacoes i
  WHERE i.atendimento_id = a.id
) pendencia ON true

LEFT JOIN LATERAL (
  SELECT MAX(COALESCE(i.ocorrido_em, i.criado_em)) AS ultima_em
  FROM atendimento_interacoes i
  WHERE i.atendimento_id = a.id
) atividade ON true

LEFT JOIN LATERAL (
  SELECT i.combinado_em
  FROM atendimento_interacoes i
  WHERE i.atendimento_id = a.id
    AND i.combinado_em IS NOT NULL
    AND i.combinado_em > now()
    AND i.status IN ('PENDENTE', 'ENVIADA')
  ORDER BY i.combinado_em ASC
  LIMIT 1
) proximo ON true;

COMMENT ON VIEW vw_atendimentos_auditoria IS
  'Atendimentos com a ETAPA derivada da linha do tempo. A etapa nao e armazenada: ela e consequencia das interacoes, e guarda-la criaria um segundo lugar onde a verdade mora. Ver o cabecalho da migracao 38 para a regra e para a nota da retomada (COBRANCA sem combinado_em).';

-- ------------------------------------------------------------
-- Permissao
-- ------------------------------------------------------------
-- SO GESTAO. O `relato` e a frase da vendedora sobre a vida da cliente —
-- "esta se separando", "o marido nao pode saber do valor" — e por isso a
-- coluna e cifrada. A rota devolve decifrado, entao quem alcanca a rota le
-- isso.
--
-- VENDEDORA NAO RECEBE, e nao e esquecimento: esta e a tela de auditoria da
-- EQUIPE. Ela ja tem a propria agenda pelo canal interno, com escopo que nao
-- alcanca a de ninguem mais. Dar `atendimentos:read` a ela abriria pelo painel
-- exatamente o que o canal fecha por ausencia de caminho.
--
-- Mesmo criterio de `vendas:read_all`: um so, para o painel e para o WhatsApp.
INSERT INTO role_permissions (role_chave, permissao) VALUES
  ('ADMIN',   'atendimentos:read'),
  ('GERENTE', 'atendimentos:read')
ON CONFLICT DO NOTHING;
