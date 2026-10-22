// Times each simulation system over a busy sandbox battle (dev tool).
import { loadGameData } from '../../src/data/load';
import { loadMap } from '../../src/data/map';
import { executeCommand } from '../../src/sim/commands';
import { setupSandbox } from '../../src/sim/sandbox';
import { SYSTEMS } from '../../src/sim/systems';
import { World } from '../../src/sim/world';

const w = new World(loadGameData(), loadMap(), { seed: 3 });
setupSandbox(w, 'armies');
const zf = [...w.all()].filter((e) => e.owner === 'faction_zheng' && e.kind === 'unit' && e.moveClass === 'foot').map((e) => e.id);
w.enqueue({ type: 'attack_move', owner: 'faction_zheng', ids: zf, x: 44, y: 64 });
const times = new Map<string, number>();
const N = Number(process.argv[2] ?? 2000);
const t0 = performance.now();
for (let t = 0; t < N; t++) {
  w.events = [];
  const cmds = w.pending;
  w.pending = [];
  for (const c of cmds) executeCommand(w, c);
  for (const s of SYSTEMS) {
    const a = performance.now();
    s.fn(w);
    times.set(s.name, (times.get(s.name) ?? 0) + performance.now() - a);
  }
  w.tick++;
}
const total = performance.now() - t0;
console.log(`${N} ticks, ${(total / N).toFixed(3)} ms/tick, units=${[...w.all()].filter((e) => e.kind === 'unit').length}`);
for (const [k, v] of [...times].sort((a, b) => b[1] - a[1])) console.log(k.padEnd(12), (v / N).toFixed(3), 'ms/tick');
