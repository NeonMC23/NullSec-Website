/**
 * NullSec — Milestone 44 (Deployment Readiness Toolkit & Production Handoff).
 * ------------------------------------------------------------------
 * Category: LOCAL / STATIC (no real Supabase, no real browser).
 *
 * Validates the deployment-readiness CONTRACT (not a fake Supabase deploy):
 *   - required deployment files exist;
 *   - migration sequence 0001→0019;
 *   - RPC inventory + deployment order;
 *   - production config contract (public-only injection, flags off by default);
 *   - forbidden secret patterns (values never printed);
 *   - no service-role frontend path;
 *   - deployment scripts fail-fast on missing prerequisites;
 *   - documentation references the correct architecture (no stale "100% static /
 *     local progression" claims);
 *   - no accidental social-network terminology;
 *   - preflight tool exists and runs.
 */
import { makeHarness, LOAD_ORDER, ok, eq, summary } from './run-tests.mjs';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const JS = join(ROOT, 'assets/js');

/* ================================================================== */
console.log('== 1. Required deployment files exist (STATIC) ==')
{
  const files = [
    'backend/supabase/migrations/0001_schema.sql',
    'backend/supabase/migrations/0018_public_profile.sql',
    'backend/supabase/functions/rpc_privileges.sql',
    'backend/supabase/scripts/deploy.sh',
    'backend/supabase/scripts/apply-sql.sh',
    'assets/js/config.js',
    'assets/js/api-client.js',
    '.github/workflows/supabase-deploy.yml',
    'tests/preflight-production.mjs'
  ];
  for (const f of files) ok(existsSync(join(ROOT, f)), f + ' exists');
}

