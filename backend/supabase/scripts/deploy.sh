#!/usr/bin/env bash
# NullSec — cloud-first Supabase deployment.
#
# Applies, in order:
#   1. All versioned migrations  (backend/supabase/migrations/*.sql)
#   2. All RPC function files    (backend/supabase/functions/rpc_*.sql)
#   3. RPC privilege hardening   (backend/supabase/functions/rpc_privileges.sql)
#
# Ordering is critical on a FRESH database:
#   migrations 0001→0016  ->  RPC creation  ->  RPC privilege hardening
# Migrations must NOT contain REVOKE/GRANT EXECUTE ON FUNCTION statements
# (the functions do not exist yet). Function-level EXECUTE controls live in
# rpc_privileges.sql and are applied AFTER all rpc_*.sql files.
#
# Uses the Supabase Management API (no local CLI, no local `link`). Secrets come
# from the environment (GitHub Actions secrets) and are NEVER echoed.
#
# Fails safely: any failed step aborts the deployment with a non-zero exit.
#
# Required env:
#   SUPABASE_ACCESS_TOKEN
#   SUPABASE_PROJECT_REF
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
MIGRATIONS_DIR="$ROOT/backend/supabase/migrations"
FUNCTIONS_DIR="$ROOT/backend/supabase/functions"
APPLY="$ROOT/backend/supabase/scripts/apply-sql.sh"

: "${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN not set}"
: "${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF not set}"

# Prefer a node-provided ordered list; fall back to lexicographic sort.
MIGRATIONS="$(ls -1 "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort)"

if [[ -z "$MIGRATIONS" ]]; then
  echo "::error::No migrations found in $MIGRATIONS_DIR"
  exit 1
fi

echo "::group::Applying migrations (0001..0016)"
for f in $MIGRATIONS; do
  "$APPLY" "$f"
done
echo "::endgroup::"

# RPC functions: apply in a stable, dependency-safe order.
echo "::group::Applying RPC functions"
for f in \
  "$FUNCTIONS_DIR/rpc_auth.sql" \
  "$FUNCTIONS_DIR/rpc_sync.sql" \
  "$FUNCTIONS_DIR/rpc_activity.sql" \
  "$FUNCTIONS_DIR/rpc_tool_activity.sql" \
  "$FUNCTIONS_DIR/rpc_profile.sql" \
  "$FUNCTIONS_DIR/rpc_activity_event.sql" \
  "$FUNCTIONS_DIR/rpc_country_metrics.sql"; do
  if [[ -f "$f" ]]; then
    "$APPLY" "$f"
  fi
done
echo "::endgroup::"

# RPC privilege hardening: MUST run last, after every RPC function exists.
# (On a fresh DB the functions are undefined until the step above completes.)
echo "::group::Applying RPC privilege hardening"
if [[ -f "$FUNCTIONS_DIR/rpc_privileges.sql" ]]; then
  "$APPLY" "$FUNCTIONS_DIR/rpc_privileges.sql"
else
  echo "::error::rpc_privileges.sql not found in $FUNCTIONS_DIR"
  exit 1
fi
echo "::endgroup::"

echo "::notice::NullSec Supabase deployment completed successfully."
