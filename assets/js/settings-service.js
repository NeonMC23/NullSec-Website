/**
 * NullSec — Settings Service
 * ------------------------------------------------------------------
 * Source of truth for user preferences. M31: no local export/import, no
 * local profile data — settings are account data (private, synced through the
 * Sync layer to Supabase; held in memory for the session).
 *
 * Settings schema: see docs/settings-schema.md
 *
 * API:
 *   Settings.init()        — ensure a settings object exists
 *   Settings.get()         — current settings object
 *   Settings.update(data)  — deep-merge partial updates, bump updated_at
 *   Settings.reset()       — reset to defaults
 */
(function () {
  'use strict';

  const SCHEMA_VERSION = 1;

  function now() {
    return new Date().toISOString();
  }

  /** Deep-merge plain objects (returns a new object). */
  function deepMerge(base, patch) {
    const out = Object.assign({}, base);
    if (patch && typeof patch === 'object') {
      Object.keys(patch).forEach(function (k) {
        const v = patch[k];
        if (v && typeof v === 'object' && !Array.isArray(v) &&
          base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
          out[k] = deepMerge(base[k], v);
        } else if (v !== undefined) {
          out[k] = v;
        }
      });
    }
    return out;
  }

  /** Default settings object. */
  function defaults() {
    return {
      version: SCHEMA_VERSION,
      theme: 'system',        // 'dark' | 'light' | 'system'
      language: 'en',
      privacy: {
        offline_only: true,
        telemetry: false
      },
      appearance: {
        animations: true,
        reduced_motion: false
      },
      updated_at: now()
    };
  }

  /** Ensure a settings object exists; return the current one. */
  function init() {
    let s = SettingsRepository.get();
    if (s && s.version === SCHEMA_VERSION) return s;
    if (s && typeof s === 'object') {
      // Migrate/merge legacy partial settings into defaults.
      s = deepMerge(defaults(), s);
      s.version = SCHEMA_VERSION;
      s.updated_at = now();
      SettingsRepository.save(s);
      return s;
    }
    s = defaults();
    SettingsRepository.save(s);
    return s;
  }

  /** Return current settings (init if needed). */
  function get() {
    const s = SettingsRepository.get();
    return s && s.version === SCHEMA_VERSION ? s : init();
  }

  /**
   * Update settings with a partial (possibly nested) patch.
   * @param {object} data
   * @returns {object} updated settings
   */
  function update(data) {
    const current = get();
    const next = deepMerge(current, data || {});
    next.version = SCHEMA_VERSION;
    next.updated_at = now();
    SettingsRepository.save(next);
    notifySync();
    return next;
  }

  /** Reset settings to defaults. */
  function reset() {
    const s = defaults();
    SettingsRepository.save(s);
    return s;
  }

  /* --- Username validation -------------------------------------------- */



  window.Settings = {
    init: init,
    get: get,
    update: update,
    reset: reset
  };
})();
