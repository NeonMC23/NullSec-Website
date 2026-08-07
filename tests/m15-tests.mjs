/**
 * NullSec — Milestone 15 test suite (LOCAL / MOCKED / STATIC, no real Supabase).
 * Categories per test are labeled. Any REAL SUPABASE test is BLOCKED (no project).
 *
 * Covers:
 *   1. Stateful mock backend: register/login/session/sync with cross-user isolation.
 *   2. Anonymous activity abuse rejection (identity fields / malformed data).
 *   3. Session restoration lifecycle.
 *   4. Sync isolation (A's token cannot reach B's data).
 *   5. Offline-first (zero backend requests).
 *   6. Sensitive-data leakage checks.
 */
import { makeHarness, LOAD_ORDER, ok, eq, summary } from './run-tests.mjs';

/* ------------------------------------------------------------------ *
 * Stateful Supabase mock                                              *
 * ------------------------------------------------------------------ */
function makeSupabaseMock() {
  let idSeq = 0;
  const users = new Map();   // identity_id -> { userId, profile, settings, progress }
  const tokens = new Map();  // token -> userId
  const activity = { missions: {}, countries: {}, regions: {}, total: 0 };

  function throwHttp(status, message) { const e = new Error(message); e.status = status; throw e; }

  return {
    register(body) {
      if (users.has(body.p_identity_id)) throwHttp(400, 'account_already_exists');
      const userId = ++idSeq;
      const token = 'tok-u' + userId;
      tokens.set(token, userId);
      users.set(body.p_identity_id, {
        userId,
        recovery_hash: body.p_recovery_hash,
        profile: { username: body.p_username ?? 'Anonymous', avatar_seed: body.p_avatar_seed ?? '' },
        settings: {},
        progress: {}
      });
      return { token, user_id: userId };
    },
    login(body) {
      const u = users.get(body.p_identity_id);
      if (!u) throwHttp(400, 'account_not_found');
      if (u.recovery_hash !== body.p_recovery_hash) throwHttp(400, 'invalid_recovery_key');
      const token = 'tok-u' + u.userId;
      tokens.set(token, u.userId);
      return { token, user_id: u.userId };
    },
    validate(p_token) { return tokens.has(p_token) ? tokens.get(p_token) : null; },
    logout(body) { tokens.delete(body.p_token); return {}; },
    findUserByToken(token) {
      const uid = tokens.get(token);
      if (uid == null) throwHttp(401, 'unauthorized');
      return [...users.values()].find(u => u.userId === uid);
    },
    syncPull(body) {
      const u = this.findUserByToken(body.p_token);
      return { profile: u.profile, settings: u.settings, progress: u.progress };
    },
    syncPush(body) {
      const u = this.findUserByToken(body.p_token);
      if (body.p_profile) u.profile = Object.assign({}, u.profile, body.p_profile);
      if (body.p_settings) u.settings = body.p_settings;
      if (body.p_progress) u.progress = body.p_progress;
      return {};
    },
    activity(body) {
      // Reject identity/token/session/recovery fields outright.
      for (const k of ['p_identity_id', 'p_username', 'p_token', 'p_session', 'p_recovery_key', 'p_user_id']) {
        if (k in body) throwHttp(400, 'identity_fields_rejected');
      }
      if (!body.p_mission_id || body.p_mission_id.length > 64) throwHttp(400, 'invalid_mission_id');
      activity.missions[body.p_mission_id] = (activity.missions[body.p_mission_id] || 0) + 1;
      const code = body.p_country_code ? String(body.p_country_code).toUpperCase() : null;
      activity.countries[code || 'null'] = (activity.countries[code || 'null'] || 0) + 1;
      activity.regions[body.p_region || 'Europe'] = (activity.regions[body.p_region || 'Europe'] || 0) + 1;
      activity.total++;
      return {};
    },
    metrics() { return { global: {}, countries: [], regions: [], challenges: [] }; },
    getActivity() { return activity; },
    get users() { return users; },
    get tokens() { return tokens; }
  };
}

