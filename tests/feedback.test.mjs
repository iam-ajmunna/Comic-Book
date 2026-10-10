import test from 'node:test';
import assert from 'node:assert/strict';
import { initComments, makeReviewUrl } from '../src/comments.js';

// Exercise the actual feed owner without adding a DOM package or posting reviews.
class Node {
  constructor() { this.children = []; this.events = new Map(); this.attributes = new Map(); this.value = ''; this.scrollLeft = 0; this.clientWidth = 280; }
  get scrollWidth() { return this.children.length * 316; }
  get firstElementChild() { return this.children[0]; }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  replaceWith(node) { const i = this.parent?.children.indexOf(this); if (i >= 0) this.parent.children[i] = node; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name); }
  addEventListener(name, fn) { this.events.set(name, fn); }
  dispatch(name, event = {}) { this.events.get(name)?.(event); }
  focus() { this.focused = true; }
  getBoundingClientRect() { return { width: 300 }; }
  scrollBy({ left }) { this.scrollLeft = Math.max(0, Math.min(this.scrollWidth - this.clientWidth, this.scrollLeft + left)); this.dispatch('scroll'); }
}

test('feedback keeps completion gating, safe profile cards, native scroll bounds and per-book drafts', async (t) => {
  const ids = ['comment', 'comment-error', 'comment-count', 'comment-form', 'comment-status', 'comment-list', 'comments-status', 'refresh-comments', 'more-comments', 'feedback-previous', 'feedback-next'];
  const nodes = Object.fromEntries(ids.map((id) => [id, new Node()]));
  const originals = new Map();
  const install = (name, value) => { originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { value, configurable: true, writable: true }); };
  t.after(() => { for (const [key, value] of originals) value ? Object.defineProperty(globalThis, key, value) : delete globalThis[key]; });
  install('document', { getElementById: (id) => nodes[id], createElement: () => new Node(), createTextNode: (text) => ({ textContent: text }) });
  install('Image', Node);
  install('matchMedia', () => ({ matches: false }));
  install('ResizeObserver', class { constructor(fn) { this.fn = fn; } observe() { this.fn(); } });
  let complete = false, book = { id: 'multiversal-love', edition: 'v1' }, requests = 0;
  const body = new URL(makeReviewUrl('<script>Still plain text</script>', book)).searchParams.get('body');
  const review = { id: 1, number: 1, state: 'open', title: '[Book review] A thought', body, created_at: '2026-10-10T12:00:00Z', user: { login: '<Reader>', avatar_url: 'https://avatars.githubusercontent.com/u/1' } };
  install('fetch', async () => { requests++; return new Response(JSON.stringify([review, { ...review, id: 2, number: 2, user: { login: 'Another reader', avatar_url: 'https://other.example/tracker' } }])); });
  const feed = initComments(() => complete, () => book); feed.reset();
  await feed.refresh();
  assert.equal(requests, 0, 'locked feedback must not fetch spoilers');
  nodes.comment.value = 'A draft that stays with this book.';
  nodes['comment-form'].dispatch('submit', { preventDefault() {} });
  assert.equal(nodes['comment-status'].children.length, 0, 'locked submission must not open a handoff');
  complete = true; await feed.refresh();
  const track = nodes['comment-list'];
  assert.equal(track.children.length, 2);
  assert.equal(track.children[0].children[1].textContent, '<script>Still plain text</script>');
  const header = track.children[0].children[0];
  assert.equal(header.children[1].children[0].textContent, '<Reader>');
  assert.equal(new URL(header.children[0].src).hostname, 'avatars.githubusercontent.com');
  assert.equal(header.children[0].referrerPolicy, 'no-referrer');
  assert.equal(track.children[1].children[0].children[0].textContent, 'A', 'unapproved avatar hosts use initials');
  assert.equal(nodes['feedback-previous'].disabled, true);
  assert.equal(nodes['feedback-next'].disabled, false);
  nodes['feedback-next'].dispatch('click');
  assert.equal(nodes['feedback-previous'].disabled, false);
  nodes['feedback-next'].dispatch('click');
  assert.equal(nodes['feedback-next'].disabled, true, 'last scroll position disables next');
  book = { id: 'other-book', edition: 'v1' }; feed.reset();
  assert.equal(nodes.comment.value, '');
  nodes.comment.value = 'Second book draft';
  book = { id: 'multiversal-love', edition: 'v1' }; feed.reset();
  assert.equal(nodes.comment.value, 'A draft that stays with this book.');
  assert.equal(track.children.length, 0);
  assert.equal(nodes['feedback-next'].disabled, true);
});

test('a stale review response cannot enter a newly selected book', async (t) => {
  const nodes = new Map();
  const node = (id) => { if (!nodes.has(id)) nodes.set(id, new Node()); return nodes.get(id); };
  const originals = new Map();
  for (const [key, value] of Object.entries({ document: { getElementById: node, createElement: () => new Node() }, matchMedia: () => ({ matches: false }), ResizeObserver: class { observe() {} } })) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key)); Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  let release;
  originals.set('fetch', Object.getOwnPropertyDescriptor(globalThis, 'fetch'));
  globalThis.fetch = () => new Promise((resolve) => { release = resolve; });
  t.after(() => { for (const [key, value] of originals) value ? Object.defineProperty(globalThis, key, value) : delete globalThis[key]; });
  let book = { id: 'multiversal-love', edition: 'v1' };
  const feed = initComments(() => true, () => book); feed.reset();
  const pending = feed.refresh();
  book = { id: 'new-book', edition: 'v1' }; feed.reset();
  release(new Response(JSON.stringify([]))); await pending;
  assert.equal(node('comment-list').children.length, 0);
  assert.equal(node('comments-status').textContent, '');
  assert.equal(node('refresh-comments').disabled, false);
});
