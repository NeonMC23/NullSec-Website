/**
 * NullSec — Mission Discovery
 * ------------------------------------------------------------------
 * Mission browsing/discovery layer. Works offline-first using the local
 * mission dataset (Data.loadMissions). When online it may optionally read
 * public aggregate metadata via ApiClient (Supabase PostgREST).
 *
 * No personal recommendations, no tracking.
 *
 * API:
 *   MissionDiscovery.init()
 *   MissionDiscovery.getAll()            → Promise<Array>
 *   MissionDiscovery.getByCountry(code)  → Promise<Array>
 *   MissionDiscovery.getByRegion(region) → Promise<Array>
 *   MissionDiscovery.getByCategory(cat)  → Promise<Array>
 *   MissionDiscovery.getAvailable()      → Promise<Array>
 *   MissionDiscovery.search(filters)     → Promise<Array>
 */
(function () {
  'use strict';

  let missions = [];
  let loaded = false;

  function init() {
    if (loaded) return Promise.resolve(missions);
    return Data.loadMissions()
      .then(function (data) {
        missions = Array.isArray(data) ? data : [];
        loaded = true;
        return missions;
      })
      .catch(function () {
        missions = [];
        loaded = true;
        return missions;
      });
  }

  function getAll() {
    return init().then(function () { return missions.slice(); });
  }

  function getByCountry(countryCode) {
    return init().then(function () {
      if (!countryCode) return missions.slice();
      return missions.filter(function (m) {
        return m.country === countryCode || m.country === null;
      });
    });
  }

  function getByRegion(region) {
    return init().then(function () {
      if (!region) return missions.slice();
      return missions.filter(function (m) {
        return (m.region || 'Europe').toLowerCase() === String(region).toLowerCase();
      });
    });
  }

  function getByCategory(category) {
    return init().then(function () {
      if (!category) return missions.slice();
      return missions.filter(function (m) {
        return (m.category || 'General').toLowerCase() === String(category).toLowerCase();
      });
    });
  }

  function getAvailable() {
    return init().then(function () {
      return missions.filter(function (m) { return m.available !== false; });
    });
  }

  /**
   * Filter missions by an object of optional filters.
   * @param {object} filters { country, region, category, difficulty, status, query }
   * @returns {Promise<Array>}
   */
  function search(filters) {
    filters = filters || {};
    return init().then(function () {
      return missions.filter(function (m) {
        if (filters.country && m.country !== filters.country && m.country !== null) return false;
        if (filters.region && (m.region || 'Europe').toLowerCase() !== String(filters.region).toLowerCase()) return false;
        if (filters.category && (m.category || 'General').toLowerCase() !== String(filters.category).toLowerCase()) return false;
        if (filters.difficulty !== undefined && filters.difficulty !== '' &&
          Number(m.difficulty) !== Number(filters.difficulty)) return false;
        if (filters.status && (m.status || 'active').toLowerCase() !== String(filters.status).toLowerCase()) return false;
        if (filters.query) {
          const q = String(filters.query).toLowerCase();
          const hay = ((m.title || '') + ' ' + (m.desc || '') + ' ' + (m.category || '')).toLowerCase();
          if (hay.indexOf(q) === -1) return false;
        }
        return true;
      });
    });
  }

  window.MissionDiscovery = {
    init: init,
    getAll: getAll,
    getByCountry: getByCountry,
    getByRegion: getByRegion,
    getByCategory: getByCategory,
    getAvailable: getAvailable,
    search: search
  };
})();
