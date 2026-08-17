# Milestone 35 — Community Dashboard & Aggregated Intelligence

> **Statut :** implémenté. Tests **LOCAL / MOCKED / STATIC** verts.
> **REAL SUPABASE: BLOCKED** — **REAL BROWSER: BLOCKED** (pas de projet/secret/navigateur
> accessibles depuis l'environnement).
>
> **Principe :** *Community is not a social network. It is an aggregated view of collective
> activity. Users are never individually visible. Usernames, avatars, account identifiers and
> personal progression must never appear in Community.*

---

## 1. AUDIT INITIAL

- **Community.js existant** : déjà agrégé (pas de username/avatar/user dans le code de rendu).
  Rendu de stats globales, régions, carte Europe, panneau pays, classement, participation,
  action communautaire.
- **HTML** : structure « Global Impact / Your participation / Europe Activity / Active Regions /
  Mission Activity / Community Challenges / Country Ranking / Community Projects /
  Community Participation ».
- **Services** : `CommunityMetrics` (ns_metrics), `Community` (communityStats/map/missions),
  `CountryMetrics` (ns_country_metrics). Tous agrégés.
- **Backend** : `ns_country_metrics` fournit déjà participants, missionActivity, toolActivity,
  communityActivity, propagation, totalActivity par pays ; `ns_metrics` fournit le global.
- **Constat** : les données agrégées **existaient déjà**. Aucune donnée manquante → **aucun
  backend modifié, aucune migration**.

## 2. ARCHITECTURE COMMUNITY AVANT / APRÈS

**Avant** : page avec 9 sections hétérogènes (stats globales + régions + missions + challenges
+ classement) mais pas d'« overview » unifié ni de « breakdown par type ».

**Après** (M35) :
```
Community
├── Hero (« Collective activity across NullSec »)
├── Community Overview      (Total participants, Countries represented,
│                             Missions completed, Community activity)
├── Country Activity        (barres horizontales agrégées par pays)
├── Activity Breakdown      (Missions / Tools / Community actions / Propagation)
├── Europe Activity Map     (agrégat visuel)
├── Your participation      (authentifié, contribution)
└── Privacy note
```

## 3. FICHIERS MODIFIÉS

- `community.html` — nouvelle structure (Hero, Overview, Country Activity, Activity
  Breakdown, map, participation, privacy note, projects).
- `assets/js/community.js` — refonte : `renderOverview()`, `renderCountryActivity()`
  (barres), `renderActivityBreakdown()`, `renderMap()`/`renderCountryPanel()` conservés,
  `renderParticipation()`, `renderCommunityAction()`, `renderPrivacyNote()`. Data flow
  `CountryMetrics.getData()` → RPC agrégé → UI.
- `assets/css/pages.css` — styles `.activity-row`, `.activity-bar`, `.activity-bar-wrap`,
  `.activity-bar-value`, `.breakdown-stat`.
- `tests/m35-tests.mjs` — **créé** (35 assertions).
- `tests/run-all.sh` (étape 24), `tests/README.md`.
- `docs/community-architecture.md` — **créé**.
- `docs/account-based-progression.md`.

## 4. FICHIERS CRÉÉS

- `tests/m35-tests.mjs`
- `docs/community-architecture.md`
- `MILESTONE-35-REPORT.md`

## 5. FICHIERS SUPPRIMÉS

- Aucun.

## 6. BACKEND

- **Non modifié.** Les agrégats nécessaires existaient déjà
  (`ns_country_metrics`, `ns_metrics`, `v_country_metrics`). Aucune migration ajoutée ;
  `0001→0017` intactes.

## 7. RPC UTILISÉS

- `ns_country_metrics` (participants / missionActivity / toolActivity / communityActivity /
  propagation / totalActivity par pays + lastUpdate) — via `CountryMetrics.getData()`.
- `ns_metrics` (global) — via `CommunityMetrics` (couche service, non modifiée).
- `ns_record_activity` / `ns_tool_activity` via `ActivityService` / `CommunityActionService`
  pour les contributions authentifiées (contracts M26/M27 conservés).

## 8. MODÈLE DE CONFIDENTIALITÉ

Interdit dans la couche Community (testé) : `user_id`, `identity_id`, `username`, `avatar`,
`password`, `recovery`, `session token`, lists de membres, profile cards. Le frontend ne lit
**jamais** les tables privées (`users`, `user_profiles`, `user_progress`). Pays = agrégat
uniquement. Être connecté n'ouvre aucun accès individuel.

## 9. TESTS AJOUTÉS

`tests/m35-tests.mjs` (35) : Community privacy (aucun identifiant individuel), agrégation
(CountryMetrics source, pas de lecture tables privées, pas de storage), structure de page,
états loading/empty/error, activity breakdown, stockage local absent, terminologie legacy
absente, contrats UI (CommunityActionService, pas de fetch), agrégation RPC SQL.

## 10. RÉSULTAT run-all.sh

Toutes les suites **vertes** :
- sql-audit 240 · m14 59 · m15 44 · m16 22 · m17 47 · m18 38 · m19 29 · m20 61 · m21 26 ·
  m22 23 · m24 25 · m25 24 · m26 26 · m27 43 · m28 72 · m28-deploy 26 · m29 19 · m30 28 ·
  m31 31 · m32 45 · m33 56 · m34 60 · **m35 35**

## 11. NOMBRE TOTAL D'ASSERTIONS

**1079** (1044 → 1079).

## 12. node --check

Tous les JS (assets + repositories + tests) : **OK**.

## 13. bash -n

`tests/run-all.sh`, `backend/supabase/scripts/deploy.sh`, `backend/supabase/scripts/apply-sql.sh` :
**OK**.

## 14. LIMITATIONS REAL SUPABASE / REAL BROWSER

- **REAL SUPABASE : BLOCKED** — aucun appel réel aux RPC agrégés contre la production.
- **REAL BROWSER : BLOCKED** — le rendu DOM de la nouvelle page Community n'a pas été validé
  visuellement.

## 15. TRAVAIL RESTANT

- Validation réelle de la page (REAL BROWSER) et des RPC agrégés (REAL SUPABASE) une fois un
  projet/navigateur disponibles.
- Ajout éventuel de graphiques historiques si des données historiques fiables existent
  (aucune source actuellement — non inventées).
- Redessin plus poussé des « Community Projects » (statique) si souhaité — hors périmètre.
