# Milestone 0.3 Implementation Report
### Rendering Security & JavaScript Cleanup — NullSec Platform V2

> Date : 6 août 2026 · Périmètre : durcissement du rendu + nettoyage JS.
> Aucune fonctionnalité V2 (auth, backend, profils, dashboards, API) introduite.
> UI, UX, contenu, URLs, navigation, progression et Store préservés.

---

## 1. Summary

Ce milestone a rendu le rendu **plus sûr** et éliminé les **scripts inline** avant
l'introduction de l'identité utilisateur :

1. **Rendu DOM sûr** : remplacement des `innerHTML` dynamiques (titres, descriptions,
   noms d'outils, articles, résultats de recherche, weekly mission) par
   `createElement()` / `textContent()` / `setAttribute()` / `appendChild()` via un
   helper `Utils.el`.
2. **Données brutes HTML** : le champ `mission.guide` est géré par une fonction de
   compatibilité `renderGuide()` qui accepte le format actuel (HTML fiable de
   première partie) **et** le futur modèle structuré (objet / blocs), sans casser le
   contenu existant.
3. **Scripts inline extraits** : `index.html` → `assets/js/home.js` ;
   `articles/*.html` → `assets/js/article-reader.js`. **Plus aucun script inline
   applicatif** dans le projet.
4. **Module structure documentée** : `docs/javascript-architecture.md`.
5. **Compatibilité préservée** : rendu, contenu, URLs, navigation, progression et
   Store inchangés.

**Validation finale :** 14 fichiers JS passent `node --check` ; 3 JSON valides ;
aucun script inline ; aucun gestionnaire `onclick`/`onchange`/`oninput` ; aucun lien
interne cassé ; migration Store fonctionnelle ; rendu DOM testé de bout en bout.

---

## 2. Files Created

| File | Purpose |
|------|---------|
| `assets/js/home.js` | Module accueil (extrait du script inline de `index.html`) : article vedette + weekly mission, rendu en DOM sûr. |
| `assets/js/article-reader.js` | Module pages article (extrait des scripts inline des 15 articles) : bouton "Mark as read", restauration d'état, binding d'événement. |
| `docs/javascript-architecture.md` | Référence des modules : responsabilités, dépendances, ordre d'initialisation, API partagées, politique de rendu, notes de migration V2. |

---

## 3. Files Modified

| File | Change | Reason |
|------|--------|--------|
| `assets/js/utils.js` | Ajout de `Utils.clear(el)` et `Utils.el(tag, attrs, ...children)` — constructeur d'éléments DOM sûr (`textContent` par défaut, seul `{html}` est du HTML fiable). | Rendu DOM sûr réutilisable |
| `assets/js/journey.js` | `renderMission`, modal mission, `renderAll`, `renderWeekly` réécrits en `createElement`/`textContent`/`appendChild` ; ajout de `renderGuide()` (compatibilité `guide` string/objet/blocs). | Rendu sûr + modèle de données évolutif |
| `assets/js/tools.js` | `renderTools`, `openToolModal`, `renderCategories` réécrits en DOM ; catégories et cartes via `Utils.el`. | Rendu sûr |
| `assets/js/articles.js` | `renderList`, `renderProgressList`, messages d'erreur réécrits en DOM (`Utils.clear` + `Utils.el`). | Rendu sûr |
| `assets/js/search.js` | Résultats de recherche + état vide réécrits en DOM (`Utils.clear`/`Utils.el`). | Rendu sûr |
| `assets/js/modal.js` | `open()` accepte désormais un **nœud DOM** (recommandé) ; garde la rétrocompatibilité chaîne (HTML fiable) ; bouton fermer via `textContent`. | Rendu sûr des modals |
| `index.html` | Script inline supprimé ; chargement de `home.js` après `journey.js`. | Extraction JS inline |
| `articles/*.html` (15) | Scripts inline supprimés ; chargement de `article-reader.js`. | Extraction JS inline |
| `docs/data-schema.md` | Documentation de la compatibilité `guide` (string / array de blocs / `{type,id}`). | Référence de migration V2 |

---

## 4. Rendering Security Changes

### `innerHTML` supprimé (rendu dynamique)
| Fichier | Avant | Après |
|---------|-------|-------|
| `journey.js` | cartes missions, modal, progression en `innerHTML` | `Utils.el` / `textContent` / `appendChild` |
| `tools.js` | cartes outils, modal, catégories en `innerHTML` | `Utils.el` / `textContent` |
| `articles.js` | listes d'articles en `innerHTML` | `Utils.el` / `textContent` |
| `search.js` | résultats de recherche en `innerHTML` | `Utils.el` / `textContent` |
| `home.js` (nouveau) | (existait inline) | `Utils.el` / `textContent` |

Les **champs prioritaires** (titres de missions, descriptions, noms d'outils,
descriptions d'outils, titres d'articles, catégories, résultats de recherche,
weekly mission, URLs affichées) passent désormais par `textContent`, donc **auto-échappés**.

### HTML fiable restant (intentionnel, marqué `// trusted`)
- `mission.guide` : contenu statique de première partie issu de `data/missions.json`.
  Géré par `renderGuide()` (voir ci-dessous).
- Template modal interne (`modal.js`) et `Utils.el({html})` : non exposés au contenu utilisateur.
- Icônes/static : `theme.js`, `animations.js`, `tldr.js` (SVG et caractères fixes).

### Sanitisation
- `Utils.sanitize()` conservé là où le texte reste interpolé dans du HTML statique.
- `Utils.safeUrl()` (ajouté en 0.2) appliqué aux liens externes des outils.
- `Utils.el` centralise l'échappement : toute valeur texte → `textContent`.

### Modèle `mission.guide` (compatibilité)
`renderGuide(guide)` gère trois formats sans casser l'existant :
1. **string** → rendu comme HTML fiable (format actuel).
2. **array de blocs** `[{text}]` / `[{html}]` / `[{type,id}]` → rendu par bloc.
3. **objet** `{type, id}` → ligne de référence.
En V2, on pourra adopter les blocs structurés et retirer la voie string ; le seul
point à changer est `renderGuide()`.

---

## 5. JavaScript Cleanup

### Scripts inline supprimés
| Page | Contenu extrait | Nouveau module |
|------|-----------------|----------------|
| `index.html` | featured article + weekly mission + toggle | `assets/js/home.js` |
| `articles/*.html` ×15 | `toggleArticleRead` + restauration d'état | `assets/js/article-reader.js` |

### Nouveaux modules
- **`home.js`** : charge `data/articles.json`, rend l'article vedette (avec état lu),
  rend la weekly mission via `window.Journey`, bind le toggle. S'exécute après
  `journey.js` (dépend de `Journey`).
- **`article-reader.js`** : dérive le slug de l'`id` du bouton `mark-read-{slug}`,
  restaure l'état depuis Store, bind le clic, met à jour le bouton + le statut.

### Résultat
- **Aucun `<script>` inline applicatif** dans les 22 pages (seuls restent les
  `application/ld+json` = données structurées SEO, à conserver).
- **Aucun `onclick`/`onchange`/`oninput`** dans le HTML ni le JS généré.
- Gestion d'événements : binding direct (`addEventListener`) + délégation sur
  `document` via `closest('[data-mission-id]')` / `closest('[data-tool-idx]')`.

---

## 6. Architecture Documentation

Créé : **`docs/javascript-architecture.md`** qui couvre :
- **Vue d'ensemble** : IIFE vanilla, auto-initialisation, communication via `window.*`.
- **Tableau des 14 modules** : responsabilité + dépendances.
- **Ordre d'initialisation** : l'ordre exact des `<script>` par type de page
  (racines, articles, accueil) — `store.js` en premier, `utils.js` en second.
- **API partagées** : `Store`, `Utils`, `Journey`, `Modal`, globals de délégation.
- **Politique de rendu** : textContent pour tout texte dynamique, `data-*` pour les
  ids, `safeUrl` pour les URLs, HTML fiable limité et marqué.
- **Gestion d'événements** : binding direct + délégation, aucun inline.
- **Chargement de données** : `fetch` sur les 3 JSON + fallback gracieux.
- **Persistance** : clés Store + migration.
- **Notes de migration V2** : comment passer au rendu 100 % `textContent`, remplacer
  Store par l'API V2, externaliser les données vers des endpoints avec fallback, et
  éventuellement migrer vers ES modules.

Le `docs/data-schema.md` (0.2) a été enrichi avec la section **compatibilité `guide`**.

---

## 7. Testing Results

| Test | Méthode | Résultat |
|------|---------|----------|
| Syntaxe JS | `node --check` sur les **14** fichiers `assets/js/*.js` | ✅ Tous OK |
| JSON valide | parse `missions.json` (30), `tools.json` (50), `articles.json` (15) | ✅ |
| Scripts inline | `grep "<script>"` sur 22 pages (hors `ld+json`) | ✅ Aucun |
| Inline handlers | `grep on(click/change/input)=` sur HTML + JS | ✅ Aucun |
| Liens internes | résolution de tous les `href` `.html` | ✅ Aucun cassé |
| Rendu journey (DOM) | Harness Node + DOM mock | ✅ 1 weekly + 29 stage cards (30), progression 4 enfants, aucun `innerHTML`, toggle weekly → `completed` |
| Rendu tools (DOM) | Harness Node + DOM mock | ✅ 50 cartes, 18 boutons catégorie, `openToolModal` sans crash, aucun `innerHTML` |
| Rendu home (DOM) | Harness Node + DOM mock | ✅ featured article + weekly mission en DOM, aucun `innerHTML` |
| Modal mission (guide) | Harness Node + DOM mock | ✅ guide legacy string rendu en HTML fiable |
| ArticleReader | Harness Node | ✅ toggle lu/non-lu, Store mis à jour, classe `done`, statut affiché |
| Migration Store | Harness Node (clés legacy semées) | ✅ thème, progression (weekly retiré), weekly, article migrés ; legacy supprimés |

> Note : pas de navigateur réel dans le sandbox ; l'exécution est validée en Node
> avec mocks (DOM, fetch, localStorage). La logique de rendu, de chargement et de
> persistance est testée de bout en bout.

---

## 8. Remaining Technical Debt (reporté volontairement)

- **`mission.guide` en HTML fiable** : sécurisé tant que les données sont de première
  partie. `renderGuide()` prépare la migration vers des blocs structurés, mais la
  conversion du contenu n'est pas faite (hors périmètre, risquerait de modifier le sens).
- **Rendu `innerHTML` statique** dans `theme.js`/`animations.js`/`tldr.js` (icônes et
  caractères fixes) — sans risque, non traité.
- **Consolidation des blocs CSS dupliqués** dans `v2.css` (reporté).
- **Tests automatisés** du front (aucun runner dans le sandbox).
- **Polices Google Fonts** chargées en externe (à auto-héberger pour privacy-first).
- **Convention `var`/`const`/`let`** non unifiée.
- **Données d'articles** consommées par 3 modules distincts (articles, search, home)
  — pourrait être unifié dans un petit module de données partagé à l'avenir.

---

## 9. Risks

- **Chargement asynchrone des données** : délai court avant le rendu (fetch). Le
  fallback affiche un message, pas de page blanche. Risque faible.
- **Délégation d'événements via `closest()`** : non supporté par les très vieux
  navigateurs ; le code garde `e.target.closest ?` pour éviter une erreur, mais les
  cartes ne s'ouvriraient pas. Navigateurs modernes OK.
- **`home.js` dépend de `Journey`** : chargé après `journey.js` sur `index.html`;
  `Journey.onReady()` protège contre les données pas encore prêtes. Vérifié en test.
- **`article-reader.js`** : dérive le slug de l'`id` du bouton ; si un futur bouton
  `mark-read-*` est ajouté sans span `read-status-*`, le code gère l'absence de span
  (gardé par `if (status)`). Aucun risque.
- **Régression visuelle** : le rendu DOM reproduit exactement la structure HTML
  précédente (classes conservées) ; aucun changement CSS. Vérifié par la structure
  des éléments en test.
- **Migration Store** : inchangée par rapport à 0.1/0.2, re-testée. Aucune perte.

---

*Milestone 0.3 terminé. Rendu sécurisé, JS inline éliminé, architecture documentée.
Aucune fonctionnalité V2 introduite.*
