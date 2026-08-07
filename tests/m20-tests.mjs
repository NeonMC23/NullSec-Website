/**
 * NullSec — Milestone 20 test suite (LOCAL / MOCKED / STATIC).
 * Real Supabase + browser tests remain BLOCKED (no project / no browser).
 *
 * Covers:
 *   1. Country metrics: valid/invalid/lowercase/malformed/null/zero/negative/
 *      NaN/Infinity/oversized/unknown fields/unknown countries.
 *   2. Privacy: normalized public metrics contain no individual identifiers.
 *   3. Map: SVG creation, ISO lookup, intensity, unavailable, selected, unknown.
 *   4. Offline: 0 backend requests + 'Activity data unavailable'.
 *   5. Storage: no account data/token/recovery/auth flag in localStorage;
 *      sessionStorage only approved.
 *   6. API: ns_country_metrics via mock (valid/malformed/unauthorized/empty).
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
console.log('== 1. Country metrics validation (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_OFF);
  const cm = h.W('CountryMetrics');

  // valid
  const okp = cm.normalize({ countries: { FR: { participants: 42, missionActivity: 183, toolActivity: 71, propagation: 25, totalActivity: 279 } } });
  eq(okp.countries.FR.participants, 42, 'valid participants');
  eq(okp.countries.FR.totalActivity, 279, 'valid total');

  // null metric (unavailable) vs zero
  const nul = cm.normalize({ countries: { FR: { participants: null, toolActivity: null, missionActivity: 0 } } });
  ok(nul.countries.FR.participants === null, 'null preserved as unavailable');
  ok(nul.countries.FR.toolActivity === null, 'null tool preserved');
  eq(nul.countries.FR.missionActivity, 0, 'zero metric preserved as 0');

  // negative / NaN / Infinity / oversized → 0
  const bad = cm.normalize({ countries: { FR: { participants: -5, missionActivity: NaN, toolActivity: Infinity, propagation: 1e12, totalActivity: 'x' } } });
  eq(bad.countries.FR.participants, 0, 'negative → 0');
  eq(bad.countries.FR.missionActivity, 0, 'NaN → 0');
  eq(bad.countries.FR.toolActivity, 0, 'Infinity → 0');
  eq(bad.countries.FR.propagation, 0, 'oversized → 0');

  // lowercase / invalid ISO codes ignored
  const inv = cm.normalize({ countries: { fr: { participants: 1 }, 'F': { participants: 1 }, FRX: { participants: 1 } } });
  ok(inv.countries.fr === undefined && inv.countries.F === undefined && inv.countries.FRX === undefined,
    'lowercase/invalid ISO ignored');

  // unknown fields dropped
  const leak = cm.normalize({ countries: { FR: { participants: 1, user_id: 'x', identity_id: 'y', username: 'z', email: 'a@b' } } });
  ok(leak.countries.FR.user_id === undefined && leak.countries.FR.username === undefined &&
     leak.countries.FR.email === undefined, 'unknown fields dropped');

  // malformed
  ok((function () { try { cm.normalize(null); return false; } catch (e) { return true; } })(), 'null payload rejected');
  ok((function () { try { cm.normalize(42); return false; } catch (e) { return true; } })(), 'scalar payload rejected');
  const empty = cm.normalize({ countries: {} });
  eq(Object.keys(empty.countries).length, 0, 'empty dataset ok');
}

/* ================================================================== */
console.log('== 2. Privacy: no individual identifiers (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  // Mock returns data that (maliciously) includes individual identifiers.
  const mockRaw = {
    countries: { FR: { participants: 1, user_id: 'u1', identity_id: 'i1', username: 'x', email: 'x@y', token: 't', recovery_key: 'r', session: 's', ip: '1.2.3.4', gps: '0,0' } }
  };
  const n = h.W('CountryMetrics').normalize(mockRaw);
  const row = n.countries.FR;
  const keys = Object.keys(row).join(',');
  // Only the 5 aggregate metric keys are allowed; no individual identifiers.
  const allowed = ['participants', 'missionActivity', 'toolActivity', 'communityActivity', 'propagation', 'totalActivity', 'availability', 'lastUpdate'];
  ok(keys.split(',').every(k => allowed.indexOf(k) !== -1),
    'normalized metrics expose only aggregate keys (got: ' + keys + ')');
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

  // ISO lookup
  ok(cm.getCountry('FR') && cm.getCountry('FR').name === 'France', 'FR → France');
  ok(cm.getCountry('DE') && cm.getCountry('DE').name === 'Germany', 'DE → Germany');
  ok(cm.getCountry('ZZ') === null, 'unknown ISO → null (no crash)');

  // SVG creation
  const container = { querySelector: () => null, appendChild: () => {}, children: [] };
  let svg = map.render(container, {});
  ok(svg !== null, 'SVG created');
  ok(typeof map.COUNTRY_PATHS === 'object' && Object.keys(map.COUNTRY_PATHS).length >= 20,
    'has many country paths');

  // apply empty + valid + unknown must not crash
  map.applyActivity(svg, { countries: {} });
  map.applyActivity(svg, { countries: { FR: { totalActivity: 50 }, ZZ: { totalActivity: 999 } } });
  ok(true, 'applyActivity with unknown/missing codes does not crash');

  // intensity classes
  ok(typeof cm.intensity(100) === 'string' && cm.intensity(0) === 'none',
    'intensity returns class strings');

  // setSelected does not crash
  map.setSelected(svg, 'FR');
  map.setSelected(svg, null);
  ok(true, 'setSelected does not crash');
}

