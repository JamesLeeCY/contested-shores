import { expect, test } from '@playwright/test';

test('1930: menu → 起事 as the Seediq → played to a result → on to 馬赫坡', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await page.locator('.menu-tab', { hasText: '霧社事件' }).click();
  await page.locator('.menu-toggle', { hasText: '賽德克族' }).click();
  await page.locator('.menu-chapter', { hasText: '起事' }).click();
  await expect(page.locator('.cut-title')).toHaveText('霧社・1930 年 10 月');
  for (let i = 0; i < 4; i++) await page.locator('.cut-next').click();
  await expect(page.locator('.objectives')).toContainText('霧社分室');
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
    return w.ext.flags['outcome:faction_seediq'];
  });
  expect(['victory', 'historical', 'defeat']).toContain(result);
  await page.evaluate(() => document.querySelectorAll('.cutscene').forEach((c) => c.remove()));
  await expect(page.locator('.result')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.result-history')).toContainText('莫那・魯道');
  await page.locator('.result-bar .primary').click();
  await expect(page.locator('.cut-title')).toHaveText('馬赫坡・1930 年 11 月');
  expect(await page.evaluate(() => (window as any).__game.world.scenario.id)).toBe('wushe2');
  expect(errors).toEqual([]);
});

test('1930: 馬赫坡 opens without stalling; the first air raid shows its warning ring, then lands', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./?scenario=wushe2&skipCutscenes=1');
  await page.waitForFunction(() => (window as any).__game?.world);
  const r = await page.evaluate(() => {
    const g = (window as any).__game;
    const w = g.world;
    g.stepper.paused = true;
    const t = performance.now();
    for (let i = 0; i < 100; i++) (window as any).__step(w);
    const ms = performance.now() - t;
    let warned = false;
    while (w.tick < 90 * 20) {
      (window as any).__step(w);
      for (const ev of w.events) {
        if (ev.type === 'raid_warn') warned = true;
        for (const h of g.eventHooks) h(g, ev);
      }
    }
    return { ms, warned, pending: w.ext.raids?.length ?? 0, posts: w.buildings().filter((b: any) => b.type === 'sdq_post').length };
  });
  expect(r.ms).toBeLessThan(1500);
  expect(r.warned).toBe(true);
  expect(r.pending).toBe(0);
  expect(r.posts).toBe(0);
  expect(errors).toEqual([]);
});
