/**
 * NullSec — M47 canonical deployment system tests.
 *
 * Two layers:
 *   (1) STATIC  — structure/security assertions on deploy.sh, apply-sql.sh and
 *                 the GitHub Actions workflow.
 *   (2) BEHAVIOR — runs deploy.sh against a MOCK Supabase Management API server
 *                 (local HTTP) on a temporary copy of the repo, verifying:
 *                   - missing env → fail closed
 *                   - missing migration dir → fail
 *                   - invalid filename / duplicate migration number → fail
 *                     BEFORE any API call
 *                   - API HTTP failure → fail, sanitized error, no token leak
 *                   - success path → exit 0, applies every migration + RPC +
 *                     privileges in deterministic order, runs verification
 *
 * No production credentials are used. The Management API is mocked.
 */
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SCRIPTS = path.join(ROOT, 'backend/supabase/scripts');
const MIG = path.join(ROOT, 'backend/supabase/migrations');
const FN = path.join(ROOT, 'backend/supabase/functions');
const WF = path.join(ROOT, '.github/workflows/supabase-deploy.yml');

let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error('  ✗ ' + msg); } }
function trim(x) { return String(x || '').trim(); }

const RPC_FILES = [
  'rpc_auth.sql', 'rpc_sync.sql', 'rpc_activity.sql', 'rpc_tool_activity.sql',
  'rpc_profile.sql', 'rpc_activity_event.sql', 'rpc_country_metrics.sql',
  'rpc_public_profile.sql', 'rpc_update_public_profile.sql',
];
const MIG_FILES = fs.readdirSync(MIG).filter(f => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();

/* ===================================================================== *
 * STATIC LAYER
 * ===================================================================== */
console.log('== 1. Static: deploy.sh structure & security ==');
{
  const d = fs.readFileSync(path.join(SCRIPTS, 'deploy.sh'), 'utf8');
  ok(/set -Eeuo pipefail/.test(d), 'deploy.sh uses set -Eeuo pipefail');
  ok(/\[1\/4\] Preflight/.test(d), 'phase [1/4] Preflight label present');
  ok(/\[2\/4\] Migrations/.test(d), 'phase [2/4] Migrations label present');
  ok(/\[3\/4\] RPC functions \+ privileges/.test(d), 'phase [3/4] RPC+privileges label present');
  ok(/\[4\/4\] Verification/.test(d), 'phase [4/4] Verification label present');
  ok(!/set -x/.test(d), 'deploy.sh does NOT use set -x');
  ok(!/\$\{?SUPABASE_SERVICE_KEY/.test(d), 'deploy.sh never expands/uses the service-role key as a credential');
  ok(!/\$\{?SUPABASE_ANON_KEY/.test(d), 'deploy.sh never expands/uses the anon key as a credential');
  ok(/SUPABASE_ACCESS_TOKEN:/.test(d), 'deploy.sh requires SUPABASE_ACCESS_TOKEN');
  ok(/SUPABASE_PROJECT_REF:/.test(d), 'deploy.sh requires SUPABASE_PROJECT_REF');
  ok(/SUPABASE_API_BASE_URL:-https:\/\/api\.supabase\.com/.test(d), 'deploy.sh defaults API base to api.supabase.com');
  ok(/database\/query/.test(d) || /apply-sql\.sh/.test(d), 'deploy.sh deploys via Management API helper');
  ok(/verify_count/.test(d), 'deploy.sh has a post-deployment verification step');
  ok(!/=eyJ[^ ]+|service_role\s*=|sbp_[A-Za-z0-9]+/.test(d), 'no literal secret in deploy.sh');
  ok(!/echo "?\$SUPABASE_ACCESS_TOKEN/.test(d), 'deploy.sh never echoes the access token');
}

console.log('== 2. Static: apply-sql.sh structure & security ==');
{
  const a = fs.readFileSync(path.join(SCRIPTS, 'apply-sql.sh'), 'utf8');
  ok(/set -Eeuo pipefail/.test(a), 'apply-sql.sh uses set -Eeuo pipefail');
  ok(/SUPABASE_API_BASE_URL:-https:\/\/api\.supabase\.com/.test(a), 'apply-sql.sh defaults API base');
  ok(/Authorization: Bearer \$\{ACCESS_TOKEN\}/.test(a), 'token only in Authorization header');
  ok(!/echo.*ACCESS_TOKEN|printf.*ACCESS_TOKEN/.test(a), 'apply-sql.sh never echoes the token');
  ok(/APPLY_SQL_PRINT/.test(a), 'apply-sql.sh supports PRINT mode (verification)');
  ok(/exit 1/.test(a), 'apply-sql.sh exits non-zero on failure');
}

console.log('== 3. Static: workflow is minimal & calls deploy.sh ==');
{
  const w = fs.readFileSync(WF, 'utf8');
  ok(/secrets\.SUPABASE_ACCESS_TOKEN/.test(w), 'workflow uses SUPABASE_ACCESS_TOKEN secret');
  ok(/secrets\.SUPABASE_PROJECT_REF/.test(w), 'workflow uses SUPABASE_PROJECT_REF secret');
  ok(/bash backend\/supabase\/scripts\/deploy\.sh/.test(w), 'workflow calls the canonical deploy.sh');
  ok(/permissions:\s*\n\s*contents: read/.test(w), 'workflow uses minimal contents: read permission');
  ok(!/CREATE TABLE|ALTER TABLE|rpc_privileges|INSERT INTO/.test(w), 'workflow contains no SQL deployment logic');
  ok(!/=eyJ|service_role|sbp_/.test(w), 'no literal secret in workflow');
}

console.log('== 4. Static: executable bit recorded in git ==');
{
  const stage = spawnSync('git', ['ls-files', '--stage', 'backend/supabase/scripts/'], { cwd: ROOT, encoding: 'utf8' });
  const out = stage.stdout || '';
  ok(/100755 .*\tbackend\/supabase\/scripts\/apply-sql\.sh/.test(out), 'apply-sql.sh is 100755 in git');
  ok(/100755 .*\tbackend\/supabase\/scripts\/deploy\.sh/.test(out), 'deploy.sh is 100755 in git');
}

/* ===================================================================== *
 * BEHAVIOR LAYER — mock Management API
 * ===================================================================== */

function startMock({ failAt = 0, failStatus = 400, failBody = {} } = {}) {
  const received = [];
  let requestCount = 0;
  const countFor = (sql) => {
    if (/ns_create_session/.test(sql) && /proacl/.test(sql)) return 1;
    if (/ns_register/.test(sql) && /proconfig/.test(sql)) return 1;
    if (/v_country_metrics/.test(sql) && /attnum/.test(sql)) return 7;
    if (/public_profile_enabled/.test(sql) && /user_profiles/.test(sql)) return 1;
    if (/identity_id/.test(sql) && /is_nullable/.test(sql)) return 1;
    if (/relrowsecurity/.test(sql) && /count/.test(sql)) return 17;
    if (/proname like 'ns%'/.test(sql)) return 20;
    return 0;
  };
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && /\/database\/query$/.test(req.url)) {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        requestCount++;
        let sql = '';
        try { sql = JSON.parse(body).query || ''; } catch { /* ignore */ }
        received.push(sql);
        if (failAt > 0 && requestCount === failAt) {
          res.writeHead(failStatus, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(failBody));
          return;
        }
        if (/select count\(/i.test(sql)) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify([{ c: countFor(sql) }]));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('[]');
        }
      });
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{}');
    }
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      resolve({
        port: server.address().port,
        received,
        get requestCount() { return requestCount; },
        close: () => new Promise(r => server.close(r)),
      });
    });
  });
}

