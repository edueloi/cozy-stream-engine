import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "0.0.0.0";

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientDir = resolve(__dirname, "../dist/client");

const { default: handler } = await import("../dist/server/server.js");

const MIME_TYPES = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function serveStaticFile(req, res) {
  const urlPath = req.url.split("?")[0];
  if (urlPath.includes("..")) return false;
  const filePath = join(clientDir, decodeURIComponent(urlPath));
  if (!filePath.startsWith(clientDir)) return false;
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return false;

  const ext = extname(filePath);
  res.setHeader("Content-Type", MIME_TYPES[ext] ?? "application/octet-stream");
  if (urlPath.startsWith("/assets/")) {
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  }
  createReadStream(filePath).pipe(res);
  return true;
}

function toWebRequest(req) {
  const url = `http://${req.headers.host}${req.url}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) headers.set(key, value.join(", "));
    else headers.set(key, value);
  }
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? req : undefined,
    duplex: hasBody ? "half" : undefined,
  });
}

async function sendWebResponse(res, webResponse) {
  res.statusCode = webResponse.status;
  for (const [key, value] of webResponse.headers) {
    res.setHeader(key, value);
  }
  if (!webResponse.body) {
    res.end();
    return;
  }
  const reader = webResponse.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(value);
  }
  res.end();
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" || req.method === "HEAD") {
      if (serveStaticFile(req, res)) return;
    }
    const webResponse = await handler.fetch(toWebRequest(req), process.env, {});
    await sendWebResponse(res, webResponse);
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.end("Internal Server Error");
  }
});

server.listen(port, host, () => {
  console.log(`cozy-stream-engine listening on http://${host}:${port}`);
});
