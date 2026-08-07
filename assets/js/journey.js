/**
 * NullSec — Learning Journey V2
 * Interactive mission system with modal detail view.
 *
 * Data source: /data/missions.json (fetched at runtime).
 * State source: Progress service (see docs/progress-schema.md).
 *
 * Exposes a shared API (window.Journey) so the homepage and the journey
 * page consume the same mission data, weekly-mission state and toggling.
 */
(function () {
  'use strict';

  let MISSIONS = [];
  let READY = false;
  let readyCallbacks = [];

  let stages = [
    { num: 1, name: 'Getting Started', count: 0 },
    { num: 2, name: 'Build Better Habits', count: 0 },
    { num: 3, name: 'Take Back Control', count: 0 },
    { num: 4, name: 'Advanced', count: 0 }
  ];

  /* ------------------------------------------------------------------
   * Data loading
   * ---------------------------------------------------------------- */
  function loadMissions() {
    Data.loadMissions()
      .then(function (data) {
        MISSIONS = data;
        populateCategorySelect();
        finishLoad();
        renderAll();
      })
      .catch(function (err) {
        console.error('Failed to load missions:', err);
        MISSIONS = [];
        finishLoad();
        let el = document.getElementById('progress-overview');
        if (el) {
          Utils.clear(el);
          el.appendChild(Utils.el('div', {
            style: 'text-align:center;padding:24px;color:var(--text-dim);',
            text: 'Could not load the Learning Journey. Please refresh to try again.'
          }));
        }
      });
  }

  /** Signal readiness and run any queued callbacks (e.g. homepage). */
  function finishLoad() {
    READY = true;
    let cbs = readyCallbacks;
    readyCallbacks = [];
    cbs.forEach(function (fn) { try { fn(); } catch (e) { /* isolated */ } });
  }

  /* ------------------------------------------------------------------
   * Progress / state (delegated to the Progress service)
   * ---------------------------------------------------------------- */
  function isCompleted(id) {
    return Progress.isCompleted(id);
  }

  function isWeeklyDone() {
    return Progress.isCompleted('weekly-community');
  }

  function toggleMission(id) {
    const wasCompleted = Progress.isCompleted(id);
    if (wasCompleted) Progress.uncomplete(id);
    else Progress.complete(id);
    renderAll();
    // M25: after successful LOCAL completion, trigger an anonymous community
    // activity event via the service layer (backend resolves the country).
    // Never fabricated success; offline is a no-op. Never sent on uncomplete.
    if (!wasCompleted && window.ActivityService) {
      ActivityService.record('mission_completed', 1);
    }
  }

  /** Number of completed stage missions (excluding the weekly one). */
  function completedCount() {
    let missions = Progress.get().missions;
    let n = 0;
    Object.keys(missions).forEach(function (id) {
      if (missions[id] && missions[id].completed) n++;
    });
    return n;
  }

  /* ------------------------------------------------------------------
   * Rendering helpers (DOM-based, textContent for safety)
   * ---------------------------------------------------------------- */
  function renderStars(n) {
    let wrap = Utils.el('span', { class: 'difficulty' });
    for (let i = 0; i < 5; i++) {
      wrap.appendChild(Utils.el('span', { class: 'star' + (i < n ? ' filled' : ''), text: '\u2605' }));
    }
    return wrap;
  }

  function renderImpact(n) {
    let wrap = Utils.el('span', { class: 'impact' });
    for (let i = 0; i < 5; i++) {
      wrap.appendChild(Utils.el('span', { class: 'impact-dot' + (i < n ? ' filled' : '') }));
    }
    return wrap;
  }

  /* ------------------------------------------------------------------
   * Modal (DOM-built content; mission.guide is trusted first-party HTML)
   * ---------------------------------------------------------------- */
  window.openMissionModal = function (id) {
    let mission = MISSIONS.find(function (m) { return m.id === id; });
    if (!mission) return;

    let done = isCompleted(id);

    let header = Utils.el('div', { style: 'display:flex;align-items:center;gap:12px;margin-bottom:12px;' });
    header.appendChild(Utils.el('span', { style: 'font-size:2rem;', text: mission.icon }));
    header.appendChild(Utils.el('h2', { style: 'margin:0;', text: mission.title }));

    let tags = Utils.el('div', { class: 'modal-sub', style: 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;' });
    let timeTag = Utils.el('span', {
      class: 'tldr-tag',
      style: 'display:inline-flex;align-items:center;gap:4px;padding:3px 10px;font-size:0.6875rem;font-weight:500;background:var(--accent-subtle);color:var(--accent);border-radius:100px;'
    });
    timeTag.appendChild(document.createTextNode('\u23f0 '));
    timeTag.appendChild(Utils.el('span', { text: mission.time }));
    tags.appendChild(timeTag);

    // Difficulty stars
    let diffTag = Utils.el('span', {
      class: 'tldr-tag',
      style: 'display:inline-flex;align-items:center;gap:4px;padding:3px 10px;font-size:0.6875rem;font-weight:500;background:rgba(251,191,36,0.12);color:#FBBF24;border-radius:100px;'
    });
    diffTag.appendChild(document.createTextNode('Difficulty: '));
    for (let i = 0; i < 5; i++) {
      diffTag.appendChild(Utils.el('span', {
        style: 'color:' + (i < mission.difficulty ? '#FBBF24' : '#3A3A45') + ';font-size:0.875rem;',
        text: '\u2605'
      }));
    }
    tags.appendChild(diffTag);

    // Impact dots
    let impTag = Utils.el('span', {
      class: 'tldr-tag',
      style: 'display:inline-flex;align-items:center;gap:4px;padding:3px 10px;font-size:0.6875rem;font-weight:500;background:rgba(255,79,163,0.12);color:var(--accent);border-radius:100px;'
    });
    impTag.appendChild(document.createTextNode('Impact: '));
    let dotsWrap = Utils.el('span', { style: 'display:inline-flex;gap:4px;align-items:center;' });
    for (let j = 0; j < 5; j++) {
      dotsWrap.appendChild(Utils.el('span', {
        style: 'display:inline-block;width:10px;height:10px;border-radius:50%;background:' +
          (j < mission.impact ? 'var(--accent)' : 'var(--bg-elevated)') +
          ';border:' + (j < mission.impact ? 'none' : '1px solid var(--border)') + ';'
      }));
    }
    impTag.appendChild(dotsWrap);
    tags.appendChild(impTag);

    // Category tag (from the mission data model)
    if (mission.category) {
      let catTag = Utils.el('span', {
        class: 'tldr-tag',
        style: 'display:inline-flex;align-items:center;gap:4px;padding:3px 10px;font-size:0.6875rem;font-weight:500;background:rgba(52,211,153,0.12);color:#34D399;border-radius:100px;',
        text: mission.category
      });
      tags.appendChild(catTag);
    }

    // Geographic availability tag (region + optional country)
    let geoLabel = (mission.region || 'Europe');
    if (mission.country) geoLabel += ' · ' + mission.country;
    let geoTag = Utils.el('span', {
      class: 'tldr-tag',
      style: 'display:inline-flex;align-items:center;gap:4px;padding:3px 10px;font-size:0.6875rem;font-weight:500;background:var(--accent-subtle);color:var(--accent);border-radius:100px;',
      text: geoLabel
    });
    tags.appendChild(geoTag);

    // Guide body — see renderGuide() for format compatibility handling.
    let body = Utils.el('div', { class: 'modal-body' });
    body.appendChild(renderGuide(mission.guide));

    // Global impact figure (anonymous aggregate — never per-user/per-mission).
    // Offline or backend-disabled → hidden/em-dash.
    let impactMeta = Utils.el('div', { class: 'mission-global-impact' });
    impactMeta.appendChild(Utils.el('span', { class: 'mission-global-label', text: 'Missions completed worldwide (anonymous)' }));
    let impactCount = Utils.el('span', { class: 'mission-global-count', text: '—' });
    impactMeta.appendChild(impactCount);
    body.appendChild(impactMeta);
    if (window.Community && Community.isOnline()) {
      Community.getGlobalStats().then(function (s) {
        impactCount.textContent = String(s.completed_missions || 0);
      }).catch(function () {
        impactCount.textContent = '—';
      });
    } else {
      impactCount.textContent = '—';
    }
    body.appendChild(renderGuide(mission.guide));

    let actions = Utils.el('div', { class: 'modal-actions' });
    let completeBtn = Utils.el('button', {
      class: 'btn ' + (done ? 'btn-secondary' : 'btn-primary'),
      text: done ? '\u2713 Mark incomplete' : 'Mark as complete'
    });
    completeBtn.addEventListener('click', function () { completeFromModal(id); });
    let closeBtn = Utils.el('button', { class: 'btn btn-secondary', text: 'Close' });
    closeBtn.addEventListener('click', function () { Modal.close(); });
    actions.appendChild(completeBtn);
    actions.appendChild(closeBtn);

    let content = Utils.el('div', {});
    content.appendChild(header);
    content.appendChild(tags);
    content.appendChild(body);
    content.appendChild(actions);

    Modal.open(content);
  };

  function completeFromModal(id) {
    toggleMission(id);
    Modal.close();
  }

  /* ------------------------------------------------------------------
   * Guide rendering — compatibility for a future structured model.
   *
   * Current data format: `guide` is a trusted first-party HTML string.
   * Future format (V2): `guide` may become `{ type, id }` or an array of
   * blocks. This function handles both gracefully so legacy content keeps
   * working unchanged while the safer model can be adopted later.
   * ---------------------------------------------------------------- */
  function renderGuide(guide) {
    let wrap = document.createElement('div');

    if (typeof guide === 'string') {
      // Legacy: trusted first-party HTML (see docs/data-schema.md §1).
      wrap.innerHTML = guide;
      return wrap;
    }

    if (Array.isArray(guide)) {
      // Future: array of blocks. Each block rendered as safe text/HTML.
      guide.forEach(function (block) {
        if (!block || typeof block !== 'object') return;
        if (block.text !== undefined) {
          wrap.appendChild(Utils.el('p', { text: block.text }));
        } else if (block.html !== undefined) {
          // trusted structured HTML
          let d = document.createElement('div');
          d.innerHTML = block.html;
          wrap.appendChild(d);
        } else if (block.type && block.id) {
          // Referenced content (e.g. {type:'article', id:'firefox-guide'})
          wrap.appendChild(Utils.el('p', {
            class: 'guide-ref',
            text: 'See ' + block.type + ': ' + block.id
          }));
        }
      });
      return wrap;
    }

    if (guide && typeof guide === 'object' && guide.type && guide.id) {
      wrap.appendChild(Utils.el('p', {
        class: 'guide-ref',
        text: 'See ' + guide.type + ': ' + guide.id
      }));
      return wrap;
    }

    wrap.appendChild(Utils.el('p', { text: '' }));
    return wrap;
  }

  /* ------------------------------------------------------------------
   * Mission card rendering + click delegation
   * ---------------------------------------------------------------- */
  function renderMission(m) {
    let done = isCompleted(m.id);
    let card = Utils.el('div', { class: 'mission-card' + (done ? ' completed' : ''), dataset: { missionId: m.id } });
    let h4 = Utils.el('h4', {});
    h4.appendChild(document.createTextNode(m.icon + ' '));
    h4.appendChild(document.createTextNode(m.title));
    card.appendChild(h4);
    card.appendChild(Utils.el('p', { text: m.desc }));
    let meta = Utils.el('div', { class: 'mission-meta' });
    let timeTag = Utils.el('span', { class: 'tag' });
    timeTag.appendChild(document.createTextNode('\u23f0 '));
    timeTag.appendChild(Utils.el('span', { text: m.time }));
    meta.appendChild(timeTag);
    meta.appendChild(renderStars(m.difficulty));
    meta.appendChild(renderImpact(m.impact));
    card.appendChild(meta);
    return card;
  }

  function bindMissionCards() {
    document.addEventListener('click', function (e) {
      let card = e.target.closest ? e.target.closest('.mission-card[data-mission-id]') : null;
      if (card) {
        window.openMissionModal(card.getAttribute('data-mission-id'));
      }
    });
  }

  /* ------------------------------------------------------------------
   * Full render (journey page)
   * ---------------------------------------------------------------- */
  function renderAll() {
    let total = MISSIONS.length;
    let done = completedCount() + (isWeeklyDone() ? 1 : 0);
    let pct = total > 0 ? Math.round((done / total) * 100) : 0;

    let progressEl = document.getElementById('progress-overview');
    if (progressEl) {
      Utils.clear(progressEl);
      let label = Utils.el('div', { class: 'progress-label', text: 'Your progress ' });
      label.appendChild(Utils.el('span', {
        style: 'font-size:0.75rem;color:var(--text-dim);font-weight:400;',
        text: '(stored locally, no account needed)'
      }));
      let barTrack = Utils.el('div', { class: 'progress-bar-track' });
      barTrack.appendChild(Utils.el('div', {
        class: 'progress-bar-fill',
        style: 'width:' + pct + '%'
      }));
      let percent = Utils.el('div', { class: 'progress-percent', text: pct + '%' });
      let stats = Utils.el('div', { class: 'progress-stats' });

      function statEl(n, labelTxt) {
        let s = Utils.el('div', { class: 'stat' });
        s.appendChild(Utils.el('strong', { text: n }));
        s.appendChild(Utils.el('span', { class: 'stat-label', text: labelTxt }));
        return s;
      }

      stats.appendChild(statEl(done, 'done'));
      stats.appendChild(Utils.el('div', { class: 'stat-divider' }));
      stats.appendChild(statEl(total - done, 'left'));
      stats.appendChild(Utils.el('div', { class: 'stat-divider' }));
      stats.appendChild(statEl(total, 'missions'));

      progressEl.appendChild(label);
      progressEl.appendChild(percent);
      progressEl.appendChild(barTrack);
      progressEl.appendChild(stats);
    }

    let weeklyGridEl = document.getElementById('weekly-mission-grid');
    if (weeklyGridEl) {
      let weeklyMission = MISSIONS.find(function (m) { return m.id === 'weekly-community'; });
      if (weeklyMission) {
        Utils.clear(weeklyGridEl);
        weeklyGridEl.appendChild(renderMission(weeklyMission));
      }
    }

    stages.forEach(function (stage) {
      let grid = document.querySelector('.missions-grid[data-stage="' + stage.num + '"]');
      if (!grid) return;
      let stageMissions = MISSIONS.filter(function (m) {
        return m.stage === stage.num && matchesFilters(m);
      });
      Utils.clear(grid);
      if (!stageMissions.length) {
        grid.appendChild(Utils.el('p', {
          style: 'color:var(--text-dim);padding:12px;text-align:center;grid-column:1/-1;',
          text: 'No missions match the current filters.'
        }));
        return;
      }
      stageMissions.forEach(function (m) { grid.appendChild(renderMission(m)); });
    });
  }

  /* ------------------------------------------------------------------
   * Mission discovery filters
   * ---------------------------------------------------------------- */
  let filterState = { query: '', region: '', category: '', difficulty: '', status: '' };

  function matchesFilters(m) {
    if (filterState.query) {
      const q = filterState.query.toLowerCase();
      const hay = ((m.title || '') + ' ' + (m.desc || '') + ' ' + (m.category || '')).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    if (filterState.region && (m.region || 'Europe').toLowerCase() !== filterState.region.toLowerCase()) return false;
    if (filterState.category && (m.category || 'General').toLowerCase() !== filterState.category.toLowerCase()) return false;
    if (filterState.difficulty !== '' && Number(m.difficulty) !== Number(filterState.difficulty)) return false;
    if (filterState.status && (m.status || 'active').toLowerCase() !== filterState.status.toLowerCase()) return false;
    return true;
  }

  function populateCategorySelect() {
    const sel = document.getElementById('mf-category');
    if (!sel) return;
    const cats = [];
    MISSIONS.forEach(function (m) { if (m.category && cats.indexOf(m.category) === -1) cats.push(m.category); });
    cats.sort();
    let html = '<option value="">All categories</option>';
    cats.forEach(function (c) { html += '<option value="' + c + '">' + c + '</option>'; });
    sel.innerHTML = html;
  }

  function bindFilters() {
    const q = document.getElementById('mf-query');
    const region = document.getElementById('mf-region');
    const category = document.getElementById('mf-category');
    const difficulty = document.getElementById('mf-difficulty');
    const status = document.getElementById('mf-status');
    const reset = document.getElementById('mf-reset');

    function onFilter() {
      filterState.query = q ? q.value : '';
      filterState.region = region ? region.value : '';
      filterState.category = category ? category.value : '';
      filterState.difficulty = difficulty ? difficulty.value : '';
      filterState.status = status ? status.value : '';
      renderAll();
    }

    if (q) q.addEventListener('input', Utils.debounce(onFilter, 150));
    if (region) region.addEventListener('change', onFilter);
    if (category) category.addEventListener('change', onFilter);
    if (difficulty) difficulty.addEventListener('change', onFilter);
    if (status) status.addEventListener('change', onFilter);
    if (reset) reset.addEventListener('click', function () {
      if (q) q.value = '';
      if (region) region.value = '';
      if (category) category.value = '';
      if (difficulty) difficulty.value = '';
      if (status) status.value = '';
      onFilter();
    });
  }

  /* ------------------------------------------------------------------
   * Shared API (homepage + journey page)
   * ---------------------------------------------------------------- */
  window.Journey = {
    /** Call fn once mission data is ready (immediately if already ready). */
    onReady: function (fn) {
      if (READY) { try { fn(); } catch (e) {} }
      else readyCallbacks.push(fn);
    },
    isReady: function () { return READY; },
    getWeeklyMission: function () {
      return MISSIONS.find(function (m) { return m.id === 'weekly-community'; }) || null;
    },
    getMissionById: function (id) {
      return MISSIONS.find(function (m) { return m.id === id; }) || null;
    },
    isWeeklyDone: function () { return isWeeklyDone(); },
    toggleWeekly: function () { toggleMission('weekly-community'); },
    renderWeekly: function (el) {
      if (!el) return;
      let m = MISSIONS.find(function (x) { return x.id === 'weekly-community'; });
      if (m) {
        Utils.clear(el);
        el.appendChild(renderMission(m));
      }
    }
  };

  function init() {
    bindMissionCards();
    bindFilters();
    loadMissions();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
