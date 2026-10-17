import { defineConfig, devices } from '@playwright/test';

// Two phones syncing through the real PHP API + MySQL (docs/SYNC_PLAN.md, step 4).
// Needs a running server (CI's server job starts one: server/dev-router.php in
// front of a fresh database), so it's separate from the main e2e config.
const url = process.env.PANTRY_SYNC_E2E_URL ?? 'http://127.0.0.1:8090/';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'sync.spec.ts',
  reporter: process.env.CI ? [['line'], ['html', { open: 'never', outputFolder: 'playwright-report-sync' }]] : 'line',
  outputDir: 'test-results-sync',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: url,
    trace: 'retain-on-failure',
    ...devices['Pixel 7'],
    viewport: { width: 390, height: 844 },
  },
});
