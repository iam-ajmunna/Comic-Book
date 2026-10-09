export const $ = (id) => document.getElementById(id);
export function el(tag, className = "", text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
let noticeTimer;
export function announce(text) {
  clearTimeout(noticeTimer);
  $("reader-status").textContent = text;
  noticeTimer = setTimeout(() => { $("reader-status").textContent = ""; }, 6500);
}
const dialogFocus = new WeakMap();
export function openDialog(dialog, trigger = document.activeElement) {
  dialogFocus.set(dialog, trigger);
  if (!dialog.open) dialog.showModal();
  document.dispatchEvent(new Event("reader-overlay"));
}
export function initDialogs() {
  for (const dialog of document.querySelectorAll("dialog")) {
    dialog.addEventListener("close", () => {
      const previous = dialogFocus.get(dialog);
      (previous?.isConnected ? previous : $("reader")).focus({ preventScroll: true });
      document.dispatchEvent(new Event("reader-overlay"));
    });
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
  }
  for (const button of document.querySelectorAll("[data-close]"))
    button.addEventListener("click", () => $(button.dataset.close).close());
}
export function idleControls(reader) {
  let timer;
  const reveal = () => {
    reader.dataset.controls = "visible";
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (reader.contains(document.activeElement) && document.activeElement.closest("button,input,a,textarea,summary")) return;
      if (document.querySelector("dialog[open]") || reader.classList.contains("text-mode")) return;
      reader.dataset.controls = "hidden";
    }, 2800);
  };
  reader.addEventListener("pointermove", reveal, { passive: true });
  reader.addEventListener("pointerdown", reveal, { passive: true });
  reader.addEventListener("focusin", reveal);
  document.addEventListener("keydown", reveal);
  document.addEventListener("reader-overlay", reveal);
  return reveal;
}
export function readPreferences(storage) {
  try {
    const value = JSON.parse(storage?.getItem("comic-reader:preferences"));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
export function savePreferences(storage, value) {
  try { storage?.setItem("comic-reader:preferences", JSON.stringify(value)); } catch { /* Preferences are optional. */ }
}
