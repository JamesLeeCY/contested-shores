import { loadGameData } from '../../src/data/load';
import { loadMap } from '../../src/data/map';
import { scenarioById } from '../../src/data/scenarios';
import { enableAi } from '../../src/sim/ai';
import { step } from '../../src/sim/loop';
import { applyScenario } from '../../src/sim/scenario/setup';
import { World } from '../../src/sim/world';
const sc = scenarioById('ch1');
const w = new World(loadGameData(), loadMap(), { seed: 1 });
applyScenario(w, sc);
for (const [o, s] of Object.entries(sc.ai ?? {})) enableAi(w, o, s);
const orig = w.enqueue.bind(w);
w.enqueue = (c) => { if (c.owner === 'faction_voc' && (c.type === 'unload' || c.type === 'embark' || c.type === 'move') && w.tick > 3600) console.log(w.tick, JSON.stringify(c).slice(0, 160)); orig(c); };
for (let t = 0; t < 20 * 200; t++) {
  step(w);
  const b = w.get(81);
  if (t > 3600 && t % 20 === 0 && b) console.log(w.tick, 'boat81', b.x.toFixed(1), b.y.toFixed(1), JSON.stringify(b.order), 'goal', b.goalX?.toFixed(1), b.goalY?.toFixed(1), 'pend', b.pathPending, 'cargo', b.cargo?.length, 'stranded', b.stranded);
}
