# NullSec — Data repositories

Couche d'accès aux données de compte (Milestone 18). Les repositories encapsulent
la **source de vérité** (Supabase) et le **cache de session mémoire** (non-persistant).

## Principe

```
UI
 ↓
Services / Repositories
 ↓
ApiClient
 ↓
Supabase RPC
 ↓
PostgreSQL
```

- **Supabase est la source de vérité** de toutes les données de compte
  (profile / settings / progress).
- Les repositories **n'inventent pas leur propre persistance**. Ils délèguent à
  `ApiClient` (Supabase) quand le backend est disponible.
- En attendant un vrai Supabase, ils utilisent un **cache de session mémoire**
  (via `Store`, qui est non-persistant depuis M17). Ce cache ne survit pas à un
  rechargement et ne représente **jamais** un compte local.
- Si Supabase est indisponible, les opérations échouent proprement (ou retournent
  un état vide) plutôt que de fabriquer un compte local.

## Fichiers

| Repository | Donnée | Source de vérité | Cache mémoire |
|------------|--------|------------------|---------------|
| `profile-repository.js` | profil | Supabase | Store (mémoire) |
| `progress-repository.js` | progression | Supabase | Store (mémoire) |
| `settings-repository.js` | réglages | Supabase | Store (mémoire) |

## Note

Le cache `Store` est **non-persistant** (M17) : il ne va ni en `localStorage`, ni en
`IndexedDB`. C'est un état de session temporaire, pas une base de données. Les
repositories sont la couche cible vers laquelle les services de compte migreront
vers `ApiClient`/Supabase dans le milestone backend réel (M19+).
