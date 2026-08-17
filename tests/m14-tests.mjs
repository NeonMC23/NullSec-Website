/**
 * NullSec — Milestone 14 test scenarios (LOCAL / MOCKED, no real Supabase).
 */
import { makeHarness, LOAD_ORDER, ok, eq, summary } from './run-tests.mjs';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const JS_DIR = join(process.cwd(), 'assets', 'js');

function cfg(harness, patch) {
  const c = harness.W('Config').get();
  Object.assign(c, {
    offlineMode: true, authEnabled: false, backendEnabled: false,
    syncEnabled: false, supabaseEnabled: false, supabaseUrl: null, supabaseAnonKey: null
  }, patch || {});
  return c;
}

// sessionStorage / localStorage backings hold raw JSON strings (like a real
// browser); parse them for assertions.
function ss(harness) {
  try { return JSON.parse(harness.sessionBacking['ns:session:auth'] || 'null'); }
  catch (e) { return null; }
}
const BACKEND_ON = {
  offlineMode: false, backendEnabled: true, authEnabled: true,
  supabaseEnabled: true, syncEnabled: true,
  supabaseUrl: 'https://project.supabase.co', supabaseAnonKey: 'anon-public-key'
};

/* ================================================================== *
 * 1. Static audit: no var / no inline handlers / fetch centralized    *
 * ================================================================== */
