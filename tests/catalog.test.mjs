import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCatalog, assetUrl } from '../src/catalog.js';
import { spreadForPage, turnPage, isComplete, normalizeState, readSaved, persist, storageKey, STORAGE_KEY } from '../src/state.js';
import { paletteFromPixels, NEUTRAL_PALETTE } from '../src/lighting.js';

const catalog = JSON.parse(readFileSync(new URL('../comics.json', import.meta.url), 'utf8'));
const comics = validateCatalog(catalog);
test('the approved comic and its transcript remain complete', () => {
  const transcript = JSON.parse(readFileSync(new URL('../assets/book.json', import.meta.url), 'utf8'));
  assert.equal(comics[0].pages.length, transcript.pages.length);
  assert.equal(comics[0].pages[0].label, 'Cover');
  assert.ok(comics[0].pages.every((page, index) => page.id === index && page.src && page.thumbnail));
});
test('catalog rejects unsafe URLs, duplicate ids, and invalid direction', () => {
  assert.throws(() => assetUrl('javascript:alert(1)'));
  assert.throws(() => assetUrl('data:text/html,hello'));
  assert.throws(() => validateCatalog({ ...catalog, comics: [catalog.comics[0], catalog.comics[0]] }));
  assert.throws(() => validateCatalog({ ...catalog, comics: [{ ...catalog.comics[0], readingDirection: 'down' }] }));
  assert.equal(assetUrl('https://example.org/page.avif'), 'https://example.org/page.avif');
});
test('cover and terminal spreads work for arbitrary and one-page comics', () => {
  for (const count of [1, 2, 3, 4, 7, 81, 302]) {
    const opened = [];
    for (let page = 0;;) {
      opened.push(...spreadForPage(page, count));
      const next = turnPage(page, 1, false, count);
      if (next === page) break;
      page = next;
    }
    assert.deepEqual(opened, Array.from({ length: count }, (_, i) => i));
    assert.deepEqual(spreadForPage(0, count), [0]);
    assert.equal(turnPage(0, -1, false, count), 0);
    assert.equal(turnPage(count - 1, 1, false, count), count - 1);
  }
  assert.deepEqual(spreadForPage(5, 6), [5]);
  assert.deepEqual(spreadForPage(5, 7), [5, 6]);
});
test('large books require every unique valid page for completion', () => {
  const all = Array.from({ length: 302 }, (_, i) => i);
  assert.equal(isComplete(all, 302), true);
  assert.equal(isComplete(all.slice(1), 302), false);
  assert.equal(isComplete(Array(302).fill(301), 302), false);
  assert.deepEqual(normalizeState({ page: 301, visited: [301, 301, 302, -1] }, 302), { page: 301, visited: [301] });
});
test('legacy progress migrates without losing opened pages; books stay isolated', () => {
  const data = new Map([[STORAGE_KEY, JSON.stringify({ page: 7, visited: [0, 1, 7] })]]);
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const first = comics[0], second = { ...first, id: 'another-world', edition: 'v1', pages: first.pages.slice(0, 3) };
  assert.equal(readSaved(storage, first).page, 7);
  const saved = persist(storage, { page: 8, visited: [8] }, first);
  assert.deepEqual(saved.state.visited, [0, 1, 7, 8]);
  assert.ok(data.has(storageKey(first)));
  assert.deepEqual(readSaved(storage, second), { page: 0, visited: [] });
  persist(storage, { page: 1, visited: [0, 1] }, second);
  assert.deepEqual(readSaved(storage, first).visited, [0, 1, 7, 8]);
});
test('ambient sampling ignores ink and paper and preserves saturated artwork hue', () => {
  const flat = new Uint8ClampedArray([0, 0, 0, 255, 248, 243, 233, 255, 255, 255, 255, 255]);
  assert.deepEqual(paletteFromPixels(flat), NEUTRAL_PALETTE);
  const redArt = new Uint8ClampedArray([...flat, 220, 40, 65, 255, 210, 35, 55, 255]);
  const colors = paletteFromPixels(redArt);
  assert.ok(colors[0].startsWith('hsl(35') || colors[0].startsWith('hsl(34'));
  assert.ok(!colors.includes(NEUTRAL_PALETTE[0]));
});
