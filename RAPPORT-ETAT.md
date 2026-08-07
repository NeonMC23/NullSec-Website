# Rapport d'état — Projet NullSec Website

**Date :** 6 août 2026
**Source :** récupéré depuis `https://github.com/NeonMC23/NullSec-Website` (branche `main`)
**Dernier commit :** `9a87679` — "Update README.md"
**Taille totale (hors `.git`) :** ~984 Ko
**Statut git :** arborescence propre, rien à committer

---

## 1. Vue d'ensemble

Site **100 % statique** pensé comme une *plateforme d'apprentissage interactive* (et non un simple blog). Objectif : faire apprendre, agir, et revenir régulièrement.

- Hébergé sur **GitHub Pages** → `https://neonmc23.github.io/NullSec-Website/`
- Aussi compatible **Cloudflare Pages** (fichier `_redirects` présent)
- **Aucune étape de build** : HTML/CSS/JS vanilla, on uploade et c'est en ligne
- Contenu du site en **anglais**

---

## 2. Stack technique

| Élément | Détail |
|---------|--------|
| HTML5 | structure sémantique |
| CSS3 | 2 fichiers, variables CSS, grid & flexbox |
| JavaScript | ES6 vanilla, aucune framework |
| Fuse.js v7 | recherche floue côté client |
| Persistance | `localStorage` (progression, articles lus, thème) |
| Pas de | React/Vue/Angular/Node/PHP/CMS/backend/DB |

---

## 3. Structure des fichiers

```
nullsec-website/
├── index.html        (accueil)
├── journey.html      (parcours d'apprentissage)
├── tools.html        (bibliothèque d'outils)
├── articles.html     (liste des articles)
├── community.html    (projets communautaires)
├── contribute.html   (contribution)
├── about.html        (mission / valeurs)
├── articles/         (15 pages d'articles)
├── data/articles.json
├── assets/
│   ├── css/          style.css + v2.css
│   ├── js/           11 fichiers JS
│   ├── icons/        favicons
│   └── images/       og-image, logo, couvertures d'articles
├── robots.txt
├── sitemap.xml
├── _redirects
└── README.md
```

---

## 4. Pages et contenu

| Page | Contenu |
|------|---------|
| **Home** (`index.html`) | Hero "Privacy isn't optional", section ⭐ **Start Here**, **This Week's Mission**, **Latest Article**, section Discord |
| **Journey** (`journey.html`) | Barre de progression locale, 4 stages, **weekly mission**, 30 missions |
| **Tools** (`tools.html`) | Bibliothèque de **50 outils** avec recherche, filtres par catégorie, modals |
| **Articles** (`articles.html`) | Liste verticale + section "in progress", tri |
| **Community** (`community.html`) | 4 projets open source (le 4e en pointillés "Your project here?") |
| **Contribute** (`contribute.html`) | 8 cartes de contribution |
| **About** (`about.html`) | Mission, valeurs, rejoindre |

### Articles (15)
- 10 **in-progress**, 5 **published**
- 1 **featured** (The EU AI Act)
- Catégories : Cybersecurity, Digital Rights, Privacy, AI, Self Hosting, Linux, Open Source
- Chaque article : **TL;DR**, barre de progression de lecture, bouton **Mark as read**, `JSON-LD`, bouton partager

---

## 5. Fonctionnalités transverses

| Fonction | Fichier(s) | État |
|----------|-----------|------|
| Navbar + menu mobile | `navigation.js` | ✅ |
| Recherche (Ctrl+K / bouton) | `search.js` + `fuse.min.js` | ✅ |
| Thème clair/sombre | `theme.js` | ✅ (sombre par défaut) |
| Modals (missions/outils) | `modal.js` | ✅ |
| Animations fade-in, back-to-top, partage, barre de lecture | `animations.js` | ⚠️ partiel (voir §8) |
| Navigation | cohérente sur toutes les pages racine + articles | ✅ |
| Footer | cohérent (Discord + GitHub) sur toutes les pages | ✅ |

---

## 6. Données

### Missions du parcours (`journey.js`)
- **30 missions comptées** dans la progression : 8 (S1) + 8 (S2) + 7 (S3) + 6 (S4) + **1 weekly** (stage 0)
- 6 missions "communautaires" supplémentaires en **stage 99** → **présentes dans le code mais jamais rendues** (données mortes)
- Progression stockée sous `ns-journey-progress`
- Weekly mission = "Invite 5 people to Discord" (stage 0, comptée dans le total)

