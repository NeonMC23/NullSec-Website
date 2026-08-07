# NullSec — JavaScript Architecture

> **Référence des modules frontend** (vanilla JavaScript, aucun framework).
> Ce document décrit les responsabilités de chaque module, leurs dépendances,
> l'ordre d'initialisation, les API partagées et les notes de migration V2.

---

## 1. Vue d'ensemble

Tous les modules sont des **IIFE** (`(function(){ 'use strict'; ... })()`) qui
s'auto-initialisent sur `DOMContentLoaded` (ou immédiatement si le DOM est déjà
prêt). Ils communiquent via des **globales explicites** (`window.*`) et un
namespace `Utils`.

Aucun bundler : chaque page charge l'ensemble des `<script>` puis chaque module
ne s'active que si son conteneur existe (gardes `if (!el) return;`).

---

## 2. Modules

| Module | Fichier | Responsabilité | Dépendances |
|--------|---------|----------------|-------------|
| **Store** | `assets/js/store.js` | Accès à **localStorage** (uniquement `ns:theme` + migration ; purge des anciennes clés compte au chargement) **et** cache **mémoire de session** pour les données de compte (identity/profile/progress/settings). API `get/set/remove/has/clearNamespace/listKeys/keys` + `getIdentity/saveIdentity/deleteIdentity` + `getProgress/saveProgress/deleteProgress` + `getProfile/saveProfile/deleteProfile` + `getSettings/saveSettings/deleteSettings`. Ne contient **jamais** de secret ni de donnée de compte persistée (politique M17). | — |
| **SessionStore** | `assets/js/session-store.js` | Seul accès à **sessionStorage** : session courte (`ns:session:auth`) + clé de récupération (`ns:session:recovery`). API `getSession/saveSession/clearSession/getRecoveryKey/saveRecoveryKey/deleteRecoveryKey`. | — |
| **Data** | `assets/js/data-loader.js` | Chargement centralisé des JSON (`articles.json`, `missions.json`, `tools.json`), cache mémoire, dédup des fetch, API `Data.loadArticles/loadMissions/loadTools`. | — |
| **Config** | `assets/js/config.js` | Configuration frontend (`window.Config`) : version, feature-flags, flags Supabase/offline. | — |
| **Identity** | `assets/js/identity.js` | Identité locale (UUID) : identifiant de liaison pour le compte Supabase. `init/get/create/update/clear/exists`. Cache hors-ligne, non autoritatif. | Store |
| **UserState** | `assets/js/user-state.js` | État de vue en **mémoire** (jamais persisté) : `get/isAuthenticated/getMode`. Le flag authentifié est délégué à Auth (mémoire). | Auth, Identity, Store(theme) |
| **Progress** | `assets/js/progress-service.js` | Couche unifiée de progression : missions, weekly, articles lus. API `init/get/save/reset/isCompleted/complete/uncomplete/isArticleRead/markArticleRead/unmarkArticleRead`. Liée à `Identity.id`. | Store, Identity |
| **UserProfile** | `assets/js/user-profile.js` | Profil local (username, avatar_seed, recovery_created_at) lié à `Identity.id`. API `init/get/create/update/clear/exists`. Génère la recovery key une fois. | Store, Identity, RecoveryKey |
| **RecoveryKey** | `assets/js/recovery-key.js` | Clé de récupération locale (format NSK1, cryptographique, lisible), stockée en **sessionStorage**. API `generateRecoveryKey/validateRecoveryKey/normalizeRecoveryKey/get/ensure/verify/importRaw/hashForTransport`. Jamais générée deux fois, jamais sort du navigateur. | SessionStore |
| **Settings** | `assets/js/settings-service.js` | Source de vérité des préférences + export/import local de toute la donnée. API `init/get/update/reset/exportData/importData/validateUsername`. | Store, Identity, UserProfile, Progress, RecoveryKey |
| **Auth** | `assets/js/auth-service.js` | État d'authentification **en mémoire** (source de vérité), jamais persisté en localStorage. Token en mémoire (Sync) + sessionStorage (SessionStore). API `init/getState/isAuthenticated/getUser/loginWithRecoveryKey/register/applySession/clearSession/logout/reset`. Offline → `authentication-unavailable-offline`, 0 réseau, pas de compte local inventé. | SessionStore, Identity, RecoveryKey, Config, ApiClient, Sync |
| **ApiClient** | `assets/js/api-client.js` | Communication backend centralisée vers **Supabase** (RPC + PostgREST). Respecte `Config.supabaseEnabled`/`supabaseUrl` ; offline-safe (0 requête si désactivé). Classification d'erreurs (`OFFLINE/UNCONFIGURED/INVALID_ARGUMENTS/UNAUTHORIZED/FORBIDDEN/NETWORK_ERROR/SERVER_ERROR`) + `describe(err)` + handler non autorisé. API `rpc/select/register/login/logout/me/sync/pull/validateSession/community*/describe/setUnauthorizedHandler`. | Config |
| **SessionService** | `assets/js/session-service.js` | Restauration/validation au démarrage (un seul passage). Statut `checking/authenticated/local/unavailable`. API `getStatus/restore/ensureRestored/forceRecheck`. Nettoie la session sur refus `UNAUTHORIZED`. | ApiClient, Auth, Sync, SessionStore, Config, Identity |
| **SyncResolver** | `assets/js/sync-resolver.js` | Résolution de conflits (stratégie v1 : le plus récent `updated_at` gagne). API `merge(local, server)` → `{merged, resolutions}`. Logique pure, testable. | — |
| **Sync** | `assets/js/sync-service.js` | Synchronisation optionnelle (profile/settings/progress) via ApiClient + SyncResolver. Offline → Store seulement. API `isEnabled/isOnline/sync/push/pull/resolveConflicts/setToken/getToken/clearToken/notifyChanged`. | Config, ApiClient, SyncResolver, Identity, UserProfile, Settings, Progress |
| **Community** | `assets/js/community-service.js` | Métriques communautaires anonymes (`window.Community`) : `init/getGlobalStats/getCountryActivity/getActiveRegions/getMissionActivity/refresh/isOnline`. Cache 30 s ; offline → état statique local. | Data, ApiClient, Config |
| **CountryMetrics** | `assets/js/country-metrics.js` | Données d'activité par pays (`window.CountryMetrics`) : `init/getData/normalize/intensity/getCountry`. Chargement via ApiClient, normalisation, état indisponible. Aucune donnée fabriquée. | Data, ApiClient |
| **EuropeMap** | `assets/js/europe-map.js` | Carte SVG Europe (`window.EuropeMap`) : `render/applyActivity/setCountryClass/setSelected/destroy`. Un `<path id="{ISO}">` par pays, accessibilité clavier, sélection. Aucune logique fetch. | CountryMetrics |
| **CountryService** | `assets/js/country-service.js` | Sélection de pays utilisateur (M22) : états `NO_COUNTRY/SELECTING/SAVING/COUNTRY_SET/ERROR`, liste cherchable, choix manuel. `window.CountryService`. | Data, CountryRepository |

