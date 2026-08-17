/**
 * NullSec — Store (persistence abstraction)
 * ------------------------------------------------------------------
 * Single access point for ALL browser persistence on the site.
 *
 * No other module or page should call localStorage.getItem / setItem /
 * removeItem directly. Everything goes through the Store API below.
 *
 * M31: localStorage is used ONLY for the device theme preference (ns:theme).
 * All account data (identity, profile, progress, settings, recovery, auth)
 * lives in the memory session cache below and in Supabase — it is never
 * written to localStorage. sessionStorage is used only for the short-lived
 * recovery key and session token (see SessionStore).
 *
 * Store values are JSON-encoded on write and auto-parsed on read.
 */
(function () {
  'use strict';

  let PREFIX = 'ns:';

  /**
   * Centralized storage key definitions.
   *
   * LOCAL STORAGE POLICY (M16→M31): localStorage holds ONLY the theme
   * (device/UI preference). It must NEVER contain account/progression data:
   *   - recovery keys / recovery hash   (→ sessionStorage via SessionStore)
   *   - authentication state / flags   (→ memory only)
   *   - session tokens                 (→ memory + sessionStorage via SessionStore)
   *   - identity / profile / progress / settings / account markers
   * The source of truth for all account data is Supabase.
   */
  let KEYS = {
    // M31: the ONLY intentional persistent localStorage key is the theme
    // (a device/UI preference, not user data). All account/progression keys
    // were removed — account data lives in memory (session) and Supabase.
    THEME: PREFIX + 'theme',
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

    /* --- Account profile (MEMORY ONLY) -------------------------------- */

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
     * One-time migration from the legacy flat theme key to the namespaced key.
     * M31: the obsolete account-data purge was removed. The current app NEVER
     * writes account/progression data to localStorage (it lives in memory +
     * Supabase), so there is no permanent compatibility layer for the old
     * local-profile architecture. The only persistent value is the theme
     * (device/UI preference).
     * Idempotent: each step only acts while a legacy key still exists.
     */
    migrate: function () {
      try {
        let ls = storage();

        // --- Legacy device preference: nullsec-theme -> ns:theme ---------
        // The theme is a legitimate device preference (the only data allowed
        // in localStorage). No account data is migrated.
        if (ls.getItem('nullsec-theme') !== null && ls.getItem(KEYS.THEME) === null) {
          ls.setItem(KEYS.THEME, ls.getItem('nullsec-theme'));
        }
        ls.removeItem('nullsec-theme');

        ls.setItem(KEYS.MIGRATION, JSON.stringify('done'));
      } catch (e) { /* non-fatal — the app still works with raw access */ }
    }
  };

  // store.js is loaded first on every page, so run migration synchronously
  // before any other module reads its keys.
  Store.migrate();

  window.Store = Store;
})();
