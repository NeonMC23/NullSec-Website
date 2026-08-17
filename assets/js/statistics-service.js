/**
 * NullSec — Statistics Service
 * ------------------------------------------------------------------
 * Read-only aggregation of user progression data. Calculations live here,
 * outside the UI modules. Data source is the Progress service (which in turn
 * uses Store) — this module never writes progression data.
 *
 *   Statistics
 *        │
 *        v
 *      Progress
 *        │
 *        v
 *      Store
 *
 * `missions_total` is derived from the mission dataset (Data layer). Because
 * that may require an async load, Statistics.get() returns a Promise.
 *
 * API:
 *   Statistics.get()  → Promise<{
 *                         missions_completed: number,
 *                         missions_total: number,
 *                         articles_read: number,
 *                         weekly_completed: number,
 *                         completion_percent: number
 *                       }>
 */
(function () {
  'use strict';

  const WEEKLY_ID = 'weekly-community';

  /** Count entries in an object map that satisfy a predicate. */
  function count(map, pred) {
    if (!map) return 0;
    let n = 0;
    Object.keys(map).forEach(function (k) {
      if (pred(map[k])) n++;
    });
    return n;
  }

  /**
   * Compute statistics.
   * @returns {Promise<object>}
   */
  function get() {
    return Data.loadMissions().then(function (missions) {
      const progress = Progress.get();
      const missionsTotal = Array.isArray(missions) ? missions.length : 0;

      const missionsCompleted = count(progress.missions, function (m) {
        return !!(m && m.completed);
      });
      const articlesRead = count(progress.articles, function (a) {
        return !!(a && a.read);
      });
      const weeklyDone = !!(progress.weekly && progress.weekly[WEEKLY_ID] &&
        progress.weekly[WEEKLY_ID].completed);
      const weeklyCompleted = weeklyDone ? 1 : 0;

      const completed = missionsCompleted + weeklyCompleted;
      const completionPercent = missionsTotal > 0
        ? Math.round((completed / missionsTotal) * 100)
        : 0;

      return {
        missions_completed: missionsCompleted,
        missions_total: missionsTotal,
        articles_read: articlesRead,
        weekly_completed: weeklyCompleted,
        completion_percent: completionPercent
      };
    });
  }

  window.Statistics = {
    get: get
  };
})();
