-- NullSec — Explicit EXECUTE control for ns_country_metrics (Milestone 18)
-- ------------------------------------------------------------------
-- Follows the pattern established in 0004_rls_privileges.sql: do NOT rely on
-- the PostgreSQL default (PUBLIC) grant. ns_country_metrics is a public,
-- anonymous, read-only aggregate RPC — explicitly grant it to anon +
-- authenticated, and revoke the default PUBLIC grant.
--
-- ns_country_metrics exposes ONLY aggregated country statistics. It takes no
-- input and cannot be abused to read private tables (SECURITY DEFINER with a
-- pinned search_path that only touches public aggregate tables).

BEGIN;

REVOKE EXECUTE ON FUNCTION public.ns_country_metrics()
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.ns_country_metrics()
  TO anon, authenticated;

COMMIT;

-- Verify after applying:
--   SELECT proname, proacl FROM pg_proc
--   WHERE proname = 'ns_country_metrics';
-- Expected: proacl shows anon + authenticated (exec), no PUBLIC.
