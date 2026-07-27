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
    'grade descriptions', 'mathematical notation', 'important notices',
    'details of the assessment', 'what else you need to know'
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
    // Count only STRUCTURE markers. Bullets are objective markers used by BOTH
    // patterns, so they must NOT tip the choice toward skill parsing — that was
    // sending modern "1.1 topic + bullet objectives" syllabuses to the wrong parser.
    var numeric = 0, lettered = 0;
    lines.forEach(function (l) {
      if (RE.objNum.test(l) || RE.topicNum.test(l) || RE.unitNum.test(l)) numeric++;
      if (RE.topicLet.test(l)) lettered++;                 // real skill codes only (R1, W2…)
    });
    if (numeric > 0 && numeric >= lettered) return 'A';     // any numeric hierarchy → numeric parser
    if (lettered > 0) return 'B';                           // skill/lettered
    return 'B';                                             // headings + bullets / loose
  }

  /* ---- multi-line continuation join --------------------------------------- */
  function startsNewNode(line) {
    return RE.objNum.test(line) || RE.topicNum.test(line) || RE.unitNum.test(line) ||
           RE.topicLet.test(line) || RE.bullet.test(line);
  }

  // A line that is ONLY a tier marker ("Core", "Supplement", "Extended").
  var TIER_ONLY = /^(core|supplement|extended)\b\s*:?\s*$/i;
  function tierFromMarker(s) { return /supplement|extended/i.test(s) ? 'extended' : 'core'; }

  /* ---- Stage 2/3: Pattern A (numeric hierarchy) --------------------------- */
  function parseNumeric(lines) {
    var units = [];
    var curUnit = null, curTopic = null, curObj = null, curTier = null;
    var flagged = [];

    function ensureUnit(id, title) {
      for (var i = 0; i < units.length; i++) { if (units[i].id === id) { curUnit = units[i]; curTopic = null; curObj = null; return; } }
      curUnit = { id: id, title: clean(title), topics: [] }; units.push(curUnit); curTopic = null; curObj = null;
    }
    function ensureTopic(id, title) {
      if (!curUnit) ensureUnit(id.split('.')[0], 'Unit ' + id.split('.')[0]);
      for (var i = 0; i < curUnit.topics.length; i++) { if (curUnit.topics[i].id === id) { curTopic = curUnit.topics[i]; curObj = null; return; } }
      curTopic = { id: id, title: clean(title), objectives: [] }; curUnit.topics.push(curTopic); curObj = null;
    }
    function addObjective(text) {
      if (!curTopic) ensureTopic((curUnit ? curUnit.id : '1') + '.1', curUnit ? curUnit.title : 'Objectives');
      var d = classifyDemand(text);
      curObj = { id: curTopic.id + '.' + (curTopic.objectives.length + 1), text: clean(text), demandVerb: d.verb, demandLevel: d.level, tier: curTier || detectTier(text) };
      curTopic.objectives.push(curObj);
    }

    lines.forEach(function (line) {
      var m;
      if (TIER_ONLY.test(line)) { curTier = tierFromMarker(line); return; } // "Core"/"Supplement" header
      if ((m = line.match(RE.objNum))) {
        if (!curTopic) { var tid = m[1].split('.').slice(0, 2).join('.'); ensureTopic(tid, 'Topic ' + tid); }
        var d = classifyDemand(m[2]);
        curObj = { id: m[1], text: clean(m[2]), demandVerb: d.verb, demandLevel: d.level, tier: curTier || detectTier(m[2]) };
        curTopic.objectives.push(curObj);
      } else if ((m = line.match(RE.topicNum))) {
        ensureTopic(m[1], m[2]); curTier = null;
      } else if ((m = line.match(RE.unitNum))) {
        ensureUnit(m[1], m[2]); curTier = null;
      } else if ((m = line.match(RE.bullet))) {
        addObjective(m[1]);                                   // • bullet objective
      } else {
        // No marker: objective continuation, topic-title wrap, or a loose objective.
        if (curObj) { curObj.text = clean(curObj.text + ' ' + line); refreshDemand(curObj); }
        else if (curTopic && curTopic.objectives.length === 0) { curTopic.title = clean(curTopic.title + ' ' + line); }
        else if (curTopic) { addObjective(line); }
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
      if (TIER_ONLY.test(line)) { return; } // drop lone "Core"/"Supplement" headers
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

  /* ---- Last-resort loose parser: never come back empty if there's content -- */
  // Turns almost any list of lines into headings (topics) + objectives so the
  // student always gets an editable checklist, flagged as 'review'.
  function parseLoose(lines) {
    var unit = { id: '1', title: 'Syllabus content', topics: [] };
    var curTopic = null, curObj = null;
    function newTopic(title) { curTopic = { id: 't' + (unit.topics.length + 1), title: clean(title), objectives: [] }; unit.topics.push(curTopic); curObj = null; }
    function addObj(text) {
      if (!curTopic) newTopic('General');
      var d = classifyDemand(text);
      curObj = { id: curTopic.id + '.' + (curTopic.objectives.length + 1), text: clean(text), demandVerb: d.verb, demandLevel: d.level, tier: detectTier(text) };
      curTopic.objectives.push(curObj);
    }
    lines.forEach(function (line) {
      if (TIER_ONLY.test(line)) return;
      var m;
      if ((m = line.match(RE.unitNum)) || (m = line.match(RE.topicNum))) { newTopic(m[2]); return; }
      var bm = line.match(RE.bullet);
      if (bm) { addObj(bm[1]); return; }
      if (isHeading(line)) { newTopic(line); return; }
      // A wrapped continuation of the previous objective, else a loose objective.
      if (curObj && /^[a-z(]/.test(line)) { curObj.text = clean(curObj.text + ' ' + line); refreshDemand(curObj); }
      else addObj(line);
    });
    return { units: unit.topics.length ? [unit] : [], flagged: [] };
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

  /* ---- Pre-process: rebuild lines from one-paragraph PDF/copy text --------- */
  // Copying a Cambridge PDF flattens everything onto one line, with the numbers
  // (1 / 1.1 / 1.1.1) and bullets (•) jammed inline. Put each structure marker on
  // its own line and strip the repeating page furniture, so the numeric parser
  // can see the hierarchy. Text that already has newlines is largely unaffected.
  function preprocessInline(text) {
    var t = ' ' + String(text || '').replace(/\r/g, ' ') + ' ';
    // Drop the repeating footer/boilerplate that gets glued between sections.
    t = t.replace(/Cambridge (?:IGCSE|IGCSE \(9[–-]1\)|O Level|International)[^.]*?syllabus for \d{4}\./gi, ' ');
    t = t.replace(/www\.cambridgeinternational\.org\S*/gi, ' ');
    t = t.replace(/back to contents page/gi, ' ');
    t = t.replace(/\bcontinued\b/gi, ' ');
    // One structure marker per line. Order matters: bullets, then 3-, 2-, 1-level.
    t = t.replace(/\s*[•▪·]\s*/g, '\n• ');
    t = t.replace(/\s+(\d+\.\d+\.\d+)\s+/g, '\n$1 ');       // 1.1.1 objective
    t = t.replace(/\s+(\d+\.\d+)\s+(?=[A-Za-z])/g, '\n$1 '); // 1.1 topic
    t = t.replace(/\s+([1-9])\s+(?=[A-Z][a-z])/g, '\n$1 ');  // 1 Unit heading
    return t;
  }

  /* ---- Stage 4/5: orchestration + confidence + stats --------------------- */
  function parseSyllabus(text) {
    // Rebuild lines from flattened one-paragraph text, then full-trim each line
    // (leading spaces too) so copied/indented text still matches the patterns.
    var rawLines = preprocessInline(text).split(/\r?\n/).map(function (l) { return l.replace(/\t/g, ' ').replace(/\s+/g, ' ').trim(); });
    var lines = stripNoise(rawLines);
    var pattern = detectPattern(lines);

    var result;
    if (pattern.charAt(0) === 'A') result = parseNumeric(lines);
    else result = parseSkill(lines);

    // Prune empty units/topics
    result.units = result.units.filter(function (u) { return u.topics.length > 0; });

    var stats = countStats(result.units);
    var usedLoose = false;
    // Nothing structured detected → last-resort loose parse so we rarely fail.
    if (stats.topics === 0) {
      var loose = parseLoose(lines);
      loose.units = loose.units.filter(function (u) { return u.topics.length > 0; });
      if (countStats(loose.units).topics > 0) { result = loose; stats = countStats(result.units); usedLoose = true; }
    }

    var confidence;
    if (usedLoose) confidence = 'review';
    else if (pattern === 'A' && stats.objectives > 0) confidence = 'high';
    else if (stats.objectives > 0) confidence = 'medium';
    else if (stats.topics > 0) confidence = 'medium';       // topic-level only (e.g. skill codes)
    else confidence = 'review';
    if (stats.topics === 0) confidence = 'review';

    return {
      units: result.units,
      pattern: pattern,
      parseConfidence: confidence,           // 'high' | 'medium' | 'review'
      stats: stats,                          // { units, topics, objectives }
      flagged: result.flagged || [],         // lines the parser was unsure about
      warning: usedLoose
        ? 'Structure wasn’t obvious, so this is a best-effort read — check the topics below and edit anything that looks off.'
        : null
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
