import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const workerPath = resolve(projectRoot, "dist/server/index.js");
const manifestPath = resolve(projectRoot, "dist/.openai/hosting.json");

const [source, manifest] = await Promise.all([
  readFile(workerPath, "utf8"),
  readFile(manifestPath, "utf8"),
]);
JSON.parse(manifest);

// A data URL forces ESM parsing even though the generated output has no package.json.
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const workerModule = await import(moduleUrl);
assert.equal(
  typeof workerModule.default?.fetch,
  "function",
  `${pathToFileURL(workerPath)} must export default.fetch`,
);

const request = new Request('https://feedback.example/admin', { headers: {
  'oai-authenticated-user-id': 'artifact-check-owner',
  'oai-authenticated-user-email': 'artifact-check@example.invalid',
} });
const page = await workerModule.default.fetch(request, { ADMIN_EMAIL: 'artifact-check@example.invalid' });
assert.equal(page.status, 200);
assert.match(await page.text(), /id="admin-list"/);
const style = await workerModule.default.fetch(new Request('https://feedback.example/admin/styles.css'), {});
assert.match(await style.text(), /admin-main/);

console.log("Artifact is valid ESM and exports default.fetch");
