import { expect, test } from '@playwright/test';

const title = (page: import('@playwright/test').Page) => page.locator('.tut-title');

test('the tutorial can be played from the menu to the end', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('./');
  await page.locator('.menu-btn', { hasText: '新手教學' }).click();
  await expect(title(page)).toHaveText('移動鏡頭');
  await page.keyboard.down('ArrowLeft');
  await expect(title(page)).toHaveText('選取單位', { timeout: 10_000 });
  await page.keyboard.up('ArrowLeft');

  // Selection steps: click one soldier, then box-select the squad.
  const pos = await page.evaluate(() => {
    const g = (window as any).__game;
    const u = [...g.world.all()].find((e: any) => e.tag === 'tut_army');
    return g.camera.tileToScreen(u.x, u.y);
  });
  await page.mouse.click(pos.x, pos.y - 12);
  await expect(title(page)).toHaveText('框選部隊');
  const box = await page.evaluate(() => {
    const g = (window as any).__game;
    const pts = [...g.world.all()].filter((e: any) => e.tag === 'tut_army').map((e: any) => g.camera.tileToScreen(e.x, e.y));
    return { x0: Math.min(...pts.map((p: any) => p.x)) - 20, y0: Math.min(...pts.map((p: any) => p.y)) - 30, x1: Math.max(...pts.map((p: any) => p.x)) + 20, y1: Math.max(...pts.map((p: any) => p.y)) + 10 };
  });
  await page.mouse.move(box.x0, box.y0);
  await page.mouse.down();
  await page.mouse.move(box.x1, box.y1, { steps: 6 });
  await page.mouse.up();
  await expect(title(page)).toHaveText('移動');

  // Move to the flag with a right click on it.
  const flag = await page.evaluate(() => (window as any).__game.camera.tileToScreen(119.5, 44.5));
  await page.mouse.click(flag.x, flag.y, { button: 'right' });
  await page.keyboard.press('+');
  await page.keyboard.press('+');
  await expect(title(page)).toHaveText('採集', { timeout: 60_000 });

  // The rest is driven through the same commands the UI issues.
  const issue = (fn: string) => page.evaluate(fn);
  await issue(`(() => { const g = __game; const w = g.world;
    const labs = [...w.all()].filter((e) => e.tag === 'tut_labor').map((e) => e.id);
    let tile = -1, best = 1e9;
    for (let i = 0; i < w.map.terrain.length; i++) { if (w.map.terrain[i] !== 6) continue;
      const d = Math.hypot(i % 160 - 125, Math.floor(i / 160) - 40); if (d < best) { best = d; tile = i; } }
    g.issue({ type: 'gather', owner: g.player, ids: labs, tile }); })()`);
  await expect(title(page)).toHaveText('資源', { timeout: 60_000 });
  await expect(title(page)).toHaveText('建造兵營', { timeout: 120_000 });
  await issue(`(() => { const g = __game; const labs = [...g.world.all()].filter((e) => e.tag === 'tut_labor').map((e) => e.id);
    g.issue({ type: 'place', owner: g.player, building: 'barracks_zheng', tx: 116, ty: 35, builders: labs }); })()`);
  await expect(title(page)).toHaveText('訓練士兵', { timeout: 120_000 });
  await issue(`(() => { const g = __game; const b = g.world.buildings().find((x) => x.type === 'barracks_zheng');
    g.issue({ type: 'produce', owner: g.player, building: b.id, unit: 'shield_soldier' }); })()`);
  await expect(title(page)).toHaveText('潮汐', { timeout: 60_000 });
  await issue(`(() => { const g = __game; const j = [...g.world.all()].find((e) => e.tag === 'tut_junk');
    g.issue({ type: 'move', owner: g.player, ids: [j.id], x: 90.5, y: 30.5 }); })()`);
  await expect(title(page)).toHaveText('戰鬥', { timeout: 150_000 });
  await issue(`(() => { const g = __game; const ids = [...g.world.all()].filter((e) => e.owner === g.player && e.kind === 'unit' && e.type !== 'laborer' && e.moveClass === 'foot').map((e) => e.id);
    g.issue({ type: 'attack_move', owner: g.player, ids, x: 113.5, y: 48.5 }); })()`);
  await expect(title(page)).toHaveText('外交', { timeout: 90_000 });
  await issue(`(() => { const g = __game; const c = g.world.buildings().find((b) => b.village === 'sinkan');
    g.world.spawnUnit('shield_soldier', g.player, c.x + 3, c.y);
    setTimeout(() => g.issue({ type: 'diplomacy', owner: g.player, party: 'sinkan', action: 'gift_grain' }), 300); })()`);
  await expect(title(page)).toHaveText('暫停與速度', { timeout: 30_000 });
  await page.keyboard.press('Space');
  await expect(title(page)).toHaveText('完成！');
  await page.locator('.tut-bar .primary').click();
  await expect(page.locator('.menu-title')).toBeVisible();
  // Once finished, the menu stops nagging.
  await expect(page.locator('.menu-hint')).toHaveCount(0);
});
