/**
 * NullSec — M60 frontend reliability, state consistency & regression audit.
 *
 * Locks the two concrete M60 fixes and their invariants:
 *   1. (F1) Community participation panel reflects the real authenticated
 *      state AND the selected country:
 *        - reads the authoritative country from CountryRepository.getCountry()
 *          (server-rehydrated) instead of CountryService.getState() (whose
 *          selectedCode is only populated on the Account page);
 *        - re-renders on Auth.onAuthChange, on Session.ensureRestored() and on
 *          Sync 'synced' so an authenticated user never sees the stale guest
 *          message after a refresh.
 *   2. (F2) No Google Fonts preconnect/link remains in ANY html page (the 14
 *      article pages still had fonts.googleapis/gstatic preconnects that
 *      M53's main-page cleanup missed — they open an unnecessary external
 *      connection to a third party).
 * Plus the M50–M59 regression invariants remain intact.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'assets/js');

let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error('  ✗ ' + msg); } }
function read(p) { return readFileSync(p, 'utf8'); }

/* 1. F1 — community participation uses CountryRepository (authoritative) */
console.log('== 1. Community participation reads authoritative country ==');
{
  const com = read(join(JS, 'community.js'));
  const rp = com.slice(com.indexOf('function renderParticipation()'));
  ok(/CountryRepository\.getCountry/.test(rp), 'renderParticipation reads CountryRepository.getCountry()');
  ok(!/CountryService\.getState\(\)/.test(rp), 'renderParticipation no longer reads CountryService.getState()');
  ok(/CountryMetrics\.getCountry/.test(rp), 'renderParticipation resolves the country name via CountryMetrics');
}

/* 2. F1 — community re-renders participation on auth/session/sync change */
console.log('== 2. Community re-renders participation on state change ==');
{
  const com = read(join(JS, 'community.js'));
  const initBody = com.slice(com.indexOf('function init()'), com.indexOf('if (document.readyState'));
  ok(/Auth\.onAuthChange\(renderParticipation\)/.test(initBody), 'init subscribes Auth.onAuthChange -> renderParticipation');
  ok(/Session\.ensureRestored\(\)\.then\(renderParticipation\)/.test(initBody), 'init re-renders after Session.ensureRestored');
  ok(/Sync\.onStatusChange/.test(initBody) && /'synced'/.test(initBody), 'init re-renders participation on Sync synced');
  // Must not subscribe multiple times (only one init).
  ok((com.match(/function init\(\)/) || []).length === 1, 'community.js has exactly one init()');
}

/* 3. F2 — zero Google Fonts references in ANY html page */
console.log('== 3. Zero Google Fonts references (preconnect removed) ==');
{
  const pages = readdirSync(ROOT).filter(f => f.endsWith('.html'));
  const articles = readdirSync(join(ROOT, 'articles')).filter(f => f.endsWith('.html'));
  const all = pages.concat(articles.map(f => 'articles/' + f));
  let bad = [];
  for (const f of all) {
    const html = read(join(ROOT, f));
    if (/fonts\.googleapis|fonts\.gstatic/.test(html)) bad.push(f);
  }
  ok(bad.length === 0, 'no html page references Google Fonts (preconnect/link/import) — ' + (bad.length ? bad.join(',') : 'all clean'));
}

/* 4. M53 — zero Google Fonts in CSS */
console.log('== 4. Zero Google Fonts in CSS ==');
{
  let found = [];
  for (const f of readdirSync(join(ROOT, 'assets/css'))) {
    if (!f.endsWith('.css')) continue;
    const css = read(join(ROOT, 'assets/css', f));
    if (/fonts\.googleapis|fonts\.gstatic/.test(css)) found.push(f);
  }
  ok(found.length === 0, 'no CSS references Google Fonts — ' + (found.length ? found.join(',') : 'clean'));
}

