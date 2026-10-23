import { loadGameData } from '../../src/data/load';
import { loadMap } from '../../src/data/map';
import { scenarioById } from '../../src/data/scenarios';
import { enableAi } from '../../src/sim/ai';
import { step } from '../../src/sim/loop';
import { applyScenario } from '../../src/sim/scenario/setup';
import { World } from '../../src/sim/world';
const data = loadGameData();
data.rules.ai.fireShipStrikeRadius = 30;
const sc = scenarioById('ch3');
const w = new World(data, loadMap(), { seed: 101 });
applyScenario(w, sc);
for (const [o, s] of Object.entries(sc.ai ?? {})) enableAi(w, o, s);
for (const secs of [20, 120, 310, 360]) {
  while (w.tick < secs * 20) step(w);
  const ai = w.ext.ai.faction_zheng;
  console.log(secs, 's plan', ai.plans, ai.planIdx, ai.stepIdx, 'bg', ai.background, 'state', ai.state);
  for (const e of w.all()) if (e.type === 'fire_ship') console.log('  fire', e.x.toFixed(1), e.y.toFixed(1), JSON.stringify(e.order), 'stranded', !!e.stranded);
}
