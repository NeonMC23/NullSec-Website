/**
 * NullSec — Auth Service
 * ------------------------------------------------------------------
 * Centralized authentication abstraction. Owns the authoritative
 * "am I authenticated right now" flag, which lives in MEMORY (per page
 * load) and is only ever set by a successful backend login/register or by
 * a server-validated session restoration. It is NEVER restored from
 * localStorage, so a reload can never resurrect a stale/invalid session.
 *
 * The session TOKEN is held by Sync (memory) and, for restoration, by
 * SessionStore (sessionStorage). The raw recovery key and the recovery
 * hash are never stored here and never transmitted by this module.
 *
 * LOCAL STORAGE POLICY (Milestone 16): authentication state is NEVER written
 * to localStorage. It lives only in memory (the authenticated flag + token in
 * Sync) and, for the short-lived browser session, in sessionStorage via
 * SessionStore. There is no persistent "local account" state.
 *
 * Offline-first: with the backend disabled, login/register return
 * `authentication-unavailable-offline` and make zero network requests. The
 * app never fabricates a local account.
 *
 * API:
 *   Auth.init()                   — no-op state builder (memory only)
 *   Auth.getState()               — current (live) auth state object
 *   Auth.isAuthenticated()        — true iff a validated session is active
 *   Auth.getUser()                — the linked local identity (or null)
 *   Auth.loginWithRecoveryKey()   — backend login (or offline no-op)
 *   Auth.register()               — backend account creation (or offline no-op)
 *   Auth.applySession(token)      — internal: mark authenticated + persist session
 *   Auth.clearSession()           — internal: reset to not-authenticated
 *   Auth.logout()                 — revoke server-side + clear session
 *   Auth.reset()                  — reset in-memory session state
 */
