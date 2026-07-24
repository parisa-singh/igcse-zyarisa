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
  // Representative colors per theme [background, accent, accent-warm, green] — used for the palette swatches.
  window.THEME_SWATCHES = {
    light:           ['#f8f7f4', '#3d5a80', '#c9714a', '#4a7c59'],
    dark:            ['#12111e', '#7aa2c8', '#d9895e', '#6aab80'],
    'high-contrast': ['#ffffff', '#003580', '#b34000', '#1a6e36'],
    vintage:         ['#f5efdc', '#5c3d1e', '#a0522d', '#3d6b44']
  };

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
    return setTheme(next);
  }

  // Set a specific theme directly (used by the palette picker).
  function setTheme(theme) {
    if (window.THEMES.indexOf(theme) === -1) theme = 'light';
    applyTheme(theme);
    document.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
    return theme;
  }

  // Expose
  window.getTheme = getTheme;
  window.applyTheme = applyTheme;
  window.cycleTheme = cycleTheme;
  window.setTheme = setTheme;

  // Apply immediately on load (runs as soon as script is parsed in <head>)
  applyTheme(getTheme());
})();
