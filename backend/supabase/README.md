# NullSec — Supabase Backend

> **Backend production Supabase.** PostgreSQL géré par Supabase. Les migrations
> SQL et les fonctions RPC définissent le schéma et la logique. Le **backend de
> production est la couche SQL/RPC** — le frontend parle directement aux RPC via
> `assets/js/api-client.js` (clé anon). Aucun service Node intermédiaire requis.

---

## 1. Rôle

Supabase est le **backend final** de NullSec V2. Il fournit :
- PostgreSQL (tables, contraintes, index) ;
- PostgREST (API REST auto-générée) ;
- RPC (fonctions SQL pour l'auth par clé de récupération, la sync, l'activité anonyme) ;
- Auth (basé uniquement sur la **clé de récupération**, pas de mot de passe/email/OAuth).

## 2. Structure

```
backend/supabase/
 ├── migrations/           — migrations SQL (ordre : 0001 → 0002 → 0003 → 0004)
 ├── functions/            — fonctions RPC (auth, sync, activity, country metrics)
 ├── legacy-ts/            — ARCHIVÉ : wrapper TS incohérent (ne pas réactiver)
 └── README.md
```

## 3. Environnement

| Variable | Rôle |
|----------|------|
| `SUPABASE_URL` | URL du projet Supabase. |
| `SUPABASE_ANON_KEY` | Clé publique (frontend). |
| `SUPABASE_SERVICE_KEY` | Clé service (déploiement uniquement, **jamais** en frontend). |
| `NODE_ENV` | `development` / `production`. |

Règles : **jamais committer** les clés. Utiliser `.env` (hors git).

## 4. Migrations (ordre d'application)

Déploiement **cloud-first** (voir `docs/cloud-deployment.md`) : le workflow
`.github/workflows/supabase-deploy.yml` applique les migrations + RPC via la
**Supabase Management API** (curl + `SUPABASE_ACCESS_TOKEN`), sans CLI local ni
`supabase link`. Le script `backend/supabase/scripts/deploy.sh` orchestre le tout.

```bash
# Ordre (0001 → 0016) :
0001_schema.sql          # tables + contraintes + index + seed
0002_rls.sql             # RLS + politiques + REVOKE
0003_rls_functions.sql   # révoque EXECUTE sur ns_create_session
0004_rls_privileges.sql  # contrôle EXPLICITE des EXECUTE (public API only)
0005_country_metrics_privileges.sql  # EXECUTE de ns_country_metrics (M18)
0006_challenge_semantics.sql  # kind events/unique_countries sur challenges (M19)
0007_country_metrics_data.sql  # pays utilisateur + tool_activity (M20)
0008_country_metrics_privileges.sql  # EXECUTE ns_tool_activity/ns_update_profile (M20)
0009_community_intelligence_tables.sql  # tables communautaires préparées (M20)
0010_community_data_model_final.sql  # finalise country_membership + community_propagation (M21)
0011_community_activity_events.sql  # table interne privée d événements (M24)
0012_activity_event_privileges.sql  # EXECUTE ns_record_activity (M24)
0013_country_metrics_view.sql  # vue d agrégation v_country_metrics (M24)
0014_activity_trigger_support.sql  # index agrégation + re-affirmation RLS (M25)
0015_community_action_support.sql  # index type/created + re-affirmation RLS (M26)
0016_activity_metrics_refinement.sql  # community_activity dans la vue (M27)
```

## 5. RPC (API publique, anon + authenticated)

- `ns_register(uuid, text, text, text)` — créer un compte (SHA-256 transport hash).
- `ns_login(uuid, text)` — connexion (vérifie le hash bcrypt).
- `ns_logout(text)` — révoquer une session (`p_token`).
- `ns_validate_session(text)` — valider un token → `user_id` ou NULL (`p_token`).
- `ns_sync_pull(text)` / `ns_sync_push(text, json, json, json)` — sync **token-authentifiée**.
- `ns_activity(text, text, text)` — incrément anonyme agrégé.
- `ns_metrics()` — snapshot d'impact global.
- `ns_country_metrics()` — statistiques agrégées par pays pour la carte Europe (M18→M20).
  `participants` = `COUNT(user_profiles WHERE country_code=...)`, `missionActivity`,
  `toolActivity`, `propagation` = `null`, `totalActivity` = mission + tool.
- `ns_tool_activity(p_token, p_tool_id)` — incrément agrégé d'usage d'outil (authentifié, pays dérivé serveur).
- `ns_update_profile(p_token, p_username, p_country_code)` — met à jour son propre profil (dont pays choisi, ISO-3166 alpha-2).
  Métriques non mesurables (`participants`/`toolActivity`/`propagation`) → `null` (M19).
- Sémantique des défis : `community_challenges.kind` = `events` (compte les événements)
  ou `unique_countries` (compte les pays distincts via `challenge_progress`) — M19.

Helper interne (NON exposé) : `ns_create_session(bigint)`.

## 6. Sécurité

- Auth par clé de récupération : SHA-256 transport → bcrypt salé (pgcrypto).
- Tokens de session hachés SHA-256 côté serveur ; jamais en localStorage.
- Sync token-authentifiée : `user_id` dérivé côté serveur via `ns_validate_session`.
- RLS sur toutes les tables ; tables privées sans accès anon ; agrégats en SELECT anon.
- Contrôle explicite des EXECUTE (migration 0004).

## RPC futurs (M21 — contrat, non déployés)

- `ns_tool_metrics()` — usage d'outils agrégé par pays.
- `ns_propagation_metrics()` — propagation communautaire agrégée par pays/type.
- `ns_set_country(p_token, p_country_code)` — définir son pays (choix explicite, token-authentifié).

Ces RPC documentent l'API cible ; ils ne sont PAS implémentés/déployés.
## Durcissement production (M28)

- Config frontend : `Config.getConfigStatus()` (CONFIGURED / NOT_CONFIGURED / INVALID_CONFIGURATION).
- ApiClient : timeout 12s, normalisation d\'erreurs, aucune fuite DB.
- ActivityService : état DUPLICATE + SUCCESS/OFFLINE/NOT_AUTHENTICATED/UNAVAILABLE/INVALID.
