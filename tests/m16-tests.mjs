/**
 * NullSec — Milestone 16 storage-policy test suite (LOCAL / MOCKED / STATIC).
 * Verifies the "browser is a client, not a database" architecture:
 *   - localStorage contains NO recovery key / auth state / session token /
 *     user-state account flag.
 *   - sessionStorage contains ONLY approved short-lived session data.
 *   - Offline never fabricates a local account and makes 0 backend requests.
 *   - Backend account operations flow through ApiClient.
 * Real Supabase tests remain BLOCKED (no project).
 */
import { makeHarness, LOAD_ORDER, ok, eq, summary } from './run-tests.mjs';

const BACKEND_ON = {
  offlineMode: false, backendEnabled: true, authEnabled: true, syncEnabled: true,
  supabaseEnabled: true, supabaseUrl: 'https://project.supabase.co', supabaseAnonKey: 'anon-key'
};
const BACKEND_OFF = {
  offlineMode: true, backendEnabled: false, authEnabled: false, syncEnabled: false,
  supabaseEnabled: false, supabaseUrl: null, supabaseAnonKey: null
};

function cfg(h, patch) {
  Object.assign(h.W('Config').get(), {
    offlineMode: true, authEnabled: false, backendEnabled: false, syncEnabled: false,
    supabaseEnabled: false, supabaseUrl: null, supabaseAnonKey: null
  }, patch || {});
  return h.W('Config').get();
}

function lsKeys(h) { return Object.keys(h.localBacking); }

/* ================================================================== */
console.log('== 1. localStorage storage policy (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  h.W('RecoveryKey').ensure();
  h.W('Identity').init();
  await h.W('Auth').createAccount('tester', 'password123');

  const keys = lsKeys(h).join(',');
  // No recovery key in localStorage (moved to sessionStorage in M13/M14).
  ok(!keys.includes('ns:recovery'), 'recovery key NOT in localStorage');
  ok(h.localBacking['ns:session:recovery'] !== undefined ||
     h.sessionBacking['ns:session:recovery'] !== undefined,
    'recovery key lives in session-scoped storage');
  // No authentication state flag in localStorage (M16).
  ok(!keys.includes('ns:auth'), 'no ns:auth authentication state in localStorage');
  ok(!keys.includes('ns:user:state'), 'no ns:user:state account flag in localStorage');
  // No token anywhere in localStorage.
  const allLocal = JSON.stringify(h.localBacking);
  ok(!allLocal.includes('mock-token-123') && !allLocal.includes('tok-u'),
    'no session token in localStorage');
}

/* ================================================================== */
console.log('== 2. sessionStorage only approved session data (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  h.W('RecoveryKey').ensure();
  h.W('Identity').init();
  await h.W('Auth').createAccount('tester', 'password123');

  const sessKeys = Object.keys(h.sessionBacking);
  // Only the two approved keys may exist.
  ok(sessKeys.every(k => k === 'ns:session:auth' || k === 'ns:session:recovery'),
    'sessionStorage contains only approved session keys (got: ' + sessKeys.join(',') + ')');
  // The session represents a temporary Supabase-authenticated session, never a
  // separate account: it holds a token + optional expiry metadata only.
  const session = JSON.parse(h.sessionBacking['ns:session:auth'] || '{}');
  ok(typeof session.token === 'string' && session.token.length > 0,
    'session holds a token (temporary representation of a Supabase session)');
  ok(Object.keys(session).every(k => k === 'token' || k === 'expires_at' || k === 'username'),
    'session object contains only token + optional expires_at/username (private, M32)');
}

/* ================================================================== */
console.log('== 3. Offline: no fake account, 0 backend requests (LOCAL) ==');
{
  const h = makeHarness();
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_OFF);
  h.W('RecoveryKey').ensure();
  h.resetFetch();
  await h.W('Session').forceRecheck();

  // Zero backend requests.
  eq(h.calls.fetch.filter(c => /rest\/v1/.test(c.url)).length, 0,
    '0 backend requests when Supabase disabled');
  // Auth reports backend unavailable, does not create an account.
  const res = await h.W('Auth').createAccount('tester', 'password123');
  eq(res.ok, false, 'register reports unavailable offline (no fake account)');
  ok(/authentication-unavailable-offline/.test(res.reason), 'reason is backend-unavailable');
  // No authentication flag is set.
  ok(!h.W('Auth').isAuthenticated(), 'not authenticated offline');
  // No account auth state written to localStorage.
  const keys = lsKeys(h).join(',');
  ok(!keys.includes('ns:auth'), 'no auth state written offline');
  ok(!keys.includes('ns:user:state'), 'no account flag written offline');
}

/* ================================================================== */
console.log('== 4. Backend: account ops through ApiClient (MOCKED) ==');
{
  const h = makeHarness({ backend: { register: () => ({ token: 'tok-a', user_id: 1 }) } });
  h.load(LOAD_ORDER);
  cfg(h, BACKEND_ON);
  h.W('RecoveryKey').ensure();
  h.W('Identity').init();
  await h.W('Auth').createAccount('tester', 'password123');
  ok(h.W('Auth').isAuthenticated(), 'authenticated via backend (MOCKED)');
  const calls = h.calls.fetch.map(c => c.url);
  ok(calls.some(u => /ns_register/.test(u)), 'registration went through ApiClient/RPC');
}

/* ================================================================== */
console.log('== 5. Static storage/security audit (STATIC) ==');
{
  const { readFileSync, readdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const dir = join(process.cwd(), 'assets', 'js');
  const files = readdirSync(dir).filter(f => f.endsWith('.js') && f !== 'fuse.min.js');
  let serviceKey = 0, tokenUrl = 0, pUserId = 0, rawRecovery = 0, directStore = 0;
  for (const f of files) {
    const src = readFileSync(join(dir, f), 'utf8');
    if (/SUPABASE_SERVICE_KEY|service_role|serviceRole/i.test(src)) serviceKey++;
    if (/encodeURIComponent\([^)]*token|Authorization: 'Bearer ' \+ token/.test(src)) tokenUrl++;
    if (/p_user_id/.test(src) && f !== 'sync-service.js') pUserId++;
    if (/recovery_key\s*:/.test(src) && f !== 'api-client.js') rawRecovery++;
    if (f !== 'store.js' && f !== 'session-store.js' && /window\.(localStorage|sessionStorage)/.test(src)) directStore++;
  }
  eq(serviceKey, 0, 'no service-role key in frontend (STATIC)');
  eq(tokenUrl, 0, 'no token in URL (STATIC)');
  ok(files.length > 0, 'static audit ran');
  // fetch centralized: only api-client.js and data-loader.js.
  let fetchOutside = 0;
  for (const f of files) {
    if (f !== 'api-client.js' && f !== 'data-loader.js') {
      if (/\bfetch\s*\(/.test(readFileSync(join(dir, f), 'utf8'))) fetchOutside++;
    }
  }
  eq(fetchOutside, 0, 'fetch only in api-client.js / data-loader.js (STATIC)');
}

/* ================================================================== */
console.log('== 6. Retained session mechanism rationale (STATIC) ==');
{
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const ss = readFileSync(join(process.cwd(), 'assets', 'js', 'session-store.js'), 'utf8');
  ok(/window\.sessionStorage/.test(ss), 'session-store is the single sessionStorage accessor');
  // Confirm session-store never ACCESSES localStorage (only sessionStorage).
  ok(!/window\.localStorage/.test(ss), 'session-store never accesses localStorage');
}

/* ------------------------------------------------------------------ */
const exitCode = summary() ? 0 : 1;
process.exit(exitCode);
