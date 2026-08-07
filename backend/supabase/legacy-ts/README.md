# legacy-ts/ — ARCHIVED reference scaffold (not part of the production backend)

> **STATUT : ARCHIVÉ / DÉPRÉCIÉ.** Ce dossier est un ancien wrapper TypeScript
> de référence, **incohérent** avec le schéma Supabase actuel. Il n'est ni
> compilé (pas de `package.json`/`tsconfig.json`), ni utilisé par le frontend
> (vanilla JS) ni par le déploiement.

Le **backend de production est la couche SQL/RPC** (`backend/supabase/migrations/`
+ `backend/supabase/functions/`), exécutée directement par Supabase/PostgREST.
Le frontend parle à ces RPC via `assets/js/api-client.js` (clé anon).

## Pourquoi archivé

Le wrapper `database.ts` de ce dossier était **incohérent et potentiellement
dangereux** :

- `login(identity_id)` appelait `ns_login` **sans** `p_recovery_hash` — la vraie
  signature exige le hash → l'appel échouait.
- `logout` / `validateSession` envoyaient `p_token_hash` alors que les RPC
  réelles attendent `p_token`.
- **Critique** : `syncPull(userId)` / `syncPush(userId, …)` passaient un
  `p_user_id` **choisi par le client** — exactement le modèle d'isolation
  cross-user que M13.1 a supprimé côté SQL. Utiliser ce wrapper aurait permis à
  un client de choisir l'identité cible.

Les RPC réelles sont **token-authentifiées** (`p_token`) et dérivent le
`user_id` côté serveur via `ns_validate_session`. Ce dossier est conservé à des
fins de référence uniquement et **ne doit pas être remis en service** sans être
aligné sur `backend/supabase/functions/rpc_*.sql`.
