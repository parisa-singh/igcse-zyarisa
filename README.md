# IGCSE Study Site

Static site for Cambridge IGCSE study — Grade 9–10, exams May/June 2028. Built with pure
HTML, CSS, and JavaScript. No frameworks, no build step.

## Hosting
GitHub Pages, account **parisa-singh**, repo **`igcse-zyarisa`**.
Live at: **https://parisa-singh.github.io/igcse-zyarisa/**

All internal paths are prefixed with `/igcse-zyarisa/` so the site works at this project
subpath. If the repo is ever renamed, update that prefix everywhere:
`assets/js/nav.js`, `assets/js/tracker.js`, and all `href=`/`src=` in the HTML files.
(To move to a custom domain served at root, strip the `/igcse-zyarisa` prefix and add a
`CNAME` file.)

## Local development
Paths are root-relative and `data/subjects.json` is loaded via `fetch()`, which does **not**
work over the `file://` protocol. Use a local server:
- VS Code **Live Server** extension (right-click `index.html` → "Open with Live Server"), or
- `python -m http.server` from the repo root, then visit `http://localhost:8000`.

## Structure
```
index.html            home — exam countdown + all-subjects progress board (red/amber/green)
study-system.html, resources.html, past-papers.html
subjects/             9 subject pages + hub index
tracker/              the traffic-light tracker app
assets/css/           main.css (design system), tracker.css (tracker app only)
assets/js/            theme.js, nav.js, enhance.js, tracker.js, parser.js,
                      drive.js, firebase-config.js, firebase-sync.js
data/subjects.json    paper types, weightings, exam info for all 9 subjects
firestore.rules       security-rules TEMPLATE for the optional cloud sync (see below)
resources.md          canonical source for the resources page (keep in sync with resources.html)
```

## Themes
Four themes (Light / Dark / High Contrast / Vintage), switchable from the nav (🎨 palette
button). Theme is stored in `localStorage` (`igcse-theme`). All colours are CSS custom
properties in `main.css` — never hardcode a colour in a page.

## The tracker
`tracker/index.html` builds a traffic-light checklist from a syllabus. Load it three ways
(pick one): upload the syllabus **PDF**, **paste** the "subject content" text, or start from a
built-in **subject outline**. Parsing lives in `parser.js` (handles flattened one-paragraph
PDF copies). Rate each topic **red / amber / green**.

**Saving is explicit.** Edits mark the tracker "unsaved"; nothing is written until you click
**Save changes** (a floating bar + a sidebar button). One object per subject is stored at
`localStorage` key `igcse-tracker-{slug}`.

## Cross-device sync (optional — Firebase)
Lets the same trackers sync across devices/people. Off by default; activates only when
`assets/js/firebase-config.js` holds a real Firebase config.

- **Data:** a shared Firestore database (one project, one shared space). `firebase-sync.js`
  (`window.Sync`) loads the Firebase SDK from CDN, signs in with Google, and mirrors trackers +
  an activity feed live via `onSnapshot`. `localStorage` stays the offline cache.
- **Roles:** **editors** can view + edit; **viewers** are read-only. Role is detected after
  sign-in by a permission probe — there is **no email list in the public code**.
- **Access control:** the allowlist lives **only** in the Firestore security rules in the
  Firebase console (private). `firestore.rules` is a template — put the real emails in the
  console copy and Publish. To add someone: edit the `editors()`/`viewers()` list there.
- **Setup:** create a free Firebase project → Firestore (Native mode) → enable Google sign-in
  → add `parisa-singh.github.io` to Authentication → Settings → Authorized domains → paste the
  config into `firebase-config.js` → publish the rules.

`drive.js` is an older, optional per-user Google Drive backup (superseded by Firebase sync;
still present but not the primary path).

## Adding / updating subject data
Edit `data/subjects.json`. All subject pages and the tracker's "Select Subject" path pull
from this file.

## Updating the nav
Edit `assets/js/nav.js` only — the nav is injected on every page from this one file. It also
loads `enhance.js`, which adds the "On this page" table-of-contents rail and scroll reveals.

## Calculator (International Maths)
Content is written for the **Casio fx-CG100** (tab-based menus, IB Exam Mode). See the
calculator deep-dive in `subjects/international-math.html`.

## Continuity
`CLAUDE.md` in the repo root tracks build status, decisions, and conventions across sessions —
read it first when picking the project back up.
