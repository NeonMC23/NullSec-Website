# Milestone 39 — Public Profile Discovery, Sharing & Identity UX

> **Statut :** implémenté. Tests **LOCAL / MOCKED / STATIC** verts.
> **REAL SUPABASE : BLOCKED** — **REAL BROWSER : BLOCKED** (pas de déploiement réel ni de
> validation navigateur ; aucun projet/secret/navigateur disponible).
>
> **Principe :** *M38 a transformé le Public Profile en une véritable identité publique
> d'apprentissage. M39 rend cette identité découvrable, partageable et cohérente, sans
> transformer NullSec en réseau social.*

---

## AUDIT

- **M38** fournissait : profil public opt-in (bio, interests, member-since), RPC
  `ns_public_profile` / `ns_update_public_profile`, achievements dérivés, section Public
  Profile dans Account.
- **URL actuelle** : `public-profile.html?u=<username>` — robuste pour un site statique.
- **Références URL** : dupliquées à la main dans `profile.js` (2 endroits) ; aucune URL
  centralisée ; aucun partage ; pas de lien Journey → profil ; pas d'état « vide » explicite.

## ARCHITECTURE RETENUE (pas de découpage nécessaire)

L'audit a montré que **la fondation statique suffit** :
- Le routing `?u=` est conservé (pas de router complexe ; pas d'infrastructure inutile).
- Les RPC M38 suffisent — **aucun changement backend, aucune migration, aucun nouveau RPC**.
- M39 est donc un **milestone frontend unique et propre** (pas besoin de M39A/B/C).

## ROUTING RETENU

```text
public-profile.html?u=<username>
```

Centralisé dans `PublicProfile.getUrl(username)`. Toutes les références (Account, Journey,
profil) utilisent cette fonction.

## CHANGES

### Fichiers modifiés
- `assets/js/public-profile.js` — `getUrl(username)` (URL canonique), `share(username)`
  (navigator.share → clipboard → fallback, sans réseau ni stockage), header « Public learning
  identity », état « vide », boutons « Share public profile » + « Explore Learning Journey »,
  export `getUrl`/`share` dans `window.PublicProfile`.
- `assets/js/profile.js` — section Public Profile utilise `PublicProfile.getUrl` + ajoute
  « Share public profile » ; lien « View public profile » centralisé.
- `assets/js/journey.js` — lien discret « View your public learning profile » (authentifié,
  gated sur `window.PublicProfile && window.Auth`).
- `journey.html` — chargement de `public-profile.js` (pour `PublicProfile.getUrl`).
- `tests/m37-tests.mjs` — assertion adaptée à la nouvelle URL centralisée.
- `tests/m39-tests.mjs` — **créé** (44 assertions).
- `tests/run-all.sh` (étape 28), `tests/README.md`.
- `docs/public-profiles.md`.

### Fichiers créés
- `tests/m39-tests.mjs`
- `MILESTONE-39-REPORT.md`

### Fichiers supprimés
- Aucun.

### Migrations / RPC
- **Aucun changement.** 18 migrations, 20 RPC (M38) inchangés. `0001→0018` non réécrites.

## SHARING

- `navigator.share()` si disponible ; sinon clipboard ; sinon fallback UI.
- Après copie : « Profile link copied. »
- **Jamais envoyé à un serveur** ; l'URL identifie simplement le profil public.
- Aucun stockage local.

## UX

- **Profile header** : `@username`, label « Public learning identity », Member since, bio,
  interests, progression globale, progression par campagne, achievements. Aucun avatar.
- **États** : loading, not-found/disabled (non-énumératif), empty (« No missions completed
  yet »), populated.
- **Navigation** : Account → Profile ; Profile → Journey (« Explore Learning Journey ») ;
  Journey → Profile (authentifié, discret).

## SÉCURITÉ

- RLS inchangée ; RPC `SECURITY DEFINER` ; aucun `p_user_id` client ; aucun service-role.
- Aucun credential/token/ID interne dans le profil public ou le code frontend.
- Profil opt-in ; désactivé inaccessible publiquement (réponse non-énumératrice).

## STORAGE

`localStorage` = `ns:theme`, `ns:migrated:v1` ; `sessionStorage` = `ns:session:auth`,
`ns:session:recovery`. Aucun username/bio/interests/progression/achievement stocké localement.
Le clipboard/navigator.share ne sont pas du stockage applicatif.

## SOCIAL GUARD

Aucune fonctionnalité follow/friend/like/comment/DM/feed/timeline/leaderboard/user directory.
Community reste agrégée. Tests de garde contre l'introduction accidentelle.

## TESTS

Suite complète `run-all.sh` — **toutes vertes** :
- sql-audit 249 · m14 59 · m15 44 · m16 22 · m17 47 · m18 38 · m19 29 · m20 61 · m21 26 ·
  m22 23 · m24 25 · m25 24 · m26 26 · m27 43 · m28 73 · m28-deploy 28 · m29 19 · m30 28 ·
  m31 31 · m32 45 · m33 56 · m34 60 · m35 80 · m36 86 · m37 130 · m38 59 · **m39 44**
- **Total : 1455 assertions vertes.**

`tests/m39-tests.mjs` (44) : URL canonique + partage (déterministe, navigator.share/clipboard,
sans réseau ni stockage), déterministe des URLs, partage sans API → fallback, états UX,
navigation (Account→Profile, Journey→Profile, Profile→Journey), sécurité (aucun
credential/token/ID/p_user_id/service-role), storage (aucune nouvelle clé), garde
anti-réseau-social + Community agrégée, Journey public + guests ne modifient pas, cross-device
profil public.

**node --check** : tous les fichiers concernés — OK. **bash -n** : run-all.sh, deploy.sh,
apply-sql.sh — OK.

## LIMITATIONS

- **LOCAL / STATIC / MOCKED** : validation via harness Node + audit statique.
- **REAL SUPABASE : BLOCKED** — aucun déploiement réel ; code préparé pour le futur.
- **REAL BROWSER : BLOCKED** — rendu DOM réel et `navigator.share`/clipboard réels non
  validés.
- **Meta partage dynamique** : le site est statique et les données sont chargées en JS ; les
  crawlers ne verront pas de meta dynamique. Limitation documentée, sans introduire de backend
  / server-rendering.

## ACCEPTANCE CRITERIA

- ✅ Profil présenté comme identité d'apprentissage publique ; séparé de Account.
- ✅ Opt-in ; username/bio/interests/member-since/progression/campagnes/achievements affichés.
- ✅ Progression dérivée (aucun doublon) ; profile vide/disabled/not-found gérés.
- ✅ URL publique déterministe, centralisée ; Account→Profile, Profile→Journey,
  Journey→Profile fonctionnent.
- ✅ Sharing fonctionne (navigator.share / clipboard / fallback), sans réseau ni stockage.
- ✅ Aucun profil stocké localement ; aucun credential/token/ID exposé.
- ✅ Aucun `p_user_id` client ; RLS inchangée ; aucun service-role.
- ✅ Aucun follow/friend/like/comment/DM/feed ; Community agrégée ; Journey public ;
  guests ne modifient pas ; authentifiés modifient leur progression.
- ✅ M14→M38 verts ; M39 vert ; node --check vert ; bash -n vert ; run-all.sh vert.
- ✅ Aucun déploiement Supabase réel ; aucune validation navigateur réelle prétendue.

## FINAL ARCHITECTURAL PRINCIPLE

**NullSec peut avoir une véritable identité publique d'apprentissage.** Le profil permet de
dire « voilà ce que j'apprends et ce que j'ai accompli » — sans que NullSec devienne « voilà
ceux que je suis, ceux qui me suivent et mon feed ». `PUBLIC PROFILE ≠ SOCIAL NETWORK` ;
`ACCOUNT ≠ PUBLIC PROFILE` ; `COMMUNITY ≠ USER DIRECTORY` ; `PROGRESS ≠ LOCAL DATA`.
