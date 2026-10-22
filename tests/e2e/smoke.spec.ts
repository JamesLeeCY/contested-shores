import { expect, test } from '@playwright/test';

test('game page boots without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('./?mode=sandbox');
  await expect(page.locator('#game canvas')).toBeVisible();
  await page.waitForTimeout(3000);
  expect(errors).toEqual([]);
});

test('box-select own units and right-click to move them', async ({ page }) => {
  await page.goto('./?mode=sandbox');
  await page.waitForFunction(() => (window as unknown as { __game?: unknown }).__game);
  // Centre the camera on the Zheng army and remember where a soldier starts.
  const before = await page.evaluate(() => {
    const g = (window as any).__game;
    g.camera.centerOn(40, 34);
    g.camera.zoom = 1;
    const u = [...g.world.all()].find((e: any) => e.type === 'shield_soldier');
    return { id: u.id, x: u.x, y: u.y };
  });
  await page.waitForTimeout(100);
  const box = await page.evaluate((id) => {
    const g = (window as any).__game;
    const u = g.world.get(id);
    return g.camera.tileToScreen(u.x, u.y);
  }, before.id);
  await page.mouse.move(box.x - 40, box.y - 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + 30, { steps: 5 });
  await page.mouse.up();
  const selected = await page.evaluate(() => (window as any).__game.selected.size);
  expect(selected).toBeGreaterThan(0);
  const target = await page.evaluate(() => (window as any).__game.camera.tileToScreen(46, 33));
  await page.mouse.click(target.x, target.y, { button: 'right' });
  await page.waitForTimeout(3000);
  const after = await page.evaluate((id) => {
    const u = (window as any).__game.world.get(id);
    return { x: u.x, y: u.y };
  }, before.id);
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(1);
});
