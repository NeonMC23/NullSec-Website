/**
 * NullSec — Store (persistence abstraction)
 * ------------------------------------------------------------------
 * Single access point for ALL browser persistence on the site.
 *
 * No other module or page should call localStorage.getItem / setItem /
 * removeItem directly. Everything goes through the Store API below.
 *
 * Keys are namespaced under the `ns:` prefix for clean grouping and
 * one-time migration of the legacy flat keys (see Store.migrate()).
 *
 * Store values are JSON-encoded on write and auto-parsed on read.
 * Legacy (non-JSON) values written before migration are still readable.
 */
(function () {
  'use strict';

  let PREFIX = 'ns:';

  /**
   * Centralized storage key definitions.
   *
   * LOCAL STORAGE POLICY (Milestone 16): localStorage is reserved for OFFLINE
   * CLIENT STATE (device-level UI cache) only. It must NEVER contain:
   *   - recovery keys / recovery hash   (→ sessionStorage via SessionStore)
   *   - authentication state / flags   (→ memory only)
   *   - session tokens                 (→ memory + sessionStorage via SessionStore)
   *   - "local account" / identity-as-account markers
   * The authoritative source of truth for account data (identity/profile/
   * settings/progress) is Supabase. The values below are offline caches, never
   * authoritative.
   */
  let KEYS = {
    THEME: PREFIX + 'theme',
    JOURNEY_PROGRESS: PREFIX + 'journey:progress',
    WEEKLY: PREFIX + 'weekly:progress',
    ARTICLE_READ: function (slug) { return PREFIX + 'article:read:' + slug; },
    MIGRATION: PREFIX + 'migrated:v1'
  };

  function storage() {
    return window.localStorage;
  }

  /**
   * In-memory session cache for account data (identity / profile / progress /
   * settings). Milestone 17: account data is NOT persisted to localStorage.
   * Supabase is the source of truth; this memory cache only carries the
   * temporary state for the current page session (offline-capable UI).
   * It is cleared on every page load — it can never resurrect an account.
   */
  let memoryCache = {};

  let Store = {
    keys: KEYS,

    /** Read a value from localStorage (device/UI preferences + migration). */
    get: function (key) {
      try {
        let raw = storage().getItem(key);
        if (raw === null) return null;
        try { return JSON.parse(raw); } catch (e) { return raw; }
      } catch (e) { return null; }
    },

    /** Write a value to localStorage. */
    set: function (key, value) {
      try { storage().setItem(key, JSON.stringify(value)); } catch (e) { /* quota/private mode */ }
    },

    /** Remove a key from localStorage. */
    remove: function (key) {
      try { storage().removeItem(key); } catch (e) {}
    },

    /** True if the key exists (even if its value is falsy). */
    has: function (key) {
      return this.get(key) !== null;
    },

    /** Remove every key whose name starts with `ns:<namespace>`. */
    clearNamespace: function (namespace) {
      try {
        let prefix = PREFIX + namespace;
        let ls = storage();
        let toRemove = [];
        for (let i = 0; i < ls.length; i++) {
          let k = ls.key(i);
          if (k && k.indexOf(prefix) === 0) toRemove.push(k);
        }
        toRemove.forEach(function (k) { ls.removeItem(k); });
      } catch (e) {}
    },

    /* --- Account data (MEMORY ONLY — not persisted to localStorage) --- */

    /** Read the current-session identity object, or null if none. */
    getIdentity: function () {
      let v = memoryCache.identity;
      return (v && typeof v === 'object' && v.id) ? v : null;
    },

    /** Store the identity object in memory for this page session. */
    saveIdentity: function (identity) {
      memoryCache.identity = identity;
    },

    /** Clear the in-memory identity. */
    deleteIdentity: function () {
      memoryCache.identity = undefined;
    },

    /** Read the current-session unified progression, or null if none. */
    getProgress: function () {
      let v = memoryCache.progress;
      return (v && typeof v === 'object') ? v : null;
    },

    /** Store the progression object in memory for this page session. */
    saveProgress: function (progress) {
      memoryCache.progress = progress;
    },

    /** Clear the in-memory progression. */
    deleteProgress: function () {
      memoryCache.progress = undefined;
    },

    /**
     * List keys in localStorage, optionally filtered by a prefix.
     * Used by Progress migration to discover legacy dynamic keys.
     * @param {string} [prefix]
     * @returns {string[]}
     */
    listKeys: function (prefix) {
      let out = [];
      try {
        let ls = storage();
        for (let i = 0; i < ls.length; i++) {
          let k = ls.key(i);
          if (k && (!prefix || k.indexOf(prefix) === 0)) out.push(k);
        }
      } catch (e) {}
      return out;
    },

    /* --- User profile (MEMORY ONLY) ----------------------------------- */

    /** Read the current-session profile object, or null if none. */
    getProfile: function () {
      let v = memoryCache.profile;
      return (v && typeof v === 'object' && v.identity_id) ? v : null;
    },

    /** Store the profile object in memory for this page session. */
    saveProfile: function (profile) {
      memoryCache.profile = profile;
    },

    /** Clear the in-memory profile. */
    deleteProfile: function () {
      memoryCache.profile = undefined;
    },

    /* --- Settings (MEMORY ONLY) --------------------------------------- */

    /** Read the current-session settings object, or null if none. */
    getSettings: function () {
      let v = memoryCache.settings;
      return (v && typeof v === 'object') ? v : null;
    },

    /** Store the settings object in memory for this page session. */
    saveSettings: function (settings) {
      memoryCache.settings = settings;
    },

    /** Clear the in-memory settings. */
    deleteSettings: function () {
      memoryCache.settings = undefined;
    },

    /**
     * One-time migration from legacy flat keys to namespaced keys.
     * Idempotent: each step only acts while a legacy key still exists,
     * so running it repeatedly is harmless and existing users lose nothing.
     */
    migrate: function () {
      try {
        let ls = storage();

        // --- Legacy device preference: nullsec-theme -> ns:theme ---------
        // The theme is a legitimate device preference (the only data allowed
        // in localStorage). Other legacy keys are account data (journey/
        // weekly/article progress) which is now memory-only, so they are not
        // migrated into localStorage — they are simply purged below.
        if (ls.getItem('nullsec-theme') !== null && ls.getItem(KEYS.THEME) === null) {
          ls.setItem(KEYS.THEME, ls.getItem('nullsec-theme'));
        }
        ls.removeItem('nullsec-theme');

        // --- Purge any leftover legacy + account data from old versions (M17) ---
        // Account data (identity/profile/progress/settings/auth/user-state/
        // recovery) and legacy progress keys are memory-only now. Remove any
        // stale localStorage copies so no account state can survive a reload
        // or resurrect an authenticated user.
        [
          PREFIX + 'journey:progress',
          PREFIX + 'weekly:progress',
          PREFIX + 'identity',
          PREFIX + 'user:profile',
          PREFIX + 'progress',
          PREFIX + 'settings',
          PREFIX + 'auth',
          PREFIX + 'user:state',
          PREFIX + 'recovery'
        ].forEach(function (k) {
          if (ls.getItem(k) !== null) ls.removeItem(k);
        });
        // Legacy dynamic article keys (ns-article-{slug}) are account progress
        // and are now memory-only; remove any leftovers.
        {
          let i = 0;
          while (i < ls.length) {
            let k = ls.key(i);
            if (k && /^ns-article-/.test(k)) { ls.removeItem(k); }
            else { i++; }
          }
        }

        ls.setItem(KEYS.MIGRATION, JSON.stringify('done'));
      } catch (e) { /* non-fatal — the app still works with raw access */ }
    }
  };

  // store.js is loaded first on every page, so run migration synchronously
  // before any other module reads its keys.
  Store.migrate();

  window.Store = Store;
})();
