-- NullSec — Country aggregation layer (Milestone 24)
-- ------------------------------------------------------------------
-- PREPARATION / DRAFT ONLY — not deployed.
--
-- Purpose: a SQL view that reduces raw activity events into per-country
-- AGGREGATES consumed by ns_country_metrics(). The frontend never processes
-- raw events; it only reads the aggregated view output.
--
-- Privacy: the view exposes ONLY per-country totals (no user, no username, no
-- IP/GPS/device, no individual timestamps).

BEGIN;

-- Aggregate view: one row per country with all measured activity dimensions.
CREATE OR REPLACE VIEW public.v_country_metrics AS
SELECT
  c.code AS country_code,
  (SELECT COUNT(*)::bigint FROM public.country_membership cm WHERE cm.country_code = c.code) AS participants,
  COALESCE(m.total, 0)::bigint AS mission_activity,
  COALESCE(t.total, 0)::bigint AS tool_activity,
  COALESCE(p.total, 0)::bigint AS propagation,
  (COALESCE(m.total, 0) + COALESCE(t.total, 0))::bigint AS total_activity
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

-- The view reads private tables (country_membership) inside SECURITY DEFINER
-- RPCs. anon must NOT be able to select the view directly (it would expose
-- country_membership counts only — aggregated, acceptable — but we keep the
-- surface minimal: ns_country_metrics() is the intended public entry point).
REVOKE SELECT ON public.v_country_metrics FROM anon, authenticated;

COMMIT;
