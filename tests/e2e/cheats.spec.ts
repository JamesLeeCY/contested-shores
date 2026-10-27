import { expect, test } from '@playwright/test';

test('cheat line: Enter, "how do you turn this on", Enter → a blue sports car and the cheat mark', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./?scenario=ls1&skipCutscenes=1');
  await page.waitForFunction(() => (window as any).__game?.world);
  await page.evaluate(() => ((window as any).__game.stepper.paused = true));
  await expect(page.locator('.cheat-badge')).toBeHidden();

  // A wrong code just closes the line.
  await page.keyboard.press('Enter');
  await expect(page.locator('.cheat-input')).toBeFocused();
  await page.keyboard.type('how do you turn this off');
  await page.keyboard.press('Enter');
  await expect(page.locator('.cheat-input')).toBeHidden();

  await page.keyboard.press('Enter');
  await page.keyboard.type('How Do You Turn This On');
  await page.keyboard.press('Enter');
  const car = await page.evaluate(() => {
    const g = (window as any).__game;
    (window as any).__step(g.world);
    for (const ev of g.world.events) for (const h of g.eventHooks) h(g, ev);
    const c = [...g.world.all()].find((e: any) => e.type === 'cobra_car');
    return c && { owner: c.owner, player: g.player };
  });
  expect(car?.owner).toBe(car?.player);
  await expect(page.locator('.cheat-badge')).toBeVisible();
  await expect(page.locator('.msg').last()).toContainText('藍色跑車');

  // Phones: five taps on the clock panel open the same line.
  await page.evaluate(() => {
    const c = document.querySelector('.clocks')!;
    for (let i = 0; i < 5; i++) c.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });
  await expect(page.locator('.cheat-input')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('.cheat-input')).toBeHidden();
  expect(errors).toEqual([]);
});
