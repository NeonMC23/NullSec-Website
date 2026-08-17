# Legacy Profile & Local-State Cleanup (Milestone 31)

> **Milestone 31.** Suppression des concepts legacy « profil local » / « état local » du
> frontend. Architecture cible :
> `Auth` → `Account` → `Progress` → `Community`, avec **Supabase comme source de vérité**
> pour la progression authentifiée, et **aucun profil local ni profil public**.

---

## 1. Ce que l'architecture legacy était

Avant M30/M31, le frontend comportait des concepts hérités de l'architecture
« local-profile / localStorage » :

- **`Identity` local** : objet d'identité locale portant `username`, `display_name`, `avatar`
  (profil social local inutile).
- **`UserProfile` « local profile »** : objet de profil local (pseudo, avatar seed).
- **Page `profile`** : rendue comme un **profil social** (avatar, éditeur de pseudo).
- **Clés localStorage de compte** : `ns:identity`, `ns:user:profile`, `ns:progress`,
  `ns:settings`, `ns:auth`, `ns:user:state`, `ns:recovery`, `ns:journey:progress`,
  `ns:weekly:progress`, `ns:article:read:*`.
- **Mode « local »** : `UserState.getMode()` renvoyait `'local'` (compte local non authentifié).
- **Terminologie** : « Local · Not authenticated », « saved locally », « local profile ».
- **Export/Import local** de données de profil.

## 2. Ce qui a été supprimé

- **`assets/js/legacy/community-map.js`** — composant obsolète non chargé par aucune page.
- **`identity.js`** — champs `username` / `display_name` / `avatar` supprimés (l'identité est
  réduite à l'UUID de compte + timestamps). Méthode `Identity.update()` retirée.
- **`profile.js`** — avatar + éditeur de pseudo supprimés ; `renderExport`, `renderImport`,
  `renderFullReset` supprimées (export/import/réinitialisation de profil local).
- **`profile.html`** — section « Your Data » (export/import) remplacée ; page re-titrée
  **Account** ; métadonnées mises à jour.
- **`store.js`** — clés legacy (`JOURNEY_PROGRESS`, `WEEKLY`, `ARTICLE_READ`) supprimées ;
  purge des données de compte supprimée (plus de couche de compatibilité) ;
  `clearNamespace`, `listKeys` (code mort) supprimés. Seule la **clé `ns:theme`** persiste.
- **`user-state.js`** — mode `'local'` supprimé (uniquement `anonymous` | `authenticated`).
- **Navigation** — tous les liens `Profile` → `Account` (24 liens dans 8 pages).
- **Terminologie user-facing** — « Local · Not authenticated » → « Not authenticated »,
  « Loading your local statistics » → « Loading your statistics », commentaires « local
  profile » → « account ».

## 3. Ce qui a été conservé (et pourquoi)

- **`ns:theme`** (localStorage) — préférence appareil (thème), pas une donnée utilisateur.
- **`ns:session:recovery`**, **`ns:session:auth`** (sessionStorage) — mécanisme d'auth
  recovery-key court-lived. Requis, non traités comme progression/profil, non exposés.
- **`UserProfile`** (mémoire session + sync) — conserve `username`/`avatar_seed` car la table
  Supabase `user_profiles` les stocke ; ce sont des **données de compte privées** (jamais
  exposées publiquement, aucun UI pseudo/avatar). Source de vérité : Supabase.
- **`ProfileRepository`, `ProgressRepository`, `SettingsRepository`** — couche d'accès
  mémoire session ; **ProgressRepository** alimente le sync layer → Supabase.
- **Backend Supabase** (migrations, RPC, scripts) — **inchangé** (aucune incompatibilité
  prouvée ; réutilisation de `users`, `user_progress`, `user_profiles`, `ns_sync_push/pull`,
  `ns_register/login`).

## 4. Usage localStorage restant

```
localStorage:
  ns:theme            (préférence appareil — seule clé persistante intentionnelle)
  ns:migrated:v1      (marqueur de migration du thème)
```

Aucune donnée de compte/progression n'est écrite en localStorage.

## 5. Usage sessionStorage restant

```
sessionStorage:
  ns:session:recovery   (clé de récupération NSK1 — court-lived)
  ns:session:auth       (token de session — court-lived)
```

## 6. Flux d'authentification (final)

```
Guest
  ↓
Public content
  ↓
Sign in / Create account  (recovery-key)
  ↓
ns_register / ns_login
  ↓
Authenticated account  (token session court-lived)
```

## 7. Flux de progression (final)

```
Authenticated account
  ↓
Journey
  ↓
Mission completion   (Progress.complete, gated par auth)
  ↓
Sync layer (ns_sync_push) → Supabase → PostgreSQL
  ↓
Progress restored (pull au chargement / autre appareil)
```

Aucun fallback local. Un invité n'a **aucun** état de progression.

## 8. Fichiers supprimés

- `assets/js/legacy/community-map.js`

## 9. Fichiers refactorés

- `assets/js/identity.js`
- `assets/js/user-state.js`
- `assets/js/profile.js`
- `assets/js/store.js`
- `assets/js/user-profile.js` (commentaires/terminologie)
- `assets/js/recovery-key.js` (commentaires)
- `assets/js/progress-service.js` (commentaires)
- `profile.html`
- `*.html` (navigation `Profile` → `Account`)
- `tests/m17-tests.mjs`, `tests/m30-tests.mjs` (mis à jour), `tests/m31-tests.mjs` (nouveau),
  `tests/run-all.sh`, `tests/README.md`

## 10. Code de compatibilité conservé intentionnellement

- **Aucun** fallback de profil local ni de progression locale n'a été conservé.
- Les champs `username`/`avatar_seed` dans `UserProfile` (sync Supabase) sont conservés pour
  la compatibilité du contrat RPC backend, mais sans UI ni exposition publique.

## 11. Candidats à nettoyage futur

- `backend/legacy-express/` et `backend/supabase/legacy-ts/` — anciens backends non utilisés
  (hors périmètre backend, à supprimer dans un milestone dédié).
- Docs legacy : `docs/identity-schema.md`, `docs/profile-*`, `docs/settings-schema.md`
  (à réécrire/repointer sur le modèle compte).
- Redessin complet de la page Community (agrégats uniquement) — milestone futur.
- Refonte du parcours Journey « Authenticated → Campaigns → Mission → Complete → Supabase ».

## 12. Sécurité

- **RLS inchangée / non affaiblie** : tables privées fermées à anon ; agrégats publics.
- **Isolation progression privée** : un invité ne peut pas appeler `ns_sync_pull/push` sans
  session ; la RLS serveur reste l'autorité.
- **Secrets d'authentification** : clé recovery + token en `sessionStorage` uniquement,
  jamais en localStorage, jamais exposés.
- **Scan service-role** : aucune clé service-role en frontend (vérifié par les tests).
- **Exposition communautaire** : agrégats uniquement, aucun utilisateur individuel.
