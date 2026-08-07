# NullSec V2 Audit Report

> **Audit technique — Milestone 0 : Compréhension & Stabilisation**
> Date : 6 août 2026 · Auteur : Senior Software Architect
> Dépôt : `https://github.com/NeonMC23/NullSec-Website` · Branche `main` · Commit `9a87679`
> Périmètre : analyse uniquement. **Aucune modification effectuée.**

---

## 1. Executive Summary

NullSec est actuellement un **site statique à 100 %** (HTML/CSS/JS vanilla, sans backend, sans build), publié sur GitHub Pages. Il s'agit d'une **plateforme d'apprentissage** pensée pour : apprendre → agir → revenir.

**L'état général est sain et productif :**
- ✅ Aucun bug bloquant : tous les fichiers JS passent `node --check`.
- ✅ Aucun lien interne cassé ; chaque entrée de `data/articles.json` correspond à un fichier réel.
- ✅ Navigation et footer cohérents sur les 22 pages (7 racines + 15 articles).
- ✅ Aucun secret exposé, aucun token, aucune clé API.
- ✅ Aucune dépendance runtime par CDN (Fuse.js est bundle en local) — seule dépendance externe : **Google Fonts**.

**Les risques principaux avant V2** ne sont pas fonctionnels mais **architecturaux** :
1. **Duplication du concept « Weekly Mission »** en deux implémentations séparées (accueil vs journey) avec **deux clés localStorage distinctes** → désynchronisation réelle.
2. **Persistance 100 % client (localStorage)** sans couche d'abstraction → incompatible avec les futures identités anonymes / comptes / backend.
3. **Fichier CSS `v2.css` fortement dupliqué** (blocs répétés, CSS mort) → dette technique de maintenance.
4. **Injection dynamique HTML via `innerHTML`** (modals, listes) : sûr aujourd'hui car données statiques/trustées, mais **fragile** dès qu'on introduira du contenu utilisateur.

**Recommandation stratégique :** ne rien réécrire. Stabiliser (retirer le code mort, harmoniser les clés de stockage, consolider le CSS), **introduire une couche de persistance unique et abstraite**, et préparer les données pour un backend privacy-first. Détails sections 4, 6, 10.

---

## 2. Current Architecture

### 2.1 Stack
| Couche | Technologie |
|--------|-------------|
| Markup | HTML5 sémantique, aucune framework |
| Styles | CSS3 (variables, grid, flexbox) — 2 fichiers |
| Scripts | JavaScript ES6 vanilla, pattern **IIFE**, aucun bundler |
| Recherche | Fuse.js v7 (fichier local `fuse.min.js`) |
| Persistance | `localStorage` (progression, articles lus, thème) |
| Hébergement | GitHub Pages (`neonmc23.github.io/NullSec-Website`) + compatible Cloudflare Pages |
| Backend / DB / Auth | **Aucun** |

### 2.2 Points d'entrée
Chaque page HTML est un **point d'entrée autonome** complet (nav, footer, search-overlay, scripts). Les modules JS s'**auto-initialisent** via `DOMContentLoaded` (ou exécution immédiate si déjà prêt). Il n'y a **pas de routeur** ni d'application unique — chaque page charge l'ensemble des scripts puis initialise les modules pertinents.

### 2.3 Pages
| Fichier | Rôle | Données dynamiques |
|---------|------|--------------------|
| `index.html` | Accueil (Hero, Start Here, Weekly Mission, Latest Article, Discord) | `articles.json`, JS inline |
| `journey.html` | Parcours d'apprentissage | `journey.js` (tableau missions en dur) |
| `tools.html` | Bibliothèque d'outils | `tools.js` (tableau outils en dur) |
| `articles.html` | Liste des articles + tri + "in progress" | `articles.json` |
| `community.html` | Projets communautaires | statique |
| `contribute.html` | Contribution | statique |
| `about.html` | Mission / valeurs | statique |
| `articles/*.html` (15) | Articles longs | statiques + JS inline (mark-as-read) |

