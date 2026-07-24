# CLAUDE.md — IGCSE Study Site: Build Memory

> Read this file at the start of every session before doing anything else.
> Update it at the end of every work session.

## What this is
A static, no-build, GitHub-Pages-hostable website for a Cambridge IGCSE student
(Grade 9–10, India, exams May/June 2028), built by her older sister. Voice is
warm, specific, big-sister — never generic study-site. Pure HTML/CSS/JS, no frameworks.

## Golden rules (do not violate)
1. **`main.css` is the single design system.** No hardcoded colors/fonts inline in pages.
   Every color is a CSS custom property token. If a new component appears while building a
   page, extract it back into `main.css` — never define it inline.
2. **4 themes** (light default, dark, high-contrast, vintage) via `data-theme` on `<html>`.
   Token names are identical across themes; only values change. Stored in localStorage key `igcse-theme`.
3. **Nav is injected via JS** from `assets/js/nav.js`. Every page has `<div id="nav-container"></div>`
   and loads `theme.js` **before** `nav.js`.
4. **Root-relative paths** everywhere (`/assets/css/main.css`), because GitHub Pages serves from root.
   NOTE: root-relative paths + `fetch('/data/subjects.json')` require a server — use Live Server locally,
   not `file://`.
5. Google Fonts `@import` lives in `main.css` only.
6. PDF.js CDN loaded only in `tracker/index.html`.
7. Tracker styles live in `tracker.css` only — never bleed into `main.css`.

## Hosting (decided)
- GitHub account: **parisa-singh**.
- Site uses root-relative paths throughout, so it MUST be served from the domain root.
- **Recommended repo name: `parisa-singh.github.io`** (user site → served at root, paths just work).
- If a different repo name is ever used, paths break at the `/reponame/` subpath — would need
  a `<base href="/reponame/">` in every page's `<head>` AND changing `fetch('/data/subjects.json')`
  to a relative path. Avoid; prefer the user-site repo name.

## Build status
- [x] Folder structure
- [x] CLAUDE.md
- [x] README.md
- [x] data/subjects.json (all 9 subjects, verbatim from spec)
- [x] assets/js/theme.js
- [x] assets/css/main.css  ← DESIGN SYSTEM LOCKED
- [x] assets/js/nav.js
- [x] index.html
- [x] study-system.html   (incl. #command-words anchor; inline tab-wiring script)
- [x] resources.html
- [x] past-papers.html
- [x] subjects/index.html
- [x] subjects/physics.html  ← reference template for other subject pages
- [x] subjects/business.html
- [x] subjects/economics.html
- [x] subjects/computer-science.html   (incl. Pseudocode Reference section)
- [x] subjects/international-math.html  (5-tab calculator deep-dive; own inline tab script)
- [x] subjects/english-language.html
- [x] subjects/english-literature.html
- [x] subjects/french.html
- [x] subjects/psychology.html
- [x] assets/js/parser.js  (tested vs numeric + skill samples in node)
- [x] assets/js/drive.js
- [x] assets/css/tracker.css
- [x] assets/js/tracker.js
- [x] tracker/index.html

### BUILD COMPLETE — all files done. All JS passes `node --check`; all tracker DOM IDs verified present.

## Decisions & conventions established
- Files live at repo root (working dir IS the project root; no extra `igcse-site/` wrapper).
- Brand name in nav/footer: "IGCSE Playbook" (◆ mark in --accent).
- **Standard page skeleton** (copy for every new page):
  `<head>`: meta charset+viewport, `<title>`, `<meta description>`, `<link main.css>`,
  `<script src="/assets/js/theme.js">` (in head, prevents theme flash).
  `<body>`: `<div id="nav-container"></div>` first, content in `<section class="section">`,
  `<footer class="site-footer">` (same markup on every page), `<script src="/assets/js/nav.js">` last.
- Section rhythm: `.section` (64px block padding), alternate plain `--paper` and `background:var(--cream)`
  bands for visual separation. Use `.container` (1080) or `.container--narrow` (760, for reading).
- Section headers use `.section-head` (eyebrow + h2 + auto accent rule).
- Component vocabulary available (all in main.css): `.card`(+`--accent`/`--warm`, `a.card` w/ `.card__arrow`),
  `.tip-box`(+`--warn`), `.pull-quote`+`cite`, `.badge`(+green/amber/red/neutral/accent),
  `.demand-badge[data-level=recall|understand|apply|analyse|evaluate]`, `.depth-badge`(--low/mid/high),
  `.btn`(+primary/outline/warm/ghost/sm), `.step-list`, `.resource-grid`/`.card-grid`/`.grid-2`/`.grid-3`,
  `.table-wrap`+`table.data`, `.tabs`/`.tab-btn`/`.tab-panel.is-active`, `.weight-bar`, `.keys .key`, `.chips`.
- Icons: use simple Unicode/emoji, no icon library (keeps zero-dependency).
- Tabs interaction JS is NOT global yet — pages needing tabs (int-math calculator, study-system
  grade columns) include a small inline `<script>` to wire `.tab-btn`→`.tab-panel`. Keep it consistent.
- External links: `target="_blank" rel="noopener"`. Uncertain YouTube URLs use search-query links
  (honest per spec's "search for X" pattern) rather than fabricated channel/video IDs.

## Tracker architecture notes (for future edits)
- Persistence: ONE object per subject at localStorage `igcse-tracker-{slug}` = {meta, structure, ratings, savedAt}.
  ratings has independent `topic` and `objective` maps (rowId → {status, notes, updated}). Last subject at `igcse-tracker-last`.
- parser.js exposes window.Parser: parseSyllabus(text)→{units,pattern,parseConfidence,stats,flagged,warning};
  extractPdfText(file)→Promise<text> (needs global pdfjsLib); classifyDemand(text); DEMAND_VERBS.
  Pattern A = numeric (\d+ / \d+.\d+ / \d+.\d+.\d+); Pattern B = skill/lettered (Reading / R1 / • bullet).
- drive.js exposes window.Drive (GIS token flow + Drive REST v3, scope drive.file, folder "IGCSE Tracker").
  Client ID stored at `igcse-drive-client-id`. Optional; nothing runs until user sets it up.
- "Select Subject" path: subjects.json has NO topic lists (only papers), so tracker.js embeds SUBJECT_OUTLINES
  (high-level content areas per subject) as a labeled STARTER scaffold — deliberately not fabricated detailed
  objectives. Paste-text path gives the real breakdown. This is a known, intentional limitation to flag to user.
- Subject pages link to /tracker/index.html?subject={slug}; tracker preselects the dropdown from ?subject=.

## Known issues / to revisit
- Not yet browser-tested (no Live Server run): nav dropdown/mobile overlay, theme repaint, tracker rating +
  localStorage round-trip, PDF.js parse path, print CSS. Logic written & unit-verified; needs a real-browser pass.
- Row reordering (drag) not implemented — add/edit/delete only. Fine for now; note if she wants reorder.
- Drive integration is best-effort GIS token flow; needs a real Google Cloud Client ID + browser to fully verify.
- Content (command words, examiner-quote patterns, resource links, calculator key sequences) written from
  general IGCSE knowledge — accurate at a high level; verify exact 2028-syllabus specifics against Cambridge PDFs.

## Next up
- Hand off for a browser test pass via Live Server (see Known issues). Then push to `parisa-singh.github.io` repo.
