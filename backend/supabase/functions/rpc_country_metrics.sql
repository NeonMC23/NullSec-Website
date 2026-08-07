-- NullSec — Supabase RPC: ns_country_metrics (Milestone 18→24)
-- ------------------------------------------------------------------
-- Returns AGGREGATED, anonymous country-level statistics for the Europe
-- activity dashboard. Only public, aggregated data is returned.
--
-- PRIVACY: never exposes user_id, identity_id, username, recovery info,
-- session info, IP, GPS, device id, individual activity history or individual
-- timestamps. Only per-country aggregates.
--
-- Data source (M24): the v_country_metrics view (aggregation layer) which sums
--   participants     : country_membership distinct users
--   missionActivity  : mission_activity.completed_count
--   toolActivity     : tool_activity.activity_count
--   propagation      : community_propagation.propagation_count
--   totalActivity    : missionActivity + toolActivity (deterministic)
--
-- Final contract (Part 5):
--   { countries: { ISO: { participants, missionActivity, toolActivity,
--                         propagation, totalActivity } },
--     availability: { participants, missions, tools, propagation },
--     lastUpdate: "ISO timestamp" }
-- availability per metric = whether that source is available (true) vs
-- unavailable (false). Propagation may be null if not collected.
--
-- SECURITY: SECURITY DEFINER with explicit search_path. It reads private
-- country_membership only to COUNT distinct users (never exposing any row);
-- it never returns individual identities. anon receives aggregates only.

CREATE OR REPLACE FUNCTION public.ns_country_metrics()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_countries json;
  v_last_update text;
BEGIN
  SELECT json_object_agg(
           v.country_code,
           json_build_object(
             'participants',    v.participants,
             'missionActivity', v.mission_activity,
             'toolActivity',    v.tool_activity,
             'communityActivity', v.community_activity,
             'propagation',     v.propagation,
             'totalActivity',   v.total_activity
           )
         )
  INTO v_countries
  FROM public.v_country_metrics v;

  -- Global (non-individual) last-update timestamp.
  SELECT to_char(max(updated_at), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  INTO v_last_update
  FROM (
    SELECT updated_at FROM public.country_activity
    UNION ALL SELECT updated_at FROM public.tool_activity
    UNION ALL SELECT updated_at FROM public.community_propagation
  ) u;

  RETURN json_build_object(
    'countries', COALESCE(v_countries, '{}'::json),
    'availability', json_build_object(
      'participants', true,       -- country_membership exists
      'missions',     true,       -- mission_activity exists
      'tools',        true,       -- tool_activity exists
      'communityActivity', true,  -- community_propagation exists (may be 0)
      'propagation',  true        -- community_propagation exists (may be 0)
    ),
    'lastUpdate', v_last_update
  );
END;
$$;
