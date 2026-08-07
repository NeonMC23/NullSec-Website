# Milestone 17 Implementation Report
### Architecture Cleanup, Supabase-First Data Model & Europe Activity UI Preparation — NullSec Platform V2

> Date : 7 août 2026 · **Honestité** : aucun projet Supabase réel n'est disponible (pas
> d'env, pas de CLI, pas de navigateur). Rien n'est « validé en production » ; les
> tests sont étiquetés **LOCAL / MOCKED / STATIC / BLOCKED / REAL SUPABASE**.

---

## Décision architecturale finale

« **Supabase est la source de vérité unique des comptes et des données utilisateur
persistantes.** » Le navigateur est un **client**, pas une base de données.

Il n'existe **plus** de « compte local + compte Supabase ». Il n'y a qu'un
**compte Supabase** + un **état navigateur temporaire** (mémoire + session courte).

## 1. Fichiers créés

- `assets/js/country-metrics.js` — données pays : contrat API, chargement,
  normalisation, validation, état indisponible.
- `assets/js/europe-map.js` — carte SVG Europe : init, lookup, classes d'intensité,
  hover/click.
- `docs/europe-activity.md` — document dédié (modèle de confidentialité, contrat,
  SVG, API, normalisation, ce qui n'est pas suivi).
- `tests/m17-tests.mjs` — suite de tests M17 (storage, session, country metrics, map,
  offline).

## 2. Fichiers modifiés

- `assets/js/store.js` — identity/profile/progress/settings désormais **mémoire de
  session** ; localStorage réservé à `ns:theme` + migration ; **purge** des anciennes
  clés compte (ns:identity/profile/progress/settings/auth/user:state/recovery +
  clés legacy progress/articles) au chargement.
- `assets/js/articles.js` — état de lecture via `Progress.isArticleRead` (mémoire) au
  lieu de `Store.get` (localStorage).
- `assets/js/api-client.js` — ajout du **point d'intégration placeholder**
  `ApiClient.countryMetrics()` (futur `ns_country_metrics`).
- `assets/css/pages.css` — classes SVG Europe + intensité (variables CSS).
- `tests/run-tests.mjs` — shim DOM/SVG (`createElementNS`, `querySelector`), dataset
  statique servi au fetch shim, nouveaux modules au LOAD_ORDER.
- `tests/run-all.sh`, `tests/README.md` — suite M17.
- Docs : `v2-architecture.md`, `session-management.md`, `supabase-architecture.md`,
  `javascript-architecture.md`, `community-api.md`, `database-schema.md`,
  `deployment-guide.md`.

## 3. Fichiers supprimés

Aucun fichier supprimé. Les données de compte sont déplacées de localStorage vers la
mémoire ; aucun fichier entier n'est retiré.

## 4. Persistance locale retirée

`Store.getIdentity/saveIdentity/deleteIdentity`, `getProgress/...`,
`getProfile/...`, `getSettings/...` écrivent désormais dans un **cache mémoire de
session** (plus jamais en localStorage). `Store.migrate()` purge au chargement :
`ns:identity`, `ns:user:profile`, `ns:progress`, `ns:settings`, `ns:auth`,
`ns:user:state`, `ns:recovery`, `ns:journey:progress`, `ns:weekly:progress`, et les
clés dynamiques `ns-article-*` legacy. La migration legacy `nullsec-theme → ns:theme`
est conservée (préférence d'appareil légitime).

## 5. Audit de stockage

| Technologie | Utilisé ? | Usage | Conforme M17 |
|-------------|-----------|-------|--------------|
| `localStorage` | Oui (Store) | `ns:theme` + marqueur de migration uniquement | ✅ |
| `sessionStorage` | Oui (SessionStore, seul accès) | `ns:session:auth` + `ns:session:recovery` | ✅ |
| IndexedDB | Non | — | ✅ |
| Cookies | Non | — | ✅ |
| Cache API | Non | — | ✅ |

**Testé (LOCAL, m17-tests) :** localStorage ne contient pas identity/profile/progress/
settings/token/recovery/auth/user-state ; sessionStorage ne contient que les 2 clés
approuvées.

## 6. Implémentation SVG Europe

- `europe-map.js` génère un **unique `<svg>`** avec un `<path id="{ISO_CODE}">` par
  pays — pas des centaines d'éléments HTML.
- Le SVG est **présentation pure** ; les données arrivent via `CountryMetrics` et sont
  appliquées en classes CSS (`country--none/very-low/low/medium/high/very-high`).
- Identifiants ISO-3166 alpha-2 stables. Un dataset géographique précis peut être
  injecté sans changer le contrat (un `<path id="XX">` par pays).
- Couverture prévue : FR, DE, ES, IT, BE, NL, LU, CH, AT, PL, CZ, SK, HU, RO, BG, GR,
  HR, SI, RS, BA, ME, MK, AL, XK, DK, SE, NO, FI, IS, IE, PT, GB, EE, LV, LT, UA, MD,
  BY… (le module supporte tout code ISO ; la forme géométrique est ajoutable par pays).

## 7. Contrat de données pays

`CountryMetrics.normalize()` accepte :
```json
{ "countries": { "FR": { "participants": 42, "missionActivity": 183,
  "toolActivity": 71, "propagation": 25, "totalActivity": 279 } } }
```
ou un tableau `[{ countryCode, ... }]`. Valide : codes ISO, numériques finis ≥ 0 ;
rejette NaN/Infinity/négatifs/oversize (→ 0) ; ignore les champs inconnus (aucun
identifiant individuel ne fuit).

## 8. Modèle de confidentialité

Seules des **statistiques agrégées par pays**. Aucune exposition de `user_id`,
`identity_id`, `username`, clé, IP, GPS, device id, historique individuel, session ou
timestamp individuel. Aucune donnée fausse en l'absence de backend → état
**« Activity data unavailable »**.

## 9. Tests

| Suite | Type | Résultat |
|-------|------|----------|
| `tests/sql-audit.mjs` | STATIC | ✅ 125/125 |
| `tests/m14-tests.mjs` | LOCAL+MOCK | ✅ 59/59 |
| `tests/m15-tests.mjs` | MOCK+LOCAL+STATIC | ✅ 44/44 |
| `tests/m16-tests.mjs` | LOCAL+MOCK+STATIC | ✅ 22/22 |
| `tests/m17-tests.mjs` | LOCAL+MOCK+STATIC | ✅ 48/48 |

M17 couvre : absence de données de compte en localStorage ; sessionStorage limité ;
session sans résurrection de compte local ; validation country metrics (codes
valides/invalides, négatifs/NaN/Infinity/oversize, champs inconnus, malformed/empty) ;
lookup FR→France/DE→Germany/ES→Spain + code inconnu sans crash ; offline → 0 requête
backend, aucune donnée fabriquée.

## 10. Dette technique restante

- **Modules Europe non branchés sur une page HTML** : `country-metrics.js` et
  `europe-map.js` sont prêts mais pas intégrés à `community.html` (M17 = préparation,
  pas de nouvelle UI). Le branchement UI relève d'un milestone produit.
- **`progress-service.migrateLegacy`** : lit encore d'anciennes clés legacy (qui sont
  maintenant purgées) → ne migre rien et produit un état vide. Inoffensif mais
  pourrait être simplifié.
- **Formula de normalisation** (`CountryMetrics.intensity`) : seuils provisoires,
  modifiables sans réécrire l'UI (couché isolée).
- **RPC `ns_country_metrics`** : non implémenté (dette volontaire — milestone backend).
- Pas de vrai Supabase : validation réelle BLOCKED.

## 11. Bloqueurs

- **Aucun projet Supabase réel** (env + CLI absents) → migrations/RPC/RLS non
  exécutés, auth/sync non validés en production.
- **Aucun navigateur** disponible → validation browser BLOCKED.
- Réalisation de la carte Europe avec un vrai RPC et données réelles → BLOCKED.

## 12. Recommandation M18

**M18 — Real Supabase Deployment + Country Metrics Backend + End-to-End Europe
Activity Validation.** Dès qu'un projet Supabase réel est fourni :
1. Déployer migrations (0001→0004) + RPC (auth/sync/activity) + RLS.
2. Implémenter le RPC **`ns_country_metrics`** (agrégat par pays à partir de
   `country_activity`/`mission_activity`/`region_activity`).
3. Brancher `country-metrics.js`/`europe-map.js` sur `community.html`.
4. Exécuter la matrice runtime complète et ré-éditer ce rapport avec les résultats
   réels (REAL SUPABASE).

En l'état, M17 remplit ses critères d'acceptation : Supabase = source de vérité
unique, aucun compte local, caches de compte retirés de localStorage, sessionStorage
limité à la session courte, session sans résurrection, code obsolète purgé, modules
Europe modulaires, confidentialité agrégée, tests verts (298), aucune validation
Supabase réelle prétendue.
