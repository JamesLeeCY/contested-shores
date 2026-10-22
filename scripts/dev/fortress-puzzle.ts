// Prints losses for the stage-4 "fortress is a puzzle" scenarios across several seeds.
import { loadGameData } from '../../src/data/load';
import { loadMap } from '../../src/data/map';
import { step } from '../../src/sim/loop';
import { World } from '../../src/sim/world';
const Z = 'faction_zheng', V = 'faction_voc';
const data = loadGameData(), map = loadMap();
function setup(seed: number) {
  const w = new World(data, map, { seed, emptyMap: true, noFog: true });
  Object.assign(w.faction(V)!.resources, { powder: 5000, grain: 5000 });
  Object.assign(w.faction(Z)!.resources, { powder: 5000, grain: 5000 });
  const b1 = w.spawnBuilding('bastion', V, 118, 50), b2 = w.spawnBuilding('bastion', V, 124, 50);
  const s: number[] = [];
  for (let i = 0; i < 40; i++) s.push(w.spawnUnit('shield_soldier', Z, 117.5 + (i % 10), 70.5 + Math.floor(i / 10)).id);
  return { w, b1, b2, s };
}
const alive = (w: World, ids: number[]) => ids.filter((id) => w.get(id)).length;
const run = (w: World, n: number) => { for (let i = 0; i < n; i++) step(w); };
for (const seed of [1, 2, 3, 7, 11]) {
  const a = setup(seed);
  a.w.enqueue({ type: 'attack', owner: Z, ids: a.s, target: a.b1.id });
  for (let t = 0; t < 20 * 400; t += 20) {
    run(a.w, 20);
    if (!a.w.get(a.b1.id) && a.w.get(a.b2.id) && t % 200 === 0) a.w.enqueue({ type: 'attack', owner: Z, ids: a.s.filter((id) => a.w.get(id)), target: a.b2.id });
    if ((!a.w.get(a.b1.id) && !a.w.get(a.b2.id)) || !alive(a.w, a.s)) break;
  }
  const b = setup(seed);
  b.w.faction(Z)!.stage = 4;
  for (let x = 117; x <= 127; x++) for (let y = 70; y <= 73; y++) b.w.spawnBuilding('trench', Z, x, y);
  for (const [bx, t] of [[119, b.b1], [125, b.b2]] as const) {
    b.w.spawnBuilding('battery', Z, bx, 64);
    for (const dx of [0.5, 1.5]) { const g = b.w.spawnUnit('heavy_cannon', Z, bx + dx, 64.5); b.w.enqueue({ type: 'attack', owner: Z, ids: [g.id], target: t.id }); }
  }
  let tt = 0;
  for (; tt < 20 * 900 && (b.w.get(b.b1.id) || b.w.get(b.b2.id)); tt += 20) run(b.w, 20);
  b.w.enqueue({ type: 'attack_move', owner: Z, ids: b.s, x: 122, y: 51 });
  run(b.w, 20 * 40);
  console.log(`seed ${seed}: frontal loss ${40 - alive(a.w, a.s)}/40 (${a.w.get(a.b1.id) ? 'b1 standing' : 'b1 down'}, ${a.w.get(a.b2.id) ? 'b2 standing' : 'b2 down'}); trench+battery loss ${40 - alive(b.w, b.s)}/40, bastions down after ${tt / 20}s`);
}
