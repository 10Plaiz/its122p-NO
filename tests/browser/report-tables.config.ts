import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

export default defineConfig({
  testDir: ".",
  testMatch: "report-tables.browser.ts",
  outputDir: "../../test-results/report-tables",
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL: "http://localhost:5414", channel: "chromium" },
  webServer: {
    command: "bun tests/browser/report-tables-server.ts",
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    url: "http://localhost:5414",
    reuseExistingServer: false,
  },
});
