import { describe, expect, it } from 'vitest';
import { loadMap } from '../src/data/map';
import { scenarioById } from '../src/data/scenarios';
import { applyScenario } from '../src/sim/scenario/setup';
import { isSupplied } from '../src/sim/systems/frontline';
import { World } from '../src/sim/world';
import { DATA, run } from './helpers';

describe('1895 supply lines', () => {
  it('soldiers far from depots and carts lose morale; those next to a cart do not', () => {
    const sc = scenarioById('yiwei2');
    const w = new World(DATA, loadMap('taipei'), { seed: 1, factions: sc.factions });
    applyScenario(w, sc);
    const far = w.spawnUnit('jp95_guard', 'faction_japan_1895', 30, 96);
    const cart = [...w.all()].find((e) => e.type === 'jp95_cart')!;
    const near = w.spawnUnit('jp95_guard', 'faction_japan_1895', cart.x + 1, cart.y);
    expect(isSupplied(w, far)).toBe(false);
    expect(isSupplied(w, near)).toBe(true);
    const before = far.morale!;
    run(w, 41);
    expect(far.morale!).toBeLessThan(before);
    expect(near.morale!).toBeGreaterThanOrEqual(before - 0.01);
  });
});
