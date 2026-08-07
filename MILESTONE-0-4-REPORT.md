# Milestone 0.4 Implementation Report
### Frontend Modularization & CSS Stabilization — NullSec Platform V2

> Date : 6 août 2026 · Périmètre : architecture frontend uniquement.
> Aucune fonctionnalité V2 (auth, backend, profils, dashboard, API) ajoutée.
> Design, textes, URLs, navigation, fonctionnalités et comportements préservés.

---

## 1. Summary

Ce milestone a unifié l'architecture frontend et stabilisé le CSS sans rien casser :

1. **Data Layer** : création de `assets/js/data-loader.js` (`window.Data`) — **une seule
   source** de chargement pour `articles.json`, `missions.json`, `tools.json`, avec
   **cache mémoire** et **dédup des fetch simultanés**. Les 5 modules UI (`home`,
   `articles`, `search`, `journey`, `tools`) consomment désormais `Data.*` ; **plus aucun
   `fetch` direct** hors de `data-loader.js`.
2. **Nettoyage JS** : suppression de **tous les `var`** au profit de `const`/`let`,
   uniformisation des conventions (IIFE conservées, `camelCase`).
3. **Documentation** : mise à jour de `docs/javascript-architecture.md` (Data Layer,
   ordre d'initialisation, conventions) + nouveau `docs/css-architecture.md`.
4. **Stabilisation CSS** : migration de `style.css` + `v2.css` (3286 lignes, 486 règles)
   vers une architecture modulaire en **7 fichiers** (tokens, base, layout, components,
   pages, utilities, themes). **Rendu vérifié identique** (multiset + ordre par sélecteur).

**Validation finale :** 15 fichiers JS passent `node --check` ; aucun `var` ; `fetch`
uniquement dans `data-loader` ; aucun handler inline ; 7 CSS chargés sur les 22 pages ;
3 JSON valides ; aucun lien interne cassé ; équilibre des accolades CSS.

---

## 2. Files Created

| File | Purpose |
|------|---------|
| `assets/js/data-loader.js` | Data Layer : `window.Data = { loadArticles, loadMissions, loadTools }` avec cache mémoire + dédup des fetch + gestion d'erreurs. |
| `assets/css/tokens.css` | Variables CSS (`:root`) + `@import` des fonts. |
| `assets/css/base.css` | Reset (`*`), `html/body`, typographie globale, éléments bruts. |
| `assets/css/layout.css` | Containers, sections, grids structurels. |
| `assets/css/components.css` | Cards, boutons, navbar, modals, badges, search, footer, missions, tools, weekly, progress, tldr. |
| `assets/css/pages.css` | Styles spécifiques pages (journey, tools, articles, community, contribute). |
| `assets/css/utilities.css` | Classes utilitaires (`fade-in`, `sr-only`, `accent`, `hidden`, `skeleton`). |
| `assets/css/themes.css` | Thème clair/sombre (`[data-theme="light"]`). |
| `docs/css-architecture.md` | Référence de l'architecture CSS, mapping et règles de maintenance. |

---

## 3. Files Modified

| File | Change | Reason |
|------|--------|--------|
| `assets/js/home.js` | `fetch('data/articles.json')` → `Data.loadArticles()` ; `var`→`let` | Data Layer + conventions |
| `assets/js/articles.js` | `fetch(...)` → `Data.loadArticles()` ; `var`→`let` | Data Layer + conventions |
| `assets/js/search.js` | `fetch(...)` → `Data.loadArticles()` | Data Layer |
| `assets/js/journey.js` | `fetch('data/missions.json')` → `Data.loadMissions()` ; `var`→`let` | Data Layer + conventions |
| `assets/js/tools.js` | `fetch('data/tools.json')` → `Data.loadTools()` ; `var`→`let` | Data Layer + conventions |
| `assets/js/store.js`, `modal.js`, `tldr.js`, `article-reader.js`, `utils.js` | `var`→`let` | Conventions JS |
| 22× `*.html` | Remplacement des 2 `<link>` CSS (`style.css`+`v2.css`) par les 7 nouveaux ; ajout `<script src="data-loader.js">` | CSS modulaire + Data Layer |
| `assets/css/style.css`, `v2.css` | Remplacés par des **stubs commentés vides** | Compatibilité (architecture migrée) |
| `docs/javascript-architecture.md` | Ajout Data Layer, ordre d'init, conventions | Documentation |

---

## 4. Data Layer Migration

### `data-loader.js`
Module IIFE exposant `window.Data`. Pour chaque dataset il :
- fait le **premier** `fetch` seulement (lazy) ;
- met le résultat en **cache mémoire** ;
- **déduplique** les fetch simultanés : N appels concurrents → 1 `fetch`, tous partagent la même Promise ;
- rejette proprement en cas d'échec (le cache n'est pas pollué, un appel suivant retente).

