# Milestone 33 — Authentication & Session Hardening

> **Statut :** implémenté. Tests **LOCAL / MOCKED / STATIC** verts.
> **REAL SUPABASE: BLOCKED** — **REAL BROWSER: BLOCKED** (pas de projet/secret/navigateur
> accessibles depuis l'environnement).
>
> **Principe final :** *un compte NullSec est un conteneur privé identifié par un username et
> protégé par un password. Email n'existe nulle part. Recovery key ≠ login. Username + password =
> authentication normale. Recovery key = récupération uniquement. Account = conteneur privé.
> Community = statistiques agrégées. Journey = progression privée du compte.
> localStorage = aucune donnée de compte.*

---

## AUDIT FINDINGS

- **Auth (M32)** : username + password. Le sign-in normal était correct
  (`ns_register`/`ns_login`). Recovery key stockée en sessionStorage.
- **Écart M33 principal** : `ns_recover` retournait un **token de session** à partir du
  username + recovery key seule → c'était un chemin « recovery → authenticated login » que
  M33 interdit. Le flux cible exige recovery → set new password → login normal.
- **Erreurs de login** : `invalid_credentials` n'était pas reconnu comme échec d'auth côté
  client (classé INVALID_ARGUMENTS au lieu de UNAUTHORIZED) → l'UI ne pouvait pas uniformiser
  « Invalid username or password ».
- **Légacy** : plus de `loginWithRecoveryKey` dans le code (supprimé en M32) ; docs seulement.
- **Storage** : localStorage = `ns:theme` uniquement ; sessionStorage = `ns:session:auth` /
  `ns:session:recovery`. Conforme.

## ROOT CAUSE

M32 introduisit `ns_recover` en réutilisant le pattern `ns_login` (création de session), ce qui
laissait une méthode normale « recovery → login ». M33 requiert de séparer strictement la
récupération du login : la recovery key doit permettre de **rétablir un password**, pas
d'ouvrir une session.

## CHANGES

### Fichiers modifiés
- `backend/supabase/functions/rpc_auth.sql` — `ns_recover` modifié (voir DB/RPC).
- `backend/supabase/functions/rpc_privileges.sql` — signature `ns_recover(text, text, text)`.
- `assets/js/auth-service.js` — `recoverAccount(username, recoveryKey, newPassword)` ne crée
  plus de session ; helper `authReason()` ; erreurs d'auth → `invalid_credentials`.
- `assets/js/api-client.js` — `recover` envoie `p_new_password_hash` ; ajout des motifs
  `invalid_credentials`/`invalid_username`/`invalid_password_hash`/`username_taken`/
  `invalid_password` aux échecs d'auth (400 → UNAUTHORIZED).
- `assets/js/profile.js` — formulaire Recover : ajout « New password » + « Confirm new
  password », message « please sign in with your username and new password ».
- `tests/m32-tests.mjs` — recovery ne crée plus de session ; sign-in avec nouveau password.
- `tests/sql-audit.mjs` — assertion frontend `ns_recover` (p_new_password_hash).
- `tests/m33-tests.mjs` — **créé** (56 assertions).
- `tests/run-all.sh` (étape 22), `tests/README.md`.
- `docs/authentication.md`, `docs/account-based-progression.md`.

### Fichiers créés
- `tests/m33-tests.mjs`
- `MILESTONE-33-REPORT.md`

### Fichiers supprimés
- Aucun.

### Migrations ajoutées
- Aucune. M32 (`0017`) fournit déjà `users.username` / `users.password_hash` /
  `unique lower(username)` — pas de doublon. Aucune migration `0001→0017` réécrite.

## AUTHENTICATION FLOW

```
Guest
  ↓
Create account           Sign in
  ↓                       ↓
Username + Password    Username + Password
  ↓                       ↓
Account created        Authenticated session
  ↓                       ↓
Account / Journey      Account / Journey
```

- Sign in échoué → erreur générique `Invalid username or password` (jamais
  « username does not exist »).

## RECOVERY FLOW

```
Account → Recover account
  ↓
Recovery key (username + NSK1-…)
  ↓
Server verifies recovery credential
  ↓
Set new password (hashé côté serveur) + révocation des sessions existantes
  ↓
Sign in normal avec username + nouveau password
```

`ns_recover` ne crée **pas** de session, ne crée **pas** de nouvel utilisateur, modifie
uniquement le compte existant.

## SESSION MANAGEMENT

```
Username + Password → RPC → Session token → sessionStorage (ns:session:auth)
```

- Token + username (privé) en sessionStorage uniquement ; jamais en localStorage.
- Sign out : appelle `ns_logout` (best-effort) + supprime la session locale → guest, Journey
  bloqué, progression non modifiable.
- Token invalide → guest (session nettoyée).
- Les RPC serveur restent l'autorité ; le frontend ne considère jamais la session locale
  comme preuve suffisante.

## SECURITY

- **Password hashing** : SHA-256 transport hash côté client ; **bcrypt** stocké
  (`pgcrypto crypt`, `gen_salt('bf',10)`). Jamais en clair, jamais en localStorage/sessionStorage.
- **Sessions** : token opaque (SHA-256 haché serveur), 7 jours, sessionStorage.
- **RLS** : **inchangée / non affaiblie**. Tables privées fermées à `anon` ; accès via RPC
  `SECURITY DEFINER` + `search_path = public`. `ns_sync_pull/push` restent token-authentifiés.
- **Permissions** : `ns_create_session` reste interne (non granté). `rpc_privileges.sql`
  appliqué après toutes les créations RPC. Aucune nouvelle permission `anon` dangereuse.
- **Énumération de comptes** : `ns_login` → `invalid_credentials` générique ; client →
  `invalid_credentials` ; pas de distinction username inexistant / mauvais password.
- **Scan service-role** : aucune clé service-role en frontend.
- **Cross-user** : `ns_sync_pull/push` token-authentifiés, aucun `p_user_id` client.

## STORAGE

```
localStorage:     ns:theme   (+ marqueur ns:migrated:v1)
sessionStorage:   ns:session:auth, ns:session:recovery
```

Aucune donnée de compte/credential en localStorage. Test statique garantit l'absence de
`password`/`recovery`/`token`/`credentials`/`username` dans les `localStorage.setItem`.

## DATABASE / RPC CHANGES

- **Migration** : aucune nouvelle (0017 déjà suffisante).
- **RPC modifié** : `ns_recover` — signature `(text, text, text)` :
  `ns_recover(p_username, p_recovery_hash, p_new_password_hash)`.
  - DROP de l'ancienne signature `ns_recover(text,text)` (base déployée).
  - Vérifie recovery hash (bcrypt), établit `users.password_hash` (bcrypt du nouveau
    password), révoque les sessions existantes, met à jour `recovery_credentials.last_used_at`.
  - Retourne `{ recovered: true, user_id }` — **aucun token**.
- **Signatures finales** :
  - `ns_register(text, text, text)`
  - `ns_login(text, text)`
  - `ns_logout(text)`
  - `ns_validate_session(text)`
  - `ns_recover(text, text, text)`
  - `ns_create_session(bigint)` (interne)

## TESTS

Suite complète `run-all.sh` — **toutes vertes** :
- sql-audit 240 · m14 59 · m15 44 · m16 22 · m17 47 · m18 38 · m19 29 · m20 61 · m21 26 ·
  m22 23 · m24 25 · m25 24 · m26 26 · m27 43 · m28 72 · m28-deploy 26 · m29 19 · m30 27 ·
  m31 31 · m32 45 · **m33 56**
- **Total : 983 assertions vertes.**

`tests/m33-tests.mjs` (56) : auth (username/password requis, pas d'email, sign-in par
username+password indépendant de recovery, password jamais stocké client, username transmis,
erreur générique, recovery séparée), recovery (set password, pas de session, même compte),
session (token sessionStorage uniquement, sign-out supprime + bloque, token invalide → guest),
security (RPC non anon-exposés, sync authentifié, pas de service-role, pas de cross-user),
legacy (aucun loginWithRecoveryKey, pas de login recovery, pas d'email, pas de
identity_id+recovery), UI (Sign in / Create account / Recover séparés, pas d'avatar, nav
Sign out), storage guard (localStorage.setItem sans credentials).

**JS syntax** : `node --check` sur tous les JS + tests — OK. **Shell** : `bash -n`
(run-all.sh, deploy.sh, apply-sql.sh) — OK.

## REMAINING LIMITATIONS

- **LOCAL / STATIC / MOCKED** : validation via harness Node + audit statique.
- **REAL SUPABASE : BLOCKED** — la nouvelle signature `ns_recover(text,text,text)` et le
  comportement « reset password sans session » n'ont pas été exécutés contre la production ;
  le déploiement réel (migrations 0001→0017 + RPC) reste à faire via le pipeline cloud-first.
- **REAL BROWSER : BLOCKED** — le rendu DOM des formulaires (Sign in / Create / Recover)
  n'a pas été validé visuellement.
- Follow-up : flux « set password » pour les comptes legacy sans password (documenté), et
  révocation serveur des sessions d'un compte après recovery (implémenté ; validé statiquement).

## ACCEPTANCE CRITERIA

- ✅ Aucun email utilisé.
- ✅ Create account = username + password.
- ✅ Sign in = username + password.
- ✅ Recovery key ≠ méthode normale de login (`ns_recover` ne crée plus de session).
- ✅ Recovery key disponible pour récupérer le compte (reset password).
- ✅ Password hashé côté serveur (bcrypt).
- ✅ Aucun password en localStorage ni sessionStorage.
- ✅ Aucun token en localStorage.
- ✅ Session courte en sessionStorage.
- ✅ Sign out détruit la session locale + bloque Journey.
- ✅ Progression exclusivement serveur.
- ✅ Aucun profil public ; username privé (Account uniquement).
- ✅ Aucun avatar social.
- ✅ Aucune donnée individuelle dans Community.
- ✅ RLS inchangée.
- ✅ Aucun service-role secret en frontend.
- ✅ Aucun ancien login recovery accessible (signature `ns_recover(text,text)` supprimée).
- ✅ Erreurs de Sign in génériques (pas d'énumération).
- ✅ Usernames uniques case-insensitive (0017).
- ✅ Migrations 0001→0017 non réécrites.
- ✅ Tests existants verts ; `m33-tests.mjs` vert ; `node --check` vert ; `bash -n` vert ;
  `tests/run-all.sh` vert.
- ✅ Documentation mise à jour.
