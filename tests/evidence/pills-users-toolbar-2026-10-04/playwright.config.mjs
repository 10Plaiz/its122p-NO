import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const guide = readFileSync(resolve(import.meta.dirname, '../../../docs/TEST_ENVIRONMENT.md'), 'utf8');
const password = guide.split('\n').find(line => line.includes('Presentation password for every account'))?.match(/`([^`]+)`/)?.[1];
if (!password) throw new Error('The local presentation credential is missing.');
process.env.FIXTURE_PASSWORD = password;
process.env.UI_AUDIT_ADMIN_EMAIL = 'demo-makati-admin@kamoti.invalid';

export default defineConfig({
  testDir: resolve(import.meta.dirname, '../../browser'),
  testMatch: ['pills-users-toolbar.browser.ts', 'design-system.browser.ts'],
  outputDir: resolve(import.meta.dirname, '../../../test-results/pills-users-toolbar'),
  use: {
    baseURL: 'http://localhost:5174',
    viewport: { width: 1280, height: 900 },
    launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' },
  },
  workers: 1,
  retries: 0,
  timeout: 45000,
  reporter: 'list',
});
