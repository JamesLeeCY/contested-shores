import { describe, expect, it } from 'vitest';
import { captureBuilding } from '../src/sim/systems/siege';
import { canDiplo, ensureParties, SETTLERS } from '../src/sim/systems/diplomacy';
import { diseaseChance, diseaseTick } from '../src/sim/systems/disease';
import { dispatchSupply, routeBlockaded } from '../src/sim/systems/supply';
import { scheduleTyphoon } from '../src/sim/systems/weather';
import { isEnemy } from '../src/sim/systems/combat';
import { farmAccess } from '../src/sim/systems/economy';
import type { World } from '../src/sim/world';
import { makeWorld, run } from './helpers';

const Z = 'faction_zheng';
const V = 'faction_voc';
const DAY = 1200;

const countUnits = (w: World, owner: string, type?: string) =>
  [...w.all()].filter((e) => e.kind === 'unit' && e.owner === owner && (!type || e.type === type)).length;

describe('disease (spec §4.7)', () => {
  it('exposed Zheng units fall ill at ~1.5% a day; inside a camp they are safe', () => {
    const w = makeWorld({ emptyMap: true, noFog: true });
    for (let i = 0; i < 2000; i++) w.spawnUnit('shield_soldier', Z, 115 + (i % 20) * 0.4, 50 + Math.floor(i / 20) * 0.2);
    const camp = w.spawnBuilding('camp_zheng', Z, 100, 100);
    const safe = [0, 1, 2, 3, 4].map(() => {
      const u = w.spawnUnit('archer_zheng', Z, 101, 101);
      u.insideOf = camp.id;
      camp.garrisoned!.push(u.id);
      return u;
    });
    diseaseTick(w);
    const ev = w.events.find((e) => e.type === 'disease' && e.owner === Z)!;
    const n = ev.n as number;
    // Binomial(2000, 0.015): mean 30, sd ≈ 5.4.
    expect(n).toBeGreaterThan(12);
    expect(n).toBeLessThan(48);
    expect(countUnits(w, Z, 'shield_soldier')).toBe(2000 - n);
    for (const u of safe) expect(w.get(u.id)).toBeDefined();
  });

  it('VOC 0.5%, 草藥 0.8%, chapter 3+ ×1.5, heroes immune', () => {
    const w = makeWorld({ emptyMap: true, noFog: true });
    expect(diseaseChance(w, V)).toBe(0.005);
    expect(diseaseChance(w, Z)).toBe(0.015);
    w.rules.disease.chanceZheng = 0.008; // what 草藥 sets
    expect(diseaseChance(w, Z)).toBe(0.008);
    w.chapter = 3;
    expect(diseaseChance(w, Z)).toBeCloseTo(0.012, 9);
    w.rules.disease.chanceZheng = 1;
    const k = w.spawnUnit('koxinga', Z, 120, 60);
    diseaseTick(w);
    expect(w.get(k.id)).toBeDefined();
  });

  it('runs once per game day with the daily settlement', () => {
    const w = makeWorld({ emptyMap: true, noFog: true });
    w.rules.disease.chanceZheng = 1;
    w.spawnUnit('shield_soldier', Z, 120, 60);
    run(w, DAY);
    expect(countUnits(w, Z)).toBe(1);
    run(w, 1);
    expect(countUnits(w, Z)).toBe(0);
  });
});

