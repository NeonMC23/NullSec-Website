# Account-Based Progression & Auth UX

> **Milestone 30.** Un compte est **uniquement** un conteneur privé de progression et
> une source de statistiques communautaires agrégées. **Ce n'est PAS un système de
> profil social.**

## Architecture cible

```
Guest
  ↓
Public website only                       (navigation, articles, tools, missions browsables)

Authenticated user
  ↓
Supabase (source de vérité)
  ↓
Private progression                       (missions, campagnes, pays, activité)
```

- Les **invités** peuvent parcourir le contenu public, mais **ne peuvent pas** créer/sauver
  un Learning Journey localement.
- Seul un **utilisateur authentifié** a accès à sa progression privée, persistée **côté
  serveur (Supabase)**. Le rafraîchissement de page et la connexion depuis un autre appareil
  restaurent la même progression.

## 1. Flux d'authentification

**M32** : le parcours principal est **username + password** (pas d'email). La recovery
key sert à la **récupération** du compte, pas à la connexion normale.
Voir **`docs/authentication.md`**.

- `Auth.createAccount(username, password)` → `ns_register` (crée compte + session, génère
  une recovery key affichée une fois).
- `Auth.signIn(username, password)` → `ns_login`.
- `Auth.recoverAccount(username, recoveryKey, newPassword)` → `ns_recover`
  (récupération : établit un nouveau password, ne crée pas de session ; l'utilisateur se
  reconnecte normalement).
- Password et recovery key : seuls des SHA-256 transport hashes sont envoyés ; hash bcrypt
  stocké côté serveur. Jamais en localStorage.
- `Auth.isAuthenticated()` = vrai uniquement après une session validée (token + username
  en sessionStorage). **Jamais** restauré depuis localStorage.

### État déconnecté (M34)
La page Learning Journey affiche un appel à l'action au lieu de la progression privée :

> **Your Learning Journey**
> Create an account to save your mission progress and continue your journey across devices.
> `[ Create account ]`
> Already have an account? `[ Sign in ]`

Aucun fallback de progression local. Les missions restent **consultables** (contenu éducatif
public), mais la **complétion est bloquée**.

### État connecté
La page Learning Journey affiche la progression privée :
- missions complétées / restantes,
- campagne de la semaine,
- pourcentage de progression,
- pays sélectionné et activité personnelle (via la vue privée du compte `profile.html`).

## 2. Modèle de données (back-end Supabase)

Le back-end répond **déjà** au modèle. Aucune modification de schéma n'a été nécessaire.

```
Account   = public.users          (id, identity_id, created_at)
Progress  = public.user_progress  (user_id, progress_json: missions/articles/weekly)
Country   = public.user_profiles.country_code  +  public.country_membership
Auth      = public.sessions       (token_hash) + public.recovery_credentials
Activity  = public.community_activity_events   (agrégat anonyme)
```

### RPC déjà disponibles (réutilisés, pas de doublons)
| RPC | Rôle |
|-----|------|
| `ns_register` / `ns_login` / `ns_recover` / `ns_logout` / `ns_validate_session` | auth username+password + récupération |
| `ns_sync_pull` / `ns_sync_push` | progression privée (pull/push, token-authentifié) |
| `ns_update_profile` | pays / profil minimal de son propre compte |
| `ns_record_activity` | activité agrégée (mission_completed / tool_used / community_action) |
| `ns_country_metrics` / `ns_activity` / `ns_metrics` | statistiques communautaires agrégées |

### RLS (non affaiblie)
- Tables privées (`users`, `recovery_credentials`, `sessions`, `user_profiles`,
  `user_settings`, `user_progress`, `country_membership`) : **aucun accès anon** ; lecture/
  écriture uniquement via RPC `SECURITY DEFINER` token-authentifiés.
- Agrégats publics : `SELECT` anon autorisé ; jamais de données individuelles.
- **Le pays est privé au niveau individuel** — la couche communautaire n'expose que des
  agrégats (ex. `284 participants — France`), jamais `Nom — France`.
- Aucune clé service-role en frontend.

## 3. Gating du Learning Journey (implémenté)

- `journey.js` : `isAuthenticated()` ; si invité → CTA dans `#progress-overview`, la
  complétion de mission est bloquée (`toggleMission` refuse et affiche le CTA).
- `progress-service.js` : `Progress.complete()` / `Progress.uncomplete()` refusent un invité
  (défense en profondeur — **aucune complétion de mission locale/anonyme**).
- `home.js` : la mission hebdomadaire montre un CTA « Create account to track progress » aux
  invités au lieu du bouton « Mark as done ».
- La persistance serveur utilise le **sync layer existant** (`Sync.push()` → `ns_sync_push`),
  déclenché après toute mutation de progression d'un utilisateur connecté.

## 4. Audit du stockage local (documentation pour nettoyage)

| Clé | Type | État |
|-----|------|------|
| `ns:theme` | localStorage | **Légitime** (préférence appareil) — conservé |
| `ns:journey:progress` | localStorage | **Supprimée** (purge `Store.migrate()`) |
| `ns:weekly:progress` | localStorage | **Supprimée** (purge `Store.migrate()`) |
| `ns:article:read:*` | localStorage | **Supprimée** (purge `Store.migrate()`) |
| `ns:identity`, `ns:user:profile`, `ns:progress`, `ns:settings`, `ns:auth`, `ns:user:state`, `ns:recovery` | localStorage | **Supprimées** (purge) — données compte mémoire uniquement |
| `ns:session:recovery` | sessionStorage | Short-lived session — conservé (nécessaire à l'auth) |
| `ns:session:auth` | sessionStorage | Short-lived session token — conservé |

Les données de **compte** (identity/profile/progress/settings) ne sont **jamais** écrites en
localStorage : elles vivent en mémoire (session page) et leur source de vérité est **Supabase**.

## 5. Nettoyage legacy (M31)

> Voir **`docs/legacy-cleanup.md`** pour le détail complet.

- **Fait (M31)** : suppression du profil local (champs `Identity.username/display_name/avatar`,
  avatar + éditeur de pseudo dans `profile.js`), suppression de la purge localStorage obsolète
  et des clés de progression legacy, suppression du mode `'local'`, renommage navigation
  `Profile` → `Account`, suppression du composant legacy `assets/js/legacy/community-map.js`.
- **Restant (milestones futurs)** : redessin de la page **Community** (agrégats uniquement),
  refonte du parcours Journey, suppression des backends legacy `backend/legacy-express/` et
  `backend/supabase/legacy-ts/`.

## 5bis. Finalisation UX Account & Journey (M34)

- **Page Account** (`profile.html` / `profile.js`) : pour un **invité**, la page est une
  **porte d'entrée** claire (« Your NullSec account keeps your progression private and
  synchronized » + `[Sign in]` `[Create account]`), pas un faux profil vide. Pour un
  **utilisateur authentifié**, elle affiche le **username privé** (`@username`) + les sections
  Authentication / Recovery / Progress / Settings.
- **Journey** : le CTA invité est « **Your Learning Journey** — Create an account to save
  your mission progress… » avec `[Create account]` et « Already have an account? `[Sign in]` ».
  L'utilisateur authentifié voit « Your Progress (saved to your account) ».
- Les stats, réglages et recovery ne sont rendus qu'**au propriétaire authentifié**.
- Suppression du code mort `avatarSvg` (concept avatar) ; plus aucune mention « local progress
  storage » dans l'UI.

## 6. Récapitulatif des changements (M30)

- **Frontend** : `journey.js`, `progress-service.js`, `home.js`, `journey.html`, `components.css`.
- **Back-end** : aucun changement (le modèle Supabase satisfait déjà l'exigence).
- **Tests** : nouveau `tests/m30-tests.mjs` ; `run-all.sh` (étape 19).
- **Doc** : ce fichier + `MILESTONE-30-REPORT.md`.

## 5ter. Community (M35)

> Voir **`docs/community-architecture.md`**.

- **Community est une page de statistiques agrégées**, jamais un réseau social.
- La page affiche : **Community Overview** (participants, pays, missions, activité
  communautaire), **Country Activity** (barres agrégées par pays), **Activity Breakdown**
  (missions / outils / actions communautaires / propagation), la **carte Europe**, et une
  **note de confidentialité**.
- Aucun username, avatar, user ID, liste de membres ou progression individuelle.
- Les données proviennent des agrégats backend existants (`ns_country_metrics`, `ns_metrics`).
- États loading / empty / error propres, sans valeurs fictives.


## 5quater. Vrai compte serveur & cross-device (M35)

- Le compte est **côté serveur (Supabase)**. Il est créé une fois et ne dépend pas du
  navigateur : on peut le quitter, revenir plus tard, et se reconnecter depuis **un autre
  appareil** avec username + password.
- **Sign in** ne requiert aucune donnée locale (aucun Identity local, aucun localStorage).
- La progression serveur est restaurée après sign-in via `Sync.sync()` puis
  `Progress.reload()` ; le rafraîchissement et un autre appareil restaurent la même
  progression.
- Le username serveur est préservé à la restauration de session (jamais un UUID local).
- Voir **`docs/authentication.md` §7**.


## 5quinquies. Gestion du compte & cycle de vie de session (M36)

- **Changement de password** : `Auth.changePassword` → `ns_change_password` (vérifie le
  password actuel, hash du nouveau côté serveur, révoque les autres sessions, conserve la
  session courante). Un mauvais password actuel ne déconnecte pas.
- **Reset progress serveur** : `ApiClient.resetProgress` → `ns_reset_progress`
  (réinitialise la progression du compte sur le serveur).
- **Cycle de vie** : Create → Sign in → session → Sign out → guest → re-sign in (même compte
  serveur). Session validée côté serveur ; expiration → guest ; sign out révoque la session.
- Voir **`docs/authentication.md` §8**.


## 5sexties. Parcours par campagnes (M36 Journey)

Le Learning Journey est organisé en **Campagnes → Missions** (couche d'organisation au-dessus
des missions). Les définitions de campagnes sont **publiques** ; la progression est **privée**.

- **Campagnes** : dérivées des métadonnées `stage` existantes dans `missions.json`
  (Getting Started, Build Better Habits, Take Back Control, Advanced). Chaque campagne a un
  titre, une description, une icône, des missions ordonnées et un statut dérivé.
- **Overview** : cartes de campagne avec progression (`completed/total`), pourcentage et
  statut (`Not started` / `In progress` / `Completed`).
- **Next mission** : première mission incomplète de la première campagne non terminée —
  **dérivée**, jamais stockée séparément.
- **Invité** : CTA « Create an account to save your mission progress » ; aucune progression
  locale, aucune complétion, aucun sync.
- **Authentifié** : `Progress.complete() → Sync → ns_sync_push → Supabase` ; `reload` restaure.
- Aucune modification DB, aucun stockage local. Cross-device via le serveur.


## 5septies. Cycle de vie du compte & session (M37)

- Le cycle de vie complet (create → sign in → session → account/journey → sign out → guest)
  est finalisé et validé par `tests/m37-tests.mjs`.
- Les edge cases d'inscription (username trop court/long, caractères invalides, doublon
  insensible à la casse, password faible) et de connexion (erreur générique sans énumération,
  session invalide/expirée) sont couverts.
- Logout ne supprime ni le compte ni la progression serveur. Recovery = récupération
  uniquement, sans session. Cross-device sans données locales.
- Voir **`docs/authentication.md` §9**.


## 5octies. Profils publics (M37)

> Voir **`docs/public-profiles.md`**.

- Le compte reste **privé** ; un **profil public d'apprentissage** est un concept séparé.
- Un profil public expose : username + statistiques d'apprentissage (missions/campagnes
  complétées, % par campagne) — dérivées de la progression serveur canonique.
