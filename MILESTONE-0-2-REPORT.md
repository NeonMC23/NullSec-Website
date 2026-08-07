# Milestone 0.2 Implementation Report
### Frontend Architecture Hardening — NullSec Platform V2

> Date : 6 août 2026 · Périmètre : préparation frontend uniquement.
> Aucune fonctionnalité V2 (auth, backend, profils, dashboards, API) introduite.
> UI, UX, navigation, contenu et fonctionnalités préservés.

---

## 1. Summary

Ce milestone a durci l'architecture frontend pour préparer V2, sans changer l'apparence :

1. **Données externalisées** : les missions et outils ne sont plus embarqués dans le JS — ils vivent dans `data/missions.json` et `data/tools.json`, chargés via `fetch`.
2. **Architecture de chargement** : `journey.js` et `tools.js` chargent les données de façon asynchrone avec **fallback gracieux** en cas d'échec (message utile, aucun crash).
3. **Gestionnaires d'événements inline supprimés** : tous les `onclick` (HTML + générés dans les modals/cartes) remplacés par `addEventListener` + délégation.
4. **Sécurité de rendu renforcée** : ajout de `Utils.safeUrl()` (validation de schéma http/https) et durcissement du rendu des modals.
5. **Schémas documentés** : `docs/data-schema.md` référence les schémas missions, outils, articles et clés de persistance pour la migration backend future.

**Validation finale :** tous les fichiers JS passent `node --check` ; les 3 JSON valides ; **aucun `onclick`/`onchange`/`oninput` restant** dans le projet ; données embarquées retirées ; CSS équilibré ; fallback testé.

---

## 2. Files Created

| File | Purpose |
|------|---------|
| `data/missions.json` | 30 missions (données extraites de `journey.js`), ordre et contenu préservés. |
| `data/tools.json` | 50 outils (données extraites de `tools.js`), métadonnées préservées. |
| `docs/data-schema.md` | Schémas missions/outils/articles + clés de persistance + notes de migration V2. |

---

## 3. Files Modified

| File | Change | Reason |
|------|--------|--------|
| `assets/js/journey.js` | Réécrit : charge `data/missions.json` via fetch ; `MISSIONS` devient un tableau vide rempli à l'exécution ; suppression `onclick` (cartes via délégation `data-mission-id`, boutons modal via `data-action`) ; fallback gracieux ; API `Journey.onReady()` ajoutée. | Externaliser les données + durcir les événements |
| `assets/js/tools.js` | Réécrit : charge `data/tools.json` via fetch ; `TOOLS` vide rempli à l'exécution ; cartes via `data-tool-idx` + délégation ; `openToolModal(idx)` lit les données dans le tableau ; URL via `Utils.safeUrl()` ; fallback gracieux. | Externaliser les données + durcir les événements |
| `assets/js/modal.js` | Réécrit : le bouton fermer n'utilise plus `onclick="Modal.close()"` (bind `addEventListener`) ; `open()` retourne l'overlay pour que les appelants bindent leurs propres boutons. | Retirer les événements inline |
| `assets/js/utils.js` | Ajout de `Utils.safeUrl(url)` (http/https uniquement, sinon `#`). | Sécurité URL |
| `assets/js/articles.js` | Le toggle "in progress" (`onclick` HTML) déplacé dans le module via `setupInProgressToggle()` (`addEventListener`). | Retirer les événements inline |
| `index.html` | Weekly mission : bouton sans `onclick` (bind via listener après injection) ; attente de données via `Journey.onReady()` ; suppression de `window.toggleInviteMission`. | Retirer les événements inline + chargement async |
| `articles.html` | Bouton "in-progress toggle" : retrait de l'`onclick` inline. | Retirer les événements inline |
| `articles/*.html` (15) | Bouton "Mark as read" : retrait de l'`onclick` inline ; liaison via `addEventListener` dans le script inline existant. | Retirer les événements inline |

---

## 4. Data Migration

