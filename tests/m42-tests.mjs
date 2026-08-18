/**
 * NullSec — Milestone 42 (Pre-Deployment Production Readiness Audit & Final Hardening).
 * ------------------------------------------------------------------
 * Category: LOCAL / MOCKED / STATIC (no real Supabase, no browser).
 *
 * Covers the M42 hardening:
 *   - RPC privilege completeness (incl. internal helpers revoked).
 *   - Deployment order / secret handling / migration sequence.
 *   - Storage inventory (localStorage/sessionStorage contract).
 *   - Failure simulations (auth, session, progression, public profile).
 *   - Security (no p_user_id, no service-role, no private leak, XSS-safety).
 *   - Accessibility structural guarantees (modal, semantic, focus).
 *   - Responsive / long-content wrapping.
 *   - Navigation completeness, legacy guards, content integrity.
 */
import { makeHarness, LOAD_ORDER, ok, eq, summary } from './run-tests.mjs';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
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
console.log('== 1. RPC privilege completeness (STATIC SQL) ==')
{
  const priv = readFileSync(join(ROOT, 'backend/supabase/functions/rpc_privileges.sql'), 'utf8');
  // Every public RPC must be revoked from PUBLIC and granted to anon+authenticated.
  const publicRPCs = ['ns_register', 'ns_login', 'ns_logout', 'ns_validate_session',
    'ns_recover', 'ns_change_password', 'ns_reset_progress', 'ns_public_profile',
    'ns_update_public_profile', 'ns_sync_pull', 'ns_sync_push', 'ns_activity', 'ns_metrics',
    'ns_country_metrics', 'ns_tool_activity', 'ns_update_profile', 'ns_record_activity'];
  for (const r of publicRPCs) {
    ok(priv.indexOf('REVOKE EXECUTE ON FUNCTION public.' + r) !== -1,
      r + ' revoked from PUBLIC');
    ok(priv.indexOf('GRANT EXECUTE ON FUNCTION public.' + r) !== -1,
      r + ' granted to anon, authenticated');
  }
  // Internal helpers revoked from PUBLIC/anon/authenticated (never exposed).
  ok(/ns_valid_transport_hash\(text\) FROM PUBLIC, anon, authenticated/.test(priv),
    'ns_valid_transport_hash is internal-only');
  ok(/ns_valid_username\(text\) FROM PUBLIC, anon, authenticated/.test(priv),
    'ns_valid_username is internal-only');
  ok(/ns_create_session\(bigint\) FROM anon, authenticated/.test(priv),
    'ns_create_session is internal-only');
}

/* ================================================================== */
console.log('== 2. Deployment readiness (STATIC shell) ==')
{
  const deploy = readFileSync(join(ROOT, 'backend/supabase/scripts/deploy.sh'), 'utf8');
  const apply = readFileSync(join(ROOT, 'backend/supabase/scripts/apply-sql.sh'), 'utf8');
  ok(/set -E?euo pipefail/.test(deploy) && /set -E?euo pipefail/.test(apply), 'scripts use set -E?euo pipefail');
  ok(/SUPABASE_ACCESS_TOKEN/.test(deploy) && /SUPABASE_PROJECT_REF/.test(deploy), 'deploy requires secrets');
  ok(/rpc_privileges\.sql/.test(deploy), 'deploy applies privilege hardening');
  ok(!/=eyJ|service_role|sbad|yoursupabase/.test(deploy + apply), 'no literal secrets in scripts');
  ok(!/echo.*ACCESS_TOKEN|printf.*ACCESS_TOKEN/.test(apply), 'apply-sql never echoes the token');
  // Migrations sequence is complete and ordered.
  const migs = readdirSync(join(ROOT, 'backend/supabase/migrations')).filter(f => f.endsWith('.sql')).sort();
  const nums = migs.map(f => parseInt(f.slice(0, 4), 10));
  ok(nums.join(',') === nums.slice().sort((a, b) => a - b).join(','), 'migrations ordered');
  ok(migs.length === 19, '19 migrations present');
  ok(nums[0] === 1 && nums[nums.length - 1] === 19, 'migrations 0001..0019');
  // No migration rewrites historical function privileges.
  const functionMig = migs.filter(f => /EXECUTE ON FUNCTION|CREATE OR REPLACE FUNCTION/.test(readFileSync(join(ROOT, 'backend/supabase/migrations', f), 'utf8').replace(/--.*/g, '')));
  ok(functionMig.length === 0, 'no migration contains active function-privilege/definition SQL');
}

