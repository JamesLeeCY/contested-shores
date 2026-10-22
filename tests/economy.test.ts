import { describe, expect, it } from 'vitest';
import { checkPlacement } from '../src/sim/systems/build';
import { popCap, popUsed } from '../src/sim/stats';
import { T } from '../src/sim/map';
import type { World } from '../src/sim/world';
import { makeWorld, run } from './helpers';

const Z = 'faction_zheng';
const V = 'faction_voc';
const DAY = 1200;

function setRes(w: World, owner: string, r: Partial<Record<'grain' | 'wood' | 'powder' | 'deerskin', number>>) {
  Object.assign(w.faction(owner)!.resources, { grain: 0, wood: 0, powder: 0, deerskin: 0, ...r });
}

function freePlain(w: World, x0: number, y0: number, size: number): [number, number] {
  for (let r = 0; r < 30; r++)
    for (let y = y0 - r; y <= y0 + r; y++)
      for (let x = x0 - r; x <= x0 + r; x++) {
        let ok = true;
        for (let yy = y; yy < y + size && ok; yy++)
          for (let xx = x; xx < x + size && ok; xx++) ok = w.map.terrain[yy * w.map.width + xx] === T.plain && !w.occupancy[yy * w.map.width + xx];
        if (ok) return [x, y];
      }
  throw new Error('no free plain');
}

describe('economy: hand-calculated 600 s totals', () => {
  it('tuntian income, powder mill conversion and daily upkeep match the formulas exactly', () => {
    const w = makeWorld({ emptyMap: true });
    setRes(w, Z, { grain: 500, wood: 1000, powder: 0 });
    const [cx, cy] = freePlain(w, 114, 62, 4);
    w.spawnBuilding('camp_zheng', Z, cx, cy);
    const [tx, ty] = freePlain(w, cx + 6, cy, 3);
    const tun = w.spawnBuilding('tuntian', Z, tx, ty);
    const [mx, my] = freePlain(w, cx, cy + 6, 3);
    w.spawnBuilding('powder_mill', Z, mx, my);
    // 10 soldiers farming from tick 0, plus 4 idle soldiers and 2 idle labourers that only eat.
    for (let i = 0; i < 10; i++) {
      const u = w.spawnUnit('shield_soldier', Z, tx + 1.5, ty + 1.5);
      u.insideOf = tun.id;
      tun.garrisoned!.push(u.id);
    }
    for (let i = 0; i < 4; i++) w.spawnUnit('archer_zheng', Z, cx - 2.5, cy + i);
    for (let i = 0; i < 2; i++) w.spawnUnit('laborer', Z, cx - 3.5, cy + i);

    // 600 s = 12,000 ticks; run one more tick so the day-10 settlement at tick 12,000 is included.
    run(w, 12000 + 1);
    const r = w.faction(Z)!.resources;
    const days = 10;
    const tuntianGrain = 2 * 10 * (12001 / DAY); // continuous: 2 grain / soldier / day
    const upkeep = days * (14 * 1 + 2 * 0.5); // 14 combat units, 2 gatherers
    expect(r.grain).toBeCloseTo(500 + tuntianGrain - upkeep, 6);
    // Mill converts every 100 ticks: 120 conversions in 12,001 ticks.
    expect(r.powder).toBe(120);
    expect(r.wood).toBe(1000 - 240);
  });

  it('a labourer on a farm next to the camp delivers exactly what the trip cycle predicts', () => {
    const w = makeWorld({ emptyMap: true });
    setRes(w, Z, { grain: 1000 });
    const [cx, cy] = freePlain(w, 114, 62, 7);
    w.spawnBuilding('camp_zheng', Z, cx, cy);
    const farm = w.spawnBuilding('farm', Z, cx + 4, cy);
    // Farm workers stand at slot (id % 3) − 1; slot −1 is within drop-off reach of the camp,
    // so this labourer never walks.
    let lab = w.spawnUnit('laborer', Z, cx + 4.7, cy + 1.5);
    while (lab.id % 3 !== 0) {
      w.remove(lab.id);
      lab = w.spawnUnit('laborer', Z, cx + 4.7, cy + 1.5);
    }
    w.enqueue({ type: 'gather', owner: Z, ids: [lab.id], target: farm.id });
    run(w, 12000);
    // Hand calculation: 0.6 grain/s = 0.03/tick → ceil(10 / 0.03) = 334 ticks to fill,
    // +1 tick to deposit, +1 tick to resume = 336-tick cycle; first deposit at tick 335.
    const deposits = Math.floor((11999 - 335) / 336) + 1;
    expect(deposits).toBe(35);
    const upkeep = 9 * 0.5; // settlements at ticks 1,200 … 10,800
    expect(w.faction(Z)!.resources.grain).toBeCloseTo(1000 + deposits * 10 - upkeep, 6);
  });
});

