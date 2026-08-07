/**
 * NullSec — Community Service
 * ------------------------------------------------------------------
 * Anonymous, aggregated community metrics. Works offline-first: when the
 * backend is disabled/unavailable it returns local/empty-state data (no
 * crash). No personal data is ever exposed or collected.
 *
 *   Community UI (community.html)
 *        │
 *        ▼
 * CommunityService (community-service.js)
 *        │
 *        ├── online → ApiClient.communityStats / communityMap / communityCountries
 *        └── offline → local static countries (data/countries.json)
 *
 * API:
 *   Community.init()               — load the local countries reference once
 *   Community.getGlobalStats()     → Promise<{active_users, completed_missions, countries_active, top_regions}>
 *   Community.getCountryActivity() → Promise<{countries:[{code,region,missions_available,completed,activity_level}]}>
 *   Community.getActiveRegions()   → Promise<{countries:[{code,region,active,missions_available}]}>
 *   Community.isOnline()           — backend available for community stats
 */
(function () {
  'use strict';

  let countries = [];   // local reference (offline fallback)
  let loaded = false;

  function levelOf(completed) {
    if (completed <= 0) return 'none';
    if (completed < 100) return 'low';
    if (completed < 1000) return 'medium';
    if (completed < 5000) return 'high';
    return 'very-high';
  }

  /** Load the static countries reference once (offline-capable). */
  function init() {
    if (loaded) return Promise.resolve(countries);
    return Data.loadCountries()
      .then(function (data) {
        countries = Array.isArray(data) ? data : [];
        loaded = true;
        return countries;
      })
      .catch(function () {
        countries = [];
        loaded = true;
        return countries;
      });
  }

  /** Whether the community backend is available for live stats. */
  function isOnline() {
    return ApiClient.isBackendAvailable();
  }

  /** Local offline global stats (empty state, privacy-safe). */
  function offlineGlobalStats() {
    return {
      active_users: 0,
      completed_missions: 0,
      countries_active: 0,
      top_regions: []
    };
  }

  /**
   * Global anonymous stats (cached 30s).
   * @returns {Promise<object>}
   */
  function getGlobalStats() {
    return init().then(function () {
      return cached('stats', function () {
        if (!isOnline()) return Promise.resolve(offlineGlobalStats());
        return ApiClient.communityStats().catch(function () {
          return offlineGlobalStats();
        });
      });
    });
  }

  /** Local offline country activity (mission availability only). */
  function offlineCountryActivity() {
    return { countries: countries.map(function (c) {
      return {
        code: c.code,
        region: c.region,
        missions_available: c.missions_available,
        completed: 0,
        activity_level: 'none'
      };
    }) };
  }

  /**
   * Per-country activity with intensity (cached 30s).
   * @returns {Promise<{countries:Array}>}
   */
  function getCountryActivity() {
    return init().then(function () {
      return cached('map', function () {
        if (!isOnline()) return Promise.resolve(offlineCountryActivity());
        return ApiClient.communityMap().catch(function () {
          return offlineCountryActivity();
        });
      });
    });
  }

  /** Local offline active regions (all inactive). */
  function offlineActiveRegions() {
    return { countries: countries.map(function (c) {
      return { code: c.code, region: c.region, active: false, missions_available: c.missions_available };
    }) };
  }

  /**
   * Active regions list.
   * @returns {Promise<{countries:Array}>}
   */
  function getActiveRegions() {
    return init().then(function () {
      if (!isOnline()) return offlineActiveRegions();
      return ApiClient.communityCountries().catch(function () {
        return offlineActiveRegions();
      });
    });
  }

  /** Local offline mission activity (availability, zero completions). */
  function offlineMissionActivity() {
    return { countries: countries.map(function (c) {
      return { country: c.code, missions_available: c.missions_available, completed: 0 };
    }) };
  }

  /**
   * Mission activity per country (ranked by completions).
   * @returns {Promise<{countries:Array}>}
   */
  function getMissionActivity() {
    return init().then(function () {
      if (!isOnline()) return offlineMissionActivity();
      return ApiClient.communityMissions().then(function (res) {
        if (!res || !Array.isArray(res)) return offlineMissionActivity();
        return { countries: res };
      }).catch(function () {
        return offlineMissionActivity();
      });
    });
  }

  /* --- Cache + refresh ------------------------------------------------ */

  let cache = {};      // name -> data
  const CACHE_TTL = 30 * 1000; // 30s in-memory cache

  function cached(name, loader) {
    const hit = cache[name];
    if (hit && (Date.now() - hit.at) < CACHE_TTL) return Promise.resolve(hit.value);
    return loader().then(function (value) {
      cache[name] = { value: value, at: Date.now() };
      return value;
    });
  }

  /** Refresh all community data (invalidates and reloads caches). */
  function refresh() {
    cache = {};
    return Promise.all([
      getGlobalStats(),
      getCountryActivity(),
      getMissionActivity()
    ]).then(function () {
      return true;
    });
  }

  window.Community = {
    init: init,
    getGlobalStats: getGlobalStats,
    getCountryActivity: getCountryActivity,
    getActiveRegions: getActiveRegions,
    getMissionActivity: getMissionActivity,
    refresh: refresh,
    isOnline: isOnline,
    _levelOf: levelOf
  };
})();
