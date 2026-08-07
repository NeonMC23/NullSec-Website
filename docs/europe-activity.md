# NullSec — Europe Activity (Milestone 17, preparation)

> **Carte d'activité Europe.** M17 a préparé l'architecture ; **M18** a implémenté le
> RPC `ns_country_metrics()` et intégré la carte + classement dans `community.html` ;
> **M19** a défini la sémantique exacte des métriques (distinction `0` vs `unavailable`)
> et corrigé la sémantique des challenges ; **M20** a ajouté le **modèle de données**
> minimal (pays utilisateur explicite + agrégat d'activité des outils), rendu
> `participants` et `toolActivity` mesurables, et poli l'UI (sélection, clavier,
> panneau).
> **Aucune donnée fausse** n'est générée : sans backend, la UI affiche
> « Activity data unavailable ».
>
> Statut : **RPC `ns_country_metrics` IMPLEMENTED (STATIC REVIEW)** — non exécuté sur
> un vrai Supabase (**BLOCKED — REAL SUPABASE**).

---

## 1. Objectif

Visualisation publique / communautaire anonyme de l'activité agrégée par pays sur
une carte SVG de l'Europe.

```
activity event
      ↓
aggregated counters
      ↓
country metrics
      ↓
Europe map
```

## 2. Modèle de confidentialité

La carte est publique/communautaire. Elle n'expose **jamais** :
- `user_id`, `identity_id`, `username` ;
- clé de récupération, IP, GPS, identifiant d'appareil ;
- historique d'activité individuel, historique de contribution individuel ;
- session individuelle, timestamps individuels.

Seules des **statistiques agrégées par pays** sont exposées.

## 3. Contrat de données (pays)

Format agrégé attendu (exemple de schéma — pas de fausses données) :

```json
{
  "countries": {
    "FR": { "participants": 42, "missionActivity": 183,
            "toolActivity": 71, "propagation": 25, "totalActivity": 279 }
  }
}
```

| Champ | Type | Sens |
|-------|------|------|
| `countryCode` | string (ISO-3166 alpha-2) | identifiant stable du pays |
| `participants` | nombre ≥ 0 **ou null** | nb de participants **distincts** associés au pays (non mesuré → null) |
| `missionActivity` | nombre ≥ 0 | activité agrégée des missions |
| `toolActivity` | nombre ≥ 0 **ou null** | activité agrégée des outils (non mesurée → null) |
| `propagation` | nombre ≥ 0 **ou null** | métrique de propagation **communautaire** agrégée (non mesurée → null) |
| `totalActivity` | nombre ≥ 0 | agrégat normalisé pour l'intensité visuelle |

**Distinction `0` vs `null` (M19)** : le frontend distingue une valeur réellement
mesurée à `0` d'une métrique **non disponible** (`null`). Les valeurs `null` sont
affichées « unavailable » ; elles ne sont pas inventées.

## 4. Dimensions d'activité

### Sémantique exacte (M20)

- **participants** : nombre de participants **distincts** enregistrés dont le profil a
  un pays = ce pays. Le pays est un **choix utilisateur explicite**
  (`user_profiles.country_code`, ISO-3166 alpha-2) — jamais inféré depuis IP/GPS/
  locale/fuseau/appareil. Un participant est compté une fois. **Mesuré (M20)** via
  `COUNT(*) FROM user_profiles WHERE country_code = ...`. Si aucun pays n'est choisi,
  le participant n'est pas attribué à un pays.
- **missionActivity** : activité agrégée des missions attribuable au pays, dérivée de
  `mission_activity` (`SUM(completed_count)` par pays). **Mesuré.**
- **toolActivity** : usage agrégé des outils attribuable au pays, dérivé de la table
  agrégée `tool_activity` (`SUM(activity_count)` par pays). Enregistré **uniquement**
  via `ns_tool_activity` (authentifié, pays dérivé serveur du profil). **Mesuré
  (M20)** dès que de l'activité existe ; sinon `0` (mesuré à zéro), pas `null`.
