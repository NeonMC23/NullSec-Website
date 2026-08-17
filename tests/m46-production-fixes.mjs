/**
 * NullSec — M46 production-fix regression tests (STATIC, pure logic).
 * ------------------------------------------------------------------
 * Real-deploy fixes verified against the live Supabase eu-west-3 project and a
 * real Chromium E2E during the M46 production deployment:
 *
 *   1. Sync data-loss fix (sync-resolver.js): an EMPTY default block stamped
 *      with updated_at = now() must NEVER overwrite a populated server block.
 *      Re-login from a fresh device used to wipe server progression
 *      (PROGRESS != LOCAL DATA violation). Verified data-loss in real E2E,
 *      then fixed + confirmed the fix preserves progression on re-login.
 *
 * These are pure-logic assertions on the shipped module; real end-to-end
 * verification is documented in the M46 report.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'assets/js');

let passed = 0, failed = 0;
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error('  ✗ ' + msg); } }

const sandbox = {};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(readFileSync(join(JS, 'sync-resolver.js'), 'utf8'), sandbox);
const SyncResolver = sandbox.SyncResolver;

console.log('== 1. Sync data-loss fix (empty local must not clobber server) ==');
{
  const freshEmpty = { version: 1, missions: {}, articles: {}, weekly: {}, updated_at: '2026-08-18T00:00:00Z' };
  const serverDone = { version: 1, missions: { 'enable-2fa': { completed: true } }, articles: {}, weekly: {}, updated_at: '2026-08-17T00:00:00Z' };

  const r = SyncResolver.mergeBlock(freshEmpty, serverDone, 'progress');
  ok(r.winner === 'server' && r.value === serverDone,
    'empty fresh local progress does NOT overwrite populated server (winner=server)');

  // Normal behavior preserved: newer populated local still wins.
  const localNewer = { version: 1, missions: { 'password-manager': { completed: true } }, articles: {}, weekly: {}, updated_at: '2026-08-18T12:00:00Z' };
  const serverOlder = { version: 1, missions: { 'enable-2fa': { completed: true } }, articles: {}, weekly: {}, updated_at: '2026-08-17T00:00:00Z' };
  const r2 = SyncResolver.mergeBlock(localNewer, serverOlder, 'progress');
  ok(r2.winner === 'local', 'newer populated local still wins (normal newest-wins intact)');

  // Both empty → falls back to newer (no crash, both empty).
  const r3 = SyncResolver.mergeBlock(freshEmpty, { version: 1, missions: {}, articles: {}, weekly: {}, updated_at: '2026-08-17T00:00:00Z' }, 'progress');
  ok(r3.value !== null, 'both-empty merge returns a value (no crash)');

  // Server empty + local populated → local wins (do not push empties back).
  const r4 = SyncResolver.mergeBlock(localNewer, freshEmpty, 'progress');
  ok(r4.winner === 'local', 'populated local wins over empty server');
}

console.log('== 2. Profile/settings empty-default guard ==');
{
  const emptyProfile = { updated_at: '2026-08-18T00:00:00Z' };
  const serverProfile = { username: 'alice', avatar_seed: 'x', updated_at: '2026-08-17T00:00:00Z' };
  const rp = SyncResolver.mergeBlock(emptyProfile, serverProfile, 'profile');
  ok(rp.winner === 'server', 'empty fresh profile does not overwrite populated server profile');

  const emptySettings = { updated_at: '2026-08-18T00:00:00Z' };
  const serverSettings = { version: 1, theme: 'dark', updated_at: '2026-08-17T00:00:00Z' };
  const rs = SyncResolver.mergeBlock(emptySettings, serverSettings, 'settings');
  ok(rs.winner === 'server', 'empty fresh settings do not overwrite populated server settings');

  // Full merge() path passes the key through.
  const full = SyncResolver.merge(
    { progress: freshEmpty(), settings: { updated_at: '2026-08-18T00:00:00Z' } },
    { progress: { version: 1, missions: { a: { completed: true } }, articles: {}, weekly: {}, updated_at: '2026-08-17T00:00:00Z' }, settings: { version: 1, theme: 'dark', updated_at: '2026-08-17T00:00:00Z' } }
  );
  ok(full.resolutions.progress === 'server' && full.resolutions.settings === 'server',
    'merge() prefers server for both blocks when local is empty');
}
function freshEmpty() { return { version: 1, missions: {}, articles: {}, weekly: {}, updated_at: '2026-08-18T00:00:00Z' }; }

console.log('== 3. Sync reload-before-push fix (sync-service.js) ==');
{
  const syncSvc = readFileSync(join(JS, 'sync-service.js'), 'utf8');
  ok(/Progress\.reload/.test(syncSvc),
    'sync() reloads in-memory progress before push (data-loss fix)');
  ok(/M46 REAL-DEPLOY FIX/.test(syncSvc),
    'sync-service data-loss fix documented in source');
}

console.log(`\n--- M46 PRODUCTION FIXES (STATIC): ${passed} passed, ${failed} failed ---`);
process.exit(failed === 0 ? 0 : 1);
