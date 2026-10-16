import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

export default defineConfig({
  testDir: ".",
  testMatch: "admin-users-recovery.browser.ts",
  outputDir: "../../test-results/admin-users-recovery",
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL: "http://localhost:5417", channel: "chromium", viewport: { width: 1280, height: 900 } },
  webServer: {
    command: "bun tests/browser/admin-users-recovery-server.ts",
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    url: "http://localhost:5417",
    reuseExistingServer: false,
  },
});
