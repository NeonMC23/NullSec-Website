/**
 * NullSec — Milestone 26 test suite (LOCAL / MOCKED / STATIC).
 * Real Supabase + browser remain BLOCKED (no project / no browser).
 *
 * Covers:
 *   1. CommunityActionService: valid action, invalid action, missing auth,
 *      offline, backend unavailable.
 *   2. ActivityService: success / unavailable / invalid states.
 *   3. Privacy: no personal identifiers, no country leakage, no tracking fields.
 *   4. Architecture: UI does not call ApiClient directly; UI uses
 *      CommunityActionService; CommunityActionService uses ActivityService.
 *   5. SQL static audit: SECURITY DEFINER, search_path, grants, RLS.
 */
import { makeHarness, LOAD_ORDER, ok, eq, summary } from './run-tests.mjs';

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

/* ================================================================== */
console.log('== 1. CommunityActionService: valid + invalid (LOCAL/MOCKED) ==');
{
  const h = makeHarness({ backend: { register: () => ({ token: 'tok-a', user_id: 1 }), validate: () => 1, recordActivity: () => ({ ok: true }) } });
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  h.W('RecoveryKey').ensure();
  h.W('Identity').init();
  await h.W('Auth').createAccount('tester', 'password123');
  await h.W('Session').forceRecheck();

  const cas = h.W('CommunityActionService');
  const res = await cas.record('contribution_done');
  ok(res.ok === true && res.state === 'SUCCESS', 'valid community action recorded (SUCCESS)');
  const calls = h.calls.fetch.filter(c => /ns_record_activity/.test(c.url));
  ok(calls.length > 0, 'called ns_record_activity via ActivityService/ApiClient');
  // Payload is anonymous (type only).
  const body = String(calls[0].init.body || '');
  ok(/community_action/.test(body), 'payload carries community_action type');
  ok(!/user_id|identity_id|username|country_code|ip|device_id/.test(body),
    'no personal identifiers/country/tracking in payload');

  // Invalid action → rejected without network.
  h.resetFetch();
  const bad = await cas.record('not_a_real_action');
  ok(bad.ok === false && bad.state === 'INVALID', 'invalid action → INVALID');
  eq(h.calls.fetch.filter(c => /rest\/v1/.test(c.url)).length, 0, 'no network for invalid action');
}

/* ================================================================== */
console.log('== 2. CommunityActionService: missing auth + offline (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  const cas = h.W('CommunityActionService');
  const res = await cas.record('join_initiative');
  ok(res.ok === false && res.state === 'NOT_AUTHENTICATED', 'missing auth → NOT_AUTHENTICATED');

  const h2 = makeHarness();
  h2.load(LOAD_ORDER);
  cfg(h2, BACKEND_OFF);
  h2.resetFetch();
  const res2 = await h2.W('CommunityActionService').record('contribution_done');
  ok(res2.ok === false && res2.state === 'OFFLINE', 'offline → OFFLINE, no fabricated success');
  eq(h2.calls.fetch.filter(c => /rest\/v1/.test(c.url)).length, 0, 'zero backend calls offline');
}

/* ================================================================== */
console.log('== 3. ActivityService states (LOCAL/MOCKED) ==');
{
  const h = makeHarness({ backend: { register: () => ({ token: 'tok-a', user_id: 1 }), validate: () => 1, recordActivity: () => ({ ok: true }) } });
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  h.W('RecoveryKey').ensure();
  h.W('Identity').init();
  await h.W('Auth').createAccount('tester', 'password123');
  await h.W('Session').forceRecheck();
  const s = h.W('ActivityService');
  const okRes = await s.record('mission_completed', 1);
  eq(okRes.state, 'SUCCESS', 'success state SUCCESS');
  const badType = await s.record('nope', 1);
  eq(badType.state, 'INVALID', 'invalid type → INVALID');
  const badAmt = await s.record('tool_used', 9999);
  eq(badAmt.state, 'INVALID', 'invalid amount → INVALID');

  // Backend failure → UNAVAILABLE (no fabricated success).
  const h3 = makeHarness({ backend: { register: () => ({ token: 'tok-a', user_id: 1 }), validate: () => 1, recordActivity: () => { throw new Error('boom'); } } });
  h3.load(LOAD_ORDER);
  cfg(h3, BACKEND_ON);
  h3.W('RecoveryKey').ensure();
  h3.W('Identity').init();
  await h3.W('Auth').createAccount('tester', 'password123');
  await h3.W('Session').forceRecheck();
  const unav = await h3.W('ActivityService').record('tool_used', 1);
  eq(unav.state, 'UNAVAILABLE', 'backend failure → UNAVAILABLE');
}

