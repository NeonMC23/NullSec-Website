/**
 * NullSec — Auth Service
 * ------------------------------------------------------------------
 * Centralized authentication abstraction (M32). The PRIMARY sign-in is
 * username + password. The recovery key is an account-recovery mechanism
 * only — it is NOT used for normal sign-in. NO email is used anywhere.
 *
 * Owns the authoritative "am I authenticated right now" flag, which lives in
 * MEMORY (per page load) and is only ever set by a successful backend
 * login/register or by a server-validated session restoration. It is NEVER
 * restored from localStorage, so a reload can never resurrect a stale/invalid
 * session.
 *
 * Secrets handling (M32):
 *   - The password is hashed client-side (SHA-256 transport hash) and the
 *     raw password is never sent or stored. It is not persisted anywhere.
 *   - The raw recovery key lives in sessionStorage (SessionStore) and only
 *     its SHA-256 transport hash is sent to the server.
 *   - The session token lives in memory (Sync) + sessionStorage
 *     (ns:session:auth). The username (private login id) is carried in the
 *     sessionStorage session for the private Account page only.
 *
 * Offline-first: with the backend disabled, sign-in/create-account return
 * `authentication-unavailable-offline` and make zero network requests. The
 * app never fabricates a client-side account object.
 *
 * API:
 *   Auth.init()                       — no-op state builder (memory only)
 *   Auth.getState()                   — current (live) auth state object
 *   Auth.isAuthenticated()            — true iff a validated session is active
 *   Auth.getUsername()                — private login identifier (or null)
 *   Auth.getUser()                    — the linked local identity (or null)
 *   Auth.validateUsername(u)          — string | null (client-side rule)
 *   Auth.validatePassword(p)          — string | null (client-side rule)
 *   Auth.createAccount(username, password) — register (username+password)
 *   Auth.signIn(username, password)   — login (username+password)
 *   Auth.recoverAccount(username, recoveryKey) — account recovery
 *   Auth.applySession(token, username)— internal: mark authenticated + persist
 *   Auth.clearSession()               — internal: reset to not-authenticated
 *   Auth.logout()                     — revoke server-side + clear session
 *   Auth.reset()                      — reset in-memory session state
 */