- **propagation** : métrique de propagation communautaire agrégée (PAS un graphe
  d'individus, PAS « X a invité Y »). **Non mesurable** : le produit n'a pas de modèle
  de propagation défini → le RPC retourne `null` (unavailable). **Ne pas inventer.**
- **totalActivity** : **agrégat déterministe** = `missionActivity + toolActivity` (les
  deux dimensions d'activité mesurées). Ce n'est plus le compteur brut
  `country_activity.completed_count`, afin que `totalActivity` reste cohérent avec les
  dimensions exposées. Sert à l'intensité visuelle.

Ne jamais inventer ces métriques : si une donnée n'est pas collectée, `null`
(« unavailable ») plutôt qu'une valeur arbitraire. `0` signifie « mesuré et réellement
zéro ».

- **Participants** : nombre agrégé/approximatif de participants associés au pays.
- **Missions** : activité agrégée des missions (missions complétées, compteur
  d'activité, participation à une campagne).
- **Outils** : usage agrégé des outils NullSec (compteurs uniquement).
- **Propagation** : métrique de propagation au niveau communautaire — **pas**
  « l'utilisateur X a invité Y » ni un graphe d'individus.
- **Total activity** : agrégat normalisé pilotant l'intensité visuelle.

**Pas de formule figée** : la normalisation est isolée dans `country-metrics.js`
(`CountryMetrics.intensity`), modifiable sans réécrire l'UI.

## 5. Architecture SVG

- Un seul `<svg>` avec un `<path id="{ISO_CODE}">` par pays — **pas** des centaines
  d'éléments HTML individuels.
- Le SVG est **présentation pure** ; il ne contient aucune donnée.
- Les données arrivent via `CountryMetrics` (qui parle à `ApiClient`/Supabase) et
  sont appliquées comme **classes CSS** d'intensité :
  `country--none` · `country--very-low` · `country--low` · `country--medium` ·
  `country--high` · `country--very-high`.
- La palette utilise des variables CSS (s'adapte au design system NullSec).

## 6. Modules (préparation)

- **`assets/js/country-metrics.js`** : contrat API, chargement (via `ApiClient`),
  normalisation, validation, état indisponible/vide. Aucune logique fetch interne —
  `ApiClient` est la seule couche réseau.
- **`assets/js/europe-map.js`** : init SVG, lookup pays, calcul de classe
  d'activité, hover/click, rendu.

## 7. Contrat API backend

Le RPC Supabase **`ns_country_metrics()`** est défini dans
`backend/supabase/functions/rpc_country_metrics.sql` (M18→M20). Il agrège par pays :
- `participants` : `COUNT(*) FROM user_profiles WHERE country_code = c.code` (M20) ;
- `missionActivity` : `SUM(mission_activity.completed_count)` par pays ;
- `toolActivity` : `SUM(tool_activity.activity_count)` par pays (M20) ;
- `propagation` : `null` (non modélisé — absence honnête) ;
- `totalActivity` : `missionActivity + toolActivity` (agrégat déterministe, M20).

`ApiClient.countryMetrics()` est le point d'intégration frontend. Les migrations
`0005`/`0008` contrôlent explicitement `EXECUTE` (REVOKE PUBLIC + GRANT
anon/authenticated). Le RPC est `SECURITY DEFINER` avec `search_path = public` et ne
retourne que des agrégats (aucun identifiant individuel). Les RPC `ns_tool_activity` et
`ns_update_profile` (M20) sont token-authentifiés et n'acceptent jamais un
`p_user_id`/identité client.

## 8. États UI

- Backend disponible + RPC présent → données agrégées.
- Backend indisponible / RPC absent → état explicite **« Activity data unavailable »**
  (pas de statistiques fabriquées).
- Survol / clic / focus clavier d'un pays → panneau agrégé (niveau d'activité,
  total, missions, outils, participants, propagation). Pas de liste d'utilisateurs.
- Une valeur `null` est affichée « Unavailable » ; `0` est affiché « 0 » — jamais
  confondues.
- La carte, le classement et le panneau utilisent **le même dataset**
  (`CountryMetrics`) — pas de seconde source.
- Le classement trie les pays mesurés d'abord, puis les pays « Unavailable »
  (marqués, pas masqués silencieusement).
- Préparation backend : tables `country_membership` / `community_propagation`
  (migration `0009`, non peuplées) pour la future collecte réelle.

## 8bis. Sélection du pays utilisateur (M20)

Le champ `user_profiles.country_code` (ISO-3166 alpha-2) est un **choix explicite** du
utilisateur, enregistré via `ns_update_profile` (token-authentifié, n'accepte jamais un
`p_user_id` client). Il n'est **jamais** inféré depuis IP, GPS, locale navigateur,
fuseau ou appareil. Confidentieléité : ce champ vit sur le profil privé (aucun accès
anon) et n'est utilisé que pour des **agrégats de participants par pays** — il n'est
jamais exposé publiquement par utilisateur.

## 9. Ce qui est volontairement NON suivi

- Profils individuels, graphe social, amis, chat, commentaires ;
- leaderboard individuel, notifications, tracking, analytics ;
- IP, GPS, fingerprinting ;
- historique de propagation utilisateur-à-utilisateur.

## 9b. Sémantique des challenges (M19)

Distinction entre deux types (colonne `community_challenges.kind`, migration 0006) :

- **`events`** (défaut) : `current_value` compte les **événements d'activité** (chaque
  activité anonyme ajoute 1). Ex : « Europe Mission Week », « 10000 missions ».
- **`unique_countries`** : `current_value` compte les **pays distincts activés**
  (dérivé de `challenge_progress`, `COUNT(*)` des pays uniques). Ex :
  « Activate 5 new countries ».

Avant M19, `ns_activity` incrémentait **tous** les challenges par activité, rendant
« Activer 5 pays » sémantiquement faux (comptait les événements, pas les pays).
La migration 0006 + le nouveau `ns_activity` corrigent cela : un pays est compté une
seule fois pour les challenges `unique_countries`, via `challenge_progress`.

## 10. Relation avec `ns_activity` / `ns_metrics`

- `ns_activity` incrémente des compteurs agrégés anonymes (missions/pays/région).
- `ns_tool_activity` (M20) incrémente l'agrégat `tool_activity` (authentifié, pays
  dérivé serveur du profil).
- `ns_metrics` renvoie un snapshot d'impact global agrégé.
- `ns_country_metrics` (M18→M20) agrége au niveau pays pour alimenter la carte
  (participants, missions, outils, total).
- Sémantique distinguée : **compteur d'activité** (nombre d'événements) ≠
  **pays uniques activés** (voir M15). Le futur backend utilisera la métrique
  appropriée à chaque visualisation, sans casser la sémantique de `ns_activity`.