/* ================================================================== */
console.log('== 2. Migration sequence 0001..0019 (STATIC) ==')
{
  const migs = readdirSync(join(ROOT, 'backend/supabase/migrations'))
    .filter(f => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
  const nums = migs.map(f => parseInt(f.slice(0, 4), 10));
  ok(nums.length === 19, '19 migrations present');
  ok(nums[0] === 1 && nums[nums.length - 1] === 19, 'spans 0001..0019');
  ok(new Set(nums).size === 19, 'no duplicate migration numbers');
  const sorted = nums.slice().sort((a, b) => a - b);
  ok(nums.join(',') === sorted.join(','), 'numerically ordered');
  let gaps = [];
  for (let i = 0; i < nums.length - 1; i++) if (nums[i + 1] !== nums[i] + 1) gaps.push(nums[i] + 1);
  ok(gaps.length === 0, 'no gaps in sequence');
}

/* ================================================================== */
console.log('== 3. RPC inventory + deployment order (STATIC) ==')
{
  const deploy = readFileSync(join(ROOT, 'backend/supabase/scripts/deploy.sh'), 'utf8');
  const code = deploy.replace(/#[^\n]*/g, '');
  // 9 function files + privileges.
  const rpcFiles = readdirSync(join(ROOT, 'backend/supabase/functions')).filter(f => f.endsWith('.sql'));
  ok(rpcFiles.length === 10, '10 RPC .sql files (9 functions + privileges)');
  const deployRPCs = (code.match(/rpc_[a-z_]+\.sql/g) || []).filter(f => f !== 'rpc_privileges.sql');
  ok(deployRPCs.length === 9, 'deploy.sh covers all 9 function files');
  ok(rpcFiles.every(f => f === 'rpc_privileges.sql' || code.indexOf(f) !== -1),
    'every function file is referenced in deploy.sh');
  // Order: migrations -> RPC -> privileges.
  ok(code.indexOf('migrations') < code.indexOf('rpc_'), 'migrations before RPC');
  ok(code.indexOf('rpc_') < code.indexOf('rpc_privileges.sql'), 'RPC before privileges');
  ok(code.indexOf('rpc_privileges.sql') > code.lastIndexOf('for f in'), 'privileges applied after RPC loop');
}

/* ================================================================== */
console.log('== 4. Production config contract (STATIC) ==')
{
  const config = readFileSync(join(JS, 'config.js'), 'utf8');
  ok(/__NULLSEC_SUPABASE__/.test(config), 'uses __NULLSEC_SUPABASE__ injection');
  ok(/supabaseEnabled:\s*false/.test(config), 'supabaseEnabled off by default');
  ok(/authEnabled:\s*false/.test(config), 'authEnabled off by default');
  ok(/backendEnabled:\s*false/.test(config), 'backendEnabled off by default');
  ok(/syncEnabled:\s*false/.test(config), 'syncEnabled off by default');
  ok(!/service[-_]role\s*[:=]/.test(config), 'no service-role assignment in config');
  ok(/only url \+ anonKey are consumed/i.test(config), 'consumes only public url+anonKey');
  // api-client must not hardcode Supabase secrets.
  const api = readFileSync(join(JS, 'api-client.js'), 'utf8');
  ok(!/https:\/\/[a-z0-9-]+\.supabase\.co/.test(api), 'api-client has no hardcoded Supabase URL');
  ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(api), 'api-client has no hardcoded token');
}

/* ================================================================== */
console.log('== 5. No service-role / secret in frontend (STATIC) ==')
{
  const frontendFiles = ['config.js', 'api-client.js', 'auth-service.js', 'session-store.js',
    'profile.js', 'journey.js', 'public-profile.js', 'community.js'];
  for (const f of frontendFiles) {
    const src = readFileSync(join(JS, f), 'utf8');
    ok(!/service_role\s*[:=]|service-role\s*[:=]|sb_secret/.test(src), f + ' has no service-role assignment');
    ok(!/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(src), f + ' has no JWT token');
  }
}

/* ================================================================== */
console.log('== 6. Deployment scripts fail-safe (STATIC) ==')
{
  for (const s of ['deploy.sh', 'apply-sql.sh']) {
    const src = readFileSync(join(ROOT, 'backend/supabase/scripts', s), 'utf8');
    ok(/set -euo pipefail/.test(src), s + ' uses set -euo pipefail');
    ok(/SUPABASE_ACCESS_TOKEN/.test(src), s + ' references access token');
    ok(/SUPABASE_PROJECT_REF/.test(src), s + ' references project ref');
    ok(/exit 1/.test(src), s + ' fails with non-zero');
    ok(!/echo.*ACCESS_TOKEN|printf.*ACCESS_TOKEN/.test(src), s + ' never echoes token');
  }
  ok(/SUPABASE_ACCESS_TOKEN:\?/.test(readFileSync(join(ROOT, 'backend/supabase/scripts/deploy.sh'), 'utf8')),
    'deploy.sh fails fast if access token missing');
}

/* ================================================================== */
console.log('== 7. Preflight tool runs (LOCAL) ==')
{
  // Run the preflight via child process and assert it exits 0.
  const { execFileSync } = await import('node:child_process');
  let exitOk = false;
  try {
    execFileSync('node', [join(ROOT, 'tests/preflight-production.mjs')], { stdio: 'pipe' });
    exitOk = true;
  } catch (e) {
    exitOk = false;
  }
  ok(exitOk, 'tests/preflight-production.mjs exits 0 (PASS)');
}

/* ================================================================== */
console.log('== 8. Documentation reflects current architecture (STATIC) ==')
{
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  ok(!/100% static — no backend, no database/.test(readme), 'README no longer claims no backend');
  ok(!/Progress saved locally/.test(readme), 'README no longer says progress saved locally');
  ok(/server-backed/.test(readme), 'README mentions server-backed progression');
  ok(/not yet deployed/.test(readme), 'README notes backend is prepared but not deployed');
  const deployDoc = existsSync(join(ROOT, 'docs/production-deployment.md'));
  ok(deployDoc, 'docs/production-deployment.md exists');
  const valDoc = existsSync(join(ROOT, 'docs/production-validation.md'));
  ok(valDoc, 'docs/production-validation.md exists');
  const browserDoc = existsSync(join(ROOT, 'docs/browser-validation.md'));
  ok(browserDoc, 'docs/browser-validation.md exists');
}

/* ================================================================== */
console.log('== 9. No social terminology (STATIC) ==')
{
  const socialRe = /\b(follow|follower|following|friends?|like|comments?|direct message|\bdm\b|social feed|timeline|leaderboard|user directory)\b\s*[:=(]/i;
  for (const f of ['journey.js', 'profile.js', 'public-profile.js', 'community.js']) {
    const src = readFileSync(join(JS, f), 'utf8');
    const code = src.replace(/\/\/.*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    ok(!socialRe.test(code), f + ' has no implemented social features');
  }
}

/* ================================================================== */
console.log('== 10. Storage contract unchanged (STATIC) ==')
{
  const store = readFileSync(join(JS, 'store.js'), 'utf8');
  const keysBlock = store.slice(store.indexOf('KEYS = {'), store.indexOf('};', store.indexOf('KEYS = {'))).replace(/\/\/[^\n]*/g, '');
  ok(/THEME/.test(keysBlock) && !/username|profile|progress|password|token/.test(keysBlock),
    'store.js KEYS unchanged (theme/migration only)');
  const ss = readFileSync(join(JS, 'session-store.js'), 'utf8');
  ok(/RECOVERY: 'ns:session:recovery'/.test(ss) && /AUTH: 'ns:session:auth'/.test(ss),
    'sessionStorage keys unchanged');
}

const exitCode = summary() ? 0 : 1;
process.exit(exitCode);
