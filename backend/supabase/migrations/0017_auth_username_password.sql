-- NullSec — Username + Password authentication (Milestone 32)
-- ------------------------------------------------------------------
-- Replaces identity_id + recovery-key-only authentication with
-- username + password as the PRIMARY sign-in, while keeping the recovery
-- key as an account-recovery mechanism. NO email is used.
--
--   users.username        — private login identifier (unique, case-insensitive).
--   users.password_hash   — salted bcrypt hash of the SHA-256 password transport
--                           hash (never the raw password). See rpc_auth.sql.
--
-- Compatibility:
--   - Fresh database: runs cleanly.
--   - Deployed database (0001–0016 already applied): ALTER ... IF NOT EXISTS
--     and CREATE ... IF NOT EXISTS make it idempotent and non-destructive.
--   - Existing accounts: users.username is backfilled best-effort from
--     user_profiles.username where a non-default value exists; password_hash
--     stays NULL for legacy accounts (they authenticate via the recovery flow
--     until they set a password).
-- RLS and RPC EXECUTE permissions are preserved (no widening).

BEGIN;

-- 1. Private login identifier (NULL allowed for legacy accounts without a
--    username yet; new accounts always set it).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS username TEXT;

-- 2. Password hash (NULL until the account has a password; only a bcrypt hash,
--    never a raw password).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- 3. Case-insensitive uniqueness for login.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx
  ON public.users (lower(username))
  WHERE username IS NOT NULL;

-- 4. Username format (when present): 3–32 chars, letters/digits/._-.
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_username_format_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_username_format_check
  CHECK (username IS NULL OR (
    length(username) >= 3
    AND length(username) <= 32
    AND username ~ '^[A-Za-z0-9._-]+$'
  ));

-- 5. Best-effort backfill for existing accounts from user_profiles (only where
--    a non-default, non-colliding username exists). password_hash is left NULL:
--    legacy accounts authenticate via the recovery flow.
UPDATE public.users u
SET username = lower(p.username)
FROM public.user_profiles p
WHERE u.id = p.user_id
  AND u.username IS NULL
  AND p.username IS NOT NULL
  AND p.username <> 'Anonymous'
  AND NOT EXISTS (
    SELECT 1 FROM public.users u2
    WHERE u2.username IS NOT NULL
      AND lower(u2.username) = lower(p.username)
  );

COMMIT;
