import { expect, test } from '@playwright/test';

// Lighthouse dropped its PWA audit (v12), so check the install criteria directly.
test('meets the install criteria', async ({ page }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await page.evaluate(async (url) => (await fetch(url!)).json(), href);
  expect(manifest).toMatchObject({
    name: 'Pantry',
    short_name: 'Pantry',
    display: 'standalone',
    theme_color: '#1D5BD6',
  });
  const base = new URL('./', page.url()).pathname;
  expect(manifest.start_url).toBe(base);
  expect(manifest.scope).toBe(base);
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
  for (const icon of manifest.icons as Array<{ src: string }>) {
    const res = await page.request.get(new URL(icon.src, new URL(href!, page.url())).href);
    expect(res.ok(), icon.src).toBe(true);
  }
  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    return { active: !!reg.active, scope: reg.scope };
  });
  expect(sw).toEqual({ active: true, scope: new URL('./', page.url()).href });
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /width=device-width/);
});

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
