import test from 'node:test';
import assert from 'node:assert/strict';
import { initComments } from '../src/comments.js';
import { createFeedbackClient, validateDraft, validPhotoData, FeedbackError } from '../src/feedback-api.js';
import { validatePhotoFile } from '../src/feedback-photo.js';

class Node {
  constructor() { this.children = []; this.events = new Map(); this.attributes = new Map(); this.style = {}; this.value = ''; this.scrollLeft = 0; this.clientWidth = 280; this.textContent = ''; }
  get scrollWidth() { return this.children.length * 316; }
  get firstElementChild() { return this.children[0]; }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  replaceWith(node) { const i = this.parent?.children.indexOf(this); if (i >= 0) this.parent.children[i] = node; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(name, fn) { this.events.set(name, fn); }
  dispatch(name, event = {}) { return this.events.get(name)?.(event); }
  focus() { this.focused = true; }
  getBoundingClientRect() { return { width: 300 }; }
  scrollBy({ left }) { this.scrollLeft = Math.max(0, Math.min(this.scrollWidth - this.clientWidth, this.scrollLeft + left)); this.dispatch('scroll'); }
}
function setup(t) {
  const nodes = new Map(), originals = new Map();
  const $ = id => { if (!nodes.has(id)) nodes.set(id, new Node()); return nodes.get(id); };
  const install = (key, value) => { if (!originals.has(key)) originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true }); };
  install('document', { getElementById: $, createElement: () => new Node() });
  install('Image', Node); install('matchMedia', () => ({ matches: false }));
  install('ResizeObserver', class { constructor(fn) { this.fn = fn; } observe() { this.fn(); } });
  t.after(() => { for (const [key, value] of originals) value ? Object.defineProperty(globalThis, key, value) : delete globalThis[key]; });
  return { $, install, submit: () => $('comment-form').dispatch('submit', { preventDefault() {} }) };
}
const jpeg = 'data:image/jpeg;base64,/9j/wAARCAABAAEDAREAAhEAAxEA/9k=';
const review = (extra = {}) => ({ id: 'stored-review', name: '<Reader>', text: '<script>Still plain text</script>', photo: null, created_at: '2026-10-10T12:00:00Z', ...extra });

test('draft validation requires a name, allows unicode and keeps pictures optional', () => {
  assert.throws(() => validateDraft('   ', 'Great story'), e => e.field === 'name');
  assert.throws(() => validateDraft('A'.repeat(81), 'Great story'), e => e.field === 'name');
  assert.throws(() => validateDraft('Reader', '  '), e => e.field === 'text');
  assert.deepEqual(validateDraft('  রুহি  ', '  Love & loss <script>just text</script>  '), { name: 'রুহি', text: 'Love & loss <script>just text</script>' });
  assert.equal(validPhotoData(jpeg), true);
  assert.equal(validPhotoData('https://other.example/tracking.jpg'), false);
  assert.equal(validPhotoData('data:image/svg+xml;base64,PHN2Zz4='), false);
  assert.doesNotThrow(() => validatePhotoFile({ type: 'image/png', size: 1000 }));
  for (const file of [{ type: 'image/svg+xml', size: 1000 }, { type: 'image/jpeg', size: 6 * 1024 * 1024 }, { type: 'image/webp', size: 0 }])
    assert.throws(() => validatePhotoFile(file), e => e.field === 'photo');
});

test('feedback is gated, safe as text, scrollable, and drafts are scoped to book and edition', async t => {
  const { $, submit } = setup(t);
  let complete = false, book = { id: 'multiversal-love', edition: 'v1' }, reads = 0, writes = 0;
  const client = { list: async () => { reads++; return { reviews: [review({ photo: jpeg }), review({ id: 'other', name: 'Another reader', photo: 'https://tracking.example/picture' })], cursor: null }; }, post: async () => { writes++; } };
  const feed = initComments(() => complete, () => book, { client }); feed.reset();
  $('comment').value = 'A draft that stays with this book.';
  await feed.refresh(); await submit();
  assert.equal(reads, 0); assert.equal(writes, 0, 'locked feedback must not fetch or submit spoilers');
  complete = true; await feed.refresh();
  const track = $('comment-list');
  assert.equal(track.children.length, 2); assert.equal(track.children[0].children[1].textContent, '<script>Still plain text</script>');
  assert.equal(track.children[0].children[0].children[1].children[0].textContent, '<Reader>');
  assert.equal(track.children[0].children[0].children[0].src, jpeg);
  assert.equal(track.children[1].children[0].children[0].textContent, 'A');
  assert.equal($('feedback-previous').disabled, true); assert.equal($('feedback-next').disabled, false);
  $('feedback-next').dispatch('click'); assert.equal($('feedback-previous').disabled, false);
  $('feedback-next').dispatch('click'); assert.equal($('feedback-next').disabled, true);
  book = { ...book, edition: 'v2' }; feed.reset(); assert.equal($('comment').value, '');
  $('comment').value = 'Second edition draft';
  book = { ...book, edition: 'v1' }; feed.reset();
  assert.equal($('comment').value, 'A draft that stays with this book.'); assert.equal(track.children.length, 0);
});

