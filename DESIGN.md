---
version: alpha
name: Multiversal Love
description: Printed-comic chrome around a calm, illuminated reading room.
colors:
  background: "#0b0b14"
  surface: "#15162a"
  text: "#f7f2e8"
  muted: "#b4b2c4"
  primary: "#ffd400"
  primary-hover: "#ffe55c"
  border: "#000000"
  danger: "#ff4d5a"
  paper: "#f8f3e9"
  ink: "#0b0b14"
  book-accent: "#e63946"
  paper-muted: "#5e5960"
  focus: "#00c2e0"
  magenta: "#ff2e88"
typography:
  sans:
    fontFamily: "'Comic Neue', 'Segoe UI', Arial, sans-serif"
  display:
    fontFamily: "'Bangers', Impact, 'Arial Narrow', Arial, sans-serif"
  heading:
    fontFamily: "'Anton', Impact, 'Arial Narrow', Arial, sans-serif"
rounded:
  control: "0px"
spacing:
  section: "60px"
  page-max: "1300px"
components:
  button:
    height: "44px"
    backgroundColor: "{colors.primary}"
    textColor: "{colors.background}"
  paper:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
---

# Multiversal Love reading room

## Overview

Printed-comic chrome around a calm reading room; the artwork stays untouched. The supplied October 10 theme establishes yellow action labels, ink outlines, offset shadows and a halftone library. The approved comic remains the centerpiece; translucent reader controls stay outside the paper and hide only when idle and unfocused. This is an English-language sci-fi romance reader with an author introduction below it. The library shows only real books from comics.json. No continuously animated background or automatic page turns.

Token ownership: this file generates `src/tokens.css` through `scripts/design-tokens.mjs`; `npm run build` regenerates the CSS. `src/styles.css` owns reader geometry and shared behaviour; `src/comic-theme.css` adapts the supplied theme to those components and consumes generated variables. The source PDF's lettering and colors are unchanged.

## Colors

Near-black ink surrounds cream paper. Yellow identifies actions and progress; cyan identifies focus. Red and magenta are restrained library accents. Black borders frame yellow or white surfaces; muted borders distinguish functional boundaries on dark surfaces. Ambient colour comes from visible artwork sampled at 32 × 48 pixels. Ink and flat paper are excluded, saturation is boosted, and only the active background layer glows, crossfading over 1.2 seconds. Failed or CORS-blocked sampling uses a neutral blue-violet palette. Light fills the viewport behind the pages and can be disabled independently of music.

## Typography

Bangers carries book titles, the wordmark and action labels; Anton carries section headings; Comic Neue carries UI and body copy. Four Latin WOFF2 files are self-hosted with their original SIL OFL notices in `assets/fonts/`. The cover title wraps between words instead of splitting character names or title words. Native comic lettering remains untouched. The selectable transcript provides panel descriptions and attributed dialogue. English is the interface language; no nationality is inferred from the author's name.

## Layout

Pair comic 01 with context 02, continuing through 77–78. The cover occupies the right slot alone in LTR, then content pairs. Any unmatched final page is alone. RTL mirrors these positions. No HTML endpapers are inserted. Desktop defaults to two pages; phones to one for legibility, with a two-page switch available. The reader occupies one dynamic viewport; its fitted artwork is never cropped. The library, discussion and author sections own normal document scrolling. Transcripts and dialogs scroll internally. Layout responds to resize and orientation changes.

## Elevation & Depth

Library actions and dialogs use the supplied offset ink shadows; paper keeps its soft shadow and shaded spine. CSS 3D front/back leaves turn with transform and shading opacity only. A horizontal drag moves the book as one unit without overriding a leaf's rotation. Reduced motion changes spreads immediately and disables drag-follow, title tilt and the intro. Ambient washes crossfade without pulsing. A single short, non-interactive POW intro appears once per tab session when opening the library; direct reading links never show it. Dialog backdrops isolate the task without changing page width.

## Shapes

Square paper edges and controls, visible cyan focus rings and at least 44px primary control height. Speech-bubble framing is reserved for discussion and transient messages.

## Components

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Form | `src/comments.js`, semantic HTML | README comment contract | GitHub draft handoff | state and integration tests |
| Scrollbar | `src/styles.css`, themed by `src/comic-theme.css` | DESIGN.md | document / internal scroll | CSS inspection |
| Toast | `src/ui.js` | reader status contract | recoverable messages | live-region inspection |
| Swipe | `src/swipe.js`, connected by `src/app.js` | Reader navigation contract | LTR / RTL; drag / flick | gesture tests |
| Fullscreen | `src/fullscreen.js` | Reader navigation contract | native / expanded layout | state and error tests |

Buttons use `.button` or `.text-button`. Native dialogs own focus, Escape, inert background and restoration. Contents are finite real buttons with current and opened state. The progress element reports unique pages actually opened. Loading and failed images reserve paper geometry; failed loads offer retry and do not count. Text mode is an accessible alternative.

Sound is off by default and requires a user gesture. It starts at 15%, capped at 35%. Original procedural piano and pads follow explicit scene cues. Silence, hidden tabs and leaving the reading area stop the score. Volume is a native range input. No audio networks, advertisements or external players.

Reduced motion disables transitions and sound-status animation. No automatic page turns. Comments use plain text, never HTML. Input stays in memory after validation or GitHub handoff and is never represented as posted until GitHub confirms it.

## Do's and Don'ts

- Keep the approved artwork dominant and its context beside it.
- Merge opened pages across tabs and preserve progress on refresh.
- Never count thumbnails, prefetches, failed images or a jump to the ending as completion.
- Never invent social profiles or biographical details.
- Never describe the client-side completion gate as server authorization.

## Reader implementation contract

Canonical navigation and per-comic progress live in src/state.js; comic metadata in comics.json; responsive image loading in src/images.js; shared overlays and status in src/ui.js. Search is local, IME-safe, clearable and restored in the library URL. Native range sliders and dialog focus behaviour are intentionally platform-owned. Fullscreen icons follow actual fullscreen state, with an explicitly announced expanded-layout fallback only when the API is absent. Denied requests retain graceful messages and correct state. Escape and Library exit the fallback. Visible controls never auto-hide with focus.

The supplied `files.zip` authorizes the evolution from rose/system-font chrome to the printed-comic theme. Its generic swipe/fullscreen scripts are fitted to the existing reader, preserving a single navigation handler and the existing zoom and progress rules. Runtime values still flow DESIGN.md → scripts/design-tokens.mjs → src/tokens.css → shared styles/theme. No npm dependency or build tool is added; fonts are served locally and precached for offline reading.
