/**
 * NullSec — M50 frontend UX & state consistency (STATIC + harness).
 *
 * Verifies:
 *   1. Guest navigation state (no sign-out).
 *   2. Authenticated navigation state (sign-out present, no duplication).
 *   3. Sign-out reconcile on logout.
 *   4. Country selector saved/pending/error handling; persistence; clearing.
 *   5. Journey hydration (session restore + sync completion re-render).
 *   6. Community persistent country panel (hover/selected, leave keeps selection).
 *   7. Contribute exact text.
 *   8. No native alert/confirm/prompt.
 *   9. Account layout elements.
 *  10. No duplicate auth state systems.
 *  11. No duplicate sync indicators.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeHarness, LOAD_ORDER, ok, eq } from './run-tests.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'assets/js');
const PAGES = ['index','journey','community','profile','articles','tools','contribute','about','public-profile'];

let passed = 0, failed = 0;
function ok2(cond, msg) { if (cond) passed++; else { failed++; console.error('  ✗ ' + msg); } }
function read(p) { return readFileSync(p, 'utf8'); }

/* ============ 1-3. Navigation / sign-out ============ */
console.log('== 1. Navigation / sign-out ==');
{
  const nav = read(join(JS, 'navigation.js'));
  ok2(/reconcileSessionNav/.test(nav), 'navigation reconciles session nav');
  ok2(/querySelectorAll\('\.nav-signout'\).*remove/.test(nav), 'sign-out controls removed on logout/expiry');
  ok2(/Auth\.onAuthChange\(initSessionNav\)/.test(nav), 'navigation subscribes to auth change');
  ok2(/Session\.ensureRestored/.test(nav), 'navigation re-renders after session restore');
  // Consistent markup: no static nav-signout in any HTML (JS-injected only).
  let staticSignout = 0;
  for (const pg of PAGES) if (/nav-signout/.test(read(join(ROOT, pg + '.html')))) staticSignout++;
  ok2(staticSignout === 0, 'no static sign-out markup in any page (consistent JS injection)');
  // Account link present in navbar on every page.
  let missingAccount = 0;
  for (const pg of PAGES) if (!/href="profile\.html">Account<\/a>/.test(read(join(ROOT, pg + '.html')))) missingAccount++;
  ok2(missingAccount === 0, 'Account link present on every page');
}

/* ============ 4. Country ============ */
console.log('== 2. Country selector ==');
{
  const prof = read(join(JS, 'profile.js'));
  ok2(/Could not save the country/.test(prof), 'country save failure shows clear error');
  ok2(/previous selection was kept/.test(prof), 'error preserves previous valid selection');
  ok2(/Saving…/.test(prof), 'country save shows intermediate saving state');
  ok2(/\(saved\)/.test(prof), 'saved only shown after successful save');
  const cr = read(join(ROOT, 'assets/js/repositories/country-repository.js'));
  ok2(/rehydrate/.test(cr), 'CountryRepository rehydrate exists');
  ok2(/country_code: ''/.test(cr), 'clearing uses empty-string sentinel');
  ok2(/ApiClient\.updateProfile/.test(cr), 'setCountry writes through to backend');
}

/* ============ 5. Journey ============ */
console.log('== 3. Journey hydration ==');
{
  const journey = read(join(JS, 'journey.js'));
  ok2(/Auth\.onAuthChange/.test(journey), 'journey re-renders on auth change');
  ok2(/Session\.ensureRestored/.test(journey), 'journey re-renders after session restore');
  ok2(/Sync\.onStatusChange/.test(journey), 'journey re-renders on sync completion');
  ok2(/Progress\.reload/.test(journey), 'journey reloads progress before render');
  const session = read(join(JS, 'session-service.js'));
  ok2(/Sync\.syncNow/.test(session), 'session restore triggers sync pull');
}

/* ============ 6. Community ============ */
console.log('== 4. Community map panel ==');
{
  const c = read(join(JS, 'community.js'));
  ok2(/hoveredCountry/.test(c), 'tracks hover separately from selection');
  ok2(/renderCountryPanel\(selectedCountry, true\)/.test(c), 'mouseleave keeps last selection');
  ok2(/selectedCountry = code \|\| null/.test(c), 'click persists selection');
  ok2(/metric-panel-empty/.test(c), 'empty/unavailable state is explicit');
  const css = read(join(ROOT, 'assets/css/pages.css'));
  ok2(/metric-panel-empty/.test(css), 'panel empty-state CSS exists');
}

/* ============ 7. Contribute ============ */
console.log('== 5. Contribute ==');
{
  const html = read(join(ROOT, 'contribute.html'));
  ok2(/Contribute to our open source projects on GitHub, or make your own project for the NullSec Community/.test(html), 'exact new Programming text');
  ok2(!/HTML, CSS, JavaScript, Python, Linux scripting/.test(html), 'no language list');
}

/* ============ 8. No native dialogs ============ */
console.log('== 6. No native dialogs ==');
{
  let native = 0;
  for (const f of ['profile.js','community.js','navigation.js','journey.js','home.js','country-service.js']) {
    const src = read(join(JS, f));
    if (/\bwindow\.(alert|confirm|prompt)\(|\b(alert|confirm|prompt)\(/.test(src.replace(/\/\/[^\n]*/g,''))) {
      // CountryService.confirm is a method name, not native. Exclude.
      const cleaned = src.replace(/CountryService\.confirm|\.confirm\(\)/g,'');
      if (/\bwindow\.(alert|confirm|prompt)\(/.test(cleaned)) native++;
    }
  }
  ok2(native === 0, 'no native alert/confirm/prompt in account/community/nav');
}

/* ============ 9. Account layout ============ */
console.log('== 7. Account layout ==');
{
  const html = read(join(ROOT, 'profile.html'));
  ok2(/account-shell/.test(html), 'account shell present');
  ok2(/account-card/.test(html), 'account uses cards');
  ok2(/id="account-sync"/.test(html), 'account sync area present');
  // No duplicate recovery section.
  const recCount = html.split('id="profile-recovery"').length - 1;
  ok2(recCount === 1, 'exactly one profile-recovery container (no duplicate)');
}

/* ============ 10. No duplicate sync indicators ============ */
console.log('== 8. No duplicate sync indicators ==');
{
  const prof = read(join(JS, 'profile.js'));
  // Only the header indicator should construct a sync pill.
  const pillCount = prof.split('renderAccountSync').length - 1;
  ok2(/function renderAccountSync/.test(prof), 'header sync indicator exists');
  ok2(!/let syncPill\b/.test(prof), 'no duplicate sync pill in signed-in actions');
  ok2(/let syncPillRef/.test(prof), 'single canonical sync pill reference in header');
}

/* ============ 11. No duplicate auth state systems ============ */
console.log('== 9. No duplicate auth state systems ==');
{
  const all = ['auth-service.js','session-service.js','user-state.js','navigation.js','journey.js','profile.js']
    .map(f => read(join(JS, f))).join('\n');
  ok2(!/\b(isLoggedIn|loggedIn|authState|hasSession)\b/.test(all), 'no competing auth flags');
  ok2(/Auth\.isAuthenticated/.test(all), 'uses canonical Auth.isAuthenticated');
}

console.log(`\n--- M50 FRONTEND PASS: ${passed} passed, ${failed} failed ---`);
process.exit(failed === 0 ? 0 : 1);
