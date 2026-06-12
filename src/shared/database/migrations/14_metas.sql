-- Migration 14: Metas (objetivos de venda)
-- Origem: reimplementacao da feature "metas/goals" do backend paralelo (atp),
-- adaptada ao nosso schema. Aditiva — nao altera tabelas existentes.

DO $$ BEGIN
  CREATE TYPE tipo_meta AS ENUM ('GLOBAL', 'POR_PRODUTO', 'POR_VENDEDORA', 'POR_CLIENTE');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS metas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo          tipo_meta NOT NULL,
  -- ID do alvo quando a meta e especifica (vendedora_id, produto_id, cliente_id).
  -- NULL para tipo GLOBAL.
  referencia_id uuid,
  valor_alvo    numeric(15, 2) NOT NULL CHECK (valor_alvo >= 0),
  prazo         timestamptz NOT NULL,
  descricao     text,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_metas_tipo ON metas (tipo);
CREATE INDEX IF NOT EXISTS idx_metas_referencia ON metas (referencia_id);
CREATE INDEX IF NOT EXISTS idx_metas_prazo ON metas (prazo);
