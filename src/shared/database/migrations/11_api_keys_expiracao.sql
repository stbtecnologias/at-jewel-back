-- ============================================================
-- A.T. JEWEL — Migracao 11: Expiracao de API Keys
--
-- Atende:
--   - M-002 (revisao anti-prompt-injection): API keys do agente devem poder
--     expirar. Chave de longa vida e alvo de roubo; expiracao limita a janela
--     de abuso se a chave vazar (defesa complementar a scope minimo e
--     rate limit).
--
-- Decisao: coluna expires_at NULLABLE.
--   - NULL  => chave NAO expira (comportamento legado preservado; chaves ja
--              emitidas continuam validas sem migracao de dados).
--   - valor => chave invalida apos esse instante (verificado no ApiKeyGuard
--              comparando com now()).
--
-- A verificacao de expiracao acontece na camada de aplicacao (ApiKeyGuard +
-- ValidarApiKeyUseCase). O banco apenas armazena o timestamp.
-- ============================================================

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Indice parcial para eventual limpeza/auditoria de chaves expiradas.
CREATE INDEX IF NOT EXISTS idx_api_keys_expires_at
  ON api_keys(expires_at)
  WHERE expires_at IS NOT NULL;
