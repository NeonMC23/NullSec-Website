/**
 * NullSec — REAL BROWSER + REAL SUPABASE end-to-end validation.
 *
 * Drives the actual frontend UI in Chromium (via Playwright) against a
 * locally-served copy of the site configured to point at the REAL Supabase
 * project (url + anon key = public). Exercises the full account flow:
 *
 *   guest -> create account -> signed-in -> complete a mission ->
 *   verify progression persisted server-side -> logout -> login again ->
 *   verify progression remains (PROGRESS != LOCAL DATA).
 *
 * IMPORTANT: requires the site to be served from a PRODUCTION-CONFIGURED copy
 * (config.js with supabaseEnabled/authEnabled/backendEnabled/syncEnabled=true
 * and real supabaseUrl + supabaseAnonKey). This is a REAL validation tool; the
 * results here are real-browser + real-backend, NOT mocked.
 *
 * Usage: node tests/browser-e2e.cjs <baseUrl>
 */
'use strict';

const { chromium } = require('playwright');
const crypto = require('crypto');

const BASE = process.argv[2] || 'http://127.0.0.1:8001/';
const USR = 'e2e_' + Math.random().toString(36).slice(2, 9).replace(/[^a-z0-9]/g, '');
const PWD = 'E2e_Strong!' + crypto.randomBytes(4).toString('hex');
const PWD2 = 'E2e_Changed!' + crypto.randomBytes(4).toString('hex');

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log((ok ? '  PASS' : '  FAIL') + '  ' + name + (detail ? '  [' + detail + ']' : ''));
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const consoleErrors = [];
  const pageErrors = [];
  const dialogs = [];
  const http4xx = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  page.on('dialog', async (d) => { dialogs.push(d.message()); await d.accept(); });
  page.on('response', (r) => { if (r.status() >= 400) http4xx.push(r.status() + ' ' + r.url().replace('https://kjgzfxviopkpykkowdbj.supabase.co','<SB>').replace('http://127.0.0.1:8001','')); });

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // ---------- Create account via real UI ----------
  await page.goto(BASE + 'profile.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(800);

  // The "Create account" card is the 2nd .auth-form-card inside .profile-auth-forms
  const createCard = page.locator('.profile-auth-forms .auth-form-card').nth(1);
  check('Create-account card rendered', await createCard.count() > 0);
  const inputs = createCard.locator('input');
  await inputs.nth(0).fill(USR);     // Username
  await inputs.nth(1).fill(PWD);     // Password
  await inputs.nth(2).fill(PWD);     // Confirm password
  await createCard.locator('button[type="submit"], button.btn-primary').last().click();
  await sleep(2500);

  const signedIn = await page.locator('.auth-signed-in').count() > 0;
  check('Account created + signed in (real UI + real backend)', signedIn);

  // ---------- Complete a mission on Journey ----------
  await page.goto(BASE + 'journey.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(900);
  // Open a normal campaign mission (exclude weekly-community) and complete it.
  const target = page.locator('.mission-card[data-mission-id]:not([data-mission-id="weekly-community"])').first();
  check('Journey mission card present', await target.count() > 0);
  await target.click();
  await sleep(500);
  // Modal should show "Mark as complete" (authenticated).
  const completeBtn = page.locator('.modal-actions button:has-text("Mark as complete")');
  check('Authenticated modal shows "Mark as complete"', await completeBtn.count() > 0);
  await completeBtn.click().catch(() => {});
  await sleep(1500);

  // ---------- Verify progression persisted server-side (via API) ----------
  // Read the session token from sessionStorage (the app stores ns:session:auth).
  const session = await page.evaluate(() => {
    try { return JSON.parse(sessionStorage.getItem('ns:session:auth') || '{}'); }
    catch { return {}; }
  });
  const token = session && session.token;
  check('Session token present in sessionStorage (not localStorage)', !!token);

  // Confirm NOT stored in localStorage (PROGRESS != LOCAL DATA).
  const lsKeys = await page.evaluate(() => Object.keys(localStorage).join(','));
  const localProgressLeak = /progress|missions|profile|session/i.test(lsKeys);
  check('No progression/account data in localStorage', !localProgressLeak, 'localStorage keys=' + (lsKeys || '(none)'));

  // Directly query the real backend to confirm the mission was saved.
  if (token) {
    const st = await page.evaluate(async ({ url, key, tok }) => {
      try {
        const r = await fetch(url + '/rest/v1/rpc/ns_sync_pull', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + key },
          body: JSON.stringify({ p_token: tok }),
        });
        return { status: r.status, body: await r.text() };
      } catch (e) { return { status: -1, body: String(e) }; }
    }, {
      url: 'https://kjgzfxviopkpykkowdbj.supabase.co',
      key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqZ3pmeHZpb3BrcHlra293ZGJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwMTU5MDMsImV4cCI6MjEwMTU5MTkwM30.zUMO5OBHMQX8hit54Lbv6UQz1P5SlCWNFLQbBe9g0JI',
      tok: token,
    });
    let serverMissions = [];
    try { const d = JSON.parse(st.body); serverMissions = Object.keys((d.progress && d.progress.missions) || {}); }
    catch { /* not json */ }
    check('Mission completion persisted server-side', st.status === 200 && serverMissions.length > 0, 'server missions=' + serverMissions.join(','));
  }

  // ---------- Logout ----------
  await page.goto(BASE + 'profile.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(800);
  const logoutBtn = page.locator('button:has-text("Sign out")');
  if (await logoutBtn.count() > 0) { await logoutBtn.click(); await sleep(1200); }
  const signedOut = (await page.locator('.auth-signed-in').count()) === 0;
  check('Logout removes signed-in state', signedOut);

  // ---------- Login again + verify progression remains ----------
  await page.goto(BASE + 'profile.html', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(800);
  const signCard = page.locator('.profile-auth-forms .auth-form-card').first();
  const sInputs = signCard.locator('input');
  await sInputs.nth(0).fill(USR);
  await sInputs.nth(1).fill(PWD);
  await signCard.locator('button[type="submit"], button.btn-primary').last().click();
  await sleep(2500);
  const signedInAgain = await page.locator('.auth-signed-in').count() > 0;
  check('Login again works (real UI + real backend)', signedInAgain);
  await sleep(1500); // let the app write the new session + sync

  const session2 = await page.evaluate(() => {
    try { return JSON.parse(sessionStorage.getItem('ns:session:auth') || '{}'); }
    catch { return {}; }
  });
  const hasTok2 = !!(session2 && session2.token);
  check('New session token issued after re-login', hasTok2);
  if (token && hasTok2) {
    const st2 = await page.evaluate(async ({ url, key, tok }) => {
      try {
        const r = await fetch(url + '/rest/v1/rpc/ns_sync_pull', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + key },
          body: JSON.stringify({ p_token: tok }),
        });
        return { status: r.status, body: await r.text() };
      } catch (e) { return { status: -1, body: String(e) }; }
    }, { url: 'https://kjgzfxviopkpykkowdbj.supabase.co', key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtqZ3pmeHZpb3BrcHlra293ZGJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwMTU5MDMsImV4cCI6MjEwMTU5MTkwM30.zUMO5OBHMQX8hit54Lbv6UQz1P5SlCWNFLQbBe9g0JI', tok: session2.token });
    let m2 = [];
    let stMsg = 'http' + st2.status;
    try { const d = JSON.parse(st2.body); m2 = Object.keys((d.progress && d.progress.missions) || {}); stMsg += ' missions=' + m2.join(','); } catch { stMsg += ' raw=' + String(st2.body).slice(0, 60); }
    check('Progression persists after re-login (server-authoritative)', st2.status === 200 && m2.length > 0, stMsg);
  }

  check('No uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  check('No console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  if (http4xx.length) console.log('  4xx responses observed: ' + http4xx.slice(0, 6).join(' ; '));

  await browser.close();
  console.log(`\n--- REAL E2E (Chromium + real Supabase) — ${pass} passed, ${fail} failed ---`);
  console.log('Test account (dedicated):', USR);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error('E2E CRASHED:', e); process.exit(1); });
