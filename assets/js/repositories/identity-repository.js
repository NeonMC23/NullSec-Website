/**
 * NullSec — Identity Repository
 * ------------------------------------------------------------------
 * Data-access layer for the local identity (UUID linking to the Supabase
 * account).
 *
 * Source of truth: Supabase (via the authenticated session). The identity is
 * held in the non-persistent session-memory cache (Store) — it is NOT written
 * to localStorage and does NOT represent a local account.
 *
 * API:
 *   IdentityRepository.get()       → identity object | null
 *   IdentityRepository.save(identity)
 *   IdentityRepository.clear()
 */
(function () {
  'use strict';

  function get() {
    return Store.getIdentity();
  }

  function save(identity) {
    Store.saveIdentity(identity);
  }

  function clear() {
    Store.deleteIdentity();
  }

  window.IdentityRepository = {
    get: get,
    save: save,
    clear: clear
  };
})();