| **ActivityService** | `assets/js/activity-service.js` | Couche d\'enregistrement d\'activité communautaire (M25) : `record(type, amount)` valide type/amount, vérifie auth + backend, appelle `ApiClient.recordActivity`. Jamais d\'identité/pays dans le payload ; pas de succès fabriqué. `window.ActivityService`. | ApiClient, Auth, Sync || **Repositories** | `assets/js/repositories/*.js` | Couche d'accès aux données de compte (identity/profile/progress/settings/country). Source de vérité = Supabase ; cache de session mémoire (non-persistant). `window.IdentityRepository/ProfileRepository/ProgressRepository/SettingsRepository/CountryRepository`. | Store |

| **CommunityActionService** | `assets/js/community-action-service.js` | Couche d\'actions communautaires explicites (M26) : `record(action)` valide l\'action puis délègue à `ActivityService`. Ne calle jamais ApiClient directement. `window.CommunityActionService`. | ActivityService || **CommunityMap (legacy)** | `assets/js/legacy/community-map.js` | ⚠️ ARCHIVÉ (M18) — supersedé par `europe-map.js`. | — |
| **MissionDiscovery** | `assets/js/mission-discovery.js` | Découverte/filtres de missions (`window.MissionDiscovery`) : `init/getAll/getByCountry/getByRegion/getByCategory/getAvailable/search`. Offline-first. | Data |
| **Challenges** | `assets/js/challenge-service.js` | Défis communautaires anonymes (`window.Challenges`) : `init/getActive/getProgress/getCompleted`. | ApiClient, Config |
| **CommunityRanking** | `assets/js/community-ranking.js` | Classement pays/régions agrégé (`window.CommunityRanking`) : `getCountries/getRegions`. Jamais individuel. | ApiClient, Config |
| **CommunityMetrics** | `assets/js/community-metrics.js` | Impact global anonyme (`window.CommunityMetrics`) : `init/getGlobal/getCountries/getRegions/getChallenges/refresh`. Offline → vide. | ApiClient, Config |
| **Statistics** | `assets/js/statistics-service.js` | Statistiques locales (lecture seule) : `get()` → Promise de compteurs. Source : Progress + Data. | Progress, Data |
| **Utils** | `assets/js/utils.js` | Helpers : `debounce`, `formatDate`, `sanitize`, `safeUrl`, `clear`, `el` (construction DOM sûre). | Store |
| **Theme** | `assets/js/theme.js` | Thème clair/sombre, persisté via Store (`ns:theme`). | Store |
| **Navigation** | `assets/js/navigation.js` | Menu mobile, mise en évidence du lien actif, navbar sticky. | — |
| **Search** | `assets/js/search.js` | Recherche globale (Fuse.js) sur les articles, Ctrl+K. | Utils, Fuse, Data |
| **Modal** | `assets/js/modal.js` | Overlay modal générique. Retourne l'overlay pour le binding des boutons. | — |
| **Journey** | `assets/js/journey.js` | Missions (chargées via `Data.loadMissions`), progression, modals missions, API `window.Journey`. | Store, Utils, Modal, Data |
| **Tools** | `assets/js/tools.js` | Bibliothèque d'outils (`Data.loadTools`), filtres, recherche, modals. | Store, Utils, Modal, Data |
| **Articles** | `assets/js/articles.js` | Liste des articles (`Data.loadArticles`), tri, section "in progress", état lu. | Store, Utils, Data |
| **Home** | `assets/js/home.js` | Accueil : article vedette + weekly mission (via Journey). | Store, Utils, Data, Journey |
| **ArticleReader** | `assets/js/article-reader.js` | Pages article : bouton "Mark as read", restauration d'état. | Store |
| **Animations** | `assets/js/animations.js` | Fade-in, barre de progression de lecture, back-to-top, partage. | Utils |
| **Tldr** | `assets/js/tldr.js` | Blocs TL;DR expansibles. | — |
| **Fuse** | `assets/js/fuse.min.js` | Bibliothèque Fuse.js (bundle local). | — |

