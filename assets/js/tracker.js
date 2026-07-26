/* tracker.js — the traffic-light tracker app.
 * State, rendering, rating, localStorage persistence, JSON export/import,
 * preview + manual correction, and Drive wiring. Depends on Parser (parser.js)
 * and optionally Drive (drive.js). Colors/type come from main.css + tracker.css.
 *
 * Persistence: one object per subject under localStorage key `igcse-tracker-{slug}`,
 * holding meta + structure + BOTH rating sets (topic-level and objective-level are
 * independent, per spec). Last-opened slug under `igcse-tracker-last`.
 */
(function () {
  'use strict';

  var LEVELS = ['recall', 'understand', 'apply', 'analyse', 'evaluate'];
  var STATUSES = ['red', 'amber', 'green', 'unrated'];

  /* High-level starter outlines for the "Select Subject" path.
   * subjects.json intentionally has no topic list, so these are safe, well-known
   * top-level content areas — a scaffold the student refines against her real syllabus.
   * NOT a substitute for the official syllabus checklist. */
  var SUBJECT_OUTLINES = {
    'physics': ['Motion, forces and energy', 'Thermal physics', 'Waves', 'Electricity and magnetism', 'Nuclear physics', 'Space physics'],
    'international-math': ['Number', 'Algebra', 'Functions', 'Coordinate geometry', 'Geometry', 'Mensuration', 'Trigonometry', 'Vectors and transformations', 'Probability', 'Statistics'],
    'computer-science': ['Data representation', 'Data transmission', 'Hardware', 'Software', 'The internet and its uses', 'Automated and emerging technologies', 'Algorithm design and problem-solving', 'Programming', 'Databases', 'Boolean logic'],
    'business': ['Understanding business activity', 'People in business', 'Marketing', 'Operations management', 'Financial information and decisions', 'External influences on business activity'],
    'economics': ['The basic economic problem', 'The allocation of resources', 'Microeconomic decision makers', 'Government and the macroeconomy', 'Economic development', 'International trade and globalisation'],
    'english-language': ['Reading', 'Writing', 'Directed writing', 'Composition'],
    'english-literature': ['Poetry', 'Prose', 'Drama'],
    'french': ['Listening', 'Reading', 'Writing', 'Speaking'],
    'psychology': ['Research methods', 'The biological approach', 'The cognitive approach', 'The learning approach', 'The psychodynamic approach', 'The social approach', 'Core studies']
  };

  /* ---- state -------------------------------------------------------------- */
  var state = {
    slug: null,
    meta: null,            // { name, code }
    structure: null,       // { units: [...] }
    parsedFrom: null,
    parseConfidence: null,
    view: 'topic',
    filter: 'all',
    tier: 'all',
    collapsed: {},         // { unitId: true }
    ratings: { topic: {}, objective: {} }
  };
  var pendingParse = null; // holds a parse result awaiting "generate tracker"

  var el = {}; // cached DOM

  /* ---- helpers ------------------------------------------------------------ */
  function $(id) { return document.getElementById(id); }
  function slugify(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-syllabus'; }
  function todayStr() { var d = new Date(); return d.toISOString().slice(0, 10); }
  function timeStr() { var d = new Date(); return d.toLocaleString(); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function storageKey(slug) { return 'igcse-tracker-' + slug; }

  /* ---- persistence -------------------------------------------------------- */
  function save() {
    if (!state.slug) return;
    var payload = {
      version: 1,
      meta: state.meta,
      slug: state.slug,
      structure: state.structure,
      ratings: state.ratings,
      savedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem(storageKey(state.slug), JSON.stringify(payload));
      localStorage.setItem('igcse-tracker-last', state.slug);
      if (el.saveInfo) el.saveInfo.innerHTML = '<span class="tk-saved-tick">✓</span> Saved · ' + timeStr();
    } catch (e) {
      if (el.saveInfo) el.saveInfo.textContent = 'Could not save (storage full?).';
    }
    // Best-effort mirror to the shared cloud space (editors only; no-op otherwise).
    if (window.Sync && Sync.canWrite && Sync.canWrite()) {
      Sync.pushTracker(state.slug, payload);
      var c = counts();
      Sync.logActivity({ slug: state.slug, subjectName: (state.meta && state.meta.name) || state.slug, greenPct: c.total ? Math.round(c.green / c.total * 100) : 0, total: c.total });
    }
  }

  function loadStored(slug) {
    try { var raw = localStorage.getItem(storageKey(slug)); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }

  /* ---- adopt a structure into state -------------------------------------- */
  function adopt(meta, structure, opts) {
    opts = opts || {};
    state.slug = opts.slug || slugify(meta.name);
    state.meta = meta;
    state.structure = normalizeStructure(structure);
    state.parsedFrom = opts.parsedFrom || 'manual';
    state.parseConfidence = opts.parseConfidence || null;
    state.collapsed = {};
    // Restore ratings if we've tracked this subject before AND we're not force-replacing.
    var prior = opts.ratings || (loadStored(state.slug) && !opts.freshRatings ? loadStored(state.slug).ratings : null);
    state.ratings = prior && prior.topic ? prior : { topic: {}, objective: {} };
    state.view = 'topic';
    state.filter = 'all';
    state.tier = 'all';
    hidePreview();
    render();
    save();
  }

  // Ensure every node has an id; used for both parsed and loaded structures.
  function normalizeStructure(structure) {
    var u = 0;
    (structure.units || []).forEach(function (unit) {
      if (!unit.id) unit.id = 'u' + (++u);
      var t = 0;
      (unit.topics || []).forEach(function (topic) {
        if (!topic.id) topic.id = unit.id + '.t' + (++t);
        var o = 0;
        (topic.objectives || []).forEach(function (obj) {
          if (!obj.id) obj.id = topic.id + '.o' + (++o);
        });
      });
    });
    return structure;
  }

  function hasTiers() {
    if (state.slug === 'international-math') return true;
    var found = false;
    (state.structure.units || []).forEach(function (u) { u.topics.forEach(function (t) { t.objectives.forEach(function (o) { if (o.tier) found = true; }); }); });
    return found;
  }

  /* ---- rateable rows for the current view -------------------------------- */
  function rateableRows() {
    var rows = [];
    (state.structure.units || []).forEach(function (u) {
      u.topics.forEach(function (t) {
        if (state.view === 'topic') rows.push({ id: t.id, tier: null });
        else t.objectives.forEach(function (o) { rows.push({ id: o.id, tier: o.tier }); });
      });
    });
    return rows;
  }

  function ratingFor(id) { return state.ratings[state.view][id] || { status: 'unrated', notes: '', updated: null }; }

  function counts() {
    var c = { green: 0, amber: 0, red: 0, unrated: 0, total: 0 };
    rateableRows().forEach(function (r) {
      if (state.tier !== 'all' && r.tier && r.tier !== state.tier) return;
      c.total++;
      var s = ratingFor(r.id).status || 'unrated';
      c[s] = (c[s] || 0) + 1;
    });
    return c;
  }

  /* ---- rating actions ----------------------------------------------------- */
  function setRating(id, status) {
    var map = state.ratings[state.view];
    var cur = map[id] || { status: 'unrated', notes: '', updated: null };
    cur.status = status;
    cur.updated = todayStr();
    map[id] = cur;
    save();
    renderProgress();
    // Update just this row's UI
    updateRowUI(id);
  }
  function setNotes(id, notes) {
    var map = state.ratings[state.view];
    var cur = map[id] || { status: 'unrated', notes: '', updated: null };
    cur.notes = notes;
    map[id] = cur;
    save();
  }

  /* ---- structure editing -------------------------------------------------- */
  function findTopic(id) {
    var res = null;
    state.structure.units.forEach(function (u) { u.topics.forEach(function (t) { if (t.id === id) res = { unit: u, topic: t }; }); });
    return res;
  }
  function editText(kind, id, text) {
    state.structure.units.forEach(function (u) {
      if (kind === 'unit' && u.id === id) u.title = text;
      u.topics.forEach(function (t) {
        if (kind === 'topic' && t.id === id) t.title = text;
        t.objectives.forEach(function (o) { if (kind === 'obj' && o.id === id) o.text = text; });
      });
    });
    save();
  }
  function deleteRow(kind, id) {
    state.structure.units.forEach(function (u) {
      if (kind === 'topic') u.topics = u.topics.filter(function (t) { return t.id !== id; });
      if (kind === 'obj') u.topics.forEach(function (t) { t.objectives = t.objectives.filter(function (o) { return o.id !== id; }); });
    });
    if (kind === 'unit') state.structure.units = state.structure.units.filter(function (u) { return u.id !== id; });
    delete state.ratings.topic[id]; delete state.ratings.objective[id];
    save(); render();
  }
  function addTopic(unitId) {
    var u = state.structure.units.filter(function (x) { return x.id === unitId; })[0];
    if (!u) return;
    var id = unitId + '.t' + (u.topics.length + 1) + '-' + Date.now().toString(36);
    u.topics.push({ id: id, title: 'New topic', objectives: [] });
    save(); render();
  }
  function addObjective(topicId) {
    var found = findTopic(topicId); if (!found) return;
    var id = topicId + '.o' + (found.topic.objectives.length + 1) + '-' + Date.now().toString(36);
    found.topic.objectives.push({ id: id, text: 'New learning objective', demandVerb: '', demandLevel: null, tier: null });
    save(); render();
  }

  /* ---- rendering ---------------------------------------------------------- */
  function render() {
    if (!state.structure) { renderEmpty(); return; }
    if (el.subjectName) el.subjectName.textContent = state.meta ? state.meta.name : '—';
    renderToolbar();
    renderTierFilter();
    renderProgress();
    renderViewToggle();
    renderFilters();
    renderTable();
  }

  function renderEmpty() {
    if (el.tableWrap) el.tableWrap.innerHTML = '<div class="tk-empty"><p>No tracker loaded yet.</p><p class="u-sm">Choose one of the three paths above — upload a syllabus PDF, paste syllabus text, or pick a subject — to build your tracker.</p></div>';
    if (el.subjectName) el.subjectName.textContent = '—';
    if (el.progress) el.progress.innerHTML = '';
    if (el.toolbar) el.toolbar.innerHTML = '';
  }

  function renderToolbar() {
    if (!el.toolbar) return;
    var vLabel = state.view === 'topic' ? 'Topic level' : 'Learning-objective level';
    el.toolbar.innerHTML =
      '<div class="tk-toolbar__group">' +
        '<h2 class="tk-subject-title">' + esc(state.meta.name) + (state.meta.code ? ' <span class="badge badge--accent">' + esc(state.meta.code) + '</span>' : '') + '</h2>' +
      '</div>' +
      '<div class="tk-toolbar__group tk-toolbar__group--controls no-print">' +
        '<button class="btn btn--ghost btn--sm" data-act="expand">Expand all</button>' +
        '<button class="btn btn--ghost btn--sm" data-act="collapse">Collapse all</button>' +
        (state.view === 'topic'
          ? '<button class="btn btn--outline btn--sm" data-act="add-unit">+ Add unit</button>'
          : '') +
      '</div>';
    el.toolbar.querySelectorAll('[data-act]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-act');
        if (a === 'expand') { state.collapsed = {}; renderTable(); }
        else if (a === 'collapse') { state.structure.units.forEach(function (u) { state.collapsed[u.id] = true; }); renderTable(); }
        else if (a === 'add-unit') { var id = 'u-' + Date.now().toString(36); state.structure.units.push({ id: id, title: 'New unit', topics: [] }); save(); render(); }
      });
    });
  }

  function renderProgress() {
    if (!el.progress) return;
    var c = counts();
    var pct = function (n) { return c.total ? Math.round((n / c.total) * 100) : 0; };
    function seg(k) { return '<div class="tk-progress__seg tk-progress__seg--' + k + '" style="width:' + pct(c[k]) + '%"></div>'; }
    el.progress.innerHTML =
      '<span class="tk-panel__label">' + (state.view === 'topic' ? 'Topic' : 'Objective') + ' progress · ' + c.total + ' items</span>' +
      '<div class="tk-progress__bar">' + seg('green') + seg('amber') + seg('red') + seg('unrated') + '</div>' +
      '<div class="tk-progress__legend">' +
        '<span><i class="tk-progress__dot tk-dot--green"></i>' + pct(c.green) + '% green</span>' +
        '<span><i class="tk-progress__dot tk-dot--amber"></i>' + pct(c.amber) + '% amber</span>' +
        '<span><i class="tk-progress__dot tk-dot--red"></i>' + pct(c.red) + '% red</span>' +
        '<span><i class="tk-progress__dot tk-dot--unrated"></i>' + pct(c.unrated) + '% unrated</span>' +
      '</div>';
  }

  function renderViewToggle() {
    if (!el.viewToggle) return;
    el.viewToggle.querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-view') === state.view ? 'true' : 'false');
    });
  }
  function renderFilters() {
    if (!el.filters) return;
    el.filters.querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-filter') === state.filter ? 'true' : 'false');
    });
  }
  function renderTierFilter() {
    if (!el.tierFilter) return;
    el.tierFilter.style.display = hasTiers() ? '' : 'none';
    el.tierFilter.querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-tier') === state.tier ? 'true' : 'false');
    });
  }

  function matchesFilter(id) {
    if (state.filter === 'all') return true;
    return (ratingFor(id).status || 'unrated') === state.filter;
  }
  function matchesTier(tier) {
    return state.tier === 'all' || !tier || tier === state.tier;
  }

  function lightsHTML(id) {
    var s = ratingFor(id).status || 'unrated';
    function b(k, label, glyph) { return '<button class="tk-light tk-light--' + k + (s === k ? ' is-on' : '') + '" data-rate="' + k + '" data-id="' + esc(id) + '" title="' + label + '" aria-label="' + label + '">' + glyph + '</button>'; }
    return '<span class="tk-lights">' + b('red', 'Red', '') + b('amber', 'Amber', '') + b('green', 'Green', '') + b('unrated', 'Unrated', '○') + '</span>';
  }
  function statusBadgeHTML(id) {
    var s = ratingFor(id).status || 'unrated';
    var cls = s === 'green' ? 'badge--green' : s === 'amber' ? 'badge--amber' : s === 'red' ? 'badge--red' : 'badge--neutral';
    return '<span class="badge ' + cls + ' tk-statusbadge" data-badge="' + esc(id) + '">' + s + '</span>';
  }
  function demandHTML(o) {
    if (!o.demandLevel) return '';
    return '<span class="demand-badge" data-level="' + o.demandLevel + '">' + o.demandLevel + '</span>';
  }
  function tierHTML(o) {
    if (!o.tier) return '';
    return '<span class="badge badge--neutral">' + o.tier + '</span>';
  }

  function renderTable() {
    if (!el.tableWrap) return;
    if (!state.structure.units.length) { el.tableWrap.innerHTML = '<div class="tk-empty"><p>This tracker has no rows yet. Add a unit to begin.</p></div>'; return; }

    var rows = [];
    rows.push('<table class="tk-table"><colgroup><col class="col-text"><col class="col-status"><col class="col-notes"><col class="col-date"></colgroup>');

    state.structure.units.forEach(function (u) {
      var collapsed = !!state.collapsed[u.id];
      rows.push(
        '<tr class="tk-row tk-row--unit' + (collapsed ? ' is-collapsed' : '') + '" data-unit-head="' + esc(u.id) + '">' +
          '<td colspan="4"><span class="tk-caret">▾</span> ' +
            '<span class="tk-inline-edit" contenteditable="true" data-edit="unit" data-id="' + esc(u.id) + '">' + esc(u.title) + '</span>' +
            (state.view === 'topic' ? ' <button class="btn btn--ghost btn--sm no-print" data-add-topic="' + esc(u.id) + '">+ topic</button>' : '') +
            ' <button class="btn btn--ghost btn--sm no-print" data-del="unit" data-id="' + esc(u.id) + '" title="Delete unit">×</button>' +
          '</td>' +
        '</tr>'
      );

      u.topics.forEach(function (t) {
        var hideChildren = collapsed ? ' is-hidden' : '';
        if (state.view === 'topic') {
          var visible = matchesFilter(t.id);
          rows.push(
            '<tr class="tk-row tk-row--topic' + hideChildren + (visible ? '' : ' is-hidden') + '" data-row="' + esc(t.id) + '" data-unit="' + esc(u.id) + '" data-kind="topic">' +
              '<td><span class="tk-inline-edit" contenteditable="true" data-edit="topic" data-id="' + esc(t.id) + '">' + esc(t.title) + '</span></td>' +
              '<td>' + lightsHTML(t.id) + statusBadgeHTML(t.id) + '</td>' +
              '<td><input class="tk-notes" data-notes="' + esc(t.id) + '" value="' + esc(ratingFor(t.id).notes) + '" placeholder="notes…"></td>' +
              '<td><span class="tk-date" data-date="' + esc(t.id) + '">' + (ratingFor(t.id).updated || '—') + '</span> <button class="btn btn--ghost btn--sm no-print" data-del="topic" data-id="' + esc(t.id) + '" title="Delete">×</button></td>' +
            '</tr>'
          );
        } else {
          // objective view: topic is a header row
          rows.push(
            '<tr class="tk-row tk-row--topic' + hideChildren + '" data-topic-head="' + esc(t.id) + '" data-unit="' + esc(u.id) + '">' +
              '<td colspan="4"><strong><span class="tk-inline-edit" contenteditable="true" data-edit="topic" data-id="' + esc(t.id) + '">' + esc(t.title) + '</span></strong>' +
              ' <button class="btn btn--ghost btn--sm no-print" data-add-obj="' + esc(t.id) + '">+ objective</button></td>' +
            '</tr>'
          );
          t.objectives.forEach(function (o) {
            var visible = matchesFilter(o.id) && matchesTier(o.tier);
            rows.push(
              '<tr class="tk-row tk-row--obj' + hideChildren + (visible ? '' : ' is-hidden') + '" data-row="' + esc(o.id) + '" data-unit="' + esc(u.id) + '" data-kind="obj">' +
                '<td><span class="tk-celltext"><span class="tk-inline-edit" contenteditable="true" data-edit="obj" data-id="' + esc(o.id) + '">' + esc(o.text) + '</span></span>' +
                  '<span class="tk-cell-meta">' + demandHTML(o) + tierHTML(o) + '</span></td>' +
                '<td>' + lightsHTML(o.id) + statusBadgeHTML(o.id) + '</td>' +
                '<td><input class="tk-notes" data-notes="' + esc(o.id) + '" value="' + esc(ratingFor(o.id).notes) + '" placeholder="notes…"></td>' +
                '<td><span class="tk-date" data-date="' + esc(o.id) + '">' + (ratingFor(o.id).updated || '—') + '</span> <button class="btn btn--ghost btn--sm no-print" data-del="obj" data-id="' + esc(o.id) + '" title="Delete">×</button></td>' +
              '</tr>'
            );
          });
        }
      });
    });
    rows.push('</table>');
    el.tableWrap.innerHTML = rows.join('');
    wireTable();
  }

  function updateRowUI(id) {
    // Refresh lights + badge + date for one row without full re-render.
    var lights = el.tableWrap.querySelector('.tk-lights [data-id="' + cssEsc(id) + '"]');
    if (lights) {
      var group = lights.closest('.tk-lights');
      var s = ratingFor(id).status;
      group.querySelectorAll('.tk-light').forEach(function (b) { b.classList.toggle('is-on', b.getAttribute('data-rate') === s); });
    }
    var badge = el.tableWrap.querySelector('[data-badge="' + cssEsc(id) + '"]');
    if (badge) {
      var s2 = ratingFor(id).status;
      badge.textContent = s2;
      badge.className = 'badge ' + (s2 === 'green' ? 'badge--green' : s2 === 'amber' ? 'badge--amber' : s2 === 'red' ? 'badge--red' : 'badge--neutral') + ' tk-statusbadge';
    }
    var date = el.tableWrap.querySelector('[data-date="' + cssEsc(id) + '"]');
    if (date) date.textContent = ratingFor(id).updated || '—';
    // If a filter is active, the row may need to hide.
    if (state.filter !== 'all') {
      var row = el.tableWrap.querySelector('.tk-row[data-row="' + cssEsc(id) + '"]');
      if (row) row.classList.toggle('is-hidden', !matchesFilter(id));
    }
  }
  function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }

  function wireTable() {
    // Rating clicks
    el.tableWrap.querySelectorAll('.tk-light').forEach(function (b) {
      b.addEventListener('click', function () { setRating(b.getAttribute('data-id'), b.getAttribute('data-rate')); });
    });
    // Notes
    el.tableWrap.querySelectorAll('[data-notes]').forEach(function (inp) {
      inp.addEventListener('change', function () { setNotes(inp.getAttribute('data-notes'), inp.value); });
    });
    // Inline text edits
    el.tableWrap.querySelectorAll('[data-edit]').forEach(function (span) {
      span.addEventListener('blur', function () { editText(span.getAttribute('data-edit'), span.getAttribute('data-id'), span.textContent.trim()); });
      span.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); span.blur(); } });
    });
    // Collapse toggles
    el.tableWrap.querySelectorAll('[data-unit-head]').forEach(function (row) {
      row.addEventListener('click', function (e) {
        if (e.target.closest('[data-edit],[data-add-topic],[data-del],button')) return;
        var uid = row.getAttribute('data-unit-head');
        state.collapsed[uid] = !state.collapsed[uid];
        renderTable();
      });
    });
    // Add / delete
    el.tableWrap.querySelectorAll('[data-add-topic]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); addTopic(b.getAttribute('data-add-topic')); }); });
    el.tableWrap.querySelectorAll('[data-add-obj]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); addObjective(b.getAttribute('data-add-obj')); }); });
    el.tableWrap.querySelectorAll('[data-del]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); if (confirm('Delete this row?')) deleteRow(b.getAttribute('data-del'), b.getAttribute('data-id')); }); });
  }

  /* ---- preview + manual correction --------------------------------------- */
  function showPreview(result, defaultName, code) {
    pendingParse = result;
    var confClass = result.parseConfidence === 'high' ? 'badge--green' : result.parseConfidence === 'medium' ? 'badge--amber' : 'badge--red';
    var confLabel = result.parseConfidence === 'high' ? 'High confidence' : result.parseConfidence === 'medium' ? 'Parsed — review suggested' : 'Review suggested';

    var tree = [];
    result.units.forEach(function (u) {
      tree.push('<div class="tk-tree-node tk-tree-node--unit">' + esc(u.title) + '</div>');
      u.topics.forEach(function (t) {
        tree.push('<div class="tk-tree-node tk-tree-node--topic">' + esc(t.title) + '</div>');
        t.objectives.forEach(function (o) {
          tree.push('<div class="tk-tree-node tk-tree-node--obj">' + (o.demandLevel ? '<span class="demand-badge" data-level="' + o.demandLevel + '">' + o.demandLevel + '</span>' : '') + '<span>' + esc(o.text) + '</span></div>');
        });
      });
    });

    var flagged = '';
    if (result.flagged && result.flagged.length) {
      flagged = '<div class="tk-panel__label" style="margin-top:var(--space-3)">Uncertain lines — include?</div>' +
        result.flagged.map(function (line, i) {
          return '<div class="tk-tree-node tk-flagged"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-flag="' + i + '"> <span>' + esc(line) + '</span></label></div>';
        }).join('');
    }

    el.preview.innerHTML =
      '<div class="tk-preview__head">' +
        '<div><span class="badge ' + confClass + '">' + confLabel + '</span> ' +
        '<span class="u-sm u-muted">Found ' + result.stats.units + ' units, ' + result.stats.topics + ' topics, ' + result.stats.objectives + ' objectives.</span></div>' +
        '<button class="tk-modal__close" data-preview-close title="Dismiss">×</button>' +
      '</div>' +
      '<div class="tk-preview__body">' +
        (result.warning ? '<div class="tk-status tk-status--warn">' + esc(result.warning) + '</div>' : '') +
        '<div class="tk-panel__label">Subject name for this tracker</div>' +
        '<input class="tk-input" id="tk-name-input" value="' + esc(defaultName || 'My Syllabus') + '" style="margin-bottom:var(--space-3)">' +
        tree.join('') +
        flagged +
        '<div class="btn-row" style="margin-top:var(--space-4)">' +
          '<button class="btn btn--primary" id="tk-generate">Looks good — generate tracker →</button>' +
          '<button class="btn btn--ghost" data-preview-close>Cancel</button>' +
        '</div>' +
      '</div>';
    el.preview.style.display = '';
    el.preview.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    el.preview.querySelectorAll('[data-preview-close]').forEach(function (b) { b.addEventListener('click', hidePreview); });
    $('tk-generate').addEventListener('click', function () {
      // Apply flagged inclusions: append each included flagged line as an objective under the last topic.
      var incl = [];
      el.preview.querySelectorAll('[data-flag]').forEach(function (cb) { if (cb.checked) incl.push(result.flagged[+cb.getAttribute('data-flag')]); });
      if (incl.length) {
        var lastUnit = result.units[result.units.length - 1];
        if (lastUnit) { var lastTopic = lastUnit.topics[lastUnit.topics.length - 1] || (lastUnit.topics.push({ id: 'x', title: 'Added', objectives: [] }), lastUnit.topics[0]);
          incl.forEach(function (line) { var d = window.Parser.classifyDemand(line); lastTopic.objectives.push({ text: line, demandVerb: d.verb, demandLevel: d.level, tier: null }); }); }
      }
      var name = ($('tk-name-input') && $('tk-name-input').value.trim()) || defaultName || 'My Syllabus';
      var slug = slugify(name);
      var existing = loadStored(slug);
      if (existing && existing.ratings && (Object.keys(existing.ratings.topic).length || Object.keys(existing.ratings.objective).length)) {
        if (!confirm('A saved tracker for "' + name + '" already exists. Replace its structure but keep your ratings?')) return;
      }
      adopt({ name: name, code: code || detectCode(name) || '' }, { units: result.units }, { slug: slug, parsedFrom: state._src || 'parsed', parseConfidence: result.parseConfidence });
    });
  }
  function hidePreview() { if (el.preview) { el.preview.style.display = 'none'; el.preview.innerHTML = ''; } pendingParse = null; }
  function detectCode(text) { var m = String(text).match(/\b0\d{3}\b/); return m ? m[0] : ''; }

  /* ---- status messages ---------------------------------------------------- */
  function status(html, kind) {
    if (!el.status) return;
    el.status.style.display = '';
    el.status.className = 'tk-status tk-status--' + (kind || 'busy');
    el.status.innerHTML = html;
  }
  function clearStatus() { if (el.status) { el.status.style.display = 'none'; el.status.innerHTML = ''; } }

  /* ---- input paths -------------------------------------------------------- */
  function handlePdf(file) {
    if (!file) return;
    state._src = 'pdf';
    status('<span class="tk-spinner"></span>Reading and parsing “' + esc(file.name) + '”…', 'busy');
    window.Parser.extractPdfText(file).then(function (text) {
      var result = window.Parser.parseSyllabus(text);
      clearStatus();
      if (!result.stats.topics) { status('Couldn’t detect a topic structure in that PDF. Try the paste-text path instead.', 'err'); return; }
      showPreview(result, file.name.replace(/\.pdf$/i, ''), detectCode(text));
    }).catch(function (e) {
      status('PDF parsing failed: ' + esc(e.message) + ' — try copying the syllabus text and using the paste path.', 'err');
    });
  }
  function handlePaste(text) {
    if (!text || !text.trim()) { status('Paste some syllabus text first.', 'warn'); return; }
    state._src = 'paste';
    var result = window.Parser.parseSyllabus(text);
    if (!result.stats.topics) { status('Couldn’t detect a topic structure. Check you pasted the “subject content” section.', 'warn'); return; }
    clearStatus();
    showPreview(result, 'My Syllabus', detectCode(text));
  }
  function handleSelectSubject(slug) {
    if (!slug) return;
    state._src = 'select';
    var meta = (window.__SUBJECTS__ && window.__SUBJECTS__[slug]) || null;
    var name = meta ? meta.name : slug;
    var code = meta ? meta.code : '';
    var outline = SUBJECT_OUTLINES[slug] || [];
    var units = outline.map(function (title, i) {
      return { id: 'u' + (i + 1), title: title, topics: [{ id: 'u' + (i + 1) + '.t1', title: title + ' — add your topics', objectives: [] }] };
    });
    if (!units.length) units = [{ id: 'u1', title: 'Unit 1', topics: [{ id: 'u1.t1', title: 'New topic', objectives: [] }] }];
    var existing = loadStored(slug);
    if (existing) {
      if (confirm('You already have a saved tracker for ' + name + '. Open it?')) { openStored(slug); return; }
    }
    status('Loaded a starter outline for <strong>' + esc(name) + '</strong>. These are high-level content areas — paste the syllabus (path 2) for the full official breakdown, or edit rows directly below.', 'ok');
    adopt({ name: name, code: code }, { units: units }, { slug: slug, parsedFrom: 'select' });
  }

  function openStored(slug) {
    var stored = loadStored(slug);
    if (!stored) return false;
    state.slug = slug;
    state.meta = stored.meta;
    state.structure = normalizeStructure(stored.structure);
    state.ratings = stored.ratings && stored.ratings.topic ? stored.ratings : { topic: {}, objective: {} };
    state.view = 'topic'; state.filter = 'all'; state.tier = 'all'; state.collapsed = {};
    hidePreview(); clearStatus(); render();
    if (el.saveInfo && stored.savedAt) el.saveInfo.innerHTML = '<span class="tk-saved-tick">✓</span> Saved · ' + new Date(stored.savedAt).toLocaleString();
    return true;
  }

  /* ---- library: all saved trackers in this browser ----------------------- */
  function listSavedTrackers() {
    var out = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf('igcse-tracker-') === 0 && k !== 'igcse-tracker-last') {
        try {
          var data = JSON.parse(localStorage.getItem(k));
          if (data && data.structure) out.push({ key: k, slug: data.slug || k.replace('igcse-tracker-', ''), data: data });
        } catch (e) { /* skip corrupt entry */ }
      }
    }
    out.sort(function (a, b) { return String(b.data.savedAt || '').localeCompare(String(a.data.savedAt || '')); });
    return out;
  }

  // Topic-level progress summary for a stored tracker object.
  function summarizeTopic(data) {
    var c = { green: 0, amber: 0, red: 0, unrated: 0, total: 0 };
    var ratings = (data.ratings && data.ratings.topic) || {};
    (data.structure.units || []).forEach(function (u) {
      (u.topics || []).forEach(function (t) {
        c.total++;
        var s = (ratings[t.id] && ratings[t.id].status) || 'unrated';
        c[s] = (c[s] || 0) + 1;
      });
    });
    return c;
  }

  function deleteTracker(slug) {
    localStorage.removeItem(storageKey(slug));
    if (localStorage.getItem('igcse-tracker-last') === slug) localStorage.removeItem('igcse-tracker-last');
    if (window.Sync && Sync.canWrite && Sync.canWrite()) Sync.deleteTracker(slug);
    if (state.slug === slug) {
      state.slug = null; state.structure = null; state.meta = null;
      renderEmpty();
      if (el.saveInfo) el.saveInfo.textContent = 'No tracker open.';
    }
  }

  function openLibrary() {
    var list = listSavedTrackers();
    var body;
    if (!list.length) {
      body = '<p class="u-sm u-muted">No saved trackers yet. Load a syllabus above to start one — it saves here automatically, and stays saved even after you close the tab.</p>';
    } else {
      body = '<p class="u-sm u-muted" style="margin-top:0">Everything you’ve started on this browser. Progress is saved automatically — pick up any of them where you left off.</p>' +
        '<ul class="tk-filelist">' + list.map(function (item) {
          var c = summarizeTopic(item.data);
          var pct = function (n) { return c.total ? Math.round(n / c.total * 100) : 0; };
          var pg = pct(c.green), pa = pct(c.amber), pr = pct(c.red), pu = Math.max(0, 100 - pg - pa - pr);
          var isCurrent = state.slug === item.slug;
          var when = item.data.savedAt ? new Date(item.data.savedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
          var name = (item.data.meta && item.data.meta.name) || item.slug;
          var code = (item.data.meta && item.data.meta.code) ? ' <span class="u-mono u-xs u-muted">' + esc(item.data.meta.code) + '</span>' : '';
          return '<li style="align-items:stretch">' +
            '<div style="flex:1;min-width:0">' +
              '<div class="name">' + esc(name) + code + (isCurrent ? ' <span class="badge badge--accent">current</span>' : '') + '</div>' +
              '<div class="tk-progress__bar" style="height:9px;margin:7px 0;max-width:320px">' +
                '<div class="tk-progress__seg tk-progress__seg--green" style="width:' + pg + '%"></div>' +
                '<div class="tk-progress__seg tk-progress__seg--amber" style="width:' + pa + '%"></div>' +
                '<div class="tk-progress__seg tk-progress__seg--red" style="width:' + pr + '%"></div>' +
                '<div class="tk-progress__seg tk-progress__seg--unrated" style="width:' + pu + '%"></div>' +
              '</div>' +
              '<div class="meta">' + pg + '% green · ' + c.total + ' topics · saved ' + when + '</div>' +
            '</div>' +
            '<div class="tk-btn-col" style="justify-content:center">' +
              '<button class="btn btn--outline btn--sm" data-open-tr="' + esc(item.slug) + '">Open</button>' +
              '<button class="btn btn--ghost btn--sm" data-del-tr="' + esc(item.slug) + '" title="Delete this tracker">Delete</button>' +
            '</div>' +
          '</li>';
        }).join('') + '</ul>';
    }
    body += '<div class="btn-row" style="margin-top:var(--space-4)"><button class="btn btn--ghost btn--sm" id="tk-lib-import">Load a downloaded .json file…</button>' +
      (window.Drive && window.Drive.getClientId() ? '<button class="btn btn--ghost btn--sm" id="tk-lib-drive">Load from Google Drive…</button>' : '') + '</div>';

    openModal('My trackers', body);
    el.modalContent.querySelectorAll('[data-open-tr]').forEach(function (b) {
      b.addEventListener('click', function () { if (openStored(b.getAttribute('data-open-tr'))) { closeModal(); if (el.subjectSelect) el.subjectSelect.value = ''; status('Opened your saved tracker.', 'ok'); } });
    });
    el.modalContent.querySelectorAll('[data-del-tr]').forEach(function (b) {
      b.addEventListener('click', function () {
        var slug = b.getAttribute('data-del-tr');
        var nm = slug;
        list.forEach(function (it) { if (it.slug === slug && it.data.meta) nm = it.data.meta.name; });
        if (confirm('Delete the tracker for "' + nm + '"? This can’t be undone (export it first if you want a backup).')) { deleteTracker(slug); openLibrary(); }
      });
    });
    var imp = $('tk-lib-import'); if (imp) imp.addEventListener('click', function () { closeModal(); $('tk-load-input').click(); });
    var dr = $('tk-lib-drive'); if (dr) dr.addEventListener('click', function () { closeModal(); driveLoad(); });
  }

  /* ---- export / import ---------------------------------------------------- */
  function exportJSON() {
    if (!state.structure) { status('Load a tracker first.', 'warn'); return; }
    var payload = { version: 1, meta: state.meta, slug: state.slug, structure: state.structure, ratings: state.ratings, exportedAt: new Date().toISOString() };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'igcse-tracker-' + state.slug + '-' + todayStr() + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function importJSON(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!data.structure || !data.structure.units) throw new Error('Not a valid tracker file.');
        if (state.structure && (Object.keys(state.ratings.topic).length || Object.keys(state.ratings.objective).length)) {
          if (!confirm('Replace the current tracker data with the loaded file?')) return;
        }
        adopt(data.meta || { name: 'Imported', code: '' }, data.structure, { slug: data.slug || slugify((data.meta && data.meta.name) || 'imported'), ratings: data.ratings, parsedFrom: 'import' });
        status('Loaded tracker from file.', 'ok');
      } catch (e) { status('Could not load that file: ' + esc(e.message), 'err'); }
    };
    reader.readAsText(file);
  }

  /* ---- Drive -------------------------------------------------------------- */
  function driveState() {
    if (!window.Drive) return;
    var connected = window.Drive.isConnected();
    var hasCid = !!window.Drive.getClientId();
    el.driveArea.innerHTML =
      (!hasCid
        ? '<button class="btn btn--outline btn--sm" data-drive="setup">Connect Google Drive</button>'
        : (connected
            ? '<button class="btn btn--primary btn--sm" data-drive="save">Save to Drive</button><button class="btn btn--outline btn--sm" data-drive="load">Load from Drive</button><button class="btn btn--ghost btn--sm" data-drive="setup">⚙︎</button>'
            : '<button class="btn btn--outline btn--sm" data-drive="connect">Connect Drive</button><button class="btn btn--ghost btn--sm" data-drive="setup">⚙︎</button>'));
    el.driveArea.querySelectorAll('[data-drive]').forEach(function (b) {
      b.addEventListener('click', function () {
        var a = b.getAttribute('data-drive');
        if (a === 'setup') openDriveSetup();
        else if (a === 'connect') window.Drive.connect().then(driveState).catch(function (e) { status('Drive: ' + esc(e.message), 'err'); });
        else if (a === 'save') driveSave();
        else if (a === 'load') driveLoad();
      });
    });
  }
  function driveSave() {
    if (!state.structure) { status('Load a tracker first.', 'warn'); return; }
    status('<span class="tk-spinner"></span>Saving to Drive…', 'busy');
    var payload = { version: 1, meta: state.meta, slug: state.slug, structure: state.structure, ratings: state.ratings, exportedAt: new Date().toISOString() };
    window.Drive.saveFile('igcse-tracker-' + state.slug + '.json', payload)
      .then(function () { status('Saved to your Google Drive → “' + window.Drive.FOLDER_NAME + '” folder.', 'ok'); driveState(); })
      .catch(function (e) { status('Drive save failed: ' + esc(e.message), 'err'); });
  }
  function driveLoad() {
    status('<span class="tk-spinner"></span>Listing Drive files…', 'busy');
    window.Drive.listFiles().then(function (files) {
      clearStatus();
      if (!files.length) { status('No tracker files found in your Drive folder yet.', 'warn'); return; }
      openModal('Load from Google Drive',
        '<ul class="tk-filelist">' + files.map(function (f) {
          return '<li><span><span class="name">' + esc(f.name) + '</span><br><span class="meta">' + new Date(f.modifiedTime).toLocaleString() + '</span></span><button class="btn btn--outline btn--sm" data-load-file="' + esc(f.id) + '">Load</button></li>';
        }).join('') + '</ul>');
      el.modalContent.querySelectorAll('[data-load-file]').forEach(function (b) {
        b.addEventListener('click', function () {
          window.Drive.loadFile(b.getAttribute('data-load-file')).then(function (data) {
            closeModal();
            adopt(data.meta || { name: 'Drive tracker', code: '' }, data.structure, { slug: data.slug, ratings: data.ratings, parsedFrom: 'drive' });
            status('Loaded from Drive.', 'ok');
          }).catch(function (e) { status('Load failed: ' + esc(e.message), 'err'); });
        });
      });
    }).catch(function (e) { status('Drive: ' + esc(e.message), 'err'); });
  }
  function openDriveSetup() {
    var origin = window.location.origin;
    var cid = window.Drive ? window.Drive.getClientId() : '';
    openModal('Connect Google Drive (optional)',
      '<p class="u-sm">Set this up once to save and load your tracker across devices. It uses your own free Google Cloud project — your data stays in your Drive.</p>' +
      '<ol class="step-list" style="margin:var(--space-4) 0">' +
        '<li><h4>Open the Google Cloud Console</h4><p class="u-sm u-mb-0"><a href="https://console.cloud.google.com" target="_blank" rel="noopener">console.cloud.google.com</a></p></li>' +
        '<li><h4>Create a new project</h4><p class="u-sm u-mb-0">Name it anything.</p></li>' +
        '<li><h4>Enable the Google Drive API</h4><p class="u-sm u-mb-0">APIs &amp; Services → Library → search “Drive” → Enable.</p></li>' +
        '<li><h4>Create OAuth 2.0 credentials</h4><p class="u-sm u-mb-0">Credentials → Create → OAuth client ID → <strong>Web application</strong>.</p></li>' +
        '<li><h4>Add this site as an authorized origin</h4><p class="u-sm u-mb-0">Authorized JavaScript origins → add: <code>' + esc(origin) + '</code></p></li>' +
        '<li><h4>Copy your Client ID and paste it below</h4></li>' +
      '</ol>' +
      '<label class="tk-panel__label">Google OAuth Client ID</label>' +
      '<input class="tk-input" id="tk-cid" value="' + esc(cid) + '" placeholder="xxxx.apps.googleusercontent.com">' +
      '<div class="btn-row" style="margin-top:var(--space-4)">' +
        '<button class="btn btn--primary" id="tk-cid-save">Save &amp; connect</button>' +
        (cid ? '<button class="btn btn--ghost" id="tk-cid-clear">Disconnect / clear</button>' : '') +
      '</div>');
    $('tk-cid-save').addEventListener('click', function () {
      var v = $('tk-cid').value.trim();
      if (!v) { alert('Paste your Client ID first.'); return; }
      window.Drive.setClientId(v);
      closeModal();
      window.Drive.connect().then(driveState).catch(function (e) { status('Drive: ' + esc(e.message), 'err'); });
    });
    if ($('tk-cid-clear')) $('tk-cid-clear').addEventListener('click', function () { window.Drive.clearClientId(); closeModal(); driveState(); });
  }

  /* ---- modal -------------------------------------------------------------- */
  function openModal(title, bodyHTML) {
    el.modalContent.innerHTML = '<button class="tk-modal__close" data-modal-close>×</button><h3>' + esc(title) + '</h3>' + bodyHTML;
    el.modal.classList.add('is-open');
    el.modalContent.querySelectorAll('[data-modal-close]').forEach(function (b) { b.addEventListener('click', closeModal); });
  }
  function closeModal() { el.modal.classList.remove('is-open'); el.modalContent.innerHTML = ''; }

  /* ---- cloud sync (window.Sync, optional) --------------------------------- */
  var syncSubscribed = false;
  var seededLocalUp = false;
  var syncError = null;      // set if Firebase couldn't be reached
  var gateBypassed = false;  // user chose "use this device only" after an error

  // Turn raw Firebase auth errors into calm, human sentences.
  function friendlyAuthError(e) {
    var m = (e && (e.code || e.message)) || '';
    if (/popup-closed|cancelled-popup|popup_closed/.test(m)) return 'The Google window closed before finishing — tap “Sign in with Google” to try again.';
    if (/popup-blocked/.test(m)) return 'Your browser blocked the Google pop-up — allow pop-ups for this site, then try again.';
    if (/unauthorized-domain/.test(m)) return 'This site isn’t authorised in Firebase yet. Add the domain under Authentication → Settings → Authorized domains.';
    if (/network-request-failed/.test(m)) return 'Couldn’t reach Google — check the internet connection and try again.';
    if (/not on the access list/.test(m)) return (e && e.message) || m; // already friendly
    return (e && e.message) || 'Sign-in didn’t finish — please try again.';
  }

  function doSignIn(btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Opening Google…'; }
    return Sync.signIn()
      .then(function () { syncError = null; status('Signed in — your work now syncs across devices.', 'ok'); })
      .catch(function (e) { status(esc(friendlyAuthError(e)), 'warn'); renderSync(); });
  }

  function renderSync() {
    if (!window.Sync || !Sync.isConfigured()) {
      if (el.syncBar) el.syncBar.style.display = 'none';
      if (el.gate) el.gate.hidden = true;
      return;
    }
    var s = Sync.state();
    renderSyncBar(s);
    renderGate(s);

    // Once signed in: start the live subscription (once) and seed local trackers up.
    if (s.signedIn) {
      if (!syncSubscribed) { syncSubscribed = true; Sync.subscribe(mergeRemoteDoc, removeRemoteDoc); }
      if (Sync.canWrite && Sync.canWrite() && !seededLocalUp) { seededLocalUp = true; seedLocalTrackersToCloud(); }
    }
  }

  // Slim, always-visible status bar under the nav.
  function renderSyncBar(s) {
    var bar = el.syncBar;
    if (!bar) return;
    bar.style.display = '';
    if ((!s.ready && !syncError) || (s.signedIn && s.checking)) {
      bar.className = 'tk-syncbar';
      bar.innerHTML = '<span class="tk-syncbar__msg"><span class="tk-spinner"></span> ' +
        (s.signedIn ? 'Checking your access…' : 'Connecting to sync…') + '</span>';
      return;
    }
    if (s.signedIn && s.role) {
      var roleLabel = s.role === 'editor' ? 'Editor — edits sync live' : 'Viewer — read only';
      bar.className = 'tk-syncbar tk-syncbar--on';
      bar.innerHTML =
        '<span class="tk-syncbar__msg">✓ Synced as <strong>' + esc(s.email) + '</strong> · ' + roleLabel + '</span>' +
        '<button class="btn btn--ghost btn--sm" id="tk-sync-out">Sign out</button>';
      var out = $('tk-sync-out');
      if (out) out.addEventListener('click', function () {
        Sync.signOut().then(function () { syncSubscribed = false; seededLocalUp = false; status('Signed out. Sign back in to keep syncing.', 'ok'); });
      });
      return;
    }
    // Not signed in (or signed in but access not resolved).
    bar.className = 'tk-syncbar tk-syncbar--off';
    bar.innerHTML =
      '<span class="tk-syncbar__msg">⚠ Not syncing — your work stays on this device only.</span>' +
      '<button class="btn btn--primary btn--sm" id="tk-sync-in-bar">Sign in with Google</button>';
    var b = $('tk-sync-in-bar');
    if (b) b.addEventListener('click', function () { doSignIn(b); });
  }

  // Full-screen blocker shown until the user is signed in AND their access is confirmed.
  function renderGate(s) {
    var gate = el.gate, card = el.gateCard;
    if (!gate || !card) return;

    // Confirmed access, or user chose to work offline after an error → no gate.
    if ((s.signedIn && s.role) || gateBypassed) { gate.hidden = true; return; }

    gate.hidden = false;

    // Signed in but Firestore rejected the access check (usually a network blip).
    if (s.signedIn && s.roleError) {
      card.innerHTML =
        '<div class="tk-gate__mark">⚠</div>' +
        '<h2>Couldn’t confirm your access</h2>' +
        '<p>You’re signed in, but we couldn’t reach the database to check your permissions — usually a connection hiccup.</p>' +
        '<div class="tk-gate__actions">' +
          '<button class="btn btn--primary" id="tk-gate-retry">Try again</button>' +
          '<button class="btn btn--ghost btn--sm" id="tk-gate-offline">Use this device only for now</button>' +
        '</div>' +
        '<p class="tk-gate__fine">“This device only” means today’s work saves here but won’t sync until you reconnect.</p>';
      var rr = $('tk-gate-retry');
      if (rr) rr.addEventListener('click', function () { rr.disabled = true; rr.textContent = 'Checking…'; Sync.retryRole().then(function () { renderSync(); }).catch(function () { renderSync(); }); });
      var of1 = $('tk-gate-offline');
      if (of1) of1.addEventListener('click', function () { gateBypassed = true; renderSync(); });
      return;
    }

    // Signed in, still checking access → calm blocking state.
    if (s.signedIn && s.checking) {
      card.innerHTML =
        '<div class="tk-gate__mark">☁</div>' +
        '<h2>Checking your access…</h2>' +
        '<p>One moment while we confirm your permissions.</p>' +
        '<p class="tk-gate__spin"><span class="tk-spinner"></span></p>';
      return;
    }

    // Still connecting to Firebase and no error yet → connecting state.
    if (!s.ready && !syncError) {
      card.innerHTML =
        '<div class="tk-gate__mark">☁</div>' +
        '<h2>Connecting…</h2>' +
        '<p>Getting your synced trackers ready. This only takes a moment.</p>' +
        '<p class="tk-gate__spin"><span class="tk-spinner"></span></p>';
      return;
    }

    // Couldn't reach Firebase at all → retry + safety escape.
    if (syncError) {
      card.innerHTML =
        '<div class="tk-gate__mark">⚠</div>' +
        '<h2>Can’t reach sync right now</h2>' +
        '<p>' + esc(friendlyAuthError(syncError)) + '</p>' +
        '<div class="tk-gate__actions">' +
          '<button class="btn btn--primary" id="tk-gate-retry2">Try signing in again</button>' +
          '<button class="btn btn--ghost btn--sm" id="tk-gate-offline2">Use this device only for now</button>' +
        '</div>' +
        '<p class="tk-gate__fine">“This device only” means today’s work saves here but won’t sync until you sign in.</p>';
      var r2 = $('tk-gate-retry2');
      if (r2) r2.addEventListener('click', function () { syncError = null; renderSync(); Sync.init().then(function () { renderSync(); }).catch(function (e) { syncError = e; renderSync(); }); doSignIn(r2); });
      var of2 = $('tk-gate-offline2');
      if (of2) of2.addEventListener('click', function () { gateBypassed = true; renderSync(); });
      return;
    }

    // Ready, not signed in → the required sign-in screen.
    var deniedNote = s.denied
      ? '<p class="tk-gate__fine" style="color:var(--red)">That account isn’t on the access list. Try a different Google account, or ask whoever set this up to add your email.</p>'
      : '<p class="tk-gate__fine">Use the Google account that was given access. Not on the list yet? Ask whoever set this up to add your email.</p>';
    card.innerHTML =
      '<div class="tk-gate__mark">🔒</div>' +
      '<h2>Sign in to start</h2>' +
      '<p>Your tracker saves to a shared space so it’s safe on every device and your family can follow along. Sign in once — this device stays signed in after that.</p>' +
      '<div class="tk-gate__actions"><button class="btn btn--primary" id="tk-gate-in">Sign in with Google</button></div>' +
      deniedNote;
    var gi = $('tk-gate-in');
    if (gi) gi.addEventListener('click', function () { doSignIn(gi); });
  }

  // A remote tracker arrived/changed → adopt into localStorage if newer, refresh UI.
  function mergeRemoteDoc(slug, remote) {
    if (!remote || !remote.structure) return;
    var local = loadStored(slug);
    var rt = remote.savedAt || '', lt = (local && local.savedAt) || '';
    if (local && rt <= lt) return; // ours is same/newer — keep it
    var toStore = {
      version: remote.version || 1, meta: remote.meta, slug: slug,
      structure: remote.structure, ratings: remote.ratings || { topic: {}, objective: {} },
      savedAt: remote.savedAt, savedBy: remote.savedBy
    };
    try { localStorage.setItem(storageKey(slug), JSON.stringify(toStore)); } catch (e) { return; }
    // If it's the tracker currently on screen and the edit came from someone else, live-refresh.
    var mine = Sync.myEmail && Sync.myEmail();
    if (state.slug === slug && remote.savedBy && remote.savedBy !== mine) {
      openStored(slug);
      status('Updated from ' + esc(remote.savedBy) + '.', 'ok');
    }
    if (el.modal && el.modal.classList.contains('is-open')) openLibrary();
  }

  // A remote tracker was deleted by an editor → remove our cloud-synced copy too.
  function removeRemoteDoc(slug) {
    var local = loadStored(slug);
    if (!local || !local.savedBy) return; // only drop copies that came from the cloud
    localStorage.removeItem(storageKey(slug));
    if (state.slug === slug) { state.slug = null; state.structure = null; state.meta = null; renderEmpty(); }
    if (el.modal && el.modal.classList.contains('is-open')) openLibrary();
  }

  // Push any trackers this browser already has up to the shared space (first sign-in).
  function seedLocalTrackersToCloud() {
    listSavedTrackers().forEach(function (item) {
      var d = item.data;
      Sync.pushTracker(item.slug, {
        version: d.version || 1, meta: d.meta, structure: d.structure,
        ratings: d.ratings, savedAt: d.savedAt || new Date().toISOString()
      });
    });
  }

  /* ---- init --------------------------------------------------------------- */
  function init() {
    el = {
      subjectName: $('tk-subject-name'), progress: $('tk-progress'),
      viewToggle: $('tk-view-toggle'), filters: $('tk-filters'), tierFilter: $('tk-tier-filter'),
      saveInfo: $('tk-save-info'), driveArea: $('tk-drive-area'),
      syncBar: $('tk-sync-bar'), gate: $('tk-gate'), gateCard: $('tk-gate-card'),
      status: $('tk-status'), preview: $('tk-preview'), toolbar: $('tk-toolbar'), tableWrap: $('tk-table-wrap'),
      modal: $('tk-modal-backdrop'), modalContent: $('tk-modal-content'),
      subjectSelect: $('tk-subject-select')
    };
    clearStatus(); hidePreview();

    // Populate subject dropdown from subjects.json
    fetch('/igcse-zyarisa/data/subjects.json').then(function (r) { return r.json(); }).then(function (data) {
      window.__SUBJECTS__ = data;
      if (el.subjectSelect) {
        var opts = ['<option value="">Choose a subject…</option>'];
        Object.keys(data).forEach(function (slug) { opts.push('<option value="' + slug + '">' + esc(data[slug].name) + ' (' + esc(data[slug].code) + ')</option>'); });
        el.subjectSelect.innerHTML = opts.join('');
        // URL ?subject= preselect
        var q = new URLSearchParams(window.location.search).get('subject');
        if (q && data[q]) { el.subjectSelect.value = q; }
      }
    }).catch(function () { /* offline / file:// — dropdown just stays minimal */ });

    // Input path wiring
    if ($('tk-pdf-input')) $('tk-pdf-input').addEventListener('change', function (e) { handlePdf(e.target.files[0]); });
    var drop = $('tk-drop');
    if (drop) {
      drop.addEventListener('click', function () { $('tk-pdf-input').click(); });
      ['dragover', 'dragenter'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-dragover'); }); });
      ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('is-dragover'); }); });
      drop.addEventListener('drop', function (e) { if (e.dataTransfer.files[0]) handlePdf(e.dataTransfer.files[0]); });
    }
    if ($('tk-parse-paste')) $('tk-parse-paste').addEventListener('click', function () { handlePaste($('tk-paste').value); });
    if ($('tk-load-subject')) $('tk-load-subject').addEventListener('click', function () { handleSelectSubject(el.subjectSelect.value); });

    // View toggle / filters / tier
    if (el.viewToggle) el.viewToggle.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { state.view = b.getAttribute('data-view'); render(); }); });
    if (el.filters) el.filters.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { state.filter = b.getAttribute('data-filter'); renderFilters(); renderTable(); }); });
    if (el.tierFilter) el.tierFilter.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { state.tier = b.getAttribute('data-tier'); renderTierFilter(); renderProgress(); renderTable(); }); });

    // Save controls
    if ($('tk-btn-library')) $('tk-btn-library').addEventListener('click', openLibrary);
    if ($('tk-btn-download')) $('tk-btn-download').addEventListener('click', exportJSON);
    if ($('tk-load-input')) $('tk-load-input').addEventListener('change', function (e) { importJSON(e.target.files[0]); });
    if ($('tk-btn-load')) $('tk-btn-load').addEventListener('click', function () { $('tk-load-input').click(); });
    if ($('tk-btn-print')) $('tk-btn-print').addEventListener('click', printTracker);

    // Drive
    if (el.driveArea && window.Drive) { driveState(); window.Drive.onStatus(driveState); }

    // Cloud sync (optional — dormant unless firebase-config.js is filled in)
    if (window.Sync && Sync.isConfigured()) {
      Sync.onStatus(renderSync);
      renderSync();
      // If Firebase can't be reached in 10s, drop the "connecting" gate into an
      // error state with a safety escape — never leave her staring at a spinner.
      var gateTimer = setTimeout(function () {
        if (!Sync.state().ready) { syncError = new Error('network-request-failed'); renderSync(); }
      }, 10000);
      Sync.init()
        .then(function () { clearTimeout(gateTimer); renderSync(); })
        .catch(function (e) { clearTimeout(gateTimer); syncError = e; renderSync(); });
    }

    // Modal backdrop click closes
    if (el.modal) el.modal.addEventListener('click', function (e) { if (e.target === el.modal) closeModal(); });

    // Restore last-opened subject if present
    var last = localStorage.getItem('igcse-tracker-last');
    if (last && loadStored(last)) { openStored(last); if (el.subjectSelect) el.subjectSelect.value = last; }
    else renderEmpty();
  }

  function printTracker() {
    if (!state.structure) { status('Load a tracker first.', 'warn'); return; }
    var c = counts();
    var head = $('tk-print-head');
    if (head) {
      head.innerHTML = '<h2>' + esc(state.meta.name) + (state.meta.code ? ' (' + esc(state.meta.code) + ')' : '') + '</h2>' +
        '<p class="u-sm">' + (state.view === 'topic' ? 'Topic level' : 'Objective level') + ' · printed ' + todayStr() +
        ' · ' + c.green + ' green / ' + c.amber + ' amber / ' + c.red + ' red / ' + c.unrated + ' unrated (of ' + c.total + ')</p>';
    }
    window.print();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.Tracker = { openStored: openStored, _state: state };
})();
