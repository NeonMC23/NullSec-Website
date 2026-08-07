# Milestone 18 Implementation Report
### Final Architecture Cleanup, Supabase-First Data & Europe Community UI — NullSec Platform V2

> Date : 7 août 2026 · **Honestité** : aucun projet Supabase réel n'est disponible (pas
> d'env, pas de CLI, pas de navigateur). Aucune migration/RPC/RLS n'a été exécutée sur
> un vrai projet. Rien n'est « validé en production ». Chaque test est étiqueté
> **LOCAL / MOCKED / STATIC / BLOCKED / REAL SUPABASE**.

---

## 1. Architecture changes

- **Règle finale appliquée** : « Supabase est la source de vérité unique des comptes et
  des données utilisateur persistantes. Le navigateur est un client. »
- **Couche de données (repositories)** introduite : `assets/js/repositories/`
  (`profile-repository.js`, `progress-repository.js`, `settings-repository.js`). Les
  services de compte (`user-profile`, `progress-service`, `settings-service`) utilisent
  désormais ces repositories au lieu d'appeler `Store` directement.
- **Carte Europe** : `europe-map.js` + `country-metrics.js` intégrés dans
  `community.html`, remplaçant l'ancienne `community-map.js` (archivée).
- **RPC `ns_country_metrics()`** ajouté côté backend (statiquement vérifié).

## 2. Storage cleanup

- Les données de compte (identity/profile/progress/settings) restent **mémoire de
  session** (non-persistant, M17). Les repositories les exposent via `Store` (cache
  mémoire, source de vérité = Supabase).
- `localStorage` : uniquement `ns:theme` + marqueur de migration (aucune donnée de
  compte). `sessionStorage` : session courte + clé de récupération.
- Aucune donnée de compte, aucun token, aucune clé de récupération en localStorage
  (testé M16/M17/M18).

## 3. Repository / data-access layer

- `repositories/profile-repository.js`, `progress-repository.js`,
  `settings-repository.js` : API `get/save/clear` déléguant au cache mémoire Store.
- Les services `user-profile.js`, `progress-service.js`, `settings-service.js`
  appellent maintenant ces repositories (plus d'appels directs à `Store.*` pour les
  données de compte).
- Les repositories n'inventent **aucune persistance** ; source de vérité = Supabase.
- Chargés dans les 23 pages (racine + articles) et dans le `LOAD_ORDER` des tests.

## 4. Supabase RPC

- **`ns_country_metrics()`** (`backend/supabase/functions/rpc_country_metrics.sql`) :
  `SECURITY DEFINER`, `search_path = public`, retourne `{ countries: { ISO: {...} } }`.
  - `missionActivity` = `SUM(mission_activity.completed_count)` par pays.
  - `totalActivity` = `country_activity.completed_count`.
  - `participants` / `toolActivity` / `propagation` = `0` (non encore collectés —
    absence honnête, pas de valeurs fabriquées).
