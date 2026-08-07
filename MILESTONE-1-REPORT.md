# Milestone 1 Implementation Report
### Foundation Layer: Identity, Backend Preparation & User System Architecture

> Date : 6 août 2026 · Périmètre : fondations uniquement.
> Aucun login, inscription, backend, profil UI, dashboard, réseau social,
> messagerie ni permission implémenté.

---

## 1. Summary

Ce milestone pose la **couche fondation** pour les futures fonctionnalités V2, sans
aucune fonctionnalité utilisateur visible :

1. **Identity module** (`assets/js/identity.js`, `window.Identity`) — identité locale
   anonyme (UUID v4), offline-first, sans email/password/auth externe.
2. **Identity schema documenté** (`docs/identity-schema.md`) — format versionné.
3. **Store étendu** — `Store.getIdentity()` / `saveIdentity()` / `deleteIdentity()`
   (réutilisent la logique existante, pas de duplication), + `getUserState()` /
   `saveUserState()` / `clearUserState()`.
4. **User State layer** (`assets/js/user-state.js`, `window.UserState`) — état de
   session, `isAuthenticated()` toujours `false`.
5. **Config layer** (`assets/js/config.js`, `window.Config`) — version, feature-flags,
   `backendUrl`/`offlineMode` réservés (évite tout URL backend en dur).
6. **Ordre d'initialisation** corrigé sur les 22 pages :
   `store → utils → data-loader → config → identity → user-state → autres`.
7. **Architecture documentée** (`docs/v2-architecture.md`) + mise à jour de
   `docs/javascript-architecture.md`.

**Bonus correctif** : corrigé un bug HTML pré-existant où les balises
`<script src="store.js">` et `<script src="data-loader.js">` n'avaient pas de
`</script>` fermant (opens 11 vs closes 9) — désormais toutes les balises sont
correctement fermées.

**Validation finale :** 18 fichiers JS passent `node --check` ; aucun `var` ; aucun
handler inline ; `fetch` uniquement dans `data-loader` ; aucun secret/token ;
aucun fingerprint/tracking ; 22 pages chargent les 3 nouveaux modules ; aucun lien
interne cassé ; régressions (journey, tools, migration Store) vérifiées.

---

## 2. Files Created

| File | Purpose |
|------|---------|
| `assets/js/identity.js` | Module `window.Identity` : init/get/create/update/clear/exists (UUID local). |
| `assets/js/user-state.js` | Module `window.UserState` : get/set/clear/isAuthenticated (session anonyme). |
| `assets/js/config.js` | Module `window.Config` : configuration frontend centralisée. |
| `docs/identity-schema.md` | Schéma de l'identité (v1), invariants, cycle de vie, migration V2. |
| `docs/v2-architecture.md` | Architecture cible V2, philosophie d'identité, offline-first, migration backend, principes de confidentialité, roadmap d'auth. |

---

## 3. Files Modified

| File | Change | Reason |
|------|--------|--------|
| `assets/js/store.js` | Ajout clés `IDENTITY`, `USER_STATE` + méthodes `getIdentity/saveIdentity/deleteIdentity` et `getUserState/saveUserState/clearUserState` | Encapsuler l'identité/état via Store (pas de duplication) |
| 22× `*.html` | Ordre de chargement des scripts mis à jour (config/identity/user-state après data-loader) ; correction des balises `</script>` manquantes | Init order + fix HTML |
| `docs/javascript-architecture.md` | Modules Config/Identity/UserState, API partagées, relation Store→Identity, clés, ordre d'init | Documentation |

> `README.md`, `sitemap.xml`, CSS modulaires et autres modifications listées dans
> `git status` proviennent des milestones 0.1–0.4 (non commités). Ce milestone 1
> n'ajoute que les changements ci-dessus.

---

## 4. Architecture Changes

```
 HTML
  │
  └── JavaScript Modules (IIFE, window.*)
        ├── Data Layer   data-loader.js → JSON
        ├── Store        store.js → localStorage
        ├── Config       config.js            (NOUVEAU)
        ├── Identity     identity.js → ns:identity   (NOUVEAU)
        ├── UserState    user-state.js → ns:user:state (NOUVEAU)
        └── Future API   (prévu, non implémenté)
```

### Ordre d'initialisation (22 pages)
```
store.js → utils.js → data-loader.js → config.js → identity.js → user-state.js
        → theme.js → navigation.js → fuse.min.js → search.js → modal.js
        → animations.js → [modules page]
```

### Relation Store → Identity
- `identity.js` et `user-state.js` n'accèdent **jamais** à `localStorage` directement ;
  ils passent par les méthodes dédiées de `Store` (elles-mêmes basées sur
  `get/set/remove` existants).