function buildTempRepo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nsdeploy-'));
  const sup = path.join(tmp, 'backend', 'supabase');
  const scripts = path.join(sup, 'scripts');
  const mig = path.join(sup, 'migrations');
  const fn = path.join(sup, 'functions');
  fs.mkdirSync(scripts, { recursive: true });
  fs.mkdirSync(mig, { recursive: true });
  fs.mkdirSync(fn, { recursive: true });
  fs.copyFileSync(path.join(SCRIPTS, 'deploy.sh'), path.join(scripts, 'deploy.sh'));
  fs.copyFileSync(path.join(SCRIPTS, 'apply-sql.sh'), path.join(scripts, 'apply-sql.sh'));
  for (const f of MIG_FILES) fs.copyFileSync(path.join(MIG, f), path.join(mig, f));
  for (const f of fs.readdirSync(FN).filter(f => f.endsWith('.sql'))) fs.copyFileSync(path.join(FN, f), path.join(fn, f));
  return { tmp, deployPath: path.join(scripts, 'deploy.sh'), migDir: mig };
}

// Async spawn so the in-process mock server's event loop can respond while
// deploy.sh runs (spawnSync would block it).
function runDeploy(deployPath, env) {
  return new Promise((resolve) => {
    const child = spawn('bash', [deployPath], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code, signal) => resolve({ status: code, signal, stdout: out, stderr: err }));
  });
}

