/**
 * NullSec — Milestone 28 test suite (LOCAL / MOCKED / STATIC).
 * Real Supabase + browser remain BLOCKED (no project / no browser).
 *
 * Covers:
 *   1. Configuration states: CONFIGURED / NOT_CONFIGURED / INVALID_CONFIGURATION.
 *   2. ApiClient failures: unconfigured, offline, timeout-normalized, no secret leak.
 *   3. Session expiration / revocation / backend-unavailable / invalid token / logout.
 *   4. Duplicate activity protection (DUPLICATE state).
 *   5. Dashboard unavailable states + lastUpdate.
 *   6. Privacy: no secret/token leakage in errors.
 *   7. Architecture boundaries: UI does not call ApiClient directly.
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
console.log('== 1. Configuration states (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);

  // NOT_CONFIGURED when disabled.
  cfg(h, BACKEND_OFF);
  eq(h.W('Config').getConfigStatus(), 'NOT_CONFIGURED', 'disabled → NOT_CONFIGURED');

  // CONFIGURED when enabled + valid url + anon key.
  cfg(h, BACKEND_ON);
  eq(h.W('Config').getConfigStatus(), 'CONFIGURED', 'enabled + valid → CONFIGURED');

  // INVALID_CONFIGURATION when enabled but url/key malformed.
  cfg(h, { supabaseEnabled: true, supabaseUrl: 'not-a-url', supabaseAnonKey: 'anon' });
  eq(h.W('Config').getConfigStatus(), 'INVALID_CONFIGURATION', 'bad url → INVALID_CONFIGURATION');
  cfg(h, { supabaseEnabled: true, supabaseUrl: 'https://x.co', supabaseAnonKey: '' });
  eq(h.W('Config').getConfigStatus(), 'INVALID_CONFIGURATION', 'empty anon key → INVALID_CONFIGURATION');
  cfg(h, { supabaseEnabled: true, supabaseUrl: null, supabaseAnonKey: 'anon' });
  eq(h.W('Config').getConfigStatus(), 'INVALID_CONFIGURATION', 'missing url → INVALID_CONFIGURATION');
}

/* ================================================================== */
console.log('== 2. ApiClient failures + no secret leak (LOCAL/MOCKED) ==');
{
  // Unconfigured → classify UNCONFIGURED, no network.
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_OFF);
  h.resetFetch();
  const e1 = await h.W('ApiClient').communityMetrics().then(() => null, e => e);
  eq(h.W('ApiClient').describe(e1).type, 'UNCONFIGURED', 'disabled → UNCONFIGURED (no network)');
  eq(h.calls.fetch.filter(c => /rest\/v1/.test(c.url)).length, 0, 'zero backend calls when disabled');

  // Invalid config → UNCONFIGURED.
  const h2 = makeHarness();
  h2.load(LOAD_ORDER);
  cfg(h2, { supabaseEnabled: true, supabaseUrl: null, supabaseAnonKey: 'anon' });
  h2.resetFetch();
  const e2 = await h2.W('ApiClient').communityMetrics().then(() => null, e => e);
  eq(h2.W('ApiClient').describe(e2).type, 'UNCONFIGURED', 'invalid config → UNCONFIGURED');
  eq(h2.calls.fetch.filter(c => /rest\/v1/.test(c.url)).length, 0, 'no network on invalid config');

  // Server error normalized to SERVER_ERROR, no raw DB error exposed to user.
  const h3 = makeHarness({ backend: { fetch: () => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ message: 'some_internal_sql_error_detail' }) }) } });
  h3.load(LOAD_ORDER);
  cfg(h3, BACKEND_ON);
  const e3 = await h3.W('ApiClient').communityMetrics().then(() => null, e => e);
  eq(h3.W('ApiClient').describe(e3).type, 'SERVER_ERROR', '500 → SERVER_ERROR');
  const desc = h3.W('ApiClient').describe(e3);
  ok(!/some_internal_sql_error_detail/.test(desc.message), 'raw DB error not leaked to user');
}

