// Lists the units issuing the most A* requests, with their order and goal (dev tool).
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
const per = new Map<number, { n: number; last: string }>();
const orig = w.paths.request.bind(w.paths);
w.paths.request = (r) => {
  const e = w.get(r.id)!;
  const rec = per.get(r.id) ?? { n: 0, last: '' };
  rec.n++;
  rec.last = `${e.type} ${e.owner} order=${JSON.stringify(e.order)} at=(${e.x.toFixed(1)},${e.y.toFixed(1)}) goal=(${r.gx},${r.gy}) stuck=${e.stuck} tick=${w.tick}`;
  per.set(r.id, rec);
  orig(r);
};
for (let t = 0; t < 20 * Number(process.argv[3] ?? 200); t++) step(w);
for (const [id, r] of [...per].sort((a, b) => b[1].n - a[1].n).slice(0, 10)) console.log(id, r.n, r.last);
