# Milestone 15 Implementation Report

## Real Supabase Runtime Validation & Production Security Audit — NullSec Platform V2

> Date : 7 août 2026 · **Honestité** : aucun projet Supabase réel n'est disponible
> dans l'environnement (pas de variable d'env, pas de CLI `supabase`/`psql`/`docker`,
> pas de navigateur). Aucune migration/RPC/RLS n'a été exécutée sur un vrai projet et
> rien n'est « validé en production ». Chaque test est étiqueté **REAL SUPABASE /
> LOCAL / MOCKED / STATIC / BLOCKED**.

---

### 1. Summary

M15 a audité et durci l'intégration Supabase, corrigé des incohérences réelles
introduites aux milestones précédents, et produit une suite de validation
locale/mockée/statique exhaustive. Les tests **réels** restent **BLOCKED** (aucun
projet Supabase). Trois problèmes concrets ont été trouvés et corrigés :
1. **Wrapper TS `backend/supabase/src/` incohérent et dangereux** (sync par
   `p_user_id` choisi par le client, signatures erronées) → **archivé** dans
   `legacy-ts/`.
2. **EXECUTE non contrôlés** : on s'appuyait sur le défaut PostgreSQL (PUBLIC) →
   nouvelle migration `0004_rls_privileges.sql` contrôle explicitement les EXECUTE.
3. **Bug de restauration** : `Identity.get().id` plantait si l'identité locale est
   absente → géré sans erreur dans `session-service.js`.

### 2. Real Supabase Availability

| Ressource | Disponible |
|-----------|-----------|
| `SUPABASE_URL` | ❌ non définie |
| `SUPABASE_ANON_KEY` | ❌ non définie |
| `SUPABASE_SERVICE_KEY` | ❌ non définie |
| CLI `supabase` | ❌ absente |
| `psql` / `pg_isready` | ❌ absents |
| Docker | ❌ absent |
| Navigateur | ❌ absent |

→ **Aucun accès Supabase réel.** Tous les tests runtime sont **BLOCKED** (documenté,
non prétendus).

### 3. Changes Implemented

- **Migration `0004_rls_privileges.sql`** : contrôle EXECUTE explicite (REVOKE FROM
  PUBLIC + GRANT to anon/authenticated sur l'API publique ; révocation confirmée de
  `ns_create_session`).
- **BEGIN/COMMIT** ajouté à `0002_rls.sql` et `0003_rls_functions.sql` (atomicité).
- **Archivage** de `backend/supabase/src/` → `backend/supabase/legacy-ts/` (wrapper TS
  incohérent/sécurité). README backend et docs mis à jour.
- **Correction `session-service.js`** : restauration robuste si l'identité locale est
  absente (plus de crash `Cannot read properties of null (reading 'id')`).
- **Tests** : `tests/sql-audit.mjs` (audit statique), `tests/m15-tests.mjs` (suite
  mock/local), `tests/run-all.sh` (exécuteur global) ; amélioration du harnais
  (`tests/run-tests.mjs` : routage sync/activity + `console`).
- **Docs** : `docs/supabase-runtime-validation.md` (catégories A/B/C/D) ; mises à jour
  de deployment-guide, supabase-architecture, session-management, community-api,
  database-schema, tests/README.

### 4. Database Validation

**STATIC REVIEW** (`tests/sql-audit.mjs`, 125 contrôles OK) :
- 14 tables présentes dans `0001_schema.sql` ; PK, FK (`ON DELETE CASCADE`), UNIQUE,
  `CHECK (completed_count >= 0)`, `CHECK (id=1)` sur les stats globales, 9+ index,
  seeds (stats, countries, challenges).
- Ordre des migrations `0001 < 0002 < 0003 < 0004` ; chaque migration enveloppée en
  `BEGIN/COMMIT`.
- Cohérence frontend : les noms d'arguments RPC de `api-client.js` correspondent aux
  signatures SQL ; le frontend n'envoie jamais `p_user_id`.
- **BLOCKED** : exécution réelle du schéma, vérification des types/contraintes sur un
  vrai projet.

