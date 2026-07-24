/* nav.js — the single shared nav. Injected into #nav-container on every page.
 * Requires theme.js to have loaded first (uses window.getTheme / cycleTheme / THEME_ICONS).
 * Update this file to update the nav everywhere.
 */
(function () {
  'use strict';

  var LINKS = [
    { href: '/index.html', label: 'Home' },
    { href: '/study-system.html', label: 'Study System' },
    { href: '/resources.html', label: 'Resources' },
    { href: '/past-papers.html', label: 'Past Papers' }
  ];

  var SUBJECTS = [
    { href: '/subjects/international-math.html', label: 'International Mathematics', code: '0607' },
    { href: '/subjects/english-literature.html', label: 'English Literature', code: '0475' },
    { href: '/subjects/english-language.html', label: 'English Language', code: '0500' },
    { href: '/subjects/french.html', label: 'French', code: '0520' },
    { href: '/subjects/business.html', label: 'Business Studies', code: '0450' },
    { href: '/subjects/economics.html', label: 'Economics', code: '0455' },
    { href: '/subjects/computer-science.html', label: 'Computer Science', code: '0478' },
    { href: '/subjects/psychology.html', label: 'Psychology', code: '0980' },
    { href: '/subjects/physics.html', label: 'Physics', code: '0625' }
  ];

  // Normalize the current path so "/", "/index.html", and "/subjects/" all resolve.
  function currentPath() {
    var p = window.location.pathname;
    if (p === '/' || p === '') return '/index.html';
    if (p.charAt(p.length - 1) === '/') return p + 'index.html';
    return p;
  }

  function isActive(href, path) {
    return href === path;
  }

  function subjectsActive(path) {
    return path.indexOf('/subjects/') === 0;
  }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function buildOverlay() {
    var path = currentPath();
    var main = LINKS.concat([{ href: '/tracker/index.html', label: 'Tracker' }]).map(function (l) {
      return '<a href="' + l.href + '"' + (isActive(l.href, path) ? ' class="is-active"' : '') + '>' + esc(l.label) + '</a>';
    }).join('');
    var subs = SUBJECTS.map(function (s) {
      return '<a class="sub" href="' + s.href + '">' + esc(s.label) + ' <span class="u-mono u-xs u-muted">' + esc(s.code) + '</span></a>';
    }).join('');
    return '<div class="nav-overlay" data-overlay>' +
      main +
      '<div class="nav-overlay__group-label">Subjects</div>' +
      '<a href="/subjects/index.html">All subjects — hub</a>' +
      subs +
      '</div>';
  }

  function initNav() {
    var container = document.getElementById('nav-container');
    if (!container) return;

    // Build nav (strip the placeholder duplicate theme button trick — keep it clean instead)
    var path = currentPath();
    var theme = window.getTheme ? window.getTheme() : 'light';
    var icon = (window.THEME_ICONS && window.THEME_ICONS[theme]) || '☀️';
    var label = (window.THEME_LABELS && window.THEME_LABELS[theme]) || 'Light';

    var linksHtml = LINKS.map(function (l) {
      return '<a class="site-nav__link' + (isActive(l.href, path) ? ' is-active' : '') +
        '" href="' + l.href + '">' + esc(l.label) + '</a>';
    }).join('');
    var subjectItems = SUBJECTS.map(function (s) {
      return '<a href="' + s.href + '"><span>' + esc(s.label) + '</span><span class="code">' + esc(s.code) + '</span></a>';
    }).join('');
    var dropdown =
      '<div class="nav-dropdown" data-dropdown>' +
        '<a class="site-nav__link' + (subjectsActive(path) ? ' is-active' : '') +
          '" href="/subjects/index.html" data-dropdown-toggle aria-haspopup="true" aria-expanded="false">' +
          'Subjects <span class="nav-dropdown__caret">▾</span></a>' +
        '<div class="nav-dropdown__menu">' +
          '<a href="/subjects/index.html"><span>All subjects</span><span class="code">hub</span></a>' +
          subjectItems +
        '</div>' +
      '</div>';
    var tracker = '<a class="btn btn--primary site-nav__cta' + (path.indexOf('/tracker/') === 0 ? ' is-active' : '') +
      '" href="/tracker/index.html">Tracker</a>';
    var themeBtn = '<button class="theme-toggle" data-theme-toggle title="Theme: ' + esc(label) +
      '" aria-label="Switch theme (current: ' + esc(label) + ')">' + icon + '</button>';
    var burger = '<button class="nav-burger" data-burger aria-label="Open menu" aria-expanded="false"><span></span></button>';

    container.innerHTML =
      '<nav class="site-nav"><div class="site-nav__inner">' +
        '<a class="site-nav__brand" href="/index.html"><span class="brand-mark">◆</span> IGCSE&nbsp;Playbook</a>' +
        '<div class="site-nav__links">' + linksHtml + dropdown + tracker + themeBtn + '</div>' +
        themeBtn + /* mobile theme toggle sits next to burger */
        burger +
      '</div></nav>' +
      buildOverlay();

    wire(container);
  }

  function wire(container) {
    // Theme toggles (there may be two — desktop + mobile)
    container.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (window.cycleTheme) window.cycleTheme();
      });
    });
    document.addEventListener('themechange', function (e) {
      var t = e.detail;
      var icon = (window.THEME_ICONS && window.THEME_ICONS[t]) || '☀️';
      var label = (window.THEME_LABELS && window.THEME_LABELS[t]) || 'Light';
      container.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
        btn.textContent = icon;
        btn.setAttribute('title', 'Theme: ' + label);
        btn.setAttribute('aria-label', 'Switch theme (current: ' + label + ')');
      });
    });

    // Subjects dropdown
    var dd = container.querySelector('[data-dropdown]');
    if (dd) {
      var toggle = dd.querySelector('[data-dropdown-toggle]');
      toggle.addEventListener('click', function (e) {
        // Allow click-through to page on second interaction, but toggle on desktop hover-less click
        e.preventDefault();
        var open = dd.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      document.addEventListener('click', function (e) {
        if (!dd.contains(e.target)) { dd.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); }
      });
    }

    // Mobile burger + overlay
    var burger = container.querySelector('[data-burger]');
    var overlay = container.querySelector('[data-overlay]');
    if (burger && overlay) {
      burger.addEventListener('click', function () {
        var open = overlay.classList.toggle('is-open');
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
        burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        document.body.style.overflow = open ? 'hidden' : '';
      });
      overlay.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () {
          overlay.classList.remove('is-open');
          burger.setAttribute('aria-expanded', 'false');
          document.body.style.overflow = '';
        });
      });
    }
  }

  window.initNav = initNav;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNav);
  } else {
    initNav();
  }
})();
