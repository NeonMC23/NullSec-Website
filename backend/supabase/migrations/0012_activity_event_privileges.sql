-- NullSec — EXECUTE control for ns_record_activity (Milestone 24)
-- ------------------------------------------------------------------
-- Follows the pattern of 0004/0005/0008: no reliance on the PostgreSQL default
-- (PUBLIC) grant.
--
--   ns_record_activity(p_token text, p_activity_type text, p_amount bigint,
--                      p_country_code text)
-- is a token-authenticated write RPC: granted to anon+authenticated (the anon
-- key carries the session token; unauthenticated calls are rejected at runtime
-- with 'unauthorized').

BEGIN;

REVOKE EXECUTE ON FUNCTION public.ns_record_activity(text, text, bigint, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ns_record_activity(text, text, bigint, text)
  TO anon, authenticated;

COMMIT;

-- Verify after applying:
--   SELECT proname, proacl FROM pg_proc
--   WHERE proname = 'ns_record_activity';
-- Expected: anon + authenticated (exec), no PUBLIC.
