/**
 * NullSec — Country Repository
 * ------------------------------------------------------------------
 * Data-access layer for the authenticated user's selected country.
 *
 * Architecture:  UI → country-service → country-repository → ApiClient → Supabase RPC
 *
 * Source of truth: Supabase (user_profiles.country_code via ns_update_profile /
 * ns_sync_pull). The selected country is an EXPLICIT user choice. It is held in
 * an in-memory cache for the session and rehydrated from the server on pull
 * (sync) and session restore, so it survives reload and logout/login.
 *
 * Privacy: the country is the user's EXPLICIT choice (ISO-3166 alpha-2), never
 * inferred from IP/GPS/locale/device. It is never exposed publicly per-user —
 * only aggregated participant counts downstream. Offline, the country is NOT
 * fabricated (no local persistence) — see the M22 privacy invariant.
 *
 * M49: fixed persistence — the previous implementation never rehydrated the
 * value after reload and could not clear the country server-side. Now:
 *   - setCountry() writes through to Supabase (ns_update_profile).
 *   - rehydrate(code) sets the in-memory value from a sync pull / session restore.
 *   - removeCountry() clears server-side via empty-string sentinel + local cache.
 *   - getCountry() returns the in-memory value (restored from server).
 *
 * API:
 *   CountryRepository.getCountry()          → countryCode string | null
 *   CountryRepository.setCountry(code)      → Promise (via ApiClient when online)
 *   CountryRepository.removeCountry()       → Promise (clear server + memory)
 *   CountryRepository.rehydrate(code|null)  → set in-memory value (no network)
 *   CountryRepository._clearMemory()        → clear in-memory cache only
 */
(function () {
  'use strict';

  // Session-scoped in-memory cache, rehydrated from the server on pull/restore.
  let memoryCountry = null;

  /** Return the in-memory selected country code (or null). */
  function getCountry() {
    return memoryCountry;
  }

  /**
   * Persist the selected country. Online: calls ApiClient.updateProfile and,
   * on success, updates the in-memory cache. Offline / not authenticated:
   * rejects (no fabricated success) per the M22 privacy invariant — the UI
   * surfaces the error and the user can retry once online.
   * @param {string} code ISO-3166 alpha-2
   * @returns {Promise<void>}
   */
  function setCountry(code) {
    if (typeof code !== 'string' || !/^[A-Z]{2}$/.test(code)) {
      return Promise.reject(new Error('invalid_country_code'));
    }
    if (!ApiClient.isBackendAvailable()) {
      return Promise.reject(new Error('offline'));
    }
    const token = (window.Sync && Sync.getToken) ? Sync.getToken() : null;
    if (!token || typeof ApiClient.updateProfile !== 'function') {
      return Promise.reject(new Error('no_session'));
    }
    return ApiClient.updateProfile(token, { country_code: code }).then(function () {
      memoryCountry = code;
      if (window.Sync && Sync.scheduleSync) Sync.scheduleSync();
    });
  }

  /**
   * Remove the selected country ("Prefer not to say"). Clears local cache and,
   * when online, clears server-side via ns_update_profile (empty-string sentinel).
   * @returns {Promise<void>}
   */
  function removeCountry() {
    memoryCountry = null;
    const token = (window.Sync && Sync.getToken) ? Sync.getToken() : null;
    if (token && typeof ApiClient.updateProfile === 'function' && ApiClient.isBackendAvailable()) {
      return ApiClient.updateProfile(token, { country_code: '' }).then(function () {
        if (window.Sync && Sync.scheduleSync) Sync.scheduleSync();
      }).catch(function () { /* best-effort */ });
    }
    return Promise.resolve();
  }

  /** Rehydrate the in-memory value from a server pull / session restore. */
  function rehydrate(code) {
    memoryCountry = (code && /^[A-Z]{2}$/.test(code)) ? code : null;
    return memoryCountry;
  }

  /** Clear the in-memory cache only (logout/reset). */
  function clearMemory() {
    memoryCountry = null;
  }

  window.CountryRepository = {
    getCountry: getCountry,
    setCountry: setCountry,
    removeCountry: removeCountry,
    rehydrate: rehydrate,
    clearMemory: clearMemory
  };
})();
