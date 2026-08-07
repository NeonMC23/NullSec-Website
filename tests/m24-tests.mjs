/**
 * NullSec — Milestone 24 test suite (LOCAL / MOCKED / STATIC).
 * Real Supabase + browser remain BLOCKED (no project / no browser).
 *
 * Covers (Part 9):
 *   1. Storage: no account/country/activity persistence.
 *   2. Activity: valid activity creation, invalid rejection, invalid amount,
 *      offline behavior.
 *   3. Privacy: no individual data exposure, no public user→country mapping,
 *      no tracking fields.
 *   4. Metrics: null vs zero, unavailable states, aggregation behavior.
 *   5. SQL security (STATIC): RLS, SECURITY DEFINER, search_path, grants.
 */
import { makeHarness, LOAD_ORDER, ok, eq, summary } from './run-tests.mjs';

const BACKEND_ON = {
  offlineMode: false, backendEnabled: true, authEnabled: true, syncEnabled: true,
  supabaseEnabled: true, supabaseUrl: 'https://project.supabase.co', supabaseAnonKey: 'anon'
};
const BACKEND_OFF = {
  offlineMode: true, backendEnabled: false, authEnabled: false, syncEnabled: false,
  supabaseEnabled: false, supabaseUrl: null, supabaseAnonKey: null
};
function cfg(h, patch) {
  Object.assign(h.W('Config').get(), {
    offlineMode: true, authEnabled: false, backendEnabled: false, syncEnabled: false,
    supabaseEnabled: false, supabaseUrl: null, supabaseAnonKey: null
  }, patch || {});
}

/* ================================================================== */
console.log('== 1. Storage: no account/country/activity persistence (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  h.W('RecoveryKey').ensure();
  h.W('Identity').init();
  await h.W('Auth').register();
  const ls = JSON.stringify(h.localBacking);
  ok(!ls.includes('ns:identity') && !ls.includes('ns:user:profile') &&
     !ls.includes('ns:progress') && !ls.includes('ns:settings') &&
     !ls.includes('ns:auth') && !ls.includes('ns:user:state') &&
     !ls.includes('ns:recovery'), 'no account data in localStorage');
  ok(!/country|activity/i.test(ls), 'no country/activity persisted in localStorage');
  ok(!/tok-|mock-token/.test(ls), 'no token in localStorage');
  const sessKeys = Object.keys(h.sessionBacking);
  ok(sessKeys.every(k => k === 'ns:session:auth' || k === 'ns:session:recovery'),
    'sessionStorage only approved keys');
}

/* ================================================================== */
console.log('== 2. Activity via ApiClient (MOCKED) ==');
{
  // recordActivity requires a token; mock returns ok.
  const h = makeHarness({ backend: { register: () => ({ token: 'tok-a', user_id: 1 }), validate: () => 1, recordActivity: () => ({ ok: true }) } });
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  h.W('RecoveryKey').ensure();
  h.W('Identity').init();
  await h.W('Auth').register();
  const token = h.W('Sync').getToken();
  ok(!!token, 'has a session token');

  // Valid activity call goes through ApiClient (ns_record_activity), not direct fetch.
  const res = await h.W('ApiClient').recordActivity(token, { activity_type: 'mission_completed', amount: 1 });
  ok(res && res.ok === true, 'valid activity recorded via ApiClient');
  const calls = h.calls.fetch.filter(c => /ns_record_activity/.test(c.url));
  ok(calls.length > 0, 'called ns_record_activity via ApiClient');

  // No individual identifiers in the activity payload (only p_token + type + amount).
  const body = JSON.stringify(calls[0].init.body);
  ok(!/user_id|identity_id|username/.test(body), 'no individual identifiers in activity payload');
  ok(/mission_completed/.test(body), 'activity type sent');

  // Invalid activity (no token) rejected without network.
  h.resetFetch();
  const bad = await h.W('ApiClient').recordActivity('', { activity_type: 'mission_completed' }).then(() => 'ok', e => e);
  eq(h.W('ApiClient').describe(bad).type, 'UNAUTHORIZED', 'no token → invalid_token (UNAUTHORIZED)');
}

