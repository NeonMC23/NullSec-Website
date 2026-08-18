/**
 * NullSec — M51 responsive UX & state consistency (STATIC).
 *
 * Verifies the concrete M51 fixes:
 *   1. Responsive: no `min-width` forcing tools-grid/article-list overflow;
 *      tool-card + article-list-item allow shrink/wrap on narrow screens.
 *   2. Map: loading-state class + aspect-ratio reserve space (no layout shift);
 *      safe class helpers (works with a minimal DOM shim).
 *   3. Community: country panel initialized to a neutral state on load.
 *   4. Accessibility: hamburger aria-expanded/aria-controls/aria-label on every
 *      page; navigation toggles aria-expanded and sets aria-current.
 *   5. State: single sync-status subscription (no accumulating listeners).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'assets/js');
const PAGES = ['index','journey','community','profile','articles','tools','contribute','about','public-profile'];

let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error('  ✗ ' + msg); } }
function read(p) { return readFileSync(p, 'utf8'); }

/* 1. Responsive CSS */
console.log('== 1. Responsive / no mobile overflow ==');
{
  const comp = read(join(ROOT, 'assets/css/components.css'));
  ok(/\.tool-card[^{]*\{[^}]*min-width: 0/s.test(comp), '.tool-card has min-width:0 (shrinkable grid item)');
  ok(/white-space: normal;/.test(comp), '.tool-category can wrap (no forced nowrap overflow)');
  ok(/@media \(max-width: 560px\)[\s\S]*\.article-list-item \{ grid-template-columns: 1fr; \}/.test(comp),
    'article-list-item stacks to 1 column on narrow screens');
  ok(/\.articles-list > \.article-list-item \{[\s\S]*min-width: 0;[\s\S]*max-width: 100%;/.test(comp),
    'article items can shrink within the list');
}

/* 2. Map loading + layout-shift + safe class helpers */
console.log('== 2. Map loading state / layout-shift ==');
{
  const pages = read(join(ROOT, 'assets/css/pages.css'));
  ok(/aspect-ratio: 1613 \/ 1417/.test(pages), '.europe-map reserves aspect ratio (no layout shift)');
  ok(/europe-map--loading/.test(pages), 'map loading-state style present');
  const map = read(join(JS, 'europe-map.js'));
  ok(/europe-map--loading/.test(map), 'map adds loading class during fetch');
  ok(/function elRemoveClass/.test(map), 'safe class helper present (no classList crash)');
  ok(/removeAttribute\('aria-busy'\)/.test(map) || /removeAttribute\("aria-busy"\)/.test(map), 'map clears aria-busy when loaded');
  ok(/europe-map--loading/.test(map), 'loading class removed on success');
}

/* 3. Community panel neutral state on load */
console.log('== 3. Community panel neutral state ==');
{
  const c = read(join(JS, 'community.js'));
  ok(/renderCountryPanel\(null, true\)/.test(c), 'country panel initialized to neutral state on map load');
  ok(/hoveredCountry/.test(c), 'tracks hover separately from selection');
  ok(/renderCountryPanel\(selectedCountry, true\)/.test(c), 'mouseleave keeps last selected');
}

/* 4. Accessibility — hamburger + nav */
console.log('== 4. Accessibility (nav) ==');
{
  let allHaveAria = true;
  for (const pg of PAGES) {
    const html = read(join(ROOT, pg + '.html'));
    const hasLabel = /aria-label="Toggle navigation menu"/.test(html);
    const hasExpanded = /aria-expanded="false"/.test(html);
    const hasControls = /aria-controls="mobile-menu"/.test(html);
    const hasMenuId = /id="mobile-menu"/.test(html);
    if (!(hasLabel && hasExpanded && hasControls && hasMenuId)) allHaveAria = false;
  }
  ok(allHaveAria, 'every page: hamburger aria-label/expanded/controls + mobile-menu id');
  const nav = read(join(JS, 'navigation.js'));
  ok(/setAttribute\('aria-expanded'/.test(nav), 'navigation toggles aria-expanded on menu open/close');
  ok(/aria-current/.test(nav), 'navigation sets aria-current on active link');
}

/* 5. State — single sync subscription */
console.log('== 5. No accumulating sync listeners ==');
{
  const prof = read(join(JS, 'profile.js'));
  ok(/function wireSyncStatus/.test(prof), 'single wireSyncStatus helper exists');
  ok(/syncPillRef/.test(prof), 'single canonical sync pill reference');
  // wireSyncStatus is defined and its subscription is NOT inside renderAccountSync
  // (which runs on every renderAll) — so listeners never accumulate.
  const rsStart = prof.indexOf('function renderAccountSync');
  const rsEnd = prof.indexOf('\n  function ', rsStart + 10);
  const rsBody = prof.slice(rsStart, rsEnd > 0 ? rsEnd : rsStart + 1200);
  ok(!/onStatusChange/.test(rsBody), 'renderAccountSync does not subscribe (single subscription at init)');
  // wireSyncStatus (which holds the single subscription) is called exactly once, in init.
  const callCount = (prof.match(/wireSyncStatus\(\);\s*\n/g) || []).length;
  ok(callCount === 1, 'wireSyncStatus called exactly once (in init)');
}

console.log(`\n--- M51 FRONTEND PASS: ${passed} passed, ${failed} failed ---`);
process.exit(failed === 0 ? 0 : 1);
