import { describe, expect, it } from 'vitest';
import { hashWorld } from '../src/sim/hash';
import { step } from '../src/sim/loop';
import type { Command } from '../src/sim/commands';
import type { World } from '../src/sim/world';
import { makeWorld } from './helpers';

const Z = 'faction_zheng';
const V = 'faction_voc';

function spawnArmies(w: World) {
  const zf: number[] = [];
  const vf: number[] = [];
  const ships: number[] = [];
  for (let i = 0; i < 40; i++)
    zf.push(w.spawnUnit(i % 2 ? 'archer_zheng' : 'shield_soldier', Z, 34 + (i % 8), 32 + Math.floor(i / 8)).id);
  for (let i = 0; i < 20; i++) vf.push(w.spawnUnit('musketeer_voc', V, 52 + (i % 5), 68 + Math.floor(i / 5)).id);
  for (let i = 0; i < 10; i++) ships.push(w.spawnUnit('junk', Z, 5 + (i % 5) * 2, 20 + Math.floor(i / 5) * 2).id);
  return { zf, vf, ships };
}

function runScripted(seed: number, script: (t: number) => Command[]) {
  const w = makeWorld({ seed });
  spawnArmies(w);
  const hashes: string[] = [];
  for (let t = 0; t < 6000; t++) {
    for (const c of script(t)) w.enqueue(c);
    step(w);
    if (w.tick % 100 === 0) hashes.push(hashWorld(w));
  }
  return { hashes, log: w.commandLog };
}

function originalScript(t: number): Command[] {
  // Ids are deterministic: 1..N are preset map buildings, then the spawned armies.
  const probe = makeWorld();
  const { zf, vf, ships } = spawnArmies(probe);
  const script = new Map<number, Command[]>([
    [5, [{ type: 'move', owner: Z, ids: zf, x: 58, y: 38 }]],
    [10, [{ type: 'move', owner: Z, ids: ships, x: 60, y: 24 }]],
    [200, [{ type: 'move', owner: V, ids: vf, x: 64, y: 60 }]],
    [1500, [{ type: 'move', owner: Z, ids: zf.slice(0, 10), x: 40, y: 34 }, { type: 'stop', owner: Z, ids: zf.slice(10, 12) }]],
    [3000, [{ type: 'move', owner: Z, ids: ships, x: 100, y: 40 }]],
    [4200, [{ type: 'move', owner: V, ids: vf, x: 45, y: 70 }]],
  ]);
  return script.get(t) ?? [];
}

const memo = new Map<number, Command[]>();
const script = (t: number) => {
  if (!memo.has(t)) memo.set(t, [5, 10, 200, 1500, 3000, 4200].includes(t) ? originalScript(t) : []);
  return memo.get(t)!;
};

describe('determinism', () => {
  it('same seed + same commands → identical state hash every 100 ticks for 6,000 ticks', { timeout: 120_000 }, () => {
    const a = runScripted(42, script);
    const b = runScripted(42, script);
    expect(a.hashes).toHaveLength(60);
    expect(new Set(a.hashes).size).toBeGreaterThan(30);
    expect(b.hashes).toEqual(a.hashes);
  });

  it('replaying the recorded command log reproduces the same state', { timeout: 120_000 }, () => {
    const a = runScripted(9, script);
    const replay = runScripted(9, (t) => a.log.filter((l) => l.tick === t).map((l) => l.cmd));
    expect(replay.hashes).toEqual(a.hashes);
  });
});
