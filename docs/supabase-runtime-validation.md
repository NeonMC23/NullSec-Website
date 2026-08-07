# NullSec — Supabase Runtime Validation

> **Milestone 15.** Document de validation de l'intégration Supabase. Sépare
> **explicitement** ce qui est vérifié localement / avec mocks / statiquement, de ce
> qui est **BLOCKED** par l'absence d'un projet Supabase réel.
>
> ⚠️ **Honestité** : aucun projet Supabase réel n'est disponible dans l'environnement
> de développement (pas de variable d'env, pas de CLI `supabase`/`psql`/`docker`).
> Aucune migration/RPC/RLS n'a été exécutée sur un vrai projet. Rien n'est déclaré
> « validé en production ».

---

## A. VERIFIED LOCALLY (Node, aucun réseau)

Exécution : `bash tests/run-all.sh` (ou `node tests/{sql-audit,m14,m15}-tests.mjs`).

| Validation | Résultat |
|------------|----------|
| Syntaxe JS de tous les modules (`node --check`) | ✅ |
| Offline-first : `supabaseEnabled=false` → **0 requête backend**, auth indisponible, session locale | ✅ |
| `register`/`login` offline → `authentication-unavailable-offline`, 0 réseau | ✅ |
| Clé de récupération en `sessionStorage`, jamais en `localStorage` | ✅ |
| Session/état : `isAuthenticated()` est un flag mémoire (source de vérité) | ✅ |
| Restauration : Supabase désactivé → session nettoyée, 0 réseau | ✅ |
| Métriques communauté offline → données vides/statiques | ✅ |
| Activité anonyme offline → no-op (0 appel backend) | ✅ |

## B. VERIFIED WITH MOCKS (backend simulé dans `tests/`)

Le harnais (`tests/run-tests.mjs`) simule un backend Supabase **stateful** (users,
tokens, sync, activity) ; aucun appel réseau réel.

| Validation | Suite |
|------------|-------|
| Register/login/logout (hash correct/incorrect, identité inconnue) | M15 §1 |
| Session : valide/invalide/expirée/injoignable, 1 validation par chargement | M15 §5, M14 §5 |
| **Isolation cross-user** : A ne lit/écrit que ses données ; jamais de `p_user_id` client | M15 §2 |
| Sync : push/pull round-trip, token invalide rejeté, token jamais en URL/localStorage | M15 §3 |
| Activité anonyme : champs identité/token rejetés, payloads oversize rejetés, compteurs monotones | M15 §4 |
| Nettoyage de session sur refus `UNAUTHORIZED` (sans boucle) | M14 §7 |
| Classification d'erreurs (`OFFLINE/UNCONFIGURED/UNAUTHORIZED/FORBIDDEN/NETWORK_ERROR/SERVER_ERROR`) | M14 §6 |
| Fuite de secrets : pas de clé brute en payload, pas de service-role en frontend, pas de `console.*` | M15 §6 |

## C. VERIFIED AGAINST REAL SUPABASE

**Aucun.** Aucun projet réel accessible.

## D. BLOCKED BY MISSING SUPABASE ACCESS

Ces opérations **ne peuvent pas être exécutées ici** et **ne sont PAS prétendues**
réussies. Elles doivent être menées par un développeur disposant d'un projet Supabase
(voir §4 ci-dessous pour les commandes exactes).

| # | Opération bloquée | Pourquoi |
|---|-------------------|----------|
| 1 | Appliquer `0001` → … → `0016` sur un vrai projet | pas de projet |
| 2 | Exécuter `rpc_auth.sql`, `rpc_sync.sql`, `rpc_activity.sql`, `rpc_country_metrics.sql`, `rpc_tool_activity.sql`, `rpc_profile.sql`, `rpc_activity_event.sql` | pas de projet |
| 3 | Vérifier le schéma réel (tables, PK/FK, contraintes, index, seed) | pas de projet |
| 4 | Vérifier RLS réelle (anon vs authenticated vs RPC) | pas de projet |
| 5 | Vérifier `EXECUTE` réel (`pg_proc.proacl`) | pas de projet |
| 6 | Matrice d'authentification réelle (register/login/session/logout) | pas de projet |
| 7 | Test d'isolation cross-user réel (2 utilisateurs) | pas de projet |
| 8 | Sync réelle (push/pull, conflits `updated_at`, payloads malformés/oversize) | pas de projet |
| 9 | Abuse testing réel de `ns_activity` (SQL injection, répétition) | pas de projet |
| 10 | Métriques réelles (`ns_metrics`, `ns_country_metrics`) | pas de projet |
| 11 | Sémantique des challenges réelle (`kind`, pays uniques) | pas de projet |
| 12 | Validation navigateur (carte Europe, console, UI) | pas de navigateur |

---

## 4. Commandes / étapes exactes pour débloquer (à exécuter par le développeur)

### 4.1 Via la CLI Supabase (recommandé)

```bash
# 1. Authentifier la CLI
supabase login

# 2. Lier le projet (créer d'abord le projet via le dashboard, région UE)
supabase link --project-ref <PROJECT_REF>

# 3. Appliquer les migrations dans l'ordre
supabase db push   # applique backend/supabase/migrations/0001..0016

# 4. Exécuter les fonctions RPC (déclaratives) via SQL Editor ou migration
#    (coller successivement rpc_auth.sql, rpc_sync.sql, rpc_activity.sql,
#     rpc_country_metrics.sql, rpc_tool_activity.sql, rpc_profile.sql, rpc_activity_event.sql)
```

### 4.2 Via le dashboard (SQL Editor)

1. Créer le projet (région UE : `eu-central-1`/`eu-west-1`).
2. SQL Editor → exécuter dans l'ordre : `0001_schema.sql`, `rpc_auth.sql`,
   `rpc_sync.sql`, `rpc_activity.sql`, `rpc_country_metrics.sql`,
   `rpc_tool_activity.sql`, `rpc_profile.sql`, `rpc_activity_event.sql`, `0002_rls.sql`,
   `0003_rls_functions.sql`, `0004_rls_privileges.sql`,
   `0005_country_metrics_privileges.sql`, `0006_challenge_semantics.sql`,
   `0007_country_metrics_data.sql`, `0008_country_metrics_privileges.sql`, `0009_community_intelligence_tables.sql`, `0010_community_data_model_final.sql`, `0011_community_activity_events.sql`, `0012_activity_event_privileges.sql`, `0013_country_metrics_view.sql`, `0014_activity_trigger_support.sql`, `0015_community_action_support.sql`, `0016_activity_metrics_refinement.sql`.
3. **Vérifier RLS** : pour chaque table privée, aucun accès anon ; pour les agrégats,
   SELECT anon autorisé uniquement.
4. **Vérifier les EXECUTE** :
   ```sql
   SELECT proname, proacl FROM pg_proc
   WHERE proname IN ('ns_register','ns_login','ns_logout','ns_validate_session',
     'ns_sync_pull','ns_sync_push','ns_activity','ns_metrics','ns_country_metrics',
     'ns_create_session');
   ```
   `ns_create_session` ne doit avoir **aucun** `proacl` pour anon/authenticated ;
   `ns_country_metrics` doit être granté à anon/authenticated (sans PUBLIC).
5. **Test d'isolation cross-user** : créer 2 utilisateurs, vérifier que A ne peut ni
   lire ni écrire les données de B, et qu'un accès PostgREST direct aux tables privées
   est rejeté (RLS).
6. **Matrice d'authentification** : register/login/logout/session (token valide,
   invalide, expiré, révoqué, malformé, manquant).
