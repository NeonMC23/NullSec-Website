/**
 * NullSec — M58 accessibility, keyboard navigation & interaction integrity.
 *
 * Locks the concrete M58 fixes and invariants:
 *   1. TL;DR toggle button carries aria-expanded + aria-controls; the summary
 *      content is aria-hidden while collapsed and exposed while open, and the
 *      state stays in sync on keyboard (Enter/Space) and click.
 *   2. Country selector: the select has an accessible name (real <label for> +
 *      aria-label + id) and the search input has an aria-label + id.
 *   3. Existing accessibility invariants: hamburger aria-expanded/aria-controls
 *      point at the real #mobile-menu; aria-current on active nav link.
 *   4. M53-M57 invariants preserved (search lazy, dedups, article wiring, etc.).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'assets/js');

let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error('  ✗ ' + msg); } }
function read(p) { return readFileSync(p, 'utf8'); }

/* 1. TL;DR aria-expanded/controls */
console.log('== 1. TL;DR accessibility ==');
{
  const tldr = read(join(JS, 'tldr.js'));
  ok(/setAttribute\('aria-expanded'/.test(tldr), 'tldr.js sets aria-expanded');
  ok(/setAttribute\('aria-controls'/.test(tldr), 'tldr.js sets aria-controls');
  ok(/setAttribute\('aria-hidden'/.test(tldr), 'tldr.js sets aria-hidden on content');
  ok(/syncAria/.test(tldr), 'tldr.js keeps aria state in sync after toggle');
  // The button toggles .tldr.open (feature still works).
  ok(/classList\.toggle\('open'\)/.test(tldr), 'tldr.js still toggles .tldr.open');
}

/* 2. Country selector accessible names */
console.log('== 2. Country selector accessibility ==');
{
  const prof = read(join(JS, 'profile.js'));
  const csStart = prof.indexOf('function renderCountrySelector(');
  const csBlock = prof.slice(csStart, prof.indexOf('\n  }\n', csStart) + 5);
  ok(/Utils\.el\('label'/.test(csBlock), 'country selector uses a <label>');
  ok(/for: uid \+ '-select'/.test(csBlock), 'label is associated with the select via for');
  ok(/'aria-label': 'Select your country'/.test(csBlock), 'select has aria-label');
  ok(/'aria-label': 'Search countries'/.test(csBlock), 'search input has aria-label');
  ok(/id: uid \+ '-select'/.test(csBlock), 'select has a unique id');
  ok(/id: uid \+ '-search'/.test(csBlock), 'search input has a unique id');
}

/* 3. Hamburger aria-controls references real menu */
console.log('== 3. Navigation accessibility ==');
{
  // Every page: hamburger aria-controls="mobile-menu" and #mobile-menu present.
  const pages = ['index','journey','community','profile','public-profile','articles','tools','contribute','about'];
  let allOK = true;
  for (const pg of pages) {
    const html = read(join(ROOT, pg + '.html'));
    const hasControl = /aria-controls="mobile-menu"/.test(html) && /id="mobile-menu"/.test(html) && /aria-expanded="false"/.test(html);
    if (!hasControl) allOK = false;
  }
  ok(allOK, 'every page has hamburger aria-expanded/aria-controls referencing #mobile-menu');
  const nav = read(join(JS, 'navigation.js'));
  ok(/setAttribute\('aria-expanded'/.test(nav), 'navigation toggles aria-expanded');
  ok(/aria-current/.test(nav), 'navigation sets aria-current');
}

/* 4. Search lazy init (M55) preserved */
console.log('== 4. Lazy search preserved ==');
{
  const search = read(join(JS, 'search.js'));
  const initBody = search.slice(search.indexOf('function init()'), search.indexOf('\n  }\n', search.indexOf('function init()')) + 5);
  ok(!/loadSearchIndex\(\)/.test(initBody), 'init() does NOT eagerly build search index');
  ok(/if \(!fuseInstance\) loadSearchIndex\(\);/.test(search), 'search index lazy on open');
}

/* 5. Dedup invariants (M53/M54) */
console.log('== 5. Dedup invariants ==');
{
  const cm = read(join(JS, 'country-metrics.js'));
  ok(/dataCache/.test(cm) && /dataInflight/.test(cm), 'country-metrics dedup intact');
  const prof = read(join(JS, 'profile.js'));
  ok(/publicProfileInflight/.test(prof), 'public-profile dedup intact');
}

/* 6. Article wiring (M56) + map aria-busy (M57) */
console.log('== 6. M56/M57 invariants ==');
{
  const articles = readdirSync(join(ROOT, 'articles')).filter(f => f.endsWith('.html'));
  let allOK = true;
  for (const f of articles) {
    const html = read(join(ROOT, 'articles', f));
    if (!/session-store\.js/.test(html) || !/tldr\.js/.test(html)) allOK = false;
  }
  ok(allOK, 'all article pages retain session-store.js + tldr.js');
  const map = read(join(JS, 'europe-map.js'));
  ok((map.match(/removeAttribute\('aria-busy'\)/g) || []).length >= 2, 'map clears aria-busy on success + error');
}

/* 7. No render-time global subscription */
console.log('== 7. No render-time global subscription ==');
{
  const prof = read(join(JS, 'profile.js'));
  const rsStart = prof.indexOf('function renderAccountSync');
  const rsEnd = prof.indexOf('\n  function ', rsStart + 10);
  const rsBody = prof.slice(rsStart, rsEnd > 0 ? rsEnd : rsStart + 900);
  ok(!/onStatusChange|onAuthChange/.test(rsBody), 'renderAccountSync does not subscribe');
  const journey = read(join(JS, 'journey.js'));
  ok((journey.match(/bindMissionCards\(\);/g) || []).length === 1, 'bindMissionCards called once');
}

console.log(`\n--- M58 FRONTEND PASS: ${passed} passed, ${failed} failed ---`);
process.exit(failed === 0 ? 0 : 1);
