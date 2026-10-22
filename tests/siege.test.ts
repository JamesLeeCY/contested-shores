import { describe, expect, it } from 'vitest';
import { captureBuilding, mineOrigin } from '../src/sim/systems/siege';
import { isVisibleTo, updateFog } from '../src/sim/systems/fog';
import { T } from '../src/sim/map';
import type { World } from '../src/sim/world';
import { makeWorld, run } from './helpers';

const Z = 'faction_zheng';
const V = 'faction_voc';

/**
 * Two bastions (crossfire) on the Saccam plain, 40 shield soldiers 17 tiles south.
 * Returns the world and the soldier ids.
 */
function fortress(seed: number) {
  const w = makeWorld({ emptyMap: true, noFog: true, seed });
  Object.assign(w.faction(V)!.resources, { powder: 5000, grain: 5000 });
  Object.assign(w.faction(Z)!.resources, { powder: 5000, grain: 5000 });
  const b1 = w.spawnBuilding('bastion', V, 118, 50);
  const b2 = w.spawnBuilding('bastion', V, 124, 50);
  const soldiers: number[] = [];
  for (let i = 0; i < 40; i++) soldiers.push(w.spawnUnit('shield_soldier', Z, 117.5 + (i % 10) * 1.0, 70.5 + Math.floor(i / 10) * 1.0).id);
  return { w, b1, b2, soldiers };
}

const alive = (w: World, ids: number[]) => ids.filter((id) => w.get(id)).length;

describe('stage 4 acceptance: the fortress is a puzzle (spec §2.2, §11)', () => {
  it('40 shield soldiers charging two bastions in crossfire lose more than half', { timeout: 120_000 }, () => {
    const { w, b1, b2, soldiers } = fortress(7);
    w.enqueue({ type: 'attack', owner: Z, ids: soldiers, target: b1.id });
    for (let t = 0; t < 20 * 400; t += 20) {
      run(w, 20);
      if (!w.get(b1.id) && w.get(b2.id) && t % 200 === 0)
        w.enqueue({ type: 'attack', owner: Z, ids: soldiers.filter((id) => w.get(id)), target: b2.id });
      if ((!w.get(b1.id) && !w.get(b2.id)) || alive(w, soldiers) === 0) break;
    }
    const lost = 40 - alive(w, soldiers);
    expect(lost / 40).toBeGreaterThan(0.5);
  });

  it('the same force waiting in trenches while battery guns reduce the bastions loses less than a quarter', { timeout: 120_000 }, () => {
    const { w, b1, b2, soldiers } = fortress(7);
    w.faction(Z)!.stage = 4;
    // Trench line under the soldiers.
    for (let x = 117; x <= 127; x++) for (let y = 70; y <= 73; y++) w.spawnBuilding('trench', Z, x, y);
    // Two batteries 11.2 tiles from the bastions: inside heavy-cannon range (10 + 2), outside bastion range (11).
    const guns: number[] = [];
    for (const [bx, b] of [[119, b1], [125, b2]] as const) {
      w.spawnBuilding('battery', Z, bx, 64);
      for (const dx of [0.5, 1.5]) {
        const g = w.spawnUnit('heavy_cannon', Z, bx + dx, 64.5);
        guns.push(g.id);
        w.enqueue({ type: 'attack', owner: Z, ids: [g.id], target: b.id });
      }
    }
    for (let t = 0; t < 20 * 900 && (w.get(b1.id) || w.get(b2.id)); t += 20) run(w, 20);
    expect(w.get(b1.id)).toBeUndefined();
    expect(w.get(b2.id)).toBeUndefined();
    // Then the infantry walks in.
    w.enqueue({ type: 'attack_move', owner: Z, ids: soldiers, x: 122, y: 51 });
    run(w, 20 * 40);
    const lost = 40 - alive(w, soldiers);
    expect(lost / 40).toBeLessThan(0.25);
    expect(alive(w, guns)).toBe(4);
  });
});

