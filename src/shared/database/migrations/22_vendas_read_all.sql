-- ============================================================
-- A.T. JEWEL — Migracao 22: isolamento de dados por vendedora (RF-USU-02).
--
-- Introduz a permissao 'vendas:read_all' que diferencia "ver todas as vendas /
-- comparar o time" (gestao) de "ver apenas as proprias vendas" (vendedora).
--  - Quem tem vendas:read_all  -> enxerga a carteira inteira + comparativo.
--  - Quem tem so vendas:read   -> e restrito as vendas da PROPRIA vendedora
--    (resolvida por vendedoras.admin_user_id = admin_users.id).
--
-- Tambem cria indice em vendedoras.admin_user_id para o lookup do isolamento.
-- Aditiva/idempotente.
-- ============================================================

-- 1. Concede vendas:read_all aos papeis de gestao (SUPERADMIN ja tem '*').
INSERT INTO role_permissions (role_chave, permissao) VALUES
  ('ADMIN',   'vendas:read_all'),
  ('GERENTE', 'vendas:read_all')
ON CONFLICT DO NOTHING;

-- 2. Indice para resolver a vendedora do usuario logado (isolamento de vendas).
CREATE INDEX IF NOT EXISTS idx_vendedoras_admin_user_id
  ON vendedoras (admin_user_id);