/* ================================================================== */
console.log('== 4. Privacy: no leakage (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_OFF);
  const cm = h.W('CountryMetrics');
  const n = cm.normalize({ countries: { FR: { participants: 1, user_id: 'u', identity_id: 'i', username: 'x', country_code: 'FR', ip: '1.2.3.4', device_id: 'd' } } });
  const keys = Object.keys(n.countries.FR).join(',');
  const allowed = ['participants', 'missionActivity', 'toolActivity', 'communityActivity', 'propagation', 'totalActivity', 'availability', 'lastUpdate'];
  ok(keys.split(',').every(k => allowed.indexOf(k) !== -1),
    'no personal/country/tracking fields in normalized metrics');
}

/* ================================================================== */
console.log('== 5. Architecture: UI→CommunityActionService→ActivityService (STATIC) ==');
{
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = process.cwd();

  // CommunityActionService must call ActivityService, never ApiClient directly.
  const cas = readFileSync(join(root, 'assets/js/community-action-service.js'), 'utf8');
  const casCode = cas.split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  ok(/ActivityService\.record/.test(casCode), 'CommunityActionService uses ActivityService');
  ok(!/ApiClient\./.test(casCode), 'CommunityActionService does not call ApiClient directly');

  // community.js (UI) must use CommunityActionService for activity, and must
  // NOT call recordActivity/fetch directly. (isBackendAvailable() for read-only
  // availability is allowed.)
  const community = readFileSync(join(root, 'assets/js/community.js'), 'utf8');
  ok(/CommunityActionService\.record/.test(community), 'community.js UI uses CommunityActionService');
  ok(!/ApiClient\.recordActivity/.test(community), 'community.js does not call recordActivity directly');
  ok(!/\bfetch\s*\(/.test(community), 'community.js has no direct fetch');

  // journey/tools use ActivityService (from M25), not ApiClient.
  for (const f of ['journey.js', 'tools.js']) {
    const src = readFileSync(join(root, 'assets/js', f), 'utf8');
    const code = src.split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    ok(!/ApiClient\./.test(code), f + ' does not call ApiClient directly');
  }
}

/* ================================================================== */
console.log('== 6. SQL static audit (STATIC) ==');
{
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = process.cwd();
  const rec = readFileSync(join(root, 'backend/supabase/functions/rpc_activity_event.sql'), 'utf8');
  const m15 = readFileSync(join(root, 'backend/supabase/migrations/0015_community_action_support.sql'), 'utf8');

  ok(/SECURITY DEFINER/.test(rec) && /SET search_path = public/.test(rec),
    'ns_record_activity SECURITY DEFINER + search_path');
  ok(/community_action/.test(rec), 'ns_record_activity supports community_action');
  ok(!/p_user_id/.test(rec), 'no client identity');
  ok(/idx_activity_events_type_created/.test(m15), '0015 adds type/created index');
  ok(/ENABLE ROW LEVEL SECURITY/.test(m15) && /REVOKE SELECT ON public\.v_country_metrics/.test(m15),
    '0015 re-affirms RLS');
}

/* ------------------------------------------------------------------ */
const exitCode = summary() ? 0 : 1;
process.exit(exitCode);
