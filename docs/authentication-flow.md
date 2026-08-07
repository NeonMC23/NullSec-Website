# NullSec — Authentication Flow

> **Flow d'authentification par clé de récupération (Milestone 7).**
> Aucun mot de passe, aucun email, aucun OAuth, aucun fournisseur tiers.

---

## 1. Concept

```
Identity (locale, UUID)
    |
    |
Recovery Key (NSK1-…, locale)
    |
    |
Backend account (users + recovery_credentials)
```

- L'utilisateur possède une identité locale et une clé de récupération.
- Le serveur ne stocke **que le hash** de la clé (bcrypt salé via pgcrypto — voir note).
- Aucune donnée ne part sans action explicite de l'utilisateur (création de compte).

---

## 2. Création de compte

Client (`Auth.register()` → `ns_register` via ApiClient) :
1. Génère la clé de récupération (faite à l'init du profil, sessionStorage).
2. Crée une identité locale.
3. Envoie le **SHA-256 transport hash** de la clé (jamais la clé brute).

Backend (`ns_register`) :
1. Reçoit le transport hash.
2. Stocke un hash **bcrypt salé** (pgcrypto) de ce transport hash.
3. Crée `users` + `recovery_credentials` (hash) + `user_profiles` + settings + progress.
4. Crée une session, retourne le token.

---

## 3. Connexion

Client (`Auth.loginWithRecoveryKey()` → `ns_login` via ApiClient) :
1. Calcule le SHA-256 transport hash de la clé locale.
2. Envoie `identity_id` + `recovery_hash`.

Backend (`ns_login`) :
1. Vérifie le format du hash.
2. Compare avec le hash bcrypt stocké (`crypt`).
3. Crée une session, retourne le token.

---

## 4. Session

- Token opaque (`gen_random_bytes(32)` base64).
- Stocké **haché** (SHA-256) en base (`sessions.token_hash`).
- Transmis **dans le corps** des RPC authentifiées (jamais en URL, jamais loggé).
- Expiration serveur (défaut 7 jours).
- Révocation via `ns_logout` (revoked = true).
- Côté client : mémoire (`Sync`) + **sessionStorage** (`SessionStore`) pour la
  restauration ; jamais en localStorage.

---

## 5. Cycle de vie

```
register → token (mémoire + sessionStorage) → [RPC authentifiées] → logout → révoqué
login    → token (mémoire + sessionStorage) → [RPC authentifiées] → expiration → 401
reload   → sessionStorage → ns_validate_session → authentifié | local (si invalide)
```

### Restauration M14

- `SessionService` lance **une** validation par chargement.
- Supabase désactivé → **0 requête**, mode local.
- Session stockée → `ns_validate_session` (autorité serveur) ; invalide → effacée ;
  backend injoignable → mode local, session conservée pour réessai.
- Tout refus `UNAUTHORIZED` nettoie la session sans boucle de validation.

---

## 6. Supabase (M13)

- L'auth utilise les RPC Supabase : `ns_register`, `ns_login`, `ns_logout`,
  `ns_validate_session`.
- **La clé brute ne quitte jamais le navigateur** : le client envoie un **SHA-256**
  (`RecoveryKey.hashForTransport`) ; le serveur stocke un hash bcrypt salé.
- `ApiClient` centralise les appels Supabase (RPC + PostgREST).

## 7. Sécurité

- Hash bcrypt salé (pgcrypto) du SHA-256 transport hash pour les clés ; SHA-256 pour les tokens.
- **Aucune clé brute** transmise.
- Rate-limit sur les opérations sensibles.
- Validation de chaque requête.
- Aucun tracking, aucune analytics.

---

## 8. État offline

Tant que `Config.backendEnabled` est faux, `Auth.loginWithRecoveryKey()` ne fait que
vérifier la clé localement (`RecoveryKey.verify`) et **n'authentifie pas**. Aucun réseau.
