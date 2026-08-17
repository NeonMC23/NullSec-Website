# Milestone 36 — Account Management & Server Session Lifecycle

> **Statut :** implémenté. Tests **LOCAL / MOCKED / STATIC** verts.
> **REAL SUPABASE: BLOCKED** — **REAL BROWSER: BLOCKED** (pas de projet/secret/navigateur
> accessibles depuis l'environnement).
>
> **Principe :** *NullSec possède désormais un véritable système de comptes serveur. M36
> finalise la gestion du cycle de vie du compte et de la session sans réintroduire de compte
> local, de profil social ou de stockage persistant côté navigateur.*

---

## AUDIT FINDINGS

- Le modèle serveur M33/M35 était déjà en place : `users` (username + password_hash),
  `sessions`, `recovery_credentials`, `user_progress`, RPC `ns_register`/`ns_login`/
  `ns_recover`/`ns_logout`/`ns_validate_session`/`ns_sync_pull`/`ns_sync_push`.
- **Écart M36 1** : aucun RPC de **changement de password** authentifié.
- **Écart M36 2** : le « Reset progress » était **local uniquement** (vidait le cache
  mémoire) sans toucher la progression serveur.
- **Écart M36 3 (bug)** : un échec de changement de password (mauvais password actuel,
  400 `invalid_credentials`) déclenchait le handler de nettoyage de session → **déconnectait**
  l'utilisateur. Un mauvais password ≠ session expirée.
- Backend `0001→0017` : intact, satisfait le modèle (aucune colonne manquante pour password
  change / reset progress).

## ROOT CAUSE

M36 requiert des actions de gestion de compte authentifiées (`ns_change_password`,
`ns_reset_progress`) qui n'existaient pas, et le handler d'échec UNAUTHORIZED était trop
agressif (déclenchait le logout sur un simple échec de credentials).

## CHANGES

### Backend (RPC ajoutés, **aucune migration**)
- **`rpc_auth.sql`** : ajout de `ns_change_password(p_token, p_current_password_hash,
  p_new_password_hash)` — authentifie via `ns_validate_session`, vérifie le password actuel,
  définit le nouveau hash (bcrypt), révoque les **autres sessions** (conserve la courante).
- **`rpc_sync.sql`** : ajout de `ns_reset_progress(p_token)` — authentifie, réinitialise
  `user_progress.progress_json` du compte (jamais un autre compte).
- **`rpc_privileges.sql`** : grant de `ns_change_password(text,text,text)` et
  `ns_reset_progress(text)` à `anon, authenticated` (authentifiés par token) ; revoke PUBLIC.

### Frontend
- **`api-client.js`** : `changePassword(token, payload)` → `ns_change_password` ;
  `resetProgress(token)` → `ns_reset_progress`.
- **`auth-service.js`** : `Auth.changePassword(currentPassword, newPassword)` (transport
  hashes, erreur générique `invalid_credentials`).
- **`profile.js`** : formulaire **Change password** (current/new/confirm) dans la section
  authentifiée ; `Reset progress` appelle désormais `ns_reset_progress` (serveur) puis
  `Progress.reset()` + `Progress.reload()`.
- **`api-client.js` (bug fix)** : `throwClassified` ne déclenche le handler de nettoyage de
  session que sur un vrai refus 401/403, **pas** sur un 400 de credentials.

### Tests
- `tests/m36-tests.mjs` — **créé** (60 assertions).
- `tests/run-tests.mjs` — routage `ns_change_password`/`ns_reset_progress`.
- `tests/sql-audit.mjs` — les deux RPC dans la liste SECURITY DEFINER + checks api-client.
- `tests/run-all.sh` (étape 25), `tests/README.md`.
- `docs/authentication.md`, `docs/account-based-progression.md`.

### Fichiers créés
- `tests/m36-tests.mjs`, `MILESTONE-36-REPORT.md`.

### Fichiers supprimés
- Aucun.

### Migrations ajoutées
- **NONE.** `0001→0017` intactes (aucune colonne manquante : `users.password_hash` et
  `user_progress` existent déjà).

## AUTHENTICATION FLOW

```
Guest → Sign in / Create account (username + password) → ns_login/ns_register
→ Authenticated session (server-authoritative, sessionStorage) → Account / Journey
→ Sign out (ns_logout + nettoyage local) → Guest
→ Sign in again → same server account
```

- Aucun email, OAuth, recovery login. Erreur générique « Invalid username or password ».

## RECOVERY

`ns_recover` (M33, inchangé) : vérifie la recovery key, établit un nouveau password, révoque
toutes les sessions, ne crée **pas** de session. Sign in normal avec le nouveau password.

## SESSION MANAGEMENT

- Initialisation : session présente → validation serveur (`ns_validate_session`) → auth ou
  guest ; pas de confiance dans la simple présence du token.
- Expiration / refus 401/403 : nettoyage local → guest, opérations privées bloquées.
- Sign out : `ns_logout` (best-effort) + nettoyage sessionStorage.
- Un échec de credentials (400) ne force **jamais** le logout.

## PASSWORD

- Changement : `ns_change_password` — vérifie le password actuel, hash bcrypt du nouveau,
  révoque les autres sessions, conserve la session courante.
- Jamais en clair, jamais en localStorage/sessionStorage, jamais dans les erreurs.
- Les règles frontend/backend restent cohérentes (≥ 8 caractères).

## RESET PROGRESS

- Serveur : `ns_reset_progress` — réinitialise la progression du compte authentifié.
- UI : visible uniquement connecté, confirmation, puis `Progress.reset()`/`reload()`.
- Ne supprime ni le compte ni la recovery key, ne déconnecte pas.

## STORAGE

```
localStorage:     ns:theme, ns:migrated:v1
sessionStorage:   ns:session:auth, ns:session:recovery
```

Aucune donnée de compte (username/password/token/recovery/user_id/progress/settings) en
localStorage ; aucun password en sessionStorage.

## SECURITY

- **RLS inchangée.** RPC `SECURITY DEFINER` + `search_path = public`.
- `ns_change_password`/`ns_reset_progress` authentifiés par token validé serveur.
- Aucun `p_user_id` client ; isolation cross-user (reset = son propre `user_progress`).
- Aucun service-role secret en frontend.

## DATA OWNERSHIP / COMMUNITY

- Account data → Supabase → utilisateur authentifié uniquement.
- Community → agrégats uniquement (inchangé M35).

## TESTS

Suite complète `run-all.sh` — **toutes vertes** :
- sql-audit 248 · m14 59 · m15 44 · m16 22 · m17 47 · m18 38 · m19 29 · m20 61 · m21 26 ·
  m22 23 · m24 25 · m25 24 · m26 26 · m27 43 · m28 72 · m28-deploy 26 · m29 19 · m30 28 ·
  m31 31 · m32 45 · m33 56 · m34 60 · m35 80 · **m36 60**
- **Total : 1192 assertions vertes.**

`tests/m36-tests.mjs` (60) : account lifecycle (create/sign in/sign out/re-sign in), session
(valid/invalid/expired), password change (mauvais password rejeté + session conservée, ancien
rejeté, nouveau accepté), recovery (séparée, pas de session, sign in avec nouveau), storage
(localStorage seulement theme/migration, pas de password en sessionStorage), reset progress
(serveur + authentifié), cross-user (pas de p_user_id), community (agrégée), legacy (aucun
loginWithRecoveryKey/local account/email), nouveaux RPC (signatures + SECURITY DEFINER +
privilèges + 17 migrations).

**node --check** : tous JS + tests — OK. **bash -n** : run-all.sh, deploy.sh, apply-sql.sh — OK.

## REMAINING LIMITATIONS

- **LOCAL / STATIC / MOCKED** : validation via harness Node + audit statique.
- **REAL SUPABASE : BLOCKED** — `ns_change_password`/`ns_reset_progress` non exécutés contre
  la production ; le déploiement cloud-first (migrations 0001→0017 + RPC) reste à faire.
- **REAL BROWSER : BLOCKED** — le rendu DOM du formulaire « Change password » et du reset
  n'a pas été validé visuellement.
- **Suppression de compte** : non implémentée (le backend ne fournit pas de RPC sûr dédié ;
  documentée comme travail futur).

## ACCEPTANCE CRITERIA

- ✅ Create account (username + password), compte serveur, indépendant du navigateur.
- ✅ Sign in / re-sign in / autre appareil : username + password.
- ✅ Aucun email.
- ✅ Recovery key = récupération uniquement ; ne crée pas de session.
- ✅ Session validée serveur ; expirée → guest ; sign out révoque + nettoie.
- ✅ Changement de password (hash serveur, autres sessions révoquées, mauvais password ne
  déconnecte pas).
- ✅ Reset progress serveur, privé, uniquement connecté.
- ✅ Username/Account privés ; aucun profil public / réseau social / avatar / annuaire.
- ✅ Aucune donnée de compte en localStorage ; session temporaire en sessionStorage.
- ✅ Guest sans progression modifiable ; authenticated peut modifier la sienne.
- ✅ Aucun accès cross-user ; Community agrégée.
- ✅ RLS conservée ; aucun service-role secret.
- ✅ Aucun ancien login recovery, aucun concept de profil local, aucun fallback local.
- ✅ Tests existants verts ; m36 vert ; node --check vert ; bash -n vert ; run-all.sh vert.
- ✅ Documentation mise à jour.

## FINAL ARCHITECTURAL PRINCIPLE

Le navigateur ne possède pas le compte : `Browser → Temporary session → Supabase → Real
account`. Si localStorage/sessionStorage sont effacés, le compte existe toujours et l'on peut
revenir, se connecter avec username + password, et retrouver la même progression.
`ACCOUNT ≠ SOCIAL PROFILE ≠ COMMUNITY`. Account privé, Journey privé, Community agrégée.
Username + password = login normal. Recovery key = récupération uniquement. Aucun email.
Aucun profil public. Aucun compte local.
