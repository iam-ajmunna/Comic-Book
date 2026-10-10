# Immersive reader release status

## October 10 inline anonymous feedback

- Replaced the GitHub draft handoff and feedback modal with an inline composer beneath the book. Names are required (1–80 characters); pictures are optional; feedback is required (3–600 characters). No reader account, sign-in, email or GitHub connection is needed.
- Deployed a separate dependency-free public Worker with private durable R2 storage through Sites. The existing GitHub Pages URL, vanilla reader stack, approved artwork, creator portrait, spoiler-free synopsis and offline-book caches remain intact. Service source and maintenance/API guidance are retained in `feedback-service/`.
- Added 160px profile-picture preparation, preview and removal, metadata stripping, client/server type and size limits, bounded feed pagination, conditional-write deduplication and a private one-minute cooldown. Failure/uncertain requests keep the draft; success requires server confirmation. Public editing, deletion and raw storage access are not exposed.
- Runtime release `20261010-7` precaches the new feedback modules while preserving the existing cache schema. README, design ownership and the platform checklist describe the new flow.
- Syntax checks, all 35 tests, the 240-image validation and production build pass. The strict UI audit reports zero findings. Tokens regenerated without drift; no npm dependency or new client build tooling was introduced. The optional official DESIGN lint CLI remains unavailable; no package was installed to run it.
- Live cloud Chrome verified that a jump to End stays locked, all 80 genuinely opened pages unlock the inline form, and Leave feedback focuses its name field. Empty-name/empty-feedback errors focus the correct field. A supplied PNG prepared into a 160 × 160 JPEG of about 7.5 KB and could be removed. The shared production feed loaded its honest empty state without account credentials.
- At nominal 360, 768, 1440 and 2560px iframe widths, document client/scroll widths matched, the identity fields stacked on phones, and the submit action remained within the form. These are CSS viewport checks, not physical-device passes. Artwork mode and the opening spread were restored, and all test input was cleared.
- A direct visit to the service's JSON homepage was blocked by this cloud browser, but the actual reader-to-service request succeeded. Production posting was not used to create fabricated public reviews; isolated tests verify shared create/read-back with and without pictures, retries, validation, pagination and rejected writes. Safari/Firefox, physical iOS/Android, real disconnected browsing and Lighthouse scores remain platform checks in TEST_CHECKLIST.md.

## October 10 final creator-card update

- Applied `final file.zip`: a quieter halftone library, no POW intro, and the supplied creator biography, role chips, speech bubble and GitHub link after the discussion.
- Refined the supplied 320px illustrated avatar into a 1254px square profile with preserved facial identity/style and a dark backdrop. The WebP is 95,074 bytes; the supplied original and final prompt are retained separately. Comic artwork and the spoiler-free catalog description remain untouched.
- Adapted card styles to the shared tokens, with explicit image geometry, lazy loading, mobile stacking, visible link focus, reduced-motion and forced-colour treatment.
- Versioned runtime URLs to `20261010-4`, retained downloaded-book caches, and covered shell-cached branding images with an offline worker test.
- Source syntax, all 26 tests, 240-image catalog validation, static build and strict UI audit passed. Generated tokens match DESIGN.md. No dependency or build tooling was added.
- Verified on the published site in cloud Chrome: the new release, quiet library background, absent intro, preserved synopsis, sharp 1254px portrait, supplied biography/roles and visible GitHub-link focus. Card layouts at 360, 768, 1440 and 2560px CSS viewports had equal client/scroll widths; the phone card stacked correctly and every link stayed within the card.
- Reader navigation, the locked completion gate, full-resolution 1600px page enlargement and settled ambient off/on states still worked. The worker test confirms offline availability of card styles and the portrait; actual disconnected browsing, Safari/Firefox, physical devices and performance measurements remain unverified.

## October 10 supplied-theme update