### Outils (`tools.js`)
- **50 outils**, 20+ catégories, filtres + recherche

### Articles (`articles.json`)
- 15 entrées, toutes **liées à un fichier existant** ✅ (vérifié : aucune rupture)

---

## 7. Liens externes (footer / navigation)

- **Discord** : `https://discord.com/invite/uTeCwQQtn` — présent sur toutes les pages ✅
- **GitHub communauté** : `https://github.com/NullSec-Community` — présent dans tous les footers ✅
- **Repo site** : `https://github.com/NeonMC23/NullSec-Website`

---

## 8. Points d'attention / incohérences détectées

> Aucun bug bloquant : les JS passent `node --check`, aucun lien interne cassé. Points ci-dessous = améliorations / incohérences mineures.

### 8.1 — Incohérence "Weekly Mission" Home ↔ Journey
- **Home** (`index.html`) : clé localStorage `ns-5-invites`, bouton `toggleInviteMission`, mission câblée en dur dans le JS inline.
- **Journey** (`journey.js`) : mission `weekly-community` (stage 0), clé `ns-journey-progress`.
- ➡️ **Les deux ne sont PAS synchronisés** : cocher la mission sur l'accueil ne se reflète pas sur la page Journey et inversement. C'est le point le plus visible à harmoniser.

### 8.2 — 6 missions stage 99 mortes
`journey.js` contient `cm-invite-friend`, `cm-talk-family`, `cm-fix-typo`, `cm-review-docs`, `cm-share-social`, `cm-help-beginner` (stage 99). Elles ne sont **jamais affichées** mais restent dans le tableau `MISSIONS`. À retirer si on veut du code propre.

### 8.3 — Double attribut `class=` sur les boutons "Mark as read" (15 articles)
Chaque article a un bouton avec **deux attributs `class`** :
```html
<button class="btn btn-secondary" id="mark-read-…" class="btn btn-secondary btn-read" …>
```
HTML invalide (le 2e `class` est ignoré). Le JS rétablit la classe correcte au chargement, donc l'impact est cosmétique, mais à corriger pour un HTML valide.

### 8.4 — `sitemap.xml` référence `projects.html` (fichier supprimé)
La page a été fusionnée dans `community.html`, mais le sitemap pointe encore vers `projects.html` qui **n'existe plus**. À nettoyer.

### 8.5 — CSS `v2.css` très long avec blocs dupliqués
Le fichier (1647 lignes) a été enrichi par **ajout successif** : on retrouve plusieurs définitions répétées de `.article-list-item`, `.tool-card`, `.mission-card`, `.weekly-mission`, `.modal`, etc. Les dernières règles écrasent les premières, donc rien de cassé, mais le fichier est difficile à maintenir.

### 8.6 — CSS "mort" résiduel
- Bloc `.weekly-mission.completed::before` (rond vert "✓") alors que la weekly mission s'affiche désormais en **carte normale** via `renderMission()`.
- Blocs `.mission-card .platform-badges` / `.platform-badge` alors que les badges mobile/PC ont été retirés des cartes.
- `stageStr` calculé dans `renderMission()` mais **jamais utilisé**.

### 8.7 — Bouton back-to-top absent des pages racines
`animations.js` gère `#back-to-top`, et les **articles** en ont un, mais **aucune page racine** ne l'a. Incohérence mineure d'expérience.

### 8.8 — `README.md` cite "29 missions"
Le README annonce "29 interactive missions" alors qu'il y en a **30** comptées (8+8+7+6+1). À ajuster.

---

## 9. Validations effectuées

- ✅ `node --check assets/js/*.js` → **tous les fichiers JS valides** (syntaxe)
- ✅ Aucun **lien interne cassé** (tous les `href` `.html` résolvent vers un fichier existant)
- ✅ Chaque entrée `articles.json` correspond à un fichier `articles/*.html` existant
- ✅ Aucun fichier d'article orphelin
- ✅ Navigation & footer cohérents sur les 7 pages racine + 15 articles
- ✅ Liens Discord/GitHub présents partout
- ✅ `data-theme="dark"` cohérent sur toutes les 22 pages

---

## 10. Déploiement

- Remote `origin` → `https://github.com/NeonMC23/NullSec-Website.git`
- Branche `main`, synchrone avec `origin/main`
- Déploiement : pousser sur `main` → GitHub Pages publie sur `neonmc23.github.io/NullSec-Website/`
