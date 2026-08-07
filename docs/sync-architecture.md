# NullSec — Synchronization Architecture

# NullSec — sync-architecture

> **⚠️ LEGACY / ARCHIVÉ.** Ce document décrit le scaffold **Express** d'origine
> (`backend/legacy-express/`), **supersédé** par Supabase. Le **backend de production
> est Supabase** (voir `supabase-architecture.md`, `deployment-guide.md`). Conservé
> pour référence historique uniquement.

---
> **Architecture de synchronisation (Milestone 7).** Offline-first : la sync est
> optionnelle et uniquement active quand le backend est disponible.

---

## 1. Architecture

```
UI
 ↓
SyncService (sync-service.js)
 ↓
API Client (api-client.js)
 ↓
Backend (POST /api/auth, GET /api/me, PUT /api/sync)
 ↓
Database (PostgreSQL)
```

## 2. Comportement

```
Offline (backendEnabled=false ou hors-ligne)
    ↓
Store uniquement (aucun réseau)

Online (backendEnabled=true + en ligne)
    ↓
Push les changements (profile, settings, progress)
```

## 3. Données synchronisées

| Bloc | Source locale | Table backend |
|------|---------------|---------------|
| Profil | `UserProfile.get()` | `user_profiles` |
| Réglages | `Settings.get()` | `user_settings` |
| Progression | `Progress.get()` | `user_progress` |

Payload (via `Sync.push()` → `PUT /api/sync`) :
```json
{
  "identity_id": "<uuid>",
  "profile": { ... },
  "settings": { ... },
  "progress": { ... }
}
```

## 4. Service

- `Sync.isEnabled()` — backend dispo (Config.backendEnabled + en ligne).
- `Sync.isOnline()` — alias de isEnabled.
- `Sync.push()` — pousse les données si en ligne + token ; sinon no-op.
- `Sync.setToken()/getToken()/clearToken()` — token de session en mémoire (jamais persisté).

## 5. API Client

- `ApiClient.isBackendAvailable()` — respecte `Config.backendEnabled`/`Config.backendUrl`
  et `navigator.onLine`.
- `ApiClient.register/login/logout/me/sync` — endpoints REST avec `Authorization: Bearer`.

## 6. Migration strategy

Le format d'échange est le même que l'export/import local (`Settings.exportData()`).
À terme, `Sync` remplacera la couche Store sous l'UI sans la modifier : on garde
l'écriture locale et on pousse les changements.

## 7. Sécurité

- Token en mémoire uniquement, jamais persisté/loggé.
- Aucune donnée envoyée sans session valide.
- Offline-first : si le réseau échoue, retour à l'état local, aucun crash.

