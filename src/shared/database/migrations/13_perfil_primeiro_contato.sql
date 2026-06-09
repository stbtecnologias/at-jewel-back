-- ============================================================
-- A.T. JEWEL — Migracao 13: Marcador de primeiro contato (parada do SLA)
--
-- Contexto:
--   O SLA de "primeiro contato" mede quanto tempo a vendedora leva para
--   abordar o cliente DEPOIS do handoff (transicao para IN_HUMAN_SERVICE).
--   A Sofia (agente gerencial de monitoramento via n8n) lista os clientes
--   nos estados monitorados e compara estado_atualizado_em com o SLA.
--
-- Problema que esta coluna resolve:
--   IN_HUMAN_SERVICE e estado terminal do fluxo do agente — o cliente nunca
--   sai dele sozinho. Sem um marcador de "a vendedora ja fez o primeiro
--   contato", o cronometro do SLA jamais para e a Sofia alertaria para
--   sempre sobre o mesmo cliente, mesmo apos atendido.
--
-- Semantica:
--   primeiro_contato_em = timestamp em que a vendedora fez o primeiro contato
--   com o cliente apos o handoff. Encerra (para) o cronometro do SLA de
--   primeiro contato. NULL = ainda nao contatado (relogio rodando).
--
-- LGPD:
--   Apenas um timestamp operacional. NAO e PII (nao identifica o titular,
--   nao revela conteudo de conversa). Nao requer criptografia.
--
-- Nao altera dados existentes; apenas adiciona coluna NULL. Idempotente.
-- ============================================================

ALTER TABLE clientes_perfil
  ADD COLUMN IF NOT EXISTS primeiro_contato_em TIMESTAMPTZ NULL;
