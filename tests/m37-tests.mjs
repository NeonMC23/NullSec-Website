/**
 * NullSec — Milestone 37 (Account Management & Server Session Lifecycle).
 * ------------------------------------------------------------------
 * Category: LOCAL / MOCKED / STATIC (no real Supabase, no browser).
 *
 * Validates the finalized account/session lifecycle that M30–M36 established:
 *   - account creation edge cases;
 *   - sign-in edge cases (generic errors, no enumeration);
 *   - session lifecycle (restoration, invalid/expired -> guest, logout);
 *   - recovery (recovery-only, no session, sessions revoked);
 *   - cross-device (no local account data required, server progression restored);
 *   - Journey integration (guest/auth/invalid-session gating);
 *   - storage (no account data in localStorage, no password in sessionStorage);
 *   - security (no service-role, no client user_id, no private data in Community);
 *   - legacy (no loginWithRecoveryKey / email / local account).
 */
import { makeHarness, LOAD_ORDER, ok, eq, summary } from './run-tests.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const JS = join(ROOT, 'assets/js');

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

/** Server-backed stateful mock (account + session + progression on "server"). */
function serverMock() {
  const users = new Map();
  const tokens = new Set();
  function thr(msg) { const e = new Error(msg); e.status = 400; throw e; }
  return {
    register(body) {
      const u = String(body.p_username || '').toLowerCase();
      if (users.has(u)) thr('username_taken');
      users.set(u, { pwd: body.p_password_hash, recovery: body.p_recovery_hash, progress: { missions: {}, weekly: {} } });
      const t = 'tok-' + u; tokens.add(t); return { token: t, user_id: 1 };
    },
    publicProfile(body) {
      const u = String(body.p_username || '').toLowerCase();
      const rec = users.get(u);
      if (!rec) return null;
      const ids = Object.keys(rec.progress.missions || {}).filter(function (k) {
        return rec.progress.missions[k] && rec.progress.missions[k].completed;
      });
      return { username: u, completed_mission_ids: ids };
    },
    login(body) {
      const u = String(body.p_username || '').toLowerCase();
      const rec = users.get(u);
      if (!rec || rec.pwd !== body.p_password_hash) thr('invalid_credentials');
      const t = 'tok-' + u; tokens.add(t); return { token: t, user_id: 1 };
    },
    recover(body) {
      const u = String(body.p_username || '').toLowerCase();
      const rec = users.get(u);
      if (!rec || rec.recovery !== body.p_recovery_hash) thr('invalid_recovery_key');
      rec.pwd = body.p_new_password_hash;
      tokens.clear();
      return { recovered: true, user_id: 1 };
    },
    changePassword(body) {
      const u = [...users.keys()].find(k => tokens.has(body.p_token));
      if (!u) thr('unauthorized');
      const rec = users.get(u);
      if (rec.pwd !== body.p_current_password_hash) thr('invalid_credentials');
      rec.pwd = body.p_new_password_hash;
      return { changed: true, user_id: 1 };
    },
    resetProgress(body) {
      const u = [...users.keys()].find(k => tokens.has(body.p_token));
      if (!u) thr('unauthorized');
      users.get(u).progress = {};
      return { reset: true, user_id: 1 };
    },
    validate(token) { return tokens.has(token) ? 1 : null; },
    logout(body) { tokens.delete(body.p_token); return {}; },
    syncPush() { return {}; }
  };
}

/* ================================================================== */
console.log('== 1. Account creation edge cases (LOCAL/MOCKED) ==')
{
  const mock = serverMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  h.resetFetch();

  // Empty fields.
  const noUser = await h.W('Auth').createAccount('', 'password123');
  ok(!noUser.ok, 'empty username rejected');
  const noPass = await h.W('Auth').createAccount('alice', '');
  ok(!noPass.ok, 'empty password rejected');

  // Username too short / too long.
  const short = await h.W('Auth').createAccount('ab', 'password123');
  ok(!short.ok, 'username too short rejected');
  const long = await h.W('Auth').createAccount('a'.repeat(40), 'password123');
  ok(!long.ok, 'username too long rejected');

  // Invalid characters.
  const invalid = await h.W('Auth').createAccount('ali ce', 'password123');
  ok(!invalid.ok, 'invalid username characters rejected');

  // Password too short.
  const weakPass = await h.W('Auth').createAccount('alice', 'short');
  ok(!weakPass.ok, 'password too short rejected');

  // Valid creation.
  const ok1 = await h.W('Auth').createAccount('alice', 'password123');
  ok(ok1.ok, 'valid create account succeeds');

  // Case-insensitive duplicate username.
  const dup = await h.W('Auth').createAccount('ALICE', 'password456');
  ok(!dup.ok, 'case-insensitive duplicate username rejected');

  // No partial local account created after failures.
  const ls = JSON.stringify(h.localBacking);
  ok(!ls.includes('username') && !ls.includes('password'), 'no account data in localStorage after registration attempts');
  ok(h.localBacking['ns:identity'] === undefined, 'no identity written to localStorage');
}

