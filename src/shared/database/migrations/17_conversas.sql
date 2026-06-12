-- Migration 17: Conversas dos agentes internos (Anastasia-analytics / Elena-catalogo)
-- Origem: feature "conversas" do backend paralelo (atp). Persistencia das
-- conversas do painel. Apenas metadados operacionais + ids (sem PII de cliente).
-- Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS conversas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agente        varchar(20) NOT NULL CHECK (agente IN ('anastasia', 'elena')),
  mensagens     jsonb NOT NULL DEFAULT '[]'::jsonb,
  contexto      jsonb,
  cliente_id    uuid REFERENCES clientes (id) ON DELETE SET NULL,
  vendedora_id  uuid REFERENCES vendedoras (id) ON DELETE SET NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conversas_agente ON conversas (agente);
CREATE INDEX IF NOT EXISTS idx_conversas_cliente ON conversas (cliente_id);
CREATE INDEX IF NOT EXISTS idx_conversas_criado ON conversas (criado_em);
