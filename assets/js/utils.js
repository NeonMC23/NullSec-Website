/**
 * NullSec — Utility Functions
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
    // Handle both '2026-07-27' and '2026-07-27T14:00:00' formats
    let dateStr = isoString;
    if (dateStr.indexOf('T') === -1) {
      dateStr += 'T00:00:00Z';
    } else {
      dateStr += 'Z';
    }
    let date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    });
  },

  /**
   * Get the current theme from the Store module.
   * @returns {'dark'|'light'}
   */
  getTheme() {
    return Store.get(Store.keys.THEME) || 'dark';
  },

  /**
   * Set the theme and persist it.
   * @param {'dark'|'light'} theme
   */
  setTheme(theme) {
    Store.set(Store.keys.THEME, theme);
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

  /**
   * Return a safe external URL, or '#' if the scheme is not http/https.
   * Prevents javascript:/data: injection through data fields.
   * @param {string} url
   * @returns {string}
   */
  safeUrl(url) {
    if (typeof url !== 'string') return '#';
    try {
      const u = new URL(url, window.location.href);
      return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : '#';
    } catch (e) {
      return '#';
    }
  },

  /** Remove all children of an element. */
  clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  },

  /**
   * Simple deterministic string hash (FNV-1a 32-bit).
   * @param {string} str
   * @returns {number} unsigned 32-bit hash
   */
  hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return h;
  },

  /**
   * Build a DOM element safely. All string values are set via textContent
   * (auto-escaped), attribute names go through setAttribute. The only way
   * to insert raw HTML is the explicit `html` attr (trusted content).
   *
   * @param {string} tag
   * @param {object} [attrs]  { class, text, html(trusted), style, ...setAttribute }
   * @param {...Node|string} children appended (strings become text nodes)
   */
  el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach((k) => {
        const v = attrs[k];
        if (v === null || v === undefined) return;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'html') node.innerHTML = v; // trusted HTML only
        else if (k === 'style') node.style.cssText = v;
        else if (k === 'dataset') {
          Object.assign(node.dataset, v);
        } else {
          node.setAttribute(k, v);
        }
      });
    }
    children.forEach((c) => {
      if (c === null || c === undefined) return;
      if (typeof c === 'string' || typeof c === 'number') {
        node.appendChild(document.createTextNode(String(c)));
      } else {
        node.appendChild(c);
      }
    });
    return node;
  },
};

