# NullSec — Supabase Architecture

> **Backend production Supabase (Milestone 13).** Remplace le scaffold Express par
> Supabase (PostgreSQL + PostgREST + RPC). Offline-first préservé.

---

## 1. Rôle

Supabase est le **backend final** de NullSec V2 :
- **PostgreSQL** : tables, contraintes, index (migrations `backend/supabase/migrations/`).
- **PostgREST** : API REST auto-générée pour les lectures agrégées publiques.
- **RPC** : fonctions SQL sécurisées pour l'auth (clé de récupération), la sync et
  l'activité anonyme (`backend/supabase/functions/`).
- **Auth** : uniquement par **clé de récupération** — pas de mot de passe, email, OAuth.

## 2. Flux

```
Frontend (vanilla JS)
   │
   ▼
ApiClient (api-client.js) — seule couche de fetch backend
   │  (RPC + PostgREST via SUPABASE_URL/ANON_KEY)
   ▼
Supabase (PostgREST + RPC)
   │
   ▼
PostgreSQL
```

## 3. Environnement

| Variable | Où | Rôle |
|----------|----|------|
| `SUPABASE_URL` | frontend + backend | URL du projet. |
| `SUPABASE_ANON_KEY` | frontend + backend | Clé publique (lecture publique + RPC). |
| `SUPABASE_SERVICE_KEY` | **backend uniquement** | Clé service (opérations privilégiées). |
| `NODE_ENV` | backend | development / production. |

Règles : **jamais committer** les clés (`.gitignore` couvre `backend/supabase/.env`).

## 4. Migration

Le schéma consolide les migrations 0001–0004 en `backend/supabase/migrations/0001_schema.sql`.
Appliquer via `supabase db push`.

## 5. RPC

- `ns_register` / `ns_login` / `ns_logout` / `ns_validate_session` — auth par clé.
- `ns_sync_pull` / `ns_sync_push` — sync (`updated_at` wins).
- `ns_activity` — incrément anonyme.
- `ns_metrics` — snapshot d'impact global.
- `ns_country_metrics` (M18→M20) — statistiques agrégées par pays pour la carte Europe.
- `ns_tool_activity(p_token, p_tool_id)` (M20) — incrément d'usage d'outil (authentifié, pays dérivé serveur).
- `ns_update_profile(p_token, p_username, p_country_code)` (M20) — mise à jour de son propre profil (dont pays choisi).
- `ns_record_activity(p_token, p_activity_type, p_amount)` (M24) — enregistrement sécurisé d'une action communautaire (pays résolu serveur depuis country_membership).

## 6. Offline-first

- `Config.supabaseEnabled` par défaut `false` → **0 requête réseau**.
- `ApiClient` rejette `'offline'` sans fetch quand Supabase est désactivé/indisponible.
- Tous les services ont des fallbacks locaux (métriques vides, état statique, etc.).

---

## 7. Row Level Security (M13.1)

RLS est activée sur **toutes** les tables (`0002_rls.sql`) :

- **Tables privées** (`users`, `recovery_credentials`, `sessions`, `user_profiles`,
  `user_settings`, `user_progress`, `schema_migrations`) : **aucun accès anon** — aucun
  SELECT/INSERT/UPDATE/DELETE direct. Accessibles uniquement via RPC `SECURITY DEFINER`.
- **Tables agrégées publiques** (`countries`, `mission_activity`, `country_activity`,
  `region_activity`, `anonymous_global_stats`, `community_challenges`,
  `challenge_progress`) : **SELECT anon autorisé** (lecture publique agrégée), mais
  **aucun INSERT/UPDATE/DELETE anon** — les écritures passent par `ns_activity`.
- `REVOKE` supplémentaire pour bloquer anon/authenticated sur les tables sensibles.
- La **service-role key** contourne RLS (admin) mais n'est **jamais** dans le frontend.

Le navigateur utilise la clé **anon**, donc la base ne s'appuie pas sur son secret.

## 8. Hachage de la clé de récupération

- Le client envoie un **SHA-256** de la clé (`RecoveryKey.hashForTransport`).
- Le serveur stocke un **hash bcrypt salé** (`crypt(gen_salt('bf'))` via pgcrypto) de ce
  SHA-256 — jamais la clé brute, jamais le SHA-256 en clair.
- **Déviation documentée** : PostgreSQL ne fournit pas Argon2 nativement ; bcrypt
  (pgcrypto) est le KDF intégré le plus fort disponible.

## 9. Restauration de session (M14)

- Le token de session est conservé en **mémoire** (`Sync`) et, pour la restauration,
  dans **sessionStorage** (`SessionStore`) — **jamais** en localStorage.
- La **clé de récupération** est elle aussi déplacée en **sessionStorage** (M14),
  hors de localStorage (secret long-vivant).
- `SessionService.restore()` (un seul passage par chargement) : Supabase désactivé →
  0 requête + mode local ; session stockée → `ns_validate_session` (autorité serveur) ;
  invalide → effacement + mode local ; backend injoignable → mode local + session
  conservée pour réessai (statut `unavailable`).
