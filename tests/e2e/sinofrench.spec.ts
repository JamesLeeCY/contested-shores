import { expect, test } from '@playwright/test';

test('1884: menu → 滬尾 as the Qing → played to a result → on to 月眉山', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await page.locator('.menu-tab', { hasText: '清法戰爭' }).click();
  await page.locator('.menu-toggle', { hasText: '清軍' }).click();
  await page.locator('.menu-chapter', { hasText: '滬尾' }).click();
  await expect(page.locator('.cut-title')).toHaveText('滬尾・1884 年 10 月');
  for (let i = 0; i < 4; i++) await page.locator('.cut-next').click();
  await expect(page.locator('.objectives')).toContainText('紅毛城');
  const result = await page.evaluate(async () => {
    const g = (window as any).__game;
    const w = g.world;
    g.stepper.paused = true;
    while (!w.ext.flags.missionOver && w.tick < 13 * 60 * 20) {
      for (let i = 0; i < 400 && !w.ext.flags.missionOver; i++) {
        (window as any).__step(w);
        for (const ev of w.events) for (const h of g.eventHooks) h(g, ev);
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    return w.ext.flags['outcome:faction_qing84'];
  });
  expect(['victory', 'historical', 'defeat']).toContain(result);
  await page.evaluate(() => document.querySelectorAll('.cutscene').forEach((c) => c.remove()));
  await expect(page.locator('.result')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.result-history')).toContainText('孫開華');
  await page.locator('.result-bar .primary').click();
  await expect(page.locator('.cut-title')).toHaveText('基隆・1885 年初');
  expect(await page.evaluate(() => (window as any).__game.world.scenario.id)).toBe('sf2');
  expect(errors).toEqual([]);
});

test('1884: every chapter opens without stalling; 月眉山 rains, 澎湖 has the 1885 works', async ({ page }) => {
  for (const scenario of ['sf1', 'sf2', 'sf3']) {
    await page.goto(`./?scenario=${scenario}&skipCutscenes=1`);
    await page.waitForFunction(() => (window as any).__game?.world);
    const r = await page.evaluate(() => {
      const g = (window as any).__game;
      const w = g.world;
      g.stepper.paused = true;
      const t = performance.now();
      for (let i = 0; i < 100; i++) (window as any).__step(w);
      const ms = performance.now() - t;
      if (w.scenario.id === 'sf2') while (w.tick < 310 * 20) (window as any).__step(w);
      return { ms, rain: w.weather.rangedHitPenalty, forts: w.buildings().filter((b: any) => b.owner === 'faction_qing84').length };
    });
    expect(r.ms, scenario).toBeLessThan(1500);
    if (scenario === 'sf2') expect(r.rain).toBe(0.25);
    if (scenario === 'sf3') expect(r.forts).toBe(2);
  }
});
