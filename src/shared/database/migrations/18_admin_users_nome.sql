-- Migration 18: nome do admin (para a tela de configuracoes/perfil)
-- Aditiva e idempotente.

ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS nome varchar(255);
