/**
 * NullSec — Community Challenges
 * ------------------------------------------------------------------
 * Anonymous, aggregate-based global challenges. No user contribution
 * history — only aggregated counters. Works offline-first (returns an
 * empty list when the backend is disabled).
 *
 * API:
 *   Challenges.init()
 *   Challenges.getActive()   → Promise<Array>  (status active)
 *   Challenges.getProgress() → Promise<Array>  (all, with current/target)
 *   Challenges.getCompleted()→ Promise<Array>  (status completed)
 */
(function () {
  'use strict';

  function load() {
    if (!ApiClient.isBackendAvailable()) return Promise.resolve({ challenges: [] });
    return ApiClient.communityChallenges().catch(function () {
      return { challenges: [] };
    });
  }

  function getAll() {
    return load().then(function (res) {
      return (res && Array.isArray(res.challenges)) ? res.challenges : [];
    });
  }

  function getActive() {
    return getAll().then(function (list) {
      return list.filter(function (c) { return (c.status || 'active') === 'active'; });
    });
  }

  function getProgress() {
    return getAll();
  }

  function getCompleted() {
    return getAll().then(function (list) {
      return list.filter(function (c) { return (c.status || '') === 'completed'; });
    });
  }

  function init() { return load(); }

  window.Challenges = {
    init: init,
    getActive: getActive,
    getProgress: getProgress,
    getCompleted: getCompleted
  };
})();
