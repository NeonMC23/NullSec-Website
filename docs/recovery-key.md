# NullSec — Recovery Key

> **Fondation du modèle de récupération de compte** (introduit en Milestone 4).
> **M13/M16** : la clé de récupération sert de secret d'authentification auprès de
> **Supabase** (SHA-256 transport → bcrypt salé côté serveur). Elle est stockée en
> **sessionStorage** (`SessionStore`), **jamais** en localStorage. La source de vérité
> du compte est Supabase ; la clé est la méthode de récupération, pas un compte local.

---

## 1. Purpose

La **Recovery Key** prépare le futur modèle de récupération de compte : chaque futur
compte NullSec sera récupérable via une clé de récupération unique. Ce milestone pose
uniquement la **génération, le stockage et l'affichage local** de cette clé — personne
n'est encore authentifié, rien ne quitte le navigateur.

---

## 2. Format

Exemple (non codé en dur) :

```
NSK1-4XJT-KQ9P-7FMD-2AZN-8WRL
```

Structure :
- Préfixe : **`NSK1`** (NullSec Key, version 1).
- Cinq groupes de 4 caractères, séparés par `-`.
- Charset base32 **sans ambiguïté** : `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
  (exclut `0`, `O`, `1`, `I` pour éviter les confusions à la relecture).

---

## 3. Génération

- **Cryptographiquement aléatoire** : `crypto.getRandomValues()` (fallback
  mathématique en dernier recours sur navigateurs anciens).
- **Charnière `RecoveryKey.generateRecoveryKey()`** produit un nouveau couple.
- **Générée UNE seule fois** : à la première initialisation du profil
  (`UserProfile.init()`). Si une clé existe déjà, **jamais régénérée**.

```
UserProfile.init()
        │
        ▼
ensureRecovery()
        │
        ├── clé existe ? → retourner (pas de régénération)
        └── clé absente → RecoveryKey.ensure() → générer + stocker
```

---

## 4. Stockage

- **Clé Store** : `ns:recovery`
- **Méthodes** : `Store.getRecoveryKey()`, `Store.saveRecoveryKey()`,
  `Store.deleteRecoveryKey()` (réutilisent la logique `get/set/remove` existante).
- La clé est stockée **séparément** du profil. Le profil contient uniquement
  `recovery_created_at` (horodatage d'émission), **jamais** la clé elle-même.

---

## 5. Vérification locale (M6)

`RecoveryKey.verify(input)` vérifie localement une clé saisie :
1. **normalise** (majuscules, tirets) ;
2. **valide** le format `NSK1-…` ;
3. **compare** avec la clé stockée localement ;
4. retourne `true` / `false`.

Aucune régénération, aucun réseau, aucun log, aucune exposition en URL.

## 6. Utilisation future (authentification)

Ce milestone ne réalise **aucune** authentification. À l'avenir, la clé servira de
base pour récupérer un compte : l'utilisateur saisira sa clé, le client la
**normalisera** puis la **validera** ; la vérification réelle (côté serveur) viendra
dans un milestone ultérieur. L'abstraction `Auth.loginWithRecoveryKey()` prépare ce
flow sans l'activer.

---

## 7. Sécurité

La clé **doit** :
- ne jamais quitter `localStorage` ;
- ne jamais être envoyée sur le réseau ;
- ne jamais apparaître dans une URL ;
- ne jamais être loggée ;
- ne jamais être imprimée dans la console ;
- ne jamais être générée deux fois.

Le module `recovery-key.js` n'expose aucun log, aucun envoi réseau, et `ensure()` ne
génère qu'en l'absence de clé existante.

---

## 8. Philosophie de récupération

- **Sans mot de passe** : la récupération repose sur une clé, pas sur un secret choisi.
- **Local d'abord** : la clé est générée et stockée sur l'appareil ; aucun service tiers.
- **Lisible par l'humain** : format groupé sans ambiguïté pour une copie fiable.
- **Versionné** : le préfixe `NSK1` permet d'évoluer le format sans casser l'existant.

---

## 9. Comportement offline-first

Tout fonctionne hors-ligne : génération, stockage, affichage (reveal/hide/copy) et
validation. Aucun appel réseau n'est déclenché par le module ou la page profil.

---

## 10. Liens

- Module : `assets/js/recovery-key.js`
- Stockage : `assets/js/store.js`
- Intégration profil : `assets/js/user-profile.js`
- Page profil : `profile.html` + `assets/js/profile.js`
- Architecture : `docs/v2-architecture.md`
