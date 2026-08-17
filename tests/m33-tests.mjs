/**
 * NullSec — Milestone 33 (Authentication & Session Hardening) test suite.
 * ------------------------------------------------------------------
 * Category: LOCAL / MOCKED / STATIC (no real Supabase, no browser).
 *
 * Covers (per the M33 spec):
 *   1-10  Authentication (create/sign-in/recovery semantics, no email).
 *   11-15 Session (short-lived, sign-out, invalid token -> guest).
 *   16-20 Security (RPC not anon-exposed, sync authenticated, no service-role).
 *   21-24 Legacy (no loginWithRecoveryKey, no recovery login form, no email,
 *          no identity_id+recovery normal login path).
 *   25-30 UI (Account has Sign in / Create account / Recover separated, no
 *          avatar/public profile, nav Sign out vs Sign in / Create account).
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

/** Stateful username+password mock (M33 semantics). */
function authMock() {
  const users = new Map(); // username -> { pwd, recovery }
  const tokens = new Set();
  function thr(msg) { const e = new Error(msg); e.status = 400; throw e; }
  return {
    register(body) {
      const u = String(body.p_username || '').toLowerCase();
      if (users.has(u)) thr('username_taken');
      users.set(u, { pwd: body.p_password_hash, recovery: body.p_recovery_hash });
      const t = 'tok-' + u; tokens.add(t); return { token: t, user_id: 1 };
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
      return { recovered: true, user_id: 1 };
    },
    validate(token) { return tokens.has(token) ? 1 : null; },
    logout(body) { tokens.delete(body.p_token); return {}; }
  };
}

/* ================================================================== */
console.log('== 1. Authentication semantics (LOCAL/MOCKED) ==');
{
  const h = makeHarness({ backend: authMock() });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();

  // 1. Create account requires username + password.
  const noU = await h.W('Auth').createAccount('', 'password123');
  ok(!noU.ok, 'create account requires a username');
  const noP = await h.W('Auth').createAccount('alice', '');
  ok(!noP.ok, 'create account requires a password');

  // 2. Create account works without email (no email param anywhere).
  const reg = await h.W('Auth').createAccount('alice', 'password123');
  ok(reg.ok, 'create account succeeds without email');
  const regBodies = h.calls.fetch.filter(c => /ns_register/.test(c.url))
    .map(c => String(c.init.body || '')).join(' ');
  ok(!/email/.test(regBodies), 'register payload has no email');

  // 3. Sign in uses username + password.
  h.W('Auth').logout(); h.resetFetch();
  const login = await h.W('Auth').signIn('alice', 'password123');
  ok(login.ok, 'sign in with username + password succeeds');
  const loginBody = h.calls.fetch.filter(c => /ns_login/.test(c.url))
    .map(c => String(c.init.body || '')).join(' ');
  ok(/p_username/.test(loginBody) && /p_password_hash/.test(loginBody), 'sign in sends username + password hash');
  ok(!/recovery/.test(loginBody), 'sign in does NOT depend on a recovery key');

  // 4. Login failure is generic (no username enumeration).
  h.resetFetch();
  const missU = await h.W('Auth').signIn('nosuchuser', 'password123');
  const wrongP = await h.W('Auth').signIn('alice', 'wrongpassword');
  ok(!missU.ok && !wrongP.ok, 'both unknown username and wrong password fail');
  ok(missU.reason === wrongP.reason, 'generic error: same reason for missing user and wrong password');
  ok(/invalid_credentials/.test(missU.reason), 'generic invalid_credentials reason');

  // 5-7. Password never stored client-side.
  ok(!JSON.stringify(h.localBacking).includes('password123'), 'password not in localStorage');
  ok(!JSON.stringify(h.sessionBacking).includes('password123'), 'password not in sessionStorage');

  // 8. Username transmitted to RPC.
  ok(/p_username/.test(regBodies), 'username transmitted to register RPC');

  // 10. Recovery is separate from login (handled in its own flow).
  const auth = readFileSync(join(JS, 'auth-service.js'), 'utf8');
  ok(/recoverAccount/.test(auth), 'recovery is a distinct method (not a sign-in path)');
}

