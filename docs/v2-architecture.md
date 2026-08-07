# NullSec — V2 Architecture

> **Architecture cible de la plateforme NullSec V2.**
> Ce document couvre la couche fondation (Milestone 1) et la trajectoire vers un
> futur backend, tout en restant **offline-first** et **privacy-first**.

---

## 1. Architecture

```
 HTML
  │
  ├── CSS (tokens, base, layout, components, pages, utilities, themes)
  │
  └── JavaScript Modules (IIFE vanilla, window.* namespaces)
        │
        ├── Data Layer  ── data-loader.js ──► articles.json / missions.json / tools.json
        │
        ├── Store       ── store.js ──► localStorage (uniquement ns:theme + migration ; AUCUNE donnée de compte)
        │
        ├── SessionStore ── session-store.js ──► sessionStorage (seuls secrets courts : session + clé)
        │
        ├── Identity    ── identity.js ──► MÉMOIRE (session) ; source = Supabase
        │
        ├── Progress    ── progress-service.js ──► MÉMOIRE (session) ; source = Supabase
        │
        ├── UserProfile ── user-profile.js ──► MÉMOIRE (session) ; source = Supabase
        │
        ├── RecoveryKey ── recovery-key.js ──► ns:session:recovery (clé, sessionStorage)
        │
        ├── Settings    ── settings-service.js ──► MÉMOIRE (session) ; source = Supabase
        │
        ├── Auth        ── auth-service.js ──► flag MÉMOIRE (jamais en localStorage)
        │
        ├── ApiClient   ── api-client.js (communication Supabase, offline-safe)
        │
        ├── SessionService ── session-service.js (restauration/validation de session)
        │
        ├── Sync        ── sync-service.js (synchronisation optionnelle, token en mémoire)
        │
        ├── SyncResolver ── sync-resolver.js (résolution de conflits, logique pure)
        │
        ├── Community   ── community-service.js (métriques anonymes)
        │
        ├── EuropeMap ── europe-map.js (carte SVG Europe, un path par ISO)
        ├── CountryMetrics ── country-metrics.js (données d'activité par pays)
        ├── Repositories ── repositories/*.js (accès données de compte)
        ├── MissionDiscovery ── mission-discovery.js (découverte/filtres missions)
        ├── Challenges ── challenge-service.js (défis anonymes)
        ├── CommunityRanking ── community-ranking.js (classement pays/régions agrégé)
        ├── CommunityMetrics ── community-metrics.js (impact global anonyme)
        │
        ├── Statistics  ── statistics-service.js (agrège Progress + Data, lecture seule)
        │
        ├── UserState   ── user-state.js (état de vue en MÉMOIRE, jamais persisté)
        │
        ├── Config      ── config.js (feature-flags + flags Supabase/offline)
        │
        └── Future API  ── (prévu, non implémenté) backend
```

### Graphe de dépendances
```
UI modules (journey, tools, articles, home, search, article-reader, profile)
        │
        ▼
Sync (sync-service.js)            ── ApiClient, SyncResolver, Identity, UserProfile, Settings, Progress
SessionService (session-service.js) ── ApiClient, Auth, Sync, SessionStore, Config, Identity
SessionStore (session-store.js)    ── (sessionStorage)
SyncResolver (sync-resolver.js)    ── (logique pure)
Community (community-service.js)   ── Data, ApiClient, Config (stats/map/missions, cache 30s)
EuropeMap (europe-map.js)          ── CountryMetrics (présentation)
CountryMetrics (country-metrics.js) ── Data, ApiClient, Config
Repositories (repositories/*.js)   ── Store (mémoire de session)
MissionDiscovery (mission-discovery.js) ── Data
Challenges (challenge-service.js)   ── ApiClient, Config
CommunityRanking (community-ranking.js) ── ApiClient, Config
CommunityMetrics (community-metrics.js) ── ApiClient, Config (impact global M12)
ApiClient (api-client.js)          ── Config (supabaseEnabled/supabaseUrl)
Auth (auth-service.js)            ── Identity, RecoveryKey, Config, ApiClient, Sync, SessionStore
Settings (settings-service.js)     ── SettingsRepository, Identity, UserProfile, Progress, RecoveryKey
RecoveryKey (recovery-key.js)     ── SessionStore
Repositories (repositories/*.js)  ── Store (mémoire de session, source = Supabase)
IdentityRepository (repositories/identity-repository.js)  ── Store
ProfileRepository (repositories/profile-repository.js)   ── Store
ProgressRepository (repositories/progress-repository.js) ── Store
SettingsRepository (repositories/settings-repository.js) ── Store
Statistics (statistics-service.js) ── Progress, Data
UserProfile (user-profile.js)      ── Store, Identity, RecoveryKey
Progress  (progress-service.js)    ── Store, Identity
Data Layer (data-loader.js)
Store     (store.js)
Identity  (identity.js)            ── Store
UserState (user-state.js)          ── Auth, Identity (mémoire)
Config    (config.js)
```

