/**
 * NullSec — Milestone 36 (Account Management & Server Session Lifecycle).
 * ------------------------------------------------------------------
 * Category: LOCAL / MOCKED / STATIC (no real Supabase, no browser).
 *
 * Covers:
 *   1. Account lifecycle: create, sign in, sign out, re-sign in.
 *   2. Session: valid / invalid / expired.
 *   3. Password: change password, current password rejected, new accepted.
 *   4. Recovery: separate, reset password, no session, sign in with new.
 *   5. Storage: no account data in localStorage; no password in sessionStorage.
 *   6. Progress: reset is server-side + authenticated only; guest no mutation.
 *   7. Cross-user: no client-chosen user_id.
 *   8. Community: aggregated only.
 *   9. Legacy: no loginWithRecoveryKey / local profile / email.
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

/** Server-backed stateful mock (account + session live on the "server"). */
function serverMock() {
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
      rec.pwd = body.p_new_password_hash;
      tokens.clear(); // revoke all sessions
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
console.log('== 1. Account lifecycle (LOCAL/MOCKED) ==')
{
  const mock = serverMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();

  // Guest.
  ok(!h.W('Auth').isAuthenticated(), 'starts as guest');

  // Create account.
  const reg = await h.W('Auth').createAccount('alice', 'password123');
  ok(reg.ok, 'create account works');
  ok(h.W('Auth').isAuthenticated(), 'authenticated after create (Option B)');

  // Sign out -> guest.
  h.W('Auth').logout();
  ok(!h.W('Auth').isAuthenticated(), 'sign out -> guest');
  ok(h.sessionBacking['ns:session:auth'] === undefined, 'sign out clears session');

  // Sign in again -> same server account.
  h.resetFetch();
  const login = await h.W('Auth').signIn('alice', 'password123');
  ok(login.ok, 're-sign in works');
  ok(h.W('Auth').isAuthenticated(), 'authenticated again');
  eq(h.W('Auth').getUsername(), 'alice', 'same username from server account');
}

/* ================================================================== */
console.log('== 2. Session lifecycle: valid / invalid / expired (LOCAL/MOCKED) ==')
{
  // Valid.
  const h = makeHarness({ backend: serverMock() });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  await h.W('Auth').createAccount('bob', 'password123');
  ok(h.W('Auth').isAuthenticated(), 'valid session -> authenticated');

  // Invalid token -> guest.
  h.sessionBacking['ns:session:auth'] = JSON.stringify({ token: 'bogus', expires_at: null });
  h.resetFetch();
  await h.W('Session').forceRecheck();
  ok(!h.W('Auth').isAuthenticated(), 'invalid token -> guest');

  // Expired metadata -> guest.
  const h2 = makeHarness({ backend: serverMock() });
  h2.load(LOAD_ORDER); cfg(h2, BACKEND_ON);
  h2.sessionBacking['ns:session:auth'] = JSON.stringify({ token: 'x', expires_at: '2000-01-01T00:00:00Z' });
  await h2.W('Session').forceRecheck();
  ok(!h2.W('Auth').isAuthenticated(), 'expired session -> guest');
}

/* ================================================================== */
console.log('== 3. Password change (LOCAL/MOCKED) ==')
{
  const mock = serverMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  await h.W('Auth').createAccount('carol', 'password123');

  // Wrong current password rejected, session kept.
  const bad = await h.W('Auth').changePassword('wrongpassword', 'newpass456');
  ok(!bad.ok, 'wrong current password rejected');
  ok(h.W('Auth').isAuthenticated(), 'session retained after failed change');

  // Correct change works.
  const okRes = await h.W('Auth').changePassword('password123', 'newpass456');
  ok(okRes.ok, 'password change succeeds');

  // Old password rejected, new accepted.
  h.W('Auth').logout(); h.resetFetch();
  const oldLogin = await h.W('Auth').signIn('carol', 'password123');
  ok(!oldLogin.ok, 'old password rejected after change');
  h.resetFetch();
  const newLogin = await h.W('Auth').signIn('carol', 'newpass456');
  ok(newLogin.ok, 'new password accepted after change');
}

/* ================================================================== */
console.log('== 4. Recovery remains separate (LOCAL/MOCKED) ==')
{
  const mock = serverMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  const reg = await h.W('Auth').createAccount('dave', 'password123');
  ok(reg.recovery_key, 'has a recovery key');
  h.W('Auth').logout(); h.resetFetch();

  const rec = await h.W('Auth').recoverAccount('dave', reg.recovery_key, 'recoveredpw9');
  ok(rec.ok, 'recovery succeeds');
  ok(!h.W('Auth').isAuthenticated(), 'recovery does NOT create a session');
  h.resetFetch();
  const login = await h.W('Auth').signIn('dave', 'recoveredpw9');
  ok(login.ok, 'sign in with new password after recovery');
}

/* ================================================================== */
console.log('== 5. Storage contract (LOCAL/MOCKED) ==')
{
  const h = makeHarness({ backend: serverMock() });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  await h.W('Auth').createAccount('erin', 'password123');
  h.W('Progress').complete('m');

  const lsKeys = Object.keys(h.localBacking);
  ok(lsKeys.every(k => k === 'ns:theme' || k === 'ns:migrated:v1'),
    'localStorage only theme/migration (got: ' + lsKeys.join(',') + ')');
  const ls = JSON.stringify(h.localBacking);
  for (const t of ['username', 'password', 'token', 'recovery', 'user_id', 'progress', 'account', 'profile', 'settings']) {
    ok(!ls.includes(t), 'no "' + t + '" in localStorage');
  }
  ok(!JSON.stringify(h.sessionBacking).includes('password123'), 'no password in sessionStorage');
  const sessKeys = Object.keys(h.sessionBacking);
  ok(sessKeys.every(k => k === 'ns:session:auth' || k === 'ns:session:recovery'),
    'sessionStorage only approved keys');
}

/* ================================================================== */
console.log('== 6. Progress reset is server-side + authenticated (LOCAL/MOCKED) ==')
{
  // Guest cannot reset.
  const g = makeHarness();
  g.load(LOAD_ORDER); cfg(g, BACKEND_OFF);
  g.W('Identity').init(); g.W('Progress').init(); g.resetFetch();
  g.W('Progress').complete('m');
  ok(!g.W('Progress').isCompleted('m'), 'guest cannot mutate progress');

  // Authenticated reset via server RPC.
  const mock = serverMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  await h.W('Auth').createAccount('frank', 'password123');
  h.W('Progress').complete('m1');
  ok(h.W('Progress').isCompleted('m1'), 'authenticated can complete');
  h.resetFetch();
  const res = await h.W('ApiClient').resetProgress(h.W('Sync').getToken());
  ok(res && res.reset === true, 'reset progress calls the server');
  ok(h.calls.fetch.some(c => /ns_reset_progress/.test(c.url)), 'reset uses ns_reset_progress RPC');
}

/* ================================================================== */
console.log('== 7. Cross-user isolation (STATIC) ==')
{
  const api = readFileSync(join(JS, 'api-client.js'), 'utf8');
  ok(!/p_user_id/.test(api.replace(/\/\/.*/g, '')), 'api-client never sends p_user_id');
  const auth = readFileSync(join(JS, 'auth-service.js'), 'utf8');
  ok(!/user_id/.test(auth.replace(/\/\/.*/g, '')), 'auth-service never sends user_id');
}

/* ================================================================== */
console.log('== 8. Community stays aggregated (STATIC) ==')
{
  const community = readFileSync(join(JS, 'community.js'), 'utf8');
  ok(!/user_id|username|avatar|individual progress/.test(community),
    'community exposes no individual data');
}

/* ================================================================== */
console.log('== 9. Legacy cleanup (STATIC) ==')
{
  for (const f of ['auth-service.js', 'api-client.js', 'profile.js', 'session-service.js', 'user-state.js']) {
    const src = readFileSync(join(JS, f), 'utf8');
    ok(!/loginWithRecoveryKey/.test(src), f + ' has no loginWithRecoveryKey');
    ok(!/local profile|saved locally|local account/.test(src), f + ' has no local-account wording');
    ok(!/type=['\"]email['\"]|\bemail\s*[:=]/.test(src), f + ' has no email field');
  }
}

/* ================================================================== */
console.log('== 10. New backend RPCs present + SECURITY DEFINER (STATIC SQL) ==')
{
  const auth = readFileSync(join(ROOT, 'backend/supabase/functions/rpc_auth.sql'), 'utf8');
  const sync = readFileSync(join(ROOT, 'backend/supabase/functions/rpc_sync.sql'), 'utf8');
  const priv = readFileSync(join(ROOT, 'backend/supabase/functions/rpc_privileges.sql'), 'utf8');

  ok(/ns_change_password\(\s*p_token text,\s*p_current_password_hash text,\s*p_new_password_hash text\s*\)/.test(auth),
    'ns_change_password defined with correct signature');
  ok(/SECURITY DEFINER/.test(auth.slice(auth.indexOf('ns_change_password'))), 'ns_change_password is SECURITY DEFINER');
  ok(/ns_reset_progress\(p_token text\)/.test(sync), 'ns_reset_progress defined');
  ok(/SECURITY DEFINER/.test(sync.slice(sync.indexOf('ns_reset_progress'))), 'ns_reset_progress is SECURITY DEFINER');
  ok(/ns_change_password\(text, text, text\)/.test(priv) && /ns_reset_progress\(text\)/.test(priv),
    'privileges reference the new RPCs');
  // No new migration added (still exactly 0001..0017).
  const { readdirSync } = await import('node:fs');
  const migFiles = readdirSync(join(ROOT, 'backend/supabase/migrations')).filter(f => f.endsWith('.sql'));
  ok(migFiles.length === 19, 'exactly 19 migrations');
}


/* ================================================================== */
console.log('== 11. Campaign structure (STATIC) ==')
{
  const journey = readFileSync(join(JS, 'journey.js'), 'utf8');
  const missions = JSON.parse(readFileSync(join(ROOT, 'data/missions.json'), 'utf8'));

  // Campaigns present and deterministic.
  ok(/campaigns = \[/.test(journey), 'journey.js defines campaigns');
  ok(/campaign-1/.test(journey) && /campaign-4/.test(journey), 'campaign ids present');
  ok(/Getting Started/.test(journey) && /Advanced/.test(journey), 'campaign titles present');

  // Missions belong to a stage (campaign).
  const nonWeekly = missions.filter(function (m) { return m.id !== 'weekly-community'; });
  ok(nonWeekly.every(function (m) { return typeof m.stage === 'number' && m.stage >= 1; }),
    'every non-weekly mission belongs to a campaign stage');
  // Campaign ordering deterministic (campaign-1..4).
  const orderOk = journey.indexOf('campaign-1') < journey.indexOf('campaign-2') &&
                  journey.indexOf('campaign-2') < journey.indexOf('campaign-3') &&
                  journey.indexOf('campaign-3') < journey.indexOf('campaign-4');
  ok(orderOk, 'campaign ordering is deterministic');
  // Mission ordering deterministic (sorted by order then id).
  ok(/\.sort\(function \(a, b\)/.test(journey), 'missions are deterministically ordered');
}

/* ================================================================== */
console.log('== 12. Campaign progress + next mission (MOCKED) ==')
{
  const mock = serverMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  // Load journey module with the mission dataset.
  h.runFile('journey.js');
  await h.W('Auth').createAccount('alice', 'password123');
  // Progress state needs an identity-bound progress object.
  h.W('Progress').init();

  // Wait for the async missions.json load to complete.
  await new Promise(function (resolve) { h.W('Journey').onReady(resolve); });

  // Initially nothing completed.
  const c1 = h.W('Journey').getCampaignByStage(1);
  ok(c1 && c1.title === 'Getting Started', 'campaign 1 is Getting Started');
  let s1 = h.W('Journey').campaignStats(c1);
  ok(s1.total > 0, 'campaign 1 has missions');
  ok(s1.completed === 0, 'campaign 1 starts at 0 completed');
  ok(s1.status === 'Not started', 'campaign 1 status Not started');

  // Complete first campaign-1 mission -> status In progress.
  const first = h.W('Journey').campaignMissions(c1.stage)[0];
  h.W('Progress').complete(first.id);
  s1 = h.W('Journey').campaignStats(c1);
  ok(s1.completed === 1, 'campaign 1 completed = 1 after completing a mission');
  ok(s1.status === 'In progress', 'campaign 1 status In progress');
  ok(s1.percentage > 0, 'campaign 1 percentage > 0');

  // Next mission = first incomplete mission of first non-completed campaign.
  // After completing mission[0], the next incomplete mission is mission[1].
  const list = h.W('Journey').campaignMissions(c1.stage);
  const next = h.W('Journey').nextMission();
  ok(next && next.id === list[1].id, 'next mission is the next incomplete mission (deterministic)');

  // Completing all campaign-1 missions -> Completed.
  h.W('Journey').campaignMissions(c1.stage).forEach(function (m) { h.W('Progress').complete(m.id); });
  s1 = h.W('Journey').campaignStats(c1);
  ok(s1.status === 'Completed' && s1.percentage === 100, 'campaign 1 Completed at 100%');
  const nm2 = h.W('Journey').nextMission();
  ok(nm2 && nm2.stage === 2, 'next mission moves to campaign 2 after campaign 1 done');
}

/* ================================================================== */
console.log('== 13. Guest cannot complete; no local progression (LOCAL) ==')
{
  const g = makeHarness();
  g.load(LOAD_ORDER); cfg(g, BACKEND_OFF);
  g.W('Identity').init(); g.W('Progress').init(); g.runFile('journey.js'); g.resetFetch();
  g.W('Progress').complete('enable-2fa');
  ok(!g.W('Progress').isCompleted('enable-2fa'), 'guest cannot complete a mission');
  ok(!JSON.stringify(g.localBacking).match(/missions|weekly|article/), 'no progression in localStorage');
  ok(!JSON.stringify(g.sessionBacking).match(/missions|weekly/), 'no progression in sessionStorage');
  eq(g.calls.fetch.filter(c => /ns_sync_push/.test(c.url)).length, 0, 'guest triggers no sync push');
}

/* ================================================================== */
console.log('== 14. Legacy terminology absent from Journey (STATIC) ==')
{
  const journey = readFileSync(join(JS, 'journey.js'), 'utf8');
  const journeyHtml = readFileSync(join(ROOT, 'journey.html'), 'utf8');
  for (const src of [journey, journeyHtml]) {
    ok(!/saved locally|local progress|anonymous progress|local profile/.test(src),
      'no local/anonymous progression wording');
  }
  ok(/Create an account to save your mission progress/.test(journey), 'guest CTA present');
  ok(/Campaigns/.test(journey) && /next mission/i.test(journey), 'campaign + next-mission concepts present');
}

/* ================================================================== */
console.log('== 15. No private data into HTML / no credentials (STATIC) ==')
{
  const journey = readFileSync(join(JS, 'journey.js'), 'utf8');
  ok(!/password|recovery key|session token|user_id/.test(journey.replace(/\/\/.*/g, '')),
    'journey.js has no credential/private rendering');
  ok(!/localStorage|sessionStorage|indexedDB/.test(journey),
    'journey.js uses no local/session storage for progression');
}

const exitCode = summary() ? 0 : 1;
process.exit(exitCode);

