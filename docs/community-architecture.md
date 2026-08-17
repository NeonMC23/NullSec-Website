# Community — Aggregated Intelligence (Milestone 35)

> **Community does not expose users. It exposes aggregated community activity.**

## Modèle

```
Account
  ↓
Private progression (Supabase)
  ↓
Aggregated activity
  ↓
Community metrics
```

- Les utilisateurs authentifiés produisent une **progression privée** (Supabase).
- Des **événements d'activité** anonymes alimentent des **métriques agrégées**.
- La page **Community** n'affiche que ces métriques agrégées.

## Architecture de la page

```
Community
├── Hero (title + explication « collective activity, never individual users »)
├── Community Overview      (Total participants, Countries represented,
│                             Missions completed, Community activity)
├── Country Activity        (barres horizontales agrégées par pays)
├── Activity Breakdown      (Missions / Tools / Community actions / Propagation)
├── Europe Activity Map     (agrégat visuel par pays)
├── Your participation      (état authentifié, contribution seulement)
└── Privacy note
```

## Data flow

```
community.js
   ↓
ApiClient / service (CommunityMetrics, CountryMetrics)
   ↓
public aggregate RPC (ns_country_metrics, ns_metrics)
   ↓
Supabase
   ↓
aggregated response
   ↓
Community UI
```

- **1 requête / minimum raisonnable** : la page utilise `CountryMetrics.getData()`
  (`ns_country_metrics`) comme source agrégée principale.
- Les agrégations lourdes restent **côté PostgreSQL / RPC** (`json_object_agg`).
- Le frontend **ne parcourt jamais** une liste d'utilisateurs pour calculer des statistiques.

## Sources de données (backend existant, non modifié)

| RPC | Données |
|-----|---------|
| `ns_country_metrics` | par pays : participants, missionActivity, toolActivity, communityActivity, propagation, totalActivity + lastUpdate |
| `ns_metrics` | global : completedMissions, activeCountries, activeRegions, challenges |

## Modèle de confidentialité

Interdit dans la couche Community (tests statiques) :

```
user_id
identity_id
username
avatar
password / password_hash
recovery / recovery_key
session token
member lists / profile cards
```

- **Country ≠ profil utilisateur.** Un pays est un agrégat uniquement ;
  aucune opération `France → liste des utilisateurs`.
- Les identifiants techniques existent uniquement dans les couches backend
  internes (pour le calcul des agrégats) et ne sont **jamais** retournés à l'UI.
- Être connecté **n'ouvre aucun accès** aux données individuelles des autres.
  La connexion permet seulement de contribuer (action communautaire explicite)
  et de continuer son Journey.

## États UI

- **Loading** : « Loading… »
- **Empty** : « No community statistics yet. » / « No country activity yet. »
- **Error** : « Community statistics unavailable. Please try again later. »
- **Offline / unavailable** : même état d'erreur — **jamais** une valeur fictive (0)
  pour masquer un échec backend.

## Sécurité

- **RLS inchangée** (M31–M34 conservées).
- RPC publics limités aux **agrégats** ; tables privées (`users`, `user_profiles`,
  `user_progress`) jamais lues par le frontend.
- `ns_country_metrics` : `SECURITY DEFINER` + `search_path` sécurisé.
- Aucun service-role secret en frontend.
- **Aucun stockage local** pour les statistiques communautaires.

## Stockage

Aucune nouvelle clé introduite :

```
localStorage:     ns:theme, ns:migrated:v1
sessionStorage:   ns:session:auth, ns:session:recovery
```

## M38 — Profils personnalisés, Community toujours agrégée

Même avec des profils publics personnalisables (bio, intérêts, achievements), Community reste
**agrégée** : aucun username, aucune carte de profil, aucun classement individuel dans la
Community. Les profils publics alimentent uniquement des agrégats.

## M37 — Community reste agrégée (profils publics)

Même avec des **profils publics** (voir `docs/public-profiles.md`), Community **ne devient pas
un annuaire d'utilisateurs** :

- aucune liste de usernames ;
- aucun classement individuel ;
- aucune carte de profil ;
- aucune progression individuelle publique dans Community.

Les profils publics peuvent alimenter des **agrégats** uniquement :
`Public profiles → Aggregated metrics → Community`.
