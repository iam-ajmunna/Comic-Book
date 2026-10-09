# Multiversal Love

An immersive web reader for the complete 80-page illustrated sci-fi romance. Facing pages keep every comic scene beside its companion prose. Scene-colored light and an original, quiet soundtrack support the story.

![Multiversal Love cover](assets/pages/000-small.webp)

## Reader features

- Desktop: two pages side by side. Phones: one legible page, with a two-page switch.
- Correct pairings: cover + introductory endpaper, 01–02 through 77–78, then 79 + closing endpaper.
- Illustrated contents, previous/next controls, arrow-key navigation, deep links such as `#page=23`, and full-resolution zoom.
- Selectable text mode with panel descriptions and attributed dialogue.
- Saved reading position and unique opened-page progress on the same device.
- Scene-aware ambient light, independent on/off switch, and reduced-motion support.
- Optional quiet music: piano-like melody, harmonic pads, cinematic passages and deliberate silence.
- Comments below the book, unlocked only after all 80 real book pages have opened.
- Introduction to **AJ — Assaduzzaman Munna**, AI engineer, full-stack systems specialist and the creator of this story, with [@iam-ajmunna](https://github.com/iam-ajmunna).

## Run locally

Requires Node.js 20 or newer. No production dependencies or package installation.

```sh
git clone https://github.com/iam-ajmunna/Comic-Book.git
cd Comic-Book
npm run dev
```

Open **http://localhost:4173**. Serve over HTTP; opening `index.html` through `file://` can block modules and the book manifest.

```sh
npm test                       # Core behavior tests
npm run check                  # Syntax, tests and production build
npm run build                  # Creates self-contained dist/
node scripts/serve.mjs --dist   # Preview the production files
```

## Publish on GitHub Pages

1. Push this project to a **public repository**, keeping **Issues enabled**.
2. Open **Settings → Pages → Build and deployment**.
3. Select **Deploy from a branch**, **main**, **/(root)**, then **Save**.
4. Wait for the Pages deployment; its settings screen displays the live URL.

The repository root is ready to serve. It includes `.nojekyll` and the generated `src/tokens.css`. Relative assets work under a GitHub project path. Any static host can serve `dist/` instead.

Alternatively, an authenticated GitHub CLI can enable Pages for this repository:

```sh
gh auth login
bash scripts/enable-pages.sh
```

The script preserves an existing Pages configuration. Never put credentials, tokens or passwords in the frontend. After future edits, run `npm run check`, commit your changes and push `main`; branch publishing will update the site automatically.

## Shared comments and the reading gate

Only a successfully loaded page that is visible in the reading area counts as opened. Its visible text alternative also counts. Thumbnails, prefetches and failed image loads do not count. All **80 unique PDF pages**, including the cover, are required; jumping to 79 does not unlock comments. The two decorative endpapers are not additional pages.

After completion, a reader writes a 3–600-character comment beneath the book. **Continue on GitHub** opens a prefilled public issue draft. The reader signs in and confirms the post on GitHub, then returns and selects **Refresh**. Reviews are shared across visitors. Replies and edits remain available through **Read or reply on GitHub**.

This is a real shared store using GitHub Issues, not browser-local comments. It requires a GitHub account to post, but no paid backend, API key, or third-party GitHub app. The reader never claims a draft has been posted. Draft text stays in the current tab and is not written to local storage.

### Configuration and moderation

- `src/config.js` owns the repository name, `[Book review] ` title prefix, and `<!-- multiversal-love:review:v1 -->` body marker.
- When forking, update the repository name and visible GitHub links in `index.html` and this README.
- Keep the marker when editing a review. Only open marked review issues appear in the feed.
- Close a review issue to hide it. GitHub also provides normal report, lock and deletion controls.
- The feed requests 30 issues per page, with **Load more** and manual refresh. Rate-limit, timeout and offline failures show recoverable messages.
- All review text uses `textContent`; user HTML and scripts are never executed.

**The completion requirement is a reading-experience gate, not server authorization.** Public issues are accessible directly and browser state can be edited or cleared. It does not prove every word was read. Strict enforcement would require an authenticated backend and an agreed verification policy.

## Ambient soundtrack and light

`src/ambience.js` synthesizes an original instrumental score locally with Web Audio: sparse piano-like notes, soft pads, spacious reverb and a restrained low register in cinematic scenes. No commercial recordings, external music services, audio downloads or tracking players are used.

Sound starts **off** on a fresh page load and requires a reader gesture. Volume begins at 15%, with a quiet 35% cap. System volume still affects loudness. Music fades with scene changes and stops in silent scenes, hidden tabs, or when the book leaves the viewport.

| Passage | Treatment |
|---|---|
| Everyday conversations | Soft piano |
| Happiness and memory | Warm, slower reflection |
| The anomaly and linked worlds | Sparse suspended harmony |
| The breach and second crisis | Soft cinematic chords and low tones |
| Breakup, loss, grief and final quiet exchanges | Silence |
| The final page | Gentle unresolved reflection |

`SCENE_CUES` maps the cover plus all 40 scenes. Odd/even companion pages share a cue. Music follows page selection, never an assumed reading speed. Ambient washes sit behind the paper and change gently. The separate light switch and `prefers-reduced-motion` support reduce sensory load. There are no flashing effects.

## Customize or update

- **Author:** edit `.author-section` in `index.html`. Only verified links and approved biography should be added; no Instagram, Facebook or other handles are guessed.
- **Design:** edit `DESIGN.md`, then `npm run build` to regenerate `src/tokens.css`.
- **Navigation/completion:** edit `src/state.js` and run tests. Never replace the unique-page set with the highest page number reached.
- **New edition:** update the edition key and page-count invariants deliberately so old progress cannot unlock another book.

The approved source PDF and production archive are not included in the public repository. To regenerate assets from your copies:

```sh
python3 -m venv .venv
. .venv/bin/activate
pip install PyMuPDF Pillow
python scripts/export_book.py /path/to/approved-book.pdf /path/to/revised_pages.json
npm run check
```

The exporter requires the approved 80-page PDF and matching 40-scene screenplay. It reproduces the PDF as 1600px/800px WebP pages, small thumbnails and accessible text; it does not redraw the illustrations.

## Structure

| Path | Purpose |
|---|---|
| `index.html` | Reader, comment area and author section |
| `src/app.js` | Rendering, navigation, dialogs and visibility tracking |
| `src/state.js` | Validated progress and persistence |
| `src/comments.js` | Public review feed and GitHub draft handoff |
| `src/ambience.js` | Scene cues and original instrumental synthesis |
| `src/styles.css` | Responsive reading layout and light |
| `src/tokens.css` | Generated design tokens |
| `assets/book.json` | Metadata, prose and described panels |
| `assets/pages/`, `assets/thumbs/` | Approved book images |
| `scripts/` | Export, build, local server and publishing |
| `tests/` | Meaningful behavior checks |

## Accessibility, privacy and limitations

Named controls, visible focus, skip navigation, native modal behavior, real progress semantics, text alternatives and reduced motion support accessible reading. Progress stays in local storage on that browser. No third-party request is needed to read or play the score. The public GitHub API is contacted only after completion; posting is a separate, explicit action.

GitHub API rate limits can affect comment loading. Readers can retry, and already loaded comments remain visible. Images are responsive and only current/adjacent pages load; the entire book is not decoded at once. Text mode avoids image decoding entirely.

See the repository’s existing `LICENSE` for licensing.

## Official references

- [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
- [Prefilled issue URLs](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/creating-an-issue)
- [Issues API](https://docs.github.com/en/rest/issues/issues)
- [Web Audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices)
