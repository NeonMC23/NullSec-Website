# Cloud-First Deployment — Delivery Summary

> **Milestone 28 — cloud-first Supabase deployment.** GitHub est la source de vérité ;
> aucune dépendance au CLI Supabase local ni au `supabase link` local.
>
> **Honesty** : aucun déploiement réel n'a été exécuté (pas de projet Supabase
> accessible, pas de secrets réels). Ce livrable prépare le workflow ; le premier
> déploiement reste BLOCKED jusqu'à la configuration de secrets GitHub sur un projet
> réel. Aucune donnée de production, aucun utilisateur réel.

---

## Ce qui a été livré

### 1. GitHub Actions workflow
`.github/workflows/supabase-deploy.yml`
- Déclenché sur `push` vers `main` (chemin `backend/supabase/**`).
- `environment: production` + `if: github.ref == 'refs/heads/main'`.
- Utilise la **Supabase Management API** (curl + access token) — **pas de CLI**, pas
  de `supabase link`, pas de machine locale.
- Secrets `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF` référencés uniquement via
  `${{ secrets.* }}` — jamais dans les logs.
- Échoue (fail-safe) si une migration/RPC échoue.

### 2. Méthode de déploiement
Management API SQL query endpoint (`POST /v1/projects/{ref}/database/query`) — la
méthode la plus fiable sans dépendance CLI/linking local (le CLI échoue localement).

### 3. Scripts
- `backend/supabase/scripts/apply-sql.sh` : applique un fichier SQL via la Management
  API, n'écho jamais le token, échoue (set -e) sur erreur.
- `backend/supabase/scripts/deploy.sh` : orchestre migrations (0001→0016) puis RPC
  (ordre stable : auth → sync → activity → tool_activity → profile → activity_event →
  country_metrics).

### 4. Audit migrations (0001 → 0016)
- 16 migrations, toutes `BEGIN;…COMMIT;` (transactionnelles), ordre lexicographique.
- Aucun `DROP TABLE` destructif ; usage de `IF NOT EXISTS`.
- RLS activée sur toutes les tables sensibles ; RPC `SECURITY DEFINER` avec
  `search_path = public` ; grants explicites ; `community_activity_events` reste privé.
- Aucun `service_role`/secret exposé.

### 5. Séparation d'environnement
- Frontend (GitHub Pages) : clé **publique** anon injectée au build via
  `window.__NULLSEC_SUPABASE__` ; aucun secret.
- Backend (Supabase) : secrets uniquement dans GitHub Secrets + dashboard Supabase.
- CI : access token + project ref via GitHub Secrets.

### 6. Documentation
- `docs/cloud-deployment.md` : architecture, rôles, secrets requis, flux, rollback,
  honnêteté de statut.

---

## Tests

| Suite | Type | Résultat |
|-------|------|----------|
| `tests/sql-audit.mjs` | STATIC | ✅ 218/218 |
| `tests/m14`…`m28-tests.mjs` | LOCAL/MOCKED/STATIC | ✅ (M28: 72/72) |
| `tests/m28-deploy-tests.mjs` | STATIC | ✅ 23/23 |
| `bash -n` (apply-sql.sh, deploy.sh) | STATIC | ✅ |
| `node --check` (tous JS) | STATIC | ✅ |

**Total : 748 assertions vertes.**

## Bloqué

- Déploiement réel (pas de projet/secret accessibles).
- Exécution RPC réelle, RLS runtime, navigateur, métriques de production.

## Récapitulatif

- **Créés** : `.github/workflows/supabase-deploy.yml`, `backend/supabase/scripts/apply-sql.sh`,
  `backend/supabase/scripts/deploy.sh`, `docs/cloud-deployment.md`,
  `tests/m28-deploy-tests.mjs`.
- **Modifiés** : `backend/supabase/README.md`, `docs/deployment-guide.md`,
  `tests/run-all.sh`, `tests/README.md`.
