/**
 * NullSec — Supabase environment loader.
 * Never commit secrets. Supabase project URL + keys come from environment.
 */
export interface SupabaseEnv {
  url: string;
  anonKey: string;
  serviceKey: string;
  nodeEnv: string;
}

export function loadEnv(): SupabaseEnv {
  return {
    url: process.env.SUPABASE_URL ?? '',
    anonKey: process.env.SUPABASE_ANON_KEY ?? '',
    serviceKey: process.env.SUPABASE_SERVICE_KEY ?? '',
    nodeEnv: process.env.NODE_ENV ?? 'development'
  };
}

export function isConfigured(env: SupabaseEnv): boolean {
  return !!(env.url && env.anonKey && env.serviceKey);
}
