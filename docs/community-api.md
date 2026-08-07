# NullSec — Community API

> **Endpoints communautaires (M9).** Publics, agrégés, anonymes.
> Aucune authentification requise, aucune donnée personnelle exposée.
>
> **M15 — Backend de production : Supabase.** Les chemins `/api/community/*` ci-dessous
> documentent l'ancienne API Express (archivée). En production le frontend lit ces
> données via **PostgREST/RPC Supabase** (`assets/js/api-client.js`) :
> - lectures agrégées : `GET /rest/v1/{anonymous_global_stats, country_activity,
>   region_activity, mission_activity, countries, community_challenges}`
> - écriture anonyme : `ns_activity` (RPC `SECURITY DEFINER`)
> - métriques : `ns_metrics` (RPC)
>
> Le contrat de données (formes JSON ci-dessous) reste valable ; seul le transport
> change.

---

## Endpoints

### `GET /api/community/stats`
Statistiques globales anonymes.
```json
{
  "active_users": 1500,
  "completed_missions": 45000,
  "countries_active": 15,
  "top_regions": [
    { "code": "FR", "region": "Europe", "completed": 1200 }
  ]
}
```

### `GET /api/community/map`
Activité par pays.
```json
{
  "countries": [
    { "code": "FR", "region": "Europe", "missions_available": 25,
      "completed": 1200, "activity_level": "high" }
  ]
}
```

### `GET /api/community/countries`
Régions actives.
```json
{
  "countries": [
    { "code": "FR", "region": "Europe", "active": true, "missions_available": 25 }
  ]
}
```

### `GET /api/community/missions`
Activité des missions par pays (rangée par complétions).
```json
[
  { "country": "FR", "missions_available": 25, "completed": 1200 },
  { "country": "DE", "missions_available": 25, "completed": 900 }
]
```

### `POST /api/community/activity`
Incrément anonyme d'une complétion de mission (pipeline M12).
```json
{ "mission_id": "enable-2fa", "country_code": "FR", "region": "Europe", "timestamp": "ISO" }
```
→ `200 { ok: true }`. Incrémente `mission_activity`, `country_activity`,
`region_activity`, les défis actifs et `anonymous_global_stats`. Rejette (400) tout
payload contenant un champ identité (`identity_id`, `username`, `token`, `session`,
`recovery_key`), un `mission_id` manquant ou un `country_code` invalide.

### `GET /api/community/metrics`
Snapshot d'impact global agrégé.
```json
{
  "global": { "completedMissions": 12542, "activeCountries": 23, "activeRegions": 5 },
  "countries": [ { "country": "FR", "name": "France", "completed": 1200 } ],
  "regions": [ { "region": "Europe", "completed": 4100 } ],
  "challenges": [ { "id": 1, "title": "Europe Mission Week", "completion_percent": 80 } ]
}
```

### `GET /api/community/activity/map`
Données d'intensité pour la carte Europe.
```json
{ "countries": [ { "code": "FR", "name": "France", "active": true, "completed": 1240, "activity_level": "high" } ] }
```

---

### `GET /api/missions`
Métadonnées publiques des missions par pays.
```json
{ "missions": [ { "country": "FR", "missions_available": 25, "completed": 1200 } ] }
```

### `GET /api/community/challenges`
Défis communautaires anonymes.
```json
{ "challenges": [ { "id": 1, "title": "Europe Mission Week", "target_value": 10000, "current_value": 1200, "status": "active" } ] }
```

### `GET /api/community/ranking/countries`
Classement des pays (agrégé).
```json
{ "countries": [ { "code": "FR", "name": "France", "region": "Europe", "completed": 2300 } ] }
```

### `GET /api/community/ranking/regions`
Classement des régions (agrégé).
```json
{ "regions": [ { "region": "Europe", "countries_active": 15, "completed": 4100 } ] }
```

---

## Backend (M13)

