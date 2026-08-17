# Milestone 34 — Account & Journey UX Finalization

> **Statut :** implémenté. Tests **LOCAL / MOCKED / STATIC** verts.
> **REAL SUPABASE: BLOCKED** — **REAL BROWSER: BLOCKED** (pas de projet/secret/navigateur
> accessibles depuis l'environnement).
>
> **Principe final :** *pas de profil local. Pas de profil public. Pas d'email. Pas de
> progression anonyme. Pas de progression localStorage. Username + password = login normal.
> Recovery key = récupération uniquement. Account = espace privé. Journey = progression privée.
> Community = statistiques agrégées.*

---

## AUDIT FINDINGS

- **Account (M33)** : `profile.html`/`profile.js` avaient déjà la bonne base (formulaires
  Sign in / Create account / Recover username+password, recovery séparée).
- **Doublons/bugs UX** : `profile.html` contenait **deux** sections « Your Progress » et une
  section « Settings » ; le résumé Account affichait un texte générique invité/connecté sans
  distinguer la passerelle.
- **Journey** : le CTA invité disait « Start your Learning Journey — track your campaigns »
  ; la cible M34 est « Your Learning Journey — save your mission progress… » avec
  « Already have an account? [Sign in] ».
- **Legacy UI** : `community.html:129` disait « local progress storage » ; `utils.js` contenait
  du code mort `avatarSvg` (concept avatar).
- **Aucun email**, aucun `loginWithRecoveryKey`, aucun lien « Profile » legacy, aucun
  localStorage de données de compte. Backend M33 intact.

## ROOT CAUSE

Après M33, le backend/auth étaient corrects, mais l'UX Account/Journey gardait des résidus
d'architecture local-first (doublon « Your Progress », texte générique invité, CTA Journey
imprécis, mention « local progress storage », code avatar mort). M34 est une **finalisation UX**
sans modification backend ni du contrat d'authentification.

## CHANGES

### Fichiers modifiés
- `assets/js/profile.js` — page Account : passerelle invité (Sign in / Create account) vs
  username privé authentifié (`@username`) ; stats/settings/recovery rendus seulement pour le
  propriétaire authentifié ; bouton Reset progress visible uniquement authentifié.
- `profile.html` — suppression du doublon « Your Progress » ; organisation claire en
  Account / Authentication / Recovery / Progress / Settings.
- `assets/js/journey.js` — CTA invité aligné M34 (« Your Learning Journey », « save your
  mission progress across devices », « Already have an account? [Sign in] »).
- `assets/css/components.css` — style `.journey-auth-signin`.
- `assets/css/pages.css` — styles `.profile-account-username`, `.profile-gate-actions`,
  `.profile-account-note`.
- `assets/js/utils.js` — suppression du code mort `avatarSvg` (concept avatar).
- `community.html` — « local progress storage » → « Create an account to save your progress ».
- `tests/m30-tests.mjs`, `tests/m32-tests.mjs` — adaptés au nouveau CTA Journey.
- `tests/m34-tests.mjs` — **créé** (60 assertions).
- `tests/run-all.sh` (étape 23), `tests/README.md`.
- `docs/account-based-progression.md`.

### Fichiers créés
- `tests/m34-tests.mjs`
- `MILESTONE-34-REPORT.md`

