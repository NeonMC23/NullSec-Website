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
   * M46 REAL-DEPLOY FIX — an EMPTY default block must never clobber real data.
   *
   * On a fresh page/device, Progress.get() (and settings/profile) produce an
   * EMPTY default block stamped with updated_at = now(). Under plain
   * "newest updated_at wins", that empty-but-fresh block wins over the server's
   * real (older-timestamped) progression, so re-login from a new device WIPED
   * the user's progression (verified data-loss during real-browser E2E).
   *
   * Rule: if exactly one side is empty, the populated side always wins,
   * regardless of timestamps. This keeps PROGRESS != LOCAL DATA: local empty
   * defaults cannot overwrite server-authoritative progression.
   */
  function isEmpty(block, key) {
    if (!block || typeof block !== 'object') return true;
    if (key === 'progress') {
      const has = function (o) { return o && typeof o === 'object' && Object.keys(o).length > 0; };
      return !has(block.missions) && !has(block.articles) && !has(block.weekly);
    }
    if (key === 'profile') {
      return !block.username && !block.avatar_seed && !block.identity_id;
    }
    if (key === 'settings') {
      return Object.keys(block).every(function (k) { return k === 'updated_at'; });
    }
    return false;
  }

  /**
   * Merge a local and a server copy of one block (profile/settings/progress).
   * @param {object|null} local
   * @param {object|null} server
   * @param {string} [key] block kind ('progress'|'profile'|'settings') for the
   *   empty-default guard.
   * @returns {{value: object|null, winner: 'local'|'server'|'none'}}
   */
  function mergeBlock(local, server, key) {
    if (!local && !server) return { value: null, winner: 'none' };
    if (!local) return { value: server, winner: 'server' };
    if (!server) return { value: local, winner: 'local' };
    const localEmpty = isEmpty(local, key);
    const serverEmpty = isEmpty(server, key);
    if (localEmpty !== serverEmpty) {
      return serverEmpty
        ? { value: local, winner: 'local' }
        : { value: server, winner: 'server' };
    }
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
      const r = mergeBlock(local && local[k], server && server[k], k);
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