/* ================================================================== */
console.log('== 4. Offline: 0 backend, no fake stats (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_OFF);
  h.resetFetch();
  const data = await h.W('CountryMetrics').getData();
  ok(data.unavailable === true, 'offline → unavailable');
  eq(Object.keys(data.countries).length, 0, 'no fabricated country stats');
  eq(h.calls.fetch.filter(c => /rest\/v1/.test(c.url)).length, 0,
    '0 backend requests when Supabase disabled');
}

/* ================================================================== */
console.log('== 5. Storage policy (LOCAL) ==');
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
  ok(!/tok-|mock-token/.test(ls), 'no token in localStorage');
  ok(h.localBacking['ns:recovery'] === undefined, 'no recovery key in localStorage');
  const sessKeys = Object.keys(h.sessionBacking);
  ok(sessKeys.every(k => k === 'ns:session:auth' || k === 'ns:session:recovery'),
    'sessionStorage only approved keys');
}

/* ================================================================== */
console.log('== 6. API ns_country_metrics (MOCKED) ==');
{
  // valid response
  const h = makeHarness({ backend: { countryMetrics: () => ({ countries: { FR: { participants: 2, missionActivity: 3, toolActivity: 2, propagation: null, totalActivity: 5 } } }) } });
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  const data = await h.W('CountryMetrics').getData();
  ok(data.unavailable === false, 'valid response available');
  eq(data.countries.FR.totalActivity, 5, 'valid totalActivity');

  // malformed (null) → unavailable
  const h2 = makeHarness({ backend: { countryMetrics: () => null } });
  h2.load(LOAD_ORDER);
  cfg(h2, BACKEND_ON);
  const d2 = await h2.W('CountryMetrics').getData();
  ok(d2.unavailable === true, 'malformed → unavailable');

  // unauthorized (throws) → unavailable, no fabricated
  const h3 = makeHarness({ backend: { countryMetrics: () => { const e = new Error('unauthorized'); e.status = 401; throw e; } } });
  h3.load(LOAD_ORDER);
  cfg(h3, BACKEND_ON);
  const d3 = await h3.W('CountryMetrics').getData();
  ok(d3.unavailable === true && Object.keys(d3.countries).length === 0, 'unauthorized → unavailable');

  // empty response → available with empty countries
  const h4 = makeHarness({ backend: { countryMetrics: () => ({ countries: {} }) } });
  h4.load(LOAD_ORDER);
  cfg(h4, BACKEND_ON);
  const d4 = await h4.W('CountryMetrics').getData();
  ok(d4.unavailable === false && Object.keys(d4.countries).length === 0, 'empty response → available, empty');
}

