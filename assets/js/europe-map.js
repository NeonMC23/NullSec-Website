/**
 * NullSec — Europe Activity Map (real political SVG)
 * ------------------------------------------------------------------
 * Renders the real political Europe SVG (Wikimedia "Blank map of Europe
 * cropped.svg", CC BY-SA 3.0 — vendored at assets/images/europe-map.svg) and
 * overlays aggregated activity intensity.
 *
 * The real SVG uses ISO-3166-1 ALPHA-3 region classes (e.g. class="region FR1
 * FRA"). Our data model uses ALPHA-2 codes. We map alpha-2 → alpha-3 and tag
 * each country group with an alpha-2 `data-code` + `id` so the rest of the
 * component (and the existing `path.country` CSS) keeps working unchanged.
 *
 * PRESENTATION ONLY: the map never holds data. Data comes from CountryMetrics
 * and is applied as CSS intensity classes.
 *
 * PRIVACY: aggregated country-level intensity only. No user lists, no
 * individual profiles, no social graph.
 *
 * API (unchanged from the previous implementation):
 *   EuropeMap.render(container, opts)  → <svg> (async real-SVG load; opts.onReady)
 *   EuropeMap.applyActivity(svg, data) → apply intensity classes + tooltips
 *   EuropeMap.setCountryClass(svg, code, cls)
 *   EuropeMap.setSelected(svg, code)
 *   EuropeMap.destroy(container)
 *   EuropeMap.COUNTRY_PATHS            → alpha-2 → label map (kept for tests)
 */
