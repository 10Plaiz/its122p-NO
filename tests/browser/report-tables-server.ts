import { createServer } from "vite";

const server = await createServer({
  server: {
    host: "localhost",
    port: 5414,
    strictPort: true,
    proxy: { "/api": "http://localhost:4414" },
  },
});
await server.listen();
