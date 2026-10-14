import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as state from '../src/state.js';

// Run the actual app coordinator with a minimal DOM and inert media adapters.
// The browser checklist covers geometry; these checks protect book ownership,
// routing, saved progress and search across a catalog with multiple books.
class Node {
  constructor(tag = 'div') {
    this.tag = tag; this.children = []; this.events = new Map(); this.attrs = new Map();
    this.dataset = {}; this.style = {}; this.hidden = false; this.value = '';
    this.clientWidth = 1000; this.clientHeight = 650; this.isConnected = true;
    const classes = new Set();
    this.classList = {
      contains: key => classes.has(key), remove: key => classes.delete(key),
      toggle: (key, on) => on ? classes.add(key) : classes.delete(key),
    };
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  querySelectorAll() { return []; }
  setAttribute(key, value) { this.attrs.set(key, value); }
  getAttribute(key) { return this.attrs.get(key); }
  removeAttribute(key) { this.attrs.delete(key); }
  addEventListener(key, fn) { this.events.set(key, fn); }
  dispatch(key, event = {}) { return this.events.get(key)?.({ preventDefault() {}, ...event }); }
  focus() { this.focused = true; }
  scrollIntoView(options) { this.scrollOptions = options; }
}
const catalog = ['first', 'second'].map(id => ({
  id, edition: 'v1', title: `${id} comic`, author: 'AJ', genre: 'Romance', issue: '1',
  description: `${id} synopsis`, cover: `${id}/cover.webp`, width: 1600, height: 2400,
  readingDirection: 'ltr', pages: [0, 1].map(page => ({ id: page, src: `${id}/${page}.webp`, label: String(page), title: `${id} page ${page}` })),
}));
const settle = () => new Promise(resolve => setImmediate(resolve));
async function app(hash = '') {
  const nodes = new Map(), loads = [], feeds = [], selection = [];
  const $ = id => { if (!nodes.has(id)) nodes.set(id, new Node()); return nodes.get(id); };
  $('reading-view').hidden = true; $('feedback-link').hidden = true;
  const libraryLink = new Node('a'), events = new Map(), location = { hash };
  const saved = new Map([[state.storageKey(catalog[0]), JSON.stringify({ page: 1, visited: [0, 1] })]]);
  const storage = { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value) };
  const window = {
    localStorage: storage, scrollY: 0, devicePixelRatio: 1,
    addEventListener: (type, handler) => events.set(type, handler),
    scrollTo({ top }) { this.scrollY = top; },
  };
  const sound = () => {}; sound.setActive = active => { sound.active = active; };
  const document = {
    body: new Node(), visibilityState: 'visible', title: '',
    addEventListener() {}, querySelector: () => null,
    querySelectorAll: selector => selector === 'a[href="#library"]' ? [libraryLink] : [],
  };
  const context = {
    ...state, $, document, window, location, URLSearchParams,
    history: Object.fromEntries(['pushState', 'replaceState'].map(key => [key, (a, b, value) => { location.hash = value; }])),
    el: (tag, className, textContent) => Object.assign(new Node(tag), { className, textContent }),
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    Image: Node, IntersectionObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} },
    validateCatalog: value => value, fetchJson: async () => catalog,
    PageImages: class { load(page) { loads.push(page.src); return new Promise(() => {}); } clear() {} },
    AmbientLight: class {},
    initComments: (canComment, getBook) => ({
      reset: () => selection.push(getBook()?.id || null),
      refresh: () => { if (canComment()) feeds.push(getBook().id); },
    }),
    initFullscreen: () => ({ exit: async () => {} }), initAmbience: () => sound,
    initOffline: () => ({ available: false }), initZoom: () => () => {},
    idleControls: () => () => {}, readPreferences: () => ({}), savePreferences() {},
    initDialogs() {}, attachSwipe() {}, cancelFlip() {}, announce() {},
  };
  const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
  runInNewContext(source, context);
  await settle();
  return {
    $, loads, feeds, selection, window, location, sound, saved,
    clickCover: async index => { $('library-shelf').children[index].children[0].dispatch('click'); await settle(); },
    library: async () => { await libraryLink.dispatch('click'); await settle(); },
    route: async hash => { location.hash = hash; events.get('hashchange')(); await settle(); },
  };
}

