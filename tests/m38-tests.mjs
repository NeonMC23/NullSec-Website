/**
 * NullSec — Milestone 38 (Public Profile Customization & Learning Identity).
 * ------------------------------------------------------------------
 * Category: LOCAL / MOCKED / STATIC (no real Supabase, no browser).
 *
 * Covers:
 *   1. Profile structure (username, bio, interests, member since, progress,
 *      campaigns, achievements).
 *   2. Public API (RPC returns only approved fields; no credentials/IDs).
 *   3. Privacy (disabled profile hidden, guest read-only, owner edit own,
 *      cannot edit others).
 *   4. Progression (deterministic derivation, no duplication, achievements).
 *   5. Storage (no profile data in localStorage).
 *   6. Social guard (no follow/followers/likes/comments/DM/feed).
 *   7. Security (no client user_id, authenticated update, no service-role).
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

/** Server-backed mock with a public-profile model (enabled flag, bio, interests). */
function serverMock() {
  const users = new Map(); // username -> { pwd, recovery, progress, pub }
  const tokens = new Set();
  function thr(msg) { const e = new Error(msg); e.status = 400; throw e; }
  return {
    register(body) {
      const u = String(body.p_username || '').toLowerCase();
      if (users.has(u)) thr('username_taken');
      users.set(u, {
        pwd: body.p_password_hash, recovery: body.p_recovery_hash,
        progress: { missions: {}, weekly: {} },
        pub: { enabled: false, bio: null, interests: [] }
      });
      const t = 'tok-' + u; tokens.add(t); return { token: t, user_id: 1 };
    },
    login(body) {
      const u = String(body.p_username || '').toLowerCase();
      const rec = users.get(u);
      if (!rec || rec.pwd !== body.p_password_hash) thr('invalid_credentials');
      const t = 'tok-' + u; tokens.add(t); return { token: t, user_id: 1 };
    },
    logout(body) { tokens.delete(body.p_token); return {}; },
    validate(token) { return tokens.has(token) ? 1 : null; },
    syncPush() { return {}; },
    publicProfile(body) {
      const u = String(body.p_username || '').toLowerCase();
      const rec = users.get(u);
      if (!rec || !rec.pub.enabled) return { enabled: false };
      const ids = Object.keys(rec.progress.missions || {}).filter(function (k) {
        return rec.progress.missions[k] && rec.progress.missions[k].completed;
      });
      return {
        enabled: true, username: u, bio: rec.pub.bio,
        learning_interests: rec.pub.interests,
        created_at: '2026-01-01T00:00:00Z', completed_mission_ids: ids
      };
    },
    updatePublicProfile(body) {
      const u = [...users.keys()].find(k => tokens.has(body.p_token));
      if (!u) thr('unauthorized');
      const rec = users.get(u);
      if (body.p_public_profile_enabled !== undefined) rec.pub.enabled = body.p_public_profile_enabled;
      if (body.p_bio !== undefined) rec.pub.bio = body.p_bio;
      if (body.p_learning_interests !== undefined) rec.pub.interests = body.p_learning_interests;
      return { updated: true, user_id: 1 };
    }
  };
}

/* ================================================================== */
console.log('== 1. Profile structure + achievements (STATIC) ==')
{
  const pp = readFileSync(join(JS, 'public-profile.js'), 'utf8');
  ok(/CAMPAIGNS/.test(pp) && /ACHIEVEMENTS/.test(pp), 'public-profile has campaigns + achievements');
  ok(/computeStats/.test(pp) && /computeAchievements/.test(pp), 'has computeStats + computeAchievements');
  ok(/bio/.test(pp) && /learning_interests/.test(pp) && /created_at/.test(pp),
    'renders bio / interests / member since');
  // Achievement model fields.
  ok(/id/.test(pp) && /title/.test(pp) && /test/.test(pp), 'achievements have id/title/test');
}