/* ================================================================== */
console.log('== 2. Recovery flow sets password, not a session (LOCAL/MOCKED) ==');
{
  const h = makeHarness({ backend: authMock() });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  const reg = await h.W('Auth').createAccount('bob', 'password123');
  ok(reg.ok && reg.recovery_key, 'registered with recovery key');
  h.W('Auth').logout(); h.resetFetch();

  // Recovery requires a new password and does NOT create a session.
  const rec = await h.W('Auth').recoverAccount('bob', reg.recovery_key, 'newpassword9');
  ok(rec.ok, 'recovery succeeds with recovery key + new password');
  ok(!h.W('Auth').isAuthenticated(), 'recovery does NOT authenticate (guest remains)');
  const recBodies = h.calls.fetch.filter(c => /ns_recover/.test(c.url))
    .map(c => String(c.init.body || '')).join(' ');
  ok(/p_new_password_hash/.test(recBodies), 'recovery sends a new password hash');

  // Recovery does not create a user (same account), and the new password works.
  h.resetFetch();
  const login = await h.W('Auth').signIn('bob', 'newpassword9');
  ok(login.ok, 'new password works for a normal sign in after recovery');
}

/* ================================================================== */
console.log('== 3. Session management (LOCAL/MOCKED) ==')
{
  const h = makeHarness({ backend: authMock() });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  await h.W('Auth').createAccount('carol', 'password123');
  ok(h.W('Auth').isAuthenticated(), 'authenticated after create');

  // 11. Session token only in sessionStorage, never localStorage.
  ok(h.sessionBacking['ns:session:auth'] !== undefined, 'session token in sessionStorage');
  ok(!JSON.stringify(h.localBacking).includes('tok-carol'), 'no token in localStorage');
  const sess = JSON.parse(h.sessionBacking['ns:session:auth'] || '{}');
  ok(sess.token === 'tok-carol', 'session token content');
  ok(sess.username === 'carol', 'username carried in short-lived session only');

  // 12-13. Sign out removes the session and blocks Journey progression.
  h.W('Auth').logout();
  ok(!h.W('Auth').isAuthenticated(), 'sign out clears authentication');
  ok(h.sessionBacking['ns:session:auth'] === undefined, 'sign out removes the persisted session');
  h.resetFetch();
  h.W('Progress').complete('x');
  ok(!h.W('Progress').isCompleted('x'), 'sign out blocks progression (no local completion)');
  eq(h.calls.fetch.filter(c => /ns_sync_push/.test(c.url)).length, 0, 'sign out blocks sync push');

  // 14. Invalid token -> guest.
  h.sessionBacking['ns:session:auth'] = JSON.stringify({ token: 'bogus', expires_at: null });
  h.resetFetch();
  await h.W('Session').forceRecheck();
  ok(!h.W('Auth').isAuthenticated(), 'invalid token -> guest');
}

/* ================================================================== */
console.log('== 4. Security / RPC exposure (STATIC) ==')
{
  const sqlAudit = readFileSync(join(ROOT, 'tests/sql-audit.mjs'), 'utf8');
  const privileges = readFileSync(join(ROOT, 'backend/supabase/functions/rpc_privileges.sql'), 'utf8');
  const rpcAuth = readFileSync(join(ROOT, 'backend/supabase/functions/rpc_auth.sql'), 'utf8');

  // 16-18. ns_sync_pull/push remain token-authenticated (requireToken) — checked
  // in api-client. Here we verify the SQL RPCs remain SECURITY DEFINER.
  ok(/SECURITY DEFINER/.test(rpcAuth), 'auth RPCs are SECURITY DEFINER');
  ok(/SET search_path = public/.test(rpcAuth), 'auth RPCs pin search_path');

  // ns_create_session stays internal (not granted).
  ok(!/GRANT EXECUTE ON FUNCTION public\\.ns_create_session/.test(privileges),
    'ns_create_session is not granted to anon/authenticated');

  // 19. No service-role key in frontend.
  const frontend = readFileSync(join(JS, 'api-client.js'), 'utf8');
  ok(!/service_role|service-role|serviceRole|sb_secret/.test(frontend), 'no service-role secret in api-client');

  // 20. No cross-user access path: no p_user_id in sync.
  const api = readFileSync(join(JS, 'api-client.js'), 'utf8');
  ok(!/p_user_id/.test(api.replace(/\/\/.*/g, '')), 'api-client never sends p_user_id');
}

