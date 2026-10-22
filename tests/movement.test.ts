import { describe, expect, it } from 'vitest';
import { applyTideChange } from '../src/sim/systems/tide';
import { findPath } from '../src/sim/path/astar';
import { makeWorld, run, setTide } from './helpers';

const Z = 'faction_zheng';
const V = 'faction_voc';

describe('pathfinding and tide', () => {
  it('junks can enter Luermen only at high tide; warships never', () => {
    const w = makeWorld();
    setTide(w, 'high');
    expect(findPath(w.nav, 'small_craft', 15, 24, 25, 24).complete).toBe(true);
    expect(findPath(w.nav, 'ship', 15, 24, 25, 24).complete).toBe(false);
    setTide(w, 'low');
    expect(findPath(w.nav, 'small_craft', 15, 24, 25, 24).complete).toBe(false);
  });

  it('a junk sails from the open sea through Luermen into the lagoon during high tide', () => {
    const w = makeWorld();
    const junk = w.spawnUnit('junk', Z, 15.5, 24.5);
    w.enqueue({ type: 'move', owner: Z, ids: [junk.id], x: 60.5, y: 24.5 });
    run(w, 20 * 60);
    expect(Math.hypot(junk.x - 60.5, junk.y - 24.5)).toBeLessThan(1);
  });

  it('ships on drying shallows strand, take no orders, and float again at high tide', () => {
    const w = makeWorld();
    setTide(w, 'high');
    const junk = w.spawnUnit('junk', Z, 25.5, 24.5);
    setTide(w, 'low');
    applyTideChange(w);
    expect(junk.stranded).toBe(true);
    w.enqueue({ type: 'move', owner: Z, ids: [junk.id], x: 10.5, y: 24.5 });
    run(w, 20);
    expect(junk.x).toBeCloseTo(25.5, 5);
    setTide(w, 'high');
    applyTideChange(w);
    expect(junk.stranded).toBe(false);
  });

  it('the tide cycle advances through four phases in 240 s', () => {
    const w = makeWorld();
    const seen: string[] = [];
    for (let i = 0; i < 240 * 20; i++) {
      run(w, 1);
      for (const ev of w.events) if (ev.type === 'tide') seen.push(ev.phase as string);
    }
    expect(seen).toEqual(['high', 'falling', 'low', 'rising']);
  });

  it('a large group shares a flow field and all members arrive near the target', () => {
    const w = makeWorld();
    const ids: number[] = [];
    for (let i = 0; i < 30; i++)
      ids.push(w.spawnUnit('shield_soldier', Z, 35 + (i % 6) * 0.8, 33 + Math.floor(i / 6) * 0.8).id);
    w.enqueue({ type: 'move', owner: Z, ids, x: 58.5, y: 38.5 });
    run(w, 1);
    expect(w.get(ids[0])!.flowKey).toBeTruthy();
    run(w, 20 * 45);
    for (const id of ids) {
      const u = w.get(id)!;
      expect(Math.hypot(u.x - 58.5, u.y - 38.5)).toBeLessThan(6);
      expect(u.goalX).toBeUndefined();
    }
  });

  it('units route around the castle instead of through it', () => {
    const w = makeWorld();
    const u = w.spawnUnit('musketeer_voc', V, 36.5, 57.5);
    w.enqueue({ type: 'move', owner: V, ids: [u.id], x: 52.5, y: 57.5 });
    let crossed = false;
    for (let i = 0; i < 20 * 40; i++) {
      run(w, 1);
      if (w.nav.blocked[Math.floor(u.y) * w.map.width + Math.floor(u.x)]) crossed = true;
    }
    expect(crossed).toBe(false);
    expect(Math.hypot(u.x - 52.5, u.y - 57.5)).toBeLessThan(1);
  });

  it("ignores commands for another owner's units", () => {
    const w = makeWorld();
    const u = w.spawnUnit('pikeman', V, 50.5, 70.5);
    w.enqueue({ type: 'move', owner: Z, ids: [u.id], x: 60, y: 70 });
    run(w, 40);
    expect(u.x).toBe(50.5);
  });
});
