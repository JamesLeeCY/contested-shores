import { expect, test } from '@playwright/test';

test('1683: menu → 八罩 as 東寧 → played to a result → on to 娘媽宮 with the wind shown', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await page.locator('.menu-tab', { hasText: '施琅攻臺' }).click();
  await page.locator('.menu-toggle', { hasText: '東寧' }).click();
  await page.locator('.menu-chapter', { hasText: '八罩' }).click();
  await expect(page.locator('.cut-title')).toHaveText('澎湖・1683');
  for (let i = 0; i < 4; i++) await page.locator('.cut-next').click();
  await expect(page.locator('.wind-text')).toContainText('北風');
  await expect(page.locator('.objectives')).toContainText('外海船隻');
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
    return w.ext.flags['outcome:faction_tungning'];
  });
  expect(['victory', 'historical', 'defeat']).toContain(result);
  await page.evaluate(() => document.querySelectorAll('.cutscene').forEach((c) => c.remove()));
  await expect(page.locator('.result')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.result-history')).toContainText('施琅');
  await page.locator('.result-bar .primary').click();
  await expect(page.locator('.cut-title')).toHaveText('娘媽宮・決戰');
  for (let i = 0; i < 3; i++) await page.locator('.cut-next').click();
  await expect(page.locator('.wind-text')).toContainText('西北風');
  expect(await page.evaluate(() => (window as any).__game.world.scenario.id)).toBe('penghu2');
  expect(errors).toEqual([]);
});

test('1683: the battles open without stalling', async ({ page }) => {
  for (const scenario of ['penghu1', 'penghu2']) {
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

test('1683: 東寧 — the court decides; 死守 brings the Qing ashore', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await page.locator('.menu-tab', { hasText: '施琅攻臺' }).click();
  // Only 東寧 can be played: picking the Qing side still opens it as 東寧.
  await page.locator('.menu-toggle', { hasText: '清' }).first().click();
  await page.locator('.menu-chapter', { hasText: '東寧（尾聲）' }).click();
  await expect(page.locator('.cut-title')).toHaveText('東寧・1683 年夏');
  for (let i = 0; i < 3; i++) await page.locator('.cut-next').click();
  expect(await page.evaluate(() => (window as any).__game.world.ext.flags.player)).toBe('faction_tungning');
  await expect(page.locator('.obj-choice')).toHaveCount(3);
  await page.locator('.obj-choice', { hasText: '死守承天府' }).click();
  await expect(page.locator('.objectives')).toContainText('守住承天府');
  await expect(page.locator('.obj-choice')).toHaveCount(0);
  const landed = await page.evaluate(() => [...(window as any).__game.world.all()].filter((e: any) => e.tag === 'landing').length);
  expect(landed).toBe(38);
  expect(errors).toEqual([]);
});
