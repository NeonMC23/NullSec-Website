# Milestone 7 Implementation Report
### Backend Foundation & Real Account System Architecture — NullSec Platform V2

> Date : 6 août 2026 · Périmètre : fondation backend + architecture de comptes réels.
> Aucun réseau social, amis, messagerie, notifications, feed, profils publics,
> classement, gamification, paiement, analytics, OAuth, mot de passe/email, reset de
> mot de passe implémentés.

---

## Summary

Ce milestone pose la **première fondation backend réelle** et l'**architecture de
comptes**, tout en préservant totalement le comportement offline :

1. **Backend scaffold** (`backend/`) — structure TypeScript/Express/PostgreSQL complète :
   API REST, auth, users, database, models, middleware, config.
2. **Schéma de base de données** (`backend/migrations/0001_init.sql`) — `users`,
   `recovery_credentials` (hash uniquement), `user_profiles`, `user_settings`,
   `user_progress`, `sessions` (token_hash uniquement).
3. **Auth par clé de récupération** — register/login/logout (hash argon2id, jamais la
   clé en clair).
4. **Système de session** — tokens Bearer, expiration, révocation ; jamais de token en
   clair côté serveur.
5. **API Client frontend** (`assets/js/api-client.js`) — communication backend
   centralisée, respecte `Config.backendEnabled`/`backendUrl`, offline-safe.
6. **Sync Service** (`assets/js/sync-service.js`) — sync optionnelle (profile/settings/
   progress) ; offline → Store seulement.
7. **UI auth conditionnée** — section "Account" sur la page profil (Create/Recover/Logout),
   **visible uniquement si le backend est activé** ; par défaut (backend désactivé) l'UI
   affiche "Offline Mode" sans boutons.
8. **Documentation** — `backend-architecture.md`, `authentication-flow.md`,
   `database-schema.md`, `sync-architecture.md` + mises à jour de `javascript-architecture.md`
   et `v2-architecture.md`.

**Comportement par défaut inchangé** : `Config.backendEnabled === false` → **0 requête
réseau**, tout reste local. Testé.

> **Note d'environnement** : le backend (TypeScript + PostgreSQL) est fourni comme
> **scaffold d'architecture** — il ne peut pas être compilé/exécuté dans le sandbox
> (pas d'installation npm, pas de PostgreSQL). Le **frontend** (api-client, sync,
> UI auth, offline) est entièrement testé. Le code backend est documenté et prêt à être
> déployé hors sandbox.

**Validation finale :** 27 fichiers JS frontend passent `node --check` ; aucun `var` ;
aucun handler inline ; offline testé (0 fetch quand désactivé) ; sync/API testés avec
backend simulé ; régressions journey/tools OK.

---

## Files Created

| File | Purpose |
|------|---------|
| `assets/js/api-client.js` | Client backend centralisé (`window.ApiClient`) : request/register/login/logout/me/sync, offline-safe. |
| `assets/js/sync-service.js` | Service de sync (`window.Sync`) : isEnabled/isOnline/push/setToken/getToken/clearToken. |
| `backend/` (structure complète) | Backend TypeScript/Express/PostgreSQL : src, migrations, tests, config. |
| `backend/migrations/0001_init.sql` | Schéma initial (users, recovery_credentials, user_profiles, user_settings, user_progress, sessions). |
| `docs/backend-architecture.md` | Choix de stack, structure, API design, modèle de sécurité. |
| `docs/authentication-flow.md` | Flow register/login/session par clé de récupération. |
| `docs/database-schema.md` | Schéma PostgreSQL détaillé. |
| `docs/sync-architecture.md` | Architecture de synchronisation offline-first. |

---

## Files Modified

| File | Change | Reason |
|------|--------|--------|
| `assets/js/profile.js` | Section "Account" : statut (Local/Offline/Authenticated) + boutons Create/Recover/Logout (gated par backendEnabled) | UI auth conditionnée |
| `profile.html` | (déjà contient `#profile-auth`) — aucun changement nécessaire au-delà | UI |
| 22× autres `*.html` | Ajout `api-client.js` + `sync-service.js` dans l'ordre de chargement | Init order |
| `assets/css/pages.css` | Styles `.profile-auth-actions` | Styles des boutons |
| `docs/javascript-architecture.md` | Modules ApiClient/Sync, API, init order, notes | Documentation |
| `docs/v2-architecture.md` | Couches ApiClient/Sync, graphe, chaîne sync, init order | Documentation |

---

## Architecture Changes

```
UI
 ↓
SyncService (sync-service.js)     ── ApiClient, Identity, UserProfile, Settings, Progress
 ↓
API Client (api-client.js)        ── Config (backendUrl/backendEnabled)
 ↓
Backend (Express/PostgreSQL)
 ↓
Database

UI
 ↓
Auth Service
 ↓
UserState
 ↓
Identity
 ↓
Store
```

### Ordre d'initialisation (23 pages)
```
store → utils → data-loader → config → identity → user-state → progress → user-profile
      → recovery-key → settings-service → auth-service → api-client → sync-service
      → statistics → theme → navigation → fuse → search → modal → animations → [page]
```

