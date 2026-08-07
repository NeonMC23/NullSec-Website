# Milestone 2 Implementation Report
### Progression Service & User Data Abstraction Layer

> Date : 6 août 2026 · Périmètre : couche d'abstraction de progression uniquement.
> Aucun profil, compte, login, inscription, backend, synchronisation ni fonctionnalité
> sociale implémenté.

---

## 1. Summary

Ce milestone introduit une **couche d'abstraction unifiée** pour toutes les données de
progression utilisateur (missions, weekly mission, articles lus), isolant la logique de
persistance des modules UI :

1. **Progress Service** (`assets/js/progress-service.js`, `window.Progress`) — gestion
   centralisée de la progression, liée à l'identité locale.
2. **Modèle de données documenté** (`docs/progress-schema.md`) — schéma versionné.
3. **Modules migrés** : `journey.js`, `article-reader.js`, `home.js` n'accèdent plus
   directement à Store pour la progression — ils passent par `Progress`.
4. **Store adapté** : `Store.getProgress()/saveProgress()/deleteProgress()` + `listKeys()`
   (réutilisent la logique existante, aucune duplication).
5. **Intégration identité** : `progress.identity_id === Identity.get().id`.
6. **Migration des données fragmentées** : les anciennes clés (`ns:journey:progress`,
   `ns:weekly:progress`, `ns:article:read:{slug}`) sont consolidées dans `ns:progress`.
7. **Ordre d'initialisation** étendu : `store → utils → data-loader → config → identity
   → user-state → progress → autres` (22 pages).
8. **Documentation** mise à jour (`javascript-architecture.md`, `v2-architecture.md`).

**Bug corrigé** : `Progress` accesseurs auto-initialisent désormais leur état (un appel
`Progress.isArticleRead()` / `complete()` avant `init()` ne plante plus).

**Validation finale :** 19 fichiers JS passent `node --check` ; aucun `var` ; aucun
handler inline ; `fetch` uniquement dans `data-loader` ; aucun envoi réseau dans les
couches fondation ; migration + cycle de vie Progress testés ; régressions OK.

---

## 2. Files Created

| File | Purpose |
|------|---------|
| `assets/js/progress-service.js` | Couche unifiée de progression : `window.Progress` avec `init/get/save/reset/isCompleted/complete/uncomplete/isArticleRead/markArticleRead/unmarkArticleRead`. |
| `docs/progress-schema.md` | Modèle de données de progression (v1) : missions, weekly, articles, invariants, migration. |

---

## 3. Files Modified

| File | Change | Reason |
|------|--------|--------|
| `assets/js/store.js` | Ajout clé `PROGRESS` (`ns:progress`) + méthodes `getProgress/saveProgress/deleteProgress` + `listKeys(prefix)` | Encapsuler la progression via Store, sans duplication |
| `assets/js/journey.js` | Remplacé l'accès Store direct (`STORAGE_KEY`, `WEEKLY_KEY`, `getProgress/saveProgress`) par `Progress.*` ; `completedCount()` basé sur `Progress.get()` | Déléguer la progression au service |
| `assets/js/article-reader.js` | Remplacé `Store.get/set/remove` (article lu) par `Progress.isArticleRead/markArticleRead/unmarkArticleRead` | Déléguer la progression au service |
| `assets/js/home.js` | Remplacé `Store.get(ARTICLE_READ)` par `Progress.isArticleRead(slug)` pour l'article vedette | Déléguer la progression au service |
| 22× `*.html` | Ajout `<script src="progress-service.js">` après `user-state.js` | Init order |
| `docs/javascript-architecture.md` | Module Progress, API, graphe de dépendances, ordre d'init, relation Store→Progress, clé `ns:progress` | Documentation |
| `docs/v2-architecture.md` | Couche Progress dans l'architecture + chaîne Identity→Progress→Future Sync | Documentation |

---

## 4. Architecture Changes

```
UI Modules (journey, article-reader, home, …)
        │
        ▼
Progress Service (progress-service.js, window.Progress)
        │
        ▼
Store (store.js) ──► localStorage (ns:progress)
        │
        ▼
Identity (identity.js) ──► identity_id
```

**Avant** : `journey.js ──► Store`, `article-reader.js ──► Store`,
`home.js ──► Store` (persistance directe, logique dispersée).

**Après** : `journey.js ──► Progress ──► Store`, etc. Les modules UI ne gèrent plus
la persistance de progression ; ils appellent `window.Progress`.

### Ordre d'initialisation (22 pages)
```
store.js → utils.js → data-loader.js → config.js → identity.js → user-state.js
        → progress-service.js → theme.js → navigation.js → fuse.min.js
        → search.js → modal.js → animations.js → [modules page]
