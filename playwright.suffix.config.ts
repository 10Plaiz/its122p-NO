import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "suffix-field.browser.ts",
  outputDir: "./test-results/suffix-menu",
  use: {
    baseURL: "http://localhost:5416",
    viewport: { width: 1280, height: 800 },
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined },
  },
  webServer: {
    command: "bunx vite --config tests/evidence/suffix-menu/vite.config.mjs --host localhost --port 5416 --strictPort",
    url: "http://localhost:5416",
    reuseExistingServer: false,
  },
  workers: 1,
  retries: 0,
  reporter: "list",
});
