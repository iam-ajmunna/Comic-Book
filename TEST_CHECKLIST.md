# Browser test checklist

Run shared checks on current Chrome, Safari and Firefox desktop, Safari on iOS, and Chrome on Android. Record browser/OS versions, viewport, DPR and pass/fail; simulated responsive layouts do not prove a physical-device pass.

| Platform | Additional checks |
|---|---|
| Chrome desktop | Fullscreen enter/exit/F/Escape; rapid flips; keyboard navigation; Lighthouse on a cold profile |
| Safari desktop | Web Audio gesture/resume, native dialog focus, canvas sampling, 3D backfaces |
| Firefox desktop | Focus outlines, global scrollbar styling, fullscreen state, RTL arrow mapping |
| iOS Safari | 360px width, safe areas, portrait/landscape, swipe/pinch, unsupported-fullscreen message, audio activation |
| Android Chrome | Touch edge targets, swipe versus vertical scroll, zoom/pan, rotation, memory during rapid navigation |

## Shared flows

- Library cover loads; search by title/author/genre; no-results recovery; clear restores results and focus; Back restores the search.
- Open the book; cover occupies only the right slot in LTR. Check 01–02, terminal spread, one-page book and odd/even content counts. RTL mirrors slots without mirroring artwork.
- At 360, 768, 1440 and 2560px, artwork stays proportional and uncropped, controls remain reachable, and the document has no horizontal overflow. Rotate and check automatic single-page mode.
- Buttons, edge taps, swipe, arrows, Home/End, scrubber and thumbnail selection reach the intended page and respect boundaries. Rapid inputs do not allow stale pages or colours to overwrite the newest spread.
- Controls hide only when idle/unfocused; movement/touch/Tab restores them. Focus and open dialogs prevent hiding. Escape restores the triggering control.
- Ambient lighting changes with artwork over about 1.2s; ink and paper do not dominate. Toggle persists. CORS sampling failure falls back without hiding artwork.
- Enable sound with a gesture. Check soft, cinematic and silent cues, zero volume, hidden tab, library navigation and Back/Forward restoration. No sound starts automatically.
- Enlarge a page; +/-/reset, pinch, drag and keyboard pan work; pan stays bounded; close restores focus.
- Read text; speaker attribution and all prose remain available. Check long text and internal scrolling.
- Reload and resume; verify separate book/edition progress and cross-tab merging. Block localStorage; reading remains functional with honest messaging.
- Jump to the ending; comments remain locked. Prefetch and thumbnails do not count. Failed pages do not count. Open all actual pages/transcripts; comments unlock.
- Review draft validation preserves text and does not claim a post was submitted. Do not submit a public test review. Check failed/rate-limited feed recovery.
- Download offline, disconnect, reopen and navigate the entire book, including transcripts. Failed/partial download offers retry. Verify comments remain network-dependent.
- Keyboard-only: skip link, every action, drawer, enlargement, forms; no traps outside dialogs. Check reduced motion, 200% zoom and forced colours.

## Performance

Use a cold profile without extensions and run Lighthouse desktop and mobile. Record real scores against P90+/A95+/BP95+. Check visible images plus only the next spread load normally; full-book downloads require the offline action. During flips, inspect frames for layout/paint work and report tested hardware rather than claiming universal 60fps.
