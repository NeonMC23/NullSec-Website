# NullSec — Community Data

> **Données communautaires réelles (Milestone 10).** Métriques anonymes et agrégées
> uniquement. Aucune identité, localisation, IP ou donnée personnelle.

---

## 1. Flux de données

```
Mission completion (local)
   │  (anonymous counter, no identity)
   ▼
SyncService.reportActivity(mission_id, country)
   │  (only if online)
   ▼
POST /api/community/activity
   ▼
Backend: mission_activity + anonymous_global_stats increments
```

Aucune identité n'est attachée : le payload est uniquement `{ mission_id, country }`.

## 2. Aggrégation

| Source | Type |
|--------|------|
| `countries` | référence (code, nom, région, actif, missions_available) |
| `mission_activity` | compteurs agrégés par mission/pays |
| `anonymous_global_stats` | compteurs globaux (active_users, completed_missions, countries_active) |

## 3. Règles d'agrégation

- **Uniquement des compteurs** incrémentés (jamais de timeline individuelle).
- **Aucune identité** : le pays est optionnel et est une étiquette anonyme, pas une
  localisation précise.
- **Aucune donnée personnelle** exposée par les endpoints.
- Cache court côté frontend (30 s) ; `Community.refresh()` invalide.

## 4. Garanties de confidentialité

- Aucun GPS, aucune adresse, aucun IP stocké.
- Aucun fingerprinting, aucune analytics, aucun tracking.
- Aucune API de carte externe (SVG intégré).
- Comportement offline intact : backend désactivé → état statique local, 0 requête.

## 5. Fallback offline

`CommunityService` renvoie, hors-ligne :
- stats globales vides (0) ;
- activité pays depuis `data/countries.json` (intensité `none`, compteurs 0) ;
- activité missions (0) ;
- régions inactives.

## 6. Module

- `assets/js/community-service.js` (`window.Community`) :
  `init`, `getGlobalStats`, `getCountryActivity`, `getActiveRegions`,
  `getMissionActivity`, `refresh`, `isOnline`.
