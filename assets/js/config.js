/**
 * NullSec — Config module
 * ------------------------------------------------------------------
 * Centralized frontend configuration. Prevents hardcoding backend /
 * feature-flags values inside feature modules.
 *
 * Current state: fully offline, no backend enabled. When a backend is
 * introduced, only this file (and the docs) need to change — no feature
 * module should reference hardcoded URLs or flags directly.
 *
 * API:
 *   window.Config  — frozen config object
 *   Config.get()   — return the config object
 */
(function () {
  'use strict';

  const CONFIG = {
    // Platform version this config targets.
    version: '2.2',

    // True while the app runs without a backend (all state is local).
    offlineMode: true,

    // Whether the account/auth UI is active. Gated by Supabase being ready.
    authEnabled: false,

    // Whether any backend functionality is enabled (false offline).
    backendEnabled: false,

    // Whether synchronization is enabled (false offline; requires backend).
    syncEnabled: false,

    // --- Supabase (M13/M13.1/M14) --------------------------------------
    // FINAL backend provider is Supabase. By default the site is offline
    // (supabaseEnabled=false, empty URL/key) and makes ZERO network requests.
    // To activate production, provide SUPABASE_URL + SUPABASE_ANON_KEY
    // (public keys only — never the service-role key in the frontend) and
    // set supabaseEnabled / authEnabled / backendEnabled / syncEnabled true.
    //
    // Injection for static hosting (GitHub Pages has no runtime env vars):
    //   a deploy step may write a tiny inline bootstrap that sets
    //   `window.__NULLSEC_SUPABASE__ = { url, anonKey }` BEFORE config.js
    //   loads. Config.js only consumes PUBLIC credentials from it. Nothing is
    //   hardcoded and the service-role key is never referenced in the repo.
    provider: 'supabase',
    supabaseEnabled: false,
    supabaseUrl: null,
    supabaseAnonKey: null
  };

  // Optional, documented, PUBLIC-only injection point for static hosting.
  // Reads `window.__NULLSEC_SUPABASE__` (set by a deploy-time bootstrap that
  // is NOT committed). Only url + anonKey are consumed.
  function inject() {
    const boot = window.__NULLSEC_SUPABASE__;
    if (boot && typeof boot === 'object') {
      if (typeof boot.url === 'string' && boot.url.length > 0) CONFIG.supabaseUrl = boot.url;
      if (typeof boot.anonKey === 'string' && boot.anonKey.length > 0) CONFIG.supabaseAnonKey = boot.anonKey;
    }
  }

  inject();

  /**
   * Validate the current Supabase configuration. Returns one of:
   *   CONFIGURED            — supabaseEnabled + valid public URL + anon key.
   *   NOT_CONFIGURED        — supabaseEnabled false (intentional offline).
   *   INVALID_CONFIGURATION — enabled but URL/anon key missing or malformed.
   * Never fabricates a usable backend state.
   * @returns {'CONFIGURED'|'NOT_CONFIGURED'|'INVALID_CONFIGURATION'}
   */
  function getConfigStatus() {
    if (CONFIG.supabaseEnabled !== true) return 'NOT_CONFIGURED';
    if (!CONFIG.supabaseUrl || typeof CONFIG.supabaseUrl !== 'string') return 'INVALID_CONFIGURATION';
    if (!/^https?:\/\//.test(CONFIG.supabaseUrl)) return 'INVALID_CONFIGURATION';
    if (!CONFIG.supabaseAnonKey || typeof CONFIG.supabaseAnonKey !== 'string' || CONFIG.supabaseAnonKey.length === 0) {
      return 'INVALID_CONFIGURATION';
    }
    return 'CONFIGURED';
  }

  window.Config = {
    get: function () {
      return CONFIG;
    },
    getConfigStatus: getConfigStatus
  };
})();
