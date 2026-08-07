-- NullSec — Explicit EXECUTE control for ns_tool_activity / ns_update_profile
-- (Milestone 20)
-- ------------------------------------------------------------------
-- DEPLOYMENT-FIXED (this migration is now a documentation placeholder).
--
-- The EXECUTE controls that lived here have been MOVED to
--   backend/supabase/functions/rpc_privileges.sql
-- and are applied AFTER the RPC functions are created (see scripts/deploy.sh).
--
-- WHY: deployment order is `migrations 0001→0016 -> RPC creation -> RPC
-- privilege hardening`. On a fresh database ns_tool_activity / ns_update_profile
-- do not exist when this migration runs, so `REVOKE/GRANT EXECUTE ON FUNCTION`
-- failed with `42883 ... function ... does not exist`.
--
-- The intent is unchanged (enforced in rpc_privileges.sql):
--   ns_country_metrics()   → public, anonymous, read-only aggregate.
--   ns_tool_activity(...)  → token-authenticated (needs a valid session).
--   ns_update_profile(...) → token-authenticated (updates own profile).
-- All three are granted to anon+authenticated; the token-authenticated ones
-- reject anonymous calls at runtime (unauthorized) but are reachable via the
-- anon key + a session token, matching the auth architecture.
--
-- This file is intentionally a no-op (kept so the 0001→0016 migration history
-- is preserved without renumbering). It is idempotent and compatible with a
-- fresh database.

BEGIN;

-- (function privileges now live in backend/supabase/functions/rpc_privileges.sql)

COMMIT;

-- Verify after applying (in psql, once RPCs + rpc_privileges.sql exist):
--   SELECT proname, proacl FROM pg_proc
--   WHERE proname IN ('ns_country_metrics','ns_tool_activity','ns_update_profile');
-- Expected: anon + authenticated (exec), no PUBLIC.
