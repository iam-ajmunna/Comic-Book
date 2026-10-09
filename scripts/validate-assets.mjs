import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateCatalog } from "../src/catalog.js";
const root = fileURLToPath(new URL("../", import.meta.url));
const comics = validateCatalog(JSON.parse(readFileSync(`${root}comics.json`, "utf8")));
const checked = new Set();
for (const comic of comics) {
  if (comic.transcript && !/^https?:/.test(comic.transcript)) {
    const text = JSON.parse(readFileSync(`${root}${comic.transcript}`, "utf8"));
    if (text.pages?.length !== comic.pages.length) throw new Error(`Transcript count mismatch: ${comic.id}`);
  }
  for (const url of [comic.cover, ...comic.pages.flatMap((p) => [p.src, p.small, p.thumbnail])].filter(Boolean)) {
    if (checked.has(url) || /^https?:/.test(url)) continue;
    if (url.startsWith("/") || url.split("/").includes("..")) throw new Error(`Use a project-relative asset path: ${url}`);
    checked.add(url);
    const data = readFileSync(`${root}${url}`);
    if (data.length < 24) throw new Error(`Empty or truncated image: ${url}`);
    if (url.endsWith(".webp") && (data.toString("ascii", 0, 4) !== "RIFF" || data.toString("ascii", 8, 12) !== "WEBP" || data.readUInt32LE(4) + 8 !== data.length))
      throw new Error(`Invalid WebP container: ${url}`);
  }
}
console.log(`Validated ${comics.length} comic(s), ${checked.size} local image assets.`);
