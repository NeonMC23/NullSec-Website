# Milestone 5 Implementation Report
### Local Account Management & Settings Foundation — NullSec Platform V2

> Date : 6 août 2026 · Périmètre : gestion locale de compte + fondation de réglages.
> 100 % local. Aucun backend, authentification, login, inscription, API,
> synchronisation, cloud, réseau social, analytics ou télémétrie.

---

## Summary

Ce milestone complète l'expérience locale avant tout backend :

1. **Settings Service** (`assets/js/settings-service.js`, `window.Settings`) — source de
   vérité des préférences + export/import local de **toute** la donnée utilisateur.
2. **Store étendu** — clé `ns:settings` + `getSettings()/saveSettings()/deleteSettings()`.
3. **Schéma de réglages versionné** (`docs/settings-schema.md`).
4. **Édition de profil** — validation du username (trim, min, max, non-vide).
5. **Avatar déterministe** — généré en SVG localement depuis `avatar_seed` (aucune
   librairie/service externe).
6. **Export / Import local** — téléchargement / lecture de JSON, validation + confirmation.
7. **Reset complet** — efface identity/profile/progress/recovery/settings puis recrée
   des données fraîches, sans rechargement de page.
8. **UI Settings** — thème, langue (placeholder), indicateur offline, animations, note de
   confidentialité.
9. **Init order** étendu : `… → recovery-key → settings-service → statistics → theme → …`
   (23 pages). `theme.js` lit désormais `Settings` (source de vérité, thème `system`).

**Validation finale :** 24 fichiers JS passent `node --check` ; aucun `var` ; aucun
handler inline ; `fetch` uniquement dans `data-loader` ; aucun envoi réseau dans les
couches fondation ; Settings/export/import/reset/avatar/username testés ; régressions
journey/tools OK.

---

## Files Created

| File | Purpose |
|------|---------|
| `assets/js/settings-service.js` | Module `window.Settings` : init/get/update/reset/exportData/importData/validateUsername. |
| `docs/settings-schema.md` | Schéma des réglages + format export/import local. |

---

## Files Modified

| File | Change | Reason |
|------|--------|--------|
| `assets/js/store.js` | Ajout clé `SETTINGS` (`ns:settings`) + `getSettings/saveSettings/deleteSettings` | Encapsuler les réglages via Store |
| `assets/js/utils.js` | Ajout `Utils.hash()` (FNV-1a) et `Utils.avatarSvg(seed)` (SVG déterministe) | Avatar local sans dépendance |
| `assets/js/settings-service.js` | (créé) | Service de réglages + export/import |
| `assets/js/theme.js` | Lit `Settings` comme source de vérité (theme `system`/`dark`/`light`), reflète dans `ns:theme` | Thème piloté par les réglages |
| `assets/js/profile.js` | Avatar SVG, édition username (validation), section Settings, export/import/reset | Page profil complète |
| `profile.html` | Sections Settings + "Your Data" (export/import/reset) + script `settings-service.js` | UI |
| 22× autres `*.html` | Ajout `settings-service.js` dans l'ordre | Init order |
| `assets/css/pages.css` | Styles `.profile-edit-form`, `.profile-settings`, `.settings-row/select/badge/note` | Styles (tokens existants) |
| `docs/javascript-architecture.md` | Module Settings, API, init order, clé `ns:settings`, relation Store | Documentation |
| `docs/v2-architecture.md` | Couche Settings + chaîne UI→Settings→UserProfile→RecoveryKey→Statistics→Progress→Identity→Store | Documentation |
| `docs/identity-schema.md` | Note sur les préférences (`ns:settings`) | Documentation |

---

## Architecture Changes

```
UI (profile page)
        │
        ▼
Settings (settings-service.js)     ── Store, Identity, UserProfile, Progress, RecoveryKey
        │
        ▼
UserProfile (user-profile.js)      ── Store, Identity, RecoveryKey
        │
        ▼
RecoveryKey (recovery-key.js)      ── Store
        │
        ▼
Statistics (statistics-service.js) ── Progress, Data
        │
        ▼
Progress (progress-service.js)     ── Store, Identity
        │
        ▼
Identity (identity.js)             ── Store
        │
        ▼
Store (store.js) ──► localStorage
```

### Ordre d'initialisation (23 pages)
```
store.js → utils.js → data-loader.js → config.js → identity.js → user-state.js
        → progress-service.js → user-profile.js → recovery-key.js
        → settings-service.js → statistics-service.js → theme.js → navigation.js
        → fuse.min.js → search.js → modal.js → animations.js → [page modules]
```

