import { defineConfig, devices } from '@playwright/test';

// End-to-end flows run against the production build (service worker included).
// Honours BASE_PATH so the GitHub Pages sub-path build can be tested too.
// Specs use relative paths ('list', not '/list') so they resolve under it.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  testDir: './e2e',
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
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
