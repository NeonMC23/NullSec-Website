#!/usr/bin/env bash
# NullSec — canonical Supabase production deployment.
#
# Single entry point used BOTH locally (developer machine) and from GitHub
# Actions. There is intentionally only one deployment implementation.
#
# Deploys, in order:
#   1. migrations   backend/supabase/migrations/*.sql     (0001 → 0019, numeric)
#   2. RPC          backend/supabase/functions/rpc_*.sql  (stable dependency order)
#   3. privileges   backend/supabase/functions/rpc_privileges.sql (MUST run last)
# ...then verifies the resulting production state via read-only Management-API
# queries (RPC count, RLS tables, auth/identity schema, pgcrypto search_path,
# internal-helper revocation, view shape).
#
# Uses the Supabase Management API (no CLI, no `supabase link`, no psql).
#
# Required env:
#   SUPABASE_ACCESS_TOKEN
#   SUPABASE_PROJECT_REF
# Optional env:
#   SUPABASE_API_BASE_URL   (default https://api.supabase.com)
#
# NEVER used for deployment auth: SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY.
# The deployment token is never printed and never written to any file.
#
# Fails closed: set -Eeuo pipefail; any failed migration/RPC/privilege/verification
# aborts with a non-zero exit. "completed successfully" is only printed when every
# step (including verification) has passed.

set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MIGRATIONS_DIR="$ROOT/backend/supabase/migrations"
FUNCTIONS_DIR="$ROOT/backend/supabase/functions"
APPLY="$ROOT/backend/supabase/scripts/apply-sql.sh"
API_BASE="${SUPABASE_API_BASE_URL:-https://api.supabase.com}"

# Required environment.
: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN not set (required for the Supabase Management API)}"
: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF not set (required)}"

die() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

# Run apply-sql.sh on a SQL file, failing closed with a clear message.
run_apply() {
  local f="$1" label="$2"
  if ! "$APPLY" "$f"; then
    die "failed while applying $label ($(basename "$f"))"
  fi
}

# Run a read-only SQL query and print the raw JSON response body to stdout.
run_query() {
  local q="$1" tmp
  tmp="$(mktemp)"
  printf '%s\n' "$q" > "$tmp"
  APPLY_SQL_PRINT=1 APPLY_SQL_QUIET=1 "$APPLY" "$tmp"
  rm -f "$tmp"
}

# ---------------------------------------------------------------------------
# [1/4] Preflight — validate environment and ordering BEFORE touching production.
# ---------------------------------------------------------------------------
echo "[1/4] Preflight"

for tool in curl jq sort cut uniq; do
  command -v "$tool" >/dev/null 2>&1 || die "required tool not found: $tool"
done

[ -d "$MIGRATIONS_DIR" ] || die "migrations directory missing: $MIGRATIONS_DIR"
[ -d "$FUNCTIONS_DIR"  ] || die "functions directory missing: $FUNCTIONS_DIR"
[ -f "$APPLY" ] && [ -r "$APPLY" ] || die "apply-sql.sh not present/readable: $APPLY"

# Deterministic migration discovery: basenames, lexicographic (= numeric order).
MIG_FILES="$(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '*.sql' | sed 's#.*/##' | sort)"
[ -n "$MIG_FILES" ] || die "no migration files found in $MIGRATIONS_DIR"

# Sanity-check filenames (must be NNNN_name.sql).
while IFS= read -r f; do
  case "$f" in
    [0-9][0-9][0-9][0-9]_*) ;;
    *) die "invalid migration filename (must be NNNN_name.sql): $f" ;;
  esac
done <<< "$MIG_FILES"

# Detect duplicate migration numbers before modifying anything.
DUPS="$(printf '%s\n' "$MIG_FILES" | cut -c1-4 | uniq -d)"
if [ -n "$DUPS" ]; then
  printf '[deploy] ERROR: duplicate migration numbers: %s\n' $DUPS >&2
  die "ambiguous migration ordering — aborting before any change"
fi

