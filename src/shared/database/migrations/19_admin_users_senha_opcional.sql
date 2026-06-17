-- Migration 19: password_hash opcional em admin_users.
-- Permite cadastrar usuarios "so Google" (sem senha): o login por senha fica
-- indisponivel para eles, mas o login via Google funciona (o e-mail so precisa
-- existir como admin). Aditiva e idempotente.

ALTER TABLE admin_users ALTER COLUMN password_hash DROP NOT NULL;
