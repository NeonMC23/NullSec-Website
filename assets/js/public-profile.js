/**
 * NullSec — Public Profile module (Milestone 37 → 38)
 * ------------------------------------------------------------------
 * Renders a user's PUBLIC learning profile (a deliberate, opt-in learning
 * identity). This is NOT the private Account page. It shows only explicitly
 * public learning data derived from the canonical server progression
 * (ns_public_profile) joined against the public campaign/mission definitions
 * (data/missions.json).
 *
 * PUBLIC FIELDS ONLY: username, bio, learning interests, member-since,
 * learning statistics and deterministic achievements. Never exposes
 * credentials, recovery data, session data, internal IDs, email or private
 * settings. Works for anonymous visitors; disabled profiles are hidden.
 *
 * No social features: no followers, follows, likes, comments, DMs, feeds.
 */
(function () {
  'use strict';

  // Public campaign definitions (mirrors journey.js stage->campaign mapping).
  // These are PUBLIC static learning content.
  let CAMPAIGNS = [
    { stage: 1, title: 'Getting Started', icon: '🚀' },
    { stage: 2, title: 'Build Better Habits', icon: '🌱' },
    { stage: 3, title: 'Take Back Control', icon: '🔐' },
    { stage: 4, title: 'Advanced', icon: '🧠' }
  ];

  // Deterministic achievements derived ONLY from public progression data.
  const ACHIEVEMENTS = [
    { id: 'FIRST_MISSION', title: 'First Mission', desc: 'Completed your first mission.', test: function (s) { return s.missionsCompleted >= 1; } },
    { id: 'TEN_MISSIONS', title: '10 Missions', desc: 'Completed 10 missions.', test: function (s) { return s.missionsCompleted >= 10; } },
    { id: 'TWENTYFIVE_MISSIONS', title: '25 Missions', desc: 'Completed 25 missions.', test: function (s) { return s.missionsCompleted >= 25; } },
    { id: 'FIFTY_MISSIONS', title: '50 Missions', desc: 'Completed 50 missions.', test: function (s) { return s.missionsCompleted >= 50; } },
    { id: 'CAMPAIGN_COMPLETE', title: 'Campaign Starter', desc: 'Fully completed at least one Campaign.', test: function (s) { return s.campaignsCompleted >= 1; } },
    { id: 'ALL_CAMPAIGNS', title: 'All Campaigns', desc: 'Fully completed every Campaign.', test: function (s) { return s.campaignsTotal > 0 && s.campaignsCompleted >= s.campaignsTotal; } }
  ];

  function isBackendAvailable() {
    return !!window.ApiClient && ApiClient.isBackendAvailable();
  }

  /** Parse the ?u=<username> query param (static-site routing). */
  function readUsername() {
    let m = /[?&]u=([^&]+)/.exec(window.location.search || '');
    if (!m) return null;
    try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
  }

  /**
   * Canonical, deterministic public-profile URL (M39). All references to a
   * public profile must use this function rather than rebuilding the URL.
   * @param {string} username
   * @returns {string} e.g. "public-profile.html?u=Neon"
   */
  function getUrl(username) {
    return 'public-profile.html?u=' + encodeURIComponent(username || '');
  }

  /**
   * Share the public profile URL. Priority: navigator.share() if available,
   * otherwise clipboard, otherwise returns {ok:false} for a UI fallback.
   * Never sends the URL to a server; never writes any local storage.
   * @param {string} username
   * @returns {Promise<{ok:boolean, method:string}>}
   */
  function share(username) {
    let url = getUrl(username);
    let origin = '';
    try { origin = window.location.origin + '/'; } catch (e) { /* ignore */ }
    let fullUrl = origin + url;

    if (navigator && navigator.share) {
      return navigator.share({ title: 'NullSec learning profile', url: fullUrl })
        .then(function () { return { ok: true, method: 'share' }; })
        .catch(function () { return { ok: false, method: 'share' }; });
    }
    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(fullUrl)
        .then(function () { return { ok: true, method: 'clipboard' }; })
        .catch(function () { return { ok: false, method: 'clipboard' }; });
    }
    return Promise.resolve({ ok: false, method: 'none' });
  }

  /** Load the public mission definitions once. */
  function loadMissions() {
    if (window.Data && Data.loadMissions) return Data.loadMissions();
    return Promise.resolve([]);
  }

  /** Compute public campaign stats from mission definitions + completed ids. */
  function computeStats(missions, completedSet) {
    let stats = {
      missionsCompleted: 0,
      missionsTotal: 0,
      campaignsCompleted: 0,
      campaignsTotal: CAMPAIGNS.length,
      campaigns: []
    };

    CAMPAIGNS.forEach(function (c) {
      let list = (missions || []).filter(function (m) {
        return m.stage === c.stage && m.id !== 'weekly-community';
      });
      let done = 0;
      list.forEach(function (m) { if (completedSet.has(m.id)) done++; });
      let total = list.length;
      let pct = total > 0 ? Math.round((done / total) * 100) : 0;
      stats.missionsTotal += total;
      stats.missionsCompleted += done;
      if (total > 0 && done >= total) stats.campaignsCompleted++;
      stats.campaigns.push({ title: c.title, icon: c.icon, done: done, total: total, pct: pct });
    });

    stats.overall = stats.missionsTotal > 0
      ? Math.round((stats.missionsCompleted / stats.missionsTotal) * 100)
      : 0;
    return stats;
  }

  /** Derive the user's earned achievements (deterministic, no stored copy). */
  function computeAchievements(stats) {
    return ACHIEVEMENTS.filter(function (a) { return a.test(stats); });
  }

  /** Build a stat card. */
  function statCard(label, value) {
    let card = Utils.el('div', { class: 'community-stat public-profile-stat' });
    card.appendChild(Utils.el('strong', { text: String(value) }));
    card.appendChild(Utils.el('span', { text: label }));
    return card;
  }

  /** Format member-since date. */
  function memberSince(iso) {
    if (!iso) return 'Unknown';
    let d = new Date(iso);
    if (isNaN(d.getTime())) return 'Unknown';
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  }

  /** Render the public learning profile. */
  function renderProfile(profile, stats, achievements) {
    let container = document.getElementById('public-profile');
    if (!container) return;
    Utils.clear(container);

    let username = profile && profile.username;

    // Disabled / not found: non-enumerating message.
    if (!profile || profile.enabled !== true) {
      container.appendChild(Utils.el('h1', { text: 'Public Profile' }));
      container.appendChild(Utils.el('p', {
        class: 'text-dim',
        text: 'This public profile is unavailable.'
      }));
      return;
    }

    let header = Utils.el('div', { class: 'public-profile-header' });
    header.appendChild(Utils.el('h1', { text: '@' + username }));
    header.appendChild(Utils.el('p', {
      class: 'text-dim',
      text: 'Public learning identity · Member since ' + memberSince(profile.created_at)
    }));
    container.appendChild(header);

    // Sharing (M39).
    let shareBtn = Utils.el('button', { class: 'btn btn-secondary', text: 'Share public profile' });
    shareBtn.addEventListener('click', function () {
      share(username).then(function (res) {
        if (res.ok && res.method === 'share') { /* native share sheet handled it */ }
        else if (res.ok && res.method === 'clipboard') { shareBtn.textContent = 'Profile link copied.'; }
        else {
          shareBtn.textContent = 'Copy link';
          shareBtn.setAttribute('href', getUrl(username));
        }
      });
    });
    container.appendChild(shareBtn);

    // Explore Journey link (public content, not social).
    let explore = Utils.el('a', { href: 'journey.html', class: 'btn btn-secondary', text: 'Explore Learning Journey' });
    container.appendChild(explore);

    // Bio (optional).
    if (profile.bio) {
      container.appendChild(Utils.el('p', { class: 'public-profile-bio', text: profile.bio }));
    }

    // Learning interests (optional).
    if (profile.learning_interests && profile.learning_interests.length) {
      let tags = Utils.el('div', { class: 'public-profile-interests' });
      profile.learning_interests.forEach(function (t) {
        tags.appendChild(Utils.el('span', { class: 'public-profile-interest', text: t }));
      });
      container.appendChild(tags);
    }

    // Overview cards
    let overview = Utils.el('div', { class: 'community-stats-grid' });
    overview.appendChild(statCard('Overall progress', stats.overall + '%'));
    overview.appendChild(statCard('Campaigns completed', stats.campaignsCompleted + ' / ' + stats.campaignsTotal));
    overview.appendChild(statCard('Missions completed', stats.missionsCompleted + ' / ' + stats.missionsTotal));
    overview.appendChild(statCard('Achievements', achievements.length));
    container.appendChild(overview);

    // Per-campaign progress bars
    let campHeading = Utils.el('h2', { class: 'public-profile-section', text: 'Campaign progress' });
    container.appendChild(campHeading);
    if (stats.missionsCompleted === 0) {
      container.appendChild(Utils.el('p', {
        class: 'text-dim',
        text: 'No missions completed yet. Start the Learning Journey to build your profile.'
      }));
    }
    let list = Utils.el('div', { class: 'community-regions-list' });
    stats.campaigns.forEach(function (c) {
      let row = Utils.el('div', { class: 'community-region-row activity-row' });
      let left = Utils.el('span', {});
      left.appendChild(Utils.el('span', { text: c.icon + ' ' + c.title }));
      row.appendChild(left);
      let barWrap = Utils.el('div', { class: 'activity-bar-wrap' });
      let bar = Utils.el('div', { class: 'activity-bar', style: 'width:' + Math.max(2, c.pct) + '%' });
      barWrap.appendChild(bar);
      row.appendChild(barWrap);
      row.appendChild(Utils.el('span', { class: 'activity-bar-value', text: c.done + ' / ' + c.total }));
      list.appendChild(row);
    });
    container.appendChild(list);

    // Achievements (derived).
    let achHeading = Utils.el('h2', { class: 'public-profile-section', text: 'Achievements' });
    container.appendChild(achHeading);
    if (achievements.length) {
      let achList = Utils.el('div', { class: 'public-profile-achievements' });
      achievements.forEach(function (a) {
        let badge = Utils.el('div', { class: 'public-profile-achievement' });
        badge.appendChild(Utils.el('strong', { text: a.title }));
        badge.appendChild(Utils.el('span', { text: a.desc }));
        achList.appendChild(badge);
      });
      container.appendChild(achList);
    } else {
      container.appendChild(Utils.el('p', {
        class: 'text-dim',
        text: 'No achievements earned yet. Complete missions to earn your first badge.'
      }));
    }

    container.appendChild(Utils.el('p', {
      class: 'community-privacy-note',
      text: 'This profile shows public learning activity only. Account credentials and private account information are never exposed.'
    }));
  }

  function renderError(message) {
    let container = document.getElementById('public-profile');
    if (!container) return;
    Utils.clear(container);
    container.appendChild(Utils.el('h1', { text: 'Public Profile' }));
    container.appendChild(Utils.el('p', { class: 'text-dim', text: message }));
  }

  function init() {
    let username = readUsername();
    if (!username) { renderError('No username provided. Use ?u=<username>.'); return; }

    if (!isBackendAvailable()) {
      renderError('Public profiles are unavailable right now. Please try again later.');
      return;
    }

    let container = document.getElementById('public-profile');
    if (container) container.appendChild(Utils.el('p', { class: 'text-dim', text: 'Loading public profile…' }));

    Promise.all([ApiClient.publicProfile(username), loadMissions()]).then(function (results) {
      let profile = results[0];
      let missions = results[1] || [];
      if (!profile || profile.enabled !== true) {
        renderProfile(null, null, []); // disabled / not found path
        return;
      }
      let completedSet = new Set(profile.completed_mission_ids || []);
      let stats = computeStats(missions, completedSet);
      let achievements = computeAchievements(stats);
      renderProfile(profile, stats, achievements);
    }).catch(function () {
      renderError('Could not load this public profile. Please try again later.');
    });
  }

  // Expose derivation + URL/sharing helpers for consumers/tests.
  window.PublicProfile = {
    CAMPAIGNS: CAMPAIGNS,
    ACHIEVEMENTS: ACHIEVEMENTS,
    computeStats: computeStats,
    computeAchievements: computeAchievements,
    memberSince: memberSince,
    getUrl: getUrl,
    share: share
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
