/**
 * NullSec — Community Action Service
 * ------------------------------------------------------------------
 * Dedicated integration point for explicit, user-initiated community
 * contributions. UI components call CommunityActionService (never ApiClient /
 * ActivityService directly). It validates the action type and delegates to
 * ActivityService.
 *
 * Architecture:
 *   UI → CommunityActionService → ActivityService → ApiClient → ns_record_activity
 *
 * Supported explicit actions (community_action):
 *   join_initiative   — join a public community initiative.
 *   contribution_done — mark a contribution completed.
 *   submit_resource   — submit a public community resource.
 *
 * Privacy (M26):
 *   - Only explicit user actions are recorded; never page views, clicks, time
 *     spent, browsing history, personal behavior or device info.
 *   - The payload stays anonymous (no user_id / identity / country / IP / GPS /
 *     device). The backend resolves the country server-side.
 *   - Offline / backend unavailable → honest failure, no fabricated success.
 *
 * API:
 *   CommunityActionService.record(actionType) → Promise<{ok, reason, state}>
 *   CommunityActionService.validAction(type)  → boolean
 */
(function () {
  'use strict';

  const ACTIONS = ['join_initiative', 'contribution_done', 'submit_resource'];

  function validAction(type) {
    return ACTIONS.indexOf(type) !== -1;
  }

  /**
   * Record an explicit community action (anonymous aggregated event).
   * @param {string} actionType one of ACTIONS
   * @returns {Promise<{ok:boolean, reason?:string, state?:string}>}
   */
  function record(actionType) {
    if (!validAction(actionType)) {
      return Promise.resolve({ ok: false, reason: 'invalid_action', state: 'INVALID' });
    }
    return ActivityService.record('community_action', 1).then(function (res) {
      // Map the ActivityService result to an explicit state.
      if (res.ok) return { ok: true, state: 'SUCCESS' };
      if (res.reason === 'offline') return { ok: false, reason: 'offline', state: 'OFFLINE' };
      if (res.reason === 'not_authenticated') return { ok: false, reason: 'not_authenticated', state: 'NOT_AUTHENTICATED' };
      if (res.reason === 'backend_unavailable') return { ok: false, reason: 'backend_unavailable', state: 'UNAVAILABLE' };
      return { ok: false, reason: res.reason, state: 'INVALID' };
    });
  }

  window.CommunityActionService = {
    record: record,
    validAction: validAction,
    ACTIONS: ACTIONS
  };
})();
