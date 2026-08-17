# Milestone 31 — Legacy Profile & Local-State Cleanup

> **Statut :** nettoyage/refactor livré. Tests **LOCAL / MOCKED / STATIC** verts.
> **Aucune validation REAL SUPABASE / REAL BROWSER** (pas de projet/secret/navigateur
> accessibles). Backend Supabase **inchangé** (aucune incompatibilité prouvée).
>
> **Principe final :** un visiteur est un visiteur. Un compte est un compte. La progression
> appartient à un compte authentifié. Les données communautaires sont agrégées. **Il n'y a ni
> profil local, ni profil public.**

---

## AUDIT

### Systèmes legacy découverts
- **`Identity` local** avec champs `username` / `display_name` / `avatar` (profil social local).
- **`UserProfile` « local profile »** (pseudo, avatar seed).
- **Page `profile`** rendue comme profil social (avatar + éditeur de pseudo + export/import local).
- **Mode « local »** dans `UserState.getMode()`.
- **Composant legacy** `assets/js/legacy/community-map.js` (non chargé).

### Clés localStorage découvertes
`ns:identity`, `ns:user:profile`, `ns:progress`, `ns:settings`, `ns:auth`, `ns:user:state`,
`ns:recovery`, `ns:journey:progress`, `ns:weekly:progress`, `ns:article:read:*`.

### Clés sessionStorage découvertes
`ns:session:recovery`, `ns:session:auth` (légitimes, court-lived).

### Composants obsolètes
`assets/js/legacy/community-map.js` (supprimé). `backend/legacy-express/` et
`backend/supabase/legacy-ts/` (documentés pour suppression future, hors périmètre backend).

### Terminologie obsolète
« Local · Not authenticated », « saved locally », « local profile », « Loading your local
statistics », « local data », export/import de « local data ».

---

## CHANGES

### Fichiers supprimés
- `assets/js/legacy/community-map.js`

### Fichiers modifiés
- `assets/js/identity.js` — champs `username/display_name/avatar` retirés ; `update()` supprimé.
- `assets/js/user-state.js` — mode `'local'` supprimé (`anonymous` | `authenticated`).
- `assets/js/profile.js` — avatar + éditeur de pseudo + export/import/reset-all supprimés.
- `assets/js/store.js` — clés legacy + purge obsolète + `clearNamespace`/`listKeys` supprimés ;
  seule `ns:theme` persiste.
- `assets/js/user-profile.js`, `assets/js/recovery-key.js`, `assets/js/progress-service.js` —
  terminologie/commentaires mis à jour.
- `profile.html` — re-titrée **Account** ; métadonnées ; section « Your Data » retirée.
- `*.html` (8 pages) — navigation `Profile` → `Account` (24 liens).
- `tests/m17-tests.mjs`, `tests/m30-tests.mjs` (mis à jour) ; `tests/m31-tests.mjs` (nouveau) ;
  `tests/run-all.sh` (étape 20) ; `tests/README.md`.

### Fichiers intentionnellement préservés
- Backend Supabase complet (migrations, RPC, scripts) — **inchangé**.
- `api-client.js`, `data-loader.js`, `sync-service.js`, `session-*`, `recovery-key.js`,
  `settings-service.js` — logique d'auth/sync légitime.
- `ProfileRepository`, `ProgressRepository`, `SettingsRepository` (mémoire session).

### Architecture simplifiée
Suppression de la double source de vérité : plus de profil local, plus de progression locale.
Une seule voie : **UI → Progress service → Sync layer → Supabase RPC → PostgreSQL**.

---

## AUTHENTICATION (final)

```
Guest
  ↓
Public content
  ↓
Sign in / Create account   (recovery-key)
  ↓
Authenticated account      (token session court-lived, sessionStorage)
```

## PROGRESSION (final)

```
Authenticated account
  ↓
Journey
  ↓
Mission completion        (Progress.complete, gated par Auth)
  ↓
Sync layer (ns_sync_push) → Supabase → PostgreSQL
  ↓
Progress restored (pull au chargement / autre appareil)
```

---

## STORAGE (final)

```
localStorage:
  ns:theme            (préférence appareil — seule clé persistante intentionnelle)
  ns:migrated:v1      (marqueur de migration du thème)

sessionStorage:
  ns:session:recovery   (clé de récupération court-lived)
  ns:session:auth       (token de session court-lived)
```

Tout ce qui reste en localStorage au-delà de `ns:theme` est soit le marqueur de migration
`ns:migrated:v1`, soit expliqué ci-dessus ; **aucune donnée de compte/progression**.

---

## SECURITY

- **RLS** : inchangée, non affaiblie. Tables privées fermées à anon ; agrégats publics.
- **Isolation progression privée** : un invité n'a aucun état de progression ; l'accès à la
  progression passe par une session authentifiée + RLS serveur.
- **Secrets d'auth** : clé recovery + token en `sessionStorage` uniquement (jamais
  localStorage, jamais exposés).
- **Scan service-role** : aucune clé service-role en frontend (tests M14/M15/M31).
- **Exposition public/communauté** : agrégats uniquement ; aucun utilisateur individuel, aucun
  pseudo public, aucun avatar.

---

## TESTS

### Suite complète (toutes vertes)
- `sql-audit` 235 · m14 59 · m15 44 · m16 22 · m17 47 · m18 38 · m19 29 · m20 61 · m21 26 ·
  m22 23 · m24 25 · m25 24 · m26 26 · m27 43 · m28 72 · m28-deploy 26 · m29 19 · m30 27 ·
  **m31 31**
- **Total : 852 assertions vertes.**

### Tests M31 (`tests/m31-tests.mjs`, 31 assertions)
1. **Local-state removal** : aucune clé legacy/account en localStorage ; complétion de mission
   d'invité = no-op (0 réseau) ; mode `anonymous` ; `Identity` sans champs sociaux.
2. **Authentication** : invité non authentifié ; utilisateur connecté accède à la progression ;
   sign-out bloque la progression ; aucun secret d'auth en localStorage.
3. **Architecture** : `Progress.complete` déclenche le Sync layer (voie serveur) ; `store.js`
   ne garde que le thème.
4. **Account non public** : pas d'avatar/pseudo UI ; pas de « Local Profile ».
5. **Community** : aucun utilisateur individuel exposé.
6. **UI/static** : aucune terminologie legacy ; navigation « Account » ; Journey exige l'auth.

### JS syntax checks
`node --check` sur tous les fichiers JS modifiés : **OK**.
### Shell syntax checks
`bash -n tests/run-all.sh`, `bash -n backend/supabase/scripts/*.sh` : **OK**.

---

## REMAINING WORK (milestones futurs)

- Redessin complet de la page **Community** (agrégats uniquement) — `Future Community`.
- Refonte du parcours **Journey** (« Authenticated → Campaigns → Mission → Complete → Supabase »)
  — `Future Journey`.
- Suppression des backends legacy `backend/legacy-express/` et `backend/supabase/legacy-ts/`.
- Réécriture des docs legacy (`identity-schema.md`, `settings-schema.md`, etc.).
- Validation **REAL SUPABASE / REAL BROWSER** (BLOCKED sans projet/secret/navigateur).

---

## Principe architectural final

**Un visiteur est un visiteur. Un compte est un compte. La progression appartient à un compte
authentifié. Les données communautaires sont agrégées. Il n'y a pas de profil local et pas de
profil public.**
