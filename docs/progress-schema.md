# NullSec — Progress Schema

> **Référence du modèle de progression utilisateur** (introduit en Milestone 2).
> **M17/M19** : la progression est une donnée de compte dont la **source de vérité est
> Supabase**. Côté client elle vit en **mémoire de session uniquement** (via
> `ProgressRepository` / Store mémoire) et n'est **jamais** persistée en localStorage.
> Hors-ligne, l'UI de progression peut rester utilisable en mémoire, mais cela ne
> constitue pas un compte local. Les sections décrivant une persistance `localStorage`
> sont **historiques**.

---

## 1. Format (v1)

```json
{
  "version": 1,
  "identity_id": "uuid",
  "missions": {
    "mission-id": {
      "completed": true,
      "completed_at": ""
    }
  },
  "articles": {
    "article-id": {
      "read": true,
      "read_at": ""
    }
  },
  "weekly": {
    "mission-id": {
      "completed": true,
      "completed_at": ""
    }
  },
  "updated_at": ""
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `version` | `number` | Version du schéma (actuellement `1`). |
| `identity_id` | `string` (UUID) | UUID de l'identité locale (`Identity.get().id`). |
| `missions` | `object` | Missions complétées, indexées par id de mission. |
| `articles` | `object` | Articles lus, indexés par slug. |
| `weekly` | `object` | Mission hebdomadaire complétée, indexée par id (`weekly-community`). |
| `updated_at` | `string` (ISO 8601 UTC) | Dernière modification. |

### Sous-structures
- **`missions[id]`** : `{ completed: true, completed_at: "<iso>" }` — une mission est
  complétée si `completed === true`.
- **`articles[slug]`** : `{ read: true, read_at: "<iso>" }` — un article est lu si
  `read === true`.
- **`weekly[id]`** : `{ completed: true, completed_at: "<iso>" }` — même forme que les
  missions, mais dans une section séparée.

---

## 2. Invariants

- `version` est **géré par le système**.
- `identity_id` est **immuable** pour une progression donnée : si l'identité change,
  une nouvelle progression vide est créée (l'ancienne reste associée à l'ancien id).
- `updated_at` est géré par le système (bump à chaque mutation).
- Les clés de `missions`/`articles`/`weekly` sont des identifiants stables.

---

## 3. Stockage

- **Clé Store** : `ns:progress`
- **Persistance** : `localStorage` via le module Store (`Store.getProgress()`,
  `Store.saveProgress()`, `Store.deleteProgress()`).
- Accès unifié par le **Progress Service** (`window.Progress`).
- Aucun module UI n'accède directement à `ns:progress`.

---

## 4. Cycle de vie

```
Progress.init()  → charge identité locale + progression (migre legacy si besoin)
Progress.get()   → objet progression courant
Progress.complete(id)   /  Progress.uncomplete(id)   → missions + weekly
Progress.markArticleRead(slug) / unmarkArticleRead(slug) → articles
Progress.save(data)  → remplace la progression (identité préservée)
Progress.reset()     → retour à l'état vide (identité préservée)
Progress.isCompleted(id)  /  Progress.isArticleRead(slug)
```

---

## 5. Migration depuis l'ancien modèle (fragmente)

Avant M2, la progression était fragmentée en clés Store séparées :

| Ancienne clé | Contenu | Migré vers |
|--------------|---------|------------|
| `ns:journey:progress` | tableau d'ids de missions | `missions` (et `weekly` pour `weekly-community`) |
| `ns:weekly:progress` | `"done"` | `weekly["weekly-community"]` |
| `ns:article:read:{slug}` | `"done"` | `articles[slug]` |

`Progress.init()` détecte ces clés, les consolide dans `ns:progress` et les supprime.
La migration est **idempotente** : ne s'exécute que si `ns:progress` n'existe pas.

---

## 6. Évolution vers la synchronisation

- `identity_id` sert de clé de liaison avec un futur backend.
- `completed_at` / `read_at` / `updated_at` permettent un merge de données
  (last-write-wins ou timestamp-based).
- `version` autorise une migration propre du schéma.
- Le **Progress Service** est le point d'échange unique : aujourd'hui → Store,
  demain → API de synchronisation, sans changer les modules UI.

---

## 7. Liens

- Service : `assets/js/progress-service.js`
- Stockage : `assets/js/store.js`
- Identité : `docs/identity-schema.md`
- Architecture : `docs/v2-architecture.md`
