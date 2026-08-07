-- NullSec — Migration 0001: initial schema (Milestone 7/8)
-- PostgreSQL.

BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id          BIGSERIAL PRIMARY KEY,
  identity_id UUID NOT NULL UNIQUE,                 -- local identity UUID
  status      TEXT NOT NULL DEFAULT 'active',       -- active | disabled
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- recovery_credentials: recovery-key auth data (hash only, never raw key)
CREATE TABLE IF NOT EXISTS recovery_credentials (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recovery_hash TEXT NOT NULL,                      -- argon2 hash of the recovery key
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ
);

-- user_profiles: synchronized profile info
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id     BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username    TEXT NOT NULL DEFAULT 'Anonymous',
  avatar_seed TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- user_settings: synchronizable preferences
CREATE TABLE IF NOT EXISTS user_settings (
  user_id       BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  settings_json JSONB NOT NULL DEFAULT '{}',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- user_progress: synchronization of Progress service
CREATE TABLE IF NOT EXISTS user_progress (
  user_id       BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  progress_json JSONB NOT NULL DEFAULT '{}',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- sessions: stateless token-based auth (token hash only)
CREATE TABLE IF NOT EXISTS sessions (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,                         -- sha256 of the raw token
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_recovery_user_id ON recovery_credentials(user_id);

COMMIT;
