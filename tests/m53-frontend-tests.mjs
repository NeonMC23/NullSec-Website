/**
 * NullSec — M53 performance / loading UX / runtime efficiency (STATIC).
 *
 * Verifies the concrete M53 changes:
 *   1. No external Google Fonts: tokens.css has no @import URL, and no page has
 *      a font preconnect link (privacy-first, local-first — third-party font
 *      requests removed).
 *   2. country-metrics dedup/cache: getData() caches + dedupes concurrent calls
 *      so the community page no longer fires 4 duplicate ns_country_metrics
 *      requests.
 *   3. Map lifecycle invariants preserved (loading state, aria-busy, aspect-ratio).
 *   4. No duplicate map initialization path introduced.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['index','journey','community','profile','public-profile','articles','tools','contribute','about'];

let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error('  ✗ ' + msg); } }
function read(p) { return readFileSync(p, 'utf8'); }

/* 1. External fonts removed */
console.log('== 1. No external Google Fonts ==');
{
  const tokens = read(join(ROOT, 'assets/css/tokens.css'));
  ok(!/fonts\.googleapis|fonts\.gstatic|@import/.test(tokens), 'tokens.css has no external font @import');
  ok(/--font-body:\s*-apple-system/.test(tokens), 'body font uses system stack');
  ok(/--font-heading:\s*ui-sans-serif/.test(tokens), 'heading font uses system stack');
  ok(/--font-code:\s*ui-monospace/.test(tokens), 'code font uses system monospace stack');
  // No page has font preconnect.
  let anyPreconnect = false;
  for (const pg of PAGES) if (/fonts\.googleapis|fonts\.gstatic/.test(read(join(ROOT, pg + '.html')))) anyPreconnect = true;
  ok(!anyPreconnect, 'no page has font preconnect links');
}

/* 2. country-metrics dedup/cache */
console.log('== 2. Country metrics dedup/cache ==');
{
  const cm = read(join(ROOT, 'assets/js/country-metrics.js'));
  ok(/dataCache/.test(cm), 'country metrics has a result cache');
  ok(/dataInflight/.test(cm), 'country metrics dedupes concurrent calls (shared in-flight)');
  ok(/if \(dataCache\) return Promise\.resolve\(dataCache\)/.test(cm), 'getData returns cached result');
  ok(/if \(dataInflight\) return dataInflight/.test(cm), 'getData reuses in-flight request');
  ok(/clearCache/.test(cm), 'clearCache exposed for explicit refresh');
  // The community page still calls getData (unchanged call sites) but now shares one fetch.
  const community = read(join(ROOT, 'assets/js/community.js'));
  ok((community.match(/CountryMetrics\.getData\(\)/g) || []).length >= 3, 'community still has multiple getData call sites (now deduped)');
}

/* 3. Map lifecycle preserved */
console.log('== 3. Map lifecycle preserved ==');
{
  const pagesCss = read(join(ROOT, 'assets/css/pages.css'));
  ok(/aspect-ratio: 1613 \/ 1417/.test(pagesCss), 'map aspect-ratio reserved');
  ok(/europe-map--loading/.test(pagesCss), 'map loading-state CSS present');
  const map = read(join(ROOT, 'assets/js/europe-map.js'));
  ok(/aria-busy/.test(map), 'map sets aria-busy');
  ok(/europe-map--loading/.test(map), 'map uses loading class');
  // Exactly one load entry point (the call site, not the definition).
  const callSites = (map.match(/loadRealSvg\(svg, opts\s*\)/g) || []).length;
  ok(callSites === 1, 'map has exactly one loadRealSvg call site');
}

/* 4. No duplicate fetch of map asset registered */
console.log('== 4. Map asset single fetch ==');
{
  const dl = read(join(ROOT, 'assets/js/data-loader.js'));
  ok(/loadEuropeMap/.test(dl), 'data-loader exposes loadEuropeMap');
  // The map SVG is fetched via the deduped Data loader (cache/inflight), not raw fetch.
  const map = read(join(ROOT, 'assets/js/europe-map.js'));
  ok(/Data\.loadEuropeMap/.test(map), 'map loads via Data loader (cached, single fetch)');
}

/* 5. No external CSS/JS introduced */
console.log('== 5. No new external dependency ==');
{
  const css = read(join(ROOT, 'assets/css/tokens.css'));
  ok(!/url\(['"]?https?:\/\//.test(css), 'no external url() in tokens.css');
}

console.log(`\n--- M53 FRONTEND PASS: ${passed} passed, ${failed} failed ---`);
process.exit(failed === 0 ? 0 : 1);
