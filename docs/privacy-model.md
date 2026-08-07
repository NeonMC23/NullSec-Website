# NullSec — Privacy Model

> **Milestone 21.** Modèle de confidentialité de la plateforme. Le navigateur est un
> client ; **Supabase est la source de vérité unique** des comptes et des données
> utilisateur persistantes. Aucune donnée de compte n'est persistée en localStorage.

---

## 1. Principes

- **Supabase-first** : toutes les données de compte (identité, profil, réglages,
  progression) appartiennent au backend Supabase.
- **Browser = client** : pas de « compte local », pas de base de données locale.
- **Agrégation uniquement** pour les métriques communautaires.
- **Aucun suivi individuel** : pas d'IP, pas de GPS, pas de fingerprint, pas de
  timeline individuelle.

## 2. Ce qui est COLLECTÉ

| Donnée | Où | Pourquoi |
|--------|-----|----------|
| Pays choisi par l'utilisateur (`country_code`, ISO-3166 alpha-2) | `user_profiles` / `country_membership` | Agrégats de participants par pays. Choix **explicite**, jamais inféré depuis IP/GPS/locale/fuseau. |
| Activité agrégée des missions | `mission_activity` | Compteurs anonymes par pays/mission. |
| Usage agrégé des outils | `tool_activity` | Compteurs anonymes par pays/outil. |
| Propagation communautaire agrégée | `community_propagation` | Compteurs anonymes par pays/type. |

## 3. Ce qui n'est JAMAIS COLLECTÉ / EXPOSÉ

- `user_id` / `identity_id` / `username` / `email` publiquement ;
- clé de récupération, session, token ;
- IP, GPS, identifiant d'appareil, fuseau ;
- historique d'activité individuel, timestamps individuels ;
- graphe social « X a invité Y » ;
- pas d'analytics, pas de telemetry, pas de fingerprinting.

## 4. Règles d'agrégation

- Un pays est un **choix explicite** de l'utilisateur ; jamais déduit de la localisation.
- `participants` = nombre de **membres distincts** avec ce pays (compté une fois).
- `missionActivity` / `toolActivity` = **sommes agrégées** par pays.
- `propagation` = compteur agrégé par type ; **jamais** un graphe d'individus.
- Distinction stricte : `0` = mesuré et vide ; `null` = non disponible. Ne jamais
  confondre.

## 5. Modèle de données communautaire (M21)

Voir `docs/community-api.md` (contrats RPC) et `backend/supabase/migrations/0010_community_data_model_final.sql`.

### `country_membership`
- `id`, `user_id`, `country_code`, `created_at`, `updated_at`.
- **Un pays actif par utilisateur** (`UNIQUE(user_id)`).
- ISO-3166 alpha-2. **Privé** : aucun accès anon ; pas de lookup public user→pays.
- Seules des requêtes **agrégées** exposent des statistiques par pays.

### `tool_activity`
- `id`, `tool_id`, `country_code`, `usage_count`, `updated_at`.
- Agrégat uniquement ; aucun historique individuel. Indexé pour le classement pays.

### `community_propagation`
- `country_code`, `propagation_type`, `count`, `updated_at`.
- Compteur agrégé par (pays, type) ; `UNIQUE(country_code, propagation_type)`.
- `propagation_count >= 0`. SELECT anon uniquement.

## 6. Exigences backend futures

- Toutes les écritures passent par des RPC **SECURITY DEFINER** token-authentifiés
  (pays dérivé serveur, jamais `p_user_id` client).
- RLS : tables privées sans accès anon ; tables agrégées en SELECT anon uniquement.
- Aucun endpoint public ne renvoie une association user→pays.
- Contrôle EXECUTE explicite (pas de défaut PUBLIC).

## 7. Offline

- Supabase désactivé → **0 requête**, état « Activity data unavailable », aucun compte
  local fabriqué. Seul l'UI hors-ligne (articles, outils, missions statiques, thème)
  reste utilisable.

---

## First Community Member Experience (M22)