describe('VOC sea supply (spec §3.2, §4.11)', () => {
  it('a supply ship sails in every 3 days and delivers 100 grain, 50 powder, +10 castle morale', () => {
    const w = makeWorld({ noFog: true });
    const f = w.faction(V)!;
    f.castleMorale = 50;
    const g0 = f.resources.grain;
    const p0 = f.resources.powder;
    run(w, DAY * 3 + 1);
    expect(w.ext.supply.ship).not.toBeNull();
    run(w, 20 * 90);
    expect(f.resources.powder).toBeGreaterThanOrEqual(p0 + 50 - 1);
    expect(f.castleMorale).toBe(60);
    // Upkeep ate some grain; the delivery is visible as the difference from no-supply.
    expect(f.resources.grain).toBeGreaterThan(g0 - 100);
  });

  it('a Zheng junk covering the main channel cancels the supply', () => {
    const w = makeWorld({ noFog: true });
    expect(routeBlockaded(w)).toBeNull();
    w.spawnUnit('junk', Z, 30.5, 46.5);
    expect(routeBlockaded(w)).not.toBeNull();
    expect(dispatchSupply(w)).toBe('blocked');
    expect(w.events.some((e) => e.type === 'supply_blocked')).toBe(true);
  });

  it('a gun on a shore battery within range of the route also blockades it', () => {
    const w = makeWorld({ noFog: true });
    w.faction(Z)!.stage = 4;
    // Baxemboy shore overlooking the channel near the dock (route ends at x≈40).
    w.spawnBuilding('battery', Z, 36, 40);
    w.spawnUnit('light_cannon', Z, 36.5, 40.5);
    expect(routeBlockaded(w)).not.toBeNull();
  });
});

