import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.browser.ts",
  outputDir: "./test-results",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "https://kamoti-chi.vercel.app",
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
