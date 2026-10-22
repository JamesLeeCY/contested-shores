import { loadGameData } from '../../src/data/load';
import { loadMap } from '../../src/data/map';
import { step } from '../../src/sim/loop';
import { setupSandbox } from '../../src/sim/sandbox';
import { World } from '../../src/sim/world';
const w = new World(loadGameData(), loadMap(), { seed: 1661 });
setupSandbox(w, 'armies');
const ids = [...w.all()].filter((e) => e.owner === 'faction_zheng' && e.kind === 'unit' && e.moveClass === 'foot' && e.type !== 'laborer').map((e) => e.id);
w.enqueue({ type: 'attack_move', owner: 'faction_zheng', ids, x: 57, y: 37 });
const u = w.get(ids[5])!;
for (let i = 0; i < 60; i++) {
  step(w);
  if (i % 10 === 0) console.log(w.tick, u.x.toFixed(2), u.y.toFixed(2), JSON.stringify(u.order), u.goalX, u.flowKey, u.attackTarget, u.pathPending);
}
