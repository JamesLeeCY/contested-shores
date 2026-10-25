import { describe, expect, it } from 'vitest';
import { attackProfile, computeDamage, takenMul } from '../src/sim/systems/combat';
import type { AttackCtx } from '../src/sim/traits/types';
import type { Entity } from '../src/sim/types';
import type { World } from '../src/sim/world';
import { makeWorld, run } from './helpers';

const Z = 'faction_zheng';
const V = 'faction_voc';
// Open plain in Saccam used by focused tests (no preset buildings with emptyMap).
const X = 120;
const Y = 60;

const world = () => makeWorld({ emptyMap: true, noFog: true });
const ctx = (w: World, a: Entity, t: Entity, atkType?: string): AttackCtx => ({
  world: w,
  attacker: a,
  target: t,
  atkType: atkType ?? (a.kind === 'unit' ? attackProfile(w, a).atkType : 'cannon'),
  fromBuilding: a.kind === 'building',
});
const dmg = (w: World, a: Entity, t: Entity) => computeDamage(ctx(w, a, t));

describe('damage formula (spec §4.5) — hand-computed cases', () => {
  // Units start at morale 70 → moraleMod 1.1.
  const cases: [string, string, string, number][] = [
    ['shield_soldier', 'pikeman', 'melee 9 × 0.7 − 2 = 4.3', 4.3 * 1.1],
    ['archer_zheng', 'musketeer_voc', 'arrow 7 × 0.6 − 1 = 3.2', 3.2 * 1.1],
    ['musketeer_voc', 'shield_soldier', 'musket 18 × 1.2 − 1 = 20.6', 20.6 * 1.1],
    ['musketeer_voc', 'iron_man', 'musket 18 × 1.0 − 3 = 15', 15 * 1.1],
    ['warship', 'junk', 'cannon 70 × 1.0 − 2 = 68', 68 * 1.1],
    ['fire_ship', 'warship', 'fire 400 × 2.0 − 5 = 795', 795 * 1.1],
    ['iron_man', 'musketeer_voc', 'melee 16 × 0.7 − 1 = 10.2', 10.2 * 1.1],
    ['grenadier', 'iron_man', 'cannon 35 × 1.5 − 3 = 49.5', 49.5 * 1.1],
    ['musketeer_zheng', 'pikeman', 'musket 14 × 0.8 − 2 = 9.2', 9.2 * 1.1],
    ['village_warrior', 'shield_soldier', 'arrow 10 × 1.2 − 1 = 11', 11 * 1.1],
    ['pikeman', 'archer_zheng', 'melee 11 × 1.0 − 0 = 11 (no anti-charge)', 11 * 1.1],
    ['pikeman', 'iron_man', 'anti_charge: (11 × 0.8 − 3) × 1.25', 5.8 * 1.25 * 1.1],
    ['pikeman', 'shield_soldier', 'anti_charge: (11 − 1) × 1.25', 10 * 1.25 * 1.1],
    ['archer_zheng', 'junk', 'arrow 7 × 0.2 − 2 → min 1', 1 * 1.1],
  ];
  for (const [a, t, why, expected] of cases)
    it(`${a} → ${t}: ${why}`, () => {
      const w = world();
      const A = w.spawnUnit(a, a.includes('voc') || ['pikeman', 'warship', 'grenadier'].includes(a) ? V : Z, X, Y);
      const B = w.spawnUnit(t, A.owner === V ? Z : V, X + 1, Y);
      expect(dmg(w, A, B)).toBeCloseTo(expected, 6);
    });

  it('arrows barely scratch a bastion (min damage 1)', () => {
    const w = world();
    const b = w.spawnBuilding('bastion', V, X, Y);
    const a = w.spawnUnit('archer_zheng', Z, X - 3, Y);
    expect(dmg(w, a, b)).toBeCloseTo(1 * 1.1, 6);
  });

  it('light cannon vs bastion: 40 − 6 = 34', () => {
    const w = world();
    const b = w.spawnBuilding('bastion', V, X, Y);
    const c = w.spawnUnit('light_cannon', Z, X - 5, Y);
    expect(dmg(w, c, b)).toBeCloseTo(34 * 1.1, 6);
  });

  it('heavy cannon vs castle gets +50% once Utrecht is taken', () => {
    const w = world();
    const castle = w.spawnBuilding('zeelandia_castle', V, X, Y);
    const c = w.spawnUnit('heavy_cannon', Z, X - 8, Y);
    expect(dmg(w, c, castle)).toBeCloseTo(82 * 1.1, 6);
    w.faction(Z)!.mainBaseCannonBonus = 0.5;
    expect(dmg(w, c, castle)).toBeCloseTo(82 * 1.5 * 1.1, 6);
  });

  it('morale bands: 50 → ×1.0, 20 → ×0.8', () => {
    const w = world();
    const s = w.spawnUnit('shield_soldier', Z, X, Y);
    const t = w.spawnUnit('company_worker', V, X + 1, Y);
    s.morale = 50;
    expect(dmg(w, s, t)).toBeCloseTo(9, 6);
    s.morale = 20;
    expect(dmg(w, s, t)).toBeCloseTo(9 * 0.8, 6);
  });

  it('鄭成功 aura: +15% attack within 6 tiles only', () => {
    const w = world();
    const s = w.spawnUnit('shield_soldier', Z, X, Y);
    const t = w.spawnUnit('company_worker', V, X + 1, Y);
    const k = w.spawnUnit('koxinga', Z, X + 5, Y + 1);
    expect(dmg(w, s, t)).toBeCloseTo(9 * 1.15 * 1.1, 6);
    k.x = X + 10;
    w.tick++; // hero cache is per tick
    expect(dmg(w, s, t)).toBeCloseTo(9 * 1.1, 6);
  });

  it('拔鬼仔 aura: +10% for VOC musketeers', () => {
    const w = world();
    const m = w.spawnUnit('musketeer_voc', V, X, Y);
    const t = w.spawnUnit('shield_soldier', Z, X + 3, Y);
    w.spawnUnit('pedel', V, X - 1, Y);
    expect(dmg(w, m, t)).toBeCloseTo(20.6 * 1.1 * 1.1, 6);
  });

  it('bastion crossfire: +25% only when two bastions cover the target', () => {
    const w = world();
    const b1 = w.spawnBuilding('bastion', V, X, Y);
    const t = w.spawnUnit('shield_soldier', Z, X + 1.5, Y + 8);
    expect(dmg(w, b1, t)).toBeCloseTo(81.5, 6);
    w.spawnBuilding('bastion', V, X + 6, Y);
    expect(dmg(w, b1, t)).toBeCloseTo(81.5 * 1.25, 6);
  });

  it('trench cover halves arrow and musket damage but not cannon fire', () => {
    const w = world();
    w.spawnBuilding('trench', Z, X, Y);
    const s = w.spawnUnit('shield_soldier', Z, X + 0.5, Y + 0.5);
    const m = w.spawnUnit('musketeer_voc', V, X + 4, Y);
    const c = w.spawnUnit('field_cannon', V, X + 6, Y);
    expect(takenMul(ctx(w, m, s))).toBe(0.5);
    expect(takenMul(ctx(w, c, s))).toBe(1);
  });

  it('battery: cannons on it take 30% less damage', () => {
    const w = world();
    w.spawnBuilding('battery', Z, X, Y);
    const c = w.spawnUnit('light_cannon', Z, X + 0.5, Y + 0.5);
    const m = w.spawnUnit('field_cannon', V, X + 8, Y);
    expect(takenMul(ctx(w, m, c))).toBeCloseTo(0.7, 6);
  });

  it('stranded ships take 50% more damage', () => {
    const w = world();
    const j = w.spawnUnit('junk', Z, X, Y);
    const m = w.spawnUnit('musketeer_voc', V, X + 3, Y);
    j.stranded = true;
    expect(takenMul(ctx(w, m, j))).toBe(1.5);
  });

  it('揆一 aura: buildings within 8 tiles take 20% less damage', () => {
    const w = world();
    const b = w.spawnBuilding('bastion', V, X, Y);
    const c = w.spawnUnit('light_cannon', Z, X - 6, Y);
    const k = w.spawnUnit('coyett', V, X + 5, Y + 1);
    expect(takenMul(ctx(w, c, b))).toBeCloseTo(0.8, 6);
    k.x = X + 30;
    w.tick++;
    expect(takenMul(ctx(w, c, b))).toBe(1);
  });

  it('藤牌 blocks about 30% of arrows', () => {
    const w = world();
    const s = w.spawnUnit('shield_soldier', Z, X, Y);
    const a = w.spawnUnit('village_warrior', V, X + 3, Y);
    let blocked = 0;
    for (let i = 0; i < 4000; i++) if (takenMul(ctx(w, a, s, 'arrow')) === 0) blocked++;
    expect(blocked / 4000).toBeGreaterThan(0.27);
    expect(blocked / 4000).toBeLessThan(0.33);
    expect(takenMul(ctx(w, a, s, 'musket'))).toBe(1);
  });

  it('without powder, firearms fight in melee at ×0.4', () => {
    const w = world();
    const m = w.spawnUnit('musketeer_voc', V, X, Y);
    w.faction(V)!.resources.powder = 0;
    const p = attackProfile(w, m);
    expect(p).toMatchObject({ range: 1, atkType: 'melee', ranged: false });
    expect(p.atk).toBeCloseTo(18 * 0.4, 6);
  });

  it('鐵甲加厚 raises iron-man armour by 1', () => {
    const w = world();
    const m = w.spawnUnit('musketeer_voc', V, X, Y);
    const im = w.spawnUnit('iron_man', Z, X + 2, Y);
    w.faction(Z)!.unitMods.iron_man = { armor: { add: 1 } };
    expect(dmg(w, m, im)).toBeCloseTo((18 - 4) * 1.1, 6);
  });
});

