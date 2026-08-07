/**
 * NullSec — Profile page module
 * ------------------------------------------------------------------
 * Renders the local profile page: profile summary, username editing,
 * deterministic avatar, statistics, recovery key, settings, and
 * local export/import/reset. Uses DOM-safe rendering (Utils.el /
 * textContent), no inline scripts. Reads/writes via the service layers
 * (UserProfile, Settings, Progress, RecoveryKey) — never localStorage.
 */
(function () {
  'use strict';

  // UI sync state: 'idle' | 'syncing' | 'synced' | 'sync-error'
  let syncStatus = 'idle';

  /** Label for a sync state. */
  function syncStatusLabel(s) {
    if (s === 'syncing') return 'Syncing';
    if (s === 'synced') return 'Synced';
    if (s === 'sync-error') return 'Sync error';
    return 'Not signed in';
  }

  /** Trigger a push and update the UI sync status. */
  function runSyncAndRefresh() {
    syncStatus = 'syncing';
    renderAuthInfo();
    Sync.push().then(function () {
      syncStatus = 'synced';
      renderAuthInfo();
    }).catch(function () {
      syncStatus = 'sync-error';
      renderAuthInfo();
    });
  }

  /** Show an identity badge based on UserState mode. */
  function modeLabel(mode) {
    if (mode === 'authenticated') return 'Authenticated · Supabase';
    if (mode === 'anonymous') return 'Anonymous';
    return 'Local · Not authenticated';
  }

  /* --- Profile summary + avatar + username edit ------------------------ */

  function renderAvatar(seed, username) {
    let avatar = Utils.el('div', { class: 'profile-avatar' });
    // Deterministic SVG from seed (self-generated, trusted).
    avatar.innerHTML = Utils.avatarSvg(seed || username || 'A');
    return avatar;
  }

  function renderUsernameEditor(info, avatar, profile) {
    info.appendChild(Utils.el('h1', { text: profile.username || 'Anonymous' }));
    info.appendChild(Utils.el('p', { text: modeLabel(UserState.getMode()) }));

    let form = Utils.el('form', { class: 'profile-edit-form' });
    let input = Utils.el('input', {
      type: 'text',
      value: profile.username || '',
      placeholder: 'Username',
      maxlength: '32',
      autocomplete: 'off'
    });
    let saveBtn = Utils.el('button', { type: 'submit', class: 'btn btn-primary', text: 'Save' });
    let errEl = Utils.el('span', { class: 'profile-edit-error', text: '' });

    form.appendChild(input);
    form.appendChild(saveBtn);
    form.appendChild(errEl);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      let name = input.value;
      let err = Settings.validateUsername(name);
      if (err) {
        errEl.textContent = err;
        return;
      }
      UserProfile.update({ username: name.trim() });
      // refresh summary name + avatar (avatar stays seed-driven)
      info.firstChild.textContent = name.trim();
      errEl.textContent = '';
      avatar.innerHTML = Utils.avatarSvg(profile.avatar_seed || name.trim());
    });

    info.appendChild(form);
  }

  function renderProfile(profile) {
    let container = document.getElementById('profile-summary');
    if (!container) return;
    Utils.clear(container);
    let avatar = renderAvatar(profile.avatar_seed, profile.username);
    let info = Utils.el('div', { class: 'profile-info' });
    container.appendChild(avatar);
    container.appendChild(info);
    renderUsernameEditor(info, avatar, profile);
  }

  /* --- Statistics ------------------------------------------------------ */

  function renderStats() {
    let container = document.getElementById('profile-stats');
    if (!container) return;
    Utils.clear(container);

    container.appendChild(Utils.el('p', {
      style: 'color:var(--text-dim);padding:12px 0;',
      text: 'Loading your local statistics…'
    }));

    Statistics.get().then(function (stats) {
      Utils.clear(container);
      if (!container) return;

      function stat(label, value) {
        let card = Utils.el('div', { class: 'profile-stat' });
        card.appendChild(Utils.el('strong', { text: value }));
        card.appendChild(Utils.el('span', { text: label }));
        return card;
      }

      let grid = Utils.el('div', { class: 'profile-stats-grid' });
      grid.appendChild(stat('Missions', stats.missions_completed + '/' + stats.missions_total));
      grid.appendChild(stat('Articles', stats.articles_read));
      grid.appendChild(stat('Weekly', stats.weekly_completed));
      grid.appendChild(stat('Completion', stats.completion_percent + '%'));
      container.appendChild(grid);
    }).catch(function () {
      Utils.clear(container);
      container.appendChild(Utils.el('p', {
        style: 'color:var(--text-dim);',
        text: 'Could not load statistics.'
      }));
    });
  }

  function renderCreated(profile) {
    let el = document.getElementById('profile-created');
    if (!el) return;
    let date = new Date(profile.created_at);
    let label = 'Created today';
    if (!isNaN(date.getTime())) {
      label = 'Created ' + date.toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric'
      });
    }
    el.textContent = label;
  }

  /* --- Recovery key card ----------------------------------------------- */

  function renderRecovery() {
    let container = document.getElementById('profile-recovery');
    if (!container) return;

    let key = RecoveryKey.get();
    if (!key) key = RecoveryKey.ensure();

    Utils.clear(container);

    let card = Utils.el('div', { class: 'profile-recovery' });
    card.appendChild(Utils.el('h3', { text: 'Recovery Key' }));

    let display = Utils.el('span', { class: 'recovery-key-display', text: '\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022' });
    card.appendChild(display);

    card.appendChild(Utils.el('p', {
      class: 'recovery-warning',
      text: 'This recovery key is the only future way to recover your account. Store it securely.'
    }));

    let actions = Utils.el('div', { class: 'recovery-actions' });
    let revealBtn = Utils.el('button', { class: 'btn btn-secondary', text: 'Reveal' });
    let copyBtn = Utils.el('button', { class: 'btn btn-secondary', text: 'Copy' });
    copyBtn.disabled = true;

    revealBtn.addEventListener('click', function () {
      let revealed = revealBtn.textContent === 'Hide';
      if (revealed) {
        display.textContent = '\u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022 \u2022\u2022\u2022\u2022';
        revealBtn.textContent = 'Reveal';
        copyBtn.disabled = true;
      } else {
        display.textContent = key;
        revealBtn.textContent = 'Hide';
        copyBtn.disabled = false;
      }
    });

    copyBtn.addEventListener('click', function () {
      if (!key) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(key).then(function () {
          copyBtn.textContent = 'Copied';
          setTimeout(function () { copyBtn.textContent = 'Copy'; }, 1500);
        }).catch(function () {});
      }
    });

    actions.appendChild(revealBtn);
    actions.appendChild(copyBtn);
    card.appendChild(actions);
    container.appendChild(card);
  }

  /* --- Settings section ------------------------------------------------ */

  function renderSettings() {
    let container = document.getElementById('profile-settings');
    if (!container) return;
    Utils.clear(container);

    let settings = Settings.get();

    let card = Utils.el('div', { class: 'profile-settings' });

    // Theme
    let themeRow = Utils.el('label', { class: 'settings-row' });
    themeRow.appendChild(Utils.el('span', { text: 'Theme' }));
    let themeSel = Utils.el('select', { class: 'settings-select' });
    ['system', 'dark', 'light'].forEach(function (v) {
      let opt = Utils.el('option', { value: v, text: v.charAt(0).toUpperCase() + v.slice(1) });
      if (v === settings.theme) opt.setAttribute('selected', '');
      themeSel.appendChild(opt);
    });
    themeSel.addEventListener('change', function () {
      Settings.update({ theme: themeSel.value });
      applyThemeFromSettings();
    });
    themeRow.appendChild(themeSel);
    card.appendChild(themeRow);

    // Language (future-ready placeholder)
    let langRow = Utils.el('label', { class: 'settings-row' });
    langRow.appendChild(Utils.el('span', { text: 'Language' }));
    let langSel = Utils.el('select', { class: 'settings-select' });
    [['en', 'English'], ['fr', 'Français']].forEach(function (pair) {
      let opt = Utils.el('option', { value: pair[0], text: pair[1] });
      if (pair[0] === settings.language) opt.setAttribute('selected', '');
      langSel.appendChild(opt);
    });
    langSel.addEventListener('change', function () {
      Settings.update({ language: langSel.value });
    });
    langRow.appendChild(langSel);
    card.appendChild(langRow);

    // Offline mode indicator
    let offlineRow = Utils.el('div', { class: 'settings-row' });
    offlineRow.appendChild(Utils.el('span', { text: 'Offline mode' }));
    let offlineBadge = Utils.el('span', {
      class: 'settings-badge' + (Config.get().offlineMode ? ' on' : ''),
      text: Config.get().offlineMode ? 'Local only' : 'Online'
    });
    offlineRow.appendChild(offlineBadge);
    card.appendChild(offlineRow);

    // Animations toggle
    let animRow = Utils.el('label', { class: 'settings-row' });
    animRow.appendChild(Utils.el('span', { text: 'Animations' }));
    let animCheck = Utils.el('input', { type: 'checkbox' });
    if (settings.appearance.animations) animCheck.setAttribute('checked', '');
    animCheck.addEventListener('change', function () {
      Settings.update({ appearance: { animations: animCheck.checked } });
      if (!animCheck.checked) document.documentElement.setAttribute('data-motion', 'off');
      else document.documentElement.removeAttribute('data-motion');
    });
    animRow.appendChild(animCheck);
    card.appendChild(animRow);

    // Privacy info
    card.appendChild(Utils.el('p', {
      class: 'settings-note',
      text: 'Your account data lives in NullSec\u2019s backend. Your browser is only a client. No telemetry, no tracking.'
    }));

    container.appendChild(card);
  }

  /** Apply the theme stored in Settings (and persist legacy ns:theme). */
  function applyThemeFromSettings() {
    let s = Settings.get();
    let theme = s.theme;
    if (theme === 'system') {
      let dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      theme = dark ? 'dark' : 'light';
    }
    Store.set(Store.keys.THEME, theme);
    document.documentElement.setAttribute('data-theme', theme);
  }

  /* --- Export / Import / Reset ----------------------------------------- */

  function renderExport() {
    let btn = document.getElementById('profile-export');
    if (!btn) return;
    btn.addEventListener('click', function () {
      let payload = Settings.exportData();
      let blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      let url = URL.createObjectURL(blob);
      let a = document.createElement('a');
      a.href = url;
      a.download = 'nullsec-export.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  function renderImport() {
    let fileInput = document.getElementById('profile-import-input');
    let btn = document.getElementById('profile-import');
    if (!btn || !fileInput) return;
    btn.addEventListener('click', function () {
      fileInput.click();
    });
    fileInput.addEventListener('change', function () {
      let file = fileInput.files && fileInput.files[0];
      if (!file) return;
      let reader = new FileReader();
      reader.onload = function (ev) {
        try {
          let obj = JSON.parse(ev.target.result);
          if (!confirm('This will overwrite your current local data. Continue?')) return;
          let res = Settings.importData(obj);
          if (!res.ok) { alert('Import failed: ' + res.error); return; }
          applyThemeFromSettings();
          renderAll();
        } catch (e) {
          alert('Import failed: invalid file.');
        }
      };
      reader.readAsText(file);
      fileInput.value = '';
    });
  }

  function renderFullReset() {
    let btn = document.getElementById('profile-reset-all');
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (!confirm('This will erase ALL local data (identity, profile, progress, recovery key, settings). Continue?')) return;
      // erase (repositories clear the non-persistent session memory cache)
      IdentityRepository.clear();
      ProfileRepository.clear();
      ProgressRepository.clear();
      SessionStore.deleteRecoveryKey();
      SessionStore.clearSession();
      SettingsRepository.clear();
      // recreate fresh
      Identity.init();
      UserProfile.init();
      RecoveryKey.ensure();
      Settings.init();
      applyThemeFromSettings();
      renderAll();
    });
  }

  function renderResetProgress() {
    let btn = document.getElementById('profile-reset');
    if (!btn) return;
    btn.addEventListener('click', function () {
      Progress.reset();
      renderStats();
    });
  }

  /** Render the account section (info + backend-gated actions). */
  function renderAuthInfo() {
    let container = document.getElementById('profile-auth');
    if (!container) return;

    let state = Auth.getState();
    let mode = UserState.getMode();
    let recoveryAvailable = !!RecoveryKey.get();
    let offline = Config.get().offlineMode === true;
    let backendEnabled = Config.get().backendEnabled === true;
    let isAuth = mode === 'authenticated';
    let sessionStatus = window.Session ? Session.getStatus() : 'local';

    Utils.clear(container);

    let card = Utils.el('div', { class: 'profile-auth' });
    card.appendChild(Utils.el('h3', { text: 'Account' }));

    let rows = Utils.el('div', { class: 'profile-auth-rows' });

    // Use the normalized auth status (M20) for clear, explicit feedback.
    let statusText, statusHint;
    const authStatus = Auth.getAuthStatus();
    if (authStatus === 'AUTHENTICATED') {
      statusText = 'Authenticated · Supabase';
    } else if (authStatus === 'AUTHENTICATING') {
      statusText = 'Signing in…';
    } else if (authStatus === 'BACKEND_UNAVAILABLE') {
      statusText = 'Backend unavailable';
      statusHint = 'Your session could not be checked right now. Retry when the backend is reachable.';
    } else if (authStatus === 'SESSION_EXPIRED') {
      statusText = 'Session expired';
      statusHint = 'Your previous session is no longer valid. Sign in again with your recovery key.';
    } else if (sessionStatus === 'checking' && backendEnabled) {
      statusText = 'Checking session…';
    } else {
      statusText = 'Not authenticated';
    }
    let statusRow = Utils.el('div', { class: 'auth-row' });
    statusRow.appendChild(Utils.el('span', { text: 'Status' }));
    statusRow.appendChild(Utils.el('span', { class: 'auth-value', text: statusText }));
    rows.appendChild(statusRow);
    if (statusHint) {
      let hintRow = Utils.el('div', { class: 'auth-row auth-hint' });
      hintRow.appendChild(Utils.el('span', { class: 'auth-value', text: statusHint }));
      rows.appendChild(hintRow);
    }

    let authRow = Utils.el('div', { class: 'auth-row' });
    authRow.appendChild(Utils.el('span', { text: 'Authentication' }));
    authRow.appendChild(Utils.el('span', {
      class: 'auth-value',
      text: backendEnabled ? 'Available' : 'Unavailable offline'
    }));
    rows.appendChild(authRow);

    let recRow = Utils.el('div', { class: 'auth-row' });
    recRow.appendChild(Utils.el('span', { text: 'Recovery' }));
    recRow.appendChild(Utils.el('span', {
      class: 'auth-value',
      text: recoveryAvailable ? 'Available locally' : 'Not available'
    }));
    rows.appendChild(recRow);

    // Sync status (only shown when backend is enabled).
    if (backendEnabled) {
      let syncRow = Utils.el('div', { class: 'auth-row' });
      syncRow.appendChild(Utils.el('span', { text: 'Sync' }));
      syncRow.appendChild(Utils.el('span', {
        class: 'auth-value',
        text: isAuth ? syncStatusLabel(syncStatus) : 'Not signed in'
      }));
      rows.appendChild(syncRow);
    }

    card.appendChild(rows);

    card.appendChild(Utils.el('p', {
      class: 'auth-note',
      text: isAuth
        ? 'You are signed in to your NullSec account. No data leaves your device beyond what you sync.'
        : 'Authentication is not available in offline mode. No account is created and no data leaves your device.'
    }));

    // Backend-gated actions (hidden unless backend is enabled).
    if (backendEnabled) {
      let actions = Utils.el('div', { class: 'profile-auth-actions' });

      if (isAuth) {
        let syncNowBtn = Utils.el('button', { class: 'btn btn-primary', text: 'Sync now' });
        syncNowBtn.addEventListener('click', function () {
          runSyncAndRefresh();
        });
        actions.appendChild(syncNowBtn);

        let logoutBtn = Utils.el('button', { class: 'btn btn-secondary', text: 'Log out' });
        logoutBtn.addEventListener('click', function () {
          Auth.logout();
          syncStatus = 'idle';
          renderAll();
        });
        actions.appendChild(logoutBtn);
      } else {
        let createBtn = Utils.el('button', { class: 'btn btn-primary', text: 'Create account' });
        let recoverBtn = Utils.el('button', { class: 'btn btn-secondary', text: 'Recover account' });
        createBtn.addEventListener('click', function () {
          runCreateAccount(container);
        });
        recoverBtn.addEventListener('click', function () {
          runRecoverAccount(container);
        });
        actions.appendChild(createBtn);
        actions.appendChild(recoverBtn);
      }

      card.appendChild(actions);
    }

    container.appendChild(card);
  }

  /**
   * Run account creation via the backend (only reachable when enabled).
   * Auth.register collects the recovery key locally, hashes it, calls
   * ns_register, and persists the session. Only a hash is ever transmitted.
   */
  function runCreateAccount(card) {
    // Explicit feedback: show "Signing in…" while the request is in flight.
    Auth.setAuthenticating(true);
    renderAuthInfo();
    Auth.register().then(function (res) {
      Auth.setAuthenticating(false);
      if (res && res.ok) {
        syncStatus = 'syncing';
        renderAll();
        runSyncAndRefresh();
      } else {
        renderAuthInfo();
        alert('Account creation unavailable: ' + safeAuthReason(res));
      }
    }).catch(function () {
      Auth.setAuthenticating(false);
      renderAuthInfo();
      alert('Account creation failed: no response from the backend.');
    });
  }

  /** Run recovery-based login (only reachable when backend enabled). */
  function runRecoverAccount(card) {
    Auth.setAuthenticating(true);
    renderAuthInfo();
    Auth.loginWithRecoveryKey().then(function (res) {
      Auth.setAuthenticating(false);
      if (res && res.ok) {
        syncStatus = 'syncing';
        renderAll();
        runSyncAndRefresh();
      } else {
        renderAuthInfo();
        alert('Login failed: ' + safeAuthReason(res));
      }
    }).catch(function () {
      Auth.setAuthenticating(false);
      renderAuthInfo();
      alert('Login failed: no response from the backend.');
    });
  }

  /** Human-safe, generic reason for an auth failure (no secrets/exceptions). */
  function safeAuthReason(res) {
    if (!res || !res.reason) return 'the backend is unavailable.';
    const map = {
      'authentication-unavailable-offline': 'authentication is not available offline.',
      'crypto-unavailable': 'secure crypto is unavailable in this browser.',
      'no-recovery-key': 'no recovery key is available in this session.',
      'no-token': 'the server did not return a valid session.',
      unauthorized: 'your credentials were not accepted.',
      'invalid_recovery_key': 'the recovery key was not accepted.',
      'account_not_found': 'no account matches this identity.',
      'account_already_exists': 'an account already exists for this identity.',
      forbidden: 'you are not allowed to do this.',
      network_error: 'a network error occurred.',
      offline: 'the backend is offline.'
    };
    return map[res.reason] || 'the backend could not process the request.';
  }

  function renderAll() {
    let profile = UserProfile.init();
    renderProfile(profile);
    renderCreated(profile);
    renderStats();
    renderRecovery();
    renderSettings();
    renderAuthInfo();
    applyThemeFromSettings();
  }

  function init() {
    renderResetProgress();
    renderExport();
    renderImport();
    renderFullReset();
    renderAll();
    // Render immediately (shows "Checking session…"), then re-render once the
    // startup session restoration resolves so the account state is accurate.
    Session.ensureRestored().then(function () {
      renderAll();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
