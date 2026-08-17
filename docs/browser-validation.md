# NullSec — Browser Validation Integration Point

> **Statut :** point d'intégration **documenté**, non implémenté en framework lourd.
> **REAL BROWSER : BLOCKED** — aucun navigateur réel / Playwright / Puppeteer n'est disponible
> dans l'environnement actuel.

---

## Objectif

Fournir un **point d'intégration minimal et documenté** pour la future validation navigateur,
sans introduire un framework de tests end-to-end lourd dans le dépôt tant qu'un environnement
réel n'est pas disponible.

## Ce qui est requis (au moment d'exécuter)

| Élément | Valeur |
|---------|--------|
| Navigateur | Chrome / Chromium / Firefox (ou Playwright / Puppeteer installés) |
| Base URL | `https://neonmc23.github.io/NullSec-Website/` ou serveur local |
| Config Supabase | `SUPABASE_URL` + `SUPABASE_ANON_KEY` (publics) + flags activés |
| Compte de test | username/password jetables (documentés dans `docs/production-validation.md`) |

## Variables d'environnement requises

- `SUPABASE_URL` (public)
- `SUPABASE_ANON_KEY` (public)
- (côté déploiement, privés) : `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`

## Point d'entrée de test

Le protocole complet des flows à vérifier est dans **`docs/production-validation.md`**. Il peut
être exécuté :

1. manuellement dans un navigateur (guide pas-à-pas), ou
2. via un harness Playwright/Puppeteer **créé à ce moment-là** (pas avant), qui n'est pas engagé
   dans ce dépôt sans environnement réel.

## Pourquoi pas de framework maintenant

- Aucun navigateur réel n'est disponible → des centaines de tests E2E fragiles ne seraient ni
  exécutables ni maintenables.
- L'architecture est simple/statique ; un harness minimal suffira quand l'infrastructure
  existera.
- Le point d'intégration est déjà défini (base URL, config, compte de test, protocole).

## Statut honnête

**REAL BROWSER VALIDATED : BLOCKED** — rien n'a été exécuté dans un navigateur réel.
