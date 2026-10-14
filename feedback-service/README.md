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
The public API only creates and reads reviews. Origin checks, input/file
limits and one new post per address per minute reduce abuse; they are not
bot-proof. Unchanged retries bypass the cooldown. Private rate counters
contain a salted hash and timestamp, never a raw IP address.

## Owner dashboard

Use **Manage feedback** in the reader footer, then sign in with the verified
Site owner's ChatGPT account. Readers keep posting without any account.
Sites owns `/signin-with-chatgpt` and `/signout-with-chatgpt`; this service
adds no password form, OAuth provider, client admin key or browser-stored token.

`/admin` is protected HTML. Every admin API request checks the authenticated
user ID and verified email supplied by the Sites gateway against the
server-only owner allowlist. This depends on the hosting gateway protecting
its identity headers; an alternative host must replace that trust boundary,
not expose this Worker directly with caller-supplied identity headers.

Published cards have **Add/Replace picture**, **Remove picture** and
**Delete feedback**. Deletion removes the post from the public carousel;
**Deleted → Restore feedback** reverses it. Confirm actions in the dialog.
Picture updates reuse the reader's 160px JPEG preparation and server checks.
Name/text remain unchanged. Refresh the public carousel after moderation.
Changing filters, loading lists and pending writes guard repeated actions;
failed uploads preserve the prepared picture for retry.

| Protected endpoint | Behavior |
|---|---|
| `GET /api/admin/session` | Owner role and authenticated site user ID |
| `GET /api/admin/feedback?status=active\|deleted&cursor=<optional>` | At most 12 records plus opaque cursor; includes book, edition and version |
| `PATCH /api/admin/feedback/<id>?book=<id>&edition=<edition>` | JSON `{ version, photo }`; null removes the picture |
| `DELETE` at the same review URL | JSON `{ version }`; reversible soft deletion |
| `POST` at the same review URL | JSON `{ version, action: "restore" }` |

Admin writes require the dashboard's exact Origin and a matching storage
version. Stale/conflicting changes return 409. Repeating an already completed
action is safe. Public responses contain only reader fields, never admin
identity, versions or moderation metadata. Old reader retries cannot restore
deleted feedback or revert a moderated picture. No bulk-delete, hard-delete,
raw-bucket or anonymous maintenance route is available.

## Check and deploy

Run `npm test` from the repository root. Tests exercise the actual Worker
against isolated R2 storage, including conditional writes, public read-back,
pagination, validation, cooldown, deduplication, owner authorization,
CSRF rejection, reversible deletion, picture updates and stale versions. Tests never publish
fabricated reader reviews. From this folder, `npm run build` and
`npm run validate` package/check the Worker. There is nothing to install.

`.openai/hosting.json` identifies the existing service and declares
`r2: "BUCKET"`. Keep the exact `project_id` and existing bucket when updating.
Edit `worker/index.js` and `admin/`; do not hand-edit generated `dist/server/index.js`.
The existing build command embeds the small dashboard's HTML/JS/CSS into
one Worker module with a standard-library Node script, without dependencies
or new tooling. The dashboard imports the reader's canonical styles and
picture helpers from GitHub Pages; keep those shared URLs and runtime version
in sync when publishing. Authentication/permission and API tests are isolated;
signed-in browser QA remains a separate deployment check.
Use the Sites source/publishing workflow for that existing project: open its
source, copy reviewed changes from this folder, build, validate, push the
exact source, save its archive-backed version and deploy. Maintain public
access so anonymous requests remain possible.

Configure these server-only runtime values through Sites environment tools:

| Key | Purpose |
|---|---|
| `ALLOWED_ORIGINS` | Comma-separated allowed origins; production is `https://iam-ajmunna.github.io`. Add local origins deliberately for browser testing. |
| `RATE_LIMIT_SECRET` | Random secret salting private cooldown counters. Never put it in source, logs, hosting.json or frontend code. |
| `ADMIN_EMAIL` | Required verified Site owner's email, configured as a secret. No other account gets moderation access. |
| `ADMIN_USER_ID` | Optional additional pin to the authenticated **site-scoped** user ID; available after owner sign-in. Do not substitute the workspace account ID. |

R2 records use `reviews/<comic-id>/<encoded-edition>/<inverse-time>-<uuid>.json`.
Private counters use `limits/<salted-hash>`. The service exposes no public
update/delete or raw-bucket endpoint. The protected dashboard updates the same
records, preserving original submission hashes and recording private moderation
metadata. Soft-deleted records remain available to the owner for restoration.
Never expose unauthenticated maintenance. If moving hosts, migrate records
first and update `src/config.js` and the allowed origin. GitHub Pages alone
cannot store shared comments. Reader progress remains device-local.
