/**
 * ⚠️ LEGACY / ARCHIVÉ (Milestone 18).
 * Superseded by `assets/js/europe-map.js` (SVG Europe, per-ISO paths) +
 * `assets/js/country-metrics.js` (data). No longer loaded by any page or test.
 * Kept for historical reference only — do not re-enable.
 */
/**
 * NullSec — Community Map
 * ------------------------------------------------------------------
 * Lightweight, offline-compatible SVG map of Europe for showing
 * aggregated, anonymous community activity. No heavy map framework, no
 * external map API, no GPS, no tracking, no user position.
 *
 * It renders simplified country shapes into a container and colors them by
 * activity level (none/low/medium/high/very-high). Data comes from
 * Community.getCountryActivity().
 *
 * API:
 *   CommunityMap.render(container, activityData)
 *   CommunityMap.destroy(container)
 *   CommunityMap.paths  — simplified SVG paths keyed by country code
 */
(function () {
  'use strict';

  // Simplified low-poly SVG paths (viewBox 0 0 640 480), Europe-focus.
  const PATHS = {
    GB: 'M190,60 L225,52 L252,66 L247,92 L222,96 L205,88 L192,78 Z',
    FR: 'M215,90 L262,80 L286,98 L300,128 L288,164 L262,176 L238,158 L222,128 L210,108 Z',
    ES: 'M218,168 L266,150 L280,170 L262,196 L234,204 L220,186 Z',
    PT: 'M210,166 L218,170 L214,188 L202,182 Z',
    DE: 'M286,64 L330,58 L350,84 L342,108 L320,116 L300,102 L288,86 Z',
    NL: 'M272,56 L288,54 L296,68 L282,72 Z',
    BE: 'M272,74 L288,70 L298,84 L286,92 Z',
    CH: 'M298,116 L320,108 L340,118 L330,134 L312,130 Z',
    AT: 'M344,110 L372,104 L384,124 L366,132 L348,126 Z',
    IT: 'M330,134 L354,124 L372,132 L364,170 L344,196 L326,170 L322,148 Z',
    DK: 'M296,34 L318,30 L326,44 L310,50 Z',
    SE: 'M330,6 L352,4 L358,44 L340,56 L330,32 Z',
    NO: 'M318,4 L336,2 L340,34 L322,28 Z',
    FI: 'M352,8 L380,6 L388,40 L366,46 L356,26 Z',
    IE: 'M176,70 L188,66 L192,88 L178,92 Z',
    PL: 'M352,88 L384,80 L402,104 L390,132 L364,124 L352,106 Z',
    CZ: 'M372,118 L398,112 L404,132 L382,138 Z',
    SK: 'M402,132 L424,126 L430,146 L408,152 Z',
    HU: 'M408,152 L438,146 L444,170 L416,176 Z',
    RO: 'M430,174 L470,168 L478,196 L450,206 L430,192 Z',
    BG: 'M444,206 L482,198 L490,222 L458,232 Z',
    GR: 'M448,236 L474,228 L486,252 L466,276 L448,256 Z',
    HR: 'M404,168 L428,162 L430,184 L408,192 Z',
    SI: 'M398,154 L416,150 L418,164 L400,168 Z',
    EE: 'M356,44 L380,40 L384,66 L362,66 Z',
    LV: 'M372,66 L396,62 L400,88 L378,92 Z',
    LT: 'M386,90 L410,86 L414,110 L392,114 Z'
  };

  const COLORS = {
    none: '#1E1E28',
    low: '#143D4F',
    medium: '#176B87',
    high: '#0E9BB8',
    'very-high': '#34D399'
  };

  // Active (colored) vs inactive (dim) stroke.
  const ACTIVE_STROKE = '#2A2A35';
  const INACTIVE_STROKE = '#1A1A22';

  const NAMES = {
    GB: 'United Kingdom', FR: 'France', ES: 'Spain', PT: 'Portugal',
    DE: 'Germany', NL: 'Netherlands', BE: 'Belgium', CH: 'Switzerland',
    AT: 'Austria', IT: 'Italy', DK: 'Denmark', SE: 'Sweden', NO: 'Norway',
    FI: 'Finland', IE: 'Ireland', PL: 'Poland', CZ: 'Czechia', SK: 'Slovakia',
    HU: 'Hungary', RO: 'Romania', BG: 'Bulgaria', GR: 'Greece', HR: 'Croatia',
    SI: 'Slovenia', EE: 'Estonia', LV: 'Latvia', LT: 'Lithuania'
  };

  function countryName(code) {
    return NAMES[code] || code;
  }

  /** Build an SVG map element from activity data. */
  function buildSvg(activityData) {
    const byCode = {};
    (activityData && activityData.countries || []).forEach(function (c) {
      byCode[c.code] = c;
    });

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 640 480');
    svg.setAttribute('class', 'community-map-svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'NullSec community activity map of Europe');

    // Background
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', '640');
    bg.setAttribute('height', '480');
    bg.setAttribute('fill', 'var(--bg-card)');
    bg.setAttribute('rx', '12');
    svg.appendChild(bg);

    Object.keys(PATHS).forEach(function (code) {
      const d = PATHS[code];
      const info = byCode[code] || { activity_level: 'none', missions_available: 0, completed: 0 };
      const level = info.activity_level || 'none';
      const fill = COLORS[level] || COLORS.none;
      const active = info.active !== false; // default active when known
      const stroke = active ? ACTIVE_STROKE : INACTIVE_STROKE;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', fill);
      path.setAttribute('stroke', stroke);
      path.setAttribute('stroke-width', '1');
      path.setAttribute('data-country', code);
      path.setAttribute('data-level', level);
      path.setAttribute('data-missions', String(info.missions_available || 0));
      path.setAttribute('data-completed', String(info.completed || 0));
      path.setAttribute('class', 'community-map-country' + (active ? ' active' : ' inactive'));
      // Accessibility label (hover / screen reader).
      path.setAttribute('role', 'img');
      path.setAttribute('aria-label', countryName(code) + ': ' +
        level + ' activity, ' + (info.missions_available || 0) + ' missions, ' +
        (info.completed || 0) + ' completed');

      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = countryName(code) + ' — ' +
        (level === 'none' ? 'no recorded activity' : level) +
        ' · missions: ' + (info.missions_available || 0) +
        ' · completed: ' + (info.completed || 0);
      path.appendChild(title);

      svg.appendChild(path);
    });

    // Legend appended as an SVG group (privacy-safe, no external assets).
    const legend = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    legend.setAttribute('class', 'community-map-legend');
    legend.setAttribute('transform', 'translate(10, 440)');
    legend.setAttribute('aria-label', 'Legend: low, medium, high, very high activity');
    ['low', 'medium', 'high', 'very-high'].forEach(function (lvl, i) {
      const x = 8 + i * 34;
      const sw = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      sw.setAttribute('x', String(x));
      sw.setAttribute('y', '4');
      sw.setAttribute('width', '10');
      sw.setAttribute('height', '10');
      sw.setAttribute('rx', '2');
      sw.setAttribute('fill', COLORS[lvl]);
      legend.appendChild(sw);
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(x));
      label.setAttribute('y', '24');
      label.setAttribute('font-size', '9');
      label.setAttribute('fill', '#9CA3AF');
      label.textContent = lvl;
      legend.appendChild(label);
    });
    svg.appendChild(legend);

    return svg;
  }

  /** Render the map into a container element. */
  function render(container, activityData) {
    if (!container) return;
    while (container.firstChild) container.removeChild(container.firstChild);
    container.appendChild(buildSvg(activityData));
  }

  /** Clear the container. */
  function destroy(container) {
    if (!container) return;
    while (container.firstChild) container.removeChild(container.firstChild);
  }

  window.CommunityMap = {
    render: render,
    destroy: destroy,
    paths: PATHS
  };
})();
