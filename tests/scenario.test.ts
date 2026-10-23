// Stage 7 acceptance: every scripted event fires in at least one test, and each of the 8 levels
// (4 chapters × 2 sides) can end in both a win and a loss for that side.
import { afterAll, describe, expect, it } from 'vitest';
import { SCENARIOS, scenarioById } from '../src/data/scenarios';
import { applyScenario } from '../src/sim/scenario/setup';
import { outcomeOf, type Trigger } from '../src/sim/scenario/triggers';
import { killEntity } from '../src/sim/systems/combat';
import { captureBuilding } from '../src/sim/systems/siege';
import type { World } from '../src/sim/world';
import { makeWorld, run } from './helpers';

const Z = 'faction_zheng';
const V = 'faction_voc';
const fired = new Set<string>();
const won = new Set<string>();
const lost = new Set<string>();

function chapter(ch: number) {
  const w = makeWorld({ seed: ch });
  applyScenario(w, scenarioById(`ch${ch}`));
  w.ext.flags.player = '';
  return w;
}

function collect(w: World) {
  for (const k of Object.keys(w.ext.flags)) if (k.startsWith('fired:')) fired.add(`${w.scenario!.id}:${k.slice(6)}`);
  for (const f of [Z, V]) {
    const r = outcomeOf(w, f);
    if (!r) continue;
    (r === 'defeat' ? lost : won).add(`${w.scenario!.id}:${f}`);
  }
}

/** Jumps the clock (triggers check every 5 ticks). */
function at(w: World, seconds: number) {
  w.tick = Math.max(w.tick, Math.floor(seconds * 20));
  w.tick -= w.tick % 5;
  run(w, 5);
}

const tagged = (w: World, tag: string) => [...w.all()].filter((e) => e.tag === tag);
const killTag = (w: World, tag: string, n = Infinity) => {
  w.rebuildSpatial();
  for (const e of tagged(w, tag).slice(0, n)) killEntity(w, e);
};
const spawnIn = (w: World, owner: string, type: string, n: number, x: number, y: number) => {
  for (let i = 0; i < n; i++) w.spawnUnit(type, owner, x + (i % 8) * 0.6, y + Math.floor(i / 8) * 0.6);
};
const castle = (w: World) => w.buildings().find((b) => b.type === 'zeelandia_castle')!;

