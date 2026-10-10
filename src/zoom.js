import { $, openDialog, el } from "./ui.js?v=20261010-6";
export function initZoom(images) {
  const dialog = $("zoom-dialog"), viewport = $("zoom-viewport");
  let image, scale = 1, x = 0, y = 0, baseWidth = 0, baseHeight = 0;
  const pointers = new Map();
  let lastDistance = 0;
  function paint() {
    if (!image) return;
    const box = viewport.getBoundingClientRect();
    baseWidth = Math.min(box.width - 16, (box.height - 16) * image.naturalWidth / image.naturalHeight);
    baseHeight = baseWidth * image.naturalHeight / image.naturalWidth;
    const maxX = Math.max(0, (baseWidth * scale - box.width) / 2), maxY = Math.max(0, (baseHeight * scale - box.height) / 2);
    x = Math.max(-maxX, Math.min(maxX, x)); y = Math.max(-maxY, Math.min(maxY, y));
    image.style.width = `${baseWidth}px`; image.style.height = `${baseHeight}px`;
    image.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
    $("zoom-level").textContent = `${Math.round(scale * 100)}%`;
    $("zoom-out").disabled = scale <= 1; $("zoom-in").disabled = scale >= 4;
    viewport.classList.toggle("can-pan", scale > 1);
  }
  function change(value) { scale = Math.max(1, Math.min(4, value)); paint(); }
  $("zoom-in").addEventListener("click", () => change(scale + 0.5));
  $("zoom-out").addEventListener("click", () => change(scale - 0.5));
  $("zoom-reset").addEventListener("click", () => { x = y = 0; change(1); });
  viewport.addEventListener("pointerdown", (event) => {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    viewport.setPointerCapture(event.pointerId);
    if (pointers.size === 2) { const p = [...pointers.values()]; lastDistance = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); }
  });
  viewport.addEventListener("pointermove", (event) => {
    const old = pointers.get(event.pointerId); if (!old) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const p = [...pointers.values()], distance = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      if (lastDistance) change(scale * distance / lastDistance);
      lastDistance = distance;
    } else if (scale > 1) { x += event.clientX - old.x; y += event.clientY - old.y; paint(); }
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) viewport.addEventListener(name, (event) => { pointers.delete(event.pointerId); lastDistance = 0; });
  viewport.addEventListener("wheel", (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault(); change(scale - event.deltaY * 0.01);
  }, { passive: false });
  dialog.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (["+", "=", "-", "0", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      if (event.key === "+" || event.key === "=") change(scale + 0.5);
      else if (event.key === "-") change(scale - 0.5);
      else if (event.key === "0") { x = y = 0; change(1); }
      else { x += event.key === "ArrowLeft" ? 60 : event.key === "ArrowRight" ? -60 : 0; y += event.key === "ArrowUp" ? 60 : event.key === "ArrowDown" ? -60 : 0; paint(); }
    }
  });
  new ResizeObserver(paint).observe(viewport);
  dialog.addEventListener("close", () => { pointers.clear(); viewport.replaceChildren(); image = null; });
  return async (page, comic, trigger) => {
    scale = 1; x = y = 0;
    $("zoom-title").textContent = `${page.label} · ${page.title}`;
    viewport.replaceChildren(el("p", "", "Opening page detail…"));
    openDialog(dialog, trigger);
    try {
      const loaded = await images.load(page, comic.width);
      if (!dialog.open || $("zoom-title").textContent !== `${page.label} · ${page.title}`) return;
      image = loaded.cloneNode(); image.alt = `${page.label}: ${page.title}`;
      viewport.replaceChildren(image); paint();
    } catch (error) { if (dialog.open) viewport.replaceChildren(el("p", "error-text", error.message)); }
  };
}
