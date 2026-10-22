import { loadGameData } from '../../src/data/load';
import { loadMap } from '../../src/data/map';
import { step } from '../../src/sim/loop';
import { World } from '../../src/sim/world';
const w = new World(loadGameData(), loadMap(), { seed: 1, emptyMap: true, noFog: true });
w.faction('faction_voc')!.resources.powder = 0;
const f = w.spawnUnit('fire_ship', 'faction_zheng', 25, 46.5);
const ws = w.spawnUnit('warship', 'faction_voc', 28, 46.5);
w.enqueue({ type: 'attack', owner: 'faction_zheng', ids: [f.id], target: ws.id });
for (let i = 0; i < 100; i++) {
  step(w);
  for (const ev of w.events) if (ev.type !== 'tide') console.log(w.tick, JSON.stringify(ev));
  if (!w.get(f.id)) { console.log('fire ship gone at', w.tick, 'ws hp', ws.hp); break; }
}
console.log(f.x, f.y, ws.x, ws.y);