### 2.4 CSS Architecture
- **`style.css`** (1639 lignes) : design system, reset, utilitaires, composants de base, thème clair, responsive, print.
- **`v2.css`** (1647 lignes) : composants V2 (cards missions, tools, weekly mission, articles list, contribute, community, modals) + **nombreuses règles d'ajustement appendées au fil du temps**.
- Les **deux fichiers sont chargés sur chaque page** (ordre : `style.css` puis `v2.css`).

### 2.5 JavaScript Architecture
11 modules, tous en IIFE avec `'use strict'`, communiquant via **globales `window.*`** et un namespace `Utils` :

| Module | Rôle | Interop |
|--------|------|---------|
| `utils.js` | Helpers (`debounce`, `sanitize`, `formatDate`, thème) | `window.Utils` |
| `theme.js` | Thème clair/sombre, clé `nullsec-theme` | autonome |
| `navigation.js` | Menu mobile, highlight lien actif | autonome |
| `search.js` | Recherche globale (Fuse) | `window.Fuse`, `Utils` |
| `modal.js` | Système de modals overlay | `window.Modal` |
| `journey.js` | Missions, progression, modals missions | `window.Modal`, `Utils`, `window.openMissionModal`, `window.completeFromModal` |
| `tools.js` | Bibliothèque d'outils, filtres, modals | `window.Modal`, `Utils`, `window.openToolModal` |
| `articles.js` | Liste des articles + tri + état lu | `Utils`, `fetch` |
| `animations.js` | Fade-in, barre de lecture, back-to-top, partage | `Utils` |
| `tldr.js` | Blocs TL;DR expansibles | autonome |
| `fuse.min.js` | Lib Fuse (bundle local) | `window.Fuse` |

### 2.6 Design System
- **Tokens** dans `:root` de `style.css` : couleurs (`--bg`, `--accent #FF4FA3`, `--success #34D399`, `--text-*`), rayons (`--radius` 8/12/16), ombres, largeurs (`--max-width 1200px`, `--article-width 800px`), polices (`Space Grotesk` titres, `Inter` corps, `JetBrains Mono` code).
- **Thème** : sombre par défaut (`data-theme="dark"`) + `[data-theme="light"]` redéfinit les tokens.
- **Responsive** : breakpoints `1024px`, `768px`, `480px` + bloc `@media print`. Navbar → hamburger sous 768px.
- **Polices** importées via `@import` Google Fonts dans `style.css`.

### 2.7 Reusable elements / components (par convention, pas de framework)
- `btn`, `btn-primary`, `btn-secondary`, `btn-discord-nav`
- `.container`, `.container-narrow`, `.section`, `.section-header`
- `.card`, `.mission-card`, `.tool-card`, `.article-list-item`, `.project-card`, `.contribute-card`
- `.badge`, `.tldr-tag`, `.meta-tag`, `.impact-dot`, `.stars`
- `.fade-in` / `.fade-in-delay-1/2/3` (animations)
- `.modal-overlay` / `.modal` (système modal)
- `.search-overlay` / `.search-modal` / `.search-result-item`

---

## 3. Existing Features Inventory