`settings-service.js` est chargé après `recovery-key.js` (il l'utilise pour
l'export/import) et avant `statistics-service.js` et `theme.js` (theme lit Settings).

---

## Data Models

### Réglages — `ns:settings`
```json
{
  "version": 1,
  "theme": "system",
  "language": "en",
  "privacy": { "offline_only": true, "telemetry": false },
  "appearance": { "animations": true, "reduced_motion": false },
  "updated_at": "ISO"
}
```

### Export / Import — `Settings.exportData()`
```json
{
  "type": "nullsec-export",
  "version": 1,
  "exported_at": "ISO",
  "data": { "identity": {}, "profile": {}, "progress": {}, "recovery": "NSK1-…", "settings": {} }
}
```

### Avatar déterministe
`Utils.avatarSvg(seed)` → SVG inline (`<svg>…</svg>`) généré localement à partir d'un
hash FNV-1a du `avatar_seed`. Même seed → même avatar. Aucun appel réseau.

### Reset complet
Efface identity/profile/progress/recovery/settings puis recrée des données fraîches
(identity + profile + recovery + settings), sans rechargement de page.

---

## Security Considerations

- **Aucun envoi réseau** : `settings-service.js` (et les autres couches fondation) ne
  contient aucun `fetch`/XHR/`sendBeacon`.
- **Avatar 100 % local** : généré en SVG, aucun service externe.
- **Export/import local** : fichier JSON téléchargé / lu via `FileReader` ; aucun cloud.
- **Pas de log** de données utilisateur ; la clé ne fuit pas.
- **Validation d'import** : `type`/`version`/présence de `data` vérifiés avant écriture.
- **Rendu DOM-safe** : `profile.js` utilise `Utils.el`/`textContent` ; le seul `innerHTML`
  est l'avatar SVG auto-généré (contenu fiable, marqué trusted).

---

## Testing Results

| Test | Méthode | Résultat |
|------|---------|----------|
| Syntaxe JS | `node --check` sur 24 modules | ✅ Tous OK |
| Aucun `var` | grep (hors fuse.min) | ✅ |
| Aucun handler inline | grep `on(click/change/input)=` | ✅ |
| `fetch` centralisé | grep `fetch(` | ✅ Seul data-loader |
| Aucun envoi réseau fondation | grep XHR/sendBeacon | ✅ |
| **Settings init** | init() | ✅ defaults (theme system, lang en, offline true, telemetry false) |
| **Settings update** | update({theme,appearance:{animations}}) | ✅ fusion profonde, nested préservé |
| **Settings persistence** | ns:settings | ✅ |
| **Settings reset** | reset() | ✅ défauts restaurés |
| **Username validation** | validateUsername | ✅ vide/court/long rejetés, valide/trim ok |
| **Avatar déterministe** | avatarSvg | ✅ même seed → même SVG, seed différent → différent |
| **Export** | exportData | ✅ type/version/data avec identity/profile/progress/recovery/settings |
| **Import (valide)** | importData | ✅ restaure tout, identity_id cohérent |
| **Import (invalide)** | importData(null)/mauvais type/version/data | ✅ erreurs gracieuses |
| **Reset lifecycle** | efface + recrée | ✅ fresh identity/profile/recovery/settings |
| **Profile page render** | harnais DOM | ✅ avatar SVG, form username, settings (3 rows), boutons export/import/reset |
| **Régression** | journey (1+29), tools (50) | ✅ |

> Note : aucun navigateur réel ; validation en Node avec mocks DOM/localStorage/crypto/
> FileReader. Un test visuel en navigateur est recommandé avant déploiement.

---

## Remaining Technical Debt (reporté volontairement)

- **Langue** : sélecteur présent mais non fonctionnel (placeholder future-ready).
- **Avatar** : SVG déterministe de base (initiales + gradient + motif) ; un rendu plus
  riche (visages/geometric) est possible plus tard.
- **Télémétrie** : champ `privacy.telemetry` présent mais aucune télémétrie (toujours false).
- **Synchronisation** : non implémentée (toutes les couches prêtes via Store).
- **Polices Google Fonts** externes toujours.

---

## Risks

- **Thème** : la bascule vers `Settings` comme source de vérité a été testée ; le thème
  `system` dépend de `prefers-color-scheme`. `ns:theme` reste synchronisé pour
  rétrocompatibilité. Risque faible.
- **Export/import** : en cas d'import invalide, aucune donnée n'est modifiée (validation
  avant écriture). La confirmation UI protège contre l'écrasement accidentel.
- **Avatar** : généré en SVG via `innerHTML` (contenu auto-généré, marqué trusted) —
  conforme à la politique de rendu (HTML fiable).
- **Régression** : tous les modules précédents (journey/tools/home/migration) passent les
  tests ; le reset ne touche que la page profil.

---

## Next Milestone Recommendation

La gestion locale de compte est complète. Recommandation :

1. **Milestone 5.1 — Polissage** : rendre la langue fonctionnelle (localisation légère),
   enrichir l'avatar SVG.
2. **Milestone 6 — Authentification réelle (serveur)** : définir le schéma serveur et la
   vérification de la clé de récupération (sans mot de passe), branchée sur
   `Config.backendUrl`/`apiEnabled`, avec fallback offline.
3. **Milestone 7 — Synchronisation** : remplacer la couche Store par un `SyncService`
   utilisant `Settings.exportData()`/`importData()` comme format, sans modifier l'UI.

Il est recommandé de **commit et valider en navigateur** M5 avant de poursuivre.

---

*Milestone 5 terminé. Gestion locale de compte (profil, avatar, réglages, export/import,
reset) posée, 100 % offline-first. Aucune fonctionnalité réseau ni backend ajoutée.*