7. **Sync** : push/pull, `updated_at` wins, payloads malformés/oversize rejetés, token
   non autorisé rejeté.
8. **Abuse `ns_activity`** : mission invalide, pays inconnu, code malformé, champs
   identité/token, injection SQL, répétition.
9. **Métriques pays** : peupler un jeu de données de test contrôlé, appeler
   `ns_country_metrics()`, vérifier le résultat exact, puis réinitialiser.
10. **Challenges** : vérifier que le défi « Activer N pays » compte les pays distincts
    (`kind='unique_countries'`) et que les défis d'événements comptent les événements.
11. **Brancher le frontend** : injection publique (`__NULLSEC_SUPABASE__`) + flags
    `supabaseEnabled`/`syncEnabled` true, puis re-tester offline (0 requête).

---

## 5. Catégories — résumé

| Catégorie | Statut |
|-----------|--------|
| A. Vérifié localement | ✅ terminé |
| B. Vérifié avec mocks | ✅ terminé |
| C. Vérifié contre un vrai Supabase | ❌ aucun (bloqué) |
| D. Bloqué par l'absence d'accès | ⛔ à exécuter manuellement |

Le repo est **prêt** pour la validation réelle : le code (frontend + SQL) est
cohérent et testé localement/mocké ; il ne manque que l'accès à un projet Supabase.