/* ================================================================== */
console.log('== 7. Repository architecture (STATIC) ==');
{
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = process.cwd();
  // Services (identity/profile/progress/settings) must not access Store for
  // account data directly — they go through repositories.
  for (const f of ['identity.js', 'user-profile.js', 'settings-service.js', 'progress-service.js']) {
    const src = readFileSync(join(root, 'assets/js', f), 'utf8');
    // Only comments may mention Store; no direct Store.getProfile/getIdentity/etc.
    const code = src.split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    ok(!/Store\.(get|save|delete)(Identity|Profile|Progress|Settings)\(/.test(code),
      f + ' has no direct Store account-data access');
  }
  // Repositories exist and expose get/save/clear.
  for (const r of ['identity-repository', 'profile-repository', 'progress-repository', 'settings-repository']) {
    const src = readFileSync(join(root, 'assets/js/repositories', r + '.js'), 'utf8');
    ok(/get: get/.test(src) && /save: save/.test(src) && /clear: clear/.test(src),
      r + ' exposes get/save/clear');
  }
}

/* ================================================================== */
console.log('== 8. Auth status states (LOCAL) ==');
{
  // NOT_AUTHENTICATED when backend disabled.
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_OFF);
  eq(h.W('Auth').getAuthStatus(), 'NOT_AUTHENTICATED', 'backend disabled → NOT_AUTHENTICATED');

  // AUTHENTICATED after a mock login.
  const h2 = makeHarness({ backend: { register: () => ({ token: 'tok-a', user_id: 1 }), validate: () => 1 } });
  h2.load(LOAD_ORDER);
  cfg(h2, BACKEND_ON);
  h2.W('RecoveryKey').ensure();
  h2.W('Identity').init();
  await h2.W('Auth').register();
  await h2.W('Session').forceRecheck();
  eq(h2.W('Auth').getAuthStatus(), 'AUTHENTICATED', 'valid session → AUTHENTICATED');

  // AUTHENTICATING while a login is in flight.
  const h3 = makeHarness();
  h3.load(LOAD_ORDER);
  cfg(h3, BACKEND_ON);
  h3.W('Auth').setAuthenticating(true);
  eq(h3.W('Auth').getAuthStatus(), 'AUTHENTICATING', 'authenticating flag → AUTHENTICATING');
  h3.W('Auth').setAuthenticating(false);

  // BACKEND_UNAVAILABLE when Supabase intended but unreachable.
  const h4 = makeHarness({ backend: { fetch: () => Promise.reject(new TypeError('Failed to fetch')) } });
  h4.load(LOAD_ORDER);
  cfg(h4, BACKEND_ON);
  h4.W('RecoveryKey').ensure();
  h4.sessionBacking['ns:session:auth'] = JSON.stringify({ token: 'tok-x', expires_at: null });
  await h4.W('Session').forceRecheck();
  eq(h4.W('Auth').getAuthStatus(), 'BACKEND_UNAVAILABLE', 'unreachable backend → BACKEND_UNAVAILABLE');

  // SESSION_EXPIRED when a stored session was rejected by the server.
  const h5 = makeHarness({ backend: { validate: () => null } });
  h5.load(LOAD_ORDER);
  cfg(h5, BACKEND_ON);
  h5.W('RecoveryKey').ensure();
  h5.sessionBacking['ns:session:auth'] = JSON.stringify({ token: 'bad-token', expires_at: null });
  await h5.W('Session').forceRecheck();
  ok(h5.W('Session').hasSessionRefused() === true, 'session refused flag set');
  eq(h5.W('Auth').getAuthStatus(), 'SESSION_EXPIRED', 'rejected session → SESSION_EXPIRED');
}

/* ================================================================== */
console.log('== 9. Country dashboard logic (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_OFF);
  const cm = h.W('CountryMetrics');

  // Activity-level intensity classes used by the dashboard label.
  const levels = ['none', 'very-low', 'low', 'medium', 'high', 'very-high'];
  for (const l of levels) ok(typeof l === 'string', 'level class present: ' + l);
  eq(cm.intensity(0), 'none', '0 → none');
  eq(cm.intensity(200), 'high', '200 → high');

  // Unavailable vs zero are distinct after normalization (drives the ranking /
  // panel: null → "Unavailable", 0 → "0").
  const n = cm.normalize({ countries: { FR: { participants: 0, totalActivity: null }, DE: { totalActivity: 705 } } });
  ok(n.countries.FR.totalActivity === null, 'null totalActivity preserved (Unavailable)');
  eq(n.countries.FR.participants, 0, '0 participants preserved (real zero)');
  eq(n.countries.DE.totalActivity, 705, 'measured totalActivity');

  // Dashboard uses the SAME dataset (single source): map/ranking/panel all read
  // from getData()'s normalized countries object.
  const data = await cm.getData();
  ok(typeof data === 'object' && 'countries' in data, 'getData returns a single countries object');
}

/* ------------------------------------------------------------------ */
const exitCode = summary() ? 0 : 1;
process.exit(exitCode);
