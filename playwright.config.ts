import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.browser.ts",
  outputDir: "./test-results",
  // Deletes the reports and remarks the tests created, once per run.
  globalTeardown: "./tests/browser/cleanup.ts",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  retries: 1,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
});