### 5. RLS & Permissions

**STATIC REVIEW** (0002/0003/0004) :
- RLS activée sur les 14 tables ; tables privées sans accès anon ; agrégats en SELECT
  anon uniquement ; `REVOKE ALL` privé + `REVOKE INSERT/UPDATE/DELETE` agrégats.
- `SECURITY DEFINER` + `search_path = public` sur les 9 RPC.
- Aucun `p_user_id` client dans les RPC exposées (isolation).
- `ns_create_session` : EXECUTE révoqué de PUBLIC/anon/authenticated (0003 + 0004).
- **BLOCKED** : vérification réelle de `pg_proc.proacl` et du comportement RLS
  (anon vs authenticated vs RPC).

### 6. Authentication Validation

**MOCKED** (suite M15 §1) : register→token, login (hash correct→succès, hash
incorrect→échec), logout→session effacée.
**STATIC** : `ns_register`/`ns_login` exigent `p_recovery_hash` ; tokens hachés
SHA-256 ; clé brute jamais transmise (hash de transport SHA-256 uniquement).
**BLOCKED** : matrice réelle (expiré/révoqué/malformé/manquant sur vrai projet).

### 7. Cross-User Isolation

**MOCKED** (M15 §2) : 2 utilisateurs A et B ; A ne lit/écrit que ses données ; le
client n'envoie jamais de `p_user_id` ; B ne peut pas accéder aux données de A.
**STATIC** : `ns_sync_pull/push` dérivent le `user_id` via `ns_validate_session`.
**BLOCKED** : test réel 2 utilisateurs + accès PostgREST direct.

### 8. Sync Validation

**MOCKED** (M15 §3) : push/pull round-trip ; token invalide rejeté (`UNAUTHORIZED`) ;
token jamais en URL ; token jamais en localStorage.
**BLOCKED** : sync réelle (conflits `updated_at`, payloads malformés/oversize,
backend indisponible).

### 9. Community Activity Validation

**MOCKED/STATIC** (M15 §4) : champs identité/token (`p_identity_id`, `p_username`,
`p_token`, `p_session`, `p_recovery_key`, `p_user_id`) rejetés ; `mission_id` oversize
rejeté ; compteurs monotones (jamais négatifs) ; ApiClient filtre les champs par
construction (allow-list `p_mission_id/p_country_code/p_region`).
**STATIC** : `ns_activity` ne contient aucun champ identité ; agrégats non modifiables
par anon (RLS).
**BLOCKED** : abuse testing réel (SQL injection, répétition, pays inconnu).

### 10. Session Restoration

**LOCAL/MOCKED** (M14 §5 + M15 §5) : aucun session→local ; valide→authentifié (1 seul
`ns_validate_session`) ; invalide→effacé ; backend injoignable→`unavailable` (session
conservée) ; Supabase désactivé→0 réseau.
**Bug corrigé (M15)** : restauration sans identité locale ne plante plus.
**BLOCKED** : validation réelle après reload de navigateur.

### 11. Offline-First Validation

**LOCAL** : `supabaseEnabled=false` → **0 requête backend**, auth indisponible,
journey/tools/community fonctionnent, métriques vides, activité no-op, restauration
sans réseau. `tests/run-all.sh` : M14 58 OK + M15 44 OK.

### 12. Security Audit

**STATIC** (M15 §6 + Étape 17) :
- Pas de service-role key / `service_role` en frontend.
- Pas de `console.*` ; pas de handlers inline ; `localStorage`/`sessionStorage`
  centralisés (store.js + session-store.js).
- Pas de `p_user_id`/`recovery_key` en payload ; pas de secret commité (`.gitignore`).
- Pas de `localhost`/Express dans le JS maison (hors `fuse.min.js` vendored).
- Aucun IP/GPS/fingerprinting/analytics introduit.

### 13. Tests Actually Executed

