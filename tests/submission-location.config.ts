import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './browser', testMatch: 'submission-location.browser.ts',
  outputDir: '../test-results/submission-location', workers: 1, retries: 0,
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5412', headless: true },
  reporter: 'list',
});
