/**
 * NullSec — Milestone 22 test suite (LOCAL / MOCKED / STATIC).
 * Real Supabase + browser remain BLOCKED (no project / no browser).
 *
 * Covers (Part 6):
 *   1. Country flow states (NO_COUNTRY / SELECTING / SAVING / COUNTRY_SET / ERROR).
 *   2. Repository architecture (country-repository, no local persistence).
 *   3. Privacy checks (no individual identifiers, no public user→country mapping).
 *   4. No local persistence (no country in localStorage).
 *   5. Offline behavior (zero backend calls, no fabricated success).
 *   6. Unavailable metrics (null vs zero + availability).
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
console.log('== 1. Country flow states (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_OFF);
  const cs = h.W('CountryService');

  eq(cs.getState().status, 'NO_COUNTRY', 'initial state NO_COUNTRY');

  // select() opens the confirmation step.
  cs.select('FR');
  eq(cs.getState().status, 'SELECTING_COUNTRY', 'select → SELECTING_COUNTRY');
  eq(cs.getState().countryCode, 'FR', 'countryCode set');

  // invalid code → ERROR.
  cs.select('f');
  eq(cs.getState().status, 'ERROR', 'invalid code → ERROR');

  // Reset.
  cs.reset();
  eq(cs.getState().status, 'NO_COUNTRY', 'reset → NO_COUNTRY');
}

/* ================================================================== */
console.log('== 2. Country selection + save (MOCKED) ==');
{
  const h = makeHarness({ backend: { register: () => ({ token: 'tok-a', user_id: 1 }), validate: () => 1, updateProfile: () => ({}) } });
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  h.W('RecoveryKey').ensure();
  h.W('Identity').init();
  await h.W('Auth').createAccount('tester', 'password123');
  await h.W('Session').forceRecheck();

  const cs = h.W('CountryService');
  await cs.getCountries();
  cs.select('FR');
  const st = await cs.confirm();
  eq(st.status, 'COUNTRY_SET', 'confirm → COUNTRY_SET');
  eq(st.countryName, 'France', 'country name resolved');
  ok(h.W('CountryRepository').getCountry() === 'FR', 'repository in-memory set');

  // No individual identifiers in the country-save payload (ns_update_profile).
  // (register may legitimately carry identity_id; only check the country call.)
  const countryCalls = h.calls.fetch.filter(c => /ns_update_profile/.test(c.url));
  ok(countryCalls.length > 0, 'country saved via ApiClient (ns_update_profile)');
  const countryBody = String(countryCalls[0].init.body || '');
  // Only p_token + p_country_code (+ optional p_username=null) are sent; no real
  // user_id / identity_id / username values, and the country is an ISO code.
  ok(countryBody.indexOf('p_country_code') !== -1, 'country sent as p_country_code');
  ok(/p_country_code":\s*"[A-Z]{2}"/.test(countryBody), 'country is ISO-3166 alpha-2');
  ok(!/user_id|identity_id/.test(countryBody), 'no user_id/identity_id in country payload');
}

/* ================================================================== */
console.log('== 3. No local persistence, no token leakage (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_OFF);
  const cs = h.W('CountryService');
  cs.select('FR');
  const ls = JSON.stringify(h.localBacking);
  ok(!/country/i.test(ls.replace(/country-/g, '')), 'no country persisted in localStorage');
  ok(!/tok-|mock-token/.test(ls), 'no token in localStorage');
  const sessKeys = Object.keys(h.sessionBacking);
  ok(sessKeys.every(k => k === 'ns:session:auth' || k === 'ns:session:recovery'),
    'sessionStorage only approved keys');
}

/* ================================================================== */
console.log('== 4. Offline: no fabricated success, zero backend (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_OFF);
  h.resetFetch();
  const cs = h.W('CountryService');
  cs.select('FR');
  const st = await cs.confirm();
  eq(st.status, 'ERROR', 'offline confirm → ERROR (no fabricated success)');
  eq(h.calls.fetch.filter(c => /rest\/v1/.test(c.url)).length, 0,
    'zero backend requests when Supabase disabled');
  ok(h.W('CountryRepository').getCountry() === null, 'no country set offline');
}

/* ================================================================== */
console.log('== 5. Unavailable metrics: null vs zero + availability (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_OFF);
  const cm = h.W('CountryMetrics');
  const n = cm.normalize({ countries: { FR: { participants: null, missionActivity: 0, toolActivity: 5, propagation: null, totalActivity: 5 } } });
  ok(n.countries.FR.participants === null, 'participants null (unavailable)');
  eq(n.countries.FR.missionActivity, 0, 'missionActivity 0 (measured empty)');
  ok(n.countries.FR.availability.participants === false, 'participants unavailable');
  ok(n.countries.FR.availability.missionActivity === true, 'missionActivity available');
}

/* ================================================================== */
console.log('== 6. Privacy: no individual identifiers (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  const cm = h.W('CountryMetrics');
  const n = cm.normalize({ countries: { FR: { participants: 1, user_id: 'u', identity_id: 'i', username: 'x' } } });
  const keys = Object.keys(n.countries.FR).join(',');
  const allowed = ['participants', 'missionActivity', 'toolActivity', 'communityActivity', 'propagation', 'totalActivity', 'availability', 'lastUpdate'];
  ok(keys.split(',').every(k => allowed.indexOf(k) !== -1),
    'no individual identifiers in metrics');
}

/* ------------------------------------------------------------------ */
const exitCode = summary() ? 0 : 1;
process.exit(exitCode);
