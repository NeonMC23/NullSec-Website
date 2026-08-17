/**
 * NullSec — Milestone 32 (Username & Password Authentication UX) test suite.
 * ------------------------------------------------------------------
 * Category: LOCAL / MOCKED / STATIC (no real Supabase, no browser).
 *
 * Covers:
 *   1. Authentication: username required, password required, no email, create
 *      account, sign in, sign out, recovery flow, authenticated session.
 *   2. Security: password never stored in clear, absent from localStorage,
 *      recovery key absent from localStorage, token absent from localStorage,
 *      guest cannot reach private data.
 *   3. Account: accessible after login, username private (Account only), no
 *      avatar/display_name, no public profile.
 *   4. Journey: guest cannot complete / no sync, authenticated can complete,
 *      progression via the Sync layer.
 *   5. Privacy: no username list, no public user profile, Community aggregated.
 *   6. Static: no email form, no localStorage.setItem for account data.
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

/** Stateful username+password mock backend (stores only transport hashes). */
function authMock() {
  const users = new Map(); // username -> { pwd, recovery }
  const tokens = new Set();
  function thr(msg) { const e = new Error(msg); e.status = 400; throw e; }
  return {
    register(body) {
      const u = String(body.p_username || '').toLowerCase();
      if (users.has(u)) thr('username_taken');
      users.set(u, { pwd: body.p_password_hash, recovery: body.p_recovery_hash });
      tokens.add('tok-u1'); return { token: 'tok-u1', user_id: 1 };
    },
    login(body) {
      const u = String(body.p_username || '').toLowerCase();
      const rec = users.get(u);
      if (!rec || rec.pwd !== body.p_password_hash) thr('invalid_credentials');
      tokens.add('tok-u1'); return { token: 'tok-u1', user_id: 1 };
    },
    recover(body) {
      const u = String(body.p_username || '').toLowerCase();
      const rec = users.get(u);
      if (!rec || rec.recovery !== body.p_recovery_hash) thr('invalid_recovery_key');
      // M33: recovery sets a new password and does NOT create a session.
      rec.pwd = body.p_new_password_hash;
      return { recovered: true, user_id: 1 };
    },
    validate(token) { return tokens.has(token) ? 1 : null; },
    logout(body) { tokens.delete(body.p_token); return {}; }
  };
}

/* ================================================================== */
console.log('== 1. Authentication (LOCAL/MOCKED) ==');
{
  // Guest is not authenticated.
  const g = makeHarness();
  g.load(LOAD_ORDER); cfg(g, BACKEND_OFF);
  g.W('Identity').init();
  ok(!g.W('Auth').isAuthenticated(), 'guest is not authenticated');

  // Create account: username + password required.
  const h = makeHarness({ backend: authMock() });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  const noUser = await h.W('Auth').createAccount('', 'password123');
  ok(!noUser.ok, 'create account requires a username');
  const noPass = await h.W('Auth').createAccount('alice', '');
  ok(!noPass.ok, 'create account requires a password');
  h.resetFetch();

  const reg = await h.W('Auth').createAccount('alice', 'password123');
  ok(reg.ok, 'create account succeeds');
  ok(reg.recovery_key && /^NSK1-/.test(reg.recovery_key), 'create account returns a recovery key');
  ok(h.W('Auth').isAuthenticated(), 'authenticated after create account');

  // Sign out then sign in with username + password.
  h.W('Auth').logout();
  ok(!h.W('Auth').isAuthenticated(), 'sign out clears authentication');
  h.resetFetch();
  const login = await h.W('Auth').signIn('alice', 'password123');
  ok(login.ok, 'sign in with correct username+password succeeds');
  ok(h.W('Auth').isAuthenticated(), 'authenticated after sign in');

  // Wrong password fails.
  h.resetFetch();
  const bad = await h.W('Auth').signIn('alice', 'wrongpassword');
  ok(!bad.ok, 'sign in with wrong password fails');

  // Recovery flow (username + recovery key + new password). M33: recovery is
  // NOT a sign-in; it sets a new password and leaves the user as a guest so
  // they can sign in normally.
  h.W('Auth').logout();
  h.resetFetch();
  const rec = await h.W('Auth').recoverAccount('alice', reg.recovery_key, 'newpass123');
  ok(rec.ok, 'recover account with username + recovery key + new password succeeds');
  ok(!h.W('Auth').isAuthenticated(), 'recovery does NOT create a session (guest stays)');

  // After recovery, the new password works for a normal sign in.
  h.resetFetch();
  const relogin = await h.W('Auth').signIn('alice', 'newpass123');
  ok(relogin.ok, 'sign in with the new password succeeds after recovery');
}

/* ================================================================== */
console.log('== 2. Security (LOCAL/MOCKED) ==');
{
  const h = makeHarness({ backend: authMock() });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  const reg = await h.W('Auth').createAccount('bob', 's3cret-pass');
  ok(reg.ok, 'registered');

  // No raw password in any request body.
  const bodies = h.calls.fetch.map(c => String((c.init && c.init.body) || '')).join(' ');
  ok(!bodies.includes('s3cret-pass'), 'raw password never sent in requests');

  // No password, recovery key, or token in localStorage.
  const ls = JSON.stringify(h.localBacking);
  ok(!ls.includes('s3cret-pass'), 'password not in localStorage');
  ok(!ls.includes(reg.recovery_key), 'recovery key not in localStorage');
  ok(h.localBacking['ns:recovery'] === undefined, 'no ns:recovery key in localStorage');
  ok(!ls.includes('tok-u1'), 'session token not in localStorage');

  // Recovery key is in sessionStorage (short-lived), not localStorage.
  ok(h.sessionBacking['ns:session:recovery'] !== undefined, 'recovery key in sessionStorage');

  // Guest cannot reach private data (no progression).
  const g = makeHarness();
  g.load(LOAD_ORDER); cfg(g, BACKEND_OFF);
  g.W('Identity').init(); g.W('Progress').init(); g.resetFetch();
  g.W('Progress').complete('m');
  ok(!g.W('Progress').isCompleted('m'), 'guest cannot complete (no private data access)');
  eq(g.calls.fetch.filter(c => /rest\/v1/.test(c.url)).length, 0, 'guest triggers zero backend calls');
}

