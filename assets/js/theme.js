/**
 * NullSec — Theme Manager
 * Handles dark/light mode. The source of truth is the Settings service
 * (theme: 'system' | 'dark' | 'light'). A resolved theme is also mirrored
 * to Store (ns:theme) for backward compatibility.
 */
(function () {
  'use strict';

  const THEME_DARK = 'dark';
  const THEME_LIGHT = 'light';

  /** Resolve the effective theme from Settings (handles 'system'). */
  function resolveTheme(pref) {
    if (pref === THEME_DARK || pref === THEME_LIGHT) return pref;
    let dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return dark ? THEME_DARK : THEME_LIGHT;
  }

  /** Apply the saved theme (from Settings) to <html> and mirror to Store. */
  function applySavedTheme() {
    let pref = THEME_DARK;
    if (window.Settings) {
      let s = Settings.get();
      pref = (s && s.theme) || THEME_DARK;
    } else {
      pref = Store.get(Store.keys.THEME) || THEME_DARK;
    }
    const theme = resolveTheme(pref);
    document.documentElement.setAttribute('data-theme', theme);
    Store.set(Store.keys.THEME, theme);
    return theme;
  }

  /** Toggle between dark and light (persisted via Settings). */
  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || THEME_DARK;
    const next = current === THEME_DARK ? THEME_LIGHT : THEME_DARK;
    if (window.Settings) Settings.update({ theme: next });
    Store.set(Store.keys.THEME, next);
    document.documentElement.setAttribute('data-theme', next);
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
    const current = applySavedTheme();
    updateToggleIcon(current);

    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) toggleBtn.addEventListener('click', toggleTheme);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
