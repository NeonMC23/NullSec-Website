/**
 * NullSec — Community page module
 * ------------------------------------------------------------------
 * Renders the anonymous community movement overview: global impact,
 * active countries, mission activity, Europe map, and a privacy notice.
 * DOM-safe rendering, no inline scripts, offline-first (falls back to an
 * empty/privacy-safe state when the backend is disabled).
 */
(function () {
  'use strict';

  function renderGlobalStats() {
    let container = document.getElementById('community-stats');
    if (!container) return;

    Utils.clear(container);
    container.appendChild(Utils.el('p', {
      style: 'color:var(--text-dim);padding:12px 0;',
      text: 'Loading community statistics…'
    }));

    CommunityMetrics.getGlobal().then(function (g) {
      Utils.clear(container);

      // Only display available values; unavailable → "Unavailable".
      function display(v) {
        return (v === null || v === undefined) ? 'Unavailable' : String(v);
      }
      function stat(label, value) {
        let card = Utils.el('div', { class: 'community-stat' });
        card.appendChild(Utils.el('strong', { text: display(value) }));
        card.appendChild(Utils.el('span', { text: label }));
        return card;
      }

      let grid = Utils.el('div', { class: 'community-stats-grid' });
      grid.appendChild(stat('Countries represented', g.activeCountries));
      grid.appendChild(stat('Total missions completed', g.completedMissions));
      grid.appendChild(stat('Tools used', g.availableToolsUsed));
      grid.appendChild(stat('Community actions', g.communityActions));
      grid.appendChild(stat('Community propagation', g.communityPropagation));
      grid.appendChild(stat('Active regions', g.activeRegions));
      container.appendChild(grid);
    }).catch(function () {
      Utils.clear(container);
      container.appendChild(Utils.el('p', {
        style: 'color:var(--text-dim);',
        text: 'Community statistics are unavailable offline.'
      }));
    });
  }

  function renderTopRegions() {
    let container = document.getElementById('community-regions');
    if (!container) return;

    Community.getGlobalStats().then(function (s) {
      Utils.clear(container);
      if (!s.top_regions || !s.top_regions.length) {
        container.appendChild(Utils.el('p', {
          style: 'color:var(--text-dim);',
          text: 'No region data available yet.'
        }));
        return;
      }
      let list = Utils.el('div', { class: 'community-regions-list' });
      s.top_regions.forEach(function (r) {
        let row = Utils.el('div', { class: 'community-region-row' });
        row.appendChild(Utils.el('span', { text: r.region + ' · ' + r.code }));
        row.appendChild(Utils.el('span', { text: r.completed + ' completed' }));
        list.appendChild(row);
      });
      container.appendChild(list);
    }).catch(function () {
      Utils.clear(container);
      container.appendChild(Utils.el('p', {
        style: 'color:var(--text-dim);',
        text: 'No region data available offline.'
      }));
    });
  }

  let europeData = { countries: {}, source: 'unavailable', unavailable: true };
  let europeSvg = null;
  let selectedCountry = null;

  /** Show the aggregated info panel for a country (no individual data). */
  function renderCountryPanel(code) {
    let panel = document.getElementById('europe-country-panel');
    if (!panel) return;
    Utils.clear(panel);

    selectedCountry = code || null;
    if (europeSvg) EuropeMap.setSelected(europeSvg, selectedCountry);

    if (!code || europeData.unavailable) {
      panel.style.display = 'none';
      return;
    }
    const row = europeData.countries[code];
    const ref = CountryMetrics.getCountry(code);
    if (!row) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = 'block';
    panel.appendChild(Utils.el('h4', { text: (ref && ref.name) || code }));

    function metric(label, value) {
      let m = Utils.el('div', { class: 'metric' });
      m.appendChild(Utils.el('span', { text: label }));
      // null = "Unavailable" (not yet measured); 0 = a real zero. Never confuse.
      m.appendChild(Utils.el('strong', { text: value === null ? 'Unavailable' : String(value) }));
      return m;
    }

    // Human-readable activity level label (from the same intensity bucket).
    const levelLabel = activityLevelLabel(CountryMetrics.intensity(row.totalActivity));
    panel.appendChild(metric('Activity level', levelLabel));
    panel.appendChild(metric('Total activity', row.totalActivity));
    panel.appendChild(metric('Missions completed', row.missionActivity));
    panel.appendChild(metric('Tools used', row.toolActivity));
    panel.appendChild(metric('Community contributions', row.communityActivity));
    panel.appendChild(metric('Participants', row.participants));
  }

  /** Map an intensity class to a human-readable label. */
  function activityLevelLabel(cls) {
    const map = {
      none: 'No activity',
      'very-low': 'Very low',
      low: 'Low',
      medium: 'Medium',
      high: 'High',
      'very-high': 'Very high'
    };
    return map[cls] || 'Unavailable';
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

    container.appendChild(Utils.el('p', {
      style: 'color:var(--text-dim);padding:12px 0;',
      text: 'Loading map…'
    }));

    CountryMetrics.getData().then(function (data) {
      europeData = data;
      Utils.clear(container);
      renderLastUpdate(data);

      if (data.unavailable) {
        container.appendChild(Utils.el('p', {
          class: 'europe-map-empty',
          text: 'Activity data unavailable'
        }));
        return;
      }
      // Render the SVG map once, then apply the aggregated activity.
      if (!europeSvg) {
        europeSvg = EuropeMap.render(container, {
          onSelect: renderCountryPanel,
          onHover: function (code) {
            if (!code) { renderCountryPanel(code); }
          }
        });
        container.appendChild(buildLegend());
      }
      EuropeMap.applyActivity(europeSvg, data);
    }).catch(function () {
      Utils.clear(container);
      container.appendChild(Utils.el('p', {
        class: 'europe-map-empty',
        text: 'Activity data unavailable'
      }));
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

  function renderMissionActivity() {
    let container = document.getElementById('community-missions');
    if (!container) return;

    container.appendChild(Utils.el('p', {
      style: 'color:var(--text-dim);padding:12px 0;',
      text: 'Loading mission activity…'
    }));

    Community.getMissionActivity().then(function (data) {
      Utils.clear(container);
      let list = data.countries || [];
      if (!list.length) {
        container.appendChild(Utils.el('p', {
          style: 'color:var(--text-dim);',
          text: 'No mission activity data available yet.'
        }));
        return;
      }
      let rows = Utils.el('div', { class: 'community-regions-list' });
      list.forEach(function (c) {
        let row = Utils.el('div', { class: 'community-region-row' });
        let left = Utils.el('span', {});
        left.appendChild(Utils.el('span', { class: 'country-flag-badge', text: c.country }));
        left.appendChild(Utils.el('span', { text: ' ' + c.country + ' · ' + c.missions_available + ' missions' }));
        row.appendChild(left);
        row.appendChild(Utils.el('span', { text: c.completed + ' completed' }));
        rows.appendChild(row);
      });
      container.appendChild(rows);
    }).catch(function () {
      Utils.clear(container);
      container.appendChild(Utils.el('p', {
        style: 'color:var(--text-dim);',
        text: 'Mission activity is unavailable offline.'
      }));
    });
  }

  function renderChallenges() {
    let container = document.getElementById('community-challenges');
    if (!container) return;

    container.appendChild(Utils.el('p', {
      style: 'color:var(--text-dim);padding:12px 0;',
      text: 'Loading challenges…'
    }));

    Challenges.getActive().then(function (list) {
      Utils.clear(container);
      if (!list.length) {
        container.appendChild(Utils.el('p', {
          style: 'color:var(--text-dim);',
          text: 'No active challenges right now.'
        }));
        return;
      }
      let grid = Utils.el('div', { class: 'community-challenges-grid' });
      list.forEach(function (ch) {
        let card = Utils.el('div', { class: 'challenge-card' });
        card.appendChild(Utils.el('h3', { text: ch.title }));
        card.appendChild(Utils.el('p', { text: ch.description || '' }));
        let pct = ch.target_value > 0 ? Math.round((ch.current_value / ch.target_value) * 100) : 0;
        let bar = Utils.el('div', { class: 'challenge-progress' });
        bar.appendChild(Utils.el('div', { class: 'challenge-progress-fill', style: 'width:' + pct + '%' }));
        card.appendChild(bar);
        card.appendChild(Utils.el('span', {
          class: 'challenge-count',
          text: ch.current_value + ' / ' + ch.target_value
        }));
        grid.appendChild(card);
      });
      container.appendChild(grid);
    }).catch(function () {
      Utils.clear(container);
      container.appendChild(Utils.el('p', {
        style: 'color:var(--text-dim);',
        text: 'Challenges are unavailable offline.'
      }));
    });
  }

  function renderRanking() {
    let container = document.getElementById('community-ranking');
    if (!container) return;

    container.appendChild(Utils.el('p', {
      style: 'color:var(--text-dim);padding:12px 0;',
      text: 'Loading country activity…'
    }));

    // The ranking derives from the SAME normalized dataset as the map — no
    // second data source. If the map data is unavailable, show the empty state.
    if (!europeData || europeData.unavailable) {
      Utils.clear(container);
      container.appendChild(Utils.el('p', {
        style: 'color:var(--text-dim);',
        text: 'Country activity is unavailable offline.'
      }));
      return;
    }

    // Same normalized dataset as the map — no second source. Null total is
    // "Unavailable" (unmeasured), sorted after measured countries.
    const rows = Object.keys(europeData.countries)
      .map(function (code) {
        const row = europeData.countries[code];
        const ref = CountryMetrics.getCountry(code);
        return { code: code, name: (ref && ref.name) || code, total: row.totalActivity };
      })
      .sort(function (a, b) {
        const an = (a.total === null || a.total === undefined) ? -1 : a.total;
        const bn = (b.total === null || b.total === undefined) ? -1 : b.total;
        return bn - an;
      });

    Utils.clear(container);
    if (!rows.length) {
      container.appendChild(Utils.el('p', {
        style: 'color:var(--text-dim);',
        text: 'No country activity yet.'
      }));
      return;
    }

    let list = Utils.el('div', { class: 'community-regions-list' });
    rows.forEach(function (c, idx) {
      const unavailable = c.total === null || c.total === undefined;
      let row = Utils.el('div', {
        class: 'community-region-row ranking-row' +
          (selectedCountry === c.code ? ' selected' : '') +
          (unavailable ? ' unavailable' : '')
      });
      row.setAttribute('tabindex', '0');
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', c.name + ' — view aggregated activity');
      let left = Utils.el('span', {});
      left.appendChild(Utils.el('span', { class: 'ranking-rank', text: String(idx + 1) + '.' }));
      left.appendChild(Utils.el('span', { text: ' ' + c.name }));
      row.appendChild(left);
      // Distinguish "Unavailable" from a real 0.
      row.appendChild(Utils.el('span', { text: unavailable ? 'Unavailable' : c.total + ' activity' }));
      // Clicking a ranking row syncs the map panel selection.
      row.addEventListener('click', function () { renderCountryPanel(c.code); });
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); renderCountryPanel(c.code); }
      });
      list.appendChild(row);
    });
    container.appendChild(list);
  }

  /** Show the authenticated user's participation status (no public user list). */
  function renderParticipation() {
    let container = document.getElementById('community-participation');
    if (!container) return;
    Utils.clear(container);

    // If not authenticated (no country context), show a neutral prompt.
    if (!window.Auth || !Auth.isAuthenticated()) {
      container.appendChild(Utils.el('p', {
        class: 'community-participation',
        text: 'Sign in and choose your country to contribute to regional statistics.'
      }));
      return;
    }

    // Only show the selection prompt when Supabase is available (no fabricated
    // state when offline).
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
        text: 'Your contribution helps represent ' + countryName + ' in regional statistics.'
      }));
    } else {
      container.appendChild(Utils.el('p', {
        class: 'community-participation',
        text: 'Choose your country to participate in regional statistics.'
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
        // Never display "recorded" unless the backend confirmed success.
        if (res.ok && res.state === 'SUCCESS') {
          status.textContent = 'Activity recorded.';
        } else if (res.state === 'OFFLINE') {
          status.textContent = 'Activity unavailable (offline).';
        } else if (res.state === 'NOT_AUTHENTICATED') {
          status.textContent = 'Sign in to contribute.';
        } else if (res.state === 'UNAVAILABLE') {
          status.textContent = 'Activity unavailable.';
        } else {
          status.textContent = 'Could not record the action.';
        }
      });
    });

    container.appendChild(card);
  }

  function renderOfflineNotice() {
    let container = document.getElementById('community-privacy');
    if (!container) return;
    container.appendChild(Utils.el('p', {
      class: 'community-privacy-note',
      text: 'Community statistics are aggregated and anonymous. No location, no IP, no tracking, no personal data is ever collected or exposed. Offline, you only see locally derived data.'
    }));
  }

  function init() {
    Community.init();
    renderGlobalStats();
    renderTopRegions();
    renderParticipation();
    renderMap();
    renderMissionActivity();
    renderChallenges();
    renderCommunityAction();
    renderOfflineNotice();
    // Ranking depends on the country data loaded by renderMap; wait for it.
    CountryMetrics.getData().then(function () {
      renderRanking();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
