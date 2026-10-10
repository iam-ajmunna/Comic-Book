import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import worker, { validateFeedback } from '../feedback-service/worker/index.js';

// Implements the R2 operations the real service uses, including conditional
// writes. Integration tests never publish invented reader feedback.
export class MemoryBucket {
  data = new Map(); serial = 0;
  async get(key) {
    const value = this.data.get(key);
    return value ? { key, etag: value.etag, json: async () => JSON.parse(value.body) } : null;
  }
  async put(key, body, options = {}) {
    const old = this.data.get(key), condition = options.onlyIf;
    if (condition?.etagDoesNotMatch === '*' && old) return null;
    if (condition?.etagMatches && old?.etag !== condition.etagMatches) return null;
    const etag = String(++this.serial); this.data.set(key, { body, etag }); return { key, etag };
  }
  async list({ prefix, limit = 12, cursor = '' }) {
    const keys = [...this.data.keys()].filter(k => k.startsWith(prefix) && k > cursor).sort();
    const page = keys.slice(0, limit), truncated = keys.length > limit;
    return { objects: page.map(key => ({ key })), truncated, cursor: truncated ? page.at(-1) : undefined };
  }
}

const origin = 'https://iam-ajmunna.github.io';
export const draft = (extra = {}) => ({ id: `${Date.now()}-${randomUUID()}`, name: 'A reader', text: 'That ending stayed with me.', photo: null, book: 'multiversal-love', edition: 'revised-80-v1', ...extra });
const environment = () => ({ BUCKET: new MemoryBucket(), RATE_LIMIT_SECRET: 'isolated-test-only-salt' });
const post = (value, ip = '192.0.2.1') => new Request('https://feedback.example/api/feedback', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify(value) });
const list = (params = '') => new Request(`https://feedback.example/api/feedback?book=multiversal-love&edition=revised-80-v1${params}`, { headers: { Origin: origin } });

test('public service requires a name and feedback, while pictures are optional', async () => {
  const env = environment();
  const invalid = await worker.fetch(post(draft({ name: '   ' })), env);
  assert.equal(invalid.status, 422); assert.equal((await invalid.json()).field, 'name');
  assert.equal(env.BUCKET.data.size, 0);
  const value = draft({ name: '  মুনা  ', text: '<script>Just text</script>' });
  const result = await worker.fetch(post(value), env);
  assert.equal(result.status, 201);
  assert.equal(result.headers.get('access-control-allow-origin'), origin);
  const review = (await result.json()).review;
  assert.equal(review.name, 'মুনা'); assert.equal(review.text, '<script>Just text</script>'); assert.equal(review.photo, null);
  const secondReader = await worker.fetch(list(), env);
  assert.equal((await secondReader.json()).reviews[0].id, value.id, 'a different reader sees the confirmed shared record');
});

test('retrying the same anonymous post does not create duplicates or replace content', async () => {
  const env = environment(), value = draft();
  assert.equal((await worker.fetch(post(value), env)).status, 201);
  const repeated = await worker.fetch(post(value), env);
  assert.equal(repeated.status, 200);
  assert.equal((await repeated.json()).review.id, value.id);
  assert.equal((await (await worker.fetch(list(), env)).json()).reviews.length, 1);
  assert.equal((await worker.fetch(post({ ...value, text: 'Changed using the same identifier.' }), env)).status, 409);
  assert.equal((await worker.fetch(post(draft()), env)).status, 429);
});

test('service rejects unsafe pictures, oversized requests, invalid books and foreign origins', async () => {
  const env = environment();
  for (const photo of ['https://tracking.example/photo.jpg', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/jpeg;base64,YWJjZA=='])
    assert.throws(() => validateFeedback(draft({ photo })), e => e.field === 'photo');
  assert.equal((await worker.fetch(post(draft({ book: '../limits' })), env)).status, 422);
  const huge = post(draft({ text: 'x'.repeat(120_000) }));
  assert.equal((await worker.fetch(huge, env)).status, 413);
  const foreign = new Request(list().url, { headers: { Origin: 'https://other.example' } });
  assert.equal((await worker.fetch(foreign, env)).status, 403);
  const preflight = await worker.fetch(new Request(list().url, { method: 'OPTIONS', headers: { Origin: origin } }), env);
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.equal((await worker.fetch(new Request(list().url, { method: 'DELETE' }), env)).status, 405);
});

test('shared feed paginates newest first and separates comic editions', async () => {
  const env = environment(), now = Date.now();
  for (let i = 0; i < 14; i++) {
    const value = draft({ id: `${now - i * 1000}-${randomUUID()}`, name: `Reader ${i}` });
    assert.equal((await worker.fetch(post(value, `192.0.2.${i + 1}`), env)).status, 201);
  }
  const first = await (await worker.fetch(list(), env)).json();
  assert.equal(first.reviews.length, 12); assert.equal(first.reviews[0].name, 'Reader 0'); assert.ok(first.cursor);
  const next = await (await worker.fetch(list(`&cursor=${encodeURIComponent(first.cursor)}`), env)).json();
  assert.equal(next.reviews.length, 2); assert.equal(next.cursor, null);
  const other = new Request('https://feedback.example/api/feedback?book=multiversal-love&edition=v2');
  assert.equal((await (await worker.fetch(other, env)).json()).reviews.length, 0);
});

test('missing storage or network identity fails honestly without saving feedback', async () => {
  const env = environment();
  assert.equal((await worker.fetch(post(draft()), {})).status, 503);
  const missing = post(draft()); missing.headers.delete('cf-connecting-ip');
  assert.equal((await worker.fetch(missing, env)).status, 503);
  assert.equal(env.BUCKET.data.size, 0);
});

// Synthetic one-pixel JPEG fixture; no reader or creator picture is uploaded.
const tinyJPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDHooor0jgP/9k=';
test('optional pictures are stored with feedback and oversized frames are rejected', async () => {
  const env = environment(), value = draft({ photo: tinyJPEG });
  const result = await worker.fetch(post(value), env);
  assert.equal(result.status, 201);
  assert.equal((await result.json()).review.photo, tinyJPEG);
  const publicFeed = await (await worker.fetch(list(), env)).json();
  assert.equal(publicFeed.reviews[0].photo, tinyJPEG);
  const bytes = Buffer.from(tinyJPEG.split(',')[1], 'base64');
  const frame = bytes.indexOf(Buffer.from([255, 192]));
  assert.ok(frame > 0);
  bytes.writeUInt16BE(4096, frame + 7);
  assert.throws(() => validateFeedback(draft({ photo: 'data:image/jpeg;base64,' + bytes.toString('base64') })), e => e.field === 'photo');
});
