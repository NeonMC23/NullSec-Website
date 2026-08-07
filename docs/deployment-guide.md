# NullSec — Deployment Guide (Supabase)

> **Backend de production = Supabase.** PostgreSQL est fourni par Supabase.
> Le scaffold Express est archivé (`backend/legacy-express/`), non utilisé.

---

## PUBLIC vs PRIVATE configuration

| Clé | Où | Usage |
|-----|----|-------|
| `SUPABASE_URL` | frontend + backend | URL du projet (publique). |
| `SUPABASE_ANON_KEY` | frontend + backend | Clé anon/publique (sans danger). |
| `SUPABASE_SERVICE_KEY` | **serveur/déploiement uniquement** | Clé service (contourne RLS). **Jamais dans le frontend.** |

Ne **jamais** placer la service-role key dans HTML/JS/CSS, GitHub Pages, Cloudflare
Pages, ni config client.

---

## Déploiement Supabase (étapes pratiques)

> Les noms d'écrans dépendent du dashboard Supabase actuel ; documentés prudemment.

1. **Créer un projet Supabase** (dashboard → New Project). Choisir une **région UE**
   (ex. `eu-central-1`, `eu-west-1`) pour ce projet.
2. **Noter** l'URL du projet et les clés (Settings → API) : `Project URL`,
   `anon public` key, `service_role` key (garder la service key secrète).
3. **Ouvrir le SQL Editor** (SQL → New query).
4. **Exécuter le schéma consolidé** : copier `backend/supabase/migrations/0001_schema.sql`.
5. **Exécuter les fonctions RPC** : coller successivement
   `backend/supabase/functions/rpc_auth.sql`, `rpc_sync.sql`, `rpc_activity.sql`,
   `rpc_country_metrics.sql`, `rpc_tool_activity.sql`, `rpc_profile.sql` (M18→M20).
6. **Activer RLS / politiques** : exécuter `backend/supabase/migrations/0002_rls.sql`,
   puis durcir les permissions de fonctions (`0003_rls_functions.sql` — révoque
   `EXECUTE` sur le helper interne `ns_create_session` pour anon/authenticated), puis
   contrôler **explicitement** les EXECUTE (`0004_rls_privileges.sql` — grants/revokes
   publics, M15 ; `0005_country_metrics_privileges.sql` — EXECUTE de
   `ns_country_metrics`, M18 ; `0006_challenge_semantics.sql` — `kind` M19 ;
   `0007_country_metrics_data.sql` — pays utilisateur + `tool_activity`, M20 ;
   `0008_country_metrics_privileges.sql` — EXECUTE `ns_tool_activity`
   `ns_update_profile`, M20).
7. **Vérifier RLS** : pour chaque table sensible, confirmer qu'aucun accès anon
   (SELECT) n'est possible ; pour les tables agrégées, SELECT anon autorisé.
8. **Trouver l'URL projet** et la **clé anon** (Settings → API).
9. **Configurer le frontend** : définir `SUPABASE_URL` + `SUPABASE_ANON_KEY` dans
   `Config`, puis `supabaseEnabled`, `authEnabled`, `backendEnabled`, `syncEnabled`
   à `true` (via un fichier de config de build, pas en dur).
10. **Ne jamais exposer la service-role key** côté frontend.
11. **Vérifier les appels API/RPC** (ex. `ns_metrics`, `ns_validate_session`).
12. **Tester register** : `ns_register` avec identity + SHA-256 transport hash.
13. **Tester login** : `ns_login` avec le bon transport hash → token.
14. **Tester logout** : `ns_logout` → session révoquée.
15. **Tester validation de session** : `ns_validate_session`.
16. **Tester sync** : `ns_sync_push` / `ns_sync_pull` avec token.
17. **Tester complétion anonyme** : `ns_activity` (mission + pays + région).
18. **Tester métriques** : `ns_metrics`.
19. **Tester le mode offline** : désactiver Supabase → le site fonctionne localement.
20. **Vérifier zéro requête** quand Supabase est désactivé (network tab vide).

---

## Activation production (M14)

Le dépôt reste **offline-first par défaut** (`supabaseEnabled=false`). L'activation
est **explicite** et séparée en deux axes :

