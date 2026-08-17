/**
 * NullSec — Milestone 30 (Account-Based Progression & Auth UX) test suite.
 * ------------------------------------------------------------------
 * Category: LOCAL / MOCKED / STATIC (no real Supabase, no browser).
 *
 * Covers:
 *   1. Guest cannot complete a mission locally (no local progression fallback).
 *   2. Authenticated user CAN complete a mission (persisted via Supabase sync).
 *   3. Authentication state: guest vs authenticated.
 *   4. Static audit: Learning Journey is auth-gated (journey.js renders an
 *      account CTA for guests and refuses local completion).
 *   5. Static audit: no local/guest progression persistence keys introduced.
 *   6. Static audit: journey/tools still route activity via ActivityService.
 */
import { makeHarness, LOAD_ORDER, ok, eq, summary } from './run-tests.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
console.log('== 1. Guest cannot complete a mission locally (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_OFF);
  h.W('Identity').init();
  h.W('Progress').init();
  h.resetFetch();

  // Guest attempts to complete a mission.
  const before = h.W('Progress').isCompleted('mission-1');
  h.W('Progress').complete('mission-1');
  const after = h.W('Progress').isCompleted('mission-1');

  ok(!before, 'guest mission not completed before attempt');
  ok(after === false, 'guest completion is a no-op (no local mission completion)');
  eq(h.calls.fetch.filter(c => /rest\/v1/.test(c.url)).length, 0,
    'guest completion triggers zero backend calls');
  const missions = h.W('Progress').get().missions;
  ok(!missions['mission-1'] || !missions['mission-1'].completed,
    'no local mission completion state stored for guest');
}

/* ================================================================== */
console.log('== 2. Authenticated user can complete a mission (MOCKED) ==');
{
  const h = makeHarness({ backend: { register: () => ({ token: 'tok-m30', user_id: 1 }), validate: () => 1 } });
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  h.W('RecoveryKey').ensure();
  h.W('Identity').init();
  await h.W('Auth').createAccount('tester', 'password123');
  await h.W('Session').forceRecheck();
  h.resetFetch();

  ok(h.W('Auth').isAuthenticated(), 'authenticated after register');
  h.W('Progress').complete('mission-2');
  ok(h.W('Progress').isCompleted('mission-2') === true,
    'authenticated mission completion is recorded');
}

/* ================================================================== */
console.log('== 3. Authentication state (LOCAL) ==');
{
  // Guest.
  const g = makeHarness();
  g.load(LOAD_ORDER);
  cfg(g, BACKEND_OFF);
  ok(g.W('Auth').isAuthenticated() === false, 'guest is not authenticated');
  ok(g.W('Auth').getAuthStatus() === 'NOT_AUTHENTICATED', 'guest auth status NOT_AUTHENTICATED');

  // Authenticated.
  const h = makeHarness({ backend: { register: () => ({ token: 'tok-m30', user_id: 1 }), validate: () => 1 } });
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  h.W('RecoveryKey').ensure();
  h.W('Identity').init();
  await h.W('Auth').createAccount('tester', 'password123');
  await h.W('Session').forceRecheck();
  ok(h.W('Auth').isAuthenticated() === true, 'authenticated after register');
  ok(h.W('Auth').getAuthStatus() === 'AUTHENTICATED', 'auth status AUTHENTICATED');
}

/* ================================================================== */
console.log('== 4. Journey is auth-gated (STATIC) ==');
{
  const root = process.cwd();
  const journey = readFileSync(join(root, 'assets/js/journey.js'), 'utf8');
  const progress = readFileSync(join(root, 'assets/js/progress-service.js'), 'utf8');
  const journeyHtml = readFileSync(join(root, 'journey.html'), 'utf8');

  // journey.js: guests must not complete missions locally; shows an account CTA.
  ok(/Auth\.isAuthenticated\(\)/.test(journey), 'journey.js checks Auth.isAuthenticated');
  ok(/isAuthenticated\(\)/.test(journey) && /toggleMission/.test(journey),
    'journey gates toggleMission behind authentication');
  ok(/buildAuthCTA/.test(journey) && /Your Learning Journey/.test(journey),
    'journey renders an account CTA for logged-out users');
  ok(/Create an account to save your mission progress/.test(journey),
    'journey CTA explains an account is required to save progress');
  ok(/Already have an account\?/.test(journey), 'journey CTA links to Sign in');
  ok(!/stored locally, no account needed/.test(journey),
    'journey no longer claims progression is stored locally');

  // progress-service: mission completion requires an authenticated session.
  ok(/canPersistProgression/.test(progress) && /Auth\.isAuthenticated\(\)/.test(progress),
    'progress-service requires auth to persist progression (defense in depth)');
  ok(/function complete\(id\)[\s\S]*?canPersistProgression\(\)/.test(progress),
    'Progress.complete is gated by authentication');
  ok(/function uncomplete\(id\)[\s\S]*?canPersistProgression\(\)/.test(progress),
    'Progress.uncomplete is gated by authentication');

  // journey.html: hero no longer claims local saving.
  ok(!/saved locally/.test(journeyHtml), 'journey.html hero no longer says "saved locally"');
  ok(/Create an account to save your progress/.test(journeyHtml),
    'journey.html hero explains account is required');
}

/* ================================================================== */
console.log('== 5. No local/guest progression persistence (STATIC) ==');
{
  const root = process.cwd();
  const journey = readFileSync(join(root, 'assets/js/journey.js'), 'utf8');
  const progress = readFileSync(join(root, 'assets/js/progress-service.js'), 'utf8');
  // Journey/progress must not write mission completion to localStorage.
  ok(!/localStorage\.setItem\([^)]*journey/.test(journey),
    'journey.js does not write journey state to localStorage');
  ok(!/localStorage\.setItem/.test(progress.replace(/Store\.set/g, '')),
    'progress-service does not write to localStorage directly (memory + Supabase only)');
  // M31: store.js no longer defines/purges legacy progression keys — the app
  // never writes them. Only the theme key remains as persistent localStorage.
  const store = readFileSync(join(root, 'assets/js/store.js'), 'utf8');
  ok(!/journey:progress/.test(store), 'store.js no longer references ns:journey:progress');
  ok(/KEYS = \{/.test(store) && /'theme'/.test(store.slice(store.indexOf('KEYS'), store.indexOf('migrate'))),
    'store.js keeps only the theme key as persistent');
}

/* ================================================================== */
console.log('== 6. Activity still routed via ActivityService (STATIC) ==');
{
  const root = process.cwd();
  const journey = readFileSync(join(root, 'assets/js/journey.js'), 'utf8');
  // Preserve M25 contract.
  ok(/ActivityService\.record\('mission_completed', 1\)/.test(journey),
    'journey triggers mission_completed via ActivityService');
  ok(!/\bfetch\s*\(/.test(journey.replace(/\n/g, ' ')), 'journey.js has no direct fetch');
  // The activity is only sent AFTER auth + completion (not for guests).
  ok(/!wasCompleted && window\.ActivityService/.test(journey),
    'activity event only fires on a real completion');
}

const exitCode = summary() ? 0 : 1;
process.exit(exitCode);
