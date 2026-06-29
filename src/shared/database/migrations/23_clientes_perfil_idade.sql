-- ============================================================
-- A.T. JEWEL — Migracao 23: Idade exata no perfil do cliente
--
-- Contexto:
--   As telas administrativas precisam filtrar clientes por idade minima/maxima
--   livres (intervalo continuo), e nao apenas pelos baldes discretos de
--   faixa_etaria. Esta coluna armazena a idade EXATA do cliente.
--
-- Modelagem:
--   idade e um SMALLINT em texto puro (claro, nao cifrado), de baixa
--   sensibilidade, no mesmo nivel de faixa_etaria/sexo que ja sao colunas
--   planas. NAO armazenamos data_nascimento (PII evitada por design — a
--   migration 03 ja optou por nao guardar dados pessoais identificaveis alem
--   do necessario). faixa_etaria (balde) CONTINUA existindo e e usada nos
--   graficos; idade serve apenas para o filtro de min/max.
--
-- LGPD:
--   Idade isolada nao identifica o titular nem revela conteudo de conversa.
--   Baixa sensibilidade, coluna em claro. Necessaria para o caso de uso
--   operacional de filtragem demografica nas telas de gestao.
--
-- Backfill:
--   Para registros legados (idade NULL) deriva-se uma idade aproximada a
--   partir do ponto medio do balde de faixa_etaria. E uma estimativa para
--   nao deixar os registros antigos invisiveis ao novo filtro; novos
--   registros recebem a idade exata coletada pela Anastasia.
--
-- Aditivo e idempotente. Nao altera dados ja preenchidos.
-- ============================================================

ALTER TABLE clientes_perfil ADD COLUMN IF NOT EXISTS idade SMALLINT;

DO $$ BEGIN
  ALTER TABLE clientes_perfil
    ADD CONSTRAINT chk_perfil_idade CHECK (idade IS NULL OR (idade BETWEEN 0 AND 120));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_perfil_idade ON clientes_perfil (idade);

-- Backfill derivado do balde (ponto medio), apenas onde idade ainda esta NULL.
UPDATE clientes_perfil
SET idade = CASE faixa_etaria
  WHEN '18-24' THEN 21
  WHEN '25-34' THEN 30
  WHEN '35-44' THEN 40
  WHEN '45-54' THEN 50
  WHEN '55+' THEN 60
  ELSE NULL
END
WHERE idade IS NULL AND faixa_etaria IS NOT NULL;