| Suite | Type | Résultat |
|-------|------|----------|
| `node --check` tous les JS | STATIC | ✅ |
| `tests/sql-audit.mjs` | STATIC | ✅ 125/125 |
| `tests/m14-tests.mjs` | LOCAL+MOCK | ✅ 58/58 |
| `tests/m15-tests.mjs` | MOCK+LOCAL+STATIC | ✅ 44/44 |

### 14. Tests Blocked

- Migrations/RPC/RLS réels ; matrice auth réelle ; isolation cross-user réelle ;
  RLS réelle ; abuse `ns_activity` réel ; sync réelle ; validation navigateur.
  → voir `docs/supabase-runtime-validation.md` §D et §4 pour les commandes exactes.

### 15. Files Created

- `backend/supabase/migrations/0004_rls_privileges.sql`
- `backend/supabase/legacy-ts/` (client.ts, config.ts, database.ts) + `legacy-ts/README.md`
- `tests/sql-audit.mjs`, `tests/m15-tests.mjs`, `tests/run-all.sh`
- `docs/supabase-runtime-validation.md`
- `MILESTONE-15-REPORT.md`

### 16. Files Modified

- `backend/supabase/migrations/0002_rls.sql` (BEGIN/COMMIT)
- `backend/supabase/migrations/0003_rls_functions.sql` (BEGIN/COMMIT)
- `assets/js/session-service.js` (restauration robuste sans identité)
- `tests/run-tests.mjs` (routage sync/activity + shim `console`)
- `backend/supabase/README.md`
- `tests/README.md`
- `docs/deployment-guide.md`, `docs/supabase-architecture.md`,
  `docs/session-management.md`, `docs/community-api.md`, `docs/database-schema.md`

### 17. Remaining Technical Debt

- **Rate-limit** : aucune protection réelle (dépendance projet Supabase/PostgREST non
  configurée ici). Documenté dans `docs/supabase-runtime-validation.md` §4.
- **`ns_activity` incrémente toutes les challenges actives** (+1 par activité) : le
  défi « Activer 5 pays » n'est pas sémantiquement exact (compté par activité, pas par
  pays distinct). Limitation connue, non modifiée (risque de régression sans test réel).
- **`mission_id` non validé contre une table missions** : la table n'existe pas en DB
  (missions dans `data/missions.json`) ; seuls la longueur et les pays sont validés.
- **UX de re-login** après fermeture de navigateur (clé en sessionStorage) : à traiter
  dans un futur milestone.

### 18. Risks

- **Validation réelle absente** : RLS/EXECUTE/isolation ne sont que statiquement
  revues ; une erreur de config ne serait détectée qu'au déploiement réel.
- **Migration `0004` obligatoire** : sans elle, EXECUTE reposent sur les défauts
  PostgreSQL (moins sûr).
- **`ns_validate_session`/`ns_logout` doivent rester exécutables par anon** : une
  révocation trop large casserait le frontend (à vérifier en réel).
- **Challenge aggregation** peut paraître inexacte en production.

### 19. Exact Manual Deployment Steps

Voir **`docs/supabase-runtime-validation.md` §4** (CLI + dashboard) :
1. `supabase login` puis `supabase link --project-ref <REF>`.
2. `supabase db push` (migrations 0001→0004) puis coller `rpc_auth.sql`,
   `rpc_sync.sql`, `rpc_activity.sql`.
3. Vérifier `pg_proc.proacl` (ns_create_session sans accès anon).
4. Tester RLS réelle, isolation cross-user, matrice auth, sync, abuse `ns_activity`.
5. Brancher le frontend (injection publique `__NULLSEC_SUPABASE__` + flags),
   re-tester offline (0 requête).

### 20. Next Milestone Recommendation

**Milestone 16 — Real Supabase Deployment & End-to-End Runtime Validation.** Dès qu'un
projet Supabase (et idéalement la CLI) est fourni : appliquer les migrations et RPC,
exécuter la matrice D de `docs/supabase-runtime-validation.md`, corriger les écarts
réels, puis **M16b — UX de re-login & rate-limiting** selon les résultats. En
attendant, le repo est prêt : code cohérent, testé localement/mocké/statiquement, et
**aucun résultat de validation réelle n'est prétendu**.
