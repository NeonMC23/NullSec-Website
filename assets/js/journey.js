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

  // Campaigns are the organizational layer above missions (M36). They are
  // derived from the existing stage metadata in missions.json — Campaign
  // definitions are PUBLIC static content; progression is private user data.
  let campaigns = [
    { id: 'campaign-1', stage: 1, title: 'Getting Started', description: 'Foundational privacy and security basics you can set up today.', icon: '🚀' },
    { id: 'campaign-2', stage: 2, title: 'Build Better Habits', description: 'Turn privacy into routine with sustainable daily habits.', icon: '🌱' },
    { id: 'campaign-3', stage: 3, title: 'Take Back Control', description: 'Regain ownership of your data, devices and online accounts.', icon: '🔐' },
    { id: 'campaign-4', stage: 4, title: 'Advanced', description: 'Advanced self-hosting and high-assurance privacy setups.', icon: '🧠' }
  ];

  // Kept for backward compatibility with the mission grids.
  let stages = campaigns.map(function (c) {
    return { num: c.stage, name: c.title, count: 0 };
  });

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

  /* ------------------------------------------------------------------
   * Authentication gating (M30 — account-based progression)
   * ------------------------------------------------------------------
   * The Learning Journey is a PRIVATE account feature. Guests can browse the
   * public mission content, but progression (completion state) is only
   * available to an authenticated user and persisted server-side (Supabase).
   * There is NO local/guest progression fallback.
   */
  function isAuthenticated() {
    return !!(window.Auth && window.Auth.isAuthenticated());
  }

  /**
   * Build the "create an account to start your journey" call-to-action shown
   * to logged-out users instead of a private progression overview. Pure DOM;
   * no inline handlers.
   */
  function buildAuthCTA() {
    let wrap = Utils.el('div', { class: 'journey-auth-cta' });

    let title = Utils.el('h2', { class: 'journey-auth-title', text: 'Your Learning Journey' });
    wrap.appendChild(title);

    let p = Utils.el('p', {
      class: 'journey-auth-text',
      text: 'Create an account to save your mission progress and continue your journey across devices.'
    });
    wrap.appendChild(p);

    let actions = Utils.el('div', { class: 'journey-auth-actions' });
    let createBtn = Utils.el('a', { class: 'btn btn-primary', href: 'profile.html', text: 'Create account' });
    actions.appendChild(createBtn);
    wrap.appendChild(actions);

    let signInRow = Utils.el('p', { class: 'journey-auth-signin' });
    signInRow.appendChild(Utils.el('span', { text: 'Already have an account? ' }));
    signInRow.appendChild(Utils.el('a', { href: 'profile.html', text: 'Sign in' }));
    wrap.appendChild(signInRow);

    return wrap;
  }

  /** Render the auth CTA into the progress overview (logged-out state). */
  function showAuthCTA() {
    let progressEl = document.getElementById('progress-overview');
    if (!progressEl) return;
    Utils.clear(progressEl);
    progressEl.appendChild(buildAuthCTA());
  }

  function toggleMission(id) {
    if (!isAuthenticated()) {
      // Guests must not complete missions locally. Show the CTA and do nothing.
      showAuthCTA();
      return;
    }
    const wasCompleted = Progress.isCompleted(id);
    if (wasCompleted) Progress.uncomplete(id);
    else Progress.complete(id);
    renderAll();
    // M25: after successful completion, trigger an anonymous community
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
   * Campaign model (M36 — derived from stage metadata + progression)
   * ---------------------------------------------------------------- */

  /** Missions belonging to a given campaign stage (deterministic order). */
  function campaignMissions(stage) {
    return MISSIONS.filter(function (m) {
      return m.stage === stage && m.id !== 'weekly-community';
    }).sort(function (a, b) {
      return (a.order || 0) - (b.order || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    });
  }

  /** The mission that precedes a given mission in its Campaign, or null. */
  function prevMission(id) {
    const m = MISSIONS.find(function (x) { return x.id === id; });
    if (!m) return null;
    const list = campaignMissions(m.stage);
    const idx = list.findIndex(function (x) { return x.id === id; });
    return idx > 0 ? list[idx - 1] : null;
  }

  /** The mission that follows a given mission in its Campaign, or null. */
  function nextMissionInCampaign(id) {
    const m = MISSIONS.find(function (x) { return x.id === id; });
    if (!m) return null;
    const list = campaignMissions(m.stage);
    const idx = list.findIndex(function (x) { return x.id === id; });
    return (idx >= 0 && idx < list.length - 1) ? list[idx + 1] : null;
  }

  /** The Campaign a mission belongs to, or null. */
  function campaignForMission(id) {
    const m = MISSIONS.find(function (x) { return x.id === id; });
    if (!m) return null;
    return campaigns.find(function (c) { return c.stage === m.stage; }) || null;
  }

  /** Campaign completion stats derived from the authenticated progression. */
  function campaignStats(campaign) {
    const list = campaignMissions(campaign.stage);
    let completed = 0;
    list.forEach(function (m) {
      if (Progress.isCompleted(m.id)) completed++;
    });
    const total = list.length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    let status = 'Not started';
    if (total === 0) status = 'No missions';
    else if (completed >= total) status = 'Completed';
    else if (completed > 0) status = 'In progress';
    return { completed: completed, total: total, percentage: percentage, status: status };
  }

  /** The user's next mission: first incomplete mission of the first
   *  non-completed Campaign. Derived — never stored separately. */
  function nextMission() {
    if (!isAuthenticated()) return null;
    for (let i = 0; i < campaigns.length; i++) {
      const c = campaigns[i];
      const list = campaignMissions(c.stage);
      for (let j = 0; j < list.length; j++) {
        if (!Progress.isCompleted(list[j].id)) return list[j];
      }
    }
    return null; // all campaigns completed
  }

  function allCampaignsCompleted() {
    if (!isAuthenticated()) return false;
    return campaigns.every(function (c) {
      const s = campaignStats(c);
      return s.total === 0 || s.completed >= s.total;
    });
  }

  /** Campaign overview cards (authenticated only). */
  function renderCampaignOverview() {
    let container = document.getElementById('campaign-overview');
    if (!container) return;
    Utils.clear(container);
    if (!isAuthenticated()) return;

    let heading = Utils.el('div', { class: 'campaign-section-heading' });
    heading.appendChild(Utils.el('h2', { text: 'Campaigns' }));
    heading.appendChild(Utils.el('p', {
      class: 'campaign-section-sub',
      text: 'Your progress is saved to your account and synchronized across devices.'
    }));
    // M39: discrete, non-social link to the user's own public learning profile.
    if (window.PublicProfile && window.Auth && Auth.getUsername()) {
      let profileLink = Utils.el('a', {
        href: PublicProfile.getUrl(Auth.getUsername()),
        class: 'btn btn-secondary',
        text: 'View your public learning profile'
      });
      heading.appendChild(profileLink);
    }
    container.appendChild(heading);

    let grid = Utils.el('div', { class: 'campaign-grid' });
    campaigns.forEach(function (c) {
      const stats = campaignStats(c);
      let card = Utils.el('div', { class: 'campaign-card', dataset: { stage: c.stage } });
      card.appendChild(Utils.el('span', { class: 'campaign-icon', text: c.icon }));
      card.appendChild(Utils.el('h3', { text: c.title }));
      card.appendChild(Utils.el('p', { class: 'campaign-desc', text: c.description }));
      let meta = Utils.el('div', { class: 'campaign-meta' });
      meta.appendChild(Utils.el('span', {
        class: 'campaign-status status-' + stats.status.toLowerCase().replace(/\s+/g, '-'),
        text: stats.status
      }));
      meta.appendChild(Utils.el('span', {
        class: 'campaign-count',
        text: stats.completed + ' / ' + stats.total + ' missions'
      }));
      card.appendChild(meta);
      if (stats.total > 0) {
        let bar = Utils.el('div', { class: 'campaign-bar' });
        bar.appendChild(Utils.el('div', {
          class: 'campaign-bar-fill',
          style: 'width:' + stats.percentage + '%'
        }));
        card.appendChild(bar);
        card.appendChild(Utils.el('span', { class: 'campaign-pct', text: stats.percentage + '%' }));
      }
      // Clicking a campaign scrolls to its mission grid.
      card.addEventListener('click', function () {
        let gridEl = document.querySelector('.missions-grid[data-stage="' + c.stage + '"]');
        if (gridEl) gridEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      grid.appendChild(card);
    });
    container.appendChild(grid);
  }

  /** Next-mission CTA (authenticated only). */
  function renderNextMission() {
    let container = document.getElementById('next-mission');
    if (!container) return;
    Utils.clear(container);
    if (!isAuthenticated()) return;

    if (allCampaignsCompleted()) {
      container.appendChild(Utils.el('div', {
        class: 'next-mission-card all-done',
        text: 'All campaigns completed. Great work!'
      }));
      return;
    }
    const nm = nextMission();
    if (!nm) return;
    let card = Utils.el('div', { class: 'next-mission-card' });
    card.appendChild(Utils.el('span', { class: 'next-mission-label', text: 'Next mission' }));
    card.appendChild(Utils.el('h3', { text: nm.icon + ' ' + nm.title }));
    card.appendChild(Utils.el('p', { text: nm.desc }));
    let btn = Utils.el('button', { class: 'btn btn-primary', text: 'Open mission' });
    btn.addEventListener('click', function () { window.openMissionModal(nm.id); });
    card.appendChild(btn);
    container.appendChild(card);
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

    // Campaign context (M40).
    let camp = campaignForMission(id);
    if (camp) {
      let campTag = Utils.el('span', {
        class: 'tldr-tag mission-campaign-tag',
        style: 'display:inline-flex;align-items:center;gap:4px;padding:3px 10px;font-size:0.6875rem;font-weight:500;background:rgba(99,102,241,0.12);color:#818CF8;border-radius:100px;',
        text: camp.icon + ' ' + camp.title
      });
      tags.appendChild(campTag);
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

    let actions = Utils.el('div', { class: 'modal-actions' });
    // Guests can read/learn but cannot complete: show a sign-in CTA instead of
    // a dead "Mark as complete" button (M41 UX fix — no modal dead-end).
    let authd = isAuthenticated();
    let completeBtn;
    if (!authd) {
      completeBtn = Utils.el('a', {
        href: 'profile.html',
        class: 'btn btn-primary',
        text: 'Create account to save progress'
      });
    } else {
      completeBtn = Utils.el('button', {
        class: 'btn ' + (done ? 'btn-secondary' : 'btn-primary'),
        text: done ? '\u2713 Completed' : 'Mark as complete'
      });
      completeBtn.addEventListener('click', function () {
        const wasDone = done;
        completeFromModal(id);
        // M40 completion feedback + next-mission CTA.
        if (!wasDone) showMissionComplete(id);
      });
    }
    let closeBtn = Utils.el('button', { class: 'btn btn-secondary', text: 'Close' });
    closeBtn.addEventListener('click', function () { Modal.close(); });
    actions.appendChild(completeBtn);
    actions.appendChild(closeBtn);

    // M40: prev/next mission navigation within the Campaign.
    let nav = Utils.el('div', { class: 'modal-mission-nav' });
    let prev = prevMission(id);
    let next = nextMissionInCampaign(id);
    if (prev) {
      let prevBtn = Utils.el('button', { class: 'btn btn-secondary', text: '\u2190 Previous' });
      prevBtn.addEventListener('click', function () { window.openMissionModal(prev.id); });
      nav.appendChild(prevBtn);
    }
    if (next) {
      let nextBtn = Utils.el('button', { class: 'btn btn-secondary', text: 'Next \u2192' });
      nextBtn.addEventListener('click', function () { window.openMissionModal(next.id); });
      nav.appendChild(nextBtn);
    }
    if (prev || next) actions.appendChild(nav);

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

  /** M40: show a completion confirmation with a next-mission CTA. */
  function showMissionComplete(id) {
    let content = Utils.el('div', { class: 'mission-complete' });
    content.appendChild(Utils.el('div', { class: 'mission-complete-icon', text: '\u2713' }));
    content.appendChild(Utils.el('h3', { text: 'Mission complete' }));
    content.appendChild(Utils.el('p', {
      class: 'text-dim',
      text: 'Your progress is saved to your account and synchronized across devices.'
    }));

    // M43: when this was the last mission in its Campaign, acknowledge the
    // Campaign completion (derived, never stored) with a clear badge.
    let camp = campaignForMission(id);
    let campaignJustCompleted = false;
    if (camp) {
      const st = campaignStats(camp);
      campaignJustCompleted = st.total > 0 && st.completed >= st.total;
    }
    if (campaignJustCompleted) {
      content.appendChild(Utils.el('div', {
        class: 'mission-complete-campaign',
        text: '\u2b50 ' + camp.title + ' complete'
      }));
    }

    let next = nextMissionInCampaign(id);
    let nextGlobal = nextMission();
    let cta = next || nextGlobal;
    if (cta) {
      let btn = Utils.el('button', {
        class: 'btn btn-primary',
        text: 'Next: ' + cta.icon + ' ' + cta.title
      });
      btn.addEventListener('click', function () { window.openMissionModal(cta.id); });
      content.appendChild(btn);
    }
    let closeBtn = Utils.el('button', { class: 'btn btn-secondary', text: 'Keep exploring' });
    closeBtn.addEventListener('click', function () { Modal.close(); });
    content.appendChild(closeBtn);

    Modal.open(content);
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
      if (!isAuthenticated()) {
        // Logged-out: no private progression. Show the account CTA instead.
        progressEl.appendChild(buildAuthCTA());
      } else {
      let label = Utils.el('div', { class: 'progress-label', text: 'Your Progress ' });
      label.appendChild(Utils.el('span', {
        style: 'font-size:0.75rem;color:var(--text-dim);font-weight:400;',
        text: '(saved to your account — resumes on any device)'
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
    }

    // M36: campaign overview + next-mission CTA (authenticated only).
    renderCampaignOverview();
    renderNextMission();

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
    // M36 campaign model (derived; for tests/consumers).
    getCampaigns: function () { return campaigns.slice(); },
    getCampaignByStage: function (stage) {
      return campaigns.find(function (c) { return c.stage === stage; }) || null;
    },
    campaignMissions: campaignMissions,
    campaignStats: campaignStats,
    nextMission: nextMission,
    allCampaignsCompleted: allCampaignsCompleted,
    prevMission: prevMission,
    nextMissionInCampaign: nextMissionInCampaign,
    campaignForMission: campaignForMission,
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
