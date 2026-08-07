/**
 * NullSec — Europe Map (SVG, preparation)
 * ------------------------------------------------------------------
 * SVG rendering + interaction for the Europe activity map.
 *
 * Architecture (Milestone 17):
 *   - The map is a single <svg> with one <path id="{ISO_CODE}"> per country.
 *     NOT hundreds of individual HTML elements.
 *   - Presentation only: it never holds data. Data comes from CountryMetrics
 *     (which talks to ApiClient / Supabase) and is applied as CSS intensity
 *     classes.
 *   - Country identifiers are stable ISO-3166-1 alpha-2 (uppercase).
 *
 * No fetch logic here. ApiClient is the only backend layer; data loading /
 * validation lives in country-metrics.js.
 *
 * PRIVACY: aggregated country-level intensity only. No user lists, no
 * individual profiles, no individual activity, no social graph.
 *
 * API:
 *   EuropeMap.render(container, opts)  → build the SVG map
 *   EuropeMap.applyActivity(data)      → apply intensity classes + tooltip
 *   EuropeMap.setCountryClass(code, cls)
 *   EuropeMap.destroy(container)
 */
(function () {
  'use strict';

  // A lightweight, maintainable SVG path per European country (ISO alpha-2).
  // These are schematic country shapes for the pre-production architecture.
  // A precise geographic dataset can be dropped in later without changing the
  // component contract (one <path id="XX"> per country).
  const COUNTRY_PATHS = {
    AT: 'M 150 70 l 10 -6 12 4 4 8 -8 8 -12 -2 -6 -12z',
    BE: 'M 90 40 l 8 -2 6 6 -4 8 -10 0 -4 -6 4 -6z',
    BG: 'M 210 120 l 14 -4 6 8 -6 10 -14 -2 -4 -8 4 -4z',
    CH: 'M 135 60 l 8 -4 8 4 2 8 -8 6 -8 -4 -2 -10z',
    CZ: 'M 120 55 l 14 -2 4 8 -8 8 -12 -2 2 -12z',
    DE: 'M 105 20 l 16 -2 8 10 -4 18 -14 6 -10 -12 4 -20z',
    DK: 'M 100 2 l 16 -2 4 10 -12 8 -10 -6 2 -10z',
    EE: 'M 150 -30 l 10 0 2 14 -10 6 -6 -8 4 -12z',
    ES: 'M 40 110 l 18 -6 12 6 -2 16 -18 8 -12 -10 2 -14z',
    FI: 'M 120 -70 l 16 -4 12 18 -8 22 -16 2 -8 -18 4 -20z',
    FR: 'M 55 50 l 22 -4 12 8 -2 30 -20 12 -14 -14 2 -32z',
    GB: 'M 8 20 l 20 -6 10 8 -6 16 -20 6 -8 -12 4 -12z',
    GR: 'M 210 170 l 14 -4 6 10 -8 12 -12 -4 0 -14z',
    HR: 'M 150 100 l 10 -2 4 10 -8 10 -8 -4 2 -14z',
    HU: 'M 140 85 l 14 -2 4 10 -10 10 -10 -4 2 -14z',
    IE: 'M -8 14 l 14 -4 6 8 -4 16 -14 4 -4 -12 2 -12z',
    IS: 'M 40 -120 l 18 -6 10 10 -8 14 -18 0 -8 -10 6 -8z',
    IT: 'M 150 130 l 14 -6 8 8 -4 22 -16 14 -8 -18 6 -20z',
    LT: 'M 135 -30 l 14 -2 4 12 -10 10 -10 -6 2 -14z',
    LU: 'M 100 38 l 6 -2 4 4 -2 6 -6 2 -4 -4 2 -6z',
    LV: 'M 130 -14 l 12 -2 2 12 -10 8 -8 -6 4 -12z',
    NL: 'M 88 18 l 14 -4 4 10 -10 8 -8 -6 0 -8z',
    NO: 'M 90 -110 l 16 -6 18 16 -6 26 -18 6 -12 -18 2 -24z',
    PL: 'M 118 20 l 16 -4 8 12 -6 22 -16 4 -8 -14 6 -20z',
    PT: 'M 24 110 l 12 -4 6 8 -4 16 -14 6 -4 -14 4 -12z',
    RO: 'M 180 90 l 18 -4 6 12 -8 18 -16 2 -6 -14 6 -14z',
    RS: 'M 170 105 l 12 -2 4 10 -8 10 -10 -4 2 -14z',
    SE: 'M 120 -90 l 14 -4 12 16 -6 40 -16 8 -8 -26 4 -34z',
    SI: 'M 145 88 l 8 -2 4 8 -6 8 -8 -2 2 -12z',
    SK: 'M 128 60 l 12 -2 2 10 -8 8 -8 -4 2 -12z'
  };

  const NS = 'http://www.w3.org/2000/svg';
  const UNKNOWN_CLASS = 'country--none';

  /**
   * Build (or return) the SVG element with a <path> per country.
   * @param {HTMLElement} container
   * @returns {SVGElement}
   */
  function buildSvg(container) {
    let svg = container.querySelector('svg.europe-map');
    if (svg) return svg;

    svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'europe-map');
    svg.setAttribute('viewBox', '-30 -140 300 350');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'NullSec Europe activity map');

    Object.keys(COUNTRY_PATHS).forEach(function (code) {
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('id', code);
      path.setAttribute('d', COUNTRY_PATHS[code]);
      path.setAttribute('class', 'country ' + UNKNOWN_CLASS);
      path.setAttribute('data-code', code);
      path.dataset.code = code;
      svg.appendChild(path);
    });

    container.appendChild(svg);
    return svg;
  }

  /** Set the intensity class on a country path (missing → 'none'). */
  function setCountryClass(svg, code, cls) {
    const path = svg.querySelector('#' + code);
    if (!path) return;
    // Preserve the selected class if this country is currently selected.
    const isSelected = path.getAttribute('class').indexOf('selected') !== -1;
    path.setAttribute('class', 'country ' + (cls || UNKNOWN_CLASS) + (isSelected ? ' selected' : ''));
  }

  /** Set the 'selected' highlight on one country, clearing others. */
  function setSelected(svg, code) {
    if (!svg) return;
    svg.querySelectorAll('path.country').forEach(function (path) {
      let cls = (path.getAttribute('class') || '').replace(/\s*selected/g, '');
      path.setAttribute('class', cls);
    });
    if (code) {
      const path = svg.querySelector('#' + code);
      if (path) path.setAttribute('class', (path.getAttribute('class') || '') + ' selected');
    }
  }

  /** Apply aggregated activity data to the map (intensity classes). */
  function applyActivity(svg, data) {
    const countries = (data && data.countries) ? data.countries : {};
    Object.keys(COUNTRY_PATHS).forEach(function (code) {
      const row = countries[code];
      const cls = row ? CountryMetrics.intensity(row.totalActivity) : UNKNOWN_CLASS;
      setCountryClass(svg, code, 'country--' + cls);
    });
  }

  /** Attach hover/click/keyboard handlers producing aggregated info. */
  function bindInteractions(svg, opts) {
    const onSelect = (opts && opts.onSelect) || null;
    const onHover = (opts && opts.onHover) || null;
    svg.querySelectorAll('path.country').forEach(function (path) {
      // Keyboard accessibility: each country is focusable and selectable.
      path.setAttribute('tabindex', '0');
      path.setAttribute('role', 'button');
      path.setAttribute('aria-label', path.getAttribute('id') + ' — view aggregated activity');
      path.addEventListener('click', function () {
        if (onSelect) onSelect(path.getAttribute('id'));
      });
      path.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (onSelect) onSelect(path.getAttribute('id'));
        }
      });
      path.addEventListener('mouseenter', function () {
        if (onHover) onHover(path.getAttribute('id'), path);
      });
      path.addEventListener('mouseleave', function () {
        if (onHover) onHover(null, null);
      });
      path.addEventListener('focus', function () {
        if (onHover) onHover(path.getAttribute('id'), path);
      });
      path.addEventListener('blur', function () {
        if (onHover) onHover(null, null);
      });
    });
  }

  /** Render the map into a container. */
  function render(container, opts) {
    if (!container) return null;
    const svg = buildSvg(container);
    bindInteractions(svg, opts || {});
    return svg;
  }

  /** Remove the map from a container. */
  function destroy(container) {
    if (!container) return;
    const svg = container.querySelector('svg.europe-map');
    if (svg) svg.remove();
  }

  window.EuropeMap = {
    render: render,
    applyActivity: applyActivity,
    setCountryClass: setCountryClass,
    setSelected: setSelected,
    destroy: destroy,
    COUNTRY_PATHS: COUNTRY_PATHS
  };
})();
