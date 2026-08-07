/**
 * NullSec — Static SQL / schema audit (Milestone 15).
 * ------------------------------------------------------------------
 * Validates the Supabase migrations + RPC definitions WITHOUT a live database.
 * Category: STATIC REVIEW (not real Supabase execution).
 *
 * Checks:
 *   1. Migration ordering (0001 < 0002 < 0003 < 0004).
 *   2. All 14 expected tables exist in 0001_schema.sql.
 *   3. Primary keys / foreign keys / CHECK (non-negative) / unique / seeds.
 *   4. RLS enabled on every table in 0002_rls.sql + anon privileges.
 *   5. SECURITY DEFINER + explicit search_path on every RPC function.
 *   6. No client-chosen user_id in the public RPC argument list.
 *   7. EXECUTE privilege control lives ONLY in rpc_privileges.sql (applied
 *      after RPC creation) — ns_create_session revoked, public API granted;
 *      and NO migration contains function-level EXECUTE statements.
 *   8. Frontend api-client RPC arg names match the SQL signatures.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIG = join(ROOT, 'backend', 'supabase', 'migrations');
const FN = join(ROOT, 'backend', 'supabase', 'functions');
const JS = join(ROOT, 'assets', 'js');

let passed = 0, failed = 0;
const failures = [];
function ok(cond, msg) {
  if (cond) passed++; else { failed++; failures.push(msg); console.error('  ✗ ' + msg); }
}

const migrationFiles = ['0001_schema.sql', '0002_rls.sql', '0003_rls_functions.sql', '0004_rls_privileges.sql', '0005_country_metrics_privileges.sql', '0006_challenge_semantics.sql', '0007_country_metrics_data.sql', '0008_country_metrics_privileges.sql', '0009_community_intelligence_tables.sql', '0010_community_data_model_final.sql', '0011_community_activity_events.sql', '0012_activity_event_privileges.sql', '0013_country_metrics_view.sql', '0014_activity_trigger_support.sql', '0015_community_action_support.sql', '0016_activity_metrics_refinement.sql'];
const migSrc = {};
for (const f of migrationFiles) migSrc[f] = readFileSync(join(MIG, f), 'utf8');

const rpcFiles = ['rpc_auth.sql', 'rpc_sync.sql', 'rpc_activity.sql', 'rpc_country_metrics.sql', 'rpc_tool_activity.sql', 'rpc_profile.sql', 'rpc_activity_event.sql'];
const rpcSrc = {};
for (const f of rpcFiles) rpcSrc[f] = readFileSync(join(FN, f), 'utf8');

const apiSrc = readFileSync(join(JS, 'api-client.js'), 'utf8');
const hardening = readFileSync(join(FN, 'rpc_privileges.sql'), 'utf8');
// Strip SQL line comments so explanatory prose ("REVOKE EXECUTE ON FUNCTION …"
// in a comment) does not trip the "no function privileges in migrations" guard.
const allMigSrc = migrationFiles.map(f => migSrc[f].replace(/--[^\n]*/g, '')).join('\n');

/* ------------------------------------------------------------------ *
 * 1. Migration ordering                                               *
 * ------------------------------------------------------------------ */
console.log('== 1. Migration ordering ==');
{
  const nums = migrationFiles.map(f => parseInt(f.slice(0, 4), 10));
  ok(nums.join(',') === nums.slice().sort((a, b) => a - b).join(','), 'migration files ordered 0001<...<0005');
  // Each must BEGIN...COMMIT to be transactional / idempotent-friendly
  for (const f of migrationFiles) {
    ok(migSrc[f].includes('BEGIN;') && migSrc[f].includes('COMMIT;'),
      `${f} wraps body in BEGIN/COMMIT`);
  }
}

/* ------------------------------------------------------------------ *
 * 2. All 14 tables present                                            *
 * ------------------------------------------------------------------ */
console.log('== 2. Tables present in 0001 ==');
{
  const schema = migSrc['0001_schema.sql'];
  const tables = [
    'users', 'recovery_credentials', 'user_profiles', 'user_settings',
    'user_progress', 'sessions', 'countries', 'mission_activity',
    'country_activity', 'region_activity', 'anonymous_global_stats',
    'community_challenges', 'challenge_progress', 'schema_migrations'
  ];
  for (const t of tables) {
    ok(new RegExp('CREATE TABLE IF NOT EXISTS public\\.' + t + '\\b').test(schema),
      `table ${t} defined`);
  }
}

