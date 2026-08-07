# NullSec — Database Schema

> PostgreSQL géré par **Supabase** (M13/M13.1). Le schéma consolidé est défini dans
> `backend/supabase/migrations/0001_schema.sql`. **RLS** activée dans
> `backend/supabase/migrations/0002_rls.sql` : tables privées sans accès anon, tables
> agrégées en lecture publique seule, écritures via RPC `SECURITY DEFINER`.
> Privilèges EXECUTE explicites dans `0003_rls_functions.sql` et
> `0004_rls_privileges.sql` (voir `docs/supabase-runtime-validation.md`).

> **Schéma PostgreSQL de la plateforme NullSec V2 (M7).** Le runner Express
> historique (`backend/migrations/0001_init.sql`, `npm run migrate`) est **archivé**
> et non utilisé — les migrations Supabase s'appliquent via le dashboard / SQL Editor
> ou la CLI (`supabase db push`).

---

## 1. `users`

Comptes d'identité réels.

| Colonne | Type | Notes |
|---------|------|-------|
| `id` | BIGSERIAL PK | |
| `identity_id` | UUID UNIQUE | UUID d'identité locale. |
| `status` | TEXT | `active` \| `disabled`. |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

## 2. `recovery_credentials`

Données d'authentification par clé de récupération — **jamais la clé en clair**.

| Colonne | Type | Notes |
|---------|------|-------|
| `id` | BIGSERIAL PK | |
| `user_id` | BIGINT FK → users | |
| `recovery_hash` | TEXT | Hash argon2id de la clé. |
| `created_at` | TIMESTAMPTZ | |
| `last_used_at` | TIMESTAMPTZ | |

## 3. `user_profiles`

Informations de profil synchronisées.

| Colonne | Type | Notes |
|---------|------|-------|
| `user_id` | BIGINT PK FK → users | |
| `username` | TEXT | Défaut `'Anonymous'`. |
| `avatar_seed` | TEXT | Graine d'avatar déterministe. |
| `country_code` | TEXT (M20) | Pays **choisi explicitement** par l'utilisateur (ISO-3166 alpha-2, `CHECK ^[A-Z]{2}$`). Jamais inféré depuis IP/GPS/locale. Utilisé pour les agrégats de participants. |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

## 4. `user_settings`

Préférences synchronisables.

| Colonne | Type | Notes |
|---------|------|-------|
| `user_id` | BIGINT PK FK → users | |
| `settings_json` | JSONB | Réglages (schéma `ns:settings`). |
| `updated_at` | TIMESTAMPTZ | |

## 5. `user_progress`

Futur sync de la progression.

| Colonne | Type | Notes |
|---------|------|-------|
| `user_id` | BIGINT PK FK → users | |
| `progress_json` | JSONB | Progression (schéma `ns:progress`). |
| `updated_at` | TIMESTAMPTZ | |

## 6. `sessions`

Sessions basées sur token (stateless).

| Colonne | Type | Notes |
|---------|------|-------|
| `id` | BIGSERIAL PK | |
| `user_id` | BIGINT FK → users | |
| `token_hash` | TEXT | SHA-256 du token — jamais le token en clair. |
| `created_at` | TIMESTAMPTZ | |
| `expires_at` | TIMESTAMPTZ | Expiration. |
| `revoked` | BOOLEAN | Révocation. |

## 7. Index

- `idx_sessions_token_hash`, `idx_sessions_user_id`, `idx_recovery_user_id`.

## 8. Migrations (Supabase — ordre d'application)

- `0001_schema.sql` — tables + contraintes + index + seed.
- `0002_rls.sql` — RLS + politiques + REVOKE.
- `0003_rls_functions.sql` — révoque EXECUTE sur `ns_create_session`.
- `0004_rls_privileges.sql` — contrôle EXECUTE explicite (public API only).
- `0005_country_metrics_privileges.sql` — EXECUTE de `ns_country_metrics` (M18).
- `0006_challenge_semantics.sql` — `community_challenges.kind` (M19).
- `0007_country_metrics_data.sql` — `user_profiles.country_code` + table `tool_activity` (M20).
- `0008_country_metrics_privileges.sql` — EXECUTE de `ns_tool_activity` / `ns_update_profile` (M20).
- `0009_community_intelligence_tables.sql` — tables **préparées** `country_membership` + `community_propagation` (M20, préparation, non peuplées).
- `0010_community_data_model_final.sql` — finalise `country_membership` (id, updated_at, un pays actif/user) + `community_propagation` (propagation_type) (M21).

