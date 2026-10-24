// Stage 7 acceptance: every scripted event fires in at least one test, and each of the 8 levels
// (4 chapters × 2 sides) can end in both a win and a loss for that side.
import { afterAll, describe, expect, it } from 'vitest';
import { SCENARIOS, scenarioById } from '../src/data/scenarios';
import { applyScenario } from '../src/sim/scenario/setup';
import { outcomeOf, type Trigger } from '../src/sim/scenario/triggers';
import { killEntity } from '../src/sim/systems/combat';
import { captureBuilding } from '../src/sim/systems/siege';
import type { World } from '../src/sim/world';
import { loadMap } from '../src/data/map';
import { DATA, makeWorld, run } from './helpers';
import { World as WorldClass } from '../src/sim/world';

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

  it('the heights hold for 8 minutes, or the expedition breaks: the defenders win', () => {
    const a = shimen();
    at(a, 480);
    collect(a);
    expect(outcomeOf(a, P)).toBe('victory');
    expect(outcomeOf(a, J)).toBe('defeat');
    const b = shimen();
    at(b, 61);
    b.rebuildSpatial();
    for (const e of [...b.all()].filter((u) => u.owner === J && u.kind === 'unit').slice(0, 30)) killEntity(b, e);
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
    at(w, 120);
    expect(tagged(w, 'second')).toHaveLength(14);
    wound(w, 'lin_sheng', 0.4);
    wound(w, 'shi_lang', 0.4);
    collect(w);
    expect(outcomeOf(w, N)).toBe('victory');
    expect(outcomeOf(w, Q)).toBe('historical');
  });

  it('八罩: the Zheng line broken, the Qing repulsed, or time runs out', () => {
    const a = sea('penghu1');
    sink(a, N, 20);
    collect(a);
    expect(outcomeOf(a, Q)).toBe('victory');
    expect(outcomeOf(a, N)).toBe('defeat');
    const b = sea('penghu1');
    sink(b, Q, 14);
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
    run(w, 22 * 20);
    expect(w.ext.flags.hsinchu_taken).toBe(true);
    expect(w.buildings().some((b) => b.tag === 'hsinchu_depot')).toBe(true);
    occupy(w, 'miaoli', 6);
    run(w, 32 * 20);
    collect(w);
    expect(w.ext.flags[`outcomeReason:${F}`]).toBe('yiwei2.end.history');
  });

  it('桃竹苗: an unbroken supply line, a wiped-out militia, a starved column, or the deadline', () => {
    const takeBoth = (w: World) => {
      occupy(w, 'hsinchu', 6);
      cartsInto(w, 'hsinchu', 3);
      run(w, 22 * 20);
      occupy(w, 'miaoli', 6);
      run(w, 32 * 20);
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
    at(c, 61);
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
    run(w, 32 * 20);
    collect(w);
    expect(outcomeOf(w, F)).toBe('historical');
  });

  it('八卦山: defenders wiped out, the Japanese worn down, or the deadline', () => {
    const a = land('yiwei3');
    killSide(a, F);
    destroy(a, 'baguashan');
    occupy(a, 'changhua', 6);
    run(a, 32 * 20);
    collect(a);
    expect(outcomeOf(a, F)).toBe('defeat');
    const b = land('yiwei3');
    at(b, 61);
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
