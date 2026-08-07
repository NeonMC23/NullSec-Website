-- NullSec — Community Activity Event Layer (Milestone 24)
-- ------------------------------------------------------------------
-- PREPARATION / DRAFT ONLY — not deployed, not populated.
--
-- Purpose: internal, secure activity-event log used to compute AGGREGATED
-- country metrics. The frontend never sees raw events; the public API only
-- exposes aggregated country statistics.
--
-- Privacy:
--   - The table stores ONLY (country_code, activity_type, amount, created_at).
--   - It does NOT store public user identifiers, usernames, profiles, IP,
--     device identifiers, or GPS/location. Any internal reference (e.g. to a
--     user for deduplication) is OPTIONAL and only if required by backend
--     logic — it is never exposed publicly.
--   - This is NOT a per-user activity history exposed anywhere.
--
-- Model: one row per activity action (amount >= 1). The aggregation layer
-- (views / functions) reduces these to per-country aggregates.

BEGIN;

CREATE TABLE IF NOT EXISTS public.community_activity_events (
  id            BIGSERIAL PRIMARY KEY,
  country_code  TEXT NOT NULL REFERENCES public.countries(code) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  amount        BIGINT NOT NULL DEFAULT 1 CHECK (amount >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for aggregation by country + type and for time-window aggregation.
CREATE INDEX IF NOT EXISTS idx_activity_events_country_type
  ON public.community_activity_events(country_code, activity_type);
CREATE INDEX IF NOT EXISTS idx_activity_events_created
  ON public.community_activity_events(created_at);

-- Validate allowed activity types (controlled vocabulary). Optional, but keeps
-- the pipeline clean; enforced strongly in ns_record_activity too.
ALTER TABLE public.community_activity_events
  DROP CONSTRAINT IF EXISTS community_activity_events_type_check;
ALTER TABLE public.community_activity_events
  ADD CONSTRAINT community_activity_events_type_check
  CHECK (activity_type IN ('mission_completed','tool_used','community_action'));

-- RLS: fully private — anon/authenticated have NO direct access. Writes go
-- through the SECURITY DEFINER RPC ns_record_activity; reads only via
-- aggregation functions/views (SECURITY DEFINER). No direct anon read.
ALTER TABLE public.community_activity_events ENABLE ROW LEVEL SECURITY;

-- No public SELECT/INSERT/UPDATE/DELETE policy at all → denied by default.

COMMIT;
