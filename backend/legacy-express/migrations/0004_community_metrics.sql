-- NullSec — Migration 0004: community impact metrics (Milestone 12)
-- Aggregated, anonymous impact counters. No individual events stored long-term.

BEGIN;

-- Extend anonymous_global_stats with regional + total-completed metrics.
ALTER TABLE anonymous_global_stats
  ADD COLUMN IF NOT EXISTS total_completed BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_regions  INTEGER NOT NULL DEFAULT 0;

-- country_activity: aggregated per-country completion counters.
CREATE TABLE IF NOT EXISTS country_activity (
  id              BIGSERIAL PRIMARY KEY,
  country_code    TEXT NOT NULL UNIQUE,
  completed_count BIGINT NOT NULL DEFAULT 0 CHECK (completed_count >= 0),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- region_activity: aggregated per-region completion counters.
CREATE TABLE IF NOT EXISTS region_activity (
  id              BIGSERIAL PRIMARY KEY,
  region          TEXT NOT NULL UNIQUE,
  completed_count BIGINT NOT NULL DEFAULT 0 CHECK (completed_count >= 0),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- mission_activity already exists (0002) with completed_count + last_activity_at.
-- Add non-negative constraint and index if not present.
ALTER TABLE mission_activity
  DROP CONSTRAINT IF EXISTS mission_activity_count_nonneg;
ALTER TABLE mission_activity
  ADD CONSTRAINT mission_activity_count_nonneg CHECK (completed_count >= 0);

-- challenge_progress: add completion_percent column (0003 already exists).
ALTER TABLE challenge_progress
  ADD COLUMN IF NOT EXISTS completion_percent NUMERIC(5,2) NOT NULL DEFAULT 0;

-- Indexes for aggregation-friendly access (existing indexes on
-- mission_activity.country_code / mission_id already exist from 0002).
CREATE INDEX IF NOT EXISTS idx_country_activity_code ON country_activity(country_code);
CREATE INDEX IF NOT EXISTS idx_region_activity_region ON region_activity(region);
CREATE INDEX IF NOT EXISTS idx_challenge_progress_challenge2 ON challenge_progress(challenge_id);

COMMIT;