- **`ApiClient.countryMetrics()`** appelle ce RPC (point d'intégration).

## 5. Database changes

- **Aucune nouvelle table** : le RPC réutilise les tables agrégées existantes
  (`countries`, `country_activity`, `mission_activity`). Pas de colonnes dupliquées.
- Nouvelle migration **`0005_country_metrics_privileges.sql`** (contrôle EXECUTE).

## 6. RLS / permissions

- `ns_country_metrics` : `REVOKE EXECUTE ... FROM PUBLIC` + `GRANT ... TO anon,
  authenticated` (migration 0005), cohérent avec 0004.
- `ns_create_session` reste révoqué (aucun accès anon/authenticated/PUBLIC).
- Tous les RPC ont `SECURITY DEFINER` + `search_path = public`.
- `ns_country_metrics` ne lit que les tables agrégées ; aucun identifiant individuel.

## 7. Europe map

- `community.html` : section « Europe Activity » rendue par `europe-map.js`
  (un `<path id="{ISO}">` par pays) + `country-metrics.js` (données).
- Intensité via classes CSS `country--none/very-low/low/medium/high/very-high`
  (variables CSS). Calcul isolé dans `CountryMetrics.intensity`.
- Légende + panneau pays au clic (participants, missions, outils, propagation, total).
- Aucune donnée codée en dur dans le SVG ; les données viennent de `CountryMetrics`.

## 8. Community UI

- `community.js` réécrit : `renderMap`/`renderRanking` utilisent `CountryMetrics` +
  `EuropeMap` ; le classement pays dérive du **même dataset** que la carte (pas de
  seconde source) ; clic sur une ligne synchronise le panneau.
- États vides explicites (« Activity data unavailable ») — **aucune donnée fabriquée**.
- Ancienne `community-map.js` archivée dans `assets/js/legacy/` et retirée des 23 pages.
- Styles CSS obsolètes retirés (`.community-map-svg`, `.community-map-country`,
  `.community-map-legend`).

## 9. Privacy model

- `ns_country_metrics` et `CountryMetrics.normalize` n'exposent que des **agrégats par
  pays**. Aucun `user_id`/`identity_id`/`username`/IP/GPS/device/individuel/timestamp.
- Les champs inconnus sont ignorés à la normalisation ; valeurs invalides → 0.
- Aucun tracking, aucune analytics, aucun suivi individuel.

## 10. Tests

| Suite | Type | Résultat |
|-------|------|----------|
| `tests/sql-audit.mjs` | STATIC | ✅ 135/135 |
| `tests/m14-tests.mjs` | LOCAL+MOCK | ✅ 59/59 |
| `tests/m15-tests.mjs` | MOCK+LOCAL+STATIC | ✅ 44/44 |
| `tests/m16-tests.mjs` | LOCAL+MOCK+STATIC | ✅ 22/22 |
| `tests/m17-tests.mjs` | LOCAL+MOCK+STATIC | ✅ 48/48 |
| `tests/m18-tests.mjs` | LOCAL+MOCK+STATIC | ✅ 38/38 |

M18 couvre : storage (pas de compte/token/clé en localStorage, sessionStorage limité) ;
country metrics (codes valides/invalides, négatifs/NaN/Infinity/oversize, malformé,
champs inconnus, vide) ; map (SVG, lookup FR/DE/ES, code inconnu sans crash, intensité) ;
API (`ns_country_metrics` mocké, réponse malformée → unavailable, backend indisponible,
aucune donnée fabriquée) ; offline (0 requête, aucun stat fabriqué).

`node --check` : **tous les fichiers JS passent** (assets/js + repositories + tests).

## 11. Blocked tests

- **REAL SUPABASE** : exécution des migrations (0001→0005), des RPC (dont
  `ns_country_metrics`), de la RLS sur un vrai projet ; matrice d'authentification ;
  isolation cross-user ; validation navigateur de la carte Europe. Aucun accès, aucun
  CLI, aucun navigateur.

## 12. Remaining technical debt

- `ns_country_metrics` : `participants`/`toolActivity`/`propagation` = 0 tant que les
  compteurs correspondants n'existent pas en base (à collecter dans un futur
  milestone backend).
- `Store` mémoire : cache de session de transition vers Supabase (source de vérité) ;
  à remplacer par des appels `ApiClient` directs quand le backend est en production.
- Les migrations/RPC ne sont pas exécutés sur un vrai projet.

## 13. Risks

- RPC/RLS non exécutés en réel → toute erreur de configuration ne serait détectée
  qu'au déploiement.
- `ns_country_metrics` retourne des 0 pour les métriques non collectées : clair dans
  l'UI (« Activity data unavailable ») mais peut sembler vide en production tant que
  les compteurs n'existent pas.
- Le cache mémoire Store peut laisser croire à une persistance locale sans vrai
  backend ; documenté comme transition.

## 14. Recommended M19

**M19 — Real Supabase Deployment + Country Metrics Backend Data + End-to-End
Validation.** Dès qu'un projet Supabase réel est fourni : déployer migrations 0001→0005
+ RPC, implémenter la collecte de `participants`/`toolActivity`/`propagation`, valider
la carte Europe en navigateur, et ré-éditer ce rapport avec des résultats réels.

---

## Récapitulatif

**CREATED**
- `backend/supabase/functions/rpc_country_metrics.sql`
- `backend/supabase/migrations/0005_country_metrics_privileges.sql`
- `assets/js/repositories/{profile,progress,settings}-repository.js`
- `assets/js/repositories/README.md`
- `tests/m18-tests.mjs`
- `MILESTONE-18-REPORT.md`

**MODIFIED**
- `assets/js/community.js`, `user-profile.js`, `progress-service.js`,
  `settings-service.js`, `profile.js`, `api-client.js`
- `assets/css/pages.css`
- `community.html` (+ repositories injectés dans les 23 pages)
- `tests/run-tests.mjs`, `tests/run-all.sh`, `tests/sql-audit.mjs`, `tests/README.md`
- `docs/europe-activity.md`, `community-api.md`, `database-schema.md`,
  `supabase-architecture.md`, `deployment-guide.md`, `v2-architecture.md`,
  `javascript-architecture.md`
- `backend/supabase/README.md`

**REMOVED / ARCHIVED**
- `assets/js/community-map.js` → archivé dans `assets/js/legacy/community-map.js`
- balises script `community-map.js` retirées des 23 pages HTML
- styles CSS obsolètes `.community-map-svg`/`.community-map-country`/`.community-map-legend`

**TESTED** (LOCAL / MOCKED / STATIC)
- 346 assertions vertes (135 SQL + 59 M14 + 44 M15 + 22 M16 + 48 M17 + 38 M18)
- `node --check` sur tous les fichiers JS : OK

**BLOCKED — REAL SUPABASE**
- Exécution réelle des migrations/RPC/RLS, auth, isolation cross-user, validation
  navigateur de la carte Europe.