/* ================================================================== */
console.log('== 2. Sign-in edge cases + no enumeration (LOCAL/MOCKED) ==')
{
  const mock = serverMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  await h.W('Auth').createAccount('bob', 'password123');
  h.W('Auth').logout(); h.resetFetch();

  // Wrong username / wrong password -> same generic reason.
  const wrongUser = await h.W('Auth').signIn('nosuchuser', 'password123');
  const wrongPass = await h.W('Auth').signIn('bob', 'wrongpassword');
  ok(!wrongUser.ok && !wrongPass.ok, 'both wrong user and wrong password fail');
  ok(wrongUser.reason === wrongPass.reason, 'generic error (no username enumeration)');
  ok(/invalid_credentials/.test(wrongUser.reason), 'reason is invalid_credentials');

  // Empty fields.
  const emptyUser = await h.W('Auth').signIn('', 'password123');
  const emptyPass = await h.W('Auth').signIn('bob', '');
  ok(!emptyUser.ok && !emptyPass.ok, 'empty sign-in fields rejected');

  // Failed login remains guest.
  ok(!h.W('Auth').isAuthenticated(), 'failed login remains guest');

  // Successful login creates an authenticated session.
  h.resetFetch();
  const okLogin = await h.W('Auth').signIn('bob', 'password123');
  ok(okLogin.ok, 'valid sign in succeeds');
  ok(h.W('Auth').isAuthenticated(), 'successful login creates session');
}

/* ================================================================== */
console.log('== 3. Session lifecycle (LOCAL/MOCKED) ==')
{
  const mock = serverMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  await h.W('Auth').createAccount('carol', 'password123');
  ok(h.W('Auth').isAuthenticated(), 'session active after create');

  // Session in sessionStorage only.
  ok(h.sessionBacking['ns:session:auth'] !== undefined, 'session in sessionStorage');
  ok(!JSON.stringify(h.localBacking).includes('tok-carol'), 'no token in localStorage');

  // Valid session restoration preserves the server username.
  h.sessionBacking['ns:session:auth'] = JSON.stringify({ token: h.W('Sync').getToken(), username: 'carol', expires_at: null });
  h.resetFetch();
  await h.W('Session').forceRecheck();
  ok(h.W('Auth').isAuthenticated(), 'valid session restored');
  eq(h.W('Auth').getUsername(), 'carol', 'server username restored');

  // Invalid session -> guest.
  h.sessionBacking['ns:session:auth'] = JSON.stringify({ token: 'bogus', expires_at: null });
  h.resetFetch();
  await h.W('Session').forceRecheck();
  ok(!h.W('Auth').isAuthenticated(), 'invalid session becomes guest');
  ok(h.sessionBacking['ns:session:auth'] === undefined, 'invalid session cleared');

  // Expired session -> guest.
  const h2 = makeHarness({ backend: serverMock() });
  h2.load(LOAD_ORDER); cfg(h2, BACKEND_ON);
  h2.sessionBacking['ns:session:auth'] = JSON.stringify({ token: 'x', expires_at: '2000-01-01T00:00:00Z' });
  await h2.W('Session').forceRecheck();
  ok(!h2.W('Auth').isAuthenticated(), 'expired session becomes guest');
}

