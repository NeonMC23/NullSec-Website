/**
 * NullSec — Milestone 27 test suite (LOCAL / MOCKED / STATIC).
 * Real Supabase + browser remain BLOCKED (no project / no browser).
 *
 * Covers:
 *   1. Metrics: valid aggregation, null handling, zero handling, invalid
 *      numbers, malformed payload, communityActivity distinct from propagation.
 *   2. Activity: mission_completed / tool_used / community_action valid,
 *      invalid activity, offline, backend unavailable.
 *   3. Privacy: no identity fields, no country leakage, no tracking metadata.
 *   4. Architecture: UI does not call ApiClient directly; services isolated;
 *      CountryMetrics is the only dashboard source.
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
console.log('== 1. Metrics: aggregation + null/zero + communityActivity (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_OFF);
  const cm = h.W('CountryMetrics');

  // Valid aggregation with distinct communityActivity and propagation.
  const n = cm.normalize({ countries: { FR: { missionActivity: 100, toolActivity: 50, communityActivity: 20, propagation: 20, totalActivity: 170 } } });
  eq(n.countries.FR.missionActivity, 100, 'missionActivity');
  eq(n.countries.FR.toolActivity, 50, 'toolActivity');
  eq(n.countries.FR.communityActivity, 20, 'communityActivity explicit');
  eq(n.countries.FR.propagation, 20, 'propagation preserved');
  eq(n.countries.FR.totalActivity, 170, 'totalActivity');

  // communityActivity falls back to propagation when absent.
  const fb = cm.normalize({ countries: { DE: { missionActivity: 1, propagation: 7 } } });
  eq(fb.countries.DE.communityActivity, 7, 'communityActivity falls back to propagation');

  // null (unavailable) vs 0 (measured empty).
  const mix = cm.normalize({ countries: { FR: { missionActivity: null, toolActivity: 0, communityActivity: null, totalActivity: 0 } } });
  ok(mix.countries.FR.missionActivity === null, 'null preserved (unavailable)');
  eq(mix.countries.FR.toolActivity, 0, '0 preserved (measured empty)');
  ok(mix.countries.FR.availability.communityActivity === false, 'communityActivity unavailable');
  ok(mix.countries.FR.availability.toolActivity === true, 'toolActivity available');

  // Invalid numbers → 0; negative/NaN/Infinity/oversized.
  const bad = cm.normalize({ countries: { FR: { missionActivity: NaN, toolActivity: -5, communityActivity: Infinity, totalActivity: 1e12 } } });
  eq(bad.countries.FR.missionActivity, 0, 'NaN → 0');
  eq(bad.countries.FR.toolActivity, 0, 'negative → 0');
  eq(bad.countries.FR.communityActivity, 0, 'Infinity → 0');
  eq(bad.countries.FR.totalActivity, 0, 'oversized → 0');

  // Malformed payload rejected.
  ok((function () { try { cm.normalize(null); return false; } catch (e) { return true; } })(), 'null payload rejected');
  ok((function () { try { cm.normalize(42); return false; } catch (e) { return true; } })(), 'scalar payload rejected');

  // Unknown fields ignored (no leakage).
  const unknown = cm.normalize({ countries: { FR: { missionActivity: 1, user_id: 'u', weird_metric: 99, country_code: 'FR' } } });
  const keys = Object.keys(unknown.countries.FR).join(',');
  const allowed = ['participants', 'missionActivity', 'toolActivity', 'communityActivity', 'propagation', 'totalActivity', 'availability', 'lastUpdate'];
  ok(keys.split(',').every(k => allowed.indexOf(k) !== -1), 'only aggregate keys exposed');
}

/* ================================================================== */
console.log('== 2. Activity: all types + validation + offline (LOCAL/MOCKED) ==');
{
  const h = makeHarness({ backend: { register: () => ({ token: 'tok-a', user_id: 1 }), validate: () => 1, recordActivity: () => ({ ok: true }) } });
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  h.W('RecoveryKey').ensure();
  h.W('Identity').init();
  await h.W('Auth').createAccount('tester', 'password123');
  await h.W('Session').forceRecheck();
  const svc = h.W('ActivityService');

  for (const type of ['mission_completed', 'tool_used', 'community_action']) {
    const res = await svc.record(type, 1);
    ok(res.ok === true && res.state === 'SUCCESS', type + ' recorded (SUCCESS)');
  }

  // Invalid activity rejected.
  const bad = await svc.record('not_a_type', 1);
  ok(bad.ok === false && bad.state === 'INVALID', 'invalid activity → INVALID');

  // Offline → OFFLINE, no fabricated success.
  const h2 = makeHarness();
  h2.load(LOAD_ORDER);
  cfg(h2, BACKEND_OFF);
  h2.resetFetch();
  const off = await h2.W('ActivityService').record('tool_used', 1);
  ok(off.ok === false && off.state === 'OFFLINE', 'offline → OFFLINE');
  eq(h2.calls.fetch.filter(c => /rest\/v1/.test(c.url)).length, 0, 'zero backend calls offline');

  // Backend unavailable → UNAVAILABLE.
  const h3 = makeHarness({ backend: { register: () => ({ token: 'tok-a', user_id: 1 }), validate: () => 1, recordActivity: () => { throw new Error('boom'); } } });
  h3.load(LOAD_ORDER);
  cfg(h3, BACKEND_ON);
  h3.W('RecoveryKey').ensure();
  h3.W('Identity').init();
  await h3.W('Auth').createAccount('tester', 'password123');
  await h3.W('Session').forceRecheck();
  const unav = await h3.W('ActivityService').record('mission_completed', 1);
  ok(unav.ok === false && unav.state === 'UNAVAILABLE', 'backend unavailable → UNAVAILABLE');
}

