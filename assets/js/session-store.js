/**
 * NullSec — Session Store (sessionStorage)
 * ------------------------------------------------------------------
 * The single browser-storage location for SHORT-LIVED, session-scoped
 * secrets. This module is the ONLY place in the codebase that touches
 * window.sessionStorage.
 *
 * What lives here (and why sessionStorage, not localStorage):
 *   - ns:session:recovery  — the local recovery key (NSK1-…). Kept out of
 *     long-lived localStorage: sessionStorage is cleared when the tab/session
 *     closes, so the raw key does not persist on disk across browser sessions.
 *   - ns:session:auth       — the restored session { token, expires_at }.
 *     token is the opaque server session token (SHA-256-hashed server-side);
 *     expires_at is informational only and is NEVER trusted as proof of
 *     validity (ns_validate_session is authoritative).
 *
 * Explicitly NOT stored here or anywhere: recovery hash, password, full
 * profile, progress, sync payloads. Those stay in localStorage via Store
 * (non-secret user data) or in memory only.
 *
 * Privacy-first: no telemetry, no tracking, no analytics.
 *
 * API:
 *   SessionStore.get(key) / set(key, value) / remove(key)
 *   SessionStore.getSession()          → { token, expires_at } | null
 *   SessionStore.saveSession(obj)      → persist a restored session
 *   SessionStore.clearSession()        → remove the auth session
 *   SessionStore.getRecoveryKey()      → raw key or null
 *   SessionStore.saveRecoveryKey(k)    → persist raw key
 *   SessionStore.deleteRecoveryKey()   → remove raw key
 */
(function () {
  'use strict';

  const KEYS = {
    RECOVERY: 'ns:session:recovery',
    AUTH: 'ns:session:auth'
  };

  function storage() {
    return window.sessionStorage;
  }

  /** Read + JSON-parse a value; returns null when missing/invalid. */
  function get(key) {
    try {
      const raw = storage().getItem(key);
      if (raw === null) return null;
      try { return JSON.parse(raw); } catch (e) { return raw; }
    } catch (e) { return null; }
  }

  /** Write a JSON-encoded value. Best-effort; quota/private-mode safe. */
  function set(key, value) {
    try { storage().setItem(key, JSON.stringify(value)); } catch (e) { /* non-fatal */ }
  }

  /** Remove a key. */
  function remove(key) {
    try { storage().removeItem(key); } catch (e) { /* non-fatal */ }
  }

  /* --- Auth session ------------------------------------------------ */

  /**
   * Return the persisted session, or null.
   * Structure: { token: string, expires_at: string|null }
   * NEVER contains the recovery key/hash, password, profile or progress.
   */
  function getSession() {
    const s = get(KEYS.AUTH);
    if (s && typeof s === 'object' && typeof s.token === 'string' && s.token.length > 0) {
      return s;
    }
    return null;
  }

  /** Persist a session object (token + optional expiration metadata). */
  function saveSession(session) {
    if (!session || typeof session !== 'object' ||
      typeof session.token !== 'string' || session.token.length === 0) {
      return;
    }
    const clean = { token: session.token };
    // expires_at is informational metadata only (server remains authoritative).
    if (typeof session.expires_at === 'string') clean.expires_at = session.expires_at;
    set(KEYS.AUTH, clean);
  }

  /** Remove the persisted session. */
  function clearSession() {
    remove(KEYS.AUTH);
  }

  /* --- Recovery key (session-scoped, NOT in localStorage) ----------- */

  function getRecoveryKey() {
    return get(KEYS.RECOVERY);
  }

  function saveRecoveryKey(key) {
    set(KEYS.RECOVERY, key);
  }

  function deleteRecoveryKey() {
    remove(KEYS.RECOVERY);
  }

  window.SessionStore = {
    keys: KEYS,
    get: get,
    set: set,
    remove: remove,
    getSession: getSession,
    saveSession: saveSession,
    clearSession: clearSession,
    getRecoveryKey: getRecoveryKey,
    saveRecoveryKey: saveRecoveryKey,
    deleteRecoveryKey: deleteRecoveryKey
  };
})();
