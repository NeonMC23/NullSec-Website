/**
 * NullSec — Country Repository
 * ------------------------------------------------------------------
 * Data-access layer for the authenticated user's selected country.
 *
 * Architecture:  UI → country-service → country-repository → ApiClient → Supabase RPC
 *
 * Source of truth: Supabase (future ns_set_country / pull). The selected country
 * is held in a NON-PERSISTENT session-memory cache only — it is never written to
 * localStorage and never represents a local account. If Supabase is unavailable,
 * setCountry() rejects (no fabricated success) and getCountry() returns the
 * in-memory value (or null).
 *
 * Privacy: the country is the user's EXPLICIT choice (ISO-3166 alpha-2), never
 * inferred from IP/GPS/locale/device. It is never exposed publicly per-user —
 * only aggregated participant counts downstream.
 *
 * API:
 *   CountryRepository.getCountry()          → countryCode string | null (in-memory)
 *   CountryRepository.setCountry(code)      → Promise (via ApiClient when online)
 *   CountryRepository.removeCountry()       → Promise (clear memory + backend)
 *   CountryRepository._clearMemory()        → clear in-memory cache only
 */
(function () {
  'use strict';

  // Non-persistent session-memory cache (NOT account persistence).
  let memoryCountry = null;

  /** Return the in-memory selected country code (or null). */
  function getCountry() {
    return memoryCountry;
  }

  /**
   * Persist the selected country. Online: calls ApiClient.updateProfile / future
   * ns_set_country. Offline: rejects (no fabricated success) but keeps the
   * in-memory value as a temporary hint? No — keep it honest: only set memory
   * on success.
   * @param {string} code ISO-3166 alpha-2
   * @returns {Promise<void>}
   */
  function setCountry(code) {
    if (typeof code !== 'string' || !/^[A-Z]{2}$/.test(code)) {
      return Promise.reject(new Error('invalid_country_code'));
    }
    const online = ApiClient.isBackendAvailable();
    if (!online) {
      // Do NOT fabricate success; no backend → cannot persist the choice.
      return Promise.reject(new Error('offline'));
    }
    // Prefer the authenticated profile-update RPC (token), which derives the
    // user server-side. Fall back to updateProfile if present.
    const token = (window.Sync && Sync.getToken) ? Sync.getToken() : null;
    const call = (token && typeof ApiClient.updateProfile === 'function')
      ? ApiClient.updateProfile(token, { country_code: code })
      : Promise.reject(new Error('no_session'));
    return call.then(function () {
      memoryCountry = code;
    });
  }

  /**
   * Remove the selected country. Online: best-effort backend clear via profile
   * update (country_code null). Offline: clear memory only.
   * @returns {Promise<void>}
   */
  function removeCountry() {
    const online = ApiClient.isBackendAvailable();
    memoryCountry = null;
    if (!online) return Promise.resolve();
    const token = (window.Sync && Sync.getToken) ? Sync.getToken() : null;
    if (token && typeof ApiClient.updateProfile === 'function') {
      return ApiClient.updateProfile(token, { country_code: null }).catch(function () { /* best-effort */ });
    }
    return Promise.resolve();
  }

  /** Clear the in-memory cache only (logout/reset). */
  function clearMemory() {
    memoryCountry = null;
  }

  window.CountryRepository = {
    getCountry: getCountry,
    setCountry: setCountry,
    removeCountry: removeCountry,
    clearMemory: clearMemory
  };
})();
