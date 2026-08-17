# NullSec — Production Deployment Contract

> **Statut :** source de vérité pour le déploiement en production.
> **REAL SUPABASE : BLOCKED** jusqu'à ce que l'infrastructure externe soit fournie.
> Ce document décrit la procédure déterministe ; elle n'a **pas** encore été exécutée.

---

## 1. Required secrets (environment / GitHub Secrets)

| Secret | Usage | Public ? |
|--------|-------|----------|
| `SUPABASE_ACCESS_TOKEN` | Management API token pour déployer migrations + RPC | **Non** |
| `SUPABASE_PROJECT_REF` | Référence du projet Supabase (ex. `abcdefgh`) | **Non** |

Ces secrets sont référencés **uniquement** comme `${{ secrets.* }}` dans le workflow et passés
via l'environnement au script. Ils ne sont **jamais** affichés.

## 2. Public frontend configuration

| Variable | Usage | Public ? |
|----------|-------|----------|
| `SUPABASE_URL` | URL publique du projet Supabase | **Oui (publique)** |
| `SUPABASE_ANON_KEY` | Clé anon (publique) pour le frontend | **Oui (publique)** |

Règles strictes :

- **anon key = publique** — peut être injectée dans le frontend.
- **service-role key = JAMAIS** dans le frontend (elle contourne RLS).
- **DB password / access token = JAMAIS** dans GitHub Pages / assets.

L'injection se fait **uniquement** via `window.__NULLSEC_SUPABASE__ = { url, anonKey }` placé
**avant** `assets/js/config.js`. `config.js` ne consomme que `url` et `anonKey`.

## 3. Deployment order (déterministe)

1. **Migrations `0001 → 0018`** — ordre lexicographique (`ls | sort`), chaque fichier dans une
   transaction `BEGIN;…COMMIT;`, idempotent (`IF NOT EXISTS`).
2. **RPC / functions** — liste explicite dans `deploy.sh` (ordre dépendant stable).
3. **Privilèges** — `rpc_privileges.sql` appliqué **en dernier** (après création des fonctions),
   revoke/grants explicites.
4. **Configuration frontend** — injection publique `SUPABASE_URL` + `SUPABASE_ANON_KEY` +
   activation explicite des flags (`supabaseEnabled`, `authEnabled`, `backendEnabled`,
   `syncEnabled`).
5. **Frontend deployment** — GitHub Pages (statique, chemins relatifs).
6. **Real browser validation** — protocole décrit dans `docs/production-validation.md`.

Exécution : `bash backend/supabase/scripts/deploy.sh`
(prérequis : `SUPABASE_ACCESS_TOKEN` et `SUPABASE_PROJECT_REF` définis, sinon fail-fast).

## 4. Rollout expectations

### Fresh database
- Le pipeline crée toutes les tables, RLS, index, RPC et privilèges depuis zéro.

### Already-migrated database
- Les migrations utilisent `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` : ré-appliquer est sûr
  (idempotent). `GRANT`/`REVOKE` sont des no-ops quand déjà présents.

### Failure behavior
- `set -euo pipefail` : toute étape échouée arrête le job avec un code non-zéro.
- `apply-sql.sh` échoue (exit 1) si un fichier SQL manque ou si l'API renvoie un code non-2xx.
- `deploy.sh` échoue si une variable obligatoire manque.

### Idempotence
- Migrations : `IF NOT EXISTS`, transactions.
- Privilèges : `GRANT`/`REVOKE` idempotents.
- Re-run du pipeline = sûr.

### Logs
- Aucun secret n'est loggé. `apply-sql.sh` n'affiche jamais le token ; le workflow GitHub masque
  les secrets.

### Rollback considerations
- **Aucun rollback automatique n'existe.** Aucune migration destructive (`DROP TABLE`) n'est
  présente ; le correctif se fait par **nouvelle migration** `00XX_…` (jamais en réécrivant
  l'historique). Les migrations déjà appliquées restent en place.

## 5. Preflight local

Avant tout déploiement réel, exécuter :

```bash
node tests/preflight-production.mjs
```

Le preflight vérifie : structure, séquence des migrations 0001→0018, inventaire RPC, ordre de
déploiement, contrat de config frontend, scan des secrets (PASS/FAIL + emplacement, valeurs
jamais affichées), durcissement SQL, scripts fail-fast.

Puis :

```bash
bash tests/run-all.sh   # suite complète M14→M44
```

## 6. Statut honnête

- **CODE READY** : oui (produit fonctionnellement complet).
- **DEPLOYMENT TOOLING READY** : oui (preflight + scripts + contrat documenté).
- **REAL SUPABASE READY** : **BLOCKED** (aucune infrastructure réelle fournie ; rien n'a été
  exécuté contre un vrai projet).
- **REAL BROWSER VALIDATED** : **BLOCKED** (aucun navigateur réel).