MIG_COUNT="$(printf '%s\n' "$MIG_FILES" | wc -l | tr -d ' ')"
echo "  API base  : $API_BASE"
echo "  project   : $SUPABASE_PROJECT_REF"
echo "  migrations: $MIG_COUNT file(s), applied in numeric order:"
printf '    %s\n' $MIG_FILES
echo "  preflight OK"

# ---------------------------------------------------------------------------
# [2/4] Migrations
# ---------------------------------------------------------------------------
echo "[2/4] Migrations"
# M46 idempotency: v_country_metrics evolves across migration 0013 (6 columns)
# and 0016 (appends community_activity). CREATE OR REPLACE VIEW cannot drop
# columns, so a re-deploy on an existing DB fails at 0013 (42P16). Dropping the
# view first lets migrations 0013→0016 recreate it on every run. The view is a
# read-only projection (no data), so dropping is safe and loses nothing.
PRE="$(mktemp)"
printf 'DROP VIEW IF EXISTS public.v_country_metrics;\n' > "$PRE"
run_apply "$PRE" "pre-migration cleanup (v_country_metrics)"
rm -f "$PRE"

for f in $MIG_FILES; do
  run_apply "$MIGRATIONS_DIR/$f" "migration"
done
echo "  migrations applied"

# ---------------------------------------------------------------------------
# [3/4] RPC functions + privileges
# ---------------------------------------------------------------------------
echo "[3/4] RPC functions + privileges"
for f in \
  rpc_auth.sql rpc_sync.sql rpc_activity.sql rpc_tool_activity.sql \
  rpc_profile.sql rpc_activity_event.sql rpc_country_metrics.sql \
  rpc_public_profile.sql rpc_update_public_profile.sql; do
  [ -f "$FUNCTIONS_DIR/$f" ] || die "RPC file missing: $f"
  run_apply "$FUNCTIONS_DIR/$f" "RPC function"
done
[ -f "$FUNCTIONS_DIR/rpc_privileges.sql" ] || die "rpc_privileges.sql missing"
run_apply "$FUNCTIONS_DIR/rpc_privileges.sql" "privilege hardening"
echo "  RPC functions + privileges applied"

# ---------------------------------------------------------------------------
# [4/4] Verification — read-only Management-API queries of the resulting state.
# ---------------------------------------------------------------------------
echo "[4/4] Verification"

verify_count() {
  local label="$1" expect="$2" sql="$3" out got
  out="$(run_query "$sql" || true)"
  got="$(printf '%s' "$out" | jq -r 'if type=="array" and length>0 then .[0].c else "NA" end' 2>/dev/null || echo NA)"
  if [ "$got" != "$expect" ]; then
    die "verification FAILED: $label expected $expect, got '${got:-empty}'"
  fi
  echo "  OK: $label = $got"
}

verify_count "ns_* RPC functions" 20 \
  "select count(*)::int as c from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'ns%';"

verify_count "RLS-protected tables" 17 \
  "select count(*)::int as c from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity and c.relname<>'schema_migrations';"

verify_count "users.identity_id nullable" 1 \
  "select count(*)::int as c from information_schema.columns where table_schema='public' and table_name='users' and column_name='identity_id' and is_nullable='YES';"

verify_count "user_profiles.public_profile_enabled present" 1 \
  "select count(*)::int as c from information_schema.columns where table_schema='public' and table_name='user_profiles' and column_name='public_profile_enabled';"

verify_count "ns_register search_path includes extensions (pgcrypto)" 1 \
  "select count(*)::int as c from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='ns_register' and 'search_path=public, extensions' = any(p.proconfig);"

verify_count "internal helper ns_create_session not exposed" 1 \
  "select count(*)::int as c from pg_proc p where p.proname='ns_create_session' and not (p.proacl::text like '%anon=%' or p.proacl::text like '%authenticated=%');"

verify_count "v_country_metrics columns" 7 \
  "select count(*)::int as c from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='v_country_metrics' and a.attnum>0 and not a.attisdropped;"

echo "  verification passed"

echo ""
echo "[deploy] NullSec Supabase deployment completed successfully."
