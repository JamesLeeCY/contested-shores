// Counts A* requests by the requesting unit's order type (dev tool).
import { loadGameData } from '../../src/data/load';
import { loadMap } from '../../src/data/map';
import { scenarioById } from '../../src/data/scenarios';
import { enableAi } from '../../src/sim/ai';
import { step } from '../../src/sim/loop';
import { applyScenario } from '../../src/sim/scenario/setup';
import { World } from '../../src/sim/world';
const ch = Number(process.argv[2] ?? 2);
const sc = scenarioById(`ch${ch}`);
const w = new World(loadGameData(), loadMap(), { seed: 1 });
applyScenario(w, sc);
for (const [o, s] of Object.entries(sc.ai ?? {})) enableAi(w, o, s);
const counts = new Map<string, number>();
const orig = w.paths.request.bind(w.paths);
w.paths.request = (r) => {
  const e = w.get(r.id)!;
  const k = `${e.order?.type}${e.chasing ? '+chase' : ''} ${e.moveClass}`;
  counts.set(k, (counts.get(k) ?? 0) + 1);
  orig(r);
};
let expanded = 0;
for (let t = 0; t < 20 * Number(process.argv[3] ?? 200); t++) {
  step(w);
  expanded += w.paths.expandedThisTick;
}
console.log('expanded nodes total', expanded);
console.log([...counts].sort((a, b) => b[1] - a[1]));
