# Milestone 27 Implementation Report
### Community Metrics Refinement, Activity Aggregation Completion & Production Deployment Preparation — NullSec Platform V2

> Date : 7 août 2026 · **Honestité** : aucun projet Supabase réel (pas d'env, pas de
> CLI), aucun navigateur, aucune donnée de production. Tous les résultats sont
> **LOCAL / MOCKED / STATIC / BLOCKED**. Aucune validation REAL SUPABASE ni REAL
> BROWSER n'est prétendue.

---

## Architecture changes

- **Métrique `communityActivity`** ajoutée au contrat country metrics, distincte de
  `propagation`. Le dashboard peut maintenant distinguer missions / outils /
  contributions communautaires.
- **Vue d'agrégation complétée** : `v_country_metrics` expose `community_activity` et
  `total_activity = mission + tool + community`.
- **`CountryMetrics` (frontend)** : `communityActivity` explicitement supportée (avec
  fallback sur `propagation`), champs inconnus ignorés, numériques validés.
- **Dashboard** : panneau pays affiche « Missions completed », « Tools used »,
  « Community contributions », « Participants », « Total activity ».
- Pipeline inchangé : `UI → ActivityService/CommunityActionService → ApiClient →
  ns_record_activity → community_activity_events (privé) → v_country_metrics →
  ns_country_metrics() → CountryMetrics → dashboard`.

## Files created

- `backend/supabase/migrations/0016_activity_metrics_refinement.sql`
- `tests/m27-tests.mjs`
- `MILESTONE-27-REPORT.md`

## Files modified

- `assets/js/country-metrics.js` — `communityActivity` + fallback + validation.
- `assets/js/community.js` — panneau pays avec contributions communautaires.
- `backend/supabase/functions/rpc_country_metrics.sql` — émet `communityActivity` +
  availability.
- `tests/sql-audit.mjs` — migration 0016 + contract.
- `tests/run-all.sh`, `tests/run-tests.mjs`, `tests/README.md`.
- `tests/m20/m21/m22/m24/m26-tests.mjs` — listes de clés étendues (`communityActivity`).
- Docs : `community-api.md`, `privacy-model.md`, `supabase-architecture.md`,
  `deployment-guide.md`, `supabase-runtime-validation.md`.
- `backend/supabase/README.md`.

## Security audit

**Frontend** :
- Aucun `service_role`/secret ; aucun token en localStorage ; payloads d'activité
  anonymes (uniquement `p_token` + `p_activity_type` + `p_amount`).
- Le frontend ne lit **jamais** `community_activity_events` (privé) ; il ne consomme
  que des agrégats via `CountryMetrics`.
- Aucun identifiant personnel/pays/IP/GPS/device/analytics dans les payloads.

**Backend** :
- `ns_record_activity` : `SECURITY DEFINER`, `search_path = public`, token-authentifié,
  pays résolu serveur, jamais de `p_user_id`.
- `community_activity_events` : privé (RLS). Vue `v_country_metrics` : non
  sélectionnable par anon (REVOKE SELECT).
- Migration `0016` : ajoute `community_activity` à la vue, sans dupliquer de tables.

## Tests executed

| Suite | Type | Résultat |
|-------|------|----------|
| `tests/sql-audit.mjs` | STATIC | ✅ 218/218 |
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
| `tests/m26-tests.mjs` | LOCAL+MOCK+STATIC | ✅ 26/26 |
| `tests/m27-tests.mjs` | LOCAL+MOCK+STATIC | ✅ 42/42 |

**Total : 653 assertions vertes.** `node --check` sur tous les JS : **ALL OK**.

M27 couvre : agrégation (mission/tool/community/total), null vs zero, numériques
invalides, payload malformé, communityActivity distincte + fallback, activité (3 types,
invalide, offline, backend unavailable), confidentialité (no identity/country/tracking),
architecture (UI sans ApiClient direct, services isolés, CountryMetrics seule source),
SQL static (SECURITY DEFINER, search_path, grants, RLS).

## Blocked validations

- **REAL SUPABASE** : migrations 0001→0016 + RPC non exécutés ; RLS, auth réelle,
  isolation cross-user, abuse testing, métriques réelles.
- **REAL BROWSER** : rendu dashboard, panneau pays, responsive.
- **Production metrics** : aucun événement réel enregistré.

## Remaining technical debt

- Migrations/RPC non déployés (aucun vrai Supabase).
- `community_activity` et `propagation` partagent la même source (community_propagation)
  — c'est volontaire (propagation = alias), mais à clarifier dans la doc si le produit
  veut les différencier à terme.
- Aucun rate-limiting applicatif.

---

## Acceptance criteria

✅ All activity types represented safely (mission/tool/community).
✅ Community metrics aggregated correctly (communityActivity).
✅ Dashboard uses a single data source (CountryMetrics).
✅ Null and zero semantics preserved.
✅ No personal data enters activity pipeline.
✅ Offline behavior honest (OFFLINE state, no fabricated success).
✅ Existing architecture preserved.
✅ New M27 tests pass (42).
✅ All JS syntax checks pass.
✅ No fake REAL SUPABASE / REAL BROWSER validation reported (all runtime BLOCKED).