```

`progress-service.js` est chargé après `identity.js` (il lit `Identity.id`) et avant
tout module qui consomme `Progress`.

---

## 5. Data Migration

### Ancien modèle (fragmenté, M0.1–M1)
| Clé Store | Contenu |
|-----------|---------|
| `ns:journey:progress` | tableau d'ids de missions |
| `ns:weekly:progress` | `"done"` / absent |
| `ns:article:read:{slug}` | `"done"` / absent (clés dynamiques) |

### Nouveau modèle (unifié, M2)
`ns:progress` :
```json
{
  "version": 1,
  "identity_id": "<uuid>",
  "missions": { "enable-2fa": { "completed": true, "completed_at": "..." } },
  "articles": { "signal-vs-whatsapp": { "read": true, "read_at": "..." } },
  "weekly":   { "weekly-community": { "completed": true, "completed_at": "..." } },
  "updated_at": "..."
}
```

### Migration
`Progress.init()` détecte les anciennes clés, les consolide dans `ns:progress`, puis
les supprime :
- `ns:journey:progress` → `missions` (et `weekly` si contient `weekly-community`)
- `ns:weekly:progress` → `weekly["weekly-community"]`
- `ns:article:read:{slug}` → `articles[slug]` (via `Store.listKeys`)

Idempotente : ne s'exécute que si `ns:progress` n'existe pas. Testée.

### Note
La migration legacy flat (`nullsec-theme`, `ns-journey-progress`, `ns-5-invites`,
`ns-article-{slug}`) de `Store.migrate()` reste inchangée (elle produit les clés
`ns:*` que `Progress` consolide ensuite).

---

## 6. Security Considerations

- **Aucun envoi réseau** : les couches fondation (Store, Identity, Progress,
  UserState, Config) ne contiennent **aucun** `fetch`/XHR/`sendBeacon`.
- **Aucun identifiant envoyé nulle part** : l'`identity_id` et les données de
  progression restent dans `localStorage` local.
- **Aucun token, mot de passe, analytics ou tracking** (vérifié par grep).
- **Prêt pour la sync future** : `identity_id` et timestamps fournissent la base d'un
  merge sans introduire de fuite maintenant.

---

## 7. Testing Results

| Test | Méthode | Résultat |
|------|---------|----------|
| Syntaxe JS | `node --check` sur 19 modules | ✅ Tous OK |
| Aucun `var` | grep (hors fuse.min) | ✅ |
| Aucun handler inline | grep `on(click/change/input)=` | ✅ |
| `fetch` centralisé | grep `fetch(` | ✅ Seul data-loader |
| **Progress** : initialize | init() | ✅ identité créée, version 1, missions vide |
| **Progress** : identity_id match | `Progress.get().identity_id === Identity.get().id` | ✅ |
| **Progress** : complete→isCompleted true | complete('enable-2fa') | ✅ |
| **Progress** : uncomplete→false | uncomplete() | ✅ |
| **Progress** : markArticleRead/unmark | markArticleRead/unmarkArticleRead | ✅ |
| **Progress** : save/reload | re-boot avec même localStorage | ✅ données préservées |
| **Progress** : reset→vide | reset() | ✅ missions/articles/weekly vides, identity_id préservé |
| **Progress** : auto-init sans crash | isCompleted avant init() | ✅ (fix appliqué) |
| **Migration** : fragments→unifié | seed ns:journey/weekly/article | ✅ consolidé + anciennes clés supprimées |
| **Migration** : idempotente | second init() | ✅ |
| **ArticleReader** via Progress | toggle read | ✅ Store→Progress, UI inchangée |
| **Journey** via Progress | 1 weekly + 29 stage, toggle weekly | ✅ |
| **Tools** (régression) | 50 outils | ✅ |
| **Store migration** legacy (régression) | harnais | ✅ |

> Note : aucun navigateur réel ; validation en Node avec mocks DOM/localStorage/fetch.
> Un test visuel en navigateur est recommandé avant déploiement.

---

## 8. Remaining Technical Debt (reporté volontairement)

- **`Progress` non consommé pour les statistiques** : le service centralise les données,
  mais aucun module de stats/agrégation n'existe encore.
- **Synchronisation backend** : non implémentée (Progress prêt via `identity_id`).
- **Articles lus dans `articles.js` (liste)** : le rendu de la liste lit encore l'état
  lu via le read-state pour afficher `.read` — vérifié cohérent avec Progress, mais
  l'affichage de liste n'a pas été centralisé dans un helper de lecture (dépend de la
  même source maintenant, via `Progress`).
- **Migration en double** : `Store.migrate()` (flat→ns:) + `Progress.init()`
  (ns:→unifié) sont deux étapes ; unifiables plus tard mais sans risque.
- **Polices Google Fonts** externes toujours.

---

## 9. Risks

- **Régression de progression** : le passage à `Progress` a été vérifié par tests de
  cycle de vie + reload + migration. Les compteurs de progression restent identiques
  (missions complétées + weekly). Risque faible.
- **`state` non initialisé** : corrigé par auto-init dans les accesseurs ; testé sans
  crash avant `init()`.
- **Migration des anciennes clés** : idempotente et non-destructive ; les anciennes
  clés sont supprimées après consolidation. Une sauvegarde existe dans `ns:progress`
  avant suppression.
- **Aucune fuite réseau** : confirmé — les couches fondation ne font aucun envoi.

---

## 10. Next Milestone Recommendation

La couche de progression est stable. Recommandation :

1. **Milestone 2.1 — Consommation complète** : étendre l'adoption de `Progress` aux
   éventuels derniers accès (ex. un helper de lecture partagé pour `articles.js` et
   `search.js`), sans changement de comportement.
2. **Milestone 3 — Statistiques / Insights** : agréger `Progress` (missions, weekly,
   articles lus) pour de futures statistiques locales, toujours sans backend.
3. **Milestone 4 — Synchronisation** : introduire un `SyncService` branché sur
   `Config.backendUrl`/`apiEnabled`, avec fallback offline, utilisant `Progress`
   comme source.

Il est recommandé de **commit et valider en navigateur** M2 avant de poursuivre.

---

*Milestone 2 terminé. Couche de progression unifiée, liée à l'identité locale,
prête pour la synchronisation. Aucune fonctionnalité V2 au-delà de l'abstraction.*
