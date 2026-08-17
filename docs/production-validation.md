# NullSec — Real-World Validation Protocol

> **Statut :** protocole documenté. **Non exécuté** (REAL SUPABASE / REAL BROWSER BLOCKED).
> Ce document décrit **exactement** les tests à exécuter lorsqu'un navigateur réel et un
> projet Supabase seront disponibles. Il ne prétend pas qu'ils ont été exécutés.

---

## Prérequis

- Projet Supabase réel + `SUPABASE_ACCESS_TOKEN` + `SUPABASE_PROJECT_REF`.
- `SUPABASE_URL` + `SUPABASE_ANON_KEY` injectés (publics) + flags activés.
- Frontend déployé sur GitHub Pages (ou servé localement pointant vers Supabase).
- Navigateur réel (ou Playwright/Puppeteer).

## Entry point

- Base URL : `https://neonmc23.github.io/NullSec-Website/` (ou URL locale).
- Config requise : voir `docs/production-deployment.md`.
- Variables d'environnement requises : `SUPABASE_URL`, `SUPABASE_ANON_KEY` (publics) +
  `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` (privés, deploy).

---

## 1. Guest flow

1. Landing page → comprend ce qu'est NullSec (hero + CTA « Start Your Journey »).
2. Navigation → Journey, Tools, Articles, Community, Contribute, About, Account.
3. Journey → Campaigns → Missions.
4. Mission modal → guide s'affiche une seule fois, contexte de Campaign, prev/next.
5. Guest ne peut **pas** compléter : CTA « Create account to save progress ».
6. About / Articles / Tools / Community / Contribute : pas de lien cassé, pas de console error.

## 2. Account flow

1. Register (username + password) → session.
2. Login → session créée.
3. Account → @username, sections Authentication / Recovery / Progress / Settings / Public Profile.
4. Logout → guest. Login à nouveau → même compte.

## 3. Progression flow

1. Login → Journey → Campaign.
2. Complete mission → feedback « Mission complete » (✓ correct).
3. Next mission → s'ouvre.
4. Campaign complétée → badge « ⭐ <Campaign> complete ».
5. Refresh → progression persistée.
6. Logout/login → progression persistée.
7. Retour après plusieurs jours → progression restaurée.

## 4. Public Profile flow

1. Account → enable Public Profile.
2. Bio + learning interests → save.
3. View public profile → @username, bio, interests, member-since, progression, campaign progress,
   achievements.
4. Share URL → copie/lien.
5. Ouvrir l'URL déconnecté → profil visible (public).
6. Désactiver le profil → ouvrir la même URL déconnecté → **identique au profil inexistant**
   (non-énumératif).

## 5. Privacy

- Disabled profile vs nonexistent : réponse identique (`enabled:false`).
- Aucun password / recovery / session / user ID / email public.

## 6. Cross-device

- Browser A : login, complète une mission, met à jour le profil.
- Browser B : login même compte → progression visible, profil identique, stats campagne,
  achievements identiques.

## 7. Responsive

- Desktop, tablet-like, mobile.
- Navigation, mission modal, long username/bio/interests, progress bars, Campaign feedback,
  Public Profile, sharing UI, footer, About link. Pas d'overflow.

## 8. Accessibility

- Navigation clavier, ouverture modal, focus, Escape, ARIA dialog, boutons vs liens, contenu
  lisible, pas d'overflow évident.

## 9. Security black-box

- Accès anon aux données privées → refusé.
- Update profil non-autorisé / d'un autre user → refusé.
- user IDs arbitraires → refusés.
- bio surdimensionnée / trop d'interests / username malformé → validation côté serveur.
- Accès direct aux helpers internes → refusé (pas d'EXECUTE PUBLIC).

## Résultats

Pour chaque flow : **PASS / FAIL / BLOCKED / NOT TESTED**. Aucun PASS ne sera déclaré pour un
test non exécuté.
