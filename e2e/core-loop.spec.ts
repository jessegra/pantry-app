import { expect, test } from '@playwright/test';

// PLAN M7: seed → Black beans to 2 → list shows Black beans 6 cans at Costco →
// just shopped, confirm all (skip one) → inventory shows full bars, list empty except skipped.
// Run entirely offline once the service worker has the app.
test('core loop works offline', async ({ page, context }) => {
  test.slow(); // a long journey: 3× the default budget, for slow CI machines
  await page.goto('./');
  await page.getByRole('button', { name: 'Load sample data' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);

  // Use one can: tap the left half of the Black beans bar.
  const beans = page.getByRole('slider', { name: 'Black beans', exact: true });
  await expect(beans).toHaveAttribute('aria-valuetext', '3 cans of 8');
  const box = (await beans.boundingBox())!;
  await beans.click({ position: { x: 8, y: box.height / 2 } });
  await expect(beans).toHaveAttribute('aria-valuetext', '2 cans of 8, low');
  const beansRow = beans.locator('..');
  await expect(beansRow.getByRole('img', { name: 'On shopping list' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'List, 5 to get' })).toBeVisible();

  // It's on the list at Costco, 6 cans (back to par 8).
  await page.getByRole('link', { name: 'List, 5 to get' }).click();
  const costco = page.getByRole('region', { name: 'Costco' });
  await expect(costco.getByText('Black beans', { exact: true })).toBeVisible();
  await expect(costco.getByText('6 cans')).toBeVisible();

  // Just shopped: confirm everything except Dish soap.
  await page.getByRole('link', { name: 'I just shopped' }).click();
  // Wait for the walk itself, or the first read below can catch the list's own heading.
  await expect(page.getByRole('progressbar', { name: 'Items logged' })).toBeVisible();
  const seen: string[] = [];
  for (;;) {
    const end = page.getByRole('heading', { name: "That's the whole list." });
    const card = page.getByRole('heading', { level: 1 });
    await expect(card).toBeVisible();
    if (await end.isVisible()) break;
    const name = (await card.textContent())!;
    seen.push(name);
    await page.getByRole('button', { name: name === 'Dish soap' ? 'Skip' : 'Confirm' }).click();
    await expect(page.getByRole('heading', { level: 1, name, exact: true })).toHaveCount(0);
  }
  expect(seen).toEqual(['Chicken thighs', 'Black beans', 'Lemons', 'Coffee beans', 'Tortillas', 'Dish soap']);
  await expect(page.getByText('6 of 6')).toBeVisible();
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page.getByRole('heading', { name: 'Trip logged' })).toBeVisible();

  // Inventory: full bars.
  await page.getByRole('link', { name: 'Back to inventory' }).click();
  await expect(page.getByRole('slider', { name: 'Black beans', exact: true })).toHaveAttribute('aria-valuetext', '8 cans of 8');
  await expect(page.getByRole('slider', { name: 'Chicken thighs' })).toHaveAttribute('aria-valuetext', '4 lb of 4');
  await expect(page.getByRole('slider', { name: 'Coffee beans' })).toHaveAttribute('aria-valuetext', '2½ bags of 2');
  await expect(page.getByRole('img', { name: 'On shopping list' })).toHaveCount(0);

  // List: only the skipped entry is left.
  await page.getByRole('link', { name: 'List, 1 to get' }).click();
  await expect(page.getByRole('checkbox')).toHaveCount(1);
  await expect(page.getByRole('checkbox', { name: 'Check off Dish soap' })).toBeVisible();
});
