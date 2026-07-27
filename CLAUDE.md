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

## Hosting (LIVE)
- GitHub account **parisa-singh**, repo **`igcse-zyarisa`** (public). Pages builds from `main` / root.
- LIVE URL: **https://parisa-singh.github.io/igcse-zyarisa/**
- Served from a PROJECT SUBPATH, so ALL internal paths are prefixed with `/igcse-zyarisa/`
  (done via sed across every HTML file + nav.js + tracker.js; indexOf active-state checks in
  nav.js also carry the prefix and still use `=== 0`).
- If the repo is renamed again: re-run the same prefix swap on nav.js, tracker.js, and all HTML
  `href=`/`src=`. For a custom domain at root instead: strip the prefix and add a CNAME file.
- Local remote `origin` → https://github.com/parisa-singh/igcse-zyarisa.git

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

## Enhancements added (live)
- **assets/js/enhance.js** (NEW) — injected by nav.js on every page. Auto-builds an "On this page"
  section sidebar from `body > section/header` elements that contain an `<h2>` (hero h1 skipped),
  with scroll-spy; right rail ≥1200px (body+nav+footer reserve `--toc-w:240px`), floating popover +
  FAB below that. Also does scroll-reveal (`.reveal`/`.is-visible`) on cards/sections/lists, skipped
  under prefers-reduced-motion, and shows above-the-fold items immediately (no flash). Pages opt out
  with `<body data-no-toc>` (tracker does, to keep its own two-col layout).
- **Palette theme picker** — theme.js adds THEME_SWATCHES + setTheme(); nav.js renders a 🎨 button →
  dropdown of 4 circular conic-gradient swatches (direct select, not cycle). Desktop palette lives in
  `.site-nav__links`; a second `.nav-mobile-only` copy sits by the burger for ≤860px.
- **main.css §19** — palette menu, page-toc rail/popover/FAB, `.reveal`, nav-link underline motion,
  fluid `clamp()` type + section spacing, readable `max-width:74ch` on prose, small-screen tweaks.
- All responsive: phone/tablet/desktop verified in CSS breakpoints (860px nav, 1200px ToC rail, 520px stacking).

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

## Cross-device sync — Firebase (in progress)
- GOAL: sister (India) creates trackers; user (US) + eventually parents see them live on any device.
  Chosen: **Firebase Firestore (Native mode, Standard edition, region asia-south1/Mumbai)**, ONE shared
  space, **Google Sign-In**, **two tiers** (editors edit+sync, viewers read-only).