describe('economy: start from one camp', () => {
  it('gathers wood, builds a barracks and trains a shield soldier', () => {
    const w = makeWorld();
    setRes(w, Z, { grain: 300, wood: 60 });
    // Camp in Saccam next to the eastern woods.
    const [cx, cy] = freePlain(w, 126, 40, 4);
    w.spawnBuilding('camp_zheng', Z, cx, cy);
    const labs = [0, 1, 2, 3, 4].map((i) => w.spawnUnit('laborer', Z, cx + 4.5, cy + 0.5 + i));
    // Nearest forest tile to the camp.
    let tile = -1;
    let best = Infinity;
    for (let i = 0; i < w.map.terrain.length; i++) {
      if (w.map.terrain[i] !== T.forest) continue;
      const d = Math.hypot((i % w.map.width) - cx, Math.floor(i / w.map.width) - cy);
      if (d < best) {
        best = d;
        tile = i;
      }
    }
    w.enqueue({ type: 'gather', owner: Z, ids: labs.map((l) => l.id), tile });
    // Wait for 150 wood (barracks cost).
    let t = 0;
    while (w.faction(Z)!.resources.wood < 150 && t < 20 * 400) {
      run(w, 20);
      t += 20;
    }
    expect(w.faction(Z)!.resources.wood).toBeGreaterThanOrEqual(150);
    const [bx, by] = freePlain(w, cx - 5, cy, 3);
    expect(checkPlacement(w, Z, 'barracks_zheng', bx, by)).toBeNull();
    w.enqueue({ type: 'place', owner: Z, building: 'barracks_zheng', tx: bx, ty: by, builders: [labs[0].id, labs[1].id] });
    run(w, 1);
    const barracks = [...w.all()].find((e) => e.type === 'barracks_zheng')!;
    expect(barracks.built).toBeLessThan(1);
    run(w, 20 * 40);
    expect(barracks.built).toBe(1);
    expect(barracks.hp).toBe(barracks.maxHp);
    w.enqueue({ type: 'produce', owner: Z, building: barracks.id, unit: 'shield_soldier' });
    run(w, 20 * 13);
    expect([...w.all()].filter((e) => e.type === 'shield_soldier')).toHaveLength(1);
    expect(t + 20 * 53).toBeLessThan(20 * 600);
  });
});

