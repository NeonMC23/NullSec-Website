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

echo "== 17. Cloud-first deployment static checks =="
node tests/m28-deploy-tests.mjs

echo "== 18. Regression: 0009→0010 country_membership transition =="
node tests/m29-regression-0009-0010.mjs

echo "== 19. Milestone 30 suite (account-based progression & auth UX) =="
node tests/m30-tests.mjs

echo "== 20. Milestone 31 suite (legacy profile & local-state cleanup) =="
node tests/m31-tests.mjs

echo "== 21. Milestone 32 suite (username & password auth UX) =="
node tests/m32-tests.mjs

echo "== 22. Milestone 33 suite (authentication & session hardening) =="
node tests/m33-tests.mjs

echo "== 23. Milestone 34 suite (account & journey UX finalization) =="
node tests/m34-tests.mjs

echo "== 24. Milestone 35 suite (real account architecture + community dashboard) =="
node tests/m35-tests.mjs

echo "== 25. Milestone 36 suite (account lifecycle + campaign journey) =="
node tests/m36-tests.mjs

echo "== 26. Milestone 37 suite (account lifecycle + public profiles) =="
node tests/m37-tests.mjs

echo "== 27. Milestone 38 suite (public profile customization & learning identity) =="
node tests/m38-tests.mjs

echo "== 28. Milestone 39 suite (public profile discovery, sharing & identity UX) =="
node tests/m39-tests.mjs

echo "== 29. Milestone 40 suite (product completion audit & learning experience) =="
node tests/m40-tests.mjs

echo "== 30. Milestone 41 suite (deep product audit, UX polish & content completion) =="
node tests/m41-tests.mjs

echo "== 31. Milestone 42 suite (pre-deployment readiness & final hardening) =="
node tests/m42-tests.mjs

echo "== 32. Milestone 43 suite (final product gap analysis & functional completion) =="
node tests/m43-tests.mjs

echo "== 33. Milestone 44 suite (deployment readiness toolkit) =="
node tests/m44-tests.mjs

echo "== 34. Production preflight =="
node tests/preflight-production.mjs

echo "== 35. Milestone 45 release gate (release-candidate lock) =="
node tests/m45-tests.mjs

echo "== 36. Milestone 46 production-fix regressions (real-deploy fixes) =="
node tests/m46-production-fixes.mjs

echo ""
echo "All local/static/mock suites passed. (Real Supabase tests are BLOCKED.)"
