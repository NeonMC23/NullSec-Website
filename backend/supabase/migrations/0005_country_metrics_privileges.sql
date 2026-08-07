-- NullSec — Explicit EXECUTE control for ns_country_metrics (Milestone 18)
-- ------------------------------------------------------------------
-- DEPLOYMENT-FIXED (this migration is now a documentation placeholder).
--
-- The EXECUTE control for ns_country_metrics() has been MOVED to
--   backend/supabase/functions/rpc_privileges.sql
-- and is applied AFTER the RPC functions are created (see scripts/deploy.sh).
--
-- WHY: deployment order is `migrations 0001→0016 -> RPC creation -> RPC
-- privilege hardening`. On a fresh database ns_country_metrics() does not
-- exist when this migration runs, so `REVOKE/GRANT EXECUTE ON FUNCTION public.ns_country_metrics()`
-- failed with `42883 ... function ... does not exist`.
--
-- The intent is unchanged: ns_country_metrics is a public, anonymous,
-- read-only aggregate RPC — granted to anon + authenticated, default PUBLIC
-- grant revoked. It exposes ONLY aggregated country statistics (SECURITY
-- DEFINER with a pinned search_path over public aggregate tables).
--
-- This file is intentionally a no-op (kept so the 0001→0016 migration history
-- is preserved without renumbering). It is idempotent and compatible with a
-- fresh database.

BEGIN;

-- (function privileges now live in backend/supabase/functions/rpc_privileges.sql)

COMMIT;

-- Verify after applying (in psql, once RPCs + rpc_privileges.sql exist):
--   SELECT proname, proacl FROM pg_proc
--   WHERE proname = 'ns_country_metrics';
-- Expected: proacl shows anon + authenticated (exec), no PUBLIC.