| Donnée | Ancien emplacement | Nouvel emplacement | Flux de chargement |
|--------|--------------------|--------------------|--------------------|
| Missions (30) | `assets/js/journey.js` (tableau `MISSIONS`) | `data/missions.json` | `journey.js` → `fetch('data/missions.json')` → `MISSIONS[]` → `renderAll()` |
| Outils (50) | `assets/js/tools.js` (tableau `TOOLS`) | `data/tools.json` | `tools.js` → `fetch('data/tools.json')` → `TOOLS[]` → `renderTools()` |
| Articles (15) | — (déjà externe) | `data/articles.json` | inchangé (`articles.js`, `search.js`, `index.html`) |

**Détails du flux :**
- **`journey.js`** : `loadMissions()` fait un `fetch` relatif, valide que la réponse est un tableau, remplit `MISSIONS`, marque le module prêt (`READY`), exécute les callbacks `onReady`, puis rend la progression + les cartes. En cas d'échec : message d'erreur dans `#progress-overview`, module prêt sans données, aucun crash.
- **`tools.js`** : `loadTools()` fait un `fetch` relatif, calcule `allCategories`, puis `init()`. En cas d'échec : message d'erreur dans `#tools-grid`.
- **`window.Journey.onReady(fn)`** : garantit que la page d'accueil ne tente de rendre la weekly mission qu'une fois `missions.json` chargé (si déjà prêt, `fn` s'exécute immédiatement).

**Fichiers relatifs** : les chemins `data/*.json` sont relatifs, donc compatibles avec le sous-répertoire GitHub Pages.

---

## 5. Event System Changes

Tous les gestionnaires inline ont été remplacés par `addEventListener` (initialisation de module / délégation d'événements).

### Gestionnaires inline supprimés
| Emplacement | Handler | Remplacé par |
|-------------|---------|--------------|
| `articles.html` | `onclick` (toggle "in progress") | `setupInProgressToggle()` dans `articles.js` |
| `articles/*.html` ×15 | `onclick="toggleArticleRead('…')"` | `addEventListener('click', …)` dans le script inline |
| `index.html` (généré) | `onclick="toggleInviteMission(this)"` | `addEventListener` sur le bouton après injection |
| `journey.js` cartes missions | `onclick="window.openMissionModal('…')"` | Délégation : écouteur sur `document`, cible `.mission-card[data-mission-id]` |
| `journey.js` modal (complete/close) | `onclick="completeFromModal()"` / `onclick="Modal.close()"` | `data-action` + `addEventListener` sur l'overlay retourné par `Modal.open()` |
| `tools.js` cartes outils | `onclick="window.openToolModal(…)"` | Délégation : écouteur sur `document`, cible `.tool-card[data-tool-idx]` |
| `tools.js` modal (close) | `onclick="Modal.close()"` | `data-action` + `addEventListener` |
| `modal.js` (bouton fermer) | `onclick="Modal.close()"` | `addEventListener` interne |

**Bénéfice sécurité** : les identifiants ne sont plus interpolés dans une chaîne d'attribut `onclick` (élimination du vecteur d'injection d'attribut). Les données passent par des attributs `data-*` ou par l'index dans le tableau.

---

## 6. Security Improvements

### Changements de rendu
- **URLs sécurisées** : `Utils.safeUrl(url)` n'autorise que `http:`/`https:` ; toute autre valeur (ex. `javascript:`, `data:`) est neutralisée en `#`. Appliqué aux liens "Visit website" des outils. Les URLs d'articles restent des chemins relatifs statiques.
- **Fin du pattern `onclick` inline avec interpolation** : les `id`/`name`/`desc`/`url` ne sont plus injectés dans des chaînes d'attributs (`data-mission-id`, `data-tool-idx`, `data-action`). Réduit le risque XSS par attribut.
- **`Utils.sanitize()`** conservé sur tous les champs texte dynamiques (titres, descriptions, catégories) dans les listes et modals missions/outils.
- **Modal.close()** rendu sûr : le bouton fermer et l'échappement sont câblés via des écouteurs, plus de code inline.

### Risques restants (déclarés, non traités ce milestone)
- `mission.guide` est inséré **brut** (`innerHTML`) dans le modal mission. **Acceptable aujourd'hui** car c'est du HTML statique de première partie issu de `missions.json`. **En V2**, dès qu'un guide peut être rédigé/utilisé par des utilisateurs, il devra passer par un sanitizer ou des blocs structurés (documenté dans `docs/data-schema.md` §6).
- `innerHTML` est toujours utilisé pour injecter des listes/modals générées (pas de framework). Les données actuelles étant statiques/trusted, le risque est faible ; à remplacer par du rendu DOM (`createElement`/`textContent`) lorsque du contenu utilisateur apparaîtra.

---

## 7. Testing Results

| Test | Méthode | Résultat |
|------|---------|----------|
| Syntaxe JS | `node --check` sur 12 fichiers `assets/js/*.js` | ✅ Tous OK |
| Syntaxe JS inline | Extraction des `<script>` inline (`index.html`, 15 articles) + `node --check` | ✅ Tous OK |
| JSON valide | `python3` parse `missions.json` (30), `tools.json` (50), `articles.json` (15) | ✅ Tous OK |
| Extraction missions | Node eval + dump : 30 missions, IDs uniques, ordre préservé, tous champs requis présents, `weekly-community` inclus | ✅ |
| Extraction outils | Node eval + dump : 50 outils, tous champs présents, 17 catégories | ✅ |
| Chargement journey | Harness Node (fetch mocké + DOM mocké) | ✅ 30 missions, 29 cartes stages + weekly, progression OK, toggle weekly OK |
| Chargement tools | Harness Node (fetch mocké + DOM mocké) | ✅ 50 cartes avec `data-tool-idx`, 18 boutons catégorie, pas d'`onclick` |
| Fallback (fetch 404) | Harness Node (fetch échoue) | ✅ Message d'erreur dans journey + tools, `Journey.isReady()` vrai, aucun crash |
| Inline handlers | `grep -rnoE "on(click\|change\|input)="` sur HTML + JS | ✅ Aucun |
| Données embarquées | `grep "var MISSIONS = \[\[\|var TOOLS = \["` | ✅ Tableaux vides (remplis par fetch) |
| CSS équilibré | Comptage `{` / `}` | ✅ `style.css` 260/260, `v2.css` 247/247 |

> Note : pas de navigateur réel dans le sandbox ; la validation d'exécution a été faite en Node avec des mocks (fetch, DOM, localStorage). La logique a été testée de bout en bout (chargement, rendu, progression, fallback).

---

## 8. Remaining Technical Debt (reporté volontairement)

- **Rendu `innerHTML`** pour les listes/modals (à remplacer par du DOM/`textContent` quand du contenu utilisateur arrivera). Les données actuelles restent statiques et sanitized.
- **`mission.guide` en HTML brut** — sécurisé tant que les données sont de première partie ; à migrer vers des blocs structurés en V2.
- **JS inline** dans `articles/*.html` (marque-lu) et `index.html` (featured + weekly) — toujours pas extrait vers des modules dédiés.
- **Consolidation des blocs CSS dupliqués** dans `v2.css` (volontairement non touché).
- **Uniformisation `var`/`const`/`let`**.
- **Tests automatisés du front** (aucun runner installé dans le sandbox).
- **Polices Google Fonts** toujours chargées en externe (à auto-héberger pour la conformité privacy-first).
- **Données d'articles** encore référencées par 3 consommateurs distincts (liste, recherche, accueil) — pourrait être unifié via un petit module de données partagé.

---

## 9. Risks

- **Chargement asynchrone** : il existe un court délai avant le premier rendu des missions/outils (fetch). Sur un réseau lent, le contenu peut apparaître après un bref instant. Le fallback empêche toute page blanche. Risque faible.
- **Page d'accueil (weekly)** : `Journey.onReady()` garantit que la weekly mission ne se rend qu'après chargement des données. Si le fetch échoue, la section weekly de l'accueil reste vide (la mission n'existe pas) — cohérent avec le fallback. Aucun crash.
- **Délégation d'événements** : `closest()` est utilisé ; supporté par tous les navigateurs modernes. Les anciens navigateurs sans `closest` ne déclencheraient pas les cartes (ligne gardée par `e.target.closest ?`), mais le reste du site fonctionne.
- **Régression visuelle** : aucun changement CSS/HTML structurel du design ; seule la mécanique d'événements et la source de données changent. L'UI reste identique.
- **Migration de données** : le contenu des missions/outils est préservé à l'identique (vérifié par comptage et présence des champs). Aucune perte.

---

*Milestone 0.2 terminé. Préparation frontend effectuée. Aucune fonctionnalité V2 introduite.*
