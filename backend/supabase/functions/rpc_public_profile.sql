-- NullSec — Public Profile RPC (Milestone 37 → 38)
-- ------------------------------------------------------------------
-- Returns a user's PUBLIC learning profile. Deliberately read-only and
-- anonymous-friendly. Exposes ONLY explicitly public learning data: the
-- opt-in enabled flag, username, public bio, learning interests, member
-- since date, and (when the profile is ENABLED) the canonical completed
-- mission ids from which the frontend derives learning statistics.
--
-- Never exposes: credentials, recovery, session, token, internal IDs,
-- email, private settings or private progression of a disabled profile.
--
-- If the profile is disabled (public_profile_enabled = FALSE) OR the user
-- does not exist, the RPC returns { enabled: false } (a safe, non-enumerating
-- response) so anonymous visitors cannot distinguish "no such user" from
-- "profile disabled".
--
-- SECURITY: SECURITY DEFINER + pinned search_path so `anon` cannot read the
-- private tables directly. RLS on private tables is unchanged.

CREATE OR REPLACE FUNCTION public.ns_public_profile(p_username text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id bigint;
  v_enabled boolean;
  v_username text;
  v_bio text;
  v_interests text[];
  v_created_at timestamptz;
  v_progress jsonb;
  v_completed text[] := '{}'::text[];
  v_key text;
BEGIN
  IF p_username IS NULL OR trim(p_username) = '' THEN
    RETURN json_build_object('enabled', false);
  END IF;

  -- Resolve the canonical server username (case-insensitive).
  SELECT u.id, up.public_profile_enabled, up.username, up.bio,
         up.learning_interests, up.created_at
    INTO v_user_id, v_enabled, v_username, v_bio, v_interests, v_created_at
  FROM public.users u
  JOIN public.user_profiles up ON up.user_id = u.id
  WHERE u.username IS NOT NULL AND lower(u.username) = lower(trim(p_username));

  -- Nonexistent user OR disabled profile both return enabled:false (no
  -- enumeration of which usernames exist).
  IF v_user_id IS NULL OR v_enabled IS NOT TRUE THEN
    RETURN json_build_object('enabled', false);
  END IF;

  -- Read the canonical progression.
  SELECT progress_json INTO v_progress
  FROM public.user_progress
  WHERE user_id = v_user_id;

  IF v_progress IS NOT NULL THEN
    -- Extract completed mission ids from `missions` map (and weekly).
    IF jsonb_typeof(v_progress->'missions') = 'object' THEN
      FOR v_key IN SELECT jsonb_object_keys(v_progress->'missions') LOOP
        IF (v_progress->'missions'->v_key->>'completed')::boolean = true THEN
          v_completed := array_append(v_completed, v_key);
        END IF;
      END LOOP;
    END IF;
    IF jsonb_typeof(v_progress->'weekly') = 'object' THEN
      FOR v_key IN SELECT jsonb_object_keys(v_progress->'weekly') LOOP
        IF (v_progress->'weekly'->v_key->>'completed')::boolean = true THEN
          v_completed := array_append(v_completed, v_key);
        END IF;
      END LOOP;
    END IF;
  END IF;

  RETURN json_build_object(
    'enabled', true,
    'username', v_username,
    'bio', v_bio,
    'learning_interests', COALESCE(to_json(v_interests), '[]'::json),
    'created_at', to_char(v_created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'completed_mission_ids', COALESCE(to_json(v_completed), '[]'::json)
  );
END;
$$;
