/**
 * NullSec — Data Loader
 * ------------------------------------------------------------------
 * Single frontend source of truth for loading the site's static JSON
 * datasets. No other module should call fetch() directly for these files.
 *
 * API:
 *   Data.loadArticles()  -> Promise<Array>
 *   Data.loadMissions()  -> Promise<Array>
 *   Data.loadTools()     -> Promise<Array>
 *
 * Guarantees:
 *   - fetch only happens on first call; result is cached in memory.
 *   - concurrent calls for the same dataset share a single in-flight fetch.
 *   - failures reject the promise but the app modules show a graceful
 *     fallback message (never a blank page / crash).
 *
 * Load order note: this module must load after Store/Utils but before any
 * module that calls Data.* (home, articles, search, journey, tools).
 */
(function () {
  'use strict';

  let SOURCES = {
    articles: 'data/articles.json',
    missions: 'data/missions.json',
    tools: 'data/tools.json',
    countries: 'data/countries.json',
    'countries-all': 'data/countries-all.json'
  };

  let cache = {};    // name -> data (resolved)
  let inflight = {}; // name -> Promise (dedup concurrent fetches)

  function load(name) {
    // Already cached -> resolve immediately.
    if (name in cache) {
      return Promise.resolve(cache[name]);
    }
    // A fetch is already in flight for this dataset -> reuse it.
    if (name in inflight) {
      return inflight[name];
    }

    inflight[name] = fetch(SOURCES[name])
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + SOURCES[name]);
        return res.json();
      })
      .then(function (data) {
        if (!Array.isArray(data)) {
          throw new Error('Invalid data for ' + SOURCES[name]);
        }
        cache[name] = data;
        return data;
      })
      .then(function (data) {
        // Validate the geographic mission model without breaking existing
        // missions that predate these optional fields.
        if (name === 'missions' && Array.isArray(data)) {
          return data.map(function (m) {
            if (m && typeof m === 'object' && typeof m.id === 'string') {
              // Optional geo/category fields with safe defaults.
              if (m.region === undefined) m.region = 'Europe';
              if (m.available === undefined) m.available = true;
              if (m.country === undefined) m.country = null;
              if (m.category === undefined) m.category = 'General';
            }
            return m;
          });
        }
        return data;
      })
      .finally(function () {
        // Allow a future retry after a failure (do not cache errors).
        delete inflight[name];
      });

    return inflight[name];
  }

  window.Data = {
    loadArticles: function () { return load('articles'); },
    loadMissions: function () { return load('missions'); },
    loadTools: function () { return load('tools'); },
    loadCountries: function () { return load('countries'); },
    loadCountriesAll: function () { return load('countries-all'); }
  };
})();
