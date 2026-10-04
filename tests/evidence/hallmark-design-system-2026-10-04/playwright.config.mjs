import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

// The local presentation credentials stay out of command output and artifacts.
const guide = readFileSync(resolve(import.meta.dirname, '../../../docs/TEST_ENVIRONMENT.md'), 'utf8');
const passwordLine = guide.split('\n').find(line => line.includes('Presentation password for every account'));
const password = passwordLine?.match(/`([^`]+)`/)?.[1];
if (!password) throw new Error('The presentation credential was not found.');
process.env.FIXTURE_PASSWORD = password;
process.env.UI_AUDIT_ADMIN_EMAIL = 'demo-makati-admin@kamoti.invalid';

// These UI checks create no records and need no database cleanup.
export default defineConfig({
  testDir: resolve(import.meta.dirname, '../../browser'),
  testMatch: 'design-system.browser.ts',
  outputDir: resolve(import.meta.dirname, '../../../test-results/hallmark-design-system'),
  use: {
    baseURL: 'http://localhost:5174',
    viewport: { width: 1280, height: 900 },
    launchOptions: { executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' },
  },
  workers: 1,
  retries: 0,
  reporter: 'list',
});
