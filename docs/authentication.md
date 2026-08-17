# NullSec — Authentication (Username + Password)

> **Milestone 32.** Le parcours d'authentification principal est
> **username + password**. **NullSec does not use email-based authentication.**
> La recovery key est un mécanisme de **récupération du compte**, pas une méthode
> de connexion principale.

```
Username + Password
        │
        ↓
  Authentication (RPC: ns_register / ns_login / ns_recover)
        │
        ↓
  Short-lived session (sessionStorage)
        │
        ↓
  Private account
        │
        ↓
  Private progression (Supabase)
        │
        ↓
  Aggregated community statistics
```

---

## 1. Modèle

- **Compte** : identifié par un **username** (privé, unique, insensible à la casse)
  et protégé par un **password**.
- **Password** : jamais stocké en clair, jamais envoyé en clair, jamais en
  localStorage. Seul un **SHA-256 transport hash** est envoyé ; le serveur stocke
  un **hash bcrypt** (`pgcrypto crypt`, `gen_salt('bf',10)`) de ce transport hash.
- **Recovery key** : générée **une fois à la création du compte**, affichée une
  seule fois, jamais stockée en localStorage (sessionStorage court-lived).
  Elle sert uniquement à **récupérer l'accès** au compte (`ns_recover`).
- **Email** : **aucun** email n'est demandé, stocké, affiché ou utilisé.

## 2. Schéma (Supabase)

`users` (migration `0017_auth_username_password.sql`) :
- `username TEXT` — identifiant privé (unique via index `lower(username)`).
- `password_hash TEXT` — hash bcrypt du SHA-256 transport hash.
- (`identity_id` conservé pour compatibilité historique.)

`recovery_credentials` — hash bcrypt du SHA-256 de la recovery key.

`sessions` — token (SHA-256 haché côté serveur), `expires_at` (7 jours), `revoked`.

## 3. RPC

| RPC | Rôle |
|-----|------|
| `ns_register(username, password_hash, recovery_hash?)` | Créer un compte (+ session) |
| `ns_login(username, password_hash)` | Se connecter (+ session) |
| `ns_recover(username, recovery_hash, new_password_hash)` | Récupérer l'accès : vérifie la recovery key, établit un nouveau password, révoque les sessions existantes — **ne crée pas de session** |
| `ns_logout(token)` | Révoquer la session |
| `ns_validate_session(token)` | Valider une session |

Tous sont `SECURITY DEFINER` avec `SET search_path = public`. Aucun password ni
hash n'est jamais retourné au frontend. Les erreurs sont génériques
(`invalid_credentials`) pour ne pas révéler si un username existe.

## 4. Frontend

- `Auth.createAccount(username, password)` → `ns_register`
- `Auth.signIn(username, password)` → `ns_login`
- `Auth.recoverAccount(username, recoveryKey)` → `ns_recover`
- `Auth.getUsername()` → identifiant privé de session (affiché sur la page Account)
- `Auth.validateUsername/validatePassword` → règles cohérentes avec le backend
  (username 3–32, lettres/chiffres/._- ; password ≥ 8)

**Stockage** :
```
localStorage:     ns:theme  (préférence appareil)
sessionStorage:   ns:session:recovery, ns:session:auth { token, username, expires_at }
```
Le mot de passe n'est **jamais** conservé après authentification.

## 4.1 Récupération de compte (M33)

La recovery key n'est **pas** une méthode normale de connexion. Le flux est :

```
Recover account
  ↓
Recovery key (username + NSK1-…)
  ↓
Server verifies recovery credential
  ↓
Set new password (hashé côté serveur) + révocation des sessions existantes
  ↓
Sign in normal avec username + nouveau password
```

`ns_recover` ne retourne **jamais** de token de session : après une récupération,
l'utilisateur se connecte normalement avec son nouveau password.

## 5. Règles de sécurité

- Password hashé (bcrypt) côté serveur ; jamais en clair ni en localStorage.
- Recovery key : sessionStorage court-lived, jamais en localStorage.
- Session : court-lived, jamais en localStorage, token jamais dans les URLs.
- RLS **non affaiblie** : tables privées fermées à `anon` ; accès via RPC
  `SECURITY DEFINER` token-authentifiés.
- Aucune permission `anon` dangereuse ajoutée.

## 6. Privacy

- Le **username** est un identifiant de connexion **privé**. Il n'est pas un
  profil public, n'apparaît pas dans Community, et n'est exposé qu'à son
  propriétaire (page Account).
- Pas d'avatar, pas de display name, pas de bio, pas de followers.
- Les données communautaires restent **agrégées**.

## 7. Vrai compte serveur & cross-device (M35)

Un compte NullSec est un **vrai compte serveur**, pas une évolution d'un profil local.

