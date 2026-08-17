/**
 * NullSec — Milestone 28 cloud-first deployment static tests (STATIC).
 * No real Supabase deployment is performed or claimed.
 *
 * Verifies:
 *   1. Migration ordering 0001 → 0016 (lexicographic).
 *   2. deploy.sh references all expected migrations + RPC in a stable order.
 *   3. No literal secret values in the workflow or scripts (only ${{ secrets.* }}).
 *   4. apply-sql.sh does not echo the access token.
 *   5. RPC files referenced by deploy.sh all exist.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) passed++; else { failed++; console.error('  ✗ ' + msg); }
}

const MIG = join(ROOT, 'backend/supabase/migrations');
const FN = join(ROOT, 'backend/supabase/functions');
const SCRIPTS = join(ROOT, 'backend/supabase/scripts');
const WF = join(ROOT, '.github/workflows/supabase-deploy.yml');

/* 1. Migration ordering */
console.log('== 1. Migration ordering ==');
{
  const files = readdirSync(MIG).filter(f => f.endsWith('.sql')).sort();
  const expected = Array.from({ length: 17 }, (_, i) => '00' + String(i + 1).padStart(2, '0') + '_').map(p => p.slice(1));
  // Build expected names from 0001..0019
  const names = [];
  for (let i = 1; i <= 18; i++) {
    const n = String(i).padStart(2, '0');
    names.push(readdirSync(MIG).find(f => f.startsWith('00' + n + '_')));
  }
  // Simpler: check count + lexicographic order + all prefix 0001..0016 present.
  ok(files.length === 19, '19 migrations present (got ' + files.length + ')');
  ok(files.join('\n') === files.slice().sort().join('\n'), 'migrations lexicographically ordered');
  const nums = files.map(f => parseInt(f.slice(0, 4), 10));
  ok(nums.join(',') === '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19',
    'migration numbers are exactly 0001..0019');
}

/* 2. deploy.sh references migrations + RPC */
console.log('== 2. deploy.sh references ==');
{
  const deploy = readFileSync(join(SCRIPTS, 'deploy.sh'), 'utf8');
  // Strip shell comments so a header prose mention does not skew indexOf ordering.
  const deployCode = deploy.replace(/#[^\n]*/g, '');
  ok(/migrations\/\*\.sql/.test(deploy) && /sort/.test(deploy),
    'deploy.sh iterates migrations in lexicographic order');
  // RPC files in stable order.
  const rpcs = ['rpc_auth', 'rpc_sync', 'rpc_activity', 'rpc_tool_activity', 'rpc_profile', 'rpc_activity_event', 'rpc_country_metrics', 'rpc_public_profile', 'rpc_update_public_profile', 'rpc_privileges'];
  const re = new RegExp(rpcs.join('|'));
  ok(rpcs.every(r => new RegExp(r + '\\.sql').test(deploy)), 'deploy.sh references all 10 RPC/hardening files');
  // Order check: auth before sync before activity...
  const idxs = rpcs.map(r => deployCode.indexOf(r + '.sql'));
  ok(idxs.every((v, i) => i === 0 || v > idxs[i - 1]), 'RPC + hardening applied in stable dependency-safe order');
  // rpc_privileges.sql MUST be applied LAST (after every RPC function exists).
  ok(deployCode.indexOf('rpc_privileges.sql') > deployCode.indexOf('rpc_country_metrics.sql'),
    'rpc_privileges.sql applied after all RPC functions');
}

/* 3. No literal secrets in workflow/scripts */
console.log('== 3. No secret leakage ==');
{
  const wf = readFileSync(WF, 'utf8');
  ok(/secrets\.SUPABASE_ACCESS_TOKEN/.test(wf), 'workflow uses ${{ secrets.SUPABASE_ACCESS_TOKEN }}');
  ok(/secrets\.SUPABASE_PROJECT_REF/.test(wf), 'workflow uses ${{ secrets.SUPABASE_PROJECT_REF }}');
  ok(!/=eyJ|service_role.*=|sbad|yoursupabase/i.test(wf), 'no literal token values in workflow');

  const apply = readFileSync(join(SCRIPTS, 'apply-sql.sh'), 'utf8');
  ok(/SUPABASE_ACCESS_TOKEN not set/.test(apply), 'apply-sql requires token env');
  ok(!/echo.*ACCESS_TOKEN|printf.*ACCESS_TOKEN/.test(apply), 'apply-sql never echoes the access token');
  // The token is only used inside an Authorization header (not printed).
  ok(/Authorization: Bearer \$\{ACCESS_TOKEN\}/.test(apply), 'token only in Authorization header');

  const deploy = readFileSync(join(SCRIPTS, 'deploy.sh'), 'utf8');
  ok(!/=eyJ|service_role=|yoursupabase/i.test(deploy), 'no literal secret in deploy.sh');
}

/* 4. apply-sql.sh fails safely on missing file / non-2xx */
console.log('== 4. Fail-safe ==');
{
  const apply = readFileSync(join(SCRIPTS, 'apply-sql.sh'), 'utf8');
  ok(/set -euo pipefail/.test(apply), 'apply-sql uses set -euo pipefail');
  ok(/exit 1/.test(apply), 'apply-sql exits non-zero on failure');
  ok(/SQL_FILE="\$\{1:?/.test(apply), 'apply-sql requires a SQL file argument');
}

/* 5. All RPC files exist */
console.log('== 5. RPC files exist ==');
{
  const rpcs = ['rpc_auth.sql', 'rpc_sync.sql', 'rpc_activity.sql', 'rpc_tool_activity.sql', 'rpc_profile.sql', 'rpc_activity_event.sql', 'rpc_country_metrics.sql', 'rpc_public_profile.sql', 'rpc_update_public_profile.sql', 'rpc_privileges.sql'];
  for (const r of rpcs) ok(readdirSync(FN).includes(r), r + ' exists');
}

/* 6. No function-level EXECUTE statements in migrations (deployment-order fix) */
console.log('== 6. No function privileges in migrations ==');
{
  const migFiles = readdirSync(MIG).filter(f => f.endsWith('.sql'));
  let found = [];
  for (const f of migFiles) {
    const src = readFileSync(join(MIG, f), 'utf8').replace(/--[^\n]*/g, '');
    if (/EXECUTE ON FUNCTION/.test(src)) found.push(f);
  }
  ok(found.length === 0, 'no migration contains GRANT/REVOKE EXECUTE ON FUNCTION (got: ' + (found.join(', ') || 'none') + ')');
}

console.log(`\n--- M28 CLOUD DEPLOY STATIC: ${passed} passed, ${failed} failed ---`);
process.exit(failed === 0 ? 0 : 1);
