import { expect, test, type Page } from '@playwright/test';

// Laptop controls: orders without a right button (Alt + click, long press, touchpad-mode click).
async function setup(page: Page) {
  await page.goto('./?chapter=1&skipCutscenes=1');
  await page.waitForFunction(() => (window as any).__game?.world);
  return page.evaluate(() => {
    const g = (window as any).__game;
    g.togglePause();
    const u = [...g.world.all()].find((e: any) => e.owner === g.player && e.kind === 'unit' && e.moveClass === 'foot');
    g.camera.centerOn(u.x, u.y);
    g.selected.clear();
    g.selected.add(u.id);
    // Record issued commands (the queue only applies them on the next tick).
    const issue = g.issue.bind(g);
    (window as any).__issued = [];
    g.issue = (c: any) => ((window as any).__issued.push(c), issue(c));
    return u.id as number;
  });
}

/** Screen point a few tiles from the unit, and the order the unit received afterwards. */
const spot = (page: Page, id: number) =>
  page.evaluate((id) => {
    const g = (window as any).__game;
    const u = g.world.get(id);
    return g.camera.tileToScreen(u.x + 2, u.y + 2);
  }, id);
const ordered = (page: Page, id: number) => page.evaluate((id) => (window as any).__issued.some((c: any) => c.ids?.includes(id)), id);

test('Alt + left click orders the selection', async ({ page }) => {
  const id = await setup(page);
  const p = await spot(page, id);
  await page.keyboard.down('Alt');
  await page.mouse.click(p.x, p.y);
  await page.keyboard.up('Alt');
  await expect.poll(() => ordered(page, id)).toBe(true);
  expect(await page.evaluate(() => (window as any).__game.selected.size)).toBe(1);
});

test('a long press orders the selection', async ({ page }) => {
  const id = await setup(page);
  const p = await spot(page, id);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();
  await expect.poll(() => ordered(page, id)).toBe(true);
  expect(await page.evaluate(() => (window as any).__game.selected.size)).toBe(1);
});

test('touchpad mode: left click orders, Escape deselects', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tayouan1661.settings', JSON.stringify({ touchpad: true })));
  const id = await setup(page);
  const p = await spot(page, id);
  await page.mouse.click(p.x, p.y);
  await expect.poll(() => ordered(page, id)).toBe(true);
  expect(await page.evaluate(() => (window as any).__game.selected.size)).toBe(1);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => (window as any).__game.selected.size)).toBe(0);
});

test('touchpad-like scrolling offers touchpad mode', async ({ page }) => {
  await setup(page);
  // A mouse wheel notch does not trigger the offer.
  await page.mouse.move(640, 360);
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(200);
  await expect(page.locator('.touchpad-hint')).toHaveCount(0);
  // Two-finger scrolling: a burst of small pixel deltas.
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 5);
  await expect(page.locator('.touchpad-hint')).toBeVisible();
  await page.screenshot({ path: 'test-results/touchpad-hint.png' });
  await page.locator('.touchpad-hint .primary').click();
  await expect(page.locator('.touchpad-hint')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tayouan1661.settings')!).touchpad)).toBe(true);
});