`api-client.js`/`sync-service.js` sont chargés après `auth-service.js` et avant les
modules UI. Vérifié : `api-client < sync < statistics` sur les 23 pages.

---

## Data Models

### Backend (PostgreSQL)
- `users` : id, identity_id (UUID), status, created_at, updated_at.
- `recovery_credentials` : user_id, recovery_hash (argon2id), created_at, last_used_at.
- `user_profiles` : user_id, username, avatar_seed, created_at, updated_at.
- `user_settings` : user_id, settings_json (JSONB), updated_at.
- `user_progress` : user_id, progress_json (JSONB), updated_at.
- `sessions` : id, user_id, token_hash (SHA-256), created_at, expires_at, revoked.

### Frontend sync payload
```json
{
  "identity_id": "<uuid>",
  "profile": { ... },
  "settings": { ... },
  "progress": { ... }
}
```

---

## Security Considerations

- **Jamais de clé de récupération en clair** côté serveur — hash argon2id.
- **Jamais de token en clair** côté serveur — hash SHA-256.
- **Rate-limit** sur `/api/auth/*`.
- **Validation de chaque requête** (body + types).
- **Collecte minimale** de données ; aucun tracking/analytics.
- **Token de session en mémoire** uniquement côté client (jamais persisté/loggé).
- **Offline-first** : tant que `backendEnabled` est faux, **aucune requête réseau** ;
  si le réseau échoue, retour à l'état local sans crash.

---

## Testing Results

| Test | Méthode | Résultat |
|------|---------|----------|
| Syntaxe frontend | `node --check` sur 27 fichiers | ✅ Tous OK |
| Aucun `var` | grep | ✅ |
| Aucun handler inline | grep | ✅ |
| **Offline (backend désactivé)** | ApiClient.register/login → reject 'offline' ; Sync.push → null ; **0 fetch** | ✅ |
| **Backend simulé (activé)** | register/login/me/sync avec mock fetch | ✅ Bearer token émis, URLs depuis Config.backendUrl, payload sync complet |
| **Sync payload** | push() | ✅ identity_id/profile/settings/progress |
| **UI auth (offline)** | section Account | ✅ Statut "Offline Mode", pas de boutons |
| **Régression** | journey (1+29), tools (50) | ✅ |
| Backend migrations | fichier SQL (revu) | ✅ structure correcte |
| Backend (scaffold) | code TS (revu, non exécuté faute d'environnement) | ✅ documenté |

> Le backend n'a pas pu être exécuté (pas de npm/PostgreSQL dans le sandbox). Le plan de
> test d'intégration backend est fourni dans `backend/tests/README.md`. Un test visuel
> frontend en navigateur est recommandé avant déploiement.

---

## Remaining Technical Debt (reporté volontairement)

- **Backend non déployé / non exécuté** : scaffold TypeScript + SQL prêt, mais nécessite
  un environnement hors sandbox (npm install, PostgreSQL) pour compiler/tester.
- **Session server-side** : implémentation complète des endpoints prête, mais pas encore
  testée en intégration réelle.
- **Synchronisation active** : `Sync.push()` est prêt mais le frontend ne déclenche pas
  encore la sync automatiquement (backend désactivé par défaut).
- **Frontière backend** : `Config.backendUrl`/`backendEnabled` doivent être activés
  manuellement (aucune UI de config du serveur).

---

## Risks

- **Backend scaffold non testé en runtime** : le code TypeScript est revu mais pas compilé
  (pas de toolchain dans le sandbox). À valider dans un environnement avec npm + PostgreSQL.
- **Aucun impact offline** : le frontend reste à 0 requête tant que le backend est désactivé
  (testé). Aucune régression.
- **Token en mémoire** : volontairement non persisté (minimise l'exposition) ; un
  rechargement de page nécessite une nouvelle connexion.
- **Sécurité** : les principes (hash, rate-limit, Bearer) sont posés dans le code ; une
  revue de sécurité complète reste nécessaire avant production.

---

## Next Milestone Recommendation

La fondation backend est en place. Recommandation :

1. **Milestone 7.1 — Déploiement & tests d'intégration backend** (hors sandbox) : compiler
   le TypeScript, lancer PostgreSQL, exécuter le plan de test de `backend/tests/README.md`
   (register/login/logout/expiration/révocation/rate-limit).
2. **Milestone 8 — Activation de la sync** : activer `Config.backendEnabled` derrière un
   flag, déclencher `Sync.push()` sur les mutations, gérer le merge.
3. **Milestone 9 — Fonctionnalités communautaires** : une fois l'auth et la sync stables,
   ajouter progressivement les features sociales (feed, etc.) — hors périmètre ici.

Il est recommandé de **commit et valider en navigateur** M7 avant de poursuivre.

---

*Milestone 7 terminé. Fondation backend (TypeScript/PostgreSQL) + architecture de comptes
réels (auth par clé de récupération, sessions, sync) posées. Le frontend reste 100 %
offline-first par défaut. Aucune fonctionnalité sociale ni communauté implémentée.*
