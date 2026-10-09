export const PAGE_COUNT = 80,
  EDITION = "revised-80-v1",
  STORAGE_KEY = `multiversal-love:${EDITION}`;
export const validPage = (n) => Number.isInteger(n) && n >= 0 && n < PAGE_COUNT;
export const mergeVisited = (...arrays) =>
  [...new Set(arrays.flat().filter(validPage))].sort((a, b) => a - b);
export const normalizeState = (value) => ({
  page: validPage(value?.page) ? value.page : 0,
  visited: mergeVisited(Array.isArray(value?.visited) ? value.visited : []),
});
export const isComplete = (visited) =>
  mergeVisited(visited).length === PAGE_COUNT;
export function nextUnread(visited) {
  const seen = new Set(visited);
  for (let i = 0; i < PAGE_COUNT; i++) if (!seen.has(i)) return i;
  return null;
}
export function spreadForPage(n) {
  if (n === 0 || n === 79) return [n];
  const first = n % 2 ? n : n - 1;
  return [first, first + 1];
}
export function turnPage(n, dir, single = false) {
  const pages = single ? [n] : spreadForPage(n);
  return Math.max(0, Math.min(79, dir > 0 ? pages.at(-1) + 1 : pages[0] - 1));
}
export function pageFromHash(hash) {
  const m = /^#page=(\d{1,2})$/.exec(hash);
  return m && validPage(+m[1]) ? +m[1] : null;
}
export function readSaved(storage) {
  try {
    return normalizeState(JSON.parse(storage.getItem(STORAGE_KEY)));
  } catch {
    return normalizeState(null);
  }
}
export function persist(storage, state) {
  try {
    const previous = readSaved(storage);
    const merged = {
      page: state.page,
      visited: mergeVisited(previous.visited, state.visited),
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return { ok: true, state: merged };
  } catch {
    return { ok: false, state };
  }
}
