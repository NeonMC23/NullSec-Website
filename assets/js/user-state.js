/**
 * NullSec — User State module
 * ------------------------------------------------------------------
 * Lightweight, MEMORY-ONLY view-state for the current browsing session.
 * This is NOT account storage and is NOT persisted anywhere.
 *
 * LOCAL STORAGE POLICY (Milestone 16): the authenticated flag and the
 * session mode are NEVER written to localStorage. The authoritative
 * authenticated flag lives in memory (Auth). A reload resets this view-state.
 *
 * The application state model is intentionally simple:
 *   - LOCAL / NOT AUTHENTICATED   (backend disabled or no session)
 *   - AUTHENTICATED / SUPABASE     (validated Supabase session)
 *   - BACKEND UNAVAILABLE          (enabled but unreachable → see Session)
 * There is no "local authenticated account".
 *
 * API:
 *   UserState.get()             — current view state (derived)
 *   UserState.isAuthenticated() — delegates to the authoritative Auth flag
 *   UserState.getMode()         — 'anonymous' | 'local' | 'authenticated'
 */
(function () {
  'use strict';

  function get() {
    return {
      authenticated: isAuthenticated(),
      identityId: Identity.get() ? Identity.get().id : null,
      mode: getMode(),
      theme: Store.get(Store.keys.THEME) || 'dark'
    };
  }

  /**
   * Derive the current mode from the authoritative sources (never persisted).
   * @returns {'anonymous'|'local'|'authenticated'}
   */
  function getMode() {
    if (window.Auth && Auth.isAuthenticated()) return 'authenticated';
    return Identity.exists() ? 'local' : 'anonymous';
  }

  /** Whether a validated session is active (delegates to the authoritative Auth). */
  function isAuthenticated() {
    return !!(window.Auth && Auth.isAuthenticated());
  }

  window.UserState = {
    get: get,
    isAuthenticated: isAuthenticated,
    getMode: getMode
  };
})();
