/**
 * NullSec — M61 account-data consistency & navigation consistency.
 *
 * Locks the concrete M61 fixes and invariants:
 *   1. (F1) Community's "Missions completed" aggregate (mission_activity via
 *      v_country_metrics) is now populated when an authenticated user completes
 *      a mission. Root cause: ns_record_activity — the token-authenticated UI
 *      pipeline used by ActivityService.record('mission_completed') — resolved
 *      the user's country server-side and bumped country_activity, but its
 *      documented contract ("mission_completed → mission_activity /
 *      country_activity") was not honoured: it never incremented
 *      mission_activity, so the Community dashboard kept showing 0. The
 *      frontend-only alternative (send the user's country through the separate
 *      ns_activity path) would double-count country_activity (both pipelines
 *      bump it) or break the existing M25 assertion that journey.js calls
 *      ActivityService.record('mission_completed', 1). We therefore fixed the
 *      backend RPC to increment mission_activity as documented, keeping a
 *      single coherent pipeline. journey.js still triggers the activity via
 *      ActivityService (M25 intact).
 *   2. (F2) The canonical primary navigation (Home, Journey, Tools, Articles,
 *      Community, About, Contribute, Account) is present on ALL root pages —
 *      About was missing from the desktop navbar on community.html and
 *      contribute.html.
 *   3. (F3) Sign out is an account ACTION placed in the actions area on
 *      desktop (not among the primary destination links) and in the mobile
 *      menu on mobile; it is excluded from active-link/aria-current marking.
 * Plus the M50–M60 regression invariants remain intact.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'assets/js');

let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error('  ✗ ' + msg); } }
function read(p) { return readFileSync(p, 'utf8'); }

/* 1. F1 — ns_record_activity populates mission_activity (backend fix) */
console.log('== 1. ns_record_activity populates mission_activity (F1) ==');
{
  const rec = read(join(ROOT, 'backend/supabase/functions/rpc_activity_event.sql'));
  const block = rec.slice(rec.indexOf('p_activity_type = \'mission_completed\''));
  ok(/INSERT INTO public\.mission_activity/.test(block), 'ns_record_activity inserts into mission_activity for mission_completed');
  ok(/ON CONFLICT \(country_code, mission_id\)/.test(block), 'mission_activity increment uses the country_code+mission_id upsert');
  ok(/country_activity/.test(block), 'ns_record_activity still bumps country_activity (no regression)');
  // The frontend UI pipeline (ActivityService → ns_record_activity) remains the single
  // mission activity path and is not double-reported.
  const journey = read(join(JS, 'journey.js'));
  ok(/ActivityService\.record\('mission_completed', 1\)/.test(journey), 'journey still triggers mission_completed via ActivityService (M25 intact)');
}

/* 2. F1 — notifyActivity (anonymous path) stays country-neutral (no double) */
console.log('== 2. Mission activity single-path (no double count) ==');
{
  // notifyActivity must NOT send the user country through the anonymous ns_activity
  // path, otherwise mission_activity/country_activity would be double-counted.
  const ps = read(join(JS, 'progress-service.js'));
  const na = ps.slice(ps.indexOf('function notifyActivity'));
  ok(!/CountryRepository/.test(na), 'notifyActivity does not read the user country (avoids double-count)');
  ok(/Sync\.reportActivity\(id, country, region\)/.test(na), 'notifyActivity still reports via Sync.reportActivity (region/challenges/global path)');
  // ActivityService.record must still exist for the other types (tool/community).
  const as = read(join(JS, 'activity-service.js'));
  ok(/VALID_TYPES/.test(as) && /'mission_completed'/.test(as), 'ActivityService still defines mission_completed type');
}

/* 3. F2 — About present on ALL root pages' desktop nav */
console.log('== 3. About present in desktop nav on all root pages (F2) ==');
{
  const roots = ['index.html','journey.html','tools.html','articles.html','community.html','about.html','contribute.html','profile.html'];
  const CANON = ['Home','Journey','Tools','Articles','Community','About','Contribute','Account'];
  let allOK = true, detail = [];
  for (const f of roots) {
    const html = read(join(ROOT, f));
    const block = html.slice(html.indexOf('<div class="navbar-links">'), html.indexOf('</div>', html.indexOf('<div class="navbar-links">')));
    const links = [...block.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g)].map(m => m[2].trim());
    const missing = CANON.filter(c => !links.includes(c));
    if (missing.length) { allOK = false; detail.push(f + ':' + missing.join(',')); }
  }
  ok(allOK, 'all root pages have the 8 canonical desktop nav links — ' + (detail.length ? detail.join(' | ') : 'OK'));
}