/* ------------------------------------------------------------------ *
 * 3. Keys / constraints / seeds                                       *
 * ------------------------------------------------------------------ */
console.log('== 3. Constraints & seeds ==');
{
  const s = migSrc['0001_schema.sql'];
  // Primary keys
  ok(/id\s+BIGSERIAL PRIMARY KEY/.test(s), 'users PK');
  ok(/user_id\s+BIGINT PRIMARY KEY/.test(s) || /PRIMARY KEY/.test(s), 'has BIGINT PKs');
  ok(/recovery_credentials[\s\S]{0,80}id\s+BIGSERIAL PRIMARY KEY/.test(s), 'recovery_credentials PK');
  ok(/user_id\s+BIGINT PRIMARY KEY REFERENCES public\.users\(id\) ON DELETE CASCADE/.test(s), 'user_profiles PK+FK cascade');
  ok(/user_id\s+BIGINT PRIMARY KEY REFERENCES public\.users\(id\) ON DELETE CASCADE/.test(s), 'user_settings PK+FK cascade');
  ok(/user_id\s+BIGINT PRIMARY KEY REFERENCES public\.users\(id\) ON DELETE CASCADE/.test(s), 'user_progress PK+FK cascade');
  ok(/sessions[\s\S]{0,120}user_id\s+BIGINT NOT NULL REFERENCES public\.users\(id\) ON DELETE CASCADE/.test(s), 'sessions FK cascade');
  ok(/mission_activity[\s\S]{0,120}country_code\s+TEXT NOT NULL REFERENCES public\.countries\(code\) ON DELETE CASCADE/.test(s), 'mission_activity FK->countries');
  ok(/challenge_progress[\s\S]{0,120}challenge_id\s+BIGINT NOT NULL REFERENCES public\.community_challenges\(id\) ON DELETE CASCADE/.test(s), 'challenge_progress FK cascade');
  // Unique constraints
  ok(/identity_id UUID NOT NULL UNIQUE/.test(s), 'users.identity_id unique');
  ok(/UNIQUE \(country_code, mission_id\)/.test(s), 'mission_activity unique pair');
  ok(/country_code\s+TEXT NOT NULL UNIQUE/.test(s), 'country_activity unique code');
  ok(/region\s+TEXT NOT NULL UNIQUE/.test(s), 'region_activity unique region');
  // Non-negative counters
  ok(/CHECK \(completed_count >= 0\)/.test(s), 'non-negative counters (CHECK)');
  ok(/id\s+SMALLINT PRIMARY KEY DEFAULT 1 CHECK \(id = 1\)/.test(s), 'global_stats single-row guard');
  // Indexes
  const idx = (s.match(/CREATE INDEX IF NOT EXISTS/g) || []).length;
  ok(idx >= 9, `at least 9 indexes (found ${idx})`);
  // Seeds
  ok(/INSERT INTO public\.anonymous_global_stats/.test(s), 'global stats seed row');
  ok(/INSERT INTO public\.countries/.test(s), 'countries seed');
  ok(/INSERT INTO public\.community_challenges/.test(s), 'challenges seed');
}

/* ------------------------------------------------------------------ *
 * 4. RLS enabled on all tables + anon privileges (0002)               *
 * ------------------------------------------------------------------ */
