-- ============================================================
-- A.T. JEWEL — Migracao 06: Extensoes em clientes_perfil
--
-- Adiciona campos identificados como gaps na validacao contra
-- os requisitos (S3 - VALIDACAO DA REMODELAGEM CONTRA REQUISITOS):
--
--   1. tags TEXT[]              — gap G4 (classificacao por tags)
--   2. score_perfil SMALLINT    — gap G4 (score de qualificacao)
--   3. motivacao_compra ENUM    — divergencia D1 (motivacao alem
--                                 de pessoal/presente)
--
-- O campo `tipo_compra` existente continua: representa "para quem"
-- (pessoal/presente). `motivacao_compra` representa "por que"
-- (uso proprio, presente, status, investimento) conforme listado
-- no PDF "Definicao das Funcoes na Operacao - Agente de IA".
-- Os dois sao complementares — a aplicacao garante consistencia
-- (se motivacao = 'presente', tipo deve ser 'presente').
-- ============================================================


-- ------------------------------------------------------------
-- ENUM da motivacao de compra.
-- Valores extraidos diretamente do PDF "Definicao das Funcoes
-- na Operacao": uso proprio, presente, status, investimento.
-- ------------------------------------------------------------
CREATE TYPE motivacao_compra AS ENUM (
  'uso_proprio',   -- cliente compra para usar
  'presente',      -- cliente compra para presentear terceiro
  'status',        -- compra como simbolo de status/conquista
  'investimento'   -- compra como reserva de valor / investimento
);


-- ------------------------------------------------------------
-- Adiciona os tres campos novos.
-- Todos sao opcionais — a Anastasia preenche conforme a triagem
-- avanca, e clientes sincronizados do ERP sem triagem ficam null.
-- Nenhum precisa de cifragem: sao classificacoes internas
-- (tags, score) ou ENUM tipado (motivacao) — sem PII direta.
-- ------------------------------------------------------------

ALTER TABLE clientes_perfil
  -- [SYS] Tags livres para classificacao interna do cliente.
  -- Atende RF05 (classificacao do cliente — tags/score/eixos).
  -- Exemplos esperados pela Anastasia: 'presente-natal', 'ouro-18k',
  -- 'ate-2000', 'noivado', 'fiel-coleção-x', 'sazonal-dia-das-maes'.
  -- Array TEXT permite crescer organicamente conforme a IA aprende.
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',

  -- [SYS] Score de qualificacao do cliente (0 a 100).
  -- Calculado pela Anastasia a partir do cruzamento de:
  -- ticket estimado, urgencia, nivel de conhecimento, historico.
  -- Usado no algoritmo de matching e em relatorios de perfil.
  -- Nullable: clientes ainda em triagem podem nao ter score ainda.
  ADD COLUMN IF NOT EXISTS score_perfil SMALLINT
    CHECK (score_perfil IS NULL OR (score_perfil >= 0 AND score_perfil <= 100)),

  -- [SYS] Motivacao da compra. Complementa `tipo_compra`:
  --   - tipo_compra responde "para quem?" (pessoal | presente)
  --   - motivacao_compra responde "por que?" (4 valores)
  -- Use case valida coerencia: motivacao='presente' implica tipo='presente'.
  ADD COLUMN IF NOT EXISTS motivacao_compra motivacao_compra;


-- ------------------------------------------------------------
-- Indices auxiliares.
-- ------------------------------------------------------------

-- GIN em tags para queries "todos os clientes com tag X".
-- Ex: SELECT * FROM clientes_perfil WHERE tags @> ARRAY['presente-natal'];
-- Indice GIN e o adequado para arrays em Postgres.
CREATE INDEX IF NOT EXISTS idx_perfil_tags
  ON clientes_perfil USING GIN (tags);

-- Indice em score_perfil para relatorios e segmentacao por
-- faixa de score (ex: "clientes premium com score > 80").
CREATE INDEX IF NOT EXISTS idx_perfil_score
  ON clientes_perfil(score_perfil DESC)
  WHERE score_perfil IS NOT NULL;
