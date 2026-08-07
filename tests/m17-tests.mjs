/**
 * NullSec — Milestone 17 test suite (LOCAL / MOCKED / STATIC).
 * Covers:
 *   1. Storage: no account data (identity/profile/progress/settings) in
 *      localStorage; sessionStorage only approved session keys.
 *   2. Session: unavailable backend does not authenticate; invalid session
 *      cleared; no local-account resurrection.
 *   3. Country metrics validation: valid/invalid codes, negative/NaN/Infinity,
 *      oversized, unknown fields, malformed/empty response.
 *   4. Map: country lookup + unknown codes do not crash.
 *   5. Offline: 0 backend requests, no fake activity data.
 * Real Supabase tests remain BLOCKED (no project).
 */
import { makeHarness, LOAD_ORDER, ok, eq, summary } from './run-tests.mjs';

const BACKEND_OFF = {
  offlineMode: true, backendEnabled: false, authEnabled: false, syncEnabled: false,
  supabaseEnabled: false, supabaseUrl: null, supabaseAnonKey: null
};
const BACKEND_ON = {
  offlineMode: false, backendEnabled: true, authEnabled: true, syncEnabled: true,
  supabaseEnabled: true, supabaseUrl: 'https://project.supabase.co', supabaseAnonKey: 'anon'
};

function cfg(h, patch) {
  Object.assign(h.W('Config').get(), {
    offlineMode: true, authEnabled: false, backendEnabled: false, syncEnabled: false,
    supabaseEnabled: false, supabaseUrl: null, supabaseAnonKey: null
  }, patch || {});
}

/* ================================================================== */
console.log('== 1. Storage: no account data in localStorage (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  h.W('RecoveryKey').ensure();
  h.W('Identity').init();
  h.W('UserProfile').init();
  h.W('Settings').init();
  await h.W('Progress').init();
  await h.W('Auth').register();

  const keys = Object.keys(h.localBacking).join(',');
  ok(!keys.includes('ns:identity'), 'no identity in localStorage');
  ok(!keys.includes('ns:user:profile'), 'no profile in localStorage');
  ok(!keys.includes('ns:progress'), 'no progress in localStorage');
  ok(!keys.includes('ns:settings'), 'no settings in localStorage');
  ok(!keys.includes('ns:recovery'), 'no recovery key in localStorage');
  ok(!keys.includes('ns:auth'), 'no auth state in localStorage');
  ok(!keys.includes('ns:user:state'), 'no account flag in localStorage');
  ok(!JSON.stringify(h.localBacking).includes('tok-'), 'no session token in localStorage');

  // sessionStorage only approved keys
  const sessKeys = Object.keys(h.sessionBacking);
  ok(sessKeys.every(k => k === 'ns:session:auth' || k === 'ns:session:recovery'),
    'sessionStorage only approved keys (got: ' + sessKeys.join(',') + ')');
}

/* ================================================================== */
console.log('== 2. Session: no resurrection; unavailable not authenticated (LOCAL) ==');
{
  // Simulate a leftover localStorage account cache from an old version.
  const h = makeHarness();
  h.localBacking['ns:identity'] = JSON.stringify({ id: 'stale-identity', version: 1 });
  h.localBacking['ns:progress'] = JSON.stringify({ version: 1, identity_id: 'stale-identity' });
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_OFF);

  // The Store migrate() should have purged stale account data.
  ok(h.localBacking['ns:identity'] === undefined, 'stale identity purged from localStorage');
  ok(h.localBacking['ns:progress'] === undefined, 'stale progress purged from localStorage');
  ok(!h.W('Auth').isAuthenticated(), 'no authentication from cached data');
  ok(h.W('UserState').getMode() !== 'authenticated', 'no local-account resurrection');

  // Unavailable backend does not authenticate.
  await h.W('Session').forceRecheck();
  ok(!h.W('Auth').isAuthenticated(), 'unavailable backend does not authenticate (LOCAL)');
}

