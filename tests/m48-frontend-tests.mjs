/**
 * NullSec — M48 frontend/product pass (STATIC + pure-logic).
 *
 * Verifies the M48 changes without a real backend or browser:
 *   1. Global auth state: Auth.onAuthChange exists and fires on applySession/
 *      clearSession; pages subscribe to it and to Session.ensureRestored.
 *   2. Automatic sync: Sync.scheduleSync / syncNow / getStatus / onStatusChange
 *      exist; local mutations (settings/profile/progress) call notifyChanged.
 *   3. Country selector present in the account page; country service wired.
 *   4. Account page uses no native alert()/confirm()/prompt().
 *   5. About page has no stray search text (exactly one search-results node).
 *   6. Community page order: Europe Activity Map then Country Activity below it.
 *   7. Europe map: real SVG asset present, A2_TO_A3 mapping, COUNTRY_PATHS >= 20.
 *   8. config.js still offline by default.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'assets/js');

let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error('  ✗ ' + msg); } }
function read(p) { return readFileSync(p, 'utf8'); }

/* ---------- 1. Global auth state ---------- */
console.log('== 1. Global auth state ==');
{
  const auth = read(join(JS, 'auth-service.js'));
  ok(/function onAuthChange\(cb\)/.test(auth), 'Auth.onAuthChange defined');
  ok(/function notifyAuthChange\(\)/.test(auth), 'Auth.notifyAuthChange defined');
  ok(/onAuthChange: onAuthChange/.test(auth), 'onAuthChange exposed on window.Auth');
  ok(/notifyAuthChange\(\);/.test(auth), 'auth state notifies listeners');

  // navigation / home / journey subscribe to the auth change + ensureRestored.
  const nav = read(join(JS, 'navigation.js'));
  ok(/Auth.onAuthChange\(initSessionNav\)/.test(nav), 'navigation re-runs nav on auth change');
  ok(/Session\.ensureRestored\(\)\.then\(function \(\) \{ initSessionNav\(\); \}\)/.test(nav), 'navigation re-runs nav after restore');

  const home = read(join(JS, 'home.js'));
  ok(/Auth.onAuthChange\(renderWeekly\)/.test(home), 'home re-renders weekly on auth change');
  ok(/Session\.ensureRestored\(\)\.then\(function \(\) \{ renderWeekly\(\); \}\)/.test(home), 'home re-renders weekly after restore');

  const journey = read(join(JS, 'journey.js'));
  ok(/Auth.onAuthChange/.test(journey), 'journey re-renders on auth change');
  ok(/Session\.ensureRestored/.test(journey), 'journey re-renders after restore');

  // No new independent localStorage auth flags introduced.
  const allJs = ['auth-service.js','user-state.js','session-service.js','navigation.js']
    .map(function (f) { return read(join(JS, f)); }).join('\n');
  ok(!/\b(isLoggedIn|loggedIn|authState)\b/.test(allJs), 'no new independent auth flags in local/session code');
}

/* ---------- 2. Automatic sync ---------- */
console.log('== 2. Automatic sync ==');
{
  const sync = read(join(JS, 'sync-service.js'));
  ok(/function scheduleSync\(\)/.test(sync), 'Sync.scheduleSync defined');
  ok(/function syncNow\(\)/.test(sync), 'Sync.syncNow defined');
  ok(/function getStatus\(\)/.test(sync), 'Sync.getStatus defined');
  ok(/function onStatusChange\(cb\)/.test(sync), 'Sync.onStatusChange defined');
  ok(/scheduleSync: scheduleSync/.test(sync), 'scheduleSync exposed');
  ok(/syncNow: syncNow/.test(sync), 'syncNow exposed');
  ok(/retryDelay = Math\.min\(retryDelay \* 2, 30000\)/.test(sync), 'bounded backoff (no infinite loop)');
  ok(/setStatus\('pending'\)/.test(sync), 'dirty state tracked as pending');

  // Local mutations call notifyChanged / notifySync → auto-sync.
  const settings = read(join(JS, 'settings-service.js'));
  const profile = read(join(JS, 'user-profile.js'));
  const progress = read(join(JS, 'progress-service.js'));
  ok(/notifySync\(\);/.test(settings), 'settings update triggers sync');
  ok(/notifySync\(\);/.test(profile), 'profile update triggers sync');
  ok(/Sync\.notifyChanged\(\);/.test(progress), 'progress complete/uncomplete triggers sync');

  // Manual "Sync now" retained but not required.
  ok(/Sync now/.test(read(join(JS, 'profile.js'))), 'manual Sync now button retained');
}

/* ---------- 3. Country selector ---------- */
console.log('== 3. Country selector ==');
{
  const prof = read(join(JS, 'profile.js'));
  ok(/function renderCountrySelector\(\)/.test(prof), 'country selector function defined');
  ok(/renderCountrySelector\(\)/.test(prof), 'country selector rendered in settings');
  ok(/Prefer not to say/.test(prof), '"Prefer not to say" (no-country) option present');
  ok(/CountryService\.confirm\(\)/.test(prof), 'country save uses CountryService');
  ok(/Sync\.scheduleSync\(\)/.test(prof), 'country save triggers auto-sync');
  ok(/loadCountriesAll/.test(prof), 'uses the full country list (no duplicate data)');
}