describe('chapter 1: 鹿耳門', () => {
  it('Zheng wins: lands 60 in Saccam, repels the sortie; Hector explodes; Pedel falls', () => {
    const w = chapter(1);
    run(w, 5);
    at(w, 30);
    at(w, 180);
    const hector = tagged(w, 'hector')[0];
    hector.hp = hector.maxHp * 0.2;
    run(w, 5);
    expect(w.get(hector.id)).toBeUndefined();
    spawnIn(w, Z, 'shield_soldier', 60, 120, 45);
    run(w, 5);
    killTag(w, 'pedel');
    at(w, 190);
    expect(outcomeOf(w, Z)).toBe('victory');
    expect(outcomeOf(w, V)).toBe('historical');
    collect(w);
  });

  it('VOC wins by sinking 10 junks; Zheng also builds a camp (VOC secondary fails)', () => {
    const w = chapter(1);
    run(w, 5);
    w.spawnBuilding('camp_zheng', Z, 124, 38);
    run(w, 5);
    killTag(w, 'armada', 10);
    run(w, 5);
    expect(outcomeOf(w, V)).toBe('victory');
    expect(outcomeOf(w, Z)).toBe('defeat');
    collect(w);
  });

  it('VOC wins by holding Baxemboy until 15:00', () => {
    const w = chapter(1);
    spawnIn(w, V, 'musketeer_voc', 6, 45, 36);
    at(w, 900);
    collect(w);
    expect(outcomeOf(w, V)).toBe('victory');
  });

  it('Zheng loses if fewer than 60 land by 15:00 (separate world without Baxemboy garrison)', () => {
    const w = chapter(1);
    killTag(w, 'pedel');
    at(w, 900);
    collect(w);
    expect(outcomeOf(w, Z)).toBe('defeat');
  });

  it('VOC loses when the castle drops below half; Hector can also simply be sunk', () => {
    const w = chapter(1);
    killTag(w, 'hector');
    run(w, 5);
    castle(w).hp = castle(w).maxHp * 0.4;
    run(w, 5);
    collect(w);
    expect(outcomeOf(w, V)).toBe('defeat');
  });

  it('VOC loses when Pedel is dead and Baxemboy falls', () => {
    const w = chapter(1);
    killTag(w, 'pedel');
    spawnIn(w, Z, 'shield_soldier', 12, 45, 36);
    at(w, 60);
    collect(w);
    expect(outcomeOf(w, V)).toBe('defeat');
  });

  it('timeout at 20:00: Zheng landed → historical; not landed → VOC', () => {
    const a = chapter(1);
    spawnIn(a, Z, 'shield_soldier', 60, 120, 45);
    run(a, 5);
    spawnIn(a, V, 'musketeer_voc', 12, 45, 36);
    spawnIn(a, Z, 'shield_soldier', 12, 50, 36);
    // Keep the Baxemboy-held rule from deciding first.
    a.ext.flags['fired:ch1_baxemboy_held'] = true;
    at(a, 1200);
    collect(a);
    expect(outcomeOf(a, Z)).toBe('historical');
    const b = chapter(1);
    b.ext.flags['fired:ch1_landing_failed'] = true;
    b.ext.flags['fired:ch1_baxemboy_held'] = true;
    at(b, 1200);
    collect(b);
    expect(outcomeOf(b, V)).toBe('victory');
  });
});

describe('chapter 2: 赤崁', () => {
  it('Provintia falls, the assault on Zeelandia costs over 40 pop → Zheng historical, VOC victory', () => {
    const w = chapter(2);
    run(w, 5);
    const fort = w.buildings().find((b) => b.type === 'provintia_fort')!;
    w.rebuildSpatial();
    captureBuilding(w, fort, Z);
    run(w, 5);
    expect(w.ext.parties.sinkan.favor[Z]).toBe(55);
    const army = [...w.all()].filter((e) => e.owner === Z && e.kind === 'unit' && e.type !== 'laborer' && e.type !== 'koxinga');
    w.rebuildSpatial();
    for (const u of army.slice(0, 50)) killEntity(w, u);
    run(w, 5);
    collect(w);
    expect(outcomeOf(w, Z)).toBe('historical');
    expect(outcomeOf(w, V)).toBe('victory');
  });

  it('Provintia holds 10 minutes → VOC victory, Zheng defeat', () => {
    const w = chapter(2);
    at(w, 600);
    collect(w);
    expect(outcomeOf(w, Z)).toBe('defeat');
  });

  it('VOC can negotiate Provintia’s surrender: garrison goes home, morale −10', () => {
    const w = chapter(2);
    const m0 = w.faction(V)!.castleMorale;
    w.enqueue({ type: 'choice', owner: V, id: 'negotiate_provintia' });
    run(w, 6);
    expect(w.buildings().find((b) => b.type === 'provintia_fort')!.owner).toBe(Z);
    // −10 (negotiated) and −20 (outpost lost), both softened 30% while 揆一 lives.
    expect(w.faction(V)!.castleMorale).toBeCloseTo(m0 - 0.7 * 30, 6);
    collect(w);
  });

  it('timeouts at 30:00', () => {
    const a = chapter(2);
    a.ext.flags['fired:ch2_provintia_holds'] = true;
    at(a, 1800);
    collect(a);
    expect(outcomeOf(a, V)).toBe('victory');
    const b = chapter(2);
    captureBuilding(b, b.buildings().find((x) => x.type === 'provintia_fort')!, Z);
    run(b, 5);
    at(b, 1800);
    collect(b);
    expect(outcomeOf(b, Z)).toBe('historical');
  });

  it('Zheng wins outright by taking Zeelandia; Koxinga’s death loses the chapter', () => {
    const a = chapter(2);
    captureBuilding(a, castle(a), Z);
    run(a, 5);
    collect(a);
    expect(outcomeOf(a, Z)).toBe('victory');
    const b = chapter(2);
    killTag(b, 'koxinga');
    run(b, 5);
    collect(b);
    expect(outcomeOf(b, Z)).toBe('defeat');
  });
});

