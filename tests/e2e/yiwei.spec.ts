import { expect, test } from '@playwright/test';

test('1895: menu → 澳底 as the defenders → played to a result → on to 桃竹苗', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await page.locator('.menu-tab', { hasText: '乙未戰爭' }).click();
  await page.locator('.menu-toggle', { hasText: '臺灣民主國' }).click();
  await page.locator('.menu-chapter', { hasText: '澳底' }).click();
  await expect(page.locator('.cut-title')).toHaveText('割讓・1895');
  for (let i = 0; i < 4; i++) await page.locator('.cut-next').click();
  await expect(page.locator('.objectives')).toContainText('基隆');
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
    return w.ext.flags['outcome:faction_formosa'];
  });
  expect(['victory', 'historical', 'defeat']).toContain(result);
  await page.evaluate(() => document.querySelectorAll('.cutscene').forEach((c) => c.remove()));
  await expect(page.locator('.result')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.result-history')).toContainText('唐景崧');
  await page.locator('.result-bar .primary').click();
  await expect(page.locator('.cut-title')).toHaveText('義軍・1895 年夏');
  for (let i = 0; i < 3; i++) await page.locator('.cut-next').click();
  await expect(page.locator('.objectives')).toContainText('苗栗');
  expect(await page.evaluate(() => (window as any).__game.world.scenario.id)).toBe('yiwei2');
  expect(errors).toEqual([]);
});

test('1895: every chapter opens without stalling; 八卦山 opens at night', async ({ page }) => {
  for (const scenario of ['yiwei1', 'yiwei2', 'yiwei3', 'yiwei4']) {
    await page.goto(`./?scenario=${scenario}&skipCutscenes=1`);
    await page.waitForFunction(() => (window as any).__game?.world);
    const r = await page.evaluate(() => {
      const g = (window as any).__game;
      g.stepper.paused = true;
      const t = performance.now();
      for (let i = 0; i < 100; i++) (window as any).__step(g.world);
      return { ms: performance.now() - t, sight: g.world.weather.sightMul };
    });
    expect(r.ms, scenario).toBeLessThan(1500);
    if (scenario === 'yiwei3') expect(r.sight).toBeLessThan(1);
  }
});
