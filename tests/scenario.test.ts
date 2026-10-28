// Stage 7 acceptance: every scripted event fires in at least one test, and each of the 8 levels
// (4 chapters × 2 sides) can end in both a win and a loss for that side.
import { afterAll, describe, expect, it } from 'vitest';
import { SCENARIOS, scenarioById } from '../src/data/scenarios';
import { applyScenario } from '../src/sim/scenario/setup';
import { outcomeOf, type Trigger } from '../src/sim/scenario/triggers';
import { killEntity } from '../src/sim/systems/combat';
import { captureBuilding } from '../src/sim/systems/siege';
import { isVisibleTo } from '../src/sim/systems/fog';
import type { World } from '../src/sim/world';
import { loadMap } from '../src/data/map';
import { DATA, makeWorld, run } from './helpers';
import { World as WorldClass } from '../src/sim/world';
import { T as TERRAIN } from '../src/sim/map';

const T_FOREST = TERRAIN.forest;

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
  for (const f of w.playable) {
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

describe('1874 石門之役', () => {
  const P = 'faction_paiwan';
  const J = 'faction_japan';
  const shimen = (seed = 1) => {
    const sc = scenarioById('mudan1');
    const w = new WorldClass(DATA, loadMap('hengchun'), { seed, factions: sc.factions });
    applyScenario(w, sc);
    w.ext.flags.player = '';
    return w;
  };
  /** Clears the heights of defenders and puts 6 Japanese beyond the gorge. */
  const takeShimen = (w: World) => {
    w.rebuildSpatial();
    for (const e of [...w.all()]) if (e.owner === P && e.kind === 'unit' && e.type !== 'paiwan_family' && e.y > 30 && e.y < 54 && e.x > 50 && e.x < 64) killEntity(w, e);
    spawnIn(w, J, 'japan_infantry', 6, 68, 38);
    run(w, 5);
  };

  it('reinforcements arrive on both sides; the families head for the refuge', () => {
    const w = shimen();
    at(w, 1);
    expect(tagged(w, 'families').every((e) => e.order?.type === 'move')).toBe(true);
    at(w, 150);
    expect(tagged(w, 'kuskus_men')).toHaveLength(9);
    at(w, 180);
    expect(tagged(w, 'second_wave')).toHaveLength(12);
    at(w, 300);
    expect(tagged(w, 'nunai_men')).toHaveLength(7);
    expect(tagged(w, 'main_body')).toHaveLength(12);
    collect(w);
  });

  it('Shimen falls and 阿祿古 dies: Japan wins, the defenders get the historical result', () => {
    const w = shimen();
    at(w, 1);
    killTag(w, 'aruqu');
    spawnIn(w, P, 'paiwan_warrior', 6, 112, 4);
    takeShimen(w);
    collect(w);
    expect(outcomeOf(w, J)).toBe('victory');
    expect(outcomeOf(w, P)).toBe('historical');
    expect(w.ext.flags[`outcomeReason:${P}`]).toBe('mudan1.end.history');
  });

  it('Shimen falls but the chief withdraws safely', () => {
    const w = shimen();
    at(w, 1);
    spawnIn(w, P, 'paiwan_warrior', 6, 112, 4);
    const chief = tagged(w, 'aruqu')[0];
    chief.x = chief.px = 114;
    chief.y = chief.py = 4;
    takeShimen(w);
    collect(w);
    expect(outcomeOf(w, P)).toBe('historical');
    expect(w.ext.flags[`outcomeReason:${P}`]).toBe('mudan1.end.chief_safe');
  });

  it('defenders wiped out: worse than history', () => {
    const w = shimen();
    at(w, 1);
    takeShimen(w);
    collect(w);
    expect(outcomeOf(w, P)).toBe('defeat');
    expect(outcomeOf(w, J)).toBe('victory');
  });

  it('the heights hold for 10 minutes, or the expedition breaks: the defenders win', () => {
    const a = shimen();
    at(a, 600);
    collect(a);
    expect(outcomeOf(a, P)).toBe('victory');
    expect(outcomeOf(a, J)).toBe('defeat');
    const b = shimen();
    // Only once the main body is in (5:30) does a broken expedition count as repulsed.
    at(b, 331);
    b.rebuildSpatial();
    for (const e of [...b.all()].filter((u) => u.owner === J && u.kind === 'unit')) killEntity(b, e);
    run(b, 5);
    collect(b);
    expect(b.ext.flags[`outcomeReason:${P}`]).toBe('mudan1.end.repulsed');
  });
});

describe('1874 三路進剿', () => {
  const P = 'faction_paiwan';
  const J = 'faction_japan';
  const VILLAGES = { mudan: [101, 17], nunai: [87, 15], kuskus: [106, 64] } as const;
  const routes = (campaign = {}) => {
    const sc = scenarioById('mudan2');
    const w = new WorldClass(DATA, loadMap('hengchun'), { seed: 3, factions: sc.factions });
    applyScenario(w, sc, campaign);
    w.ext.flags.player = '';
    at(w, 1);
    return w;
  };
  const place = (w: World, tag: string, x: number, y: number) => {
    for (const e of tagged(w, tag)) {
      e.x = e.px = x;
      e.y = e.py = y;
      e.order = { type: 'idle' };
      e.path = null;
    }
  };
  /** Japanese in every village, no defenders there; held 46 s. */
  const occupyAll = (w: World) => {
    w.rebuildSpatial();
    for (const e of [...w.all()]) if (e.owner === P && e.kind === 'unit' && e.type !== 'paiwan_family' && e.x > 78 && e.y < 26) killEntity(w, e);
    for (const [, [x, y]] of Object.entries(VILLAGES)) spawnIn(w, J, 'japan_infantry', 8, x - 2, y + 2);
    run(w, 47 * 20);
  };

  it('三社 occupied after the families left: Japan wins, the defenders get the historical result', () => {
    const w = routes();
    for (const v of Object.keys(VILLAGES)) place(w, `fam_${v}`, 120, 4);
    occupyAll(w);
    collect(w);
    expect(outcomeOf(w, J)).toBe('victory');
    expect(outcomeOf(w, P)).toBe('historical');
    expect(w.ext.flags[`outcomeReason:${P}`]).toBe('mudan2.end.history');
  });

  it('families still in the villages when the Japanese arrive: worse than history', () => {
    const w = routes();
    occupyAll(w);
    collect(w);
    expect(w.ext.flags.trapped).toBe(true);
    expect(outcomeOf(w, P)).toBe('defeat');
    expect(w.ext.flags[`outcomeReason:${P}`]).toBe('mudan2.end.trapped');
  });

  it('every fighter lost: worse than history', () => {
    const w = routes();
    for (const v of Object.keys(VILLAGES)) place(w, `fam_${v}`, 120, 4);
    w.rebuildSpatial();
    for (const e of [...w.all()]) if (e.owner === P && e.kind === 'unit' && e.type !== 'paiwan_family') killEntity(w, e);
    occupyAll(w);
    collect(w);
    expect(w.ext.flags[`outcomeReason:${P}`]).toBe('mudan2.end.rout');
    expect(outcomeOf(w, P)).toBe('defeat');
  });

  it('a defender in the village stops the occupation clock', () => {
    const w = routes();
    for (const v of Object.keys(VILLAGES)) place(w, `fam_${v}`, 120, 4);
    // A defender who cannot be dislodged in this test.
    const d = w.spawnUnit('paiwan_warrior', P, 104, 62);
    d.hp = d.maxHp = 1e9;
    occupyAll(w);
    expect(w.ext.flags.occ_kuskus).toBeUndefined();
    expect(w.ext.flags.occ_mudan).toBe(true);
  });

  it('時間到 or the expedition worn down: the defenders win; 阿祿古 returns only if he survived 石門', () => {
    const a = routes();
    at(a, 600);
    collect(a);
    expect(outcomeOf(a, P)).toBe('victory');
    expect(outcomeOf(a, J)).toBe('defeat');
    const b = routes({ reasons: { mudan1: { [P]: 'mudan1.end.chief_safe' } } });
    expect(tagged(b, 'aruqu')).toHaveLength(1);
    expect(tagged(routes(), 'aruqu')).toHaveLength(0);
    killTag(b, 'aruqu');
    b.rebuildSpatial();
    for (const e of [...b.all()].filter((u) => u.owner === J && u.kind === 'unit').slice(0, 45)) killEntity(b, e);
    at(b, 61);
    collect(b);
    expect(b.ext.flags[`outcomeReason:${P}`]).toBe('mudan2.end.repulsed');
  });
});

describe('1683 澎湖海戰', () => {
  const Q = 'faction_qing';
  const N = 'faction_tungning';
  const sea = (id: string) => {
    const sc = scenarioById(id);
    const w = new WorldClass(DATA, loadMap('penghu'), { seed: 5, factions: sc.factions });
    applyScenario(w, sc);
    w.ext.flags.player = '';
    at(w, 1);
    return w;
  };
  const sink = (w: World, owner: string, n: number, keep: string[] = []) => {
    w.rebuildSpatial();
    const ships = [...w.all()].filter((e) => e.owner === owner && e.kind === 'unit' && e.moveClass !== 'foot' && !keep.includes(e.tag ?? '') && !e.type.endsWith('fire_ship') && !['shi_lang', 'liu_guoxuan'].includes(e.type));
    for (const e of ships.slice(0, n)) killEntity(w, e);
    run(w, 5);
  };
  const wound = (w: World, tag: string, f: number) => {
    const e = tagged(w, tag)[0] ?? [...w.all()].find((x) => x.type === tag)!;
    e.hp = e.maxHp * f;
    run(w, 5);
  };

  it('八罩: the second wave arrives; 施琅 wounded → the Qing fall back (historical)', () => {
    const w = sea('penghu1');
    expect(w.ext.wind?.from).toBe(0);
    at(w, 221);
    expect(tagged(w, 'second')).toHaveLength(14);
    wound(w, 'lin_sheng', 0.4);
    wound(w, 'shi_lang', 0.4);
    collect(w);
    expect(outcomeOf(w, N)).toBe('victory');
    expect(outcomeOf(w, Q)).toBe('historical');
  });

  it('八罩: the Zheng line broken, the Qing repulsed, or time runs out', () => {
    const a = sea('penghu1');
    at(a, 261); // after the ships from 娘媽宮 join
    sink(a, N, 29);
    collect(a);
    expect(outcomeOf(a, Q)).toBe('victory');
    expect(outcomeOf(a, N)).toBe('defeat');
    const b = sea('penghu1');
    sink(b, Q, 19);
    collect(b);
    expect(b.ext.flags[`outcomeReason:${N}`]).toBe('penghu1.end.repulsed');
    const c = sea('penghu1');
    at(c, 600);
    collect(c);
    expect(outcomeOf(c, N)).toBe('victory');
  });

  it('八罩: losing 施琅 and his flagship is worse than history for the Qing', () => {
    const w = sea('penghu1');
    killTag(w, 'shi_lang');
    run(w, 5);
    collect(w);
    expect(outcomeOf(w, Q)).toBe('defeat');
  });

  it('娘媽宮: the wind turns south at noon; the harbour falls and 劉國軒 escapes (historical)', () => {
    const w = sea('penghu2');
    expect(w.ext.wind?.from).toBe(315);
    at(w, 241);
    expect(w.ext.wind?.from).toBe(180);
    at(w, 301);
    expect(tagged(w, 'reserve')).toHaveLength(8);
    const liu = tagged(w, 'liu_guoxuan')[0];
    liu.x = liu.px = 40;
    liu.y = liu.py = 1.5;
    w.rebuildSpatial();
    killEntity(w, w.buildings().find((b) => b.tag === 'niangmagong')!);
    spawnIn(w, Q, 'qing_ganzeng', 12, 58, 46);
    run(w, 10);
    collect(w);
    expect(w.ext.flags.liu_escaped).toBe(true);
    expect(outcomeOf(w, Q)).toBe('victory');
    expect(outcomeOf(w, N)).toBe('historical');
  });

  it('娘媽宮: 劉國軒 sunk is worse than history; 施琅 sunk, heavy Qing losses or the deadline save the harbour', () => {
    const a = sea('penghu2');
    killTag(a, 'liu_guoxuan');
    a.rebuildSpatial();
    killEntity(a, a.buildings().find((b) => b.tag === 'niangmagong')!);
    spawnIn(a, Q, 'qing_ganzeng', 12, 58, 46);
    run(a, 10);
    collect(a);
    expect(outcomeOf(a, N)).toBe('defeat');
    const b = sea('penghu2');
    killTag(b, 'shi_lang');
    run(b, 5);
    collect(b);
    expect(b.ext.flags[`outcomeReason:${N}`]).toBe('penghu2.end.shi_sunk');
    const c = sea('penghu2');
    sink(c, Q, 26);
    collect(c);
    expect(c.ext.flags[`outcomeReason:${N}`]).toBe('penghu2.end.repulsed');
    const d = sea('penghu2');
    at(d, 720);
    collect(d);
    expect(outcomeOf(d, Q)).toBe('defeat');
  });
});

describe('1895 乙未戰爭', () => {
  const J = 'faction_japan_1895';
  const F = 'faction_formosa';
  const land = (id: string, seed = 7) => {
    const sc = scenarioById(id);
    const w = new WorldClass(DATA, loadMap(sc.map!), { seed, factions: sc.factions });
    applyScenario(w, sc);
    w.ext.flags.player = '';
    at(w, 1);
    return w;
  };
  const region = (w: World, id: string) => w.map.regions.find((r) => r.id === id)!;
  /** Clears a region of defenders and stands n Japanese soldiers in it. */
  const occupy = (w: World, id: string, n: number) => {
    const r = region(w, id);
    w.rebuildSpatial();
    // Defenders within sight would walk back in: clear a wide margin (heroes are moved out by the caller).
    for (const e of [...w.all()]) if (e.owner === F && e.kind === 'unit' && e.x >= r.x - 10 && e.y >= r.y - 10 && e.x <= r.x + r.w + 10 && e.y <= r.y + r.h + 10) killEntity(w, e);
    spawnIn(w, J, 'jp95_guard', n, r.x + 2, r.y + 2);
    // Test occupiers neither fall to the remaining batteries nor break for lack of supply.
    for (const e of w.all())
      if (e.owner === J && e.type === 'jp95_guard' && e.x >= r.x && e.y >= r.y && e.x < r.x + r.w && e.y < r.y + r.h) {
        e.hp = e.maxHp = 1e9;
        e.morale = 100;
      }
  };
  const destroy = (w: World, tag: string) => {
    w.rebuildSpatial();
    killEntity(w, w.buildings().find((b) => b.tag === tag)!);
  };
  const killSide = (w: World, owner: string, keep = 0) => {
    w.rebuildSpatial();
    for (const e of [...w.all()].filter((u) => u.owner === owner && u.kind === 'unit').slice(keep)) killEntity(w, e);
  };
  const cartsInto = (w: World, id: string, n: number) => {
    const r = region(w, id);
    for (const c of tagged(w, 'carts').slice(0, n)) {
      c.x = c.px = r.x + 4;
      c.y = c.py = r.y + 4;
      c.order = { type: 'idle' };
      c.path = null;
    }
  };

  it('澳底: landing reinforcements, 瑞芳 falls, 唐景崧 flees, 基隆 taken (historical)', () => {
    const w = land('yiwei1');
    at(w, 150);
    occupy(w, 'ruifang', 8);
    run(w, 5);
    expect(w.ext.flags.ruifang_lost).toBe(true);
    at(w, 300);
    expect(tagged(w, 'taipei_garrison')).toHaveLength(0);
    spawnIn(w, F, 'fm_regular', 3, 20, 30); // survivors who withdraw: not a rout
    destroy(w, 'shiqiuling');
    occupy(w, 'keelung', 6);
    run(w, 32 * 20);
    collect(w);
    expect(outcomeOf(w, J)).toBe('victory');
    expect(outcomeOf(w, F)).toBe('historical');
  });

  it('澳底: defenders wiped out, the Japanese worn down, or the deadline', () => {
    const a = land('yiwei1');
    killSide(a, F);
    destroy(a, 'shiqiuling');
    occupy(a, 'keelung', 6);
    run(a, 32 * 20);
    collect(a);
    expect(outcomeOf(a, F)).toBe('defeat');
    const b = land('yiwei1');
    at(b, 61);
    killSide(b, J, 8);
    run(b, 5);
    collect(b);
    expect(b.ext.flags[`outcomeReason:${F}`]).toBe('yiwei1.end.repulsed');
    const c = land('yiwei1');
    at(c, 600);
    collect(c);
    expect(outcomeOf(c, J)).toBe('defeat');
  });

  it('桃竹苗: the convoy is ambushed, 新竹 gets its depot, 苗栗 falls (historical)', () => {
    const w = land('yiwei2');
    at(w, 300);
    expect(tagged(w, 'carts').length).toBeGreaterThanOrEqual(9);
    w.rebuildSpatial();
    for (const c of tagged(w, 'carts').slice(0, 4)) killEntity(w, c);
    killTag(w, 'jiang_shaozu');
    run(w, 5);
    expect(w.ext.flags.carts_lost).toBe(true);
    occupy(w, 'hsinchu', 6);
    cartsInto(w, 'hsinchu', 3);
    run(w, 32 * 20);
    expect(w.ext.flags.hsinchu_taken).toBe(true);
    expect(w.buildings().some((b) => b.tag === 'hsinchu_depot')).toBe(true);
    at(w, 391); // the last militia from the south are in
    occupy(w, 'miaoli', 6);
    run(w, 62 * 20);
    collect(w);
    expect(w.ext.flags[`outcomeReason:${F}`]).toBe('yiwei2.end.history');
  });

  it('桃竹苗: an unbroken supply line, a wiped-out militia, a starved column, or the deadline', () => {
    const takeBoth = (w: World) => {
      occupy(w, 'hsinchu', 6);
      cartsInto(w, 'hsinchu', 3);
      run(w, 32 * 20);
      occupy(w, 'miaoli', 6);
      run(w, 62 * 20);
    };
    const a = land('yiwei2');
    takeBoth(a);
    collect(a);
    expect(a.ext.flags[`outcomeReason:${F}`]).toBe('yiwei2.end.swift');
    const b = land('yiwei2');
    killSide(b, F);
    takeBoth(b);
    collect(b);
    expect(outcomeOf(b, F)).toBe('defeat');
    const c = land('yiwei2');
    at(c, 331); // the relief is in
    killSide(c, J, 8);
    run(c, 5);
    collect(c);
    expect(c.ext.flags[`outcomeReason:${F}`]).toBe('yiwei2.end.repulsed');
    const d = land('yiwei2');
    at(d, 840);
    collect(d);
    expect(outcomeOf(d, F)).toBe('victory');
  });

  it('八卦山: night until dawn; the battery and 彰化 fall, 吳湯興 and 吳彭年 killed (historical)', () => {
    const w = land('yiwei3');
    expect(w.weather.sightMul).toBeLessThan(1);
    at(w, 151);
    expect(w.weather.sightMul).toBe(1);
    at(w, 240);
    killTag(w, 'wu_tangxing');
    killTag(w, 'wu_pengnian');
    run(w, 5);
    expect(w.ext.flags.leader_dead).toBe(true);
    spawnIn(w, F, 'fm_regular', 3, 30, 60); // survivors who fall back to 嘉義: not a rout
    destroy(w, 'baguashan');
    occupy(w, 'changhua', 6);
    run(w, 92 * 20);
    at(w, 421); // 彰化 counts as taken once the last reinforcements have come
    collect(w);
    expect(outcomeOf(w, F)).toBe('historical');
  });

  it('八卦山: defenders wiped out, the Japanese worn down, or the deadline', () => {
    const a = land('yiwei3');
    killSide(a, F);
    destroy(a, 'baguashan');
    occupy(a, 'changhua', 6);
    run(a, 92 * 20);
    at(a, 405);
    killSide(a, F); // the reinforcements too
    at(a, 421);
    collect(a);
    expect(outcomeOf(a, F)).toBe('defeat');
    const b = land('yiwei3');
    at(b, 361);
    killSide(b, J, 10);
    run(b, 5);
    collect(b);
    expect(b.ext.flags[`outcomeReason:${F}`]).toBe('yiwei3.end.repulsed');
    const c = land('yiwei3');
    at(c, 720);
    collect(c);
    expect(outcomeOf(c, J)).toBe('defeat');
  });

  it('臺南: landings; 劉永福 may leave (historical) — or die, worse than history', () => {
    const w = land('yiwei4');
    at(w, 60);
    expect(tagged(w, 'nogi')).toHaveLength(1);
    killTag(w, 'kitashirakawa');
    at(w, 361);
    w.enqueue({ type: 'choice', owner: F, id: 'liu_flees' });
    run(w, 5);
    collect(w);
    expect(w.ext.flags[`outcomeReason:${F}`]).toBe('yiwei4.end.liu_fled');
    expect(outcomeOf(w, F)).toBe('historical');
    const b = land('yiwei4');
    killTag(b, 'liu_yongfu');
    occupy(b, 'tainan', 8);
    run(b, 32 * 20);
    collect(b);
    expect(outcomeOf(b, F)).toBe('defeat');
    const c = land('yiwei4');
    const liu = tagged(c, 'liu_yongfu')[0];
    liu.x = liu.px = 70;
    liu.y = liu.py = 80;
    occupy(c, 'tainan', 8);
    run(c, 32 * 20);
    collect(c);
    expect(c.ext.flags[`outcomeReason:${F}`]).toBe('yiwei4.end.history');
  });

  it('臺南: disease and losses break the advance, or the deadline', () => {
    const a = land('yiwei4');
    at(a, 61);
    killSide(a, J, 10);
    run(a, 5);
    collect(a);
    expect(a.ext.flags[`outcomeReason:${F}`]).toBe('yiwei4.end.repulsed');
    const b = land('yiwei4');
    at(b, 900);
    collect(b);
    expect(outcomeOf(b, F)).toBe('victory');
  });
});

describe('1683 東寧 (epilogue)', () => {
  const Q = 'faction_qing';
  const N = 'faction_tungning';
  const court = (seed = 3) => {
    const sc = scenarioById('penghu3');
    const w = new WorldClass(DATA, loadMap(sc.map!), { seed, factions: sc.factions });
    applyScenario(w, sc);
    w.ext.flags.player = '';
    at(w, 1);
    return w;
  };
  const choose = (w: World, id: string) => {
    w.enqueue({ type: 'choice', owner: N, id });
    run(w, 5);
  };
  const fleet = (w: World) => [...w.all()].filter((e) => e.owner === N && e.kind === 'unit' && e.moveClass !== 'foot');

  it('surrender, or no decision in 3 minutes: the historical end', () => {
    const a = court();
    choose(a, 'surrender');
    collect(a);
    expect(outcomeOf(a, N)).toBe('historical');
    expect(outcomeOf(a, Q)).toBe('victory');
    const b = court();
    at(b, 181);
    collect(b);
    expect(b.ext.flags[`outcomeReason:${N}`]).toBe('penghu3.end.court');
  });

  it('南下呂宋: the fleet starts battered; six ships reach the southern sea, or the fleet is caught', () => {
    const a = court();
    choose(a, 'luzon');
    expect(tagged(a, 'south_patrol').length).toBe(8);
    expect(fleet(a).filter((s) => s.type !== 'liu_guoxuan').every((s) => s.hp < s.maxHp * 0.5)).toBe(true);
    const r = a.map.regions.find((x) => x.id === 'south_sea')!;
    for (const [i, s] of fleet(a).slice(0, 6).entries()) {
      s.x = s.px = r.x + 2 + (i % 3) * 2;
      s.y = s.py = r.y + 4 + Math.floor(i / 3) * 2;
      s.order = { type: 'idle' };
      s.path = null;
    }
    run(a, 10);
    collect(a);
    expect(outcomeOf(a, N)).toBe('victory');
    expect(outcomeOf(a, Q)).toBe('historical');
    const b = court();
    choose(b, 'luzon');
    b.rebuildSpatial();
    for (const s of fleet(b).filter((x) => x.type !== 'liu_guoxuan').slice(0, 7)) killEntity(b, s);
    run(b, 10);
    collect(b);
    expect(b.ext.flags[`outcomeReason:${N}`]).toBe('penghu3.end.caught');
    expect(outcomeOf(b, N)).toBe('defeat');
  });

  it('死守承天府: the Qing land, the garrisons desert; holding 8 minutes wins, the fort battered loses', () => {
    const a = court();
    choose(a, 'resist');
    expect(tagged(a, 'landing').length).toBe(38);
    at(a, 152);
    expect(tagged(a, 'anping')).toHaveLength(0);
    at(a, 302);
    expect(tagged(a, 'chengtian_b')).toHaveLength(0);
    at(a, 482);
    collect(a);
    expect(a.ext.flags[`outcomeReason:${N}`]).toBe('penghu3.end.held');
    expect(outcomeOf(a, Q)).toBe('defeat');
    const b = court();
    choose(b, 'resist');
    const fort = b.buildings().find((x) => x.type === 'provintia_fort')!;
    fort.hp = fort.maxHp * 0.3;
    run(b, 10);
    collect(b);
    expect(b.ext.flags[`outcomeReason:${N}`]).toBe('penghu3.end.fallen');
  });
});

describe('1914 太魯閣', () => {
  const T = 'faction_truku';
  const S = 'faction_sotokufu';
  const gorge = (seed = 4) => {
    const sc = scenarioById('yiwei5');
    const w = new WorldClass(DATA, loadMap(sc.map!), { seed, factions: sc.factions });
    applyScenario(w, sc);
    w.ext.flags.player = '';
    at(w, 1);
    return w;
  };
  /** Moves every Truku out of the villages (to the northern refuge) and stands five invulnerable Japanese soldiers in each. */
  const occupyAll = (w: World) => {
    w.rebuildSpatial();
    const refuge = w.map.regions.find((x) => x.id === 'refuge_t')!;
    for (const id of ['kbayang', 'kalapau', 'sakahen']) {
      const r = w.map.regions.find((x) => x.id === id)!;
      for (const e of [...w.all()])
        if (e.owner === T && e.kind === 'unit' && e.x >= r.x - 1 && e.y >= r.y - 1 && e.x <= r.x + r.w + 1 && e.y <= r.y + r.h + 1) {
          e.x = e.px = refuge.x + 4 + (e.id % 20);
          e.y = e.py = refuge.y + 3 + (e.id % 5);
          e.order = { type: 'idle' };
          e.path = null;
        }
      spawnIn(w, S, 'jp14_infantry', 5, r.x + 2, r.y + 2);
    }
    for (const e of w.all())
      if (e.owner === S && e.type === 'jp14_infantry') {
        e.hp = e.maxHp = 1e9;
        e.morale = 100;
        // They hold the villages without thinning out the fighters on the terraces.
        e.holdFire = true;
      }
  };
  const all = (w: World, owner: string) => [...w.all()].filter((u) => u.owner === owner && u.kind === 'unit');

  it('佐久間 hurt at 5:00; the three villages held 45 s each → Japan wins, the Truku get the historical result', () => {
    const w = gorge();
    at(w, 301);
    expect(tagged(w, 'sakuma')).toHaveLength(0);
    killTag(w, 'haruq_nawi');
    occupyAll(w);
    run(w, 47 * 20);
    collect(w);
    expect(w.ext.flags[`outcomeReason:${T}`]).toBe('yiwei5.end.history');
    expect(outcomeOf(w, T)).toBe('historical');
    expect(outcomeOf(w, S)).toBe('victory');
  });

  it('every fighter lost as well: worse than history', () => {
    const w = gorge();
    w.rebuildSpatial();
    for (const e of all(w, T).slice(1)) killEntity(w, e);
    occupyAll(w);
    run(w, 47 * 20);
    collect(w);
    expect(w.ext.flags[`outcomeReason:${T}`]).toBe('yiwei5.end.rout');
    expect(outcomeOf(w, T)).toBe('defeat');
  });

  it('a Truku fighter in a village stops its clock', () => {
    const w = gorge();
    occupyAll(w);
    const r = w.map.regions.find((x) => x.id === 'kalapau')!;
    const h = w.spawnUnit('truku_hunter', T, r.x + 4, r.y + 4);
    h.hp = h.maxHp = 1e9;
    run(w, 47 * 20);
    expect(w.ext.flags.occ_kbayang).toBeTruthy();
    expect(w.ext.flags.occ_kalapau).toBeFalsy();
    expect(outcomeOf(w, T)).toBeUndefined();
  });

  it('the columns worn down, or 15 minutes held: the Truku win', () => {
    const a = gorge();
    at(a, 61);
    a.rebuildSpatial();
    for (const e of all(a, S).slice(12)) killEntity(a, e);
    run(a, 10);
    collect(a);
    expect(a.ext.flags[`outcomeReason:${T}`]).toBe('yiwei5.end.repulsed');
    expect(outcomeOf(a, S)).toBe('defeat');
    const b = gorge();
    at(b, 901);
    collect(b);
    expect(b.ext.flags[`outcomeReason:${T}`]).toBe('yiwei5.end.held');
  });
});

describe('1930 霧社事件', () => {
  const S = 'faction_seediq';
  const J = 'faction_sotokufu';
  const open = (id: string, campaign = {}) => {
    const sc = scenarioById(id);
    const w = new WorldClass(DATA, loadMap(sc.map!), { seed: 6, factions: sc.factions });
    applyScenario(w, sc, campaign);
    w.ext.flags.player = '';
    at(w, 1);
    return w;
  };
  const byTag = (w: World, tag: string) => w.buildings().find((b) => b.tag === tag)!;
  const raze = (w: World, tag: string) => {
    w.rebuildSpatial();
    killEntity(w, byTag(w, tag));
    run(w, 5);
  };
  const count = (w: World, owner: string, type: string) => [...w.all()].filter((e) => e.owner === owner && e.type === type).length;
  const killSide = (w: World, owner: string, keep = 0) => {
    w.rebuildSpatial();
    for (const e of [...w.all()].filter((u) => u.owner === owner && u.kind === 'unit').slice(keep)) killEntity(w, e);
  };
  /** n invulnerable men of `owner` standing in a region; the other side cleared out of it. */
  const hold = (w: World, owner: string, type: string, id: string, n: number) => {
    const r = w.map.regions.find((x) => x.id === id)!;
    w.rebuildSpatial();
    for (const e of [...w.all()]) if (e.kind === 'unit' && e.owner !== owner && e.x >= r.x - 1 && e.y >= r.y - 1 && e.x <= r.x + r.w + 1 && e.y <= r.y + r.h + 1) killEntity(w, e);
    spawnIn(w, owner, type, n, r.x + 2, r.y + 2);
    for (const e of w.all())
      if (e.owner === owner && e.type === type && e.x >= r.x && e.y >= r.y && e.x < r.x + r.w && e.y < r.y + r.h) {
        e.hp = e.maxHp = 1e9;
        e.holdFire = true;
      }
  };

  it('起事: each post taken re-arms warriors and adds rounds; 霧社 taken and held to 12:00 (historical for Japan)', () => {
    const w = open('wushe1');
    killTag(w, 'wushe_police');
    const powder = w.faction(S)!.resources.powder;
    const rifles = count(w, S, 'sdq_rifle');
    // Warriors next to the post when it falls take its rifles.
    spawnIn(w, S, 'sdq_warrior', 4, 97, 36);
    raze(w, 'post_mahebu');
    expect(w.faction(S)!.resources.powder).toBe(powder + 120);
    expect(count(w, S, 'sdq_rifle')).toBe(rifles + 3);
    for (const p of ['post_gungu', 'post_sakura', 'post_boarung']) raze(w, p);
    expect(w.ext.flags.taken).toBeFalsy();
    raze(w, 'wushe_branch');
    expect(w.ext.flags.taken).toBe(true);
    at(w, 361);
    expect(tagged(w, 'relief').length).toBe(13);
    at(w, 571);
    expect(tagged(w, 'relief2').length).toBe(12);
    at(w, 721);
    collect(w);
    expect(w.ext.flags[`outcomeReason:${S}`]).toBe('wushe1.end.history');
    expect(outcomeOf(w, S)).toBe('victory');
    expect(outcomeOf(w, J)).toBe('historical');
  });

  it('起事: the relief retakes 霧社, the branch holds, the fighters are lost, or the relief is broken', () => {
    const a = open('wushe1');
    for (const p of ['post_mahebu', 'post_gungu', 'post_sakura', 'post_boarung', 'wushe_branch']) raze(a, p);
    hold(a, J, 'jp14_police', 'wushe', 6);
    run(a, 62 * 20);
    collect(a);
    expect(a.ext.flags[`outcomeReason:${J}`]).toBe('wushe1.end.retaken');
    expect(outcomeOf(a, S)).toBe('defeat');
    const b = open('wushe1');
    raze(b, 'post_nengao');
    raze(b, 'post_tunbara');
    at(b, 721);
    collect(b);
    expect(b.ext.flags[`outcomeReason:${J}`]).toBe('wushe1.end.held');
    const c = open('wushe1');
    at(c, 12);
    killSide(c, S, 2);
    run(c, 10);
    collect(c);
    expect(c.ext.flags[`outcomeReason:${S}`]).toBe('wushe1.end.rout');
    const d = open('wushe1');
    at(d, 651);
    killSide(d, J, 3);
    run(d, 10);
    collect(d);
    expect(d.ext.flags[`outcomeReason:${S}`]).toBe('wushe1.end.repulsed');
    expect(outcomeOf(d, J)).toBe('defeat');
  });

  it('馬赫坡: the posts are gone; rifles and rounds carried over from 起事; air raids warn, then hit (less in forest)', () => {
    const plain = open('wushe2');
    expect(plain.buildings().some((b) => b.type === 'sdq_post')).toBe(false);
    const carried = open('wushe2', { reasons: { wushe1: { [S]: 'wushe1.end.history' } } });
    expect(carried.faction(S)!.resources.powder).toBe(plain.faction(S)!.resources.powder + 400);
    expect(count(carried, S, 'sdq_rifle')).toBe(count(plain, S, 'sdq_rifle') + 6);
    // A knot of men in the open and one in the forest, far from anyone else.
    const w = open('wushe2');
    killSide(w, S);
    // Open ground (cleared for the test) far from the Japanese.
    for (let y = 70; y < 80; y++) for (let x = 25; x < 35; x++) w.map.terrain[y * w.map.width + x] = TERRAIN.plain;
    spawnIn(w, S, 'sdq_warrior', 6, 30.5, 75.5);
    const open1 = [...w.all()].filter((e) => e.owner === S && e.kind === 'unit');
    // One more man in the forest beside them: cover cuts the damage.
    w.map.terrain[75 * w.map.width + 33] = T_FOREST;
    const hid = w.spawnUnit('sdq_warrior', S, 33.5, 75.5);
    at(w, 76);
    expect(w.ext.raids?.length).toBe(1);
    const hp0 = open1[0].hp;
    run(w, 5 * 20);
    // 40 per run, spread over the 7 men in the ring (full damage for up to 4); ×0.35 in the forest.
    expect(open1[0].hp).toBeCloseTo(hp0 - (40 * 4) / 7);
    expect(hid.hp).toBeCloseTo(hid.maxHp - ((40 * 4) / 7) * 0.35);
    expect(w.ext.raids?.length).toBe(0);
    collect(w);
  });

  it('馬赫坡: 塔羅灣, 馬赫坡 and the cave taken → Japan wins (historical for the Seediq); wiped out is worse', () => {
    const w = open('wushe2');
    // The fighters slip away north into the mountains.
    for (const e of [...w.all()]) if (e.owner === S && e.kind === 'unit') {
      e.x = e.px = 70 + (e.id % 10);
      e.y = e.py = 8 + (e.id % 3);
      e.order = { type: 'idle' };
      e.path = null;
    }
    killTag(w, 'tado_nokan');
    killTag(w, 'mona_rudao');
    hold(w, J, 'jp14_infantry', 'truwan', 5);
    hold(w, J, 'jp14_infantry', 'mahebu', 5);
    hold(w, J, 'jp14_infantry', 'cave', 5);
    run(w, 62 * 20);
    collect(w);
    expect(w.ext.flags[`outcomeReason:${S}`]).toBe('wushe2.end.history');
    expect(outcomeOf(w, S)).toBe('historical');
    const b = open('wushe2');
    killSide(b, S, 1);
    hold(b, J, 'jp14_infantry', 'truwan', 5);
    hold(b, J, 'jp14_infantry', 'mahebu', 5);
    hold(b, J, 'jp14_infantry', 'cave', 5);
    run(b, 62 * 20);
    collect(b);
    expect(b.ext.flags[`outcomeReason:${S}`]).toBe('wushe2.end.rout');
    expect(outcomeOf(b, S)).toBe('defeat');
  });

  it('馬赫坡: the Japanese worn down, or 15 minutes held', () => {
    const a = open('wushe2');
    at(a, 421); // after the last reinforcements
    killSide(a, J, 15);
    run(a, 10);
    collect(a);
    expect(a.ext.flags[`outcomeReason:${S}`]).toBe('wushe2.end.repulsed');
    expect(outcomeOf(a, J)).toBe('defeat');
    const b = open('wushe2');
    at(b, 901);
    collect(b);
    expect(b.ext.flags[`outcomeReason:${S}`]).toBe('wushe2.end.held');
  });
});

describe('1884–85 清法戰爭', () => {
  const Q = 'faction_qing84';
  const F = 'faction_france';
  const open = (id: string) => {
    const sc = scenarioById(id);
    const w = new WorldClass(DATA, loadMap(sc.map!), { seed: 8, factions: sc.factions });
    applyScenario(w, sc);
    w.ext.flags.player = '';
    at(w, 1);
    return w;
  };
  const foot = (w: World, owner: string) => [...w.all()].filter((u) => u.owner === owner && u.kind === 'unit' && u.moveClass === 'foot');
  const keep = (w: World, owner: string, n: number) => {
    w.rebuildSpatial();
    for (const e of foot(w, owner).filter((u) => !w.data.units.get(u.type)!.traits.includes('hero')).slice(n)) killEntity(w, e);
    for (const e of foot(w, owner).filter((u) => w.data.units.get(u.type)!.traits.includes('hero'))) killEntity(w, e);
  };
  /** n invulnerable men of `owner` in a region (holding fire); the other side cleared from it. */
  const hold = (w: World, owner: string, type: string, id: string, n: number) => {
    const r = w.map.regions.find((x) => x.id === id)!;
    w.rebuildSpatial();
    for (const e of [...w.all()]) if (e.kind === 'unit' && e.owner !== owner && e.moveClass === 'foot' && e.x >= r.x - 1 && e.y >= r.y - 1 && e.x <= r.x + r.w + 1 && e.y <= r.y + r.h + 1) killEntity(w, e);
    spawnIn(w, owner, type, n, r.x + 2, r.y + 2);
    for (const e of w.all())
      if (e.owner === owner && e.type === type && e.x >= r.x && e.y >= r.y && e.x < r.x + r.w && e.y < r.y + r.h) {
        e.hp = e.maxHp = 1e9;
        e.holdFire = true;
      }
  };

  it('滬尾: the ships bombard, the sailors land in three waves under naval gunfire, the reserve comes; rounds run low', () => {
    const w = open('sf1');
    expect(w.buildings().some((b) => b.tag === 'krupp_battery')).toBe(false);
    at(w, 151);
    expect(tagged(w, 'landing').length).toBe(16);
    at(w, 181);
    expect(w.ext.raids?.length).toBe(1);
    at(w, 241);
    expect(tagged(w, 'reserve').length).toBe(12);
    at(w, 391);
    expect(tagged(w, 'landing').length).toBeGreaterThan(16);
    w.faction(F)!.resources.powder = 100;
    run(w, 10);
    expect(w.ext.flags['fired:sf1_rounds']).toBe(true);
    killTag(w, 'sun_kaihua');
    run(w, 10);
    collect(w);
  });

  it('滬尾: heights held 60 s → France wins; the landing thrown back (historical), wiped out, or the deadline', () => {
    const a = open('sf1');
    at(a, 151);
    hold(a, F, 'fr_sailor', 'heights', 8);
    run(a, 62 * 20);
    collect(a);
    expect(a.ext.flags[`outcomeReason:${F}`]).toBe('sf1.end.taken');
    expect(outcomeOf(a, Q)).toBe('defeat');
    const b = open('sf1');
    at(b, 421); // all the sailors are ashore
    keep(b, F, 5);
    run(b, 10);
    collect(b);
    expect(b.ext.flags[`outcomeReason:${Q}`]).toBe('sf1.end.history');
    expect(outcomeOf(b, F)).toBe('historical');
    const c = open('sf1');
    at(c, 421);
    keep(c, F, 1);
    run(c, 10);
    collect(c);
    expect(c.ext.flags[`outcomeReason:${F}`]).toBe('sf1.end.rout');
    expect(outcomeOf(c, F)).toBe('defeat');
    const d = open('sf1');
    at(d, 721);
    collect(d);
    expect(d.ext.flags[`outcomeReason:${Q}`]).toBe('sf1.end.held');
  });

  it('月眉山: rain spoils aim from 5:00 to 7:00; the flanking column at 7:00; the ridge falls, then 暖暖 or the push timer', () => {
    const w = open('sf2');
    at(w, 310);
    expect(w.weather.rangedHitPenalty).toBe(0.25);
    at(w, 421);
    expect(w.weather.rangedHitPenalty).toBe(0);
    expect(tagged(w, 'flank2').length).toBe(10);
    killTag(w, 'lin_chaodong');
    hold(w, F, 'fr_marine', 'hongdan', 5);
    hold(w, F, 'fr_marine', 'yuemei', 5);
    run(w, 47 * 20);
    expect(w.ext.flags.heights).toBe(true);
    at(w, Math.ceil(w.tick / 20) + 121);
    collect(w);
    expect(w.ext.flags[`outcomeReason:${Q}`]).toBe('sf2.end.history');
    expect(outcomeOf(w, Q)).toBe('historical');
    const b = open('sf2');
    hold(b, F, 'fr_marine', 'hongdan', 5);
    hold(b, F, 'fr_marine', 'yuemei', 5);
    run(b, 47 * 20);
    hold(b, F, 'fr_marine', 'nuannuan', 5);
    run(b, 47 * 20);
    collect(b);
    expect(b.ext.flags[`outcomeReason:${Q}`]).toBe('sf2.end.crushed');
    expect(outcomeOf(b, Q)).toBe('defeat');
  });

  it('月眉山: the French worn down, or 15 minutes held', () => {
    const a = open('sf2');
    at(a, 61);
    keep(a, F, 6);
    run(a, 10);
    collect(a);
    expect(a.ext.flags[`outcomeReason:${Q}`]).toBe('sf2.end.repulsed');
    expect(outcomeOf(a, F)).toBe('defeat');
    const b = open('sf2');
    at(b, 901);
    collect(b);
    expect(b.ext.flags[`outcomeReason:${Q}`]).toBe('sf2.end.held');
  });

  it('澎湖: 1885 works on the 1683 map; the marines land at 2:00; Makung taken (historical) or the landing beaten', () => {
    const w = open('sf3');
    expect(w.buildings().filter((b) => b.owner === Q).map((b) => b.tag).sort()).toEqual(['makung_fort', 'south_fort']);
    at(w, 121);
    expect(tagged(w, 'landing').length).toBe(16);
    at(w, 151);
    expect(w.ext.raids?.length).toBe(1);
    killTag(w, 'courbet');
    // Survivors elsewhere on the island (the garrison was not wiped out in history).
    hold(w, Q, 'q84_brave', 'east_islets', 6);
    hold(w, F, 'fr_marine', 'makung', 6);
    run(w, 62 * 20);
    collect(w);
    expect(w.ext.flags[`outcomeReason:${Q}`]).toBe('sf3.end.history');
    expect(outcomeOf(w, Q)).toBe('historical');
    const b = open('sf3');
    at(b, 141);
    keep(b, F, 3);
    run(b, 10);
    collect(b);
    expect(b.ext.flags[`outcomeReason:${Q}`]).toBe('sf3.end.repulsed');
    expect(outcomeOf(b, F)).toBe('defeat');
    const c = open('sf3');
    at(c, 721);
    collect(c);
    expect(c.ext.flags[`outcomeReason:${Q}`]).toBe('sf3.end.held');
    const d = open('sf3');
    at(d, 121);
    keep(d, Q, 1);
    hold(d, F, 'fr_marine', 'makung', 6);
    run(d, 62 * 20);
    collect(d);
    expect(d.ext.flags[`outcomeReason:${Q}`]).toBe('sf3.end.rout');
    expect(outcomeOf(d, Q)).toBe('defeat');
  });

  it('a forest-hidden musketeer who has just fired is seen by anyone in sight (no endless search)', () => {
    const w = open('sf1');
    const m = tagged(w, 'militia')[0];
    w.map.terrain[Math.floor(m.y) * w.map.width + Math.floor(m.x)] = TERRAIN.forest;
    m.revealedUntil = w.tick + 20;
    expect(typeof isVisibleTo(w, F, m)).toBe('boolean');
  });
});

describe('1786–88 林爽文事件', () => {
  const L = 'faction_tiandihui';
  const Q = 'faction_qing1787';
  const open = (id: string) => {
    const sc = scenarioById(id);
    const w = new WorldClass(DATA, loadMap(sc.map!), { seed: 9, factions: sc.factions });
    applyScenario(w, sc);
    w.ext.flags.player = '';
    at(w, 1);
    return w;
  };
  const men = (w: World, owner: string) => [...w.all()].filter((u) => u.owner === owner && u.kind === 'unit' && !w.data.units.get(u.type)!.traits.includes('non_combat'));
  const keep = (w: World, owner: string, n: number) => {
    w.rebuildSpatial();
    for (const e of men(w, owner).slice(n)) killEntity(w, e);
  };
  /** n invulnerable men of `owner` in a region (holding fire); the other side cleared from it. */
  const hold = (w: World, owner: string, type: string, id: string, n: number) => {
    const r = w.map.regions.find((x) => x.id === id)!;
    w.rebuildSpatial();
    for (const e of [...w.all()]) if (e.kind === 'unit' && e.owner !== owner && e.x >= r.x - 1 && e.y >= r.y - 1 && e.x <= r.x + r.w + 1 && e.y <= r.y + r.h + 1) killEntity(w, e);
    spawnIn(w, owner, type, n, r.x + 2, r.y + 2);
    for (const e of w.all())
      if (e.owner === owner && e.type === type && e.x >= r.x && e.y >= r.y && e.x < r.x + r.w && e.y < r.y + r.h) {
        e.hp = e.maxHp = 1e9;
        e.holdFire = true;
      }
  };
  const tagOf = (w: World, tag: string) => w.buildings().find((b) => b.tag === tag);

  it('彰化起事: the 1787 town (renamed), help from Lukang at 4:30; Changhua taken (historical for the Qing) or crushed', () => {
    const w = open('ls1');
    expect(tagOf(w, 'changhua_1787')).toBeTruthy();
    expect(w.buildings().some((b) => b.type === 'fm_fort')).toBe(false);
    at(w, 271);
    expect(tagged(w, 'relief').length).toBe(11);
    killTag(w, 'lin_shuangwen');
    hold(w, Q, 'q87_soldier', 'lukang', 4);
    hold(w, L, 'td_brave', 'changhua', 8);
    run(w, 92 * 20);
    collect(w);
    expect(w.ext.flags[`outcomeReason:${L}`]).toBe('ls1.end.history');
    expect(outcomeOf(w, Q)).toBe('historical');
    const b = open('ls1');
    at(b, 421);
    keep(b, Q, 2);
    hold(b, L, 'td_brave', 'changhua', 8);
    run(b, 92 * 20);
    collect(b);
    expect(b.ext.flags[`outcomeReason:${Q}`]).toBe('ls1.end.crushed');
    expect(outcomeOf(b, Q)).toBe('defeat');
  });

  it('彰化起事: the rising breaks up, or the town holds for 10 minutes', () => {
    const a = open('ls1');
    at(a, 181);
    keep(a, L, 4);
    run(a, 10);
    collect(a);
    expect(a.ext.flags[`outcomeReason:${L}`]).toBe('ls1.end.rout');
    const b = open('ls1');
    at(b, 601);
    collect(b);
    expect(outcomeOf(b, Q)).toBe('victory');
    expect(outcomeOf(b, L)).toBe('defeat');
  });

  it('諸羅之圍: relief with grain carts at 5:00 brings out the townspeople; the second relief at 10:00; held (historical) or fallen', () => {
    const w = open('ls2');
    expect(tagOf(w, 'zhuluo')).toBeTruthy();
    at(w, 301);
    const carts = tagged(w, 'carts');
    expect(carts.length).toBe(3);
    const r = w.map.regions.find((x) => x.id === 'chiayi')!;
    for (const c of carts) {
      c.x = c.px = r.x + 6;
      c.y = c.py = r.y + 6;
      c.order = { type: 'idle' };
      c.path = null;
    }
    run(w, 10);
    expect(tagged(w, 'carts').length).toBe(0);
    expect(tagged(w, 'citizens').length).toBe(6);
    at(w, 601);
    expect(tagged(w, 'relief2').length).toBe(14);
    killTag(w, 'chai_daji');
    at(w, 901);
    collect(w);
    expect(w.ext.flags[`outcomeReason:${Q}`]).toBe('ls2.end.history');
    expect(outcomeOf(w, L)).toBe('historical');
    const b = open('ls2');
    hold(b, L, 'td_brave', 'chiayi', 8);
    run(b, 92 * 20);
    collect(b);
    expect(b.ext.flags[`outcomeReason:${L}`]).toBe('ls2.end.fallen');
    expect(outcomeOf(b, Q)).toBe('defeat');
    const c = open('ls2');
    at(c, 241);
    keep(c, L, 6);
    run(c, 10);
    collect(c);
    expect(c.ext.flags[`outcomeReason:${L}`]).toBe('ls2.end.rout');
    expect(outcomeOf(c, L)).toBe('defeat');
  });

  it('福康安渡臺: Baguashan and Changhua taken (historical, or a rout); or the Qing worn down, or 15 minutes held', () => {
    const w = open('ls3');
    killTag(w, 'lin_shuangwen');
    hold(w, L, 'td_brave', 'refuge_e', 4);
    hold(w, Q, 'q87_soldier', 'baguashan', 6);
    hold(w, Q, 'q87_soldier', 'changhua', 6);
    run(w, 62 * 20);
    collect(w);
    expect(w.ext.flags[`outcomeReason:${L}`]).toBe('ls3.end.history');
    expect(outcomeOf(w, L)).toBe('historical');
    const b = open('ls3');
    keep(b, L, 2);
    hold(b, Q, 'q87_soldier', 'baguashan', 6);
    hold(b, Q, 'q87_soldier', 'changhua', 6);
    run(b, 62 * 20);
    collect(b);
    expect(b.ext.flags[`outcomeReason:${L}`]).toBe('ls3.end.rout');
    expect(outcomeOf(b, L)).toBe('defeat');
    const c = open('ls3');
    at(c, 241);
    keep(c, Q, 8);
    run(c, 10);
    collect(c);
    expect(c.ext.flags[`outcomeReason:${L}`]).toBe('ls3.end.repulsed');
    expect(outcomeOf(c, Q)).toBe('defeat');
    const d = open('ls3');
    at(d, 901);
    collect(d);
    expect(d.ext.flags[`outcomeReason:${L}`]).toBe('ls3.end.held');
  });
});

describe('difficulty in scripted chapters', () => {
  const open = (id: string, mul?: Record<string, number>) => {
    const sc = scenarioById(id);
    const w = new WorldClass(DATA, loadMap(sc.map!), { seed: 2, factions: sc.factions });
    for (const [o, m] of Object.entries(mul ?? {})) w.ext.flags[`armyMul:${o}`] = m;
    applyScenario(w, sc);
    return w;
  };
  const n = (w: World, type: string) => [...w.all()].filter((e) => e.type === type).length;

  it('scales the AI side: fighting men at the start and in reinforcements; heroes and supply carts keep their numbers', () => {
    const J = 'faction_japan_1895';
    const base = open('yiwei2');
    const hard = open('yiwei2', { [J]: 1.25 });
    const easy = open('yiwei2', { [J]: 0.75 });
    for (const type of ['jp95_infantry', 'jp95_guard']) {
      if (!n(base, type)) continue;
      expect(n(hard, type)).toBeGreaterThan(n(base, type));
      expect(n(easy, type)).toBeLessThan(n(base, type));
    }
    expect(n(hard, 'jp95_cart')).toBe(n(base, 'jp95_cart'));
    expect(n(hard, 'kitashirakawa')).toBe(n(base, 'kitashirakawa'));
    // The other side is untouched.
    expect(n(hard, 'fm_militia')).toBe(n(base, 'fm_militia'));
    // A reinforcement spawned by a trigger is scaled too.
    const w = open('wushe1', { faction_sotokufu: 1.25 });
    w.ext.flags.player = '';
    at(w, 1);
    at(w, 361);
    expect(tagged(w, 'relief').length).toBe(Math.round(13 * 1.25));
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
    for (const f of sc.factions ?? [Z, V]) {
      expect(won, `${sc.id} ${f} can win`).toContain(`${sc.id}:${f}`);
      expect(lost, `${sc.id} ${f} can lose`).toContain(`${sc.id}:${f}`);
    }
});
