import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// M9 audit: axe (WCAG 2.2 A/AA) and the 44×44px tap-target rule from CLAUDE.md,
// on every screen and the main sheets, at phone and tablet sizes.

const SCREENS: Array<{ name: string; path: string; open?: (page: Page) => Promise<void> }> = [
  { name: 'inventory', path: './' },
  { name: 'item (configured)', path: 'item/it-blackbeans' },
  { name: 'item (not set up)', path: 'item/it-rice' },
  { name: 'open one sheet', path: 'item/it-blackbeans', open: (p) => p.getByRole('button', { name: 'Open one' }).click() },
  { name: 'quick add', path: 'add' },
  {
    name: 'new item sheet',
    path: 'add',
    open: async (p) => {
      await p.getByRole('searchbox', { name: 'Find or create an item' }).fill('tahini');
      await p.getByRole('searchbox', { name: 'Find or create an item' }).press('Enter');
      await p.getByRole('button', { name: /Add unit, par and store now/ }).click();
    },
  },
  { name: 'shopping list', path: 'list' },
  { name: 'just shopped', path: 'shopped' },
  { name: 'settings: locations', path: 'settings/locations' },
  { name: 'settings: stores', path: 'settings/stores' },
  { name: 'settings: categories', path: 'settings/categories' },
  { name: 'settings: more', path: 'settings/more' },
];

const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 1024, height: 768 },
];

/** Interactive elements smaller than 44×44, except links inside running text. */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const sel = 'button, a[href], input:not([type=hidden]), select, textarea, [role=slider], [role=checkbox], [role=radio]';
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || style.visibility === 'hidden') continue;
      if (el.closest('.visually-hidden') || el.classList.contains('visually-hidden')) continue;
      // A dialog that isn't open, or content behind a modal, doesn't count.
      const modal = document.querySelector('dialog[open]');
      if (modal && !modal.contains(el)) continue;
      const inText = el.tagName === 'A' && el.parentElement && /\S/.test(el.parentElement.textContent!.replace(el.textContent!, ''));
      // Inline text fields keep their own 44px rule via their row; native inputs inside a 44px+ wrapper are fine.
      const box = el.tagName === 'INPUT' && el.parentElement ? el.parentElement.getBoundingClientRect() : r;
      if (inText) continue;
      if (Math.round(box.width) < 44 || Math.round(box.height) < 44) {
        const label = el.getAttribute('aria-label') || el.textContent?.trim() || el.tagName;
        out.push(`${label.slice(0, 40)} (${Math.round(box.width)}×${Math.round(box.height)})`);
      }
    }
    return out;
  });
}

for (const size of SIZES) {
  test.describe(`${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    for (const s of SCREENS) {
      test(`${s.name}: no axe violations, 44px targets`, async ({ page }) => {
        await page.goto('./');
        await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
        await page.goto(s.path);
        await page.waitForLoadState('networkidle');
        await expect(page.locator('h1, h2').first()).toBeVisible();
        if (s.open) {
          await s.open(page);
          await expect(page.locator('dialog[open]')).toBeVisible();
        }
        const axe = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
          .analyze();
        const violations = axe.violations.map(
          (v) => `${v.id}: ${v.help} → ${v.nodes.map((n) => n.target.join(' ')).slice(0, 4).join(' | ')}`,
        );
        expect(violations, 'axe violations').toEqual([]);
        expect(await smallTargets(page), 'targets under 44×44').toEqual([]);
      });
    }
  });
}
