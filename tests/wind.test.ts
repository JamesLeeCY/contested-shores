import { describe, expect, it } from 'vitest';
import { windSpeedMul, windVector } from '../src/sim/systems/wind';
import { makeWorld } from './helpers';

describe('wind (1683)', () => {
  it('a north wind blows towards the south (map +y)', () => {
    const [x, y] = windVector(0);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(1);
    const [nwx, nwy] = windVector(315);
    expect(nwx).toBeGreaterThan(0);
    expect(nwy).toBeGreaterThan(0);
  });

  it('ships run faster before the wind and slower against it, within the rule limits', () => {
    const w = makeWorld();
    expect(windSpeedMul(w, 0)).toBe(1);
    w.ext.wind = { from: 0, strength: 0.35 };
    expect(windSpeedMul(w, Math.PI / 2)).toBeCloseTo(1.35);
    expect(windSpeedMul(w, -Math.PI / 2)).toBeCloseTo(0.65);
    expect(windSpeedMul(w, 0)).toBeCloseTo(1);
    w.ext.wind = { from: 0, strength: 0.9 };
    expect(windSpeedMul(w, -Math.PI / 2)).toBe(w.rules.wind.minMul);
  });
});
