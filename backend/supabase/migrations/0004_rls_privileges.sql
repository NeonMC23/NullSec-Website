BEGIN;

-- NullSec — Explicit EXECUTE privilege control (Milestone 15)
-- ------------------------------------------------------------------
-- PostgreSQL grants EXECUTE on functions to PUBLIC by default. This is
-- convenient but undocumented, and leaves every SECURITY DEFINER function in
-- the `public` schema callable by any role unless revoked. This migration
-- makes the intended exposure model EXPLICIT instead of relying on defaults.
--
-- Model:
--   - PUBLIC API (anon + authenticated roles call these via PostgREST): grant
--     EXECUTE explicitly. Signatures match backend/supabase/functions/rpc_*.sql.
--   - INTERNAL helper (ns_create_session): revoke from anon/authenticated/PUBLIC.
--     SECURITY DEFINER callers (ns_register/ns_login) still invoke it because
--     they execute with the definer's privileges.
--
-- The service-role key is a superuser-equivalent role and retains EXECUTE
-- independently; it is never present in frontend code.

-- --- Revoke the default PUBLIC grant on all RPC functions -----------------
REVOKE EXECUTE ON FUNCTION public.ns_register(uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ns_login(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ns_logout(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ns_validate_session(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ns_sync_pull(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ns_sync_push(text, json, json, json) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ns_activity(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ns_metrics() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ns_create_session(bigint) FROM PUBLIC;

-- --- Grant the intended public API to anon + authenticated ----------------
GRANT EXECUTE ON FUNCTION public.ns_register(uuid, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ns_login(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ns_logout(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ns_validate_session(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ns_sync_pull(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ns_sync_push(text, json, json, json) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ns_activity(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ns_metrics() TO anon, authenticated;

-- --- Internal helper: NOT callable by anon/authenticated ------------------
REVOKE EXECUTE ON FUNCTION public.ns_create_session(bigint) FROM anon, authenticated;

-- Verify after applying (from psql):
--   SELECT proname, proacl FROM pg_proc
--   WHERE proname IN
--     ('ns_register','ns_login','ns_logout','ns_validate_session',
--      'ns_sync_pull','ns_sync_push','ns_activity','ns_metrics',
--      'ns_create_session');
-- ns_create_session should have NO proacl entry for anon/authenticated.

COMMIT;