function cleanup(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } }

const TOKEN = 'test-token-secret-12345';
const baseEnv = () => ({ SUPABASE_ACCESS_TOKEN: TOKEN, SUPABASE_PROJECT_REF: 'testref' });

// ---- missing env ----
console.log('== 5. Behavior: missing required env fails closed ==');
{
  const rp = buildTempRepo();
  const r1 = await runDeploy(rp.deployPath, { SUPABASE_PROJECT_REF: 'testref' });
  ok(r1.status !== 0, 'missing SUPABASE_ACCESS_TOKEN → non-zero exit');
  ok(/SUPABASE_ACCESS_TOKEN/.test(r1.stderr + r1.stdout), 'missing token is named in output');

  const r2 = await runDeploy(rp.deployPath, { SUPABASE_ACCESS_TOKEN: TOKEN });
  ok(r2.status !== 0, 'missing SUPABASE_PROJECT_REF → non-zero exit');
  ok(/SUPABASE_PROJECT_REF/.test(r2.stderr + r2.stdout), 'missing ref is named in output');
  cleanup(rp.tmp);
}

// ---- missing migration directory ----
console.log('== 6. Behavior: missing migration dir fails before API ==');
{
  const rp = buildTempRepo();
  fs.rmSync(rp.migDir, { recursive: true, force: true });
  const mock = await startMock();
  const r = await runDeploy(rp.deployPath, { ...baseEnv(), SUPABASE_API_BASE_URL: 'http://127.0.0.1:' + mock.port });
  ok(r.status !== 0, 'missing migrations dir → non-zero exit');
  ok(/migrations directory missing/.test(r.stdout + r.stderr), 'clear message about migrations dir');
  ok(mock.requestCount === 0, 'no API call made before preflight failure');
  await mock.close();
  cleanup(rp.tmp);
}

// ---- duplicate migration numbers ----
console.log('== 7. Behavior: duplicate migration numbers fail before API ==');
{
  const rp = buildTempRepo();
  fs.writeFileSync(path.join(rp.migDir, '0001_duplicate.sql'), '-- dup\n');
  const mock = await startMock();
  const r = await runDeploy(rp.deployPath, { ...baseEnv(), SUPABASE_API_BASE_URL: 'http://127.0.0.1:' + mock.port });
  ok(r.status !== 0, 'duplicate migration number → non-zero exit');
  ok(/duplicate migration number/.test(r.stdout + r.stderr), 'duplicate detected message');
  ok(mock.requestCount === 0, 'no API call made on duplicate detection');
  await mock.close();
  cleanup(rp.tmp);
}

// ---- invalid filename ----
console.log('== 8. Behavior: invalid migration filename fails before API ==');
{
  const rp = buildTempRepo();
  fs.writeFileSync(path.join(rp.migDir, 'README.sql'), '-- readme\n');
  const mock = await startMock();
  const r = await runDeploy(rp.deployPath, { ...baseEnv(), SUPABASE_API_BASE_URL: 'http://127.0.0.1:' + mock.port });
  ok(r.status !== 0, 'invalid migration filename → non-zero exit');
  ok(/invalid migration filename/.test(r.stdout + r.stderr), 'invalid filename detected');
  ok(mock.requestCount === 0, 'no API call made on invalid filename');
  await mock.close();
  cleanup(rp.tmp);
}

