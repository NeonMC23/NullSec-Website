/**
 * NullSec — Milestone 21 test suite (LOCAL / MOCKED / STATIC).
 * Real Supabase + browser remain BLOCKED (no project / no browser).
 *
 * Covers (Part 7):
 *   1. Storage: no account persistence, no token leakage.
 *   2. Privacy: no individual identifiers, no public user→country mapping.
 *   3. Metrics: null vs zero, availability metadata, unavailable states.
 *   4. Architecture: repositories only, no direct Store access in services.
 *   5. Offline: zero backend calls.
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
console.log('== 1. Storage: no account persistence, no token leakage (LOCAL) ==');
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
     !ls.includes('ns:auth') && !ls.includes('ns:user:state') &&
     !ls.includes('ns:recovery'), 'no account data in localStorage');
  ok(!/tok-|mock-token/.test(ls), 'no token in localStorage');
  ok(h.localBacking['ns:recovery'] === undefined, 'no recovery key in localStorage');
  const sessKeys = Object.keys(h.sessionBacking);
  ok(sessKeys.every(k => k === 'ns:session:auth' || k === 'ns:session:recovery'),
    'sessionStorage only approved keys');
}

/* ================================================================== */
console.log('== 2. Privacy: no individual identifiers, no public mapping (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  const cm = h.W('CountryMetrics');
  const raw = {
    countries: { FR: { participants: 5, missionActivity: 10, user_id: 'u1', identity_id: 'i1', username: 'x' } }
  };
  const n = cm.normalize(raw);
  const keys = Object.keys(n.countries.FR).join(',');
  const allowed = ['participants', 'missionActivity', 'toolActivity', 'communityActivity', 'propagation', 'totalActivity', 'availability', 'lastUpdate'];
  ok(keys.split(',').every(k => allowed.indexOf(k) !== -1),
    'no individual identifiers (user_id/identity_id/username) in metrics');
  // No public user→country mapping: each country exposes aggregates only, and
  // there is no endpoint/key that maps a specific user to a country.
  const str = JSON.stringify(n.countries.FR);
  ok(!/user_id|identity_id|username/.test(str), 'no user→country mapping exposed');
}

/* ================================================================== */
console.log('== 3. Metrics: null vs zero + availability (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_OFF);
  const cm = h.W('CountryMetrics');

  // null (unavailable) vs 0 (measured empty).
  const n = cm.normalize({ countries: { FR: { participants: null, missionActivity: 0, toolActivity: 5, propagation: null, totalActivity: 5 } } });
  ok(n.countries.FR.participants === null, 'participants null (unavailable)');
  eq(n.countries.FR.missionActivity, 0, 'missionActivity 0 (measured empty)');
  eq(n.countries.FR.toolActivity, 5, 'toolActivity measured');

  // Availability metadata (M21).
  ok(n.countries.FR.availability.participants === false, 'participants unavailable');
  ok(n.countries.FR.availability.missionActivity === true, 'missionActivity available');
  ok(n.countries.FR.availability.toolActivity === true, 'toolActivity available');
  ok(n.countries.FR.availability.propagation === false, 'propagation unavailable');

  // lastUpdate metadata (global, non-individual).
  const d = cm.normalize({ countries: { FR: { participants: 1, lastUpdate: '2026-08-07T00:00:00Z' } } });
  eq(d.countries.FR.lastUpdate, '2026-08-07T00:00:00Z', 'lastUpdate preserved');
  const d2 = cm.normalize({ countries: { FR: { participants: 1 } } });
  ok(d2.countries.FR.lastUpdate === null, 'lastUpdate null when absent');
}

/* ================================================================== */
console.log('== 4. Architecture: repositories only, no direct Store (STATIC) ==');
{
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = process.cwd();
  for (const f of ['identity.js', 'user-profile.js', 'settings-service.js', 'progress-service.js']) {
    const src = readFileSync(join(root, 'assets/js', f), 'utf8');
    const code = src.split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    ok(!/Store\.(get|save|delete)(Identity|Profile|Progress|Settings)\(/.test(code),
      f + ' has no direct Store account-data access');
  }
  for (const r of ['identity-repository', 'profile-repository', 'progress-repository', 'settings-repository']) {
    const src = readFileSync(join(root, 'assets/js/repositories', r + '.js'), 'utf8');
    ok(/get: get/.test(src) && /save: save/.test(src) && /clear: clear/.test(src),
      r + ' exposes get/save/clear');
  }
}

/* ================================================================== */
console.log('== 5. Offline: zero backend calls (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_OFF);
  h.resetFetch();
  await h.W('Session').forceRecheck();
  const data = await h.W('CountryMetrics').getData();
  ok(data.unavailable === true, 'offline → unavailable');
  eq(Object.keys(data.countries).length, 0, 'no fabricated country stats');
  eq(h.calls.fetch.filter(c => /rest\/v1/.test(c.url)).length, 0,
    'zero backend requests when Supabase disabled');
}

/* ------------------------------------------------------------------ */
const exitCode = summary() ? 0 : 1;
process.exit(exitCode);
