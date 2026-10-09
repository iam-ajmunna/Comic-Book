// Only current + next spread are warmed. Bounded decoded references prevent a
// complete book from occupying hundreds of megabytes on phones.
export class PageImages {
  constructor() { this.cache = new Map(); }
  load(page, displayWidth, priority = "auto") {
    const large = displayWidth * Math.min(window.devicePixelRatio || 1, 3) > 800;
    const urls = [...new Set((large ? [page.src, page.small] : [page.small, page.src]).filter(Boolean))];
    const key = urls.join("|");
    if (this.cache.has(key)) {
      const value = this.cache.get(key);
      this.cache.delete(key); this.cache.set(key, value);
      return value.promise;
    }
    const controller = new AbortController();
    const promise = (async () => {
      for (const url of urls) {
        try { return await this.decode(url, priority, controller.signal); }
        catch (error) { if (controller.signal.aborted) throw error; /* Try the alternate artwork variant. */ }
      }
      throw new Error("This page couldn’t open. Check your connection and retry.");
    })();
    const entry = { promise, controller };
    this.cache.set(key, entry);
    promise.catch(() => { if (this.cache.get(key) === entry) this.cache.delete(key); });
    while (this.cache.size > 8) {
      const oldest = this.cache.keys().next().value;
      this.cache.get(oldest).controller.abort(); this.cache.delete(oldest);
    }
    return promise;
  }
  decode(url, priority, signal) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.fetchPriority = priority;
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true; clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        image.onload = image.onerror = null;
        error ? reject(error) : resolve(image);
      };
      const timer = setTimeout(() => { image.src = ""; finish(new Error("Image timed out")); }, 15000);
      const abort = () => { image.src = ''; finish(new Error('Image request canceled')); };
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) { abort(); return; }
      image.onerror = () => finish(new Error("Image unavailable"));
      image.onload = async () => {
        try { await image.decode(); if (!image.naturalWidth) throw new Error(); finish(); }
        catch { finish(new Error("Image decode failed")); }
      };
      image.src = url;
    });
  }
  clear() { for (const entry of this.cache.values()) entry.controller.abort(); this.cache.clear(); }
}