- `0011_community_activity_events.sql` — table interne privée `community_activity_events` (M24).
- `0012_activity_event_privileges.sql` — EXECUTE de `ns_record_activity` (M24).
- `0013_country_metrics_view.sql` — vue d'agrégation `v_country_metrics` (M24).

Appliquer dans cet ordre via SQL Editor / CLI (`supabase db push`). Le runner Express
historique (`src/database/migrate.ts`) est archivé et non utilisé.

---


## 9. Tables communautaires (migration 0002 — M10)

### `countries`
Référence des pays avec disponibilité des missions.
| Colonne | Type | Notes |
|---------|------|-------|
| `id` | BIGSERIAL PK | |
| `code` | TEXT UNIQUE | ISO 3166-1 alpha-2 (`FR`…). |
| `name` | TEXT | Nom du pays. |
| `region` | TEXT | Région (`Europe`). |
| `active` | BOOLEAN | Pays actif. |
| `missions_available` | INTEGER | Nb de missions disponibles. |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |
| `idx_countries_active` | | index sur `active`. |

### `mission_activity`
Comptes de complétion agrégés par mission/pays.
| Colonne | Type | Notes |
|---------|------|-------|
| `id` | BIGSERIAL PK | |
| `mission_id` | TEXT | |
| `country_code` | TEXT FK → countries | |
| `completed_count` | BIGINT | Nb agrégé anonyme. |
| `last_activity_at` | TIMESTAMPTZ | Dernière activité. |
| `updated_at` | TIMESTAMPTZ | |
| `UNIQUE(country_code, mission_id)` | | |
| Index | | `country_code`, `mission_id`, `updated_at`. |

### `anonymous_global_stats`
Statistiques globales anonymes (une seule ligne, `id=1`).
| Colonne | Type | Notes |
|---------|------|-------|
| `id` | SMALLINT PK (CHECK id=1) | |
| `active_users` | BIGINT | Agrégé. |
| `completed_missions` | BIGINT | Agrégé. |
| `countries_active` | INTEGER | |
| `updated_at` | TIMESTAMPTZ | |

> Aucune donnée personnelle, aucune localisation précise, aucun IP/fingerprint.
> Incréments anonymes uniquement via `POST /api/community/activity`.

---

## 10. Tables challenges (migration 0003 — M11)

### `community_challenges`
Défis globaux anonymes.
| Colonne | Type | Notes |
|---------|------|-------|
| `id` | BIGSERIAL PK | |
| `title` | TEXT | |
| `description` | TEXT | |
| `target_value` | BIGINT | Objectif. |
| `current_value` | BIGINT | Compteur agrégé anonyme. |
| `status` | TEXT | `active` / `completed`. |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### `challenge_progress`
Contribution agrégée par défi/pays.
| Colonne | Type | Notes |
|---------|------|-------|
| `id` | BIGSERIAL PK | |
| `challenge_id` | BIGINT FK → community_challenges | |
| `country_code` | TEXT | |
| `contribution_count` | BIGINT | Compteur anonyme. |
| `updated_at` | TIMESTAMPTZ | |
| `UNIQUE(challenge_id, country_code)` | | |

> Aucun historique de contribution utilisateur — seulement des compteurs agrégés.

---

## 11. Tables impact communautaire (migration 0004 — M12)

### `country_activity`
Compteurs agrégés par pays.
| Colonne | Type | Notes |
|---------|------|-------|
| `id` | BIGSERIAL PK | |
| `country_code` | TEXT UNIQUE | |
| `completed_count` | BIGINT CHECK >= 0 | |
| `updated_at` | TIMESTAMPTZ | |

### `region_activity`
Compteurs agrégés par région.
| Colonne | Type | Notes |
|---------|------|-------|
| `id` | BIGSERIAL PK | |
| `region` | TEXT UNIQUE | |
| `completed_count` | BIGINT CHECK >= 0 | |
| `updated_at` | TIMESTAMPTZ | |

### Extensions (M12)
- `mission_activity` : contrainte `completed_count >= 0`.
- `challenge_progress` : colonne `completion_percent NUMERIC(5,2)`.
- `anonymous_global_stats` : colonnes `total_completed`, `active_regions`.

> Contraintes : pas de compteurs négatifs, combinaison unique (pays/mission),
> uniquement des compteurs agrégés anonymes.

---

## Europe country metrics (M18→M20)

