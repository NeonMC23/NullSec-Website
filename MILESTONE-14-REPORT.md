# Milestone 14 Implementation Report
### Session Persistence, Real Supabase Runtime Validation & Production Authentication — NullSec Platform V2

> Date : 7 août 2026 · Périmètre : persistance de session sûre, restauration au
> démarrage, validation runtime, durcissement de l'authentification, préparation
> à la validation Supabase réelle.
>
> **Honestité requise (inchangée)** : aucun projet Supabase réel n'est disponible
> dans ce sandbox (pas de variables d'env, pas de CLI). Aucune migration, RPC ou
> RLS n'a été exécutée sur un vrai projet, et rien n'est « validé en production ».
> Ce rapport distingue clairement **testé localement**, **Supabase mocké testé**,
> **SQL statiquement revu**, et **bloqué — à exécuter côté dashboard**.

---

## 1. Summary

M14 introduit la **persistance de session courte** (sessionStorage) et la
**restauration/validation au démarrage** sans jamais persister de secrets
long-vivants, tout en préservant l'offline-first (0 requête backend quand Supabase
est désactivé). L'état « authentifié » devient un **flag mémoire** (source de
vérité) posé uniquement par un login/register réussi ou une restauration validée
par le serveur — un reload ne peut plus ressusciter une session périmée.

Un **audit statique SQL** a découvert et fermé une faille de permissions :
`ns_create_session(p_user_id)` était exécutable par le rôle anon via PostgREST
(permission `EXECUTE` PUBLIC par défaut), permettant de frapper une session pour
un `user_id` arbitraire. Ajout de `0003_rls_functions.sql` qui révoque cet accès.

La validation **réelle** (auth, RLS, isolation cross-user, sync, abuse testing)
reste **bloquée** faute de projet Supabase ; les étapes et la matrice sont fournies.

## 2. Session persistence implementation

- Nouveau module **`assets/js/session-store.js`** : unique accès à `sessionStorage`.
  Clés : `ns:session:auth` (`{ token, expires_at }`) et `ns:session:recovery` (clé).
