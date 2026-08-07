# NullSec — Backend Deployment

# NullSec — backend-deployment

> **⚠️ LEGACY / ARCHIVÉ.** Ce document décrit le scaffold **Express** d'origine
> (`backend/legacy-express/`), **supersédé** par Supabase. Le **backend de production
> est Supabase** (voir `supabase-architecture.md`, `deployment-guide.md`). Conservé
> pour référence historique uniquement.

---
> **Processus de déploiement du backend NullSec (Milestone 8).**

---

## 1. Prérequis

- Node.js 20+ (TypeScript).
- PostgreSQL 14+.
- Variables d'environnement (voir §3).

## 2. Installation

```bash
cd backend
cp .env.example .env   # puis éditer .env (ne jamais committer)
npm install
npm run migrate        # applique les migrations
npm run build          # compile TypeScript → dist/
npm start              # lance le serveur (ou npm run dev en dev)
```

## 3. Variables d'environnement

| Variable | Description | Défaut |
|----------|-------------|--------|
| `NODE_ENV` | `development` / `production` | `development` |
| `PORT` | Port d'écoute | `3000` |
| `DATABASE_URL` | DSN PostgreSQL | `postgres://…` |
| `JWT_SECRET` | Secret réservé (production) | `dev-only-change-me` |
| `SESSION_TTL_HOURS` | Durée de vie des sessions | `168` |
| `AUTH_RATE_LIMIT` | Max requêtes d'auth par minute/IP | `5` |
| `ALLOWED_ORIGINS` | Origines frontend autorisées (CORS) | vide |

Règles : **jamais committer `.env`** (`.gitignore` couvre `backend/.env`).

## 4. HTTPS

- En production, placer derrière un reverse-proxy (Caddy/Nginx) avec TLS.
- Forcer le trafic HTTPS ; le backend est prêt (en-têtes sécurisés, CORS restrictif).

## 5. Sécurité (déploiement)

- `NODE_ENV=production` (logs réduits, pas de stack traces).
- `JWT_SECRET` long et aléatoire.
- `ALLOWED_ORIGINS` = uniquement l'origine du frontend.
- Rate-limit sur `/api/auth/*`.
- Aucune donnée sensible stockée en clair (hash argon2id / sha256).

## 6. Vérification

```bash
curl https://<host>/health
# => {"ok":true,"service":"nullsec-backend","env":"production"}
```