describe('chapter 3: 援軍', () => {
  it('relief at 5:00 (+20 morale), typhoon at 12:00, Koukercken strands and sinks, relief broken → Zheng wins', () => {
    const w = chapter(3);
    const m0 = w.faction(V)!.castleMorale;
    at(w, 300);
    expect(tagged(w, 'koukercken')).toHaveLength(1);
    expect(w.faction(V)!.castleMorale).toBe(Math.min(100, m0 + 20));
    at(w, 690);
    expect(w.ext.typhoon).not.toBeNull();
    const k = tagged(w, 'koukercken')[0];
    k.stranded = true;
    k.x = 52;
    k.y = 46.5;
    w.spawnUnit('junk', Z, 54, 46.5);
    run(w, 5);
    at(w, 760);
    expect(tagged(w, 'koukercken')).toHaveLength(0);
    killTag(w, 'relief');
    run(w, 5);
    collect(w);
    expect(outcomeOf(w, Z)).toBe('victory');
  });

  it('VOC wins by destroying both coastal batteries and landing 30 relief troops', () => {
    const w = chapter(3);
    at(w, 300);
    w.rebuildSpatial();
    for (const b of w.buildings().filter((x) => x.tag === 'coastal_west' || x.tag === 'coastal_east')) killEntity(w, b);
    const boats = tagged(w, 'relief_boats');
    for (const b of boats) for (const id of [...(b.cargo ?? [])]) {
      const u = w.entities.get(id)!;
      u.insideOf = null;
      u.x = 45;
      u.y = 64;
    }
    for (const b of boats) b.cargo = [];
    run(w, 10);
    collect(w);
    expect(outcomeOf(w, V)).toBe('victory');
  });

  it('losing a camp loses the chapter for Zheng; timeout at 35:00 favours Zheng', () => {
    const a = chapter(3);
    a.rebuildSpatial();
    for (const b of a.buildings().filter((x) => x.type === 'camp_zheng')) killEntity(a, b);
    run(a, 5);
    collect(a);
    expect(outcomeOf(a, Z)).toBe('defeat');
    const b = chapter(3);
    b.ext.flags['fired:ch3_relief'] = true;
    at(b, 2100);
    collect(b);
    expect(outcomeOf(b, Z)).toBe('victory');
  });

  it('VOC is defeated outright if Zeelandia is stormed', () => {
    const w = chapter(3);
    captureBuilding(w, castle(w), Z);
    run(w, 5);
    collect(w);
    expect(outcomeOf(w, V)).toBe('defeat');
  });
});