/* ================================================================== */
console.log('== 3. Storage inventory (LOCAL/MOCKED) ==')
{
  const h = makeHarness({ backend: serverMock() });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init(); h.W('Progress').init();
  await h.W('Auth').createAccount('storeuser', 'password123');
  h.W('Progress').complete('enable-2fa');
  const ls = Object.keys(h.localBacking);
  ok(ls.every(k => k === 'ns:theme' || k === 'ns:migrated:v1'),
    'localStorage only theme/migration (got: ' + ls.join(',') + ')');
  const ss = Object.keys(h.sessionBacking);
  ok(ss.every(k => k === 'ns:session:auth' || k === 'ns:session:recovery'),
    'sessionStorage only approved keys (got: ' + ss.join(',') + ')');
  // localStorage must contain NO account/progression/credential.
  const lsJson = JSON.stringify(h.localBacking);
  ok(!/password|token|user_id|progress|profile|username/.test(lsJson),
    'localStorage has no account/progression/credential');
  // sessionStorage is approved for the temporary session (token + username);
  // it must NEVER contain a password or recovery key VALUE.
  const ssJson = JSON.stringify(h.sessionBacking);
  ok(!/password/.test(ssJson), 'no password in sessionStorage');
  // The recovery key lives ONLY in the approved ns:session:recovery slot.
  if (h.sessionBacking['ns:session:recovery'] !== undefined) {
    ok(/NSK1-/.test(h.sessionBacking['ns:session:recovery']), 'recovery key in approved session slot only');
  }
}

/* ================================================================== */
console.log('== 4. Failure simulation: auth + session (MOCKED) ==')
{
  const mock = serverMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  // Unknown username / wrong password -> same generic error (no enumeration).
  h.resetFetch();
  const u = await h.W('Auth').signIn('nobody', 'password123');
  const w = await h.W('Auth').signIn('x', 'wrong');
  ok(!u.ok && !w.ok && u.reason === w.reason, 'generic error (no username enumeration)');
  // Invalid session -> guest.
  h.sessionBacking['ns:session:auth'] = JSON.stringify({ token: 'bad-token', expires_at: null });
  await h.W('Session').forceRecheck();
  ok(!h.W('Auth').isAuthenticated(), 'invalid session -> guest');
  // Missing session -> guest.
  h.sessionBacking['ns:session:auth'] = null;
  delete h.sessionBacking['ns:session:auth'];
  await h.W('Session').forceRecheck();
  ok(!h.W('Auth').isAuthenticated(), 'missing session -> guest');
}

/* ================================================================== */
console.log('== 5. Failure simulation: progression (MOCKED) ==')
{
  // Malformed progress must not crash isCompleted / get.
  const mock = serverMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init(); h.W('Progress').init();
  await h.W('Auth').createAccount('prog', 'password123');
  h.W('Progress').init();
  // isCompleted on unknown/missing mission id is safe.
  ok(h.W('Progress').isCompleted('does-not-exist') === false, 'unknown mission id safe');
  // Empty progression renders (overall 0, no crash).
  const missions = JSON.parse(readFileSync(join(ROOT, 'data/missions.json'), 'utf8'));
  const pp = makeHarness(); pp.load(LOAD_ORDER); pp.runFile('public-profile.js');
  const stats0 = pp.W('PublicProfile').computeStats(missions, new Set());
  ok(stats0.overall === 0 && stats0.campaignsCompleted === 0, 'empty progression safe');
  // Unknown completed ids in public profile are safely ignored.
  const statsBad = pp.W('PublicProfile').computeStats(missions, new Set(['ghost-mission', 'enable-2fa']));
  ok(statsBad.missionsCompleted === 1, 'unknown completed ids ignored, known counted');
}

