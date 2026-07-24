/* theme.js — theme switching. Loaded FIRST on every page, before nav.js.
 * Themes: Light (default) → Dark → High Contrast → Vintage → (loop)
 * Applied by setting data-theme on <html>. Persisted in localStorage 'igcse-theme'.
 * Light uses an empty data-theme so :root defaults apply.
 */
(function () {
  'use strict';

  window.THEMES = ['light', 'dark', 'high-contrast', 'vintage'];
  window.THEME_ICONS = { light: '☀️', dark: '🌙', 'high-contrast': '◑', vintage: '📜' };
  window.THEME_LABELS = { light: 'Light', dark: 'Dark', 'high-contrast': 'High Contrast', vintage: 'Vintage' };

  function getTheme() {
    var t = localStorage.getItem('igcse-theme') || 'light';
    return window.THEMES.indexOf(t) === -1 ? 'light' : t;
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme === 'light' ? '' : theme);
    localStorage.setItem('igcse-theme', theme);
  }

  function cycleTheme() {
    var current = getTheme();
    var next = window.THEMES[(window.THEMES.indexOf(current) + 1) % window.THEMES.length];
    applyTheme(next);
    document.dispatchEvent(new CustomEvent('themechange', { detail: next }));
    return next;
  }

  // Expose
  window.getTheme = getTheme;
  window.applyTheme = applyTheme;
  window.cycleTheme = cycleTheme;

  // Apply immediately on load (runs as soon as script is parsed in <head>)
  applyTheme(getTheme());
})();