---

## 3. Initialisation order (ordre des `<script>`)

L'ordre est **déterministe et obligatoire** — les modules consommés doivent être
chargés avant leurs consommateurs.

### Pages racine (accueil, journey, tools, articles, etc.)
```
store.js → session-store.js → utils.js → data-loader.js → config.js
        → repositories/{profile,progress,settings}-repository.js → identity.js → user-state.js
        → progress-service.js → user-profile.js → recovery-key.js
        → settings-service.js → auth-service.js → api-client.js → sync-resolver.js
        → sync-service.js → session-service.js → community-service.js
        → country-metrics.js → europe-map.js → mission-discovery.js
        → challenge-service.js → community-ranking.js
        → community-metrics.js → statistics-service.js
        → theme.js → navigation.js → fuse.min.js → search.js → modal.js
        → animations.js → [module spécifique page]
```
- `store.js` **doit être le premier** : il exécute la migration et définit `window.Store`.
- `utils.js` : tous les autres modules utilisent `Utils`.
- `data-loader.js` : définit `window.Data`, chargé avant tout module appelant `Data.*`.
- `config.js` → `identity.js` → `user-state.js` → `progress-service.js`
  → `user-profile.js` → `settings-service.js` → `auth-service.js`
  → `statistics-service.js` : couche fondation (identité, état, progression, profil,
  réglages et auth disponibles avant tout module qui pourrait en dépendre).
  `progress-service.js` et `user-profile.js` sont chargés après `identity.js` car ils
  lisent `Identity.id` ; `auth-service.js` dépend de `recovery-key.js` ;
  `api-client.js`/`sync-service.js` sont chargés après `auth-service.js` et avant les
  modules UI.
