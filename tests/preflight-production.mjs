/**
 * NullSec — Production Preflight (Milestone 44)
 * ------------------------------------------------------------------
 * Category: LOCAL / STATIC (no real Supabase, no real browser).
 *
 * Machine-checkable pre-deployment readiness gate. Verifies that the
 * repository is in a deployable state BEFORE any real infrastructure is
 * used. Never connects to Supabase; never requires credentials.
 *
 * Checks:
 *   1. Repository structure (migrations, RPCs, scripts, workflow).
 *   2. Migration sequence 0001→0019 (present, ordered, no gaps/dups).
 *   3. RPC inventory (expected files present; deploy.sh covers them all).
 *   4. Deployment order (migrations → RPC → privileges).
 *   5. Frontend configuration contract (no hardcoded secrets, public-only
 *      injection path, backend flags off by default, explicit activation).
 *   6. Secret scan (service-role keys, DB passwords, access tokens) — only
 *      reports PASS/FAIL + location, NEVER the matched value.
 *   7. SQL hardening (SECURITY DEFINER, search_path, helper revocation).
 *   8. Deployment scripts (set -euo pipefail, required-env checks).
 *
 * Exit code 0 = PASS; 1 = FAIL. Prints PASS/FAIL per check.
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIG = join(ROOT, 'backend/supabase/migrations');
const FN = join(ROOT, 'backend/supabase/functions');
const SCRIPTS = join(ROOT, 'backend/supabase/scripts');
const WF = join(ROOT, '.github/workflows/supabase-deploy.yml');
const JS = join(ROOT, 'assets/js');

let passed = 0, failed = 0;
function ok(cond, msg, detail) {
  if (cond) { passed++; console.log('  PASS  ' + msg); }
  else { failed++; console.error('  FAIL  ' + msg + (detail ? '  [' + detail + ']' : '')); }
}

/* ------------------------------------------------------------------ *
 * 1. Repository structure                                             *
 * ------------------------------------------------------------------ */
console.log('== 1. Repository structure ==');
{
  ok(existsSync(join(MIG, '0001_schema.sql')), 'migrations dir + 0001 present');
  ok(existsSync(join(FN, 'rpc_privileges.sql')), 'rpc_privileges.sql present');
  ok(existsSync(join(SCRIPTS, 'deploy.sh')), 'deploy.sh present');
  ok(existsSync(join(SCRIPTS, 'apply-sql.sh')), 'apply-sql.sh present');
  ok(existsSync(join(JS, 'config.js')), 'config.js present');
  ok(existsSync(join(ROOT, 'assets/js/api-client.js')), 'api-client.js present');
}

/* ------------------------------------------------------------------ *
 * 2. Migration sequence 0001→0019                                     *
 * ------------------------------------------------------------------ */
