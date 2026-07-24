/* nav.js — the single shared nav. Injected into #nav-container on every page.
 * Requires theme.js to have loaded first (uses window.getTheme / cycleTheme / THEME_ICONS).
 * Update this file to update the nav everywhere.
 */
(function () {
  'use strict';

  var LINKS = [
    { href: '/igcse-zyarisa/index.html', label: 'Home' },
    { href: '/igcse-zyarisa/study-system.html', label: 'Study System' },
    { href: '/igcse-zyarisa/resources.html', label: 'Resources' },
    { href: '/igcse-zyarisa/past-papers.html', label: 'Past Papers' }
  ];

  var SUBJECTS = [
    { href: '/igcse-zyarisa/subjects/international-math.html', label: 'International Mathematics', code: '0607' },
    { href: '/igcse-zyarisa/subjects/english-literature.html', label: 'English Literature', code: '0475' },
    { href: '/igcse-zyarisa/subjects/english-language.html', label: 'English Language', code: '0500' },
    { href: '/igcse-zyarisa/subjects/french.html', label: 'French', code: '0520' },
    { href: '/igcse-zyarisa/subjects/business.html', label: 'Business Studies', code: '0450' },
    { href: '/igcse-zyarisa/subjects/economics.html', label: 'Economics', code: '0455' },
    { href: '/igcse-zyarisa/subjects/computer-science.html', label: 'Computer Science', code: '0478' },
    { href: '/igcse-zyarisa/subjects/psychology.html', label: 'Psychology', code: '0980' },
    { href: '/igcse-zyarisa/subjects/physics.html', label: 'Physics', code: '0625' }
  ];

  // Normalize the current path so "/", "/igcse-zyarisa/index.html", and "/igcse-zyarisa/subjects/" all resolve.
  function currentPath() {
    var p = window.location.pathname;
    if (p === '/' || p === '') return '/igcse-zyarisa/index.html';
    if (p.charAt(p.length - 1) === '/') return p + 'index.html';
    return p;
  }

  function isActive(href, path) {
    return href === path;
  }

  function subjectsActive(path) {
    return path.indexOf('/igcse-zyarisa/subjects/') === 0;
  }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // Build the palette theme picker: a 🎨 button + dropdown of circular color swatches.
  function paletteMenu(active) {
    var themes = window.THEMES || ['light', 'dark', 'high-contrast', 'vintage'];
    var swatches = window.THEME_SWATCHES || {};
    var labels = window.THEME_LABELS || {};
    var items = themes.map(function (t) {
      var c = swatches[t] || ['#ccc', '#999', '#bbb', '#aaa'];
      var grad = 'conic-gradient(' + c[0] + ' 0% 25%, ' + c[1] + ' 25% 50%, ' + c[2] + ' 50% 75%, ' + c[3] + ' 75% 100%)';
      return '<button class="theme-swatch-item' + (t === active ? ' is-active' : '') + '" role="menuitemradio" aria-checked="' + (t === active ? 'true' : 'false') + '" data-set-theme="' + t + '">' +
        '<span class="theme-swatch" style="background:' + grad + '"></span>' +
        '<span class="theme-swatch-name">' + esc(labels[t] || t) + '</span>' +
        '<span class="theme-swatch-check">✓</span>' +
      '</button>';
    }).join('');
    return '<div class="theme-menu" data-theme-menu>' +
        '<button class="theme-palette-btn" data-theme-btn aria-haspopup="true" aria-expanded="false" title="Change theme" aria-label="Change theme">🎨</button>' +
        '<div class="theme-menu__panel" role="menu"><div class="theme-menu__label">Theme</div>' + items + '</div>' +
      '</div>';
  }

  function buildOverlay() {
    var path = currentPath();
    var main = LINKS.concat([{ href: '/igcse-zyarisa/tracker/index.html', label: 'Tracker' }]).map(function (l) {
      return '<a href="' + l.href + '"' + (isActive(l.href, path) ? ' class="is-active"' : '') + '>' + esc(l.label) + '</a>';
    }).join('');
    var subs = SUBJECTS.map(function (s) {
      return '<a class="sub" href="' + s.href + '">' + esc(s.label) + ' <span class="u-mono u-xs u-muted">' + esc(s.code) + '</span></a>';
    }).join('');
    return '<div class="nav-overlay" data-overlay>' +
      main +
      '<div class="nav-overlay__group-label">Subjects</div>' +
      '<a href="/igcse-zyarisa/subjects/index.html">All subjects — hub</a>' +
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
          '" href="/igcse-zyarisa/subjects/index.html" data-dropdown-toggle aria-haspopup="true" aria-expanded="false">' +
          'Subjects <span class="nav-dropdown__caret">▾</span></a>' +
        '<div class="nav-dropdown__menu">' +
          '<a href="/igcse-zyarisa/subjects/index.html"><span>All subjects</span><span class="code">hub</span></a>' +
          subjectItems +
        '</div>' +
      '</div>';
    var tracker = '<a class="btn btn--primary site-nav__cta' + (path.indexOf('/igcse-zyarisa/tracker/') === 0 ? ' is-active' : '') +
      '" href="/igcse-zyarisa/tracker/index.html">Tracker</a>';
    var themeBtn = paletteMenu(theme);
    var burger = '<button class="nav-burger" data-burger aria-label="Open menu" aria-expanded="false"><span></span></button>';

    container.innerHTML =
      '<nav class="site-nav"><div class="site-nav__inner">' +
        '<a class="site-nav__brand" href="/igcse-zyarisa/index.html"><span class="brand-mark">◆</span> IGCSE&nbsp;Playbook</a>' +
        '<div class="site-nav__links">' + linksHtml + dropdown + tracker + themeBtn + '</div>' +
        '<span class="nav-mobile-only">' + themeBtn + '</span>' + /* palette next to burger on mobile */
        burger +
      '</div></nav>' +
      buildOverlay();

    wire(container);
    loadEnhance();
  }

  // Load the shared page-enhancement script (section ToC + scroll animations) once.
  function loadEnhance() {
    if (document.querySelector('script[data-enhance]')) return;
    var s = document.createElement('script');
    s.src = '/igcse-zyarisa/assets/js/enhance.js';
    s.setAttribute('data-enhance', '1');
    s.defer = true;
    document.body.appendChild(s);
  }

  function wire(container) {
    // Palette theme menus (there may be two — desktop + mobile)
    var menus = container.querySelectorAll('[data-theme-menu]');
    menus.forEach(function (menu) {
      var btn = menu.querySelector('[data-theme-btn]');
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = menu.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        // Close the other menu if open
        menus.forEach(function (m) { if (m !== menu) { m.classList.remove('is-open'); m.querySelector('[data-theme-btn]').setAttribute('aria-expanded', 'false'); } });
      });
      menu.querySelectorAll('[data-set-theme]').forEach(function (item) {
        item.addEventListener('click', function (e) {
          e.stopPropagation();
          if (window.setTheme) window.setTheme(item.getAttribute('data-set-theme'));
          menu.classList.remove('is-open');
          btn.setAttribute('aria-expanded', 'false');
        });
      });
    });
    // Close any open palette menu on outside click
    document.addEventListener('click', function (e) {
      menus.forEach(function (m) { if (!m.contains(e.target)) { m.classList.remove('is-open'); var b = m.querySelector('[data-theme-btn]'); if (b) b.setAttribute('aria-expanded', 'false'); } });
    });
    // Keep the active swatch in sync when the theme changes
    document.addEventListener('themechange', function (e) {
      var t = e.detail;
      container.querySelectorAll('[data-set-theme]').forEach(function (item) {
        var on = item.getAttribute('data-set-theme') === t;
        item.classList.toggle('is-active', on);
        item.setAttribute('aria-checked', on ? 'true' : 'false');
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