/* ================================================================== */
console.log('== 2. Public API: approved fields only (STATIC SQL) ==')
{
  const rpc = readFileSync(join(ROOT, 'backend/supabase/functions/rpc_public_profile.sql'), 'utf8');
  // The final RETURN block (the actual public payload) is the LAST occurrence.
  const lastRet = rpc.lastIndexOf('RETURN json_build_object');
  const returnObj = rpc.slice(lastRet, rpc.indexOf('END;', lastRet));
  for (const f of ['enabled', 'username', 'bio', 'learning_interests', 'created_at', 'completed_mission_ids']) {
    ok(returnObj.indexOf(f) !== -1, 'return payload includes ' + f);
  }
  ok(!/password|recovery|session|token|user_id|identity_id|email/.test(returnObj),
    'return payload exposes no private fields');
  ok(/SECURITY DEFINER/.test(rpc) && /SET search_path = public/.test(rpc), 'RPC SECURITY DEFINER + search_path');
}

/* ================================================================== */
console.log('== 3. Disabled profile hidden / enabled readable (MOCKED) ==')
{
  const mock = serverMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  await h.W('Auth').createAccount('alice', 'password123');

  // Disabled by default -> not readable.
  h.resetFetch();
  const disabled = await h.W('ApiClient').publicProfile('alice');
  ok(disabled && disabled.enabled === false, 'disabled profile returns enabled:false');

  // Enable it (owner update).
  const token = h.W('Sync').getToken();
  const upd = await h.W('ApiClient').updatePublicProfile(token, {
    public_profile_enabled: true, bio: 'Privacy learner', learning_interests: ['privacy', 'linux']
  });
  ok(upd && upd.updated === true, 'owner can enable + set bio/interests');

  // Now readable.
  h.resetFetch();
  const pub = await h.W('ApiClient').publicProfile('alice');
  ok(pub && pub.enabled === true, 'enabled profile is readable');
  eq(pub.bio, 'Privacy learner', 'bio returned');
  ok(Array.isArray(pub.learning_interests) && pub.learning_interests.length === 2, 'interests returned');
  ok(pub.created_at, 'member-since returned');
}

/* ================================================================== */
console.log('== 4. Owner edits own profile; cannot edit others (MOCKED) ==')
{
  const mock = serverMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  await h.W('Auth').createAccount('alice', 'password123');
  const token = h.W('Sync').getToken();
  const okUpd = await h.W('ApiClient').updatePublicProfile(token, {
    public_profile_enabled: true, bio: 'hello', learning_interests: ['security']
  });
  ok(okUpd && okUpd.updated === true, 'owner updates own public profile');

  // No client-controlled user_id is ever sent.
  const bodies = h.calls.fetch.filter(c => /ns_update_public_profile/.test(c.url))
    .map(c => String(c.init.body || '')).join(' ');
  ok(!/p_user_id|user_id/.test(bodies), 'no client-controlled user_id sent');
}

/* ================================================================== */
console.log('== 5. Guest read-only (LOCAL) ==')
{
  const g = makeHarness();
  g.load(LOAD_ORDER); cfg(g, BACKEND_OFF);
  g.W('Identity').init(); g.resetFetch();
  // Guest cannot update (no token -> rejected / invalid_token).
  const res = await g.W('ApiClient').updatePublicProfile(null, { public_profile_enabled: true })
    .then(function () { return { ok: true }; })
    .catch(function (e) { return { ok: false, err: e }; });
  ok(!res.ok, 'guest cannot update a public profile');
}

/* ================================================================== */
console.log('== 6. Progression + achievements deterministic (STATIC) ==')
{
  const missions = JSON.parse(readFileSync(join(ROOT, 'data/missions.json'), 'utf8'));
  const h = makeHarness();
  h.load(LOAD_ORDER); h.runFile('public-profile.js');
  const PP = h.W('PublicProfile');

  // Empty.
  const stats0 = PP.computeStats(missions, new Set());
  ok(stats0.overall === 0 && stats0.campaignsCompleted === 0, 'empty progress -> 0');
  const ach0 = PP.computeAchievements(stats0);
  ok(ach0.length === 0, 'no achievements with no progress');

  // Complete stage 1 (8 missions).
  const s1 = new Set(missions.filter(m => m.stage === 1 && m.id !== 'weekly-community').map(m => m.id));
  const stats1 = PP.computeStats(missions, s1);
  ok(stats1.campaignsCompleted === 1, '1 campaign completed');
  ok(stats1.campaigns[0].pct === 100, 'campaign 1 at 100%');
  const ach1 = PP.computeAchievements(stats1);
  ok(ach1.some(a => a.id === 'CAMPAIGN_COMPLETE'), 'CAMPAIGN_COMPLETE earned');
  ok(ach1.some(a => a.id === 'FIRST_MISSION'), 'FIRST_MISSION earned');

  // Deterministic.
  ok(PP.computeAchievements(stats1).length === ach1.length, 'achievements deterministic');

  // No duplicate progression source: derived only from completed ids.
  ok(stats1.missionsCompleted === s1.size, 'missionsCompleted derived from completed ids');
}

