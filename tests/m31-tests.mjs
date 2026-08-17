/**
 * NullSec — Milestone 31 (Legacy Profile & Local-State Cleanup) test suite.
 * ------------------------------------------------------------------
 * Category: LOCAL / MOCKED / STATIC (no real Supabase, no browser).
 *
 * Verifies the cleanup acceptance criteria:
 *   - Local-state removal: no legacy progression keys, no local profile
 *     persistence, no local mission completion, no anonymous progression
 *     fallback, no obsolete account-data storage.
 *   - Authentication: guest has no progression; authenticated user can access
 *     progression; sign-out removes authenticated progression access; no auth
 *     secret is stored in localStorage.
 *   - Architecture: Progress uses the server sync path; no duplicate local
 *     persistence; Account is not a public profile; Community exposes no
 *     individual users.
 *   - UI/static: no "saved locally" strings, no "Local Profile" UI, no
 *     anonymous profile CTA, Journey requires authentication.
 */
import { makeHarness, LOAD_ORDER, ok, eq, summary } from './run-tests.mjs';
import { readFileSync, readdirSync } from 'node:fs';
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

/* ================================================================== */
console.log('== 1. Local-state removal (runtime, LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_OFF);
  h.W('Identity').init();
  h.W('Progress').init();
  h.resetFetch();

  // No legacy/account keys written to localStorage.
  const keys = Object.keys(h.localBacking);
  ok(!keys.some(k => /journey|weekly|article|identity|profile|progress|settings|auth|user:state|recovery/.test(k)),
    'no legacy/account keys in localStorage (got: ' + keys.join(',') + ')');

  // Guest mission completion is a no-op (no anonymous/local progression).
  h.W('Progress').complete('mission-x');
  ok(h.W('Progress').isCompleted('mission-x') === false, 'no local mission completion for guest');
  eq(h.calls.fetch.filter(c => /rest\/v1/.test(c.url)).length, 0, 'guest completion makes zero backend calls');

  // No anonymous progression fallback: UserState mode is 'anonymous'.
  ok(h.W('UserState').getMode() === 'anonymous', 'guest mode is anonymous (no local account)');

  // Identity carries no social fields.
  const id = h.W('Identity').get();
  ok(!('username' in id) && !('display_name' in id) && !('avatar' in id),
    'identity has no username/display_name/avatar');
}

/* ================================================================== */
console.log('== 2. Authentication + progression access control (LOCAL/MOCKED) ==');
{
  // Guest: not authenticated, no progression.
  const g = makeHarness();
  g.load(LOAD_ORDER);
  cfg(g, BACKEND_OFF);
  g.W('Identity').init();
  g.W('Progress').init();
  ok(!g.W('Auth').isAuthenticated(), 'guest is not authenticated');

  // Authenticated user: can complete a mission (progression accessible).
  const h = makeHarness({ backend: { register: () => ({ token: 'tok-m31', user_id: 1 }), validate: () => 1 } });
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  h.W('RecoveryKey').ensure();
  h.W('Identity').init();
  await h.W('Auth').createAccount('tester', 'password123');
  await h.W('Session').forceRecheck();
  ok(h.W('Auth').isAuthenticated(), 'authenticated after register');
  h.W('Progress').complete('mission-y');
  ok(h.W('Progress').isCompleted('mission-y') === true, 'authenticated progression accessible');

  // Sign out removes authenticated progression access.
  h.W('Auth').logout();
  ok(!h.W('Auth').isAuthenticated(), 'sign-out clears authentication');
  h.W('Progress').complete('mission-z');
  ok(h.W('Progress').isCompleted('mission-z') === false,
    'after sign-out, new progression completion is blocked');

  // No authentication secret in localStorage.
  const keys = Object.keys(h.localBacking);
  ok(!keys.includes('ns:auth') && !keys.includes('ns:user:state'),
    'no auth state flag in localStorage');
  ok(!JSON.stringify(h.localBacking).includes('tok-m31'), 'no session token in localStorage');
  ok(h.localBacking['ns:recovery'] === undefined, 'no recovery key in localStorage');
}

