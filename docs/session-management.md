# NullSec — Session Management

> **Gestion de session production (Milestone 13.1 → 14).**

---

## 1. Tokens

- Génération serveur : `gen_random_bytes(32)` encodé base64 (opaque, non prédictible).
- Transmission : dans le **corps** des RPC authentifiées (jamais en URL, jamais loggé).
- **Jamais stocké en clair** : seul `token_hash` (SHA-256) est conservé en base.
- Côté client le token vit :
  - en **mémoire** (`Sync.setToken`) comme source courante, et
  - dans **sessionStorage** (`SessionStore`) pour la restauration au démarrage
    (M14). Il n'est **jamais** dans localStorage.

## 2. Persistance de session (M14)

Structure persistée minimale (`ns:session:auth`, via `SessionStore`, sessionStorage) :

```json
{ "token": "<opaque>", "expires_at": "<ISO | null>" }
```

- **Seul** le token (et une métadonnée d'expiration **informative**) y figure.
- **Jamais** : clé de récupération brute, hash de récupération, mot de passe,
  profil, progression, payloads de sync.
- `sessionStorage` (et non `localStorage`) : la session est **courte**, liée à
  l'onglet, effacée à la fermeture — réduit la surface d'un secret persistant.
- La **clé de récupération** (`ns:session:recovery`) est également déplacée en
  `sessionStorage` depuis M14 (M13 la stockait dans `ns:recovery` en localStorage) :
  un secret long-vivant ne doit pas résider dans localStorage.

### Compromis de sécurité (documenté)

| Choix | Raison | Limite assumée |
|-------|--------|----------------|
| Token en sessionStorage | Restaure la session dans l'onglet sans re-login, sans secret persistant à long terme | Fermer l'onglet/navigateur → retour au mode local (re-login requis) |
| Clé de récupération en sessionStorage | Évite un secret dans localStorage | Après fermeture du navigateur, l'utilisateur doit ré-importer/ré-entrer sa clé |
| `expires_at` client informatif | Permet de court-circuiter un token **clairement expiré** sans requête | N'est **jamais** une preuve de validité |

## 3. Validation (RPC)

- `ns_validate_session(p_token)` : calcule le SHA-256, cherche une session non
  révoquée et non expirée, retourne `user_id` ou `NULL`.
- `ns_sync_pull` / `ns_sync_push` : **token-authentifiés** — ils valident le token et
  utilisent le `user_id` résultant. Le client ne fournit jamais un `user_id` choisi,
  donc un utilisateur A ne peut pas accéder aux données de B.

## 4. Cycle de vie

```
login/register → token (mémoire + sessionStorage) → [RPC authentifiées]
   → logout → token révoqué (ns_logout) + session locale effacée
   └─ expiration → ns_validate_session → NULL → mode local + session effacée
```

## 5. Restauration au démarrage (M14) — `SessionService`

Une seule validation par chargement de page (jamais de polling) :

1. **Supabase désactivé/non configuré** → **0 requête réseau**, mode local, toute
   session persistée éventuelle est nettoyée.
2. **Aucune session stockée** → mode local, 0 requête.
3. **Session stockée présente** → `ns_validate_session` (autorité serveur) :
   - valide → mode **authentifié** restauré ;
   - invalide/expirée/révoquée → session effacée, mode **local** ;
   - **backend injoignable** → mode local **maintenant**, session stockée
     **conservée** pour réessai au prochain chargement (statut `unavailable`).

Le client ne fait **jamais** confiance à son propre `expires_at` comme preuve de
validité ; il ne sert qu'à un rejet précoce sûr.

## 6. Fallback après échec d'authentification

- Les appels RPC authentifiés qui refusent (401 / `unauthorized` / `invalid…`) sont
  classés `UNAUTHORIZED` par `ApiClient`.
- `SessionService` enregistre un handler qui **efface proprement** la session locale
  (mémoire + persistée) — sans relancer de boucle de validation.
- `Auth.isAuthenticated()` est un flag **mémoire** (source de vérité), jamais restauré
  depuis localStorage (un reload ne peut pas ressusciter une session périmée).

## 7. Sécurité

- Aucun mot de passe, email, OAuth.
- Hash SHA-256 des tokens ; hash bcrypt salé des clés de récupération.
- Expiration + révocation.
- RLS bloque tout accès anon aux sessions ; la service-role key n'est pas dans le
  frontend.
- Aucun secret (token, clé brute) dans localStorage ; pas de `console.log` de session.

---

## 8. Robustesse de restauration (M15)

- La restauration ne plante plus si l'identité locale est absente (ex. `localStorage`
  nettoyé mais `sessionStorage` survivant) : `Identity.get()` peut être `null` et est
  géré sans erreur (`session-service.js`).
- Un refus de validation (token invalide/expiré/révoqué) efface proprement la session ;
  un backend injoignable conserve la session pour réessai (`status: unavailable`).

## 9. Validation

Voir `docs/supabase-runtime-validation.md` pour la répartition A (local) / B (mock) /
C (réel) / D (bloqué). La validation contre un **vrai Supabase est bloquée** (aucun
projet disponible) ; elle n'est pas prétendue.

## 10. Politique de stockage (M16)

- **localStorage** : **aucune** donnée de compte. Uniquement `ns:theme` (préférence
  d'appareil) + marqueur de migration. `identity/profile/progress/settings` ne sont
  **plus** persistés (M17) — ils vivent en **mémoire de session** (source = Supabase).
  Les anciennes clés localStorage de compte sont **purgées** au chargement.
- **sessionStorage** (`SessionStore`) : session courte — représentation temporaire
  d'une session Supabase authentifiée — + clé de récupération. Jamais une base de
  données séparée.
- **Mémoire** : flag `authenticated` (Auth), token (Sync), vue (UserState), données de
  compte (identity/profile/progress/settings).
- **Modèle d'état** : `LOCAL / NOT AUTHENTICATED` · `AUTHENTICATED / SUPABASE` ·
  `BACKEND UNAVAILABLE`. Aucun « account local » ne peut ressusciter un utilisateur
  authentifié depuis des données en cache.
