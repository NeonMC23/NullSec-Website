/**
 * NullSec — Supabase client (thin).
 * A minimal typed wrapper around the Supabase REST API (PostgREST + RPC).
 * Uses the project URL and anon key. All requests go through `request`.
 */
import { loadEnv, type SupabaseEnv } from './config.js';

export type Json = Record<string, unknown>;

export class Supabase {
  readonly env: SupabaseEnv;

  constructor(env?: SupabaseEnv) {
    this.env = env ?? loadEnv();
  }

  private base(): string {
    return this.env.url.replace(/\/+$/, '');
  }

  private headers(service: boolean): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      apikey: service ? this.env.serviceKey : this.env.anonKey,
      Authorization: 'Bearer ' + (service ? this.env.serviceKey : this.env.anonKey)
    };
  }

  /** RPC call. */
  async rpc<T = unknown>(fn: string, args: Json = {}, service = false): Promise<T> {
    const res = await fetch(this.base() + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: this.headers(service),
      body: JSON.stringify(args)
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error('supabase_rpc_' + fn + '_' + res.status + ': ' + body.slice(0, 200));
    }
    return (await res.json()) as T;
  }

  /** PostgREST select. */
  async select<T = unknown>(table: string, query = '', service = false): Promise<T> {
    const res = await fetch(this.base() + '/rest/v1/' + table + (query ? '?' + query : ''), {
      method: 'GET',
      headers: this.headers(service)
    });
    if (!res.ok) throw new Error('supabase_select_' + table + '_' + res.status);
    return (await res.json()) as T;
  }
}

export const supabase = new Supabase();