console.log('== 1. Static source audit ==');
{
  const files = readdirSync(JS_DIR).filter(f => f.endsWith('.js') && f !== 'fuse.min.js');
  let varCount = 0, inlineCount = 0, fetchOutside = 0, serviceKey = 0;
  for (const f of files) {
    const src = readFileSync(join(JS_DIR, f), 'utf8');
    const body = src.split('\n').map(l => l.trim()).filter(l => !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/**') && !l.startsWith('/*'));
    for (const line of body) {
      if (/\bvar\s+[A-Za-z_$]/.test(line)) varCount++;
      if (/\son(click|load|error|change|submit|keyup|keydown)\s*=/.test(line)) inlineCount++;
    }
    if (/SUPABASE_SERVICE_KEY|service_role|serviceRole/i.test(src)) serviceKey++;
    // fetch must only appear in api-client.js and data-loader.js
    if (f !== 'api-client.js' && f !== 'data-loader.js' && /\bfetch\s*\(/.test(src)) fetchOutside++;
  }
  ok(varCount === 0, `no 'var' in first-party JS (found ${varCount})`);
  ok(inlineCount === 0, `no inline event handlers (found ${inlineCount})`);
  ok(fetchOutside === 0, `fetch only in api-client.js / data-loader.js`);
  ok(serviceKey === 0, `no service-role key reference in frontend`);
}

/* ================================================================== *
 * 2. Offline-first: supabase disabled => zero network, local mode      *
 * ================================================================== */
console.log('== 2. Offline-first (supabase disabled) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, { offlineMode: true, backendEnabled: false, authEnabled: false });

  // Give the async startup restore a tick.
  await h.W('Session').ensureRestored();

  eq(h.calls.fetch.length, 0, 'zero fetch calls when backend disabled');
  eq(h.W('Session').getStatus(), 'local', 'session status is local offline');

  const auth = h.W('Auth');
  ok(!auth.isAuthenticated(), 'not authenticated offline');

  const reg = await auth.createAccount('tester', 'password123');
  eq(reg.ok, false, 'register offline -> not ok');
  eq(reg.reason, 'authentication-unavailable-offline', 'register offline reason');

  const login = await auth.signIn('tester', 'password123');
  eq(login.ok, false, 'login offline -> not ok');
  eq(login.reason, 'authentication-unavailable-offline', 'login offline reason');
  eq(h.calls.fetch.length, 0, 'still zero network after attempted auth offline');
}

/* ================================================================== *
 * 3. Recovery key stored in sessionStorage, not localStorage           *
 * ================================================================== */
console.log('== 3. Recovery key storage ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, {});
  const rk = h.W('RecoveryKey');
  const key = rk.ensure();
  ok(typeof key === 'string' && /^NSK1-/.test(key), 'generates a valid NSK1 recovery key');
  ok(h.sessionBacking['ns:session:recovery'] !== undefined, 'recovery key in sessionStorage');
  ok(h.localBacking['ns:recovery'] === undefined, 'recovery key NOT in localStorage');
  eq(rk.get(), key, 'RecoveryKey.get() reads from sessionStorage');

  // Import validation
  ok(rk.importRaw(key) === true, 'importRaw accepts a valid key');
  ok(rk.importRaw('BAD-KEY') === false, 'importRaw rejects invalid key');

  // Transport hash deterministic + 64 hex
  const h1 = await rk.hashForTransport();
  const h2 = await rk.hashForTransport();
  eq(h1.length, 64, 'transport hash is 64 chars');
  eq(h1, h2, 'transport hash is deterministic');
  ok(/^[0-9a-f]{64}$/.test(h1), 'transport hash is lowercase hex');
}

/* ================================================================== *
 * 4. Login/register with mocked Supabase: session persisted safely     *
 * ================================================================== */
console.log('== 4. Mocked backend auth flow ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, {
    offlineMode: false, backendEnabled: true, authEnabled: true,
    supabaseEnabled: true, syncEnabled: true,
    supabaseUrl: 'https://project.supabase.co',
    supabaseAnonKey: 'anon-public-key'
  });
  const auth = h.W('Auth');
  const identity = h.W('Identity');

  // ensure a recovery key exists
  h.W('RecoveryKey').ensure();
  identity.init();

  // login (username + password)
  const res = await auth.signIn('tester', 'password123');
  ok(res.ok, 'login succeeds against mock backend');

  const authBody = h.calls.fetch.find(c => /ns_login/.test(c.url));
  ok(authBody && !JSON.stringify(authBody.init.body).includes('password123'),
    'raw password is NOT in the login payload');

  ok(auth.isAuthenticated(), 'authenticated after login');
  eq(h.W('Sync').getToken(), 'mock-token-123', 'session token in memory (Sync)');
  eq(ss(h).token, 'mock-token-123', 'session token persisted to sessionStorage');
  ok(!('expires_at' in ss(h)) || ss(h).expires_at === null, 'no trust placed in expires metadata');
  // M16 storage policy: authentication state is NEVER persisted to localStorage.
  ok(h.localBacking['ns:auth'] === undefined,
    'authentication state NOT in localStorage (M16 policy)');
  ok(h.localBacking['ns:user:state'] === undefined,
    'user-state flag NOT in localStorage (M16 policy)');
  ok(h.localBacking['ns:recovery'] === undefined,
    'recovery key NOT in localStorage (M16 policy)');

  // no token in URLs
  const urls = h.calls.fetch.map(c => c.url);
  ok(urls.every(u => !u.includes('mock-token-123')), 'token never appears in URLs');

  // register flow
  h.resetFetch();
  await h.W('Auth').logout();
  ok(!h.W('Auth').isAuthenticated(), 'logged out clears auth');
  const reg = await h.W('Auth').createAccount('tester', 'password123');
  ok(reg.ok, 'register succeeds against mock backend');
  const regBody = h.calls.fetch.find(c => /ns_register/.test(c.url));
  ok(regBody && !JSON.stringify(regBody.init.body).includes(h.W('RecoveryKey').get()),
    'raw recovery key NOT in register payload');
}

/* ================================================================== *
 * 5. Session restoration on startup                                    *
 * ================================================================== */
console.log('== 5. Session restoration ==');
{
  // 5a. A stored valid session is restored & validated
  const hA = makeHarness();
  hA.load(LOAD_ORDER);
  cfg(hA, BACKEND_ON);
  hA.W('RecoveryKey').ensure();
  hA.W('Identity').init();
  hA.sessionBacking['ns:session:auth'] = JSON.stringify({ token: 'mock-token-123', expires_at: null });
  hA.resetFetch();
  await hA.W('Session').forceRecheck();
  eq(hA.W('Session').getStatus(), 'authenticated', 'valid stored session restored to authenticated');
  ok(hA.W('Auth').isAuthenticated(), 'auth flag restored');
  const validateCalls = hA.calls.fetch.filter(c => /ns_validate_session/.test(c.url)).length;
  eq(validateCalls, 1, 'exactly one startup validation call');

  // 5b. Invalid stored session -> cleared, local mode
  const hB = makeHarness();
  hB.load(LOAD_ORDER);
  cfg(hB, BACKEND_ON);
  hB.W('RecoveryKey').ensure();
  hB.W('Identity').init();
  hB.sessionBacking['ns:session:auth'] = JSON.stringify({ token: 'bogus-token', expires_at: null });
  hB.resetFetch();
  await hB.W('Session').forceRecheck();
  eq(hB.W('Session').getStatus(), 'local', 'invalid stored session -> local mode');
  ok(!hB.W('Auth').isAuthenticated(), 'invalid session not authenticated');
  ok(hB.sessionBacking['ns:session:auth'] === undefined, 'invalid session removed from sessionStorage');

  // 5c. Expired local metadata -> early reject, no validate call
  const hC = makeHarness();
  hC.load(LOAD_ORDER);
  cfg(hC, BACKEND_ON);
  hC.W('RecoveryKey').ensure();
  hC.sessionBacking['ns:session:auth'] = JSON.stringify({ token: 'mock-token-123', expires_at: '2000-01-01T00:00:00Z' });
  hC.resetFetch();
  await hC.W('Session').forceRecheck();
  eq(hC.W('Session').getStatus(), 'local', 'expired metadata -> local mode');
  eq(hC.calls.fetch.filter(c => /ns_validate_session/.test(c.url)).length, 0,
    'no validate call for clearly-expired session');

  // 5d. Backend unreachable -> local mode, session kept for retry
  const hD = makeHarness({
    backend: { fetch: () => Promise.reject(new TypeError('Failed to fetch')) }
  });
  hD.load(LOAD_ORDER);
  cfg(hD, BACKEND_ON);
  hD.W('RecoveryKey').ensure();
  hD.W('Identity').init();
  hD.sessionBacking['ns:session:auth'] = JSON.stringify({ token: 'mock-token-123', expires_at: null });
  hD.resetFetch();
  await hD.W('Session').forceRecheck();
  eq(hD.W('Session').getStatus(), 'unavailable', 'backend unreachable -> status unavailable');
  ok(!hD.W('Auth').isAuthenticated(), 'unreachable backend -> local (not authenticated)');
  eq(ss(hD).token, 'mock-token-123',
    'stored session KEPT for later retry when backend unreachable');
}

/* ================================================================== *
 * 6. Error classification                                             *
 * ================================================================== */
console.log('== 6. ApiClient error classification ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  const api = h.W('ApiClient');

  // OFFLINE
  cfg(h, { supabaseEnabled: true, supabaseUrl: null, supabaseAnonKey: null });
  const unconf = await api.login({ identity_id: 'x', recovery_hash: 'a'.repeat(64) }).then(() => null, e => e);
  eq(api.describe(unconf).type, 'UNCONFIGURED', 'unconfigured -> UNCONFIGURED');

  cfg(h, { supabaseEnabled: true, supabaseUrl: 'https://x.co', supabaseAnonKey: 'k' });
  h.global.navigator.onLine = false; // simulate device offline
  const offlineErr = await api.login({ identity_id: 'x', recovery_hash: 'a'.repeat(64) }).then(() => null, e => e);
  eq(api.describe(offlineErr).type, 'OFFLINE', 'offline -> OFFLINE');

  // UNAUTHORIZED from 401
  h.calls.fetch.length = 0;
  const hU = makeHarness({
    backend: { fetch: () => mockResp(401, { message: 'session_expired' }) }
  });
  hU.load(LOAD_ORDER);
  cfg(hU, { supabaseEnabled: true, supabaseUrl: 'https://x.co', supabaseAnonKey: 'k', backendEnabled: true, authEnabled: true });
  const uErr = await hU.W('ApiClient').me('tok').then(() => null, e => e);
  eq(hU.W('ApiClient').describe(uErr).type, 'UNAUTHORIZED', '401 -> UNAUTHORIZED');

  // SERVER_ERROR
  const hS = makeHarness({ backend: { fetch: () => mockResp(500, {}) } });
  hS.load(LOAD_ORDER);
  cfg(hS, { supabaseEnabled: true, supabaseUrl: 'https://x.co', supabaseAnonKey: 'k' });
  const sErr = await hS.W('ApiClient').communityStats().then(() => null, e => e);
  eq(hS.W('ApiClient').describe(sErr).type, 'SERVER_ERROR', '500 -> SERVER_ERROR');

  function mockResp(status, body) {
    return Promise.resolve({ ok: status < 300, status, json: () => Promise.resolve(body) });
  }
}

/* ================================================================== *
 * 7. Unauthorized RPC triggers session cleanup (no loop)               *
 * ================================================================== */
console.log('== 7. Unauthorized cleanup ==');
{
  // Backend that refuses token-authenticated sync calls with 401.
  const h = makeHarness({
    backend: {
      fetch: (url, init) => {
        const u = String(url);
        const ok200 = { ok: true, status: 200, json: () => Promise.resolve({}) };
        if (/ns_sync_pull/.test(u)) {
          return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ message: 'session_expired' }) });
        }
        if (/ns_validate_session/.test(u)) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(1) });
        }
        if (/ns_login|ns_register/.test(u)) {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ token: 'mock-token-123', user_id: 1 }) });
        }
        return Promise.resolve(ok200);
      }
    }
  });
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  const auth = h.W('Auth');
  h.W('RecoveryKey').ensure();
  h.W('Identity').init();
  await auth.signIn('tester', 'password123');
  ok(auth.isAuthenticated(), 'authenticated before unauthorized event');
  await h.W('Session').ensureRestored();

  // A refused token-authenticated RPC (ns_sync_pull -> 401) must trigger the
  // unauthorized handler and clear the session — with no retry loop.
  await h.W('ApiClient').me('mock-token-123').then(() => {}, () => {});
  ok(!auth.isAuthenticated(), 'session cleared after unauthorized failure');
  eq(h.W('Session').getStatus(), 'local', 'status local after cleanup');
  ok(h.sessionBacking['ns:session:auth'] === undefined, 'persisted session removed after cleanup');
}

