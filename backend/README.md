# NullSec Backend

> **Production backend = Supabase.** PostgreSQL est fourni par Supabase.
> Le scaffold Express d'origine est **archivé** dans `legacy-express/` (supersédé,
> non utilisé en production).

---

## Architecture de production

```
Frontend (vanilla JS)
   │
   ▼
ApiClient (assets/js/api-client.js) — seul module de fetch backend
   │  (SUPABASE_URL + SUPABASE_ANON_KEY, clés publiques uniquement)
   ▼
Supabase (PostgREST + RPC)
   │  (ns_register / ns_login / ns_logout / ns_validate_session /
   │   ns_sync_pull / ns_sync_push / ns_activity / ns_metrics)
   ▼
Supabase PostgreSQL (migrations + RLS)
```

## Dossiers

- `supabase/` — architecture de production (migrations, RPC, client, config).
- `legacy-express/` — **archivé** : scaffold Express/PostgreSQL d'origine, non
  référencé par le frontend, conservé pour référence historique.

## Sécurité

- **Service-role key** : jamais dans le frontend ; uniquement côté serveur si besoin.
- **Clé de récupération** : la clé brute ne quitte jamais le navigateur (SHA-256 de
  transport ; le serveur stocke un hash bcrypt via pgcrypto).
- **RLS** activée : tables privées non accessibles par anon ; tables agrégées en lecture
  publique seule ; écritures sensibles via RPC `SECURITY DEFINER`.
- **Sessions** : tokens aléatoires, stockés hachés (SHA-256), expiration + révocation.