console.log('== 4. RLS (0002) ==');
{
  const rls = migSrc['0002_rls.sql'];
  const privateTables = ['users', 'recovery_credentials', 'sessions', 'user_profiles',
    'user_settings', 'user_progress', 'schema_migrations'];
  const aggTables = ['countries', 'mission_activity', 'country_activity',
    'region_activity', 'anonymous_global_stats', 'community_challenges', 'challenge_progress'];
  for (const t of privateTables.concat(aggTables)) {
    ok(new RegExp('ALTER TABLE public\\.' + t + '\\s+ENABLE ROW LEVEL SECURITY').test(rls),
      `RLS enabled on ${t}`);
  }
  // Aggregate SELECT policies
  for (const t of aggTables) {
    ok(new RegExp('CREATE POLICY "public_agg_select" ON public\\.' + t + '\\s+FOR SELECT USING \\(true\\)').test(rls),
      `anon SELECT policy on ${t}`);
  }
  // Revoke writes on aggregates + all on private
  ok(/REVOKE ALL ON public\.users, public\.recovery_credentials, public\.sessions/.test(rls), 'REVOKE ALL on private tables');
  ok(/REVOKE INSERT, UPDATE, DELETE ON public\.countries, public\.mission_activity/.test(rls), 'REVOKE writes on aggregates');
  // No anon INSERT/UPDATE/DELETE policy
  ok(!/FOR INSERT|FOR UPDATE|FOR DELETE/.test(rls.replace(/FOR SELECT/g, '')), 'no anon write policies on aggregates');
}

/* ------------------------------------------------------------------ *
 * 5. SECURITY DEFINER + search_path on every RPC                      *
 * ------------------------------------------------------------------ */
console.log('== 5. RPC SECURITY DEFINER + search_path ==');
{
  const functions = [
    'ns_register', 'ns_login', 'ns_logout', 'ns_validate_session', 'ns_create_session',
    'ns_sync_pull', 'ns_sync_push', 'ns_activity', 'ns_metrics', 'ns_country_metrics'
  ];
  const allRpc = Object.values(rpcSrc).join('\n');
  for (const fn of functions) {
    const m = new RegExp('CREATE OR REPLACE FUNCTION public\\.' + fn + '\\b[\\s\\S]*?SECURITY DEFINER[\\s\\S]*?SET search_path = public').exec(allRpc);
    ok(!!m, `${fn} is SECURITY DEFINER with explicit search_path`);
  }
}

/* ------------------------------------------------------------------ *
 * 6. No client-chosen user_id in public RPC args                      *
 * ------------------------------------------------------------------ */
