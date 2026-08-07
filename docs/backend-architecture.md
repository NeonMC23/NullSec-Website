# NullSec — Backend Architecture

# NullSec — backend-architecture

> **⚠️ LEGACY / ARCHIVÉ.** Ce document décrit le scaffold **Express** d'origine
> (`backend/legacy-express/`), **supersédé** par Supabase. Le **backend de production
> est Supabase** (voir `supabase-architecture.md`, `deployment-guide.md`). Conservé
> pour référence historique uniquement.

---
> **Fondation backend de la plateforme NullSec V2 (Milestone 7).**
> API-first, stateless, authentification **sans mot de passe** (clé de récupération
> hachée). PostgreSQL. Le backend n'est **pas encore déployé**.

---

## 1. Choix de stack (documenté)

| Choix | Rationale |
|-------|-----------|
| **TypeScript / Node.js** | Alignement avec le frontend vanilla JS, typage statique, écosystème REST mature. (Rust envisageable plus tard.) |
| **REST API** (JSON) | Simple, stateless, compatible avec le frontend existant. |
| **PostgreSQL** | Relationnel robuste, transactions, migrations SQL. |

## 2. Structure

```
backend/
 ├── src/
 │    ├── index.ts           — entrée Express, montage des routes
 │    ├── config/            — configuration (env)
 │    ├── database/          — pool pg + migration runner
 │    ├── models/            — types des entités
 │    ├── auth/              — hash (argon2), sessions, vérification
 │    ├── middleware/        — auth Bearer, rate limit
 │    └── api/               — routes (auth, me, sync)
 ├── migrations/             — SQL (0001_init.sql)
 ├── tests/                  — plan de test
 └── README.md
```

## 3. API (design)

| Méthode | Path | Auth | Rôle |
|---------|------|------|------|
| `POST` | `/api/auth/register` | non | Crée un compte depuis une clé de récupération. |
| `POST` | `/api/auth/login` | non | Vérifie la clé, crée une session. |
| `POST` | `/api/auth/logout` | Bearer | Révoque la session. |
| `GET` | `/api/me` | Bearer | Renvoie user + profile + settings + progress. |
| `PUT` | `/api/sync` | Bearer | Upsert profile/settings/progress. |
| `GET` | `/health` | non | Liveness. |

Conventions : `Authorization: Bearer <token>`, réponses JSON, codes HTTP standards
(400/401/404/409/429), `Content-Type: application/json`.

## 4. Modèle de sécurité

- **Aucune clé de récupération en clair** en base — hash argon2id uniquement.
- **Aucun token en clair** en base — hash SHA-256 uniquement.
- Validation de chaque requête (body + types).
- **Rate-limit** sur les endpoints d'authentification (par IP).
- Collecte minimale de données : identité, username, avatar_seed, réglages, progression.
- **Aucun tracking, aucune analytics.**

## 5. Stateless

- Le serveur ne garde pas d'état de session en mémoire : chaque requête porte son token
  (Bearer), vérifié contre la table `sessions` (hash).
- Évolutivité horizontale facilitée (postgres partagé).

## 6. Frontière frontend/backend

Le frontend ne connaît le backend que via `Config.backendUrl`/`Config.backendEnabled`
(voir `api-client.js`). Tant que `backendEnabled` est faux, aucun appel réseau n'est émis.

## 7. Liens

- Code : `backend/`
- Schéma DB : `docs/database-schema.md`
- Flow d'authentification : `docs/authentication-flow.md`
- Synchronisation : `docs/sync-architecture.md`