- **Token** : mémoire (`Sync`) + sessionStorage. **Jamais** en localStorage.
- **Clé de récupération** : déplacée de `localStorage` (`ns:recovery`) vers
  `sessionStorage` (`ns:session:recovery`) — un secret long-vivant ne doit pas
  résider dans localStorage (exigence de l'audit M14).
- `expires_at` est **informatif** : sert uniquement à un rejet précoce sûr d'un
  token clairement expiré ; la validité réelle est toujours décidée par le serveur.
- Documenté dans `docs/session-management.md` (avec compromis de sécurité).

## 3. Authentication flow

- **`Auth.register()`** → `RecoveryKey.hashForTransport()` (SHA-256) →
  `ns_register` → token → `applySession` (flag mémoire + sessionStorage + snapshot
  `ns:auth` non secret). Offline → `authentication-unavailable-offline`, 0 réseau.
- **`Auth.loginWithRecoveryKey()`** → SHA-256 → `ns_login` → même traitement.
- **`Auth.logout()`** → `ns_logout` (best-effort, non bloquant) + `clearSession`
  (flag, mémoire, sessionStorage, snapshot).
- La **clé brute ne quitte jamais le navigateur** : seuls des hashes SHA-256 sont
  transmis ; `ns_register`/`ns_login` stockent un bcrypt salé côté serveur.

## 4. Session validation / expiration behavior

- **`SessionService.restore()`** (un seul passage par chargement) :
  1. Supabase désactivé/non configuré → **0 requête**, mode local, session nettoyée.
  2. Aucune session → mode local, 0 requête.
  3. Session stockée → `ns_validate_session` (autorité serveur) :
     - valide → **authentifié** ;
     - invalide/expirée/révoquée → session **effacée**, mode local ;
     - backend injoignable → mode local maintenant, session **conservée** pour
       réessai (statut `unavailable`).
- `Auth.clearMemorySession()` (injoignable) préserve la session persistée ;
  `Auth.clearSession()` (invalide) l'efface.
- **Aucun polling** ; pas de confiance au `expires_at` client comme preuve de validité.
- Un refus `UNAUTHORIZED` déclenche le nettoyage sans boucle de validation.

## 5. Supabase deployment status

**NON DÉPLOYÉ.** Aucun projet réel : migrations (`0001`, `0002`, `0003`), RPC
(`rpc_auth`, `rpc_sync`, `rpc_activity`) et RLS **non exécutées** sur un vrai projet.
Le frontend n'est pas branché en production (`supabaseEnabled=false` par défaut).
Étapes précises fournies dans `docs/deployment-guide.md` (section « Statut du
déploiement réel »).

## 6. RLS status

- **Statique** : `0002_rls.sql` active RLS sur 14 tables ; tables privées sans
  accès anon ; tables agrégées en SELECT anon uniquement ; `REVOKE` sur les écritures.
- **Statique** : `0003_rls_functions.sql` (nouveau, M14) révoque `EXECUTE` sur le
  helper interne `ns_create_session` pour anon/authenticated (**faille fermée**).
- **Non testé en réel** : comportement RLS réel (anon vs authenticated vs RPC) bloqué.

## 7. Cross-user isolation status

- **Architecture** : sync token-authentifiée (`ns_sync_pull/push` dérivent le
  `user_id` via `ns_validate_session`) ; aucun `p_user_id` choisi par le client.
- **Statique** : confirmé par revue du SQL (aucun `p_user_id` client dans les RPC
  exposées) ; la faille `ns_create_session` est fermée.
- **Non vérifié en réel** : test 2 utilisateurs (A ne peut lire/écrire les données
  de B) **bloqué** faute de projet.

## 8. Sync validation status

- **Mocké (Node)** : push/pull/flux de session mockés fonctionnent ; le token est
  requis et ne transite jamais en URL ; `ns_activity` ne transmet pas d'identité.
- **Blocage** : push/pull réels, conflits (`updated_at` wins), malformed payload,
  backend indisponible → **non testés en réel**. `docs/deployment-guide.md`
  fournit la matrice.

## 9. Community activity validation

- **Statique** : `ns_activity` ne prend que `mission_id` / `country_code` / `region` ;
  pas de champs identité ; les agrégats ne sont pas modifiables par anon (RLS).
- **Blocage** : abuse testing réel (IDs invalides, injection, répétition) → non
  exécuté faute de projet.

## 10. Offline-first validation

- **Local (Node) testé** : `supabaseEnabled=false` → **0 appel backend**,
  `register`/`login` → `authentication-unavailable-offline`, session `local`,
  communauté offline sans requête backend.
- Vérifié statiquement : `fetch` reste centralisé (`api-client.js`,
  `data-loader.js`) ; pas de `var`, pas de handlers inline.

## 11. Security audit results

- Pas de `SUPABASE_SERVICE_KEY`/`service_role` dans le frontend (référencé
  uniquement dans `backend/supabase/src/config.ts` = env serveur, non commité).
- Pas de `console.log(session)`/`console.log(token)`.
- `sessionStorage` réservé à `session-store.js` (session + clé) ; `localStorage`
  (`store.js`) ne contient **aucun** secret (plus de `ns:recovery`).
- La clé brute n'apparaît dans aucun payload réseau ; seuls des SHA-256 partent.
- `fetch` centralisé ; pas de token en URL ; pas de secrets commités (`.gitignore`
  couvre `backend/.env` et `backend/supabase/.env`).
- Faille `ns_create_session` découverte et fermée (migration `0003`).

## 12. Files created

- `assets/js/session-store.js`
- `assets/js/session-service.js`
- `tests/run-tests.mjs`, `tests/m14-tests.mjs`, `tests/README.md`
- `backend/supabase/migrations/0003_rls_functions.sql`
- `MILESTONE-14-REPORT.md`

## 13. Files modified

- `assets/js/config.js` (v2.2 : injection publique `__NULLSEC_SUPABASE__`)
- `assets/js/auth-service.js` (réécrit : flag mémoire, login/register/logout réels)
- `assets/js/api-client.js` (classification d'erreurs, handler non autorisé)
- `assets/js/session-service.js` (nouveau — cf. §12)
- `assets/js/sync-service.js` (commentaires/API)
- `assets/js/user-state.js` (isAuthenticated délégué à Auth)
- `assets/js/recovery-key.js` (clé → sessionStorage, `importRaw`)
- `assets/js/settings-service.js` (import → `RecoveryKey.importRaw`)
- `assets/js/profile.js` (Auth.register/login/logout, « Checking session… », erreurs sûres)
- `assets/js/mission-discovery.js` (commentaire périmé corrigé)
- 8 × `*.html` (ajout des scripts `session-store.js` / `session-service.js`)
- `docs/session-management.md`, `docs/supabase-architecture.md`,
  `docs/deployment-guide.md`, `docs/authentication-flow.md`,
  `docs/javascript-architecture.md`, `docs/v2-architecture.md`

## 14. Tests actually executed

| Test | Type | Résultat |
|------|------|----------|
| `node --check` sur tous les fichiers JS (hors fuse.min) | syntaxe | ✅ OK |
| Audit statique (pas de `var`, pas d'inline, `fetch` centralisé, pas de service key) | statique | ✅ OK |
| Offline-first : 0 requête, auth indisponible offline | local | ✅ |
| Clé en sessionStorage, pas en localStorage | local | ✅ |
| `hashForTransport` = 64 hex déterministe | local | ✅ |
| Login/register mockés → session persistée, token jamais en URL/localStorage | mocké | ✅ |
| Restauration : valide/invalide/expirée/injoignable | mocké | ✅ |
| Classification d'erreurs (OFFLINE/UNCONFIGURED/UNAUTHORIZED/SERVER_ERROR) | mocké | ✅ |
| Nettoyage sur `UNAUTHORIZED` (pas de boucle) | mocké | ✅ |
| Injection config publique ignorée si non demandée | local | ✅ |
| Régression communauté offline (0 requête backend) | local | ✅ |

**58 assertions, 0 échec** (`node tests/m14-tests.mjs`).

## 15. Tests blocked by missing real Supabase access

- Exécution des migrations / RPC / RLS sur un vrai projet.
- Matrice d'authentification réelle (register/login/logout/session/expiration).
- Isolation cross-user (2 utilisateurs) + blocage PostgREST direct.
- RLS réelle (anon vs authenticated vs RPC).
- Abuse testing de `ns_activity` (IDs invalides, injection, répétition).
- Sync réelle (push/pull, conflits, malformed, backend down).

## 16. Remaining technical debt

- **Rate-limit** : dépendance plateforme non implémentée (documentée, hors code).
- **Argon2** : non natif PostgreSQL ; utilisation de bcrypt pgcrypto (déviation
  documentée depuis M13.1).
- **UX de re-login** : après fermeture du navigateur, la clé de récupération
  (sessionStorage) disparaît ; aucun écran de saisie de clé n'existe (le flow
  utilise la clé locale). À traiter dans un futur milestone UX.
- **Statut « unavailable »** non re-rendu automatiquement sur toutes les pages
  (re-rendu à la prochaine action/chargement).

## 17. Risks

- **Validation réelle absente** : RLS/permissions fonctions et isolation ne sont
  que statiquement revues ; une erreur de configuration ne serait détectée qu'en
  déploiement réel.
- **Migration `0003` obligatoire** : sans elle, la faille `ns_create_session`
  subsiste en production.
- **`ns_validate_session`/`ns_logout` doivent rester exécutables par anon** : une
  révocation trop large casserait le frontend (à vérifier en réel).
- Risque UX faible : la session courte peut surprendre l'utilisateur (re-login).

## 18. Next milestone recommendation

**Milestone 15 — Real Supabase Runtime Validation.** Dès qu'un projet Supabase
(et idéalement l'outillage `supabase` CLI) est fourni :
1. appliquer `0001` → `rpc_*` → `0002` → `0003` ;
2. exécuter la matrice d'authentification (§8) et le test d'isolation cross-user (§9) ;
3. vérifier RLS réelle + abuse testing de `ns_activity` ;
4. brancher le frontend (injection publique), activer les flags, re-tester
   l'offline-first (0 requête) et la restauration de session ;
5. ré-éditer ce rapport avec les résultats réels.

En attendant, le repo est **prêt pour cette validation** : restauration sûre
implémentée, état authentifié survivant au cycle de session voulu, sessions
invalides gérées proprement, offline intact, et aucun résultat de validation réelle
n'est prétendu.