| Mode | `supabaseEnabled` | `syncEnabled` |
|------|:-----------------:|:-------------:|
| Développement / défaut | `false` | `false` |
| Production | `true` | `true` |

Le frontend ne nécessite **que** deux valeurs publiques : `supabaseUrl` et
`supabaseAnonKey`. **Aucune** service-role key n'est jamais requise ni référencée
côté client.

### Injection pour hébergement statique (GitHub Pages / Cloudflare Pages)

Ces plateformes n'ont **pas de variables d'environnement runtime**. Mécanisme sûr et
documenté :

- `Config` lit un objet optionnel `window.__NULLSEC_SUPABASE__ = { url, anonKey }`
  posé **avant** `assets/js/config.js` par un bootstrap d'un step de build/déploiement
  (fichier non commité, généré à la volée).
- Le bootstrap ne contient que des **clés publiques** (URL + anon key) ; aucune
  service-role key.
- En l'absence de cet objet, `supabaseUrl`/`supabaseAnonKey` restent `null` et le site
  tourne en mode local à **0 requête réseau**.

> ⚠️ **Jamais** de workaround qui injecterait la service-role key en l'absence de
> variables d'environnement : ce serait une faille de sécurité.

## Statut du déploiement réel (M15) — transparence

**Aucun projet Supabase réel n'est disponible dans l'environnement de développement**
(pas d'accès, pas de CLI). Les migrations, RPC et RLS **n'ont pas été exécutées** sur
un vrai projet, et l'auth/sync **n'ont pas été validées en production**. Aucun résultat
de déploiement réel n'est prétendu.

La liste **exacte** des commandes/dashboard et la matrice de validation sont fournies
dans **`docs/supabase-runtime-validation.md`** (catégories A/B/C/D). En résumé :

1. Créer un projet Supabase (région UE recommandée).
2. Exécuter dans l'ordre : `0001_schema.sql`, `rpc_auth.sql`, `rpc_sync.sql`,
   `rpc_activity.sql`, `rpc_country_metrics.sql`, `rpc_tool_activity.sql`,
   `rpc_profile.sql`, puis `0002_rls.sql`, `0003_rls_functions.sql`,
   `0004_rls_privileges.sql`, `0005_country_metrics_privileges.sql`,
   `0006_challenge_semantics.sql`, `0007_country_metrics_data.sql`,
   `0008_country_metrics_privileges.sql`, `0009_community_intelligence_tables.sql`.
3. Vérifier tables/index/contraintes et chaque RPC ; confirmer `pg_proc.proacl` sur
   `ns_create_session` (aucun accès anon/authenticated).
4. Vérifier les politiques RLS réelles.
5. Test d'isolation inter-utilisateurs (2 utilisateurs).
6. Matrice d'authentification + sync + abuse testing de `ns_activity`.
7. Brancher le frontend (injection publique), activer les flags, re-tester l'offline.

Ces étapes restent **bloquées** tant qu'aucun projet réel n'est fourni.

---

## Statut de la préparation Europe (M17)

M17 a préparé l'architecture de la carte Europe (modules `country-metrics.js` /
`europe-map.js`, contrat de données, `docs/europe-activity.md`) **sans** implémenter le
RPC backend réel ni générer de fausses données. Le RPC `ns_country_metrics` et les
données de production relèvent d'un milestone backend dédié (M18), une fois qu'un
projet Supabase réel est disponible.

---

## Rate-limiting / protection contre l'abus (M19)

**État actuel : aucun rate-limiting applicatif n'est implémenté.** L'architecture
Supabase n'inclut pas de rate-limiter custom ; les mentions de rate-limit dans
`backend-architecture.md`/`backend-deployment.md`/`community-api.md` concernent
l'ancien backend Express (archivé) et ne s'appliquent **pas** à l'architecture
Supabase actuelle.

Protection disponible :

| Couche | Protection | Statut |
|--------|-----------|--------|
| PostgREST / RPC | Validation stricte des arguments (longueurs, formats, pays/missions connus) | ✅ (SQL) |
| RLS | anon sans accès aux tables privées ; écritures via RPC `SECURITY DEFINER` uniquement | ✅ (migration) |
| Rate-limiting applicatif | **Non implémenté** | ❌ |