/* ================================================================== */
console.log('== 4. Logout (LOCAL/MOCKED) ==')
{
  const mock = serverMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  await h.W('Auth').createAccount('dave', 'password123');
  h.W('Progress').init();
  h.W('Progress').complete('m1');
  ok(h.W('Progress').isCompleted('m1'), 'completed a mission before logout');

  h.W('Auth').logout();
  ok(!h.W('Auth').isAuthenticated(), 'logout -> guest');
  ok(h.sessionBacking['ns:session:auth'] === undefined, 'logout clears sessionStorage');

  // Logout does NOT delete the server-side progression.
  const login = await h.W('Auth').signIn('dave', 'password123');
  ok(login.ok, 'can sign back in after logout (account still exists)');
  // The in-memory progression was cleared with the session, but the account
  // (server mock) still holds its user record — no account/progression deleted.
  ok(h.W('Auth').isAuthenticated(), 'account restored after re-login');
}

/* ================================================================== */
console.log('== 5. Recovery lifecycle (LOCAL/MOCKED) ==')
{
  const mock = serverMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  const reg = await h.W('Auth').createAccount('erin', 'password123');
  ok(reg.recovery_key, 'recovery key issued at creation');
  h.W('Auth').logout(); h.resetFetch();

  // Recovery is recovery-only: resets password, no session created.
  const rec = await h.W('Auth').recoverAccount('erin', reg.recovery_key, 'newpass789');
  ok(rec.ok, 'recovery succeeds');
  ok(!h.W('Auth').isAuthenticated(), 'recovery does NOT create a session');

  // Old password no longer works; new password works.
  const oldLogin = await h.W('Auth').signIn('erin', 'password123');
  ok(!oldLogin.ok, 'old password rejected after recovery');
  h.resetFetch();
  const newLogin = await h.W('Auth').signIn('erin', 'newpass789');
  ok(newLogin.ok, 'new password accepted after recovery');

  // Recovery key is NOT accepted by normal sign-in.
  h.resetFetch();
  const recoveryAsLogin = await h.W('Auth').signIn('erin', reg.recovery_key);
  ok(!recoveryAsLogin.ok, 'recovery key is not a login method');
}

/* ================================================================== */
console.log('== 6. Cross-device without local account data (MOCKED) ==')
{
  const mock = serverMock();
  // Device A: create + complete a mission.
  const a = makeHarness({ backend: mock });
  a.load(LOAD_ORDER); cfg(a, BACKEND_ON);
  a.W('Identity').init();
  await a.W('Auth').createAccount('frank', 'password123');
  a.W('Progress').init();
  a.W('Progress').complete('enable-2fa');
  a.W('Auth').logout();

  // Device B: fresh harness, no local account data, sign in.
  const b = makeHarness({ backend: mock });
  b.load(LOAD_ORDER); cfg(b, BACKEND_ON);
  b.resetFetch();
  const loginB = await b.W('Auth').signIn('frank', 'password123');
  ok(loginB.ok, 'device B signs in with username+password only');
  ok(b.W('Auth').isAuthenticated(), 'device B authenticated');
  eq(b.W('Auth').getUsername(), 'frank', 'same server account on device B');

  // Device B has no local account data.
  const lsB = JSON.stringify(b.localBacking);
  ok(!/username|password|recovery|token|progress|account/.test(lsB), 'device B has no local account data');
  ok(b.localBacking['ns:identity'] === undefined, 'device B has no identity in localStorage');
}

/* ================================================================== */
console.log('== 7. Journey integration (LOCAL/MOCKED) ==')
{
  // Guest cannot complete.
  const g = makeHarness();
  g.load(LOAD_ORDER); cfg(g, BACKEND_OFF);
  g.W('Identity').init(); g.W('Progress').init(); g.resetFetch();
  g.W('Progress').complete('m');
  ok(!g.W('Progress').isCompleted('m'), 'guest cannot complete');
  eq(g.calls.fetch.filter(c => /ns_sync_push/.test(c.url)).length, 0, 'guest triggers no sync');

  // Authenticated can complete; invalid session blocks.
  const mock = serverMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init(); h.W('Progress').init();
  await h.W('Auth').createAccount('grace', 'password123');
  h.W('Progress').complete('enable-2fa');
  ok(h.W('Progress').isCompleted('enable-2fa'), 'authenticated can complete');

  // Sign out blocks progression.
  h.W('Auth').logout();
  h.resetFetch();
  h.W('Progress').complete('other');
  ok(!h.W('Progress').isCompleted('other'), 'sign out blocks progression');
}

