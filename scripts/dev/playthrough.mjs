// Plays the whole campaign on a deployed build (AI on both sides, fast-forwarded with the game's own
// step function), clicking through each result screen to the campaign ending.
//   node scripts/dev/playthrough.mjs https://jamesleecy.github.io/siege-of-tayouan-1661/
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://localhost:4173/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(`${url}?chapter=1&spectate=1&skipCutscenes=1`);

for (let ch = 1; ch <= 4; ch++) {
  await page.waitForFunction((c) => window.__game?.world?.scenario?.chapter === c, ch, { timeout: 60_000 });
  const t0 = Date.now();
  const result = await page.evaluate(async () => {
    const g = window.__game;
    g.stepper.paused = true;
    const w = g.world;
    // Fast-forward in slices so the page stays responsive.
    while (!w.ext.flags.missionOver && w.tick < 45 * 60 * 20) {
      for (let i = 0; i < 400 && !w.ext.flags.missionOver; i++) {
        window.__step(w);
        for (const ev of w.events) for (const h of g.eventHooks) h(g, ev);
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    return {
      seconds: Math.round(w.tick / 20),
      zheng: w.ext.flags['outcome:faction_zheng'],
      voc: w.ext.flags['outcome:faction_voc'],
      reason: w.ext.flags['outcomeReason:faction_zheng'],
    };
  });
  console.log(`chapter ${ch}: ${JSON.stringify(result)} (${((Date.now() - t0) / 1000).toFixed(0)} s real)`);
  // Spectating has no player side; close any cutscene and use the result screen's primary button.
  await page.evaluate(() => document.querySelectorAll('.cutscene').forEach((c) => c.remove()));
  await page.locator('.result').waitFor({ timeout: 30_000 });
  await page.locator('.result-bar .primary').click();
}
await page.locator('.ending-text').waitFor({ timeout: 30_000 });
console.log('ending:', (await page.locator('.menu-title').first().textContent()).trim());
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
