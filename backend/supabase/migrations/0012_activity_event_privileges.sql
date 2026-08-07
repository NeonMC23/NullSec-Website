-- NullSec — EXECUTE control for ns_record_activity (Milestone 24)
-- ------------------------------------------------------------------
-- DEPLOYMENT-FIXED (this migration is now a documentation placeholder).
--
-- The EXECUTE control for ns_record_activity has been MOVED to
--   backend/supabase/functions/rpc_privileges.sql
-- and is applied AFTER the RPC functions are created (see scripts/deploy.sh).
--
-- WHY: deployment order is `migrations 0001→0016 -> RPC creation -> RPC
-- privilege hardening`. On a fresh database ns_record_activity does not exist
-- when this migration runs, so `REVOKE/GRANT EXECUTE ON FUNCTION` failed with
-- `42883 ... function ... does not exist`.
--
-- The intent is unchanged (enforced in rpc_privileges.sql):
--   ns_record_activity(p_token text, p_activity_type text, p_amount bigint,
--                      p_country_code text)
-- is a token-authenticated write RPC: granted to anon+authenticated (the anon
-- key carries the session token; unauthenticated calls are rejected at runtime
-- with 'unauthorized').
--
-- This file is intentionally a no-op (kept so the 0001→0016 migration history
-- is preserved without renumbering). It is idempotent and compatible with a
-- fresh database.

BEGIN;

-- (function privileges now live in backend/supabase/functions/rpc_privileges.sql)

COMMIT;

-- Verify after applying (in psql, once RPCs + rpc_privileges.sql exist):
--   SELECT proname, proacl FROM pg_proc
--   WHERE proname = 'ns_record_activity';
-- Expected: anon + authenticated (exec), no PUBLIC.