/* ================================================================== */
console.log('== 3. Offline: zero backend, activity unavailable (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_OFF);
  h.resetFetch();
  await h.W('Session').forceRecheck();
  const data = await h.W('CountryMetrics').getData();
  ok(data.unavailable === true, 'country metrics unavailable offline');
  eq(h.calls.fetch.filter(c => /rest\/v1/.test(c.url)).length, 0,
    'zero backend requests when Supabase disabled');
}

/* ================================================================== */
console.log('== 4. Metrics: null vs zero + availability + aggregation (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_OFF);
  const cm = h.W('CountryMetrics');

  // null (unavailable) vs 0 (measured empty).
  const n = cm.normalize({ countries: { FR: { participants: null, missionActivity: 0, toolActivity: 5, propagation: null, totalActivity: 5 } } });
  ok(n.countries.FR.participants === null, 'participants null (unavailable)');
  eq(n.countries.FR.missionActivity, 0, 'missionActivity 0 (measured empty)');
  ok(n.countries.FR.availability.participants === false, 'participants unavailable');
  ok(n.countries.FR.availability.missionActivity === true, 'missionActivity available');
}

/* ================================================================== */
console.log('== 5. Privacy: no individual data, no tracking fields (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  const cm = h.W('CountryMetrics');
  const n = cm.normalize({ countries: { FR: { participants: 1, user_id: 'u', identity_id: 'i', username: 'x', ip: '1.2.3.4', gps: '0,0', device_id: 'd' } } });
  const keys = Object.keys(n.countries.FR).join(',');
  const allowed = ['participants', 'missionActivity', 'toolActivity', 'communityActivity', 'propagation', 'totalActivity', 'availability', 'lastUpdate'];
  ok(keys.split(',').every(k => allowed.indexOf(k) !== -1),
    'no individual/tracking fields in metrics (only aggregate keys)');
}

/* ================================================================== */
console.log('== 6. SQL security (STATIC) ==');
{
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = process.cwd();
  const m11 = readFileSync(join(root, 'backend/supabase/migrations/0011_community_activity_events.sql'), 'utf8');
  const m12 = readFileSync(join(root, 'backend/supabase/functions/rpc_privileges.sql'), 'utf8');
  const m13 = readFileSync(join(root, 'backend/supabase/migrations/0013_country_metrics_view.sql'), 'utf8');
  const rec = readFileSync(join(root, 'backend/supabase/functions/rpc_activity_event.sql'), 'utf8');

  // events table private (RLS, no anon).
  ok(/ENABLE ROW LEVEL SECURITY/.test(m11), 'events RLS enabled');
  ok(!/public_agg_select/.test(m11), 'no anon SELECT policy on events');

  // ns_record_activity SECURITY DEFINER + search_path + validation.
  ok(/SECURITY DEFINER/.test(rec) && /SET search_path = public/.test(rec),
    'ns_record_activity SECURITY DEFINER + search_path');
  ok(/ns_validate_session\(p_token\)/.test(rec), 'session validated');
  ok(/invalid_activity_type/.test(rec) && /invalid_amount/.test(rec),
    'type + amount validated');
  ok(!/p_user_id/.test(rec), 'no client identity accepted');

  // EXECUTE control (0012): revoke PUBLIC + grant anon/authenticated.
  ok(/REVOKE EXECUTE ON FUNCTION public\.ns_record_activity/.test(m12) &&
    /GRANT EXECUTE ON FUNCTION public\.ns_record_activity/.test(m12),
    '0012 controls EXECUTE');

  // Aggregation view not exposed to anon.
  ok(/REVOKE SELECT ON public\.v_country_metrics FROM anon, authenticated/.test(m13),
    'aggregation view not anon-readable');
}

/* ------------------------------------------------------------------ */
const exitCode = summary() ? 0 : 1;
process.exit(exitCode);
