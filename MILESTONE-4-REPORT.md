# Milestone 4 Implementation Report
### Authentication Foundation (Recovery Key Only) — NullSec Platform V2

> Date : 6 août 2026 · Périmètre : fondation de clé de récupération uniquement.
> Aucune authentification, aucun backend, aucune synchronisation, aucun compte,
> aucun envoi réseau. Tout est **100 % local** et **offline-first**.

---

## Summary

Ce milestone introduit le **concept de clé de récupération** comme base du futur
modèle d'authentification, **sans authentifier personne** :

1. **RecoveryKey** (`assets/js/recovery-key.js`, `window.RecoveryKey`) — génération,
   validation et normalisation d'une clé de récupération cryptographique, lisible et
   groupée (format `NSK1-XXXX-XXXX-XXXX-XXXX-XXXX`).
2. **Génération unique** — la clé est générée **une seule fois**, à la première
   initialisation du profil (`UserProfile.init()`), et jamais régénérée.
3. **Store étendu** — clé `ns:recovery` + `getRecoveryKey()/saveRecoveryKey()/
   deleteRecoveryKey()`, réutilisant la logique existante.
4. **Profil étendu** — champ `recovery_created_at` ajouté au profil ; la clé elle-même
   **n'est jamais** stockée dans le profil (séparée sous `ns:recovery`).
5. **Page profil** — carte "Recovery Key" : affichage masqué (`••••`), boutons
   Reveal/Hide et Copy (Clipboard API), DOM-safe, sans script inline ni `innerHTML`.
6. **Avis de confidentialité** — message d'information sur la clé, purement informatif.
7. **Init order** étendu : `… → user-profile → recovery-key → statistics → …` (23 pages).
8. **Documentation** — `recovery-key.md` créé ; `javascript-architecture.md`,
   `v2-architecture.md`, `identity-schema.md` mis à jour.

**Validation finale :** 23 fichiers JS passent `node --check` ; aucun `var` ; aucun
handler inline ; `fetch` uniquement dans `data-loader` ; aucune fuite de la clé (pas de
log, pas d'URL, pas d'envoi réseau) ; RecoveryKey/UserProfile/Profile testés ;
régressions (journey, tools, migration) OK.

---

## Files Created

| File | Purpose |
|------|---------|
| `assets/js/recovery-key.js` | Module `window.RecoveryKey` : generateRecoveryKey / validateRecoveryKey / normalizeRecoveryKey / get / ensure. |
| `docs/recovery-key.md` | Documentation : purpose, format, génération, usage futur, sécurité, philosophie, offline-first. |

---

## Files Modified

| File | Change | Reason |
|------|--------|--------|
| `assets/js/store.js` | Ajout clé `RECOVERY` (`ns:recovery`) + `getRecoveryKey/saveRecoveryKey/deleteRecoveryKey` | Encapsuler la clé via Store |
| `assets/js/user-profile.js` | Ajout `recovery_created_at` au profil + `ensureRecovery()` appelé depuis `init()`/`create()` | Générer la clé une fois, sans l'exposer dans le profil |
| `assets/js/profile.js` | Ajout `renderRecovery()` (carte masquée + Reveal/Hide/Copy) | Afficher la clé sur la page profil |
| `profile.html` | Ajout section "Account Recovery" + container `#profile-recovery` + script `recovery-key.js` | Page profil |
| 22× autres `*.html` | Ajout `recovery-key.js` dans l'ordre de chargement | Init order |
| `assets/css/pages.css` | Styles `.profile-recovery`, `.recovery-key-display`, `.recovery-warning`, `.recovery-actions` | Styles de la carte (tokens existants) |
| `docs/javascript-architecture.md` | Module RecoveryKey, API, init order, clé `ns:recovery`, relation Store→recovery | Documentation |
| `docs/v2-architecture.md` | Couche RecoveryKey + chaîne UI→RecoveryKey→UserProfile→Progress→Identity→Store | Documentation |
| `docs/identity-schema.md` | Champ `recovery_created_at` dans le schéma de profil | Documentation |

---

## Architecture Changes

```
UI (profile page)
        │
        ▼
RecoveryKey (recovery-key.js)     ── Store (ns:recovery)
        │
        ▼
UserProfile (user-profile.js)     ── Store, Identity, RecoveryKey
        │
        ▼
Progress (progress-service.js)    ── Store, Identity
        │
        ▼
Identity (identity.js)            ── Store
        │
        ▼
Store (store.js) ──► localStorage
```

### Ordre d'initialisation (23 pages)
```
store.js → utils.js → data-loader.js → config.js → identity.js → user-state.js
        → progress-service.js → user-profile.js → recovery-key.js
        → statistics-service.js → theme.js → navigation.js → fuse.min.js
        → search.js → modal.js → animations.js → [page modules]
```

`recovery-key.js` est chargé après `user-profile.js` (il est consommé par ce dernier)
et avant `statistics-service.js` (pas de dépendance, mais ordre stable).

---

## Data Models

