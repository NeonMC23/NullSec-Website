/**
 * NullSec — Profile Repository
 * ------------------------------------------------------------------
 * Data-access layer for the user profile.
 *
 * Source of truth: Supabase (via ApiClient once the backend is live).
 * For now the profile is held in the non-persistent session-memory cache
 * (Store) — it is NOT written to localStorage and does NOT represent a local
 * account. If Supabase is unavailable, get() returns null (no fabricated
 * account).
 *
 * API:
 *   ProfileRepository.get()       → profile object | null
 *   ProfileRepository.save(profile)
 *   ProfileRepository.clear()
 */
(function () {
  'use strict';

  /** Return the current-session profile, or null. */
  function get() {
    // When Supabase is live this will delegate to ApiClient.pull(session).
    return Store.getProfile();
  }

  /** Persist the profile in the session-memory cache (non-persistent). */
  function save(profile) {
    Store.saveProfile(profile);
  }

  /** Clear the in-memory profile. */
  function clear() {
    Store.deleteProfile();
  }

  window.ProfileRepository = {
    get: get,
    save: save,
    clear: clear
  };
})();