Recommandation production (à configurer dans le projet Supabase, **non configurée ici**,
et non prétendue) :

- Activer le **rate limiting** au niveau du **API Gateway / WAF** (ex. Cloudflare)
  sur les endpoints publics `ns_activity` et `ns_country_metrics`.
- Ou, à défaut, ajouter un RPC `SECURITY DEFINER` avec un compteur de fenêtre
  temporelle anonyme (sans IP, sans fingerprint — uniquement une clé de hachage
  éphémère du client). Ceci relève d'un milestone futur et n'est **pas** mis en place
  ici car il exigerait de l'inventer sans validation réelle.
- Ne pas introduire d'IP tracking, de fingerprinting ni d'analytics.

---

## Production readiness status (M20)

### READY (architecturalement prêt — vérifié LOCAL/MOCKED/STATIC)

- **Frontend architecture** : vanill JS, IIFE, `UI → repositories → ApiClient → Supabase RPC/RLS`.
- **Privacy model** : agrégats par pays uniquement ; aucun `user_id`/`username`/IP/GPS/timestamps individuels exposé.
- **Aggregation model** : `ns_country_metrics()` (participants/mission/tool/total, `propagation`=null) ; `country_membership` + `community_propagation` préparées.
- **Offline behavior** : Supabase désactivé → 0 requête, état « Activity data unavailable », aucun compte local fabriqué.
- **Storage policy** : localStorage = `ns:theme` + migration uniquement ; sessionStorage = session courte + clé ; aucun secret/donnée de compte en localStorage.

### BLOCKED (nécessite un projet/browser réel)

- **Real Supabase deployment** : migrations 0001→0009 + RPC non exécutés sur un vrai projet.
- **Runtime RLS validation** : comportement RLS réel (anon/authenticated/RPC) non vérifié.
- **Real browser validation** : rendu de la carte Europe, hover/sélection, responsive, accessibilité non validés.
- **Production metrics collection** : les compteurs (participants, tools, propagation) ne sont pas peuplés en production.

---

## Community Intelligence Data Model (M21)

Le modèle final de données communautaires est préparé dans
`backend/supabase/migrations/0010_community_data_model_final.sql` (non déployé) :
- `country_membership` — pays explicite par utilisateur (un actif, ISO-3166 alpha-2, privé).
- `tool_activity` — usage d'outils agrégé par pays (SELECT anon uniquement).
- `community_propagation` — propagation agrégée par (pays, type).

**Ce qui est collecté** : choix de pays, activité de missions/outils et propagation
(agrégats). **Ce qui n'est jamais collecté** : identifiants individuels, IP, GPS, device,
timestamps individuels, graphe social. `0` = mesuré vide ; `null` = non disponible.

Voir `docs/privacy-model.md` et `docs/community-api.md` pour la confidentialité et les
contrats RPC futurs (`ns_country_metrics`, `ns_tool_metrics`, `ns_propagation_metrics`,
`ns_set_country`).

---

## First Community Member Experience (M22)

Parcours du premier membre communautaire (préparé, non déployé) :

1. **Création de compte** : `ns_register` (SHA-256 transport hash → bcrypt salé).
2. **Sélection de pays (optionnelle)** : après authentification, l'utilisateur choisit
   manuellement son pays (ISO-3166 alpha-2, nom lisible) via `CountryService` →
   `CountryRepository` → `ApiClient.updateProfile` / futur `ns_set_country`.
   - Le pays est un **choix explicite** ; jamais inféré depuis IP/GPS/locale/appareil.
   - Un pays actif par utilisateur (`UNIQUE(user_id)`).
3. **Aggrégation** : le pays alimente `participants` (membres distincts) par pays.
4. **Garanties de confidentialité** : aucune association user→pays publique ; aucune
   liste d'utilisateurs ; agrégats uniquement.

États de flux pays : `NO_COUNTRY` → `SELECTING_COUNTRY` → `SAVING_COUNTRY` →
`COUNTRY_SET` (ou `ERROR`). Aucun appel backend si Supabase est désactivé.

