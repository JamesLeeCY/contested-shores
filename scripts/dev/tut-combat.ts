import { loadGameData } from '../../src/data/load';
import { loadMap } from '../../src/data/map';
import { step } from '../../src/sim/loop';
import { World } from '../../src/sim/world';
import { setupTutorial } from '../../src/ui/tutorial';
const w = new World(loadGameData(), loadMap(), { seed: 1661 });
setupTutorial(w);
for (let i = 0; i < 400; i++) step(w);
const enemies = [0, 1, 2, 3].map((i) => w.spawnUnit('pikeman', 'faction_voc', 113 + (i % 2), 48 + Math.floor(i / 2), 'tut_enemy'));
const ids = [...w.all()].filter((e) => e.owner === 'faction_zheng' && e.kind === 'unit' && e.type !== 'laborer' && e.moveClass === 'foot').map((e) => e.id);
w.enqueue({ type: 'attack_move', owner: 'faction_zheng', ids, x: 113.5, y: 48.5 });
for (let s = 0; s < 60; s++) {
  for (let i = 0; i < 20; i++) step(w);
  if (s % 10 === 0) console.log(s, 'enemies', enemies.filter((e) => w.get(e.id)).map((e) => `${e.x.toFixed(1)},${e.y.toFixed(1)} hp${Math.round(e.hp)}`).join(' | '), 'z', ids.filter((id) => w.get(id)).length);
}
