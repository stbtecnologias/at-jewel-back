-- Migration 20: prompts (system prompt) configuraveis das agentes (RF-USU-03).
-- Override opcional por agente; sem linha => usa o padrao definido no codigo
-- (personas.ts). Aditiva e idempotente.

CREATE TABLE IF NOT EXISTS agente_prompts (
  agente          varchar(40) PRIMARY KEY,
  system_prompt   text NOT NULL,
  atualizado_por  uuid,
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);
