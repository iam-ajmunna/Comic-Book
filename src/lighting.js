export const NEUTRAL_PALETTE = ["hsl(221 24% 27%)", "hsl(265 18% 25%)"];
export function paletteFromPixels(pixels) {
  const bins = Array.from({ length: 24 }, () => ({ weight: 0, hue: 0, saturation: 0 }));
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 200) continue;
    const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]].map((v) => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
    const light = (max + min) / 2;
    const sat = delta ? delta / (1 - Math.abs(2 * light - 1)) : 0;
    // Exclude near-black outlines, grey ink, and flat cream/white paper.
    if (light < 0.09 || sat < 0.13 || (light > 0.78 && (sat < 0.3 || delta < 0.12))) continue;
    let hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
    hue = (hue * 60 + 360) % 360;
    const bin = bins[Math.floor(hue / 15)], weight = sat * (0.35 + light);
    bin.weight += weight; bin.hue += hue * weight; bin.saturation += sat * weight;
  }
  const ranked = bins.filter((b) => b.weight > 0).sort((a, b) => b.weight - a.weight);
  if (!ranked.length) return [...NEUTRAL_PALETTE];
  const first = ranked[0], firstHue = first.hue / first.weight;
  const second = ranked.find((b) => {
    const distance = Math.abs(b.hue / b.weight - firstHue);
    return Math.min(distance, 360 - distance) >= 30;
  }) || first;
  return [first, second].map((b) => `hsl(${Math.round(b.hue / b.weight)} ${Math.round(Math.min(88, Math.max(52, b.saturation / b.weight * 125)))}% 43%)`);
}
export class AmbientLight {
  constructor(root) {
    this.layers = [...root.querySelectorAll(".ambient-layer")];
    this.active = 0;
    this.cache = new Map();
  }
  async sample(image) {
    const key = image.currentSrc || image.src;
    if (this.cache.has(key)) return this.cache.get(key);
    const work = (async () => {
      let bitmap;
      try {
        let source = image;
        if (new URL(key, location.href).origin !== location.origin) {
          const response = await fetch(key, { mode: "cors", signal: AbortSignal.timeout(4000) });
          if (!response.ok) throw new Error();
          bitmap = await createImageBitmap(await response.blob()); source = bitmap;
        }
        const canvas = document.createElement("canvas");
        canvas.width = 32; canvas.height = 48;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(source, 0, 0, 32, 48);
        return paletteFromPixels(context.getImageData(0, 0, 32, 48).data);
      } catch { return [...NEUTRAL_PALETTE]; }
      finally { bitmap?.close(); }
    })();
    this.cache.set(key, work);
    while (this.cache.size > 160) this.cache.delete(this.cache.keys().next().value);
    return work;
  }
  show(palettes) {
    const left = palettes[0] || NEUTRAL_PALETTE, right = palettes.at(-1) || left;
    const next = 1 - this.active, layer = this.layers[next];
    layer.style.background = `radial-gradient(ellipse at 15% 48%, ${left[0]}, transparent 64%), radial-gradient(ellipse at 85% 48%, ${right[0]}, transparent 64%), radial-gradient(ellipse at 50% 90%, ${right[1]}, transparent 72%)`;
    layer.classList.add("active"); this.layers[this.active].classList.remove("active");
    this.active = next;
  }
}
