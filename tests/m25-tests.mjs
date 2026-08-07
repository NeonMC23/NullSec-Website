/**
 * NullSec — Milestone 25 test suite (LOCAL / MOCKED / STATIC).
 * Real Supabase + browser remain BLOCKED (no project / no browser).
 *
 * Covers:
 *   1. Activity service: valid activity, invalid type, invalid amount,
 *      missing authentication, backend unavailable, offline.
 *   2. Privacy: no user_id / country_code / identity in activity payloads.
 *   3. Architecture: UI does not call ApiClient directly for activity; it goes
 *      through ActivityService (services/repositories only).
 *   4. Backend static audit: SECURITY DEFINER, search_path, grants, RLS.
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
console.log('== 1. Activity service: valid + validation (LOCAL/MOCKED) ==');
{
  // Valid authenticated + backend available → record via ApiClient.
  const h = makeHarness({ backend: { register: () => ({ token: 'tok-a', user_id: 1 }), validate: () => 1, recordActivity: () => ({ ok: true }) } });
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  h.W('RecoveryKey').ensure();
  h.W('Identity').init();
  await h.W('Auth').register();
  await h.W('Session').forceRecheck();

  const svc = h.W('ActivityService');
  const res = await svc.record('mission_completed', 1);
  ok(res.ok === true, 'valid activity recorded');
  const calls = h.calls.fetch.filter(c => /ns_record_activity/.test(c.url));
  ok(calls.length > 0, 'called ns_record_activity via ApiClient');

  // Invalid type → rejected before network.
  h.resetFetch();
  const bad = await svc.record('not_a_type', 1);
  ok(bad.ok === false && bad.reason === 'invalid_activity_type', 'invalid type rejected');
  eq(h.calls.fetch.filter(c => /ns_record_activity/.test(c.url)).length, 0, 'no network for invalid type');

  // Invalid amount → rejected.
  const badAmt = await svc.record('tool_used', 0);
  ok(badAmt.ok === false && badAmt.reason === 'invalid_amount', 'invalid amount rejected');
  const badAmt2 = await svc.record('tool_used', 5000);
  ok(badAmt2.ok === false && badAmt2.reason === 'invalid_amount', 'oversized amount rejected');
}

/* ================================================================== */
console.log('== 2. Activity service: missing auth + offline (LOCAL) ==');
{
  // Not authenticated → rejected.
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  h.resetFetch();
  const res = await h.W('ActivityService').record('mission_completed', 1);
  ok(res.ok === false && res.reason === 'not_authenticated', 'missing auth rejected');
  eq(h.calls.fetch.filter(c => /rest\/v1/.test(c.url)).length, 0, 'no network when not authenticated');

  // Offline → rejected, no fabricated success.
  const h2 = makeHarness();
  h2.load(LOAD_ORDER);
  cfg(h2, BACKEND_OFF);
  h2.resetFetch();
  const res2 = await h2.W('ActivityService').record('mission_completed', 1);
  ok(res2.ok === false && res2.reason === 'offline', 'offline → rejected, no fabricated success');
  eq(h2.calls.fetch.filter(c => /rest\/v1/.test(c.url)).length, 0, 'zero backend calls offline');
}

/* ================================================================== */
console.log('== 3. Activity service: backend unavailable (MOCKED) ==');
{
  // Backend available + authenticated, but the activity RPC fails.
  const h = makeHarness({ backend: { register: () => ({ token: 'tok-a', user_id: 1 }), validate: () => 1, recordActivity: () => { throw new Error('server_error'); } } });
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  h.W('RecoveryKey').ensure();
  h.W('Identity').init();
  await h.W('Auth').register();
  await h.W('Session').forceRecheck();
  const res = await h.W('ActivityService').record('tool_used', 1);
  ok(res.ok === false && res.reason === 'backend_unavailable', 'backend failure → unavailable, no fabricated success');
}