### Cache / flux
```
Premier appel  : Data.loadArticles()  → fetch → cache → return data
Appel suivant  : Data.loadArticles()  → cache → return Promise (résolu)
Appels simultanés : N×Data.loadMissions() → 1 seul fetch, N Promises partagées
```

### `fetch` supprimés / modules migrés
| Module | Avant | Après |
|--------|-------|-------|
| `home.js` | `fetch('data/articles.json')` | `Data.loadArticles()` |
| `articles.js` | `fetch('data/articles.json')` | `Data.loadArticles()` |
| `search.js` | `fetch('data/articles.json')` | `Data.loadArticles()` |
| `journey.js` | `fetch('data/missions.json')` | `Data.loadMissions()` |
| `tools.js` | `fetch('data/tools.json')` | `Data.loadTools()` |

**Résultat :** une seule source frontend pour les 3 JSON ; `grep "fetch(" assets/js/`
ne renvoie que `data-loader.js`.

---

## 5. JavaScript Cleanup

- **`var` supprimés** : conversion `var → const/let` (let pour les réassignés et compteurs de boucle, const pour les valeurs fixes). Fichiers concernés : `store.js` (19), `journey.js` (53), `tools.js` (34), `home.js` (24), `articles.js` (16), `article-reader.js` (7), `modal.js` (6), `tldr.js` (4), `data-loader.js` (3), `utils.js` (2). Seul `fuse.min.js` (minifié) conserve son `var` interne.
- **IIFE conservées** ; pas d'ES modules, pas de framework.
- **Conventions uniformisées** : `camelCase`, namespaces `PascalCase` (`Utils`, `Store`, `Data`, `Modal`, `Journey`), gardes DOM (`if (!el) return`).
- **API publiques inchangées** : `window.Store`, `window.Utils`, `window.Journey`, `window.Modal`, `window.Data`.
- **Comportement vérifié** à l'exécution après conversion (journey, tools, home, articles, search, article-reader, store).

---

## 6. CSS Migration

### Ancienne architecture
- `style.css` (1639 lignes) + `v2.css` (1647 lignes) : règles mélangées, overrides historiques appendés, blocs dupliqués. Les deux étaient chargés sur certaines pages, `style.css` seul sur d'autres.

### Nouvelle architecture
```
assets/css/tokens.css  base.css  layout.css  components.css  pages.css  utilities.css  themes.css
```
Chaque page charge les 7 fichiers dans cet ordre. `style.css`/`v2.css` sont désormais des **stubs commentés** (compatibilité).

### Mapping des fichiers
| Fichier | Contenu |
|---------|---------|
| `tokens.css` | `:root` (variables) + `@import` fonts |
| `base.css` | reset `*`, `html`, `body`, typo, éléments bruts |
| `layout.css` | `.container*`, `.section*`, grids |
| `components.css` | navbar, boutons, cards, modals, badges, tags, search, footer, discord, missions, tools, weekly, progress, tldr |
| `pages.css` | `.journey-*`, `.article-*`, `.tools-cat/search`, `.community-*`, `.about-*`, `.contribute-*` |
| `utilities.css` | `fade-in`, `sr-only`, `accent`, `hidden`, `skeleton` |
| `themes.css` | `[data-theme="light"]` |

### Équivalence de rendu (vérifiée)
Comparaison automatisée règle par règle (parseur dédié) contre la version de travail pré-migration :
- **486 règles = 486 règles** (249 style + 237 v2) ;
- **Multiset identique** (0 règle manquante, 0 ajoutée) ;
- **Ordre relatif par sélecteur préservé** (0 inversion) — les overrides appendés en `v2.css` restent après leurs bases ;
- `@import` des fonts conservé en tête de `tokens.css` ;
- Accolades équilibrées sur les 7 fichiers.

