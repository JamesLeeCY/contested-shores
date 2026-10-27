import { describe, expect, it } from 'vitest';
import { armyPop } from '../src/sim/ai/common';
import { cheatCode } from '../src/sim/cheats';
import { hashWorld } from '../src/sim/hash';
import { step } from '../src/sim/loop';
import { killEntity } from '../src/sim/systems/combat';
import { fogOf, updateFog } from '../src/sim/systems/fog';
import { recordChapter } from '../src/ui/campaign';
import { scenarioById } from '../src/data/scenarios';
import { makeWorld, run } from './helpers';

const Z = 'faction_zheng';
const V = 'faction_voc';

function withLaborer() {
  const w = makeWorld();
  w.spawnUnit('laborer', Z, 124.5, 40.5);
  return w;
}

const cheat = (w: ReturnType<typeof makeWorld>, code: string) => {
  w.enqueue({ type: 'cheat', owner: Z, code });
  step(w);
};
const vehicles = (w: ReturnType<typeof makeWorld>, type: string) => [...w.all()].filter((e) => e.type === type);

describe('cheats (Age of Empires II tribute)', () => {
  it('recognises codes regardless of case and spacing', () => {
    expect(cheatCode('  How  Do You Turn This ON ')).toBe('cobra');
    expect(cheatCode('發財啦')).toBe('truck');
    expect(cheatCode('滷肉飯')).toBe('grain');
    expect(cheatCode('MARCO')).toBe('reveal');
    expect(cheatCode('how do you turn this off')).toBeNull();
  });

  it('how do you turn this on: a blue sports car beside the player, and the game is marked', () => {
    const w = withLaborer();
    cheat(w, 'cobra');
    const [car] = vehicles(w, 'cobra_car');
    expect(car?.owner).toBe(Z);
    expect(Math.hypot(car.x - 124.5, car.y - 40.5)).toBeLessThan(6);
    expect(w.ext.flags[`cheated:${Z}`]).toBe(true);
    expect(w.ext.flags[`cheated:${V}`]).toBeUndefined();
    expect(w.events.some((e) => e.type === 'message' && e.textKey === 'cheat.ok.cobra')).toBe(true);
  });

  it('no car and no cheat mark when there is nowhere to park', () => {
    const w = makeWorld();
    cheat(w, 'cobra');
    expect(vehicles(w, 'cobra_car')).toHaveLength(0);
    expect(w.ext.flags[`cheated:${Z}`]).toBeUndefined();
    expect(w.events.some((e) => e.type === 'message' && e.textKey === 'cheat.no_room')).toBe(true);
  });

  it('unknown codes do nothing', () => {
    const w = withLaborer();
    cheat(w, 'nuke');
    expect(w.ext.flags[`cheated:${Z}`]).toBeUndefined();
  });

  it('resource codes add 1000', () => {
    const w = withLaborer();
    const before = { ...w.faction(Z)!.resources };
    for (const c of ['grain', 'wood', 'powder', 'deerskin']) cheat(w, c);
    const after = w.faction(Z)!.resources;
    for (const k of ['grain', 'wood', 'powder', 'deerskin'] as const) expect(after[k] - before[k]).toBeGreaterThanOrEqual(999);
  });

  it('marco reveals the whole map and toggles off again', () => {
    const w = withLaborer();
    cheat(w, 'reveal');
    updateFog(w);
    expect(fogOf(w, Z)!.visible.every((v) => v === 1)).toBe(true);
    cheat(w, 'reveal');
    updateFog(w);
    expect(fogOf(w, Z)!.visible.some((v) => v === 0)).toBe(true);
  });

  it('aegis finishes training at once', () => {
    const w = withLaborer();
    const camp = w.spawnBuilding('camp_zheng', Z, 118, 36);
    w.faction(Z)!.resources.grain = 500;
    cheat(w, 'instant');
    const n = vehicles(w, 'laborer').length;
    w.enqueue({ type: 'produce', owner: Z, building: camp.id, unit: 'laborer' });
    run(w, 3);
    expect(vehicles(w, 'laborer').length).toBe(n + 1);
  });

  it('vehicles are left out of army counts', () => {
    const w = withLaborer();
    w.spawnUnit('shield_soldier', Z, 120.5, 40.5);
    const pop = armyPop(w, Z);
    cheat(w, 'cobra');
    cheat(w, 'truck');
    expect(armyPop(w, Z)).toBe(pop);
  });

  it('the car shoots enemies down', () => {
    const w = withLaborer();
    cheat(w, 'cobra');
    const [car] = vehicles(w, 'cobra_car');
    const foes = [0, 1, 2, 3].map((i) => w.spawnUnit('musketeer_voc', V, car.x + 4 + (i % 2), car.y + Math.floor(i / 2)));
    run(w, 20 * 30);
    expect(foes.filter((f) => w.get(f.id)).length).toBe(0);
    expect(w.get(car.id)).toBeTruthy();
  });

  it('the truck carries 4 foot soldiers, who climb out when it is destroyed', () => {
    const w = withLaborer();
    cheat(w, 'truck');
    const [truck] = vehicles(w, 'fatsai_truck');
    const men = [0, 1, 2, 3, 4].map((i) => w.spawnUnit('shield_soldier', Z, truck.x + 1 + i * 0.3, truck.y));
    w.enqueue({ type: 'embark', owner: Z, ids: men.map((m) => m.id), target: truck.id });
    run(w, 20 * 5);
    expect(truck.cargo?.length).toBe(4);
    killEntity(w, truck);
    expect(men.every((m) => w.get(m.id) && !m.insideOf)).toBe(true);
  });

  it('replays the same way', () => {
    const play = () => {
      const w = withLaborer();
      w.spawnUnit('musketeer_voc', V, 130, 44);
      for (const c of ['cobra', 'truck', 'reveal', 'grain']) cheat(w, c);
      run(w, 400);
      return hashWorld(w);
    };
    expect(play()).toBe(play());
  });

  it('a cheated chapter records no rating', () => {
    const w = withLaborer();
    const sc = scenarioById('ch1')!;
    w.ext.flags[`outcome:${Z}`] = 'victory';
    cheat(w, 'grain');
    const before = { ratings: {} };
    expect(recordChapter(before, sc, w)).toBe(before);
  });
});
