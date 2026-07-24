/* enhance.js — shared per-page enhancements, injected by nav.js on every page:
 *   1. "On this page" section sidebar (auto-generated from the page's sections) + scroll-spy
 *   2. Scroll-reveal animations for content blocks
 * No per-page markup required. Skips the ToC on pages with <body data-no-toc> (e.g. the tracker).
 */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var NAV_H = 60;

  function slugify(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

  /* ---------- 1. Section sidebar (table of contents) --------------------- */
  function buildToc() {
    if (document.body.hasAttribute('data-no-toc')) return;
    if (document.querySelector('.page-toc')) return;

    // Candidate sections: direct <section>/<header> children that carry an <h2>.
    // (The hero <header> only has an <h1>, so it's naturally skipped.)
    var candidates = Array.prototype.slice.call(document.querySelectorAll('body > section, body > header'));
    var sections = [];
    var used = {};
    candidates.forEach(function (sec) {
      var h = sec.querySelector('h2');
      if (!h) return;
      var title = (h.textContent || '').trim().replace(/\s+/g, ' ');
      if (!title) return;
      var id = sec.id;
      if (!id) { id = slugify(title) || ('section-' + sections.length); while (used[id]) id += '-x'; sec.id = id; }
      used[id] = true;
      sec.style.scrollMarginTop = (NAV_H + 18) + 'px';
      sections.push({ el: sec, id: id, title: title });
    });
    if (sections.length < 2) return;

    var links = sections.map(function (s, i) {
      return '<li><a class="page-toc__link" href="#' + s.id + '" data-toc="' + i + '">' + s.title + '</a></li>';
    }).join('');

    var toc = document.createElement('nav');
    toc.className = 'page-toc';
    toc.setAttribute('aria-label', 'On this page');
    toc.innerHTML =
      '<div class="page-toc__title">On this page</div>' +
      '<ul class="page-toc__list">' + links + '</ul>' +
      '<div class="page-toc__bar"><span class="page-toc__bar-fill"></span></div>';
    document.body.appendChild(toc);

    // Mobile floating toggle
    var fab = document.createElement('button');
    fab.className = 'page-toc-fab';
    fab.setAttribute('aria-label', 'On this page');
    fab.innerHTML = '<span>❯</span> On this page';
    fab.addEventListener('click', function (e) {
      e.stopPropagation();
      toc.classList.toggle('is-open');
    });
    document.body.appendChild(fab);
    document.addEventListener('click', function (e) { if (!toc.contains(e.target) && e.target !== fab) toc.classList.remove('is-open'); });

    document.documentElement.classList.add('has-toc');

    var linkEls = Array.prototype.slice.call(toc.querySelectorAll('.page-toc__link'));
    linkEls.forEach(function (a) {
      a.addEventListener('click', function () { toc.classList.remove('is-open'); });
    });

    var barFill = toc.querySelector('.page-toc__bar-fill');
    var activeIdx = -1;

    function onScroll() {
      var y = window.scrollY + NAV_H + 90;
      var idx = 0;
      for (var i = 0; i < sections.length; i++) { if (sections[i].el.offsetTop <= y) idx = i; }
      if (idx !== activeIdx) {
        activeIdx = idx;
        linkEls.forEach(function (a, i) { a.classList.toggle('is-active', i === idx); });
      }
      // Reading-progress bar for the ToC
      var docH = document.documentElement.scrollHeight - window.innerHeight;
      var pct = docH > 0 ? Math.min(100, Math.max(0, (window.scrollY / docH) * 100)) : 0;
      if (barFill) barFill.style.height = pct + '%';
    }

    var ticking = false;
    window.addEventListener('scroll', function () {
      if (!ticking) { window.requestAnimationFrame(function () { onScroll(); ticking = false; }); ticking = true; }
    }, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- 2. Scroll-reveal ------------------------------------------- */
  function setupReveal() {
    if (reduceMotion || !('IntersectionObserver' in window)) return;
    var selectors = '.section-head, .card, .tip-box, .pull-quote, .step-list > li, table.data, ' +
      '.resource-grid > *, .grid-2 > *, .grid-3 > *, .card-grid > *, .weight-bar, .tabs, blockquote.pull-quote';
    var nodes = Array.prototype.slice.call(document.querySelectorAll(selectors));
    var vh = window.innerHeight;

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('is-visible'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });

    nodes.forEach(function (n) {
      // Give siblings a subtle stagger.
      var idx = 0, p = n.previousElementSibling;
      while (p && idx < 8) { idx++; p = p.previousElementSibling; }
      n.style.transitionDelay = Math.min(idx * 45, 320) + 'ms';
      // Elements already in the first viewport: show immediately (no flash, no animation-in from below).
      if (n.getBoundingClientRect().top < vh * 0.92) { n.classList.add('reveal', 'is-visible'); }
      else { n.classList.add('reveal'); io.observe(n); }
    });
  }

  function init() { buildToc(); setupReveal(); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
