/* parser.js — Cambridge syllabus parser + pattern detection.
 * Standalone and testable. Exposes window.Parser.
 *
 *   Parser.parseSyllabus(text)        -> structured result (units/topics/objectives + confidence)
 *   Parser.extractPdfText(file)       -> Promise<string>  (uses global pdfjsLib, loaded by the page)
 *   Parser.classifyDemand(text)       -> { verb, level }
 *   Parser.DEMAND_VERBS               -> the verb→level map
 *
 * The tracker builds its table from parseSyllabus() output. No DOM here.
 */
(function () {
  'use strict';

  /* ---- Stage 3 helper: demand verb → cognitive level ---------------------- */
  var DEMAND_VERBS = {
    recall:     ['state', 'name', 'list', 'identify', 'give', 'define', 'recall', 'label', 'write'],
    understand: ['describe', 'outline', 'summarise', 'summarize', 'explain', 'distinguish', 'recognise', 'recognize'],
    apply:      ['calculate', 'determine', 'find', 'use', 'apply', 'show', 'derive', 'construct'],
    analyse:    ['analyse', 'analyze', 'interpret', 'suggest', 'predict', 'deduce', 'comment', 'sketch'],
    evaluate:   ['evaluate', 'discuss', 'assess', 'justify', 'compare', 'criticise', 'criticize', 'argue']
  };

  function classifyDemand(text) {
    var first = String(text || '').trim().toLowerCase().replace(/^[^a-z]+/, '').split(/\s+/)[0] || '';
    for (var level in DEMAND_VERBS) {
      if (DEMAND_VERBS[level].indexOf(first) !== -1) return { verb: first, level: level };
    }
    return { verb: first, level: null };
  }

  /* ---- Stage 1: noise removal --------------------------------------------- */
  // Phrases that mark the START of real content (parse from the first hit).
  var CONTENT_STARTS = [
    'subject content', 'learning objectives', 'curriculum framework',
    'curriculum content', 'syllabus content', 'detailed teaching'
  ];
  // Phrases that mark the END of real content (stop before the first hit).
  var CONTENT_ENDS = [
    'assessment objectives', 'appendix', 'command words', 'glossary of',
    'other information', 'how to use this syllabus', 'changes to this syllabus',
    'grade descriptions', 'mathematical notation', 'important notices'
  ];
  // Junk lines to drop outright (headers / footers / boilerplate).
  var JUNK = [
    /^cambridge\b.*(igcse|international)/i,
    /^\s*\d+\s*$/,                              // lone page numbers
    /back to contents/i,
    /^\s*©|copyright/i,
    /this syllabus is (for|graded)/i,
    /^\s*www\.|cambridgeinternational\.org/i,
    /^\s*page\s+\d+/i,
    /version\s+\d/i
  ];

  function stripNoise(rawLines) {
    var lines = rawLines.slice();
    var lower = lines.map(function (l) { return l.toLowerCase(); });

    // Find start
    var start = 0;
    for (var i = 0; i < lower.length; i++) {
      if (CONTENT_STARTS.some(function (p) { return lower[i].indexOf(p) !== -1; })) { start = i + 1; break; }
    }
    // Find end (after start)
    var end = lines.length;
    for (var j = start; j < lower.length; j++) {
      if (CONTENT_ENDS.some(function (p) { return lower[j].indexOf(p) !== -1; })) { end = j; break; }
    }
    var kept = lines.slice(start, end);

    // Drop junk lines
    return kept.filter(function (l) {
      if (!l.trim()) return false;
      return !JUNK.some(function (re) { return re.test(l); });
    });
  }

  /* ---- Stage 2: pattern detection ----------------------------------------- */
  var RE = {
    objNum:   /^(\d+\.\d+\.\d+)\s+(.+)$/,       // 1.1.1 objective
    topicNum: /^(\d+\.\d+)\s+(.+)$/,            // 1.1 topic
    unitNum:  /^(\d+)\s+([A-Za-z].+)$/,         // 1 Unit
    topicLet: /^([A-Z]{1,2}\d+)\s+(.+)$/,       // R1 topic (skill code)
    bullet:   /^[•\-•▪–]\s*(.+)$/ // • bullet objective
  };

  function detectPattern(lines) {
    var numeric = 0, lettered = 0;
    lines.forEach(function (l) {
      if (RE.objNum.test(l) || RE.topicNum.test(l) || RE.unitNum.test(l)) numeric++;
      if (RE.topicLet.test(l) || RE.bullet.test(l)) lettered++;
    });
    if (numeric >= lettered && numeric > 0) return numeric > lettered * 2 ? 'A' : 'A-mixed';
    if (lettered > 0) return lettered > numeric * 2 ? 'B' : 'B-mixed';
    return 'B'; // fall back to loose/skill parsing
  }

  /* ---- multi-line continuation join --------------------------------------- */
  function startsNewNode(line) {
    return RE.objNum.test(line) || RE.topicNum.test(line) || RE.unitNum.test(line) ||
           RE.topicLet.test(line) || RE.bullet.test(line);
  }

  /* ---- Stage 2/3: Pattern A (numeric hierarchy) --------------------------- */
  function parseNumeric(lines) {
    var units = [];
    var curUnit = null, curTopic = null, curObj = null;
    var flagged = [];

    function ensureUnit(id, title) { curUnit = { id: id, title: clean(title), topics: [] }; units.push(curUnit); curTopic = null; curObj = null; }
    function ensureTopic(id, title) {
      if (!curUnit) ensureUnit(id.split('.')[0], 'Unit ' + id.split('.')[0]);
      curTopic = { id: id, title: clean(title), objectives: [] }; curUnit.topics.push(curTopic); curObj = null;
    }

    lines.forEach(function (line) {
      var m;
      if ((m = line.match(RE.objNum))) {
        if (!curTopic) {
          var tid = m[1].split('.').slice(0, 2).join('.');
          ensureTopic(tid, 'Topic ' + tid);
        }
        var d = classifyDemand(m[2]);
        curObj = { id: m[1], text: clean(m[2]), demandVerb: d.verb, demandLevel: d.level, tier: detectTier(m[2]) };
        curTopic.objectives.push(curObj);
      } else if ((m = line.match(RE.topicNum))) {
        ensureTopic(m[1], m[2]);
      } else if ((m = line.match(RE.unitNum))) {
        ensureUnit(m[1], m[2]);
      } else {
        // continuation of the previous objective/topic
        if (curObj) { curObj.text = clean(curObj.text + ' ' + line); refreshDemand(curObj); }
        else if (curTopic) { curTopic.title = clean(curTopic.title + ' ' + line); }
        else { flagged.push(line); }
      }
    });
    return { units: units, flagged: flagged };
  }

  /* ---- Stage 2/3: Pattern B (skill / lettered) --------------------------- */
  function parseSkill(lines) {
    var units = [];
    var curUnit = null, curTopic = null, curObj = null;
    var flagged = [];

    function ensureUnit(title) { curUnit = { id: slug(title), title: clean(title), topics: [] }; units.push(curUnit); curTopic = null; curObj = null; }
    function ensureTopic(id, title) {
      if (!curUnit) ensureUnit('General');
      curTopic = { id: id, title: clean(title), objectives: [] }; curUnit.topics.push(curTopic); curObj = null;
    }

    lines.forEach(function (line) {
      var m;
      if ((m = line.match(RE.topicLet))) {
        ensureTopic(m[1], m[2]);
      } else if ((m = line.match(RE.bullet))) {
        if (!curTopic) ensureTopic(slug(line).slice(0, 8) || 'T', 'Objectives');
        var d = classifyDemand(m[1]);
        curObj = { id: (curTopic.id + '.' + (curTopic.objectives.length + 1)), text: clean(m[1]), demandVerb: d.verb, demandLevel: d.level, tier: null };
        curTopic.objectives.push(curObj);
      } else if (isHeading(line)) {
        ensureUnit(line);
      } else {
        if (curObj) { curObj.text = clean(curObj.text + ' ' + line); refreshDemand(curObj); }
        else if (curTopic) {
          // treat as a plain objective without a bullet
          var d2 = classifyDemand(line);
          curObj = { id: (curTopic.id + '.' + (curTopic.objectives.length + 1)), text: clean(line), demandVerb: d2.verb, demandLevel: d2.level, tier: null };
          curTopic.objectives.push(curObj);
        } else { flagged.push(line); }
      }
    });
    return { units: units, flagged: flagged };
  }

  /* ---- small helpers ------------------------------------------------------ */
  function clean(s) { return String(s).replace(/\s+/g, ' ').replace(/\s*\.\s*$/, '').trim(); }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function refreshDemand(obj) { var d = classifyDemand(obj.text); obj.demandVerb = d.verb; obj.demandLevel = d.level; }
  function detectTier(text) {
    if (/\b(extended|supplement)\b/i.test(text)) return 'extended';
    if (/\bcore\b/i.test(text)) return 'core';
    return null;
  }
  // A likely section/skill heading: short, title-ish line, no trailing marker, not sentence-like.
  function isHeading(line) {
    var t = line.trim();
    if (t.length < 3 || t.length > 60) return false;
    if (/[.:;,]$/.test(t)) return false;
    var words = t.split(/\s+/);
    if (words.length > 6) return false;
    // Mostly capitalised words, or a single known skill word
    var caps = words.filter(function (w) { return /^[A-Z]/.test(w); }).length;
    if (caps / words.length >= 0.6) return true;
    return /^(reading|writing|listening|speaking|grammar|vocabulary)$/i.test(t);
  }

  /* ---- Stage 4/5: orchestration + confidence + stats --------------------- */
  function parseSyllabus(text) {
    var rawLines = String(text || '').split(/\r?\n/).map(function (l) { return l.replace(/\t/g, ' ').trimEnd(); });
    var lines = stripNoise(rawLines);
    var pattern = detectPattern(lines);

    var result;
    if (pattern.charAt(0) === 'A') result = parseNumeric(lines);
    else result = parseSkill(lines);

    // Prune empty units/topics
    result.units = result.units.filter(function (u) { return u.topics.length > 0; });

    var stats = countStats(result.units);
    var confidence;
    if (pattern === 'A') confidence = 'high';
    else if (pattern === 'B' && stats.objectives > 0) confidence = 'medium';
    else confidence = 'review';
    // Mixed structures always warrant review
    if (pattern.indexOf('mixed') !== -1) confidence = 'review';
    if (stats.topics === 0) confidence = 'review';

    return {
      units: result.units,
      pattern: pattern,
      parseConfidence: confidence,           // 'high' | 'medium' | 'review'
      stats: stats,                          // { units, topics, objectives }
      flagged: result.flagged || [],         // lines the parser was unsure about
      warning: pattern.indexOf('mixed') !== -1 ? 'Mixed structure — review suggested' : null
    };
  }

  function countStats(units) {
    var t = 0, o = 0;
    units.forEach(function (u) { t += u.topics.length; u.topics.forEach(function (tp) { o += tp.objectives.length; }); });
    return { units: units.length, topics: t, objectives: o };
  }

  /* ---- PDF text extraction (needs global pdfjsLib) ------------------------ */
  function extractPdfText(file) {
    return new Promise(function (resolve, reject) {
      if (typeof pdfjsLib === 'undefined') { reject(new Error('PDF.js not loaded')); return; }
      var reader = new FileReader();
      reader.onload = function () {
        var task = pdfjsLib.getDocument({ data: new Uint8Array(reader.result) });
        task.promise.then(function (pdf) {
          var pages = [];
          var chain = Promise.resolve();
          for (var p = 1; p <= pdf.numPages; p++) {
            (function (pageNum) {
              chain = chain.then(function () {
                return pdf.getPage(pageNum).then(function (page) {
                  return page.getTextContent().then(function (tc) {
                    // Reconstruct lines using the y-coordinate of each text item.
                    var rows = {};
                    tc.items.forEach(function (it) {
                      var y = Math.round(it.transform[5]);
                      (rows[y] = rows[y] || []).push({ x: it.transform[4], s: it.str });
                    });
                    var ys = Object.keys(rows).map(Number).sort(function (a, b) { return b - a; });
                    var text = ys.map(function (y) {
                      return rows[y].sort(function (a, b) { return a.x - b.x; }).map(function (i) { return i.s; }).join(' ').replace(/\s+/g, ' ').trim();
                    }).filter(Boolean).join('\n');
                    pages.push(text);
                  });
                });
              });
            })(p);
          }
          return chain.then(function () { resolve(pages.join('\n')); });
        }).catch(reject);
      };
      reader.onerror = function () { reject(reader.error); };
      reader.readAsArrayBuffer(file);
    });
  }

  window.Parser = {
    parseSyllabus: parseSyllabus,
    extractPdfText: extractPdfText,
    classifyDemand: classifyDemand,
    DEMAND_VERBS: DEMAND_VERBS
  };
})();
