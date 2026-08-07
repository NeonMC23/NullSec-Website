# Milestone 16 Implementation Report
### Architecture Cleanup & Local State Removal — NullSec Platform V2

> Date : 7 août 2026 · **Périmètre** : nettoyage architectural uniquement (aucune
> nouvelle fonctionnalité produit). **Honestité** : aucun projet Supabase réel n'est
> disponible (pas d'env, pas de CLI). Rien n'est « validé en production » ; les tests
> sont étiquetés **LOCAL / MOCKED / STATIC / BLOCKED**.

---

## Décision architecturale finale

**« Supabase est la source de vérité unique des comptes et des données utilisateur
persistantes. »** Le navigateur est un **client**, pas une seconde base de données.

```
                    NULLSEC
                       │
              ┌────────┴────────┐
              │                 │
           ACCOUNT          COMMUNITY
              │                 │
           Supabase          Supabase
              │                 │
      profile/settings/       aggregated
          progress             metrics
              │                 │
              └────────┬────────┘
                       │
                    Browser (client)
```

## 1. Audit complet du stockage persistant du navigateur

Inspection réelle (pas seulement la doc) — `grep` de `localStorage`, `sessionStorage`,
`indexedDB`, `cookies`, `Cache API` sur tout le repo.

| Technologie | Utilisé ? | Usage | Conforme M16 |
|-------------|-----------|-------|--------------|
| `localStorage` | Oui (Store) | Caches hors-ligne : identity, profile, progress, settings + `ns:theme` (préf. appareil) + marqueur migration | ⚠️ caches non autoritatifs (dette transition) ; **plus** de secret/flags |
| `sessionStorage` | Oui (SessionStore, seul accès) | `ns:session:auth` (session courte) + `ns:session:recovery` (clé) | ✅ |
| `IndexedDB` | Non | — | ✅ |
| Cookies | Non | — | ✅ |
| Cache API | Non | — | ✅ |

### Cartographie MODULE → DONNÉES → SOURCE ACTUELLE → SOURCE CIBLE → ACTION

| Module | Données | Source actuelle | Source cible | Action |
|--------|---------|-----------------|--------------|--------|
| `store.js` | clés `ns:*` (localStorage) | localStorage (cache) | localStorage (cache non autoritatif) | retiré `ns:auth`/`ns:user:state`/`ns:recovery` (localStorage) |
| `auth-service.js` | flag `authenticated` + snapshot | mémoire + localStorage `ns:auth` | **mémoire + sessionStorage** | **retiré `ns:auth` de localStorage** |
| `user-state.js` | mode/authenticated | localStorage `ns:user:state` | **mémoire** | **retiré la persistance** |
| `identity.js` | identité locale (UUID) | localStorage `ns:identity` | Supabase (identifiant de liaison) | conservé comme **cache** hors-ligne |
| `user-profile.js` | profil | localStorage `ns:user:profile` | Supabase | conservé comme **cache** |
| `progress-service.js` | progression | localStorage `ns:progress` | Supabase | conservé comme **cache** |
| `settings-service.js` | réglages | localStorage `ns:settings` | Supabase | conservé comme **cache** |
| `recovery-key.js` | clé de récupération | sessionStorage (M13+) | Supabase (hash) | ✅ inchangé |
| `sync-service.js` | payloads | Store (cache) + Supabase | Supabase | minimal, token en mémoire |
| `session-store.js` | session + clé | sessionStorage | sessionStorage | ✅ |

## 2. Mécanismes de « compte local » retirés

- **`ns:auth`** (localStorage) : snapshot d'état d'authentification (`authenticated`)
  **supprimé**. Le flag d'authentification est désormais **mémoire** (Auth) + token en
  sessionStorage. Aucune persistance d'état d'authentification en localStorage.
- **`ns:user:state`** (localStorage) : flag de mode/authentifié **supprimé**.
  `UserState` est devenu un **état de vue en mémoire** dérivé d'Auth + Identity.
- **`ns:recovery`** (localStorage) : méthode Store locale retirée (la clé vit déjà en
  sessionStorage depuis M13/M14).
- **Modèle d'état simplifié** : suppression de tout état « compte local authentifié ».
  Désormais : `LOCAL / NOT AUTHENTICATED` · `AUTHENTICATED / SUPABASE` ·
  `BACKEND UNAVAILABLE`.

## 3. Mécanismes de session conservés et pourquoi

| Mécanisme | Conservé ? | Raison |
|-----------|-----------|--------|
| `SessionStore` (sessionStorage) | ✅ | Session courte — représentation **temporaire** d'une session Supabase authentifiée. Jamais une base séparée. |
| `ns:session:auth` (token + expires_at) | ✅ | Restauration au démarrage via `ns_validate_session` (M14). `expires_at` informatif. |
| `ns:session:recovery` (clé) | ✅ | Clé de récupération en sessionStorage (secret court, hors localStorage). |
| Flag `authenticated` (Auth) | ✅ (mémoire) | Source de vérité, jamais persistée. |
| Token (Sync) | ✅ (mémoire) | Jamais en URL, jamais en localStorage. |

## 4. Table finale source de vérité

| Donnée | Source de vérité | Cache local ? |
|--------|------------------|---------------|
| Compte utilisateur | **Supabase** | non |
| Identité de liaison (`identity_id`) | Supabase (via identifiant) | cache hors-ligne |
| Profil | **Supabase** | cache hors-ligne |
| Réglages | **Supabase** | cache hors-ligne |
| Progression | **Supabase** | cache hors-ligne |
| Activité communautaire (agrégée) | **Supabase** | non |
| Session | Supabase (`ns_validate_session`) | sessionStorage (temporaire) |
| Clé de récupération | Supabase (hash bcrypt) | sessionStorage |
| Thème | appareil | `ns:theme` (préférence d'appareil) |

## 5. Décision architecture de synchronisation

La couche `Sync` est **conservée mais minimale et explicite** :
- Elle n'agit que si `supabaseEnabled === true` **et** une session valide existe ;
  sinon c'est un **no-op** lisant/écrivant le cache hors-ligne.
- Le Store local **n'est pas une base de données homologue** : c'est un cache.
  `Sync` flushe ce cache vers **Supabase** (source de vérité) et réconcilie
  (`updated_at` gagne).
- Pas de boucle de peer-replication « local DB ⇄ sync ⇄ Supabase ». Justification
  documentée : gère uniquement les interactions hors-ligne temporaires.

## 6. Rapport de nettoyage Supabase / backend

- `backend/legacy-express/` : **déjà archivé** (inchangé, non référencé par le frontend).
- `backend/supabase/legacy-ts/` : **archivé en M15** (wrapper incohérent). Inchangé en M16.
- `backend/supabase/migrations/` : `0001_schema` → `0002_rls` → `0003_rls_functions` →
  `0004_rls_privileges` (ordre validé).
- `backend/supabase/functions/` : `rpc_auth`, `rpc_sync`, `rpc_activity` (API publique).
- `backend/supabase/config.toml` : **retiré** `additional_redirect_urls=["http://localhost:3000"]`
  (référence Express obsolète).
- Aucun `backendUrl`, aucune URL Express, aucun `localhost` dans le **code frontend
  actif** (vérifié).

## 7. Rapport de nettoyage documentation

- Docs **LEGACY/ARCHIVÉ** déjà identifiées : `backend-architecture.md`,
  `sync-architecture.md`, `auth-schema.md` (marqué archivé en M16).
- `javascript-architecture.md` : mis à jour (module Store/Auth/UserState/Config, table
  de persistance, relations, modèle M16).
- `v2-architecture.md` : mis à jour (diagramme, graphe de dépendances, table modules,
  modèle de persistance).
- `session-management.md` / `supabase-architecture.md` : ajout de la section
  « Politique de stockage (M16) ».
- `identity-schema.md` / `recovery-key.md` : notes M16 (cache non autoritatif /
  sessionStorage).
- `tests/README.md` : section M16.
- `backend/supabase/README.md` : déjà à jour (M15).

## 8. Rapport de nettoyage du code mort

- `Store.getRecoveryKey/saveRecoveryKey/deleteRecoveryKey` (localStorage) : retirés.
- `Store.getAuth/saveAuth/deleteAuth` : retirés.
- `Store.getUserState/saveUserState/clearUserState` : retirés.
- `UserState.set/clear` (persistance) : retirés.
- Clés `ns:auth`, `ns:user:state`, `ns:recovery` : retirées de `Store`.
- Helper de test `lsAuth` inutilisé : retiré.
- Aucun `TODO`/`FIXME` dans le code actif. Aucune référence `backendUrl` dans le code
  actif. Références Express restantes uniquement dans docs LEGACY (acceptable).

## 9. Résultats de test

| Suite | Type | Résultat |
|-------|------|----------|
| `tests/sql-audit.mjs` | STATIC | ✅ 125/125 |
| `tests/m14-tests.mjs` | LOCAL+MOCK | ✅ 59/59 |
| `tests/m15-tests.mjs` | MOCK+LOCAL+STATIC | ✅ 44/44 |
| `tests/m16-tests.mjs` (nouveau) | LOCAL+MOCK+STATIC | ✅ 22/22 |

Politique de stockage vérifiée : localStorage sans clé de récupération / hash / état
d'authentification / token / flag de compte ; sessionStorage limité à la session
courte + clé ; offline → 0 requête, aucun compte local fabriqué, auth indisponible ;
backend → opérations de compte via ApiClient. `node --check` sur tous les fichiers JS : OK.

## 10. Dette technique restante

- **Caches hors-ligne** (`ns:identity/profile/progress/settings`) : conservés car
  aucun Supabase réel n'existe encore et l'UI hors-ligne doit rester utilisable. Ils
  sont **explicitement non autoritatifs**. **Migration recommandée** : dès qu'un vrai
  Supabase est branché, retirer ces caches et ne servir les données de compte que
  depuis le backend.
- **`identity_id` en cache local** : nécessaire au flux de récupération (liaison au
  compte Supabase) ; à réévaluer quand le backend est en production.
- **Rate-limiting** non implémenté (dépendance projet Supabase, hors code).
- UX de re-login après fermeture de navigateur (clé en sessionStorage).

## 11. Risques

- Retirer les caches hors-ligne trop tôt casserait l'UI hors-ligne (M16 les conserve).
- La double lecture (cache hors-ligne + Supabase) peut, sans vrai backend, laisser une
  impression de persistance locale ; documenté comme transition.
- Toute validation réelle (RLS, isolation, auth) reste **BLOCKED** sans projet.

## 12. Recommandation pour le prochain milestone

**Milestone 17 — réel branché.** Dès qu'un projet Supabase réel est fourni :
1. Déployer migrations + RPC + RLS (ordre `0001→0004`).
2. Exécuter la matrice runtime (`docs/supabase-runtime-validation.md` §D).
3. **Retirer les caches hors-ligne** (`ns:identity/profile/progress/settings`) et faire
   transiter profil/réglages/progression exclusivement via Supabase.
4. Ré-éditer ce rapport pour refléter les résultats réels.

En l'état, M16 atteint ses critères : aucun compte local persistant, Supabase =
source de vérité, localStorage sans secrets/flags d'authentification, session séparée
du stockage de compte, sync justifiée/minimale, Express obsolète archivé, docs
cohérentes, code mort retiré, tests existants **et** nouveaux verts, aucune validation
Supabase réelle prétendue.
