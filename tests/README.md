# NullSec — Tests (Milestone 16)

Ce dossier contient la suite de tests de la plateforme. **Aucun de ces tests ne
touche un vrai projet Supabase** : ils sont locaux / mockés / statiques. La
validation réelle reste **bloquée** tant qu'aucun projet Supabase n'est fourni.

## Exécution

```bash
bash tests/run-all.sh          # tout : syntaxe + audit SQL + M14..M28
node tests/sql-audit.mjs       # audit statique SQL (migrations, RPC, RLS, EXECUTE)
node tests/m14-tests.mjs       # suite M14 (session/persistence/offline)
node tests/m15-tests.mjs       # suite M15 (auth/sync/cross-user/activity/offline)
node tests/m16-tests.mjs       # suite M16 (politique de stockage)
node tests/m17-tests.mjs       # suite M17 (Supabase-first + préparation Europe)
node tests/m18-tests.mjs       # suite M18 (country metrics + Europe map)
node tests/m19-tests.mjs       # suite M19 (sémantique métriques + challenges)
node tests/m20-tests.mjs       # suite M20 (modèle de données pays + UI)
node tests/m21-tests.mjs       # suite M21 (finalisation modèle communautaire)
node tests/m22-tests.mjs       # suite M22 (country onboarding)
node tests/m24-tests.mjs       # suite M24 (pipeline d activité communautaire)
node tests/m25-tests.mjs       # suite M25 (déclencheurs UI activité)
node tests/m26-tests.mjs       # suite M26 (actions communautaires)
node tests/m27-tests.mjs       # suite M27 (refinement métriques)
node tests/m28-tests.mjs       # suite M28 (durcissement production)
```

## Catégories (transparence)

| Catégorie | Outil | Statut |
|-----------|-------|--------|
| **Local (Node)** | `tests/run-all.sh` | ✅ Exécuté |
| **Mocké (backend simulé)** | `tests/m15-tests.mjs`, `tests/m14-tests.mjs` | ✅ Exécuté |
| **Statique (source/SQL)** | `tests/sql-audit.mjs` + `node --check` | ✅ Exécuté |
| **Réel (Supabase)** | — | ⛔ **Bloqué** (pas de projet) |

## Ce qui est couvert (M16 — politique de stockage)

- **localStorage ne contient pas** : clé de récupération, hash, état
  d'authentification (`ns:auth`), flag de compte (`ns:user:state`), token de session.
- **sessionStorage** ne contient que la session courte approuvée (`ns:session:auth`)
  et la clé de récupération (`ns:session:recovery`).
- **Offline** : `supabaseEnabled=false` → 0 requête backend, **aucun compte local
  fabriqué**, authentification indisponible, UI utilisable.
- **Backend** : les opérations de compte passent par ApiClient/RPC.
- **Statique** : pas de service-role key, pas de token en URL, `fetch` centralisé,
  pas de `p_user_id` côté sync.

## Ce qui est couvert

### `sql-audit.mjs` (statique)
- Ordre des migrations (0001 < 0002 < 0003 < 0004) + transactions `BEGIN/COMMIT`.
- Les 14 tables + PK/FK/CHECK (compteurs ≥ 0)/UNIQUE/index/seed.
- RLS activée sur toutes les tables ; SELECT anon seulement sur les agrégats ;
  REVOKE des écritures.
- `SECURITY DEFINER` + `search_path` sur chaque RPC.
- Aucun `p_user_id` client dans les RPC exposées (isolation cross-user).
- Contrôle EXECUTE explicite (0003/0004) — `ns_create_session` révoqué.
- Les noms d'arguments RPC du frontend (`api-client.js`) correspondent aux signatures SQL.

### `m14-tests.mjs` (local + mock)
- Offline-first, persistance des secrets (sessionStorage vs localStorage),
  restauration (valide/invalide/expirée/injoignable), classification d'erreurs,
  nettoyage non autorisé, régression communauté.

### `m15-tests.mjs` (mock + local + statique)
- Cycle auth (register/login/logout, hash incorrect).
- **Isolation cross-user** (A vs B, jamais de `p_user_id` client).
- Sync (round-trip, token invalide, token jamais en URL/localStorage).
- Activité anonyme (champs identité/token rejetés, oversize, compteurs monotones,
  ApiClient qui filtre les champs par construction).
- Restauration de session (1 validation, mode local/invalide/bloqué).
- Fuite de secrets (pas de service-role en frontend, pas de `console.*`, pas de
  handlers inline, accès storage centralisé).

## Ce qui est BLOQUÉ (nécessite un vrai projet Supabase)

- Exécution des migrations / RPC / RLS sur un projet réel.
- Matrice d'authentification réelle (register/login/session/logout/expiration).
- Isolation inter-utilisateurs réelle (User A vs User B) + PostgREST direct.
- Comportement RLS réel (anon vs authenticated vs RPC).
- Abuse testing réel de `ns_activity` + sync réelle (conflits, oversize).
- Validation navigateur (console/UI).

Voir **`docs/supabase-runtime-validation.md`** pour les étapes exactes à exécuter
côté dashboard/CLI une fois un projet disponible.

## Ce qui est couvert (M17 — Supabase-first + Europe)

- **Storage** : aucune donnée de compte (identity/profile/progress/settings) en
  localStorage ; sessionStorage limité aux clés approuvées ; purge des anciennes clés.
- **Session** : backend indisponible ne s'authentifie pas ; session invalide effacée ;
  aucune résurrection de compte local depuis du cache.
- **Country metrics** : validation (codes valides/invalides, valeurs négatives/NaN/
  Infinity/oversize, champs inconnus, payload malformé/vide), intensité.
- **Map** : lookup FR→France, DE→Germany, ES→Spain ; code inconnu sans crash.
- **Offline** : 0 requête backend, aucune donnée d'activité fabriquée.
