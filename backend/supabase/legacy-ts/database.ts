/**
 * NullSec — Supabase database layer.
 * Wraps auth (recovery-key) + sync + community RPCs for the backend services.
 */
import { supabase } from './client.js';

export const db = {
  /** Register a new account from a recovery-key hash. */
  register: (args: {
    identity_id: string; recovery_hash: string; username?: string; avatar_seed?: string;
  }) => supabase.rpc<{ token: string; user_id: number }>('ns_register', {
    p_identity_id: args.identity_id,
    p_recovery_hash: args.recovery_hash,
    p_username: args.username ?? 'Anonymous',
    p_avatar_seed: args.avatar_seed ?? ''
  }, true),

  /** Login by identity (server hashes key separately, RPC creates session). */
  login: (identity_id: string) =>
    supabase.rpc<{ token: string; user_id: number }>('ns_login', { p_identity_id: identity_id }, true),

  /** Revoke a session by token hash. */
  logout: (tokenHash: string) =>
    supabase.rpc<void>('ns_logout', { p_token_hash: tokenHash }, true),

  /** Validate a session token; returns user_id or null. */
  validateSession: (tokenHash: string) =>
    supabase.rpc<number | null>('ns_validate_session', { p_token_hash: tokenHash }, true),

  /** Pull user data. */
  syncPull: (userId: number) =>
    supabase.rpc('ns_sync_pull', { p_user_id: userId }, true),

  /** Push user data. */
  syncPush: (userId: number, payload: { profile?: unknown; settings?: unknown; progress?: unknown }) =>
    supabase.rpc<void>('ns_sync_push', {
      p_user_id: userId,
      p_profile: payload.profile ?? null,
      p_settings: payload.settings ?? null,
      p_progress: payload.progress ?? null
    }, true),

  /** Anonymous activity increment. */
  activity: (args: { mission_id: string; country_code?: string | null; region?: string }) =>
    supabase.rpc<void>('ns_activity', {
      p_mission_id: args.mission_id,
      p_country_code: args.country_code ?? null,
      p_region: args.region ?? 'Europe'
    }, true)
};
