/**
 * NullSec — Milestone 18 test suite (LOCAL / MOCKED / STATIC).
 * Real Supabase tests remain BLOCKED (no project).
 *
 * Covers:
 *   1. Storage policy (no account data / token / recovery in localStorage).
 *   2. Country metrics validation (valid/invalid codes, negative/NaN/Infinity,
 *      oversized, malformed, unknown fields, empty).
 *   3. Map: SVG creation, country lookup, unknown country, intensity classes,
 *      no crash on missing data.
 *   4. API: ns_country_metrics via mock, malformed response, unavailable
 *      backend, no fabricated statistics.
 *   5. Offline: zero backend requests, no fake country stats.
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
console.log('== 1. Storage policy (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  h.W('RecoveryKey').ensure();
  h.W('Identity').init();
  await h.W('Auth').register();

  const ls = JSON.stringify(h.localBacking);
  ok(!ls.includes('ns:identity') && !ls.includes('ns:user:profile') &&
     !ls.includes('ns:progress') && !ls.includes('ns:settings'),
    'no account data in localStorage');
  ok(!/tok-|mock-token|session/.test(ls.replace(/ns:session/, '')), 'no token in localStorage');
  ok(h.localBacking['ns:recovery'] === undefined, 'no recovery key in localStorage');

  const sessKeys = Object.keys(h.sessionBacking);
  ok(sessKeys.every(k => k === 'ns:session:auth' || k === 'ns:session:recovery'),
    'sessionStorage only approved keys');
}

/* ================================================================== */
console.log('== 2. Country metrics validation (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_OFF);
  const cm = h.W('CountryMetrics');

  // valid
  const okp = cm.normalize({ countries: { FR: { participants: 1, missionActivity: 2, toolActivity: 3, propagation: 4, totalActivity: 10 } } });
  eq(okp.countries.FR.totalActivity, 10, 'valid total');

  // invalid ISO codes
  const inv = cm.normalize({ countries: { fr: { totalActivity: 1 }, 'F': { totalActivity: 1 }, FRX: { totalActivity: 1 } } });
  ok(inv.countries.fr === undefined && inv.countries.F === undefined && inv.countries.FRX === undefined,
    'invalid ISO codes ignored');

  // negative / NaN / Infinity / oversized / non-numeric → 0
  const bad = cm.normalize({ countries: { FR: { participants: -1, missionActivity: NaN, toolActivity: Infinity, propagation: 1e12, totalActivity: 'x' } } });
  eq(bad.countries.FR.participants, 0, 'negative → 0');
  eq(bad.countries.FR.missionActivity, 0, 'NaN → 0');
  eq(bad.countries.FR.toolActivity, 0, 'Infinity → 0');
  eq(bad.countries.FR.propagation, 0, 'oversized → 0');
  eq(bad.countries.FR.totalActivity, 0, 'non-numeric → 0');

  // unknown fields dropped (no individual identifiers)
  const leak = cm.normalize({ countries: { FR: { participants: 1, user_id: 'x', identity_id: 'y', username: 'z' } } });
  ok(leak.countries.FR.user_id === undefined && leak.countries.FR.identity_id === undefined &&
     leak.countries.FR.username === undefined, 'no individual identifiers exposed');

  // malformed
  ok((function () { try { cm.normalize(null); return false; } catch (e) { return true; } })(), 'null rejected');
  ok((function () { try { cm.normalize(123); return false; } catch (e) { return true; } })(), 'scalar rejected');

  // empty dataset
  const empty = cm.normalize({ countries: {} });
  eq(Object.keys(empty.countries).length, 0, 'empty dataset ok');

  // intensity buckets
  eq(cm.intensity(0), 'none');
  eq(cm.intensity(3), 'very-low');
  eq(cm.intensity(10), 'low');
  eq(cm.intensity(50), 'medium');
  eq(cm.intensity(200), 'high');
  eq(cm.intensity(900), 'very-high');
  eq(cm.intensity(NaN), 'none');
}

/* ================================================================== */
console.log('== 3. Map (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_OFF);
  const map = h.W('EuropeMap');
  const cm = h.W('CountryMetrics');
  await cm.init();

  // country lookup
  ok(cm.getCountry('FR') && cm.getCountry('FR').name === 'France', 'FR → France');
  ok(cm.getCountry('DE') && cm.getCountry('DE').name === 'Germany', 'DE → Germany');
  ok(cm.getCountry('ES') && cm.getCountry('ES').name === 'Spain', 'ES → Spain');
  ok(cm.getCountry('ZZ') === null, 'unknown country → null (no crash)');

  // SVG creation + unknown codes do not crash
  const container = { querySelector: () => null, appendChild: () => {}, children: [] };
  let svg = map.render(container, {});
  ok(svg !== null, 'SVG created');
  ok(typeof map.COUNTRY_PATHS === 'object', 'has country paths');
  // apply empty + valid data must not throw
  map.applyActivity(svg, { countries: {} });
  map.applyActivity(svg, { countries: { FR: { totalActivity: 50 }, ZZ: { totalActivity: 999 } } });
  ok(true, 'applyActivity with missing/unknown codes does not crash');

  // intensity classes are strings
  const cls = cm.intensity(1000);
  ok(typeof cls === 'string' && cls.length > 0, 'intensity returns a string class');
}

/* ================================================================== */
console.log('== 4. API ns_country_metrics (MOCKED) ==');
{
  // Backend returns valid aggregate.
  const h = makeHarness({ backend: { countryMetrics: () => ({
    countries: { FR: { participants: 120, missionActivity: 430, toolActivity: 210, propagation: 90, totalActivity: 850 } }
  }) } });
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  const data = await h.W('CountryMetrics').getData();
  ok(data.unavailable === false, 'data available via mock');
  eq(data.countries.FR.totalActivity, 850, 'mock aggregate totalActivity');

  // Malformed backend response → unavailable, no fabricated stats.
  const h2 = makeHarness({ backend: { countryMetrics: () => null } });
  h2.load(LOAD_ORDER);
  cfg(h2, BACKEND_ON);
  const data2 = await h2.W('CountryMetrics').getData();
  ok(data2.unavailable === true, 'malformed response → unavailable');

  // Backend rejects (network error) → unavailable.
  const h3 = makeHarness({ backend: { fetch: () => Promise.reject(new TypeError('Failed to fetch')) } });
  h3.load(LOAD_ORDER);
  cfg(h3, BACKEND_ON);
  const data3 = await h3.W('CountryMetrics').getData();
  ok(data3.unavailable === true && Object.keys(data3.countries).length === 0,
    'network error → unavailable, no fake stats');

  // Frontend calls the RPC through ApiClient (no direct fetch).
  const urls = h.calls.fetch.map(c => c.url);
  ok(urls.some(u => /ns_country_metrics/.test(u)), 'ns_country_metrics called via ApiClient');
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
  eq(Object.keys(data.countries).length, 0, 'no fake country statistics offline');
  eq(h.calls.fetch.filter(c => /rest\/v1/.test(c.url)).length, 0,
    'zero backend requests when Supabase disabled');
}

/* ------------------------------------------------------------------ */
const exitCode = summary() ? 0 : 1;
process.exit(exitCode);
