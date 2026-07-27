# Nullsec Website

[![Site Status](https://img.shields.io/badge/status-live-success)](https://neonmc23.github.io/NullSec-Website/)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Le site officiel de **Nullsec**, une communauté dédiée à la **vie privée**, la **cybersécurité**, les **droits numériques**, **Linux**, l'**open source**, l'**intelligence artificielle**, le **self-hosting** et la **technologie**.

> 🌐 **Site en ligne :** [https://neonmc23.github.io/NullSec-Website/](https://neonmc23.github.io/NullSec-Website/)

---

## ✨ Aperçu

Nullsec se présente comme une **plateforme de documentation professionnelle** — pas un blog. L'accent est mis sur la lisibilité, un design minimaliste et élégant, et une architecture entièrement statique.

**Inspirations :** Signal.org, Apple Security Research, Vercel, GitHub Docs, MDN Web Docs.

---

## 🏗️ Architecture

```
NullSec-Website/
│
├── index.html              # Accueil — hero, article à la une, derniers articles
├── articles.html           # Liste des articles — filtres & tri
├── resources.html          # Ressources logicielles organisées par catégorie
├── about.html              # Mission, valeurs, communauté
├── subscribe.html          # Newsletter + invitation Discord
│
├── articles/               # Tous les articles (un fichier HTML par article)
│   ├── privacy-in-europe.html
│   ├── signal-vs-whatsapp.html
│   ├── metadata.html
│   └── ...
│
├── data/
│   └── articles.json       # Métadonnées uniquement (pas de contenu)
│
├── assets/
│   ├── css/
│   │   └── style.css       # Design system complet
│   ├── js/
│   │   ├── utils.js        # Fonctions utilitaires partagées
│   │   ├── theme.js        # Gestion du thème sombre/clair
│   │   ├── navigation.js   # Navigation sticky + menu mobile
│   │   ├── search.js       # Recherche locale avec Fuse.js
│   │   ├── articles.js     # Chargement dynamique des articles
│   │   ├── animations.js   # Animations, barre de progression, partage
│   │   └── fuse.min.js     # Moteur de recherche floue (v7.0.0)
│   ├── images/             # Images SVG statiques
│   └── icons/              # Favicon SVG
│
├── sitemap.xml
├── robots.txt
└── _redirects              # Règles de redirection Cloudflare Pages
```

### ⚡ Stack technique

| Technologie | Utilisation |
|-------------|-------------|
| **HTML5** | Structure sémantique |
| **CSS3** | Design system (variables, grid, flexbox) |
| **JavaScript** | Modules vanilla ES6 |
| **Fuse.js v7** | Recherche floue côté client |

### Contraintes respectées

- ✅ 100 % **statique** — pas de backend, pas de base de données
- ✅ Fonctionne sur **Cloudflare Pages** et **GitHub Pages**
- ✅ **Aucun build step** — on uploade les fichiers, ça marche
- ✅ Pas de React, Vue, Angular, Svelte, Node.js, PHP ou CMS

---

## 🚀 Ajouter un article (≈ 1 minute)

1. **Créer un fichier HTML** dans `articles/`

   ```bash
   cp articles/template.html articles/mon-nouvel-article.html
   ```

   Modifiez le contenu, le titre, la description, les métadonnées SEO (OpenGraph, Twitter Cards, JSON-LD) et le contenu de l'article.

2. **Ajouter une entrée** dans `data/articles.json`

   ```json
   {
     "title": "Mon Nouvel Article",
     "description": "Une brève description de l'article.",
     "category": "Privacy",
     "date": "2026-07-27",
     "readingTime": "10 min",
     "cover": "/assets/images/placeholder.svg",
     "url": "/articles/mon-nouvel-article.html",
     "featured": false
   }
   ```

3. **Déployer** sur GitHub Pages

   ```bash
   git add .
   git commit -m "Ajout article : Mon Nouvel Article"
   git push
   ```

### Ce qui se met à jour automatiquement

- ✅ La grille des articles sur `articles.html`
- ✅ Les filtres par catégorie
- ✅ Les tris (plus récent, plus ancien, catégorie)
- ✅ La page d'accueil (articles récents)
- ✅ L'article à la une (si `featured: true`)
- ✅ Les compteurs de catégories
- ✅ L'index de recherche (Fuse.js)

---

## 🎨 Design System

### Palette

| Rôle | Couleur (dark) | Usage |
|------|---------------|-------|
| Fond | `#0B0B0F` | Arrière-plan principal |
| Cartes | `#17171D` | Éléments de surface |
| Accent | `#FF4FA3` | Actions, liens, mise en avant |
| Bordures | `#2A2A35` | Séparateurs |
| Texte | `#F5F5F7` | Contenu principal |
| Secondaire | `#9CA3AF` | Texte atténué |

### Typographie

- **Titres :** Space Grotesk (Google Fonts)
- **Corps :** Inter (Google Fonts)
- **Code :** JetBrains Mono (Google Fonts)

### Principes

- ✨ Design minimal, premium, technique
- 🎯 Beaucoup d'espace blanc
- 🔄 Coins arrondis, bordures subtiles
- 🌙 Dark mode par défaut, light mode optionnel
- 📱 Responsive (mobile-first)
- ♿ Accessible (ARIA, navigation clavier)
- 🚫 Pas de glassmorphism ni de dégradés excessifs

---

## 🔍 Fonctionnalités

### Navigation
- Barre sticky avec effet de flou
- Menu hamburger sur mobile
- Lien actif mis en évidence

### Recherche
- Raccourci clavier : `Ctrl + K`
- Recherche floue via Fuse.js
- Recherche dans les titres, descriptions et catégories
- Résultats en temps réel

### Articles
- Barre de progression de lecture
- Bouton retour en haut
- Bouton de partage (copie l'URL)
- Navigation article précédent/suivant
- Références en fin d'article
- Animations au défilement (intersection observer)
- Images optimisées avec chargement paresseux

### Thème
- Dark mode par défaut
- Bascule clair/sombre
- Préférence persistée dans `localStorage`
- Respecte `prefers-reduced-motion`

---

## 📈 SEO

Chaque article inclut :

- ✅ Titre unique et pertinent
- ✅ Meta description
- ✅ Open Graph (Facebook, LinkedIn)
- ✅ Twitter Cards
- ✅ URL canonique
- ✅ JSON-LD (Article schema.org)
- ✅ HTML sémantique (article, nav, header, footer)
- ✅ Texte alternatif sur les images
- ✅ `sitemap.xml` complet
- ✅ `robots.txt`

---

## 🗺️ Roadmap / Extensions futures

L'architecture est conçue pour supporter sans réécriture :

- [ ] **Pages catégories** — pages dédiées par thématique
- [ ] **Multilingue** — EN / FR (via attribut `lang` et fichiers séparés)
- [ ] **Outils interactifs** — calculateurs, vérificateurs
- [ ] **Téléchargements** — ressources PDF, guides
- [ ] **Page News** — actualités et annonces
- [ ] **Tutoriels** — guides pas à pas
- [ ] **Fils RSS** — pour les lecteurs de flux
- [ ] **Mode hors-ligne** — via Service Worker

---

## 🛠️ Développement local

```bash
# Cloner le dépôt
git clone https://github.com/neonmc23/NullSec-Website.git

# Se déplacer dans le dossier
cd NullSec-Website

# Lancer un serveur local (Python)
python3 -m http.server 8000

# Ou avec Node.js (http-server)
npx http-server .
```

Ouvrir `http://localhost:8000` dans le navigateur.

> ⚠️ **Important :** Le site utilise une balise `<base href="/NullSec-Website/">`. En local, remplacez-la par `<base href="/">` ou supprimez-la pour que les chemins fonctionnent.  
> *Alternative :* servez le site à la racine d'un serveur local.

---

## 📄 Licence

Ce projet est distribué sous licence MIT. Voir le fichier `LICENSE` pour plus d'informations.

---

## 🤝 Contribuer

Les contributions sont les bienvenues ! Rejoignez notre [Discord](https://discord.gg/nullsec) pour discuter.

1. Forkez le projet
2. Créez une branche (`git checkout -b feature/ma-feature`)
3. Committez (`git commit -m 'Ajout feature'`)
4. Pushez (`git push origin feature/ma-feature`)
5. Ouvrez une Pull Request

---

<div align="center">
  <strong>🌐 <a href="https://neonmc23.github.io/NullSec-Website/">Voir le site en ligne</a></strong><br>
  <em>Privacy isn't optional.</em>
</div>