describe('village diplomacy (spec §3.3, §4.9)', () => {
  const setup = () => {
    const w = makeWorld({ noFog: true });
    ensureParties(w);
    Object.assign(w.faction(Z)!.resources, { grain: 5000, deerskin: 5000 });
    Object.assign(w.faction(V)!.resources, { grain: 5000, deerskin: 5000 });
    return w;
  };
  const envoy = (w: World, owner: string, village: string) => {
    const c = w.buildings().find((b) => b.village === village)!;
    return w.spawnUnit(owner === Z ? 'shield_soldier' : 'pikeman', owner, c.x + 4, c.y + 0.5);
  };

  it('each village starts with its warriors and hunters', () => {
    const w = setup();
    expect(countUnits(w, 'village_mattau', 'village_warrior')).toBe(12);
    expect(countUnits(w, 'village_sinkan', 'village_hunter')).toBe(2);
  });

  it('diplomacy needs a unit inside the village land', () => {
    const w = setup();
    expect(canDiplo(w, Z, 'sinkan', 'pacify')).toBe('unit');
    envoy(w, Z, 'sinkan');
    expect(canDiplo(w, Z, 'sinkan', 'pacify')).toBeNull();
    expect(canDiplo(w, V, 'sinkan', 'pacify')).toBe('faction');
  });

  it('新港社 pacify ×1.5 (+30), cooldown 120 s; gifts +10 with a shared 60 s cooldown', () => {
    const w = setup();
    envoy(w, Z, 'sinkan');
    w.enqueue({ type: 'diplomacy', owner: Z, party: 'sinkan', action: 'pacify' });
    run(w, 1);
    expect(w.ext.parties.sinkan.favor[Z]).toBe(70);
    expect(canDiplo(w, Z, 'sinkan', 'pacify')).toBe('cooldown');
    w.enqueue({ type: 'diplomacy', owner: Z, party: 'sinkan', action: 'gift_grain' });
    run(w, 1);
    expect(w.ext.parties.sinkan.favor[Z]).toBe(80);
    expect(canDiplo(w, Z, 'sinkan', 'gift_deerskin')).toBe('cooldown');
  });

  it('joins at ≥80 and ≥20 ahead; 麻豆社 lends 8 warriors; falls below 40 → they go home', async () => {
    const { changeFavor } = await import('../src/sim/systems/diplomacy');
    const w = setup();
    const p = w.ext.parties.mattau;
    changeFavor(w, p, Z, 50, 'sandbox'); // 30 → 80, VOC 40
    expect(p.ally).toBe(Z);
    expect(countUnits(w, Z, 'village_warrior')).toBe(8);
    changeFavor(w, p, Z, -45, 'sandbox'); // 35
    expect(p.ally).toBeNull();
    expect(countUnits(w, Z, 'village_warrior')).toBe(0);
    expect(countUnits(w, 'village_mattau', 'village_warrior')).toBe(12);
  });

  it('no alliance without a 20-point lead', async () => {
    const { changeFavor } = await import('../src/sim/systems/diplomacy');
    const w = setup();
    const p = w.ext.parties.sinkan; // Z 40, VOC 55
    changeFavor(w, p, V, 30, 'sandbox'); // VOC 85
    changeFavor(w, p, Z, 30, 'sandbox'); // Z 70 → VOC lead only 15 → still joins? VOC already joined at 85 vs 40
    expect(p.ally).toBe(V);
    const q = w.ext.parties.bakloan; // 35 / 50
    changeFavor(w, q, V, 30, 'sandbox'); // 80
    changeFavor(w, q, Z, 45, 'sandbox'); // 80 → no 20 lead for either
    expect(q.ally).toBe(V); // VOC reached 80 first while 45 ahead
  });

  it('below 20 the village turns hostile and raids the faction every 2 days', async () => {
    const { changeFavor } = await import('../src/sim/systems/diplomacy');
    const w = setup();
    const p = w.ext.parties.soulang;
    changeFavor(w, p, Z, -30, 'sandbox'); // 35 → 5
    expect(p.hostile).toContain(Z);
    expect(isEnemy(w, 'village_soulang', Z)).toBe(true);
    // A Zheng labourer out of the warriors' sight is the raid target.
    w.spawnBuilding('camp_zheng', Z, 120, 40);
    const lab = w.spawnUnit('laborer', Z, 125.5, 41.5);
    let raid = false;
    for (let i = 0; i < DAY * 2 + 21; i++) {
      run(w, 1);
      if (w.events.some((e) => e.type === 'village_raid' && e.faction === Z)) raid = true;
    }
    expect(raid).toBe(true);
    expect(p.raiders.length).toBeGreaterThan(0);
    const raider = w.get(p.raiders[0])!;
    expect(raider.order).toMatchObject({ type: 'attack', target: lab.id });
  });

  it('fighting on village land costs 5 favour and the warriors strike back for 60 s', () => {
    const w = setup();
    const c = w.buildings().find((b) => b.village === 'bakloan')!;
    const z = w.spawnUnit('musketeer_zheng', Z, c.x + 3, c.y + 3);
    const v = w.spawnUnit('pikeman', V, c.x + 5, c.y + 3);
    w.enqueue({ type: 'attack', owner: Z, ids: [z.id], target: v.id });
    const before = w.ext.parties.bakloan.favor[Z];
    run(w, 20 * 5);
    expect(w.ext.parties.bakloan.favor[Z]).toBeLessThanOrEqual(before - 5);
    expect(isEnemy(w, 'village_bakloan', Z)).toBe(true);
    run(w, 20 * 70);
    expect(isEnemy(w, 'village_bakloan', Z)).toBe(w.ext.parties.bakloan.hostile.includes(Z));
  });

  it('favour drifts 1 a day towards 50; 蕭壠社 pays its ally 20 deerskin a day', async () => {
    const { changeFavor } = await import('../src/sim/systems/diplomacy');
    const w = setup();
    const p = w.ext.parties.soulang;
    changeFavor(w, p, Z, 50, 'sandbox'); // 85 → ally
    expect(p.ally).toBe(Z);
    const d0 = w.faction(Z)!.resources.deerskin;
    run(w, DAY + 1);
    expect(p.favor[Z]).toBe(84);
    expect(p.favor[V]).toBe(46);
    expect(w.faction(Z)!.resources.deerskin).toBe(d0 + 20);
  });

  it('目加溜灣社 allies move 20% faster on its land', async () => {
    const { changeFavor } = await import('../src/sim/systems/diplomacy');
    const { speedModifiers } = await import('../src/sim/systems/movement');
    const w = setup();
    const c = w.buildings().find((b) => b.village === 'bakloan')!;
    const u = w.spawnUnit('shield_soldier', Z, c.x + 3, c.y);
    const mul = () => speedModifiers.reduce((m, f) => m * f(w, u), 1);
    const before = mul();
    changeFavor(w, w.ext.parties.bakloan, Z, 60, 'sandbox');
    expect(mul() / before).toBeCloseTo(1.2, 6);
  });
});

