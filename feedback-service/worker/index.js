// Small, dependency-free public feedback API. BUCKET is a private R2 binding;
// only validated feedback is exposed, never raw bucket keys or rate records.
import { createGithubAuth, AdminAuthError } from './github-auth.js';
import { resolveGithubSettings, saveGithubSettings, githubSettingsStatus } from './github-settings.js';
const MAX_BODY = 110_000;
const MAX_PHOTO = 65_536;
const PAGE_SIZE = 12;
const COOLDOWN = 60_000;
const slug = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const submission = /^(\d{13})-([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/;

class FeedbackError extends Error {
  constructor(message, status = 422, field = '') { super(message); this.status = status; this.field = field; }
}

function response(data, status = 200, origin = '') {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Origin',
  };
  if (origin) Object.assign(headers, {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '600',
  });
  return new Response(status === 204 ? null : JSON.stringify(data), { status, headers });
}

function bookPrefix(book, edition) {
  if (!slug.test(book || '') || typeof edition !== 'string' || !edition.trim() || edition.length > 80 || /[\u0000-\u001f\u007f]/.test(edition))
    throw new FeedbackError('Choose a valid comic edition.', 422);
  return `reviews/${book}/${encodeURIComponent(edition)}/`;
}

export function validatePhoto(value) {
  let photo = null;
  if (value != null) {
    // The client redraws selected PNG/JPEG/WebP files onto a small canvas. This
    // accepts only bounded JPEG bytes, not arbitrary URLs, SVG or HTML uploads.
    if (typeof value !== 'string' || value.length > MAX_PHOTO * 1.4 ||
        !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))
      throw new FeedbackError('Choose a valid picture or remove it to post.', 422, 'photo');
    let bytes;
    try { bytes = atob(value.slice('data:image/jpeg;base64,'.length)); } catch {
      throw new FeedbackError('This picture could not be read. Choose another.', 422, 'photo');
    }
    if (bytes.length < 16 || bytes.length > MAX_PHOTO ||
        bytes.charCodeAt(0) !== 255 || bytes.charCodeAt(1) !== 216 ||
        bytes.charCodeAt(2) !== 255 || bytes.charCodeAt(bytes.length - 2) !== 255 ||
        bytes.charCodeAt(bytes.length - 1) !== 217)
      throw new FeedbackError('Choose a valid picture or remove it to post.', 422, 'photo');
    // Inspect JPEG frame dimensions as well as its MIME/signature. A tiny
    // compressed upload must not expand into an enormous image in the feed.
    let offset = 2, sized = false;
    while (offset < bytes.length - 2) {
      if (bytes.charCodeAt(offset++) !== 255) break;
      while (bytes.charCodeAt(offset) === 255) offset++;
      const marker = bytes.charCodeAt(offset++);
      if (marker === 218 || marker === 217) break;
      const length = (bytes.charCodeAt(offset) << 8) + bytes.charCodeAt(offset + 1);
      if (length < 2 || offset + length > bytes.length) break;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) {
        const height = (bytes.charCodeAt(offset + 3) << 8) + bytes.charCodeAt(offset + 4);
        const width = (bytes.charCodeAt(offset + 5) << 8) + bytes.charCodeAt(offset + 6);
        if (length < 8 || !width || !height || width > 256 || height > 256) break;
        sized = true; break;
      }
      offset += length;
    }
    if (!sized) throw new FeedbackError('Choose a small profile picture or remove it to post.', 422, 'photo');
    photo = value;
  }
  return photo;
}

export function validateFeedback(data, now = Date.now()) {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new FeedbackError('Enter your name and feedback.');
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  const text = typeof data.text === 'string' ? data.text.trim() : '';
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name))
    throw new FeedbackError('Enter your name (up to 80 characters).', 422, 'name');
  if (text.length < 3 || text.length > 600 || /[\u0000\u000b\u000c]/.test(text))
    throw new FeedbackError('Write between 3 and 600 characters.', 422, 'text');
  const prefix = bookPrefix(data.book, data.edition);
  const match = typeof data.id === 'string' && data.id.match(submission);
  if (!match || Number(match[1]) > now + 300_000 || Number(match[1]) < 1_577_836_800_000)
    throw new FeedbackError('This submission could not be read. Edit your feedback and try again.', 422);
  const photo = validatePhoto(data.photo);
  const reverseTime = String(9_999_999_999_999 - Number(match[1])).padStart(13, '0');
  return {
    key: `${prefix}${reverseTime}-${match[2]}.json`,
    review: { id: data.id, name, text, photo, created_at: new Date(now).toISOString() },
  };
}

