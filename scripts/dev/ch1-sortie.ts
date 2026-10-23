import { loadGameData } from '../../src/data/load';
import { loadMap } from '../../src/data/map';
import { scenarioById } from '../../src/data/scenarios';
import { enableAi } from '../../src/sim/ai';
import { step } from '../../src/sim/loop';
import { applyScenario } from '../../src/sim/scenario/setup';
import { World } from '../../src/sim/world';
const sc = scenarioById('ch1');
for (const seed of [101, 102, 103]) {
  const w = new World(loadGameData(), loadMap(), { seed });
  applyScenario(w, sc);
  for (const [o, s] of Object.entries(sc.ai ?? {})) enableAi(w, o, s);
  const deaths: Record<string, number> = {};
  while (!w.ext.flags.missionOver && w.tick < 1200 * 20) {
    step(w);
    for (const e of w.events) if (e.type === 'death' && e.owner === 'faction_voc') {
      const u = w.entities.get(e.id as number);
      void u;
      const k = `${e.unitType}`;
      deaths[k] = (deaths[k] ?? 0) + 1;
    }
  }
  const onBax = [...w.all()].filter((e) => e.owner === 'faction_voc' && e.kind === 'unit' && e.y < 43 && e.moveClass === 'foot').length;
  console.log(seed, `${(w.tick / 20).toFixed(0)}s`, w.ext.flags['outcomeReason:faction_zheng'], 'voc deaths', JSON.stringify(deaths), 'voc on baxemboy', onBax);
}