describe('traits in play', () => {
  it('cannons must deploy 4 s before firing; heavy cannons only fire from a battery', () => {
    const w = world();
    w.faction(Z)!.resources.powder = 1000;
    const target = w.spawnBuilding('barracks_voc', V, X + 7, Y);
    const c = w.spawnUnit('light_cannon', Z, X, Y + 1);
    w.enqueue({ type: 'attack', owner: Z, ids: [c.id], target: target.id });
    run(w, 20 * 3);
    expect(target.hp).toBe(target.maxHp);
    run(w, 20 * 12);
    expect(target.hp).toBeLessThan(target.maxHp);

    w.remove(c.id);
    const h = w.spawnUnit('heavy_cannon', Z, X, Y + 4);
    const hp0 = target.hp;
    w.enqueue({ type: 'attack', owner: Z, ids: [h.id], target: target.id });
    run(w, 20 * 30);
    // In range and deployed, but not on a battery: it never fires.
    expect(target.hp).toBe(hp0);
    // Put it on a battery and it opens fire (one shot per 10 s).
    w.spawnBuilding('battery', Z, Math.floor(h.x), Math.floor(h.y));
    let shots = 0;
    for (let i = 0; i < 20 * 31; i++) {
      run(w, 1);
      shots += w.events.filter((e) => e.type === 'shot' && e.from === h.id).length;
    }
    expect(shots).toBe(4); // t = 0, 10, 20, 30 s
  });

  it('fire ships explode on contact: 874.5 fire damage to a warship, junks nearby sink', () => {
    const w = world();
    w.faction(V)!.resources.powder = 0; // keep the warship from shooting back
    const f = w.spawnUnit('fire_ship', Z, 25, 46.5);
    const ws = w.spawnUnit('warship', V, 28, 46.5);
    w.enqueue({ type: 'attack', owner: Z, ids: [f.id], target: ws.id });
    run(w, 20 * 5);
    expect(w.get(f.id)).toBeUndefined();
    expect(ws.hp).toBeCloseTo(900 - 795 * 1.1, 6);
  });

  it('a warship broadside engages two targets in one volley', () => {
    const w = world();
    w.faction(V)!.resources.powder = 1000;
    const ws = w.spawnUnit('warship', V, 30, 46.5);
    w.spawnUnit('junk', Z, 36, 45.5);
    w.spawnUnit('junk', Z, 36, 48.5);
    run(w, 2);
    const shots = new Set<number>();
    for (let i = 0; i < 20 * 3; i++) {
      run(w, 1);
      for (const ev of w.events) if (ev.type === 'shot' && ev.from === ws.id) shots.add(ev.to as number);
    }
    expect(shots.size).toBe(2);
  });

  it('every shot consumes powder (musket 0.2, cannon 2)', () => {
    const w = world();
    w.faction(V)!.resources.powder = 10;
    const m = w.spawnUnit('musketeer_voc', V, X, Y);
    const t = w.spawnBuilding('barracks_zheng', Z, X + 3, Y - 1);
    w.enqueue({ type: 'attack', owner: V, ids: [m.id], target: t.id });
    let shots = 0;
    for (let i = 0; i < 20 * 15; i++) {
      run(w, 1);
      shots += w.events.filter((e) => e.type === 'shot').length;
    }
    expect(shots).toBeGreaterThan(3);
    expect(w.faction(V)!.resources.powder).toBeCloseTo(10 - 0.2 * shots, 6);
  });

  it('musketeers garrisoned in a bastion shoot from its walls', () => {
    const w = world();
    w.faction(V)!.resources.powder = 0; // bastion guns silent; muskets need powder…
    w.faction(V)!.resources.powder = 5;
    const b = w.spawnBuilding('bastion', V, X, Y);
    const m = w.spawnUnit('musketeer_voc', V, X - 1, Y + 1);
    w.enqueue({ type: 'garrison', owner: V, ids: [m.id], target: b.id });
    run(w, 20 * 3);
    expect(m.insideOf).toBe(b.id);
    const z = w.spawnUnit('shield_soldier', Z, X + 1.5, Y + 9);
    run(w, 20 * 10);
    expect(z.hp).toBeLessThan(z.maxHp);
  });
});

