# NullSec — Community Ranking

> **Classement communautaire anonyme (Milestone 11).** Classe les **pays/régions**
> par impact collectif — **jamais des utilisateurs individuels**.

---

## 1. Module

`assets/js/community-ranking.js` → `window.CommunityRanking`

| Méthode | Rôle |
|---------|------|
| `getCountries()` | Classement des pays (par complétions agrégées). |
| `getRegions()` | Classement des régions. |

## 2. Backend

- `GET /api/community/ranking/countries` — pays classés par `completed` (agrégé).
- `GET /api/community/ranking/regions` — régions classées par `completed` + nb de pays actifs.
- Publics, rate-limited, agrégés.

## 3. Règles

- **Aucun classement individuel.**
- **Aucun nom d'utilisateur, aucun profil.**
- Classement basé sur : missions complétées, missions actives, participation agrégée.
- L'accent est mis sur l'**impact collectif**, pas la compétition personnelle.

## 4. Offline

- Backend désactivé → `getCountries()`/`getRegions()` renvoient `[]`.

## 5. UI

- Section "Country Ranking" sur `community.html` : liste numérotée des pays avec leur
  nombre de complétions agrégé.
