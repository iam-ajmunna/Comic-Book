import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const root = 'https://reader.example/Comic-Book/';
const key = (request) => typeof request === 'string' ? request : request.url;

// Exercise real worker handlers with in-memory browser caches and HTTP responses.
function worker(network) {
  const handlers = new Map(), stores = new Map(), calls = [];
  const cache = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const entries = stores.get(name);
    return {
      match: async (request) => entries.get(key(request))?.clone(),
      put: async (request, response) => entries.set(key(request), response.clone()),
      addAll: async (requests) => {
        for (const request of requests) entries.set(key(request), new Response('shell'));
      },
    };
  };
  const caches = { open: async (name) => cache(name), keys: async () => [...stores.keys()], delete: async (name) => stores.delete(name) };
  runInNewContext(source, {
    self: { location: { href: `${root}sw.js` }, addEventListener: (type, handler) => handlers.set(type, handler), clients: { claim: async () => {} }, skipWaiting: async () => {} },
    caches, URL, Request, AbortSignal,
    fetch: async (request, options) => { calls.push({ request, options }); return network(request, options); },
  });
  return {
    stores, calls, cache,
    async request(path, mode = 'cors') {
      let result;
      handlers.get('fetch')({ request: { url: new URL(path, root).href, method: 'GET', mode }, respondWith: (value) => { result = value; } });
      return result;
    },
    async activate() {
      let result; handlers.get('activate')({ waitUntil: (value) => { result = value; } }); await result;
    },
  };
}

test('normal navigation and metadata bypass stale HTTP-cache responses', async () => {
  const reader = worker((request, options) => new Response(options.cache === 'no-cache' ? 'latest' : 'stale'));
  assert.equal(await (await reader.request('index.html', 'navigate')).text(), 'latest');
  assert.equal(await (await reader.request('comics.json')).text(), 'latest');
});

test('versioned modules and artwork remain usable without network requests', async () => {
  const reader = worker(() => { throw new Error('offline'); });
  await reader.cache('comic-room-20261009-2-shell').put(`${root}src/app.js?v=older`, new Response('older coherent module'));
  await reader.cache('comic-room-20261009-2-art').put(`${root}assets/pages/001.webp`, new Response('artwork'));
  assert.equal(await (await reader.request('src/app.js?v=older')).text(), 'older coherent module');
  assert.equal(await (await reader.request('assets/pages/001.webp')).text(), 'artwork');
  assert.equal(reader.calls.length, 0);
});

test('activating a UI update preserves downloaded books and transcripts', async () => {
  const reader = worker(() => { throw new Error('offline'); });
  await reader.cache('comic-room-20261009-2-shell').put(`${root}assets/book.json`, new Response('saved transcript'));
  await reader.cache('comic-room-20261009-2-art').put(`${root}assets/pages/001.webp`, new Response('saved artwork'));
  reader.cache('comic-room-obsolete-shell');
  await reader.activate();
  assert.equal(reader.stores.has('comic-room-obsolete-shell'), false);
  assert.equal(await (await reader.request('assets/book.json')).text(), 'saved transcript');
  assert.equal(await (await reader.request('assets/pages/001.webp')).text(), 'saved artwork');
});
