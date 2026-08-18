# NullSec — Cloud-First Deployment

> **Cloud-first.** GitHub est la source de vérité du déploiement backend.
> Aucune dépendance au CLI Supabase local ni au `supabase link` local. Le
> frontend reste hébergé sur **GitHub Pages** (statique). Supabase reste le
> backend.

---

## 1. Architecture

```
GitHub (source of truth)
  ├── Frontend: static site → GitHub Pages (public anon key injected at build)
  └── Backend:  .github/workflows/supabase-deploy.yml
                     │  (on push to main, path backend/supabase/**)
                     ▼
              Supabase Management API  (no local CLI / no local link)
                     │
                     ▼
              Supabase project "NullSec Community" (region West EU — Paris)
                     │
                     └── deploy.sh: migrations (0001→0019) + RPC + RPC hardening
                                     + post-deploy verification
```

- **GitHub Pages** : héberge le frontend statique (HTML/CSS/JS). Aucun secret.
  La clé **publique** anon est injectée au build via `window.__NULLSEC_SUPABASE__`.
- **Supabase** : backend (PostgreSQL + PostgREST + RPC). Schéma versionné dans
  `backend/supabase/migrations/`, RPC dans `backend/supabase/functions/`.
- **`backend/supabase/scripts/deploy.sh`** : point d'entrée **unique** de
  déploiement (local ET GitHub Actions).

## 2. Déploiement : un seul script

`deploy.sh` est le seul script de déploiement. Il exécute, dans l'ordre :

1. **Preflight** `[1/4]` — valide l'environnement (curl/jq), les chemins, et
   **l'ordre des migrations** (noms `NNNN_name.sql`, pas de numéro dupliqué)
   avant de toucher la production.
2. **Migrations** `[2/4]` — `0001` → `0019` (ordre numérique, idempotent).
3. **RPC + privilèges** `[3/4]` — les 9 fichiers `rpc_*.sql` (ordre stable)
   puis `rpc_privileges.sql` **en dernier**.
4. **Vérification** `[4/4]` — requêtes en lecture seule sur l'état réel
   (nombre de RPC, RLS, schéma auth, pgcrypto, helpers révoqués).

En cas de succès :

```
[deploy] NullSec Supabase deployment completed successfully.
```

En cas d'échec : code de sortie non-zéro, phase et fichier identifiés, erreur
API **sanitisée**.

## 3. GitHub Actions role

- Workflow : `.github/workflows/supabase-deploy.yml`.
- Déclencheur : push sur `main`, chemins `backend/supabase/**`.
- Fournit uniquement `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF` (secrets).
- Appelle `bash backend/supabase/scripts/deploy.sh`.
- Aucune logique SQL dans le workflow ; `permissions: contents: read`.

## 4. Secrets GitHub requis

| Secret | Usage |
|--------|-------|
| `SUPABASE_ACCESS_TOKEN` | Token d'accès Supabase (Management API). |
| `SUPABASE_PROJECT_REF` | Référence du projet (ex. `abcdefgh`). |

Les secrets sont référencés uniquement comme `${{ secrets.* }}` et passés au
script via l'environnement. Ils ne sont **jamais** affichés dans les logs.

## 5. Variables d'environnement

| Variable | Défaut | Usage |
|----------|--------|-------|
| `SUPABASE_ACCESS_TOKEN` | — | Déploiement (Management API). |
| `SUPABASE_PROJECT_REF` | — | Référence du projet. |
| `SUPABASE_API_BASE_URL` | `https://api.supabase.com` | Base API (optionnel). |

**Non utilisé pour le déploiement :** `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`.

## 6. Modèle de sécurité

- Migration/RPC/privileges via le Management API (aucun secret en frontend).
- Helpers internes révoqués de `PUBLIC`/`anon`/`authenticated`.
- RLS conservée ; privilèges non affaiblis pour faire passer un test.
- Aucun secret (service-role, access token, project ref) dans GitHub Pages.

## 7. Comportement en cas d'échec

- `set -Eeuo pipefail` (fail-closed).
- Tout échec → non-zéro ; pas de faux « completed successfully ».
- Erreurs API affichées de manière sanitisée (le token n'est jamais affiché).

## 8. Vérification

La phase `[4/4]` vérifie l'état réel (voir `docs/backend-deployment.md` §10).