test('inline submission focuses missing name, preserves failed drafts and retries the same ID', async t => {
  const { $, submit } = setup(t);
  let failed = true, writes = [], stored = [];
  const client = {
    list: async () => ({ reviews: stored, cursor: null }),
    post: async (_book, value) => { writes.push(value); if (failed) throw new FeedbackError('Connection interrupted. Try again.'); const result = review({ ...value }); stored = [result]; return result; },
  };
  const feed = initComments(() => true, () => ({ id: 'book', edition: 'v1' }), { client }); feed.reset();
  $('comment').value = 'I loved the friendship.';
  await submit(); assert.equal(writes.length, 0); assert.equal($('reader-name').focused, true); assert.equal($('reader-name').getAttribute('aria-invalid'), 'true');
  $('reader-name').value = '  Lily  '; $('reader-name').dispatch('input');
  await submit(); assert.equal(writes.length, 1); assert.equal(writes[0].name, 'Lily'); assert.equal(writes[0].photo, null);
  assert.equal($('comment').value, 'I loved the friendship.'); assert.equal($('post-feedback').disabled, false);
  assert.equal($('comment-list').children.length, 0, 'a failed submission is never represented as posted');
  failed = false; await submit();
  assert.equal(writes[1].id, writes[0].id, 'unchanged retries use the same idempotency key');
  assert.equal($('comment').value, ''); assert.match($('comment-status').textContent, /posted/);
  assert.equal($('comment-list').children.length, 1);
});

test('picture preparation supports previews, removal and honest errors without uploading originals', async t => {
  const { $, submit } = setup(t);
  let fail = false, writes = 0;
  const client = { list: async () => ({ reviews: [], cursor: null }), post: async () => { writes++; } };
  const feed = initComments(() => true, () => ({ id: 'book', edition: 'v1' }), { client, preparePicture: async () => { if (fail) throw new Error('Choose a JPG, PNG or WebP picture.'); return jpeg; } }); feed.reset();
  $('reader-photo').files = [{ name: 'me.png', size: 2048 }]; await $('reader-photo').dispatch('change');
  assert.equal($('photo-preview').src, jpeg); assert.equal($('photo-selection').hidden, false);
  $('remove-photo').dispatch('click'); assert.equal($('photo-selection').hidden, true);
  fail = true; await $('reader-photo').dispatch('change');
  assert.equal($('photo-error').hidden, false); assert.equal($('photo-selection').hidden, false, 'an invalid picture can still be removed');
  $('reader-name').value = 'Reader'; $('comment').value = 'A thought about the story.'; await submit();
  assert.equal(writes, 0, 'an invalid selected picture blocks posting until removed or replaced');
  $('remove-photo').dispatch('click'); assert.equal($('photo-error').hidden, true);
});

test('duplicate clicks and stale responses cannot affect a newly selected comic', async t => {
  const { $, submit } = setup(t);
  let book = { id: 'first', edition: 'v1' }, releaseRead, releasePost, writes = 0;
  const client = { list: () => new Promise(resolve => { releaseRead = resolve; }), post: (_book, value) => { writes++; return new Promise(resolve => { releasePost = () => resolve(review(value)); }); } };
  const feed = initComments(() => true, () => book, { client }); feed.reset();
  const reading = feed.refresh(); $('reader-name').value = 'Reader'; $('comment').value = 'First book draft';
  const posting = submit(); await submit(); assert.equal(writes, 1); assert.equal($('comment-fields').disabled, true);
  book = { id: 'second', edition: 'v1' }; feed.reset();
  releaseRead({ reviews: [review()], cursor: null }); releasePost(); await reading; await posting;
  assert.equal($('comment-list').children.length, 0); assert.equal($('comment-status').textContent, ''); assert.equal($('reader-name').value, '');
  assert.equal($('comment-fields').disabled, false);
});

test('public API requests omit credentials and preserve server validation errors', async t => {
  const { install } = setup(t);
  let seen = [];
  install('fetch', async (url, options) => { seen.push({ url, options }); return new Response(JSON.stringify({ error: 'Enter your name.', field: 'name' }), { status: 422 }); });
  const client = createFeedbackClient('https://feedback.example/api/feedback');
  await assert.rejects(client.post({ id: 'book', edition: 'v1' }, { id: 'same-id', name: '', text: 'Hello', photo: null }), e => e.field === 'name');
  assert.equal(seen[0].options.credentials, 'omit'); assert.equal(seen[0].options.method, 'POST');
  assert.equal(seen[0].options.headers.Authorization, undefined);
  const body = JSON.parse(seen[0].options.body); assert.equal(body.book, 'book'); assert.equal(body.edition, 'v1');
  install('fetch', async (url, options) => { seen.push({ url, options }); return new Response(JSON.stringify({ reviews: [], cursor: 'next' })); });
  assert.equal((await client.list({ id: 'book', edition: 'v1' }, 'current')).cursor, 'next');
  assert.equal(new URL(seen.at(-1).url).searchParams.get('cursor'), 'current');
});
