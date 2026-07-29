# NullSec Website

[![Site Status](https://img.shields.io/badge/status-live-success)](https://neonmc23.github.io/NullSec-Website/)

The official website for **NullSec**, a community focused on privacy, cybersecurity, digital rights, Linux, open source, artificial intelligence, self-hosting, and technology.

> 🌐 **Live site:** [https://neonmc23.github.io/NullSec-Website/](https://neonmc23.github.io/NullSec-Website/)

---

## Pages

| Page | Description |
|------|-------------|
| **Home** | Hero, Start Here cards, Weekly Mission, Latest Article |
| **Learning Journey** | 29 interactive missions across 4 stages + weekly community mission. Progress saved locally. |
| **Tools Library** | 50+ curated privacy tools with search, category filters, and detail modals. |
| **Articles** | In-depth research on privacy, cybersecurity, and digital rights. |
| **Community Projects** | Open source projects built by the NullSec community. |
| **Contribute** | Ways to help: writing, translation, programming, design, testing, research. |
| **About** | Mission, values, and community information. |

---

## Tech Stack

- **HTML5** — Semantic structure
- **CSS3** — Design system (CSS variables, grid, flexbox)
- **JavaScript** — Vanilla ES6 (no frameworks)
- **Fuse.js v7** — Client-side fuzzy search

### Constraints

- ✅ 100% static — no backend, no database
- ✅ Works on **GitHub Pages** and **Cloudflare Pages**
- ✅ **No build step** — upload files and it works
- ✅ No React, Vue, Angular, Svelte, Node.js, PHP, or CMS

---

## Adding an Article (~1 minute)

1. **Create an HTML file** in `articles/`
2. **Add an entry** to `data/articles.json`
3. **Deploy** to GitHub Pages

Everything else updates automatically: article list, filters, search index, home page featured section, and category counts.

---

## Local Development

```bash
git clone https://github.com/NeonMC23/NullSec-Website.git
cd NullSec-Website
python3 -m http.server 8000
# Open http://localhost:8000
```

The site uses relative paths compatible with GitHub Pages subdirectory hosting.

---

## License

MIT
