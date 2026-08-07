# Milestone 24 Implementation Report
### Community Activity Pipeline, Aggregation Layer & Production Metrics Preparation — NullSec Platform V2

> Date : 7 août 2026 · **Honestité** : aucun projet Supabase réel (pas d'env, pas de
> CLI), aucun navigateur, aucune donnée de production. Tous les résultats sont
> **LOCAL / MOCKED / STATIC / BLOCKED**. Aucune validation REAL SUPABASE ni REAL
> BROWSER n'est prétendue.

---

## 1. Architecture changes

- **Pipeline d'activité communautaire** :
  `Community actions → ns_record_activity (SECURITY DEFINER) → community_activity_events (privé) → vue d'agrégation v_country_metrics → ns_country_metrics() → CountryMetrics → dashboard`.
- Le frontend ne traite **jamais** les événements bruts ; il ne consomme que des agrégats.
- `ns_country_metrics()` lit désormais la vue `v_country_metrics` et retourne le
  contrat final `{ countries, availability, lastUpdate }`.

## 2. Database changes

- **`0011_community_activity_events.sql`** : table interne **privée**
  `community_activity_events (id, country_code FK→countries, activity_type CHECK,
  amount CHECK>=0, created_at)` + index (country+type, created) + RLS (aucun accès anon).
- **`0012_activity_event_privileges.sql`** : EXECUTE de `ns_record_activity`
  (REVOKE PUBLIC + GRANT anon/authenticated).
- **`0013_country_metrics_view.sql`** : vue `v_country_metrics` (participants,
  mission_activity, tool_activity, propagation, total_activity) + `REVOKE SELECT FROM
  anon, authenticated`.
- Aucune table dupliquée : réutilise `country_membership`, `mission_activity`,
  `tool_activity`, `community_propagation`.

## 3. RPC changes

- **`ns_record_activity(p_token, p_activity_type, p_amount, p_country_code)`** (nouveau) :
  `SECURITY DEFINER`, `search_path = public`, token-authentifié. L'identité vient de la
  session serveur ; le pays est résolu **serveur** depuis `country_membership` (jamais
  du frontend). Types validés (`mission_completed`/`tool_used`/`community_action`),
  amount borné (≥1, ≤1000), jamais de `p_user_id`/identité client. Insère l'événement +
  met à jour l'agrégat correspondant.
- **`ns_country_metrics()`** (modifié) : lit `v_country_metrics`, retourne
  `{ countries, availability, lastUpdate }`.

## 4. Security audit (LOCAL/STATIC)

- Frontend : pas de `service_role`/secret, pas de token en URL/localStorage, pas
  d'identifiants personnels dans les payloads, stockage centralisé (store.js /
  session-store.js), aucun Service→Store direct pour les données de compte.
- Backend : tous les RPC `SECURITY DEFINER` + `search_path = public` ; `ns_create_session`
  reste inaccessible ; EXECUTE explicites ; RLS sur `community_activity_events` (privé) ;
  vue d'agrégation non sélectionnable par anon.
- Rejets : types invalides, amount invalide, `p_user_id` — jamais acceptés.

## 5. Tests executed

| Suite | Type | Résultat |
|-------|------|----------|
| `tests/sql-audit.mjs` | STATIC | ✅ 203/203 |
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

**Total : 561 assertions vertes.** `node --check` sur tous les JS : **ALL OK**.

M24 couvre : stockage (pas de persistance compte/pays/activité), activité (création
valide via ApiClient, rejet sans token, amount invalide, offline), confidentialité
(aucune donnée individuelle, pas de mapping user→pays, pas de champs de tracking),
métriques (null vs zero, availability, agrégation), sécurité SQL (RLS, SECURITY
DEFINER, search_path, grants).

## 6. Blocked validations

- **REAL SUPABASE** : migrations 0001→0013 + RPC (dont `ns_record_activity`) non
  exécutés ; RLS, auth réelle, isolation cross-user, abuse testing réel, métriques
  réelles.
- **REAL BROWSER** : rendu du dashboard, flux d'activité, responsive.
- **Production metrics collection** : aucun événement réel enregistré.

## 7. Remaining technical debt

- Migrations/RPC non déployés (aucun vrai Supabase).
- `ns_record_activity` non branché sur une action UI concrète (les types existent ;
  le branchement mission/tool/action relève d'un milestone UI).
- La vue `v_country_metrics` lit `country_membership` (COUNT) — à valider en réel.
- Aucun rate-limiting applicatif.

## 8. Recommended Milestone 25

**M25 — Real Supabase Deployment + UI activity triggers + E2E browser validation.**
Dès qu'un projet réel est fourni : déployer 0001→0013 + RPC, exécuter la matrice runtime
(auth/cross-user/RLS/abuse), brancher `ns_record_activity` sur les actions missions/
outils/communautaires, valider le pipeline et le dashboard en navigateur, re-éditer ce
rapport avec des résultats réels.
