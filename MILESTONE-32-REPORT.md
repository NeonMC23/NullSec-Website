# Milestone 32 — Username & Password Authentication UX

> **Statut :** implémenté. Tests **LOCAL / MOCKED / STATIC** verts.
> **REAL SUPABASE: BLOCKED** — **REAL BROWSER: BLOCKED** (pas de projet/secret/navigateur
> accessibles depuis l'environnement).
>
> **Principe final :** *A NullSec account is a private authenticated container identified by a
> username and protected by a password. Email is not used. The recovery key is for account
> recovery. Progress belongs to the authenticated account. Community data is aggregated only.
> There are no public user profiles.*

---

## AUDIT FINDINGS (ce qui existait avant M32)

- **Auth** : basée sur `identity_id` (UUID client) + **recovery key** (bcrypt du SHA-256). Le
  username n'existait que dans `user_profiles.username` (non unique, défaut `'Anonymous'`), sans
  rôle d'identifiant de connexion. **Aucun password**, **aucun email**.
- **RPC** : `ns_register(p_identity_id, p_recovery_hash, p_username, p_avatar_seed)`,
  `ns_login(p_identity_id, p_recovery_hash)`, `ns_logout`, `ns_validate_session`,
  `ns_create_session`. `user_profiles` stockait username/avatar_seed.
- **Frontend** : `Auth.register()`/`loginWithRecoveryKey()` (recovery), pas de formulaire
  username+password, page Account avec boutons recovery.
- **Stockage** : recovery key + token en sessionStorage ; aucune donnée de compte en
  localStorage. Modèle M31 déjà en place.

## ROOT CAUSE

L'auth existante (identity_id + recovery key) ne supportait **pas** le sign-in
**username + password** demandé : aucun username unique, aucune colonne de hash de mot de
passe, et `ns_register`/`ns_login` ne vérifiaient pas un mot de passe. Une migration +
adaptation des RPC étaient nécessaires (justifiées par l'audit).

## CHANGES

### Fichiers créés
- `backend/supabase/migrations/0017_auth_username_password.sql`
- `tests/m32-tests.mjs`
- `docs/authentication.md`
- `MILESTONE-32-REPORT.md`

### Fichiers modifiés
- `backend/supabase/functions/rpc_auth.sql` (réécrit : ns_register/ns_login/ns_recover)
- `backend/supabase/functions/rpc_privileges.sql` (signatures auth + ns_recover)
- `assets/js/auth-service.js` (createAccount/signIn/recoverAccount/getUsername)
- `assets/js/api-client.js` (register/login/recover)
- `assets/js/session-store.js` (username dans la session court-lived)
- `assets/js/profile.js` (formulaires Sign in / Create account / Recover)
- `assets/js/navigation.js` (nav Sign out quand connecté)
- `assets/js/user-state.js`, `assets/js/identity.js` (inchangés dans ce milestone)
- `profile.html` (réorganisation + section Authentication)
- `assets/css/pages.css` (styles formulaires auth)
- `tests/run-tests.mjs` (routage ns_recover)
- `tests/m14-tests.mjs` … `tests/m31-tests.mjs` (adaptés à createAccount/signIn)
- `tests/sql-audit.mjs` (signatures auth, migration 0017)
- `tests/m28-deploy-tests.mjs` (17 migrations)
- `tests/run-all.sh`, `tests/README.md`
- `docs/account-based-progression.md`

### Fichiers préservés
- Backend `users/sessions/recovery_credentials/user_profiles`, `ns_logout`,
  `ns_validate_session`, `ns_create_session`, `ns_sync_pull/push` — réutilisés.
- `recovery-key.js`, `store.js` (ns:theme), `settings-service.js`.

## DATABASE / RPC CHANGES

Migration `0017` :
- `users.username` (nullable, index unique sur `lower(username)`, contrainte format
  3–32 lettres/chiffres/._-), `users.password_hash` (nullable, bcrypt).
- Backfill best-effort depuis `user_profiles` ; `password_hash` NULL pour les comptes legacy
  (récupération via recovery jusqu'à définition d'un password). Idempotent (IF NOT EXISTS),
  compatible base vierge et déployée, RLS/permissions préservées.

RPC :
- `ns_register(text, text, text)` — username + password_hash + recovery_hash (optionnel) → session.
- `ns_login(text, text)` — username + password_hash → session.
- `ns_recover(text, text)` — username + recovery_hash → session (récupération).
- `ns_validate_session`, `ns_logout`, `ns_create_session` inchangés.
- Helpers `ns_valid_username`, `ns_valid_transport_hash`.
- `rpc_privileges.sql` : signatures mises à jour + `ns_recover` granté à anon/authenticated ;
  `ns_create_session` reste interne.

## AUTHENTICATION FLOW (final)

```
Guest
  ↓
Public content
  ↓
Sign in / Create account  (username + password)
  ↓
ns_register / ns_login
  ↓
Authenticated account  (short-lived session)
```

## RECOVERY FLOW

```
Create account  →  username + password
  ↓
Recovery key generated (shown once, sessionStorage)
  ↓
Normal authentication = username + password
  ↓
Recovery key = account recovery only  (ns_recover: username + recovery key)
```

## SECURITY

- **Password hashing** : SHA-256 transport hash côté client ; **bcrypt**
  (`pgcrypto crypt`, `gen_salt('bf',10)`) stocké. Jamais en clair, jamais retourné.
- **Sessions** : token opaque (SHA-256 haché serveur), 7 jours, sessionStorage uniquement,
  jamais dans les URLs.
- **RLS** : **non affaiblie** ; tables privées fermées à `anon` ; accès via RPC
  `SECURITY DEFINER` + `search_path = public`.
- **Permissions** : `ns_register`/`ns_login`/`ns_recover`/`ns_logout`/`ns_validate_session`
  grantés à anon/authenticated (public entry points) ; `ns_create_session` reste interne ;
  aucune nouvelle permission `anon` dangereuse.
- **Stockage** : password/recovery key/token **jamais** en localStorage.
- **Scan service-role** : aucune clé service-role en frontend.

## PRIVACY

- Le **username** est un identifiant de connexion **privé** : visible uniquement sur la page
  Account privée (`Auth.getUsername()`), jamais dans Community, jamais exposé.
- Aucun avatar, display name, bio, followers, profil public.
- Community reste **agrégée** (aucune liste de usernames, aucun user directory).

## TESTS

Suite complète `run-all.sh` — **toutes vertes** :
- sql-audit 239 · m14 59 · m15 44 · m16 22 · m17 47 · m18 38 · m19 29 · m20 61 · m21 26 ·
  m22 23 · m24 25 · m25 24 · m26 26 · m27 43 · m28 72 · m28-deploy 26 · m29 19 · m30 27 ·
  m31 31 · **m32 44**
- **Total : 925 assertions vertes.**

`tests/m32-tests.mjs` (44) : auth (username/password requis, pas d'email, create/sign in/
sign out/recovery/session), security (password jamais en clair, absent localStorage, recovery
key/token absents localStorage, guest sans accès privé), account (accessible après login,
username privé, pas d'avatar/display_name), journey (guest ne complète pas / ne sync pas,
auth complète, progression via Sync layer), privacy (pas de liste usernames, Community
agrégée), static (pas de formulaire email, pas de localStorage.setItem données compte).

**JS syntax** : `node --check` sur tous les JS + tests — OK. **Shell** : `bash -n`
(run-all.sh, deploy.sh, apply-sql.sh) — OK.

## REMAINING LIMITATIONS

- **LOCAL / STATIC / MOCKED** : tout est validé via harness Node + audit statique.
- **REAL SUPABASE : BLOCKED** (pas de projet/secret). La migration 0017 et les RPC
  username+password n'ont pas été exécutés contre la production ; le déploiement réel reste
  à faire via le pipeline cloud-first (`deploy.sh` appliquera migrations 0001→0017 puis RPC).
- **REAL BROWSER : BLOCKED** (pas de navigateur). Le rendu DOM des formulaires n'a pas été
  validé visuellement.
- Les comptes legacy (sans password) ne peuvent se connecter que via le recovery flow
  jusqu'à ce qu'ils définissent un password (flux de « set password » documenté comme
  follow-up).