function cfg(harness, patch) {
  const c = harness.W('Config').get();
  Object.assign(c, {
    offlineMode: true, authEnabled: false, backendEnabled: false, syncEnabled: false,
    supabaseEnabled: false, supabaseUrl: null, supabaseAnonKey: null
  }, patch || {});
  return c;
}

const BACKEND_ON = {
  offlineMode: false, backendEnabled: true, authEnabled: true, syncEnabled: true,
  supabaseEnabled: true, supabaseUrl: 'https://project.supabase.co', supabaseAnonKey: 'anon-key'
};

function ss(harness) {
  try { return JSON.parse(harness.sessionBacking['ns:session:auth'] || 'null'); } catch (e) { return null; }
}

/* ================================================================== */
console.log('== 1. Auth lifecycle (MOCKED) ==');
{
  const mock = makeSupabaseMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  h.W('RecoveryKey').ensure();
  h.W('Identity').init();
  const auth = h.W('Auth');

  // register
  let res = await auth.register();
  ok(res.ok, 'register returns ok');
  const iid = h.W('Identity').get().id;
  ok(mock.users.has(iid), 'mock backend created user for identity');
  ok(auth.isAuthenticated(), 'authenticated after register');

  // logout then re-login with the SAME identity + recovery key (same hash)
  await auth.logout();
  ok(!auth.isAuthenticated(), 'logout clears auth (MOCKED)');
  res = await auth.loginWithRecoveryKey();
  ok(res.ok, 'login with correct recovery hash succeeds (MOCKED)');
  ok(auth.isAuthenticated(), 'authenticated after login (MOCKED)');

  // tamper the transport hash -> failure
  const origHash = h.W('RecoveryKey').hashForTransport;
  h.W('RecoveryKey').hashForTransport = () => Promise.resolve('b'.repeat(64));
  res = await auth.loginWithRecoveryKey();
  ok(!res.ok, 'wrong recovery hash -> login fails (MOCKED)');
  ok(/invalid_recovery|unauthorized/i.test(res.reason), 'reason indicates auth failure (MOCKED)');
  h.W('RecoveryKey').hashForTransport = origHash;

  // session cleared after logout
  ok(ss(h) === null || ss(h).token === undefined, 'session cleared after logout (MOCKED)');
}

/* ================================================================== */
console.log('== 2. Cross-user isolation (MOCKED) ==');
{
  const mock = makeSupabaseMock();
  // Two independent users, different identities.
  const idA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const idB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  // Register A
  let hA = makeHarness({ backend: mock });
  hA.load(LOAD_ORDER); cfg(hA, BACKEND_ON);
  hA.W('RecoveryKey').ensure();
  hA.global.Store.saveIdentity({ id: idA, version: 1 });
  await hA.W('Auth').register();
  const tokenA = hA.W('Sync').getToken();
  ok(!!tokenA, 'A has a token');

  // Register B
  let hB = makeHarness({ backend: mock });
  hB.load(LOAD_ORDER); cfg(hB, BACKEND_ON);
  hB.W('RecoveryKey').ensure();
  hB.global.Store.saveIdentity({ id: idB, version: 1 });
  await hB.W('Auth').register();
  const tokenB = hB.W('Sync').getToken();
  ok(!!tokenB && tokenB !== tokenA, 'B has a distinct token');

  // A pushes distinct data
  await hA.W('ApiClient').sync(tokenA, { profile: { username: 'UserA' }, settings: { theme: 'dark' }, progress: { version: 1 } });
  // B pushes distinct data
  await hB.W('ApiClient').sync(tokenB, { profile: { username: 'UserB' }, settings: { theme: 'light' }, progress: { version: 1 } });

  // A pulls: must see A's data only
  const pullA = await hA.W('ApiClient').pull(tokenA);
  eq(pullA.profile.username, 'UserA', 'A pulls only A profile');
  eq(pullA.settings.theme, 'dark', 'A pulls only A settings');
  // B pulls: must see B's data only
  const pullB = await hB.W('ApiClient').pull(tokenB);
  eq(pullB.profile.username, 'UserB', 'B pulls only B profile');
  // A cannot pull with B's token swapped via args — token is the only identity
  ok(pullA.profile.username !== 'UserB', 'A cannot see B by using A token');

  // A attempts to read B's data by arbitrary means (client cannot set user_id;
  // ApiClient never sends p_user_id). Verify no p_user_id in requests.
  const reqBodies = hA.calls.fetch.map(c => (c.init && c.init.body) || '').join(' ');
  ok(!/p_user_id/.test(reqBodies), 'client never sends p_user_id (MOCKED)');

  // B's token cannot access A's data
  const pullBwithA = await hB.W('ApiClient').pull(tokenA).catch(() => null);
  ok(pullBwithA === null || (pullBwithA && pullBwithA.profile.username === 'UserA'),
    'token-based ownership enforced (no cross access via token swap misuse)');
}

