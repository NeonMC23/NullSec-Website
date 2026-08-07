#!/usr/bin/env bash
# NullSec — apply a single SQL file to a Supabase project via the Management API.
#
# Cloud-first deployment: does NOT require the Supabase CLI or a local `link`.
# Uses the Supabase Management API SQL query endpoint. No secrets are echoed.
#
# Usage:
#   SUPABASE_ACCESS_TOKEN=<token> SUPABASE_PROJECT_REF=<ref> \
#     backend/supabase/scripts/apply-sql.sh <path-to-sql>
#
# Requires: curl, jq
set -euo pipefail

SQL_FILE="${1:?usage: apply-sql.sh <path-to-sql>}"
ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:?SUPABASE_ACCESS_TOKEN not set}"
PROJECT_REF="${SUPABASE_PROJECT_REF:?SUPABASE_PROJECT_REF not set}"

if [[ ! -f "$SQL_FILE" ]]; then
  echo "::error::SQL file not found: $SQL_FILE"
  exit 1
fi

# Build the request body with jq so the SQL is safely JSON-encoded.
BODY="$(jq -n --arg q "$(cat "$SQL_FILE")" '{ query: $q }')"

RESP="$(curl -sS -o /tmp/nullsec-sql-response.json -w '%{http_code}' \
  -X POST \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d "$BODY" \
  "https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query")"

if [[ "$RESP" != "200" && "$RESP" != "201" ]]; then
  echo "::error::Failed to apply $SQL_FILE (HTTP $RESP)"
  # Only echo the response body if it is NOT a secret-bearing object.
  if command -v jq >/dev/null 2>&1; then
    jq -r 'if type=="array" then "query executed" elif .message then .message else tostring end' \
      /tmp/nullsec-sql-response.json 2>/dev/null || cat /tmp/nullsec-sql-response.json
  fi
  exit 1
fi

echo "::notice::Applied ${SQL_FILE}"
