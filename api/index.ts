import type { IncomingMessage, ServerResponse } from "node:http";
import { app } from "../src/server/app.js";

// Vercel rewrites /api/* here with the original route in __route.
export default function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const route = url.searchParams.get("__route");
  if (route !== null) {
    url.searchParams.delete("__route");
    req.url = `/api/${route}${url.search}`;
  }
  app(req, res);
}