Les endpoints communautaires sont servis par **Supabase** (PostgREST + RPC).
Les lectures publiques agrégées utilisent PostgREST (autorisées par RLS : SELECT anon
sur les tables agrégées uniquement) ; l'incrément anonyme et le snapshot d'impact
utilisent les RPC `ns_activity` / `ns_metrics`.

**RLS (M13.1) :** les tables agrégées sont en lecture publique seule (SELECT anon) ;
aucun INSERT/UPDATE/DELETE anon. Les écritures passent par `ns_activity`
(`SECURITY DEFINER`). Aucun champ identité n'est accepté.

## Sécurité

- **Aucune authentification** pour les statistiques publiques agrégées.
- **Rate limit** : **non implémenté** au niveau applicatif (voir `deployment-guide.md`).
  Les mentions historiques de rate-limit concernaient l'ancien backend Express (archivé).
- **Agrégation uniquement** — aucun accès à des données personnelles/individuelles.
- **Caching** court, aucune donnée sensible.
- Aucun stockage de localisation précise, d'IP ou de fingerprint.

---

## Niveaux d'activité

Dérivés côté serveur du nombre de complétions par pays :
`none` (0) → `low` (<100) → `medium` (<1000) → `high` (<5000) → `very-high` (≥5000).

---

## Europe country metrics (M18→M20)

La carte Europe utilise le RPC agrégé par pays **`ns_country_metrics()`** renvoyant des
statistiques **agrégées** par pays (participants, missions, outils, propagation,
total). Voir **`docs/europe-activity.md`**.

- **RPC** : `backend/supabase/functions/rpc_country_metrics.sql` (M18→M20). `SECURITY
  DEFINER`, `search_path = public`, ne retourne que des agrégats (aucun identifiant
  individuel).
  - `participants` = `COUNT(*) FROM user_profiles WHERE country_code = c.code` (M20) ;
  - `missionActivity` = `SUM(mission_activity.completed_count)` ;
  - `toolActivity` = `SUM(tool_activity.activity_count)` (M20) ;
  - `propagation` = `null` (non modélisé — absence honnête) ;
  - `totalActivity` = `missionActivity + toolActivity` (agrégat déterministe, M20).
- **EXECUTE** : contrôlé explicitement par les migrations `0005` et `0008`
  (REVOKE PUBLIC + GRANT anon/authenticated).
- **RPC authentifiés (M20)** : `ns_tool_activity(p_token, p_tool_id)` et
  `ns_update_profile(p_token, p_username, p_country_code)`. Token-authentifiés ; le
  pays est dérivé serveur du profil ; aucun `p_user_id`/identité client accepté.
- **Frontend** : `ApiClient.countryMetrics()` → `ns_country_metrics`. Sans backend
  disponible, la UI affiche « Activity data unavailable » — **aucune donnée fabriquée**.
- Confidentieléité : agrégation par pays uniquement. Aucun utilisateur individuel,
  aucun username, aucune identité, aucun timestamp individuel.

## Tables préparées (M20, non peuplées)

Pour la future collecte réelle, la migration `0009_community_intelligence_tables.sql`
prépare (sans déploiement) :
- **`country_membership`** — appartenance pays **explicite** d'un utilisateur (privée,
  aucun accès anon). Utilisée pour les agrégats `participants` par pays.
- **`community_propagation`** — propagation communautaire agrégée par pays (SELECT anon
  uniquement ; écritures via un futur RPC `SECURITY DEFINER`). Ne représente jamais un
  graphe d'individus.

Ces tables ne sont **pas** écrites par les RPC actuels ni peuplées ; elles documentent
la préparation backend.

---

## Contrat API backend — RPC futurs (M21, non implémentés sur un vrai Supabase)

Ces spécifications sont des **contrats de préparation**. Aucun déploiement ni
implémentation sur un vrai Supabase. Tous les RPC sont `SECURITY DEFINER` avec
`search_path = public`, contrôle EXECUTE explicite (REVOKE PUBLIC + GRANT
anon/authenticated), et ne renvoient que des **agrégats** (aucun identifiant individuel).

