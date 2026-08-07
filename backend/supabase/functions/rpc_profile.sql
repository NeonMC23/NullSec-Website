-- NullSec — Supabase RPC: ns_update_profile (Milestone 20)
-- ------------------------------------------------------------------
-- Updates the AUTHENTICATED user's own profile fields, including the
-- user-selected country (ISO-3166 alpha-2).
--
-- The country is an explicit user choice stored on the private profile. It is
-- NEVER inferred from IP/GPS/locale/timezone. It is used only for aggregate
-- country metrics (participants), never exposed per-user publicly.
--
-- The client can only ever update its OWN profile: user identity is derived
-- from the validated session token (ns_validate_session). A client-chosen
-- user_id is never accepted.
--
-- SECURITY: SECURITY DEFINER, pinned search_path, token-authenticated.

CREATE OR REPLACE FUNCTION public.ns_update_profile(
  p_token text,
  p_username text DEFAULT NULL,
  p_country_code text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id bigint;
BEGIN
  v_user_id := public.ns_validate_session(p_token);
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF p_username IS NOT NULL THEN
    IF length(p_username) = 0 OR length(p_username) > 32 THEN
      RAISE EXCEPTION 'invalid_username';
    END IF;
    UPDATE public.user_profiles
    SET username = p_username, updated_at = now()
    WHERE user_id = v_user_id;
  END IF;

  IF p_country_code IS NOT NULL THEN
    IF NOT (p_country_code ~ '^[A-Z]{2}$') THEN
      RAISE EXCEPTION 'invalid_country_code';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.countries WHERE code = p_country_code) THEN
      RAISE EXCEPTION 'unknown_country';
    END IF;
    UPDATE public.user_profiles
    SET country_code = p_country_code, updated_at = now()
    WHERE user_id = v_user_id;
  END IF;
END;
$$;
