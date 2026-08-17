# Milestone 35 — Real Account Architecture & Private Account UX

> **Statut :** implémenté. Tests **LOCAL / MOCKED / STATIC** verts.
> **REAL SUPABASE: BLOCKED** — **REAL BROWSER: BLOCKED** (pas de projet/secret/navigateur
> accessibles depuis l'environnement).
>
> **Principe :** *NullSec utilise de vrais comptes serveur, comme un site web classique. Un
> compte est créé une fois, puis l'utilisateur peut se reconnecter depuis n'importe quel
> appareil avec son username et son password. Il n'existe aucun compte local, aucune donnée de
> compte persistée localement et aucun profil social/public.*

> Note : ce milestone partage le numéro M35 avec le milestone *Community Dashboard &
> Aggregated Intelligence* précédent. Le présent rapport couvre spécifiquement
> **l'architecture de compte réel**. Le fichier de test `tests/m35-tests.mjs` a été **étendu**
> pour couvrir les deux aspects (Community + Real Account).

---

## AUDIT FINDINGS

- L'architecture **username + password + recovery** (M32/M33) était déjà en place, avec
  `ns_register`/`ns_login`/`ns_recover`/`ns_logout`/`ns_validate_session`.
- **Écart M35 1** : à la **restauration de session**, `Auth.applySession(saved.token, localId)`
  passait l'UUID local comme `username` → après un rechargement, `@<uuid>` s'affichait au lieu
  de `@username`.
- **Écart M35 2** : après sign-in, `runSyncAndRefresh()` faisait `Sync.push()` **sans pull** →
  sur un autre appareil, la progression serveur n'était pas chargée.
- **Écart M35 3** : `Sync.sync()` (pull→resolve→push) écrivait la progression serveur dans
  `ProgressRepository`, mais `Progress.state` (cache mémoire séparé) ne se rechargeait pas →
  la progression serveur n'apparaissait pas dans l'UI Journey.
- **Constat** : `signIn`/`createAccount` ne dépendent d'aucun Identity local ni localStorage →
  le cross-device était déjà possible au niveau logique ; les écarts étaient UI/cohérence.
- Backend `0001→0017` : **intact**, satisfait le modèle de compte serveur.

## ROOT CAUSE

M34 finalisait l'UX mais ne garantissait pas encore le comportement **cross-device** complet :
la session devait préserver le username serveur, et le sign-in devait recharger la progression
serveur dans l'état de progression en mémoire. Trois correctifs ciblés étaient nécessaires, tous
frontend.

## CHANGES

### Fichiers modifiés
- `assets/js/session-service.js` — restauration : préserve le **username serveur** stocké en
  sessionStorage (au lieu de l'UUID local).
- `assets/js/progress-service.js` — ajout de `Progress.reload()` (recharge `Progress.state`
  depuis `ProgressRepository`) + export.
- `assets/js/profile.js` — `runSyncAndRefresh()` utilise `Sync.sync()` (pull→resolve→push) au
  lieu de `push()` seul, puis `Progress.reload()` et `renderAll()`.
- `assets/js/identity.js` — terminologie commentaire (« legacy fields »).
- `tests/m35-tests.mjs` — **étendu** (sections 10–15 : Real Account).
- `tests/run-all.sh`, `tests/README.md` — libellé de l'étape 24 mis à jour.
- `docs/authentication.md`, `docs/account-based-progression.md`.

### Fichiers créés
- `MILESTONE-35-REPORT-ACCOUNT.md` (ce rapport).

### Fichiers supprimés
- Aucun.

### Migrations ajoutées
- **NONE.** `0001→0017` intactes. Le schéma M32/M33 satisfait déjà le modèle de compte serveur.

### RPC modifiés
- Aucun.

## AUTHENTICATION FLOW

```
Guest
  ↓
Sign in / Create account  (username + password)
  ↓
ns_login / ns_register
  ↓
Authenticated session  (server-authoritative)
  ↓
Account / Journey
```

- Sign in = username + password uniquement. Recovery key = récupération uniquement.
- Erreur générique « Invalid username or password » (pas d'énumération).

## RECOVERY

`ns_recover` (M33) : vérifie la recovery key, établit un nouveau password, révoque les sessions
existantes, ne crée **pas** de session. L'utilisateur se reconnecte normalement.

## CROSS-DEVICE / SOURCE DE VÉRITÉ

```
DEVICE A: Create account → Supabase → Account exists
DEVICE A: Sign out
DEVICE B: Open → Sign in (username+password) → Supabase → same account → same progression
```

- **Aucune donnée locale requise** pour retrouver le compte (testé : mock serveur partagé,
  device B sans identity/recovery/session locale).
- Après sign-in, `Sync.sync()` (pull→resolve→push) + `Progress.reload()` restaurent la
  progression serveur.
- La restauration de session préserve le **username serveur** (jamais un UUID local).

## SESSION MANAGEMENT

```
Username + Password → RPC → Session token → sessionStorage (ns:session:auth)
```

- Session temporaire en sessionStorage uniquement. Jamais en localStorage.
- Sign out : `ns_logout` (best-effort) + suppression de la session locale → guest, Journey
  bloqué. Aucune progression serveur supprimée.
- Token invalide → guest.

## STORAGE

```
localStorage:     ns:theme, ns:migrated:v1
sessionStorage:   ns:session:auth, ns:session:recovery
```

Aucune donnée de compte (username/password/token/recovery/user_id/progress/account/profile)
en localStorage (testé).

## SECURITY

- **RLS inchangée / non affaiblie.** Backend M33/M34 conservé.
- Tables privées fermées à `anon` ; RPC `SECURITY DEFINER` + `search_path = public`.
- Session token validé côté serveur. Sign out invalide la session. Recovery révoque les
  sessions existantes.
- Aucun service-role secret en frontend ; aucun `p_user_id` client contrôlé.
- Le frontend n'est pas une autorité de sécurité.

## DATA OWNERSHIP

```
USER ACCOUNT DATA → SUPABASE → authenticated user only
COMMUNITY DATA → Aggregation → public statistics
```

La Community n'obtient jamais les données personnelles des comptes.

## COMMUNITY

Indépendante du concept de profil : uniquement des statistiques agrégées
(`ns_country_metrics`, `ns_metrics`). Aucun username/avatar/user card/progression individuelle.

## TESTS

Suite complète `run-all.sh` — **toutes vertes** :
- sql-audit 240 · m14 59 · m15 44 · m16 22 · m17 47 · m18 38 · m19 29 · m20 61 · m21 26 ·
  m22 23 · m24 25 · m25 24 · m26 26 · m27 43 · m28 72 · m28-deploy 26 · m29 19 · m30 28 ·
  m31 31 · m32 45 · m33 56 · m34 60 · **m35 80**
- **Total : 1124 assertions vertes.**

Sections M35 Real Account ajoutées dans `tests/m35-tests.mjs` (80 au total, incluant les 45
Community d'origine) :
- **10. Cross-device** : device A crée, device B (mock serveur partagé, sans données locales)
  se connecte via `ns_login` — aucune donnée locale requise.
- **11. Source de vérité serveur** : après effacement des données locales, le sign-in restaure
  le même compte.
- **12. Session** : sessionStorage uniquement les clés approuvées ; restauration préserve le
  username serveur ; pas de password en sessionStorage.
- **13. Journey** : guest ne peut pas écrire, auth peut, reload préserve, sign out bloque.
- **14. Storage** : localStorage seulement theme/migration ; aucun username/password/token/
  recovery/user_id/progress/account/profile.
- **15. Legacy** : aucun loginWithRecoveryKey, local profile, email, profil public.

**node --check** : tous les JS + tests — OK. **bash -n** : run-all.sh, deploy.sh,
apply-sql.sh — OK.

## REMAINING LIMITATIONS

- **LOCAL / STATIC / MOCKED** : validation via harness Node + audit statique.
- **REAL SUPABASE : BLOCKED** — aucun `ns_login`/`ns_sync_pull` réel contre la production.
- **REAL BROWSER : BLOCKED** — le rendu DOM cross-device (sessionStorage, rechargement) n'a
  pas été validé visuellement.

## ACCEPTANCE CRITERIA

- ✅ Compte créé une fois, côté serveur (Supabase).
- ✅ Compte ne dépend pas du navigateur.
- ✅ Revenir plus tard / autre appareil : sign in username+password → même compte.
- ✅ Aucun email.
- ✅ Recovery key = récupération uniquement ; ne crée pas de session.
- ✅ Username privé, visible uniquement dans Account.
- ✅ Aucun profil public / réseau social / avatar / follower / user directory / classement.
- ✅ Aucun compte local / progression locale / fallback localStorage.
- ✅ Aucune donnée de compte dans localStorage ; session temporaire en sessionStorage.
- ✅ Progression exclusivement serveur ; Journey restauré après sign-in / autre appareil.
- ✅ Sign out bloque immédiatement les données privées.
- ✅ Community uniquement agrégée.
- ✅ RLS conservée ; aucun service-role ; aucun accès cross-user.
- ✅ Tests existants verts ; m35 vert ; node --check vert ; bash -n vert ; run-all.sh vert.
- ✅ Documentation mise à jour.

## FINAL ARCHITECTURAL PRINCIPLE

**Un compte NullSec est un vrai compte serveur privé.** `Create account once → Supabase →
Leave website → Return later → Sign in with username + password → Same server-side account →
Same private progression.` Le navigateur n'est jamais la source de vérité.

`ACCOUNT ≠ PROFIL SOCIAL ≠ PAGE MEMBRE COMMUNITY`. Account est privé. Journey est privé.
Community est agrégée. Il n'existe aucun profil public, aucun compte local, aucune donnée de
compte stockée localement de façon persistante. Username + password est le seul mécanisme de
connexion normal ; la recovery key sert uniquement à récupérer le compte.
