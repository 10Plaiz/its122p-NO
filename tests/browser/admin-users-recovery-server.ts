import { createServer } from "vite";
import { createServer as createHttpServer } from "node:http";

const api = createHttpServer((_request, response) => {
  response.writeHead(503, { "content-type": "application/json" });
  response.end(JSON.stringify({ error: "No live API is connected to the recovery fixture server." }));
});
api.listen(4417, "localhost");
const web = await createServer({
  server: { host: "localhost", port: 5417, strictPort: true, proxy: { "/api": "http://localhost:4417" } },
});
await web.listen();
async function close() { await web.close(); api.close(); }
process.on("SIGTERM", close);
process.on("SIGINT", close);
