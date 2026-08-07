# NullSec — Identity Schema

> **Référence du format d'identité locale** (introduit en Milestone 1).
> **M16/M17/M19** : l'identité est un identifiant de liaison (UUID) pour le compte
> **Supabase** (source de vérité). Depuis M17 elle est conservée **en mémoire de
> session uniquement** (via `IdentityRepository` / Store mémoire), **jamais** en
> localStorage. Elle n'est **pas** un « compte local » et ne fait pas autorité.
> Les sections ci-dessous décrivant une persistance `localStorage` (`ns:identity`,
> `ns:user:profile`, `ns:settings`) sont **historiques** — le modèle actuel est
> mémoire + Supabase.

---

## 1. Philosophie

L'identité NullSec est un simple identifiant **local** généré sur l'appareil :

- **Aucun email, aucun mot de passe, aucun compte.**
- **Aucune authentification externe**, aucun fournisseur tiers.
- **Aucun fingerprinting** (pas de collecte de caractéristiques d'appareil).
- **Fonctionne hors-ligne** : tout est stocké dans `localStorage` via le module Store.
- **Rétro-compatible backend** : le format est versionné et contient un UUID stable,
  prêt à être synchronisé vers un futur backend sans casser les identités existantes.

---

## 2. Format (v1)

```json
{
  "id": "uuid",
  "username": "",
  "display_name": "",
  "avatar": null,
  "created_at": "",
  "updated_at": "",
  "version": 1
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `id` | `string` (UUID v4) | Identifiant unique, généré une fois, **jamais modifié**. |
| `username` | `string` | Nom d'utilisateur (vide tant que l'utilisateur n'en choisit pas un). |
| `display_name` | `string` | Nom d'affichage optionnel. |
| `avatar` | `string` \| `null` | Référence d'avatar (URL/chemin) ou `null`. |
| `created_at` | `string` (ISO 8601 UTC) | Date de création. |
| `updated_at` | `string` (ISO 8601 UTC) | Dernière mise à jour (incrémentée à chaque `update`). |
| `version` | `number` | Version du schéma (actuellement `1`). |

### Invariants
- `id` est **immutable** (généré une fois, préservé par `update`).
- `version` est **géré par le système** (incrémenté par le module Identity, pas par l'utilisateur).
- `created_at` et `updated_at` sont **gérés par le système**.
- Les seuls champs éditable via `Identity.update()` sont : `username`, `display_name`, `avatar`.

---

## 3. Stockage

- **Clé Store** : `ns:identity`
- **Persistance** : `localStorage` via le module Store (`Store.getIdentity()`,
  `Store.saveIdentity()`, `Store.deleteIdentity()`).
- **Aucun autre module ne doit accéder à `localStorage` directement** pour l'identité.

---

## 4. Cycle de vie

```
Identity.create()  → génère UUID + timestamps, persiste  → exists true
Identity.init()    → crée si absent, sinon charge l'existant (id préservé)
Identity.get()     → renvoie l'objet identité (ou null)
Identity.update({...}) → fusionne username/display_name/avatar, bump updated_at
Identity.clear()   → supprime l'identité  → exists false
```

---

## 5. Évolution vers V2 (backend)

Lorsqu'un backend arrivera :
1. `id` servira de clé de synchronisation (même UUID local = même profil distant).
2. Un champ optionnel (ex. `synced_at`) pourra être ajouté **sans casser** le v1
   (le schéma est versionné).
3. La génération de l'identité restera locale ; le backend ne fera que **lier**
   (pas authentifier) l'identité à une progression synchronisée.
4. `version` permet une migration de données propre.

---

## 6. Profil local (v1)

En plus de l'identité, un **profil local** (introduit en Milestone 3) fournit des
métadonnées d'affichage, liées à la même identité.

**Clé Store** : `ns:user:profile`
**Module** : `assets/js/user-profile.js` (`window.UserProfile`)

```json
{
  "version": 1,
  "identity_id": "uuid",
  "username": "Anonymous",
  "avatar_seed": "random-seed",
  "created_at": "ISO timestamp",
  "updated_at": "ISO timestamp",
  "recovery_created_at": "ISO timestamp"
}
```

| Champ | Type | Description |
|-------|------|-------------|
| `version` | `number` | Version du schéma (1). |
| `identity_id` | `string` (UUID) | Doit correspondre à `Identity.get().id`. |
| `username` | `string` | Nom local uniquement (défaut `"Anonymous"`). |
| `avatar_seed` | `string` | Graine aléatoire pour un avatar **déterministe** (aucun service externe, aucun fichier). |
| `created_at` | `string` (ISO) | Date de création. |
| `updated_at` | `string` (ISO) | Dernière mise à jour. |
| `recovery_created_at` | `string` (ISO) \| `null` | Horodatage de la première émission de la recovery key. La clé elle-même n'est **jamais** dans le profil (elle vit sous `ns:recovery`, voir `docs/recovery-key.md`). |

- **`identity_id`** est immutable (lié à l'identité).
- `exists()` vérifie que le profil est lié à l'identité courante.
- Aucune donnée ne quitte le navigateur.
- Les préférences associées à l'utilisateur (thème, langue, apparence, confidentialité)
  vivent dans `ns:settings` — voir `docs/settings-schema.md`.

---

## 7. Liens

- Module identité : `assets/js/identity.js`
- Module profil : `assets/js/user-profile.js`
- Stockage : `assets/js/store.js`
- Architecture : `docs/v2-architecture.md`
