import { expect, test } from '@playwright/test';

test('save, reload the page, load: the state hash is unchanged', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('./?chapter=2&skipCutscenes=1');
  await page.waitForFunction(() => (window as any).__game?.world);
  // Play a while at top speed with a couple of player orders.
  await page.keyboard.press('+');
  await page.keyboard.press('+');
  await page.evaluate(() => {
    const g = (window as any).__game;
    const ids = [...g.world.all()].filter((e: any) => e.owner === g.player && e.type === 'shield_soldier').map((e: any) => e.id);
    g.issue({ type: 'move', owner: g.player, ids, x: 122, y: 44 });
  });
  await page.waitForFunction(() => (window as any).__game.world.tick > 1500, null, { timeout: 120_000 });
  const before = await page.evaluate(() => {
    const g = (window as any).__game;
    g.togglePause();
    return { tick: g.world.tick };
  });
  await page.locator('.gm-btn', { hasText: '存檔' }).first().click();
  await expect(page.locator('.msg', { hasText: '已存檔' })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tayouan1661.save')!).tick);
  expect(saved).toBe(before.tick);
  const hashBefore = await page.evaluate(() => (window as any).__hash((window as any).__game.world));

  // Reload the page (fresh JS state) and continue from the main menu.
  await page.goto('./');
  await page.locator('.menu-btn', { hasText: '繼續' }).click();
  await page.waitForFunction((t) => (window as any).__game?.world?.tick === t, saved, { timeout: 60_000 });
  const hashAfter = await page.evaluate(() => (window as any).__hash((window as any).__game.world));
  expect(hashAfter).toBe(hashBefore);
});
