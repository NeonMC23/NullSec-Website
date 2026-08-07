# NullSec — CSS Architecture

> **Référence de l'architecture CSS** (migrée en Milestone 0.4).
> Le rendu est **identique** à l'ancien système : aucune règle n'a été modifiée,
> toutes les règles sont conservées, seule leur organisation physique change.

---

## 1. Nouvelle organisation

```
assets/css/
├── tokens.css       # variables CSS (:root) + @import fonts
├── base.css         # reset, html/body, typographie globale, éléments bruts
├── layout.css       # containers, sections, grids structurels
├── components.css   # cards, boutons, navbar, modals, badges, search, footer…
├── pages.css        # styles spécifiques pages (journey, tools, articles, …)
├── utilities.css    # classes utilitaires (fade-in, sr-only, accent, …)
└── themes.css       # thème clair/sombre ([data-theme="light"] …)
```

Chaque page charge les 7 fichiers **dans cet ordre** :
`tokens → base → layout → components → pages → utilities → themes`.

---

## 2. Ancienne architecture (remplacée)

- `style.css` (1639 lignes) : variables, reset, composants de base, thème.
- `v2.css` (1647 lignes) : composants V2 + overrides historiques appendés.

Les deux fichiers contenaient des **règles mélangées** et des **overrides
dupliqués**. Ils sont désormais conservés comme **stubs commentés vides**
(`style.css`, `v2.css`) pour compatibilité — plus aucune page ne les référence.

---

## 3. Garanties d'équivalence (vérification automatisée)

La migration a été validée par un script comparant, règle par règle :

| Vérification | Résultat |
|--------------|----------|
| Nombre total de règles | **486 = 486** (style.css 249 + v2.css 237) |
| Multiset des règles (sélecteur + corps) | **Identique** (0 manquante, 0 ajoutée) |
| Ordre relatif par sélecteur (dédoublons/overrides) | **Préservé** (0 inversion) |
| `@import` des fonts | Conservé, positionné en tête de `tokens.css` |
| Accolades équilibrées | Tous les fichiers équilibrés |

> Règles de même spécificité ciblant le même sélecteur conservent leur ordre
> (les overrides appendés en v2.css restent après leurs bases), ce qui préserve
> exactement la cascade. Les règles de spécificité différente sont
> indépendantes de l'ordre par définition du modèle CSS.

---

## 4. Mapping approximatif (cible vs contenu réel)

Le classement est fait par **sélecteur** ; comme l'ancien code mélangeait les
catégories, certains fichiers contiennent des règles issues des deux fichiers
d'origine (ex. `layout.css` et `components.css` contiennent les overrides de
`v2.css` pour leurs catégories respectives, dans l'ordre original). Cela est
nécessaire pour préserver la cascade.

| Fichier | Contenu principal |
|---------|-------------------|
| `tokens.css` | `:root` (variables), `@import` fonts |
| `base.css` | reset `*`, `html`, `body`, typo (`h1..h6`, `p`, `a`, `code`, …) |
| `layout.css` | `.container*`, `.section*`, grids (`*-grid`), hero structurel |
| `components.css` | navbar, mobile-menu, boutons, cards, modals, badges, tags, search, footer, discord, missions, tools, weekly, progress, tldr |
| `pages.css` | `.journey-*`, `.article-*`, `.tools-cat/search`, `.community-*`, `.about-*`, `.contribute-*` |
| `utilities.css` | `.fade-in`, `.fade-in-delay-*`, `.sr-only`, `.accent`, `.hidden`, `.skeleton` |
| `themes.css` | `[data-theme="light"]` et variantes |

---

## 5. Règles de maintenance

1. **Ajouter une nouvelle règle** dans le fichier correspondant à sa catégorie.
2. **Ne pas modifier l'ordre** d'une règle existante au sein d'une catégorie
   (préserve la cascade).
3. **Ne pas casser le contrat `@import`** : il reste en tête de `tokens.css`.
4. **Ne pas changer** la palette, les tailles, espacements, animations,
   responsive ni les classes HTML (le design est figé pour la v1).
5. Pour modifier une override appendée, la placer dans le même fichier que sa
   catégorie, **après** la règle de base (comme aujourd'hui dans `v2.css`).

---

## 6. Chargement

Chaque page HTML contient les 7 `<link>` dans l'ordre ci-dessus (préfixe
`assets/css/` pour les pages racine, `../assets/css/` pour les articles).
