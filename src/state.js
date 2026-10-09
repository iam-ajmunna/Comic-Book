export const PAGE_COUNT = 80,
  EDITION = "revised-80-v1",
  STORAGE_KEY = `multiversal-love:${EDITION}`;
// The legacy default remains solely for old progress and API compatibility.
// The reader always passes its catalog page count.
export const validPage = (n, count = PAGE_COUNT) => Number.isInteger(n) && n >= 0 && n < count;
export const mergeVisited = (...arrays) =>
  [...new Set(arrays.flat().filter((n) => validPage(n)))].sort((a, b) => a - b);
export const visitedFor = (count, ...arrays) => [...new Set(arrays.flat().filter((n) => validPage(n, count)))].sort((a, b) => a - b);
export const normalizeState = (value, count = PAGE_COUNT) => ({
  page: validPage(value?.page, count) ? value.page : 0,
  visited: visitedFor(count, Array.isArray(value?.visited) ? value.visited : []),
});
export const isComplete = (visited, count = PAGE_COUNT) =>
  visitedFor(count, visited).length === count;
export function nextUnread(visited, count = PAGE_COUNT) {
  const seen = new Set(visited);
  for (let i = 0; i < count; i++) if (!seen.has(i)) return i;
  return null;
}
export function spreadForPage(n, count = PAGE_COUNT) {
  if (!validPage(n, count)) return [];
  if (n === 0) return [n];
  const first = n % 2 ? n : n - 1;
  return [first, first + 1].filter((id) => id < count);
}
export function turnPage(n, dir, single = false, count = PAGE_COUNT) {
  const pages = single ? [n] : spreadForPage(n, count);
  return Math.max(0, Math.min(count - 1, dir > 0 ? pages.at(-1) + 1 : pages[0] - 1));
}
export function pageFromHash(hash, count = PAGE_COUNT) {
  const m = /^#page=(\d+)$/.exec(hash);
  return m && validPage(+m[1], count) ? +m[1] : null;
}
export const storageKey = (comic) => comic ? `comic-reader:${comic.id}:${comic.edition}` : STORAGE_KEY;
export function readSaved(storage, comic) {
  const count = comic?.pages.length ?? PAGE_COUNT;
  try {
    const raw = storage.getItem(storageKey(comic)) ?? (comic?.id === "multiversal-love" ? storage.getItem(STORAGE_KEY) : null);
    return normalizeState(JSON.parse(raw), count);
  } catch {
    return normalizeState(null, count);
  }
}
export function persist(storage, state, comic) {
  try {
    const previous = readSaved(storage, comic);
    const merged = {
      page: state.page,
      visited: visitedFor(comic?.pages.length ?? PAGE_COUNT, previous.visited, state.visited),
    };
    storage.setItem(storageKey(comic), JSON.stringify(merged));
    return { ok: true, state: merged };
  } catch {
    return { ok: false, state };
  }
}
