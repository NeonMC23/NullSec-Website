/**
 * NullSec — M56 frontend feature integrity & wiring (STATIC).
 *
 * Locks the concrete M56 fixes:
 *   1. Every article page loads session-store.js (fixes the
 *      "ReferenceError: SessionStore is not defined" console error caused by
 *      recovery-key.js / auth-service.js referencing SessionStore at load).
 *   2. Every article page loads tldr.js (restores the TL;DR toggle feature:
 *      .tldr-content is max-height:0 until .tldr.open is toggled; tldr.js is the
 *      only handler that toggles it).
 *   3. Article pages load tldr.js exactly once (no duplication).
 *   4. Lazy Fuse search init remains intact (M55).
 *   5. No duplicate script references introduced.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'assets/js');

let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error('  ✗ ' + msg); } }
function read(p) { return readFileSync(p, 'utf8'); }

// Discover article pages.
const articleFiles = readdirSync(join(ROOT, 'articles')).filter(f => f.endsWith('.html'));

/* 1. Every article page loads session-store.js */
console.log('== 1. session-store loaded on all article pages ==');
{
  let allLoaded = true, anyDup = false;
  for (const f of articleFiles) {
    const html = read(join(ROOT, 'articles', f));
    const count = (html.match(/session-store\.js/g) || []).length;
    if (count === 0) allLoaded = false;
    if (count > 1) anyDup = true;
  }
  ok(allLoaded, 'every article page loads session-store.js (' + articleFiles.length + ' pages)');
  ok(!anyDup, 'no article page loads session-store.js more than once');
}

/* 2. Every article page loads tldr.js exactly once */
console.log('== 2. tldr.js loaded on all article pages ==');
{
  let allLoaded = true, anyDup = false;
  for (const f of articleFiles) {
    const html = read(join(ROOT, 'articles', f));
    const count = (html.match(/tldr\.js/g) || []).length;
    if (count === 0) allLoaded = false;
    if (count > 1) anyDup = true;
  }
  ok(allLoaded, 'every article page loads tldr.js (' + articleFiles.length + ' pages)');
  ok(!anyDup, 'no article page loads tldr.js more than once');
  // tldr.js exists and toggles .tldr.open (the mechanism CSS relies on).
  const tldr = read(join(JS, 'tldr.js'));
  ok(/classList\.toggle\('open'\)/.test(tldr), 'tldr.js toggles .tldr.open (drives max-height reveal)');
}

/* 3. tldr.js exposes a working init and binds listeners */
console.log('== 3. tldr.js wiring ==');
{
  const tldr = read(join(JS, 'tldr.js'));
  ok(/initTldr/.test(tldr), 'tldr.js defines initTldr');
  ok(/addEventListener\('click'/.test(tldr), 'tldr.js binds click handlers');
  ok(/querySelectorAll\('\.tldr'\)/.test(tldr), 'tldr.js targets .tldr elements');
}

/* 4. Lazy Fuse search init intact (M55) */
console.log('== 4. Lazy search init intact ==');
{
  const search = read(join(JS, 'search.js'));
  const initBody = search.slice(search.indexOf('function init()'), search.indexOf('\n  }\n', search.indexOf('function init()')) + 5);
  ok(!/loadSearchIndex\(\)/.test(initBody), 'init() does NOT eagerly build search index');
  ok(/if \(!fuseInstance\) loadSearchIndex\(\);/.test(search), 'search index loads lazily on open');
}

/* 5. No duplicate script references on article pages */
console.log('== 5. No duplicate script references ==');
{
  let dupFound = false;
  for (const f of articleFiles) {
    const html = read(join(ROOT, 'articles', f));
    const scripts = html.match(/src="\.\.\/assets\/js\/[^"]+\.js"/g) || [];
    const seen = {};
    for (const s of scripts) { if (seen[s]) dupFound = true; seen[s] = true; }
  }
  ok(!dupFound, 'no article page loads the same JS file twice');
}

console.log(`\n--- M56 FRONTEND PASS: ${passed} passed, ${failed} failed ---`);
process.exit(failed === 0 ? 0 : 1);