describe('capture', () => {
  it('Provintia falls to soldiers at its gate once below half HP and undefended', () => {
    const w = makeWorld({ emptyMap: true, noFog: true });
    w.faction(V)!.resources.powder = 0; // silent guns
    const fort = w.spawnBuilding('provintia_fort', V, 118, 50);
    const ids = [0, 1, 2].map((i) => w.spawnUnit('shield_soldier', Z, 117 + i, 56).id);
    // Full HP: no capture.
    run(w, 20 * 15);
    expect(fort.owner).toBe(V);
    fort.hp = fort.maxHp * 0.4;
    for (const id of ids) w.get(id)!.order = { type: 'idle' };
    w.enqueue({ type: 'move', owner: Z, ids, x: 120.5, y: 55.6 });
    run(w, 20 * 15);
    expect(fort.owner).toBe(Z);
  });

  it('capturing Utrecht costs VOC 20 castle morale and boosts cannons against the castle', () => {
    const w = makeWorld({ noFog: true });
    const utrecht = [...w.all()].find((e) => e.type === 'utrecht_redoubt')!;
    const before = w.faction(V)!.castleMorale;
    w.rebuildSpatial();
    captureBuilding(w, utrecht, Z);
    expect(w.faction(V)!.castleMorale).toBe(before - 20);
    expect(w.faction(Z)!.mainBaseCannonBonus).toBe(0.5);
  });

  it('capturable forts never drop below 1 HP', async () => {
    const { applyDamage } = await import('../src/sim/systems/combat');
    const w = makeWorld({ emptyMap: true, noFog: true });
    const fort = w.spawnBuilding('provintia_fort', V, 118, 50);
    applyDamage(w, fort, 99999);
    expect(fort.hp).toBe(1);
    expect(w.get(fort.id)).toBeDefined();
  });
});

describe('mines (坑道)', () => {
  it('needs stage 4, a trench within 8 tiles, and explodes for 1,500 after 15 s per tile', () => {
    const w = makeWorld({ emptyMap: true, noFog: true });
    const wall = w.spawnBuilding('bastion', V, 120, 50);
    expect(mineOrigin(w, Z, wall)).toBe('stage');
    w.faction(Z)!.stage = 4;
    expect(mineOrigin(w, Z, wall)).toBe('no_trench');
    w.spawnBuilding('trench', Z, 121, 63);
    expect(mineOrigin(w, Z, wall)).toBe('too_far');
    const trench = w.spawnBuilding('trench', Z, 121, 58);
    expect(mineOrigin(w, Z, wall)).toBe(trench);
    w.faction(V)!.resources.powder = 0;
    const lab = w.spawnUnit('laborer', Z, 121.5, 59.5);
    w.enqueue({ type: 'dig_mine', owner: Z, ids: [lab.id], target: wall.id });
    run(w, 2);
    const mine = [...w.all()].find((e) => e.type === 'mine')!;
    expect(mine.mineLength).toBe(6); // trench centre (121.5,58.5) → bastion edge y=53: 5.5 → 6 tiles
    const hp0 = wall.hp;
    run(w, 20 * 15 * 6 - 40);
    expect(wall.hp).toBe(hp0);
    run(w, 60);
    expect(wall.hp).toBe(hp0 - 1500);
    expect(w.get(mine.id)).toBeUndefined();
  });

  it('VOC sees mines only after researching counter-mining', () => {
    const w = makeWorld({ emptyMap: true, noFog: true });
    w.faction(Z)!.stage = 4;
    w.faction(V)!.resources.powder = 0; // keep the bastion from shooting the digger
    const wall = w.spawnBuilding('bastion', V, 120, 50);
    w.spawnBuilding('trench', Z, 121, 58);
    const lab = w.spawnUnit('laborer', Z, 121.5, 59.5);
    w.enqueue({ type: 'dig_mine', owner: Z, ids: [lab.id], target: wall.id });
    run(w, 20 * 20);
    const mine = [...w.all()].find((e) => e.type === 'mine')!;
    expect(isVisibleTo(w, V, mine)).toBe(false);
    w.rules.siege.counterMineRadius = 4;
    run(w, 20 * 30);
    expect(isVisibleTo(w, V, mine)).toBe(true);
  });
});

