// Serves dist/web with the exact headers vercel.json sets, on port 5173.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
const root = process.argv[2]!;
const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
const headers: Record<string, string> = {};
for (const h of vercel.headers[0].headers) headers[h.key] = h.value;
const dist = join(root, "dist/web");
Bun.serve({
  port: 5173,
  hostname: "localhost",
  fetch(req) {
    const path = new URL(req.url).pathname;
    if (path.startsWith("/api/")) return Response.json({ error: "not mocked" }, { status: 404, headers });
    const file = join(dist, path);
    const target = path !== "/" && existsSync(file) ? file : join(dist, "index.html");
    return new Response(Bun.file(target), { headers });
  },
});
console.log("serving on http://localhost:5173");
