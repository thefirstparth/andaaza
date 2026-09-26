// Local preview: serves public/ and the one API route. Without Blob credentials the API reads the markets directly,
// so the first load takes a few seconds. Open http://localhost:3000 (the poster is /poster).
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const PORT = Number(process.env.PORT || 3000);
createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname === "/api/consensus") {
      const { GET } = await import("../api/consensus.js");
      const r = await GET(new Request(url));
      res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer())); return;
    }
    const path = url.pathname === "/" || url.pathname === "/poster" ? "/index.html" : normalize(url.pathname).replace(/^(\.\.[/\\])+/, "");
    const body = await readFile(join("public", path));
    res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream" }); res.end(body);
  } catch (e) { res.writeHead(404); res.end("not found"); }
}).listen(PORT, () => console.log(`andaaza: http://localhost:${PORT}`));