### Chaîne (demandée M6)
```
UI
 ↓
Auth Service
 ↓
UserState
 ↓
Identity
 ↓
Store
```

### Chaîne sync (M7)
```
UI
 ↓
SyncService
 ↓
API Client
 ↓
Backend
 ↓
Database
```

Recovery flow :
```
Recovery Key
 ↓
Store
 ↓
Local verification (RecoveryKey.verify)
```
La clé ne quitte jamais le navigateur.

### Ordre de chargement (23 pages)
```
store.js → session-store.js → utils.js → data-loader.js → config.js → identity.js → user-state.js
        → progress-service.js → user-profile.js → recovery-key.js
        → settings-service.js → auth-service.js → api-client.js → sync-resolver.js
        → sync-service.js → session-service.js → community-service.js → country-metrics.js → europe-map.js
        → mission-discovery.js → challenge-service.js → community-ranking.js
        → community-metrics.js → statistics-service.js → theme.js
        → navigation.js → fuse.min.js → search.js → modal.js → animations.js
        → [modules page]
```

L'identité (`identity.js`), l'état (`user-state.js`), la progression
(`progress-service.js`), le profil (`user-profile.js`), la clé de récupération
(`recovery-key.js`), les réglages (`settings-service.js`), l'authentification
(`auth-service.js`), la couche réseau (`api-client.js`/`sync-service.js`) et les
statistiques (`statistics-service.js`) sont chargés **avant** tout module qui pourrait
en dépendre.

---

## 2. Couches actuelles (Milestone 1, 2 & 3)

