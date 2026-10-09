---
version: alpha
name: Multiversal Love
description: An illuminated open book in a quiet cinematic reading room.
colors:
  background: "#101322"
  surface: "#202632"
  text: "#eee9e4"
  muted: "#a6aab6"
  primary: "#e5b7b8"
  primary-hover: "#f1ccca"
  border: "#7a8599"
  danger: "#ffafa4"
  paper: "#f8f3e9"
  ink: "#20202b"
  book-accent: "#7e3248"
  paper-muted: "#5e5960"
typography:
  sans:
    fontFamily: "Arial, Helvetica, sans-serif"
  display:
    fontFamily: "Impact, 'Arial Narrow', Arial, sans-serif"
rounded:
  control: "4px"
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

An illuminated open book in a quiet room. The approved comic is the centerpiece; translucent controls stay outside the paper and hide only when idle and unfocused. This is a reading application for an English-language sci-fi romance, with an author introduction below it. Its signature is two real facing pages with restrained colored light around them. The library shows only real books from comics.json. Avoid marketing cards, dashboards, neon and continuously animated backgrounds.

Token ownership: this file generates `src/tokens.css` through `scripts/design-tokens.mjs`; `npm run build` regenerates the CSS. All components use those variables. The source PDF's lettering and colors are unchanged.

## Colors

Charcoal blue surrounds cream paper. Rose identifies actions on dark chrome; paper controls use dark ink focus rings. Border contrast is at least 3:1 against dark surfaces. Ambient colour comes from visible artwork sampled at 32 × 48 pixels. Ink and flat paper are excluded, saturation is boosted, and two background layers crossfade over 1.2 seconds. Failed or CORS-blocked sampling uses a neutral blue-violet palette. Light fills the viewport behind the pages and can be disabled independently of music.

## Typography

Impact and condensed system fallbacks carry comic titles; Arial carries UI and the author introduction. Arial supports controls and secondary copy. Native comic lettering remains untouched. The selectable transcript provides panel descriptions and attributed dialogue. English is the interface language; no nationality is inferred from the author's name.

## Layout

Pair comic 01 with context 02, continuing through 77–78. The cover occupies the right slot alone in LTR, then content pairs. Any unmatched final page is alone. RTL mirrors these positions. No HTML endpapers are inserted. Desktop defaults to two pages; phones to one for legibility, with a two-page switch available. The reader occupies one dynamic viewport; its fitted artwork is never cropped. The library, discussion and author sections own normal document scrolling. Transcripts and dialogs scroll internally. Layout responds to resize and orientation changes.

## Elevation & Depth

Only the paper casts a soft shadow. A shaded spine joins facing pages. CSS 3D front/back leaves turn with transform and shading opacity only; reduced motion changes spreads immediately. Ambient washes crossfade without pulsing or flashing. Dialog backdrops isolate the task without changing the page width.

## Shapes

Square paper edges, 4px controls, visible focus rings and at least 44px control height. Avoid rounded decorative cards.

## Components

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Form | `src/comments.js`, semantic HTML | README comment contract | GitHub draft handoff | state and integration tests |
| Scrollbar | `src/styles.css` | DESIGN.md | document / internal scroll | CSS inspection |
| Toast | `src/ui.js` | reader status contract | recoverable messages | live-region inspection |

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

Canonical navigation and per-comic progress live in src/state.js; comic metadata in comics.json; responsive image loading in src/images.js; shared overlays and status in src/ui.js. Search is local, IME-safe, clearable and restored in the library URL. Native range sliders and dialog focus behaviour are intentionally platform-owned. Fullscreen icons follow fullscreenchange, not requested state. Visible controls never auto-hide with focus.

The current-task brief authorizes this durable evolution: serif document reader → condensed comic library and viewport reader. Runtime values still flow DESIGN.md → scripts/design-tokens.mjs → src/tokens.css → shared styles. No new font network or package is required.