- Modules spécifiques : `journey.js` (journey.html), `tools.js` (tools.html),
  `articles.js` (articles.html), `home.js` (index.html).

### Articles (`articles/*.html`)
```
../assets/js/store.js → ../assets/js/utils.js → ../assets/js/data-loader.js
  → ../assets/js/config.js → ../assets/js/identity.js → ../assets/js/user-state.js
  → ../assets/js/progress-service.js → ../assets/js/user-profile.js
  → ../assets/js/recovery-key.js → ../assets/js/settings-service.js
  → ../assets/js/auth-service.js → ../assets/js/api-client.js
  → ../assets/js/sync-resolver.js → ../assets/js/sync-service.js
  → ../assets/js/community-service.js → ../assets/js/country-metrics.js → ../assets/js/europe-map.js
  → ../assets/js/mission-discovery.js → ../assets/js/challenge-service.js
  → ../assets/js/community-ranking.js → ../assets/js/community-metrics.js
  → ../assets/js/statistics-service.js
  → ../assets/js/theme.js → ../assets/js/navigation.js → ../assets/js/fuse.min.js
  → ../assets/js/search.js → ../assets/js/modal.js → ../assets/js/animations.js
  → ../assets/js/article-reader.js
```

### Accueil (`index.html`)
```
store.js → session-store.js → utils.js → data-loader.js → config.js → identity.js → user-state.js
  → progress-service.js → user-profile.js → recovery-key.js → settings-service.js
  → auth-service.js → api-client.js → sync-resolver.js
  → sync-service.js → session-service.js → community-service.js → country-metrics.js → europe-map.js
  → mission-discovery.js → challenge-service.js → community-ranking.js
  → community-metrics.js → statistics-service.js → theme.js → navigation.js → fuse.min.js → search.js → modal.js → animations.js
  → journey.js → home.js
```
`journey.js` est chargé sur l'accueil car `home.js` consomme `window.Journey`
pour la weekly mission.

---

## 4. API partagées

### `window.Store`
`get(key)`, `set(key, value)`, `remove(key)`, `has(key)`, `clearNamespace(ns)`,
`keys` (définition des clés), `migrate()` (exécuté une fois au chargement).

**Méthodes d'identité** : `getIdentity()`, `saveIdentity(identity)`,
`deleteIdentity()`.

**Méthodes d'état utilisateur** : `getUserState()`, `saveUserState(state)`,
`clearUserState()`.

Ces méthodes **réutilisent** la logique `get/set/remove` existante — aucune
duplication de gestion de `localStorage`.

### `window.Identity` (exposé par `identity.js`)
`init()`, `get()`, `create()`, `update(data)`, `clear()`, `exists()`.
Identité locale anonyme (UUID, schéma v1 — voir `docs/identity-schema.md`).

### `window.UserState` (exposé par `user-state.js`)
`get()`, `set(data)`, `clear()`, `isAuthenticated()`, `getMode()`.
État de session ; `isAuthenticated()` délègue au flag autoritaire `Auth`.
`getMode()` renvoie `'anonymous' | 'local' | 'authenticated'`.

### `window.UserProfile` (exposé par `user-profile.js`)
`init()`, `get()`, `create()`, `update(data)`, `clear()`, `exists()`.
Profil local (username, avatar_seed, recovery_created_at) lié à `Identity.id`.
`init()` génère la recovery key une fois (via RecoveryKey). Voir
`docs/identity-schema.md` et `docs/recovery-key.md`.

### `window.RecoveryKey` (exposé par `recovery-key.js`)
`generateRecoveryKey()` → nouvelle clé NSK1 cryptographique.
`validateRecoveryKey(k)` → boolean (format).
`normalizeRecoveryKey(k)` → chaîne canonique ou `null`.
`get()` → clé stockée (ou null).
`ensure()` → retourne la clé stockée, en génère une si absente (jamais deux fois).
Voir `docs/recovery-key.md`.

### `window.Settings` (exposé par `settings-service.js`)
`init()`, `get()`, `update(data)`, `reset()`, `exportData()`, `importData(obj)`,
`validateUsername(name)`.
Source de vérité des préférences ; `exportData`/`importData` gèrent l'export/import
local de toute la donnée utilisateur. Voir `docs/settings-schema.md`.

