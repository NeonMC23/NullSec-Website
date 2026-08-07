-- NullSec — RPC privilege hardening (final deployment step).
-- ------------------------------------------------------------------
-- WHY THIS FILE EXISTS (fresh-database deployment fix):
--   On a fresh Supabase database, PostgreSQL defaults EXECUTE on functions
--   to PUBLIC. The function-level EXECUTE controls must therefore reference
--   existing functions. But the deployment order is:
--
--     migrations 0001→0016  ->  RPC creation  ->  RPC privilege hardening
--
--   The migrations run BEFORE the rpc_*.sql files, so function-privilege
--   statements cannot live inside a migration (they would hit error 42883,
--   e.g. "function public.ns_create_session(bigint) does not exist").
--
--   For this reason all REVOKE/GRANT ... ON FUNCTION statements were moved
--   OUT of migrations 0003/0004/0005/0008/0012 and consolidated here. This
--   file MUST be applied AFTER every rpc_*.sql file has been created (see
--   scripts/deploy.sh — it is applied last).
--
-- Exposure model (unchanged from Milestone 14/15):
--   - PUBLIC API (anon + authenticated call these via PostgREST): explicit
--     EXECUTE grant, default PUBLIC grant revoked.
--   - INTERNAL helper ns_create_session(bigint): NEVER callable by anon or
--     authenticated. SECURITY DEFINER callers (ns_register / ns_login) still
--     invoke it because they execute with the definer's privileges.
--
-- The service-role key is a superuser-equivalent role and retains EXECUTE
-- independently; it is never present in frontend code.
--
-- Idempotent: GRANT is a no-op when already granted; REVOKE is a no-op when
-- the grant does not exist. Safe to re-apply and compatible with a fresh DB.

BEGIN;

-- --- Revoke the default PUBLIC grant on every RPC ----------------------
REVOKE EXECUTE ON FUNCTION public.ns_register(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ns_login(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ns_logout(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ns_validate_session(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ns_sync_pull(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ns_sync_push(text, json, json, json) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ns_activity(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ns_metrics() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ns_country_metrics() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ns_tool_activity(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ns_update_profile(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ns_record_activity(text, text, bigint, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ns_create_session(bigint) FROM PUBLIC;

-- --- Grant the intended public API to anon + authenticated ------------
GRANT EXECUTE ON FUNCTION public.ns_register(uuid, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ns_login(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ns_logout(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ns_validate_session(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ns_sync_pull(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ns_sync_push(text, json, json, json) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ns_activity(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ns_metrics() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ns_country_metrics() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ns_tool_activity(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ns_update_profile(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ns_record_activity(text, text, bigint, text) TO anon, authenticated;

-- --- Internal helper: NOT callable by anon/authenticated --------------
REVOKE EXECUTE ON FUNCTION public.ns_create_session(bigint) FROM anon, authenticated;

-- Verify after applying (from psql):
--   SELECT proname, proacl FROM pg_proc
--   WHERE proname IN
--     ('ns_register','ns_login','ns_logout','ns_validate_session',
--      'ns_sync_pull','ns_sync_push','ns_activity','ns_metrics',
--      'ns_country_metrics','ns_tool_activity','ns_update_profile',
--      'ns_record_activity','ns_create_session');
-- ns_create_session should have NO proacl entry for anon/authenticated/PUBLIC.
-- The public API functions should list anon + authenticated (exec), no PUBLIC.

COMMIT;
