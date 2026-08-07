-- NullSec — Function-level permission hardening (Milestone 14)
-- ------------------------------------------------------------------
-- DEPLOYMENT-FIXED (this migration is now a documentation placeholder).
--
-- The function-level EXECUTE controls that lived here have been MOVED to
--   backend/supabase/functions/rpc_privileges.sql
-- and are applied AFTER the RPC functions are created (see scripts/deploy.sh).
--
-- WHY: deployment order is `migrations 0001→0016 -> RPC creation -> RPC
-- privilege hardening`. On a fresh database the RPC functions do not exist
-- when this migration runs, so `REVOKE EXECUTE ON FUNCTION public.ns_create_session(bigint)`
-- failed with `42883: function public.ns_create_session(bigint) does not exist`.
--
-- The intended exposure model is unchanged and enforced in rpc_privileges.sql:
--   - PUBLIC entry points (anon may call these): ns_register, ns_login,
--     ns_logout, ns_validate_session, ns_sync_push, ns_sync_pull, ns_activity,
--     ns_metrics, ns_country_metrics, ns_tool_activity, ns_update_profile,
--     ns_record_activity.
--   - INTERNAL helper (never callable by anon/authenticated):
--     ns_create_session.
--
-- This file is intentionally a no-op (kept so the 0001→0016 migration history
-- is preserved without renumbering). It is idempotent and compatible with a
-- fresh database.

BEGIN;

-- (function privileges now live in backend/supabase/functions/rpc_privileges.sql)

COMMIT;
