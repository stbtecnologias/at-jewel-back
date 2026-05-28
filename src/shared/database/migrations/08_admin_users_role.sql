-- ============================================================
-- A.T. JEWEL — Migracao 08: RBAC em admin_users
--
-- Atende P1.1 do relatorio de seguranca: matriz de permissoes
-- por perfil (ADMIN/GERENTE/VENDEDORA).
--
-- Roles:
--   ADMIN     — acesso total ao painel + gestao de api keys e usuarios
--   GERENTE   — leitura/escrita de operacao (clientes, vendedoras, vendas);
--               nao gere api keys nem admins
--   VENDEDORA — leitura restrita a seus proprios clientes; sem campos de
--               margem/custo de produto, sem limites de credito
--
-- Decisao: default 'ADMIN' para rows existentes nao quebrarem o login.
-- Quem precisar trocar o role do usuario inicial faz UPDATE manual.
-- ============================================================

CREATE TYPE perfil_admin AS ENUM ('ADMIN', 'GERENTE', 'VENDEDORA');

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS role perfil_admin NOT NULL DEFAULT 'ADMIN';

-- Indice em role facilita filtragem em listagens administrativas.
CREATE INDEX IF NOT EXISTS idx_admin_users_role ON admin_users(role);