/* ================================================================== */
console.log('== 3. Architecture: Progress uses server sync path (STATIC) ==');
{
  const progress = readFileSync(join(JS, 'progress-service.js'), 'utf8');
  const sync = readFileSync(join(JS, 'sync-service.js'), 'utf8');
  const store = readFileSync(join(JS, 'store.js'), 'utf8');

  // Progress.complete triggers the sync layer (server path), not localStorage.
  ok(/notifySync\(\)/.test(progress), 'progress mutations notify the Sync layer');
  ok(/ProgressRepository\.save/.test(progress), 'progress persists via ProgressRepository (memory)');
  ok(/canPersistProgression/.test(progress), 'progression persistence requires an authenticated account');
  // Sync pushes to Supabase RPC.
  ok(/ns_sync_push/.test(sync) || /ApiClient\.sync/.test(sync), 'Sync layer pushes to Supabase RPC');

  // No duplicate local persistence path: store.js only keeps the theme key.
  // (Inspect only the KEYS object literal, not the explanatory policy comment.)
  const keysStart = store.indexOf('KEYS = {');
  // Strip inline comments so explanatory prose ("progression keys") is ignored.
  const keysObj = store.slice(keysStart, store.indexOf('};', keysStart)).replace(/\/\/[^\n]*/g, '');
  ok(/THEME/.test(keysObj) && !/journey|weekly|article|identity|profile|progress|settings|recovery/.test(keysObj),
    'store.js KEYS object only contains the theme (no duplicate persistence keys)');
}

/* ================================================================== */
console.log('== 4. Account is not a public profile (STATIC) ==');
{
  const identity = readFileSync(join(JS, 'identity.js'), 'utf8');
  const profile = readFileSync(join(JS, 'profile.js'), 'utf8');
  const profileHtml = readFileSync(join(ROOT, 'profile.html'), 'utf8');

  // Identity has no social fields.
  ok(!/username|display_name|avatar/.test(identity.replace(/\*.*/g, '')),
    'identity.js no longer defines username/display_name/avatar');

  // Account page has no avatar/username editor.
  ok(!/renderAvatar/.test(profile), 'profile.js has no avatar renderer');
  ok(!/renderUsernameEditor/.test(profile), 'profile.js has no username editor');
  ok(/Account/.test(profileHtml) && !/Local Profile|Create a local profile/.test(profileHtml),
    'account page has no local-profile UI');
}

/* ================================================================== */
console.log('== 5. Community exposes no individual users (STATIC) ==');
{
  const community = readFileSync(join(JS, 'community.js'), 'utf8');
  const communityHtml = readFileSync(join(ROOT, 'community.html'), 'utf8');
  // No user list / profile cards / usernames / individual activity feed.
  ok(!/username|user_id|avatar|profile card|user list/.test(community.replace(/\*.*/g, '')),
    'community.js exposes no individual user identifiers');
  // Ignore the nav/footer link to the account page (href=profile.html is
  // navigation, not a user listing).
  const htmlNoNav = communityHtml.replace(/href="profile\.html"[^>]*>[^<]*<\/a>/g, '');
  ok(!/username|avatar|bio|profile card|user list|member card/.test(htmlNoNav),
    'community.html has no individual user/profile listing');
}

/* ================================================================== */
console.log('== 6. UI/static terminology (STATIC) ==');
{
  const files = ['journey.html', 'profile.html', 'index.html', 'community.html'];
  for (const f of files) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    ok(!/saved locally|Saved on this device|Local Profile|anonymous profile|guest profile|Create a local profile/.test(src),
      f + ' has no obsolete local-profile terminology');
  }
  // Navigation uses "Account".
  const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf8');
  ok(/href="profile.html">Account</.test(indexHtml), 'navigation labels the destination "Account"');
  // Journey requires authentication for progression.
  const journey = readFileSync(join(JS, 'journey.js'), 'utf8');
  ok(/Auth\.isAuthenticated\(\)/.test(journey), 'Journey requires authentication');
  const journeyHtml = readFileSync(join(ROOT, 'journey.html'), 'utf8');
  ok(!/saved locally/.test(journeyHtml), 'journey hero no longer claims local saving');
}

const exitCode = summary() ? 0 : 1;
process.exit(exitCode);