### `window.Auth` (exposé par `auth-service.js`)
`init()`, `getState()`, `isAuthenticated()`, `getUser()`,
`loginWithRecoveryKey()`, `register()`, `applySession(token, id)`,
`clearSession()`, `logout()`, `reset()`, `getAuthStatus()`, `setAuthenticating(v)`.

`getAuthStatus()` (M20) retourne un état normalisé pour l'UX :
`NOT_AUTHENTICATED` · `AUTHENTICATING` · `AUTHENTICATED` · `BACKEND_UNAVAILABLE` ·
`SESSION_EXPIRED`. `Session.hasSessionRefused()` indique si une session stockée a été
explicitement refusée/expirée par le serveur.
Le flag `isAuthenticated()` est **mémoire** (source de vérité) et n'est posé que par
un login/register réussi ou une restauration validée par le serveur. Offline →
login/register retournent `{ok:false, reason:'authentication-unavailable-offline'}`
sans réseau. Voir `docs/auth-schema.md` et `docs/session-management.md`.

### `window.ApiClient` (exposé par `api-client.js`)
`rpc(fn, args)`, `select(table, query)`, `isBackendAvailable()`,
`isSupabaseConfigured()`, `register(payload)`, `login(payload)`,
`logout(token)`, `me(token)`, `sync(token, data)`, `pull(token)`,
`validateSession(token)`, `community*()`, `describe(err)`,
`classifyError(err)`, `setUnauthorizedHandler(fn)`, `ERROR_TYPES`.
Classification d'erreurs (`OFFLINE/UNCONFIGURED/INVALID_ARGUMENTS/UNAUTHORIZED/
FORBIDDEN/NETWORK_ERROR/SERVER_ERROR`) ; un refus `UNAUTHORIZED` déclenche le
handler de nettoyage de session. Respecte `Config.supabaseEnabled`/`supabaseUrl`.
Offline → rejette sans requête.

### `window.SyncResolver` (exposé par `sync-resolver.js`)
`merge(local, server)` → `{ merged, resolutions }` ; `mergeBlock(local, server)`.
Stratégie v1 : le bloc au `updated_at` le plus récent gagne.

### `window.Sync` (exposé par `sync-service.js`)
`isEnabled()`, `isOnline()`, `sync()`, `push()`, `pull()`,
`resolveConflicts(local, server)`, `setToken(token)`, `getToken()`,
`clearToken()`, `notifyChanged()`.
Synchronisation optionnelle ; offline → Store seulement. Voir
`docs/synchronization.md`.

### `window.Community` (exposé par `community-service.js`)
`init()`, `getGlobalStats()` → Promise, `getCountryActivity()` → Promise,
`getActiveRegions()` → Promise, `getMissionActivity()` → Promise,
`refresh()` → Promise, `isOnline()`.
Métriques communautaires anonymes, cache 30 s ; offline → état vide/statique (voir
`docs/community-architecture.md`).

### `window.EuropeMap` (exposé par `europe-map.js`)
`render(container, opts)`, `applyActivity(svg, data)`, `setCountryClass(svg, code, cls)`,
`setSelected(svg, code)`, `destroy(container)`. Carte SVG Europe, un `<path id="{ISO}">`
par pays ; applique des classes d'intensité ; accessibilité clavier (focus/Enter) ;
sélection visuelle. Aucune logique fetch (voir `docs/europe-activity.md`).

### `window.CountryMetrics` (exposé par `country-metrics.js`)
`init()`, `getData()`, `normalize(raw)`, `intensity(total)`, `getCountry(code)`.
Contrat API pays, validation, normalisation, état indisponible. Distingue `0` (mesuré
à zéro) de `null` (unavailable) pour chaque métrique (voir `docs/europe-activity.md`).
`ApiClient` expose les RPC pays M20 : `countryMetrics()`, `toolActivity(token, toolId)`,
`updateProfile(token, {username, country_code})`.

### Repositories (`assets/js/repositories/`)
`IdentityRepository`, `ProfileRepository`, `ProgressRepository`, `SettingsRepository`,
`CountryRepository` — chacun `get/save/clear` (CountryRepository : `getCountry`/
`setCountry`/`removeCountry`). Couche d'accès aux données de compte ; source de vérité =
Supabase ; cache de session mémoire non-persistant.

### `window.CountryService` (exposé par `country-service.js`)
`getState()`, `getCountries()`, `search(term)`, `select(code)`, `confirm()`, `reset()`.
Flux de sélection de pays (M22) : `NO_COUNTRY → SELECTING_COUNTRY → SAVING_COUNTRY →
COUNTRY_SET | ERROR`. Choix manuel (ISO-3166 alpha-2, nom lisible) ; jamais inféré.
`CountryRepository` → `ApiClient` (aucun accès direct Store).

### `window.MissionDiscovery` (exposé par `mission-discovery.js`)
`init()`, `getAll()`, `getByCountry(code)`, `getByRegion(region)`, `getByCategory(cat)`,
`getAvailable()`, `search(filters)`. Voir `docs/mission-discovery.md`.

### `window.Challenges` (exposé par `challenge-service.js`)
`init()`, `getActive()`, `getProgress()`, `getCompleted()`. Voir
`docs/community-challenges.md`.

### `window.CommunityRanking` (exposé par `community-ranking.js`)
`getCountries()`, `getRegions()`. Voir `docs/community-ranking.md`.

### `window.CommunityMetrics` (exposé par `community-metrics.js`)
`init()`, `getGlobal()`, `getCountries()`, `getRegions()`, `getChallenges()`,
`refresh()`. Voir `docs/community-metrics.md`.

### `window.Statistics` (exposé par `statistics-service.js`)
`get()` → `Promise<{ missions_completed, missions_total, articles_read, weekly_completed, completion_percent }>`.
Statistiques de lecture seule, agrégées depuis Progress + Data.

### `window.Progress` (exposé par `progress-service.js`)
`init()`, `get()`, `save(data)`, `reset()`, `isCompleted(id)`, `complete(id)`,
`uncomplete(id)`, `isArticleRead(slug)`, `markArticleRead(slug)`,
`unmarkArticleRead(slug)`.
Couche unifiée de progression (missions, weekly, articles lus), liée à
`Identity.id`. Voir `docs/progress-schema.md`.

### `window.Config` (exposé par `config.js`)
`get()` et `getConfigStatus()` → `CONFIGURED` / `NOT_CONFIGURED` / `INVALID_CONFIGURATION` (M28).

`get()` → objet de configuration (version, flags `offlineMode/authEnabled/
backendEnabled/syncEnabled`, `provider`, `supabaseEnabled`, `supabaseUrl`,
`supabaseAnonKey`). Injection publique optionnelle via
`window.__NULLSEC_SUPABASE__` (voir `docs/deployment-guide.md`).

### `window.Data` (exposé par `data-loader.js`)
- `loadArticles()` → `Promise<Array>`
- `loadMissions()` → `Promise<Array>`
- `loadTools()` → `Promise<Array>`

Source unique des datasets. Cache mémoire + dédup des fetch simultanés (voir
section "Data Layer"). Aucun autre module ne doit appeler `fetch()` pour ces JSON.

### `window.Utils`
`debounce(fn, ms)`, `formatDate(iso)`, `sanitize(str)`, `safeUrl(url)`,
`clear(el)`, `el(tag, attrs, ...children)`.

`Utils.el` est le **seul constructeur d'éléments dynamiques** recommandé :
tous les textes passent par `textContent` (échappés automatiquement). Le seul
accès HTML brut se fait via l'attribut explicite `{ html: ... }` (contenu fiable
de première partie).

### `window.Journey` (exposé par `journey.js`)
- `onReady(fn)` — exécute `fn` dès que `data/missions.json` est chargé.
- `isReady()` — `true` si les missions sont chargées.
- `getWeeklyMission()` — la mission `weekly-community`.
- `isWeeklyDone()` — état complété de la weekly mission.
- `toggleWeekly()` — bascule l'état de la weekly mission (persisté).
- `renderWeekly(el)` — rend la carte weekly dans `el`.

### `window.Modal`
`open(content)` — `content` est un **nœud DOM** (recommandé) ou une chaîne HTML
(fiable). Retourne l'overlay. `close()`.

### Globales de délégation d'événements
- `window.openMissionModal(id)` — ouvre le modal d'une mission.
- `window.openToolModal(idx)` — ouvre le modal d'un outil.

---

## 5. Rendering safety (politique)

1. **Texte dynamique** → `textContent` (via `Utils.el`), jamais interpolé dans
   `innerHTML`. Applies à : titres de missions, descriptions, noms d'outils,
   descriptions d'outils, titres d'articles, catégories, URLs affichées.
2. **Attributs** → `setAttribute` / `dataset`. Les identifiants (`mission id`,
   `tool idx`) sont passés via `data-*`, jamais via `onclick` inline.
3. **URLs** → `Utils.safeUrl()` (bloque `javascript:`/`data:`), utilisé pour les
   liens externes.
4. **HTML fiable** → uniquement le champ `mission.guide` (contenu statique de
   première partie) et le template modal. Marqués `// trusted` dans le code.
