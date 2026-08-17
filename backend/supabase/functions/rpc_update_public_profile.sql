-- NullSec — Update Public Profile RPC (Milestone 38)
-- ------------------------------------------------------------------
-- Lets the AUTHENTICATED owner update only their OWN explicit public
-- learning-identity fields: the opt-in enabled flag, a bounded bio, and a
-- bounded list of learning interests.
--
-- It NEVER accepts a client-chosen user_id; identity is derived from the
-- validated session token. It never allows changing the username (the
-- username is the canonical account identity and requires a dedicated flow).
-- An invalid session is refused with 'unauthorized'.
--
-- SECURITY: SECURITY DEFINER + pinned search_path; RLS unchanged.

CREATE OR REPLACE FUNCTION public.ns_update_public_profile(
  p_token text,
  p_public_profile_enabled boolean DEFAULT NULL,
  p_bio text DEFAULT NULL,
  p_learning_interests text[] DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id bigint;
  v_bio text;
  v_interests text[];
BEGIN
  -- Authenticate from the session (never a client-chosen user_id).
  IF p_token IS NULL OR p_token = '' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  v_user_id := public.ns_validate_session(p_token);
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Validate + sanitize bio.
  v_bio := p_bio;
  IF v_bio IS NOT NULL THEN
    v_bio := trim(v_bio);
    IF length(v_bio) > 280 THEN
      RAISE EXCEPTION 'bio_too_long';
    END IF;
  END IF;

  -- Validate + sanitize interests (bounded count, non-empty trimmed tags).
  v_interests := p_learning_interests;
  IF v_interests IS NOT NULL AND cardinality(v_interests) > 8 THEN
    RAISE EXCEPTION 'too_many_interests';
  END IF;

  -- Update ONLY the explicit public fields on the OWNER's profile row.
  UPDATE public.user_profiles
  SET
    public_profile_enabled = COALESCE(p_public_profile_enabled, public_profile_enabled),
    bio = COALESCE(v_bio, bio),
    learning_interests = COALESCE(v_interests, learning_interests),
    updated_at = now()
  WHERE user_id = v_user_id;

  RETURN json_build_object('updated', true, 'user_id', v_user_id);
END;
$$;
