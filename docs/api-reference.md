# NullSec — API Reference

# NullSec — api-reference

> **⚠️ LEGACY / ARCHIVÉ.** Ce document décrit le scaffold **Express** d'origine
> (`backend/legacy-express/`), **supersédé** par Supabase. Le **backend de production
> est Supabase** (voir `supabase-architecture.md`, `deployment-guide.md`). Conservé
> pour référence historique uniquement.

---
> **Référence des endpoints backend (Milestone 8).** Toutes les réponses sont JSON.

---

## Authentification

### `POST /api/auth/register`
Création de compte depuis une clé de récupération.
```json
{ "identity_id": "uuid", "recovery_key": "NSK1-…", "profile": { "username": "…", "avatar_seed": "…" } }
```
→ `201 { token, user_id }` | `400` | `409 account_already_exists`

### `POST /api/auth/login`
```json
{ "identity_id": "uuid", "recovery_key": "NSK1-…" }
```
→ `200 { token, user_id }` | `401 invalid_recovery_key` | `404 account_not_found`

### `POST /api/auth/logout`
Bearer requis. Révoque la session. → `200 { ok: true }`

### `GET /api/auth/me`
Bearer requis. → `200 { user }`

---

## Utilisateur

### `GET /api/users/me`
Bearer requis. → `200 { user, profile, settings, progress }`

---

## Synchronisation

### `POST /api/sync/push`
Bearer requis. Upsert profile/settings/progress (le plus récent gagne).
```json
{ "profile": {}, "settings": {}, "progress": {} }
```
→ `200 { ok: true }`

### `GET /api/sync/pull`
Bearer requis. → `200 { profile, settings, progress }`

---

## Santé

### `GET /health`
→ `200 { ok: true, service: "nullsec-backend", env }`

---

## Codes d'erreur

| Code | Signification |
|------|---------------|
| `400` | Requête invalide (champ manquant/type). |
| `401` | Non autorisé (token absent/invalide/expiré/révoqué, clé invalide). |
| `404` | Compte introuvable. |
| `409` | Compte déjà existant (identity_id dupliqué). |
| `429` | Rate limit dépassé. |
| `500` | Erreur interne. |