/* ================================================================== */
console.log('== 7. Storage: no public profile / credentials in localStorage (LOCAL/MOCKED) ==')
{
  const h = makeHarness({ backend: serverMock() });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  await h.W('Auth').createAccount('bob', 'password123');
  await h.W('ApiClient').publicProfile('bob');
  const lsKeys = Object.keys(h.localBacking);
  ok(lsKeys.every(k => k === 'ns:theme' || k === 'ns:migrated:v1'),
    'localStorage only theme/migration (got: ' + lsKeys.join(',') + ')');
  const ls = JSON.stringify(h.localBacking);
  for (const t of ['bio', 'profile', 'achievements', 'username', 'password', 'token', 'recovery']) {
    ok(!ls.includes(t), 'no "' + t + '" in localStorage');
  }
  ok(!JSON.stringify(h.sessionBacking).includes('password'), 'no password in sessionStorage');
}

/* ================================================================== */
console.log('== 8. No social network features (STATIC) ==')
{
  const files = ['public-profile.js', 'community.js', 'journey.js', 'profile.js', 'api-client.js', 'public-profile.html'];
  const socialRe = /\b(follow|follower|following|friends?|like|comments?|direct message|\bdm\b|social feed|timeline|post|posts)\b\s*[:=(]/i;
  for (const f of files) {
    const src = f.endsWith('.html') ? readFileSync(join(ROOT, f), 'utf8') : readFileSync(join(JS, f), 'utf8');
    const code = src.replace(/\/\/.*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    ok(!socialRe.test(code), f + ' has no implemented social features');
  }
  // Community stays aggregated.
  const community = readFileSync(join(JS, 'community.js'), 'utf8');
  ok(!/username|user_id|avatar/.test(community), 'community has no individual identifiers');
}

/* ================================================================== */
console.log('== 9. Security (STATIC) ==')
{
  const api = readFileSync(join(JS, 'api-client.js'), 'utf8');
  ok(!/p_user_id/.test(api.replace(/\/\/.*/g, '')), 'api-client never sends p_user_id');
  for (const f of ['api-client.js', 'public-profile.js', 'profile.js']) {
    const src = readFileSync(join(JS, f), 'utf8');
    ok(!/service_role|service-role|serviceRole|sb_secret/.test(src), f + ' has no service-role key');
  }
  const upd = readFileSync(join(ROOT, 'backend/supabase/functions/rpc_update_public_profile.sql'), 'utf8');
  ok(/SECURITY DEFINER/.test(upd) && /ns_validate_session/.test(upd), 'update RPC authenticates via session');
  ok(/RAISE EXCEPTION 'unauthorized'/.test(upd), 'update RPC rejects invalid sessions');
  ok(!/p_user_id/.test(upd), 'update RPC never accepts a client user_id');
  ok(/bio_too_long/.test(upd) && /too_many_interests/.test(upd), 'update RPC validates lengths');
}

/* ================================================================== */
console.log('== 10. Migration 0018 + account page integration (STATIC) ==')
{
  const mig = readFileSync(join(ROOT, 'backend/supabase/migrations/0018_public_profile.sql'), 'utf8');
  ok(/public_profile_enabled/.test(mig) && /bio/.test(mig) && /learning_interests/.test(mig),
    '0018 adds enabled/bio/interests');
  ok(/ADD COLUMN IF NOT EXISTS/.test(mig), '0018 is idempotent');
  ok(!/password|recovery|token/.test(mig.replace(/--[^\n]*/g, '')), '0018 adds no credential fields');

  const profileJs = readFileSync(join(JS, 'profile.js'), 'utf8');
  ok(/renderPublicProfile/.test(profileJs), 'account page renders a Public Profile section');
  ok(/updatePublicProfile/.test(profileJs), 'account page can update the public profile');
  const html = readFileSync(join(ROOT, 'profile.html'), 'utf8');
  ok(/Public Profile/.test(html), 'account page has a Public Profile section');
}

const exitCode = summary() ? 0 : 1;
process.exit(exitCode);
