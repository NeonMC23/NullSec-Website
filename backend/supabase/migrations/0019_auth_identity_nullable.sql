-- NullSec — M46 real-deploy fix: users.identity_id nullable
-- ------------------------------------------------------------------
-- REAL-DEPLOY BUG (reproduced on the live eu-west-3 project):
--   Migration 0001 defined users.identity_id UUID NOT NULL UNIQUE for the
--   ORIGINAL identity_id + recovery-key authentication model. The username +
--   password model (migration 0017, Milestone 32/33) replaces that flow: its
--   ns_register RPC creates accounts from username + password_hash and does
--   NOT set identity_id. Because the column was NOT NULL, every new
--   registration failed on the live database with:
--
--     ERROR: 23502: null value in column "identity_id"
--     DETAIL: Failing row contains (1, null, active, ...)
--
-- Fix: drop the NOT NULL constraint. identity_id is vestigial under the
-- current auth model (username is the primary private login identifier). It is
-- kept as a nullable column for backward compatibility; the UNIQUE constraint
-- is harmless because PostgreSQL treats multiple NULLs as distinct.
--
-- This is an ADDITIVE, non-destructive change (ALTER ... DROP NOT NULL only
-- loosens an existing constraint; it does not rewrite migration 0001).
-- RLS and RPC EXECUTE permissions are preserved (no widening).

BEGIN;

ALTER TABLE public.users
  ALTER COLUMN identity_id DROP NOT NULL;

COMMIT;
