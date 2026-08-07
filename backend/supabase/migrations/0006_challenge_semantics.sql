-- NullSec — Challenge semantics fix (Milestone 19)
-- ------------------------------------------------------------------
-- Milestone 15 identified that ns_activity incremented EVERY active
-- challenge by one per activity, making "Activate 5 new countries"
-- semantically wrong (it counted activity events, not distinct countries).
--
-- This migration introduces a `kind` discriminator on community_challenges:
--   kind = 'events'            : current_value counts activity events (each
--                                 anonymous activity adds 1).
--   kind = 'unique_countries'  : current_value counts DISTINCT countries that
--                                 have produced at least one activity
--                                 (derived from challenge_progress).
--
-- challenge_progress already exists (UNIQUE(challenge_id, country_code)) and
-- is the correct place to track unique-country participation. We repurpose it
-- to drive unique-country challenges.
--
-- No destructive change to existing rows: default kind = 'events' preserves
-- the behaviour of event-based challenges (Europe Mission Week, 10000 missions).

BEGIN;

ALTER TABLE public.community_challenges
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'events';

-- The "activate unique countries" challenge is country-count based.
UPDATE public.community_challenges
  SET kind = 'unique_countries'
  WHERE title = 'Activate 5 new countries';

COMMIT;
