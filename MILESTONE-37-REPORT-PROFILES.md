# Milestone 37 — Public Profiles & Public Learning Progress

> **Statut :** implémenté. Tests **LOCAL / MOCKED / STATIC** verts.
> **REAL SUPABASE : BLOCKED** — **REAL BROWSER : BLOCKED** (pas de projet/secret/navigateur
> accessibles depuis l'environnement).
>
> **Principe :** *A NullSec account is private, but learning activity does not have to be
> private. Journey, Campaigns and Missions are public learning content. An authenticated user's
> learning progress may be displayed through an explicit public profile. NullSec is still not a
> social network.*

> Note : ce milestone partage le numéro M37 avec le milestone *Account Management & Server
> Session Lifecycle*. Le présent rapport couvre spécifiquement les **profils publics**. Le
> fichier `tests/m37-tests.mjs` a été **étendu** pour couvrir les deux.

---

## AUDIT FINDINGS

- **Architecture existante (M31–M36)** : auth username+password, recovery-only, session
  temporaire, localStorage sans données de compte, Journey Campaigns → Missions, progression
  serveur, Community agrégée. **Aucun profil public.**
- Le RPC précédent (`user_profiles`, progression dans `user_progress`) existe et la progression
  est stockée serveur.
- **Correction architecturale** : les milestones précédents traitaient « profil public » et
  « statistiques d'apprentissage publiques » comme intrinsèquement interdits. M37 introduit un
  **profil public délibéré, serveur-backed**, tout en préservant la suppression du profil
  local/social.
- Le Journey est déjà **publiquement navigable** (les grilles de missions sont rendues pour les
  invités ; seul l'overview de progression montre le CTA). La complétion est déjà auth-gated.

## ROOT CAUSE

Le besoin : rendre la progression d'apprentissage **publiquement affichable** via un profil
public, sans réseau social, sans affaiblir la sécurité, et sans duplication de progression.

## CHANGES

### Backend (nouveau RPC, **aucune migration**)
- **`backend/supabase/functions/rpc_public_profile.sql`** — `ns_public_profile(p_username)` :
  `SECURITY DEFINER` + `search_path = public`. Résout le username serveur (insensible à la
  casse), lit `user_progress.progress_json`, retourne uniquement
  `{ username, completed_mission_ids }`. Aucune donnée privée.
- **`backend/supabase/scripts/deploy.sh`** — `rpc_public_profile.sql` ajouté à l'ordre de
  déploiement (après `rpc_country_metrics`, avant `rpc_privileges`).
- **`backend/supabase/functions/rpc_privileges.sql`** — `ns_public_profile(text)` revoqué de
  PUBLIC, granté à `anon, authenticated` (lecture publique via RPC, RLS privée inchangée).

### Frontend
- **`assets/js/api-client.js`** — `publicProfile(username)` → `ns_public_profile`.
- **`assets/js/public-profile.js`** — dérive de façon déterministe missions/campagnes
  complétées + % à partir de `data/missions.json` + `completed_mission_ids` ; expose
  `PublicProfile.computeStats` / `CAMPAIGNS`.
- **`public-profile.html`** — page statique `?u=<username>`.
- **`assets/js/profile.js`** — lien « View public profile » dans la section authentifiée.
- **`assets/css/pages.css`** — styles `.public-profile-*`.

### Tests / infra
- **`tests/m37-tests.mjs`** — **étendu** (sections 12–18, +43 assertions).
- **`tests/run-tests.mjs`** — routage `ns_public_profile`.
- **`tests/m28-deploy-tests.mjs`**, **`tests/sql-audit.mjs`** — ajout de `rpc_public_profile`.
- `tests/run-all.sh` (étape 26, libellé mis à jour), `tests/README.md`.
- `docs/public-profiles.md` (créé), `docs/account-based-progression.md`,
  `docs/community-architecture.md`, `docs/authentication.md`.

### Fichiers créés
- `backend/supabase/functions/rpc_public_profile.sql`
- `public-profile.html`
- `assets/js/public-profile.js`
- `docs/public-profiles.md`
- `MILESTONE-37-REPORT-PROFILES.md`

### Fichiers supprimés
- Aucun.

### Migrations ajoutées
- **NONE.** `0001→0017` intactes.

## PUBLIC PROFILE MODEL

```
/profile/<username>  (impl. statique : public-profile.html?u=<username>)

@username
Public learning profile

Campaigns   ████████░░ 75%    8/12
Missions    42/60
Per-campaign progress bars
Privacy note: public learning activity only; credentials/private data never exposed.
```

- Identité canonique = **username serveur** (insensible à la casse).
- Dérivé de la progression serveur canonique + définitions publiques (`missions.json`).
- Aucune donnée locale, aucun avatar social, aucune fonctionnalité sociale.

## PRIVACY / SECURITY

- `anon` → `ns_public_profile` = **permis** ; `anon` → compte privé / progression privée / API
  privée = **refusé**.
- Le RPC retourne uniquement les champs approuvés ; aucune donnée privée.
- RLS privée **inchangée** ; `SECURITY DEFINER` + `search_path` ; aucun `p_user_id` client ;
  aucun service-role.
- Journey publiquement navigable, mais complétion réservée à l'utilisateur authentifié.

## COMMUNITY

Community reste **agrégée** et ne devient pas un annuaire d'utilisateurs : pas de usernames
dans les classements, pas de cartes de profil, pas de classement individuel.

## TESTS

Suite complète `run-all.sh` — **toutes vertes** :
- sql-audit 248 · m14 59 · m15 44 · m16 22 · m17 47 · m18 38 · m19 29 · m20 61 · m21 26 ·
  m22 23 · m24 25 · m25 24 · m26 26 · m27 43 · m28 73 · m28-deploy 27 · m29 19 · m30 28 ·
  m31 31 · m32 45 · m33 56 · m34 60 · m35 80 · m36 86 · **m37 129**
- **Total : 1349 assertions vertes.**

Sections M37 Public Profile ajoutées :
- **12. RPC public profile** : lookup par username, champs approuvés uniquement, aucune
  donnée privée, username inexistant géré, utilisation de `ns_public_profile`.
- **13. Dérivation progression publique** : déterministe, campagnes/missions/% corrects, aucune
  source de progression dupliquée.
- **14. Isolation compte** : le RPC et le module frontend ne référencent pas de données privées.
- **15. Journey** : invité navigue mais ne modifie pas ; authentifié complète ; sync serveur.
- **16. Storage** : aucun profil public / donnée de compte en localStorage.
- **17. Pas de réseau social** : aucun follow/follower/friend/like/comment/DM/feed implémenté ;
  Community agrégée.
- **18. Route publique** : `public-profile.html` + `?u=` + lien depuis Account.

**node --check** : tous les fichiers listés — OK. **bash -n** : run-all.sh, deploy.sh,
apply-sql.sh — OK.

## REMAINING LIMITATIONS

- **LOCAL / STATIC / MOCKED** : validation via harness Node + audit statique.
- **REAL SUPABASE : BLOCKED** — `ns_public_profile` non exécuté contre la production ; le
  déploiement cloud-first (migrations 0001→0017 + RPC) reste à faire.
- **REAL BROWSER : BLOCKED** — le rendu DOM de `public-profile.html` n'a pas été validé
  visuellement.
- Le profil public expose une liste de `completed_mission_ids` (statistiques d'apprentissage) ;
  aucune donnée d'activité récente, de récompenses ou de badges n'est encore affichée (optionnel
  futur).

## ACCEPTANCE CRITERIA

- ✅ Compte serveur = source de vérité ; username+password = login normal ; recovery =
  récupération ; aucun email.
- ✅ Account privé ; Public Profile concept séparé, visible sans authentification, identifié
  par username.
- ✅ Public Profile n'expose que des statistiques d'apprentissage approuvées ; aucun credential,
  session, recovery, ID interne.
- ✅ Journey publiquement navigable ; campagnes/missions publiques ; invité ne modifie pas ;
  authentifié modifie sa propre progression.
- ✅ Progression serveur ; profil public dérivé de la progression canonique ; aucune duplication
  ni stockage local.
- ✅ Cross-device (profil public + progression authentifiée).
- ✅ Account et Public Profile sont des concepts UI séparés.
- ✅ Community agrégée, pas un annuaire.
- ✅ Aucun follow/follower/friend/like/comment/DM/feed/ranking social ; aucun avatar social.
- ✅ RLS intacte ; aucun service-role ; aucun `p_user_id` client.
- ✅ Aucune migration nécessaire ; tests existants verts ; m37 vert ; node --check vert ;
  bash -n vert ; run-all.sh vert ; documentation mise à jour.

## FINAL ARCHITECTURAL PRINCIPLE

**Account = privé. Learning Journey = public. Profil d'apprentissage = public. Progression peut
être résumée publiquement. Community = agrégée. NullSec ne devient pas un réseau social.**