/* ================================================================== */
console.log('== 5. Legacy auth cleanup (STATIC) ==')
{
  const files = ['auth-service.js', 'api-client.js', 'profile.js', 'navigation.js', 'user-state.js'];
  for (const f of files) {
    const src = readFileSync(join(JS, f), 'utf8');
    ok(!/loginWithRecoveryKey/.test(src), f + ' has no loginWithRecoveryKey');
  }
  // 23. No email field anywhere in auth.
  const auth = readFileSync(join(JS, 'auth-service.js'), 'utf8');
  ok(!/p_email|type=['\"]email['\"]|\bemail\s*[:=]/.test(auth), 'auth-service has no email field');
  const profileHtml = readFileSync(join(ROOT, 'profile.html'), 'utf8');
  ok(!/type=['\"]email['\"]/.test(profileHtml), 'account page has no email input');

  // 24. No normal login path via identity_id + recovery.
  const api = readFileSync(join(JS, 'api-client.js'), 'utf8');
  ok(!/p_identity_id/.test(api), 'api-client no longer sends identity_id for login');
  const rpcAuth = readFileSync(join(ROOT, 'backend/supabase/functions/rpc_auth.sql'), 'utf8');
  ok(!/ns_login\(p_identity_id/.test(rpcAuth), 'ns_login no longer accepts identity_id');
}

/* ================================================================== */
console.log('== 6. UI / account page (STATIC) ==')
{
  const profileHtml = readFileSync(join(ROOT, 'profile.html'), 'utf8');
  const profile = readFileSync(join(JS, 'profile.js'), 'utf8');
  const journey = readFileSync(join(JS, 'journey.js'), 'utf8');

  // 25-27. Account contains Sign in / Create account / Recover (separate forms).
  ok(/Sign in/.test(profileHtml) || /Sign in/.test(profile), 'Account has Sign in');
  ok(/Create account/.test(profile), 'Account has Create account');
  ok(/Recover account/.test(profile), 'Account has Recover account separately');

  // 28. No avatar / public profile UI.
  ok(!/renderAvatar|avatarSvg/.test(profile.replace(/\*.*/g, '')), 'no avatar UI in account page');

  // 29-30. Nav: authenticated -> Sign out (handled by navigation.js).
  const nav = readFileSync(join(JS, 'navigation.js'), 'utf8');
  ok(/Sign out/.test(nav) && /isAuthenticated\(\)/.test(nav), 'nav shows Sign out when authenticated');

  // Journey requires auth.
  ok(/Auth\.isAuthenticated\(\)/.test(journey), 'Journey requires authentication');

  // No "Recovery login" wording in account page.
  ok(!/recovery login|log in with your recovery key/i.test(profileHtml), 'no recovery-as-login wording');
}

/* ================================================================== */
console.log('== 7. Storage guard: no credentials in localStorage.setItem (STATIC) ==')
{
  const files = ['auth-service.js', 'api-client.js', 'session-store.js', 'profile.js', 'sync-service.js', 'recovery-key.js'];
  for (const f of files) {
    const src = readFileSync(join(JS, f), 'utf8');
    // Any localStorage.setItem must never store credentials/account data.
    if (/localStorage\.setItem/.test(src)) {
      ok(!/(password|recovery|token|credentials|username)/.test(src.split('localStorage.setItem').slice(1).join(' ').slice(0, 200)),
        f + ' does not store credentials via localStorage.setItem');
    } else {
      ok(true, f + ' never calls localStorage.setItem');
    }
  }
}

const exitCode = summary() ? 0 : 1;
process.exit(exitCode);
