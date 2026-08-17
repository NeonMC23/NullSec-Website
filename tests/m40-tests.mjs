/**
 * NullSec — Milestone 40 (Product Completion Audit & Learning Experience).
 * ------------------------------------------------------------------
 * Category: LOCAL / MOCKED / STATIC (no real Supabase, no browser).
 *
 * This milestone finalizes product-completeness gaps identified by the full
 * product audit:
 *   - Mission modal: guide rendered ONCE (bug fix), campaign context,
 *     prev/next navigation, completion feedback + next-mission CTA.
 *   - Terminology: "stages" → "Campaigns" in user-facing text.
 *   - Navigation: About page reachable from every nav.
 *   - Product-completeness guards (journey flow, mission learning units,
 *     guest/authenticated boundaries, storage, security, legacy).
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
console.log('== 1. Mission modal: guide rendered ONCE (bug fix, STATIC) ==')
{
  const journey = readFileSync(join(JS, 'journey.js'), 'utf8');
  const guideAppends = (journey.match(/body\.appendChild\(renderGuide\(mission\.guide\)\)/g) || []).length;
  ok(guideAppends === 1, 'mission guide is rendered exactly once in the modal (got ' + guideAppends + ')');
}

/* ================================================================== */
console.log('== 2. Mission modal: campaign context + prev/next + completion (STATIC) ==')
{
  const journey = readFileSync(join(JS, 'journey.js'), 'utf8');
  ok(/campaignForMission/.test(journey), 'has campaignForMission helper');
  ok(/mission-campaign-tag/.test(journey), 'modal shows campaign context tag');
  ok(/prevMission/.test(journey) && /nextMissionInCampaign/.test(journey),
    'has prev/next mission navigation helpers');
  ok(/modal-mission-nav/.test(journey), 'modal has prev/next nav container');
  ok(/showMissionComplete/.test(journey) && /Mission complete/.test(journey),
    'completion feedback present');
  ok(/Next:/.test(journey), 'completion shows a next-mission CTA');
  ok(/Keep exploring/.test(journey), 'completion has a keep-exploring action');
  // Helpers exported for consumers/tests.
  ok(/prevMission: prevMission/.test(journey) && /nextMissionInCampaign: nextMissionInCampaign/.test(journey),
    'Journey API exposes prev/next helpers');
}

/* ================================================================== */
console.log('== 3. Mission navigation is deterministic (MOCKED) ==')
{
  const mock = serverMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init(); h.runFile('journey.js');
  await h.W('Auth').createAccount('navuser', 'password123');
  h.W('Progress').init();
  await new Promise(function (r) { h.W('Journey').onReady(r); });

  // Stage 1 missions sorted deterministically.
  const stage1 = h.W('Journey').campaignMissions(1);
  ok(stage1.length > 0, 'stage 1 has missions');
  const first = stage1[0].id;
  const second = stage1[1].id;
  ok(h.W('Journey').prevMission(first) === null, 'first mission has no previous');
  eq(h.W('Journey').nextMissionInCampaign(first).id, second, 'next after first is second');
  eq(h.W('Journey').prevMission(second).id, first, 'prev of second is first');
  const camp = h.W('Journey').campaignForMission(first);
  ok(camp && camp.title === 'Getting Started', 'mission maps to its Campaign');
}

/* ================================================================== */
console.log('== 4. Mission learning unit content (STATIC data) ==')
{
  const missions = JSON.parse(readFileSync(join(ROOT, 'data/missions.json'), 'utf8'));
  ok(missions.length >= 25, 'has a substantive mission set (' + missions.length + ')');
  for (const m of missions) {
    ok(m.title && m.title.trim(), 'mission has a title: ' + m.id);
    ok(m.desc && m.desc.trim(), 'mission has a description: ' + m.id);
    ok(m.guide && String(m.guide).length > 40, 'mission has substantive guide content: ' + m.id);
    ok(typeof m.stage === 'number', 'mission belongs to a stage/campaign: ' + m.id);
  }
  // No duplicated learning content fields causing confusion.
  const descEqDesc = missions.filter(function (m) { return m.desc === m.description; }).length;
  ok(descEqDesc === missions.length, 'desc/description are consistent (no conflicting copy)');
}

/* ================================================================== */
console.log('== 5. Terminology: Campaigns not "stages" (user-facing) ==')
{
  const journeyHtml = readFileSync(join(ROOT, 'journey.html'), 'utf8');
  const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
  ok(/Explore the Campaigns below/.test(journeyHtml), 'journey hero uses Campaigns');
  ok(!/Follow the stages below/.test(journeyHtml), 'journey hero no longer says "stages"');
  ok(/4 progressive Campaigns/.test(indexHtml), 'index uses Campaigns');
  ok(!/4 progressive stages/.test(indexHtml), 'index no longer says "stages"');
}

/* ================================================================== */
console.log('== 6. Navigation: About page reachable everywhere (STATIC) ==')
{
  for (const p of ['index', 'journey', 'profile', 'public-profile', 'community', 'tools', 'articles', 'about', 'contribute']) {
    const html = readFileSync(join(ROOT, p + '.html'), 'utf8');
    ok(/href="about\.html"/.test(html), p + '.html links to About');
  }
  const about = readFileSync(join(ROOT, 'about.html'), 'utf8');
  ok(/class="active">About/.test(about), 'about.html marks About active');
}

/* ================================================================== */
console.log('== 7. Guest cannot complete; authenticated can (LOCAL/MOCKED) ==')
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
console.log('== 10. Legacy guards: no local/social leftover (STATIC) ==')
{
  const socialRe = /\b(follow|follower|following|friends?|like|comments?|direct message|\bdm\b|social feed|timeline)\b\s*[:=(]/i;
  for (const f of ['journey.js', 'profile.js', 'public-profile.js', 'community.js']) {
    const src = readFileSync(join(JS, f), 'utf8');
    const code = src.replace(/\/\/.*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    ok(!socialRe.test(code), f + ' has no implemented social features');
  }
  // No local progression wording in the live Journey UI.
  const journeyHtml = readFileSync(join(ROOT, 'journey.html'), 'utf8');
  const journeyJs = readFileSync(join(JS, 'journey.js'), 'utf8');
  ok(!/saved locally|local progress|anonymous progress|local profile/.test(journeyJs + journeyHtml),
    'no local/anonymous progression wording');
}

const exitCode = summary() ? 0 : 1;
process.exit(exitCode);