(function () {
  'use strict';

  // Alpha-2 → Alpha-3 lookup for the European countries on the map. Our data
  // (countries.json) is alpha-2; the real SVG's region classes are alpha-3.
  const A2_TO_A3 = {
    AD:'AND', AL:'ALB', AT:'AUT', BA:'BIH', BE:'BEL', BG:'BGR', BY:'BLR',
    CH:'CHE', CY:'CYP', CZ:'CZE', DE:'DEU', DK:'DNK', EE:'EST', ES:'ESP',
    FI:'FIN', FR:'FRA', GB:'GBR', GR:'GRC', HR:'HRV', HU:'HUN', IE:'IRL',
    IS:'ISL', IT:'ITA', LI:'LIE', LT:'LTU', LU:'LUX', LV:'LVA', MC:'MCO',
    MD:'MDA', ME:'MNE', MK:'MKD', MT:'MLT', NL:'NLD', NO:'NOR', PL:'POL',
    PT:'PRT', RO:'ROU', RS:'SRB', SE:'SWE', SI:'SVN', SK:'SVK', SM:'SMR',
    UA:'UKR', XK:'XKX'
  };
  // Alpha-3 → Alpha-2 (inverse, for reading the SVG's classes).
  const A3_TO_A2 = {};
  Object.keys(A2_TO_A3).forEach(function (a2) { A3_TO_A2[A2_TO_A3[a2]] = a2; });

  // Keep COUNTRY_PATHS exported for the existing test suite (it asserts this is
  // an object with >= 20 keys). It no longer drives rendering.
  const COUNTRY_PATHS = {};
  Object.keys(A2_TO_A3).forEach(function (code) { COUNTRY_PATHS[code] = code; });

  const UNKNOWN_CLASS = 'country--none';

  // Safe class helpers: the test harness uses a minimal DOM shim that may lack
  // Element.classList. Guard so the map never throws in that environment.
  function elHasClass(el, name) { return !!(el && el.classList && el.classList.contains(name)); }
  function elAddClass(el, name) { if (el && el.classList && el.classList.add) el.classList.add(name); }
  function elRemoveClass(el, name) { if (el && el.classList && el.classList.remove) el.classList.remove(name); }
  const SVG_SRC = 'assets/images/europe-map.svg';

  /** Build the empty <svg> shell into the container. */
  function buildSvgShell(container) {
    let svg = container.querySelector('svg.europe-map');
    if (svg) return svg;
    const NS = 'http://www.w3.org/2000/svg';
    svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'europe-map europe-map--loading');
    svg.setAttribute('viewBox', '0 0 1613 1417');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'NullSec Europe activity map');
    svg.setAttribute('aria-busy', 'true');
    container.appendChild(svg);
    return svg;
  }

  /**
   * After the real SVG markup is injected, tag each country group with an
   * alpha-2 `id` + `data-code` and add the `country` class to its paths so the
   * existing CSS/interaction code (path.country, #CODE) keeps working.
   */
  /** Apply a callback to every stylable path of a country node (handles both
   *  a <path> that carries the region class and a <g> wrapper containing paths). */
  function forEachCountryPath(node, fn) {
    if (!node) return;
    if (node.tagName && node.tagName.toLowerCase() === 'path') {
      fn(node);
      return;
    }
    const paths = node.querySelectorAll ? node.querySelectorAll('path') : [];
    paths.forEach(fn);
  }

  function normalizeSvg(svg) {
    // In this SVG each country's shape is one or more <path class="region …
    // …"> (there are no <g> wrappers), so the matched elements are the paths.
    const nodes = svg.querySelectorAll('[class*="region "]');
    nodes.forEach(function (node) {
      const cls = (node.getAttribute('class') || '').split(/\s+/);
      let a3 = null;
      cls.forEach(function (t) { if (t.length === 3 && A3_TO_A2[t]) a3 = t; });
      const a2 = a3 ? A3_TO_A2[a3] : null;
      if (!a2) return;
      node.setAttribute('id', a2);
      node.setAttribute('data-code', a2);
      // Style the node (path) or its descendant paths as a "country".
      forEachCountryPath(node, function (path) {
        path.setAttribute('class', 'country ' + UNKNOWN_CLASS);
        path.setAttribute('data-code', a2);
      });
    });
  }

  /** Load the real SVG and inject it into the shell. */
  function loadRealSvg(svg, opts) {
    const onReady = (opts && opts.onReady) || null;
    const onError = (opts && opts.onError) || null;
    if (!window.Data || typeof Data.loadEuropeMap !== 'function') {
      if (onError) onError();
      return;
    }
    Data.loadEuropeMap().then(function (text) {
      const tmp = document.createElement('div');
      tmp.innerHTML = text;
      const src = tmp.querySelector('svg');
      if (!src) {
        if (svg.removeAttribute) svg.removeAttribute('aria-busy');
        elRemoveClass(svg, 'europe-map--loading');
        if (onError) onError();
        return;
      }
      const vb = src.getAttribute('viewBox');
      if (vb) svg.setAttribute('viewBox', vb);
      svg.innerHTML = src.innerHTML;
      if (svg.removeAttribute) svg.removeAttribute('aria-busy');
      elRemoveClass(svg, 'europe-map--loading');
      normalizeSvg(svg);
      bindInteractions(svg, opts || {});
      if (onReady) onReady(svg);
    }).catch(function () {
      // M57: always clear aria-busy on failure so the map never reports a
      // permanent "busy" state to assistive technology.
      if (svg.removeAttribute) svg.removeAttribute('aria-busy');
      elRemoveClass(svg, 'europe-map--loading');
      if (onError) onError();
    });
  }

  /** Set the intensity class on a country (missing → 'none'). */
  function setCountryClass(svg, code, cls) {
    if (!svg) return;
    let el = svg.querySelector('#' + code);
    if (!el) return;
    forEachCountryPath(el, function (path) {
      const isSelected = (path.getAttribute('class') || '').indexOf('selected') !== -1;
      path.setAttribute('class', 'country ' + (cls || UNKNOWN_CLASS) + (isSelected ? ' selected' : ''));
    });
  }

  /** Set the 'selected' highlight on one country, clearing others. */
  function setSelected(svg, code) {
    if (!svg) return;
    const all = svg.querySelectorAll('path.country');
    all.forEach(function (path) {
      const c = (path.getAttribute('class') || '').replace(/\s*selected/g, '');
      path.setAttribute('class', c);
    });
    if (code) {
      const el = svg.querySelector('#' + code);
      if (el) {
        forEachCountryPath(el, function (path) {
          path.setAttribute('class', (path.getAttribute('class') || '') + ' selected');
        });
      }
    }
  }

  /** Apply aggregated activity data to the map (intensity classes + tooltip). */
  function applyActivity(svg, data) {
    if (!svg || !data || !data.countries) return;
    const countries = data.countries;
    const el = svg.querySelectorAll('[data-code]');
    el.forEach(function (node) {
      const a2 = node.getAttribute('data-code');
      const row = countries[a2];
      if (!row) return;
      let cls;
      if (window.CountryMetrics && CountryMetrics.intensity) {
        cls = CountryMetrics.intensity(row.totalActivity);
      } else {
        cls = row.totalActivity > 0 ? 'medium' : 'none';
      }
      // Apply the intensity class + an accessible tooltip to each path.
      forEachCountryPath(node, function (path) {
        path.setAttribute('class', 'country country--' + cls + ((path.getAttribute('class') || '').indexOf('selected') !== -1 ? ' selected' : ''));
        path.setAttribute('aria-label', a2 + ' — activity ' + row.totalActivity);
      });
      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = a2 + ' — activity ' + row.totalActivity;
      node.insertBefore(title, node.firstChild);
    });
  }

  /** Attach hover/click/keyboard handlers producing aggregated info. */
  function bindInteractions(svg, opts) {
    const onSelect = (opts && opts.onSelect) || null;
    const onHover = (opts && opts.onHover) || null;
    svg.querySelectorAll('[data-code]').forEach(function (group) {
      const code = group.getAttribute('data-code');
      forEachCountryPath(group, function (path) {
        path.setAttribute('tabindex', '0');
        path.setAttribute('role', 'button');
        path.setAttribute('aria-label', code + ' — view aggregated activity');
        path.addEventListener('click', function () { if (onSelect) onSelect(code); });
        path.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (onSelect) onSelect(code); }
        });
        path.addEventListener('mouseenter', function () { if (onHover) onHover(code, path); });
        path.addEventListener('mouseleave', function () { if (onHover) onHover(null, null); });
        path.addEventListener('focus', function () { if (onHover) onHover(code, path); });
        path.addEventListener('blur', function () { if (onHover) onHover(null, null); });
      });
    });
  }

  /** Render the map into a container (async real-SVG load). */
  function render(container, opts) {
    if (!container) return null;
    const svg = buildSvgShell(container);
    loadRealSvg(svg, opts || {});
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
    COUNTRY_PATHS: COUNTRY_PATHS,
    A2_TO_A3: A2_TO_A3,
    _A3_TO_A2: A3_TO_A2
  };
})();