/* ================================================================== */
console.log('== 6. Public profile privacy states (MOCKED) ==')
{
  const mock = serverMock();
  const h = makeHarness({ backend: mock });
  h.load(LOAD_ORDER); cfg(h, BACKEND_ON);
  h.W('Identity').init();
  await h.W('Auth').createAccount('priv', 'password123');
  // Nonexistent vs disabled both -> enabled:false (non-enumerating).
  const none = await h.W('ApiClient').publicProfile('ghost');
  const disabled = await h.W('ApiClient').publicProfile('priv');
  ok(none && none.enabled === false, 'nonexistent -> enabled:false');
  ok(disabled && disabled.enabled === false, 'disabled -> enabled:false');
  ok(JSON.stringify(none) === JSON.stringify(disabled), 'nonexistent and disabled are indistinguishable');
  // Enabled populated.
  const token = h.W('Sync').getToken();
  await h.W('ApiClient').updatePublicProfile(token, { public_profile_enabled: true, bio: 'hi', learning_interests: ['privacy'] });
  const pub = await h.W('ApiClient').publicProfile('priv');
  ok(pub && pub.enabled === true && pub.bio === 'hi', 'enabled profile populated');
  ok(!/password|recovery|token|user_id|email/.test(JSON.stringify(pub)), 'no private fields');
  // Case-insensitive lookup.
  const cap = await h.W('ApiClient').publicProfile('PRIV');
  ok(cap && cap.username === 'priv', 'case-insensitive username lookup');
}

/* ================================================================== */
console.log('== 7. Security: no p_user_id / service-role / XSS (STATIC) ==')
{
  for (const f of ['api-client.js', 'journey.js', 'profile.js', 'public-profile.js', 'auth-service.js']) {
    const src = readFileSync(join(JS, f), 'utf8');
    ok(!/service_role|service-role|serviceRole|sb_secret/.test(src), f + ' has no service-role');
  }
  const api = readFileSync(join(JS, 'api-client.js'), 'utf8');
  ok(!/p_user_id/.test(api.replace(/\/\/.*/g, '')), 'api-client never sends p_user_id');
  // SQL: SECURITY DEFINER + search_path on all data RPCs.
  for (const f of ['rpc_auth.sql', 'rpc_sync.sql', 'rpc_activity.sql', 'rpc_profile.sql',
    'rpc_public_profile.sql', 'rpc_update_public_profile.sql', 'rpc_country_metrics.sql',
    'rpc_tool_activity.sql', 'rpc_activity_event.sql']) {
    const sql = readFileSync(join(ROOT, 'backend/supabase/functions', f), 'utf8');
    ok(/SECURITY DEFINER/.test(sql), f + ' uses SECURITY DEFINER');
    ok(/SET search_path = public/.test(sql), f + ' pins search_path');
  }
  // User-controlled bio/interests/username rendered as text, not HTML.
  const pp = readFileSync(join(JS, 'public-profile.js'), 'utf8');
  ok(/text: profile\.bio/.test(pp) && /text: '@' \+ username/.test(pp), 'bio/username rendered as text');
  ok(!/\.innerHTML\s*=/.test(pp), 'public-profile does not inject via innerHTML');
}

