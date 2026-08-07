/**
 * NullSec — Progress Service
 * ------------------------------------------------------------------
 * Unified abstraction layer for all user progression data (missions,
 * weekly mission, read articles). UI modules no longer touch Store
 * directly for progression — they call window.Progress.
 *
 * Data model: see docs/progress-schema.md
 *   {
 *     version: 1,
 *     identity_id: "<uuid>",
 *     missions: { "<id>": { completed, completed_at } },
 *     articles: { "<slug>": { read, read_at } },
 *     weekly:   { "<id>": { completed, completed_at } },
 *     updated_at: "<iso>"
 *   }
 *
 * Progression is associated with the local identity (Identity.get().id),
 * stored locally via Store, and ready for a future synchronization layer
 * (no network, no account, no authentication).
 *
 * API:
 *   Progress.init()
 *   Progress.get()
 *   Progress.save(data)
 *   Progress.reset()
 *   Progress.isCompleted(id)
 *   Progress.complete(id)
 *   Progress.uncomplete(id)
 *   Progress.isArticleRead(slug)
 *   Progress.markArticleRead(slug)
 *   Progress.unmarkArticleRead(slug)
 */
(function () {
  'use strict';

  const VERSION = 1;
  const WEEKLY_ID = 'weekly-community';

  let state = null; // cached in-memory progress object (single source)

  function now() {
    return new Date().toISOString();
  }

  /** Build an empty progression object bound to the given identity id. */
  function createEmpty(identityId) {
    return {
      version: VERSION,
      identity_id: identityId,
      missions: {},
      articles: {},
      weekly: {},
      updated_at: now()
    };
  }

  /** Resolve the current local identity (creating it if absent). */
  function resolveIdentity() {
    if (!Identity.get()) Identity.init();
    return Identity.get();
  }

  /**
   * Initialise the progression service: load current identity, load the
   * unified progression, or create an empty one. Idempotent and safe to call
   * on every page load.
   *
   * M20: the legacy per-key migration (ns:journey:progress / ns:weekly:progress
   * / ns:article:read:{slug}) was removed. Those keys are purged by
   * Store.migrate() on load and are account data — the progression now lives in
   * memory (session) via ProgressRepository, with Supabase as source of truth.
   * @returns {object} the progress object
   */
  function init() {
    if (state) return state;
    let identity = resolveIdentity();
    let progress = ProgressRepository.get();

    if (progress && progress.version === VERSION && progress.identity_id === identity.id) {
      state = progress;
      return state;
    }

    state = progress && progress.version === VERSION ? progress : createEmpty(identity.id);
    ProgressRepository.save(state);
    return state;
  }

  /** Return the current progress object (initialises if needed). */
  function get() {
    if (!state) init();
    return state;
  }

  /**
   * Replace the entire progress object. Preserves the identity binding.
   * @param {object} data
   * @returns {object} the saved progress
   */
  function save(data) {
    if (!data || typeof data !== 'object') return get();
    let identity = resolveIdentity();
    state = {
      version: VERSION,
      identity_id: identity.id,
      missions: data.missions || {},
      articles: data.articles || {},
      weekly: data.weekly || {},
      updated_at: now()
    };
    ProgressRepository.save(state);
    notifySync();
    return state;
  }

  /** Reset progression to an empty state (identity preserved). */
  function reset() {
    let identity = resolveIdentity();
    state = createEmpty(identity.id);
    ProgressRepository.save(state);
    notifySync();
    return state;
  }

  /** Which sub-map holds a given mission id (weekly vs missions). */
  function targetMap(id) {
    return id === WEEKLY_ID ? state.weekly : state.missions;
  }

  /** True if a mission (including the weekly one) is completed. */
  function isCompleted(id) {
    get(); // ensure state is initialized
    let map = targetMap(id);
    return !!(map[id] && map[id].completed);
  }

  /** Mark a mission (or weekly) as completed. Returns the progress. */
  /** Report an anonymous mission completion (no identity/location). */
  function notifyActivity(id) {
    if (typeof window === 'undefined' || !window.Sync || !window.Sync.reportActivity) return;
    // Look up the mission's country/region from the data layer (best-effort).
    let country = null;
    let region = 'Europe';
    if (window.Journey && window.Journey.getMissionById) {
      const m = window.Journey.getMissionById(id);
      country = (m && m.country) || null;
      region = (m && m.region) || 'Europe';
    }
    window.Sync.reportActivity(id, country, region);
  }

  function complete(id) {
    get(); // ensure state is initialized
    let map = targetMap(id);
    map[id] = { completed: true, completed_at: now() };
    state.updated_at = now();
    ProgressRepository.save(state);
    notifySync();
    notifyActivity(id);
    return state;
  }

  /** Unmark a mission (or weekly). Returns the progress. */
  function uncomplete(id) {
    get(); // ensure state is initialized
    let map = targetMap(id);
    if (map[id]) delete map[id];
    state.updated_at = now();
    ProgressRepository.save(state);
    notifySync();
    return state;
  }

  /** Notify the sync service (if loaded & enabled) after a mutation. */
  function notifySync() {
    if (typeof window !== 'undefined' && window.Sync && window.Sync.notifyChanged) {
      window.Sync.notifyChanged();
    }
  }

  /** True if an article is marked as read. */
  function isArticleRead(slug) {
    get(); // ensure state is initialized
    return !!(state.articles[slug] && state.articles[slug].read);
  }

  /** Mark an article as read. */
  function markArticleRead(slug) {
    get(); // ensure state is initialized
    state.articles[slug] = { read: true, read_at: now() };
    state.updated_at = now();
    ProgressRepository.save(state);
    notifySync();
    return state;
  }

  /** Unmark an article. */
  function unmarkArticleRead(slug) {
    get(); // ensure state is initialized
    if (state.articles[slug]) delete state.articles[slug];
    state.updated_at = now();
    ProgressRepository.save(state);
    notifySync();
    return state;
  }

  window.Progress = {
    init: init,
    get: get,
    save: save,
    reset: reset,
    isCompleted: isCompleted,
    complete: complete,
    uncomplete: uncomplete,
    isArticleRead: isArticleRead,
    markArticleRead: markArticleRead,
    unmarkArticleRead: unmarkArticleRead
  };
})();