(function () {
  'use strict';

  function now() {
    return new Date().toISOString();
  }

  // Authoritative in-memory flag. Starts false on every page load; set only
  // by a real authentication or a server-validated session restoration.
  let authenticated = false;
  // Transient in-memory flag set while a login/register request is in flight.
  let authenticating = false;

  /** Ensure a consistent, memory-only auth state. */
  function init() {
    return buildState();
  }

  /** Build the live auth state object (derived, never stale, never persisted). */
  function buildState() {
    const id = Identity.get();
    const ts = now();
    let mode = 'offline';
    if (Config.get().backendEnabled) mode = authenticated ? 'online' : 'local';
    return {
      mode: mode,
      authenticated: authenticated,
      identity_id: id ? id.id : null,
      provider: authenticated ? 'recovery' : null,
      updated_at: ts
    };
  }

  /** Return the current (live) auth state. */
  function getState() {
    return buildState();
  }

  /** True iff a validated session is currently active. */
  function isAuthenticated() {
    return authenticated === true && !!Sync.getToken();
  }

  /** Return the linked local identity, or null. */
  function getUser() {
    const id = Identity.get();
    return id ? id : null;
  }

  /**
   * Normalized authentication status for the UI (M20). One of:
   *   NOT_AUTHENTICATED  — no session, local/offline mode.
   *   AUTHENTICATING     — a login/register request is in flight.
   *   AUTHENTICATED      — a validated Supabase session is active.
   *   BACKEND_UNAVAILABLE— Supabase is enabled but unreachable/not configured.
   *   SESSION_EXPIRED    — a stored session was rejected/cleared by the server.
   * Never fabricates authentication from local data.
   * @returns {string}
   */
  function getAuthStatus() {
    if (authenticated && isAuthenticated()) return 'AUTHENTICATED';
    if (authenticating) return 'AUTHENTICATING';
    if (Config.get().supabaseEnabled === true) {
      // Supabase intended to be available.
      if (window.Session && Session.getStatus() === 'unavailable') return 'BACKEND_UNAVAILABLE';
      if (window.Session && Session.getStatus() === 'local' && Session.hasSessionRefused()) {
        return 'SESSION_EXPIRED';
      }
    }
    return 'NOT_AUTHENTICATED';
  }

  /** Set/clear the transient "authenticating" flag. */
  function setAuthenticating(value) {
    authenticating = value === true;
  }

  /**
   * Internal: mark the user as authenticated and persist the short-lived
   * browser session. Called by login/register and by session restoration.
   * The authenticated flag is memory-only; the token goes to sessionStorage.
   * @param {string} token
   * @param {string} [identityId]
   */
  function applySession(token, identityId) {
    if (typeof token !== 'string' || token.length === 0) return;
    authenticated = true;
    Sync.setToken(token);
    // Persist only the short-lived session token (sessionStorage, not localStorage).
    SessionStore.saveSession({ token: token, expires_at: null });
  }

  /**
   * Internal: clear the in-memory authenticated flag and token while KEEPING
   * the persisted session (used when the backend is temporarily unreachable,
   * so a later reload can re-validate). Never called for an invalid session.
   */
  function clearMemorySession() {
    authenticated = false;
    Sync.clearToken();
  }

  /**
   * Internal: reset to not-authenticated. Clears the in-memory token and the
   * persisted short-lived session. No localStorage write.
   */
  function clearSession() {
    authenticated = false;
    Sync.clearToken();
    SessionStore.clearSession();
  }

  /**
   * Backend account creation from the local recovery key.
   * Offline → { ok:false, reason:'authentication-unavailable-offline' }.
   * @returns {Promise<{ok:boolean, reason?:string}>}
   */
  function register() {
    const backend = Config.get().backendEnabled === true && Config.get().authEnabled === true;
    if (!backend) {
      return Promise.resolve({ ok: false, reason: 'authentication-unavailable-offline' });
    }
    if (!RecoveryKey.get()) return Promise.resolve({ ok: false, reason: 'no-recovery-key' });
    authenticating = true;
    return RecoveryKey.hashForTransport().then(function (recoveryHash) {
      if (!recoveryHash) { authenticating = false; return { ok: false, reason: 'crypto-unavailable' }; }
      return ApiClient.register({
        recovery_hash: recoveryHash,
        identity_id: Identity.get().id,
        profile: UserProfile.get()
      }).then(function (res) {
        authenticating = false;
        if (res && res.token) {
          applySession(res.token, Identity.get().id);
          return { ok: true };
        }
        return { ok: false, reason: 'no-token' };
      });
    }).catch(function (e) {
      authenticating = false;
      return { ok: false, reason: ApiClient.describe(e).type.toLowerCase() };
    });
  }

  /**
   * Backend login using the locally stored recovery key.
   * Offline → { ok:false, reason:'authentication-unavailable-offline' }.
   * @returns {Promise<{ok:boolean, reason?:string}>}
   */
  function loginWithRecoveryKey() {
    const backend = Config.get().backendEnabled === true && Config.get().authEnabled === true;
    if (!backend) {
      return Promise.resolve({ ok: false, reason: 'authentication-unavailable-offline' });
    }
    if (!RecoveryKey.get()) return Promise.resolve({ ok: false, reason: 'no-recovery-key' });
    authenticating = true;
    return RecoveryKey.hashForTransport().then(function (recoveryHash) {
      if (!recoveryHash) { authenticating = false; return { ok: false, reason: 'crypto-unavailable' }; }
      return ApiClient.login({
        recovery_hash: recoveryHash,
        identity_id: Identity.get().id
      }).then(function (res) {
        authenticating = false;
        if (res && res.token) {
          applySession(res.token, Identity.get().id);
          return { ok: true };
        }
        return { ok: false, reason: 'no-token' };
      });
    }).catch(function (e) {
      authenticating = false;
      return { ok: false, reason: ApiClient.describe(e).type.toLowerCase() };
    });
  }

  /**
   * Log out: revoke the token server-side (best-effort, non-blocking), then
   * clear all local session state. The app remains usable in local mode.
   * @returns {void}
   */
  function logout() {
    const token = Sync.getToken();
    if (token) {
      // Best-effort revocation; never blocks or throws on network failure.
      ApiClient.logout(token).catch(function () { /* ignore */ });
    }
    clearSession();
  }

  /** Reset in-memory session state to not-authenticated. */
  function reset() {
    authenticated = false;
    Sync.clearToken();
    SessionStore.clearSession();
    return init();
  }

  window.Auth = {
    init: init,
    getState: getState,
    isAuthenticated: isAuthenticated,
    getUser: getUser,
    loginWithRecoveryKey: loginWithRecoveryKey,
    register: register,
    applySession: applySession,
    clearSession: clearSession,
    clearMemorySession: clearMemorySession,
    logout: logout,
    reset: reset,
    getAuthStatus: getAuthStatus,
    setAuthenticating: setAuthenticating
  };
})();
