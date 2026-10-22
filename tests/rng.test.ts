import { describe, expect, it } from 'vitest';
import { Rng } from '../src/sim/rng';

describe('Rng', () => {
  it('is reproducible for a seed', () => {
    const a = new Rng(123);
    const b = new Rng(123);
    const xs = Array.from({ length: 50 }, () => a.next());
    expect(Array.from({ length: 50 }, () => b.next())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it('roughly matches the requested probability', () => {
    const r = new Rng(7);
    let hits = 0;
    for (let i = 0; i < 20000; i++) if (r.chance(0.3)) hits++;
    expect(hits / 20000).toBeGreaterThan(0.28);
    expect(hits / 20000).toBeLessThan(0.32);
  });
});