- **Création de compte** : identité + clé de récupération → Supabase. Aucune donnée
  de compte en localStorage.
- **Sélection de pays (optionnelle)** : choix manuel via `CountryService` /
  `CountryRepository` → `ApiClient`. Jamais inféré depuis IP/GPS/locale/appareil.
- **Aggrégation** : le pays alimente `participants` (membres distincts).
- **Garanties** : aucune association user→pays publique ; aucun endpoint ne renvoie
  un pays par utilisateur ; seule une **agrégation** par pays est exposée.
- **Offline** : pas d'appel backend, pas de réussite fabriquée, le choix de pays n'est
  pas persisté localement.

---

## Pipeline d'activité communautaire (M24)

- `community_activity_events` est une table **interne et privée** : elle stocke
  uniquement `(country_code, activity_type, amount, created_at)`.
- **Jamais** d'identifiant utilisateur public, username, IP, GPS, device, ni
  d'historique d'activité individuel exposé.
- Le pays est résolu **serveur** depuis `country_membership` (choix explicite de
  l'utilisateur) — jamais inféré et jamais fourni par le frontend de façon fiable.
- Seule l'**agrégation par pays** (`v_country_metrics` → `ns_country_metrics`) est
  publique. Le frontend ne voit jamais les événements bruts.
- `0` = mesuré et vide ; `null` = non disponible (jamais confondus).

---

## Déclencheurs d'activité UI (M25)

- Les actions utilisateur (mission complétée, outil ouvert) déclenchent
  `ActivityService.record()` → `ApiClient.recordActivity()` → `ns_record_activity()`.
- Le payload envoyé contient **uniquement** `p_token` + `p_activity_type` + `p_amount`.
- **Jamais** : `user_id`, `identity_id`, `username`, `country_code`, IP, device.
- Le pays est résolu **serveur** depuis `country_membership` (choix explicite).
- Offline / backend indisponible → échec honnête (`offline` / `backend_unavailable`),
  jamais de succès fabriqué, aucune donnée locale corrompue.
- Seuls des agrégats par pays sont produits ; aucun historique individuel exposé.

---

## Community actions UI (M26)

- Une action communautaire explicite est déclenchée par l'utilisateur via
  `CommunityActionService` (jamais automatique).
- `CommunityActionService.record(action)` → `ActivityService.record('community_action',
  1)` → `ApiClient.recordActivity()` → `ns_record_activity()`.
- Payload anonyme : `p_token` + `p_activity_type` + `p_amount` uniquement. Jamais
  `user_id`, `identity_id`, `username`, `email`, `country_code`, IP, GPS, device.
- États explicites (SUCCESS/OFFLINE/NOT_AUTHENTICATED/UNAVAILABLE/INVALID) — jamais de
  succès fabriqué.
- Aucun suivi de clics, temps de visite, historique de navigation, comportement
  personnel ou device. Seuls des agrégats anonymes par pays sont produits.

---

## Aggregation communautaire (M27)

- `community_activity_events` reste **privée** (jamais lue par le frontend).
- `ns_country_metrics()` expose uniquement des agrégats : mission / tool /
  community / propagation / total.
- Le frontend (`CountryMetrics`) ne consomme que ces agrégats ; il ne voit jamais
  d'événements bruts, de timestamps individuels, d'identité ou de mapping user→pays.
- `0` = mesuré vide ; `null` = non disponible (jamais convertis).

---

## Durcissement production (M28)

- Configuration explicite (`CONFIGURED`/`NOT_CONFIGURED`/`INVALID_CONFIGURATION`) —
  aucun secret, aucune URL fallback, aucune clé service en frontend.
- `ApiClient` normalise les erreurs sans fuiter de détails SQL/DB à l'utilisateur ;
  timeout de requête ; aucun token/log secret en console.
- Protection anti-doublon d'activité (état `DUPLICATE`) — client-side best-effort,
  backend autoritaire. Aucune file persistante, aucun tracking.
- `lastUpdate` = timestamp global (non individuel), jamais lié à un utilisateur.
