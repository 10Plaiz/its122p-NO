import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { defineConfig, mergeConfig } from "vite";
import base from "../../../vite.config.ts";

const root = resolve(import.meta.dirname, "../../..");
const baseline = process.env.SUFFIX_BASELINE
  ? execFileSync("git", ["show", "a0c9696:src/web/components/SuffixField.tsx"], { cwd: root, encoding: "utf8" })
  : null;

export default mergeConfig(base, defineConfig({
  root: resolve(root, "src/web"),
  envDir: root,
  define: { "import.meta.env.VITE_GOOGLE_MAPS_API_KEY": JSON.stringify("") },
  plugins: baseline ? [{
    name: "suffix-baseline",
    enforce: "pre",
    load(id) { if (id.replaceAll("\\", "/").endsWith("/components/SuffixField.tsx")) return baseline; },
  }] : [],
  server: { proxy: { "/api": "http://localhost:4416" } },
}));
