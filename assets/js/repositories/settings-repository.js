/**
 * NullSec — Settings Repository
 * ------------------------------------------------------------------
 * Data-access layer for the user settings.
 *
 * Source of truth: Supabase (via ApiClient once the backend is live).
 * For now settings live in the non-persistent session-memory cache (Store) —
 * NOT written to localStorage and NOT a local account. Theme preference stays
 * a device preference in localStorage (ns:theme); account settings do not.
 *
 * API:
 *   SettingsRepository.get()       → settings object | null
 *   SettingsRepository.save(settings)
 *   SettingsRepository.clear()
 */
(function () {
  'use strict';

  /** Return the current-session settings, or null. */
  function get() {
    return Store.getSettings();
  }

  /** Persist settings in the session-memory cache (non-persistent). */
  function save(settings) {
    Store.saveSettings(settings);
  }

  /** Clear the in-memory settings. */
  function clear() {
    Store.deleteSettings();
  }

  window.SettingsRepository = {
    get: get,
    save: save,
    clear: clear
  };
})();
