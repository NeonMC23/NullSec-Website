-- NullSec — Country metrics data model (Milestone 20)
-- ------------------------------------------------------------------
-- Adds the minimal data model to eventually calculate:
--   participants  : COUNT of DISTINCT users whose profile has a country
--   toolActivity  : aggregated tool usage by country (no individual history)
--   propagation   : NOT modelled yet — documented as unavailable (null)
--
-- participants — country is an EXPLICIT user-selected profile field
-- (user_profiles.country_code, ISO-3166 alpha-2). It is NEVER inferred from
-- IP, GPS, browser locale, timezone or device location. Privacy: it lives on
-- the private user_profiles table (no anon access; read only via SECURITY
-- DEFINER RPCs) and is aggregated by country, never exposed per-user.
--
-- tool_activity — an AGGREGATE counter table (country, tool) only. It stores
-- NO individual identity, NO timestamps per user, NO detailed behaviour log.
-- Writes happen only via the authenticated RPC ns_tool_activity (country
-- derived server-side from the user's profile, never client-chosen).

BEGIN;

-- 1. user_selected country on the private profile (ISO-3166 alpha-2).
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS country_code TEXT;

-- A lightweight CHECK so bad/malformed values cannot be stored. Full ISO
-- validation (2 uppercase letters) is enforced in the RPCs; the CHECK rejects
-- non-empty values that are not exactly 2 uppercase ASCII letters.
ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_country_code_check;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_country_code_check
  CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$');

-- 2. Aggregate tool activity by country (no individual history).
CREATE TABLE IF NOT EXISTS public.tool_activity (
  id             BIGSERIAL PRIMARY KEY,
  tool_id        TEXT NOT NULL,
  country_code   TEXT NOT NULL REFERENCES public.countries(code) ON DELETE CASCADE,
  activity_count BIGINT NOT NULL DEFAULT 0 CHECK (activity_count >= 0),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (country_code, tool_id)
);

CREATE INDEX IF NOT EXISTS idx_tool_activity_country ON public.tool_activity(country_code);
CREATE INDEX IF NOT EXISTS idx_tool_activity_tool   ON public.tool_activity(tool_id);

-- 3. RLS: tool_activity is a public AGGREGATE — anon may SELECT only, never
-- INSERT/UPDATE/DELETE (writes go through the SECURITY DEFINER RPC).
ALTER TABLE public.tool_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_agg_select" ON public.tool_activity;
CREATE POLICY "public_agg_select" ON public.tool_activity
  FOR SELECT USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.tool_activity
  FROM anon, authenticated;

COMMIT;
