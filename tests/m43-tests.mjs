/**
 * NullSec — Milestone 43 (Final Product Gap Analysis & Functional Completion).
 * ------------------------------------------------------------------
 * Category: LOCAL / MOCKED / STATIC (no real Supabase, no browser).
 *
 * M43 verifies functional completeness beyond what earlier milestones
 * specified, and covers the fixes implemented:
 *   - Mission-complete feedback double-escape bug (rendered literal "\u2713"
 *     instead of a checkmark) — fixed.
 *   - Campaign-completion feedback when finishing the last mission of a
 *     Campaign (derived, never stored).
 *   - No dead-ends across the full user journeys.
 *   - No duplicate/derivable data stored.
 *   - Public Profile privacy in all states.
 *   - Static-hosting compatibility (relative paths, ?u= routing, JSON fetch).
 *   - No social features.
 */
import { makeHarness, LOAD_ORDER, ok, eq, summary } from './run-tests.mjs';
import { readFileSync, existsSync } from 'node:fs';
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
    syncPull() { return { progress: { version: 1, missions: {} } }; },
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
console.log('== 1. Mission-complete unicode bug fixed (STATIC) ==')
{
  const journey = readFileSync(join(JS, 'journey.js'), 'utf8');
  // The checkmark must be a single-backslash unicode escape (\u2713), not a
  // double-escape (\\u2713) which would render literal text "\u2713".
  const iconLine = journey.split('\n').find(function (l) { return /mission-complete-icon/.test(l); });
  ok(iconLine && /'\\u2713'/.test(iconLine), 'mission-complete icon uses a proper \\u2713 escape');
  ok(!iconLine.includes('\\\\u2713'), 'no double-escape in mission-complete icon');
}

/* ================================================================== */
console.log('== 2. Campaign-completion feedback (STATIC) ==')
{
  const journey = readFileSync(join(JS, 'journey.js'), 'utf8');
  ok(/campaignJustCompleted/.test(journey), 'detects campaign completion after last mission');
  ok(/mission-complete-campaign/.test(journey), 'renders a campaign-complete badge');
  ok(/campaignStats\(camp\)/.test(journey), 'derives completion from campaign stats (never stored)');
  ok(/st\.total > 0 && st\.completed >= st\.total/.test(journey), 'completion derived deterministically');
}

/* ================================================================== */
console.log('== 3. Campaign-completion is derived (MOCKED) ==')
{
  const mock = serverMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init(); h.runFile('journey.js');
  await h.W('Auth').createAccount('learner', 'password123');
  h.W('Progress').init();
  await new Promise(function (r) { h.W('Journey').onReady(r); });

  // Stage 1 has 8 missions. Before completing any, campaign not complete.
  const c1 = h.W('Journey').getCampaignByStage(1);
  const s0 = h.W('Journey').campaignStats(c1);
  ok(s0.completed === 0, 'starts at 0 completed');

  // Complete all stage-1 missions -> campaign completed (derived).
  const list = h.W('Journey').campaignMissions(1);
  list.forEach(function (m) { h.W('Progress').complete(m.id); });
  const s1 = h.W('Journey').campaignStats(c1);
  ok(s1.completed === list.length && s1.percentage === 100, 'campaign 100% after all missions');
  ok(s1.status === 'Completed', 'campaign status Completed');

  // Next mission moves to campaign 2.
  const nm = h.W('Journey').nextMission();
  ok(nm && nm.stage === 2, 'next mission is in the next campaign');
}

/* ================================================================== */
console.log('== 4. Journey: no dead-ends, deterministic ordering (MOCKED) ==')
{
  const mock = serverMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init(); h.runFile('journey.js');
  await h.W('Auth').createAccount('nav', 'password123');
  h.W('Progress').init();
  await new Promise(function (r) { h.W('Journey').onReady(r); });

  const missions = JSON.parse(readFileSync(join(ROOT, 'data/missions.json'), 'utf8'));
  const nonWeekly = missions.filter(function (m) { return m.id !== 'weekly-community'; });
  // Every mission belongs to a campaign and has prev/next within it.
  for (const m of nonWeekly) {
    const camp = h.W('Journey').campaignForMission(m.id);
    ok(camp, 'mission in a campaign: ' + m.id);
    const list = h.W('Journey').campaignMissions(m.stage);
    const idx = list.findIndex(function (x) { return x.id === m.id; });
    ok(idx !== -1, 'mission ordered in campaign: ' + m.id);
  }
  // Campaigns ordered 1..4.
  const camps = h.W('Journey').getCampaigns();
  ok(camps.map(function (c) { return c.stage; }).join(',') === '1,2,3,4', 'campaigns ordered deterministically');
}

