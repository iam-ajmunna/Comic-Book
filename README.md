# Multiversal Love · AJ / Comics

An immersive, dependency-free comic reading room for **Multiversal Love**, the complete 80-page sci-fi romance by Assaduzzaman Munna (AJ).

**Read:** https://iam-ajmunna.github.io/Comic-Book/
**Author:** https://github.com/iam-ajmunna

## Reader

- Full-viewport, uncropped artwork: cover alone on the right, then facing pages, with an unmatched final page alone. RTL mirrors the layout.
- Automatic single-page layout below 681px, updated on rotation; manual layout override.
- Shaded CSS 3D page turns; immediate changes when reduced motion is preferred.
- Page-edge taps, swipe, arrow keys, Home/End, page scrubber and lazy thumbnail drawer.
- Fullscreen (`F`) with actual API state and recoverable failure messages.
- Global artwork-colour lighting, cached 32 × 48 canvas sampling, ink/paper filtering, saturation boost, neutral CORS fallback, and 1.2-second crossfades.
- Quiet controls that reappear on movement, touch or keyboard use and remain visible while focused.
- Searchable cover library and per-comic saved place; existing Multiversal Love progress migrates automatically.
- Page enlargement with pinch zoom, pointer pan, keyboard pan and explicit zoom/reset buttons.
- Optional original procedural soundtrack: soft piano, reflection, wonder, cinematic scenes and intentional silence. Off by default; starts only after a user gesture; default volume 15%, maximum 35%.
- Opt-in offline download of smaller artwork, thumbnails and transcripts. No full-book download occurs unless requested.
- Selectable dialogue and descriptive transcripts; comments unlock only after every actual page is opened.

## Stack and local use

Vanilla HTML, CSS and native ES modules. **No npm packages, framework, bundler, external font service or build dependency.** Node 20+ supports the supplied server and checks.

```bash
git clone https://github.com/iam-ajmunna/Comic-Book.git
cd Comic-Book
npm run dev
```

Open `http://localhost:4173`. Do not open `index.html` with `file://`; fetching JSON and registering a service worker require an HTTP origin.

```bash
npm run check             # Syntax, unit tests, assets and static export
npm test                  # Navigation, progress, catalog, palette and review tests
npm run validate:assets   # Catalog and local WebP container integrity
npm run build             # Optional: regenerate tokens and copy files into dist/
node scripts/serve.mjs --dist
```

`PORT=8080 npm run dev` selects another port. GitHub Pages can serve the committed root directly; a build is optional.

## Add a comic without changing code

1. Put its cover, pages and thumbnails in a versioned folder such as `assets/my-comic/v1/`. Use WebP or AVIF when practical; preserve aspect ratio. An optional smaller variant should be at most 800px wide.
2. Append one entry to `comics.json`. The cover must also be the first entry of `pages[]`; every array index is an actual page for progress tracking.
3. Set a unique lowercase `id`, an `edition`, image dimensions and `readingDirection` (`ltr` or `rtl`). Supply every page in reading order. Do not reverse the array for manga.
4. Optionally provide a transcript JSON with the same number and order of pages. Add a per-page `cue`: `soft`, `memory`, `wonder`, `cinematic`, or `silence`.
5. Run `npm run check`, then commit and push. The library, search, navigation, drawer, progress and offline download discover the new entry automatically.

Example entry (replace asset paths with your own files):

```json
{
  "id": "my-comic",
  "title": "My Comic",
  "issue": "Issue 1",
  "edition": "v1",
  "author": "Your name",
  "genre": "Sci-fi / Romance",
  "description": "A short introduction to the book.",
  "cover": "assets/my-comic/v1/cover.webp",
  "width": 1600,
  "height": 2476,
  "readingDirection": "ltr",
  "transcript": "assets/my-comic/v1/text.json",
  "pages": [
    {
      "src": "assets/my-comic/v1/cover.webp",
      "small": "assets/my-comic/v1/cover-small.webp",
      "thumbnail": "assets/my-comic/v1/cover-thumb.webp",
      "label": "Cover",
      "title": "My Comic",
      "cue": "soft"
    },
    {
      "src": "assets/my-comic/v1/001.webp",
      "small": "assets/my-comic/v1/001-small.webp",
      "thumbnail": "assets/my-comic/v1/001-thumb.webp",
      "label": "01",
      "title": "The first scene",
      "cue": "wonder"
    }
  ]
}
```

The top-level format is `{ "version": 1, "comics": [...] }`. `small`, `thumbnail`, `description`, `genre`, `author`, `issue` and `transcript` are optional. `src`, `cover`, dimensions, `id`, `title`, `edition` and direction are required. Local paths are relative to the site root. HTTPS images are supported; remote artwork must allow CORS for colour sampling. Otherwise it still displays with neutral lighting. Offline downloads require same-origin assets.

Transcript pages may contain `kind: "cover"`, `kind: "story"` with `text`, or `kind: "comic"` with `panels[]`. Each panel contains `description` and `dialogue[]` entries with `speaker` and `text`. All transcript and comment content is rendered as plain text.