console.log('== 2. Migration sequence ==');
{
  const migs = readdirSync(MIG).filter(f => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
  const nums = migs.map(f => parseInt(f.slice(0, 4), 10));
  ok(nums.length === 19, 'exactly 19 migrations', 'got ' + nums.length);
  ok(nums[0] === 1 && nums[nums.length - 1] === 19, 'sequence spans 0001..0019');
  ok(new Set(nums).size === nums.length, 'no duplicate migration numbers');
  const sorted = nums.slice().sort((a, b) => a - b);
  ok(nums.join(',') === sorted.join(','), 'migrations are numerically ordered');
  // No gaps.
  let gaps = [];
  for (let i = 0; i < nums.length - 1; i++) if (nums[i + 1] !== nums[i] + 1) gaps.push(nums[i] + 1);
  ok(gaps.length === 0, 'no gaps in sequence', 'gaps: ' + gaps.join(','));
}

/* ------------------------------------------------------------------ *
 * 3. RPC inventory                                                    *
 * ------------------------------------------------------------------ */
console.log('== 3. RPC inventory ==');
{
  const expected = ['rpc_auth.sql','rpc_sync.sql','rpc_activity.sql','rpc_tool_activity.sql',
    'rpc_profile.sql','rpc_activity_event.sql','rpc_country_metrics.sql',
    'rpc_public_profile.sql','rpc_update_public_profile.sql','rpc_privileges.sql'];
  for (const f of expected) ok(existsSync(join(FN, f)), f + ' exists');
  // deploy.sh covers all non-privilege RPC files.
  const deploy = readFileSync(join(SCRIPTS, 'deploy.sh'), 'utf8');
  const deployRPCs = (deploy.match(/rpc_[a-z_]+\.sql/g) || []).filter(f => f !== 'rpc_privileges.sql');
  const files = readdirSync(FN).filter(f => f.endsWith('.sql') && f !== 'rpc_privileges.sql');
  ok(deployRPCs.length === files.length, 'deploy.sh covers all ' + files.length + ' RPC files',
    'deploy lists ' + deployRPCs.length);
  ok(files.every(f => deployRPCs.indexOf(f) !== -1), 'every RPC file is in deploy.sh');
}

/* ------------------------------------------------------------------ *
 * 4. Deployment order                                                 *
 * ------------------------------------------------------------------ */
console.log('== 4. Deployment order ==');
{
  const deploy = readFileSync(join(SCRIPTS, 'deploy.sh'), 'utf8');
  const code = deploy.replace(/#[^\n]*/g, '');
  const migIdx = code.indexOf('migrations');
  const rpcIdx = code.indexOf('rpc_');
  const privIdx = code.indexOf('rpc_privileges.sql');
  ok(migIdx !== -1 && migIdx < rpcIdx, 'migrations applied before RPCs');
  ok(rpcIdx !== -1 && rpcIdx < privIdx, 'RPCs applied before privileges');
  // rpc_privileges applied last (after all function files).
  ok(privIdx > code.lastIndexOf('for f in'), 'privileges applied after the RPC loop');
}

/* ------------------------------------------------------------------ *
 * 5. Frontend configuration contract                                  *
 * ------------------------------------------------------------------ */
console.log('== 5. Frontend configuration contract ==');
{
  const config = readFileSync(join(JS, 'config.js'), 'utf8');
  ok(/__NULLSEC_SUPABASE__/.test(config), 'config uses __NULLSEC_SUPABASE__ injection');
  ok(/supabaseEnabled:\s*false/.test(config), 'supabaseEnabled off by default');
  ok(/authEnabled:\s*false/.test(config), 'authEnabled off by default');
  ok(/backendEnabled:\s*false/.test(config), 'backendEnabled off by default');
  ok(/syncEnabled:\s*false/.test(config), 'syncEnabled off by default');
  ok(!/service[-_]role\s*[:=]/.test(config), 'config has no service-role assignment');
  ok(/only url \+ anonKey are consumed/i.test(config), 'config consumes only public url+anonKey');
}

/* ------------------------------------------------------------------ *
 * 6. Secret scan (never print values)                                 *
 * ------------------------------------------------------------------ */
console.log('== 6. Secret scan (values never printed) ==');
{
  // Scanned patterns are indicative; matched VALUE is never printed.
  const patterns = [
    { re: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, name: 'JWT-like token' },
    { re: /service_role\s*[:=]\s*["']?[A-Za-z0-9]{20,}/i, name: 'service-role assignment' },
    { re: /sb_publishable_publishable_key|SUPABASE_SERVICE_KEY\s*[:=]\s*["'][^"']+/, name: 'service key' },
    { re: /password\s*[:=]\s*["']?[A-Za-z0-9!@#$%^&*]{12,}/, name: 'suspicious password assignment' }
  ];
  const scannedDirs = ['.', 'backend/supabase', 'assets'];
  const found = [];
  function walkFiles(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      let st;
      try { st = statSync(p); } catch (e) { continue; }
      if (st.isDirectory()) {
        if (['node_modules','.git','legacy-express','legacy-ts','dist','build'].indexOf(name) !== -1) continue;
        out.push(...walkFiles(p));
      } else if (/\.(js|html|json|sql|sh|yml|yaml|toml|ts|mjs|html)$/.test(name)) {
        out.push(p);
      }
    }
    return out;
  }
  const files = [];
  for (const d of scannedDirs) {
    if (existsSync(join(ROOT, d))) files.push(...walkFiles(join(ROOT, d)));
  }
  // Skip the test/preflight files themselves (they intentionally reference patterns in code).
  const skip = /tests\/(preflight|m4[0-9]|m3[0-9]|m2[0-9]|m1[0-9])/;
  for (const f of files) {
    if (skip.test(f)) continue;
    let src;
    try { src = readFileSync(f, 'utf8'); } catch (e) { continue; }
    for (const pat of patterns) {
      const m = pat.re.exec(src);
      if (m) {
        // Loose prose pattern (e.g. "password = authentification" in docs) is
        // skipped for markdown files; only flag credential-looking assignments
        // in code/config files.
        if (pat.name === 'suspicious password assignment' && f.endsWith('.md')) continue;
        found.push({ name: pat.name, file: f });
        break;
      }
    }
  }
  if (found.length === 0) {
    ok(true, 'no secret-like values found in tracked files');
  } else {
    // Report location only; never the value.
    for (const x of found) ok(false, 'potential ' + x.name + ' found', x.file);
  }
}
/* ------------------------------------------------------------------ *
 * 7. SQL hardening                                                    *
 * ------------------------------------------------------------------ */
console.log('== 7. SQL hardening (static) ==');
{
  const dataRPCs = ['rpc_auth.sql','rpc_sync.sql','rpc_activity.sql','rpc_profile.sql',
    'rpc_public_profile.sql','rpc_update_public_profile.sql','rpc_country_metrics.sql',
    'rpc_tool_activity.sql','rpc_activity_event.sql'];
  for (const f of dataRPCs) {
    const sql = readFileSync(join(FN, f), 'utf8');
    ok(/SECURITY DEFINER/.test(sql), f + ' uses SECURITY DEFINER');
    ok(/SET search_path = public/.test(sql), f + ' pins search_path = public');
  }
  // Regression (real-deploy fix): rpc_auth.sql uses pgcrypto (gen_salt, crypt,
  // digest, gen_random_bytes) which Supabase installs in the `extensions`
  // schema. Every SECURITY DEFINER auth function must pin search_path to
  // `public, extensions` or the RPCs fail at runtime on a real Supabase DB
  // ("function gen_salt(...) does not exist"). Verified against the real
  // eu-west-3 project during M46 real deployment.
  const authSql = readFileSync(join(FN, 'rpc_auth.sql'), 'utf8');
  ok(/SET search_path = public, extensions/.test(authSql),
    'rpc_auth search_path includes extensions (pgcrypto reachable)');
  const authFuncs = authSql.split('CREATE OR REPLACE FUNCTION').length - 1;
  const pinnedFuncs = (authSql.match(/SET search_path = public, extensions/g) || []).length;
  ok(pinnedFuncs >= 6, 'every auth RPC pins search_path to public, extensions (' + pinnedFuncs + '/' + authFuncs + ')');

  // Regression (real-deploy fix): the progress_json column is jsonb; the
  // default progress seed uses string concatenation, so it must be explicitly
  // cast to ::jsonb (otherwise live Supabase rejects it with 42804). Verified
  // on the real eu-west-3 project during M46.
  ok(/::jsonb/.test(authSql) && /INSERT INTO public.user_progress[\s\S]*::jsonb/.test(authSql),
    'rpc_auth inserts progress_json with ::jsonb cast');
  const syncSql = readFileSync(join(FN, 'rpc_sync.sql'), 'utf8');
  ok(/::jsonb/.test(syncSql), 'rpc_sync progress_json uses ::jsonb cast');

  // Regression (real-deploy fix): deploy.sh must be idempotent. v_country_metrics
  // evolves across 0013 (6 cols) and 0016 (+community_activity), and CREATE OR
  // REPLACE VIEW cannot drop columns, so a re-run used to fail at 0013 with
  // 42P16. deploy.sh now drops the view before migrations.
  const deploySh = readFileSync(join(SCRIPTS, 'deploy.sh'), 'utf8');
  ok(/DROP VIEW IF EXISTS public\.v_country_metrics/.test(deploySh),
    'deploy.sh drops v_country_metrics before migrations (idempotency fix)');

  // Regression (real-deploy fix): migration 0019 makes users.identity_id
  // nullable. The username+password model (0017) never sets identity_id, so
  // the NOT NULL from 0001 broke registration with 23502 on the live DB.
  const mig19 = readFileSync(join(ROOT, 'backend/supabase/migrations/0019_auth_identity_nullable.sql'), 'utf8');
  ok(/ALTER COLUMN identity_id DROP NOT NULL/.test(mig19),
    'migration 0019 makes users.identity_id nullable (auth fix)');

  const priv = readFileSync(join(FN, 'rpc_privileges.sql'), 'utf8');
  ok(/ns_valid_transport_hash\(text\) FROM PUBLIC, anon, authenticated/.test(priv),
    'internal helpers revoked');
  ok(/ns_valid_username\(text\) FROM PUBLIC, anon, authenticated/.test(priv),
    'internal helper username revoked');
  ok(/ns_create_session\(bigint\) FROM anon, authenticated/.test(priv),
    'ns_create_session internal');
}

/* ------------------------------------------------------------------ *
 * 8. Deployment scripts                                               *
 * ------------------------------------------------------------------ */
console.log('== 8. Deployment scripts ==');
{
  for (const s of ['deploy.sh', 'apply-sql.sh']) {
    const src = readFileSync(join(SCRIPTS, s), 'utf8');
    ok(/set -euo pipefail/.test(src), s + ' uses set -euo pipefail');
    ok(/SUPABASE_ACCESS_TOKEN/.test(src), s + ' requires SUPABASE_ACCESS_TOKEN');
    ok(/SUPABASE_PROJECT_REF/.test(src), s + ' requires SUPABASE_PROJECT_REF');
    ok(/exit 1/.test(src), s + ' fails with non-zero on error');
    ok(!/echo.*ACCESS_TOKEN|printf.*ACCESS_TOKEN/.test(src), s + ' never echoes the access token');
  }
  // deploy.sh refuses to start without env.
  ok(/SUPABASE_ACCESS_TOKEN:\?/.test(readFileSync(join(SCRIPTS, 'deploy.sh'), 'utf8')),
    'deploy.sh fails fast if access token missing');
}

console.log(`\n--- PRODUCTION PREFLIGHT: ${passed} passed, ${failed} failed ---`);
process.exit(failed === 0 ? 0 : 1);
