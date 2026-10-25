import { expect, test } from '@playwright/test';

test('menu → chapter 1 → cutscene → 60 s of play without errors', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('./');
  await expect(page.locator('.menu-game')).toHaveText('島嶼烽火：臺灣 1661–1914');
  await expect(page.locator('.menu-title')).toHaveText('大員之圍 1661');
  await page.locator('.menu-chapter').first().click();
  await expect(page.locator('.cutscene')).toBeVisible();
  await expect(page.locator('.cut-title')).toContainText('鹿耳門');
  await page.keyboard.press('Escape');
  await expect(page.locator('.cutscene')).toHaveCount(0);
  await expect(page.locator('.objectives')).toContainText('禾寮港');
  // 60 game seconds at 2× speed.
  await page.keyboard.press('+');
  await page.keyboard.press('+');
  await page.waitForFunction(() => (window as any).__game.world.tick >= 1200, null, { timeout: 120_000 });
  expect(errors).toEqual([]);
});

test('chapter result screen leads to the next chapter', async ({ page }) => {
  await page.goto('./?chapter=1&skipCutscenes=1');
  await page.waitForFunction(() => (window as any).__game?.world);
  // Decide the chapter through the scenario engine (Koxinga falls).
  await page.evaluate(() => {
    const w = (window as any).__game.world;
    const k = [...w.all()].find((e: any) => e.tag === 'koxinga');
    k.insideOf = null;
    w.remove(k.id);
  });
  await expect(page.locator('.result')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.result-rating')).toHaveText('失敗');
  await page.locator('.result-bar .primary').click();
  await expect(page.locator('.objectives')).toContainText('普羅民遮城');
});
