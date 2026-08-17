/**
 * NullSec — Milestone 35 (Community Dashboard & Aggregated Intelligence).
 * ------------------------------------------------------------------
 * Category: LOCAL / MOCKED / STATIC (no real Supabase, no browser).
 *
 * Verifies that Community is a strictly aggregated view and never exposes
 * individual users: no usernames, avatars, user IDs, personal progression,
 * member lists, or direct frontend access to private tables. Also verifies
 * the new page structure (overview / country activity / activity breakdown),
 * loading/empty/error states, and that no new local storage is introduced.
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

/** Server-backed stateful mock (account lives in the mock "server"). */
function serverMock() {
  const users = new Map();
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
      rec.pwd = body.p_new_password_hash; return { recovered: true, user_id: 1 };
    },
    validate(token) { return tokens.has(token) ? 1 : null; },
    logout(body) { tokens.delete(body.p_token); return {}; },
    syncPush() { return {}; }
  };
}

/** Stateful username+password mock (alias, for clarity). */
function authMock() { return serverMock(); }
/* ================================================================== */
console.log('== 1. Community privacy (STATIC) ==');
{
  const community = readFileSync(join(JS, 'community.js'), 'utf8');
  const communityHtml = readFileSync(join(ROOT, 'community.html'), 'utf8');
  const api = readFileSync(join(JS, 'api-client.js'), 'utf8');

  // No individual identifiers in the Community UI code.
  ok(!/user_id|identity_id|username|avatar|password|recovery_key|session token/.test(community),
    'community.js exposes no individual identifiers');
  // No member / profile-card UI.
  ok(!/member card|profile card|user list|member list/.test(community),
    'community.js has no member/profile-card UI');
  // Community HTML has no individual user listing.
  const noNav = communityHtml.replace(/href="profile\.html"[^>]*>[^<]*<\/a>/g, '');
  ok(!/user_id|username|avatar|member card|profile card/.test(noNav),
    'community.html has no individual user listing');
  // ApiClient must not fetch the users table from Community paths.
  ok(!/from\s+public\.users|select\('users'|\.users\b/.test(api),
    'api-client never selects the users table');
}

/* ================================================================== */
console.log('== 2. Aggregation source (STATIC) ==');
{
  const community = readFileSync(join(JS, 'community.js'), 'utf8');
  // Community uses CountryMetrics (aggregated RPC) as its data source.
  ok(/CountryMetrics\.getData\(\)/.test(community), 'community uses CountryMetrics.getData()');
  // No direct ApiClient private-table read / no direct users aggregation.
  ok(!/ApiClient\.select\('user|ApiClient\.select\("user/.test(community),
    'community does not query private user tables via ApiClient');
  ok(!/localStorage|sessionStorage|indexedDB|cookie/.test(community),
    'community.js reads no local/session storage for statistics');
  // Community uses aggregated RPCs, not a users list.
  ok(!/\.users\b/.test(community), 'community.js never iterates a users list');
}

/* ================================================================== */
console.log('== 3. New page structure (STATIC) ==')
{
  const html = readFileSync(join(ROOT, 'community.html'), 'utf8');
  const js = readFileSync(join(JS, 'community.js'), 'utf8');
  // Recommended structure present.
  ok(/community-overview/.test(html), 'Community Overview container present');
  ok(/country-activity/.test(html), 'Country Activity container present');
  ok(/activity-breakdown/.test(html), 'Activity Breakdown container present');
  ok(/community-privacy/.test(html), 'Privacy note container present');
  // Render functions present in the module.
  ok(/renderOverview/.test(js) && /renderCountryActivity/.test(js) && /renderActivityBreakdown/.test(js),
    'community.js renders overview + country activity + activity breakdown');
  // Aggregate metrics labels.
  ok(/Total participants/.test(js), 'overview shows total participants');
  ok(/Countries represented/.test(js), 'overview shows countries represented');
  ok(/Missions completed/.test(js), 'overview shows missions completed');
  ok(/Community activity/.test(js), 'overview shows community activity');
}

/* ================================================================== */
console.log('== 4. Loading / empty / error states (STATIC) ==')
{
  const js = readFileSync(join(JS, 'community.js'), 'utf8');
  ok(/Loading…/.test(js), 'loading placeholder present');
  ok(/Community statistics unavailable\. Please try again later\./.test(js),
    'error state present (does not fabricate 0)');
  ok(/No community statistics yet\.|No country activity yet\.|No activity breakdown yet\./.test(js),
    'empty states present');
  ok(!/Participants: 0/.test(js), 'no fake zero fallback');
}

/* ================================================================== */
console.log('== 5. Activity breakdown (STATIC) ==')
{
  const js = readFileSync(join(JS, 'community.js'), 'utf8');
  for (const label of ['Missions', 'Tools', 'Community actions', 'Propagation']) {
    ok(new RegExp("'" + label + "'").test(js), 'activity breakdown includes ' + label);
  }
}

/* ================================================================== */
console.log('== 6. No local storage / no credentials (STATIC) ==')
{
  const community = readFileSync(join(JS, 'community.js'), 'utf8');
  ok(!/localStorage\.setItem|sessionStorage\.setItem|indexedDB/.test(community),
    'community introduces no local storage');
  ok(!/password|token|recovery/.test(community), 'community has no credentials');
}

/* ================================================================== */
console.log('== 7. Legacy terminology removed (STATIC) ==')
{
  const html = readFileSync(join(ROOT, 'community.html'), 'utf8');
  ok(!/Local Profile|saved locally|local progress storage|anonymous profile|social profile/.test(html),
    'community.html has no legacy/social terminology');
  const js = readFileSync(join(JS, 'community.js'), 'utf8');
  ok(!/Local Profile|saved locally|local progress storage/.test(js),
    'community.js has no legacy terminology');
}

/* ================================================================== */
console.log('== 8. UI module contract (STATIC) ==')
{
  const community = readFileSync(join(JS, 'community.js'), 'utf8');
  // Keep the M26/M27/M28 contracts.
  ok(/CommunityActionService\.record/.test(community), 'community UI uses CommunityActionService');
  ok(!/ApiClient\.recordActivity/.test(community), 'community does not call recordActivity directly');
  ok(!/\bfetch\s*\(/.test(community), 'community.js has no direct fetch');
}

/* ================================================================== */
console.log('== 9. Backend RPC aggregation (STATIC SQL) ==')
{
  const rpc = readFileSync(join(ROOT, 'backend/supabase/functions/rpc_country_metrics.sql'), 'utf8');
  ok(/json_object_agg/.test(rpc), 'ns_country_metrics aggregates server-side');
  ok(/SECURITY DEFINER/.test(rpc), 'ns_country_metrics is SECURITY DEFINER');
  // No individual fields returned.
  ok(!/\.username|\buser_id\b|identity_id/.test(rpc.replace(/--[^\n]*/g, '')),
    'ns_country_metrics returns no individual identifiers');
}


/* ================================================================== */
console.log('== 10. Real account: cross-device sign-in needs no local data (MOCKED) ==')
{
  // A single server-side mock shared by both "devices" (the account lives on
  // the server, not in the browser).
  const shared = serverMock();
  // Device A: create account.
  const a = makeHarness({ backend: shared });
  a.load(LOAD_ORDER); cfg(a, BACKEND_ON);
  a.W('Identity').init();
  const reg = await a.W('Auth').createAccount('alice', 'password123');
  ok(reg.ok, 'device A creates the account server-side');

  // Sign out on device A, then simulate a completely fresh device B.
  a.W('Auth').logout();
  const b = makeHarness({ backend: shared });
  b.load(LOAD_ORDER); cfg(b, BACKEND_ON);
  b.resetFetch();
  const loginB = await b.W('Auth').signIn('alice', 'password123');
  ok(loginB.ok, 'device B signs in with username+password only (no local data)');
  ok(b.W('Auth').isAuthenticated(), 'device B authenticated via the shared server');
  // No local data was required: local storage has no account data.
  const ls = JSON.stringify(b.localBacking);
  ok(!/password|recovery|token|progress|username/.test(ls), 'device B used no local account data');
  eq(b.calls.fetch.filter(c => /ns_login/.test(c.url)).length, 1,
    'device B login goes through ns_login (server)');
}

/* ================================================================== */
console.log('== 11. Real account: server is source of truth (LOCAL/MOCKED) ==')
{
  // Server-backed stateful mock storing a user.
  const mock = serverMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  await h.W('Auth').createAccount('bob', 'password123');
  h.W('Auth').logout();
  // Clearing local state then signing in restores the same server account.
  h.localBacking = {}; h.sessionBacking = {}; h.resetFetch();
  await h.W('Auth').signIn('bob', 'password123');
  ok(h.W('Auth').isAuthenticated(), 'server account restored after clearing local data');
  eq(h.W('Auth').getUsername(), 'bob', 'username from server account');
}

/* ================================================================== */
console.log('== 12. Session storage + username preservation (LOCAL/MOCKED) ==')
{
  const mock = serverMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  await h.W('Auth').createAccount('carol', 'password123');
  ok(h.W('Auth').getUsername() === 'carol', 'username stored on sign-in');

  // Session restoration preserves the username (not the local UUID).
  h.sessionBacking['ns:session:auth'] = JSON.stringify({ token: h.W('Sync').getToken(), username: 'carol', expires_at: null });
  h.resetFetch();
  await h.W('Session').forceRecheck();
  ok(h.W('Auth').isAuthenticated(), 'session restored');
  ok(h.W('Auth').getUsername() === 'carol', 'session restoration keeps the server username');

  // sessionStorage only holds approved keys; no password.
  const sessKeys = Object.keys(h.sessionBacking);
  ok(sessKeys.every(k => k === 'ns:session:auth' || k === 'ns:session:recovery'),
    'sessionStorage only contains approved session keys');
  ok(!JSON.stringify(h.sessionBacking).includes('password123'), 'no password in sessionStorage');
}

/* ================================================================== */
console.log('== 13. Journey: guest cannot write; auth can; sync restores (LOCAL/MOCKED) ==')
{
  const g = makeHarness();
  g.load(LOAD_ORDER); cfg(g, BACKEND_OFF);
  g.W('Identity').init(); g.W('Progress').init(); g.resetFetch();
  g.W('Progress').complete('m');
  ok(!g.W('Progress').isCompleted('m'), 'guest cannot complete');
  ok(!g.W('Progress').get().missions['m'], 'guest has no progression');

  // Authenticated complete + reload reflects server state.
  const mock = serverMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  await h.W('Auth').createAccount('dave', 'password123');
  h.W('Progress').complete('m1');
  ok(h.W('Progress').isCompleted('m1'), 'authenticated can complete');
  // reload() pulls from ProgressRepository (in-memory) — reflects saved state.
  h.W('Progress').reload();
  ok(h.W('Progress').isCompleted('m1'), 'reload preserves completed missions');

  // Sign out blocks progression.
  h.W('Auth').logout();
  h.resetFetch();
  h.W('Progress').complete('m2');
  ok(!h.W('Progress').isCompleted('m2'), 'sign out blocks progression');
}

/* ================================================================== */
console.log('== 14. Storage contract: localStorage only theme/migration (LOCAL/MOCKED) ==')
{
  const h = makeHarness({ backend: serverMock() });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  await h.W('Auth').createAccount('erin', 'password123');
  h.W('Progress').complete('m');
  const keys = Object.keys(h.localBacking);
  ok(keys.every(k => k === 'ns:theme' || k === 'ns:migrated:v1'),
    'localStorage only contains theme/migration (got: ' + keys.join(',') + ')');
  const ls = JSON.stringify(h.localBacking);
  for (const t of ['username', 'password', 'token', 'recovery', 'user_id', 'progress', 'account', 'profile']) {
    ok(!ls.includes(t), 'no "' + t + '" in localStorage');
  }
}

/* ================================================================== */
console.log('== 15. Legacy cleanup: no local profile / no profile public (STATIC) ==')
{
  const files = ['auth-service.js', 'api-client.js', 'session-service.js', 'profile.js', 'user-state.js', 'identity.js'];
  for (const f of files) {
    const src = readFileSync(join(JS, f), 'utf8');
    ok(!/loginWithRecoveryKey/.test(src), f + ' has no loginWithRecoveryKey');
    ok(!/local profile|saved locally|local progress storage/.test(src), f + ' has no local-profile wording');
    ok(!/type=['\"]email['\"]|\bemail\s*[:=]/.test(src), f + ' has no email field');
  }
  // profile.html is the private Account page (documented), not a public profile.
  const html = readFileSync(join(ROOT, 'profile.html'), 'utf8');
  ok(!/public profile|profile page|view profile/.test(html), 'profile.html is not a public profile page');
}

const exitCode = summary() ? 0 : 1;
process.exit(exitCode);
