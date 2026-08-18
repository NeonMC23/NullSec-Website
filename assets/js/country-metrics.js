/**
 * NullSec — Country Metrics (Europe activity, preparation)
 * ------------------------------------------------------------------
 * Data layer for the Europe activity map. Owns:
 *   - the country activity data contract (aggregated, anonymous);
 *   - loading (via ApiClient when online, local reference offline);
 *   - normalization (buckets / intensity classes);
 *   - validation of returned data;
 *   - unavailable / empty state.
 *
 * PRIVACY (Milestone 17): only AGGREGATED country-level statistics. Never
 * expose user_id / identity_id / username / recovery key / IP / GPS / device
 * id / individual activity history / individual timestamps.
 *
 * This is a PREPARATION module: no fake production data. If Supabase is
 * unavailable or returns no data, the UI must show an explicit empty /
 * unavailable state, never fabricated statistics.
 *
 * API contract (aggregated country activity, example only — not fake data):
 *   {
 *     countries: {
 *       "FR": { participants, missionActivity, toolActivity,
 *               propagation, totalActivity },
 *       ...
 *     }
 *   }
 *
 * API:
 *   CountryMetrics.init()                → load reference (local countries)
 *   CountryMetrics.getData()             → Promise<{ countries, source, unavailable }>
 *   CountryMetrics.normalize(raw)        → validate + normalize a raw payload
 *   CountryMetrics.intensity(total)      → 'none'|'very-low'|'low'|'medium'|'high'|'very-high'
 *   CountryMetrics.getCountry(code)      → reference country or null
 */
(function () {
  'use strict';

  let countries = [];   // local ISO reference (offline-capable)
  let loaded = false;

  // M53: cache the aggregated country-activity result for the page session and
  // dedupe concurrent getData() calls. ns_country_metrics returns GLOBAL,
  // aggregated, anonymous public statistics (not per-user data), so reusing the
  // result is correct and safe. This eliminates the 4 duplicate RPC requests
  // that the community page used to fire (one per render section).
  let dataCache = null;      // resolved result
  let dataInflight = null;   // shared in-flight promise (dedupes concurrent calls)

  /** Normalize an arbitrary total into an intensity class. */
  function intensity(total) {
    const n = Number(total);
    if (!isFinite(n) || n <= 0) return 'none';
    if (n < 5) return 'very-low';
    if (n < 25) return 'low';
    if (n < 100) return 'medium';
    if (n < 500) return 'high';
    return 'very-high';
  }

  /** Load the local ISO country reference once (offline-capable). */
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

  /** Return a reference country by ISO code, or null. */
  function getCountry(code) {
    return countries.find(function (c) { return c.code === code; }) || null;
  }

  /**
   * Validate a raw country-activity payload. Returns a normalized object or
   * throws on malformed data. Accepts either:
   *   { countries: { "FR": {...}, ... } }
   * or an array of { countryCode, ... }.
   * Rejects non-finite / negative / oversized numeric values and unknown fields
   * that could indicate individual tracking.
   * @param {*} raw
   * @returns {{countries: object}}
   */
  function normalize(raw) {
    const out = { countries: {} };
    let map = null;

    if (raw && typeof raw === 'object' && raw.countries) {
      map = raw.countries;
    } else if (Array.isArray(raw)) {
      map = {};
      raw.forEach(function (row) {
        if (row && row.countryCode) map[row.countryCode] = row;
      });
    } else {
      throw new Error('invalid_payload');
    }

    Object.keys(map).forEach(function (code) {
      // ISO-3166 alpha-2, uppercase.
      if (typeof code !== 'string' || !/^[A-Z]{2}$/.test(code)) return;
      const src = map[code];
      if (!src || typeof src !== 'object') return;

      // Distinguish "unavailable" (null/undefined) from a real value (0..).
      // Invalid numbers (NaN/Infinity/negative/oversized) are coerced to 0.
      function metricVal(v) {
        if (v === null || v === undefined) return null; // unavailable
        const n = Number(v);
        if (!isFinite(n) || n < 0 || n > 1000000000) return 0;
        return n;
      }

      // communityActivity: explicit field, or fall back to propagation (which
      // aggregates community actions). Kept separate from propagation for the
      // dashboard's mission/tool/community distinction.
      const communityVal = src.communityActivity !== undefined ? src.communityActivity : src.propagation;

      out.countries[code] = {
        participants: metricVal(src.participants),
        missionActivity: metricVal(src.missionActivity),
        toolActivity: metricVal(src.toolActivity),
        communityActivity: metricVal(communityVal),
        propagation: metricVal(src.propagation),
        totalActivity: metricVal(src.totalActivity),
        // M21/M27 metadata: per-metric availability (true = measured value,
        // false = unavailable). Never confuses 0 (measured/empty) with null
        // (unavailable). Unknown fields are ignored.
        availability: {
          participants: src.participants !== null && src.participants !== undefined,
          missionActivity: src.missionActivity !== null && src.missionActivity !== undefined,
          toolActivity: src.toolActivity !== null && src.toolActivity !== undefined,
          communityActivity: communityVal !== null && communityVal !== undefined,
          propagation: src.propagation !== null && src.propagation !== undefined,
          totalActivity: src.totalActivity !== null && src.totalActivity !== undefined
        },
        // Global (non-individual) last-update timestamp, if the source provides one.
        lastUpdate: (typeof src.lastUpdate === 'string' && src.lastUpdate) || null
      };
    });
    return out;
  }

  /**
   * Load the country activity data.
   *   - online (Supabase available + RPC present): fetch via ApiClient.
   *   - offline / RPC not available: return { countries:{}, source:'unavailable' }.
   * Never fabricates values.
   * @returns {Promise<{countries: object, source: string, unavailable: boolean}>}
   */
  function getData() {
    // M53: return the cached result if we already resolved it this session.
    if (dataCache) return Promise.resolve(dataCache);
    // Dedupe concurrent calls: all callers share one in-flight request.
    if (dataInflight) return dataInflight;
    dataInflight = init().then(function () {
      const online = ApiClient.isBackendAvailable();
      if (!online) {
        dataCache = { countries: {}, source: 'unavailable', unavailable: true };
        return dataCache;
      }
      // Placeholder integration point: the production RPC (ns_country_metrics)
      // is implemented in a dedicated backend milestone. Until then, do NOT
      // invent values — return unavailable.
      if (typeof ApiClient.countryMetrics !== 'function') {
        dataCache = { countries: {}, source: 'unavailable', unavailable: true };
        return dataCache;
      }
      return ApiClient.countryMetrics()
        .then(function (raw) {
          const normalized = normalize(raw);
          const lastUpdate = (raw && typeof raw.lastUpdate === 'string' && raw.lastUpdate) || null;
          dataCache = { countries: normalized.countries, source: 'supabase', unavailable: false, lastUpdate: lastUpdate };
          return dataCache;
        })
        .catch(function () {
          dataCache = { countries: {}, source: 'unavailable', unavailable: true };
          return dataCache;
        });
    }).finally(function () {
      dataInflight = null; // allow a later refresh after the first resolution
    });
    return dataInflight;
  }

  /** M53: clear the cached result (used on page reload / explicit refresh). */
  function clearCache() {
    dataCache = null;
    dataInflight = null;
  }

  window.CountryMetrics = {
    init: init,
    getData: getData,
    clearCache: clearCache,
    normalize: normalize,
    intensity: intensity,
    getCountry: getCountry
  };
})();
