/**
 * NullSec — M49 account persistence & state consistency (STATIC + harness).
 *
 * Covers:
 *   AUTH/NAV  — global sign-out reconcile (removed on logout, present when authed)
 *   COUNTRY   — repository rehydrate, setCountry write-through, clearing sentinel,
 *               sync pull rehydration path
 *   JOURNEY   — re-render after async session restore / sync completion
 *   COMMUNITY — persistent country info panel (hover/selected states, leave keeps
 *               last selection)
 *   ACCOUNT   — account-shell layout, sync status, no native dialogs
 *   CONTRIBUTE — exact Programming text, old language list gone
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeHarness, LOAD_ORDER, ok, eq, summary } from './run-tests.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'assets/js');

let passed = 0, failed = 0;
function ok2(cond, msg) { if (cond) passed++; else { failed++; console.error('  ✗ ' + msg); } }
function read(p) { return readFileSync(p, 'utf8'); }

/* ============ AUTH / NAV ============ */
console.log('== 1. Auth / global navigation ==');
{
  const nav = read(join(JS, 'navigation.js'));
  ok2(/reconcileSessionNav/.test(nav), 'navigation has reconcileSessionNav');
  ok2(/querySelectorAll\('\.nav-signout'\).*remove/.test(nav), 'sign-out controls removed on logout');
  ok2(/Auth\.onAuthChange\(initSessionNav\)/.test(nav), 'navigation subscribes to auth change');
  ok2(/Session\.ensureRestored\(\)\.then/.test(nav), 'navigation re-renders after session restore');
  // Guests never see sign-out; authenticated do — the reconcile gate handles both.
  ok2(/if \(!authed\) return/.test(nav), 'no sign-out injected for guests');
}

/* ============ COUNTRY ============ */
console.log('== 2. Country persistence ==');
{
  const cr = read(join(ROOT, 'assets/js/repositories/country-repository.js'));
  ok2(/rehydrate/.test(cr), 'CountryRepository.rehydrate exists');
  ok2(/country_code: ''/.test(cr), 'clearing uses empty-string sentinel');
  ok2(/ns_update_profile/.test(cr) || /ApiClient\.updateProfile/.test(cr), 'setCountry writes through to backend');

  // rehydrate logic (sync, pure): set/clear the in-memory value.
  const h = makeHarness();
  h.load(LOAD_ORDER);
  if (!h.W('CountryRepository')) h.runFile('repositories/country-repository.js');
  const repo = h.W('CountryRepository');
  repo.rehydrate('DE');
  ok2(repo.getCountry() === 'DE', 'rehydrate sets value from server pull');
  repo.rehydrate(null);
  ok2(repo.getCountry() === null, 'rehydrate null clears (prefer not to say)');
  repo.rehydrate('fr');
  ok2(repo.getCountry() === null, 'rehydrate rejects non-ISO/non-uppercase code');
}

/* ============ JOURNEY ============ */
console.log('== 3. Journey state restoration ==');
{
  const journey = read(join(JS, 'journey.js'));
  ok2(/Auth\.onAuthChange/.test(journey), 'journey re-renders on auth change');
  ok2(/Session\.ensureRestored/.test(journey), 'journey re-renders after session restore');
  ok2(/Sync\.onStatusChange/.test(journey), 'journey re-renders when sync completes');
  ok2(/Progress\.reload/.test(journey), 'journey reloads progress before render');

  const session = read(join(JS, 'session-service.js'));
  ok2(/Sync\.syncNow/.test(session), 'session restore triggers a sync pull');
}

/* ============ COMMUNITY ============ */
console.log('== 4. Community persistent country panel ==');
{
  const c = read(join(JS, 'community.js'));
  ok2(/hoveredCountry/.test(c), 'tracks hover separately from selection');
  ok2(/renderCountryPanel\(selectedCountry, true\)/.test(c), 'mouseleave falls back to last selected');
  ok2(/renderCountryPanel\(code, true\)/.test(c), 'hover updates panel');
  ok2(/panel-state/.test(c), 'panel distinguishes hovered/selected state');
  ok2(/selectedCountry = code \|\| null/.test(c), 'click persists selection');
}

/* ============ ACCOUNT ============ */
console.log('== 5. Account UI ==');
{
  const html = read(join(ROOT, 'profile.html'));
  ok2(/account-shell/.test(html), 'account shell container present');
  ok2(/account-card/.test(html), 'account uses cards');
  ok2(/id="account-sync"/.test(html), 'account sync area present');
  const prof = read(join(JS, 'profile.js'));
  ok2(/renderAccountSync/.test(prof), 'account renders sync status');
  ok2(/sync-status-pill/.test(prof), 'sync status pill used');
  ok2(!/\bwindow\.(alert|confirm|prompt)\(/.test(prof), 'no native dialogs in account');
}

/* ============ CONTRIBUTE ============ */
console.log('== 6. Contribute Programming text ==');
{
  const html = read(join(ROOT, 'contribute.html'));
  ok2(/Contribute to our open source projects on GitHub, or make your own project for the NullSec Community/.test(html), 'exact new Programming text present');
  ok2(!/HTML, CSS, JavaScript, Python, Linux scripting/.test(html), 'old language list removed');
}

/* ============ SYNC pull rehydrates country ============ */
console.log('== 7. Sync pull rehydrates country ==');
{
  const sync = read(join(JS, 'sync-service.js'));
  ok2(/CountryRepository\.rehydrate/.test(sync), 'sync-service rehydrates country after pull');
  ok2(/profile\.country_code/.test(sync), 'sync payload carries country_code');
}

// Summarize
const total = { passed, failed };
const extra = summary();
console.log(`\n--- M49 FRONTEND PASS: ${passed} passed, ${failed} failed ---`);
if (extra && extra.passed !== undefined) {
  console.log(`(harness subtotal: ${extra.passed} passed, ${extra.failed} failed)`);
}
process.exit(failed === 0 ? 0 : 1);