/* ================================================================== */
console.log('== 8. Storage contract (LOCAL/MOCKED) ==')
{
  const h = makeHarness({ backend: serverMock() });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  await h.W('Auth').createAccount('henry', 'password123');
  h.W('Progress').init(); h.W('Progress').complete('m');

  const lsKeys = Object.keys(h.localBacking);
  ok(lsKeys.every(k => k === 'ns:theme' || k === 'ns:migrated:v1'),
    'localStorage only theme/migration (got: ' + lsKeys.join(',') + ')');
  const ls = JSON.stringify(h.localBacking);
  for (const t of ['username', 'password', 'password_hash', 'recovery', 'recovery_key', 'token', 'user_id', 'identity_id', 'progress', 'profile', 'account']) {
    ok(!ls.includes(t), 'no "' + t + '" in localStorage');
  }
  ok(!JSON.stringify(h.sessionBacking).includes('password123'), 'no password in sessionStorage');
  const sessKeys = Object.keys(h.sessionBacking);
  ok(sessKeys.every(k => k === 'ns:session:auth' || k === 'ns:session:recovery'),
    'sessionStorage only approved keys');
}

/* ================================================================== */
console.log('== 9. Security (STATIC) ==')
{
  const files = ['auth-service.js', 'api-client.js', 'session-service.js', 'session-store.js', 'profile.js'];
  for (const f of files) {
    const src = readFileSync(join(JS, f), 'utf8');
    ok(!/service_role|service-role|serviceRole|sb_secret/.test(src), f + ' has no service-role key');
  }
  const api = readFileSync(join(JS, 'api-client.js'), 'utf8');
  ok(!/p_user_id/.test(api.replace(/\/\/.*/g, '')), 'api-client never sends client-controlled p_user_id');
  // No actual credential VALUE rendered into static markup (prose like
  // "your password" is fine; real tokens/hashes/ids are not).
  const profileHtml = readFileSync(join(ROOT, 'profile.html'), 'utf8');
  ok(!/password\s*[:=]|token\s*[:=]|user_id\s*[:=]|identity_id\s*[:=]/.test(profileHtml),
    'account page does not render credential values in markup');
  ok(!/[A-Za-z0-9]{40,}|NSK1-/.test(profileHtml), 'no recovery key or long token in markup');
  // Community stays aggregated (no individual data).
  const community = readFileSync(join(JS, 'community.js'), 'utf8');
  ok(!/username|user_id|avatar/.test(community), 'community exposes no individual data');
}

