# Milestone 36 — Campaign-Based Learning Journey & Progression UX

> **Statut :** implémenté. Tests **LOCAL / MOCKED / STATIC** verts.
> **REAL SUPABASE: BLOCKED** — **REAL BROWSER: BLOCKED** (pas de projet/secret/navigateur
> accessibles depuis l'environnement).
>
> **Principe :** *Journey is not a profile, not local storage, and not a social feature. It is
> the private learning interface of an authenticated NullSec account. Guest users can discover
> the public learning content, but cannot own or modify progression. Authenticated users get a
> persistent server-backed progression organized as Campaigns → Missions.*

> Note : ce milestone partage le numéro M36 avec le milestone *Account Management & Server
> Session Lifecycle*. Le présent rapport couvre spécifiquement le **parcours par campagnes**.
> Le fichier `tests/m36-tests.mjs` a été **étendu** pour couvrir les deux.

---

## AUDIT FINDINGS

- Le Journey existait déjà en **stages 1–4** (Getting Started, Build Better Habits, Take Back
  Control, Advanced) + mission hebdomadaire (stage 0). Les missions de `data/missions.json` ont
  un champ `stage` (1–4).
- L'authentification (M30–M35) et la persistance serveur (`Progress → Sync → ns_sync_push`)
  étaient déjà correctement en place, avec le gating invité.
- **Écart M36** : le Journey listait les missions par stage sans **vue d'ensemble de campagnes**
  (cards avec %/statut), sans **next mission**, et le concept de « campagne » n'était pas
  explicitement présenté.
- **Constat** : les métadonnées de stage suffisent à dériver des **Campagnes** — **aucune
  modification DB, aucune nouvelle structure de données backend**.

## ROOT CAUSE

M36 est une amélioration d'**architecture d'information et d'UX** : le modèle data
(`missions.json` + stages) et la persistance Supabase étaient déjà suffisants. Il manquait une
couche « Campagne » présentée à l'utilisateur, dérivée des stages, avec progression et next
mission.

## CHANGES

### Frontend (aucun backend)
- **`journey.js`** :
  - Définition de `campaigns` (id, stage, titre, description, icône) dérivée des stages.
  - `campaignMissions(stage)` — missions ordonnées de façon déterministe (order puis id).
  - `campaignStats(campaign)` — completed/total/percentage/status dérivés de la progression.
  - `nextMission()` / `allCampaignsCompleted()` — first incomplete mission of first
    non-completed campaign ; tout est dérivé, rien n'est stocké séparément.
  - `renderCampaignOverview()` — cards de campagnes (statut, compteur, barre, %).
  - `renderNextMission()` — CTA « next mission » / « All campaigns completed ».
  - Wiring dans `renderAll()` ; exposition via `window.Journey.getCampaigns()`,
    `getCampaignByStage()`, `campaignMissions()`, `campaignStats()`, `nextMission()`,
    `allCampaignsCompleted()`.
- **`journey.html`** : ajout des conteneurs `#next-mission` et `#campaign-overview`.
- **`assets/css/components.css`** : styles `.campaign-*` (grid, cards, barre, statut) et
  `.next-mission-*`.

### Tests / infra
- **`tests/m36-tests.mjs`** — **étendu** (sections 11–15, +26 assertions) : structure des
  campagnes, progression+next mission (MOCKED), guest sans progression locale, absence de
  terminologie legacy, pas de credentials/données privées dans le rendu.
- **`tests/run-tests.mjs`** — le shim `document` fournit maintenant `querySelector`/
  `querySelectorAll` (retourne null/[]) pour que `journey.js` se charge sans DOM complet.
- `tests/run-all.sh` (étape 25, libellé mis à jour), `tests/README.md`.
- `docs/account-based-progression.md`.

### Fichiers créés
- `MILESTONE-36-REPORT-JOURNEY.md` (ce rapport).

### Fichiers supprimés
- Aucun.

### Migrations ajoutées
- **NONE.** `0001→0017` intactes. Aucun RPC modifié.

## TARGET INFORMATION ARCHITECTURE

```
Learning Journey
├── Hero (title + explanation + account/progress context)
├── Next mission CTA (authenticated; derived)
├── Campaign Overview (cards: status, completed/total, %, description)
└── Campaign mission grids (per stage)
```

## CAMPAIGN MODEL

- **Campagnes publiques** (définitions statiques, dérivées des stages).
- **Progression privée** (données utilisateur authentifiées).
- Statuts : `Not started` / `In progress` / `Completed` / `No missions`.
- Next mission dérivée : `first incomplete mission of first non-completed Campaign` ; sinon
  « All campaigns completed ».

## GUEST / AUTHENTICATED

- **Invité** : CTA « Create an account to save your mission progress… » ; peut parcourir les
  descriptions publiques ; ne peut pas compléter, aucune progression locale, aucun sync.
- **Authentifié** : voit son overview de campagnes + next mission ; complétion via
  `Progress.complete() → Sync → ns_sync_push → Supabase` ; `Progress.reload()` restaure après
  sign-in / autre appareil.

## SECURITY / PRIVACY

- Frontend gate = UX uniquement ; le serveur reste l'autorité.
- Aucun `p_user_id` client ; aucun service-role ; aucune donnée de compte en localStorage ;
  aucun password/recovery/token rendu en HTML.
- Community reste agrégée et indépendante de la progression individuelle (aucun « top
  learners », username ranking, avatar, follower).
- RLS inchangée.

## TESTS

Suite complète `run-all.sh` — **toutes vertes** :
- sql-audit 248 · m14 59 · m15 44 · m16 22 · m17 47 · m18 38 · m19 29 · m20 61 · m21 26 ·
  m22 23 · m24 25 · m25 24 · m26 26 · m27 43 · m28 72 · m28-deploy 26 · m29 19 · m30 28 ·
  m31 31 · m32 45 · m33 56 · m34 60 · m35 80 · **m36 86**
- **Total : 1218 assertions vertes.**

Sections M36 Campaign ajoutées dans `tests/m36-tests.mjs` :
- **11. Campaign structure** : campagnes présentes/déterministes ; missions rattachées à un
  stage ; ordre mission déterministe.
- **12. Campaign progress + next mission** (MOCKED) : stats dérivées, statuts, % ,
  next-mission déterministe, passage à la campagne suivante.
- **13. Guest** : ne peut pas compléter ; aucune progression en localStorage/sessionStorage ;
  aucun sync push.
- **14. Legacy** : absence de « saved locally / local progress / anonymous progress / local
  profile » ; présence de « Campaigns » + « next mission ».
- **15. Security** : aucun credential/private data rendu ; aucun storage local.

**node --check** : tous JS + tests — OK. **bash -n** : run-all.sh, deploy.sh, apply-sql.sh — OK.

## REMAINING LIMITATIONS

- **LOCAL / STATIC / MOCKED** : validation via harness Node + audit statique.
- **REAL SUPABASE : BLOCKED** — aucun `ns_sync_pull/push` réel contre la production.
- **REAL BROWSER : BLOCKED** — le rendu DOM de l'overview des campagnes et du next mission
  n'a pas été validé visuellement.
- Les missions n'ont pas de champ `order` explicite ; l'ordre au sein d'une campagne est
  déterministe (tri par `order` puis par id). Si un ordre éditorial précis est souhaité, un
  champ `order` dans `missions.json` suffirait (sans modification backend).

## ACCEPTANCE CRITERIA

- ✅ Journey organisé en Campaigns → Missions.
- ✅ Ordre déterministe des campagnes et des missions.
- ✅ Progression de campagne dérivée de la progression réelle.
- ✅ Next mission dérivée, non stockée séparément.
- ✅ Guest parcourt le contenu public, ne peut pas compléter, aucune progression locale.
- ✅ Aucune progression Journey en localStorage/sessionStorage.
- ✅ Authentifié voit la progression privée ; complétion via Progress → Sync → Supabase.
- ✅ Sign-in restaure la progression serveur ; cross-device sans données locales.
- ✅ Reset progress (si retenu) reste authentifié + serveur ; sign out ne supprime pas la
  progression serveur.
- ✅ Aucun changement d'authentification ; pas d'email ; username+password normal ; recovery
  = récupération.
- ✅ Aucun profil/username/avatar public ; aucun feature social.
- ✅ Community agrégée ; aucune fuite de progression privée.
- ✅ Aucun service-role ; RLS inchangée.
- ✅ Tests existants verts ; m36 vert ; node --check vert ; bash -n vert ; run-all.sh vert.
- ✅ Documentation mise à jour.

## FINAL ARCHITECTURAL PRINCIPLE

```
PUBLIC → Campaigns → Missions
────────────────────────────
AUTHENTICATION REQUIRED
────────────────────────────
Private Journey → User Progress → Sync → Supabase
```

Campaign definitions are public. Progression is private. The account exists on the server, not
in the browser. The browser contains only the temporary authentication session and legitimate
UI preferences. Community never becomes a social network.
