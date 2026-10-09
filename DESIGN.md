---
version: alpha
name: Multiversal Love
description: An illuminated open book in a quiet cinematic reading room.
colors:
  background: "#151923"
  surface: "#202632"
  text: "#eee9e4"
  muted: "#a6aab6"
  primary: "#e5b7b8"
  primary-hover: "#f1ccca"
  border: "#363d4b"
  danger: "#ffafa4"
  paper: "#f8f3e9"
  ink: "#20202b"
  book-accent: "#a94762"
  paper-muted: "#5e5960"
typography:
  sans:
    fontFamily: "Arial, Helvetica, sans-serif"
  display:
    fontFamily: "Georgia, Times New Roman, serif"
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

An illuminated open book in a quiet room. The approved comic is the centerpiece; controls stay outside the paper. This is a reading application for an English-language sci-fi romance, with an author introduction below it. Its signature is two real facing pages with restrained colored light around them. Avoid marketing cards, dashboards, neon and animated backgrounds.

Token ownership: this file generates `src/tokens.css` through `scripts/design-tokens.mjs`; `npm run build` regenerates the CSS. All components use those variables. The source PDF's lettering and colors are unchanged.

## Colors

Charcoal blue surrounds cream paper. Rose identifies actions. Ambient amber supports memory; blue supports uncertainty; deeper blue and rose support the crisis. Silence dims the atmosphere. Light stays behind the pages and can be disabled independently of music.

## Typography

Georgia carries titles and the author's name. Arial supports controls and secondary copy. Native comic lettering remains untouched. The selectable transcript provides panel descriptions and attributed dialogue. English is the interface language; no nationality is inferred from the author's name.

## Layout

Pair comic 01 with context 02, continuing through 77–78. Cover and final 79 have typeset endpapers, which do not count as additional book pages. Desktop defaults to two pages; phones to one for legibility, with a two-page switch available. The document owns vertical scrolling. Transcripts and dialogs may scroll internally.

## Elevation & Depth

Only the paper casts a soft shadow. A narrow gutter separates facing pages. Ambient washes crossfade without pulsing or flashing. Dialog backdrops isolate the task without changing the page width.

## Shapes

Square paper edges, 4px controls, visible focus rings and at least 44px control height. Avoid rounded decorative cards.

## Components

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Form | `src/comments.js`, semantic HTML | README comment contract | GitHub draft handoff | state and integration tests |
| Scrollbar | `src/styles.css` | DESIGN.md | document / internal scroll | CSS inspection |

Buttons use `.button` or `.text-button`. Native dialogs own focus, Escape, inert background and restoration. Contents are finite real buttons with current and opened state. The progress element reports unique pages actually opened. Loading and failed images reserve paper geometry; failed loads offer retry and do not count. Text mode is an accessible alternative.

Sound is off by default and requires a user gesture. It starts at 15%, capped at 35%. Original procedural piano and pads follow explicit scene cues. Silence, hidden tabs and leaving the reading area stop the score. Volume is a native range input. No audio networks, advertisements or external players.

Reduced motion disables transitions and sound-status animation. No automatic page turns. Comments use plain text, never HTML. Input stays in memory after validation or GitHub handoff and is never represented as posted until GitHub confirms it.

## Do's and Don'ts

- Keep the approved artwork dominant and its context beside it.
- Merge opened pages across tabs and preserve progress on refresh.
- Never count thumbnails, prefetches, failed images or a jump to the ending as completion.
- Never invent social profiles or biographical details.
- Never describe the client-side completion gate as server authorization.
