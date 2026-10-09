const IMAGE_PROTOCOLS = new Set(["http:", "https:"]);
export function assetUrl(value) {
  if (typeof value !== "string" || !value.trim()) throw new Error("An asset URL is missing.");
  const url = new URL(value, "https://comic.invalid/");
  if (!IMAGE_PROTOCOLS.has(url.protocol)) throw new Error("Assets must use HTTP or relative paths.");
  return value;
}
export function validateCatalog(data) {
  if (data?.version !== 1 || !Array.isArray(data.comics) || !data.comics.length)
    throw new Error("The comic catalog is empty or unsupported.");
  const ids = new Set();
  return data.comics.map((comic) => {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(comic.id) || ids.has(comic.id))
      throw new Error("Every comic needs a unique lowercase id.");
    ids.add(comic.id);
    if (!comic.title?.trim() || !comic.edition?.trim() || !Array.isArray(comic.pages) || !comic.pages.length)
      throw new Error(`Incomplete metadata for ${comic.id}.`);
    if (!Number.isFinite(comic.width) || !Number.isFinite(comic.height) || comic.width <= 0 || comic.height <= 0)
      throw new Error(`Invalid page dimensions for ${comic.id}.`);
    if (!["ltr", "rtl"].includes(comic.readingDirection)) throw new Error("Reading direction must be ltr or rtl.");
    return { ...comic, cover: assetUrl(comic.cover), transcript: comic.transcript ? assetUrl(comic.transcript) : null,
      pages: comic.pages.map((page, id) => ({ ...page, id, src: assetUrl(page.src),
        small: page.small ? assetUrl(page.small) : null,
        thumbnail: page.thumbnail ? assetUrl(page.thumbnail) : page.small || page.src,
        label: page.label || (id ? String(id) : "Cover"), title: page.title || comic.title,
        cue: ["soft", "memory", "wonder", "cinematic", "silence"].includes(page.cue) ? page.cue : "soft" })) };
  });
}
export async function fetchJson(url, timeout = 15000, signal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, timeout);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: "no-cache" });
    if (!response.ok) throw new Error(`Could not load ${url}.`);
    return await response.json();
  } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
}
