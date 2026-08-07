-- NullSec — Supabase schema (Milestone 13)
-- Consolidated from previous Postgres migrations (0001–0004).
-- PostgreSQL via Supabase. Privacy-first: hashes only, anonymous aggregates.

BEGIN;

-- users: real account identities
CREATE TABLE IF NOT EXISTS public.users (
  id          BIGSERIAL PRIMARY KEY,
  identity_id UUID NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- recovery_credentials: recovery-key auth data (hash only, never raw key)
CREATE TABLE IF NOT EXISTS public.recovery_credentials (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recovery_hash TEXT NOT NULL,                     -- argon2 hash of the recovery key
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ
);

-- user_profiles
CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id     BIGINT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  username    TEXT NOT NULL DEFAULT 'Anonymous',
  avatar_seed TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- user_settings
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id       BIGINT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  settings_json JSONB NOT NULL DEFAULT '{}',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- user_progress
CREATE TABLE IF NOT EXISTS public.user_progress (
  user_id       BIGINT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  progress_json JSONB NOT NULL DEFAULT '{}',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- sessions: stateless token auth (token hash only)
CREATE TABLE IF NOT EXISTS public.sessions (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,                        -- sha256 of the raw token
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked    BOOLEAN NOT NULL DEFAULT FALSE
);

-- countries: reference
CREATE TABLE IF NOT EXISTS public.countries (
  id                 BIGSERIAL PRIMARY KEY,
  code               TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL DEFAULT '',
  region             TEXT NOT NULL DEFAULT 'Europe',
  active             BOOLEAN NOT NULL DEFAULT FALSE,
  missions_available INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- mission_activity
CREATE TABLE IF NOT EXISTS public.mission_activity (
  id               BIGSERIAL PRIMARY KEY,
  mission_id       TEXT NOT NULL,
  country_code     TEXT NOT NULL REFERENCES public.countries(code) ON DELETE CASCADE,
  completed_count  BIGINT NOT NULL DEFAULT 0 CHECK (completed_count >= 0),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (country_code, mission_id)
);

-- country_activity
CREATE TABLE IF NOT EXISTS public.country_activity (
  id              BIGSERIAL PRIMARY KEY,
  country_code    TEXT NOT NULL UNIQUE,
  completed_count BIGINT NOT NULL DEFAULT 0 CHECK (completed_count >= 0),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- region_activity
CREATE TABLE IF NOT EXISTS public.region_activity (
  id              BIGSERIAL PRIMARY KEY,
  region          TEXT NOT NULL UNIQUE,
  completed_count BIGINT NOT NULL DEFAULT 0 CHECK (completed_count >= 0),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- anonymous_global_stats
CREATE TABLE IF NOT EXISTS public.anonymous_global_stats (
  id                 SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  active_users       BIGINT NOT NULL DEFAULT 0,
  completed_missions BIGINT NOT NULL DEFAULT 0,
  total_completed    BIGINT NOT NULL DEFAULT 0,
  countries_active   INTEGER NOT NULL DEFAULT 0,
  active_regions     INTEGER NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- community_challenges
CREATE TABLE IF NOT EXISTS public.community_challenges (
  id            BIGSERIAL PRIMARY KEY,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  target_value  BIGINT NOT NULL DEFAULT 0,
  current_value BIGINT NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- challenge_progress
CREATE TABLE IF NOT EXISTS public.challenge_progress (
  id                 BIGSERIAL PRIMARY KEY,
  challenge_id       BIGINT NOT NULL REFERENCES public.community_challenges(id) ON DELETE CASCADE,
  country_code       TEXT NOT NULL,
  contribution_count BIGINT NOT NULL DEFAULT 0,
  completion_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, country_code)
);

-- schema_migrations (tracking)
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename   TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON public.sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON public.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_recovery_user_id ON public.recovery_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_mission_activity_country ON public.mission_activity(country_code);
CREATE INDEX IF NOT EXISTS idx_mission_activity_mission ON public.mission_activity(mission_id);
CREATE INDEX IF NOT EXISTS idx_countries_active ON public.countries(active);
CREATE INDEX IF NOT EXISTS idx_country_activity_code ON public.country_activity(country_code);
CREATE INDEX IF NOT EXISTS idx_region_activity_region ON public.region_activity(region);
CREATE INDEX IF NOT EXISTS idx_challenge_progress_challenge ON public.challenge_progress(challenge_id);
CREATE INDEX IF NOT EXISTS idx_challenges_status ON public.community_challenges(status);

-- Seed global stats row
INSERT INTO public.anonymous_global_stats (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Seed European countries
INSERT INTO public.countries (code, name, region, active, missions_available) VALUES
  ('FR','France','Europe',TRUE,25),('DE','Germany','Europe',TRUE,25),('GB','United Kingdom','Europe',TRUE,25),
  ('ES','Spain','Europe',TRUE,25),('IT','Italy','Europe',TRUE,25),('NL','Netherlands','Europe',TRUE,25),
  ('BE','Belgium','Europe',TRUE,25),('CH','Switzerland','Europe',TRUE,25),('AT','Austria','Europe',TRUE,25),
  ('PT','Portugal','Europe',TRUE,25),('SE','Sweden','Europe',TRUE,25),('NO','Norway','Europe',TRUE,25),
  ('DK','Denmark','Europe',TRUE,25),('FI','Finland','Europe',TRUE,25),('IE','Ireland','Europe',TRUE,25),
  ('PL','Poland','Europe',TRUE,25),('CZ','Czechia','Europe',TRUE,25),('SK','Slovakia','Europe',TRUE,25),
  ('HU','Hungary','Europe',TRUE,25),('RO','Romania','Europe',TRUE,25),('BG','Bulgaria','Europe',TRUE,25),
  ('GR','Greece','Europe',TRUE,25),('HR','Croatia','Europe',TRUE,25),('SI','Slovenia','Europe',TRUE,25),
  ('EE','Estonia','Europe',TRUE,25),('LV','Latvia','Europe',TRUE,25),('LT','Lithuania','Europe',TRUE,25)
ON CONFLICT (code) DO NOTHING;

-- Seed challenges
INSERT INTO public.community_challenges (title, description, target_value, current_value, status) VALUES
  ('Europe Mission Week','Complete missions across Europe together this week.',10000,0,'active'),
  ('10000 missions worldwide','Reach 10000 completed missions as a global community.',10000,0,'active'),
  ('Activate 5 new countries','Bring activity to 5 new countries.',5,0,'active')
ON CONFLICT DO NOTHING;

COMMIT;