### `ns_country_metrics()`
- **Entrée** : aucune.
- **Sortie** : `{ countries: { "FR": { participants, missionActivity, toolActivity,
  propagation, totalActivity, availability, lastUpdate } } }`.
- **Permissions** : anon/authenticated (lecture publique agrégée).
- **RLS** : lit les tables agrégées + compte les membres par pays (jamais les lignes
  individuelles).
- **Confidentialité** : agrégats par pays ; `null` = non disponible, `0` = mesuré vide.

### `ns_tool_metrics()`
- **Entrée** : aucune (ou `p_country_code` optionnel).
- **Sortie** : `{ countries: { "FR": { toolActivity, toolsUsed } } }` — usage agrégé des
  outils par pays.
- **Permissions** : anon/authenticated (lecture publique agrégée).
- **RLS** : SELECT anon sur `tool_activity`.
- **Confidentialité** : compteurs agrégés uniquement, aucun historique individuel.

### `ns_propagation_metrics()`
- **Entrée** : aucune (ou `p_country_code` / `p_propagation_type`).
- **Sortie** : `{ countries: { "FR": { propagation } } }` — propagation communautaire
  agrégée par pays.
- **Permissions** : anon/authenticated (lecture publique agrégée).
- **RLS** : SELECT anon sur `community_propagation`.
- **Confidentialité** : compteur agrégé par (pays, type) ; jamais un graphe d'individus.

### `ns_set_country(p_token, p_country_code)`
- **Entrée** : token de session + `p_country_code` (ISO-3166 alpha-2).
- **Validation** : token → `ns_validate_session` (autorité serveur) ; code pays
  `^[A-Z]{2}$` + existence dans `countries`. Sinon `invalid_country_code` /
  `unknown_country` / `unauthorized`.
- **Sortie** : `{ ok: true }` (ou erreur classifiée).
- **Permissions** : token-authentifié ; ne modifie que **son propre** profil/`country_membership`.
- **RLS** : `SECURITY DEFINER` avec `search_path = public` ; le user est dérivé serveur
  du token (aucun `p_user_id` client). `country_membership` reste **privé** (aucun
  accès anon) ; seul le RPC y écrit/écrit via `user_profiles.country_code`.
- **Dédoublonnage** : `UNIQUE(user_id)` sur `country_membership` → **un pays actif par
  utilisateur** ; un nouvel `ns_set_country` met à jour (UPSERT), ne crée pas de doublon.
- **Confidentialité** : le pays est un choix explicite ; jamais inféré depuis
  IP/GPS/locale ; jamais exposé publiquement par utilisateur (seuls des agrégats).

> **Aucun de ces RPC n'est déployé.** Ils documentent l'API cible pour la future
> collecte réelle (voir `docs/deployment-guide.md` « Production readiness status »).

> **Aucun de ces RPC n'est déployé.** Ils documentent l'API cible pour la future
> collecte réelle (voir `docs/deployment-guide.md` « Production readiness status »).

---

## Pipeline d'activité communautaire (M24)

### `ns_record_activity(p_token, p_activity_type, p_amount, p_country_code)`
- **Entrée** : token de session ; `p_activity_type` ∈ `mission_completed | tool_used |
  community_action` ; `p_amount` (≥1, ≤1000, défaut 1) ; `p_country_code` (ignoré —
  le pays est résolu **serveur** depuis `country_membership`, jamais du frontend).
- **Sortie** : void.
- **Règles** : authentication requise (identité = session serveur) ; jamais de
  `p_user_id`/identité client ; pays jamais arbitraire ; types/amount validés ;
  payloads malformés rejetés.
- **Effets** : insère dans `community_activity_events` (privé) + met à jour
  `country_activity` / `tool_activity` / `community_propagation` selon le type.
