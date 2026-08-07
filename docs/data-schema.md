# NullSec — Data Schema Reference

> **Purpose :** document the current data schemas consumed by the static site.
> This document is the **reference for the future V2 backend migration** (identities,
> journeys, progress, community goals, statistics). It must stay in sync with the
> JSON files under `/data/`.

**Files referenced :**
- `/data/missions.json` — learning journey missions
- `/data/tools.json` — privacy tools library
- `/data/articles.json` — articles metadata
- Client-side storage via `assets/js/store.js`

---

## 1. Mission schema (`/data/missions.json`)

JSON array of mission objects. Preserved 1:1 from the previous JS-embedded dataset.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | ✅ | Stable unique slug, e.g. `enable-2fa`, `weekly-community`. Used as progress key. |
| `title` | `string` | ✅ | Short mission title. |
| `desc` | `string` | ✅ | One-line description shown on the card. |
| `stage` | `number` | ✅ | Stage number: `0` = weekly/community, `1..4` = learning stages. |
| `time` | `string` | ✅ | Estimated time, e.g. `"15 min"` (weekly uses `"~"`). |
| `difficulty` | `number` | ✅ | `1` (easiest) … `4` (hardest). Rendered as ★★★★★. |
| `impact` | `number` | ✅ | `1` … `5`. Rendered as impact dots. |
| `icon` | `string` | ✅ | Emoji glyph for the card. |
| `mobileFriendly` | `boolean`/`number` | ❌ | Legacy flag (currently not displayed). |
| `guide` | `string` | ✅ | Rich HTML body shown in the mission modal. Contains trusted static HTML (`<p>`, `<ul>`, `<a>`, `<strong>`, `<code>`). |
| `region` | `string` | ❌ | Géographique optionnel (ex. `Europe`). Défaut `Europe`. |
| `status` | `string` | ❌ | État optionnel (ex. `active`). |
| `country` | `string` \| `null` | ❌ | Pays optionnel (ex. `EU` pour la mission communautaire, `null` sinon). |
| `available` | `boolean` | ❌ | Disponibilité (défaut `true`). Validé/normalisé par `data-loader`. |
| `category` | `string` | ❌ | Catégorie optionnelle (ex. `Security`, `Community`). Défaut `General`. |
| `description` | `string` | ❌ | Alias optionnel de `desc` (ajouté en M10, non utilisé par le rendu). |

**Example :**
```json
{
  "id": "enable-2fa",
  "title": "Enable Two-Factor Authentication",
  "desc": "Add a second layer of security to your most important accounts.",
  "stage": 1,
  "time": "15 min",
  "difficulty": 1,
  "impact": 5,
  "icon": "🔐",
  "mobileFriendly": true,
  "guide": "<p>Two-factor authentication (2FA) ...</p>"
}
```

### Stage grouping (current)
| Stage | Meaning | Count |
|-------|---------|-------|
| `0` | Weekly / community mission | 1 |
| `1` | Getting Started | 8 |
| `2` | Build Better Habits | 8 |
| `3` | Take Back Control | 7 |
| `4` | Advanced | 6 |
| **Total** | | **30** |

### Rendering constraints & compatibility
- **Current** : `guide` is inserted as **trusted first-party HTML** (marked `// trusted`
  in `journey.js`). Safe today because the data is static and owned by NullSec.
- **Compatibility handling** : `journey.js` (`renderGuide()`) already accepts three
  formats so the model can evolve **without breaking existing content** :
  1. `string` → rendered as trusted HTML (legacy / current).
  2. `Array` of blocks `[{text}]` / `[{html}]` / `[{type, id}]` → rendered per-block.
  3. Object `{ type, id }` → rendered as a reference line.
- **V2 target** : when guides may be user-authored, migrate to structured blocks
  (`[{type:'paragraph', text}, …]` or `{type:'article', id}`) and drop the trusted
  `string` path. `renderGuide()` is the single point to change.
- Progress is tracked by mission `id` (array of ids in `ns:journey:progress`; weekly uses `ns:weekly:progress`).

---

## 2. Tool schema (`/data/tools.json`)

