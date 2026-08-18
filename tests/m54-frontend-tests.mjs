/**
 * NullSec — M54 data fetching / hydration / client state efficiency (STATIC).
 *
 * Verifies the concrete M54 changes:
 *   1. Public-profile fetch is deduplicated (in-memory cache + shared in-flight
 *      request), eliminating the duplicate ns_public_profile call caused by the
 *      double render during session restore.
 *   2. M53 country-metrics dedup (dataCache/dataInflight) remains intact (no
 *      regression of the 4->1 fix).
 *   3. Data-loader cache/inflight dedup remains (articles/tools/missions JSON
 *      fetched once).
 *   4. No render-time global subscription leaks.
 *   5. Sync lifecycle fires a single syncNow per restore.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'assets/js');

let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error('  ✗ ' + msg); } }
function read(p) { return readFileSync(p, 'utf8'); }

/* 1. Public-profile dedup */
console.log('== 1. Public-profile fetch dedup ==');
{
  const prof = read(join(JS, 'profile.js'));
  ok(/publicProfileCache/.test(prof), 'public-profile in-memory cache exists');
  ok(/publicProfileInflight/.test(prof), 'public-profile in-flight dedup exists');
  ok(/if \(publicProfileCache\) \{ apply\(publicProfileCache\); return; \}/.test(prof), 'getData returns cached public profile');
  ok(/if \(publicProfileInflight\) \{/.test(prof), 'getData reuses in-flight public-profile request');
  // Exactly one ApiClient.publicProfile call site.
  const callCount = (prof.match(/ApiClient\.publicProfile\(username\)/g) || []).length;
  ok(callCount === 1, 'ApiClient.publicProfile called at exactly one site (deduped)');
}

/* 2. M53 country-metrics dedup intact */
console.log('== 2. Country-metrics dedup intact ==');
{
  const cm = read(join(JS, 'country-metrics.js'));
  ok(/dataCache/.test(cm), 'country-metrics cache present');
  ok(/dataInflight/.test(cm), 'country-metrics in-flight dedup present');
  ok(/if \(dataCache\) return Promise\.resolve\(dataCache\)/.test(cm), 'country-metrics returns cached result');
  ok(/if \(dataInflight\) return dataInflight/.test(cm), 'country-metrics reuses in-flight request');
  ok(/clearCache/.test(cm), 'country-metrics clearCache exposed');
}

/* 3. Data-loader cache/inflight */
console.log('== 3. Data-loader dedup ==');
{
  const dl = read(join(JS, 'data-loader.js'));
  ok(/let cache = \{\}/.test(dl), 'data-loader has result cache');
  ok(/let inflight = \{\}/.test(dl), 'data-loader has in-flight dedup');
  ok(/if \(name in cache\)/.test(dl), 'data-loader returns cached data');
  ok(/if \(name in inflight\)/.test(dl), 'data-loader reuses in-flight fetch');
  // Articles/tools/missions each call Data.load* once (data-loader caches).
  const articles = read(join(JS, 'articles.js'));
  const tools = read(join(JS, 'tools.js'));
  ok((articles.match(/Data\.loadArticles/g) || []).length === 1, 'articles loads data once');
  ok((tools.match(/Data\.loadTools/g) || []).length === 1, 'tools loads data once');
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
  // Journey listeners bound once at init.
  const journey = read(join(JS, 'journey.js'));
  ok((journey.match(/bindMissionCards\(\);/g) || []).length === 1, 'bindMissionCards called once');
}

/* 5. Sync lifecycle single syncNow per restore */
console.log('== 5. Sync lifecycle ==');
{
  const sess = read(join(JS, 'session-service.js'));
  ok((sess.match(/Sync\.syncNow\(\)/g) || []).length === 1, 'session restore calls syncNow exactly once');
  // Journey's onStatusChange re-renders only (no re-fetch).
  const journey = read(join(JS, 'journey.js'));
  ok(!/ApiClient\./.test(journey), 'journey does no per-render backend fetch');
}

console.log(`\n--- M54 FRONTEND PASS: ${passed} passed, ${failed} failed ---`);
process.exit(failed === 0 ? 0 : 1);
