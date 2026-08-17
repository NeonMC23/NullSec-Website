# Milestone 30 — Account-Based Progression & Auth UX

> **Statut :** implémentation + audit livrés. Tests **LOCAL / MOCKED / STATIC** verts.
> **Aucune validation REAL SUPABASE / REAL BROWSER** (pas de projet, de secret ni de
> navigateur accessibles depuis l'environnement).
>
> **Principe directeur :** un compte est un **conteneur privé de progression** et une source
> de **statistiques communautaires agrégées** — **PAS** un profil social. Supabase est la
> source de vérité pour la progression authentifiée.

---

## 1. Audit préalable

### 1.1 Flux d'authentification actuel
- Auth **par recovery key** (pas d'email/mot de passe/OAuth) : `RecoveryKey` → `Auth.register()`
  / `Auth.loginWithRecoveryKey()` → RPC `ns_register`/`ns_login` via `ApiClient`.
- Flag authentifié **en mémoire uniquement** (`Auth.isAuthenticated()`), token court-lived en
  `sessionStorage`. **Jamais** restauré depuis localStorage.

### 1.2 Flux de profil actuel
- `profile.html` est une vue **privée du compte** (pas publique) : résumé, progression,
  récupération (recovery key), auth. Il gère déjà la connexion et le pays.
- Restes legacy dans le **nommage/code** : « local profile », champs
  `Identity.username/display_name/avatar`, libellé « Local · Not authenticated ».

### 1.3 Flux Learning Journey actuel
- `journey.js` charge `/data/missions.json`, rend des cartes de mission et un modal.
- La progression passait par `Progress` (service) → `ProgressRepository` → **mémoire session**
  (pas localStorage). Mais un invité **pouvait** cocher des missions localement (éphémère).
- Texte hero legacy : « Your progress is saved locally ».

### 1.4 Clés localStorage / sessionStorage (audit complet)

| Clé | Type | Rôle | État M30 |
|-----|------|------|----------|
| `ns:theme` | localStorage | Préférence appareil | **Conservé** (légitime) |
| `ns:journey:progress` | localStorage | Progression legacy | **Purge** (`Store.migrate()`) |
| `ns:weekly:progress` | localStorage | Progression legacy | **Purge** |
| `ns:article:read:*` | localStorage | Progression legacy | **Purge** |
| `ns:identity` | localStorage | Donnée compte | **Purge** (mémoire uniquement) |
| `ns:user:profile` | localStorage | Donnée compte | **Purge** |
| `ns:progress` | localStorage | Donnée compte | **Purge** |
| `ns:settings` | localStorage | Donnée compte | **Purge** |
| `ns:auth` | localStorage | Donnée compte | **Purge** |
| `ns:user:state` | localStorage | Donnée compte | **Purge** |
| `ns:recovery` | localStorage | Donnée compte | **Purge** |
| `ns:session:recovery` | sessionStorage | Clé NSK1 short-lived | **Conservé** (auth) |
| `ns:session:auth` | sessionStorage | Token short-lived | **Conservé** (auth) |

### 1.5 Tables/RPC Supabase impliqués
- **Tables** : `users` (compte), `user_progress` (progression), `user_profiles` (pays + min),
  `country_membership` (pays), `sessions` (auth), `recovery_credentials`, `community_activity_events`.
- **RPC** : `ns_register`, `ns_login`, `ns_logout`, `ns_validate_session`, `ns_sync_pull`,
  `ns_sync_push`, `ns_update_profile`, `ns_record_activity`, `ns_country_metrics`, etc.

### 1.6 Politiques RLS
- Tables privées : **aucun accès anon** ; accès via RPC `SECURITY DEFINER` token-authentifiés.
- Agrégats publics : SELECT anon uniquement.
- **Non affaiblies en M30.**

### 1.7 Réutilisable / obsolète
- **Réutilisable** : toute la couche auth recovery-key, le sync layer (`ns_sync_push`),
  le modèle de progression serveur, la vue privée du compte.
- **Obsolète / à nettoyer (milestones futurs)** : identité « locale », libellés « local
  profile », logique de complétion locale, page Community non agrégée, clés legacy purgées.

---

## 2. Correctif minimal implémenté

### 2.1 Le Learning Journey exige l'authentification
- **`journey.js`** : ajout de `isAuthenticated()` + `buildAuthCTA()` + `showAuthCTA()`.
  - Invité → CTA « Start your Learning Journey » dans `#progress-overview`.
  - `toggleMission()` refuse la complétion d'un invité (affiche le CTA, ne toggles rien).
  - `renderAll()` : invité → CTA ; connecté → « Your Progress (saved to your account) ».
- **`progress-service.js`** : `Progress.complete()` / `uncomplete()` refusent un invité
  (`canPersistProgression()`). **Aucune complétion de mission locale/anonyme.**
- **`home.js`** : la mission hebdomadaire des invités affiche « Create account to track
  progress » (lien vers `profile.html`) au lieu du bouton « Mark as done ».
- **`journey.html`** : hero mis à jour (« Create an account to save your progress… »), plus
  aucune mention « saved locally ».
- **`components.css`** : styles du CTA (`journey-auth-*`).

### 2.2 Persistance serveur
- Réutilise le sync layer existant : toute mutation de progression d'un utilisateur connecté
  déclenche `Sync.notifyChanged()` → `ns_sync_push`. Rafraîchissement/autre appareil → pull.

---

## 3. Livrables demandés

### Files changed
- `assets/js/journey.js`
- `assets/js/progress-service.js`
- `assets/js/home.js`
- `journey.html`
- `assets/css/components.css`
- `tests/m30-tests.mjs` (nouveau)
- `tests/run-all.sh` (étape 19)
- `docs/account-based-progression.md` (nouveau)
- `MILESTONE-30-REPORT.md` (ce fichier)

### Files intentionally left untouched
- `backend/supabase/**` (schéma, RPC, scripts, migrations) — **aucun changement backend** : le
  modèle Supabase satisfait déjà l'exigence ; aucune table/RPC dupliqué.
- `profile.html` / `profile.js` (vue privée du compte) — pas de redessin ; nettoyage du
  nommage legacy prévu dans un milestone futur.
- `community.html` / `community.js` — redessin agrégé prévu dans un milestone futur.
- `data-loader.js`, `api-client.js` — non modifiés.

### Database / RPC changes
- **Aucun.** Aucune migration, aucun RPC ajouté/modifié. Réutilisation de `users`,
  `user_progress`, `user_profiles`, `country_membership`, `sessions`,
  `ns_sync_push`/`ns_sync_pull`, `ns_register`/`ns_login`, `ns_record_activity`.

### Authentication flow (nouveau)
1. Invité visite le Journey → voit le CTA, ne peut pas compléter de mission.
2. `Sign in` / `Create account` → `profile.html` (recovery key) → `Auth.register/login`
   → `ns_register`/`ns_login` → token session.
3. Connecté → le Journey rend la progression privée ; complétion persistée via `ns_sync_push`.

### localStorage dependencies discovered / removed / scheduled
- **Découvertes** : tableau §1.4.
- **Déjà supprimées (purge `Store.migrate()`)** : `ns:journey:progress`, `ns:weekly:progress`,
  `ns:article:read:*`, et les clés compte (`ns:identity`, `ns:user:profile`, `ns:progress`,
  `ns:settings`, `ns:auth`, `ns:user:state`, `ns:recovery`).
- **Conservés (légitimes)** : `ns:theme` (préférence appareil), `ns:session:*` (session
  court-lived nécessaire à l'auth).
- **À nettoyer (milestones futurs)** : logique/composants legacy de profil local, logique de
  complétion locale restante, keys éventuelles non couvertes, page Community.

### RLS / security validation
- **Non affaiblie.** Tables privées fermées à anon ; agrégats publics uniquement.
- Pays **privé au niveau individuel** ; la couche communautaire n'expose que des agrégats.
- **Aucune** clé service-role en frontend (vérifié par `sql-audit` + tests M14).
- Le gating frontend ne fausse pas la sécurité : la **RLS serveur reste l'autorité** pour
  l'accès à la progression privée (un invité ne peut appeler `ns_sync_pull/push` sans session).

### Tests executed and results
- `tests/run-all.sh` → **toutes suites vertes** :
  - `sql-audit` 235 · m14 59 · m15 44 · m16 22 · m17 48 · m18 38 · m19 29 · m20 61 · m21 26 ·
    m22 23 · m24 25 · m25 24 · m26 26 · m27 43 · m28 72 · m28-deploy 26 · m29 19 · **m30 26**
  - **Total : 846 assertions vertes.**
- `node --check` sur tous les fichiers JS modifiés : OK.
- **Nouveau `tests/m30-tests.mjs`** (26) : invité ne peut pas compléter localement (zéro
  réseau, aucune complétion), connecté peut compléter, états auth, gating statique du Journey,
  absence de persistance locale, routage activité via `ActivityService`.

### Remaining limitations
- **Aucune** validation REAL SUPABASE (connexion, RLS runtime, persistance réelle) ni
  REAL BROWSER (rendu DOM, rafraîchissement) — BLOCKED sans projet/secret/navigateur.
- Les zones héritées (profil local, page Community, keys legacy) restent **documentées** pour
  suppression dans les milestones « Future Cleanup », « Future Journey », « Future Community ».
- Le redessin de la page Community et la refonte du parcours (« Authenticated → Campaigns →
  Mission → Complete → Supabase ») sont des **follow-ups documentés**, non implémentés ici.

---

## 4. Critères d'acceptation (état)

- ✅ Invité peut parcourir le contenu public.
- ✅ Invité ne peut pas créer/sauver un Learning Journey localement (gating UI + service).
- ✅ Le Learning Journey exige l'authentification.
- ⚠️ Sign in / création de compte : flux implémenté côté frontend (recovery key → RPC) ;
  **exécution réelle contre la production BLOCKED**.
- ✅ Utilisateur authentifié accède à sa progression (persistance serveur via sync existant).
- ✅ Complétion de mission persistée côté serveur (via `ns_sync_push`) pour l'utilisateur connecté.
- ✅ Rafraîchissement/autre appareil : restauration via pull serveur (mécanisme en place).
- ✅ Aucun profil public introduit ; la vue `profile.html` reste privée.
- ✅ Isolation inter-utilisateurs via RLS (renforcée, non affaiblie).
- ✅ Pays privé au niveau individuel ; données communautaires agrégées.
- ✅ Aucun nouveau fallback localStorage.
- ✅ Dépendances localStorage/progression auditées + documentées pour suppression.
- ✅ RLS préservée ; aucune clé service-role en frontend.
- ✅ Tests existants verts ; nouveaux tests couvrent auth + contrôle d'accès progression.
- ✅ Documentation mise à jour (`docs/account-based-progression.md`, ce rapport).
