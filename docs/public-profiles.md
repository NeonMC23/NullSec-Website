# Public Profiles & Public Learning Progress (Milestone 37)

> **Principe :** *A NullSec account is private, but learning activity does not have to be
> private. Journey, Campaigns and Missions are public learning content. An authenticated user's
> learning progress may be displayed through an explicit public profile. NullSec is still not a
> social network.*

## Modèle final

```
ACCOUNT      PRIVATE       username / password / recovery / session / settings
PUBLIC PROFILE  PUBLIC     username + learning statistics
JOURNEY      PUBLIC        Campaigns → Missions (browsable), progression writable only by owner
COMMUNITY    AGGREGATED    global stats, countries, activity, metrics
SOCIAL NETWORK  N'EXISTE PAS  no follows / followers / friends / DMs / likes / feeds
```

## Ce qui est public vs privé

**Public (public profile / Journey) :**
- username (comme identité d'apprentissage publique) ;
- progression d'apprentissage (missions complétées, campagnes complétées, % global) ;
- campagnes et missions (définitions d'apprentissage) ;
- statistiques d'apprentissage par campagne.

**Privé (Account) :**
- password / password hash ;
- recovery key / recovery hash ;
- session / token ;
- identity UUID / user ID interne ;
- réglages privés, métadonnées d'authentification ;
- email, IP, device, infos de session.

## Architecture

### RPC `ns_public_profile(p_username)`

`SECURITY DEFINER` + `search_path = public`. Résout le username serveur (insensible à la
casse), lit la progression canonique (`user_progress.progress_json`) et retourne uniquement :

```json
{
  "username": "NeonY23",
  "completed_mission_ids": ["enable-2fa", "..."]
}
```

Aucune donnée privée (user_id, identity_id, password, recovery, session, email) n'est
retournée. RLS sur les tables privées **inchangée** — `anon` n'accède qu'à cette projection
publique via le RPC `SECURITY DEFINER`.

### Frontend `public-profile.html` + `public-profile.js`

- Route statique : `public-profile.html?u=<username>`.
- `PublicProfile.computeStats(missions, completedSet)` dérive, de façon **déterministe** :
  - missions complétées / total ;
  - campagnes complétées / total ;
  - % global et % par campagne ;
  - en joignant `data/missions.json` (définitions publiques) + `completed_mission_ids`
    (progression canonique serveur).
- Aucune duplication de progression : la source de vérité reste le serveur.
- Aucun stockage local pour le profil public.

### Account → lien public

La page Account (privée) ajoute un lien « View public profile » pointant vers
`public-profile.html?u=<username>`.

## Privacy & sécurité

- Le lookup public est **autorisé pour `anon`** (lecture du RPC public uniquement) ;
  l'accès au compte privé / à la progression privée / à l'API privée reste **refusé** pour anon.
- L'existence d'un profil public ne contourne jamais RLS ni l'autorisation des RPC privés.
- Aucun `p_user_id` contrôlé par le client ; aucun service-role key.

## Pas de réseau social

Aucune fonctionnalité sociale implémentée : follows, followers, friends, likes, comments, DMs,
feed, notifications inter-utilisateurs, recommandations, réputation. Un profil est simplement
une représentation publique de la progression d'apprentissage.

## Community

Community reste agrégée et **indépendante** des profils publics : elle ne devient pas un
annuaire d'utilisateurs, n'affiche pas de usernames dans les classements ni de cartes de profil.

## M38 — Personnalisation du profil public & identité d'apprentissage

Le profil public devient une **identité d'apprentissage publique** configurable par son
propriétaire :

- **Opt-in** : `public_profile_enabled` — si désactivé, le profil est inaccessible
  (`enabled:false` non-énumératif, identique à « utilisateur inexistant »).
- **Bio publique** (≤ 280 caractères) et **learning interests** (≤ 8 tags) — champs publics
  explicites, stockés dans `user_profiles` (migration `0018_public_profile.sql`).
- **Member since** : `created_at` (date publique d'ancienneté).
- **Statistiques dérivées** : progression globale, progression par Campaign, missions
  complétées — calculées de façon déterministe depuis `completed_mission_ids` + `missions.json`.
- **Achievements dérivés** : système déterministe (First Mission, 10/25/50 Missions,
  Campaign Starter, All Campaigns) calculé depuis la progression publique uniquement.

### RPC

- `ns_public_profile(p_username)` — lecture publique (anon), retourne uniquement
  `enabled, username, bio, learning_interests, created_at, completed_mission_ids`.
- `ns_update_public_profile(p_token, p_public_profile_enabled, p_bio, p_learning_interests)` —
  mise à jour authentifiée, identité dérivée de la session (jamais un `p_user_id` client),
  ne modifie que son propre profil, ne permet pas de changer le username.

### Account

La page Account (privée) gagne une section **Public Profile** : activer/désactiver la visibilité,
éditer la bio et les intérêts, et un lien « View public profile ».

### Pas de réseau social

Toujours aucune fonctionnalité sociale (follow/follower/like/comment/DM/feed). Le profil est
une identité d'apprentissage publique, pas un profil social.

## M39 — Découverte, partage & UX d'identité

- **URL canonique centralisée** : `PublicProfile.getUrl(username)` →
  `public-profile.html?u=<username>`. Toutes les références (Account, Journey, profil)
  utilisent cette fonction (aucune URL reconstruite à la main).
- **Partage** : `PublicProfile.share(username)` — `navigator.share()` si disponible, sinon
  clipboard, sinon fallback UI. Aucun réseau, aucun stockage local.
- **Navigation** :
  - Account → Public Profile (view / share / edit / enable).
  - Journey → « View your public learning profile » (authentifié, discret).
  - Public Profile → « Explore Learning Journey ».
- **États** : loading, not-found, disabled (`enabled:false` non-énumératif), empty
  (« No missions completed yet »), populated.
- **Header de profil** : `@username`, label « Public learning identity », Member since, bio,
  interests, progression, campagnes, achievements. Aucun avatar social.
