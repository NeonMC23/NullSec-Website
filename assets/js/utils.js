/**
 * Nullsec — Utility Functions
 * Shared helpers used across modules.
 */

const Utils = {
  /**
   * Debounce a function call.
   * @param {Function} fn
   * @param {number} ms
   * @returns {Function}
   */
  debounce(fn, ms = 200) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  },

  /**
   * Format an ISO date string to a human-readable form.
   * @param {string} isoString  e.g. "2026-07-27"
   * @returns {string}          e.g. "July 27, 2026"
   */
  formatDate(isoString) {
    const date = new Date(isoString + 'T00:00:00Z');
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });
  },

  /**
   * Get the current theme from localStorage.
   * @returns {'dark'|'light'}
   */
  getTheme() {
    return localStorage.getItem('nullsec-theme') || 'dark';
  },

  /**
   * Set the theme and persist it.
   * @param {'dark'|'light'} theme
   */
  setTheme(theme) {
    localStorage.setItem('nullsec-theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  },

  /**
   * Simple check for reduced-motion preference.
   * @returns {boolean}
   */
  prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  },

  /**
   * Get the current page's path, e.g. "/articles/signal-vs-whatsapp.html".
   * @returns {string}
   */
  currentPath() {
    return window.location.pathname;
  },

  /**
   * Sanitize a string for safe DOM insertion (basic XSS protection).
   * @param {string} str
   * @returns {string}
   */
  sanitize(str) {
    const el = document.createElement('div');
    el.textContent = str;
    return el.innerHTML;
  },
};
