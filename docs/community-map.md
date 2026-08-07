# NullSec — Community Map

> **Fondation de la carte d'activité Europe (Milestone 9).** SVG léger,
> offline-compatible, aucune librairie/framework de carte, aucune API externe,
> aucun suivi, aucune position utilisateur.

---

## 1. Objectif

Afficher l'activité de la communauté **par pays** de façon agrégée et anonyme, pour
montrer que NullSec est actif à travers l'Europe.

## 2. Approche

- **SVG** : formes simplifiées des pays européens (`viewBox 0 0 640 480`).
- **Aucun framework** lourd, aucune API externe.
- **Offline-compatible** : la carte se construit à partir de `data/countries.json`
  (référence locale) et de l'intensité fournie par `CommunityService`.

## 3. Module `community-map.js`

`window.CommunityMap` :
- `render(container, activityData)` — construit et injecte le SVG.
- `destroy(container)` — vide le conteneur.
- `paths` — chemins SVG simplifiés, indexés par code pays (ISO 3166-1 alpha-2).

### Données d'entrée
```json
{
  "countries": [
    { "code": "FR", "region": "Europe", "active": true,
      "missions_available": 42, "completed": 2300,
      "mission_density": 8, "activity_level": "high" }
  ]
}
```

Chaque chemin porte des attributs `data-*` (country, level, missions, completed),
une classe `active`/`inactive` et un `aria-label` (accessibilité).

## 3b. Cartographie des couleurs / densité

- **Intensité** : `none`/`low`/`medium`/`high`/`very-high` → couleur du pays.
- **Densité de missions** : `mission_density` (nb de missions avec activité).
- **Actif / inactif** : classe `active` (trait normal) vs `inactive` (trait atténué).
- **Légende** : groupe SVG ajouté en bas (low → very-high), sans asset externe.

## 4. Intensité / couleurs

| Niveau | Couleur | Signification |
|--------|---------|---------------|
| `none` | sombre | aucune activité enregistrée |
| `low` | bleu sombre | < 100 complétions |
| `medium` | cyan | < 1000 complétions |
| `high` | cyan clair | < 5000 complétions |
| `very-high` | vert | >= 5000 complétions |

Chaque pays affiche une infobulle (titre SVG) : nom, niveau, missions disponibles,
complétions.

## 5. Intégration

- Chargé après `community-service.js`, avant `statistics-service.js`.
- Utilisé par `community.js` (page community) dans `#community-map`.

## 6. Sécurité

- **Aucune position utilisateur** (formes statiques, pas de géolocalisation).
- **Aucune API externe**.
- **Aucun suivi** : la carte ne remonte aucune donnée.
- Les niveaux sont dérivés de **statistiques agrégées anonymes** uniquement.
