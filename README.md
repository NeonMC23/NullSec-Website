# NullSec Website

[![Site Status](https://img.shields.io/badge/status-live-success)](https://neonmc23.github.io/NullSec-Website/)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

The official website for **NullSec**, a community focused on **privacy**, **cybersecurity**, **digital rights**, **Linux**, **open source**, **artificial intelligence**, **self-hosting**, and **technology**.

> 🌐 **Live site :** [https://neonmc23.github.io/NullSec-Website/](https://neonmc23.github.io/NullSec-Website/)

---

## ✨ Overview

NullSec is designed as a **professional documentation platform** — not a blog. Emphasis is on readability, a clean and elegant minimal design, and a fully static architecture.

**Inspirations :** Signal.org, Apple Security Research, Vercel, GitHub Docs, MDN Web Docs.

---

## 🏗️ Architecture

```
NullSec-Website/
│
├── index.html              # Home — hero, featured article, latest articles
├── articles.html           # Article listing with filters & sorting
├── resources.html          # Software resources organised by category
├── about.html              # Mission, values, community

│
├── articles/               # All articles (one HTML file per article)
│   ├── privacy-in-europe.html
│   ├── signal-vs-whatsapp.html
│   ├── metadata.html
│   └── ...
│
├── data/
│   └── articles.json       # Metadata only (no content)
│
├── assets/
│   ├── css/
│   │   └── style.css       # Complete design system
│   ├── js/
│   │   ├── utils.js        # Shared utility functions
│   │   ├── theme.js        # Dark/light theme management
│   │   ├── navigation.js   # Sticky nav + mobile hamburger menu
│   │   ├── search.js       # Local search with Fuse.js
│   │   ├── articles.js     # Dynamic article card loading
│   │   ├── animations.js   # Animations, progress bar, share button
│   │   └── fuse.min.js     # Fuzzy search engine (v7.0.0)
│   ├── images/             # Static SVG images
│   └── icons/              # SVG favicon
│
├── sitemap.xml
└── robots.txt
```

### ⚡ Tech Stack

| Technology | Usage |
|------------|-------|
| **HTML5** | Semantic structure |
| **CSS3** | Design system (variables, grid, flexbox) |
| **JavaScript** | Vanilla ES6 modules |
| **Fuse.js v7** | Client-side fuzzy search |

### Constraints met

- ✅ **100% static** — no backend, no database
- ✅ Works on **Cloudflare Pages** and **GitHub Pages**
- ✅ **No build step** — upload files and it works
- ✅ No React, Vue, Angular, Svelte, Node.js, PHP, or CMS

---

## 🚀 Publishing an Article (~1 minute)

1. **Create an HTML file** in `articles/`

   ```bash
   cp articles/template.html articles/my-new-article.html
   ```

   Edit the content, title, description, SEO metadata (OpenGraph, Twitter Cards, JSON-LD), and article body.

2. **Add an entry** to `data/articles.json`

   ```json
   {
     "title": "My New Article",
     "description": "A brief description of the article.",
     "category": "Privacy",
     "date": "2026-07-27",
     "readingTime": "10 min",
     "cover": "assets/images/placeholder.svg",
     "url": "articles/my-new-article.html",
     "featured": false
   }
   ```

3. **Deploy** to GitHub Pages

   ```bash
   git add .
   git commit -m "Add article: My New Article"
   git push
   ```

### What updates automatically

- ✅ The article grid on `articles.html`
- ✅ Category filters
- ✅ Sort options (newest, oldest, category)
- ✅ Home page (recent articles)
- ✅ Featured article (if `featured: true`)
- ✅ Category counters
- ✅ Search index (Fuse.js)

---

## 🎨 Design System

### Color Palette

| Role | Color (dark) | Usage |
|------|-------------|-------|
| Background | `#0B0B0F` | Main background |
| Cards | `#17171D` | Surface elements |
| Accent | `#FF4FA3` | Actions, links, highlights |
| Borders | `#2A2A35` | Separators |
| Text | `#F5F5F7` | Primary content |
| Muted | `#9CA3AF` | Secondary text |

### Typography

- **Headings:** Space Grotesk (Google Fonts)
- **Body:** Inter (Google Fonts)
- **Code:** JetBrains Mono (Google Fonts)

### Principles

- ✨ Minimal, premium, technical design
- 🎯 Generous whitespace
- 🔄 Rounded corners, subtle borders
- 🌙 Dark mode by default, light mode optional
- 📱 Responsive (mobile-first)
- ♿ Accessible (ARIA, keyboard navigation)
- 🚫 No glassmorphism or excessive gradients

---

## 🔍 Features

### Navigation
- Sticky navbar with blur effect
- Hamburger menu on mobile
- Active link highlighting

### Search
- Keyboard shortcut: `Ctrl + K`
- Fuzzy search via Fuse.js
- Searches titles, descriptions, and categories
- Real-time results

### Articles
- Reading progress bar
- Back to top button
- Share button (copies URL)
- Previous / Next article navigation
- References section at the end
- Scroll-triggered animations (intersection observer)
- Lazy-loaded images

### Theme
- Dark mode by default
- Toggle between dark and light
- Preference stored in `localStorage`
- Respects `prefers-reduced-motion`

---

## 📈 SEO

Every article includes:

- ✅ Unique, descriptive title
- ✅ Meta description
- ✅ Open Graph (Facebook, LinkedIn)
- ✅ Twitter Cards
- ✅ Canonical URL
- ✅ JSON-LD (Article schema.org)
- ✅ Semantic HTML (article, nav, header, footer)
- ✅ Alt text on images
- ✅ Complete `sitemap.xml`
- ✅ `robots.txt`

---

## 🗺️ Future Roadmap

The architecture is designed to support the following without a rewrite:

- [ ] **Category pages** — dedicated pages per topic
- [ ] **Multilingual** — EN / FR support (via `lang` attribute and separate files)
- [ ] **Interactive tools** — calculators, checkers
- [ ] **Downloads** — PDF resources, guides
- [ ] **News page** — updates and announcements
- [ ] **Tutorials** — step-by-step guides
- [ ] **RSS feeds** — for feed readers
- [ ] **Offline mode** — via Service Worker

---

## 🛠️ Local Development

```bash
# Clone the repository
git clone https://github.com/neonmc23/NullSec-Website.git

# Navigate to the project
cd NullSec-Website

# Start a local server (Python)
python3 -m http.server 8000

# Or with Node.js (http-server)
npx http-server .
```

Open `http://localhost:8000` in your browser.

> 💡 The site uses **relative paths** compatible with GitHub Pages. When running locally, serve the folder at the root of your HTTP server (`/`) and everything will work without any additional configuration.

---

## 📄 License

This project is distributed under the MIT license. See the `LICENSE` file for more information.

---

## 🤝 Contributing

Contributions are welcome! Join our [Discord](https://discord.com/invite/uTeCwQQtn) to discuss.

1. Fork the project
2. Create a branch (`git checkout -b feature/my-feature`)
3. Commit (`git commit -m 'Add feature'`)
4. Push (`git push origin feature/my-feature`)
5. Open a Pull Request

---

<div align="center">
  <strong>🌐 <a href="https://neonmc23.github.io/NullSec-Website/">View the live site</a></strong><br>
  <em>Privacy isn't optional.</em>
</div>