- Persistance : `ns:identity` (objet v1), `ns:user:state` (objet d'état).

### Modèle
Tout l'état est **local** et **offline-first**. Aucune donnée envoyée nulle part.

---

## 5. Security Considerations

- **Aucun mot de passe**, aucun token, aucune cookie de session.
- **Aucun analytics**, tracking ou fingerprinting (vérifié par grep).
- **Aucun fournisseur d'identité tiers.**
- `uuid()` : `crypto.randomUUID()` quand disponible, sinon fallback mathématique
  (suffisant pour un identifiant local non cryptographique).
- `Config.backendUrl` reste `null` et `apiEnabled=false` ; aucun appel réseau.
- Les modules Identity/UserState/Config n'exposent que des API minimales et ne
  font aucun `fetch`.

---

## 6. Testing Results

| Test | Méthode | Résultat |
|------|---------|----------|
| Syntaxe JS | `node --check` sur 18 fichiers | ✅ Tous OK |
| Aucun `var` | grep (hors fuse.min) | ✅ |
| Aucun handler inline | grep `on(click/change/input)=` | ✅ |
| `fetch` centralisé | grep `fetch(` | ✅ Seul data-loader |
| Aucun secret/token | grep secrets | ✅ |
| Aucun fingerprint/tracking | grep | ✅ (seul un commentaire) |
| Ordre de chargement | parse des `<script src>` des 22 pages | ✅ Core d'abord, ordre correct |
| Balises `</script>` | comptage opens/closes | ✅ Corrigé (0 sans fermeture) |
| **Identity** : create→exists true | harnais Node | ✅ |
| **Identity** : reload→même UUID | init() après create | ✅ |
| **Identity** : update→timestamp change | update() | ✅ |
| **Identity** : clear→exists false | clear() | ✅ |
| **Identity** : UUID v4 avec/sans crypto | deux scénarios | ✅ |
| **UserState** : authenticated false | get()/isAuthenticated() | ✅ |
| **Config** : valeurs attendues | Config.get() | ✅ |
| **Store migration** : legacy→ns: | harnais Node | ✅ (régression) |
| **Store** : save/get/delete identity | via Store | ✅ |
| **Régression** : journey (1 weekly+29 stage) | harnais DOM | ✅ |
| **Régression** : tools (50) | harnais DOM | ✅ |

> Note : aucun navigateur réel dans le sandbox ; validation d'exécution en Node
> avec mocks DOM/localStorage/fetch. Un test visuel en navigateur est recommandé.

---

## 7. Remaining Technical Debt (reporté volontairement)

- **Identité non utilisée par l'UI** : aucun module ne consomme encore `Identity`/
  `UserState` (volontaire — fondations seulement).
- **Synchronisation backend** : non implémentée (Config/Identity prêts).
- **Auth / profils / dashboard** : reportés (roadmap documentée).
- **`crypto.randomUUID`** nécessite un contexte sécurisé (HTTPS/localhost) ; le
  fallback mathématique couvre les autres cas.
- **Polices Google Fonts** externes toujours (à auto-héberger pour privacy-first).

---

## 8. Risks

- **Régression du `</script>` fix** : la correction a touché les 22 pages ; vérifiée
  par comptage opens/closes (0 balise sans fermeture) et tests d'exécution. Risque nul.
- **Ordre de chargement** : identity/user-state ne dépendent que de `Store` ; ils
  sont chargés après `store.js` et avant les modules UI. Aucun module ne les consomme
  encore, donc aucun risque d'initialisation manquante.
- **`crypto.randomUUID`** : en contexte non sécurisé, fallback utilisé ; l'identité
  reste fonctionnelle (UUID unique localement).
- **Aucun risque de perte de données** : la migration Store est inchangée et re-testée.

---

## 9. Next Milestone Recommendation

La fondation (M1) est stable. Recommandation :

1. **Milestone 1.1 — Adoption UI** : consommer `Identity`/`UserState` dans un module
   discret (ex. initialiser l'identité au chargement, préfixer la progression par
   `identity.id` pour préparer la synchronisation) **sans UI visible**.
2. **Milestone 2 — Progression synchronisable** : externaliser les données de
   progression (journey, weekly, articles lus) derrière un service unifié
   (`ProgressService`) qui lit/écrit via Store aujourd'hui et via l'API demain.
3. **Milestone 3 — Backend minimal** : un service sans mot de passe (sign-in par clé
   de récupération) branché sur `Config.backendUrl`, avec fallback offline.

Il est recommandé de **commit et valider en navigateur** l'état M1 avant de poursuivre.

---

*Milestone 1 terminé. Fondations d'identité posées, architecture préservée,
privacy-first. Aucune fonctionnalité V2 utilisateur introduite.*
