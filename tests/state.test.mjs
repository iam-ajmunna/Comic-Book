import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeState,
  mergeVisited,
  isComplete,
  nextUnread,
  spreadForPage,
  turnPage,
  pageFromHash,
  readSaved,
  persist,
  STORAGE_KEY,
} from "../src/state.js";
import { SCENE_CUES, cueForPage } from "../src/ambience.js";
test("only all 80 unique valid pages unlock comments", () => {
  assert.equal(isComplete([0, 79]), false);
  assert.equal(isComplete(Array(80).fill(79)), false);
  assert.equal(isComplete(Array.from({ length: 80 }, (_, i) => i)), true);
  assert.equal(isComplete(Array.from({ length: 80 }, (_, i) => i + 1)), false);
});
test("corrupt or unavailable storage leaves the reader usable", () => {
  assert.deepEqual(
    normalizeState({ visited: [0, 2, 2, 79, -1, 80, "3", null], page: 800 }),
    { visited: [0, 2, 79], page: 0 },
  );
  assert.deepEqual(readSaved({ getItem: () => "{broken" }), {
    page: 0,
    visited: [],
  });
  assert.deepEqual(readSaved(null), { page: 0, visited: [] });
  assert.equal(persist(null, { page: 1, visited: [0] }).ok, false);
});
test("independent tabs merge progress", () => {
  const data = new Map([
      [STORAGE_KEY, JSON.stringify({ page: 4, visited: [0, 3, 4] })],
    ]),
    storage = {
      getItem: (k) => data.get(k),
      setItem: (k, v) => data.set(k, v),
    };
  assert.deepEqual(persist(storage, { page: 2, visited: [0, 1, 2] }).state, {
    page: 2,
    visited: [0, 1, 2, 3, 4],
  });
  assert.deepEqual(mergeVisited([0, 1], [1, 2]), [0, 1, 2]);
});
test("navigation covers every page once and preserves comic/prose pairing", () => {
  const ids = [];
  for (let p = 0; ; p = turnPage(p, 1)) {
    ids.push(...spreadForPage(p));
    if (p === 79) break;
  }
  assert.deepEqual(
    ids,
    Array.from({ length: 80 }, (_, i) => i),
  );
  assert.deepEqual(spreadForPage(2), [1, 2]);
  assert.equal(turnPage(0, -1), 0);
  assert.equal(turnPage(79, 1), 79);
  assert.equal(turnPage(3, -1), 2);
  assert.equal(turnPage(3, 1, true), 4);
  assert.equal(nextUnread([0, 1, 79]), 2);
});
test("deep links validate page range without granting progress", () => {
  assert.equal(pageFromHash("#page=79"), 79);
  for (const hash of ["#page=80", "#page=-1", "#discussion"])
    assert.equal(pageFromHash(hash), null);
});
test("every scene has a cue and loss/final quiet beats stay silent", () => {
  assert.equal(SCENE_CUES.length, 41);
  for (let p = 0; p < 80; p++)
    assert.ok(
      ["soft", "memory", "wonder", "cinematic", "silence"].includes(
        cueForPage(p),
      ),
    );
  for (const p of [
    11, 12, 17, 18, 19, 20, 55, 56, 57, 58, 71, 72, 75, 76, 77, 78,
  ])
    assert.equal(cueForPage(p), "silence");
  assert.equal(cueForPage(45), "cinematic");
  assert.equal(cueForPage(79), "memory");
});