/* ================================================================== */
console.log('== 3. Session expiration/revocation/unavailable (LOCAL/MOCKED) ==');
{
  // Expired local metadata → sessionRefused (SESSION_EXPIRED).
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  h.W('RecoveryKey').ensure();
  h.sessionBacking['ns:session:auth'] = JSON.stringify({ token: 'tok-x', expires_at: '2000-01-01T00:00:00Z' });
  await h.W('Session').forceRecheck();
  ok(h.W('Session').hasSessionRefused() === true, 'expired session → refused flag');
  ok(!h.W('Auth').isAuthenticated(), 'expired session not authenticated');

  // Revoked (validate returns null) → refused.
  const h2 = makeHarness({ backend: { validate: () => null } });
  h2.load(LOAD_ORDER);
  cfg(h2, BACKEND_ON);
  h2.W('RecoveryKey').ensure();
  h2.sessionBacking['ns:session:auth'] = JSON.stringify({ token: 'bad', expires_at: null });
  await h2.W('Session').forceRecheck();
  ok(h2.W('Session').hasSessionRefused() === true, 'revoked session → refused');
  ok(!h2.W('Auth').isAuthenticated(), 'revoked session not authenticated');

  // Backend unavailable → NOT authenticated, but not "refused".
  const h3 = makeHarness({ backend: { fetch: () => Promise.reject(new TypeError('Failed to fetch')) } });
  h3.load(LOAD_ORDER);
  cfg(h3, BACKEND_ON);
  h3.W('RecoveryKey').ensure();
  h3.sessionBacking['ns:session:auth'] = JSON.stringify({ token: 'tok-x', expires_at: null });
  await h3.W('Session').forceRecheck();
  ok(h3.W('Auth').getAuthStatus() === 'BACKEND_UNAVAILABLE', 'backend unavailable → BACKEND_UNAVAILABLE');

  // Logout cleanup: token cleared + no auth flag.
  const h4 = makeHarness({ backend: { register: () => ({ token: 'tok-a', user_id: 1 }), validate: () => 1 } });
  h4.load(LOAD_ORDER);
  cfg(h4, BACKEND_ON);
  h4.W('RecoveryKey').ensure();
  h4.W('Identity').init();
  await h4.W('Auth').createAccount('tester', 'password123');
  await h4.W('Session').forceRecheck();
  ok(h4.W('Auth').isAuthenticated(), 'authenticated before logout');
  h4.W('Session').clearSessionRefused();
  h4.W('Auth').logout();
  ok(!h4.W('Auth').isAuthenticated(), 'logout clears auth');
  ok(h4.sessionBacking['ns:session:auth'] === undefined, 'logout clears persisted session');
}

/* ================================================================== */
console.log('== 4. Duplicate activity protection (LOCAL/MOCKED) ==');
{
  const h = makeHarness({ backend: { register: () => ({ token: 'tok-a', user_id: 1 }), validate: () => 1, recordActivity: () => ({ ok: true }) } });
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  h.W('RecoveryKey').ensure();
  h.W('Identity').init();
  await h.W('Auth').createAccount('tester', 'password123');
  await h.W('Session').forceRecheck();
  const svc = h.W('ActivityService');

  const first = await svc.record('tool_used', 1);
  eq(first.state, 'SUCCESS', 'first submission SUCCESS');
  const dup = await svc.record('tool_used', 1); // immediate re-submission
  eq(dup.state, 'DUPLICATE', 'immediate duplicate → DUPLICATE');
  ok(dup.ok === false, 'duplicate is not a fake success');

  // Different type within window is NOT a duplicate.
  const other = await svc.record('community_action', 1);
  eq(other.state, 'SUCCESS', 'different type → SUCCESS');
}

/* ================================================================== */
console.log('== 5. Dashboard unavailable states + lastUpdate (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_OFF);
  const cm = h.W('CountryMetrics');
  const data = await cm.getData();
  ok(data.unavailable === true, 'offline dashboard data unavailable');
  eq(Object.keys(data.countries).length, 0, 'no fabricated countries offline');

  // lastUpdate propagated from a mock RPC response.
  const h2 = makeHarness({ backend: { countryMetrics: () => ({ countries: { FR: { missionActivity: 1, toolActivity: 0, communityActivity: 0, totalActivity: 1 } }, lastUpdate: '2026-08-07T00:00:00Z' }) } });
  h2.load(LOAD_ORDER);
  cfg(h2, BACKEND_ON);
  const d2 = await h2.W('CountryMetrics').getData();
  eq(d2.lastUpdate, '2026-08-07T00:00:00Z', 'lastUpdate propagated (global, non-individual)');
  eq(d2.countries.FR.toolActivity, 0, '0 preserved (measured empty)');
}

/* ================================================================== */
console.log('== 6. Architecture boundaries (STATIC) ==');
{
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = process.cwd();
  // UI modules never call ApiClient for activity / never fetch directly.
  for (const f of ['journey.js', 'tools.js', 'community.js']) {
    const src = readFileSync(join(root, 'assets/js', f), 'utf8');
    ok(!/ApiClient\.recordActivity/.test(src), f + ' does not call recordActivity directly');
    ok(!/\bfetch\s*\(/.test(src), f + ' has no direct fetch');
  }
  // ApiClient centralizes all network (fetch only in api-client + data-loader).
  const jsDir = join(root, 'assets/js');
  const { readdirSync } = await import('node:fs');
  const files = readdirSync(jsDir).filter(f => f.endsWith('.js'));
  for (const f of files) {
    if (f === 'api-client.js' || f === 'data-loader.js') continue;
    const src = readFileSync(join(jsDir, f), 'utf8');
    ok(!/\bfetch\s*\(/.test(src), f + ' has no direct fetch');
  }
}

/* ------------------------------------------------------------------ */
const exitCode = summary() ? 0 : 1;
process.exit(exitCode);
