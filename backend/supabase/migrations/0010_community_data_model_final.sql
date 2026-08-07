-- NullSec — Community Intelligence Data Model finalization (Milestone 21)
-- ------------------------------------------------------------------
-- PREPARATION / DRAFT ONLY. These are the FINALIZED schema proposals for the
-- community intelligence data model. They are NOT populated and NOT deployed
-- (no real Supabase project). No implementation is implied.
--
-- Finalizes:
--   1. country_membership  — complete user-country model (id, updated_at,
--                            one active country per user).
--   2. tool_activity       — reaffirmed aggregate (unchanged from 0007).
--   3. community_propagation — with propagation_type (M21).
--
-- Privacy: country is the user's EXPLICIT choice (ISO-3166 alpha-2), never
-- inferred from IP/GPS/locale/device. No public user→country lookup; only
-- aggregated queries may expose country statistics. Never expose username,
-- identity_id, IP, GPS, device info, or individual activity history.

BEGIN;

-- ------------------------------------------------------------------
-- 1. country_membership — complete user-country model
-- ------------------------------------------------------------------
-- Upgrade the prepared table to carry an `id` and `updated_at`. One active
-- country per user (user_id UNIQUE). Country code is ISO-3166 alpha-2.
-- Private: anon/authenticated have NO direct access. Only SECURITY DEFINER
-- RPCs (future: ns_set_country) may read/write, and only aggregated counts
-- are exposed downstream.
ALTER TABLE public.country_membership
  ADD COLUMN IF NOT EXISTS id BIGSERIAL;
ALTER TABLE public.country_membership
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- One active country per user (enforced by the existing user_id PK/UNIQUE).
-- Re-declare the PK on `id` for a stable surrogate key while keeping
-- user_id UNIQUE for the "one country per user" rule.
--
-- IDEMPOTENCY FIX (deployment 42P07): `ADD CONSTRAINT ... UNIQUE (user_id)`
-- creates a unique index named `country_membership_user_unique`. If a prior
-- run already created it (e.g. 0010 was partially applied and a later step
-- failed), re-adding the same constraint fails with
--  42P07: relation "country_membership_user_unique" already exists.
-- DROP ... IF EXISTS before each ADD makes the transition safe on:
--   - a FRESH database  (0001–0009 then 0010),
--   - the CURRENT database (0001–0009 applied, user_unique absent),
--   - a RE-RUN of 0010 (user_unique present).
-- The dependency graph was verified: no view/RPC/index depends on
-- country_membership_pkey or country_membership_user_unique, so dropping and
-- re-creating them is safe.
ALTER TABLE public.country_membership
  DROP CONSTRAINT IF EXISTS country_membership_user_unique;
ALTER TABLE public.country_membership
  DROP CONSTRAINT IF EXISTS country_membership_pkey;
ALTER TABLE public.country_membership
  ADD CONSTRAINT country_membership_pkey PRIMARY KEY (id);
ALTER TABLE public.country_membership
  ADD CONSTRAINT country_membership_user_unique UNIQUE (user_id);

CREATE INDEX IF NOT EXISTS idx_country_membership_country_code
  ON public.country_membership(country_code);

-- ------------------------------------------------------------------
-- 2. tool_activity — reaffirmed aggregate (from 0007)
-- ------------------------------------------------------------------
-- id, country_code, tool_id, usage_count, updated_at. Aggregated only; no
-- individual user history. Indexed for country ranking. RLS: anon SELECT only.
-- (Already created in 0007; reaffirmed here for completeness.)
--   CREATE TABLE IF NOT EXISTS public.tool_activity (
--     id             BIGSERIAL PRIMARY KEY,
--     tool_id        TEXT NOT NULL,
--     country_code   TEXT NOT NULL REFERENCES public.countries(code) ON DELETE CASCADE,
--     activity_count BIGINT NOT NULL DEFAULT 0 CHECK (activity_count >= 0),
--     updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
--     UNIQUE (country_code, tool_id)
--   );
CREATE INDEX IF NOT EXISTS idx_tool_activity_country ON public.tool_activity(country_code);

-- ------------------------------------------------------------------
-- 3. community_propagation — with propagation_type (M21)
-- ------------------------------------------------------------------
-- Aggregated propagation by country and TYPE. propagation_type is a
-- controlled vocabulary of community/manual propagation actions (e.g.
-- 'campaign_participation', 'resource_share', 'public_contribution'). It
-- NEVER represents an individual social graph or "X invited Y". Counts are
-- aggregated counters only; no individual tracking.
ALTER TABLE public.community_propagation
  ADD COLUMN IF NOT EXISTS propagation_type TEXT NOT NULL DEFAULT 'campaign_participation';
ALTER TABLE public.community_propagation
  ADD COLUMN IF NOT EXISTS propagation_count BIGINT NOT NULL DEFAULT 0;

-- One aggregate row per (country, propagation_type).
DROP INDEX IF EXISTS idx_community_propagation_country;
CREATE INDEX IF NOT EXISTS idx_community_propagation_country_type
  ON public.community_propagation(country_code, propagation_type);

-- Replace the old UNIQUE(country_code) with UNIQUE(country_code, propagation_type).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'community_propagation_country_code_key'
  ) THEN
    ALTER TABLE public.community_propagation DROP CONSTRAINT community_propagation_country_code_key;
  END IF;
END $$;
-- Same idempotency guard as country_membership above: DROP the target unique
-- constraint (if a prior partial run left it behind) before re-adding it, to
-- avoid 42P07 "relation ... already exists" on a re-deploy.
ALTER TABLE public.community_propagation
  DROP CONSTRAINT IF EXISTS community_propagation_country_type_unique;
ALTER TABLE public.community_propagation
  ADD CONSTRAINT community_propagation_country_type_unique UNIQUE (country_code, propagation_type);

-- Ensure the aggregate counter cannot go negative.
ALTER TABLE public.community_propagation
  DROP CONSTRAINT IF EXISTS community_propagation_count_check;
ALTER TABLE public.community_propagation
  ADD CONSTRAINT community_propagation_count_check CHECK (propagation_count >= 0);

-- RLS reaffirmed: anon SELECT only on the aggregate; writes via SECURITY
-- DEFINER RPCs (future ns_propagation_metrics).
DROP POLICY IF EXISTS "public_agg_select" ON public.community_propagation;
CREATE POLICY "public_agg_select" ON public.community_propagation
  FOR SELECT USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.community_propagation
  FROM anon, authenticated;

COMMIT;
