BEGIN;

-- NullSec — Supabase RLS / permissions (Milestone 13.1)
-- The browser uses the anon key, so the database MUST NOT rely on it being
-- secret. All sensitive writes go through SECURITY DEFINER RPC functions.
--
-- Model:
--  - Private user tables (users, recovery_credentials, sessions,
--    user_profiles, user_settings, user_progress): NO anon access at all.
--  - Aggregate/public tables (countries, country_activity, region_activity,
--    mission_activity, anonymous_global_stats, community_challenges,
--    challenge_progress): anon SELECT allowed (public aggregate read), but
--    NO anon INSERT/UPDATE/DELETE — writes happen only via RPC.
--  - schema_migrations: no anon access.
-- The service-role key bypasses RLS (Supabase default) for admin operations.

-- ---------- Enable RLS on all tables ----------
ALTER TABLE public.users                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_credentials   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schema_migrations      ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.countries              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_activity       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.country_activity       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.region_activity        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anonymous_global_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_challenges   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_progress     ENABLE ROW LEVEL SECURITY;

-- ---------- Private tables: deny anon entirely ----------
-- By default, RLS with no policy denies everything for anon/authenticated.
-- These tables are only reachable through SECURITY DEFINER RPC functions.

-- ---------- Public aggregate tables: anon SELECT only ----------
DROP POLICY IF EXISTS "public_agg_select" ON public.countries;
CREATE POLICY "public_agg_select" ON public.countries
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "public_agg_select" ON public.mission_activity;
CREATE POLICY "public_agg_select" ON public.mission_activity
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "public_agg_select" ON public.country_activity;
CREATE POLICY "public_agg_select" ON public.country_activity
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "public_agg_select" ON public.region_activity;
CREATE POLICY "public_agg_select" ON public.region_activity
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "public_agg_select" ON public.anonymous_global_stats;
CREATE POLICY "public_agg_select" ON public.anonymous_global_stats
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "public_agg_select" ON public.community_challenges;
CREATE POLICY "public_agg_select" ON public.community_challenges
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "public_agg_select" ON public.challenge_progress;
CREATE POLICY "public_agg_select" ON public.challenge_progress
  FOR SELECT USING (true);

-- Revoke anon/authenticated INSERT/UPDATE/DELETE on aggregate tables
-- (defense in depth; RPC functions are SECURITY DEFINER so they bypass this).
REVOKE ALL ON public.users, public.recovery_credentials, public.sessions,
  public.user_profiles, public.user_settings, public.user_progress,
  public.schema_migrations
  FROM anon, authenticated;

REVOKE INSERT, UPDATE, DELETE ON public.countries, public.mission_activity,
  public.country_activity, public.region_activity, public.anonymous_global_stats,
  public.community_challenges, public.challenge_progress
  FROM anon, authenticated;

COMMIT;
