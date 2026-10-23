import { describe, expect, it } from 'vitest';
import { loadMap } from '../src/data/map';
import { scenarioById } from '../src/data/scenarios';
import { enableAi } from '../src/sim/ai';
import { hashWorld } from '../src/sim/hash';
import { applyScenario } from '../src/sim/scenario/setup';
import { b64ToBytes, bytesToB64, restoreWorld, snapshotWorld } from '../src/sim/snapshot';
import { World } from '../src/sim/world';
import { DATA, MAP, makeWorld, run } from './helpers';

function aiChapter(ch: number, seed: number) {
  const w = makeWorld({ seed });
  const sc = scenarioById(`ch${ch}`);
  applyScenario(w, sc);
  for (const [o, s] of Object.entries(sc.ai ?? {})) enableAi(w, o, s);
  return w;
}

describe('snapshots (spec §10.5)', () => {
  it('base64 round-trips arbitrary bytes', () => {
    for (const n of [0, 1, 2, 3, 4, 100, 19201]) {
      const a = new Uint8Array(n).map((_, i) => (i * 37 + 11) & 255);
      expect([...b64ToBytes(bytesToB64(a))]).toEqual([...a]);
    }
  });

  it('a restored world has the same state hash', () => {
    const w = aiChapter(2, 3);
    run(w, 20 * 90);
    const snap = JSON.parse(JSON.stringify(snapshotWorld(w)));
    const r = restoreWorld(DATA, MAP, snap, scenarioById);
    expect(hashWorld(r)).toBe(hashWorld(w));
  });

  it('a restored world continues exactly like the original (AI vs AI, 3,000 more ticks)', { timeout: 120_000 }, () => {
    for (const [ch, seed] of [[1, 4], [4, 2]] as const) {
      const w = aiChapter(ch, seed);
      run(w, 20 * 70);
      const snap = JSON.parse(JSON.stringify(snapshotWorld(w)));
      const r = restoreWorld(DATA, MAP, snap, scenarioById);
      for (let i = 0; i < 30; i++) {
        run(w, 100);
        run(r, 100);
        expect(hashWorld(r), `chapter ${ch} after ${(i + 1) * 100} ticks`).toBe(hashWorld(w));
      }
    }
  });
});

describe('save replay with an AI opponent', () => {
  it('replaying only player commands reproduces the run (the AI re-issues its own)', () => {
    const sc = scenarioById('mudan1');
    const w = new World(DATA, loadMap('hengchun'), { seed: 7, factions: sc.factions, player: 'faction_paiwan' });
    applyScenario(w, sc);
    enableAi(w, 'faction_japan', sc.ai!.faction_japan);
    const snap = snapshotWorld(w);
    const hunters = [...w.all()].filter((e) => e.type === 'paiwan_hunter').map((e) => e.id);
    w.enqueue({ type: 'stance', owner: 'faction_paiwan', ids: hunters, hold: true });
    run(w, 400);
    expect(w.commandLog.some((c) => c.cmd.ai)).toBe(true);
    const r = restoreWorld(DATA, loadMap, snap, scenarioById);
    while (r.tick < w.tick) {
      for (const c of w.commandLog) if (c.tick === r.tick && !c.cmd.ai) r.enqueue(c.cmd);
      run(r, 1);
    }
    expect(hashWorld(r)).toBe(hashWorld(w));
  });
});