(function () {
  'use strict';

  function now() {
    return new Date().toISOString();
  }

  // Authoritative in-memory flag. Starts false on every page load; set only
  // by a real authentication or a server-validated session restoration.
  let authenticated = false;
  // Transient in-memory flag set while a sign-in/register request is in flight.
  let authenticating = false;

  // Canonical auth-state change listeners. This is the SINGLE notification
  // mechanism pages/nav use to re-render when the authenticated state changes
  // (session restored, login, logout, session cleared). Pages subscribe via
  // Auth.onAuthChange(cb) instead of reading Auth.isAuthenticated() once at
  // DOMContentLoaded (which runs before the async session restore resolves).
  let authListeners = [];

  /** Register a listener; returns an unsubscribe function. */
  function onAuthChange(cb) {
    if (typeof cb === 'function') authListeners.push(cb);
    return function () {
      const i = authListeners.indexOf(cb);
      if (i !== -1) authListeners.splice(i, 1);
    };
  }

  /** Notify all listeners the auth state changed. Errors are swallowed so a
   *  single consumer can never break the rest of the site. */
  function notifyAuthChange() {
    authListeners.slice().forEach(function (cb) {
      try { cb(); } catch (e) { /* never let one consumer break others */ }
    });
  }

  /** Username rule: 3–32 chars, letters/digits/._- (matches backend). */
  function validateUsername(username) {
    if (typeof username !== 'string' || !username.trim()) return 'Username is required.';
    const u = username.trim();
    if (u.length < 3) return 'Username must be at least 3 characters.';
    if (u.length > 32) return 'Username must be at most 32 characters.';
    if (!/^[A-Za-z0-9._-]+$/.test(u)) return 'Username may contain letters, digits, . _ - only.';
    return null;
  }

  /** Password rule: minimum length (8), no email, no stored raw value. */
  function validatePassword(password) {
    if (typeof password !== 'string' || password.length === 0) return 'Password is required.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    return null;
  }

  /** Normalize a username to lowercase (case-insensitive login). */
  function normalizeUsername(username) {
    return String(username || '').trim().toLowerCase();
  }

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
      provider: authenticated ? 'username' : null,
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

  /** Return the private login identifier, or null. */
  function getUsername() {
    const s = SessionStore.getSession();
    return (s && typeof s.username === 'string' && s.username.length) ? s.username : null;
  }

  /** Return the linked local identity, or null. */
  function getUser() {
    const id = Identity.get();
    return id ? id : null;
  }

  /**
   * Normalized authentication status for the UI (M20). One of:
   *   NOT_AUTHENTICATED  — no session.
   *   AUTHENTICATING     — a sign-in/register request is in flight.
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
   * browser session. The authenticated flag is memory-only; the token and the
   * private username go to sessionStorage.
   * @param {string} token
   * @param {string} [username] private login identifier
   */
  function applySession(token, username) {
    if (typeof token !== 'string' || token.length === 0) return;
    authenticated = true;
    Sync.setToken(token);
    SessionStore.saveSession({
      token: token,
      username: (typeof username === 'string' && username.length) ? username : null,
      expires_at: null
    });
    notifyAuthChange();
  }

  /**
   * Internal: clear the in-memory authenticated flag and token while KEEPING
   * the persisted session (used when the backend is temporarily unreachable,
   * so a later reload can re-validate). Never called for an invalid session.
   */
  function clearMemorySession() {
    authenticated = false;
    Sync.clearToken();
    notifyAuthChange();
  }

  /**
   * Internal: reset to not-authenticated. Clears the in-memory token and the
   * persisted short-lived session. No localStorage write.
   */
  function clearSession() {
    authenticated = false;
    Sync.clearToken();
    SessionStore.clearSession();
    notifyAuthChange();
  }

  /** Backend availability guard shared by all auth actions. */
  function backendEnabled() {
    return Config.get().backendEnabled === true && Config.get().authEnabled === true;
  }

  /**
   * Create an account from username + password. Generates a recovery key
   * (account recovery only) and stores only its SHA-256 transport hash
   * server-side. Returns { ok:true, recovery_key } on success so the UI can
   * present the recovery key once.
   * @returns {Promise<{ok:boolean, reason?:string, recovery_key?:string}>}
   */

  /** Map a caught backend error to a user-safe auth reason. Any auth refusal
   *  becomes the generic 'invalid_credentials' so the UI never reveals whether
   *  a username exists (M33). Non-auth errors keep their normalized type. */
  function authReason(e) {
    const type = ApiClient.describe(e).type;
    if (type === 'UNAUTHORIZED' || type === 'FORBIDDEN') return 'invalid_credentials';
    return type.toLowerCase();
  }

  function createAccount(username, password) {
    const unameErr = validateUsername(username);
    const pwdErr = validatePassword(password);
    if (!backendEnabled()) {
      return Promise.resolve({ ok: false, reason: 'authentication-unavailable-offline' });
    }
    if (unameErr || pwdErr) {
      return Promise.resolve({ ok: false, reason: 'invalid_credentials' });
    }
    // Recovery key generated for account recovery (never for sign-in).
    const recoveryKey = RecoveryKey.ensure();
    authenticating = true;
    return Promise.all([
      RecoveryKey.sha256(String(password)),
      RecoveryKey.sha256(recoveryKey)
    ]).then(function (hashes) {
      const pwHash = hashes[0], recHash = hashes[1];
      if (!pwHash || !recHash) { authenticating = false; return { ok: false, reason: 'crypto-unavailable' }; }
      return ApiClient.register({
        username: normalizeUsername(username),
        password_hash: pwHash,
        recovery_hash: recHash
      }).then(function (res) {
        authenticating = false;
        if (res && res.token) {
          applySession(res.token, normalizeUsername(username));
          return { ok: true, recovery_key: recoveryKey };
        }
        return { ok: false, reason: 'no-token' };
      });
    }).catch(function (e) {
      authenticating = false;
      return { ok: false, reason: authReason(e) };
    });
  }

  /**
   * Sign in with username + password. Only the SHA-256 transport hash of the
   * password is sent; the raw password is never transmitted or stored.
   * @returns {Promise<{ok:boolean, reason?:string}>}
   */
  function signIn(username, password) {
    if (!backendEnabled()) {
      return Promise.resolve({ ok: false, reason: 'authentication-unavailable-offline' });
    }
    if (validateUsername(username) || validatePassword(password)) {
      return Promise.resolve({ ok: false, reason: 'invalid_credentials' });
    }
    authenticating = true;
    return RecoveryKey.sha256(String(password)).then(function (pwHash) {
      if (!pwHash) { authenticating = false; return { ok: false, reason: 'crypto-unavailable' }; }
      return ApiClient.login({
        username: normalizeUsername(username),
        password_hash: pwHash
      }).then(function (res) {
        authenticating = false;
        if (res && res.token) {
          applySession(res.token, normalizeUsername(username));
          return { ok: true };
        }
        return { ok: false, reason: 'no-token' };
      });
    }).catch(function (e) {
      authenticating = false;
      return { ok: false, reason: authReason(e) };
    });
  }

  /**
   * Recover account access using username + recovery key. Returns a session.
   * @returns {Promise<{ok:boolean, reason?:string}>}
   */
  /**
   * Recover an account using username + recovery key + a new password (M33).
   * This is NOT a normal sign-in: the server verifies the recovery credential,
   * establishes the new password and revokes old sessions. No session is
   * created here — the user then signs in normally with the new password.
   * @returns {Promise<{ok:boolean, reason?:string}>}
   */
  function recoverAccount(username, recoveryKey, newPassword) {
    if (!backendEnabled()) {
      return Promise.resolve({ ok: false, reason: 'authentication-unavailable-offline' });
    }
    if (validateUsername(username) || typeof recoveryKey !== 'string' || !recoveryKey.trim()) {
      return Promise.resolve({ ok: false, reason: 'invalid_credentials' });
    }
    if (validatePassword(newPassword)) {
      return Promise.resolve({ ok: false, reason: 'invalid_credentials' });
    }
    authenticating = true;
    return Promise.all([
      RecoveryKey.sha256(String(recoveryKey).trim()),
      RecoveryKey.sha256(String(newPassword))
    ]).then(function (hashes) {
      const recHash = hashes[0], newPwHash = hashes[1];
      if (!recHash || !newPwHash) { authenticating = false; return { ok: false, reason: 'crypto-unavailable' }; }
      return ApiClient.recover({
        username: normalizeUsername(username),
        recovery_hash: recHash,
        new_password_hash: newPwHash
      }).then(function (res) {
        authenticating = false;
        if (res && res.recovered === true) {
          return { ok: true, reason: 'password_reset' };
        }
        return { ok: false, reason: 'no-token' };
      });
    }).catch(function (e) {
      authenticating = false;
      return { ok: false, reason: authReason(e) };
    });
  }

  /**
   * Change the account's password (M36). Requires the current password and a
   * new password (client-side transport hashes are sent; the raw password is
   * never transmitted or stored). The server revokes other sessions and keeps
   * the current one. On failure the current session is NOT touched.
   * @returns {Promise<{ok:boolean, reason?:string}>}
   */
  function changePassword(currentPassword, newPassword) {
    if (!backendEnabled()) {
      return Promise.resolve({ ok: false, reason: 'authentication-unavailable-offline' });
    }
    const token = Sync.getToken();
    if (!token) return Promise.resolve({ ok: false, reason: 'not_authenticated' });
    if (validatePassword(currentPassword) || validatePassword(newPassword)) {
      return Promise.resolve({ ok: false, reason: 'invalid_credentials' });
    }
    return Promise.all([
      RecoveryKey.sha256(String(currentPassword)),
      RecoveryKey.sha256(String(newPassword))
    ]).then(function (hashes) {
      const curHash = hashes[0], newHash = hashes[1];
      if (!curHash || !newHash) return { ok: false, reason: 'crypto-unavailable' };
      return ApiClient.changePassword(token, {
        current_password_hash: curHash,
        new_password_hash: newHash
      }).then(function (res) {
        if (res && res.changed === true) return { ok: true };
        return { ok: false, reason: 'no-token' };
      });
    }).catch(function (e) {
      return { ok: false, reason: authReason(e) };
    });
  }

  /**
   * Log out: revoke the token server-side (best-effort, non-blocking), then
   * clear all local session state.
   * @returns {void}
   */
  function logout() {
    const token = Sync.getToken();
    if (token) {
      ApiClient.logout(token).catch(function () { /* ignore */ });
    }
    clearSession();
  }

  /** Reset in-memory session state to not-authenticated. */
  function reset() {
    authenticated = false;
    Sync.clearToken();
    SessionStore.clearSession();
    notifyAuthChange();
    return init();
  }

  window.Auth = {
    init: init,
    getState: getState,
    isAuthenticated: isAuthenticated,
    getUsername: getUsername,
    getUser: getUser,
    validateUsername: validateUsername,
    validatePassword: validatePassword,
    createAccount: createAccount,
    signIn: signIn,
    recoverAccount: recoverAccount,
    changePassword: changePassword,
    applySession: applySession,
    clearSession: clearSession,
    clearMemorySession: clearMemorySession,
    logout: logout,
    reset: reset,
    getAuthStatus: getAuthStatus,
    setAuthenticating: setAuthenticating,
    onAuthChange: onAuthChange
  };
})();
