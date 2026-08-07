#!/usr/bin/env bash
# NullSec — run the full local/static/mock test suite (no real Supabase needed).
set -e
cd "$(dirname "$0")/.."

echo "== 1. JS syntax check =="
for f in assets/js/*.js; do node --check "$f" >/dev/null; done
echo "   OK"

echo "== 2. SQL / static security audit =="
node tests/sql-audit.mjs

echo "== 3. Milestone 14 suite =="
node tests/m14-tests.mjs

echo "== 4. Milestone 15 suite =="
node tests/m15-tests.mjs

echo "== 5. Milestone 16 storage-policy suite =="
node tests/m16-tests.mjs

echo "== 6. Milestone 17 suite (Supabase-first + Europe prep) =="
node tests/m17-tests.mjs

echo "== 7. Milestone 18 suite (country metrics + Europe map) =="
node tests/m18-tests.mjs

echo "== 8. Milestone 19 suite (metric semantics + challenge fix) =="
node tests/m19-tests.mjs

echo "== 9. Milestone 20 suite (country metrics data model + UI) =="
node tests/m20-tests.mjs

echo "== 10. Milestone 21 suite (data model finalization) =="
node tests/m21-tests.mjs

echo "== 11. Milestone 22 suite (country onboarding) =="
node tests/m22-tests.mjs

echo "== 12. Milestone 24 suite (community activity pipeline) =="
node tests/m24-tests.mjs

echo "== 13. Milestone 25 suite (UI activity triggers) =="
node tests/m25-tests.mjs

echo "== 14. Milestone 26 suite (community actions) =="
node tests/m26-tests.mjs

echo "== 15. Milestone 27 suite (metrics refinement) =="
node tests/m27-tests.mjs

echo "== 16. Milestone 28 suite (production prep + runtime hardening) =="
node tests/m28-tests.mjs

echo ""
echo "All local/static/mock suites passed. (Real Supabase tests are BLOCKED.)"
