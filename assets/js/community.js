/**
 * NullSec — Community page module (M35 refactor)
 * ------------------------------------------------------------------
 * Renders the aggregated community dashboard: overview metrics, country
 * activity (horizontal bars), activity breakdown (missions / tools /
 * community / propagation), an Europe map and a privacy notice.
 *
 * PRIVACY MODEL: this is NOT a social network. Users are never individually
 * visible. Individual identifiers and personal progression
 * must never appear here. All values come from AGGREGATED backend RPCs
 * (CountryMetrics / ns_country_metrics, CommunityMetrics / ns_metrics).
 * The frontend never aggregates from individual user records.
 *
 * DOM-safe rendering, no inline scripts, offline-first (falls back to an
 * empty/privacy-safe state when the backend is disabled).
 */
(function () {
  'use strict';

  /** Distinct metrics (aggregated) displayed in the Activity Breakdown. */
  const BREAKDOWN_METRICS = [
    { key: 'missionActivity', label: 'Missions' },
    { key: 'toolActivity', label: 'Tools' },
    { key: 'communityActivity', label: 'Community actions' },
    { key: 'propagation', label: 'Propagation' }
  ];

  /** Human-readable label for an unavailable value (never a fake 0). */
  function displayValue(v) {
    if (v === null || v === undefined) return 'Unavailable';
    return String(v);
  }

  /** Build a loading placeholder. */
  function loadingEl(text) {
    return Utils.el('p', { style: 'color:var(--text-dim);padding:12px 0;', text: text || 'Loading…' });
  }

  /** Build a clean empty state. */
  function emptyEl(text) {
    return Utils.el('p', { style: 'color:var(--text-dim);padding:12px 0;', text: text });
  }

  /** Build a clean error state (never replaces a backend failure with 0). */
  function errorEl(text) {
    return Utils.el('p', {
      style: 'color:var(--text-dim);padding:12px 0;',
      text: text || 'Community statistics unavailable. Please try again later.'
    });
  }

  /* ------------------------------------------------------------------
   * Community Overview (aggregated global metrics)
   * ---------------------------------------------------------------- */
  function renderOverview() {
    let container = document.getElementById('community-overview');
    if (!container) return;
    Utils.clear(container);
    container.appendChild(loadingEl('Loading community overview…'));

    // Source: aggregated RPC (ns_country_metrics via CountryMetrics).
    CountryMetrics.getData().then(function (data) {
      Utils.clear(container);
      if (data.unavailable) {
        container.appendChild(errorEl('Community statistics unavailable. Please try again later.'));
        return;
      }
      const rows = Object.keys(data.countries || {}).map(function (code) {
        return { code: code, row: data.countries[code] };
      });
      if (!rows.length) {
        container.appendChild(emptyEl('No community statistics yet.'));
        return;
      }

      function sum(key) {
        return rows.reduce(function (acc, r) {
          const v = r.row && r.row[key];
          return acc + ((typeof v === 'number' && isFinite(v)) ? v : 0);
        }, 0);
      }
      // Countries represented = countries with at least one participant.
      const countriesRepresented = rows.filter(function (r) {
        const p = r.row && r.row.participants;
        return typeof p === 'number' && p > 0;
      }).length;

      function stat(label, value) {
        let card = Utils.el('div', { class: 'community-stat' });
        card.appendChild(Utils.el('strong', { text: String(value) }));
        card.appendChild(Utils.el('span', { text: label }));
        return card;
      }

      let grid = Utils.el('div', { class: 'community-stats-grid' });
      grid.appendChild(stat('Total participants', sum('participants')));
      grid.appendChild(stat('Countries represented', countriesRepresented));
      grid.appendChild(stat('Missions completed', sum('missionActivity')));
      grid.appendChild(stat('Community activity', sum('communityActivity')));
      container.appendChild(grid);
    }).catch(function () {
      Utils.clear(container);
      container.appendChild(errorEl('Community statistics unavailable. Please try again later.'));
    });
  }

  /* ------------------------------------------------------------------
   * Country Activity (aggregated horizontal bars)
   * ---------------------------------------------------------------- */
  function renderCountryActivity() {
    let container = document.getElementById('country-activity');
    if (!container) return;
    Utils.clear(container);
    container.appendChild(loadingEl('Loading country activity…'));

    CountryMetrics.getData().then(function (data) {
      Utils.clear(container);
      if (data.unavailable) {
        container.appendChild(errorEl('Country activity unavailable. Please try again later.'));
        return;
      }
      const rows = Object.keys(data.countries || {}).map(function (code) {
        const row = data.countries[code];
        const ref = CountryMetrics.getCountry(code);
        return { code: code, name: (ref && ref.name) || code, total: row.totalActivity };
      }).filter(function (r) {
        return typeof r.total === 'number' && isFinite(r.total);
      }).sort(function (a, b) { return b.total - a.total; });

      if (!rows.length) {
        container.appendChild(emptyEl('No country activity yet.'));
        return;
      }
      const max = rows[0].total || 1;

      let list = Utils.el('div', { class: 'community-regions-list' });
      rows.forEach(function (r) {
        let row = Utils.el('div', { class: 'community-region-row activity-row' });
        let left = Utils.el('span', {});
        left.appendChild(Utils.el('span', { text: r.name }));
        row.appendChild(left);

        let barWrap = Utils.el('div', { class: 'activity-bar-wrap' });
        let bar = Utils.el('div', {
          class: 'activity-bar',
          style: 'width:' + Math.max(2, Math.round((r.total / max) * 100)) + '%'
        });
        barWrap.appendChild(bar);
        row.appendChild(barWrap);

        row.appendChild(Utils.el('span', { class: 'activity-bar-value', text: String(r.total) }));
        list.appendChild(row);
      });
      container.appendChild(list);
    }).catch(function () {
      Utils.clear(container);
      container.appendChild(errorEl('Country activity unavailable. Please try again later.'));
    });
  }

  /* ------------------------------------------------------------------
   * Activity Breakdown (aggregated by type)
   * ---------------------------------------------------------------- */
  function renderActivityBreakdown() {
    let container = document.getElementById('activity-breakdown');
    if (!container) return;
    Utils.clear(container);
    container.appendChild(loadingEl('Loading activity breakdown…'));

    CountryMetrics.getData().then(function (data) {
      Utils.clear(container);
      if (data.unavailable) {
        container.appendChild(errorEl('Activity breakdown unavailable. Please try again later.'));
        return;
      }
      const rows = Object.keys(data.countries || {}).map(function (code) {
        return data.countries[code];
      });
      if (!rows.length) {
        container.appendChild(emptyEl('No activity breakdown yet.'));
        return;
      }
      function sum(key) {
        return rows.reduce(function (acc, r) {
          const v = r && r[key];
          return acc + ((typeof v === 'number' && isFinite(v)) ? v : 0);
        }, 0);
      }

      let grid = Utils.el('div', { class: 'community-stats-grid' });
      BREAKDOWN_METRICS.forEach(function (m) {
        let card = Utils.el('div', { class: 'community-stat breakdown-stat' });
        card.appendChild(Utils.el('strong', { text: String(sum(m.key)) }));
        card.appendChild(Utils.el('span', { text: m.label }));
        grid.appendChild(card);
      });
      container.appendChild(grid);
    }).catch(function () {
      Utils.clear(container);
      container.appendChild(errorEl('Activity breakdown unavailable. Please try again later.'));
    });
  }

  /* ------------------------------------------------------------------
   * Europe map (aggregated, kept from the existing implementation)
   * ---------------------------------------------------------------- */
  let europeData = { countries: {}, source: 'unavailable', unavailable: true };
  let europeSvg = null;
  let selectedCountry = null;      // clicked/selected country (persists)
  let hoveredCountry = null;       // transient hover (does not clear selection)

  /** Show the aggregated info panel for a country (no individual data). */
  function renderCountryPanel(code, hovered) {
    let panel = document.getElementById('europe-country-panel');
    if (!panel) return;
    Utils.clear(panel);

    // A click persists the selection; a hover is transient.
    if (!hovered) selectedCountry = code || null;
    if (europeSvg) EuropeMap.setSelected(europeSvg, selectedCountry);

    if (europeData.unavailable) {
      panel.style.display = 'block';
      panel.appendChild(Utils.el('h4', { text: 'Europe Activity Map' }));
      panel.appendChild(Utils.el('p', {
        class: 'metric metric-panel-empty',
        text: 'Activity data is currently unavailable.'
      }));
      return;
    }

    const row = code ? europeData.countries[code] : null;
    const ref = CountryMetrics.getCountry(code);

    if (!code || !row) {
      // Persistent hint (not an empty/blank panel): show the last selection or a
      // neutral message so leaving the map never erases useful information.
      panel.style.display = 'block';
      panel.appendChild(Utils.el('h4', { text: selectedCountry ? ((CountryMetrics.getCountry(selectedCountry) || {}).name || selectedCountry) : 'Europe Activity Map' }));
      panel.appendChild(Utils.el('p', {
        class: 'metric metric-panel-empty',
        text: selectedCountry
          ? 'Hover or select a country to view its aggregated activity.'
          : 'Select a country on the map to view its aggregated activity.'
      }));
      return;
    }

    panel.style.display = 'block';
    const title = Utils.el('h4', {});
    title.appendChild(document.createTextNode((ref && ref.name) || code));
    if (hovered) title.appendChild(Utils.el('span', { class: 'panel-state', text: ' · hovered' }));
    else if (selectedCountry === code) title.appendChild(Utils.el('span', { class: 'panel-state', text: ' · selected' }));
    panel.appendChild(title);

    function metric(label, value) {
      let m = Utils.el('div', { class: 'metric' });
      m.appendChild(Utils.el('span', { text: label }));
      m.appendChild(Utils.el('strong', { text: displayValue(value) }));
      return m;
    }

    panel.appendChild(metric('Total activity', row.totalActivity));
    panel.appendChild(metric('Missions completed', row.missionActivity));
    panel.appendChild(metric('Tools used', row.toolActivity));
    panel.appendChild(metric('Community contributions', row.communityActivity));
    panel.appendChild(metric('Participants', row.participants));
  }

  /** Show the global (non-individual) last-update timestamp, or nothing. */
  function renderLastUpdate(data) {
    let el = document.getElementById('community-last-update');
    if (!el) return;
    Utils.clear(el);
    if (!data || data.unavailable || !data.lastUpdate) return;
    let d = new Date(data.lastUpdate);
    let label = !isNaN(d.getTime()) ? d.toLocaleString() : data.lastUpdate;
    el.appendChild(Utils.el('p', {
      class: 'community-last-update-label',
      text: 'Data last updated: ' + label
    }));
  }

  function renderMap() {
    let container = document.getElementById('community-map');
    if (!container) return;

    container.appendChild(loadingEl('Loading map…'));

    CountryMetrics.getData().then(function (data) {
      europeData = data;
      Utils.clear(container);
      renderLastUpdate(data);

      if (data.unavailable) {
        container.appendChild(Utils.el('p', { class: 'europe-map-empty', text: 'Activity data unavailable' }));
        return;
      }
      if (!europeSvg) {
        europeSvg = EuropeMap.render(container, {
          onSelect: renderCountryPanel,
          onHover: function (code) {
            // Hover updates the panel. On leave, fall back to the last selected
            // country (or show a "no selection" hint) instead of blanking it.
            hoveredCountry = code || null;
            if (code) {
              renderCountryPanel(code, true);
            } else {
              renderCountryPanel(selectedCountry, true);
            }
          },
          // M48: the real SVG loads asynchronously; apply activity once ready.
          onReady: function (svg) { EuropeMap.applyActivity(svg, europeData); },
          onError: function () {
            Utils.clear(container);
            container.appendChild(Utils.el('p', { class: 'europe-map-empty', text: 'Activity map could not be loaded.' }));
          }
        });
        container.appendChild(buildLegend());
      }
      EuropeMap.applyActivity(europeSvg, data);
      // M51: show a useful neutral state in the country panel from the start so
      // the map area does not appear as an unexplained empty box until hover.
      renderCountryPanel(null, true);
    }).catch(function () {
      Utils.clear(container);
      container.appendChild(Utils.el('p', { class: 'europe-map-empty', text: 'Activity data unavailable' }));
    });
  }

  /** A small legend for the intensity scale. */
  function buildLegend() {
    let legend = Utils.el('div', { class: 'europe-map-legend' });
    [
      ['none', 'None'], ['very-low', 'Very low'], ['low', 'Low'],
      ['medium', 'Medium'], ['high', 'High'], ['very-high', 'Very high']
    ].forEach(function (pair) {
      let item = Utils.el('span', {});
      item.appendChild(Utils.el('span', { class: 'swatch country--' + pair[0] }));
      item.appendChild(document.createTextNode(pair[1]));
      legend.appendChild(item);
    });
    return legend;
  }

  /** Show the authenticated user's participation status (no member directory). */
  function renderParticipation() {
    let container = document.getElementById('community-participation');
    if (!container) return;
    Utils.clear(container);

    if (!window.Auth || !Auth.isAuthenticated()) {
      container.appendChild(Utils.el('p', {
        class: 'community-participation',
        text: 'Sign in to contribute to regional statistics. Community data is always aggregated.'
      }));
      return;
    }
    if (!ApiClient.isBackendAvailable()) {
      container.appendChild(Utils.el('p', {
        class: 'community-participation',
        text: 'Backend unavailable — participation status cannot be shown right now.'
      }));
      return;
    }
    const st = CountryService.getState();
    const countryName = st.countryName;
    if (countryName) {
      container.appendChild(Utils.el('p', {
        class: 'community-participation ok',
        text: 'Your contribution helps represent ' + countryName + ' in aggregated regional statistics.'
      }));
    } else {
      container.appendChild(Utils.el('p', {
        class: 'community-participation',
        text: 'Choose your country to participate in aggregated regional statistics.'
      }));
    }
  }

  /** Explicit community-action UI. User-intent only; never automatic. */
  function renderCommunityAction() {
    let container = document.getElementById('community-action');
    if (!container) return;
    Utils.clear(container);

    let card = Utils.el('div', { class: 'community-action-card' });
    card.appendChild(Utils.el('h4', { text: 'Mark a contribution completed' }));
    card.appendChild(Utils.el('p', {
      class: 'community-action-hint',
      text: 'This records an anonymous, aggregated community event. It is never automatic and never contains personal data.'
    }));

    let btn = Utils.el('button', { class: 'btn btn-primary', text: 'Mark contribution completed' });
    let status = Utils.el('span', { class: 'community-action-status', text: '' });
    card.appendChild(btn);
    card.appendChild(status);

    btn.addEventListener('click', function () {
      if (!window.CommunityActionService) { status.textContent = 'Unavailable'; return; }
      btn.disabled = true;
      status.textContent = '…';
      CommunityActionService.record('contribution_done').then(function (res) {
        btn.disabled = false;
        if (res.ok && res.state === 'SUCCESS') status.textContent = 'Activity recorded.';
        else if (res.state === 'OFFLINE') status.textContent = 'Activity unavailable (offline).';
        else if (res.state === 'NOT_AUTHENTICATED') status.textContent = 'Sign in to contribute.';
        else if (res.state === 'UNAVAILABLE') status.textContent = 'Activity unavailable.';
        else status.textContent = 'Could not record the action.';
      });
    });

    container.appendChild(card);
  }

  function renderPrivacyNote() {
    let container = document.getElementById('community-privacy');
    if (!container) return;
    Utils.clear(container);
    container.appendChild(Utils.el('p', {
      class: 'community-privacy-note',
      text: 'Community statistics are aggregated and anonymous. No individual accounts, public identifiers or personal progression are shown. No location, no IP, no tracking.'
    }));
  }

  function init() {
    Community.init();
    renderOverview();
    renderCountryActivity();
    renderActivityBreakdown();
    renderParticipation();
    renderMap();
    renderCommunityAction();
    renderPrivacyNote();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