---

## Pipeline d'activité communautaire (M24)

Nouvelles migrations (non déployées) : `0011_community_activity_events.sql` (table
privée d'événements), `0012_activity_event_privileges.sql` (EXECUTE de
`ns_record_activity`), `0013_country_metrics_view.sql` (vue d'agrégation).
Nouveau RPC (non déployé) : `ns_record_activity()`.

À déployer dans l'ordre : `0001`…`0013` + `rpc_activity_event.sql`, puis `0005`/`0008`/
`0012` (grants). Voir `docs/supabase-runtime-validation.md` pour les commandes.

---

## Déclencheurs d'activité UI (M25)

Les actions utilisateur (mission complétée, outil ouvert) sont connectées au pipeline
via `ActivityService` → `ApiClient.recordActivity()` → `ns_record_activity()`. Le
payload ne contient que `p_token` + `p_activity_type` + `p_amount` (aucune identité,
aucun pays client, aucun IP/device). Le pays est résolu **serveur** depuis
`country_membership`.

Nouvelle migration (non déployée) : `0014_activity_trigger_support.sql` (index
d'agrégation + re-affirmation RLS). Déploiement : `0001`…`0014` + RPC
(`rpc_activity_event.sql`), puis grants (`0005`/`0008`/`0012`).

Offline / backend indisponible → l'activité échoue honnêtement (aucun succès fabriqué,
aucune corruption locale).

---

## Community actions UI (M26)

Nouvelle migration (non déployée) : `0015_community_action_support.sql` (index
(activity_type, created_at) + re-affirmation RLS). Action communautaire explicite
intégrée dans `community.html` via `CommunityActionService` → `ActivityService` →
`ApiClient.recordActivity()` → `ns_record_activity('community_action')`.

L'action exige l'intention utilisateur, n'est jamais automatique, et n'affiche
« Activity recorded » que si le backend confirme. Payload anonyme (type + amount
uniquement).

---

## Refinement des métriques communautaires (M27)

Nouvelle migration (non déployée) : `0016_activity_metrics_refinement.sql` (ajoute
`community_activity` à `v_country_metrics`). `ns_country_metrics()` expose
`communityActivity` en plus des métriques existantes.
`totalActivity = mission + tool + community`. Sémantique `0` vs `null` conservée.

---

## Production deployment preparation (M28)

### Configuration runtime

Le frontend expose `Config.getConfigStatus()` :
- `CONFIGURED` — Supabase activé + URL publique + clé anon valides.
- `NOT_CONFIGURED` — volontairement hors-ligne (`supabaseEnabled=false`).
- `INVALID_CONFIGURATION` — activé mais URL/clé manquantes ou malformées.

Aucune URL fallback, aucun secret, aucune clé service en frontend. Variables
d'environnement requises (production, non commitées) :
`SUPABASE_URL` (public), `SUPABASE_ANON_KEY` (public), `SUPABASE_SERVICE_KEY`
(serveur uniquement).

### Checklist de production (premier déploiement)

1. Créer le projet Supabase (région UE).
2. Déployer les migrations `0001`…`0016` dans l'ordre (SQL Editor / CLI).
3. Déployer les RPC (`rpc_auth`, `rpc_sync`, `rpc_activity`, `rpc_country_metrics`,
   `rpc_tool_activity`, `rpc_profile`, `rpc_activity_event`) puis grants
   (`0005`/`0008`/`0012`).
4. Vérifier `pg_proc.proacl` (ns_create_session inaccessible ; RPC publics grantés).
5. Vérifier RLS (tables privées sans accès anon ; agrégats SELECT anon ; vue non
   publique).
6. Injecter `__NULLSEC_SUPABASE__` (URL + anon key publiques) au build.
7. Activer `supabaseEnabled`/`authEnabled`/`backendEnabled`/`syncEnabled` = true.
8. Re-tester offline (0 requête) et `Config.getConfigStatus()`.

**Blocages sans projet réel** : déploiement, exécution RPC, RLS runtime, navigateur,
métriques de production. Voir `supabase-runtime-validation.md`.