### Recovery key — `ns:recovery`
```
NSK1-4XJT-KQ9P-7FMD-2AZN-8WRL
```
- Préfixe `NSK1` (NullSec Key v1), 5 groupes de 4 chars base32 (`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`).
- Stockée **séparément** du profil.

### Profil (étendu) — `ns:user:profile`
```json
{
  "version": 1,
  "identity_id": "uuid",
  "username": "Anonymous",
  "avatar_seed": "...",
  "created_at": "...",
  "updated_at": "...",
  "recovery_created_at": "..."
}
```
- `recovery_created_at` = horodatage de la première émission de la clé.
- La clé **n'apparaît pas** dans le profil.

---

## Security Considerations

- **La clé ne quitte jamais le navigateur** : stockée uniquement dans `ns:recovery`.
- **Aucun envoi réseau** : `recovery-key.js` ne contient aucun `fetch`/XHR/`sendBeacon`.
- **Aucune fuite** : pas de `console.log` de la clé, pas d'apparition dans les URLs,
  pas de log, pas d'impression console.
- **Pas de régénération** : `ensure()` ne génère qu'en l'absence de clé existante.
- **Cryptographique** : `crypto.getRandomValues()` (fallback mathématique de secours).
- **Rendu DOM-safe** : la page profil utilise `Utils.el`/`textContent`, aucun
  `innerHTML` dynamique, aucun script inline.
- **Clipboard** : le "Copy" utilise `navigator.clipboard.writeText` ; en cas d'échec,
  aucun fallback risqué (pas de fuite).

---

## Testing Results

| Test | Méthode | Résultat |
|------|---------|----------|
| Syntaxe JS | `node --check` sur 23 modules | ✅ Tous OK |
| Aucun `var` | grep (hors fuse.min) | ✅ |
| Aucun handler inline | grep `on(click/change/input)=` | ✅ |
| `fetch` centralisé | grep `fetch(` | ✅ Seul data-loader |
| Pas de log de clé | grep `console.log(...recovery)` | ✅ |
| **Generation** | generateRecoveryKey() | ✅ format `NSK1-…`, 6 segments, longueurs 4 |
| **Validation** | validateRecoveryKey() | ✅ valide true, invalides false (court/préfixe/charset/non-chaîne) |
| **Normalisation** | normalizeRecoveryKey() | ✅ minuscules→majuscules, espaces→tirets, invalide→null |
| **Persistence** | Store.getRecoveryKey/save/delete | ✅ |
| **Reload** | ensure() après régénération | ✅ même clé |
| **No regeneration** | ensure() x2 | ✅ idempotent |
| **UserProfile integration** | init() | ✅ clé générée, recovery_created_at défini, pas de clé dans profil |
| **Copy** | clipboard.writeText | ✅ copie == clé |
| **Reveal/Hide** | click | ✅ masqué↔visible, copy disabled/enabled |
| **Régression** | journey (1+29), tools (50), migration Store/Progress | ✅ |

> Note : aucun navigateur réel ; validation en Node avec mocks DOM/localStorage/crypto/
> clipboard. Un test visuel en navigateur est recommandé avant déploiement.

---

## Remaining Technical Debt (reporté volontairement)

- **Aucune authentification** : la clé est générée et affichée, mais aucune vérification
  de récupération n'existe encore (futur milestone).
- **Avatar déterministe** : `avatar_seed` stocké mais affichage simplifié (glyphe).
- **Export/import de la clé** : non implémenté (demandé explicitement "DO NOT IMPLEMENT").
- **Chiffrement** : aucune dérivation de clé / chiffrement des données (hors périmètre).
- **Polices Google Fonts** externes toujours.

---

## Risks

- **Régression** : la clé est générée uniquement par `UserProfile.init()` (page profil) ;
  aucun module existant ne s'en sert, donc aucun impact sur journey/tools/home (testé).
- **`recovery_created_at`** : ajouté de façon additive ; le profil v1 existant est
  enrichi sans perte (le champ est `null` tant que non émis).
- **Clipboard** : en contexte non sécurisé `navigator.clipboard` peut être absent ;
  géré par garde (aucune fuite, pas de crash).
- **`crypto.getRandomValues`** : fallback mathématique sur navigateurs très anciens
  (la clé reste unique localement, non cryptographique) — acceptable pour un usage
  local d'identifiant.

---

## Next Milestone Recommendation

La fondation de récupération est posée. Recommandation :

1. **Milestone 4.1 — Saisie & vérification locale** : ajouter un champ de saisie sur la
   page profil pour tester la normalisation/validation de la clé (sans backend), et
   l'édition de profil (username).
2. **Milestone 5 — Export/import local** : permettre de copier la clé vers un
   export/import JSON local (hors cloud), si souhaité.
3. **Milestone 6 — Authentification réelle** : définir le schéma serveur et la
   vérification de la clé (sans mot de passe), branchée sur `Config.backendUrl`/
   `apiEnabled`, avec fallback offline.

Il est recommandé de **commit et valider en navigateur** M4 avant de poursuivre.

---

*Milestone 4 terminé. Fondation d'authentification (clé de récupération uniquement)
posée, 100 % locale et offline-first. Aucune authentification ni fonctionnalité
réseau ajoutée.*
