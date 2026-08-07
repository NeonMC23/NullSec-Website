-- NullSec — Supabase RPC: ns_tool_activity (Milestone 20)
-- ------------------------------------------------------------------
-- Records an authenticated tool-usage event as an AGGREGATE counter by
-- country. It stores NO individual identity, NO per-user timestamp, NO
-- detailed behaviour log.
--
-- The country is derived SERVER-SIDE from the authenticated user's profile
-- (user_profiles.country_code). The client can NOT choose the country, nor any
-- user/participant identity. If the profile has no country, the call is
-- rejected (no fabricated country).
--
-- PRIVACY: only an aggregate (country, tool) count is stored. No user_id,
-- identity_id, username, IP, GPS or individual history.
--
-- SECURITY: SECURITY DEFINER, pinned search_path, token-authenticated
-- (ns_validate_session is authoritative). No client-chosen user identity.

CREATE OR REPLACE FUNCTION public.ns_tool_activity(
  p_token text,
  p_tool_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id bigint;
  v_country text;
BEGIN
  -- Authenticate: derive user from the validated session token.
  v_user_id := public.ns_validate_session(p_token);
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Validate tool id (bounds only; tool ids are opaque strings).
  IF p_tool_id IS NULL OR length(p_tool_id) = 0 OR length(p_tool_id) > 64 THEN
    RAISE EXCEPTION 'invalid_tool_id';
  END IF;

  -- Derive country from the authenticated profile (server-side, not client).
  SELECT country_code INTO v_country
  FROM public.user_profiles
  WHERE user_id = v_user_id;

  IF v_country IS NULL THEN
    RAISE EXCEPTION 'no_country';
  END IF;

  -- Aggregate counter: never negative, never overwritten, monotonic.
  INSERT INTO public.tool_activity (tool_id, country_code, activity_count, updated_at)
  VALUES (p_tool_id, v_country, 1, now())
  ON CONFLICT (country_code, tool_id)
  DO UPDATE SET activity_count = public.tool_activity.activity_count + 1,
                updated_at = now();
END;
$$;
