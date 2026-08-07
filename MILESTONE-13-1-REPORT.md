# Milestone 13.1 Implementation Report
### Real Supabase Deployment & Integration Validation — NullSec Platform V2

> Date : 6 août 2026 · Périmètre : passer l'architecture Supabase de « prêt à
> déployer » à une **intégration production validée**.
>
> **Honestité requise** : Supabase n'est PAS déployé depuis ce sandbox (pas de projet
> Supabase réel, pas de toolchain). Ce rapport distingue clairement :
> **localement testé**, **Supabase mocké testé**, **SQL statiquement revu**, et
> **réalisez-le vous-même en déploiement réel** (étapes fournies). Aucun résultat
> de déploiement réel n'est inventé.

---

## 1. What was changed

### Corrections de sécurité critiques (audit M13)
- **`ns_login` ne vérifiait pas la clé de récupération** — il créait une session à partir
  du seul `identity_id` (un UUID). Corrigé : `ns_login(p_identity_id, p_recovery_hash)`
  vérifie désormais le transport hash (comparaison bcrypt). **FAILLE CRITIQUE fermée.**
- **Sync passait un `p_user_id` choisi par le client** — n'importe quel utilisateur
  pouvait lire/écrire les données d'un autre en fournissant un `user_id`. Corrigé :
  `ns_sync_pull` / `ns_sync_push` sont **token-authentifiés** (`p_token`), et dérivent le
  `user_id` via `ns_validate_session`. **FAILLE CRITIQUE fermée (cross-user).**
- **`ns_register` stockait le SHA-256 transport hash en clair** (et jamais comparé).
  Corrigé : le serveur stocke un **hash bcrypt salé** (`crypt(gen_salt('bf'))`) du
  SHA-256 transport hash. Déviation documentée (bcrypt au lieu d'argon2, car PostgreSQL
  ne fournit pas Argon2 nativement).
- **`ns_logout`/`ns_validate_session`** prenaient un token à comparer en clair ; désormais
  ils **hachent le token** (SHA-256) côté serveur pour la recherche. Le frontend passe le
  token brut, jamais haché.
- **Aucune RLS** : ajout de `0002_rls.sql` (RLS sur toutes les tables, policies anon
  SELECT sur les tables agrégées, zéro accès anon aux tables privées, `REVOKE`).
- **`search_path`** explicite sur tous les RPC (anti search-path attacks).
- **Validation d'entrées** dans les RPC : format du transport hash (`^[0-9a-f]{64}$`),
  code pays (`^[A-Z]{2}$` + pays connu), limites de taille (payload, username,
  avatar_seed, region, mission_id).

### Frontend
- `api-client.js` : `login` envoie `recovery_hash` ; `me`/`pull`/`sync`/`logout` passent
  le **token** (`p_token`) ; ajout de `validateSession(token)` ; validation `validArgs` et
  `requireToken` ; `register`/`login` envoient le hash (jamais la clé).
- `recovery-key.js` : le fallback non-cryptographique **ne peut plus** être utilisé comme
  transport hash (retourne `null` si `crypto.subtle` indisponible) — empêche un hash faible
  d'être stocké comme identifiant.
- `config.js` : suppression de `backendUrl` (URL Express obsolète, inutilisée) ; flags
  Supabase clairs, offline par défaut.
- `profile.js` : déjà conforme (envoie `recovery_hash`, pas la clé) — vérifié.

### Backend / organisation
- L'ancien scaffold **Express** est **archivé** dans `backend/legacy-express/` (non
  référencé par le frontend).
- `backend/supabase/` = backend de production (migrations, RPC, client, config).

---

## 2. What was removed or deprecated

- **`ns_login` sans vérification de clé** — remplacé (signature avec `p_recovery_hash`).
- **Sync par `p_user_id` client** — remplacé par token-authentifié.
- **Stockage du SHA-256 transport hash en clair** — remplacé par bcrypt salé.
- **`config.backendUrl`** (frontend) — supprimé (URL Express obsolète).
- **`backend/src`, `backend/migrations/*.sql` (Express), `backend/package.json`,
  `backend/tsconfig.json`** — déplacés sous `backend/legacy-express/` (archivés).
- **Docs legacy Express** (`api-reference`, `backend-architecture`, `backend-deployment`,
  `session-security`, `sync-architecture`, `synchronization`) — marqués **LEGACY / ARCHIVÉ**
  (bandeau) ; Supabase est déclaré backend de production.

---

## 3. Final Supabase architecture

```
Frontend (vanilla JS)
   │
   ▼
ApiClient (assets/js/api-client.js) — seul module de fetch backend
   │  (SUPABASE_URL + SUPABASE_ANON_KEY, clés publiques)
   ▼
Supabase (PostgREST + RPC)
   │  (ns_register / ns_login / ns_logout / ns_validate_session /
   │   ns_sync_pull / ns_sync_push / ns_activity / ns_metrics)
   ▼
Supabase PostgreSQL (0001_schema.sql + 0002_rls.sql)
```

---

## 4. Database / RLS status

- **Migration** `0001_schema.sql` : 14 tables requises, PK/FK, ON DELETE CASCADE,
  contraintes non-négatives, unique (pays/mission), index, timestamps, seeds. **Statiquement
  revue.**
- **RLS** `0002_rls.sql` : activée sur toutes les tables ; anon SELECT sur agrégées
  uniquement ; zéro accès anon aux privées ; `REVOKE` supplémentaire ; service-role key
  hors frontend. **Statiquement revue — non exécutée** (pas de projet Supabase).

---

## 5. Authentication status

- **Register** : `ns_register(identity, sha256 transport hash, username, avatar_seed)` →
  crée user/credentials(bcrypt)/profile/settings/progress/session.