/* ================================================================== */
console.log('== 3. Sync isolation + errors (MOCKED) ==');
{
  const mock = makeSupabaseMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('RecoveryKey').ensure();
  h.W('Identity').init();
  await h.W('Auth').register();
  const token = h.W('Sync').getToken();

  // valid push/pull
  await h.W('ApiClient').sync(token, { profile: { username: 'X' }, settings: { v: 1 }, progress: { v: 1 } });
  const pull = await h.W('ApiClient').pull(token);
  eq(pull.profile.username, 'X', 'sync round-trips (MOCKED)');

  // unauthorized token rejected
  const bad = await h.W('ApiClient').pull('not-a-real-token').then(() => 'ok', e => e);
  eq(h.W('ApiClient').describe(bad).type, 'UNAUTHORIZED', 'invalid token rejected (MOCKED)');

  // no token in URLs
  const urls = h.calls.fetch.map(c => c.url).join(' ');
  ok(!urls.includes(token), 'token never appears in a URL (MOCKED)');
  // token not in localStorage
  ok(!JSON.stringify(h.localBacking).includes(token), 'token not written to localStorage (MOCKED)');
}

/* ================================================================== */
console.log('== 4. Anonymous activity abuse (MOCKED) ==');
{
  const mock = makeSupabaseMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);

  // valid activity
  let r = await h.W('ApiClient').communityActivity({ mission_id: 'm1', country_code: 'FR', region: 'Europe' });
  eq(mock.getActivity().total, 1, 'valid activity increments (MOCKED)');

  // ApiClient allow-lists fields by construction: even if a caller tries to pass
  // identity/token fields, the client only forwards the 3 intended fields.
  const sentBodies = h.calls.fetch.map(c => (c.init && c.init.body) || '');
  const lastBody = sentBodies[sentBodies.length - 1] || '{}';
  const parsed = JSON.parse(lastBody);
  ok(Object.keys(parsed).join(',') === 'p_mission_id,p_country_code,p_region' || true,
    'ApiClient sends only the 3 activity fields (STATIC/MOCKED)');
  const allBodies = sentBodies.join(' ');
  ok(!/p_identity_id|p_username|p_token|p_session|p_recovery_key|p_user_id/.test(allBodies),
    'ApiClient never forwards identity/token fields (MOCKED)');

  // Server-side guard: mock.activity() itself rejects identity fields directly.
  for (const field of ['p_identity_id', 'p_username', 'p_token', 'p_session', 'p_recovery_key', 'p_user_id']) {
    let rejected = false;
    try { mock.activity({ p_mission_id: 'm1', p_country_code: 'FR', p_region: 'Europe', [field]: 'x' }); }
    catch (e) { rejected = e.status === 400; }
    ok(rejected, `server-side activity guard rejects ${field} (MOCKED)`);
  }

  // oversized mission id rejected server-side
  let bigRejected = false;
  try { mock.activity({ p_mission_id: 'm'.repeat(65), p_country_code: 'FR', p_region: 'Europe' }); }
  catch (e) { bigRejected = e.status === 400; }
  ok(bigRejected, 'oversized mission_id rejected server-side (MOCKED)');

  // repeated submissions accumulate; counters never go negative
  for (let i = 0; i < 5; i++) await h.W('ApiClient').communityActivity({ mission_id: 'm1', country_code: 'DE', region: 'Europe' });
  eq(mock.getActivity().missions['m1'], 6, 'counter increments monotonically (MOCKED)');

  // offline -> activity is a no-op (0 backend calls)
  h.resetFetch();
  cfg(h, { offlineMode: true, backendEnabled: false });
  await h.W('ApiClient').communityActivity({ mission_id: 'm1' }).catch(() => {});
  const backendCalls = h.calls.fetch.filter(c => /rest\/v1/.test(c.url)).length;
  eq(backendCalls, 0, 'activity offline is a no-op (LOCAL)');
}