5. **Pas de framework** → le rendu reste du DOM vanilla.

---

## 6. Gestion d'événements

Aucun gestionnaire inline (`onclick`, `onchange`, `oninput`) n'est présent dans
les pages ou le JS généré. Deux patrons :

- **Binding direct** : `element.addEventListener(...)` à l'initialisation du module
  (ex. boutons de modal, toggle "in progress", bouton "mark as read").
- **Délégation** : un seul écouteur sur `document` qui cible les cartes via
  `e.target.closest('.mission-card[data-mission-id]')` / `.tool-card[data-tool-idx]`.

---

## 6b. Conventions de code

- **Pas de `var`** : les modules utilisent `const` (jamais réassigné) et `let`
  (réassigné ou compteur de boucle). La conversion `var → const/let` a été faite
  en M0.4.
- **IIFE** conservées ; **pas d'ES modules**, **pas de framework**.
- **Nommage** : `camelCase` pour fonctions/variables, `PascalCase` pour les
  constructeurs/namespaces (`Utils`, `Store`, `Data`, `Modal`, `Journey`).
- **Gardes DOM** : chaque module retourne tôt si son conteneur n'existe pas.

---

## 7. Data Layer

### Rôle de `data-loader.js`
Centralise le chargement des JSON statiques. **Un seul module appelle `fetch()`**
pour les datasets. Les modules UI consomment `window.Data` et ne font plus de
`fetch` direct.