| Couche | Module | Rôle |
|--------|--------|------|
| **Data Layer** | `data-loader.js` | Charge et met en cache les JSON statiques (`window.Data`). |
| **Store** | `store.js` | localStorage **uniquement** `ns:theme` + marqueur de migration. Aucune donnée de compte (identity/profile/progress/settings sont en mémoire). Purge des anciennes clés compte au chargement. `window.Store`. |
| **SessionStore** | `session-store.js` | **Seul** accès à `sessionStorage` (session courte + clé de récupération), `window.SessionStore`. |
| **Identity** | `identity.js` | Identité (UUID) en **mémoire de session** ; source de vérité = Supabase. `window.Identity`. |
| **Progress** | `progress-service.js` | Progression en **mémoire de session** ; source de vérité = Supabase. `window.Progress`. |
| **UserProfile** | `user-profile.js` | Profil en **mémoire de session** ; source de vérité = Supabase. `window.UserProfile`. |
| **RecoveryKey** | `recovery-key.js` | Clé de récupération (NSK1), `sessionStorage`, `window.RecoveryKey`. |
| **Settings** | `settings-service.js` | Réglages en **mémoire de session** ; source de vérité = Supabase. `window.Settings`. |
| **Auth** | `auth-service.js` | État d'authentification **en mémoire** (jamais en localStorage) + login/register/logout backend, `window.Auth`. |
| **ApiClient** | `api-client.js` | Communication Supabase centralisée (offline-safe, classification d'erreurs), `window.ApiClient`. |
| **SessionService** | `session-service.js` | Restauration/validation de session au démarrage, `window.Session`. |
| **SyncResolver** | `sync-resolver.js` | Résolution de conflits (newest updated_at wins), `window.SyncResolver`. |
| **Sync** | `sync-service.js` | Synchronisation optionnelle (token en mémoire), `window.Sync`. |
| **Community** | `community-service.js` | Métriques communautaires anonymes, `window.Community`. |
| **EuropeMap** | `europe-map.js` | Carte SVG Europe, un `<path id="{ISO}">` par pays, `window.EuropeMap`. |
| **CountryMetrics** | `country-metrics.js` | Données d'activité par pays, `window.CountryMetrics`. |
| **Repositories** | `repositories/*.js` | Accès données de compte (identity/profile/progress/settings), source = Supabase. |
| **MissionDiscovery** | `mission-discovery.js` | Découverte/filtres de missions, `window.MissionDiscovery`. |
| **Challenges** | `challenge-service.js` | Défis communautaires anonymes, `window.Challenges`. |
| **CommunityRanking** | `community-ranking.js` | Classement pays/régions agrégé, `window.CommunityRanking`. |
| **CommunityMetrics** | `community-metrics.js` | Impact global anonyme, `window.CommunityMetrics`. |
| **Statistics** | `statistics-service.js` | Statistiques de lecture seule (compteurs), `window.Statistics`. |
| **UserState** | `user-state.js` | État de vue en **mémoire** (jamais persisté) : `get/isAuthenticated/getMode`, `window.UserState`. |
| **Config** | `config.js` | Configuration frontend, `window.Config`. |

Toutes ces couches fonctionnent **sans backend** et **sans réseau** pour l'état. La
**source de vérité** des données de compte (profil/réglages/progression) est
**Supabase** ; les valeurs locale de compte (identity/profile/progress/settings) vivent
en **mémoire de session** et ne sont **jamais** persistées (ni localStorage, ni
IndexedDB). Le navigateur est un **client**, pas une base de données.

**Modèle d'état** : `LOCAL / NOT AUTHENTICATED` · `AUTHENTICATED / SUPABASE` ·
`BACKEND UNAVAILABLE`. Aucun « compte local » ne peut ressusciter un utilisateur
authentifié depuis des données en cache.

---

## 3. Philosophie d'identité

- **Anonyme par défaut** : l'utilisateur n'a **rien** à fournir pour exister.
- **Locale d'abord** : l'identité vit sur l'appareil, générée localement.
- **Sans compte** : aucun email/mot de passe/login/inscription.
- **UUID stable** : l'identifiant sert de clé de synchronisation future.
- **Rétro-compatible** : schéma versionné, migration possible sans perte.

---

## 4. Offline-first

- Tout l'état (identité, progression, thème, articles lus) vit dans `localStorage`.
- Le site se charge et fonctionne **hors-ligne** (sauf les polices externes et les
  liens sortants, qui ne bloquent pas).
- Un futur backend viendra **enrichir** (synchroniser) l'expérience, pas la
  rendre dépendante du réseau.

---

## 5. Migration backend future

```
Identity (id local)
   │
   ▼
Progress (progression liée à Identity.id)
   │
   ▼
Sync (sync-service.js — token en mémoire)
   │
   ▼
SessionService / Auth (restauration + validation ns_validate_session)
   │
   ▼
Backend Supabase (ApiClient — public URL + anon key)
```

1. **Reste locale** : l'identité est générée et stockée localement.
2. **Progression liée** : `Progress.identity_id === Identity.id` ; chaque donnée de
   progression est associée à l'identité locale, prête pour la sync.
3. **Synchronisation** : `Auth.isAuthenticated()` (flag mémoire validé par
   `ns_validate_session`) ; `Sync` fournit les données à synchroniser via `ApiClient`.
4. **Config** : `Config.get().supabaseEnabled` / `supabaseUrl` / `supabaseAnonKey`
   sont les points de bascule — aucun module ne contient d'URL backend en dur.
5. **Fallback** : en cas d'échec réseau, le site retombe sur l'état local (0 requête
   quand Supabase est désactivé).

---

## 6. Principes de confidentialité

- **Pas de mot de passe**, pas d'email, pas d'OAuth, pas de cookie de session.
- **Tokens de session** : opaque, haché SHA-256 côté serveur, jamais en localStorage
  (mémoire + sessionStorage), jamais loggé.
- **Pas d'analytics**, pas de tracking, pas de fingerprinting, pas de GPS/IP.
- **Aucun fournisseur d'identité tiers.**
- **Collecte minimale** : uniquement ce que l'utilisateur choisit de renseigner
  (`username`, `avatar_seed`).
- **Données locales** tant que l'utilisateur ne choisit pas de les synchroniser.

---

## 7. Feuille de route d'authentification

> Aucun système d'authentification n'est implémenté. C'est la trajectoire prévue.

| Étape | Statut | Description |
|-------|--------|-------------|
| **Identité locale** | ✅ (M1) | UUID local, anonyme, sans compte. |
| **État utilisateur** | ✅ (M1) | Couche de session, `authenticated` délégué à Auth. |
| **Config backend** | ✅ (M1) | Supabase (public URL + anon key) + flags explicites. |
| **Backend Supabase** | ✅ (M13) | PostgreSQL + PostgREST + RPC (auth/sync/activity). |
| **Authentification** | ✅ (M13/M13.1) | Clé de récupération (SHA-256 transport → bcrypt), token-auth sync, RLS. |
| **Persistance de session** | ✅ (M14) | Restauration via sessionStorage + `ns_validate_session`, fallback offline. |
| **Synchronisation** | ⏳ réel non validé | Code implémenté ; test réel bloqué sans projet Supabase. |
| **Profils / dashboard** | ⏳ hors scope | Interfaces individuelles non prévues (privacy-first, pas de réseau social). |

---

## 8. Sécurité (M1)

- Aucun secret stocké (pas de token/password).
- Identité **locale** uniquement ; rien n'est envoyé nulle part.
- `uuid()` : `crypto.randomUUID()` quand disponible, sinon fallback mathématique
  (suffisant pour un identifiant local non cryptographique).
- Les modules Identity/UserState/Config n'exposent que des API minimales.

---

## Modèle de propriété des données (M17)

| Data | Source autoritative | Persistance navigateur |
|------|---------------------|------------------------|
| Account | Supabase | aucun |
| Identity | Supabase | aucun (mémoire de session) |
| Profile | Supabase | aucun (mémoire de session) |
| Settings | Supabase | aucun (mémoire de session) |
| Progress | Supabase | aucun (mémoire de session) |
| Recovery credential | hash Supabase | clé temporaire en sessionStorage |
| Session | validation Supabase | sessionStorage (session courte) |
| Community activity | données agrégées Supabase | aucun |
| Theme | appareil | localStorage optionnel (`ns:theme`) |

> **« Local browser storage is not an account database. »** Le navigateur est un
> client ; Supabase est la source de vérité unique des comptes et des données
> utilisateur persistantes.

### Modèle de données pays (M20)

- **Pays utilisateur** : `user_profiles.country_code` (ISO-3166 alpha-2), **choix
  explicite** enregistré via `ns_update_profile`. Jamais inféré depuis IP/GPS/locale/
  fuseau/appareil. Utilisé pour l'agrégat `participants`.
- **Activité des outils** : table agrégée `tool_activity` (pays, outil, compteur).
  Enregistrée uniquement via `ns_tool_activity` (authentifié, pays dérivé serveur).
  Aucun historique individuel.
- **Propagation** : non modélisée → `null` (unavailable) ; ne pas inventer.
- `totalActivity = missionActivity + toolActivity` (agrégat déterministe).
