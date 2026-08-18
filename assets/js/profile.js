/**
 * NullSec — Account page module
 * ------------------------------------------------------------------
 * Renders the private ACCOUNT page (not a social profile): authentication
 * status, country, recovery key, progress summary, settings, and sign out.
 * M31: no avatar, no public username, no bio. Uses DOM-safe rendering
 * (Utils.el / textContent), no inline scripts. Reads/writes via the service
 * layers (Settings, Progress, RecoveryKey) — never localStorage.
 */
(function () {
  'use strict';

  // UI sync state: 'idle' | 'syncing' | 'synced' | 'sync-error'
  let syncStatus = 'idle';

  /** Label for a sync state. */
  function syncStatusLabel(s) {
    if (s === 'syncing') return 'Syncing…';
    if (s === 'synced') return 'Synced';
    if (s === 'pending') return 'Pending changes';
    if (s === 'offline') return 'Offline';
    if (s === 'failed') return 'Sync failed';
    if (s === 'sync-error') return 'Sync error';
    return 'Not signed in';
  }

  /** Trigger a push and update the UI sync status. */
  function runSyncAndRefresh() {
    syncStatus = 'syncing';
    renderAuthInfo();
    // M35: use the full sync cycle (pull → resolve → push) so a returning user
    // (same or different device) restores their server-side progression.
    // Push-only would never load remote progress after sign-in.
    const op = (Sync.syncNow && Sync.syncNow.bind(Sync))
      ? Sync.syncNow()
      : ((Sync.sync && Sync.sync.bind(Sync)) ? Sync.sync() : Sync.push());
    op.then(function () {
      // Reflect any server-side progression into the in-memory Progress state.
      if (window.Progress && Progress.reload) Progress.reload();
      renderAll();
    }).catch(function () {
      renderAuthInfo();
    });
  }

  /** Account summary (private — no username/avatar/public identity). */
  function renderProfile(profile) {
    let container = document.getElementById('profile-summary');
    if (!container) return;
    Utils.clear(container);

    // M34: for a guest the Account page is a clear gateway, not a fake empty
    // profile. For an authenticated user it shows the private username only.
    if (!Auth.isAuthenticated()) {
      let gate = Utils.el('div', { class: 'profile-info' });
      gate.appendChild(Utils.el('h1', { text: 'Account' }));
      gate.appendChild(Utils.el('p', {
        class: 'profile-account-note',
        text: 'Your NullSec account keeps your progression private and synchronized across devices.'
      }));
      let actions = Utils.el('div', { class: 'profile-gate-actions' });
      let signIn = Utils.el('a', { class: 'btn btn-primary', href: 'profile.html', text: 'Sign in' });
      let create = Utils.el('a', { class: 'btn btn-secondary', href: 'profile.html', text: 'Create account' });
      actions.appendChild(signIn);
      actions.appendChild(create);
      gate.appendChild(actions);
      container.appendChild(gate);
      return;
    }

    let info = Utils.el('div', { class: 'profile-info' });
    info.appendChild(Utils.el('span', { class: 'profile-info-eyebrow', text: 'ACCOUNT' }));
    let username = Auth.getUsername();
    info.appendChild(Utils.el('h1', { class: 'profile-account-username', text: '@' + (username || 'you') }));
    info.appendChild(Utils.el('p', {
      class: 'profile-account-note',
      text: 'A private container for your progression. No public profile, no avatar.'
    }));
    // Small authentication state line (part of the identity card).
    info.appendChild(Utils.el('p', {
      class: 'profile-auth-state',
      text: 'Authentication: signed in · private account'
    }));
    container.appendChild(info);
  }

  /* --- Account sync status indicator (M49) ----------------------------- */
  // M51: a SINGLE canonical sync-status subscription, added once at init.
  // The previous code registered a new Sync.onStatusChange listener on every
  // renderAll() call, accumulating duplicate listeners and stale references.
  let syncPillRef = null;
  function renderAccountSync() {
    let host = document.getElementById('account-sync');
    if (!host) return;
    Utils.clear(host);
    syncPillRef = null;
    if (!Auth.isAuthenticated()) return; // guests see no sync status
    const st = (window.Sync && Sync.getStatus) ? Sync.getStatus() : 'synced';
    let pill = Utils.el('span', { class: 'sync-status-pill', 'data-status': st, text: syncStatusLabel(st) });
    syncPillRef = pill;
    host.appendChild(pill);
  }
  function wireSyncStatus() {
    if (window.Sync && Sync.onStatusChange) {
      Sync.onStatusChange(function (next) {
        if (syncPillRef && syncPillRef.isConnected) {
          syncPillRef.textContent = syncStatusLabel(next);
          syncPillRef.setAttribute('data-status', next);
        }
      });
    }
  }

  /* --- Statistics ------------------------------------------------------ */

  function renderStats() {
    let container = document.getElementById('profile-stats');
    if (!container) return;
    Utils.clear(container);

    container.appendChild(Utils.el('p', {
      style: 'color:var(--text-dim);padding:12px 0;',
      text: 'Loading your statistics…'
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
    if (!profile) { el.textContent = ''; return; }
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
    Utils.clear(container);

    // M32: recovery key is generated only at account creation (authd).
    // A guest is never issued a recovery key just by visiting the page.
    if (!Auth.isAuthenticated()) {
      container.appendChild(Utils.el('p', {
        class: 'profile-recovery',
        style: 'color:var(--text-dim);',
        text: 'Sign in to manage your recovery key.'
      }));
      return;
    }
    let key = RecoveryKey.get();
    if (!key) key = RecoveryKey.ensure();

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

  // M54: the Account page renders twice during session restore (Auth.onAuthChange
  // + ensureRestored), which made renderPublicProfile fetch ns_public_profile
  // twice. Public profile is slow-changing, so cache the result AND the in-flight
  // request for the page session (never localStorage, never cross-user). Both
  // renders share one fetch.
  let publicProfileCache = null;
  let publicProfileInflight = null;

  function loadPublicProfile(username, apply) {
    if (publicProfileCache) { apply(publicProfileCache); return; }
    if (publicProfileInflight) {
      publicProfileInflight.then(function (p) { apply(p); });
      return;
    }
    publicProfileInflight = ApiClient.publicProfile(username)
      .then(function (p) {
        publicProfileCache = p || null;
        return publicProfileCache;
      })
      .catch(function () { return null; })
      .finally(function () { publicProfileInflight = null; });
    publicProfileInflight.then(function (p) { apply(p); });
  }

  /** Render the Public Profile section (M38): enabled flag, bio, interests,
   *  view/edit. Only the authenticated owner. */
  function renderPublicProfile() {
    let container = document.getElementById('profile-public');
    if (!container) return;
    Utils.clear(container);
    if (!Auth.isAuthenticated()) return;

    let username = Auth.getUsername();
    let card = Utils.el('div', { class: 'public-profile-edit-card' });

    // Public profile link (canonical URL).
    let viewLink = Utils.el('a', {
      href: PublicProfile.getUrl(username || ''),
      class: 'btn btn-secondary',
      text: 'View public profile'
    });
    card.appendChild(viewLink);

    // Share (M39): native share / clipboard fallback.
    let shareBtn = Utils.el('button', { class: 'btn btn-secondary', text: 'Share public profile' });
    shareBtn.addEventListener('click', function () {
      PublicProfile.share(username || '').then(function (res) {
        if (res.ok && res.method === 'clipboard') shareBtn.textContent = 'Profile link copied.';
        else if (res.ok && res.method === 'share') { /* native handled */ }
        else {
          // Clipboard fallback (no native share, no prompt). Non-intrusive toast.
          const url = PublicProfile.getUrl(username || '');
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(function () {
              shareBtn.textContent = 'Profile link copied.';
            }).catch(function () {
              window.Modal.toast('Could not copy the link automatically. Use the address bar.', 'warning');
              shareBtn.textContent = 'Share public profile';
            });
          } else {
            window.Modal.toast('Copy this link: ' + url, 'info');
            shareBtn.textContent = 'Share public profile';
          }
        }
      });
    });
    card.appendChild(shareBtn);

    // Enabled toggle.
    let enabledRow = Utils.el('label', { class: 'settings-row' });
    enabledRow.appendChild(Utils.el('span', { text: 'Show my learning profile publicly' }));
    let enabledCheck = Utils.el('input', { type: 'checkbox' });
    enabledRow.appendChild(enabledCheck);
    card.appendChild(enabledRow);

    // Bio field.
    let bioRow = Utils.el('label', { class: 'settings-row public-profile-field' });
    bioRow.appendChild(Utils.el('span', { text: 'Public bio' }));
    let bioInput = Utils.el('textarea', {
      maxlength: '280', rows: '2',
      placeholder: 'A short public description (280 chars max).'
    });
    bioRow.appendChild(bioInput);
    card.appendChild(bioRow);

    // Interests field.
    let interestsRow = Utils.el('label', { class: 'settings-row public-profile-field' });
    interestsRow.appendChild(Utils.el('span', { text: 'Learning interests' }));
    let interestsInput = Utils.el('input', {
      type: 'text',
      placeholder: 'Comma-separated tags, e.g. privacy, linux, self-hosting (max 8)'
    });
    interestsRow.appendChild(interestsInput);
    card.appendChild(interestsRow);

    let status = Utils.el('span', { class: 'profile-edit-error', text: '' });
    let saveBtn = Utils.el('button', { class: 'btn btn-primary', type: 'submit', text: 'Save public profile' });
    let form = Utils.el('form', { class: 'auth-form', autocomplete: 'off' });
    form.appendChild(card);
    form.appendChild(status);
    form.appendChild(saveBtn);

    // Load the current owner's public profile to populate the form.
    // M54: dedupe concurrent renders via a shared in-flight request/cache.
    const token = Sync.getToken();
    loadPublicProfile(username, function (p) {
      if (!p || p.enabled !== true) {
        enabledCheck.removeAttribute('checked');
      } else {
        enabledCheck.setAttribute('checked', '');
        bioInput.value = p.bio || '';
        interestsInput.value = (p.learning_interests || []).join(', ');
      }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const interests = interestsInput.value.split(',').map(function (t) {
        return t.trim();
      }).filter(Boolean).slice(0, 8);
      saveBtn.disabled = true;
      ApiClient.updatePublicProfile(token, {
        public_profile_enabled: enabledCheck.checked,
        bio: bioInput.value.trim() || null,
        learning_interests: interests.length ? interests : null
      }).then(function (res) {
        saveBtn.disabled = false;
        if (res && res.updated === true) {
          status.textContent = '';
          window.Modal.toast('Public profile saved.', 'success');
        } else {
          status.textContent = 'Could not save the public profile.';
        }
      }).catch(function () {
        saveBtn.disabled = false;
        status.textContent = 'Could not save the public profile.';
      });
    });

    container.appendChild(form);
  }

  /**
   * M48: explicit country selector for the Account settings.
   * The country is the user's OWN choice (ISO-3166 alpha-2) — never inferred
   * from IP/GPS/locale/timezone. "Prefer not to say" is a valid no-country state.
   * Saving persists via CountryService (→ updateProfile) and triggers auto-sync.
   */
  // M49: re-render the country selector whenever auth state or sync state changes,
  // so the Account UI reflects the persisted (server-rehydrated) country choice.
  function wireCountrySelectorRefresh() {
    if (window.Auth && Auth.onAuthChange) Auth.onAuthChange(renderAll);
    if (window.Sync && Sync.onStatusChange) {
      Sync.onStatusChange(function () {
        const host = document.querySelector('.country-selector');
        if (host) renderCountrySelectorRefresh(host);
      });
    }
  }
  function renderCountrySelectorRefresh() {
    // Rebuild just the country selector container in place.
    const host = document.querySelector('.country-selector');
    if (host && host.parentNode) {
      const fresh = renderCountrySelector();
      host.parentNode.replaceChild(fresh, host);
    }
  }
  function renderCountrySelector() {
    let wrap = Utils.el('div', { class: 'settings-row country-selector' });
    let labelWrap = Utils.el('span', { class: 'settings-label' });
    labelWrap.appendChild(Utils.el('span', { text: 'Country' }));
    labelWrap.appendChild(Utils.el('span', {
      class: 'settings-label-hint',
      text: 'Choose a country for aggregated community activity. Never inferred from your device.'
    }));
    wrap.appendChild(labelWrap);

    let controls = Utils.el('div', { class: 'country-controls' });
    let searchInput = Utils.el('input', {
      type: 'text',
      placeholder: 'Search countries…',
      autocomplete: 'off'
    });
    let select = Utils.el('select', { class: 'settings-select' });
    let statusLine = Utils.el('span', { class: 'country-status', text: 'Loading countries…' });

    // Current selection indicator.
    let current = (window.CountryRepository && CountryRepository.getCountry) ? CountryRepository.getCountry() : null;

    // Prefer not to say = valid no-country state (clears the choice).
    function clearChoice() {
      if (window.CountryService) CountryService.reset();
      if (window.CountryRepository && CountryRepository.removeCountry) {
        CountryRepository.removeCountry().then(function () {
          statusLine.textContent = 'No country selected (prefer not to say).';
          window.Modal.toast('Country removed.', 'success');
        });
      } else {
        statusLine.textContent = 'No country selected.';
      }
    }

    // Remember the previously-confirmed valid selection so we can restore it if
    // a new save fails (never leave a misleading "saved" state).
    let confirmedCountry = current;

    function applyChoice(code) {
      if (!code) return clearChoice();
      statusLine.textContent = 'Saving…';
      if (window.CountryService) {
        CountryService.select(code);
        CountryService.confirm().then(function (st) {
          if (st && st.status === 'COUNTRY_SET') {
            confirmedCountry = code;
            const name = st.countryName || code;
            statusLine.textContent = 'Selected: ' + name + ' (saved)';
            window.Modal.toast('Country saved: ' + name, 'success');
          } else {
            // Save failed (offline, no_session, network, etc). Show a clear error
            // and preserve the previously valid selection, reverting the select.
            statusLine.textContent = 'Could not save the country. Your previous selection was kept.';
            window.Modal.toast('Could not save the country.', 'error');
            select.value = confirmedCountry || '';
          }
        });
      }
    }

    // Populate the select with all countries + a "prefer not to say" option.
    Data.loadCountriesAll().then(function (list) {
      let data = Array.isArray(list) ? list : [];
      // Keep the current selection highlighted if it is in the list.
      let currentName = null;
      data.forEach(function (c) {
        let opt = Utils.el('option', { value: c.code, text: c.name + ' (' + c.code + ')' });
        if (c.code === current) { opt.setAttribute('selected', ''); currentName = c.name; }
        select.appendChild(opt);
      });
      // "No country / Prefer not to say"
      let noneOpt = Utils.el('option', { value: '', text: 'Prefer not to say' });
      if (!current) noneOpt.setAttribute('selected', '');
      select.insertBefore(noneOpt, select.firstChild);

      searchInput.setAttribute('list', ''); // no native datalist; we filter via JS
      // Simple client-side filter on the select options.
      searchInput.addEventListener('input', function () {
        const q = searchInput.value.trim().toLowerCase();
        Array.prototype.forEach.call(select.options, function (opt) {
          if (opt.value === '') { opt.style.display = ''; return; }
          opt.style.display = opt.text.toLowerCase().indexOf(q) !== -1 ? '' : 'none';
        });
      });

      statusLine.textContent = currentName ? 'Selected: ' + currentName : (current ? 'Selected: ' + current : 'No country selected.');
    }).catch(function () {
      statusLine.textContent = 'Could not load the country list.';
      // Still allow "prefer not to say".
      let noneOpt = Utils.el('option', { value: '', text: 'Prefer not to say' });
      noneOpt.setAttribute('selected', '');
      select.appendChild(noneOpt);
    });

    select.addEventListener('change', function () { applyChoice(select.value); });
    controls.appendChild(searchInput);
    controls.appendChild(select);
    controls.appendChild(statusLine);
    wrap.appendChild(controls);
    return wrap;
  }

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

    // Country (M48): explicit, privacy-respecting country selection.
    card.appendChild(renderCountrySelector());

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

  /* --- Reset progress -------------------------------------------------- */

  function renderResetProgress() {
    let btn = document.getElementById('profile-reset');
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (!Auth.isAuthenticated()) return;
      // M36: reset is server-side. Confirm, call ns_reset_progress, then
      // reload the (now empty) progression locally.
      window.Modal.confirm({
        title: 'Reset your progress?',
        message: 'This permanently removes your completed missions from your account.',
        confirmText: 'Reset progress',
        cancelText: 'Cancel',
        danger: true
      }).then(function (confirmed) {
        if (!confirmed) return;
      runReset();
      });
    });
    function runReset() {
      if (!Auth.isAuthenticated()) return;
      btn.disabled = true;
      const token = Sync.getToken();
      ApiClient.resetProgress(token).then(function (res) {
        btn.disabled = false;
        if (res && res.reset === true) {
          Progress.reset();
          if (window.Progress && Progress.reload) Progress.reload();
          renderStats();
          window.Modal.toast('Progress reset.', 'success');
        } else {
          window.Modal.toast('Could not reset progress. Please try again.', 'error');
        }
      }).catch(function () {
        btn.disabled = false;
        window.Modal.toast('Could not reset progress. Please try again.', 'error');
      });
    }
    // M34/M36: only the authenticated owner can reset their own progression.
    function syncResetVisibility() {
      btn.style.display = Auth.isAuthenticated() ? '' : 'none';
    }
    syncResetVisibility();
    if (window.Session && Session.ensureRestored) {
      Session.ensureRestored().then(syncResetVisibility);
    }
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

    // Backend-gated actions: forms (guest) or account controls (authenticated).
    if (backendEnabled) {
      card.appendChild(isAuth ? renderSignedInActions() : renderGuestForms());
    }

    container.appendChild(card);
  }

  /* --- Auth form helpers (M32: username + password, no email) -------- */

  /** Build a labelled text/password input (DOM, no inline handlers). */
  function formField(labelText, type, placeholder, value) {
    let wrap = Utils.el('label', { class: 'auth-form-field' });
    wrap.appendChild(Utils.el('span', { class: 'auth-form-label', text: labelText }));
    let input = Utils.el('input', {
      type: type,
      placeholder: placeholder,
      value: value || '',
      autocomplete: type === 'password' ? 'current-password' : 'username'
    });
    wrap.appendChild(input);
    return { wrap: wrap, input: input };
  }

  function formError(msg) {
    return Utils.el('span', { class: 'auth-form-error', text: msg || '' });
  }

  /** Handle a successful auth: sync + refresh the account view. */
  function onAuthSuccess() {
    syncStatus = 'syncing';
    renderAll();
    runSyncAndRefresh();
  }

  /** Handle an auth failure with a human-safe message. */
  function onAuthFailure(msg) {
    renderAuthInfo();
    window.Modal.toast(msg || 'Something went wrong.', 'error');
  }

  /** Authenticated controls: signed-in-as + actions. */
  function renderSignedInActions() {
    let actions = Utils.el('div', { class: 'profile-auth-actions' });
    let signedIn = Utils.el('p', {
      class: 'auth-signed-in',
      text: 'Signed in as ' + (Auth.getUsername() || 'you')
    });
    actions.appendChild(signedIn);

    let journeyLink = Utils.el('a', { href: 'journey.html', class: 'btn btn-primary', text: 'Open Learning Journey' });
    actions.appendChild(journeyLink);

    // M37: public learning profile (separate from the private Account).
    let pubLink = Utils.el('a', {
      href: PublicProfile.getUrl(Auth.getUsername() || ''),
      class: 'btn btn-secondary',
      text: 'View public profile'
    });
    actions.appendChild(pubLink);

    let syncNowBtn = Utils.el('button', { class: 'btn btn-secondary', text: 'Sync now' });
    syncNowBtn.addEventListener('click', function () { runSyncAndRefresh(); });
    actions.appendChild(syncNowBtn);

    // M50: the canonical sync status pill lives in the account header
    // (renderAccountSync → #account-sync), so there is exactly ONE sync
    // indicator on the page (no duplication).

    let logoutBtn = Utils.el('button', { class: 'btn btn-secondary', text: 'Sign out' });
    logoutBtn.addEventListener('click', function () {
      Auth.logout();
      syncStatus = 'idle';
      renderAll();
    });
    actions.appendChild(logoutBtn);

    // Change password (M36): only current + new password, confirmation client-side.
    actions.appendChild(renderPasswordForm());

    return actions;
  }

  /** Build the Change password form (authenticated, server-side). */
  function renderPasswordForm() {
    let card = Utils.el('div', { class: 'auth-form-card password-form' });
    card.appendChild(Utils.el('h4', { text: 'Change password' }));
    let cur = formField('Current password', 'password', 'Current password');
    let nw = formField('New password', 'password', 'New password');
    let cf = formField('Confirm new password', 'password', 'Confirm new password');
    let err = formError();
    let btn = Utils.el('button', { class: 'btn btn-primary', type: 'submit', text: 'Change password' });
    let form = Utils.el('form', { class: 'auth-form', autocomplete: 'off' });
    form.appendChild(cur.wrap); form.appendChild(nw.wrap); form.appendChild(cf.wrap);
    form.appendChild(err); form.appendChild(btn);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (nw.input.value !== cf.input.value) { err.textContent = 'New passwords do not match.'; return; }
      err.textContent = '';
      btn.disabled = true;
      Auth.changePassword(cur.input.value, nw.input.value).then(function (res) {
        btn.disabled = false;
        if (res && res.ok) {
          err.textContent = '';
          cur.input.value = ''; nw.input.value = ''; cf.input.value = '';
          window.Modal.toast('Password updated.', 'success');
        } else {
          err.textContent = safeAuthReason(res);
        }
      }).catch(function () {
        btn.disabled = false;
        err.textContent = 'Password could not be changed.';
      });
    });
    card.appendChild(form);
    return card;
  }

  /** Guest forms: Sign in / Create account / Recover (username + password). */
  function renderGuestForms() {
    let forms = Utils.el('div', { class: 'profile-auth-forms' });

    // --- Sign in ---
    let signCard = Utils.el('div', { class: 'auth-form-card' });
    signCard.appendChild(Utils.el('h4', { text: 'Sign in' }));
    let su = formField('Username', 'text', 'Username');
    let sp = formField('Password', 'password', 'Password');
    let signErr = formError();
    let signBtn = Utils.el('button', { class: 'btn btn-primary', type: 'submit', text: 'Sign in' });
    let signForm = Utils.el('form', { class: 'auth-form', autocomplete: 'on' });
    signForm.appendChild(su.wrap); signForm.appendChild(sp.wrap); signForm.appendChild(signErr); signForm.appendChild(signBtn);
    signForm.addEventListener('submit', function (e) {
      e.preventDefault();
      Auth.setAuthenticating(true);
      renderAuthInfo();
      Auth.signIn(su.input.value, sp.input.value).then(function (res) {
        Auth.setAuthenticating(false);
        if (res && res.ok) onAuthSuccess();
        else onAuthFailure('Sign in failed: ' + safeAuthReason(res));
      }).catch(function () {
        Auth.setAuthenticating(false);
        onAuthFailure('Sign in failed: no response from the backend.');
      });
    });
    signCard.appendChild(signForm);
    forms.appendChild(signCard);

    // --- Create account ---
    let createCard = Utils.el('div', { class: 'auth-form-card' });
    createCard.appendChild(Utils.el('h4', { text: 'Create account' }));
    createCard.appendChild(Utils.el('p', { class: 'auth-form-hint', text: 'No email. Pick a username and password.' }));
    let cu = formField('Username', 'text', 'Username');
    let cp = formField('Password', 'password', 'Password');
    let cc = formField('Confirm password', 'password', 'Confirm password');
    let createErr = formError();
    let createBtn = Utils.el('button', { class: 'btn btn-primary', type: 'submit', text: 'Create account' });
    let createForm = Utils.el('form', { class: 'auth-form', autocomplete: 'off' });
    createForm.appendChild(cu.wrap); createForm.appendChild(cp.wrap); createForm.appendChild(cc.wrap);
    createForm.appendChild(createErr); createForm.appendChild(createBtn);
    createForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const uname = cu.input.value;
      const pass = cp.input.value;
      const confirm = cc.input.value;
      if (pass !== confirm) { createErr.textContent = 'Passwords do not match.'; return; }
      Auth.setAuthenticating(true);
      renderAuthInfo();
      Auth.createAccount(uname, pass).then(function (res) {
        Auth.setAuthenticating(false);
        if (res && res.ok) {
          showRecoveryKeyNotice(res.recovery_key);
          onAuthSuccess();
        } else {
          onAuthFailure('Account creation failed: ' + safeAuthReason(res));
        }
      }).catch(function () {
        Auth.setAuthenticating(false);
        onAuthFailure('Account creation failed: no response from the backend.');
      });
    });
    createCard.appendChild(createForm);
    forms.appendChild(createCard);

    // --- Recover account (M33: recovery is NOT a sign-in; it sets a new
    // password, then the user signs in normally with username + password) ---
    let recCard = Utils.el('div', { class: 'auth-form-card' });
    recCard.appendChild(Utils.el('h4', { text: 'Recover account' }));
    recCard.appendChild(Utils.el('p', {
      class: 'auth-form-hint',
      text: 'Use your recovery key to set a new password. You will then sign in normally.'
    }));
    let ru = formField('Username', 'text', 'Username');
    let rk = formField('Recovery key', 'text', 'NSK1-XXXX-XXXX-XXXX-XXXX');
    let rn = formField('New password', 'password', 'New password');
    let rn2 = formField('Confirm new password', 'password', 'Confirm new password');
    let recErr = formError();
    let recBtn = Utils.el('button', { class: 'btn btn-secondary', type: 'submit', text: 'Recover account' });
    let recForm = Utils.el('form', { class: 'auth-form', autocomplete: 'off' });
    recForm.appendChild(ru.wrap); recForm.appendChild(rk.wrap); recForm.appendChild(rn.wrap);
    recForm.appendChild(rn2.wrap); recForm.appendChild(recErr); recForm.appendChild(recBtn);
    recForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (rn.input.value !== rn2.input.value) { recErr.textContent = 'Passwords do not match.'; return; }
      Auth.setAuthenticating(true);
      renderAuthInfo();
      Auth.recoverAccount(ru.input.value, rk.input.value, rn.input.value).then(function (res) {
        Auth.setAuthenticating(false);
        if (res && res.ok) {
          // Recovery sets a new password; prompt to sign in normally.
          window.Modal.toast('Account recovered. Please sign in with your username and new password.', 'success');
          renderAuthInfo();
        } else onAuthFailure('Recovery failed: ' + safeAuthReason(res));
      }).catch(function () {
        Auth.setAuthenticating(false);
        onAuthFailure('Recovery failed: no response from the backend.');
      });
    });
    recCard.appendChild(recForm);
    forms.appendChild(recCard);

    return forms;
  }

  /** Show the recovery key once after account creation (never persisted). */
  function showRecoveryKeyNotice(recoveryKey) {
    if (!recoveryKey) return;
    let notice = Utils.el('div', { class: 'auth-recovery-notice' });
    notice.appendChild(Utils.el('h4', { text: 'Your recovery key' }));
    let code = Utils.el('code', { class: 'auth-recovery-key', text: recoveryKey });
    notice.appendChild(code);
    notice.appendChild(Utils.el('p', {
      class: 'auth-recovery-warning',
      text: 'Save this recovery key somewhere safe. It is shown once and is never stored in localStorage.'
    }));
    notice.appendChild(Utils.el('button', {
      class: 'btn btn-secondary', text: 'I have saved it'
    }));
    notice.querySelector('button').addEventListener('click', function () { notice.remove(); });
    // Insert after the profile-auth card.
    let target = document.getElementById('profile-auth');
    if (target) target.appendChild(notice);
  }

  /** Human-safe, generic reason for an auth failure (no secrets/exceptions). */
  function safeAuthReason(res) {
    if (!res || !res.reason) return 'the backend is unavailable.';
    const map = {
      'authentication-unavailable-offline': 'authentication is not available offline.',
      'crypto-unavailable': 'secure crypto is unavailable in this browser.',
      'invalid_credentials': 'the username or password is not correct.',
      'invalid_username': 'the username is invalid.',
      'invalid_password_hash': 'the password is invalid.',
      'username_taken': 'that username is already taken.',
      'invalid_recovery_key': 'the recovery key was not accepted.',
      'no-token': 'the server did not return a valid session.',
      unauthorized: 'your credentials were not accepted.',
      forbidden: 'you are not allowed to do this.',
      network_error: 'a network error occurred.',
      offline: 'the backend is offline.'
    };
    return map[res.reason] || 'the backend could not process the request.';
  }

  function renderAll() {
    // M49: keep the account header sync indicator in sync with auth state.
    renderAccountSync();
    // M34: private account data (profile, stats, settings, recovery) is only
    // shown to the authenticated owner. A guest sees the authentication gateway
    // and the account forms.
    const authd = Auth.isAuthenticated();
    let profile = authd ? UserProfile.init() : null;
    renderProfile(profile);
    renderCreated(profile);
    if (authd) {
      renderStats();
      renderSettings();
      renderRecovery();
      renderPublicProfile();
    } else {
      clearSection('profile-stats');
      clearSection('profile-settings');
      clearSection('profile-recovery');
      clearSection('profile-public');
    }
    renderAuthInfo();
    applyThemeFromSettings();
  }

  /** Empty a named section container (guest state). */
  function clearSection(id) {
    const el = document.getElementById(id);
    if (el) Utils.clear(el);
  }

  function init() {
    renderResetProgress();
    wireCountrySelectorRefresh();
    wireSyncStatus();
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
