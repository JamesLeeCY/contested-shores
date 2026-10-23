import { expect, test } from '@playwright/test';

// Spec §11 stage 9: 300-unit scene at 60 FPS, memory < 500 MB. Headless Chromium uses a software
// renderer, so we measure the work per frame (simulation + render submission) against the 16.7 ms
// budget rather than the throttled headless frame rate.
test('300-unit battle: frame work fits a 60 FPS budget and the heap stays under 500 MB', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('./?mode=sandbox');
  await page.waitForFunction(() => (window as any).__game?.world);
  const result = await page.evaluate(() => {
    const g = (window as any).__game;
    const w = g.world;
    // Top the sandbox up to ~300 units and start a battle in view.
    for (let i = 0; i < 80; i++) w.spawnUnit(i % 2 ? 'archer_zheng' : 'shield_soldier', 'faction_zheng', 40 + (i % 10) * 0.8, 36 + Math.floor(i / 10) * 0.8);
    for (let i = 0; i < 70; i++) w.spawnUnit(i % 3 ? 'musketeer_voc' : 'pikeman', 'faction_voc', 52 + (i % 10) * 0.8, 35 + Math.floor(i / 10) * 0.8);
    const units = [...w.all()].filter((e: any) => e.kind === 'unit');
    w.enqueue({ type: 'attack_move', owner: 'faction_zheng', ids: units.filter((e: any) => e.owner === 'faction_zheng' && e.moveClass === 'foot').map((e: any) => e.id), x: 55, y: 38 });
    w.enqueue({ type: 'attack_move', owner: 'faction_voc', ids: units.filter((e: any) => e.owner === 'faction_voc' && e.moveClass === 'foot').map((e: any) => e.id), x: 42, y: 38 });
    g.camera.centerOn(48, 38);
    g.camera.zoom = 1;
    g.stepper.paused = true; // we drive frames by hand below
    const stepFn = (window as any).__step as (w: unknown) => void;
    const app = g.app;
    const frames: number[] = [];
    for (let f = 0; f < 240; f++) {
      const t0 = performance.now();
      // At 1× speed the 20 Hz simulation advances one tick every third 60 Hz frame.
      if (f % 3 === 0) stepFn(w);
      g.entities.sync(w, 1, g.selected);
      app.renderer.render(app.stage);
      frames.push(performance.now() - t0);
    }
    frames.sort((a, b) => a - b);
    const mem = (performance as any).memory?.usedJSHeapSize ?? 0;
    return {
      units: [...w.all()].filter((e: any) => e.kind === 'unit').length,
      median: frames[frames.length >> 1],
      p95: frames[Math.floor(frames.length * 0.95)],
      heapMB: mem / 1048576,
    };
  });
  console.log(JSON.stringify(result));
  expect(result.units).toBeGreaterThanOrEqual(280);
  expect(result.p95).toBeLessThan(16.7);
  if (result.heapMB) expect(result.heapMB).toBeLessThan(500);
});
