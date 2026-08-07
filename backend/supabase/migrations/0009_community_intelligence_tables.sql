-- NullSec — Community Intelligence Layer: prepared tables (Milestone 20)
-- ------------------------------------------------------------------
-- PREPARATION ONLY — these tables model FUTURE collection. They are NOT
-- written by any current RPC and are NOT populated. No deployment is implied.
--
-- Purpose: support the community intelligence dashboard once real collection
-- is added. Two future tables are prepared here (tool_activity already exists
-- via 0007):
--   1. country_membership    — explicit user→country membership.
--   2. community_propagation — aggregated community propagation by country.
--
-- Privacy implications:
--   - country_membership stores only (user_id, country_code, created_at). The
--     country is the user's EXPLICIT choice (ISO-3166 alpha-2), never inferred
--     from IP/GPS/locale/device. It is never exposed per-user publicly — only
--     aggregated participant counts.
--   - community_propagation is a pure AGGREGATE (country, count). It stores NO
--     identity, NO graph of who-invited-whom, NO individual timestamps. It must
--     represent an aggregated propagation action, never an individual social
--     graph.
--   - Both are NOT personal data stores. anon may only ever read aggregates.

BEGIN;

-- 1. country_membership: explicit user-selected country.
CREATE TABLE IF NOT EXISTS public.country_membership (
  user_id     BIGINT PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  country_code TEXT NOT NULL REFERENCES public.countries(code) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT country_membership_country_check CHECK (country_code ~ '^[A-Z]{2}$')
);

CREATE INDEX IF NOT EXISTS idx_country_membership_country ON public.country_membership(country_code);

-- RLS: private per-user membership. anon/authenticated have NO direct access;
-- only SECURITY DEFINER RPCs may read/write it (aggregated downstream).
ALTER TABLE public.country_membership ENABLE ROW LEVEL SECURITY;

-- 2. community_propagation: aggregated propagation by country.
CREATE TABLE IF NOT EXISTS public.community_propagation (
  id                BIGSERIAL PRIMARY KEY,
  country_code      TEXT NOT NULL REFERENCES public.countries(code) ON DELETE CASCADE,
  propagation_count BIGINT NOT NULL DEFAULT 0 CHECK (propagation_count >= 0),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (country_code)
);

CREATE INDEX IF NOT EXISTS idx_community_propagation_country ON public.community_propagation(country_code);

-- RLS: public aggregate — anon may SELECT only; writes go through SECURITY
-- DEFINER RPCs (future). Never direct anon writes.
ALTER TABLE public.community_propagation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_agg_select" ON public.community_propagation;
CREATE POLICY "public_agg_select" ON public.community_propagation
  FOR SELECT USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.community_propagation
  FROM anon, authenticated;

-- No public RLS policy on country_membership at all → anon denied by default.

COMMIT;
