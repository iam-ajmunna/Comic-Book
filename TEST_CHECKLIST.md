# Browser test checklist

Run shared checks on current Chrome, Safari and Firefox desktop, Safari on iOS, and Chrome on Android. Record browser/OS versions, viewport, DPR and pass/fail; simulated responsive layouts do not prove a physical-device pass.

| Platform | Additional checks |
|---|---|
| Chrome desktop | Fullscreen enter/exit/F/Escape; rapid flips; keyboard navigation; Lighthouse on a cold profile |
| Safari desktop | Web Audio gesture/resume, native dialog focus, canvas sampling, 3D backfaces |
| Firefox desktop | Focus outlines, global scrollbar styling, fullscreen state, RTL arrow mapping |
| iOS Safari | 360px width, safe areas, portrait/landscape, swipe/pinch, expanded-layout fallback when Fullscreen API is absent, audio activation |
| Android Chrome | Touch edge targets, swipe versus vertical scroll, zoom/pan, rotation, memory during rapid navigation |

## Shared flows

- Library cover loads; search by title/author/genre; no-results recovery; clear restores results and focus; Back restores the search.
- Open the book; cover occupies only the right slot in LTR. Check 01–02, terminal spread, one-page book and odd/even content counts. RTL mirrors slots without mirroring artwork.
- At 360, 768, 1440 and 2560px, artwork stays proportional and uncropped, controls remain reachable, and the document has no horizontal overflow. Rotate and check automatic single-page mode.
- Buttons, edge taps, swipe, arrows, Home/End, scrubber and thumbnail selection reach the intended page and respect boundaries. Rapid inputs do not allow stale pages or colours to overwrite the newest spread.
- Drag from the artwork: one gesture turns one spread and never opens zoom afterward. A tap still enlarges the artwork; vertical scrolling, a second finger and cancelled gestures do not turn. Test LTR and RTL.
- Confirm local Bangers/Anton/Comic Neue fonts load, the title wraps between words at 360px, and the theme remains available offline. The library opens without a POW overlay or coloured washes; reader ambient lighting still works.
- Scroll past the discussion to the creator card. Confirm the portrait loads sharply, the biography/roles match the supplied content, and the GitHub link has visible keyboard focus. At 360px, the card stacks without overflow or cropped content; with reduced motion, the portrait is unrotated. Confirm the card style and portrait are available offline.
- Check native/WebKit fullscreen state and rejected requests. Where the API is absent, Escape, the fullscreen button and Library all leave expanded layout without losing progress.
- Controls hide only when idle/unfocused; movement/touch/Tab restores them. Focus and open dialogs prevent hiding. Escape restores the triggering control.
- Ambient lighting changes with artwork over about 1.2s; ink and paper do not dominate. Toggle persists. CORS sampling failure falls back without hiding artwork.
- Enable sound with a gesture. Check soft, cinematic and silent cues, zero volume, hidden tab, library navigation and Back/Forward restoration. No sound starts automatically.
- Enlarge a page; +/-/reset, pinch, drag and keyboard pan work; pan stays bounded; close restores focus.
- Read text; speaker attribution and all prose remain available. Check long text and internal scrolling.
- Reload and resume; verify separate book/edition progress and cross-tab merging. Block localStorage; reading remains functional with honest messaging.
- Jump to the ending; comments remain locked. Prefetch and thumbnails do not count. Failed pages do not count. Open all actual pages/transcripts; comments unlock.
- Inline feedback: blank/whitespace names must fail with focus and an associated error; a name and 3–600-character feedback can be posted without a picture or any account. Test shared create/read-back, duplicates and failure recovery in isolated tests; do not publish fabricated public reviews. Confirm original drafts survive an offline or failed submission.
- Download offline, disconnect, reopen and navigate the entire book, including transcripts. Failed/partial download offers retry. Verify comments remain network-dependent.
- Keyboard-only: skip link, every action, drawer, enlargement, forms; no traps outside dialogs. Check reduced motion, 200% zoom and forced colours.

## Performance

Use a cold profile without extensions and run Lighthouse desktop and mobile. Record real scores against P90+/A95+/BP95+. Check visible images plus only the next spread load normally; full-book downloads require the offline action. During flips, inspect frames for layout/paint work and report tested hardware rather than claiming universal 60fps.

## Redesign Preview v2

- On first visit, confirm the header, compact shelf, embedded reader, locked feedback and creator card are all on one scrolling page. Library / Feedback / Creator anchors, direct links and Back/Forward must scroll to the expected section.
- Search for a missing title and clear it. Open/resume from the shelf; resize at 360, 768, 1440 and 2560px and confirm paper is uncropped and the document has no horizontal overflow.
- Check floating navigation, scrubber, edge taps, swipe, thumbnails, zoom and Options. Escape restores focus after Options/Help/Pages; focused controls never hide.
- Enable sound, then scroll away from the book: it must pause. Return to resume; off/silence/reduced-motion preferences must remain correct. Test light on/off and fullscreen without losing the mounted book.
- Feedback stays locked after a jump to End. After every page is opened, Leave feedback scrolls/focuses the inline required-name field. No dialog, account or GitHub handoff appears. Check empty/error/loading states and carousel bounds.
- Choose a valid picture, check its square preview, then remove it and post without a picture in isolated tests. Reject SVG, empty, corrupt and over-5-MB selections with a correction hint and reachable removal. Test PNG transparency, portrait/landscape crops, mobile picker cancellation and duplicate submit clicks.
- Confirm feedback from another reader persists on reload; optional-photo comments use initials. Test a long Unicode name, plain-text HTML-like input, server cooldown, cancelled/uncertain requests, unchanged retry deduplication and stale book/edition responses. Browser identity must not appear in requests; drafts must not be silently queued offline.
