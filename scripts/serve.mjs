import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
const root = resolve(process.argv.includes("--dist") ? "dist" : "."),
  types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
  };
createServer((req, res) => {
  try {
    const path = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      ),
      file = resolve(
        root,
        `.${path.endsWith("/") ? path + "index.html" : path}`,
      );
    if (!file.startsWith(root + sep) || !statSync(file).isFile())
      throw new Error();
    res.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Page not found");
  }
}).listen(Number(process.env.PORT || 4173), "0.0.0.0", () =>
  console.log(`Reader: http://localhost:${Number(process.env.PORT || 4173)}`),
);