// ---- API HTTP failure ----
console.log('== 9. Behavior: API failure → sanitized error, fail closed ==');
{
  const rp = buildTempRepo();
  const mock = await startMock({ failAt: 1, failStatus: 400, failBody: { message: 'mock api error', code: 'P0001' } });
  const r = await runDeploy(rp.deployPath, { ...baseEnv(), SUPABASE_API_BASE_URL: 'http://127.0.0.1:' + mock.port });
  const out = r.stdout + r.stderr;
  ok(r.status !== 0, 'API failure → non-zero exit');
  ok(/\[1\/4\] Preflight/.test(out) && /\[2\/4\] Migrations/.test(out), 'phase labels present before failure');
  ok(/mock api error/.test(out), 'sanitized API error message surfaced');
  ok(!out.includes(TOKEN), 'deployment token NOT leaked in output on failure');
  await mock.close();
  cleanup(rp.tmp);
}

// ---- success path ----
console.log('== 10. Behavior: success path (deterministic order + verification) ==');
{
  const rp = buildTempRepo();
  const mock = await startMock();
  const r = await runDeploy(rp.deployPath, { ...baseEnv(), SUPABASE_API_BASE_URL: 'http://127.0.0.1:' + mock.port });
  const out = r.stdout + r.stderr;
  ok(r.status === 0, 'success path exits 0 (status=' + r.status + ')');
  ok(/\[1\/4\]/.test(out) && /\[2\/4\]/.test(out) && /\[3\/4\]/.test(out) && /\[4\/4\]/.test(out), 'all four phases ran');
  ok(/completed successfully/.test(out), 'success message printed only on full success');
  ok(!out.includes(TOKEN), 'deployment token NOT leaked on success');

  const received = mock.received;
  // 1 (drop view) + 19 migrations + 9 rpc + 1 privileges = 30 appliers, then 7 verification queries.
  ok(received.length === 37, 'received ' + received.length + ' requests (expect 30 appliers + 7 verification)');
  if (received.length >= 30) {
    const appliers = received.slice(0, 30);
    ok(/DROP VIEW IF EXISTS public\.v_country_metrics/.test(appliers[0]), 'first applier is the v_country_metrics cleanup');

    // migrations exactly once, in numeric order
    const migSeq = appliers.slice(1, 1 + MIG_FILES.length);
    const migContent = MIG_FILES.map(f => trim(fs.readFileSync(path.join(MIG, f), 'utf8')));
    const seqTrim = migSeq.map(trim);
    ok(JSON.stringify(seqTrim) === JSON.stringify(migContent), 'all 19 migrations applied exactly once, in numeric order');

    // RPC files present (each exactly once) after migrations
    const rpcSeq = appliers.slice(1 + MIG_FILES.length, 1 + MIG_FILES.length + RPC_FILES.length).map(trim);
    const rpcContent = RPC_FILES.map(f => trim(fs.readFileSync(path.join(FN, f), 'utf8')));
    ok(JSON.stringify(rpcSeq) === JSON.stringify(rpcContent), 'all 9 RPC functions applied exactly once, in stable order');

    // privileges last among appliers
    ok(/REVOKE EXECUTE ON FUNCTION/.test(appliers[29]), 'rpc_privileges.sql applied last (after all RPC)');

    // verification queries (7)
    const ver = received.slice(30);
    ok(ver.length === 7 && ver.every(q => /select count\(/i.test(q)), '7 read-only verification queries run');
  }
  await mock.close();
  cleanup(rp.tmp);
}

console.log(`\n--- M47 DEPLOYMENT SYSTEM: ${passed} passed, ${failed} failed ---`);
process.exit(failed === 0 ? 0 : 1);
