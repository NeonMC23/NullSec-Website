/**
 * NullSec — Milestone 41 (Deep Product Audit, UX Polish & Content Completion).
 * ------------------------------------------------------------------
 * Category: LOCAL / MOCKED / STATIC (no real Supabase, no browser).
 *
 * Covers the deep-product-audit findings implemented in M41:
 *   - Modal accessibility (role=dialog, aria-modal, focus-on-open, Escape).
 *   - Guest mission-modal CTA (no dead "Mark as complete" for guests).
 *   - Navigation completeness (About in nav + footer everywhere).
 *   - Terminology (Campaigns, no user-facing "stages"/local-progress).
 *   - Content integrity (missions/articles well-formed, no filler gaps).
 *   - XSS-safety (user-controlled bio/interests/username rendered as text).
 *   - Guest/authenticated boundaries, storage, security, legacy guards.
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
console.log('== 1. Modal accessibility (STATIC) ==')
{
  const modal = readFileSync(join(JS, 'modal.js'), 'utf8');
  ok(/setAttribute\('role', 'dialog'\)/.test(modal), 'modal has role=dialog');
  ok(/aria-modal/.test(modal), 'modal has aria-modal');
  ok(/aria-label/.test(modal), 'modal close has aria-label');
  ok(/Escape/.test(modal), 'modal closes on Escape');
  ok(/closeBtn\.focus\(\)/.test(modal), 'modal moves focus on open');
}

/* ================================================================== */
console.log('== 2. Guest mission-modal CTA (STATIC) ==')
{
  const journey = readFileSync(join(JS, 'journey.js'), 'utf8');
  ok(/Create account to save progress/.test(journey), 'guests see a sign-up CTA in the mission modal');
  ok(/isAuthenticated\(\)/.test(journey.slice(journey.indexOf('let authd'))), 'completion action is auth-gated');
  ok(/Modal.close/.test(journey), 'close still works');
}

/* ================================================================== */
console.log('== 3. Navigation completeness: About everywhere (STATIC) ==')
{
  for (const p of ['index', 'journey', 'profile', 'public-profile', 'community', 'tools', 'articles', 'about', 'contribute']) {
    const html = readFileSync(join(ROOT, p + '.html'), 'utf8');
    ok(/href="about\.html"/.test(html), p + '.html links to About (nav or footer)');
  }
  // About link appears in both nav and footer on the main pages.
  const index = readFileSync(join(ROOT, 'index.html'), 'utf8');
  ok(/navbar-links[\s\S]*about\.html/.test(index), 'index nav has About');
  ok(/footer[\s\S]*about\.html/.test(index), 'index footer has About');
}

/* ================================================================== */
console.log('== 4. Terminology: no user-facing "stages"/local-progress (STATIC) ==')
{
  const pages = ['index.html', 'journey.html'];
  for (const p of pages) {
    const html = readFileSync(join(ROOT, p), 'utf8');
    ok(!/Follow the stages below|4 progressive stages/.test(html), p + ' has no user-facing "stages"');
  }
  const journeyJs = readFileSync(join(JS, 'journey.js'), 'utf8');
  const journeyHtml = readFileSync(join(ROOT, 'journey.html'), 'utf8');
  ok(!/saved locally|local progress|anonymous progress|local profile/.test(journeyJs + journeyHtml),
    'no local/anonymous progression wording');
}

/* ================================================================== */
console.log('== 5. Content integrity (STATIC data) ==')
{
  const missions = JSON.parse(readFileSync(join(ROOT, 'data/missions.json'), 'utf8'));
  const articles = JSON.parse(readFileSync(join(ROOT, 'data/articles.json'), 'utf8'));
  ok(missions.length >= 25, 'substantive mission set (' + missions.length + ')');
  ok(articles.length >= 5, 'substantive article set (' + articles.length + ')');

  // Unique mission ids + titles; coherent stage/difficulty; substantive guides.
  const ids = missions.map(m => m.id);
  ok(new Set(ids).size === ids.length, 'mission ids unique');
  const titles = missions.map(m => m.title.trim().toLowerCase());
  ok(new Set(titles).size === titles.length, 'mission titles unique');
  for (const m of missions) {
    ok(m.stage >= 0 && m.stage <= 4, 'mission stage in range: ' + m.id);
    ok(typeof m.difficulty === 'number' && m.difficulty >= 1 && m.difficulty <= 5, 'difficulty 1..5: ' + m.id);
    ok(m.guide && String(m.guide).length > 40, 'substantive guide: ' + m.id);
  }
  // Deterministic campaign/mission ordering source: no duplicate progression data.
  ok(!('completion_percentage' in missions[0]) && !('campaign_percentage' in missions[0]),
    'no redundant stored percentage fields in missions');
}

