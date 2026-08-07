-- NullSec — Community action support (Milestone 26)
-- ------------------------------------------------------------------
-- PREPARATION / DRAFT ONLY — not deployed, not populated.
--
-- The community_action activity type is already supported by ns_record_activity
-- (validated vocabulary includes 'community_action' in 0011 and the RPC). This
-- migration adds ONLY minimal hardening to support the explicit community
-- action integration:
--   1. An index on (activity_type, created_at) to speed aggregation of the
--      community_action bucket by time window.
--   2. Re-affirm the private events table + aggregation view remain non-public.
--
-- It does NOT duplicate tables, expose user activity, or add identity mapping.

BEGIN;

-- Speed aggregation over community_activity_events by type/time.
CREATE INDEX IF NOT EXISTS idx_activity_events_type_created
  ON public.community_activity_events(activity_type, created_at);

-- Re-affirm private events table (defense in depth).
ALTER TABLE public.community_activity_events ENABLE ROW LEVEL SECURITY;

-- Re-affirm the aggregation view is not directly readable by anon.
REVOKE SELECT ON public.v_country_metrics FROM anon, authenticated;

COMMIT;
