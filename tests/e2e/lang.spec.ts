import { expect, test } from '@playwright/test';

test.describe('English', () => {
  test.use({ locale: 'en-US' });

  test('an English browser gets English; the choice in Settings switches back to Chinese and is kept', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('./');
    await expect(page).toHaveTitle('Contested Shores: Taiwan 1661–1930');
    await expect(page.locator('.menu-game')).toHaveText('Contested Shores: Taiwan 1661–1930');
    await page.locator('.menu-tab', { hasText: 'Musha Incident 1930' }).click();
    await expect(page.locator('.menu-chapter', { hasText: 'The Uprising' })).toBeVisible();
    await page.locator('.menu-btn', { hasText: 'Settings' }).click();
    await page.locator('.menu-toggle', { hasText: '中文' }).click();
    await page.waitForLoadState('load');
    await expect(page.locator('.menu-game')).toHaveText('島嶼烽火：臺灣 1661–1930');
    await page.reload();
    await expect(page.locator('.menu-game')).toHaveText('島嶼烽火：臺灣 1661–1930');
    expect(errors).toEqual([]);
  });
});