/* ================================================================== *
 * 8. Config injection hook                                            *
 * ================================================================== */
console.log('== 8. Config public injection ==');
{
  // Set the injection global BEFORE config.js loads.
  const h = makeHarness();
  h.global.__NULLSEC_SUPABASE__ = { url: 'https://injected.supabase.co', anonKey: 'inj-anon', service_role: 'SHOULD_IGNORE' };
  h.load(LOAD_ORDER);
  const c = h.W('Config').get();
  eq(c.supabaseUrl, 'https://injected.supabase.co', 'injected url consumed');
  eq(c.supabaseAnonKey, 'inj-anon', 'injected anon key consumed');
  ok(c.service_role === undefined, 'extra injection fields ignored');
  eq(c.supabaseEnabled, false, 'flags remain explicit (default false)');
}

/* ================================================================== *
 * 9. Community & offline regressions still function                   *
 * ================================================================== */
console.log('== 9. Offline community regression ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, { offlineMode: true, backendEnabled: false });
  const cs = h.W('Community');
  const stats = await cs.getGlobalStats();
  ok(stats && typeof stats === 'object', 'community stats fallback offline');
  // data-loader fetches local data/ JSON files; assert NO backend (supabase) call.
  const backendCalls = h.calls.fetch.filter(c => /rest\/v1|supabase/.test(c.url));
  eq(backendCalls.length, 0, 'community page makes zero backend network requests offline');
}

/* ------------------------------------------------------------------ */
const exitCode = summary() ? 0 : 1;
process.exit(exitCode);
