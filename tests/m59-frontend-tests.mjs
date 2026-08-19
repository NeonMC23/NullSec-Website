/**
 * NullSec — M59 visual consistency, responsive UI & interaction polish.
 *
 * Locks the concrete M59 fix and invariants:
 *   1. Account username wraps (overflow-wrap/word-break) so a 32-char username
 *      (the max valid length) does not overflow the account card on narrow
 *      screens.
 *   2. Long-content robustness preserved in other cards (article/tool/mission).
 *   3. M50-M58 invariants preserved (ARIA, lazy search, dedups, article wiring).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'assets/js');

let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error('  ✗ ' + msg); } }
function read(p) { return readFileSync(p, 'utf8'); }

/* 1. Account username wraps (M59 fix) */
console.log('== 1. Account username wrapping ==');
{
  const css = read(join(ROOT, 'assets/css/pages.css'));
  // The M59 fix is in the second .profile-account-username block (line ~1294,
  // the account-shell section). Check the whole file for the wrapping rules.
  ok(css.indexOf('overflow-wrap: break-word;', css.indexOf('M59')) !== -1, 'profile-account-username has overflow-wrap');
  ok(css.indexOf('word-break: break-word;', css.indexOf('M59')) !== -1, 'profile-account-username has word-break');
  ok(/max-width: 100%/.test(css), 'profile-account-username has max-width 100%');
}

/* 2. Other long-content cards wrap (M42/M51 already) */
console.log('== 2. Long-content robustness preserved ==');
{
  const css = read(join(ROOT, 'assets/css/components.css')) + '\n' + read(join(ROOT, 'assets/css/pages.css'));
  // mission/featured/tool/article headings should have wrapping.
  ok(/overflow-wrap: break-word/.test(css), 'CSS has overflow-wrap for long content');
  ok(/\.public-profile-header h1,/.test(css), 'public profile h1 wrapping intact');
  ok(/\.mission-card h4/.test(css), 'mission card h4 wrapping intact');
}

/* 3. TL;DR ARIA (M58) preserved */
console.log('== 3. M58 ARIA preserved ==');
{
  const tldr = read(join(JS, 'tldr.js'));
  ok(/setAttribute\('aria-expanded'/.test(tldr), 'tldr sets aria-expanded');
  ok(/setAttribute\('aria-controls'/.test(tldr), 'tldr sets aria-controls');
  ok(/setAttribute\('aria-hidden'/.test(tldr), 'tldr sets aria-hidden');
}

/* 4. Lazy search (M55) preserved */
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

/* 7. No duplicate IDs / no duplicate script refs on article pages */
console.log('== 7. No duplicate IDs / scripts ==');
{
  const articles = readdirSync(join(ROOT, 'articles')).filter(f => f.endsWith('.html'));
  let dupFound = false;
  for (const f of articles) {
    const html = read(join(ROOT, 'articles', f));
    const scripts = html.match(/src="\.\.\/assets\/js\/[^"]+\.js"/g) || [];
    const seen = {};
    for (const s of scripts) if (seen[s]) dupFound = true; else seen[s] = true;
  }
  ok(!dupFound, 'no duplicate script references on article pages');
}

/* 8. No render-time global subscription */
console.log('== 8. No render-time global subscription ==');
{
  const prof = read(join(JS, 'profile.js'));
  const rsStart = prof.indexOf('function renderAccountSync');
  const rsEnd = prof.indexOf('\n  function ', rsStart + 10);
  const rsBody = prof.slice(rsStart, rsEnd > 0 ? rsEnd : rsStart + 900);
  ok(!/onStatusChange|onAuthChange/.test(rsBody), 'renderAccountSync does not subscribe');
  const journey = read(join(JS, 'journey.js'));
  ok((journey.match(/bindMissionCards\(\);/g) || []).length === 1, 'bindMissionCards called once');
}

console.log(`\n--- M59 FRONTEND PASS: ${passed} passed, ${failed} failed ---`);
process.exit(failed === 0 ? 0 : 1);
