/**
 * NullSec — Milestone 39 (Public Profile Discovery, Sharing & Identity UX).
 * ------------------------------------------------------------------
 * Category: LOCAL / MOCKED / STATIC (no real Supabase, no browser).
 *
 * Covers:
 *   1. Profile UX (header, username, bio, interests, member since, progress,
 *      campaigns, achievements).
 *   2. Sharing (deterministic URL, navigator.share / clipboard fallback,
 *      no network, no local storage).
 *   3. Navigation (Account→Profile, Profile→Journey, Journey→Profile, direct
 *      username link).
 *   4. States (loading, not found, disabled, empty, populated).
 *   5. Security (no credentials/token/internal ID/p_user_id/private access).
 *   6. Storage (no new localStorage/sessionStorage keys).
 *   7. Social guard (no follow/friend/like/comment/DM/feed; Community aggregated).
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

function serverMock() {
  const users = new Map();
  const tokens = new Set();
  function thr(msg) { const e = new Error(msg); e.status = 400; throw e; }
  return {
    register(b) {
      const u = String(b.p_username || '').toLowerCase();
      if (users.has(u)) thr('username_taken');
      users.set(u, { pwd: b.p_password_hash, recovery: b.p_recovery_hash, progress: { missions: {}, weekly: {} }, pub: { enabled: false, bio: null, interests: [] } });
      const t = 'tok-' + u; tokens.add(t); return { token: t, user_id: 1 };
    },
    login(b) {
      const u = String(b.p_username || '').toLowerCase();
      const rec = users.get(u);
      if (!rec || rec.pwd !== b.p_password_hash) thr('invalid_credentials');
      const t = 'tok-' + u; tokens.add(t); return { token: t, user_id: 1 };
    },
    logout(b) { tokens.delete(b.p_token); return {}; },
    validate(t) { return tokens.has(t) ? 1 : null; },
    syncPush() { return {}; },
    publicProfile(b) {
      const u = String(b.p_username || '').toLowerCase();
      const rec = users.get(u);
      if (!rec || !rec.pub.enabled) return { enabled: false };
      const ids = Object.keys(rec.progress.missions || {}).filter(k => rec.progress.missions[k] && rec.progress.missions[k].completed);
      return { enabled: true, username: u, bio: rec.pub.bio, learning_interests: rec.pub.interests, created_at: '2026-01-01T00:00:00Z', completed_mission_ids: ids };
    },
    updatePublicProfile(b) {
      const u = [...users.keys()].find(k => tokens.has(b.p_token));
      if (!u) thr('unauthorized');
      const rec = users.get(u);
      if (b.p_public_profile_enabled !== undefined) rec.pub.enabled = b.p_public_profile_enabled;
      if (b.p_bio !== undefined) rec.pub.bio = b.p_bio;
      if (b.p_learning_interests !== undefined) rec.pub.interests = b.p_learning_interests;
      return { updated: true, user_id: 1 };
    }
  };
}

/* ================================================================== */
console.log('== 1. Canonical URL + sharing helpers (STATIC) ==')
{
  const pp = readFileSync(join(JS, 'public-profile.js'), 'utf8');
  ok(/function getUrl/.test(pp) && /public-profile\.html\?u=/.test(pp), 'getUrl builds canonical ?u= URL');
  ok(/function share\(/.test(pp), 'has a share() function');
  ok(/navigator\.share/.test(pp), 'uses navigator.share when available');
  ok(/navigator\.clipboard/.test(pp), 'has clipboard fallback');
  ok(!/fetch\s*\(|XMLHttpRequest|\.send\s*\(/.test(pp.replace(/\/\/.*/g, '')),
    'sharing never makes a network request');
  ok(!/localStorage|sessionStorage|indexedDB/.test(pp), 'sharing/URL uses no local storage');
  ok(/getUrl: getUrl/.test(pp) && /share: share/.test(pp), 'PublicProfile exposes getUrl + share');
}

/* ================================================================== */
console.log('== 2. Profile URL determinism (LOCAL) ==')
{
  const h = makeHarness();
  h.load(LOAD_ORDER); h.runFile('public-profile.js');
  eq(h.W('PublicProfile').getUrl('Neon'), 'public-profile.html?u=Neon', 'getUrl deterministic');
  ok(/public-profile\.html\?u=/.test(h.W('PublicProfile').getUrl('Alice')), 'getUrl works for any username');
  // All UI references use getUrl, not hardcoded URLs.
  const profileJs = readFileSync(join(JS, 'profile.js'), 'utf8');
  ok(/PublicProfile\.getUrl/.test(profileJs), 'profile.js uses getUrl');
  const journeyJs = readFileSync(join(JS, 'journey.js'), 'utf8');
  ok(/PublicProfile\.getUrl/.test(journeyJs), 'journey.js uses getUrl');
}

/* ================================================================== */
console.log('== 3. Sharing: share() returns without network (LOCAL) ==')
{
  const h = makeHarness();
  h.load(LOAD_ORDER); h.runFile('public-profile.js');
  h.resetFetch();
  // navigator.share/clipboard absent in shim -> returns {ok:false, method:'none'}.
  const res = await h.W('PublicProfile').share('Neon');
  ok(res && res.method === 'none', 'share returns a fallback result when no API available');
  eq(h.calls.fetch.length, 0, 'share makes zero network requests');
}

/* ================================================================== */
console.log('== 4. Profile UX states (STATIC) ==')
{
  const pp = readFileSync(join(JS, 'public-profile.js'), 'utf8');
  // Loading / not-found / disabled / empty / populated.
  ok(/Loading public profile…/.test(pp), 'loading state present');
  ok(/This public profile is unavailable/.test(pp), 'disabled/not-found state present');
  ok(/No missions completed yet/.test(pp), 'empty state present');
  ok(/Public learning identity/.test(pp), 'header label present');
  ok(/Member since/.test(pp), 'member since shown');
  ok(/Campaign progress/.test(pp) && /Achievements/.test(pp), 'campaigns + achievements sections');
  ok(/Explore Learning Journey/.test(pp), 'profile links to Journey');
  // No avatar reintroduced.
  ok(!/avatar/i.test(pp.replace(/\/\*[\s\S]*?\*\//g, '')), 'no avatar in public profile');
}

/* ================================================================== */
console.log('== 5. Navigation: Account→Profile and Journey→Profile (STATIC) ==')
{
  const profileJs = readFileSync(join(JS, 'profile.js'), 'utf8');
  ok(/renderPublicProfile/.test(profileJs), 'account has a public profile section');
  ok(/View public profile/.test(profileJs), 'account links to public profile');
  ok(/Share public profile/.test(profileJs), 'account has share action');

  const journeyJs = readFileSync(join(JS, 'journey.js'), 'utf8');
  ok(/View your public learning profile/.test(journeyJs), 'journey links to own public profile');
  // The link is gated behind PublicProfile + Auth (discrete, non-social).
  ok(/window\.PublicProfile && window\.Auth/.test(journeyJs), 'journey profile link is gated/optional');
}

/* ================================================================== */
console.log('== 6. Security: no credentials/token/internal ID (STATIC) ==')
{
  const pp = readFileSync(join(JS, 'public-profile.js'), 'utf8');
  const code = pp.replace(/\/\/.*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(!/password|password_hash|recovery|recovery_hash|session token|token\b|user_id|identity_id|email/.test(code),
    'public-profile.js references no credentials/internal IDs');
  const api = readFileSync(join(JS, 'api-client.js'), 'utf8');
  ok(!/p_user_id/.test(api.replace(/\/\/.*/g, '')), 'api-client never sends p_user_id');
  ok(!/service_role|service-role|sb_secret/.test(api), 'no service-role key');
}

/* ================================================================== */
console.log('== 7. Storage: no new keys (STATIC) ==')
{
  const files = ['public-profile.js', 'profile.js', 'journey.js'];
  for (const f of files) {
    const src = readFileSync(join(JS, f), 'utf8');
    ok(!/localStorage\.setItem|sessionStorage\.setItem|indexedDB/.test(src), f + ' adds no storage writes');
  }
  const store = readFileSync(join(JS, 'store.js'), 'utf8');
  ok(/THEME/.test(store.slice(store.indexOf('KEYS'), store.indexOf('migrate'))) && !/profile|username|bio|interests/.test(store.slice(store.indexOf('KEYS'), store.indexOf('migrate'))),
    'store.js KEYS unchanged (no profile/username/bio/interests)');
}

/* ================================================================== */
console.log('== 8. Social guard + Community aggregated (STATIC) ==')
{
  const socialRe = /\b(follow|follower|following|friends?|like|comments?|direct message|\bdm\b|social feed|timeline|leaderboard|user directory)\b\s*[:=(]/i;
  for (const f of ['public-profile.js', 'journey.js', 'community.js', 'profile.js']) {
    const src = readFileSync(join(JS, f), 'utf8');
    const code = src.replace(/\/\/.*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    ok(!socialRe.test(code), f + ' has no implemented social features');
  }
  const community = readFileSync(join(JS, 'community.js'), 'utf8');
  ok(!/username|user_id|avatar/.test(community), 'community has no individual identifiers');
}

/* ================================================================== */
console.log('== 9. Journey still public + guests cannot modify (LOCAL/MOCKED) ==')
{
  const g = makeHarness();
  g.load(LOAD_ORDER); cfg(g, BACKEND_OFF);
  g.W('Identity').init(); g.W('Progress').init(); g.resetFetch();
  g.W('Progress').complete('enable-2fa');
  ok(!g.W('Progress').isCompleted('enable-2fa'), 'guest cannot modify progression');
  eq(g.calls.fetch.filter(c => /ns_sync_push/.test(c.url)).length, 0, 'guest triggers no sync');

  const mock = serverMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init(); h.W('Progress').init();
  await h.W('Auth').createAccount('learner', 'password123');
  h.W('Progress').complete('enable-2fa');
  ok(h.W('Progress').isCompleted('enable-2fa'), 'authenticated can complete');
}

/* ================================================================== */
console.log('== 10. Cross-device public profile (MOCKED) ==')
{
  const mock = serverMock();
  const a = makeHarness({ backend: mock });
  a.load(LOAD_ORDER); cfg(a, BACKEND_ON);
  a.W('Identity').init();
  await a.W('Auth').createAccount('shareuser', 'password123');
  const token = a.W('Sync').getToken();
  await a.W('ApiClient').updatePublicProfile(token, { public_profile_enabled: true, bio: 'hi', learning_interests: ['privacy'] });

  // Device B (fresh, no local data) reads the same public profile.
  const b = makeHarness({ backend: mock });
  b.load(LOAD_ORDER); cfg(b, BACKEND_ON);
  const pub = await b.W('ApiClient').publicProfile('shareuser');
  ok(pub && pub.enabled === true, 'device B reads same public profile');
  eq(pub.bio, 'hi', 'same bio on device B');
  ok(!JSON.stringify(b.localBacking).includes('shareuser'), 'device B stores no profile locally');
}

const exitCode = summary() ? 0 : 1;
process.exit(exitCode);
