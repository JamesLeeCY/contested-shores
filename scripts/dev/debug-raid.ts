import { loadGameData } from '../../src/data/load';
import { loadMap } from '../../src/data/map';
import { step } from '../../src/sim/loop';
import { World } from '../../src/sim/world';
import { changeFavor, ensureParties } from '../../src/sim/systems/diplomacy';
import { isEnemy } from '../../src/sim/systems/combat';
const Z = 'faction_zheng';
const w = new World(loadGameData(), loadMap(), { seed: 1, noFog: true });
ensureParties(w);
const p = w.ext.parties.soulang;
changeFavor(w, p, Z, -30, 'sandbox');
w.spawnBuilding('camp_zheng', Z, 120, 40);
const lab = w.spawnUnit('laborer', Z, 125.5, 41.5);
for (let i = 0; i < 2405; i++) step(w);
const r = w.get(p.raiders[0])!;
console.log(w.tick, JSON.stringify(r.order), 'lab', !!w.get(lab.id), lab.insideOf, isEnemy(w, r.owner, Z), r.x, r.y);
for (let i = 0; i < 20; i++) { step(w); console.log(w.tick, JSON.stringify(r.order), r.attackTarget); }