/* ================================================================== */
console.log('== 5. Public Profile privacy in all states (MOCKED) ==')
{
  const mock = serverMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  await h.W('Auth').createAccount('priv', 'password123');
  // Disabled == nonexistent (non-enumerating).
  const none = await h.W('ApiClient').publicProfile('ghost');
  const disabled = await h.W('ApiClient').publicProfile('priv');
  ok(JSON.stringify(none) === JSON.stringify(disabled), 'nonexistent and disabled indistinguishable');
  ok(!/password|recovery|token|user_id|email/.test(JSON.stringify(disabled)), 'disabled returns no private data');

  // Enable + empty -> no completed missions but valid.
  const token = h.W('Sync').getToken();
  await h.W('ApiClient').updatePublicProfile(token, { public_profile_enabled: true, bio: '', learning_interests: [] });
  const empty = await h.W('ApiClient').publicProfile('priv');
  ok(empty && empty.enabled === true && (empty.completed_mission_ids || []).length === 0,
    'enabled empty profile valid');

  // Enable + populated.
  await h.W('ApiClient').updatePublicProfile(token, { bio: 'Learner', learning_interests: ['privacy'] });
  const populated = await h.W('ApiClient').publicProfile('priv');
  ok(populated.bio === 'Learner' && populated.learning_interests.length === 1, 'populated profile returned');
  ok(!/password|recovery|token|user_id|email/.test(JSON.stringify(populated)), 'no private fields');
}

