# Milestone 25 Implementation Report
### Real Supabase Preparation, UI Activity Triggers & End-to-End Community Activity Integration — NullSec Platform V2

> Date : 7 août 2026 · **Honestité** : aucun projet Supabase réel (pas d'env, pas de
> CLI), aucun navigateur, aucune donnée de production. Tous les résultats sont
> **LOCAL / MOCKED / STATIC / BLOCKED**. Aucune validation REAL SUPABASE ni REAL
> BROWSER n'est prétendue.

---

## 1. Architecture changes

- **Couche d'activité UI** : `ActivityService` (`assets/js/activity-service.js`) —
  les composants UI appellent `ActivityService.record(type, amount)` et **jamais**
  ApiClient/Supabase directement.
- **Déclencheurs connectés** :
  - mission complétée (journey.js) → `record('mission_completed', 1)` (après succès
    local, pas sur uncomplete) ;
  - outil ouvert (tools.js) → `record('tool_used', 1)`.
- Pipeline : `UI → ActivityService → ApiClient.recordActivity() → ns_record_activity()
  → community_activity_events (privé) → v_country_metrics → ns_country_metrics() →
  CountryMetrics → dashboard`.

## 2. Files created

- `assets/js/activity-service.js`
- `backend/supabase/migrations/0014_activity_trigger_support.sql`
- `tests/m25-tests.mjs`
- `MILESTONE-25-REPORT.md`

## 3. Files modified

- `assets/js/journey.js` — déclencheur `mission_completed`.
- `assets/js/tools.js` — déclencheur `tool_used`.
- `tests/run-tests.mjs`, `tests/run-all.sh`, `tests/sql-audit.mjs`, `tests/README.md`.
- Docs : `community-api.md`, `privacy-model.md`, `javascript-architecture.md`,
  `supabase-architecture.md`, `deployment-guide.md`, `supabase-runtime-validation.md`.
- `backend/supabase/README.md`.
- 23 pages HTML (8 racines + 15 articles) chargent `activity-service.js`.

## 4. Security audit (LOCAL/STATIC)

**Frontend** :
- Aucun `service_role`/secret/clé DB en frontend (seule la clé publique anon dans
  api-client/config).
- Aucun token en localStorage ; aucun identifiant utilisateur ni pays dans les
  payloads d'activité (uniquement `p_token` + `p_activity_type` + `p_amount`).
- Stockage centralisé (store.js / session-store.js).

**Backend** :
- `ns_record_activity` : `SECURITY DEFINER`, `search_path = public`, token-authentifié ;
  pays résolu **serveur** depuis `country_membership` ; jamais de `p_user_id`/identité
  client.
- `community_activity_events` : table **privée** (RLS, aucun accès anon).
- Vue `v_country_metrics` : non sélectionnable par anon (REVOKE SELECT).
- EXECUTE contrôlé (0012) ; re-affirmation RLS (0014).

## 5. Tests executed

| Suite | Type | Résultat |
|-------|------|----------|
| `tests/sql-audit.mjs` | STATIC | ✅ 207/207 |
| `tests/m14-tests.mjs` | LOCAL+MOCK | ✅ 59/59 |
| `tests/m15-tests.mjs` | MOCK+LOCAL+STATIC | ✅ 44/44 |
| `tests/m16-tests.mjs` | LOCAL+MOCK+STATIC | ✅ 22/22 |
| `tests/m17-tests.mjs` | LOCAL+MOCK+STATIC | ✅ 48/48 |
| `tests/m18-tests.mjs` | LOCAL+MOCK+STATIC | ✅ 38/38 |
| `tests/m19-tests.mjs` | LOCAL+MOCK+STATIC | ✅ 29/29 |
| `tests/m20-tests.mjs` | LOCAL+MOCK+STATIC | ✅ 61/61 |
| `tests/m21-tests.mjs` | LOCAL+MOCK+STATIC | ✅ 26/26 |
| `tests/m22-tests.mjs` | LOCAL+MOCK+STATIC | ✅ 23/23 |
| `tests/m24-tests.mjs` | LOCAL+MOCK+STATIC | ✅ 25/25 |
| `tests/m25-tests.mjs` | LOCAL+MOCK+STATIC | ✅ 24/24 |

**Total : 585 assertions vertes.** `node --check` sur tous les JS : **ALL OK**.

M25 couvre : activité valide via service, type/amount invalides rejetés, auth manquante,
backend indisponible, offline (0 requête, pas de succès fabriqué), confidentialité
(no user_id/country_code/identity dans le payload), architecture (journey/tools ne
callent pas ApiClient/fetch directement, passent par ActivityService), audit SQL
(SECURITY DEFINER, search_path, grants, RLS).

## 6. Blocked validations

- **REAL SUPABASE** : migrations 0001→0014 + RPC non exécutés ; RLS, auth réelle,
  isolation cross-user, abuse testing, métriques réelles.
- **REAL BROWSER** : rendu, déclencheurs UI réels, responsive.
- **Production activity collection** : aucun événement réel enregistré.

## 7. Remaining technical debt

- Migrations/RPC non déployés (aucun vrai Supabase).
- Le déclencheur `community_action` n'a pas encore de source UI (réservé pour une
  future contribution).
- `ActivityService.record` ne suit pas la latence des appels (fire-and-forget) —
  acceptable car best-effort anonyme.
- Aucun rate-limiting applicatif.

## 8. Recommended Milestone 26

**M26 — Real Supabase Deployment + community_action UI + E2E browser validation.**
Dès qu'un projet réel est fourni : déployer 0001→0014 + RPC, exécuter la matrice runtime
(auth/cross-user/RLS/abuse), valider les déclencheurs UI mission/tool en navigateur,
brancher une action communautaire, re-éditer ce rapport avec des résultats réels.

---

## Acceptance criteria

✅ UI actions can trigger activity recording through service architecture.
✅ No UI component talks directly to Supabase for activity.
✅ No personal data enters activity payloads.
✅ Offline behavior is safe (no fabricated success, no corruption).
✅ Privacy model remains aggregation-only.
✅ Existing tests remain green (585).
✅ New M25 tests pass (24).
✅ No fake production validation reported (all runtime BLOCKED).
