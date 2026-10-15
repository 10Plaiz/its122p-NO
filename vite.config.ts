import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: "src/web",
  // The root is src/web, but .env lives at the repository root beside the API's.
  // Only VITE_-prefixed values reach the browser bundle.
  envDir: "../..",
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { "/api": "http://localhost:4000" },
  },
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true,
  },
});
