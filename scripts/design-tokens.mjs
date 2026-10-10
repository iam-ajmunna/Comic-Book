import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url)),
  front = readFileSync(`${root}DESIGN.md`, "utf8").split("---")[1];
const section = (name) =>
  front.match(
    new RegExp(`^${name}:\\n([\\s\\S]*?)(?=^\\S|(?![\\s\\S]))`, "m"),
  )?.[1] || "";
const lines = [];
for (const [name, prefix] of [
  ["colors", "color"],
  ["rounded", "radius"],
  ["spacing", "space"],
])
  for (const m of section(name).matchAll(/^  ([\w-]+): "([^"]+)"$/gm))
    lines.push(`  --${prefix}-${m[1]}: ${m[2]};`);
for (const m of section("typography").matchAll(
  /^  ([\w-]+):\n    fontFamily: "([^"]+)"$/gm,
))
  lines.push(`  --font-${m[1]}: ${m[2]};`);
if (lines.length !== 20) throw new Error("Design token mapping is incomplete.");
writeFileSync(
  `${root}src/tokens.css`,
  `/* Generated from DESIGN.md. Do not edit directly. */\n:root {\n${lines.join("\n")}\n}\n`,
);
