// A single fullscreen owner for the existing button and F shortcut. An absent
// API gets an announced, escapable layout fallback; a denied request stays honest.
export function initFullscreen(view, button, icon, { announce, reveal, document: doc = document } = {}) {
  let busy = false;
  const nativeElement = () => doc.fullscreenElement || doc.webkitFullscreenElement;
  const expanded = () => view.classList.contains('cx-pseudo-fs');
  function sync() {
    const active = nativeElement() === view || expanded();
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
    button.title = `${active ? 'Exit' : 'Enter'} fullscreen (F)`;
    icon.setAttribute('href', active ? '#icon-collapse' : '#icon-expand');
    reveal();
  }
  function setExpanded(active) {
    view.classList.toggle('cx-pseudo-fs', active);
    doc.body.classList.toggle('cx-pseudo-fs', active);
    if (active) view.scrollTop = 0;
  }
  async function exit() {
    setExpanded(false);
    if (nativeElement()) {
      const close = doc.exitFullscreen || doc.webkitExitFullscreen;
      if (close) await close.call(doc);
    }
    sync();
  }
  async function toggle() {
    if (busy) return;
    busy = true;
    try {
      if (nativeElement() || expanded()) await exit();
      else {
        const open = view.requestFullscreen || view.webkitRequestFullscreen;
        if (open) await open.call(view);
        else {
          setExpanded(true);
          announce('Expanded reading view. Use the fullscreen button or Escape to return.');
        }
      }
    } catch { announce('Fullscreen couldn’t start. Keep reading here or try again.'); }
    finally { busy = false; sync(); }
  }
  button.addEventListener('click', toggle);
  doc.addEventListener('fullscreenchange', sync);
  doc.addEventListener('webkitfullscreenchange', sync);
  for (const type of ['fullscreenerror', 'webkitfullscreenerror']) {
    doc.addEventListener(type, () => announce('Fullscreen is unavailable. You can keep reading here.'));
  }
  doc.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !expanded() || event.isComposing || doc.querySelector('dialog[open]')) return;
    event.preventDefault(); setExpanded(false); sync(); button.focus({ preventScroll: true });
  });
  sync();
  return { toggle, exit };
}