/* ================================================================== */
console.log('== 3. Country metrics validation (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_OFF);
  const cm = h.W('CountryMetrics');

  // Valid payload.
  const ok1 = cm.normalize({ countries: { FR: { participants: 42, missionActivity: 183, toolActivity: 71, propagation: 25, totalActivity: 279 } } });
  eq(ok1.countries.FR.participants, 42, 'valid participants');
  eq(ok1.countries.FR.totalActivity, 279, 'valid totalActivity');

  // Lowercase / invalid country code ignored.
  const ok2 = cm.normalize({ countries: { fr: { participants: 1 }, 'F': { participants: 1 }, 'FRX': { participants: 1 } } });
  ok(ok2.countries.fr === undefined, 'lowercase code ignored');
  ok(ok2.countries.F === undefined, 'single-char code ignored');
  ok(ok2.countries.FRX === undefined, '3-char code ignored');

  // Negative / NaN / Infinity / oversized coerced to 0.
  const bad = cm.normalize({ countries: { FR: { participants: -5, missionActivity: NaN, toolActivity: Infinity, propagation: 1e12, totalActivity: 'x' } } });
  eq(bad.countries.FR.participants, 0, 'negative coerced to 0');
  eq(bad.countries.FR.missionActivity, 0, 'NaN coerced to 0');
  eq(bad.countries.FR.toolActivity, 0, 'Infinity coerced to 0');
  eq(bad.countries.FR.propagation, 0, 'oversized coerced to 0');
  eq(bad.countries.FR.totalActivity, 0, 'non-numeric coerced to 0');

  // Unknown fields dropped (no individual identifiers leak through).
  const leak = cm.normalize({ countries: { FR: { participants: 1, user_id: 'x', identity_id: 'y', username: 'z' } } });
  ok(leak.countries.FR.user_id === undefined, 'user_id not exposed');
  ok(leak.countries.FR.identity_id === undefined, 'identity_id not exposed');
  ok(leak.countries.FR.username === undefined, 'username not exposed');

  // Malformed / empty response.
  ok(function () { try { cm.normalize(null); return false; } catch (e) { return true; } }(), 'null payload rejected');
  ok(function () { try { cm.normalize(42); return false; } catch (e) { return true; } }(), 'scalar payload rejected');
  const empty = cm.normalize({ countries: {} });
  eq(Object.keys(empty.countries).length, 0, 'empty payload is fine');

  // Intensity buckets.
  eq(cm.intensity(0), 'none');
  eq(cm.intensity(3), 'very-low');
  eq(cm.intensity(10), 'low');
  eq(cm.intensity(50), 'medium');
  eq(cm.intensity(200), 'high');
  eq(cm.intensity(1000), 'very-high');
  eq(cm.intensity(NaN), 'none');
  eq(cm.intensity(-1), 'none');
}

/* ================================================================== */
console.log('== 4. Map country lookup + unknown codes (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_OFF);
  const map = h.W('EuropeMap');

  // Country lookup via CountryMetrics reference (data/countries.json).
  const cm = h.W('CountryMetrics');
  await cm.init();
  const fr = cm.getCountry('FR');
  ok(fr && fr.name === 'France', 'FR → France');
  const de = cm.getCountry('DE');
  ok(de && de.name === 'Germany', 'DE → Germany');
  const es = cm.getCountry('ES');
  ok(es && es.name === 'Spain', 'ES → Spain');
  ok(cm.getCountry('XX') === null, 'unknown code → null (no crash)');

  // EuropeMap has a path per country and applies classes without crashing.
  const container = { querySelector: () => null, appendChild: () => {}, _svg: null };
  const origQ = container.querySelector;
  container.querySelector = function (sel) {
    if (sel === 'svg.europe-map') return null;
    return origQ(sel);
  };
  let built = null;
  container.appendChild = function (svg) { built = svg; };

  // Render requires document.createElementNS — the harness provides it.
  const svg = map.render(container, {});
  ok(svg !== null, 'map renders (LOCAL)');
  // Apply empty data — unknown codes must not throw.
  map.applyActivity(built || svg, { countries: {} });
  ok(true, 'applyActivity with empty data does not crash');
  // Apply data with a valid code.
  map.applyActivity(built || svg, { countries: { FR: { totalActivity: 279 } } });
  ok(true, 'applyActivity with valid data does not crash');
}

/* ================================================================== */
console.log('== 5. Offline: 0 backend requests, no fake data (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_OFF);
  h.resetFetch();
  await h.W('Session').forceRecheck();

  // Country metrics offline → unavailable, not fake.
  const data = await h.W('CountryMetrics').getData();
  ok(data.unavailable === true, 'country metrics unavailable offline');
  eq(Object.keys(data.countries).length, 0, 'no fabricated country data offline');

  // Zero backend requests.
  eq(h.calls.fetch.filter(c => /rest\/v1/.test(c.url)).length, 0,
    '0 backend requests when Supabase disabled (LOCAL)');
}

/* ------------------------------------------------------------------ */
const exitCode = summary() ? 0 : 1;
process.exit(exitCode);
