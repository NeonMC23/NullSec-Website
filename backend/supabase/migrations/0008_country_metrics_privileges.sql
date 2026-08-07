-- NullSec — Explicit EXECUTE control for ns_tool_activity / ns_update_profile
-- (Milestone 20)
-- ------------------------------------------------------------------
-- Follows the pattern of 0004/0005: do NOT rely on the PostgreSQL default
-- (PUBLIC) grant.
--
--   ns_country_metrics()  → public, anonymous, read-only aggregate.
--   ns_tool_activity(...) → token-authenticated (needs a valid session).
--   ns_update_profile(...)→ token-authenticated (updates own profile).
-- Both are granted to anon+authenticated; the token-authenticated ones simply
-- reject anonymous calls at runtime (unauthorized) but are reachable via the
-- anon key + a session token, matching the auth architecture.

BEGIN;

-- ns_tool_activity(p_token text, p_tool_id text)
REVOKE EXECUTE ON FUNCTION public.ns_tool_activity(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ns_tool_activity(text, text) TO anon, authenticated;

-- ns_update_profile(p_token text, p_username text, p_country_code text)
REVOKE EXECUTE ON FUNCTION public.ns_update_profile(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ns_update_profile(text, text, text) TO anon, authenticated;

-- ns_country_metrics() already controlled by 0005; reconfirm here for clarity.
REVOKE EXECUTE ON FUNCTION public.ns_country_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ns_country_metrics() TO anon, authenticated;

COMMIT;

-- Verify after applying:
--   SELECT proname, proacl FROM pg_proc
--   WHERE proname IN ('ns_country_metrics','ns_tool_activity','ns_update_profile');
-- Expected: anon + authenticated (exec), no PUBLIC.