/* ================================================================== */
console.log('== 6. Static-hosting compatibility (STATIC) ==')
{
  // Relative asset paths, ?u= routing, JSON fetch via Data.
  const pp = readFileSync(join(JS, 'public-profile.js'), 'utf8');
  ok(/\\?u=/.test(pp), 'public profile uses ?u= query routing (static-friendly)');
  ok(/Data\.loadMissions/.test(pp), 'uses Data loader for static JSON');
  const config = readFileSync(join(JS, 'config.js'), 'utf8');
  ok(/__NULLSEC_SUPABASE__/.test(config), 'backend config injected at build (no hardcoded secrets)');
  // Relative paths in HTML assets.
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  ok(/src="assets\/js\//.test(html) || /href="assets\/css\//.test(html), 'relative asset paths used');
}

/* ================================================================== */
console.log('== 7. No derivable data stored (STATIC) ==')
{
  const missions = JSON.parse(readFileSync(join(ROOT, 'data/missions.json'), 'utf8'));
  ok(!('completion_percentage' in missions[0]) && !('campaign_percentage' in missions[0]) &&
     !('achievement_state' in missions[0]), 'no derived stats stored in content');
  const progress = readFileSync(join(JS, 'progress-service.js'), 'utf8');
  const progCode = progress.replace(/\/\/.*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(!/localStorage\.setItem/.test(progCode), 'progress-service never writes localStorage');
  // Achievements are derived in public-profile.js, not stored.
  const pp = readFileSync(join(JS, 'public-profile.js'), 'utf8');
  ok(/function computeAchievements/.test(pp), 'achievements derived via function');
}

/* ================================================================== */
console.log('== 8. No dead links / navigation matrix (STATIC) ==')
{
  const pages = ['index', 'journey', 'tools', 'articles', 'community', 'contribute', 'about', 'profile', 'public-profile'];
  for (const p of pages) {
    const html = readFileSync(join(ROOT, p + '.html'), 'utf8');
    const hrefs = (html.match(/href="([^"]*\.html)"/g) || [])
      .map(function (x) { return x.replace('href="', '').replace('"', ''); })
      .filter(function (h) { return !h.startsWith('http') && h !== './'; });
    for (const h of hrefs) {
      ok(existsSync(join(ROOT, h.split('?')[0])), p + '.html -> existing: ' + h);
    }
  }
  // Every major page reachable from the nav.
  for (const target of ['journey.html', 'tools.html', 'articles.html', 'community.html', 'contribute.html', 'about.html', 'profile.html']) {
    ok(new RegExp('href=["\']' + target).test(readFileSync(join(ROOT, 'index.html'), 'utf8')),
      'index.html links to ' + target);
  }
  // Home itself uses the conventional ./ relative link.
  ok(/href="\.\/"/.test(readFileSync(join(ROOT, 'index.html'), 'utf8')), 'index.html has a home link (./)');
}

/* ================================================================== */
console.log('== 9. Guest/authenticated boundaries (LOCAL/MOCKED) ==')
{
  const g = makeHarness();
  g.load(LOAD_ORDER); cfg(g, BACKEND_OFF);
  g.W('Identity').init(); g.W('Progress').init(); g.resetFetch();
  g.W('Progress').complete('enable-2fa');
  ok(!g.W('Progress').isCompleted('enable-2fa'), 'guest cannot complete');
  eq(g.calls.fetch.filter(function (c) { return /ns_sync_push/.test(c.url); }).length, 0, 'guest triggers no sync');

  const mock = serverMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init(); h.W('Progress').init();
  await h.W('Auth').createAccount('learner2', 'password123');
  h.W('Progress').complete('enable-2fa');
  ok(h.W('Progress').isCompleted('enable-2fa'), 'authenticated can complete');
}

/* ================================================================== */
console.log('== 10. No social features / Community aggregated (STATIC) ==')
{
  const socialRe = /\b(follow|follower|following|friends?|like|comments?|direct message|\bdm\b|social feed|timeline|leaderboard|user directory)\b\s*[:=(]/i;
  for (const f of ['journey.js', 'profile.js', 'public-profile.js', 'community.js', 'home.js']) {
    const src = readFileSync(join(JS, f), 'utf8');
    const code = src.replace(/\/\/.*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    ok(!socialRe.test(code), f + ' has no implemented social features');
  }
  const community = readFileSync(join(JS, 'community.js'), 'utf8');
  ok(!/username|user_id|avatar/.test(community), 'community has no individual identifiers');
}

/* ================================================================== */
console.log('== 11. Storage contract (LOCAL/MOCKED) ==')
{
  const h = makeHarness({ backend: serverMock() });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init(); h.W('Progress').init();
  await h.W('Auth').createAccount('store', 'password123');
  h.W('Progress').complete('enable-2fa');
  const lsKeys = Object.keys(h.localBacking);
  ok(lsKeys.every(function (k) { return k === 'ns:theme' || k === 'ns:migrated:v1'; }),
    'localStorage only theme/migration');
  const ssKeys = Object.keys(h.sessionBacking);
  ok(ssKeys.every(function (k) { return k === 'ns:session:auth' || k === 'ns:session:recovery'; }),
    'sessionStorage only approved keys');
  const ls = JSON.stringify(h.localBacking);
  ok(!/password|token|user_id|progress|profile|username/.test(ls), 'no account data in localStorage');
}

/* ================================================================== */
console.log('== 12. Security: no p_user_id / service-role / XSS (STATIC) ==')
{
  for (const f of ['api-client.js', 'auth-service.js', 'journey.js', 'profile.js', 'public-profile.js']) {
    const src = readFileSync(join(JS, f), 'utf8');
    ok(!/service_role|service-role|serviceRole|sb_secret/.test(src), f + ' has no service-role');
  }
  const api = readFileSync(join(JS, 'api-client.js'), 'utf8');
  ok(!/p_user_id/.test(api.replace(/\/\/.*/g, '')), 'api-client never sends p_user_id');
  const pp = readFileSync(join(JS, 'public-profile.js'), 'utf8');
  ok(/text: profile\.bio/.test(pp) && /text: '@' \+ username/.test(pp), 'bio/username rendered as text');
  ok(!/\.innerHTML\s*=/.test(pp), 'no innerHTML injection');
  // SQL RPCs use SECURITY DEFINER + search_path.
  for (const f of ['rpc_auth.sql', 'rpc_sync.sql', 'rpc_public_profile.sql', 'rpc_update_public_profile.sql']) {
    const sql = readFileSync(join(ROOT, 'backend/supabase/functions', f), 'utf8');
    ok(/SECURITY DEFINER/.test(sql) && /SET search_path = public/.test(sql), f + ' hardened');
  }
}

const exitCode = summary() ? 0 : 1;
process.exit(exitCode);