### Fichiers supprimés
- Aucun (suppression d'une fonction morte `avatarSvg` dans `utils.js` uniquement).

### Migrations modifiées/ajoutées
- **Aucune.** `0001→0017` intactes. Backend **non modifié** (M34 = frontend/UX).

### RPC modifiés
- **Aucun.**

## ACCOUNT UX

- **Invité** : la page Account est une **porte d'entrée** :
  « Your NullSec account keeps your progression private and synchronized » + `[Sign in]`
  `[Create account]`. Pas de faux profil vide, pas de « Local / Anonymous ».
- **Authentifié** : la page affiche `@username` (identifiant privé) puis les sections
  Authentication / Recovery / Progress / Settings.
- Aucun avatar, bio, followers, statistiques personnelles publiques, profile card.

## JOURNEY UX

- **Invité** : CTA « Your Learning Journey — Create an account to save your mission progress
  and continue your journey across devices » + `[Create account]` + « Already have an
  account? [Sign in] ». Aucune mission marquée complétée, aucune progression locale.
- **Authentifié** : « Your Progress (saved to your account — resumes on any device) » puis les
  missions. La complétion passe par `Progress → Sync → ns_sync_push → Supabase`.

## AUTHENTICATION

- Sign in = username + password. Create account = username + password. Aucun email, aucune
  recovery key dans les formulaires normaux. Erreur générique « Invalid username or password ».
- Contrat backend M33 **inchangé** (`ns_register`/`ns_login`/`ns_recover`).

## RECOVERY

- Récupération séparée du Sign in (section distincte). `ns_recover` vérifie la recovery key,
  établit un nouveau password, ne crée pas de session. L'utilisateur se reconnecte normalement.

## STORAGE

```
localStorage:     ns:theme, ns:migrated:v1
sessionStorage:   ns:session:auth, ns:session:recovery
```

Aucune nouvelle clé. Aucun credential/token/password en localStorage ; aucun password en
sessionStorage (testé).

## SECURITY

- **RLS inchangée / non affaiblie.** Backend M33 conservé.
- La progression privée reste serveur (RLS + RPC `SECURITY DEFINER`).
- Sign out supprime la session, repasse en guest, bloque la progression, ne supprime rien sur
  le serveur.
- Token invalide → guest. Le frontend n'est jamais l'autorité de sécurité.
- Aucun service-role key en frontend ; aucune donnée individuelle dans Community.

## COMMUNITY PREPARATION

Audit `community.html`/`community.js` : pas de données individuelles, de usernames publics,
d'avatars ni de cartes utilisateurs. Les occurrences « anonymous » restantes désignent des
**statistiques agrégées** (VALID). Le redessin complet Community (agrégats uniquement) reste
un milestone futur ; il devra conserver l'isolation actuelle et n'ajouter aucun profil.

## TESTS

Suite complète `run-all.sh` — **toutes vertes** :
- sql-audit 240 · m14 59 · m15 44 · m16 22 · m17 47 · m18 38 · m19 29 · m20 61 · m21 26 ·
  m22 23 · m24 25 · m25 24 · m26 26 · m27 43 · m28 72 · m28-deploy 26 · m29 19 · m30 28 ·
  m31 31 · m32 45 · m33 56 · **m34 60**
- **Total : 1044 assertions vertes.**

`tests/m34-tests.mjs` (60) : Account (passerelle invité, username privé, pas d'email/avatar/
bio), Journey (CTA invité, guest ne complète pas, pas de progression locale, auth complète via
Sync, sign out bloque, sign in restaure), Navigation (Sign out connecté, pas de lien/text
Profile legacy), Recovery (séparée, pas de session directe), Storage (localStorage seulement
theme/migration, pas de credential/token/password), Community (pas de user/avatar/profil,
plus de « local progress storage »), Legacy (aucun loginWithRecoveryKey, aucun email).

**JS syntax** : `node --check` sur tous les JS + tests — OK. **Shell** : `bash -n`
(run-all.sh, deploy.sh, apply-sql.sh) — OK.

## REMAINING LIMITATIONS

- **LOCAL / STATIC / MOCKED** : validation via harness Node + audit statique.
- **REAL SUPABASE : BLOCKED** — aucune exécution contre la production (pas de projet/secret).
- **REAL BROWSER : BLOCKED** — le rendu DOM des pages Account/Journey n'a pas été validé
  visuellement (pas de navigateur).
- Le redessin complet de la **page Community** (agrégats uniquement, aucune donnée
  individuelle) reste un milestone futur. La refonte « Campaigns » du Journey est documentée
  comme follow-up (IA cible `Journey → Campaigns → Missions → Progress`).

## ACCEPTANCE CRITERIA

- ✅ Account = espace privé.
- ✅ Aucun concept de profil local dans l'UI.
- ✅ Aucun profil public.
- ✅ Username affiché uniquement dans Account (`@username`).
- ✅ Aucun email.
- ✅ Sign in = username + password.
- ✅ Create account = username + password.
- ✅ Recovery = mécanisme séparé.
- ✅ Recovery ne crée pas directement de session.
- ✅ Guest ne possède aucune progression.
- ✅ Guest ne peut pas compléter une mission.
- ✅ Authenticated peut compléter une mission.
- ✅ Progression persistée via Supabase.
- ✅ Sign out bloque immédiatement la progression.
- ✅ Sign in recharge la progression.
- ✅ Aucun nouveau localStorage.
- ✅ Aucun credential dans localStorage.
- ✅ Aucun token dans localStorage.
- ✅ Community ne montre aucun utilisateur individuellement.
- ✅ Aucun avatar social.
- ✅ Aucun lien Profile legacy.
- ✅ Aucun texte « Local Profile » / « saved locally » / « local progress storage ».
- ✅ Backend M33 conservé.
- ✅ RLS conservée.
- ✅ Tests existants verts ; `m34-tests.mjs` vert ; `node --check` vert ; `bash -n` vert ;
  `run-all.sh` vert.
- ✅ Documentation mise à jour.
