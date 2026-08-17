/**
 * NullSec — Milestone 19 test suite (LOCAL / MOCKED / STATIC).
 * Real Supabase + browser tests are BLOCKED (no project / no browser).
 *
 * Covers:
 *   1. Country metrics semantics: null (unavailable) vs 0, validation.
 *   2. ns_country_metrics via mock (aggregated, no individual data).
 *   3. Challenge semantics: unique_countries vs events (STATIC on SQL + mock).
 *   4. Storage policy: no account data in localStorage.
 *   5. Offline: zero backend, no fabricated stats.
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
console.log('== 1. Country metrics semantics: null vs 0 (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_OFF);
  const cm = h.W('CountryMetrics');

  // RPC returns null for unmeasured metrics, numbers for measured ones.
  const raw = {
    countries: {
      FR: { participants: null, missionActivity: 430, toolActivity: null, propagation: null, totalActivity: 850 }
    }
  };
  const n = cm.normalize(raw);
  ok(n.countries.FR.participants === null, 'participants null (unavailable) preserved');
  ok(n.countries.FR.toolActivity === null, 'toolActivity null preserved');
  ok(n.countries.FR.propagation === null, 'propagation null preserved');
  eq(n.countries.FR.missionActivity, 430, 'missionActivity numeric');
  eq(n.countries.FR.totalActivity, 850, 'totalActivity numeric');

  // A real 0 is distinguishable from null.
  const z = cm.normalize({ countries: { FR: { participants: 0, missionActivity: 0 } } });
  ok(z.countries.FR.participants === 0, 'participants 0 (real zero) preserved');
  eq(z.countries.FR.missionActivity, 0, 'missionActivity 0 preserved');

  // Invalid numbers → 0 (not null), negative/NaN/Inf/oversize coerced.
  const bad = cm.normalize({ countries: { FR: { missionActivity: NaN, totalActivity: -5, participants: 1e12 } } });
  eq(bad.countries.FR.missionActivity, 0, 'NaN → 0');
  eq(bad.countries.FR.totalActivity, 0, 'negative → 0');
  eq(bad.countries.FR.participants, 0, 'oversized → 0');

  // Unknown fields dropped.
  const leak = cm.normalize({ countries: { FR: { participants: 1, user_id: 'x', identity_id: 'y', username: 'z' } } });
  ok(leak.countries.FR.user_id === undefined && leak.countries.FR.username === undefined,
    'no individual identifiers leak');
}

/* ================================================================== */
console.log('== 2. ns_country_metrics via mock (MOCKED) ==');
{
  const h = makeHarness({ backend: { countryMetrics: () => ({
    countries: {
      FR: { participants: null, missionActivity: 430, toolActivity: null, propagation: null, totalActivity: 850 },
      DE: { participants: null, missionActivity: 380, toolActivity: null, propagation: null, totalActivity: 705 }
    }
  }) } });
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  const data = await h.W('CountryMetrics').getData();
  ok(data.unavailable === false, 'data available via mock');
  eq(data.countries.FR.totalActivity, 850, 'FR total');
  eq(data.countries.DE.missionActivity, 380, 'DE mission');
  ok(data.countries.FR.participants === null, 'unmeasured participants remain null');

  // Frontend calls the RPC through ApiClient.
  ok(h.calls.fetch.some(c => /ns_country_metrics/.test(c.url)), 'calls ns_country_metrics via ApiClient');
  // No individual identifiers in the request/response handling.
  const bodies = h.calls.fetch.map(c => JSON.stringify(c.init && c.init.body)).join(' ');
  ok(!/user_id|identity_id|username/.test(bodies), 'no individual identifiers in payload');

  // Malformed backend → unavailable, no fabricated stats.
  const h2 = makeHarness({ backend: { countryMetrics: () => null } });
  h2.load(LOAD_ORDER);
  cfg(h2, BACKEND_ON);
  const d2 = await h2.W('CountryMetrics').getData();
  ok(d2.unavailable === true && Object.keys(d2.countries).length === 0, 'malformed → unavailable');
}

/* ================================================================== */
console.log('== 3. Challenge semantics (STATIC) ==');
{
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = process.cwd();
  const activity = readFileSync(join(root, 'backend/supabase/functions/rpc_activity.sql'), 'utf8');
  const m6 = readFileSync(join(root, 'backend/supabase/migrations/0006_challenge_semantics.sql'), 'utf8');

  ok(/kind TEXT NOT NULL DEFAULT 'events'/.test(m6), 'kind column added');
  ok(/kind = 'unique_countries'/.test(m6), 'activate-countries challenge set to unique_countries');
  ok(/ON CONFLICT \(challenge_id, country_code\) DO NOTHING/.test(activity),
    'unique-country challenge dedup by country');
  ok(/COUNT\(\*\) FROM public\.challenge_progress/.test(activity),
    'unique-country current_value = distinct country count');
  ok(/kind = 'events'/.test(activity), 'event-based challenges still increment by 1 per activity');
}

/* ================================================================== */
console.log('== 4. Storage policy (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  h.W('RecoveryKey').ensure();
  h.W('Identity').init();
  await h.W('Auth').createAccount('tester', 'password123');
  const ls = JSON.stringify(h.localBacking);
  ok(!ls.includes('ns:identity') && !ls.includes('ns:user:profile') &&
     !ls.includes('ns:progress') && !ls.includes('ns:settings') &&
     !ls.includes('ns:auth') && !ls.includes('ns:recovery'), 'no account data in localStorage');
  ok(!/tok-|mock-token/.test(ls), 'no token in localStorage');
  const sessKeys = Object.keys(h.sessionBacking);
  ok(sessKeys.every(k => k === 'ns:session:auth' || k === 'ns:session:recovery'),
    'sessionStorage only approved keys');
}

/* ================================================================== */
console.log('== 5. Offline: zero backend, no fake stats (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_OFF);
  h.resetFetch();
  const data = await h.W('CountryMetrics').getData();
  ok(data.unavailable === true, 'offline → unavailable');
  eq(Object.keys(data.countries).length, 0, 'no fabricated country stats offline');
  eq(h.calls.fetch.filter(c => /rest\/v1/.test(c.url)).length, 0,
    'zero backend requests when Supabase disabled');
}

/* ------------------------------------------------------------------ */
const exitCode = summary() ? 0 : 1;
process.exit(exitCode);
