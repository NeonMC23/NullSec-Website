# NullSec — Session Security

# NullSec — session-security

> **⚠️ LEGACY / ARCHIVÉ.** Ce document décrit le scaffold **Express** d'origine
> (`backend/legacy-express/`), **supersédé** par Supabase. Le **backend de production
> est Supabase** (voir `supabase-architecture.md`, `deployment-guide.md`). Conservé
> pour référence historique uniquement.

---
> **Modèle de sécurité des sessions (Milestone 8).**

---

## 1. Tokens

- Génération : `randomBytes(32).toString('base64url')` (opaque, non prédictible).
- Transmission : `Authorization: Bearer <token>`.
- **Jamais stocké en clair** en base : seul `token_hash` (SHA-256) est conservé.
- **Jamais persisté/loggé** côté client : le token vit en mémoire (Sync.setToken).

## 2. Session (table `sessions`)

| Champ | Rôle |
|-------|------|
| `token_hash` | Hash SHA-256 du token. |
| `expires_at` | Expiration (défaut `SESSION_TTL_HOURS`). |
| `revoked` | Révocation (logout). |

## 3. Cycle de vie

```
login → token → [requêtes Bearer] → logout → revoked=true
                            └─ expiration → 401
```

- Une session expirée ou révoquée est refusée par `authMiddleware`.
- `POST /api/auth/logout` révoque la session.

## 4. Auth middleware

`authMiddleware()` (backend) :
1. Extrait le Bearer token.
2. Calcule le hash.
3. Cherche une session non révoquée et non expirée.
4. 401 si absente, sinon `req.userId`/`req.sessionId`.

Protège : `GET /api/users/me`, `GET/POST /api/auth/me|logout`,
`POST /api/sync/push`, `GET /api/sync/pull`.

## 5. Protection du secret de récupération

- La clé de récupération n'est **jamais** stockée en clair : hash argon2id.
- La vérification (login) compare le hash en temps constant.

## 6. Défenses complémentaires

- Rate-limit sur `/api/auth/*`.
- En-têtes de sécurité (CSP, nosniff, frame-ancestors).
- CORS restrictif (`ALLOWED_ORIGINS`).
- HTTPS obligatoire en production.

