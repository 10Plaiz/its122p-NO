import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import base from '../pills-users-toolbar-2026-10-04/playwright.config.mjs';

export default defineConfig({
  ...base,
  testMatch: ['filters.browser.ts'],
  outputDir: resolve(import.meta.dirname, '../../../test-results/filters'),
  expect: { timeout: 10000 },
});
