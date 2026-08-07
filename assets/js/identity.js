/**
 * NullSec — Identity module
 * ------------------------------------------------------------------
 * Local-first anonymous identity management.
 *
 * Works fully offline. No email, no password, no external auth, no
 * fingerprinting. The identity is a locally generated UUID persisted
 * through the Store module (see docs/identity-schema.md).
 *
 * Schema is versioned so it can later be migrated to a backend-compatible
 * format without breaking existing local identities.
 *
 * API:
 *   Identity.init()      — ensure an identity exists (create if missing)
 *   Identity.get()       — return the current identity (or null)
 *   Identity.create()    — generate + persist a new identity
 *   Identity.update(data) — merge metadata, bump updated_at, persist
 *   Identity.clear()     — delete the local identity
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
   * Build a fresh identity object.
   * @returns {object}
   */
  function makeIdentity() {
    const ts = now();
    return {
      id: uuid(),
      username: '',
      display_name: '',
      avatar: null,
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
   * Update identity metadata (merge allowed fields). The id and version are
   * preserved; updated_at is bumped. Returns the updated identity.
   * @param {object} data
   */
  function update(data) {
    const current = IdentityRepository.get() || makeIdentity();
    const allowed = ['username', 'display_name', 'avatar'];
    if (data && typeof data === 'object') {
      allowed.forEach(function (key) {
        if (data[key] !== undefined) current[key] = data[key];
      });
    }
    current.updated_at = now();
    current.version = SCHEMA_VERSION;
    IdentityRepository.save(current);
    return current;
  }

  /** Delete the local identity. */
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
    update: update,
    clear: clear,
    exists: exists
  };
})();
