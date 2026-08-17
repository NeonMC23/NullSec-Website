/**
 * NullSec — Account identity module
 * ------------------------------------------------------------------
 * Represents the account identity (a UUID that links to the Supabase
 * account). M30/M31: the account is a PRIVATE progression container, NOT a
 * social profile. This identity object carries NO username, display name or
 * avatar — those legacy fields were removed. It only holds the
 * id (UUID used as identity_id by the recovery-key auth) and timestamps.
 *
 * Works fully offline. No email, no password, no external auth, no
 * fingerprinting, no social fields. Held in memory (Store session cache);
 * never persisted to localStorage.
 *
 * API:
 *   Identity.init()      — ensure an identity exists (create if missing)
 *   Identity.get()       — return the current identity (or null)
 *   Identity.create()    — generate + persist a new identity
 *   Identity.clear()     — delete the identity
 *   Identity.exists()    — boolean: does a valid identity exist?
 */
(function () {
  'use strict';

  const SCHEMA_VERSION = 1;

  /** Generate a UUID v4 (RFC 4122) using crypto when available. */
  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    // Fallback for older browsers / non-secure contexts.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /** ISO timestamp (UTC). */
  function now() {
    return new Date().toISOString();
  }

  /**
   * Build a fresh identity object. Carries only the account UUID + timestamps.
   * No username/display_name/avatar (legacy fields — removed).
   * @returns {object}
   */
  function makeIdentity() {
    const ts = now();
    return {
      id: uuid(),
      created_at: ts,
      updated_at: ts,
      version: SCHEMA_VERSION
    };
  }

  /**
   * Ensure an identity exists; create one if missing or invalid.
   * Idempotent and safe to call on every page load.
   */
  function init() {
    if (exists()) return get();
    return create();
  }

  /** Return the current identity, or null if none. */
  function get() {
    return IdentityRepository.get();
  }

  /** Create and persist a brand new identity. Returns the identity. */
  function create() {
    const identity = makeIdentity();
    IdentityRepository.save(identity);
    return identity;
  }

  /**
   * Delete the account identity. There is no profile object to update; the
   * identity is a minimal UUID container.
   */
  function clear() {
    IdentityRepository.clear();
  }

  /** True if a valid identity exists. */
  function exists() {
    return !!IdentityRepository.get();
  }

  window.Identity = {
    init: init,
    get: get,
    create: create,
    clear: clear,
    exists: exists
  };
})();
