import { cpSync, mkdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import "./design-tokens.mjs";
const root = fileURLToPath(new URL("../", import.meta.url)),
  book = JSON.parse(readFileSync(`${root}assets/book.json`, "utf8"));
if (book.pages.length !== 80) throw new Error("Expected 80 approved pages.");
for (let i = 0; i < 80; i++)
  for (const name of [
    `pages/${String(i).padStart(3, "0")}.webp`,
    `pages/${String(i).padStart(3, "0")}-small.webp`,
    `thumbs/${String(i).padStart(3, "0")}.webp`,
  ])
    if (!existsSync(`${root}assets/${name}`))
      throw new Error(`Missing ${name}`);
rmSync(`${root}dist`, { recursive: true, force: true });
mkdirSync(`${root}dist`);
for (const path of ["index.html", "src", "assets", ".nojekyll"])
  cpSync(`${root}${path}`, `${root}dist/${path}`, { recursive: true });
console.log("Built complete 80-page reading room.");
