-- Migration 16: Reconciliacao aditiva com o backend paralelo (atp)
-- Adiciona campos que o atp tinha e o nosso schema ainda nao: controle de
-- estoque no produto e demografia no perfil do cliente. Usados pelos KPIs
-- de inventario/giro e pela analise demografica. Tudo aditivo e idempotente.

-- 1) Estoque no produto (fonte da verdade ainda e o ERP; aqui materializamos
--    o snapshot para consultas e KPIs sem ida ao Safira).
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS estoque_atual integer NOT NULL DEFAULT 0;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS data_entrada_estoque timestamptz;

-- 2) Demografia no perfil do cliente (para a analise demografica). Baixa
--    sensibilidade e necessaria para agregacao — colunas em claro (nao cifradas).
DO $$ BEGIN
  CREATE TYPE sexo_cliente AS ENUM ('M', 'F', 'OUTRO', 'NAO_INFORMADO');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

ALTER TABLE clientes_perfil ADD COLUMN IF NOT EXISTS sexo sexo_cliente;
ALTER TABLE clientes_perfil ADD COLUMN IF NOT EXISTS faixa_etaria varchar(20);

CREATE INDEX IF NOT EXISTS idx_perfil_sexo ON clientes_perfil (sexo);
CREATE INDEX IF NOT EXISTS idx_perfil_faixa_etaria ON clientes_perfil (faixa_etaria);
