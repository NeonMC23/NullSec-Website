/**
 * NullSec — Community Metrics
 * ------------------------------------------------------------------
 * Aggregated, anonymous global impact metrics. Works offline-first: when
 * the backend is disabled/unavailable it returns empty metrics (no crash,
 * no network request). No personal data.
 *
 *   Community UI
 *        │
 *        ▼
 * CommunityMetrics (community-metrics.js)
 *        │
 *        ├── online → ApiClient.communityMetrics
 *        └── offline → empty metrics
 *
 * API:
 *   CommunityMetrics.init()
 *   CommunityMetrics.getGlobal()   → Promise<{completedMissions, activeCountries, activeRegions}>
 *   CommunityMetrics.getCountries()→ Promise<Array>
 *   CommunityMetrics.getRegions()  → Promise<Array>
 *   CommunityMetrics.getChallenges()→ Promise<Array>
 *   CommunityMetrics.refresh()
 */
(function () {
  'use strict';

  let cache = null;

  function empty() {
    return {
      global: {
        completedMissions: null,
        activeCountries: null,
        activeRegions: null,
        availableToolsUsed: null,
        communityActions: null,
        communityPropagation: null
      },
      countries: [],
      regions: [],
      challenges: []
    };
  }

  function load() {
    if (!ApiClient.isBackendAvailable()) return Promise.resolve(empty());
    return ApiClient.communityMetrics().catch(function () {
      return empty();
    });
  }

  function init() {
    return load();
  }

  function getGlobal() {
    return load().then(function (m) { return m.global; });
  }

  function getCountries() {
    return load().then(function (m) { return m.countries || []; });
  }

  function getRegions() {
    return load().then(function (m) { return m.regions || []; });
  }

  function getChallenges() {
    return load().then(function (m) { return m.challenges || []; });
  }

  function refresh() {
    cache = null;
    return load().then(function (m) { cache = m; return m; });
  }

  window.CommunityMetrics = {
    init: init,
    getGlobal: getGlobal,
    getCountries: getCountries,
    getRegions: getRegions,
    getChallenges: getChallenges,
    refresh: refresh
  };
})();
