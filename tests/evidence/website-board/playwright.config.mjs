import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: resolve(import.meta.dirname, '../../browser'),
  testMatch: 'board-improvements.browser.ts',
  outputDir: resolve(import.meta.dirname, '../../../test-results/website-board'),
  use: {
    baseURL: 'http://localhost:5413',
    viewport: { width: 1280, height: 900 },
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined },
  },
  webServer: {
    command: 'bunx vite --config tests/evidence/website-board/vite.config.mjs --host localhost --port 5413 --strictPort',
    cwd: resolve(import.meta.dirname, '../../..'),
    url: 'http://localhost:5413',
    reuseExistingServer: false,
  },
  workers: 1,
  retries: 0,
  reporter: 'list',
});