La carte Europe agrège par pays via le RPC **`ns_country_metrics()`**
(`backend/supabase/functions/rpc_country_metrics.sql`) :
- `participants` = `COUNT(*) FROM user_profiles WHERE country_code = c.code` (M20) ;
- `missionActivity` = `SUM(mission_activity.completed_count)` ;
- `toolActivity` = `SUM(tool_activity.activity_count)` (M20) ;
- `propagation` = `null` (non modélisé) ;
- `totalActivity` = `missionActivity + toolActivity` (agrégat déterministe, M20).

Le contrat frontend et la normalisation sont définis dans **`docs/europe-activity.md`** ;
`ApiClient.countryMetrics()` appelle ce RPC. Les migrations `0005`/`0008` contrôlent
l'EXECUTE. Aucune donnée fausse n'est générée : les valeurs mesurables dérivent des
compteurs réels ; `propagation` = `null`.

### `tool_activity` (M20)
Compteur agrégé d'usage des outils par pays (aucun historique individuel).
| Colonne | Type | Notes |
|---------|------|-------|
| `id` | BIGSERIAL PK | |
| `tool_id` | TEXT | Identifiant d'outil. |
| `country_code` | TEXT FK → countries | Pays (dérivé serveur du profil). |
| `activity_count` | BIGINT CHECK >= 0 | Compteur agrégé anonyme. |
| `updated_at` | TIMESTAMPTZ | |
| `UNIQUE(country_code, tool_id)` | | |
| RLS | | SELECT anon uniquement ; écritures via `ns_tool_activity` |

### `country_membership` (M20 — table préparée, non peuplée)
Appartenance pays **explicite** d'un utilisateur (alternative/renfort de
`user_profiles.country_code`). Jamais inférée depuis IP/GPS/locale.
| Colonne | Type | Notes |
|---------|------|-------|
| `user_id` | BIGINT PK FK → users | |
| `country_code` | TEXT FK → countries | ISO-3166 alpha-2 (`CHECK ^[A-Z]{2}$`) |
| `created_at` | TIMESTAMPTZ | |
| RLS | | privée — aucun accès anon/authenticated direct |

### `country_membership` (M21/M22 — finalisé)

> **M22** : la sélection de pays utilisateur (frontend) écrit dans cette table via
> `ns_set_country` / `ApiClient.updateProfile` ; `UNIQUE(user_id)` garantit **un pays
> actif par utilisateur**.
| Colonne | Type | Notes |
|---------|------|-------|
| `id` | BIGSERIAL PK | Surrogate key |
| `user_id` | BIGINT UNIQUE FK → users | **Un pays actif par utilisateur** |
| `country_code` | TEXT FK → countries | ISO-3166 alpha-2 |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |
| RLS | | privée — aucun accès anon/authenticated direct ; pas de lookup public user→pays |

### `community_propagation` (M20 — table préparée, non peuplée)
Propagation communautaire agrégée par pays (jamais un graphe d'individus).
| Colonne | Type | Notes |
|---------|------|-------|
| `id` | BIGSERIAL PK | |
| `country_code` | TEXT FK → countries | |
| `propagation_count` | BIGINT CHECK >= 0 | Compteur agrégé anonyme |
| `updated_at` | TIMESTAMPTZ | |
| `UNIQUE(country_code)` | | |
| RLS | | SELECT anon uniquement ; écritures via RPC `SECURITY DEFINER` futur |

Politique de stockage (M17/M20) : les données de compte (identity/profile/progress/
settings) sont **mémoire de session** côté client et **jamais** persistées en
localStorage ; la source de vérité est **Supabase**.

### `community_activity_events` (M24 — interne, privée, non peuplée)
| Colonne | Type | Notes |
|---------|------|-------|
| `id` | BIGSERIAL PK | |
| `country_code` | TEXT FK → countries | Pays résolu **serveur** depuis `country_membership` |
| `activity_type` | TEXT | `mission_completed` \| `tool_used` \| `community_action` (CHECK) |
| `amount` | BIGINT CHECK >= 0 | Quantité de l'action |
| `created_at` | TIMESTAMPTZ | |
| RLS | | **privée** — aucun accès anon/authenticated ; écriture via `ns_record_activity` |

> Aucun identifiant utilisateur, username, IP, GPS, device. Jamais exposé en brut ;
> seule l'agrégation (`v_country_metrics` / `ns_country_metrics`) est publique.

### `v_country_metrics` (M24 — vue d'agrégation)
Agrège par pays : `participants`, `mission_activity`, `tool_activity`, `propagation`,
`total_activity`. `REVOKE SELECT FROM anon, authenticated` — lue uniquement via
`ns_country_metrics()` (SECURITY DEFINER).
