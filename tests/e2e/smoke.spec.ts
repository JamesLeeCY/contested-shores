import { expect, test } from '@playwright/test';

test('game page boots without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await expect(page.locator('#game canvas')).toBeVisible();
  await page.waitForTimeout(3000);
  expect(errors).toEqual([]);
});