/* ================================================================== */
console.log('== 3. Account (LOCAL/MOCKED) ==');
{
  const h = makeHarness({ backend: authMock() });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  await h.W('Auth').createAccount('carol', 'password123');
  ok(h.W('Auth').isAuthenticated(), 'authenticated');
  eq(h.W('Auth').getUsername(), 'carol', 'username available to the account owner');

  // No avatar / display name exposed via Auth.
  const a = h.W('Auth');
  ok(!('avatar' in a.getState()) && !('display_name' in a.getState()),
    'auth state exposes no avatar/display_name');

  // Username is session-scoped (short-lived), never a public identity.
  const sess = JSON.parse(h.sessionBacking['ns:session:auth'] || '{}');
  eq(sess.username, 'carol', 'username carried in short-lived session only');
  ok(!JSON.stringify(h.localBacking).includes('carol'), 'username not persisted to localStorage');
}

/* ================================================================== */
console.log('== 4. Journey gating (LOCAL/MOCKED/STATIC) ==');
{
  // Guest cannot complete and triggers no sync.
  const g = makeHarness();
  g.load(LOAD_ORDER); cfg(g, BACKEND_OFF);
  g.W('Identity').init(); g.W('Progress').init(); g.resetFetch();
  g.W('Progress').complete('j');
  ok(!g.W('Progress').isCompleted('j'), 'guest cannot complete a journey mission');
  eq(g.calls.fetch.filter(c => /ns_sync_push/.test(c.url)).length, 0,
    'guest triggers no ns_sync_push');

  // Authenticated can complete.
  const h = makeHarness({ backend: authMock() });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  await h.W('Auth').createAccount('dave', 'password123');
  h.W('Progress').complete('j');
  ok(h.W('Progress').isCompleted('j'), 'authenticated can complete a journey mission');

  // Progression routes through the Sync layer (server path).
  const progress = readFileSync(join(JS, 'progress-service.js'), 'utf8');
  const sync = readFileSync(join(JS, 'sync-service.js'), 'utf8');
  ok(/notifySync\(\)/.test(progress), 'progress mutations notify the Sync layer');
  ok(/ns_sync_push/.test(sync) || /ApiClient\.sync/.test(sync), 'Sync layer pushes to Supabase RPC');
  ok(/canPersistProgression/.test(progress), 'progression persistence requires authentication');

  // journey.js renders an auth CTA for guests.
  const journey = readFileSync(join(JS, 'journey.js'), 'utf8');
  ok(/Create an account to save your mission progress/.test(journey), 'journey guest CTA present');
  ok(/Auth\.isAuthenticated\(\)/.test(journey), 'journey requires authentication');
}

/* ================================================================== */
console.log('== 5. Privacy (STATIC) ==');
{
  // No username list / user directory exposed.
  const community = readFileSync(join(JS, 'community.js'), 'utf8');
  const api = readFileSync(join(JS, 'api-client.js'), 'utf8');
  ok(!/user_id|username|avatar/.test(community.replace(/\*.*/g, '')),
    'community exposes no individual identifiers');
  ok(!/SELECT\s+.*\busers\b/.test(api) && !/from\s+public\.users/.test(api),
    'api-client never selects public users list');
  // Community page stays aggregated (no user profiles).
  const communityHtml = readFileSync(join(ROOT, 'community.html'), 'utf8');
  ok(!/user list|member card|profile card/.test(communityHtml), 'community.html has no user listing');
}

/* ================================================================== */
console.log('== 6. Static checks (no email, no account localStorage.setItem) ==');
{
  const auth = readFileSync(join(JS, 'auth-service.js'), 'utf8');
  const api = readFileSync(join(JS, 'api-client.js'), 'utf8');
  const profileHtml = readFileSync(join(ROOT, 'profile.html'), 'utf8');

  // No email field/parameter used in authentication (the word "email" may
  // appear in explanatory comments; what matters is no email field/param).
  ok(!/p_email|'email'|\bemail\s*[:=]|type=['"]email['"]/.test(auth), 'auth-service has no email field/param');
  ok(!/p_email|\bemail\s*[:=]/.test(api), 'api-client auth sends no email parameter');
  ok(!/type=['"]email['"]|id=[\"']?email|placeholder=['"].*[Ee]mail/.test(profileHtml),
    'account page has no email field');

  // No localStorage.setItem for account data in auth/api.
  ok(!/localStorage\.setItem/.test(auth), 'auth-service never writes localStorage');
  ok(!/localStorage\.setItem/.test(api), 'api-client never writes localStorage');

  // Account page is the private destination; no public username/avatar UI.
  ok(/username and password/.test(profileHtml) && /No email is used/.test(profileHtml),
    'account page communicates username+password, no email');
  ok(!/avatar|display name|bio|followers/.test(profileHtml.replace(/profile-(stat|recovery)/g, '')),
    'account page has no avatar/display-name/bio/followers UI');
}

const exitCode = summary() ? 0 : 1;
process.exit(exitCode);
