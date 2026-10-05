import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
http.createServer(async (req, res) => {
  const file = path.resolve(root, "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try { const data = await readFile(file); res.writeHead(200, { "Content-Type": types[path.extname(file)] || "text/plain" }); res.end(data); }
  catch { res.writeHead(404).end("Not found"); }
}).listen(4173, "127.0.0.1", () => console.log("Browser tests: http://127.0.0.1:4173/tests/browser.html"));
