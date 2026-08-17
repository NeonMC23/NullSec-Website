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
 * M31: there is no client-side account concept. A visitor is either anonymous
 * (guest) or authenticated. There is no third "local" state.
 *
 * API:
 *   UserState.get()             — current view state (derived)
 *   UserState.isAuthenticated() — delegates to the authoritative Auth flag
 *   UserState.getMode()         — 'anonymous' | 'authenticated'
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
   * Derive the current mode from the authoritative auth source (never persisted).
   * M31: only guest ('anonymous') or 'authenticated' — no client-side account state.
   * @returns {'anonymous'|'authenticated'}
   */
  function getMode() {
    return (window.Auth && Auth.isAuthenticated()) ? 'authenticated' : 'anonymous';
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