```
UI Modules
  home.js  articles.js  journey.js  tools.js  search.js
              │              │          │          │
              ▼              ▼          ▼          ▼
         Data Layer  →  data-loader.js  (window.Data)
              │
              ▼
            JSON
  articles.json  missions.json  tools.json
```

### Garanties
- **Cache mémoire** : le résultat du premier `fetch` est conservé ; les appels
  suivants résolvent immédiatement sans réseau.
- **Dédup des fetch simultanés** : si N modules demandent le même dataset en même
  temps, un seul `fetch` est émis ; tous partagent la même Promise.
- **Gestion d'erreurs** : en cas d'échec, la Promise rejette (les modules
  consommateurs affichent un message de repli) et le cache n'est **pas** pollué —
  un nouvel appel retentera.
- **Source unique** : aucun autre module ne doit référencer `fetch('data/...')`.

### Dépendances
`data-loader.js` n'a **aucune dépendance** (pas de Store/Utils requis). Il doit
simplement être chargé **avant** tout module appelant `Data.*`.

### Ordre d'initialisation (mis à jour)
`store.js` → `data-loader.js` → `utils.js` → ... → modules UI.

---

## 7b. Chargement des données (référence des consommateurs)

| Donnée | Fichier | Consommateur |
|--------|---------|--------------|
| Missions | `data/missions.json` | `journey.js` (et `home.js` via `Journey`) |
| Outils | `data/tools.json` | `tools.js` |
| Articles | `data/articles.json` | `articles.js`, `search.js`, `home.js` |

Tous les consommateurs passent par `Data.*`. En cas d'échec, chaque module gère
l'erreur avec un message de repli dans son conteneur — jamais de page blanche.

---

## 8. Persistance (via Store)

### localStorage (appareil / préférences uniquement)

