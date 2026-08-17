/**
 * NullSec — Milestone 45 (Release-Candidate Lock / Stop-Gate).
 * ------------------------------------------------------------------
 * Category: LOCAL / STATIC (no real Supabase, no real browser).
 *
 * This suite LOCKS the release-critical invariants so that any future change
 * that would break the release candidate is caught early. It does NOT add
 * product features. Every assertion maps to a concrete release gate:
 *
 *   - migrations 0001→0019 exact + ordered + no destructive drops;
 *   - RPC inventory + helpers revoked;
 *   - no client-controlled p_user_id;
 *   - XSS-safe public fields (textContent, no innerHTML on user data);
 *   - storage contract (localStorage theme/migration only; session-only auth);
 *   - backend flags off by default; public-only injection;
 *   - no stale "local progression"/"no backend" claims;
 *   - no social-network features;
 *   - preflight + full suite runnable (checked in run-all.sh).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const JS = join(ROOT, 'assets/js');
let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error('  ✗ ' + msg); } }

/* 1. Migrations gate */
console.log('== 1. Migrations 0001→0019 (release gate) ==');
{
  const migs = readdirSync(join(ROOT, 'backend/supabase/migrations'))
    .filter(f => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
  const nums = migs.map(f => parseInt(f.slice(0, 4), 10));
  ok(nums.length === 19, 'exactly 19 migrations');
  ok(nums[0] === 1 && nums[nums.length - 1] === 19, 'spans 0001..0019');
  ok(new Set(nums).size === 19, 'no duplicate numbers');
  ok(nums.join(',') === nums.slice().sort((a, b) => a - b).join(','), 'ordered');
  let destructive = 0;
  for (const f of migs) {
    const src = readFileSync(join(ROOT, 'backend/supabase/migrations', f), 'utf8');
    if (/DROP TABLE/.test(src.replace(/--.*/g, ''))) destructive++;
  }
  ok(destructive === 0, 'no destructive DROP TABLE in migrations');
}

/* 2. RPC inventory + helpers */
console.log('== 2. RPC inventory + helper revocation ==');
{
  const fn = readdirSync(join(ROOT, 'backend/supabase/functions')).filter(f => f.endsWith('.sql'));
  ok(fn.length === 10, '10 RPC .sql files');
  const priv = readFileSync(join(ROOT, 'backend/supabase/functions/rpc_privileges.sql'), 'utf8');
  ok(/ns_valid_transport_hash\(text\) FROM PUBLIC, anon, authenticated/.test(priv), 'helper revoked');
  ok(/ns_valid_username\(text\) FROM PUBLIC, anon, authenticated/.test(priv), 'helper revoked');
  ok(/ns_create_session\(bigint\) FROM anon, authenticated/.test(priv), 'ns_create_session internal');
}

/* 3. No client-controlled p_user_id */
console.log('== 3. No client-controlled p_user_id ==');
{
  const api = readFileSync(join(JS, 'api-client.js'), 'utf8');
  ok(!/p_user_id/.test(api.replace(/\/\/.*/g, '')), 'api-client never sends p_user_id');
}

/* 4. XSS-safe public rendering */
console.log('== 4. XSS-safe public rendering ==');
{
  const pp = readFileSync(join(JS, 'public-profile.js'), 'utf8');
  ok(/text: profile\.bio/.test(pp) && /text: '@' \+ username/.test(pp), 'bio/username as text');
  ok(!/\.innerHTML\s*=/.test(pp), 'no innerHTML on user data');
}

/* 5. Storage contract */
console.log('== 5. Storage contract ==');
{
  const store = readFileSync(join(JS, 'store.js'), 'utf8');
  const keys = store.slice(store.indexOf('KEYS = {'), store.indexOf('};', store.indexOf('KEYS = {'))).replace(/\/\/[^\n]*/g, '');
  ok(/THEME/.test(keys) && /MIGRATION/.test(keys) && !/profile|progress|username|password|token/.test(keys),
    'localStorage only theme/migration');
  const ss = readFileSync(join(JS, 'session-store.js'), 'utf8');
  ok(/ns:session:recovery/.test(ss) && /ns:session:auth/.test(ss), 'sessionStorage only session keys');
}

/* 6. Backend flags off by default + public-only injection */
console.log('== 6. Backend disabled by default ==');
{
  const config = readFileSync(join(JS, 'config.js'), 'utf8');
  ok(/supabaseEnabled:\s*false/.test(config) && /authEnabled:\s*false/.test(config) &&
     /backendEnabled:\s*false/.test(config) && /syncEnabled:\s*false/.test(config),
    'all backend flags off by default');
  ok(/__NULLSEC_SUPABASE__/.test(config), 'public injection via __NULLSEC_SUPABASE__');
  ok(!/service[-_]role\s*[:=]/.test(config), 'no service-role assignment');
}

/* 7. No stale claims / no social features */
console.log('== 7. No stale claims / no social features ==');
{
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  ok(!/100% static — no backend, no database/.test(readme), 'README has no stale "no backend" claim');
  ok(!/Progress saved locally/.test(readme), 'README has no stale "saved locally" claim');
  const socialRe = /\b(follow|follower|following|friends?|like|comments?|direct message|\bdm\b|social feed|timeline)\b\s*[:=(]/i;
  for (const f of ['journey.js', 'profile.js', 'public-profile.js', 'community.js']) {
    const src = readFileSync(join(JS, f), 'utf8');
    ok(!socialRe.test(src.replace(/\/\/.*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')), f + ' no social features');
  }
}

/* 8. Deployment tooling + docs present */
console.log('== 8. Deployment tooling present ==');
{
  ok(existsSync(join(ROOT, 'tests/preflight-production.mjs')), 'preflight exists');
  ok(existsSync(join(ROOT, 'docs/production-deployment.md')), 'deployment contract exists');
  ok(existsSync(join(ROOT, 'docs/production-validation.md')), 'validation protocol exists');
  ok(existsSync(join(ROOT, '.github/workflows/supabase-deploy.yml')), 'GitHub workflow exists');
}

console.log(`\n--- M45 RELEASE GATE: ${passed} passed, ${failed} failed ---`);
process.exit(failed === 0 ? 0 : 1);
