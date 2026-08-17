/**
 * NullSec — Country Service
 * ------------------------------------------------------------------
 * UI-facing country selection service. Coordinates the user flow and delegates
 * persistence to CountryRepository (→ ApiClient → Supabase). No direct Store
 * usage, no local persistence (memory cache only).
 *
 * States (Part 1):
 *   NO_COUNTRY         — authenticated, no country configured.
 *   SELECTING_COUNTRY  — user is browsing/searching the country list.
 *   SAVING_COUNTRY     — a save request is in flight.
 *   COUNTRY_SET        — a country is configured.
 *   ERROR              — a save failed (no fabricated success).
 *
 * Rules:
 *   - The country is chosen MANUALLY (ISO-3166 alpha-2, human-readable name).
 *   - Never inferred from IP/GPS/browser locale/device.
 *   - No backend call if Supabase is disabled (setCountry rejects 'offline').
 *
 * API:
 *   CountryService.getState()            → { status, countryCode, countryName }
 *   CountryService.getCountries()        → Promise<Array<{code,name}>>
 *   CountryService.search(term)          → filtered list
 *   CountryService.select(code)          → set status SELECTING (choose)
 *   CountryService.confirm()             → SAVING → set via repository
 *   CountryService.reset()               → NO_COUNTRY
 */
(function () {
  'use strict';

  let status = 'NO_COUNTRY';   // NO_COUNTRY | SELECTING_COUNTRY | SAVING_COUNTRY | COUNTRY_SET | ERROR
  let selectedCode = null;
  let errorMessage = null;

  let countries = [];   // in-memory reference (ISO + name)
  let loaded = false;

  function loadCountries() {
    if (loaded) return Promise.resolve(countries);
    // Prefer the full selection list; fall back to the Europe map list.
    if (typeof Data.loadCountriesAll === 'function') {
      return Data.loadCountriesAll().then(function (d) {
        countries = Array.isArray(d) && d.length ? d : [];
        loaded = true;
        return countries;
      }).catch(function () {
        return Data.loadCountries().then(function (d) {
          countries = Array.isArray(d) ? d : [];
          loaded = true;
          return countries;
        });
      });
    }
    return Data.loadCountries().then(function (d) {
      countries = Array.isArray(d) ? d : [];
      loaded = true;
      return countries;
    });
  }

  function getState() {
    const ref = selectedCode
      ? countries.find(function (c) { return c.code === selectedCode; })
      : null;
    return {
      status: status,
      countryCode: selectedCode,
      countryName: ref ? ref.name : null,
      error: errorMessage
    };
  }

  function getCountries() {
    return loadCountries();
  }

  /** Case-insensitive search on name or code. */
  function search(term) {
    const t = (term || '').trim().toLowerCase();
    return countries.filter(function (c) {
      return !t || c.name.toLowerCase().indexOf(t) !== -1 || c.code.toLowerCase().indexOf(t) !== -1;
    });
  }

  /** User picks a country from the list (opens the confirmation step). */
  function select(code) {
    if (typeof code !== 'string' || !/^[A-Z]{2}$/.test(code)) {
      status = 'ERROR';
      errorMessage = 'invalid_country_code';
      return getState();
    }
    selectedCode = code;
    status = 'SELECTING_COUNTRY';
    errorMessage = null;
    return getState();
  }

  /** Confirm and persist the chosen country. */
  function confirm() {
    if (!selectedCode) {
      status = 'ERROR';
      errorMessage = 'no_country_selected';
      return Promise.resolve(getState());
    }
    status = 'SAVING_COUNTRY';
    errorMessage = null;
    return CountryRepository.setCountry(selectedCode).then(function () {
      status = 'COUNTRY_SET';
      return getState();
    }).catch(function (e) {
      status = 'ERROR';
      errorMessage = (e && e.message) || 'error';
      return getState();
    });
  }

  /** Reset to no country (e.g. user skipped or logged out). */
  function reset() {
    selectedCode = null;
    status = 'NO_COUNTRY';
    errorMessage = null;
    CountryRepository.clearMemory();
    return getState();
  }

  window.CountryService = {
    getState: getState,
    getCountries: getCountries,
    search: search,
    select: select,
    confirm: confirm,
    reset: reset,
    getCountryRepository: function () { return CountryRepository; }
  };
})();