| # | Feature | Location | Status | V2 Compatibility |
|---|---------|----------|--------|------------------|
| 1 | **Hero accueil** | `index.html` | ✅ | Conservable tel quel |
| 2 | **Start Here cards** | `index.html` (+ CSS `v2.css` §6) | ✅ | Sera branché sur les journeys |
| 3 | **Weekly Mission (accueil)** | `index.html` JS inline, clé `ns-5-invites` | ⚠️ Dupliqué | **À unifier** avec journey |
| 4 | **Weekly Mission (journey)** | `journey.js` (`weekly-community`, stage 0) + `journey.html#weekly-mission-grid` | ⚠️ | **À unifier** (voir #3) |
| 5 | **Learning Journey — 30 missions / 4 stages** | `journey.js` + `journey.html` | ✅ | **Noyau de V2**, à connecter aux stats |
| 6 | **Progression locale missions** | `journey.js` (`ns-journey-progress`) | ✅ | Devra migrer vers backend |
| 7 | **Modals missions** | `journey.js` (`openMissionModal`, `completeFromModal`) + `modal.js` | ✅ | Réutilisable |
| 8 | **Tools Library — 50 outils** | `tools.js` + `tools.html` | ✅ | Réutilisable, données vers API |
| 9 | **Filtres + recherche outils** | `tools.js` (`renderCategories`, `filterAndRender`) | ✅ | Réutilisable |
| 10 | **Modals outils** | `tools.js` (`openToolModal`) | ✅ | Réutilisable |
| 11 | **Liste articles + tri** | `articles.js` + `articles.html` (`sort-select`) | ✅ | Guide connecté aux actions |
| 12 | **Section "Articles in progress"** | `articles.html` + `articles.js` | ✅ | Conservable |
| 13 | **Mark as read (articles)** | `articles/*.html` (JS inline) + `articles.js` (état dans listes) + `index.html` (featured) | ⚠️ HTML invalide | Migrer vers couche persistance |
| 14 | **TL;DR expansible** | `tldr.js` + balises `.tldr` | ✅ | Conservable |
| 15 | **Barre de progression lecture** | `animations.js` (`#reading-progress`) | ✅ | Conservable |
| 16 | **Back-to-top** | `animations.js` (`#back-to-top`) — articles seulement | ⚠️ | Ajouter aux pages racines |
| 17 | **Bouton partager** | `animations.js` (`#share-btn`) | ✅ | Conservable |
| 18 | **Recherche globale (Ctrl+K)** | `search.js` + `fuse.min.js` + `.search-overlay` | ✅ | Index → moteur V2 |
| 19 | **Thème clair/sombre** | `theme.js` (`nullsec-theme`) | ✅ | Conservable |
| 20 | **Navigation + menu mobile** | `navigation.js` | ✅ | Conservable |
| 21 | **Community projects** | `community.html` (statique, 4 cartes) | ✅ | Devenir base de projets / campaigns |
| 22 | **Contribute** | `contribute.html` (8 cartes) | ✅ | Conservable |
| 23 | **About / valeurs** | `about.html` | ✅ | Conservable |
| 24 | **JSON-LD / SEO** | articles + balises meta/og/canonical | ✅ | À maintenir |
| 25 | **SEO files** | `robots.txt`, `sitemap.xml`, `_redirects` | ⚠️ `projects.html` mort | À corriger |

---

## 4. Technical Debt

### 4.1 Duplication
| Dette | Lieu | Impact |
|-------|------|--------|
| **Weekly Mission dupliquée** (accueil vs journey) | `index.html` inline + `journey.js` | Deux implémentations, deux clés storage, **désynchronisation réelle** |
| **Blocs CSS répétés** | `v2.css` : `.article-list-item` ×22, `.modal` ×16, `.tool-card` ×15, `.weekly-mission` ×14, `.mission-card` ×9 | Maintenance difficile, risques de conflits |
| **Clés de persistance incohérentes** | `ns-5-invites`, `ns-article-{slug}`, `ns-journey-progress`, `nullsec-theme` | Aucun schéma unique → migration V2 complexe |
| **Logique de thème dupliquée** | `theme.js` + `utils.js` (`getTheme`/`setTheme`/`currentPath` pas utilisés) | API parallèles |

### 4.2 Code mort / inutilisé
| Élément | Lieu |
|---------|------|
| **6 missions "communautaires" stage 99** (`cm-invite-friend`, `cm-talk-family`, `cm-fix-typo`, `cm-review-docs`, `cm-share-social`, `cm-help-beginner`) | `journey.js` (jamais rendues, mais comptées nulle part — mort) |
| Variable `communityTotal` | `journey.js` `renderAll()` (calculée, jamais affichée) |
| Variable `stageStr` | `journey.js` `renderMission()` (calculée, jamais affichée) |
| CSS `.weekly-mission.completed::before` (rond vert "✓") | `v2.css` (weekly mission s'affiche désormais en carte normale) |
| CSS `.mission-card .platform-badges` / `.platform-badge` | `v2.css` (badges mobile/PC retirés des cartes) |
| Référence `projects.html` | `sitemap.xml` (page supprimée, fusionnée dans `community.html`) |
| README "29 missions" | `README.md` (il y en a **30**) |

### 4.3 HTML invalide / inconsistances
- **Double attribut `class=`** sur le bouton "Mark as read" des **15 articles** (`class="btn btn-secondary" ... class="btn btn-secondary btn-read"`). Impact cosmétique (le 2e est ignoré), mais HTML invalide.
- **JS inline éparpillé** dans `index.html`, `articles.html`, `articles/*.html` (logique hors des modules) → casse l'unicité de la couche JS.
- **Fonction globale non cloisonnée** : `window.toggleJourneyWeekly` est défini **hors de l'IIFE** de `journey.js` (ligne 604) et semble obsolète (la weekly mission passe par `renderMission()`/modal).

### 4.4 Naming
- Mélange de conventions : `var` vs `const`/`let`, camelCase majoritaire mais quelques noms mixtes ; `STORAGE_KEY` en var dans `journey.js`, en const dans `theme.js`.

---

## 5. Security Findings

> Rapport seulement — **aucune correction faite**. Niveau global : **faible risque**, mais à surveiller pour V2.

### 5.1 Secrets exposés
- ✅ **Aucun** secret, token, clé API, credential trouvé dans le code, les pages ou le JS.
- ✅ Aucun fichier `.env` committé.
- ✅ `.gitignore` présent (vide, mais aucun fichier sensible suivi).

### 5.2 Stockage client
- **`localStorage`** utilisé pour : progression missions, articles lus, thème, mission hebdo.
- **Verdict : acceptable** pour l'état actuel (aucune donnée sensible/PII).
- **Risque V2 :** si l'on stocke un jour identité, points, données personnelles → **insuffisant** (localStorage n'est pas isolé entre utilisateurs, pas chiffré, partagé par origine). À remplacer par couche serveur privacy-first.

### 5.3 XSS / Injection (principal point d'attention)
- Le rendu dynamique passe par **`innerHTML`** avec interpolation de chaînes :
  - `articles.js`, `journey.js` (renderMission), `tools.js` (renderTools, openToolModal), `index.html` (featured + weekly), `modal.js`.
- **Atténuant :** la plupart des textes passent par `Utils.sanitize()` (15 usages). Les **données sont statiques et trusted** (tableaux en dur, `articles.json`).
- **Vulnérabilités latentes (faible risque aujourd'hui, élevé demain) :**
  - `mission.guide` inséré **brut** dans `Modal.open` (pas de sanitize) — sûr tant que les missions sont en dur, dangereux si contenu utilisateur.
  - `tools.js` construit un `onclick` avec interpolation de `name`/`desc`/`url` (échappement partiel des apostrophes). Un nom d'outil contenant `"` ou `</script>` casserait/exploiterait la sortie.
  - `search.js` rend des liens avec `Utils.sanitize` — OK.
  - Les URLs de produits sont injectées dans `href` sans validation de schéma (un `javascript:` serait possible si les données devenaient modifiables).
- **Recommandation :** introduire un **rendu via `textContent`/`createElement`** (ou une lib d'échappement robuste) et **ne jamais injecter de `onclick` inline** — utiliser l'écouteur d'événements + `dataset`.

### 5.4 Dépendances
- `fuse.min.js` **bundle local** (pas de CDN runtime) → bonne pratique, pas de supply-chain runtime.
- **Google Fonts** chargé via `@import` + `preconnect` → **fuite d'IP vers Google** à chaque chargement, en contradiction avec l'éthique "privacy-first" du projet. À auto-héberger à terme.
- Aucune autre dépendance runtime.

### 5.5 Vie privée
- **Aucun analytics / tracker / cookie tiers** détecté. ✅
- Requêtes sortantes : Google Fonts + liens externes utilisateur (Discord, GitHub, sites d'outils).
- Pas de collecte de données côté serveur (pas de serveur).

### 5.6 Divers
- Paramètres d'URL (`?category=`) lus et utilisés sur `tools.html` — sans danger aujourd'hui (comparé à des catégories statiques).
- `_redirects` sémantiquement peu utile sur GitHub Pages (plutôt Cloudflare), mais sans risque.

---

## 6. Recommended Cleanup Tasks

> Par priorité. Aucune tâche ne change la direction produit.

### 🔴 Critical
| Tâche | Pourquoi |
|-------|----------|
| **Unifier la Weekly Mission** (une seule source de vérité `weekly-community`, même clé storage partout) | Désynchronisation réelle entre accueil et journey ; bloque les stats V2 |
| **Introduire une couche de persistance abstraite** (module `store.js` enveloppant localStorage, clés typées : `ns:journey:progress`, `ns:article:read:{slug}`, etc.) | Prérequis à toute migration V2 / backend |

### 🟠 High
| Tâche | Pourquoi |
|-------|----------|
| **Corriger le double attribut `class=`** sur les 15 boutons "Mark as read" | HTML invalide |
| **Retirer le code mort JS** : 6 missions stage 99, `communityTotal`, `stageStr`, `toggleJourneyWeekly` obsolète | Nettoyage, moins de confusion |
| **Retirer le CSS mort** : `.weekly-mission.completed::before`, `.platform-badges`/`.platform-badge`, `.mission-card .platform-*` | Nettoyage |
| **Corriger `sitemap.xml`** (supprimer/rediriger `projects.html`), ajuster README ("30 missions") | Exactitude |
| **Extraire les JS inline** de `index.html`, `articles.html`, `articles/*.html` vers les modules | Couche JS unique, maintenable |

### 🟡 Medium
| Tâche | Pourquoi |
|-------|----------|
| **Consolider les blocs CSS dupliqués** de `v2.css` (apporter les règles finales en dernier, supprimer les occurrences antérieures) | Réduit la dette, supprime les conflits |
| **Uniformiser les helpers thème** (n'utiliser que `theme.js`, retirer les doublons dans `utils.js`) | API unique |
| **Ajouter back-to-top aux pages racines** | Cohérence UX |

### 🟢 Low
| Tâche | Pourquoi |
|-------|----------|
| **Uniformiser `var`/`const`/`let`** et conventions de nommage | Lisibilité |
| **Ajouter `favicon.ico`/`apple-touch` cohérents** et vérifier `og-image` sur les 22 pages | SEO/social |
| **Auto-héberger les polices** (retirer Google Fonts) | Privacy-first + indépendance |
| **Revoir `_redirects`** selon l'hébergeur cible | Clarté |

---

## 7. Proposed Future Architecture

> Haute niveau uniquement. **Pas d'implémentation.**

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend statique                        │
│  (aucune framework obligatoire — conserver vanilla ou       │
│   passer à un module bundleur léger SI nécessaire)          │
├─────────────────────────────────────────────────────────────┤
│  Pages      → index, journey, tools, articles, community,  │
│               contribute, about + articles/*                │
│  Composants → cards, modals, progress bars, stats, lists    │
│  Store      → couche d'abstraction persistance (aujourd'hui │
│               localStorage, demain API)                     │
│  Modules    → IIFE par domaine, interop via window.* /      │
│               import maps                                  │
└─────────────────────────────────────────────────────────────┘
                            │  fetch/JSON (CORS, no-cookie, anonyme)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                 Backend Privacy-First (V2)                  │
│  · Identité anonyme (aucune donnée PII requise)             │
│  · Journeys / missions / progression server-side            │
│  · Community goals & campaigns                              │
│  · Guides connectés aux actions                             │
│  · Statistiques agrégées (k-anonymat, bruit)                │
│  · API REST ou RPC, tokens courts, stockage chiffré         │
└─────────────────────────────────────────────────────────────┘
```

**Principes :**
- Le **frontend actuel devient la "couche présentation"** réutilisée par V2.
- On **substitue la persistance** (localStorage → API) via la couche `store`, sans toucher à l'UI.
- Les **données statiques** (`articles.json`, missions, outils) migrent vers l'API mais gardent un **fallback statique** (résilience).
- Aucun framework imposé : rester vanilla tant que le volume le permet.

---

## 8. Files To Modify In Future

| Priorité | Fichiers | Changement attendu |
|----------|----------|--------------------|
| Critical | `assets/js/journey.js`, `index.html`, `assets/js/articles.js` | Unifier weekly mission + introduire `store.js` |
| High | 15× `articles/*.html` | Corriger double `class`, extraire JS inline |
| High | `assets/js/journey.js` | Supprimer missions 99 + variables mortes |
| High | `assets/css/v2.css` | Consolider blocs dupliqués, retirer CSS mort |
| High | `sitemap.xml`, `README.md` | Corriger `projects.html`, compte missions |
| Medium | `index.html`, `articles.html`, `articles/*.html` | Extraire les JS inline vers modules |
| Medium | `assets/js/utils.js` | Retirer les helpers thème dupliqués |
| Medium | 7× pages racines | Ajouter back-to-top |
| Future | **Nouveau** `assets/js/store.js` | Couche de persistance abstraite |
| Future | **Nouveau** `data/missions.json`, `data/tools.json` | Données sorties du JS → consommables par API |

---

## 9. Files To Preserve

> Ne pas modifier la direction produit, ni l'apparence, ni le contenu.

| Type | Éléments |
|------|----------|
| **Design system** | `assets/css/style.css` (tokens, reset, thème, responsive, print) |
| **Contenu** | Tous les `articles/*.html`, `about.html`, `community.html`, `contribute.html`, `data/articles.json` |
| **Données missions** | Le tableau `MISSIONS` (stages 1-4, 29 missions) — à migrer mais pas à réécrire |
| **Données outils** | Le tableau `TOOLS` (50 outils) |
| **Fonctionnalités stables** | `theme.js`, `navigation.js`, `search.js` + `fuse.min.js`, `modal.js`, `animations.js`, `tldr.js` |
| **Identité visuelle** | `assets/images/`, `assets/icons/`, palette, polices |
| **SEO** | `robots.txt`, meta/og/canonical, `articles.json` (schéma) |
| **Liens communautaires** | Discord `uTeCwQQtn`, GitHub `NullSec-Community` |

---

## 10. Risks Before Starting V2

### 🟠 Risques fonctionnels
1. **Désynchronisation Weekly Mission** — si on branche des stats V2 sur la progression sans unifier d'abord, les données seront incohérentes entre l'accueil et le journey.
2. **Migration de `localStorage`** — perdre la progression des utilisateurs existants si la couche `store` n'est pas rétro-compatible (lire les anciennes clés, puis migrer).
3. **`v2.css` dupliqué** — toute refonte CSS risque d'entrer en conflit avec des blocs résiduels ; il faut consolider **avant** d'ajouter de nouveaux composants.

### 🟠 Risques sécurité
4. **XSS via `innerHTML`** — dès que le contenu devient utilisateur (commentaires, guides soumis, usernames anonymes), le pattern actuel devient vulnérable. Doit être corrigé **avant** d'introduire l'identité anonyme et la contribution.
5. **URLs externes non validées** — les liens outils/produits doivent passer par un allowlist/validateur de schéma avant d'accepter du contenu tiers.

### 🟡 Risques architecturaux
6. **JS inline dispersé** — la logique hors modules rendra le passage à l'API plus difficile et les tests impossibles.
7. **Données dans le JS** (missions, outils) — à externaliser en JSON/API pour pouvoir évoluer sans toucher le code.
8. **Pas de tests** — aucun test automatisé ; recommander d'ajouter des tests de contrat sur `store.js` et les parsers JSON avant V2.
9. **Google Fonts** — dépendance externe à retirer pour la conformité "privacy-first" revendiquée.

### 🟢 Risques produits
10. **Risque de "réécrire au lieu d'itérer"** — le site est déjà fonctionnel et bien perçu ; V2 doit **étendre** la couche données/identité sans casser l'UX ni l'apparence actuelles.

---

*Fin du rapport — Milestone 0. Prêt pour la phase de stabilisation (tâches §6) avant d'attaquer le développement V2.*
