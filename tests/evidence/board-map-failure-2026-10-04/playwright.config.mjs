import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: resolve(import.meta.dirname, '../../browser'),
  testMatch: 'map-failure.browser.ts',
  outputDir: resolve(import.meta.dirname, '../../../test-results/board-map-failure'),
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5174',
    viewport: { width: 1280, height: 900 },
    launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' },
  },
  // These public checks create no records and need no database cleanup.
  workers: 1,
  retries: 0,
  reporter: 'list',
});
