-- Migration 15: Defeitos / Devolucoes / Reclamacoes (ocorrencias de produto)
-- Origem: reimplementacao da feature "defects" do backend paralelo (atp),
-- adaptada ao nosso schema. Aditiva — nao altera tabelas existentes.

DO $$ BEGIN
  CREATE TYPE tipo_defeito AS ENUM ('DEFEITO', 'DEVOLUCAO', 'RECLAMACAO');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS defeitos_devolucoes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id    uuid NOT NULL REFERENCES produtos (id) ON DELETE CASCADE,
  tipo          tipo_defeito NOT NULL,
  descricao     text NOT NULL,
  -- Data em que a ocorrencia foi registrada/observada (informada pelo usuario).
  data          timestamptz NOT NULL,
  -- Texto livre com a tratativa/resolucao; NULL enquanto em aberto.
  resolucao     text,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_defeitos_produto ON defeitos_devolucoes (produto_id);
CREATE INDEX IF NOT EXISTS idx_defeitos_tipo ON defeitos_devolucoes (tipo);
CREATE INDEX IF NOT EXISTS idx_defeitos_data ON defeitos_devolucoes (data);
