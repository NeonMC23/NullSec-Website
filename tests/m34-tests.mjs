/**
 * NullSec — Milestone 34 (Account & Journey UX Finalization) test suite.
 * ------------------------------------------------------------------
 * Category: LOCAL / MOCKED / STATIC (no real Supabase, no browser).
 *
 * Covers (per M34 spec):
 *   Account: 1-7   (guest gateway, authenticated username, no social/email)
 *   Journey: 8-14  (guest CTA, guest cannot complete, no local progress,
 *                    authenticated completes via Sync, sign out blocks, sign in restores)
 *   Nav:     15-18 (guest Sign in/Create, auth Sign out, no Profile link/text)
 *   Recovery:19-20 (separate from sign-in, no direct session)
 *   Storage: 21-24 (no new localStorage, no credentials/token in localStorage,
 *                   no password in sessionStorage)
 *   Community:25-27(no public username/avatar/profile)
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

/** Stateful username+password mock (M34 semantics). */
function authMock() {
  const users = new Map();
  const tokens = new Set();
  function thr(msg) { const e = new Error(msg); e.status = 400; throw e; }
  return {
    register(body) {
      const u = String(body.p_username || '').toLowerCase();
      if (users.has(u)) thr('username_taken');
      users.set(u, { pwd: body.p_password_hash, recovery: body.p_recovery_hash, progress: {} });
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
      rec.pwd = body.p_new_password_hash; return { recovered: true, user_id: 1 };
    },
    validate(token) { return tokens.has(token) ? 1 : null; },
    logout(body) { tokens.delete(body.p_token); return {}; },
    syncPush() { return {}; }
  };
}

