# NullSec — Authentication Schema

> **⚠️ LEGACY / ARCHIVÉ.** Cet ancien schéma décrivait un **snapshot `ns:auth`** écrit
> en `localStorage`. Depuis **M16**, l'état d'authentification **n'est plus persisté en
> localStorage** : il vit en **mémoire** (Auth) + **sessionStorage** (session courte via
> SessionStore). Voir `docs/session-management.md` pour le modèle actuel. Ce document
> est conservé pour référence historique uniquement.

---

## 1. État d'authentification (historique, v1 — retiré en M16)

**Clé Store (retirée)** : `ns:auth`
**Module** : `assets/js/auth-service.js` (`window.Auth`)

> Aujourd'hui, `Auth.getState()` renvoie un objet **dérivé en mémoire** (jamais
> écrit en localStorage) : `{ mode, authenticated, identity_id, provider, updated_at }`.

```json
{
  "version": 1,
  "mode": "offline",
  "authenticated": false,
  "identity_id": null,
  "provider": null,
  "created_at": "ISO",
  "updated_at": "ISO"
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `version` | `number` | Version du schéma (1). |
| `mode` | `string` | `'offline'` tant qu'aucun backend ; `'online'`/`'authenticated'` à l'avenir. |
| `authenticated` | `boolean` | Toujours `false` dans ce milestone. |
| `identity_id` | `string` (UUID) \| `null` | Identité locale liée (le cas échéant). |
| `provider` | `string` \| `null` | Fournisseur réservé (null offline). |
| `created_at` | `string` (ISO) | Création de l'état. |
| `updated_at` | `string` (ISO) | Dernière mise à jour. |

### Règles
- **Pas de mot de passe**, pas de token, pas de cookie, pas de session.
- **Pas d'identifiant distant** : aucun identifiant n'est envoyé nulle part.
- `authenticated === false` par défaut et tant que `Config.backendEnabled` est faux.

---

## 2. Cycle de vie

```
Auth.init()                 → état offline par défaut (ns:auth)
Auth.getState()             → état courant
Auth.isAuthenticated()      → toujours false
Auth.getUser()              → identité locale liée (ou null)
Auth.loginWithRecoveryKey() → préparation (offline : vérifie localement, n'authentifie PAS)
Auth.logout()               → retour à l'état offline
Auth.reset()                → supprime l'état puis ré-initialise
```

---

## 3. Philosophie offline

- **Zero-authentication par défaut** : personne n'est authentifié tant qu'aucun
  backend n'existe.
- **Le flow de récupération** est préparé mais **non actif** : la clé est vérifiée
  localement (`RecoveryKey.verify`) mais ne change pas l'état.
- `Config.authEnabled` et `Config.backendEnabled` restent `false` → aucun appel réseau.

---

## 4. Frontière backend future

Quand un backend existera :
1. `Config.backendEnabled` → `true`, `Config.authProvider` défini.
2. `Auth.loginWithRecoveryKey()` enverra la clé (normalisée) pour vérification serveur.
3. En cas de succès → `authenticated = true`, `identity_id` lié.
4. Fallback offline conservé si le réseau échoue.

---

## 5. Vérification de la clé de récupération

`RecoveryKey.verify(input)` :
- normalise (majuscules, tirets) ;
- valide le format `NSK1-…` ;
- compare avec la clé stockée localement ;
- retourne `true`/`false`.

Aucune régénération, aucun réseau, aucun log, aucune exposition en URL.

---

## 6. Sécurité

- Aucun stockage sensible : pas de mot de passe, token, cookie, session.
- Aucun envoi réseau (seul `data-loader.js` contient `fetch`, pour les JSON statiques).
- La clé ne quitte jamais le navigateur.
- L'export/import inclut l'état d'authentification (offline) mais aucune donnée sensible.

---

## 7. Liens

- Module : `assets/js/auth-service.js`
- Stockage : `assets/js/store.js`
- Clé de récupération : `docs/recovery-key.md`
- Architecture : `docs/v2-architecture.md`
