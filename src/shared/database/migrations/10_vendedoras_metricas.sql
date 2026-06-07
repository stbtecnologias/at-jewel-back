-- ============================================================
-- A.T. JEWEL — Migracao 10: vendedoras_metricas (VIEW MATERIALIZADA)
--
-- Materializa as metricas de performance por vendedora previstas na
-- remodelagem S3. Desbloqueia o "desempenho por vendedora" do dashboard
-- gerencial e, futuramente, alimenta o matching da Anastasia (RF06).
--
-- POR QUE MATERIALIZADA (decisao S3 / migracao 04):
--   - Calcular conversao/ticket/recompra em tempo real a cada request
--     do dashboard e custoso (varredura + agregacao da tabela vendas).
--   - Materializar da um snapshot consistente para relatorio.
--   - Refresh DIARIO e suficiente; nao precisamos de tempo real.
--
-- ESCOPO DAS LINHAS AGREGADAS:
--   Agrega SOMENTE vendas com status = 'concluida'.
--     - 'pendente'  = ainda nao fechada, nao conta como performance.
--     - 'cancelada' = preservada para auditoria, mas NAO e receita.
--   E exige vendedora_id NOT NULL (vendas com vendedora desligada via
--   LGPD ON DELETE SET NULL nao tem a quem ser atribuidas).
--
-- METRICAS COMPUTADAS (todas a partir de dados que JA existem):
--   total_vendas                  COUNT(*) de vendas concluidas.
--   receita_total                 SUM(valor_total).
--   ticket_medio                  AVG(valor_total).
--   clientes_distintos            COUNT(DISTINCT cliente_id) (ignora nulos).
--   clientes_recorrentes          clientes com >1 venda concluida com a
--                                 vendedora (subquery por cliente).
--   taxa_recompra                 clientes_recorrentes / clientes_distintos.
--                                 Proporcao em [0,1]. Protegida contra
--                                 divisao por zero (NULLIF -> COALESCE 0).
--   tempo_medio_fechamento_horas  AVG das horas entre data_contato e
--                                 data_venda, SOMENTE em linhas com
--                                 data_contato NAO nula (senao a media
--                                 fica distorcida por linhas sem contato).
--                                 DEPENDE do backfill de data_contato
--                                 (migracao 09: campo [SYS] nullable).
--                                 Enquanto o backfill nao roda, este
--                                 campo vem NULL para a maioria.
--   primeira_venda_em             MIN(data_venda).
--   ultima_venda_em               MAX(data_venda).
--   atualizado_em                 now() no momento do refresh (carimbo do
--                                 snapshot — NAO e dado da venda).
--
-- GAPS — NAO COMPUTADO AGORA (faltam dados; documentado, nao inventado):
--   conversao                     Precisa do denominador de leads/
--                                 atendimentos (agente_eventos / handoffs)
--                                 ainda nao consolidado. Sem total de
--                                 oportunidades nao ha taxa de conversao.
--   giro / permanencia de produto Precisa de saldo e movimentacao de
--                                 estoque + data de aquisicao do produto,
--                                 inexistentes no schema atual.
--   Estas colunas serao adicionadas em migracao futura quando a base
--   existir. NAO criar colunas placeholder vazias agora.
--
-- LGPD / PII:
--   A matview NAO contem PII. Apenas FK vendedora_id (identificador) e
--   agregados numericos (contagens, somas, medias, datas). Nenhum nome,
--   telefone, email ou cliente individual e exposto. cliente_id e usado
--   apenas internamente para COUNT(DISTINCT) e nao aparece como coluna.
--
-- REFRESH:
--   O UNIQUE INDEX abaixo (em vendedora_id) e OBRIGATORIO para permitir
--   REFRESH MATERIALIZED VIEW CONCURRENTLY (Postgres exige um indice
--   unico para o refresh concorrente nao bloquear leituras).
--   O disparo recorrente (diario) sera feito por cron/n8n EXTERNO
--   chamando POST /vendedoras/metricas/refresh (RefreshVendedorasMetricas
--   UseCase). NAO ha cron criado nesta migracao.
--   Primeiro refresh: REFRESH ... CONCURRENTLY falha se a matview nunca
--   foi populada. O CREATE MATERIALIZED VIEW abaixo ja popula (WITH DATA
--   e o default), entao o primeiro REFRESH CONCURRENTLY ja funciona.
-- ============================================================


-- ------------------------------------------------------------
-- VIEW MATERIALIZADA: vendedoras_metricas
-- ------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS vendedoras_metricas AS
WITH vendas_validas AS (
  -- Base unica reutilizada: vendas concluidas com vendedora atribuida.
  SELECT
    v.vendedora_id,
    v.cliente_id,
    v.valor_total,
    v.data_venda,
    v.data_contato
  FROM vendas v
  WHERE v.status = 'concluida'
    AND v.vendedora_id IS NOT NULL
),
recorrencia AS (
  -- Clientes (nao nulos) que compraram mais de uma vez com a vendedora.
  -- Conta 1 por (vendedora, cliente) recorrente para o numerador da
  -- taxa de recompra.
  SELECT
    vendedora_id,
    COUNT(*) AS clientes_recorrentes
  FROM (
    SELECT vendedora_id, cliente_id
    FROM vendas_validas
    WHERE cliente_id IS NOT NULL
    GROUP BY vendedora_id, cliente_id
    HAVING COUNT(*) > 1
  ) r
  GROUP BY vendedora_id
)
SELECT
  vv.vendedora_id                                          AS vendedora_id,
  COUNT(*)                                                 AS total_vendas,
  SUM(vv.valor_total)                                      AS receita_total,
  AVG(vv.valor_total)                                      AS ticket_medio,
  COUNT(DISTINCT vv.cliente_id)                            AS clientes_distintos,
  COALESCE(rec.clientes_recorrentes, 0)                    AS clientes_recorrentes,
  -- Divisao protegida: NULLIF transforma 0 distintos em NULL (evita erro),
  -- COALESCE devolve 0 quando nao ha base para calcular a taxa.
  COALESCE(
    COALESCE(rec.clientes_recorrentes, 0)::numeric
      / NULLIF(COUNT(DISTINCT vv.cliente_id), 0),
    0
  )                                                        AS taxa_recompra,
  -- Media somente sobre linhas com data_contato preenchida. AVG ja ignora
  -- NULL, mas o CASE deixa explicito o filtro e documenta a dependencia.
  AVG(
    CASE
      WHEN vv.data_contato IS NOT NULL
      THEN EXTRACT(EPOCH FROM (vv.data_venda - vv.data_contato)) / 3600.0
      ELSE NULL
    END
  )                                                        AS tempo_medio_fechamento_horas,
  MIN(vv.data_venda)                                       AS primeira_venda_em,
  MAX(vv.data_venda)                                       AS ultima_venda_em,
  now()                                                    AS atualizado_em
FROM vendas_validas vv
LEFT JOIN recorrencia rec ON rec.vendedora_id = vv.vendedora_id
GROUP BY vv.vendedora_id, rec.clientes_recorrentes;


-- UNIQUE INDEX em vendedora_id: requisito do REFRESH ... CONCURRENTLY.
-- Tambem e o lookup de BuscarVendedoraMetricas (GET /vendedoras/:id/metricas).
CREATE UNIQUE INDEX IF NOT EXISTS uq_vendedoras_metricas_vendedora
  ON vendedoras_metricas (vendedora_id);
