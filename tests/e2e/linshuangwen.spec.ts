import { expect, test } from '@playwright/test';

test('1786: menu → 彰化起事 as Lin\'s side → played to a result → on to 諸羅之圍', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await page.locator('.menu-tab', { hasText: '林爽文事件' }).click();
  await page.locator('.menu-toggle', { hasText: '林爽文與天地會' }).click();
  await page.locator('.menu-chapter', { hasText: '彰化起事' }).click();
  await expect(page.locator('.cut-title')).toHaveText('彰化・1787 年 1 月');
  for (let i = 0; i < 3; i++) await page.locator('.cut-next').click();
  await expect(page.locator('.objectives')).toContainText('彰化縣城');
  const result = await page.evaluate(async () => {
    const g = (window as any).__game;
    const w = g.world;
    g.stepper.paused = true;
    while (!w.ext.flags.missionOver && w.tick < 11 * 60 * 20) {
      for (let i = 0; i < 400 && !w.ext.flags.missionOver; i++) {
        (window as any).__step(w);
        for (const ev of w.events) for (const h of g.eventHooks) h(g, ev);
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    return w.ext.flags['outcome:faction_tiandihui'];
  });
  expect(['victory', 'historical', 'defeat']).toContain(result);
  await page.evaluate(() => document.querySelectorAll('.cutscene').forEach((c) => c.remove()));
  await expect(page.locator('.result')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.result-history')).toContainText('天地會');
  await page.locator('.result-bar .primary').click();
  await expect(page.locator('.cut-title')).toHaveText('諸羅・1787 年');
  expect(await page.evaluate(() => (window as any).__game.world.scenario.id)).toBe('ls2');
  expect(errors).toEqual([]);
});

test('1786: every chapter opens without stalling', async ({ page }) => {
  for (const scenario of ['ls1', 'ls2', 'ls3']) {
    await page.goto(`./?scenario=${scenario}&skipCutscenes=1`);
    await page.waitForFunction(() => (window as any).__game?.world);
    const ms = await page.evaluate(() => {
      const g = (window as any).__game;
      g.stepper.paused = true;
      const t = performance.now();
      for (let i = 0; i < 100; i++) (window as any).__step(g.world);
      return performance.now() - t;
    });
    expect(ms, scenario).toBeLessThan(1500);
  }
});
