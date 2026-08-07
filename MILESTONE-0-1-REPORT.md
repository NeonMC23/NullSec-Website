# Milestone 0.1 Implementation Report
### Cleanup & Stabilization — NullSec Platform V2

> Date : 6 août 2026 · Périmètre : nettoyage & stabilisation uniquement.
> Aucune fonctionnalité V2 ajoutée. UI, UX, contenu, navigation et fonctionnalités préservés.

---

## 1. Summary

Ce milestone a stabilisé la base de code en préparation de V2, sans rien casser :

1. **Couche d'abstraction de persistance** créée (`store.js`) — plus aucun appel direct à `localStorage` hors de ce module.
2. **Weekly Mission unifiée** — une seule source de vérité (données, état, clé de stockage) partagée entre l'accueil et la page Journey.
3. **Code mort supprimé** — 6 missions stage 99, variables inutilisées, fonction obsolète.
4. **Corrections techniques** — HTML invalide (doubles attributs `class`) corrigé sur les 15 articles ; sitemap nettoyé ; README exact.
5. **Maintenabilité améliorée** — JS centralisé via `Store`, commentaires à jour, CSS mort retiré.

**Validation finale :** tous les fichiers JS passent `node --check` ; aucune référence `localStorage` hors `store.js` ; aucun doublon d'attribut `class` ; CSS équilibré ; la migration de données est testée et idempotente.

---

## 2. Files Modified

| File | Change | Reason |
|------|--------|--------|
| `assets/js/theme.js` | Persistance du thème via `Store` (`ns:theme`) au lieu de `localStorage` direct | Centraliser la persistance |
| `assets/js/utils.js` | `getTheme`/`setTheme` via `Store` | Centraliser la persistance |
| `assets/js/journey.js` | Persistance via `Store` ; suppression code mort ; weekly mission via clé dédiée ; exposition API `window.Journey` | Unification + nettoyage |
| `assets/js/articles.js` | État "lu" via `Store.keys.ARTICLE_READ(slug)` | Centraliser la persistance |
| `index.html` | Ajout `<script store.js>` + `<script journey.js>` ; weekly mission pilotée par `Journey` ; article vedette via `Store` ; suppression de la logique weekly dupliquée | Unifier la weekly mission |
| `about.html`, `articles.html`, `community.html`, `contribute.html`, `journey.html`, `tools.html` | Ajout `<script src="assets/js/store.js">` en tête de bloc | Charger la couche de persistance |
| `articles/*.html` (15) | Ajout `store.js` ; JS inline via `Store` ; correction du double attribut `class` sur le bouton "Mark as read" | Persistance + HTML valide |
| `sitemap.xml` | Suppression de l'entrée `projects.html` (page supprimée) | Exactitude SEO |
| `README.md` | Compte de missions corrigé (30 = 29 stages + 1 weekly) | Exactitude doc |
| `assets/css/v2.css` | Suppression CSS mort : `.platform-badges`, `.platform-badge`, `.weekly-mission.completed(::before)` | Nettoyage |

---

## 3. New Files Created

| File | Purpose |
|------|---------|
| `assets/js/store.js` | Couche unique de persistance. API : `get`, `set`, `remove`, `has`, `clearNamespace`, `keys`, `migrate`. Centralise les clés, gère l'encodage JSON, et migre automatiquement les anciennes clés. Chargé en premier sur **toutes** les pages. |

---

## 4. Store Migration Details

**Anciennes clés → nouvelles clés :**

| Ancienne clé | Nouvelle clé |
|--------------|--------------|
| `nullsec-theme` | `ns:theme` |
| `ns-journey-progress` | `ns:journey:progress` |
| `ns-article-{slug}` | `ns:article:read:{slug}` |
| `ns-5-invites` | `ns:weekly:progress` |