describe('morale (spec §4.6)', () => {
  it('an ally dying within 4 tiles costs 3 morale; the killer gains 2', async () => {
    const { killEntity } = await import('../src/sim/systems/combat');
    const w = world();
    const u = w.spawnUnit('archer_zheng', Z, X, Y);
    const far = w.spawnUnit('archer_zheng', Z, X + 10, Y);
    const ally = w.spawnUnit('archer_zheng', Z, X + 1, Y);
    const killer = w.spawnUnit('musketeer_voc', V, X + 5, Y);
    w.rebuildSpatial();
    killEntity(w, ally, killer);
    expect(u.morale).toBe(67);
    expect(far.morale).toBe(70);
    expect(killer.morale).toBe(72);
  });

  it('units below 10 rout towards a friendly building and ignore orders for 10 s', () => {
    const w = world();
    w.spawnBuilding('camp_zheng', Z, X - 12, Y);
    const u = w.spawnUnit('archer_zheng', Z, X, Y);
    u.morale = 9;
    run(w, 1);
    expect(u.order?.type).toBe('rout');
    w.enqueue({ type: 'move', owner: Z, ids: [u.id], x: X + 10, y: Y });
    run(w, 20 * 5);
    expect(u.order?.type).toBe('rout');
    expect(u.x).toBeLessThan(X);
    run(w, 20 * 6);
    expect(u.order?.type).toBe('idle');
    expect(u.morale).toBeGreaterThanOrEqual(15);
  });

  it('morale 10–29 slows units by 10%', async () => {
    const { moraleSpeedMul } = await import('../src/sim/systems/morale');
    const w = world();
    const u = w.spawnUnit('archer_zheng', Z, X, Y);
    u.morale = 20;
    expect(moraleSpeedMul(w, u)).toBe(0.9);
    u.morale = 50;
    expect(moraleSpeedMul(w, u)).toBe(1);
  });
});

describe('field guns and musket fire', () => {
  it('the Qing field gun (東寧) loses its crew to muskets; the 1661 guns keep their building armour', () => {
    const w = world();
    const shooter = w.spawnUnit('tn_soldier', Z, X, Y);
    const qing = w.spawnUnit('qing_gun', V, X + 3, Y);
    const zheng = w.spawnUnit('light_cannon', V, X + 3, Y + 2);
    // musket 14 × 1.2 (none) vs 14 × 0.1 − 2 → min 1 (building).
    expect(dmg(w, shooter, qing)).toBeCloseTo(14 * 1.2 * 1.1);
    expect(dmg(w, shooter, zheng)).toBeCloseTo(1 * 1.1);
  });
});
