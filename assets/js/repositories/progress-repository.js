/**
 * NullSec — Progress Repository
 * ------------------------------------------------------------------
 * Data-access layer for the user progression (missions, weekly, articles).
 *
 * Source of truth: Supabase (via ApiClient once the backend is live).
 * For now progression lives in the non-persistent session-memory cache
 * (Store) — it is NOT written to localStorage and does NOT represent a local
 * account. Offline UI keeps working but progression is not an account store.
 *
 * API:
 *   ProgressRepository.get()       → progress object | null
 *   ProgressRepository.save(progress)
 *   ProgressRepository.clear()
 */
(function () {
  'use strict';

  /** Return the current-session progress, or null. */
  function get() {
    return Store.getProgress();
  }

  /** Persist progress in the session-memory cache (non-persistent). */
  function save(progress) {
    Store.saveProgress(progress);
  }

  /** Clear the in-memory progress. */
  function clear() {
    Store.deleteProgress();
  }

  window.ProgressRepository = {
    get: get,
    save: save,
    clear: clear
  };
})();
