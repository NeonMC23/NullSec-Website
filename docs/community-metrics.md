# NullSec — Community Impact Metrics

> **Mesures d'impact communautaire (Milestone 12).** Agrégées, anonymes,
> production-ready. Aucun événement individuel stocké à long terme.

---

## 1. Pipeline de complétion anonyme

Quand un utilisateur complète une mission :

```
Progress (local)
   │  (aucune identité envoyée)
   ▼
SyncService.reportActivity(mission_id, country_code, region)
   │  (uniquement si online)
   ▼
POST /api/community/activity
   ▼
Backend: mission_activity, country_activity, region_activity,
         community_challenges, anonymous_global_stats
```

Payload (aucun champ identité) :
```json
{
  "mission_id": "enable-2fa",
  "country_code": "FR",
  "region": "Europe",
  "timestamp": "2026-08-06T12:00:00.000Z"
}
```

Le backend **rejette** tout payload contenant `identity_id`, `username`, `token`,
`session`, `recovery_key`, etc.

## 2. Moteur de métriques (`backend/src/services/community-metrics.ts`)

Calcule :
- `total_completed` (missions complétées au total) ;
- `active_countries`, `active_regions` ;
- missions par pays / par région ;
- % de complétion des défis ;
- tendances d'impact (compteurs agrégés).

Ne stocke **pas** d'événements individuels.

## 3. Tables (migration 0004)

- `country_activity` : country_code, completed_count, updated_at.
- `region_activity` : region, completed_count, updated_at.
- `mission_activity` : étendue (contrainte non-négative).
- `challenge_progress` : étendue avec `completion_percent`.
- `anonymous_global_stats` : étendu avec `total_completed`, `active_regions`.

## 4. API

- `GET /api/community/metrics` → `{ global, countries, regions, challenges }`.
- `GET /api/community/activity/map` → données d'intensité pour la carte.
- `POST /api/community/activity` → incrément anonyme.

## 5. Privacy

- **Aucune identité** acceptée ou stockée.
- **Aucun historique personnel.**
- **Aucune localisation précise / IP / GPS / fingerprint.**
- Uniquement des compteurs agrégés.

## 6. Offline

- Backend désactivé → `CommunityMetrics` renvoie des métriques **vides** (0/0/0) sans
  aucune requête réseau.
- La page community et la carte se rendent en état statique local.