/* 4. F2 — community.html & contribute.html specifically include About */
console.log('== 4. community/contribute About (F2) ==');
{
  for (const f of ['community.html','contribute.html']) {
    const html = read(join(ROOT, f));
    const block = html.slice(html.indexOf('<div class="navbar-links">'), html.indexOf('</div>', html.indexOf('<div class="navbar-links">')));
    ok(/href="about\.html">About</.test(block), f + ' desktop nav includes About');
  }
}

/* 5. F3 — Sign out is an account action in the actions area, not a nav link */
console.log('== 5. Sign out placement (F3) ==');
{
  const nav = read(join(JS, 'navigation.js'));
  ok(/\.navbar-actions/.test(nav) && /insertBefore\(link, hamburger\)/.test(nav), 'navigation injects Sign out into .navbar-actions on desktop');
  ok(/\.mobile-menu/.test(nav), 'navigation still injects Sign out into the mobile menu');
  ok(/\.nav-signout/.test(nav) && /exclude the Sign out action/.test(nav), 'highlightActiveLink excludes .nav-signout from active marking');
  const css = read(join(ROOT, 'assets/css/components.css'));
  ok(/\.navbar-actions \.nav-signout/.test(css), 'CSS styles the actions-area Sign out as a distinct secondary button');
  ok(/max-width: 768px/.test(css) && css.indexOf('.nav-signout', css.indexOf('@media (max-width: 768px)')) !== -1, 'actions-area Sign out hidden on mobile (mobile menu handles it)');
}

/* 6. M60 fixes intact (participation + google fonts + nav active) */
console.log('== 6. M60 regression invariants ==');
{
  const com = read(join(JS, 'community.js'));
  ok(/CountryRepository\.getCountry/.test(com), 'community participation reads CountryRepository (M60)');
  ok(/Auth\.onAuthChange\(renderParticipation\)/.test(com), 'community re-renders participation on auth change (M60)');
  const allHtml = rootsFromDir();
  let gf = [];
  for (const f of allHtml) { if (/fonts\.googleapis|fonts\.gstatic/.test(read(join(ROOT, f)))) gf.push(f); }
  ok(gf.length === 0, 'no Google Fonts references in any html page (M60) — ' + (gf.length ? gf.join(',') : 'clean'));
  const nav = read(join(JS, 'navigation.js'));
  ok(/linkPath = '\/'/.test(nav), 'navigation canonicalises homepage link (M60 F3)');
}

function rootsFromDir() {
  const out = [];
  for (const f of readdirSync(ROOT)) if (f.endsWith('.html')) out.push(f);
  for (const f of readdirSync(join(ROOT, 'articles'))) if (f.endsWith('.html')) out.push('articles/' + f);
  return out;
}

/* 7. M50–M58 invariants */
console.log('== 7. M50–M58 invariants ==');
{
  const cr = read(join(JS, 'repositories/country-repository.js'));
  ok(/rehydrate/.test(cr), 'country rehydrate present (M50)');
  const cm = read(join(JS, 'country-metrics.js'));
  ok(/dataCache/.test(cm) && /dataInflight/.test(cm), 'country-metrics dedup intact (M53)');
  const prof = read(join(JS, 'profile.js'));
  ok(/publicProfileInflight/.test(prof), 'public-profile dedup intact (M54)');
  const search = read(join(JS, 'search.js'));
  ok(/if \(!fuseInstance\) loadSearchIndex\(\);/.test(search), 'search lazy (M55)');
  const articles = readdirSync(join(ROOT, 'articles')).filter(f => f.endsWith('.html'));
  let wiring = true;
  for (const f of articles) { const h = read(join(ROOT, 'articles', f)); if (!/session-store\.js/.test(h) || !/tldr\.js/.test(h)) wiring = false; }
  ok(wiring, 'articles retain session-store.js + tldr.js (M56)');
  const map = read(join(JS, 'europe-map.js'));
  ok((map.match(/removeAttribute\('aria-busy'\)/g) || []).length >= 2, 'map clears aria-busy (M57)');
  const tldr = read(join(JS, 'tldr.js'));
  ok(/aria-expanded/.test(tldr) && /aria-controls/.test(tldr) && /aria-hidden/.test(tldr), 'TL;DR ARIA (M58)');
}

/* 8. Compatibility stubs preserved */
console.log('== 8. Compatibility stubs preserved ==');
{
  ok(read(join(ROOT, 'assets/css/style.css')).length > 0, 'style.css stub exists');
  ok(read(join(ROOT, 'assets/css/v2.css')).length > 0, 'v2.css stub exists');
}

console.log(`\n--- M61 FRONTEND PASS: ${passed} passed, ${failed} failed ---`);
process.exit(failed === 0 ? 0 : 1);