**Logique de migration** (dans `Store.migrate()`, exécutée au chargement de `store.js`, avant tout autre module) :
- **Copie simple** : si l'ancienne clé existe et que la nouvelle n'existe pas encore → copie, puis suppression de l'ancienne.
- **Cas particulier `ns-journey-progress`** : c'est un tableau JSON qui contenait la mission weekly (`weekly-community`). La migration **retire** cet identifiant du tableau et le **déplace** dans la clé dédiée `ns:weekly:progress` (état `done`) si présent.
- **Clés dynamiques articles** : itération de `localStorage`, toute clé `ns-article-*` migrée vers `ns:article:read:{slug}`.
- **Idempotente** : chaque étape n'agit que si l'ancienne clé existe encore. Rejouer la migration ne corrompt ni ne duplique rien.
- **Non-destructrice** : si une migration échoue (mode privé, quota), le site fonctionne toujours en accès brut.

**Testé en Node** (localStorage mocké) : thème, progression, weekly (double source `ns-5-invites` + `ns-journey-progress` fusionnées), articles lus — tous migrés correctement, anciennes clés supprimées, re-migration idempotente.

---

## 5. Weekly Mission Refactor

### Architecture précédente
- **Accueil** : mission câblée en dur dans le JS inline de `index.html`, état via `localStorage` `ns-5-invites`, bouton `toggleInviteMission` local.
- **Journey** : mission `weekly-community` dans le tableau `MISSIONS` de `journey.js`, état dans `ns-journey-progress`, rendu carte + modal.
- ⇒ **Deux sources de vérité, deux clés, états désynchronisés.**

### Architecture nouvelle
- **Données** : la mission `weekly-community` reste dans `MISSIONS` (source unique).
- **État** : clé dédiée `ns:weekly:progress` (valeur `done`), via `Store`.
- **Module partagé** : `journey.js` expose `window.Journey` :
  - `getWeeklyMission()`, `isWeeklyDone()`, `toggleWeekly()`, `renderWeekly(el)`.