/* 5. M50 — country persistence invariant preserved */
console.log('== 5. Country persistence (M50) preserved ==');
{
  const cr = read(join(JS, 'repositories/country-repository.js'));
  ok(/rehydrate/.test(cr), 'country-repository rehydrate present');
  ok(/country_code: ''/.test(cr), "removeCountry clears via empty-string sentinel");
  const cs = read(join(JS, 'country-service.js'));
  ok(/never inferred/.test(cs) || /Never inferred/.test(cs), 'country-service documents no inference');
  ok(/\^\[A-Z\]\{2\}\$/.test(cs), 'country code validated as ISO alpha-2');
}

/* 6. M51/M59 — responsive + username wrapping preserved */
console.log('== 6. Responsive & username wrapping preserved ==');
{
  const css = read(join(ROOT, 'assets/css/pages.css'));
  ok(/overflow-wrap: break-word/.test(css), 'username wrapping (M59) preserved');
  const layout = read(join(ROOT, 'assets/css/layout.css'));
  ok(/\.europe-map/.test(read(join(ROOT, 'assets/css/pages.css'))) || /\.europe-map/.test(layout), 'europe map CSS preserved');
}

/* 7. M53/M54/M55 — dedups + lazy search preserved */
console.log('== 7. Dedup + lazy search preserved ==');
{
  const cm = read(join(JS, 'country-metrics.js'));
  ok(/dataCache/.test(cm) && /dataInflight/.test(cm), 'country-metrics dedup intact (M53)');
  const prof = read(join(JS, 'profile.js'));
  ok(/publicProfileInflight/.test(prof), 'public-profile dedup intact (M54)');
  const search = read(join(JS, 'search.js'));
  ok(/if \(!fuseInstance\) loadSearchIndex\(\);/ .test(search), 'search index lazy (M55)');
  const dl = read(join(JS, 'data-loader.js'));
  ok(/inflight/.test(dl) && /cache/.test(dl), 'data-loader cache/inflight intact');
}

/* 8. M56/M57/M58 — wiring, map aria-busy, TL;DR aria preserved */
console.log('== 8. M56/M57/M58 invariants preserved ==');
{
  const articles = readdirSync(join(ROOT, 'articles')).filter(f => f.endsWith('.html'));
  let allOK = true;
  for (const f of articles) {
    const html = read(join(ROOT, 'articles', f));
    if (!/session-store\.js/.test(html) || !/tldr\.js/.test(html)) allOK = false;
  }
  ok(allOK, 'all articles retain session-store.js + tldr.js (M56)');
  const map = read(join(JS, 'europe-map.js'));
  ok((map.match(/removeAttribute\('aria-busy'\)/g) || []).length >= 2, 'map clears aria-busy on success + error (M57)');
  const tldr = read(join(JS, 'tldr.js'));
  ok(/aria-expanded/.test(tldr) && /aria-controls/.test(tldr) && /aria-hidden/.test(tldr), 'TL;DR ARIA intact (M58)');
}

/* 9. Compatibility stubs preserved */
console.log('== 9. style.css / v2.css stubs preserved ==');
{
  const a = read(join(ROOT, 'assets/css/style.css'));
  const b = read(join(ROOT, 'assets/css/v2.css'));
  ok(a.length > 0 && b.length > 0, 'style.css + v2.css stubs exist');
}

/* 10. F3 — homepage Home nav link is highlighted (active navigation state) */
console.log('== 10. Navigation active-state consistency (F3) ==');
{
  const nav = read(join(JS, 'navigation.js'));
  const hl = nav.slice(nav.indexOf('function highlightActiveLink'));
  // The fix canonicalises the homepage path + the Home link so the homepage
  // (pathname /index.html, Home href "./") is matched and highlighted.
  ok(/\'\/index\.html\'|path = \'\/\'/.test(nav), 'navigation.js canonicalises homepage path');
  ok(/linkPath = '\/'/.test(hl), 'navigation.js canonicalises the Home link href to /');
  // Old endsWith comparison logic preserved (still highlights relative page links).
  ok(/path\.endsWith\(linkPath\)/.test(hl), 'navigation.js still uses endsWith for relative page links');
}

console.log(`\n--- M60 FRONTEND PASS: ${passed} passed, ${failed} failed ---`);
process.exit(failed === 0 ? 0 : 1);
