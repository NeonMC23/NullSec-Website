/**
 * NullSec — M57 frontend resilience, error states & UX state integrity.
 *
 * Locks the concrete M57 fixes and invariants:
 *   1. Europe map clears aria-busy on BOTH success and error paths (no permanent
 *      "busy" state for assistive technology if the SVG fails to load).
 *   2. Existing resilience invariants remain:
 *      - data-loader inflight is cleared in finally (retry possible after failure)
 *      - community/loading/error/empty states render fallback on failure
 *      - journey/tools show explicit error on data-load failure
 *      - search index lazy
 *      - M53/M54/M56 invariants (country-metrics dedup, public-profile dedup,
 *        session-store + tldr on article pages)
 *   3. No render-time global subscription leaks.
 *   4. No duplicate script references on article pages.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'assets/js');

let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error('  ✗ ' + msg); } }
function read(p) { return readFileSync(p, 'utf8'); }

/* 1. Map aria-busy reset on success + error */
console.log('== 1. Map aria-busy lifecycle ==');
{
  const map = read(join(JS, 'europe-map.js'));
  // Success path clears aria-busy.
  ok(/removeAttribute\('aria-busy'\)/.test(map), 'map clears aria-busy on success');
  // Error path (catch + !src) must also clear aria-busy (M57 fix).
  const catchBlock = map.slice(map.indexOf('.catch(function ()'));
  ok(catchBlock.includes("removeAttribute('aria-busy')"), 'map clears aria-busy on error (catch)');
  const noSrc = map.slice(map.indexOf("if (!src)"));
  ok(noSrc.includes("removeAttribute('aria-busy')"), 'map clears aria-busy when SVG parse fails (!src)');
  // The error path also removes the loading class.
  ok(catchBlock.includes("elRemoveClass(svg, 'europe-map--loading')"), 'map removes loading class on error');
}

/* 2. data-loader finally clears inflight (retry possible) */
console.log('== 2. data-loader inflight cleared ==');
{
  const dl = read(join(JS, 'data-loader.js'));
  ok(/\.finally\(function \(\) \{/.test(dl), 'data-loader has finally block');
  ok(/delete inflight\[name\]/.test(dl), 'data-loader deletes inflight on completion (success or failure)');
}

/* 3. Community error/loading/empty states */
console.log('== 3. Community states ==');
{
  const c = read(join(JS, 'community.js'));
  ok(/function loadingEl/.test(c), 'community has loadingEl');
  ok(/function errorEl/.test(c), 'community has errorEl');
  ok(/function emptyEl/.test(c), 'community has emptyEl');
  ok(/Activity map could not be loaded/.test(c), 'map error fallback message present');
  ok(/Activity data unavailable/.test(c), 'data unavailable fallback present');
}

/* 4. Journey/Tools explicit errors on load failure */
console.log('== 4. Journey/Tools error states ==');
{
  const journey = read(join(JS, 'journey.js'));
  ok(/Could not load the Learning Journey/.test(journey), 'journey shows explicit error on load failure');
  const tools = read(join(JS, 'tools.js'));
  ok(/Could not load the Tools Library/.test(tools), 'tools shows explicit error on load failure');
}

/* 5. Lazy search index (M55) + no duplicate */
console.log('== 5. Lazy search init ==');
{
  const search = read(join(JS, 'search.js'));
  const initBody = search.slice(search.indexOf('function init()'), search.indexOf('\n  }\n', search.indexOf('function init()')) + 5);
  ok(!/loadSearchIndex\(\)/.test(initBody), 'init() does NOT eagerly build search index');
  ok(/if \(!fuseInstance\) loadSearchIndex\(\);/.test(search), 'search index lazy on open');
}

/* 6. Country-metrics + public-profile dedup (M53/M54) */
console.log('== 6. Dedup invariants ==');
{
  const cm = read(join(JS, 'country-metrics.js'));
  ok(/dataCache/.test(cm) && /dataInflight/.test(cm), 'country-metrics dedup intact');
  const prof = read(join(JS, 'profile.js'));
  ok(/publicProfileInflight/.test(prof), 'public-profile dedup intact');
}

/* 7. Article pages retain session-store.js + tldr.js (M56) */
console.log('== 7. Article wiring (M56) ==');
{
  const articles = readdirSync(join(ROOT, 'articles')).filter(f => f.endsWith('.html'));
  let allOK = true;
  for (const f of articles) {
    const html = read(join(ROOT, 'articles', f));
    if (!/session-store\.js/.test(html) || !/tldr\.js/.test(html)) allOK = false;
    const scripts = html.match(/src="\.\.\/assets\/js\/[^"]+\.js"/g) || [];
    const seen = {};
    for (const s of scripts) if (seen[s]) { allOK = false; break; } else seen[s] = true;
  }
  ok(allOK, 'all article pages retain session-store.js + tldr.js, no duplicate scripts');
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

/* 9. Public profile graceful handling */
console.log('== 9. Public profile error state ==');
{
  const pp = read(join(JS, 'public-profile.js'));
  ok(/renderError/.test(pp), 'public-profile has renderError');
  ok(/Could not load this public profile/.test(pp), 'public-profile shows error on load failure');
  ok(/Public profiles are unavailable/.test(pp), 'public-profile shows unavailable state');
}

console.log(`\n--- M57 FRONTEND PASS: ${passed} passed, ${failed} failed ---`);
process.exit(failed === 0 ? 0 : 1);
