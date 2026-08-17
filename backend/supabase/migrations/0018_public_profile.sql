-- NullSec — Public Profile customization (Milestone 38)
-- ------------------------------------------------------------------
-- Adds EXPLICIT public learning-identity fields to user_profiles. These are
-- the ONLY fields intended for public display (bio, learning interests, and
-- an opt-in flag controlling whether the public learning profile is visible).
--
-- All fields are OPTIONAL and bounded; none may contain arbitrary large JSON.
-- No credentials, recovery, session or internal IDs are added here.
--
-- Compatibility:
--   - Fresh database: runs cleanly.
--   - Deployed database (0001–0017): ALTER ... ADD COLUMN IF NOT EXISTS is
--     idempotent and non-destructive. Defaults keep existing rows valid.
-- RLS and RPC EXECUTE permissions are preserved (no widening).

BEGIN;

-- Opt-in: whether the public learning profile is shown to anonymous visitors.
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS public_profile_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Short public bio (bounded length).
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS bio TEXT;

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_bio_length_check;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_bio_length_check
  CHECK (bio IS NULL OR length(bio) <= 280);

-- Public learning interests: bounded to a fixed set of allowed tags (NOT
-- arbitrary JSON). Defaults to an empty array.
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS learning_interests TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_interests_length_check;
ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_interests_length_check
  CHECK (cardinality(learning_interests) <= 8);

COMMIT;
