BEGIN;

-- NullSec — Function-level permission hardening (Milestone 14)
-- ------------------------------------------------------------------
-- PostgREST exposes RPC functions in the `public` schema to the role used
-- by the anon key. By default, PostgreSQL grants EXECUTE on functions to
-- PUBLIC, so an anonymous client could call internal helpers directly.
--
-- The critical one is `ns_create_session(p_user_id bigint)`: it is
-- SECURITY DEFINER and mints a valid session token for a caller-supplied
-- user_id. If callable by anon, any client could mint a session for ANY
-- existing user_id and impersonate them. It must never be exposed.
--
-- Intended exposure model:
--   - PUBLIC entry points (anon must call these — keep EXECUTE):
--       ns_register, ns_login, ns_logout, ns_validate_session,
--       ns_sync_push, ns_sync_pull, ns_activity, ns_metrics
--   - INTERNAL helper (never callable by anon/authenticated):
--       ns_create_session
--
-- ns_validate_session / ns_logout only ever operate on a token the caller
-- already holds (returning a user_id or revoking a session); they cannot be
-- abused to reach another user, so they stay public for the frontend.

REVOKE EXECUTE ON FUNCTION public.ns_create_session(bigint)
  FROM anon, authenticated;

-- Verify after applying:
--   SELECT proname, proacl FROM pg_proc
--   WHERE proname IN ('ns_create_session','ns_validate_session');

COMMIT;
