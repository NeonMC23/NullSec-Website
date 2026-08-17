/**
 * NullSec — Community Ranking
 * ------------------------------------------------------------------
 * Anonymous regional/country ranking. NEVER ranks individual users — only
 * aggregated counters by country/region. Works offline-first (returns an
 * empty list when the backend is disabled).
 *
 * API:
 *   CommunityRanking.getCountries() → Promise<Array>
 *   CommunityRanking.getRegions()   → Promise<Array>
 */
(function () {
  'use strict';

  function getCountries() {
    if (!ApiClient.isBackendAvailable()) return Promise.resolve([]);
    return ApiClient.communityRankingCountries().then(function (res) {
      return (res && Array.isArray(res.countries)) ? res.countries : [];
    }).catch(function () {
      return [];
    });
  }

  function getRegions() {
    if (!ApiClient.isBackendAvailable()) return Promise.resolve([]);
    return ApiClient.communityRankingRegions().then(function (res) {
      return (res && Array.isArray(res.regions)) ? res.regions : [];
    }).catch(function () {
      return [];
    });
  }

  window.CommunityRanking = {
    getCountries: getCountries,
    getRegions: getRegions
  };
})();
