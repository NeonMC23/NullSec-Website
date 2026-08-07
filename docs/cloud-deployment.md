# NullSec — Cloud-First Deployment

> **Milestone 28 / Cloud-first.** GitHub est la source de vérité du déploiement
> backend. Aucune dépendance au CLI Supabase local ni au `supabase link` local.
> Le frontend reste hébergé sur **GitHub Pages** (statique). Supabase reste le
> backend.

---

## 1. Architecture overview

```
GitHub (source of truth)
  ├── Frontend: static site → GitHub Pages (public anon key injected at build)
  └── Backend:  .github/workflows/supabase-deploy.yml
                     │  (on push to main)
                     ▼
              Supabase Management API  (no local CLI / no local link)
                     │
                     ▼
              Supabase project "NullSec Community" (region West EU — Paris)
                     │
                     └── migrations (0001→0016) + RPC functions
```

- **GitHub Pages** : héberge le frontend statique (HTML/CSS/JS). Aucun secret.
  La clé **publique** anon est injectée au build via `window.__NULLSEC_SUPABASE__`
  (voir `docs/deployment-guide.md`).
- **Supabase** : backend (PostgreSQL + PostgREST + RPC). Schéma versionné dans
  `backend/supabase/migrations/`, RPC dans `backend/supabase/functions/`.
- **GitHub Actions** : applique les migrations + RPC via la **Management API**
  (curl + access token) — pas de CLI, pas de `supabase link`, pas de machine locale.

## 2. GitHub Pages role

- Héberge uniquement le frontend statique.
- Nécessite l'injection de `window.__NULLSEC_SUPABASE__ = { url, anonKey }` (clés
  **publiques**) avant `assets/js/config.js`. La service-role key n'est **jamais**
  en frontend.
- Le workflow backend ne touche pas aux Pages.

## 3. Supabase role

- Backend de production (PostgreSQL, RLS, RPC).
- Le projet « NullSec Community » (région West EU — Paris) reçoit les migrations
  `0001`…`0016` puis les RPC.
- Les secrets (service-role, access token, project ref) vivent uniquement dans
  GitHub Secrets et le dashboard Supabase.

## 4. Required GitHub secrets

Configurer dans **GitHub → Settings → Secrets → Actions** :

| Secret | Usage |
|--------|-------|
| `SUPABASE_ACCESS_TOKEN` | Token d'accès Supabase (Management API). |
| `SUPABASE_PROJECT_REF` | Référence du projet (ex. `abcdefgh`). |

Les secrets sont référencés uniquement comme `${{ secrets.* }}` et passés au
script via l'environnement. **Ils ne sont jamais échoués dans les logs** (GitHub les
masque ; le script ne les echo jamais).

## 5. Deployment flow

1. Développeur pousse vers `main` (changements sous `backend/supabase/**`).
2. Le workflow `supabase-deploy.yml` se déclenche.
3. `backend/supabase/scripts/deploy.sh` :
   - applique chaque migration `0001…0016` via la Management API (ordre lexicographique) ;
   - applique les RPC (ordre stable : auth → sync → activity → tool_activity →
     profile → activity_event → country_metrics) ;
   - **s'arrête (fail) dès qu'une étape échoue** (set -e).
4. En cas de succès, la base est à jour. Aucune machine locale requise.

### Fail-safe

- Chaque migration est enveloppée `BEGIN;…COMMIT;` → transactionnelle.
- Le workflow utilise `set -euo pipefail` → un échec annule le job.
- `environment: production` + `if: github.ref == 'refs/heads/main'` → déploiement
  limité à la branche `main`.

## 6. Rollback strategy

- **Aucune migration destructive** n'existe (aucun `DROP TABLE` non protégé).
  Les migrations utilisent `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` quand
  possible.
- Pour corriger une mauvaise migration : ajouter une **nouvelle migration** de
  correctif `0017_…` (jamais réécrire les migrations déjà appliquées), puis pousser.
- Si une étape échoue en CI, la transaction `BEGIN/COMMIT` annule la migration
  fautive ; les migrations déjà appliquées restent en place (idempotence par
  `IF NOT EXISTS`).

## 7. Environment separation

| Couche | Secrets | Où |
|--------|---------|-----|
| Frontend (Pages) | `anon` key (publique) uniquement | build-time injection |
| Backend (Supabase) | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, service-role | GitHub Secrets + dashboard Supabase |
| CI (GitHub Actions) | access token + project ref | GitHub Secrets |

- Aucun secret en frontend source.
- Aucun secret commité dans le repo (`.gitignore` couvre `backend/supabase/.env`,
  `backend/.env`, `.env*`).

## 8. Honesty / status

**Aucun déploiement réel n'a été exécuté** (pas de projet Supabase accessible dans
cet environnement). Ce document décrit le **workflow cible** ; le premier déploiement
réel reste à effectuer une fois les secrets configurés sur un projet GitHub réel.
Aucune donnée de production, aucun utilisateur réel.
