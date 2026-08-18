/**
 * NullSec — Sync Service
 * ------------------------------------------------------------------
 * Synchronizes local user data (profile, settings, progress) with the
 * backend when it is enabled and online. When offline, it only reads/writes
 * through the local Store, preserving the offline-first behavior.
 *
 *   UI
 *    ↓
 * SyncService (sync-service.js)
 *    ↓
 * SyncResolver (sync-resolver.js)   — conflict resolution
 *    ↓
 * API Client (api-client.js)
 *    ↓
 * Backend
 *    ↓
 * Database
 *
 * Offline behavior: Store only. Online: sync changes.
 *
 * Sync triggers (call sites): after login, after profile update, after
 * settings update, after progression changes. No background tracking.
 *
 * API:
 *   Sync.isEnabled()            — backend enabled AND online AND syncEnabled
 *   Sync.isOnline()             — backend available right now
 *   Sync.sync()                 — full pull → resolve → push cycle
 *   Sync.push()                 — push local changes if online
 *   Sync.pull()                 — pull server state if online
 *   Sync.resolveConflicts(local, server) — merge via SyncResolver
 *   Sync.setToken(token)/getToken()/clearToken()
 */
(function () {
  'use strict';

  let sessionToken = null;

  // Sync status: 'synced' | 'syncing' | 'pending' | 'offline' | 'failed'.
  // Shared, single source of truth for the account sync indicator.
  let status = 'synced';
  const statusListeners = [];

  function setStatus(next) {
    if (status === next) return;
    status = next;
    statusListeners.slice().forEach(function (cb) { try { cb(status); } catch (e) {} });
  }
  function getStatus() { return status; }
  function onStatusChange(cb) {
    if (typeof cb === 'function') statusListeners.push(cb);
    return function () { const i = statusListeners.indexOf(cb); if (i !== -1) statusListeners.splice(i, 1); };
  }

  function isEnabled() {
    const c = Config.get();
    return ApiClient.isBackendAvailable() && c.syncEnabled === true;
  }

  /** Backend currently available (enabled + online). */
  function isOnline() {
    return ApiClient.isBackendAvailable();
  }

  /** Collect the local syncable payload (with timestamps). */
  function collectPayload() {
    return {
      identity_id: Identity.get() ? Identity.get().id : null,
      profile: UserProfile.get(),
      settings: Settings.get(),
      progress: Progress.get()
    };
  }

  /**
   * Resolve conflicts between local and server payloads.
   * @param {object} local
   * @param {object} server
   * @returns {{merged: object, resolutions: object}}
   */
  function resolveConflicts(local, server) {
    return SyncResolver.merge(local, server);
  }

  /** Push local changes to the backend (no-op offline). */
  function push() {
    if (!isEnabled() || !sessionToken) {
      setStatus(isEnabled() ? 'offline' : 'offline');
      return Promise.resolve(false);
    }
    setStatus('syncing');
    return ApiClient.sync(sessionToken, collectPayload()).then(function () {
      setStatus('synced');
      return true;
    }).catch(function () {
      // Offline/network error → keep local changes pending for a later retry.
      setStatus('offline');
      return false;
    });
  }

  /** Pull server state (no-op offline). @returns {Promise<object|null>} */
  function pull() {
    if (!isEnabled() || !sessionToken) return Promise.resolve(null);
    return ApiClient.pull(sessionToken).catch(function () {
      return null;
    });
  }

  /**
   * Full synchronization cycle: pull server state, resolve conflicts,
   * persist merged local state, then push. Offline → resolves null.
   * @returns {Promise<object|null>}
   */
  function sync() {
    if (!isEnabled() || !sessionToken) return Promise.resolve(null);
    return pull().then(function (server) {
      if (!server) return null;
      const local = collectPayload();
      const res = resolveConflicts(local, server);
      applyMerged(res.merged);
      // M46 REAL-DEPLOY FIX (data-loss): applyMerged writes the merged (server)
      // block into the repositories, but Progress.get() returns the in-memory
      // `state`, which is NOT updated by ProgressRepository.save(). Without
      // reloading before push, the push() below re-sends the still-empty
      // in-memory progress and wipes the server's real progression on re-login
      // from a fresh device. Reload in-memory state from the merged repository
      // before pushing so we never send a stale empty default back to the server.
      if (window.Progress && typeof Progress.reload === 'function') Progress.reload();
      return push().then(function () { return res; });
    });
  }

  /**
   * Persist merged blocks back into the local services/Store.
   * The profile may not carry identity_id (the server links it via user_id),
   * so it is applied when it has at least one syncable field.
   */
  function applyMerged(merged) {
    if (merged.settings && merged.settings.version) {
      SettingsRepository.save(merged.settings);
    }
    if (merged.progress && merged.progress.version) {
      ProgressRepository.save(merged.progress);
    }
    if (merged.profile && (merged.profile.username !== undefined ||
      merged.profile.avatar_seed !== undefined || merged.profile.identity_id)) {
      // Preserve the local identity link if the server block lacks one.
      const p = merged.profile;
      if (!p.identity_id && Identity.get()) p.identity_id = Identity.get().id;
      ProfileRepository.save(p);
    }
  }

  function setToken(token) {
    sessionToken = token || null;
  }

  function getToken() {
    return sessionToken;
  }

  function clearToken() {
    sessionToken = null;
  }

  /** Debounced push used as a sync trigger after local mutations. */
  let pendingTimer = null;
  let retryTimer = null;
  let retryDelay = 1000;           // small backoff base (ms)
  let syncInFlight = false;

  /**
   * M48: automatic sync. Local changes mark the state dirty/pending and queue a
   * debounced push. If a push fails (offline), we keep the changes pending and
   * retry with a small bounded backoff — never an infinite aggressive loop.
   * @returns {boolean} whether work was queued
   */
  function scheduleSync() {
    if (!isEnabled()) { setStatus('offline'); return false; }
    if (syncInFlight) { setStatus('pending'); return false; }
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(function () {
      retryTimer = null;
      syncInFlight = true;
      push().then(function (ok) {
        syncInFlight = false;
        if (ok) {
          setStatus('synced');
          retryDelay = 1000; // reset backoff after success
        } else {
          // Offline → stay pending, schedule a bounded retry.
          setStatus('offline');
          retryDelay = Math.min(retryDelay * 2, 30000);
          retryTimer = setTimeout(function () { retryTimer = null; scheduleSync(); }, retryDelay);
        }
      });
    }, 400);
    setStatus('pending');
    return true;
  }

  function notifyChanged() {
    return scheduleSync();
  }

  /** Immediately trigger a full pull→resolve→push cycle (manual "Sync now"). */
  function syncNow() {
    if (!isEnabled()) { setStatus('offline'); return Promise.resolve(false); }
    setStatus('syncing');
    return sync().then(function (res) {
      setStatus('synced');
      return !!res;
    }).catch(function () {
      setStatus('offline');
      return false;
    });
  }

  /**
   * Report an anonymous mission completion to the community layer.
   * Only bumps aggregated counters — never attaches identity or location.
   * No-op when offline (no network request).
   * @param {string} missionId
   * @param {string|null} country two-letter code or null
   */
  /**
   * Report an anonymous mission completion to the community impact pipeline.
   * Only aggregated counters — never identity, username, recovery key or session.
   * @param {string} missionId
   * @param {string|null} countryCode two-letter ISO code or null
   * @param {string} region e.g. 'Europe'
   */
  function reportActivity(missionId, countryCode, region) {
    if (!isOnline()) return;
    ApiClient.communityActivity({
      mission_id: missionId,
      country_code: countryCode || null,
      region: region || 'Europe',
      timestamp: new Date().toISOString()
    }).catch(function () {
      // Ignore network errors; aggregation is best-effort and anonymous.
    });
  }

  window.Sync = {
    isEnabled: isEnabled,
    isOnline: isOnline,
    sync: sync,
    push: push,
    pull: pull,
    resolveConflicts: resolveConflicts,
    setToken: setToken,
    getToken: getToken,
    clearToken: clearToken,
    notifyChanged: notifyChanged,
    syncNow: syncNow,
    scheduleSync: scheduleSync,
    getStatus: getStatus,
    onStatusChange: onStatusChange,
    reportActivity: reportActivity
  };
})();
