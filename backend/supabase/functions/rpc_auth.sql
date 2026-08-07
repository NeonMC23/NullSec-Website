-- NullSec — Supabase RPC: authentication by Recovery Key (Milestone 13.1)
-- No passwords, no email, no OAuth. The RAW recovery key never leaves the
-- browser: the client sends a SHA-256 transport hash, and the server stores
-- a salted bcrypt hash (pgcrypto crypt) of that transport hash.
--
-- NOTE on hashing: PostgreSQL does not provide Argon2 natively. We use
-- pgcrypto bcrypt (crypt + gen_salt('bf')) which is the strongest built-in
-- KDF available. This is a documented, honest deviation from the Argon2
-- target. The raw key and the raw SHA-256 transport hash are never stored.

-- Ensure pgcrypto for crypt/gen_salt and digest/gen_random_bytes.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- Helpers ----------

-- Validate that a session token is valid (not revoked, not expired).
-- Returns the user_id or NULL. The token is hashed (sha256) for lookup.
CREATE OR REPLACE FUNCTION public.ns_validate_session(p_token text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id bigint;
  v_token_hash text;
BEGIN
  IF p_token IS NULL OR p_token = '' THEN
    RETURN NULL;
  END IF;
  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');
  SELECT user_id INTO v_user_id
  FROM public.sessions
  WHERE token_hash = v_token_hash AND revoked = FALSE AND expires_at > now()
  LIMIT 1;
  RETURN v_user_id;
END;
$$;

-- Revoke a session token.
CREATE OR REPLACE FUNCTION public.ns_logout(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_hash text;
BEGIN
  IF p_token IS NULL OR p_token = '' THEN
    RETURN;
  END IF;
  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');
  UPDATE public.sessions SET revoked = TRUE WHERE token_hash = v_token_hash;
END;
$$;

-- Create a session row for a user; returns the raw token (client keeps it
-- only in memory). Server stores only the sha256 hash.
CREATE OR REPLACE FUNCTION public.ns_create_session(p_user_id bigint)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_token_hash text;
BEGIN
  v_token := encode(gen_random_bytes(32), 'base64');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');
  INSERT INTO public.sessions (user_id, token_hash, expires_at)
  VALUES (p_user_id, v_token_hash, now() + interval '7 days');
  RETURN v_token;
END;
$$;

-- ---------- Register ----------

-- Create an account from identity_id + SHA-256 recovery-key transport hash.
CREATE OR REPLACE FUNCTION public.ns_register(
  p_identity_id uuid,
  p_recovery_hash text,
  p_username text DEFAULT 'Anonymous',
  p_avatar_seed text DEFAULT ''
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id bigint;
  v_token text;
  v_hash_stored text;
BEGIN
  -- Validate transport hash format (64 lowercase hex chars).
  IF p_recovery_hash IS NULL OR NOT (p_recovery_hash ~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'invalid_recovery_hash';
  END IF;
  -- Constrain payload sizes.
  IF p_username IS NOT NULL AND length(p_username) > 32 THEN
    RAISE EXCEPTION 'username_too_long';
  END IF;
  IF p_avatar_seed IS NOT NULL AND length(p_avatar_seed) > 64 THEN
    RAISE EXCEPTION 'avatar_seed_too_long';
  END IF;

  IF EXISTS (SELECT 1 FROM public.users WHERE identity_id = p_identity_id) THEN
    RAISE EXCEPTION 'account_already_exists';
  END IF;

  INSERT INTO public.users (identity_id) VALUES (p_identity_id)
  RETURNING id INTO v_user_id;

  -- Store a salted bcrypt hash of the transport hash (never the raw key).
  v_hash_stored := crypt(p_recovery_hash, gen_salt('bf', 10));
  INSERT INTO public.recovery_credentials (user_id, recovery_hash)
  VALUES (v_user_id, v_hash_stored);

  INSERT INTO public.user_profiles (user_id, username, avatar_seed)
  VALUES (v_user_id, COALESCE(p_username, 'Anonymous'), COALESCE(p_avatar_seed, ''));

  INSERT INTO public.user_settings (user_id, settings_json)
  VALUES (v_user_id, '{"version":1,"theme":"system","language":"en","privacy":{"offline_only":true,"telemetry":false},"appearance":{"animations":true,"reduced_motion":false}}');

  INSERT INTO public.user_progress (user_id, progress_json)
  VALUES (v_user_id, '{"version":1,"missions":{},"articles":{},"weekly":{},"updated_at":"'||to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')||'"}');

  v_token := public.ns_create_session(v_user_id);

  RETURN json_build_object('token', v_token, 'user_id', v_user_id);
END;
$$;

-- ---------- Login ----------

-- Verify the SHA-256 recovery-key transport hash, then create a session.
CREATE OR REPLACE FUNCTION public.ns_login(p_identity_id uuid, p_recovery_hash text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id bigint;
  v_token text;
  v_stored_hash text;
  v_valid boolean;
BEGIN
  IF p_recovery_hash IS NULL OR NOT (p_recovery_hash ~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'invalid_recovery_hash';
  END IF;

  SELECT id INTO v_user_id FROM public.users WHERE identity_id = p_identity_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'account_not_found';
  END IF;

  SELECT recovery_hash INTO v_stored_hash
  FROM public.recovery_credentials WHERE user_id = v_user_id;

  v_valid := (v_stored_hash IS NOT NULL AND crypt(p_recovery_hash, v_stored_hash) = v_stored_hash);
  IF NOT v_valid THEN
    RAISE EXCEPTION 'invalid_recovery_key';
  END IF;

  UPDATE public.recovery_credentials SET last_used_at = now() WHERE user_id = v_user_id;

  v_token := public.ns_create_session(v_user_id);

  RETURN json_build_object('token', v_token, 'user_id', v_user_id);
END;
$$;
