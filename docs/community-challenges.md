# NullSec — Community Challenges

> **Défis communautaires anonymes (Milestone 11).** Objectifs globaux collectifs,
> basés sur des compteurs agrégés. Aucun historique de contribution utilisateur.

---

## 1. Module

`assets/js/challenge-service.js` → `window.Challenges`

| Méthode | Rôle |
|---------|------|
| `init()` | Charge les défis. |
| `getActive()` | Défis actifs. |
| `getProgress()` | Tous les défis (avec current/target). |
| `getCompleted()` | Défis terminés. |

## 2. Backend

- Table `community_challenges` : id, title, description, target_value, current_value,
  status, created_at, updated_at.
- Table `challenge_progress` : challenge_id, country_code, contribution_count (agrégé).
- `GET /api/community/challenges` (public, rate-limited).

## 3. Agrégation

- `current_value` est un **compteur anonyme** incrémenté par les complétions de missions.
- `challenge_progress` stocke la contribution **par pays** (jamais par utilisateur).

## 4. Règles

- **Aucun historique de contribution utilisateur.**
- **Aucune identité** attachée.
- **Seuls des compteurs agrégés** sont stockés/affichés.

## 5. Offline

- Backend désactivé → `getActive()`/`getProgress()`/`getCompleted()` renvoient `[]`.

## 6. UI

- Section "Community Challenges" sur `community.html` : cartes avec titre, description,
  barre de progression (current/target) et pourcentage.
