-- NullSec — Supabase RPC: synchronization (Milestone 13.1)
-- updated_at wins. Authentication is by SESSION TOKEN (the client never
-- sends a user_id it chooses) so user A cannot access user B's data.

-- ---------- Pull ----------

-- Pull the authenticated user's data (profile/settings/progress).
CREATE OR REPLACE FUNCTION public.ns_sync_pull(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id bigint;
  v_profile json;
  v_settings json;
  v_progress json;
BEGIN
  v_user_id := public.ns_validate_session(p_token);
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT row_to_json(t) INTO v_profile FROM (
    SELECT username, avatar_seed, country_code, updated_at FROM public.user_profiles WHERE user_id = v_user_id
  ) t;
  SELECT settings_json INTO v_settings FROM public.user_settings WHERE user_id = v_user_id;
  SELECT progress_json INTO v_progress FROM public.user_progress WHERE user_id = v_user_id;

  RETURN json_build_object(
    'profile', v_profile,
    'settings', v_settings,
    'progress', v_progress
  );
END;
$$;

-- ---------- Push ----------

-- Push the authenticated user's data (newest updated_at wins for profile).
CREATE OR REPLACE FUNCTION public.ns_sync_push(
  p_token text,
  p_profile json,
  p_settings json,
  p_progress json
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

  -- Constrain payload size (reject oversized blobs).
  IF p_profile IS NOT NULL AND pg_column_size(p_profile::text) > 5000 THEN
    RAISE EXCEPTION 'profile_too_large';
  END IF;
  IF p_settings IS NOT NULL AND pg_column_size(p_settings::text) > 20000 THEN
    RAISE EXCEPTION 'settings_too_large';
  END IF;
  IF p_progress IS NOT NULL AND pg_column_size(p_progress::text) > 100000 THEN
    RAISE EXCEPTION 'progress_too_large';
  END IF;

  IF p_profile IS NOT NULL AND json_typeof(p_profile) = 'object' THEN
    INSERT INTO public.user_profiles (user_id, username, avatar_seed, updated_at)
    VALUES (v_user_id,
            COALESCE(p_profile->>'username','Anonymous'),
            COALESCE(p_profile->>'avatar_seed',''),
            now())
    ON CONFLICT (user_id)
    DO UPDATE SET
      username = CASE WHEN (p_profile->>'updated_at')::timestamptz IS NULL
                       OR public.user_profiles.updated_at <= (p_profile->>'updated_at')::timestamptz
                  THEN EXCLUDED.username ELSE public.user_profiles.username END,
      avatar_seed = CASE WHEN (p_profile->>'updated_at')::timestamptz IS NULL
                          OR public.user_profiles.updated_at <= (p_profile->>'updated_at')::timestamptz
                     THEN EXCLUDED.avatar_seed ELSE public.user_profiles.avatar_seed END,
      updated_at = CASE WHEN (p_profile->>'updated_at')::timestamptz IS NULL
                          OR public.user_profiles.updated_at <= (p_profile->>'updated_at')::timestamptz
                     THEN now() ELSE public.user_profiles.updated_at END;
  END IF;

  IF p_settings IS NOT NULL AND json_typeof(p_settings) = 'object' THEN
    INSERT INTO public.user_settings (user_id, settings_json, updated_at)
    VALUES (v_user_id, p_settings, now())
    ON CONFLICT (user_id)
    DO UPDATE SET settings_json = EXCLUDED.settings_json, updated_at = now();
  END IF;

  IF p_progress IS NOT NULL AND json_typeof(p_progress) = 'object' THEN
    INSERT INTO public.user_progress (user_id, progress_json, updated_at)
    VALUES (v_user_id, p_progress, now())
    ON CONFLICT (user_id)
    DO UPDATE SET progress_json = EXCLUDED.progress_json, updated_at = now();
  END IF;
END;
$$;

-- ---------- Reset progress (authenticated) --------------------------

-- Reset the authenticated account's own progression to empty. Only touches
-- the caller's user_progress row; never another user's data.
CREATE OR REPLACE FUNCTION public.ns_reset_progress(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id bigint;
BEGIN
  IF p_token IS NULL OR p_token = '' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  v_user_id := public.ns_validate_session(p_token);
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  UPDATE public.user_progress
  SET progress_json = ('{"version":1,"missions":{},"articles":{},"weekly":{},"updated_at":"'||to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')||'"}')::jsonb,
      updated_at = now()
  WHERE user_id = v_user_id;

  RETURN json_build_object('reset', true, 'user_id', v_user_id);
END;
$$;