/* ================================================================== */
console.log('== 3. Privacy: no identity/country/tracking (LOCAL/MOCKED) ==');
{
  const h = makeHarness({ backend: { register: () => ({ token: 'tok-a', user_id: 1 }), validate: () => 1, recordActivity: () => ({ ok: true }) } });
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  h.W('RecoveryKey').ensure();
  h.W('Identity').init();
  await h.W('Auth').createAccount('tester', 'password123');
  await h.W('Session').forceRecheck();
  await h.W('ActivityService').record('community_action', 1);
  const call = h.calls.fetch.filter(c => /ns_record_activity/.test(c.url)).pop();
  const body = String(call.init.body || '');
  ok(!/user_id|identity_id|username|email|country_code|"ip"|gps|device_id|analytics/.test(body),
    'no identity/country/tracking/analytics in activity payload');
  ok(/p_activity_type/.test(body) && /p_amount/.test(body), 'payload carries only type + amount + token');
}

/* ================================================================== */
console.log('== 4. Architecture: isolation + single dashboard source (STATIC) ==');
{
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = process.cwd();

  // UI modules do not call ApiClient for activity.
  for (const f of ['journey.js', 'tools.js', 'community.js']) {
    const src = readFileSync(join(root, 'assets/js', f), 'utf8');
    ok(!/ApiClient\.recordActivity/.test(src), f + ' does not call recordActivity directly');
    ok(!/\bfetch\s*\(/.test(src), f + ' has no direct fetch');
  }
  // Services are isolated: activity-service calls ApiClient; community-action-service
  // calls ActivityService, never ApiClient.
  const as = readFileSync(join(root, 'assets/js/activity-service.js'), 'utf8');
  ok(/ApiClient\.recordActivity/.test(as), 'activity-service calls ApiClient.recordActivity');
  const cas = readFileSync(join(root, 'assets/js/community-action-service.js'), 'utf8');
  ok(/ActivityService\.record/.test(cas), 'community-action-service uses ActivityService');
  ok(!/ApiClient\./.test(cas), 'community-action-service does not call ApiClient directly');

  // CountryMetrics is the only dashboard source (community.js reads via CountryMetrics).
  const community = readFileSync(join(root, 'assets/js/community.js'), 'utf8');
  ok(/CountryMetrics\./.test(community), 'community.js uses CountryMetrics as source');
}

/* ================================================================== */
console.log('== 5. SQL static audit (STATIC) ==');
{
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = process.cwd();
  const rec = readFileSync(join(root, 'backend/supabase/functions/rpc_activity_event.sql'), 'utf8');
  const m16 = readFileSync(join(root, 'backend/supabase/migrations/0016_activity_metrics_refinement.sql'), 'utf8');
  const rpc = readFileSync(join(root, 'backend/supabase/functions/rpc_country_metrics.sql'), 'utf8');

  ok(/SECURITY DEFINER/.test(rec) && /SET search_path = public/.test(rec), 'ns_record_activity SECURITY DEFINER + search_path');
  ok(/community_action/.test(rec), 'ns_record_activity supports community_action');
  ok(!/p_user_id/.test(rec), 'no client identity');
  ok(/community_activity/.test(m16), '0016 adds community_activity aggregate');
  ok(/REVOKE SELECT ON public\.v_country_metrics/.test(m16), '0016 keeps view non-public');
  ok(/communityActivity/.test(rpc), 'ns_country_metrics emits communityActivity');
  // Column-order fix: community_activity is appended as the FINAL column, AFTER
  // total_activity (CREATE OR REPLACE VIEW cannot insert a column in the middle).
  ok(/total_activity[\s\S]*community_activity/.test(m16),
    'community_activity comes after total_activity (appended at the end)');
}

/* ------------------------------------------------------------------ */
const exitCode = summary() ? 0 : 1;
process.exit(exitCode);
