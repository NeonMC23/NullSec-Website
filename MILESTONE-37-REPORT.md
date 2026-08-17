# Milestone 37 — Account Management & Server Session Lifecycle

> **Statut :** implémenté. Tests **LOCAL / MOCKED / STATIC** verts.
> **REAL SUPABASE : BLOCKED** — **REAL BROWSER : BLOCKED** (pas de projet/secret/navigateur
> accessibles depuis l'environnement).
>
> **Principe :** *NullSec accounts behave like real server-side web accounts. The account
> exists independently from the browser. Username + password is the normal authentication
> mechanism. Recovery key is recovery-only. Sessions are temporary and server-authoritative.
> No account data is persistently stored in the browser.*

---

## AUDIT FINDINGS

- **Lifecycle déjà en place** (M30–M36) : `Auth.createAccount`/`signIn`/`recoverAccount`/
  `changePassword`/`logout` ; `ns_register`/`ns_login`/`ns_logout`/`ns_validate_session`/
  `ns_recover`/`ns_change_password` ; session restoration (`Session.forceRecheck`),
  invalide/expirée → guest, logout complet.
- **Backend** : `users` (username + password_hash), `sessions`, `recovery_credentials`,
  `user_progress`. `ns_create_session` reste interne. 18 RPC, 17 migrations.
- **Storage** : `localStorage` = `ns:theme`, `ns:migrated:v1` ; `sessionStorage` =
  `ns:session:auth`, `ns:session:recovery`. Aucune donnée de compte.
- **Legacy** : aucun `loginWithRecoveryKey`, email, OAuth, social login, `recovery login` dans
  le code vivant. Les occurrences restantes de « local account »/« local profile » sont des
  **commentaires** expliquant leur absence (légitimes).
- **Conclusion** : M37 est principalement un milestone de **validation/durcissement** — le
  lifecycle était déjà correct. Le travail est de le couvrir par une suite dédiée complète.

## ROOT CAUSE

Le cycle de vie a été établi dans les milestones précédents ; M37 exige une **validation
exhaustive** des edge cases (inscription, connexion, session, recovery, cross-device) sans
modifier le backend ni les migrations.

## CHANGES

### Fichiers créés
- `tests/m37-tests.mjs` (86 assertions).
- `MILESTONE-37-REPORT.md`.

### Fichiers modifiés
- `tests/run-all.sh` (étape 26).
- `tests/README.md`.
- `docs/authentication.md`, `docs/account-based-progression.md`.

### Fichiers supprimés
- Aucun.

### Migrations / RPC
- **Aucun changement.** 17 migrations intactes, 18 RPC inchangés. Réutilisation des RPC
  existants (`ns_register`, `ns_login`, `ns_logout`, `ns_validate_session`, `ns_recover`,
  `ns_change_password`).

## AUTHENTICATION

- **Create account** = username + password → `ns_register` → compte serveur + session.
- **Sign in** = username + password → `ns_login` → session serveur autoritaire.
- Aucun email, OAuth, social login, recovery login, compte local.

## SESSION LIFECYCLE

- **Restauration** : lecture de la session temporaire → `ns_validate_session` → authentifié ou
  guest. Le simple présence d'un token ne suffit pas ; le serveur est l'autorité.
- **Invalide / expirée / révoquée** : session locale nettoyée → guest, progression privée
  bloquée.
- **Logout** : `ns_logout` (best-effort) + nettoyage local → guest. Ne supprime ni le compte
  ni la progression serveur.
- **Multi-device** : sign out sur un appareil ne supprime pas le compte/progression ; un autre
  appareil peut se connecter et récupérer la progression.

## PASSWORD

- `ns_change_password` : vérifie le password actuel, définit le nouveau hash (bcrypt),
  révoque les autres sessions (conserve la courante). Jamais en clair, jamais en
  localStorage/sessionStorage, jamais retourné.

## RECOVERY

- `ns_recover` : vérifie la recovery key, remplace le password, révoque les sessions —
  **aucune session créée**. Sign in normal avec le nouveau password. La recovery key n'est
  jamais acceptée par `ns_login`.

## STORAGE

```
localStorage:     ns:theme, ns:migrated:v1
sessionStorage:   ns:session:auth, ns:session:recovery
```

Aucune donnée de compte (username/password/token/recovery/user_id/progress/profile) en
localStorage ; aucun password en sessionStorage.

## SECURITY

- RLS inchangée ; RPC `SECURITY DEFINER` + `search_path = public` ; `ns_create_session`
  interne.
- Aucun service-role ; aucun `p_user_id` client ; erreurs génériques sans énumération.
- Aucun profil public ; Community agrégée ; aucune donnée privée dans Community.

## TESTS

Suite complète `run-all.sh` — **toutes vertes** :
- sql-audit 248 · m14 59 · m15 44 · m16 22 · m17 47 · m18 38 · m19 29 · m20 61 · m21 26 ·
  m22 23 · m24 25 · m25 24 · m26 26 · m27 43 · m28 72 · m28-deploy 26 · m29 19 · m30 28 ·
  m31 31 · m32 45 · m33 56 · m34 60 · m35 80 · m36 86 · **m37 86**
- **Total : 1304 assertions vertes.**

`tests/m37-tests.mjs` (86) :
- **1. Inscription** : username/password requis, trop court/long, caractères invalides,
  password faible, doublon insensible à la casse, aucun compte local partiel.
- **2. Connexion** : erreur générique (pas d'énumération), champs vides, reste guest, session
  créée au succès.
- **3. Session** : sessionStorage uniquement, restauration du username serveur, invalide →
  guest, expirée → guest.
- **4. Logout** : guest, sessionStorage nettoyé, compte/progression serveur non supprimés.
- **5. Recovery** : recovery-only, reset password, pas de session, ancien password rejeté,
  nouveau accepté, recovery key pas un login.
- **6. Cross-device** : device B sans données locales se connecte, même compte.
- **7. Journey** : guest ne complète pas, authentifié complète, sign out bloque.
- **8. Storage** : localStorage seulement theme/migration ; aucun password en sessionStorage.
- **9. Security** : aucun service-role, aucun `p_user_id`, aucun credential dans le markup,
  Community agrégée.
- **10. Legacy** : aucun loginWithRecoveryKey, email, recovery login.
- **11. Lifecycle** : auth/session ne lisent jamais localStorage ; restauration via serveur.

**node --check** : tous les fichiers listés — OK. **bash -n** : run-all.sh, deploy.sh,
apply-sql.sh — OK.

## REMAINING LIMITATIONS

- **LOCAL / STATIC / MOCKED** : validation via harness Node + audit statique.
- **REAL SUPABASE : BLOCKED** — aucun `ns_login`/`ns_validate_session` réel contre la
  production.
- **REAL BROWSER : BLOCKED** — aucun rendu DOM / sessionStorage réel validé.
- **Politique multi-sessions** : le backend révoque les autres sessions lors d'un password
  change / recovery ; la politique globale de sessions simultanées n'a pas été modifiée
  (documentée, non changée — conforme).

## ACCEPTANCE CRITERIA

- ✅ Compte indépendant du navigateur ; create/sign in = username + password ; aucun email /
  OAuth / social login.
- ✅ Recovery key = récupération uniquement ; ne crée jamais de session normale.
- ✅ Session serveur autoritaire ; restauration valide ; invalide/expirée → guest.
- ✅ Sign out nettoie la session, ne supprime ni compte ni progression.
- ✅ Aucune donnée de compte en localStorage ; aucun password en sessionStorage.
- ✅ Username restauré depuis le serveur.
- ✅ Cross-device sans données locales.
- ✅ Guest sans progression privée ; authentifié avec progression privée ; session invalide
  bloque.
- ✅ Compte privé ; aucun profil public/avatar/follower/user directory.
- ✅ Community agrégée ; aucune progression individuelle publique.
- ✅ RLS intacte ; aucun service-role ; aucun `p_user_id` client.
- ✅ Erreurs génériques ; RPC existants réutilisés ; migrations non réécrites.
- ✅ Tests existants verts ; m37 vert ; node --check vert ; bash -n vert ; run-all.sh vert.
- ✅ Documentation mise à jour.

## FINAL ARCHITECTURAL PRINCIPLE

**Le compte vit sur le serveur.** Le navigateur ne contient pas de compte local. Username +
password = authentification normale. Recovery key = réinitialisation/rétablissement du password
uniquement. Sessions temporaires et autoritaires côté serveur. Progression = compte serveur.
Campagnes/missions = définitions d'apprentissage publiques. Community = intelligence agrégée.
Pas de profil social, pas de compte local, pas de donnée de compte persistante dans le
navigateur.
