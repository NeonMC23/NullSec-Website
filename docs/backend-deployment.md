# NullSec — Backend Deployment (Supabase)

> **Backend de production = Supabase.** Ce document décrit le déploiement du
> backend (schéma + RPC + privilèges) via le **Management API** Supabase.
> Aucun serveur Express/Node intermédiaire n'existe en production ; le frontend
> statique (GitHub Pages) appelle directement les RPC avec la clé anon publique.

---

## 1. Point d'entrée unique

Le déploiement backend passe par **UN SEUL script** :

```bash
backend/supabase/scripts/deploy.sh
```

Le même script fonctionne :
- **localement** (machine développeur) ;
- **en CI** (GitHub Actions → `.github/workflows/supabase-deploy.yml`).

`backend/supabase/scripts/apply-sql.sh` est un **helper interne** (applique un
fichier SQL via le Management API) utilisé par `deploy.sh`. Il n'existe pas
d'autre implémentation de déploiement.

---

## 2. Ordre de déploiement

`deploy.sh` exécute, dans l'ordre :

1. **Migrations** `backend/supabase/migrations/*.sql` (ordre numérique `0001` → `0019`).
2. **RPC** `backend/supabase/functions/rpc_*.sql` (ordre stable et dépendance-sûr).
3. **Privilèges** `backend/supabase/functions/rpc_privileges.sql` (**en dernier**,
   après création de toutes les fonctions RPC).

Le déploiement est **idempotent** (les migrations sont `IF NOT EXISTS` / idempotentes,
et `deploy.sh` gère le cas de la vue `v_country_metrics` qui évolue entre 0013 et 0016).

---

## 3. Variables d'environnement

| Variable | Rôle | Requise |
|----------|------|---------|
| `SUPABASE_ACCESS_TOKEN` | Token Supabase (Management API) — **déploiement**. | Oui |
| `SUPABASE_PROJECT_REF` | Référence du projet (ex. `kjgzfxviopkpykkowdbj`). | Oui |
| `SUPABASE_API_BASE_URL` | Base API, défaut `https://api.supabase.com`. | Non |

**Jamais requis / jamais utilisé pour l'auth de déploiement :**
`SUPABASE_SERVICE_KEY` (clé service-role) et `SUPABASE_ANON_KEY` (clé anon publique).

Le token n'est **jamais** affiché, ni écrit dans un fichier, ni commité.

---

## 4. Déploiement manuel

```bash
export SUPABASE_ACCESS_TOKEN='<ton-token-supabase>'
export SUPABASE_PROJECT_REF='kjgzfxviopkpykkowdbj'
bash backend/supabase/scripts/deploy.sh
```

Sortie attendue (labels de phase) :

```
[1/4] Preflight
[2/4] Migrations
[3/4] RPC functions + privileges
[4/4] Verification
[deploy] NullSec Supabase deployment completed successfully.
```

Le message « completed successfully » n'apparaît **que** si toutes les étapes
(y compris la vérification post-déploiement) ont réussi.

---

## 5. Déploiement GitHub Actions

- Déclencheur : push sur `main` touchant `backend/supabase/**`.
- Workflow : `.github/workflows/supabase-deploy.yml`.
- Il fournit `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF` via les secrets
  GitHub Actions et appelle `bash backend/supabase/scripts/deploy.sh`.
- Aucune logique SQL dans le workflow ; `permissions: contents: read`.

### Secrets GitHub requis
| Secret | Usage |
|--------|-------|
| `SUPABASE_ACCESS_TOKEN` | Token Supabase (Management API). |
| `SUPABASE_PROJECT_REF` | Référence du projet. |

---

## 6. Ce que le script déploie

- **migrations** : schéma, RLS, vues, données de référence ;
- **RPC** : auth/session, sync, activité, metrics, profils publics ;
- **privilèges** : `rpc_privileges.sql` (durcissement des EXECUTE).

## 7. Ce que le script N'utilise PAS

- la clé **service-role** ;
- la clé **anon** ;
- le **CLI Supabase** (`supabase link` n'est pas requis) ;
- **psql** direct.

## 8. Modèle de sécurité

- Helpers internes (`ns_create_session`, `ns_valid_transport_hash`, `ns_valid_username`)
  **révoqués** de `PUBLIC`, `anon`, `authenticated`.
- API publique : `EXECUTE` réservé à `anon` + `authenticated`, aucun `PUBLIC`.
- RLS activé sur les tables attendues.
- Aucun secret dans les logs ; erreurs **sanitisées**.

## 9. Comportement en cas d'échec

- `set -Eeuo pipefail` : tout échec (migration / RPC / privilège / vérification)
  retourne un code non-zéro.
- Le message de succès n'est **jamais** affiché si une étape a échoué.
- L'erreur API est affichée de manière **sanitisée** (jamais le token).

## 10. Vérification post-déploiement

Après déploiement, `deploy.sh` interroge l'état réel (lecture seule via le
Management API) et vérifie :

- 20 fonctions `ns_*` ;
- 17 tables protégées par RLS ;
- `users.identity_id` nullable ;
- `user_profiles.public_profile_enabled` présente ;
- `ns_register` → `search_path = public, extensions` (pgcrypto) ;
- helper interne `ns_create_session` non exposé ;
- vue `v_country_metrics` = 7 colonnes.

Si une vérification échoue, le déploiement retourne un code non-zéro.
