#!/usr/bin/env bash
# NullSec — apply a single SQL file to a Supabase project via the Management API.
#
# Small internal helper used by deploy.sh (the single canonical entry point).
# Cloud-first: does NOT require the Supabase CLI or a local `link`. No secrets
# are echoed; the token only ever appears in the Authorization header.
#
# Usage:
#   SUPABASE_ACCESS_TOKEN=<token> SUPABASE_PROJECT_REF=<ref> \
#     backend/supabase/scripts/apply-sql.sh <path-to-sql>
#
# Env (optional):
#   SUPABASE_API_BASE_URL   default https://api.supabase.com
#   APPLY_SQL_PRINT=1       on success print the raw JSON response to stdout
#   APPLY_SQL_QUIET=1       suppress the success notice (used with APPLY_SQL_PRINT)
#
# Requires: curl, jq
set -Eeuo pipefail

SQL_FILE="${1:?usage: apply-sql.sh <path-to-sql>}"
ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN not set}"
PROJECT_REF="${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF not set}"
API_BASE="${SUPABASE_API_BASE_URL:-https://api.supabase.com}"

if [[ ! -f "$SQL_FILE" ]]; then
  echo "::error::SQL file not found: $SQL_FILE" >&2
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "::error::curl is required but not installed" >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "::error::jq is required but not installed" >&2
  exit 1
fi

# Build the request body with jq so the SQL is safely JSON-encoded.
BODY="$(jq -n --arg q "$(cat "$SQL_FILE")" '{ query: $q }')"

RESP_FILE="$(mktemp)"
trap 'rm -f "$RESP_FILE"' EXIT

RESP="$(curl -sS -o "$RESP_FILE" -w '%{http_code}' \
  --max-time 120 \
  -X POST \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d "$BODY" \
  "${API_BASE}/v1/projects/${PROJECT_REF}/database/query")"

if [[ "$RESP" != "200" && "$RESP" != "201" ]]; then
  echo "::error::Failed to apply $(basename "$SQL_FILE") (HTTP $RESP)" >&2
  # Surface only a SANITIZED API message. Never dump the raw body (it could echo
  # SQL or, in an extreme case, a credential). Belt-and-braces: scrub anything
  # that looks like a bearer token.
  jq -r 'if type=="array" then "query executed" elif .message then "message: \(.message)" elif .error then "error: \(.error)" else "error: unknown API failure" end' \
    "$RESP_FILE" 2>/dev/null | sed -E 's#(Bearer )[A-Za-z0-9._-]+#\1***#g' \
    || echo "::error::non-JSON API response (see server)" >&2
  exit 1
fi

if [[ "${APPLY_SQL_PRINT:-0}" == "1" ]]; then
  cat "$RESP_FILE"
else
  if [[ "${APPLY_SQL_QUIET:-0}" != "1" ]]; then
    echo "::notice::Applied ${SQL_FILE}"
  fi
fi