describe('transport', () => {
  it('soldiers board a junk, sail, and land elsewhere', () => {
    const w = makeWorld({ emptyMap: true, noFog: true });
    const junk = w.spawnUnit('junk', Z, 40.5, 44.5); // main channel, next to Baxemboy
    const ids = [0, 1, 2, 3].map((i) => w.spawnUnit('shield_soldier', Z, 38 + i, 41.5).id);
    w.enqueue({ type: 'embark', owner: Z, ids, target: junk.id });
    run(w, 20 * 10);
    expect(junk.cargo).toHaveLength(4);
    w.enqueue({ type: 'unload', owner: Z, ids: [junk.id], x: 50.5, y: 53.5 }); // Tayouan shore
    run(w, 20 * 30);
    expect(junk.cargo ?? []).toHaveLength(0);
    for (const id of ids) {
      const u = w.get(id)!;
      expect(u.insideOf).toBeFalsy();
      expect(u.y).toBeGreaterThan(50);
    }
  });

  it('a junk carries at most 10 population', async () => {
    const { loadInto } = await import('../src/sim/systems/transport');
    const w = makeWorld({ emptyMap: true, noFog: true });
    const junk = w.spawnUnit('junk', Z, 40.5, 44.5);
    let loaded = 0;
    for (let i = 0; i < 12; i++) if (loadInto(w, junk, w.spawnUnit('shield_soldier', Z, 40, 41.5))) loaded++;
    expect(loaded).toBe(10);
  });

  it('cargo dies with the ship', async () => {
    const { killEntity } = await import('../src/sim/systems/combat');
    const { loadInto } = await import('../src/sim/systems/transport');
    const w = makeWorld({ emptyMap: true, noFog: true });
    const junk = w.spawnUnit('junk', Z, 40.5, 44.5);
    const s = w.spawnUnit('shield_soldier', Z, 40, 41.5);
    loadInto(w, junk, s);
    killEntity(w, junk);
    expect(w.get(s.id)).toBeUndefined();
  });
});

describe('fog of war (spec §4.13)', () => {
  it('enemy units are visible only within sight; buildings stay known once explored', () => {
    const w = makeWorld({ emptyMap: true });
    const scout = w.spawnUnit('shield_soldier', Z, 120.5, 60.5);
    const enemy = w.spawnUnit('pikeman', V, 123.5, 60.5);
    const far = w.spawnUnit('pikeman', V, 135.5, 60.5);
    const barracks = w.spawnBuilding('barracks_voc', V, 124, 63);
    updateFog(w);
    expect(isVisibleTo(w, Z, enemy)).toBe(true);
    expect(isVisibleTo(w, Z, far)).toBe(false);
    expect(isVisibleTo(w, Z, barracks)).toBe(true);
    scout.x = 100.5;
    updateFog(w);
    expect(isVisibleTo(w, Z, enemy)).toBe(false);
    expect(isVisibleTo(w, Z, barracks)).toBe(true); // remembered
  });

  it('forests block line of sight; 社戰士 hide in forest unless an enemy is within 2 tiles', () => {
    const w = makeWorld({ emptyMap: true });
    // Find a forest tile with plain to its west.
    let fx = -1;
    let fy = -1;
    for (let y = 40; y < 70 && fx < 0; y++)
      for (let x = 132; x < 137; x++)
        if (w.map.terrain[y * 160 + x] === T.forest && w.map.terrain[y * 160 + x - 3] === T.plain) {
          fx = x;
          fy = y;
          break;
        }
    expect(fx).toBeGreaterThan(0);
    const warrior = w.spawnUnit('village_warrior', V, fx + 0.5, fy + 0.5);
    const watcher = w.spawnUnit('archer_zheng', Z, fx - 2.5, fy + 0.5);
    updateFog(w);
    w.rebuildSpatial();
    expect(isVisibleTo(w, Z, warrior)).toBe(false);
    watcher.x = fx - 1;
    updateFog(w);
    w.rebuildSpatial();
    expect(isVisibleTo(w, Z, warrior)).toBe(true);
  });
});
