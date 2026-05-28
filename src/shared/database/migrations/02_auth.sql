CREATE TABLE IF NOT EXISTS admin_users (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email               VARCHAR(255) NOT NULL UNIQUE,
  password_hash       VARCHAR(255) NOT NULL,
  refresh_token_hash  VARCHAR(64),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(255) NOT NULL,
  key_prefix      VARCHAR(12)  NOT NULL,
  key_hash        VARCHAR(64)  NOT NULL UNIQUE,
  permissions     JSONB        NOT NULL DEFAULT '{}',
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  last_used_at    TIMESTAMPTZ,
  created_by_id   UUID         NOT NULL REFERENCES admin_users(id),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  revoked_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash  ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);