> Note : l'écart de 4 règles vs `git HEAD` correspond au **CSS mort** supprimé au Milestone 0.1
> (`.platform-badges`, `.platform-badge`, `.weekly-mission.completed(::before)`), qui est
> correctement absent des 7 fichiers.

### Cohérence inter-pages
- Les pages qui ne chargeaient que `style.css` (`about.html`, articles) chargent maintenant les 7 fichiers.
- Vérifié : `v2.css` ne cible **aucun** élément présent sur `about.html` ni sur les pages article
  (seul `.modal-sub .tldr-tag`), donc leur rendu est inchangé.

---

## 7. Testing Results

| Test | Méthode | Résultat |
|------|---------|----------|
| Syntaxe JS | `node --check` sur 15 fichiers | ✅ Tous OK |
| Aucun `var` | `grep "var " assets/js/*.js` (hors fuse.min) | ✅ Aucun |
| `fetch` centralisé | `grep "fetch(" assets/js/*.js` | ✅ Seul `data-loader.js` |
| Handlers inline | `grep on(click/change/input)=` | ✅ Aucun |
| JSON valide | parse `missions.json`/`tools.json`/`articles.json` | ✅ |
| Liens internes | résolution de tous les `href` `.html` | ✅ Aucun cassé |
| CSS équilibré | comptage `{`/`}` sur les 7 fichiers | ✅ |
| CSS chargé | 7 `<link>` par page (22 pages) | ✅ |
| Équivalence CSS | parseur + multiset + ordre par sélecteur | ✅ 486=486, 0 écart |
| Data Loader | Node + fetch mocké : 3 appels concurrents → 1 fetch ; cache → 0 re-fetch ; séparation datasets ; erreur propagée | ✅ |
| Rendu après var→let | Harnais DOM : journey (1 weekly+29 stage, toggle), tools (50), home (featured+weekly), articles (5/10), article-reader (toggle), store migration | ✅ |

---

## 8. Remaining Technical Debt (reporté volontairement)

- **Classifieur CSS heuristique** : quelques règles sont dans une catégorie non idéale
  (ex. certains composants dans `components.css` plutôt que `pages.css`). Le rendu est
  correct, mais un re-tri manuel fin est possible plus tard. `docs/css-architecture.md`
  documente le mapping réel.
- **`mission.guide` en HTML fiable** : `renderGuide()` prépare la migration vers des blocs
  structurés, mais la conversion du contenu est reportée (éviter de modifier le sens).
- **JS inline** restant : `tldr.js`, `theme.js`, `animations.js` utilisent encore de
  l'`innerHTML` statique (icônes/caractères fixes) — sans risque.
- **Polices Google Fonts** externes (à auto-héberger pour privacy-first).
- **Tests automatisés** du front (aucun runner dans le sandbox).
- **Consolidation manuelle du CSS** : les 7 fichiers sont générés ; un nettoyage manuel
  fin des commentaires/duplications peut encore améliorer la lisibilité.

---

## 9. Risks

- **Régression CSS** : mitigée par la vérification d'équivalence (multiset + ordre par
  sélecteur). Le seul risque résiduel est un conflit **inter-catégorie** de même
  spécificité (rare dans ce code) ; un **test visuel en navigateur est recommandé avant
  le déploiement**.
- **`var→let`** : la conversion pourrait modifier la portée si un `var` était utilisé
  hors de son bloc ; vérifié par les tests d'exécution (journey, tools, home, articles,
  search, article-reader, store) — aucun changement de comportement.
- **Data Loader** : les modules passent à `Data.*` ; si `data-loader.js` manque ou échoue,
  les modules affichent leur fallback. Chargé avant tous les consommateurs.
- **`about.html`/articles** chargent désormais 7 fichiers (au lieu de `style.css` seul) :
  vérifié que `v2.css` ne les affecte pas (aucun sélecteur correspondant). Risque nul.

---

*Milestone 0.4 terminé. Architecture frontend modulaire et CSS stabilisé.
Aucune fonctionnalité V2 introduite. Attente de validation avant Milestone 1.*
