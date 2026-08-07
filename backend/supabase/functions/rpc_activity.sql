-- NullSec — Supabase RPC: anonymous activity pipeline + metrics (M13.1)
-- Increments aggregated counters only. No identity, no location, no history.
-- Public/anonymous: SECURITY DEFINER so the function can write aggregate
-- tables that anon has no direct INSERT/UPDATE permission on.

-- ---------- Anonymous activity ----------

CREATE OR REPLACE FUNCTION public.ns_activity(
  p_mission_id text,
  p_country_code text DEFAULT NULL,
  p_region text DEFAULT 'Europe'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_region text;
BEGIN
  -- Strict validation.
  IF p_mission_id IS NULL OR length(p_mission_id) = 0 OR length(p_mission_id) > 64 THEN
    RAISE EXCEPTION 'invalid_mission_id';
  END IF;

  v_code := NULL;
  IF p_country_code IS NOT NULL THEN
    v_code := upper(trim(p_country_code));
    IF length(v_code) <> 2 OR NOT (v_code ~ '^[A-Z]{2}$') THEN
      RAISE EXCEPTION 'invalid_country_code';
    END IF;
    -- Must be a known country.
    IF NOT EXISTS (SELECT 1 FROM public.countries WHERE code = v_code) THEN
      RAISE EXCEPTION 'unknown_country';
    END IF;
  END IF;

  v_region := COALESCE(NULLIF(trim(p_region), ''), 'Europe');
  IF length(v_region) > 32 THEN
    RAISE EXCEPTION 'invalid_region';
  END IF;

  IF v_code IS NOT NULL THEN
    -- mission_activity
    INSERT INTO public.mission_activity (mission_id, country_code, completed_count, last_activity_at)
    VALUES (p_mission_id, v_code, 1, now())
    ON CONFLICT (country_code, mission_id)
    DO UPDATE SET completed_count = public.mission_activity.completed_count + 1,
                  last_activity_at = now(), updated_at = now();

    -- country_activity
    INSERT INTO public.country_activity (country_code, completed_count)
    VALUES (v_code, 1)
    ON CONFLICT (country_code)
    DO UPDATE SET completed_count = public.country_activity.completed_count + 1, updated_at = now();

    -- mark country active
    UPDATE public.countries SET active = TRUE, updated_at = now() WHERE code = v_code;
  END IF;

  -- region_activity
  INSERT INTO public.region_activity (region, completed_count)
  VALUES (v_region, 1)
  ON CONFLICT (region)
  DO UPDATE SET completed_count = public.region_activity.completed_count + 1, updated_at = now();

  -- Challenges (M19 semantics): event-based challenges count each activity;
  -- unique-country challenges count DISTINCT countries (via challenge_progress).
  IF v_code IS NOT NULL THEN
    -- Register this country against every active unique-country challenge
    -- (ON CONFLICT DO NOTHING keeps each country counted exactly once).
    INSERT INTO public.challenge_progress (challenge_id, country_code, contribution_count, updated_at)
    SELECT id, v_code, 1, now()
    FROM public.community_challenges
    WHERE status = 'active' AND kind = 'unique_countries'
    ON CONFLICT (challenge_id, country_code) DO NOTHING;

    -- current_value = number of distinct countries activated.
    UPDATE public.community_challenges
    SET current_value = (
          SELECT COUNT(*) FROM public.challenge_progress
          WHERE challenge_id = public.community_challenges.id
        ),
        updated_at = now()
    WHERE status = 'active' AND kind = 'unique_countries';
  END IF;

  -- event-based challenges: each anonymous activity adds 1.
  UPDATE public.community_challenges
  SET current_value = current_value + 1, updated_at = now()
  WHERE status = 'active' AND kind = 'events';

  -- global stats
  UPDATE public.anonymous_global_stats
  SET total_completed = total_completed + 1,
      completed_missions = completed_missions + 1,
      active_regions = (SELECT COUNT(*)::int FROM public.region_activity WHERE completed_count > 0),
      countries_active = (SELECT COUNT(*)::int FROM public.countries WHERE active = TRUE),
      updated_at = now()
  WHERE id = 1;
END;
$$;

-- ---------- Metrics snapshot ----------

CREATE OR REPLACE FUNCTION public.ns_metrics()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_global json;
  v_countries json;
  v_regions json;
  v_challenges json;
BEGIN
  SELECT row_to_json(t) INTO v_global FROM (
    SELECT total_completed AS "completedMissions",
           countries_active AS "activeCountries",
           active_regions AS "activeRegions"
    FROM public.anonymous_global_stats WHERE id = 1
  ) t;

  SELECT json_agg(t) INTO v_countries FROM (
    SELECT c.code, c.name, c.region, c.active,
           COALESCE(ca.completed_count,0)::bigint AS completed,
           c.missions_available AS "missionsAvailable"
    FROM public.countries c
    LEFT JOIN public.country_activity ca ON ca.country_code = c.code
    ORDER BY completed DESC, c.code
  ) t;

  SELECT json_agg(t) INTO v_regions FROM (
    SELECT region, completed_count AS completed FROM public.region_activity
    ORDER BY completed DESC, region
  ) t;

  SELECT json_agg(t) INTO v_challenges FROM (
    SELECT id, title, description, target_value AS "targetValue",
           current_value AS "currentValue", status,
           CASE WHEN target_value > 0
                THEN ROUND((current_value::numeric / target_value) * 100, 2)
                ELSE 0 END AS "completionPercent"
    FROM public.community_challenges ORDER BY created_at DESC
  ) t;

  RETURN json_build_object(
    'global', v_global,
    'countries', COALESCE(v_countries, '[]'::json),
    'regions', COALESCE(v_regions, '[]'::json),
    'challenges', COALESCE(v_challenges, '[]'::json)
  );
END;
$$;
