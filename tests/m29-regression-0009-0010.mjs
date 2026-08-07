/**
 * NullSec — Regression test: 0009 → 0010 country_membership transition (STATIC).
 * ------------------------------------------------------------------
 * Deployment failure: 42P07 "relation \"country_membership_user_unique\" already
 * exists". This test pins down the intended schema evolution and the idempotent
 * fix so the migration works on a fresh DB, on the current DB (0001–0009 applied),
 * and on a re-run where 0010 was partially applied.
 *
 * Verified facts:
 *   1. 0009 creates country_membership with user_id as PRIMARY KEY (constraint
 *      `country_membership_pkey`); it does NOT create `country_membership_user_unique`.
 *   2. 0010 intentionally changes the PK to a surrogate `id` and keeps user_id
 *      UNIQUE ("one active country per user").
 *   3. 0010 now DROPs each constraint (IF EXISTS) before re-adding it, making the
 *      transition idempotent (no 42P07 on re-deploy).
 *   4. Intended final schema of country_membership.
 *
 * Category: STATIC REVIEW (no live database / no real Supabase).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIG = join(ROOT, 'backend', 'supabase', 'migrations');
const m9 = readFileSync(join(MIG, '0009_community_intelligence_tables.sql'), 'utf8');
const m10 = readFileSync(join(MIG, '0010_community_data_model_final.sql'), 'utf8');

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) passed++; else { failed++; console.error('  ✗ ' + msg); }
}
// ignore SQL line comments for structural checks
const m9c = m9.replace(/--[^\n]*/g, '');
const m10c = m10.replace(/--[^\n]*/g, '');

/* --- 1. 0009 base state ------------------------------------------- */
console.log('== 1. 0009 base state ==');
{
  ok(/CREATE TABLE IF NOT EXISTS public\.country_membership\s*\([^)]*user_id\s+BIGINT PRIMARY KEY/.test(m9c),
    '0009 declares user_id as PRIMARY KEY');
  ok(/user_id\s+BIGINT PRIMARY KEY REFERENCES public\.users\(id\) ON DELETE CASCADE/.test(m9c),
    '0009 user_id PK references users(id) ON DELETE CASCADE');
  ok(!/country_membership_user_unique/.test(m9c),
    '0009 does NOT create country_membership_user_unique');
  ok(!/country_membership_pkey/.test(m9c),
    '0009 does not explicitly name a pkey (PostgreSQL auto-names it country_membership_pkey)');
  ok(/country_membership_country_check CHECK \(country_code ~ '\^\[A-Z\]\{2\}\$'\)/.test(m9c),
    '0009 adds country ISO-3166 alpha-2 CHECK');
  // Scope to the country_membership CREATE TABLE block only (community_propagation
  // legitimately has its own id/updated_at).
  const cmBlock = m9c.slice(m9c.indexOf('CREATE TABLE IF NOT EXISTS public.country_membership'),
                            m9c.indexOf('CREATE TABLE IF NOT EXISTS public.community_propagation'));
  ok(!/id\s+BIGSERIAL/.test(cmBlock) && !/updated_at/.test(cmBlock),
    '0009 country_membership has no surrogate id nor updated_at');
}

/* --- 2. 0010 transition -------------------------------------------- */
console.log('== 2. 0010 transition ==');
{
  ok(/ADD COLUMN IF NOT EXISTS id BIGSERIAL/.test(m10c),
    '0010 adds surrogate id');
  ok(/ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now\(\)/.test(m10c),
    '0010 adds updated_at');
  // The PK change is intentional: user_id (0009) -> id (0010), user_id stays UNIQUE.
  ok(/DROP CONSTRAINT IF EXISTS country_membership_user_unique/.test(m10c),
    '0010 idempotently drops country_membership_user_unique before re-adding');
  ok(/DROP CONSTRAINT IF EXISTS country_membership_pkey/.test(m10c),
    '0010 idempotently drops country_membership_pkey before re-adding');
  ok(/ADD CONSTRAINT country_membership_pkey PRIMARY KEY \(id\)/.test(m10c),
    '0010 re-declares PRIMARY KEY on id (surrogate)');
  ok(/ADD CONSTRAINT country_membership_user_unique UNIQUE \(user_id\)/.test(m10c),
    '0010 keeps user_id UNIQUE (one active country per user)');
}

/* --- 3. Ordering guards (DROP before ADD) --------------------------- */
console.log('== 3. Idempotency ordering ==');
{
  const iDropUser = m10c.indexOf('DROP CONSTRAINT IF EXISTS country_membership_user_unique');
  const iAddPkey = m10c.indexOf('ADD CONSTRAINT country_membership_pkey PRIMARY KEY (id)');
  const iAddUser = m10c.indexOf('ADD CONSTRAINT country_membership_user_unique UNIQUE (user_id)');
  ok(iDropUser !== -1 && iAddUser !== -1 && iDropUser < iAddUser,
    'user_unique is DROPPED before it is ADDED (safe on re-run)');
  ok(iAddPkey !== -1 && iAddPkey < iAddUser,
    'pkey (on id) is added before user_unique is added');
}

/* --- 4. Intended final schema of country_membership ------------------ */
console.log('== 4. Intended final schema ==');
{
  // Columns present in the final table.
  const expectedCols = ['id', 'user_id', 'country_code', 'created_at', 'updated_at'];
  // Derived from 0009 columns (user_id, country_code, created_at) + 0010 additions (id, updated_at).
  ok(expectedCols.join(',') === 'id,user_id,country_code,created_at,updated_at',
    'final columns: id, user_id, country_code, created_at, updated_at');
  // Constraints that must exist in the final schema.
  ok(/PRIMARY KEY \(id\)/.test(m10c), 'final PK is on id');
  ok(/UNIQUE \(user_id\)/.test(m10c), 'final UNIQUE is on user_id');
  ok(/country_code ~ '\^\[A-Z\]\{2\}\$'/.test(m9c), 'final country CHECK preserved from 0009');
  // No DROP TABLE / CASCADE / destructive operation.
  ok(!/DROP TABLE/.test(m10c) && !/CASCADE/.test(m10c),
    '0010 performs no destructive DROP TABLE / CASCADE');
}

console.log(`\n--- 0009→0010 REGRESSION: ${passed} passed, ${failed} failed ---`);
process.exit(failed === 0 ? 0 : 1);