/* ================================================================== */
console.log('== 4. Privacy: no user_id/country_code/identity in payload (MOCKED) ==');
{
  const h = makeHarness({ backend: { register: () => ({ token: 'tok-a', user_id: 1 }), validate: () => 1, recordActivity: () => ({ ok: true }) } });
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  h.W('RecoveryKey').ensure();
  h.W('Identity').init();
  await h.W('Auth').register();
  await h.W('Session').forceRecheck();
  await h.W('ActivityService').record('community_action', 1);
  const call = h.calls.fetch.filter(c => /ns_record_activity/.test(c.url)).pop();
  const body = String(call.init.body || '');
  ok(!/user_id|identity_id|username|country_code|"ip"|device_id/.test(body),
    'no user_id/identity/country/IP/device in activity payload');
  ok(/mission_completed|tool_used|community_action/.test(body) || /p_activity_type/.test(body),
    'activity payload carries only type + amount');
}

/* ================================================================== */
console.log('== 5. Architecture: UI does not call ApiClient directly (STATIC) ==');
{
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = process.cwd();
  // UI/page modules (journey, tools) must NOT call ApiClient directly for
  // ACTIVITY; they go through ActivityService. (isBackendAvailable() for
  // read-only availability is allowed and not an activity call.)
  for (const f of ['journey.js', 'tools.js']) {
    const src = readFileSync(join(root, 'assets/js', f), 'utf8');
    const code = src.split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    ok(!/ApiClient\./.test(code), f + ' does not call ApiClient directly');
  }
  // journey.js must not call fetch directly.
  const journeyRaw = readFileSync(join(root, 'assets/js/journey.js'), 'utf8');
  ok(!/\bfetch\s*\(/.test(journeyRaw.replace(/\n/g, ' ')), 'journey.js has no direct fetch');
  // journey/tools must trigger activity via ActivityService.
  const journey = readFileSync(join(root, 'assets/js/journey.js'), 'utf8');
  const tools = readFileSync(join(root, 'assets/js/tools.js'), 'utf8');
  ok(/ActivityService\.record\('mission_completed', 1\)/.test(journey),
    'journey triggers mission_completed via ActivityService');
  ok(/ActivityService\.record\('tool_used', 1\)/.test(tools),
    'tools triggers tool_used via ActivityService');
}

/* ================================================================== */
console.log('== 6. Backend static audit (STATIC) ==');
{
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = process.cwd();
  const rec = readFileSync(join(root, 'backend/supabase/functions/rpc_activity_event.sql'), 'utf8');
  const m11 = readFileSync(join(root, 'backend/supabase/migrations/0011_community_activity_events.sql'), 'utf8');
  const m12 = readFileSync(join(root, 'backend/supabase/functions/rpc_privileges.sql'), 'utf8');
  const m14 = readFileSync(join(root, 'backend/supabase/migrations/0014_activity_trigger_support.sql'), 'utf8');

  ok(/SECURITY DEFINER/.test(rec) && /SET search_path = public/.test(rec),
    'ns_record_activity SECURITY DEFINER + search_path');
  ok(/ns_validate_session\(p_token\)/.test(rec), 'session validated');
  ok(!/p_user_id/.test(rec), 'no client identity');
  ok(/ENABLE ROW LEVEL SECURITY/.test(m11), 'events RLS enabled');
  ok(/GRANT EXECUTE ON FUNCTION public\.ns_record_activity/.test(m12) &&
    /REVOKE EXECUTE ON FUNCTION public\.ns_record_activity/.test(m12),
    'rpc_privileges.sql controls ns_record_activity EXECUTE');
  ok(/ENABLE ROW LEVEL SECURITY/.test(m14) && /REVOKE SELECT ON public\.v_country_metrics/.test(m14),
    '0014 re-affirms RLS');
}

/* ------------------------------------------------------------------ */
const exitCode = summary() ? 0 : 1;
process.exit(exitCode);
