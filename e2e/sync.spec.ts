import { devices, expect, test, type Browser, type Page } from '@playwright/test';

// Sync step 4 (docs/SYNC_PLAN.md): two phones (two separate browser contexts, so
// two separate IndexedDBs) syncing through the real PHP API and a fresh MySQL
// database. Runs in CI only: playwright.sync.config.ts.

const PASSWORD = process.env.PANTRY_API_PASSWORD ?? 'ci-household-password';

async function newPhone(browser: Browser, baseURL: string): Promise<Page> {
  const context = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, baseURL });
  const page = await context.newPage();
  await page.goto('./');
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible(); // sample data loaded
  return page;
}

const syncRegion = (page: Page) => page.getByRole('region', { name: 'Sync' });
const status = (page: Page) => syncRegion(page).getByRole('status').first();

/** In-app navigation (works offline too). */
async function goTo(page: Page, tab: 'Inventory' | 'List' | 'Settings') {
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: new RegExp(`^${tab}`) })
    .click();
  if (tab === 'Settings') {
    await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: 'More' }).click();
    await expect(syncRegion(page)).toBeVisible();
  }
}

async function connect(page: Page, name: string, choice: { dialog: string; button: string }) {
  await goTo(page, 'Settings');
  await syncRegion(page).getByLabel('Household password').fill(PASSWORD);
  await syncRegion(page).getByLabel('Name for this device').fill(name);
  await syncRegion(page).getByRole('button', { name: 'Connect' }).click();
  await page.getByRole('dialog', { name: choice.dialog }).getByRole('button', { name: choice.button }).click();
  await expect(status(page)).toHaveText('Synced just now');
  await expect(syncRegion(page)).toContainText(`This device: ${name}`);
}

/** Sync now, and wait until nothing is left waiting. */
async function syncNow(page: Page) {
  await goTo(page, 'Settings');
  await syncRegion(page).getByRole('button', { name: 'Sync now' }).click();
  await expect(status(page)).toHaveText('Synced just now');
}

async function tapBar(page: Page, name: string, side: 'left' | 'right') {
  const bar = page.getByRole('slider', { name, exact: true });
  const box = (await bar.boundingBox())!;
  await bar.click({ position: { x: side === 'left' ? 8 : box.width - 8, y: box.height / 2 } });
}

test('two phones stay in step through the real server', async ({ browser, baseURL }) => {
  const a = await newPhone(browser, baseURL!);
  const b = await newPhone(browser, baseURL!);

  // Phone A connects first: the server is empty, so A's pantry becomes the shared one.
  await connect(a, 'Phone A', { dialog: 'Upload this pantry?', button: 'Upload' });

  // An edit on A: Black beans 3 -> 2 cans (it's now low, so it also goes on the list).
  await goTo(a, 'Inventory');
  await tapBar(a, 'Black beans', 'left');
  await expect(a.getByRole('slider', { name: 'Black beans', exact: true })).toHaveAttribute(
    'aria-valuetext',
    '2 cans of 8, low',
  );
  await syncNow(a);

  // Phone B connects second and takes the server's pantry (its own sample data had 3 cans).
  await connect(b, 'Phone B', { dialog: 'Use the pantry on the server?', button: 'Use the server’s' });
  await goTo(b, 'Inventory');
  await expect(b.getByRole('slider', { name: 'Black beans', exact: true })).toHaveAttribute(
    'aria-valuetext',
    '2 cans of 8, low',
  );
  await goTo(b, 'List');
  await expect(b.getByRole('region', { name: 'Costco' }).getByText('Black beans', { exact: true })).toBeVisible();

  // A delete on B reaches A.
  await b.getByRole('button', { name: 'Dish soap' }).click();
  await b.getByRole('dialog', { name: 'Dish soap' }).getByRole('button', { name: 'Remove' }).click();
  await expect(b.getByText('Dish soap')).toHaveCount(0);
  await syncNow(b);
  await syncNow(a);
  await goTo(a, 'List');
  await expect(a.getByRole('checkbox', { name: /Black beans/ })).toBeVisible();
  await expect(a.getByText('Dish soap')).toHaveCount(0);

  // A goes offline, keeps working, and catches up on reconnect.
  await goTo(a, 'Inventory');
  await a.context().setOffline(true);
  await tapBar(a, 'Milk', 'right'); // 1 -> 2 gal
  await expect(a.getByRole('slider', { name: 'Milk', exact: true })).toHaveAttribute('aria-valuetext', '2 gal of 2');
  await goTo(a, 'Settings');
  await syncRegion(a).getByRole('button', { name: 'Sync now' }).click();
  await expect(status(a)).toContainText('Offline');
  await expect(status(a)).toContainText('waiting');
  await a.context().setOffline(false);
  await syncNow(a);

  await syncNow(b);
  await goTo(b, 'Inventory');
  await expect(b.getByRole('slider', { name: 'Milk', exact: true })).toHaveAttribute('aria-valuetext', '2 gal of 2');

  await a.context().close();
  await b.context().close();
});