async function readJSON(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new FeedbackError('Send feedback as JSON.', 415);
  if (Number(request.headers.get('content-length')) > MAX_BODY)
    throw new FeedbackError('This picture is too large. Choose another.', 413, 'photo');
  const reader = request.body?.getReader();
  if (!reader) throw new FeedbackError('Enter your name and feedback.');
  let size = 0;
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) { await reader.cancel(); throw new FeedbackError('This picture is too large.', 413, 'photo'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new FeedbackError('The feedback could not be read. Try again.', 400); }
}

async function rateLimit(request, env, id) {
  // One durable conditional counter per hashed address. No IP address or
  // visitor identity is stored. The salt is configured as a runtime secret.
  const ip = request.headers.get('cf-connecting-ip');
  if (!ip || !env.RATE_LIMIT_SECRET) throw new FeedbackError('Feedback is temporarily unavailable. Try again shortly.', 503);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${env.RATE_LIMIT_SECRET}:${ip}`));
  const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  const key = `limits/${hash}`;
  const previous = await env.BUCKET.get(key);
  const value = previous ? await previous.json() : null;
  if (value?.id === id) return; // A timed-out request can be retried safely.
  if (value && Date.now() - value.at < COOLDOWN)
    throw new FeedbackError('Please wait a minute before posting another comment.', 429);
  const claim = await env.BUCKET.put(key, JSON.stringify({ id, at: Date.now() }), {
    onlyIf: previous ? { etagMatches: previous.etag } : { etagDoesNotMatch: '*' },
    httpMetadata: { contentType: 'application/json' },
  });
  if (!claim) {
    const latest = await env.BUCKET.get(key);
    if ((await latest?.json())?.id !== id)
      throw new FeedbackError('Please wait a minute before posting another comment.', 429);
  }
}

function publicReview(review) {
  const { id, name, text, photo, created_at } = review;
  return { id, name, text, photo, created_at };
}
async function submissionHash(review) {
  const bytes = new TextEncoder().encode(JSON.stringify([review.name, review.text, review.photo]));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function repeatReview(existing, requested) {
  if (existing.deleted_at) throw new FeedbackError('This feedback has been removed by the author.', 410);
  const original = existing._submission_hash || await submissionHash(existing);
  if (original !== await submissionHash(requested))
    throw new FeedbackError('This submission was already used. Edit your feedback and try again.', 409);
  return publicReview(existing);
}

async function requireAdmin(request, env, auth) {
  if (auth.enabled(env)) return auth.requireSession(request,env);
  return requireSiteOwner(request,env);
}
function requireSiteOwner(request, env) {
  // These identity headers are set by Sites' authentication gateway, never by
  // frontend fields. The owner allowlist is a server-only runtime value.
  const userId = request.headers.get('oai-authenticated-user-id');
  const email = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  if (!userId || !email) throw new FeedbackError('Sign in with ChatGPT to manage feedback.', 401);
  if (!env.ADMIN_EMAIL || email !== env.ADMIN_EMAIL.trim().toLowerCase() ||
      (env.ADMIN_USER_ID && userId !== env.ADMIN_USER_ID))
    throw new FeedbackError('Only the owner can manage this feedback.', 403);
  return { userId, role: 'admin', provider: 'chatgpt', githubReady: false };
}

function pageResponse(body, status = 200, type = 'text/html; charset=utf-8') {
  return new Response(body, { status, headers: {
    'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'none'; script-src 'self' https://iam-ajmunna.github.io; style-src 'self' https://iam-ajmunna.github.io; font-src https://iam-ajmunna.github.io; img-src 'self' data: blob:; connect-src 'self' https://iam-ajmunna.github.io; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  } });
}
function accessPage(status, env, auth, message = '', returnTo = '/admin') {
  const denied = status === 403;
  const github = auth.enabled(env), ready = auth.configured(env);
  const text = message || (github ? denied ? 'Only @iam-ajmunna can manage this feedback. Sign in with that GitHub account.' : 'Sign in with @iam-ajmunna on GitHub to manage reader feedback.' : 'GitHub sign-in is awaiting its one-time owner setup. Current owner access remains available until activation.');
  const safe = text.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const link = github ? ready ? '<a class="button" href="/auth/github" target="_top">Sign in with GitHub</a>' : '<a class="button" href="/admin/github-setup">Set up GitHub sign-in</a>' : `<a class="button" target="_top" href="${denied ? '/signout-with-chatgpt' : '/signin-with-chatgpt'}?return_to=${encodeURIComponent(returnTo)}">${denied ? 'Switch current owner account' : 'Current owner sign-in'}</a>`;
  const pending = !github ? '<p>GitHub sign-in needs one-time activation. <a href="/admin/github-setup">Set up the GitHub connection</a>.</p>' : '';
  return pageResponse(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Feedback admin · AJ Comics</title><link rel="stylesheet" href="/admin/styles.css"><body><main class="admin-access"><p class="eyebrow">AJ / COMICS</p><h1>${denied ? 'Owner access only' : 'Feedback admin'}</h1><p>${safe}</p>${pending}<p>Readers can leave feedback without an account.</p>${link}<a class="back-link" href="/admin/github-setup">Owner GitHub setup / recovery</a><a class="back-link" href="https://iam-ajmunna.github.io/Comic-Book/">Back to the book →</a></main></body></html>`, status);
}
function keyForReview(book, edition, id) {
  const prefix = bookPrefix(book, edition);
  const match = typeof id === 'string' && id.match(submission);
  if (!match) throw new FeedbackError('Choose a valid feedback post.', 422);
  return `${prefix}${String(9_999_999_999_999 - Number(match[1])).padStart(13, '0')}-${match[2]}.json`;
}
function adminReview(record, stored, key) {
  const parts = key.split('/');
  return { ...publicReview(record), book: parts[1], edition: decodeURIComponent(parts[2]),
    version: stored.etag, deleted_at: record.deleted_at || null, updated_at: record.updated_at || null };
}
async function handleAdmin(request, env, url, auth) {
  const identity = await requireAdmin(request, env, auth);
  if (request.method === 'GET' && url.pathname === '/api/admin/session') return response(identity);
  if (!env.BUCKET) throw new FeedbackError('Feedback is temporarily unavailable. Try again shortly.', 503);
  if (request.method === 'GET' && url.pathname === '/api/admin/feedback') {
    const book = url.searchParams.get('book'), edition = url.searchParams.get('edition');
    const prefix = book ? bookPrefix(book, edition) : 'reviews/';
    const cursor = url.searchParams.get('cursor') || undefined;
    if (cursor?.length > 4096) throw new FeedbackError('Refresh to load feedback.', 400);
    const filter = url.searchParams.get('status') || 'active';
    if (!['active', 'deleted'].includes(filter)) throw new FeedbackError('Choose an available feedback filter.', 422);
    const list = await env.BUCKET.list({ prefix, limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) });
    const records = (await Promise.all(list.objects.map(async item => {
      const stored = await env.BUCKET.get(item.key); if (!stored) return null;
      const record = await stored.json();
      if (Boolean(record.deleted_at) !== (filter === 'deleted')) return null;
      return adminReview(record, stored, item.key);
    }))).filter(Boolean);
    return response({ reviews: records, cursor: list.truncated ? list.cursor : null });
  }
  const match = url.pathname.match(/^\/api\/admin\/feedback\/([^/]+)$/);
  if (!match || !['PATCH', 'DELETE', 'POST'].includes(request.method))
    throw new FeedbackError('This admin action is not available.', 405);
  // Browser authentication alone is not CSRF protection. Mutations must come
  // from this dashboard origin, not the public reader or an external form.
  if (request.headers.get('origin') !== url.origin)
    throw new FeedbackError('Open the admin panel to make this change.', 403);
  const key = keyForReview(url.searchParams.get('book'), url.searchParams.get('edition'), decodeURIComponent(match[1]));
  const data = await readJSON(request);
  if (!data || typeof data.version !== 'string' || !data.version || data.version.length > 128)
    throw new FeedbackError('Refresh this feedback before making a change.', 422);
  const stored = await env.BUCKET.get(key);
  if (!stored) throw new FeedbackError('This feedback is no longer available. Refresh the list.', 404);
  const record = await stored.json();
  const action = request.method === 'DELETE' ? 'delete' : request.method === 'POST' ? 'restore' : 'picture';
  if (action === 'picture' && !Object.hasOwn(data, 'photo')) throw new FeedbackError('Choose a profile picture or explicitly remove it.', 422, 'photo');
  if (action === 'restore' && data.action !== 'restore') throw new FeedbackError('Choose an available admin action.', 422);
  const nextPhoto = action === 'picture' ? validatePhoto(data.photo) : null;
  if ((action === 'delete' && record.deleted_at) || (action === 'restore' && !record.deleted_at) ||
      (action === 'picture' && !record.deleted_at && record.photo === nextPhoto))
    return response({ review: adminReview(record, stored, key) });
  if (stored.etag !== data.version) throw new FeedbackError('This feedback changed. Refresh before trying again.', 409);
  if (action === 'picture' && record.deleted_at) throw new FeedbackError('Restore this feedback before changing its picture.', 409);
  record._submission_hash ||= await submissionHash(record);
  if (action === 'picture') record.photo = nextPhoto;
  else record.deleted_at = action === 'delete' ? new Date().toISOString() : null;
  record.updated_at = new Date().toISOString(); record._moderated_by = identity.userId;
  const updated = await env.BUCKET.put(key, JSON.stringify(record), {
    onlyIf: { etagMatches: stored.etag }, httpMetadata: { contentType: 'application/json' },
  });
  if (!updated) throw new FeedbackError('This feedback changed. Refresh before trying again.', 409);
  return response({ review: adminReview(record, updated, key) });
}

