# NullSec Backend — Test Plan (Milestone 7)

Le backend n'est pas encore déployé dans le sandbox (pas de PostgreSQL/Node installés).
Ce document décrit le plan de test à exécuter une fois le backend déployé.

## Tests d'intégration prévus

1. **Migrations** : `npm run migrate` applique `0001_init.sql` sans erreur.
2. **Création de compte** : `POST /api/auth/register` avec une clé de récupération
   → `201`, crée `users` + `recovery_credentials` (hash argon2) + `user_profiles`.
3. **Authentification par clé** : `POST /api/auth/login` avec la bonne clé → `200` + token.
4. **Rejet de clé invalide** : login avec mauvaise clé → `401`.
5. **Création de session** : le login crée une ligne `sessions` (token_hash).
6. **Expiration** : une session dont `expires_at` est passée → refusée (401).
7. **Révocation** : `POST /api/auth/logout` révoque la session → token refusé ensuite.
8. **Autorisation API** : `GET /api/me` sans token → 401 ; avec token → données utilisateur.
9. **Sync** : `PUT /api/sync` avec token → upsert profile/settings/progress.
10. **Rate limit** : plus de N requêtes d'auth → 429.

## Vérifications de sécurité (code review)

- Aucune clé de récupération en clair en base (seul `recovery_hash`).
- Aucun token en clair en base (seul `token_hash`).
- Comparaison argon2 en temps constant.
- `Authorization: Bearer <token>` uniquement (pas de cookies).
