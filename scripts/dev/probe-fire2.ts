import { loadGameData } from '../../src/data/load';
import { loadMap } from '../../src/data/map';
import { scenarioById } from '../../src/data/scenarios';
import { enableAi } from '../../src/sim/ai';
import { visibleEnemies } from '../../src/sim/ai/common';
import { step } from '../../src/sim/loop';
import { applyScenario } from '../../src/sim/scenario/setup';
import { World } from '../../src/sim/world';
const data = loadGameData();
data.rules.ai.fireShipStrikeRadius = 30;
const sc = scenarioById('ch3');
const w = new World(data, loadMap(), { seed: 101 });
applyScenario(w, sc);
for (const [o, s] of Object.entries(sc.ai ?? {})) enableAi(w, o, s);
while (w.tick < 300 * 20) step(w);
for (let s = 300; s < 400; s += 10) {
  while (w.tick < s * 20) step(w);
  const ships = [...w.all()].filter((e) => e.owner === 'faction_voc' && e.moveClass !== 'foot');
  const vis = visibleEnemies(w, 'faction_zheng', (e) => e.moveClass !== 'foot');
  const fs = [...w.all()].filter((e) => e.type === 'fire_ship');
  const d = Math.min(...fs.flatMap((f) => ships.map((t) => Math.hypot(t.x - f.x, t.y - f.y))));
  console.log(s, 'voc ships', ships.length, 'visible', vis.length, 'min dist', d.toFixed(1), 'fire', fs.map((f) => `${f.order?.type}${f.stranded ? '/S' : ''}`).join(','), 'tide', w.tidePhaseId);
}