- RPC `ns_public_profile(p_username)` (SECURITY DEFINER) retourne uniquement username +
  completed_mission_ids ; aucune donnée privée.
- Page `public-profile.html?u=<username>` ; lien « View public profile » depuis Account.
- Journey reste **publiquement navigable** (campagnes/missions), mais la **complétion** reste
  réservée à l'utilisateur authentifié.
- Aucune fonctionnalité sociale (follows, likes, DMs, feed) ; Community reste agrégée.

## 5novies. Personnalisation du profil public (M38)

- Le profil public M37 devient configurable : **opt-in** (`public_profile_enabled`), **bio**
  publique (≤ 280), **learning interests** (≤ 8), **member since**.
- **Achievements dérivés** déterministes (First Mission, 10/25/50, Campaign Starter, All
  Campaigns) — calculés depuis la progression publique uniquement.
- Migration `0018_public_profile.sql` (idempotente) ; RPC `ns_update_public_profile`
  (authentifié, identité via session, jamais un `p_user_id`).
- Si désactivé, le profil est inaccessible publiquement (`enabled:false` non-énumératif).
- Voir **`docs/public-profiles.md`**.


## 5decies. Finalisation expérience d'apprentissage (M40)

- **Mission modal** : guide rendu une seule fois (correction d'un bug de doublon), contexte de
  Campagne affiché, navigation **précédent / suivant** au sein de la Campagne, feedback de
  complétion avec CTA « Next: … ».
- **Terminologie** : « stages » → « Campaigns » dans les textes utilisateur (Journey, index).
- **Navigation** : page **About** ajoutée au menu de toutes les pages (elle était orpheline).
- Aucune modification backend, aucune migration, aucun RPC.


## 5undecies. Polish produit profond & complétion de contenu (M41)

- **Accessibilité modal** : `role=dialog`, `aria-modal`, `aria-label`, focus au démarrage,
  fermeture Échap.
- **Modal de mission invité** : les invités voient « Create account to save progress » au lieu
  d'un bouton « Mark as complete » inactif (pas de dead-end).
- **Navigation** : lien **About** dans le footer de toutes les pages (il était déjà dans le
  menu principal depuis M40).
- **Terminologie** : plus de « stages » utilisateur ; « Campaigns » partout (voir M40).
- **Contenu** : audit des 30 missions et 15 articles — progression cohérente, guides
  substantiels, aucune donnée de progression dupliquée.
- **Sécurité** : bio/interests/username rendus en `textContent` (XSS-safe) ; aucune fuite.


## 5duodecies. Pré-déploiement & durcissement final (M42)

- **Sécurité RPC** : les fonctions helpers internes `ns_valid_transport_hash` et
  `ns_valid_username` sont désormais révoquées de PUBLIC/anon/authenticated (elles servent
  uniquement aux fonctions `SECURITY DEFINER` internes).
- **Déploiement** : message de plage de migrations corrigé (0001→0018) dans `deploy.sh`.
- **Responsive / contenu long** : `overflow-wrap: break-word` / `word-break` sur les bio,
  intérêts, username, titres de mission/campagne et rangées communautaires pour éviter les
  débordements.
- **Audit pré-déploiement** : inventaire RPC, contrats de privilèges, séquence de migrations,
  stockage, simulateurs d'échec, accessibilité — couverts par `tests/m42-tests.mjs`.


## 5terdecies. Analyse des écarts produit & complétion fonctionnelle (M43)

- **Bug corrigé** : l'icône de « Mission complete » utilisait une séquence unicode sur-échappée
  (`\u2713` au lieu de `\u2713`) qui s'affichait comme texte littéral au lieu d'un ✓.
- **Feedback de complétion de Campaign** : terminer la dernière mission d'une Campaign affiche
  un badge « ⭐ <Campaign> complete » (dérivé, jamais stocké).
- **Complétude vérifiée** : parcours visiteur/authentifié/profil public sans dead-end ;
  ordre déterministe des Campaigns/Missions ; aucune donnée dérivable stockée ; hébergement
  statique compatible (`?u=`, chemins relatifs, JSON fetch) ; pas de réseau social.

## 7. Honnêteté / limites

- Validation **LOCAL / MOCKED / STATIC** uniquement. Aucun test REAL SUPABASE ni REAL BROWSER
  (pas de projet/secret/navigateur accessibles depuis cet environnement).
- Le flux de connexion réel (username+password → `ns_register`/`ns_login`) n'a pas été exécuté contre la
  production.
- Les zones héritées listées en §5 sont documentées, pas encore supprimées (milestones futurs).
