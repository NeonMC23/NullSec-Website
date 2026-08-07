/**
 * NullSec — Session Service
 * ------------------------------------------------------------------
 * Orchestrates session persistence & startup restoration on top of the
 * Auth / Sync / SessionStore / ApiClient layers.
 *
 * Startup lifecycle (one validation per page load, never polling):
 *   1. Backend disabled/unconfigured  → zero network requests, local mode,
 *                                       any stale session is cleared.
 *   2. No stored session              → local mode, no network.
 *   3. Stored session present         → ns_validate_session (authoritative):
 *        - valid       → authenticated mode restored
 *        - invalid     → session cleared, local mode
 *        - unreachable → local mode now, stored session KEPT (retry later)
 *                                        → status 'unavailable'
 *
 * The client never trusts its own `expires_at` as proof of validity; it is
 * only used to short-circuit clearly-expired sessions (a safe early reject).
 * On any server-side auth refusal the unauthorized handler clears the session
 * cleanly, with no validation retry loop.
 *
 * API:
 *   Session.getStatus()          → 'checking'|'authenticated'|'local'|'unavailable'
 *   Session.restore()            → begin/continue startup restoration (deduped)
 *   Session.ensureRestored()     → the in-flight restoration promise
 *   Session.forceRecheck()       → re-run validation (e.g. after login)
 */
(function () {
  'use strict';

  // One-shot restoration guard. Starts once at module load.
  let restoringPromise = null;
  let status = 'checking';
  // True when the server explicitly refused/expired a previously held session
  // (used by Auth.getAuthStatus() → SESSION_EXPIRED). Cleared on a valid
  // restoration or logout.
  let sessionRefused = false;

  function getStatus() {
    return status;
  }

  /** Whether a stored session was explicitly rejected/expired by the server. */
  function hasSessionRefused() {
    return sessionRefused;
  }

  /**
   * Perform the startup restoration. Returns the resulting status string.
   * @returns {Promise<string>}
   */
  function doRestore() {
    // Ensure the base (local) state exists before deciding anything.
    Auth.init();

    const supabaseEnabled = Config.get().supabaseEnabled === true;
    const configured = ApiClient.isSupabaseConfigured();

    // --- 1. Backend disabled / unconfigured: ZERO network, local mode. ---
    if (!supabaseEnabled || !configured) {
      Auth.clearSession();
      sessionRefused = false;
      status = 'local';
      return Promise.resolve('local');
    }

    // --- 2. No stored session → local mode, no network. -----------------
    const saved = SessionStore.getSession();
    if (!saved) {
      Auth.clearSession();
      sessionRefused = false;
      status = 'local';
      return Promise.resolve('local');
    }

    // Short-circuit a clearly-expired session (safe early reject; the server
    // remains authoritative for anything not clearly in the past).
    if (typeof saved.expires_at === 'string') {
      const expiry = Date.parse(saved.expires_at);
      if (!isNaN(expiry) && expiry <= Date.now()) {
        Auth.clearSession();
        sessionRefused = true;
        status = 'local';
        return Promise.resolve('local');
      }
    }

    // --- 3. Validate server-side (the authoritative check). -------------
    return ApiClient.validateSession(saved.token).then(function (userId) {
      if (userId) {
        // Identity may be absent (e.g. localStorage cleared but the short-lived
        // session survived). Guard the optional identity link so restoration
        // never throws on a null identity.
        const localId = Identity.get() ? Identity.get().id : null;
        Auth.applySession(saved.token, localId);
        sessionRefused = false;
        status = 'authenticated';
        return 'authenticated';
      }
      // Invalid / expired / revoked → clean local fallback.
      Auth.clearSession();
      sessionRefused = true;
      status = 'local';
      return 'local';
    }).catch(function (err) {
      const type = ApiClient.describe(err).type;
      if (type === 'UNAUTHORIZED' || type === 'FORBIDDEN') {
        // Server explicitly refused the session → remove it.
        Auth.clearSession();
        sessionRefused = true;
        status = 'local';
        return 'local';
      }
      // Backend unreachable / server error: stay usable locally and KEEP the
      // stored session (clearMemorySession) so a later reload can re-validate.
      // Never corrupt data.
      Auth.clearMemorySession();
      sessionRefused = false;
      status = 'unavailable';
      return 'unavailable';
    });
  }

  /** Begin (or continue) restoration. Deduplicated, non-blocking. */
  function restore() {
    if (!restoringPromise) {
      status = 'checking';
      restoringPromise = doRestore().then(function (result) {
        restoringPromise = null;
        return result;
      }, function () {
        restoringPromise = null;
        status = 'local';
        return 'local';
      });
    }
    return restoringPromise;
  }

  /** Return the current restoration promise (starting it if needed). */
  function ensureRestored() {
    return restore();
  }

  /** Re-run validation from scratch (e.g., after login/register/logout). */
  function forceRecheck() {
    restoringPromise = null;
    status = 'checking';
    return restore();
  }

  // ---- Unauthorized cleanup: any token-authenticated RPC refusal clears
  // the session without starting a validation loop. -----------------------
  ApiClient.setUnauthorizedHandler(function () {
    if (Config.get().supabaseEnabled !== true) return;
    Auth.clearSession();
    sessionRefused = true;
    status = 'local';
  });

  /** Reset the refused flag (e.g. after logout / successful login). */
  function clearSessionRefused() {
    sessionRefused = false;
  }

  window.Session = {
    getStatus: getStatus,
    hasSessionRefused: hasSessionRefused,
    clearSessionRefused: clearSessionRefused,
    restore: restore,
    ensureRestored: ensureRestored,
    forceRecheck: forceRecheck
  };

  // Kick off the single startup validation after all modules have loaded.
  restore();
})();