/* ================================================================== */
console.log('== 6. XSS-safety: user-controlled fields rendered as text (STATIC) ==')
{
  const pp = readFileSync(join(JS, 'public-profile.js'), 'utf8');
  // bio and interests use `text:` (textContent), not `html:`.
  ok(/text: profile\.bio/.test(pp), 'bio rendered as text (not HTML)');
  ok(/text: t/.test(pp) || /text: \+/.test(pp), 'interests rendered as text');
  ok(/text: '@' \+ username/.test(pp), 'username rendered as text');
  // The public-profile HTML container must not use innerHTML on user data.
  ok(!/\.innerHTML\s*=/.test(pp), 'public-profile.js does not inject user data via innerHTML');
  // profile.js edit form uses .value, not innerHTML.
  const profileJs = readFileSync(join(JS, 'profile.js'), 'utf8');
  ok(/bioInput\.value/.test(profileJs) && /interestsInput\.value/.test(profileJs),
    'profile edit uses input values (not HTML injection)');
}

/* ================================================================== */
console.log('== 7. Guest/authenticated boundaries (LOCAL/MOCKED) ==')
{
  const g = makeHarness();
  g.load(LOAD_ORDER); cfg(g, BACKEND_OFF);
  g.W('Identity').init(); g.W('Progress').init(); g.resetFetch();
  g.W('Progress').complete('enable-2fa');
  ok(!g.W('Progress').isCompleted('enable-2fa'), 'guest cannot complete');
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
console.log('== 8. Storage: no account/progression in localStorage (LOCAL/MOCKED) ==')
{
  const h = makeHarness({ backend: serverMock() });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init(); h.W('Progress').init();
  await h.W('Auth').createAccount('storeuser', 'password123');
  h.W('Progress').complete('enable-2fa');
  const lsKeys = Object.keys(h.localBacking);
  ok(lsKeys.every(k => k === 'ns:theme' || k === 'ns:migrated:v1'),
    'localStorage only theme/migration (got: ' + lsKeys.join(',') + ')');
  const ls = JSON.stringify(h.localBacking);
  ok(!/password|token|recovery|progress|profile|username/.test(ls), 'no account/progression in localStorage');
  ok(!JSON.stringify(h.sessionBacking).includes('password'), 'no password in sessionStorage');
}

/* ================================================================== */
console.log('== 9. Security: no p_user_id / service-role / private leakage (STATIC) ==')
{
  for (const f of ['api-client.js', 'journey.js', 'profile.js', 'public-profile.js']) {
    const src = readFileSync(join(JS, f), 'utf8');
    ok(!/service_role|service-role|serviceRole|sb_secret/.test(src), f + ' has no service-role key');
  }
  const api = readFileSync(join(JS, 'api-client.js'), 'utf8');
  ok(!/p_user_id/.test(api.replace(/\/\/.*/g, '')), 'api-client never sends p_user_id');
  const community = readFileSync(join(JS, 'community.js'), 'utf8');
  ok(!/username|user_id|avatar/.test(community), 'community has no individual identifiers');
}

/* ================================================================== */
console.log('== 10. Legacy / social guards (STATIC) ==')
{
  const socialRe = /\b(follow|follower|following|friends?|like|comments?|direct message|\bdm\b|social feed|timeline|leaderboard|user directory)\b\s*[:=(]/i;
  for (const f of ['journey.js', 'profile.js', 'public-profile.js', 'community.js']) {
    const src = readFileSync(join(JS, f), 'utf8');
    const code = src.replace(/\/\/.*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    ok(!socialRe.test(code), f + ' has no implemented social features');
  }
}

/* ================================================================== */
console.log('== 11. Public profile opt-in privacy (MOCKED) ==')
{
  const mock = serverMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  await h.W('Auth').createAccount('profileuser', 'password123');

  // Disabled by default.
  h.resetFetch();
  const disabled = await h.W('ApiClient').publicProfile('profileuser');
  ok(disabled && disabled.enabled === false, 'profile disabled by default (enabled:false)');
  const djson = JSON.stringify(disabled);
  ok(!/password|recovery|token|user_id|email/.test(djson), 'disabled profile returns no private data');

  // Enable it.
  const token = h.W('Sync').getToken();
  await h.W('ApiClient').updatePublicProfile(token, { public_profile_enabled: true, bio: 'Learner', learning_interests: ['privacy'] });
  h.resetFetch();
  const pub = await h.W('ApiClient').publicProfile('profileuser');
  ok(pub && pub.enabled === true, 'enabled profile readable');
  const pjson = JSON.stringify(pub);
  ok(!/password|recovery|token|user_id|identity_id|email/.test(pjson), 'public profile has no private fields');
}

const exitCode = summary() ? 0 : 1;
process.exit(exitCode);