| Clé | Valeur | Usage |
|-----|--------|-------|
| `ns:theme` | `dark`/`light` | thème (préférence d'appareil) |
| `ns:migrated:v1` | `done` | marqueur de migration |

### Mémoire de session (données de compte — NON persistées, M17)

Les données de compte (identity/profile/progress/settings) vivent **en mémoire de
session** uniquement. Elles ne sont **jamais** écrites en localStorage (ni IndexedDB).
Au chargement, `Store.migrate()` **purge** toute ancienne clé localStorage de compte
(`ns:identity`, `ns:user:profile`, `ns:progress`, `ns:settings`, `ns:auth`,
`ns:user:state`, `ns:recovery`) pour garantir qu'aucun état de compte ne survit à un
rechargement ni ne peut ressusciter un utilisateur authentifié.

### sessionStorage

> via `SessionStore`, **seul** accès : `ns:session:recovery` (clé NSK1) et
> `ns:session:auth` (`{ token, expires_at }`) — session courte, représentation
> temporaire d'une session Supabase authentifiée.

**Politique de stockage (M17)** : le navigateur est un **client**, pas une base de
données. La source de vérité des données de compte est **Supabase**. `localStorage` ne
contient aucun secret, état d'authentification, token, clé de récupération, flag de
compte ni donnée de compte. L'état d'authentification est en **mémoire** ; la session
courte est en `sessionStorage`.

> **Note** : les clés fragmentées `ns:journey:progress`, `ns:weekly:progress` et
> `ns:article:read:{slug}` ont été **consolidées** dans `ns:progress` en M2. Elles
> ne sont plus écrites ; `Progress.init()` les migre une fois puis les supprime.

### Relation Store → Identity & Progress
- **`identity.js`** ne manipule `localStorage` qu'à travers `Store`.
  `Store.getIdentity()` / `saveIdentity()` / `deleteIdentity()` encapsulent `ns:identity`.
- **`progress-service.js`** ne manipule `localStorage` qu'à travers `Store`.
  `Store.getProgress()` / `saveProgress()` / `deleteProgress()` encapsulent `ns:progress`.
- **`user-profile.js`** de même via `Store.getProfile()` / `saveProfile()` /
  `deleteProfile()` (`ns:user:profile`).
- **`recovery-key.js`** via `SessionStore.getRecoveryKey()` / `saveRecoveryKey()` /
  `deleteRecoveryKey()` (`ns:session:recovery`, sessionStorage).
- **`settings-service.js`** via `Store.getSettings()` / `saveSettings()` /
  `deleteSettings()` (`ns:settings`).
- **`auth-service.js`** n'écrit **plus** en localStorage : l'état d'authentification
  est en mémoire + sessionStorage. Il n'existe ni `ns:auth` ni `ns:user:state`.
- **`user-state.js`** est en mémoire uniquement (jamais persisté).
- Aucun autre module n'accède directement à ces clés.

### Modèle de persistance (M17)
- **localStorage** : uniquement `ns:theme` (préférence d'appareil) + marqueur de
  migration. **Aucune donnée de compte**.
- **Mémoire de session** : données de compte (identity/profile/progress/settings),
  flag d'authentification (Auth), vue (UserState), token (Sync).
- **sessionStorage** : session courte (représentation temporaire d'une session
  Supabase authentifiée) + clé de récupération.
- **Source de vérité** des données de compte : **Supabase**.

`Store.migrate()` gère les clés legacy (`nullsec-theme`, `ns-journey-progress`,
`ns-article-{slug}`, `ns-5-invites`) et **purge** toute ancienne clé localStorage de
compte (M17).

---

## 9. Notes de migration V2

- **Rendu** : les modules construisent déjà du DOM via `Utils.el`. Pour du
  contenu utilisateur, il suffira de rendre les champs texte via `textContent`
  (déjà le cas) et de **retirer le seul `innerHTML` fiable restant**
  (`mission.guide`) en le remplaçant par des blocs structurés sanitizés.
- **Persistance** : remplacer `Store` (localStorage) par l'API V2 en conservant
  la **même interface** pour minimiser la churn frontend.
- **Données** : `missions.json`/`tools.json`/`articles.json` deviendront des
  endpoints API, avec **fallback statique** pour la résilience.
- **Modules** : la structure IIFE + globales reste compatible ; si le projet
  grossit, migrer vers des ES modules via `type="module"` et import maps sans
  changer la logique.