/* ================================================================== */
console.log('== 8. Accessibility structural guarantees (STATIC) ==')
{
  const modal = readFileSync(join(JS, 'modal.js'), 'utf8');
  ok(/role', 'dialog'/.test(modal) && /aria-modal/.test(modal), 'modal has ARIA dialog semantics');
  ok(/closeBtn\.focus\(\)/.test(modal), 'modal focuses on open');
  ok(/Escape/.test(modal), 'modal handles Escape');
  const pages = ['index', 'journey', 'profile', 'community', 'tools', 'articles', 'about', 'contribute', 'public-profile'];
  for (const p of pages) {
    const html = readFileSync(join(ROOT, p + '.html'), 'utf8');
    ok(/<nav class="navbar"/.test(html), p + '.html has a semantic nav');
    ok(/href="about\.html"/.test(html), p + '.html links to About');
  }
}

/* ================================================================== */
console.log('== 9. Responsive / long-content wrapping (STATIC CSS) ==')
{
  const pages = readFileSync(join(ROOT, 'assets/css/pages.css'), 'utf8');
  const comp = readFileSync(join(ROOT, 'assets/css/components.css'), 'utf8');
  const all = pages + comp;
  ok(/overflow-wrap: break-word/.test(all) && /word-break: break-word/.test(all),
    'long user content wraps safely');
  ok(/\.modal \{[\s\S]*max-width: 640px[\s\S]*max-height: 85vh[\s\S]*overflow-y: auto/.test(comp),
    'modal constrains size + scrolls');
  ok(/grid-template-columns: repeat\(auto-fit, minmax\(240px, 1fr\)\)/.test(comp),
    'campaign grid is responsive (auto-fit)');
}

/* ================================================================== */
console.log('== 10. Navigation completeness + no dead links (STATIC) ==')
{
  const pages = ['index', 'journey', 'profile', 'public-profile', 'community', 'tools', 'articles', 'about', 'contribute'];
  for (const p of pages) {
    const html = readFileSync(join(ROOT, p + '.html'), 'utf8');
    const hrefs = (html.match(/href="([^"]*\.html)"/g) || [])
      .map(h => h.replace('href="', '').replace('"', ''))
      .filter(h => !h.startsWith('http'));
    for (const h of hrefs) {
      ok(existsSync(join(ROOT, h.split('?')[0].replace('./', ''))),
        p + '.html links to existing file: ' + h);
    }
  }
}

/* ================================================================== */
console.log('== 11. Content integrity (STATIC data) ==')
{
  const missions = JSON.parse(readFileSync(join(ROOT, 'data/missions.json'), 'utf8'));
  const articles = JSON.parse(readFileSync(join(ROOT, 'data/articles.json'), 'utf8'));
  ok(missions.length >= 25 && articles.length >= 5, 'substantive content sets');
  const ids = new Set(), titles = new Set();
  for (const m of missions) {
    ok(m.stage >= 0 && m.stage <= 4, 'valid stage: ' + m.id);
    ok(m.guide && String(m.guide).length > 40, 'guide present: ' + m.id);
    ok(!ids.has(m.id), 'unique id: ' + m.id); ids.add(m.id);
    ok(!titles.has(m.title.toLowerCase()), 'unique title: ' + m.title); titles.add(m.title.toLowerCase());
    // Educational guides legitimately discuss "password"; flag only actual secret-looking values.
    ok(!/[A-Za-z0-9+/]{40,}={0,2}|eyJ[A-Za-z0-9_-]+\./i.test(String(m.guide)), 'no embedded credential-looking values in guide: ' + m.id);
  }
  // No embedded progression state in content.
  ok(!('completed' in missions[0]) && !('completed_mission_ids' in missions[0]),
    'missions.json contains no user progression state');
}

/* ================================================================== */
console.log('== 12. Legacy / social / architecture drift guards (STATIC) ==')
{
  const socialRe = /\b(follow|follower|following|friends?|like|comments?|direct message|\bdm\b|social feed|timeline|leaderboard|user directory)\b\s*[:=(]/i;
  for (const f of ['journey.js', 'profile.js', 'public-profile.js', 'community.js']) {
    const src = readFileSync(join(JS, f), 'utf8');
    const code = src.replace(/\/\/.*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    ok(!socialRe.test(code), f + ' has no implemented social features');
  }
  const journeyHtml = readFileSync(join(ROOT, 'journey.html'), 'utf8');
  const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
  ok(!/Follow the stages below|4 progressive stages/.test(journeyHtml + indexHtml),
    'no user-facing "stages" terminology');
  ok(!/saved locally|local progress|anonymous progress|local profile/.test(
    journeyHtml + readFileSync(join(JS, 'journey.js'), 'utf8')), 'no local-progression wording');
}

/* ================================================================== */
console.log('== 13. Guest/authenticated boundaries (LOCAL/MOCKED) ==')
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

const exitCode = summary() ? 0 : 1;
process.exit(exitCode);