- **Login** : `ns_login(identity, sha256 transport hash)` → **vérifie** le bcrypt, crée
  session.
- **Logout / validate** : token haché côté serveur ; expiration + révocation.
- **Restauration** : token en mémoire uniquement (décision assumée) ; rechargement →
  mode local ; `validateSession` disponible. **Logiquement testé (mock), SQL revu.**

---

## 6. Sync status

- **Token-authentifiée** (pas de `user_id` client) → empêche cross-user.
- `ns_sync_pull` / `ns_sync_push` avec `updated_at` wins.
- **Offline** : Supabase désactivé → 0 requête, données locales intactes.
- **Testé** : push/pull via mock ; offline 0 requête ; regression journey/tools OK.

---

## 7. Community metrics status

- `ns_activity` (anonyme, agrégé) + `ns_metrics` (snapshot).
- `CommunityMetrics` renvoie des valeurs **vides** offline, sans requête.
- **Testé (mock)** : metrics, activity, ranking, challenges ; offline vide.

---

## 8. Security status

- Aucun secret service-role dans le frontend (grep).
- Aucune clé brute dans les payloads réseau.
- Aucune référence Express/localhost dans le frontend.
- RLS, bcrypt, search_path, validation d'entrées.
- Pas de tracking, pas d'IP/GPS, pas d'identité dans l'activité anonyme.
- **Rate-limit** : **AUCUN limiter custom n'est implémenté** dans Supabase — je ne le
  prétends pas. La protection repose sur : validation d'entrées RPC, `REVOKE` sur les
  écritures, écritures uniquement via `SECURITY DEFINER`. La **dépendance au rate-limit
  plateforme Supabase** est documentée (voir blocage). (Sans prétendre qu'un limiter
  existe alors qu'il n'existe pas.)

---

## 9. Exact deployment steps still required by the developer

Voir `docs/deployment-guide.md` (complet) et `docs/supabase-architecture.md`. En résumé :
1. Créer un projet Supabase (région UE).
2. SQL Editor : exécuter `0001_schema.sql`, puis `rpc_auth.sql`, `rpc_sync.sql`,
   `rpc_activity.sql`, puis `0002_rls.sql`.
3. Vérifier RLS (aucun accès anon aux tables privées ; SELECT anon sur agrégées).
4. Récupérer `Project URL` + `anon public` key.
5. Configurer le frontend (public) ; activer les flags Supabase dans la config de build.
6. Tester register/login/logout/validate/sync/activity/metrics.
7. Tester offline (0 requête) quand Supabase est désactivé.

---

## 10. Tests actually executed (real results)

**Locally tested (Node) :**
- `node --check` sur les 35 fichiers JS → **OK**.
- `grep` : aucun `var`, aucun handler inline, fetch centralisé, aucun secret, aucune clé
  brute, aucune référence Express/localhost → **OK**.
- Offline (Supabase désactivé) : register/login/logout/sync/metrics/activity → rejettent
  `'offline'`, **0 requête réseau** → **OK**.
- Supabase mocké : login (recovery_hash), sync token-based (`p_token`, pas `p_user_id`),
  pull, logout, metrics, activity, community reads → **OK**.
- `RecoveryKey.hashForTransport` → SHA-256 hex (64), déterministe, clé brute jamais
  renvoyée → **OK**.
- Régressions journey (1 weekly + 29 stage), tools (50), offline préservé → **OK**.

**Statically reviewed (SQL) :**
- `0001_schema.sql` (tables/contraintes/index/RLS-ready) → revu.
- `rpc_auth.sql`, `rpc_sync.sql`, `rpc_activity.sql` (search_path, validation, bcrypt,
  token-authentifié, vérification de clé) → revu.
- `0002_rls.sql` (RLS + policies + revoke) → revu.

**NOT executed :**
- Aucune exécution SQL réelle (pas de PostgreSQL).
- Aucun déploiement Supabase réel.
- Aucun test de politique RLS en conditions réelles.

---

## 11. Remaining technical debt

- **RLS / RPC non exécutés en réel** : la logique SQL est complète et revue, mais doit
  être exécutée dans un projet Supabase pour validation réelle.
- **Rate-limit** : aucun limiter custom Supabase implémenté (pas de middleware équivalent
  à Express). La protection repose sur la validation RPC + RLS. Un limiter plateforme
  (Supabase API gateway / réseau) reste à configurer côté projet.
- **Restauration de session persistante** : non implémentée (décision : pas de secret
  persistant) ; un rechargement de page nécessite un re-login.
- **Tendances temporelles anonymes** : à concevoir (pas d'historique individuel).

---

## 12. Blockers requiring real Supabase access

- **Exécution réelle des migrations SQL** (schéma + RLS) et des RPC.
- **Test réel de RLS** (vérifier que anon ne peut pas lire les tables privées et ne peut
  pas écrire les tables agrégées).
- **Test réel du flux auth** (register/login/logout/validate) avec un projet Supabase.
- **Test réel de la sync** (push/pull token-authentifiée, isolation inter-utilisateurs).
- **Test réel des métriques communautaires** (`ns_activity`, `ns_metrics`).
- **Configuration du rate-limit plateforme** (dépend du dashboard Supabase actuel).

---

*Milestone 13.1 terminé. Architecture Supabase corrigée et durcie (RLS, auth par clé
vérifiée, sync token-authentifiée, bcrypt, search_path, validation), backend Express
archivé, docs cohérentes. Aucune fonctionnalité sociale/tracking ajoutée. Aucun
déploiement réel n'est prétendu — les étapes restantes nécessitent un projet Supabase
réel.*
