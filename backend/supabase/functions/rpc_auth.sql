-- NullSec — Supabase RPC: authentication by username + password (M32)
-- ------------------------------------------------------------------
-- The PRIMARY sign-in is username + password. The recovery key is an
-- account-recovery mechanism only — it is NOT used for normal sign-in.
-- NO email is used anywhere.
--
-- Hashing (reuses the existing pattern):
--   - The browser computes a SHA-256 "transport hash" of the raw secret
--     (password or recovery key) and sends only that 64-char hex hash.
--   - The server stores a salted bcrypt hash (pgcrypto crypt) of that
--     transport hash. The raw secret and the raw SHA-256 transport hash are
--     never stored.
--   - PostgreSQL does not provide Argon2 natively; we use pgcrypto bcrypt
--     (crypt + gen_salt('bf',10)), the strongest built-in KDF available.
--     This is a documented, honest deviation from the Argon2 target.
--
-- Users are identified by a normalized (lowercase) private username.
-- Passwords are never returned and never stored in clear text.

-- Ensure pgcrypto for crypt/gen_salt and digest/gen_random_bytes.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- Helpers ----------

-- Validate a session token (not revoked, not expired). Returns user_id or NULL.
CREATE OR REPLACE FUNCTION public.ns_validate_session(p_token text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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
SET search_path = public, extensions
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

-- Create a session row for a user; returns the raw token (kept only in
-- memory + sessionStorage by the client). Server stores only the sha256 hash.
CREATE OR REPLACE FUNCTION public.ns_create_session(p_user_id bigint)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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

-- Validate a SHA-256 transport hash format (64 lowercase hex chars).
CREATE OR REPLACE FUNCTION public.ns_valid_transport_hash(p_hash text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_hash IS NOT NULL AND p_hash ~ '^[0-9a-f]{64}$';
$$;

-- Validate a username (3–32 chars, letters/digits/._-).
CREATE OR REPLACE FUNCTION public.ns_valid_username(p_username text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_username IS NOT NULL
     AND length(p_username) >= 3
     AND length(p_username) <= 32
     AND p_username ~ '^[A-Za-z0-9._-]+$';
$$;

-- ---------- Register (Create account) ----------

-- Create an account from username + password (+ optional recovery key).
-- Returns a session token. The recovery key transport hash is stored as a
-- bcrypt hash in recovery_credentials; the password transport hash is stored
-- as a bcrypt hash in users.password_hash.
CREATE OR REPLACE FUNCTION public.ns_register(
  p_username text,
  p_password_hash text,
  p_recovery_hash text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id bigint;
  v_token text;
BEGIN
  -- Validate inputs.
  IF NOT public.ns_valid_username(p_username) THEN
    RAISE EXCEPTION 'invalid_username';
  END IF;
  IF NOT public.ns_valid_transport_hash(p_password_hash) THEN
    RAISE EXCEPTION 'invalid_password_hash';
  END IF;
  IF p_recovery_hash IS NOT NULL AND NOT public.ns_valid_transport_hash(p_recovery_hash) THEN
    RAISE EXCEPTION 'invalid_recovery_hash';
  END IF;

  -- Username uniqueness (case-insensitive).
  IF EXISTS (SELECT 1 FROM public.users WHERE lower(username) = lower(p_username)) THEN
    RAISE EXCEPTION 'username_taken';
  END IF;

  INSERT INTO public.users (username, password_hash)
  VALUES (lower(p_username), crypt(p_password_hash, gen_salt('bf', 10)))
  RETURNING id INTO v_user_id;

  -- Recovery key (bcrypt of the SHA-256 transport hash), when provided.
  IF p_recovery_hash IS NOT NULL THEN
    INSERT INTO public.recovery_credentials (user_id, recovery_hash)
    VALUES (v_user_id, crypt(p_recovery_hash, gen_salt('bf', 10)));
  END IF;

  INSERT INTO public.user_profiles (user_id, username)
  VALUES (v_user_id, lower(p_username));

  INSERT INTO public.user_settings (user_id, settings_json)
  VALUES (v_user_id, '{"version":1,"theme":"system","language":"en","privacy":{"offline_only":true,"telemetry":false},"appearance":{"animations":true,"reduced_motion":false}}');

  INSERT INTO public.user_progress (user_id, progress_json)
  VALUES (v_user_id, ('{"version":1,"missions":{},"articles":{},"weekly":{},"updated_at":"'||to_char(now(),'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')||'"}')::jsonb);

  v_token := public.ns_create_session(v_user_id);

  RETURN json_build_object('token', v_token, 'user_id', v_user_id);
END;
$$;

-- ---------- Login (Sign in) ----------

-- Verify username + password transport hash, then create a session.
CREATE OR REPLACE FUNCTION public.ns_login(p_username text, p_password_hash text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id bigint;
  v_token text;
  v_stored_hash text;
BEGIN
  IF NOT public.ns_valid_transport_hash(p_password_hash) THEN
    RAISE EXCEPTION 'invalid_credentials';
  END IF;

  SELECT id, password_hash INTO v_user_id, v_stored_hash
  FROM public.users
  WHERE lower(username) = lower(p_username);

  -- Generic error: do not reveal whether the username exists.
  IF v_user_id IS NULL OR v_stored_hash IS NULL OR
     NOT (crypt(p_password_hash, v_stored_hash) = v_stored_hash) THEN
    RAISE EXCEPTION 'invalid_credentials';
  END IF;

  v_token := public.ns_create_session(v_user_id);
  RETURN json_build_object('token', v_token, 'user_id', v_user_id);
END;
$$;

-- ---------- Recover (account recovery) ----------

-- Recover account access using username + recovery key. M33: this is NOT a
-- normal sign-in. It verifies the recovery credential, establishes a new
-- password, and revokes any existing sessions. It does NOT return a session
-- token: the user then signs in normally with username + new password.
-- Drop the previous recovery signature (M32 returned a session; M33 does not).
DROP FUNCTION IF EXISTS public.ns_recover(text, text);
CREATE OR REPLACE FUNCTION public.ns_recover(p_username text, p_recovery_hash text, p_new_password_hash text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id bigint;
  v_stored_hash text;
BEGIN
  IF NOT public.ns_valid_transport_hash(p_recovery_hash) THEN
    RAISE EXCEPTION 'invalid_credentials';
  END IF;
  IF NOT public.ns_valid_transport_hash(p_new_password_hash) THEN
    RAISE EXCEPTION 'invalid_credentials';
  END IF;

  SELECT u.id INTO v_user_id
  FROM public.users u
  WHERE lower(u.username) = lower(p_username);

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_credentials';
  END IF;

  SELECT recovery_hash INTO v_stored_hash
  FROM public.recovery_credentials WHERE user_id = v_user_id;

  IF v_stored_hash IS NULL OR NOT (crypt(p_recovery_hash, v_stored_hash) = v_stored_hash) THEN
    RAISE EXCEPTION 'invalid_recovery_key';
  END IF;

  -- Establish the new password (bcrypt of the SHA-256 transport hash).
  UPDATE public.users
  SET password_hash = crypt(p_new_password_hash, gen_salt('bf', 10)), updated_at = now()
  WHERE id = v_user_id;

  -- Revoke all existing sessions for this account (consistent policy after
  -- a recovery). The recovery itself never creates a session.
  UPDATE public.sessions SET revoked = TRUE WHERE user_id = v_user_id AND revoked = FALSE;

  UPDATE public.recovery_credentials SET last_used_at = now() WHERE user_id = v_user_id;

  RETURN json_build_object('recovered', true, 'user_id', v_user_id);
END;
$$;

-- ---------- Change password (authenticated) -------------------------

-- Change the authenticated account's password. Requires the current password
-- (SHA-256 transport hash). Sets a new bcrypt hash and revokes all other
-- sessions (the current session token is passed and kept valid; others are
-- revoked) so a leaked session cannot outlive a password change.
CREATE OR REPLACE FUNCTION public.ns_change_password(
  p_token text,
  p_current_password_hash text,
  p_new_password_hash text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id bigint;
  v_stored_hash text;
  v_current_token_hash text;
BEGIN
  -- Authenticate the caller.
  IF p_token IS NULL OR p_token = '' THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  v_user_id := public.ns_validate_session(p_token);
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  -- Validate transport hashes.
  IF NOT public.ns_valid_transport_hash(p_current_password_hash) OR
     NOT public.ns_valid_transport_hash(p_new_password_hash) THEN
    RAISE EXCEPTION 'invalid_credentials';
  END IF;

  -- Verify the current password.
  SELECT password_hash INTO v_stored_hash FROM public.users WHERE id = v_user_id;
  IF v_stored_hash IS NULL OR NOT (crypt(p_current_password_hash, v_stored_hash) = v_stored_hash) THEN
    RAISE EXCEPTION 'invalid_credentials';
  END IF;

  -- Set the new password (bcrypt of the SHA-256 transport hash).
  UPDATE public.users
  SET password_hash = crypt(p_new_password_hash, gen_salt('bf', 10)), updated_at = now()
  WHERE id = v_user_id;

  -- Revoke every session EXCEPT the current one (identified by its token hash).
  v_current_token_hash := encode(digest(p_token, 'sha256'), 'hex');
  UPDATE public.sessions
  SET revoked = TRUE
  WHERE user_id = v_user_id AND revoked = FALSE AND token_hash <> v_current_token_hash;

  RETURN json_build_object('changed', true, 'user_id', v_user_id);
END;
$$;
