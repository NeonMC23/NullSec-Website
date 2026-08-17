# NullSec Website

[![Site Status](https://img.shields.io/badge/status-live-success)](https://neonmc23.github.io/NullSec-Website/)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

The official website for **NullSec**, a community focused on privacy, cybersecurity, digital rights, Linux, open source, artificial intelligence, self-hosting, and technology.

> 🌐 **Live site:** [https://neonmc23.github.io/NullSec-Website/](https://neonmc23.github.io/NullSec-Website/)

---

## Pages

| Page | Description |
|------|-------------|
| **Home** | Hero, Start Here cards, Weekly Mission, Latest Article |
| **Learning Journey** | 30 missions organized as Campaigns (4 progressive Campaigns + 1 weekly community mission). Progression is server-backed and synced across devices. |
| **Tools Library** | 50+ curated privacy tools with search, category filters, and detail modals. |
| **Articles** | In-depth research on privacy, cybersecurity, and digital rights. |
| **Community** | Aggregated, anonymous community statistics (no user directory, no social features). |
| **Contribute** | Ways to help: writing, translation, programming, design, testing, research. |
| **About** | Mission, values, and community information. |

---

## Tech Stack

- **HTML5** — Semantic structure
- **CSS3** — Design system (CSS variables, grid, flexbox)
- **JavaScript** — Vanilla ES6 (no frameworks)
- **Fuse.js v7** — Client-side fuzzy search

### Constraints

- ✅ Frontend is 100% static and GitHub Pages / Cloudflare Pages friendly (relative paths, no server-side rendering).
- ✅ **No build step required for the frontend** — upload files and it works.
- ✅ No React, Vue, Angular, Svelte, Node.js, PHP, or CMS.
- ✅ Server-backed account/progression lives in Supabase; the browser holds only a temporary session.
- ℹ️ The Supabase backend (migrations 0001→0018 + 20 RPCs) is **prepared but not yet deployed** — see `docs/cloud-deployment.md` and `docs/deployment-guide.md`.

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
