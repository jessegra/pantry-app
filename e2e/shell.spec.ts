import { expect, test } from '@playwright/test';

test('app shell opens offline after first visit', async ({ page, context }) => {
  await page.goto('./');
  // First open loads the sample data by itself.
  // Wait for the write to land before reloading.
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now controlled by the service worker

  await context.setOffline(true);
  await page.goto('list');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Shopping list' })).toBeVisible();
});
