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

Names, comments and supplied pictures are public. Original images, reader email,
passwords and reader accounts are not stored. The owner's GitHub ID/login are
stored only in private, expiring admin sessions. Comment text
is never rendered as HTML. Records survive browser and frontend reloads.
Feedback remains subject to host availability and needs a network connection.

The completion gate is a client reading affordance, not server authorization.
The public API only creates and reads reviews. Origin checks, input/file
limits and one new post per address per minute reduce abuse; they are not
bot-proof. Unchanged retries bypass the cooldown. Private rate counters
contain a salted hash and timestamp, never a raw IP address.

## Owner dashboard

Use **Manage** in the reader footer, then sign in with the verified
**iam-ajmunna** GitHub account after the one-time activation below. Readers
keep posting without any account. No repository scopes are requested.

`/admin` is protected HTML. GitHub OAuth uses signed state and PKCE; the
server exchanges the code and verifies both login and numeric account ID
`87021168`, obtained from the repository's owner metadata. Only that account
receives a random one-hour HttpOnly/Secure/SameSite=Lax cookie. The private
bucket stores a hash of the cookie with its identity/expiration, never the
provider access token. Sign-out revokes that session; mutation Origin checks
remain mandatory. No client admin key or localStorage token is introduced.

Until activation, the current Site owner login remains available. Its verified
gateway identity and server-only allowlist also protect setup/recovery after
activation. They cannot authorize ordinary GitHub admin requests once OAuth
credentials are configured. An alternative host must replace the trusted
Sites identity boundary for setup, never accept caller-supplied identity headers.

Published cards have **Add/Replace picture**, **Remove picture** and
**Delete feedback**. Deletion removes the post from the public carousel;
**Deleted → Restore feedback** reverses it. Confirm actions in the dialog.
Picture updates reuse the reader's 160px JPEG preparation and server checks.
Name/text remain unchanged. Refresh the public carousel after moderation.
Changing filters, loading lists and pending writes guard repeated actions;
failed uploads preserve the prepared picture for retry.

Photos accept JPG/PNG/WebP up to 5 MB and 24 megapixels, including empty or
nonstandard MIME labels when actual signatures match. SVG/HEIC/HEIF require
a supported export. Decoding uses a correctly typed Blob; the admin CSP
permits blob image previews, with restricted script sources. Originals are
never uploaded; only the prepared 160px JPEG is stored.

## GitHub sign-in activation

The ChatGPT GitHub connector cannot substitute for an OAuth app registered
for this website. Register a dedicated app using GitHub's
[official OAuth app instructions](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app).

| GitHub field | Value |
|---|---|
| Application name | `AJ Comics Admin` |
| Homepage URL | `https://iam-ajmunna.github.io/Comic-Book/` |
| Authorization callback URL | `https://aj-comic-feedback.iamajmunna.chatgpt.site/auth/github/callback` |
| Device Flow | Leave disabled |

1. In Manage, choose **Set up GitHub sign-in**. Current owner
   sign-in is needed once to protect this setup page.
2. Register the OAuth app in your iam-ajmunna GitHub account; generate a
   Client secret on its settings page.
3. Enter the Client ID and Client secret on the protected setup page.
   **Save and enable GitHub sign-in**, then **Sign in as @iam-ajmunna**.
   No additional deployment is needed. Do not paste secrets into chat or source.

The Worker encrypts those credentials with AES-GCM, bound to the Site origin,
using a separate server-only runtime key. Private settings are outside all
public feed prefixes. Setup never returns the secret; failures retain it only
in the current form, with conflict detection and safe unchanged retries.
Current owner access continues until valid settings are saved, then ordinary
admin access requires GitHub. A changed Site origin/key needs owner recovery
and updated callback registration. Provider downtime fails closed; public
reading and feedback continue independently. An expired admin session needs
sign-in again. Expired private session records are inactive; configure bucket
lifecycle cleanup if long-term login volume warrants it.

The implementation follows GitHub's
[web application flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).

| Protected endpoint | Behavior |
|---|---|
| `GET /api/admin/session` | Verified owner role, provider and identity |
| `GET /api/admin/feedback?status=active\|deleted&cursor=<optional>` | At most 12 records plus opaque cursor; includes book, edition and version |
| `PATCH /api/admin/feedback/<id>?book=<id>&edition=<edition>` | JSON `{ version, photo }`; null removes the picture |
| `DELETE` at the same review URL | JSON `{ version }`; reversible soft deletion |
| `POST` at the same review URL | JSON `{ version, action: "restore" }` |
| `GET/POST /api/admin/github-setup` | Current Site owner only; safe status or encrypted credential save |

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
CSRF rejection, reversible deletion, picture updates, OAuth/PKCE state,
encrypted owner setup, expiration, revocation and stale versions. Tests never publish
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
| `ADMIN_EMAIL` | Verified Site owner's email, configured as a secret; protects bootstrap/setup/recovery. |
| `ADMIN_USER_ID` | Optional additional pin to the authenticated **site-scoped** user ID; available after owner sign-in. Do not substitute the workspace account ID. |
| `ADMIN_SESSION_SECRET` | Required independent random secret (32+ characters), already configured through Sites; signs transient OAuth state and encrypts private credentials. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Optional server-managed alternative to the protected setup form. Store the secret through Sites tools; never in source. Partial configuration fails closed. |
| `GITHUB_REDIRECT_URI` | Optional explicit callback; defaults to this service origin plus `/auth/github/callback`. Must match the registered callback. |

R2 records use `reviews/<comic-id>/<encoded-edition>/<inverse-time>-<uuid>.json`.
Private counters use `limits/<salted-hash>`. The service exposes no public
update/delete or raw-bucket endpoint. The protected dashboard updates the same
records, preserving original submission hashes and recording private moderation
metadata. Soft-deleted records remain available to the owner for restoration.
Never expose unauthenticated maintenance. If moving hosts, migrate records
first and update `src/config.js` and the allowed origin. GitHub Pages alone
cannot store shared comments. Reader progress remains device-local.
