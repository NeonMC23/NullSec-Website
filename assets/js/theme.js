/**
 * NullSec — Theme Manager
 * Handles dark/light mode toggle with localStorage persistence.
 * Dark mode is the default.
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'nullsec-theme';
  const THEME_DARK = 'dark';
  const THEME_LIGHT = 'light';

  /** Apply the saved theme or fall back to dark. */
  function applySavedTheme() {
    const saved = localStorage.getItem(STORAGE_KEY) || THEME_DARK;
    document.documentElement.setAttribute('data-theme', saved);
  }

  /** Toggle between dark and light. */
  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || THEME_DARK;
    const next = current === THEME_DARK ? THEME_LIGHT : THEME_DARK;
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(STORAGE_KEY, next);
    updateToggleIcon(next);
  }

  /** Update the toggle button icon based on current theme. */
  function updateToggleIcon(theme) {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.innerHTML = theme === THEME_DARK
      ? '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  }

  /** Initialise the theme system. */
  function init() {
    applySavedTheme();
    const current = document.documentElement.getAttribute('data-theme') || THEME_DARK;
    updateToggleIcon(current);

    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) toggleBtn.addEventListener('click', toggleTheme);
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