- `ApiClient` classifie les erreurs (`OFFLINE`, `UNCONFIGURED`, `UNAUTHORIZED`,
  `FORBIDDEN`, `NETWORK_ERROR`, `SERVER_ERROR`) ; tout refus `UNAUTHORIZED` déclenche
  un nettoyage de session sans boucle de validation.
- `Auth.isAuthenticated()` est un flag mémoire, jamais restauré depuis localStorage.
- Aucune requête réseau n'est forcée quand Supabase est désactivé.

---

## 10. Privilèges EXECUTE (M15)

PostgreSQL octroie `EXECUTE` aux fonctions par défaut à PUBLIC. Pour ne pas s'appuyer
sur ce défaut :

- `0003_rls_functions.sql` révoque `EXECUTE` sur le helper interne `ns_create_session`.
- `0004_rls_privileges.sql` **contrôle explicitement** les EXECUTE : `REVOKE ... FROM
  PUBLIC` + `GRANT ... TO anon, authenticated` sur l'API publique (`ns_register`,
  `ns_login`, `ns_logout`, `ns_validate_session`, `ns_sync_pull`, `ns_sync_push`,
  `ns_activity`, `ns_metrics`), et confirme la révocation de `ns_create_session`.
- `0005_country_metrics_privileges.sql` (M18) : contrôle EXECUTE de
  `ns_country_metrics` (REVOKE PUBLIC + GRANT anon/authenticated).
- `0006_challenge_semantics.sql` (M19) : colonne `community_challenges.kind`
  (`events` | `unique_countries`). Corrige la sémantique des défis : « Activer N
  pays » compte les **pays distincts** (via `challenge_progress`), pas les événements.
- `0007_country_metrics_data.sql` (M20) : `user_profiles.country_code` + table agrégée
  `tool_activity` (RLS SELECT anon uniquement).
- `0008_country_metrics_privileges.sql` (M20) : EXECUTE de `ns_tool_activity` /
  `ns_update_profile` (REVOKE PUBLIC + GRANT anon/authenticated).
- `0009_community_intelligence_tables.sql` (M20) : tables **préparées**
  `country_membership` (privée) + `community_propagation` (agrégat public SELECT anon).
- `0010_community_data_model_final.sql` (M21) : finalise `country_membership`

- `0011_community_activity_events.sql` (M24) : table interne privée des événements
  d'activité communautaire.
- `0012_activity_event_privileges.sql` (M24) : EXECUTE de `ns_record_activity`.
- `0013_country_metrics_view.sql` (M24) : vue d'agrégation `v_country_metrics`.

- `0014_activity_trigger_support.sql` (M25) : index d\'agrégation country_membership + re-affirmation RLS/vue.

- `0015_community_action_support.sql` (M26) : index (activity_type, created_at) + re-affirmation RLS.

- `0016_activity_metrics_refinement.sql` (M27) : ajoute `community_activity` à la vue d\'agrégation.
  (id, updated_at, un pays actif/user) et `community_propagation` (propagation_type).

## 11. Wrapper TS archivé

`backend/supabase/src/` (wrapper TypeScript de référence) a été **archivé** dans
`backend/supabase/legacy-ts/` en M15 : il était incohérent avec les signatures RPC
réelles et, pour la sync, passait un `p_user_id` choisi par le client. Le backend de
production est la couche SQL/RPC ; le frontend (vanilla) appelle directement les RPC.

---

## 12. Politique de stockage (M16)

« Le navigateur est un client, pas une seconde base de données. »

- **Source de vérité des données de compte** (profil/réglages/progression/identité de
  compte) : **Supabase**.
- **localStorage** : uniquement `ns:theme` + marqueur de migration ; **jamais** de
  donnée de compte, de secret, d'état d'authentification, de token, de clé de
  récupération ou de flag de compte « local ». Les anciennes clés compte sont purgées
  au chargement.
- **Mémoire de session** : identity/profile/progress/settings (données de compte non
  persistées), flag d'authentification (Auth), token (Sync), vue (UserState).
- **sessionStorage** : session courte (représentation temporaire d'une session
  Supabase authentifiée) + clé de récupération.
- Hors-ligne : l'UI reste utilisable (contenu statique, filtres, rendu), mais aucun
  compte local n'est fabriqué ; l'authentification signale que le backend est
  indisponible.

## Durcissement production (M28)

- `Config.getConfigStatus()` explicite (CONFIGURED / NOT_CONFIGURED / INVALID_CONFIGURATION).
- `ApiClient` : timeout 12s, normalisation d'erreurs centralisée, aucune fuite d'erreur
  DB/secret.
- `ActivityService` : état `DUPLICATE` (anti-doublon), SUCCESS/OFFLINE/NOT_AUTHENTICATED/
  UNAVAILABLE/INVALID.
- Dashboard : `lastUpdate` global + états vide/partiel/indisponible sans confondre 0/null.
