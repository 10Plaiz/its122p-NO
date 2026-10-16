import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/browser', testMatch: 'account-improvements.browser.ts', outputDir: './test-results/account-browser', use: { baseURL: 'http://localhost:5411', browserName: 'chromium', viewport: { width: 1280, height: 800 } }, workers: 1, retries: 0, reporter: 'list' });
