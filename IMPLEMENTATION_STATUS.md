# Immersive reader release status

## Completed

- Restored twelve empty image variants; retained all 80 actual pages and transcripts.
- Added a validated, data-driven catalog with per-comic progress and legacy migration.
- Implemented library search/resume, proportional viewport spreads, responsive single-page and RTL layouts.
- Implemented edge taps, swipe, arrows, Home/End, scrubber, thumbnails, fullscreen and focus-safe idle controls.
- Added cached artwork palettes, full-background crossfades, shaded CSS 3D turns and reduced-motion behaviour.
- Added zoom/pan/pinch and explicit offline download via service worker.
- Preserved optional scene-aware music, silence cues, completion-gated GitHub reviews and AJ's introduction.
- Documented adding comics, local use, static deployment and cross-browser verification.
- Fixed upgrade caching, narrow library-title overflow, mobile volume labelling, and download status during shelf updates.

## Checks completed before publication

- `npm run check`: all source syntax checks, 18 unit tests, catalog/asset validation and static build passed.
- All 240 WebP assets decoded with Pillow; no failures.
- Premium UI static audit: zero errors, warnings or unresolved findings.
- No new npm packages or build tooling introduced.

## Browser verification

Verified on the published GitHub Pages site in the cloud Chrome browser on 2026-10-09:

| Flow | Observed result |
|---|---|
| Library | Cover, search, empty state, clear, saved place and resume worked. |
| Spreads | Right-side cover, facing pages, unmatched final page, edges, arrows, Home/End, keyboard scrubber and thumbnail selection worked. |
| Page turns | Live DOM inspection confirmed the rotating 3D leaf, 2200px perspective and changing shading opacity. Frame rate was not measured. |
| Lighting | Canvas-derived artwork colours reached the full background; off/on correctly hid/restored the layers. |
| Controls | Idle controls hid; keyboard focus restored them; dialog close restored focus. |
| Enlargement | Full 1600px artwork loaded; zoom reached 150%; keyboard pan moved the image by 60px within its bounds. |
| Text | All 80 page transcripts loaded through navigation, retaining prose and speaker attribution. |
| Progress/reviews | Ending jumps and rapid navigation left unseen pages unread. Next unread returned to them. After every page was visibly opened, the form unlocked; empty-draft validation and the reader feed worked. No public test review was posted. |
| Sound | User-triggered soft cue and a silent scene updated their controls/state correctly; no sound started after reload. |
| Offline | Explicit download completed all 163 assets, including transcripts. A repeated download after the UI update reused the stored copy. Actual disconnected browsing was not simulated. |
| Fullscreen | F exercised the API; this cloud browser refused fullscreen. The reader displayed a graceful message and retained the correct inactive icon/state. Successful native enter/exit remains a platform check. |
| Responsive | Embedded 360, 768, 1440 and 2560px CSS viewports kept proportional, uncropped artwork. Automatic single-page/spread switching worked. The final 360px library had matching client/scroll widths after its title fix. |

The responsive helper uses actual iframe CSS viewports, not device emulation. Safari, Firefox and physical iOS/Android passes remain unmeasured. Touch swipe/pinch, reduced-motion OS preferences, successful native fullscreen and disconnected browsing should follow the platform checklist.

Lighthouse and measured 60fps results are not yet recorded; no score or universal frame-rate claim is made.

## Continuing work

Use the current `main` code and this checklist; do not repeat the original audit. Changes should remain small, pass `npm run check`, and preserve the approved artwork and reading-progress semantics.
