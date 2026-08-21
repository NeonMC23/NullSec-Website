-- NullSec — Supabase RPC: ns_record_activity (Milestone 24)
-- ------------------------------------------------------------------
-- Securely records a community activity action. Identity is derived from the
-- validated server session (ns_validate_session). The country is resolved
-- SERVER-SIDE from the authenticated user's country_membership — never trusted
-- from the client.
--
-- Input:
--   p_token          required — session token (hashed server-side).
--   p_activity_type  required — 'mission_completed' | 'tool_used' | 'community_action'.
--   p_amount         optional — >= 1, default 1, bounded (rejects oversized).
--   p_country_code   OPTIONAL and IGNORED unless a server override is needed.
--                    The frontend country is never trusted for aggregation.
--
-- Behavior: inserts one row into community_activity_events. Also updates the
-- matching aggregate tables so the dashboard has up-to-date counts:
--   mission_completed → mission_activity / country_activity
--   tool_used         → tool_activity
--   community_action  → community_propagation
--
-- Privacy: no public user identifiers, usernames, IP, GPS, device stored or
-- returned. Only an internal event row (aggregated downstream).
--
-- SECURITY: SECURITY DEFINER, pinned search_path, token-authenticated. Never
-- accepts a client-chosen user_id/identity.

CREATE OR REPLACE FUNCTION public.ns_record_activity(
  p_token text,
  p_activity_type text,
  p_amount bigint DEFAULT 1,
  p_country_code text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id bigint;
  v_country text;
  v_amount bigint;
BEGIN
  -- Authenticate: derive user from the validated session token.
  v_user_id := public.ns_validate_session(p_token);
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Validate activity type (controlled vocabulary).
  IF p_activity_type IS NULL OR p_activity_type NOT IN
     ('mission_completed','tool_used','community_action') THEN
    RAISE EXCEPTION 'invalid_activity_type';
  END IF;

  -- Validate amount range (>= 1, bounded to avoid overflow/abuse).
  v_amount := COALESCE(p_amount, 1);
  IF v_amount < 1 OR v_amount > 1000 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  -- Resolve country server-side from country_membership (the user's explicit
  -- choice). A client-supplied country is NOT trusted for aggregation.
  SELECT country_code INTO v_country
  FROM public.country_membership
  WHERE user_id = v_user_id;

  -- M50: a user with no selected country has nothing to aggregate. This is a
  -- best-effort anonymous aggregation, so a country-less user is a silent no-op
  -- (return success, no event written) rather than a hard error. This removes
  -- spurious 400 "no_country" console noise while preserving privacy (no
  -- fabricated country, no per-user data, no aggregation without an explicit
  -- choice). Nothing is written when there is no country.
  IF v_country IS NULL THEN
    RETURN;
  END IF;

  -- Append the internal event (aggregated downstream; never exposed raw).
  INSERT INTO public.community_activity_events
    (country_code, activity_type, amount, created_at)
  VALUES (v_country, p_activity_type, v_amount, now());

  -- Update the corresponding aggregate table.
  IF p_activity_type = 'mission_completed' THEN
    -- M61: also bump mission_activity so the Community dashboard's
    -- "Missions completed" aggregate (v_country_metrics.mission_activity) is
    -- populated. The UI does not pass a per-mission id to this RPC, so we
    -- aggregate under a single generic mission bucket per country; the
    -- dashboard sums per-country totals, so the mission_id is not displayed.
    INSERT INTO public.mission_activity (mission_id, country_code, completed_count, last_activity_at, updated_at)
    VALUES ('_general', v_country, v_amount, now(), now())
    ON CONFLICT (country_code, mission_id)
    DO UPDATE SET completed_count = public.mission_activity.completed_count + v_amount,
                  last_activity_at = now(), updated_at = now();
    INSERT INTO public.country_activity (country_code, completed_count, updated_at)
    VALUES (v_country, v_amount, now())
    ON CONFLICT (country_code)
    DO UPDATE SET completed_count = public.country_activity.completed_count + v_amount,
                  updated_at = now();
  ELSIF p_activity_type = 'tool_used' THEN
    -- tool_activity is keyed by (country_code, tool_id); we use a generic
    -- tool bucket '_community' when no specific tool id is provided.
    INSERT INTO public.tool_activity (country_code, tool_id, activity_count, updated_at)
    VALUES (v_country, '_community', v_amount, now())
    ON CONFLICT (country_code, tool_id)
    DO UPDATE SET activity_count = public.tool_activity.activity_count + v_amount,
                  updated_at = now();
  ELSIF p_activity_type = 'community_action' THEN
    INSERT INTO public.community_propagation (country_code, propagation_type, propagation_count, updated_at)
    VALUES (v_country, 'community_action', v_amount, now())
    ON CONFLICT (country_code, propagation_type)
    DO UPDATE SET propagation_count = public.community_propagation.propagation_count + v_amount,
                  updated_at = now();
  END IF;
END;
$$;