JSON array of tool objects. Preserved 1:1 from the previous JS-embedded dataset.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | ✅ | Tool name. |
| `desc` | `string` | ✅ | One-line description. |
| `url` | `string` | ✅ | Official website URL (`http`/`https`). Rendered with `Utils.safeUrl()` guard. |
| `category` | `string` | ✅ | Filter category, e.g. `"Password Managers"`. |
| `openSource` | `boolean` | ✅ | Whether the tool is open source. |
| `free` | `boolean` | ✅ | Whether it has a free tier. |
| `difficulty` | `number` | ✅ | `1` (easy) … `4` (advanced). |

**Example :**
```json
{
  "name": "Signal",
  "desc": "End-to-end encrypted messaging. Gold standard for private communication.",
  "url": "https://signal.org",
  "category": "Messaging",
  "openSource": true,
  "free": true,
  "difficulty": 1
}
```

> **V2 target schema (future) :** the audit recommends evolving to a stable `id`
> plus richer privacy metadata. The following fields are **not yet present** in the
> data and will be added during backend migration — they are documented here as the
> migration target and must not be relied on today:
>
> | Target field | Notes |
> |--------------|-------|
> | `id` | Stable slug (currently tools are addressed by `name`/index). |
> | `open_source` | Intended rename of `openSource` (snake_case). |
> | `privacy_score` | A curated 0–100 score (not yet defined). |

---

## 3. Article schema (`/data/articles.json`)

JSON array of article metadata.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | `string` | ✅ | Article title. |
| `description` | `string` | ✅ | Meta/description blurb. |
| `category` | `string` | ✅ | e.g. `"Privacy"`, `"Cybersecurity"`. |
| `date` | `string` | ✅ | ISO date, e.g. `2026-07-27T10:00:00`. |
| `readingTime` | `string` | ✅ | e.g. `"12 min"`. |
| `cover` | `string` | ✅ | Image path (currently `assets/images/placeholder.svg`). |
| `url` | `string` | ✅ | Relative page path, e.g. `articles/nis2-directive.html`. |
| `featured` | `boolean` | ✅ | Featured article (currently 1). |
| `status` | `string` | ✅ | `"published"` or `"in-progress"`. |

---

## 4. Client-side persistence keys (`assets/js/store.js`)

Single source of truth for browser storage. All keys are namespaced with `ns:`.

| Key | Value | Purpose |
|-----|-------|---------|
| `ns:theme` | `"dark"` \| `"light"` | UI theme. |
| `ns:journey:progress` | JSON array of mission ids | Completed stage missions. |
| `ns:weekly:progress` | `"done"` (or absent) | Weekly mission state. |
| `ns:article:read:{slug}` | `"done"` (or absent) | Read-state per article. |
| `ns:migrated:v1` | `"done"` | Migration marker (set once). |

Store values are JSON-encoded on write and auto-parsed on read. Legacy flat keys
(`nullsec-theme`, `ns-journey-progress`, `ns-article-{slug}`, `ns-5-invites`) are
migrated to the namespaced keys automatically on first load (see `Store.migrate()`).

---

## 5. Loading flow (current)

```
journey.js ──fetch──▶ data/missions.json ──▶ MISSIONS[] ──▶ renderAll()
tools.js   ──fetch──▶ data/tools.json   ──▶ TOOLS[]   ──▶ renderTools()
articles.js ─fetch──▶ data/articles.json ─▶ renderList() / search index
```

- All fetches are **relative** (compatible with GitHub Pages subdirectory hosting).
- On failure, each module shows a **graceful error** in its container and logs to the
  console — the page never crashes.
- `window.Journey` exposes `onReady(fn)` so the homepage can render the weekly
  mission once `missions.json` has loaded.

---

## 6. Migration notes for V2

- **Missions :** add a `slug`-derived unique `id` (already present), and consider
  extracting the trusted `guide` HTML into structured steps (`[{type, body}]`) so
  user content can be sanitized per-block.
- **Tools :** add stable `id`, rename `openSource`→`open_source`, add `privacy_score`.
- **Articles :** keep as-is; extend with `tags` and related-mission linkage when the
  "guides connected to actions" feature lands.
- **Persistence :** replace `Store` (localStorage) with the V2 API while keeping the
  same keys/API shape to minimize frontend churn.
