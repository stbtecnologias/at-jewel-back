-- ============================================================
-- A.T. JEWEL — Migracao 07: Expiracao de Refresh Token
--
-- Atende:
--   - P1.3 (relatorio de seguranca): refresh tokens devem expirar
--   - 1.1.6: rotacao de refresh token a cada uso
--   - 1.1.7: refresh token sem expiracao no banco
--
-- Decisao: armazenar o timestamp de expiracao do refresh token
-- corrente. A rotacao (gerar novo a cada refresh) e implementada
-- na camada de aplicacao (RefreshTokenUseCase).
--
-- TTL adotado: 7 dias. Apos isso o usuario precisa fazer login novamente.
-- ============================================================

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS refresh_token_expires_at TIMESTAMPTZ;

-- Indice para limpeza eventual de tokens expirados (job de manutencao).
CREATE INDEX IF NOT EXISTS idx_admin_users_refresh_expires
  ON admin_users(refresh_token_expires_at)
  WHERE refresh_token_expires_at IS NOT NULL;
