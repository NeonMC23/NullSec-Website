# NullSec — Synchronization

# NullSec — synchronization

> **⚠️ LEGACY / ARCHIVÉ.** Ce document décrit le scaffold **Express** d'origine
> (`backend/legacy-express/`), **supersédé** par Supabase. Le **backend de production
> est Supabase** (voir `supabase-architecture.md`, `deployment-guide.md`). Conservé
> pour référence historique uniquement.

---
> **Comportement de synchronisation (Milestone 8).** Offline-first.

---

## 1. Architecture

```
Local Store
    |
    v
Sync Service (sync-service.js)
    |
    v
SyncResolver (sync-resolver.js)
    |
    v
API Client (api-client.js)
    |
    v
Backend (Express)
    |
    v
PostgreSQL
```

## 2. Données synchronisées

| Bloc | Champs | Source locale |
|------|--------|---------------|
| Profile | `username`, `avatar_seed`, `updated_at` | `UserProfile.get()` |
| Settings | `settings_json`, `updated_at` | `Settings.get()` |
| Progress | `missions`, `articles`, `weekly`, `updated_at` | `Progress.get()` |

## 3. Cycle

```
Offline → Store seulement
Online  → Sync.pull() → resolveConflicts() → applyMerged() → Sync.push()
```

- `Sync.sync()` : pull → résoudre → appliquer → push.
- `Sync.push()` : POST `/api/sync/push`.
- `Sync.pull()` : GET `/api/sync/pull`.

## 4. Déclencheurs

- Après connexion / création de compte.
- Après mise à jour du profil.
- Après mise à jour des réglages.
- Après un changement de progression.

`Sync.notifyChanged()` (débounce 400 ms) est appelé par `user-profile.js`,
`settings-service.js` et `progress-service.js` à chaque mutation. En offline il ne
fait rien.

## 5. Résolution de conflits

Stratégie v1 : **le `updated_at` le plus récent gagne** (par bloc).

`SyncResolver.merge(local, server)` retourne pour chaque bloc (profile/settings/
progress) le gagnant `local|server` et la valeur fusionnée. Cette logique pure est
prête pour de futures stratégies (par champ, vector clocks…).

## 6. Fallback offline

- Tant que `Config.backendEnabled`/`Config.syncEnabled` sont faux : **0 requête**,
  l'application ne dépend que du Store local.
- En cas d'échec réseau, `Sync.push/pull/sync` retournent `null` sans crash et les
  données locales sont conservées.