---

## Community Intelligence Data Model (M21)

**Ce qui est collecté** (agrégats uniquement) :
- pays choisi explicitement (`country_membership`) ;
- activité de missions par pays (`mission_activity`) ;
- usage d'outils par pays (`tool_activity`) ;
- propagation communautaire agrégée par type (`community_propagation`).

**Ce qui n'est jamais collecté** : identifiants individuels, usernames, email, IP, GPS,
device id, timestamps individuels, graphe social, analytics.

**Règles d'agrégation** : un pays = choix explicite (jamais déduit de la localisation) ;
`participants` = membres distincts ; `missionActivity`/`toolActivity` = sommes agrégées ;
`propagation` = compteur agrégé par type. `0` = mesuré vide ; `null` = non disponible
(jamais confondus).

**Exigences backend futures** : RPC `SECURITY DEFINER` token-authentifiés pour les
écritures (pays dérivé serveur) ; RLS (tables privées sans accès anon, tables agrégées en
SELECT anon) ; contrôle EXECUTE explicite ; aucun endpoint public ne renvoie une
association user→pays. Voir `docs/community-api.md` (contrats RPC) et `docs/privacy-model.md`.

---

## Sélection de pays utilisateur (M22)

L'utilisateur authentifié peut choisir **manuellement** son pays (ISO-3166 alpha-2, nom
lisible) via `CountryService` → `CountryRepository` → `ApiClient` (futur `ns_set_country`).
- Choix **explicite**, jamais inféré depuis IP/GPS/locale/appareil.
- **Un pays actif par utilisateur** (`UNIQUE(user_id)` sur `country_membership`).
- Le pays alimente `participants` (membres distincts) ; aucune association user→pays
  publique.
- États : `NO_COUNTRY → SELECTING_COUNTRY → SAVING_COUNTRY → COUNTRY_SET | ERROR`.
- Aucun appel backend si Supabase est désactivé (pas de réussite fabriquée).

---

## Pipeline d'activité communautaire (M24)

```
Community actions → ns_record_activity() → community_activity_events (privé)
   ↓
Aggregation view (v_country_metrics) → ns_country_metrics() → CountryMetrics → dashboard
```

- `ns_record_activity()` : token-authentifié ; identité = session serveur ; pays résolu
  serveur depuis `country_membership` (jamais du frontend) ; types (`mission_completed`,
  `tool_used`, `community_action`) et amount (≥1, ≤1000) validés ; jamais de
  `p_user_id`/identité client.
- `community_activity_events` : table **privée** (aucun accès anon) ; aucun
  identifiant public/IP/GPS/device ; jamais exposée en brut.
- `v_country_metrics` : vue d'agrégation par pays (participants, missions, outils,
  propagation, total) ; `REVOKE SELECT FROM anon/authenticated` — lue uniquement via
  `ns_country_metrics()`.
- Le frontend ne traite **jamais** les événements bruts ; il ne consomme que les
  agrégats.
