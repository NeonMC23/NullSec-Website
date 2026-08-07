-- NullSec — Migration 0002: community statistics foundation (Milestone 9/10)
-- Aggregated, anonymous community metrics only.
-- No exact user location, no IP storage, no fingerprinting.

BEGIN;

-- countries: known countries with mission availability (reference)
CREATE TABLE IF NOT EXISTS countries (
  id                 BIGSERIAL PRIMARY KEY,
  code               TEXT NOT NULL UNIQUE,        -- ISO 3166-1 alpha-2, e.g. 'FR'
  name               TEXT NOT NULL DEFAULT '',
  region             TEXT NOT NULL DEFAULT 'Europe',
  active             BOOLEAN NOT NULL DEFAULT FALSE,
  missions_available INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- mission_activity: aggregated completion counts per mission/country
CREATE TABLE IF NOT EXISTS mission_activity (
  id               BIGSERIAL PRIMARY KEY,
  mission_id       TEXT NOT NULL,
  country_code     TEXT NOT NULL REFERENCES countries(code) ON DELETE CASCADE,
  completed_count  BIGINT NOT NULL DEFAULT 0,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (country_code, mission_id)
);

-- anonymous_global_stats: aggregated global anonymous metrics
CREATE TABLE IF NOT EXISTS anonymous_global_stats (
  id                 SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  active_users       BIGINT NOT NULL DEFAULT 0,
  completed_missions BIGINT NOT NULL DEFAULT 0,
  countries_active   INTEGER NOT NULL DEFAULT 0,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed a single global stats row.
INSERT INTO anonymous_global_stats (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Seed European country reference (code, name, region, active, missions_available).
INSERT INTO countries (code, name, region, active, missions_available) VALUES
  ('FR','France','Europe',TRUE,25),
  ('DE','Germany','Europe',TRUE,25),
  ('GB','United Kingdom','Europe',TRUE,25),
  ('ES','Spain','Europe',TRUE,25),
  ('IT','Italy','Europe',TRUE,25),
  ('NL','Netherlands','Europe',TRUE,25),
  ('BE','Belgium','Europe',TRUE,25),
  ('CH','Switzerland','Europe',TRUE,25),
  ('AT','Austria','Europe',TRUE,25),
  ('PT','Portugal','Europe',TRUE,25),
  ('SE','Sweden','Europe',TRUE,25),
  ('NO','Norway','Europe',TRUE,25),
  ('DK','Denmark','Europe',TRUE,25),
  ('FI','Finland','Europe',TRUE,25),
  ('IE','Ireland','Europe',TRUE,25),
  ('PL','Poland','Europe',TRUE,25),
  ('CZ','Czechia','Europe',TRUE,25),
  ('SK','Slovakia','Europe',TRUE,25),
  ('HU','Hungary','Europe',TRUE,25),
  ('RO','Romania','Europe',TRUE,25),
  ('BG','Bulgaria','Europe',TRUE,25),
  ('GR','Greece','Europe',TRUE,25),
  ('HR','Croatia','Europe',TRUE,25),
  ('SI','Slovenia','Europe',TRUE,25),
  ('EE','Estonia','Europe',TRUE,25),
  ('LV','Latvia','Europe',TRUE,25),
  ('LT','Lithuania','Europe',TRUE,25)
ON CONFLICT (code) DO NOTHING;

-- Proper indexes for aggregation-friendly access.
CREATE INDEX IF NOT EXISTS idx_mission_activity_country ON mission_activity(country_code);
CREATE INDEX IF NOT EXISTS idx_mission_activity_mission ON mission_activity(mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_activity_updated ON mission_activity(updated_at);
CREATE INDEX IF NOT EXISTS idx_countries_active ON countries(active);

COMMIT;