- **Create account** crée le compte côté **Supabase** (une seule fois).
- Le compte **ne dépend pas du navigateur** : fermer l'onglet ou effacer les données
  du navigateur ne supprime pas le compte.
- **Sign in** (username + password) fonctionne depuis **n'importe quel appareil** sans
  aucune donnée locale : le compte et la progression sont restaurés depuis le serveur.
- Le **navigateur n'est jamais la source de vérité** :
  ```
  Browser → session temporaire → Supabase → Account + Progress
  ```
- Après sign-in, la progression serveur est rechargée via `Sync.sync()`
  (pull → resolve → push) puis `Progress.reload()`.
- À la restauration de session, le **username serveur** (stocké en sessionStorage) est
  préservé — jamais remplacé par un identifiant local.

`localStorage` ne contient **aucune** donnée de compte ; seuls `ns:theme` et
`ns:migrated:v1`. `sessionStorage` contient uniquement `ns:session:auth` et
`ns:session:recovery` (temporaire, pas de password).

## 8. Gestion du compte & cycle de vie de session (M36)

Le cycle de vie d'un compte NullSec fonctionne comme un véritable service web :

- **Create account** → compte Supabase (créé une fois, indépendant du navigateur).
- **Sign in** → username + password → session serveur (sessionStorage).
- **Sign out** → `ns_logout` (best-effort) + nettoyage de la session locale → guest.
- **Re-sign in** → même compte serveur (username + password). Aucune donnée locale requise.

### Changement de password (M36)

- `Auth.changePassword(currentPassword, newPassword)` → `ns_change_password`.
- Vérifie le **password actuel**, enregistre uniquement le **hash** du nouveau
  (bcrypt côté serveur), révoque les **autres sessions** (la session courante est conservée).
- Un mauvais password actuel renvoie `invalid_credentials` et **ne déconnecte pas**
  (le nettoyage de session n'est déclenché que par un vrai refus 401/403, pas par un 400
  de credentials).

### Reset progress (M36)

- `ApiClient.resetProgress(token)` → `ns_reset_progress`.
- Réinitialise **côté serveur** la progression du compte authentifié, puis recharge
  l'état local. Uniquement accessible à l'utilisateur connecté.

### Session

- Token opaque validé côté serveur ; expiration → guest ; sign out → session révoquée.
- `localStorage` : aucune donnée de compte. `sessionStorage` : `ns:session:auth`,
  `ns:session:recovery` (temporaire, jamais de password).

## 9. Cycle de vie du compte & session (M37)

Le cycle de vie est finalisé et validé par la suite `tests/m37-tests.mjs` :

```
CREATE → SERVER ACCOUNT → SIGN IN → SESSION → ACCOUNT / JOURNEY → SIGN OUT → GUEST
```

- **Compte serveur** : créé une fois (`ns_register`), indépendant du navigateur.
- **Sign in** : username + password (`ns_login`) → session serveur autoritaire.
- **Session** : token opaque validé serveur (`ns_validate_session`) ; expirée/invalide → guest ;
  sign out → `ns_logout` + nettoyage local. Le simple présence d'un token ne prouve rien.
- **Restauration** : le username restauré est celui du **serveur** (jamais un UUID local).
- **Recovery** : `ns_recover` vérifie la recovery key, remplace le password, révoque les
  sessions — **aucune session créée**. La recovery key n'est pas un login.
- **Cross-device** : aucun compte local requis ; username+password restaure le même compte et
  la même progression (testé en MOCKED).
- **Stockage** : `localStorage` = `ns:theme`, `ns:migrated:v1` ; `sessionStorage` =
  `ns:session:auth`, `ns:session:recovery`. Aucune donnée de compte persistante.
- **Erreurs de login** : « Invalid username or password » (pas d'énumération).

## 11. Personnalisation du profil public (M38)

La page Account (privée) expose une section **Public Profile** : activer/désactiver la
visibilité, éditer bio + intérêts. La mise à jour passe par `ns_update_public_profile`
(authentifié, identité dérivée de la session). Le RPC public `ns_public_profile` retourne
désormais `enabled, username, bio, learning_interests, created_at, completed_mission_ids`
lorsque le profil est activé, et `{ enabled:false }` sinon (non-énumératif).

## 10. Profils publics (M37)

L'authentification reste inchangée (username + password ; recovery = récupération uniquement).
En complément, un **profil public d'apprentissage** est disponible via le RPC en lecture seule
`ns_public_profile(p_username)` — `SECURITY DEFINER`, accessible à `anon`, retournant
uniquement `username` + `completed_mission_ids`. Voir **`docs/public-profiles.md`**.

Le profil public n'expose jamais : password, recovery, session, token, user_id, identity_id,
email, réglages privés. Il ne contourne pas RLS ni l'autorisation des RPC privés.
