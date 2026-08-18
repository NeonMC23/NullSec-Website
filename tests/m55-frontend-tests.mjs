/**
 * NullSec — M55 frontend runtime cost / loading efficiency (STATIC + source).
 *
 * Verifies the concrete M55 change:
 *   1. Fuse/search index is built LAZILY (only when search opens), not eagerly
 *      at DOMContentLoaded on every page. This avoids fetching articles.json +
 *      building the Fuse index on pages that never open search (about, tools,
 *      contribute, public-profile, etc.).
 *   2. The lazy path in openSearch() is preserved (search still works).
 *   3. Required global infrastructure (nav/theme/session/auth) remains loaded.
 *   4. No render-time global subscription leaks.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'assets/js');

let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error('  ✗ ' + msg); } }
function read(p) { return readFileSync(p, 'utf8'); }

/* 1. Lazy Fuse index */
console.log('== 1. Lazy search index ==');
{
  const search = read(join(JS, 'search.js'));
  // init() must NOT eagerly call loadSearchIndex(); the lazy path lives in openSearch().
  const initBody = search.slice(search.indexOf('function init()'), search.indexOf('\n  }\n', search.indexOf('function init()')) + 5);
  ok(!/loadSearchIndex\(\)/.test(initBody), 'init() does NOT eagerly build the search index');
  ok(/function init\(\) {\s*\n\s*bindEvents\(\);\s*\n\s*\}/.test(search), 'init() only binds events');
  // openSearch() must lazily load the index when opened.
  const openBody = search.slice(search.indexOf('function openSearch'), search.indexOf('\n  }\n', search.indexOf('function openSearch')) + 5);
  ok(/if \(!fuseInstance\) loadSearchIndex\(\);/.test(openBody), 'search index loads lazily on open');
  ok(/loadSearchIndex/.test(search), 'loadSearchIndex still defined');
  ok(/new Fuse/.test(search), 'Fuse instantiation still present');
}

/* 2. Required global infrastructure remains */
console.log('== 2. Global infrastructure preserved ==');
{
  // Nav, theme, session, auth still eager-init (needed on every page).
  const nav = read(join(JS, 'navigation.js'));
  const theme = read(join(JS, 'theme.js'));
  const session = read(join(JS, 'session-service.js'));
  const auth = read(join(JS, 'auth-service.js'));
  ok(/function init\(\)/.test(nav) && nav.includes("init();"), 'navigation still initializes');
  ok(/restore\(\);/.test(session), 'session restore still runs at load');
  ok(/window\.Auth/.test(auth), 'auth service exposed');
}

/* 3. Page-specific modules remain page-scoped */
console.log('== 3. Page-specific modules page-scoped ==');
{
  const files = ['home.js','articles.js','tools.js','community.js','europe-map.js','country-metrics.js'];
  const expectOnly = { 'home.js':'index', 'articles.js':'articles', 'tools.js':'tools', 'community.js':'community', 'europe-map.js':'community', 'country-metrics.js':'community' };
  for (const f of files) {
    const page = expectOnly[f];
    const html = read(join(ROOT, page + '.html'));
    ok(new RegExp(f).test(html), f + ' loaded on ' + page);
    // not loaded on all 9 (should be page-specific) — spot-check a non-owner page
    const other = (page==='index')?'about':(page==='articles'?'about':(page==='tools'?'about':(page==='community'?'about':'index')));
    const otherHtml = read(join(ROOT, other + '.html'));
    ok(!new RegExp(f).test(otherHtml), f + ' NOT loaded on ' + other + ' (page-specific)');
  }
}

/* 4. No render-time global subscription */
console.log('== 4. No render-time global subscription ==');
{
  const prof = read(join(JS, 'profile.js'));
  const rsStart = prof.indexOf('function renderAccountSync');
  const rsEnd = prof.indexOf('\n  function ', rsStart + 10);
  const rsBody = prof.slice(rsStart, rsEnd > 0 ? rsEnd : rsStart + 900);
  ok(!/onStatusChange|onAuthChange/.test(rsBody), 'renderAccountSync does not subscribe');
  ok((prof.match(/wireSyncStatus\(\);/g) || []).length === 1, 'wireSyncStatus called once');
  const journey = read(join(JS, 'journey.js'));
  ok((journey.match(/bindMissionCards\(\);/g) || []).length === 1, 'bindMissionCards called once');
}

/* 5. Search lazy-load not duplicated */
console.log('== 5. No duplicate search init ==');
{
  const search = read(join(JS, 'search.js'));
  // init() should run once (DOMContentLoaded or immediate), and loadSearchIndex called
  // from openSearch only (not from init).
  const initCalls = (search.match(/init\(\);/g) || []).length;
  ok(initCalls <= 2, 'init() self-invocation not duplicated (module + DOMContentLoaded guard)');
  // loadSearchIndex must be called from exactly one place in the active path (openSearch).
  const lsiCalls = (search.match(/loadSearchIndex\(\);/g) || []).length;
  ok(lsiCalls === 1, 'loadSearchIndex called from exactly one site (openSearch, lazy)');
}

console.log(`\n--- M55 FRONTEND PASS: ${passed} passed, ${failed} failed ---`);
process.exit(failed === 0 ? 0 : 1);
