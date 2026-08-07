-- NullSec — Activity metrics refinement (Milestone 27)
-- ------------------------------------------------------------------
-- PREPARATION / DRAFT ONLY — not deployed, not populated.
--
-- Adds an EXPLICIT `community_activity` aggregate column to the v_country_metrics
-- view so the dashboard can clearly distinguish mission / tool / community
-- activity. community_activity equals the community_propagation aggregate (which
-- is incremented by ns_record_activity for 'community_action' events).
--
-- No duplicate tables. Keeps propagation for backward compatibility.
-- Preserves SECURITY DEFINER RPCs, search_path = public, RLS, explicit grants,
-- and private raw events.

BEGIN;

CREATE OR REPLACE VIEW public.v_country_metrics AS
SELECT
  c.code AS country_code,
  (SELECT COUNT(*)::bigint FROM public.country_membership cm WHERE cm.country_code = c.code) AS participants,
  COALESCE(m.total, 0)::bigint AS mission_activity,
  COALESCE(t.total, 0)::bigint AS tool_activity,
  COALESCE(p.total, 0)::bigint AS propagation,
  COALESCE(p.total, 0)::bigint AS community_activity,
  (COALESCE(m.total, 0) + COALESCE(t.total, 0) + COALESCE(p.total, 0))::bigint AS total_activity
FROM public.countries c
LEFT JOIN (
  SELECT country_code, SUM(completed_count)::bigint AS total
  FROM public.mission_activity GROUP BY country_code
) m ON m.country_code = c.code
LEFT JOIN (
  SELECT country_code, SUM(activity_count)::bigint AS total
  FROM public.tool_activity GROUP BY country_code
) t ON t.country_code = c.code
LEFT JOIN (
  SELECT country_code, SUM(propagation_count)::bigint AS total
  FROM public.community_propagation GROUP BY country_code
) p ON p.country_code = c.code;

-- The view remains non-public (aggregation via SECURITY DEFINER RPC only).
REVOKE SELECT ON public.v_country_metrics FROM anon, authenticated;

COMMIT;