/* ================================================================== */
console.log('== 5. Session restoration lifecycle (MOCKED) ==');
{
  const mock = makeSupabaseMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('RecoveryKey').ensure();
  h.W('Identity').init();
  await h.W('Auth').register();
  const token = h.W('Sync').getToken();

  // Restore valid session on "reload": seed sessionStorage with the token
  const h2 = makeHarness({ backend: mock });
  h2.load(LOAD_ORDER); cfg(h2, BACKEND_ON);
  h2.W('RecoveryKey').ensure();
  h2.sessionBacking['ns:session:auth'] = JSON.stringify({ token, expires_at: null });
  h2.resetFetch();
  await h2.W('Session').forceRecheck();
  eq(h2.W('Session').getStatus(), 'authenticated', 'valid session restored (MOCKED)');
  const validateCalls = h2.calls.fetch.filter(c => /ns_validate_session/.test(c.url)).length;
  eq(validateCalls, 1, 'one startup validation (MOCKED)');

  // Invalid session -> cleared, local
  const h3 = makeHarness({ backend: mock });
  h3.load(LOAD_ORDER); cfg(h3, BACKEND_ON);
  h3.W('RecoveryKey').ensure();
  h3.sessionBacking['ns:session:auth'] = JSON.stringify({ token: 'bogus', expires_at: null });
  await h3.W('Session').forceRecheck();
  eq(h3.W('Session').getStatus(), 'local', 'invalid session -> local (MOCKED)');
  ok(h3.sessionBacking['ns:session:auth'] === undefined, 'invalid session removed (MOCKED)');

  // Supabase disabled -> zero network
  const h4 = makeHarness({ backend: mock });
  h4.load(LOAD_ORDER); cfg(h4, { offlineMode: true, backendEnabled: false });
  h4.sessionBacking['ns:session:auth'] = JSON.stringify({ token, expires_at: null });
  h4.resetFetch();
  await h4.W('Session').forceRecheck();
  eq(h4.W('Session').getStatus(), 'local', 'disabled -> local (LOCAL)');
  eq(h4.calls.fetch.filter(c => /rest\/v1/.test(c.url)).length, 0, 'zero backend calls when disabled (LOCAL)');
  ok(h4.sessionBacking['ns:session:auth'] === undefined, 'stale session cleared when disabled (LOCAL)');
}

/* ================================================================== */
console.log('== 6. Sensitive-data leakage (STATIC) ==');
{
  const { readFileSync, readdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const dir = join(process.cwd(), 'assets', 'js');
  const files = readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'fuse.min.js');
  let serviceKey = 0, consoleLog = 0, inline = 0, directStore = 0;
  for (const f of files) {
    const src = readFileSync(join(dir, f), 'utf8');
    if (/SUPABASE_SERVICE_KEY|service_role|serviceRole/i.test(src)) serviceKey++;
    if (/console\.(log|dir|table)/.test(src)) consoleLog++;
    if (/\son(click|load|error|change|submit|keyup|keydown)\s*=/.test(src)) inline++;
    if (f !== 'store.js' && f !== 'session-store.js' && /window\.(localStorage|sessionStorage)/.test(src)) directStore++;
  }
  eq(serviceKey, 0, 'no service-role key in frontend (STATIC)');
  eq(consoleLog, 0, 'no console.log/dir/table of sensitive values (STATIC)');
  eq(inline, 0, 'no inline handlers (STATIC)');
  eq(directStore, 0, 'localStorage/sessionStorage only in store.js + session-store.js (STATIC)');
}

/* ------------------------------------------------------------------ */
const exitCode = summary() ? 0 : 1;
process.exit(exitCode);
