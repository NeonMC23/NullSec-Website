/**
 * NullSec — Activity Service
 * ------------------------------------------------------------------
 * Clean activity-tracking layer. UI components never call ApiClient or
 * Supabase directly; they call ActivityService.record(). This service:
 *   - validates the activity type and amount,
 *   - checks authentication state,
 *   - calls ApiClient.recordActivity() (token-authenticated),
 *   - handles offline/backend-unavailable states,
 *   - NEVER fabricates success.
 *
 * Architecture:  UI → ActivityService → ApiClient → ns_record_activity → backend
 *
 * Supported activity types:
 *   mission_completed  — a mission was completed.
 *   tool_used          — a tool was used/launched.
 *   community_action   — a community contribution event.
 *
 * Privacy rules (M25):
 *   - The frontend NEVER sends user_id / identity_id / username / country_code /
 *     IP / device info. The backend resolves the user country server-side from
 *     country_membership.
 *   - Only aggregated community metrics are produced. No per-user history exposed.
 *
 * Offline: when Supabase is disabled or the backend is unreachable, record()
 * resolves { ok:false, reason:'offline' } WITHOUT fabricating success and
 * WITHOUT corrupting local state.
 *
 * API:
 *   ActivityService.record(type, amount) → Promise<{ok:boolean, reason?:string}>
 *   ActivityService.validType(type)      → boolean
 */
(function () {
  'use strict';

  const VALID_TYPES = ['mission_completed', 'tool_used', 'community_action'];

  function validType(type) {
    return VALID_TYPES.indexOf(type) !== -1;
  }

  function validAmount(amount) {
    const n = Number(amount);
    return Number.isFinite(n) && n >= 1 && n <= 1000;
  }

  /**
   * Record a community activity action.
   * @param {string} type   one of VALID_TYPES
   * @param {number} amount amount (>=1, <=1000), default 1
   * @returns {Promise<{ok:boolean, reason?:string}>}
   */
  // Minimal duplicate-submission guard: ignore rapid re-submissions of the same
  // type within a short window (prevents accidental double counts). This is a
  // client-side best-effort; the backend remains authoritative. No queue, no
  // background tracking, no persistence.
  let lastSent = {};   // type -> timestamp (ms)
  const DUPLICATE_WINDOW_MS = 1500;

  function isDuplicate(type) {
    const now = Date.now();
    const prev = lastSent[type];
    if (prev && (now - prev) < DUPLICATE_WINDOW_MS) return true;
    lastSent[type] = now;
    return false;
  }

  function record(type, amount) {
    // Validate type.
    if (!validType(type)) return Promise.resolve({ ok: false, reason: 'invalid_activity_type', state: 'INVALID' });
    // Validate amount.
    const amt = (amount === undefined || amount === null) ? 1 : Number(amount);
    if (!validAmount(amt)) return Promise.resolve({ ok: false, reason: 'invalid_amount', state: 'INVALID' });
    // Duplicate submission guard.
    if (isDuplicate(type)) {
      return Promise.resolve({ ok: false, reason: 'duplicate', state: 'DUPLICATE' });
    }
    // Offline / backend unavailable → no fabricated success, no backend call.
    // (Checked before auth so offline is reported accurately even when no
    // session exists.)
    if (!ApiClient.isBackendAvailable()) {
      return Promise.resolve({ ok: false, reason: 'offline', state: 'OFFLINE' });
    }
    // Check authentication (a session token must be present).
    if (!window.Auth || !Auth.isAuthenticated()) {
      return Promise.resolve({ ok: false, reason: 'not_authenticated', state: 'NOT_AUTHENTICATED' });
    }
    const token = Sync.getToken();
    return ApiClient.recordActivity(token, { activity_type: type, amount: amt })
      .then(function () {
        return { ok: true, state: 'SUCCESS' };
      })
      .catch(function () {
        // Never fabricate success; backend failure → unavailable.
        return { ok: false, reason: 'backend_unavailable', state: 'UNAVAILABLE' };
      });
  }

  window.ActivityService = {
    record: record,
    validType: validType,
    VALID_TYPES: VALID_TYPES
  };
})();
