import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: resolve(import.meta.dirname, '../../browser'),
  testMatch: 'board-improvements.browser.ts',
  outputDir: resolve(import.meta.dirname, '../../../test-results/website-board'),
  use: {
    baseURL: 'http://localhost:5413',
    viewport: { width: 1280, height: 900 },
    launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' },
  },
  webServer: { command: 'bunx vite --host localhost --port 5413 --strictPort', url: 'http://localhost:5413', reuseExistingServer: true },
  workers: 1,
  retries: 0,
  reporter: 'list',
});
