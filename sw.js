/* Network-first app shell; cached artwork; explicit, bounded offline download. */
const RELEASE = '20261009-2';
const PREFIX = `comic-room-${RELEASE}`;
const SHELL = `${PREFIX}-shell`, ART = `${PREFIX}-art`;
const root = new URL('./', self.location.href);
const shell = ['.', 'index.html', 'comics.json', 'assets/favicon.svg',
  'src/tokens.css', 'src/styles.css', 'src/app.js', 'src/state.js',
  'src/catalog.js', 'src/ui.js', 'src/images.js', 'src/lighting.js', 'src/flip.js',
  'src/zoom.js', 'src/offline.js', 'src/comments.js', 'src/config.js', 'src/ambience.js'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(shell.map((path) => new URL(path.startsWith('src/') ? `${path}?v=${RELEASE}` : path, root).href))));
});
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('comic-room-') && ![SHELL, ART].includes(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (event) => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return;
  const artwork = /\.(webp|avif|png|jpe?g)$/i.test(url.pathname);
  event.respondWith((async () => {
    const cache = await caches.open(artwork ? ART : SHELL);
    if (artwork) { const hit = await cache.match(request); if (hit) return hit; }
    try {
      const response = await fetch(request);
      if (response.ok) {
        try { await cache.put(request, response.clone()); } catch { /* Storage pressure must not block online reading. */ }
      }
      return response;
    } catch (error) {
      const hit = await cache.match(request);
      if (hit) return hit;
      if (request.mode === 'navigate') {
        const page = await cache.match(new URL('index.html', root).href);
        if (page) return page;
      }
      throw error;
    }
  })());
});
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'DOWNLOAD_BOOK' || !event.ports[0]) return;
  const port = event.ports[0];
  event.waitUntil((async () => {
    try {
      const paths = event.data.assets;
      if (!Array.isArray(paths) || paths.length > 10000) throw new Error('Invalid offline book request.');
      const urls = paths.map((path) => {
        const url = new URL(path, root);
        if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) throw new Error('Only this site’s assets can be downloaded.');
        return url.href;
      });
      let cursor = 0, completed = 0;
      const art = await caches.open(ART), metadata = await caches.open(SHELL);
      await Promise.all(Array.from({ length: 3 }, async () => {
        while (cursor < urls.length) {
          const url = urls[cursor++], cache = /\.(webp|avif|png|jpe?g)$/i.test(url) ? art : metadata;
          if (!(await cache.match(url))) {
            const response = await fetch(url, { cache: 'reload', signal: AbortSignal.timeout(20000) });
            if (!response.ok) throw new Error('An asset couldn’t download. Reconnect and retry.');
            await cache.put(url, response);
          }
          port.postMessage({ completed: ++completed, total: urls.length });
        }
      }));
      port.postMessage({ done: true });
    } catch (error) { port.postMessage({ error: error.message || 'Offline storage is unavailable. Retry or free browser storage.' }); }
    finally { port.close(); }
  })());
});