- Integrated the supplied yellow/ink printed-comic theme with halftone library backgrounds, square actions, offset shadows, themed dialogs and a once-per-session POW intro.
- Added all four requested local WOFF2 fonts and their original licenses. Font/theme assets are included in the offline shell. No dependency or build tooling was added.
- Fitted the supplied swipe logic to artwork buttons and existing LTR/RTL navigation; one drag turns once, suppresses accidental zoom, and respects vertical scrolling, cancellation, pinch and reduced motion.
- Reused the existing fullscreen control/F shortcut through one native/WebKit controller. An absent API gets an announced expanded layout that Escape, the button and Library can leave; rejected requests retain honest state/messages.
- Preserved all 80 pages, existing reader features, progress/review rules and the revised spoiler-free synopsis.
- Updated runtime release URLs to `20261010-3` while retaining the offline cache schema and downloaded books.
- Source syntax, 25 unit tests, catalog/240-image validation, static build and strict UI audit passed. DESIGN frontmatter and generated-token mapping agree; the optional official DESIGN lint CLI is not installed/cached, so no package was added to run it.
- Live cloud Chrome verification on October 10 confirmed the new fonts/title, search/empty/clear, spread navigation, artwork tap-to-enlarge, thumbnail drawer, ambient off/on, saved progress and the locked review form after an ending jump. Fullscreen denial showed the correct message and inactive icon.
- A real mouse drag exposed native browser image dragging cancelling the gesture. The fix was verified on the live site: one drag advanced 01–02 to 03–04, with no zoom dialog and no second turn. Touch/device verification remains pending.
- Library and reader checks at 360, 768, 1440 and 2560px CSS viewports showed equal client/scroll widths, titles wrapping within their column, and proportionate uncropped pages. The phone reader selected single-page mode; wider readers selected spreads. These are iframe viewport checks, not mobile-device passes.
- Tightened thumbnail geometry so the intrinsic image height does not create empty vertical bands in the drawer. Prior platform, offline-disconnection and performance-measurement limitations remain applicable.

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

## Redesign Preview v2 — October 10, 2026

The supplied HTML defines the layout, not just its palette. The reading room now has a persistent AJ badge header, yellow-accented heading, 230px cover shelf, embedded book, floating navigation/scrubber, native Options dialog, completion bar, GitHub feedback carousel and modal composer, then the improved creator card. The brief, spoiler-free synopsis remains above the book. `authorDisplayName` provides the supplied compact AJ shelf credit. Comic images and transcripts are unchanged.

Published implementation: `874ba61` and compact-cover/focus refinement `719b80b`, runtime release `20261010-6`. The downloaded-book cache prefix is unchanged. The subsequent documentation commit records verification only.

- `npm run check`: source syntax, all **28 tests**, validation of **240 local images**, and static export passed. Two new feedback integration tests cover locked requests/submission, plain text, safe avatar hosts/initials, scroll bounds, per-book drafts and stale response rejection.
- Strict premium static audit: zero findings. Design frontmatter/token regeneration checks passed. Text contrast ratios: text/background 16.64:1, muted/surface 8.43:1, ink/yellow 13.68:1, muted text/paper 6.18:1 and error/surface 5.39:1. No dependency or build tool was added. The optional external DESIGN.md CLI was not installed; local frontmatter and generated-token validation were used.
- Live cloud Chrome: Library/Feedback/Creator anchors retain the mounted reader. Cover resume, arrow/Home navigation, thumbnails, transcripts, help and Options work; Escape restores focus to their triggers. Artwork zoom reaches 150%. A shaded flip leaf is instantiated with 2200px perspective; frame rate was not measured.
- Sound starts only by choice, pauses when scrolling to Creator and remains off after reload. Ambient on/off and saved preferences work. Native fullscreen is refused by this cloud browser; its failure message and inactive icon remain correct. Unit tests cover successful native state, denied requests and expanded fallback.
- The ending jump stayed locked. All 80 real pages were then visibly opened through the reader/transcripts, with their actual opened markers checked; feedback enabled at 80/80. The modal enforces its 600-character limit, focuses an invalid empty field, retains a draft and restores focus on Escape. The actual empty GitHub feed disables both carousel arrows. No public test review was posted; no fake review was inserted.
- Responsive helper widths 360, 768, 1440 and 2560px (iframe borders reduce the actual content viewport by 2px) have no document overflow. Settled phone layout is single-page; tablet/desktop/ultrawide are facing pages. Paper remains proportional and fitted. At the narrowest width, Options and feedback dialogs are 334px wide with no internal horizontal overflow; primary control heights are at least 44px.

Safari, Firefox, physical iOS/Android, successful native fullscreen and measured Lighthouse/frame-rate scores remain platform checks in TEST_CHECKLIST.md. The responsive helper tests real CSS widths, not device emulation. Prior offline tests and cache preservation continue to pass; disconnected browsing was not simulated in this release.
