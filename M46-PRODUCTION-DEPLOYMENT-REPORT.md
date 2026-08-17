# M46 — Production Deployment & Real-World Validation — REPORT

**Date :** 2026-08-18 (fuseau Europe/Paris)
**Statut global :** Backend déployé + vérifié ✔ — Frontend hébergé BLOCKED — RELEASE conditionnelle

Ce rapport documente le passage du release-candidate (M45, code locké) vers un
**déploiement Supabase RÉEL** et une **validation navigateur RÉELLE**. Tout ce qui
est marqué *réel* a été exécuté contre le vrai projet Supabase et le vrai Chromium.
Aucun résultat n'a été simulé.

---

## 1. Statuts finaux (format exigé)

| # | Domaine | Statut |
|---|---------|--------|
| 1 | **CODE** | READY (avec correctifs mineurs de bugs réels, code lock préservé) |
| 2 | **DATABASE** | DEPLOYED + VERIFIED |
| 3 | **FRONTEND** | BLOCKED (hébergement public — pas d'accès GitHub Pages / token) |
| 4 | **REAL BROWSER** | VALIDATED (invité 31/31 ; E2E compte réel 12/13, 1 attente bénigne) |
| 5 | **SECURITY** | PASSED (RPC, RLS, helpers, XSS, isolation, non-énumération) |
| 6 | **E2E** | PARTIAL (flux compte réel validé ; hébergement public non déployé) |
| 7 | **RELEASE** | RELEASE BLOCKED (frontend non hébergé ; backend prêt) |

---

## 2. Cible de déploiement

- **Projet :** « NullSec Community »
- **Project ref :** `kjgzfxviopkpykkowdbj`
- **Région :** `eu-west-3` (Paris, West EU) ✔ correspond à la cible prévue
- **Statut projet :** `ACTIVE_HEALTHY`
- **URL base (public) :** `https://kjgzfxviopkpykkowdbj.supabase.co`
- **PostgreSQL :** 17.6
- **Base de départ :** NON fraîche — schéma legacy 0001→0016 (vide de données utilisateur),
  vide de toute donnée, RLS activé.

---

## 3. Résultats de déploiement

### Migrations : SUCCÈS
- **19 migrations** appliquées dans l'ordre (`0001` → `0019`).
- 0001→0016 déjà présentes (idempotentes) ; **0017** (auth username+password) et
  **0018** (profils publics) ajoutées ; **0019** ajoutée (voir bugs).
- `schema_migrations` reste vide (méthode cloud-first via Management API, n'écrit pas dans cette table — attendu).

### RPC : SUCCÈS
- **9 fichiers RPC** appliqués (auth, sync, activity, tool_activity, profile,
  activity_event, country_metrics, public_profile, update_public_profile).
- **20 fonctions `ns_*`** présentes ; toutes `SECURITY DEFINER` + `search_path` épinglé.

### Privilèges : SUCCÈS
- `rpc_privileges.sql` appliqué en dernier.
- Helpers internes (`ns_create_session`, `ns_valid_transport_hash`, `ns_valid_username`)
  **révoqués** de PUBLIC/anon/authenticated (vérifié : seul `postgres` + `service_role`).
- Les 17 fonctions de l'API publique : `anon` + `authenticated` EXECUTE, aucun PUBLIC.

### Outillage : SUCCÈS (fail-fast)
- `deploy.sh` / `apply-sql.sh` : `set -euo pipefail`, jamais de secret loggé, échec → non-zéro.
- Aucun secret réel (token, clés) n'a été affiché dans les logs.

---

## 4. Bugs RÉELS découverts et corrigés

Ces bugs n'étaient visibles qu'en environnement réel (ils ne sont pas couverts par
les tests statiques) — découverts pendant le déploiement / la validation navigateur.
Corrections **minimales**, tests de régression ajoutés, suite locale re-exécutée.

### 4.1 — `pgcrypto` hors `public` (inscription KO)
- **Repro :** `ns_register` → `ERROR 42883: function gen_salt(...) does not exist`.
- **Cause :** Supabase installe `pgcrypto` dans le schéma `extensions` ; les RPC auth
  utilisaient `SET search_path = public` (sans `extensions`) → `gen_salt`/`crypt`/
  `digest`/`gen_random_bytes` introuvables.
- **Fix :** `rpc_auth.sql` → `SET search_path = public, extensions` (7 fonctions).

### 4.2 — `users.identity_id NOT NULL` (inscription KO)
- **Repro :** `ERROR 23502: null value in column "identity_id"`.
- **Cause :** migration 0001 exigeait `identity_id UUID NOT NULL` (modèle identity legacy) ;
  le modèle username/password (0017) n'envoie plus `identity_id`.
- **Fix :** **migration 0019** `ALTER COLUMN identity_id DROP NOT NULL` (additive, non destructive).

### 4.3 — cast `::jsonb` manquant (inscription KO)
- **Repro :** `ERROR 42804: column "progress_json" is of type jsonb but expression is of type text`.
- **Cause :** l'INSERT par concaténation texte dans `user_progress` (et `ns_reset_progress`)
  n'était pas casté.
- **Fix :** `(...)::jsonb` dans `rpc_auth.sql` et `rpc_sync.sql`.

### 4.4 — `PublicProfile is not defined` (erreur console page compte)
- **Repro :** `ReferenceError: PublicProfile is not defined` (3×) sur `profile.html` authentifié.
- **Cause :** `profile.js` utilise `PublicProfile` mais `profile.html` ne chargeait pas `public-profile.js`.
- **Fix :** ajout de `<script src="assets/js/public-profile.js">` avant `profile.js`.

### 4.5 — PERTE DE DONNÉES de progression à la reconnexion (critique)
- **Repro (E2E réel) :** mission complétée → progression serveur OK ; déconnexion ;
  reconnexion depuis un « device » neuf → progression serveur **écrasée à vide**.
- **Cause double :**
  1. `Progress.get()` renvoie une progression vide avec `updated_at = now()` sur page neuve ;
     `SyncResolver` « newest updated_at wins » → le vide local (timestamp frais) battait le serveur.
  2. `applyMerged` écrit dans le repo (Store) mais pas dans l'état mémoire de `Progress` ;
     `push()` interne à `sync()` ré-émettait donc l'état vide → écrasement du serveur.
- **Fix :**
  - `sync-resolver.js` : une progression/block **vide** ne doit jamais écraser un block serveur
    **non vide** (garde `isEmpty` par type).
  - `sync-service.js` : `Progress.reload()` **avant** `push()` dans `sync()`.
- **Vérifié (E2E réel) :** après fix, reconnexion → progression `enable-2fa` préservée côté serveur.
  → **PROGRESS ≠ LOCAL DATA** rétabli.

### 4.6 — Idempotence de `deploy.sh` (re-run KO)
- **Repro :** re-exécution de `deploy.sh` → échec `0013` `42P16 cannot drop columns from view`.
- **Cause :** la vue `v_country_metrics` évolue 0013 (6 col.) → 0016 (+`community_activity`) ;
  `CREATE OR REPLACE VIEW` ne peut pas retirer une colonne sur un re-run.
- **Fix :** `deploy.sh` fait `DROP VIEW IF EXISTS public.v_country_metrics` avant les migrations
  (la vue est recréée par 0013→0016 ; aucune donnée perdue).

---

## 5. Validation RÉELLE du backend (API live, clé anon publique)

- **Inscription :** OK (token émis) ; mauvais mot de passe → `invalid_credentials`.
- **Session :** `ns_validate_session` → user_id correct.
- **Helpers internes via `anon` :** `ns_create_session`, `ns_valid_username`,
  `ns_valid_transport_hash` → **401 `permission denied`** ✔.
- **Progression :** `ns_sync_pull` initial vide → `ns_sync_push` (mission `enable-2fa`)
  → `ns_sync_pull` confirme la persistance serveur.
- **Isolation :** token invalide/garbage → `unauthorized` (pas d'accès à un autre user).
- **Profil public :**
  - désactivé **et** inexistant → `{enabled:false}` identique (non-énumératif) ✔
  - activé + bio + intérêts → visible, avec `completed_mission_ids` ✔
  - désactivé après activation → indistinguable d'un inexistant ✔
  - aucun champ privé (token/id/settings/password) exposé ✔
- **XSS réel :** payload `<script>`/`<img onerror>` dans bio/intérêts stocké **comme donnée**
  (round-trip littéral), non exécuté ; bornes (bio ≤ 280, ≤ 8 intérêts) appliquées ✔.
- **Contraintes architecturales respectées :** aucun `p_user_id` client ; identité issue du
  token de session ; pas de follow/likes/feed ; progression serveur.

---

## 6. Validation navigateur RÉELLE (Chromium via Playwright)

### Invité / statique (site hors-ligne, config par défaut) — 31/31 PASS
Landing, nav internes (283 liens), Journey (30 missions), modal mission (open,
`aria-modal`, focus, Échap, prev/next, close, restauration scroll), recherche,
responsive mobile 375px / tablette 768px (pas d'overflow horizontal), wrapping des
longs textes utilisateur, 0 erreur console/page, 0 ressource en échec.

### E2E compte réel (frontend configuré → vrai Supabase + vrai Chromium) — 12/13
Création de compte via l'UI → connecté ; complétion d'une mission via l'UI ;
progression persistée serveur ; déconnexion ; reconnexion ; **progression préservée**
(après correctif 4.5) ; rien en localStorage (PROGRESS ≠ LOCAL DATA) ; token en sessionStorage.
1 échec bénin : `ns_record_activity` → `400 no_country` (compte sans pays opt-in ;
comportement privacy attendu, n'affecte pas la progression).

---

## 7. Frontend — hébergement BLOCKED

- Le frontend (statique, GitHub Pages) **n'a pas pu être redéployé** : pas de `GITHUB_TOKEN`
  ni d'accès push au dépôt.
- Le site live `https://neonmc23.github.io/NullSec-Website/` est en **mode hors-ligne**
  (`supabaseEnabled=false`) — c'est le déploiement antérieur.
- La configuration production est **prête** et documentée : injection publique
  `window.__NULLSEC_SUPABASE__ = { url, anonKey }` avant `config.js` + activation des flags
  `supabaseEnabled/authEnabled/backendEnabled/syncEnabled`. L'anon key étant **publique**, elle
  peut être injectée sans risque. Le repo reste **offline par défaut** (aucun secret committé).
- **Blocker :** crédentials GitHub Pages / token pour l'hébergement. Dès qu'ils sont fournis,
  le workflow/documentation de déploiement frontend peut être exécuté.

---

## 8. Vérifications finales

- Suite locale complète : **2704 assertions vertes** (2689 M45 + 9 régressions M46 + 6 preflight).
- `preflight-production.mjs` : **72/72**.
- `node --check` : 47 fichiers JS, 0 erreur.
- `bash -n` : run-all.sh, deploy.sh, apply-sql.sh.
- Secret scan : aucun secret réel dans le code (variables d'env référencées uniquement).
- Base finale : 20 RPC `ns_*`, 17 tables (toutes RLS), vue `v_country_metrics` 7 colonnes,
  helpers internes révoqués, 0 utilisateur test restant (nettoyage).
- `deploy.sh` final : succès (idempotent).

---

## 9. Fichiers modifiés / ajoutés (cette phase)

**Backend / déploiement**
- `backend/supabase/functions/rpc_auth.sql` (fix 4.1, 4.3)
- `backend/supabase/functions/rpc_sync.sql` (fix 4.3)
- `backend/supabase/migrations/0019_auth_identity_nullable.sql` (fix 4.2, nouveau)
- `backend/supabase/scripts/deploy.sh` (fix 4.6 + message)
- `backend/supabase/scripts/apply-sql.sh` (chmod +x)

**Frontend**
- `assets/js/sync-resolver.js` (fix 4.5)
- `assets/js/sync-service.js` (fix 4.5)
- `profile.html` (fix 4.4)

**Tests**
- `tests/preflight-production.mjs` (régressions : extensions, jsonb, 0019, idempotence ; 72)
- `tests/m28-deploy-tests.mjs`, `m36`, `m42`, `m44`, `m45` (19 migrations)
- `tests/m46-production-fixes.mjs` (nouveau, 9)
- `tests/run-all.sh` (étape 36)
- `tests/browser-validation.cjs` (outil validation navigateur invité, nouveau)
- `tests/browser-e2e.cjs` (outil E2E compte réel, nouveau)

---

## 10. Bloqueurs restants

1. **Hébergement frontend public** — pas de `GITHUB_TOKEN` / accès GitHub Pages. Dès
   fourniture : activer la config production (injection publique) et déployer le statique.
2. **`ns_record_activity` → `no_country`** pour un compte sans pays opt-in : comportement
   voulu (privacy), à confirmer comme acceptable en prod (sinon ajuster le flux UX).

---

## 11. Principe final

La phase M46 **prouve** que le release-candidate fonctionne dans le monde réel côté
**backend Supabase** (déployé + vérifié, sécurité passée) et en **navigateur réel**
(invité 31/31 ; flux compte réel validé). La **RELEASE** reste **BLOCKED** uniquement parce
que l'**hébergement public du frontend** n'a pas pu être exécuté faute de credentials
GitHub Pages. Le code reste verrouillé ; aucune feature spéculative n'a été ajoutée.
