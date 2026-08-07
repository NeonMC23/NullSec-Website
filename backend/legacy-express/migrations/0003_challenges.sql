-- NullSec — Migration 0003: community challenges (Milestone 11)
-- Anonymous, aggregate-based global challenges. No user contribution history.

BEGIN;

-- community_challenges: anonymous global challenges
CREATE TABLE IF NOT EXISTS community_challenges (
  id            BIGSERIAL PRIMARY KEY,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  target_value  BIGINT NOT NULL DEFAULT 0,
  current_value BIGINT NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active',  -- active | completed
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- challenge_progress: aggregated contribution per challenge/country
CREATE TABLE IF NOT EXISTS challenge_progress (
  id                BIGSERIAL PRIMARY KEY,
  challenge_id      BIGINT NOT NULL REFERENCES community_challenges(id) ON DELETE CASCADE,
  country_code      TEXT NOT NULL,
  contribution_count BIGINT NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, country_code)
);

CREATE INDEX IF NOT EXISTS idx_challenge_progress_challenge ON challenge_progress(challenge_id);
CREATE INDEX IF NOT EXISTS idx_challenges_status ON community_challenges(status);

-- Seed a few anonymous global challenges.
INSERT INTO community_challenges (title, description, target_value, current_value, status) VALUES
  ('Europe Mission Week', 'Complete missions across Europe together this week.', 10000, 0, 'active'),
  ('10000 missions worldwide', 'Reach 10000 completed missions as a global community.', 10000, 0, 'active'),
  ('Activate 5 new countries', 'Bring activity to 5 new countries.', 5, 0, 'active')
ON CONFLICT DO NOTHING;

COMMIT;
