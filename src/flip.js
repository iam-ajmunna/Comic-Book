import { el } from "./ui.js?v=20261010-6";
export function cancelFlip(stage) {
  for (const leaf of stage.querySelectorAll(".flip-leaf")) {
    for (const animation of leaf.getAnimations()) animation.cancel();
    leaf.remove();
  }
}
export async function flipSpread(stage, previous, { forward, rtl, single }) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !stage.animate) return;
  const physicalRight = forward !== rtl;
  const old = previous[physicalRight ? previous.length - 1 : 0];
  if (!old?.querySelector("img")) return;
  const current = [...stage.querySelectorAll(":scope > .page-shell")];
  const back = current[physicalRight ? 0 : current.length - 1];
  const leaf = el("div", "flip-leaf");
  leaf.setAttribute("aria-hidden", "true"); leaf.inert = true;
  leaf.style.left = single ? "0" : physicalRight ? "50%" : "0";
  leaf.style.width = single ? "100%" : "50%";
  leaf.style.transformOrigin = physicalRight ? "left center" : "right center";
  for (const [className, source] of [["flip-front", old], ["flip-back", back]]) {
    const face = el("div", className);
    const image = source?.querySelector("img")?.cloneNode();
    if (image) { image.alt = ""; face.append(image); }
    face.append(el("div", "flip-shade")); leaf.append(face);
  }
  stage.append(leaf);
  const sign = physicalRight ? -1 : 1;
  const animation = leaf.animate(single
    ? [{ transform: "rotateY(0deg)", opacity: 1 }, { transform: `rotateY(${sign * 85}deg)`, opacity: 0 }]
    : [{ transform: "rotateY(0deg)" }, { transform: `rotateY(${sign * 180}deg)` }],
    { duration: single ? 420 : 680, easing: "cubic-bezier(.28,.05,.24,1)", fill: "forwards" });
  const shades = [...leaf.querySelectorAll(".flip-shade")].map((shade) => shade.animate(
    [{ opacity: 0 }, { opacity: 0.46, offset: 0.48 }, { opacity: 0 }], { duration: single ? 420 : 680, fill: "forwards" }));
  try { await animation.finished; } catch { /* A newer navigation cancels the leaf. */ }
  finally { shades.forEach((a) => a.cancel()); leaf.remove(); }
}
