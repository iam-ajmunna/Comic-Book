import { cpSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import "./design-tokens.mjs";
import "./validate-assets.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
rmSync(`${root}dist`, { recursive: true, force: true });
mkdirSync(`${root}dist`);
for (const path of ["index.html", "src", "assets", "comics.json", ".nojekyll"])
  cpSync(`${root}${path}`, `${root}dist/${path}`, { recursive: true });
console.log("Built data-driven comic reading room.");