test('the library stays unselected even with saved reading progress', async () => {
  const ui = await app();
  assert.equal(ui.$('reading-view').hidden, true);
  assert.equal(ui.$('feedback-link').hidden, true);
  assert.equal(ui.$('library-shelf').children.length, 2);
  assert.equal(ui.loads.length, 0, 'browsing must not open/preload comic pages');
  assert.equal(ui.feeds.length, 0, 'browsing must not load a book’s feedback');
  assert.match(ui.$('library-shelf').children[0].children[0].getAttribute('aria-label'), /Continue reading/);
});

test('cover selection scopes the reader and feedback; Library clears both and keeps progress', async () => {
  const ui = await app();
  await ui.clickCover(0);
  assert.equal(ui.$('reading-view').hidden, false);
  assert.equal(ui.$('book-summary').textContent, 'first synopsis');
  assert.equal(ui.$('leave-feedback').disabled, false);
  assert.deepEqual(ui.feeds, ['first']);
  assert.match(ui.$('feedback-link').href, /read=first&page=1&section=feedback/);
  await ui.library();
  assert.equal(ui.$('reading-view').hidden, true);
  assert.equal(ui.$('feedback-link').hidden, true);
  assert.equal(ui.selection.at(-1), null);
  assert.equal(ui.sound.active, false);
  assert.equal(JSON.parse(ui.saved.get(state.storageKey(catalog[0]))).page, 1);
  await ui.clickCover(1);
  assert.equal(ui.$('book-summary').textContent, 'second synopsis');
  assert.equal(ui.$('leave-feedback').disabled, true, 'completion must not leak between books');
  assert.deepEqual(ui.feeds, ['first']);
});

test('no-results search closes the selected book and retains the search control and scroll', async () => {
  const ui = await app(); await ui.clickCover(0);
  ui.window.scrollY = 180;
  ui.$('library-search').value = 'not on this shelf';
  ui.$('library-search').focus(); ui.$('library-search').dispatch('input');
  assert.equal(ui.$('reading-view').hidden, true);
  assert.equal(ui.$('library-search').hidden, false);
  assert.equal(ui.$('library-search').focused, true);
  assert.equal(ui.window.scrollY, 180);
  assert.equal(ui.$('library-search').scrollOptions.block, 'nearest');
  assert.equal(ui.$('library-status').textContent, '0 books found');
  assert.equal(ui.$('library-shelf').children[0].children[0].textContent, 'No books match that search.');
  ui.$('clear-search').dispatch('click');
  assert.equal(ui.$('library-search').value, '');
  assert.equal(ui.$('library-shelf').children.length, 2);
  assert.equal(ui.$('reading-view').hidden, true, 'clearing must not select the first result');
});

test('IME search waits for composition and history restores the catalog query', async () => {
  const ui = await app();
  ui.$('library-search').dispatch('compositionstart');
  ui.$('library-search').value = 'second'; ui.$('library-search').dispatch('input');
  assert.equal(ui.$('library-shelf').children.length, 2);
  ui.$('library-search').dispatch('compositionend');
  assert.equal(ui.$('library-shelf').children.length, 1);
  await ui.clickCover(0); await ui.library();
  assert.equal(ui.$('library-search').value, 'second');
  await ui.route('#library?q=first');
  assert.equal(ui.$('library-search').value, 'first');
  assert.equal(ui.$('reading-view').hidden, true);
});

test('explicit feedback links restore the right book; unscoped or missing-book links stay in the library', async () => {
  const scoped = await app('#read=first&page=1&section=feedback');
  assert.equal(scoped.$('reading-view').hidden, false);
  assert.equal(scoped.$('feedback').scrollOptions.behavior, 'smooth');
  for (const hash of ['#feedback', '#reader', '#read=missing&page=0']) {
    const ui = await app(hash);
    assert.equal(ui.$('reading-view').hidden, true);
    assert.equal(ui.loads.length, 0);
    assert.match(ui.$('library-status').textContent, /[Cc]hoose a book/);
  }
});