/* ================================================================== */
console.log('== 10. Legacy cleanup (STATIC) ==')
{
  for (const f of ['auth-service.js', 'api-client.js', 'session-service.js', 'profile.js', 'user-state.js']) {
    const src = readFileSync(join(JS, f), 'utf8');
    ok(!/loginWithRecoveryKey/.test(src), f + ' has no loginWithRecoveryKey');
    ok(!/type=['\"]email['\"]|\bemail\s*[:=]/.test(src), f + ' has no email field');
    ok(!/recovery login/.test(src), f + ' has no recovery-as-login');
  }
}

/* ================================================================== */
console.log('== 11. Lifecycle: no account data restored from localStorage (STATIC) ==')
{
  // auth-service must never read account state from localStorage.
  const auth = readFileSync(join(JS, 'auth-service.js'), 'utf8');
  ok(!/localStorage\.getItem|localStorage\[/.test(auth), 'auth-service never reads localStorage');
  const session = readFileSync(join(JS, 'session-service.js'), 'utf8');
  ok(!/localStorage\.getItem|localStorage\[/.test(session), 'session-service never reads localStorage');
  // Session restoration depends on the server (validateSession), not local data.
  ok(/validateSession/.test(session), 'session restoration validates server-side');
}


/* ================================================================== */
console.log('== 12. Public profile RPC (MOCKED/STATIC) ==')
{
  const mock = serverMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  await h.W('Auth').createAccount('publicuser', 'password123');

  // Public profile lookup returns approved public fields only.
  h.resetFetch();
  const profile = await h.W('ApiClient').publicProfile('publicuser');
  ok(profile && profile.username === 'publicuser', 'public profile resolves username');
  ok(Array.isArray(profile.completed_mission_ids), 'returns completed_mission_ids');
  // No credentials / internal ids / private data.
  const pjson = JSON.stringify(profile);
  ok(!/password|password_hash|recovery|recovery_key|session|token|identity_id|user_id|email/.test(pjson),
    'public profile contains no credentials/internal ids');

  // Nonexistent username handled safely (null, no throw).
  h.resetFetch();
  const missing = await h.W('ApiClient').publicProfile('nobody');
  ok(missing === null || missing === undefined || missing.username === undefined,
    'nonexistent username handled safely');

  // API method uses the ns_public_profile RPC.
  ok(h.calls.fetch.some(c => /ns_public_profile/.test(c.url)), 'public profile uses ns_public_profile RPC');
}

/* ================================================================== */
console.log('== 13. Public progression derivation (STATIC) ==')
{
  const missions = JSON.parse(readFileSync(join(ROOT, 'data/missions.json'), 'utf8'));
  const pp = readFileSync(join(JS, 'public-profile.js'), 'utf8');
  ok(/CAMPAIGNS/.test(pp) && /computeStats/.test(pp), 'public-profile exposes derivation helpers');

  // Derivation is deterministic and correct.
  // Stage 1 has 8 missions (excluding weekly). Completing them -> campaign 1 done.
  const stage1Ids = missions.filter(m => m.stage === 1 && m.id !== 'weekly-community').map(m => m.id);
  const allIds = missions.filter(m => m.id !== 'weekly-community').map(m => m.id);

  // Load the module in a harness to access computeStats.
  const h = makeHarness();
  h.load(LOAD_ORDER);
  h.runFile('public-profile.js');
  const stats0 = h.W('PublicProfile').computeStats(missions, new Set());
  ok(stats0.missionsCompleted === 0, '0 missions completed with empty set');
  ok(stats0.missionsTotal > 0, 'total missions > 0');
  ok(stats0.campaignsCompleted === 0, '0 campaigns completed with empty set');
  ok(stats0.overall === 0, 'overall progress 0%');

  // Complete all stage-1 missions.
  const stats1 = h.W('PublicProfile').computeStats(missions, new Set(stage1Ids));
  ok(stats1.campaignsCompleted === 1, '1 campaign completed after completing stage 1');
  ok(stats1.campaigns[0].done === stage1Ids.length && stats1.campaigns[0].pct === 100,
    'campaign 1 at 100%');

  // Complete everything -> all campaigns completed.
  const statsAll = h.W('PublicProfile').computeStats(missions, new Set(allIds));
  ok(statsAll.campaignsCompleted === statsAll.campaignsTotal, 'all campaigns completed');
  ok(statsAll.overall === 100, 'overall progress 100%');

  // Deterministic.
  const again = h.W('PublicProfile').computeStats(missions, new Set(stage1Ids));
  ok(again.overall === stats1.overall && again.campaignsCompleted === stats1.campaignsCompleted,
    'derivation is deterministic');

  // No duplicate progression source: derive only from completed_mission_ids + missions.json.
  ok(stats1.missionsCompleted === stage1Ids.length, 'missions completed derived from completed ids');
}

/* ================================================================== */
console.log('== 14. Account isolation: public profile never leaks private data (STATIC) ==')
{
  const rpc = readFileSync(join(ROOT, 'backend/supabase/functions/rpc_public_profile.sql'), 'utf8');
  // The RPC returns only username + completed_mission_ids.
  ok(/json_build_object/.test(rpc) && /'username'/.test(rpc) && /'completed_mission_ids'/.test(rpc),
    'RPC returns only username + completed_mission_ids');
  // The RETURN object (the actual public payload) contains only public fields.
  const returnObj = rpc.slice(rpc.indexOf('RETURN json_build_object'), rpc.indexOf('END;', rpc.indexOf('RETURN json_build_object')));
  ok(/username/.test(returnObj) && /completed_mission_ids/.test(returnObj),
    'return payload has username + completed_mission_ids');
  ok(!/password|recovery|session|token|identity_id|email/.test(returnObj),
    'return payload exposes no private fields');
  ok(/SECURITY DEFINER/.test(rpc), 'RPC is SECURITY DEFINER');
  ok(/SET search_path = public/.test(rpc), 'RPC pins search_path');

  // Frontend public-profile module must not render credentials.
  const pp = readFileSync(join(JS, 'public-profile.js'), 'utf8');
  // Strip all comments (line + block) so explanatory prose is ignored.
  const ppCode = pp.replace(/\/\/.*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(!/password|password_hash|recovery|recovery_hash|session token|identity_id|user_id|email/.test(ppCode),
    'public-profile.js has no credential/private rendering');
  ok(!/localStorage|sessionStorage|indexedDB/.test(pp), 'public-profile uses no local storage');
}

/* ================================================================== */
console.log('== 15. Journey public browsing vs private writing (LOCAL/MOCKED) ==')
{
  // Guests can browse mission content but cannot modify progression.
  const g = makeHarness();
  g.load(LOAD_ORDER); cfg(g, BACKEND_OFF);
  g.W('Identity').init(); g.W('Progress').init(); g.resetFetch();
  g.W('Progress').complete('enable-2fa');
  ok(!g.W('Progress').isCompleted('enable-2fa'), 'guest cannot modify progression');
  eq(g.calls.fetch.filter(c => /ns_sync_push/.test(c.url)).length, 0, 'guest triggers no sync');

  // Authenticated can complete; progression synchronizes server-side.
  const mock = serverMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init(); h.W('Progress').init();
  await h.W('Auth').createAccount('journeyuser', 'password123');
  h.W('Progress').complete('enable-2fa');
  ok(h.W('Progress').isCompleted('enable-2fa'), 'authenticated can complete');
}

/* ================================================================== */
console.log('== 16. Storage: no public profile persistence (LOCAL/MOCKED) ==')
{
  const h = makeHarness({ backend: serverMock() });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  await h.W('Auth').createAccount('storeuser', 'password123');
  await h.W('ApiClient').publicProfile('storeuser');
  const lsKeys = Object.keys(h.localBacking);
  ok(lsKeys.every(k => k === 'ns:theme' || k === 'ns:migrated:v1'),
    'no public-profile or account key in localStorage (got: ' + lsKeys.join(',') + ')');
  const ls = JSON.stringify(h.localBacking);
  for (const t of ['username', 'progress', 'profile', 'public', 'password', 'token']) {
    ok(!ls.includes(t), 'no "' + t + '" in localStorage');
  }
  ok(!JSON.stringify(h.sessionBacking).includes('password'), 'no password in sessionStorage');
}

/* ================================================================== */
console.log('== 17. No social network features (STATIC) ==')
{
  // The live app must not implement social features.
  const files = ['public-profile.js', 'community.js', 'journey.js', 'profile.js', 'api-client.js'];
  for (const f of files) {
    const src = readFileSync(join(JS, f), 'utf8');
    // Allow the word in comments explaining absence; reject implemented social methods.
    ok(!/\b(follow|followers|following|friends?|likes|comments?|direct message|dm|social feed|user directory)\b\s*[:=(]/.test(src.replace(/\/\/.*/g, '').replace(/\*[\s\S]*?\*\//g, '')),
      f + ' has no implemented social features');
  }
  // Community remains aggregated: no individual usernames/profile cards.
  const community = readFileSync(join(JS, 'community.js'), 'utf8');
  ok(!/username|user_id|avatar/.test(community), 'community has no individual identifiers');
}

/* ================================================================== */
console.log('== 18. Public profile route exists (STATIC) ==')
{
  const html = readFileSync(join(ROOT, 'public-profile.html'), 'utf8');
  ok(/public-profile/.test(html) && /public-profile.js/.test(html), 'public profile page + module exist');
  ok(/u=<username>|\\?u=/.test(readFileSync(join(JS, 'public-profile.js'), 'utf8')),
    'username routing via ?u= query param');
  // Account page links to the public profile via the canonical URL helper.
  const profileJs = readFileSync(join(JS, 'profile.js'), 'utf8');
  ok(/PublicProfile\.getUrl/.test(profileJs), 'account page links to public profile via getUrl');
  ok(/public-profile\.html\?u=/.test(readFileSync(join(JS, 'public-profile.js'), 'utf8')),
    'getUrl builds the canonical ?u= URL');
}

const exitCode = summary() ? 0 : 1;
process.exit(exitCode);

