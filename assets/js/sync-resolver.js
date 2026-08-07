/**
 * NullSec — Sync Resolver
 * ------------------------------------------------------------------
 * Conflict-resolution foundation for synchronization. Pure logic, no DOM,
 * no network. Strategy (v1): **newest `updated_at` wins** for each data
 * block (profile, settings, progress).
 *
 * Each syncable block carries a timestamp. When merging local vs server,
 * the block with the most recent `updated_at` is kept. This prevents
 * overwriting newer data and prepares future, more advanced merge
 * strategies (per-field, vector clocks, etc.).
 *
 * API:
 *   SyncResolver.merge(local, server) → merged result + resolution
 */
(function () {
  'use strict';

  /** Read the updated_at of a block, or null. */
  function tsOf(block) {
    return block && typeof block === 'object' ? (block.updated_at || null) : null;
  }

  function newer(a, b) {
    const ta = tsOf(a);
    const tb = tsOf(b);
    if (!ta) return 'server';  // local missing timestamp → server wins
    if (!tb) return 'local';   // server missing timestamp → local wins
    return ta >= tb ? 'local' : 'server';
  }

  /**
   * Merge a local and a server copy of one block (profile/settings/progress).
   * @param {object|null} local
   * @param {object|null} server
   * @returns {{value: object|null, winner: 'local'|'server'|'none'}}
   */
  function mergeBlock(local, server) {
    if (!local && !server) return { value: null, winner: 'none' };
    if (!local) return { value: server, winner: 'server' };
    if (!server) return { value: local, winner: 'local' };
    const w = newer(local, server);
    return { value: w === 'local' ? local : server, winner: w };
  }

  /**
   * Merge local and server sync payloads.
   * @param {object} local  { profile, settings, progress }
   * @param {object} server { profile, settings, progress }
   * @returns {{merged: object, resolutions: object}}
   */
  function merge(local, server) {
    const keys = ['profile', 'settings', 'progress'];
    const merged = {};
    const resolutions = {};
    keys.forEach(function (k) {
      const r = mergeBlock(local && local[k], server && server[k]);
      merged[k] = r.value;
      resolutions[k] = r.winner;
    });
    return { merged: merged, resolutions: resolutions };
  }

  window.SyncResolver = {
    merge: merge,
    mergeBlock: mergeBlock,
    _newer: newer
  };
})();