- **Permissions** : `SECURITY DEFINER`, `search_path = public` ; EXECUTE contrôlé
  (migration `0012`) ; anon/authenticated.
- **Confidentialité** : aucun identifiant public, username, IP, GPS, device stocké ou
  retourné ; seuls des agrégats par pays sont exposés.

### Pipeline
```
Community actions → ns_record_activity (SECURITY DEFINER) → community_activity_events
   ↓
Aggregation view (v_country_metrics) → ns_country_metrics() → CountryMetrics → dashboard
```
Le frontend ne traite **jamais** les événements bruts.

---

## Déclencheurs d'activité UI (M25)

Les actions utilisateur sont connectées au pipeline via **`ActivityService`**
(`assets/js/activity-service.js`) → `ApiClient.recordActivity()` →
`ns_record_activity()`. Les composants UI n'appellent **jamais** ApiClient/Supabase
directement pour l'activité.

| Action UI | Type d'activité |
|-----------|-----------------|
| Mission complétée (journey.js) | `mission_completed` +1 |
| Outil ouvert (tools.js) | `tool_used` +1 |
| (futur) Contribution communautaire | `community_action` +1 |

`ActivityService.record(type, amount)` :
- valide le type (`mission_completed` / `tool_used` / `community_action`) et l'amount (≥1, ≤1000) ;
- vérifie l'authentification et la disponibilité du backend ;
- n'envoie que `p_token` + `p_activity_type` + `p_amount` (jamais d'identité/pays/IP/device) ;
- retourne `{ok:false, reason:'offline'|'not_authenticated'|'backend_unavailable'|'invalid_*'}`
  sans fabriquer de succès.

Le backend résout le pays **serveur** depuis `country_membership`. Aucune donnée
individuelle ne quitte le navigateur.

---

## Community actions UI (M26)

Une action communautaire explicite (« Mark contribution completed ») est intégrée
dans `community.html` via **`CommunityActionService`** → `ActivityService` →
`ApiClient.recordActivity()` → `ns_record_activity(..., 'community_action', 1)`.

`CommunityActionService.record(actionType)` (actions : `join_initiative`,
`contribution_done`, `submit_resource`) :
- valide l'action ;
- délègue à `ActivityService.record('community_action', 1)` ;
- retourne un état explicite : `SUCCESS` / `OFFLINE` / `NOT_AUTHENTICATED` /
  `UNAVAILABLE` / `INVALID` ;
- **ne fabrique jamais de succès** et n'affiche « Activity recorded » que si le
  backend confirme.

L'action n'est **jamais** automatique ; elle exige l'intention de l'utilisateur.
Aucune donnée personnelle/pays n'entre dans le payload.

---

## Métrique communityActivity (M27)

Le contrat `ns_country_metrics()` expose désormais `communityActivity` (actions
communautaires agrégées) en plus de `missionActivity`, `toolActivity`, `propagation`,
`totalActivity`. `communityActivity` = `community_propagation` (incrémenté par les
`community_action`). `totalActivity = mission + tool + community`.

Migration `0016` : ajoute la colonne `community_activity` à `v_country_metrics`.
Distinction strictement conservée : `0` = mesuré vide, `null` = non disponible, jamais
confondus.

---

## Durcissement production (M28)

- `Config.getConfigStatus()` : `CONFIGURED` / `NOT_CONFIGURED` /
  `INVALID_CONFIGURATION` — état backend explicite, jamais de fallback.
- `ApiClient` : timeout de requête (12s via AbortController), normalisation
  centralisée des erreurs (OFFLINE/UNCONFIGURED/UNAUTHORIZED/FORBIDDEN/NETWORK_ERROR/
  SERVER_ERROR), aucune fuite d'erreur SQL brute vers l'utilisateur.
- Le dashboard expose `lastUpdate` (timestamp **global**, non individuel) et gère les
  états vide/partiel/indisponible sans confondre `0` et `null`.
