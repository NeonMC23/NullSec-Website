-- NullSec — Activity trigger support (Milestone 25)
-- ------------------------------------------------------------------
-- PREPARATION / DRAFT ONLY — not deployed, not populated.
--
-- This migration adds ONLY what is necessary to support the UI activity
-- triggers (mission_completed / tool_used / community_action) end-to-end via
-- ns_record_activity. It does NOT duplicate existing data structures.
--
-- Existing structures (kept as-is, not duplicated):
--   community_activity_events  (0011)
--   country_membership          (0009/0010)
--   tool_activity               (0007)
--   mission_activity            (0001)
--   community_propagation       (0009/0010)
--
-- What is added here (minimal, index/permission hardening):
--   1. An index to speed the ns_record_activity country resolution from
--      country_membership (already unique on user_id; an index on
--      country_code helps aggregation).
--   2. Re-affirm grants/RLS for the activity pipeline (defense in depth).

BEGIN;

-- 1. Help aggregation over country_membership (participants by country).
CREATE INDEX IF NOT EXISTS idx_country_membership_country_code_agg
  ON public.country_membership(country_code);

-- 2. Re-affirm RLS: community_activity_events remains fully private
--    (no anon/authenticated direct access). Re-run the enable to be safe.
ALTER TABLE public.community_activity_events ENABLE ROW LEVEL SECURITY;

-- 3. Re-affirm the aggregation view is not directly readable by anon.
REVOKE SELECT ON public.v_country_metrics FROM anon, authenticated;

COMMIT;
