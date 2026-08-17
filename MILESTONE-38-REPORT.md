# Milestone 38 — Public Profile Customization & Learning Identity

> **Statut :** implémenté. Tests **LOCAL / MOCKED / STATIC** verts.
> **REAL SUPABASE : BLOCKED** — **REAL BROWSER : BLOCKED** (pas de projet/secret/navigateur
> accessibles depuis l'environnement).
>
> **Principe :** *NullSec possède désormais de vrais comptes serveur et des profils publics
> d'apprentissage. M38 transforme le Public Profile en une véritable identité publique de
> learning, sans jamais devenir un réseau social.*

---

## AUDIT

- **M37** fournissait un profil public minimal : RPC `ns_public_profile(p_username)` retournant
  `username + completed_mission_ids`, page `public-profile.html?u=`, lien depuis Account.
- `user_profiles` contenait : `user_id, username, avatar_seed, created_at, updated_at`.
- **Manques M38** : aucun champ bio / interests / opt-in public ; aucune mise à jour
  authentifiée ; pas d'achievements ; pas d'états disabled/empty.

## ARCHITECTURE AVANT / APRÈS

- **Avant** : profil public = `username + completed_mission_ids`, toujours visible (pas
  d'opt-in), sans bio/interests/achievements.
- **Après** : profil public **opt-in** avec bio, learning interests, member-since, progression
  dérivée + achievements dérivés ; mise à jour authentifiée ; états loading/disabled/not-found/
  empty/normal.

## CHANGES

### Fichiers créés
- `backend/supabase/migrations/0018_public_profile.sql`
- `backend/supabase/functions/rpc_update_public_profile.sql`
- `tests/m38-tests.mjs`
- `MILESTONE-38-REPORT.md`

### Fichiers modifiés
- `backend/supabase/functions/rpc_public_profile.sql` — retourne `enabled, username, bio,
  learning_interests, created_at, completed_mission_ids` ; `{enabled:false}` si désactivé.
- `backend/supabase/scripts/deploy.sh` — `rpc_update_public_profile.sql` ajouté à l'ordre.
- `backend/supabase/functions/rpc_privileges.sql` — grant de `ns_update_public_profile`.
- `assets/js/api-client.js` — `updatePublicProfile(token, payload)`.
- `assets/js/public-profile.js` — achievements, bio, interests, member-since, états
  disabled/empty ; expose `PublicProfile.computeStats/computeAchievements/ACHIEVEMENTS`.
- `assets/js/profile.js` — section **Public Profile** (opt-in, bio, interests, edit, view).
- `profile.html` — section Public Profile.
- `assets/css/pages.css` — styles profil public.
- Tests : `sql-audit.mjs`, `m28-deploy-tests.mjs`, `run-tests.mjs`, `m36-tests.mjs` (count),
  `run-all.sh` (étape 27), `tests/README.md`.
- Docs : `docs/public-profiles.md`, `docs/account-based-progression.md`,
  `docs/authentication.md`, `docs/community-architecture.md`.

### Fichiers supprimés
- Aucun.

## MIGRATIONS

- **`0018_public_profile.sql`** : `public_profile_enabled BOOLEAN NOT NULL DEFAULT FALSE`,
  `bio TEXT` (≤ 280), `learning_interests TEXT[]` (≤ 8). Idempotente (`IF NOT EXISTS`),
  compatible base vierge et déployée. Aucun champ credential. Migrations `0001→0017` non
  réécrites.

## RPC

- `ns_public_profile(p_username)` — lecture publique (anon), `SECURITY DEFINER` +
  `search_path = public` ; retourne uniquement `enabled, username, bio, learning_interests,
  created_at, completed_mission_ids` (si activé) ou `{enabled:false}` (sinon, non-énumératif).
- `ns_update_public_profile(p_token, p_public_profile_enabled, p_bio, p_learning_interests)` —
  mise à jour authentifiée ; identité dérivée de `ns_validate_session` (jamais de `p_user_id`
  client) ; refuse `unauthorized` ; valide bio (≤280) et intérêts (≤8) ; ne change pas le
  username.

## PUBLIC / PRIVATE BOUNDARY

- **Account (privé)** : password, recovery, session, user ID interne, réglages privés.
- **Public Profile (public, opt-in)** : username, bio, learning interests, member-since,
  statistiques d'apprentissage, achievements.
- Le RPC ne retourne **que** les champs approuvés ; le frontend ne décide jamais qu'une donnée
  est publique.

## PROFILE EDITING

- Le propriétaire édite via `ns_update_public_profile` (sa propre ligne `user_profiles`).
- Un utilisateur ne peut jamais modifier le profil d'un autre (identité session-only).

## PUBLIC PROGRESSION & ACHIEVEMENTS

- Statistiques **dérivées** (jamais stockées) depuis `completed_mission_ids` + `missions.json`.
- Achievements **déterministes** : `FIRST_MISSION`, `10/25/50_MISSIONS`, `CAMPAIGN_COMPLETE`,
  `ALL_CAMPAIGNS` — calculés depuis la progression publique uniquement.

## STORAGE

`localStorage` = `ns:theme`, `ns:migrated:v1` ; `sessionStorage` = `ns:session:auth`,
`ns:session:recovery`. Aucun profil public / credential / progression / username en
localStorage. Le profil est toujours récupéré du serveur.

## SECURITY

- RLS **inchangée** ; RPC `SECURITY DEFINER` + `search_path = public`.
- Aucun `p_user_id` client ; aucun service-role ; profil désactivé inaccessible publiquement ;
  guest en lecture seule ; update authentifié uniquement.
- Aucune fonctionnalité sociale.

## TESTS

Suite complète `run-all.sh` — **toutes vertes** :
- sql-audit 249 · m14 59 · m15 44 · m16 22 · m17 47 · m18 38 · m19 29 · m20 61 · m21 26 ·
  m22 23 · m24 25 · m25 24 · m26 26 · m27 43 · m28 73 · m28-deploy 28 · m29 19 · m30 28 ·
  m31 31 · m32 45 · m33 56 · m34 60 · m35 80 · m36 86 · m37 129 · **m38 59**
- **Total : 1410 assertions vertes.**

`tests/m38-tests.mjs` (59) : structure du profil + achievements, API publique (champs
approuvés seulement), profil désactivé caché / activé lisible, propriétaire édite son profil
(sans `p_user_id`), guest lecture seule, progression + achievements déterministes, storage
(aucun profil/credential en localStorage), garde anti-réseau-social, sécurité (RPC update
authentifié, validation), migration 0018 + intégration Account.

**node --check** : tous les JS concernés — OK. **bash -n** : run-all.sh, deploy.sh,
apply-sql.sh — OK.

## REMAINING LIMITATIONS

- **LOCAL / STATIC / MOCKED** : validation via harness Node + audit statique.
- **REAL SUPABASE : BLOCKED** — migration 0018 + RPC `ns_update_public_profile` non exécutés
  contre la production ; le déploiement cloud-first reste à faire.
- **REAL BROWSER : BLOCKED** — le rendu DOM du profil public enrichi et de la section
  « Public Profile » de l'Account n'a pas été validé visuellement.

## ACCEPTANCE CRITERIA

- ✅ Compte serveur = source de vérité ; username+password = login ; recovery =
  récupération ; Account privé.
- ✅ Public Profile = espace public explicitement contrôlé (opt-in).
- ✅ Journey/Campaigns/Missions publics.
- ✅ Bio publique, learning interests, member-since supportés.
- ✅ Progression globale + par Campaign + achievements calculés dynamiquement (dérivés).
- ✅ Aucun doublon de progression ; aucun profil public stocké localement.
- ✅ Aucun credential/token en localStorage ; aucun email/ID interne/password/recovery public.
- ✅ Profil désactivable ; désactivé inaccessible publiquement.
- ✅ Utilisateur modifie son propre profil ; ne modifie pas celui d'un autre ; guest en
  lecture seule.
- ✅ Aucun `p_user_id` client ; aucun service-role ; RLS conservée.
- ✅ Community agrégée ; aucun follow/follower/friend/like/comment/DM/feed/classement.
- ✅ Tests M38 verts ; tous les tests précédents verts ; node --check vert ; bash -n vert ;
  run-all.sh vert ; documentation mise à jour.

## FINAL ARCHITECTURAL PRINCIPLE

**Account = privé. Public Web = Journey + Public Profiles + Community. Les profils publics
montrent les accomplissements d'apprentissage. NullSec ne devient toujours pas un réseau
social.** `learn → complete → build your public learning identity` — sans follow, feed, likes,
messagerie ni profil local.
