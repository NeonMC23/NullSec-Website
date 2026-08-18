/**
 * NullSec — M52 frontend architecture & CSS hygiene (STATIC + source audit).
 *
 * Verifies the concrete M52 work:
 *   1. Exact-duplicate CSS rules removed (identical selector+body declared twice).
 *   2. Sequential-refinement CSS blocks preserved (NOT merged — merging would
 *      change visuals; these are intentional layered overrides).
 *   3. No render-time listener/subscription leaks: global subscriptions are
 *      registered at module init, never inside render functions.
 *   4. Navigation accessibility: hamburger aria attributes + mobile-menu id on
 *      every page; no static sign-out markup.
 *   5. Account country-state invariants (Saving/Saved/Error, previous value kept).
 *   6. Map loading lifecycle (aspect-ratio, loading class, aria-busy).
 *   7. Compatibility stubs style.css and v2.css remain.
 *   8. Responsive invariants (mobile single-column overrides present).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'assets/js');
const PAGES = ['index','journey','community','profile','public-profile','articles','tools','contribute','about'];

let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error('  ✗ ' + msg); } }
function read(p) { return readFileSync(p, 'utf8'); }

/* 1. Exact-duplicate CSS removed */
console.log('== 1. Exact-duplicate CSS removed ==');
{
  const comp = read(join(ROOT, 'assets/css/components.css'));
  const pages = read(join(ROOT, 'assets/css/pages.css'));
  const once = [
    '.article-list-item .item-right .cat',
    '.in-progress-toggle.open .arrow',
    '.in-progress-item h4',
  ];
  for (const sel of once) {
    const count = comp.split(sel).length - 1;
    ok(count === 1, sel + ' declared exactly once in components.css');
  }
  const communitySel = '.community-page .section-header p';
  ok(pages.split(communitySel).length - 1 === 1, communitySel + ' declared exactly once in pages.css');
  ok((comp.match(/\.in-progress-list\s*\{/g) || []).length === 1, '.in-progress-list declared once');
  ok((comp.match(/\.in-progress-list\.open\s*\{/g) || []).length === 1, '.in-progress-list.open declared once');
}

/* 2. Sequential refinement preserved */
console.log('== 2. Sequential refinement preserved ==');
{
  const comp = read(join(ROOT, 'assets/css/components.css'));
  const btnBlocks = comp.split('.btn {').length - 1;
  ok(btnBlocks >= 2, 'multiple .btn blocks preserved (sequential refinement)');
  ok(comp.includes('transform: translateY(-2px)'), 'btn-primary hover refinement intact');
}

/* 3. No render-time subscription leaks */
console.log('== 3. No render-time subscription leaks ==');
{
  const profile = read(join(JS, 'profile.js'));
  const rsStart = profile.indexOf('function renderAccountSync');
  const rsEnd = profile.indexOf('\n  function ', rsStart + 10);
  const rsBody = profile.slice(rsStart, rsEnd > 0 ? rsEnd : rsStart + 900);
  ok(!/onStatusChange|onAuthChange/.test(rsBody), 'renderAccountSync does not subscribe');
  ok((profile.match(/wireSyncStatus\(\);/g) || []).length === 1, 'wireSyncStatus called exactly once');
  ok((profile.match(/wireCountrySelectorRefresh\(\);/g) || []).length === 1, 'country selector refresh wired once');
  const journey = read(join(JS, 'journey.js'));
  ok((journey.match(/bindMissionCards\(\);/g) || []).length === 1, 'bindMissionCards called once');
  ok((journey.match(/bindFilters\(\);/g) || []).length === 1, 'bindFilters called once');
}

/* 4. Navigation accessibility + no static sign-out */
console.log('== 4. Navigation accessibility ==');
{
  let allOk = true;
  for (const pg of PAGES) {
    const html = read(join(ROOT, pg + '.html'));
    const hasAria = /aria-label="Toggle navigation menu"/.test(html) &&
      /aria-expanded="false"/.test(html) &&
      /aria-controls="mobile-menu"/.test(html) &&
      /id="mobile-menu"/.test(html);
    const staticSignout = /nav-signout/.test(html);
    if (!hasAria || staticSignout) allOk = false;
  }
  ok(allOk, 'every page has aria nav attributes + no static sign-out');
  const nav = read(join(JS, 'navigation.js'));
  ok(/aria-current/.test(nav), 'navigation sets aria-current');
  ok(/aria-expanded/.test(nav), 'navigation toggles aria-expanded');
}

/* 5. Account country-state invariants */
console.log('== 5. Country state invariants ==');
{
  const profile = read(join(JS, 'profile.js'));
  ok(/Saving…/.test(profile), 'country shows Saving intermediate state');
  ok(/\(saved\)/.test(profile), 'country shows Saved only after success');
  ok(/Could not save the country\. Your previous selection was kept\./.test(profile), 'failure preserves previous selection');
  const cr = read(join(ROOT, 'assets/js/repositories/country-repository.js'));
  ok(/country_code: ''/.test(cr), 'clearing uses empty-string sentinel (prefer not to say)');
  ok(/ApiClient\.updateProfile/.test(cr), 'country write-through to backend');
}

/* 6. Map loading lifecycle */
console.log('== 6. Map loading lifecycle ==');
{
  const pagesCss = read(join(ROOT, 'assets/css/pages.css'));
  ok(/aspect-ratio: 1613 \/ 1417/.test(pagesCss), 'map reserves aspect-ratio (no layout shift)');
  ok(/europe-map--loading/.test(pagesCss), 'map loading-state CSS present');
  const map = read(join(JS, 'europe-map.js'));
  ok(/europe-map--loading/.test(map), 'map adds loading class during fetch');
  ok(/aria-busy/.test(map), 'map sets aria-busy');
  ok(/function elRemoveClass/.test(map), 'safe class helpers present');
}

/* 7. Compatibility stubs remain */
console.log('== 7. Compatibility stubs remain ==');
{
  ok(existsSync(join(ROOT, 'assets/css/style.css')), 'style.css stub present');
  ok(existsSync(join(ROOT, 'assets/css/v2.css')), 'v2.css stub present');
}

/* 8. Responsive invariants */
console.log('== 8. Responsive invariants ==');
{
  const comp = read(join(ROOT, 'assets/css/components.css'));
  ok(/\.tool-card[^{]*\{[^}]*min-width: 0/s.test(comp), 'tool-card min-width:0 (shrinkable)');
  ok(/@media \(max-width: 560px\)[\s\S]*\.article-list-item \{ grid-template-columns: 1fr; \}/.test(comp), 'article-list stacks on mobile');
  const pagesCss = read(join(ROOT, 'assets/css/pages.css'));
  ok(/\.country-controls \{ display: flex; flex-direction: column; gap: 8px; width: 100%; min-width: 0;/.test(pagesCss), 'country-controls responsive');
}

console.log(`\n--- M52 FRONTEND PASS: ${passed} passed, ${failed} failed ---`);
process.exit(failed === 0 ? 0 : 1);
