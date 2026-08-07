# NullSec — Settings Schema

> **Référence du modèle de préférences utilisateur** (introduit en Milestone 5).
> 100 % local, offline-first. Aucune synchronisation.

---

## 1. Format (v1)

```json
{
  "version": 1,
  "theme": "system",
  "language": "en",
  "privacy": {
    "offline_only": true,
    "telemetry": false
  },
  "appearance": {
    "animations": true,
    "reduced_motion": false
  },
  "updated_at": "ISO"
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `version` | `number` | Version du schéma (actuellement `1`). |
| `theme` | `string` | `'system'` \| `'dark'` \| `'light'`. `system` suit la préférence du navigateur. |
| `language` | `string` | Code de langue (défaut `'en'` ; placeholder future-ready). |
| `privacy.offline_only` | `boolean` | Toute la donnée reste locale (`true`). |
| `privacy.telemetry` | `boolean` | Aucune télémétrie (`false`). |
| `appearance.animations` | `boolean` | Animations activées. |
| `appearance.reduced_motion` | `boolean` | Respect du mouvement réduit. |
| `updated_at` | `string` (ISO) | Dernière mise à jour. |

---

## 2. Stockage

- **Clé Store** : `ns:settings`
- **Méthodes** : `Store.getSettings()`, `Store.saveSettings()`, `Store.deleteSettings()`.
- Accès unifié par le **Settings Service** (`window.Settings`).

---

## 3. Cycle de vie

```
Settings.init()      → crée les réglages par défaut si absents
Settings.get()       → réglages courants
Settings.update({...}) → fusion profonde partielle, bump updated_at
Settings.reset()     → retour aux défauts
Settings.exportData() → collecte toute la donnée locale (voir §5)
Settings.importData(obj) → valide + restaure
Settings.validateUsername(name) → trim/longueur
```

---

## 4. Intégration thème

Le thème effectif est résolu depuis `Settings.theme` (source de vérité) :
- `system` → suit `prefers-color-scheme` ;
- `dark` / `light` → appliqué directement.
Le thème résolu est aussi reflété dans `ns:theme` (compatibilité). Le module
`theme.js` lit désormais `Settings`.

---

## 5. Format d'export / import local

`Settings.exportData()` renvoie :

```json
{
  "type": "nullsec-export",
  "version": 1,
  "exported_at": "ISO",
  "data": {
    "identity": { ... },
    "profile": { ... },
    "progress": { ... },
    "recovery": "NSK1-...",
    "settings": { ... }
  }
}
```

`Settings.importData(obj)` :
- valide `type` (`nullsec-export`), `version` (`1`), présence de `data` ;
- restaure identity, profile, progress, recovery (si format valide), settings ;
- renvoie `{ ok: true }` ou `{ ok: false, error }`.

Aucune validation d'écriture destructive n'est faite au niveau du service : l'UI
demande une **confirmation** avant l'import.

---

## 6. Export / import : précautions

- Export = téléchargement d'un fichier JSON local (aucun cloud).
- Import = lecture d'un fichier local via `FileReader`, validation, puis écriture.
- En cas d'échec, message d'erreur affiché, aucune donnée modifiée.
- Aucun envoi réseau.

---

## 7. Reset complet

`Settings` ne gère que les réglages. Le **reset complet** de toute la donnée locale
(identity, profile, progress, recovery, settings) est orchestré par la page profil :
suppression de toutes les clés puis recréation d'une identité/profil/clé/réglages
frais. Aucun rechargement de page requis.

---

## 8. Liens

- Service : `assets/js/settings-service.js`
- Stockage : `assets/js/store.js`
- Page : `profile.html` + `assets/js/profile.js`
- Architecture : `docs/v2-architecture.md`
