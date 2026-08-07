/**
 * NullSec — Settings Service
 * ------------------------------------------------------------------
 * Single source of truth for user preferences, plus local export/import
 * of all user data (identity, profile, progress, recovery, settings).
 *
 * Everything is 100% local. No backend, no network, no encryption, no cloud.
 * A future synchronization layer can replace the persistence underneath
 * without touching the UI.
 *
 * Settings schema: see docs/settings-schema.md
 *
 * API:
 *   Settings.init()        — ensure a settings object exists
 *   Settings.get()         — current settings object
 *   Settings.update(data)  — deep-merge partial updates, bump updated_at
 *   Settings.reset()       — reset to defaults
 *   Settings.exportData()  — return { type, version, exported_at, data }
 *   Settings.importData(obj) — validate + restore (returns {ok, error})
 *   Settings.validateUsername(name) — trim/length checks
 */
(function () {
  'use strict';

  const SCHEMA_VERSION = 1;
  const EXPORT_VERSION = 1;

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

  /**
   * Validate a username.
   * @param {string} name
   * @returns {string|null} error message, or null if valid
   */
  function validateUsername(name) {
    if (typeof name !== 'string') return 'Username must be a string.';
    const trimmed = name.trim();
    if (trimmed.length === 0) return 'Username cannot be empty.';
    if (trimmed.length < 2) return 'Username must be at least 2 characters.';
    if (trimmed.length > 32) return 'Username must be at most 32 characters.';
    return null;
  }

  /* --- Export / Import of all local data ------------------------------ */

  /**
   * Collect all local user data into a portable object.
   * Includes: identity, profile, progress, recovery, settings.
   * @returns {object} { type, version, exported_at, data }
   */
  function exportData() {
    const data = {
      identity: Identity.get(),
      profile: UserProfile.get(),
      progress: Progress.get(),
      recovery: RecoveryKey.get(),
      settings: get()
    };
    return {
      type: 'nullsec-export',
      version: EXPORT_VERSION,
      exported_at: now(),
      data: data
    };
  }

  /** Basic shape/version validation of an import payload. */
  function validateImport(obj) {
    if (!obj || typeof obj !== 'object') return 'Not a valid export object.';
    if (obj.type !== 'nullsec-export') return 'Not a NullSec export file.';
    if (obj.version !== EXPORT_VERSION) return 'Unsupported export version.';
    if (!obj.data || typeof obj.data !== 'object') return 'Missing data section.';
    return null;
  }

  /**
   * Import previously exported local data. Validates, then restores.
   * @param {object} obj
   * @returns {{ok: boolean, error?: string}}
   */
  function importData(obj) {
    const err = validateImport(obj);
    if (err) return { ok: false, error: err };
    const data = obj.data;

    // Identity
    if (data.identity && data.identity.id) {
      IdentityRepository.save(data.identity);
    }
    // Profile (ensure identity link)
    if (data.profile && data.profile.identity_id) {
      ProfileRepository.save(data.profile);
    }
    // Progress
    if (data.progress && data.progress.version && data.progress.identity_id) {
      ProgressRepository.save(data.progress);
    }
    // Recovery (only if present and valid format) — session-scoped storage,
    // never localStorage.
    if (typeof data.recovery === 'string') {
      RecoveryKey.importRaw(data.recovery);
    }
    // Settings
    if (data.settings && data.settings.version) {
      SettingsRepository.save(data.settings);
    }
    return { ok: true };
  }

  window.Settings = {
    init: init,
    get: get,
    update: update,
    reset: reset,
    exportData: exportData,
    importData: importData,
    validateUsername: validateUsername
  };
})();