describe('placement, population, queues', () => {
  it('rejects water, occupied tiles, wrong faction, locked stage and unaffordable buildings', () => {
    const w = makeWorld();
    setRes(w, Z, { wood: 1000 });
    expect(checkPlacement(w, Z, 'barracks_zheng', 5, 50)).toBe('terrain');
    expect(checkPlacement(w, Z, 'barracks_zheng', 43, 56)).toBe('occupied');
    expect(checkPlacement(w, Z, 'barracks_voc', 120, 40)).toBe('faction');
    expect(checkPlacement(w, Z, 'tuntian', 128, 40)).toBe('stage');
    w.faction(Z)!.stage = 2;
    const [px, py] = freePlain(w, 128, 40, 3);
    expect(checkPlacement(w, Z, 'tuntian', px, py)).toBeNull();
    setRes(w, Z, { wood: 10 });
    expect(checkPlacement(w, Z, 'barracks_zheng', px, py)).toBe('cost');
    // Shipyard must touch water.
    setRes(w, Z, { wood: 1000 });
    expect(checkPlacement(w, Z, 'shipyard_zheng', px, py)).toBe('water');
  });

  it('production waits for population room and refunds on cancel', () => {
    const w = makeWorld({ emptyMap: true });
    setRes(w, V, { grain: 1000, wood: 1000, powder: 100 });
    w.faction(V)!.basePopCap = 2;
    const [bx, by] = freePlain(w, 120, 60, 3);
    const b = w.spawnBuilding('barracks_voc', V, bx, by);
    w.spawnUnit('pikeman', V, bx - 2, by);
    w.enqueue({ type: 'produce', owner: V, building: b.id, unit: 'pikeman' });
    w.enqueue({ type: 'produce', owner: V, building: b.id, unit: 'pikeman' });
    run(w, 20 * 40);
    expect(popUsed(w, V)).toBe(2);
    expect(popCap(w, V)).toBe(2);
    expect(b.queue).toHaveLength(1);
    expect(b.popBlocked).toBe(true);
    const grain = w.faction(V)!.resources.grain;
    w.enqueue({ type: 'cancel', owner: V, building: b.id, index: 0 });
    run(w, 1);
    expect(w.faction(V)!.resources.grain).toBe(grain + 50);
  });

  it('starvation lowers morale by 5 per 10 grain short', () => {
    const w = makeWorld({ emptyMap: true });
    setRes(w, V, { grain: 5 });
    const us = [0, 1, 2].map((i) => w.spawnUnit('pikeman', V, 120 + i, 60));
    // Need 3 grain/day: day 1 OK (5→2); day 2 short by 1 → 1 step → −5 morale.
    run(w, DAY * 2 + 1);
    expect(w.faction(V)!.resources.grain).toBe(0);
    for (const u of us) expect(u.morale).toBeCloseTo(70 - 5, 1);
  });

  it('researching a tech applies its effect (排槍操典: interval 2.8 → 2.4)', async () => {
    const { unitStat } = await import('../src/sim/stats');
    const w = makeWorld({ emptyMap: true });
    setRes(w, V, { grain: 1000, powder: 100 });
    const [bx, by] = freePlain(w, 120, 60, 3);
    const b = w.spawnBuilding('barracks_voc', V, bx, by);
    const m = w.spawnUnit('musketeer_voc', V, bx - 2, by);
    expect(unitStat(w, m, 'atkInterval')).toBe(2.8);
    w.enqueue({ type: 'research', owner: V, building: b.id, tech: 'tech_drill_voc' });
    run(w, 20 * 50 + 2);
    expect(w.faction(V)!.techs).toContain('tech_drill_voc');
    expect(unitStat(w, m, 'atkInterval')).toBe(2.4);
  });

  it('tuntian soldiers enter, farm, and come out 10 s after recall', () => {
    const w = makeWorld({ emptyMap: true });
    w.faction(Z)!.stage = 2;
    const [tx, ty] = freePlain(w, 120, 60, 3);
    const tun = w.spawnBuilding('tuntian', Z, tx, ty);
    const s = w.spawnUnit('shield_soldier', Z, tx - 2, ty);
    w.enqueue({ type: 'garrison', owner: Z, ids: [s.id], target: tun.id });
    run(w, 20 * 10);
    expect(s.insideOf).toBe(tun.id);
    w.enqueue({ type: 'ungarrison', owner: Z, building: tun.id });
    run(w, 20 * 9);
    expect(s.insideOf).toBe(tun.id);
    run(w, 20 * 2);
    expect(s.insideOf).toBeFalsy();
  });

  it('cutting a forest tile down to zero turns it into plain', () => {
    const w = makeWorld();
    let tile = -1;
    for (let i = 0; i < w.map.terrain.length && tile < 0; i++) if (w.map.terrain[i] === T.forest && (i % w.map.width) > 120) tile = i;
    w.woodLeft[tile] = 5;
    const x = tile % w.map.width;
    const y = Math.floor(tile / w.map.width);
    const lab = w.spawnUnit('laborer', Z, x + 0.5, y + 1.5);
    w.spawnBuilding('camp_zheng', Z, ...freePlain(w, x + 3, y + 3, 4));
    w.enqueue({ type: 'gather', owner: Z, ids: [lab.id], tile });
    run(w, 20 * 30);
    expect(w.map.terrain[tile]).toBe(T.plain);
  });
});