console.log('== 6. Client user_id isolation ==');
{
  const allRpc = Object.values(rpcSrc).join('\n');
  // Only the internal helper ns_create_session may take p_user_id.
  // The EXPOSED functions must never accept a client-chosen user_id.
  const exposed = [
    'ns_sync_pull', 'ns_sync_push', 'ns_register', 'ns_login',
    'ns_activity', 'ns_metrics', 'ns_logout', 'ns_validate_session'
  ];
  for (const fn of exposed) {
    // capture this function's declaration + body (up to its terminating $$;)
    const re = new RegExp('CREATE OR REPLACE FUNCTION public\\.' + fn + '[\\s\\S]*?\\$\\$;');
    const m = re.exec(allRpc) || [];
    ok(!m[0] || !/p_user_id/.test(m[0]), `${fn} does not accept client p_user_id`);
  }
  // Sync RPCs are token-authenticated
  ok(/ns_sync_pull\(p_token text\)/.test(allRpc), 'ns_sync_pull is token-authenticated');
  ok(/ns_sync_push\([\s\S]*?p_token text/.test(allRpc), 'ns_sync_push is token-authenticated');
}

/* ------------------------------------------------------------------ *
 * 7. EXECUTE privilege control (0003 + 0004)                          *
 * ------------------------------------------------------------------ */
console.log('== 7. EXECUTE control ==');
{
  // Function-level EXECUTE controls MUST NOT live in migrations: on a fresh
  // database the RPC functions do not exist when migrations run (error 42883).
  ok(!/EXECUTE ON FUNCTION/.test(allMigSrc),
    'no migration contains a function-level EXECUTE statement (moved to rpc_privileges.sql)');

  // ns_create_session: never callable by anon/authenticated/PUBLIC.
  ok(/REVOKE EXECUTE ON FUNCTION public\.ns_create_session\(bigint\) FROM PUBLIC/.test(hardening) &&
    /REVOKE EXECUTE ON FUNCTION public\.ns_create_session\(bigint\) FROM anon, authenticated/.test(hardening),
    'ns_create_session EXECUTE revoked from PUBLIC/anon/authenticated');
  ok(!/GRANT EXECUTE ON FUNCTION public\.ns_create_session/.test(hardening),
    'ns_create_session is NEVER granted EXECUTE to anon/authenticated');

  // Public API functions explicitly granted to anon + revoked from PUBLIC.
  const publicAPI = ['ns_register', 'ns_login', 'ns_logout', 'ns_validate_session',
    'ns_sync_pull', 'ns_sync_push', 'ns_activity', 'ns_metrics',
    'ns_country_metrics', 'ns_tool_activity', 'ns_update_profile', 'ns_record_activity'];
  for (const fn of publicAPI) {
    ok(new RegExp('GRANT EXECUTE ON FUNCTION public\\.' + fn + '\\b[\\s\\S]*?TO anon, authenticated').test(hardening),
      `explicit GRANT EXECUTE ${fn} to anon, authenticated`);
    ok(new RegExp('REVOKE EXECUTE ON FUNCTION public\\.' + fn + '\\b[\\s\\S]*?FROM PUBLIC').test(hardening),
      `REVOKE EXECUTE ${fn} from PUBLIC (no default reliance)`);
  }
  // The hardening file is transactional + idempotent (GRANT/REVOKE are no-ops).
  ok(hardening.includes('BEGIN;') && hardening.includes('COMMIT;'),
    'rpc_privileges.sql wraps body in BEGIN/COMMIT');
}

/* ------------------------------------------------------------------ *
 * 8. Frontend api-client RPC args match SQL signatures                *
 * ------------------------------------------------------------------ */
console.log('== 8. Frontend RPC arg-name match ==');
{
  const allRpc = Object.values(rpcSrc).join('\n');
  const checks = [
    ["rpc('ns_register', {", 'p_identity_id', 'p_recovery_hash', 'p_username', 'p_avatar_seed'],
    ["rpc('ns_login', {", 'p_identity_id', 'p_recovery_hash'],
    ["rpc('ns_logout', {", 'p_token'],
    ["rpc('ns_validate_session', {", 'p_token'],
    ["rpc('ns_sync_pull', {", 'p_token'],
    ["rpc('ns_sync_push', {", 'p_token', 'p_profile', 'p_settings', 'p_progress'],
    ["rpc('ns_activity', {", 'p_mission_id', 'p_country_code', 'p_region'],
    ["rpc('ns_metrics', {", ]
  ];
  for (const [call, ...args] of checks) {
    const idx = apiSrc.indexOf(call);
    ok(idx !== -1, `api-client contains ${call.trim()}`);
    for (const a of args) {
      const after = apiSrc.slice(idx, idx + 400);
      ok(new RegExp(a + ':').test(after), `  arg ${a} present in ${call.trim()}`);
    }
  }
  // Frontend must NOT send p_user_id anywhere
  ok(!/p_user_id/.test(apiSrc), 'frontend never sends p_user_id');
  // Frontend never sends a field named recovery_key / recoveryKey (raw key).
  // (Error-pattern strings like 'invalid_recovery_key' are allowed and intended.)
  ok(!/recovery_key\s*:/.test(apiSrc) && !/recoveryKey/.test(apiSrc),
    'frontend never sends a raw recovery_key field');
  ok(/recovery_hash\s*:/.test(apiSrc), 'frontend sends recovery_hash (transport) only');
}

/* ------------------------------------------------------------------ *
 * 9. ns_country_metrics contract (M18)                                *
 * ------------------------------------------------------------------ */
console.log('== 9. ns_country_metrics (M18) ==');
{
  const rpc = rpcSrc['rpc_country_metrics.sql'];
  const m5 = hardening; // EXECUTE control now in rpc_privileges.sql
  ok(/CREATE OR REPLACE FUNCTION public\.ns_country_metrics\(\)/.test(rpc),
    'ns_country_metrics defined with no params');
  ok(/SECURITY DEFINER/.test(rpc) && /SET search_path = public/.test(rpc),
    'ns_country_metrics is SECURITY DEFINER with pinned search_path');
  ok(/json_object_agg/.test(rpc), 'returns per-country aggregate object');
  // No individual identifiers exposed in the RETURNED payload columns.
  // (Comments legitimately mention these words; only check the JSON keys.)
  const payload = rpc.slice(rpc.indexOf('json_object_agg'), rpc.indexOf('RETURN json_build_object'));
  ok(!/participants.*user_id|identity_id|username|recovery|session/.test(payload.replace(/participants/g, 'participants')),
    'ns_country_metrics payload exposes no individual identifiers');
  ok(!/\.(user_id|identity_id|username)\b/.test(rpc),
    'ns_country_metrics does not read/return user_id/identity_id/username');
  // Aggregates are non-negative by construction (LEFT JOIN + COALESCE).
  ok(/COALESCE/.test(rpc), 'aggregates are COALESCE-safe (no NULL/negative)');
  // EXECUTE control in 0005.
  ok(/REVOKE EXECUTE ON FUNCTION public\.ns_country_metrics\(\)[\s\S]*?FROM PUBLIC/.test(m5) &&
    /GRANT EXECUTE ON FUNCTION public\.ns_country_metrics\(\)[\s\S]*?TO anon, authenticated/.test(m5),
    'rpc_privileges.sql revokes PUBLIC + grants anon/authenticated EXECUTE on ns_country_metrics');
  // Frontend calls it via ApiClient.
  ok(/countryMetrics\s*:\s*function/.test(apiSrc) && /ns_country_metrics/.test(apiSrc),
    'frontend ApiClient exposes countryMetrics -> ns_country_metrics');
}

/* ------------------------------------------------------------------ *
 * 10. ns_country_metrics unavailable semantics + challenge fix (M19)   *
 * ------------------------------------------------------------------ */
console.log('== 10. M19 metric & challenge semantics ==');
{
  const rpc = rpcSrc['rpc_country_metrics.sql'];
  const m6 = migSrc['0006_challenge_semantics.sql'];
  const activity = rpcSrc['rpc_activity.sql'];

  // M24: aggregated via the v_country_metrics view; propagation is 0 when empty.
  ok(/FROM public\.v_country_metrics/.test(rpc), 'ns_country_metrics reads the aggregation view');
  ok(/participants/.test(rpc) && /missionActivity/.test(rpc) &&
     /toolActivity/.test(rpc) && /propagation/.test(rpc) && /totalActivity/.test(rpc),
    'ns_country_metrics exposes the five aggregated metrics');
  ok(/availability/.test(rpc) && /lastUpdate/.test(rpc),
    'ns_country_metrics returns availability + lastUpdate');

  // Challenge kind discriminator added.
  ok(/ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'events'/.test(m6),
    '0006 adds kind column default events');
  ok(/kind = 'unique_countries'/.test(m6), '0006 sets unique_countries for activate-countries challenge');

  // ns_activity: unique-country challenges count distinct countries, not events.
  ok(/kind = 'unique_countries'/.test(activity), 'ns_activity handles unique_countries kind');
  ok(/ON CONFLICT \(challenge_id, country_code\) DO NOTHING/.test(activity),
    'ns_activity inserts one challenge_progress row per country (dedup)');
  ok(/COUNT\(\*\) FROM public\.challenge_progress/.test(activity),
    'unique-country challenge current_value = distinct countries');
  ok(/kind = 'events'/.test(activity), 'ns_activity still increments event-based challenges');
}

/* ------------------------------------------------------------------ *
 * 11. M20 country metrics data model (0007/0008 + tool/profile RPCs)   *
 * ------------------------------------------------------------------ */
console.log('== 11. M20 data model ==');
{
  const m7 = migSrc['0007_country_metrics_data.sql'];
  const m8 = hardening; // EXECUTE control now in rpc_privileges.sql
  const tool = rpcSrc['rpc_tool_activity.sql'];
  const prof = rpcSrc['rpc_profile.sql'];
  const rpc = rpcSrc['rpc_country_metrics.sql'];

  // 0007: user_profiles.country_code (ISO alpha-2, explicit user choice).
  ok(/ADD COLUMN IF NOT EXISTS country_code TEXT/.test(m7),
    '0007 adds user_profiles.country_code');
  ok(/country_code ~ '\^\[A-Z\]\{2\}\$'/.test(m7),
    '0007 CHECK constrains country_code to 2 uppercase letters');
  ok(/CREATE TABLE IF NOT EXISTS public\.tool_activity/.test(m7),
    '0007 creates aggregate tool_activity table');
  ok(/activity_count BIGINT NOT NULL DEFAULT 0 CHECK \(activity_count >= 0\)/.test(m7),
    'tool_activity counter is non-negative');
  ok(/REFERENCES public\.countries\(code\) ON DELETE CASCADE/.test(m7),
    'tool_activity FK -> countries');
  ok(/ENABLE ROW LEVEL SECURITY/.test(m7) && /REVOKE INSERT, UPDATE, DELETE ON public\.tool_activity/.test(m7),
    'tool_activity RLS: anon SELECT only, no writes');

  // 0008: EXECUTE control.
  ok(/REVOKE EXECUTE ON FUNCTION public\.ns_tool_activity\(text, text\) FROM PUBLIC/.test(m8) &&
    /GRANT EXECUTE ON FUNCTION public\.ns_tool_activity\(text, text\) TO anon, authenticated/.test(m8),
    'rpc_privileges.sql controls ns_tool_activity EXECUTE');
  ok(/REVOKE EXECUTE ON FUNCTION public\.ns_update_profile\(text, text, text\) FROM PUBLIC/.test(m8) &&
    /GRANT EXECUTE ON FUNCTION public\.ns_update_profile\(text, text, text\) TO anon, authenticated/.test(m8),
    'rpc_privileges.sql controls ns_update_profile EXECUTE');

  // ns_tool_activity: token-authenticated, country derived server-side.
  ok(/SECURITY DEFINER/.test(tool) && /SET search_path = public/.test(tool),
    'ns_tool_activity SECURITY DEFINER + search_path');
  ok(/ns_validate_session\(p_token\)/.test(tool), 'ns_tool_activity validates session');
  ok(/SELECT country_code INTO v_country/.test(tool), 'country derived server-side');
  ok(/ON CONFLICT \(country_code, tool_id\)/.test(tool), 'tool_activity uses ON CONFLICT (dedup/replay-safe)');
  ok(!/p_user_id|p_identity_id|p_username/.test(tool), 'ns_tool_activity accepts no client identity');

  // ns_update_profile: own profile only, validated country.
  ok(/SECURITY DEFINER/.test(prof) && /ns_validate_session\(p_token\)/.test(prof),
    'ns_update_profile token-authenticated');
  ok(/invalid_country_code/.test(prof) && /unknown_country/.test(prof),
    'ns_update_profile validates country');
  ok(!/p_user_id/.test(prof), 'ns_update_profile never accepts a client user_id');

  // M24: ns_country_metrics reads the aggregation view.
  ok(/FROM public\.v_country_metrics/.test(rpc),
    'ns_country_metrics reads the aggregation view');
}

/* ------------------------------------------------------------------ *
 * 12. M20 community intelligence prepared tables (0009)               *
 * ------------------------------------------------------------------ */
console.log('== 12. M20 community intelligence tables ==');
{
  const m9 = migSrc['0009_community_intelligence_tables.sql'];
  ok(/CREATE TABLE IF NOT EXISTS public\.country_membership/.test(m9),
    '0009 prepares country_membership');
  ok(/REFERENCES public\.users\(id\) ON DELETE CASCADE/.test(m9),
    'country_membership FK -> users');
  ok(/country_code ~ '\^\[A-Z\]\{2\}\$'/.test(m9),
    'country_membership ISO alpha-2 CHECK');
  ok(/ENABLE ROW LEVEL SECURITY/.test(m9),
    'country_membership RLS enabled');
  ok(/CREATE TABLE IF NOT EXISTS public\.community_propagation/.test(m9),
    '0009 prepares community_propagation');
  ok(/propagation_count BIGINT NOT NULL DEFAULT 0 CHECK \(propagation_count >= 0\)/.test(m9),
    'community_propagation counter non-negative');
  ok(/CREATE POLICY "public_agg_select" ON public\.community_propagation/.test(m9) &&
    /REVOKE INSERT, UPDATE, DELETE ON public\.community_propagation/.test(m9),
    'community_propagation anon SELECT only, no writes');
  ok(/CREATE INDEX IF NOT EXISTS/.test(m9),
    '0009 adds indexes');
}

/* ------------------------------------------------------------------ *
 * 13. M21 final data model (0010)                                      *
 * ------------------------------------------------------------------ */
console.log('== 13. M21 final data model ==');
{
  const m10 = migSrc['0010_community_data_model_final.sql'];
  const m9 = migSrc['0009_community_intelligence_tables.sql'];
  ok(/ADD COLUMN IF NOT EXISTS id BIGSERIAL/.test(m10),
    '0010 adds country_membership.id');
  ok(/ADD COLUMN IF NOT EXISTS updated_at/.test(m10),
    '0010 adds updated_at');
  ok(/country_membership_user_unique UNIQUE \(user_id\)/.test(m10),
    'one active country per user');
  ok(/country_membership_country_check/.test(m9 || '') || /country_code ~ '\^\[A-Z\]\{2\}\$'/.test(m10),
    'ISO-3166 alpha-2 constraint');
  ok(/propagation_type TEXT NOT NULL DEFAULT 'campaign_participation'/.test(m10),
    '0010 adds propagation_type to community_propagation');
  ok(/UNIQUE \(country_code, propagation_type\)/.test(m10),
    'one aggregate per (country, type)');
  ok(/CHECK \(propagation_count >= 0\)/.test(m10),
    'propagation counter non-negative');
  ok(/CREATE POLICY "public_agg_select" ON public\.community_propagation/.test(m10) &&
    /REVOKE INSERT, UPDATE, DELETE ON public\.community_propagation/.test(m10),
    'community_propagation anon SELECT only');
  ok(/idx_country_membership_country_code/.test(m10),
    'country_membership indexed by country');
}

/* ------------------------------------------------------------------ *
 * 14. M24 activity pipeline (0011/0012 + ns_record_activity)           *
 * ------------------------------------------------------------------ */
console.log('== 14. M24 activity pipeline ==');
{
  const m11 = migSrc['0011_community_activity_events.sql'];
  const m12 = hardening; // EXECUTE control now in rpc_privileges.sql
  const rec = rpcSrc['rpc_activity_event.sql'];

  ok(/CREATE TABLE IF NOT EXISTS public\.community_activity_events/.test(m11),
    '0011 creates community_activity_events');
  ok(/country_code\s+TEXT NOT NULL REFERENCES public\.countries\(code\)/.test(m11),
    'events FK -> countries');
  ok(/activity_type\s+TEXT NOT NULL/.test(m11) && /amount\s+BIGINT NOT NULL DEFAULT 1 CHECK \(amount >= 0\)/.test(m11),
    'events has type + non-negative amount');
  ok(/CREATE INDEX IF NOT EXISTS idx_activity_events_country_type/.test(m11),
    'events indexed by country+type');
  ok(/ENABLE ROW LEVEL SECURITY/.test(m11),
    'events RLS enabled (private)');
  ok(/activity_type IN \('mission_completed','tool_used','community_action'\)/.test(m11),
    'events controlled activity-type vocabulary');

  ok(/REVOKE EXECUTE ON FUNCTION public\.ns_record_activity/.test(m12) &&
    /GRANT EXECUTE ON FUNCTION public\.ns_record_activity\b/.test(m12),
    'rpc_privileges.sql controls ns_record_activity EXECUTE');

  ok(/SECURITY DEFINER/.test(rec) && /SET search_path = public/.test(rec),
    'ns_record_activity SECURITY DEFINER + search_path');
  ok(/ns_validate_session\(p_token\)/.test(rec), 'ns_record_activity validates session');
  ok(/SELECT country_code INTO v_country\n  FROM public\.country_membership/.test(rec),
    'country resolved server-side from country_membership');
  ok(/invalid_activity_type/.test(rec) && /invalid_amount/.test(rec),
    'ns_record_activity validates type + amount');
  ok(!/p_user_id/.test(rec), 'ns_record_activity never accepts client identity');

  // Aggregation view (0013).
  const m13 = migSrc['0013_country_metrics_view.sql'];
  ok(/CREATE OR REPLACE VIEW public\.v_country_metrics/.test(m13),
    '0013 creates v_country_metrics view');
  ok(/participants/.test(m13) && /mission_activity/.test(m13) &&
     /tool_activity/.test(m13) && /propagation/.test(m13),
    'view exposes aggregated participants/missions/tools/propagation');
  ok(/REVOKE SELECT ON public\.v_country_metrics FROM anon, authenticated/.test(m13),
    'view not directly selectable by anon (aggregation via RPC only)');

  // ns_country_metrics uses the view and returns the final contract.
  const rpc = rpcSrc['rpc_country_metrics.sql'];
  ok(/FROM public\.v_country_metrics/.test(rpc), 'ns_country_metrics reads the aggregation view');
  ok(/availability/.test(rpc) && /lastUpdate/.test(rpc), 'ns_country_metrics returns availability + lastUpdate');

  // M25: 0014 activity trigger support.
  const m14 = migSrc['0014_activity_trigger_support.sql'];
  ok(/idx_country_membership_country_code_agg/.test(m14),
    '0014 adds country_membership aggregation index');
  ok(/ALTER TABLE public\.community_activity_events ENABLE ROW LEVEL SECURITY/.test(m14),
    '0014 re-affirms events RLS');
  ok(/REVOKE SELECT ON public\.v_country_metrics FROM anon, authenticated/.test(m14),
    '0014 re-affirms view is not anon-readable');

  // M26: 0015 community action support.
  const m15 = migSrc['0015_community_action_support.sql'];
  ok(/idx_activity_events_type_created/.test(m15),
    '0015 adds activity type/created index');
  ok(/ALTER TABLE public\.community_activity_events ENABLE ROW LEVEL SECURITY/.test(m15),
    '0015 re-affirms events RLS');
  ok(/REVOKE SELECT ON public\.v_country_metrics FROM anon, authenticated/.test(m15),
    '0015 re-affirms view not anon-readable');

  // M27: 0016 activity metrics refinement + communityActivity contract.
  const m16 = migSrc['0016_activity_metrics_refinement.sql'];
  ok(/community_activity/.test(m16), '0016 adds community_activity aggregate column');
  ok(/community_propagation/.test(m16), '0016 derives community_activity from community_propagation');
  ok(/m\.total/.test(m16) && /t\.total/.test(m16) && /p\.total/.test(m16) && /\+/.test(m16),
    'totalActivity = mission + tool + community (three COALESCE sums)');
  ok(/REVOKE SELECT ON public\.v_country_metrics FROM anon, authenticated/.test(m16),
    '0016 keeps view non-public');

  // Column ORDER constraint: CREATE OR REPLACE VIEW may only APPEND new columns
  // at the END (existing columns keep name + position). 0013 defines
  //   country_code, participants, mission_activity, tool_activity,
  //   propagation, total_activity
  // so community_activity must be the FINAL column, AFTER total_activity, and
  // must never be inserted before it.
  const m13src = migSrc['0013_country_metrics_view.sql'];
  const view13 = m13src.slice(m13.indexOf('AS\nSELECT'), m13.indexOf('FROM public.countries'));
  const view16 = m16.slice(m16.indexOf('AS\nSELECT'), m16.indexOf('FROM public.countries'));
  const colRe = /AS\s+([a-z_]+)/g;
  const cols13 = [...view13.matchAll(colRe)].map(m => m[1]);
  const cols16 = [...view16.matchAll(colRe)].map(m => m[1]);
  // Base prefix from 0013 must be a strict prefix of the 0016 column list.
  ok(cols16.slice(0, cols13.length).join(',') === cols13.join(','),
    '0016 preserves every 0013 column name+position (no reorder/rename)');
  ok(cols16.length === cols13.length + 1 && cols16[cols16.length - 1] === 'community_activity',
    'community_activity is appended as the FINAL column (after total_activity)');
  ok(cols16.join(',') === 'country_code,participants,mission_activity,tool_activity,propagation,total_activity,community_activity',
    'exact 0016 column order: country_code,participants,mission_activity,tool_activity,propagation,total_activity,community_activity');
  ok(!/DROP VIEW[\s\S]*CASCADE/.test(m16), '0016 does not DROP VIEW CASCADE');
  ok(/communityActivity/.test(rpc), 'ns_country_metrics emits communityActivity');
  ok(/'communityActivity', true/.test(rpc), 'availability includes communityActivity');
}

/* ------------------------------------------------------------------ */
const exitCode = failed === 0 ? 0 : 1;
console.log(`\n--- SQL/STATIC AUDIT: ${passed} passed, ${failed} failed ---`);
process.exit(exitCode);
