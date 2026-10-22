import { loadGameData } from '../../src/data/load';
import { loadMap } from '../../src/data/map';
import { scenarioById } from '../../src/data/scenarios';
import { enableAi } from '../../src/sim/ai';
import { findSite } from '../../src/sim/ai/plans';
import { checkPlacement } from '../../src/sim/systems/build';
import { applyScenario } from '../../src/sim/scenario/setup';
import { World } from '../../src/sim/world';
const sc = scenarioById('ch4');
const w = new World(loadGameData(), loadMap(), { seed: 1 });
applyScenario(w, sc);
const ai = enableAi(w, 'faction_zheng', sc.ai!.faction_zheng);
const ctx = { world: w, ai, owner: 'faction_zheng' };
for (let k = 0; k < 3; k++) {
  let t = performance.now();
  const r = findSite(ctx, 'barracks_zheng', 71, 66);
  console.log('findSite', r, (performance.now() - t).toFixed(2), 'ms');
  t = performance.now();
  let n = 0;
  for (let i = 0; i < 1000; i++) if (!checkPlacement(w, 'faction_zheng', 'barracks_zheng', 60 + (i % 20), 60 + Math.floor(i / 50))) n++;
  console.log('1000 checkPlacement', (performance.now() - t).toFixed(2), 'ms', n);
}
