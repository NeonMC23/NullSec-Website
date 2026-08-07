# NullSec — Community Architecture

> **Couche communautaire anonyme (Milestone 9).** Un aperçu du mouvement NullSec
> sans devenir un réseau social. Aucun profil public, aucun suivi, aucune donnée
> personnelle exposée.

---

## 1. Principe

NullSec veut montrer qu'il s'agit d'un **mouvement mondial actif**, en augmentant la
motivation et le sentiment d'appartenance, **sans** transformer le site en réseau social.
Toutes les métriques sont **agrégées et anonymes**.

## 2. Architecture

```
Community UI (community.html)
        │
        ▼
CommunityService (community-service.js)   — stats / map / missions / regions
CommunityMap (community-map.js)           — carte SVG Europe
Challenges (challenge-service.js)         — défis anonymes
CommunityRanking (community-ranking.js)   — classement pays/régions (agrégé)
CommunityMetrics (community-metrics.js)   — impact global (M12)
MissionDiscovery (mission-discovery.js)   — découverte/filtres de missions
        │
        ├── online → ApiClient.community* + ApiClient.missions + ranking + challenges
        └── offline → local static countries + missions (empty/statique state)
        │
        ▼
Backend (PostgreSQL, agrégé, anonyme)
```

### Flux de données
```
Backend (anonymous_global_stats, mission_activity, countries)
   │  (agrégé, anonyme)
   ▼
GET /api/community/stats | /map | /countries
   ▼
ApiClient
   ▼
CommunityService
   ▼
Community page (stats cards + map + regions)
```

## 3. Modèle de confidentialité

- **Aucune localisation utilisateur** (pas de GPS, pas d'adresse).
- **Aucun stockage d'IP**, aucun fingerprinting.
- **Aucune timeline personnelle**, aucun profil public.
- **Aucun pixel de tracking**, aucune analytics.
- **Aucune API de carte externe** (carte SVG intégrée).
- Seules des **statistiques agrégées anonymes** sont calculées côté serveur.

## 4. Agrégation

| Métrique | Source |
|----------|--------|
| `active_users` | `anonymous_global_stats.active_users` |
| `completed_missions` | `anonymous_global_stats.completed_missions` |
| `countries_active` | décompte des pays `active` |
| `top_regions` | agrégation par pays/région depuis `mission_activity` |
| activité par pays | `mission_activity` + `countries` |
| classement pays/régions | agrégation `mission_activity` par pays/région |
| défis | `community_challenges` + `challenge_progress` (compteurs anonymes) |
| impact global (M12) | `anonymous_global_stats` + `country_activity` + `region_activity` |

## 5. Comportement offline

- Si le backend est désactivé/indisponible, `CommunityService` renvoie :
  - des stats globales **vides** (0) ;
  - une activité pays **locale** (missions disponibles, intensité `none`) depuis
    `data/countries.json` ;
  - les régions **inactives**.
- Aucun crash, aucune requête réseau, la carte reste affichable.

## 6. Sécurité

- Endpoints publics **rate-limited**.
- **Agrégation uniquement** — aucun accès à des données personnelles.
- Caching court (pas de données sensibles).
- Aucune donnée individuelle ne transite.
