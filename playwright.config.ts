import { defineConfig, devices } from '@playwright/test';

// End-to-end flows run against the production build (service worker included).
// Honours BASE_PATH, so a sub-path build can be tested too.
// Specs use relative paths ('list', not '/list') so they resolve under it.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  testDir: './e2e',
  // Needs the PHP API + MySQL: see playwright.sync.config.ts.
  testIgnore: 'sync.spec.ts',
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  // CI runners are several times slower than a dev machine.
  expect: { timeout: process.env.CI ? 15_000 : 5_000 },
  use: {
    trace: 'retain-on-failure',
    baseURL: `http://localhost:4173${base}`,
    ...devices['Pixel 7'],
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: `http://localhost:4173${base}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