- Firebase project **igcse-zyarisa** (project #62637365031), owned by the US user's Google account.
  Firestore created in **production mode** (locked until rules published).
- PRIVACY DECISION (user chose): NO family emails in the repo or served JS (both are public). The
  allowlist lives ONLY in the LIVE Firestore console rules (private). The client keeps no email list —
  after Google sign-in it detects role by PERMISSION PROBE: probe write ok → editor; trackers read ok →
  viewer; neither → denied (auto signed out). Real emails were given in chat and belong only in the
  console rules — do NOT commit them.
- Files added:
  - `assets/js/firebase-config.js` — web config ONLY (public, not secret). No allowlist.
  - `assets/js/firebase-sync.js` — `window.Sync`. Loads Firebase v12 modular SDK via dynamic `import()`
    from gstatic (no build step). Google popup sign-in; ensureRole()/detectRole() probe-based role
    (single-flight); collections `trackers/{slug}` + append-only `activity/{auto}` + write-only
    `probe/{uid}`; live `onSnapshot` subscribe; best-effort writes. state() exposes
    ready/signedIn/checking/denied/roleError/email/role. DORMANT unless config apiKey is real.
  - `firestore.rules` — TEMPLATE ONLY (placeholders, no real emails). Real editors/viewers go in the
    CONSOLE copy → Firestore → Rules → Publish. Includes `probe/{uid}` match (editor+own-uid write).
- tracker wiring: `tracker/index.html` loads config+sync before tracker.js. Sync UI is now:
  (a) `#tk-sync-bar` — sticky status bar under the nav (green "Synced as … · Editor/Viewer" + Sign out,
  or amber "Not syncing" + Sign in); (b) `#tk-gate` — a **required, blocking full-screen sign-in gate**
  (user asked sign-in be mandatory so nobody edits unsynced and loses data). Gate shows Connecting →
  Sign-in-required → (on Firebase unreachable) error + "Use this device only" escape (10s timeout guard
  in init so a stalled connection never locks her out; `gateBypassed` flag). browserLocalPersistence
  keeps her signed in per-device, so the gate only appears first visit / after explicit sign-out.
  `tracker.js` — save() mirrors to cloud + logs activity (editors only); deleteTracker() deletes remote;
  renderSync()/renderSyncBar()/renderGate() draw the UI; friendlyAuthError() maps popup-closed etc. to
  calm messages; mergeRemoteDoc/removeRemoteDoc apply live snapshot changes into localStorage
  (newer-wins by savedAt) and live-refresh the open tracker if the edit came from someone else;
  seedLocalTrackersToCloud() pushes existing local trackers up on first sign-in. localStorage stays the
  offline cache. Styles: tracker.css `.tk-syncbar*` + `.tk-gate*` (appended at end).
- ALLOWLIST (real emails were provided in chat; put them ONLY in the console rules, NEVER in any repo
  file incl. this one): editors = owner + sister (2); viewers = mom + dad (2). Owner's own email is
  parisasingh@gmail.com (already in git history pre-refactor). Do not write the other three anywhere
  tracked by git.
- **BLOCKING / PENDING before it works live (user said she'll do console steps later):**
  1. Firebase console → Firestore → **Rules** → paste the LIVE rules (template in firestore.rules, with
     the 4 real emails filled into editors()/viewers()) → **Publish**. (Earlier a rules copy with just
     parisasingh@gmail.com as editor may have been published — re-publish with all four.)
  2. **Authentication → Sign-in method → Google → Enable** (done — public name "IGCSE Playbook" + support email).
  3. **Authentication → Settings → Authorized domains → ADD `parisa-singh.github.io`** (GitHub Pages
     domain is NOT there by default — signInWithPopup fails with auth/unauthorized-domain without it).
- HISTORY NOTE: earlier commits (aaf2424 etc.) DID commit parisasingh@gmail.com in config/rules before
  the privacy refactor; it's the owner's own email, left as-is. Sister/parent emails were NEVER committed.
- NOT yet browser-tested (needs the console steps + real Google accounts). Home-page activity/dashboard
  view is a possible follow-up (tracker library already doubles as the reports view once synced).

## Design direction — DECIDED: playful / gamified
- User rejected the plain dashboard; chose **playful / gamified** (bright, rounded, warm, motivating —
  Duolingo-ish but professional). HOME (index.html, data-no-toc) rebuilt in this style:
  - Live **exam countdown** to 2028-05-04 (inline script).
  - **Progress ring** (.ring, conic-gradient donut) — now shows OVERALL green % across ALL started
    subjects (sum of topic-level greens ÷ total), animates fill, encouraging message scales with pct.
  - **Progress board (2026-07-26)**: new "Every subject at a glance" section under the hero. Hardcoded
    9-SUBJECTS list (slug/name/code, matching tracker slugs); reads each `igcse-tracker-{slug}` from
    localStorage, renders a per-subject stacked RAG bar (green/amber/red/unrated) + counts, links to
    tracker?subject={slug}. Not-started subjects show a grey "Not started" row; custom-slug trackers
    appended after the 9. Styles: main.css **§22** (.subj-board/.subj-row/.subj-bar/.subj-dot). NOTE:
    reads localStorage only — a signed-in user sees synced data once the tracker has cached it locally.
  - Big rounded colorful **action cards** (.play-card--tracker/study/papers/resources), .play-grid.
  - Kept .path timeline + .subject-strip; note trimmed.
  - Components: main.css **§21** (playful) + §20 (hub tiles/path/strip, still used).
- **PENDING user OK**: roll the playful style across study-system / subjects / past-papers / resources
  (bigger colorful cards, more visual, less prose). Home is the reference.
- Syllabus links: top callout on subjects/index.html AND a "📄 Official syllabus (Cambridge)" btn in
  EVERY subject page hero (after the h1). URLs = cambridge-igcse-<slug>-<code> pattern; verified 200 for
  physics/int-math(international-mathematics)/cs/business/economics/french; english uses
  **english-first-language-0500**; literature (literature-in-english-0475) & psychology (psychology-0980)
  only got curl 500s (bot-block, not confirmed) — VERIFY these two in a browser.
- Hamburger moved to LEFT on mobile (order: -2); ToC/FAB already left.
- resources.md is the canonical resource source (keep in sync). Access badges green/amber/red.

## Explicit-save + viewer read-only (2026-07-26)
- SAVE MODEL CHANGED: edits no longer auto-save. Old `save()` split into `persist()` (writes
  localStorage + cloud push + activity; sets dirty=false, lastSavedAt) and `markDirty()` (in-memory
  only, sets `dirty=true`). All mutations (setRating/setNotes/editText/deleteRow/addTopic/addObjective/
  add-unit) call markDirty(); NOTHING persists until the user clicks the new **#tk-btn-save** ("💾 Save
  changes" when dirty / "✓ All changes saved" when clean). adopt() still persist()s immediately (new
  tracker saved on creation). openStored() sets dirty=false + confirms before discarding unsaved edits.
  Prominence: besides sidebar #tk-btn-save, a FLOATING #tk-savebar (fixed bottom-centre pill, tracker.css
  `.tk-savebar`, pulsing amber dot) shows whenever dirty (editors only); both call doSave().
  Home board also gained an EXPANDABLE overall breakdown (native <details> #subj-overall) showing
  green/amber/red/unrated % across ALL subjects; per-subject rows now show % not raw counts. main.css §22b.
  `beforeunload` warns if dirty. mergeRemoteDoc SKIPS the open tracker while dirty (won't clobber
  unsaved edits). renderSaveState() drives button + #tk-save-info text.
- VIEWER READ-ONLY: isViewer()/canEditData() (signed-in Firebase role==='viewer'). Every mutation +
  input handler (handlePdf/handlePaste/handleSelectSubject/importJSON/deleteTracker) guards on it.
  `document.body.classList.toggle('tk-viewer', …)` in renderSync; tracker.css `.tk-viewer` hides input
  paths, add/del buttons, save button, import; makes .tk-light + .tk-inline-edit pointer-events:none.
- ROLE EXPLAINER: one-time gate "welcome" screen after INTERACTIVE sign-in (justSignedIn flag set in
  doSignIn) — "You're an Editor/Viewer" + 1-2 sentence explanation + Continue. Session-restore skips it
  (just the sync bar shows role: "Editor — you can edit; saves sync" / "Viewer — read-only").

## Tracker architecture notes (for future edits)
- Persistence: ONE object per subject at localStorage `igcse-tracker-{slug}` = {meta, structure, ratings, savedAt}.
  ratings has independent `topic` and `objective` maps (rowId → {status, notes, updated}). Last subject at `igcse-tracker-last`.
- parser.js exposes window.Parser: parseSyllabus(text)→{units,pattern,parseConfidence,stats,flagged,warning};
  extractPdfText(file)→Promise<text> (needs global pdfjsLib); classifyDemand(text); DEMAND_VERBS.
  Pattern A = numeric (\d+ / \d+.\d+ / \d+.\d+.\d+); Pattern B = skill/lettered (Reading / R1 / • bullet).
  ROBUSTNESS (2026-07-26): lines are now FULL-trimmed (leading spaces too) so indented pastes match;
  detectPattern counts ONLY structure markers (numeric vs R1-style) — bullets no longer tip routing, so
  modern "1.1 topic + Core/Supplement bullet objectives" syllabuses correctly use the numeric parser
  (parseNumeric now reads bullets as objectives + tracks Core/Supplement→tier). New parseLoose()
  last-resort turns headings+lines into topics/objectives so parse rarely returns empty (conf='review',
  warning set). Verified via scratchpad ptest.js against 5 formats. Input UI reworked: three paths are
  now clearly ALTERNATIVES ("pick just one"), PDF promoted as primary (.tk-path--primary), badges say
  ★/or not 1/2/3.
  FLATTENED-PDF FIX (2026-07-26): real Cambridge PDFs copy out as ONE giant paragraph (numbers 1/1.1/
  1.1.1 and • bullets all inline, no newlines) — the #1 cause of "Couldn't detect a topic structure".
  New preprocessInline() rebuilds lines: strips the repeating "Cambridge … syllabus for YYYY / www… /
  Back to contents page / continued" furniture, then inserts a newline before each •, \d+.\d+.\d+,
  \d+.\d+ (topic), and " N " unit heading. CONTENT_ENDS gained 'details of the assessment' + 'what else
  you need to know' to drop the tail. ensureUnit/ensureTopic now DEDUPE by id so page-break "continued"
  repeats merge instead of duplicating. Verified against the real Business Studies 0450 paste (6 units,
  ~20 topics, high confidence).
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
- CALCULATOR = Casio **fx-CG100** (2026-07-26, per user — she owns it). subjects/international-math.html
  calculator deep-dive fully rewritten CG50→CG100: IB Exam Mode via HOME→Exam Mode app, flashing icon +
  coloured border, auto data backup/restore (NO green LED / F-key combo); tab-based key paths
  (HOME→app→tab), not F-keys. CG100 manual: HTML support.casio.com/global/en/calc/manual/fx-CG100_1AUGRAPH_en/
  + PDF (exam-mode section p.253). subjects.json specialNote names the CG100. Any future "CG50"/F-key/
  "green LED" content is stale — use CG100. (CG50 still mentioned only as "successor to the CG50" context.)
- RESOURCE LINK AUDIT (2026-07-26): several links were verified-dead 404s and fixed repo-wide (resources.html
  + resources.md + the 5 subject pages that reused them): Grade-threshold URL, PMT `/igcse-revision/`→homepage,
  Cambridge GO removed, and guessed YouTube handles (@igcsephysicsmath/@snaprevise/@MrLeeIGCSEBusiness/
  @dineshbakshi) → honest youtube.com/results?search_query= links. Flyp Academy links left as-is (not flagged).
  If adding YouTube resources, prefer verified channels or search links — don't guess @handles (they 404).

## Next up
- **BLOCKING for cloud sync to go live:** user must finish the Firebase console steps — publish the
  security rules with the real allowlist (editors: parisasingh@gmail.com, singhzyanya@gmail.com,
  systemcoreos77@gmail.com; viewers: shilpasingh24@gmail.com, sharvan.kumar@gmail.com,
  personal123777@gmail.com — CONSOLE ONLY, never commit these), enable Google sign-in, and add
  `parisa-singh.github.io` to Authorised domains. See the "Cross-device sync" section above.
- OPEN QUESTION from user: site "slow" clicking links — largely traced to dead/huge-PDF links (now
  fixed); pending user clarification whether internal page-to-page nav is also slow.
- Not yet browser-QA'd end-to-end with real Google accounts: sign-in gate, role read (editor vs viewer),
  live merge across two devices, explicit-save round-trip, home progress board reading synced data.
- Still optional / not done: roll the playful/gamified style across study-system/subjects/past-papers/
  resources (home is the reference); a home-page live sync read (currently localStorage-only).

## Live deploy status
- Repo **parisa-singh/igcse-zyarisa** (public), Pages from main/root.
  Live: https://parisa-singh.github.io/igcse-zyarisa/  · local `origin` set to the same repo.
- gh active account is **parisa-singh** (switched from parisa-eyezense). Commit identity:
  parisa-singh / personal123777@gmail.com. All work committed & pushed (latest: CG100 switch + resource
  link audit + explicit-save/viewer-roles + home progress board + Firebase sync scaffolding).
- NOTE: the repo lives in a OneDrive folder — OneDrive intermittently locks .git during `git push`,
  stalling it. Fix: run the push in the background (it completes once OneDrive releases the lock), or
  pause OneDrive sync momentarily. `git ls-remote` / fetch are unaffected; only push hangs.
