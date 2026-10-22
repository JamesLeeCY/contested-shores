// Times each system while AIs play a chapter (dev tool).  tsx scripts/dev/profile-chapter.ts 2 3000
import { loadGameData } from '../../src/data/load';
import { loadMap } from '../../src/data/map';
import { scenarioById } from '../../src/data/scenarios';
import { enableAi } from '../../src/sim/ai';
import { executeCommand } from '../../src/sim/commands';
import { applyScenario } from '../../src/sim/scenario/setup';
import { SYSTEMS } from '../../src/sim/systems';
import { World } from '../../src/sim/world';

const ch = Number(process.argv[2] ?? 2);
const N = Number(process.argv[3] ?? 3000);
const sc = scenarioById(`ch${ch}`);
const w = new World(loadGameData(), loadMap(), { seed: 2 });
applyScenario(w, sc);
for (const [o, s] of Object.entries(sc.ai ?? {})) enableAi(w, o, s);
const times = new Map<string, number>();
let worst = { ms: 0, tick: 0, sys: '' };
let cmds = 0;
const t0 = performance.now();
for (let t = 0; t < N; t++) {
  w.events = [];
  const c = w.pending;
  w.pending = [];
  cmds += c.length;
  const a0 = performance.now();
  for (const x of c) executeCommand(w, x);
  times.set('commands', (times.get('commands') ?? 0) + performance.now() - a0);
  for (const s of SYSTEMS) {
    const a = performance.now();
    s.fn(w);
    const d = performance.now() - a;
    times.set(s.name, (times.get(s.name) ?? 0) + d);
    if (d > worst.ms) worst = { ms: d, tick: w.tick, sys: s.name };
  }
  w.tick++;
}
console.log(`ch${ch}: ${N} ticks, ${((performance.now() - t0) / N).toFixed(2)} ms/tick, units=${[...w.all()].filter((e) => e.kind === 'unit').length}, commands=${cmds}, worst=${JSON.stringify(worst)}`);
for (const [k, v] of [...times].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(k.padEnd(12), (v / N).toFixed(3), 'ms/tick');
