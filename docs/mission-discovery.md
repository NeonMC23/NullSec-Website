# NullSec — Mission Discovery

> **Couche de découverte de missions (Milestone 11).** Fonctionne offline avec le
> dataset local, peut consulter le backend en ligne. Aucune recommandation
> personnelle, aucun suivi.

---

## 1. Module

`assets/js/mission-discovery.js` → `window.MissionDiscovery`

| Méthode | Rôle |
|---------|------|
| `init()` | Charge le dataset de missions une fois. |
| `getAll()` | Toutes les missions. |
| `getByCountry(code)` | Missions du pays (ou globales, `country === null`). |
| `getByRegion(region)` | Missions de la région. |
| `getByCategory(cat)` | Missions d'une catégorie. |
| `getAvailable()` | Missions disponibles (`available !== false`). |
| `search(filters)` | Filtres combinés (`country`, `region`, `category`, `difficulty`, `status`, `query`). |

## 2. Filtres (UI journey)

- Barre de filtres sur `journey.html` : recherche, région, catégorie, difficulté, statut.
- Filtrage **côté client** (rapide, sans backend), re-rendu des grilles de missions.
- Les cartes de missions existantes sont conservées.

## 3. Offline

- Les filtres et la recherche fonctionnent **entièrement hors-ligne** (dataset local).
- En ligne, `GET /api/missions` peut fournir des métadonnées supplémentaires (optionnel).

## 4. Confidentialité

- Aucune recommandation personnelle.
- Aucun suivi de navigation / de sélection.
- Aucune donnée de l'utilisateur envoyée par le filtre.
