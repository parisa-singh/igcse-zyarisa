# IGCSE Study Site

Static site for Cambridge IGCSE study — Grade 9–10, 2026–2028. Built with pure HTML,
CSS, and JavaScript. No frameworks, no build step.

## Hosting
GitHub Pages, account **parisa-singh**. Because every path is root-relative, host at the
domain root: **name the repo `parisa-singh.github.io`** (a user site). Then push to `main`
and enable Pages (Settings → Pages → Deploy from branch → `main` / root). The site will be
live at `https://parisa-singh.github.io/`.

> If you must use a different repo name, the site is served from `/<repo>/` and root-relative
> paths break — you'd need a `<base href="/<repo>/">` in every page and a relative
> `fetch('data/subjects.json')`. The user-site repo name avoids all of that.

## Local development
Paths are root-relative and `data/subjects.json` is loaded via `fetch()`, which does **not**
work over the `file://` protocol. Use a local server:
- VS Code **Live Server** extension (right-click `index.html` → "Open with Live Server"), or
- `python -m http.server` from the repo root, then visit `http://localhost:8000`.

## Structure
```
index.html, study-system.html, resources.html, past-papers.html
subjects/            9 subject pages + hub index
tracker/             the traffic-light tracker app
assets/css/          main.css (design system), tracker.css
assets/js/           theme.js, nav.js, tracker.js, parser.js, drive.js
data/subjects.json   paper types, weightings, exam info for all 9 subjects
```

## Themes
Four themes (Light / Dark / High Contrast / Vintage), switchable from the nav. Theme is
stored in `localStorage` (`igcse-theme`). All colors are CSS custom properties in `main.css`.

## Adding / updating subject data
Edit `data/subjects.json`. All subject pages and the tracker's "Select Subject" path pull
from this file.

## Updating the nav
Edit `assets/js/nav.js` only — the nav is injected on every page from this one file.

## Tracker — Google Drive setup
Optional. In-app step-by-step instructions live in `tracker/index.html` ("Connect Google Drive").

## Continuity
`CLAUDE.md` in the repo root tracks build status, decisions, and conventions across sessions.
