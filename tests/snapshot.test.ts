import { describe, expect, it } from 'vitest';
import { scenarioById } from '../src/data/scenarios';
import { enableAi } from '../src/sim/ai';
import { hashWorld } from '../src/sim/hash';
import { applyScenario } from '../src/sim/scenario/setup';
import { b64ToBytes, bytesToB64, restoreWorld, snapshotWorld } from '../src/sim/snapshot';
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