export function createWorker(assets = {}, { auth = createGithubAuth() } = {}) { return {
  async fetch(request, env) {
    const url = new URL(request.url);
    const incoming = request.headers.get('origin') || '';
    const adminRoute = url.pathname.startsWith('/api/admin/');
    const allowed = adminRoute ? [url.origin] : [...(env.ALLOWED_ORIGINS || 'https://iam-ajmunna.github.io').split(',').map(v => v.trim()), url.origin];
    const origin = allowed.includes(incoming) ? incoming : '';
    if (incoming && !origin) return response({ error: 'This reader origin is not allowed.' }, 403);
    if (request.method === 'OPTIONS') return response(null, 204, origin);
    try {
      if (['/admin/github-setup','/admin/setup.js','/api/admin/github-setup'].includes(url.pathname)) {
        try { requireSiteOwner(request,env); } catch (e) {
          if (url.pathname.startsWith('/api/')) throw e;
          return accessPage(e.status,env,{enabled:()=>false,configured:auth.configured},'Use your current owner account for this one-time GitHub setup.','/admin/github-setup');
        }
        if (request.method === 'GET' && url.pathname === '/admin/github-setup') return pageResponse(assets.setupHtml || 'Setup is temporarily unavailable.',assets.setupHtml?200:503);
        if (request.method === 'GET' && url.pathname === '/admin/setup.js') return pageResponse(assets.setupJs || '',200,'text/javascript; charset=utf-8');
        if (url.pathname === '/api/admin/github-setup' && request.method === 'GET') return response(await githubSettingsStatus(env,url.origin));
        if (url.pathname === '/api/admin/github-setup' && request.method === 'POST') {
          if (incoming !== url.origin) throw new AdminAuthError('Open the owner setup page to save this connection.',403);
          await saveGithubSettings(env,url.origin,await readJSON(request));return response({saved:true});
        }
        return response({error:'This setup action is not available.'},405);
      }
      // Public feedback never reads credentials; only protected/auth requests
      // resolve the owner configuration, with no credential values in responses.
      if (adminRoute || ['/admin','/admin/','/admin/app.js'].includes(url.pathname) || url.pathname.startsWith('/auth/github')) {
        try { env=await resolveGithubSettings(env,url.origin); } catch (error) {
          if ((['/admin','/admin/'].includes(url.pathname) || url.pathname.startsWith('/auth/github')) && error instanceof AdminAuthError)
            return accessPage(error.status,env,{enabled:()=>true,configured:()=>false},error.message);
          throw error;
        }
      }
      if (url.pathname.startsWith('/auth/github')) {
        try {
          if (request.method === 'GET' && url.pathname === '/auth/github') return await auth.begin(request,env);
          if (request.method === 'GET' && url.pathname === '/auth/github/callback') return await auth.callback(request,env);
          if (request.method === 'POST' && url.pathname === '/auth/github/logout') return await auth.logout(request,env);
          return response({error:'This sign-in action is not available.'},405);
        } catch (e) {
          if (!(e instanceof AdminAuthError)) throw e;
          return accessPage(e.status,env,auth,e.message);
        }
      }
      if (request.method === 'GET' && url.pathname === '/admin/styles.css')
        return pageResponse(assets.css || '', 200, 'text/css; charset=utf-8');
      if (request.method === 'GET' && ['/admin', '/admin/'].includes(url.pathname)) {
        try { await requireAdmin(request, env, auth); } catch (e) { return accessPage(e.status || 403,env,auth,e.message); }
        if (!assets.html) throw new FeedbackError('The admin panel is temporarily unavailable.', 503);
        const signout = auth.enabled(env) ? '<form class="admin-signout" action="/auth/github/logout" method="post" novalidate><button class="text-button" type="submit">Sign out</button></form>' : '<a target="_top" href="/signout-with-chatgpt?return_to=%2Fadmin">Sign out</a>';
        return pageResponse(assets.html.replace('<!--ADMIN_SIGNOUT-->',signout));
      }
      if (request.method === 'GET' && url.pathname === '/admin/app.js') {
        await requireAdmin(request, env, auth);
        return pageResponse(assets.js || '', 200, 'text/javascript; charset=utf-8');
      }
      if (adminRoute) return await handleAdmin(request, env, url, auth);
      if (request.method === 'GET' && url.pathname === '/')
        return response({ service: 'AJ Comics reader feedback', reader: 'https://iam-ajmunna.github.io/Comic-Book/', account_required: false }, 200, origin);
      if (!env.BUCKET) throw new FeedbackError('Feedback is temporarily unavailable. Try again shortly.', 503);
      if (request.method === 'GET' && url.pathname === '/health') {
        await env.BUCKET.list({ prefix: 'reviews/', limit: 1 });
        return response({ ok: true }, 200, origin);
      }
      if (url.pathname !== '/api/feedback') return response({ error: 'Not found.' }, 404, origin);
      if (request.method === 'GET') {
        const prefix = bookPrefix(url.searchParams.get('book'), url.searchParams.get('edition'));
        const cursor = url.searchParams.get('cursor') || undefined;
        if (cursor?.length > 4096) throw new FeedbackError('Refresh to load reader feedback.', 400);
        const list = await env.BUCKET.list({ prefix, limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) });
        const reviews = (await Promise.all(list.objects.map(async o => {
          const stored = await env.BUCKET.get(o.key);
          return stored ? stored.json() : null;
        }))).filter(record => record && !record.deleted_at).map(publicReview);
        return response({ reviews, cursor: list.truncated ? list.cursor : null }, 200, origin);
      }
      if (request.method !== 'POST') return response({ error: 'Use GET or POST.' }, 405, origin);
      const { key, review } = validateFeedback(await readJSON(request));
      const stored = await env.BUCKET.get(key);
      if (stored) {
        const existing = await stored.json();
        return response({ review: await repeatReview(existing, review) }, 200, origin);
      }
      await rateLimit(request, env, review.id);
      const saved = await env.BUCKET.put(key, JSON.stringify(review), {
        onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: 'application/json' },
      });
      if (!saved) {
        const existing = await (await env.BUCKET.get(key)).json();
        return response({ review: await repeatReview(existing, review) }, 200, origin);
      }
      return response({ review }, 201, origin);
    } catch (error) {
      return response({ error: error instanceof FeedbackError || error instanceof AdminAuthError ? error.message : 'Feedback is temporarily unavailable. Your draft is still here; try again.', field: error.field || '' }, error.status || 503, origin);
    }
  },
}; }

export default createWorker();