- **Consommation** : `index.html` charge `journey.js` et pilote sa carte weekly via `Journey` ; `journey.html` rend sa carte via `renderAll()` (même mission, même état).
- **Migration** : les anciens états `ns-5-invites` et `weekly-community` (dans l'ancien tableau) sont fusionnés dans `ns:weekly:progress`.

### Data flow
```
Store (ns:weekly:progress)  ←  journey.js: toggleMission('weekly-community')
      ▲                                   │
      │                                   ▼
   window.Journey.isWeeklyDone()   window.Journey.getWeeklyMission()
      ▲                                   │
      ├──────────────┬────────────────────┤
      ▼              ▼                    ▼
  index.html     journey.html         (carte / modal)
  (carte vedette) (carte grid)
```

> Note : le **rendu visuel** reste spécifique par page (carte "featured" sur l'accueil, carte grid sur Journey) afin de préserver l'UI actuelle. Les **données, l'état, la clé et le toggle** sont 100 % partagés via le module unique.

---

## 6. Removed Code

**`assets/js/journey.js`**
- 6 missions "communautaires" **stage 99** : `cm-invite-friend`, `cm-talk-family`, `cm-fix-typo`, `cm-review-docs`, `cm-share-social`, `cm-help-beginner` (jamais rendues).
- Variable **`communityTotal`** (calculée, jamais affichée).
- Variable **`stageStr`** (calculée, jamais affichée).
- Fonction globale obsolète **`toggleJourneyWeekly`**.

**`assets/css/v2.css`**
- `.mission-card .platform-badges`
- `.mission-card .platform-badge`
- `.weekly-mission.completed`
- `.weekly-mission.completed::before`

**`index.html`**
- Objet mission weekly codé en dur et fonction locale `toggleInviteMission` basée sur `ns-5-invites` (remplacés par l'usage de `Journey`).

**`sitemap.xml`**
- Entrée `projects.html` (page supprimée / fusionnée dans `community.html`).

Aucune de ces suppressions ne casse de comportement : les missions stage 1-4 et la weekly mission restent rendues et comptées (vérifié).

---

## 7. Testing Performed

| Test | Méthode | Résultat |
|------|---------|----------|
| Syntaxe JS | `node --check` sur les 12 fichiers `assets/js/*.js` | ✅ Tous OK |
| Syntaxe JS inline | Extraction des blocs `<script>` inline (`index.html`, 15 articles) + `node --check` | ✅ Tous OK |
| Migration | Harness Node avec `localStorage` mocké (anciennes clés semées) | ✅ Migration correcte, idempotente, non-destructive |
| API Journey | Harness Node avec DOM mocké | ✅ `Journey` exposé, toggle weekly fonctionne (on/off), clé `ns:weekly:progress` |
| Comptage progression | Harness Node DOM mocké | ✅ 30 missions total, 2 stages + 1 weekly = 3 done / 27 left / 10% ; weekly card rendue en `completed` ; 29 cartes stages |
| HTML valide | Recherche de doublons d'attribut `class` | ✅ Aucun sur les 22 pages |
| Aucun localStorage hors store.js | `grep -rn "localStorage"` | ✅ Seul `store.js` le référence |
| Équilibre CSS | Comptage `{` / `}` | ✅ `style.css` 260/260, `v2.css` 247/247 |
| Références obsolètes | `grep` `projects.html`, `toggleJourneyWeekly`, `stage: 99`, `platform-badge`, `weekly-mission.completed` | ✅ Aucune restante |

**Fonctionnalités vérifiées (code-review + tests logiques)** : navigation (inchangée), recherche (inchangée, pas de dépendance storage), thème (via `Store`), progression journey (via `Store`), état article lu (via `Store`), weekly mission (unifiée).

> Note : pas d'outil de validation HTML/JS automatisé installé dans le sandbox ; la validation syntaxique JS a été faite via `node --check` (Node v20 présent). Aucune console browser n'est disponible dans cet environnement — les tests logiques ont été exécutés en Node avec des mocks.

---

## 8. Remaining Technical Debt (volontairement reporté)

Conformément au périmètre "nettoyage uniquement", ces points restent pour les milestones suivants :
- **Consolidation des blocs CSS dupliqués** dans `v2.css` (`.article-list-item` ×22, `.modal` ×16, `.tool-card` ×15, etc.) — non touché pour éviter tout risque visuel.
- **Extraction des JS inline** (`index.html`, `articles/*.html`) vers des modules dédiés.
- **Données missions/outils** toujours dans le JS (`MISSIONS`, `TOOLS`) — à externaliser en JSON/API pour V2.
- **Uniformisation `var`/`const`/`let`** et conventions de nommage.
- **Back-to-top** absent des pages racines (présent sur les articles).
- **Auto-hébergement des polices** (Google Fonts) pour la conformité privacy-first.
- **Tests automatisés** du front (à introduire avant d'ajouter l'identité/contribution).

---

## 9. Risks & Possible Regressions

- **Migration de données** : la logique est idempotente et non-destructive ; le seul scénario limite est un utilisateur avec à la fois `ns-5-invites` et `weekly-community` dans l'ancienne progression — fusionnés sans perte (vérifié par test). Aucun risque de double-comptage.
- **`journey.js` chargé sur `index.html`** : le module s'initialise sans erreur sur l'accueil car tous les rendus sont protégés par des tests d'existence d'élément (vérifié en DOM mocké). Aucun effet secondaire.
- **Changement visuel du weekly accueil** : l'UI est préservée (carte featured conservée) ; seules les données/état sont unifiés. Aucun risque de régression visuelle.
- **Sécurité** : la couche `Store` neutralise le risque d'`innerHTML` ? Non — le rendu `innerHTML` reste en place (hors périmètre). Aucune donnée utilisateur n'est injectée à ce stade ; risque inchangé par rapport à l'audit.

---

*Milestone 0.1 terminé. Prêt pour la phase de développement V2 — aucune fonctionnalité V2 n'a été introduite.*
