// Small, dependency-free public feedback API. BUCKET is a private R2 binding;
// only validated feedback is exposed, never raw bucket keys or rate records.
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
  let photo = null;
  if (data.photo != null) {
    // The client redraws selected PNG/JPEG/WebP files onto a small canvas. This
    // accepts only bounded JPEG bytes, not arbitrary URLs, SVG or HTML uploads.
    if (typeof data.photo !== 'string' || data.photo.length > MAX_PHOTO * 1.4 ||
        !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(data.photo))
      throw new FeedbackError('Choose a valid picture or remove it to post.', 422, 'photo');
    let bytes;
    try { bytes = atob(data.photo.slice('data:image/jpeg;base64,'.length)); } catch {
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
    photo = data.photo;
  }
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

function sameReview(a, b) { return a.name === b.name && a.text === b.text && a.photo === b.photo; }

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const incoming = request.headers.get('origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || 'https://iam-ajmunna.github.io').split(',').map(v => v.trim());
    const origin = allowed.includes(incoming) ? incoming : '';
    if (incoming && !origin) return response({ error: 'This reader origin is not allowed.' }, 403);
    if (request.method === 'OPTIONS') return response(null, 204, origin);
    try {
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
        }))).filter(Boolean);
        return response({ reviews, cursor: list.truncated ? list.cursor : null }, 200, origin);
      }
      if (request.method !== 'POST') return response({ error: 'Use GET or POST.' }, 405, origin);
      const { key, review } = validateFeedback(await readJSON(request));
      const stored = await env.BUCKET.get(key);
      if (stored) {
        const existing = await stored.json();
        if (!sameReview(existing, review)) throw new FeedbackError('This submission was already used. Edit your feedback and try again.', 409);
        return response({ review: existing }, 200, origin);
      }
      await rateLimit(request, env, review.id);
      const saved = await env.BUCKET.put(key, JSON.stringify(review), {
        onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: 'application/json' },
      });
      if (!saved) {
        const existing = await (await env.BUCKET.get(key)).json();
        if (!sameReview(existing, review)) throw new FeedbackError('This submission was already used. Edit your feedback and try again.', 409);
        return response({ review: existing }, 200, origin);
      }
      return response({ review }, 201, origin);
    } catch (error) {
      return response({ error: error instanceof FeedbackError ? error.message : 'Feedback is temporarily unavailable. Your draft is still here; try again.', field: error.field || '' }, error.status || 503, origin);
    }
  },
};
