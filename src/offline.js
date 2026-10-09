export function initOffline() {
  const available = 'serviceWorker' in navigator && window.isSecureContext;
  const registration = available ? navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }) : null;
  registration?.catch(() => {});
  return {
    available,
    async download(comic, report) {
      if (!available) { report('Offline reading needs HTTPS or localhost.'); return; }
      if (!navigator.onLine) { report('Connect to the internet to download the book.'); return; }
      report('Preparing your offline copy…');
      const assets = [...new Set(['comics.json', comic.cover, comic.transcript,
        ...comic.pages.flatMap((page) => [page.small || page.src, page.thumbnail])].filter(Boolean))];
      const sameOrigin = assets.every((path) => new URL(path, location.href).origin === location.origin);
      if (!sameOrigin) { report('Offline downloads support books hosted with this site.'); return; }
      let timer;
      try {
        const reg = await registration;
        const worker = reg.active || reg.installing || reg.waiting;
        if (!worker) throw new Error('Offline reading isn’t ready yet. Retry in a moment.');
        await new Promise((resolve, reject) => {
          const channel = new MessageChannel();
          timer = setTimeout(() => { channel.port1.close(); reject(new Error('Download took too long. Reconnect and retry.')); }, 240000);
          channel.port1.onmessage = ({ data }) => {
            if (data.error) { channel.port1.close(); reject(new Error(data.error)); }
            else if (data.done) { channel.port1.close(); resolve(); }
            else report(`Downloading ${data.completed} / ${data.total} assets…`);
          };
          worker.postMessage({ type: 'DOWNLOAD_BOOK', assets }, [channel.port2]);
        });
        report('Downloaded. This book and its text are available offline.');
      } catch (error) { report(error.message || 'Download failed. Check your connection and retry.'); }
      finally { clearTimeout(timer); }
    },
  };
}