Use a new edition and **versioned asset URLs** when replacing artwork. This preserves explicit progress boundaries and avoids serving older offline-cached images under an unchanged URL.

The reader's CSS and ES modules also carry a release query (`?v=20261010-1`). When changing runtime files, update that release consistently in `index.html`, local module imports and `sw.js`'s `RELEASE`. This prevents returning browsers from mixing an older reader with new HTML. The service worker precaches those exact versioned URLs, revalidates documents and metadata, and activates updates without requiring every reader tab to close. Its cache prefix stays stable across UI releases so downloaded books survive; change it only when the cache format changes.

## Progress and comments

Progress is local to this browser, keyed by comic id and edition. Unique valid pages are merged across tabs. Images count only after decoding and becoming visible in the active reader; visible transcripts also count. Failed images, thumbnails, background tabs, preloading and skipped pages do not unlock comments. This is a reading affordance, not server authorization.

The comment form retains a separate in-memory draft per book. Posting opens a prefilled GitHub Issue for the reader to review and submit using their own account. No credentials or access tokens are embedded. The public feed uses the unauthenticated Issues API, with retry, pagination, rate-limit messaging and cancellation of stale requests. It may be unavailable offline or rate-limited; reading remains available.

The author introduction appears after the book and discussion. Only the verified GitHub handle is linked; add other verified profiles in `index.html` when supplied.

## Offline and storage

The service worker requires HTTPS or localhost. It keeps the application shell and encountered artwork, while **Download for offline** explicitly fetches smaller page variants, thumbnails, the catalog and the selected transcript with three concurrent requests. A failed download is reported and can be retried. Browser storage quotas and eviction still apply. Clear site data in browser settings to remove offline copies and saved progress.

Music is synthesized locally and needs no download. Network comments require connectivity. Remote-hosted comic assets are not included in offline downloads.

## Deploy

For this repository, GitHub Pages serves **`main` → `/ (root)`**. Push the verified source, `comics.json`, generated `src/tokens.css`, artwork and `sw.js` to main. Keep `.nojekyll`. The existing Pages deployment then publishes automatically.

For another static host, either publish the repository root or upload `dist/` after `npm run build`. Deploy under HTTPS, preserve relative paths, and serve `.js`, `.css`, `.json`, `.webp` and `.avif` with their correct MIME types. No backend or environment variables are required.

## Project structure

The October 10 printed-comic theme adapts the supplied `comic-theme.css` and enhancement scripts to the existing reader. `DESIGN.md` still owns the palette and font tokens. Bangers, Anton and Comic Neue are served locally from `assets/fonts/`; their original SIL OFL licenses are included there. The font files come from [Fontsource's font-files repository](https://github.com/fontsource/font-files/tree/main/fonts/google). No font CDN, npm dependency or new build tooling is required.

The one-shot POW intro respects reduced motion and does not appear on direct reading links. Swipe uses one handler for drag-follow, touch flicks, artwork taps and RTL mapping. Fullscreen keeps the existing button/F shortcut, supports WebKit and offers an escapable expanded layout when the browser has no Fullscreen API. A denied native request reports failure without falsely changing the icon.

| Path | Responsibility |
|---|---|
| `comics.json` | Catalog, image paths, reading direction and audio cues |
| `assets/book.json` | Preserved approved story and panel transcripts |
| `src/app.js` | Library, reader orchestration and route handling |
| `src/state.js` | Spread boundaries, progress, migration and persistence |
| `src/images.js` | Matching-resolution loading, alternate fallback and bounded cache |
| `src/lighting.js`, `src/flip.js` | Colour extraction and transform/opacity page turns |
| `src/ui.js`, `src/zoom.js` | Focus-safe controls, native dialogs, feedback and page detail |
| `src/comic-theme.css`, `src/comic-enhance.js` | Supplied printed-comic styling and session intro |
| `src/swipe.js`, `src/fullscreen.js` | Single-owner gestures and native/expanded fullscreen |
| `src/ambience.js`, `src/comments.js` | Existing score and GitHub review integration |
| `src/offline.js`, `sw.js` | Opt-in downloads and offline serving |
| `DESIGN.md`, `src/tokens.css` | Design source and generated runtime tokens |
| `scripts/`, `tests/` | Optional export/server, validation and meaningful tests |

`scripts/export_book.py` reproduces this specific approved 80-page PDF and its 40-scene screenplay; it is not required to add another comic. Its optional PyMuPDF/Pillow tools are not site dependencies. Do not regenerate the comic from an earlier draft.

## Quality and verification

See [TEST_CHECKLIST.md](TEST_CHECKLIST.md) for Chrome, Safari, Firefox, iOS and Android coverage and [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for actual release evidence. Lighthouse goals are Performance 90+, Accessibility 95+ and Best Practices 95+; only measured results should be recorded as scores. CSS 3D page turns target 60fps, subject to device capability. Reduced motion bypasses the animation.

Open `/tests/responsive.html` on the local server or root GitHub Pages deployment to check 360, 768, 1440 and 2560px CSS viewports. This uses an iframe and does not replace testing a real mobile device or another browser.

All original comic content and the existing MIT license are retained. No illustration or character face was regenerated for this reader upgrade.
