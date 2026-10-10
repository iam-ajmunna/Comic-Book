# AJ Comics feedback service

A dependency-free Worker hosted through Sites with a private R2 bucket. The
GitHub Pages reader keeps its existing vanilla HTML/CSS/JS stack. Readers need
no account, sign-in, email or GitHub connection.

Endpoint: `https://aj-comic-feedback.iamajmunna.chatgpt.site/api/feedback`

## API and storage

- `GET /api/feedback?book=<id>&edition=<edition>&cursor=<optional>` returns
  `{ reviews, cursor }`, at most 12 records, newest first.
- `POST /api/feedback` accepts JSON `{ id, book, edition, name, text, photo }`.
  Name is required (1–80 characters after trimming); text is required
  (3–600 characters). Photo is optional/null. A submission ID is
  `${Date.now()}-${crypto.randomUUID()}`; an unchanged retry keeps that ID.
  Conditional storage writes prevent duplicate posts and replacement.
- The reader redraws selected JPG/PNG/WebP files into 160px square JPEGs,
  stripping EXIF/location metadata. The service accepts only JPEG data URLs
  up to 64 KB and 256px. Complete request bodies are capped at 110 KB.
- `GET /health` checks the storage binding without revealing records.

Names, comments and supplied pictures are public. Original images, email,
passwords, GitHub identity and reader accounts are not stored. Comment text
is never rendered as HTML. Records survive browser and frontend reloads.
Feedback remains subject to host availability and needs a network connection.

The completion gate is a client reading affordance, not server authorization.
This is an anonymous append-only public service. Origin checks, input/file
limits and one new post per address per minute reduce abuse; they are not
bot-proof. Unchanged retries bypass the cooldown. Private rate counters
contain a salted hash and timestamp, never a raw IP address.

## Check and deploy

Run `npm test` from the repository root. Tests exercise the actual Worker
against isolated R2 storage, including conditional writes, public read-back,
pagination, validation, cooldown and deduplication. Tests never publish
fabricated reader reviews. From this folder, `npm run build` and
`npm run validate` package/check the Worker. There is nothing to install.

`.openai/hosting.json` identifies the existing service and declares
`r2: "BUCKET"`. Keep the exact `project_id` and existing bucket when updating.
Edit `worker/index.js`; do not hand-edit generated `dist/server/index.js`.
Use the Sites source/publishing workflow for that existing project: open its
source, copy reviewed changes from this folder, build, validate, push the
exact source, save its archive-backed version and deploy. Maintain public
access so anonymous requests remain possible.

Configure these server-only runtime values through Sites environment tools:

| Key | Purpose |
|---|---|
| `ALLOWED_ORIGINS` | Comma-separated allowed origins; production is `https://iam-ajmunna.github.io`. Add local origins deliberately for browser testing. |
| `RATE_LIMIT_SECRET` | Random secret salting private cooldown counters. Never put it in source, logs, hosting.json or frontend code. |

R2 records use `reviews/<comic-id>/<encoded-edition>/<inverse-time>-<uuid>.json`.
Private counters use `limits/<salted-hash>`. The service exposes no public
update/delete or raw-bucket endpoint. To moderate/remove feedback, use owner
storage administration or a reviewed authenticated server maintenance change.
Never expose unauthenticated maintenance. If moving hosts, migrate records
first and update `src/config.js` and the allowed origin. GitHub Pages alone
cannot store shared comments. Reader progress remains device-local.
