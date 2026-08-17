/**
 * NullSec — Real browser (Chromium via Playwright) static-site validation.
 *
 * Scope: guest-flow navigation, internal-link integrity, mission modal
 * behaviour, focus/escape semantics, and responsive (no horizontal overflow)
 * on the STATIC frontend served over HTTP.
 *
 * NOTE: This is LOCAL STATIC validation (no Supabase backend). Any result here
 * is labelled "STATIC / LOCAL", not production.
 *
 * Usage: node tests/browser-validation.cjs <baseUrl>
 */
'use strict';

const { chromium } = require('playwright');
const http = require('http');

const BASE = process.argv[2] || 'http://127.0.0.1:8000/';
const PAGES = [
  'index.html', 'journey.html', 'tools.html', 'articles.html',
  'community.html', 'about.html', 'contribute.html', 'profile.html',
  'public-profile.html',
];

// Domains we intentionally ignore (external links that need network/CDN).
const IGNORE_HOSTS = [
  'discord.com', 'github.com', 'githubusercontent.com', 'fonts.', 'googleapis.com',
];
const IGNORE_REQUEST = (url) => {
  try { return IGNORE_HOSTS.some((h) => url.host.includes(h)); }
  catch { return false; }
};

const results = [];
let pass = 0, fail = 0;
const check = (name, ok, detail) => {
  if (ok) pass++; else fail++;
  results.push(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

function assertHtmlHttpStatus(browser) {
  return new Promise((resolve, reject) => {
    const seen = new Set();
    const req = http.request(new URL(BASE), (res) => {
      const { statusCode } = res;
      res.resume();
      resolve(statusCode);
    });
    req.on('error', reject);
    req.end();
  });
}

async function collectInternalLinks(page, origin) {
  return page.evaluate((base) => {
    const links = Array.from(document.querySelectorAll('a[href]'));
    const out = [];
    for (const a of links) {
      const href = a.getAttribute('href') || '';
      if (!href || href.startsWith('#') || href.startsWith('mailto:') ||
          href.startsWith('tel:') || href.startsWith('javascript:') ||
          href.startsWith('http://') || href.startsWith('https://')) continue;
      const full = new URL(href, base);
      if (full.origin !== new URL(base).origin) continue;
      out.push(full.pathname + (full.search || ''));
    }
    return out;
  }, origin);
}

async function run() {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  const http4xx = [];

  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('requestfailed', (r) => {
    if (!IGNORE_REQUEST(new URL(r.url()))) failedRequests.push(r.url());
  });
  page.on('response', (r) => {
    const url = new URL(r.url());
    if (IGNORE_REQUEST(url)) return;
    if (url.origin === new URL(BASE).origin && r.status() >= 400) http4xx.push(`${r.status()} ${r.url()}`);
  });

  // ---------- Landing page ----------
  check('Landing index.html loads (HTTP 200)', (await assertHtmlHttpStatus(browser)) === 200, String(await assertHtmlHttpStatus(browser)));
  await page.goto(BASE + 'index.html', { waitUntil: 'load', timeout: 30000 });
  check('Landing has navbar brand', await page.locator('.navbar-brand').count() > 0);
  check('Landing has CTA', await page.locator('a.btn-primary, .btn-primary').count() > 0);

  // ---------- Internal link integrity across all pages ----------
  let totalLinks = 0, broken = [];
  for (const p of PAGES) {
    const r = await page.goto(BASE + p, { waitUntil: 'load', timeout: 30000 });
    if (!r || r.status() >= 400) { broken.push(`${p} (HTTP ${r ? r.status() : 'ERR'})`); continue; }
    const links = await collectInternalLinks(page, BASE + p);
    totalLinks += links.length;
    for (const l of links) {
      const res = await page.request.get(BASE + l.replace(/^\//, ''));
      if (res.status() >= 400) broken.push(`${p} -> ${l} (${res.status()})`);
    }
  }
  check(`No broken internal links (${totalLinks} links checked)`, broken.length === 0, broken.slice(0, 5).join(', '));

  // ---------- Guest flow navigation ----------
  for (const p of PAGES) {
    const r = await page.goto(BASE + p, { waitUntil: 'load', timeout: 30000 });
    check(`Guest navigates ${p} (HTTP<400)`, r && r.status() < 400, r ? String(r.status()) : 'ERR');
  }

  // ---------- Journey + mission modal ----------
  await page.goto(BASE + 'journey.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(600);
  const missionCards = await page.locator('.mission-card[data-mission-id]').count();
  check('Journey renders mission cards', missionCards > 0, `count=${missionCards}`);
  if (missionCards > 0) {
    const firstId = await page.locator('.mission-card[data-mission-id]').first().getAttribute('data-mission-id');
    await page.locator('.mission-card[data-mission-id]').first().click();
    await page.waitForTimeout(300);
    const modalOpen = await page.locator('.modal-overlay.open').count();
    check('Click mission card opens modal', modalOpen > 0);
    check('Modal has aria-modal=true', (await page.locator('.modal-overlay[aria-modal="true"]').count()) > 0);
    check('Modal has role=dialog', (await page.locator('.modal-overlay[role="dialog"]').count()) > 0);

    // Focus behavior: focus should move into the dialog (close button).
    const focused = await page.evaluate(() => document.activeElement && document.activeElement.className && String(document.activeElement.className));
    check('Focus moved into modal on open', !!focused && focused.indexOf('modal-close') !== -1, `active=${focused}`);

    // Escape closes.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check('Escape closes modal', (await page.locator('.modal-overlay.open').count()) === 0);

    // Reopen + prev/next navigation within campaign.
    // NOTE: `weekly-community` is intentionally excluded from the campaign
    // sequence (it has no prev/next). Use a regular campaign mission here.
    await page.locator('.mission-card[data-mission-id]:not([data-mission-id="weekly-community"])').first().click();
    await page.waitForTimeout(300);
    const hasNav = await page.locator('.modal-mission-nav').count();
    const hasNext = await page.locator('.modal-mission-nav button').count() > 0;
    check('Modal exposes prev/next nav (campaign mission)', hasNav > 0 && hasNext, `nav=${hasNav}`);

    // Close via close button.
    await page.locator('.modal-overlay .modal-close').first().click();
    await page.waitForTimeout(300);
    check('Close button closes modal', (await page.locator('.modal-overlay.open').count()) === 0);

    // Body scroll should be restored after close.
    const overflow = await page.evaluate(() => document.body.style.overflow);
    check('Body overflow restored after close', overflow === '', `overflow="${overflow}"`);
  }

  // ---------- Community page (offline/static) ----------
  await page.goto(BASE + 'community.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(500);
  check('Community page renders without console-breaking error', consoleErrors.length === 0);

  // ---------- Responsive (mobile) no horizontal overflow ----------
  const overflowPages = [];
  for (const p of PAGES) {
    await page.setViewportSize({ width: 375, height: 740 });
    await page.goto(BASE + p, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(250);
    const { sw, iw } = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
    }));
    if (sw > iw + 1) overflowPages.push(`${p}(sw=${sw},iw=${iw})`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  check('No horizontal overflow at mobile width (375px)', overflowPages.length === 0, overflowPages.join(', '));

  // ---------- Narrow desktop / tablet ----------
  const tabletOverflow = [];
  for (const p of PAGES) {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(BASE + p, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(200);
    const { sw, iw } = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
    }));
    if (sw > iw + 1) tabletOverflow.push(`${p}(sw=${sw},iw=${iw})`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  check('No horizontal overflow at tablet width (768px)', tabletOverflow.length === 0, tabletOverflow.join(', '));

  // ---------- Search overlay opens ----------
  await page.goto(BASE + 'index.html', { waitUntil: 'load', timeout: 30000 });
  await page.click('#search-btn').catch(() => {});
  await page.waitForTimeout(200);
  const searchOpen = await page.evaluate(() => document.querySelector('#search-overlay') ? getComputedStyle(document.querySelector('#search-overlay')).display !== 'none' : false);
  check('Search overlay opens', searchOpen);

  // ---------- Long user-text wrapping (real browser, synthetic content) ----------
  // Inject a long username/bio/interests into the public-profile container to
  // verify the CSS long-content safety actually prevents horizontal overflow.
  await page.setViewportSize({ width: 375, height: 740 });
  await page.goto(BASE + 'public-profile.html', { waitUntil: 'load', timeout: 30000 });
  await page.evaluate(() => {
    const c = document.getElementById('public-profile');
    if (!c) return;
    const long = 'x'.repeat(80);
    // Match the real render structure: h1 lives inside .public-profile-header.
    const header = document.createElement('div');
    header.className = 'public-profile-header';
    header.appendChild(Object.assign(document.createElement('h1'), { textContent: '@' + long }));
    const b = document.createElement('p');
    b.className = 'public-profile-bio';
    b.textContent = 'bio '.repeat(60);
    const tags = document.createElement('div');
    tags.className = 'public-profile-interests';
    tags.appendChild(Object.assign(document.createElement('span'), { className: 'public-profile-interest', textContent: 'interest-' + long }));
    c.appendChild(header); c.appendChild(b); c.appendChild(tags);
  });
  await page.waitForTimeout(300);
  const longOverflow = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
  }));
  check('Long username/bio/interests wrap without horizontal overflow', longOverflow.sw <= longOverflow.iw + 1, `sw=${longOverflow.sw},iw=${longOverflow.iw}`);
  await page.setViewportSize({ width: 1280, height: 900 });

  // ---------- Console / page errors ----------
  check('No uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 5).join(' | '));
  check('No console errors', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | '));
  check('No failed resource requests (same-origin)', failedRequests.length === 0, failedRequests.slice(0, 5).join(' | '));
  check('No HTTP 4xx/5xx same-origin responses', http4xx.length === 0, http4xx.slice(0, 5).join(' | '));

  await browser.close();

  console.log(results.join('\n'));
  console.log(`\n--- REAL BROWSER (STATIC/LOCAL) — ${pass} passed, ${fail} failed ---`);
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((e) => {
  console.error('BROWSER VALIDATION CRASHED:', e);
  console.log(results.join('\n'));
  console.log(`\n--- REAL BROWSER (STATIC/LOCAL) — ${pass} passed, ${fail} failed ---`);
  process.exit(1);
});