/* ---------- 4. No native dialogs in account page ---------- */
console.log('== 4. Native dialogs removed ==');
{
  const prof = read(join(JS, 'profile.js'));
  // Only our Modal.confirm (not native window.confirm / alert / prompt).
  ok(!/\bwindow\.(alert|confirm|prompt)\(/.test(prof), 'profile.js uses no native alert/confirm/prompt');
  ok(/window\.Modal\.toast/.test(prof), 'profile.js uses Modal.toast');
  ok(/window\.Modal\.confirm/.test(prof), 'profile.js uses Modal.confirm');
}

/* ---------- 5. About page stray search text ---------- */
console.log('== 5. About page stray search text ==');
{
  const about = read(join(ROOT, 'about.html'));
  const results = about.match(/class="search-results"/g) || [];
  ok(results.length === 1, 'about.html has exactly one search-results node (got ' + results.length + ')');
  const empty = about.match(/class="search-empty"/g) || [];
  ok(empty.length === 1, 'about.html has exactly one search-empty (got ' + empty.length + ')');
}

/* ---------- 6. Community page order (map above country activity) ---------- */
console.log('== 6. Community page order ==');
{
  const html = read(join(ROOT, 'community.html'));
  const mapIdx = html.indexOf('id="community-map"');
  const countryIdx = html.indexOf('id="country-activity"');
  const mapHeader = html.indexOf('Europe Activity Map');
  const countryHeader = html.indexOf('Country Activity');
  ok(mapHeader !== -1 && countryHeader !== -1, 'both section headers present');
  ok(mapIdx !== -1 && countryIdx !== -1, 'both containers present');
  ok(mapHeader < countryHeader && mapIdx < countryIdx,
    'Europe Activity Map comes before Country Activity');
}

/* ---------- 7. Europe map ---------- */
console.log('== 7. Europe map ==');
{
  const svg = join(ROOT, 'assets/images/europe-map.svg');
  ok(existsSync(svg), 'real Europe SVG asset vendored');
  if (existsSync(svg)) {
    const raw = read(svg);
    ok(/class="region/.test(raw), 'SVG uses region classes (ISO ids)');
    ok(/<svg/.test(raw), 'SVG is an SVG document');
  }
  const map = read(join(JS, 'europe-map.js'));
  ok(/A2_TO_A3/.test(map), 'europe-map has alpha-2 → alpha-3 mapping');
  ok(/FRA/.test(map) && /DEU/.test(map) && /ESP/.test(map), 'mapping includes France/Germany/Spain');
  ok(/COUNTRY_PATHS/.test(map), 'COUNTRY_PATHS still exported');
  ok(/assets\/images\/europe-map\.svg/.test(map), 'loads the vendored real SVG');
  ok(/Data\.loadEuropeMap/.test(map), 'map loads SVG via Data loader (fetch stays in data-loader)');
  // data-loader exposes loadEuropeMap.
  const dl = read(join(JS, 'data-loader.js'));
  ok(/loadEuropeMap/.test(dl), 'data-loader exposes loadEuropeMap');
  ok(/europe-map.*assets\/images\/europe-map\.svg/.test(dl), 'data-loader maps europe-map to the asset');
  // License attribution present.
  ok(existsSync(join(ROOT, 'assets/images/README-Europe-Map.md')), 'map license/source file present');
}

/* ---------- 8. config.js offline default ---------- */
console.log('== 8. config offline default ==');
{
  const config = read(join(JS, 'config.js'));
  ok(/supabaseEnabled:\s*false/.test(config), 'supabaseEnabled off by default');
  ok(/offlineMode:\s*true/.test(config), 'offlineMode true by default');
}

/* ---------- 9. M48 sync behavior (pure logic via vm) ---------- */
console.log('== 9. Sync status/backoff pure logic ==');
{
  const resolverSrc = read(join(JS, 'sync-resolver.js'));
  const syncSrc = read(join(JS, 'sync-service.js'));
  // Load sync-resolver in a sandbox.
  const sb = { window: {} };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(resolverSrc, sb);
  const SyncResolver = sb.window.SyncResolver;
  const freshEmpty = { version: 1, missions: {}, articles: {}, weekly: {}, updated_at: '2026-08-18T00:00:00Z' };
  const serverDone = { version: 1, missions: { 'enable-2fa': { completed: true } }, articles: {}, weekly: {}, updated_at: '2026-08-17T00:00:00Z' };
  const r = SyncResolver.mergeBlock(freshEmpty, serverDone, 'progress');
  ok(r.winner === 'server', 'empty local does not clobber server progression');
  ok(syncSrc.indexOf('retryDelay') !== -1, 'sync-service keeps bounded backoff logic');
}

console.log(`\n--- M48 FRONTEND PASS (STATIC): ${passed} passed, ${failed} failed ---`);
process.exit(failed === 0 ? 0 : 1);