describe('chapter 4: 烏特勒支堡', () => {
  it('Caeuw leaves (−15), the deserter rumour at 8:00, Utrecht falls, castle morale hits 0 → Zheng wins', () => {
    const w = chapter(4);
    const m0 = w.faction(V)!.castleMorale;
    run(w, 5);
    expect(w.faction(V)!.castleMorale).toBeCloseTo(Math.max(30, m0) - 15 * 0.7, 6); // 揆一 softens losses
    at(w, 480);
    w.rebuildSpatial();
    captureBuilding(w, w.buildings().find((b) => b.type === 'utrecht_redoubt')!, Z);
    run(w, 5);
    w.faction(V)!.castleMorale = 0;
    run(w, 5);
    collect(w);
    expect(outcomeOf(w, Z)).toBe('victory');
  });

  it('holding Utrecht for 3 minutes wins the chapter for Zheng', () => {
    const w = chapter(4);
    run(w, 5);
    w.rebuildSpatial();
    captureBuilding(w, w.buildings().find((b) => b.type === 'utrecht_redoubt')!, Z);
    run(w, 5);
    expect(outcomeOf(w, Z)).toBeUndefined();
    at(w, w.tick / 20 + 181);
    collect(w);
    expect(outcomeOf(w, Z)).toBe('victory');
    expect(outcomeOf(w, V)).toBe('historical');
  });

  it('VOC holds Utrecht for 25 minutes', () => {
    const w = chapter(4);
    at(w, 1500);
    collect(w);
    expect(outcomeOf(w, V)).toBe('victory');
  });

  it('VOC wins when Zheng drops below 40 pop', () => {
    const w = chapter(4);
    w.rebuildSpatial();
    for (const u of [...w.all()].filter((e) => e.owner === Z && e.kind === 'unit' && e.type !== 'laborer' && e.type !== 'koxinga').slice(0, 95)) killEntity(w, u);
    run(w, 5);
    collect(w);
    expect(outcomeOf(w, Z)).toBe('defeat');
  });

  it('a VOC player may sue for peace once morale ≤ 15 (historical); an AI VOC does so at 10', () => {
    const a = chapter(4);
    a.ext.flags.player = V;
    a.faction(V)!.castleMorale = 14;
    run(a, 5);
    a.enqueue({ type: 'choice', owner: V, id: 'sue_for_peace' });
    run(a, 1);
    collect(a);
    expect(outcomeOf(a, V)).toBe('historical');
    const b = chapter(4);
    b.ext.ai[V] = { ...(b.ext.ai[V] ?? {}), difficulty: 'normal' } as never;
    b.faction(V)!.castleMorale = 9;
    run(b, 5);
    collect(b);
    expect(outcomeOf(b, V)).toBe('historical');
  });

  it('timeout at 40:00 → VOC victory; VOC loses when the castle is captured', () => {
    const a = chapter(4);
    a.ext.flags['fired:ch4_held'] = true;
    at(a, 2400);
    collect(a);
    expect(outcomeOf(a, V)).toBe('victory');
    const b = chapter(4);
    captureBuilding(b, castle(b), Z);
    run(b, 5);
    collect(b);
    expect(outcomeOf(b, V)).toBe('defeat');
  });

  it('starved and broken garrison loses (global rule)', () => {
    const w = chapter(4);
    w.ext.flags['fired:ch4_morale_zero'] = true;
    w.ext.flags['fired:g_castle_morale'] = true;
    w.faction(V)!.castleMorale = 0;
    w.faction(V)!.resources.grain = 0;
    run(w, 5);
    collect(w);
    expect(outcomeOf(w, V)).toBe('defeat');
  });
});

afterAll(() => {
  // Every trigger of every chapter, and every global rule, fired somewhere above.
  const all: string[] = [];
  for (const sc of SCENARIOS) for (const t of (sc.triggers ?? []) as Trigger[]) all.push(`${sc.id}:${t.id}`);
  const globalIds = ['g_koxinga', 'g_castle', 'g_castle_morale', 'g_starved'];
  const missing = all.filter((id) => !fired.has(id));
  const missingGlobal = globalIds.filter((g) => ![...fired].some((f) => f.endsWith(':' + g)));
  expect(missing).toEqual([]);
  expect(missingGlobal).toEqual([]);
  for (const sc of SCENARIOS)
    for (const f of [Z, V]) {
      expect(won, `${sc.id} ${f} can win`).toContain(`${sc.id}:${f}`);
      expect(lost, `${sc.id} ${f} can lose`).toContain(`${sc.id}:${f}`);
    }
});