/* ================================================================== */
console.log('== 1. Account UX (LOCAL/MOCKED/STATIC) ==');
{
  // Guest account page shows a gateway, no fake local profile.
  const g = makeHarness();
  g.load(LOAD_ORDER); cfg(g, BACKEND_OFF);
  g.W('Identity').init();
  const profileJs = readFileSync(join(JS, 'profile.js'), 'utf8');
  ok(/Your NullSec account keeps your progression/.test(profileJs), 'guest sees the account gateway message');
  ok(/Sign in/.test(profileJs) && /Create account/.test(profileJs), 'guest gateway has Sign in + Create account');

  // Authenticated sees private username.
  const h = makeHarness({ backend: authMock() });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  await h.W('Auth').createAccount('ada', 'password123');
  ok(h.W('Auth').isAuthenticated(), 'authenticated');
  const username = h.W('Auth').getUsername();
  ok(username === 'ada', 'authenticated username available (private)');

  // No avatar / email / social on account page.
  const profileHtml = readFileSync(join(ROOT, 'profile.html'), 'utf8');
  ok(!/type=['\"]email['\"]/.test(profileHtml), 'no email field on account page');
  ok(!/renderAvatar|avatarSvg|avatar-upload|followers|bio-field/.test(profileJs),
    'no avatar/bio/followers UI on account page');
}

/* ================================================================== */
console.log('== 2. Journey UX (LOCAL/MOCKED) ==')
{
  // Guest CTA present; guest cannot complete; no local progress.
  const g = makeHarness();
  g.load(LOAD_ORDER); cfg(g, BACKEND_OFF);
  g.W('Identity').init(); g.W('Progress').init(); g.resetFetch();
  g.W('Progress').complete('m1');
  ok(!g.W('Progress').isCompleted('m1'), 'guest cannot complete a mission');
  ok(!JSON.stringify(g.localBacking).match(/journey|weekly|article|progress/), 'guest writes no local progress');

  // Authenticated completes via Progress service (which notifies Sync).
  const h = makeHarness({ backend: authMock() });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  await h.W('Auth').createAccount('bob', 'password123');
  h.W('Progress').complete('m2');
  ok(h.W('Progress').isCompleted('m2'), 'authenticated can complete a mission');
  const progress = readFileSync(join(JS, 'progress-service.js'), 'utf8');
  ok(/notifySync\(\)/.test(progress), 'completion routes through the Sync layer');

  // Sign out blocks progression immediately.
  h.W('Auth').logout();
  ok(!h.W('Auth').isAuthenticated(), 'sign out clears auth');
  h.resetFetch();
  h.W('Progress').complete('m3');
  ok(!h.W('Progress').isCompleted('m3'), 'sign out blocks progression');
  eq(h.calls.fetch.filter(c => /ns_sync_push/.test(c.url)).length, 0, 'sign out blocks sync push');

  // Sign in restores server progression access (authenticated again).
  h.resetFetch();
  await h.W('Auth').signIn('bob', 'password123');
  ok(h.W('Auth').isAuthenticated(), 'sign in restores authenticated progression access');
}

/* ================================================================== */
console.log('== 3. Navigation (STATIC) ==')
{
  const nav = readFileSync(join(JS, 'navigation.js'), 'utf8');
  const files = ['index.html', 'journey.html', 'profile.html', 'community.html', 'tools.html', 'articles.html', 'about.html', 'contribute.html'];
  // Authenticated -> Sign out (navigation.js injects it).
  ok(/Sign out/.test(nav) && /isAuthenticated\(\)/.test(nav), 'nav shows Sign out when authenticated');
  // No legacy Profile nav link text.
  for (const f of files) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    ok(!/>Profile<\/a>/.test(src), f + ' has no "Profile" nav link');
    ok(!/Local Profile|Create a local profile/.test(src), f + ' has no Local Profile text');
  }
  // Nav labels the destination Account.
  ok(/href="profile.html">Account</.test(readFileSync(join(ROOT, 'index.html'), 'utf8')), 'nav labels destination "Account"');
}

/* ================================================================== */
console.log('== 4. Recovery stays separate (LOCAL/MOCKED) ==')
{
  const h = makeHarness({ backend: authMock() });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  const reg = await h.W('Auth').createAccount('carol', 'password123');
  ok(reg.ok && reg.recovery_key, 'registered');
  h.W('Auth').logout(); h.resetFetch();
  const rec = await h.W('Auth').recoverAccount('carol', reg.recovery_key, 'newpass456');
  ok(rec.ok, 'recovery succeeds');
  ok(!h.W('Auth').isAuthenticated(), 'recovery does NOT create a session directly');
  // Recovery form is separate from Sign in (distinct handlers).
  const profileJs = readFileSync(join(JS, 'profile.js'), 'utf8');
  ok(/Recover account/.test(profileJs), 'recovery is a distinct section/form');
}

/* ================================================================== */
console.log('== 5. Storage contract (LOCAL/MOCKED/STATIC) ==')
{
  const h = makeHarness({ backend: authMock() });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  await h.W('Auth').createAccount('dave', 'password123');
  h.W('Progress').complete('m');

  // No new localStorage keys beyond theme/migration.
  const lsKeys = Object.keys(h.localBacking);
  ok(lsKeys.every(k => k === 'ns:theme' || k === 'ns:migrated:v1'),
    'localStorage only contains theme/migration (got: ' + lsKeys.join(',') + ')');
  // No credentials/token in localStorage.
  const ls = JSON.stringify(h.localBacking);
  ok(!/password|recovery|token|credentials/.test(ls), 'no credentials/token in localStorage');
  // No password in sessionStorage.
  ok(!JSON.stringify(h.sessionBacking).includes('password123'), 'no password in sessionStorage');
  // Session keys only.
  const sessKeys = Object.keys(h.sessionBacking);
  ok(sessKeys.every(k => k === 'ns:session:auth' || k === 'ns:session:recovery'),
    'sessionStorage only contains approved session keys');

  // Static: no account data in localStorage.setItem in the auth/api layers.
  for (const f of ['auth-service.js', 'api-client.js', 'session-store.js', 'profile.js', 'sync-service.js']) {
    const src = readFileSync(join(JS, f), 'utf8');
    ok(!/localStorage\.setItem/.test(src), f + ' never writes localStorage');
  }
}

/* ================================================================== */
console.log('== 6. Community stays aggregated (STATIC) ==')
{
  const community = readFileSync(join(JS, 'community.js'), 'utf8');
  const communityHtml = readFileSync(join(ROOT, 'community.html'), 'utf8');
  ok(!/user_id|username|avatar/.test(community.replace(/\*.*/g, '')),
    'community.js exposes no individual identifiers');
  const noNav = communityHtml.replace(/href="profile\.html"[^>]*>[^<]*<\/a>/g, '');
  ok(!/user list|member card|profile card|username/.test(noNav), 'community.html has no user listing');
  ok(!/local progress storage/.test(communityHtml), 'community.html no longer claims local progress storage');
}

/* ================================================================== */
console.log('== 7. No legacy / no email anywhere (STATIC) ==')
{
  const jsFiles = ['auth-service.js', 'api-client.js', 'profile.js', 'navigation.js', 'user-state.js', 'identity.js'];
  for (const f of jsFiles) {
    const src = readFileSync(join(JS, f), 'utf8');
    ok(!/loginWithRecoveryKey/.test(src), f + ' has no loginWithRecoveryKey');
    ok(!/type=['\"]email['\"]|\bemail\s*[:=]/.test(src), f + ' has no email field');
  }
}

const exitCode = summary() ? 0 : 1;
process.exit(exitCode);
