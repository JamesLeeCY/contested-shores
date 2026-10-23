import { loadGameData } from '../../src/data/load';
import { loadMap } from '../../src/data/map';
import { scenarioById } from '../../src/data/scenarios';
import { enableAi } from '../../src/sim/ai';
import { step } from '../../src/sim/loop';
import { applyScenario } from '../../src/sim/scenario/setup';
import { World } from '../../src/sim/world';
const sc = scenarioById('ch3');
const w = new World(loadGameData(), loadMap(), { seed: 101 });
applyScenario(w, sc);
for (const [o, s] of Object.entries(sc.ai ?? {})) enableAi(w, o, s);
const counts = (s: number) => {
  const m = new Map<string, number>();
  for (const e of w.all()) if (e.owner === 'faction_voc' && e.moveClass !== 'foot') m.set(`${e.type}/${e.tag}`, (m.get(`${e.type}/${e.tag}`) ?? 0) + 1);
  console.log(s, Object.fromEntries(m));
};
counts(0);
for (const ev of []) void ev;
while (w.tick < 300 * 20) {
  step(w);
  for (const e of w.events) if (e.type === 'produced' && e.owner === 'faction_voc') console.log(w.tick / 20, 'produced', e.unit);
}
counts(300);
