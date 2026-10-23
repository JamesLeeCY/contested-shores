import { expect, test } from '@playwright/test';

test('1874: menu → 石門之役 as the expedition → cutscene → played to a result', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await page.locator('.menu-tab', { hasText: '牡丹社事件' }).click();
  await page.locator('.menu-toggle', { hasText: '日本出兵軍' }).click();
  await page.locator('.menu-chapter', { hasText: '石門之役' }).click();
  await expect(page.locator('.cut-title')).toHaveText('石門・1874');
  for (let i = 0; i < 4; i++) await page.locator('.cut-next').click();
  await expect(page.locator('.objectives')).toContainText('高地守軍');
  // The player's side stands idle; the defenders' AI plays. Fast-forward to the outcome.
  const result = await page.evaluate(async () => {
    const g = (window as any).__game;
    const w = g.world;
    g.stepper.paused = true;
    while (!w.ext.flags.missionOver && w.tick < 9 * 60 * 20) {
      for (let i = 0; i < 400 && !w.ext.flags.missionOver; i++) {
        (window as any).__step(w);
        for (const ev of w.events) for (const h of g.eventHooks) h(g, ev);
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    return w.ext.flags['outcome:faction_japan'];
  });
  expect(['victory', 'historical', 'defeat']).toContain(result);
  await page.evaluate(() => document.querySelectorAll('.cutscene').forEach((c) => c.remove()));
  await expect(page.locator('.result')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.result-history')).toContainText('北京專約');
  await expect(page.locator('.result-bar .menu-btn', { hasText: '重玩本章' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('1874: save and load on the 恆春 map restores the same state', async ({ page }) => {
  test.setTimeout(150_000);
  await page.goto('./?scenario=mudan1&faction=paiwan&skipCutscenes=1');
  await page.waitForFunction(() => (window as any).__game?.world);
  await page.evaluate(() => {
    const g = (window as any).__game;
    const ids = [...g.world.all()].filter((e: any) => e.owner === g.player && e.type === 'paiwan_hunter').map((e: any) => e.id);
    g.issue({ type: 'stance', owner: g.player, ids, hold: true });
    for (let i = 0; i < 1300; i++) (window as any).__step(g.world);
    g.togglePause();
  });
  await page.locator('.gm-btn', { hasText: '存檔' }).first().click();
  await expect(page.locator('.msg', { hasText: '已存檔' })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('tayouan1661.save')!).tick);
  const hashBefore = await page.evaluate(() => (window as any).__hash((window as any).__game.world));
  await page.goto('./');
  await page.locator('.menu-btn', { hasText: '繼續' }).click();
  await page.waitForFunction((t) => (window as any).__game?.world?.tick === t, saved, { timeout: 60_000 });
  const after = await page.evaluate(() => ({ hash: (window as any).__hash((window as any).__game.world), map: (window as any).__game.world.map.id }));
  expect(after.map).toBe('hengchun');
  expect(after.hash).toBe(hashBefore);
});
