import { loadGameData } from '../../src/data/load';
import { loadMap } from '../../src/data/map';
import { scenarioById } from '../../src/data/scenarios';
import { enableAi } from '../../src/sim/ai';
import { step } from '../../src/sim/loop';
import { applyScenario } from '../../src/sim/scenario/setup';
import { World } from '../../src/sim/world';
const sc = scenarioById('ch3');
const w = new World(loadGameData(), loadMap(), { seed: 1 });
applyScenario(w, sc);
for (const [o, s] of Object.entries(sc.ai ?? {})) enableAi(w, o, s);
for (const secs of [310, 340, 400]) {
  while (w.tick < secs * 20) step(w);
  console.log('--', secs, 's');
  for (const b of w.buildings()) if (b.type === 'battery') console.log('battery', b.tag, b.hp, '/', b.maxHp);
  for (const e of w.all()) if (e.kind === 'unit' && (e.type === 'light_cannon' || (e.owner === 'faction_voc' && e.moveClass !== 'foot')))
    console.log(e.type, e.owner.slice(8), e.tag, e.x.toFixed(1), e.y.toFixed(1), 'hp', Math.round(e.hp), JSON.stringify(e.order), 'tgt', e.attackTarget, 'stranded', !!e.stranded);
}