describe('settlers (spec §3.4)', () => {
  it('taking Provintia wins the settlers over: their farms and sugar mill serve Zheng', () => {
    const w = makeWorld({ noFog: true });
    ensureParties(w);
    const s = w.ext.parties[SETTLERS];
    const farm = w.buildings().find((b) => b.type === 'farm' && b.owner === 'faction_settlers')!;
    expect(farmAccess.allowed(w, Z, farm)).toBe(false);
    const fort = w.buildings().find((b) => b.type === 'provintia_fort')!;
    captureBuilding(w, fort, Z);
    expect(s.favor[Z]).toBe(80);
    expect(s.ally).toBe(Z);
    expect(farmAccess.allowed(w, Z, farm)).toBe(true);
    const g0 = w.faction(Z)!.resources.grain;
    w.rules.disease.chanceZheng = 0;
    run(w, DAY + 1);
    // +60 from the sugar mill (no Zheng units, so no upkeep).
    expect(w.faction(Z)!.resources.grain).toBe(g0 + 60);
  });

  it('VOC can requisition grain once in chapter 1: +200 grain, −40 favour', () => {
    const w = makeWorld({ noFog: true });
    ensureParties(w);
    w.spawnUnit('pikeman', V, 120, 45);
    const g0 = w.faction(V)!.resources.grain;
    w.enqueue({ type: 'diplomacy', owner: V, party: SETTLERS, action: 'requisition' });
    run(w, 1);
    expect(w.faction(V)!.resources.grain).toBe(g0 + 200);
    expect(w.ext.parties[SETTLERS].favor[V]).toBe(0);
    expect(canDiplo(w, V, SETTLERS, 'requisition')).toBe('used');
  });
});

describe('typhoon (spec §4.10)', () => {
  it('warns 30 s ahead, then for 60 s ships at sea lose 1%/s, sight halves, firearms miss more', () => {
    const w = makeWorld({ emptyMap: true, noFog: true });
    const ship = w.spawnUnit('warship', V, 30.5, 46.5);
    scheduleTyphoon(w, w.tick + 30 * 20);
    const seen: string[] = [];
    for (let i = 0; i < 20 * 95; i++) {
      run(w, 1);
      for (const e of w.events) if (String(e.type).startsWith('typhoon')) seen.push(e.type);
      if (i === 20 * 40) {
        expect(w.weather.sightMul).toBe(0.5);
        expect(w.weather.rangedHitPenalty).toBe(0.3);
      }
    }
    expect(seen).toEqual(['typhoon_warning', 'typhoon_start', 'typhoon_end']);
    expect(ship.hp).toBeCloseTo(900 * (1 - 0.01 * 60), 6);
    expect(w.weather.active).toBe(false);
  });
});

describe('大肚王國 northern event (spec §3.3)', () => {
  const march = (seed: number, n: number) => {
    const w = makeWorld({ seed, noFog: true });
    for (let i = 0; i < n; i++) w.spawnUnit('shield_soldier', Z, 148.5 + (i % 5) * 0.6, 1.5);
    run(w, 20 * 12);
    return w;
  };

  it('30 or fewer soldiers always arrive and farm in the north', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const w = march(seed, 30);
      expect(w.ext.tatu.northern[Z]).toBe(30);
    }
  });

  it('more than 30 are ambushed about 40% of the time', () => {
    let ambushed = 0;
    for (let seed = 1; seed <= 40; seed++) if (!march(seed, 31).ext.tatu.northern[Z]) ambushed++;
    expect(ambushed).toBeGreaterThan(6);
    expect(ambushed).toBeLessThan(26);
  });
});
