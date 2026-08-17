/**
 * NullSec — API Client (Supabase, production)
 * ------------------------------------------------------------------
 * Centralized backend communication against Supabase (RPC + PostgREST).
 * ALL fetch logic lives here — no other module calls fetch for backend
 * requests. Respects Config.supabaseEnabled / supabaseUrl / supabaseAnonKey.
 *
 * Offline-first: when Supabase is disabled (default) or the device is
 * offline, every method behaves as offline (rejects 'offline' / no-op)
 * without any network request or crash.
 *
 * Auth is via the Recovery Key flow (RPC): the client sends only a SHA-256
 * transport hash of the key; the server stores a salted bcrypt hash.
 * Session tokens are kept in memory only (never persisted, never logged),
 * and authenticated calls pass the raw token (hashed server-side) — never
 * a client-chosen user_id.
 */
(function () {
  'use strict';

  function isSupabaseConfigured() {
    const c = Config.get();
    if (c.supabaseEnabled !== true) return false;
    if (!c.supabaseUrl || typeof c.supabaseUrl !== 'string') return false;
    if (!c.supabaseAnonKey || typeof c.supabaseAnonKey !== 'string') return false;
    return true;
  }

  function isOnline() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    return true;
  }

  /** Backend available = Supabase configured AND online. */
  function isBackendAvailable() {
    return isSupabaseConfigured() && isOnline();
  }

  function base() {
    return Config.get().supabaseUrl.replace(/\/+$/, '');
  }

  function anonHeaders() {
    const key = Config.get().supabaseAnonKey;
    return {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: 'Bearer ' + key
    };
  }

  /**
   * Normalized auth/network error classification (safe, no raw Supabase
   * details leaked to the UI):
   *   OFFLINE           — backend explicitly disabled OR device offline (no request)
   *   UNCONFIGURED      — enabled but missing URL/anon key (no request)
   *   INVALID_ARGUMENTS — malformed client payload (no request)
   *   UNAUTHORIZED      — session invalid/expired/revoked, or auth RPC refused
   *   FORBIDDEN         — RLS/PostgREST denied (permissions)
   *   NETWORK_ERROR     — transport-level failure (DNS, timeout, offline)
   *   SERVER_ERROR      — 5xx / unexpected server response
   */
  const ERROR_TYPES = {
    OFFLINE: 'OFFLINE',
    UNCONFIGURED: 'UNCONFIGURED',
    INVALID_ARGUMENTS: 'INVALID_ARGUMENTS',
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    NETWORK_ERROR: 'NETWORK_ERROR',
    SERVER_ERROR: 'SERVER_ERROR'
  };

  /** Server RPC messages that indicate an authentication/session failure. */
  const AUTH_FAILURE_PATTERNS = [
    'unauthorized', 'invalid_recovery', 'invalid_session',
    'session_expired', 'session_revoked', 'invalid_token',
    'token_expired', 'token_revoked', 'login_required',
    'account_not_found', 'account_already_exists',
    'invalid_identity', 'invalid_recovery_hash', 'invalid_recovery_key',
    // M32/M33: username+password auth failures are also auth refusals.
    'invalid_credentials', 'invalid_username', 'invalid_password_hash',
    'username_taken', 'invalid_password'
  ];

  /** Optional callback invoked when an authenticated call is refused. */
  let unauthorizedHandler = null;

  /**
   * Map an HTTP status + RPC body message to a normalized error type.
   * @param {number} status
   * @param {object|null} json
   * @returns {string}
   */
  function classifyHttp(status, json) {
    if (status === 401) return ERROR_TYPES.UNAUTHORIZED;
    if (status === 403) return ERROR_TYPES.FORBIDDEN;
    if (status >= 500) return ERROR_TYPES.SERVER_ERROR;
    if (status === 400) {
      const msg = (json && json.message) || '';
      const m = String(msg).toLowerCase();
      for (let i = 0; i < AUTH_FAILURE_PATTERNS.length; i++) {
        if (m.indexOf(AUTH_FAILURE_PATTERNS[i]) !== -1) {
          return ERROR_TYPES.UNAUTHORIZED;
        }
      }
      return ERROR_TYPES.INVALID_ARGUMENTS;
    }
    return ERROR_TYPES.SERVER_ERROR;
  }

  /**
   * Normalize an arbitrary thrown error into a classified error object.
   * Guarantees a `.type` and a generic user-safe `.message`.
   * @param {*} err
   * @returns {Error}
   */
  function classifyError(err) {
    const out = (err instanceof Error) ? err : new Error(String(err && err.message ? err.message : 'unknown_error'));
    if (out.type) return out;
    if (out instanceof TypeError || /^fetch|^failed to fetch|network/i.test(String(out.message || ''))) {
      out.type = ERROR_TYPES.NETWORK_ERROR;
    } else if (out.message === 'offline') out.type = ERROR_TYPES.OFFLINE;
    else if (out.message === 'unconfigured') out.type = ERROR_TYPES.UNCONFIGURED;
    else if (out.message === 'invalid_args' || out.message === 'invalid_arguments') out.type = ERROR_TYPES.INVALID_ARGUMENTS;
    else if (out.message === 'invalid_token') out.type = ERROR_TYPES.UNAUTHORIZED;
    else out.type = ERROR_TYPES.SERVER_ERROR;
    return out;
  }

  /** Basic RPC arg validation: must be a plain object (no arrays/strings). */
  function validArgs(args) {
    return args && typeof args === 'object' && !Array.isArray(args);
  }

  /**
   * Build + throw a classified error. When the error is an auth/session
   * failure, notifies the registered unauthorized handler (session cleanup).
   * @param {string} message  generic, user-safe message
   * @param {number} status
   * @param {object|null} json
   * @returns {Error} the thrown error
   */
  function throwClassified(message, status, json) {
    const err = new Error(message);
    err.status = status;
    err.body = json || null;
    err.type = classifyHttp(status, json);
    // M36: the session-cleanup handler fires only on a real session refusal
    // (HTTP 401/403), NOT on a credentials failure (HTTP 400 like a wrong
    // current password in ns_change_password) — a bad password must not
    // force a logout.
    if (err.type === ERROR_TYPES.UNAUTHORIZED && status !== 400 &&
        typeof unauthorizedHandler === 'function') {
      try { unauthorizedHandler(); } catch (e) { /* ignore */ }
    }
    throw err;
  }

  /** Call a Supabase RPC function. */
  function rpc(fn, args) {
    if (!isSupabaseConfigured()) return Promise.reject(classifyError(new Error('unconfigured')));
    if (!isOnline()) return Promise.reject(classifyError(new Error('offline')));
    if (!validArgs(args)) return Promise.reject(classifyError(new Error('invalid_args')));
    return fetchWithTimeout(base() + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: anonHeaders(),
      body: JSON.stringify(args),
      cache: 'no-store'
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok) {
          const message = (json && json.message) || ('request_failed');
          return Promise.reject(throwClassified(message, res.status, json));
        }
        return json;
      });
    }).catch(function (e) {
      if (e && e.type) throw e; // already classified
      throw classifyError(e);   // transport-level failure
    });
  }

  /** PostgREST select from a public aggregate table (RLS allows anon SELECT). */
  function select(table, query) {
    if (!isSupabaseConfigured()) return Promise.reject(classifyError(new Error('unconfigured')));
    if (!isOnline()) return Promise.reject(classifyError(new Error('offline')));
    return fetchWithTimeout(base() + '/rest/v1/' + table + (query ? '?' + query : ''), {
      method: 'GET',
      headers: anonHeaders(),
      cache: 'no-store'
    }).then(function (res) {
      return res.json().catch(function () { return []; }).then(function (json) {
        if (!res.ok) {
          return Promise.reject(throwClassified('request_failed', res.status, json));
        }
        return json;
      });
    }).catch(function (e) {
      if (e && e.type) throw e;
      throw classifyError(e);
    });
  }

  /** Guard: an authenticated call requires a non-empty token string. */
  function requireToken(token) {
    return typeof token === 'string' && token.length > 0;
  }

  /** Default request timeout (ms). Prevents hanging network calls. */
  const REQUEST_TIMEOUT_MS = 12000;

  /** AbortController-based timeout wrapper (falls back to plain fetch). */
  function fetchWithTimeout(url, options) {
    if (typeof AbortController === 'undefined') return fetch(url, options);
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS);
    return fetch(url, Object.assign({}, options, { signal: controller.signal }))
      .finally(function () { clearTimeout(timer); });
  }

  /** Register a callback invoked when an authenticated call is refused. */
  function setUnauthorizedHandler(fn) {
    unauthorizedHandler = (typeof fn === 'function') ? fn : null;
  }

  /**
   * Classify an arbitrary error for the UI (safe message + type).
   * @param {*} err
   * @returns {{type: string, message: string}}
   */
  function describe(err) {
    const classified = classifyError(err);
    const map = {
      OFFLINE: 'Offline — no backend connection.',
      UNCONFIGURED: 'Backend is not configured.',
      INVALID_ARGUMENTS: 'The request was invalid.',
      UNAUTHORIZED: 'Your session is no longer valid. Please sign in again.',
      FORBIDDEN: 'You are not allowed to perform this action.',
      NETWORK_ERROR: 'Network error — please try again.',
      SERVER_ERROR: 'A server error occurred. Please try again.'
    };
    return {
      type: classified.type || 'SERVER_ERROR',
      message: map[classified.type] || 'An error occurred.'
    };
  }

  window.ApiClient = {
    isBackendAvailable: isBackendAvailable,
    isOnline: isOnline,
    isSupabaseConfigured: isSupabaseConfigured,
    rpc: rpc,
    select: select,
    ERROR_TYPES: ERROR_TYPES,
    classifyError: classifyError,
    describe: describe,
    setUnauthorizedHandler: setUnauthorizedHandler,

    /* --- Auth (Recovery Key, via RPC) -------------------------------- */

    /**
     * Create a backend account from username + password (M32).
     * Only SHA-256 transport hashes are sent; the raw password and raw
     * recovery key never leave the browser. NO email is used.
     */
    register: function (payload) {
      return rpc('ns_register', {
        p_username: payload.username,
        p_password_hash: payload.password_hash, // client SHA-256 transport hash
        p_recovery_hash: payload.recovery_hash || null // optional recovery
      });
    },

    /** Sign in with username + password transport hash (M32). */
    login: function (payload) {
      return rpc('ns_login', {
        p_username: payload.username,
        p_password_hash: payload.password_hash
      });
    },

    /** Recover account access with username + recovery key + new password (M33). */
    recover: function (payload) {
      return rpc('ns_recover', {
        p_username: payload.username,
        p_recovery_hash: payload.recovery_hash,
        p_new_password_hash: payload.new_password_hash
      });
    },

    /** Revoke a session (raw token hashed server-side). */
    logout: function (token) {
      if (!requireToken(token)) return Promise.reject(new Error('invalid_token'));
      return rpc('ns_logout', { p_token: token });
    },

    /** Validate a session; returns user_id or null. */
    validateSession: function (token) {
      if (!requireToken(token)) return Promise.resolve(null);
      return rpc('ns_validate_session', { p_token: token });
    },

    /** Fetch the authenticated user's data (token-authenticated). */
    me: function (token) {
      if (!requireToken(token)) return Promise.reject(new Error('invalid_token'));
      return rpc('ns_sync_pull', { p_token: token });
    },

    /** Push profile/settings/progress (token-authenticated). */
    sync: function (token, data) {
      if (!requireToken(token)) return Promise.reject(new Error('invalid_token'));
      return rpc('ns_sync_push', {
        p_token: token,
        p_profile: (data && data.profile) || null,
        p_settings: (data && data.settings) || null,
        p_progress: (data && data.progress) || null
      });
    },

    /** Pull server-side profile/settings/progress (token-authenticated). */
    pull: function (token) {
      if (!requireToken(token)) return Promise.reject(new Error('invalid_token'));
      return rpc('ns_sync_pull', { p_token: token });
    },

    /* --- Community (public, aggregated, no auth) --------------------- */

    /** Global anonymous stats (public aggregate read). */
    communityStats: function () {
      return select('anonymous_global_stats', 'id=eq.1');
    },

    /** Per-country activity + intensity (public aggregate read). */
    communityMap: function () {
      return select('country_activity', 'select=country_code,completed_count,updated_at,countries(code,name,region,active,missions_available)&order=country_code');
    },

    /** Active regions (public aggregate read). */
    communityCountries: function () {
      return select('countries', 'select=code,name,region,active,missions_available&order=active.desc,code');
    },

    /** Mission activity per country (public aggregate read). */
    communityMissions: function () {
      return select('mission_activity', 'select=mission_id,country_code,completed_count,countries(code,missions_available)&order=completed_count.desc');
    },

    /** Anonymous mission completion counter (RPC; no identity fields). */
    communityActivity: function (payload) {
      const p = payload || {};
      return rpc('ns_activity', {
        p_mission_id: p.mission_id,
        p_country_code: p.country_code || null,
        p_region: p.region || 'Europe'
      });
    },

    /* --- Mission discovery + challenges + ranking -------------------- */

    /** Public mission metadata (public aggregate read). */
    missions: function () {
      return select('countries', 'select=code,missions_available&order=code');
    },

    /** Anonymous global challenges (public aggregate read). */
    communityChallenges: function () {
      return select('community_challenges', 'select=id,title,description,target_value,current_value,status&order=created_at.desc');
    },

    /** Aggregated country ranking (public aggregate read). */
    communityRankingCountries: function () {
      return select('country_activity', 'select=country_code,completed_count,countries(code,name,region,active)&order=completed_count.desc');
    },

    /** Aggregated region ranking (public aggregate read). */
    communityRankingRegions: function () {
      return select('region_activity', 'select=region,completed_count&order=completed_count.desc');
    },

    /* --- Community impact metrics ------------------------------------ */

    /** Global impact snapshot (RPC, aggregated). */
    communityMetrics: function () {
      return rpc('ns_metrics', {});
    },

    /** Map intensity data (public aggregate read). */
    communityActivityMap: function () {
      return select('country_activity', 'select=country_code,completed_count,countries(code,name,region,active,missions_available)&order=country_code');
    },

    /* --- Europe country metrics (M17→M20) ------------------------------ */

    /** Aggregated country activity (RPC, anonymous aggregate read). */
    countryMetrics: function () {
      return rpc('ns_country_metrics', {});
    },

    /** Record an authenticated tool-usage aggregate (token-authenticated).
     *  Country is derived server-side from the user's profile. */
    toolActivity: function (token, toolId) {
      if (!requireToken(token)) return Promise.reject(new Error('invalid_token'));
      return rpc('ns_tool_activity', { p_token: token, p_tool_id: toolId });
    },

    /** Update the authenticated user's own profile (incl. user-selected
     *  country). Token-authenticated; never touches another user. */
    updateProfile: function (token, payload) {
      if (!requireToken(token)) return Promise.reject(new Error('invalid_token'));
      return rpc('ns_update_profile', {
        p_token: token,
        p_username: (payload && payload.username) || null,
        p_country_code: (payload && payload.country_code) || null
      });
    },

    /** Record a secure community activity action (M24). Token-authenticated;
     *  country + identity resolved server-side; never a client identity. */
    recordActivity: function (token, payload) {
      if (!requireToken(token)) return Promise.reject(new Error('invalid_token'));
      return rpc('ns_record_activity', {
        p_token: token,
        p_activity_type: (payload && payload.activity_type) || null,
        p_amount: (payload && payload.amount) || 1
      });
    },

    /** Change the authenticated account's password (M36). Only SHA-256
     *  transport hashes are sent; the raw password never leaves the browser. */
    changePassword: function (token, payload) {
      if (!requireToken(token)) return Promise.reject(new Error('invalid_token'));
      return rpc('ns_change_password', {
        p_token: token,
        p_current_password_hash: payload.current_password_hash,
        p_new_password_hash: payload.new_password_hash
      });
    },

    /** Reset the authenticated account's own progression (M36). Server-side. */
    resetProgress: function (token) {
      if (!requireToken(token)) return Promise.reject(new Error('invalid_token'));
      return rpc('ns_reset_progress', { p_token: token });
    },

    /* --- Public profile (M37) ---------------------------------------- */

    /** Fetch a public learning profile (anonymous-friendly, read-only).
     *  Returns { username, completed_mission_ids } — public fields only. */
    publicProfile: function (username) {
      return rpc('ns_public_profile', { p_username: username });
    },

    /** Update the authenticated owner's explicit public profile fields (M38).
     *  Identity is derived from the session; no client user_id. */
    updatePublicProfile: function (token, payload) {
      if (!requireToken(token)) return Promise.reject(new Error('invalid_token'));
      return rpc('ns_update_public_profile', {
        p_token: token,
        p_public_profile_enabled: payload.public_profile_enabled,
        p_bio: payload.bio || null,
        p_learning_interests: payload.learning_interests || null
      });
    }
  };
})();
